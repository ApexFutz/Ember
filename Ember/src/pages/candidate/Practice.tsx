import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import { supabase } from '../../lib/supabase'
import type { TestResult } from '../../lib/testHarness'

interface FileTab {
  name: string
  content: string
}

interface PracticeTask {
  skill_label: string
  tier: string
  task_description: string
  starter_files: FileTab[]
  runtime: string
}

function getLanguage(filename: string) {
  if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return 'typescript'
  if (filename.endsWith('.py')) return 'python'
  if (filename.endsWith('.json')) return 'json'
  if (filename.endsWith('.md')) return 'markdown'
  return 'javascript'
}

export default function Practice() {
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()

  const [task, setTask] = useState<PracticeTask | null>(null)
  const [files, setFiles] = useState<FileTab[]>([])
  const [activeFile, setActiveFile] = useState('')
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [runResults, setRunResults] = useState<TestResult[] | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [score, setScore] = useState<{ passed: number; total: number } | null>(null)

  useEffect(() => {
    if (!taskId) return
    async function load() {
      // Never select `tests` — hidden bodies stay server-side.
      const { data } = await supabase
        .from('practice_tasks')
        .select('skill_label, tier, task_description, starter_files, runtime')
        .eq('id', taskId)
        .single()
      if (data) {
        setTask(data as PracticeTask)
        const starter = (data.starter_files as FileTab[]) ?? []
        const seeded = starter.length ? starter : [{ name: 'main.js', content: '// Start coding here\n' }]
        setFiles(seeded)
        setActiveFile(seeded[0].name)
      }
      setLoading(false)
    }
    load()
  }, [taskId])

  function handleEditorChange(value: string | undefined) {
    if (value === undefined) return
    setFiles(prev => prev.map(f => (f.name === activeFile ? { ...f, content: value } : f)))
  }

  async function handleRun() {
    if (!taskId || running) return
    setRunning(true)
    setRunError(null)
    const { data, error } = await supabase.functions.invoke('run-code', {
      body: { practice_task_id: taskId, files, mode: 'practice' },
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
    if (!taskId || submitting) return
    setSubmitting(true)
    setRunError(null)
    const { data, error } = await supabase.functions.invoke('run-code', {
      body: { practice_task_id: taskId, files, mode: 'submit' },
    })
    if (error) {
      setRunError(error.message)
    } else {
      setScore({ passed: data?.tests_passed ?? 0, total: data?.tests_total ?? 0 })
    }
    setSubmitting(false)
  }

  const activeContent = files.find(f => f.name === activeFile)?.content ?? ''

  if (loading) return <div style={styles.centered}>Loading practice…</div>

  if (!task) return (
    <div style={styles.centered}>
      <div style={styles.doneCard}>
        <h2 style={styles.doneTitle}>Task not found</h2>
        <button onClick={() => navigate('/candidate/skills')} style={styles.doneBtn}>Back to skills</button>
      </div>
    </div>
  )

  if (score) return (
    <div style={styles.centered}>
      <div style={styles.doneCard}>
        <h2 style={styles.doneTitle}>{score.passed}/{score.total} tests passed</h2>
        <p style={styles.doneSub}>
          {score.total > 0 ? Math.round((score.passed / score.total) * 100) : 0}% — your {task.skill_label} profile has been updated.
        </p>
        <button onClick={() => navigate('/candidate/skills')} style={styles.doneBtn}>Back to skills</button>
      </div>
    </div>
  )

  return (
    <div style={styles.shell}>
      <div style={styles.topBar}>
        <div style={styles.topLeft}>
          <span style={styles.topTitle}>{task.skill_label} practice</span>
          <span style={styles.tierBadge}>{task.tier}</span>
        </div>
        <div style={styles.topRight}>
          <button onClick={handleRun} disabled={running} style={running ? { ...styles.runBtn, opacity: 0.6 } : styles.runBtn}>
            {running ? 'Running…' : '▶ Run tests'}
          </button>
          <button onClick={handleSubmit} disabled={submitting} style={submitting ? { ...styles.submitBtn, opacity: 0.6 } : styles.submitBtn}>
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>

      <div style={styles.main}>
        <div style={styles.sidebar}>
          <p style={styles.label}>Files</p>
          {files.map(f => (
            <button
              key={f.name}
              onClick={() => setActiveFile(f.name)}
              style={{ ...styles.fileTab, ...(f.name === activeFile ? styles.fileTabActive : {}) }}
            >
              {f.name}
            </button>
          ))}
          <div style={styles.taskPanel}>
            <p style={styles.label}>Task</p>
            <p style={styles.taskText}>{task.task_description}</p>
          </div>
        </div>

        <div style={styles.editorWrapper}>
          <div style={styles.editorArea}>
            <Editor
              height="100%"
              language={getLanguage(activeFile)}
              value={activeContent}
              onChange={handleEditorChange}
              options={{
                fontSize: 14, minimap: { enabled: false }, scrollBeyondLastLine: false,
                wordWrap: 'on', tabSize: 2, automaticLayout: true,
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
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'var(--color-bg-primary)', fontFamily: 'var(--font-primary)',
    color: 'var(--color-text-primary)', padding: '24px',
  },
  doneCard: {
    background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)', padding: '48px', textAlign: 'center', maxWidth: '440px',
    width: '100%', boxShadow: 'var(--shadow-lg)',
  },
  doneTitle: { fontSize: 'var(--text-2xl)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)', margin: '0 0 8px', fontFamily: 'var(--font-display)' },
  doneSub: { fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)', margin: '0 0 24px', lineHeight: 1.6 },
  doneBtn: { padding: '10px 24px', backgroundColor: 'var(--color-primary)', color: 'var(--color-on-primary)', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-base)', fontWeight: 'var(--weight-semibold)', cursor: 'pointer' },
  shell: { display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: 'var(--color-bg-primary)', fontFamily: 'var(--font-primary)', overflow: 'hidden' },
  topBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: '48px', backgroundColor: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)', flexShrink: 0 },
  topLeft: { display: 'flex', alignItems: 'center', gap: '12px' },
  topTitle: { fontSize: 'var(--text-base)', color: 'var(--color-text-primary)', fontWeight: 'var(--weight-medium)' },
  tierBadge: { fontSize: 'var(--text-xs)', color: 'var(--color-primary-light)', background: 'var(--color-primary-soft)', border: '1px solid var(--color-primary-soft-border)', padding: '2px 8px', borderRadius: '999px', textTransform: 'capitalize' },
  topRight: { display: 'flex', alignItems: 'center', gap: '10px' },
  runBtn: { padding: '7px 16px', backgroundColor: 'transparent', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', cursor: 'pointer' },
  submitBtn: { padding: '7px 20px', backgroundColor: 'var(--color-primary)', color: 'var(--color-on-primary)', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', cursor: 'pointer' },
  main: { display: 'flex', flex: 1, overflow: 'hidden' },
  sidebar: { width: '220px', backgroundColor: 'var(--color-bg-secondary)', borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', padding: '12px 0', flexShrink: 0, overflowY: 'auto' },
  label: { fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', padding: '0 12px', margin: '0 0 8px' },
  fileTab: { display: 'block', width: '100%', padding: '6px 12px', background: 'none', border: 'none', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', cursor: 'pointer', textAlign: 'left', borderLeft: '2px solid transparent', fontFamily: 'var(--font-mono)' },
  fileTabActive: { color: 'var(--color-text-primary)', backgroundColor: 'var(--color-bg-tertiary)', borderLeftColor: 'var(--color-primary)' },
  taskPanel: { margin: '16px 8px 0', padding: '12px', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' },
  taskText: { fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' },
  editorWrapper: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  editorArea: { flex: 1, overflow: 'hidden', minHeight: 0 },
  resultsPanel: { flexShrink: 0, maxHeight: '40%', overflowY: 'auto', backgroundColor: 'var(--color-bg-secondary)', borderTop: '1px solid var(--color-border)', padding: '12px 16px' },
  resultsHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: '10px' },
  resultsClose: { background: 'none', border: 'none', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-lg)', cursor: 'pointer', lineHeight: 1, padding: 0 },
  resultsError: { fontSize: 'var(--text-sm)', color: 'var(--color-error)', margin: 0 },
  resultsEmpty: { fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', margin: 0 },
  resultsList: { display: 'flex', flexDirection: 'column', gap: '6px' },
  resultRow: { display: 'flex', alignItems: 'center', gap: '10px', fontSize: 'var(--text-sm)' },
  resultBadge: { fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', letterSpacing: '0.05em', flexShrink: 0 },
  resultPass: { color: 'var(--color-success)', backgroundColor: 'var(--color-success-soft)' },
  resultFail: { color: 'var(--color-error)', backgroundColor: 'var(--color-error-soft)' },
  resultName: { color: 'var(--color-text-primary)' },
  resultMsg: { color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' },
}
