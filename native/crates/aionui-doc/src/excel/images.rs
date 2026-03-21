// Extract embedded images and merge cell info from .xlsx files.
//
// An xlsx file is a ZIP archive containing Office Open XML.  Images live
// at paths like `xl/media/image1.png` and are referenced through a chain
// of relationship files:
//
//   xl/workbook.xml
//     → xl/_rels/workbook.xml.rels  (sheet relId → sheet path)
//       → xl/worksheets/sheet1.xml
//         → xl/worksheets/_rels/sheet1.xml.rels  (drawing relId → drawing path)
//           → xl/drawings/drawing1.xml  (anchor position + blip embed id)
//             → xl/drawings/_rels/drawing1.xml.rels  (embed id → image path)
//
// Merge cells are stored in each sheet XML as:
//   <mergeCells><mergeCell ref="A1:B2"/></mergeCells>

use super::{DocError, ExcelSheetImage, MergeRange};
use base64::Engine;
use quick_xml::events::Event;
use quick_xml::Reader as XmlReader;
use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use zip::ZipArchive;

/// Combined result of ZIP-based extraction for all sheets.
#[derive(Default)]
pub struct XlsxExtras {
    pub images: HashMap<String, Vec<ExcelSheetImage>>,
    pub merges: HashMap<String, Vec<MergeRange>>,
}

/// Extract images and merge cells for all sheets in an xlsx file.
/// This function is non-fatal: callers should handle errors gracefully.
pub fn extract_xlsx_extras(file_path: &str) -> Result<XlsxExtras, DocError> {
    let file = File::open(file_path)?;
    let mut archive = ZipArchive::new(file)?;

    let file_map = load_relevant_entries(&mut archive)?;

    // Parse workbook.xml to get sheet names and their relationship IDs.
    let workbook_xml = match file_map.get("xl/workbook.xml") {
        Some(data) => data,
        None => return Ok(XlsxExtras::default()),
    };
    let sheet_infos = parse_workbook_sheets(workbook_xml)?;

    // Parse workbook.xml.rels to resolve sheet relIds → sheet paths.
    let wb_rels_xml = match file_map.get("xl/_rels/workbook.xml.rels") {
        Some(data) => data,
        None => return Ok(XlsxExtras::default()),
    };
    let wb_rels = parse_relationships(wb_rels_xml);

    // Map each sheet name to its resolved path.
    let mut sheet_paths: Vec<(String, String)> = Vec::new();
    for (name, rel_id) in &sheet_infos {
        if let Some(rel) = wb_rels.get(rel_id) {
            let resolved = resolve_path("xl/workbook.xml", &rel.target);
            sheet_paths.push((name.clone(), resolved));
        }
    }

    let mut all_images: HashMap<String, Vec<ExcelSheetImage>> = HashMap::new();
    let mut all_merges: HashMap<String, Vec<MergeRange>> = HashMap::new();

    for (sheet_name, sheet_path) in &sheet_paths {
        // --- Extract merge cells from sheet XML ---
        if let Some(sheet_xml) = file_map.get(sheet_path.as_str()) {
            let merges = parse_merge_cells(sheet_xml);
            if !merges.is_empty() {
                all_merges.insert(sheet_name.clone(), merges);
            }
        }

        // --- Extract images ---
        let sheet_rels_path = rels_path_for(sheet_path);
        let sheet_rels_xml = match file_map.get(&sheet_rels_path) {
            Some(data) => data,
            None => continue,
        };
        let sheet_rels = parse_relationships(sheet_rels_xml);

        let drawing_rels: Vec<&Rel> = sheet_rels
            .values()
            .filter(|r| r.rel_type.ends_with("/drawing"))
            .collect();

        for drawing_rel in drawing_rels {
            let drawing_path = resolve_path(sheet_path, &drawing_rel.target);
            let drawing_xml = match file_map.get(&drawing_path) {
                Some(data) => data,
                None => continue,
            };

            let anchors = parse_drawing_anchors(drawing_xml);
            if anchors.is_empty() {
                continue;
            }

            let drawing_rels_path = rels_path_for(&drawing_path);
            let drawing_rels_xml = match file_map.get(&drawing_rels_path) {
                Some(data) => data,
                None => continue,
            };
            let drawing_rels_map = parse_relationships(drawing_rels_xml);

            for anchor in &anchors {
                let image_rel = match drawing_rels_map.get(&anchor.embed_id) {
                    Some(r) => r,
                    None => continue,
                };
                let image_path = resolve_path(&drawing_path, &image_rel.target);
                let image_data = match file_map.get(&image_path) {
                    Some(data) => data,
                    None => continue,
                };

                let mime = mime_from_extension(&image_path);
                let b64 = base64::engine::general_purpose::STANDARD.encode(image_data);
                let src = format!("data:{};base64,{}", mime, b64);

                all_images
                    .entry(sheet_name.clone())
                    .or_default()
                    .push(ExcelSheetImage {
                        row: anchor.row,
                        col: anchor.col,
                        src,
                        width: anchor.width,
                        height: anchor.height,
                    });
            }
        }
    }

    Ok(XlsxExtras {
        images: all_images,
        merges: all_merges,
    })
}

// ---------------------------------------------------------------------------
// ZIP helpers
// ---------------------------------------------------------------------------

fn load_relevant_entries(
    archive: &mut ZipArchive<File>,
) -> Result<HashMap<String, Vec<u8>>, DocError> {
    let mut map = HashMap::new();

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let raw_name = entry.name().to_string();
        let name = normalize_path(&raw_name);

        if !should_keep(&name) || entry.is_dir() {
            continue;
        }

        let mut buf = Vec::with_capacity(entry.size() as usize);
        entry.read_to_end(&mut buf)?;
        map.insert(name, buf);
    }

    Ok(map)
}

fn should_keep(path: &str) -> bool {
    if !path.starts_with("xl/") {
        return false;
    }
    path == "xl/workbook.xml"
        || path == "xl/_rels/workbook.xml.rels"
        || path.starts_with("xl/worksheets/")
        || path.starts_with("xl/drawings/")
        || path.starts_with("xl/media/")
}

fn normalize_path(p: &str) -> String {
    let cleaned = p.replace('\\', "/");
    let parts: Vec<&str> = cleaned
        .split('/')
        .filter(|s| !s.is_empty() && *s != ".")
        .collect();
    let mut stack: Vec<&str> = Vec::new();
    for part in parts {
        if part == ".." {
            stack.pop();
        } else {
            stack.push(part);
        }
    }
    stack.join("/")
}

fn resolve_path(base: &str, target: &str) -> String {
    if target.starts_with('/') {
        return normalize_path(target);
    }
    let normalized = normalize_path(base);
    let mut parts: Vec<&str> = normalized.split('/').collect();
    parts.pop();
    let combined = format!("{}/{}", parts.join("/"), target);
    normalize_path(&combined)
}

fn rels_path_for(part: &str) -> String {
    let normalized = normalize_path(part);
    let idx = normalized.rfind('/');
    let (dir, file) = match idx {
        Some(i) => (&normalized[..i], &normalized[i + 1..]),
        None => ("", normalized.as_str()),
    };
    if dir.is_empty() {
        normalize_path(&format!("_rels/{}.rels", file))
    } else {
        normalize_path(&format!("{}/_rels/{}.rels", dir, file))
    }
}

fn mime_from_extension(path: &str) -> &'static str {
    let lower = path.to_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else if lower.ends_with(".bmp") {
        "image/bmp"
    } else if lower.ends_with(".svg") {
        "image/svg+xml"
    } else {
        "application/octet-stream"
    }
}

// ---------------------------------------------------------------------------
// XML parsing — Relationships
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct Rel {
    target: String,
    rel_type: String,
}

fn parse_relationships(xml: &[u8]) -> HashMap<String, Rel> {
    let mut map = HashMap::new();
    let mut reader = XmlReader::from_reader(xml);
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Empty(ref e)) | Ok(Event::Start(ref e)) => {
                let name_bytes = e.name().as_ref().to_vec();
                let local = local_name(&name_bytes);
                if local == b"Relationship" {
                    let mut id = String::new();
                    let mut target = String::new();
                    let mut rel_type = String::new();

                    for attr in e.attributes().filter_map(|a| a.ok()) {
                        match attr.key.as_ref() {
                            b"Id" | b"ID" => {
                                id = String::from_utf8_lossy(&attr.value).to_string()
                            }
                            b"Target" => {
                                target = String::from_utf8_lossy(&attr.value).to_string()
                            }
                            b"Type" => {
                                rel_type = String::from_utf8_lossy(&attr.value).to_string()
                            }
                            _ => {}
                        }
                    }

                    if !id.is_empty() && !target.is_empty() {
                        map.insert(id, Rel { target, rel_type });
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    map
}

// ---------------------------------------------------------------------------
// XML parsing — Workbook sheets
// ---------------------------------------------------------------------------

fn parse_workbook_sheets(xml: &[u8]) -> Result<Vec<(String, String)>, DocError> {
    let mut sheets = Vec::new();
    let mut reader = XmlReader::from_reader(xml);
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Empty(ref e)) | Ok(Event::Start(ref e)) => {
                let name_bytes = e.name().as_ref().to_vec();
                let local = local_name(&name_bytes);
                if local == b"sheet" {
                    let mut name = String::new();
                    let mut rel_id = String::new();

                    for attr in e.attributes().filter_map(|a| a.ok()) {
                        match attr.key.as_ref() {
                            b"name" => {
                                name = String::from_utf8_lossy(&attr.value).to_string()
                            }
                            key if key == b"r:id" || key == b"Id" || key == b"id" => {
                                rel_id = String::from_utf8_lossy(&attr.value).to_string()
                            }
                            _ => {}
                        }
                    }

                    if !name.is_empty() && !rel_id.is_empty() {
                        sheets.push((name, rel_id));
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(DocError::Xml(e.to_string())),
            _ => {}
        }
        buf.clear();
    }

    Ok(sheets)
}

// ---------------------------------------------------------------------------
// XML parsing — Merge cells
// ---------------------------------------------------------------------------

/// Parse merge cell ranges from a sheet XML.
/// Looks for <mergeCells><mergeCell ref="A1:B2"/></mergeCells>.
fn parse_merge_cells(xml: &[u8]) -> Vec<MergeRange> {
    let mut merges = Vec::new();
    let mut reader = XmlReader::from_reader(xml);
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Empty(ref e)) | Ok(Event::Start(ref e)) => {
                let name_bytes = e.name().as_ref().to_vec();
                let local = local_name(&name_bytes);
                if local == b"mergeCell" {
                    for attr in e.attributes().filter_map(|a| a.ok()) {
                        if attr.key.as_ref() == b"ref" {
                            let ref_str = String::from_utf8_lossy(&attr.value);
                            if let Some(range) = parse_cell_ref(&ref_str) {
                                merges.push(range);
                            }
                        }
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    merges
}

/// Parse a cell reference like "A1:B2" into a MergeRange.
fn parse_cell_ref(ref_str: &str) -> Option<MergeRange> {
    let parts: Vec<&str> = ref_str.split(':').collect();
    if parts.len() != 2 {
        return None;
    }
    let (sc, sr) = cell_to_coords(parts[0])?;
    let (ec, er) = cell_to_coords(parts[1])?;
    Some(MergeRange {
        start_row: sr,
        start_col: sc,
        end_row: er,
        end_col: ec,
    })
}

/// Convert a cell reference like "B3" to (col, row) zero-indexed.
fn cell_to_coords(cell: &str) -> Option<(u32, u32)> {
    let cell = cell.trim();
    let mut col: u32 = 0;
    let mut row_start = 0;

    for (i, ch) in cell.chars().enumerate() {
        if ch.is_ascii_alphabetic() {
            col = col * 26 + (ch.to_ascii_uppercase() as u32 - b'A' as u32 + 1);
            row_start = i + 1;
        } else {
            break;
        }
    }

    if row_start == 0 || col == 0 {
        return None;
    }

    let row: u32 = cell[row_start..].parse().ok()?;
    // Convert to 0-indexed.
    Some((col - 1, row - 1))
}

// ---------------------------------------------------------------------------
// XML parsing — Drawing anchors (image positions)
// ---------------------------------------------------------------------------

struct ImageAnchor {
    row: u32,
    col: u32,
    embed_id: String,
    width: Option<u32>,
    height: Option<u32>,
}

fn parse_drawing_anchors(xml: &[u8]) -> Vec<ImageAnchor> {
    let mut anchors = Vec::new();
    let mut reader = XmlReader::from_reader(xml);
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();

    let mut in_anchor = false;
    let mut in_from = false;
    let mut reading_row = false;
    let mut reading_col = false;

    let mut current_embed: Option<String> = None;
    let mut current_row: u32 = 0;
    let mut current_col: u32 = 0;
    let mut current_width: Option<u32> = None;
    let mut current_height: Option<u32> = None;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let name_bytes = e.name().as_ref().to_vec();
                let local = local_name(&name_bytes);

                if is_anchor_tag(local) {
                    in_anchor = true;
                    current_embed = None;
                    current_row = 0;
                    current_col = 0;
                    current_width = None;
                    current_height = None;
                } else if in_anchor && local == b"from" {
                    in_from = true;
                } else if in_anchor && in_from && local == b"row" {
                    reading_row = true;
                } else if in_anchor && in_from && local == b"col" {
                    reading_col = true;
                }
            }
            Ok(Event::Empty(ref e)) => {
                if !in_anchor {
                    buf.clear();
                    continue;
                }
                let name_bytes = e.name().as_ref().to_vec();
                let local = local_name(&name_bytes);

                if local == b"blip" {
                    for attr in e.attributes().filter_map(|a| a.ok()) {
                        let key = attr.key.as_ref();
                        if key == b"r:embed" || key == b"embed" {
                            current_embed =
                                Some(String::from_utf8_lossy(&attr.value).to_string());
                        }
                    }
                }

                if local == b"ext" {
                    for attr in e.attributes().filter_map(|a| a.ok()) {
                        match attr.key.as_ref() {
                            b"cx" => {
                                current_width = emu_to_pixels(&attr.value);
                            }
                            b"cy" => {
                                current_height = emu_to_pixels(&attr.value);
                            }
                            _ => {}
                        }
                    }
                }
            }
            Ok(Event::Text(ref e)) => {
                if reading_row {
                    if let Ok(s) = e.unescape() {
                        current_row = s.parse().unwrap_or(0);
                    }
                } else if reading_col {
                    if let Ok(s) = e.unescape() {
                        current_col = s.parse().unwrap_or(0);
                    }
                }
            }
            Ok(Event::End(ref e)) => {
                let name_bytes = e.name().as_ref().to_vec();
                let local = local_name(&name_bytes);

                if is_anchor_tag(local) {
                    if let Some(embed_id) = current_embed.take() {
                        anchors.push(ImageAnchor {
                            row: current_row,
                            col: current_col,
                            embed_id,
                            width: current_width,
                            height: current_height,
                        });
                    }
                    in_anchor = false;
                    in_from = false;
                } else if local == b"from" {
                    in_from = false;
                } else if local == b"row" {
                    reading_row = false;
                } else if local == b"col" {
                    reading_col = false;
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    anchors
}

fn is_anchor_tag(local: &[u8]) -> bool {
    local == b"twoCellAnchor" || local == b"oneCellAnchor" || local == b"absoluteAnchor"
}

/// Strip namespace prefix: b"xdr:twoCellAnchor" → b"twoCellAnchor".
fn local_name(name: &[u8]) -> &[u8] {
    match name.iter().position(|&b| b == b':') {
        Some(pos) => &name[pos + 1..],
        None => name,
    }
}

/// Convert EMU (English Metric Units) to pixels. 1 px = 9525 EMU.
fn emu_to_pixels(value: &[u8]) -> Option<u32> {
    let s = std::str::from_utf8(value).ok()?;
    let emu: u64 = s.parse().ok()?;
    let px = (emu / 9525) as u32;
    if px > 0 {
        Some(px)
    } else {
        None
    }
}

// ---------------------------------------------------------------------------
// Test-only re-exports
// ---------------------------------------------------------------------------

#[cfg(test)]
pub mod test_api {
    use super::*;
    use std::collections::HashMap;

    pub fn normalize(p: &str) -> String {
        normalize_path(p)
    }

    pub fn resolve(base: &str, target: &str) -> String {
        resolve_path(base, target)
    }

    pub fn rels_path(part: &str) -> String {
        rels_path_for(part)
    }

    pub fn mime(path: &str) -> &'static str {
        mime_from_extension(path)
    }

    pub fn emu_px(value: &[u8]) -> Option<u32> {
        emu_to_pixels(value)
    }

    pub fn parse_rels(xml: &[u8]) -> HashMap<String, (String, String)> {
        parse_relationships(xml)
            .into_iter()
            .map(|(id, rel)| (id, (rel.target, rel.rel_type)))
            .collect()
    }

    pub fn parse_wb_sheets(xml: &[u8]) -> Vec<(String, String)> {
        parse_workbook_sheets(xml).unwrap_or_default()
    }

    pub fn parse_anchors(xml: &[u8]) -> Vec<(u32, u32, String, Option<u32>, Option<u32>)> {
        parse_drawing_anchors(xml)
            .into_iter()
            .map(|a| (a.row, a.col, a.embed_id, a.width, a.height))
            .collect()
    }

    pub fn parse_merges(xml: &[u8]) -> Vec<(u32, u32, u32, u32)> {
        parse_merge_cells(xml)
            .into_iter()
            .map(|m| (m.start_row, m.start_col, m.end_row, m.end_col))
            .collect()
    }

    pub fn cell_coords(cell: &str) -> Option<(u32, u32)> {
        cell_to_coords(cell)
    }
}
