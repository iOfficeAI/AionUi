use regex::Regex;
use std::sync::LazyLock;

/// Validation result matching TS `{ isValid: boolean, errors: string[] }`.
#[derive(Debug, Clone)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub errors: Vec<String>,
}

/// Regex for valid username characters: alphanumeric, hyphen, underscore.
static USERNAME_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[a-zA-Z0-9_-]+$").unwrap());

/// Regex for leading/trailing hyphen or underscore.
static USERNAME_EDGE_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[_-]|[_-]$").unwrap());

/// Weak passwords blocklist (lowercase comparison).
const WEAK_PASSWORDS: &[&str] = &[
    "password",
    "12345678",
    "123456789",
    "qwertyui",
    "abcdefgh",
];

/// Validate username format requirements.
/// Rules: 3-32 chars, alphanumeric + hyphen + underscore, no leading/trailing _-.
pub fn validate_username(username: &str) -> ValidationResult {
    let mut errors = Vec::new();

    if username.len() < 3 {
        errors.push("Username must be at least 3 characters long".to_string());
    }

    if username.len() > 32 {
        errors.push("Username must be less than 32 characters long".to_string());
    }

    if !USERNAME_REGEX.is_match(username) {
        errors.push(
            "Username can only contain letters, numbers, hyphens, and underscores".to_string(),
        );
    }

    if USERNAME_EDGE_REGEX.is_match(username) {
        errors.push("Username cannot start or end with hyphen or underscore".to_string());
    }

    ValidationResult {
        is_valid: errors.is_empty(),
        errors,
    }
}

/// Validate password strength (simplified for local WebUI).
/// Rules: min 8 chars, max 128 chars, not in weak passwords list.
pub fn validate_password_strength(password: &str) -> ValidationResult {
    let mut errors = Vec::new();

    if password.len() < 8 {
        errors.push("Password must be at least 8 characters long".to_string());
    }

    if password.len() > 128 {
        errors.push("Password must be less than 128 characters long".to_string());
    }

    if WEAK_PASSWORDS.contains(&password.to_lowercase().as_str()) {
        errors.push("Password is too common, please choose a stronger one".to_string());
    }

    ValidationResult {
        is_valid: errors.is_empty(),
        errors,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- validate_username ---

    #[test]
    fn username_valid() {
        let r = validate_username("admin");
        assert!(r.is_valid);
        assert!(r.errors.is_empty());
    }

    #[test]
    fn username_valid_with_numbers_and_specials() {
        let r = validate_username("user-name_123");
        assert!(r.is_valid);
    }

    #[test]
    fn username_too_short() {
        let r = validate_username("ab");
        assert!(!r.is_valid);
        assert!(r.errors.iter().any(|e| e.contains("at least 3")));
    }

    #[test]
    fn username_too_long() {
        let long = "a".repeat(33);
        let r = validate_username(&long);
        assert!(!r.is_valid);
        assert!(r.errors.iter().any(|e| e.contains("less than 32")));
    }

    #[test]
    fn username_invalid_chars() {
        let r = validate_username("user@name");
        assert!(!r.is_valid);
        assert!(r.errors.iter().any(|e| e.contains("letters, numbers")));
    }

    #[test]
    fn username_leading_underscore() {
        let r = validate_username("_user");
        assert!(!r.is_valid);
        assert!(r.errors.iter().any(|e| e.contains("cannot start or end")));
    }

    #[test]
    fn username_trailing_hyphen() {
        let r = validate_username("user-");
        assert!(!r.is_valid);
        assert!(r.errors.iter().any(|e| e.contains("cannot start or end")));
    }

    #[test]
    fn username_unicode_rejected() {
        let r = validate_username("用户名");
        assert!(!r.is_valid);
    }

    #[test]
    fn username_empty() {
        let r = validate_username("");
        assert!(!r.is_valid);
        assert!(r.errors.iter().any(|e| e.contains("at least 3")));
    }

    // --- validate_password_strength ---

    #[test]
    fn password_valid() {
        let r = validate_password_strength("StrongP@ss1");
        assert!(r.is_valid);
        assert!(r.errors.is_empty());
    }

    #[test]
    fn password_too_short() {
        let r = validate_password_strength("short");
        assert!(!r.is_valid);
        assert!(r.errors.iter().any(|e| e.contains("at least 8")));
    }

    #[test]
    fn password_too_long() {
        let long = "a".repeat(129);
        let r = validate_password_strength(&long);
        assert!(!r.is_valid);
        assert!(r.errors.iter().any(|e| e.contains("less than 128")));
    }

    #[test]
    fn password_weak_blocklist() {
        for weak in &["password", "12345678", "123456789", "qwertyui", "abcdefgh"] {
            let r = validate_password_strength(weak);
            assert!(!r.is_valid, "should reject weak password: {weak}");
            assert!(r.errors.iter().any(|e| e.contains("too common")));
        }
    }

    #[test]
    fn password_weak_case_insensitive() {
        let r = validate_password_strength("PASSWORD");
        assert!(!r.is_valid);
        assert!(r.errors.iter().any(|e| e.contains("too common")));
    }

    #[test]
    fn password_exactly_8_chars() {
        let r = validate_password_strength("Abcd1234");
        assert!(r.is_valid);
    }

    #[test]
    fn password_exactly_128_chars() {
        let long = "A".repeat(128);
        let r = validate_password_strength(&long);
        assert!(r.is_valid);
    }
}
