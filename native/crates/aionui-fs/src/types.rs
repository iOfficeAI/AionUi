/// Represents a file or directory entry in a recursive directory tree.
///
/// Mirrors the TypeScript `IDirOrFile` interface from `ipcBridge.ts`.
#[derive(Debug, Clone)]
pub struct DirOrFile {
    pub name: String,
    pub full_path: String,
    pub relative_path: String,
    pub is_dir: bool,
    pub is_file: bool,
    pub children: Option<Vec<DirOrFile>>,
}
