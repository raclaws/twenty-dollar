import { createSignal, createMemo, onMount, Show } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { Wallet, Eye, EyeOff } from 'lucide-solid'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function SetupView() {
  const navigate = useNavigate()
  const [name, setName] = createSignal('')
  const [email, setEmail] = createSignal('')
  const [password, setPassword] = createSignal('')
  const [confirmPw, setConfirmPw] = createSignal('')
  const [showPw, setShowPw] = createSignal(false)
  const [error, setError] = createSignal('')
  const [loading, setLoading] = createSignal(false)
  const [touched, setTouched] = createSignal<Record<string, boolean>>({})

  onMount(() => {
    fetch('/api/auth/me').then(r => { if (r.ok) navigate('/', { replace: true }) }).catch(() => {})
  })

  const errors = createMemo(() => {
    const e: Record<string, string> = {}
    if (touched().name && name().trim().length === 0) e.name = 'Name is required'
    if (touched().email && !EMAIL_RE.test(email().trim())) e.email = 'Enter a valid email'
    if (touched().password && password().length < 6) e.password = 'Min 6 characters'
    if (touched().confirmPw && confirmPw() !== password()) e.confirmPw = 'Passwords don’t match'
    return e
  })

  const canSubmit = () =>
    name().trim().length > 0 &&
    EMAIL_RE.test(email().trim()) &&
    password().length >= 6 &&
    confirmPw() === password()

  const [phase, setPhase] = createSignal<'idle' | 'submitting' | 'setting-up'>('idle')

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setTouched({ name: true, email: true, password: true, confirmPw: true })
    if (!canSubmit()) return
    setError('')
    setPhase('submitting')
    setLoading(true)

    try {
      const start = Date.now()
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name().trim(), email: email().trim(), password: password() }),
      })

      if (!res.ok) {
        const data = await res.json()
        if (res.status === 429) {
          setError('Too many attempts. Please wait a moment.')
        } else {
          setError(data.error || 'Signup failed')
        }
        setPhase('idle')
        return
      }

      const data = await res.json()
      localStorage.setItem('user_name', data.user.name)
      localStorage.setItem('user_email', data.user.email)

      setPhase('setting-up')
      const elapsed = Date.now() - start
      const holdMs = Math.max(1500 - elapsed, 0)
      await new Promise(r => setTimeout(r, holdMs))

      navigate('/', { replace: true })
    } catch {
      setError('Network error — check your connection')
      setPhase('idle')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-header">
          <Wallet size={32} />
          <h1>Create Account</h1>
          <p class="auth-subtitle">Start managing your budget</p>
        </div>
        <form class="auth-form" onSubmit={handleSubmit}>
          <div class="auth-field">
            <input
              type="text"
              placeholder="Your name"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              onBlur={() => setTouched(t => ({ ...t, name: true }))}
              classList={{ 'auth-input--error': !!errors().name }}
              autofocus
            />
            <Show when={errors().name}>
              <span class="auth-field-error">{errors().name}</span>
            </Show>
          </div>

          <div class="auth-field">
            <input
              type="email"
              placeholder="Email"
              value={email()}
              onInput={(e) => setEmail(e.currentTarget.value)}
              onBlur={() => setTouched(t => ({ ...t, email: true }))}
              classList={{ 'auth-input--error': !!errors().email }}
            />
            <Show when={errors().email}>
              <span class="auth-field-error">{errors().email}</span>
            </Show>
          </div>

          <div class="auth-field">
            <div class="auth-pw-wrap">
              <input
                type={showPw() ? 'text' : 'password'}
                placeholder="Password (min 6 characters)"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                onBlur={() => setTouched(t => ({ ...t, password: true }))}
                classList={{ 'auth-input--error': !!errors().password }}
              />
              <button type="button" class="auth-pw-toggle" onClick={() => setShowPw(!showPw())} tabIndex={-1}>
                {showPw() ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <Show when={errors().password}>
              <span class="auth-field-error">{errors().password}</span>
            </Show>
          </div>

          <div class="auth-field">
            <input
              type={showPw() ? 'text' : 'password'}
              placeholder="Confirm password"
              value={confirmPw()}
              onInput={(e) => setConfirmPw(e.currentTarget.value)}
              onBlur={() => setTouched(t => ({ ...t, confirmPw: true }))}
              classList={{ 'auth-input--error': !!errors().confirmPw }}
            />
            <Show when={errors().confirmPw}>
              <span class="auth-field-error">{errors().confirmPw}</span>
            </Show>
          </div>

          <Show when={error()}>
            <div class="auth-error auth-error--shake">{error()}</div>
          </Show>

          <button type="submit" disabled={loading() || !canSubmit()} class="auth-submit">
            {phase() === 'setting-up' ? 'Setting up your account...' : phase() === 'submitting' ? 'Creating...' : 'Create account'}
          </button>
          <a href="/login" class="auth-link">Already have an account? Sign in</a>
        </form>
      </div>
    </div>
  )
}
