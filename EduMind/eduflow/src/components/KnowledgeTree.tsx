// 知识点树形组件 - 支持级联选择和展开/折叠
// 性能优化版本：预构建索引，避免 O(n²) 复杂度
import { useState, useMemo, memo, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore, KnowledgePoint } from '../stores/appStore'
import { KnowledgeDetailModal } from './KnowledgeDetailModal'
import { MathText } from './MathText'
import './KnowledgeTree.css'

interface KnowledgeTreeProps {
  appId: string
}

// 预构建索引类型
interface TreeIndexes {
  parentMap: Map<string, string | undefined>
  childrenMap: Map<string, KnowledgePoint[]>
  descendantsCache: Map<string, Set<string>>
}

// 构建索引（O(n) 复杂度）
function buildTreeIndexes(knowledgePoints: KnowledgePoint[]): TreeIndexes {
  const parentMap = new Map<string, string | undefined>()
  const childrenMap = new Map<string, KnowledgePoint[]>()
  const descendantsCache = new Map<string, Set<string>>()

  // 第一遍：构建 parentMap 和 childrenMap
  knowledgePoints.forEach(kp => {
    parentMap.set(kp.id, kp.parentId)
    if (!childrenMap.has(kp.id)) {
      childrenMap.set(kp.id, [])
    }
    if (kp.parentId) {
      const siblings = childrenMap.get(kp.parentId) || []
      siblings.push(kp)
      childrenMap.set(kp.parentId, siblings)
    }
  })

  // 递归获取后代（带缓存）
  const getDescendantIds = (kpId: string): Set<string> => {
    if (descendantsCache.has(kpId)) {
      return descendantsCache.get(kpId)!
    }

    const result = new Set<string>()
    const children = childrenMap.get(kpId) || []
    children.forEach(child => {
      result.add(child.id)
      const childDescendants = getDescendantIds(child.id)
      childDescendants.forEach(id => result.add(id))
    })

    descendantsCache.set(kpId, result)
    return result
  }

  // 预计算所有节点的后代
  knowledgePoints.forEach(kp => {
    getDescendantIds(kp.id)
  })

  return { parentMap, childrenMap, descendantsCache }
}

// 计算选中状态（使用索引，O(1) 复杂度）
type SelectionState = 'none' | 'partial' | 'full'

function getSelectionStateWithIndex(
  kp: KnowledgePoint,
  allKps: KnowledgePoint[],
  indexes: TreeIndexes
): SelectionState {
  const children = indexes.childrenMap.get(kp.id) || []

  // 叶子节点
  if (children.length === 0) {
    return kp.selected ? 'full' : 'none'
  }

  // 非叶子节点：使用缓存的后代集合
  const descendantIds = indexes.descendantsCache.get(kp.id) || new Set()
  if (descendantIds.size === 0) {
    return kp.selected ? 'full' : 'none'
  }

  // 统计选中的后代数量
  let selectedCount = 0
  descendantIds.forEach(id => {
    const desc = allKps.find(k => k.id === id)
    if (desc?.selected) selectedCount++
  })

  if (selectedCount === 0 && !kp.selected) return 'none'
  if (selectedCount === descendantIds.size && kp.selected) return 'full'
  return 'partial'
}

// 三态复选框组件
const Checkbox = memo(function Checkbox({
  state,
  onChange
}: {
  state: SelectionState
  onChange: () => void
}) {
  return (
    <div
      className={`tree-checkbox ${state}`}
      onClick={(e) => {
        e.stopPropagation()
        onChange()
      }}
    >
      {state === 'full' && <span className="check-icon">✓</span>}
      {state === 'partial' && <span className="check-icon">−</span>}
    </div>
  )
})

// 树节点组件
interface TreeNodeProps {
  kp: KnowledgePoint
  appId: string
  allKps: KnowledgePoint[]
  indexes: TreeIndexes
  defaultExpanded: boolean
  onSelect: (kpId: string) => void
  onDoubleClick: (kp: KnowledgePoint) => void
}

const TreeNode = memo(function TreeNode({
  kp,
  appId,
  allKps,
  indexes,
  defaultExpanded,
  onSelect,
  onDoubleClick
}: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  // 使用索引获取子节点（O(1)）
  const children = indexes.childrenMap.get(kp.id) || []
  const hasChildren = children.length > 0
  const isLeaf = !hasChildren

  // 使用索引计算选中状态
  const selectionState = useMemo(
    () => getSelectionStateWithIndex(kp, allKps, indexes),
    [kp, allKps, indexes]
  )

  // 层级颜色
  const levelColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
  const levelColor = levelColors[kp.level % levelColors.length]

  return (
    <div className="tree-node">
      <div
        className={`tree-node-row ${isLeaf ? 'leaf' : ''} ${kp.selected ? 'selected' : ''}`}
        style={{ paddingLeft: kp.level * 20 + 8 }}
      >
        {/* 展开/折叠按钮 */}
        {hasChildren ? (
          <button
            className="expand-btn"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <motion.span
              animate={{ rotate: isExpanded ? 90 : 0 }}
              transition={{ duration: 0.15 }}
            >
              ▶
            </motion.span>
          </button>
        ) : (
          <span className="expand-placeholder" />
        )}

        {/* 复选框 */}
        <Checkbox state={selectionState} onChange={() => onSelect(kp.id)} />

        {/* 层级标记 */}
        <span
          className="level-indicator"
          style={{ backgroundColor: levelColor }}
        />

        {/* 类型标签 */}
        {kp.type && kp.type !== 'other' && (
          <span className={`type-tag type-${kp.type}`}>
            {kp.type === 'concept' && '概念'}
            {kp.type === 'theorem' && '定理'}
            {kp.type === 'example' && '例题'}
            {kp.type === 'exercise' && '习题'}
          </span>
        )}

        {/* 内容 - 使用 title 简短显示，支持公式渲染 */}
        <span
          className="tree-node-content"
          onDoubleClick={() => onDoubleClick(kp)}
          title="双击查看详细内容"
        >
          <MathText>{kp.title || kp.content.substring(0, 80)}</MathText>
        </span>

        {/* 无答案标记 */}
        {kp.type === 'exercise' && !kp.hasAnswer && (
          <span className="no-answer-badge" title="答案待匹配">?</span>
        )}

        {/* 层级徽章 */}
        {kp.level <= 2 && (
          <span className="level-badge" style={{ color: levelColor }}>
            L{kp.level + 1}
          </span>
        )}
      </div>

      {/* 子节点 */}
      <AnimatePresence>
        {isExpanded && hasChildren && (
          <motion.div
            className="tree-children"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {children.map(child => (
              <TreeNode
                key={child.id}
                kp={child}
                appId={appId}
                allKps={allKps}
                indexes={indexes}
                defaultExpanded={child.level < 2}
                onSelect={onSelect}
                onDoubleClick={onDoubleClick}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

// 主组件
export function KnowledgeTree({ appId }: KnowledgeTreeProps) {
  const { apps, toggleKnowledgeSelect } = useAppStore()
  const [detailKp, setDetailKp] = useState<KnowledgePoint | null>(null)

  const app = apps.find(a => a.id === appId)
  if (!app) return null

  // 预构建索引（O(n) 复杂度，只在知识点列表变化时重建）
  const indexes = useMemo(
    () => buildTreeIndexes(app.knowledgePoints),
    [app.knowledgePoints]
  )

  // 根节点（使用索引）
  const rootNodes = useMemo(
    () => app.knowledgePoints.filter(kp => !kp.parentId),
    [app.knowledgePoints]
  )

  const handleSelect = useCallback((kpId: string) => {
    toggleKnowledgeSelect(appId, kpId, true)
  }, [appId, toggleKnowledgeSelect])

  const handleDoubleClick = useCallback((kp: KnowledgePoint) => {
    setDetailKp(kp)
  }, [])

  return (
    <div className="knowledge-tree">
      {rootNodes.map(kp => (
        <TreeNode
          key={kp.id}
          kp={kp}
          appId={appId}
          allKps={app.knowledgePoints}
          indexes={indexes}
          defaultExpanded={kp.level < 2}
          onSelect={handleSelect}
          onDoubleClick={handleDoubleClick}
        />
      ))}

      {/* 详情弹窗 */}
      <AnimatePresence>
        {detailKp && (
          <KnowledgeDetailModal
            kp={detailKp}
            appId={appId}
            onClose={() => setDetailKp(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
