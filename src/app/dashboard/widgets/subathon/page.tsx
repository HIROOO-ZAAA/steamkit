'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Pause, Play, RotateCcw, TriangleAlert } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import ObsLinkRow from '@/components/dashboard/ObsLinkRow'
import styles from './subathon.module.css'

type SubathonRow = {
  remaining_seconds: number
  minutes_per_dollar: number
  is_paused: boolean
  ends_at: string | null
}

export default function SubathonPage() {
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [minutesPerDollar, setMinutesPerDollar] = useState('1')
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [error, setError] = useState('')
  const [supabase] = useState(() => createClient())

  useEffect(() => {
    let cancelled = false

    async function loadTimer() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Sign in to configure your timer.')
        setUserId(user.id)

        const { data: existing, error: loadError } = await supabase
          .from('subathons')
          .select('remaining_seconds, minutes_per_dollar, is_paused, ends_at')
          .eq('user_id', user.id)
          .maybeSingle()
        if (loadError) throw loadError

        let data = existing
        if (!data) {
          const created = await supabase
            .from('subathons')
            .insert({ user_id: user.id })
            .select('remaining_seconds, minutes_per_dollar, is_paused, ends_at')
            .single()
          if (created.error) throw created.error
          data = created.data
        }

        if (cancelled) return
        const timer = data as SubathonRow
        const seconds = timer.is_paused || !timer.ends_at
          ? Number(timer.remaining_seconds)
          : Math.max(0, Math.ceil((new Date(timer.ends_at).getTime() - Date.now()) / 1000))
        setSecondsLeft(seconds)
        setMinutesPerDollar(String(timer.minutes_per_dollar))
        setIsRunning(!timer.is_paused && seconds > 0)
        setLoadFailed(false)
      } catch (loadError) {
        if (!cancelled) {
          setLoadFailed(true)
          setError(loadError instanceof Error ? loadError.message : 'Unable to load timer.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadTimer()
    return () => { cancelled = true }
    // Loading the persisted timer on mount is the intended use of an effect.
     
  }, [supabase])

  useEffect(() => {
    if (!isRunning) return
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [isRunning])

  // Stopping the timer also has to persist that end-state, so this must be an
  // effect rather than derived render logic.
   
  useEffect(() => {
    if (isRunning && secondsLeft === 0 && userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsRunning(false)
      void persistTimer(0, false)
    }
  }, [isRunning, secondsLeft, userId])

  async function persistTimer(seconds: number, running: boolean) {
    if (!userId) return
    setSaving(true)
    setError('')
    const endsAt = running ? new Date(Date.now() + seconds * 1000).toISOString() : null
    const { error: saveError } = await supabase.from('subathons').upsert({
      user_id: userId,
      remaining_seconds: seconds,
      minutes_per_dollar: Number(minutesPerDollar) || 1,
      is_paused: !running,
      ends_at: endsAt,
    }, { onConflict: 'user_id' })
    if (saveError) setError('Unable to save timer settings.')
    setSaving(false)
  }

  function formatTime(totalSecs: number) {
    const hrs = Math.floor(totalSecs / 3600)
    const mins = Math.floor((totalSecs % 3600) / 60)
    const secs = totalSecs % 60
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  async function handleAddTime(minutes: number) {
    const nextSeconds = secondsLeft + minutes * 60
    setSecondsLeft(nextSeconds)
    await persistTimer(nextSeconds, isRunning)
  }

  async function handleToggle() {
    const nextRunning = !isRunning
    if (nextRunning && secondsLeft === 0) {
      setError('Add time before starting the countdown.')
      return
    }
    setIsRunning(nextRunning)
    await persistTimer(secondsLeft, nextRunning)
  }

  async function handleReset() {
    setIsRunning(false)
    setSecondsLeft(0)
    await persistTimer(0, false)
  }

  if (loading) {
    return <div className={styles.container}><div className={styles.skeleton} /></div>
  }

  return (
    <div className={styles.container}>
      <PageHeader
        eyebrow="Steam Kit // Engagement"
        title="Subathon Timer"
        description="Set and persist your stream countdown."
      />

      <section className={styles.overlayCard} aria-labelledby="subathon-obs-title">
        <div>
          <h2 id="subathon-obs-title">Show the timer in OBS</h2>
          <p>Add this transparent timer as an OBS Browser Source. It follows the saved countdown.</p>
        </div>
        <ObsLinkRow label="Subathon timer" path="/overlay/subathon" />
      </section>

      <div className={styles.grid}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Timer controls & rules</h2>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="mins-per-dollar">Minutes added per USD</label>
            <input
              id="mins-per-dollar"
              type="number"
              min="0.1"
              step="0.5"
              className={styles.input}
              value={minutesPerDollar}
              onChange={(event) => setMinutesPerDollar(event.target.value)}
              onBlur={() => void persistTimer(secondsLeft, isRunning)}
              disabled={saving || loadFailed}
            />
          </div>
          <div className={styles.quickAddRow}>
            <span className={styles.quickLabel}>Add time</span>
            <div className={styles.quickAddBtns}>
              <button type="button" className={styles.secondaryBtn} onClick={() => void handleAddTime(5)} disabled={saving || loadFailed}>+5 min</button>
              <button type="button" className={styles.secondaryBtn} onClick={() => void handleAddTime(15)} disabled={saving || loadFailed}>+15 min</button>
              <button type="button" className={styles.secondaryBtn} onClick={() => void handleAddTime(60)} disabled={saving || loadFailed}>+1 hour</button>
            </div>
          </div>
          {error && <p className={styles.error} role="alert"><TriangleAlert size={16} /> {error}</p>}
          <div className={styles.timerActions}>
            <button onClick={() => void handleToggle()} className={isRunning ? styles.secondaryBtn : styles.primaryBtn} disabled={saving || loadFailed}>
              {isRunning ? <><Pause size={16} /> Pause timer</> : <><Play size={16} /> Start timer</>}
            </button>
            <button onClick={() => void handleReset()} className={styles.ghostBtn} disabled={saving || loadFailed}>
              <RotateCcw size={16} /> Reset timer
            </button>
          </div>
        </section>

        <section className={styles.previewCard}>
          <div className={styles.previewHeader}>
            <h2>Timer preview</h2>
            <span className={loadFailed ? styles.badgeError : isRunning ? styles.badgeLive : styles.badgePaused}>
              {loadFailed ? 'Unavailable' : isRunning ? 'Counting down' : 'Paused'}
            </span>
          </div>
          <div className={styles.timerDisplayBox}>
            <span className={styles.timerSubText}>Subathon timer</span>
            <output className={styles.timerClock}>{loadFailed ? '--:--:--' : formatTime(secondsLeft)}</output>
            <span className={styles.ruleNotice}>
              {loadFailed
                ? 'Timer state could not be loaded.'
                : `${minutesPerDollar || '0'} minute${minutesPerDollar === '1' ? '' : 's'} added per USD`}
            </span>
          </div>
        </section>
      </div>
    </div>
  )
}
