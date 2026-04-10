import React, { useContext } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'
import { useDocWatch } from '../hooks/useDocWatch'
import { AgentStreamContext } from '../App'
import { commitFiles } from '../lib/api'

interface Props {
  docPath: string
}

function CodeBlock({ className, children }: { className?: string; children?: React.ReactNode }) {
  const lang = /language-(\w+)/.exec(className ?? '')?.[1] ?? ''
  const code = String(children).replace(/\n$/, '')
  let highlighted = code
  try {
    highlighted = lang ? hljs.highlight(code, { language: lang }).value : hljs.highlightAuto(code).value
  } catch { /* fallback to plain */ }

  return (
    <pre style={{ background: 'var(--color-background-code)', borderRadius: 'var(--radius-md)', padding: 12, overflowX: 'auto', margin: '8px 0' }}>
      <code dangerouslySetInnerHTML={{ __html: highlighted }} style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.5 }} />
    </pre>
  )
}

export default function DocPane({ docPath }: Props) {
  const { content, lastModified, isLoading } = useDocWatch(docPath)
  const filename = docPath ? docPath.split('/').pop() ?? docPath : ''

  function handleExport() {
    if (!content) return
    const blob = new Blob([content], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename || 'document.md'
    a.click()
  }

  async function handleCommit() {
    if (!filename) return
    try {
      await commitFiles(`Update ${filename}`)
    } catch { /* silently ignore if harness not connected */ }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-background-primary)' }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border-primary)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontWeight: 500, fontSize: 12, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {filename || 'Document'}
        </span>
        {lastModified && (
          <span style={{ fontSize: 10, color: 'var(--color-text-muted)', background: 'var(--color-background-tertiary)', padding: '1px 6px', borderRadius: 10 }}>
            {lastModified.toLocaleTimeString()}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={handleExport} disabled={!content}
            style={{ padding: '2px 8px', background: 'var(--color-background-tertiary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-sm)', opacity: content ? 1 : 0.4 }}>
            Export
          </button>
          <button onClick={handleCommit} disabled={!content}
            style={{ padding: '2px 8px', background: 'var(--color-background-tertiary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-primary)', borderRadius: 'var(--radius-sm)', opacity: content ? 1 : 0.4 }}>
            Git commit
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {isLoading && (
          <div style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>Loading…</div>
        )}
        {!isLoading && !content && (
          <div style={{ color: 'var(--color-text-muted)', fontSize: 13, textAlign: 'center', marginTop: 48 }}>
            No document open — use /create-prd to generate one
          </div>
        )}
        {content && (
          <div style={{ color: 'var(--color-text-primary)', lineHeight: 1.7 }}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code: ({ className, children }) => <CodeBlock className={className}>{children}</CodeBlock>,
                h1: ({ children }) => <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12, color: 'var(--color-text-primary)' }}>{children}</h1>,
                h2: ({ children }) => <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, marginTop: 20, color: 'var(--color-text-primary)' }}>{children}</h2>,
                h3: ({ children }) => <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, marginTop: 16, color: 'var(--color-text-primary)' }}>{children}</h3>,
                p: ({ children }) => <p style={{ marginBottom: 8, color: 'var(--color-text-primary)' }}>{children}</p>,
                li: ({ children }) => <li style={{ marginBottom: 4, color: 'var(--color-text-primary)' }}>{children}</li>,
                a: ({ href, children }) => <a href={href} style={{ color: 'var(--color-accent-purple)' }} target="_blank" rel="noreferrer">{children}</a>,
                blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid var(--color-border-primary)', paddingLeft: 12, color: 'var(--color-text-secondary)', margin: '8px 0' }}>{children}</blockquote>,
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}
