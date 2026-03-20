use base64::{
    alphabet,
    engine::{general_purpose, DecodePaddingMode, GeneralPurpose, GeneralPurposeConfig},
    Engine as _,
};

/// Standard Base64 encoder (with padding, for encryptString output).
const ENCODER: GeneralPurpose = general_purpose::STANDARD;

/// Lenient Base64 decoder: accepts missing padding, matching Node.js behavior.
const LENIENT_DECODER: GeneralPurpose = GeneralPurpose::new(
    &alphabet::STANDARD,
    GeneralPurposeConfig::new()
        .with_decode_padding_mode(DecodePaddingMode::Indifferent)
        .with_decode_allow_trailing_bits(true),
);

/// Check if encryption is available (always true for Base64 storage)
pub fn is_encryption_available() -> bool {
    true
}

/// Encode a string value for storage using Base64 with `b64:` prefix.
/// Returns empty string for empty input.
pub fn encrypt_string(plaintext: &str) -> String {
    if plaintext.is_empty() {
        return String::new();
    }
    let encoded = ENCODER.encode(plaintext.as_bytes());
    format!("b64:{encoded}")
}

/// Lenient base64 decode that matches Node.js Buffer.from(str, 'base64') behavior.
/// Node.js silently ignores non-base64 characters and doesn't require padding.
fn lenient_base64_decode(input: &str) -> String {
    // Strip characters outside the base64 alphabet, matching Node.js behavior
    let cleaned: String = input
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '+' || *c == '/' || *c == '=')
        .collect();
    match LENIENT_DECODER.decode(&cleaned) {
        // Use from_utf8_lossy to match Node.js Buffer.toString('utf-8'),
        // which replaces invalid UTF-8 sequences with U+FFFD
        Ok(bytes) => String::from_utf8_lossy(&bytes).into_owned(),
        Err(_) => String::new(),
    }
}

/// Decode a previously encoded string.
/// Handles `b64:`, `enc:` (legacy), `plain:` prefixes, and raw legacy values.
pub fn decrypt_string(encoded: &str) -> String {
    if encoded.is_empty() {
        return String::new();
    }

    // Handle plain: prefix
    if let Some(rest) = encoded.strip_prefix("plain:") {
        return rest.to_string();
    }

    // Handle b64: prefix (current format)
    if let Some(rest) = encoded.strip_prefix("b64:") {
        return lenient_base64_decode(rest);
    }

    // Handle enc: prefix (legacy safeStorage format, try base64 decode)
    if let Some(rest) = encoded.strip_prefix("enc:") {
        return lenient_base64_decode(rest);
    }

    // Legacy: no prefix, return as-is for backward compatibility
    encoded.to_string()
}

/// Encrypt only the `token` field in a credentials JSON object.
/// Non-string or empty token values are left unchanged.
pub fn encrypt_credentials(credentials: &mut serde_json::Value) {
    if let Some(token) = credentials.get("token").and_then(|v| v.as_str()) {
        if !token.is_empty() {
            let encrypted = encrypt_string(token);
            credentials["token"] = serde_json::Value::String(encrypted);
        }
    }
}

/// Decrypt only the `token` field in a credentials JSON object.
/// Non-string or empty token values are left unchanged.
pub fn decrypt_credentials(credentials: &mut serde_json::Value) {
    if let Some(token) = credentials.get("token").and_then(|v| v.as_str()) {
        if !token.is_empty() {
            let decrypted = decrypt_string(token);
            credentials["token"] = serde_json::Value::String(decrypted);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn is_encryption_always_available() {
        assert!(is_encryption_available());
    }

    #[test]
    fn encrypt_empty_returns_empty() {
        assert_eq!(encrypt_string(""), "");
    }

    #[test]
    fn encrypt_normal_string() {
        assert_eq!(encrypt_string("my-secret-token"), "b64:bXktc2VjcmV0LXRva2Vu");
    }

    #[test]
    fn encrypt_unicode() {
        let result = encrypt_string("令牌-密钥-🔑");
        assert!(result.starts_with("b64:"));
        assert_eq!(decrypt_string(&result), "令牌-密钥-🔑");
    }

    #[test]
    fn decrypt_b64_prefix() {
        assert_eq!(
            decrypt_string("b64:bXktc2VjcmV0LXRva2Vu"),
            "my-secret-token"
        );
    }

    #[test]
    fn decrypt_enc_legacy_prefix() {
        assert_eq!(
            decrypt_string("enc:bXktc2VjcmV0LXRva2Vu"),
            "my-secret-token"
        );
    }

    #[test]
    fn decrypt_plain_prefix() {
        assert_eq!(decrypt_string("plain:my-secret-token"), "my-secret-token");
    }

    #[test]
    fn decrypt_no_prefix_legacy() {
        assert_eq!(decrypt_string("raw-legacy-value"), "raw-legacy-value");
    }

    #[test]
    fn decrypt_invalid_base64_lenient() {
        // Matches Node.js behavior: strips non-base64 chars, decodes remainder
        let result = decrypt_string("b64:!!!invalid!!!");
        assert!(!result.is_empty(), "lenient decode should produce output like Node.js");
    }

    #[test]
    fn decrypt_empty_returns_empty() {
        assert_eq!(decrypt_string(""), "");
    }

    #[test]
    fn encrypt_credentials_with_token() {
        let mut creds = json!({ "token": "abc", "name": "test" });
        encrypt_credentials(&mut creds);
        assert_eq!(creds["token"], "b64:YWJj");
        assert_eq!(creds["name"], "test");
    }

    #[test]
    fn encrypt_credentials_without_token() {
        let mut creds = json!({ "name": "test" });
        encrypt_credentials(&mut creds);
        assert_eq!(creds, json!({ "name": "test" }));
    }

    #[test]
    fn encrypt_credentials_empty_token() {
        let mut creds = json!({ "token": "", "name": "test" });
        encrypt_credentials(&mut creds);
        assert_eq!(creds["token"], "");
    }

    #[test]
    fn decrypt_credentials_roundtrip() {
        let mut creds = json!({ "token": "my-secret", "name": "test", "enabled": true });
        encrypt_credentials(&mut creds);
        assert_ne!(creds["token"], "my-secret");
        decrypt_credentials(&mut creds);
        assert_eq!(creds["token"], "my-secret");
        assert_eq!(creds["name"], "test");
        assert_eq!(creds["enabled"], true);
    }

    #[test]
    fn credentials_non_string_token_unchanged() {
        let mut creds = json!({ "token": 12345, "name": "test" });
        encrypt_credentials(&mut creds);
        assert_eq!(creds["token"], 12345);
    }

    #[test]
    fn credentials_boolean_token_unchanged() {
        let mut creds = json!({ "token": true, "name": "test" });
        encrypt_credentials(&mut creds);
        assert_eq!(creds["token"], true);
    }
}
