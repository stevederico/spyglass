//! Stored (uncompressed) ZIP writer.
//!
//! PNG and font bytes are already compressed, so method 0 keeps the archive
//! free of a deflate implementation. Readers accept either method.

use super::pngimg::crc32;

/// Build a ZIP of `files` as `(path, bytes)`. Paths use `/` separators.
pub fn zip_store(files: &[(&str, &[u8])]) -> Vec<u8> {
    let mut locals = Vec::new();
    let mut central = Vec::new();
    let mut offset: u32 = 0;
    for (name, data) in files {
        let name_b = name.as_bytes();
        let crc = crc32(data);
        let size = data.len() as u32;
        let name_len = name_b.len() as u16;
        let mut local = Vec::new();
        local.extend_from_slice(&0x04034b50u32.to_le_bytes());
        local.extend_from_slice(&20u16.to_le_bytes());
        local.extend_from_slice(&0u16.to_le_bytes());
        local.extend_from_slice(&0u16.to_le_bytes());
        local.extend_from_slice(&0u16.to_le_bytes());
        local.extend_from_slice(&0u16.to_le_bytes());
        local.extend_from_slice(&crc.to_le_bytes());
        local.extend_from_slice(&size.to_le_bytes());
        local.extend_from_slice(&size.to_le_bytes());
        local.extend_from_slice(&name_len.to_le_bytes());
        local.extend_from_slice(&0u16.to_le_bytes());
        local.extend_from_slice(name_b);
        local.extend_from_slice(data);
        locals.extend_from_slice(&local);

        let mut cen = Vec::new();
        cen.extend_from_slice(&0x02014b50u32.to_le_bytes());
        cen.extend_from_slice(&20u16.to_le_bytes());
        cen.extend_from_slice(&20u16.to_le_bytes());
        cen.extend_from_slice(&0u16.to_le_bytes());
        cen.extend_from_slice(&0u16.to_le_bytes());
        cen.extend_from_slice(&0u16.to_le_bytes());
        cen.extend_from_slice(&0u16.to_le_bytes());
        cen.extend_from_slice(&crc.to_le_bytes());
        cen.extend_from_slice(&size.to_le_bytes());
        cen.extend_from_slice(&size.to_le_bytes());
        cen.extend_from_slice(&name_len.to_le_bytes());
        cen.extend_from_slice(&0u16.to_le_bytes());
        cen.extend_from_slice(&0u16.to_le_bytes());
        cen.extend_from_slice(&0u16.to_le_bytes());
        cen.extend_from_slice(&0u16.to_le_bytes());
        cen.extend_from_slice(&0u32.to_le_bytes());
        cen.extend_from_slice(&offset.to_le_bytes());
        cen.extend_from_slice(name_b);
        central.extend_from_slice(&cen);
        offset += local.len() as u32;
    }
    let central_start = offset;
    let mut out = locals;
    out.extend_from_slice(&central);
    let mut eocd = Vec::new();
    eocd.extend_from_slice(&0x06054b50u32.to_le_bytes());
    eocd.extend_from_slice(&0u16.to_le_bytes());
    eocd.extend_from_slice(&0u16.to_le_bytes());
    eocd.extend_from_slice(&(files.len() as u16).to_le_bytes());
    eocd.extend_from_slice(&(files.len() as u16).to_le_bytes());
    eocd.extend_from_slice(&(central.len() as u32).to_le_bytes());
    eocd.extend_from_slice(&central_start.to_le_bytes());
    eocd.extend_from_slice(&0u16.to_le_bytes());
    out.extend_from_slice(&eocd);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn archive_contains_the_stored_name_and_bytes() {
        let zip = zip_store(&[("en-US/shot.png", b"hello")]);
        assert!(zip.starts_with(&[0x50, 0x4b, 0x03, 0x04]));
        let text = String::from_utf8_lossy(&zip);
        assert!(text.contains("en-US/shot.png"));
        assert!(zip.windows(5).any(|w| w == b"hello"));
    }
}
