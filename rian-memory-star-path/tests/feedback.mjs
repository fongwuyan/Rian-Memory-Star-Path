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
  body: JSON.stringify({ name: `__feedback_${stamp}` }),
});
try {
  const created = await request('/stars', {
    method: 'POST',
    body: JSON.stringify({
      mapId: map.map.id,
      title: `反馈-${stamp}`,
      fact: '反馈会调整未来排序。',
      type: 'fact',
      confidence: 0.9,
    }),
  });
  const starId = created.star.id;
  const used = await request(`/stars/${encodeURIComponent(starId)}/feedback`, {
    method: 'POST',
    body: JSON.stringify({ signal: 'used' }),
  });
  assert.equal(used.usedCount, 1);
  await request(`/stars/${encodeURIComponent(starId)}/feedback`, {
    method: 'POST',
    body: JSON.stringify({ signal: 'used' }),
  });
  const wrong = await request(`/stars/${encodeURIComponent(starId)}/feedback`, {
    method: 'POST',
    body: JSON.stringify({ signal: 'wrong' }),
  });
  assert.equal(wrong.usedCount, 2);
  assert.equal(wrong.wrongCount, 1);

  const detail = await request(`/stars/${encodeURIComponent(starId)}`);
  assert.equal(detail.star.usedCount, 2);
  assert.equal(detail.star.wrongCount, 1);
  assert.ok(detail.star.lastFeedbackAt, 'feedback timestamp should persist');

  await assert.rejects(
    request(`/stars/${encodeURIComponent(starId)}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ signal: 'unknown' }),
    }),
    /signal must be/,
  );
  console.log(`PASS feedback used=2 wrong=1 id=${starId}`);
} finally {
  await request(`/maps/${encodeURIComponent(map.map.id)}`, { method: 'DELETE' }).catch(() => {});
}
