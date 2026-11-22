# EasyWay — веб-клієнт

Клієнтська частина платформи керованого обміну даними про міський транспорт.
Задача **EZW-48 «Каркас клієнта і екран входу»** (П5 Хмара Владислав, Frontend / UX, тиждень 1).

Макети (EZW-33): https://www.figma.com/design/aqaGUoEIyp1rjWfN42P1in

## Що вже працює

- **Каркас застосунку:** React 18 + TypeScript + Vite, маршрутизація (React Router), бічне меню й верхня панель за макетом.
- **Екран входу:** валідація полів, показ/приховування пароля, попередження про Caps Lock, «Запам’ятати мене», повідомлення про невірний пароль, стан завантаження, адаптивність (до 390 px).
- **Сесія:** JWT-токен, автоматичний вихід після закінчення строку (30 хв), відновлення сесії після перезавантаження сторінки (`GET /auth/me`).
- **Ролі (RBAC на клієнті):** меню показує лише дозволені розділи. Якщо відкрити чужий розділ за прямою адресою, з’являється сторінка 403.
- **Демо-режим:** без бекенду, з чотирма демо-ролями. Перемикається однією змінною середовища.
- **Дизайн-токени** в `src/styles/tokens.css` — ті самі кольори, шрифти й радіуси, що в Figma.
- **Тести:** 15 тестів (Vitest + Testing Library): валідація, RBAC, демо-API, вхід, 403, вихід.

Екрани тижня 2 (мапа, обмін, згоди, панель перевізника, аудит) уже мають маршрути, пункти меню й перевірку ролі. Їхній інтерфейс з’явиться у задачах EZW-49…EZW-53.

## Запуск

Потрібен Node.js 18+.

```bash
npm install
cp .env.example .env      # за замовчуванням увімкнено демо-режим
npm run dev               # http://localhost:5173
```

Інші команди: `npm test` (тести), `npm run build` (збірка в `dist/`), `npm run preview` (перегляд збірки).

### Демо-доступ (VITE_USE_MOCK=true)

Пароль для всіх: `easyway2026`. На екрані входу можна просто натиснути картку ролі.

| Роль | Email | Після входу | Бачить у меню |
|---|---|---|---|
| Перевізник | o.boiko@easyway.lviv.ua | Подання даних | Мапа, Згоди, Подання даних |
| Споживач даних | i.melnyk@easyway.lviv.ua | Обмін даними | Мапа, Обмін даними |
| Адміністратор даних | m.hnatyshyn@easyway.lviv.ua | Обмін даними | Мапа, Обмін, Згоди, Аудит |
| Аудитор | a.tkach@easyway.lviv.ua | Журнал аудиту | Мапа, Журнал аудиту |

Ролі й доступи задано в одному файлі: `src/config/roles.ts`. Їх треба звірити з матрицею доступу П3 (EZW-26).

## Підключення до бекенду (для П4)

У `.env` задайте `VITE_USE_MOCK=false` і `VITE_API_URL=http://localhost:8000/api`. Клієнт очікує такий контракт:

```http
POST /auth/login
Content-Type: application/json

{ "email": "i.melnyk@easyway.lviv.ua", "password": "…" }
```

```json
200 OK
{
  "access_token": "<JWT>",
  "token_type": "bearer",
  "expires_in": 1800,
  "user": { "id": "…", "email": "…", "full_name": "Ірина Мельник",
            "role": "consumer", "organization": "Департамент мобільності" }
}
```

- `401` → `{ "detail": "Невірна електронна пошта або пароль." }`: текст `detail` показується користувачеві.
- `GET /auth/me` з заголовком `Authorization: Bearer <JWT>` → об’єкт `user`.
- `role` — одне зі значень `carrier | consumer | admin | auditor`.

Якщо бекенд на FastAPI приймає форму `OAuth2PasswordRequestForm` (`username`/`password`), змінити треба лише функцію `login` у `src/api/auth.ts`. Там є коментар.

CORS: дозвольте на бекенді джерело `http://localhost:5173`.

## Структура

```
src/
  api/          http-клієнт, авторизація, демо-API, типи
  auth/         AuthContext (сесія), RequireAuth (захист маршрутів), валідація, сховище
  config/       ролі, меню, домашні сторінки ролей, доступи
  components/
    ui/         Button, TextField, Badge, Checkbox, Logo, Avatar (= компоненти Figma)
    layout/     AppLayout (Sidebar + Topbar), PageHeader
  pages/        LoginPage, ScreenPlaceholder, ForbiddenPage (403), NotFoundPage
  styles/       tokens.css (дизайн-токени), base.css
  test/         тести
```

## Відповідність макетам

| Макет у Figma | Код |
|---|---|
| 01 — Вхід (EZW-48) | `pages/LoginPage.tsx` |
| 02–06 — робочі екрани | маршрути `/map`, `/exchange`, `/consents`, `/carrier`, `/audit` (каркас) |
| 07 — Доступ заборонено | `pages/ForbiddenPage.tsx` |
| App/Sidebar, App/Topbar | `components/layout/AppLayout.tsx` |
| Button, Input, Badge, Checkbox, Logo, Avatar | `components/ui/index.tsx` |
| Змінні «EasyWay Colors», текстові стилі | `styles/tokens.css`, `styles/base.css` |
