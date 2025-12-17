// 批次处理 Hook - 处理撕书机制的核心逻辑
import { useCallback } from 'react'
import { useAppStore, type AppItem, type LearningContext, type KnowledgePoint } from '../../../stores/appStore'
import { siliconflowChat, MODEL_IDS } from '../../../services/siliconflow'
import { extToMime, tryParseJsonObject } from '../../../services/fileUtils'
import { pdfPageToPngBase64 } from '../../../services/pdfToImage'
import { detectDocumentType, buildKnowledgePrompt, type DocType } from '../../../services/documentTypeDetector'
import { toKnowledgePoints, remapBatchIds } from '../../../services/knowledgeExtractor'
import {
  createDefaultLearningContext,
  processAnswerMatching,
  updateLearningContext,
  finalizeLearningContext,
} from '../../../services/learningContextManager'
import type { ZsdManagerResult } from './useZsdManager'
import { replaceExt } from './useZsdManager'

// 文本分块大小
const TEXT_CHUNK_SIZE = 3000

export interface BatchProcessorResult {
  runBatch: (appId: string) => Promise<void>
}

export function useBatchProcessor(zsdManager: ZsdManagerResult): BatchProcessorResult {
  const { updateApp } = useAppStore()

  const runBatch = useCallback(async (appId: string): Promise<void> => {
    const { settings } = useAppStore.getState()
    if (!settings.apiKey) {
      updateApp(appId, { status: 'pending', updatedAt: Date.now() })
      console.warn('未设置 API Key，跳过处理')
      return
    }

    const current = useAppStore.getState().apps.find((a) => a.id === appId)
    if (!current) return

    // 获取 .zsd V3 数据（如果内存中没有，尝试从磁盘加载）
    let zsdData = zsdManager.getZsdData(appId)
    if (!zsdData && current.sourceFile) {
      const zsdPath = replaceExt(current.sourceFile, '.zsd')
      zsdData = await zsdManager.loadFromDisk(appId, zsdPath) ?? undefined
    }
    if (!zsdData) {
      console.warn('未找到 .zsd 数据，无法处理。请重新拖入文件。')
      return
    }

    const { rawContent, originalFileType, originalFileName, totalSize } = zsdData
    let { processedOffset } = zsdData

    if (processedOffset >= totalSize) {
      updateApp(appId, { status: 'done', hasMore: false, updatedAt: Date.now() })
      return
    }

    const batchTarget = settings.batchKnowledgeCount ?? settings.initialKnowledgeCount
    const threadCount = settings.processingThreads || 1

    updateApp(appId, {
      status: 'processing',
      totalEstimate: batchTarget * threadCount,
      batchTarget: batchTarget * threadCount,
      batchProducedCount: 0,
      updatedAt: Date.now(),
    })

    try {
      const isText = originalFileType === 'txt' || originalFileType === 'md'
      const isPdf = originalFileType === 'pdf'
      const isImage = ['png', 'jpg', 'jpeg'].includes(originalFileType)

      const visionModel = settings.ocrModel === 'deepseek-ocr' ? MODEL_IDS.vision.ocr : MODEL_IDS.vision.qwenVl

      // OCR 单次调用
      const ocrOnce = async (mime: string, imageB64: string): Promise<string> => {
        const result = await siliconflowChat({
          apiKey: settings.apiKey,
          model: visionModel,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: `data:${mime};base64,${imageB64}` } },
                { type: 'text', text: '请用中文完整识别并输出图片中的所有文字内容，保持原有格式和结构。只输出识别结果，不要解释。' },
              ],
            },
          ],
        })

        // OCR 质量验证
        if (result.length < 10) {
          console.warn('OCR结果过短，可能识别失败:', result)
        }

        return result
      }

      // 读取一个块的内容
      const readOneChunk = async (offset: number): Promise<{ text: string; newOffset: number } | null> => {
        if (offset >= totalSize) return null

        if (isText) {
          const start = offset
          let end = Math.min(start + TEXT_CHUNK_SIZE, totalSize)

          // 智能断句
          if (end < totalSize) {
            const chunk = rawContent.slice(start, end)
            const lastNewline = chunk.lastIndexOf('\n\n')
            if (lastNewline > TEXT_CHUNK_SIZE * 0.5) {
              end = start + lastNewline + 2
            } else {
              const lastPeriod = chunk.lastIndexOf('。')
              if (lastPeriod > TEXT_CHUNK_SIZE * 0.5) {
                end = start + lastPeriod + 1
              }
            }
          }

          return { text: rawContent.slice(start, end), newOffset: end }
        }

        if (isPdf) {
          const pdfBytes = Uint8Array.from(atob(rawContent), c => c.charCodeAt(0))
          const pageNo = offset + 1
          if (pageNo > totalSize) return null
          const imageB64 = await pdfPageToPngBase64(pdfBytes, pageNo)
          const ocrText = await ocrOnce('image/png', imageB64)
          return { text: ocrText, newOffset: pageNo }
        }

        if (isImage) {
          if (offset >= 1) return null
          const mime = extToMime(originalFileType)
          const ocrText = await ocrOnce(mime, rawContent)
          return { text: ocrText, newOffset: 1 }
        }

        return null
      }

      // 选择文本模型
      const textModel = (settings.deepThinking || settings.textModel === 'deepseek-r1')
        ? MODEL_IDS.text.r1
        : MODEL_IDS.text.v3

      // 获取当前学习上下文
      let learningContext: LearningContext = current.learningContext || createDefaultLearningContext()

      // 用于存储检测到的文档类型（优先使用已保存的类型）
      let detectedDocType: DocType | null = learningContext.documentType

      // 提取知识点并返回完整 AI 响应
      const extractKnowledge = async (text: string, ctx: LearningContext): Promise<{
        kps: KnowledgePoint[]
        pathChange: string | null
        fragment: string | null
        matchedAnswers: Array<{ questionNumber: string; answer: string }>
        regionType: string | null
      }> => {
        // 如果有未完成的片段，拼接到文本开头
        let processText = text
        if (ctx.pending.fragment) {
          processText = ctx.pending.fragment + '\n' + text
          console.log('拼接上次未完成的片段:', ctx.pending.fragment.substring(0, 100))
        }

        // 如果还没有检测文档类型，先检测
        if (!detectedDocType) {
          detectedDocType = detectDocumentType(processText, originalFileName)
          console.log(`检测到文档类型: ${detectedDocType}，文件: ${originalFileName}`)
        }

        const prompt = buildKnowledgePrompt(batchTarget, detectedDocType, ctx)
        const kpRaw = await siliconflowChat({
          apiKey: settings.apiKey,
          model: textModel,
          messages: [
            { role: 'system', content: '你是知识元提取专家。必须严格输出 JSON，不要输出 Markdown 代码块或其他多余文字。' },
            { role: 'user', content: prompt + `\n\n[文件名]\n${originalFileName}\n\n[待处理文本开始]\n${processText}\n[待处理文本结束]` },
          ],
          maxTokens: 8000,
        })

        const parsed = tryParseJsonObject(kpRaw)
        if (!parsed) {
          console.warn('知识元提取失败，AI 返回内容无法解析为 JSON:', kpRaw.substring(0, 500))
          return { kps: [], pathChange: null, fragment: null, matchedAnswers: [], regionType: null }
        }

        return {
          kps: toKnowledgePoints(parsed),
          pathChange: typeof parsed.pathChange === 'string' ? parsed.pathChange : null,
          fragment: typeof parsed.fragment === 'string' && parsed.fragment.trim() ? parsed.fragment : null,
          matchedAnswers: Array.isArray(parsed.matchedAnswers) ? parsed.matchedAnswers : [],
          regionType: typeof parsed.regionType === 'string' ? parsed.regionType : null,
        }
      }

      // 根据线程数处理
      type TaskResult = {
        text: string
        newOffset: number
        kps: KnowledgePoint[]
        pathChange: string | null
        fragment: string | null
        matchedAnswers: Array<{ questionNumber: string; answer: string }>
        regionType: string | null
      }
      const tasks: Promise<TaskResult>[] = []
      let currentOffset = processedOffset

      for (let i = 0; i < threadCount; i++) {
        if (currentOffset >= totalSize) break

        const offsetForThisTask = currentOffset
        // 预估下一个偏移量（用于并行启动）
        if (isText) {
          currentOffset = Math.min(currentOffset + TEXT_CHUNK_SIZE, totalSize)
        } else if (isPdf) {
          currentOffset = currentOffset + 1
        } else {
          currentOffset = 1
        }

        // 注意：多线程时只有第一个线程使用 fragment 拼接
        const ctxForTask = i === 0 ? learningContext : {
          ...learningContext,
          pending: { ...learningContext.pending, fragment: null }
        }

        tasks.push(
          (async () => {
            const chunk = await readOneChunk(offsetForThisTask)
            if (!chunk) return {
              text: '', newOffset: offsetForThisTask, kps: [],
              pathChange: null, fragment: null, matchedAnswers: [], regionType: null
            }
            const result = await extractKnowledge(chunk.text, ctxForTask)
            return { text: chunk.text, newOffset: chunk.newOffset, ...result }
          })()
        )
      }

      // 并行执行所有任务
      const results = await Promise.all(tasks)

      // 计算最终偏移量（取最大值）
      let finalOffset = processedOffset
      let allKps: KnowledgePoint[] = []
      let lastFragment: string | null = null
      let lastPathChange: string | null = null
      let lastRegionType: string | null = null
      let allMatchedAnswers: Array<{ questionNumber: string; answer: string }> = []

      results.forEach((result, idx) => {
        if (result.newOffset > finalOffset) {
          finalOffset = result.newOffset
        }
        // 为每个线程的知识点添加线程标识
        const remappedKps = result.kps.map(kp => ({
          ...kp,
          id: `t${idx}_${kp.id}`,
        }))
        allKps = [...allKps, ...remappedKps]

        // 收集上下文更新信息（取最后一个有效的）
        if (result.fragment) lastFragment = result.fragment
        if (result.pathChange) lastPathChange = result.pathChange
        if (result.regionType) lastRegionType = result.regionType
        if (result.matchedAnswers.length > 0) {
          allMatchedAnswers = [...allMatchedAnswers, ...result.matchedAnswers]
        }
      })

      // 更新进度
      updateApp(appId, {
        contentCursor: finalOffset,
        contentTotal: totalSize,
        hasMore: finalOffset < totalSize,
        updatedAt: Date.now(),
      })

      // 合并知识点
      const latest = useAppStore.getState().apps.find((a) => a.id === appId)
      if (!latest) return

      const nextBatchIndex = (latest.batchIndex || 0) + 1
      const remapped = remapBatchIds(nextBatchIndex, allKps)

      // 使用新的答案匹配服务
      const existingKps = [...(latest.knowledgePoints || [])]
      const matchResult = processAnswerMatching(
        existingKps,
        remapped,
        allMatchedAnswers,
        learningContext
      )

      // 更新学习上下文
      learningContext = updateLearningContext(matchResult.updatedContext, {
        pathChange: lastPathChange,
        fragment: lastFragment,
        regionType: lastRegionType,
        documentType: detectedDocType,
        newKnowledgePoints: remapped.map(kp => ({
          id: kp.id,
          title: kp.title,
          type: kp.type,
        })),
      })

      const merged = [...matchResult.updatedKps, ...remapped]
      const hasMore = finalOffset < totalSize
      const done = !hasMore

      // 如果处理完成，清理上下文
      if (done) {
        learningContext = finalizeLearningContext(learningContext)
      }

      // 更新 app 状态
      const updated: Partial<AppItem> = {
        knowledgePoints: merged,
        processedCount: merged.length,
        batchIndex: nextBatchIndex,
        batchTarget: batchTarget * threadCount,
        batchProducedCount: remapped.length,
        totalEstimate: batchTarget * threadCount,
        contentCursor: finalOffset,
        contentTotal: totalSize,
        hasMore,
        status: done ? 'done' : 'pending',
        learningContext,
        updatedAt: Date.now(),
      }
      updateApp(appId, updated)

      // 更新 .zsd 数据
      zsdData.processedOffset = finalOffset
      zsdData.app = { ...latest, ...updated } as AppItem
      zsdManager.setZsdData(appId, zsdData)

      // 保存 .zsd 到磁盘
      if (current.sourceFile && /^[a-zA-Z]:\\/.test(current.sourceFile)) {
        const zsdPath = replaceExt(current.sourceFile, '.zsd')
        await zsdManager.saveToDisk(zsdPath, zsdData)
      }
    } catch (err) {
      console.error('处理失败:', err)
      updateApp(appId, {
        status: 'pending',
        batchProducedCount: 0,
        updatedAt: Date.now(),
      })
    }
  }, [updateApp, zsdManager])

  return { runBatch }
}
