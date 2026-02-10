//! GGUF Model Manager
//!
//! Handles discovery, metadata parsing, and management of GGUF model files.

use bytesize::ByteSize;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use thiserror::Error;
use tracing::{debug, info, warn};
use walkdir::WalkDir;

/// GGUF magic number
const GGUF_MAGIC: u32 = 0x46554747; // "GGUF" in little-endian

#[derive(Error, Debug)]
pub enum ModelManagerError {
    #[error("Models directory not found: {0}")]
    DirectoryNotFound(String),
    #[error("Failed to read model file: {0}")]
    FileReadError(String),
    #[error("Invalid GGUF file: {0}")]
    InvalidGGUF(String),
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    #[error("Model not found: {0}")]
    ModelNotFound(String),
}

impl From<ModelManagerError> for String {
    fn from(e: ModelManagerError) -> Self {
        e.to_string()
    }
}

/// Information about a GGUF model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GGUFModelInfo {
    /// Model filename
    pub name: String,
    /// Full path to the model file
    pub path: String,
    /// File size in bytes
    pub size_bytes: u64,
    /// Human-readable file size
    pub size_human: String,
    /// Quantization type (e.g., "Q4_K_M", "Q5_K_S")
    pub quantization: String,
    /// Number of parameters (e.g., "3B", "7B")
    pub parameters: String,
    /// Context length from metadata
    pub context_length: u32,
    /// Model architecture (e.g., "llama", "qwen2")
    pub architecture: String,
    /// GGUF version
    pub gguf_version: u32,
    /// Number of tensors
    pub tensor_count: u64,
    /// Number of metadata key-value pairs
    pub metadata_count: u64,
}

/// Model manager for GGUF files
pub struct ModelManager {
    models_dir: PathBuf,
    cached_models: Vec<GGUFModelInfo>,
}

impl ModelManager {
    /// Create a new model manager with the given models directory
    pub fn new(models_dir: PathBuf) -> Self {
        Self {
            models_dir,
            cached_models: Vec::new(),
        }
    }

    /// Get the models directory path
    #[allow(dead_code)]
    pub fn models_dir(&self) -> &Path {
        &self.models_dir
    }

    /// Ensure the models directory exists
    pub fn ensure_models_dir(&self) -> Result<(), ModelManagerError> {
        if !self.models_dir.exists() {
            info!("Creating models directory: {:?}", self.models_dir);
            fs::create_dir_all(&self.models_dir)?;
        }
        Ok(())
    }

    /// Scan the models directory for GGUF files
    pub fn scan_models(&mut self) -> Result<Vec<GGUFModelInfo>, ModelManagerError> {
        self.ensure_models_dir()?;

        info!("Scanning for GGUF models in {:?}", self.models_dir);
        let mut models = Vec::new();

        for entry in WalkDir::new(&self.models_dir)
            .max_depth(2) // Don't go too deep
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext.to_string_lossy().to_lowercase() == "gguf" {
                        match self.parse_gguf_info(path) {
                            Ok(info) => {
                                debug!("Found model: {} ({})", info.name, info.size_human);
                                models.push(info);
                            }
                            Err(e) => {
                                warn!("Failed to parse GGUF file {:?}: {}", path, e);
                            }
                        }
                    }
                }
            }
        }

        info!("Found {} GGUF models", models.len());
        self.cached_models = models.clone();
        Ok(models)
    }

    /// Get cached models (use scan_models first)
    #[allow(dead_code)]
    pub fn get_cached_models(&self) -> &[GGUFModelInfo] {
        &self.cached_models
    }

    /// Get model info by name or path
    pub fn get_model_info(&self, name_or_path: &str) -> Result<GGUFModelInfo, ModelManagerError> {
        // Check if it's a full path
        let path = if Path::new(name_or_path).is_absolute() {
            PathBuf::from(name_or_path)
        } else {
            self.models_dir.join(name_or_path)
        };

        if !path.exists() {
            return Err(ModelManagerError::ModelNotFound(name_or_path.to_string()));
        }

        self.parse_gguf_info(&path)
    }

    /// Delete a model file
    pub fn delete_model(&self, name_or_path: &str) -> Result<(), ModelManagerError> {
        let path = if Path::new(name_or_path).is_absolute() {
            PathBuf::from(name_or_path)
        } else {
            self.models_dir.join(name_or_path)
        };

        if !path.exists() {
            return Err(ModelManagerError::ModelNotFound(name_or_path.to_string()));
        }

        info!("Deleting model: {:?}", path);
        fs::remove_file(&path)?;
        Ok(())
    }

    /// Parse GGUF file header and extract model information
    fn parse_gguf_info(&self, path: &Path) -> Result<GGUFModelInfo, ModelManagerError> {
        let file = File::open(path)?;
        let metadata = file.metadata()?;
        let size_bytes = metadata.len();

        let mut reader = BufReader::new(file);

        // Read magic number
        let mut magic_buf = [0u8; 4];
        reader.read_exact(&mut magic_buf)?;
        let magic = u32::from_le_bytes(magic_buf);

        if magic != GGUF_MAGIC {
            return Err(ModelManagerError::InvalidGGUF(format!(
                "Invalid magic number: expected {:x}, got {:x}",
                GGUF_MAGIC, magic
            )));
        }

        // Read version
        let mut version_buf = [0u8; 4];
        reader.read_exact(&mut version_buf)?;
        let gguf_version = u32::from_le_bytes(version_buf);

        // Read tensor count
        let mut tensor_count_buf = [0u8; 8];
        reader.read_exact(&mut tensor_count_buf)?;
        let tensor_count = u64::from_le_bytes(tensor_count_buf);

        // Read metadata count
        let mut metadata_count_buf = [0u8; 8];
        reader.read_exact(&mut metadata_count_buf)?;
        let metadata_count = u64::from_le_bytes(metadata_count_buf);

        // Extract info from filename
        let filename = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let (quantization, parameters, architecture) = self.parse_model_name(&filename);

        // Try to read context length from metadata (simplified - real implementation would parse all metadata)
        let context_length = self.estimate_context_length(&filename);

        Ok(GGUFModelInfo {
            name: filename,
            path: path.to_string_lossy().to_string(),
            size_bytes,
            size_human: ByteSize::b(size_bytes).to_string(),
            quantization,
            parameters,
            context_length,
            architecture,
            gguf_version,
            tensor_count,
            metadata_count,
        })
    }

    /// Parse model name to extract quantization, parameters, and architecture
    fn parse_model_name(&self, filename: &str) -> (String, String, String) {
        let lower = filename.to_lowercase();

        // Extract quantization
        let quantization = if lower.contains("q4_k_m") {
            "Q4_K_M"
        } else if lower.contains("q4_k_s") {
            "Q4_K_S"
        } else if lower.contains("q5_k_m") {
            "Q5_K_M"
        } else if lower.contains("q5_k_s") {
            "Q5_K_S"
        } else if lower.contains("q6_k") {
            "Q6_K"
        } else if lower.contains("q8_0") {
            "Q8_0"
        } else if lower.contains("q4_0") {
            "Q4_0"
        } else if lower.contains("f16") {
            "F16"
        } else if lower.contains("f32") {
            "F32"
        } else {
            "Unknown"
        }
        .to_string();

        // Extract parameters
        let parameters = if lower.contains("1.5b") || lower.contains("1_5b") {
            "1.5B"
        } else if lower.contains("3b") {
            "3B"
        } else if lower.contains("7b") {
            "7B"
        } else if lower.contains("8b") {
            "8B"
        } else if lower.contains("13b") {
            "13B"
        } else if lower.contains("14b") {
            "14B"
        } else if lower.contains("32b") {
            "32B"
        } else if lower.contains("70b") {
            "70B"
        } else {
            "Unknown"
        }
        .to_string();

        // Extract architecture
        let architecture = if lower.contains("qwen3") {
            "qwen3"
        } else if lower.contains("llama") {
            "llama"
        } else if lower.contains("qwen") {
            "qwen2"
        } else if lower.contains("deepseek") {
            "deepseek"
        } else if lower.contains("mistral") {
            "mistral"
        } else if lower.contains("phi") {
            "phi"
        } else if lower.contains("gemma") {
            "gemma"
        } else if lower.contains("codellama") {
            "codellama"
        } else {
            "unknown"
        }
        .to_string();

        (quantization, parameters, architecture)
    }

    /// Estimate context length based on model name
    fn estimate_context_length(&self, filename: &str) -> u32 {
        let lower = filename.to_lowercase();

        // Common context lengths based on model family
        if lower.contains("qwen3") {
            // Qwen3: 4B has 256K, 8B/14B/32B have 128K, 0.6B/1.7B have 32K
            if lower.contains("4b") {
                262144
            } else if lower.contains("0.6b") || lower.contains("1.7b") {
                32768
            } else {
                131072 // 8B, 14B, 32B
            }
        } else if lower.contains("llama-3") || lower.contains("llama3") {
            128000
        } else if lower.contains("qwen2.5") || lower.contains("qwen2-5") {
            32768
        } else if lower.contains("qwen2") {
            32768
        } else if lower.contains("deepseek") {
            32768
        } else if lower.contains("mistral") {
            32768
        } else if lower.contains("phi-3") || lower.contains("phi3") {
            128000
        } else if lower.contains("gemma") {
            8192
        } else {
            4096 // Default fallback
        }
    }
}

/// Recommended models for download
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecommendedModel {
    /// Display name
    pub name: String,
    /// HuggingFace repository ID
    pub repo_id: String,
    /// Filename in the repository
    pub filename: String,
    /// Size in GB
    pub size_gb: f32,
    /// Description
    pub description: String,
    /// Minimum VRAM requirement in GB
    pub min_vram_gb: u32,
    /// Category (general, coding, etc.)
    pub category: String,
}

/// Get list of recommended models for download
pub fn get_recommended_models() -> Vec<RecommendedModel> {
    vec![
        RecommendedModel {
            name: "Qwen3 4B".to_string(),
            repo_id: "Qwen/Qwen3-4B-GGUF".to_string(),
            filename: "Qwen3-4B-Q4_K_M.gguf".to_string(),
            size_gb: 2.6,
            description: "Primary workhorse. Thinking mode, 256K context, tool calling. Great for general tasks.".to_string(),
            min_vram_gb: 4,
            category: "general".to_string(),
        },
        RecommendedModel {
            name: "Qwen3 1.7B".to_string(),
            repo_id: "Qwen/Qwen3-1.7B-GGUF".to_string(),
            filename: "Qwen3-1.7B-Q4_K_M.gguf".to_string(),
            size_gb: 1.1,
            description: "Fast lightweight model. 32K context, thinking mode. Low VRAM.".to_string(),
            min_vram_gb: 2,
            category: "general".to_string(),
        },
        RecommendedModel {
            name: "Qwen3 8B".to_string(),
            repo_id: "Qwen/Qwen3-8B-GGUF".to_string(),
            filename: "Qwen3-8B-Q4_K_M.gguf".to_string(),
            size_gb: 5.2,
            description: "High quality model. 128K context, excellent for coding and complex tasks.".to_string(),
            min_vram_gb: 6,
            category: "coding".to_string(),
        },
        RecommendedModel {
            name: "Qwen3 0.6B".to_string(),
            repo_id: "Qwen/Qwen3-0.6B-GGUF".to_string(),
            filename: "Qwen3-0.6B-Q4_K_M.gguf".to_string(),
            size_gb: 0.5,
            description: "Ultra-fast scout model. 32K context. Perfect for simple atomic tasks.".to_string(),
            min_vram_gb: 1,
            category: "general".to_string(),
        },
        RecommendedModel {
            name: "Qwen3 14B".to_string(),
            repo_id: "Qwen/Qwen3-14B-GGUF".to_string(),
            filename: "Qwen3-14B-Q4_K_M.gguf".to_string(),
            size_gb: 9.0,
            description: "Premium quality for complex reasoning and coding. 128K context.".to_string(),
            min_vram_gb: 10,
            category: "coding".to_string(),
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_model_name() {
        let manager = ModelManager::new(PathBuf::from("."));

        let (quant, params, arch) = manager.parse_model_name("Qwen3-4B-Q4_K_M.gguf");
        assert_eq!(quant, "Q4_K_M");
        assert_eq!(params, "4B");
        assert_eq!(arch, "qwen3");

        let (quant, params, arch) = manager.parse_model_name("Qwen3-8B-Q4_K_M.gguf");
        assert_eq!(quant, "Q4_K_M");
        assert_eq!(params, "8B");
        assert_eq!(arch, "qwen3");
    }

    #[test]
    fn test_estimate_context_length() {
        let manager = ModelManager::new(PathBuf::from("."));

        assert_eq!(manager.estimate_context_length("Qwen3-4B-Q4_K_M.gguf"), 262144);
        assert_eq!(manager.estimate_context_length("Qwen3-8B-Q4_K_M.gguf"), 131072);
        assert_eq!(manager.estimate_context_length("unknown-model.gguf"), 4096);
    }

    #[test]
    fn test_recommended_models() {
        let models = get_recommended_models();
        assert!(!models.is_empty());
        assert!(models.iter().any(|m| m.category == "coding"));
        assert!(models.iter().any(|m| m.category == "general"));
    }
}
