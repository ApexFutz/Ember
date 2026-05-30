import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { getTemplateFiles, getTemplateLabel } from '../../lib/starterTemplates'

interface Ruleset {
  task_description: string
  stack_tags: string[]
  task_type: string
  time_limit_mins: number
  ai_allowed: boolean
  starter_template: string
}

interface Role {
  title: string
  profiles: {
    company_name: string | null
    full_name: string | null
  }
}

interface FileTab {
  name: string
  content: string
}

interface LogEntry {
  timestamp: number
  file: string
  type: 'insert' | 'delete' | 'paste'
  content: string
  position: number
}

const DEFAULT_FILE: FileTab = {
  name: 'main.js',
  content: '// Start coding here\n',
}

export default function Assessment() {
  const { roleId } = useParams<{ roleId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [role, setRole] = useState<Role | null>(null)
  const [ruleset, setRuleset] = useState<Ruleset | null>(null)
  const [files, setFiles] = useState<FileTab[]>([DEFAULT_FILE])
  const [activeFile, setActiveFile] = useState('main.js')
  const [newFileName, setNewFileName] = useState('')
  const [showNewFile, setShowNewFile] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [started, setStarted] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [locked, setLocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [assessmentId, setAssessmentId] = useState<string | null>(null)
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)

  const logs = useRef<LogEntry[]>([])
  const lastSave = useRef<number>(Date.now())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const editorRef = useRef<any>(null)

useEffect(() => {
    if (!roleId) return
    if (!user) return // will re-run when user populates

    async function load() {
      const { data: roleData } = await supabase
        .from('roles')
        .select('title, profiles(company_name, full_name)')
        .eq('id', roleId)
        .single()

      const { data: rulesetData } = await supabase
        .from('rulesets')
        .select('*')
        .eq('role_id', roleId)
        .single()

      const { data: existingSubmission } = await supabase
        .from('submissions')
        .select('id')
        .eq('role_id', roleId)
        .eq('candidate_id', user!.id)
        .maybeSingle() // use maybeSingle instead of single to avoid error when no row exists

      if (existingSubmission) {
        setAlreadySubmitted(true)
        setLoading(false)
        return
      }

      if (roleData) setRole(roleData as any)
      if (rulesetData) {
        setRuleset(rulesetData)
        setTimeLeft(rulesetData.time_limit_mins * 60)
        const templateFiles = getTemplateFiles(rulesetData.starter_template)
        setFiles(templateFiles)
        setActiveFile(templateFiles[0].name)
      }

      setLoading(false)
    }

    load()
  }, [roleId, user])

  // Timer
  useEffect(() => {
    if (!started || locked) return

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          handleTimesUp()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [started, locked])

  // Auto-save logs every 30 seconds
  useEffect(() => {
    if (!started || locked || !assessmentId) return

    const interval = setInterval(() => {
      saveLogs(false)
    }, 30000)

    return () => clearInterval(interval)
  }, [started, locked, assessmentId])

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  function isTimeLow() {
    return timeLeft <= 300 && timeLeft > 0 // last 5 minutes
  }

  async function handleStart() {
    if (!user || !roleId || !ruleset) return

    // Create assessment record
    const { data, error } = await supabase
      .from('assessments')
      .insert({
        role_id: roleId,
        candidate_id: user.id,
        status: 'in_progress',
        files: files,
        time_limit_mins: ruleset.time_limit_mins,
      })
      .select('id')
      .single()

    if (error) {
      console.error('Failed to start assessment:', error.message)
      return
    }

    setAssessmentId(data.id)
    setStarted(true)
  }

  function handleEditorChange(value: string | undefined) {
    if (locked || !value) return

    setFiles(prev => prev.map(f =>
      f.name === activeFile ? { ...f, content: value } : f
    ))
  }

  function handleEditorMount(editor: any) {
    editorRef.current = editor

    // Log keystrokes
    editor.onDidChangeModelContent((e: any) => {
      if (locked) return
      const now = Date.now()

      e.changes.forEach((change: any) => {
        const isPaste = change.text.length > 100
        logs.current.push({
          timestamp: now,
          file: activeFile,
          type: isPaste ? 'paste' : change.text.length > 0 ? 'insert' : 'delete',
          content: change.text,
          position: change.rangeOffset,
        })
      })
    })
  }

  async function saveLogs(finalized: boolean) {
    if (!assessmentId) return

    const { data: existing } = await supabase
      .from('assessment_logs')
      .select('id')
      .eq('assessment_id', assessmentId)
      .single()

    if (existing) {
      await supabase
        .from('assessment_logs')
        .update({ log: logs.current, finalized })
        .eq('assessment_id', assessmentId)
    } else {
      await supabase
        .from('assessment_logs')
        .insert({
          assessment_id: assessmentId,
          log: logs.current,
          finalized,
        })
    }

    lastSave.current = Date.now()
  }

  async function handleTimesUp() {
    if (timerRef.current) clearInterval(timerRef.current)
    setLocked(true)
    await submitAssessment('timed_out')
  }

  async function handleSubmit() {
    if (timerRef.current) clearInterval(timerRef.current)
    setLocked(true)
    await submitAssessment('submitted')
  }

  async function submitAssessment(status: 'submitted' | 'timed_out') {
    if (!assessmentId || !user || !roleId) return
    setSubmitting(true)

    // Save final files and logs
    await supabase
      .from('assessments')
      .update({
        status,
        files,
        submitted_at: new Date().toISOString(),
      })
      .eq('id', assessmentId)

    await saveLogs(true)

    // Create submission record
    await supabase
      .from('submissions')
      .insert({
        role_id: roleId,
        candidate_id: user.id,
        assessment_id: assessmentId,
        status: 'pending_review',
      })

    setSubmitting(false)
    setSubmitted(true)
  }

  function addFile() {
    const name = newFileName.trim()
    if (!name || files.find(f => f.name === name)) return
    setFiles(prev => [...prev, { name, content: '' }])
    setActiveFile(name)
    setNewFileName('')
    setShowNewFile(false)
  }

  function getLanguage(filename: string) {
    if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return 'typescript'
    if (filename.endsWith('.js') || filename.endsWith('.jsx')) return 'javascript'
    if (filename.endsWith('.py')) return 'python'
    if (filename.endsWith('.css')) return 'css'
    if (filename.endsWith('.html')) return 'html'
    if (filename.endsWith('.json')) return 'json'
    if (filename.endsWith('.md')) return 'markdown'
    return 'plaintext'
  }

  const activeContent = files.find(f => f.name === activeFile)?.content ?? ''

  if (loading) return (
    <div style={styles.centered}>Loading assessment...</div>
  )

  if (alreadySubmitted) return (
    <div style={styles.centered}>
      <div style={styles.doneCard}>
        <h2 style={styles.doneTitle}>Already submitted</h2>
        <p style={styles.doneSub}>You've already completed this assessment.</p>
        <button onClick={() => navigate('/candidate/roles')} style={styles.doneBtn}>
          Back to roles
        </button>
      </div>
    </div>
  )

  if (submitted) return (
    <div style={styles.centered}>
      <div style={styles.doneCard}>
        <h2 style={styles.doneTitle}>Assessment submitted</h2>
        <p style={styles.doneSub}>
          Your work has been sent to the recruiter. They'll be in touch.
        </p>
        <button onClick={() => navigate('/candidate/roles')} style={styles.doneBtn}>
          Back to roles
        </button>
      </div>
    </div>
  )

  // Pre-start screen
  if (!started) return (
    <div style={styles.centered}>
      <div style={styles.startCard}>
        <button
          onClick={() => navigate('/candidate/roles')}
          style={styles.backBtn}
        >
          ← Back to roles
        </button>
        <h1 style={styles.startTitle}>{role?.title}</h1>
        <p style={styles.startCompany}>
          {role?.profiles?.company_name ?? role?.profiles?.full_name}
        </p>

        <div style={styles.startDivider} />

        <p style={styles.startSectionLabel}>What you'll be asked to do</p>
        <p style={styles.startDescription}>
          {ruleset?.task_description ?? 'No task description provided.'}
        </p>

        <div style={styles.startMeta}>
          <div style={styles.startMetaItem}>
            <span style={styles.startMetaLabel}>Time limit</span>
            <span style={styles.startMetaValue}>{ruleset?.time_limit_mins} minutes</span>
          </div>
          <div style={styles.startMetaItem}>
            <span style={styles.startMetaLabel}>Task type</span>
            <span style={styles.startMetaValue}>
              {ruleset?.task_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </span>
          </div>
          <div style={styles.startMetaItem}>
            <span style={styles.startMetaLabel}>AI usage</span>
            <span style={styles.startMetaValue}>
              {ruleset?.ai_allowed ? 'Allowed (logged)' : 'Not allowed'}
            </span>
          </div>
          <div style={styles.startMetaItem}>
            <span style={styles.startMetaLabel}>Stack</span>
            <span style={styles.startMetaValue}>
              {ruleset?.stack_tags?.join(', ') ?? 'Not specified'}
            </span>
          </div>
          <div style={styles.startMetaItem}>
            <span style={styles.startMetaLabel}>Starter code</span>
            <span style={styles.startMetaValue}>
              {getTemplateLabel(ruleset?.starter_template)}
            </span>
          </div>
        </div>

        <div style={styles.startDivider} />

        <p style={styles.startWarning}>
          ⚠️ Once you start, the timer begins immediately and cannot be paused.
          Make sure you're ready before clicking Start.
        </p>

        <button onClick={handleStart} style={styles.startBtn}>
          Start assessment — {ruleset?.time_limit_mins} min
        </button>
      </div>
    </div>
  )

  // Assessment screen
  return (
    <div style={styles.shell}>
      {/* Top bar */}
      <div style={styles.topBar}>
        <div style={styles.topLeft}>
          <span style={styles.topTitle}>{role?.title}</span>
          {ruleset?.ai_allowed && (
            <span style={styles.aiBadge}>AI allowed — inputs logged</span>
          )}
        </div>
        <div style={styles.topCenter}>
          <span style={{
            ...styles.timer,
            ...(isTimeLow() ? styles.timerLow : {}),
          }}>
            {formatTime(timeLeft)}
          </span>
        </div>
        <div style={styles.topRight}>
          <button
            onClick={handleSubmit}
            disabled={submitting || locked}
            style={submitting ? { ...styles.submitBtn, opacity: 0.6 } : styles.submitBtn}
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </div>

      <div style={styles.main}>
        {/* File sidebar */}
        <div style={styles.fileSidebar}>
          <p style={styles.filesLabel}>Files</p>
          {files.map(f => (
            <button
              key={f.name}
              onClick={() => setActiveFile(f.name)}
              style={{
                ...styles.fileTab,
                ...(f.name === activeFile ? styles.fileTabActive : {}),
              }}
            >
              {f.name}
            </button>
          ))}

          {showNewFile ? (
            <div style={styles.newFileRow}>
              <input
                autoFocus
                type="text"
                value={newFileName}
                onChange={e => setNewFileName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addFile() }}
                placeholder="filename.js"
                style={styles.newFileInput}
              />
              <button onClick={addFile} style={styles.newFileConfirm}>+</button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewFile(true)}
              style={styles.addFileBtn}
            >
              + New file
            </button>
          )}

          {/* Task reference */}
          <div style={styles.taskPanel}>
            <p style={styles.taskPanelLabel}>Task</p>
            <p style={styles.taskPanelText}>
              {ruleset?.task_description}
            </p>
            <div style={styles.taskTags}>
              {ruleset?.stack_tags?.map(tag => (
                <span key={tag} style={styles.taskTag}>{tag}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Editor */}
        <div style={styles.editorWrapper}>
          <Editor
            height="100%"
            language={getLanguage(activeFile)}
            value={activeContent}
            onChange={handleEditorChange}
            onMount={handleEditorMount}
            options={{
              readOnly: locked,
              fontSize: 14,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              tabSize: 2,
              lineNumbers: 'on',
              renderLineHighlight: 'line',
              cursorBlinking: 'smooth',
              automaticLayout: true,
            }}
            theme="vs-dark"
          />
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  centered: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--color-bg-primary)',
    fontFamily: 'var(--font-primary)',
    color: 'var(--color-text-primary)',
    padding: '24px',
  },
  // Start card
  startCard: {
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)',
    padding: '40px',
    width: '100%',
    maxWidth: '560px',
    boxShadow: 'var(--shadow-lg)',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--color-text-secondary)',
    fontSize: 'var(--text-sm)',
    cursor: 'pointer',
    padding: 0,
    marginBottom: '20px',
    display: 'block',
  },
  startTitle: {
    fontSize: 'var(--text-3xl)',
    fontWeight: 'var(--weight-semibold)',
    color: 'var(--color-text-primary)',
    margin: '0 0 4px',
    fontFamily: 'var(--font-display)',
    letterSpacing: '-0.02em',
  },
  startCompany: {
    fontSize: 'var(--text-base)',
    color: 'var(--color-text-secondary)',
    margin: 0,
  },
  startDivider: {
    borderTop: '1px solid var(--color-border-light)',
    margin: '24px 0',
  },
  startSectionLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--color-text-tertiary)',
    margin: '0 0 10px',
  },
  startDescription: {
    fontSize: 'var(--text-base)',
    color: 'var(--color-text-primary)',
    lineHeight: '1.7',
    margin: '0 0 24px',
  },
  startMeta: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  startMetaItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  startMetaLabel: {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  startMetaValue: {
    fontSize: 'var(--text-base)',
    color: 'var(--color-text-primary)',
    fontWeight: 'var(--weight-medium)',
  },
  startWarning: {
    fontSize: 'var(--text-sm)',
    color: 'var(--color-primary-light)',
    background: 'rgba(249, 115, 22, 0.1)',
    border: '1px solid rgba(249, 115, 22, 0.3)',
    borderRadius: 'var(--radius-md)',
    padding: '12px 14px',
    margin: '0 0 20px',
    lineHeight: '1.6',
  },
  startBtn: {
    width: '100%',
    padding: '13px',
    backgroundColor: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--weight-semibold)',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(249, 115, 22, 0.3)',
  },
  // Done card
  doneCard: {
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)',
    padding: '48px',
    textAlign: 'center',
    maxWidth: '440px',
    width: '100%',
    boxShadow: 'var(--shadow-lg)',
  },
  doneTitle: {
    fontSize: 'var(--text-2xl)',
    fontWeight: 'var(--weight-semibold)',
    color: 'var(--color-text-primary)',
    margin: '0 0 8px',
    fontFamily: 'var(--font-display)',
  },
  doneSub: {
    fontSize: 'var(--text-base)',
    color: 'var(--color-text-secondary)',
    margin: '0 0 24px',
    lineHeight: '1.6',
  },
  doneBtn: {
    padding: '10px 24px',
    backgroundColor: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-base)',
    fontWeight: 'var(--weight-semibold)',
    cursor: 'pointer',
  },
  // Assessment shell
  shell: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: 'var(--color-bg-primary)',
    fontFamily: 'var(--font-primary)',
    overflow: 'hidden',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    height: '48px',
    backgroundColor: 'var(--color-bg-secondary)',
    borderBottom: '1px solid var(--color-border)',
    flexShrink: 0,
  },
  topLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
  },
  topTitle: {
    fontSize: 'var(--text-base)',
    color: 'var(--color-text-primary)',
    fontWeight: 'var(--weight-medium)',
  },
  aiBadge: {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-primary-light)',
    background: 'rgba(249, 115, 22, 0.1)',
    border: '1px solid rgba(249, 115, 22, 0.3)',
    padding: '2px 8px',
    borderRadius: '999px',
  },
  topCenter: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
  },
  timer: {
    fontSize: 'var(--text-xl)',
    fontWeight: 'var(--weight-semibold)',
    color: 'var(--color-text-primary)',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.05em',
    fontFamily: 'var(--font-mono)',
  },
  timerLow: {
    color: 'var(--color-error)',
  },
  topRight: {
    flex: 1,
    display: 'flex',
    justifyContent: 'flex-end',
  },
  submitBtn: {
    padding: '7px 20px',
    backgroundColor: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--weight-semibold)',
    cursor: 'pointer',
  },
  main: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  fileSidebar: {
    width: '200px',
    backgroundColor: 'var(--color-bg-secondary)',
    borderRight: '1px solid var(--color-border)',
    display: 'flex',
    flexDirection: 'column',
    padding: '12px 0',
    flexShrink: 0,
    overflowY: 'auto',
  },
  filesLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--color-text-tertiary)',
    padding: '0 12px',
    margin: '0 0 8px',
  },
  fileTab: {
    display: 'block',
    width: '100%',
    padding: '6px 12px',
    background: 'none',
    border: 'none',
    color: 'var(--color-text-secondary)',
    fontSize: 'var(--text-sm)',
    cursor: 'pointer',
    textAlign: 'left',
    borderLeft: '2px solid transparent',
    fontFamily: 'var(--font-mono)',
  },
  fileTabActive: {
    color: 'var(--color-text-primary)',
    backgroundColor: 'var(--color-bg-tertiary)',
    borderLeftColor: 'var(--color-primary)',
  },
  addFileBtn: {
    display: 'block',
    width: '100%',
    padding: '6px 12px',
    background: 'none',
    border: 'none',
    color: 'var(--color-text-tertiary)',
    fontSize: 'var(--text-xs)',
    cursor: 'pointer',
    textAlign: 'left',
    marginTop: '4px',
  },
  newFileRow: {
    display: 'flex',
    padding: '4px 8px',
    gap: '4px',
  },
  newFileInput: {
    flex: 1,
    padding: '5px 8px',
    backgroundColor: 'var(--color-bg-tertiary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-text-primary)',
    fontSize: 'var(--text-xs)',
    outline: 'none',
  },
  newFileConfirm: {
    padding: '4px 8px',
    backgroundColor: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    fontSize: 'var(--text-sm)',
  },
  taskPanel: {
    margin: '16px 8px 0',
    padding: '12px',
    backgroundColor: 'var(--color-bg-tertiary)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
  },
  taskPanelLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--color-text-tertiary)',
    margin: '0 0 8px',
  },
  taskPanelText: {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.6',
    margin: '0 0 10px',
  },
  taskTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  taskTag: {
    fontSize: 'var(--text-xs)',
    padding: '3px 8px',
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
    border: '1px solid rgba(249, 115, 22, 0.3)',
    color: 'var(--color-primary-light)',
    borderRadius: '999px',
  },
  editorWrapper: {
    flex: 1,
    overflow: 'hidden',
  },
}