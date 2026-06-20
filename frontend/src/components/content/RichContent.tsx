interface RichContentProps {
  content: string
  compact?: boolean
}

function renderRichText(text: string): React.ReactNode[] {
  // Handle <e type="text_bold" title="..." /> and similar tags
  const parts: React.ReactNode[] = []
  const regex = /<e\s+type="([^"]+)"\s+title="([^"]*)"\s*\/>/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = regex.exec(text)) !== null) {
    // Text before the tag
    if (match.index > lastIndex) {
      parts.push(
        <span key={key++}>{text.slice(lastIndex, match.index)}</span>
      )
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
      case 'text_underline':
        parts.push(
          <u key={key++} className="underline text-gray-800 dark:text-gray-200">
            {title}
          </u>
        )
        break
      case 'text_strikethrough':
        parts.push(
          <s key={key++} className="line-through text-gray-500 dark:text-gray-400">
            {title}
          </s>
        )
        break
      case 'text_highlight':
        parts.push(
          <mark key={key++} className="bg-yellow-200/70 dark:bg-yellow-800/50 rounded px-0.5">
            {title}
          </mark>
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
      default:
        parts.push(
          <span key={key++} className="text-gray-700 dark:text-gray-300">
            {title || `[${type}]`}
          </span>
        )
    }

    lastIndex = match.index + match[0].length
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.slice(lastIndex)}</span>)
  }

  return parts.length > 0 ? parts : [<span key={0}>{text}</span>]
}

export default function RichContent({ content, compact = false }: RichContentProps) {
  return (
    <p className={`text-gray-700 dark:text-gray-300 whitespace-pre-wrap ${compact ? 'text-xs line-clamp-3' : 'text-sm'}`}>
      {renderRichText(content)}
    </p>
  )
}
