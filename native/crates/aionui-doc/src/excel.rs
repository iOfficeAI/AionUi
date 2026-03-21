// Excel-to-JSON conversion using calamine for cell data and
// zip + quick-xml for embedded images and merge cell extraction.

pub(crate) mod images;

use calamine::{open_workbook_auto, Data, Reader};
use serde::Serialize;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct ExcelSheetImage {
    pub row: u32,
    pub col: u32,
    pub src: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MergeRange {
    pub start_row: u32,
    pub start_col: u32,
    pub end_row: u32,
    pub end_col: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExcelSheetData {
    pub name: String,
    pub data: Vec<Vec<serde_json::Value>>,
    pub merges: Vec<MergeRange>,
    pub images: Vec<ExcelSheetImage>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExcelWorkbookData {
    pub sheets: Vec<ExcelSheetData>,
}

#[derive(Debug, thiserror::Error)]
pub enum DocError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Excel parse error: {0}")]
    Excel(String),

    #[error("ZIP error: {0}")]
    Zip(#[from] zip::result::ZipError),

    #[error("XML parse error: {0}")]
    Xml(String),
}

// Re-export test helpers.
#[cfg(test)]
pub mod images_test {
    pub use super::images::test_api::*;
}

#[cfg(test)]
pub mod test_helpers {
    use super::*;
    pub fn data_to_json_pub(cell: &Data) -> serde_json::Value {
        data_to_json(cell)
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Read an Excel file (.xlsx/.xls) and return structured workbook data
/// including cell values, merge ranges, and embedded images.
pub fn excel_to_json(file_path: &str) -> Result<ExcelWorkbookData, DocError> {
    let mut workbook =
        open_workbook_auto(file_path).map_err(|e| DocError::Excel(e.to_string()))?;

    let sheet_names: Vec<String> = workbook.sheet_names().to_vec();

    // For .xlsx files, extract images and merge cells from the ZIP/XML.
    // For .xls files, these features are not supported (images/merges stay empty).
    let is_xlsx = file_path.to_lowercase().ends_with(".xlsx");
    let extras = if is_xlsx {
        images::extract_xlsx_extras(file_path).unwrap_or_default()
    } else {
        images::XlsxExtras::default()
    };

    let mut sheets = Vec::with_capacity(sheet_names.len());

    for name in &sheet_names {
        let range = workbook
            .worksheet_range(name)
            .map_err(|e| DocError::Excel(e.to_string()))?;
        let data = range_to_json(&range);

        let merges = extras.merges.get(name).cloned().unwrap_or_default();
        let sheet_images = extras.images.get(name).cloned().unwrap_or_default();

        sheets.push(ExcelSheetData {
            name: name.clone(),
            data,
            merges,
            images: sheet_images,
        });
    }

    Ok(ExcelWorkbookData { sheets })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn range_to_json(range: &calamine::Range<Data>) -> Vec<Vec<serde_json::Value>> {
    range
        .rows()
        .map(|row| row.iter().map(data_to_json).collect())
        .collect()
}

fn data_to_json(cell: &Data) -> serde_json::Value {
    match cell {
        Data::Int(i) => serde_json::Value::Number((*i).into()),
        Data::Float(f) => serde_json::Number::from_f64(*f)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),
        Data::String(s) => serde_json::Value::String(s.clone()),
        Data::Bool(b) => serde_json::Value::Bool(*b),
        Data::DateTime(dt) => serde_json::Number::from_f64(dt.as_f64())
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),
        Data::DateTimeIso(s) => serde_json::Value::String(s.clone()),
        Data::DurationIso(s) => serde_json::Value::String(s.clone()),
        Data::Error(_) | Data::Empty => serde_json::Value::Null,
    }
}
