//! App Store Connect routes: apps, metadata, screenshots, credentials, analytics.
//!
//! Credentials are stored per user. Updates never write the shared `.env`.
//! ES256 signatures use the system libcrypto (the same OpenSSL libcurl is
//! linked against), not a crate.

use std::ffi::{c_int, c_void};
use std::fs;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Duration;

use super::{db_fail, err, exec, json_res, obj, query, safe_id, seg, str_field, t};
use crate::config;
use crate::crypto;
use crate::httpc::{self, Method};
use crate::http::{Request, Response};
use crate::json::{self, Json};
use crate::state::AppState;

const ASC_BASE: &str = "https://api.appstoreconnect.apple.com/v1";
const TOKEN_TTL: i64 = 20 * 60;

struct Creds {
    key_id: String,
    issuer_id: String,
    private_key: String,
}

/// List every app the caller's ASC key can see.
pub fn apps(state: &AppState, user_id: &str) -> Response {
    asc_pages(state, user_id, "/apps")
}

/// One app.
pub fn app(state: &AppState, req: &Request, user_id: &str) -> Response {
    let Some(id) = asc_seg(req, 2) else {
        return err(400, "Invalid app id");
    };
    asc_json(state, user_id, Method::Get, &format!("/apps/{id}"), None)
}

/// App Store versions for an app.
pub fn versions(state: &AppState, req: &Request, user_id: &str) -> Response {
    let Some(id) = asc_seg(req, 2) else {
        return err(400, "Invalid app id");
    };
    asc_pages(state, user_id, &format!("/apps/{id}/appStoreVersions"))
}

/// App info localizations, each with its localization list attached.
pub fn metadata_get(state: &AppState, req: &Request, user_id: &str) -> Response {
    let Some(id) = asc_seg(req, 2) else {
        return err(400, "Invalid app id");
    };
    let infos = match pages(state, user_id, &format!("/apps/{id}/appInfos")) {
        Ok(v) => v,
        Err(res) => return res,
    };
    let mut enriched = Vec::new();
    for info in infos {
        let info_id = info.get("id").and_then(Json::as_str).unwrap_or("");
        if !safe_id(info_id) {
            continue;
        }
        let locs = match pages(state, user_id, &format!("/appInfos/{info_id}/appInfoLocalizations")) {
            Ok(v) => v,
            Err(res) => return res,
        };
        let mut map = info.as_obj().cloned().unwrap_or_default();
        map.insert("localizations".into(), Json::Arr(locs));
        enriched.push(Json::Obj(map));
    }
    json_res(200, &obj(vec![("data", Json::Arr(enriched))]))
}

/// Patch one localization. The app id in the path is not forwarded to Apple.
pub fn metadata_patch(state: &AppState, req: &Request, user_id: &str) -> Response {
    let body = match super::body_json(req) {
        Ok(v) => v,
        Err(res) => return res,
    };
    let Some(localization_id) = str_field(&body, "localizationId").filter(|id| safe_id(id)) else {
        return err(400, "localizationId and attributes are required");
    };
    let Some(attributes) = body.get("attributes").filter(|v| !matches!(v, Json::Null)) else {
        return err(400, "localizationId and attributes are required");
    };
    let payload = obj(vec![(
        "data",
        obj(vec![
            ("type", json::s("appInfoLocalizations")),
            ("id", json::s(localization_id)),
            ("attributes", attributes.clone()),
        ]),
    )]);
    asc_json(
        state,
        user_id,
        Method::Patch,
        &format!("/appInfoLocalizations/{localization_id}"),
        Some(json::stringify(&payload)),
    )
}

/// Screenshot sets for the latest version.
pub fn screenshots_get(state: &AppState, req: &Request, user_id: &str) -> Response {
    let Some(id) = asc_seg(req, 2) else {
        return err(400, "Invalid app id");
    };
    let versions = match pages(state, user_id, &format!("/apps/{id}/appStoreVersions")) {
        Ok(v) => v,
        Err(res) => return res,
    };
    let Some(latest) = versions.first() else {
        return json_res(
            200,
            &obj(vec![("data", Json::Arr(vec![])), ("message", json::s("No versions found"))]),
        );
    };
    let version_id = latest.get("id").and_then(Json::as_str).unwrap_or("");
    if !safe_id(version_id) {
        return err(502, "ASC API returned an invalid version id");
    }
    let locs = match pages(
        state,
        user_id,
        &format!("/appStoreVersions/{version_id}/appStoreVersionLocalizations"),
    ) {
        Ok(v) => v,
        Err(res) => return res,
    };
    let mut result = Vec::new();
    for loc in locs {
        let loc_id = loc.get("id").and_then(Json::as_str).unwrap_or("");
        if !safe_id(loc_id) {
            continue;
        }
        let sets = match pages(
            state,
            user_id,
            &format!("/appStoreVersionLocalizations/{loc_id}/appScreenshotSets"),
        ) {
            Ok(v) => v,
            Err(res) => return res,
        };
        let mut sets_out = Vec::new();
        for set in sets {
            let set_id = set.get("id").and_then(Json::as_str).unwrap_or("");
            if !safe_id(set_id) {
                continue;
            }
            let shots = match pages(state, user_id, &format!("/appScreenshotSets/{set_id}/appScreenshots")) {
                Ok(v) => v,
                Err(res) => return res,
            };
            let mut map = set.as_obj().cloned().unwrap_or_default();
            map.insert("screenshots".into(), Json::Arr(shots));
            sets_out.push(Json::Obj(map));
        }
        result.push(obj(vec![
            (
                "locale",
                json::s(
                    loc.get("attributes")
                        .and_then(|a| a.get("locale"))
                        .and_then(Json::as_str)
                        .unwrap_or(""),
                ),
            ),
            ("localizationId", json::s(loc_id)),
            ("screenshotSets", Json::Arr(sets_out)),
        ]));
    }
    json_res(
        200,
        &obj(vec![
            ("data", Json::Arr(result)),
            ("versionId", json::s(version_id)),
        ]),
    )
}

/// Reserve, upload, and commit a screenshot that already lives under this app's root.
pub fn screenshots_post(state: &AppState, req: &Request, user_id: &str) -> Response {
    let body = match super::body_json(req) {
        Ok(v) => v,
        Err(res) => return res,
    };
    let Some(set_id) = str_field(&body, "screenshotSetId").filter(|id| safe_id(id)) else {
        return err(400, "screenshotSetId and filePath are required");
    };
    let Some(file_path) = str_field(&body, "filePath") else {
        return err(400, "screenshotSetId and filePath are required");
    };
    let Some(bytes) = read_inside(&state.root, file_path) else {
        return err(400, "filePath must point at a file this server stored");
    };
    let file_name = Path::new(file_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("screenshot.png");
    let reserve = obj(vec![(
        "data",
        obj(vec![
            ("type", json::s("appScreenshots")),
            (
                "attributes",
                obj(vec![
                    ("fileName", json::s(file_name)),
                    ("fileSize", json::i(bytes.len() as i64)),
                ]),
            ),
            (
                "relationships",
                obj(vec![(
                    "appScreenshotSet",
                    obj(vec![(
                        "data",
                        obj(vec![
                            ("type", json::s("appScreenshotSets")),
                            ("id", json::s(set_id)),
                        ]),
                    )]),
                )]),
            ),
        ]),
    )]);
    let reserved = match call(state, user_id, Method::Post, "/appScreenshots", Some(json::stringify(&reserve))) {
        Ok(v) => v,
        Err(res) => return res,
    };
    let shot_id = reserved
        .get("data")
        .and_then(|d| d.get("id"))
        .and_then(Json::as_str)
        .unwrap_or("");
    if !safe_id(shot_id) {
        return err(502, "ASC API did not return a screenshot id");
    }
    let ops = reserved
        .get("data")
        .and_then(|d| d.get("attributes"))
        .and_then(|a| a.get("uploadOperations"))
        .and_then(Json::as_arr)
        .map(|a| a.to_vec())
        .unwrap_or_default();
    for op in ops {
        if let Err(res) = upload_chunk(&bytes, &op) {
            return res;
        }
    }
    let checksum = crypto::base64_encode(&md5(&bytes));
    let commit = obj(vec![(
        "data",
        obj(vec![
            ("type", json::s("appScreenshots")),
            ("id", json::s(shot_id)),
            (
                "attributes",
                obj(vec![
                    ("uploaded", Json::Bool(true)),
                    ("sourceFileChecksum", json::s(checksum)),
                ]),
            ),
        ]),
    )]);
    match call(
        state,
        user_id,
        Method::Patch,
        &format!("/appScreenshots/{shot_id}"),
        Some(json::stringify(&commit)),
    ) {
        Ok(v) => json_res(201, &v),
        Err(res) => res,
    }
}

/// Delete a screenshot on Apple's side.
pub fn screenshots_delete(state: &AppState, req: &Request, user_id: &str) -> Response {
    let Some(id) = asc_seg(req, 2) else {
        return err(400, "Invalid screenshot id");
    };
    match call(state, user_id, Method::Delete, &format!("/appScreenshots/{id}"), None) {
        Ok(_) => json_res(200, &obj(vec![("success", Json::Bool(true))])),
        Err(res) => res,
    }
}

/// Available simulators. A host without `xcrun` has none, so the list is empty.
pub fn simulators(state: &AppState) -> Response {
    if !simulators_available() {
        return empty_simulators();
    }
    match run(state, "xcrun", &["simctl", "list", "devices", "available", "-j"], 30) {
        Ok(stdout) => match json::parse(stdout.as_bytes()) {
            Ok(parsed) => json_res(200, &obj(vec![("simulators", flatten_sims(&parsed))])),
            Err(_) => err(500, "Failed to parse simulator list"),
        },
        Err(message) => {
            state.log.error("ASC simulators error", &[("error", json::s(message))]);
            err(500, "Failed to list simulators")
        }
    }
}

/// Boot simulators and capture screenshots. 501 without Xcode.
pub fn capture(state: &AppState, req: &Request) -> Response {
    if !simulators_available() {
        return err(
            501,
            "Simulator capture is unavailable in this environment. Upload screenshots manually via the Exports view.",
        );
    }
    let body = match super::body_json(req) {
        Ok(v) => v,
        Err(res) => return res,
    };
    let Some(bundle_id) = str_field(&body, "bundleId").filter(|id| bundle_ok(id)) else {
        return err(400, "bundleId and simulators array are required");
    };
    let sims: Vec<String> = body
        .get("simulators")
        .and_then(Json::as_arr)
        .map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
        .unwrap_or_default();
    if sims.is_empty() {
        return err(400, "bundleId and simulators array are required");
    }
    if let Some(name) = body.get("name").and_then(Json::as_str) {
        if !name.is_empty() && !path_segment(name) {
            return err(400, "Invalid name");
        }
    }
    if let Some(steps) = body.get("steps").and_then(Json::as_arr) {
        for step in steps {
            if let Some(name) = step.get("name").and_then(Json::as_str) {
                if !path_segment(name) {
                    return err(400, "Invalid step name");
                }
            }
        }
    }
    let listed = match run(state, "xcrun", &["simctl", "list", "devices", "available", "-j"], 30) {
        Ok(stdout) => match json::parse(stdout.as_bytes()) {
            Ok(v) => v,
            Err(_) => return err(500, "Failed to parse simulator list"),
        },
        Err(message) => {
            state.log.error("ASC screenshot capture error", &[("error", json::s(message))]);
            return err(500, "Failed to list simulators");
        }
    };
    let mut results = Vec::new();
    for simulator in &sims {
        results.push(capture_one(state, &body, bundle_id, simulator, &listed));
    }
    json_res(200, &obj(vec![("screenshots", Json::Arr(results))]))
}

/// Save the caller's ASC key. The PEM stays in SQLite, not in `.env`.
pub fn credentials(state: &AppState, req: &Request, user_id: &str) -> Response {
    let body = match super::body_json(req) {
        Ok(v) => v,
        Err(res) => return res,
    };
    let Some(key_id) = str_field(&body, "keyId").filter(|id| key_ok(id)) else {
        return err(400, "keyId, issuerId, and privateKey are required");
    };
    let Some(issuer_id) = str_field(&body, "issuerId").filter(|id| issuer_ok(id)) else {
        return err(400, "keyId, issuerId, and privateKey are required");
    };
    let Some(private_key) = str_field(&body, "privateKey").filter(|k| key_pem_ok(k)) else {
        return err(400, "keyId, issuerId, and privateKey are required");
    };
    match exec(
        state,
        "INSERT INTO asc_credentials (user_id, key_id, issuer_id, private_key) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET key_id = excluded.key_id, issuer_id = excluded.issuer_id, private_key = excluded.private_key",
        &[t(user_id), t(key_id), t(issuer_id), t(private_key)],
    ) {
        Ok(_) => json_res(200, &obj(vec![("success", Json::Bool(true))])),
        Err(e) => db_fail(state, "ASC credentials save error", "Failed to save credentials", &e),
    }
}

/// Analytics summary. A missing reporting entitlement returns zeros, matching the Node route.
pub fn metrics(state: &AppState, req: &Request, user_id: &str) -> Response {
    let Some(app_id) = req.query_param("appId").filter(|id| safe_id(id)) else {
        return err(400, "appId is required");
    };
    let end = req
        .query_param("endDate")
        .filter(|s| date_ok(s))
        .unwrap_or_else(|| super::iso_now().chars().take(10).collect());
    let start = req.query_param("startDate").filter(|s| date_ok(s)).unwrap_or_else(|| {
        let days = config::now_ms().max(0) / 1000 / 86_400 - 30;
        let (y, m, d) = super::civil_from_days(days);
        format!("{y:04}-{m:02}-{d:02}")
    });
    let path = format!(
        "/apps/{app_id}/analyticsReportRequests?filter[frequency]=DAILY&filter[measures]=impressionsTotal,pageViewCount,units,conversionRate&filter[startDate]={start}&filter[endDate]={end}"
    );
    match call(state, user_id, Method::Get, &path, None) {
        Ok(v) => json_res(200, &v),
        Err(_) => json_res(
            200,
            &obj(vec![
                (
                    "summary",
                    obj(vec![
                        ("impressions", json::i(0)),
                        ("pageViews", json::i(0)),
                        ("installs", json::i(0)),
                        ("conversion", json::s("0%")),
                    ]),
                ),
                ("daily", Json::Arr(vec![])),
                ("note", json::s("Analytics API requires App Store Connect reporting access")),
            ]),
        ),
    }
}

fn asc_pages(state: &AppState, user_id: &str, path: &str) -> Response {
    match pages(state, user_id, path) {
        Ok(data) => json_res(200, &obj(vec![("data", Json::Arr(data))])),
        Err(res) => res,
    }
}

fn asc_json(state: &AppState, user_id: &str, method: Method, path: &str, body: Option<String>) -> Response {
    match call(state, user_id, method, path, body) {
        Ok(v) => json_res(200, &v),
        Err(res) => res,
    }
}

fn pages(state: &AppState, user_id: &str, path: &str) -> Result<Vec<Json>, Response> {
    let mut all = Vec::new();
    let mut url = path.to_string();
    for _ in 0..20 {
        let page = call(state, user_id, Method::Get, &url, None)?;
        if let Some(data) = page.get("data").and_then(Json::as_arr) {
            all.extend(data.iter().cloned());
        }
        let next = page
            .get("links")
            .and_then(|l| l.get("next"))
            .and_then(Json::as_str)
            .filter(|s| !s.is_empty());
        match next {
            Some(next) => url = next.to_string(),
            None => break,
        }
    }
    Ok(all)
}

fn call(
    state: &AppState,
    user_id: &str,
    method: Method,
    endpoint: &str,
    body: Option<String>,
) -> Result<Json, Response> {
    let creds = match load_creds(state, user_id) {
        Ok(c) => c,
        Err(message) => {
            state.log.error("ASC request error", &[("error", json::s(&message))]);
            return Err(err(status_for(&message), &public_asc(&message)));
        }
    };
    let token = match sign_token(&creds) {
        Ok(t) => t,
        Err(message) => {
            state.log.error("ASC token error", &[("error", json::s(&message))]);
            return Err(err(500, "Failed to sign the App Store Connect token"));
        }
    };
    let url = if endpoint.starts_with("http://") || endpoint.starts_with("https://") {
        endpoint.to_string()
    } else {
        format!("{ASC_BASE}{endpoint}")
    };
    let auth = format!("Bearer {token}");
    let headers = [("Authorization", auth.as_str()), ("Content-Type", "application/json")];
    let response = httpc::exchange(method, &url, &headers, body.as_deref().map(str::as_bytes), 15_000)
        .map_err(|e| {
            state.log.error("ASC transport error", &[("error", json::s(e.to_string()))]);
            err(502, "ASC API request failed")
        })?;
    if response.status == 204 {
        return Ok(Json::Null);
    }
    if !(200..300).contains(&response.status) {
        let message = format!("ASC API {}: {}", response.status, truncate(&response.text(), 180));
        state.log.error("ASC API error", &[("error", json::s(&message))]);
        return Err(err(status_for(&message), "App Store Connect rejected the request"));
    }
    if response.body.is_empty() {
        return Ok(Json::Null);
    }
    json::parse(&response.body).map_err(|_| err(502, "ASC API returned invalid JSON"))
}

fn upload_chunk(file: &[u8], op: &Json) -> Result<(), Response> {
    let url = op.get("url").and_then(Json::as_str).unwrap_or("");
    if !url.starts_with("https://") {
        return Err(err(502, "ASC API returned an invalid upload URL"));
    }
    let method = op.get("method").and_then(Json::as_str).unwrap_or("PUT");
    let offset = op.get("offset").and_then(Json::as_f64).unwrap_or(0.0) as usize;
    let length = op.get("length").and_then(Json::as_f64).unwrap_or(0.0) as usize;
    if offset.saturating_add(length) > file.len() {
        return Err(err(502, "ASC API upload range is outside the file"));
    }
    let chunk = &file[offset..offset + length];
    let mut headers: Vec<(String, String)> = Vec::new();
    if let Some(list) = op.get("requestHeaders").and_then(Json::as_arr) {
        for header in list {
            let name = header.get("name").and_then(Json::as_str).unwrap_or("");
            let value = header.get("value").and_then(Json::as_str).unwrap_or("");
            if !name.is_empty() && !name.eq_ignore_ascii_case("authorization") {
                headers.push((name.to_string(), value.to_string()));
            }
        }
    }
    let refs: Vec<(&str, &str)> = headers.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect();
    let verb = match method {
        "PUT" => Method::Put,
        "POST" => Method::Post,
        "PATCH" => Method::Patch,
        _ => Method::Put,
    };
    match httpc::exchange(verb, url, &refs, Some(chunk), 30_000) {
        Ok(res) if res.ok() => Ok(()),
        Ok(res) => Err(err(502, &format!("Upload chunk failed: {}", res.status))),
        Err(_) => Err(err(502, "Upload chunk failed")),
    }
}

fn load_creds(state: &AppState, user_id: &str) -> Result<Creds, String> {
    let rows = query(
        state,
        "SELECT key_id, issuer_id, private_key FROM asc_credentials WHERE user_id = ?",
        &[t(user_id)],
    )
    .map_err(|e| e.to_string())?;
    if let Some(row) = rows.first() {
        return Ok(Creds {
            key_id: row.text("key_id").unwrap_or("").to_string(),
            issuer_id: row.text("issuer_id").unwrap_or("").to_string(),
            private_key: row.text("private_key").unwrap_or("").to_string(),
        });
    }
    let key_id = config::env_nonempty("ASC_KEY_ID");
    let issuer = config::env_nonempty("ASC_ISSUER_ID");
    let path = config::env_nonempty("ASC_PRIVATE_KEY_PATH");
    match (key_id, issuer, path) {
        (Some(key_id), Some(issuer_id), Some(path)) => {
            let full = if Path::new(&path).is_absolute() {
                Path::new(&path).to_path_buf()
            } else {
                state.root.join(path)
            };
            let private_key = fs::read_to_string(&full).map_err(|_| {
                "Missing ASC environment variables (ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY_PATH)".to_string()
            })?;
            Ok(Creds {
                key_id,
                issuer_id,
                private_key,
            })
        }
        _ => Err(
            "Missing ASC environment variables (ASC_KEY_ID, ASC_ISSUER_ID, ASC_PRIVATE_KEY_PATH)".into(),
        ),
    }
}

fn sign_token(creds: &Creds) -> Result<String, String> {
    let now = config::now_ms() / 1000;
    let header = json::stringify(&obj(vec![
        ("alg", json::s("ES256")),
        ("kid", json::s(&creds.key_id)),
        ("typ", json::s("JWT")),
    ]));
    let payload = json::stringify(&obj(vec![
        ("aud", json::s("appstoreconnect-v1")),
        ("exp", json::i(now + TOKEN_TTL)),
        ("iat", json::i(now)),
        ("iss", json::s(&creds.issuer_id)),
    ]));
    let signing = format!(
        "{}.{}",
        crypto::base64url_encode(header.as_bytes()),
        crypto::base64url_encode(payload.as_bytes())
    );
    let der = es256_sign(&creds.private_key, signing.as_bytes())?;
    let raw = der_to_p1363(&der)?;
    Ok(format!("{signing}.{}", crypto::base64url_encode(&raw)))
}

fn status_for(message: &str) -> u16 {
    if message.contains("Missing ASC") {
        503
    } else if message.contains("ASC API") {
        502
    } else {
        500
    }
}

fn public_asc(message: &str) -> String {
    if message.contains("Missing ASC") {
        "App Store Connect is not configured. Add your API key in Settings.".into()
    } else {
        "App Store Connect request failed".into()
    }
}

fn truncate(text: &str, max: usize) -> String {
    text.chars().take(max).collect()
}

fn asc_seg(req: &Request, index: usize) -> Option<String> {
    seg(&req.path, index).filter(|id| safe_id(id))
}

fn key_ok(id: &str) -> bool {
    (1..=64).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_alphanumeric())
}

fn issuer_ok(id: &str) -> bool {
    (1..=64).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
}

fn key_pem_ok(key: &str) -> bool {
    key.contains("PRIVATE KEY")
        && key.contains('\n')
        && key.len() < 16_384
        && !key.contains('\0')
}

fn date_ok(value: &str) -> bool {
    value.len() == 10
        && value.as_bytes()[4] == b'-'
        && value.as_bytes()[7] == b'-'
        && value.bytes().all(|b| b.is_ascii_digit() || b == b'-')
}

fn bundle_ok(id: &str) -> bool {
    let b = id.as_bytes();
    !b.is_empty()
        && b.len() <= 255
        && b[0].is_ascii_alphanumeric()
        && b.iter().all(|c| c.is_ascii_alphanumeric() || *c == b'.' || *c == b'-')
}

fn path_segment(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && !value.contains('/')
        && !value.contains('\\')
        && !value.contains('\0')
        && value != "."
        && value != ".."
}

fn empty_simulators() -> Response {
    json_res(200, &obj(vec![("simulators", Json::Arr(Vec::new()))]))
}

fn simulators_available() -> bool {
    if config::env("DISABLE_SIMULATOR").as_deref() == Some("true") {
        return false;
    }
    Command::new("xcrun")
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn flatten_sims(parsed: &Json) -> Json {
    let mut out = Vec::new();
    let Some(devices) = parsed.get("devices").and_then(Json::as_obj) else {
        return Json::Arr(out);
    };
    for (runtime, list) in devices {
        let runtime_name = runtime
            .trim_start_matches("com.apple.CoreSimulator.SimRuntime.")
            .replace('-', ".");
        let Some(list) = list.as_arr() else { continue };
        for device in list {
            out.push(obj(vec![
                ("name", json::s(device.get("name").and_then(Json::as_str).unwrap_or(""))),
                ("udid", json::s(device.get("udid").and_then(Json::as_str).unwrap_or(""))),
                ("state", json::s(device.get("state").and_then(Json::as_str).unwrap_or(""))),
                ("runtime", json::s(&runtime_name)),
            ]));
        }
    }
    Json::Arr(out)
}

fn capture_one(state: &AppState, body: &Json, bundle_id: &str, simulator: &str, listed: &Json) -> Json {
    let Some(udid) = find_udid(listed, simulator) else {
        return obj(vec![
            ("simulator", json::s(simulator)),
            ("error", json::s(format!("Simulator \"{simulator}\" not found"))),
        ]);
    };
    if !udid_ok(&udid) {
        return obj(vec![
            ("simulator", json::s(simulator)),
            ("error", json::s("Unexpected simulator UDID")),
        ]);
    }
    if let Err(message) = run(state, "xcrun", &["simctl", "boot", &udid], 30) {
        if !message.contains("Unable to boot device in current state") {
            return obj(vec![
                ("simulator", json::s(simulator)),
                ("error", json::s(format!("Failed to boot simulator: {message}"))),
            ]);
        }
    }
    std::thread::sleep(Duration::from_secs(2));
    if let Err(message) = run(state, "xcrun", &["simctl", "launch", &udid, bundle_id], 30) {
        return obj(vec![
            ("simulator", json::s(simulator)),
            ("error", json::s(format!("Failed to launch {bundle_id}: {message}"))),
        ]);
    }
    std::thread::sleep(Duration::from_secs(3));
    let sanitized = simulator.replace(' ', "_");
    let out_dir = state.root.join("screenshots").join(bundle_id).join(&sanitized);
    if fs::create_dir_all(&out_dir).is_err() {
        return obj(vec![
            ("simulator", json::s(simulator)),
            ("error", json::s("Failed to create the screenshot directory")),
        ]);
    }
    let should_crop = body.get("cropStatusBar").and_then(|v| match v {
        Json::Bool(b) => Some(*b),
        _ => None,
    }).unwrap_or(false);
    if let Some(steps) = body.get("steps").and_then(Json::as_arr) {
        if !steps.is_empty() {
            let mut paths = Vec::new();
            for step in steps {
                let delay = step.get("delay").and_then(Json::as_f64).unwrap_or(0.0);
                if delay > 0.0 {
                    std::thread::sleep(Duration::from_millis(delay as u64));
                }
                let name = step.get("name").and_then(Json::as_str).unwrap_or("step");
                let path = out_dir.join(format!("{name}_{sanitized}.png"));
                if let Err(message) = shot(state, &udid, &path) {
                    return obj(vec![("simulator", json::s(simulator)), ("error", json::s(message))]);
                }
                if should_crop {
                    let _ = crop_status_bar(state, &path, simulator);
                }
                paths.push(json::s(path.display().to_string()));
            }
            return obj(vec![("simulator", json::s(simulator)), ("paths", Json::Arr(paths))]);
        }
    }
    let file_name = match body.get("name").and_then(Json::as_str).filter(|s| !s.is_empty()) {
        Some(name) => format!("{name}_{sanitized}.png"),
        None => format!("screenshot_{}.png", config::now_ms()),
    };
    let path = out_dir.join(file_name);
    if let Err(message) = shot(state, &udid, &path) {
        return obj(vec![("simulator", json::s(simulator)), ("error", json::s(message))]);
    }
    if should_crop {
        let _ = crop_status_bar(state, &path, simulator);
    }
    obj(vec![
        ("simulator", json::s(simulator)),
        ("path", json::s(path.display().to_string())),
    ])
}

fn find_udid(listed: &Json, name: &str) -> Option<String> {
    let devices = listed.get("devices")?.as_obj()?;
    for list in devices.values() {
        let Some(list) = list.as_arr() else { continue };
        for device in list {
            if device.get("name").and_then(Json::as_str) == Some(name) {
                return device.get("udid").and_then(Json::as_str).map(str::to_string);
            }
        }
    }
    None
}

fn udid_ok(udid: &str) -> bool {
    (8..=64).contains(&udid.len())
        && udid
            .bytes()
            .all(|b| b.is_ascii_hexdigit() || b == b'-')
}

fn shot(state: &AppState, udid: &str, path: &Path) -> Result<(), String> {
    let path = path.display().to_string();
    run(state, "xcrun", &["simctl", "io", udid, "screenshot", &path], 30).map(|_| ())
}

fn crop_status_bar(state: &AppState, path: &Path, simulator: &str) -> Result<(), String> {
    let bar = status_bar(simulator);
    let path = path.display().to_string();
    let dims = run(state, "sips", &["-g", "pixelHeight", "-g", "pixelWidth", &path], 30)?;
    let height = dims
        .split("pixelHeight:")
        .nth(1)
        .and_then(|s| s.split_whitespace().next())
        .and_then(|s| s.parse::<i64>().ok())
        .ok_or_else(|| format!("Could not read dimensions of {path}"))?;
    let width = dims
        .split("pixelWidth:")
        .nth(1)
        .and_then(|s| s.split_whitespace().next())
        .and_then(|s| s.parse::<i64>().ok())
        .ok_or_else(|| format!("Could not read dimensions of {path}"))?;
    let cropped = height - i64::from(bar);
    if cropped <= 0 {
        return Ok(());
    }
    run(
        state,
        "sips",
        &[
            "--cropOffset",
            &bar.to_string(),
            "0",
            "--resampleHeightWidth",
            &cropped.to_string(),
            &width.to_string(),
            &path,
        ],
        30,
    )?;
    Ok(())
}

fn status_bar(name: &str) -> u16 {
    match name {
        "iPhone 16" | "iPhone 16 Plus" | "iPhone 16 Pro" | "iPhone 16 Pro Max" => 62,
        "iPhone 15" | "iPhone 15 Plus" | "iPhone 15 Pro" | "iPhone 15 Pro Max" => 59,
        "iPhone SE" | "iPhone 8" | "iPhone 8 Plus" => 20,
        _ => 54,
    }
}

fn run(state: &AppState, program: &str, args: &[&str], timeout_secs: u64) -> Result<String, String> {
    let mut child = Command::new(program)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let start = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let mut out = Vec::new();
                let mut err_buf = Vec::new();
                if let Some(mut stdout) = child.stdout.take() {
                    use std::io::Read;
                    let _ = stdout.read_to_end(&mut out);
                }
                if let Some(mut stderr) = child.stderr.take() {
                    use std::io::Read;
                    let _ = stderr.read_to_end(&mut err_buf);
                }
                if status.success() {
                    return Ok(String::from_utf8_lossy(&out).into_owned());
                }
                let err_text = String::from_utf8_lossy(&err_buf);
                return Err(if err_text.is_empty() {
                    format!("{program} exited {}", status.code().unwrap_or(1))
                } else {
                    err_text.into_owned()
                });
            }
            Ok(None) if start.elapsed() > Duration::from_secs(timeout_secs) => {
                let _ = child.kill();
                let _ = child.wait();
                state.log.error("command timed out", &[("program", json::s(program))]);
                return Err(format!("{program} timed out"));
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(e) => return Err(e.to_string()),
        }
    }
}

fn read_inside(root: &Path, requested: &str) -> Option<Vec<u8>> {
    if requested.is_empty() || requested.contains('\0') {
        return None;
    }
    let candidate = Path::new(requested);
    let path = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        root.join(candidate)
    };
    let root = root.canonicalize().ok()?;
    let path = path.canonicalize().ok()?;
    if !path.starts_with(&root) {
        return None;
    }
    fs::read(path).ok()
}

fn md5(data: &[u8]) -> [u8; 16] {
    const S: [u32; 64] = [
        7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5,
        9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6,
        10, 15, 21, 6, 10, 15, 21,
    ];
    let mut k = [0u32; 64];
    for i in 0..64 {
        k[i] = (2f64.powi(32) * ((i as f64 + 1.0).sin().abs())) as u32;
    }
    let bit_len = (data.len() as u64).wrapping_mul(8);
    let mut msg = data.to_vec();
    msg.push(0x80);
    while (msg.len() % 64) != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&bit_len.to_le_bytes());
    let mut a0 = 0x67452301u32;
    let mut b0 = 0xefcdab89u32;
    let mut c0 = 0x98badcfeu32;
    let mut d0 = 0x10325476u32;
    for chunk in msg.chunks(64) {
        let mut m = [0u32; 16];
        for (i, word) in m.iter_mut().enumerate() {
            *word = u32::from_le_bytes(chunk[i * 4..i * 4 + 4].try_into().unwrap());
        }
        let (mut a, mut b, mut c, mut d) = (a0, b0, c0, d0);
        for i in 0..64 {
            let (f, g) = if i < 16 {
                ((b & c) | (!b & d), i)
            } else if i < 32 {
                ((d & b) | (!d & c), (5 * i + 1) % 16)
            } else if i < 48 {
                (b ^ c ^ d, (3 * i + 5) % 16)
            } else {
                (c ^ (b | !d), (7 * i) % 16)
            };
            let f = f.wrapping_add(a).wrapping_add(k[i]).wrapping_add(m[g]);
            a = d;
            d = c;
            c = b;
            b = b.wrapping_add(f.rotate_left(S[i]));
        }
        a0 = a0.wrapping_add(a);
        b0 = b0.wrapping_add(b);
        c0 = c0.wrapping_add(c);
        d0 = d0.wrapping_add(d);
    }
    let mut out = [0u8; 16];
    out[0..4].copy_from_slice(&a0.to_le_bytes());
    out[4..8].copy_from_slice(&b0.to_le_bytes());
    out[8..12].copy_from_slice(&c0.to_le_bytes());
    out[12..16].copy_from_slice(&d0.to_le_bytes());
    out
}

fn der_to_p1363(der: &[u8]) -> Result<Vec<u8>, String> {
    if der.first() != Some(&0x30) {
        return Err("ECDSA signature is not a SEQUENCE".into());
    }
    let mut i = 2;
    if der.get(1).is_some_and(|b| b & 0x80 != 0) {
        return Err("ECDSA signature length is too long".into());
    }
    let (r, next) = der_int(der, i)?;
    i = next;
    let (s, _) = der_int(der, i)?;
    let mut out = vec![0u8; 64];
    copy_int(&mut out[..32], &r);
    copy_int(&mut out[32..], &s);
    Ok(out)
}

fn der_int(der: &[u8], i: usize) -> Result<(Vec<u8>, usize), String> {
    if der.get(i) != Some(&0x02) {
        return Err("ECDSA signature is missing an INTEGER".into());
    }
    let len = *der.get(i + 1).ok_or("truncated INTEGER")? as usize;
    let start = i + 2;
    let end = start + len;
    let bytes = der.get(start..end).ok_or("truncated INTEGER")?;
    Ok((bytes.to_vec(), end))
}

fn copy_int(dest: &mut [u8], src: &[u8]) {
    let src = if src.first() == Some(&0) { &src[1..] } else { src };
    if src.len() > dest.len() {
        return;
    }
    let start = dest.len() - src.len();
    dest[start..].copy_from_slice(src);
}

#[repr(C)]
struct Bio {
    _private: [u8; 0],
}
#[repr(C)]
struct EvpPkey {
    _private: [u8; 0],
}
#[repr(C)]
struct EvpMdCtx {
    _private: [u8; 0],
}
#[repr(C)]
struct EvpMd {
    _private: [u8; 0],
}

#[link(name = "crypto")]
unsafe extern "C" {
    fn BIO_new_mem_buf(buf: *const c_void, len: c_int) -> *mut Bio;
    fn BIO_free(bio: *mut Bio) -> c_int;
    fn PEM_read_bio_PrivateKey(
        bio: *mut Bio,
        x: *mut *mut EvpPkey,
        cb: *mut c_void,
        u: *mut c_void,
    ) -> *mut EvpPkey;
    fn EVP_PKEY_free(pkey: *mut EvpPkey);
    fn EVP_MD_CTX_new() -> *mut EvpMdCtx;
    fn EVP_MD_CTX_free(ctx: *mut EvpMdCtx);
    fn EVP_sha256() -> *const EvpMd;
    fn EVP_DigestSignInit(
        ctx: *mut EvpMdCtx,
        pctx: *mut *mut c_void,
        typ: *const EvpMd,
        engine: *mut c_void,
        pkey: *mut EvpPkey,
    ) -> c_int;
    fn EVP_DigestSign(
        ctx: *mut EvpMdCtx,
        sig: *mut u8,
        siglen: *mut usize,
        tbs: *const u8,
        tbslen: usize,
    ) -> c_int;
}

fn es256_sign(pem: &str, message: &[u8]) -> Result<Vec<u8>, String> {
    // SAFETY: the PEM buffer outlives PEM_read, and every OpenSSL object is
    // freed on every return path below. Null engine means the default.
    unsafe {
        let bio = BIO_new_mem_buf(pem.as_ptr().cast(), pem.len() as c_int);
        if bio.is_null() {
            return Err("could not read the private key".into());
        }
        let pkey = PEM_read_bio_PrivateKey(bio, std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut());
        BIO_free(bio);
        if pkey.is_null() {
            return Err("private key is not a valid PEM".into());
        }
        let ctx = EVP_MD_CTX_new();
        if ctx.is_null() {
            EVP_PKEY_free(pkey);
            return Err("could not start signing".into());
        }
        let init = EVP_DigestSignInit(ctx, std::ptr::null_mut(), EVP_sha256(), std::ptr::null_mut(), pkey);
        if init != 1 {
            EVP_MD_CTX_free(ctx);
            EVP_PKEY_free(pkey);
            return Err("could not initialize ES256".into());
        }
        // One shot: EVP_DigestSign finalizes the context, so it cannot be
        // called twice to ask for the length first. P-256 DER fits in 512.
        let mut sig = vec![0u8; 512];
        let mut len = sig.len();
        let rc = EVP_DigestSign(ctx, sig.as_mut_ptr(), &mut len, message.as_ptr(), message.len());
        EVP_MD_CTX_free(ctx);
        EVP_PKEY_free(pkey);
        if rc != 1 {
            return Err("ES256 signing failed".into());
        }
        sig.truncate(len);
        Ok(sig)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_xcrun_lists_no_simulators() {
        let res = empty_simulators();
        assert_eq!(res.status, 200);
        let body = String::from_utf8(res.body).unwrap();
        assert!(body.contains("\"simulators\":[]"), "{body}");
    }

    #[test]
    fn md5_of_empty_and_abc() {
        assert_eq!(
            hex(&md5(b"")),
            "d41d8cd98f00b204e9800998ecf8427e"
        );
        assert_eq!(hex(&md5(b"abc")), "900150983cd24fb0d6963f7d28e17f72");
    }

    #[test]
    fn der_signature_becomes_64_raw_bytes() {
        let mut der = vec![0x30, 0];
        let r = [0x00, 0x81];
        let s = [0x7f];
        let mut body = vec![0x02, r.len() as u8];
        body.extend_from_slice(&r);
        body.extend_from_slice(&[0x02, s.len() as u8]);
        body.extend_from_slice(&s);
        der[1] = body.len() as u8;
        der.extend_from_slice(&body);
        let raw = der_to_p1363(&der).unwrap();
        assert_eq!(raw.len(), 64);
        assert_eq!(raw[30], 0x00);
        assert_eq!(raw[31], 0x81);
        assert_eq!(raw[63], 0x7f);
    }

    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }
}
