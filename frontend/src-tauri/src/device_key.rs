use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use keyring::Entry;
use rand_core::{OsRng, RngCore};

const SERVICE_NAME: &str = "business-connect-device-master-key";
const KEY_LENGTH: usize = 32;

fn entry_for(device_id: &str) -> Result<Entry, String> {
    Entry::new(SERVICE_NAME, device_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn read_device_master_key(device_id: String) -> Result<Option<String>, String> {
    let entry = entry_for(&device_id)?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn create_device_master_key(device_id: String) -> Result<String, String> {
    let entry = entry_for(&device_id)?;
    if entry.get_password().is_ok() {
        return Err("device master key already exists for this device".into());
    }
    let mut bytes = [0u8; KEY_LENGTH];
    OsRng.fill_bytes(&mut bytes);
    let encoded = URL_SAFE_NO_PAD.encode(bytes);
    entry
        .set_password(&encoded)
        .map_err(|error| error.to_string())?;
    Ok(encoded)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn use_mock_store() {
        crate::mock_keyring::install_mock_keyring();
    }

    #[test]
    fn create_then_read_round_trips() {
        use_mock_store();
        let device_id = "device-test-round-trip";
        let created = create_device_master_key(device_id.into()).expect("create succeeds");
        let read = read_device_master_key(device_id.into()).expect("read succeeds");
        assert_eq!(read, Some(created));
    }

    #[test]
    fn read_returns_none_when_absent() {
        use_mock_store();
        let read =
            read_device_master_key("device-test-absent".into()).expect("read succeeds");
        assert_eq!(read, None);
    }

    #[test]
    fn create_rejects_overwriting_an_existing_key() {
        use_mock_store();
        let device_id = "device-test-no-overwrite";
        create_device_master_key(device_id.into()).expect("first create succeeds");
        let second = create_device_master_key(device_id.into());
        assert!(second.is_err());
    }

    #[test]
    fn created_keys_are_32_bytes_once_decoded() {
        use_mock_store();
        let created =
            create_device_master_key("device-test-length".into()).expect("create succeeds");
        let decoded = URL_SAFE_NO_PAD.decode(created).expect("valid base64");
        assert_eq!(decoded.len(), KEY_LENGTH);
    }
}
