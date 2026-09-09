export default function PriceTiers({ tiers, onChange }) {
  function updateRow(idx, field, value) {
    const next = tiers.map((t, i) => (i === idx ? { ...t, [field]: value } : t));
    onChange(next);
  }

  function addRow() {
    onChange([...tiers, { quantity: '', price: '', unit: 'pc' }]);
  }

  function removeRow(idx) {
    onChange(tiers.filter((_, i) => i !== idx));
  }

  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, color: 'var(--ink-dim)', marginBottom: 8 }}>
        Price by quantity
      </label>

      {tiers.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--ink-dim)', marginBottom: 10 }}>
          No price tiers yet. Add one below.
        </div>
      )}

      {tiers.map((tier, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <input
            type="text"
            inputMode="numeric"
            placeholder="Qty"
            value={tier.quantity}
            onChange={(e) => updateRow(idx, 'quantity', e.target.value)}
            style={{ flex: '0 0 25%' }}
          />
          <span style={{ color: 'var(--ink-dim)', fontSize: 13 }}>units at</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="Price"
            value={tier.price}
            onChange={(e) => updateRow(idx, 'price', e.target.value)}
            style={{ flex: 1 }}
          />
          <button
            type="button"
            onClick={() => removeRow(idx)}
            aria-label="Remove tier"
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
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        style={{
          background: 'transparent',
          border: '1px dashed var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '10px 14px',
          color: 'var(--accent)',
          fontSize: 14,
          width: '100%',
        }}
      >
        + Add price tier
      </button>
    </div>
  );
}
