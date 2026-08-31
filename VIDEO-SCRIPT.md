# Solution video — script and shot list (deliverable 03, ≤ 5:00)

Narration **English**, recording **screen + live voice**, 7 segments, **735 words ≈ 4:50** at a
normal demo pace (150 wpm). Read it once with a timer before recording.
Brief's required beats: problem → simple baseline → one realistic end-to-end run → final
comparison → brief changelog → biggest contribution → one removed experiment. All seven are here.

**Rule for every line:** if a sentence doesn't earn a rubric point, it's cut. The rubric is
Problem 15 · Agent Solution 30 · End-to-End Quality 20 · Measured Improvement 15 ·
Reproducibility 15 · Hot Take 5.

## The numbers (published pair, same model `openai/gpt-5.6-luna`, shipped default budgets, 2026-08-31)

| | Baseline `baseline-…T16-00-44-545Z` | AAE `aae-…T16-04-43-124Z` |
| --- | ---: | ---: |
| **VARS (frozen)** | **33.56** | **61.12** |
| VARS (rejected_balanced) | 41.68 | 67.49 |
| VARS (rejected_flat) | 39.11 | 68.33 |
| operations F1 | 0.84 | 0.96 |
| parameters F1 | 0.54 | 0.75 |
| semantic_facts F1 | 0.12 (recall 0.07) | 0.29 (recall 0.20) |
| dependencies F1 | 0.36 | 0.81 |
| workflows F1 | 0.10 | 0.61 |
| evidence support / coverage | 1.00 / 1.00 | 1.00 / 1.00 |
| tool actions · wall time · cost | 69 · 3m42s · $0.05 | 137 · 9m25s · $0.22 |

Ranking is identical under **all three** weight vectors — that is ADR-13 obligation #2.

**Sol replication** (same architecture, `openai/gpt-5.6-sol`, `maxSteps` 300): baseline 49.85 /
$0.92 → AAE 71.21 / $3.32 (+21.37). Luna is weaker and ~15× cheaper; the delta is not a model
artifact (ADR-22).

---

## Segment 1 — Problem (0:00–0:25) · rubric: Problem & User Value

**Экран:** MiniCRM в браузере, DevTools → Network. Клик «change order status», в кадре
`PATCH /api/orders/12/status` `{"statusId": 40, "version": 3}`.

> "An internal CRM with no API documentation, and an engineer who has to integrate with it this
> week. Here's the request the UI just sent. It gives you the shape, not the meaning. What is status
> forty? Why is `version` required? Traffic can't answer that, and a model handed a HAR file will
> invent an answer. A wrong spec costs more than a missing one."

---

## Segment 2 — The metric, and how to read it (0:25–1:10) · rubric: Measured Improvement, Reproducibility

**Экран:** `miniCRM/benchmark/ground-truth/semantics.json` → `evaluator/config/weights.json` →
`npm test` в `evaluator/` (20 зелёных) → `evaluation.json` одного прогона.

> "So we made it measurable. The target is a synthetic CRM with twenty-six browser-reachable
> operations, and the ground truth is generated from its source code: seventy-one semantic facts,
> twenty-two dependencies, seventeen workflows.
> The metric is VARS — one number, a weighted sum of five per-category F1 scores. Weights live in a
> config file, frozen before the first scored run, with thirty-five percent on semantic facts:
> routes and parameters are what a proxy capture already gives you.
> Scoring is deterministic. Exact key matching, no LLM judge, no embeddings, twenty golden tests,
> and the reference reconstruction scores exactly one hundred.
> Each run writes `evaluation.json` — the scores — and `diff.json`: matched, missing, spurious,
> item by item. Every number in this video is in those two files."

**Титр:** `VARS = weighted F1 · weights frozen before the first run · deterministic scorer`

---

## Segment 3 — The baseline and the fairness contract (1:10–1:40) · rubric: Measured Improvement

**Экран:** `agents/baseline/system-prompt.md`, затем `config/run.default.json` — блок `budgets`
и `isolationDeny`.

> "The baseline is the brief's second option — one general-purpose agent with basic tools — and it
> is deliberately strong. Same target, the **same seven browser tools**, same output schema, same
> model, same step, time and cost budget, same credentials. Both run against the same deny-list:
> the target's source and the ground truth are unreachable, so leakage is structurally impossible,
> not merely forbidden. Only the internal organization differs."

**Титр:** `Same tools · same schema · same budget · same deny-list`

---

## Segment 4 — One realistic end-to-end run (1:40–2:55) · rubric: Agent Solution 30, End-to-End Quality 20

**Экран:** `npm run aae:run` — 10 секунд живого лога, **склейка** (9 минут в кадр не влезают,
сказать это вслух), дальше по артефактам готового прогона:
`trajectory.jsonl` → `claims.jsonl` (поле `support`) → `gaps.jsonl` → `evidence/` →
`reconstruction.json`.

> "A full run. The agent starts at a login screen and explores the UI. Every tool call goes through
> one harness, so every network event is captured as evidence and every risky action hits a policy
> gate first — read-only allowed, reversible logged, destructive blocked.
> Then the part that came out of the measurement: the explorer **does not write the document**.
> Deterministic passes mine the captured traffic and sweep the domain, and section extractors run in
> parallel over the same evidence — enums, validation, dependencies, workflows.
> Nothing is written from memory. Every claim carries its evidence id and a support level: observed,
> varied, or refuted. A claim that is only *observed* is a hypothesis, and the experiment queue is
> computed from those, not chosen by the model. A deterministic assembler merges the boards and
> submits.
> One hundred thirty-seven tool actions, two hundred twenty-three evidence records, nine minutes."

**Титр:** `Explorer → miner/sweeper → parallel extractors → deterministic assembler`

---

## Segment 5 — Final comparison (2:55–3:35) · rubric: Measured Improvement

**Экран:** слайд с таблицей чисел, затем `diff.json` обоих прогонов рядом.

> "Same task, same model, same day. Baseline: thirty-three point six. Final system: sixty-one
> point one — at four times the cost, which we report rather than hide.
> On the stronger Sol model the same split moved forty-nine to seventy-one: the gap is the
> architecture, not the model.
> The win is in what got written down. Workflows, F1 zero-one-zero to zero-six-one. Semantic facts,
> recall seven to twenty percent. Evidence support stays at one hundred percent for both — nothing
> in either document is unsourced.
> And every run is also scored under the two weightings we rejected. Same ranking under all three:
> the conclusion doesn't depend on our weights."

**Титр:** `33.56 → 61.12 · luna default · sol 49.85 → 71.21`

---

## Segment 6 — Changelog and the biggest contribution (3:35–4:25) · rubric: Measured Improvement, Hot Take

**Экран:** `docs/06-baseline-and-changelog.md` §3 (таблица), затем ADR-18 в `docs/11`.

> "The changelog is short. We measured the baseline first and named its failure mode from the data.
> Our written prediction was 'confidently wrong semantics.' Half right — precision was bad, but the
> dominant term was recall, at zero-point-zero-eight. The agent explored completely and wrote down a
> third of what it had seen.
> Before blaming the agent we checked the scorer: we normalized every notation variant those files
> were losing on and re-scored the identical documents. Under two points. What was missing was never
> written down.
> So the biggest contribution follows from the measurement: **the bottleneck was synthesis, not
> exploration**. We deleted the single serialization point — one model writing one document from one
> context window — and replaced it with parallel extractors writing to typed boards that a
> deterministic rule merges. That's where the twenty-seven points came from — twenty-one on Sol."

**Титр:** `Failure mode: explored fully, wrote down a third`

---

## Segment 7 — Removed experiment, and reproduction (4:25–4:55) · rubric: Hot Take, Reproducibility

**Экран:** строка removed experiment в `docs/06` §3; затем терминал с командами.

> "One removed experiment. The design had a coverage planner, to make sure the agent reached every
> operation. We cut it before writing a line of it: the baseline already scored operations F1 at one
> point zero, so it had nothing left to find. The lesson — a component earns its place by the failure
> mode it eliminates in a measurement, not by how reasonable it looks in a diagram.
> Five commands from a clean checkout. The runs, the evidence and the trajectories for both agents
> are in the repo. Thanks."

**Титр (команды, держать в кадре 8 секунд):**

```bash
cp .env.example .env                  # add your OpenRouter key
cd miniCRM && npm run db:reset        # deterministic seed
npm run dev                           # target on :5173
npm run baseline:run                  # → results/runs/baseline-<ts>/
npm run aae:run                       # → results/runs/aae-<ts>/
node evaluator/bin/evaluate.mjs \
  --submission results/runs/<id>/reconstruction.json --all \
  --meta results/runs/<id>/meta.json --out results/runs/<id>
```

---

## Ответы на вопросы: что объяснять, а что нет

**Объяснять обязательно (это и есть баллы):**

| Что | Почему | Сколько |
| --- | --- | --- |
| Как читается VARS и что веса заморожены до первого прогона | Measured Improvement судится по честности сравнения, а не по величине числа | 20 с, сегмент 2 |
| Что оценщик детерминированный (нет LLM-судьи) | Снимает главное возражение «вы сами себе поставили оценку» | 8 с, сегмент 2 |
| Контракт честности: те же 7 тулов, схема, бюджет, deny-list | Прямое требование брифа — «explain any meaningful difference in resources» | 20 с, сегмент 3 |
| Что Explorer **не пишет** документ и почему | Это и есть главный вклад; без «почему» это просто схема | 25 с, сегменты 4 и 6 |
| Поле `support` и что очередь экспериментов вычисляется | Purposeful design choice, а не количество компонентов | 15 с, сегмент 4 |
| Ranking устойчив под тремя векторами весов | Убивает возражение «подогнали веса» | 8 с, сегмент 5 |

**Не объяснять (режется без потерь):**

- внутренности board merge, схема ClaimBoard/GapBoard построчно;
- prompt caching, `maxCostUsd`, submission recovery (ADR-17) — инженерия, но не рубрика;
- почему выбран Fastify/Vue/Playwright;
- история ADR-14 → ADR-16 в деталях; в сегменте 6 достаточно одной фразы «мы проверили оценщик»;
- перечисление всех девяти `kind` семантических фактов;
- слова «мы решили», «мы подумали», «наш подход» — заменяются на число или на файл.

**Где что показывать на экране (каждое утверждение → файл):**

| Утверждение в озвучке | Файл в кадре |
| --- | --- |
| «ground truth сгенерирован из кода» | `miniCRM/benchmark/ground-truth/semantics.json` |
| «веса заморожены» | `evaluator/config/weights.json` (`"active": "frozen"`) |
| «детерминированный оценщик» | `cd evaluator && npm test` → 20 passed |
| «те же 7 тулов / deny-list» | `harness/index.ts` (`TOOL_DEFINITIONS`), `config/run.default.json` |
| «policy gate» | `results/runs/<aae>/trajectory.jsonl`, записи `policy_decision` |
| «каждый клейм с evidence id и support» | `results/runs/<aae>/claims.jsonl` |
| «что именно пропущено» | `results/runs/<id>/diff.json` |
| «числа» | `results/runs/<id>/evaluation.json` |

---

## Инструменты записи

| Что | Чем | Почему |
| --- | --- | --- |
| Основной вариант | **Loom** (screen + mic одним проходом) | один проход, ссылка сразу, ничего не рендерить |
| Оффлайн-вариант | **QuickTime** → New Screen Recording | нулевая настройка |
| Сцены «терминал / браузер / редактор» | **OBS Studio** | горячая клавиша между сценами |
| Монтаж (обрезка + склейка 7 сегментов) | **DaVinci Resolve** или **iMovie** | нужны только две операции |
| Склейка без монтажки | `ffmpeg -f concat -i list.txt -c copy out.mp4` | если сегменты писались подряд |
| Слайд с таблицей | Keynote (1 слайд) или таблица из этого файла в браузере | рендерить нечего |
| Хостинг | YouTube unlisted или ссылка Loom | брифом формат не ограничен |
| Микрофон | внешний / AirPods | вентилятор во время прогона слышно |

## Подготовка сцены

1. Терминал 18–20 pt, тёмная тема, `PS1='$ '`, окно ~1600×900. Браузер — чистый профиль, без закладок.
2. Три вкладки терминала заранее: MiniCRM поднят и заселён · прогон · evaluator.
3. Редактор: заранее открыть табы `trajectory.jsonl`, `claims.jsonl`, `gaps.jsonl`, `diff.json`,
   `docs/06` §3, `docs/11` ADR-13, `evaluator/config/weights.json`.
4. **Прогон AAE вживую не записывать** (9 минут): 10 секунд лога → склейка → артефакты.
5. Писать **по сегментам**, 7 дублей. Do Not Disturb.

## Что надо доделать до записи

- **Прогоны сделаны в режиме `--all`**, а не по 15 кейсам: бриф просит «10+ cases, same cases for both».
  В озвучке честно говорим «full corpus», не «fifteen cases», пока раннер не написан.
- **`results/runs` в `.gitignore`** — luna-пару (`…T16-00-44-545Z` / `…T16-04-43-124Z`) нужно
  force-add до сабмишена, иначе Path A пустой.

## Если не влезает в 5:00

Режется в этом порядке: детали архитектуры в сегменте 4 → второй абзац сегмента 6 (проверка
оценщика) → обоснование выбора baseline в сегменте 3.
