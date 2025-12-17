// 题目生成服务 - 根据知识点生成各类题目
// 增强版：验证+重试+结构化错误
import { siliconflowChat, MODEL_IDS, ApiError, ApiErrorType } from './siliconflow'
import { KnowledgePoint, Question, QuestionType, Settings } from '../stores/appStore'
import { tryParseJsonObject } from './fileUtils'

interface GenerateQuestionsParams {
  knowledgePoints: KnowledgePoint[]
  settings: Settings
  apiKey: string
}

// 生成结果（包含部分成功信息）
export interface GenerateQuestionsResult {
  questions: Question[]
  errors: Array<{
    type: QuestionType
    message: string
    retried: boolean
  }>
  totalRequested: number
  totalGenerated: number
}

// 题目类型的中文描述和提示
const typePrompts: Record<QuestionType, { name: string; desc: string }> = {
  choice: {
    name: '选择题',
    desc: '单选题，必须有4个选项（A/B/C/D），标注正确答案字母'
  },
  fill: {
    name: '填空题',
    desc: '用 ____（四个下划线）标记需要填空的位置，答案填写完整内容'
  },
  calculation: {
    name: '计算题',
    desc: '需要具体计算步骤的题目，答案包含完整解题过程'
  },
  short_answer: {
    name: '简答题',
    desc: '需要简要阐述概念或原理的题目'
  },
  proof: {
    name: '证明题',
    desc: '需要严格逻辑推导或数学证明的题目'
  }
}

// 难度描述
const difficultyNames = ['简单', '中等', '困难']

// 最大重试次数
const MAX_RETRIES = 2

/**
 * 生成题目主函数（增强版）
 */
export async function generateQuestions(params: GenerateQuestionsParams): Promise<GenerateQuestionsResult> {
  const { knowledgePoints, settings, apiKey } = params
  const allQuestions: Question[] = []
  const errors: GenerateQuestionsResult['errors'] = []
  let totalRequested = 0

  if (knowledgePoints.length === 0) {
    throw new Error('没有选中的知识点')
  }

  // 整理知识点内容
  const kpContents = knowledgePoints
    .map((kp, i) => `${i + 1}. ${kp.content}`)
    .join('\n')

  const kpIds = knowledgePoints.map(kp => kp.id)

  // 按题型分批生成
  for (const type of settings.questionTypes) {
    const typeInfo = typePrompts[type]
    const count = settings.questionCountPerType
    const difficulty = settings.defaultDifficulty
    totalRequested += count

    let questions: Question[] = []
    let lastError: string | null = null
    let retried = false

    // 重试机制
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`正在生成 ${count} 道${typeInfo.name}... (尝试 ${attempt + 1}/${MAX_RETRIES + 1})`)

        const result = await siliconflowChat({
          apiKey,
          model: MODEL_IDS.text.v3,
          messages: [
            {
              role: 'system',
              content: `你是一位专业的出题老师。请严格按照要求的JSON格式输出题目。
规则：
1. 必须使用中文出题
2. 必须输出有效的JSON格式
3. 不要输出任何JSON以外的文字
4. 必须生成指定数量的题目
5. 每道题必须有完整的content、answer字段
6. 选择题必须有完整的ABCD四个选项`
            },
            {
              role: 'user',
              content: buildPrompt(typeInfo, kpContents, count, difficulty)
            }
          ],
          maxTokens: 4000
        })

        console.log(`${typeInfo.name}生成完成，开始解析...`)

        const parsed = parseAndValidateQuestions(result, type, kpIds, count)

        if (parsed.valid.length > 0) {
          questions = parsed.valid
          console.log(`${typeInfo.name}解析完成，获得 ${questions.length} 道有效题目`)

          // 如果数量不足但有部分成功，记录警告
          if (questions.length < count) {
            console.warn(`${typeInfo.name}数量不足：请求 ${count}，获得 ${questions.length}`)
            if (attempt < MAX_RETRIES) {
              retried = true
              continue // 重试
            }
          }
          break // 成功，退出重试循环
        } else {
          lastError = parsed.error || '解析失败'
          if (attempt < MAX_RETRIES) {
            retried = true
            console.warn(`${typeInfo.name}生成失败，准备重试: ${lastError}`)
          }
        }
      } catch (err) {
        lastError = err instanceof ApiError ? err.message : String(err)

        // 认证错误不重试
        if (err instanceof ApiError && err.type === ApiErrorType.AUTH_ERROR) {
          break
        }

        if (attempt < MAX_RETRIES) {
          retried = true
          console.warn(`${typeInfo.name}生成出错，准备重试: ${lastError}`)
        }
      }
    }

    if (questions.length > 0) {
      allQuestions.push(...questions)
    }

    if (questions.length < count) {
      errors.push({
        type,
        message: lastError || `只生成了 ${questions.length}/${count} 道题目`,
        retried
      })
    }
  }

  // 返回结构化结果
  return {
    questions: allQuestions,
    errors,
    totalRequested,
    totalGenerated: allQuestions.length
  }
}

/**
 * 构建生成题目的 prompt
 */
function buildPrompt(
  typeInfo: { name: string; desc: string },
  kpContents: string,
  count: number,
  difficulty: number
): string {
  return `请基于以下知识点生成 ${count} 道${typeInfo.name}。

【题目类型】${typeInfo.name}
【题目要求】${typeInfo.desc}
【难度等级】${difficultyNames[difficulty - 1]}
【必须生成】${count} 道题目

【知识点列表】
${kpContents}

【输出要求】
必须输出以下格式的JSON，不要输出其他任何文字：

{"questions":[{"content":"题目内容","answer":"答案","analysis":"解析"${typeInfo.name === '选择题' ? ',"options":["A. 选项1","B. 选项2","C. 选项3","D. 选项4"]' : ''}}]}

注意：
- 必须生成 ${count} 道题目
- content 是题目内容
- answer 是标准答案
- analysis 是解析说明
${typeInfo.name === '选择题' ? '- options 是选项数组，必须有ABCD四个选项，每个选项以字母开头（如 "A. xxx"）' : ''}`
}

/**
 * 解析并验证题目（增强版）
 */
function parseAndValidateQuestions(
  response: string,
  type: QuestionType,
  sourceKpIds: string[],
  expectedCount: number
): { valid: Question[]; error?: string } {
  const parsed = tryParseJsonObject(response)

  if (!parsed?.questions || !Array.isArray(parsed.questions)) {
    console.warn('题目解析失败，原始响应:', response.substring(0, 500))
    return { valid: [], error: 'JSON 解析失败或格式不正确' }
  }

  const validQuestions: Question[] = []
  const validationErrors: string[] = []

  parsed.questions.forEach((q: any, i: number) => {
    // 基础验证
    if (!q.content || typeof q.content !== 'string' || q.content.length < 5) {
      validationErrors.push(`题目 ${i + 1}: 内容无效或过短`)
      return
    }

    if (!q.answer || typeof q.answer !== 'string') {
      validationErrors.push(`题目 ${i + 1}: 缺少答案`)
      return
    }

    // 选择题特殊验证
    if (type === 'choice') {
      if (!Array.isArray(q.options)) {
        validationErrors.push(`选择题 ${i + 1}: 缺少选项`)
        return
      }

      // 验证必须有 4 个选项
      if (q.options.length !== 4) {
        validationErrors.push(`选择题 ${i + 1}: 选项数量不是4个（当前 ${q.options.length} 个）`)
        return
      }

      // 验证选项格式（应以 A/B/C/D 开头）
      const expectedPrefixes = ['A', 'B', 'C', 'D']
      const hasValidPrefixes = q.options.every((opt: string, idx: number) => {
        return typeof opt === 'string' && opt.trim().toUpperCase().startsWith(expectedPrefixes[idx])
      })

      if (!hasValidPrefixes) {
        // 尝试修复选项格式
        q.options = q.options.map((opt: string, idx: number) => {
          const prefix = expectedPrefixes[idx]
          const content = String(opt).replace(/^[A-Da-d][.、．\s]*/, '').trim()
          return `${prefix}. ${content}`
        })
      }
    }

    validQuestions.push({
      id: `${Date.now()}_${type}_${i}_${Math.random().toString(36).slice(2)}`,
      type,
      content: q.content,
      options: type === 'choice' ? q.options : undefined,
      answer: q.answer,
      analysis: q.analysis || undefined,
      sourceKnowledgeIds: sourceKpIds,
      difficulty: (q.difficulty as 1 | 2 | 3) || 2,
      isFavorite: false,
      createdAt: Date.now()
    })
  })

  if (validationErrors.length > 0) {
    console.warn('题目验证警告:', validationErrors.join('; '))
  }

  if (validQuestions.length < expectedCount) {
    return {
      valid: validQuestions,
      error: `只有 ${validQuestions.length}/${expectedCount} 道题目通过验证`
    }
  }

  return { valid: validQuestions }
}

/**
 * 便捷方法：生成题目并抛出错误（向后兼容）
 */
export async function generateQuestionsLegacy(params: GenerateQuestionsParams): Promise<Question[]> {
  const result = await generateQuestions(params)

  if (result.questions.length === 0) {
    const errorMessages = result.errors.map(e => `${typePrompts[e.type].name}: ${e.message}`).join('; ')
    throw new Error(`题目生成失败: ${errorMessages || '未知错误'}`)
  }

  return result.questions
}
