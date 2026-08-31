# Solution video — script (deliverable 03, ≤ 5:00)

Первое лицо, дружелюбно, как экскурсия по проекту. Английская озвучка, экран + живой голос.
7 сегментов, **782 слова ≈ 5:00** при бодром темпе (155 слов/мин). Прогони с таймером: если
выходит медленнее — сразу сними два блока из списка «если не влезает» в конце файла.
Короткие фразы, простые слова: читается с листа без спотыканий.

Линия рассказа: **что я делаю → почему → как устроена работа по шагам → вот результат, открой
его в Swagger → вот числа → вот что дало прирост → повтори сам за две минуты.**
Все обязательные пункты брифа внутри: проблема, простой baseline, один полный прогон, сравнение,
changelog, главный вклад, один выброшенный эксперимент.

## Числа (пара Path A, модель `openai/gpt-5.6-sol`, одинаковые бюджеты)

| | Baseline `baseline-…T14-45-38-777Z` | AAE `aae-…T14-51-18-382Z` |
| --- | ---: | ---: |
| **VARS (frozen)** | **49.85** | **71.21** |
| под rejected_balanced / rejected_flat | 59.70 / 59.14 | 78.18 / 79.00 |
| operations · parameters | 0.94 · 0.91 | 1.00 · 0.93 |
| semantic_facts | 0.14 (recall 0.08) | 0.43 (recall 0.30) |
| dependencies · workflows | 0.53 · 0.43 | 0.68 · 0.91 |
| evidence support · coverage | 1.00 · 1.00 | 1.00 · 1.00 |
| действия · время · цена | 127 · 5m26s · $0.92 | 264 · 18m12s · $3.32 |

**Реплика на дешёвой модели** (`openai/gpt-5.6-luna`, тот же контракт, maxSteps 200):
baseline **33.56** — 69 действий, 3m42s, **$0.05**; AAE **61.12** — 137 действий, 9m25s, **$0.22**.
Разрыв baseline→AAE держится на обеих моделях: +21.4 на sol, +27.6 на luna.
Вывод для видео: архитектура не зависит от модели, а роли можно развести по цене.

---

## 1. Привет и проблема (0:00–0:30)

**Экран:** MiniCRM в браузере, DevTools → Network. Клик «change order status». В кадре
`PATCH /api/orders/12/status` `{"statusId": 40, "version": 3}`.

> "Hi! Let me show you what I built, and why.
> This is an internal CRM with no API documentation, and I have to integrate with it this week.
> Watch what happens when I change an order status. There's the request. I can see its shape. I
> cannot see its meaning.
> What is status forty? Why does it want `version`? Traffic won't tell me, and if I hand this dump
> to a model, it will happily make something up.
> A wrong spec is worse than no spec. That's what I went after."

---

## 2. Что я построил (0:30–1:12)

**Экран:** дерево репозитория одной командой, затем `docs/README.md`.

```bash
ls -d miniCRM harness agents/baseline agents/aae evaluator artifacts docs
```

> "So here's the project. Six pieces, quickly.
> MiniCRM is my target app. I wrote it, so I know every answer. Twenty-six operations you can reach
> by clicking.
> Next to it, the benchmark. Its ground truth is generated from the app's source, so it can't drift.
> The harness is the only door to the browser: seven tools, one risk gate, everything recorded.
> Then two agents — a simple baseline and my system — and an evaluator that scores what they submit.
> Every decision is written down: thirteen numbered documents, each with its reason.
> Honestly, the fastest way into this project is to point a model at the `docs` folder and ask it
> what I built and why. It's all in there."

---

## 3. Как идёт работа (1:12–2:12)

**Экран:** `npm run aae:run` — 10 секунд лога, склейка, дальше артефакты готового прогона:
`trajectory.jsonl` → `claims.jsonl` (поле `support`) → `gaps.jsonl` → `reconstruction.json`.

> "Let me walk you through one full run.
> Step one: the agent lands on a login screen and starts clicking. Every call goes through the
> harness, so every network event turns into evidence, and every risky click hits the gate first —
> read-only passes, reversible gets logged, destructive is blocked.
> Step two, and this is the part I like: the explorer never writes the document. Plain code reads
> the captured traffic instead.
> Step three: extractors run in parallel, one per section — enums, validation, dependencies,
> workflows. Nothing is written from memory. Every claim points at its evidence and carries one
> word: observed, varied, or refuted. Only observed means it's still a guess, and the next round of
> experiments is computed from those guesses.
> Step four: plain code merges it all and submits. Eighteen minutes."

**Титр:** `explore → mine → extract in parallel → assemble`

---

## 4. Результат, который можно открыть (2:12–3:00) ⭐ главный визуальный кусок

**Экран:** две команды, затем Swagger UI на `http://127.0.0.1:8090`. Показать дропдаун вверху:
переключить **baseline → AAE** на одном и том же экране. Раскрыть `POST /api/orders`: параметры,
описания, зависимости. Нажать `Try it out` на `GET /api/customers` и показать живой ответ.

```bash
npm run artifacts:generate -- aae-2026-08-31T14-51-18-382Z
npm run artifacts:preview -- --open
```

> "And here's the part you can actually use. One command turns the agent's output into an OpenAPI
> spec, one more opens it in Swagger.
> This isn't a mock-up. It's rendered from the run you just watched, by plain code. No model touches
> it, so nothing gets invented on the way out. If a field is unknown, it stays unknown.
> Look at this dropdown. Same screen, same target: this is what the baseline produced, and this is
> mine. You can see the difference without reading a single metric.
> And the target runs locally, so I can hit `Try it out` and call the real endpoint straight from
> the generated spec. Documentation you can click."

**Титр:** `reconstruction.json → OpenAPI 3.1 → Swagger UI`

---

## 5. Числа и стоимость (3:00–3:57)

**Экран:** слайд с таблицей sol, затем вторая строка слайда с luna, затем `results/runs/INDEX.md`.

> "Was it actually better? Let's be strict.
> My baseline is one general purpose agent with basic tools, and I made it strong on purpose: same
> target, same seven tools, same schema, same model, same budget. Both run behind the same deny
> list, so the app's source and the ground truth are unreachable.
> One number, VARS. Five weighted categories, frozen in a config file before the first run.
> On the expensive model the baseline gets forty-nine point eight, mine gets seventy-one point two,
> at about three dollars thirty a run.
> Then I ran the whole thing again on a cheap model, for twenty-two cents. There the baseline scores
> thirty-three and mine scores sixty-one — an even bigger gap.
> So the architecture wins on both. Which points at the next step: keep the expensive model where
> judgement matters, move the mechanical extraction to the cheap one, pay a fraction."

**Титр:** `49.85 → 71.21 · same order under all three weight vectors`

---

## 6. Что дало прирост, и что я выбросил (3:57–4:38)

**Экран:** `docs/06-baseline-and-changelog.md` §3 и §5 (hot take).

> "The short version of my changelog.
> I ran the baseline first and let it tell me what was broken. My guess beforehand was: confident
> wrong meanings. Half right. The real problem was recall — eight percent. It looked at everything,
> then wrote down a third of it.
> Before blaming the agent I checked my own scorer and re-scored the same files. Under two points.
> The rest was simply never written.
> So the fix came straight out of the measurement. The bottleneck isn't exploring, it's writing
> down. I removed the one place where a single model wrote a single document.
> And one thing I deleted: a coverage planner. Killed before I wrote it — the baseline already
> scored a perfect one on operations. Nothing left for it to find."

**Титр:** `The bottleneck is writing down, not looking`

---

## 7. Повтори сам (4:38–4:57)

**Экран:** терминал, `npm run evaluate` на обоих прогонах, VARS в выводе.

> "You can reproduce all of this. Path A needs no API key and no browser — every run I shipped is
> in the repo, and you re-score it in under two minutes. Path B and C re-run the agents themselves.
> It's all in the reproduction guide. Thanks for watching!"

```bash
npm run evaluate -- --run baseline-2026-08-31T14-45-38-777Z --all   # VARS 49.85
npm run evaluate -- --run aae-2026-08-31T14-51-18-382Z      --all   # VARS 71.21
npm run artifacts:preview -- --open                                 # Swagger UI
```

---

## Каждое утверждение → что на экране

| Фраза | Что показать |
| --- | --- |
| «six pieces» | `ls -d ...` или `tree -L 1 -d` |
| «thirteen numbered documents» | `docs/README.md` |
| «ground truth generated from source» | `miniCRM/benchmark/ground-truth/semantics.json` |
| «every risky click hits the gate» | `trajectory.jsonl`, записи `policy_decision` |
| «claim points at evidence, carries one word» | `claims.jsonl`, поле `support` |
| «one command → OpenAPI» | `results/runs/<id>/artifacts/openapi.json` |
| «baseline vs ours» | дропдаун артефактов в Swagger UI |
| «weights frozen» | `evaluator/config/weights.json` → `"active": "frozen"` |
| числа | `evaluation.json`, `diff.json` |
| «reproduction guide» | `docs/REPRODUCTION.md` §3 |

## Подготовка (важно для сегмента 4)

1. Заранее: `npm run db:reset` → `npm run dev` (мишень на :5173, API на :3000), иначе `Try it out`
   не ответит.
2. Заранее: `npm run artifacts:generate` для **обоих** прогонов пары — чтобы дропдаун переключался
   мгновенно и было видно baseline против AAE.
3. Заранее открыть `npm run artifacts:preview -- --open` и один раз кликнуть по всему, что будешь
   показывать: Swagger подгружает CDN-скрипты, первый рендер медленнее.
4. **Прогон AAE вживую не пишем** — 18 минут. 10 секунд лога, склейка, дальше артефакты.
5. Терминал 18–20 pt, тёмная тема, `PS1='$ '`. Браузер — чистый профиль, без закладок.
6. Писать по сегментам, 7 дублей. Do Not Disturb.

## Инструменты

| Что | Чем |
| --- | --- |
| Запись экрана + голоса | **Loom** одним проходом (или **QuickTime** → New Screen Recording) |
| Переключение терминал ↔ браузер ↔ редактор | **OBS Studio**, если нужны сцены по горячей клавише |
| Монтаж 7 кусков | **DaVinci Resolve** или **iMovie** |
| Склейка без монтажки | `ffmpeg -f concat -i list.txt -c copy out.mp4` |
| Слайд с числами | Keynote, 1 слайд, или таблица из этого файла в браузере |
| Хостинг | YouTube unlisted или ссылка Loom |
| Микрофон | внешний / AirPods — вентилятор слышно |

## Если не влезает в 5:00

Режем в этом порядке:
1. «Before blaming the agent I checked my own scorer…» в сегменте 6 — минус 25 слов.
2. Перечисление экстракторов в сегменте 3 («enums, validation, dependencies, workflows») — минус 10.
3. «same target, same seven tools, same schema, same model, same budget» в сегменте 5 сжать до
   «same tools, same budget, same deny list» — минус 10.
Этого хватает, чтобы уйти на 4:40.
**Сегмент 4 (Swagger) не режем** — это End-to-End Quality, 20 баллов рубрики.
