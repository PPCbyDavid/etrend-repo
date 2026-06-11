# Heti Étrend-tervező

Családi heti étrend-tervező webapp (David és Dorina profilokkal). Makró célok: ~2100 kcal, 150-200 g fehérje. Az adatforrás egy Google Sheet, a heti tervek a böngésző localStorage-ében tárolódnak felhasználónként.

A projekt eredetileg Google AI Studio-ban készült, ezért a kódban maradhatnak AI Studio-specifikus részek. Éles környezet: Vercel.

## Architektúra

- **Frontend:** Vite + React 19 + Tailwind 4, belépési pont: `src/main.tsx`, fő komponens: `src/App.tsx`
- **Backend:** Express szerver egyetlen fájlban: `server.ts`. Vercelen az `api/index.ts` exportálja serverless függvényként.
- **Routing Vercelen:** a `vercel.json` rewrite szabályai irányítják a `/api/*` kéréseket az Express apphoz, minden mást az `index.html`-hez. A rewrite destination `/api` legyen, SOHA ne `/api/index.ts` (kiterjesztéssel nem működik, HTML-t ad vissza JSON helyett).
- **Adatforrás:** publikus Google Sheet, ID: `1fhU-3_IGvXO1ELh04KLNy1g_nVvM5Ww1EYU7s8YyOuo`. Lekérés a gviz végponttal, lapnév alapján:
  `https://docs.google.com/spreadsheets/d/[ID]/gviz/tq?tqx=out:csv&sheet=[lapnév]`
  Lapok: `Alapanyagok`, `Beállítások`, `Recept összesítő`, `Receptek`, `Recept részletek`
- **AI generálás:** `@google/genai` SDK, `POST /api/generate-outline` hívja a Gemini API-t. A kulcs a `GEMINI_API_KEY` env változóból jön.
- **Algoritmikus tervező:** `src/generator.ts` (`solveWeeklyPlan`), ez nem AI, determinisztikus solver.

## Vercel-specifikus szabályok (FONTOS)

1. A Vercel serverless: nincs folyamatosan futó szerver. A fájlrendszer read-only, kivéve a `/tmp` könyvtárat. Minden fájlírás (local_*.json, cost_tracker.json) Vercelen a `/tmp`-be menjen, és számolj azzal, hogy a `/tmp` tartalma cold startnál elveszik. A tartós mentés a kliensoldali localStorage.
2. A `process.env.VERCEL` változóból detektáljuk a Vercel környezetet (`isVercel`).
3. A `vite` csomagot SOHA ne importáld statikusan a `server.ts`-ben, csak dinamikusan (`await import`), és csak ha nem Vercelen fut. Különben a Vercel megpróbálja bebundle-ölni és összeomlik a függvény.
4. Env változók (pl. `GEMINI_API_KEY`) a Vercel dashboardon vannak beállítva (Settings → Environment Variables). Módosítás után redeploy kell.
5. A Vercel ingyenes csomagon a függvény alapértelmezett futási limitje rövid. A Gemini-generálás lassú lehet, ezért a `vercel.json`-ban a maxDuration legyen megemelve.
6. A Gemini klienst lazy módon inicializáld (a handler belsejében), hogy hiányzó API kulcs esetén csak a generálás végpont adjon hibát, ne az egész API.

## Lokális fejlesztés és tesztelés

```bash
npm install
npm run dev          # tsx server.ts, Express + Vite middleware, http://localhost:3000
```

Gyors API-tesztek:
```bash
curl -s http://localhost:3000/api/sheet-data | head -c 500   # élő sheet adat jön-e
curl -s http://localhost:3000/api/cost
```

Ha a sheet-data `isDemoMode: true`-t ad vissza, a Google Sheet lekérés bukott el, és a beépített demó adatok jönnek. Ilyenkor először a gviz URL-t teszteld közvetlenül curl-lel.

Lint/típusellenőrzés: `npm run lint` (tsc --noEmit). Minden változtatás után futtasd le.

## Deploy

GitHub push a `main` branchre → a Vercel automatikusan buildel és deployol. Repo: github.com/PPCbyDavid/etrend-repo

A Vercel dashboardhoz Claude Code nem fér hozzá. Ha env változót, redeploy-t vagy beállítást kell módosítani a dashboardon, írd le pontosan a lépéseket Davidnek, és ő megcsinálja.

## Kommunikáció

- Válaszolj magyarul.
- Minden javítás előtt röviden írd le, mi a hiba oka és mit fogsz változtatni.
- Lokálisan teszteld a változtatást, mielőtt commitot javasolsz.
- Commit üzenetek angolul, tömören.
