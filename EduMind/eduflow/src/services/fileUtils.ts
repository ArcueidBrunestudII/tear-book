export function extToMime(ext: string): string {
  const e = ext.toLowerCase()
  if (e === 'png') return 'image/png'
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg'
  if (e === 'webp') return 'image/webp'
  return 'application/octet-stream'
}

export function uint8ToBase64(bytes: Uint8Array): string {
  // 使用更高效的分块处理
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  return uint8ToBase64(new Uint8Array(buffer))
}

export async function fileToText(file: File): Promise<string> {
  return await file.text()
}

// JSON 解析结果
export interface JsonParseResult {
  success: boolean
  data: any
  rawText?: string
  parseMethod?: string
  error?: string
}

// 清理 JSON 字符串中的常见问题
function sanitizeJsonString(str: string): string {
  return str
    // 移除 BOM
    .replace(/^\uFEFF/, '')
    // 移除控制字符（除了换行和制表符）
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // 修复常见的转义问题
    .replace(/\\'/g, "'")
    // 移除尾部逗号（在 } 或 ] 之前的逗号）
    .replace(/,(\s*[}\]])/g, '$1')
}

// 尝试修复截断的 JSON
function tryFixTruncatedJson(str: string): string {
  let fixed = str.trim()

  // 计算括号平衡
  let braceCount = 0
  let bracketCount = 0
  let inString = false
  let escapeNext = false

  for (const char of fixed) {
    if (escapeNext) {
      escapeNext = false
      continue
    }
    if (char === '\\') {
      escapeNext = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    if (char === '{') braceCount++
    else if (char === '}') braceCount--
    else if (char === '[') bracketCount++
    else if (char === ']') bracketCount--
  }

  // 如果在字符串中，先关闭字符串
  if (inString) {
    fixed += '"'
  }

  // 补齐缺失的括号
  while (bracketCount > 0) {
    fixed += ']'
    bracketCount--
  }
  while (braceCount > 0) {
    fixed += '}'
    braceCount--
  }

  return fixed
}

// 从文本中提取多个 JSON 对象
function extractJsonObjects(text: string): string[] {
  const results: string[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escapeNext = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (escapeNext) {
      escapeNext = false
      continue
    }
    if (char === '\\') {
      escapeNext = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    if (char === '{') {
      if (depth === 0) start = i
      depth++
    } else if (char === '}') {
      depth--
      if (depth === 0 && start !== -1) {
        results.push(text.slice(start, i + 1))
        start = -1
      }
    }
  }

  return results
}

// 增强的 JSON 解析函数
export function tryParseJsonObject(text: string): any | null {
  if (!text || typeof text !== 'string') return null

  const trimmed = text.trim()
  if (!trimmed) return null

  // 方法1：直接解析
  try {
    const direct = JSON.parse(trimmed)
    if (typeof direct === 'object' && direct !== null) {
      return direct
    }
  } catch {}

  // 方法2：去除 markdown 代码块
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fencedMatch) {
    try {
      const parsed = JSON.parse(fencedMatch[1].trim())
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed
      }
    } catch {}
  }

  // 方法3：提取 { } 之间的内容
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    const slice = trimmed.slice(start, end + 1)

    // 尝试直接解析
    try {
      return JSON.parse(slice)
    } catch {}

    // 尝试清理后解析
    try {
      const sanitized = sanitizeJsonString(slice)
      return JSON.parse(sanitized)
    } catch {}

    // 尝试修复截断后解析
    try {
      const fixed = tryFixTruncatedJson(sanitized(slice))
      return JSON.parse(fixed)
    } catch {}
  }

  // 方法4：尝试提取数组格式
  const arrayStart = trimmed.indexOf('[')
  const arrayEnd = trimmed.lastIndexOf(']')
  if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
    const arraySlice = trimmed.slice(arrayStart, arrayEnd + 1)
    try {
      const arr = JSON.parse(arraySlice)
      if (Array.isArray(arr)) {
        return { items: arr }
      }
    } catch {}
  }

  // 方法5：提取所有 JSON 对象并返回第一个有效的
  const objects = extractJsonObjects(trimmed)
  for (const obj of objects) {
    try {
      const parsed = JSON.parse(obj)
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed
      }
    } catch {}
  }

  // 所有方法都失败
  console.warn('JSON 解析失败，原始文本前 500 字符:', trimmed.substring(0, 500))
  return null
}

// 辅助函数：内部使用
function sanitized(str: string): string {
  return sanitizeJsonString(str)
}

// 带详细结果的 JSON 解析
export function tryParseJsonWithDetails(text: string): JsonParseResult {
  if (!text || typeof text !== 'string') {
    return { success: false, data: null, error: '输入为空' }
  }

  const trimmed = text.trim()
  if (!trimmed) {
    return { success: false, data: null, error: '输入为空字符串' }
  }

  // 直接解析
  try {
    const direct = JSON.parse(trimmed)
    return { success: true, data: direct, parseMethod: 'direct' }
  } catch {}

  // 代码块提取
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fencedMatch) {
    try {
      const parsed = JSON.parse(fencedMatch[1].trim())
      return { success: true, data: parsed, parseMethod: 'fenced_block' }
    } catch {}
  }

  // 提取对象
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    const slice = trimmed.slice(start, end + 1)

    try {
      const parsed = JSON.parse(slice)
      return { success: true, data: parsed, parseMethod: 'extracted' }
    } catch {}

    try {
      const sanitized = sanitizeJsonString(slice)
      const parsed = JSON.parse(sanitized)
      return { success: true, data: parsed, parseMethod: 'sanitized' }
    } catch {}

    try {
      const fixed = tryFixTruncatedJson(sanitizeJsonString(slice))
      const parsed = JSON.parse(fixed)
      return { success: true, data: parsed, parseMethod: 'fixed_truncated' }
    } catch {}
  }

  return {
    success: false,
    data: null,
    rawText: trimmed.substring(0, 1000),
    error: 'JSON 解析失败，所有方法都未能成功'
  }
}

// 题号规范化函数
const chineseNumbers: Record<string, number> = {
  '零': 0, '一': 1, '二': 2, '三': 3, '四': 4,
  '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
  '十': 10, '十一': 11, '十二': 12, '十三': 13, '十四': 14,
  '十五': 15, '十六': 16, '十七': 17, '十八': 18, '十九': 19,
  '二十': 20
}

export function normalizeQuestionNumber(qn: string): string {
  if (!qn) return ''

  let normalized = qn.trim()

  // 移除常见标点和括号
  normalized = normalized
    .replace(/[\.、．。）\)（\(【】\[\]]/g, '')
    .replace(/^第/, '')
    .replace(/题$/, '')
    .replace(/小题$/, '')
    .trim()

  // 转换中文数字
  for (const [cn, num] of Object.entries(chineseNumbers)) {
    if (normalized === cn) {
      return String(num)
    }
  }

  // 处理复合中文数字（如"二十一"）
  if (/^[零一二三四五六七八九十]+$/.test(normalized)) {
    let result = 0
    if (normalized.includes('十')) {
      const parts = normalized.split('十')
      const tens = parts[0] ? (chineseNumbers[parts[0]] || 1) : 1
      const ones = parts[1] ? (chineseNumbers[parts[1]] || 0) : 0
      result = tens * 10 + ones
    } else if (chineseNumbers[normalized] !== undefined) {
      result = chineseNumbers[normalized]
    }
    if (result > 0) return String(result)
  }

  // 提取数字部分
  const numMatch = normalized.match(/\d+/)
  if (numMatch) {
    return numMatch[0]
  }

  return normalized
}

// 比较两个题号是否匹配
export function questionNumbersMatch(qn1: string, qn2: string): boolean {
  const n1 = normalizeQuestionNumber(qn1)
  const n2 = normalizeQuestionNumber(qn2)
  return n1 === n2 && n1.length > 0
}
