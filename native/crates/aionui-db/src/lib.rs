use rusqlite::types::ValueRef;
use serde_json::Value as JsonValue;

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

#[derive(thiserror::Error, Debug)]
pub enum DbError {
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
}

// ---------------------------------------------------------------------------
// RunResult
// ---------------------------------------------------------------------------

pub struct RunResult {
    pub changes: i64,
    pub last_insert_rowid: i64,
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

pub struct Database {
    conn: rusqlite::Connection,
}

impl Database {
    pub fn new(path: &str) -> Result<Self, DbError> {
        let conn = if path == ":memory:" {
            rusqlite::Connection::open_in_memory()?
        } else {
            rusqlite::Connection::open(path)?
        };
        Ok(Self { conn })
    }

    pub fn close(self) -> Result<(), DbError> {
        self.conn.close().map_err(|(_, e)| DbError::Sqlite(e))
    }

    /// Execute raw SQL (multi-statement DDL). No params, no return.
    pub fn exec(&self, sql: &str) -> Result<(), DbError> {
        self.conn.execute_batch(sql)?;
        Ok(())
    }

    /// Execute single statement with params. Returns changes + lastInsertRowid.
    pub fn run(&self, sql: &str, params: &[JsonValue]) -> Result<RunResult, DbError> {
        let sqlite_params: Vec<rusqlite::types::Value> =
            params.iter().map(json_to_sqlite).collect();
        let mut stmt = self.conn.prepare_cached(sql)?;
        let changes = stmt.execute(rusqlite::params_from_iter(&sqlite_params))?;
        drop(stmt);
        Ok(RunResult {
            changes: changes as i64,
            last_insert_rowid: self.conn.last_insert_rowid(),
        })
    }

    /// Query single row. Returns JSON object or null.
    pub fn get(&self, sql: &str, params: &[JsonValue]) -> Result<JsonValue, DbError> {
        let mut stmt = self.conn.prepare_cached(sql)?;
        let col_count = stmt.column_count();
        let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let sqlite_params: Vec<rusqlite::types::Value> =
            params.iter().map(json_to_sqlite).collect();
        let mut rows = stmt.query(rusqlite::params_from_iter(&sqlite_params))?;

        match rows.next()? {
            Some(row) => row_to_json(row, &column_names, col_count),
            None => Ok(JsonValue::Null),
        }
    }

    /// Query multiple rows. Returns array of JSON objects.
    pub fn all(&self, sql: &str, params: &[JsonValue]) -> Result<Vec<JsonValue>, DbError> {
        let mut stmt = self.conn.prepare_cached(sql)?;
        let col_count = stmt.column_count();
        let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let sqlite_params: Vec<rusqlite::types::Value> =
            params.iter().map(json_to_sqlite).collect();
        let mut rows = stmt.query(rusqlite::params_from_iter(&sqlite_params))?;

        let mut results = Vec::with_capacity(32);
        while let Some(row) = rows.next()? {
            results.push(row_to_json(row, &column_names, col_count)?);
        }
        Ok(results)
    }

    /// Get pragma value.
    pub fn pragma_get(&self, name: &str) -> Result<JsonValue, DbError> {
        let mut stmt = self.conn.prepare(&format!("PRAGMA {name}"))?;
        let mut rows = stmt.query([])?;
        match rows.next()? {
            Some(row) => Ok(value_ref_to_json(row.get_ref(0)?)),
            None => Ok(JsonValue::Null),
        }
    }

    /// Set pragma value.
    pub fn pragma_set(&self, statement: &str) -> Result<(), DbError> {
        self.conn
            .execute_batch(&format!("PRAGMA {statement};"))?;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Value conversion helpers
// ---------------------------------------------------------------------------

fn json_to_sqlite(val: &JsonValue) -> rusqlite::types::Value {
    match val {
        JsonValue::Null => rusqlite::types::Value::Null,
        JsonValue::Bool(b) => rusqlite::types::Value::Integer(i64::from(*b)),
        JsonValue::Number(n) => {
            if let Some(i) = n.as_i64() {
                rusqlite::types::Value::Integer(i)
            } else if let Some(f) = n.as_f64() {
                rusqlite::types::Value::Real(f)
            } else {
                rusqlite::types::Value::Null
            }
        }
        JsonValue::String(s) => rusqlite::types::Value::Text(s.clone()),
        // Arrays/objects not supported as SQLite params
        _ => rusqlite::types::Value::Null,
    }
}

fn value_ref_to_json(val: ValueRef) -> JsonValue {
    match val {
        ValueRef::Null => JsonValue::Null,
        ValueRef::Integer(i) => JsonValue::Number(i.into()),
        ValueRef::Real(f) => serde_json::Number::from_f64(f)
            .map(JsonValue::Number)
            .unwrap_or(JsonValue::Null),
        ValueRef::Text(bytes) => {
            JsonValue::String(String::from_utf8_lossy(bytes).into_owned())
        }
        ValueRef::Blob(_) => JsonValue::Null,
    }
}

fn row_to_json(
    row: &rusqlite::Row,
    column_names: &[String],
    col_count: usize,
) -> Result<JsonValue, DbError> {
    let mut map = serde_json::Map::with_capacity(col_count);
    for (i, name) in column_names.iter().enumerate() {
        map.insert(name.clone(), value_ref_to_json(row.get_ref(i)?));
    }
    Ok(JsonValue::Object(map))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn mem_db() -> Database {
        Database::new(":memory:").unwrap()
    }

    #[test]
    fn open_in_memory() {
        let db = mem_db();
        db.close().unwrap();
    }

    #[test]
    fn exec_create_table() {
        let db = mem_db();
        db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)")
            .unwrap();
    }

    #[test]
    fn exec_multi_statement() {
        let db = mem_db();
        db.exec(
            "CREATE TABLE a (id INTEGER); CREATE TABLE b (id INTEGER);",
        )
        .unwrap();
    }

    #[test]
    fn exec_invalid_sql() {
        let db = mem_db();
        assert!(db.exec("NOT VALID SQL").is_err());
    }

    #[test]
    fn run_insert_returns_changes() {
        let db = mem_db();
        db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)")
            .unwrap();

        let result = db
            .run(
                "INSERT INTO t (name) VALUES (?)",
                &[JsonValue::String("alice".into())],
            )
            .unwrap();
        assert_eq!(result.changes, 1);
        assert_eq!(result.last_insert_rowid, 1);
    }

    #[test]
    fn run_update_returns_changes() {
        let db = mem_db();
        db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v INTEGER)")
            .unwrap();
        db.run("INSERT INTO t (v) VALUES (?)", &[serde_json::json!(1)])
            .unwrap();
        db.run("INSERT INTO t (v) VALUES (?)", &[serde_json::json!(1)])
            .unwrap();

        let result = db
            .run(
                "UPDATE t SET v = ? WHERE v = ?",
                &[serde_json::json!(2), serde_json::json!(1)],
            )
            .unwrap();
        assert_eq!(result.changes, 2);
    }

    #[test]
    fn run_delete_returns_changes() {
        let db = mem_db();
        db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY)")
            .unwrap();
        db.run("INSERT INTO t DEFAULT VALUES", &[]).unwrap();
        db.run("INSERT INTO t DEFAULT VALUES", &[]).unwrap();

        let result = db.run("DELETE FROM t", &[]).unwrap();
        assert_eq!(result.changes, 2);
    }

    #[test]
    fn get_returns_object() {
        let db = mem_db();
        db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)")
            .unwrap();
        db.run(
            "INSERT INTO t (id, name) VALUES (?, ?)",
            &[serde_json::json!(1), JsonValue::String("alice".into())],
        )
        .unwrap();

        let row = db.get("SELECT id, name FROM t WHERE id = ?", &[serde_json::json!(1)]).unwrap();
        assert_eq!(row["id"], serde_json::json!(1));
        assert_eq!(row["name"], serde_json::json!("alice"));
    }

    #[test]
    fn get_returns_null_for_no_match() {
        let db = mem_db();
        db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY)")
            .unwrap();

        let row = db.get("SELECT * FROM t WHERE id = ?", &[serde_json::json!(999)]).unwrap();
        assert_eq!(row, JsonValue::Null);
    }

    #[test]
    fn get_handles_null_column() {
        let db = mem_db();
        db.exec("CREATE TABLE t (id INTEGER, v TEXT)").unwrap();
        db.run(
            "INSERT INTO t (id, v) VALUES (?, ?)",
            &[serde_json::json!(1), JsonValue::Null],
        )
        .unwrap();

        let row = db.get("SELECT id, v FROM t WHERE id = 1", &[]).unwrap();
        assert_eq!(row["v"], JsonValue::Null);
    }

    #[test]
    fn all_returns_array() {
        let db = mem_db();
        db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)")
            .unwrap();
        db.run(
            "INSERT INTO t (name) VALUES (?)",
            &[JsonValue::String("a".into())],
        )
        .unwrap();
        db.run(
            "INSERT INTO t (name) VALUES (?)",
            &[JsonValue::String("b".into())],
        )
        .unwrap();

        let rows = db.all("SELECT name FROM t ORDER BY name", &[]).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0]["name"], serde_json::json!("a"));
        assert_eq!(rows[1]["name"], serde_json::json!("b"));
    }

    #[test]
    fn all_empty_returns_empty_vec() {
        let db = mem_db();
        db.exec("CREATE TABLE t (id INTEGER)").unwrap();

        let rows = db.all("SELECT * FROM t", &[]).unwrap();
        assert!(rows.is_empty());
    }

    #[test]
    fn type_mapping_string() {
        let db = mem_db();
        db.exec("CREATE TABLE t (v TEXT)").unwrap();
        db.run(
            "INSERT INTO t (v) VALUES (?)",
            &[JsonValue::String("hello".into())],
        )
        .unwrap();

        let row = db.get("SELECT v FROM t", &[]).unwrap();
        assert_eq!(row["v"], serde_json::json!("hello"));
    }

    #[test]
    fn type_mapping_integer() {
        let db = mem_db();
        db.exec("CREATE TABLE t (v INTEGER)").unwrap();
        db.run("INSERT INTO t (v) VALUES (?)", &[serde_json::json!(42)])
            .unwrap();

        let row = db.get("SELECT v FROM t", &[]).unwrap();
        assert_eq!(row["v"], serde_json::json!(42));
    }

    #[test]
    fn type_mapping_float() {
        let db = mem_db();
        db.exec("CREATE TABLE t (v REAL)").unwrap();
        db.run("INSERT INTO t (v) VALUES (?)", &[serde_json::json!(3.14)])
            .unwrap();

        let row = db.get("SELECT v FROM t", &[]).unwrap();
        let val = row["v"].as_f64().unwrap();
        assert!((val - 3.14).abs() < f64::EPSILON);
    }

    #[test]
    fn type_mapping_null() {
        let db = mem_db();
        db.exec("CREATE TABLE t (v TEXT)").unwrap();
        db.run("INSERT INTO t (v) VALUES (?)", &[JsonValue::Null])
            .unwrap();

        let row = db.get("SELECT v FROM t", &[]).unwrap();
        assert_eq!(row["v"], JsonValue::Null);
    }

    #[test]
    fn type_mapping_boolean_stored_as_integer() {
        let db = mem_db();
        db.exec("CREATE TABLE t (v INTEGER)").unwrap();
        db.run("INSERT INTO t (v) VALUES (?)", &[JsonValue::Bool(true)])
            .unwrap();

        let row = db.get("SELECT v FROM t", &[]).unwrap();
        // SQLite stores bool as 1/0 integer, returns as integer
        assert_eq!(row["v"], serde_json::json!(1));
    }

    #[test]
    fn type_mapping_large_integer() {
        let db = mem_db();
        db.exec("CREATE TABLE t (v INTEGER)").unwrap();
        let max_safe = serde_json::json!(9_007_199_254_740_991_i64); // Number.MAX_SAFE_INTEGER
        db.run("INSERT INTO t (v) VALUES (?)", &[max_safe.clone()])
            .unwrap();

        let row = db.get("SELECT v FROM t", &[]).unwrap();
        assert_eq!(row["v"], max_safe);
    }

    #[test]
    fn pragma_get_and_set() {
        let db = mem_db();
        db.pragma_set("user_version = 42").unwrap();

        let val = db.pragma_get("user_version").unwrap();
        assert_eq!(val, serde_json::json!(42));
    }

    #[test]
    fn pragma_journal_mode() {
        let db = mem_db();
        // In-memory databases use "memory" journal mode by default
        let mode = db.pragma_get("journal_mode").unwrap();
        assert!(mode.is_string());
    }

    #[test]
    fn pragma_foreign_keys() {
        let db = mem_db();
        db.pragma_set("foreign_keys = ON").unwrap();

        let val = db.pragma_get("foreign_keys").unwrap();
        assert_eq!(val, serde_json::json!(1));
    }
}
