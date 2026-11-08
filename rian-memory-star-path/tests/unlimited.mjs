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

const before = Boolean((await request('/settings')).settings.unlimitedMemory);
const stamp = `${Date.now().toString(36)}${Math.random().toString(16).slice(2, 6)}`;
let mapId = null;
try {
  await request('/settings', {
    method: 'POST',
    body: JSON.stringify({ unlimitedMemory: true }),
  });
  const map = await request('/maps', {
    method: 'POST',
    body: JSON.stringify({ name: `__unlimited_${stamp}` }),
  });
  mapId = map.map.id;
  const longTitle = `无限制-${stamp}-${'长'.repeat(30)}`;
  const longFact = '事实'.repeat(100);
  const created = await request('/stars', {
    method: 'POST',
    body: JSON.stringify({
      mapId,
      title: longTitle,
      fact: longFact,
      reason: '理由'.repeat(80),
      condition: '条件'.repeat(70),
      type: 'fact',
      confidence: 0.95,
      tags: ['一', '二', '三', '四', '五', '六', '七', '八'],
    }),
  });
  assert.equal(created.star.title, longTitle);
  assert.equal(created.star.fact, longFact);
  assert.equal(created.star.tags.length, 8);

  const health = await request('/health');
  assert.equal(health.settings.unlimitedMemory, true);

  const sensitive = await fetch(`${API}/stars`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mapId,
      title: '敏感仍拦截',
      fact: 'password: should-not-save',
      type: 'fact',
      confidence: 0.95,
    }),
  });
  assert.equal(sensitive.status, 400, 'privacy filtering must remain active');
  console.log(`PASS unlimited title=${created.star.title.length} fact=${created.star.fact.length} tags=${created.star.tags.length}`);
} finally {
  if (mapId) {
    await request(`/maps/${encodeURIComponent(mapId)}`, { method: 'DELETE' }).catch(() => {});
  }
  await request('/settings', {
    method: 'POST',
    body: JSON.stringify({ unlimitedMemory: before }),
  }).catch(() => {});
}
