// ---------------------------------------------------------------------------
// prompt.rs — System prompt building & knowledge context (extracted from handlers/mod.rs)
// ---------------------------------------------------------------------------

use serde_json::{Value, json};

use crate::models::WitcherAgent;
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Jaskier Knowledge API — optional project context enrichment
// ---------------------------------------------------------------------------

/// Fetch project knowledge from the Jaskier Knowledge API.
/// Returns a formatted section to append to the system prompt, or an empty
/// string if the API is unavailable, not configured, or returns an error.
pub async fn fetch_knowledge_context(state: &AppState, project_id: &str) -> String {
    let base_url = match &state.knowledge_api_url {
        Some(url) => url,
        None => return String::new(),
    };

    if project_id.is_empty() {
        return String::new();
    }

    let url = format!(
        "{}/api/knowledge/projects/{}",
        base_url.trim_end_matches('/'),
        project_id
    );

    let mut req = state
        .client
        .get(&url)
        .timeout(std::time::Duration::from_secs(3));
    if let Some(secret) = &state.knowledge_auth_secret {
        req = req.header("Authorization", format!("Bearer {}", secret));
    }

    let resp = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!("Knowledge API request failed: {}", e);
            return String::new();
        }
    };

    if !resp.status().is_success() {
        tracing::warn!("Knowledge API returned status {}", resp.status());
        return String::new();
    }

    let body: serde_json::Value = match resp.json().await {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!("Knowledge API response parse failed: {}", e);
            return String::new();
        }
    };

    // Build a concise summary from the response
    let mut parts = Vec::new();

    if let Some(name) = body.get("name").and_then(|v| v.as_str()) {
        parts.push(format!("**Project**: {}", name));
    }
    if let Some(count) = body.get("components_count").and_then(|v| v.as_u64()) {
        parts.push(format!("**Components**: {}", count));
    }
    if let Some(count) = body.get("dependencies_count").and_then(|v| v.as_u64()) {
        parts.push(format!("**Dependencies**: {}", count));
    }
    if let Some(views) = body.get("views").and_then(|v| v.as_array()) {
        let names: Vec<&str> = views.iter().filter_map(|v| v.as_str()).collect();
        if !names.is_empty() {
            parts.push(format!("**Views**: {}", names.join(", ")));
        }
    }
    if let Some(hooks) = body.get("hooks").and_then(|v| v.as_array()) {
        let names: Vec<&str> = hooks.iter().filter_map(|v| v.as_str()).collect();
        if !names.is_empty() {
            parts.push(format!("**Hooks**: {}", names.join(", ")));
        }
    }

    if parts.is_empty() {
        return String::new();
    }

    format!(
        "\n\n## Project Knowledge (from Jaskier Knowledge Base)\n{}",
        parts.join("\n")
    )
}

// ---------------------------------------------------------------------------
// System Prompt Factory
// ---------------------------------------------------------------------------

pub fn build_system_prompt(
    agent_id: &str,
    agents: &[WitcherAgent],
    language: &str,
    model: &str,
    working_directory: &str,
) -> String {
    let agent = agents
        .iter()
        .find(|a| a.id == agent_id)
        .unwrap_or(&agents[0]);

    let roster: String = agents
        .iter()
        .map(|a| {
            let kw = if a.keywords.is_empty() {
                String::new()
            } else {
                format!(
                    " [{}]",
                    a.keywords
                        .iter()
                        .take(5)
                        .cloned()
                        .collect::<Vec<_>>()
                        .join(", ")
                )
            };
            format!("  - {} ({}) — {}{}", a.name, a.role, a.description, kw)
        })
        .collect::<Vec<_>>()
        .join("\n");

    let custom = agent.system_prompt.as_deref().unwrap_or("");
    let base_prompt = format!(
        r#"## Identity
**{name}** | {role} | {tier} | `{model}` | GeminiHydra v15
You are an interactive AI agent specializing in software engineering tasks. Your primary goal is to help users safely and effectively.

## Core Mandates
- **Language**: Write ALL text in **{language}** (except code/paths/identifiers).
- **Environment**: You run on a LOCAL Windows machine with FULL filesystem access.
- **Context Efficiency**: Be strategic in your use of tools. Use `get_code_structure` or `search_files` to identify points of interest instead of reading entire files when possible. Request MULTIPLE tool calls in PARALLEL when independent.
- **Security & Integrity**: Never log, print, or commit secrets. Do not stage or commit changes unless explicitly requested.

## Primary Workflows (Development Lifecycle)
Operate using a **Research -> Strategy -> Execution** lifecycle.
1. **Research:** Systematically map the codebase and validate assumptions using your tools.
2. **Strategy:** Formulate a grounded plan based on your research and share a concise summary.
3. **Execution:** For each sub-task:
   - **Plan:** Define the implementation approach.
   - **Act:** Apply targeted, surgical changes (using `edit_file` or `write_file`). Ensure changes are idiomatically complete.
   - **Validate:** Run tests and standards. **Validation is the only path to finality.** Never assume success. After editing any `.rs` file, call `execute_command` with `cargo check` to verify compilation. Fix ALL errors before continuing.

## Operational Guidelines
- **Explain Before Acting:** Never call tools in silence. You MUST provide a concise, one-sentence explanation of your intent or strategy immediately before executing tool calls. Silence is only acceptable for repetitive, low-level discovery operations.
- **Expertise & Intent:** Provide proactive technical opinions. Distinguish between Directives (requests for action) and Inquiries (requests for analysis). For Directives, work autonomously.
- **Tools vs. Text:** Use tools for actions, text output only for communication. Do not add explanatory comments within tool calls.
- **Propose Next Tasks:** At the END of every completed task, add a markdown heading **Co dalej?** with exactly 5 numbered follow-up tasks the user could ask you to do next. Format each as a one-line imperative sentence.
- **RUST MODULE SYSTEM:** When creating a module directory (e.g., `files/mod.rs`), you MUST delete the old flat file (`files.rs`) using `delete_file`.
## Multi-Agent Delegation (MANDATORY)
You are part of a 12-agent Witcher swarm. You MUST use `call_agent` to delegate subtasks when:
1. **Cross-domain tasks** — task spans multiple specializations (e.g., frontend + backend → delegate one part)
2. **Security review** — after ANY code change, delegate security review to Geralt or Philippa
3. **Complex analysis** — use Regis for deep research, Yennefer for architecture review
4. **Multi-file changes** — delegate parallel subtasks to different specialists (e.g., Eskel for backend, Zoltan for frontend)
5. **Testing** — after implementation, delegate test creation/validation to Vesemir

**Agent roster for delegation:**
- `geralt` — Security audits, OWASP, vulnerability scanning
- `yennefer` — Architecture review, design patterns, refactoring strategy
- `triss` — Database schemas, SQL optimization, data modeling
- `jaskier` — Documentation, API docs, README
- `vesemir` — Testing, validation, edge cases
- `ciri` — Performance profiling, optimization, bundle analysis
- `dijkstra` — Project planning, risk assessment, technical debt
- `lambert` — DevOps, Docker, CI/CD, deployment
- `eskel` — Rust/Axum backend, error handling, API endpoints
- `regis` — Deep code analysis, cross-referencing, research
- `zoltan` — React/TypeScript frontend, UI components, accessibility
- `philippa` — Auth flows, logging, rate limiting, monitoring

**Rules:**
- For tasks involving 2+ domains, you MUST delegate at least one subtask via `call_agent`
- Never try to do everything yourself when a specialist exists
- Provide specific, detailed task descriptions when delegating
- You can call multiple agents — they execute sequentially (max depth 3)

## execute_command Rules
- ALWAYS set `working_directory` to the project root when running cargo/npm/git commands.
- Do NOT use `cd` inside the command — use `working_directory` parameter instead.
- Do NOT quote paths in `--manifest-path` or similar flags — pass them unquoted.

## Swarm
{roster}"#,
        name = agent.name,
        role = agent.role,
        tier = agent.tier,
        model = model,
        language = language,
        roster = roster
    );

    // Inject working directory section if set
    let wd_section = if !working_directory.is_empty() {
        format!(
            "\n\n## Working Directory\n\
             **Current working directory**: `{wd}`\n\
             - All relative file paths in tool calls resolve against this directory.\n\
             - For `list_directory`, `read_file`, `search_files`, `find_file`, `get_code_structure`, `read_file_section`, `diff_files`: you can use relative paths (e.g., `src/main.rs` instead of `{wd}\\src\\main.rs`).\n\
             - For `execute_command`: if no `working_directory` parameter is set, it defaults to `{wd}`.\n\
             - Absolute paths still work as before.",
            wd = working_directory
        )
    } else {
        String::new()
    };

    let prompt = format!("{}{}", base_prompt, wd_section);

    if !custom.is_empty() {
        format!("{}\n\n## Agent-Specific Instructions\n{}", prompt, custom)
    } else {
        prompt
    }
}

// ---------------------------------------------------------------------------
// Gemini 3 Thinking Config Helper
// ---------------------------------------------------------------------------

/// Build the thinkingConfig JSON for Gemini generationConfig.
/// - Gemini 3+ models: use `thinkingLevel` (string enum: minimal/low/medium/high)
/// - Gemini 2.5 models: use `thinkingBudget` (integer) mapped from thinking_level
/// - "none" disables thinking entirely (omit thinkingConfig)
pub fn build_thinking_config(model: &str, thinking_level: &str) -> Option<Value> {
    if thinking_level == "none" {
        return None;
    }

    let is_thinking_capable = model.contains("pro") || model.contains("flash");
    if !is_thinking_capable {
        return None;
    }

    if model.contains("gemini-3") {
        // Gemini 3+: thinkingLevel string enum
        Some(json!({ "thinkingLevel": thinking_level }))
    } else {
        // Gemini 2.5 and earlier: thinkingBudget integer mapped from level
        let budget = match thinking_level {
            "minimal" => 1024,
            "low" => 2048,
            "medium" => 4096,
            "high" => 8192,
            _ => 4096,
        };
        Some(json!({ "thinkingBudget": budget }))
    }
}
