// 数学公式渲染组件 - 支持 LaTeX 公式
import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import './MathText.css'

interface MathTextProps {
  children: string
  className?: string
}

// 渲染单个 LaTeX 公式
function renderLatex(latex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      errorColor: '#ef4444',
      trust: true,
      strict: false,
    })
  } catch (e) {
    console.warn('LaTeX 渲染失败:', latex, e)
    return `<span class="math-error" title="公式渲染失败">${latex}</span>`
  }
}

// 解析文本，分离普通文本和 LaTeX 公式
function parseContent(text: string): Array<{ type: 'text' | 'math-inline' | 'math-block'; content: string }> {
  const result: Array<{ type: 'text' | 'math-inline' | 'math-block'; content: string }> = []

  // 匹配 $$...$$ (块级) 和 $...$ (行内) 和 \[...\] \(...\)
  // 注意顺序：先匹配块级，再匹配行内
  const regex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[^\$\n]+?\$|\\\([\s\S]*?\\\))/g

  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    // 添加前面的普通文本
    if (match.index > lastIndex) {
      const textContent = text.slice(lastIndex, match.index)
      if (textContent) {
        result.push({ type: 'text', content: textContent })
      }
    }

    const matched = match[1]

    // 判断是块级还是行内
    if (matched.startsWith('$$') || matched.startsWith('\\[')) {
      // 块级公式
      let latex = matched
      if (matched.startsWith('$$')) {
        latex = matched.slice(2, -2)
      } else {
        latex = matched.slice(2, -2)
      }
      result.push({ type: 'math-block', content: latex.trim() })
    } else {
      // 行内公式
      let latex = matched
      if (matched.startsWith('$')) {
        latex = matched.slice(1, -1)
      } else {
        latex = matched.slice(2, -2)
      }
      result.push({ type: 'math-inline', content: latex.trim() })
    }

    lastIndex = match.index + matched.length
  }

  // 添加剩余的普通文本
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex)
    if (remaining) {
      result.push({ type: 'text', content: remaining })
    }
  }

  return result
}

export function MathText({ children, className = '' }: MathTextProps) {
  const rendered = useMemo(() => {
    if (!children) return ''

    const parts = parseContent(children)

    return parts.map((part, index) => {
      if (part.type === 'text') {
        // 普通文本：处理换行
        return part.content.split('\n').map((line, i, arr) => (
          <span key={`${index}-${i}`}>
            {line}
            {i < arr.length - 1 && <br />}
          </span>
        ))
      } else if (part.type === 'math-inline') {
        // 行内公式
        const html = renderLatex(part.content, false)
        return (
          <span
            key={index}
            className="math-inline"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )
      } else {
        // 块级公式
        const html = renderLatex(part.content, true)
        return (
          <div
            key={index}
            className="math-block"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )
      }
    })
  }, [children])

  return <div className={`math-text ${className}`}>{rendered}</div>
}

export default MathText
