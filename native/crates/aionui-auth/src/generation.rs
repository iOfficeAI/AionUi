use rand::Rng;

/// User credentials for initial bootstrap.
#[derive(Debug, Clone)]
pub struct UserCredentials {
    pub username: String,
    pub password: String,
    pub created_at: i64,
}

/// Character sets for password generation.
const LOWERCASE: &[u8] = b"abcdefghijklmnopqrstuvwxyz";
const UPPERCASE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS: &[u8] = b"0123456789";
const SPECIAL: &[u8] = b"!@#$%^&*";

/// Generate a random password with required complexity.
/// Length: 12-16 chars. Guarantees at least one char from each category.
/// Uses Fisher-Yates shuffle to avoid predictable category order.
pub fn generate_random_password() -> String {
    let mut rng = rand::thread_rng();
    let password_length = 12 + rng.gen_range(0..5); // 12-16

    let pick = |chars: &[u8], rng: &mut rand::rngs::ThreadRng| -> char {
        chars[rng.gen_range(0..chars.len())] as char
    };

    // Ensure one char from each category
    let mut chars: Vec<char> = vec![
        pick(LOWERCASE, &mut rng),
        pick(UPPERCASE, &mut rng),
        pick(DIGITS, &mut rng),
        pick(SPECIAL, &mut rng),
    ];

    // Fill remaining with any character
    let all_chars: Vec<u8> = [LOWERCASE, UPPERCASE, DIGITS, SPECIAL].concat();
    for _ in 0..(password_length - chars.len()) {
        chars.push(all_chars[rng.gen_range(0..all_chars.len())] as char);
    }

    // Fisher-Yates shuffle
    for i in (1..chars.len()).rev() {
        let j = rng.gen_range(0..=i);
        chars.swap(i, j);
    }

    chars.into_iter().collect()
}

/// Generate random credentials for initial bootstrap.
/// Username: 6-8 lowercase alphanumeric chars.
pub fn generate_user_credentials() -> UserCredentials {
    let mut rng = rand::thread_rng();
    let username_length = rng.gen_range(6..=8);
    let username_chars = b"abcdefghijklmnopqrstuvwxyz0123456789";

    let username: String = (0..username_length)
        .map(|_| username_chars[rng.gen_range(0..username_chars.len())] as char)
        .collect();

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64;

    UserCredentials {
        username,
        password: generate_random_password(),
        created_at: now,
    }
}

/// Generate a high-entropy session identifier (32 random bytes -> 64 hex chars).
pub fn generate_session_id() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill(&mut bytes);
    hex::encode(bytes)
}

/// Generate a high-entropy secret key (64 random bytes -> 128 hex chars).
pub fn generate_secret_key() -> String {
    let mut bytes = [0u8; 64];
    rand::thread_rng().fill(&mut bytes);
    hex::encode(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn random_password_length() {
        for _ in 0..100 {
            let p = generate_random_password();
            assert!(p.len() >= 12 && p.len() <= 16, "len={}", p.len());
        }
    }

    #[test]
    fn random_password_has_all_categories() {
        for _ in 0..100 {
            let p = generate_random_password();
            assert!(p.chars().any(|c| c.is_ascii_lowercase()), "missing lowercase: {p}");
            assert!(p.chars().any(|c| c.is_ascii_uppercase()), "missing uppercase: {p}");
            assert!(p.chars().any(|c| c.is_ascii_digit()), "missing digit: {p}");
            assert!(
                p.chars().any(|c| "!@#$%^&*".contains(c)),
                "missing special: {p}"
            );
        }
    }

    #[test]
    fn user_credentials_format() {
        let creds = generate_user_credentials();
        assert!(creds.username.len() >= 6 && creds.username.len() <= 8);
        assert!(creds.username.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()));
        assert!(creds.password.len() >= 12);
        assert!(creds.created_at > 0);
    }

    #[test]
    fn session_id_format() {
        let id = generate_session_id();
        assert_eq!(id.len(), 64, "session id should be 64 hex chars");
        assert!(id.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn secret_key_format() {
        let key = generate_secret_key();
        assert_eq!(key.len(), 128, "secret key should be 128 hex chars");
        assert!(key.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn session_ids_are_unique() {
        let a = generate_session_id();
        let b = generate_session_id();
        assert_ne!(a, b);
    }

    #[test]
    fn passwords_pass_strength_validation() {
        for _ in 0..100 {
            let p = generate_random_password();
            let r = crate::validate_password_strength(&p);
            assert!(r.is_valid, "generated password should pass validation: {p}");
        }
    }
}
