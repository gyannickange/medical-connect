mod device_key;
mod lan_agent;
mod local_admin;
#[cfg(test)]
mod mock_keyring;
mod receipt_printer;

use lan_agent::LanAgentState;
use tauri::WebviewWindowBuilder;

/// Desktop-simulator profiles (caisse1/caisse2) run the same compiled
/// binary side by side on one machine, so macOS's WKWebView would
/// otherwise give them the same storage bucket (localStorage, IndexedDB,
/// cookies) despite their distinct `identifier` in tauri.caisseN.conf.json
/// - `dataDirectory` is documented as unsupported on macOS for this. This
/// maps each known simulator identifier to its own fixed data store id so
/// their local state (device id, auth session, PouchDB replica) stays
/// genuinely isolated. Returns None for the normal, non-simulator build.
fn simulator_data_store_identifier(identifier: &str) -> Option<[u8; 16]> {
    match identifier {
        "com.medicalconnect.desktop.caisse1" => Some([
            170, 190, 82, 22, 223, 164, 69, 212, 147, 82, 116, 13, 188, 153, 61, 77,
        ]),
        "com.medicalconnect.desktop.caisse2" => Some([
            31, 94, 13, 64, 230, 31, 70, 45, 151, 80, 77, 50, 86, 64, 138, 198,
        ]),
        _ => None,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(LanAgentState::default())
        .invoke_handler(tauri::generate_handler![
            lan_agent::lan_agent_start,
            lan_agent::lan_agent_stop,
            lan_agent::lan_agent_status,
            lan_agent::lan_agent_get_peers,
            lan_agent::lan_agent_check_internet,
            lan_agent::lan_agent_prepare_identity,
            lan_agent::lan_agent_install_certificate,
            lan_agent::lan_agent_send_lock_message,
            lan_agent::lan_agent_verify_approval_capability,
            lan_agent::lan_agent_sign_grant_record,
            device_key::read_device_master_key,
            device_key::create_device_master_key,
            local_admin::get_initial_admin_credentials,
            receipt_printer::save_and_open_receipt,
        ])
        .setup(|app| {
            // A data store identifier can only be set at window-creation
            // time, so the simulator config files mark their window
            // "create": false and it's built here instead of relying on
            // Tauri's automatic pre-setup window creation.
            if let Some(data_store_identifier) =
                simulator_data_store_identifier(&app.config().identifier)
            {
                if let Some(window_config) = app.config().app.windows.first().cloned() {
                    WebviewWindowBuilder::from_config(app, &window_config)?
                        .data_store_identifier(data_store_identifier)
                        .build()?;
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Medical Connect desktop");
}
