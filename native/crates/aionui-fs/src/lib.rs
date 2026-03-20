mod types;
mod directory;
mod copy;

pub use types::DirOrFile;
pub use directory::{read_directory_tree, ensure_dir};
pub use copy::{copy_directory, verify_directory_structure};

#[derive(thiserror::Error, Debug)]
pub enum FsError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Cannot copy directory into itself: {0}")]
    SelfCopy(String),

    #[error("Cannot copy directory into its subdirectory: {0} -> {1}")]
    SubdirectoryCopy(String, String),

    #[error("Cannot copy parent directory into child directory: {0} -> {1}")]
    ParentChildCopy(String, String),
}
