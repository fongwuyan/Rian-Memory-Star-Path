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

async function addStar(mapId, title, fact) {
  const result = await request('/stars', {
    method: 'POST',
    body: JSON.stringify({ mapId, title, fact, type: 'fact', confidence: 0.95 }),
  });
  return result.star;
}

async function viewport(mapId) {
  return request(
    `/maps/${encodeURIComponent(mapId)}/viewport?cx=0&cy=0&w=2400&h=2400&pad=800`,
  );
}

const stamp = `${Date.now().toString(36)}${Math.random().toString(16).slice(2, 6)}`;
const map = await request('/maps', {
  method: 'POST',
  body: JSON.stringify({ name: `__viewport_${stamp}` }),
});
try {
  const a = await addStar(map.map.id, `视口A-${stamp}`, '视口 revision 测试 A。');
  const b = await addStar(map.map.id, `视口B-${stamp}`, '视口 revision 测试 B。');
  let snapshot = await viewport(map.map.id);
  assert.equal(snapshot.total, 2);
  assert.equal(snapshot.stars.length, 2);

  await request(`/stars/${encodeURIComponent(a.id)}`, { method: 'DELETE' });
  snapshot = await viewport(map.map.id);
  assert.equal(snapshot.total, 1, 'deleted star should leave the layout total');
  assert.equal(snapshot.stars.length, 1);
  assert.ok(!snapshot.stars.some((star) => star.id === a.id), 'deleted star should not render');

  const c = await addStar(map.map.id, `视口C-${stamp}`, '视口 revision 测试 C。');
  snapshot = await viewport(map.map.id);
  assert.equal(snapshot.total, 2, 'new star should enter the layout total');
  assert.ok(snapshot.stars.some((star) => star.id === c.id), 'new star should appear');
  assert.ok(snapshot.stars.some((star) => star.id === b.id), 'existing star should remain');
  console.log(`PASS viewport revision deleted=${a.id} added=${c.id}`);
} finally {
  await request(`/maps/${encodeURIComponent(map.map.id)}`, { method: 'DELETE' }).catch(() => {});
}
