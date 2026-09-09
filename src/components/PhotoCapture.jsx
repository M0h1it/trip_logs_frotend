import { useRef, useState } from 'react';

// Compresses an image blob to keep local storage + sync payloads reasonable.
async function compressImage(file, maxDim = 1600, quality = 0.82) {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;

  if (width > maxDim || height > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, width, height);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
  });
}

// photos: array of { id, url } — id lets the parent track/remove a specific one
export default function PhotoCapture({ label, photos, maxPhotos = 5, onAdd, onRemove }) {
  const cameraInputRef = useRef(null);
  const uploadInputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const atLimit = photos.length >= maxPhotos;

  async function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // allow re-selecting the same file(s) later
    if (!files.length) return;

    const room = maxPhotos - photos.length;
    const toProcess = files.slice(0, room);

    setBusy(true);
    try {
      for (const file of toProcess) {
        const compressed = await compressImage(file);
        onAdd(compressed);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, color: 'var(--ink-dim)', marginBottom: 8 }}>
        {label} {photos.length > 0 && `(${photos.length}/${maxPhotos})`}
      </label>

      {photos.length > 0 && (
        <div className="photo-thumb-grid" style={{ marginBottom: 10 }}>
          {photos.map((photo) => (
            <div key={photo.id} style={{ position: 'relative', aspectRatio: '1' }}>
              <img
                src={photo.url}
                alt=""
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  display: 'block',
                }}
              />
              <button
                type="button"
                onClick={() => onRemove(photo.id)}
                aria-label="Remove photo"
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 24,
                  height: 24,
                  background: 'rgba(26,29,33,0.75)',
                  border: 'none',
                  borderRadius: '50%',
                  color: '#fff',
                  fontSize: 14,
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {!atLimit && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => cameraInputRef.current?.click()}
            style={{
              flex: 1,
              background: 'var(--surface)',
              border: '1px dashed var(--border)',
              borderRadius: 'var(--radius)',
              padding: '18px 12px',
              color: 'var(--ink)',
              fontSize: 14,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <CameraIcon />
            {busy ? 'Processing…' : 'Take photo'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => uploadInputRef.current?.click()}
            style={{
              flex: 1,
              background: 'var(--surface)',
              border: '1px dashed var(--border)',
              borderRadius: 'var(--radius)',
              padding: '18px 12px',
              color: 'var(--ink)',
              fontSize: 14,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <UploadIcon />
            Upload
          </button>
        </div>
      )}

      {/* capture="environment" opens the rear camera directly on mobile */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={handleFiles}
        style={{ display: 'none' }}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFiles}
        style={{ display: 'none' }}
      />
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="14" r="3.5" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
      <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </svg>
  );
}
