//! `multipart/form-data` parser for font, icon, and export uploads.
//!
//! Reads the boundary from `Content-Type` and splits the already-buffered body.
//! No streaming: the HTTP server caps the body before a handler runs.

/// One form part.
pub struct Part {
    /// `name` from `Content-Disposition`.
    pub name: String,
    /// `filename` when the part is a file.
    pub filename: Option<String>,
    /// Part `Content-Type`, if the client sent one.
    pub content_type: Option<String>,
    /// Raw part body, without the framing CRLF.
    pub body: Vec<u8>,
}

/// Parse `body` as multipart using the request `Content-Type`.
///
/// Returns `None` when the header is missing a boundary. A malformed body
/// returns an empty list rather than panicking.
pub fn parse(content_type: &str, body: &[u8]) -> Option<Vec<Part>> {
    let boundary = boundary(content_type)?;
    let marker = {
        let mut m = b"--".to_vec();
        m.extend_from_slice(boundary.as_bytes());
        m
    };
    let mut parts = Vec::new();
    let mut rest = body;
    // Drop the preamble through the first boundary.
    let Some(start) = find_sub(rest, &marker) else {
        return Some(parts);
    };
    rest = &rest[start + marker.len()..];
    if rest.starts_with(b"--") {
        return Some(parts);
    }
    if rest.starts_with(b"\r\n") {
        rest = &rest[2..];
    }
    loop {
        let Some(next) = find_sub(rest, &marker) else {
            break;
        };
        let chunk = &rest[..next];
        let chunk = chunk.strip_suffix(b"\r\n").unwrap_or(chunk);
        if let Some(part) = split_part(chunk) {
            parts.push(part);
        }
        rest = &rest[next + marker.len()..];
        if rest.starts_with(b"--") {
            break;
        }
        if rest.starts_with(b"\r\n") {
            rest = &rest[2..];
        }
    }
    Some(parts)
}

fn boundary(content_type: &str) -> Option<String> {
    for piece in content_type.split(';') {
        let piece = piece.trim();
        let Some(value) = piece.strip_prefix("boundary=") else {
            continue;
        };
        let value = value.trim().trim_matches('"');
        if value.is_empty() || value.len() > 200 || value.as_bytes().contains(&b'\0') {
            return None;
        }
        return Some(value.to_string());
    }
    None
}

fn split_part(chunk: &[u8]) -> Option<Part> {
    let sep = find_sub(chunk, b"\r\n\r\n")?;
    let header = std::str::from_utf8(&chunk[..sep]).ok()?;
    let body = chunk[sep + 4..].to_vec();
    let mut name = None;
    let mut filename = None;
    let mut content_type = None;
    for line in header.split("\r\n") {
        if let Some(rest) = strip_prefix_ci(line, "content-disposition:") {
            name = param(rest, "name");
            filename = param(rest, "filename");
        } else if let Some(rest) = strip_prefix_ci(line, "content-type:") {
            content_type = Some(rest.trim().to_string());
        }
    }
    Some(Part {
        name: name?,
        filename,
        content_type,
        body,
    })
}

fn strip_prefix_ci<'a>(line: &'a str, prefix: &str) -> Option<&'a str> {
    if line.len() >= prefix.len() && line[..prefix.len()].eq_ignore_ascii_case(prefix) {
        Some(&line[prefix.len()..])
    } else {
        None
    }
}

fn param(header: &str, key: &str) -> Option<String> {
    let needle = format!("{key}=");
    let idx = header.find(&needle)?;
    let rest = &header[idx + needle.len()..];
    if let Some(stripped) = rest.strip_prefix('"') {
        let end = stripped.find('"')?;
        Some(stripped[..end].to_string())
    } else {
        let end = rest.find(';').unwrap_or(rest.len());
        Some(rest[..end].trim().to_string())
    }
}

fn find_sub(hay: &[u8], needle: &[u8]) -> Option<usize> {
    hay.windows(needle.len()).position(|w| w == needle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_text_field_and_a_file() {
        let body = b"\
--bound\r\n\
Content-Disposition: form-data; name=\"appId\"\r\n\
\r\n\
app-1\r\n\
--bound\r\n\
Content-Disposition: form-data; name=\"file\"; filename=\"a.png\"\r\n\
Content-Type: image/png\r\n\
\r\n\
PNGDATA\r\n\
--bound--\r\n";
        let parts = parse("multipart/form-data; boundary=bound", body).unwrap();
        assert_eq!(parts.len(), 2);
        assert_eq!(parts[0].name, "appId");
        assert_eq!(parts[0].body, b"app-1");
        assert_eq!(parts[1].filename.as_deref(), Some("a.png"));
        assert_eq!(parts[1].body, b"PNGDATA");
    }
}
