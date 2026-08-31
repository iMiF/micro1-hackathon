# Solution video — script (deliverable 03, ≤ 5:00)

Правило этого сценария: **говорю мало, показываю много.** 370 слов озвучки ≈ 2:30 речи,
остальные 2:30 — молчаливые паузы, пока веду мышкой по экрану. Реплики короткие, между ними
явно написано, сколько молчать и что в этот момент показывать.

Если сомневаешься — молчи и показывай. Судья и так видит.

**Откалибруй сначала.** Прочитай вслух с таймером только реплики сегментов 1–3. Должно выйти
около 1:10. Если больше 1:30 — ты говоришь медленнее, чем считает сценарий: убери реплики,
помеченные ✂️, они не несут баллов.

## Числа под рукой

| | baseline | AAE |
| --- | ---: | ---: |
| VARS (sol, $) | **49.85** · $0.92 | **71.21** · $3.32 |
| VARS (luna, $) | **33.56** · $0.05 | **61.12** · $0.22 |

Прогоны: `baseline-2026-08-31T14-45-38-777Z`, `aae-2026-08-31T14-51-18-382Z`.

---

## 1 · Проблема (0:00–0:35)

**Показываю:** MiniCRM, DevTools → Network. Кликаю «change order status».

> "Hi! An internal CRM, no API documentation, and I have to integrate with it this week."

**Пауза 5 сек** — жду, пока в Network появится запрос, подсвечиваю его.

> "There's the request. I see the shape. I don't see the meaning. What is status forty? Why does it
> want `version`? ✂️ Traffic won't tell me, and a model will just make something up.
> A wrong spec is worse than no spec."

**Пауза 5 сек** — держу тело запроса в кадре.

---

## 2 · Экскурсия по проекту (0:35–1:20)

**Показываю:** `ls -d miniCRM harness agents/baseline agents/aae evaluator artifacts docs`

> "So here's the whole thing. My target app. The benchmark next to it. The harness — the only door
> to the browser. Two agents: a plain baseline, and mine. An evaluator. And the docs."

**Пауза 15 сек** — медленно веду курсором по строчкам вывода, затем открываю `docs/README.md`
и скроллю таблицу из 13 файлов.

> "Every decision I made is written down, with its reason. Honestly — the fastest way in is to point
> a model at this `docs` folder and ask it what I built and why."

---

## 3 · Как это работает (1:20–2:15)

**Показываю:** `npm run aae:run`, 10 секунд живого лога.

> "One run looks like this. The agent lands on a login screen and clicks around. Everything goes
> through the harness, so every network call becomes evidence."

**Склейка** на готовый прогон. **Показываю** `trajectory.jsonl`, скроллю.

> "Here's the important bit: the explorer never writes the document. Extractors read the recorded
> evidence in parallel, and every claim points back at its evidence."

**Пауза 15 сек** — открываю `claims.jsonl`, подсвечиваю поле `support`: `observed` / `varied`,
затем `gaps.jsonl`.

> "Only observed means it's still a guess. Those guesses become the next round of experiments."

---

## 4 · Результат (2:15–3:20) ⭐ здесь показываю дольше всего

**Показываю:** две команды.

```bash
npm run artifacts:generate -- aae-2026-08-31T14-51-18-382Z
npm run artifacts:preview -- --open
```

> "And this is what comes out. One command turns that run into an OpenAPI spec, one more opens it in
> Swagger. Plain code, no model — so nothing gets invented on the way out."

**Пауза 15 сек** — Swagger UI, раскрываю `POST /api/orders`, показываю параметры и описания.

> "Same screen, same target. This is what the baseline produced… and this is mine."

**Пауза 15 сек** — переключаю дропдаун baseline ↔ AAE, даю разнице повисеть в кадре.

> "And the app is running locally, so I can just call it."

**Пауза 10 сек** — `Try it out` на `GET /api/customers`, показываю живой ответ.

---

## 5 · Числа (3:20–4:15)

**Показываю:** слайд с таблицей.

> "Fair comparison: same tools, same schema, same model, same budget. One score, frozen before the
> first run."

**Пауза 10 сек** — слайд, строка sol.

> "On the good model: forty-nine versus seventy-one, at three dollars a run. Then I ran everything
> again on a cheap model, for twenty cents — thirty-three versus sixty-one. An even bigger gap."

**Пауза 10 сек** — строка luna.

> "So this isn't the model being smart. Next step is obvious: expensive model where judgement is
> needed, cheap one for the mechanical parts."

---

## 6 · Вывод и как повторить (4:15–4:55)

**Показываю:** `docs/06-baseline-and-changelog.md` §5 (hot take).

> "My lesson: the bottleneck of an exploring agent isn't exploring. It saw everything — it just
> wrote down a third of it. ✂️ I also killed a coverage planner before writing it, because the
> baseline already scored perfect there."

**Пауза 8 сек** — держу абзац hot take в кадре.

**Показываю:** терминал.

```bash
npm run evaluate -- --run baseline-2026-08-31T14-45-38-777Z --all   # 49.85
npm run evaluate -- --run aae-2026-08-31T14-51-18-382Z      --all   # 71.21
```

> "You can re-score every run I shipped in two minutes, no API key. It's all in the reproduction
> guide. Thanks!"

**Пауза 8 сек** — вывод VARS в терминале, затем `docs/REPRODUCTION.md`.

---

## Подготовка (иначе сегмент 4 не снимется)

1. `npm run db:reset` → `npm run dev` — мишень на :5173, API на :3000, иначе `Try it out` молчит.
2. `npm run artifacts:generate` для **обоих** прогонов пары — иначе дропдаун не переключается.
3. `npm run artifacts:preview -- --open` заранее и один раз прокликать: первый рендер Swagger медленный.
4. Прогон AAE вживую **не пишем** — 18 минут. 10 секунд лога, склейка.
5. Терминал 18–20 pt, `PS1='$ '`, браузер без закладок. Do Not Disturb.
6. Пишем по сегментам, 6 дублей.

## Инструменты

Запись — **Loom** одним проходом (или QuickTime). Монтаж 6 кусков — **iMovie** / DaVinci Resolve.
Склейка без монтажки — `ffmpeg -f concat -i list.txt -c copy out.mp4`.
Слайд с числами — 1 слайд Keynote. Хостинг — YouTube unlisted или ссылка Loom. Микрофон внешний.

## Если всё равно длинно

Сначала убираем реплики с ✂️ (минус 25 слов). Дальше режем показ, не речь: пауза в сегменте 2
с 15 до 8 сек, пауза на `Try it out` целиком.
**Дропдаун baseline ↔ AAE в сегменте 4 не режем** — это самый убедительный кадр во всём видео.
