// napi binding for aionui-doc (document conversion).
// Exposes excelToJson as a sync function (typical files complete in <30ms).

use napi::bindgen_prelude::*;
use napi_derive::napi;

#[napi(object)]
pub struct JsExcelSheetImage {
    pub row: u32,
    pub col: u32,
    pub src: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

#[napi(object)]
pub struct JsMergeCell {
    pub r: u32,
    pub c: u32,
}

#[napi(object)]
pub struct JsMergeRange {
    pub s: JsMergeCell,
    pub e: JsMergeCell,
}

#[napi(object)]
pub struct JsExcelSheetData {
    pub name: String,
    pub data: serde_json::Value,
    pub merges: Vec<JsMergeRange>,
    pub images: Vec<JsExcelSheetImage>,
}

#[napi(object)]
pub struct JsExcelWorkbookData {
    pub sheets: Vec<JsExcelSheetData>,
}

/// Read an Excel file and return structured workbook data as JSON.
/// Supports .xlsx and .xls formats.
#[napi]
pub fn excel_to_json(file_path: String) -> Result<JsExcelWorkbookData> {
    let result =
        aionui_doc::excel_to_json(&file_path).map_err(|e| Error::from_reason(e.to_string()))?;

    Ok(convert_workbook(result))
}

fn convert_workbook(wb: aionui_doc::ExcelWorkbookData) -> JsExcelWorkbookData {
    JsExcelWorkbookData {
        sheets: wb.sheets.into_iter().map(convert_sheet).collect(),
    }
}

fn convert_sheet(sheet: aionui_doc::ExcelSheetData) -> JsExcelSheetData {
    JsExcelSheetData {
        name: sheet.name,
        data: serde_json::Value::Array(
            sheet
                .data
                .into_iter()
                .map(|row| serde_json::Value::Array(row))
                .collect(),
        ),
        merges: sheet.merges.into_iter().map(convert_merge).collect(),
        images: sheet.images.into_iter().map(convert_image).collect(),
    }
}

fn convert_merge(m: aionui_doc::MergeRange) -> JsMergeRange {
    JsMergeRange {
        s: JsMergeCell {
            r: m.start_row,
            c: m.start_col,
        },
        e: JsMergeCell {
            r: m.end_row,
            c: m.end_col,
        },
    }
}

fn convert_image(img: aionui_doc::ExcelSheetImage) -> JsExcelSheetImage {
    JsExcelSheetImage {
        row: img.row,
        col: img.col,
        src: img.src,
        width: img.width,
        height: img.height,
    }
}
