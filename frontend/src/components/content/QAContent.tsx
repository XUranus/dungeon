import RichContent from './RichContent'

interface QAPart {
  type: 'question' | 'answer'
  author: string
  text: string
}

function parseQA(content: string): QAPart[] {
  const parts: QAPart[] = []
  // Match [提问] or [回答] with optional author (handles both "[提问] name:" and "[提问]:")
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
    parts.push({
      type: matches[i].type,
      author: matches[i].author,
      text: content.slice(start, end).trim(),
    })
  }

  return parts
}

interface QAContentProps {
  content: string
  compact?: boolean
}

export default function QAContent({ content, compact = false }: QAContentProps) {
  const parts = parseQA(content)

  if (parts.length === 1 && parts[0].author === '' && !compact) {
    return <RichContent content={content} />
  }

  return (
    <div className="space-y-3">
      {parts.map((part, idx) => (
        <div
          key={idx}
          className={`rounded-lg p-3 ${
            part.type === 'question'
              ? 'bg-amber-50/60 dark:bg-amber-900/10 border-l-3 border-amber-300 dark:border-amber-600'
              : 'bg-neutral-50 dark:bg-neutral-800/30 border-l-3 border-neutral-300 dark:border-neutral-600'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
              part.type === 'question'
                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
            }`}>
              {part.type === 'question' ? '提问' : '回答'}
            </span>
            {part.author && (
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                {part.author}
              </span>
            )}
          </div>
          {compact ? (
            <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap line-clamp-3">
              {part.text}
            </p>
          ) : (
            <RichContent content={part.text} />
          )}
        </div>
      ))}
    </div>
  )
}
