// 跨窗口状态同步 Hook
import { useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import {
  setupTauriEventListeners,
  onEvent,
  EventType,
  type EventPayloads,
} from '../services/tauriEventBus'

/**
 * 设置跨窗口状态同步
 * 在应用根组件中调用此 hook，以启用跨窗口状态同步
 */
export function useCrossWindowSync(): void {
  const syncAppFromEvent = useAppStore((state) => state.syncAppFromEvent)

  useEffect(() => {
    // 设置 Tauri 事件监听器
    let cleanupTauri: (() => void) | null = null
    const cleanupCallbacks: Array<() => void> = []

    const setup = async () => {
      // 设置 Tauri 原生事件监听
      cleanupTauri = await setupTauriEventListeners()

      // 监听应用更新事件
      cleanupCallbacks.push(
        onEvent(EventType.APP_UPDATED, (payload: EventPayloads[EventType.APP_UPDATED]) => {
          console.log(`[跨窗口同步] 收到应用更新: ${payload.appId}`)
          syncAppFromEvent(payload.appId, payload.updates)
        })
      )

      // 监听处理进度事件
      cleanupCallbacks.push(
        onEvent(EventType.PROCESSING_PROGRESS, (payload: EventPayloads[EventType.PROCESSING_PROGRESS]) => {
          console.log(`[跨窗口同步] 处理进度: ${payload.appId} - ${payload.progress.toFixed(1)}%`)
          syncAppFromEvent(payload.appId, {
            contentCursor: payload.current,
            contentTotal: payload.total,
          })
        })
      )

      // 监听处理完成事件
      cleanupCallbacks.push(
        onEvent(EventType.PROCESSING_COMPLETE, (payload: EventPayloads[EventType.PROCESSING_COMPLETE]) => {
          console.log(`[跨窗口同步] 处理完成: ${payload.appId} - ${payload.knowledgeCount} 个知识点`)
          syncAppFromEvent(payload.appId, {
            status: 'done',
            hasMore: false,
          })
        })
      )
    }

    void setup()

    // 清理函数
    return () => {
      cleanupCallbacks.forEach((cleanup) => cleanup())
      if (cleanupTauri) cleanupTauri()
    }
  }, [syncAppFromEvent])
}

/**
 * 获取计算属性（从 knowledgePoints.length 计算 processedCount）
 * 用于替代冗余的 processedCount 字段
 */
export function useComputedKnowledgeCount(appId: string): number {
  return useAppStore((state) => {
    const app = state.apps.find((a) => a.id === appId)
    return app?.knowledgePoints?.length ?? 0
  })
}

/**
 * 获取批次进度百分比
 * 防止进度超过 100%
 */
export function useBatchProgress(appId: string): number {
  return useAppStore((state) => {
    const app = state.apps.find((a) => a.id === appId)
    if (!app || app.batchTarget <= 0) return 0
    return Math.min(100, (app.batchProducedCount / app.batchTarget) * 100)
  })
}

/**
 * 获取内容处理进度百分比
 */
export function useContentProgress(appId: string): number {
  return useAppStore((state) => {
    const app = state.apps.find((a) => a.id === appId)
    if (!app || app.contentTotal <= 0) return 0
    return Math.min(100, (app.contentCursor / app.contentTotal) * 100)
  })
}
