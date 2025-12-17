// 文件处理 Hook - 处理文件拖拽和转换
import { useRef, useCallback } from 'react'
import { useAppStore } from '../../../stores/appStore'
import type { ZsdFileV3 } from '../../../services/zsd'
import { parseZsd, parseZsdV3, createInitialZsdV3 } from '../../../services/zsd'
import { fileToBase64, fileToText, uint8ToBase64 } from '../../../services/fileUtils'
import { getPdfPageCount } from '../../../services/pdfToImage'
import type { ZsdManagerResult } from './useZsdManager'
import { replaceExt } from './useZsdManager'

// 支持的文件类型
const SUPPORTED_TYPES = ['txt', 'md', 'pdf', 'png', 'jpg', 'jpeg', 'zsd']

// 文件源类型
export type DroppedSource =
  | { kind: 'path'; path: string }
  | { kind: 'file'; file: File }

// 从路径提取文件名
export const getFileNameFromPath = (path: string) => path.replace(/^.*[\\/]/, '')

// 归一化源路径（用于去重）
export const normalizeSourceKey = (value: string) => value.replace(/\//g, '\\').toLowerCase()

export interface FileProcessorResult {
  addIfNew: (fileName: string, sourceFile: string, source?: DroppedSource) => Promise<void>
  isSupported: (fileName: string) => boolean
}

// 将任意文件转换为 .zsd V3 格式（不调用 AI）
async function convertFileToZsdV3(
  fileName: string,
  source: DroppedSource
): Promise<ZsdFileV3 | null> {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  if (!SUPPORTED_TYPES.includes(ext) || ext === 'zsd') return null

  const fileType = ext as ZsdFileV3['originalFileType']
  let rawContent = ''
  let totalSize = 0

  try {
    if (ext === 'txt' || ext === 'md') {
      // 文本文件：直接存原文
      if (source.kind === 'file') {
        rawContent = await fileToText(source.file)
      } else {
        const fs = await import('@tauri-apps/plugin-fs')
        rawContent = await fs.readTextFile(source.path)
      }
      totalSize = rawContent.length
    } else if (ext === 'pdf') {
      // PDF：存 base64，计算页数
      let pdfBytes: Uint8Array
      if (source.kind === 'file') {
        pdfBytes = new Uint8Array(await source.file.arrayBuffer())
      } else {
        const fs = await import('@tauri-apps/plugin-fs')
        pdfBytes = await fs.readFile(source.path)
      }
      rawContent = uint8ToBase64(pdfBytes)
      totalSize = await getPdfPageCount(pdfBytes)
    } else if (['png', 'jpg', 'jpeg'].includes(ext)) {
      // 图片：存 base64
      if (source.kind === 'file') {
        rawContent = await fileToBase64(source.file)
      } else {
        const fs = await import('@tauri-apps/plugin-fs')
        const bytes = await fs.readFile(source.path)
        rawContent = uint8ToBase64(bytes)
      }
      totalSize = 1
    }

    return createInitialZsdV3(rawContent, fileType, fileName, totalSize)
  } catch (e) {
    console.error('转换文件到 .zsd 失败:', e)
    return null
  }
}

export function useFileProcessor(zsdManager: ZsdManagerResult): FileProcessorResult {
  const { addApp } = useAppStore()
  const recentDropRef = useRef<Map<string, number>>(new Map())

  // 检查文件是否支持
  const isSupported = useCallback((fileName: string): boolean => {
    const ext = fileName.split('.').pop()?.toLowerCase() || ''
    return SUPPORTED_TYPES.includes(ext)
  }, [])

  // 添加新文件（如果尚不存在）
  const addIfNew = useCallback(async (
    fileName: string,
    sourceFile: string,
    source?: DroppedSource
  ): Promise<void> => {
    const ext = fileName.split('.').pop()?.toLowerCase() || ''
    if (!SUPPORTED_TYPES.includes(ext)) return

    const now = Date.now()
    const key = normalizeSourceKey(sourceFile)

    // 清理旧记录（避免 Map 无限增长）
    for (const [k, t] of recentDropRef.current) {
      if (now - t > 2000) recentDropRef.current.delete(k)
    }

    // 同一次/短时间重复 drop 的去重
    if (recentDropRef.current.has(key)) return
    recentDropRef.current.set(key, now)

    // 已存在同源文件则不重复创建
    const existing = useAppStore.getState().apps
    if (existing.some((a) => normalizeSourceKey(a.sourceFile) === key)) return

    const droppedSource: DroppedSource = source ?? { kind: 'path', path: sourceFile }

    // 处理 .zsd 文件：直接加载
    if (ext === 'zsd') {
      try {
        let text = ''
        if (droppedSource.kind === 'file') {
          text = await droppedSource.file.text()
        } else {
          const fs = await import('@tauri-apps/plugin-fs')
          text = await fs.readTextFile(droppedSource.path)
        }

        // 尝试解析为 V3
        const v3Data = parseZsdV3(text)
        if (v3Data) {
          const app = v3Data.app
          app.sourceFile = sourceFile
          addApp(app)
          zsdManager.setZsdData(app.id, v3Data)
        } else {
          // 旧版本 .zsd，兼容处理
          const app = parseZsd(text)
          app.sourceFile = sourceFile
          addApp(app)
        }
      } catch (e) {
        console.error('加载 .zsd 失败:', e)
      }
      return
    }

    // 非 .zsd 文件：转换为 .zsd V3（不调用 AI）
    const zsdData = await convertFileToZsdV3(fileName, droppedSource)
    if (!zsdData) return

    const app = zsdData.app
    app.sourceFile = sourceFile
    addApp(app)
    zsdManager.setZsdData(app.id, zsdData)

    // 保存 .zsd 文件到磁盘
    if (droppedSource.kind === 'path' && /^[a-zA-Z]:\\/.test(sourceFile)) {
      const zsdPath = replaceExt(sourceFile, '.zsd')
      await zsdManager.saveToDisk(zsdPath, zsdData)
    }
  }, [addApp, zsdManager])

  return {
    addIfNew,
    isSupported,
  }
}
