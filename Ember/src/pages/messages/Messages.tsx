import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useDemo } from '../../hooks/useDemo'

interface Thread {
  id: string
  recruiter_id: string
  candidate_id: string
  role_id: string
  created_at: string
  other_name: string | null
  other_photo: string | null
  role_title: string
  last_message: string | null
  unread: number
}

interface Message {
  id: string
  thread_id: string
  sender_id: string
  content: string
  read: boolean
  created_at: string
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function Messages() {
  const { user, profile, isRecruiter } = useAuth()
  const { guard } = useDemo()
  const [threads, setThreads] = useState<Thread[]>([])
  const [activeThread, setActiveThread] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load threads
    useEffect(() => {
    if (!user || !profile) return
    loadThreads()
    }, [user, profile])

  // Load messages when thread changes
  useEffect(() => {
    if (!activeThread) return
    loadMessages(activeThread)
    markThreadRead(activeThread)

    // Subscribe to new messages in this thread
    const channel = supabase
      .channel(`thread-${activeThread}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `thread_id=eq.${activeThread}`,
      }, (payload) => {
        setMessages(prev => [...prev, payload.new as Message])
        markThreadRead(activeThread)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [activeThread])

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadThreads() {
    const idField = isRecruiter ? 'recruiter_id' : 'candidate_id'

    const { data: threadData } = await supabase
      .from('threads')
      .select('*')
      .eq(idField, user!.id)
      .order('created_at', { ascending: false })

    if (!threadData) {
      setLoading(false)
      return
    }

    // Enrich each thread with other party info and last message
    const enriched: Thread[] = []
    for (const t of threadData) {
      const otherId = isRecruiter ? t.candidate_id : t.recruiter_id

      const { data: otherProfile } = await supabase
        .from('profiles')
        .select('full_name, photo_url')
        .eq('id', otherId)
        .single()

      const { data: roleData } = await supabase
        .from('roles')
        .select('title')
        .eq('id', t.role_id)
        .single()

      const { data: lastMsg } = await supabase
        .from('messages')
        .select('content')
        .eq('thread_id', t.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const { count: unreadCount } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('thread_id', t.id)
        .eq('read', false)
        .neq('sender_id', user!.id)

      enriched.push({
        ...t,
        other_name: otherProfile?.full_name ?? 'Unknown',
        other_photo: otherProfile?.photo_url ?? null,
        role_title: roleData?.title ?? 'Unknown role',
        last_message: lastMsg?.content ?? null,
        unread: unreadCount ?? 0,
      })
    }

    setThreads(enriched)
    setLoading(false)
  }

  async function loadMessages(threadId: string) {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })

    if (data) setMessages(data)
  }

  async function markThreadRead(threadId: string) {
    await supabase
      .from('messages')
      .update({ read: true })
      .eq('thread_id', threadId)
      .neq('sender_id', user!.id)
      .eq('read', false)

    // Update local unread count
    setThreads(prev => prev.map(t =>
      t.id === threadId ? { ...t, unread: 0 } : t
    ))
  }

  async function handleSend() {
    if (!newMessage.trim() || !activeThread || !user) return
    if (guard()) return
    setSending(true)

    const content = newMessage.trim()
    setNewMessage('')

    await supabase
      .from('messages')
      .insert({
        thread_id: activeThread,
        sender_id: user.id,
        content,
        read: false,
      })

    setSending(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const active = threads.find(t => t.id === activeThread)

  if (loading) return <div style={styles.loading}>Loading messages...</div>

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Messages</h1>

      <div style={styles.container}>
        {/* Thread list */}
        <div style={styles.threadList}>
          {threads.length === 0 ? (
            <div style={styles.noThreads}>No messages yet</div>
          ) : (
            threads.map(thread => (
              <button
                key={thread.id}
                onClick={() => setActiveThread(thread.id)}
                style={{
                  ...styles.threadItem,
                  ...(activeThread === thread.id ? styles.threadItemActive : {}),
                }}
              >
                <div style={styles.threadAvatar}>
                  {thread.other_photo
                    ? <img src={thread.other_photo} alt="" style={styles.threadAvatarImg} />
                    : <span style={styles.threadAvatarInitial}>
                        {thread.other_name?.charAt(0).toUpperCase() ?? '?'}
                      </span>
                  }
                </div>
                <div style={styles.threadInfo}>
                  <div style={styles.threadTopRow}>
                    <span style={styles.threadName}>{thread.other_name}</span>
                    {thread.unread > 0 && (
                      <span style={styles.threadUnread}>{thread.unread}</span>
                    )}
                  </div>
                  <span style={styles.threadRole}>{thread.role_title}</span>
                  {thread.last_message && (
                    <span style={styles.threadPreview}>{thread.last_message}</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Message panel */}
        <div style={styles.messagePanel}>
          {!activeThread ? (
            <div style={styles.noActive}>
              Select a conversation to view messages
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div style={styles.messageHeader}>
                <div style={styles.threadAvatar}>
                  {active?.other_photo
                    ? <img src={active.other_photo} alt="" style={styles.threadAvatarImg} />
                    : <span style={styles.threadAvatarInitial}>
                        {active?.other_name?.charAt(0).toUpperCase() ?? '?'}
                      </span>
                  }
                </div>
                <div>
                  <p style={styles.headerName}>{active?.other_name}</p>
                  <p style={styles.headerRole}>{active?.role_title}</p>
                </div>
              </div>

              {/* Messages */}
              <div style={styles.messageList}>
                {messages.map(msg => {
                  const isMine = msg.sender_id === user!.id
                  return (
                    <div
                      key={msg.id}
                      style={{
                        ...styles.messageRow,
                        justifyContent: isMine ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <div style={{
                        ...styles.bubble,
                        ...(isMine ? styles.bubbleMine : styles.bubbleTheirs),
                      }}>
                        <p style={styles.bubbleText}>{msg.content}</p>
                        <span style={styles.bubbleTime}>
                          {formatTime(msg.created_at)}
                        </span>
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              <div style={styles.composer}>
                <textarea
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  style={styles.composerInput}
                  rows={1}
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !newMessage.trim()}
                  style={(sending || !newMessage.trim())
                    ? { ...styles.sendBtn, opacity: 0.5 }
                    : styles.sendBtn}
                >
                  Send
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: '1000px' },
  loading: { padding: '2rem', color: 'var(--color-text-secondary)', fontSize: '14px' },
  title: { fontSize: 'var(--text-4xl)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)', margin: '0 0 24px', fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' },
  container: {
    display: 'flex',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-xl)',
    overflow: 'hidden',
    height: '600px',
    background: 'var(--color-bg-secondary)',
    boxShadow: 'var(--shadow-md)',
  },
  threadList: {
    width: '300px',
    borderRight: '1px solid var(--color-border-light)',
    overflowY: 'auto',
    flexShrink: 0,
    backgroundColor: 'var(--color-bg-secondary)',
  },
  noThreads: { padding: '24px', fontSize: '13px', color: 'var(--color-text-secondary)', textAlign: 'center' },
  threadItem: {
    display: 'flex',
    gap: '12px',
    padding: '16px 16px',
    width: '100%',
    background: 'none',
    border: 'none',
    borderBottom: '1px solid var(--color-border-light)',
    cursor: 'pointer',
    textAlign: 'left',
    alignItems: 'flex-start',
    transition: 'background var(--transition-fast)',
  },
  threadItemActive: { backgroundColor: 'var(--color-bg-tertiary)' },
  threadAvatar: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-light))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  threadAvatarImg: { width: '100%', height: '100%', objectFit: 'cover' },
  threadAvatarInitial: { fontSize: '16px', fontWeight: '600', color: 'var(--color-on-primary)', fontFamily: 'var(--font-display)' },
  threadInfo: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' },
  threadTopRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  threadName: { fontSize: '14px', fontWeight: '600', color: 'var(--color-text-primary)' },
  threadUnread: {
    backgroundColor: 'var(--color-primary)',
    color: 'var(--color-on-primary)',
    fontSize: '11px',
    fontWeight: '600',
    padding: '2px 8px',
    borderRadius: '999px',
  },
  threadRole: { fontSize: '12px', color: 'var(--color-text-secondary)' },
  threadPreview: {
    fontSize: '12px',
    color: 'var(--color-text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  messagePanel: { flex: 1, display: 'flex', flexDirection: 'column' },
  noActive: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    color: 'var(--color-text-secondary)',
  },
  messageHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 20px',
    borderBottom: '1px solid var(--color-border-light)',
    flexShrink: 0,
    backgroundColor: 'var(--color-bg-tertiary)',
  },
  headerName: { fontSize: '14px', fontWeight: '600', color: 'var(--color-text-primary)', margin: 0 },
  headerRole: { fontSize: '12px', color: 'var(--color-text-secondary)', margin: 0 },
  messageList: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  messageRow: { display: 'flex' },
  bubble: {
    maxWidth: '70%',
    padding: '12px 16px',
    borderRadius: 'var(--radius-lg)',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  bubbleMine: {
    backgroundColor: 'var(--color-primary)',
    color: 'var(--color-on-primary)',
    borderBottomRightRadius: 'var(--radius-sm)',
  },
  bubbleTheirs: {
    backgroundColor: 'var(--color-bg-tertiary)',
    color: 'var(--color-text-primary)',
    borderBottomLeftRadius: 'var(--radius-sm)',
  },
  bubbleText: {
    fontSize: '14px',
    margin: 0,
    lineHeight: '1.5',
    color: 'inherit',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  bubbleTime: { fontSize: '11px', opacity: 0.7 },
  composer: {
    display: 'flex',
    gap: '10px',
    padding: '16px',
    borderTop: '1px solid var(--color-border-light)',
    flexShrink: 0,
    alignItems: 'flex-end',
    backgroundColor: 'var(--color-bg-secondary)',
  },
  composerInput: {
    flex: 1,
    padding: '11px 14px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px',
    color: 'var(--color-text-primary)',
    backgroundColor: 'var(--color-bg-tertiary)',
    outline: 'none',
    resize: 'none',
    fontFamily: 'var(--font-primary)',
    maxHeight: '100px',
    transition: 'all var(--transition-fast)',
  },
  sendBtn: {
    padding: '11px 20px',
    backgroundColor: 'var(--color-primary)',
    color: 'var(--color-on-primary)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'all var(--transition-fast)',
    boxShadow: 'var(--shadow-primary)',
  },
}