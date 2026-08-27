use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use if_addrs::{get_if_addrs, Interface};
use mdns_sd::{ResolvedService, ServiceDaemon, ServiceEvent, ServiceInfo};
use rand_core::OsRng;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State};

const LAN_IDENTITY_KEY_SERVICE: &str = "medical-connect-lan-identity-key";

fn lan_identity_key_entry(device_id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(LAN_IDENTITY_KEY_SERVICE, device_id).map_err(|error| error.to_string())
}

fn save_lan_signing_key(device_id: &str, key: &SigningKey) -> Result<(), String> {
    let entry = lan_identity_key_entry(device_id)?;
    entry
        .set_password(&URL_SAFE_NO_PAD.encode(key.to_bytes()))
        .map_err(|error| error.to_string())
}

const SERVICE_TYPE: &str = "_medicalconnect._tcp.local.";
const PROTOCOL_VERSION: &str = "1";
const DEFAULT_AGENT_PORT: u16 = 45_838;
const IDENTITY_FILENAME: &str = "lan-identity.json";
const DISCOVERY_RECONCILIATION_INTERVAL: Duration = Duration::from_secs(4);
const PEER_STALE_AFTER: Duration = Duration::from_secs(12);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanPeer {
    pub device_id: String,
    pub service_name: String,
    pub addresses: Vec<String>,
    pub port: u16,
    pub protocol_version: String,
    pub last_seen_at: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanAgentStatus {
    pub running: bool,
    pub device_id: Option<String>,
    pub peer_count: usize,
    pub network_available: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedIdentity {
    pub device_id: String,
    pub device_public_key: String,
    pub has_certificate: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredIdentity {
    device_id: String,
    certificate: Option<String>,
    ca_public_key: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeviceCertificatePayload {
    version: u8,
    device_id: String,
    tenant_fingerprint: String,
    device_public_key: String,
    issued_at: u64,
    expires_at: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApprovalCapabilityPayload {
    version: u8,
    purpose: String,
    device_id: String,
    tenant_fingerprint: String,
    issued_at: u64,
    expires_at: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrantRecordPayload {
    granted_device_id: String,
    granted_by_device_id: String,
    tenant_fingerprint: String,
    decided_at: String,
}

struct AgentRuntime {
    daemon: ServiceDaemon,
    service_fullname: String,
    device_id: String,
}

#[derive(Default)]
pub struct LanAgentState {
    runtime: Mutex<Option<AgentRuntime>>,
    peers: Arc<Mutex<HashMap<String, LanPeer>>>,
    generation: Arc<AtomicU64>,
}

#[tauri::command]
pub fn lan_agent_start(
    app: AppHandle,
    state: State<'_, LanAgentState>,
) -> Result<LanAgentStatus, String> {
    let identity = load_identity(&identity_path(&app)?)?;
    let certificate = identity
        .certificate
        .as_deref()
        .ok_or("LAN device certificate is not installed")?;
    let ca_public_key = identity
        .ca_public_key
        .as_deref()
        .ok_or("LAN certificate authority is not installed")?;
    let payload = verify_device_certificate(certificate, ca_public_key, &identity)?;
    let tenant_fingerprint = payload.tenant_fingerprint;
    let device_id = payload.device_id;
    stop_runtime(&state)?;

    let agent_port = effective_agent_port(app.config().identifier.as_str());
    let daemon = ServiceDaemon::new().map_err(|error| error.to_string())?;
    let hostname = format!("{}.local.", dns_label(&device_id));
    let properties = [
        ("device", device_id.as_str()),
        ("tenant", tenant_fingerprint.as_str()),
        ("protocol", PROTOCOL_VERSION),
    ];
    let service = ServiceInfo::new(
        SERVICE_TYPE,
        &device_id,
        &hostname,
        "",
        agent_port,
        &properties[..],
    )
    .map_err(|error| error.to_string())?
    .enable_addr_auto();
    let service_fullname = service.get_fullname().to_owned();
    daemon
        .register(service.clone())
        .map_err(|error| error.to_string())?;
    eprintln!("[Medical Connect LAN] agent started: {device_id}");

    let peers = Arc::clone(&state.peers);
    let expected_tenant = tenant_fingerprint.clone();
    let local_device = device_id.clone();
    let discovery_daemon = daemon.clone();
    let generation = Arc::clone(&state.generation);
    let runtime_generation = generation.load(Ordering::Acquire);

    let http_server = tiny_http::Server::http(("0.0.0.0", agent_port))
        .map_err(|error| format!("Failed to bind LAN lock server: {error}"))?;
    let http_identity_path = identity_path(&app)?;
    let http_app_handle = app.clone();
    let http_generation = Arc::clone(&generation);
    let http_runtime_generation = runtime_generation;

    std::thread::spawn(move || {
        for request in http_server.incoming_requests() {
            if http_generation.load(Ordering::Acquire) != http_runtime_generation {
                break;
            }
            handle_lan_message(request, &http_identity_path, &http_app_handle);
        }
    });

    std::thread::spawn(move || {
        while generation.load(Ordering::Acquire) == runtime_generation {
            let receiver = match discovery_daemon.browse(SERVICE_TYPE) {
                Ok(receiver) => receiver,
                Err(_) => break,
            };
            let deadline = Instant::now() + DISCOVERY_RECONCILIATION_INTERVAL;

            while let Some(remaining) = deadline.checked_duration_since(Instant::now()) {
                match receiver.recv_timeout(remaining) {
                    Ok(event) => {
                        if generation.load(Ordering::Acquire) != runtime_generation {
                            return;
                        }
                        process_discovery_event(event, &peers, &expected_tenant, &local_device)
                    }
                    Err(_) => break,
                }
            }

            prune_stale_peers(&peers);

            if generation.load(Ordering::Acquire) != runtime_generation {
                break;
            }

            // mDNS browse retries eventually back off to one query per hour. A
            // Wi-Fi/interface transition can therefore leave discovery
            // asymmetric for a long time. Restarting the browse and
            // re-announcing our service keeps both sides convergent.
            if discovery_daemon.stop_browse(SERVICE_TYPE).is_err()
                || discovery_daemon.register(service.clone()).is_err()
            {
                break;
            }
        }
    });

    *state
        .runtime
        .lock()
        .map_err(|_| "LAN agent state poisoned")? = Some(AgentRuntime {
        daemon,
        service_fullname,
        device_id,
    });

    status(&state)
}

#[tauri::command]
pub fn lan_agent_prepare_identity(
    app: AppHandle,
    device_id: String,
) -> Result<PreparedIdentity, String> {
    let device_id = effective_device_id(app.config().identifier.as_str(), &device_id);
    validate_device_id(&device_id)?;
    let path = identity_path(&app)?;

    // Fresh install (no metadata file yet) or a device-id change both mean
    // there is nothing to preserve, so generating a new identity is safe.
    // A metadata file that exists but fails to parse means an existing
    // identity is present and corrupt - that must fail loudly rather than
    // silently mint a replacement identity nobody asked for.
    let identity = if !path.exists() {
        create_new_identity(&path, &device_id)?
    } else {
        let existing = load_identity(&path)
            .map_err(|error| format!("LAN identity metadata is corrupt: {error}"))?;
        if existing.device_id != device_id {
            create_new_identity(&path, &device_id)?
        } else {
            existing
        }
    };

    // For an existing identity, this fails closed if the signing key is
    // missing from the keyring instead of silently regenerating one.
    let signing_key = signing_key(&identity)?;
    Ok(PreparedIdentity {
        device_id,
        device_public_key: URL_SAFE_NO_PAD.encode(signing_key.verifying_key().to_bytes()),
        has_certificate: identity.certificate.is_some(),
    })
}

fn create_new_identity(path: &Path, device_id: &str) -> Result<StoredIdentity, String> {
    let signing_key = SigningKey::generate(&mut OsRng);
    save_lan_signing_key(device_id, &signing_key)?;
    let created = StoredIdentity {
        device_id: device_id.to_string(),
        certificate: None,
        ca_public_key: None,
    };
    save_identity(path, &created)?;
    Ok(created)
}

#[tauri::command]
pub fn lan_agent_install_certificate(
    app: AppHandle,
    certificate: String,
    ca_public_key: String,
) -> Result<(), String> {
    let path = identity_path(&app)?;
    let mut identity = load_identity(&path)?;
    if let Some(trusted_ca) = identity.ca_public_key.as_deref() {
        if trusted_ca != ca_public_key {
            return Err("LAN certificate authority change rejected".into());
        }
    }
    verify_device_certificate(&certificate, &ca_public_key, &identity)?;
    identity.certificate = Some(certificate);
    identity.ca_public_key = Some(ca_public_key);
    save_identity(&path, &identity)
}

#[tauri::command]
pub fn lan_agent_stop(state: State<'_, LanAgentState>) -> Result<(), String> {
    stop_runtime(&state)
}

#[tauri::command]
pub fn lan_agent_status(state: State<'_, LanAgentState>) -> Result<LanAgentStatus, String> {
    status(&state)
}

#[tauri::command]
pub fn lan_agent_get_peers(state: State<'_, LanAgentState>) -> Result<Vec<LanPeer>, String> {
    let network_available = has_local_network_interface();
    let mut current = state.peers.lock().map_err(|_| "LAN peer state poisoned")?;
    reconcile_peers(&mut current, network_available, unix_millis());
    let mut peers: Vec<_> = current.values().cloned().collect();
    peers.sort_by(|left, right| left.device_id.cmp(&right.device_id));
    Ok(peers)
}

#[tauri::command]
pub async fn lan_agent_check_internet() -> bool {
    tauri::async_runtime::spawn_blocking(|| {
        // A successful TCP handshake proves routed Internet access without
        // depending on DNS, HTTP content, CORS, or a captive portal page.
        ["1.1.1.1:443", "8.8.8.8:443"]
            .iter()
            .filter_map(|address| address.parse::<SocketAddr>().ok())
            .any(|address| TcpStream::connect_timeout(&address, Duration::from_millis(900)).is_ok())
    })
    .await
    .unwrap_or(false)
}

#[tauri::command]
pub fn lan_agent_send_lock_message(
    app: AppHandle,
    state: State<'_, LanAgentState>,
    address: String,
    port: u16,
    path: String,
    payload: serde_json::Value,
) -> Result<(), String> {
    let identity = load_identity(&identity_path(&app)?)?;
    let certificate = identity
        .certificate
        .clone()
        .ok_or("LAN device certificate is not installed")?;
    let envelope = sign_envelope(&identity, &certificate, payload)?;

    let _ = state; // reserved for future rate limiting / in-flight tracking

    let url = format!("http://{address}:{port}{path}");
    ureq::post(&url)
        .send_json(&envelope)
        .map_err(|error| format!("Failed to reach peer: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn lan_agent_verify_approval_capability(
    app: AppHandle,
    capability: String,
) -> Result<bool, String> {
    let identity = load_identity(&identity_path(&app)?)?;
    Ok(verify_approval_capability(&capability, &identity).is_ok())
}

#[tauri::command]
pub fn lan_agent_sign_grant_record(
    app: AppHandle,
    granted_device_id: String,
    tenant_fingerprint: String,
) -> Result<String, String> {
    let identity = load_identity(&identity_path(&app)?)?;
    let grant = GrantRecordPayload {
        granted_device_id,
        granted_by_device_id: identity.device_id.clone(),
        tenant_fingerprint,
        decided_at: iso8601_now(),
    };
    sign_grant_record(&identity, &grant)
}

fn status(state: &LanAgentState) -> Result<LanAgentStatus, String> {
    let runtime = state
        .runtime
        .lock()
        .map_err(|_| "LAN agent state poisoned")?;
    let network_available = has_local_network_interface();
    let mut peers = state.peers.lock().map_err(|_| "LAN peer state poisoned")?;
    reconcile_peers(&mut peers, network_available, unix_millis());
    Ok(LanAgentStatus {
        running: runtime.is_some(),
        device_id: runtime.as_ref().map(|item| item.device_id.clone()),
        peer_count: peers.len(),
        network_available,
    })
}

fn stop_runtime(state: &LanAgentState) -> Result<(), String> {
    // Invalidate the discovery worker before shutting its daemon down so a
    // late mDNS event from an old runtime cannot repopulate the new state.
    state.generation.fetch_add(1, Ordering::AcqRel);
    let runtime = state
        .runtime
        .lock()
        .map_err(|_| "LAN agent state poisoned")?
        .take();
    if let Some(runtime) = runtime {
        let _ = runtime.daemon.stop_browse(SERVICE_TYPE);
        let _ = runtime.daemon.unregister(&runtime.service_fullname);
        let _ = runtime.daemon.shutdown();
    }
    state
        .peers
        .lock()
        .map_err(|_| "LAN peer state poisoned")?
        .clear();
    Ok(())
}

fn validate_device_id(device_id: &str) -> Result<(), String> {
    if device_id.len() < 3 || device_id.len() > 63 {
        return Err("invalid device identifier".into());
    }
    if !device_id
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || "-_".contains(character))
    {
        return Err("identity contains unsupported characters".into());
    }
    Ok(())
}

fn effective_device_id(app_identifier: &str, requested_device_id: &str) -> String {
    app_identifier
        .strip_prefix("com.medicalconnect.desktop.")
        .filter(|profile| profile.starts_with("caisse"))
        .map(|profile| format!("device-sim-{profile}"))
        .unwrap_or_else(|| requested_device_id.to_owned())
}

fn effective_agent_port(app_identifier: &str) -> u16 {
    app_identifier
        .strip_prefix("com.medicalconnect.desktop.caisse")
        .and_then(|suffix| suffix.parse::<u16>().ok())
        .map(|index| DEFAULT_AGENT_PORT + index)
        .unwrap_or(DEFAULT_AGENT_PORT)
}

fn identity_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join(IDENTITY_FILENAME))
        .map_err(|error| error.to_string())
}

fn load_identity(path: &Path) -> Result<StoredIdentity, String> {
    let bytes = fs::read(path).map_err(|error| format!("LAN identity unavailable: {error}"))?;
    serde_json::from_slice(&bytes).map_err(|error| format!("Invalid LAN identity: {error}"))
}

fn save_identity(path: &Path, identity: &StoredIdentity) -> Result<(), String> {
    let parent = path.parent().ok_or("Invalid LAN identity path")?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let encoded = serde_json::to_vec(identity).map_err(|error| error.to_string())?;

    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = fs::OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .mode(0o600)
            .open(path)
            .map_err(|error| error.to_string())?;
        file.write_all(&encoded)
            .map_err(|error| error.to_string())?;
    }
    #[cfg(not(unix))]
    fs::write(path, encoded).map_err(|error| error.to_string())?;

    Ok(())
}

fn signing_key(identity: &StoredIdentity) -> Result<SigningKey, String> {
    let entry = lan_identity_key_entry(&identity.device_id)?;
    let encoded = entry
        .get_password()
        .map_err(|_| "LAN identity signing key is missing from the OS keyring".to_string())?;
    let bytes: [u8; 32] = URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|_| "Invalid LAN identity signing key")?
        .try_into()
        .map_err(|_| "Invalid LAN identity signing key length")?;
    Ok(SigningKey::from_bytes(&bytes))
}

fn verify_device_certificate(
    certificate: &str,
    ca_public_key: &str,
    identity: &StoredIdentity,
) -> Result<DeviceCertificatePayload, String> {
    let mut parts = certificate.split('.');
    let encoded_payload = parts.next().ok_or("Invalid LAN certificate")?;
    let encoded_signature = parts.next().ok_or("Invalid LAN certificate")?;
    if parts.next().is_some() {
        return Err("Invalid LAN certificate".into());
    }

    let ca_bytes: [u8; 32] = URL_SAFE_NO_PAD
        .decode(ca_public_key)
        .map_err(|_| "Invalid LAN certificate authority")?
        .try_into()
        .map_err(|_| "Invalid LAN certificate authority length")?;
    let verifying_key =
        VerifyingKey::from_bytes(&ca_bytes).map_err(|_| "Invalid LAN certificate authority key")?;
    let signature_bytes = URL_SAFE_NO_PAD
        .decode(encoded_signature)
        .map_err(|_| "Invalid LAN certificate signature")?;
    let signature = Signature::from_slice(&signature_bytes)
        .map_err(|_| "Invalid LAN certificate signature length")?;
    verifying_key
        .verify(encoded_payload.as_bytes(), &signature)
        .map_err(|_| "LAN certificate signature rejected")?;

    let payload_bytes = URL_SAFE_NO_PAD
        .decode(encoded_payload)
        .map_err(|_| "Invalid LAN certificate payload")?;
    let payload: DeviceCertificatePayload =
        serde_json::from_slice(&payload_bytes).map_err(|_| "Invalid LAN certificate payload")?;
    let local_public_key =
        URL_SAFE_NO_PAD.encode(signing_key(identity)?.verifying_key().to_bytes());
    let now = unix_millis();
    if payload.version != 1
        || payload.device_id != identity.device_id
        || payload.device_public_key != local_public_key
        || payload.issued_at > now + 60_000
        || payload.expires_at <= now
        || payload.tenant_fingerprint.len() < 16
    {
        return Err("LAN certificate claims rejected".into());
    }
    Ok(payload)
}

fn verify_peer_certificate(
    certificate: &str,
    identity: &StoredIdentity,
) -> Result<DeviceCertificatePayload, String> {
    let ca_public_key = identity
        .ca_public_key
        .as_deref()
        .ok_or("LAN certificate authority is not installed")?;

    let mut parts = certificate.split('.');
    let encoded_payload = parts.next().ok_or("Invalid LAN certificate")?;
    let encoded_signature = parts.next().ok_or("Invalid LAN certificate")?;
    if parts.next().is_some() {
        return Err("Invalid LAN certificate".into());
    }

    let ca_bytes: [u8; 32] = URL_SAFE_NO_PAD
        .decode(ca_public_key)
        .map_err(|_| "Invalid LAN certificate authority")?
        .try_into()
        .map_err(|_| "Invalid LAN certificate authority length")?;
    let verifying_key =
        VerifyingKey::from_bytes(&ca_bytes).map_err(|_| "Invalid LAN certificate authority key")?;
    let signature_bytes = URL_SAFE_NO_PAD
        .decode(encoded_signature)
        .map_err(|_| "Invalid LAN certificate signature")?;
    let signature = Signature::from_slice(&signature_bytes)
        .map_err(|_| "Invalid LAN certificate signature length")?;
    verifying_key
        .verify(encoded_payload.as_bytes(), &signature)
        .map_err(|_| "LAN certificate signature rejected")?;

    let payload_bytes = URL_SAFE_NO_PAD
        .decode(encoded_payload)
        .map_err(|_| "Invalid LAN certificate payload")?;
    let payload: DeviceCertificatePayload =
        serde_json::from_slice(&payload_bytes).map_err(|_| "Invalid LAN certificate payload")?;

    let now = unix_millis();
    if payload.version != 1 || payload.expires_at <= now || payload.tenant_fingerprint.len() < 16 {
        return Err("LAN certificate claims rejected".into());
    }
    Ok(payload)
}

fn verify_approval_capability(
    capability: &str,
    identity: &StoredIdentity,
) -> Result<ApprovalCapabilityPayload, String> {
    let ca_public_key = identity
        .ca_public_key
        .as_deref()
        .ok_or("LAN certificate authority is not installed")?;

    let mut parts = capability.split('.');
    let encoded_payload = parts.next().ok_or("Invalid approval capability")?;
    let encoded_signature = parts.next().ok_or("Invalid approval capability")?;
    if parts.next().is_some() {
        return Err("Invalid approval capability".into());
    }

    let ca_bytes: [u8; 32] = URL_SAFE_NO_PAD
        .decode(ca_public_key)
        .map_err(|_| "Invalid LAN certificate authority")?
        .try_into()
        .map_err(|_| "Invalid LAN certificate authority length")?;
    let verifying_key =
        VerifyingKey::from_bytes(&ca_bytes).map_err(|_| "Invalid LAN certificate authority key")?;
    let signature_bytes = URL_SAFE_NO_PAD
        .decode(encoded_signature)
        .map_err(|_| "Invalid approval capability signature")?;
    let signature = Signature::from_slice(&signature_bytes)
        .map_err(|_| "Invalid approval capability signature length")?;
    verifying_key
        .verify(encoded_payload.as_bytes(), &signature)
        .map_err(|_| "Approval capability signature rejected")?;

    let payload_bytes = URL_SAFE_NO_PAD
        .decode(encoded_payload)
        .map_err(|_| "Invalid approval capability payload")?;
    let payload: ApprovalCapabilityPayload = serde_json::from_slice(&payload_bytes)
        .map_err(|_| "Invalid approval capability payload")?;

    let now = unix_millis();
    if payload.version != 1
        || payload.purpose != "device-authorization-approve"
        || payload.expires_at <= now
        || payload.tenant_fingerprint.len() < 16
    {
        return Err("Approval capability claims rejected".into());
    }
    Ok(payload)
}

fn sign_grant_record(
    identity: &StoredIdentity,
    grant: &GrantRecordPayload,
) -> Result<String, String> {
    let key = signing_key(identity)?;
    let encoded = URL_SAFE_NO_PAD.encode(
        serde_json::to_string(grant).map_err(|error| error.to_string())?,
    );
    let signature = key.sign(encoded.as_bytes());
    Ok(URL_SAFE_NO_PAD.encode(signature.to_bytes()))
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct LockMessageEnvelope {
    certificate: String,
    payload: serde_json::Value,
    signature: String,
}

struct VerifiedEnvelope {
    sender: DeviceCertificatePayload,
    payload: serde_json::Value,
}

fn sign_envelope(
    identity: &StoredIdentity,
    certificate: &str,
    payload: serde_json::Value,
) -> Result<LockMessageEnvelope, String> {
    let key = signing_key(identity)?;
    let encoded_payload = URL_SAFE_NO_PAD.encode(payload.to_string());
    let signature = key.sign(encoded_payload.as_bytes());
    Ok(LockMessageEnvelope {
        certificate: certificate.to_string(),
        payload,
        signature: URL_SAFE_NO_PAD.encode(signature.to_bytes()),
    })
}

fn verify_envelope(
    envelope: &LockMessageEnvelope,
    identity: &StoredIdentity,
) -> Result<VerifiedEnvelope, String> {
    let sender = verify_peer_certificate(&envelope.certificate, identity)?;

    let own_certificate = identity
        .certificate
        .as_deref()
        .ok_or("LAN device certificate is not installed")?;
    let own_ca_public_key = identity
        .ca_public_key
        .as_deref()
        .ok_or("LAN certificate authority is not installed")?;
    let own_payload = verify_device_certificate(own_certificate, own_ca_public_key, identity)?;
    if own_payload.tenant_fingerprint != sender.tenant_fingerprint {
        return Err("Peer certificate does not match this device's tenant".into());
    }

    let device_bytes: [u8; 32] = URL_SAFE_NO_PAD
        .decode(&sender.device_public_key)
        .map_err(|_| "Invalid peer device public key")?
        .try_into()
        .map_err(|_| "Invalid peer device public key length")?;
    let device_verifying_key = VerifyingKey::from_bytes(&device_bytes)
        .map_err(|_| "Invalid peer device public key")?;

    let signature_bytes = URL_SAFE_NO_PAD
        .decode(&envelope.signature)
        .map_err(|_| "Invalid envelope signature")?;
    let signature = Signature::from_slice(&signature_bytes)
        .map_err(|_| "Invalid envelope signature length")?;
    let encoded_payload = URL_SAFE_NO_PAD.encode(envelope.payload.to_string());
    device_verifying_key
        .verify(encoded_payload.as_bytes(), &signature)
        .map_err(|_| "Envelope signature rejected")?;

    Ok(VerifiedEnvelope {
        sender,
        payload: envelope.payload.clone(),
    })
}

fn handle_lan_message(mut request: tiny_http::Request, identity_path: &Path, app: &AppHandle) {
    let identity = match load_identity(identity_path) {
        Ok(identity) => identity,
        Err(_) => {
            let _ = request.respond(tiny_http::Response::empty(401));
            return;
        }
    };

    let mut body = String::new();
    if std::io::Read::read_to_string(request.as_reader(), &mut body).is_err() {
        let _ = request.respond(tiny_http::Response::empty(400));
        return;
    }

    let envelope: LockMessageEnvelope = match serde_json::from_str(&body) {
        Ok(envelope) => envelope,
        Err(_) => {
            let _ = request.respond(tiny_http::Response::empty(400));
            return;
        }
    };

    let verified = match verify_envelope(&envelope, &identity) {
        Ok(verified) => verified,
        Err(_) => {
            let _ = request.respond(tiny_http::Response::empty(403));
            return;
        }
    };

    let event_name = match request.url() {
        "/lock/request" => "lan-lock-request-received",
        "/lock/response" => "lan-lock-response-received",
        "/device-authorization/request" => "lan-device-authorization-request-received",
        "/device-authorization/grant" => "lan-device-authorization-grant-received",
        _ => {
            let _ = request.respond(tiny_http::Response::empty(404));
            return;
        }
    };

    let _ = app.emit(
        event_name,
        serde_json::json!({
            "senderDeviceId": verified.sender.device_id,
            "payload": verified.payload,
        }),
    );

    let _ =
        request.respond(tiny_http::Response::from_string("{\"ok\":true}").with_status_code(202));
}

fn dns_label(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect()
}

fn unix_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn iso8601_now() -> String {
    let millis_since_epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let total_seconds = millis_since_epoch / 1000;
    let ms = millis_since_epoch % 1000;
    let days_since_epoch = total_seconds / 86_400;
    let seconds_of_day = total_seconds % 86_400;
    let (hours, minutes, seconds) = (
        seconds_of_day / 3600,
        (seconds_of_day % 3600) / 60,
        seconds_of_day % 60,
    );
    let (year, month, day) = civil_from_days(days_since_epoch as i64);
    format!("{year:04}-{month:02}-{day:02}T{hours:02}:{minutes:02}:{seconds:02}.{ms:03}Z")
}

// Howard Hinnant's civil_from_days algorithm - converts a day count since
// the Unix epoch into a (year, month, day) civil calendar date, correct
// for the proleptic Gregorian calendar with no external date/time crate.
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

fn peer_from_resolved(
    service: &ResolvedService,
    expected_tenant: &str,
    local_device: &str,
) -> Option<LanPeer> {
    let tenant = service.get_property_val_str("tenant")?;
    let peer_device = service.get_property_val_str("device")?;
    if tenant != expected_tenant || peer_device == local_device {
        return None;
    }

    Some(LanPeer {
        device_id: peer_device.to_owned(),
        service_name: service.get_fullname().to_owned(),
        addresses: service
            .get_addresses()
            .iter()
            .map(ToString::to_string)
            .collect(),
        port: service.get_port(),
        protocol_version: service
            .get_property_val_str("protocol")
            .unwrap_or("unknown")
            .to_owned(),
        last_seen_at: unix_millis(),
    })
}

fn process_discovery_event(
    event: ServiceEvent,
    peers: &Arc<Mutex<HashMap<String, LanPeer>>>,
    expected_tenant: &str,
    local_device: &str,
) {
    match event {
        ServiceEvent::ServiceResolved(service) => {
            if let Some(peer) = peer_from_resolved(&service, expected_tenant, local_device) {
                if let Ok(mut current) = peers.lock() {
                    let is_new = !current.contains_key(&peer.service_name);
                    if is_new {
                        eprintln!(
                            "[Medical Connect LAN] same-tenant peer discovered: {}",
                            peer.device_id
                        );
                    }
                    current.insert(peer.service_name.clone(), peer);
                }
            }
        }
        ServiceEvent::ServiceRemoved(_, fullname) => {
            if let Ok(mut current) = peers.lock() {
                current.remove(&fullname);
            }
        }
        _ => {}
    }
}

fn prune_stale_peers(peers: &Arc<Mutex<HashMap<String, LanPeer>>>) {
    if let Ok(mut current) = peers.lock() {
        reconcile_peers(&mut current, has_local_network_interface(), unix_millis());
    }
}

fn reconcile_peers(peers: &mut HashMap<String, LanPeer>, network_available: bool, now: u64) {
    if !network_available {
        peers.clear();
        return;
    }

    let cutoff = now.saturating_sub(PEER_STALE_AFTER.as_millis() as u64);
    peers.retain(|_, peer| peer.last_seen_at >= cutoff);
}

fn has_local_network_interface() -> bool {
    get_if_addrs()
        .map(|interfaces| interfaces.iter().any(is_lan_interface))
        .unwrap_or(false)
}

fn is_lan_interface(interface: &Interface) -> bool {
    let virtual_only = ["awdl", "llw", "utun", "docker", "veth"]
        .iter()
        .any(|prefix| interface.name.starts_with(prefix));

    interface.is_oper_up()
        && !interface.is_loopback()
        && !interface.is_p2p()
        && !interface.ip().is_unspecified()
        && !virtual_only
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    fn use_mock_store() {
        crate::mock_keyring::install_mock_keyring();
    }

    #[test]
    fn identity_validation_rejects_short_or_unsafe_values() {
        assert!(validate_device_id("x").is_err());
        assert!(validate_device_id("device/1").is_err());
        assert!(validate_device_id("device-1").is_ok());
    }

    #[test]
    fn simulator_profiles_have_distinct_native_device_ids() {
        assert_eq!(
            effective_device_id("com.medicalconnect.desktop.caisse1", "browser-device"),
            "device-sim-caisse1"
        );
        assert_eq!(
            effective_device_id("com.medicalconnect.desktop.caisse2", "browser-device"),
            "device-sim-caisse2"
        );
        assert_eq!(
            effective_device_id("com.medicalconnect.desktop", "browser-device"),
            "browser-device"
        );
    }

    #[test]
    fn simulator_profiles_have_distinct_agent_ports() {
        assert_eq!(
            effective_agent_port("com.medicalconnect.desktop.caisse1"),
            DEFAULT_AGENT_PORT + 1
        );
        assert_eq!(
            effective_agent_port("com.medicalconnect.desktop.caisse2"),
            DEFAULT_AGENT_PORT + 2
        );
        assert_eq!(
            effective_agent_port("com.medicalconnect.desktop"),
            DEFAULT_AGENT_PORT
        );
    }

    #[test]
    fn dns_labels_are_normalized() {
        assert_eq!(dns_label("Caisse_01"), "caisse-01");
    }

    #[test]
    fn peer_reconciliation_clears_everything_when_the_lan_disappears() {
        let mut peers = HashMap::from([(
            "peer._medicalconnect._tcp.local.".into(),
            LanPeer {
                device_id: "peer".into(),
                service_name: "peer._medicalconnect._tcp.local.".into(),
                addresses: vec!["192.168.1.20".into()],
                port: DEFAULT_AGENT_PORT,
                protocol_version: PROTOCOL_VERSION.into(),
                last_seen_at: 1_000,
            },
        )]);

        reconcile_peers(&mut peers, false, 1_001);

        assert!(peers.is_empty());
    }

    #[test]
    fn peer_reconciliation_expires_old_announcements() {
        let now = PEER_STALE_AFTER.as_millis() as u64 + 10_000;
        let mut peers = HashMap::from([
            (
                "fresh".into(),
                LanPeer {
                    device_id: "fresh".into(),
                    service_name: "fresh".into(),
                    addresses: vec!["192.168.1.20".into()],
                    port: DEFAULT_AGENT_PORT,
                    protocol_version: PROTOCOL_VERSION.into(),
                    last_seen_at: now - 1_000,
                },
            ),
            (
                "stale".into(),
                LanPeer {
                    device_id: "stale".into(),
                    service_name: "stale".into(),
                    addresses: vec!["192.168.1.21".into()],
                    port: DEFAULT_AGENT_PORT,
                    protocol_version: PROTOCOL_VERSION.into(),
                    last_seen_at: now - PEER_STALE_AFTER.as_millis() as u64 - 1,
                },
            ),
        ]);

        reconcile_peers(&mut peers, true, now);

        assert!(peers.contains_key("fresh"));
        assert!(!peers.contains_key("stale"));
    }

    #[test]
    fn certificate_verification_binds_device_and_tenant() {
        use_mock_store();
        let ca = SigningKey::generate(&mut OsRng);
        let device = SigningKey::generate(&mut OsRng);
        save_lan_signing_key("caisse-cert", &device).expect("store signing key");
        let identity = StoredIdentity {
            device_id: "caisse-cert".into(),
            certificate: None,
            ca_public_key: None,
        };
        let payload = serde_json::json!({
            "version": 1,
            "deviceId": "caisse-cert",
            "tenantFingerprint": "tenantfingerprint_alpha_1234",
            "devicePublicKey": URL_SAFE_NO_PAD.encode(device.verifying_key().to_bytes()),
            "issuedAt": unix_millis(),
            "expiresAt": unix_millis() + 60_000
        });
        let encoded_payload = URL_SAFE_NO_PAD.encode(payload.to_string());
        let signature = ca.sign(encoded_payload.as_bytes());
        let certificate = format!(
            "{}.{}",
            encoded_payload,
            URL_SAFE_NO_PAD.encode(signature.to_bytes())
        );
        let ca_public_key = URL_SAFE_NO_PAD.encode(ca.verifying_key().to_bytes());

        let verified = verify_device_certificate(&certificate, &ca_public_key, &identity)
            .expect("valid certificate");
        assert_eq!(verified.device_id, "caisse-cert");
        assert_eq!(verified.tenant_fingerprint, "tenantfingerprint_alpha_1234");
    }

    #[test]
    fn peer_certificate_verification_accepts_a_same_tenant_device() {
        let ca = SigningKey::generate(&mut OsRng);
        let peer_device = SigningKey::generate(&mut OsRng);
        let identity = StoredIdentity {
            device_id: "caisse-1".into(),
            certificate: None,
            ca_public_key: Some(URL_SAFE_NO_PAD.encode(ca.verifying_key().to_bytes())),
        };
        let payload = serde_json::json!({
            "version": 1,
            "deviceId": "caisse-2",
            "tenantFingerprint": "tenantfingerprint_alpha_1234",
            "devicePublicKey": URL_SAFE_NO_PAD.encode(peer_device.verifying_key().to_bytes()),
            "issuedAt": unix_millis(),
            "expiresAt": unix_millis() + 60_000
        });
        let encoded_payload = URL_SAFE_NO_PAD.encode(payload.to_string());
        let signature = ca.sign(encoded_payload.as_bytes());
        let certificate = format!(
            "{}.{}",
            encoded_payload,
            URL_SAFE_NO_PAD.encode(signature.to_bytes())
        );

        let verified = verify_peer_certificate(&certificate, &identity)
            .expect("valid peer certificate from the same CA");
        assert_eq!(verified.device_id, "caisse-2");
        assert_eq!(verified.tenant_fingerprint, "tenantfingerprint_alpha_1234");
    }

    #[test]
    fn peer_certificate_verification_rejects_an_expired_certificate() {
        let ca = SigningKey::generate(&mut OsRng);
        let peer_device = SigningKey::generate(&mut OsRng);
        let identity = StoredIdentity {
            device_id: "caisse-1".into(),
            certificate: None,
            ca_public_key: Some(URL_SAFE_NO_PAD.encode(ca.verifying_key().to_bytes())),
        };
        let payload = serde_json::json!({
            "version": 1,
            "deviceId": "caisse-2",
            "tenantFingerprint": "tenantfingerprint_alpha_1234",
            "devicePublicKey": URL_SAFE_NO_PAD.encode(peer_device.verifying_key().to_bytes()),
            "issuedAt": unix_millis() - 120_000,
            "expiresAt": unix_millis() - 60_000
        });
        let encoded_payload = URL_SAFE_NO_PAD.encode(payload.to_string());
        let signature = ca.sign(encoded_payload.as_bytes());
        let certificate = format!(
            "{}.{}",
            encoded_payload,
            URL_SAFE_NO_PAD.encode(signature.to_bytes())
        );

        assert!(verify_peer_certificate(&certificate, &identity).is_err());
    }

    #[test]
    fn approval_capability_verification_accepts_a_capability_from_the_trusted_ca() {
        let ca = SigningKey::generate(&mut OsRng);
        let identity = StoredIdentity {
            device_id: "caisse-2".into(),
            certificate: None,
            ca_public_key: Some(URL_SAFE_NO_PAD.encode(ca.verifying_key().to_bytes())),
        };
        let payload = serde_json::json!({
            "version": 1,
            "purpose": "device-authorization-approve",
            "deviceId": "caisse-1",
            "tenantFingerprint": "tenantfingerprint_alpha_1234",
            "issuedAt": unix_millis(),
            "expiresAt": unix_millis() + 60_000
        });
        let encoded_payload = URL_SAFE_NO_PAD.encode(payload.to_string());
        let signature = ca.sign(encoded_payload.as_bytes());
        let capability = format!(
            "{}.{}",
            encoded_payload,
            URL_SAFE_NO_PAD.encode(signature.to_bytes())
        );

        let verified = verify_approval_capability(&capability, &identity)
            .expect("valid capability from the trusted CA");
        assert_eq!(verified.device_id, "caisse-1");
        assert_eq!(verified.purpose, "device-authorization-approve");
    }

    #[test]
    fn approval_capability_verification_rejects_an_expired_capability() {
        let ca = SigningKey::generate(&mut OsRng);
        let identity = StoredIdentity {
            device_id: "caisse-2".into(),
            certificate: None,
            ca_public_key: Some(URL_SAFE_NO_PAD.encode(ca.verifying_key().to_bytes())),
        };
        let payload = serde_json::json!({
            "version": 1,
            "purpose": "device-authorization-approve",
            "deviceId": "caisse-1",
            "tenantFingerprint": "tenantfingerprint_alpha_1234",
            "issuedAt": unix_millis() - 120_000,
            "expiresAt": unix_millis() - 60_000
        });
        let encoded_payload = URL_SAFE_NO_PAD.encode(payload.to_string());
        let signature = ca.sign(encoded_payload.as_bytes());
        let capability = format!(
            "{}.{}",
            encoded_payload,
            URL_SAFE_NO_PAD.encode(signature.to_bytes())
        );

        assert!(verify_approval_capability(&capability, &identity).is_err());
    }

    #[test]
    fn approval_capability_verification_rejects_a_capability_from_an_untrusted_ca() {
        let real_ca = SigningKey::generate(&mut OsRng);
        let impostor_ca = SigningKey::generate(&mut OsRng);
        let identity = StoredIdentity {
            device_id: "caisse-2".into(),
            certificate: None,
            ca_public_key: Some(URL_SAFE_NO_PAD.encode(real_ca.verifying_key().to_bytes())),
        };
        let payload = serde_json::json!({
            "version": 1,
            "purpose": "device-authorization-approve",
            "deviceId": "caisse-1",
            "tenantFingerprint": "tenantfingerprint_alpha_1234",
            "issuedAt": unix_millis(),
            "expiresAt": unix_millis() + 60_000
        });
        let encoded_payload = URL_SAFE_NO_PAD.encode(payload.to_string());
        let signature = impostor_ca.sign(encoded_payload.as_bytes());
        let capability = format!(
            "{}.{}",
            encoded_payload,
            URL_SAFE_NO_PAD.encode(signature.to_bytes())
        );

        assert!(verify_approval_capability(&capability, &identity).is_err());
    }

    #[test]
    fn grant_records_round_trip_through_sign_and_verify() {
        use_mock_store();
        let signer = SigningKey::generate(&mut OsRng);
        save_lan_signing_key("caisse-1", &signer).expect("store signing key");
        let identity = StoredIdentity {
            device_id: "caisse-1".into(),
            certificate: None,
            ca_public_key: None,
        };
        let grant = GrantRecordPayload {
            granted_device_id: "caisse-3".into(),
            granted_by_device_id: "caisse-1".into(),
            tenant_fingerprint: "tenantfingerprint_alpha_1234".into(),
            decided_at: "2026-08-16T00:00:00.000Z".into(),
        };

        let signature = sign_grant_record(&identity, &grant).expect("signs successfully");

        let encoded = URL_SAFE_NO_PAD.encode(serde_json::to_string(&grant).unwrap());
        let signature_bytes = URL_SAFE_NO_PAD.decode(&signature).expect("valid base64");
        let sig = Signature::from_slice(&signature_bytes).expect("valid signature length");
        signer
            .verifying_key()
            .verify(encoded.as_bytes(), &sig)
            .expect("verifies against the signer's own public key");
    }

    #[test]
    fn envelopes_round_trip_through_sign_and_verify() {
        use_mock_store();
        let ca = SigningKey::generate(&mut OsRng);
        let sender_device = SigningKey::generate(&mut OsRng);
        save_lan_signing_key("caisse-env-send", &sender_device).expect("store signing key");
        let sender_identity = StoredIdentity {
            device_id: "caisse-env-send".into(),
            certificate: None,
            ca_public_key: Some(URL_SAFE_NO_PAD.encode(ca.verifying_key().to_bytes())),
        };
        let cert_payload = serde_json::json!({
            "version": 1,
            "deviceId": "caisse-env-send",
            "tenantFingerprint": "tenantfingerprint_alpha_1234",
            "devicePublicKey": URL_SAFE_NO_PAD.encode(sender_device.verifying_key().to_bytes()),
            "issuedAt": unix_millis(),
            "expiresAt": unix_millis() + 60_000
        });
        let encoded_cert_payload = URL_SAFE_NO_PAD.encode(cert_payload.to_string());
        let cert_signature = ca.sign(encoded_cert_payload.as_bytes());
        let sender_certificate = format!(
            "{}.{}",
            encoded_cert_payload,
            URL_SAFE_NO_PAD.encode(cert_signature.to_bytes())
        );

        let message = serde_json::json!({
            "productId": "product-1",
            "requesterId": "caisse-env-send",
            "requesterName": "Caisse 2"
        });

        let envelope = sign_envelope(&sender_identity, &sender_certificate, message.clone())
            .expect("signing succeeds with a valid identity");

        let receiver_device = SigningKey::generate(&mut OsRng);
        save_lan_signing_key("caisse-env-recv", &receiver_device).expect("store signing key");
        let receiver_cert_payload = serde_json::json!({
            "version": 1,
            "deviceId": "caisse-env-recv",
            "tenantFingerprint": "tenantfingerprint_alpha_1234",
            "devicePublicKey": URL_SAFE_NO_PAD.encode(receiver_device.verifying_key().to_bytes()),
            "issuedAt": unix_millis(),
            "expiresAt": unix_millis() + 60_000
        });
        let encoded_receiver_cert_payload =
            URL_SAFE_NO_PAD.encode(receiver_cert_payload.to_string());
        let receiver_cert_signature = ca.sign(encoded_receiver_cert_payload.as_bytes());
        let receiver_certificate = format!(
            "{}.{}",
            encoded_receiver_cert_payload,
            URL_SAFE_NO_PAD.encode(receiver_cert_signature.to_bytes())
        );
        let receiver_identity = StoredIdentity {
            device_id: "caisse-env-recv".into(),
            certificate: Some(receiver_certificate),
            ca_public_key: Some(URL_SAFE_NO_PAD.encode(ca.verifying_key().to_bytes())),
        };

        let verified = verify_envelope(&envelope, &receiver_identity)
            .expect("a correctly signed envelope from a same-tenant peer verifies");
        assert_eq!(verified.sender.device_id, "caisse-env-send");
        assert_eq!(verified.payload, message);
    }

    #[test]
    fn envelopes_reject_a_tampered_payload() {
        use_mock_store();
        let ca = SigningKey::generate(&mut OsRng);
        let sender_device = SigningKey::generate(&mut OsRng);
        save_lan_signing_key("caisse-tamper-send", &sender_device).expect("store signing key");
        let sender_identity = StoredIdentity {
            device_id: "caisse-tamper-send".into(),
            certificate: None,
            ca_public_key: Some(URL_SAFE_NO_PAD.encode(ca.verifying_key().to_bytes())),
        };
        let cert_payload = serde_json::json!({
            "version": 1,
            "deviceId": "caisse-tamper-send",
            "tenantFingerprint": "tenantfingerprint_alpha_1234",
            "devicePublicKey": URL_SAFE_NO_PAD.encode(sender_device.verifying_key().to_bytes()),
            "issuedAt": unix_millis(),
            "expiresAt": unix_millis() + 60_000
        });
        let encoded_cert_payload = URL_SAFE_NO_PAD.encode(cert_payload.to_string());
        let cert_signature = ca.sign(encoded_cert_payload.as_bytes());
        let sender_certificate = format!(
            "{}.{}",
            encoded_cert_payload,
            URL_SAFE_NO_PAD.encode(cert_signature.to_bytes())
        );

        let mut envelope = sign_envelope(
            &sender_identity,
            &sender_certificate,
            serde_json::json!({ "productId": "product-1" }),
        )
        .expect("signing succeeds");
        envelope.payload = serde_json::json!({ "productId": "product-TAMPERED" });

        let receiver_device = SigningKey::generate(&mut OsRng);
        save_lan_signing_key("caisse-tamper-recv", &receiver_device).expect("store signing key");
        let receiver_cert_payload = serde_json::json!({
            "version": 1,
            "deviceId": "caisse-tamper-recv",
            "tenantFingerprint": "tenantfingerprint_alpha_1234",
            "devicePublicKey": URL_SAFE_NO_PAD.encode(receiver_device.verifying_key().to_bytes()),
            "issuedAt": unix_millis(),
            "expiresAt": unix_millis() + 60_000
        });
        let encoded_receiver_cert_payload =
            URL_SAFE_NO_PAD.encode(receiver_cert_payload.to_string());
        let receiver_cert_signature = ca.sign(encoded_receiver_cert_payload.as_bytes());
        let receiver_certificate = format!(
            "{}.{}",
            encoded_receiver_cert_payload,
            URL_SAFE_NO_PAD.encode(receiver_cert_signature.to_bytes())
        );
        let receiver_identity = StoredIdentity {
            device_id: "caisse-tamper-recv".into(),
            certificate: Some(receiver_certificate),
            ca_public_key: Some(URL_SAFE_NO_PAD.encode(ca.verifying_key().to_bytes())),
        };

        assert!(verify_envelope(&envelope, &receiver_identity).is_err());
    }

    #[test]
    fn missing_signing_key_for_an_existing_identity_is_a_fatal_error_not_a_silent_regeneration() {
        use_mock_store();
        // Simulate an existing identity whose keyring entry never made it
        // to this machine (or was cleared) - `signing_key()` must fail
        // rather than let a caller silently mint a new one.
        let identity = StoredIdentity {
            device_id: "caisse-orphaned".into(),
            certificate: None,
            ca_public_key: None,
        };
        assert!(signing_key(&identity).is_err());
    }

    #[test]
    fn mdns_discovers_only_the_expected_tenant() {
        let expected_tenant = "tenantfingerprint_alpha_1234";
        let publisher = ServiceDaemon::new().expect("publisher daemon");
        let browser = ServiceDaemon::new().expect("browser daemon");
        let unique = unix_millis();

        for (device, tenant, port) in [
            ("caisse-alpha", expected_tenant, 45_839),
            ("caisse-beta", "tenantfingerprint_beta_5678", 45_840),
        ] {
            let instance = format!("{device}-{unique}");
            let host = format!("{instance}.local.");
            let properties = [
                ("device", device),
                ("tenant", tenant),
                ("protocol", PROTOCOL_VERSION),
            ];
            let service = ServiceInfo::new(
                SERVICE_TYPE,
                &instance,
                &host,
                "127.0.0.1",
                port,
                &properties[..],
            )
            .expect("test service");
            publisher.register(service).expect("register test service");
        }

        let events = browser.browse(SERVICE_TYPE).expect("browse services");
        let deadline = Instant::now() + Duration::from_secs(8);
        let mut accepted = Vec::new();
        let mut saw_other_tenant = false;

        while Instant::now() < deadline && (accepted.is_empty() || !saw_other_tenant) {
            let remaining = deadline.saturating_duration_since(Instant::now());
            let Ok(event) = events.recv_timeout(remaining) else {
                break;
            };
            if let ServiceEvent::ServiceResolved(service) = event {
                if service.get_property_val_str("tenant") == Some("tenantfingerprint_beta_5678") {
                    saw_other_tenant = true;
                    assert!(
                        peer_from_resolved(&service, expected_tenant, "local-device").is_none()
                    );
                }
                if let Some(peer) = peer_from_resolved(&service, expected_tenant, "local-device") {
                    accepted.push(peer);
                }
            }
        }

        let _ = browser.stop_browse(SERVICE_TYPE);
        let _ = browser.shutdown();
        let _ = publisher.shutdown();

        assert!(
            saw_other_tenant,
            "the other tenant announcement was observed"
        );
        assert_eq!(accepted.len(), 1);
        assert_eq!(accepted[0].device_id, "caisse-alpha");
        assert_eq!(accepted[0].port, 45_839);
    }
}
