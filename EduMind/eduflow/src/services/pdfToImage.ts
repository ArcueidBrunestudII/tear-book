import { uint8ToBase64 } from './fileUtils'

async function loadPdf(pdfBytes: Uint8Array): Promise<any> {
  // 动态 import 避免 dev 启动时就加载大依赖
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')

  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    // 使用同包内 worker
    const workerUrl = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString()
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  }

  const loadingTask = pdfjs.getDocument({ data: pdfBytes })
  return loadingTask.promise
}

export async function getPdfPageCount(pdfBytes: Uint8Array): Promise<number> {
  const pdf = await loadPdf(pdfBytes)
  const count = Number(pdf?.numPages ?? 0) || 0
  // 清理 PDF 文档
  try {
    await pdf.destroy()
  } catch {
    // 忽略清理错误
  }
  return count
}

// 将 PDF 的指定页渲染为 PNG base64（不含 data: 前缀）
export async function pdfPageToPngBase64(pdfBytes: Uint8Array, pageNumber: number): Promise<string> {
  const pdf = await loadPdf(pdfBytes)
  const page = await pdf.getPage(pageNumber)

  const viewport = page.getViewport({ scale: 1.5 })
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 不可用')

  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)

  try {
    await page.render({ canvasContext: ctx, viewport }).promise

    const dataUrl = canvas.toDataURL('image/png')
    const comma = dataUrl.indexOf(',')
    const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : ''
    if (!b64) {
      // 回退：手动编码
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b as Blob), 'image/png'))
      const buf = new Uint8Array(await blob.arrayBuffer())
      return uint8ToBase64(buf)
    }

    return b64
  } finally {
    // 清理 Canvas 内存（重要：防止内存泄漏）
    canvas.width = 0
    canvas.height = 0

    // 清理 PDF 页面和文档
    try {
      page.cleanup()
    } catch {
      // 忽略清理错误
    }
    try {
      await pdf.destroy()
    } catch {
      // 忽略清理错误
    }
  }
}

// 兼容旧调用：默认渲染第一页
export async function pdfFirstPageToPngBase64(pdfBytes: Uint8Array): Promise<string> {
  return pdfPageToPngBase64(pdfBytes, 1)
}
