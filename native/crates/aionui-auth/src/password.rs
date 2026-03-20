use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};

use crate::AuthError;

/// Hash a password using argon2id (recommended variant).
/// Returns the PHC-format hash string (e.g. "$argon2id$v=19$m=19456,t=2,p=1$...").
pub fn hash_password(password: &str) -> Result<String, AuthError> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    argon2
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| AuthError::HashFailed(e.to_string()))
}

/// Verify a password against a stored hash.
/// Auto-detects the algorithm by hash prefix:
/// - "$argon2" -> argon2 verification
/// - "$2a$" or "$2b$" -> bcrypt verification
/// - Other -> returns false
pub fn verify_password(password: &str, hash: &str) -> Result<bool, AuthError> {
    if hash.starts_with("$argon2") {
        verify_argon2(password, hash)
    } else if hash.starts_with("$2a$") || hash.starts_with("$2b$") {
        verify_bcrypt(password, hash)
    } else {
        Ok(false)
    }
}

fn verify_argon2(password: &str, hash: &str) -> Result<bool, AuthError> {
    let parsed = PasswordHash::new(hash).map_err(|e| AuthError::VerifyFailed(e.to_string()))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

fn verify_bcrypt(password: &str, hash: &str) -> Result<bool, AuthError> {
    bcrypt::verify(password, hash).map_err(|e| AuthError::VerifyFailed(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_produces_argon2id_format() {
        let hash = hash_password("test-password").unwrap();
        assert!(hash.starts_with("$argon2id$"), "hash should be argon2id format: {hash}");
    }

    #[test]
    fn hash_verify_roundtrip() {
        let password = "MyStr0ng!Pass";
        let hash = hash_password(password).unwrap();
        assert!(verify_password(password, &hash).unwrap());
    }

    #[test]
    fn verify_wrong_password_returns_false() {
        let hash = hash_password("correct").unwrap();
        assert!(!verify_password("wrong", &hash).unwrap());
    }

    #[test]
    fn verify_empty_password() {
        let hash = hash_password("").unwrap();
        assert!(verify_password("", &hash).unwrap());
        assert!(!verify_password("not-empty", &hash).unwrap());
    }

    #[test]
    fn verify_bcrypt_hash() {
        // Pre-generated bcrypt hash for "test123" with cost 12
        let hash = bcrypt::hash("test123", 4).unwrap();
        assert!(verify_password("test123", &hash).unwrap());
        assert!(!verify_password("wrong", &hash).unwrap());
    }

    #[test]
    fn verify_unknown_format_returns_false() {
        assert!(!verify_password("pass", "unknown-hash-format").unwrap());
    }

    #[test]
    fn hash_unicode_password() {
        let password = "密码测试🔐";
        let hash = hash_password(password).unwrap();
        assert!(verify_password(password, &hash).unwrap());
    }
}
