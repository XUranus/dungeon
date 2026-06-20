import { memo, useMemo, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { CopyButton } from './CopyButton'

interface MarkdownMessageProps {
  content: string
  isStreaming?: boolean
}

/* 通用组件 props：children + HTML 属性 */
type CProps = { children?: ReactNode; [key: string]: unknown }

function extractSources(content: string): { clean: string; sources: string[] } {
  const sources: string[] = []
  const clean = content.replace(/【来源:\s*(https?:\/\/[^\]】]+)】/g, (_match, url: string) => {
    if (!sources.includes(url)) sources.push(url)
    return ''
  })
  return { clean: clean.trim(), sources }
}

const markdownComponents: Record<string, (props: CProps) => ReactNode> = {
  table: ({ children, ...props }: CProps) => (
    <div className="my-2 overflow-x-auto">
      <table className="min-w-full border-collapse text-xs" {...props}>{children}</table>
    </div>
  ),
  thead: ({ children, ...props }: CProps) => (
    <thead className="bg-gray-50 dark:bg-neutral-800" {...props}>{children}</thead>
  ),
  th: ({ children, ...props }: CProps) => (
    <th className="border border-gray-200 dark:border-neutral-700 px-3 py-1.5 text-left font-semibold text-gray-700 dark:text-neutral-200" {...props}>{children}</th>
  ),
  td: ({ children, ...props }: CProps) => (
    <td className="border border-gray-200 dark:border-neutral-700 px-3 py-1.5 text-gray-600 dark:text-neutral-300" {...props}>{children}</td>
  ),
  h1: ({ children, ...props }: CProps) => (
    <h1 className="text-lg font-bold mt-4 mb-2 text-gray-900 dark:text-neutral-100" {...props}>{children}</h1>
  ),
  h2: ({ children, ...props }: CProps) => (
    <h2 className="text-base font-bold mt-3 mb-1.5 text-gray-900 dark:text-neutral-100" {...props}>{children}</h2>
  ),
  h3: ({ children, ...props }: CProps) => (
    <h3 className="text-sm font-bold mt-2 mb-1 text-gray-900 dark:text-neutral-100" {...props}>{children}</h3>
  ),
  ul: ({ children, ...props }: CProps) => (
    <ul className="list-disc list-inside my-1 space-y-0.5" {...props}>{children}</ul>
  ),
  ol: ({ children, ...props }: CProps) => (
    <ol className="list-decimal list-inside my-1 space-y-0.5" {...props}>{children}</ol>
  ),
  li: ({ children, ...props }: CProps) => (
    <li className="text-gray-700 dark:text-neutral-300 leading-relaxed" {...props}>{children}</li>
  ),
  p: ({ children, ...props }: CProps) => (
    <p className="my-1 leading-relaxed text-gray-800 dark:text-neutral-200" {...props}>{children}</p>
  ),
  strong: ({ children, ...props }: CProps) => (
    <strong className="font-semibold text-gray-900 dark:text-white" {...props}>{children}</strong>
  ),
  em: ({ children, ...props }: CProps) => (
    <em className="italic text-gray-600 dark:text-neutral-400" {...props}>{children}</em>
  ),
  a: ({ children, href, ...props }: CProps) => (
    <a
      href={href as string}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline"
      {...props}
    >{children}</a>
  ),
  blockquote: ({ children, ...props }: CProps) => (
    <blockquote
      className="border-l-3 border-blue-200 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/20 pl-3 pr-2 py-1.5 my-2 rounded-r text-gray-700 dark:text-neutral-300 italic"
      {...props}
    >{children}</blockquote>
  ),
  hr: ({ ...props }: CProps) => (
    <hr className="my-3 border-gray-200 dark:border-neutral-700" {...props} />
  ),
  code: ({ children, className, ...props }: CProps) => {
    const isInline = !className
    if (isInline) {
      return (
        <code
          className="bg-gray-100 dark:bg-neutral-800 text-gray-800 dark:text-neutral-200 px-1.5 py-0.5 rounded text-xs font-mono"
          {...props}
        >{children}</code>
      )
    }
    return (
      <div className="my-2">
        <pre className="bg-gray-100 dark:bg-neutral-800 rounded-lg p-3 overflow-x-auto border border-gray-200 dark:border-neutral-700">
          <code className="text-xs font-mono text-gray-800 dark:text-neutral-200" {...props}>{children}</code>
        </pre>
      </div>
    )
  },
}

export const MarkdownMessage = memo(function MarkdownMessage({
  content,
  isStreaming,
}: MarkdownMessageProps) {
  const markdownContent = useMemo(() => {
    const { clean, sources } = extractSources(content)
    return { text: clean, sources }
  }, [content])

  const displayText = markdownContent.text

  return (
    <div className="relative group">
      {isStreaming ? (
        <p className="leading-relaxed whitespace-pre-wrap text-gray-800 dark:text-neutral-200">{displayText}</p>
      ) : (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={markdownComponents}
        >
          {displayText}
        </ReactMarkdown>
      )}

      <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton text={content} />
      </div>
    </div>
  )
})
