use serde::Serialize;
use serde_json::{Map, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::OnceLock,
};
use tauri::{AppHandle, Manager};

const SECRET_SERVICE: &str = "PixAI-Tauri";
static KEYRING_READY: OnceLock<bool> = OnceLock::new();

#[derive(Serialize)]
struct SecretWriteResult {
    insecure_storage: bool,
    backend: String,
}

#[derive(Serialize)]
struct SecretReadResult {
    value: Option<String>,
    insecure_storage: bool,
    backend: String,
}

#[tauri::command]
fn app_data_dir(app: AppHandle) -> Result<String, String> {
    Ok(app_data_path(&app)?.to_string_lossy().to_string())
}

#[tauri::command]
fn read_json_state(app: AppHandle, name: String) -> Result<Option<String>, String> {
    let path = data_file_path(&app, &name)?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(path).map(Some).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_json_state(app: AppHandle, name: String, payload: String) -> Result<(), String> {
    let path = data_file_path(&app, &name)?;
    fs::write(path, payload).map_err(|error| error.to_string())
}

#[tauri::command]
fn set_profile_secret(
    app: AppHandle,
    profile_id: String,
    api_key: String,
) -> Result<SecretWriteResult, String> {
    if api_key.trim().is_empty() {
        delete_profile_secret(app, profile_id)?;
        return Ok(SecretWriteResult {
            insecure_storage: false,
            backend: "none".to_string(),
        });
    }

    match keyring_entry(&profile_id).and_then(|entry| entry.set_password(api_key.trim())) {
        Ok(()) => {
            remove_fallback_secret(&app, &profile_id)?;
            Ok(SecretWriteResult {
                insecure_storage: false,
                backend: "keyring".to_string(),
            })
        }
        Err(_) => {
            write_fallback_secret(&app, &profile_id, api_key.trim())?;
            Ok(SecretWriteResult {
                insecure_storage: true,
                backend: "app-data-fallback".to_string(),
            })
        }
    }
}

#[tauri::command]
fn get_profile_secret(app: AppHandle, profile_id: String) -> Result<SecretReadResult, String> {
    if let Ok(entry) = keyring_entry(&profile_id) {
        if let Ok(value) = entry.get_password() {
            return Ok(SecretReadResult {
                value: Some(value),
                insecure_storage: false,
                backend: "keyring".to_string(),
            });
        }
    }

    Ok(SecretReadResult {
        value: read_fallback_secret(&app, &profile_id)?,
        insecure_storage: true,
        backend: "app-data-fallback".to_string(),
    })
}

#[tauri::command]
fn delete_profile_secret(app: AppHandle, profile_id: String) -> Result<(), String> {
    if let Ok(entry) = keyring_entry(&profile_id) {
        let _ = entry.delete_credential();
    }
    remove_fallback_secret(&app, &profile_id)
}

fn app_data_path(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(path)
}

fn data_file_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let safe_name = sanitize_name(name)?;
    Ok(app_data_path(app)?.join(format!("{safe_name}.json")))
}

fn secrets_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_path(app)?.join("secrets-fallback.json"))
}

fn keyring_entry(profile_id: &str) -> keyring_core::Result<keyring_core::Entry> {
    if !*KEYRING_READY.get_or_init(|| keyring::use_native_store(false).is_ok()) {
        return Err(keyring_core::Error::NoDefaultStore);
    }
    keyring_core::Entry::new(SECRET_SERVICE, &format!("profile:{profile_id}"))
}

fn read_fallback_secret(app: &AppHandle, profile_id: &str) -> Result<Option<String>, String> {
    let secrets = read_fallback_secrets(app)?;
    Ok(secrets
        .get(profile_id)
        .and_then(Value::as_str)
        .map(ToString::to_string))
}

fn write_fallback_secret(app: &AppHandle, profile_id: &str, api_key: &str) -> Result<(), String> {
    let mut secrets = read_fallback_secrets(app)?;
    secrets.insert(profile_id.to_string(), Value::String(api_key.to_string()));
    write_fallback_secrets(app, secrets)
}

fn remove_fallback_secret(app: &AppHandle, profile_id: &str) -> Result<(), String> {
    let mut secrets = read_fallback_secrets(app)?;
    secrets.remove(profile_id);
    write_fallback_secrets(app, secrets)
}

fn read_fallback_secrets(app: &AppHandle) -> Result<Map<String, Value>, String> {
    let path = secrets_file_path(app)?;
    if !path.exists() {
        return Ok(Map::new());
    }
    let value = fs::read_to_string(path)
        .map_err(|error| error.to_string())
        .and_then(|payload| serde_json::from_str::<Value>(&payload).map_err(|error| error.to_string()))?;
    Ok(value.as_object().cloned().unwrap_or_default())
}

fn write_fallback_secrets(app: &AppHandle, secrets: Map<String, Value>) -> Result<(), String> {
    let payload = serde_json::to_string_pretty(&Value::Object(secrets)).map_err(|error| error.to_string())?;
    fs::write(secrets_file_path(app)?, format!("{payload}\n")).map_err(|error| error.to_string())
}

fn sanitize_name(name: &str) -> Result<String, String> {
    let candidate = Path::new(name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '-' || *ch == '_')
        .collect::<String>();
    if candidate.is_empty() {
        return Err("Invalid state file name.".to_string());
    }
    Ok(candidate)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            app_data_dir,
            read_json_state,
            write_json_state,
            set_profile_secret,
            get_profile_secret,
            delete_profile_secret
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
