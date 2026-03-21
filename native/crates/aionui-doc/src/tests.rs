use super::*;

// ---------------------------------------------------------------------------
// Path normalization & resolution
// ---------------------------------------------------------------------------

#[test]
fn normalize_backslash_paths() {
    assert_eq!(
        excel::images_test::normalize("xl\\worksheets\\sheet1.xml"),
        "xl/worksheets/sheet1.xml"
    );
}

#[test]
fn normalize_relative_paths() {
    assert_eq!(
        excel::images_test::normalize("xl/drawings/../media/image1.png"),
        "xl/media/image1.png"
    );
}

#[test]
fn normalize_leading_slash() {
    assert_eq!(
        excel::images_test::normalize("/xl/workbook.xml"),
        "xl/workbook.xml"
    );
}

#[test]
fn resolve_relative_target() {
    assert_eq!(
        excel::images_test::resolve("xl/worksheets/sheet1.xml", "../drawings/drawing1.xml"),
        "xl/drawings/drawing1.xml"
    );
}

#[test]
fn resolve_absolute_target() {
    assert_eq!(
        excel::images_test::resolve("xl/worksheets/sheet1.xml", "/xl/media/image1.png"),
        "xl/media/image1.png"
    );
}

#[test]
fn rels_path_for_sheet() {
    assert_eq!(
        excel::images_test::rels_path("xl/worksheets/sheet1.xml"),
        "xl/worksheets/_rels/sheet1.xml.rels"
    );
}

#[test]
fn rels_path_for_drawing() {
    assert_eq!(
        excel::images_test::rels_path("xl/drawings/drawing1.xml"),
        "xl/drawings/_rels/drawing1.xml.rels"
    );
}

// ---------------------------------------------------------------------------
// MIME types
// ---------------------------------------------------------------------------

#[test]
fn mime_type_png() {
    assert_eq!(excel::images_test::mime("image1.png"), "image/png");
}

#[test]
fn mime_type_jpeg() {
    assert_eq!(excel::images_test::mime("photo.jpeg"), "image/jpeg");
    assert_eq!(excel::images_test::mime("photo.JPG"), "image/jpeg");
}

#[test]
fn mime_type_unknown() {
    assert_eq!(
        excel::images_test::mime("file.xyz"),
        "application/octet-stream"
    );
}

// ---------------------------------------------------------------------------
// EMU to pixel conversion
// ---------------------------------------------------------------------------

#[test]
fn emu_to_pixels_basic() {
    assert_eq!(excel::images_test::emu_px(b"952500"), Some(100));
}

#[test]
fn emu_to_pixels_zero() {
    assert_eq!(excel::images_test::emu_px(b"0"), None);
}

#[test]
fn emu_to_pixels_small() {
    assert_eq!(excel::images_test::emu_px(b"9524"), None);
}

// ---------------------------------------------------------------------------
// Cell coordinate parsing (A1 → (col, row))
// ---------------------------------------------------------------------------

#[test]
fn cell_coords_a1() {
    assert_eq!(excel::images_test::cell_coords("A1"), Some((0, 0)));
}

#[test]
fn cell_coords_b3() {
    assert_eq!(excel::images_test::cell_coords("B3"), Some((1, 2)));
}

#[test]
fn cell_coords_aa10() {
    // AA = 26*1 + 1 = 27, minus 1 = 26
    assert_eq!(excel::images_test::cell_coords("AA10"), Some((26, 9)));
}

#[test]
fn cell_coords_invalid() {
    assert_eq!(excel::images_test::cell_coords(""), None);
    assert_eq!(excel::images_test::cell_coords("123"), None);
}

// ---------------------------------------------------------------------------
// Relationship XML parsing
// ---------------------------------------------------------------------------

#[test]
fn parse_rels_basic() {
    let xml = br#"<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
      <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
    </Relationships>"#;

    let rels = excel::images_test::parse_rels(xml);
    assert_eq!(rels.len(), 2);
    assert_eq!(rels["rId1"].0, "worksheets/sheet1.xml");
    assert_eq!(rels["rId2"].0, "worksheets/sheet2.xml");
}

// ---------------------------------------------------------------------------
// Workbook sheet parsing
// ---------------------------------------------------------------------------

#[test]
fn parse_workbook_sheets_basic() {
    let xml = br#"<?xml version="1.0" encoding="UTF-8"?>
    <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
              xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <sheets>
        <sheet name="Sales" r:id="rId1"/>
        <sheet name="Summary" r:id="rId2"/>
      </sheets>
    </workbook>"#;

    let sheets = excel::images_test::parse_wb_sheets(xml);
    assert_eq!(sheets.len(), 2);
    assert_eq!(sheets[0], ("Sales".to_string(), "rId1".to_string()));
    assert_eq!(sheets[1], ("Summary".to_string(), "rId2".to_string()));
}

// ---------------------------------------------------------------------------
// Drawing anchor parsing
// ---------------------------------------------------------------------------

#[test]
fn parse_drawing_anchors_two_cell() {
    let xml = br#"<?xml version="1.0" encoding="UTF-8"?>
    <xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
              xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
              xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <xdr:twoCellAnchor>
        <xdr:from>
          <xdr:col>2</xdr:col>
          <xdr:row>5</xdr:row>
        </xdr:from>
        <xdr:to>
          <xdr:col>4</xdr:col>
          <xdr:row>10</xdr:row>
        </xdr:to>
        <xdr:pic>
          <xdr:blipFill>
            <a:blip r:embed="rId1"/>
          </xdr:blipFill>
          <xdr:spPr>
            <a:ext cx="952500" cy="476250"/>
          </xdr:spPr>
        </xdr:pic>
      </xdr:twoCellAnchor>
    </xdr:wsDr>"#;

    let anchors = excel::images_test::parse_anchors(xml);
    assert_eq!(anchors.len(), 1);
    assert_eq!(anchors[0].0, 5); // row
    assert_eq!(anchors[0].1, 2); // col
    assert_eq!(anchors[0].2, "rId1");
    assert_eq!(anchors[0].3, Some(100)); // width  952500/9525
    assert_eq!(anchors[0].4, Some(50)); // height 476250/9525
}

#[test]
fn parse_drawing_anchors_no_prefix() {
    let xml = br#"<?xml version="1.0" encoding="UTF-8"?>
    <wsDr xmlns="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing">
      <oneCellAnchor>
        <from>
          <col>0</col>
          <row>0</row>
        </from>
        <pic>
          <blipFill>
            <blip embed="rId2"/>
          </blipFill>
        </pic>
      </oneCellAnchor>
    </wsDr>"#;

    let anchors = excel::images_test::parse_anchors(xml);
    assert_eq!(anchors.len(), 1);
    assert_eq!(anchors[0].0, 0);
    assert_eq!(anchors[0].1, 0);
    assert_eq!(anchors[0].2, "rId2");
}

// ---------------------------------------------------------------------------
// Merge cell parsing
// ---------------------------------------------------------------------------

#[test]
fn parse_merge_cells_basic() {
    let xml = br#"<?xml version="1.0" encoding="UTF-8"?>
    <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <mergeCells count="2">
        <mergeCell ref="A1:B2"/>
        <mergeCell ref="D3:F5"/>
      </mergeCells>
    </worksheet>"#;

    let merges = excel::images_test::parse_merges(xml);
    assert_eq!(merges.len(), 2);
    // A1:B2 → (row=0, col=0) to (row=1, col=1)
    assert_eq!(merges[0], (0, 0, 1, 1));
    // D3:F5 → (row=2, col=3) to (row=4, col=5)
    assert_eq!(merges[1], (2, 3, 4, 5));
}

// ---------------------------------------------------------------------------
// Data cell type mapping
// ---------------------------------------------------------------------------

#[test]
fn data_to_json_string() {
    let val = excel::test_helpers::data_to_json_pub(&calamine::Data::String("hello".into()));
    assert_eq!(val, serde_json::json!("hello"));
}

#[test]
fn data_to_json_int() {
    let val = excel::test_helpers::data_to_json_pub(&calamine::Data::Int(42));
    assert_eq!(val, serde_json::json!(42));
}

#[test]
fn data_to_json_float() {
    let val = excel::test_helpers::data_to_json_pub(&calamine::Data::Float(3.14));
    assert_eq!(val, serde_json::json!(3.14));
}

#[test]
fn data_to_json_bool() {
    let val = excel::test_helpers::data_to_json_pub(&calamine::Data::Bool(true));
    assert_eq!(val, serde_json::json!(true));
}

#[test]
fn data_to_json_empty() {
    let val = excel::test_helpers::data_to_json_pub(&calamine::Data::Empty);
    assert!(val.is_null());
}

#[test]
fn data_to_json_error() {
    let val =
        excel::test_helpers::data_to_json_pub(&calamine::Data::Error(calamine::CellErrorType::Div0));
    assert!(val.is_null());
}
