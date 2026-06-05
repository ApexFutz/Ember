import React, { useState } from 'react'
import Editor from '@monaco-editor/react'

export interface CodeFile {
  name: string
  content: string
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

/**
 * A small multi-file code editor: a file rail (add / rename / delete) plus one
 * Monaco editor bound to the active file. Controlled via `files` + `onChange`.
 */
export default function CodebaseEditor({
  files,
  onChange,
  height = '320px',
}: {
  files: CodeFile[]
  onChange: (files: CodeFile[]) => void
  height?: string
}) {
  const [active, setActive] = useState(files[0]?.name ?? '')
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const activeFile = files.find(f => f.name === active) ?? files[0]

  function addFile() {
    const name = newName.trim()
    if (!name || files.some(f => f.name === name)) return
    onChange([...files, { name, content: '' }])
    setActive(name)
    setNewName('')
    setAdding(false)
  }

  function removeFile(name: string) {
    const next = files.filter(f => f.name !== name)
    onChange(next)
    if (active === name) setActive(next[0]?.name ?? '')
  }

  function commitRename(oldName: string) {
    const name = renameValue.trim()
    if (name && !files.some(f => f.name === name)) {
      onChange(files.map(f => (f.name === oldName ? { ...f, name } : f)))
      if (active === oldName) setActive(name)
    }
    setRenaming(null)
  }

  function updateContent(value: string | undefined) {
    if (!activeFile) return
    onChange(files.map(f => (f.name === activeFile.name ? { ...f, content: value ?? '' } : f)))
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.rail}>
        {files.map(f => (
          <div key={f.name} style={styles.fileRow}>
            {renaming === f.name ? (
              <input
                autoFocus
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={() => commitRename(f.name)}
                onKeyDown={e => { if (e.key === 'Enter') commitRename(f.name) }}
                style={styles.renameInput}
              />
            ) : (
              <button
                onClick={() => setActive(f.name)}
                onDoubleClick={() => { setRenaming(f.name); setRenameValue(f.name) }}
                style={{ ...styles.fileBtn, ...(f.name === active ? styles.fileBtnActive : {}) }}
                title="Double-click to rename"
              >
                {f.name}
              </button>
            )}
            <button onClick={() => removeFile(f.name)} style={styles.delBtn} title="Delete file">×</button>
          </div>
        ))}

        {adding ? (
          <div style={styles.fileRow}>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addFile() }}
              onBlur={() => { if (!newName.trim()) setAdding(false); else addFile() }}
              placeholder="filename.js"
              style={styles.renameInput}
            />
          </div>
        ) : (
          <button onClick={() => setAdding(true)} style={styles.addBtn}>+ Add file</button>
        )}
      </div>

      <div style={{ ...styles.editor, height }}>
        {activeFile ? (
          <Editor
            height="100%"
            language={getLanguage(activeFile.name)}
            value={activeFile.content}
            onChange={updateContent}
            options={{
              fontSize: 13, minimap: { enabled: false }, scrollBeyondLastLine: false,
              wordWrap: 'on', tabSize: 2, automaticLayout: true, lineNumbers: 'on',
            }}
            theme="vs-dark"
          />
        ) : (
          <div style={styles.empty}>Add a file to start building the codebase.</div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' },
  rail: { width: '150px', flexShrink: 0, backgroundColor: 'var(--color-bg-tertiary)', borderRight: '1px solid var(--color-border)', padding: '8px', display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto' },
  fileRow: { display: 'flex', alignItems: 'center', gap: '2px' },
  fileBtn: { flex: 1, textAlign: 'left', background: 'none', border: 'none', color: 'var(--color-text-secondary)', fontSize: '12px', fontFamily: 'var(--font-mono)', padding: '5px 8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  fileBtnActive: { backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' },
  delBtn: { background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: '0 4px', flexShrink: 0 },
  renameInput: { flex: 1, width: '100%', boxSizing: 'border-box', padding: '4px 6px', fontSize: '12px', fontFamily: 'var(--font-mono)', backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-primary)', outline: 'none' },
  addBtn: { marginTop: '4px', background: 'none', border: 'none', color: 'var(--color-text-tertiary)', fontSize: '12px', cursor: 'pointer', textAlign: 'left', padding: '5px 8px' },
  editor: { flex: 1, minWidth: 0 },
  empty: { padding: '24px', fontSize: '13px', color: 'var(--color-text-secondary)', textAlign: 'center' },
}
