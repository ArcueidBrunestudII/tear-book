export type SiliconFlowRole = 'system' | 'user' | 'assistant'

type TextPart = { type: 'text'; text: string }
type ImagePart = { type: 'image_url'; image_url: { url: string } }
export type MultiModalContent = Array<TextPart | ImagePart>

export interface SiliconFlowMessage {
  role: SiliconFlowRole
  content: string | MultiModalContent
}

// 错误类型枚举
export enum ApiErrorType {
  AUTH_ERROR = 'AUTH_ERROR',           // 401/403 - 不重试
  RATE_LIMIT = 'RATE_LIMIT',           // 429 - 等待后重试
  TIMEOUT = 'TIMEOUT',                 // 超时 - 立即重试
  NETWORK = 'NETWORK',                 // 网络错误 - 重试
  SERVER_ERROR = 'SERVER_ERROR',       // 5xx - 重试
  INVALID_RESPONSE = 'INVALID_RESPONSE', // 响应格式错误 - 重试
  UNKNOWN = 'UNKNOWN',                 // 未知错误
}

// 结构化错误
export class ApiError extends Error {
  constructor(
    public type: ApiErrorType,
    public statusCode: number | null,
    message: string,
    public retryable: boolean = false
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

const BASE_URL = 'https://api.siliconflow.cn/v1/chat/completions'

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any).__TAURI_INTERNALS__)
}

// 判断错误是否可重试
function classifyError(error: unknown, statusCode?: number): ApiError {
  if (error instanceof ApiError) return error

  const message = error instanceof Error ? error.message : String(error)

  // HTTP 状态码分类
  if (statusCode) {
    if (statusCode === 401 || statusCode === 403) {
      return new ApiError(ApiErrorType.AUTH_ERROR, statusCode, 'API Key 无效或已过期', false)
    }
    if (statusCode === 429) {
      return new ApiError(ApiErrorType.RATE_LIMIT, statusCode, 'API 请求过于频繁，请稍后重试', true)
    }
    if (statusCode >= 500) {
      return new ApiError(ApiErrorType.SERVER_ERROR, statusCode, `服务器错误 (${statusCode})`, true)
    }
  }

  // 网络/超时错误
  if (message.includes('abort') || message.includes('timeout') || message.includes('Timeout')) {
    return new ApiError(ApiErrorType.TIMEOUT, null, '请求超时，请重试', true)
  }
  if (message.includes('network') || message.includes('Network') || message.includes('fetch')) {
    return new ApiError(ApiErrorType.NETWORK, null, '网络连接失败，请检查网络', true)
  }

  return new ApiError(ApiErrorType.UNKNOWN, null, message, true)
}

// 延迟函数
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// 指数退避重试
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
  onRetry?: (error: ApiError, attempt: number) => void
): Promise<T> {
  let lastError: ApiError | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof ApiError ? error : classifyError(error)

      // 不可重试的错误直接抛出
      if (!lastError.retryable) {
        throw lastError
      }

      // 最后一次尝试失败
      if (attempt === maxRetries) {
        throw lastError
      }

      // 计算延迟时间（指数退避 + 抖动）
      const delayMs = baseDelay * Math.pow(2, attempt) + Math.random() * 500

      // 429 错误等待更长时间
      const actualDelay = lastError.type === ApiErrorType.RATE_LIMIT ? delayMs * 2 : delayMs

      console.warn(`API 调用失败 (${lastError.type})，${actualDelay}ms 后重试 (${attempt + 1}/${maxRetries})`)
      onRetry?.(lastError, attempt + 1)

      await delay(actualDelay)
    }
  }

  throw lastError || new ApiError(ApiErrorType.UNKNOWN, null, '未知错误', false)
}

// 核心 API 调用（单次，不重试）
async function siliconflowChatOnce(params: {
  apiKey: string
  model: string
  messages: SiliconFlowMessage[]
  maxTokens: number
  timeoutMs: number
}): Promise<string> {
  const { apiKey, model, messages, maxTokens, timeoutMs } = params

  // 优先使用 Tauri invoke
  if (isTauriRuntime()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const raw = await invoke<string>('siliconflow_chat', {
        api_key: apiKey,
        model,
        messages,
        max_tokens: maxTokens,
        timeout_ms: timeoutMs,
      })

      const json = JSON.parse(raw)
      const content = json?.choices?.[0]?.message?.content
      if (typeof content !== 'string') {
        throw new ApiError(ApiErrorType.INVALID_RESPONSE, null, 'API 返回格式异常', true)
      }
      return content
    } catch (error) {
      // 如果是 invoke 本身失败（不是 API 错误），回退到 fetch
      if (error instanceof ApiError) throw error
      const errMsg = error instanceof Error ? error.message : String(error)
      // 检查是否是 Tauri 环境问题
      if (errMsg.includes('invoke') || errMsg.includes('__TAURI__')) {
        console.warn('Tauri invoke 失败，回退到 fetch:', errMsg)
        // 继续使用 fetch
      } else {
        // 是 API 返回的错误，转换并抛出
        throw classifyError(error)
      }
    }
  }

  // Fetch 方式调用
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const resp = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    })

    const json = await resp.json().catch(() => null)

    if (!resp.ok) {
      const msg = json?.message || json?.error?.message || `HTTP ${resp.status}`
      throw classifyError(new Error(msg), resp.status)
    }

    const content = json?.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      throw new ApiError(ApiErrorType.INVALID_RESPONSE, null, 'API 返回格式异常', true)
    }

    return content
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw classifyError(error)
  } finally {
    clearTimeout(timeout)
  }
}

// 主导出函数（带重试）
export async function siliconflowChat(params: {
  apiKey: string
  model: string
  messages: SiliconFlowMessage[]
  maxTokens?: number
  timeoutMs?: number
  maxRetries?: number
  onRetry?: (error: ApiError, attempt: number) => void
}): Promise<string> {
  const {
    apiKey,
    model,
    messages,
    maxTokens = 4000,
    timeoutMs = 120000,
    maxRetries = 3,
    onRetry
  } = params

  // 输入验证
  if (!apiKey || apiKey.trim().length === 0) {
    throw new ApiError(ApiErrorType.AUTH_ERROR, null, '请先配置 API Key', false)
  }

  return retryWithBackoff(
    () => siliconflowChatOnce({ apiKey, model, messages, maxTokens, timeoutMs }),
    maxRetries,
    1000,
    onRetry
  )
}

export const MODEL_IDS = {
  text: {
    v3: 'deepseek-ai/DeepSeek-V3',
    r1: 'deepseek-ai/DeepSeek-R1',
  },
  vision: {
    ocr: 'deepseek-ai/DeepSeek-OCR',
    qwenVl: 'Qwen/Qwen2.5-VL-72B-Instruct',
  },
} as const
