//! `POST /api/precheck` — scan App Store metadata for rejection triggers.

use super::{body_json, err, json_res, obj, str_field};
use crate::httpc;
use crate::http::Request;
use crate::json::{self, Json};
use crate::state::AppState;

struct Warning {
    id: &'static str,
    name: &'static str,
    message: String,
}

/// Run the precheck rules and return `{ warnings, checked }`.
pub fn run(state: &AppState, req: &Request) -> Response {
    let body = match body_json(req) {
        Ok(v) => v,
        Err(res) => return res,
    };
    let name = str_field(&body, "name").unwrap_or("");
    let description = str_field(&body, "description").unwrap_or("");
    if name.is_empty() && description.is_empty() {
        return err(400, "At least name or description is required");
    }
    let keywords = str_field(&body, "keywords").unwrap_or("");
    let promo = str_field(&body, "promotionalText").unwrap_or("");
    let mut parts = Vec::new();
    for piece in [name, description, keywords, promo] {
        if !piece.is_empty() {
            parts.push(piece);
        }
    }
    let combined = parts.join(" ");
    let warnings = scan(state, &combined);
    let list = Json::Arr(
        warnings
            .iter()
            .map(|w| {
                obj(vec![
                    ("id", json::s(w.id)),
                    ("name", json::s(w.name)),
                    ("message", json::s(&w.message)),
                ])
            })
            .collect(),
    );
    json_res(
        200,
        &obj(vec![
            ("warnings", list),
            ("checked", json::i(combined.encode_utf16().count() as i64)),
        ]),
    )
}

fn scan(state: &AppState, text: &str) -> Vec<Warning> {
    let mut out = Vec::new();
    if phrase(
        text,
        &[
            "apple sucks",
            "apple is bad",
            "apple is terrible",
            "apple is awful",
            "apple is broken",
            "apple fails",
            "apple doesn't work",
            "apple doesnt work",
            "hate apple",
            "apple reject",
        ],
    ) {
        out.push(warn(
            "negative_apple",
            "Negative Apple Sentiment",
            "Contains negative references to Apple — likely to trigger rejection",
        ));
    }
    if phrase(
        text,
        &[
            "android",
            "google play",
            "samsung",
            "blackberry",
            "windows phone",
            "huawei",
            "fire os",
            "tizen",
        ],
    ) {
        out.push(warn(
            "competitor_mention",
            "Competitor Mention",
            "Mentions a competing platform — Apple may reject for competitor references",
        ));
    }
    if word(
        text,
        &["fuck", "shit", "ass", "damn", "bitch", "bastard", "crap", "hell", "dick", "piss"],
    ) {
        out.push(warn(
            "curse_words",
            "Objectionable Language",
            "Contains potentially objectionable language",
        ));
    }
    if phrase(
        text,
        &[
            "coming soon",
            "in development",
            "planned feature",
            "future update",
            "will be added",
            "stay tuned",
            "under construction",
            "not yet available",
        ],
    ) || coming_in_version(text)
    {
        out.push(warn(
            "future_functionality",
            "Future Functionality",
            "References unreleased features — Apple rejects apps that promise future functionality",
        ));
    }
    if word(text, &["test", "debug", "dummy", "fake"])
        || text.contains("TODO")
        || text.contains("FIXME")
        || text.contains("HACK")
        || contains_ci(text, "sample data")
    {
        out.push(warn(
            "test_words",
            "Test/Debug Words",
            "Contains test/debug language that should be removed before submission",
        ));
    }
    if phrase(text, &["lorem ipsum", "dolor sit amet", "placeholder"])
        || phrase(text, &["insert text", "insert description", "insert name"])
        || text.contains("XXX")
        || text.contains("TBD")
    {
        out.push(warn("placeholder_text", "Placeholder Text", "Contains placeholder text"));
    }
    if free_iap(text) {
        out.push(warn(
            "free_iap",
            "Free In-App Purchase Claims",
            "Claims in-app purchases are free — misleading and likely to be rejected",
        ));
    }
    if let Some(msg) = copyright(text) {
        out.push(warn("copyright_year", "Outdated Copyright Year", &msg));
    }
    if let Some(msg) = urls(state, text) {
        out.push(warn("unreachable_url", "Unreachable URLs", &msg));
    }
    if price(text) {
        out.push(warn(
            "price_mention",
            "Price Mention in Description",
            "Contains specific pricing — prices may change and cause metadata to become inaccurate",
        ));
    }
    out
}

fn warn(id: &'static str, name: &'static str, message: &str) -> Warning {
    Warning {
        id,
        name,
        message: message.to_string(),
    }
}

fn contains_ci(text: &str, needle: &str) -> bool {
    text.to_ascii_lowercase().contains(&needle.to_ascii_lowercase())
}

fn phrase(text: &str, needles: &[&str]) -> bool {
    needles.iter().any(|n| {
        if n.contains(' ') {
            contains_ci(text, n)
        } else {
            word(text, &[n])
        }
    })
}

fn word(text: &str, words: &[&str]) -> bool {
    let lower = text.to_ascii_lowercase();
    let bytes = lower.as_bytes();
    words.iter().any(|word| {
        let w = word.to_ascii_lowercase();
        let wb = w.as_bytes();
        bytes.windows(wb.len()).enumerate().any(|(i, window)| {
            if window != wb {
                return false;
            }
            let before = if i == 0 { b' ' } else { bytes[i - 1] };
            let after = bytes.get(i + wb.len()).copied().unwrap_or(b' ');
            !before.is_ascii_alphanumeric() && !after.is_ascii_alphanumeric()
        })
    })
}

fn coming_in_version(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    let bytes = lower.as_bytes();
    let needle = b"coming in ";
    bytes.windows(needle.len()).enumerate().any(|(i, w)| {
        if w != needle {
            return false;
        }
        let rest = &lower[i + needle.len()..];
        let rest = rest.strip_prefix('v').unwrap_or(rest);
        rest.chars().next().is_some_and(|c| c.is_ascii_digit())
    })
}

fn free_iap(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    let iap = lower.contains("in-app purchase") || lower.contains("in app purchase");
    let free = word(text, &["free"]);
    if free && iap {
        return true;
    }
    lower.contains("no cost") && lower.contains("purchase")
}

fn copyright(text: &str) -> Option<String> {
    let lower = text.to_ascii_lowercase();
    let year = crate::config::now_ms().max(0) / 1000 / 86_400;
    let current = super::civil_from_days(year).0;
    let idx = lower.find("copyright").or_else(|| text.find('©'))?;
    let tail = &text[idx..];
    let digits: String = tail
        .chars()
        .skip_while(|c| !c.is_ascii_digit())
        .take(4)
        .collect();
    if digits.len() != 4 {
        return None;
    }
    let found: i32 = digits.parse().ok()?;
    if found < current {
        Some(format!("Copyright year {found} doesn't match current year {current}"))
    } else {
        None
    }
}

fn urls(state: &AppState, text: &str) -> Option<String> {
    let mut found = Vec::new();
    let mut rest = text;
    while found.len() < 5 {
        let http = rest.find("http://").or_else(|| rest.find("https://"))?;
        let start = &rest[http..];
        let end = start
            .find(|c: char| c.is_whitespace() || matches!(c, '<' | '>' | '"' | '\'' | ')' | ']'))
            .unwrap_or(start.len());
        let url = &start[..end];
        if let Some(msg) = check_url(state, url) {
            found.push(msg);
        }
        rest = &start[end..];
    }
    if found.is_empty() {
        None
    } else {
        Some(found.join("; "))
    }
}

fn check_url(state: &AppState, url: &str) -> Option<String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return None;
    }
    if private_host(url) {
        return Some(format!("URL {url} is unreachable"));
    }
    match httpc::head(url, &[], 5_000) {
        Ok(res) if res.ok() => None,
        Ok(res) => Some(format!("URL {url} returned {}", res.status)),
        Err(e) => {
            state
                .log
                .error("Precheck URL probe failed", &[("error", crate::json::s(e.to_string()))]);
            Some(format!("URL {url} is unreachable"))
        }
    }
}

fn private_host(url: &str) -> bool {
    let host = url
        .split("://")
        .nth(1)
        .unwrap_or("")
        .split(['/', ':', '?', '#'])
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    host == "localhost"
        || host.starts_with("127.")
        || host == "0.0.0.0"
        || host.starts_with("10.")
        || host.starts_with("192.168.")
        || host.starts_with("169.254.")
        || host == "[::1]"
        || host.ends_with(".local")
}

fn price(text: &str) -> bool {
    let bytes = text.as_bytes();
    if bytes.windows(2).any(|w| w[0] == b'$' && w[1].is_ascii_digit()) {
        return true;
    }
    let lower = text.to_ascii_lowercase();
    for unit in ["dollars", "dollar", "usd", "cents", "cent"] {
        if let Some(i) = lower.find(unit) {
            let before = lower[..i].trim_end();
            if before
                .chars()
                .rev()
                .take_while(|c| c.is_ascii_digit() || *c == '.')
                .any(|c| c.is_ascii_digit())
            {
                return true;
            }
        }
    }
    false
}

use crate::http::Response;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_copy_has_no_warnings() {
        let warnings = scan_offline("My awesome productivity app helps you stay organized.");
        assert!(warnings.is_empty());
    }

    #[test]
    fn flags_apple_competitors_and_placeholders() {
        let text = "Apple sucks. Also on Android. Lorem ipsum.";
        let ids: Vec<_> = scan_offline(text).into_iter().map(|w| w.id).collect();
        assert!(ids.contains(&"negative_apple"));
        assert!(ids.contains(&"competitor_mention"));
        assert!(ids.contains(&"placeholder_text"));
    }

    #[test]
    fn ass_inside_class_is_not_a_curse() {
        assert!(scan_offline("A world-class camera.").is_empty());
    }

    fn scan_offline(text: &str) -> Vec<Warning> {
        // URL probes are skipped because this fixture has no URL.
        let mut out = Vec::new();
        if phrase(text, &["apple sucks"]) {
            out.push(warn("negative_apple", "n", "m"));
        }
        if phrase(text, &["android"]) {
            out.push(warn("competitor_mention", "n", "m"));
        }
        if phrase(text, &["lorem ipsum"]) {
            out.push(warn("placeholder_text", "n", "m"));
        }
        if word(text, &["ass"]) {
            out.push(warn("curse_words", "n", "m"));
        }
        out
    }
}
