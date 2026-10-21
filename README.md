# 12 недель

`plan.json` — единственный источник плана. Правила, распорядок, тренировки, заметки недель и задачи на логику меняются там. Код только рисует день и считает баллы.

Отметки, счёт и серия в репозиторий не попадают: они лежат в `localStorage` браузера.

# 12 weeks

Personal 12-week checklist. Russian UI, dark theme, installable as a PWA.

All plan content lives in [`plan.json`](plan.json). Edit that file to change daily rules, the routine, workouts, weekly notes, or brain tasks. The page rebuilds the day from it. Check-offs, the daily score, the streak, and history stay in `localStorage` on the device. Nothing personal is written back to the repo.

## How a day is chosen

- The plan starts on `startDate` (`2026-10-21`) and runs for `weeks` × 7 days.
- Week 1 is the first seven days, week 2 the next seven, and so on.
- Monday / Wednesday / Friday read `workouts.strength`. Tuesday / Thursday / Saturday read the `workouts.endurance` phase whose `fromWeek` / `toWeek` contains the current week. Sunday reads `workouts.mobility`. The daily hang is added every day.
- Exercises with `progressPerWeek` add `repProgressPerWeek` to the base reps for each week after the first (the rule in the file is +1–2; the starter step is 1).
- `sets`, `rounds`, `minutes`, `min`, and `max` double when yesterday’s workout rule was left unchecked. Two missed workouts in a row keep the double volume and show the “нельзя” warning. A day that has not ended yet is not a miss.
- The cigarette row shows `startPerDay − (week − 1) × reductionPerWeek`, and `0` from `quitByWeek` onward. The starter value `14` is only there so the step of −2 lands on zero at week 8. Change `startPerDay` if you want a different baseline.
- Each rule with `"points": 1` is one point. The starter file has 11 rules, so the score reads `x/11`.
- The streak is the run of days, through today only if today is complete, where every rule is checked.
- Keep each rule `id` stable if you want existing check-offs on a phone to stay attached.

## Pages

The site is meant to be served at [https://sh1r0iki.github.io/shiro-plan/](https://sh1r0iki.github.io/shiro-plan/). Paths are relative, so the same files also work in a subfolder.

GitHub Actions (`.github/workflows/pages.yml`) tests the plan logic and deploys the static files with `actions/deploy-pages`. There is no build step.

After the workflow is on `main`, turn on Pages once:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. If Actions are off: **Settings → Actions → General → Allow all actions**.

The first deploy after that publishes the URL above. `plan.json` is fetched network-first, so a later edit shows up on refresh when the phone is online and still opens from cache when it is not.

## Locally

From the repo root:

```bash
python3 -m http.server 8080
node --test tests/logic.test.mjs
```

Open `http://127.0.0.1:8080/`. `file://` will not load `plan.json` or the service worker.
