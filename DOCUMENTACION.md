# LLM Chat AI — Documentación del Proyecto

> Última actualización: 30 de marzo de 2026 — Sprint 6  
> Estado: desarrollo activo

---

## Índice

1. [Estructura del proyecto](#1-estructura-del-proyecto)
2. [Variables de entorno](#2-variables-de-entorno)
3. [Base de datos](#3-base-de-datos)
4. [Flujo completo de un mensaje](#4-flujo-completo-de-un-mensaje)
   - 4.1 [Frontend → Backend (envío)](#41-frontend--backend-envío)
   - 4.2 [Backend — pipeline de procesamiento](#42-backend--pipeline-de-procesamiento)
   - 4.3 [Backend → Frontend (respuesta)](#43-backend--frontend-respuesta)
5. [Detalle de cada archivo clave](#5-detalle-de-cada-archivo-clave)
6. [Historial de cambios](#6-historial-de-cambios)
7. [Testing](#7-testing)
8. [CI/CD — GitHub Actions](#8-cicd--github-actions)
9. [Cómo extender el sistema](#9-cómo-extender-el-sistema)
10. [Cómo correr el proyecto](#10-cómo-correr-el-proyecto)

---

## 1. Estructura del proyecto

```
LLM Chat AI business/
├── backend/
│   ├── .env                        Variables de entorno activas
│   ├── .env.example                Plantilla de variables de entorno
│   ├── server.js                   Punto de entrada del servidor
│   └── src/
│       ├── app.js                  Express app (CORS, rutas HTTP)
│       ├── config/
│       │   ├── database.js         Pool de conexión PostgreSQL (pg)
│       │   ├── env.js              Fuente única de variables de entorno
│       │   ├── redis.js            Cliente ioredis singleton (contexto de sesiones)
│       │   └── schema.sql          Esquema completo + seed de la BD
│       ├── middlewares/
│       │   ├── errorHandler.js     Manejador centralizado de errores
│       │   └── requestLogger.js    Logger de peticiones HTTP
│       ├── mockai/
│       │   ├── intents.js          Árbol de intenciones por palabras clave
│       │   └── keywordResponses.js Respuestas hardcodeadas para frases simples
│       ├── models/
│       │   ├── businessModel.js    Queries SQL por intención (horarios, precios…)
│       │   └── messageModel.js     Store en memoria de mensajes del chat
│       ├── routes/
│       │   ├── index.js
│       │   └── messageRoutes.js
│       ├── services/
│       │   ├── businessInfoService.js      Despacha intenciones → BusinessModel
│       │   ├── intentResponseFormatter.js  Convierte filas DB → texto legible
│       │   ├── intentService.js            Detecta intención por palabras clave
│       │   ├── messageService.js           Lógica de guardado/lectura de mensajes
│       │   ├── nlpEntityExtractor.js       NLP: extrae entidades y consulta productos
│       │   └── sessionContextService.js    Contexto de sesión anónima en Redis
│       ├── sockets/
│       │   └── chatSocket.js       Eventos Socket.io + pipeline de respuesta
│       └── temp/
│           └── mockOpenAI.js       Respuesta simulada de OpenAI (placeholder)
│
├── tests/                          Suite de testing (Jest)
│   ├── setup.js                    Variables de entorno para el entorno de pruebas
│   └── unit/
│       ├── intentService.test.js            Tests de detección de intenciones
│       ├── nlpEntityExtractor.test.js       Tests del extractor NLP (DB mockeada)
│       ├── intentResponseFormatter.test.js  Tests de todos los formateadores
│       ├── businessInfoService.test.js      Tests del QUERY_MAP (BusinessModel mockeado)
│       ├── messageModel.test.js             Tests del store en memoria
│       └── keywordResponses.test.js         Tests de respuestas por palabras clave
│
├── .github/
│   └── workflows/
│       └── ci.yml                  Pipeline CI/CD (lint → test matrix → coverage)
│
└── frontend/
    ├── .env                        VITE_SOCKET_URL (generado desde .env.example)
    ├── .env.example                Plantilla para variables de entorno
    ├── vite.config.js              Proxy /socket.io → backend
    └── src/
        ├── App.jsx                 Pantalla de login + enrutamiento
        ├── components/Chat/
        │   ├── ChatWindow.jsx
        │   ├── Message.jsx
        │   ├── MessageInput.jsx    Formulario de envío
        │   └── MessageList.jsx
        ├── context/
        │   └── ChatContext.jsx     Estado global del chat (messages, roomId, username)
        ├── hooks/
        │   └── useSocket.js        Lifecycle del socket + envío de eventos
        └── services/
            └── socketService.js   Singleton de socket.io-client
```

---

## 2. Variables de entorno

### `backend/.env`

```dotenv
NODE_ENV=development
PORT=3000
# Lista de orígenes permitidos separados por comas
CLIENT_URL=http://localhost:5173,http://192.168.1.3:5173

DB_HOST=localhost
DB_PORT=5432
DB_NAME=aichat
DB_USER=postgres
DB_PASSWORD=<tu_password>

# Redis — contexto conversacional temporal
REDIS_HOST=localhost
REDIS_PORT=6379
```

> `CLIENT_URL` acepta múltiples orígenes separados por coma. `env.js` los parsea en un array que CORS y Socket.io consumen directamente.  
> `REDIS_HOST`/`REDIS_PORT` son opcionales: si Redis no está disponible, el sistema degrada elegantemente sin contexto conversacional (el chat sigue funcionando).

### `frontend/.env`

```dotenv
VITE_SOCKET_URL=http://localhost:3000
```

> Esta variable ya no se usa en `socketService.js` (se usa `window.location.origin` en su lugar), pero se mantiene para referencia.

---

## 3. Base de datos

Motor: **PostgreSQL**. Esquema definido en `backend/src/config/schema.sql`.

### Tablas principales

| Tabla                | Descripción |
|----------------------|-------------|
| `businesses`         | Negocios registrados en la plataforma |
| `categories`         | Categorías de productos (auto-referencial para subcategorías) |
| `products`           | Productos de cada negocio con precio y disponibilidad |
| `product_inventory`  | Stock por producto (relación 1-a-1 con products) |
| `product_attributes` | Pares clave/valor flexibles por producto |
| `business_hours`     | Horarios por día de la semana (0=domingo … 6=sábado) |
| `promotions`         | Promociones activas con fecha de inicio/fin |
| `business_services`  | Servicios ofrecidos por el negocio |
| `conversations`      | Sesiones de chat vinculadas a un negocio |
| `messages`           | Mensajes individuales dentro de una conversación |

### Seed incluido

El schema incluye datos de prueba para 3 negocios:

| id | Nombre                  | Tipo        | Ciudad         |
|----|-------------------------|-------------|----------------|
| 1  | Restaurante Don Pepe    | restaurant  | Ciudad de México |
| 2  | Ferretería El Tornillo  | hardware    | Guadalajara    |
| 3  | Papelería La Pluma      | stationery  | Monterrey      |

> El sistema actualmente trabaja con `business_id = 1` (constante `ACTIVE_BUSINESS_ID` en `chatSocket.js`).

---

## 4. Flujo completo de un mensaje

### 4.1 Frontend → Backend (envío)

```
Usuario escribe "cuando abren?"
        │
        ▼
[MessageInput.jsx]
  handleSubmit() → sendMessage(trimmed)
        │
        ▼
[useSocket.js]
  sendMessage(text)
  → socketService.getSocket().emit('send_message', { roomId, sender, text })
        │
        ▼  WebSocket (ws://)
[Vite Proxy — vite.config.js]
  /socket.io  →  http://localhost:3000   (proxy transparente)
  (desde el celular: http://192.168.1.3:5173 → proxy → backend en :3000)
        │
        ▼
[Backend — chatSocket.js]
  socket.on('send_message', handler)
```

**Por qué usa proxy y no URL directa:**  
`socketService.js` conecta a `window.location.origin`. Cuando el navegador abre `http://localhost:5173`, el origen es `localhost:5173`. Cuando el celular abre `http://192.168.1.3:5173`, el origen es `192.168.1.3:5173`. En ambos casos Vite hace el proxy hacia `localhost:3000`, por lo que el backend no necesita ser expuesto directamente.

---

### 4.2 Backend — pipeline de procesamiento con contexto

El evento `send_message` ahora recibe `{ roomId, sender, text, sessionId }`.  
El `sessionId` (UUID generado en el frontend) es la clave de Redis que mantiene el contexto de la conversación.

```
Mensaje recibido: { text: "¿y cuánto cuesta?", sessionId: "a3f2..." }
        │
        ▼ Validar sessionId (string requerido)
        │
        ▼ Guardar mensaje del usuario en memoria + emitir al room
        │
        ├─────────────────────────────────────────────────────────
        │  PASO 1 — getContext(sessionId)  [Redis]
        │
        │  Lee la clave "session:{sessionId}" en Redis.
        │  Devuelve: { lastIntent, lastProduct, lastEntities, updatedAt }
        │  Si la sesión no existe o expiró → todos los campos son null.
        │
        │  Ejemplo: context = { lastIntent: null, lastProduct: "hamburguesa" }
        │
        ├─────────────────────────────────────────────────────────
        │  PASO 2 — Detección dual en el mensaje actual
        │
        │  A) extractProductEntity(normalize(text))
        │     Extrae el nombre de producto del mensaje:
        │       "¿y cuánto cuesta?" → null  (no hay producto nombrado)
        │       "tienen pizza doble?" → "pizza doble"
        │
        │  B) detectIntent(text)
        │     Detecta el tema por palabras clave:
        │       "¿y cuánto cuesta?" → "precios"  (keyword "cuánto cuesta")
        │       "cuando abren?"     → "horarios"
        │
        ├─────────────────────────────────────────────────────────
        │  PASO 3 — Resolución efectiva con fallback de contexto
        │
        │  effectiveProduct = detectedProduct
        │      || (detectedIntent ? context.lastProduct : null)
        │
        │  Para "¿y cuánto cuesta?":
        │    detectedProduct = null
        │    detectedIntent  = "precios"
        │    context.lastProduct = "hamburguesa"
        │    → effectiveProduct = "hamburguesa"  ← heredado del contexto
        │    → effectiveIntent  = "precios"
        │
        ├─────────────────────────────────────────────────────────
        │  PASO 4 — Decisión reglas vs IA
        │
        │  ¿effectiveProduct O effectiveIntent?
        │    SÍ → handleWithRules({ intent, product, businessId })
        │    NO → handleWithAI(text, context)  (fallback)
        │
        │  handleWithRules:
        │    1. Si hay producto → queryProductByEntity(product, businessId)
        │         SELECT … FROM products WHERE name ILIKE '%hamburguesa%'
        │         → formatProductResponse("hamburguesa", rows)
        │    2. Si solo intent → getBusinessInfoByIntent(intent, businessId)
        │         → formatIntentResponse(intent, data)
        │
        │  handleWithAI:
        │    1. getKeywordResponse(text)  → saludos / frases simples
        │    2. getMockOpenAIResponse(text, context)  → respuesta contextual
        │       (en producción: llamada real a OpenAI con historial)
        │
        ├─────────────────────────────────────────────────────────
        │  PASO 5 — updateContext(sessionId, { lastIntent, lastProduct })
        │
        │  Guarda en Redis lo detectado en este turno.
        │  TTL: 210 segundos (3.5 min), renovado con cada mensaje.
        │  Si Redis no está disponible, el chat sigue sin guardar contexto.
        │
        └─────────────────────────────────────────────────────────
```

#### Tabla de ejemplos con contexto

| Turno | Mensaje | detectedProduct | detectedIntent | effectiveProduct | Respuesta |
|-------|---------|-----------------|----------------|------------------|-----------|
| 1 | "tienen hamburguesa doble?" | `hamburguesa doble` | null | `hamburguesa doble` | Tarjeta del producto |
| 2 | "¿y cuánto cuesta?" | null | `precios` | `hamburguesa doble` (contexto) | Precio de hamburguesa doble |
| 3 | "cuando abren?" | null | `horarios` | null | Tabla de horarios completa |
| 4 | "hola" | null | null | null | Respuesta keywordResponses / AI |

### 4.3 Backend → Frontend (respuesta)

```
Backend genera replyText
        │
        ▼
[MessageService.saveMessage({ roomId, sender: 'Bot', text: replyText })]
  → guarda en store en memoria (messageModel.js)
  → devuelve objeto: { id, roomId, sender, text, createdAt }
        │
        ▼
[io.to(roomId).emit('receive_message', botMessage)]
  → emite a todos los sockets en el mismo room
        │
        ▼  WebSocket
[useSocket.js — listener]
  socket.on('receive_message', addMessage)
        │
        ▼
[ChatContext.jsx]
  addMessage(message) → setMessages(prev => [...prev, message])
        │
        ▼
[MessageList.jsx + Message.jsx]
  Re-render con el nuevo mensaje visible en la UI
```

---

## 5. Detalle de cada archivo clave

### `backend/src/config/env.js`
Fuente única de variables de entorno. Parsea `CLIENT_URL` como array (split por coma) para que CORS y Socket.io acepten múltiples orígenes sin duplicar lógica.

### `backend/src/config/database.js`
Pool `pg` configurado con valores de `env.js`. La contraseña se convierte explícitamente a string con `String(env.DB_PASSWORD ?? '')` para evitar el error `SASL: client password must be a string` cuando la variable no está definida.

### `backend/src/mockai/intents.js`
Árbol de intenciones. Cada intent tiene `name` y `keywords[]`. Las keywords están en español con y sin tildes. Solo se debe tocar este archivo para agregar o modificar keywords — ningún otro archivo de lógica necesita cambios.

**Intents disponibles:** `horarios`, `productos`, `precios`, `promociones`, `ubicacion`

### `backend/src/services/nlpEntityExtractor.js`
Servicio NLP (Stage 1 del pipeline). Usa la librería **Compromise** como fallback de extracción de noun phrases. Lógica interna:

- `normalize()` — lowercase + NFD strip de acentos + quitar ¿¡
- `PRODUCT_QUERY_PATTERNS[]` — 14 regexes con named capture group `entity`
- `ENTITY_STOPWORDS` — artículos/preposiciones que se eliminan del inicio de la entidad
- `ENTITY_BLOCKLIST` — palabras genéricas que NO son productos (`"productos"`, `"menu"`, `"catalogo"`, etc.). Bloquea también frases que contengan esas palabras.
- `PRODUCT_TRIGGER_WORDS` — guard para el fallback NLP; si el mensaje no tiene ninguna de estas palabras, Compromise no se invoca.
- `queryProductByEntity()` — `ILIKE '%entity%'` + ORDER BY exact match first + LIMIT 5
- `formatProductResponse()` — 0 resultados / 1 resultado (tarjeta detallada) / 2-5 resultados (lista compacta)

### `backend/src/services/intentService.js`
Stage 2 del pipeline. Normaliza el texto y hace `includes()` contra cada keyword del árbol `intents.js`. Devuelve la clave del intent o `null`.

### `backend/src/services/businessInfoService.js`
Despacha la clave del intent al método correcto de `BusinessModel` usando un `QUERY_MAP`. Para agregar un nuevo intent solo hay que añadir una entrada al mapa.

### `backend/src/models/businessModel.js`
Queries SQL parametrizadas por intent y `business_id`. Cada método retorna rows crudas que `intentResponseFormatter` convierte a texto.

### `backend/src/services/intentResponseFormatter.js`
Formateadores de respuesta. Convierte arrays de filas de la BD en strings con emojis y formato markdown legible. Un formateador por intent en el objeto `FORMATTERS`.

### `backend/src/config/redis.js`
Cliente `ioredis` singleton con `lazyConnect: true`. Exporta la instancia única que usan `sessionContextService` y cualquier servicio futuro que necesite Redis. Si Redis no arranca, `retryStrategy` deja de reintentar tras 3 intentos y el chat continúa sin contexto.

### `backend/src/services/sessionContextService.js`
Capa de acceso al contexto de sesión en Redis. Expone dos funciones:
- `getContext(sessionId)` → lee `session:{sessionId}`, devuelve `{ lastIntent, lastProduct, lastEntities, updatedAt }` (o todo null si la sesión no existe)
- `updateContext(sessionId, data)` → hace MERGE con el contexto previo y escribe con `SETEX` (TTL 210 s renovado)

Ambas funciones capturan internamente los errores de Redis para no cortar el flujo del chat.

### `backend/src/sockets/chatSocket.js`
Orquestador principal con pipeline de contexto conversacional. El handler `send_message` ahora recibe `sessionId`, recupera contexto de Redis, resuelve `effectiveProduct`/`effectiveIntent` con fallback al contexto previo, delega a `handleWithRules` o `handleWithAI`, y actualiza el contexto tras cada turno.

### `frontend/src/services/socketService.js`
Singleton de socket.io-client. Agrega `getSessionId()`: genera un UUID v4 con `crypto.randomUUID()` la primera vez y lo persiste en `sessionStorage`. No almacena contexto del negocio — sólo el identificador de sesión.

### `frontend/src/hooks/useSocket.js`
Hook React que maneja el lifecycle del socket. `sendMessage()` ahora incluye `sessionId` en el payload: `{ roomId, sender, text, sessionId }`. El sessionId se lee desde `socketService.getSessionId()` en cada envío.

### `frontend/vite.config.js`
Proxy de desarrollo: `/socket.io` → `http://localhost:3000` (websocket) y `/api` → `http://localhost:3000`. Esto evita CORS cross-port durante desarrollo.

---

## 6. Historial de cambios

> Los sprints se listan en orden cronológico. Cada entrada indica qué archivos se crearon o modificaron y por qué.

### Sprint 1 — Infraestructura base
- Proyecto Express + Socket.io + React + Vite scaffoldeado
- Mensajes en tiempo real con rooms
- Store de mensajes en memoria (`messageModel.js`)
- Respuestas mock de OpenAI (`mockOpenAI.js`)
- Respuestas por palabras clave (`keywordResponses.js`)

### Sprint 2 — Intenciones y base de datos
- **Creado `intents.js`**: árbol de 5 intents con 30+ keywords cada uno en español
- **Creado `businessModel.js`**: queries SQL para `business_hours`, `products`, `promotions`, `businesses`
- **Creado `intentService.js`**: detección de intent por comparación de keywords normalizadas
- **Creado `businessInfoService.js`**: despacho de intent → BusinessModel con `QUERY_MAP`
- **Creado `intentResponseFormatter.js`**: formateo de filas DB a texto legible en español
- **Actualizado `chatSocket.js`**: integración del pipeline intent → DB → respuesta al frontend
- **Corregido `database.js`**: eliminado el `module.exports = null` que sobreescribía el Pool; password forzada a string
- **Corregido `env.js`**: `CLIENT_URL` parseado como array para soporte multi-origen

### Sprint 3 — Acceso desde red local
- **`backend/.env`**: `CLIENT_URL` acepta lista separada por comas (`localhost:5173,192.168.1.3:5173`)
- **`env.js`**: parseo de la lista en array
- **`socketService.js`**: conexión a `window.location.origin` en lugar de URL hardcodeada
- **Creado `frontend/.env`**: archivo necesario para que Vite cargue variables
- **Resultado**: la app funciona en el navegador del PC y desde el celular en la misma red Wi-Fi

### Sprint 4 — NLP y extracción de entidades
- **Instalado `compromise`** (librería NLP)
- **Creado `nlpEntityExtractor.js`**: extracción de nombre de producto con regex + NLP fallback
  - 14 patrones regex para frases en español
  - Guard de trigger words para el fallback NLP
  - `ENTITY_BLOCKLIST` con función `isBlocklisted()` para evitar falsos positivos
  - Query `ILIKE` con partial match y exact-match-first ordering
  - Formateador con 3 casos (0, 1, 2-5 resultados)
- **Actualizado `chatSocket.js`**: NLP se ejecuta ANTES que `intentService`
- **Resultado del pipeline completo**:

  | Mensaje de ejemplo         | Etapa que responde | Respuesta |
  |----------------------------|--------------------|-----------|
  | "tienen hamburguesa doble?" | NLP (Stage 1)     | Tarjeta detallada del producto con precio y stock |
  | "cuanto cuesta la pizza pepperoni" | NLP (Stage 1) | Precio, disponibilidad y descripción |
  | "cuando abren?"            | Intent (Stage 2)   | Tabla de horarios de lunes a domingo |
  | "que productos tienen?"    | Intent (Stage 2)   | Lista de todos los productos disponibles |
  | "hola"                     | Fallback (Stage 3) | Respuesta de keywordResponses.js |

### Sprint 6 — Contexto conversacional con Redis  *(30 mar 2026)*

#### Instalaciones
- **`ioredis`** instalado como dependencia de producción en el backend

#### Archivos creados

| Archivo | Propósito |
|---|---|
| `backend/src/config/redis.js` | Cliente ioredis singleton con lazyConnect y retryStrategy |
| `backend/src/services/sessionContextService.js` | `getContext` / `updateContext` con TTL 210 s en Redis |

#### Archivos modificados

| Archivo | Cambio |
|---|---|
| `backend/src/config/env.js` | Agrega `REDIS_HOST`, `REDIS_PORT` |
| `backend/src/services/nlpEntityExtractor.js` | Exporta `queryProductByEntity` y `formatProductResponse` para reuso en chatSocket |
| `backend/src/temp/mockOpenAI.js` | Recibe `context` y genera respuestas coherentes con `lastProduct` / `lastIntent` |
| `backend/src/sockets/chatSocket.js` | Pipeline reescrito con contexto: `getContext` → detección dual → resolución efectiva → `handleWithRules`/`handleWithAI` → `updateContext` |
| `frontend/src/services/socketService.js` | Agrega `getSessionId()` con `crypto.randomUUID()` + `sessionStorage` |
| `frontend/src/hooks/useSocket.js` | `sendMessage` incluye `sessionId` en el payload |
| `backend/.env` *(si existe)* | Agregar `REDIS_HOST=localhost` y `REDIS_PORT=6379` |

#### Comportamiento nuevo

- Las sesiones son anónimas — no hay login ni JWT
- Cada pestaña del navegador tiene su propio `sessionId` en `sessionStorage`
- El contexto expira a los 3.5 minutos de inactividad (TTL Redis)
- Si Redis no está disponible, el chat responde sin contexto (degradación elegante)
- Preguntas de seguimiento como "¿y cuánto cuesta?" usan el producto del turno anterior

---

### Sprint 5 — Testing profesional y CI/CD  *(29 mar 2026)*

#### Instalaciones
- **`jest`** y **`@jest/globals`** instalados como `devDependencies`
- **`package.json`** actualizado con scripts `test`, `test:watch`, `test:coverage` y bloque `jest`

#### Archivos creados

| Archivo | Propósito |
|---|---|
| `tests/setup.js` | Poblado de todas las variables `process.env.DB_*` con valores seguros; ningún test necesita una BD real |
| `tests/unit/intentService.test.js` | 70 casos usando `test.each()` — los 5 intents, sin-match y edge cases (case/accent insensitive, intent dentro de oración) |
| `tests/unit/nlpEntityExtractor.test.js` | `normalize()`, 14 patrones regex, blocklist, guard de trigger words, `extractAndRespond()` con `db.query` mockeado (`jest.mock`) — 36 casos |
| `tests/unit/intentResponseFormatter.test.js` | Todos los formateadores (`horarios`, `productos`, `precios`, `promociones`, `ubicacion`), fallbacks vacíos/null, `formatTime` con medianoche y mediodía — 34 casos |
| `tests/unit/businessInfoService.test.js` | `QUERY_MAP` completo con `BusinessModel` mockeado; verifica que cada intent llame al método correcto y solo a ese; errores de BD propagados — 13 casos |
| `tests/unit/messageModel.test.js` | `create()` (forma, UUID, orden), `findByRoom()` (aislamiento, sin mutación), `clear()` — 10 casos |
| `tests/unit/keywordResponses.test.js` | Keywords conocidas, case-insensitive, keyword en oración larga, sin match, null/undefined/empty guard — 16 casos |
| `.github/workflows/ci.yml` | Pipeline en 3 jobs: **lint** (ESLint, Node 20) → **test** (matrix Node 18 y 20, artifacts JUnit) → **coverage** (Node 20, artifacts HTML, Codecov) |

#### Resultado de los tests

```
Test Suites: 6 passed, 6 total
Tests:       179 passed, 179 total
Time:        ~4 s
```

#### Bug encontrado y corregido durante testing
- La keyword `"sale"` en `intents.js` (intent `promociones`) era un substring de `"sucursales"`, provocando que mensajes de ubicación fueran clasificados como promociones. Se eliminó `"sale"` del árbol.
- Typo `coverageThresholds` → `coverageThreshold` en `package.json` (Jest validation warning).

---

## 7. Testing

El backend cuenta con una suite de **179 pruebas unitarias** en `backend/tests/unit/`.

### Ejecutar los tests

```bash
cd backend
npm test                 # Corre todos los tests una vez
npm run test:watch       # Modo interactivo (re-corre al guardar)
npm run test:coverage    # Genera reporte HTML en ./coverage/
```

### Configuración Jest (`package.json`)

```json
"jest": {
  "testEnvironment": "node",
  "testMatch": ["**/tests/**/*.test.js"],
  "collectCoverageFrom": ["src/**/*.js", "!src/temp/**"],
  "coverageThreshold": {
    "global": { "lines": 70, "functions": 70, "branches": 60 }
  },
  "setupFiles": ["<rootDir>/tests/setup.js"]
}
```

### Estrategia de mocking

| Módulo mockeado | Usado en test | Razón |
|---|---|---|
| `../../src/config/database` | `nlpEntityExtractor.test.js` | Evitar conexión real a PostgreSQL |
| `../../src/models/businessModel` | `businessInfoService.test.js` | Aislar la lógica de despacho del QUERY_MAP |

Todos los demás módulos se prueban con código real (ninguna dependencia externa ejecutada).

---

## 8. CI/CD — GitHub Actions

Archivo: `.github/workflows/ci.yml`  
Se activa en **push** y **pull request** sobre las ramas `main` y `develop`.

### Jobs

```
┌─────────┐     ┌────────────────────────┐     ┌──────────────────┐
│  lint   │────▶│  test (Node 18 + 20)   │────▶│  coverage        │
│ ESLint  │     │  matrix: fail-fast off │     │  Node 20 solo    │
│ Node 20 │     │  artifacts: JUnit XML  │     │  Artefacto HTML  │
└─────────┘     └────────────────────────┘     │  Codecov upload  │
                                               └──────────────────┘
```

| Job | Qué hace |
|---|---|
| **lint** | `npx eslint src/` sobre Node 20. Falla si hay errores (warnings tolerados) |
| **test** | `npm test` en Node 18 y 20 en paralelo. Sube artefactos JUnit si falla |
| **coverage** | `npm run test:coverage`. Sube reporte HTML (30 días) y envía a Codecov |

### Secreto requerido

En los ajustes del repositorio → **Secrets and variables → Actions**:

| Nombre | Descripción |
|---|---|
| `CODECOV_TOKEN` | Token obtenido desde codecov.io al conectar el repositorio |

---

## 9. Cómo extender el sistema

### Agregar una nueva intención (tema amplio)

1. Abrir `backend/src/mockai/intents.js`
2. Agregar una nueva clave con `name` y `keywords[]`
3. Abrir `backend/src/models/businessModel.js` → agregar método con el query SQL
4. Abrir `backend/src/services/businessInfoService.js` → agregar entrada en `QUERY_MAP`
5. Abrir `backend/src/services/intentResponseFormatter.js` → agregar función en `FORMATTERS`

No se modifica ningún otro archivo.

### Agregar más patrones de consulta de producto

Abrir `backend/src/services/nlpEntityExtractor.js`:
- Agregar regex con named capture group `entity` al array `PRODUCT_QUERY_PATTERNS`
- Agregar trigger words nuevas a `PRODUCT_TRIGGER_WORDS` si aplica
- Agregar palabras genéricas a `ENTITY_BLOCKLIST` si empiezan a causar falsos positivos

### Agregar un test para una nueva función

1. Crear `backend/tests/unit/<modulo>.test.js`
2. Si el módulo usa la BD, agregar al inicio: `jest.mock('../../src/config/database', () => ({ query: jest.fn() }))`
3. Si el módulo usa otro model, agregar: `jest.mock('../../src/models/<model>')`
4. `npm test` lo detecta automáticamente (patrón `**/tests/**/*.test.js`)

### Activar OpenAI real

1. Agregar `OPENAI_API_KEY` en `backend/.env`
2. Descomentar la variable en `env.js`
3. Crear `backend/src/services/openaiService.js` con la llamada a la API
4. En `chatSocket.js`, reemplazar `getMockOpenAIResponse(text, context)` en `handleWithAI` por `await openaiService.chat(text, context)` (pasar el contexto para incluirlo como system prompt)

### Cambiar el TTL del contexto de sesión

Modificar `SESSION_TTL_SECONDS` en `backend/src/services/sessionContextService.js`.  
Valor actual: `210` (3.5 min). Rango recomendado: 180–300 s (3–5 min).

### Soporte multi-negocio

Actualmente `ACTIVE_BUSINESS_ID = 1` está hardcodeado en `chatSocket.js`. Para soportar múltiples negocios:
1. El frontend debe enviar `businessId` junto con `roomId` en el evento `send_message`
2. `chatSocket.js` lo recibe y lo pasa como argumento a `extractAndRespond()`, `getBusinessInfoByIntent()` y sus dependencias (todas ya aceptan `businessId` como parámetro)

---

## 10. Cómo correr el proyecto

### Requisitos

- Node.js ≥ 18
- PostgreSQL corriendo localmente
- **Redis corriendo localmente** (puerto 6379 por defecto)
- Base de datos creada y schema aplicado:

```bash
psql -U postgres -d aichat -f backend/src/config/schema.sql
```

> **Redis en Windows:** instalar con WSL2 (`sudo apt install redis-server`) o usar Docker (`docker run -d -p 6379:6379 redis:alpine`).  
> Si Redis no está disponible el chat arranca igual pero sin contexto conversacional (no hay preguntas de seguimiento contextualizadas).

### Backend

```bash
cd backend
cp .env.example .env       # solo la primera vez
# editar .env con tus credenciales de postgres
npm install
npm run dev                # nodemon en puerto 3000
```

### Frontend

```bash
cd frontend
cp .env.example .env       # solo la primera vez
npm install
npm run dev                # Vite en puerto 5173
```

### Acceso

| Dispositivo | URL |
|-------------|-----|
| PC (localhost) | http://localhost:5173 |
| Celular (misma Wi-Fi) | http://192.168.1.3:5173 |

> Si tu IP de red local cambia, actualizar únicamente `CLIENT_URL` en `backend/.env`.
