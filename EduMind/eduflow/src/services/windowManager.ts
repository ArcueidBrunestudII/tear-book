// 窗口管理服务 - 管理应用窗口的创建和关闭
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'

interface AppWindowOptions {
  appId: string
  appName: string
}

// 已打开的应用窗口缓存
const openWindows = new Map<string, WebviewWindow>()

// 检测是否在 Tauri 环境
function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * 打开应用的前后两个窗口
 * - 后面板窗口：知识点树 + 运行按钮
 * - 前面板窗口：题目显示
 */
export async function openAppWindow(options: AppWindowOptions): Promise<void> {
  const { appId, appName } = options

  // 非 Tauri 环境，使用路由导航（只打开后面板）
  if (!isTauriRuntime()) {
    window.location.href = `/app/${appId}/back`
    return
  }

  // 打开后面板窗口
  await openPanelWindow({
    appId,
    appName,
    panel: 'back',
    title: `${appName} - 后面板`,
    x: 100,
    y: 100,
    width: 500,
    height: 700
  })

  // 打开前面板窗口（在后面板右侧）
  await openPanelWindow({
    appId,
    appName,
    panel: 'front',
    title: `${appName} - 前面板`,
    x: 620,
    y: 100,
    width: 600,
    height: 700
  })
}

interface PanelWindowOptions {
  appId: string
  appName: string
  panel: 'front' | 'back'
  title: string
  x: number
  y: number
  width: number
  height: number
}

async function openPanelWindow(options: PanelWindowOptions): Promise<WebviewWindow | null> {
  const { appId, panel, title, x, y, width, height } = options
  const windowLabel = `app-${appId}-${panel}`
  const cacheKey = `${appId}-${panel}`

  // 如果窗口已存在，聚焦并返回
  const existing = openWindows.get(cacheKey)
  if (existing) {
    try {
      await existing.setFocus()
      return existing
    } catch {
      openWindows.delete(cacheKey)
    }
  }

  // 检查是否有同 label 的窗口
  const existingByLabel = await WebviewWindow.getByLabel(windowLabel)
  if (existingByLabel) {
    await existingByLabel.setFocus()
    openWindows.set(cacheKey, existingByLabel)
    return existingByLabel
  }

  // 创建新窗口
  const appWindow = new WebviewWindow(windowLabel, {
    url: `/app/${appId}/${panel}`,
    title,
    width,
    height,
    x,
    y,
    minWidth: 400,
    minHeight: 500,
    decorations: true,
    resizable: true,
    visible: true,
  })

  // 监听窗口创建成功
  appWindow.once('tauri://created', () => {
    console.log(`Window ${windowLabel} created`)
  })

  // 监听窗口创建错误
  appWindow.once('tauri://error', (e) => {
    console.error(`Failed to create window ${windowLabel}:`, e)
    openWindows.delete(cacheKey)
  })

  // 监听窗口关闭
  appWindow.once('tauri://close-requested', () => {
    openWindows.delete(cacheKey)
  })

  openWindows.set(cacheKey, appWindow)
  return appWindow
}

/**
 * 关闭应用的所有窗口
 */
export async function closeAppWindow(appId: string): Promise<void> {
  for (const panel of ['front', 'back']) {
    const cacheKey = `${appId}-${panel}`
    const win = openWindows.get(cacheKey)
    if (win) {
      try {
        await win.close()
      } catch (e) {
        console.warn(`Failed to close window for app ${appId} ${panel}:`, e)
      }
      openWindows.delete(cacheKey)
    }
  }
}

/**
 * 获取应用窗口
 */
export function getAppWindow(appId: string, panel: 'front' | 'back'): WebviewWindow | undefined {
  return openWindows.get(`${appId}-${panel}`)
}

/**
 * 检查应用窗口是否已打开
 */
export function isAppWindowOpen(appId: string): boolean {
  return openWindows.has(`${appId}-front`) || openWindows.has(`${appId}-back`)
}

// 窗口缓存健康检查间隔（30秒）
const HEALTH_CHECK_INTERVAL = 30000
let healthCheckTimer: ReturnType<typeof setInterval> | null = null

/**
 * 启动窗口缓存健康检查
 * 定期检查缓存的窗口是否仍然有效，清理无效引用
 */
export function startWindowHealthCheck(): void {
  if (healthCheckTimer) return // 已启动

  healthCheckTimer = setInterval(async () => {
    const keysToDelete: string[] = []

    for (const [key, win] of openWindows) {
      try {
        // 尝试检查窗口是否仍然可见/有效
        await win.isVisible()
      } catch {
        // 窗口已无效，标记删除
        console.log(`[窗口健康检查] 清理无效窗口: ${key}`)
        keysToDelete.push(key)
      }
    }

    // 清理无效窗口引用
    keysToDelete.forEach(key => openWindows.delete(key))

    if (keysToDelete.length > 0) {
      console.log(`[窗口健康检查] 已清理 ${keysToDelete.length} 个无效窗口引用`)
    }
  }, HEALTH_CHECK_INTERVAL)
}

/**
 * 停止窗口缓存健康检查
 */
export function stopWindowHealthCheck(): void {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer)
    healthCheckTimer = null
  }
}

/**
 * 清理所有窗口缓存
 */
export function clearWindowCache(): void {
  openWindows.clear()
}

/**
 * 获取当前打开的窗口数量
 */
export function getOpenWindowCount(): number {
  return openWindows.size
}

// 自动启动健康检查（如果在 Tauri 环境中）
if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
  startWindowHealthCheck()
}
