# Solution video — script (deliverable 03, ≤ 5:00)

English narration, screen + live voice, 7 segments, ~715 words ≈ 4:40.
Short sentences on purpose: easy to read out loud, no clause you can trip on.

Brief's required beats, all present: problem → simple baseline → one full run → final comparison →
changelog → biggest contribution → one removed experiment.

## The numbers (same model `openai/gpt-5.6-sol`, same budgets, 2026-08-31)

| | Baseline `baseline-…T14-45-38-777Z` | AAE `aae-…T14-51-18-382Z` |
| --- | ---: | ---: |
| **VARS (frozen weights)** | **49.85** | **71.21** |
| VARS (rejected_balanced) | 59.70 | 78.18 |
| VARS (rejected_flat) | 59.14 | 79.00 |
| operations F1 | 0.94 | 1.00 |
| parameters F1 | 0.91 | 0.93 |
| semantic_facts F1 | 0.14 (recall 0.08) | 0.43 (recall 0.30) |
| dependencies F1 | 0.53 | 0.68 |
| workflows F1 | 0.43 | 0.91 |
| evidence support / coverage | 1.00 / 1.00 | 1.00 / 1.00 |
| tool actions · time · cost | 127 · 5m26s · $0.92 | 264 · 18m12s · $3.32 |

---

## 1. Problem (0:00–0:25)

**Экран:** MiniCRM в браузере, DevTools → Network. Клик «change order status». В кадре
`PATCH /api/orders/12/status` `{"statusId": 40, "version": 3}`.

> "An internal CRM with no API documentation. An engineer has to integrate with it this week.
> Here is the request the app just sent. You see the shape. You do not see the meaning.
> What is status forty? Why is `version` there?
> Traffic cannot answer that. A model given a traffic dump will make something up.
> A wrong spec is worse than a missing one."

---

## 2. What we built (0:25–1:10)

**Экран:** дерево репозитория одной командой, затем `docs/README.md` — карта из 13 файлов.

```bash
ls -d miniCRM harness agents/baseline agents/aae evaluator runner results docs
# или: tree -L 1 -d
```

> "The whole project. Six parts.
> MiniCRM is the target. An app we wrote, with twenty-six operations reachable through the browser.
> The benchmark sits next to it. Its ground truth is generated from the app's source, so it cannot
> drift.
> The harness is the only way an agent touches the browser. Seven tools, one risk gate, everything
> recorded.
> Then two agents. A baseline, and our system.
> Every decision is written down. Thirteen numbered documents, each with its reason.
> The fastest way into this project: point a model at the `docs` folder and ask it what we built and
> why. It is all there."

**Титр:** `miniCRM · benchmark · harness · agents · evaluator · docs`

---

## 3. How we measure, and the baseline (1:10–2:05)

**Экран:** `evaluator/config/weights.json` (`"active": "frozen"`) → `cd evaluator && npm test`
(20 зелёных) → `evaluation.json` и `diff.json`; на последних фразах — `agents/baseline/system-prompt.md`
и `config/run.default.json` (`budgets`, `isolationDeny`).

> "One number, VARS. Five categories, scored and added up with weights.
> The weights are a config file. We froze them before the first run and never touched them again.
> Thirty-five percent sits on meaning. Routes and parameters are what a traffic capture already
> gives you.
> Scoring is deterministic. Exact matching, no model judge, twenty golden tests. A perfect answer
> scores exactly one hundred.
> Each run writes two files. `evaluation.json` has the scores. `diff.json` lists what was matched,
> missed, or invented. Every number in this video comes from those files.
> The baseline we compare against is one general purpose agent with basic tools, made strong on
> purpose. Same target, same seven tools, same schema, same model, same budget, same login, same
> deny list. The app's source and the ground truth are unreachable. Only the inside differs."

---

## 4. One full run (2:05–3:00)

**Экран:** `npm run aae:run` — 10 секунд лога, склейка, дальше артефакты готового прогона:
`trajectory.jsonl` → `claims.jsonl` (поле `support`) → `gaps.jsonl` → `reconstruction.json`.

> "One full run.
> The agent starts at a login screen and explores the app. Every call goes through the harness, so
> every network event becomes evidence. Every risky click hits the gate first: read-only passes,
> reversible is logged, destructive is blocked.
> Now the important part. The explorer does not write the document.
> Code reads the captured traffic. Then extractors run in parallel, one per section: enums,
> validation, dependencies, workflows.
> Nothing is written from memory. Every claim points at its evidence and carries one word: observed,
> varied, or refuted. A claim that was only observed is still a guess. The experiment list is
> computed from those guesses, not chosen by the model.
> Then plain code merges everything and submits.
> Two hundred sixty-four actions. Four hundred nineteen pieces of evidence. Eighteen minutes."

**Титр:** `explore → mine → extract in parallel → assemble`

---

## 5. The comparison (3:00–3:45)

**Экран:** слайд с таблицей чисел, затем `diff.json` обоих прогонов рядом.

> "Same task. Same model. Same day.
> The baseline scores forty-nine point eight. Our system scores seventy-one point two. It costs
> three and a half times more and takes three times longer, and we say so.
> The win is not in finding. Both agents reached every operation. The win is in writing it down.
> Workflows go from zero point four three to zero point nine one. Meaning goes from eight percent
> recall to thirty. Evidence support stays at one hundred percent for both.
> We also score both runs under the two weightings we rejected. The order is the same in all three.
> The result does not depend on our weights."

**Титр:** `49.85 → 71.21 · same order under all 3 weight vectors`

---

## 6. What actually made the difference (3:45–4:30)

**Экран:** `docs/06-baseline-and-changelog.md` §3, затем `docs/11` (ADR).

> "The changelog is short.
> We ran the baseline first and let it tell us what was broken. Our written guess was: confident,
> wrong meanings. Half right. Precision was bad. But the real problem was recall. Eight percent.
> The agent looked at everything, then wrote down a third of it.
> Before blaming the agent we checked the scorer. We normalised every spelling difference it
> punished and scored the same files again. Under two points. The rest was never written.
> So the fix follows from the measurement. The bottleneck was writing, not looking. We removed the
> one place where a single model wrote a single document from a single context window. That is where
> the twenty-one points came from."

**Титр:** `It explored everything and wrote down a third`

---

## 7. What we removed, and how to run it (4:30–4:55)

**Экран:** строка removed experiment в `docs/06` §3, затем терминал с командами.

> "One thing we removed. We planned a coverage planner, to make sure the agent reached every
> operation. We deleted it before writing it. The baseline already scored a perfect one there. It
> had nothing left to find.
> The lesson: a component earns its place by the failure it removes in a measurement, not by how
> good it looks in a diagram.
> Five commands from a clean checkout. Every run, all the evidence, and both agents' trajectories
> are in the repo. Thank you."

**Титр (держать 8 секунд):**

```bash
cp .env.example .env                  # your OpenRouter key
cd miniCRM && npm run db:reset        # deterministic seed
npm run dev                           # target on :5173
npm run baseline:run                  # → results/runs/baseline-<ts>/
npm run aae:run                       # → results/runs/aae-<ts>/
npm run evaluate -- --run <id> --all
```

---

## Каждое утверждение → что держать на экране

| Фраза в озвучке | Файл |
| --- | --- |
| «весь проект, шесть частей» | дерево репозитория |
| «тринадцать документов» | `docs/README.md` (карта) |
| «ground truth из кода» | `miniCRM/benchmark/ground-truth/semantics.json` |
| «веса заморожены» | `evaluator/config/weights.json` → `"active": "frozen"` |
| «оценка детерминированная» | `cd evaluator && npm test` → 20 passed |
| «те же семь тулов» | `harness/index.ts`, `TOOL_DEFINITIONS` |
| «deny list» | `config/run.default.json` → `isolationDeny` |
| «гейт» | `trajectory.jsonl`, записи `policy_decision` |
| «каждый клейм с evidence и support» | `claims.jsonl` |
| «что пропущено / что выдумано» | `diff.json` |
| все числа | `evaluation.json` |

## Что объяснять, а что нет

**Объяснять:** структуру проекта (сегмент 2) · как читается VARS и что веса заморожены ·
что оценщик без LLM · контракт честности (те же тулы/схема/бюджет/deny list) · что Explorer не
пишет документ и почему · поле `support` · что порядок сохраняется под тремя весами.

**Не объяснять:** внутренности board merge · prompt caching и cost cap · submission recovery ·
выбор стека · историю ADR-14 → ADR-16 · девять `kind` семантических фактов.

**Не говорить:** «мы решили», «наш подход», «как вы видите». Вместо этого — число или имя файла.

## Инструменты

| Что | Чем | Почему |
| --- | --- | --- |
| Запись | **Loom** (экран + микрофон одним проходом) | один проход, сразу ссылка |
| Запасной вариант | **QuickTime** → New Screen Recording | нулевая настройка |
| Переключение сцен | **OBS Studio** | горячая клавиша терминал ↔ браузер ↔ редактор |
| Монтаж | **DaVinci Resolve** или **iMovie** | обрезать и склеить 7 кусков |
| Склейка без монтажки | `ffmpeg -f concat -i list.txt -c copy out.mp4` | если писали подряд |
| Слайд с числами | Keynote, 1 слайд, или таблица из этого файла в браузере | рендерить нечего |
| Хостинг | YouTube unlisted или ссылка Loom | формат брифом не ограничен |
| Микрофон | внешний / AirPods | вентилятор слышно |

## Подготовка

1. Терминал 18–20 pt, тёмная тема, `PS1='$ '`. Браузер — чистый профиль, без закладок.
2. Заранее открыть: дерево репо, `docs/README.md`, `weights.json`, `trajectory.jsonl`,
   `claims.jsonl`, `diff.json`, `docs/06` §3.
3. **Прогон AAE вживую не пишем** — 18 минут. 10 секунд лога, склейка, дальше артефакты.
4. Писать по сегментам, 7 дублей. Do Not Disturb.

## Доделать до записи

Сделано: корневой `README.md` (deliverable 01), [`docs/REPRODUCTION.md`](docs/REPRODUCTION.md)
(deliverable 02), AAE в [`docs/09`](docs/09-status-and-roadmap.md) §2, ADR-18…22 в
[`docs/11`](docs/11-decisions-and-open-questions.md).

Ещё открыто:

- Видео не записано (этот скрипт — заготовка deliverable 03).
- Прогоны сделаны в режиме `--all`, не по 15 кейсам. В озвучке говорим «full corpus»,
  не «fifteen cases». Runner так и не собран.

## Если не влезает в 5:00

Режем в этом порядке: список экстракторов в сегменте 4 → абзац про проверку оценщика в сегменте 6 →
абзац про baseline в конце сегмента 3 сжимается до «same tools, same budget, same deny list».
