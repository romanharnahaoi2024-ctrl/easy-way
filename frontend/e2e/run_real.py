"""EZW-54: наскрізний прогін клієнта зі справжнім сервером EZW-42 і скріншоти для розділу 5 звіту.

Підготовка (див. ../docs/API_CONTRACT.md, розділ 5):
  1. Сервер: docker compose up --build -d; docker compose exec backend python -m app.seed
     (seed безпосередньо перед прогоном, щоб GPS-позиції були свіжі, < 30 с).
  2. Клієнт: VITE_USE_MOCK=false VITE_API_URL=http://localhost:8000 npm run build
     npx vite preview --port 5173 --strictPort   (CORS сервера дозволяє лише :5173)
  3. pip install playwright
     python e2e/run_real.py --password <пароль із seed> [--chrome /шлях/до/chrome]
        [--bad-data-cmd "..."] [--clean-data-cmd "..."]

Сценарій 422 потребує зіпсованого запису в джерелі. CHECK у БД не дає записати lat = 95,
тому для прогону в базу додається GPS-запис борту з порожнім ідентифікатором
(vehicle_id не проходить minLength у gps.schema.json). Команди для цього передаються
параметрами --bad-data-cmd і --clean-data-cmd; без них крок 422 пропускається.

Результат: e2e/screenshots-real/*.png, captions.json і report.json
(request_id, HTTP-код і причина кожного запиту та відповідний запис журналу аудиту).
"""
import argparse, asyncio, json, os, re, subprocess, urllib.request
from playwright.async_api import async_playwright

ap = argparse.ArgumentParser()
ap.add_argument('--password', required=True)
ap.add_argument('--chrome')
ap.add_argument('--client', default='http://localhost:5173')
ap.add_argument('--api', default='http://localhost:8000')
ap.add_argument('--bad-data-cmd')
ap.add_argument('--clean-data-cmd')
A = ap.parse_args()

B = A.client
O = os.path.join(os.path.dirname(__file__), 'screenshots-real')
CONSUMER = 'i.melnyk@easyway.lviv.ua'
NO_CONSENT = 'demo.no-consent@easyway.lviv.ua'
CARRIER = 'demo.carrier@easyway.lviv.ua'
AUDITOR = 'demo.auditor@easyway.lviv.ua'
CAP, RUNS = [], []


def api(path, token=None, body=None, method=None):
    req = urllib.request.Request(A.api + path, data=json.dumps(body).encode() if body is not None else None, method=method)
    req.add_header('Content-Type', 'application/json')
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b'null')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'null')


def token_of(email):
    st, body = api('/auth/login', body={'email': email, 'password': A.password})
    assert st == 200, f'вхід {email}: HTTP {st} {body}'
    return body['access_token']


async def shot(pg, name, caption, full=False):
    await pg.evaluate('window.scrollTo(0,0)')
    if full:
        h = await pg.evaluate('Math.max(900, document.documentElement.scrollHeight)')
        await pg.set_viewport_size({'width': 1440, 'height': h}); await pg.wait_for_timeout(300)
    await pg.screenshot(path=f'{O}/{name}.png'); CAP.append((name, caption))
    if full:
        await pg.set_viewport_size({'width': 1440, 'height': 900})


async def login(pg, email):
    await pg.goto(B + '/login'); await pg.wait_for_selector('text=Вхід до EasyWay')
    await pg.fill('input[type=email]', email); await pg.fill('input[type=password]', A.password)
    await pg.click('button[type=submit]'); await pg.wait_for_selector('main h1')


async def logout(pg):
    await pg.click('button[aria-label="Вийти з системи"]'); await pg.wait_for_selector('text=Вхід до EasyWay')


async def exchange(pg, who, expect_title):
    await pg.click('a:has-text("Обмін даними")'); await pg.wait_for_selector('button:has-text("Надіслати запит"):not([disabled])')
    await pg.click('button:has-text("Надіслати запит")'); await pg.wait_for_selector(f'h2:has-text("{expect_title}")'); await pg.wait_for_timeout(2200)
    card = pg.locator('section[aria-labelledby="result-t"]')
    http = re.search(r'HTTP (\d+|—)', await card.inner_text()).group(1)
    rid = (await card.locator('dt:has-text("request_id") + dd').inner_text()).strip()
    reason = (await card.locator('dt:has-text("Причина") + dd').inner_text()).strip()
    RUNS.append({'user': who, 'request_id': rid, 'http': http, 'reason_ui': reason})
    return rid


async def main():
    os.makedirs(O, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=A.chrome, args=['--lang=uk-UA'])
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900}, locale='uk-UA', timezone_id='Europe/Kyiv', device_scale_factor=1.5)
        pg = await ctx.new_page()
        await pg.add_init_script("document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='.map-alert--muted{display:none!important}';document.head.appendChild(s)})")
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        api_calls = []
        pg.on('response', lambda r: api_calls.append((r.status, r.request.method, r.url.replace(A.api, ''))) if r.url.startswith(A.api) else None)

        await pg.goto(B + '/login'); await pg.wait_for_selector('text=Вхід до EasyWay'); await pg.wait_for_timeout(400)
        await shot(pg, '01-vhid', 'Екран входу в режимі справжнього сервера: демо-картки й пароль у збірку не потрапляють (VITE_USE_MOCK=false)')

        # 1. Споживач зі згодою: мапа з даними сервера й обмін 200
        await login(pg, CONSUMER)
        await pg.wait_for_selector('.veh'); await pg.wait_for_timeout(1500)
        await shot(pg, '02-mapa', 'Мапа: маршрут і остання GPS-позиція з GET /routes і GET /positions/latest; ім’я користувача сервер ще не віддає, тому показано email')
        rid_ok = await exchange(pg, CONSUMER, 'Дані видано')
        await shot(pg, '03-obmin-200', 'POST /exchange/requests: усі 7 кроків пройдено, дані видано, HTTP 200, request_id від сервера', True)

        # 2. Відкликання згоди → 403 CONSENT_REVOKED
        await pg.click('a:has-text("Згоди")'); await pg.wait_for_selector('text=Набори, що потребують'); await pg.wait_for_timeout(400)
        await shot(pg, '04-zgody', 'Згоди: чинна згода користувача з GET /consents')
        await pg.click('article:has-text("GPS-позиції") button:has-text("Відкликати")'); await pg.wait_for_selector('role=dialog')
        await pg.click('role=dialog >> button:has-text("Відкликати")'); await pg.wait_for_selector('article:has-text("GPS-позиції") >> text=Відкликана')
        rid_revoked = await exchange(pg, CONSUMER, 'Запит відхилено')
        await shot(pg, '05-obmin-403-zgodu-vidklykano', 'Після DELETE /consents/{id}: зупинка на кроці 4 «Перевірити згоду», HTTP 403, CONSENT_REVOKED', True)

        # повертаємо згоду для кроку 422
        await pg.click('a:has-text("Згоди")'); await pg.wait_for_selector('text=Набори, що потребують')
        await pg.click('article:has-text("GPS-позиції") button:has-text("Надати згоду")'); await pg.wait_for_selector('role=dialog')
        await pg.check('role=dialog >> input[type=checkbox]')
        await pg.click('role=dialog >> button:has-text("Надати згоду")'); await pg.wait_for_selector('text=надано до'); await pg.wait_for_timeout(400)
        await shot(pg, '06-zgodu-nadano', 'POST /consents: згоду надано знову (дата завершення передається з часовим поясом)')

        # 3. 422: зіпсований запис у джерелі
        rid_422 = None
        if A.bad_data_cmd:
            subprocess.run(A.bad_data_cmd, shell=True, check=True)
            try:
                rid_422 = await exchange(pg, CONSUMER, 'Дані не видано')
                await shot(pg, '07-obmin-422', 'Дані з джерела не пройшли JSON Schema: зупинка на кроці 5, HTTP 422, VALIDATION_FAILED, помилки без сирих значень', True)
            finally:
                if A.clean_data_cmd:
                    subprocess.run(A.clean_data_cmd, shell=True, check=True)

        # 4. /audit для споживача → сторінка 403
        await pg.goto(B + '/audit'); await pg.wait_for_selector('text=немає прав'); await pg.wait_for_timeout(300)
        await shot(pg, '08-dostup-zaboroneno', 'Споживач відкриває журнал аудиту: сторінка «немає прав» (роль не має доступу до /audit)')
        await logout(pg)

        # 5. Споживач без згоди → 403 NO_CONSENT
        await login(pg, NO_CONSENT)
        rid_noconsent = await exchange(pg, NO_CONSENT, 'Запит відхилено')
        await shot(pg, '09-obmin-403-bez-zgody', 'Споживач без згоди: зупинка на кроці 4, HTTP 403, NO_CONSENT', True)
        await logout(pg)

        # 6. Перевізник без права на gps-demo → 403 NO_ROLE_PERMISSION
        await login(pg, CARRIER)
        rid_noperm = await exchange(pg, CARRIER, 'Запит відхилено')
        await shot(pg, '10-obmin-403-bez-prava', 'Перевізник без права читати gps-demo: зупинка на кроці 3, HTTP 403, NO_ROLE_PERMISSION', True)
        await logout(pg)

        # 7. Аудитор: журнал з тими самими request_id
        await login(pg, AUDITOR)
        await pg.wait_for_selector('table'); await pg.wait_for_timeout(500)
        if await pg.locator('tr.au-row-denied').count():
            await pg.click('tr.au-row-denied >> nth=0'); await pg.wait_for_timeout(300)
        await shot(pg, '11-audyt', 'Аудитор: GET /audit, події з тими самими request_id і причинами, що й відповіді на запити', True)
        await b.close()

    # Звірка відповідей і журналу аудиту через API
    st, events = api('/audit', token_of(AUDITOR))
    assert st == 200, f'/audit: HTTP {st}'
    by_rid = {}
    for e in events:
        if e.get('request_id') is not None:
            by_rid.setdefault(str(e['request_id']), []).append(e)
    expected = {rid_ok: ('approved', 'OK'), rid_revoked: ('denied', 'CONSENT_REVOKED'), rid_noconsent: ('denied', 'NO_CONSENT'), rid_noperm: ('denied', 'NO_ROLE_PERMISSION')}
    if rid_422:
        expected[rid_422] = ('invalid', 'VALIDATION_FAILED')
    problems = []
    for run in RUNS:
        ev = by_rid.get(run['request_id'], [])
        run['audit'] = [{'outcome': e['outcome'], 'reason_code': e['reason_code']} for e in ev]
        want = expected.get(run['request_id'])
        if not want or not any((e['outcome'], e['reason_code']) == want for e in ev):
            problems.append(f"request_id {run['request_id']}: очікувалось {want}, в аудиті {run['audit']}")
    report = {'runs': RUNS, 'page_errors': errs, 'api_errors_5xx': [c for c in api_calls if c[0] >= 500], 'problems': problems}
    json.dump(CAP, open(f'{O}/captions.json', 'w'), ensure_ascii=False, indent=1)
    json.dump(report, open(f'{O}/report.json', 'w'), ensure_ascii=False, indent=1)
    for r in RUNS:
        print(f"request_id {r['request_id']:>4} · HTTP {r['http']:>3} · {r['reason_ui']} · аудит: {r['audit']}")
    print('Помилки сторінки:', errs or 'немає')
    print('Відповіді 5xx від API:', report['api_errors_5xx'] or 'немає')
    print('Розбіжності з аудитом:', problems or 'немає')
    if errs or problems or report['api_errors_5xx']:
        raise SystemExit(1)
    print('EZW-54: наскрізний сценарій зі справжнім сервером пройдено.')


asyncio.run(main())
