import assert from 'node:assert/strict';

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
const map = await request('/maps', {
  method: 'POST',
  body: JSON.stringify({ name: `__ingress_${stamp}` }),
});
try {
  const first = await request('/stars', {
    method: 'POST',
    body: JSON.stringify({
      mapId: map.map.id,
      title: `入口-${stamp}`,
      fact: '手动写入应该走统一去重逻辑。',
      type: 'fact',
      confidence: 0.95,
    }),
  });
  assert.equal(first.merged, false);
  const second = await request('/stars', {
    method: 'POST',
    body: JSON.stringify({
      mapId: map.map.id,
      title: `入口-${stamp}`,
      fact: '手动写入应该走统一去重逻辑。',
      type: 'fact',
      confidence: 0.96,
      tags: ['统一写入'],
    }),
  });
  assert.equal(second.merged, true);
  assert.equal(second.star.id, first.star.id);
  const meta = await request(`/maps/${encodeURIComponent(map.map.id)}/meta`);
  assert.equal(meta.total, 1, 'manual duplicate should merge into one active star');
  console.log(`PASS ingress duplicate merged id=${first.star.id}`);
} finally {
  await request(`/maps/${encodeURIComponent(map.map.id)}`, { method: 'DELETE' }).catch(() => {});
}
