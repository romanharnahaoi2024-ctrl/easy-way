# Що клієнт очікує від API (EZW-54)

Клієнт перемикається на справжній сервер однією змінною: у `.env` задайте `VITE_USE_MOCK=false` і `VITE_API_URL=http://localhost:8000/api`.
Усі виклики зібрано в `src/api/auth.ts` і `src/api/data.ts`. Якщо бекенд зробить інакше, змінювати треба лише ці два файли.

Нижче описано, що клієнт надсилає й що очікує у відповідь. Поля й коди взято з ER-моделі (розділ 4.4), діаграми класів і діаграми послідовності UC-06 (розділи 4.5–4.6), NFR-02…NFR-05 і демо-сценарію `docs/demo/DEMO_SCRIPT.md`.

Усі запити, крім входу, йдуть із заголовком `Authorization: Bearer <JWT>`. Без нього сервер має відповідати `401`.

## Помилки

Помилки обміну приходять у форматі FastAPI з додатковими полями:

```json
{ "detail": "Немає чинної згоди на обробку цього набору.", "reason_code": "NO_CONSENT", "request_id": "req_0139" }
```

| Код | reason_code | Коли |
|---|---|---|
| 401 | `UNAUTHENTICATED` | немає токена або він недійсний |
| 403 | `NO_PERMISSION` | роль не має права на дію з набором (dataset_permissions) |
| 403 | `NO_CONSENT` | набір вимагає згоди (`requires_consent`), а чинної згоди немає |
| 422 | `INVALID_DATA` | дані не пройшли JSON Schema; додатково `errors: [{ row, path, message }]` |

Клієнт показує `detail` користувачеві, а `reason_code` використовує, щоб позначити на шкалі крок, на якому запит зупинився.

## Автентифікація (UC-01)

| Метод | Шлях | Тіло | Відповідь |
|---|---|---|---|
| POST | `/auth/login` | `{ email, password }` | `{ access_token, token_type: "bearer", expires_in, user }` |
| GET | `/auth/me` | — | `user = { id, email, full_name, role, organization }` |

`role` приймає одне зі значень `carrier | consumer | admin | auditor`. Значення `consumer` використане в `demo_data.json`.

## Мапа (UC-02, NFR-01, NFR-02)

| Метод | Шлях | Відповідь |
|---|---|---|
| GET | `/routes` | `[{ code, direction, name, mode?, stops: [{ id, name, lat, lon, order }] }]` |
| GET | `/vehicles/positions` | `[{ fleet_code, route_code, lat, lon, observed_at, low_floor? }]` — остання позиція кожного засобу |

- `observed_at` надсилається в ISO 8601 з часовим поясом. Клієнт опитує сервер кожні 10 с і позначає позицію як застарілу, якщо вона старша за 30 с.
- `mode` (`tram | trolleybus | bus`) — необов’язкове поле. Якщо його немає, клієнт визначає вид транспорту за кодом маршруту.

## Набори даних і керований обмін (UC-06)

| Метод | Шлях | Тіло | Відповідь |
|---|---|---|---|
| GET | `/datasets` | — | `[{ code, kind, schema_version, requires_consent, title?, classification?, owner?, description? }]` |
| POST | `/exchange/requests` | `{ dataset_code, action: "read", purpose, period_from?, period_to? }` | 200 `{ request_id, state: "approved", dataset_code, records, total, masked_fields }` · 403 · 422 |
| GET | `/exchange/requests?mine=true` | — | `[{ request_id, dataset_code, action, state, reason_code, created_at, finished_at?, purpose? }]` |

- `classification` приймає значення `public | internal | confidential | restricted` (у клієнті «Публічні», «Внутрішні», «Конфіденційні», «Обмежені»).
- `state` приймає значення `pending | approved | denied | invalid`.

Клієнт показує 7 кроків так, як вони описані в діаграмі послідовності:

1. Подати запит.
2. Зареєструвати запит (`request_id`).
3. Перевірити роль.
4. Перевірити згоду.
5. Перевірити якість (JSON Schema).
6. Зафіксувати статус і подію аудиту.
7. Відповісти: 200, 403 або 422.

## Згода (UC-03, UC-04)

| Метод | Шлях | Тіло | Відповідь |
|---|---|---|---|
| GET | `/consents` | — | згоди поточного користувача: `[{ id, user_email, dataset_code, granted_at, valid_until, revoked_at }]` |
| GET | `/consents?all=true` | — | усі згоди (лише `admin`) |
| POST | `/consents` | `{ dataset_code, valid_until }` | 201, створена згода |
| POST | `/consents/{id}/revoke` | — | 200, згода з заповненим `revoked_at` |

## Подання даних перевізником (UC-05, NFR-05)

| Метод | Шлях | Тіло | Відповідь |
|---|---|---|---|
| POST | `/datasets/{code}/submissions?file_name=…` | JSON-масив записів | 201 `{ submission_id, dataset_code, file_name, records, valid_ratio, state, created_at, request_id }` · 422 з `errors` |
| GET | `/submissions` | — | історія подань |

Клієнт перед надсиланням перевіряє файл тими самими JSON Schema (`src/api/schemas.ts`). Для GPS діють такі обмеження: `lat` від −90 до 90, `lon` від −180 до 180, `observed_at` у форматі date-time. Остаточне рішення завжди за сервером.

## Журнал аудиту (UC-07, NFR-04)

| Метод | Шлях | Параметри | Відповідь |
|---|---|---|---|
| GET | `/audit/events` | `from, to, role, outcome, dataset, q` | `[{ id, request_id, occurred_at, user_email, role, action, dataset_code, outcome, reason_code, details?, hash?, prev_hash? }]` |

- `outcome` приймає значення `approved | denied | invalid | info`.
- `hash` і `prev_hash` необов’язкові. Якщо сервер їх надсилає, клієнт перевіряє, чи ланцюжок цілісний.
- Експорт CSV формує клієнт із поточної вибірки.

## Як перевірити наскрізний сценарій

Сценарій повторює `docs/demo/DEMO_SCRIPT.md`:

1. Увійдіть як споживач. Мапа має показати маршрути й транспорт із часом позиції.
2. Розділ «Обмін даними» → набір `gps-demo` → очікується 200, `request_id`, замасковані дані.
3. Розділ «Згоди» → відкличте згоду → поверніться до запиту → очікується 403 і зупинка на кроці 4.
4. Увійдіть як перевізник → кнопка «GPS-файл з помилкою (lat = 95)» → надіслати → очікується 422.
5. Увійдіть як аудитор → журнал має показувати всі події з `request_id` і причинами.
6. Як споживач відкрийте `/audit` → має з’явитися сторінка 403.

У демо-режимі цей сценарій автоматично проходить у Chrome (скрипт `e2e/run.py`) і в модульних тестах (`npm test`).
