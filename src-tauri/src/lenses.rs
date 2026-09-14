//! Lenses run a document through a model the user brings: one
//! OpenAI-compatible endpoint (base URL, model, optional key). The key
//! lives in the OS keychain and the request is made from here, so nothing
//! secret enters the webview. Custom lenses are Markdown files under
//! `~/Documents/Folio/lenses/`.

use serde::{Deserialize, Serialize};

const KEYRING_SERVICE: &str = "com.rahult.folio";
const KEYRING_USER: &str = "llm-endpoint";

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_llm_key(key: String) -> Result<(), String> {
    let entry = entry()?;
    if key.trim().is_empty() {
        return match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        };
    }
    entry.set_password(key.trim()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn has_llm_key() -> bool {
    entry().and_then(|e| e.get_password().map_err(|e| e.to_string())).is_ok()
}

fn llm_key() -> Option<String> {
    entry().ok()?.get_password().ok()
}

#[derive(Serialize)]
struct ChatMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Serialize)]
pub struct ChatBody<'a> {
    model: &'a str,
    messages: Vec<ChatMessage<'a>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_completion_tokens: Option<u32>,
}

/// Which optional fields a request carries. Endpoints disagree: OpenAI's
/// newer models reject `max_tokens` (wanting `max_completion_tokens`) and
/// any `temperature` but the default, while Ollama and older servers know
/// only `max_tokens`. The first request uses the classic shape; a 400 that
/// names the offending parameter moves to the next one (`adjust_for_error`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BodyShape {
    /// Send the limit as `max_completion_tokens` instead of `max_tokens`.
    pub completion_tokens_field: bool,
    /// Send `temperature: 0.3` at all.
    pub temperature: bool,
}

impl Default for BodyShape {
    fn default() -> Self {
        Self { completion_tokens_field: false, temperature: true }
    }
}

/// The request body for `POST /chat/completions`, pure so it is testable.
pub fn chat_body<'a>(
    model: &'a str,
    system: &'a str,
    user: &'a str,
    max_tokens: u32,
    shape: BodyShape,
) -> ChatBody<'a> {
    ChatBody {
        model,
        messages: vec![
            ChatMessage { role: "system", content: system },
            ChatMessage { role: "user", content: user },
        ],
        temperature: shape.temperature.then_some(0.3),
        max_tokens: (!shape.completion_tokens_field).then_some(max_tokens),
        max_completion_tokens: shape.completion_tokens_field.then_some(max_tokens),
    }
}

/// The shape to retry with after a 400 whose body names an unsupported
/// parameter, or None when the error is about something else. A body that
/// names `max_tokens` (OpenAI's wording also mentions the replacement)
/// moves to `max_completion_tokens`; one that names `max_completion_tokens`
/// while that is in use moves back; one that names `temperature` drops it.
pub fn adjust_for_error(shape: BodyShape, body: &str) -> Option<BodyShape> {
    let lower = body.to_ascii_lowercase();
    if shape.completion_tokens_field && lower.contains("max_completion_tokens") {
        return Some(BodyShape { completion_tokens_field: false, ..shape });
    }
    if !shape.completion_tokens_field && lower.contains("max_tokens") {
        return Some(BodyShape { completion_tokens_field: true, ..shape });
    }
    if shape.temperature && lower.contains("temperature") {
        return Some(BodyShape { temperature: false, ..shape });
    }
    None
}

/// `base_url` may or may not end with `/v1` or a slash; the completions
/// path is appended once.
pub fn completions_url(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.ends_with("/chat/completions") {
        trimmed.to_string()
    } else {
        format!("{trimmed}/chat/completions")
    }
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
    #[serde(default)]
    usage: Option<Usage>,
    #[serde(default)]
    model: Option<String>,
}

#[derive(Deserialize)]
struct Choice {
    message: MessageOut,
}

#[derive(Deserialize)]
struct MessageOut {
    content: Option<String>,
}

#[derive(Deserialize, Serialize, Default, Clone)]
pub struct Usage {
    #[serde(default)]
    prompt_tokens: u32,
    #[serde(default)]
    completion_tokens: u32,
}

#[derive(Serialize)]
pub struct LensResult {
    text: String,
    model: String,
    usage: Usage,
}

/// Run one chat completion against the configured endpoint.
#[tauri::command]
pub async fn run_lens(
    base_url: String,
    model: String,
    system: String,
    user: String,
    max_tokens: u32,
) -> Result<LensResult, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(240))
        .build()
        .map_err(|e| e.to_string())?;
    let key = llm_key();
    let url = completions_url(&base_url);
    let mut shape = BodyShape::default();
    let mut tried = vec![shape];
    // Up to three shapes: classic, then whatever the server's 400 asks for,
    // never the same shape twice.
    let (status, body) = loop {
        let mut request = client
            .post(&url)
            .json(&chat_body(&model, &system, &user, max_tokens, shape));
        if let Some(key) = &key {
            request = request.bearer_auth(key);
        }
        let response = request.send().await.map_err(|e| format!("request failed: {e}"))?;
        let status = response.status();
        let body = response.text().await.map_err(|e| e.to_string())?;
        if status == reqwest::StatusCode::BAD_REQUEST {
            if let Some(next) = adjust_for_error(shape, &body) {
                if !tried.contains(&next) && tried.len() < 3 {
                    tried.push(next);
                    shape = next;
                    continue;
                }
            }
        }
        break (status, body);
    };
    if !status.is_success() {
        let detail: String = body.chars().take(300).collect();
        return Err(format!("{status}: {detail}"));
    }
    let parsed: ChatResponse =
        serde_json::from_str(&body).map_err(|e| format!("unexpected response: {e}"))?;
    let text = parsed
        .choices
        .into_iter()
        .next()
        .and_then(|c| c.message.content)
        .unwrap_or_default();
    Ok(LensResult {
        text,
        model: parsed.model.unwrap_or(model),
        usage: parsed.usage.unwrap_or_default(),
    })
}

/// The lenses folder inside the configured Home folder.
fn lenses_dir() -> Result<std::path::PathBuf, String> {
    let home = folio_core::settings::load().home().ok_or("no documents folder on this machine")?;
    Ok(folio_core::lenses::dir_for(&home))
}

/// The user's own lenses: every `.md` under the Home folder's `lenses`.
#[tauri::command]
pub fn list_custom_lenses() -> Vec<folio_core::lenses::LensFile> {
    lenses_dir().map(|d| folio_core::lenses::list_custom_in(&d)).unwrap_or_default()
}

/// Where custom lenses live, creating the folder so the user can find it.
#[tauri::command]
pub fn lenses_folder() -> Result<String, String> {
    let dir = lenses_dir()?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn completions_url_appends_the_path_once() {
        assert_eq!(completions_url("http://localhost:11434/v1"), "http://localhost:11434/v1/chat/completions");
        assert_eq!(completions_url("https://api.openai.com/v1/"), "https://api.openai.com/v1/chat/completions");
        assert_eq!(
            completions_url("https://x.example/v1/chat/completions"),
            "https://x.example/v1/chat/completions"
        );
    }

    #[test]
    fn chat_body_serializes_system_then_user() {
        let body = serde_json::to_value(chat_body("m", "sys", "hello", 800, BodyShape::default())).unwrap();
        assert_eq!(body["model"], "m");
        assert_eq!(body["messages"][0]["role"], "system");
        assert_eq!(body["messages"][1]["content"], "hello");
        assert_eq!(body["max_tokens"], 800);
    }

    #[test]
    fn the_classic_shape_sends_max_tokens_and_temperature_only() {
        let body = serde_json::to_value(chat_body("m", "s", "u", 800, BodyShape::default())).unwrap();
        assert_eq!(body["max_tokens"], 800);
        assert!(body.get("max_completion_tokens").is_none());
        assert!((body["temperature"].as_f64().unwrap() - 0.3).abs() < 1e-6);
    }

    #[test]
    fn the_adjusted_shape_sends_max_completion_tokens_and_can_drop_temperature() {
        let shape = BodyShape { completion_tokens_field: true, temperature: false };
        let body = serde_json::to_value(chat_body("m", "s", "u", 800, shape)).unwrap();
        assert_eq!(body["max_completion_tokens"], 800);
        assert!(body.get("max_tokens").is_none());
        assert!(body.get("temperature").is_none());
    }

    #[test]
    fn a_400_naming_the_parameter_picks_the_next_shape() {
        let openai = r#"{"error":{"message":"Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.","param":"max_tokens","code":"unsupported_parameter"}}"#;
        let first = adjust_for_error(BodyShape::default(), openai).unwrap();
        assert_eq!(first, BodyShape { completion_tokens_field: true, temperature: true });
        let temp = r#"{"error":{"message":"Unsupported value: 'temperature' does not support 0.3 with this model.","param":"temperature"}}"#;
        let second = adjust_for_error(first, temp).unwrap();
        assert_eq!(second, BodyShape { completion_tokens_field: true, temperature: false });
        // An older server that does not know the new field goes back.
        let older = r#"{"error":"unknown field max_completion_tokens"}"#;
        assert_eq!(adjust_for_error(first, older), Some(BodyShape::default()));
        // Anything else is not ours to fix.
        assert_eq!(adjust_for_error(BodyShape::default(), r#"{"error":"model not found"}"#), None);
        assert_eq!(adjust_for_error(second, temp), None);
    }
}
