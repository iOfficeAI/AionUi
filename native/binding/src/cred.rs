use napi_derive::napi;
use serde_json::Value;

#[napi]
pub fn is_encryption_available() -> bool {
    aionui_cred::is_encryption_available()
}

#[napi]
pub fn encrypt_string(plaintext: String) -> String {
    aionui_cred::encrypt_string(&plaintext)
}

#[napi]
pub fn decrypt_string(encoded: String) -> String {
    aionui_cred::decrypt_string(&encoded)
}

#[napi]
pub fn encrypt_credentials(credentials: Option<Value>) -> Option<Value> {
    let mut creds = credentials?;
    aionui_cred::encrypt_credentials(&mut creds);
    Some(creds)
}

#[napi]
pub fn decrypt_credentials(credentials: Option<Value>) -> Option<Value> {
    let mut creds = credentials?;
    aionui_cred::decrypt_credentials(&mut creds);
    Some(creds)
}
