// 主应用入口
import { useEffect } from 'react'
import { SettingsPanel } from './components/SettingsPanel'
import { Canvas } from './components/Canvas'
import { useCrossWindowSync } from './hooks'

function App() {
  // 启用跨窗口状态同步
  useCrossWindowSync()

  // 主窗口关闭时关闭所有子窗口
  useEffect(() => {
    let unlisten: (() => void) | null = null

    ;(async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
        const mainWindow = getCurrentWindow()

        unlisten = await mainWindow.onCloseRequested(async (_event) => {
          // 尝试关闭所有子窗口（但不阻塞主窗口关闭）
          try {
            const allWindows = await WebviewWindow.getAll()
            const childWindows = allWindows.filter(win => win.label !== 'main')

            // 不等待子窗口关闭，直接发送关闭请求
            childWindows.forEach(win => {
              win.close().catch(() => {})
            })
          } catch {
            // 忽略错误
          }

          // 强制销毁主窗口（确保一定能关闭）
          try {
            await mainWindow.destroy()
          } catch {
            // 如果 destroy 失败，尝试 close
            try {
              await mainWindow.close()
            } catch {
              // 最后的备选方案：允许默认关闭行为
            }
          }
        })
      } catch {
        // 非 Tauri 环境，忽略
      }
    })()

    return () => {
      if (unlisten) unlisten()
    }
  }, [])

  return (
    <div className="app">
      <Canvas />
      <SettingsPanel />
    </div>
  )
}

export default App
