use std::fs;
use std::path::Path;

use crate::FsError;

/// Recursively copy a directory from `src` to `dest`.
///
/// Safety checks (matching TS `copyDirectoryRecursively`):
/// - Cannot copy into itself (src == dest)
/// - Cannot copy into a subdirectory of itself (dest starts with src)
/// - Cannot copy a parent into its child (src starts with dest)
///
/// On Windows, path comparison is case-insensitive.
pub fn copy_directory(src: &str, dest: &str, overwrite: bool) -> Result<(), FsError> {
    let src_path = Path::new(src);
    let dest_path = Path::new(dest);

    // Normalize for comparison
    let normalized_src = normalize_for_compare(src_path);
    let normalized_dest = normalize_for_compare(dest_path);
    let sep = std::path::MAIN_SEPARATOR.to_string();

    // Self-copy check
    if normalized_src == normalized_dest {
        return Err(FsError::SelfCopy(src.to_string()));
    }

    // Subdirectory-copy check (dest is inside src)
    if normalized_dest.starts_with(&format!("{}{}", normalized_src, sep)) {
        return Err(FsError::SubdirectoryCopy(
            src.to_string(),
            dest.to_string(),
        ));
    }

    // Parent-child check (src is inside dest)
    if normalized_src.starts_with(&format!("{}{}", normalized_dest, sep)) {
        return Err(FsError::ParentChildCopy(
            src.to_string(),
            dest.to_string(),
        ));
    }

    if !dest_path.exists() {
        fs::create_dir_all(dest_path)?;
    }

    let entries = fs::read_dir(src_path)?;

    for entry in entries {
        let entry = entry?;
        let src_entry = entry.path();
        let dest_entry = dest_path.join(entry.file_name());

        if entry.file_type()?.is_dir() {
            if !dest_entry.exists() {
                fs::create_dir_all(&dest_entry)?;
            }
            copy_directory(
                &src_entry.to_string_lossy(),
                &dest_entry.to_string_lossy(),
                overwrite,
            )?;
        } else {
            // Skip existing files when overwrite is false
            if !overwrite && dest_entry.exists() {
                continue;
            }
            fs::copy(&src_entry, &dest_entry)?;
        }
    }

    Ok(())
}

/// Verify that two directories have identical file name structure.
///
/// Returns `true` if both directories exist and contain the same set of
/// file/directory names at every level, recursively.
///
/// Returns `false` if either directory does not exist.
pub fn verify_directory_structure(dir1: &str, dir2: &str) -> Result<bool, FsError> {
    let path1 = Path::new(dir1);
    let path2 = Path::new(dir2);

    if !path1.exists() || !path2.exists() {
        return Ok(false);
    }

    verify_dirs_recursive(path1, path2)
}

fn verify_dirs_recursive(dir1: &Path, dir2: &Path) -> Result<bool, FsError> {
    let mut entries1 = read_sorted_entries(dir1)?;
    let mut entries2 = read_sorted_entries(dir2)?;

    if entries1.len() != entries2.len() {
        return Ok(false);
    }

    entries1.sort_by(|a, b| a.0.cmp(&b.0));
    entries2.sort_by(|a, b| a.0.cmp(&b.0));

    for (e1, e2) in entries1.iter().zip(entries2.iter()) {
        // Check name and type match
        if e1.0 != e2.0 || e1.1 != e2.1 {
            return Ok(false);
        }

        // Recurse into subdirectories
        if e1.1 {
            let sub1 = dir1.join(&e1.0);
            let sub2 = dir2.join(&e2.0);
            if !verify_dirs_recursive(&sub1, &sub2)? {
                return Ok(false);
            }
        }
    }

    Ok(true)
}

/// Read directory entries as (name, is_directory) pairs.
fn read_sorted_entries(dir: &Path) -> Result<Vec<(String, bool)>, FsError> {
    let entries = fs::read_dir(dir)?;
    let mut result = Vec::new();

    for entry in entries {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = entry.file_type()?.is_dir();
        result.push((name, is_dir));
    }

    Ok(result)
}

/// Normalize a path for comparison.
/// On Windows: resolve + lowercase (case-insensitive filesystem).
/// On Unix: resolve only (case-sensitive).
fn normalize_for_compare(path: &Path) -> String {
    let resolved = match std::fs::canonicalize(path) {
        Ok(p) => p.to_string_lossy().to_string(),
        // If path doesn't exist yet, use the original resolved path
        Err(_) => {
            // Best effort: join with current dir to make absolute
            let abs = if path.is_absolute() {
                path.to_path_buf()
            } else {
                std::env::current_dir()
                    .unwrap_or_default()
                    .join(path)
            };
            abs.to_string_lossy().to_string()
        }
    };

    if cfg!(windows) {
        resolved.to_lowercase()
    } else {
        resolved
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use std::fs;

    #[test]
    fn test_copy_directory_basic() {
        let tmp = TempDir::new().unwrap();
        let src = tmp.path().join("src_dir");
        let dest = tmp.path().join("dest_dir");

        fs::create_dir(&src).unwrap();
        fs::write(src.join("file.txt"), "hello").unwrap();
        fs::create_dir(src.join("sub")).unwrap();
        fs::write(src.join("sub").join("nested.txt"), "world").unwrap();

        copy_directory(
            &src.to_string_lossy(),
            &dest.to_string_lossy(),
            true,
        )
        .unwrap();

        assert!(dest.join("file.txt").exists());
        assert_eq!(fs::read_to_string(dest.join("file.txt")).unwrap(), "hello");
        assert!(dest.join("sub").join("nested.txt").exists());
        assert_eq!(
            fs::read_to_string(dest.join("sub").join("nested.txt")).unwrap(),
            "world"
        );
    }

    #[test]
    fn test_copy_directory_overwrite_true() {
        let tmp = TempDir::new().unwrap();
        let src = tmp.path().join("src");
        let dest = tmp.path().join("dest");

        fs::create_dir_all(&src).unwrap();
        fs::create_dir_all(&dest).unwrap();
        fs::write(src.join("file.txt"), "new content").unwrap();
        fs::write(dest.join("file.txt"), "old content").unwrap();

        copy_directory(
            &src.to_string_lossy(),
            &dest.to_string_lossy(),
            true,
        )
        .unwrap();

        assert_eq!(
            fs::read_to_string(dest.join("file.txt")).unwrap(),
            "new content"
        );
    }

    #[test]
    fn test_copy_directory_overwrite_false() {
        let tmp = TempDir::new().unwrap();
        let src = tmp.path().join("src");
        let dest = tmp.path().join("dest");

        fs::create_dir_all(&src).unwrap();
        fs::create_dir_all(&dest).unwrap();
        fs::write(src.join("file.txt"), "new content").unwrap();
        fs::write(dest.join("file.txt"), "old content").unwrap();

        copy_directory(
            &src.to_string_lossy(),
            &dest.to_string_lossy(),
            false,
        )
        .unwrap();

        // Should NOT overwrite
        assert_eq!(
            fs::read_to_string(dest.join("file.txt")).unwrap(),
            "old content"
        );
    }

    #[test]
    fn test_copy_directory_self_copy() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().join("dir");
        fs::create_dir(&dir).unwrap();

        let result = copy_directory(
            &dir.to_string_lossy(),
            &dir.to_string_lossy(),
            true,
        );
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("into itself"));
    }

    #[test]
    fn test_copy_directory_subdirectory_copy() {
        let tmp = TempDir::new().unwrap();
        let src = tmp.path().join("parent");
        let dest = tmp.path().join("parent").join("child");
        fs::create_dir_all(&dest).unwrap();

        let result = copy_directory(
            &src.to_string_lossy(),
            &dest.to_string_lossy(),
            true,
        );
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("subdirectory"));
    }

    #[test]
    fn test_copy_directory_parent_child_copy() {
        let tmp = TempDir::new().unwrap();
        let child = tmp.path().join("parent").join("child");
        let parent = tmp.path().join("parent");
        fs::create_dir_all(&child).unwrap();

        let result = copy_directory(
            &child.to_string_lossy(),
            &parent.to_string_lossy(),
            true,
        );
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("parent"));
    }

    #[test]
    fn test_copy_directory_empty_source() {
        let tmp = TempDir::new().unwrap();
        let src = tmp.path().join("empty_src");
        let dest = tmp.path().join("dest");
        fs::create_dir(&src).unwrap();

        copy_directory(
            &src.to_string_lossy(),
            &dest.to_string_lossy(),
            true,
        )
        .unwrap();

        assert!(dest.exists());
        assert!(dest.is_dir());
        assert!(fs::read_dir(&dest).unwrap().count() == 0);
    }

    #[test]
    fn test_verify_directory_structure_identical() {
        let tmp = TempDir::new().unwrap();
        let dir1 = tmp.path().join("dir1");
        let dir2 = tmp.path().join("dir2");

        fs::create_dir_all(dir1.join("sub")).unwrap();
        fs::write(dir1.join("file.txt"), "a").unwrap();
        fs::write(dir1.join("sub").join("nested.txt"), "b").unwrap();

        fs::create_dir_all(dir2.join("sub")).unwrap();
        fs::write(dir2.join("file.txt"), "c").unwrap();
        fs::write(dir2.join("sub").join("nested.txt"), "d").unwrap();

        let result = verify_directory_structure(
            &dir1.to_string_lossy(),
            &dir2.to_string_lossy(),
        )
        .unwrap();
        assert!(result);
    }

    #[test]
    fn test_verify_directory_structure_different_count() {
        let tmp = TempDir::new().unwrap();
        let dir1 = tmp.path().join("dir1");
        let dir2 = tmp.path().join("dir2");

        fs::create_dir(&dir1).unwrap();
        fs::create_dir(&dir2).unwrap();
        fs::write(dir1.join("a.txt"), "").unwrap();
        fs::write(dir1.join("b.txt"), "").unwrap();
        fs::write(dir2.join("a.txt"), "").unwrap();

        let result = verify_directory_structure(
            &dir1.to_string_lossy(),
            &dir2.to_string_lossy(),
        )
        .unwrap();
        assert!(!result);
    }

    #[test]
    fn test_verify_directory_structure_different_names() {
        let tmp = TempDir::new().unwrap();
        let dir1 = tmp.path().join("dir1");
        let dir2 = tmp.path().join("dir2");

        fs::create_dir(&dir1).unwrap();
        fs::create_dir(&dir2).unwrap();
        fs::write(dir1.join("alpha.txt"), "").unwrap();
        fs::write(dir2.join("beta.txt"), "").unwrap();

        let result = verify_directory_structure(
            &dir1.to_string_lossy(),
            &dir2.to_string_lossy(),
        )
        .unwrap();
        assert!(!result);
    }

    #[test]
    fn test_verify_directory_structure_nonexistent() {
        let result = verify_directory_structure(
            "/nonexistent/path1",
            "/nonexistent/path2",
        )
        .unwrap();
        assert!(!result);
    }

    #[test]
    fn test_verify_directory_structure_nested_difference() {
        let tmp = TempDir::new().unwrap();
        let dir1 = tmp.path().join("dir1");
        let dir2 = tmp.path().join("dir2");

        fs::create_dir_all(dir1.join("sub")).unwrap();
        fs::create_dir_all(dir2.join("sub")).unwrap();
        fs::write(dir1.join("sub").join("a.txt"), "").unwrap();
        fs::write(dir2.join("sub").join("b.txt"), "").unwrap();

        let result = verify_directory_structure(
            &dir1.to_string_lossy(),
            &dir2.to_string_lossy(),
        )
        .unwrap();
        assert!(!result);
    }
}
