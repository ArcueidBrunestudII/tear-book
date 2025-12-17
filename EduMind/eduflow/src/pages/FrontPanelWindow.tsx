// 前面板窗口 - 题目显示
import { useParams } from 'react-router-dom'
import { useAppStore } from '../stores/appStore'
import { FrontPanel } from '../components/FrontPanel'
import './FrontPanelWindow.css'

export function FrontPanelWindow() {
  const { appId } = useParams<{ appId: string }>()
  const { apps } = useAppStore()

  const app = apps.find(a => a.id === appId)

  // 获取当前会话的题目数量
  const currentSession = app?.questionSessions.find(s => s.id === app.currentSessionId)
  const questionCount = currentSession?.questions.length || 0
  const totalSessions = app?.questionSessions.length || 0

  if (!app) {
    return (
      <div className="front-panel-window error">
        <div className="error-content">
          <span className="error-icon">⚠️</span>
          <h2>应用不存在</h2>
        </div>
      </div>
    )
  }

  return (
    <div className="front-panel-window">
      {/* 标题栏 */}
      <div className="window-header">
        <div className="header-title">
          <span className="panel-label">前面板</span>
          <span className="app-name">{app.name}</span>
        </div>
        <div className="header-info">
          {questionCount > 0 ? (
            <>
              <span className="question-count">{questionCount} 道题目</span>
              <span className="session-count">共 {totalSessions} 次生成</span>
            </>
          ) : (
            <span className="hint">在后面板运行后显示题目</span>
          )}
        </div>
      </div>

      {/* 题目内容 */}
      <div className="panel-content">
        <FrontPanel appId={appId!} />
      </div>
    </div>
  )
}
