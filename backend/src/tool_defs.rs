// ---------------------------------------------------------------------------
// tool_defs.rs — OpenAI tool definitions
// ---------------------------------------------------------------------------

use serde_json::{Value, json};

pub fn build_tools(state: &crate::state::AppState) -> Value {
    state.tool_defs_cache.get_or_init(|| json!([
        {
            "type": "function",
            "function": {
                "name": "list_directory",
                "description": "List files and subdirectories in a local directory with sizes and line counts.",
                "parameters": { "type": "object", "properties": { "path": { "type": "string", "description": "Absolute path to the local directory" }, "show_hidden": { "type": "boolean", "description": "Include hidden files (dotfiles)" } }, "required": ["path"] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Read a file from the local filesystem by its absolute path.",
                "parameters": { "type": "object", "properties": { "path": { "type": "string", "description": "Absolute path to the local file" } }, "required": ["path"] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "read_file_section",
                "description": "Read specific line range from a file.",
                "parameters": { "type": "object", "properties": { "path": { "type": "string", "description": "Absolute path to the file" }, "start_line": { "type": "integer" }, "end_line": { "type": "integer" } }, "required": ["path", "start_line", "end_line"] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "search_files",
                "description": "Search for text or regex patterns across all files in a directory.",
                "parameters": { "type": "object", "properties": { "path": { "type": "string" }, "pattern": { "type": "string" }, "file_extensions": { "type": "string" }, "offset": { "type": "integer" }, "limit": { "type": "integer" }, "multiline": { "type": "boolean" } }, "required": ["path", "pattern"] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "find_file",
                "description": "Find files by name pattern (glob).",
                "parameters": { "type": "object", "properties": { "path": { "type": "string" }, "pattern": { "type": "string" } }, "required": ["path", "pattern"] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_code_structure",
                "description": "Analyze code structure via AST.",
                "parameters": { "type": "object", "properties": { "path": { "type": "string" } }, "required": ["path"] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "write_file",
                "description": "Write or create a file on the local filesystem.",
                "parameters": { "type": "object", "properties": { "path": { "type": "string" }, "content": { "type": "string" } }, "required": ["path", "content"] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "edit_file",
                "description": "Edit an existing file by replacing a specific text section.",
                "parameters": { "type": "object", "properties": { "path": { "type": "string" }, "old_text": { "type": "string" }, "new_text": { "type": "string" } }, "required": ["path", "old_text", "new_text"] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "delete_file",
                "description": "Delete a file or empty directory.",
                "parameters": { "type": "object", "properties": { "path": { "type": "string" } }, "required": ["path"] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "diff_files",
                "description": "Compare two files and show line-by-line differences.",
                "parameters": { "type": "object", "properties": { "path_a": { "type": "string" }, "path_b": { "type": "string" } }, "required": ["path_a", "path_b"] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "read_pdf",
                "description": "Extract text from a PDF file.",
                "parameters": { "type": "object", "properties": { "path": { "type": "string" }, "page_range": { "type": "string" } }, "required": ["path"] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "analyze_image",
                "description": "Analyze an image file using Vision API.",
                "parameters": { "type": "object", "properties": { "path": { "type": "string" }, "prompt": { "type": "string" }, "extract_text": { "type": "boolean" } }, "required": ["path"] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "ocr_document",
                "description": "Extract text from an image or PDF using OCR.",
                "parameters": { "type": "object", "properties": { "path": { "type": "string" }, "prompt": { "type": "string" } }, "required": ["path"] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "fetch_webpage",
                "description": "Fetch a web page and extract text.",
                "parameters": { "type": "object", "properties": { "url": { "type": "string" }, "extract_links": { "type": "boolean" }, "extract_metadata": { "type": "boolean" }, "include_images": { "type": "boolean" }, "output_format": { "type": "string" }, "max_text_length": { "type": "integer" }, "headers": { "type": "object" } }, "required": ["url"] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "crawl_website",
                "description": "Crawl a website.",
                "parameters": { "type": "object", "properties": { "url": { "type": "string" }, "max_depth": { "type": "integer" }, "max_pages": { "type": "integer" }, "same_domain_only": { "type": "boolean" }, "path_prefix": { "type": "string" }, "exclude_patterns": { "type": "array", "items": { "type": "string" } }, "respect_robots_txt": { "type": "boolean" }, "use_sitemap": { "type": "boolean" }, "concurrent_requests": { "type": "integer" }, "delay_ms": { "type": "integer" }, "max_total_seconds": { "type": "integer" }, "output_format": { "type": "string" }, "max_text_length": { "type": "integer" }, "include_metadata": { "type": "boolean" }, "headers": { "type": "object" } }, "required": ["url"] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "git_status",
                "description": "Show working tree status.",
                "parameters": { "type": "object", "properties": { "repo_path": { "type": "string" } }, "required": ["repo_path"] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "git_log",
                "description": "Show commit history.",
                "parameters": { "type": "object", "properties": { "repo_path": { "type": "string" }, "count": { "type": "integer" } }, "required": ["repo_path"] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "git_diff",
                "description": "Show changes (diff) in a git repository.",
                "parameters": { "type": "object", "properties": { "repo_path": { "type": "string" }, "target": { "type": "string" } }, "required": ["repo_path"] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "git_branch",
                "description": "List, create, or switch git branches.",
                "parameters": { "type": "object", "properties": { "repo_path": { "type": "string" }, "action": { "type": "string" } }, "required": ["repo_path"] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "git_commit",
                "description": "Stage files and create a git commit.",
                "parameters": { "type": "object", "properties": { "repo_path": { "type": "string" }, "message": { "type": "string" }, "files": { "type": "string" } }, "required": ["repo_path", "message"] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "call_agent",
                "description": "Delegate a subtask to another Witcher agent.",
                "parameters": { "type": "object", "properties": { "agent_id": { "type": "string" }, "task": { "type": "string" } }, "required": ["agent_id", "task"] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "execute_command",
                "description": "Execute a shell command on the local Windows machine.",
                "parameters": { "type": "object", "properties": { "command": { "type": "string" }, "working_directory": { "type": "string" } }, "required": ["command"] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "ask_user",
                "description": "Ask the user a question to gather preferences.",
                "parameters": { "type": "object", "properties": { "question": { "type": "string" }, "options": { "type": "array", "items": { "type": "string" } } }, "required": ["question"] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_mcp_tools",
                "description": "List all available MCP tools.",
                "parameters": { "type": "object", "properties": {}, "required": [] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "execute_mcp_tool",
                "description": "Execute a specific MCP tool.",
                "parameters": { "type": "object", "properties": { "tool_name": { "type": "string" }, "arguments": { "type": "object" } }, "required": ["tool_name"] }
            }
        }
    ])).clone()
}

pub async fn build_tools_with_mcp(state: &crate::state::AppState) -> serde_json::Value {
    let native = build_tools(state);
    
    // The mcp_client returns Gemini format: {"name": "...", "description": "...", "parameters": {}}
    // We must map it to OpenAI format: {"type": "function", "function": {...}}
    let mcp_decls_gemini = state.mcp_client.build_gemini_tool_declarations().await;
    
    if mcp_decls_gemini.is_empty() {
        return native;
    }
    
    let mut mcp_decls_openai = Vec::new();
    for decl in mcp_decls_gemini {
        mcp_decls_openai.push(json!({
            "type": "function",
            "function": decl
        }));
    }

    let mut result = native.clone();
    if let Some(arr) = result.as_array_mut() {
        let native_tools: Vec<serde_json::Value> = std::mem::take(arr);
        arr.extend(mcp_decls_openai);
        arr.extend(native_tools);
    }
    result
}
