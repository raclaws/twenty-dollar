import { createSignal, createMemo, onMount, Show } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { Wallet, Eye, EyeOff } from 'lucide-solid'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function LoginView() {
  const navigate = useNavigate()
  const [email, setEmail] = createSignal('')
  const [password, setPassword] = createSignal('')
  const [showPw, setShowPw] = createSignal(false)
  const [error, setError] = createSignal('')
  const [loading, setLoading] = createSignal(false)
  const [touched, setTouched] = createSignal<Record<string, boolean>>({})

  onMount(() => {
    fetch('/api/auth/me').then(r => { if (r.ok) navigate('/', { replace: true }) }).catch(() => {})
  })

  const errors = createMemo(() => {
    const e: Record<string, string> = {}
    if (touched().email && !EMAIL_RE.test(email().trim())) e.email = 'Enter a valid email'
    return e
  })

  const canSubmit = () => email().trim().length > 0 && password().length > 0

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setTouched({ email: true, password: true })
    if (!canSubmit()) return
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email().trim(), password: password() }),
      })

      if (!res.ok) {
        const data = await res.json()
        if (res.status === 429) {
          setError('Too many attempts. Please wait a moment.')
        } else {
          setError(data.error || 'Login failed')
        }
        return
      }

      const data = await res.json()
      localStorage.setItem('user_name', data.user.name)
      localStorage.setItem('user_email', data.user.email)
      window.location.href = '/'
    } catch {
      setError('Network error — check your connection')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-header">
          <Wallet size={32} />
          <h1>20 Dollar</h1>
        </div>
        <form class="auth-form" onSubmit={handleSubmit}>
          <div class="auth-field">
            <input
              type="email"
              placeholder="Email"
              value={email()}
              onInput={(e) => setEmail(e.currentTarget.value)}
              onBlur={() => setTouched(t => ({ ...t, email: true }))}
              classList={{ 'auth-input--error': !!errors().email }}
              autofocus
            />
            <Show when={errors().email}>
              <span class="auth-field-error">{errors().email}</span>
            </Show>
          </div>

          <div class="auth-field">
            <div class="auth-pw-wrap">
              <input
                type={showPw() ? 'text' : 'password'}
                placeholder="Password"
                autocomplete="current-password"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
              />
              <button type="button" class="auth-pw-toggle" onClick={() => setShowPw(!showPw())} tabIndex={-1}>
                {showPw() ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <Show when={error()}>
            <div class="auth-error auth-error--shake">{error()}</div>
          </Show>

          <button type="submit" disabled={loading() || !canSubmit()} class="auth-submit">
            {loading() ? 'Signing in...' : 'Sign in'}
          </button>
          <a href="/setup" class="auth-link">Create account</a>
        </form>
      </div>
    </div>
  )
}
