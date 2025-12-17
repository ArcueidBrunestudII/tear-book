// EduFlow Tauri 后端
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use thiserror::Error;

// 结构化错误类型
#[derive(Error, Debug, Serialize)]
#[serde(tag = "type", content = "details")]
pub enum ApiError {
    #[error("验证错误: {message}")]
    ValidationError { message: String },

    #[error("网络错误: {message}")]
    NetworkError { message: String },

    #[error("请求超时")]
    Timeout,

    #[error("认证失败: {message}")]
    AuthError { message: String, status: u16 },

    #[error("API错误: {message}")]
    ApiError { message: String, status: u16 },

    #[error("服务器错误: {message}")]
    ServerError { message: String, status: u16 },

    #[error("解析错误: {message}")]
    ParseError { message: String },
}

// 实现 Into<String> 用于 Tauri 命令错误
impl From<ApiError> for String {
    fn from(err: ApiError) -> Self {
        // 返回 JSON 格式的错误，前端可以解析
        serde_json::to_string(&err).unwrap_or_else(|_| err.to_string())
    }
}

#[derive(Debug, Deserialize)]
struct SiliconflowChatArgs {
    api_key: String,
    model: String,
    messages: serde_json::Value,
    max_tokens: Option<u32>,
    timeout_ms: Option<u64>,
}

// 验证请求参数
fn validate_args(args: &SiliconflowChatArgs) -> Result<(), ApiError> {
    if args.api_key.trim().is_empty() {
        return Err(ApiError::ValidationError {
            message: "API Key 不能为空".to_string(),
        });
    }

    if args.model.trim().is_empty() {
        return Err(ApiError::ValidationError {
            message: "模型名称不能为空".to_string(),
        });
    }

    if !args.messages.is_array() {
        return Err(ApiError::ValidationError {
            message: "messages 必须是数组".to_string(),
        });
    }

    let messages_arr = args.messages.as_array().unwrap();
    if messages_arr.is_empty() {
        return Err(ApiError::ValidationError {
            message: "messages 不能为空".to_string(),
        });
    }

    // 验证 max_tokens 范围
    if let Some(max_tokens) = args.max_tokens {
        if max_tokens == 0 || max_tokens > 128000 {
            return Err(ApiError::ValidationError {
                message: format!("max_tokens 必须在 1-128000 之间，当前值: {}", max_tokens),
            });
        }
    }

    Ok(())
}

// 根据 HTTP 状态码分类错误
fn classify_http_error(status: u16, body: &str) -> ApiError {
    // 尝试解析错误消息
    let message = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|v| {
            v.get("error")
                .and_then(|e| e.get("message"))
                .or_else(|| v.get("message"))
                .and_then(|m| m.as_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| format!("HTTP {}", status));

    match status {
        401 | 403 => ApiError::AuthError { message, status },
        429 => ApiError::ApiError {
            message: "请求过于频繁，请稍后重试".to_string(),
            status,
        },
        400..=499 => ApiError::ApiError { message, status },
        500..=599 => ApiError::ServerError { message, status },
        _ => ApiError::ApiError { message, status },
    }
}

#[tauri::command]
async fn siliconflow_chat(args: SiliconflowChatArgs) -> Result<String, String> {
    // 验证参数
    validate_args(&args).map_err(|e| String::from(e))?;

    let timeout_ms = args.timeout_ms.unwrap_or(120_000);
    let model = args.model.clone();

    info!(
        "API 请求: model={}, messages_count={}, max_tokens={:?}",
        model,
        args.messages.as_array().map(|a| a.len()).unwrap_or(0),
        args.max_tokens
    );

    // 构建 HTTP 客户端
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(timeout_ms))
        .build()
        .map_err(|e| {
            let err = ApiError::NetworkError {
                message: format!("创建 HTTP 客户端失败: {}", e),
            };
            error!("{}", err);
            String::from(err)
        })?;

    // 构建请求体
    let mut body = serde_json::json!({
        "model": args.model,
        "messages": args.messages,
        "stream": false,
    });
    if let Some(max_tokens) = args.max_tokens {
        body["max_tokens"] = serde_json::json!(max_tokens);
    }

    // 发送请求
    let resp = client
        .post("https://api.siliconflow.cn/v1/chat/completions")
        .bearer_auth(&args.api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            let err = if e.is_timeout() {
                ApiError::Timeout
            } else if e.is_connect() {
                ApiError::NetworkError {
                    message: "无法连接到 API 服务器".to_string(),
                }
            } else {
                ApiError::NetworkError {
                    message: format!("网络请求失败: {}", e),
                }
            };
            error!("{}", err);
            String::from(err)
        })?;

    let status = resp.status().as_u16();
    let text = resp.text().await.map_err(|e| {
        let err = ApiError::ParseError {
            message: format!("读取响应失败: {}", e),
        };
        error!("{}", err);
        String::from(err)
    })?;

    // 检查 HTTP 状态
    if status < 200 || status >= 300 {
        let err = classify_http_error(status, &text);
        warn!("API 返回错误: status={}, body={}", status, &text[..text.len().min(500)]);
        return Err(err.into());
    }

    info!("API 请求成功: model={}, response_len={}", model, text.len());
    Ok(text)
}

fn main() {
    // 初始化日志（仅在调试模式下输出到控制台）
    #[cfg(debug_assertions)]
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp_millis()
        .init();

    info!("EduFlow 启动中...");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![siliconflow_chat])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
