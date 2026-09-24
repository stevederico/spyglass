//! Spyglass feature routes ported from the Hono sub-apps.
//!
//! Every path is matched here, with a literal segment preferred over a
//! parameter of the same length (`/templates/fonts` before `/templates/:id`).
//! Callers in `routes` have already checked the session and, for mutations,
//! the CSRF token. Updates and deletes also filter on `user_id`.

mod ai;
mod asc;
mod icons;
mod keywords;
mod multipart;
mod pngimg;
mod precheck;
mod records;
mod translate;
mod zipstore;

use std::collections::BTreeMap;

use crate::db::{self, Value};
use crate::http::{Request, Response};
use crate::json::{self, Json};
use crate::state::AppState;

/// Dispatch one authenticated Spyglass request.
pub fn dispatch(state: &AppState, req: &Request, user_id: &str) -> Response {
    let Some(label) = route_label(&req.method, &req.path) else {
        return text_404();
    };
    match label {
        "keywords.search" => keywords::search(state, req, user_id),
        "precheck" => precheck::run(state, req),
        "icons.resize" => icons::resize(state, req),
        "translate.quota" => translate::quota(),
        "translate.text" => translate::text(state, req),
        "translate.batch" => translate::batch(state, req),
        "ai.metadata" => ai::generate_metadata(state, req),
        "ai.description" => ai::generate_description(state, req),
        "ai.keywords" => ai::generate_keywords(state, req),
        "ai.whats_new" => ai::generate_whats_new(state, req),
        "ai.improve" => ai::improve_text(state, req),
        "ai.suggest" => ai::suggest_keywords(state, req),
        "ai.background" => ai::generate_background(state, req),
        "fonts.list" => records::list_fonts(state, user_id),
        "fonts.upload" => records::upload_font(state, req, user_id),
        "fonts.file" => records::font_file(state, req, user_id),
        "fonts.delete" => records::delete_font(state, req, user_id),
        "templates.list" => records::list_templates(state, req, user_id),
        "templates.create" => records::create_template(state, req, user_id),
        "templates.update" => records::update_template(state, req, user_id),
        "templates.delete" => records::delete_template(state, req, user_id),
        "templates.duplicate" => records::duplicate_template(state, req, user_id),
        "history.list" => records::list_history(state, req, user_id),
        "history.create" => records::create_history(state, req, user_id),
        "history.one" => records::get_history(state, req, user_id),
        "history.delete" => records::delete_history(state, req, user_id),
        "exports.list" => records::list_exports(state, req, user_id),
        "exports.create" => records::create_export(state, req, user_id),
        "exports.one" => records::get_export(state, req, user_id),
        "exports.delete" => records::delete_export(state, req, user_id),
        "exports.download" => records::download_export(state, req, user_id),
        "exports.file" => records::export_file(state, req, user_id),
        "asc.apps" => asc::apps(state, user_id),
        "asc.app" => asc::app(state, req, user_id),
        "asc.versions" => asc::versions(state, req, user_id),
        "asc.metadata.get" => asc::metadata_get(state, req, user_id),
        "asc.metadata.patch" => asc::metadata_patch(state, req, user_id),
        "asc.screenshots.get" => asc::screenshots_get(state, req, user_id),
        "asc.screenshots.post" => asc::screenshots_post(state, req, user_id),
        "asc.simulators" => asc::simulators(state),
        "asc.screenshots.delete" => asc::screenshots_delete(state, req, user_id),
        "asc.capture" => asc::capture(state, req),
        "asc.credentials" => asc::credentials(state, req, user_id),
        "asc.metrics" => asc::metrics(state, req, user_id),
        _ => text_404(),
    }
}

/// Stable name for a feature route, or `None` when the path is not one of them.
///
/// Literal segments are matched before a same-length parameter. That is why
/// `templates/fonts` is its own arm and not `templates/:id`.
pub fn route_label(method: &str, path: &str) -> Option<&'static str> {
    let rest = path.strip_prefix("/api/")?;
    let segs: Vec<&str> = rest.split('/').filter(|s| !s.is_empty()).collect();
    match (method, segs.as_slice()) {
        ("GET", ["keywords", "search"]) => Some("keywords.search"),
        ("POST", ["precheck"]) => Some("precheck"),
        ("POST", ["icons", "resize"]) => Some("icons.resize"),
        ("GET", ["translate", "quota"]) => Some("translate.quota"),
        ("POST", ["translate", "text"]) => Some("translate.text"),
        ("POST", ["translate", "batch"]) => Some("translate.batch"),
        ("POST", ["ai", "generate-metadata"]) => Some("ai.metadata"),
        ("POST", ["ai", "generate-description"]) => Some("ai.description"),
        ("POST", ["ai", "generate-keywords"]) => Some("ai.keywords"),
        ("POST", ["ai", "generate-whats-new"]) => Some("ai.whats_new"),
        ("POST", ["ai", "improve-text"]) => Some("ai.improve"),
        ("POST", ["ai", "suggest-keywords"]) => Some("ai.suggest"),
        ("POST", ["ai", "generate-background"]) => Some("ai.background"),
        ("GET", ["templates", "fonts"]) => Some("fonts.list"),
        ("POST", ["templates", "fonts"]) => Some("fonts.upload"),
        ("GET", ["templates", "fonts", _, "file"]) => Some("fonts.file"),
        ("DELETE", ["templates", "fonts", _]) => Some("fonts.delete"),
        ("GET", ["templates"]) => Some("templates.list"),
        ("POST", ["templates"]) => Some("templates.create"),
        ("PATCH", ["templates", _]) => Some("templates.update"),
        ("DELETE", ["templates", _]) => Some("templates.delete"),
        ("POST", ["templates", _, "duplicate"]) => Some("templates.duplicate"),
        ("GET", ["metadata-history", "snapshot", _]) => Some("history.one"),
        ("DELETE", ["metadata-history", "snapshot", _]) => Some("history.delete"),
        ("GET", ["metadata-history", _]) => Some("history.list"),
        ("POST", ["metadata-history"]) => Some("history.create"),
        ("GET", ["exports"]) => Some("exports.list"),
        ("POST", ["exports"]) => Some("exports.create"),
        ("GET", ["exports", _, "download"]) => Some("exports.download"),
        ("GET", ["exports", _, "files", _]) => Some("exports.file"),
        ("GET", ["exports", _]) => Some("exports.one"),
        ("DELETE", ["exports", _]) => Some("exports.delete"),
        ("GET", ["asc", "apps"]) => Some("asc.apps"),
        ("GET", ["asc", "simulators"]) => Some("asc.simulators"),
        ("GET", ["asc", "analytics", "metrics"]) => Some("asc.metrics"),
        ("POST", ["asc", "credentials"]) => Some("asc.credentials"),
        ("POST", ["asc", "screenshots", "capture"]) => Some("asc.capture"),
        ("DELETE", ["asc", "screenshots", _]) => Some("asc.screenshots.delete"),
        ("GET", ["asc", "apps", _, "versions"]) => Some("asc.versions"),
        ("GET", ["asc", "apps", _, "metadata"]) => Some("asc.metadata.get"),
        ("PATCH", ["asc", "apps", _, "metadata"]) => Some("asc.metadata.patch"),
        ("GET", ["asc", "apps", _, "screenshots"]) => Some("asc.screenshots.get"),
        ("POST", ["asc", "apps", _, "screenshots"]) => Some("asc.screenshots.post"),
        ("GET", ["asc", "apps", _]) => Some("asc.app"),
        _ => None,
    }
}

/// Third path segment for `/api/<group>/<id>/...`, already decoded.
pub(super) fn seg(path: &str, index: usize) -> Option<String> {
    let rest = path.strip_prefix("/api/")?;
    rest.split('/').filter(|s| !s.is_empty()).nth(index).map(str::to_string)
}

pub(super) fn text_404() -> Response {
    Response::text(404, "404 Not Found")
}

pub(super) fn err(status: u16, msg: &str) -> Response {
    json_res(status, &json::obj([("error", json::s(msg))]))
}

pub(super) fn json_res(status: u16, v: &Json) -> Response {
    Response::json(status, &json::stringify(v))
}

pub(super) fn obj(pairs: Vec<(&str, Json)>) -> Json {
    let mut map = BTreeMap::new();
    for (k, v) in pairs {
        map.insert(k.to_string(), v);
    }
    Json::Obj(map)
}

/// `Date.toISOString()` for the current UTC time, millisecond precision.
pub(super) fn iso_now() -> String {
    let ms = crate::config::now_ms().max(0) as u64;
    let secs = ms / 1000;
    let millis = ms % 1000;
    let days = (secs / 86_400) as i64;
    let tod = secs % 86_400;
    let (y, m, d) = civil_from_days(days);
    let hh = tod / 3600;
    let mm = (tod % 3600) / 60;
    let ss = tod % 60;
    format!("{y:04}-{m:02}-{d:02}T{hh:02}:{mm:02}:{ss:02}.{millis:03}Z")
}

/// Days since 1970-01-01 to a civil date. Howard Hinnant's `civil_from_days`.
fn civil_from_days(mut z: i64) -> (i32, u32, u32) {
    z += 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y as i32, m as u32, d as u32)
}

/// Identifier safe to interpolate into a path or a `WHERE` bound value.
pub(super) fn safe_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

pub(super) fn query(
    state: &AppState,
    sql: &str,
    params: &[Value],
) -> Result<Vec<db::Row>, db::DbError> {
    state.pool.with(|db| db.query(sql, params))
}

pub(super) fn exec(
    state: &AppState,
    sql: &str,
    params: &[Value],
) -> Result<db::Changes, db::DbError> {
    state.pool.with(|db| db.run(sql, params))
}

pub(super) fn db_fail(state: &AppState, context: &str, public: &str, e: &db::DbError) -> Response {
    state
        .log
        .error(context, &[("error", json::s(e.to_string()))]);
    err(500, public)
}

pub(super) fn t(s: &str) -> Value {
    Value::Text(s.to_string())
}

pub(super) fn body_json(req: &Request) -> Result<Json, Response> {
    json::parse(&req.body).map_err(|_| err(400, "Invalid request body"))
}

pub(super) fn str_field<'a>(v: &'a Json, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Json::as_str).filter(|s| !s.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn literal_paths_win_over_parameters() {
        assert_eq!(
            route_label("GET", "/api/templates/fonts"),
            Some("fonts.list")
        );
        assert_eq!(
            route_label("GET", "/api/templates/fonts/abc/file"),
            Some("fonts.file")
        );
        assert_eq!(
            route_label("DELETE", "/api/templates/fonts/abc"),
            Some("fonts.delete")
        );
        assert_eq!(
            route_label("DELETE", "/api/templates/abc"),
            Some("templates.delete")
        );
        assert_eq!(
            route_label("GET", "/api/metadata-history/snapshot/abc"),
            Some("history.one")
        );
        assert_eq!(
            route_label("GET", "/api/metadata-history/abc"),
            Some("history.list")
        );
        assert_eq!(
            route_label("GET", "/api/exports/pkg/download"),
            Some("exports.download")
        );
        assert_eq!(
            route_label("GET", "/api/exports/pkg/files/file"),
            Some("exports.file")
        );
        assert_eq!(route_label("GET", "/api/exports/pkg"), Some("exports.one"));
        assert_eq!(
            route_label("POST", "/api/asc/screenshots/capture"),
            Some("asc.capture")
        );
        assert_eq!(
            route_label("POST", "/api/asc/apps/1/screenshots"),
            Some("asc.screenshots.post")
        );
        assert_eq!(
            route_label("GET", "/api/asc/apps/1/versions"),
            Some("asc.versions")
        );
        assert_eq!(route_label("GET", "/api/asc/apps/1"), Some("asc.app"));
        assert_eq!(route_label("GET", "/api/asc/apps"), Some("asc.apps"));
        assert_eq!(route_label("GET", "/api/asc/analytics/metrics"), Some("asc.metrics"));
    }

    #[test]
    fn epoch_formats_as_iso() {
        // civil_from_days(0) is 1970-01-01. Guard the algorithm, not the clock.
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(1), (1970, 1, 2));
    }
}
