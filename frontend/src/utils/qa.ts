export interface QAPart {
  type: 'question' | 'answer'
  author: string
  text: string
}

/**
 * Parse content with [提问]/[回答] markers into structured parts.
 * Used by both QAContent (full view) and DashboardPage (preview).
 */
export function parseQA(content: string): QAPart[] {
  const parts: QAPart[] = []
  const regex = /\[(提问|回答)]\s*(?:([^\n:：]+?)\s*[:：])?\s*/g
  const matches: { type: 'question' | 'answer'; author: string; index: number; endOfHeader: number }[] = []

  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    matches.push({
      type: match[1] === '提问' ? 'question' : 'answer',
      author: (match[2] || '').trim(),
      index: match.index,
      endOfHeader: match.index + match[0].length,
    })
  }

  if (matches.length === 0) {
    return [{ type: 'answer', author: '', text: content }]
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].endOfHeader
    const end = i + 1 < matches.length ? matches[i + 1].index : content.length
    const text = content.slice(start, end).replace(/^[:：\s]+/, '').trim()
    if (text) parts.push({ type: matches[i].type, author: matches[i].author, text })
  }

  return parts
}
