//! xAI Grok routes for App Store metadata and screenshot backgrounds.

use super::{body_json, err, json_res, obj, str_field};
use crate::config;
use crate::httpc;
use crate::http::{Request, Response};
use crate::json::{self, Json};
use crate::state::AppState;

const GROK_URL: &str = "https://api.x.ai/v1/chat/completions";
const GROK_MODEL: &str = "grok-4.20-beta-latest-non-reasoning";
const GROK_IMAGE_URL: &str = "https://api.x.ai/v1/images/generations";
const GROK_IMAGE_MODEL: &str = "grok-imagine-image";
const KEY_MSG: &str = "AI features require an API key. Add XAI_API_KEY to your environment.";

const METADATA: &str = "You are an expert App Store Optimization (ASO) specialist. Generate compelling, keyword-rich App Store metadata that maximizes discoverability and conversion. Follow Apple's guidelines strictly:\n- App Name: max 30 characters\n- Subtitle: max 30 characters\n- Description: max 4000 characters, front-load key features in first 3 lines\n- Keywords: max 100 characters, comma-separated, no spaces after commas, no duplicates of words in app name\n- What's New: max 4000 characters, use bullet points\n\nRespond ONLY with valid JSON matching the requested format. No markdown, no code fences.";
const KEYWORDS: &str = "You are an ASO keyword optimization expert. Generate comma-separated keywords for the Apple App Store. Rules:\n- Max 100 characters total\n- No spaces after commas\n- Don't repeat words already in the app name\n- Mix head terms (high volume) with long-tail terms (low competition)\n- Include misspellings and synonyms that users actually search\n- No trademarked terms\n\nRespond with ONLY the comma-separated keyword string. Nothing else.";
const WHATS_NEW: &str = "You are a mobile app copywriter. Write release notes for the App Store that are concise, user-friendly, and use bullet points. Keep it under 200 words. Focus on user benefits, not technical details.\n\nRespond with ONLY the release notes text. No JSON, no code fences.";
const IMPROVE: &str = "You are an expert App Store copywriter. Improve the given text to be more compelling, clear, and optimized for the App Store. Maintain the same approximate length. Focus on user benefits and emotional hooks.\n\nRespond with ONLY the improved text. No JSON, no code fences.";
const SUGGEST: &str = "You are an ASO keyword research expert. Analyze the app and suggest ranked keyword opportunities with estimated search volume. Rules:\n- Suggest 10-15 keywords or short phrases\n- Rank by relevance and search volume\n- Label each as \"high\", \"med\", or \"low\" volume\n- Don't repeat words already in the app name\n- Include a mix of head terms and long-tail phrases\n- No trademarked terms\n- Consider the target locale for language-appropriate suggestions\n\nRespond ONLY with valid JSON: { \"suggestions\": [{ \"keyword\": \"...\", \"volume\": \"high|med|low\" }, ...] }. No markdown, no code fences.";

/// Generate the full metadata set.
pub fn generate_metadata(state: &AppState, req: &Request) -> Response {
    let body = match body_json(req) {
        Ok(v) => v,
        Err(res) => return res,
    };
    let Some(app_name) = str_field(&body, "appName") else {
        return err(400, "appName is required");
    };
    let prompt = format!(
        "Generate complete App Store metadata for:\nApp Name: {app_name}\nCategory: {}\nKey Features: {}\nTarget Audience: {}\nTone: {}\n\nRespond with JSON: {{ \"name\": \"...\", \"subtitle\": \"...\", \"description\": \"...\", \"keywords\": \"...\", \"whatsNew\": \"...\" }}",
        str_field(&body, "appCategory").unwrap_or("General"),
        str_field(&body, "keyFeatures").unwrap_or("N/A"),
        str_field(&body, "targetAudience").unwrap_or("General"),
        str_field(&body, "tone").unwrap_or("Professional"),
    );
    json_or_text(state, "AI generate-metadata error", METADATA, &prompt, true)
}

/// Generate a description only.
pub fn generate_description(state: &AppState, req: &Request) -> Response {
    let body = match body_json(req) {
        Ok(v) => v,
        Err(res) => return res,
    };
    let Some(app_name) = str_field(&body, "appName") else {
        return err(400, "appName is required");
    };
    let context = str_field(&body, "context").unwrap_or(app_name);
    let prompt = format!("Write a compelling App Store description for \"{app_name}\". Context: {context}. Max 4000 characters. Front-load the most important features in the first 3 lines.");
    match call_grok(state, METADATA, &prompt) {
        Ok(description) => json_res(200, &obj(vec![("description", json::s(description))])),
        Err(e) => ai_err(state, "AI generate-description error", e),
    }
}

/// Generate a keyword string.
pub fn generate_keywords(state: &AppState, req: &Request) -> Response {
    let body = match body_json(req) {
        Ok(v) => v,
        Err(res) => return res,
    };
    let Some(app_name) = str_field(&body, "appName") else {
        return err(400, "appName is required");
    };
    let mut prompt = format!("Generate optimized App Store keywords for \"{app_name}\".");
    if let Some(description) = str_field(&body, "description") {
        prompt.push_str(&format!(" App description: {description}"));
    }
    if let Some(current) = str_field(&body, "currentKeywords") {
        prompt.push_str(&format!(" Current keywords: {current}"));
    }
    match call_grok(state, KEYWORDS, &prompt) {
        Ok(keywords) => json_res(200, &obj(vec![("keywords", json::s(keywords))])),
        Err(e) => ai_err(state, "AI generate-keywords error", e),
    }
}

/// Generate What's New copy.
pub fn generate_whats_new(state: &AppState, req: &Request) -> Response {
    let body = match body_json(req) {
        Ok(v) => v,
        Err(res) => return res,
    };
    let Some(app_name) = str_field(&body, "appName") else {
        return err(400, "appName and changes are required");
    };
    let Some(changes) = str_field(&body, "changes") else {
        return err(400, "appName and changes are required");
    };
    let prompt = format!("Write App Store release notes for \"{app_name}\". Changes in this version: {changes}");
    match call_grok(state, WHATS_NEW, &prompt) {
        Ok(whats_new) => json_res(200, &obj(vec![("whatsNew", json::s(whats_new))])),
        Err(e) => ai_err(state, "AI generate-whats-new error", e),
    }
}

/// Rewrite one field.
pub fn improve_text(state: &AppState, req: &Request) -> Response {
    let body = match body_json(req) {
        Ok(v) => v,
        Err(res) => return res,
    };
    let Some(text) = str_field(&body, "text") else {
        return err(400, "text is required");
    };
    let field = str_field(&body, "field").unwrap_or("text");
    let mut prompt = format!("Improve this App Store {field}:\n\n{text}");
    if let Some(instruction) = str_field(&body, "instruction") {
        prompt.push_str(&format!("\n\nAdditional instruction: {instruction}"));
    }
    match call_grok(state, IMPROVE, &prompt) {
        Ok(improved) => json_res(200, &obj(vec![("improved", json::s(improved))])),
        Err(e) => ai_err(state, "AI improve-text error", e),
    }
}

/// Ranked keyword suggestions.
pub fn suggest_keywords(state: &AppState, req: &Request) -> Response {
    let body = match body_json(req) {
        Ok(v) => v,
        Err(res) => return res,
    };
    let Some(app_name) = str_field(&body, "appName") else {
        return err(400, "appName is required");
    };
    let mut prompt = format!("Suggest keyword opportunities for the app \"{app_name}\".");
    if let Some(description) = str_field(&body, "description") {
        prompt.push_str(&format!(" Description: {description}"));
    }
    if let Some(locale) = str_field(&body, "locale") {
        prompt.push_str(&format!(" Target locale: {locale}"));
    }
    if let Some(current) = str_field(&body, "currentKeywords") {
        prompt.push_str(&format!(" Current keywords (avoid duplicates): {current}"));
    }
    json_or_text(state, "AI suggest-keywords error", SUGGEST, &prompt, true)
}

/// Generate a screenshot background and return a data URI.
pub fn generate_background(state: &AppState, req: &Request) -> Response {
    let body = match body_json(req) {
        Ok(v) => v,
        Err(res) => return res,
    };
    let Some(prompt) = str_field(&body, "prompt") else {
        return err(400, "prompt is required");
    };
    let Some(api_key) = config::env_nonempty("XAI_API_KEY") else {
        return err(503, KEY_MSG);
    };
    let full = format!("Create a clean, modern background image suitable for an App Store screenshot. The image should be visually appealing but not too busy, as text and a device mockup will be overlaid on top. {prompt}");
    let payload = obj(vec![
        ("model", json::s(GROK_IMAGE_MODEL)),
        ("prompt", json::s(full)),
        ("n", json::i(1)),
        ("aspect_ratio", json::s("9:16")),
        ("response_format", json::s("b64_json")),
    ]);
    let raw = json::stringify(&payload);
    match httpc::post_json(
        GROK_IMAGE_URL,
        &[("Authorization", &format!("Bearer {api_key}"))],
        &raw,
        30_000,
    ) {
        Ok(res) if res.status == 429 => err(429, "Rate limited by x.ai API. Please wait and try again."),
        Ok(res) if !res.ok() => {
            state.log.error(
                "xAI image API error",
                &[("status", json::i(i64::from(res.status)))],
            );
            err(if res.status >= 500 { 502 } else { 400 }, &format!("x.ai image API error {}", res.status))
        }
        Ok(res) => {
            let data = json::parse(&res.body).unwrap_or(Json::Null);
            let b64 = data
                .get("data")
                .and_then(Json::as_arr)
                .and_then(|a| a.first())
                .and_then(|row| row.get("b64_json"))
                .and_then(Json::as_str);
            match b64 {
                Some(b64) => json_res(200, &obj(vec![("image", json::s(format!("data:image/png;base64,{b64}")))])),
                None => err(502, "Empty image response from x.ai API"),
            }
        }
        Err(e) => {
            state.log.error("AI generate-background error", &[("error", json::s(e.to_string()))]);
            err(500, "Image generation failed. Try again.")
        }
    }
}

fn json_or_text(state: &AppState, log: &str, system: &str, prompt: &str, as_json: bool) -> Response {
    match call_grok(state, system, prompt) {
        Ok(raw) if as_json => match json::parse(raw.as_bytes()) {
            Ok(v) => json_res(200, &v),
            Err(_) => err(500, "Failed to parse AI response as JSON"),
        },
        Ok(raw) => json_res(200, &obj(vec![("text", json::s(raw))])),
        Err(e) => ai_err(state, log, e),
    }
}

fn ai_err(state: &AppState, log: &str, message: String) -> Response {
    state.log.error(log, &[("error", json::s(&message))]);
    let status = if message.contains("API key") { 503 } else { 500 };
    let public = if message.contains("API key") {
        KEY_MSG.to_string()
    } else if message.contains("Rate limited") {
        message
    } else {
        "AI request failed. Try again.".into()
    };
    err(status, &public)
}

fn call_grok(state: &AppState, system: &str, user: &str) -> Result<String, String> {
    let Some(api_key) = config::env_nonempty("XAI_API_KEY") else {
        return Err(KEY_MSG.into());
    };
    let messages = Json::Arr(vec![
        obj(vec![("role", json::s("system")), ("content", json::s(system))]),
        obj(vec![("role", json::s("user")), ("content", json::s(user))]),
    ]);
    let payload = obj(vec![
        ("model", json::s(GROK_MODEL)),
        ("stream", Json::Bool(false)),
        ("messages", messages),
    ]);
    let body = json::stringify(&payload);
    let res = httpc::post_json(
        GROK_URL,
        &[("Authorization", &format!("Bearer {api_key}"))],
        &body,
        15_000,
    )
    .map_err(|e| {
        state.log.error("x.ai transport error", &[("error", json::s(e.to_string()))]);
        "AI request failed. Try again.".to_string()
    })?;
    if res.status == 429 {
        return Err("Rate limited by x.ai API. Please wait and try again.".into());
    }
    if !res.ok() {
        state.log.error("x.ai API error", &[("status", json::i(i64::from(res.status)))]);
        return Err(format!("x.ai API error {}", res.status));
    }
    let data = json::parse(&res.body).map_err(|_| "Empty response from x.ai API".to_string())?;
    let content = data
        .get("choices")
        .and_then(Json::as_arr)
        .and_then(|a| a.first())
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(Json::as_str)
        .ok_or_else(|| "Empty response from x.ai API".to_string())?;
    Ok(strip_fences(content))
}

fn strip_fences(text: &str) -> String {
    let trimmed = text.trim();
    let Some(rest) = trimmed.strip_prefix("```") else {
        return trimmed.to_string();
    };
    let rest = rest.trim_start_matches(|c: char| c.is_ascii_alphanumeric());
    let rest = rest.trim_start_matches(['\r', '\n']);
    let rest = rest.strip_suffix("```").unwrap_or(rest);
    rest.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fences_are_stripped() {
        assert_eq!(strip_fences("```json\n{\"a\":1}\n```"), "{\"a\":1}");
        assert_eq!(strip_fences("plain"), "plain");
    }
}
