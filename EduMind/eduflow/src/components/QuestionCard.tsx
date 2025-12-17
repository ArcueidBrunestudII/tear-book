// 题目卡片组件
import { useState, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore, Question, QuestionType } from '../stores/appStore'
import './QuestionCard.css'

interface QuestionCardProps {
  question: Question
  index: number
  appId: string
  sessionId: string
  defaultShowAnswer: boolean
}

// 题目类型标签
const typeLabels: Record<QuestionType, { name: string; color: string }> = {
  choice: { name: '选择题', color: '#3b82f6' },
  fill: { name: '填空题', color: '#10b981' },
  calculation: { name: '计算题', color: '#f59e0b' },
  short_answer: { name: '简答题', color: '#8b5cf6' },
  proof: { name: '证明题', color: '#ef4444' }
}

// 难度配色
const difficultyConfig = [
  { name: '简单', color: '#10b981', bg: '#ecfdf5' },
  { name: '中等', color: '#f59e0b', bg: '#fffbeb' },
  { name: '困难', color: '#ef4444', bg: '#fef2f2' }
]

export const QuestionCard = memo(function QuestionCard({
  question,
  index,
  appId,
  sessionId,
  defaultShowAnswer
}: QuestionCardProps) {
  const [showAnswer, setShowAnswer] = useState(defaultShowAnswer)
  const { toggleQuestionFavorite } = useAppStore()

  const typeInfo = typeLabels[question.type]
  const difficultyInfo = difficultyConfig[question.difficulty - 1]

  const handleToggleFavorite = () => {
    toggleQuestionFavorite(appId, sessionId, question.id)
  }

  return (
    <motion.div
      className="question-card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
    >
      {/* 题目头部 */}
      <div className="question-header">
        <div className="header-left">
          <span className="question-index">第 {index} 题</span>
          <span
            className="type-badge"
            style={{ backgroundColor: typeInfo.color }}
          >
            {typeInfo.name}
          </span>
          <span
            className="difficulty-badge"
            style={{
              color: difficultyInfo.color,
              backgroundColor: difficultyInfo.bg
            }}
          >
            {difficultyInfo.name}
          </span>
        </div>
        <button
          className={`favorite-btn ${question.isFavorite ? 'active' : ''}`}
          onClick={handleToggleFavorite}
          title={question.isFavorite ? '取消收藏' : '收藏题目'}
        >
          {question.isFavorite ? '★' : '☆'}
        </button>
      </div>

      {/* 题目内容 */}
      <div className="question-content">
        <p className="content-text">{question.content}</p>

        {/* 选择题选项 */}
        {question.type === 'choice' && question.options && (
          <div className="options-list">
            {question.options.map((opt, i) => (
              <div key={i} className="option-item">
                <span className="option-text">{opt}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 答案区域 */}
      <div className="answer-section">
        <button
          className={`toggle-answer-btn ${showAnswer ? 'expanded' : ''}`}
          onClick={() => setShowAnswer(!showAnswer)}
        >
          <span className="toggle-icon">{showAnswer ? '▼' : '▶'}</span>
          <span>{showAnswer ? '隐藏答案' : '显示答案'}</span>
        </button>

        <AnimatePresence>
          {showAnswer && (
            <motion.div
              className="answer-content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="answer-box">
                <div className="answer-label">答案</div>
                <div className="answer-text">{question.answer}</div>
              </div>

              {question.analysis && (
                <div className="analysis-box">
                  <div className="analysis-label">解析</div>
                  <div className="analysis-text">{question.analysis}</div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
})
