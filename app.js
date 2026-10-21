import {
  PlanError,
  assertPlan,
  buildDayModel,
  currentStreak,
  dayScore,
  daysUntilStart,
  formatDayMonth,
  formatDayTitle,
  formatSpan,
  lastPlanDate,
  localISODate,
  locate,
  planDates,
  pluralDays,
  summary,
  toggleCheck,
  weekdayShort,
} from './logic.js';

const STORAGE_KEY = 'shiro-plan-v1';
const app = document.querySelector('#app');
const live = document.querySelector('#live');

let plan = null;
let days = loadDays();
let planFromCache = false;
let storageOk = true;
let installPrompt = null;
let loadToken = 0;

function loadDays() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    if (!data || typeof data.days !== 'object' || data.days == null) return {};
    const next = {};
    for (const [iso, checks] of Object.entries(data.days)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !checks || typeof checks !== 'object') continue;
      const clean = {};
      for (const [id, value] of Object.entries(checks)) {
        if (value === true) clean[id] = true;
      }
      if (Object.keys(clean).length) next[iso] = clean;
    }
    return next;
  } catch {
    return {};
  }
}

function saveDays(next) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ days: next }));
    storageOk = true;
  } catch {
    storageOk = false;
  }
}

function todayIso() {
  return localISODate(new Date());
}

function h(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  if (tag === 'button') node.type = 'button';
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'type') node.type = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'disabled') node.disabled = true;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  appendAll(node, Array.isArray(children) ? children : [children]);
  return node;
}

function appendAll(node, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) appendAll(node, child);
    else node.append(child);
  }
}

function mount(nodes) {
  app.replaceChildren(...nodes.filter(Boolean));
}

function frame(active, nodes) {
  mount([
    tabs(active),
    h('div', { class: 'content' }, nodes),
  ]);
}

function tabs(active) {
  return h('nav', { class: 'tabs', 'aria-label': 'Разделы' }, [
    h('button', {
      text: 'Сегодня',
      'data-nav': '#/',
      'aria-current': active === 'today' ? 'page' : null,
    }),
    h('button', {
      text: 'История',
      'data-nav': '#/history',
      'aria-current': active === 'history' ? 'page' : null,
    }),
  ]);
}

function titleBlock(eyebrow, title, sub) {
  return h('header', { class: 'mast' }, [
    h('p', { class: 'eyebrow', text: eyebrow || '12 недель' }),
    h('h1', { text: title }),
    sub ? h('p', { class: 'weekline', text: sub }) : null,
  ]);
}

function banner(text, kind) {
  return h('p', { class: kind ? `banner ${kind}` : 'banner', text });
}

function backRow() {
  return h('div', { class: 'backrow' }, [
    h('button', { text: 'Все дни', 'data-nav': '#/history' }),
    h('button', { text: 'К сегодня', 'data-nav': '#/' }),
  ]);
}

function scoreStat(score, complete) {
  const pct = score.max ? Math.round((score.got / score.max) * 100) : 0;
  const fill = h('span');
  fill.style.width = `${pct}%`;
  return h('div', { class: complete ? 'stat score complete' : 'stat score' }, [
    h('b', {}, [
      h('span', { class: 'num', text: String(score.got) }),
      h('span', { class: 'sr', text: ` из ${score.max}` }),
      h('span', { class: 'of', 'aria-hidden': 'true', text: `/${score.max}` }),
    ]),
    h('span', { class: 'label', text: 'баллы' }),
    h('div', { class: 'meter', 'aria-hidden': 'true' }, [fill]),
  ]);
}

function streakStat(streak) {
  return h('div', { class: 'stat' }, [
    h('b', { text: String(streak) }),
    h('span', { class: 'label', text: `${pluralDays(streak)} подряд` }),
    h('span', { class: 'fine', text: 'все пункты закрыты' }),
  ]);
}

function emptyScoreStat(label) {
  return h('div', { class: 'stat score' }, [
    h('b', { text: '—' }),
    h('span', { class: 'label', text: label }),
  ]);
}

function closedStat(closed, total) {
  return h('div', { class: 'stat score' }, [
    h('b', {}, [
      h('span', { class: 'num', text: String(closed) }),
      h('span', { class: 'sr', text: ` из ${total}` }),
      h('span', { class: 'of', 'aria-hidden': 'true', text: `/${total}` }),
    ]),
    h('span', { class: 'label', text: 'дней закрыто' }),
  ]);
}

function goalsBlock(goals) {
  if (!goals?.length) return null;
  return h('section', {}, [
    h('h2', { text: 'Цели к концу плана' }),
    h('ul', { class: 'chips' }, goals.map((goal) => h('li', { text: goal }))),
  ]);
}

function noteBlock(text) {
  if (!text) return null;
  return h('section', {}, [
    h('h2', { text: 'Эта неделя' }),
    h('p', { class: 'note', text }),
  ]);
}

function workoutCard(extra) {
  return h('div', { class: extra.doubled ? 'card doubled' : 'card' }, [
    h('p', { class: 'kicker', text: extra.title }),
    extra.doubled ? h('p', { class: 'tag', text: 'Двойная норма' }) : null,
    h('ul', { class: 'lines' }, extra.lines.map((line) => h('li', { text: line }))),
    extra.progressText ? h('p', { class: 'hint', text: extra.progressText }) : null,
    extra.dailyLines.length ? h('p', { class: 'kicker second', text: extra.dailyTitle }) : null,
    extra.dailyLines.length
      ? h('ul', { class: 'lines' }, extra.dailyLines.map((line) => h('li', { text: line })))
      : null,
    extra.ruleText ? h('p', { class: 'hint', text: extra.ruleText }) : null,
  ]);
}

function brainCard(tasks) {
  return h('div', { class: 'card' }, [
    h('p', { class: 'kicker', text: 'Три задачи на сегодня' }),
    h('ol', { class: 'tasks' }, tasks.map((task) => h('li', { text: task }))),
  ]);
}

function ruleView(rule, model) {
  const copy = [
    h('span', { class: 'check-title', text: rule.text }),
  ];
  if (rule.hint) copy.push(h('span', { class: 'check-hint', text: rule.hint }));
  const button = h('button', {
    class: 'check',
    'data-check': rule.id,
    'data-date': model.iso,
    'aria-pressed': rule.checked ? 'true' : 'false',
    disabled: !model.editable,
  }, [
    h('span', { class: 'box', 'aria-hidden': 'true' }),
    h('span', { class: 'check-copy' }, copy),
  ]);
  let extra = null;
  if (rule.extra?.type === 'workout') extra = workoutCard(rule.extra);
  if (rule.extra?.type === 'brain') extra = brainCard(rule.extra.tasks);
  return h('div', { class: 'rule' }, [button, extra]);
}

function rulesBlock(model) {
  const allOne = model.rules.every((rule) => rule.points === 1);
  return h('section', {}, [
    h('h2', { text: 'Пункты дня' }),
    allOne ? h('p', { class: 'section-note', text: 'Каждый пункт — 1 балл.' }) : null,
    h('div', { class: 'rules' }, model.rules.map((rule) => ruleView(rule, model))),
  ]);
}

function routineBlock(items) {
  if (!items?.length) return null;
  return h('details', { class: 'fold', open: true }, [
    h('summary', { text: 'Распорядок' }),
    h('ol', { class: 'routine' }, items.map((item) => h('li', {}, [
      h('span', { class: 'when', text: item.time }),
      h('span', { text: item.text }),
    ]))),
  ]);
}

function footnote() {
  return h('p', { class: 'foot', text: 'Отметки, баллы и серия хранятся только в этом браузере.' });
}

function installBlock() {
  const parts = [];
  if (installPrompt) {
    parts.push(h('button', {
      class: 'primary',
      text: 'Установить',
      onClick: async () => {
        installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt = null;
        render({ keepScroll: true });
      },
    }));
  }
  parts.push(h('details', { class: 'install' }, [
    h('summary', { text: 'На экран «Домой»' }),
    h('p', {
      text: 'iPhone: «Поделиться» → «На экран Домой». Android: меню браузера → «Установить приложение» или «Добавить на главный экран». После этого день открывается и без сети.',
    }),
  ]));
  return h('section', {}, parts);
}

function statusBanners(model) {
  const items = [];
  if (planFromCache) items.push(banner('Показан сохранённый план: сеть не ответила.'));
  if (!storageOk) items.push(banner('Браузер не сохранил отметки на устройстве.', 'warn'));
  if (model?.isFuture) items.push(banner('Этот день ещё впереди. Отметки откроются, когда он наступит.'));
  if (model?.skip?.blockedText) items.push(banner(model.skip.blockedText, 'warn'));
  else if (model?.skip?.doubleText) items.push(banner(model.skip.doubleText, 'warn'));
  return items;
}

function paintActive(model, mode) {
  const today = todayIso();
  const showStreak = mode === 'today' || model.isToday;
  const statCards = [
    model.isFuture ? emptyScoreStat('баллы ещё впереди') : scoreStat(model.score, model.complete),
  ];
  if (showStreak) statCards.push(streakStat(currentStreak(plan, days, today)));
  frame(showStreak ? 'today' : 'day', [
    mode === 'day' && !model.isToday ? backRow() : null,
    titleBlock(plan.title, model.title, model.weekLabel),
    h('div', { class: statCards.length === 1 ? 'stats single' : 'stats' }, statCards),
    statusBanners(model),
    goalsBlock(model.goals),
    noteBlock(model.note),
    rulesBlock(model),
    routineBlock(model.routine),
    showStreak ? installBlock() : null,
    footnote(),
  ]);
  document.title = `${model.title} · ${plan.title || '12 недель'}`;
}

function paintBefore(today) {
  const left = daysUntilStart(plan, today);
  const headline = left === 1 ? 'Старт завтра' : `До старта ${left} ${pluralDays(left)}`;
  const preview = buildDayModel(plan, plan.startDate, days, today);
  frame('today', [
    titleBlock(plan.title, headline, `${preview.title} · ${preview.weekLabel}`),
    h('div', { class: 'stats' }, [
      emptyScoreStat('баллы со старта'),
      streakStat(0),
    ]),
    banner('Отметки откроются в день старта. Ниже первый день — пока только посмотреть.'),
    goalsBlock(preview.goals),
    noteBlock(preview.note),
    rulesBlock(preview),
    routineBlock(preview.routine),
    installBlock(),
    footnote(),
  ]);
  document.title = `${headline} · ${plan.title || '12 недель'}`;
}

function paintAfter() {
  const last = lastPlanDate(plan);
  const totals = summary(plan, days);
  const streak = currentStreak(plan, days, todayIso());
  frame('today', [
    titleBlock(plan.title, 'План завершён', `Последний день — ${formatDayTitle(last)}`),
    h('div', { class: 'stats' }, [
      closedStat(totals.closed, totals.total),
      streakStat(streak),
    ]),
    banner('Новые дни не добавляются. Отметки на месте, их видно в истории.'),
    goalsBlock(plan.goals || []),
    footnote(),
  ]);
  document.title = `План завершён · ${plan.title || '12 недель'}`;
}

function dayRow(iso, today) {
  const score = dayScore(plan, days[iso]);
  const future = iso > today;
  const isToday = iso === today;
  const done = !future && score.max > 0 && score.got === score.max;
  const pct = !future && score.max ? Math.round((score.got / score.max) * 100) : 0;
  const fill = h('span');
  fill.style.width = `${pct}%`;
  const points = future ? '—' : `${score.got}/${score.max}`;
  const cls = ['dayrow', future ? 'future' : '', isToday ? 'today' : '', done ? 'done' : '']
    .filter(Boolean)
    .join(' ');
  const label = future
    ? `${formatDayTitle(iso)}, ещё впереди`
    : `${formatDayTitle(iso)}, ${score.got} из ${score.max}`;
  return h('button', {
    class: cls,
    'data-open': iso,
    'aria-label': label,
    'aria-current': isToday ? 'date' : null,
  }, [
    h('span', { class: 'wd', 'aria-hidden': 'true', text: weekdayShort(iso) }),
    h('span', { class: 'mid', 'aria-hidden': 'true' }, [
      h('span', { class: 'dm', text: formatDayMonth(iso) }),
      h('span', { class: 'bar' }, [fill]),
    ]),
    h('span', { class: 'pts', 'aria-hidden': 'true', text: points }),
  ]);
}

function paintHistory() {
  const today = todayIso();
  const totals = summary(plan, days);
  const dates = planDates(plan);
  const weeks = [];
  for (let index = 0; index < plan.weeks; index += 1) {
    const slice = dates.slice(index * 7, index * 7 + 7);
    weeks.push(h('section', { class: 'week' }, [
      h('h2', {
        class: 'weekhead',
        text: `Неделя ${index + 1} · ${formatSpan(slice[0], slice[slice.length - 1])}`,
      }),
      h('div', { class: 'weekdays' }, slice.map((iso) => dayRow(iso, today))),
    ]));
  }
  frame('history', [
    titleBlock(plan.title, 'История', `${totals.touched} ${pluralDays(totals.touched)} с отметками`),
    h('div', { class: 'stats' }, [
      closedStat(totals.closed, totals.total),
      streakStat(currentStreak(plan, days, today)),
    ]),
    weeks,
    footnote(),
  ]);
  document.title = `История · ${plan.title || '12 недель'}`;
}

function paintMissingDay() {
  frame('day', [
    backRow(),
    titleBlock(plan.title, 'Такой даты нет', 'В плане 12 недель от даты старта.'),
  ]);
  document.title = plan.title || '12 недель';
}

function paintToday() {
  const today = todayIso();
  const where = locate(plan, today);
  if (where.phase === 'before') {
    paintBefore(today);
    return;
  }
  if (where.phase === 'after') {
    paintAfter();
    return;
  }
  paintActive(buildDayModel(plan, today, days, today), 'today');
}

function parseRoute() {
  const hash = location.hash || '#/';
  if (hash === '#/' || hash === '#' || hash === '#/today') return { name: 'today' };
  if (hash === '#/history') return { name: 'history' };
  const match = /^#\/day\/(\d{4}-\d{2}-\d{2})$/.exec(hash);
  if (match) return { name: 'day', iso: match[1] };
  return { name: 'today' };
}

function render(options = {}) {
  if (!plan) return;
  const keepScroll = !!options.keepScroll;
  const y = keepScroll ? window.scrollY : 0;
  const focusId = keepScroll && document.activeElement
    ? document.activeElement.getAttribute?.('data-check')
    : null;
  const route = parseRoute();
  if (route.name === 'history') paintHistory();
  else if (route.name === 'day') {
    const model = buildDayModel(plan, route.iso, days, todayIso());
    if (model.phase === 'active') paintActive(model, 'day');
    else paintMissingDay();
  } else paintToday();
  if (keepScroll) {
    window.scrollTo(0, y);
    if (focusId) {
      const again = app.querySelector(`[data-check="${CSS.escape(focusId)}"]`);
      if (again) again.focus();
    }
  } else {
    window.scrollTo(0, 0);
  }
  if (options.announce && live) live.textContent = options.announce;
}

function go(hash) {
  if ((location.hash || '#/') === hash) render();
  else location.hash = hash;
}

function paintLoading() {
  mount([h('p', { class: 'boot', text: 'Загрузка плана…' })]);
}

function paintError(error) {
  const text = error instanceof PlanError
    ? error.message
    : 'Не удалось прочитать plan.json. Проверь сеть и обнови страницу.';
  mount([
    h('div', { class: 'content' }, [
      h('h1', { text: 'План не загрузился' }),
      h('p', { class: 'lead', text }),
      h('button', { class: 'primary', text: 'Повторить', onClick: () => init() }),
    ]),
  ]);
  document.title = 'План не загрузился';
}

async function init() {
  const token = ++loadToken;
  paintLoading();
  try {
    const response = await fetch('plan.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const body = await response.json();
    assertPlan(body);
    if (token !== loadToken) return;
    plan = body;
    planFromCache = response.headers.get('X-Plan-Source') === 'cache' || navigator.onLine === false;
    render();
  } catch (error) {
    if (token !== loadToken) return;
    plan = null;
    paintError(error);
  }
}

app.addEventListener('click', (event) => {
  const nav = event.target.closest('[data-nav]');
  if (nav) {
    go(nav.getAttribute('data-nav'));
    return;
  }
  const opener = event.target.closest('[data-open]');
  if (opener) {
    const iso = opener.getAttribute('data-open');
    go(iso === todayIso() ? '#/' : `#/day/${iso}`);
    return;
  }
  const button = event.target.closest('[data-check]');
  if (!button || button.disabled || !plan) return;
  const iso = button.getAttribute('data-date');
  const id = button.getAttribute('data-check');
  const model = buildDayModel(plan, iso, days, todayIso());
  if (!model.editable) return;
  const wasOn = button.getAttribute('aria-pressed') === 'true';
  days = toggleCheck(days, iso, id);
  saveDays(days);
  const score = dayScore(plan, days[iso]);
  const label = button.querySelector('.check-title')?.textContent || '';
  render({
    keepScroll: true,
    announce: `${wasOn ? 'Снято' : 'Отмечено'}: ${label}. ${score.got} из ${score.max}.`,
  });
});

window.addEventListener('hashchange', () => render());

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  if (plan) render({ keepScroll: true });
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

init();
