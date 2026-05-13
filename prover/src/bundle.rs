//! Proof bundle: the JSON artifact handed off to the frontend / submission script.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct ProofBundle {
    pub round_id: u64,
    pub tlsn_presentation: String, // base64
    pub ultrahonk_proof: String,   // base64
    pub public_inputs: PublicInputs,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PublicInputs {
    pub threshold_encoded: String,
    pub period_start: String,
    pub period_end: String,
    pub user_wallet: String,
    pub uid_binding_hash: String,
    pub disclosed_commitment: String,
}

pub fn write(bundle: &ProofBundle, path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(bundle)?;
    std::fs::write(path, json)?;
    Ok(())
}
