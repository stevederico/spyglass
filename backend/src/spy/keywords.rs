//! `GET /api/keywords/search` — iTunes Search proxy with a per-user cap.

use std::sync::Mutex;

use super::{err, json_res, obj};
use crate::httpc;
use crate::http::Request;
use crate::http::Response;
use crate::json::{self, Json};
use crate::state::AppState;

const MAX_SEARCHES: u32 = 10;
const RATE_WINDOW_MS: i64 = 15 * 60 * 1000;
const MAX_ENTRIES: usize = 1000;
const MAX_RETRIES: u32 = 3;

struct Bucket {
    user: String,
    count: u32,
    reset_at: i64,
}

static LIMITS: Mutex<Vec<Bucket>> = Mutex::new(Vec::new());

/// Search the iTunes software catalog.
pub fn search(state: &AppState, req: &Request, user_id: &str) -> Response {
    let Some(term) = req.query_param("term").filter(|t| !t.is_empty()) else {
        return err(400, "term query parameter is required");
    };
    if rate_limited(user_id) {
        return err(429, "Too many searches. Please wait a few minutes.");
    }
    let url = format!(
        "https://itunes.apple.com/search?term={}&entity=software&limit=25",
        httpc::form_encode(&term)
    );
    let data = match fetch_itunes(state, &url) {
        Ok(v) => v,
        Err(res) => return res,
    };
    let results = data
        .get("results")
        .and_then(Json::as_arr)
        .map(|a| a.to_vec())
        .unwrap_or_default();
    let mapped = Json::Arr(
        results
            .iter()
            .enumerate()
            .map(|(i, app)| map_app(app, i))
            .collect(),
    );
    json_res(200, &mapped)
}

fn rate_limited(user_id: &str) -> bool {
    let now = crate::config::now_ms();
    let mut limits = LIMITS.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(entry) = limits.iter_mut().find(|b| b.user == user_id) {
        if now > entry.reset_at {
            entry.count = 1;
            entry.reset_at = now + RATE_WINDOW_MS;
            return false;
        }
        entry.count += 1;
        return entry.count > MAX_SEARCHES;
    }
    if limits.len() >= MAX_ENTRIES {
        limits.remove(0);
    }
    limits.push(Bucket {
        user: user_id.to_string(),
        count: 1,
        reset_at: now + RATE_WINDOW_MS,
    });
    false
}

fn fetch_itunes(state: &AppState, url: &str) -> Result<Json, Response> {
    let mut last = String::new();
    for attempt in 0..MAX_RETRIES {
        match httpc::get(url, &[], 10_000) {
            Ok(res) if res.ok() => {
                return json::parse(&res.body).map_err(|_| err(500, "Search temporarily unavailable. Please try again."));
            }
            Ok(res) if res.status == 429 || res.status >= 500 => {
                last = format!("status {}", res.status);
                sleep_backoff(attempt);
            }
            Ok(res) => {
                state.log.error(
                    "Keyword search error",
                    &[("error", json::s(format!("iTunes API error: {}", res.status)))],
                );
                return Err(err(500, "Search temporarily unavailable. Please try again."));
            }
            Err(e) => {
                last = e.to_string();
                if attempt + 1 == MAX_RETRIES {
                    break;
                }
                sleep_backoff(attempt);
            }
        }
    }
    state
        .log
        .error("Keyword search error", &[("error", json::s(last))]);
    Err(err(500, "Search temporarily unavailable. Please try again."))
}

fn sleep_backoff(attempt: u32) {
    let delay = 1000u64.saturating_mul(1u64 << attempt);
    std::thread::sleep(std::time::Duration::from_millis(delay));
}

fn map_app(app: &Json, index: usize) -> Json {
    let rating = app
        .get("averageUserRating")
        .and_then(Json::as_f64)
        .map(|n| format!("{n:.1}"))
        .unwrap_or_else(|| "N/A".into());
    let reviews = app.get("userRatingCount").and_then(Json::as_f64).unwrap_or(0.0) as i64;
    obj(vec![
        ("rank", json::i(index as i64 + 1)),
        ("name", json::s(app.get("trackName").and_then(Json::as_str).unwrap_or(""))),
        ("developer", json::s(app.get("artistName").and_then(Json::as_str).unwrap_or(""))),
        ("icon", json::s(app.get("artworkUrl60").and_then(Json::as_str).unwrap_or(""))),
        ("rating", json::s(rating)),
        ("reviews", json::i(reviews)),
        ("price", json::s(app.get("formattedPrice").and_then(Json::as_str).unwrap_or("Free"))),
        ("bundleId", json::s(app.get("bundleId").and_then(Json::as_str).unwrap_or(""))),
        ("url", json::s(app.get("trackViewUrl").and_then(Json::as_str).unwrap_or(""))),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn eleventh_search_in_the_window_is_limited() {
        let user = format!("kw-{}", std::process::id());
        for _ in 0..10 {
            assert!(!rate_limited(&user));
        }
        assert!(rate_limited(&user));
    }
}
