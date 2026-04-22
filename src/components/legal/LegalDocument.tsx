import React from 'react'

interface LegalDocumentProps {
  markdown: string
}

export function LegalDocument({ markdown }: LegalDocumentProps) {
  const lines = markdown.split('\n')
  const blocks: React.ReactNode[] = []

  let list: string[] | null = null

  const flushList = (key: string) => {
    if (list && list.length > 0) {
      blocks.push(
        <ul
          key={`ul-${key}`}
          className="list-disc pl-6 my-3 space-y-1 text-[hsl(var(--muted-foreground))]"
        >
          {list.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>,
      )
    }
    list = null
  }

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim()
    if (line.startsWith('- ')) {
      if (!list) list = []
      list.push(line.slice(2))
      return
    }

    flushList(String(idx))

    if (!line) return

    if (line.startsWith('# ')) {
      blocks.push(
        <h1
          key={idx}
          className="text-2xl font-semibold text-[hsl(var(--foreground))] mt-6 mb-3"
        >
          {line.slice(2)}
        </h1>,
      )
    } else if (line.startsWith('## ')) {
      blocks.push(
        <h2
          key={idx}
          className="text-lg font-semibold text-[hsl(var(--foreground))] mt-5 mb-2"
        >
          {line.slice(3)}
        </h2>,
      )
    } else if (line.startsWith('### ')) {
      blocks.push(
        <h3
          key={idx}
          className="text-base font-semibold text-[hsl(var(--foreground))] mt-4 mb-2"
        >
          {line.slice(4)}
        </h3>,
      )
    } else {
      blocks.push(
        <p
          key={idx}
          className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))] my-2"
        >
          {renderInline(line)}
        </p>,
      )
    }
  })

  flushList('last')

  return <div className="prose-custom">{blocks}</div>
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let remaining = text
  let safety = 0

  while (remaining.length > 0 && safety++ < 200) {
    const bold = remaining.match(/\*\*([^*]+)\*\*/)
    const link = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/)
    const italic = remaining.match(/_([^_]+)_/)

    const candidates = [
      bold ? { m: bold, kind: 'bold' as const } : null,
      link ? { m: link, kind: 'link' as const } : null,
      italic ? { m: italic, kind: 'italic' as const } : null,
    ]
      .filter(
        (c): c is { m: RegExpMatchArray; kind: 'bold' | 'link' | 'italic' } => c !== null,
      )
      .sort((a, b) => (a.m.index ?? 0) - (b.m.index ?? 0))

    const first = candidates[0]
    if (!first) {
      parts.push(remaining)
      break
    }

    const idx = first.m.index ?? 0
    if (idx > 0) parts.push(remaining.slice(0, idx))

    if (first.kind === 'bold') {
      parts.push(
        <strong key={parts.length} className="text-[hsl(var(--foreground))]">
          {first.m[1]}
        </strong>,
      )
    } else if (first.kind === 'italic') {
      parts.push(
        <em key={parts.length} className="italic">
          {first.m[1]}
        </em>,
      )
    } else {
      parts.push(
        <a
          key={parts.length}
          href={first.m[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[hsl(var(--primary))] underline underline-offset-2 hover:opacity-80"
        >
          {first.m[1]}
        </a>,
      )
    }

    remaining = remaining.slice(idx + first.m[0].length)
  }

  return <>{parts}</>
}
