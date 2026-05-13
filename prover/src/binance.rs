//! Binance Futures Testnet response parsing + auth helpers.

use anyhow::{anyhow, Context, Result};
use serde::Deserialize;

/// A single Binance Futures trade record from /fapi/v1/userTrades.
#[derive(Debug, Clone, Deserialize)]
pub struct UserTrade {
    pub symbol: String,
    pub id: u64,
    pub side: String,
    pub price: String,
    pub qty: String,
    #[serde(rename = "realizedPnl")]
    pub realized_pnl: String,
    pub time: u64,
}

/// Account info response shape (only the field we need).
#[derive(Debug, Deserialize)]
struct AccountInfo {
    #[serde(rename = "accountAlias")]
    _account_alias: Option<String>,
    #[serde(rename = "uid")]
    uid: Option<u64>,
    // Some testnet responses use "tradeGroupId" or "accountId" — try both
    #[serde(rename = "accountId")]
    account_id: Option<u64>,
}

/// Parse the raw HTTP response body from /fapi/v1/userTrades.
pub fn parse_user_trades(body: &[u8]) -> Result<Vec<UserTrade>> {
    let s = std::str::from_utf8(body).context("response is not valid UTF-8")?;
    let trades: Vec<UserTrade> =
        serde_json::from_str(s).context("response is not a JSON array of trades")?;
    Ok(trades)
}

/// Convert Binance decimal string ("12.34567890") to i64 × 1e8.
pub fn decimal_to_fixed_i64(s: &str) -> Result<i64> {
    let neg = s.starts_with('-');
    let s = s.trim_start_matches('-');

    let (int_part, frac_part) = match s.split_once('.') {
        Some((i, f)) => (i, f),
        None => (s, ""),
    };

    let int_val: i64 = int_part.parse().context("invalid integer part")?;
    let mut frac_padded = frac_part.to_string();
    frac_padded.truncate(8);
    while frac_padded.len() < 8 {
        frac_padded.push('0');
    }
    let frac_val: i64 = frac_padded.parse().context("invalid fractional part")?;

    let result = int_val * 100_000_000 + frac_val;
    Ok(if neg { -result } else { result })
}

/// Fetch the Binance Futures Testnet account UID using an authenticated request.
///
/// This is a regular HTTPS call (NOT through MPC-TLS) used to bind the user's
/// cookie/API session to a stable UID. The UID is then included in the proof
/// as a private input + bound to the wallet.
///
/// Endpoint: GET /fapi/v2/account on testnet.binancefuture.com
/// Auth: cookie header (browser session) or HMAC-signed request (API key)
pub async fn fetch_uid_from_session(cookie: &str) -> Result<u64> {
    let client = reqwest::Client::builder()
        .use_rustls_tls()
        .timeout(std::time::Duration::from_secs(15))
        .build()?;

    let res = client
        .get("https://testnet.binancefuture.com/fapi/v2/account")
        .header("Cookie", cookie)
        .header("User-Agent", "Mozilla/5.0 (VerifyTrade-Prover)")
        .send()
        .await
        .context("HTTP request to Binance failed")?;

    if !res.status().is_success() {
        return Err(anyhow!(
            "Binance returned {}: re-login at testnet.binancefuture.com and re-copy cookie",
            res.status()
        ));
    }

    let bytes = res.bytes().await?;
    let info: AccountInfo = serde_json::from_slice(&bytes)
        .with_context(|| {
            format!(
                "couldn't parse account info; raw body (first 200 bytes): {:?}",
                &bytes[..bytes.len().min(200)]
            )
        })?;

    info.uid
        .or(info.account_id)
        .ok_or_else(|| anyhow!("response had neither `uid` nor `accountId` field"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decimal_parses() {
        assert_eq!(decimal_to_fixed_i64("12.34567890").unwrap(), 1_234_567_890);
        assert_eq!(decimal_to_fixed_i64("0").unwrap(), 0);
        assert_eq!(decimal_to_fixed_i64("-0.5").unwrap(), -50_000_000);
        assert_eq!(decimal_to_fixed_i64("1000").unwrap(), 100_000_000_000);
        assert_eq!(decimal_to_fixed_i64("-1234.5678").unwrap(), -123_456_780_000);
    }

    #[test]
    fn parses_user_trades_json() {
        let sample = r#"[
            {"symbol":"BTCUSDT","id":1,"side":"BUY","price":"60000","qty":"0.5","realizedPnl":"0","time":1717250000000},
            {"symbol":"BTCUSDT","id":2,"side":"SELL","price":"62000","qty":"0.5","realizedPnl":"1000.50000000","time":1717350000000}
        ]"#;
        let trades = parse_user_trades(sample.as_bytes()).unwrap();
        assert_eq!(trades.len(), 2);
        assert_eq!(trades[1].realized_pnl, "1000.50000000");
        assert_eq!(decimal_to_fixed_i64(&trades[1].realized_pnl).unwrap(), 100_050_000_000);
    }
}
