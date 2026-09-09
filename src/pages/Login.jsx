import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(
        !navigator.onLine
          ? "Can't verify login while offline. If you've logged in before on this device, you may already have offline access — try reloading."
          : err.message || 'Login failed'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: 360,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 28,
        }}
      >
        <h1 style={{ fontSize: 22, margin: '0 0 4px', fontWeight: 600 }}>Trip Log</h1>
        <p style={{ fontSize: 14, color: 'var(--ink-dim)', margin: '0 0 24px' }}>
          Sign in to track your meetings
        </p>

        <div style={{ marginBottom: 12 }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        {error && (
          <div style={{ color: 'var(--error)', fontSize: 13, marginBottom: 16 }}>{error}</div>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            width: '100%',
            background: 'var(--accent)',
            color: 'var(--accent-ink)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            padding: '13px',
            fontSize: 15,
            fontWeight: 600,
          }}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
