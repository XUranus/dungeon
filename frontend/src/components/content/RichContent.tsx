import { useMemo } from 'react'

interface RichContentProps {
  content: string
  compact?: boolean
}

/**
 * 将包含标准 HTML 标签的文本渲染为 React 节点。
 * 支持: <strong>, <b>, <em>, <i>, <a href="...">, <br>
 * 对于其他标签直接输出文本。
 */
function renderHtmlContent(text: string): React.ReactNode[] {
  if (!text) return []

  const parts: React.ReactNode[] = []
  // 匹配: <strong>...</strong>, <b>...</b>, <em>...</em>, <i>...</i>,
  //        <a href="...">...</a>, <br>, <br/>, <br />
  const regex = /<(strong|b|em|i|a|br)\b([^>]*)>([\s\S]*?)<\/\1>|<(br)\s*\/?>/gi
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = regex.exec(text)) !== null) {
    // Text before the tag
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>)
    }

    const tag = (match[1] || match[4]).toLowerCase()
    const attrs = match[2] || ''
    const inner = match[3] || ''

    switch (tag) {
      case 'strong':
      case 'b':
        parts.push(
          <strong key={key++} className="font-semibold text-gray-900 dark:text-gray-100">
            {inner}
          </strong>
        )
        break
      case 'em':
      case 'i':
        parts.push(
          <em key={key++} className="italic text-gray-800 dark:text-gray-200">
            {inner}
          </em>
        )
        break
      case 'a': {
        const hrefMatch = attrs.match(/href="([^"]*)"/)
        const href = hrefMatch ? hrefMatch[1] : '#'
        parts.push(
          <a
            key={key++}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 dark:text-blue-400 hover:underline"
          >
            {inner || href}
          </a>
        )
        break
      }
      case 'br':
        parts.push(<br key={key++} />)
        break
      default:
        parts.push(<span key={key++}>{match[0]}</span>)
    }

    lastIndex = match.index + match[0].length
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>)
  }

  return parts.length > 0 ? parts : [<span key={0}>{text}</span>]
}

/**
 * 将包含旧 <e> 标签的文本渲染为 React 节点（向后兼容）。
 */
function renderLegacyETags(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const regex = /<e\s+type="([^"]+)"\s+title="([^"]*)"\s*\/>/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>)
    }

    const [, type, encodedTitle] = match
    const title = decodeURIComponent(encodedTitle || '')

    switch (type) {
      case 'text_bold':
        parts.push(
          <strong key={key++} className="font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </strong>
        )
        break
      case 'text_italic':
        parts.push(
          <em key={key++} className="italic text-gray-800 dark:text-gray-200">
            {title}
          </em>
        )
        break
      case 'hashtag':
        parts.push(
          <span key={key++} className="text-neutral-600 dark:text-neutral-300 font-medium cursor-pointer hover:underline">
            #{title}
          </span>
        )
        break
      case 'mention':
        parts.push(
          <span key={key++} className="text-neutral-500 dark:text-neutral-400 font-medium">
            @{title}
          </span>
        )
        break
      case 'web_url':
      case 'link':
      case 'web': {
        parts.push(
          <a
            key={key++}
            href={title}
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-600 dark:text-neutral-300 hover:underline"
          >
            {title}
          </a>
        )
        break
      }
      default:
        parts.push(
          <span key={key++} className="text-gray-700 dark:text-gray-300">
            {title || `[${type}]`}
          </span>
        )
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>)
  }

  return parts.length > 0 ? parts : [<span key={0}>{text}</span>]
}

/**
 * 检测文本是否包含标准 HTML 标签（<strong>, <a> 等）
 */
function hasHtmlTags(text: string): boolean {
  return /<(strong|b|em|i|a)\b/i.test(text)
}

/**
 * 检测文本是否包含旧版 <e> 标签
 */
function hasLegacyETags(text: string): boolean {
  return /<e\s+type="/.test(text)
}

export default function RichContent({ content, compact = false }: RichContentProps) {
  const rendered = useMemo(() => {
    if (!content) return []
    if (hasHtmlTags(content)) return renderHtmlContent(content)
    if (hasLegacyETags(content)) return renderLegacyETags(content)
    return null
  }, [content])

  if (!rendered) {
    // 纯文本，无需特殊渲染
    return (
      <p className={`text-gray-700 dark:text-gray-300 whitespace-pre-wrap ${compact ? 'text-xs line-clamp-3' : 'text-sm'}`}>
        {content}
      </p>
    )
  }

  if (compact) {
    return (
      <div className={`text-xs text-gray-700 dark:text-gray-300 line-clamp-3 leading-relaxed`}>
        {rendered}
      </div>
    )
  }

  return (
    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
      {rendered}
    </p>
  )
}
