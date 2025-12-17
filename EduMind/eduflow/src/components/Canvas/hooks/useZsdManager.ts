// .zsd 文件管理 Hook
import { useRef, useCallback } from 'react'
import type { ZsdFileV3 } from '../../../services/zsd'
import { parseZsdV3 } from '../../../services/zsd'

export interface ZsdManagerResult {
  getZsdData: (appId: string) => ZsdFileV3 | undefined
  setZsdData: (appId: string, data: ZsdFileV3) => void
  deleteZsdData: (appId: string) => void
  hasZsdData: (appId: string) => boolean
  loadFromDisk: (appId: string, zsdPath: string) => Promise<ZsdFileV3 | null>
  saveToDisk: (zsdPath: string, data: ZsdFileV3) => Promise<boolean>
  clearAll: () => void
}

// 替换文件扩展名
export const replaceExt = (path: string, ext: string) =>
  path.replace(/\.[^/.\\]+$/, '') + ext

export function useZsdManager(): ZsdManagerResult {
  // 存储每个 app 的 .zsd V3 数据（包含原始内容）
  const zsdDataRef = useRef<Map<string, ZsdFileV3>>(new Map())

  const getZsdData = useCallback((appId: string): ZsdFileV3 | undefined => {
    return zsdDataRef.current.get(appId)
  }, [])

  const setZsdData = useCallback((appId: string, data: ZsdFileV3): void => {
    zsdDataRef.current.set(appId, data)
  }, [])

  const deleteZsdData = useCallback((appId: string): void => {
    zsdDataRef.current.delete(appId)
  }, [])

  const hasZsdData = useCallback((appId: string): boolean => {
    return zsdDataRef.current.has(appId)
  }, [])

  // 从磁盘加载 .zsd 文件
  const loadFromDisk = useCallback(async (
    appId: string,
    zsdPath: string
  ): Promise<ZsdFileV3 | null> => {
    try {
      const fs = await import('@tauri-apps/plugin-fs')
      const text = await fs.readTextFile(zsdPath)
      const zsdData = parseZsdV3(text)
      if (zsdData) {
        zsdDataRef.current.set(appId, zsdData)
        console.log('从磁盘加载 .zsd 数据成功:', zsdPath)
        return zsdData
      }
      return null
    } catch (e) {
      console.warn('从磁盘加载 .zsd 失败:', e)
      return null
    }
  }, [])

  // 保存 .zsd 到磁盘
  const saveToDisk = useCallback(async (
    zsdPath: string,
    data: ZsdFileV3
  ): Promise<boolean> => {
    try {
      const fs = await import('@tauri-apps/plugin-fs')
      await fs.writeTextFile(zsdPath, JSON.stringify(data, null, 2))
      console.log('已保存 .zsd 文件:', zsdPath)
      return true
    } catch (e) {
      console.warn('保存 .zsd 失败:', e)
      return false
    }
  }, [])

  // 清理所有数据（组件卸载时调用）
  const clearAll = useCallback((): void => {
    zsdDataRef.current.clear()
  }, [])

  return {
    getZsdData,
    setZsdData,
    deleteZsdData,
    hasZsdData,
    loadFromDisk,
    saveToDisk,
    clearAll,
  }
}
