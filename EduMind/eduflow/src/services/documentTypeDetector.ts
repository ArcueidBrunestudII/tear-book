// 文档类型检测服务
import type { LearningContext } from '../stores/appStore'

export type DocType = 'exercises' | 'textbook' | 'paper' | 'general'

// 智能识别文档类型
export function detectDocumentType(text: string, fileName: string): DocType {
  const lowerName = fileName.toLowerCase()

  // 习题集特征：题号模式
  const exercisePatterns = [
    /^[\s]*[1-9]\d*[\.、．]\s*/m,  // 1. 2. 3. 或 1、2、3、
    /^[\s]*[一二三四五六七八九十]+[\.、．]\s*/m,  // 一、二、三、
    /^[\s]*[\(（][1-9]\d*[\)）]/m,  // (1) (2) (3)
    /^[\s]*[A-Za-z][\.、．]\s*/m,  // A. B. C.
    /选择题|填空题|计算题|简答题|证明题|判断题/,
    /答案[:：]|解[:：]|解答[:：]/,
  ]

  // 教材特征
  const textbookPatterns = [
    /定理\s*[\d\.]+/,
    /引理\s*[\d\.]+/,
    /推论\s*[\d\.]+/,
    /定义\s*[\d\.]+/,
    /公理\s*[\d\.]+/,
    /第[一二三四五六七八九十\d]+章/,
    /证明[:：\s]/,
  ]

  // 论文特征
  const paperPatterns = [
    /摘要|abstract/i,
    /关键词|keywords/i,
    /参考文献|references/i,
    /结论|conclusion/i,
  ]

  // 文件名提示
  if (/习题|练习|作业|试卷|考试|test|exam|exercise/i.test(lowerName)) {
    return 'exercises'
  }

  // 按模式匹配计分（提高阈值到4，减少误判）
  let exerciseScore = 0
  let textbookScore = 0
  let paperScore = 0

  exercisePatterns.forEach(p => { if (p.test(text)) exerciseScore++ })
  textbookPatterns.forEach(p => { if (p.test(text)) textbookScore++ })
  paperPatterns.forEach(p => { if (p.test(text)) paperScore++ })

  // 提高阈值到3（原来是2）
  if (exerciseScore >= 3) return 'exercises'
  if (textbookScore >= 3) return 'textbook'
  if (paperScore >= 3) return 'paper'

  return 'general'
}

// 根据文档类型生成对应的提取 prompt（支持学习上下文）
export function buildKnowledgePrompt(
  count: number,
  docType: DocType = 'general',
  context?: LearningContext
): string {
  // 构建上下文信息
  let contextSection = ''
  if (context) {
    const parts: string[] = []

    // 当前位置
    if (context.currentPath.length > 0) {
      parts.push(`当前位置：${context.currentPath.join(' > ')}`)
    }

    // 最近知识点
    if (context.recentKnowledge.length > 0) {
      const recentStr = context.recentKnowledge
        .slice(-5)  // 只取最近5个
        .map(k => `[${k.type}] ${k.title}`)
        .join('、')
      parts.push(`最近提取的知识点：${recentStr}`)
    }

    // 未完成的片段
    if (context.pending.fragment) {
      parts.push(`[重要] 上一页末尾有未完成的内容，请先处理：\n"${context.pending.fragment}"`)
    }

    // 等待答案的习题
    if (context.pending.exercisesAwaitingAnswer.length > 0) {
      const awaitingStr = context.pending.exercisesAwaitingAnswer
        .map(e => `题${e.questionNumber}: ${e.title}`)
        .join('、')
      parts.push(`以下习题正在等待答案匹配：${awaitingStr}`)
    }

    if (parts.length > 0) {
      contextSection = '\n[学习上下文]\n' + parts.join('\n') + '\n'
    }
  }

  const outputFormat = `
输出必须是严格 JSON（不要 Markdown 代码块），格式如下：
{
  "knowledgePoints": [
    {
      "id": "1",
      "title": "简短标题（20字以内，用于目录显示）",
      "content": "完整内容（题目+选项+答案 或 定理+证明）",
      "type": "exercise|concept|theorem|example|other",
      "level": 0,
      "parentId": null,
      "children": ["2"],
      "hasAnswer": true,
      "answer": "答案内容（如果是习题且有答案）",
      "questionNumber": "1.1（题号，用于后续答案匹配）"
    }
  ],
  "pathChange": "进入新章节名称（如果层级变化）或 null",
  "fragment": "本页末尾不完整的内容（如半道题），下次处理时会拼接",
  "matchedAnswers": [
    {"questionNumber": "1.1", "answer": "匹配到的答案"}
  ],
  "regionType": "content|exercises|answers|toc|appendix"
}`

  const commonRules = [
    '',
    '要求：',
    '- title: 简短标题，20字以内，用于目录显示',
    '- content: 完整内容，保留原文的完整表述，包含公式请用 LaTeX 格式（$..$ 或 $$..$$）',
    '- type: 知识点类型（concept=概念, theorem=定理, example=例题, exercise=习题, other=其他）',
    '- level: 层级从 0 开始',
    '- hasAnswer: 习题是否有答案，没有则为 false',
    '- answer: 如果是习题且答案在当前内容中，填入答案',
    '- questionNumber: 习题的题号（如 "1", "2.3", "一"），用于后续答案匹配',
    '- fragment: 如果本页末尾有不完整的内容（如题目被截断），放入此字段',
    '- matchedAnswers: 如果发现本页是答案区，尝试匹配之前的习题',
    '',
    '重要：',
    '- 禁止编造/补全不存在的内容',
    '- 如果内容不足以支撑足够数量，请只输出实际识别到的条目',
    '- 必须过滤掉垃圾内容：页眉页脚、页码、插图说明（如"图X.X"）、目录索引、版权信息',
    '- 如果上下文中有未完成的片段，先将其与本页开头拼接成完整内容',
  ]

  if (docType === 'exercises') {
    return [
      '你是知识元提取专家。当前文档是【习题集/练习题】类型。',
      contextSection,
      '【核心原则】一道完整的题目 = 一个知识元。绝对不能把一道题拆成多个知识元！',
      '',
      `请从文本中提取最多 ${count} 道完整的题目作为知识元。`,
      '',
      '【题目识别规则】',
      '- 识别题号标记：1. 2. 3. 或 (1) (2) (3) 或 一、二、三、等',
      '- 一个知识元必须包含：完整的题干 + 所有选项（如果是选择题）+ 答案（如果有）',
      '- 题目的答案、解析如果紧跟在题目后面，必须和题目合并为同一个知识元',
      '- 同一道大题的多个小问，整体作为一个知识元',
      '- 如果题目在本页不完整（如题干被截断），放入 fragment 字段',
      '- 如果发现这是答案区（只有答案没有题目），识别题号并填入 matchedAnswers',
      outputFormat,
      ...commonRules,
    ].join('\n')
  }

  if (docType === 'textbook') {
    return [
      '你是知识元提取专家。当前文档是【教材/教科书】类型。',
      contextSection,
      '【核心原则】一个定理/定义/概念/公式 = 一个知识元。保持知识的完整性！',
      '',
      `请从文本中提取最多 ${count} 个知识元。`,
      '',
      '【知识元识别规则】',
      '- 定理（type=theorem）：包含定理描述 + 完整证明（如果有）',
      '- 定义/概念（type=concept）：包含定义内容 + 解释说明',
      '- 例题（type=example）：包含题目 + 解答过程',
      '- 习题（type=exercise）：题目内容，标记题号，答案可能在后面',
      '',
      '【层级规则】',
      '- level 0：章节标题、核心定理',
      '- level 1：重要概念、推论',
      '- level 2：具体细节、例子',
      outputFormat,
      ...commonRules,
    ].join('\n')
  }

  if (docType === 'paper') {
    return [
      '你是知识元提取专家。当前文档是【学术论文】类型。',
      contextSection,
      '【核心原则】一个核心论点/方法/结论 = 一个知识元。',
      '',
      `请从文本中提取最多 ${count} 个知识元。`,
      '',
      '【知识元识别规则】',
      '- 研究问题（type=concept）：论文要解决的核心问题',
      '- 方法创新（type=theorem）：提出的新方法或改进',
      '- 实验结论（type=other）：关键实验结果和发现',
      '',
      '【过滤规则】',
      '- 跳过：作者信息、致谢、参考文献列表',
      '- 保留：摘要、方法描述、实验设计、结论分析',
      outputFormat,
      ...commonRules,
    ].join('\n')
  }

  // 通用类型
  return [
    '你是知识元提取专家。',
    contextSection,
    '【核心原则】知识元 = 一个完整的、可独立理解的知识单位。',
    '- 知识元不是"每一句话"',
    '- 知识元不是"每一个段落"',
    '- 知识元是"一个完整的知识点"：可能包含多个句子、段落',
    '',
    `请从文本中提取最多 ${count} 个知识元。`,
    '',
    '【识别规则】',
    '- 如果是题目（type=exercise）：完整的题目+选项+答案 = 1个知识元',
    '- 如果是定理（type=theorem）：定理内容+证明 = 1个知识元',
    '- 如果是概念（type=concept）：概念定义+解释+例子 = 1个知识元',
    '- 如果是操作步骤（type=other）：完整的步骤序列 = 1个知识元',
    outputFormat,
    ...commonRules,
  ].join('\n')
}
