'use client'

import { useCallback, useEffect, useState } from 'react'
import { Dices, Gift, Trophy, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import styles from './raffle.module.css'

interface Participant {
  id: string
  username: string
  tickets: number
}

export default function RafflePage() {
  const [newUsername, setNewUsername] = useState('')
  const [participants, setParticipants] = useState<Participant[]>([])

  const [spinning, setSpinning] = useState(false)
  const [winner, setWinner] = useState<Participant | null>(null)

  // The raffle row itself. Entries used to live only in React state, which
  // meant a refresh lost them and "Reset" just cleared the screen.
  const [raffleId, setRaffleId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const supabase = createClient()

  const loadEntries = useCallback(
    async (id: string) => {
      const { data, error: err } = await supabase
        .from('raffle_entries')
        .select('id, username, entries_count')
        .eq('raffle_id', id)
        .order('created_at', { ascending: true })

      if (err) {
        setError(err.message)
        return
      }

      setParticipants(
        (data ?? []).map(row => ({
          id: row.id,
          username: row.username,
          tickets: row.entries_count,
        })),
      )
    },
    [supabase],
  )

  // Finds the creator's raffle, creating one on first visit, then loads its
  // entries.
  useEffect(() => {
    let cancelled = false

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) {
        setLoading(false)
        return
      }

      const { data: existing, error: findError } = await supabase
        .from('raffles')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)

      if (findError) {
        if (!cancelled) setError(findError.message)
        setLoading(false)
        return
      }

      let id = existing?.[0]?.id ?? null

      if (!id) {
        const { data: created, error: createError } = await supabase
          .from('raffles')
          .insert({ user_id: user.id })
          .select('id')
          .single()

        if (createError) {
          if (!cancelled) setError(createError.message)
          setLoading(false)
          return
        }
        id = created.id
      }

      if (cancelled) return
      setRaffleId(id)
      await loadEntries(id)
      setLoading(false)
    }

    void init()
    return () => { cancelled = true }
  }, [supabase, loadEntries])

  async function handleAddParticipant(e: React.FormEvent) {
    e.preventDefault()
    const username = newUsername.trim()
    if (!username || !raffleId) return

    setError('')

    const { data, error: err } = await supabase
      .from('raffle_entries')
      .insert({ raffle_id: raffleId, username, entries_count: 1 })
      .select('id, username, entries_count')
      .single()

    if (err) {
      setError(err.message)
      return
    }

    setParticipants(prev => [...prev, {
      id: data.id,
      username: data.username,
      tickets: data.entries_count,
    }])
    setNewUsername('')
  }

  /**
   * Adds one ticket to an existing participant.
   *
   * A fresh row rather than a re-insert, so the weighted draw reads a single
   * `entries_count` per viewer instead of one row per ticket.
   */
  async function handleAddTicket(id: string) {
    const target = participants.find(p => p.id === id)
    if (!target || !raffleId) return

    setError('')
    const { error: err } = await supabase
      .from('raffle_entries')
      .update({ entries_count: target.tickets + 1 })
      .eq('id', id)

    if (err) {
      setError(err.message)
      return
    }

    setParticipants(prev => prev.map(p =>
      p.id === id ? { ...p, tickets: p.tickets + 1 } : p,
    ))
  }

  async function handleRemoveParticipant(id: string) {
    setError('')
    const { error: err } = await supabase.from('raffle_entries').delete().eq('id', id)
    if (err) {
      setError(err.message)
      return
    }
    setParticipants(prev => prev.filter(p => p.id !== id))
  }

  /**
   * The draw is performed and recorded by `streamkit_draw_raffle_winner`.
   *
   * It locks the raffle row, refuses to run twice, and writes the result to
   * `raffles.winner_name` with status 'completed'. Nothing here decides the
   * outcome, so a disputed result can be answered by reading the row.
   */
  async function handlePickWinner() {
    if (participants.length === 0 || spinning || !raffleId) return
    setSpinning(true)
    setWinner(null)
    setError('')

    const { data, error: err } = await supabase.rpc('streamkit_draw_raffle_winner', {
      p_raffle_id: raffleId,
    })

    const row = (data as
      | { drawn_winner_name: string; drawn_tickets: number }[]
      | null)?.[0]

    if (err || !row) {
      setSpinning(false)
      setError(err?.message ?? 'The raffle could not be drawn.')
      return
    }

    // A beat of animation, then the recorded winner. The name shown is the one
    // that was stored, not one derived here.
    setTimeout(() => {
      setSpinning(false)
      setWinner({
        id: raffleId,
        username: row.drawn_winner_name,
        tickets: row.drawn_tickets,
      })
    }, 3000)
  }

  /**
   * Deletes the entries and reopens the raffle, because the draw refuses to
   * run against a completed one.
   */
  async function handleResetRaffle() {
    if (!confirm('Are you sure you want to reset all raffle entries?')) return
    if (!raffleId) return

    setError('')

    const { error: delError } = await supabase
      .from('raffle_entries')
      .delete()
      .eq('raffle_id', raffleId)

    if (delError) {
      setError(delError.message)
      return
    }

    const { error: reopenError } = await supabase
      .from('raffles')
      .update({ status: 'open', winner_name: null })
      .eq('id', raffleId)

    if (reopenError) {
      setError(reopenError.message)
      return
    }

    setParticipants([])
    setWinner(null)
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}><Gift size={21} /> Viewer Raffle &amp; Giveaways</h1>
          <p className={styles.subtitle}>Run fair, randomized giveaways for your stream audience with multi-ticket support</p>
        </div>

        <button onClick={handleResetRaffle} className="btn btn-danger btn-sm" id="reset-raffle-btn">
          <Trash2 size={15} /> Reset Raffle
        </button>
      </div>

      <div className={styles.grid}>
        {/* Participants Manager */}
        <div className={`${styles.card} card`}>
          <h3>Raffle Participants ({participants.length})</h3>

          <form onSubmit={handleAddParticipant} className={styles.addForm}>
            <input
              type="text"
              className="input"
              placeholder="Add viewer username..."
              value={newUsername}
              onChange={e => setNewUsername(e.target.value)}
            />
            <button type="submit" className="btn btn-primary btn-sm" id="add-participant-btn">
              + Add Participant
            </button>
          </form>

          <div className={styles.participantsList}>
            {participants.map((p) => (
              <div key={p.id} className={styles.participantRow}>
                <div className={styles.participantMeta}>
                  <strong>@{p.username}</strong>
                  <span className="badge badge-purple">{p.tickets} ticket{p.tickets > 1 ? 's' : ''}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleAddTicket(p.id)}
                  title="Add one more ticket"
                >
                  +1
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleRemoveParticipant(p.id)}
                  style={{ color: 'var(--brand-danger)' }}
                  aria-label={`Remove ${p.username}`}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Winner Selector Animation Card */}
        <div className={`${styles.winnerCard} card card-glow`}>
          <h3>Random Winner Selector</h3>
          <p className={styles.cardSub}>Uses cryptographic random sampling across all viewer tickets.</p>

          <div className={styles.spinStage}>
            {spinning ? (
              <div className={styles.spinningText}><Dices size={18} /> Selecting Random Winner...</div>
            ) : winner ? (
              <div className={`${styles.winnerBox} animate-slide-in-up`}>
                <span className={styles.winnerCrown}><Trophy size={17} /> WINNER</span>
                <h2 className={styles.winnerName}>@{winner.username}</h2>
                <span className="badge badge-green">{winner.tickets} tickets entered</span>
              </div>
            ) : (
              <div className={styles.idleText}>Ready to pick a winner!</div>
            )}
          </div>

          <button
            onClick={handlePickWinner}
            className="btn btn-primary btn-lg"
            style={{ width: '100%' }}
            disabled={spinning || participants.length === 0 || loading}
            id="spin-winner-btn"
          >
            {spinning ? 'Selecting Winner...' : <><Gift size={16} /> Pick Random Winner</>}
          </button>

          {error && (
            <p className={styles.error} role="alert">{error}</p>
          )}
        </div>
      </div>
    </div>
  )
}
