'use client'

import { useCallback, useEffect, useState } from 'react'
import { Dices, Gift, Trophy, Trash2, X } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { createClient } from '@/lib/supabase/client'
import ObsLinkRow from '@/components/dashboard/ObsLinkRow'
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
      <PageHeader
        eyebrow="Steam Kit // Engagement"
        title="Viewer Raffle & Giveaways"
        description="Run a weighted giveaway for your audience, then draw and record the winner."
        actions={
          <button
            onClick={() => void handleResetRaffle()}
            className={styles.dangerBtn}
            id="reset-raffle-btn"
            disabled={loading || !raffleId}
          >
            <Trash2 size={15} /> Reset raffle
          </button>
        }
      />

      <section className={styles.overlayCard} aria-labelledby="raffle-obs-title">
        <div>
          <h2 id="raffle-obs-title">Reveal the winner in OBS</h2>
          <p>Add the transparent winner display as an OBS Browser Source. It follows the saved raffle result.</p>
        </div>
        <ObsLinkRow label="Raffle reveal" path="/overlay/raffle" />
      </section>

      {error ? (
        <div className={styles.errorBanner} role="alert">
          <strong>Raffle unavailable</strong>
          <span>{error}</span>
        </div>
      ) : null}

      <div className={styles.grid}>
        {/* Participants Manager */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>
            Raffle participants <span className={styles.count}>{participants.length}</span>
          </h2>

          <form onSubmit={handleAddParticipant} className={styles.addForm}>
            <input
              type="text"
              className={styles.input}
              placeholder="Add viewer username..."
              aria-label="Viewer username"
              value={newUsername}
              onChange={e => setNewUsername(e.target.value)}
              disabled={loading || !raffleId}
            />
            <button type="submit" className={styles.primaryBtn} id="add-participant-btn" disabled={loading || !raffleId}>
              + Add participant
            </button>
          </form>

          <div className={styles.participantsList}>
            {loading ? (
              <p className={styles.listState}>Loading participants...</p>
            ) : !raffleId ? (
              <p className={styles.listState}>Participant data is unavailable until the raffle table can be read.</p>
            ) : participants.length === 0 ? (
              <p className={styles.listState}>No viewers entered yet. Add a username or wait for a ticket purchase.</p>
            ) : participants.map((p) => (
              <div key={p.id} className={styles.participantRow}>
                <div className={styles.participantMeta}>
                  <strong>@{p.username}</strong>
                  <span className={styles.ticketBadge}>{p.tickets} ticket{p.tickets > 1 ? 's' : ''}</span>
                </div>
                <button
                  type="button"
                  className={styles.ghostBtn}
                  onClick={() => handleAddTicket(p.id)}
                  title="Add one more ticket"
                >
                  +1
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => handleRemoveParticipant(p.id)}
                  aria-label={`Remove ${p.username}`}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Winner Selector Animation Card */}
        <section className={styles.winnerCard}>
          <h2 className={styles.cardTitle}>Random winner selector</h2>
          <p className={styles.cardSub}>The winner is drawn and recorded server-side across all viewer tickets.</p>

          <div className={styles.spinStage}>
            {spinning ? (
              <div className={styles.spinningText}><Dices size={18} /> Selecting random winner...</div>
            ) : winner ? (
              <div className={styles.winnerBox}>
                <span className={styles.winnerCrown}><Trophy size={17} /> Winner</span>
                <h3 className={styles.winnerName}>@{winner.username}</h3>
                <span className={styles.winnerTickets}>{winner.tickets} tickets entered</span>
              </div>
            ) : (
              <div className={styles.idleText}>
                {raffleId ? 'Ready to pick a winner.' : 'Winner selection is unavailable.'}
              </div>
            )}
          </div>

          <button
            onClick={handlePickWinner}
            className={styles.primaryBtn}
            disabled={spinning || participants.length === 0 || loading || !raffleId}
            id="spin-winner-btn"
          >
            {spinning ? 'Selecting winner...' : <><Gift size={16} /> Pick random winner</>}
          </button>
        </section>
      </div>
    </div>
  )
}
