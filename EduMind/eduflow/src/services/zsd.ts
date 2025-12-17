import type { AppItem, QuestionSession, LearningContext } from '../stores/appStore'

// 默认学习上下文
const defaultLearningContext: LearningContext = {
  currentPath: [],
  recentKnowledge: [],
  pending: {
    fragment: null,
    exercisesAwaitingAnswer: [],
    answersAwaitingQuestion: [],
  },
  documentType: null,
  currentRegion: null,
}

export interface ZsdFileV1 {
  version: 1
  createdAt: number
  app: AppItem
}

export interface ZsdFileV2 {
  version: 2
  createdAt: number
  app: AppItem
}

// V3: 撕书机制 - 存储原始内容，按需处理
export interface ZsdFileV3 {
  version: 3
  createdAt: number
  // 原始内容：文本直接存，PDF/图片存 base64
  rawContent: string
  // 原始文件类型
  originalFileType: 'txt' | 'md' | 'pdf' | 'png' | 'jpg' | 'jpeg'
  // 原始文件名
  originalFileName: string
  // 已处理的偏移量（文本=字符数，PDF=页数，图片=0或1）
  processedOffset: number
  // 总量（文本=字符数，PDF=页数，图片=1）
  totalSize: number
  // 应用数据
  app: AppItem
}

export type ZsdFile = ZsdFileV1 | ZsdFileV2 | ZsdFileV3

// V2 序列化（兼容旧逻辑）
export function serializeAppToZsd(app: AppItem): string {
  const payload: ZsdFileV2 = {
    version: 2,
    createdAt: Date.now(),
    app,
  }
  return JSON.stringify(payload, null, 2)
}

// V3 序列化（撕书机制）
export function serializeToZsdV3(
  rawContent: string,
  originalFileType: ZsdFileV3['originalFileType'],
  originalFileName: string,
  totalSize: number,
  processedOffset: number,
  app: AppItem
): string {
  const payload: ZsdFileV3 = {
    version: 3,
    createdAt: Date.now(),
    rawContent,
    originalFileType,
    originalFileName,
    processedOffset,
    totalSize,
    app,
  }
  return JSON.stringify(payload, null, 2)
}

// 创建初始 V3 .zsd（拖入时调用，不处理内容）
export function createInitialZsdV3(
  rawContent: string,
  originalFileType: ZsdFileV3['originalFileType'],
  originalFileName: string,
  totalSize: number
): ZsdFileV3 {
  const now = Date.now()
  return {
    version: 3,
    createdAt: now,
    rawContent,
    originalFileType,
    originalFileName,
    processedOffset: 0,
    totalSize,
    app: {
      id: now.toString() + Math.random().toString(36).substr(2, 9),
      name: originalFileName.replace(/\.[^/.]+$/, ''),
      icon: '#3b82f6',
      sourceFile: '',
      fileType: 'zsd',
      knowledgePoints: [],
      processedCount: 0,
      totalEstimate: 10,
      status: 'pending',
      contentCursor: 0,
      contentTotal: totalSize,
      hasMore: totalSize > 0,
      batchIndex: 0,
      batchTarget: 10,
      batchProducedCount: 0,
      cacheText: '',
      learningContext: { ...defaultLearningContext },
      questionSessions: [],
      createdAt: now,
      updatedAt: now,
    },
  }
}

// 解析完整 V3 数据（包含原始内容）
export function parseZsdV3(text: string): ZsdFileV3 | null {
  try {
    const json = JSON.parse(text)
    if (json.version !== 3) return null
    return json as ZsdFileV3
  } catch {
    return null
  }
}

// 判断是否为 V3 格式
export function isZsdV3(text: string): boolean {
  try {
    const json = JSON.parse(text)
    return json.version === 3
  } catch {
    return false
  }
}

export function parseZsd(text: string): AppItem {
  const json = JSON.parse(text)
  if (!json || !json.app) {
    throw new Error('无效的 .zsd 文件')
  }

  const version = json.version ?? 1
  const app = json.app as Partial<AppItem>
  const now = Date.now()

  // V3 额外字段同步到 app
  if (version === 3) {
    const v3 = json as ZsdFileV3
    app.contentCursor = v3.processedOffset
    app.contentTotal = v3.totalSize
    app.hasMore = v3.processedOffset < v3.totalSize
  }

  // 解析知识点（兼容 v1 和 v2，新增 v3 字段）
  const knowledgePoints = Array.isArray(app.knowledgePoints) ? app.knowledgePoints : []
  const normalizedKps = knowledgePoints.map((kp: any) => ({
    ...kp,
    title: typeof kp.title === 'string' ? kp.title : String(kp.content ?? '').substring(0, 60),
    type: ['concept', 'theorem', 'example', 'exercise', 'other'].includes(kp.type) ? kp.type : 'other',
    enabled: typeof kp.enabled === 'boolean' ? kp.enabled : true,
    selected: typeof kp.selected === 'boolean' ? kp.selected : false,
    hasAnswer: typeof kp.hasAnswer === 'boolean' ? kp.hasAnswer : true,
    answer: typeof kp.answer === 'string' ? kp.answer : undefined,
    questionNumber: typeof kp.questionNumber === 'string' ? kp.questionNumber : undefined,
    detailContent: typeof kp.detailContent === 'string' ? kp.detailContent : undefined,
    refPath: Array.isArray(kp.refPath) ? kp.refPath.map((x: any) => String(x)) : [],
    createdAt: typeof kp.createdAt === 'number' ? kp.createdAt : now,
  }))

  // 解析题目会话（v2 新增）
  const questionSessions: QuestionSession[] = []
  if (version >= 2 && Array.isArray(app.questionSessions)) {
    app.questionSessions.forEach((session: any) => {
      if (session && typeof session.id === 'string' && Array.isArray(session.questions)) {
        questionSessions.push({
          id: session.id,
          questions: session.questions.map((q: any) => ({
            id: String(q.id ?? `q_${Date.now()}_${Math.random().toString(36).slice(2)}`),
            type: q.type ?? 'short_answer',
            content: String(q.content ?? ''),
            options: Array.isArray(q.options) ? q.options.map(String) : undefined,
            answer: String(q.answer ?? ''),
            analysis: typeof q.analysis === 'string' ? q.analysis : undefined,
            difficulty: [1, 2, 3].includes(q.difficulty) ? q.difficulty : 2,
            isFavorite: typeof q.isFavorite === 'boolean' ? q.isFavorite : false,
            createdAt: typeof q.createdAt === 'number' ? q.createdAt : now,
          })),
          selectedKnowledgeIds: Array.isArray(session.selectedKnowledgeIds)
            ? session.selectedKnowledgeIds.map(String)
            : [],
          createdAt: typeof session.createdAt === 'number' ? session.createdAt : now,
        })
      }
    })
  }

  return {
    id: String(app.id ?? now),
    name: String(app.name ?? '未命名'),
    icon: String(app.icon ?? '#3b82f6'),
    sourceFile: String(app.sourceFile ?? ''),
    fileType: String(app.fileType ?? 'zsd'),
    knowledgePoints: normalizedKps,
    processedCount: typeof app.processedCount === 'number' ? app.processedCount : normalizedKps.length,
    totalEstimate: typeof app.totalEstimate === 'number' ? app.totalEstimate : 10,
    status: (app.status as any) ?? 'pending',
    contentCursor: typeof app.contentCursor === 'number' ? app.contentCursor : 0,
    contentTotal: typeof app.contentTotal === 'number' ? app.contentTotal : 0,
    hasMore: typeof app.hasMore === 'boolean' ? app.hasMore : false,
    batchIndex: typeof app.batchIndex === 'number' ? app.batchIndex : 0,
    batchTarget: typeof app.batchTarget === 'number' ? app.batchTarget : 10,
    batchProducedCount: typeof app.batchProducedCount === 'number' ? app.batchProducedCount : 0,
    cacheText: typeof app.cacheText === 'string' ? app.cacheText : '',
    learningContext: app.learningContext ? {
      currentPath: Array.isArray(app.learningContext.currentPath) ? app.learningContext.currentPath : [],
      recentKnowledge: Array.isArray(app.learningContext.recentKnowledge) ? app.learningContext.recentKnowledge : [],
      pending: {
        fragment: app.learningContext.pending?.fragment ?? null,
        exercisesAwaitingAnswer: Array.isArray(app.learningContext.pending?.exercisesAwaitingAnswer)
          ? app.learningContext.pending.exercisesAwaitingAnswer
          : [],
        answersAwaitingQuestion: Array.isArray(app.learningContext.pending?.answersAwaitingQuestion)
          ? app.learningContext.pending.answersAwaitingQuestion
          : [],
      },
      documentType: app.learningContext.documentType ?? null,
      currentRegion: app.learningContext.currentRegion ?? null,
    } : { ...defaultLearningContext },
    questionSessions,
    currentSessionId: typeof app.currentSessionId === 'string' ? app.currentSessionId : undefined,
    createdAt: typeof app.createdAt === 'number' ? app.createdAt : now,
    updatedAt: typeof app.updatedAt === 'number' ? app.updatedAt : now,
  }
}
