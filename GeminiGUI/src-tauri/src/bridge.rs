// ============================================================================
// BRIDGE: Communication bridge between CLI and GUI
// ============================================================================

use serde::{Deserialize, Serialize};
use std::fs;

use crate::get_bridge_path;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BridgeRequest {
    pub id: String,
    pub message: String,
    pub status: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BridgeData {
    pub requests: Vec<BridgeRequest>,
    pub auto_approve: bool,
}

impl Default for BridgeData {
    fn default() -> Self {
        Self {
            requests: vec![],
            auto_approve: true,
        }
    }
}

pub fn read_bridge_data() -> BridgeData {
    let bridge_path = get_bridge_path();
    if !bridge_path.exists() {
        return BridgeData::default();
    }
    match fs::read_to_string(&bridge_path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or(BridgeData::default()),
        Err(_) => BridgeData::default(),
    }
}

pub fn write_bridge_data(data: &BridgeData) -> Result<(), String> {
    let bridge_path = get_bridge_path();
    let content = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    fs::write(&bridge_path, content).map_err(|e| e.to_string())
}

// ── Tauri Commands ──

#[tauri::command]
pub fn get_bridge_state() -> Result<BridgeData, String> {
    Ok(read_bridge_data())
}

#[tauri::command]
pub fn set_auto_approve(enabled: bool) -> Result<BridgeData, String> {
    let mut data = read_bridge_data();
    data.auto_approve = enabled;
    write_bridge_data(&data)?;
    Ok(data)
}

#[tauri::command]
pub fn approve_request(id: String) -> Result<BridgeData, String> {
    let mut data = read_bridge_data();
    if let Some(req) = data.requests.iter_mut().find(|r| r.id == id) {
        req.status = "approved".to_string();
    }
    write_bridge_data(&data)?;
    Ok(data)
}

#[tauri::command]
pub fn reject_request(id: String) -> Result<BridgeData, String> {
    let mut data = read_bridge_data();
    if let Some(req) = data.requests.iter_mut().find(|r| r.id == id) {
        req.status = "rejected".to_string();
    }
    write_bridge_data(&data)?;
    Ok(data)
}

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}
