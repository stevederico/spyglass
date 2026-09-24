//! MyMemory translation routes: `/api/translate/text`, `/batch`, and `/quota`.

use std::sync::Mutex;

use super::{body_json, err, json_res, obj, str_field};
use crate::config;
use crate::httpc;
use crate::http::{Request, Response};
use crate::json::{self, Json};
use crate::state::AppState;

const MYMEMORY_URL: &str = "https://api.mymemory.translated.net/get";
const MAX_RETRIES: u32 = 3;
const CIRCUIT_BREAKER_THRESHOLD: u32 = 3;
const REQUEST_DELAY_MS: u64 = 1000;

const LOCALES: &[(&str, &str)] = &[
    ("da-DK", "da"),
    ("de-DE", "de"),
    ("el-GR", "el"),
    ("en-AU", "en"),
    ("en-CA", "en"),
    ("en-GB", "en"),
    ("en-US", "en"),
    ("es-ES", "es"),
    ("es-MX", "es"),
    ("fi-FI", "fi"),
    ("fr-CA", "fr"),
    ("fr-FR", "fr"),
    ("id-ID", "id"),
    ("it-IT", "it"),
    ("ja-JP", "ja"),
    ("ko-KR", "ko"),
    ("ms-MY", "ms"),
    ("nl-NL", "nl"),
    ("no-NO", "no"),
    ("pt-BR", "pt"),
    ("pt-PT", "pt"),
    ("ru-RU", "ru"),
    ("sv-SE", "sv"),
    ("th-TH", "th"),
    ("tr-TR", "tr"),
    ("cmn-Hans", "zh-CN"),
    ("cmn-Hant", "zh-TW"),
    ("vi-VI", "vi"),
];

struct Quota {
    chars: u64,
    date: String,
}

static QUOTA: Mutex<Quota> = Mutex::new(Quota {
    chars: 0,
    date: String::new(),
});

/// Translate one string.
pub fn text(state: &AppState, req: &Request) -> Response {
    let body = match body_json(req) {
        Ok(v) => v,
        Err(res) => return res,
    };
    let Some(text) = str_field(&body, "text") else {
        return err(400, "text, source, and target are required");
    };
    let Some(source) = str_field(&body, "source") else {
        return err(400, "text, source, and target are required");
    };
    let Some(target) = str_field(&body, "target") else {
        return err(400, "text, source, and target are required");
    };
    match translate_one(state, text, source, target) {
        Ok(translated) => json_res(200, &obj(vec![("translatedText", json::s(translated))])),
        Err(e) => {
            state.log.error("Translate /text error", &[("error", json::s(&e))]);
            err(500, &e)
        }
    }
}

/// Fan a list of strings out across App Store locales.
pub fn batch(state: &AppState, req: &Request) -> Response {
    let body = match body_json(req) {
        Ok(v) => v,
        Err(res) => return res,
    };
    let texts: Vec<String> = body
        .get("texts")
        .and_then(Json::as_arr)
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    let Some(source) = str_field(&body, "source") else {
        return err(400, "texts (non-empty array) and source are required");
    };
    if texts.is_empty() {
        return err(400, "texts (non-empty array) and source are required");
    }
    let filter: Option<Vec<String>> = body.get("locales").and_then(Json::as_arr).map(|arr| {
        arr.iter()
            .filter_map(|v| v.as_str().map(str::to_string))
            .collect()
    });
    let mut map = std::collections::BTreeMap::new();
    for (locale, lang) in LOCALES {
        if *lang == source && filter.as_ref().is_none_or(|f| f.iter().any(|l| l == locale)) {
            map.insert(
                (*locale).to_string(),
                Json::Arr(texts.iter().cloned().map(json::s).collect()),
            );
        }
    }
    let groups = language_groups(source, filter.as_deref());
    let mut consecutive = 0u32;
    let mut open = false;
    let mut first = true;
    for (lang, locales) in &groups {
        if open {
            for locale in locales {
                map.insert((*locale).clone(), obj(vec![("error", json::s("Skipped — translation service unavailable"))]));
            }
            continue;
        }
        if !first {
            std::thread::sleep(std::time::Duration::from_millis(REQUEST_DELAY_MS));
        }
        first = false;
        match translate_group(state, &texts, source, lang) {
            Ok(lines) => {
                consecutive = 0;
                let value = Json::Arr(lines.into_iter().map(json::s).collect());
                for locale in locales {
                    map.insert(locale.clone(), value.clone());
                }
            }
            Err(message) => {
                consecutive += 1;
                state.log.error(
                    "Translate language failed",
                    &[("error", json::s(&message)), ("lang", json::s(lang))],
                );
                for locale in locales {
                    map.insert(locale.clone(), obj(vec![("error", json::s(&message))]));
                }
                if consecutive >= CIRCUIT_BREAKER_THRESHOLD {
                    open = true;
                }
            }
        }
    }
    json_res(
        200,
        &obj(vec![
            ("translations", Json::Obj(map)),
            ("quota", quota_json()),
        ]),
    )
}

/// Current daily character budget.
pub fn quota() -> Response {
    json_res(200, &quota_json())
}

fn language_groups(source: &str, filter: Option<&[String]>) -> Vec<(String, Vec<String>)> {
    let mut groups: Vec<(String, Vec<String>)> = Vec::new();
    for (locale, lang) in LOCALES {
        if *lang == source {
            continue;
        }
        if let Some(filter) = filter {
            if !filter.iter().any(|l| l == locale) {
                continue;
            }
        }
        if let Some((_, locales)) = groups.iter_mut().find(|(code, _)| code == lang) {
            locales.push((*locale).to_string());
        } else {
            groups.push(((*lang).to_string(), vec![(*locale).to_string()]));
        }
    }
    groups
}

fn translate_group(state: &AppState, texts: &[String], source: &str, target: &str) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    for (i, text) in texts.iter().enumerate() {
        if i > 0 {
            std::thread::sleep(std::time::Duration::from_millis(REQUEST_DELAY_MS));
        }
        out.push(translate_one(state, text, source, target)?);
    }
    Ok(out)
}

fn translate_one(state: &AppState, text: &str, source: &str, target: &str) -> Result<String, String> {
    let email = config::env("MYMEMORY_EMAIL").unwrap_or_default();
    let mut last = String::new();
    for attempt in 0..=MAX_RETRIES {
        let mut url = format!(
            "{MYMEMORY_URL}?q={}&langpair={}",
            httpc::form_encode(text),
            httpc::form_encode(&format!("{source}|{target}"))
        );
        if !email.is_empty() {
            url.push_str("&de=");
            url.push_str(&httpc::form_encode(&email));
        }
        match httpc::get(&url, &[], 15_000) {
            Ok(res) if res.ok() => {
                let data = json::parse(&res.body).map_err(|_| "MyMemory returned invalid JSON".to_string())?;
                if matches!(data.get("quotaFinished"), Some(Json::Bool(true))) {
                    return Err("Daily translation quota reached — try again tomorrow".into());
                }
                let status = data.get("responseStatus").and_then(Json::as_f64).unwrap_or(0.0) as i64;
                if status != 200 {
                    let detail = data
                        .get("responseDetails")
                        .and_then(Json::as_str)
                        .unwrap_or("MyMemory error");
                    return Err(detail.to_string());
                }
                let translated = data
                    .get("responseData")
                    .and_then(|d| d.get("translatedText"))
                    .and_then(Json::as_str)
                    .unwrap_or("")
                    .to_string();
                track(text.len() as u64);
                return Ok(translated);
            }
            Ok(res) if res.status == 429 || res.status >= 500 => {
                last = format!("MyMemory {}: {}", res.status, res.text());
                if attempt == MAX_RETRIES {
                    return Err(last);
                }
                let backoff = 2000u64.saturating_mul(1u64 << attempt);
                state.log.error("Translate retry", &[("error", json::s(&last))]);
                std::thread::sleep(std::time::Duration::from_millis(backoff));
            }
            Ok(res) => return Err(format!("MyMemory {}: {}", res.status, res.text())),
            Err(e) => {
                last = e.to_string();
                if attempt == MAX_RETRIES {
                    return Err(last);
                }
                std::thread::sleep(std::time::Duration::from_millis(2000u64.saturating_mul(1u64 << attempt)));
            }
        }
    }
    Err(last)
}

fn daily_limit() -> u64 {
    if config::env("MYMEMORY_EMAIL").is_some_and(|e| !e.is_empty()) {
        50_000
    } else {
        5_000
    }
}

fn track(chars: u64) {
    let today = super::iso_now();
    let today = today.get(..10).unwrap_or("").to_string();
    let mut quota = QUOTA.lock().unwrap_or_else(|e| e.into_inner());
    if quota.date != today {
        quota.chars = 0;
        quota.date = today;
    }
    quota.chars += chars;
}

fn quota_json() -> Json {
    let today = super::iso_now();
    let today = today.get(..10).unwrap_or("").to_string();
    let mut quota = QUOTA.lock().unwrap_or_else(|e| e.into_inner());
    if quota.date != today {
        quota.chars = 0;
        quota.date = today;
    }
    let limit = daily_limit();
    let remaining = limit.saturating_sub(quota.chars);
    obj(vec![
        ("charsUsed", json::i(quota.chars as i64)),
        ("charsRemaining", json::i(remaining as i64)),
        ("limit", json::i(limit as i64)),
        ("exhausted", Json::Bool(quota.chars >= limit)),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn english_locales_are_not_translated_again() {
        let groups = language_groups("en", None);
        assert!(groups.iter().all(|(lang, _)| lang != "en"));
        assert!(groups.iter().any(|(lang, _)| lang == "de"));
    }

    #[test]
    fn filter_keeps_only_requested_locales() {
        let groups = language_groups("en", Some(&["de-DE".into(), "fr-FR".into()]));
        let locales: Vec<_> = groups.iter().flat_map(|(_, ls)| ls.clone()).collect();
        assert_eq!(locales, vec!["de-DE".to_string(), "fr-FR".to_string()]);
    }
}
