import { useContext, useEffect, useRef, useState } from 'react'
import { readFile } from '../lib/api'
import { AgentStreamContext } from '../App'

export function useDocWatch(docPath: string) {
  const [content, setContent] = useState('')
  const [lastModified, setLastModified] = useState<Date | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const { events } = useContext(AgentStreamContext)
  const pathRef = useRef(docPath)
  pathRef.current = docPath

  async function fetchDoc(path: string) {
    if (!path) return
    setIsLoading(true)
    try {
      const text = await readFile(path)
      setContent(text)
      setLastModified(new Date())
    } catch {
      // AIO not reachable yet — silently ignore
    } finally {
      setIsLoading(false)
    }
  }

  // Watch for file_write events matching our docPath
  useEffect(() => {
    const latest = events[events.length - 1]
    if (!latest) return
    if (latest.type === 'file_write') {
      const writtenPath = (latest.data.path ?? latest.data.filePath ?? '') as string
      if (writtenPath && writtenPath.endsWith(pathRef.current)) {
        fetchDoc(pathRef.current)
      }
    }
  }, [events])

  // Poll every 2s as fallback
  useEffect(() => {
    if (!docPath) return
    fetchDoc(docPath)
    const id = setInterval(() => fetchDoc(docPath), 2000)
    return () => clearInterval(id)
  }, [docPath])

  return { content, lastModified, isLoading }
}
