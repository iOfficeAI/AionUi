use napi::bindgen_prelude::*;
use napi::Task;
use napi_derive::napi;

// --- Structs ---

#[napi(object)]
pub struct JwtPayload {
    pub user_id: String,
    pub username: String,
}

#[napi(object)]
pub struct UserCredentials {
    pub username: String,
    pub password: String,
    pub created_at: i64,
}

#[napi(object)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub errors: Vec<String>,
}

// --- Password hashing (async via libuv thread pool) ---

pub struct HashPasswordTask {
    password: String,
}

#[napi]
impl Task for HashPasswordTask {
    type Output = String;
    type JsValue = String;

    fn compute(&mut self) -> Result<Self::Output> {
        aionui_auth::hash_password(&self.password)
            .map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

#[napi]
pub fn hash_password(password: String) -> AsyncTask<HashPasswordTask> {
    AsyncTask::new(HashPasswordTask { password })
}

pub struct VerifyPasswordTask {
    password: String,
    hash: String,
}

#[napi]
impl Task for VerifyPasswordTask {
    type Output = bool;
    type JsValue = bool;

    fn compute(&mut self) -> Result<Self::Output> {
        aionui_auth::verify_password(&self.password, &self.hash)
            .map_err(|e| napi::Error::from_reason(e.to_string()))
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

#[napi]
pub fn verify_password(password: String, hash: String) -> AsyncTask<VerifyPasswordTask> {
    AsyncTask::new(VerifyPasswordTask { password, hash })
}

// --- JWT (sync) ---

#[napi]
pub fn generate_token(payload: JwtPayload, secret: String, expires_in: String) -> Result<String> {
    let inner = aionui_auth::JwtPayload {
        user_id: payload.user_id,
        username: payload.username,
    };
    aionui_auth::generate_token(&inner, &secret, &expires_in)
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub fn verify_jwt(token: String, secret: String) -> Option<JwtPayload> {
    aionui_auth::verify_jwt(&token, &secret).map(|p| JwtPayload {
        user_id: p.user_id,
        username: p.username,
    })
}

// --- Validation (sync) ---

#[napi]
pub fn validate_username(username: String) -> ValidationResult {
    let r = aionui_auth::validate_username(&username);
    ValidationResult {
        is_valid: r.is_valid,
        errors: r.errors,
    }
}

#[napi]
pub fn validate_password_strength(password: String) -> ValidationResult {
    let r = aionui_auth::validate_password_strength(&password);
    ValidationResult {
        is_valid: r.is_valid,
        errors: r.errors,
    }
}

// --- Generation (sync) ---

#[napi]
pub fn generate_random_password() -> String {
    aionui_auth::generate_random_password()
}

#[napi]
pub fn generate_user_credentials() -> UserCredentials {
    let c = aionui_auth::generate_user_credentials();
    UserCredentials {
        username: c.username,
        password: c.password,
        created_at: c.created_at,
    }
}

#[napi]
pub fn generate_session_id() -> String {
    aionui_auth::generate_session_id()
}

#[napi]
pub fn generate_secret_key() -> String {
    aionui_auth::generate_secret_key()
}

// --- Crypto utilities (sync) ---

#[napi]
pub fn constant_time_compare(a: String, b: String) -> bool {
    aionui_auth::constant_time_compare(a.as_bytes(), b.as_bytes())
}

#[napi]
pub fn sha256_hex(input: String) -> String {
    aionui_auth::sha256_hex(input.as_bytes())
}
