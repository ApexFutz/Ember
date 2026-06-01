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

interface Score {
  score: number | null
  tests_passed: number | null
  tests_total: number | null
  metrics: { edit_count?: number; paste_count?: number; duration_s?: number | null } | null
}

export default function Replay() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [submission, setSubmission] = useState<SubmissionDetail | null>(null)
  const [score, setScore] = useState<Score | null>(null)
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

        // Mark this submission's replay as viewed (unlocks status changes on the dashboard).
        await supabase
          .from('submissions')
          .update({ replay_viewed: true })
          .eq('id', id)

        // Load scoring + metrics for this submission
        const { data: scoreData } = await supabase
          .from('submissions')
          .select('score, tests_passed, tests_total, metrics')
          .eq('id', id)
          .single()
        if (scoreData) setScore(scoreData)

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
              (marked on the timeline). Review these moments for potential external code.
            </div>
          )}

          {/* Results summary */}
          {score && score.tests_total != null && score.tests_total > 0 && (
            <div style={styles.summaryCard}>
              <div style={styles.summaryItem}>
                <span style={styles.summaryNum}>
                  {score.tests_passed}/{score.tests_total}
                </span>
                <span style={styles.summaryLabel}>Tests passed</span>
              </div>
              <div style={styles.summaryItem}>
                <span style={styles.summaryNum}>{Math.round((score.score ?? 0) * 100)}%</span>
                <span style={styles.summaryLabel}>Score</span>
              </div>
              {score.metrics?.duration_s != null && (
                <div style={styles.summaryItem}>
                  <span style={styles.summaryNum}>{Math.round(score.metrics.duration_s / 60)}m</span>
                  <span style={styles.summaryLabel}>Time used</span>
                </div>
              )}
              <div style={styles.summaryItem}>
                <span style={styles.summaryNum}>{score.metrics?.edit_count ?? 0}</span>
                <span style={styles.summaryLabel}>Edits</span>
              </div>
              <div style={styles.summaryItem}>
                <span style={styles.summaryNum}>{score.metrics?.paste_count ?? 0}</span>
                <span style={styles.summaryLabel}>Pastes</span>
              </div>
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
  loading: { padding: '2rem', color: 'var(--color-text-secondary)', fontSize: '14px' },
  backBtn: {
    background: 'none', border: 'none', color: 'var(--color-text-secondary)',
    fontSize: 'var(--text-sm)', cursor: 'pointer', padding: 0, marginBottom: '16px', display: 'block',
  },
  header: { marginBottom: '24px' },
  title: { fontSize: 'var(--text-3xl)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)', margin: '0 0 4px', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
  subtitle: { fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)', margin: 0 },
  noLogs: {
    padding: '40px', textAlign: 'center', fontSize: '14px', color: 'var(--color-text-secondary)',
    background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)',
  },
  editorCard: {
    background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-xl)', overflow: 'hidden',
    border: '1px solid var(--color-border)', marginBottom: '16px', boxShadow: 'var(--shadow-md)',
  },
  editorHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 16px', backgroundColor: 'var(--color-bg-tertiary)', borderBottom: '1px solid var(--color-border)',
  },
  fileName: { fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', fontWeight: 'var(--weight-medium)', fontFamily: 'var(--font-mono)' },
  stepIndicator: { fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' },
  editorWrapper: { height: '400px' },
  controls: {
    display: 'flex', alignItems: 'center', gap: '16px',
    padding: '16px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)', marginBottom: '16px', boxShadow: 'var(--shadow-md)',
  },
  playBtn: {
    padding: '9px 18px', backgroundColor: 'var(--color-primary)', color: '#fff',
    border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)',
    fontWeight: 'var(--weight-semibold)', cursor: 'pointer', whiteSpace: 'nowrap', minWidth: '90px',
  },
  scrubberWrapper: { flex: 1, position: 'relative', display: 'flex', alignItems: 'center' },
  scrubber: { width: '100%', cursor: 'pointer', accentColor: 'var(--color-primary)' },
  pasteMarker: {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    width: '3px', height: '14px', backgroundColor: 'var(--color-primary)',
    borderRadius: '1px', pointerEvents: 'none',
  },
  speedControls: { display: 'flex', gap: '4px' },
  speedBtn: {
    padding: '7px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    background: 'var(--color-bg-tertiary)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', cursor: 'pointer',
  },
  speedBtnActive: {
    padding: '7px 12px', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-md)',
    background: 'var(--color-primary)', fontSize: 'var(--text-xs)', color: '#fff', cursor: 'pointer', fontWeight: 'var(--weight-semibold)',
  },
  finalBtn: {
    padding: '8px 16px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    background: 'transparent', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 'var(--weight-medium)',
  },
  pasteWarning: {
    background: 'rgba(249, 115, 22, 0.1)', border: '1px solid rgba(249, 115, 22, 0.3)', borderRadius: 'var(--radius-md)',
    padding: '12px 16px', fontSize: 'var(--text-sm)', color: 'var(--color-primary-light)',
    marginBottom: '16px', lineHeight: '1.6',
  },
  summaryCard: {
    display: 'flex', gap: '12px', flexWrap: 'wrap',
    background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)', padding: '20px', boxShadow: 'var(--shadow-md)', marginBottom: '16px',
  },
  summaryItem: {
    display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '80px',
  },
  summaryNum: {
    fontSize: 'var(--text-2xl)', fontWeight: 'var(--weight-semibold)',
    color: 'var(--color-primary)', fontFamily: 'var(--font-display)',
  },
  summaryLabel: {
    fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 'var(--weight-medium)',
  },
  notesCard: {
    background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', padding: '20px', boxShadow: 'var(--shadow-md)',
  },
  notesLabel: {
    fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--color-text-tertiary)', margin: '0 0 12px',
  },
  notesArea: {
    width: '100%', padding: '10px 14px', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)', fontSize: 'var(--text-base)', color: 'var(--color-text-primary)',
    backgroundColor: 'var(--color-bg-tertiary)',
    boxSizing: 'border-box', resize: 'vertical', fontFamily: 'var(--font-primary)',
    outline: 'none', lineHeight: 1.6,
  },
  notesFooter: {
    display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
    gap: '12px', marginTop: '12px',
  },
  notesSaved: { fontSize: 'var(--text-sm)', color: 'var(--color-success)' },
  notesBtn: {
    padding: '9px 18px', backgroundColor: 'var(--color-primary)', color: '#fff',
    border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)',
    fontWeight: 'var(--weight-semibold)', cursor: 'pointer',
  },
}