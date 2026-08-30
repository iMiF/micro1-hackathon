# 04. Публичный контракт benchmark

> **Статус:** активная (кейсы и схема существуют; runner и evaluator — нет)
> **Обновлено:** 2026-08-29
> **Источник истины:** `miniCRM/benchmark/cases.json`, `miniCRM/benchmark/schemas/reconstruction-output.schema.json`, `miniCRM/benchmark/README.md`
> **Соответствует критериям:** Reproducibility (15), Measured Improvement (15)

---

## 1. Что публично, а что нет

Разделение — сердце честности benchmark.

| Публично (можно показывать судьям и класть в контекст агента при необходимости) | Только для авторов и evaluator |
| --- | --- |
| Схема результата `reconstruction-output.schema.json` | `miniCRM/benchmark/ground-truth/*.json` |
| Список разрешённых инструментов | `miniCRM/benchmark/INVENTORY.md`, `miniCRM/benchmark/GAPS.md` |
| Бюджеты (действия, время, токены) | Исходный код `miniCRM/apps/api`, `miniCRM/apps/web`, `miniCRM/db/` |
| Правила нормализации и canonical labels | Тесты и seed |
| Идентификаторы и описания кейсов | `ground_truth_fact_ids` внутри кейсов |
| — | `docs/` целиком: author-only |

**Правило:** код мишени и ground truth не попадают в tool context агента. Иначе benchmark
измерит утечку, а не исследование. Runner имеет к ним доступ только для reset и scoring.

### Механическая защита (обязательна к реализации)

Дисциплины недостаточно — нужен барьер, который нельзя нарушить по невнимательности:

1. Harness экспортирует **фиксированный** список из семи инструментов. Ничего, что читает файлы,
   среди них нет.
2. Процесс агента запускается с рабочей директорией **вне** репозитория мишени.
3. Runner проверяет перед стартом: в собранном контексте агента нет строк из
   `miniCRM/benchmark/ground-truth/` (проверка по хешам известных значений).
4. Весь каталог `miniCRM/` и каталог `docs/` перечислены в deny-list конфигурации прогона.

---

## 2. Набор кейсов

**Текущее состояние: 15 кейсов** в `miniCRM/benchmark/cases.json`. Бриф просит «десять и более» —
требование выполнено с запасом.

| ID | Сложность | Challenging | Фактов |
| --- | --- | :---: | ---: |
| `case-01-auth-session-csrf` | basic | | 11 |
| `case-02-customer-list-search-pagination` | basic | | 6 |
| `case-03-customer-write-schema-version` | medium | | 6 |
| `case-04-country-region-dependent-select` | medium | | 8 |
| `case-05-order-status-numeric-enum` | medium | | 7 |
| `case-06-order-detail-two-requests` | basic | | 12 |
| `case-07-add-note-refresh-activity` | basic | | 6 |
| `case-08-status-transition-version` | medium | | 11 |
| `case-09-create-order-workflow` | hard | ✅ | 22 |
| `case-10-shipping-method-ids` | hard | ✅ | 10 |
| `case-11-tax-cents-by-region` | hard | ✅ | 8 |
| `case-12-out-of-stock-quote` | medium | | 4 |
| `case-13-customer-delete-safety` | medium | | 4 |
| `case-14-draft-order-delete` | medium | | 3 |
| `case-15-dashboard-summary-semantics` | medium | | 9 |

**Кейс оценивает только то, что видно из браузера.** Факт, который нельзя получить кликами по UI
(например, ошибка, которую фронтенд физически не даёт вызвать), остаётся в ground truth, но в
список фактов кейса не входит — иначе оценка измеряла бы угадывание HTTP. Правило — ADR-8,
перечень таких фактов — `miniCRM/benchmark/GAPS.md`.

Бриф требует **один** сложный кейс с разбором. У нас три помечены `challenging`. Для подачи нужно
**назначить один основной** и разобрать его подробно — остальные останутся в общей таблице.
Кандидат: `case-09-create-order-workflow` (22 факта, полная цепочка с непрозрачным `quoteId`).
Решение — OQ-4 в [`11`](11-decisions-and-open-questions.md).

### Проверяемые способности

Поле `capabilities_tested` в `miniCRM/benchmark/cases.json` использует закрытый список из 16 значений:

| # | Способность | # | Способность |
| ---: | --- | ---: | --- |
| 1 | endpoint discovery | 9 | one UI action causing several API calls |
| 2 | request schema reconstruction | 10 | multi-request workflow |
| 3 | response schema reconstruction | 11 | request dependency |
| 4 | path parameter inference | 12 | related entity lookup |
| 5 | query parameter inference | 13 | dependent selects or similar chained data loading |
| 6 | pagination | 14 | conditional API calls |
| 7 | filtering/search | 15 | business validation/error behavior |
| 8 | numeric or otherwise opaque enum semantics | 16 | destructive action safety |

Список закрыт: новый кейс либо использует существующее значение, либо расширение списка
оформляется как решение в [`11`](11-decisions-and-open-questions.md).

---

## 3. Схема результата

`miniCRM/benchmark/schemas/reconstruction-output.schema.json` (JSON Schema draft-07).

Обязательные секции: `schema_version`, `operations`, `semantic_facts`, `dependencies`,
`workflows`, `claims`.
Необязательные: `benchmark_name`, `reconstructed_at`, `notes`, `components`, `confidence`, `actions`.
`additionalProperties: false` — расширять схему на ходу нельзя.

### Единицы оценки

| Секция | Единица | Пример |
| --- | --- | --- |
| `operations` | метод + нормализованный путь | `PATCH /api/orders/{id}/status` |
| `operations[].parameters` | операция + location + имя + тип + обязательность | `query.status: integer` |
| `semantic_facts` | `kind` + `subject` + `value` | `enum_mapping / order.status_id / 40` |
| `dependencies` | источник → артефакт → потребитель | `POST /api/order-quotes → quoteId → POST /api/orders` |
| `workflows` | последовательность шагов с ролями | создание заказа |
| `claims` | утверждение + confidence + вложенный `evidence` | см. [`08`](08-evidence-and-trajectories.md) |

### Модель доказательств

Доказательства **вложены** в факт, операцию или claim, а не хранятся отдельным реестром с
идентификаторами. `definitions.evidence` допускает семь видов:

`network_request`, `network_response`, `ui_label`, `ui_control`, `ui_action`, `cookie`, `header`.

Обязательно только поле `kind`; остальные (`page`, `method`, `path`, `status`, `json_paths`,
`header`, `cookie_name`, `ui_text`, `note`) заполняются по применимости.

**Ссылаться на исходный код нельзя** — это записано в описании схемы («Do not cite source
code») и структурно закреплено самим списком `kind`: все семь видов наблюдаемы только из браузера.

> Следствие: сквозных идентификаторов `ev_NNN` в схеме нет, и проверка ссылочной целостности
> между фактом и отдельным хранилищем evidence невозможна. Хранение траекторий
> ([`08`](08-evidence-and-trajectories.md)) идентификаторы использует — это два разных уровня.
> Нужно ли их связать, решается в OQ-8 ([`11`](11-decisions-and-open-questions.md)).

### Виды семантических фактов

`semantic_facts[].kind` — закрытый список. В ground truth 71 факт со следующим распределением:

| kind | Фактов | Что фиксирует |
| --- | ---: | --- |
| `enum_mapping` | 15 | Числовое/строковое значение ↔ видимый смысл |
| `business_constraint` | 13 | Условие → отказ (409/422) |
| `query_semantics` | 12 | Что делает параметр запроса |
| `derived_value` | 10 | Вычисляемое сервером значение |
| `auth` | 5 | Механика сессии и CSRF |
| `validation` | 5 | Правила валидации входа |
| `identifier_meaning` | 5 | Смысл идентификатора |
| `state_transition` | 5 | Допустимые переходы |
| `concurrency` | 1 | Оптимистическая блокировка |

> Девять значений `kind` — закрытый список, одинаковый в ground truth и в схеме. Расширять его
> можно только решением в [`11`](11-decisions-and-open-questions.md): каждое значение — отдельная
> категория сопоставления у оценщика.

---

## 4. Canonical vocabulary и нормализация

Оценщик не понимает смысл — он сравнивает нормализованные ключи. Поэтому правила
нормализации публичны и агент о них знает:

1. **Пути** нормализуются: конкретные идентификаторы → `{id}`, `{customerId}`, `{addressId}`.
2. **Методы** — верхний регистр.
3. **Canonical labels** для перечислений: точная **видимая в UI подпись**, приведённая к
   `lower_snake_case`.
4. **Алиасы**, если нужны, объявляются заранее в открытом evaluation config.

**Жёсткая граница:** оценщик не признаёт `sent` эквивалентом `shipped`, если такого алиаса нет в
публичной таблице. Это намеренно. Benchmark измеряет способность восстановить **наблюдаемые
canonical-факты**, а не вкус LLM-судьи.

> Список допустимых меток берётся из ground truth и публикуется в evaluation config **до**
> прогонов. Для статусов заказа это `draft`, `confirmed`, `processing`, `shipped`, `cancelled` —
> ровно те подписи, что рисует `miniCRM/apps/web/src/orderStatus.ts`.

---

## 5. Fairness: что должно совпадать

Сравнение имеет смысл только при одинаковой постановке. Baseline и AAE получают идентичные:

- набор кейсов и seed'ы (seed задаётся конфигурацией прогона: в `cases.json` поля `seed` нет);
- URL мишени и версию мишени (`application_commit`);
- роль и учётные данные;
- поверхность инструментов (те же семь функций);
- схему вывода;
- бюджет действий, wall-clock и токенов;
- модель — если сравнивается workflow, а не модель.

**Любое отклонение фиксируется в отчёте с объяснением** (прямое требование брифа:
*«Explain any meaningful difference in the resources available to each one»*).

### Чек-лист fairness

- [ ] Публичная схема вывода и canonical vocabulary одинаковы для обеих систем
- [ ] Кейсы, seed'ы, версия мишени, роль, инструменты и бюджеты совпадают
- [ ] Ground truth и исходный код мишени недоступны в контексте агента (проверено механически)
- [ ] Оценщик детерминирован: без LLM, embeddings и скрытого fuzzy matching
- [ ] Кейсов ≥ 10; назначен и разобран один основной сложный кейс
- [ ] Ledger содержит по каждому кейсу: score, runtime, cost, seed, версию модели
- [ ] Любое различие ресурсов объяснено
- [ ] В отчёте нет целевых или примерных значений вместо фактических

---

## 6. Runner: фазы прогона

Runner — не LLM и не оценщик. Это диспетчер эксперимента.

| Фаза | Что делает | Какую гарантию даёт |
| --- | --- | --- |
| **Reset** | Останавливает API, поднимает MiniCRM из чистого seed, стартует API, применяет роль прогона | Независимость прогонов и повторяемость |
| **Launch** | Запускает baseline или AAE с одинаковой поверхностью инструментов, версиями и бюджетами | Честность ресурсов |
| **Capture** | Сохраняет последовательность tool calls, наблюдения, сеть, снимки экрана, итоговый JSON | Траектория и evidence проверяемы |
| **Evaluate** | Вызывает детерминированный оценщик с ground truth кейса | Одинаковая rubric без ручной подгонки |
| **Aggregate** | Фиксирует seed, версию модели, wall time, токены, стоимость, результаты | Полный experiment ledger |

Завершение прогона: вызов `submit_reconstruction` **или** исчерпание бюджета. Исчерпание бюджета
без вызова — это результат (невалидный вывод), а не ошибка запуска.

---

## 7. Структура артефактов прогона

```
artifacts/runs/<run-id>/
  meta.json           # case, seed, система, версия модели, версия мишени, бюджеты
  trajectory.jsonl    # шаги: инструкция → tool call → ответ → наблюдение → решение
  evidence/           # снимки, тела запросов/ответов, UI-состояния
  reconstruction.json # то, что подал агент
  evaluation.json     # метрики
  diff.json           # matched / missing / spurious / invalid
  report.md           # человекочитаемый разбор
```

`<run-id>` формируется как `<система>-<case>-<seed>`, например `aae-case09-seed41`.
