import { useEffect, useState } from 'react';
import { onSyncStatusChange, runSync } from '../lib/sync';
import { db } from '../lib/db';

export default function SyncBadge() {
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    const unsub = onSyncStatusChange((status) => setSyncing(status === 'syncing'));

    let cancelled = false;
    async function refreshCount() {
      const n = await db.entries.where('syncStatus').equals('pending').count();
      if (!cancelled) setPendingCount(n);
    }
    refreshCount();
    const interval = setInterval(refreshCount, 3000);

    return () => {
      cancelled = true;
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      unsub();
      clearInterval(interval);
    };
  }, []);

  let label, dotColor;
  if (!online) {
    label = pendingCount > 0 ? `Offline · ${pendingCount} to sync` : 'Offline';
    dotColor = 'var(--ink-dim)';
  } else if (syncing) {
    label = 'Syncing…';
    dotColor = 'var(--accent)';
  } else if (pendingCount > 0) {
    label = `${pendingCount} pending`;
    dotColor = 'var(--warn)';
  } else {
    label = 'Synced';
    dotColor = 'var(--ok)';
  }

  return (
    <button
      onClick={() => online && runSync()}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        padding: '6px 12px',
        fontSize: 13,
        color: 'var(--ink-dim)',
      }}
      title={online ? 'Tap to sync now' : 'No connection — will sync automatically when back online'}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: dotColor,
          flexShrink: 0,
        }}
      />
      {label}
    </button>
  );
}
