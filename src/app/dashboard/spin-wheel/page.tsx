'use client'

import { useState, useEffect } from 'react'
import { Dices, PartyPopper, Save, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { SpinWheel, SpinWheelSlice } from '@/lib/types'
import styles from './wheel.module.css'

export default function SpinWheelPage() {
  const [wheel, setWheel] = useState<SpinWheel | null>(null)
  const [title, setTitle] = useState('Donation Wheel of Fortune')
  const [minTrigger, setMinTrigger] = useState('5.00')
  const [slices, setSlices] = useState<SpinWheelSlice[]>([
    { label: '100 Diamonds', color: '#10b981' },
    { label: 'VIP Role', color: '#06b6d4' },
    { label: 'Shoutout', color: '#10b981' },
    { label: 'Play Song', color: '#f59e0b' },
  ])
  const [spinning, setSpinning] = useState(false)
  const [selectedResult, setSelectedResult] = useState<string | null>(null)
  const [rotation, setRotation] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const supabase = createClient()

  useEffect(() => {
    async function loadWheel() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('spin_wheels')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (data) {
        setWheel(data)
        setTitle(data.title)
        setMinTrigger(data.min_tip_to_trigger.toString())
        if (data.slices) setSlices(data.slices as SpinWheelSlice[])
      }
      setLoading(false)
    }

    loadWheel()
  }, [])

  /**
   * Manual test spin.
   *
   * The draw is decided by `streamkit_spin_wheel` and recorded in
   * `spin_wheel_spins`, exactly as an automatic spin from a tip is. The RPC
   * allows a null tip id precisely so a creator can rehearse without consuming
   * a real donation, though the result is then stored as a test spin.
   */
  async function handleSpinWheel() {
    if (spinning || slices.length === 0) return
    setSpinning(true)
    setSelectedResult(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setSpinning(false)
      return
    }

    // The overlay token is the only credential the RPC accepts, and the
    // dashboard is the authenticated surface that owns it.
    const { data: cred } = await supabase
      .from('streamkit_overlay_credentials')
      .select('token')
      .eq('creator_id', user.id)
      .maybeSingle()

    if (!cred?.token) {
      setSpinning(false)
      setMessage('No overlay token yet — open the OBS page first.')
      return
    }

    const { data, error } = await supabase.rpc('streamkit_spin_wheel', {
      p_token: cred.token,
      p_tip_id: null,
    })

    const row = (data as
      | {
          picked_index: number | null
          picked_label: string | null
          should_spin: boolean
        }[]
      | null)?.[0]

    if (error || !row?.should_spin || row.picked_index === null) {
      setSpinning(false)
      setMessage(error?.message ?? 'The wheel could not be drawn.')
      return
    }

    const sliceAngle = 360 / slices.length
    const targetDegree = rotation + 360 * 5 + (row.picked_index * sliceAngle) + (sliceAngle / 2)
    setRotation(targetDegree)

    setTimeout(() => {
      setSpinning(false)
      setSelectedResult(row.picked_label)
    }, 4000)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')

      const { data, error } = await supabase
        .from('spin_wheels')
        .upsert({
          user_id: user.id,
          title,
          min_tip_to_trigger: parseFloat(minTrigger) || 5.0,
          slices,
        })
        .select()
        .single()

      if (error) throw error
      setWheel(data)
      setMessage('Spin wheel settings saved successfully!')
    } catch (err: unknown) {
      alert('Failed to save wheel settings')
    } finally {
      setSaving(false)
    }
  }

  function handleAddSlice() {
    const defaultColors = ['#10b981', '#0e5844', '#f59e0b', '#ef4444']
    const nextColor = defaultColors[slices.length % defaultColors.length]
    setSlices([...slices, { label: `Prize ${slices.length + 1}`, color: nextColor }])
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className="skeleton" style={{ height: '300px', width: '100%' }} />
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}><Dices size={21} /> Interactive Spin Wheel</h1>
        <p className={styles.subtitle}>Trigger automated on-screen wheel spins when viewers donate above a set threshold</p>
      </div>

      <div className={styles.grid}>
        {/* Wheel Setup Form */}
        <div className={`${styles.card} card`}>
          <form onSubmit={handleSave} className={styles.form}>
            <div className="input-group">
              <label className="input-label" htmlFor="wheel-title">Wheel Title</label>
              <input
                id="wheel-title"
                type="text"
                className="input"
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
                disabled={saving}
              />
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="min-trigger">Minimum Donation to Trigger Spin ($)</label>
              <input
                id="min-trigger"
                type="number"
                step="1"
                className="input"
                value={minTrigger}
                onChange={e => setMinTrigger(e.target.value)}
                required
                disabled={saving}
              />
            </div>

            <div className="input-group">
              <div className={styles.slicesHeader}>
                <label className="input-label">Wheel Prizes &amp; Slices ({slices.length})</label>
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleAddSlice}>
                  + Add Slice
                </button>
              </div>

              <div className={styles.slicesList}>
                {slices.map((slice, index) => (
                  <div key={index} className={styles.sliceRow}>
                    <input
                      type="color"
                      value={slice.color}
                      onChange={e => {
                        const newSlices = [...slices]
                        newSlices[index].color = e.target.value
                        setSlices(newSlices)
                      }}
                      className={styles.colorInput}
                    />
                    <input
                      type="text"
                      className="input"
                      value={slice.label}
                      onChange={e => {
                        const newSlices = [...slices]
                        newSlices[index].label = e.target.value
                        setSlices(newSlices)
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setSlices(slices.filter((_, i) => i !== index))}
                      disabled={slices.length <= 2}
                      style={{ color: 'var(--brand-danger)' }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {message && <div className="alert-success">{message}</div>}

            <button type="submit" className="btn btn-primary" disabled={saving} id="save-wheel-btn">
              {saving ? 'Saving...' : <><Save size={16} /> Save Wheel Configuration</>}
            </button>
          </form>
        </div>

        {/* Live Wheel Simulator Card */}
        <div className={`${styles.previewCard} card card-glow`}>
          <div className={styles.previewHeader}>
            <h3>Live Interactive Wheel</h3>
            <span className="badge badge-purple">${minTrigger} Trigger</span>
          </div>

          <div className={styles.wheelWrapper}>
            <div className={styles.pointer}>▼</div>
            <div
              className={styles.wheelCircle}
              style={{
                transform: `rotate(${rotation}deg)`,
                background: `conic-gradient(${slices
                  .map((s, i) => `${s.color} ${(i / slices.length) * 360}deg ${((i + 1) / slices.length) * 360}deg`)
                  .join(', ')})`,
              }}
            />
          </div>

          {selectedResult && (
            <div className={`${styles.resultBox} alert-success animate-slide-in-up`}>
              <PartyPopper size={17} /> WINNER RESULT: <strong>{selectedResult}</strong>
            </div>
          )}

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleSpinWheel}
            disabled={spinning}
            id="test-spin-btn"
          >
            {spinning ? 'Spinning...' : <><Dices size={16} /> Test Spin Wheel</>}
          </button>
        </div>
      </div>
    </div>
  )
}
