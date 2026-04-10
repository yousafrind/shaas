const EVENT_BUS  = import.meta.env.VITE_EVENT_BUS_URL?.replace(/^ws/, 'http') as string
const HICLAW_URL = import.meta.env.VITE_HICLAW_URL as string
const AIO_URL    = import.meta.env.VITE_AIO_URL as string

async function post(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`)
  return res.json()
}

export async function sendCommand(cmd: string): Promise<void> {
  await post(`${EVENT_BUS}/command`, { cmd })
}

export async function approveEvent(eventId: string): Promise<void> {
  await post(`${HICLAW_URL}/api/approve`, { event_id: eventId })
}

export async function rejectEvent(eventId: string): Promise<void> {
  await post(`${HICLAW_URL}/api/reject`, { event_id: eventId })
}

export async function readFile(path: string): Promise<string> {
  const res = await post(`${AIO_URL}/v1/file/read`, { path }) as { content: string }
  return res.content ?? ''
}

export async function commitFiles(message: string): Promise<void> {
  await sendCommand(`/commit "${message}"`)
}
