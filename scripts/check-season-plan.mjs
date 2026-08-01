// Asserts the season-plan model: free-transfer accounting, chip windows, chip scoring
// effects, and free hit reverting the squad afterwards.
//
//   node scripts/check-season-plan.mjs [proxyUrl]
//
// These are the rules that decide whether a projected score is right, so they get a
// check that fails loudly rather than a plausible-looking number.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

function findFile(dir, name) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      const hit = findFile(p, name);
      if (hit) return hit;
    } else if (e.name === name) return p;
  }
  return null;
}

const PROXY = process.argv[2] ?? 'https://fpl-proxy.fedornaumenko1998.workers.dev';
const outDir = mkdtempSync(join(tmpdir(), 'fplplan-'));

try {
  execFileSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['tsc', 'lib/planning/seasonPlan.ts', '--outDir', outDir,
     '--module', 'commonjs', '--moduleResolution', 'node', '--target', 'es2022', '--skipLibCheck'],
    { stdio: 'inherit' }
  );
  writeFileSync(join(outDir, 'package.json'), '{"type":"commonjs"}');
  const require_ = createRequire(import.meta.url);
  const P = require_(findFile(outDir, 'seasonPlan.js'));

  const get = async path => {
    const r = await fetch(`${PROXY}${path}`);
    assert.ok(r.ok, `${path} -> HTTP ${r.status}`);
    return r.json();
  };
  const [bootstrap, fixtures] = await Promise.all([get('/bootstrap-static/'), get('/fixtures/')]);
  const chips = bootstrap.chips;
  const rules = P.transferRulesFromBootstrap(bootstrap.game_settings);

  // ── Rules must come from the API ──
  assert.equal(rules.maxFreeTransfers, bootstrap.game_settings.max_extra_free_transfers + 1,
    'free-transfer cap must derive from max_extra_free_transfers');
  assert.equal(rules.hitCost, 4, 'a hit costs 4 points');

  // ── Chip windows ──
  const plan0 = P.emptyPlan('1');
  const atGw1 = P.availableChips(chips, 1, plan0);
  const atGw5 = P.availableChips(chips, 5, plan0);
  assert.ok(!atGw1.includes('wildcard'), 'wildcard opens at GW2, so must not be offered in GW1');
  assert.ok(atGw1.includes('bboost') && atGw1.includes('3xc'), 'team chips are available from GW1');
  assert.ok(atGw5.includes('wildcard') && atGw5.includes('freehit'), 'transfer chips available mid-window');

  // Spending a chip removes it from its own window but not from the other half.
  const spent = { ...plan0, entries: [{ gameweek: 5, transfers: [], chip: 'wildcard' }] };
  assert.ok(!P.availableChips(chips, 6, spent).includes('wildcard'),
    'a wildcard spent in the first half must not be offered again in that half');
  assert.ok(P.availableChips(chips, 25, spent).includes('wildcard'),
    'the second-half wildcard is a separate chip and must still be offered');

  // ── Free-transfer accounting ──
  const squadIds = bootstrap.elements.slice(0, 15).map(p => p.id);
  const basePicks = squadIds.map((id, i) => ({
    playerId: id, position: i + 1, elementType: bootstrap.elements[i].element_type,
    isCaptain: i === 0, isViceCaptain: i === 1, multiplier: i === 0 ? 2 : i < 11 ? 1 : 0,
  }));
  const playerById = new Map(bootstrap.elements.map(p => [p.id, p]));
  const gameweeks = [1, 2, 3, 4, 5];
  const evalOpts = { basePicks, playerById, fixtures, gameweeks, gameweeksPlayed: 38 };

  const idle = P.evaluatePlan(P.emptyPlan('1'), evalOpts);
  assert.deepEqual(idle.map(o => o.freeAvailable), [1, 2, 3, 4, 5],
    'unused free transfers must bank one per gameweek');
  assert.ok(idle.every(o => o.hit === 0), 'no transfers means no hit');

  const capped = P.evaluatePlan(
    { ...P.emptyPlan('1'), entries: [] },
    { ...evalOpts, gameweeks: [1, 2, 3, 4, 5, 6, 7, 8] }
  );
  assert.equal(Math.max(...capped.map(o => o.freeAvailable)), rules.maxFreeTransfers,
    `the bank must cap at ${rules.maxFreeTransfers}`);

  // Three transfers on one free transfer is two hits.
  const t = (n) => Array.from({ length: n }, (_, k) => ({ outId: squadIds[k], inId: 999000 + k }));
  const hitPlan = { ...P.emptyPlan('1'), entries: [{ gameweek: 1, transfers: t(3), chip: null }] };
  const hitOut = P.evaluatePlan(hitPlan, evalOpts);
  assert.equal(hitOut[0].hit, 8, 'three transfers against one free transfer costs 8');
  assert.equal(hitOut[1].freeAvailable, 1, 'overspending leaves you back on one next week');

  // A wildcard makes the same moves free and preserves the bank.
  const wc = { ...P.emptyPlan('1'), entries: [{ gameweek: 2, transfers: t(3), chip: 'wildcard' }] };
  const wcOut = P.evaluatePlan(wc, evalOpts);
  assert.equal(wcOut[1].hit, 0, 'a wildcard makes transfers free');
  assert.equal(wcOut[2].freeAvailable, 3, 'a wildcard must not consume the banked allowance');

  // ── Free hit reverts ──
  // Must be someone NOT already in the squad, or "still present at GW4" is true for the
  // wrong reason and the free-hit assertion below tests nothing.
  const swapId = bootstrap.elements.find(p =>
    p.element_type === basePicks[0].elementType && !squadIds.includes(p.id)).id;
  assert.ok(!squadIds.includes(swapId), 'test fixture: the incoming player must be outside the squad');
  const fh = { ...P.emptyPlan('1'), entries: [{ gameweek: 3, transfers: [{ outId: squadIds[0], inId: swapId }], chip: 'freehit' }] };
  assert.ok(P.squadAt(basePicks, fh, 3).includes(swapId), 'a free-hit signing plays in its own gameweek');
  assert.ok(!P.squadAt(basePicks, fh, 4).includes(swapId), 'a free-hit signing must be gone the week after');
  assert.ok(P.squadAt(basePicks, fh, 4).includes(squadIds[0]), 'the original player must return after a free hit');

  // A normal transfer is permanent, unlike a free hit.
  const perm = { ...P.emptyPlan('1'), entries: [{ gameweek: 3, transfers: [{ outId: squadIds[0], inId: swapId }], chip: null }] };
  assert.ok(P.squadAt(basePicks, perm, 4).includes(swapId), 'an ordinary transfer must persist');

  // ── picksAt: the pitch needs whole picks, not bare ids ──
  const byId = new Map(bootstrap.elements.map(p => [p.id, p]));
  const fhPicks3 = P.picksAt(basePicks, fh, 3, byId);
  const fhPicks4 = P.picksAt(basePicks, fh, 4, byId);
  assert.equal(fhPicks3.length, 15, 'picksAt must return every slot');
  assert.deepEqual(fhPicks3.map(p => p.position), basePicks.map(p => p.position),
    'slot positions must survive a transfer');
  assert.ok(fhPicks3.every(p => typeof p.elementType === 'number' && p.elementType > 0),
    'every pick must keep an elementType, or an emptied slot cannot describe itself');
  assert.equal(fhPicks3.filter(p => p.isCaptain).length, 1, 'exactly one captain');
  assert.notDeepEqual(fhPicks3.map(p => p.playerId), fhPicks4.map(p => p.playerId),
    'a free-hit gameweek must differ from the one after it');
  assert.deepEqual(fhPicks4.map(p => p.playerId), basePicks.map(p => p.playerId),
    'the gameweek after a free hit must match the base squad again');
  // An emptied slot keeps its position but drops its armband.
  const emptied = { ...P.emptyPlan('1'), entries: [] };
  const withHole = P.picksAt(
    basePicks.map((p, i) => (i === 0 ? { ...p, playerId: null, isCaptain: false } : p)),
    emptied, 1, byId
  );
  assert.equal(withHole[0].playerId, null, 'an emptied slot stays empty');
  assert.ok(withHole[0].elementType > 0, 'an emptied slot still knows its position');

  // ── Chip scoring effects ──
  const base = P.evaluatePlan(P.emptyPlan('1'), evalOpts)[0];
  const bb = P.evaluatePlan({ ...P.emptyPlan('1'), entries: [{ gameweek: 1, transfers: [], chip: 'bboost' }] }, evalOpts)[0];
  const tc = P.evaluatePlan({ ...P.emptyPlan('1'), entries: [{ gameweek: 1, transfers: [], chip: '3xc' }] }, evalOpts)[0];
  assert.ok(bb.projected >= base.projected, 'bench boost cannot lower a score');
  assert.ok(tc.projected >= base.projected, 'triple captain cannot lower a score');
  assert.ok(base.projected > 0, 'the baseline projection must be non-zero for a real squad');
  assert.ok(Number.isFinite(bb.projected) && Number.isFinite(tc.projected), 'chip scores must be finite');

  console.log('\nOK — season plan model holds');
  console.log(`   free transfers bank 1..${rules.maxFreeTransfers}; 3 moves on 1 FT = ${hitOut[0].hit} pts`);
  console.log(`   wildcard keeps the bank (GW3 free = ${wcOut[2].freeAvailable}); free hit reverts next week`);
  console.log(`   GW1 baseline ${base.projected} · bench boost ${bb.projected} · triple captain ${tc.projected}`);
  console.log(`   chips at GW1: ${atGw1.join(', ')} | at GW5: ${atGw5.join(', ')}`);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
