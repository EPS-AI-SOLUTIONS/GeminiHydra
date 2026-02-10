// GeminiHydra Tauri Backend
// llama.cpp integration via llama-cpp-2 bindings

use once_cell::sync::Lazy;
use parking_lot::RwLock;
use std::path::Path;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Window};

mod llama_backend;
mod model_downloader;
mod model_manager;

// ── Extracted modules ──
pub mod security;
pub mod bridge;
pub mod gemini_api;
pub mod system_commands;
pub mod memory_system;

use llama_backend::{ChatMessage, GenerateParams, ModelConfig};
use model_downloader::{DownloadProgress, ModelDownloader};
use model_manager::{get_recommended_models, GGUFModelInfo, ModelManager, RecommendedModel};

use gemini_api::{StreamPayload, DownloadProgressPayload};

// ============================================================================
// GLOBAL STATE
// ============================================================================

/// Global model manager instance
static MODEL_MANAGER: Lazy<RwLock<Option<ModelManager>>> = Lazy::new(|| RwLock::new(None));

/// Global model downloader instance
static MODEL_DOWNLOADER: Lazy<RwLock<Option<ModelDownloader>>> = Lazy::new(|| RwLock::new(None));

/// Get the base directory for GeminiHydra (portable support)
pub fn get_base_dir() -> std::path::PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default())
}

/// Get the GeminiHydra project root directory.
///
/// Resolution order:
/// 1. GEMINIHYDRA_ROOT environment variable (explicit override)
/// 2. Compile-time CARGO_MANIFEST_DIR (dev builds) - go up 2 levels
/// 3. Walk up from executable looking for package.json with "gemini-hydra-core"
/// 4. Fallback to get_base_dir()
pub fn get_project_root() -> std::path::PathBuf {
    // 1. Environment variable override
    if let Ok(root) = std::env::var("GEMINIHYDRA_ROOT") {
        let path = std::path::PathBuf::from(&root);
        if path.is_dir() {
            return path;
        }
    }

    // 2. Compile-time path
    let manifest_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    if let Some(project_root) = manifest_dir.parent().and_then(|p| p.parent()) {
        if project_root.join("package.json").exists() {
            return project_root.to_path_buf();
        }
    }

    // 3. Walk up from executable
    if let Ok(exe_path) = std::env::current_exe() {
        let mut current = exe_path.as_path();
        for _ in 0..10 {
            if let Some(parent) = current.parent() {
                if let Ok(content) = std::fs::read_to_string(parent.join("package.json")) {
                    if content.contains("gemini-hydra-core") {
                        return parent.to_path_buf();
                    }
                }
                current = parent;
            } else {
                break;
            }
        }
    }

    // 4. Fallback
    get_base_dir()
}

/// Get the models directory path
fn get_models_dir() -> std::path::PathBuf {
    get_base_dir().join("data").join("models")
}

pub fn get_bridge_path() -> std::path::PathBuf {
    get_base_dir().join("bridge.json")
}

/// Initialize the model manager and downloader
fn initialize_model_system() {
    let models_dir = get_models_dir();

    // Initialize model manager
    {
        let mut manager_guard = MODEL_MANAGER.write();
        if manager_guard.is_none() {
            let manager = ModelManager::new(models_dir.clone());
            let _ = manager.ensure_models_dir();
            *manager_guard = Some(manager);
        }
    }

    // Initialize model downloader
    {
        let mut downloader_guard = MODEL_DOWNLOADER.write();
        if downloader_guard.is_none() {
            *downloader_guard = Some(ModelDownloader::new(models_dir));
        }
    }
}

// ============================================================================
// LLAMA.CPP COMMANDS
// ============================================================================

/// Initialize llama.cpp backend
#[tauri::command]
async fn llama_initialize() -> Result<String, String> {
    llama_backend::initialize_backend().map_err(|e| e.to_string())?;
    Ok("llama.cpp backend initialized".to_string())
}

/// Load a model into memory
#[tauri::command]
async fn llama_load_model(model_path: String, gpu_layers: Option<i32>) -> Result<String, String> {
    let config = ModelConfig {
        gpu_layers: gpu_layers.unwrap_or(99),
        ..Default::default()
    };

    let full_path = if Path::new(&model_path).is_absolute() {
        model_path.clone()
    } else {
        get_models_dir()
            .join(&model_path)
            .to_string_lossy()
            .to_string()
    };

    llama_backend::load_model(&full_path, Some(config)).map_err(|e| e.to_string())?;
    Ok(format!("Model loaded: {}", model_path))
}

/// Unload the current model
#[tauri::command]
async fn llama_unload_model() -> Result<String, String> {
    llama_backend::unload_model().map_err(|e| e.to_string())?;
    Ok("Model unloaded".to_string())
}

/// Check if a model is loaded
#[tauri::command]
async fn llama_is_model_loaded() -> Result<bool, String> {
    Ok(llama_backend::is_model_loaded())
}

/// Get the current model path
#[tauri::command]
async fn llama_get_current_model() -> Result<Option<String>, String> {
    Ok(llama_backend::get_current_model_path().map(|p| p.to_string_lossy().to_string()))
}

/// Generate text from a prompt
#[tauri::command]
async fn llama_generate(
    prompt: String,
    system: Option<String>,
    temperature: Option<f32>,
    max_tokens: Option<u32>,
) -> Result<String, String> {
    let params = GenerateParams {
        temperature: temperature.unwrap_or(0.7),
        max_tokens: max_tokens.unwrap_or(2048),
        ..Default::default()
    };

    llama_backend::generate(&prompt, system.as_deref(), params).map_err(|e| e.to_string())
}

/// Generate text with streaming
#[tauri::command]
async fn llama_generate_stream(
    window: Window,
    prompt: String,
    system: Option<String>,
    temperature: Option<f32>,
    max_tokens: Option<u32>,
) -> Result<(), String> {
    let params = GenerateParams {
        temperature: temperature.unwrap_or(0.7),
        max_tokens: max_tokens.unwrap_or(2048),
        ..Default::default()
    };

    let window_clone = window.clone();
    let result = tokio::task::spawn_blocking(move || {
        llama_backend::generate_stream(&prompt, system.as_deref(), params, move |chunk| {
            let _ = window_clone.emit(
                "llama-stream",
                StreamPayload {
                    chunk: chunk.to_string(),
                    done: false,
                },
            );
        })
    })
    .await
    .map_err(|e| e.to_string())?;

    result.map_err(|e| e.to_string())?;

    window
        .emit(
            "llama-stream",
            StreamPayload {
                chunk: "".to_string(),
                done: true,
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Chat with the model
#[tauri::command]
async fn llama_chat(
    messages: Vec<ChatMessage>,
    temperature: Option<f32>,
    max_tokens: Option<u32>,
) -> Result<String, String> {
    let params = GenerateParams {
        temperature: temperature.unwrap_or(0.7),
        max_tokens: max_tokens.unwrap_or(2048),
        ..Default::default()
    };

    llama_backend::chat(messages, params).map_err(|e| e.to_string())
}

/// Chat with streaming
#[tauri::command]
async fn llama_chat_stream(
    window: Window,
    messages: Vec<ChatMessage>,
    temperature: Option<f32>,
    max_tokens: Option<u32>,
) -> Result<(), String> {
    let params = GenerateParams {
        temperature: temperature.unwrap_or(0.7),
        max_tokens: max_tokens.unwrap_or(2048),
        ..Default::default()
    };

    let window_clone = window.clone();
    let result = tokio::task::spawn_blocking(move || {
        llama_backend::chat_stream(messages, params, move |chunk| {
            let _ = window_clone.emit(
                "llama-stream",
                StreamPayload {
                    chunk: chunk.to_string(),
                    done: false,
                },
            );
        })
    })
    .await
    .map_err(|e| e.to_string())?;

    result.map_err(|e| e.to_string())?;

    window
        .emit(
            "llama-stream",
            StreamPayload {
                chunk: "".to_string(),
                done: true,
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Get embeddings for text
#[tauri::command]
async fn llama_get_embeddings(text: String) -> Result<Vec<f32>, String> {
    llama_backend::get_embeddings(&text).map_err(|e| e.to_string())
}

// ============================================================================
// MODEL MANAGEMENT COMMANDS
// ============================================================================

/// List available GGUF models
#[tauri::command]
async fn llama_list_models() -> Result<Vec<GGUFModelInfo>, String> {
    let mut manager_guard = MODEL_MANAGER.write();
    let manager = manager_guard
        .as_mut()
        .ok_or("Model manager not initialized")?;

    manager.scan_models().map_err(|e| e.to_string())
}

/// Get model information
#[tauri::command]
async fn llama_get_model_info(model_path: String) -> Result<GGUFModelInfo, String> {
    let manager_guard = MODEL_MANAGER.read();
    let manager = manager_guard
        .as_ref()
        .ok_or("Model manager not initialized")?;

    manager.get_model_info(&model_path).map_err(|e| e.to_string())
}

/// Delete a model
#[tauri::command]
async fn llama_delete_model(model_path: String) -> Result<(), String> {
    if let Some(current) = llama_backend::get_current_model_path() {
        if current.to_string_lossy().contains(&model_path) {
            llama_backend::unload_model().map_err(|e| e.to_string())?;
        }
    }

    let manager_guard = MODEL_MANAGER.read();
    let manager = manager_guard
        .as_ref()
        .ok_or("Model manager not initialized")?;

    manager.delete_model(&model_path).map_err(|e| e.to_string())
}

/// Get recommended models for download
#[tauri::command]
async fn llama_get_recommended_models() -> Result<Vec<RecommendedModel>, String> {
    Ok(get_recommended_models())
}

/// Download a model from HuggingFace
#[tauri::command]
async fn llama_download_model(
    window: Window,
    repo_id: String,
    filename: String,
) -> Result<String, String> {
    let downloader = {
        let downloader_guard = MODEL_DOWNLOADER.read();
        downloader_guard
            .as_ref()
            .ok_or("Model downloader not initialized")?
            .clone()
    };

    let window_clone = window.clone();
    let filename_clone = filename.clone();

    let result = downloader
        .download(&repo_id, &filename, Some(move |progress: DownloadProgress| {
            let _ = window_clone.emit(
                "llama-download-progress",
                DownloadProgressPayload {
                    filename: filename_clone.clone(),
                    downloaded: progress.downloaded,
                    total: progress.total,
                    speed_bps: progress.speed_bps,
                    percentage: progress.percentage,
                    complete: progress.complete,
                    error: progress.error,
                },
            );
        }))
        .await
        .map_err(|e| e.to_string())?;

    Ok(result.to_string_lossy().to_string())
}

/// Cancel ongoing download
#[tauri::command]
async fn llama_cancel_download() -> Result<(), String> {
    let downloader_guard = MODEL_DOWNLOADER.read();
    if let Some(downloader) = downloader_guard.as_ref() {
        downloader.cancel();
    }
    Ok(())
}

// ============================================================================
// APPLICATION ENTRY POINT
// ============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Initialize llama.cpp and model system on startup
            tauri::async_runtime::spawn(async {
                initialize_model_system();
                let _ = llama_backend::initialize_backend();
            });

            let quit_i = MenuItem::with_id(app, "quit", "Zakoncz", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Pokaz Okno", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app: &AppHandle, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray: &tauri::tray::TrayIcon, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                window.hide().unwrap();
                api.prevent_close();
            }
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            // Basic
            bridge::greet,
            gemini_api::get_env_vars,
            // Bridge
            bridge::get_bridge_state,
            bridge::set_auto_approve,
            bridge::approve_request,
            bridge::reject_request,
            // llama.cpp
            llama_initialize,
            llama_load_model,
            llama_unload_model,
            llama_is_model_loaded,
            llama_get_current_model,
            llama_generate,
            llama_generate_stream,
            llama_chat,
            llama_chat_stream,
            llama_get_embeddings,
            // Model management
            llama_list_models,
            llama_get_model_info,
            llama_delete_model,
            llama_get_recommended_models,
            llama_download_model,
            llama_cancel_download,
            // Gemini
            gemini_api::prompt_gemini_stream,
            gemini_api::get_gemini_models,
            gemini_api::chat_with_gemini,
            // System
            system_commands::run_system_command,
            system_commands::save_file_content,
            system_commands::spawn_swarm_agent_v2,
            // Memory system
            memory_system::get_agent_memories,
            memory_system::add_agent_memory,
            memory_system::get_knowledge_graph,
            memory_system::add_knowledge_node,
            memory_system::add_knowledge_edge,
            memory_system::clear_agent_memories
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app_handle, event| match event {
            tauri::RunEvent::ExitRequested { api, .. } => {
                api.prevent_exit();
            }
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_project_root_finds_package_json() {
        let root = get_project_root();
        assert!(
            root.join("package.json").exists(),
            "Project root {:?} should contain package.json",
            root
        );
    }

    #[test]
    fn test_get_project_root_is_gemini_hydra() {
        let root = get_project_root();
        let pkg = std::fs::read_to_string(root.join("package.json"))
            .expect("Should be able to read package.json");
        assert!(
            pkg.contains("gemini-hydra-core"),
            "package.json should be for gemini-hydra-core project"
        );
    }
}
