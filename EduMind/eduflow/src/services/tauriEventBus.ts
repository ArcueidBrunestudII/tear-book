// Tauri 事件总线 - 用于跨窗口状态同步
import type { AppItem, Settings, KnowledgePoint } from '../stores/appStore'

// 事件类型定义
export enum EventType {
  // 应用状态变化
  APP_UPDATED = 'app:updated',
  APP_ADDED = 'app:added',
  APP_REMOVED = 'app:removed',

  // 设置变化
  SETTINGS_UPDATED = 'settings:updated',

  // 知识点变化
  KNOWLEDGE_UPDATED = 'knowledge:updated',
  KNOWLEDGE_SELECTED = 'knowledge:selected',

  // 处理进度
  PROCESSING_PROGRESS = 'processing:progress',
  PROCESSING_COMPLETE = 'processing:complete',

  // 题目生成
  QUESTIONS_GENERATED = 'questions:generated',
}

// 事件载荷类型
export interface EventPayloads {
  [EventType.APP_UPDATED]: {
    appId: string
    updates: Partial<AppItem>
    timestamp: number
  }
  [EventType.APP_ADDED]: {
    app: AppItem
    timestamp: number
  }
  [EventType.APP_REMOVED]: {
    appId: string
    timestamp: number
  }
  [EventType.SETTINGS_UPDATED]: {
    settings: Partial<Settings>
    timestamp: number
  }
  [EventType.KNOWLEDGE_UPDATED]: {
    appId: string
    kpId: string
    updates: Partial<KnowledgePoint>
    timestamp: number
  }
  [EventType.KNOWLEDGE_SELECTED]: {
    appId: string
    kpIds: string[]
    selected: boolean
    timestamp: number
  }
  [EventType.PROCESSING_PROGRESS]: {
    appId: string
    progress: number
    current: number
    total: number
    timestamp: number
  }
  [EventType.PROCESSING_COMPLETE]: {
    appId: string
    knowledgeCount: number
    timestamp: number
  }
  [EventType.QUESTIONS_GENERATED]: {
    appId: string
    sessionId: string
    questionCount: number
    timestamp: number
  }
}

// 事件监听器类型
type EventListener<T extends EventType> = (payload: EventPayloads[T]) => void

// 事件监听器存储
const listeners = new Map<EventType, Set<EventListener<any>>>()

// 是否在 Tauri 环境中
let isTauriEnv: boolean | null = null

async function checkTauriEnv(): Promise<boolean> {
  if (isTauriEnv !== null) return isTauriEnv
  try {
    await import('@tauri-apps/api/event')
    isTauriEnv = true
  } catch {
    isTauriEnv = false
  }
  return isTauriEnv
}

// 发送事件到其他窗口
export async function emitEvent<T extends EventType>(
  eventType: T,
  payload: Omit<EventPayloads[T], 'timestamp'>
): Promise<void> {
  const fullPayload = { ...payload, timestamp: Date.now() } as EventPayloads[T]

  // 触发本地监听器
  const localListeners = listeners.get(eventType)
  if (localListeners) {
    localListeners.forEach(listener => {
      try {
        listener(fullPayload)
      } catch (e) {
        console.error(`事件监听器错误 [${eventType}]:`, e)
      }
    })
  }

  // 如果在 Tauri 环境中，发送到其他窗口
  if (await checkTauriEnv()) {
    try {
      const { emit } = await import('@tauri-apps/api/event')
      await emit(eventType, fullPayload)
    } catch (e) {
      console.warn('Tauri 事件发送失败:', e)
    }
  }
}

// 监听事件
export function onEvent<T extends EventType>(
  eventType: T,
  listener: EventListener<T>
): () => void {
  if (!listeners.has(eventType)) {
    listeners.set(eventType, new Set())
  }
  listeners.get(eventType)!.add(listener)

  // 返回取消监听函数
  return () => {
    listeners.get(eventType)?.delete(listener)
  }
}

// 监听来自其他窗口的 Tauri 事件
let tauriListenerSetup = false

export async function setupTauriEventListeners(): Promise<() => void> {
  if (tauriListenerSetup) return () => {}
  tauriListenerSetup = true

  if (!(await checkTauriEnv())) {
    return () => {}
  }

  const { listen } = await import('@tauri-apps/api/event')
  const unlisten: Array<() => void> = []

  // 为每种事件类型设置监听器
  const eventTypes = Object.values(EventType)

  for (const eventType of eventTypes) {
    try {
      const unlistenFn = await listen<EventPayloads[typeof eventType]>(eventType, (event) => {
        const localListeners = listeners.get(eventType as EventType)
        if (localListeners) {
          localListeners.forEach(listener => {
            try {
              listener(event.payload)
            } catch (e) {
              console.error(`Tauri 事件监听器错误 [${eventType}]:`, e)
            }
          })
        }
      })
      unlisten.push(unlistenFn)
    } catch (e) {
      console.warn(`无法监听事件 ${eventType}:`, e)
    }
  }

  return () => {
    unlisten.forEach(fn => fn())
    tauriListenerSetup = false
  }
}

// 便捷方法：发送应用更新事件
export function emitAppUpdated(appId: string, updates: Partial<AppItem>): Promise<void> {
  return emitEvent(EventType.APP_UPDATED, { appId, updates })
}

// 便捷方法：发送处理进度事件
export function emitProcessingProgress(
  appId: string,
  current: number,
  total: number
): Promise<void> {
  return emitEvent(EventType.PROCESSING_PROGRESS, {
    appId,
    progress: total > 0 ? (current / total) * 100 : 0,
    current,
    total,
  })
}

// 便捷方法：发送处理完成事件
export function emitProcessingComplete(appId: string, knowledgeCount: number): Promise<void> {
  return emitEvent(EventType.PROCESSING_COMPLETE, { appId, knowledgeCount })
}

// 便捷方法：发送题目生成事件
export function emitQuestionsGenerated(
  appId: string,
  sessionId: string,
  questionCount: number
): Promise<void> {
  return emitEvent(EventType.QUESTIONS_GENERATED, { appId, sessionId, questionCount })
}
