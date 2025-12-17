// EduFlow 全局状态管理
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { emitAppUpdated, emitProcessingProgress } from '../services/tauriEventBus'

// 题目类型
export type QuestionType = 'choice' | 'fill' | 'calculation' | 'short_answer' | 'proof'

// 题目结构
export interface Question {
  id: string
  type: QuestionType
  content: string
  options?: string[]      // 选择题选项
  answer: string
  analysis?: string       // 解析
  sourceKnowledgeIds: string[]  // 来源知识点ID
  difficulty: 1 | 2 | 3   // 难度：1简单 2中等 3困难
  isFavorite: boolean
  createdAt: number
}

// 题目会话（每次运行生成的一批题目）
export interface QuestionSession {
  id: string
  questions: Question[]
  selectedKnowledgeIds: string[]
  createdAt: number
}

// 知识点类型
export type KnowledgeType = 'concept' | 'theorem' | 'example' | 'exercise' | 'other'

// 知识点结构
export interface KnowledgePoint {
  id: string
  title: string     // 简短标题（用于树形展示和上下文传递）
  content: string   // 完整内容
  type: KnowledgeType  // 类型
  level: number     // 层级深度
  parentId?: string
  children: string[]
  enabled: boolean  // 是否启用
  selected: boolean // 是否被选中（用于题目生成）
  refPath: string[] // 分级参考路径（用于后续增量对齐）
  detailContent?: string // 详细讲解内容（懒加载）
  // 习题特有字段
  hasAnswer: boolean      // 是否已有答案
  answer?: string         // 答案内容
  questionNumber?: string // 题号（用于答案匹配）
  createdAt: number
}

// 学习上下文 - 用于增量学习处理（每次只传一页但维护整体记忆）
export interface LearningContext {
  // 当前在知识树的位置（如 ["第一章", "1.2节"]）
  currentPath: string[]

  // 最近提取的知识点摘要（用于上下文传递，限制数量避免 token 过多）
  recentKnowledge: Array<{
    id: string
    title: string
    type: KnowledgeType
  }>

  // 待处理队列
  pending: {
    // 不完整的片段（如半道题，页末被截断的内容）
    fragment: string | null
    // 等待答案的习题（题号 -> 知识点ID）
    exercisesAwaitingAnswer: Array<{
      id: string
      questionNumber: string
      title: string
    }>
    // 等待匹配题目的答案（先读到答案，题目还没出现）
    answersAwaitingQuestion: Array<{
      questionNumber: string
      answer: string
    }>
  }

  // 文档类型（首次检测后记录）
  documentType: 'exercises' | 'textbook' | 'paper' | 'general' | null

  // 当前区域类型（目录/正文/习题/答案/附录）
  currentRegion: 'toc' | 'content' | 'exercises' | 'answers' | 'appendix' | null
}

// 应用(文件)结构
export interface AppItem {
  id: string
  name: string
  icon: string  // 图标颜色或图片路径
  sourceFile: string  // 原始文件路径
  fileType: string  // txt/pdf/png/md等
  knowledgePoints: KnowledgePoint[]
  processedCount: number  // 累计知识点数
  totalEstimate: number  // 用于图标蓝条展示：本批目标数
  status: 'pending' | 'processing' | 'done'
  // 增量处理状态（单位：PDF=页；图片=张/半张；文本=1）
  contentCursor: number // 已消耗的单位数
  contentTotal: number // 单位总数（未知则为 0）
  hasMore: boolean
  // 本批识别进度
  batchIndex: number
  batchTarget: number
  batchProducedCount: number
  // 处理缓存（用于"读一页→缓存→不够再读一页"的循环）
  cacheText: string
  // 学习上下文（增量学习记忆）
  learningContext: LearningContext
  // 题目会话
  questionSessions: QuestionSession[]
  currentSessionId?: string
  createdAt: number
  updatedAt: number
}

// 设置
export interface Settings {
  apiKey: string
  ocrModel: 'deepseek-ocr' | 'qwen-vl'
  textModel: 'deepseek-v3' | 'deepseek-r1'
  deepThinking: boolean
  batchKnowledgeCount: number
  initialKnowledgeCount: number
  // 处理线程数（单次/双次 API 调用）
  processingThreads: 1 | 2
  // 题目相关设置
  questionTypes: QuestionType[]
  questionCountPerType: number
  defaultShowAnswer: boolean
  defaultDifficulty: 1 | 2 | 3
}

interface AppState {
  // 设置
  settings: Settings
  setSettings: (settings: Partial<Settings>) => void

  // 侧边栏
  sidebarOpen: boolean
  toggleSidebar: () => void

  // 应用列表
  apps: AppItem[]
  addApp: (app: AppItem) => void
  updateApp: (id: string, updates: Partial<AppItem>, emitSync?: boolean) => void
  removeApp: (id: string) => void
  mergeApps: (ids: string[], newName: string) => void
  // 批量更新（原子操作）
  batchUpdateApps: (updates: Array<{ id: string; updates: Partial<AppItem> }>) => void
  // 从其他窗口同步状态
  syncAppFromEvent: (appId: string, updates: Partial<AppItem>) => void

  // 当前打开的应用
  activeAppId: string | null
  setActiveApp: (id: string | null) => void

  // 知识点选择
  toggleKnowledgeSelect: (appId: string, kpId: string, cascadeToChildren?: boolean) => void
  selectAllKnowledge: (appId: string, selected: boolean) => void
  updateKnowledgeDetail: (appId: string, kpId: string, detailContent: string) => void

  // 题目管理
  addQuestionSession: (appId: string, session: QuestionSession) => void
  toggleQuestionFavorite: (appId: string, sessionId: string, questionId: string) => void
}

// 默认图标颜色
const defaultColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

// 获取所有后代节点ID
function getDescendantIds(kpId: string, knowledgePoints: KnowledgePoint[]): string[] {
  const kp = knowledgePoints.find(k => k.id === kpId)
  if (!kp || kp.children.length === 0) return []

  const descendants: string[] = [...kp.children]
  kp.children.forEach(childId => {
    descendants.push(...getDescendantIds(childId, knowledgePoints))
  })
  return descendants
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // 设置
      settings: {
        apiKey: '',
        ocrModel: 'deepseek-ocr',
        textModel: 'deepseek-v3',
        deepThinking: false,
        batchKnowledgeCount: 10,
        initialKnowledgeCount: 10,
        processingThreads: 1,
        // 题目默认设置
        questionTypes: ['choice', 'fill'],
        questionCountPerType: 3,
        defaultShowAnswer: false,
        defaultDifficulty: 2,
      },
      setSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings }
      })),

      // 侧边栏
      sidebarOpen: false,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      // 应用列表
      apps: [],
      addApp: (app) => set((state) => ({
        apps: [...state.apps, {
          ...app,
          questionSessions: app.questionSessions || [],
          learningContext: app.learningContext || {
            currentPath: [],
            recentKnowledge: [],
            pending: {
              fragment: null,
              exercisesAwaitingAnswer: [],
              answersAwaitingQuestion: [],
            },
            documentType: null,
            currentRegion: null,
          },
          knowledgePoints: app.knowledgePoints.map(kp => ({
            ...kp,
            title: kp.title ?? kp.content.substring(0, 50),
            type: kp.type ?? 'other',
            selected: kp.selected ?? false,
            hasAnswer: kp.hasAnswer ?? true,
            detailContent: kp.detailContent ?? undefined
          }))
        }]
      })),
      updateApp: (id, updates, emitSync = true) => {
        set((state) => ({
          apps: state.apps.map(app => app.id === id ? { ...app, ...updates } : app)
        }))
        // 发送跨窗口同步事件（默认启用）
        if (emitSync) {
          void emitAppUpdated(id, updates)
          // 如果有进度更新，额外发送进度事件
          if (updates.contentCursor !== undefined && updates.contentTotal !== undefined) {
            void emitProcessingProgress(id, updates.contentCursor, updates.contentTotal)
          }
        }
      },
      // 批量更新（原子操作，避免多次渲染）
      batchUpdateApps: (updates) => set((state) => ({
        apps: state.apps.map(app => {
          const update = updates.find(u => u.id === app.id)
          return update ? { ...app, ...update.updates } : app
        })
      })),
      // 从其他窗口同步状态（不触发事件，避免循环）
      syncAppFromEvent: (appId, updates) => set((state) => ({
        apps: state.apps.map(app => app.id === appId ? { ...app, ...updates } : app)
      })),
      removeApp: (id) => set((state) => ({
        apps: state.apps.filter(app => app.id !== id)
      })),
      mergeApps: (ids, newName) => set((state) => {
        const appsToMerge = state.apps.filter(app => ids.includes(app.id))
        if (appsToMerge.length < 2) return state

        // 合并知识点
        const mergedKnowledge: KnowledgePoint[] = []
        appsToMerge.forEach(app => {
          app.knowledgePoints.forEach(kp => {
            mergedKnowledge.push({
              ...kp,
              id: `${app.id}_${kp.id}`, // 避免ID冲突
              selected: false,
            })
          })
        })

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

        const newApp: AppItem = {
          id: Date.now().toString(),
          name: newName,
          icon: defaultColors[Math.floor(Math.random() * defaultColors.length)],
          sourceFile: appsToMerge.map(a => a.sourceFile).join(', '),
          fileType: 'merged',
          knowledgePoints: mergedKnowledge,
          processedCount: mergedKnowledge.length,
          totalEstimate: mergedKnowledge.length,
          status: 'done',
          contentCursor: 0,
          contentTotal: 0,
          hasMore: false,
          batchIndex: 0,
          batchTarget: mergedKnowledge.length,
          batchProducedCount: 0,
          cacheText: '',
          learningContext: defaultLearningContext,
          questionSessions: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }

        return {
          apps: [...state.apps.filter(app => !ids.includes(app.id)), newApp]
        }
      }),

      // 当前应用
      activeAppId: null,
      setActiveApp: (id) => set({ activeAppId: id }),

      // 知识点选择（支持级联）
      toggleKnowledgeSelect: (appId, kpId, cascadeToChildren = true) => set((state) => {
        const app = state.apps.find(a => a.id === appId)
        if (!app) return state

        const kp = app.knowledgePoints.find(k => k.id === kpId)
        if (!kp) return state

        const newSelected = !kp.selected
        const idsToUpdate = [kpId]

        // 如果级联，获取所有后代
        if (cascadeToChildren) {
          idsToUpdate.push(...getDescendantIds(kpId, app.knowledgePoints))
        }

        return {
          apps: state.apps.map(a => {
            if (a.id !== appId) return a
            return {
              ...a,
              knowledgePoints: a.knowledgePoints.map(k =>
                idsToUpdate.includes(k.id) ? { ...k, selected: newSelected } : k
              ),
              updatedAt: Date.now()
            }
          })
        }
      }),

      // 全选/全不选知识点
      selectAllKnowledge: (appId, selected) => set((state) => ({
        apps: state.apps.map(app => {
          if (app.id !== appId) return app
          return {
            ...app,
            knowledgePoints: app.knowledgePoints.map(kp => ({ ...kp, selected })),
            updatedAt: Date.now()
          }
        })
      })),

      // 更新知识点详细内容
      updateKnowledgeDetail: (appId, kpId, detailContent) => set((state) => ({
        apps: state.apps.map(app => {
          if (app.id !== appId) return app
          return {
            ...app,
            knowledgePoints: app.knowledgePoints.map(kp =>
              kp.id === kpId ? { ...kp, detailContent } : kp
            ),
            updatedAt: Date.now()
          }
        })
      })),

      // 添加题目会话
      addQuestionSession: (appId, session) => set((state) => ({
        apps: state.apps.map(app => {
          if (app.id !== appId) return app
          return {
            ...app,
            questionSessions: [...app.questionSessions, session],
            currentSessionId: session.id,
            updatedAt: Date.now()
          }
        })
      })),

      // 切换题目收藏状态
      toggleQuestionFavorite: (appId, sessionId, questionId) => set((state) => ({
        apps: state.apps.map(app => {
          if (app.id !== appId) return app
          return {
            ...app,
            questionSessions: app.questionSessions.map(session => {
              if (session.id !== sessionId) return session
              return {
                ...session,
                questions: session.questions.map(q =>
                  q.id === questionId ? { ...q, isFavorite: !q.isFavorite } : q
                )
              }
            }),
            updatedAt: Date.now()
          }
        })
      })),
    }),
    {
      name: 'eduflow-storage',
      partialize: (state) => ({
        settings: state.settings,
        apps: state.apps,
      }),
      // 合并旧数据和新默认值，确保兼容性
      merge: (persistedState: any, currentState) => {
        const defaultSettings: Settings = {
          apiKey: '',
          ocrModel: 'deepseek-ocr',
          textModel: 'deepseek-v3',
          deepThinking: false,
          batchKnowledgeCount: 10,
          initialKnowledgeCount: 10,
          processingThreads: 1,
          questionTypes: ['choice', 'fill'],
          questionCountPerType: 3,
          defaultShowAnswer: false,
          defaultDifficulty: 2,
        }

        // 合并 settings，确保所有字段都有值
        const mergedSettings = {
          ...defaultSettings,
          ...(persistedState?.settings || {}),
        }
        // 确保 questionTypes 是数组
        if (!Array.isArray(mergedSettings.questionTypes)) {
          mergedSettings.questionTypes = ['choice', 'fill']
        }

        return {
          ...currentState,
          ...persistedState,
          settings: mergedSettings,
        }
      },
    }
  )
)
