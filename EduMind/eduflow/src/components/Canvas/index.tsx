// 主画布组件 - 重构后的入口文件
import { useEffect, useCallback } from 'react'
import { useAppStore } from '../../stores/appStore'
import { useZsdManager } from './hooks/useZsdManager'
import { useFileProcessor } from './hooks/useFileProcessor'
import { useBatchProcessor } from './hooks/useBatchProcessor'
import { FileDropZone } from './FileDropZone'
import { AppGrid } from './AppGrid'
import '../Canvas.css'

export function Canvas() {
  const { apps, removeApp } = useAppStore()

  // 初始化 hooks
  const zsdManager = useZsdManager()
  const fileProcessor = useFileProcessor(zsdManager)
  const batchProcessor = useBatchProcessor(zsdManager)

  // 组件卸载时清理 zsdData
  useEffect(() => {
    return () => {
      zsdManager.clearAll()
    }
  }, [zsdManager])

  // 处理删除应用（同时清理 zsdData）
  const handleRemoveApp = useCallback((appId: string) => {
    zsdManager.deleteZsdData(appId)
    removeApp(appId)
  }, [zsdManager, removeApp])

  // 处理下一批次
  const handleNextBatch = useCallback((appId: string) => {
    void batchProcessor.runBatch(appId)
  }, [batchProcessor])

  return (
    <FileDropZone fileProcessor={fileProcessor}>
      <AppGrid
        apps={apps}
        onNextBatch={handleNextBatch}
        onRemoveApp={handleRemoveApp}
      />
    </FileDropZone>
  )
}

// 导出所有子组件和 hooks，方便外部使用
export { FileDropZone } from './FileDropZone'
export { AppGrid } from './AppGrid'
export { useZsdManager } from './hooks/useZsdManager'
export { useFileProcessor } from './hooks/useFileProcessor'
export { useBatchProcessor } from './hooks/useBatchProcessor'
