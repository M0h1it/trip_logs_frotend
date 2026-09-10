import Dexie from 'dexie';

// Local-first database. Every entry is written here FIRST, always,
// regardless of network state. Sync to the backend API happens in the
// background and never blocks a save.
export const db = new Dexie('chinaTrackerDB');

db.version(1).stores({
  // ++id = auto-increment local key. localId = stable UUID we generate,
  // used to dedupe when syncing (so the same entry never gets pushed twice).
  entries: '++id, localId, entryDate, syncStatus, createdAt',
  // Blob storage for photos, keyed by a photoId referenced from entries
  photos: 'photoId, entryLocalId',
});

// syncStatus values: 'pending' | 'synced' | 'error'

export function generateLocalId() {
  return crypto.randomUUID();
}

// Returns today's date as YYYY-MM-DD in the DEVICE'S LOCAL TIMEZONE.
// Deliberately not using `new Date().toISOString().slice(0, 10)` — that
// returns the UTC date, which is wrong for anyone east of UTC (e.g. India,
// China) during their morning hours: at 2am local time in a UTC+5:30
// timezone, the UTC date is still "yesterday," so entries logged first
// thing in the morning would get silently misfiled under Yesterday.
export function localDateStr(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function createEntry(entry) {
  const localId = generateLocalId();
  const now = new Date().toISOString();
  const record = {
    localId,
    contactName: entry.contactName || '',
    companyName: entry.companyName || '',
    phones: entry.phones || [],
    email: entry.email || '',
    wechat: entry.wechat || '',
    address: entry.address || '',
    cardPhotoIds: entry.cardPhotoIds || [],
    // Each element: { id, photoId (local blob ref), photoPath (server path
    // once synced), priceTiers: [{quantity,price,unit}], remarks }
    products: entry.products || [],
    remarks: entry.remarks || '',
    entryDate: entry.entryDate || localDateStr(),
    createdAt: now,
    updatedAt: now,
    syncStatus: 'pending',
    needsOcr: entry.needsOcr || false,
  };
  const id = await db.entries.add(record);
  return { id, ...record };
}

export async function updateEntry(id, changes) {
  await db.entries.update(id, {
    ...changes,
    updatedAt: new Date().toISOString(),
    syncStatus: 'pending',
  });
}

export async function deleteEntry(id) {
  const entry = await db.entries.get(id);
  if (entry) {
    for (const pid of entry.cardPhotoIds || []) await db.photos.delete(pid);
    for (const product of entry.products || []) {
      if (product.photoId) await db.photos.delete(product.photoId);
    }
  }
  await db.entries.delete(id);
}

export async function getEntriesByDate(dateStr) {
  return db.entries.where('entryDate').equals(dateStr).reverse().sortBy('createdAt');
}

export async function getAllEntriesGrouped() {
  const all = await db.entries.orderBy('createdAt').reverse().toArray();
  const grouped = {};
  for (const e of all) {
    if (!grouped[e.entryDate]) grouped[e.entryDate] = [];
    grouped[e.entryDate].push(e);
  }
  return grouped; // { '2026-09-12': [...entries], ... } already newest-first
}

export async function savePhoto(blob) {
  const photoId = generateLocalId();
  await db.photos.add({ photoId, blob, createdAt: new Date().toISOString() });
  return photoId;
}

export async function getPhoto(photoId) {
  if (!photoId) return null;
  const rec = await db.photos.get(photoId);
  return rec ? rec.blob : null;
}

export async function getPendingSyncEntries() {
  return db.entries.where('syncStatus').equals('pending').toArray();
}

// Insert an entry that came FROM the server (e.g. during a pull-down after
// cache clear or on a new device) rather than one the user is creating now.
// Server entries reference photos by remote path (served from /uploads/...)
// rather than a local IndexedDB blob id, since the blob was never on this
// device to begin with.
export async function upsertEntryFromServer(serverEntry) {
  const existing = await db.entries.where('localId').equals(serverEntry.localId).first();

  const record = {
    localId: serverEntry.localId,
    contactName: serverEntry.contactName || '',
    companyName: serverEntry.companyName || '',
    phones: serverEntry.phones || [],
    email: serverEntry.email || '',
    wechat: serverEntry.wechat || '',
    address: serverEntry.address || '',
    // Server-sourced photos: no local blob, just the remote path to fetch
    // from the API when displaying. Kept separate from cardPhotoIds so the
    // UI knows which to use. For products, match up any already-known
    // local photoIds by position so a re-pull doesn't orphan a photo this
    // device already has locally but hasn't synced the price/remarks for.
    cardPhotoIds: existing?.cardPhotoIds || [],
    cardPhotoPaths: serverEntry.cardPhotoPaths || [],
    products: (serverEntry.products || []).map((p, i) => ({
      id: existing?.products?.[i]?.id || generateLocalId(),
      photoId: existing?.products?.[i]?.photoId || null,
      photoPath: p.photoPath || null,
      priceTiers: p.priceTiers || [],
      remarks: p.remarks || '',
    })),
    remarks: serverEntry.remarks || '',
    entryDate: serverEntry.entryDate,
    createdAt: serverEntry.createdAt || new Date().toISOString(),
    updatedAt: serverEntry.updatedAt || new Date().toISOString(),
    syncStatus: 'synced',
    needsOcr: existing?.needsOcr || false,
  };

  if (existing) {
    await db.entries.update(existing.id, record);
  } else {
    await db.entries.add(record);
  }
}

export async function getAllLocalIds() {
  const all = await db.entries.toArray();
  return new Set(all.map((e) => e.localId));
}