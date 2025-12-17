// 知识点详情弹窗 - 双击叶子节点显示详细讲解
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useAppStore, KnowledgePoint } from '../stores/appStore'
import { siliconflowChat, MODEL_IDS } from '../services/siliconflow'
import { MathText } from './MathText'
import './KnowledgeDetailModal.css'

interface KnowledgeDetailModalProps {
  kp: KnowledgePoint
  appId: string
  onClose: () => void
}

export function KnowledgeDetailModal({ kp, appId, onClose }: KnowledgeDetailModalProps) {
  const { settings, updateKnowledgeDetail } = useAppStore()
  const [detail, setDetail] = useState<string>(kp.detailContent || '')
  const [isLoading, setIsLoading] = useState(!kp.detailContent)
  const [error, setError] = useState<string | null>(null)

  // 如果没有详细内容，调用AI生成
  useEffect(() => {
    if (!kp.detailContent && settings.apiKey) {
      generateDetail()
    } else if (!kp.detailContent && !settings.apiKey) {
      setError('请先配置 API Key')
      setIsLoading(false)
    }
  }, [kp.id])

  const generateDetail = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const result = await siliconflowChat({
        apiKey: settings.apiKey,
        model: MODEL_IDS.text.v3,
        messages: [
          {
            role: 'system',
            content: '你是一位专业的教师。请对给定的知识点进行详细讲解，包括：\n1. 概念解释\n2. 核心要点\n3. 常见误区\n4. 实际应用\n\n使用清晰的结构和简洁的语言，适合学习者理解。'
          },
          {
            role: 'user',
            content: `请详细讲解以下知识点：\n\n${kp.content}`
          }
        ],
        maxTokens: 2000
      })

      setDetail(result)
      // 保存到知识点
      updateKnowledgeDetail(appId, kp.id, result)
    } catch (err) {
      console.error('生成详细讲解失败:', err)
      setError(err instanceof Error ? err.message : '生成失败')
    } finally {
      setIsLoading(false)
    }
  }

  // 点击背景关闭
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <motion.div
      className="detail-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={handleOverlayClick}
    >
      <motion.div
        className="detail-modal"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 400 }}
      >
        {/* 头部 */}
        <div className="detail-header">
          <div className="detail-title">
            <MathText>{kp.title || kp.content.substring(0, 100)}</MathText>
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {/* 原始内容 */}
        <div className="original-content">
          <h3 className="section-title">原文内容</h3>
          <div className="original-text">
            <MathText>{kp.content}</MathText>
          </div>
          {kp.answer && (
            <div className="answer-section">
              <h4 className="answer-title">答案</h4>
              <MathText>{kp.answer}</MathText>
            </div>
          )}
        </div>

        {/* AI 生成的详细讲解 */}
        <div className="detail-content">
          <h3 className="section-title">详细讲解</h3>
          {isLoading ? (
            <div className="loading-state">
              <div className="loading-spinner">⟳</div>
              <p>正在生成详细讲解...</p>
            </div>
          ) : error ? (
            <div className="error-state">
              <span className="error-icon">⚠️</span>
              <p>{error}</p>
              {settings.apiKey && (
                <button className="retry-btn" onClick={generateDetail}>
                  重试
                </button>
              )}
            </div>
          ) : (
            <div className="detail-text">
              <MathText>{detail}</MathText>
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="detail-footer">
          {!isLoading && !error && (
            <button
              className="regenerate-btn"
              onClick={generateDetail}
              disabled={!settings.apiKey}
            >
              重新生成
            </button>
          )}
          <button className="close-btn-text" onClick={onClose}>
            关闭
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
