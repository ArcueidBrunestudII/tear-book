// 知识点提取服务
import type { KnowledgePoint, KnowledgeType } from '../stores/appStore'

// 原始 AI 返回的知识点格式
export interface RawKnowledgePoint {
  id?: string
  title?: string
  content: string
  type?: string
  level?: number
  parentId?: string | null
  children?: string[]
  hasAnswer?: boolean
  answer?: string
  questionNumber?: string
}

// AI 提取结果
export interface ExtractionResult {
  knowledgePoints: RawKnowledgePoint[]
  pathChange?: string | null
  fragment?: string | null
  matchedAnswers?: Array<{ questionNumber: string; answer: string }>
  regionType?: string | null
}

// 将原始 AI 返回转换为规范化的知识点
export function toKnowledgePoints(raw: any): KnowledgePoint[] {
  const now = Date.now()
  const list = raw?.knowledgePoints
  if (!Array.isArray(list)) return []

  const mapped = list
    .filter((x: any) => x && typeof x.content === 'string')
    .map((x: any, idx: number) => ({
      id: typeof x.id === 'string' ? x.id : String(idx + 1),
      title: typeof x.title === 'string' ? x.title : String(x.content).substring(0, 60),
      content: String(x.content),
      type: (['concept', 'theorem', 'example', 'exercise', 'other'].includes(x.type) ? x.type : 'other') as KnowledgeType,
      level: Number.isFinite(x.level) ? Number(x.level) : 0,
      parentId: x.parentId === null || typeof x.parentId === 'string' ? x.parentId ?? undefined : undefined,
      children: Array.isArray(x.children) ? x.children.map((c: any) => String(c)) : [],
      enabled: true,
      selected: false,
      refPath: [] as string[],
      // 习题特有字段
      hasAnswer: x.hasAnswer !== false, // 默认为 true，除非明确指定 false
      answer: typeof x.answer === 'string' ? x.answer : undefined,
      questionNumber: typeof x.questionNumber === 'string' ? x.questionNumber : undefined,
      createdAt: now,
    }))

  // 构建引用路径
  const parentById = new Map<string, string | undefined>()
  mapped.forEach((kp) => parentById.set(kp.id, kp.parentId))

  const buildPath = (id: string): string[] => {
    const path: string[] = []
    const seen = new Set<string>()
    let cur: string | undefined = id
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      path.push(cur)
      cur = parentById.get(cur)
    }
    return path.reverse()
  }

  mapped.forEach((kp) => {
    kp.refPath = buildPath(kp.id)
  })

  return mapped
}

// 为批次重映射 ID
export function remapBatchIds(
  batchIndex: number,
  kps: KnowledgePoint[]
): KnowledgePoint[] {
  const idMap = new Map<string, string>()
  kps.forEach((kp) => {
    idMap.set(kp.id, `b${batchIndex}_${kp.id}`)
  })

  const remapped = kps.map((kp) => {
    const id = idMap.get(kp.id) ?? kp.id
    const parentId = kp.parentId ? (idMap.get(kp.parentId) ?? kp.parentId) : undefined
    const children = Array.isArray(kp.children) ? kp.children.map((c) => idMap.get(c) ?? c) : []
    return { ...kp, id, parentId, children }
  })

  // 重新计算 refPath（用新 id）
  const parentById = new Map<string, string | undefined>()
  remapped.forEach((kp) => parentById.set(kp.id, kp.parentId))

  const buildPath = (id: string): string[] => {
    const path: string[] = []
    const seen = new Set<string>()
    let cur: string | undefined = id
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      path.push(cur)
      cur = parentById.get(cur)
    }
    return path.reverse()
  }

  remapped.forEach((kp) => {
    kp.refPath = buildPath(kp.id)
  })

  return remapped
}
