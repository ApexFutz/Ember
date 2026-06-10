// Shared definition of a "large paste" so the capture side (Assessment) and the
// review side (Replay) agree. Adjust the threshold here in one place.
export const LARGE_PASTE_THRESHOLD = 50

export interface PasteLogEntry {
  timestamp: number
  file: string
  type: 'insert' | 'delete' | 'paste' | 'focus_loss'
  content: string
  position: number
}

export interface PasteEvent {
  step: number // index into the log array — used for scrubber position + seek
  timestamp: number // absolute epoch ms of the paste
  charCount: number
  snippet: string // first 80 chars of pasted content
  file: string
}

const SNIPPET_LEN = 80

/** Pull every large-paste event (> threshold chars) out of a keystroke log. */
export function extractPasteEvents(logs: PasteLogEntry[]): PasteEvent[] {
  const events: PasteEvent[] = []
  logs.forEach((e, i) => {
    if (e.type === 'paste' && e.content.length > LARGE_PASTE_THRESHOLD) {
      events.push({
        step: i,
        timestamp: e.timestamp,
        charCount: e.content.length,
        snippet: e.content.slice(0, SNIPPET_LEN),
        file: e.file,
      })
    }
  })
  return events
}

export interface FocusEvent {
  step: number // index into the log array — used for scrubber position + seek
  timestamp: number
}

/** Pull every focus-loss event (tab switch / window blur) out of a keystroke log. */
export function extractFocusEvents(logs: PasteLogEntry[]): FocusEvent[] {
  const events: FocusEvent[] = []
  logs.forEach((e, i) => {
    if (e.type === 'focus_loss') events.push({ step: i, timestamp: e.timestamp })
  })
  return events
}

/** mm:ss elapsed from the first log entry — friendlier than an epoch timestamp. */
export function formatElapsed(timestamp: number, startTimestamp: number): string {
  const s = Math.max(0, Math.floor((timestamp - startTimestamp) / 1000))
  const m = Math.floor(s / 60)
  return `${m}:${(s % 60).toString().padStart(2, '0')}`
}
