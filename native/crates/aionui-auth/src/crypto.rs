use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

/// Constant-time string comparison to mitigate timing attacks.
/// Returns true only if both byte slices are identical.
pub fn constant_time_compare(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.ct_eq(b).into()
}

/// Compute SHA-256 hash and return as lowercase hex string.
pub fn sha256_hex(input: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input);
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn constant_time_equal() {
        assert!(constant_time_compare(b"abc", b"abc"));
    }

    #[test]
    fn constant_time_not_equal() {
        assert!(!constant_time_compare(b"abc", b"xyz"));
    }

    #[test]
    fn constant_time_different_lengths() {
        assert!(!constant_time_compare(b"short", b"longer"));
    }

    #[test]
    fn constant_time_empty() {
        assert!(constant_time_compare(b"", b""));
    }

    #[test]
    fn sha256_known_value() {
        // SHA-256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
        let result = sha256_hex(b"hello");
        assert_eq!(
            result,
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
        );
    }

    #[test]
    fn sha256_empty() {
        // SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
        let result = sha256_hex(b"");
        assert_eq!(
            result,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn sha256_deterministic() {
        let a = sha256_hex(b"test-input");
        let b = sha256_hex(b"test-input");
        assert_eq!(a, b);
    }
}
