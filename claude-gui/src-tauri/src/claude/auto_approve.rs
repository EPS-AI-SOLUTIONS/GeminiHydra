use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::types::ApprovalType;

/// Approval rule for auto-approve engine
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalRule {
    pub id: String,
    pub name: String,
    pub description: String,
    pub pattern: String,
    pub tool: ToolType,
    pub enabled: bool,
    pub auto_approve: bool,
}

/// Tool type for rule matching
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ToolType {
    Bash,
    Write,
    Edit,
    Read,
    WebFetch,
    McpTool,
    All,
}

/// Auto-approve engine
pub struct AutoApproveEngine {
    rules: Vec<ApprovalRule>,
    compiled_patterns: HashMap<String, Regex>,
    auto_approve_all: bool,
}

impl AutoApproveEngine {
    pub fn new() -> Self {
        let rules = Self::default_rules();
        let mut engine = Self {
            rules: Vec::new(),
            compiled_patterns: HashMap::new(),
            auto_approve_all: false,
        };
        engine.set_rules(rules);
        engine
    }

    /// Default safe rules
    fn default_rules() -> Vec<ApprovalRule> {
        vec![
            // Safe Git commands
            ApprovalRule {
                id: "git-read".to_string(),
                name: "Git Read Commands".to_string(),
                description: "Safe read-only git commands".to_string(),
                pattern: r"^git\s+(status|log|diff|branch|show|remote|tag|stash\s+list)".to_string(),
                tool: ToolType::Bash,
                enabled: true,
                auto_approve: true,
            },
            // NPM/Yarn read commands
            ApprovalRule {
                id: "npm-read".to_string(),
                name: "NPM Read Commands".to_string(),
                description: "Safe npm/yarn info commands".to_string(),
                pattern: r"^(npm|yarn|pnpm)\s+(list|ls|info|view|outdated|audit)".to_string(),
                tool: ToolType::Bash,
                enabled: true,
                auto_approve: true,
            },
            // NPM run scripts
            ApprovalRule {
                id: "npm-scripts".to_string(),
                name: "NPM Run Scripts".to_string(),
                description: "Run npm scripts defined in package.json".to_string(),
                pattern: r"^(npm|yarn|pnpm)\s+run\s+\w+".to_string(),
                tool: ToolType::Bash,
                enabled: true,
                auto_approve: true,
            },
            // NPM install (with caution)
            ApprovalRule {
                id: "npm-install".to_string(),
                name: "NPM Install".to_string(),
                description: "Install dependencies".to_string(),
                pattern: r"^(npm|yarn|pnpm)\s+(install|add|i)\b".to_string(),
                tool: ToolType::Bash,
                enabled: true,
                auto_approve: false, // Manual by default
            },
            // Directory listing
            ApprovalRule {
                id: "dir-list".to_string(),
                name: "Directory Listing".to_string(),
                description: "Safe directory listing commands".to_string(),
                pattern: r"^(ls|dir|tree|pwd|cd)\b".to_string(),
                tool: ToolType::Bash,
                enabled: true,
                auto_approve: true,
            },
            // Cat/type commands (read only)
            ApprovalRule {
                id: "file-read-cmd".to_string(),
                name: "File Read Commands".to_string(),
                description: "Read file content commands".to_string(),
                pattern: r"^(cat|type|head|tail|less|more)\s+".to_string(),
                tool: ToolType::Bash,
                enabled: true,
                auto_approve: true,
            },
            // Cargo commands
            ApprovalRule {
                id: "cargo-safe".to_string(),
                name: "Cargo Safe Commands".to_string(),
                description: "Safe Rust/Cargo commands".to_string(),
                pattern: r"^cargo\s+(check|build|test|clippy|fmt|doc)".to_string(),
                tool: ToolType::Bash,
                enabled: true,
                auto_approve: true,
            },
            // Python safe
            ApprovalRule {
                id: "python-safe".to_string(),
                name: "Python Safe Commands".to_string(),
                description: "Safe Python commands".to_string(),
                pattern: r"^(python|python3|pip)\s+(--version|-V|list|show|freeze)".to_string(),
                tool: ToolType::Bash,
                enabled: true,
                auto_approve: true,
            },
            // File read tool
            ApprovalRule {
                id: "tool-read".to_string(),
                name: "File Read Tool".to_string(),
                description: "Allow reading files".to_string(),
                pattern: r".*".to_string(),
                tool: ToolType::Read,
                enabled: true,
                auto_approve: true,
            },
            // Web fetch (with restrictions)
            ApprovalRule {
                id: "web-docs".to_string(),
                name: "Documentation URLs".to_string(),
                description: "Fetch from documentation sites".to_string(),
                pattern: r"^https?://(docs\.|developer\.|api\.|stackoverflow\.com|github\.com)".to_string(),
                tool: ToolType::WebFetch,
                enabled: true,
                auto_approve: true,
            },
        ]
    }

    pub fn set_rules(&mut self, rules: Vec<ApprovalRule>) {
        self.compiled_patterns.clear();

        for rule in &rules {
            if let Ok(regex) = Regex::new(&rule.pattern) {
                self.compiled_patterns.insert(rule.id.clone(), regex);
            } else {
                tracing::warn!("Failed to compile regex for rule {}: {}", rule.id, rule.pattern);
            }
        }

        self.rules = rules;
    }

    pub fn get_rules(&self) -> &[ApprovalRule] {
        &self.rules
    }

    pub fn set_auto_approve_all(&mut self, enabled: bool) {
        self.auto_approve_all = enabled;
    }

    pub fn is_auto_approve_all(&self) -> bool {
        self.auto_approve_all
    }

    /// Check if an approval type should be auto-approved
    pub fn should_auto_approve(&self, approval_type: &ApprovalType) -> Option<String> {
        if self.auto_approve_all {
            return Some("auto_approve_all".to_string());
        }

        match approval_type {
            ApprovalType::BashCommand { command, .. } => {
                self.match_rules(command, &ToolType::Bash)
            }
            ApprovalType::FileWrite { path } => {
                self.match_rules(path, &ToolType::Write)
            }
            ApprovalType::FileEdit { path, .. } => {
                self.match_rules(path, &ToolType::Edit)
            }
            ApprovalType::FileRead { path } => {
                self.match_rules(path, &ToolType::Read)
            }
            ApprovalType::WebFetch { url } => {
                self.match_rules(url, &ToolType::WebFetch)
            }
            ApprovalType::McpTool { server, tool, .. } => {
                let combined = format!("{}:{}", server, tool);
                self.match_rules(&combined, &ToolType::McpTool)
            }
        }
    }

    fn match_rules(&self, input: &str, tool_type: &ToolType) -> Option<String> {
        for rule in &self.rules {
            if !rule.enabled || !rule.auto_approve {
                continue;
            }

            if rule.tool != *tool_type && rule.tool != ToolType::All {
                continue;
            }

            if let Some(regex) = self.compiled_patterns.get(&rule.id) {
                if regex.is_match(input) {
                    return Some(rule.id.clone());
                }
            }
        }

        None
    }
}

impl Default for AutoApproveEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_git_status_auto_approve() {
        let engine = AutoApproveEngine::new();
        let approval = ApprovalType::BashCommand {
            command: "git status".to_string(),
            description: None,
        };

        assert!(engine.should_auto_approve(&approval).is_some());
    }

    #[test]
    fn test_rm_not_auto_approve() {
        let engine = AutoApproveEngine::new();
        let approval = ApprovalType::BashCommand {
            command: "rm -rf /".to_string(),
            description: None,
        };

        assert!(engine.should_auto_approve(&approval).is_none());
    }
}
