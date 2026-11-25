"""Наскрізний прогін (EZW-54) і скріншоти для звіту (EZW-74).

Запуск: npm run build && npx vite preview --port 4173, потім
  pip install playwright && python e2e/run.py [шлях до Chrome]
Скрипт проходить сценарій ../docs/API_CONTRACT.md і зберігає скріншоти в e2e/screenshots.
"""
import asyncio, json
from playwright.async_api import async_playwright
B='http://localhost:4173'; import sys, os
O=os.path.join(os.path.dirname(__file__), 'screenshots')
CHROME=sys.argv[1] if len(sys.argv)>1 else None
CAP=[]
async def shot(pg, name, caption, full=False):
    await pg.evaluate('window.scrollTo(0,0)')
    if full:
        h = await pg.evaluate('Math.max(900, document.documentElement.scrollHeight)')
        await pg.set_viewport_size({'width':1440,'height':h}); await pg.wait_for_timeout(300)
    await pg.screenshot(path=f'{O}/{name}.png'); CAP.append((name, caption))
    if full: await pg.set_viewport_size({'width':1440,'height':900})
async def login(pg, role):
    await pg.goto(B+'/login'); await pg.wait_for_selector('text=Вхід до EasyWay')
    await pg.click(f'button.role-card:has-text("{role}")'); await pg.click('button[type=submit]'); await pg.wait_for_selector('main h1')
async def logout(pg):
    await pg.click('button[aria-label="Вийти з системи"]'); await pg.wait_for_selector('text=Вхід до EasyWay')
async def main():
    import os; os.makedirs(O, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, args=['--lang=uk-UA'])
        ctx = await b.new_context(viewport={'width':1440,'height':900}, locale='uk-UA', timezone_id='Europe/Kyiv', device_scale_factor=1.5)
        pg = await ctx.new_page()
        await pg.add_init_script("document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='.map-alert--muted{display:none!important}';document.head.appendChild(s)})")
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(B+'/login'); await pg.wait_for_selector('text=Вхід до EasyWay'); await pg.wait_for_timeout(500)
        await shot(pg,'01-vhid','Екран входу з демо-доступом за роллю (EZW-48)')
        await login(pg,'Споживач'); await pg.wait_for_selector('.veh'); await pg.wait_for_timeout(1500)
        await shot(pg,'02-mapa','Мапа транспорту: маршрути, зупинки, транспорт у реальному часі, застаріла позиція (EZW-49)')
        await pg.click('.veh:has-text("1124")'); await pg.wait_for_selector('.veh-card'); await pg.wait_for_timeout(400)
        await shot(pg,'03-mapa-transport','Деталі транспортного засобу: час спостереження, найближча зупинка, низькопідлоговість (EZW-49)')
        await pg.click('a:has-text("Обмін даними")'); await pg.wait_for_selector('button:has-text("Надіслати запит"):not([disabled])')
        await pg.click('button:has-text("Надіслати запит")'); await pg.wait_for_selector('h2:has-text("Дані видано")'); await pg.wait_for_timeout(300)
        await shot(pg,'04-obmin-200','Керований обмін: усі 7 кроків пройдено, дані видано з маскуванням, HTTP 200 (EZW-50)', True)
        await pg.click('a:has-text("Згоди")'); await pg.wait_for_selector('text=Набори, що потребують'); await pg.wait_for_timeout(300)
        await shot(pg,'05-zgody','Керування згодою споживача: активна згода й набір без згоди (EZW-51)')
        await pg.click('article:has-text("GPS-позиції") button:has-text("Відкликати")'); await pg.wait_for_selector('role=dialog'); await pg.wait_for_timeout(200)
        await shot(pg,'06-vidklykannia','Підтвердження відкликання згоди (UC-04)')
        await pg.click('role=dialog >> button:has-text("Відкликати")'); await pg.wait_for_selector('article:has-text("GPS-позиції") >> text=Відкликана')
        await pg.click('a:has-text("Обмін даними")'); await pg.wait_for_selector('button:has-text("Надіслати запит"):not([disabled])')
        await pg.click('button:has-text("Надіслати запит")'); await pg.wait_for_selector('h2:has-text("Запит відхилено")'); await pg.wait_for_timeout(300)
        await shot(pg,'07-obmin-403','Негативний сценарій «без згоди»: зупинка на кроці 4, HTTP 403, подію записано в аудит (EZW-50)', True)
        await pg.goto(B+'/audit'); await pg.wait_for_selector('text=немає прав'); await pg.wait_for_timeout(300)
        await shot(pg,'08-dostup-zaboroneno','Негативний сценарій «без прав»: споживач відкриває журнал аудиту (сторінка 403)')
        await logout(pg)
        await login(pg,'Перевізник'); await pg.wait_for_selector('text=Нове подання')
        await pg.click('button:has-text("GPS-файл з помилкою")'); await pg.wait_for_timeout(200)
        await pg.click('button:has-text("Надіслати на сервер")'); await pg.wait_for_selector('text=HTTP 422'); await pg.wait_for_timeout(500)
        await shot(pg,'09-pereviznyk-422','Панель перевізника: файл з lat = 95 не пройшов JSON Schema, HTTP 422 (EZW-52)', True)
        await logout(pg)
        await login(pg,'Аудитор'); await pg.wait_for_selector('table'); await pg.wait_for_timeout(300)
        await pg.click('tr.au-row-denied >> nth=0'); await pg.wait_for_timeout(300)
        await shot(pg,'10-audyt','Журнал аудиту: фільтри, деталі відмови з request_id і контрольною сумою (EZW-53)', True)
        json.dump(CAP, open(f'{O}/captions.json','w'), ensure_ascii=False, indent=1)
        print('Помилки сторінки:', errs or 'немає'); print('Наскрізний сценарій пройдено.')
        await b.close()
asyncio.run(main())
