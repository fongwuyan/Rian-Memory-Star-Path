import assert from 'node:assert/strict';
import { zipSync } from '../zip.js';

const API = (process.env.DSH_MEMORY_API || 'http://127.0.0.1:51107/plugins/rian-memory-star-path/api-v2').replace(/\/$/, '');

async function request(pathname, options = {}) {
  const response = await fetch(`${API}${pathname}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

const stamp = `${Date.now().toString(36)}${Math.random().toString(16).slice(2, 6)}`;
const mapId = `map_backup_${stamp}`;
const starId = `st_backup_${stamp}`;
const map = { id: mapId, name: `__backup_journal_${stamp}`, kind: 'project' };
const archive = zipSync({
  'manifest.json': JSON.stringify({
    format: 'rian-memory-star',
    version: 1,
    kind: 'auto-backup',
  }),
  [`maps/${mapId}.json`]: JSON.stringify({
    map,
    stars: [],
    edges: [],
    constellations: [],
  }),
  [`journals/${mapId}.ndjson`]: `${JSON.stringify({
    op: 'upsert',
    star: {
      id: starId,
      mapId,
      title: `备份-journal-${stamp}`,
      fact: 'backup journal replay works',
      type: 'fact',
      status: 'active',
      confidence: 0.95,
      history: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    },
  })}\n`,
});

let importedId = null;
try {
  const response = await fetch(`${API}/import-zip?strategy=copy&privacy=allow`, {
    method: 'POST',
    headers: { 'content-type': 'application/zip' },
    body: archive,
  });
  const text = await response.text();
  assert.ok(response.ok, text);
  const result = JSON.parse(text);
  assert.equal(result.imported.stars, 1, 'journal star should be replayed before import');

  const list = await request('/maps');
  const imported = list.maps.find(
    (item) => item.name === map.name || item.name.startsWith(map.name),
  );
  assert.ok(imported, 'imported map should be listed');
  importedId = imported.id;
  const data = await request(`/maps/${encodeURIComponent(importedId)}`);
  assert.equal(data.stars.length, 1);
  assert.ok(String(data.stars[0].title).includes('备份-journal'));
  console.log(`PASS backup journal restore map=${importedId}`);
} finally {
  if (importedId) {
    await request(`/maps/${encodeURIComponent(importedId)}`, { method: 'DELETE' }).catch(() => {});
  }
}
