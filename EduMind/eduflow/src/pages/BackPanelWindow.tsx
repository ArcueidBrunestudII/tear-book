// 后面板窗口 - 知识点树 + 运行按钮
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAppStore } from '../stores/appStore'
import { BackPanel } from '../components/BackPanel'
import { generateQuestions } from '../services/questionGenerator'
import './BackPanelWindow.css'

export function BackPanelWindow() {
  const { appId } = useParams<{ appId: string }>()
  const { apps, settings, addQuestionSession } = useAppStore()
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const app = apps.find(a => a.id === appId)
  const selectedCount = app?.knowledgePoints.filter(kp => kp.selected).length || 0

  const handleRun = async () => {
    if (!app || selectedCount === 0 || !settings.apiKey) {
      if (!settings.apiKey) {
        setError('请先在主窗口设置中配置 API Key')
      } else if (selectedCount === 0) {
        setError('请先勾选要生成题目的知识点')
      }
      return
    }

    setError(null)
    setIsGenerating(true)

    try {
      const result = await generateQuestions({
        knowledgePoints: app.knowledgePoints.filter(kp => kp.selected),
        settings,
        apiKey: settings.apiKey
      })

      // 显示部分成功警告
      if (result.errors.length > 0) {
        const warnings = result.errors.map(e => e.message).join('; ')
        console.warn('部分题目生成失败:', warnings)
      }

      if (result.questions.length === 0) {
        throw new Error('没有生成任何题目')
      }

      const session = {
        id: Date.now().toString(),
        questions: result.questions,
        selectedKnowledgeIds: app.knowledgePoints.filter(kp => kp.selected).map(kp => kp.id),
        createdAt: Date.now()
      }

      addQuestionSession(appId!, session)
    } catch (err) {
      console.error('生成题目失败:', err)
      setError(err instanceof Error ? err.message : '生成题目失败')
    } finally {
      setIsGenerating(false)
    }
  }

  if (!app) {
    return (
      <div className="back-panel-window error">
        <div className="error-content">
          <span className="error-icon">⚠️</span>
          <h2>应用不存在</h2>
        </div>
      </div>
    )
  }

  return (
    <div className="back-panel-window">
      {/* 标题栏 */}
      <div className="window-header">
        <div className="header-title">
          <span className="panel-label">后面板</span>
          <span className="app-name">{app.name}</span>
        </div>
        <div className="header-info">
          <span className="kp-count">{app.knowledgePoints.length} 个知识点</span>
          <span className="selected-count">已选 {selectedCount}</span>
        </div>
      </div>

      {/* 知识点树 */}
      <div className="panel-content">
        <BackPanel appId={appId!} />
      </div>

      {/* 底部工具栏 */}
      <div className="window-footer">
        {error && <div className="error-msg">{error}</div>}
        <button
          className={`run-btn ${isGenerating ? 'loading' : ''}`}
          onClick={handleRun}
          disabled={isGenerating || selectedCount === 0 || !settings.apiKey}
        >
          {isGenerating ? '生成中...' : `▶ 运行 (生成题目)`}
        </button>
      </div>
    </div>
  )
}
