import { useEffect, useState, useCallback } from 'react';
import { getAllEntriesGrouped, getPhoto, deleteEntry, localDateStr } from '../lib/db';
import { api } from '../lib/api';
import { onSyncStatusChange } from '../lib/sync';

function formatDateHeading(dateStr) {
  const today = localDateStr();
  if (dateStr === today) return 'Today';
  const d = new Date(dateStr + 'T00:00:00');
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateStr === localDateStr(yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

// The name a person typed in is always shown when present. Only when Name
// was left blank do we fall back to Company, so an entry logged in a hurry
// still has something identifiable in the list rather than "Unnamed contact."
function displayName(entry) {
  return entry.contactName?.trim() || entry.companyName?.trim() || 'Unnamed entry';
}

export default function Logs() {
  const [grouped, setGrouped] = useState({});
  const [expandedDates, setExpandedDates] = useState({});
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const g = await getAllEntriesGrouped();
    setGrouped(g);
    setExpandedDates((prev) => ({ [localDateStr()]: true, ...prev }));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Reload whenever a sync cycle finishes — this is what surfaces entries
  // pulled down from the server (e.g. after a cache clear or on a new
  // device) without the user needing to manually refresh.
  useEffect(() => {
    const unsub = onSyncStatusChange((status) => {
      if (status === 'idle') load();
    });
    return unsub;
  }, [load]);

  const dates = Object.keys(grouped).sort((a, b) => (a < b ? 1 : -1));

  const matches = (e, q) =>
    [e.contactName, e.companyName, ...(e.phones || []), e.remarks].join(' ').toLowerCase().includes(q.toLowerCase());

  const filteredDates = query.trim() ? dates.filter((date) => grouped[date].some((e) => matches(e, query))) : dates;

  if (selectedEntry) {
    return (
      <EntryDetail
        entry={selectedEntry}
        onBack={() => setSelectedEntry(null)}
        onDeleted={() => {
          setSelectedEntry(null);
          load();
        }}
      />
    );
  }

  return (
    <div className="page-container">
      <input
        placeholder="Search name, company, phone, remarks…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 18 }}
      />

      {filteredDates.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--ink-dim)', padding: '60px 20px', fontSize: 14 }}>
          {dates.length === 0
            ? "No entries yet. Log a meeting and it'll show up here."
            : 'No entries match your search.'}
        </div>
      )}

      {filteredDates.map((date) => {
        const entries = query.trim() ? grouped[date].filter((e) => matches(e, query)) : grouped[date];
        const isExpanded = query.trim() ? true : expandedDates[date] ?? false;

        return (
          <div key={date} style={{ marginBottom: 12 }}>
            <button
              onClick={() => setExpandedDates((p) => ({ ...p, [date]: !p[date] }))}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
                background: 'none',
                border: 'none',
                padding: '10px 4px',
                color: 'var(--ink)',
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 600 }}>{formatDateHeading(date)}</span>
              <span style={{ fontSize: 13, color: 'var(--ink-dim)' }}>
                {entries.length} {entries.length === 1 ? 'entry' : 'entries'}{' '}
                <span
                  style={{
                    display: 'inline-block',
                    transform: isExpanded ? 'rotate(90deg)' : 'none',
                    transition: 'transform 0.15s',
                  }}
                >
                  ›
                </span>
              </span>
            </button>

            {isExpanded && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 8,
                }}
              >
                {entries.map((entry) => (
                  <EntryCard key={entry.id} entry={entry} onClick={() => setSelectedEntry(entry)} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EntryCard({ entry, onClick }) {
  const [thumbUrl, setThumbUrl] = useState(null);
  const firstCardPhotoId = entry.cardPhotoIds?.[0];
  const firstCardPhotoPath = entry.cardPhotoPaths?.[0];

  useEffect(() => {
    let revoke;
    if (firstCardPhotoId) {
      // Local blob exists on this device — use it directly.
      getPhoto(firstCardPhotoId).then((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          revoke = url;
          setThumbUrl(url);
        }
      });
    } else if (firstCardPhotoPath) {
      // No local blob (this entry was pulled from the server, e.g. after a
      // cache clear or on a different device) — load it from the backend.
      setThumbUrl(api.photoUrl(firstCardPhotoPath));
    }
    return () => revoke && URL.revokeObjectURL(revoke);
  }, [firstCardPhotoId, firstCardPhotoPath]);

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        background: 'var(--ground)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 12,
        textAlign: 'left',
        width: '100%',
        color: 'var(--ink)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 8,
          background: 'var(--surface-raised)',
          flexShrink: 0,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          fontWeight: 600,
          color: 'var(--ink-dim)',
        }}
      >
        {thumbUrl ? (
          <img src={thumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          displayName(entry)[0]?.toUpperCase()
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayName(entry)}
        </div>
        {entry.contactName?.trim() && entry.companyName?.trim() && (
          <div style={{ fontSize: 13, color: 'var(--ink-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {entry.companyName}
          </div>
        )}
        {entry.phones?.length > 0 && (
          <div style={{ fontSize: 13, color: 'var(--accent)', marginTop: 2 }}>
            {entry.phones[0]}
            {entry.phones.length > 1 && (
              <span style={{ color: 'var(--ink-dim)' }}> +{entry.phones.length - 1} more</span>
            )}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
        {entry.syncStatus === 'pending' && (
          <span title="Not yet synced" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--warn)' }} />
        )}
        {entry.needsOcr && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--warn)',
              border: '1px solid var(--warn)',
              borderRadius: 10,
              padding: '2px 8px',
              whiteSpace: 'nowrap',
            }}
          >
            needs review
          </span>
        )}
      </div>
    </button>
  );
}

function EntryDetail({ entry, onBack, onDeleted }) {
  const [cardUrls, setCardUrls] = useState([]);
  const [productUrls, setProductUrls] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const urls = [];

    async function loadAll() {
      if (entry.cardPhotoIds?.length) {
        // Local blobs exist on this device — use them directly.
        for (const pid of entry.cardPhotoIds) {
          const blob = await getPhoto(pid);
          if (blob && !cancelled) {
            const url = URL.createObjectURL(blob);
            urls.push(url);
            setCardUrls((prev) => [...prev, url]);
          }
        }
      } else if (entry.cardPhotoPaths?.length) {
        // No local blobs — this entry was pulled from the server, so load
        // photos from the backend instead.
        for (const relPath of entry.cardPhotoPaths) {
          if (!cancelled) setCardUrls((prev) => [...prev, api.photoUrl(relPath)]);
        }
      }

      if (entry.productPhotoIds?.length) {
        for (const pid of entry.productPhotoIds) {
          const blob = await getPhoto(pid);
          if (blob && !cancelled) {
            const url = URL.createObjectURL(blob);
            urls.push(url);
            setProductUrls((prev) => [...prev, url]);
          }
        }
      } else if (entry.productPhotoPaths?.length) {
        for (const relPath of entry.productPhotoPaths) {
          if (!cancelled) setProductUrls((prev) => [...prev, api.photoUrl(relPath)]);
        }
      }
    }
    loadAll();

    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [entry]);

  async function handleDelete() {
    if (!confirm('Delete this entry? This cannot be undone.')) return;
    await deleteEntry(entry.id);
    onDeleted();
  }

  return (
    <div className="page-container">
      <button
        onClick={onBack}
        style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 15, padding: '8px 0', marginBottom: 8 }}
      >
        ‹ Back to log
      </button>

      <h1 style={{ fontSize: 20, margin: '0 0 2px' }}>{displayName(entry)}</h1>
      {entry.contactName?.trim() && entry.companyName?.trim() && (
        <p style={{ color: 'var(--ink-dim)', margin: '0 0 20px', fontSize: 14 }}>{entry.companyName}</p>
      )}

      {cardUrls.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SectionLabel>Card {cardUrls.length > 1 ? `(${cardUrls.length} photos)` : ''}</SectionLabel>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: cardUrls.length > 1 ? 'repeat(auto-fit, minmax(160px, 1fr))' : '1fr',
              gap: 8,
            }}
          >
            {cardUrls.map((url, i) => (
              <img key={i} src={url} alt="Business card" style={{ width: '100%', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }} />
            ))}
          </div>
        </div>
      )}

      <PhoneList phones={entry.phones} />
      <div style={{ marginTop: entry.phones?.length ? 10 : 0 }}>
        <DetailGrid entry={entry} />
      </div>

      {productUrls.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <SectionLabel>Product {productUrls.length > 1 ? `(${productUrls.length} photos)` : ''}</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
            {productUrls.map((url, i) => (
              <img key={i} src={url} alt="Product" style={{ width: '100%', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }} />
            ))}
          </div>
        </div>
      )}

      {entry.priceTiers?.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <SectionLabel>Pricing</SectionLabel>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            {entry.priceTiers.map((t, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                  fontSize: 14,
                }}
              >
                <span style={{ color: 'var(--ink-dim)' }}>{t.quantity} units</span>
                <span>{t.price}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {entry.remarks && (
        <div style={{ marginTop: 16 }}>
          <SectionLabel>Remarks</SectionLabel>
          <p style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: 0 }}>{entry.remarks}</p>
        </div>
      )}

      <button
        onClick={handleDelete}
        style={{
          marginTop: 28,
          background: 'none',
          border: '1px solid var(--error)',
          color: 'var(--error)',
          borderRadius: 'var(--radius-sm)',
          padding: '10px 16px',
          fontSize: 14,
          width: '100%',
          maxWidth: 300,
        }}
      >
        Delete entry
      </button>
    </div>
  );
}

function PhoneList({ phones }) {
  const [copiedIndex, setCopiedIndex] = useState(null);

  if (!phones?.length) return null;

  async function copyAt(idx) {
    try {
      await navigator.clipboard.writeText(phones[idx]);
      setCopiedIndex(idx);
      setTimeout(() => setCopiedIndex((c) => (c === idx ? null : c)), 1500);
    } catch {
      // Clipboard API can fail without HTTPS/permissions; number is still visible.
    }
  }

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      {phones.map((num, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            padding: '10px 14px',
            borderTop: i > 0 ? '1px solid var(--border)' : 'none',
            fontSize: 14,
          }}
        >
          <span style={{ color: 'var(--ink-dim)', flexShrink: 0 }}>
            {phones.length > 1 ? `Phone ${i + 1}` : 'Phone'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>{num}</span>
            <button
              type="button"
              onClick={() => copyAt(i)}
              aria-label="Copy phone number"
              title="Copy"
              style={{
                background: 'none',
                border: 'none',
                color: copiedIndex === i ? 'var(--ok)' : 'var(--ink-dim)',
                display: 'flex',
                alignItems: 'center',
                padding: 4,
              }}
            >
              {copiedIndex === i ? <CheckIcon /> : <CopyIcon />}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function DetailGrid({ entry }) {
  const rows = [
    ['Email', entry.email],
    ['WeChat', entry.wechat],
    ['Address', entry.address],
  ].filter(([, v]) => v);

  if (rows.length === 0) return null;

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      {rows.map(([label, value], i) => (
        <div
          key={label}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            padding: '10px 14px',
            borderTop: i > 0 ? '1px solid var(--border)' : 'none',
            fontSize: 14,
          }}
        >
          <span style={{ color: 'var(--ink-dim)', flexShrink: 0 }}>{label}</span>
          <span style={{ textAlign: 'right' }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-dim)', margin: '0 0 8px' }}>
      {children}
    </h2>
  );
}