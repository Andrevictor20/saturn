// Subtitle Parser & Universal Charset Decoder
// Inspired by Jellyfin's SubtitleEncoder & SubtitleEditParser architecture.
// Ensures legacy Windows-1252, ISO-8859-1, and UTF-16 subtitles are correctly decoded
// to UTF-8 without failing with HTTP 500 or corrupting accented Portuguese characters.

/// Decodes raw subtitle file bytes to a valid UTF-8 Rust `String`.
/// Automatically detects UTF-8 BOM, UTF-16 LE/BE, and falls back to Windows-1252
/// (CP1252 / ISO-8859-1), which is the standard for legacy subtitles in Romance languages.
pub fn decode_subtitle_bytes(bytes: &[u8]) -> String {
    if bytes.is_empty() {
        return String::new();
    }

    // 1. Check for UTF-8 Byte Order Mark (BOM: EF BB BF)
    if let Some(rest) = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        if let Ok(s) = std::str::from_utf8(rest) {
            return s.to_string();
        }
    }

    // 2. Check for UTF-16 Little Endian BOM (FF FE)
    if let Some(rest) = bytes.strip_prefix(&[0xFF, 0xFE]) {
        let u16_slice: Vec<u16> = rest
            .chunks_exact(2)
            .filter_map(|chunk| match chunk {
                &[b0, b1] => Some(u16::from_le_bytes([b0, b1])),
                _ => None,
            })
            .collect();
        return String::from_utf16_lossy(&u16_slice);
    }

    // 3. Check for UTF-16 Big Endian BOM (FE FF)
    if let Some(rest) = bytes.strip_prefix(&[0xFE, 0xFF]) {
        let u16_slice: Vec<u16> = rest
            .chunks_exact(2)
            .filter_map(|chunk| match chunk {
                &[b0, b1] => Some(u16::from_be_bytes([b0, b1])),
                _ => None,
            })
            .collect();
        return String::from_utf16_lossy(&u16_slice);
    }

    // 4. Try standard UTF-8 parsing
    if let Ok(valid_utf8) = std::str::from_utf8(bytes) {
        return valid_utf8.to_string();
    }

    // 5. Fallback: Decode as Windows-1252 (CP1252 / Western European)
    // In Windows-1252:
    // - 0x00..=0x7F are identical to ASCII.
    // - 0xA0..=0xFF map directly to Unicode code points U+00A0..=U+00FF.
    // - 0x80..=0x9F map to Windows-1252 specific typographic symbols.
    let mut decoded = String::with_capacity(bytes.len());
    for &b in bytes {
        match b {
            0x00..=0x7F => decoded.push(b as char),
            0x80 => decoded.push('€'),
            0x82 => decoded.push('‚'),
            0x83 => decoded.push('ƒ'),
            0x84 => decoded.push('„'),
            0x85 => decoded.push('…'),
            0x86 => decoded.push('†'),
            0x87 => decoded.push('‡'),
            0x88 => decoded.push('ˆ'),
            0x89 => decoded.push('‰'),
            0x8A => decoded.push('Š'),
            0x8B => decoded.push('‹'),
            0x8C => decoded.push('Œ'),
            0x8E => decoded.push('Ž'),
            0x91 => decoded.push('‘'),
            0x92 => decoded.push('’'),
            0x93 => decoded.push('“'),
            0x94 => decoded.push('”'),
            0x95 => decoded.push('•'),
            0x96 => decoded.push('–'),
            0x97 => decoded.push('—'),
            0x98 => decoded.push('˜'),
            0x99 => decoded.push('™'),
            0x9A => decoded.push('š'),
            0x9B => decoded.push('›'),
            0x9C => decoded.push('œ'),
            0x9E => decoded.push('ž'),
            0x9F => decoded.push('Ÿ'),
            _ => decoded.push(b as char), // 0xA0..=0xFF matches Unicode Latin-1 Supplement directly
        }
    }
    decoded
}

/// Strips ASS/SSA override tags like `{\an8}`, `{\c&H00FFFF&}` while preserving text content
/// and normalizing newline escapes (`\N`, `\n`) and hard spaces (`\h`).
pub fn strip_ass_tags(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut in_tag = false;
    for c in input.chars() {
        if c == '{' {
            in_tag = true;
        } else if c == '}' {
            in_tag = false;
        } else if !in_tag {
            out.push(c);
        }
    }
    out.replace("\\N", "\n")
        .replace("\\n", "\n")
        .replace("\\h", " ")
}

/// Converts ASS timestamp "0:01:23.45" to standard WebVTT "00:01:23.450".
pub fn ass_time_to_vtt(time: &str) -> String {
    let parts: Vec<&str> = time.split(':').collect();
    if parts.len() == 3 {
        let h: u32 = parts[0].parse().unwrap_or(0);
        let m: u32 = parts[1].parse().unwrap_or(0);
        let sec_parts: Vec<&str> = parts[2].split('.').collect();
        let s: u32 = sec_parts[0].parse().unwrap_or(0);
        let cs: u32 = sec_parts.get(1).and_then(|cs| cs.parse().ok()).unwrap_or(0);
        format!("{:02}:{:02}:{:02}.{:03}", h, m, s, cs * 10)
    } else {
        time.to_string()
    }
}

/// Converts SRT, ASS/SSA, and SBV subtitle formats into valid, clean WebVTT.
pub fn srt_or_ass_to_vtt(content: &str) -> String {
    let mut vtt = String::from("WEBVTT\n\n");
    let is_ass = content.lines().any(|l| l.starts_with("[Script Info]") || l.starts_with("Dialogue:"));

    if is_ass {
        let mut count = 1;
        for line in content.lines() {
            let trimmed = line.trim();
            if let Some(rest) = trimmed.strip_prefix("Dialogue:") {
                let parts: Vec<&str> = rest.splitn(10, ',').collect();
                if parts.len() >= 10 {
                    let start = parts[1].trim();
                    let end = parts[2].trim();
                    let raw_text = parts[9].trim();

                    let vtt_start = ass_time_to_vtt(start);
                    let vtt_end = ass_time_to_vtt(end);
                    let clean_text = strip_ass_tags(raw_text);

                    if !clean_text.is_empty() {
                        vtt.push_str(&format!("{}\n{} --> {}\n{}\n\n", count, vtt_start, vtt_end, clean_text));
                        count += 1;
                    }
                }
            }
        }
        return vtt;
    }

    // Standard SRT, VTT, SBV and generic line processing
    for line in content.lines() {
        if line.contains("-->") {
            let vtt_line = line.replace(',', ".");
            vtt.push_str(&vtt_line);
            vtt.push('\n');
        } else if line.contains(',') && line.contains(':') && line.chars().all(|c| c.is_ascii_digit() || c == ':' || c == '.' || c == ',') {
            // YouTube .sbv format (e.g. 0:01:23.450,0:01:25.780)
            let parts: Vec<&str> = line.split(',').collect();
            if parts.len() == 2 {
                let p1 = if parts[0].matches(':').count() == 1 { format!("00:{}", parts[0]) } else { parts[0].to_string() };
                let p2 = if parts[1].matches(':').count() == 1 { format!("00:{}", parts[1]) } else { parts[1].to_string() };
                vtt.push_str(&format!("{} --> {}\n", p1, p2));
            } else {
                vtt.push_str(line);
                vtt.push('\n');
            }
        } else {
            let clean = strip_ass_tags(line);
            vtt.push_str(&clean);
            vtt.push('\n');
        }
    }
    vtt
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decode_utf8_subtitles() {
        let text = "1\n00:00:01,000 --> 00:00:04,000\nOlá, este é um teste em português!";
        let decoded = decode_subtitle_bytes(text.as_bytes());
        assert_eq!(decoded, text);
    }

    #[test]
    fn test_decode_utf8_with_bom() {
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice("Legenda com BOM".as_bytes());
        let decoded = decode_subtitle_bytes(&bytes);
        assert_eq!(decoded, "Legenda com BOM");
    }

    #[test]
    fn test_decode_windows_1252_portuguese() {
        // "Atenção: você não pode falhar no coração!" in Windows-1252 / ISO-8859-1
        // 'ç' = 0xE7, 'ã' = 0xE3, 'ê' = 0xEA, 'õ' = 0xF5
        let bytes: Vec<u8> = vec![
            b'A', b't', b'e', b'n', 0xE7, 0xE3, b'o', b':', b' ',
            b'v', b'o', b'c', 0xEA, b' ',
            b'n', 0xE3, b'o', b' ',
            b'p', b'o', b'd', b'e', b' ',
            b'c', b'o', b'r', b'a', 0xE7, 0xE3, b'o', b'!'
        ];
        // Ensure standard UTF-8 parsing fails on raw bytes
        assert!(std::str::from_utf8(&bytes).is_err());

        let decoded = decode_subtitle_bytes(&bytes);
        assert_eq!(decoded, "Atenção: você não pode coração!");
    }

    #[test]
    fn test_decode_utf16_le() {
        let original = "Teste UTF-16 LE";
        let mut bytes = vec![0xFF, 0xFE]; // LE BOM
        for u in original.encode_utf16() {
            bytes.extend_from_slice(&u.to_le_bytes());
        }
        let decoded = decode_subtitle_bytes(&bytes);
        assert_eq!(decoded, original);
    }

    #[test]
    fn test_strip_ass_tags() {
        let raw = r"{\an8\c&H0000FF&}Olá mundo!{\b1}\NLinha 2\hcom espaço";
        let cleaned = strip_ass_tags(raw);
        assert_eq!(cleaned, "Olá mundo!\nLinha 2 com espaço");
    }

    #[test]
    fn test_ass_to_vtt_conversion() {
        let ass = "[Script Info]\nTitle: Test\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:01:10.50,0:01:14.20,Default,,0,0,0,,{\\pos(192,200)}Legenda de anime estilizada\\Ncom quebra de linha";
        let vtt = srt_or_ass_to_vtt(ass);
        assert!(vtt.starts_with("WEBVTT\n\n"));
        assert!(vtt.contains("00:01:10.500 --> 00:01:14.200"));
        assert!(vtt.contains("Legenda de anime estilizada\ncom quebra de linha"));
    }

    #[test]
    fn test_srt_to_vtt_comma_timestamps() {
        let srt = "1\n00:00:05,250 --> 00:00:08,750\nPrimeira fala";
        let vtt = srt_or_ass_to_vtt(srt);
        assert!(vtt.contains("00:00:05.250 --> 00:00:08.750"));
        assert!(vtt.contains("Primeira fala"));
    }
}
