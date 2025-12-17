// 应用图标网格组件
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore, type AppItem } from '../../stores/appStore'
import { AppIcon, ContextMenu, PropertiesPanel } from '../AppIcon'
import { openAppWindow } from '../../services/windowManager'

const defaultColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

interface AppGridProps {
  apps: AppItem[]
  onNextBatch: (appId: string) => void
  onRemoveApp: (appId: string) => void
}

export function AppGrid({ apps, onNextBatch, onRemoveApp }: AppGridProps) {
  const { updateApp } = useAppStore()

  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    app: AppItem
  } | null>(null)
  const [propertiesApp, setPropertiesApp] = useState<AppItem | null>(null)
  const [renameApp, setRenameApp] = useState<AppItem | null>(null)
  const [renameName, setRenameName] = useState('')

  // 右键菜单
  const handleContextMenu = (e: React.MouseEvent, app: AppItem) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, app })
  }

  // 重命名
  const startRename = (app: AppItem) => {
    setRenameApp(app)
    setRenameName(app.name)
    setContextMenu(null)
  }

  const confirmRename = () => {
    if (renameApp && renameName.trim()) {
      updateApp(renameApp.id, { name: renameName.trim() })
    }
    setRenameApp(null)
  }

  // 更换图标 (简化版 - 实际需要文件选择)
  const changeIcon = (app: AppItem) => {
    // 随机换个颜色（实际应打开文件选择器）
    const newColor = defaultColors[Math.floor(Math.random() * defaultColors.length)]
    updateApp(app.id, { icon: newColor })
    setContextMenu(null)
  }

  return (
    <>
      {/* 空状态 */}
      {apps.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">📚</div>
          <h3>拖拽文件到这里</h3>
          <p>支持 .txt .md .pdf .png .jpg 格式</p>
        </div>
      )}

      {/* 应用图标网格 */}
      <div className="apps-grid">
        <AnimatePresence>
          {apps.map(app => (
            <AppIcon
              key={app.id}
              app={app}
              onDoubleClick={() => void openAppWindow({ appId: app.id, appName: app.name })}
              onContextMenu={(e) => handleContextMenu(e, app)}
              onNextBatch={() => {
                // 撕书机制：点击 > 处理下一批
                onNextBatch(app.id)
              }}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* 右键菜单 */}
      <AnimatePresence>
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => setContextMenu(null)}
            onRename={() => startRename(contextMenu.app)}
            onChangeIcon={() => changeIcon(contextMenu.app)}
            onShowProperties={() => {
              setPropertiesApp(contextMenu.app)
              setContextMenu(null)
            }}
            onDelete={() => {
              onRemoveApp(contextMenu.app.id)
              setContextMenu(null)
            }}
          />
        )}
      </AnimatePresence>

      {/* 属性面板 */}
      <AnimatePresence>
        {propertiesApp && (
          <PropertiesPanel
            app={propertiesApp}
            onClose={() => setPropertiesApp(null)}
          />
        )}
      </AnimatePresence>

      {/* 重命名对话框 */}
      <AnimatePresence>
        {renameApp && (
          <motion.div
            className="rename-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setRenameApp(null)}
          >
            <motion.div
              className="rename-dialog"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3>重命名</h3>
              <input
                type="text"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmRename()}
                autoFocus
              />
              <div className="rename-buttons">
                <button onClick={() => setRenameApp(null)}>取消</button>
                <button className="primary" onClick={confirmRename}>确认</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
