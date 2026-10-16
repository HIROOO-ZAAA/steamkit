'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { Bell, Check, Clipboard, Eye, Globe, Heart, LockKeyhole, MessageSquareText, Radio, Rocket, Star, Trophy, Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Project, StreamEvent } from '@/lib/types'
import styles from './project.module.css'

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params)
  const [project, setProject] = useState<Project | null>(null)
  const [events, setEvents] = useState<StreamEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  // Event form state
  const [type, setType] = useState<StreamEvent['type']>('donation')
  const [senderName, setSenderName] = useState('')
  const [content, setContent] = useState('')
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const supabase = createClient()

  useEffect(() => {
    async function loadProjectData() {
      // Fetch project
      const { data: projData, error: projError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()

      if (projError || !projData) {
        setLoading(false)
        return
      }

      setProject(projData)

      // Fetch existing events
      const { data: eventsData } = await supabase
        .from('stream_events')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (eventsData) {
        setEvents(eventsData)
      }

      setLoading(false)
    }

    loadProjectData()

    // Subscribe to realtime changes for this project's events
    const channel = supabase
      .channel(`project-events-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'stream_events',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const newEv = payload.new as StreamEvent
          setEvents((prev) => [newEv, ...prev])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [projectId])

  async function handleSendEvent(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setFormError('')

    try {
      const { error } = await supabase.from('stream_events').insert({
        project_id: projectId,
        type,
        sender_name: senderName || 'Anonymous',
        content,
        amount: amount ? parseFloat(amount) : null,
      })

      if (error) throw error

      // Reset form fields
      setContent('')
      setAmount('')
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to send event')
    } finally {
      setSubmitting(false)
    }
  }

  function copyPublicLink() {
    if (!project) return
    const url = `${window.location.origin}/p/${project.slug}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className={styles.loadingWrapper}>
        <div className="skeleton" style={{ width: '100%', height: '200px' }} />
        <div className="skeleton" style={{ width: '100%', height: '400px' }} />
      </div>
    )
  }

  if (!project) {
    return (
      <div className={`${styles.notFound} card`}>
        <h2>Project Not Found</h2>
        <p>The project you are looking for does not exist or you do not have permission to view it.</p>
        <Link href="/dashboard" className="btn btn-primary">
          Back to Dashboard
        </Link>
      </div>
    )
  }

  const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}/p/${project.slug}` : `/p/${project.slug}`

  return (
    <div className={styles.page}>
      {/* Top Banner */}
      <div className={styles.topHeader}>
        <div className={styles.topHeaderLeft}>
          <Link href="/dashboard" className="btn btn-ghost btn-sm">
            ← Dashboard
          </Link>
          <div className={styles.titleRow}>
            <div className={styles.colorTag} style={{ background: project.theme_color || 'var(--brand-primary)' }} />
            <h1 className={styles.title}>{project.name}</h1>
            <span className={`badge ${project.is_public ? 'badge-green' : 'badge-purple'}`}>
              {project.is_public ? <><Globe size={14} /> Public</> : <><LockKeyhole size={14} /> Private</>}
            </span>
          </div>
        </div>

        <div className={styles.topHeaderActions}>
          <button onClick={copyPublicLink} className="btn btn-secondary btn-sm" id="copy-public-link-btn">
            {copied ? <><Check size={15} /> Copied!</> : <><Clipboard size={15} /> Copy Share Link</>}
          </button>
          <Link href={`/p/${project.slug}`} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm" id="open-live-page-btn">
            <Eye size={15} /> Open Live View
          </Link>
        </div>
      </div>

      {/* Grid: Event Form + Live Feed */}
      <div className={styles.grid}>
        {/* Left Column: Broadcast Control Panel */}
        <div className={`${styles.controlCard} card`}>
          <div className={styles.cardHeader}>
            <h3><Zap size={17} /> Broadcast New Event</h3>
            <p>Trigger live activity that will appear instantly on your public page.</p>
          </div>

          <form onSubmit={handleSendEvent} className={styles.form} id="broadcast-event-form">
            <div className="input-group">
              <label className="input-label">Event Type</label>
              <div className={styles.typeSelector}>
                {[
                  { id: 'donation', label: 'Donation', icon: Heart, color: 'purple' },
                  { id: 'message', label: 'Message', icon: MessageSquareText, color: 'cyan' },
                  { id: 'alert', label: 'Alert', icon: Bell, color: 'amber' },
                  { id: 'follow', label: 'Follow', icon: Star, color: 'green' },
                  { id: 'milestone', label: 'Milestone', icon: Trophy, color: 'red' },
                ].map((t) => {
                  const Icon = t.icon
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className={`${styles.typeBtn} ${type === t.id ? styles[`type_${t.color}`] : ''}`}
                      onClick={() => setType(t.id as StreamEvent['type'])}
                    >
                      <Icon size={15} />
                      {t.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="sender-name">Sender / User Name</label>
              <input
                id="sender-name"
                type="text"
                className="input"
                placeholder="e.g. GamerPro99 or Anonymous"
                value={senderName}
                onChange={e => setSenderName(e.target.value)}
                disabled={submitting}
              />
            </div>

            {type === 'donation' && (
              <div className="input-group">
                <label className="input-label" htmlFor="amount">Amount ($)</label>
                <input
                  id="amount"
                  type="number"
                  step="0.01"
                  className="input"
                  placeholder="25.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  disabled={submitting}
                />
              </div>
            )}

            <div className="input-group">
              <label className="input-label" htmlFor="content">Event Message / Text</label>
              <textarea
                id="content"
                className="input"
                placeholder={
                  type === 'donation' ? 'Thanks for the awesome stream!' :
                  type === 'milestone' ? 'Goal of $1,000 reached!' :
                  type === 'alert' ? 'Stream starts in 5 minutes!' :
                  'Type your message...'
                }
                value={content}
                onChange={e => setContent(e.target.value)}
                required
                disabled={submitting}
                rows={3}
              />
            </div>

            {formError && <div className="alert-error">{formError}</div>}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.875rem' }}
              disabled={submitting}
              id="broadcast-submit-btn"
            >
              {submitting ? 'Broadcasting...' : <><Rocket size={16} /> Broadcast Live Event</>}
            </button>
          </form>
        </div>

        {/* Right Column: Live Event Stream */}
        <div className={`${styles.feedCard} card`}>
          <div className={styles.feedHeader}>
            <div className={styles.feedTitleRow}>
              <h3>Live Activity Feed</h3>
              <span className="badge badge-green">
                <span className="live-dot" /> REALTIME
              </span>
            </div>
            <span className={styles.eventCount}>{events.length} events total</span>
          </div>

          {events.length === 0 ? (
            <div className={styles.emptyFeed}>
              <Radio size={24} />
              <p>No events broadcast yet.</p>
              <small>Use the broadcast panel on the left to trigger live updates.</small>
            </div>
          ) : (
            <div className={styles.feedList}>
              {events.map((ev) => (
                <div key={ev.id} className={`${styles.feedItem} ${styles[`item_${ev.type}`]} animate-slide-in-right`}>
                  <span className={styles.feedIcon}>{getEventIcon(ev.type)}</span>
                  <div className={styles.feedBody}>
                    <div className={styles.feedBodyTop}>
                      <strong>{ev.sender_name || 'Anonymous'}</strong>
                      {ev.amount && (
                        <span className={styles.feedAmount}>${ev.amount.toFixed(2)}</span>
                      )}
                    </div>
                    <p className={styles.feedText}>{ev.content}</p>
                  </div>
                  <span className={styles.feedTime}>{formatTime(ev.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function getEventIcon(type: string) {
  const icons = {
    donation: Heart,
    message: MessageSquareText,
    alert: Bell,
    follow: Star,
    milestone: Trophy,
  }
  const Icon = icons[type as keyof typeof icons] ?? Radio
  return <Icon size={17} strokeWidth={1.8} />
}

function formatTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
