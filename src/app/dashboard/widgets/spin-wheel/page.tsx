'use client'

import { useState, useEffect } from 'react'
import { Dices, PartyPopper, Save, X } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import { createClient } from '@/lib/supabase/client'
import ObsLinkRow from '@/components/dashboard/ObsLinkRow'
import { SpinWheelSlice } from '@/lib/types'
import { nextSpinWheelRotation } from '@/lib/overlay/spin-wheel-rotation'
import styles from './wheel.module.css'

export default function SpinWheelPage() {
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
  const [messageTone, setMessageTone] = useState<'success' | 'error'>('success')

  const [supabase] = useState(() => createClient())

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
        setTitle(data.title)
        setMinTrigger(data.min_tip_to_trigger.toString())
        if (data.slices) setSlices(data.slices as SpinWheelSlice[])
      }
      setLoading(false)
    }

    loadWheel()
  }, [supabase])

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
      setMessageTone('error')
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
      setMessageTone('error')
      setMessage(error?.message ?? 'The wheel could not be drawn.')
      return
    }

    setRotation(current => nextSpinWheelRotation(current, row.picked_index!, slices.length))

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

      const { error } = await supabase
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
      setMessageTone('success')
      setMessage('Spin wheel settings saved successfully.')
    } catch {
      setMessageTone('error')
      setMessage('Failed to save wheel settings. Please try again.')
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
        <div className={styles.skeleton} />
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <PageHeader
        eyebrow="Steam Kit // Engagement"
        title="Spin Wheel"
        description="Trigger an on-screen wheel spin when a viewer donates above your threshold."
      />

      <div className={styles.obsCard}>
        <div>
          <h2>Put the wheel on stream</h2>
          <p>Use this transparent browser source in OBS. Donation spins use the saved server result.</p>
        </div>
        <ObsLinkRow label="Spin wheel" path="/overlay/spin-wheel" />
      </div>

      <div className={styles.grid}>
        {/* Wheel Setup Form */}
        <div className={styles.card}>
          <form onSubmit={handleSave} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="wheel-title">Wheel title</label>
              <input
                id="wheel-title"
                type="text"
                className={styles.input}
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
                disabled={saving}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="min-trigger">Minimum donation to trigger spin (USD)</label>
              <input
                id="min-trigger"
                type="number"
                step="1"
                className={styles.input}
                value={minTrigger}
                onChange={e => setMinTrigger(e.target.value)}
                required
                disabled={saving}
              />
            </div>

            <div className={styles.field}>
              <div className={styles.slicesHeader}>
                <span className={styles.label}>Wheel prizes &amp; slices ({slices.length})</span>
                <button type="button" className={styles.ghostBtn} onClick={handleAddSlice}>
                  + Add slice
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
                      aria-label={`Color for prize ${index + 1}`}
                    />
                    <input
                      type="text"
                      className={styles.input}
                      aria-label={`Label for prize ${index + 1}`}
                      value={slice.label}
                      onChange={e => {
                        const newSlices = [...slices]
                        newSlices[index].label = e.target.value
                        setSlices(newSlices)
                      }}
                    />
                    <button
                      type="button"
                      className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                      onClick={() => setSlices(slices.filter((_, i) => i !== index))}
                      disabled={slices.length <= 2}
                      aria-label={`Remove prize ${index + 1}`}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {message && (
              <div
                className={messageTone === 'error' ? styles.error : styles.success}
                role={messageTone === 'error' ? 'alert' : 'status'}
              >
                {message}
              </div>
            )}

            <button type="submit" className={styles.primaryBtn} disabled={saving} id="save-wheel-btn">
              {saving ? 'Saving...' : <><Save size={16} /> Save wheel configuration</>}
            </button>
          </form>
        </div>

        {/* Live Wheel Simulator Card */}
        <div className={styles.previewCard}>
          <div className={styles.previewHeader}>
            <h3>Wheel preview</h3>
            <span className={styles.triggerBadge}>${minTrigger} trigger</span>
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
            <div className={styles.resultBox} role="status">
              <PartyPopper size={17} /> Winner result: <strong>{selectedResult}</strong>
            </div>
          )}

          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={handleSpinWheel}
            disabled={spinning}
            id="test-spin-btn"
          >
            {spinning ? 'Spinning...' : <><Dices size={16} /> Test spin wheel</>}
          </button>
        </div>
      </div>
    </div>
  )
}
