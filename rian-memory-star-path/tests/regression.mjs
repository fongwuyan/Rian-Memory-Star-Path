import assert from 'node:assert/strict';
import { unzipSync } from '../zip.js';

const API =
  process.env.DSH_MEMORY_API ||
  'http://127.0.0.1:51107/plugins/rian-memory-star-path/api-v2';
const stamp = Date.now();
const cleanup = { maps: [], settings: null };

async function request(path, { method = 'GET', body, binary = false } = {}) {
  const headers = body
    ? { 'content-type': typeof body === 'string' ? 'application/json' : 'application/zip' }
    : undefined;
  const response = await fetch(API + path, { method, headers, body });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${path} -> ${response.status}: ${text}`);
  }
  if (binary) return response;
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

async function createMap(name) {
  const result = await request('/maps', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  cleanup.maps.push(result.map.id);
  return result.map;
}

async function createStar(mapId, title, fact, tags = ['回归'], status = 'active') {
  const result = await request('/stars', {
    method: 'POST',
    body: JSON.stringify({
      mapId,
      title,
      fact,
      type: 'fact',
      confidence: 0.95,
      status,
      tags,
    }),
  });
  return result.star;
}

async function getMap(mapId) {
  return request(`/maps/${encodeURIComponent(mapId)}`);
}

async function main() {
  const health = await request('/health');
  assert.equal(typeof health.maps, 'number');
  assert.ok(health.maps >= 1, 'expected at least one map');

  const map = await createMap(`__regression_${stamp}`);
  const oldStar = await createStar(
    map.id,
    `回归-旧-${stamp}`,
    '包管理器使用 npm。',
    ['回归'],
  );
  const newStar = await createStar(
    map.id,
    `回归-新-${stamp}`,
    '包管理器改用 pnpm，不再使用 npm。',
    ['回归'],
  );
  const third = await createStar(map.id, `回归-三-${stamp}`, '回归测试第三条。', ['回归']);
  const fourth = await createStar(map.id, `回归-四-${stamp}`, '回归测试第四条。', ['回归']);

  const pageOne = await request(`/maps/${encodeURIComponent(map.id)}/page?offset=0&limit=2`);
  assert.equal(pageOne.total, 4);
  assert.equal(pageOne.stars.length, 2);
  assert.equal(pageOne.hasMore, true);
  assert.equal(pageOne.nextOffset, 2);
  const pageTwo = await request(`/maps/${encodeURIComponent(map.id)}/page?offset=2&limit=2`);
  assert.equal(pageTwo.stars.length, 2);
  assert.equal(pageTwo.hasMore, false);
  const pageOneIds = new Set(pageOne.stars.map((star) => star.id));
  assert.equal(pageTwo.stars.filter((star) => pageOneIds.has(star.id)).length, 0);

  const meta = await request(`/maps/${encodeURIComponent(map.id)}/meta`);
  assert.equal(meta.total, 4);
  const viewport = await request(
    `/maps/${encodeURIComponent(map.id)}/viewport?cx=0&cy=0&w=2000&h=2000&pad=400`,
  );
  assert.equal(viewport.stars.length, 4);
  assert.equal(viewport.positions.length, 4);
  assert.ok(
    viewport.positions.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)),
    'expected finite viewport positions',
  );

  const probeTitle = `索引探针${stamp}`;
  const probe = await createStar(map.id, probeTitle, `增量索引验证 ${stamp}`, ['索引测试']);
  let probeSearch = await request(`/search?q=${encodeURIComponent(probeTitle)}&limit=10`);
  assert.ok(
    probeSearch.stars.some((star) => star.id === probe.id),
    'expected new star in incremental index',
  );
  await request(`/stars/${encodeURIComponent(probe.id)}`, { method: 'DELETE' });
  probeSearch = await request(`/search?q=${encodeURIComponent(probeTitle)}&limit=10`);
  assert.ok(
    !probeSearch.stars.some((star) => star.id === probe.id),
    'expected deleted star removed from incremental index',
  );

  const sensitiveResponse = await fetch(`${API}/stars`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      mapId: map.id,
      title: '敏感写入',
      fact: 'password: should-not-save',
      type: 'fact',
      confidence: 0.95,
    }),
  });
  assert.equal(sensitiveResponse.status, 400, 'expected manual sensitive write to be rejected');

  const edgeResult = await request('/edges', {
    method: 'POST',
    body: JSON.stringify({ from: oldStar.id, to: newStar.id, relation: 'contradicts' }),
  });
  assert.equal(edgeResult.edge.relation, 'contradicts');

  await request('/conflicts/resolve', {
    method: 'POST',
    body: JSON.stringify({ keepId: newStar.id, dropId: oldStar.id, mode: 'supersede' }),
  });
  let data = await getMap(map.id);
  assert.equal(data.stars.find((star) => star.id === oldStar.id).status, 'archived');
  const resolvedEdge = data.edges.find(
    (edge) =>
      (edge.from === oldStar.id && edge.to === newStar.id) ||
      (edge.from === newStar.id && edge.to === oldStar.id),
  );
  assert.equal(resolvedEdge.relation, 'supersedes');
  assert.ok(resolvedEdge.resolvedAt);

  await request(`/stars/${encodeURIComponent(newStar.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ title: `回归-新-${stamp}-改` }),
  });
  data = await getMap(map.id);
  const updated = data.stars.find((star) => star.id === newStar.id);
  assert.ok(
    (updated.history || []).some((entry) =>
      (entry.changes || []).some((change) => change.field === 'title'),
    ),
    'expected title history entry',
  );
  const titleEntry = (updated.history || []).find((entry) =>
    (entry.changes || []).some((change) => change.field === 'title'),
  );
  await request(`/stars/${encodeURIComponent(newStar.id)}/restore`, {
    method: 'POST',
    body: JSON.stringify({ version: titleEntry.version - 1 }),
  });
  data = await getMap(map.id);
  const restoredStar = data.stars.find((star) => star.id === newStar.id);
  assert.equal(restoredStar.title, `回归-新-${stamp}`, 'expected restored title');
  assert.ok(
    (restoredStar.history || []).some((entry) =>
      (entry.changes || []).some((change) => change.field === 'restore'),
    ),
    'expected restore history entry',
  );

  const suggested = await request('/constellations/suggest', {
    method: 'POST',
    body: JSON.stringify({ mapId: map.id }),
  });
  const cluster = (suggested.constellations || []).find(
    (constellation) => constellation.name === '回归',
  );
  assert.ok(cluster, 'expected 回归 constellation');
  assert.ok(cluster.starIds.length >= 3, 'expected at least three stars');

  const search = await request(`/search?q=${encodeURIComponent('回归')}&limit=50`);
  assert.ok(
    (search.stars || []).some((star) => star.mapId === map.id),
    'expected global search to include temporary map',
  );

  const exportResponse = await request(`/export?zip=1&mapId=${map.id}`, { binary: true });
  const archive = Buffer.from(await exportResponse.arrayBuffer());
  assert.equal(archive[0], 0x50, 'expected zip signature');
  assert.equal(archive[1], 0x4b, 'expected zip signature');
  const files = unzipSync(archive);
  assert.ok(files.has('manifest.json'), 'expected manifest');
  assert.ok(files.has(`maps/${map.id}.json`), 'expected map entry');
  const manifest = JSON.parse(files.get('manifest.json').toString('utf8'));
  assert.equal(manifest.format, 'rian-memory-star');
  assert.ok(manifest.counts.history >= 1, 'expected history in manifest');

  const preview = await request('/import-zip?preview=1', {
    method: 'POST',
    body: archive,
  });
  assert.ok(preview.hasConflict, 'expected same-name conflict');
  assert.equal(preview.maps[0].existingId, map.id);

  const imported = await request('/import-zip', { method: 'POST', body: archive });
  assert.equal(imported.imported.maps, 1);
  const maps = await request('/maps');
  const copy = maps.maps.find(
    (item) => item.name.includes('__regression_') && item.name.includes('（导入）'),
  );
  assert.ok(copy, 'expected imported copy');
  cleanup.maps.push(copy.id);
  const copyData = await getMap(copy.id);
  assert.ok(copyData.stars.length >= 4, 'expected imported stars');
  assert.ok(
    copyData.stars.some((star) => (star.history || []).length > 0),
    'expected imported history',
  );

  const settings = await request('/settings');
  const originalBudget = settings.settings.tokenBudget ?? 600;
  cleanup.settings = { tokenBudget: originalBudget };
  await request('/settings', {
    method: 'POST',
    body: JSON.stringify({ tokenBudget: 555 }),
  });
  const changed = await request('/settings');
  assert.equal(changed.settings.tokenBudget, 555);
  await request('/settings', {
    method: 'POST',
    body: JSON.stringify({ tokenBudget: originalBudget }),
  });
  const restored = await request('/settings');
  assert.equal(restored.settings.tokenBudget, originalBudget);

  console.log(
    `PASS map=${map.id} stars=${data.stars.length} third=${third.id} fourth=${fourth.id} imported=${copy.id}`,
  );
}

async function cleanupAll() {
  for (const mapId of cleanup.maps) {
    try {
      await request(`/maps/${encodeURIComponent(mapId)}`, { method: 'DELETE' });
    } catch {
      // best effort
    }
  }
  if (cleanup.settings) {
    try {
      await request('/settings', {
        method: 'POST',
        body: JSON.stringify(cleanup.settings),
      });
    } catch {
      // best effort
    }
  }
}

try {
  await main();
} catch (error) {
  console.error('FAIL', error?.stack || error);
  process.exitCode = 1;
} finally {
  await cleanupAll();
}
