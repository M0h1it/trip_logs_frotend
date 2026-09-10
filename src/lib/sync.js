import { db, getPendingSyncEntries, upsertEntryFromServer, getAllLocalIds } from './db';
import { api, getToken } from './api';

let syncInProgress = false;
const listeners = new Set();

export function onSyncStatusChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify(status) {
  for (const cb of listeners) cb(status);
}

async function syncOneEntry(entry) {
  const formData = new FormData();
  formData.append('localId', entry.localId);
  formData.append('contactName', entry.contactName || '');
  formData.append('companyName', entry.companyName || '');
  formData.append('phones', JSON.stringify(entry.phones || []));
  formData.append('email', entry.email || '');
  formData.append('wechat', entry.wechat || '');
  formData.append('address', entry.address || '');
  formData.append('remarks', entry.remarks || '');
  formData.append('entryDate', entry.entryDate);

  // Only attach card photo files if we haven't already uploaded them in a
  // previous (possibly partially-failed) sync attempt — re-attach by path
  // reference instead, so retries don't re-upload large files needlessly.
  const alreadyUploadedCardPaths = entry.cardPhotoPaths || [];
  if (entry.cardPhotoIds?.length && alreadyUploadedCardPaths.length < entry.cardPhotoIds.length) {
    for (const pid of entry.cardPhotoIds) {
      const photoRecord = await db.photos.get(pid);
      if (photoRecord) formData.append('cardPhoto', photoRecord.blob, `card-${pid}.jpg`);
    }
  } else if (alreadyUploadedCardPaths.length) {
    formData.append('cardPhotoPaths', JSON.stringify(alreadyUploadedCardPaths));
  }

  // Each product carries its own photo + price/remarks. productsMeta tells
  // the backend, in order, which products need a fresh photo upload (their
  // corresponding file is attached as productPhoto, in the same order) vs
  // which already have a photo on the server (existingPhotoPath is reused,
  // no re-upload needed).
  const products = entry.products || [];
  const productsMeta = [];
  for (const product of products) {
    if (product.photoPath) {
      // Already synced before — nothing new to upload for this one.
      productsMeta.push({
        hasNewPhoto: false,
        existingPhotoPath: product.photoPath,
        priceTiers: product.priceTiers || [],
        remarks: product.remarks || '',
      });
    } else if (product.photoId) {
      const photoRecord = await db.photos.get(product.photoId);
      if (photoRecord) {
        formData.append('productPhoto', photoRecord.blob, `product-${product.photoId}.jpg`);
        productsMeta.push({
          hasNewPhoto: true,
          priceTiers: product.priceTiers || [],
          remarks: product.remarks || '',
        });
      } else {
        // Blob went missing locally somehow — still preserve the
        // price/remarks rather than silently dropping this product.
        productsMeta.push({
          hasNewPhoto: false,
          existingPhotoPath: null,
          priceTiers: product.priceTiers || [],
          remarks: product.remarks || '',
        });
      }
    } else {
      productsMeta.push({
        hasNewPhoto: false,
        existingPhotoPath: null,
        priceTiers: product.priceTiers || [],
        remarks: product.remarks || '',
      });
    }
  }
  formData.append('productsMeta', JSON.stringify(productsMeta));

  const saved = await api.upsertEntry(formData);

  // Merge the server's confirmed photoPaths back into local product
  // records (matched by position, same order sent) so a future sync retry
  // recognizes these as already-uploaded and doesn't re-send the files.
  const mergedProducts = products.map((product, i) => ({
    ...product,
    photoPath: saved.products?.[i]?.photoPath || product.photoPath || null,
  }));

  await db.entries.update(entry.id, {
    syncStatus: 'synced',
    cardPhotoPaths: saved.cardPhotoPaths,
    products: mergedProducts,
  });
}

export async function runSync() {
  if (syncInProgress) return;
  if (!navigator.onLine) return;
  if (!getToken()) return; // not logged in yet, nothing to sync

  syncInProgress = true;
  notify('syncing');

  try {
    // Push first: anything created locally while offline goes up before we
    // pull, so a fresh entry isn't briefly overwritten by a stale pull.
    const pending = await getPendingSyncEntries();
    for (const entry of pending) {
      try {
        await syncOneEntry(entry);
      } catch (err) {
        console.error('Sync failed for entry', entry.localId, err);
        await db.entries.update(entry.id, { syncStatus: 'error' });
      }
    }

    await pullFromServer();

    notify('idle');
  } finally {
    syncInProgress = false;
  }
}

// Fetches every entry the server has for this account and inserts any that
// aren't already on this device. This is what makes cleared browser data,
// a new phone, or a second device recover the full history instead of
// showing empty — local storage is the fast path, the server is the safety
// net, and this is what connects them back up.
export async function pullFromServer() {
  if (!navigator.onLine || !getToken()) return;

  try {
    const serverEntries = await api.listEntries();
    const localIds = await getAllLocalIds();

    for (const serverEntry of serverEntries) {
      // Only pull in entries we don't already have locally. An entry that
      // exists locally is either already synced (no need to overwrite it —
      // local edits, if any, are still pending push) or currently mid-sync;
      // either way the push path above is the source of truth for those.
      if (!localIds.has(serverEntry.localId)) {
        await upsertEntryFromServer(serverEntry);
      }
    }
  } catch (err) {
    console.error('Pull from server failed:', err);
    // Non-fatal: local data is untouched, just means recovery has to wait
    // for the next successful pull.
  }
}

export function startAutoSync() {
  runSync();
  window.addEventListener('online', runSync);
  const interval = setInterval(runSync, 30000);
  return () => {
    window.removeEventListener('online', runSync);
    clearInterval(interval);
  };
}