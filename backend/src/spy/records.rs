//! Templates, fonts, metadata history, and export packages.
//!
//! Every read, update, and delete is filtered on the caller's user id.

use std::fs;
use std::path::Path;

use super::multipart::{self, Part};
use super::zipstore;
use super::{db_fail, err, exec, iso_now, json_res, obj, query, safe_id, seg, str_field, t};
use crate::crypto;
use crate::db::Row;
use crate::http::{Request, Response};
use crate::json::{self, Json};
use crate::state::AppState;

/// List templates for `appId`, newest first.
pub fn list_templates(state: &AppState, req: &Request, user_id: &str) -> Response {
    let Some(app_id) = req.query_param("appId").filter(|s| !s.is_empty()) else {
        return err(400, "appId query parameter required");
    };
    match query(
        state,
        "SELECT * FROM templates WHERE user_id = ? AND app_id = ? ORDER BY updated_at DESC",
        &[t(user_id), t(&app_id)],
    ) {
        Ok(rows) => json_res(200, &Json::Arr(rows.iter().map(template_json).collect())),
        Err(e) => db_fail(state, "Failed to list templates", "Failed to list templates", &e),
    }
}

/// Insert a template owned by the caller.
pub fn create_template(state: &AppState, req: &Request, user_id: &str) -> Response {
    let body = match super::body_json(req) {
        Ok(v) => v,
        Err(res) => return res,
    };
    let Some(name) = str_field(&body, "name") else {
        return err(400, "name, appId, and settings are required");
    };
    let Some(app_id) = str_field(&body, "appId") else {
        return err(400, "name, appId, and settings are required");
    };
    let Some(settings) = body.get("settings").filter(|v| !matches!(v, Json::Null)) else {
        return err(400, "name, appId, and settings are required");
    };
    let id = match crypto::random_uuid_v4() {
        Ok(id) => id,
        Err(_) => return err(500, "Failed to create template"),
    };
    let now = iso_now();
    let settings_json = json::stringify(settings);
    if let Err(e) = exec(
        state,
        "INSERT INTO templates (id, user_id, app_id, name, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        &[t(&id), t(user_id), t(app_id), t(name), t(&settings_json), t(&now), t(&now)],
    ) {
        return db_fail(state, "Failed to create template", "Failed to create template", &e);
    }
    json_res(
        201,
        &obj(vec![
            ("id", json::s(&id)),
            ("app_id", json::s(app_id)),
            ("name", json::s(name)),
            ("settings", settings.clone()),
            ("created_at", json::s(&now)),
            ("updated_at", json::s(&now)),
        ]),
    )
}

/// Replace the name and settings of a template the caller owns.
pub fn update_template(state: &AppState, req: &Request, user_id: &str) -> Response {
    let Some(id) = seg(&req.path, 1).filter(|id| safe_id(id)) else {
        return err(400, "Invalid template id");
    };
    let body = match super::body_json(req) {
        Ok(v) => v,
        Err(res) => return res,
    };
    let rows = match query(
        state,
        "SELECT * FROM templates WHERE id = ? AND user_id = ?",
        &[t(&id), t(user_id)],
    ) {
        Ok(rows) => rows,
        Err(e) => return db_fail(state, "Failed to update template", "Failed to update template", &e),
    };
    let Some(existing) = rows.first() else {
        return err(404, "Template not found");
    };
    let name = str_field(&body, "name").unwrap_or_else(|| existing.text("name").unwrap_or(""));
    let settings = match body.get("settings") {
        Some(v) if !matches!(v, Json::Null) => json::stringify(v),
        _ => existing.text("settings").unwrap_or("{}").to_string(),
    };
    let now = iso_now();
    if let Err(e) = exec(
        state,
        "UPDATE templates SET name = ?, settings = ?, updated_at = ? WHERE id = ? AND user_id = ?",
        &[t(name), t(&settings), t(&now), t(&id), t(user_id)],
    ) {
        return db_fail(state, "Failed to update template", "Failed to update template", &e);
    }
    let parsed = json::parse(settings.as_bytes()).unwrap_or(Json::Null);
    json_res(
        200,
        &obj(vec![
            ("id", json::s(&id)),
            ("app_id", json::s(existing.text("app_id").unwrap_or(""))),
            ("name", json::s(name)),
            ("settings", parsed),
            ("created_at", json::s(existing.text("created_at").unwrap_or(""))),
            ("updated_at", json::s(&now)),
        ]),
    )
}

/// Delete a template the caller owns.
pub fn delete_template(state: &AppState, req: &Request, user_id: &str) -> Response {
    let Some(id) = seg(&req.path, 1).filter(|id| safe_id(id)) else {
        return err(400, "Invalid template id");
    };
    match exec(
        state,
        "DELETE FROM templates WHERE id = ? AND user_id = ?",
        &[t(&id), t(user_id)],
    ) {
        Ok(ch) if ch.changes == 0 => err(404, "Template not found"),
        Ok(_) => json_res(200, &obj(vec![("success", Json::Bool(true))])),
        Err(e) => db_fail(state, "Failed to delete template", "Failed to delete template", &e),
    }
}

/// Copy a template the caller owns.
pub fn duplicate_template(state: &AppState, req: &Request, user_id: &str) -> Response {
    let Some(id) = seg(&req.path, 1).filter(|id| safe_id(id)) else {
        return err(400, "Invalid template id");
    };
    let rows = match query(
        state,
        "SELECT * FROM templates WHERE id = ? AND user_id = ?",
        &[t(&id), t(user_id)],
    ) {
        Ok(rows) => rows,
        Err(e) => return db_fail(state, "Failed to duplicate template", "Failed to duplicate template", &e),
    };
    let Some(existing) = rows.first() else {
        return err(404, "Template not found");
    };
    let new_id = match crypto::random_uuid_v4() {
        Ok(id) => id,
        Err(_) => return err(500, "Failed to duplicate template"),
    };
    let now = iso_now();
    let name = format!("{} (Copy)", existing.text("name").unwrap_or("Template"));
    let settings = existing.text("settings").unwrap_or("{}");
    if let Err(e) = exec(
        state,
        "INSERT INTO templates (id, user_id, app_id, name, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        &[
            t(&new_id),
            t(user_id),
            t(existing.text("app_id").unwrap_or("")),
            t(&name),
            t(settings),
            t(&now),
            t(&now),
        ],
    ) {
        return db_fail(state, "Failed to duplicate template", "Failed to duplicate template", &e);
    }
    json_res(
        201,
        &obj(vec![
            ("id", json::s(&new_id)),
            ("app_id", json::s(existing.text("app_id").unwrap_or(""))),
            ("name", json::s(&name)),
            ("settings", json::parse(settings.as_bytes()).unwrap_or(Json::Null)),
            ("created_at", json::s(&now)),
            ("updated_at", json::s(&now)),
        ]),
    )
}

/// List fonts uploaded by the caller.
pub fn list_fonts(state: &AppState, user_id: &str) -> Response {
    match query(
        state,
        "SELECT * FROM custom_fonts WHERE user_id = ? ORDER BY created_at DESC",
        &[t(user_id)],
    ) {
        Ok(rows) => json_res(200, &Json::Arr(rows.iter().map(font_json).collect())),
        Err(e) => db_fail(state, "Failed to list fonts", "Failed to list fonts", &e),
    }
}

/// Store a TTF or OTF for the caller.
pub fn upload_font(state: &AppState, req: &Request, user_id: &str) -> Response {
    let Some(ctype) = req.header("content-type") else {
        return err(400, "Font file is required");
    };
    let Some(parts) = multipart::parse(ctype, &req.body) else {
        return err(400, "Font file is required");
    };
    let Some(file) = parts.iter().find(|p| p.name == "file" && p.filename.is_some()) else {
        return err(400, "Font file is required");
    };
    let filename = file.filename.as_deref().unwrap_or("font.ttf");
    let ext = filename.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    if ext != "ttf" && ext != "otf" {
        return err(400, "Only TTF and OTF files are supported");
    }
    if !safe_id(user_id) {
        return err(400, "Invalid user");
    }
    let id = match crypto::random_uuid_v4() {
        Ok(id) => id,
        Err(_) => return err(500, "Failed to upload font"),
    };
    let stored = format!("{id}.{ext}");
    let dir = state.root.join("fonts").join(user_id);
    if let Err(e) = fs::create_dir_all(&dir) {
        state.log.error("Failed to upload font", &[("error", json::s(e.to_string()))]);
        return err(500, "Failed to upload font");
    }
    if let Err(e) = fs::write(dir.join(&stored), &file.body) {
        state.log.error("Failed to upload font", &[("error", json::s(e.to_string()))]);
        return err(500, "Failed to upload font");
    }
    let name = filename.rsplit_once('.').map(|(n, _)| n).unwrap_or(filename);
    let now = iso_now();
    if let Err(e) = exec(
        state,
        "INSERT INTO custom_fonts (id, user_id, name, filename, created_at) VALUES (?, ?, ?, ?, ?)",
        &[t(&id), t(user_id), t(name), t(&stored), t(&now)],
    ) {
        return db_fail(state, "Failed to upload font", "Failed to upload font", &e);
    }
    json_res(
        201,
        &obj(vec![
            ("id", json::s(&id)),
            ("name", json::s(name)),
            ("filename", json::s(&stored)),
            ("created_at", json::s(&now)),
        ]),
    )
}

/// Serve a font file the caller owns.
pub fn font_file(state: &AppState, req: &Request, user_id: &str) -> Response {
    let Some(id) = seg(&req.path, 2).filter(|id| safe_id(id)) else {
        return err(400, "Invalid font id");
    };
    let rows = match query(
        state,
        "SELECT * FROM custom_fonts WHERE id = ? AND user_id = ?",
        &[t(&id), t(user_id)],
    ) {
        Ok(rows) => rows,
        Err(e) => return db_fail(state, "Failed to serve font file", "Failed to serve font file", &e),
    };
    let Some(row) = rows.first() else {
        return err(404, "Font not found");
    };
    let filename = row.text("filename").unwrap_or("");
    if !safe_filename(filename) {
        return err(404, "Font file missing");
    }
    let path = state.root.join("fonts").join(user_id).join(filename);
    let bytes = match fs::read(&path) {
        Ok(b) => b,
        Err(_) => return err(404, "Font file missing"),
    };
    let ext = filename.rsplit('.').next().unwrap_or("");
    let ctype = if ext.eq_ignore_ascii_case("otf") { "font/otf" } else { "font/ttf" };
    Response::bytes(200, ctype, bytes).header("Cache-Control", "public, max-age=31536000")
}

/// Delete a font the caller owns, including the file.
pub fn delete_font(state: &AppState, req: &Request, user_id: &str) -> Response {
    let Some(id) = seg(&req.path, 2).filter(|id| safe_id(id)) else {
        return err(400, "Invalid font id");
    };
    let rows = match query(
        state,
        "SELECT filename FROM custom_fonts WHERE id = ? AND user_id = ?",
        &[t(&id), t(user_id)],
    ) {
        Ok(rows) => rows,
        Err(e) => return db_fail(state, "Failed to delete font", "Failed to delete font", &e),
    };
    let Some(row) = rows.first() else {
        return err(404, "Font not found");
    };
    if let Some(filename) = row.text("filename") {
        if safe_filename(filename) {
            let _ = fs::remove_file(state.root.join("fonts").join(user_id).join(filename));
        }
    }
    if let Err(e) = exec(
        state,
        "DELETE FROM custom_fonts WHERE id = ? AND user_id = ?",
        &[t(&id), t(user_id)],
    ) {
        return db_fail(state, "Failed to delete font", "Failed to delete font", &e);
    }
    json_res(200, &obj(vec![("success", Json::Bool(true))]))
}

/// Newest 50 metadata snapshots for an app the caller has saved.
pub fn list_history(state: &AppState, req: &Request, user_id: &str) -> Response {
    let Some(app_id) = seg(&req.path, 1).filter(|id| safe_id(id)) else {
        return err(400, "Invalid app id");
    };
    match query(
        state,
        "SELECT * FROM metadata_history WHERE user_id = ? AND app_id = ? ORDER BY saved_at DESC LIMIT 50",
        &[t(user_id), t(&app_id)],
    ) {
        Ok(rows) => json_res(200, &Json::Arr(rows.iter().map(history_json).collect())),
        Err(e) => db_fail(state, "metadata-history list error", "Failed to list metadata history", &e),
    }
}

/// Save a metadata snapshot for the caller.
pub fn create_history(state: &AppState, req: &Request, user_id: &str) -> Response {
    let body = match super::body_json(req) {
        Ok(v) => v,
        Err(res) => return res,
    };
    let Some(app_id) = str_field(&body, "appId") else {
        return err(400, "appId, locale, and metadata are required");
    };
    let Some(locale) = str_field(&body, "locale") else {
        return err(400, "appId, locale, and metadata are required");
    };
    let Some(metadata) = json_string(&body, "metadata") else {
        return err(400, "appId, locale, and metadata are required");
    };
    if !safe_id(app_id) {
        return err(400, "Invalid app id");
    }
    let id = match crypto::random_uuid_v4() {
        Ok(id) => id,
        Err(_) => return err(500, "Failed to save metadata history"),
    };
    let now = iso_now();
    if let Err(e) = exec(
        state,
        "INSERT INTO metadata_history (id, user_id, app_id, locale, metadata, saved_at) VALUES (?, ?, ?, ?, ?, ?)",
        &[t(&id), t(user_id), t(app_id), t(locale), t(&metadata), t(&now)],
    ) {
        return db_fail(state, "metadata-history create error", "Failed to save metadata history", &e);
    }
    json_res(
        201,
        &obj(vec![
            ("id", json::s(&id)),
            ("app_id", json::s(app_id)),
            ("locale", json::s(locale)),
            ("metadata", json::s(&metadata)),
            ("saved_at", json::s(&now)),
        ]),
    )
}

/// One snapshot, only if the caller saved it.
pub fn get_history(state: &AppState, req: &Request, user_id: &str) -> Response {
    let Some(id) = seg(&req.path, 2).filter(|id| safe_id(id)) else {
        return err(400, "Invalid snapshot id");
    };
    match query(
        state,
        "SELECT * FROM metadata_history WHERE id = ? AND user_id = ?",
        &[t(&id), t(user_id)],
    ) {
        Ok(rows) => match rows.first() {
            Some(row) => json_res(200, &history_json(row)),
            None => err(404, "Snapshot not found"),
        },
        Err(e) => db_fail(state, "metadata-history get snapshot error", "Failed to load snapshot", &e),
    }
}

/// Delete a snapshot the caller owns.
pub fn delete_history(state: &AppState, req: &Request, user_id: &str) -> Response {
    let Some(id) = seg(&req.path, 2).filter(|id| safe_id(id)) else {
        return err(400, "Invalid snapshot id");
    };
    match exec(
        state,
        "DELETE FROM metadata_history WHERE id = ? AND user_id = ?",
        &[t(&id), t(user_id)],
    ) {
        Ok(ch) if ch.changes == 0 => err(404, "Snapshot not found"),
        Ok(_) => json_res(200, &obj(vec![("success", Json::Bool(true))])),
        Err(e) => db_fail(state, "metadata-history delete error", "Failed to delete snapshot", &e),
    }
}

/// List export packages for an app.
pub fn list_exports(state: &AppState, req: &Request, user_id: &str) -> Response {
    let Some(app_id) = req.query_param("appId").filter(|s| !s.is_empty()) else {
        return err(400, "appId query parameter required");
    };
    match query(
        state,
        "SELECT * FROM export_packages WHERE user_id = ? AND app_id = ? ORDER BY created_at DESC",
        &[t(user_id), t(&app_id)],
    ) {
        Ok(rows) => json_res(200, &Json::Arr(rows.iter().map(package_json).collect())),
        Err(e) => db_fail(state, "GET /exports failed", "Failed to list export packages", &e),
    }
}

/// Store an export package and its screenshot parts.
pub fn create_export(state: &AppState, req: &Request, user_id: &str) -> Response {
    if !safe_id(user_id) {
        return err(400, "Invalid user");
    }
    let Some(ctype) = req.header("content-type") else {
        return err(400, "appId, appName, locales, and devices are required");
    };
    let Some(parts) = multipart::parse(ctype, &req.body) else {
        return err(400, "appId, appName, locales, and devices are required");
    };
    let Some(app_id) = part_text(&parts, "appId") else {
        return err(400, "appId, appName, locales, and devices are required");
    };
    let Some(app_name) = part_text(&parts, "appName") else {
        return err(400, "appId, appName, locales, and devices are required");
    };
    let Some(locales_raw) = part_text(&parts, "locales") else {
        return err(400, "appId, appName, locales, and devices are required");
    };
    let Some(devices_raw) = part_text(&parts, "devices") else {
        return err(400, "appId, appName, locales, and devices are required");
    };
    let locales = match json::parse(locales_raw.as_bytes()).and_then(|v| match v {
        Json::Arr(a) => Ok(a),
        _ => Err(crate::json::ParseError { at: 0, msg: "not an array" }),
    }) {
        Ok(a) => a,
        Err(_) => return err(400, "locales and devices must be valid JSON arrays"),
    };
    let devices = match json::parse(devices_raw.as_bytes()) {
        Ok(Json::Arr(a)) => a,
        _ => return err(400, "locales and devices must be valid JSON arrays"),
    };
    let locale_names: Vec<String> = locales.iter().filter_map(|v| v.as_str().map(str::to_string)).collect();
    let id = match crypto::random_uuid_v4() {
        Ok(id) => id,
        Err(_) => return err(500, "Failed to create export package"),
    };
    let now = iso_now();
    let package_dir = state.root.join("exports").join(user_id).join(&id);
    if let Err(e) = fs::create_dir_all(&package_dir) {
        state.log.error("POST /exports failed", &[("error", json::s(e.to_string()))]);
        return err(500, "Failed to create export package");
    }
    let mut saved = 0i64;
    for part in parts.iter().filter(|p| p.name.starts_with("file-")) {
        if part.body.is_empty() {
            continue;
        }
        let key = &part.name[5..];
        let Some((locale, device)) = split_locale_device(key, &locale_names) else {
            continue;
        };
        if !safe_id(&locale) || !safe_id(&device) {
            continue;
        }
        let locale_dir = package_dir.join(&locale);
        if fs::create_dir_all(&locale_dir).is_err() {
            continue;
        }
        let filename = format!("screenshot-{device}.png");
        let rel = format!("exports/{user_id}/{id}/{locale}/{filename}");
        if fs::write(locale_dir.join(&filename), &part.body).is_err() {
            continue;
        }
        let file_id = crypto::random_uuid_v4().unwrap_or_else(|_| format!("file-{saved}"));
        let _ = exec(
            state,
            "INSERT INTO export_files (id, user_id, package_id, locale, device, filename, file_path) VALUES (?, ?, ?, ?, ?, ?, ?)",
            &[t(&file_id), t(user_id), t(&id), t(&locale), t(&device), t(&filename), t(&rel)],
        );
        saved += 1;
    }
    let count_text = part_text(&parts, "screenshotCount").unwrap_or_default();
    let count = count_text.parse::<i64>().unwrap_or(saved);
    let metadata = part_text(&parts, "metadata");
    if let Err(e) = exec(
        state,
        "INSERT INTO export_packages (id, user_id, app_id, app_name, locales, devices, screenshot_count, metadata, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        &[
            t(&id),
            t(user_id),
            t(&app_id),
            t(&app_name),
            t(&locales_raw),
            t(&devices_raw),
            crate::db::Value::Int(count),
            metadata.as_ref().map(|m| t(m)).unwrap_or(crate::db::Value::Null),
            t("ready"),
            t(&now),
        ],
    ) {
        let _ = fs::remove_dir_all(&package_dir);
        return db_fail(state, "POST /exports failed", "Failed to create export package", &e);
    }
    let _ = devices;
    json_res(
        201,
        &obj(vec![
            ("id", json::s(&id)),
            ("app_id", json::s(&app_id)),
            ("app_name", json::s(&app_name)),
            ("locales", Json::Arr(locales)),
            ("devices", json::parse(devices_raw.as_bytes()).unwrap_or(Json::Arr(vec![]))),
            ("screenshot_count", json::i(count)),
            ("metadata", metadata.and_then(|m| json::parse(m.as_bytes()).ok()).unwrap_or(Json::Null)),
            ("status", json::s("ready")),
            ("created_at", json::s(&now)),
        ]),
    )
}

/// Package plus its files, scoped to the caller.
pub fn get_export(state: &AppState, req: &Request, user_id: &str) -> Response {
    let Some(id) = seg(&req.path, 1).filter(|id| safe_id(id)) else {
        return err(400, "Invalid export id");
    };
    let rows = match query(
        state,
        "SELECT * FROM export_packages WHERE id = ? AND user_id = ?",
        &[t(&id), t(user_id)],
    ) {
        Ok(rows) => rows,
        Err(e) => return db_fail(state, "GET /exports/:id failed", "Failed to retrieve export package", &e),
    };
    let Some(pkg) = rows.first() else {
        return err(404, "Export package not found");
    };
    let files = match query(
        state,
        "SELECT * FROM export_files WHERE package_id = ? AND user_id = ?",
        &[t(&id), t(user_id)],
    ) {
        Ok(rows) => rows,
        Err(e) => return db_fail(state, "GET /exports/:id failed", "Failed to retrieve export package", &e),
    };
    json_res(
        200,
        &obj(vec![
            ("package", package_json(pkg)),
            ("files", Json::Arr(files.iter().map(file_json).collect())),
        ]),
    )
}

/// Delete a package, its file rows, and its directory.
pub fn delete_export(state: &AppState, req: &Request, user_id: &str) -> Response {
    let Some(id) = seg(&req.path, 1).filter(|id| safe_id(id)) else {
        return err(400, "Invalid export id");
    };
    match exec(
        state,
        "DELETE FROM export_packages WHERE id = ? AND user_id = ?",
        &[t(&id), t(user_id)],
    ) {
        Ok(ch) if ch.changes == 0 => return err(404, "Export package not found"),
        Ok(_) => {}
        Err(e) => return db_fail(state, "DELETE /exports/:id failed", "Failed to delete export package", &e),
    }
    let _ = exec(
        state,
        "DELETE FROM export_files WHERE package_id = ? AND user_id = ?",
        &[t(&id), t(user_id)],
    );
    let _ = fs::remove_dir_all(state.root.join("exports").join(user_id).join(&id));
    json_res(200, &obj(vec![("success", Json::Bool(true))]))
}

/// ZIP the caller's package directory.
pub fn download_export(state: &AppState, req: &Request, user_id: &str) -> Response {
    let Some(id) = seg(&req.path, 1).filter(|id| safe_id(id)) else {
        return err(400, "Invalid export id");
    };
    let rows = match query(
        state,
        "SELECT app_name FROM export_packages WHERE id = ? AND user_id = ?",
        &[t(&id), t(user_id)],
    ) {
        Ok(rows) => rows,
        Err(e) => return db_fail(state, "GET /exports/:id/download failed", "Failed to generate export zip", &e),
    };
    let Some(row) = rows.first() else {
        return err(404, "Export package not found");
    };
    let dir = state.root.join("exports").join(user_id).join(&id);
    if !dir.is_dir() {
        return err(404, "Export files not found");
    }
    let mut owned: Vec<(String, Vec<u8>)> = Vec::new();
    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return err(500, "Failed to generate export zip"),
    };
    for entry in entries.flatten() {
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let locale = entry.file_name();
        let locale = locale.to_string_lossy();
        if !safe_id(&locale) {
            continue;
        }
        let files = match fs::read_dir(entry.path()) {
            Ok(f) => f,
            Err(_) => continue,
        };
        for file in files.flatten() {
            let name = file.file_name();
            let name = name.to_string_lossy();
            if !safe_filename(&name) {
                continue;
            }
            if let Ok(bytes) = fs::read(file.path()) {
                owned.push((format!("{locale}/{name}"), bytes));
            }
        }
    }
    let refs: Vec<(&str, &[u8])> = owned.iter().map(|(n, b)| (n.as_str(), b.as_slice())).collect();
    let zip = zipstore::zip_store(&refs);
    let app_name = row.text("app_name").unwrap_or("export");
    let safe: String = app_name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    Response::bytes(200, "application/zip", zip).header(
        "Content-Disposition",
        &format!("attachment; filename=\"{safe}-export.zip\""),
    )
}

/// One screenshot, only from a package the caller owns.
pub fn export_file(state: &AppState, req: &Request, user_id: &str) -> Response {
    let Some(package_id) = seg(&req.path, 1).filter(|id| safe_id(id)) else {
        return err(400, "Invalid export id");
    };
    let Some(file_id) = seg(&req.path, 3).filter(|id| safe_id(id)) else {
        return err(400, "Invalid file id");
    };
    let rows = match query(
        state,
        "SELECT file_path FROM export_files WHERE id = ? AND package_id = ? AND user_id = ?",
        &[t(&file_id), t(&package_id), t(user_id)],
    ) {
        Ok(rows) => rows,
        Err(e) => return db_fail(state, "GET export file failed", "Failed to read export file", &e),
    };
    let Some(row) = rows.first() else {
        return err(404, "File not found");
    };
    let Some(path) = contained(&state.root, row.text("file_path").unwrap_or("")) else {
        return err(404, "File missing from disk");
    };
    match fs::read(&path) {
        Ok(bytes) => Response::bytes(200, "image/png", bytes).header("Cache-Control", "public, max-age=31536000"),
        Err(_) => err(404, "File missing from disk"),
    }
}

fn template_json(row: &Row) -> Json {
    let settings = row.text("settings").unwrap_or("{}");
    obj(vec![
        ("id", json::s(row.text("id").unwrap_or(""))),
        ("app_id", json::s(row.text("app_id").unwrap_or(""))),
        ("name", json::s(row.text("name").unwrap_or(""))),
        ("settings", json::parse(settings.as_bytes()).unwrap_or(Json::Null)),
        ("created_at", json::s(row.text("created_at").unwrap_or(""))),
        ("updated_at", json::s(row.text("updated_at").unwrap_or(""))),
    ])
}

fn font_json(row: &Row) -> Json {
    obj(vec![
        ("id", json::s(row.text("id").unwrap_or(""))),
        ("name", json::s(row.text("name").unwrap_or(""))),
        ("filename", json::s(row.text("filename").unwrap_or(""))),
        ("created_at", json::s(row.text("created_at").unwrap_or(""))),
    ])
}

fn history_json(row: &Row) -> Json {
    obj(vec![
        ("id", json::s(row.text("id").unwrap_or(""))),
        ("app_id", json::s(row.text("app_id").unwrap_or(""))),
        ("locale", json::s(row.text("locale").unwrap_or(""))),
        ("metadata", json::s(row.text("metadata").unwrap_or(""))),
        ("saved_at", json::s(row.text("saved_at").unwrap_or(""))),
    ])
}

fn package_json(row: &Row) -> Json {
    let locales = row.text("locales").unwrap_or("[]");
    let devices = row.text("devices").unwrap_or("[]");
    let metadata = row.text("metadata").filter(|s| !s.is_empty());
    obj(vec![
        ("id", json::s(row.text("id").unwrap_or(""))),
        ("app_id", json::s(row.text("app_id").unwrap_or(""))),
        ("app_name", json::s(row.text("app_name").unwrap_or(""))),
        ("locales", json::parse(locales.as_bytes()).unwrap_or(Json::Arr(vec![]))),
        ("devices", json::parse(devices.as_bytes()).unwrap_or(Json::Arr(vec![]))),
        ("screenshot_count", json::i(row.int("screenshot_count").unwrap_or(0))),
        (
            "metadata",
            metadata
                .and_then(|m| json::parse(m.as_bytes()).ok())
                .unwrap_or(Json::Null),
        ),
        ("status", json::s(row.text("status").unwrap_or("ready"))),
        ("created_at", json::s(row.text("created_at").unwrap_or(""))),
    ])
}

fn file_json(row: &Row) -> Json {
    obj(vec![
        ("id", json::s(row.text("id").unwrap_or(""))),
        ("package_id", json::s(row.text("package_id").unwrap_or(""))),
        ("locale", json::s(row.text("locale").unwrap_or(""))),
        ("device", json::s(row.text("device").unwrap_or(""))),
        ("filename", json::s(row.text("filename").unwrap_or(""))),
        ("file_path", json::s(row.text("file_path").unwrap_or(""))),
    ])
}

fn json_string(body: &Json, key: &str) -> Option<String> {
    match body.get(key)? {
        Json::Null => None,
        Json::Str(s) if s.is_empty() => None,
        Json::Str(s) => Some(s.clone()),
        other => Some(json::stringify(other)),
    }
}

fn part_text(parts: &[Part], name: &str) -> Option<String> {
    parts
        .iter()
        .find(|p| p.name == name)
        .and_then(|p| std::str::from_utf8(&p.body).ok())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn split_locale_device(key: &str, locales: &[String]) -> Option<(String, String)> {
    for locale in locales {
        if let Some(device) = key.strip_prefix(&format!("{locale}-")) {
            if !device.is_empty() {
                return Some((locale.clone(), device.to_string()));
            }
        }
    }
    None
}

fn safe_filename(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 180
        && !name.contains('/')
        && !name.contains('\\')
        && name != "."
        && name != ".."
        && !name.contains('\0')
}

fn contained(root: &Path, rel: &str) -> Option<std::path::PathBuf> {
    if rel.is_empty() || rel.contains("..") || rel.starts_with('/') {
        return None;
    }
    let path = root.join(rel);
    let root = root.canonicalize().ok()?;
    let path = path.canonicalize().ok()?;
    path.starts_with(root).then_some(path)
}

