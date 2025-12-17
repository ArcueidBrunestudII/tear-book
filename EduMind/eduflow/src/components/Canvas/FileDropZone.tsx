// 文件拖拽区域组件
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { FileProcessorResult } from './hooks/useFileProcessor'
import { getFileNameFromPath, normalizeSourceKey } from './hooks/useFileProcessor'

interface FileDropZoneProps {
  fileProcessor: FileProcessorResult
  children: React.ReactNode
}

export function FileDropZone({ fileProcessor, children }: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)

  // 处理文件拖拽：Tauri 用原生窗口拖拽事件；浏览器环境回退 DOM 事件
  useEffect(() => {
    let unlistenTauri: null | (() => void) = null
    let removeDomListeners: null | (() => void) = null
    let disposed = false

    const setupDomListeners = () => {
      const handleDragOver = (e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(true)
      }

      const handleDragLeave = (e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.relatedTarget === null) setIsDragging(false)
      }

      const handleDrop = (e: DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)

        const files = e.dataTransfer?.files
        if (!files) return

        Array.from(files).forEach((file) => {
          fileProcessor.addIfNew(file.name, file.name, { kind: 'file', file })
        })
      }

      document.addEventListener('dragover', handleDragOver)
      document.addEventListener('dragleave', handleDragLeave)
      document.addEventListener('drop', handleDrop)

      return () => {
        document.removeEventListener('dragover', handleDragOver)
        document.removeEventListener('dragleave', handleDragLeave)
        document.removeEventListener('drop', handleDrop)
      }
    }

    ;(async () => {
      try {
        const windowApi = await import('@tauri-apps/api/window')
        const appWindow = windowApi.getCurrentWindow()

        unlistenTauri = await appWindow.onDragDropEvent((event: any) => {
          const payload = event?.payload ?? event
          const type = payload?.type

          if (type === 'enter' || type === 'over') {
            if (!disposed) setIsDragging(true)
            return
          }

          if (type === 'leave') {
            if (!disposed) setIsDragging(false)
            return
          }

          if (type === 'drop') {
            if (!disposed) setIsDragging(false)
            const raw = payload?.paths ?? payload?.path ?? []
            const paths: string[] = Array.isArray(raw) ? raw : [raw]
            if (paths.length === 0) return

            // 归一化去重（防止同一文件被重复上报）
            const uniqueByKey = new Map<string, string>()
            paths.forEach((p) => {
              if (typeof p !== 'string' || !p) return
              const key = normalizeSourceKey(p)
              if (!uniqueByKey.has(key)) uniqueByKey.set(key, p)
            })

            uniqueByKey.forEach((originalPath) => {
              const fileName = getFileNameFromPath(originalPath)
              fileProcessor.addIfNew(fileName, originalPath, { kind: 'path', path: originalPath })
            })
          }
        })
      } catch {
        // 非 Tauri 环境（例如浏览器 dev 预览）
        removeDomListeners = setupDomListeners()
      }
    })()

    return () => {
      disposed = true
      if (unlistenTauri) unlistenTauri()
      if (removeDomListeners) removeDomListeners()
    }
  }, [fileProcessor])

  return (
    <div className={`canvas ${isDragging ? 'dragging' : ''}`}>
      {/* 拖拽提示 */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            className="drop-zone"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="drop-icon">📄</div>
            <p>释放文件开始处理</p>
            <span>支持 txt, md, pdf, png, jpg</span>
          </motion.div>
        )}
      </AnimatePresence>

      {children}
    </div>
  )
}
