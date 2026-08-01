// Asserts buildOptimalSquad returns a *legal* FPL squad against live FPL data.
// The constraints couple (budget vs. club cap vs. position quota), so a plausible
// looking squad can still be illegal — this is the check that catches that.
//
//   node scripts/check-squad-builder.mjs [proxyUrl]
//
// Compiles the calculation modules on the fly; they only import types, so tsc emits
// runnable JS with no path-alias handling needed.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

/** tsc picks rootDir from the import graph, so locate the emitted file rather than guess. */
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
const BUDGET = 1000;
const QUOTA = { 1: 2, 2: 5, 3: 5, 4: 3 };

const outDir = mkdtempSync(join(tmpdir(), 'fplcheck-'));
try {
  // CommonJS, because the sources use bundler-style extensionless imports ("./xPts")
  // which Node's ESM loader rejects but its CJS resolver handles.
  execFileSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['tsc', 'lib/calculations/squadBuilder.ts', '--outDir', outDir,
     '--module', 'commonjs', '--moduleResolution', 'node', '--target', 'es2022', '--skipLibCheck'],
    { stdio: 'inherit' }
  );
  writeFileSync(join(outDir, 'package.json'), '{"type":"commonjs"}');

  const emitted = findFile(outDir, 'squadBuilder.js');
  assert.ok(emitted, 'tsc did not emit squadBuilder.js');
  const { buildOptimalSquad } = createRequire(import.meta.url)(emitted);

  const get = async path => {
    const r = await fetch(`${PROXY}${path}`);
    assert.ok(r.ok, `${path} -> HTTP ${r.status}`);
    return r.json();
  };
  const [bootstrap, fixtures] = await Promise.all([
    get('/bootstrap-static/'),
    get('/fixtures/'),
  ]);

  const built = buildOptimalSquad(bootstrap.elements, fixtures, 3, 0);
  const { squad, picks, teamValue, bank } = built;
  const clubs = new Map();
  for (const p of squad) clubs.set(p.team, (clubs.get(p.team) ?? 0) + 1);
  const counts = squad.reduce((a, p) => ({ ...a, [p.element_type]: (a[p.element_type] ?? 0) + 1 }), {});
  const starters = picks.filter(p => p.position <= 11);
  const startersByPos = starters.reduce((a, pick) => {
    const t = squad.find(p => p.id === pick.playerId).element_type;
    return { ...a, [t]: (a[t] ?? 0) + 1 };
  }, {});

  assert.equal(squad.length, 15, 'squad must hold 15 players');
  assert.equal(picks.length, 15, 'must be one pick per player');
  assert.equal(new Set(squad.map(p => p.id)).size, 15, 'no duplicate players');
  assert.deepEqual(counts, QUOTA, `position quota must be 2/5/5/3, got ${JSON.stringify(counts)}`);
  assert.ok(teamValue <= BUDGET, `over budget: ${teamValue} > ${BUDGET}`);
  assert.equal(bank, BUDGET - teamValue, 'bank must be the unspent remainder');
  assert.equal(teamValue, squad.reduce((s, p) => s + p.now_cost, 0), 'teamValue must equal squad cost');
  for (const [team, n] of clubs) assert.ok(n <= 3, `club ${team} has ${n} players, max 3`);
  assert.ok(squad.every(p => p.status === 'a'), 'only available players may be picked');

  assert.equal(starters.length, 11, 'exactly 11 starters');
  assert.equal(startersByPos[1], 1, 'exactly 1 starting GK');
  assert.ok(startersByPos[2] >= 3 && startersByPos[2] <= 5, 'starting DEF must be 3-5');
  assert.ok(startersByPos[3] >= 2 && startersByPos[3] <= 5, 'starting MID must be 2-5');
  assert.ok(startersByPos[4] >= 1 && startersByPos[4] <= 3, 'starting FWD must be 1-3');
  assert.deepEqual(
    picks.map(p => p.position).sort((a, b) => a - b),
    Array.from({ length: 15 }, (_, i) => i + 1),
    'positions must be exactly 1..15'
  );
  assert.equal(picks.filter(p => p.isCaptain).length, 1, 'exactly one captain');
  assert.equal(picks.filter(p => p.isViceCaptain).length, 1, 'exactly one vice-captain');
  const cap = picks.find(p => p.isCaptain);
  assert.ok(cap.position <= 11, 'captain must be a starter');
  assert.equal(cap.multiplier, 2, 'captain multiplier must be 2');
  assert.ok(picks.filter(p => p.position > 11).every(p => p.multiplier === 0), 'bench multiplier must be 0');

  const name = id => bootstrap.elements.find(p => p.id === id).web_name;
  console.log(`\nOK — legal squad, £${(teamValue / 10).toFixed(1)}m spent, £${(bank / 10).toFixed(1)}m left`);
  console.log(`   XI projected ${built.totalXPts} pts (C: ${name(cap.playerId)})`);
  console.log(`   ${starters.length} starters, ${clubs.size} clubs, formation ` +
    `${startersByPos[2]}-${startersByPos[3]}-${startersByPos[4]}`);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
