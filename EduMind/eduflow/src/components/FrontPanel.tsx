// 前面板组件 - 题目展示区域
import { useMemo } from 'react'
import { useAppStore } from '../stores/appStore'
import { QuestionCard } from './QuestionCard'
import './FrontPanel.css'

interface FrontPanelProps {
  appId: string
}

export function FrontPanel({ appId }: FrontPanelProps) {
  const { apps, settings } = useAppStore()
  const app = apps.find(a => a.id === appId)

  // 当前题目会话
  const currentSession = useMemo(() => {
    if (!app?.currentSessionId) return null
    return app.questionSessions.find(s => s.id === app.currentSessionId)
  }, [app])

  // 收藏的题目数量
  const favoriteCount = useMemo(() => {
    if (!currentSession) return 0
    return currentSession.questions.filter(q => q.isFavorite).length
  }, [currentSession])

  if (!app) {
    return <div className="front-panel empty">应用不存在</div>
  }

  // 空状态
  if (!currentSession || currentSession.questions.length === 0) {
    return (
      <div className="front-panel">
        <div className="front-panel-empty">
          <span className="empty-icon">📝</span>
          <h3>尚未生成题目</h3>
          <p>请在后面板选择知识点，然后点击"运行"生成题目</p>
          <div className="empty-tips">
            <div className="tip">
              <span className="tip-icon">1</span>
              <span>切换到后面板</span>
            </div>
            <div className="tip">
              <span className="tip-icon">2</span>
              <span>勾选需要的知识点</span>
            </div>
            <div className="tip">
              <span className="tip-icon">3</span>
              <span>点击运行按钮生成题目</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="front-panel">
      {/* 顶部信息栏 */}
      <div className="front-panel-header">
        <div className="header-left">
          <h2 className="panel-title">题目练习</h2>
          <span className="count-info">
            共 {currentSession.questions.length} 道题
            {favoriteCount > 0 && ` · ★ ${favoriteCount} 已收藏`}
          </span>
        </div>
        <div className="header-right">
          <span className="session-time">
            生成于 {new Date(currentSession.createdAt).toLocaleString('zh-CN')}
          </span>
        </div>
      </div>

      {/* 题目列表 */}
      <div className="front-panel-content">
        <div className="questions-grid">
          {currentSession.questions.map((question, index) => (
            <QuestionCard
              key={question.id}
              question={question}
              index={index + 1}
              appId={appId}
              sessionId={currentSession.id}
              defaultShowAnswer={settings.defaultShowAnswer}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
