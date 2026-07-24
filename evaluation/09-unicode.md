# Unicode and International Text

## Emoji

Writing tools should handle emoji gracefully: 📝 ✨ 🚀 ✅ ❌ ⚠️

Emoji in a **bold 🎯 statement** and a [link with emoji 🔗](https://example.com).

Emoji sequences: family 👨‍👩‍👧‍👦, flag 🇯🇵, skin tone 👍🏽, keycap 1️⃣

## CJK text

日本語のテキスト:レンダリングとワードラップを確認するための段落です。マークダウンエディタは日本語を正しく表示する必要があります。

中文文本:这是一段用于测试渲染引擎处理中文能力的文字。中英文混排时 spacing 应当自然。

한국어 텍스트: 한글이 포함된 문단도 올바르게 렌더링되어야 합니다.

## Right-to-left scripts

العربية: هذا نص تجريبي لاختبار عرض النصوص من اليمين إلى اليسار.

עברית: זהו טקסט בדיקה לתצוגת טקסט מימין לשמאל.

Mixed direction: the word العربية appears inside an English sentence.

## Accents and combining characters

Café, naïve, Zürich, Smörgåsbord, Łódź, Œuvre

Combining marks: e + U+0301 = é (decomposed form)

## Math-like and symbols

∀x ∈ ℝ: x² ≥ 0 — ∑ ∏ ∫ ∞ ≈ ≠ ≤ ≥ ± × ÷ √ π

Superscripts via Unicode: E = mc², xⁿ + yⁿ = zⁿ

## Full-width and special spaces

Full-width punctuation:。「」、【】

Non-breaking space: between these words.

Zero-width space: between​these​words (invisible).

## Long unbroken string

supercalifragilisticexpialidocioussupercalifragilisticexpialidocioussupercalifragilisticexpialidocioussupercalifragilisticexpialidocious — does the layout wrap it gracefully?
