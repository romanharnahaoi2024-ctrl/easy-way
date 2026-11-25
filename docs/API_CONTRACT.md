# Контракт API клієнта EasyWay (EZW-42, EZW-54)

Версія від 25.11.2026. Узгоджено П4 (Кирило Кириченко, бекенд) і П5 (Владислав Хмара, клієнт).
Це єдина версія контракту для команди: якщо щось змінюється, правимо цей файл.

Клієнт перемикається на справжній сервер однією змінною: у `.env` задайте `VITE_USE_MOCK=false` і `VITE_API_URL=http://localhost:8000`.
Усі виклики зібрано в `src/api/auth.ts` і `src/api/data.ts`.

Усі запити, крім входу, йдуть із заголовком `Authorization: Bearer <JWT>`. Без нього сервер відповідає `401`.

## 1. Що погоджено

- **`outcome` в аудиті.** Для запитів обміну `outcome` дорівнює стану запиту: `approved`, `denied`, `invalid`. Деталі в `reason_code`.
- **Термін сервера.** Сервер з EZW-42 буде до вечора 26.11, після цього П5 робить EZW-54 (наскрізний прогін) і скриншоти з реальним сервером.
- **`POST /exchange/requests`.** Дані набору сервер читає сам, не з тіла запиту. Коди відповіді: 200, 401, 403, 422.

## 2. Коди причин і помилки

Сервер віддає в `reason_code` ті самі коди, що пишуться в журнал аудиту. Перелік зафіксовано у вимогах до журналу аудиту (від нього залежать тести й критерії приймання EZW-65, EZW-66), тому відповідь і запис журналу звіряються за `request_id` і причиною без таблиці відповідності.

| reason_code | HTTP | Коли | Крок на шкалі клієнта |
|---|---|---|---|
| `OK` | 200 | дані видано | усі кроки пройдено |
| `UNAUTHENTICATED` | 401 | немає токена або він недійсний | — (запит не створюється) |
| `NO_ROLE_PERMISSION` | 403 | роль не має права на дію з набором | 3. Перевірити роль |
| `NO_CONSENT` | 403 | набір вимагає згоди, а згоди немає | 4. Перевірити згоду |
| `CONSENT_REVOKED` | 403 | згоду відкликано | 4. Перевірити згоду (той самий текст, що й `NO_CONSENT`) |
| `VALIDATION_FAILED` | 422 | дані не пройшли JSON Schema | 5. Перевірити якість |

Формат помилки:

```json
{ "detail": "Немає чинної згоди на обробку цього набору.", "reason_code": "NO_CONSENT", "request_id": "req_0139" }
```

- Для `401` поле `request_id` дорівнює `null`, бо запит не створюється.
- Для `422` додатково може бути `errors: [{ row, path, message }]`. У `message` немає сирих значень, масив може бути порожнім.
- Клієнт показує `detail` користувачеві. Якщо `reason_code` не прийшов, клієнт визначає причину за HTTP-статусом (401 → `UNAUTHENTICATED`, 403 → `NO_ROLE_PERMISSION` або `NO_CONSENT`, якщо в тексті йдеться про згоду, 422 → `VALIDATION_FAILED`).

## 3. Ендпоінти (робить П4)

| Метод | Шлях | Тіло / параметри | Відповідь |
|---|---|---|---|
| POST | `/auth/login` | `{ email, password }` | `{ access_token, token_type: "bearer", expires_in, user }` |
| GET | `/auth/me` | — | `user = { id, email, full_name, role, organization }` |
| GET | `/routes` | — | `[{ code, direction, name, mode?, stops: [{ id, name, lat, lon, order }] }]` |
| GET | `/positions/latest` | — | `[{ fleet_code, route_code, lat, lon, observed_at, low_floor? }]` — остання позиція кожного засобу |
| GET | `/datasets` | — | `[{ code, kind, schema_version, requires_consent, title?, classification?, owner?, description? }]` |
| POST | `/exchange/requests` | `{ dataset_code, action: "read", purpose, period_from?, period_to? }` | 200 `{ request_id, state: "approved", dataset_code, records, total, masked_fields }` · 401 · 403 · 422 |
| GET | `/exchange/requests/{id}` | — | один запит |
| GET | `/exchange/requests?mine=true` | — | `[{ request_id, dataset_code, action, state, reason_code, created_at, finished_at? }]` — «Мої запити» |
| POST | `/consents` | `{ dataset_code, valid_until }` | 201, створена згода |
| GET | `/consents` | — | `[{ id, user_email, dataset_code, granted_at, valid_until, revoked_at }]`; для `admin` усі згоди |
| DELETE | `/consents/{id}` | — | згоду відкликано (тіло відповіді клієнт не використовує) |
| GET | `/audit` | `from, to, role, outcome, dataset, q` (можуть ігноруватися) | `[{ id, request_id, occurred_at, outcome, reason_code, user_id, dataset }]` |

Пріоритет: спершу те, що потрібно для EZW-54 і скриншотів. Якщо щось не встигне до вечора 26.11, П4 повідомляє заздалегідь.

Значення полів:

- `role`: `carrier | consumer | admin | auditor`.
- `state` запиту: `pending | approved | denied | invalid`.
- `outcome` в аудиті: `approved | denied | invalid` (для інших подій клієнт також показує `info`).
- `classification`: `public | internal | confidential | restricted`.
- `observed_at`: ISO 8601 з часовим поясом. Клієнт опитує сервер кожні 10 с і позначає позицію як застарілу, якщо вона старша за 30 с.

## 4. Що враховує клієнт

- `purpose`, `period_from`, `period_to` сервер приймає, але ігнорує (у журнал не пишуться). Поле `dataset_code` у тілі не перейменовуємо.
- `masked_fields` поки завжди `[]`, маскування на сервері не реалізоване. Клієнт не показує блок «Замасковано», якщо список порожній.
- Якщо `total` не прийшов, клієнт рахує кількість записів сам.
- `GET /audit`: для подій без запиту `user_id` і `dataset` дорівнюють `null`, клієнт показує їх як «Система». Якщо сервер ігнорує параметри фільтра, клієнт фільтрує отриманий список сам. `hash` і `prev_hash` необов’язкові: якщо сервер їх надсилає, клієнт перевіряє цілісність ланцюжка.
- Подання файлів перевізником (`POST /datasets/{code}/submissions`, `GET /submissions`, UC-05) до EZW-42 не входить. Поки цих ендпоінтів немає, екран «Подання даних» працює лише в демо-режимі.

## 5. Як перевірити наскрізний сценарій (EZW-54)

Сценарій повторює `docs/demo/DEMO_SCRIPT.md`:

1. Увійдіть як споживач. Мапа має показати маршрути й транспорт із часом позиції.
2. «Обмін даними» → набір `gps-demo` → 200, `request_id`, дані.
3. «Згоди» → відкличте згоду → повторіть запит → 403 `CONSENT_REVOKED`, зупинка на кроці 4.
4. Набір із помилковими даними → 422 `VALIDATION_FAILED`, зупинка на кроці 5.
5. Увійдіть як аудитор → журнал показує події з тими самими `request_id` і причинами.
6. Як споживач відкрийте `/audit` → сторінка 403.

Для локального запуску сервера в `.env` бекенду потрібні `POSTGRES_PASSWORD` і `JWT_SECRET` (мінімум 32 символи). Демопароль задає `DEMO_SEED_PASSWORD`; якщо змінної немає, пароль генерується й виводиться під час `docker compose exec backend python -m app.seed`.

У демо-режимі цей сценарій автоматично проходить у Chrome (`e2e/run.py`) і в модульних тестах (`npm test`).
