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
  body: JSON.stringify({ name: `__conflict_${stamp}` }),
});
try {
  const oldStar = await request('/stars', {
    method: 'POST',
    body: JSON.stringify({
      mapId: map.map.id,
      title: `冲突-旧-${stamp}`,
      fact: '部署超时设置为 30 秒。',
      type: 'fact',
      confidence: 0.9,
    }),
  });
  const newStar = await request('/stars', {
    method: 'POST',
    body: JSON.stringify({
      mapId: map.map.id,
      title: `冲突-新-${stamp}`,
      fact: '部署超时设置为 60 秒。',
      type: 'fact',
      confidence: 0.95,
    }),
  });
  assert.equal(newStar.merged, false, 'numeric conflict must not merge');
  assert.equal(newStar.conflict, true, 'numeric difference should be a semantic conflict');
  const data = await request(`/maps/${encodeURIComponent(map.map.id)}`);
  const previous = data.stars.find((star) => star.id === oldStar.star.id);
  assert.equal(previous.disputed, true, 'older conflicting star should be disputed');
  assert.ok(
    data.edges.some(
      (edge) =>
        edge.relation === 'contradicts' &&
        edge.from === newStar.star.id &&
        edge.to === oldStar.star.id,
    ),
    'conflict should add a contradicts edge',
  );
  console.log(`PASS conflict old=${oldStar.star.id} new=${newStar.star.id}`);
} finally {
  await request(`/maps/${encodeURIComponent(map.map.id)}`, { method: 'DELETE' }).catch(() => {});
}
