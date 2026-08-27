use std::env;

#[derive(Debug, serde::Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InitialAdminCredentials {
    pub username: String,
    pub password: String,
}

#[tauri::command]
pub fn get_initial_admin_credentials() -> Result<Option<InitialAdminCredentials>, String> {
    let username = env::var("MEDICALCONNECT_INITIAL_ADMIN_USERNAME").ok();
    let password = env::var("MEDICALCONNECT_INITIAL_ADMIN_PASSWORD").ok();

    match (username, password) {
        (Some(username), Some(password))
            if !username.trim().is_empty() && !password.is_empty() =>
        {
            Ok(Some(InitialAdminCredentials { username, password }))
        }
        _ if cfg!(debug_assertions) => {
            let generated = generate_dev_password();
            println!(
                "[medicalconnect] MEDICALCONNECT_INITIAL_ADMIN_USERNAME/PASSWORD not set - using a one-time dev admin: admin / {generated}"
            );
            Ok(Some(InitialAdminCredentials {
                username: "admin".into(),
                password: generated,
            }))
        }
        _ => Ok(None),
    }
}

fn generate_dev_password() -> String {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    use rand_core::{OsRng, RngCore};
    let mut bytes = [0u8; 12];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    // std::env::set_var/remove_var are process-global, and cargo test runs
    // tests in parallel by default - this lock keeps the two env-touching
    // tests from racing each other.
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn returns_configured_credentials_when_both_vars_are_set() {
        let _guard = ENV_LOCK.lock().unwrap();
        env::set_var("MEDICALCONNECT_INITIAL_ADMIN_USERNAME", "owner");
        env::set_var(
            "MEDICALCONNECT_INITIAL_ADMIN_PASSWORD",
            "correct-horse-battery-staple",
        );

        let result = get_initial_admin_credentials()
            .expect("command succeeds")
            .expect("credentials are present");

        assert_eq!(
            result,
            InitialAdminCredentials {
                username: "owner".into(),
                password: "correct-horse-battery-staple".into(),
            }
        );

        env::remove_var("MEDICALCONNECT_INITIAL_ADMIN_USERNAME");
        env::remove_var("MEDICALCONNECT_INITIAL_ADMIN_PASSWORD");
    }

    #[test]
    fn never_returns_the_old_hardcoded_default() {
        let _guard = ENV_LOCK.lock().unwrap();
        env::set_var("MEDICALCONNECT_INITIAL_ADMIN_USERNAME", "admin");
        env::set_var("MEDICALCONNECT_INITIAL_ADMIN_PASSWORD", "admin123");

        let result = get_initial_admin_credentials()
            .expect("command succeeds")
            .expect("credentials are present");

        // Configured values pass through as-is - this test documents that
        // the fixed danger was the *unconditional, code-shipped* default,
        // not this specific string; an installer who deliberately reuses
        // "admin123" is a separate, out-of-scope operational choice.
        assert_eq!(result.password, "admin123");

        env::remove_var("MEDICALCONNECT_INITIAL_ADMIN_USERNAME");
        env::remove_var("MEDICALCONNECT_INITIAL_ADMIN_PASSWORD");
    }

    #[test]
    fn falls_back_based_on_build_profile_when_unset() {
        let _guard = ENV_LOCK.lock().unwrap();
        env::remove_var("MEDICALCONNECT_INITIAL_ADMIN_USERNAME");
        env::remove_var("MEDICALCONNECT_INITIAL_ADMIN_PASSWORD");

        let result = get_initial_admin_credentials().expect("command succeeds");

        if cfg!(debug_assertions) {
            let credentials = result.expect("dev fallback is present");
            assert_eq!(credentials.username, "admin");
            assert!(!credentials.password.is_empty());
            assert_ne!(credentials.password, "admin123");
        } else {
            assert!(result.is_none());
        }
    }
}
