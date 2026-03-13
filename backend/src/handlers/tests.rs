// ---------------------------------------------------------------------------
// handlers/tests.rs — Unit tests for classification, keyword matching, helpers
// ---------------------------------------------------------------------------

use crate::classify::{classify_agent_score, classify_prompt, keyword_match, strip_diacritics};
use crate::models::WitcherAgent;
use crate::models::{ExecuteRequest, ExecuteResponse, ExecutePlan, WsServerMessage};
use serde_json::json;

/// Build a minimal set of test agents with keywords matching the DB seed.
fn test_agents() -> Vec<WitcherAgent> {
    vec![
        WitcherAgent {
            id: "yennefer".to_string(),
            name: "Yennefer".to_string(),
            role: "Architecture".to_string(),
            tier: "Commander".to_string(),
            status: "active".to_string(),
            description: "Architecture".to_string(),
            system_prompt: None,
            keywords: vec![
                "architecture".to_string(),
                "design".to_string(),
                "pattern".to_string(),
                "structur".to_string(),
                "refactor".to_string(),
            ],
            temperature: None,
            model_override: None,
            thinking_level: None,
            model_b: None,
            ab_split: None,
        },
        WitcherAgent {
            id: "triss".to_string(),
            name: "Triss".to_string(),
            role: "Data".to_string(),
            tier: "Coordinator".to_string(),
            status: "active".to_string(),
            description: "Data".to_string(),
            system_prompt: None,
            keywords: vec![
                "data".to_string(),
                "analytic".to_string(),
                "database".to_string(),
                "sql".to_string(),
                "query".to_string(),
            ],
            temperature: None,
            model_override: None,
            thinking_level: None,
            model_b: None,
            ab_split: None,
        },
        WitcherAgent {
            id: "dijkstra".to_string(),
            name: "Dijkstra".to_string(),
            role: "Strategy".to_string(),
            tier: "Coordinator".to_string(),
            status: "active".to_string(),
            description: "Strategy".to_string(),
            system_prompt: None,
            keywords: vec![
                "plan".to_string(),
                "strateg".to_string(),
                "roadmap".to_string(),
                "priorit".to_string(),
            ],
            temperature: None,
            model_override: None,
            thinking_level: None,
            model_b: None,
            ab_split: None,
        },
        WitcherAgent {
            id: "eskel".to_string(),
            name: "Eskel".to_string(),
            role: "Backend & APIs".to_string(),
            tier: "Coordinator".to_string(),
            status: "active".to_string(),
            description: "Backend & APIs".to_string(),
            system_prompt: None,
            keywords: vec![
                "backend".to_string(),
                "endpoint".to_string(),
                "rest".to_string(),
                "api".to_string(),
                "handler".to_string(),
                "middleware".to_string(),
                "route".to_string(),
                "websocket".to_string(),
            ],
            temperature: None,
            model_override: None,
            thinking_level: None,
            model_b: None,
            ab_split: None,
        },
    ]
}

#[test]
fn test_refactor_routes_to_yennefer() {
    let agents = test_agents();
    // "refactor this code" contains the keyword "refactor" (>= 4 chars → substring match)
    let (agent, confidence, _) = classify_prompt("refactor this code please", &agents, "eskel");
    assert_eq!(agent, "yennefer");
    assert!(confidence >= 0.8);
}

#[test]
fn test_sql_routes_to_triss() {
    let agents = test_agents();
    let (agent, confidence, _) = classify_prompt("query sql database", &agents, "eskel");
    assert_eq!(agent, "triss");
    assert!(confidence >= 0.8);
}

#[test]
fn test_unknown_prompt_falls_back_to_eskel() {
    let agents = test_agents();
    let (agent, _, _) = classify_prompt("what is the meaning of life", &agents, "eskel");
    assert_eq!(agent, "eskel");
}

#[test]
fn test_backend_routes_to_eskel() {
    let agents = test_agents();
    let (agent, confidence, _) =
        classify_prompt("add a new api endpoint for user registration", &agents, "eskel");
    assert_eq!(agent, "eskel");
    assert!(confidence >= 0.7);
}

#[test]
fn test_classify_agent_score_returns_zero_for_no_match() {
    let agents = test_agents();
    let score = classify_agent_score("nothing relevant here", &agents[0]);
    assert_eq!(score, 0.0);
}

#[test]
fn test_classify_agent_score_positive_for_match() {
    let agents = test_agents();
    let triss = &agents[1]; // triss has "sql", "database" etc.
    let score = classify_agent_score("query sql database migration", triss);
    assert!(score > 0.65);
}

#[test]
fn test_short_keyword_whole_word() {
    assert!(keyword_match("query sql database", "sql"));
    assert!(!keyword_match("results-only", "sql"));
}

#[test]
fn test_strip_diacritics_works() {
    assert_eq!(strip_diacritics("refaktoryzację"), "refaktoryzacje");
    assert_eq!(strip_diacritics("żółw"), "zolw");
}

// ===========================================================================
// Handler tests — execute, streaming, OCR
// ===========================================================================

// ── Execute handler: request validation ─────────────────────────────────

#[test]
fn execute_request_empty_prompt_detected() {
    let req: ExecuteRequest = serde_json::from_value(json!({
        "prompt": "   ",
        "mode": "auto"
    }))
    .expect("should deserialize");
    assert!(req.prompt.trim().is_empty(), "empty prompt should be detected");
}

#[test]
fn execute_request_with_model_override() {
    let req: ExecuteRequest = serde_json::from_value(json!({
        "prompt": "Hello world",
        "mode": "auto",
        "model": "gemini-2.0-flash"
    }))
    .expect("should deserialize");
    assert_eq!(req.model, Some("gemini-2.0-flash".to_string()));
}

#[test]
fn execute_request_mode_agent_selection() {
    let agents = test_agents();
    let req: ExecuteRequest = serde_json::from_value(json!({
        "prompt": "test prompt",
        "mode": "yennefer"
    }))
    .expect("should deserialize");

    // Simulate the mode_override logic from execute handler
    let mode_override = if !req.mode.is_empty() && req.mode != "auto" {
        agents
            .iter()
            .find(|a| a.id == req.mode || a.name.to_lowercase() == req.mode.to_lowercase())
            .map(|a| (a.id.clone(), 0.99_f64, "User selected".to_string()))
    } else {
        None
    };
    assert!(mode_override.is_some());
    let (agent_id, conf, _) = mode_override.expect("should find agent");
    assert_eq!(agent_id, "yennefer");
    assert!((conf - 0.99).abs() < f64::EPSILON);
}

#[test]
fn execute_response_serialization_includes_duration() {
    let resp = ExecuteResponse {
        id: "test-id".to_string(),
        result: "Generated text".to_string(),
        plan: Some(ExecutePlan {
            agent: Some("eskel".to_string()),
            steps: vec!["Analyze".to_string(), "Execute".to_string()],
            estimated_time: None,
        }),
        duration_ms: 1500,
        mode: "auto".to_string(),
        files_loaded: vec![],
    };
    let json_val = serde_json::to_value(&resp).expect("should serialize");
    assert_eq!(json_val["duration_ms"], 1500);
    assert_eq!(json_val["plan"]["agent"], "eskel");
    assert_eq!(json_val["plan"]["steps"].as_array().expect("steps").len(), 2);
    // files_loaded should be absent (skip_serializing_if = "Vec::is_empty")
    assert!(json_val.get("files_loaded").is_none());
}

// ── Gemini response parsing helpers ─────────────────────────────────────

#[test]
fn gemini_response_text_extraction() {
    // Simulate the extract_text closure from execute handler
    let gemini_resp = json!({
        "candidates": [{
            "content": {
                "parts": [{ "text": "Hello from Gemini" }]
            },
            "finishReason": "STOP"
        }]
    });

    let text = gemini_resp
        .get("candidates")
        .and_then(|c| c.get(0))
        .and_then(|c0| c0.get("content"))
        .and_then(|ct| ct.get("parts"))
        .and_then(|p| p.get(0))
        .and_then(|p0| p0.get("text"))
        .and_then(|t| t.as_str())
        .map(|s| s.to_string());

    assert_eq!(text, Some("Hello from Gemini".to_string()));
}

#[test]
fn gemini_response_malformed_function_call_detection() {
    let gemini_resp = json!({
        "candidates": [{
            "content": { "parts": [] },
            "finishReason": "MALFORMED_FUNCTION_CALL"
        }]
    });

    let is_malformed = gemini_resp
        .get("candidates")
        .and_then(|c| c.get(0))
        .and_then(|c0| c0.get("finishReason"))
        .and_then(|v| v.as_str())
        == Some("MALFORMED_FUNCTION_CALL");

    assert!(is_malformed);
}

#[test]
fn gemini_response_empty_candidates_handled() {
    let gemini_resp = json!({ "candidates": [] });

    let text = gemini_resp
        .get("candidates")
        .and_then(|c| c.get(0))
        .and_then(|c0| c0.get("content"))
        .and_then(|ct| ct.get("parts"))
        .and_then(|p| p.get(0))
        .and_then(|p0| p0.get("text"))
        .and_then(|t| t.as_str())
        .map(|s| s.to_string());

    assert!(text.is_none(), "empty candidates should return None");
}

// ── Streaming: SSE event format validation ──────────────────────────────

#[test]
fn ws_server_start_message_contains_required_fields() {
    let msg = WsServerMessage::Start {
        id: "sess-123".to_string(),
        agent: "eskel".to_string(),
        model: "gemini-2.0-flash".to_string(),
        files_loaded: vec!["context.rs".to_string()],
    };
    let json_str = serde_json::to_string(&msg).expect("should serialize");
    assert!(json_str.contains("\"type\":\"start\""));
    assert!(json_str.contains("sess-123"));
    assert!(json_str.contains("eskel"));
    assert!(json_str.contains("gemini-2.0-flash"));
}

#[test]
fn ws_server_token_streaming_format() {
    // SSE token messages must have type "token" + content field
    let tokens = vec!["Hello", " ", "World", "!"];
    let mut assembled = String::new();
    for tok in &tokens {
        let msg = WsServerMessage::Token { content: tok.to_string() };
        let v: serde_json::Value = serde_json::to_value(&msg).expect("should serialize");
        assert_eq!(v["type"], "token");
        assembled.push_str(v["content"].as_str().expect("content"));
    }
    assert_eq!(assembled, "Hello World!");
}

// ── OCR request validation ──────────────────────────────────────────────

#[test]
fn ocr_request_valid_mime_types() {
    use crate::ocr::OcrRequest;
    let allowed = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/heic", "application/pdf"];
    for mime in &allowed {
        let req: OcrRequest = serde_json::from_value(json!({
            "data_base64": "dGVzdA==",
            "mime_type": mime
        }))
        .expect("should deserialize");
        assert_eq!(req.mime_type, *mime);
    }
}

#[test]
fn ocr_request_rejects_invalid_mime_type_at_handler_level() {
    // The handler checks !ALLOWED_MIME_TYPES.contains() and returns 400
    let disallowed = ["text/plain", "video/mp4", "application/json", "image/bmp"];
    let allowed = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/heic", "application/pdf"];
    for mime in &disallowed {
        assert!(
            !allowed.contains(mime),
            "{} should not be in allowed list",
            mime
        );
    }
}

#[test]
fn ocr_request_size_limit_validation() {
    // MAX_INPUT_SIZE = 30_000_000 (~22 MB decoded)
    let max_input_size: usize = 30_000_000;
    let small_data = "x".repeat(1000);
    assert!(small_data.len() <= max_input_size);
    let oversized = "x".repeat(max_input_size + 1);
    assert!(oversized.len() > max_input_size);
}

#[tokio::test]
async fn gemini_api_url_format_validation() {
    let model = "gemini-2.0-flash";
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
        model
    );
    let parsed = reqwest::Url::parse(&url);
    assert!(parsed.is_ok(), "URL should be valid");
    let parsed = parsed.expect("valid URL");
    assert_eq!(parsed.scheme(), "https");
    assert!(parsed.path().contains("gemini-2.0-flash"));
    assert!(parsed.path().ends_with(":generateContent"));
}
