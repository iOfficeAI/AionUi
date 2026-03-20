use std::fs;
use std::path::Path;

use crate::types::DirOrFile;
use crate::FsError;

/// Build a recursive directory tree rooted at `dir_path`.
///
/// - `root`: base path for computing relative paths.
/// - `max_depth`: how many levels to recurse (0 = return entry with no children).
/// - `skip_names`: directory/file names to skip entirely (e.g. `node_modules`).
/// - `search_text`: when set, only include entries whose name contains this substring,
///   plus their ancestor directories. Depth is not decremented when searching.
///
/// Returns `Ok(None)` if the path does not exist or is not a directory.
pub fn read_directory_tree(
    dir_path: &str,
    root: &str,
    max_depth: u32,
    skip_names: &[String],
    search_text: Option<&str>,
) -> Result<Option<DirOrFile>, FsError> {
    let dir = Path::new(dir_path);

    // Return None for non-existent or non-directory paths (matches TS behavior)
    match fs::metadata(dir) {
        Ok(meta) if meta.is_dir() => {}
        Ok(_) => return Ok(None),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(FsError::Io(e)),
    }

    let root_path = Path::new(root);
    let rel = relative_path(root_path, dir);

    let mut result = DirOrFile {
        name: dir
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default(),
        full_path: dir_path.to_string(),
        relative_path: rel,
        is_dir: true,
        is_file: false,
        children: Some(Vec::new()),
    };

    // When searching: if the directory name matches, return it immediately (leaf match)
    if let Some(text) = search_text {
        if result.name.contains(text) {
            return Ok(Some(result));
        }
    }

    // maxDepth=0: return the entry without recursing into children
    if max_depth == 0 {
        return Ok(Some(result));
    }

    let entries = match fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => {
            // Return the dir node with empty children on permission errors
            return Ok(Some(result));
        }
        Err(e) => return Err(FsError::Io(e)),
    };

    let children = result.children.as_mut().unwrap();

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue, // Skip unreadable entries
        };

        let name = entry.file_name().to_string_lossy().to_string();

        // Skip entries in the skip list
        if skip_names.iter().any(|s| s == &name) {
            continue;
        }

        let item_path = entry.path();
        let item_path_str = item_path.to_string_lossy().to_string();

        // stat may fail if the file was deleted between readdir and stat (race condition)
        let meta = match fs::metadata(&item_path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        if meta.is_dir() {
            // Recurse: when searching, keep maxDepth constant; otherwise decrement
            let next_depth = if search_text.is_some() {
                max_depth
            } else {
                max_depth - 1
            };

            let child = read_directory_tree(
                &item_path_str,
                root,
                next_depth,
                skip_names,
                search_text,
            )?;

            if let Some(child_node) = child {
                if search_text.is_some() {
                    // Only include if child has matching descendants
                    let has_children = child_node
                        .children
                        .as_ref()
                        .is_some_and(|c| !c.is_empty());
                    if has_children || child_node.name.contains(search_text.unwrap_or("")) {
                        children.push(child_node);
                    }
                } else {
                    children.push(child_node);
                }
            }
        } else {
            let item_rel = relative_path(root_path, &item_path);
            let file_node = DirOrFile {
                name: name.clone(),
                full_path: item_path_str,
                relative_path: item_rel,
                is_dir: false,
                is_file: true,
                children: None,
            };

            if let Some(text) = search_text {
                if name.contains(text) {
                    children.push(file_node);
                }
            } else {
                children.push(file_node);
            }
        }
    }

    // Sort: directories first, then alphabetically by name
    children.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.cmp(&b.name),
        }
    });

    // When searching: only return this node if it has matching children
    if search_text.is_some() && children.is_empty() {
        return Ok(Some(DirOrFile {
            children: Some(Vec::new()),
            ..result
        }));
    }

    Ok(Some(result))
}

/// Ensure a directory exists, handling edge cases where a regular file
/// or broken symlink occupies the path.
///
/// Mirrors the TS `ensureDirectory` function behavior:
/// - If the path is an existing directory, no-op.
/// - If a symlink points to an existing directory, no-op.
/// - If a broken symlink or regular file blocks the path, remove it and create the directory.
/// - If the path does not exist, create it recursively.
pub fn ensure_dir(dir_path: &str) -> Result<(), FsError> {
    let path = Path::new(dir_path);

    match fs::symlink_metadata(path) {
        Ok(meta) => {
            if meta.is_dir() {
                return Ok(());
            }

            if meta.file_type().is_symlink() {
                // Check if the symlink target is a valid directory
                if path.exists() && path.is_dir() {
                    return Ok(());
                }
                // Broken symlink or points to non-directory, remove it
                fs::remove_file(path)?;
            } else {
                // Regular file blocking the directory path, remove it
                fs::remove_file(path)?;
            }
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            // Path doesn't exist, create it below
        }
        Err(e) => return Err(FsError::Io(e)),
    }

    fs::create_dir_all(path)?;
    Ok(())
}

/// Compute the relative path from `base` to `target`.
///
/// Uses a simple string-based approach that handles both Unix and Windows paths.
fn relative_path(base: &Path, target: &Path) -> String {
    match target.strip_prefix(base) {
        Ok(rel) => {
            let s = rel.to_string_lossy().to_string();
            if s.is_empty() {
                String::new()
            } else {
                s
            }
        }
        Err(_) => target.to_string_lossy().to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use std::fs;

    #[test]
    fn test_read_directory_tree_basic() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();

        fs::write(root.join("file.txt"), "hello").unwrap();
        fs::create_dir(root.join("sub")).unwrap();
        fs::write(root.join("sub").join("nested.txt"), "world").unwrap();

        let result = read_directory_tree(
            &root.to_string_lossy(),
            &root.to_string_lossy(),
            2,
            &[],
            None,
        )
        .unwrap();

        let tree = result.unwrap();
        assert!(tree.is_dir);
        let children = tree.children.as_ref().unwrap();
        assert_eq!(children.len(), 2);

        // Directories first, then alphabetically
        assert_eq!(children[0].name, "sub");
        assert!(children[0].is_dir);
        assert_eq!(children[1].name, "file.txt");
        assert!(children[1].is_file);

        // Nested
        let sub_children = children[0].children.as_ref().unwrap();
        assert_eq!(sub_children.len(), 1);
        assert_eq!(sub_children[0].name, "nested.txt");
    }

    #[test]
    fn test_read_directory_tree_nonexistent() {
        let result = read_directory_tree(
            "/nonexistent/path/abc123",
            "/nonexistent",
            1,
            &[],
            None,
        )
        .unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_read_directory_tree_file_path() {
        let tmp = TempDir::new().unwrap();
        let file = tmp.path().join("not_a_dir.txt");
        fs::write(&file, "content").unwrap();

        let result = read_directory_tree(
            &file.to_string_lossy(),
            &tmp.path().to_string_lossy(),
            1,
            &[],
            None,
        )
        .unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_read_directory_tree_max_depth_zero() {
        let tmp = TempDir::new().unwrap();
        fs::create_dir(tmp.path().join("sub")).unwrap();

        let result = read_directory_tree(
            &tmp.path().to_string_lossy(),
            &tmp.path().to_string_lossy(),
            0,
            &[],
            None,
        )
        .unwrap()
        .unwrap();

        // maxDepth=0: no children enumerated
        assert!(result.children.unwrap().is_empty());
    }

    #[test]
    fn test_read_directory_tree_max_depth_one() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        fs::create_dir(root.join("a")).unwrap();
        fs::create_dir(root.join("a").join("b")).unwrap();
        fs::write(root.join("a").join("b").join("deep.txt"), "").unwrap();

        let result = read_directory_tree(
            &root.to_string_lossy(),
            &root.to_string_lossy(),
            1,
            &[],
            None,
        )
        .unwrap()
        .unwrap();

        let children = result.children.as_ref().unwrap();
        let sub = children.iter().find(|c| c.name == "a").unwrap();
        assert!(sub.is_dir);
        // maxDepth=1: 'a' has empty children (not recursed into 'b')
        assert!(sub.children.as_ref().unwrap().is_empty());
    }

    #[test]
    fn test_read_directory_tree_skip_names() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        fs::create_dir(root.join("node_modules")).unwrap();
        fs::write(root.join("node_modules").join("pkg.js"), "").unwrap();
        fs::write(root.join("index.ts"), "").unwrap();

        let result = read_directory_tree(
            &root.to_string_lossy(),
            &root.to_string_lossy(),
            2,
            &["node_modules".to_string()],
            None,
        )
        .unwrap()
        .unwrap();

        let names: Vec<_> = result
            .children
            .as_ref()
            .unwrap()
            .iter()
            .map(|c| c.name.as_str())
            .collect();
        assert!(names.contains(&"index.ts"));
        assert!(!names.contains(&"node_modules"));
    }

    #[test]
    fn test_read_directory_tree_search() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        fs::create_dir(root.join("src")).unwrap();
        fs::write(root.join("src").join("main.rs"), "").unwrap();
        fs::write(root.join("src").join("util.rs"), "").unwrap();
        fs::write(root.join("README.md"), "").unwrap();

        let result = read_directory_tree(
            &root.to_string_lossy(),
            &root.to_string_lossy(),
            10,
            &[],
            Some("main"),
        )
        .unwrap()
        .unwrap();

        // Should include src/ (because it has matching child) and main.rs
        let children = result.children.as_ref().unwrap();
        // The src dir should be included because it has a matching child
        let src = children.iter().find(|c| c.name == "src");
        assert!(src.is_some());
        let src_children = src.unwrap().children.as_ref().unwrap();
        assert!(src_children.iter().any(|c| c.name == "main.rs"));
        // util.rs should NOT be in search results
        assert!(!src_children.iter().any(|c| c.name == "util.rs"));
    }

    #[test]
    fn test_read_directory_tree_relative_paths() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        fs::create_dir(root.join("sub")).unwrap();
        fs::write(root.join("sub").join("file.txt"), "").unwrap();

        let result = read_directory_tree(
            &root.to_string_lossy(),
            &root.to_string_lossy(),
            2,
            &[],
            None,
        )
        .unwrap()
        .unwrap();

        // Root has empty relative path
        assert!(result.relative_path.is_empty());

        let children = result.children.as_ref().unwrap();
        let sub = children.iter().find(|c| c.name == "sub").unwrap();
        assert_eq!(sub.relative_path, "sub");

        let nested = sub.children.as_ref().unwrap();
        let file = nested.iter().find(|c| c.name == "file.txt").unwrap();
        // Relative path uses OS separator
        assert!(
            file.relative_path == "sub/file.txt"
                || file.relative_path == "sub\\file.txt"
        );
    }

    #[test]
    fn test_read_directory_tree_sort_order() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        fs::write(root.join("zebra.txt"), "").unwrap();
        fs::write(root.join("alpha.txt"), "").unwrap();
        fs::create_dir(root.join("beta_dir")).unwrap();
        fs::create_dir(root.join("alpha_dir")).unwrap();

        let result = read_directory_tree(
            &root.to_string_lossy(),
            &root.to_string_lossy(),
            1,
            &[],
            None,
        )
        .unwrap()
        .unwrap();

        let names: Vec<_> = result
            .children
            .as_ref()
            .unwrap()
            .iter()
            .map(|c| c.name.as_str())
            .collect();
        // Dirs first (alphabetically), then files (alphabetically)
        assert_eq!(names, vec!["alpha_dir", "beta_dir", "alpha.txt", "zebra.txt"]);
    }

    #[test]
    fn test_ensure_dir_creates_new() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().join("new_dir").join("nested");

        ensure_dir(&dir.to_string_lossy()).unwrap();
        assert!(dir.exists());
        assert!(dir.is_dir());
    }

    #[test]
    fn test_ensure_dir_existing_directory() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().join("existing");
        fs::create_dir(&dir).unwrap();

        // Should be a no-op
        ensure_dir(&dir.to_string_lossy()).unwrap();
        assert!(dir.is_dir());
    }

    #[test]
    fn test_ensure_dir_file_blocking() {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().join("blocker");
        fs::write(&path, "I'm a file").unwrap();

        // Should remove the file and create a directory
        ensure_dir(&path.to_string_lossy()).unwrap();
        assert!(path.is_dir());
    }

    #[test]
    fn test_read_directory_tree_empty_dir() {
        let tmp = TempDir::new().unwrap();

        let result = read_directory_tree(
            &tmp.path().to_string_lossy(),
            &tmp.path().to_string_lossy(),
            1,
            &[],
            None,
        )
        .unwrap()
        .unwrap();

        assert!(result.is_dir);
        assert!(result.children.as_ref().unwrap().is_empty());
    }
}
