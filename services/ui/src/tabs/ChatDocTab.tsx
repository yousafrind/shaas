import { useContext, useRef, useState } from 'react'
import ChatPane from '../components/ChatPane'
import DocPane from '../components/DocPane'
import { AgentStreamContext } from '../App'

export default function ChatDocTab() {
  const { events } = useContext(AgentStreamContext)
  const [leftPct, setLeftPct] = useState(50)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  // Track most recently written .md file in docs/
  let docPath = ''
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.type === 'file_write') {
      const p = (e.data.path ?? e.data.filePath ?? '') as string
      if (p.includes('docs/') && p.endsWith('.md')) {
        docPath = p
        break
      }
    }
  }

  function onDividerMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    dragging.current = true
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  function onMouseMove(e: MouseEvent) {
    if (!dragging.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = Math.min(Math.max((x / rect.width) * 100, 20), 80)
    setLeftPct(pct)
  }

  function onMouseUp() {
    dragging.current = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  return (
    <div ref={containerRef} style={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%' }}>
      <div style={{ width: `${leftPct}%`, overflow: 'hidden', flexShrink: 0 }}>
        <ChatPane />
      </div>

      {/* Divider */}
      <div
        onMouseDown={onDividerMouseDown}
        style={{ width: 1, background: 'var(--color-border-tertiary)', cursor: 'col-resize', flexShrink: 0, transition: 'background 0.1s' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-accent-purple)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-border-tertiary)')}
      />

      <div style={{ flex: 1, overflow: 'hidden' }}>
        <DocPane docPath={docPath} />
      </div>
    </div>
  )
}
