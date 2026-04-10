import { useContext, useRef, useState } from 'react'
import AgentFeed from '../components/AgentFeed'
import CodePane from '../components/CodePane'
import MiniChatBar from '../components/MiniChatBar'
import { AgentStreamContext } from '../App'

export default function AgentCodeTab() {
  const [leftPct, setLeftPct] = useState(42)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  function onDividerMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    dragging.current = true
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  function onMouseMove(e: MouseEvent) {
    if (!dragging.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const pct = Math.min(Math.max(((e.clientX - rect.left) / rect.width) * 100, 20), 70)
    setLeftPct(pct)
  }

  function onMouseUp() {
    dragging.current = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  return (
    <div ref={containerRef} style={{ display: 'flex', flex: 1, overflow: 'hidden', height: '100%' }}>
      {/* Left: agent feed + mini chat */}
      <div style={{ width: `${leftPct}%`, display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <AgentFeed />
        </div>
        <MiniChatBar />
      </div>

      {/* Divider */}
      <div
        onMouseDown={onDividerMouseDown}
        style={{ width: 1, background: 'var(--color-border-tertiary)', cursor: 'col-resize', flexShrink: 0 }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-accent-purple)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-border-tertiary)')}
      />

      {/* Right: code pane */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <CodePane />
      </div>
    </div>
  )
}
