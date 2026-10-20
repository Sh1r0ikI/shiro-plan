import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  PlanError,
  addDays,
  assertPlan,
  buildDayModel,
  cigaretteLimit,
  currentStreak,
  dayScore,
  formatDayTitle,
  formatSpan,
  lastPlanDate,
  locate,
  pickBrainTasks,
  planDates,
  pluralDays,
  summary,
  toggleCheck,
  weekdayKey,
} from '../logic.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const plan = JSON.parse(readFileSync(join(root, 'plan.json'), 'utf8'));
const start = plan.startDate;

function allChecks() {
  return Object.fromEntries(plan.rules.map((rule) => [rule.id, true]));
}

function baseStore(iso) {
  const store = {};
  let cursor = addDays(iso, -1);
  while (locate(plan, cursor).phase === 'active') {
    store[cursor] = { workout: true };
    cursor = addDays(cursor, -1);
  }
  return store;
}

function workoutLines(iso, store = baseStore(iso), today = iso) {
  const model = buildDayModel(plan, iso, store, today);
  const extra = model.rules.find((rule) => rule.id === 'workout').extra;
  return { model, extra, lines: [...extra.lines, ...extra.dailyLines] };
}

test('starter plan is valid and scores eleven one-point rules', () => {
  assertPlan(plan);
  assert.equal(plan.rules.length, 11);
  assert.deepEqual(dayScore(plan, {}), { got: 0, max: 11 });
  assert.equal(dayScore(plan, { wake: true }).got, 1);
  assert.equal(dayScore(plan, allChecks()).got, 11);
  assert.equal(new Set(plan.rules.map((rule) => rule.id)).size, 11);
});

test('week zero is the day before 21 Oct 2026, a Wednesday', () => {
  assert.equal(weekdayKey(start), 'wed');
  assert.equal(formatDayTitle(start), 'Среда, 21 октября');
  assert.equal(locate(plan, '2026-10-20').phase, 'before');
  assert.equal(locate(plan, start).week, 1);
  assert.equal(lastPlanDate(plan), '2027-01-12');
  assert.equal(locate(plan, lastPlanDate(plan)).week, 12);
  assert.equal(locate(plan, addDays(start, 84)).phase, 'after');
  assert.equal(planDates(plan).length, 84);
  assert.equal(formatSpan('2026-10-21', '2026-10-27'), '21–27 окт');
  assert.equal(formatSpan('2026-10-28', '2026-11-03'), '28 окт – 3 ноя');
});

test('weekday sessions and week phases come from plan.json', () => {
  const week1 = {
    [addDays(start, 0)]: 'Силовая',
    [addDays(start, 1)]: 'Выносливость',
    [addDays(start, 2)]: 'Силовая',
    [addDays(start, 3)]: 'Выносливость',
    [addDays(start, 4)]: 'Растяжка и мобильность',
    [addDays(start, 5)]: 'Силовая',
    [addDays(start, 6)]: 'Выносливость',
  };
  for (const [iso, title] of Object.entries(week1)) {
    assert.equal(workoutLines(iso).extra.title, title, iso);
  }

  const first = workoutLines(start).lines;
  assert.deepEqual(first, [
    'Отжимания — 5×максимум',
    'Австралийские подтягивания — 4×8',
    'Негативные подтягивания — 4×3',
    'Приседания — 4×20',
    'Выпады — 3×12 на ногу',
    'Планка — 3×45 с',
    'Лодочка и супермен — 3×15',
    'Вис на турнике — 3×до отказа',
  ]);

  assert.deepEqual(workoutLines(addDays(start, 1)).lines, [
    'Быстрая ходьба — 40 мин',
    'Вис на турнике — 3×до отказа',
  ]);
  assert.deepEqual(workoutLines(addDays(start, 4)).lines, [
    'Растяжка и мобильность — 30 мин · грудь, позвоночник',
    'Вис на турнике — 3×до отказа',
  ]);

  const intervals = workoutLines(addDays(start, 15));
  assert.equal(intervals.model.week, 3);
  assert.equal(intervals.lines[0], 'Интервалы — 5×(2 мин бег + 1 мин ходьба)');

  const run = workoutLines(addDays(start, 29));
  assert.equal(run.model.week, 5);
  assert.equal(run.lines[0], 'Бег — 20–30 мин');
});

test('rep progression adds the configured step each week and leaves timed work alone', () => {
  const week2 = workoutLines(addDays(start, 7)).lines;
  assert.equal(week2[1], 'Австралийские подтягивания — 4×9');
  assert.equal(week2[5], 'Планка — 3×45 с');

  const week12 = workoutLines(addDays(start, 77)).lines;
  assert.equal(locate(plan, addDays(start, 77)).week, 12);
  assert.equal(weekdayKey(addDays(start, 77)), 'wed');
  assert.ok(week12.includes('Австралийские подтягивания — 4×19'));
  assert.ok(week12.includes('Негативные подтягивания — 4×14'));
  assert.ok(week12.includes('Приседания — 4×31'));
  assert.ok(week12.includes('Выпады — 3×23 на ногу'));
  assert.ok(week12.includes('Лодочка и супермен — 3×26'));
  assert.ok(week12.includes('Планка — 3×45 с'));
  assert.ok(week12.includes('Отжимания — 5×максимум'));
  assert.equal(workoutLines(lastPlanDate(plan)).lines[0], 'Бег — 20–30 мин');
});

test('a missed workout doubles the next day only, and two misses raise the block', () => {
  const first = workoutLines(start, {}, start);
  assert.equal(first.model.skip.doubled, false);
  assert.equal(first.lines[0], 'Отжимания — 5×максимум');

  const doubled = workoutLines(addDays(start, 1), {}, addDays(start, 1));
  assert.equal(doubled.model.skip.missed, 1);
  assert.equal(doubled.model.skip.doubled, true);
  assert.equal(doubled.lines[0], 'Быстрая ходьба — 80 мин');
  assert.equal(doubled.lines[1], 'Вис на турнике — 6×до отказа');
  assert.match(doubled.model.skip.doubleText, /двойная норма/);
  assert.equal(doubled.model.skip.blockedText, '');

  const blocked = workoutLines(addDays(start, 2), {}, addDays(start, 2));
  assert.equal(blocked.model.skip.missed, 2);
  assert.match(blocked.lines[0], /10×максимум/);
  assert.match(blocked.model.skip.blockedText, /нельзя/);

  const checked = { [addDays(start, 1)]: { workout: true } };
  const clear = workoutLines(addDays(start, 2), checked, addDays(start, 2));
  assert.equal(clear.model.skip.missed, 0);
  assert.equal(clear.lines[0], 'Отжимания — 5×максимум');

  const preview = workoutLines(addDays(start, 2), {}, '2026-10-20');
  assert.equal(preview.model.skip.doubled, false);
  assert.equal(preview.model.editable, false);
  assert.equal(preview.model.isFuture, true);
});

test('cigarette limit steps down by two and is zero from week 8', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6, 7, 8, 12].map((week) => cigaretteLimit(plan, week)),
    [14, 12, 10, 8, 6, 4, 2, 0, 0],
  );
  const week1 = buildDayModel(plan, start, {}, start);
  const cig1 = week1.rules.find((rule) => rule.id === 'cigarettes');
  assert.equal(cig1.text, 'Лимит сигарет на сегодня: 14');
  assert.match(cig1.hint, /−2/);

  const week8 = buildDayModel(plan, addDays(start, 49), {}, addDays(start, 49));
  assert.equal(week8.week, 8);
  assert.equal(
    week8.rules.find((rule) => rule.id === 'cigarettes').text,
    'Лимит сигарет на сегодня: 0',
  );
});

test('streak counts perfect days and pauses on an open today', () => {
  assert.equal(currentStreak(plan, {}, '2026-10-20'), 0);
  const day1 = start;
  const day2 = addDays(start, 1);
  const day3 = addDays(start, 2);
  let store = { [day1]: allChecks(), [day2]: allChecks() };
  assert.equal(currentStreak(plan, store, day3), 2);
  store = { ...store, [day3]: allChecks() };
  assert.equal(currentStreak(plan, store, day3), 3);
  store = { [day1]: allChecks(), [day3]: allChecks() };
  assert.equal(currentStreak(plan, store, day3), 1);
  store = { [day1]: allChecks(), [day2]: { wake: true } };
  assert.equal(currentStreak(plan, store, day3), 0);

  const last = lastPlanDate(plan);
  assert.equal(currentStreak(plan, { [last]: allChecks() }, addDays(last, 3)), 1);
  const totals = summary(plan, { [day1]: allChecks(), [day2]: { wake: true } });
  assert.deepEqual(totals, { closed: 1, touched: 2, total: 84 });
});

test('checks toggle without mutating the previous store', () => {
  const original = {};
  const once = toggleCheck(original, start, 'wake');
  const twice = toggleCheck(once, start, 'no-phone');
  const cleared = toggleCheck(once, start, 'wake');
  assert.deepEqual(original, {});
  assert.deepEqual(once, { [start]: { wake: true } });
  assert.deepEqual(twice[start], { wake: true, 'no-phone': true });
  assert.deepEqual(cleared, {});
});

test('brain tasks are three stable prompts from the pool', () => {
  const pool = plan.brainTasks.pool.slice();
  const first = pickBrainTasks(plan, start);
  assert.equal(first.length, 3);
  assert.equal(new Set(first).size, 3);
  assert.deepEqual(pickBrainTasks(plan, start), first);
  for (const task of first) assert.ok(pool.includes(task));
  assert.deepEqual(plan.brainTasks.pool, pool);
});

test('plural days and a broken plan', () => {
  assert.deepEqual(
    [0, 1, 2, 4, 5, 11, 21, 22].map(pluralDays),
    ['дней', 'день', 'дня', 'дня', 'дней', 'дней', 'день', 'дня'],
  );
  assert.throws(() => assertPlan({}), PlanError);
  assert.equal(buildDayModel(plan, '2026-13-40', {}, start).phase, 'invalid');
});

test('the site stays relative and plan.json is network-first', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const app = readFileSync(join(root, 'app.js'), 'utf8');
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  const workflow = readFileSync(join(root, '.github/workflows/pages.yml'), 'utf8');

  assert.match(html, /lang="ru"/);
  assert.match(html, /href="manifest\.json"/);
  assert.match(html, /src="app\.js"/);
  assert.doesNotMatch(html, /(?:href|src)="\//);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.match(app, /serviceWorker\.register\(\s*['"]\.\/sw\.js['"]\s*\)/);
  assert.match(app, /fetch\(\s*['"]plan\.json['"]/);
  assert.doesNotMatch(app, /fetch\(\s*['"]\//);
  assert.match(sw, /networkFirstPlan/);
  assert.match(sw, /plan\.json/);
  assert.match(sw, /cache:\s*'no-store'/);
  assert.match(sw, /X-Plan-Source/);
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  for (const icon of manifest.icons) {
    assert.equal(icon.src.startsWith('/'), false);
    assert.equal(icon.src.startsWith('http'), false);
  }
  assert.match(workflow, /actions\/deploy-pages@v5/);
  assert.match(workflow, /actions\/upload-pages-artifact@v5/);
  assert.match(workflow, /actions\/configure-pages@v6/);
});
