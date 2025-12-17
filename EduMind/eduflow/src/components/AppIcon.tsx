// 应用图标组件
import { motion } from 'framer-motion'
import { AppItem } from '../stores/appStore'
import './AppIcon.css'

interface AppIconProps {
  app: AppItem
  onDoubleClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onNextBatch?: () => void
}

export function AppIcon({ app, onDoubleClick, onContextMenu, onNextBatch }: AppIconProps) {
  // 上面：本批处理进度（蓝色）
  // 如果这批已经处理完（status 不是 processing），显示100%
  // 如果正在处理中，显示实际进度
  const batchProgress = app.status === 'processing'
    ? (app.batchTarget > 0 ? (app.batchProducedCount / app.batchTarget) * 100 : 0)
    : (app.batchProducedCount > 0 ? 100 : 0)

  // 下面：总文件进度（绿色）
  const totalProgress = app.contentTotal > 0
    ? (app.contentCursor / app.contentTotal) * 100
    : 0

  // 判断是否还有更多内容可处理（总量>0 且 未处理完）
  const canProcess = app.contentTotal > 0 && app.contentCursor < app.contentTotal

  // 是否正在处理
  const isProcessing = app.status === 'processing'

  const isImage = app.icon.startsWith('/') || app.icon.startsWith('data:')

  return (
    <motion.div
      className="app-icon"
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 520, damping: 34, mass: 0.8 }}
      whileHover={{ scale: 1.03, y: -3 }}
      whileTap={{ scale: 0.95 }}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {/* 图标 */}
      <div
        className="icon-visual"
        style={isImage ? {} : { backgroundColor: app.icon }}
      >
        {isImage ? (
          <img src={app.icon} alt={app.name} className="icon-image" />
        ) : (
          <span className="icon-letter">{app.name.charAt(0).toUpperCase()}</span>
        )}

      </div>

      {/* 名称 */}
      <span className="icon-name">{app.name}</span>

      {/* 进度条：上面蓝色=本批进度；下面绿色=总进度 */}
      <div className="progress-stack">
        {/* 上面：本批进度（蓝色）+ 知识点数量 + 撕书按钮 */}
        <div className="progress-row">
          <div className="progress-bar blue">
            <motion.div
              className="progress-fill blue"
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(0, Math.min(100, batchProgress))}%` }}
              transition={{ duration: 0.25 }}
            />
          </div>
          <span className="batch-count" title="已提取知识元数量">
            {app.knowledgePoints?.length || 0}
          </span>
          <button
            className={`next-batch-btn ${isProcessing ? 'processing' : ''}`}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onNextBatch?.()
            }}
            disabled={isProcessing || !canProcess}
            title={isProcessing ? '处理中...' : canProcess ? '撕书：处理下一批' : '已处理完成'}
          >
            {isProcessing ? '...' : '>'}
          </button>
        </div>

        {/* 下面：总文件进度（绿色）+ 百分比 */}
        <div className="progress-row">
          <div className="progress-bar green">
            <motion.div
              className="progress-fill green"
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(0, Math.min(100, totalProgress))}%` }}
              transition={{ duration: 0.25 }}
            />
          </div>
          <span className="progress-text">
            {app.contentTotal > 0 ? `${Math.round(totalProgress)}%` : '0%'}
          </span>
        </div>
      </div>

      {/* 完成标记（无更多内容才算完成） */}
      {app.status === 'done' && !app.hasMore && (
        <motion.div
          className="done-badge"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
        >
          ✓
        </motion.div>
      )}
    </motion.div>
  )
}

// 右键菜单
interface ContextMenuProps {
  x: number
  y: number
  onClose: () => void
  onRename: () => void
  onChangeIcon: () => void
  onShowProperties: () => void
  onDelete: () => void
}

export function ContextMenu({
  x, y, onClose, onRename, onChangeIcon, onShowProperties, onDelete
}: ContextMenuProps) {
  return (
    <>
      <div className="context-overlay" onClick={onClose} />
      <motion.div
        className="context-menu"
        style={{ left: x, top: y }}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
      >
        <button className="context-item" onClick={onRename}>
          <span>✏️</span> 重命名
        </button>
        <button className="context-item" onClick={onChangeIcon}>
          <span>🖼️</span> 更换图标
        </button>
        <div className="context-divider" />
        <button className="context-item" onClick={onShowProperties}>
          <span>📋</span> 属性
        </button>
        <div className="context-divider" />
        <button className="context-item danger" onClick={onDelete}>
          <span>🗑️</span> 删除
        </button>
      </motion.div>
    </>
  )
}

// 属性面板
interface PropertiesPanelProps {
  app: AppItem
  onClose: () => void
}

export function PropertiesPanel({ app, onClose }: PropertiesPanelProps) {
  return (
    <motion.div
      className="properties-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="properties-panel"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="properties-title">{app.name} 属性</h3>

        <div className="properties-list">
          <div className="property-row">
            <span className="property-label">文件类型</span>
            <span className="property-value">{app.fileType.toUpperCase()}</span>
          </div>
          <div className="property-row">
            <span className="property-label">来源文件</span>
            <span className="property-value truncate">{app.sourceFile}</span>
          </div>
          <div className="property-row">
            <span className="property-label">知识点数量</span>
            <span className="property-value">{app.knowledgePoints.length} 个</span>
          </div>
          <div className="property-row">
            <span className="property-label">处理状态</span>
            <span className="property-value">
              {app.status === 'done' ? '✅ 已完成' :
               app.status === 'processing' ? '⏳ 处理中' : '⏸️ 等待中'}
            </span>
          </div>
          <div className="property-row">
            <span className="property-label">创建时间</span>
            <span className="property-value">
              {new Date(app.createdAt).toLocaleString('zh-CN')}
            </span>
          </div>
          <div className="property-row">
            <span className="property-label">更新时间</span>
            <span className="property-value">
              {new Date(app.updatedAt).toLocaleString('zh-CN')}
            </span>
          </div>
        </div>

        <button className="properties-close" onClick={onClose}>
          关闭
        </button>
      </motion.div>
    </motion.div>
  )
}
