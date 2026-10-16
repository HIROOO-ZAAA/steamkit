'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Copy, Check, Pencil, Plus, Trash2, RotateCcw, Pause, Play } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import styles from './goals.module.css'

type Goal = {
  id?: string
  title: string
  target_amount: number
  current_amount: number
  bar_color: string
  is_active: boolean
  end_date?: string | null
  widget?: {
    stylePreset?: string
    progressDisplay?: string
    fontChoice?: string
    textSize?: number
    strokeColor?: string
    strokeWidth?: number
    shineFx?: boolean
    palette?: Record<string, string>
  }
}

export default function GoalsPage() {
  const [view, setView] = useState<'list' | 'create'>('list')
  const [goals, setGoals] = useState<Goal[]>([])
  const [title, setTitle] = useState('')
  const [currency, setCurrency] = useState('USD ($)')
  const [targetAmount, setTargetAmount] = useState('')
  const [stylePreset, setStylePreset] = useState('Bubble (Card)')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [widgetUrl, setWidgetUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [modal, setModal] = useState<{ type: 'adjust' | 'reset' | 'delete'; goal: Goal } | null>(null)
  const [adjustAmount, setAdjustAmount] = useState('0.00')
  const [toast, setToast] = useState('')
  const showToast = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 3000)
  }
  const [activeTab, setActiveTab] = useState<'queue' | 'completed'>('queue')
  const [currentAmount, setCurrentAmount] = useState(0)
  const [previewAmount, setPreviewAmount] = useState(0)
  const [description, setDescription] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endDateEnabled, setEndDateEnabled] = useState(false)
  const [progressDisplay, setProgressDisplay] = useState('$25.00 / $100.00')
  const [shineFx, setShineFx] = useState(true)
  const [fontChoice, setFontChoice] = useState('Rajdhani')
  const [textSize, setTextSize] = useState(18)
  const [strokeColor, setStrokeColor] = useState('#000000')
  const [strokeWidth, setStrokeWidth] = useState(0)
  const [palette, setPalette] = useState({
    card: '#0E5844',
    bar: '#10B981',
    shine: '#FFFFFF',
    text: '#F8FAFC',
    numbers: '#A7F3D0',
    target: '#F8FAFC',
  })
  const [supabase] = useState(() => createClient())

  useEffect(() => {
    const families = [
      'Press Start 2P', 'Orbitron', 'Audiowide', 'Black Ops One', 'Bungee', 'Quantico', 'VT323', 'Wallpoet', 'Exo 2',
      'Bebas Neue', 'Anton', 'Bangers', 'Alfa Slab One', 'Carter One', 'Fredoka', 'Fugaz One', 'Lilita One',
      'Passion One', 'Paytone One', 'Righteous', 'Russo One', 'Squada One', 'Teko', 'Titan One', 'Ultra',
      'Kantumruy Pro', 'Battambang', 'Moul', 'Koulen', 'Hanuman', 'Siemreap', 'Nokora', 'Odor Mean Chey',
      'Preahvihear', 'Suwannaphum', 'Taprom',
      'Inter', 'Rajdhani', 'Poppins', 'Roboto', 'Montserrat', 'Lato', 'Nunito', 'Open Sans', 'Oswald',
      'Rubik', 'Ubuntu', 'Merriweather', 'Playfair Display', 'Lobster', 'Pacifico',
    ]
    const id = 'goal-fonts-link'
    if (!document.getElementById(id)) {
      const link = document.createElement('link')
      link.id = id
      link.rel = 'stylesheet'
      link.href = `https://fonts.googleapis.com/css2?${families.map((f) => `family=${encodeURIComponent(f)}:wght@400;700`).join('&')}&display=swap`
      document.head.appendChild(link)
    }
  }, [])

  useEffect(() => {
    async function fetchToken() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase
        .from('streamkit_overlay_credentials')
        .upsert({ creator_id: user.id }, { onConflict: 'creator_id' })
      const { data } = await supabase
        .from('streamkit_overlay_credentials')
        .select('token')
        .eq('creator_id', user.id)
        .single()
      if (data?.token) {
        const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
        setWidgetUrl(`${base}/overlay/goals?token=${data.token}`)
      }
    }
    void fetchToken()
  }, [supabase])

  async function loadGoals() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('donation_goals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setGoals(data || [])
    const { data: credentials } = await supabase
      .from('streamkit_overlay_credentials')
      .select('goals_cleared_at')
      .eq('creator_id', user.id)
      .maybeSingle()
    const goalsClearedAt = credentials?.goals_cleared_at ?? null
    const { data: completedTips } = await supabase
      .from('tips')
      .select('amount')
      .eq('creator_id', user.id)
      .in('payment_status', ['successful', 'test'])
      .eq('currency', 'USD')
      .gt('created_at', goalsClearedAt ?? '1970-01-01T00:00:00Z')
    setCurrentAmount((completedTips || []).reduce((sum, tip) => sum + Number(tip.amount), 0))
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadGoals()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase])

  const completedGoals = goals.filter((g) => g.target_amount > 0 && currentAmount >= g.target_amount)
  const queueGoals = goals.filter((g) => !(g.target_amount > 0 && currentAmount >= g.target_amount))
  const activeGoal = goals.find((g) => g.is_active)
  const activePercent = activeGoal && activeGoal.target_amount > 0
    ? Math.min(100, Math.round((currentAmount / activeGoal.target_amount) * 100))
    : 0

  const [editingGoal, setEditingGoal] = useState<Goal | null>(null)

  function resetForm() {
    setTitle('')
    setTargetAmount('')
    setCurrency('USD ($)')
    setStylePreset('Bubble (Card)')
    setMessage('')
    setError('')
    setEditingGoal(null)
    setEndDate('')
    setEndDateEnabled(false)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')

      const target = Number(targetAmount)
      if (!Number.isFinite(target) || target <= 0) {
        throw new Error('Enter a goal amount greater than zero.')
      }

      const payload = {
        title,
        target_amount: target,
        bar_color: palette.bar,
        is_active: true,
        end_date: endDateEnabled && endDate ? new Date(endDate).toISOString() : null,
        widget: { stylePreset, progressDisplay, fontChoice, textSize, strokeColor, strokeWidth, shineFx, palette },
      }

      let saveError
      let savedId = editingGoal?.id
      if (editingGoal?.id) {
        const { error } = await supabase
          .from('donation_goals')
          .update(payload)
          .eq('id', editingGoal.id)
        saveError = error
      } else {
        const { data: inserted, error } = await supabase
          .from('donation_goals')
          .insert({ ...payload, user_id: user.id, current_amount: currentAmount })
          .select('id')
          .single()
        saveError = error
        savedId = inserted?.id
      }

      if (saveError) throw saveError

      await supabase
        .from('donation_goals')
        .update({ is_active: false })
        .eq('user_id', user.id)
        .neq('id', savedId ?? '')

      const msg = editingGoal ? 'Goal updated successfully!' : 'Donation goal created successfully!'
      setMessage(msg)
      showToast(msg)
      await loadGoals()
      setView('list')
      resetForm()
    } catch (err: unknown) {
      console.error('Failed to save goal:', err)
      const msg =
        err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string'
          ? (err as { message: string }).message
          : err instanceof Error
            ? err.message
            : 'Failed to save goal'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  async function handlePause(goal: Goal) {
    if (!goal.id) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (goal.is_active) {
      const { error: updErr } = await supabase
        .from('donation_goals')
        .update({ is_active: false })
        .eq('id', goal.id)
      if (updErr) {
        setError(updErr.message)
        return
      }
      showToast('Goal paused.')
    } else {
      const { error: deactivateErr } = await supabase
        .from('donation_goals')
        .update({ is_active: false })
        .eq('user_id', user.id)
      if (deactivateErr) {
        setError(deactivateErr.message)
        return
      }
      const { error: activateErr } = await supabase
        .from('donation_goals')
        .update({ is_active: true })
        .eq('id', goal.id)
      if (activateErr) {
        setError(activateErr.message)
        return
      }
      showToast('Switched active goal.')
    }
    await loadGoals()
  }

  async function applyAdjust() {
    if (!modal || modal.type !== 'adjust') return
    const delta = Number.parseFloat(adjustAmount)
    if (!Number.isFinite(delta) || delta === 0) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error: insErr } = await supabase.from('tips').insert({
      creator_id: user.id,
      tipper_name: 'Manual Adjust',
      amount: delta,
      currency: 'USD',
      message: 'Goal adjustment',
      payment_method: 'manual',
      payment_status: 'test',
    })
    if (insErr) {
      setError(insErr.message)
      return
    }
    await loadGoals()
    setModal(null)
    setAdjustAmount('0.00')
    showToast('Amount applied to goal progress.')
  }

  async function applyReset() {
    if (!modal || modal.type !== 'reset') return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error: insErr } = await supabase.rpc('streamkit_goals_clear_history')
    if (insErr) {
      setError(insErr.message)
      return
    }
    await loadGoals()
    setModal(null)
    showToast('Goal progress reset to $0.')
  }

  async function applyDelete() {
    if (!modal || modal.type !== 'delete') return
    const goal = modal.goal
    if (!goal.id) return
    const { error: delError } = await supabase.from('donation_goals').delete().eq('id', goal.id)
    if (delError) {
      setError(delError.message)
      return
    }
    await loadGoals()
    setModal(null)
    showToast('Goal deleted.')
  }

  function handleCopyWidgetUrl() {
    if (!widgetUrl) return
    navigator.clipboard.writeText(widgetUrl)
    setCopied(true)
    showToast('Widget URL copied to clipboard!')
    setTimeout(() => { setCopied(false); setMessage('') }, 2500)
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className="skeleton" style={{ height: '300px', width: '100%' }} />
      </div>
    )
  }

  if (view === 'create') {
    const target = Number(targetAmount) || 0
    const shownAmount = previewAmount
    const percent = target > 0 ? Math.min(100, Math.round((shownAmount / target) * 100)) : 0

    return (
      <div className={styles.container}>
        <div className={styles.breadcrumb}>Dashboard / Donation Goals / Create Goal</div>
        <button type="button" className={styles.backBtn} onClick={() => setView('list')}>
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className={styles.title}>CONFIGURE GOAL</h1>
        <p className={styles.subtitle}>System // Widget_Configuration</p>

        <div className={styles.createGrid}>
          <div className={styles.createLeft}>
            <form onSubmit={handleSave} className={styles.form}>
              <div className={`${styles.card} card`}>
                <h3 className={styles.cardLabel}>BASIC INFO</h3>
                <div className="input-group">
                  <label className="input-label" htmlFor="goal-title">Goal Title <span style={{ color: '#EF4444' }}>*</span></label>
                  <input
                    id="goal-title"
                    type="text"
                    className="input"
                    placeholder="e.g., New Gaming PC"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    disabled={saving}
                  />
                </div>

                <div className="input-group" style={{ marginTop: '1rem' }}>
                  <label className="input-label">Description (Optional)</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Brief details about this goal..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div className="input-group" style={{ marginTop: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label className="input-label" htmlFor="goal-end-date" style={{ margin: 0 }}>End Date</label>
                    <button type="button" className={endDateEnabled ? styles.toggleOn : styles.toggle} onClick={() => setEndDateEnabled((v) => !v)} aria-label="Enable end date">
                      <span className={styles.toggleKnob} />
                    </button>
                  </div>
                  {endDateEnabled && (
                    <input
                      id="goal-end-date"
                      type="datetime-local"
                      className="input"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      disabled={saving}
                      style={{ marginTop: '8px' }}
                    />
                  )}
                </div>

                <div className={styles.formRow3} style={{ marginTop: '1rem', gridTemplateColumns: '1fr 1fr' }}>
                  <div className="input-group">
                    <label className="input-label">Style</label>
                    <select className="input" value={stylePreset} onChange={(e) => setStylePreset(e.target.value)}>
                      <option>Bubble (Card)</option>
                      <option>Premium (Glow)</option>
                      <option>Cyberpunk (Matrix)</option>
                      <option>Glass (Frosted)</option>
                      <option>Easy (Minimal)</option>
                      <option>SteamKit (Tech)</option>
                      <option>Valor (Sharp)</option>
                    </select>
                  </div>
                  <div className="input-group">
                    <label className="input-label">Progress Display</label>
                    <select className="input" value={progressDisplay} onChange={(e) => setProgressDisplay(e.target.value)}>
                      <option>$25.00 / $100.00</option>
                      <option>25% of $100.00</option>
                      <option>25%</option>
                      <option>$25.00 Saved</option>
                      <option>Hide Progress</option>
                    </select>
                  </div>
                </div>

                <div className={styles.formRow3} style={{ marginTop: '1rem', gridTemplateColumns: '1fr 1.4fr' }}>
                  <div className="input-group">
                    <label className="input-label">CURRENCY</label>
                    <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                      <option>USD ($)</option>
                      <option>KHR (៛)</option>
                    </select>
                  </div>
                  <div className="input-group">
                    <label className="input-label">TARGET AMOUNT</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        type="number"
                        className="input"
                        value={targetAmount}
                        onChange={(e) => setTargetAmount(e.target.value)}
                        required
                        disabled={saving}
                      />
                      {[50, 100].map((v) => (
                        <button key={v} type="button" className={Number(targetAmount) === v ? styles.chipActive : styles.chip} onClick={() => setTargetAmount(String(v))}>
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${styles.card} card`}>
                <div className={styles.paletteHeader}>
                  <h3 className={styles.cardLabel} style={{ margin: 0 }}>COLOR PALETTE</h3>
                  <div className={styles.shineToggle}>
                    <span>SHINE FX</span>
                    <button type="button" className={shineFx ? styles.toggleOn : styles.toggle} onClick={() => setShineFx((v) => !v)}>
                      <span className={styles.toggleKnob} />
                    </button>
                  </div>
                </div>
                <div className={styles.swatchRow}>
                  {([
                    ['card', 'CARD'],
                    ['bar', 'BAR'],
                    ['shine', 'SHINE'],
                    ['text', 'TEXT'],
                    ['numbers', 'NUMBERS'],
                    ['target', 'TARGET'],
                  ] as const).map(([key, label]) => (
                    <label key={key} className={styles.swatch}>
                      <span className={styles.swatchDot} style={{ background: palette[key] }}>
                        <input
                          type="color"
                          value={palette[key]}
                          onChange={(e) => setPalette((p) => ({ ...p, [key]: e.target.value }))}
                          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%', padding: 0, border: 'none' }}
                        />
                      </span>
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className={`${styles.card} card`}>
                <h3 className={styles.cardLabel}>TYPOGRAPHY SETUP</h3>
                <select className="input" value={fontChoice} onChange={(e) => setFontChoice(e.target.value)}>
                  <optgroup label="Gaming & Retro">
                    <option>Press Start 2P</option>
                    <option>Orbitron</option>
                    <option>Audiowide</option>
                    <option>Black Ops One</option>
                    <option>Bungee</option>
                    <option>Quantico</option>
                    <option>VT323</option>
                    <option>Wallpoet</option>
                    <option>Exo 2</option>
                  </optgroup>
                  <optgroup label="Bold & Heavy">
                    <option>Bebas Neue</option>
                    <option>Anton</option>
                    <option>Bangers</option>
                    <option>Alfa Slab One</option>
                    <option>Carter One</option>
                    <option>Fredoka</option>
                    <option>Fugaz One</option>
                    <option>Lilita One</option>
                    <option>Passion One</option>
                    <option>Paytone One</option>
                    <option>Righteous</option>
                    <option>Russo One</option>
                    <option>Squada One</option>
                    <option>Teko</option>
                    <option>Titan One</option>
                    <option>Ultra</option>
                  </optgroup>
                  <optgroup label="Khmer / Cambodian Fonts">
                    <option>Kantumruy Pro</option>
                    <option>Battambang</option>
                    <option>Moul</option>
                    <option>Koulen</option>
                    <option>Hanuman</option>
                    <option>Siemreap</option>
                    <option>Nokora</option>
                    <option>Odor Mean Chey</option>
                    <option>Preahvihear</option>
                    <option>Suwannaphum</option>
                    <option>Taprom</option>
                  </optgroup>
                  <optgroup label="Clean & Modern (English)">
                    <option>Inter</option>
                    <option>Rajdhani</option>
                    <option>Poppins</option>
                    <option>Roboto</option>
                    <option>Montserrat</option>
                    <option>Lato</option>
                    <option>Nunito</option>
                    <option>Open Sans</option>
                    <option>Oswald</option>
                    <option>Rubik</option>
                    <option>Ubuntu</option>
                    <option>Merriweather</option>
                    <option>Playfair Display</option>
                    <option>Lobster</option>
                    <option>Pacifico</option>
                  </optgroup>
                </select>
                <div className={styles.sliderRow} style={{ marginTop: '1rem' }}>
                  <div className="input-group" style={{ flex: 1 }}>
                    <label className="input-label">TEXT SIZE</label>
                    <input type="range" min={12} max={48} value={textSize} onChange={(e) => setTextSize(Number(e.target.value))} className={styles.slider} />
                    <span className={styles.sliderValue}>{textSize}px</span>
                  </div>
                  <div className="input-group" style={{ alignItems: 'flex-start' }}>
                    <label className="input-label" style={{ whiteSpace: 'nowrap' }}>STROKE COLOR</label>
                    <label className={styles.colorDot} style={{ background: strokeColor }}>
                      <input type="color" value={strokeColor} onChange={(e) => setStrokeColor(e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%', padding: 0, border: 'none' }} />
                    </label>
                  </div>
                  <div className="input-group" style={{ flex: 1 }}>
                    <label className="input-label">STROKE WIDTH</label>
                    <input type="range" min={0} max={6} value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))} className={styles.slider} />
                    <span className={styles.sliderValue}>{strokeWidth}px</span>
                  </div>
                </div>
              </div>

              {error && <div className="alert-error">{error}</div>}
              {message && <div className="alert-success">{message}</div>}

              <button type="submit" className={styles.initBtn} disabled={saving}>
                {saving ? 'INITIALIZING...' : 'INITIALIZE GOAL SEQUENCE'}
              </button>
            </form>
          </div>

          <div className={styles.createRight}>
            <div className={styles.livePreviewLabel}>LIVE RENDER <span className={styles.liveDot} /></div>
            <div className={styles.previewDashed}>
              <div
                className={`${styles.goalCard} ${
                  stylePreset === 'Premium (Glow)' ? styles.presetPremium
                  : stylePreset === 'Cyberpunk (Matrix)' ? styles.presetCyberpunk
                  : stylePreset === 'Glass (Frosted)' ? styles.presetGlass
                  : stylePreset === 'Easy (Minimal)' ? styles.presetMinimal
                  : stylePreset === 'SteamKit (Tech)' ? styles.presetSteamKit
                  : stylePreset === 'Valor (Sharp)' ? styles.presetValor
                  : styles.presetBubble
                }`}
                style={{
                  background: palette.card,
                  fontFamily: `'${fontChoice}', sans-serif`,
                }}
              >
                <div className={styles.goalCardTop}>
                  <strong style={{ color: palette.text, fontSize: `${textSize + 6}px`, WebkitTextStroke: strokeWidth ? `${strokeWidth}px ${strokeColor}` : undefined }}>
                    {title || 'NEW GOAL'}
                  </strong>
                  <span style={{ color: palette.numbers, fontSize: `${textSize + 4}px`, fontWeight: 700 }}>{percent}%</span>
                </div>
                <div className={styles.goalCardBar}>
                  <div className={styles.goalCardBarFill} style={{ width: `${percent}%`, backgroundColor: palette.bar }} />
                  {shineFx && <div className={styles.shineSweep} />}
                </div>
                <div className={styles.goalCardBottom}>
                  {progressDisplay === '$25.00 / $100.00' && (
                    <>
                      <span key={previewAmount} className={styles.amountPop} style={{ color: palette.numbers, fontSize: `${textSize}px`, fontWeight: 700 }}>
                        ${shownAmount.toFixed(2)}
                      </span>
                      <span style={{ color: palette.target, fontSize: `${textSize}px`, fontWeight: 700 }}>
                        / ${target.toFixed(0)}
                      </span>
                    </>
                  )}
                  {progressDisplay === '25% of $100.00' && (
                    <>
                      <span key={previewAmount} className={styles.amountPop} style={{ color: palette.numbers, fontSize: `${textSize}px`, fontWeight: 700 }}>
                        {percent}%
                      </span>
                      <span style={{ color: palette.target, fontSize: `${textSize}px`, fontWeight: 700 }}>
                        of ${target.toFixed(0)}
                      </span>
                    </>
                  )}
                  {progressDisplay === '25%' && (
                    <span key={previewAmount} className={styles.amountPop} style={{ color: palette.numbers, fontSize: `${textSize}px`, fontWeight: 700 }}>
                      {percent}%
                    </span>
                  )}
                  {progressDisplay === '$25.00 Saved' && (
                    <span key={previewAmount} className={styles.amountPop} style={{ color: palette.numbers, fontSize: `${textSize}px`, fontWeight: 700 }}>
                      ${shownAmount.toFixed(2)} Saved
                    </span>
                  )}
                </div>
              </div>

              <div className={styles.playgroundLabel}>SIMULATION CONTROLS</div>
              <div className={styles.playgroundRow}>
                <button type="button" className={styles.pgGreen} onClick={() => { setPreviewAmount((v) => v + 5); showToast('+$5 added (test)') }}>+$5</button>
                <button type="button" className={styles.pgGreen} onClick={() => { setPreviewAmount((v) => v + 20); showToast('+$20 added (test)') }}>+$20</button>
                <button type="button" className={styles.pgGreen} onClick={() => { setPreviewAmount((v) => v + 100); showToast('+$100 added (test)') }}>+$100</button>
                <button type="button" className={styles.pgPink} onClick={() => { setPreviewAmount(0); showToast('Simulation reset.') }}>RESET</button>
              </div>
              <p className={styles.playgroundHint}>Use buttons above to test animations. These changes won&apos;t be saved to your goal.</p>
            </div>
          </div>
        </div>
        {toast && (<div className={styles.toast}><span className={styles.toastIcon}><Check size={13} /></span><div><div className={styles.toastTitle}>Success</div><div className={styles.toastMsg}>{toast}</div></div></div>)}
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.breadcrumb}>Dashboard / Donation Goals</div>
      <div className={styles.listHeader}>
        <div>
          <h1 className={styles.title}>Donation Goals</h1>
          <p className={styles.subtitle}>Manage your stream goals and sequential stretch targets.</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.copyUrlBtn} onClick={handleCopyWidgetUrl}>
            {copied ? <Check size={15} /> : <Copy size={15} />} Copy Widget URL
          </button>
          <button type="button" className={styles.newGoalBtn} onClick={() => { resetForm(); setView('create') }}>
            <Plus size={15} /> Create New Goal
          </button>
        </div>
      </div>

      {message && <div className="alert-success">{message}</div>}

      {activeGoal && (
        <div className={`${styles.activeCard} card`} style={{ '--bar-color': activeGoal.bar_color || '#10B981' } as React.CSSProperties}>
          <div className={styles.activeRow}>
            <h3><span className={styles.activeLabel}>ACTIVE:</span> {activeGoal.title}</h3>
            <span className={styles.liveNow}>Live Now</span>
          </div>
          <div className={styles.progressBarTrack}>
            <div className={styles.progressBarFill} style={{ width: `${activePercent}%` }} />
          </div>
          <div className={styles.activeFooter}>
            <strong>${currentAmount.toFixed(0)} / ${activeGoal.target_amount.toFixed(0)}</strong>
          </div>
        </div>
      )}

      <div className={styles.tabs}>
        <button type="button" className={activeTab === 'queue' ? styles.tabActive : styles.tab} onClick={() => setActiveTab('queue')}>
          Goal Queue ({queueGoals.length})
        </button>
        <button type="button" className={activeTab === 'completed' ? styles.tabActive : styles.tab} onClick={() => setActiveTab('completed')}>
          Completed ({completedGoals.length})
        </button>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableHead}>
          <span>Goal Details</span>
          <span>Style</span>
          <span>Progress</span>
          <span>Ends On</span>
          <span>Status</span>
          <span style={{ textAlign: 'right' }}>ACTION</span>
        </div>
        {(activeTab === 'queue' ? queueGoals : completedGoals).map((goal) => {
          const pct = goal.target_amount > 0 ? Math.min(100, Math.round((currentAmount / goal.target_amount) * 100)) : 0
          return (
            <div key={goal.id} className={styles.tableRow}>
              <span className={styles.goalDetails}>
                <strong>{goal.title}</strong>
                <small>No description</small>
              </span>
              <span><span className={styles.styleBadge}>{stylePreset}</span><span className={styles.styleDot} style={{ background: goal.bar_color || '#E5E7EB' }} /></span>
              <span className={styles.progressCell} style={{ '--bar-color': goal.bar_color || '#10B981' } as React.CSSProperties}>
                ${currentAmount.toFixed(0)} / ${goal.target_amount.toFixed(0)}
                <div className={styles.miniTrack}><div className={styles.miniFill} style={{ width: `${pct}%` }} /></div>
              </span>
              <span>{goal.end_date ? new Date(goal.end_date).toLocaleString() : <span className={styles.never}>Never</span>}</span>
              <span>
                {goal.is_active ? (
                  <span className={styles.activeBadge}>Active</span>
                ) : (
                  <span className={styles.doneBadge}>Paused</span>
                )}
              </span>
              <span className={styles.actionsCell}>
                <button type="button" className={styles.iconBtn} title={goal.is_active ? 'Pause this goal' : 'Set as active goal'} style={{ color: goal.is_active ? '#F97316' : '#10B981' }} onClick={() => void handlePause(goal)}>
                  {goal.is_active ? <Pause size={15} /> : <Play size={15} />}
                </button>
                <button type="button" className={styles.iconBtn} title="Adjust Amount" style={{ color: '#10B981' }} onClick={() => { setAdjustAmount('0.00'); setModal({ type: 'adjust', goal }) }}>
                  <Plus size={15} />
                </button>
                <button type="button" className={styles.iconBtn} title="Reset Progress" style={{ color: '#22D3EE' }} onClick={() => setModal({ type: 'reset', goal })}>
                  <RotateCcw size={15} />
                </button>
                <button type="button" className={styles.iconBtn} title="Edit" onClick={() => { setTitle(goal.title); setTargetAmount(String(goal.target_amount)); setEditingGoal(goal); setEndDate(goal.end_date ? new Date(new Date(goal.end_date).getTime() - new Date(goal.end_date).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''); setEndDateEnabled(!!goal.end_date);
                  if (goal.widget) {
                    if (goal.widget.stylePreset) setStylePreset(goal.widget.stylePreset)
                    if (goal.widget.progressDisplay) setProgressDisplay(goal.widget.progressDisplay)
                    if (goal.widget.fontChoice) setFontChoice(goal.widget.fontChoice)
                    if (goal.widget.textSize) setTextSize(goal.widget.textSize)
                    if (goal.widget.strokeColor) setStrokeColor(goal.widget.strokeColor)
                    if (goal.widget.strokeWidth !== undefined) setStrokeWidth(goal.widget.strokeWidth)
                    if (goal.widget.shineFx !== undefined) setShineFx(goal.widget.shineFx)
                    if (goal.widget.palette) setPalette((p) => ({ ...p, ...goal.widget!.palette }))
                  }; setView('create') }}>
                  <Pencil size={15} />
                </button>
                <button type="button" className={styles.iconBtn} title="Delete" style={{ color: '#A78BFA' }} onClick={() => setModal({ type: 'delete', goal })}>
                  <Trash2 size={15} />
                </button>
              </span>
            </div>
          )
        })}
        {(activeTab === 'queue' ? queueGoals : completedGoals).length === 0 && (
          <p className={styles.emptyRow}>No goals here yet.</p>
        )}
      </div>

      {modal && modal.type === 'adjust' && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalEyebrow}>ADJUST AMOUNT</div>
            <h3 className={styles.modalTitle} style={{ display: 'flex', alignItems: 'center', gap: 10 }}><RotateCcw size={18} color="#60A5FA" />{modal.goal.title}</h3>
            <p className={styles.modalHint}>Custom Amount (use negative to subtract)</p>
            <div className={styles.amountStepper}>
              <button type="button" onClick={() => setAdjustAmount((v) => (Number.parseFloat(v) || 0) - 1 + '')}>-</button>
              <input value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} inputMode="decimal" />
              <button type="button" onClick={() => setAdjustAmount((v) => (Number.parseFloat(v) || 0) + 1 + '')}>+</button>
            </div>
            <div className={styles.quickRow}>
              {[1, 5, 10, 25, 50, 100].map((v) => (
                <button key={v} type="button" className={styles.qAdd} onClick={() => setAdjustAmount(String(v))}>+{v}</button>
              ))}
            </div>
            <div className={styles.quickRow}>
              {[-1, -5, -10, -25, -50, -100].map((v) => (
                <button key={v} type="button" className={styles.qSub} onClick={() => setAdjustAmount(String(v))}>{v}</button>
              ))}
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.modalCancel} onClick={() => setModal(null)}>Cancel</button>
              <button type="button" className={styles.modalApply} onClick={() => void applyAdjust()}>Apply</button>
            </div>
          </div>
        </div>
      )}

      {modal && modal.type === 'reset' && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <h3 className={styles.modalTitle} style={{ display: 'flex', alignItems: 'center', gap: 10 }}><RotateCcw size={18} color="#60A5FA" />CONFIRM RESET</h3>
            <p className={styles.modalHint}>This will reset the goal progress back to $0. Are you sure?</p>
            <div className={styles.modalActions}>
              <button type="button" className={styles.modalCancel} onClick={() => setModal(null)}>Cancel</button>
              <button type="button" className={styles.modalDanger} onClick={() => void applyReset()}>Yes, Reset</button>
            </div>
          </div>
        </div>
      )}

      {modal && modal.type === 'delete' && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <h3 className={styles.modalTitle} style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Trash2 size={18} color="#60A5FA" />CONFIRM DELETION</h3>
            <p className={styles.modalHint}>This goal sequence will be permanently terminated. This action cannot be undone.</p>
            <div className={styles.modalActions}>
              <button type="button" className={styles.modalCancel} onClick={() => setModal(null)}>Cancel</button>
               <button type="button" className={styles.modalDanger} style={{ background: '#EF4444', boxShadow: '0 0 16px rgba(239, 68, 68, 0.4)' }} onClick={() => void applyDelete()}>Yes, Delete</button>
            </div>
          </div>
        </div>
      )}
      {toast && (<div className={styles.toast}><span className={styles.toastIcon}><Check size={13} /></span><div><div className={styles.toastTitle}>Success</div><div className={styles.toastMsg}>{toast}</div></div></div>)}
    </div>
  )
}
