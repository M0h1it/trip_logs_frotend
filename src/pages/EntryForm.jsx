import { useState } from 'react';
import PhotoCapture from '../components/PhotoCapture';
import PriceTiers from '../components/PriceTiers';
import { createEntry, savePhoto, generateLocalId } from '../lib/db';
import { extractCardDetails, extractProductDetails } from '../lib/ocr';
import { runSync } from '../lib/sync';

const emptyForm = {
  contactName: '',
  companyName: '',
  phones: [''],
  email: '',
  wechat: '',
  address: '',
  priceTiers: [],
  remarks: '',
};

export default function EntryForm({ onSaved }) {
  const [form, setForm] = useState(emptyForm);

  // photos stored as { id, blob, url } while editing; id is a local-only
  // temp key (not the same as the eventual IndexedDB photoId) so we can
  // add/remove before anything is persisted.
  const [cardPhotos, setCardPhotos] = useState([]);
  const [productPhotos, setProductPhotos] = useState([]);

  const [ocrStatus, setOcrStatus] = useState(''); // '', 'running', 'done', 'error', 'offline'
  const [ocrError, setOcrError] = useState('');
  const [productOcrStatus, setProductOcrStatus] = useState('');

  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleCardAdd(blob) {
    const id = generateLocalId();
    const url = URL.createObjectURL(blob);
    setCardPhotos((prev) => [...prev, { id, blob, url }]);

    // Run OCR on this specific photo; only the first successful read
    // auto-fills fields, since additional card photos (e.g. the back) often
    // don't carry the same structured info.
    if (!navigator.onLine) {
      setOcrStatus('offline');
      return;
    }

    setOcrStatus('running');
    setOcrError('');
    try {
      const details = await extractCardDetails(blob);
      setForm((f) => {
        // Merge OCR phones with anything already typed in, without
        // duplicating or dropping a number the person already entered.
        const existingPhones = f.phones.filter((p) => p.trim());
        const ocrPhones = (details.phones || []).map((p) => p.trim()).filter(Boolean);
        const mergedPhones = existingPhones.length ? existingPhones : ocrPhones;

        return {
          ...f,
          contactName: f.contactName || details.contactName || '',
          companyName: f.companyName || details.companyName || '',
          phones: mergedPhones.length ? mergedPhones : [''],
          email: f.email || details.email || '',
          wechat: f.wechat || details.wechat || '',
          address: f.address || details.address || '',
        };
      });
      setOcrStatus('done');
    } catch (err) {
      console.error(err);
      setOcrStatus('error');
      const friendlyMessage = err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')
        ? 'Could not reach the card-reading service. Check your connection and fill in fields manually.'
        : err.message || 'Could not read card. Please enter details manually.';
      setOcrError(friendlyMessage);
    }
  }

  function handleCardRemove(id) {
    setCardPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function handleProductAdd(blob) {
    const id = generateLocalId();
    const url = URL.createObjectURL(blob);
    setProductPhotos((prev) => [...prev, { id, blob, url }]);

    if (!navigator.onLine) {
      setProductOcrStatus('offline');
      return;
    }
    setProductOcrStatus('running');
    try {
      const details = await extractProductDetails(blob);
      if (details.notes) {
        setForm((f) => ({
          ...f,
          remarks: f.remarks ? `${f.remarks}\n${details.notes}` : details.notes,
        }));
      }
      setProductOcrStatus('done');
    } catch (err) {
      console.error(err);
      setProductOcrStatus('error');
    }
  }

  function handleProductRemove(id) {
    setProductPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const cardPhotoIds = [];
      for (const photo of cardPhotos) cardPhotoIds.push(await savePhoto(photo.blob));

      const productPhotoIds = [];
      for (const photo of productPhotos) productPhotoIds.push(await savePhoto(photo.blob));

      await createEntry({
        ...form,
        phones: form.phones.map((p) => p.trim()).filter(Boolean),
        cardPhotoIds,
        productPhotoIds,
        needsOcr: ocrStatus === 'offline' || ocrStatus === 'error',
      });

      runSync(); // fire-and-forget; UI doesn't wait on this

      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);

      // reset for next entry
      setForm(emptyForm);
      cardPhotos.forEach((p) => URL.revokeObjectURL(p.url));
      productPhotos.forEach((p) => URL.revokeObjectURL(p.url));
      setCardPhotos([]);
      setProductPhotos([]);
      setOcrStatus('');
      setProductOcrStatus('');

      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  const canSave =
    form.contactName.trim() ||
    form.companyName.trim() ||
    form.phones.some((p) => p.trim()) ||
    cardPhotos.length ||
    productPhotos.length;

  return (
    <div className="page-container-wide" style={{ paddingBottom: 110 }}>
      <div className="entry-columns">
        {/* Left column: business card */}
        <div>
          <Section title="Business card">
            <PhotoCapture
              label="Photos of the card (front, back, etc.)"
              photos={cardPhotos}
              maxPhotos={5}
              onAdd={handleCardAdd}
              onRemove={handleCardRemove}
            />

            {ocrStatus === 'running' && <StatusLine tone="info">Reading card details…</StatusLine>}
            {ocrStatus === 'offline' && (
              <StatusLine tone="warn">
                Offline — saved photo only. Fill fields below manually; you can re-run auto-read later
                when back online.
              </StatusLine>
            )}
            {ocrStatus === 'error' && <StatusLine tone="error">{ocrError}</StatusLine>}
            {ocrStatus === 'done' && (
              <StatusLine tone="ok">Details filled in below — check they're correct.</StatusLine>
            )}

            <PhoneFields phones={form.phones} onChange={(v) => setField('phones', v)} />

            <div className="form-grid" style={{ marginTop: 12 }}>
              <Field label="Name" value={form.contactName} onChange={(v) => setField('contactName', v)} />
              <Field label="Company" value={form.companyName} onChange={(v) => setField('companyName', v)} />
              <Field label="Email" value={form.email} onChange={(v) => setField('email', v)} />
              <Field label="WeChat" value={form.wechat} onChange={(v) => setField('wechat', v)} />
              <div className="span-2">
                <Field label="Address" value={form.address} onChange={(v) => setField('address', v)} multiline />
              </div>
            </div>
          </Section>
        </div>

        {/* Right column: product, pricing, remarks */}
        <div>
          <Section title="Product">
            <PhotoCapture
              label="Photos of the product"
              photos={productPhotos}
              maxPhotos={5}
              onAdd={handleProductAdd}
              onRemove={handleProductRemove}
            />
            {productOcrStatus === 'running' && <StatusLine tone="info">Reading label…</StatusLine>}
            {productOcrStatus === 'offline' && (
              <StatusLine tone="warn">Offline — photo saved, no auto-read.</StatusLine>
            )}
          </Section>

          <Section title="Pricing">
            <PriceTiers tiers={form.priceTiers} onChange={(v) => setField('priceTiers', v)} />
          </Section>

          <Section title="Remarks">
            <textarea
              rows={4}
              placeholder="Anything else worth remembering about this meeting…"
              value={form.remarks}
              onChange={(e) => setField('remarks', e.target.value)}
            />
          </Section>
        </div>
      </div>

      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '12px 16px calc(12px + env(safe-area-inset-bottom))',
          background: 'linear-gradient(to top, var(--ground) 65%, transparent)',
        }}
      >
        <div style={{ maxWidth: 1400, margin: 0 }}>
          {savedFlash && (
            <div style={{ textAlign: 'center', color: 'var(--ok)', fontSize: 13, marginBottom: 8 }}>
              Saved
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            style={{
              width: '100%',
              maxWidth: 420,
              margin: '0 auto',
              display: 'block',
              background: canSave ? 'var(--accent)' : 'var(--surface-raised)',
              color: canSave ? 'var(--accent-ink)' : 'var(--ink-dim)',
              border: 'none',
              borderRadius: 'var(--radius)',
              padding: '16px',
              fontSize: 16,
              fontWeight: 600,
              boxShadow: canSave ? '0 4px 20px rgba(37,99,235,0.25)' : 'none',
            }}
          >
            {saving ? 'Saving…' : 'Save entry'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div
      style={{
        background: 'var(--ground)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 16,
        marginBottom: 14,
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      <h2 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px', color: 'var(--ink-dim)' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, multiline }) {
  const Comp = multiline ? 'textarea' : 'input';
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--ink-dim)', marginBottom: 4 }}>
        {label}
      </label>
      <Comp
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={multiline ? 2 : undefined}
      />
    </div>
  );
}

function PhoneFields({ phones, onChange }) {
  const [copiedIndex, setCopiedIndex] = useState(null);

  function updateAt(idx, value) {
    onChange(phones.map((p, i) => (i === idx ? value : p)));
  }

  function addField() {
    onChange([...phones, '']);
  }

  function removeAt(idx) {
    const next = phones.filter((_, i) => i !== idx);
    onChange(next.length ? next : ['']);
  }

  async function copyAt(idx) {
    const value = phones[idx]?.trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedIndex(idx);
      setTimeout(() => setCopiedIndex((c) => (c === idx ? null : c)), 1500);
    } catch {
      // Clipboard API can fail without HTTPS/permissions; fail silently,
      // the number is still visible and selectable by hand.
    }
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--ink-dim)', marginBottom: 4 }}>
        Phone
      </label>
      <div style={{ display: 'grid', gap: 8 }}>
        {phones.map((value, idx) => (
          <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              value={value}
              onChange={(e) => updateAt(idx, e.target.value)}
              placeholder={phones.length > 1 ? `Phone ${idx + 1}` : 'Phone'}
              inputMode="tel"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              onClick={() => copyAt(idx)}
              disabled={!value.trim()}
              aria-label="Copy phone number"
              title="Copy"
              style={{
                background: 'var(--surface-raised)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                width: 40,
                height: 44,
                flexShrink: 0,
                color: copiedIndex === idx ? 'var(--ok)' : 'var(--ink-dim)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {copiedIndex === idx ? <CheckIcon /> : <CopyIcon />}
            </button>
            {phones.length > 1 && (
              <button
                type="button"
                onClick={() => removeAt(idx)}
                aria-label="Remove phone number"
                style={{
                  background: 'var(--surface-raised)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  width: 40,
                  height: 44,
                  flexShrink: 0,
                  color: 'var(--error)',
                  fontSize: 18,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addField}
        style={{
          marginTop: 8,
          background: 'transparent',
          border: '1px dashed var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '8px 14px',
          color: 'var(--accent)',
          fontSize: 13,
        }}
      >
        + Add another number
      </button>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function StatusLine({ tone, children }) {
  const colors = {
    info: 'var(--ink-dim)',
    warn: 'var(--warn)',
    error: 'var(--error)',
    ok: 'var(--ok)',
  };
  return (
    <div style={{ fontSize: 13, color: colors[tone], marginTop: 8, lineHeight: 1.4 }}>
      {children}
    </div>
  );
}