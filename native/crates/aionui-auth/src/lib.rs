mod password;
mod token;
mod validation;
mod generation;
mod crypto;

pub use password::{hash_password, verify_password};
pub use token::{generate_token, verify_jwt, JwtPayload};
pub use validation::{validate_username, validate_password_strength, ValidationResult};
pub use generation::{
    generate_random_password, generate_user_credentials, generate_session_id,
    generate_secret_key, UserCredentials,
};
pub use crypto::{constant_time_compare, sha256_hex};

#[derive(thiserror::Error, Debug)]
pub enum AuthError {
    #[error("password hashing failed: {0}")]
    HashFailed(String),

    #[error("password verification failed: {0}")]
    VerifyFailed(String),

    #[error("token signing failed: {0}")]
    TokenSignFailed(String),

    #[error("invalid token")]
    InvalidToken,

    #[error("token expired")]
    TokenExpired,
}
