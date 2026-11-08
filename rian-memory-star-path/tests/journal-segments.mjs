import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const API = (process.env.DSH_MEMORY_API || 'http://127.0.0.1:51107/plugins/rian-memory-star-path/api-v2').replace(/\/$/, '');
const DATA_DIR = process.env.DSH_MEMORY_DATA_DIR;
assert.ok(DATA_DIR, 'DSH_MEMORY_DATA_DIR is required');

async function request(pathname, options = {}) {
  const response = await fetch(`${API}${pathname}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

const before =
  (await request('/settings')).settings.journalSegmentBytes || 4 * 1024 * 1024;
const stamp = `${Date.now().toString(36)}${Math.random().toString(16).slice(2, 6)}`;
let mapId = null;
try {
  await request('/settings', {
    method: 'POST',
    body: JSON.stringify({ journalSegmentBytes: 256 }),
  });
  const map = await request('/maps', {
    method: 'POST',
    body: JSON.stringify({ name: `__journal_segments_${stamp}` }),
  });
  mapId = map.map.id;
  const star = await request('/stars', {
    method: 'POST',
    body: JSON.stringify({
      mapId,
      title: `seg-${stamp}`,
      fact: 'journal segment test',
      type: 'fact',
      confidence: 0.9,
    }),
  });
  for (let index = 1; index <= 3; index += 1) {
    await request(`/stars/${encodeURIComponent(star.star.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: `seg-${stamp}-${index}` }),
    });
  }
  const files = readdirSync(path.join(DATA_DIR, 'maps')).filter((name) =>
    name.startsWith(`${mapId}.json.journal`),
  );
  assert.ok(files.length >= 2, `expected multiple journal segments, got ${files.join(',')}`);
  const data = await request(`/maps/${encodeURIComponent(mapId)}`);
  assert.equal(data.stars[0].title, `seg-${stamp}-3`);
  console.log(`PASS journal segments files=${files.length}`);
} finally {
  if (mapId) {
    await request(`/maps/${encodeURIComponent(mapId)}`, { method: 'DELETE' }).catch(() => {});
  }
  await request('/settings', {
    method: 'POST',
    body: JSON.stringify({ journalSegmentBytes: before }),
  }).catch(() => {});
}
