use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;

// --- Structs ---

#[napi(object)]
#[derive(Clone)]
pub struct DirOrFile {
    pub name: String,
    pub full_path: String,
    pub relative_path: String,
    pub is_dir: bool,
    pub is_file: bool,
    pub children: Option<Vec<DirOrFile>>,
}

// --- Conversions ---

fn to_napi(d: aionui_fs::DirOrFile) -> DirOrFile {
    DirOrFile {
        name: d.name,
        full_path: d.full_path,
        relative_path: d.relative_path,
        is_dir: d.is_dir,
        is_file: d.is_file,
        children: d
            .children
            .map(|c| c.into_iter().map(to_napi).collect()),
    }
}

// --- read_directory_tree (async) ---

pub struct ReadDirectoryTreeTask {
    dir_path: String,
    root: String,
    max_depth: u32,
    skip_names: Vec<String>,
    search_text: Option<String>,
}

#[napi]
impl Task for ReadDirectoryTreeTask {
    type Output = Option<DirOrFile>;
    type JsValue = Option<DirOrFile>;

    fn compute(&mut self) -> Result<Self::Output> {
        aionui_fs::read_directory_tree(
            &self.dir_path,
            &self.root,
            self.max_depth,
            &self.skip_names,
            self.search_text.as_deref(),
        )
        .map(|opt| opt.map(to_napi))
        .map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

#[napi]
pub fn read_directory_tree(
    dir_path: String,
    root: Option<String>,
    max_depth: Option<u32>,
    skip_names: Option<Vec<String>>,
    search_text: Option<String>,
) -> AsyncTask<ReadDirectoryTreeTask> {
    let root = root.unwrap_or_else(|| dir_path.clone());
    let max_depth = max_depth.unwrap_or(1);
    let mut skip = skip_names.unwrap_or_default();
    // Always skip node_modules
    if !skip.iter().any(|s| s == "node_modules") {
        skip.push("node_modules".to_string());
    }
    AsyncTask::new(ReadDirectoryTreeTask {
        dir_path,
        root,
        max_depth,
        skip_names: skip,
        search_text,
    })
}

// --- copy_directory (async) ---

pub struct CopyDirectoryTask {
    src: String,
    dest: String,
    overwrite: bool,
}

#[napi]
impl Task for CopyDirectoryTask {
    type Output = ();
    type JsValue = ();

    fn compute(&mut self) -> Result<Self::Output> {
        aionui_fs::copy_directory(&self.src, &self.dest, self.overwrite)
            .map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    fn resolve(&mut self, _env: Env, _output: Self::Output) -> Result<Self::JsValue> {
        Ok(())
    }
}

#[napi]
pub fn copy_directory(
    src: String,
    dest: String,
    overwrite: Option<bool>,
) -> AsyncTask<CopyDirectoryTask> {
    AsyncTask::new(CopyDirectoryTask {
        src,
        dest,
        overwrite: overwrite.unwrap_or(true),
    })
}

// --- verify_directory_structure (async) ---

pub struct VerifyDirectoryStructureTask {
    dir1: String,
    dir2: String,
}

#[napi]
impl Task for VerifyDirectoryStructureTask {
    type Output = bool;
    type JsValue = bool;

    fn compute(&mut self) -> Result<Self::Output> {
        aionui_fs::verify_directory_structure(&self.dir1, &self.dir2)
            .map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

#[napi]
pub fn verify_directory_structure(
    dir1: String,
    dir2: String,
) -> AsyncTask<VerifyDirectoryStructureTask> {
    AsyncTask::new(VerifyDirectoryStructureTask { dir1, dir2 })
}

// --- ensure_dir (sync) ---

#[napi]
pub fn ensure_dir(dir_path: String) -> Result<()> {
    aionui_fs::ensure_dir(&dir_path)
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}
