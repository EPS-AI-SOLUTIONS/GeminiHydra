mod agentic;
mod chat_history;
mod claude;
mod commands;
mod ollama;
mod ollama_commands;

use tauri::Manager;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logging
    let _ = tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Initialize Claude state
            let claude_state = claude::state::AppState::new();
            app.manage(claude_state);

            // Initialize Ollama state
            let ollama_state = ollama_commands::OllamaState::new();
            app.manage(ollama_state);

            tracing::info!("Claude Code GUI initialized");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Claude commands
            commands::start_claude_session,
            commands::stop_claude_session,
            commands::send_input,
            commands::approve_action,
            commands::deny_action,
            commands::get_approval_rules,
            commands::update_approval_rules,
            commands::toggle_auto_approve_all,
            commands::get_session_status,
            commands::get_approval_history,
            commands::clear_approval_history,
            // Ollama commands
            ollama_commands::ollama_list_models,
            ollama_commands::ollama_health_check,
            ollama_commands::ollama_generate,
            ollama_commands::ollama_generate_sync,
            ollama_commands::ollama_chat,
            // Chat history commands
            chat_history::list_chat_sessions,
            chat_history::get_chat_session,
            chat_history::create_chat_session,
            chat_history::add_chat_message,
            chat_history::delete_chat_session,
            chat_history::update_chat_title,
            chat_history::clear_all_chats,
            // Agentic commands
            agentic::execute_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
