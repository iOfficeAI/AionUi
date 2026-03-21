use napi::Result;
use napi_derive::napi;

#[napi(object)]
pub struct RunResult {
    pub changes: i64,
    pub last_insert_rowid: i64,
}

#[napi]
pub struct Database {
    inner: Option<aionui_db::Database>,
}

#[napi]
impl Database {
    #[napi(constructor)]
    pub fn new(path: String) -> Result<Self> {
        let db =
            aionui_db::Database::new(&path).map_err(|e| napi::Error::from_reason(e.to_string()))?;
        Ok(Self { inner: Some(db) })
    }

    #[napi]
    pub fn close(&mut self) -> Result<()> {
        let db = self
            .inner
            .take()
            .ok_or_else(|| napi::Error::from_reason("Database is closed"))?;
        db.close()
            .map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    #[napi]
    pub fn exec(&self, sql: String) -> Result<()> {
        self.db()?
            .exec(&sql)
            .map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    #[napi]
    pub fn run(
        &self,
        sql: String,
        params: Option<Vec<serde_json::Value>>,
    ) -> Result<RunResult> {
        let params = params.unwrap_or_default();
        let r = self
            .db()?
            .run(&sql, &params)
            .map_err(|e| napi::Error::from_reason(e.to_string()))?;
        Ok(RunResult {
            changes: r.changes,
            last_insert_rowid: r.last_insert_rowid,
        })
    }

    #[napi]
    pub fn get(
        &self,
        sql: String,
        params: Option<Vec<serde_json::Value>>,
    ) -> Result<serde_json::Value> {
        let params = params.unwrap_or_default();
        self.db()?
            .get(&sql, &params)
            .map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    #[napi]
    pub fn all(
        &self,
        sql: String,
        params: Option<Vec<serde_json::Value>>,
    ) -> Result<Vec<serde_json::Value>> {
        let params = params.unwrap_or_default();
        self.db()?
            .all(&sql, &params)
            .map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    #[napi]
    pub fn pragma_get(&self, name: String) -> Result<serde_json::Value> {
        self.db()?
            .pragma_get(&name)
            .map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    #[napi]
    pub fn pragma_set(&self, statement: String) -> Result<()> {
        self.db()?
            .pragma_set(&statement)
            .map_err(|e| napi::Error::from_reason(e.to_string()))
    }
}

impl Database {
    fn db(&self) -> Result<&aionui_db::Database> {
        self.inner
            .as_ref()
            .ok_or_else(|| napi::Error::from_reason("Database is closed"))
    }
}
