//! Minimal PNG decode, bilinear resize, and re-encode.
//!
//! Enough for the icon resizer: 8-bit non-interlaced gray, RGB, or RGBA.
//! Deflate goes through the system `libz` (pulled in by libcurl), not a crate.

use std::ffi::{c_int, c_ulong};

/// CRC-32 (ISO-HDLC) used by PNG chunks and ZIP local headers.
pub fn crc32(data: &[u8]) -> u32 {
    let mut c = 0xffff_ffffu32;
    for &b in data {
        c ^= u32::from(b);
        for _ in 0..8 {
            let mask = (c & 1).wrapping_neg();
            c = (c >> 1) ^ (0xEDB8_8320 & mask);
        }
    }
    !c
}

/// Decoded 8-bit RGBA image.
pub struct Image {
    /// Width in pixels.
    pub width: u32,
    /// Height in pixels.
    pub height: u32,
    /// Row-major RGBA, 4 bytes per pixel.
    pub rgba: Vec<u8>,
}

/// Decode a PNG into RGBA.
///
/// # Errors
/// A string describing why the file is not a supported PNG.
pub fn decode(bytes: &[u8]) -> Result<Image, String> {
    const SIG: &[u8] = &[137, 80, 78, 71, 13, 10, 26, 10];
    if bytes.len() < 8 || &bytes[..8] != SIG {
        return Err("not a PNG".into());
    }
    let mut i = 8;
    let mut width = 0u32;
    let mut height = 0u32;
    let mut color = 0u8;
    let mut idat = Vec::new();
    let mut saw_ihdr = false;
    while i + 12 <= bytes.len() {
        let len = u32::from_be_bytes(bytes[i..i + 4].try_into().unwrap()) as usize;
        let kind = &bytes[i + 4..i + 8];
        let data_end = i + 8 + len;
        if data_end + 4 > bytes.len() {
            return Err("truncated PNG chunk".into());
        }
        let data = &bytes[i + 8..data_end];
        if kind == b"IHDR" {
            if data.len() != 13 {
                return Err("bad IHDR".into());
            }
            width = u32::from_be_bytes(data[0..4].try_into().unwrap());
            height = u32::from_be_bytes(data[4..8].try_into().unwrap());
            if data[8] != 8 || data[10] != 0 || data[11] != 0 || data[12] != 0 {
                return Err("only 8-bit non-interlaced PNG is supported".into());
            }
            color = data[9];
            saw_ihdr = true;
        } else if kind == b"IDAT" {
            idat.extend_from_slice(data);
        } else if kind == b"IEND" {
            break;
        }
        i = data_end + 4;
    }
    if !saw_ihdr || width == 0 || height == 0 {
        return Err("PNG missing IHDR".into());
    }
    let bpp = match color {
        0 => 1,
        2 => 3,
        4 => 2,
        6 => 4,
        _ => return Err("unsupported PNG color type".into()),
    };
    let raw_len = height as usize * (1 + width as usize * bpp);
    let raw = inflate(&idat, raw_len)?;
    let pixels = unfilter(&raw, width as usize, height as usize, bpp)?;
    let rgba = to_rgba(&pixels, bpp);
    Ok(Image {
        width,
        height,
        rgba,
    })
}

/// Bilinear resize of an RGBA buffer.
pub fn resize(src: &[u8], sw: u32, sh: u32, dw: u32, dh: u32) -> Vec<u8> {
    if dw == 0 || dh == 0 {
        return Vec::new();
    }
    if dw == sw && dh == sh {
        return src.to_vec();
    }
    let mut out = vec![0u8; dw as usize * dh as usize * 4];
    for y in 0..dh {
        let fy = (y as f64 + 0.5) * (sh as f64 / dh as f64) - 0.5;
        let y0 = fy.floor().clamp(0.0, sh as f64 - 1.0) as u32;
        let y1 = (y0 + 1).min(sh - 1);
        let ty = (fy - y0 as f64).clamp(0.0, 1.0);
        for x in 0..dw {
            let fx = (x as f64 + 0.5) * (sw as f64 / dw as f64) - 0.5;
            let x0 = fx.floor().clamp(0.0, sw as f64 - 1.0) as u32;
            let x1 = (x0 + 1).min(sw - 1);
            let tx = (fx - x0 as f64).clamp(0.0, 1.0);
            let p00 = px(src, sw, x0, y0);
            let p10 = px(src, sw, x1, y0);
            let p01 = px(src, sw, x0, y1);
            let p11 = px(src, sw, x1, y1);
            let o = ((y * dw + x) * 4) as usize;
            for c in 0..4 {
                let a = f64::from(p00[c]) * (1.0 - tx) + f64::from(p10[c]) * tx;
                let b = f64::from(p01[c]) * (1.0 - tx) + f64::from(p11[c]) * tx;
                let v = a * (1.0 - ty) + b * ty;
                out[o + c] = v.round().clamp(0.0, 255.0) as u8;
            }
        }
    }
    out
}

/// Encode RGBA as a non-interlaced 8-bit PNG.
pub fn encode(rgba: &[u8], width: u32, height: u32) -> Result<Vec<u8>, String> {
    let stride = width as usize * 4;
    let mut raw = Vec::with_capacity(height as usize * (stride + 1));
    for y in 0..height as usize {
        raw.push(0);
        raw.extend_from_slice(&rgba[y * stride..(y + 1) * stride]);
    }
    let compressed = deflate(&raw)?;
    let mut ihdr = Vec::with_capacity(13);
    ihdr.extend_from_slice(&width.to_be_bytes());
    ihdr.extend_from_slice(&height.to_be_bytes());
    ihdr.extend_from_slice(&[8, 6, 0, 0, 0]);
    let mut out = vec![137, 80, 78, 71, 13, 10, 26, 10];
    push_chunk(&mut out, b"IHDR", &ihdr);
    push_chunk(&mut out, b"IDAT", &compressed);
    push_chunk(&mut out, b"IEND", &[]);
    Ok(out)
}

fn px(src: &[u8], sw: u32, x: u32, y: u32) -> [u8; 4] {
    let i = ((y * sw + x) * 4) as usize;
    [src[i], src[i + 1], src[i + 2], src[i + 3]]
}

fn push_chunk(out: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
    out.extend_from_slice(&(data.len() as u32).to_be_bytes());
    out.extend_from_slice(kind);
    out.extend_from_slice(data);
    let mut crc_in = kind.to_vec();
    crc_in.extend_from_slice(data);
    out.extend_from_slice(&crc32(&crc_in).to_be_bytes());
}

fn to_rgba(pixels: &[u8], bpp: usize) -> Vec<u8> {
    let count = pixels.len() / bpp;
    let mut rgba = Vec::with_capacity(count * 4);
    for i in 0..count {
        let p = &pixels[i * bpp..(i + 1) * bpp];
        match bpp {
            1 => rgba.extend_from_slice(&[p[0], p[0], p[0], 255]),
            2 => rgba.extend_from_slice(&[p[0], p[0], p[0], p[1]]),
            3 => rgba.extend_from_slice(&[p[0], p[1], p[2], 255]),
            _ => rgba.extend_from_slice(&[p[0], p[1], p[2], p[3]]),
        }
    }
    rgba
}

fn unfilter(raw: &[u8], width: usize, height: usize, bpp: usize) -> Result<Vec<u8>, String> {
    let stride = width * bpp;
    if raw.len() < height * (stride + 1) {
        return Err("PNG pixel data is short".into());
    }
    let mut out = vec![0u8; height * stride];
    for y in 0..height {
        let filter = raw[y * (stride + 1)];
        let src = &raw[y * (stride + 1) + 1..y * (stride + 1) + 1 + stride];
        for i in 0..stride {
            let left = if i >= bpp { out[y * stride + i - bpp] } else { 0 };
            let up = if y > 0 { out[(y - 1) * stride + i] } else { 0 };
            let ul = if y > 0 && i >= bpp {
                out[(y - 1) * stride + i - bpp]
            } else {
                0
            };
            let add = match filter {
                0 => 0,
                1 => left,
                2 => up,
                3 => ((u16::from(left) + u16::from(up)) / 2) as u8,
                4 => paeth(left, up, ul),
                _ => return Err("unknown PNG filter".into()),
            };
            out[y * stride + i] = src[i].wrapping_add(add);
        }
    }
    Ok(out)
}

fn paeth(a: u8, b: u8, c: u8) -> u8 {
    let a = i16::from(a);
    let b = i16::from(b);
    let c = i16::from(c);
    let p = a + b - c;
    let pa = (p - a).abs();
    let pb = (p - b).abs();
    let pc = (p - c).abs();
    if pa <= pb && pa <= pc {
        a as u8
    } else if pb <= pc {
        b as u8
    } else {
        c as u8
    }
}

#[link(name = "z")]
unsafe extern "C" {
    fn compress(dest: *mut u8, dest_len: *mut c_ulong, source: *const u8, source_len: c_ulong) -> c_int;
    fn uncompress(dest: *mut u8, dest_len: *mut c_ulong, source: *const u8, source_len: c_ulong) -> c_int;
}

fn deflate(src: &[u8]) -> Result<Vec<u8>, String> {
    let bound = src.len() + src.len() / 1000 + 64;
    let mut dest = vec![0u8; bound];
    let mut dest_len = bound as c_ulong;
    // SAFETY: dest and src are live writable/readable buffers for this call.
    // libz copies what it needs before returning.
    let rc = unsafe {
        compress(
            dest.as_mut_ptr(),
            &mut dest_len,
            src.as_ptr(),
            src.len() as c_ulong,
        )
    };
    if rc != 0 {
        return Err(format!("zlib compress failed ({rc})"));
    }
    dest.truncate(dest_len as usize);
    Ok(dest)
}

fn inflate(src: &[u8], expected: usize) -> Result<Vec<u8>, String> {
    let mut dest = vec![0u8; expected];
    let mut dest_len = expected as c_ulong;
    // SAFETY: dest is `expected` bytes and src is the IDAT concatenation.
    let rc = unsafe {
        uncompress(
            dest.as_mut_ptr(),
            &mut dest_len,
            src.as_ptr(),
            src.len() as c_ulong,
        )
    };
    if rc != 0 {
        return Err(format!("zlib uncompress failed ({rc})"));
    }
    if dest_len as usize != expected {
        return Err("PNG inflated to an unexpected size".into());
    }
    Ok(dest)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_one_red_pixel() {
        let png = encode(&[255, 0, 0, 255], 1, 1).unwrap();
        let img = decode(&png).unwrap();
        assert_eq!(img.width, 1);
        assert_eq!(img.rgba, vec![255, 0, 0, 255]);
    }

    #[test]
    fn resize_averages_a_two_pixel_row() {
        let src = [255, 0, 0, 255, 0, 0, 255, 255];
        let out = resize(&src, 2, 1, 1, 1);
        assert_eq!(out.len(), 4);
        assert!(out[0] > 100 && out[0] < 200);
        assert!(out[2] > 100 && out[2] < 200);
    }
}
