use std::collections::HashMap;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE};
use reqwest::{Client, Method};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchRequest {
    pub url: String,
    #[serde(default = "default_method")]
    pub method: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub base64_body: Option<String>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
}

fn default_method() -> String {
    "GET".into()
}

#[tauri::command]
pub async fn fetch(_app: AppHandle, req: FetchRequest) -> Result<FetchResponse, String> {
    let client = Client::builder().build().map_err(|e| e.to_string())?;

    let method = req
        .method
        .parse::<Method>()
        .map_err(|_| format!("invalid method: {}", req.method))?;

    let mut headers = HeaderMap::new();
    for (k, v) in req.headers.iter() {
        let name = HeaderName::from_bytes(k.as_bytes())
            .map_err(|_| format!("invalid header name: {}", k))?;
        let value =
            HeaderValue::from_str(v).map_err(|_| format!("invalid header value for {}", k))?;
        headers.insert(name, value);
    }

    let mut request = client.request(method, &req.url).headers(headers.clone());

    if let Some(timeout) = req.timeout_ms {
        request = request.timeout(std::time::Duration::from_millis(timeout));
    }

    if let Some(b64) = req.base64_body {
        let bytes = STANDARD
            .decode(b64)
            .map_err(|_| "invalid base64 body".to_string())?;
        request = request.body(bytes);
    } else if let Some(body) = req.body {
        request = request.body(body);
    }

    let resp = request.send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();

    let mut resp_headers = HashMap::new();
    for (name, value) in resp.headers().iter() {
        resp_headers.insert(name.to_string(), value.to_str().unwrap_or("").to_string());
    }

    let is_text = resp
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|ct| ct.starts_with("text/") || ct.contains("json"))
        .unwrap_or(false);

    let body_bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    let body = if is_text {
        String::from_utf8_lossy(&body_bytes).to_string()
    } else {
        STANDARD.encode(body_bytes)
    };

    Ok(FetchResponse {
        status,
        headers: resp_headers,
        body,
    })
}
