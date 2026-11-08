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
  body: JSON.stringify({ name: `__graph_${stamp}` }),
});
try {
  const anchor = await request('/stars', {
    method: 'POST',
    body: JSON.stringify({
      mapId: map.map.id,
      title: `量子锚点${stamp}`,
      fact: '这是图召回的锚点记忆。',
      type: 'fact',
      confidence: 0.95,
    }),
  });
  const neighbor = await request('/stars', {
    method: 'POST',
    body: JSON.stringify({
      mapId: map.map.id,
      title: '香蕉船',
      fact: '这是与锚点相连但词面无关的记忆。',
      type: 'fact',
      confidence: 0.95,
    }),
  });
  await request('/edges', {
    method: 'POST',
    body: JSON.stringify({
      from: anchor.star.id,
      to: neighbor.star.id,
      relation: 'supports',
    }),
  });

  const query = encodeURIComponent(`量子锚点${stamp}`);
  const plain = await request(`/search?q=${query}&limit=10`);
  const graph = await request(`/search?q=${query}&limit=10&graph=1`);
  assert.ok(
    plain.stars.some((star) => star.id === anchor.star.id),
    'expected anchor in plain search',
  );
  assert.ok(
    !plain.stars.some((star) => star.id === neighbor.star.id),
    'neighbor should not match lexically',
  );
  assert.ok(
    graph.stars.some((star) => star.id === neighbor.star.id),
    'expected neighbor via graph expansion',
  );
  console.log(`PASS graph map=${map.map.id} plain=${plain.stars.length} graph=${graph.stars.length}`);
} finally {
  await request(`/maps/${encodeURIComponent(map.map.id)}`, { method: 'DELETE' }).catch(() => {});
}
