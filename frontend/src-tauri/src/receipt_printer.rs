use std::fs;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

/// window.print() has no working implementation in WKWebView (macOS) - see
/// tauri-apps/tauri#3066/#4917 and tauri-apps/wry#713 - so a receipt PDF is
/// written to the app's cache directory and handed to the OS's default PDF
/// viewer instead, where Cmd+P actually works (that's a real native app,
/// not the embedded webview).
#[tauri::command]
pub fn save_and_open_receipt(app: AppHandle, filename: String, data: Vec<u8>) -> Result<(), String> {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Failed to resolve cache directory: {e}"))?;
    fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to create cache directory: {e}"))?;

    let file_path = cache_dir.join(sanitize_filename(&filename));
    fs::write(&file_path, &data).map_err(|e| format!("Failed to write receipt file: {e}"))?;

    app.opener()
        .open_path(file_path.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| format!("Failed to open receipt: {e}"))
}

fn sanitize_filename(filename: &str) -> String {
    let cleaned: String = filename
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if cleaned.is_empty() {
        "receipt.pdf".to_string()
    } else {
        cleaned
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_alphanumeric_dot_dash_underscore_unchanged() {
        assert_eq!(sanitize_filename("Receipt_2026-08-19.pdf"), "Receipt_2026-08-19.pdf");
    }

    #[test]
    fn replaces_path_separators_and_other_unsafe_characters() {
        assert_eq!(sanitize_filename("../../etc/passwd"), ".._.._etc_passwd");
        assert_eq!(sanitize_filename("a/b\\c:d"), "a_b_c_d");
    }

    #[test]
    fn falls_back_to_a_default_name_when_the_input_is_empty() {
        assert_eq!(sanitize_filename(""), "receipt.pdf");
    }
}
