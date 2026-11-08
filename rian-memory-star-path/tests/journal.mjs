import assert from 'node:assert/strict';
import { statSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const API = (process.env.DSH_MEMORY_API || 'http://127.0.0.1:51107/plugins/rian-memory-star-path/api-v2').replace(/\/$/, '');
const DATA = process.env.DSH_MEMORY_DATA_DIR || '';
assert.ok(DATA, 'DSH_MEMORY_DATA_DIR is required');

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
const map = await request('/maps', {
  method: 'POST',
  body: JSON.stringify({ name: `__journal_${stamp}` }),
});
const mapFile = path.join(DATA, 'maps', `${map.map.id}.json`);
const journalFile = `${mapFile}.journal.ndjson`;
const before = statSync(mapFile).mtimeMs;

try {
  const star = await request('/stars', {
    method: 'POST',
    body: JSON.stringify({
      mapId: map.map.id,
      title: `日志-${stamp}`,
      fact: 'journal 写入验证。',
      type: 'fact',
      confidence: 0.95,
    }),
  });
  assert.ok(existsSync(journalFile), 'journal should exist');
  assert.equal(statSync(mapFile).mtimeMs, before, 'map snapshot should not be rewritten');
  let journal = readFileSync(journalFile, 'utf8');
  assert.ok(journal.includes('"op":"upsert"'), 'journal should contain upsert');

  const neighbor = await request('/stars', {
    method: 'POST',
    body: JSON.stringify({
      mapId: map.map.id,
      title: `日志邻居-${stamp}`,
      fact: 'journal edge 写入验证。',
      type: 'fact',
      confidence: 0.95,
    }),
  });
  await request('/edges', {
    method: 'POST',
    body: JSON.stringify({
      from: star.star.id,
      to: neighbor.star.id,
      relation: 'related',
    }),
  });
  journal = readFileSync(journalFile, 'utf8');
  assert.ok(journal.includes('"op":"edge.upsert"'), 'journal should contain edge upsert');
  assert.equal(statSync(mapFile).mtimeMs, before, 'edge journal should not rewrite map snapshot');

  await request(`/stars/${encodeURIComponent(star.star.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ title: `日志-${stamp}-改` }),
  });
  journal = readFileSync(journalFile, 'utf8');
  assert.ok(journal.includes(`日志-${stamp}-改`), 'journal should contain latest upsert');

  await request(`/stars/${encodeURIComponent(star.star.id)}`, { method: 'DELETE' });
  journal = readFileSync(journalFile, 'utf8');
  assert.ok(journal.includes('"op":"delete"'), 'journal should contain delete');
  assert.equal(statSync(mapFile).mtimeMs, before, 'map snapshot should still be unchanged');

  console.log(`PASS journal map=${map.map.id} bytes=${Buffer.byteLength(journal)}`);
} finally {
  await request(`/maps/${encodeURIComponent(map.map.id)}`, { method: 'DELETE' }).catch(() => {});
}
