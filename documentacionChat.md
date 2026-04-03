# LLM Chat AI — Documentación del Proyecto (Chat)

> Última actualización: 3 de abril de 2026 — Sprint 17 (chat UI rediseño, fix envío mobile, color light theme)
> Estado: desarrollo activo
> Archivo: `documentacionChat.md`

---

## Resumen del proyecto

**LLM Chat AI** es un chatbot de atención al cliente en tiempo real, diseñado para negocios locales (restaurantes, ferreterías, papelerías, etc.). Combina lógica NLP determinista propia con un flujo híbrido de IA: primero intenta resolver el mensaje con reglas (regex, scoring de keywords, consultas PostgreSQL); sólo cuando ninguna regla aplica, activa un motor de decisión IA que filtra datos relevantes de la BD (RAG) y los envía a OpenAI (actualmente simulado con un mock).

El usuario escribe mensajes en español coloquial a través de una interfaz React/Vite. Los mensajes viajan por WebSocket (Socket.io) al backend Node.js, donde un **pipeline NLP** los preprocesa (expansión de abreviaturas + corrección de typos), normaliza, detecta intención (horarios, precios, productos, promociones, ubicación), extrae entidades (producto, categoría, día de la semana, promoción) y genera una respuesta estructurada con datos reales del negocio almacenados en PostgreSQL. El contexto conversacional se mantiene entre turnos usando Redis.

**Capacidades actuales:**
- Responde preguntas sobre horarios (general y por día de la semana, con formas verbales "abres", "cierras")
- Lista productos con precio, disponibilidad y stock; pagina resultados si hay demasiados
- Muestra productos por categoría o tipo ("que bebidas tienen", "que tipo de hamburguesas tienen")
- Informa precios de productos específicos; añade sección de características (`product_attributes`) cuando el producto tiene atributos registrados
- Muestra descripción de productos con sus características (`product_attributes`)
- Lista los servicios del negocio (`business_services`) con precio; también los incluye al preguntar por la ubicación
- Responde información detallada de un servicio específico (descripción + precio)
- Muestra promociones vigentes y ubicación del negocio
- Mantiene contexto multi-turno ("¿y cuánto cuesta?" después de preguntar por un producto)
- Preguntas generales sobre el catálogo ("que productos tienes", "que vendes") resetean el contexto previo de producto — nunca heredan la entidad anterior
- **Flujo híbrido IA:** recomendaciones ("que me recomiendas"), comparaciones ("X vs Y"), superlativos ("la más barata", "la mejor"), preguntas de capacidad nutricional — ruteados a OpenAI con contexto RAG filtrado
- Degrada elegantemente si Redis no está disponible (in-memory fallback automático)

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
aichat/
├── backend/
│   ├── .env
│   ├── .env.example
│   ├── server.js
│   ├── src/
│   │   ├── app.js
│   │   ├── config/
│   │   │   ├── database.js
│   │   │   ├── env.js
│   │   │   ├── redis.js
│   │   │   └── schema.sql
│   │   ├── middlewares/
│   │   │   ├── errorHandler.js
│   │   │   └── requestLogger.js
│   │   ├── mockai/
│   │   │   ├── intents.js
│   │   │   └── keywordResponses.js
│   │   ├── models/
│   │   │   ├── businessModel.js
│   │   │   └── messageModel.js
│   │   ├── routes/
│   │   │   ├── index.js
│   │   │   └── messageRoutes.js
│   │   ├── services/
│   │   │   ├── aiDecisionEngine.js
│   │   │   ├── attributeExtractor.js
│   │   │   ├── attributeSearchService.js
│   │   │   ├── businessInfoService.js
│   │   │   ├── conversationalContext.js
│   │   │   ├── dayDetector.js
│   │   │   ├── entityDetector.js
│   │   │   ├── intentDetector.js
│   │   │   ├── intentResponseFormatter.js
│   │   │   ├── messagePipeline.js
│   │   │   ├── messageService.js
│   │   │   ├── nlpEntityExtractor.js
│   │   │   ├── normalize.js
│   │   │   ├── ragFilterService.js
│   │   │   ├── sessionContextService.js
│   │   │   └── textPreprocessor.js
│   │   ├── sockets/
│   │   │   └── chatSocket.js
│   │   └── temp/
│   │       └── mockOpenAI.js
│   └── tests/
│       ├── setup.js
│       └── unit/
│           ├── businessInfoService.test.js
│           ├── conversationalFlow.test.js
│           ├── dayDetector.test.js
│           ├── entityDetector.test.js
│           ├── hybridFlow.test.js
│           ├── intentResponseFormatter.test.js
│           ├── intentService.test.js
│           ├── keywordResponses.test.js
│           ├── attributeSearch.test.js
│           ├── messageModel.test.js
│           ├── mockOpenAI.test.js
│           ├── nlpEntityExtractor.test.js
│           ├── normalize.test.js
│           ├── sessionContextService.test.js
│           └── textPreprocessor.test.js
│
├── .github/
│   └── workflows/
│       └── ci.yml
│
└── frontend/
    ├── index.html              ← viewport-fit=cover para iOS Safari
    ├── vite.config.js
    └── src/
        ├── App.css             ← sistema de diseño completo (light theme, dvh, safe-area)
        ├── App.jsx
        ├── main.jsx
        ├── components/
        │   ├── BusinessSelector.jsx   ← selector de negocio con cards + letter-avatar
        │   └── Chat/
        │       ├── ChatWindow.jsx     ← header con avatar + estado "En línea"
        │       ├── Message.jsx        ← burbuja con avatar para bot
        │       ├── MessageInput.jsx   ← botón enviar con SVG, sin form (fix mobile)
        │       └── MessageList.jsx    ← typing dots animados
        ├── context/
        │   └── ChatContext.jsx        ← incluye businessName prop
        ├── hooks/
        │   └── useSocket.js
        ├── pages/
        │   └── ChatPage.jsx           ← lee nav state para businessName
        └── services/
            └── socketService.js       ← UUID con getRandomValues (no requiere HTTPS)
```

---

## 2. Variables de entorno

### `backend/.env`

```dotenv
NODE_ENV=development
PORT=3000
CLIENT_URL=http://localhost:5173,http://192.168.1.3:5173

DB_HOST=localhost
DB_PORT=5432
DB_NAME=aichat
DB_USER=postgres
DB_PASSWORD=<tu_password>

REDIS_HOST=localhost
REDIS_PORT=6379
```

> `CLIENT_URL` acepta múltiples orígenes separados por coma. `env.js` los parsea en un array para CORS y Socket.io.
> Si Redis no está disponible, el chat degrada elegantemente sin contexto conversacional.

### `frontend/.env`

```dotenv
VITE_SOCKET_URL=http://localhost:3000
```

> `socketService.js` usa `window.location.origin` + proxy de Vite — esta variable se mantiene como referencia.

---

## 3. Base de datos

Motor: **PostgreSQL**. Esquema en `backend/src/config/schema.sql`.

### Tablas principales

| Tabla                | Descripción |
|----------------------|-------------|
| `businesses`         | Negocios registrados |
| `categories`         | Categorías de productos |
| `products`           | Productos con precio y disponibilidad |
| `product_inventory`  | Stock por producto (1-a-1 con products) |
| `product_attributes` | Atributos clave/valor por producto |
| `business_hours`     | Horarios por día (0=domingo … 6=sábado) |
| `promotions`         | Promociones activas con fecha inicio/fin |
| `business_services`  | Servicios del negocio |
| `conversations`      | Sesiones de chat |
| `messages`           | Mensajes individuales |

### Seed

| id | Nombre                  | Tipo        | Ciudad           |
|----|-------------------------|-------------|------------------|
| 1  | Restaurante Don Pepe    | restaurant  | Ciudad de México |
| 2  | Ferretería El Tornillo  | hardware    | Guadalajara      |
| 3  | Papelería La Pluma      | stationery  | Monterrey        |

> El sistema trabaja con `business_id = 1` (`ACTIVE_BUSINESS_ID` en `chatSocket.js`).

---

## 4. Flujo completo de un mensaje

### 4.1 Frontend → Backend (envío)

```
Usuario escribe "cuando abren el lunes?"
        │
        ▼
[MessageInput.jsx]
  handleSubmit() → sendMessage(trimmed)
        │
        ▼
[useSocket.js]
  sendMessage(text)
  → socket.emit('send_message', { roomId, sender, text, sessionId })
        │
        ▼  WebSocket (ws://)
[Vite Proxy]  /socket.io → http://localhost:3000
        │
        ▼
[chatSocket.js]
  socket.on('send_message', ({ roomId, sender, text, sessionId }))
  → processMessage({ text, sessionId, businessId })
```

---

### 4.2 Backend — pipeline de procesamiento (`messagePipeline.js`)

El pipeline orquesta todos los servicios NLP y decide qué respuesta generar.

```
Mensaje: "abren el lunes?"   sessionId: "a3f2..."
        │
        ▼ 1. preprocessMessage(text)  [textPreprocessor.js]
        │    Expande abreviaturas ("xq"→"porque", "q"→"que", etc.)
        │    Corrige typos (diccionario ~100 palabras + Levenshtein ≤2)
        │    Llama normalize() internamente
        │    → "abren el lunes"
        │
        ▼ 2. detectDay(normalizedText)  [dayDetector.js]
        │    Busca nombre de día con word-boundary regex
        │    → { type: 'day', value: 'lunes', dayOfWeek: 1 }
        │    (Si hay día detectado, se salta el paso de entityDetector)
        │
        ▼ 3. detectIntent(text)  [intentDetector.js]
        │    Scoring de keywords contra intents.js
        │    → { intent: 'horarios', score: 1, scores: { horarios: 1 } }
        │
        ▼ 4. detectEntities(text, businessId, intentResult)  [entityDetector.js]
        │    OMITIDO — se detectó día en paso 2
        │
        ▼ 5. getContext(sessionId)  [sessionContextService.js → Redis]
        │    Lee "session:{sessionId}" → { lastIntent, lastEntity, ... }
        │
        ▼ 6. decide(intentResult, entityResult, context, normalizedText)
        │
        │    ┌─────────────────────────────────────────────────────────────────┐
        │    │ REGLAS DE DECISIÓN (en orden de prioridad)                      │
        │    │                                                                 │
        │    │ Regla -1a: "ver más" / "siguiente" + paginationCategory         │
        │    │   → strategy: 'pagination'                                      │
        │    │                                                                 │
        │    │ Regla -1b: texto coincide con availableCategories               │
        │    │            AND lastIntent === 'category_selection'               │
        │    │   → strategy: 'category_select'                                 │
        │    │                                                                 │
        │    │ Regla 0: entityResult.type === 'day'                            │
        │    │   → strategy: 'entity', intent: 'horarios'                     │
        │    │   NUNCA usa contexto                                            │
        │    │                                                                 │
        │    │ Regla 1: intent standalone + score ≥ 3                         │
        │    │   → strategy: 'intent', ignora contexto                        │
        │    │                                                                 │
        │    │ Regla 1.5: AI pre-screen — shouldUseAI() con entidad real      │
        │    │   Si texto contiene RECOMMEND_RE / COMPARE_RE /               │
        │    │   SUPERLATIVE_RE / CAPACITY_RE → strategy: 'ai'               │
        │    │   ANTES de que la entidad detectada bloquee la ruta de IA     │
        │    │                                                                 │
        │    │ Regla 2: entidad detectada en el mensaje                        │
        │    │   → strategy: 'entity', ignora contexto                        │
        │    │   Para tipo='product' o tipo='category' infiere                 │
        │    │   intent='productos' si no hay intent en el mensaje             │
        │    │                                                                 │
        │    │ Regla 2.5: intent=productos + score≥3 + sin entidad            │
        │    │   Consulta general del catálogo → strategy: 'intent'           │
        │    │   NUNCA hereda lastEntity del contexto                          │
        │    │   Limpia lastEntity en Redis al completar                       │
        │    │                                                                 │
        │    │ Regla 3: intent no-standalone (precios, descripcion…)           │
        │    │           + entity en contexto                                  │
        │    │   → strategy: 'context'  (combina intent + lastEntity)         │
        │    │                                                                 │
        │    │ Regla 4: mensaje ambiguo + contexto disponible                  │
        │    │   → strategy: 'context'  (usa lastIntent + lastEntity)         │
        │    │                                                                 │
        │    │ Regla 5: "¿Y pizza mexicana?" → extractFollowUpEntity          │
        │    │   → strategy: 'followup'                                        │
        │    │                                                                 │
        │    │ Regla 6: anti-fallback con contexto                             │
        │    │   Sólo si lastEntity.type !== 'day' (entidades temporales      │
        │    │   no contaminan consultas de producto)                          │
        │    │   → strategy: 'context'                                         │
        │    │                                                                 │
        │    │ Regla 7: ningún match → strategy: 'ai'                          │
        │    └─────────────────────────────────────────────────────────────────┘
        │
        │    Resultado: { strategy: 'entity', intent: 'horarios',
        │                  entity: { type:'day', value:'lunes', dayOfWeek:1 } }
        │
        ▼ 7a. executeDecision(decision, text, businessId, context, sessionId)
        │     [usado cuando strategy ≠ 'ai']
        │
        │    Rama día + horarios → getHorariosByDay(businessId, 1)
        │      → SELECT … FROM business_hours WHERE day_of_week = 1
        │      → formatHorarioDay('lunes', row)
        │      → "El Lunes abrimos de 9:00 am a 6:00 pm. 🕐"
        │
        │    ─────── Otras ramas de executeDecision ────────────────
        │
        │    Paginación ('pagination'):
        │      → getProductosByCategory(businessId, cat, PAGE_SIZE, offset+10)
        │      → updateContext(sessionId, { paginationOffset })
        │      → formatProductPage(rows, newOffset, total, cat)
        │
        │    Selección de categoría ('category_select'):
        │      → countProductosByCategory + getProductosByCategory(…, 0)
        │      → updateContext(sessionId, { paginationCategory, … })
        │      → formatProductPage(rows, 0, total, cat)
        │
        │    Precio de producto ('precios' + entity.type='product'):
        │      → queryProducts(entity.value, businessId)
        │      → "El producto *X* cuesta $Y."
        │
        │    Entidad categoría en mensaje ('que bebidas tienen',
        │      'que tipo de hamburguesas tienen'):
        │      → countProductosByCategory + getProductosByCategory(…, 0)
        │      → updateContext(paginationCategory, offset, total)
        │      → formatProductPage(rows, 0, total, cat)
        │
        │    Entidad producto en mensaje:
        │      → queryProducts → formatProductResponse(entity, rows)
        │      → si rows.length === 1:
        │           getProductAttributes([rows[0].id])
        │           → formatProductAttributes(attrsMap, id)
        │           → se añade sección "✨ Características:" al final
        │
        │    Intent puro (incluye hard-limit de productos):
        │      → getBusinessInfoByIntent(intent, businessId)
        │      → si productos.length > 20:
        │           getCategories(businessId)
        │           formatCategoryPrompt(categories)
        │           → "Tenemos muchos productos… ¿Buscas algo en específico?"
        │      → si intent === 'servicios' + entity.value:
        │           getServiceByName(businessId, entity.value)
        │           → formatServiceDetail(service)
        │      → si intent === 'servicios' (general):
        │           getBusinessInfoByIntent('servicios', businessId)
        │           → formatIntentResponse('servicios', rows)
        │      → si intent === 'ubicacion':
        │           formatIntentResponse('ubicacion', row)
        │           + getBusinessInfoByIntent('servicios', businessId)
        │           → se añade lista de servicios activos al final
        │      → sino: formatIntentResponse(intent, data)
        │
        │    Precio de producto con intent=precios + entity.type='product':
        │      → queryProducts → "El producto *X* cuesta $Y."
        │      → getProductAttributes([p.id]) → sección "✨ Características:"
        │
        │    Descripción con intent=descripcion + entity.value:
        │      → queryProducts → formatDescripcionResponse(entity, rows)
        │      → getProductAttributes([rows[0].id]) → sección "✨ Características:"
        │
        ▼ 7b. handleAIFallback(...)  [usado cuando strategy === 'ai']
        │
        │    Paso 1: keyword response? → devuelve inmediatamente (sin IA)
        │    Paso 2: shouldUseAI() → ¿amerita realmente IA?
        │      No → getMockOpenAIResponse() (fallback genérico)
        │    Paso 3: filterRelevantData() → RAG filter
        │      Clasifica en: recommendation / comparison / open_query / contextual
        │      Trae de BD sólo los productos/datos relevantes (máx. MAX_ITEMS=15)
        │    Paso 4: hasRelevantData()? No → getMockOpenAIResponse()
        │    Paso 5: getRAGOpenAIResponse(text, ragContext, sessionCtx)
        │      [simulado — en prod: openai.chat.completions.create()]
        │      → "🤖 [AI Simulado] … enviado con N resultados …"
        │
        ▼ 8. buildContextUpdate(decision) + updateContext(sessionId, update)
             Persiste en Redis (TTL 210 s, renovado con cada turno activo)
             Entidad nueva → guarda entity + limpia paginación
             Intent standalone → guarda intent + limpia entity + limpia paginación
             Paginación/categoría → gestionado directamente por executeDecision
```

#### Tabla de ejemplos con el pipeline actual

| Turno | Mensaje | Regla activa | Estrategia | Respuesta |
|-------|---------|--------------|------------|-----------|
| 1 | "que productos tienen?" | Regla 1 (standalone) | intent | Si >20 prods: lista de categorías |
| 2 | "Electrónica" | Regla -1b (categoría) | category_select | Primeros 10 de Electrónica |
| 3 | "ver más" | Regla -1a (paginación) | pagination | Productos 11–20 de Electrónica |
| 4 | "precio hamburguesa" | Regla 2 (entidad) | entity | "El producto *Hamburguesa* cuesta $150.00." |
| 5 | "¿y cuánto cuesta?" | Regla 3 (context) | context | Precio de hamburguesa (del contexto) |
| 6 | "abren el lunes?" | Regla 0 (día) | entity | "El Lunes abrimos de 9:00 am a 6:00 pm. 🕐" |
| 7 | "abres este domingo?" | Regla 0 (día) | entity | Horario del domingo |
| 8 | "abren toda la semana?" | Regla 1 (standalone) | intent | Tabla de horarios completa |
| 9 | "¿y la pizza mexicana?" | Regla 5 (follow-up) | followup | Tarjeta de pizza mexicana |
| 10 | "que hamburguesas tienen?" | Regla 2 (entidad=product) | entity | Lista de hamburguesas disponibles |
| 11 | "que bebidas tienen?" | Regla 2 (entidad=category) | entity | Primera página de productos de Bebidas |
| 12 | "que tipo de tacos tienen?" | Regla 2 (entidad=cat/product) | entity | Productos de la categoría o con ese nombre |
| 13 | "que me recomiendas de postres?" | Regla 1.5 (AI prescreen) | ai→RAG | Recomendación de IA con datos filtrados de Postres |
| 14 | "cual es la pizza más barata?" | Regla 1.5 (AI prescreen) | ai→RAG | Comparación/ranking de pizzas por precio |
| 15 | "que pizza es la mejor?" | Regla 1.5 (AI prescreen) | ai→RAG | Recomendación subjetiva con contexto de BD |
| 16 | "que servicios tienen?" | Regla 1 (standalone) | intent | Lista de servicios con precios |
| 17 | "y el servicio a domicilio?" | Regla 5 (follow-up) | followup | Nombre + descripción + precio del servicio |
| 18 | "donde están ubicados?" | Regla 1 (standalone) | intent | Ubicación + lista de servicios activos del negocio |
| 19 | "que productos tienes" (con ctx pizza) | Regla 2.5 (catálogo general) | intent | Catálogo/categorías; entity de contexto ignorada |
| 20 | "la pizza mexicana" (follow-up) | Regla 5 (follow-up) | followup | Info de pizza mexicana (artículo "la" eliminado) |

---

### 4.3 Backend → Frontend (respuesta)

```
Backend genera replyText
        │
        ▼
[MessageService.saveMessage({ roomId, sender: 'Bot', text: replyText })]
  → store en memoria → objeto { id, roomId, sender, text, createdAt }
        │
        ▼
[io.to(roomId).emit('receive_message', botMessage)]
        │
        ▼  WebSocket
[useSocket.js]
  socket.on('receive_message', addMessage)
        │
        ▼
[ChatContext] → setMessages(prev => [...prev, message])
        │
        ▼
[Message.jsx]
  <p style={{ whiteSpace: 'pre-wrap' }}>{message.text}</p>
  (pre-wrap respeta los \n del formateador → listas visibles)
```

---

## 5. Detalle de cada archivo clave

### `messagePipeline.js`
**Orquestador principal del sistema NLP.** Reemplaza la lógica que antes estaba en `chatSocket.js`. Exporta `processMessage({ text, sessionId, businessId })` que ejecuta todos los pasos del pipeline y retorna `{ replyText, decision, logs }`.

Contiene además las funciones puras exportadas para testing:
- `decide(intentResult, entityResult, context, normalizedText)` → aplica las 10+ reglas y devuelve `PipelineDecision`.
  - Regla 1.5: llama a `shouldUseAI()` con la entidad real detectada antes que la Regla 2 para que patrones de recomendación/comparación/superlativo ruteen a IA aunque haya entidad en el mensaje.
  - Regla 2: infiere `intent='productos'` para entidades de tipo `product` y `category`.
  - **Regla 2.5** *(nueva)*: si `intent=productos` + `score ≥ 3` + sin entidad → `strategy=intent` sin heredar contexto (reset de catálogo general).
  - Regla 4: cuando `lastEntityFound === false`, el intent se fuerza a `'productos'` para que un "sí" muestre el catálogo en lugar de re-preguntar por el producto fallido.
- `handleAIFallback(...)` → flujo híbrido IA: keyword → shouldUseAI → filterRelevantData → hasRelevantData → getRAGOpenAIResponse
- `buildContextUpdate(decision)` → calcula el objeto parcial a persistir en Redis. **Nuevo:** consultas generales de catálogo (`strategy=intent, intent=productos`) limpian `lastEntity` en Redis.
- `isAmbiguous(normalizedText)` → `true` para mensajes cortos o patrones de seguimiento
- `extractFollowUpEntity(normalizedText, lastEntity)` → detecta "¿Y X?", "la pizza mexicana", "tambien X" cuando hay track activo. **Actualizado:** artículos iniciales (`el/la/los/las/un/una`) son eliminados del candidato extraído antes de la consulta DB. `lastEntityFound = false` ahora se propaga también cuando el miss ocurre en rutas `followup`/`context`.
- Constantes de paginación: `PRODUCTS_HARD_LIMIT = 20`, `PAGE_SIZE = 10`

En `executeDecision()`, las entidades de tipo `category` activan el mismo flujo de paginación que la selección manual de categoría: carga la primera página de 10 productos, guarda el estado de paginación en Redis y permite continuar con "ver más".

La Regla 6 (anti-fallback) incluye el guard `context.lastEntity?.type !== 'day'` para que entidades temporales (días de la semana) no contaminen consultas de producto/recomendación en turnos posteriores.

### `aiDecisionEngine.js`
**Motor de decisión IA.** Determina si un mensaje debe manejarse por el backend determinista o enrutarse a OpenAI. Es una capa puramente decisora — nunca llama a OpenAI directamente.

Función principal: `shouldUseAI(normalizedText, intentResult, entityResult, context) → { routing, reason, aiCategory }`

**Orden de evaluación (prioridad):**
1. Intent de alta confianza → `backend` (nunca IA)
2. `RECOMMEND_RE` — "recomiéndame", "recomiendas", "qué me recomiendan" → `ai / recommendation`
3. `COMPARE_RE` — "compara X y Y", "vs", "cuál conviene más" → `ai / comparison`
4. `SUPERLATIVE_RE` — "el más barato", "la más cara", "la mejor", "cuesta menos" → `ai / comparison`
5. `CAPACITY_RE` — "cuántos tacos puedo comer", "cuánto debo consumir" → `ai / open_query`
6. Entidad detectada → `backend` (catálogo determinista suficiente)
7. Contexto disponible + mensaje ≤ 4 palabras → `backend` (follow-up corto)
8. `OPINION_RE` — "vale la pena", "qué opinas" → `ai / open_query`
9. Mensaje largo (≥ 12 palabras) → `ai / open_query`
10. Intents competidores con scores cercanos → `ai / open_query`
11. Score bajo + mensaje moderadamente complejo → `ai / contextual`
12. Default → `backend` (saludos, "gracias", etc.)

Exporta: `shouldUseAI`, `hasRelevantData`, `LONG_MESSAGE_WORDS`, `MULTI_INTENT_SCORE_GAP`

### `attributeSearchService.js`
Motor de búsqueda semántica por atributos de producto. Permite responder preguntas del tipo "algo con queso", "para madera", "que tenga wifi" usando la tabla `product_attributes`.

- `buildAttributeConditions(attributes[])` — genera cláusulas SQL `EXISTS (SELECT 1 FROM product_attributes…)` para cada atributo detectado
- `searchByAttributes(attributes[], businessId)` — ejecuta la query combinada (OR/AND según la lista) y devuelve productos que cumplan los criterios
- `formatAttributeResponse(products[])` — formatea la lista de resultados en bullet points

Exporta: `searchByAttributes`, `formatAttributeResponse`, `buildAttributeConditions`

### `attributeExtractor.js`
Extrae atributos de búsqueda de frases en español. Detecta términos como "con queso", "para madera", "que tenga wifi" con regex por tipo de atributo (`ingredient`, `material`, `feature`, `purpose`).

- `extractAttribute(normalizedText)` — retorna `{ value, type } | null`

### `ragFilterService.js`
**Filtro RAG (Retrieval-Augmented Generation).** Cuando el pipeline decide usar IA, este servicio trae de la BD sólo los datos relevantes antes de armar el prompt para OpenAI. Minimiza tokens y coste.

Función principal: `filterRelevantData(normalizedText, businessId, intentResult, entity, context) → Promise<RAGContext>`

**Tipos de RAG context:**
- `recommendation` → trae productos de la categoría mencionada (o todos si no hay categoría)
- `comparison` → intenta extraer candidatos X vs Y; si no hay, trae todos los productos
- `open_query` → trae productos + horarios según contexto
- `contextual` → usa `lastEntity`/`lastIntent` para narrowear la consulta
- `general` → sólo horarios + categorías disponibles

Función auxiliar: `classifyAIRequest()` — mismos patrones que `aiDecisionEngine.js` (deben mantenerse sincronizados). `extractComparisonEntities()` — extrae candidatos "X o Y", "X vs Y" de la pregunta.

Exporta: `filterRelevantData`, `classifyAIRequest`, `extractComparisonEntities`, `MAX_ITEMS` (= 15)

### `textPreprocessor.js`
**Preprocesador de mensajes.** Corre antes de intent/entity detection. Provee un pipeline de normalización genérico para NLP en español coloquial.

Pipeline interno:
1. `normalize()` — lowercase + strip acentos + quitar ¿¡
2. `expandAbbreviations()` — "xq"→"porque", "q"→"que", "tb"→"también", etc. (≈25 abreviaturas)
3. `correctTypos()` — diccionario de ~100 errores comunes + Levenshtein conservador (≤2 ediciones, sólo cuando EXACTAMENTE un match existe)

**Seguridad:** la corrección de typos es opt-out; cualquier palabra en el `validSet` nunca se modifica. Tokens cortos (≤2 chars) siempre se preservan.

Exporta: `preprocessMessage`, `expandAbbreviations`, `correctTypos`, `singularizeTokens`

### `mockOpenAI.js` (`src/temp/`)
Fallback de IA simulado. Provee dos funciones:
- `getMockOpenAIResponse(userMessage, context)` — respuesta genérica cuando el motor de decisión decide que no vale la pena llamar a IA, o cuando el RAG no encontró datos
- `getRAGOpenAIResponse(userMessage, ragContext, sessionContext)` — simula una llamada a OpenAI con el contexto RAG filtrado; en producción se reemplaza por `openai.chat.completions.create()`

Exporta: `getMockOpenAIResponse`, `getRAGOpenAIResponse`

### `dayDetector.js`
Detecta el primer nombre de día en español (con/sin tilde) usando word-boundary regex. Devuelve `{ type: 'day', value: 'lunes', dayOfWeek: 1 }` o `null`. El valor `dayOfWeek` sigue la convención PostgreSQL: 0=domingo, 6=sábado.

### `entityDetector.js`
Extrae entidades de tipo `product` o `category` del mensaje usando:
1. **Pre-check `TIPO_DE_RE`** — antes de cualquier otro patrón detecta `"que tipo(s) de X tienen/hay"` y consulta **categoría primero, luego producto** (orden invertido respecto al flujo normal), para que preguntas como `"que tipo de bebidas tienen"` encuentren la categoría "Bebidas" antes de buscar un producto individual.
2. **21+ patrones regex** con named capture group `(?<entity>…)` para frases en español (incluyendo `que tipo de X tienen`, `precio X`, `que precio tiene X`, `cual es el precio de X`)
3. **Fallback Compromise NLP** (solo si hay trigger word en el mensaje)
4. Consulta PostgreSQL con `ILIKE` para confirmar que el candidato existe en la BD
5. Exporta `formatProductResponse(entity, rows)` y `formatCategoryResponse(category, rows)` con listas estructuradas

### `intentDetector.js`
Scoring de keywords contra `intents.js`. Cada keyword tiene un `weight`. El intent ganador es el de mayor suma de pesos, si supera `MIN_CONFIDENCE = 1`. Exporta `isStandaloneIntent(key)` para distinguir intents que no necesitan entidad (`horarios`, `ubicacion`, `promociones`).

### `intents.js`
Árbol de 6 intenciones. Cada intent incluye `standalone: bool` y `keywords[]` con `{ phrase, weight }`. Los pesos tipicamente son 1–3; frases muy específicas como `"abren toda la semana"` tienen peso 3 para ganar siempre sobre palabras sueltas.

**Intents disponibles:** `horarios`, `productos`, `precios`, `promociones`, `ubicacion`, `servicios`

| Intent | standalone | Notas |
|--------|-----------|-------|
| `horarios` | `true` | Incluye formas tuteo: `abres`, `cierras`, `cuando abres` |
| `productos` | `false` | `productos disponibles` (w2), `ver catalogo` (w2), `productos` (w1) — evita fallos al responder al menú del bot |
| `precios` | `false` | Hereda entidad de contexto cuando no hay producto en el mensaje |
| `promociones` | `true` | |
| `ubicacion` | `true` | |
| `servicios` | `true` | `que servicios ofrecen/tienen/manejan` (w3), `servicios disponibles` (w2), `servicios`/`servicio` (w1). Estas frases fueron **movidas** desde `productos` donde causaban conflicto de enrutamiento. |

### `intentResponseFormatter.js`
Formateadores que convierten filas de la BD en texto con `\n`. Usa el helper interno `formatList(title, items)` que produce:

```
título\n\n• item 1\n• item 2\n• item N
```

Un formateador por intent en el objeto `FORMATTERS`. Exporta:

| Función | Uso |
|---------|-----|
| `formatIntentResponse(intent, data)` | Despacha al formateador de `FORMATTERS[intent]` |
| `formatHorarioDay(dayKey, row)` | Horario de un día específico |
| `formatList(title, items)` | Bullet list reutilizable |
| `formatDescripcionResponse(entity, rows)` | Descripción de producto |
| `formatProductAttributes(attrsMap, productId)` | Sección "✨ Características:" con atributos clave/valor. Devuelve `''` si el producto no tiene atributos. |
| `formatServiceDetail(service)` | Tarjeta de un servicio específico: nombre + precio + descripción |

El `FORMATTERS` incluye `servicios(rows)` que genera una lista con precios e invita a preguntar por un servicio específico.

### `businessModel.js`
Queries SQL por intent + `business_id`. Métodos actuales:

| Método | Query |
|--------|-------|
| `getHorarios` | `business_hours ORDER BY day_of_week` |
| `getHorariosByDay` | `business_hours WHERE day_of_week = $2` |
| `getProductos` | `products + inventory + categories, is_available=TRUE` |
| `getProductosByCategory` | Igual con `c.name ILIKE $2`, `LIMIT $3 OFFSET $4` |
| `countProductosByCategory` | `COUNT(*) WHERE category ILIKE` |
| `getCategories` | `DISTINCT c.name` de productos disponibles |
| `getPrecios` | `name, price ORDER BY price ASC` |
| `getPromociones` | `promotions WHERE end_date >= CURRENT_DATE` |
| `getUbicacion` | `businesses WHERE id = $1` |
| `getProductAttributes(productIds[])` | `product_attributes WHERE product_id IN (…)` — devuelve mapa agrupado por `product_id` |
| `getServices(businessId)` | `business_services WHERE business_id = $1 ORDER BY name` |
| `getServiceByName(businessId, name)` | `business_services WHERE name ILIKE '%name%' LIMIT 5` |

### `businessInfoService.js`
Despacha intent → `BusinessModel` via `QUERY_MAP`. El `QUERY_MAP` incluye los seis intents: `horarios`, `productos`, `precios`, `promociones`, `ubicacion`, `servicios`.

Exporta también: `getHorariosByDay`, `getCategories`, `getProductosByCategory`, `countProductosByCategory`, `getProductAttributes(productIds[])`, `getServiceByName(businessId, name)`.

### `sessionContextService.js`
Capa de acceso al contexto de sesión. Primero intenta Redis; si Redis no está disponible, usa un fallback `Map` en memoria (degradación elegante). Clave Redis: `session:{sessionId}`. TTL constante exportada: `SESSION_TTL_SECONDS = 210`.

**Estructura del contexto:**
```json
{
  "lastIntent": "productos",
  "lastEntity": { "type": "product", "value": "hamburguesa" },
  "lastEntityFound": true,
  "lastAttributes": [{ "value": "queso", "type": "ingredient" }],
  "availableCategories": ["Electrónica", "Bebidas"],
  "paginationCategory": "Electrónica",
  "paginationOffset": 10,
  "paginationTotal": 25,
  "updatedAt": "2026-04-02T12:00:00.000Z"
}
```

`lastEntityFound = false` se establece cuando un producto buscado no existe en BD; hace que el siguiente "sí" ambiguo muestre el catálogo en lugar de re-querying el mismo producto. Los campos de paginación se limpian automáticamente cuando el usuario realiza una búsqueda nueva.

### `normalize.js`
Funciones de normalización: `normalize(text)` (lowercase + NFD strip acentos + quitar ¿¡), `toSingular(word)`, `wordVariants(word)`.

### `chatSocket.js`
Punto de entrada Socket.io. Maneja `send_message` → valida `sessionId` → guarda mensaje de usuario → llama `processMessage()` → guarda y emite respuesta del bot.

Incluye un **timer de inactividad** (210 s): si el usuario no escribe durante ese tiempo, el bot envía un mensaje de reenganche con el listado de categorías disponibles y establece el contexto `category_selection` para que el siguiente mensaje pueda seleccionar una categoría directamente.

### `Message.jsx`
Componente de mensaje del frontend. Usa `white-space: pre-wrap` para que los `\n` del formateador se rendericen como saltos de línea en el navegador.

### `socketService.js`
Singleton de socket.io-client. `getSessionId()` genera un UUID v4 con una implementación propia basada en `crypto.getRandomValues()` (funciona tanto en `localhost` como en URLs de IP local vía HTTP sin HTTPS — a diferencia de `crypto.randomUUID()` que requiere un Secure Context). El UUID se persiste en `sessionStorage` (cada pestaña tiene su propio contexto).

> **Nota:** `crypto.randomUUID()` lanza `SecurityError` en Safari/Chrome cuando la página se sirve desde `http://192.168.1.x` (no es un Secure Context). El generador actual usa `getRandomValues()` que no tiene esa restricción, garantizando que el chat funcione desde el celular en la red local sin HTTPS.

---

## 6. Historial de cambios

### Sprint 1 — Infraestructura base
- Express + Socket.io + React + Vite scaffoldeado
- Mensajes en tiempo real con rooms
- Store de mensajes en memoria (`messageModel.js`)
- Respuestas mock OpenAI + keyword responses

### Sprint 2 — Intenciones y base de datos
- Árbol de 5 intents (`intents.js`)
- Queries SQL (`businessModel.js`)
- Detección de intent por keywords (`intentService.js`)
- QUERY_MAP + despacho (`businessInfoService.js`)
- Formateadores de respuesta (`intentResponseFormatter.js`)
- **Bug:** `module.exports = null` en `database.js` sobreescribía el Pool — corregido
- **Bug:** `CLIENT_URL` debe parsearse como array para multi-origen — corregido

### Sprint 3 — Acceso desde red local
- `CLIENT_URL` acepta lista separada por comas
- `socketService.js` usa `window.location.origin` en lugar de URL hardcodeada
- La app funciona desde celular en la misma red Wi-Fi

### Sprint 4 — NLP y extracción de entidades
- Instalado `compromise`
- `nlpEntityExtractor.js`: 14 patrones regex + fallback NLP + `ENTITY_BLOCKLIST` + consulta `ILIKE`
- **Pipeline:** entity (Stage 1) → intent (Stage 2) → AI fallback (Stage 3)

### Sprint 5 — Testing y CI/CD *(29 mar 2026)*
- Jest instalado + 6 suites de test (179 pruebas)
- `.github/workflows/ci.yml`: lint → test matrix (Node 18+20) → coverage + Codecov
- **Bug detectado en tests:** keyword `"sale"` en `promociones` hacía falso positivo con `"sucursales"` — eliminada

### Sprint 6 — Contexto conversacional con Redis *(30 mar 2026)*
- `ioredis` instalado
- `redis.js`: cliente singleton con `lazyConnect` y `retryStrategy`
- `sessionContextService.js`: `getContext`/`updateContext` con TTL 210 s
- `conversationalContext.js`: funciones puras de resolución de contexto
- `chatSocket.js`: pipeline reescrito con contexto completo
- `sessionStorage` + `getSessionId()` en frontend
- Nuevas suites: `sessionContextService`, `mockOpenAI`, `conversationalFlow` (251 pruebas total)

### Sprint 7 — Pipeline unificado (`messagePipeline.js`) *(30 mar 2026)*
- **Creado `messagePipeline.js`** — reemplaza la orquestación que estaba en `chatSocket.js`
- **Creado `intentDetector.js`** — scoring por peso en lugar de simple `includes()`
- **Creado `entityDetector.js`** — extractor multi-entidad con 19 patrones regex
- **Creado `dayDetector.js`** — detección de días de la semana en español
- 8 Reglas de decisión (`decide()`): day → standalone → entity → context → ambiguous → followup → ai
- **Bug corregido:** `"precio hamburguesa"` devolvía resultados del contexto en vez del mensaje
- **Bug corregido:** `"abren el lunes"` terminaba en AI fallback
- **Bug corregido:** `"abren toda la semana?"` usaba contexto en vez de responder directamente
- Nuevas suites: `dayDetector`, `entityDetector`, `normalize`, `conversationalFlow` ampliada (371 pruebas)

### Sprint 10 — Preprocesador de texto *(1 abr 2026)*
- **Creado `textPreprocessor.js`** — pipeline: normalize → expandAbbreviations → correctTypos
- ~25 abreviaturas informales en español ("xq", "q", "tb", "dir", "stk", etc.)
- Diccionario de ~100 typos comunes + corrección Levenshtein conservadora (≤2 ediciones, exactamente 1 match)
- `singularizeTokens()` para candidatos de entidad (protege verbos y stopwords)
- `processMessage()` actualizado: usa `preprocessMessage()` en lugar de `normalize()` directo
- Nueva suite: `textPreprocessor.test.js`

### Sprint 11 — Flujo híbrido IA (RAG + Motor de decisión) *(1 abr 2026)*
- **Creado `aiDecisionEngine.js`** — motor de decisión puro: `shouldUseAI()`, `hasRelevantData()`
- **Creado `ragFilterService.js`** — filtro RAG: `filterRelevantData()`, `classifyAIRequest()`, `extractComparisonEntities()`
- **Actualizado `mockOpenAI.js`** — añadida `getRAGOpenAIResponse()` para simular llamada con contexto RAG
- **Actualizado `messagePipeline.js`**:
  - `handleAIFallback()` — flujo híbrido: keyword → shouldUseAI → filterRelevantData → getRAGOpenAIResponse
  - `processMessage()` — rama `strategy='ai'` ahora llama a `handleAIFallback` en lugar de `getMockOpenAIResponse` directo
  - Logs enriquecidos: `aiUsed`, `ragType`, `ragDataCount`, `ragSummary`
- Nueva suite: `hybridFlow.test.js` (11 describes, ~88 tests)

### Sprint 12 — Correcciones de enrutamiento IA *(1 abr 2026)*

#### Problema 1 — Entidades bloqueando IA en recomendaciones
**Síntoma:** "que me recomienda de postres?" devolvía catálogo de postres en lugar de recomendación.
**Causa:** `shouldUseAI()` evaluaba `RECOMMEND_RE` DESPUÉS del guard de entidad; "postres" era detectado como entidad y el guard devolvía `backend` antes de llegar a los patrones de IA.
**Fix:**
- Movidos `RECOMMEND_RE`/`COMPARE_RE` al inicio de `shouldUseAI()`, antes del guard de entidad
- Añadida **Regla 1.5** en `decide()`: llama a `shouldUseAI()` con la entidad real detectada; si el resultado es `ai`, devuelve `strategy='ai'` antes de la Regla 2 (entity→backend)

#### Problema 2 — Contexto stale contaminando preguntas complejas
**Síntoma:** "que hamburguesa es la mas barata?" después de preguntar sobre "taco de canasta" reutilizaba el contexto de taco en lugar de razonar sobre hamburguesas.
**Causa:** faltaban patrones `SUPERLATIVE_RE`/`CAPACITY_RE` en `shouldUseAI()`; el guard de contexto no tenía límite de palabras.
**Fix:**
- Añadidos `SUPERLATIVE_RE` y `CAPACITY_RE` antes del guard de entidad en `shouldUseAI()`
- Guard de contexto limitado a mensajes de ≤ 4 palabras (mensajes más largos deben resolverse con IA)
- Patrones sincronizados en `ragFilterService.classifyAIRequest()`

#### Tabla de regresión — Sprint 12

| Mensaje | Antes | Después |
|---|---|---|
| "que me recomienda de postres?" | catálogo de postres | RAG recomendación |
| "que pizza recomiendas?" | catálogo de pizzas | RAG recomendación |
| "que hamburguesa es la mas barata?" | contexto "taco" | RAG comparación |
| "cuántos tacos puedo comer al día?" | contexto o catálogo | RAG open_query |

### Sprint 13 — Correcciones de detección de horarios y contexto de día *(1 abr 2026)*

#### Problema 1 — Horarios en segunda persona singular no detectados
**Síntoma:** "que día abres?", "cuando abres?", "a que hora abres?", "que dias vendes?" no detectaban el intent `horarios`.
**Causa:** todas las keywords del intent usaban tercera persona plural ("abren", "cierran") pero no la segunda persona singular ("abres", "cierras").
**Fix:** añadidas 9 keywords al intent `horarios` en `intents.js`:
```js
{ phrase: 'a que hora abres', weight: 3 },
{ phrase: 'a que hora cierras', weight: 3 },
{ phrase: 'que dias abres', weight: 3 },
{ phrase: 'que dia abres', weight: 3 },
{ phrase: 'que dias vendes', weight: 3 },
{ phrase: 'cuando abres', weight: 2 },
{ phrase: 'cuando cierras', weight: 2 },
{ phrase: 'abres', weight: 1 },
{ phrase: 'cierras', weight: 1 },
```

#### Problema 2 — Contexto de día contaminando consultas de producto/recomendación
**Síntoma:** tras preguntar "abres este domingo?" (entidad = `{type:'day', value:'domingo'}`), el siguiente mensaje "que pizza me recomiendas?" era enrutado a horarios con error por la Regla 6 anti-fallback.
**Causas:**
1. `RECOMMEND_RE` no incluía la forma "recomiendas" (segunda persona)
2. `SUPERLATIVE_RE` no incluía "la/el mejor"
3. La Regla 6 anti-fallback no filtraba entidades de tipo `day`

**Fix:**
- `RECOMMEND_RE`: `recomiend[ao](?:me)?` → `recomiend[ao](?:s|me|n)?`
- `SUPERLATIVE_RE`: añadida alternativa `\b(?:el|la|los|las)\s+mejor(?:es)?\b`
- Regla 6: añadido guard `context.lastEntity?.type !== 'day'`
- Mismos fixes aplicados a `ragFilterService.classifyAIRequest()`

#### Tabla de regresión — Sprint 13

| Mensaje | Antes | Después |
|---|---|---|
| "que día abres?" | sin match (fallback IA) | intent `horarios` |
| "cuando abres?" | sin match | intent `horarios` |
| "que pizza me recomiendas?" (post-domingo) | error horarios via contexto día | RAG recomendación |
| "que pizza es la mejor?" (post-domingo) | error horarios via contexto día | RAG recomendación |

#### Problema resuelto
Preguntas del tipo `"que hamburguesas tienen"`, `"que aguas tiene"` ya funcionaban (entidad detectada por el patrón `que X tienen`). Sin embargo, preguntas del tipo `"que tipo de hamburguesas tienen"` o `"que tipo de bebidas tiene"` no eran manejadas: el pipeline no extraía correctamente el candidato y caía en fallback de IA.

#### Cambios

**`entityDetector.js`**
- Añadidos 2 patrones regex en `PRODUCT_QUERY_PATTERNS` para capturar `"que tipo(s) de X tienen/hay"` antes del patrón genérico `que X tienen`.
- Añadido pre-check `TIPO_DE_RE` al inicio de `detectEntities()`: cuando el mensaje contiene `"que tipo(s) de X …"`, se consulta **categoría primero** (p. ej. "Bebidas") y solo si no hay match de categoría se consulta producto individual. Esto garantiza que `"que tipo de bebidas tiene"` devuelva la categoría completa en lugar de buscar un producto llamado "bebidas".

**`messagePipeline.js`**
- `decide()`: la Regla 2 ahora infiere `intent='productos'` para entidades de tipo `category` (antes solo lo hacía para `product`).
- `executeDecision()`: nueva rama para `entity.type === 'category'` que carga la primera página paginada de productos, actualiza el contexto Redis (`paginationCategory`, `paginationOffset`, `paginationTotal`) y permite continuar con "ver más".

**`intents.js`**
- Añadidas keywords `"que tipo de"` (weight 2) y `"que tipos de"` (weight 2) al intent `productos`.

#### Comportamiento resultante

| Mensaje | Resultado |
|---|---|
| `"que hamburguesas tienen"` | Lista de productos que contienen "hamburguesa" |
| `"que aguas tiene"` | Lista de productos que contienen "agua" |
| `"que tipo de hamburguesas tienen"` | Categoría si existe, si no: lista de hamburguesas |
| `"que tipo de bebidas tiene"` | Primera página de la categoría "Bebidas" |
| `"que bebidas tiene"` | Primera página de la categoría "Bebidas" |
| `"ver más"` (después de cualquiera) | Siguiente página de la misma categoría |

---

### Sprint 14 — Atributos de producto y servicios del negocio *(2 abr 2026)*

#### Feature A — Atributos de producto (`product_attributes`)

Cuando una consulta de producto devuelve exactamente un resultado, se buscan los atributos clave/valor en la tabla `product_attributes` y se añade una sección natural al final de la respuesta.

Rutas de respuesta que ahora incluyen atributos:
- **Entidad producto directa** (`"tienes la pizza hawaiana?"`)
- **Precios con entidad** (`"cuánto cuesta la pizza hawaiana?"`)
- **Descripción** (`"que contiene la hamburguesa bbq?"`)

Cambios:
- `businessModel.js` → `getProductAttributes(productIds[])` — query por múltiples IDs a la vez, devuelve mapa agrupado
- `businessInfoService.js` → exporta `getProductAttributes`
- `intentResponseFormatter.js` → `formatProductAttributes(attrsMap, productId)` — devuelve `''` si no hay atributos
- `messagePipeline.js` → inyección de atributos en las tres rutas de respuesta de producto

#### Feature B — Servicios del negocio (`business_services`)

Nuevo intent `servicios` (standalone: true). Responde con la lista de servicios disponibles e invita a preguntar por uno específico. Si el usuario nombra un servicio, responde con nombre + descripción + precio.

La respuesta de `ubicacion` ahora incluye automáticamente un listado de los servicios del negocio.

Cambios:
- `businessModel.js` → `getServices(businessId)`, `getServiceByName(businessId, name)`
- `businessInfoService.js` → `getServiceByName` exportado; `servicios` en `QUERY_MAP`
- `intentResponseFormatter.js` → `FORMATTERS.servicios`, `formatServiceDetail(service)`
- `intents.js` → nuevo intent `servicios` (standalone: true). Frases `"que servicios ofrecen/tienen/ofrece"` **movidas** desde `productos` donde causaban falsos positivos de enrutamiento
- `messagePipeline.js` → nuevas ramas `intent === 'servicios'` con y sin entidad; `ubicacion` ahora appends el listado de servicios

---

### Sprint 15 — Correcciones de follow-up con artículo y flujo post-error *(2 abr 2026)*

#### Problema 1 — Follow-up con artículo disparaba "no encontré el producto"

**Síntoma:** Tras preguntar por la hamburguesa BBQ y recibir respuesta, escribir **"la pizza mexicana"** (artículo incluido) devolvía "no encontré el producto" aunque Pizza Mexicana existe en la BD.

**Causa:** `extractFollowUpEntity()` Shape 2 (bare noun) retornaba el texto literal `"la pizza mexicana"`. La query `ILIKE '%la pizza mexicana%'` no coincide con el nombre real `"Pizza Mexicana"`.

**Fix:** Función interna `stripLeadingArticle()` en `extractFollowUpEntity` que elimina artículos iniciales (`el/la/los/las/un/una`) antes de devolver el candidato. Aplicado en Shape 1a, 1b y Shape 2.

#### Problema 2 — `lastEntityFound = false` no se propagaba en rutas followup/context

**Síntoma:** Tras un miss de producto vía follow-up ("la torta de res" no existe), escribir **"sí"** re-preguntaba lo mismo en lugar de mostrar el catálogo.

**Causa:** El guard `lastEntityFound = false` en `processMessage` solo cubría `strategy === 'entity'`. Las rutas `followup` y `context` no tenían mecanismo de detección de miss.

**Fix:** Detect miss vía texto de respuesta: si `replyText` comienza con `"Lo siento, no encontr"` o `"No encontr"` en estrategias `followup`/`context`, se establece `lastEntityFound = false`.

#### Problema 3 — `lastEntityFound = false` + "sí" → intent equivocado

**Síntoma:** `"sí"` después de un miss con intent=`descripcion` → prompts `"¿Sobre qué producto deseas más información?"` en lugar del catálogo.

**Fix:** Regla 4 de `decide()` ahora fuerza `intent = 'productos'` cuando `lastEntityFound === false`, sin importar cuál era el `lastIntent` anterior.

#### Tabla de regresión — Sprint 15

| Mensaje | Antes | Después |
|---|---|---|
| `"la pizza mexicana"` (follow-up) | "no encontré el producto" | Info de Pizza Mexicana |
| `"el taco pastor"` (follow-up) | "no encontré el producto" | Info del producto |
| `"sí"` tras miss (intent=descripcion) | Re-prompt ¿sobre qué producto? | Catálogo de productos |
| `"sí"` tras miss (intent=productos) | Re-query del mismo producto fallido | Catálogo de productos |

---

### Sprint 16 — Correcciones de enrutamiento por keywords y contexto general *(2 abr 2026)*

#### Problema 1 — "productos disponibles" enviaba al fallback de IA

**Síntoma:** El bot presenta un menú de ayuda con la opción "Productos disponibles". Al escribirla, el usuario recibía de nuevo el mismo mensaje de fallback.

**Causa:** `"productos disponibles"` no coincidía con ninguna keyword del intent `productos` y caía en el mock de IA sin contexto → respuesta genérica.

**Fix:** Añadidas keywords al intent `productos` en `intents.js`:
```js
{ phrase: 'productos disponibles', weight: 2 },
{ phrase: 'ver productos',         weight: 2 },
{ phrase: 'ver catalogo',          weight: 2 },
{ phrase: 'productos',             weight: 1 },
```

#### Problema 2 — Consulta general del catálogo heredaba entidad del contexto

**Síntoma:** Secuencia: `pizza mexicana` → `precio` → `pizza hawaiana` → **`"que productos tienes"`** → la respuesta mostraba info sobre pizza hawaiana en lugar del catálogo.

**Causa:** `productos` tiene `standalone: false`. La Regla 3 de `decide()` siempre heredaba `lastEntity` del contexto para intents no-standalone, aunque el mensaje fuera una petición explícita del catálogo completo.

**Fix — Regla 2.5 en `decide()`:** Cuando `intent=productos` + `score ≥ HIGH_CONFIDENCE_THRESHOLD (3)` + sin entidad en el mensaje → devuelve `strategy=intent, entity=null, usedContext=false` antes de llegar a la Regla 3.

**Fix — `buildContextUpdate()`:** Cuando una consulta general de catálogo se resuelve (`strategy=intent, intent=productos, entity=null`), se limpia `lastEntity` en Redis para que no contamine turnos posteriores.

#### Tabla de regresión — Sprint 16

| Mensaje | Antes | Después |
|---|---|---|
| `"productos disponibles"` (sin contexto) | Fallback IA genérico | Intent `productos` → catálogo |
| `"que productos tienes"` (con ctx pizza) | Info de pizza del contexto | Catálogo / lista de categorías |
| `"que vendes"` (con ctx producto) | Mismo producto del contexto | Catálogo general |
| `"precios"` `"cuanto cuesta"` (con ctx) | Sin cambio — sigue usando contexto ✓ | Sin cambio ✓ |

---

### Sprint 17 — Chat UI rediseño + fix envío mobile *(3 abr 2026)*

#### Feature A — Rediseño completo de la interfaz del chat

Nueva paleta de colores light/blanca elegante (reemplaza el tema oscuro anterior):

| Token CSS | Valor | Uso |
|---|---|---|
| `--bg` | `#f0eff8` | Fondo general (lavanda-blanco) |
| `--surface` | `#ffffff` | Cards, header, input bar |
| `--surface-2` | `#f5f4fc` | Fondo de burbujas ajenas, inputs |
| `--accent` | `#5b50f5` | Indigo principal (botones, mis burbujas) |
| `--text` | `#1a1833` | Texto principal (navy oscuro) |
| `--success` | `#10b981` | Dot "En línea" |

Cambios visuales:
- `BusinessSelector.jsx` → cards con letter-avatar degradado, ciudad como subtítulo, pasa `{ name, city }` via navigation state
- `ChatPage.jsx` → lógica `useLocation().state` para leer nombre del negocio; join form con logo emoji + `name-input` + `join-btn`
- `ChatWindow.jsx` → header con `chat-header__avatar` (primera letra del negocio), nombre, dot de estado verde, badge `@usuario`
- `Message.jsx` → `message__avatar` (28px) para mensajes del bot; `message__body` wrapper; `white-space: pre-wrap` movido a CSS
- `MessageInput.jsx` → botón circular SVG (icono de avión), placeholder en español
- `MessageList.jsx` → indicador de escritura con tres puntos animados (`bounce` keyframe) en lugar de texto plano
- `App.css` → sistema completo: variables CSS, animaciones `fadeSlideUp`/`msgIn`/`bounce`, join-card con slide desde abajo en mobile, `100dvh` para viewport dinámico
- `index.html` → `viewport-fit=cover` para iPhone notch/home indicator

#### Feature B — Fix definitivo de envío de mensajes en iPhone/Android

**Problema:** el mensaje no se enviaba al presionar el botón en iOS Safari.

**Causa raíz:** `crypto.randomUUID()` requiere un Secure Context (HTTPS). Al acceder desde `http://192.168.1.3:5173` (LAN sin HTTPS) lanzaba `SecurityError` silencioso → `sessionId = undefined` → el backend rechazaba el mensaje con `"sessionId requerido"` sin ningún error visible en pantalla.

**Fix:**
- `socketService.js` → función interna `generateUUID()` usando `crypto.getRandomValues()` (sin restricción de Secure Context)
- `MessageInput.jsx` → eliminado `disabled` nativo (bloquea todos los eventos en iOS); usa `aria-disabled` + `onTouchStart` con `e.preventDefault()` para disparar antes del blur + `onClick` como fallback desktop; texto en ref (`textRef`) para evitar closures stale
- `App.css` → `touch-action: manipulation` en `.send-btn` elimina el delay de 300ms en Android

---

### Sprint 8 — Formato de listas + paginación *(31 mar 2026)*

#### Mejoras de formato
- `intentResponseFormatter.js`: helper `formatList(title, items)` — todas las respuestas multi-resultado usan `\n\n` entre título e items, y `\n` entre items; `exportado`
- `entityDetector.js`: `formatProductResponse` y `formatCategoryResponse` usan bullet `•`  por item con stock y disponibilidad
- `Message.jsx`: `white-space: pre-wrap` aplicado — los `\n` ahora se renderizan como saltos de línea en el navegador

#### Paginación de catálogo (`messagePipeline.js`)
- Si `productos.length > 20` → pivot: mostrar lista de categorías en vez del catálogo completo
- Usuario selecciona categoría → se carga la primera página (10 productos)
- "ver más" / "siguiente" → siguiente bloque de 10
- Estado de paginación guardado en Redis: `paginationCategory`, `paginationOffset`, `paginationTotal`
- Nueva búsqueda → limpia estado de paginación automáticamente

#### Nuevos métodos en `businessModel.js`
- `getCategories(businessId)` — categorías distintas disponibles
- `getProductosByCategory(businessId, cat, limit, offset)` — productos paginados
- `countProductosByCategory(businessId, cat)` — total para calcular "1–10 de 25"

#### Tests añadidos (379 pruebas total)
- 8 nuevos casos en `conversationalFlow.test.js`: hard-limit, contexto category_selection, selección de categoría, paginación, reset de contexto

---

## 7. Testing

**795 pruebas** en **15 suites** — todas pasan (`npm test`).

### Ejecutar los tests

```bash
cd backend
npm test                 # Corre todos los tests una vez
npm run test:watch       # Modo interactivo
npm run test:coverage    # Reporte HTML en ./coverage/
```

### Suites

| Archivo | Módulo cubierto | Aprox. casos |
|---|---|---|
| `attributeSearch.test.js` | buildAttributeConditions, searchByAttribute(s), formatAttributeResponse | ~20 |
| `businessInfoService.test.js` | QUERY_MAP (6 intents), despacho, errores BD | ~13 |
| `conversationalFlow.test.js` | Pipeline multi-turno, decide() (incl. Regla 2.5), buildContextUpdate(), paginación, extractFollowUpEntity, follow-up con artículo, catálogo general vs contexto | ~177 |
| `dayDetector.test.js` | Detección de 7 días, word-boundary, sin match | ~15 |
| `entityDetector.test.js` | 21 patrones regex, blocklist, formatters, TIPO_DE_RE | ~55 |
| `hybridFlow.test.js` | shouldUseAI(), hasRelevantData(), classifyAIRequest(), filterRelevantData(), handleAIFallback(), processMessage(), regresiones de enrutamiento | ~88 |
| `intentResponseFormatter.test.js` | formatList, 6 formatters (incl. servicios), formatProductAttributes, formatServiceDetail | ~35 |
| `intentService.test.js` | 6 intents, scoring, edge cases, formas tu-persona, servicios | ~84 |
| `keywordResponses.test.js` | Keywords, sin match, guards | ~16 |
| `messageModel.test.js` | create(), findByRoom(), clear() | ~10 |
| `mockOpenAI.test.js` | getMockOpenAIResponse, getRAGOpenAIResponse | ~25 |
| `nlpEntityExtractor.test.js` | normalize(), patrones, blocklist, trigger, NLP | ~36 |
| `normalize.test.js` | Funciones de normalización y variantes | ~15 |
| `sessionContextService.test.js` | getContext/updateContext, TTL, merge parcial, in-memory fallback | ~30 |
| `textPreprocessor.test.js` | expandAbbreviations, correctTypos, preprocessMessage | ~96 |

### Describes de `hybridFlow.test.js`

| Describe | Qué cubre |
|---|---|
| `shouldUseAI()` | Todas las reglas del motor de decisión |
| `hasRelevantData()` | Casos de RAG context vacío vs con datos |
| `classifyAIRequest()` | Clasificación en 5 tipos |
| `extractComparisonEntities()` | Patrones "X o Y", "X vs Y", sin match |
| `filterRelevantData()` | Ramas recommendation/comparison/empty |
| `handleAIFallback()` | Flujo completo: keyword→decision→RAG→AI |
| `processMessage() — hybrid flow` | Integración completa con BD mock |
| `Bug-regression: entity detection MUST NOT block AI` | RECOMMEND_RE/COMPARE_RE antes de entidad |
| `Bug-regression: complex questions MUST NOT reuse stale context entity` | SUPERLATIVE_RE/CAPACITY_RE |
| `Bug-regression: queries after day context MUST NOT reuse day entity` | Guard `type !== 'day'` en Regla 6 |
| `Anti-patterns: AI MUST NOT be used when backend can resolve` | Entidades/intents conocidos no van a IA |

### Mocking

| Módulo | Test que lo mockea | Razón |
|---|---|---|
| `../../src/config/database` | `entityDetector`, `conversationalFlow`, `nlpEntityExtractor`, `hybridFlow`, `attributeSearch` | Evitar PostgreSQL real |
| `ioredis` | `sessionContextService`, `conversationalFlow`, `hybridFlow` | Evitar Redis real (Map en memoria) |
| `../../src/models/businessModel` | `businessInfoService`, `hybridFlow` | Aislar QUERY_MAP y queries RAG |

---

## 8. CI/CD — GitHub Actions

Archivo: `.github/workflows/ci.yml`
Activa en **push** y **pull request** sobre `main` y `develop`.

```
┌─────────┐     ┌────────────────────────┐     ┌──────────────────┐
│  lint   │────▶│  test (Node 18 + 20)   │────▶│  coverage        │
│ ESLint  │     │  matrix: fail-fast off │     │  Node 20 solo    │
│ Node 20 │     │  artifacts: JUnit XML  │     │  HTML + Codecov  │
└─────────┘     └────────────────────────┘     └──────────────────┘
```

Secreto requerido: `CODECOV_TOKEN` (en Settings → Secrets → Actions).

---

## 9. Cómo extender el sistema

### Agregar un nuevo intent

1. `intents.js` → nueva clave con `standalone`, `keywords[]`
2. `businessModel.js` → nuevo método con la query SQL
3. `businessInfoService.js` → entrada en `QUERY_MAP` + exportar helpers si el pipeline los necesita directamente
4. `intentResponseFormatter.js` → nueva función en `FORMATTERS` (y exportar si `executeDecision` la usa directamente)

### Agregar patrones de consulta de producto

`entityDetector.js` → `PRODUCT_QUERY_PATTERNS[]`: agregar regex con `(?<entity>…)` **antes** del patrón genérico `que X tienen` para evitar que éste lo absorba.
Si el nuevo patrón requiere consultar categoría antes que producto (como `"que tipo de X"`), agregar la lógica al bloque de pre-checks en `detectEntities()`.
Si es un verbo/trigger nuevo, añadirlo a `PRODUCT_TRIGGER_WORDS`.

### Cambiar el límite de paginación

`messagePipeline.js`:
- `PRODUCTS_HARD_LIMIT = 20` — máximo antes de mostrar categorías
- `PAGE_SIZE = 10` — productos por página

### Cambiar el TTL del contexto

`sessionContextService.js` → `SESSION_TTL_SECONDS` (default: `210`).

### Soporte multi-negocio

`chatSocket.js` tiene `ACTIVE_BUSINESS_ID = 1`. Para multi-negocio, el frontend debe enviar `businessId` en el payload de `send_message` y pasarlo a `processMessage`.

### Activar OpenAI real

El flujo híbrido ya está implementado y funcional con un mock. Para conectar OpenAI real:

1. `backend/.env` → `OPENAI_API_KEY=sk-…`
2. Crear `src/services/openaiService.js` que exporte `chat(userMessage, ragContext, sessionContext)`
3. En `handleAIFallback()` de `messagePipeline.js`, reemplazar la llamada a `getRAGOpenAIResponse()` por `openaiService.chat(originalText, ragContext, context)`
4. El prompt del sistema debe incluir los datos de `ragContext.data` (ya compactos/filtrados por `ragFilterService`) para aprovechar el contexto RAG

> `ragFilterService.js` ya se encarga de traer sólo los datos relevantes (máx. 15 ítems). El formato de `ragContext` es `{ type, data[], summary, total }` — listo para serializar al prompt.

---

## 10. Cómo correr el proyecto

### Requisitos

- Node.js ≥ 18
- PostgreSQL corriendo en el puerto 5432
- Redis corriendo en el puerto 6379

```bash
# Aplicar esquema y seed
psql -U postgres -d aichat -f backend/src/config/schema.sql
```

> **Redis en Windows:** WSL2 (`sudo apt install redis-server`) o Docker (`docker run -d -p 6379:6379 redis:alpine`).
> Sin Redis, el chat funciona sin contexto conversacional.

### Backend

```bash
cd backend
cp .env.example .env   # solo la primera vez — editar con credenciales de postgres
npm install
npm run dev            # nodemon en puerto 3000
```

### Frontend

```bash
cd frontend
cp .env.example .env   # solo la primera vez
npm install
npm run dev            # Vite en puerto 5173
```

### Acceso

| Dispositivo | URL |
|-------------|-----|
| PC | http://localhost:5173 |
| Celular (misma Wi-Fi) | http://192.168.1.3:5173 |

> La app funciona desde el celular en HTTP plano (sin HTTPS) gracias al fix de `crypto.getRandomValues()` en `socketService.js`.
> Si cambia tu IP local, actualizar solo `CLIENT_URL` en `backend/.env`.


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
│       │   ├── conversationalContext.js    Funciones puras de resolución de contexto
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
│       ├── businessInfoService.test.js      Tests del QUERY_MAP (BusinessModel mockeado)
│       ├── conversationalFlow.test.js       Tests de integración del pipeline multi-turno
│       ├── intentResponseFormatter.test.js  Tests de todos los formateadores
│       ├── intentService.test.js            Tests de detección de intenciones
│       ├── keywordResponses.test.js         Tests de respuestas por palabras clave
│       ├── messageModel.test.js             Tests del store en memoria
│       ├── mockOpenAI.test.js               Tests del mock de OpenAI con contexto
│       ├── nlpEntityExtractor.test.js       Tests del extractor NLP (DB mockeada)
│       └── sessionContextService.test.js    Tests de getContext/updateContext (Redis mockeado)
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

El evento `send_message` recibe `{ roomId, sender, text, sessionId }`.  
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
        │  PASO 2 — Detección del mensaje actual (3 mecanismos)
        │
        │  A) extractProductEntity(normalize(text))  [Regex + NLP]
        │     Extrae el nombre de producto del mensaje:
        │       "¿y cuánto cuesta?" → null  (no hay producto nombrado)
        │       "tienen pizza doble?" → "pizza doble"
        │
        │  B) detectIntent(text)  [Keyword matching]
        │     Detecta el tema por palabras clave:
        │       "¿y cuánto cuesta?" → "precios"  (keyword "cuánto cuesta")
        │       "cuando abren?"     → "horarios"
        │
        │  C) extractFollowUpProduct(normalized, context.lastProduct)  [Follow-up]
        │     Solo activa si A) y B) devuelven null Y hay lastProduct en contexto.
        │     Captura mensajes tipo "¿Y pizza mexicana?" (empieza con "y ").
        │     Rechaza palabras interrogativas (no es una pregunta de acción).
        │       "¿Y pizza mexicana?" + lastProduct="pizza" → "pizza mexicana"
        │       "¿Y cuánto cuesta?"  + lastProduct="pizza" → null (interrogativa)
        │
        ├─────────────────────────────────────────────────────────
        │  PASO 3 — Resolución efectiva con fallback de contexto
        │  (resolveEffectiveContext — conversationalContext.js)
        │
        │  4 prioridades en orden:
        │
        │  1. Nuevo producto detectado → producto track, effectiveIntent = null
        │       "tienen pizza?" → effectiveProduct="pizza", effectiveIntent=null
        │
        │  2. Intent STANDALONE (horarios, ubicacion) → ignora lastProduct
        │       "¿a qué hora abren?" después de hablar de pizza:
        │       → effectiveProduct=null, effectiveIntent="horarios"
        │       (evita mezclar la respuesta de horarios con el producto previo)
        │
        │  3. Intent dependiente de producto → hereda lastProduct del contexto
        │       "¿y cuánto cuesta?" (precios) + lastProduct="hamburguesa"
        │       → effectiveProduct="hamburguesa", effectiveIntent="precios"
        │
        │  4. Nada detectado → fallback completo al contexto previo
        │       sin match alguno → usa context.lastProduct y context.lastIntent
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
        │    3. Si falla la DB → delegar a getMockOpenAIResponse (sin contexto)
        │
        │  handleWithAI:
        │    1. getKeywordResponse(text)  → saludos / frases simples
        │    2. getMockOpenAIResponse(text, context)  → respuesta contextual
        │       (en producción: llamada real a OpenAI con historial)
        │
        ├─────────────────────────────────────────────────────────
        │  PASO 5 — buildContextUpdate + updateContext  [Redis]
        │  (buildContextUpdate — conversationalContext.js)
        │
        │  Decide qué persistir según lo detectado en este turno:
        │    • Producto detectado → guarda producto + limpia intent
        │    • Intent STANDALONE  → guarda intent + limpia producto
        │    • Intent dependiente → guarda solo intent (merge preserva lastProduct)
        │    • Nada detectado     → no llama updateContext (sin cambios)
        │
        │  TTL: 210 segundos (3.5 min), renovado con cada mensaje activo.
        │  Si Redis no está disponible, el chat sigue sin guardar contexto.
        │
        └─────────────────────────────────────────────────────────
```

#### Tabla de ejemplos con contexto

| Turno | Mensaje | detectedProduct | detectedIntent | effectiveProduct | effectiveIntent | Respuesta |
|-------|---------|-----------------|----------------|------------------|-----------------|-----|
| 1 | "tienen hamburguesa doble?" | `hamburguesa doble` | null | `hamburguesa doble` | null | Tarjeta del producto |
| 2 | "¿y cuánto cuesta?" | null | `precios` | `hamburguesa doble` (contexto) | `precios` | Precio de hamburguesa doble |
| 3 | "¿y pizza mexicana?" (follow-up) | null (regex) → `pizza mexicana` (C) | null | `pizza mexicana` | null | Tarjeta de pizza mexicana |
| 4 | "cuando abren?" | null | `horarios` (standalone) | null | `horarios` | Tabla de horarios completa |
| 5 | "hola" | null | null | null | null | Respuesta keywordResponses / AI |

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

### `backend/src/services/conversationalContext.js`
Funciones puras de resolución de contexto conversacional. Separadas del socket para ser independientemente testeables. Exporta:

- `resolveEffectiveContext(detectedProduct, detectedIntent, context)` — aplica las 4 prioridades para determinar `effectiveProduct` y `effectiveIntent`
- `buildContextUpdate(detectedProduct, detectedIntent)` — construye el objeto parcial a persistir en Redis; gestiona STANDALONE_INTENTS: al detectar horarios/ubicacion limpia `lastProduct` para no mezclar tracks
- `extractFollowUpProduct(normalizedText, lastProduct)` — captura mensajes `"¿Y X?"` cuando hay un producto-track activo
- `shouldUseContext(detectedIntent)` — retorna `false` para intents standalone (exportada para tests)

**`STANDALONE_INTENTS`:** Set con `'horarios'` y `'ubicacion'`. Estas intenciones se responden sin necesitar producto. Bug resuelto: sin esta distinción, preguntar `"¿a qué hora abren?"` después de hablar de un producto devolvía una respuesta mezclada con el producto previo.

### `backend/src/sockets/chatSocket.js`
Orquestador principal con pipeline de contexto conversacional. El handler `send_message` recibe `sessionId`, recupera contexto de Redis, ejecuta los tres mecanismos de detección (NLP, keywords, follow-up), delega la resolución a `conversationalContext.resolveEffectiveContext()`, decide entre `handleWithRules` o `handleWithAI`, y persiste solo si hay cambios con `buildContextUpdate()`.

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
| `backend/src/services/conversationalContext.js` | Funciones puras: `resolveEffectiveContext`, `buildContextUpdate`, `extractFollowUpProduct`, `shouldUseContext` |

#### Archivos modificados

| Archivo | Cambio |
|---|---|
| `backend/src/config/env.js` | Agrega `REDIS_HOST`, `REDIS_PORT` |
| `backend/src/services/nlpEntityExtractor.js` | Exporta `queryProductByEntity` y `formatProductResponse` para reuso en chatSocket |
| `backend/src/temp/mockOpenAI.js` | Recibe `context` y genera respuestas coherentes con `lastProduct` / `lastIntent` |
| `backend/src/sockets/chatSocket.js` | Pipeline reescrito con contexto: `getContext` → detección triple (entity + intent + follow-up) → `resolveEffectiveContext` → `handleWithRules`/`handleWithAI` → `buildContextUpdate` + `updateContext` |
| `frontend/src/services/socketService.js` | Agrega `getSessionId()` con `crypto.randomUUID()` + `sessionStorage` |
| `frontend/src/hooks/useSocket.js` | `sendMessage` incluye `sessionId` en el payload |
| `backend/.env` *(si existe)* | Agregar `REDIS_HOST=localhost` y `REDIS_PORT=6379` |

#### Comportamiento nuevo

- Las sesiones son anónimas — no hay login ni JWT
- Cada pestaña del navegador tiene su propio `sessionId` en `sessionStorage`
- El contexto expira a los 3.5 minutos de inactividad (TTL Redis)
- Si Redis no está disponible, el chat responde sin contexto (degradación elegante)
- Preguntas de seguimiento como "¿y cuánto cuesta?" usan el producto del turno anterior
- Preguntas de refinamiento como "¿Y pizza mexicana?" detectadas con `extractFollowUpProduct`
- Intenciones standalone (`horarios`, `ubicacion`) responden sin mezclar el producto previo

#### Bug resuelto

- **Track mixing:** usuario pregunta `"pizza"` → luego `"¿a qué hora abren?"` → el pipeline anterior devolvía `effectiveProduct="pizza"` + `effectiveIntent="horarios"`, lo que podía producir una respuesta sobre horarios mezclada con el producto. Con `STANDALONE_INTENTS`, `horarios` y `ubicacion` ignoran el `lastProduct` del contexto y limpian el track al guardarlo.

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

#### Resultado de los tests (Sprint 5)

```
Test Suites: 6 passed, 6 total
Tests:       179 passed, 179 total
Time:        ~4 s
```

#### Bugs encontrados y corregidos durante testing
- La keyword `"sale"` en `intents.js` (intent `promociones`) era un substring de `"sucursales"`, provocando que mensajes de ubicación fueran clasificados como promociones. Se eliminó `"sale"` del árbol.
- Typo `coverageThresholds` → `coverageThreshold` en `package.json` (Jest validation warning).

### Sprint 6 (cont.) — Tests del sistema de contexto  *(30 mar 2026)*

Junto con los archivos de producción del Sprint 6, se crearon 3 nuevos archivos de test:

| Archivo | Propósito | Casos |
|---|---|---|
| `tests/unit/sessionContextService.test.js` | `getContext` / `updateContext` con ioredis mockeado (Map en memoria); TTL, merge parcial, resiliencia a JSON inválido | ~30 |
| `tests/unit/mockOpenAI.test.js` | `getMockOpenAIResponse()` sin contexto, con `lastProduct`, con `lastIntent`, prioridad producto > intent | ~20 |
| `tests/unit/conversationalFlow.test.js` | Tests de integración del pipeline completo: `resolveEffectiveContext`, `buildContextUpdate`, `extractFollowUpProduct`, `shouldUseContext`, escenarios multi-turno (horarios → pizza → pizza mexicana), TTL expirado | ~40 |

#### Resultado de los tests (Sprint 6)

```
Test Suites: 9 passed, 9 total
Tests:       251 passed, 251 total
Time:        ~4 s
```

---

## 7. Testing

El backend cuenta con una suite de **251 pruebas** en `backend/tests/unit/` distribuidas en **9 suites**.

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

### Suites de tests

| Archivo | Módulo cubierto | Aprox. casos |
|---|---|---|
| `businessInfoService.test.js` | `QUERY_MAP`, despacho de intents, errores de BD | 13 |
| `conversationalFlow.test.js` | Pipeline multi-turno completo, `resolveEffectiveContext`, `buildContextUpdate`, `extractFollowUpProduct` | ~40 |
| `intentResponseFormatter.test.js` | Todos los formateadores, `formatTime`, fallbacks vacíos/null | 34 |
| `intentService.test.js` | Detección de 5 intents, edge cases accent/case insensitive | 70 |
| `keywordResponses.test.js` | Keywords conocidas, sin match, guards null/undefined/empty | 16 |
| `messageModel.test.js` | `create()`, `findByRoom()`, `clear()` | 10 |
| `mockOpenAI.test.js` | `getMockOpenAIResponse()` con/sin contexto, prioridades | ~20 |
| `nlpEntityExtractor.test.js` | `normalize()`, 14 patrones regex, blocklist, trigger words guard | 36 |
| `sessionContextService.test.js` | `getContext` / `updateContext`, merge parcial, resiliencia JSON | ~30 |

### Estrategia de mocking

| Módulo mockeado | Usado en test | Razón |
|---|---|---|
| `../../src/config/database` | `nlpEntityExtractor.test.js`, `conversationalFlow.test.js` | Evitar conexión real a PostgreSQL |
| `../../src/models/businessModel` | `businessInfoService.test.js` | Aislar la lógica de despacho del QUERY_MAP |
| `ioredis` | `sessionContextService.test.js`, `conversationalFlow.test.js` | Evitar conexión real a Redis (Map en memoria como sustituto) |

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
