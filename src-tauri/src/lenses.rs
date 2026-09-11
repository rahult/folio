//! Lenses run a document through a model the user brings: one
//! OpenAI-compatible endpoint (base URL, model, optional key). The key
//! lives in the OS keychain and the request is made from here, so nothing
//! secret enters the webview. Custom lenses are Markdown files under
//! `~/Documents/Folio/lenses/`.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

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
struct ChatBody<'a> {
    model: &'a str,
    messages: Vec<ChatMessage<'a>>,
    temperature: f32,
    max_tokens: u32,
}

/// The request body for `POST /chat/completions`, pure so it is testable.
pub fn chat_body<'a>(model: &'a str, system: &'a str, user: &'a str, max_tokens: u32) -> ChatBody<'a> {
    ChatBody {
        model,
        messages: vec![
            ChatMessage { role: "system", content: system },
            ChatMessage { role: "user", content: user },
        ],
        temperature: 0.3,
        max_tokens,
    }
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
    let mut request = client
        .post(completions_url(&base_url))
        .json(&chat_body(&model, &system, &user, max_tokens));
    if let Some(key) = llm_key() {
        request = request.bearer_auth(key);
    }
    let response = request.send().await.map_err(|e| format!("request failed: {e}"))?;
    let status = response.status();
    let body = response.text().await.map_err(|e| e.to_string())?;
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

#[derive(Serialize)]
pub struct LensFile {
    name: String,
    text: String,
}

fn lenses_dir() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    Some(PathBuf::from(home).join("Documents").join("Folio").join("lenses"))
}

/// The user's own lenses: every `.md` under ~/Documents/Folio/lenses.
#[tauri::command]
pub fn list_custom_lenses() -> Vec<LensFile> {
    let Some(dir) = lenses_dir() else { return Vec::new() };
    let Ok(entries) = std::fs::read_dir(&dir) else { return Vec::new() };
    let mut out: Vec<LensFile> = entries
        .flatten()
        .filter_map(|e| {
            let path = e.path();
            if path.extension().and_then(|x| x.to_str()) != Some("md") {
                return None;
            }
            let text = std::fs::read_to_string(&path).ok()?;
            Some(LensFile { name: path.file_stem()?.to_string_lossy().to_string(), text })
        })
        .collect();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

/// Where custom lenses live, creating the folder so the user can find it.
#[tauri::command]
pub fn lenses_folder() -> Result<String, String> {
    let dir = lenses_dir().ok_or("no home directory")?;
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
        let body = serde_json::to_value(chat_body("m", "sys", "hello", 800)).unwrap();
        assert_eq!(body["model"], "m");
        assert_eq!(body["messages"][0]["role"], "system");
        assert_eq!(body["messages"][1]["content"], "hello");
        assert_eq!(body["max_tokens"], 800);
    }
}
