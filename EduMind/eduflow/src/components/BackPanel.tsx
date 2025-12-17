// 后面板组件 - 知识点树形结构
import { useAppStore } from '../stores/appStore'
import { KnowledgeTree } from './KnowledgeTree'
import './BackPanel.css'

interface BackPanelProps {
  appId: string
}

export function BackPanel({ appId }: BackPanelProps) {
  const { apps, selectAllKnowledge } = useAppStore()
  const app = apps.find(a => a.id === appId)

  if (!app) {
    return <div className="back-panel empty">应用不存在</div>
  }

  const totalCount = app.knowledgePoints.length
  const selectedCount = app.knowledgePoints.filter(kp => kp.selected).length

  return (
    <div className="back-panel">
      {/* 顶部操作栏 */}
      <div className="back-panel-header">
        <div className="header-left">
          <h2 className="panel-title">知识点目录</h2>
          <span className="count-info">
            共 {totalCount} 个 · 已选 {selectedCount} 个
          </span>
        </div>
        <div className="header-right">
          <button
            className="select-btn"
            onClick={() => selectAllKnowledge(appId, true)}
            disabled={selectedCount === totalCount}
          >
            全选
          </button>
          <button
            className="select-btn"
            onClick={() => selectAllKnowledge(appId, false)}
            disabled={selectedCount === 0}
          >
            全不选
          </button>
        </div>
      </div>

      {/* 知识点树 */}
      <div className="back-panel-content">
        {totalCount === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📚</span>
            <p>暂无知识点</p>
            <p className="empty-hint">请先在主界面识别文件内容</p>
          </div>
        ) : (
          <KnowledgeTree appId={appId} />
        )}
      </div>
    </div>
  )
}
