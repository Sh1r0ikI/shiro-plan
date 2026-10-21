const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export class PlanError extends Error {}

export function parseISODate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function localISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(iso, amount) {
  const date = parseISODate(iso);
  if (!date) throw new PlanError('Некорректная дата.');
  date.setDate(date.getDate() + amount);
  return localISODate(date);
}

export function daysBetween(fromIso, toIso) {
  const from = parseISODate(fromIso);
  const to = parseISODate(toIso);
  if (!from || !to) throw new PlanError('Некорректная дата.');
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

export function plural(n, one, few, many) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

export function pluralDays(n) {
  return plural(n, 'день', 'дня', 'дней');
}

export function weekdayKey(iso) {
  return WEEKDAY_KEYS[parseISODate(iso).getDay()];
}

export function weekdayShort(iso) {
  return WEEKDAYS_SHORT[parseISODate(iso).getDay()];
}

export function formatDayTitle(iso) {
  const date = parseISODate(iso);
  const name = WEEKDAYS[date.getDay()];
  const titled = name.charAt(0).toUpperCase() + name.slice(1);
  return `${titled}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

export function formatDayMonth(iso) {
  const date = parseISODate(iso);
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

export function formatSpan(fromIso, toIso) {
  const from = parseISODate(fromIso);
  const to = parseISODate(toIso);
  const fromMonth = MONTHS_SHORT[from.getMonth()];
  const toMonth = MONTHS_SHORT[to.getMonth()];
  if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
    return `${from.getDate()}–${to.getDate()} ${fromMonth}`;
  }
  return `${from.getDate()} ${fromMonth} – ${to.getDate()} ${toMonth}`;
}

export function locate(plan, iso) {
  if (!parseISODate(iso)) return { phase: 'invalid', diff: null, week: null, index: null };
  const diff = daysBetween(plan.startDate, iso);
  const total = plan.weeks * 7;
  if (diff < 0) return { phase: 'before', diff, week: null, index: null };
  if (diff >= total) return { phase: 'after', diff, week: null, index: null };
  return { phase: 'active', diff, week: Math.floor(diff / 7) + 1, index: diff };
}

export function planDates(plan) {
  const dates = [];
  const total = plan.weeks * 7;
  for (let i = 0; i < total; i += 1) dates.push(addDays(plan.startDate, i));
  return dates;
}

export function lastPlanDate(plan) {
  return addDays(plan.startDate, plan.weeks * 7 - 1);
}

export function daysUntilStart(plan, todayIso) {
  return daysBetween(todayIso, plan.startDate);
}

export function cigaretteLimit(plan, week) {
  const config = plan.cigarettes;
  if (week >= config.quitByWeek) return 0;
  return Math.max(0, config.startPerDay - (week - 1) * config.reductionPerWeek);
}

export function dayScore(plan, checks) {
  const done = checks || {};
  let got = 0;
  let max = 0;
  for (const rule of plan.rules) {
    const points = rule.points || 0;
    max += points;
    if (done[rule.id]) got += points;
  }
  return { got, max };
}

export function isComplete(plan, checks) {
  const score = dayScore(plan, checks);
  return score.max > 0 && score.got === score.max;
}

export function toggleCheck(store, iso, id) {
  const next = { ...store };
  const checks = { ...(next[iso] || {}) };
  if (checks[id]) delete checks[id];
  else checks[id] = true;
  if (Object.keys(checks).length === 0) delete next[iso];
  else next[iso] = checks;
  return next;
}

export function currentStreak(plan, store, todayIso) {
  const where = locate(plan, todayIso);
  if (where.phase === 'before' || where.phase === 'invalid') return 0;
  let cursor = where.phase === 'after' ? lastPlanDate(plan) : todayIso;
  if (!isComplete(plan, store[cursor])) {
    cursor = addDays(cursor, -1);
  }
  let streak = 0;
  while (locate(plan, cursor).phase === 'active' && isComplete(plan, store[cursor])) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function summary(plan, store) {
  const dates = planDates(plan);
  let closed = 0;
  let touched = 0;
  for (const iso of dates) {
    const score = dayScore(plan, store[iso]);
    if (score.got > 0) touched += 1;
    if (score.max > 0 && score.got === score.max) closed += 1;
  }
  return { closed, touched, total: dates.length };
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function pickBrainTasks(plan, iso) {
  const pool = plan.brainTasks?.pool || [];
  const count = Math.min(plan.brainTasks?.count || 3, pool.length);
  const items = pool.slice();
  let seed = hashString(iso);
  for (let i = items.length - 1; i > 0; i -= 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const swap = seed % (i + 1);
    const current = items[i];
    items[i] = items[swap];
    items[swap] = current;
  }
  return items.slice(0, count);
}

function ruleByDetail(plan, detail) {
  return plan.rules.find((rule) => rule.detail === detail) || null;
}

export function missedWorkoutsBefore(plan, store, iso, todayIso) {
  const workout = ruleByDetail(plan, 'workout');
  if (!workout) return 0;
  let missed = 0;
  let cursor = addDays(iso, -1);
  while (locate(plan, cursor).phase === 'active' && cursor < todayIso) {
    if (store[cursor]?.[workout.id]) break;
    missed += 1;
    cursor = addDays(cursor, -1);
  }
  return missed;
}

function formatItem(item, week, step, multiplier, doubleKeys) {
  const vars = {};
  for (const [key, value] of Object.entries(item)) {
    if (typeof value === 'number') vars[key] = value;
  }
  if (typeof item.reps === 'number') {
    vars.reps = item.reps + (item.progressPerWeek ? (week - 1) * step : 0);
  }
  for (const key of doubleKeys) {
    if (typeof vars[key] === 'number') vars[key] *= multiplier;
  }
  const detail = String(item.detail).replace(/\{(\w+)\}/g, (_, key) => (
    vars[key] == null ? '' : String(vars[key])
  ));
  return `${item.name} — ${detail}`;
}

function sessionBlock(plan, iso, week) {
  const workouts = plan.workouts;
  const day = weekdayKey(iso);
  if (workouts.strength.weekdays.includes(day)) {
    return { title: workouts.strength.title, items: workouts.strength.items };
  }
  if (workouts.mobility.weekdays.includes(day)) {
    return { title: workouts.mobility.title, items: workouts.mobility.items };
  }
  if (workouts.endurance.weekdays.includes(day)) {
    const phase = workouts.endurance.phases.find((item) => week >= item.fromWeek && week <= item.toWeek);
    return { title: workouts.endurance.title, items: phase ? phase.items : [] };
  }
  return { title: 'Тренировка', items: [] };
}

function buildWorkout(plan, iso, week, doubled, missed) {
  const step = plan.repProgressPerWeek ?? 0;
  const multiplier = doubled ? 2 : 1;
  const doubleKeys = new Set(plan.workouts.doubleKeys || []);
  const block = sessionBlock(plan, iso, week);
  const lines = block.items.map((item) => formatItem(item, week, step, multiplier, doubleKeys));
  const daily = plan.workouts.daily;
  const dailyLines = (daily.items || []).map((item) => formatItem(item, week, step, multiplier, doubleKeys));
  const hasProgress = block.items.some((item) => item.progressPerWeek);
  const progressText = hasProgress
    ? String(plan.repProgressText || '').replaceAll('{step}', String(step))
    : '';
  const skip = plan.skipRule || {};
  return {
    type: 'workout',
    title: block.title,
    lines,
    dailyTitle: daily.title || '',
    dailyLines,
    progressText,
    doubled,
    ruleText: skip.text || '',
    doubleText: doubled ? (skip.doubleText || '') : '',
    blockedText: missed >= 2 ? (skip.blockedText || '') : '',
  };
}

function cigaretteHint(plan, limit) {
  const config = plan.cigarettes;
  if (limit === 0) return `Ноль. С ${config.quitByWeek}-й недели лимит не поднимается.`;
  return `Каждую неделю −${config.reductionPerWeek} в день. С ${config.quitByWeek}-й недели — 0.`;
}

export function buildDayModel(plan, iso, store, todayIso) {
  const where = locate(plan, iso);
  if (where.phase !== 'active') {
    return { iso, phase: where.phase, editable: false };
  }
  const checks = store[iso] || {};
  const score = dayScore(plan, checks);
  const missed = missedWorkoutsBefore(plan, store, iso, todayIso);
  const doubled = missed >= 1;
  const workout = buildWorkout(plan, iso, where.week, doubled, missed);
  const limit = cigaretteLimit(plan, where.week);
  const tasks = pickBrainTasks(plan, iso);
  const rules = plan.rules.map((rule) => {
    let text = rule.text;
    let hint = '';
    let extra = null;
    if (rule.detail === 'cigarettes') {
      text = `${rule.text}: ${limit}`;
      hint = cigaretteHint(plan, limit);
    } else if (rule.detail === 'workout') {
      extra = workout;
    } else if (rule.detail === 'brain') {
      extra = { type: 'brain', tasks };
    }
    return {
      id: rule.id,
      text,
      hint,
      points: rule.points,
      checked: !!checks[rule.id],
      extra,
    };
  });
  return {
    iso,
    phase: 'active',
    week: where.week,
    weeks: plan.weeks,
    title: formatDayTitle(iso),
    weekLabel: `Неделя ${where.week} из ${plan.weeks}`,
    note: (plan.weeklyNotes || []).find((note) => note.week === where.week)?.text || '',
    goals: plan.goals || [],
    routine: plan.routine || [],
    rules,
    score,
    complete: score.max > 0 && score.got === score.max,
    editable: iso <= todayIso,
    isToday: iso === todayIso,
    isFuture: iso > todayIso,
    skip: {
      missed,
      doubled,
      text: plan.skipRule?.text || '',
      doubleText: workout.doubleText,
      blockedText: workout.blockedText,
    },
  };
}

function assertItems(items, label) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new PlanError(`${label}: нет упражнений.`);
  }
  for (const item of items) {
    if (!item || typeof item.name !== 'string' || typeof item.detail !== 'string') {
      throw new PlanError(`${label}: у упражнения нужны name и detail.`);
    }
  }
}

export function assertPlan(plan) {
  if (!plan || typeof plan !== 'object') throw new PlanError('plan.json повреждён.');
  if (!parseISODate(plan.startDate)) throw new PlanError('В plan.json нет корректной даты старта (startDate).');
  if (!Number.isInteger(plan.weeks) || plan.weeks < 1) throw new PlanError('В plan.json не задано число недель (weeks).');
  if (!Array.isArray(plan.rules) || plan.rules.length === 0) throw new PlanError('В plan.json нет правил (rules).');
  const ids = new Set();
  for (const rule of plan.rules) {
    if (!rule || typeof rule.id !== 'string' || !rule.id) throw new PlanError('У правила нет id.');
    if (ids.has(rule.id)) throw new PlanError(`Повтор id: ${rule.id}.`);
    ids.add(rule.id);
    if (typeof rule.text !== 'string' || !rule.text.trim()) throw new PlanError('У правила пустой текст.');
    if (typeof rule.points !== 'number' || rule.points < 0) throw new PlanError('У правила нет баллов (points).');
  }
  const workouts = plan.workouts;
  if (!workouts?.strength || !workouts.endurance || !workouts.mobility || !workouts.daily) {
    throw new PlanError('В plan.json не хватает тренировок: strength, endurance, mobility, daily.');
  }
  assertItems(workouts.strength.items, 'Силовая');
  assertItems(workouts.mobility.items, 'Мобильность');
  assertItems(workouts.daily.items, 'Каждый день');
  if (!Array.isArray(workouts.endurance.phases) || workouts.endurance.phases.length === 0) {
    throw new PlanError('У выносливости нет фаз (phases).');
  }
  for (const phase of workouts.endurance.phases) {
    assertItems(phase.items, 'Выносливость');
  }
  const cigarettes = plan.cigarettes;
  if (
    !cigarettes
    || typeof cigarettes.startPerDay !== 'number'
    || typeof cigarettes.reductionPerWeek !== 'number'
    || typeof cigarettes.quitByWeek !== 'number'
  ) {
    throw new PlanError('В cigarettes нужны startPerDay, reductionPerWeek и quitByWeek.');
  }
  const brain = plan.brainTasks;
  if (!brain || !Array.isArray(brain.pool) || brain.pool.length < (brain.count || 1)) {
    throw new PlanError('В plan.json не хватает задач на логику (brainTasks).');
  }
  if (plan.routine) {
    if (!Array.isArray(plan.routine)) throw new PlanError('routine должен быть списком.');
    for (const item of plan.routine) {
      if (typeof item?.time !== 'string' || typeof item?.text !== 'string') {
        throw new PlanError('В routine нужны time и text.');
      }
    }
  }
  if (plan.weeklyNotes) {
    if (!Array.isArray(plan.weeklyNotes)) throw new PlanError('weeklyNotes должен быть списком.');
    for (const note of plan.weeklyNotes) {
      if (!Number.isInteger(note?.week) || typeof note?.text !== 'string') {
        throw new PlanError('В weeklyNotes нужны week и text.');
      }
    }
  }
  if (plan.goals && (!Array.isArray(plan.goals) || plan.goals.some((goal) => typeof goal !== 'string'))) {
    throw new PlanError('goals должен быть списком строк.');
  }
}
