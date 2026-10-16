'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import styles from './new.module.css'

const COLORS = [
  '#10b981', // Emerald
  '#0e5844', // Deep teal
  '#34d399', // Signal teal
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#06b6d4', // Cyan
]

export default function NewProjectPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [themeColor, setThemeColor] = useState(COLORS[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const supabase = createClient()

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setName(val)
    // Auto generate slug
    setSlug(
      val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '')
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error: insertError } = await supabase
        .from('projects')
        .insert({
          user_id: user.id,
          name,
          slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
          description,
          is_public: isPublic,
          theme_color: themeColor,
        })
        .select()
        .single()

      if (insertError) throw insertError

      router.push(`/dashboard/projects/${data.id}`)
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Link href="/dashboard" className="btn btn-ghost btn-sm">
          ← Back to Dashboard
        </Link>
        <h1 className={styles.title}>Create New Project</h1>
        <p className={styles.subtitle}>Set up a new live activity dashboard for your stream or campaign</p>
      </div>

      <div className={`${styles.card} card`}>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className="input-group">
            <label className="input-label" htmlFor="project-name">Project Name</label>
            <input
              id="project-name"
              type="text"
              className="input"
              placeholder="e.g. Summer Gaming Marathon 2025"
              value={name}
              onChange={handleNameChange}
              required
              disabled={loading}
            />
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="project-slug">URL Slug</label>
            <div className={styles.slugInputWrapper}>
              <span className={styles.slugPrefix}>Kit Steam.com/p/</span>
              <input
                id="project-slug"
                type="text"
                className={`input ${styles.slugInput}`}
                placeholder="summer-marathon"
                value={slug}
                onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="project-desc">Description (Optional)</label>
            <textarea
              id="project-desc"
              className="input"
              placeholder="Briefly describe what this stream or campaign is about..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              disabled={loading}
              rows={3}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Theme Color</label>
            <div className={styles.colorPicker}>
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`${styles.colorSwatch} ${themeColor === c ? styles.selectedColor : ''}`}
                  style={{ background: c }}
                  onClick={() => setThemeColor(c)}
                />
              ))}
            </div>
          </div>

          <div className={styles.checkboxGroup}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={isPublic}
                onChange={e => setIsPublic(e.target.checked)}
                className={styles.checkbox}
              />
              <div>
                <strong>Make this project public</strong>
                <p>Anyone with the link can view your live activity feed.</p>
              </div>
            </label>
          </div>

          {error && <div className="alert-error">{error}</div>}

          <div className={styles.formActions}>
            <Link href="/dashboard" className="btn btn-ghost">
              Cancel
            </Link>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              id="submit-create-project"
            >
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
