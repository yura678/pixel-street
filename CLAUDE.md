# Pixel Street — інструкції для Claude Code

Нескінченна процедурна піксельна вулиця на чистому Three.js (WebGPU + TSL). Стан і ключові рішення — у `PROJECT_STATUS.md`, загальний план і перевірка — у `IMPLEMENTATION_PLAN.md`, будинки (принципи, правила, як додати будинок, пастки) — у `REDESIGN_PLAN.md`, дорога, тротуари й дерева — у `STREETSCAPE_PLAN.md`.

@PROJECT_STATUS.md

## 0. Продовження роботи у новій сесії

- Стан проєкту вже імпортовано вище (`PROJECT_STATUS.md`). Плани відкривай лише тоді, коли береш наступний етап або будинок.
- Стек і план уже погоджені з користувачем: не перепитуй про стек чи архітектуру.
- На «продовжуй», «що далі», «реалізуй наступне» — переходь до першого пункту розділу «Наступні кроки» у `PROJECT_STATUS.md`.
- Після завершення значного етапу оновлюй `PROJECT_STATUS.md`: стан, ключові рішення, цифри, відкрите й наступні кроки — стисло, без журналу змін (історія — у git).

## 1. Стек (суворо)

- **Тільки Vanilla Three.js.** Заборонено React, React Three Fiber, `@react-three/*`.
- Рендерер: `three/webgpu` (`WebGPURenderer`), шейдери — TSL (`three/tsl`). Запасного WebGL-режиму немає: без WebGPU показується `UnsupportedScreen`.
- Допоміжні бібліотеки: `lil-gui`, Vite.
- Чистий JavaScript (ES2022, ES modules), без TypeScript; типи — через JSDoc.
- Вся графіка процедурна: low-poly геометрія + піксельні текстури з `<canvas>`.

## 2. Архітектура

- `src/core/` та `src/simulation/` **не імпортують `three`** і тестуються автономно (Vitest).
- Конфіг і параметри живуть у `src/config/`; `params.schema.js` — єдине джерело істини для Forge (`lil-gui`).
- Системи наслідують `System` (готова після конструктора → `update` / `dispose`); ресурси реєструй через `track()`.
- Світ викривлюється через `material.positionNode` (`src/rendering/tsl/curve.js`) — нові матеріали мають його підтримувати.
- Завжди звільняй (`dispose`) геометрії, матеріали й текстури; для повторюваних об'єктів — `InstancedMesh`.

## 3. Команди

```
npm run dev      # dev-сервер Vite
npm run build    # production-збірка
npm test         # Vitest (зараз 392 тести)
npm run lint     # ESLint (має бути 0 помилок)
npm run format   # Prettier
npm run audit    # аудит вулиці → docs/STREET_AUDIT_GENERATED.md + docs/STREET_ELEVATION.svg (scripts/audit-street.js)
npm run shots    # знімки будинків зі специфікаціями → shots/ (scripts/shots.js; --only, --chunk, --views, --webgl, --parts, --cam, --query, --tour, --water, --bounds)
npm run geometry # геометрія без браузера (scripts/geometry.js): snapshot <name> (чанки, профіль вулиці, асфальт) | compare <a> <b> | tris | atlas | overlaps [--chunk=N --min=см² --gap=мм] (z-fighting: накладені грані в одній площині з джерелом кожної)
npm run perf     # час кадру в headless Chrome (scripts/perf.js): медіана, p95, зависання, CPU систем; --cases=standing,driving,noShadows,noNear,noWater,noStreet,downpour,noFx,auto --stages (ціна кожного проходу кадру: msaa0, nobloom, nograde, nopost, nofog, flat, hide<Частина>, bare; у застосунку — `?bench=`) --size=1600x900 --seconds=8 --gpu=high --vsync (усі випадки, крім auto, з render.autoQuality=false)
```

Перед тим як вважати задачу завершеною: `npm test`, `npm run lint`, `npm run build` мають проходити.

## 4. Розподіл ролей (адаптовано з Antigravity)

Раніше ролі були «Opus + Flash-субагент». У Claude Code це:

- **Головний агент (ти)** — вся складна 3D-робота: TSL-шейдери, математика (Matrix4/Quaternion/Vector3, BVH), архітектура графа сцени, `BufferGeometry`, оптимізація draw calls і пам'яті, постпроцесинг.
- **Субагент `routine-worker`** (`.claude/agents/routine-worker.md`, модель Haiku) — рутина: запуск `npm run dev/build/test/lint/format`, збір логів помилок Vite/Rollup, пошук файлів і асетів, механічні правки (шляхи імпортів, залежності в `package.json`, стиль коду).

### Автоматичне делегування

1. Коли треба перевірити збірку, прогнати тести/лінтер, знайти файл чи асет — викликай субагента `routine-worker` через інструмент `Agent` (`subagent_type: "routine-worker"`), не питаючи користувача.
2. У промпті вказуй конкретну дію та бажаний формат звіту (наприклад: «запусти `npm test`, поверни кількість тестів, що впали, і текст перших помилок»).
3. Субагент повертає короткий звіт. Якщо проблема в шейдері чи логіці Three.js — розбираєшся сама/сам головний агент.
4. Для невеликих разових команд (одна швидка перевірка) можна виконати їх напряму — делегування має економити контекст, а не створювати накладні витрати.

## 5. Стиль роботи

- Відповідай користувачеві українською; код, імена файлів та коментарі в коді — як у поточному проєкті.
- Перед правкою читай файл; зміни роби мінімальні та в стилі наявного коду (`.prettierrc`, `eslint.config.js`).
