import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import { supabase } from '../../lib/supabase'

interface LogEntry {
  timestamp: number
  file: string
  type: 'insert' | 'delete' | 'paste'
  content: string
  position: number
}

interface FileTab {
  name: string
  content: string
}

interface SubmissionDetail {
  candidate_name: string | null
  candidate_headline: string | null
  role_title: string
  assessment_id: string
  recruiter_notes: string | null
}

export default function Replay() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [submission, setSubmission] = useState<SubmissionDetail | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [finalFiles, setFinalFiles] = useState<FileTab[]>([])
  const [loading, setLoading] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [displayContent, setDisplayContent] = useState('')
  const [activeReplayFile, setActiveReplayFile] = useState('')

  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!id) return
    async function load() {
      // Load submission details
      const { data: subData } = await supabase
        .from('submission_details')
        .select('candidate_name, candidate_headline, role_title, assessment_id, recruiter_notes')
        .eq('id', id)
        .single()

      if (subData) {
        setSubmission(subData)
        setNotes(subData.recruiter_notes ?? '')

        // Load the assessment logs
        const { data: logData } = await supabase
          .from('assessment_logs')
          .select('log')
          .eq('assessment_id', subData.assessment_id)
          .single()

        if (logData?.log) {
          setLogs(logData.log)
        }

        // Load final files
        const { data: assessmentData } = await supabase
          .from('assessments')
          .select('files')
          .eq('id', subData.assessment_id)
          .single()

        if (assessmentData?.files) {
          setFinalFiles(assessmentData.files)
          if (assessmentData.files.length > 0) {
            setDisplayContent(assessmentData.files[0].content)
            setActiveReplayFile(assessmentData.files[0].name)
          }
        }
      }

      setLoading(false)
    }
    load()
  }, [id])

  // Reconstruct content up to a given step
  function reconstructAtStep(step: number) {
    // Build file contents by replaying logs up to step
    const fileContents: Record<string, string> = {}

    for (let i = 0; i < step && i < logs.length; i++) {
      const entry = logs[i]
      if (!fileContents[entry.file]) fileContents[entry.file] = ''

      const content = fileContents[entry.file]
      const pos = entry.position

      if (entry.type === 'insert' || entry.type === 'paste') {
        fileContents[entry.file] =
          content.slice(0, pos) + entry.content + content.slice(pos)
      } else if (entry.type === 'delete') {
        fileContents[entry.file] =
          content.slice(0, pos) + content.slice(pos + entry.content.length)
      }
    }

    // Show the file that was most recently edited
    if (step > 0 && step <= logs.length) {
      const lastFile = logs[step - 1]?.file
      if (lastFile && fileContents[lastFile] !== undefined) {
        setActiveReplayFile(lastFile)
        setDisplayContent(fileContents[lastFile])
        return
      }
    }

    // Default to first file
    const firstFile = Object.keys(fileContents)[0]
    if (firstFile) {
      setActiveReplayFile(firstFile)
      setDisplayContent(fileContents[firstFile])
    }
  }

  // Playback
  useEffect(() => {
    if (!playing) {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current)
      return
    }

    if (currentStep >= logs.length) {
      setPlaying(false)
      return
    }

    playIntervalRef.current = setInterval(() => {
      setCurrentStep(prev => {
        const next = prev + 1
        if (next >= logs.length) {
          setPlaying(false)
          reconstructAtStep(logs.length)
          return logs.length
        }
        reconstructAtStep(next)
        return next
      })
    }, 150 / speed)

    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current)
    }
  }, [playing, speed, logs.length])

  function handlePlayPause() {
    if (currentStep >= logs.length) {
      // Restart from beginning
      setCurrentStep(0)
      reconstructAtStep(0)
    }
    setPlaying(!playing)
  }

  function handleScrub(step: number) {
    setPlaying(false)
    setCurrentStep(step)
    reconstructAtStep(step)
  }

  function showFinalCode() {
    setPlaying(false)
    setCurrentStep(logs.length)
    if (finalFiles.length > 0) {
      setActiveReplayFile(finalFiles[0].name)
      setDisplayContent(finalFiles[0].content)
    }
  }

  async function saveNotes() {
    if (!id) return
    setSavingNotes(true)
    await supabase
      .from('submissions')
      .update({ recruiter_notes: notes })
      .eq('id', id)
    setSavingNotes(false)
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 2000)
  }

  // Count paste events (potential AI usage flags)
  const pasteSteps = logs
    .map((log, i) => log.type === 'paste' ? i : -1)
    .filter(i => i !== -1)

  function getLanguage(filename: string) {
    if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return 'typescript'
    if (filename.endsWith('.js') || filename.endsWith('.jsx')) return 'javascript'
    if (filename.endsWith('.py')) return 'python'
    if (filename.endsWith('.css')) return 'css'
    if (filename.endsWith('.html')) return 'html'
    return 'plaintext'
  }

  if (loading) return <div style={styles.loading}>Loading replay...</div>

  return (
    <div style={styles.page}>
      <button onClick={() => navigate('/recruiter/dashboard')} style={styles.backBtn}>
        ← Back to dashboard
      </button>

      <div style={styles.header}>
        <h1 style={styles.title}>{submission?.candidate_name ?? 'Candidate'}</h1>
        <p style={styles.subtitle}>
          {submission?.candidate_headline} · {submission?.role_title}
        </p>
      </div>

      {logs.length === 0 ? (
        <div style={styles.noLogs}>
          No replay data available for this submission.
        </div>
      ) : (
        <>
          {/* Replay editor */}
          <div style={styles.editorCard}>
            <div style={styles.editorHeader}>
              <span style={styles.fileName}>{activeReplayFile || 'main.js'}</span>
              <span style={styles.stepIndicator}>
                {currentStep} / {logs.length} edits
              </span>
            </div>
            <div style={styles.editorWrapper}>
              <Editor
                height="400px"
                language={getLanguage(activeReplayFile)}
                value={displayContent}
                options={{
                  readOnly: true,
                  fontSize: 14,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  lineNumbers: 'on',
                  domReadOnly: true,
                }}
                theme="vs-dark"
              />
            </div>
          </div>

          {/* Playback controls */}
          <div style={styles.controls}>
            <button onClick={handlePlayPause} style={styles.playBtn}>
              {playing ? '⏸ Pause' : currentStep >= logs.length ? '↻ Replay' : '▶ Play'}
            </button>

            {/* Scrubber */}
            <div style={styles.scrubberWrapper}>
              <input
                type="range"
                min={0}
                max={logs.length}
                value={currentStep}
                onChange={e => handleScrub(Number(e.target.value))}
                style={styles.scrubber}
              />
              {/* Paste markers */}
              {pasteSteps.map(step => (
                <div
                  key={step}
                  style={{
                    ...styles.pasteMarker,
                    left: `${(step / logs.length) * 100}%`,
                  }}
                  title={`Paste detected at edit ${step}`}
                />
              ))}
            </div>

            {/* Speed */}
            <div style={styles.speedControls}>
              <button
                onClick={() => setSpeed(1)}
                style={speed === 1 ? styles.speedBtnActive : styles.speedBtn}
              >
                1x
              </button>
              <button
                onClick={() => setSpeed(2)}
                style={speed === 2 ? styles.speedBtnActive : styles.speedBtn}
              >
                2x
              </button>
            </div>

            <button onClick={showFinalCode} style={styles.finalBtn}>
              Final code
            </button>
          </div>

          {/* Paste warning */}
          {pasteSteps.length > 0 && (
            <div style={styles.pasteWarning}>
              ⚠️ {pasteSteps.length} large paste event{pasteSteps.length !== 1 ? 's' : ''} detected
              (marked in gold on the timeline). Review these moments for potential external code.
            </div>
          )}

          {/* Notes */}
          <div style={styles.notesCard}>
            <p style={styles.notesLabel}>Private notes</p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add private notes about this candidate's performance..."
              style={styles.notesArea}
              rows={4}
            />
            <div style={styles.notesFooter}>
              {notesSaved && <span style={styles.notesSaved}>Saved</span>}
              <button
                onClick={saveNotes}
                disabled={savingNotes}
                style={savingNotes ? { ...styles.notesBtn, opacity: 0.6 } : styles.notesBtn}
              >
                {savingNotes ? 'Saving...' : 'Save notes'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: '860px' },
  loading: { padding: '2rem', color: '#8a837a', fontSize: '14px' },
  backBtn: {
    background: 'none', border: 'none', color: '#8a837a',
    fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '16px', display: 'block',
  },
  header: { marginBottom: '24px' },
  title: { fontSize: '24px', fontWeight: '500', color: '#1a1714', margin: '0 0 4px' },
  subtitle: { fontSize: '14px', color: '#8a837a', margin: 0 },
  noLogs: {
    padding: '40px', textAlign: 'center', fontSize: '14px', color: '#8a837a',
    background: '#fff', border: '1px solid #ddd6cc', borderRadius: '4px',
  },
  editorCard: {
    background: '#1e1e1e', borderRadius: '4px', overflow: 'hidden',
    border: '1px solid #ddd6cc', marginBottom: '16px',
  },
  editorHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 16px', backgroundColor: '#252525', borderBottom: '1px solid #333',
  },
  fileName: { fontSize: '13px', color: '#fff', fontWeight: '500' },
  stepIndicator: { fontSize: '12px', color: '#888' },
  editorWrapper: { height: '400px' },
  controls: {
    display: 'flex', alignItems: 'center', gap: '16px',
    padding: '16px', background: '#fff', border: '1px solid #ddd6cc',
    borderRadius: '4px', marginBottom: '16px',
  },
  playBtn: {
    padding: '8px 18px', backgroundColor: '#1a1714', color: '#fff',
    border: 'none', borderRadius: '3px', fontSize: '13px',
    fontWeight: '500', cursor: 'pointer', whiteSpace: 'nowrap', minWidth: '90px',
  },
  scrubberWrapper: { flex: 1, position: 'relative', display: 'flex', alignItems: 'center' },
  scrubber: { width: '100%', cursor: 'pointer' },
  pasteMarker: {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    width: '3px', height: '14px', backgroundColor: '#c8943a',
    borderRadius: '1px', pointerEvents: 'none',
  },
  speedControls: { display: 'flex', gap: '4px' },
  speedBtn: {
    padding: '6px 12px', border: '1px solid #ddd6cc', borderRadius: '3px',
    background: '#fff', fontSize: '12px', color: '#8a837a', cursor: 'pointer',
  },
  speedBtnActive: {
    padding: '6px 12px', border: '1px solid #1a1714', borderRadius: '3px',
    background: '#1a1714', fontSize: '12px', color: '#fff', cursor: 'pointer',
  },
  finalBtn: {
    padding: '8px 16px', border: '1px solid #ddd6cc', borderRadius: '3px',
    background: '#fff', fontSize: '12px', color: '#1a1714', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  pasteWarning: {
    background: '#fef3c7', border: '1px solid #fde047', borderRadius: '3px',
    padding: '12px 16px', fontSize: '13px', color: '#854d0e',
    marginBottom: '16px', lineHeight: '1.6',
  },
  notesCard: {
    background: '#fff', border: '1px solid #ddd6cc', borderRadius: '4px', padding: '20px',
  },
  notesLabel: {
    fontSize: '11px', fontWeight: '500', letterSpacing: '0.08em',
    textTransform: 'uppercase', color: '#8a837a', margin: '0 0 12px',
  },
  notesArea: {
    width: '100%', padding: '10px 12px', border: '1px solid #ddd6cc',
    borderRadius: '3px', fontSize: '14px', color: '#1a1714',
    boxSizing: 'border-box', resize: 'vertical', fontFamily: 'system-ui, sans-serif',
    outline: 'none',
  },
  notesFooter: {
    display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
    gap: '12px', marginTop: '12px',
  },
  notesSaved: { fontSize: '13px', color: '#2d6a4f' },
  notesBtn: {
    padding: '8px 18px', backgroundColor: '#1a1714', color: '#fff',
    border: 'none', borderRadius: '3px', fontSize: '13px',
    fontWeight: '500', cursor: 'pointer',
  },
}