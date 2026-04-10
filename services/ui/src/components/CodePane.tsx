import { useContext, useEffect, useState } from 'react'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'
import { parseDiff, Diff, Hunk } from 'react-diff-view'
import 'react-diff-view/style/index.css'
import { createPatch } from 'diff'
import { AgentStreamContext } from '../App'
import { useApproval } from '../hooks/useApproval'
import { readFile } from '../lib/api'

function detectLang(path: string): string {
  const ext = path.split('.').pop() ?? ''
  const map: Record<string, string> = {
    py: 'python', ts: 'typescript', tsx: 'typescript', js: 'javascript',
    jsx: 'javascript', json: 'json', sh: 'bash', yml: 'yaml', yaml: 'yaml',
    md: 'markdown', sql: 'sql', css: 'css', html: 'html',
  }
  return map[ext] ?? 'plaintext'
}

export default function CodePane() {
  const { events } = useContext(AgentStreamContext)
  const { pendingApprovals, approve, reject } = useApproval()
  const [currentFile, setCurrentFile] = useState('')
  const [fileContent, setFileContent] = useState('')
  const [isWriting, setIsWriting] = useState(false)
  const [diffText, setDiffText] = useState('')

  const pendingForFile = pendingApprovals.find((e) => e.data.path === currentFile || !currentFile)

  // Track active file from events
  useEffect(() => {
    const latest = events[events.length - 1]
    if (!latest) return
    if (latest.type === 'file_write') {
      const path = (latest.data.path ?? latest.data.filePath ?? '') as string
      if (path) {
        setCurrentFile(path)
        setIsWriting(true)
        setTimeout(() => setIsWriting(false), 3000)
        readFile(path).then(setFileContent).catch(() => {})
      }
    }
    if (latest.type === 'approval_needed') {
      const path = (latest.data.path ?? '') as string
      const newContent = (latest.data.newContent ?? '') as string
      if (path) {
        setCurrentFile(path)
        readFile(path)
          .then((old) => {
            const patch = createPatch(path, old, newContent, 'current', 'proposed')
            setDiffText(patch)
          })
          .catch(() => {
            const patch = createPatch(path, '', newContent, 'current', 'proposed')
            setDiffText(patch)
          })
      }
    }
  }, [events])

  const filename = currentFile.split('/').pop() ?? currentFile
  const lang = detectLang(currentFile)
  const highlighted = fileContent
    ? (() => {
        try { return hljs.highlight(fileContent, { language: lang }).value }
        catch { return hljs.highlightAuto(fileContent).value }
      })()
    : ''

  let diffFiles: ReturnType<typeof parseDiff> = []
  if (pendingForFile && diffText) {
    try { diffFiles = parseDiff(diffText) } catch { /* invalid diff */ }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-background-code)', fontFamily: 'var(--font-mono)' }}>
      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border-primary)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {lang} · AIO SANDBOX
        </span>
        {currentFile && (
          <span style={{ fontSize: 11, color: 'var(--color-text-primary)' }}>{filename}</span>
        )}
        {isWriting && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--color-status-running)' }}>
            <WritingDot /> dev agent writing
          </span>
        )}
        {pendingForFile && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button
              onClick={() => pendingForFile.id && approve(pendingForFile.id)}
              style={{ padding: '3px 10px', background: 'transparent', color: 'var(--color-status-running)', border: '1px solid var(--color-status-running)', borderRadius: 'var(--radius-sm)', fontSize: 11 }}>
              Approve edit
            </button>
            <button
              onClick={() => pendingForFile.id && reject(pendingForFile.id)}
              style={{ padding: '3px 10px', background: 'transparent', color: 'var(--color-event-error)', border: '1px solid var(--color-event-error)', borderRadius: 'var(--radius-sm)', fontSize: 11 }}>
              Reject
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
        {!currentFile && (
          <div style={{ color: 'var(--color-text-muted)', fontSize: 12, textAlign: 'center', padding: '40px 20px' }}>
            No file open — agent activity will appear here
          </div>
        )}

        {/* Diff view when approval pending */}
        {pendingForFile && diffFiles.length > 0 && diffFiles.map((file, i) => (
          <Diff key={i} viewType="unified" diffType={file.type} hunks={file.hunks ?? []}>
            {(hunks) => hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}
          </Diff>
        ))}

        {/* Syntax view when no approval pending */}
        {!pendingForFile && fileContent && (
          <pre style={{ margin: 0, padding: '12px 16px', fontSize: 12, lineHeight: 1.6 }}>
            <code dangerouslySetInnerHTML={{ __html: highlighted }} />
          </pre>
        )}
      </div>
    </div>
  )
}

function WritingDot() {
  return (
    <span style={{
      display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
      background: 'var(--color-status-running)',
      animation: 'pulse 1.2s ease-in-out infinite',
    }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </span>
  )
}
