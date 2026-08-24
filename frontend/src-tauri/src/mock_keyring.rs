//! An in-memory keyring credential store for tests.
//!
//! keyring 2.x ships a `mock` module, but its builder reports
//! [`CredentialPersistence::EntryOnly`]: every [`keyring::Entry::new`] call
//! constructs a brand-new credential, so a "set a password on one entry, then
//! read it back through a freshly-created entry" round-trip loses the password.
//! Our production code always creates a fresh entry per operation (create vs.
//! read vs. sign), so the tests need a store that persists across entries for
//! the lifetime of the process. This module provides that store.

use std::any::Any;
use std::collections::HashMap;
use std::sync::{Mutex, Once, OnceLock};

use keyring::credential::{
    Credential, CredentialApi, CredentialBuilderApi, CredentialPersistence,
};
use keyring::{Error, Result};

fn store() -> &'static Mutex<HashMap<(String, String), String>> {
    static STORE: OnceLock<Mutex<HashMap<(String, String), String>>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Debug)]
struct InMemoryCredential {
    service: String,
    user: String,
}

impl CredentialApi for InMemoryCredential {
    fn set_password(&self, password: &str) -> Result<()> {
        store()
            .lock()
            .unwrap()
            .insert((self.service.clone(), self.user.clone()), password.to_string());
        Ok(())
    }

    fn get_password(&self) -> Result<String> {
        store()
            .lock()
            .unwrap()
            .get(&(self.service.clone(), self.user.clone()))
            .cloned()
            .ok_or(Error::NoEntry)
    }

    fn delete_password(&self) -> Result<()> {
        store()
            .lock()
            .unwrap()
            .remove(&(self.service.clone(), self.user.clone()))
            .map(|_| ())
            .ok_or(Error::NoEntry)
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}

#[derive(Debug, Default)]
struct InMemoryCredentialBuilder;

impl CredentialBuilderApi for InMemoryCredentialBuilder {
    fn build(&self, _target: Option<&str>, service: &str, user: &str) -> Result<Box<Credential>> {
        Ok(Box::new(InMemoryCredential {
            service: service.to_string(),
            user: user.to_string(),
        }))
    }

    fn as_any(&self) -> &dyn Any {
        self
    }

    fn persistence(&self) -> CredentialPersistence {
        CredentialPersistence::ProcessOnly
    }
}

/// Install the in-memory store as the global default credential builder.
///
/// `cargo test` runs tests in parallel by default, and `set_default_credential_builder`
/// sets process-wide state - calling this unconditionally on every test (as a naive
/// per-test "clean slate" reset would) races: one test's reset can wipe a key another,
/// concurrently-running test already stored before it reads that key back. Installing
/// the builder exactly once for the whole test binary avoids that; test isolation
/// instead comes from every test using a distinct (service, user) key, which is already
/// true throughout this codebase's tests.
pub fn install_mock_keyring() {
    static INIT: Once = Once::new();
    INIT.call_once(|| {
        keyring::set_default_credential_builder(Box::new(InMemoryCredentialBuilder));
    });
}
