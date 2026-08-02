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
    ['tsc', 'lib/calculations/squadBuilder.ts', 'lib/calculations/squadRules.ts', '--outDir', outDir,
     '--module', 'commonjs', '--moduleResolution', 'node', '--target', 'es2022', '--skipLibCheck'],
    { stdio: 'inherit' }
  );
  writeFileSync(join(outDir, 'package.json'), '{"type":"commonjs"}');

  const emitted = findFile(outDir, 'squadBuilder.js');
  assert.ok(emitted, 'tsc did not emit squadBuilder.js');
  const require_ = createRequire(import.meta.url);
  const { buildOptimalSquad } = require_(emitted);
  const { calcExpectedPoints, xgPointsPer90 } = require_(findFile(outDir, 'xPts.js'));
  const { settingsFromBootstrap } = require_(findFile(outDir, 'squadRules.js'));

  const get = async path => {
    const r = await fetch(`${PROXY}${path}`);
    assert.ok(r.ok, `${path} -> HTTP ${r.status}`);
    return r.json();
  };
  const [bootstrap, fixtures] = await Promise.all([
    get('/bootstrap-static/'),
    get('/fixtures/'),
  ]);

  // ── The limits must come from the API, not from constants in the builder ──
  const settings = settingsFromBootstrap(bootstrap.game_settings);
  assert.equal(settings.totalSpend, bootstrap.game_settings.squad_total_spend,
    'budget must be read from game_settings');
  assert.equal(settings.squadSize, bootstrap.game_settings.squad_squadsize,
    'squad size must be read from game_settings');
  assert.equal(settings.teamLimit, bootstrap.game_settings.squad_team_limit,
    'club limit must be read from game_settings');

  // ── The component model must never produce NaN or a negative ──
  for (const p of bootstrap.elements) {
    const xp = calcExpectedPoints(p, fixtures, 38, 3, 0);
    assert.ok(Number.isFinite(xp), `projection is not finite for ${p.web_name}: ${xp}`);
    assert.ok(xp >= 0, `projection is negative for ${p.web_name}: ${xp}`);
    assert.ok(Number.isFinite(xgPointsPer90(p)), `xgPointsPer90 not finite for ${p.web_name}`);
  }
  const withXg = bootstrap.elements.filter(p => xgPointsPer90(p) > 0).length;
  assert.ok(withXg > 200, `expected a rate for most players, got ${withXg}`);

  // ── Availability: the single biggest thing the old model ignored ──
  const fit = bootstrap.elements.find(p => p.minutes > 2000 && p.status === 'a');
  const base = calcExpectedPoints(fit, fixtures, 38, 3, 0);
  assert.ok(base > 0, 'a fit, heavily-played player must project above zero');

  const quarter = calcExpectedPoints({ ...fit, chance_of_playing_next_round: 25 }, fixtures, 38, 3, 0);
  assert.ok(Math.abs(quarter - base * 0.25) < 0.15,
    `25% chance should project about a quarter: got ${quarter} vs ${base * 0.25}`);

  // The branch most easily written as `chance ?? 100`, which would silently project
  // injured players at full strength — the exact bug this rewrite removes.
  const injured = calcExpectedPoints(
    { ...fit, status: 'i', chance_of_playing_next_round: null }, fixtures, 38, 3, 0);
  assert.equal(injured, 0, 'an unavailable player with no published percentage must score 0');
  const stillFit = calcExpectedPoints(
    { ...fit, status: 'a', chance_of_playing_next_round: null }, fixtures, 38, 3, 0);
  assert.ok(stillFit > 0, 'an available player with no published percentage must not be zeroed');

  // ── Blanks and doubles. The real fixture list has neither right now, so build them. ──
  const teamOf = fit.team;
  const other = bootstrap.teams.find(t => t.id !== teamOf).id;
  const synth = (event, count) => Array.from({ length: count }, (_, i) => ({
    event, finished: false, team_h: teamOf, team_a: other,
    team_h_difficulty: 3, team_a_difficulty: 3, kickoff_time: null, id: 90000 + event * 10 + i,
  }));
  const single = calcExpectedPoints(fit, synth(1, 1), 38, 1, 0);
  const double = calcExpectedPoints(fit, synth(1, 2), 38, 1, 0);
  assert.ok(single > 0, 'a single gameweek must score');
  assert.ok(Math.abs(double - single * 2) < 0.15,
    `a double gameweek must score about twice a single: ${double} vs ${single * 2}`);

  // A blank needs the gameweek to *exist* without this team in it. Passing only the
  // team's later fixture just made that gameweek the window, so the first version of
  // this assertion tested nothing.
  const third = bootstrap.teams.find(t => t.id !== teamOf && t.id !== other).id;
  const blankWeek = [
    { event: 1, finished: false, team_h: other, team_a: third,
      team_h_difficulty: 3, team_a_difficulty: 3, kickoff_time: null, id: 91001 },
    ...synth(2, 1),
  ];
  assert.equal(calcExpectedPoints(fit, blankWeek, 38, 1, 0), 0,
    'a gameweek the team does not play in must score 0');
  assert.ok(calcExpectedPoints(fit, blankWeek, 38, 2, 0) > 0,
    'widening the window to reach their next fixture must score again');

  // ── Position branches must actually be wired ──
  const gk = bootstrap.elements.find(p => p.element_type === 1 && p.minutes > 2000);
  const gkBase = calcExpectedPoints(gk, fixtures, 38, 3, 0);
  const gkMoreSaves = calcExpectedPoints({ ...gk, saves_per_90: gk.saves_per_90 + 3 }, fixtures, 38, 3, 0);
  assert.ok(gkMoreSaves > gkBase, 'a keeper making more saves must project higher');
  const def = bootstrap.elements.find(p => p.element_type === 2 && p.minutes > 2000);
  const defLeaky = calcExpectedPoints(
    { ...def, expected_goals_conceded_per_90: def.expected_goals_conceded_per_90 + 1.5 }, fixtures, 38, 3, 0);
  assert.ok(defLeaky < calcExpectedPoints(def, fixtures, 38, 3, 0),
    'a defender expected to concede more must project lower');

  const built = buildOptimalSquad(bootstrap.elements, fixtures, 3, 0, 38, settings);
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

  // ── Strategies: legal, genuinely different, and honestly ranked ──
  const { STRATEGIES } = require_(findFile(outDir, 'squadBuilder.js'));
  const builds = STRATEGIES.map(st => ({
    strategy: st,
    squad: buildOptimalSquad(bootstrap.elements, fixtures, 3, 0, 38, settings, st),
  }));
  for (const { strategy, squad: b } of builds) {
    const c = b.squad.reduce((a, p) => ({ ...a, [p.element_type]: (a[p.element_type] ?? 0) + 1 }), {});
    assert.equal(b.squad.length, 15, `${strategy}: must hold 15`);
    assert.deepEqual(c, QUOTA, `${strategy}: quota must be 2/5/5/3, got ${JSON.stringify(c)}`);
    assert.ok(b.teamValue <= BUDGET, `${strategy}: over budget at ${b.teamValue}`);
    const clubs = new Map();
    for (const p of b.squad) clubs.set(p.team, (clubs.get(p.team) ?? 0) + 1);
    for (const [t, n] of clubs) assert.ok(n <= 3, `${strategy}: club ${t} has ${n}`);
  }
  const ids = builds.map(b => b.squad.squad.map(p => p.id).sort().join(','));
  assert.equal(new Set(ids).size, builds.length,
    'each strategy must produce a genuinely different squad, not a reshuffle');
  const best = builds.find(b => b.strategy === 'projection').squad.totalXPts;
  for (const b of builds) {
    assert.ok(b.squad.totalXPts <= best + 0.05,
      `${b.strategy} (${b.squad.totalXPts}) beat the projection build (${best}) on its own metric`);
  }

  const name = id => bootstrap.elements.find(p => p.id === id).web_name;
  console.log(`\nmodel: ${withXg}/${bootstrap.elements.length} players score above zero`);
  console.log(`  availability — fit ${base.toFixed(1)} · 25% chance ${quarter.toFixed(1)} · injured ${injured}`);
  console.log(`  fixtures — single ${single.toFixed(1)} · double ${double.toFixed(1)} · blank 0`);
  console.log('  strategies — ' + builds.map(b => `${b.strategy} ${b.squad.totalXPts}`).join(' · '));
  console.log(`limits from API: £${settings.totalSpend / 10}m · ${settings.squadSize} players · max ${settings.teamLimit}/club`);
  console.log(`OK — legal squad, £${(teamValue / 10).toFixed(1)}m spent, £${(bank / 10).toFixed(1)}m left`);
  console.log(`   XI projected ${built.totalXPts} pts (C: ${name(cap.playerId)})`);
  console.log(`   ${starters.length} starters, ${clubs.size} clubs, formation ` +
    `${startersByPos[2]}-${startersByPos[3]}-${startersByPos[4]}`);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
