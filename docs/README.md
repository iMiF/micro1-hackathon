# Autonomous API Explorer — документация проекта

> **Статус:** активная
> **Обновлено:** 2026-08-29
> **Язык:** русский
> **Область:** документация проекта целиком (agent + benchmark + target-приложение MiniCRM)
> **Расположение:** корень проекта, рядом с мишенью `miniCRM/`, а не внутри неё

Autonomous API Explorer (AAE) — агентная система, которая превращает наблюдаемое поведение
недокументированного веб-приложения в проверяемую документацию API. Проект подаётся на
**micro1 Agentic Workflows Hackathon**.

---

## Карта документации

| № | Файл | О чём | Кому нужен |
| --- | --- | --- | --- |
| — | [`README.md`](README.md) | Этот индекс и правила сопровождения | всем |
| 00 | [`00-hackathon-requirements.md`](00-hackathon-requirements.md) | Правила хакатона дословно + матрица соответствия | всем, перед каждым решением о scope |
| 01 | [`01-problem-and-value.md`](01-problem-and-value.md) | Проблема, пользователь, ценность, границы MVP | README подачи, видео |
| 02 | [`02-architecture.md`](02-architecture.md) | Архитектура AAE, контракт наблюдений, изоляция | инженерам |
| 03 | [`03-target-minicrm.md`](03-target-minicrm.md) | MiniCRM как target: стек, запуск, реальная поверхность API | инженерам, авторам ground truth |
| 04 | [`04-benchmark-contract.md`](04-benchmark-contract.md) | Публичный контракт benchmark: cases, схема вывода, fairness | инженерам, судьям |
| 05 | [`05-evaluation-and-metrics.md`](05-evaluation-and-metrics.md) | Primary metric, вторичные метрики, форма отчёта | инженерам, судьям |
| 06 | [`06-baseline-and-changelog.md`](06-baseline-and-changelog.md) | Определение baseline + Improvement Changelog | deliverable 01 |
| 07 | [`07-safety.md`](07-safety.md) | Risk policy, human control, работа с данными | deliverable 01, ground rules 04–08 |
| 08 | [`08-evidence-and-trajectories.md`](08-evidence-and-trajectories.md) | Evidence, provenance, требования к trajectories | deliverable 04 |
| 09 | [`09-status-and-roadmap.md`](09-status-and-roadmap.md) | Что готово, что нет, план и quality gates | всем, еженедельно |
| 10 | [`10-source-review.md`](10-source-review.md) | Архив: сверка исходного RU-документа с кодом и брифом | архив/аудит |
| 11 | [`11-decisions-and-open-questions.md`](11-decisions-and-open-questions.md) | Журнал решений (ADR) и открытые вопросы | всем |

---

## Отношение к исходным материалам

Эта документация заменяет `Autonomous_API_Explorer_Technical_Documentation_RU.pdf` (v1.0, 29.08.2026).
Тот PDF — **концепт-документ**, написанный до сверки с кодом: он остаётся историческим контекстом и
источником истины не является. Построчная сверка его утверждений с кодом сохранена в архиве
[`10-source-review.md`](10-source-review.md).

Первоисточник правил — `micro1 - First Hackathon97ce7c5.pdf` (бриф, 10 страниц, включая приложение с тремя примерами на стр. 8–10).
Дословные требования вынесены в [`00-hackathon-requirements.md`](00-hackathon-requirements.md).

---

## Правила сопровождения

### Иерархия источников истины

Если два источника расходятся — побеждает тот, что выше:

1. **Бриф хакатона** (`micro1 - First Hackathon97ce7c5.pdf`) — для всего, что касается правил, deliverables и судейства.
2. **Исходный код** `miniCRM/apps/api`, `miniCRM/apps/web`, `miniCRM/db/migrations` — для всего, что касается поведения MiniCRM.
3. **`miniCRM/benchmark/ground-truth/*`** — для машиночитаемых фактов. Производен от (2); при расхождении регенерируется, а не правится вручную.
4. **`docs/*`** — эта документация. Производна от (1)–(3).
5. Концепт-PDF — только исторический контекст.

### Как ссылаться на факты

Каждое фактическое утверждение о MiniCRM снабжается указателем на код:
`miniCRM/apps/api/src/domain/tax.ts → taxRateFor`. Номера строк не используются — они устаревают,
имена символов живут дольше.

Утверждение о **результате** (число, метрика, сравнение) без ссылки на прогон — запрещено.
См. ground rule 09 в [`00-hackathon-requirements.md`](00-hackathon-requirements.md).

### Метаблок в каждом файле

```
> **Статус:** черновик | активная | заморожена
> **Обновлено:** YYYY-MM-DD
> **Источник истины:** <откуда взяты факты>
```

`черновик` — содержимое может измениться целиком.
`активная` — можно опираться, изменения идут инкрементально.
`заморожена` — менять только через запись в [`11-decisions-and-open-questions.md`](11-decisions-and-open-questions.md).

### Когда что обновлять

| Событие | Обновить |
| --- | --- |
| Изменился код MiniCRM | `03`, регенерировать `miniCRM/benchmark/ground-truth/`, проверить `04` |
| Добавлен/изменён case | `04`, `05` |
| Проведён прогон | `06` (запись в changelog), `09` (статус) |
| Принято архитектурное решение | `11` (ADR), затем затронутый файл |
| Изменилась трактовка правил | `00`, затем всё, что от неё зависит |

### Что сюда НЕ кладут

- Секреты, реальные учётные данные, персональные данные (ground rule 08).
- Числа результатов, полученные не из experiment ledger.
- Копии ground truth в удобочитаемом виде «для агента».

---

## ⚠️ Изоляция от агента

`docs/` и всё дерево мишени — `miniCRM/benchmark/`, `miniCRM/apps/api`, `miniCRM/apps/web`,
`miniCRM/db/` и тесты — **никогда не попадают в tool context оцениваемого агента**. Агент видит
только запущенный UI на `http://localhost:5173` и сетевой трафик same-origin `/api`.

Документация лежит в корне проекта, а не внутри мишени: `miniCRM/` — испытуемое приложение,
а `docs/` описывает в том числе агента, который его исследует, и будущие компоненты рядом с ним.
Механическая защита от утечки описана в
[`04-benchmark-contract.md`](04-benchmark-contract.md) §1.
