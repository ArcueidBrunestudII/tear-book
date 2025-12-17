// 学习上下文管理服务
import type { LearningContext, KnowledgePoint, KnowledgeType } from '../stores/appStore'
import { questionNumbersMatch } from './fileUtils'

// 创建默认学习上下文
export function createDefaultLearningContext(): LearningContext {
  return {
    currentPath: [],
    recentKnowledge: [],
    pending: {
      fragment: null,
      exercisesAwaitingAnswer: [],
      answersAwaitingQuestion: [],
    },
    documentType: null,
    currentRegion: null,
  }
}

// 答案匹配结果
export interface AnswerMatchResult {
  updatedKps: KnowledgePoint[]
  updatedContext: LearningContext
  matchedCount: number
  unmatchedAnswers: number
  unmatchedExercises: number
}

// 最大等待队列大小
const MAX_PENDING_ANSWERS = 50
const MAX_PENDING_EXERCISES = 50

// 处理答案匹配
export function processAnswerMatching(
  existingKps: KnowledgePoint[],
  newKps: KnowledgePoint[],
  matchedAnswers: Array<{ questionNumber: string; answer: string }>,
  context: LearningContext
): AnswerMatchResult {
  let matchedCount = 0
  const updatedExistingKps = [...existingKps]
  const updatedContext: LearningContext = {
    ...context,
    pending: {
      ...context.pending,
      exercisesAwaitingAnswer: [...context.pending.exercisesAwaitingAnswer],
      answersAwaitingQuestion: [...context.pending.answersAwaitingQuestion],
    },
  }

  // 1. 处理 AI 返回的 matchedAnswers
  for (const match of matchedAnswers) {
    // 在现有知识点中查找对应题号的习题
    const targetIdx = updatedExistingKps.findIndex(kp =>
      kp.type === 'exercise' &&
      kp.questionNumber &&
      questionNumbersMatch(kp.questionNumber, match.questionNumber) &&
      !kp.hasAnswer
    )

    if (targetIdx >= 0) {
      updatedExistingKps[targetIdx] = {
        ...updatedExistingKps[targetIdx],
        hasAnswer: true,
        answer: match.answer,
      }
      matchedCount++
      console.log(`匹配成功: 题${match.questionNumber} -> 答案已更新`)
    } else {
      // 尝试在等待答案队列中查找
      const awaitingIdx = updatedContext.pending.exercisesAwaitingAnswer.findIndex(
        e => questionNumbersMatch(e.questionNumber, match.questionNumber)
      )

      if (awaitingIdx >= 0) {
        const awaitingItem = updatedContext.pending.exercisesAwaitingAnswer[awaitingIdx]
        const kpIdx = updatedExistingKps.findIndex(kp => kp.id === awaitingItem.id)

        if (kpIdx >= 0) {
          updatedExistingKps[kpIdx] = {
            ...updatedExistingKps[kpIdx],
            hasAnswer: true,
            answer: match.answer,
          }
          // 从等待队列中移除
          updatedContext.pending.exercisesAwaitingAnswer.splice(awaitingIdx, 1)
          matchedCount++
          console.log(`从等待队列匹配成功: 题${match.questionNumber}`)
        }
      } else {
        // 答案先于题目出现，加入待匹配队列
        updatedContext.pending.answersAwaitingQuestion.push(match)
        console.log(`答案先于题目，加入待匹配队列: 题${match.questionNumber}`)
      }
    }
  }

  // 2. 处理新提取的习题
  for (const kp of newKps) {
    if (kp.type === 'exercise' && kp.questionNumber) {
      // 检查是否有待匹配的答案
      const awaitingIdx = updatedContext.pending.answersAwaitingQuestion.findIndex(
        a => questionNumbersMatch(a.questionNumber, kp.questionNumber!)
      )

      if (awaitingIdx >= 0) {
        // 有待匹配的答案，更新习题
        kp.hasAnswer = true
        kp.answer = updatedContext.pending.answersAwaitingQuestion[awaitingIdx].answer
        updatedContext.pending.answersAwaitingQuestion.splice(awaitingIdx, 1)
        matchedCount++
        console.log(`新习题匹配到待处理答案: 题${kp.questionNumber}`)
      } else if (!kp.hasAnswer) {
        // 没有答案，加入等待队列
        updatedContext.pending.exercisesAwaitingAnswer.push({
          id: kp.id,
          questionNumber: kp.questionNumber,
          title: kp.title,
        })
        console.log(`习题加入等待答案队列: 题${kp.questionNumber}`)
      }
    }
  }

  // 3. 限制队列大小
  if (updatedContext.pending.answersAwaitingQuestion.length > MAX_PENDING_ANSWERS) {
    updatedContext.pending.answersAwaitingQuestion =
      updatedContext.pending.answersAwaitingQuestion.slice(-MAX_PENDING_ANSWERS)
  }
  if (updatedContext.pending.exercisesAwaitingAnswer.length > MAX_PENDING_EXERCISES) {
    updatedContext.pending.exercisesAwaitingAnswer =
      updatedContext.pending.exercisesAwaitingAnswer.slice(-MAX_PENDING_EXERCISES)
  }

  return {
    updatedKps: updatedExistingKps,
    updatedContext,
    matchedCount,
    unmatchedAnswers: updatedContext.pending.answersAwaitingQuestion.length,
    unmatchedExercises: updatedContext.pending.exercisesAwaitingAnswer.length,
  }
}

// 更新学习上下文
export function updateLearningContext(
  context: LearningContext,
  updates: {
    pathChange?: string | null
    fragment?: string | null
    regionType?: string | null
    documentType?: LearningContext['documentType']
    newKnowledgePoints?: Array<{ id: string; title: string; type: KnowledgeType }>
  }
): LearningContext {
  const updated = { ...context }

  // 更新路径
  if (updates.pathChange) {
    updated.currentPath = [...context.currentPath, updates.pathChange]
    // 限制路径深度
    if (updated.currentPath.length > 5) {
      updated.currentPath = updated.currentPath.slice(-5)
    }
  }

  // 更新最近知识点摘要
  if (updates.newKnowledgePoints && updates.newKnowledgePoints.length > 0) {
    const newRecent = updates.newKnowledgePoints.slice(-10)
    updated.recentKnowledge = [
      ...context.recentKnowledge.slice(-10),
      ...newRecent,
    ].slice(-15) // 保留最近15个
  }

  // 更新片段
  if (updates.fragment !== undefined) {
    updated.pending = {
      ...updated.pending,
      fragment: updates.fragment,
    }
  }

  // 更新文档类型和区域类型
  if (updates.documentType) {
    updated.documentType = updates.documentType
  }
  if (updates.regionType) {
    updated.currentRegion = updates.regionType as LearningContext['currentRegion']
  }

  return updated
}

// 处理完成时清理上下文
export function finalizeLearningContext(context: LearningContext): LearningContext {
  if (context.pending.exercisesAwaitingAnswer.length > 0) {
    console.log(`处理完成，${context.pending.exercisesAwaitingAnswer.length} 道习题未找到答案`)
  }
  if (context.pending.answersAwaitingQuestion.length > 0) {
    console.log(`处理完成，${context.pending.answersAwaitingQuestion.length} 个答案未找到对应题目`)
  }

  return {
    ...context,
    pending: {
      ...context.pending,
      fragment: null,
    },
  }
}
