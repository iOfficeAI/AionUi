// Pure Rust document conversion library.
// Currently provides Excel-to-JSON conversion (calamine for reading,
// zip + quick-xml for embedded image extraction).

mod excel;

pub use excel::{
    excel_to_json, DocError, ExcelSheetData, ExcelSheetImage, ExcelWorkbookData, MergeRange,
};

#[cfg(test)]
mod tests;
