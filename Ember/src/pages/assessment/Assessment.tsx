import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { getTemplateFiles, getTemplateLabel } from '../../lib/starterTemplates'
import type { TestResult } from '../../lib/testHarness'
import { LARGE_PASTE_THRESHOLD } from '../../lib/pasteDetection'
import { toast, extractMessage } from '../../lib/toast'

interface Ruleset {
  task_description: string
  stack_tags: string[]
  task_type: string
  time_limit_mins: number
  time_limit_seconds: number | null
  ai_allowed: boolean
  starter_template: string
  tests: { name: string; content: string; hidden: boolean }[]
  issue_title: string | null
  problem_statement: string | null
  codebase: FileTab[] | null
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
  type: 'insert' | 'delete' | 'paste' | 'focus_loss'
  content: string
  position: number
  threshold?: number
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
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [resumed, setResumed] = useState(false)
  const [started, setStarted] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [locked, setLocked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [assessmentId, setAssessmentId] = useState<string | null>(null)
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)
  const [running, setRunning] = useState(false)
  const [runResults, setRunResults] = useState<TestResult[] | null>(null)
  const [runError, setRunError] = useState<string | null>(null)

  const logs = useRef<LogEntry[]>([])
  const lastSave = useRef<number>(Date.now())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const editorRef = useRef<any>(null)
  const warned5 = useRef(false)
  const warned1 = useRef(false)
  const activeFileRef = useRef(activeFile)
  const focusWarned = useRef(false)
  const lastFocusLog = useRef(0)

  useEffect(() => { activeFileRef.current = activeFile }, [activeFile])

  // Server-defined limit (seconds). Falls back to the minutes column.
  const limitSeconds = ruleset ? (ruleset.time_limit_seconds ?? ruleset.time_limit_mins * 60) : 0

  function flashWarning(msg: string) {
    setWarning(msg)
    setTimeout(() => setWarning(w => (w === msg ? null : w)), 8000)
  }

  // Rebuild file contents by replaying the keystroke log over the seeded
  // baseline — the log stores deltas (absolute offsets), not full snapshots.
  function reconstructFiles(seeded: FileTab[], log: LogEntry[]): FileTab[] {
    const contents: Record<string, string> = {}
    const order: string[] = []
    for (const f of seeded) {
      contents[f.name] = f.content
      order.push(f.name)
    }
    for (const e of log) {
      if (e.type !== 'insert' && e.type !== 'paste' && e.type !== 'delete') continue
      if (!(e.file in contents)) {
        contents[e.file] = ''
        order.push(e.file)
      }
      const c = contents[e.file]
      const pos = e.position
      if (e.type === 'insert' || e.type === 'paste') {
        contents[e.file] = c.slice(0, pos) + e.content + c.slice(pos)
      } else if (e.type === 'delete') {
        contents[e.file] = c.slice(0, pos) + c.slice(pos + e.content.length)
      }
    }
    const rebuilt = order.map(name => ({ name, content: contents[name] }))
    return rebuilt.length > 0 ? rebuilt : seeded
  }

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
      if (rulesetData) setRuleset(rulesetData)

      const limit = rulesetData
        ? (rulesetData.time_limit_seconds ?? rulesetData.time_limit_mins * 60)
        : 0
      const seededFiles = () =>
        Array.isArray(rulesetData?.codebase) && rulesetData!.codebase.length > 0
          ? (rulesetData!.codebase as FileTab[])
          : getTemplateFiles(rulesetData?.starter_template)

      // Resume an in-progress attempt (survives refresh / navigation away).
      // Order by started_at so that, in the unexpected case of duplicate rows,
      // we deterministically resume the most recent one.
      const { data: inProgressRows } = await supabase
        .from('assessments')
        .select('id, started_at')
        .eq('role_id', roleId)
        .eq('candidate_id', user!.id)
        .eq('status', 'in_progress')
        .order('started_at', { ascending: false })

      if (inProgressRows && inProgressRows.length > 1) {
        console.warn(
          `Found ${inProgressRows.length} in-progress assessments for role ${roleId}; ` +
            'resuming the most recent.',
        )
      }
      const inProgress = inProgressRows?.[0] ?? null

      if (inProgress) {
        // Server is the source of truth: if this attempt already expired while
        // the tab was closed, it gets auto-submitted here before we resume.
        await supabase.rpc('enforce_time_limit', { p_assessment_id: inProgress.id })
        const { data: nowSubmitted } = await supabase
          .from('submissions')
          .select('id')
          .eq('role_id', roleId)
          .eq('candidate_id', user!.id)
          .maybeSingle()
        if (nowSubmitted) {
          setAlreadySubmitted(true)
          setLoading(false)
          return
        }

        // Preload prior keystroke log so future saves append rather than wipe it.
        const { data: logRow } = await supabase
          .from('assessment_logs')
          .select('log')
          .eq('assessment_id', inProgress.id)
          .maybeSingle()
        if (Array.isArray(logRow?.log)) logs.current = logRow!.log as LogEntry[]

        // assessments.files only persists on submit, so the latest code lives in
        // the keystroke log — replay the deltas over the seeded baseline.
        const restored = reconstructFiles(seededFiles(), logs.current)

        const startedMs = new Date(inProgress.started_at).getTime()
        setAssessmentId(inProgress.id)
        setStartedAtMs(startedMs)
        setFiles(restored)
        setActiveFile(restored[0].name)
        setTimeLeft(Math.max(0, limit - Math.floor((Date.now() - startedMs) / 1000)))
        setResumed(true)
        setStarted(true)
        setLoading(false)
        return
      }

      // Fresh attempt: seed the editor and wait for the candidate to start.
      if (rulesetData) {
        setTimeLeft(limit)
        const seeded = seededFiles()
        setFiles(seeded)
        setActiveFile(seeded[0].name)
      }

      setLoading(false)
    }

    load()
  }, [roleId, user])

  // Timer — derived from the server-anchored started_at, not a local countdown,
  // so refresh/tab-switch can't extend the limit.
  useEffect(() => {
    if (!started || locked || startedAtMs == null || !ruleset) return
    const limit = ruleset.time_limit_seconds ?? ruleset.time_limit_mins * 60

    const tick = () => {
      const remaining = Math.max(0, limit - Math.floor((Date.now() - startedAtMs) / 1000))
      setTimeLeft(remaining)
      if (remaining <= 300 && remaining > 0 && !warned5.current) {
        warned5.current = true
        flashWarning('5 minutes remaining')
      }
      if (remaining <= 60 && remaining > 0 && !warned1.current) {
        warned1.current = true
        flashWarning('1 minute remaining — your work will be submitted automatically.')
      }
      if (remaining <= 0) handleTimesUp()
    }

    tick()
    timerRef.current = setInterval(tick, 1000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [started, locked, startedAtMs, ruleset])

  // Auto-save logs every 30 seconds
  useEffect(() => {
    if (!started || locked || !assessmentId) return

    const interval = setInterval(() => {
      saveLogs(false)
    }, 30000)

    return () => clearInterval(interval)
  }, [started, locked, assessmentId])

  // Focus-loss detection: tab switches and window blur are logged as integrity
  // signals (not auto-failures). A single tab switch fires both blur and
  // visibilitychange, so de-dupe within a short window.
  useEffect(() => {
    if (!started || locked) return

    const record = (reason: string) => {
      const now = Date.now()
      if (now - lastFocusLog.current < 600) return // collapse blur+visibility pair
      lastFocusLog.current = now
      logs.current.push({
        timestamp: now,
        file: activeFileRef.current,
        type: 'focus_loss',
        content: reason,
        position: 0,
      })
      if (!focusWarned.current) {
        focusWarned.current = true
        flashWarning('Leaving this tab is recorded and visible to the recruiter.')
      }
    }

    const onVisibility = () => { if (document.hidden) record('tab_hidden') }
    const onBlur = () => record('window_blur')
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
    }
  }, [started, locked])

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

    // Create assessment record. started_at anchors the server-side time limit
    // and is written exactly once here — never overwritten.
    const startIso = new Date().toISOString()
    const { data, error } = await supabase
      .from('assessments')
      .insert({
        role_id: roleId,
        candidate_id: user.id,
        status: 'in_progress',
        files: files,
        time_limit_mins: ruleset.time_limit_mins,
        started_at: startIso,
      })
      .select('id')
      .single()

    if (error) {
      console.error('Failed to start assessment:', error.message)
      toast.error('Could not start the assessment', extractMessage(error))
      return
    }

    setAssessmentId(data.id)
    setStartedAtMs(new Date(startIso).getTime())
    setTimeLeft(limitSeconds)
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
        const isPaste = change.text.length > LARGE_PASTE_THRESHOLD
        logs.current.push({
          timestamp: now,
          file: activeFile,
          type: isPaste ? 'paste' : change.text.length > 0 ? 'insert' : 'delete',
          content: change.text,
          position: change.rangeOffset,
          // Record the threshold in effect when this event was captured, so the
          // replay can be interpreted correctly even if the constant changes.
          ...(isPaste ? { threshold: LARGE_PASTE_THRESHOLD } : {}),
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

  async function handleRun() {
    if (!roleId || running || locked) return
    setRunning(true)
    setRunError(null)
    const { data, error } = await supabase.functions.invoke('run-code', {
      body: { role_id: roleId, files, mode: 'practice' },
    })
    if (error) {
      setRunError(error.message)
      setRunResults(null)
    } else {
      setRunResults((data?.results as TestResult[]) ?? [])
    }
    setRunning(false)
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
    const { error: updateError } = await supabase
      .from('assessments')
      .update({
        status,
        files,
        submitted_at: new Date().toISOString(),
      })
      .eq('id', assessmentId)

    await saveLogs(true)

    // Create submission record
    const { error: submitError } = await supabase
      .from('submissions')
      .insert({
        role_id: roleId,
        candidate_id: user.id,
        assessment_id: assessmentId,
        status: 'pending_review',
      })

    if (updateError || submitError) {
      console.error('Failed to submit assessment:', updateError ?? submitError)
      toast.error('Submission failed', extractMessage(updateError ?? submitError))
      setSubmitting(false)
      return
    }

    // Score against the full (incl. hidden) test suite server-side. Failures
    // here must not block the submission from completing.
    try {
      await supabase.functions.invoke('run-code', {
        body: { role_id: roleId, files, mode: 'submit', assessment_id: assessmentId },
      })
    } catch (e) {
      console.error('Scoring failed:', e)
    }

    setSubmitting(false)
    setSubmitted(true)
    toast.success('Assessment submitted successfully')
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
  const hasVisibleTests = ruleset?.tests?.some(t => !t.hidden) ?? false

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

        <p style={styles.startSectionLabel}>{ruleset?.issue_title ? 'The issue' : "What you'll be asked to do"}</p>
        {ruleset?.issue_title && <p style={styles.startIssueTitle}>{ruleset.issue_title}</p>}
        <p style={styles.startDescription}>
          {ruleset?.problem_statement || ruleset?.task_description || 'No task description provided.'}
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
      {/* Time-up overlay — blocks all interaction once the limit is reached. */}
      {locked && (
        <div style={styles.timeupOverlay}>
          <div style={styles.timeupCard}>
            <div style={styles.timeupIcon}>⏱</div>
            <h2 style={styles.timeupTitle}>Time's up</h2>
            <p style={styles.timeupSub}>
              {submitting
                ? 'Submitting your work…'
                : 'The time limit was reached. Your work has been submitted automatically.'}
            </p>
          </div>
        </div>
      )}

      {/* Countdown warning toast (5 min / 1 min). */}
      {warning && !locked && (
        <div style={styles.warnToast}>{warning}</div>
      )}

      {/* Resume banner */}
      {resumed && !locked && (
        <div style={styles.resumeBanner}>
          <span>↩ Resuming your session — your previous work has been restored.</span>
          <button onClick={() => setResumed(false)} style={styles.resumeDismiss}>✕</button>
        </div>
      )}

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
          {hasVisibleTests && (
            <button
              onClick={handleRun}
              disabled={running || locked}
              style={running ? { ...styles.runBtn, opacity: 0.6 } : styles.runBtn}
            >
              {running ? 'Running...' : '▶ Run tests'}
            </button>
          )}
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

          {/* Issue reference */}
          <div style={styles.taskPanel}>
            <p style={styles.taskPanelLabel}>{ruleset?.issue_title ? 'Issue' : 'Task'}</p>
            {ruleset?.issue_title && <p style={styles.issuePanelTitle}>{ruleset.issue_title}</p>}
            <p style={styles.taskPanelText}>
              {ruleset?.problem_statement || ruleset?.task_description}
            </p>
            <div style={styles.taskTags}>
              {ruleset?.stack_tags?.map(tag => (
                <span key={tag} style={styles.taskTag}>{tag}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Editor + results */}
        <div style={styles.editorWrapper}>
          <div style={styles.editorArea}>
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

          {(runResults !== null || runError) && (
            <div style={styles.resultsPanel}>
              <div style={styles.resultsHeader}>
                <span>Test results</span>
                <button onClick={() => { setRunResults(null); setRunError(null) }} style={styles.resultsClose}>×</button>
              </div>
              {runError ? (
                <p style={styles.resultsError}>{runError}</p>
              ) : runResults && runResults.length === 0 ? (
                <p style={styles.resultsEmpty}>No visible tests to run.</p>
              ) : (
                <div style={styles.resultsList}>
                  {runResults?.map((r, i) => (
                    <div key={i} style={styles.resultRow}>
                      <span style={{ ...styles.resultBadge, ...(r.passed ? styles.resultPass : styles.resultFail) }}>
                        {r.passed ? 'PASS' : 'FAIL'}
                      </span>
                      <span style={styles.resultName}>{r.name}</span>
                      {!r.passed && r.message && <span style={styles.resultMsg}>{r.message}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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
  startIssueTitle: {
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--weight-semibold)',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-display)',
    margin: '0 0 8px',
  },
  startDescription: {
    fontSize: 'var(--text-base)',
    color: 'var(--color-text-primary)',
    lineHeight: '1.7',
    margin: '0 0 24px',
    whiteSpace: 'pre-wrap',
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
    background: 'var(--color-primary-soft)',
    border: '1px solid var(--color-primary-soft-border)',
    borderRadius: 'var(--radius-md)',
    padding: '12px 14px',
    margin: '0 0 20px',
    lineHeight: '1.6',
  },
  startBtn: {
    width: '100%',
    padding: '13px',
    backgroundColor: 'var(--color-primary)',
    color: 'var(--color-on-primary)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-lg)',
    fontWeight: 'var(--weight-semibold)',
    cursor: 'pointer',
    boxShadow: 'var(--shadow-primary)',
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
    color: 'var(--color-on-primary)',
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
    background: 'var(--color-primary-soft)',
    border: '1px solid var(--color-primary-soft-border)',
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
  timeupOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.72)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(2px)',
  },
  timeupCard: {
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)',
    padding: '40px 48px',
    textAlign: 'center',
    boxShadow: 'var(--shadow-xl)',
    maxWidth: '380px',
  },
  timeupIcon: { fontSize: '40px', marginBottom: '12px' },
  timeupTitle: {
    fontSize: 'var(--text-2xl)',
    fontWeight: 'var(--weight-semibold)',
    color: 'var(--color-text-primary)',
    margin: '0 0 8px',
    fontFamily: 'var(--font-display)',
  },
  timeupSub: {
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-secondary)',
    margin: 0,
    lineHeight: 1.5,
  },
  resumeBanner: {
    position: 'fixed',
    top: '70px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 900,
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    background: 'var(--color-success-soft)',
    color: 'var(--color-success-text)',
    border: '1px solid var(--color-success)',
    borderRadius: 'var(--radius-md)',
    padding: '10px 14px 10px 18px',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--weight-medium)',
    boxShadow: 'var(--shadow-lg)',
  },
  resumeDismiss: {
    background: 'transparent',
    border: 'none',
    color: 'var(--color-success-text)',
    cursor: 'pointer',
    fontSize: 'var(--text-sm)',
    padding: '0 2px',
    opacity: 0.7,
  },
  warnToast: {
    position: 'fixed',
    top: '70px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 900,
    background: 'var(--color-error-soft)',
    color: 'var(--color-error-text)',
    border: '1px solid var(--color-error)',
    borderRadius: 'var(--radius-md)',
    padding: '10px 18px',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--weight-semibold)',
    boxShadow: 'var(--shadow-lg)',
  },
  topRight: {
    flex: 1,
    display: 'flex',
    justifyContent: 'flex-end',
  },
  submitBtn: {
    padding: '7px 20px',
    backgroundColor: 'var(--color-primary)',
    color: 'var(--color-on-primary)',
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
    color: 'var(--color-on-primary)',
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
  issuePanelTitle: {
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--weight-semibold)',
    color: 'var(--color-text-primary)',
    margin: '0 0 6px',
    lineHeight: '1.4',
  },
  taskPanelText: {
    fontSize: 'var(--text-xs)',
    color: 'var(--color-text-secondary)',
    lineHeight: '1.6',
    margin: '0 0 10px',
    whiteSpace: 'pre-wrap',
  },
  taskTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  taskTag: {
    fontSize: 'var(--text-xs)',
    padding: '3px 8px',
    backgroundColor: 'var(--color-primary-soft)',
    border: '1px solid var(--color-primary-soft-border)',
    color: 'var(--color-primary-light)',
    borderRadius: '999px',
  },
  editorWrapper: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  editorArea: {
    flex: 1,
    overflow: 'hidden',
    minHeight: 0,
  },
  runBtn: {
    padding: '7px 16px',
    backgroundColor: 'transparent',
    color: 'var(--color-text-primary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    fontWeight: 'var(--weight-semibold)',
    cursor: 'pointer',
    marginRight: '10px',
  },
  resultsPanel: {
    flexShrink: 0,
    maxHeight: '40%',
    overflowY: 'auto',
    backgroundColor: 'var(--color-bg-secondary)',
    borderTop: '1px solid var(--color-border)',
    padding: '12px 16px',
  },
  resultsHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: 'var(--text-xs)',
    fontWeight: 'var(--weight-semibold)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--color-text-tertiary)',
    marginBottom: '10px',
  },
  resultsClose: {
    background: 'none', border: 'none', color: 'var(--color-text-tertiary)',
    fontSize: 'var(--text-lg)', cursor: 'pointer', lineHeight: 1, padding: 0,
  },
  resultsError: { fontSize: 'var(--text-sm)', color: 'var(--color-error)', margin: 0 },
  resultsEmpty: { fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', margin: 0 },
  resultsList: { display: 'flex', flexDirection: 'column', gap: '6px' },
  resultRow: { display: 'flex', alignItems: 'center', gap: '10px', fontSize: 'var(--text-sm)' },
  resultBadge: {
    fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px',
    letterSpacing: '0.05em', flexShrink: 0,
  },
  resultPass: { color: 'var(--color-success)', backgroundColor: 'var(--color-success-soft)' },
  resultFail: { color: 'var(--color-error)', backgroundColor: 'var(--color-error-soft)' },
  resultName: { color: 'var(--color-text-primary)' },
  resultMsg: { color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' },
}