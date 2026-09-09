import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { startAutoSync } from './lib/sync';
import Login from './pages/Login';
import EntryForm from './pages/EntryForm';
import Logs from './pages/Logs';
import SyncBadge from './components/SyncBadge';

function Shell() {
  const { isAuthed, logout } = useAuth();
  const [tab, setTab] = useState('new');

  useEffect(() => {
    if (!isAuthed) return;
    const stop = startAutoSync();
    return stop;
  }, [isAuthed]);

  if (!isAuthed) return <Login />;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: '1px solid var(--border)',
          position: 'sticky',
          top: 0,
          background: 'var(--ground)',
          zIndex: 10,
        }}
      >
        <h1 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Trip Log</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SyncBadge />
          <button
            onClick={logout}
            style={{ background: 'none', border: 'none', color: 'var(--ink-dim)', fontSize: 13 }}
          >
            Sign out
          </button>
        </div>
      </header>

      <nav
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          position: 'sticky',
          top: 53,
          background: 'var(--ground)',
          zIndex: 9,
          maxWidth: 900,
          margin: 0,
          width: '100%',
        }}
      >
        <TabButton active={tab === 'new'} onClick={() => setTab('new')}>
          Log meeting
        </TabButton>
        <TabButton active={tab === 'logs'} onClick={() => setTab('logs')}>
          History
        </TabButton>
      </nav>

      <main style={{ flex: 1 }}>
        {tab === 'new' ? <EntryForm onSaved={() => setTab('logs')} /> : <Logs />}
      </main>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        background: 'none',
        border: 'none',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        color: active ? 'var(--ink)' : 'var(--ink-dim)',
        padding: '12px',
        fontSize: 14,
        fontWeight: active ? 600 : 400,
      }}
    >
      {children}
    </button>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}