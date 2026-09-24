//! `POST /api/icons/resize` — 1024 PNG to the iOS icon set, returned as a ZIP.

use super::multipart;
use super::pngimg;
use super::zipstore;
use super::err;
use crate::http::{Request, Response};
use crate::state::AppState;

/// iOS icon pixel sizes the Node resizer emitted.
const ICON_SIZES: [u32; 14] = [29, 40, 57, 58, 76, 80, 87, 114, 120, 152, 167, 171, 180, 1024];

/// Resize an uploaded 1024×1024 PNG into every [`ICON_SIZES`] entry.
pub fn resize(state: &AppState, req: &Request) -> Response {
    let Some(ctype) = req.header("content-type") else {
        return err(400, "No PNG file provided");
    };
    let Some(parts) = multipart::parse(ctype, &req.body) else {
        return err(400, "No PNG file provided");
    };
    let Some(file) = parts.iter().find(|p| p.name == "file") else {
        return err(400, "No PNG file provided");
    };
    let declared = file.content_type.as_deref().unwrap_or("");
    if !declared.is_empty() && declared != "image/png" && declared != "application/octet-stream" {
        return err(400, "File must be a PNG image");
    }
    let image = match pngimg::decode(&file.body) {
        Ok(img) => img,
        Err(e) => {
            state.log.error("Icon resize error", &[("error", crate::json::s(e))]);
            return err(400, "File must be a PNG image");
        }
    };
    if image.width != 1024 || image.height != 1024 {
        return err(
            400,
            &format!("Image must be 1024x1024. Got {}x{}", image.width, image.height),
        );
    }
    let mut files: Vec<(String, Vec<u8>)> = Vec::new();
    for size in ICON_SIZES {
        let rgba = pngimg::resize(&image.rgba, image.width, image.height, size, size);
        let png = match pngimg::encode(&rgba, size, size) {
            Ok(p) => p,
            Err(e) => {
                state.log.error("Icon resize error", &[("error", crate::json::s(e))]);
                return err(500, "Failed to resize icons");
            }
        };
        files.push((format!("icon-{size}x{size}.png"), png));
    }
    let refs: Vec<(&str, &[u8])> = files.iter().map(|(n, b)| (n.as_str(), b.as_slice())).collect();
    let zip = zipstore::zip_store(&refs);
    Response::bytes(200, "application/zip", zip)
        .header("Content-Disposition", "attachment; filename=\"app-icons.zip\"")
}
