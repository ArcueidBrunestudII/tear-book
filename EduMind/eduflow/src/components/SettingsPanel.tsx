// 设置面板组件
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore, QuestionType } from '../stores/appStore'
import './SettingsPanel.css'

// 题目类型选项
const questionTypeOptions: { key: QuestionType; label: string }[] = [
  { key: 'choice', label: '选择题' },
  { key: 'fill', label: '填空题' },
  { key: 'calculation', label: '计算题' },
  { key: 'short_answer', label: '简答题' },
  { key: 'proof', label: '证明题' }
]

// API Key 测试状态
type TestStatus = 'idle' | 'testing' | 'success' | 'error'

// 用系统浏览器打开链接（Tauri 优先走 plugin-shell，浏览器环境回退 window.open）
const openExternal = async (url: string) => {
  try {
    const shell = await import('@tauri-apps/plugin-shell')
    await shell.open(url)
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

export function SettingsPanel() {
  const { settings, setSettings, sidebarOpen, toggleSidebar } = useAppStore()
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [testMessage, setTestMessage] = useState('')

  // 确保 questionTypes 始终是数组（兼容旧数据）
  const questionTypes = settings.questionTypes ?? ['choice', 'fill']

  // 测试 API Key 连通性
  const testApiKey = async () => {
    if (!settings.apiKey.trim()) {
      setTestStatus('error')
      setTestMessage('请先输入 API Key')
      setTimeout(() => { setTestStatus('idle'); setTestMessage('') }, 3000)
      return
    }

    setTestStatus('testing')
    setTestMessage('正在测试...')

    try {
      // 动态导入避免模块加载问题
      const { siliconflowChat, MODEL_IDS } = await import('../services/siliconflow')

      const response = await siliconflowChat({
        apiKey: settings.apiKey,
        model: MODEL_IDS.text.v3,
        messages: [
          { role: 'user', content: '你好，请回复"连接成功"' }
        ],
        maxTokens: 50,
        timeoutMs: 15000,
      })

      if (response && response.length > 0) {
        setTestStatus('success')
        setTestMessage('连接成功！API Key 有效')
      } else {
        setTestStatus('error')
        setTestMessage('API 返回为空，请检查')
      }
    } catch (err: any) {
      setTestStatus('error')
      const msg = err?.message || String(err)
      if (msg.includes('401') || msg.includes('Unauthorized')) {
        setTestMessage('API Key 无效或已过期')
      } else if (msg.includes('timeout') || msg.includes('abort')) {
        setTestMessage('连接超时，请检查网络')
      } else {
        setTestMessage(`连接失败: ${msg.substring(0, 50)}`)
      }
    }

    // 3秒后恢复 idle 状态
    setTimeout(() => {
      setTestStatus('idle')
      setTestMessage('')
    }, 3000)
  }

  return (
    <>
      {/* 触发按钮 */}
      <motion.button
        className="sidebar-trigger"
        onClick={toggleSidebar}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        <span className="trigger-icon">{sidebarOpen ? '×' : '›'}</span>
      </motion.button>

      {/* 侧边栏面板 */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            {/* 背景遮罩 */}
            <motion.div
              className="sidebar-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={toggleSidebar}
            />

            {/* 面板内容 */}
            <motion.div
              className="settings-panel"
              initial={{ x: -320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -320, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              <h2 className="panel-title">设置</h2>

              {/* API Key */}
              <div className="setting-group">
                <label className="setting-label">API Key</label>
                <input
                  type="password"
                  className="setting-input"
                  placeholder="输入硅基流动 API Key"
                  value={settings.apiKey}
                  onChange={(e) => setSettings({ apiKey: e.target.value })}
                />
                <div className="api-key-actions">
                  <button
                    className="setting-link"
                    onClick={() => void openExternal('https://cloud.siliconflow.cn')}
                    type="button"
                  >
                    获取 API Key →
                  </button>
                  <button
                    className={`test-btn ${testStatus}`}
                    onClick={() => void testApiKey()}
                    type="button"
                    disabled={testStatus === 'testing'}
                  >
                    {testStatus === 'testing' ? '测试中...' : '测试连接'}
                  </button>
                </div>
                {testMessage && (
                  <p className={`test-message ${testStatus}`}>{testMessage}</p>
                )}
              </div>

              {/* OCR模型 */}
              <div className="setting-group">
                <label className="setting-label">视觉识别模型</label>
                <select
                  className="setting-select"
                  value={settings.ocrModel}
                  onChange={(e) => setSettings({ ocrModel: e.target.value as any })}
                >
                  <option value="deepseek-ocr">DeepSeek-OCR (推荐)</option>
                  <option value="qwen-vl">Qwen2.5-VL-72B</option>
                </select>
              </div>

              {/* 文本模型 */}
              <div className="setting-group">
                <label className="setting-label">文本处理模型</label>
                <select
                  className="setting-select"
                  value={settings.textModel}
                  onChange={(e) => setSettings({ textModel: e.target.value as any })}
                >
                  <option value="deepseek-v3">DeepSeek-V3.2 (快速)</option>
                  <option value="deepseek-r1">DeepSeek-R1 (深度思考)</option>
                </select>
              </div>

              {/* 深度思考模式 */}
              <div className="setting-group">
                <label className="setting-label">
                  <input
                    type="checkbox"
                    checked={settings.deepThinking}
                    onChange={(e) => setSettings({ deepThinking: e.target.checked })}
                  />
                  <span className="checkbox-text">深度思考模式</span>
                </label>
                <p className="setting-hint">启用后会更仔细分析，但速度较慢</p>
              </div>

              {/* 初始知识点数量 */}
              <div className="setting-group">
                <label className="setting-label">
                  每次识别知识点数量: {settings.batchKnowledgeCount}
                </label>
                <input
                  type="range"
                  className="setting-range"
                  min="5"
                  max="50"
                  step="5"
                  value={settings.batchKnowledgeCount}
                  onChange={(e) => {
                    const v = parseInt(e.target.value)
                    setSettings({ batchKnowledgeCount: v, initialKnowledgeCount: v })
                  }}
                />
                <div className="range-labels">
                  <span>5</span>
                  <span>50</span>
                </div>
              </div>

              {/* 处理线程数 */}
              <div className="setting-group">
                <label className="setting-label">处理线程数</label>
                <div className="radio-group">
                  <label className="radio-item">
                    <input
                      type="radio"
                      name="processingThreads"
                      checked={settings.processingThreads === 1}
                      onChange={() => setSettings({ processingThreads: 1 })}
                    />
                    <span>单线程 (每次1个API调用)</span>
                  </label>
                  <label className="radio-item">
                    <input
                      type="radio"
                      name="processingThreads"
                      checked={settings.processingThreads === 2}
                      onChange={() => setSettings({ processingThreads: 2 })}
                    />
                    <span>双线程 (每次2个API调用)</span>
                  </label>
                </div>
                <p className="setting-hint">双线程处理更快，但消耗更多API额度</p>
              </div>

              {/* 分隔线 */}
              <div className="setting-divider">
                <span>题目生成设置</span>
              </div>

              {/* 题目类型选择 */}
              <div className="setting-group">
                <label className="setting-label">题目类型</label>
                <div className="checkbox-group">
                  {questionTypeOptions.map(({ key, label }) => (
                    <label key={key} className="checkbox-item">
                      <input
                        type="checkbox"
                        checked={questionTypes.includes(key)}
                        onChange={(e) => {
                          const types = e.target.checked
                            ? [...questionTypes, key]
                            : questionTypes.filter(t => t !== key)
                          setSettings({ questionTypes: types })
                        }}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 每种类型题目数量 */}
              <div className="setting-group">
                <label className="setting-label">
                  每种类型题目数量: {settings.questionCountPerType}
                </label>
                <input
                  type="range"
                  className="setting-range"
                  min="1"
                  max="10"
                  value={settings.questionCountPerType}
                  onChange={(e) => setSettings({ questionCountPerType: parseInt(e.target.value) })}
                />
                <div className="range-labels">
                  <span>1</span>
                  <span>10</span>
                </div>
              </div>

              {/* 默认难度 */}
              <div className="setting-group">
                <label className="setting-label">默认难度</label>
                <select
                  className="setting-select"
                  value={settings.defaultDifficulty}
                  onChange={(e) => setSettings({ defaultDifficulty: parseInt(e.target.value) as 1 | 2 | 3 })}
                >
                  <option value={1}>简单</option>
                  <option value={2}>中等</option>
                  <option value={3}>困难</option>
                </select>
              </div>

              {/* 答案默认显示 */}
              <div className="setting-group">
                <label className="setting-label">
                  <input
                    type="checkbox"
                    checked={settings.defaultShowAnswer}
                    onChange={(e) => setSettings({ defaultShowAnswer: e.target.checked })}
                  />
                  <span className="checkbox-text">默认显示答案</span>
                </label>
                <p className="setting-hint">生成题目后是否默认展开答案</p>
              </div>

              {/* 版本信息 */}
              <div className="panel-footer">
                <p>EduFlow v0.1.0</p>
                <p className="footer-hint">拖拽文件到画布开始学习</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
