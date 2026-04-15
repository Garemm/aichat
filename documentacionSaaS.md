# LLM Chat AI — Documentación del Panel de Administración (SaaS)

> Última actualización: 15 de abril de 2026 — v1.5 (analytics, pedidos, suscripciones, legal, MiHayChat QR, registro público, permisos por suscripción)
> Estado: desarrollo activo
> Archivo: `documentacionSaaS.md`

---

## Resumen del proyecto

El **Panel de Administración** es una aplicación web SaaS multi-tenant que permite a los dueños de negocios gestionar toda la información que el chatbot (ver `documentacionChat.md`) usa para responder preguntas, y a un gestor de suscripciones activar/desactivar negocios y asignar planes.

**Funcionalidades clave:**
- CRUD completo de productos (con importación masiva CSV/Excel), servicios, promociones, categorías y horarios
- **Pedidos en tiempo real:** panel de pedidos del día con estados (aceptado, listo, liberado); toggle `acepto_pedidos` para abrir/cerrar recepciones
- **Analytics:** gráficas de top 10 productos más consultados y tráfico por hora del día (Recharts), generadas desde `product_query_logs`
- **MiHayChat:** página que muestra el QR + URL pública del chat del negocio (via `chat_uuid`)
- **Panel de suscripciones:** solo accesible para admins con permiso `suscripciones`; activar/desactivar negocios y asignar planes
- **Registro público:** `POST /admin/register` crea un negocio con `is_active = false`; requiere activación por el gestor de suscripciones
- **Documentos legales:** `GET /admin/legal/:type` sirve los archivos `.md` de aviso de privacidad y términos
- Autenticación JWT dual-token (access 9 min + refresh 1 día) con rotación y revocación en BD; access token solo en memoria React (nunca en localStorage)

La aplicación consta de dos proyectos independientes:

| Proyecto | Directorio | Puerto dev |
|---|---|---|
| Admin Backend (API REST) | `admin-backend/` | 4000 |
| Admin Frontend (React SPA) | `admin-frontend/` | 5174 |

Comparte la misma base de datos PostgreSQL con el chat backend (puerto 3000).

---

## Índice

1. [Estructura del proyecto](#1-estructura-del-proyecto)
2. [Variables de entorno](#2-variables-de-entorno)
3. [Autenticación](#3-autenticación)
4. [API REST — Endpoints](#4-api-rest--endpoints)
5. [Modelos de base de datos](#5-modelos-de-base-de-datos)
6. [Controladores](#6-controladores)
7. [Frontend — Páginas y componentes](#7-frontend--páginas-y-componentes)
8. [Flujo de una solicitud típica](#8-flujo-de-una-solicitud-típica)
9. [Sistema de diseño (CSS)](#9-sistema-de-diseño-css)
10. [Historial de cambios](#10-historial-de-cambios)
11. [Cómo correr el proyecto](#11-cómo-correr-el-proyecto)

---

## 1. Estructura del proyecto

```
admin-backend/
├── .env
├── server.js
├── avisoPrivacidad.md          ← leído por GET /admin/legal/privacy
├── terminosYCondiciones.md     ← leído por GET /admin/legal/terms
└── src/
    ├── app.js                      ← Express app, CORS, rutas
    ├── config/
    │   ├── database.js             ← Pool PostgreSQL (pg)
    │   ├── jwt.js                  ← signAccess/signRefresh (access 9 min, refresh 1 día) + REFRESH_COOKIE_OPTS
    │   └── schema.sql              ← DDL completo
    ├── controllers/
    │   ├── analyticsController.js  ← GET /analytics/top-products/:id, /traffic-by-hour/:id
    │   ├── authController.js       ← login, refresh, logout, forgotPassword, resetPassword, changePassword
    │   ├── businessController.js   ← GET|PUT /admin/business, GET /admin/dashboard, toggle acepto-pedidos
    │   ├── businessTypeController.js ← GET /admin/business-types
    │   ├── categoryController.js   ← CRUD /admin/categories
    │   ├── hoursController.js      ← GET|POST|DELETE /admin/hours
    │   ├── importController.js     ← preview + confirm importación CSV/Excel
    │   ├── legalController.js      ← GET /admin/legal/:type → lee .md del filesystem
    │   ├── pedidosController.js    ← GET /admin/orders/today, PUT /admin/orders/:id
    │   ├── productController.js    ← CRUD /admin/products
    │   ├── promotionController.js  ← CRUD /admin/promotions
    │   ├── registerController.js   ← POST /admin/register (público, crea negocio con is_active=false)
    │   ├── serviceController.js    ← CRUD /admin/services
    │   └── subscriptionController.js ← GET|PUT /admin/subscriptions, PUT /:id/plan
    ├── middlewares/
    │   ├── errorHandler.js
    │   ├── requireAuth.js                    ← Guard Bearer JWT
    │   └── requireSubscriptionPermission.js  ← Guard permiso `suscripciones` en BD
    ├── models/
    │   ├── adminModel.js
    │   ├── businessModel.js        ← incluye chat_uuid, acepto_pedidos, subscription_id, google_maps_url
    │   ├── businessTypeModel.js
    │   ├── categoryModel.js
    │   ├── hoursModel.js
    │   ├── productModel.js
    │   ├── promotionModel.js
    │   └── serviceModel.js
    └── routes/
        └── index.js                ← Router global bajo /admin

admin-frontend/
├── index.html
├── vite.config.js
└── src/
    ├── App.jsx                     ← Router raíz con AuthProvider + ToastProvider
    ├── index.css                   ← Sistema de diseño SaaS completo (dark sidebar)
    ├── main.jsx
    ├── components/
    │   ├── forms/
    │   │   ├── BusinessForm.jsx    ← Formulario del negocio (nombre, ciudad, dir, tel, email, web)
    │   │   ├── ProductForm.jsx     ← Formulario de producto (create/edit)
    │   │   ├── PromotionForm.jsx   ← Formulario de promoción
    │   │   └── ServiceForm.jsx     ← Formulario de servicio
    │   └── ui/
    │       ├── Icon.jsx            ← Componente SVG con íconos inline
    │       └── Spinner.jsx         ← Spinner de carga
    ├── context/
    │   ├── AuthContext.jsx         ← Token JWT en memoria React (sin localStorage); silent refresh en mount; auto-refresh timer 14 min
    │   └── ToastContext.jsx        ← Notificaciones toast (success/error/info)
    ├── layout/
    │   ├── AdminLayout.jsx         ← Shell: Sidebar + Navbar + Outlet; gestión hamburger
    │   ├── Navbar.jsx              ← Barra superior con botón hamburger (mobile)
    │   └── Sidebar.jsx             ← Menú lateral con íconos; auto-cierre en mobile
    ├── pages/
    │   ├── Dashboard.jsx           ← Stats: nº productos, servicios, promociones + gráficas analytics
    │   ├── BusinessInfo.jsx        ← Editar nombre, ciudad, dirección, teléfono, email, página web, Google Maps URL
    │   ├── Categories.jsx          ← CRUD categorías
    │   ├── ChangePassword.jsx      ← Cambio de contraseña (siempre accesible)
    │   ├── ForgotPassword.jsx      ← Solicitud de reset por email (público)
    │   ├── Hours.jsx               ← Horarios por día (7 días, toggle open/closed)
    │   ├── Import.jsx              ← Importación masiva de productos desde CSV/Excel (preview + confirm)
    │   ├── Login.jsx               ← Pantalla de login
    │   ├── MiHayChat.jsx           ← QR + URL pública del chat del negocio (via chat_uuid)
    │   ├── Pedidos.jsx             ← Panel pedidos del día (liberado=FALSE) con estados
    │   ├── Products.jsx            ← Lista + filtro + CRUD de productos
    │   ├── Promotions.jsx          ← Lista + filtro + CRUD de promociones
    │   ├── Register.jsx            ← Alta de nuevo negocio (público)
    │   ├── ResetPassword.jsx       ← Confirmar reset con token (público)
    │   ├── Services.jsx            ← Lista + filtro + CRUD de servicios
    │   └── Subscriptions.jsx       ← Panel gestor: activar/desactivar negocios, asignar planes
    ├── routes/
    │   ├── ProtectedRoute.jsx      ← Redirige a /login si no está autenticado
    │   └── PermissionRoute.jsx     ← Verifica permiso del usuario; redirige si no tiene acceso
    └── services/
        └── api.js                  ← HTTP client con Bearer injection, 401 retry queue, setAccessToken/setRefreshCallback
```

---

## 2. Variables de entorno

### `admin-backend/.env`

```dotenv
NODE_ENV=development
ADMIN_PORT=4000

# Mismas credenciales que el chat backend (comparten la DB)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=llm_chat
DB_USER=postgres
DB_PASSWORD=<tu_password>

# CORS — URL del admin frontend
ADMIN_CLIENT_URL=http://localhost:5174

# JWT — generar con: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=<64-byte-hex>
JWT_REFRESH_SECRET=<64-byte-hex>
```

> `ADMIN_CLIENT_URL` acepta múltiples orígenes separados por coma (igual que `CLIENT_URL` en el chat backend).
> El servidor llama `process.exit(1)` al arrancar si `JWT_SECRET` o `JWT_REFRESH_SECRET` están ausentes.

### `admin-frontend` (Vite proxy)

No hay `.env` necesario. Vite redirige `/admin/*` → `http://localhost:4000` en desarrollo:

```js
// vite.config.js
proxy: {
  '/admin': { target: 'http://localhost:4000', changeOrigin: true }
}
```

En producción, configurar el reverse proxy (Nginx, Caddy) para redirigir `/admin` al puerto 4000.

---

## 3. Autenticación

### Mecanismo — JWT dual-token

El sistema usa dos tokens JWTs con ciclos de vida distintos para equilibrar seguridad y UX:

| Token | Duración | Almacenamiento | Propósito |
|---|---|---|---|
| **Access token** | **9 min** | Memoria React (`useState`) | Autenticar cada request (`Authorization: Bearer`) |
| **Refresh token** | **1 día** | Cookie HTTP-only (`rt`) | Renovar el access token silenciosamente |

**El access token nunca toca `localStorage` ni `sessionStorage`** → protección XSS total. El refresh token es completamente opaco al JavaScript del cliente (flag `HttpOnly`).

---

### Flujo de login

```
[Login.jsx]
  signIn(username, password)
      │
      ▼
[api.js] POST /admin/login { username, password }
      │
      ▼
[authController.login]
  AdminModel.findByCredentials(username, password)  ← bcrypt.compare()
  signAccess({ adminId, businessId })               ← JWT 15 min
  signRefresh({ adminId })                          ← JWT 7 días
  AdminModel.saveRefreshTokenHash(adminId, sha256(refreshToken))
  res.cookie('rt', refreshToken, REFRESH_COOKIE_OPTS)  ← HttpOnly, Secure en prod
  res.json({ accessToken, businessId })
      │
      ▼
[AuthContext.jsx]
  setAccessToken(accessToken)   ← en memoria React
  setBusinessId(businessId)
  arms 14-min timer → silentRefresh()
```

---

### Renovación silenciosa (silent refresh)

```
Timer de 14 min (o en cada mount del AuthProvider)
      │
      ▼
[api.js] POST /admin/refresh  (credentials: 'include' → envía cookie rt)
      │
      ▼
[authController.refreshToken]
  Verifica cookie rt → verifyRefresh(rt)
  Compara hash SHA-256 con refresh_token_hash en DB
  Genera nuevo accessToken + nuevo refreshToken (rotación)
  Guarda nuevo hash en DB
  Reemplaza cookie rt
  res.json({ accessToken, businessId })
      │
      ▼
[AuthContext.jsx]
  setAccessToken(newAccessToken)
  re-arma timer de 14 min
```

**Rotación de tokens:** cada llamada a `/refresh` invalida el refresh token anterior (el hash en DB se actualiza). Esto previene ataques de reutilización de tokens robados.

---

### Logout

```
[AuthContext.signOut()]
      │
      ▼
[api.js] POST /admin/logout  (credentials: 'include')
      │
      ▼
[authController.logout]
  AdminModel.clearRefreshToken(adminId)   ← hash = NULL en DB
  res.clearCookie('rt')
  res.json({ success: true })
      │
      ▼
[AuthContext.jsx]
  setAccessToken(null)
  setBusinessId(null)
  navigate('/login')
```

---

### Cada request autenticado

```
[api.js request()]
  headers: { 'Authorization': 'Bearer <accessToken>' }
      │
      ▼
[requireAuth.js]
  token = req.headers.authorization?.split(' ')[1]
  payload = verifyAccess(token)            ← lanza 401 si expirado/inválido
  req.adminId = payload.adminId
  req.businessId = payload.businessId
  next()
      │
  Si 401 → api.js corre runRefresh()
           obtiene nuevo accessToken
           reintenta el request original
```

La lógica de deduplicación en `runRefresh()` garantiza que si varios requests fallan con 401 simultáneamente, solo se hace **una** llamada a `/refresh` — todos los demás esperan en cola.

---

### Tabla `admins`

```sql
CREATE TABLE admins (
  id                  SERIAL PRIMARY KEY,
  username            VARCHAR(100) UNIQUE NOT NULL,
  password            VARCHAR(255) NOT NULL,   -- bcrypt hash
  business_id         INTEGER REFERENCES businesses(id),
  refresh_token_hash  VARCHAR(255),            -- SHA-256 del refresh token activo
  reset_token_hash    VARCHAR(255),
  reset_token_expires TIMESTAMPTZ
);
```

La columna `refresh_token_hash` se añade automáticamente con `ensureMigrations()` al arrancar el servidor (`ALTER TABLE admins ADD COLUMN IF NOT EXISTS` — idempotente).

---

### `admin-backend/src/config/jwt.js`

Módulo centralizado de configuración JWT. Llama a `process.exit(1)` al cargar si los secretos no están en `.env`.

| Export | Descripción |
|---|---|
| `signAccess(payload)` | Firma un access token con `JWT_SECRET`, expira en `15m` |
| `signRefresh(payload)` | Firma un refresh token con `JWT_REFRESH_SECRET`, expira en `7d` |
| `verifyAccess(token)` | Verifica y decodifica un access token |
| `verifyRefresh(token)` | Verifica y decodifica un refresh token |
| `REFRESH_COOKIE_OPTS` | `{ httpOnly: true, secure: (prod), sameSite: 'strict', path: '/admin', maxAge: 7d }` |

---

### TODOs de seguridad

- [x] Reemplazar comparación plain-text con bcrypt (`adminModel.js`) ✅
- [x] Reemplazar `x-business-id` header con JWT firmado (access 15min + refresh 7d) ✅
- [ ] Agregar rate limiting en `/admin/login` para prevenir fuerza bruta

---

## 4. API REST — Endpoints

Todos los endpoints (excepto los públicos listados a continuación) requieren `Authorization: Bearer <accessToken>`.

Base URL de desarrollo: `http://localhost:4000`

### Públicos (sin autenticación)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/admin/login` | Login → devuelve `accessToken` + cookie HTTP-only `rt` |
| `POST` | `/admin/register` | Registro nuevo negocio + admin (is_active=false por defecto) |
| `POST` | `/admin/forgot-password` | Envía email de reset-password (anti-enumeración) |
| `POST` | `/admin/reset-password` | Restablece contraseña con token de 1 h |
| `POST` | `/admin/refresh` | Silent refresh usando cookie `rt` → nuevo `accessToken` |
| `POST` | `/admin/logout` | Invalida cookie `rt` y hash en BD |
| `GET`  | `/admin/business-types` | Catálogo de tipos de negocio |
| `GET`  | `/admin/legal/:type` | Documento legal — `:type` = `privacy` \| `terms` |
| `GET`  | `/admin/chat/:chat_uuid` | Resuelve UUID público → info del negocio (para el chat) |

### Autenticados (`requireAuth`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `PUT` | `/admin/change-password` | Cambia contraseña (verifica actual) |
| `GET` | `/admin/dashboard` | Stats: conteos de productos, servicios, promociones + info negocio |
| `GET` | `/admin/business` | Info completa del negocio autenticado |
| `PUT` | `/admin/business` | Actualiza info (nombre, ciudad, email, google_maps_url, etc.) |
| `PUT` | `/admin/business/acepto-pedidos` | Toggle si el negocio acepta pedidos |
| `GET` | `/admin/categories` | Lista categorías del negocio |
| `POST` | `/admin/categories` | Crea categoría |
| `PUT` | `/admin/categories/:id` | Actualiza categoría |
| `DELETE` | `/admin/categories/:id` | Elimina categoría |
| `GET` | `/admin/products` | Lista productos |
| `GET` | `/admin/products/:id` | Producto por ID |
| `POST` | `/admin/products` | Crea producto |
| `PUT` | `/admin/products/:id` | Actualiza producto |
| `DELETE` | `/admin/products/:id` | Elimina producto |
| `POST` | `/admin/products/import/preview` | Preview de importación CSV/Excel |
| `POST` | `/admin/products/import/confirm` | Confirma importación masiva |
| `GET` | `/admin/services` | Lista servicios |
| `GET` | `/admin/services/:id` | Servicio por ID |
| `POST` | `/admin/services` | Crea servicio |
| `PUT` | `/admin/services/:id` | Actualiza servicio |
| `DELETE` | `/admin/services/:id` | Elimina servicio |
| `GET` | `/admin/promotions` | Lista promociones |
| `GET` | `/admin/promotions/:id` | Promoción por ID |
| `POST` | `/admin/promotions` | Crea promoción |
| `PUT` | `/admin/promotions/:id` | Actualiza promoción |
| `DELETE` | `/admin/promotions/:id` | Elimina promoción |
| `GET` | `/admin/hours` | Lista horarios del negocio |
| `POST` | `/admin/hours/bulk` | Guarda todos los horarios de una vez |
| `POST` | `/admin/hours` | Upsert de un horario individual |
| `DELETE` | `/admin/hours/:id` | Elimina un horario |
| `GET` | `/admin/analytics/top-products/:business_id` | Top 10 productos más consultados |
| `GET` | `/admin/analytics/traffic-by-hour/:business_id` | Tráfico por hora del día — 24 slots completos |
| `GET` | `/admin/orders/today` | Pedidos de hoy (solo `liberado = FALSE`) + flag `acepto_pedidos` |
| `PUT` | `/admin/orders/:id` | Actualiza estado/notas de un pedido |

### Autenticados + permiso `suscripciones` (`requireSubscriptionPermission`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/admin/subscriptions` | Lista todos los negocios con `is_active` y `subscription_id` |
| `PUT` | `/admin/subscriptions/:id` | Toggle `is_active` de un negocio |
| `PUT` | `/admin/subscriptions/:id/plan` | Asigna `subscription_id` a un negocio |

> La convención de `day_of_week` es: `0` = domingo, `1` = lunes … `6` = sábado (consistente con PostgreSQL `EXTRACT(DOW …)`).

---

## 5. Modelos de base de datos

Todos los modelos usan el pool `pg` de `config/database.js`. Cada método recibe `businessId` como parámetro para el aislamiento multi-tenant.

### Tablas principales

#### `businesses`
| Campo | Notas |
|-------|-------|
| `id`, `name`, `description`, `city`, `email`, `phone`, `webpage_link` | Campos base |
| `category` | `INT → FK business_types` |
| `google_maps_url` | URL de Google Maps del negocio |
| `is_active` | `BOOLEAN DEFAULT false` — activado por gestor de suscripciones |
| `acepto_pedidos` | `BOOLEAN DEFAULT false` — toggle en tiempo real |
| `subscription_id` | `INT → FK subscriptions` |
| `chat_uuid` | `UUID UNIQUE` — identificador público del chat (generado con `crypto.randomUUID()`) |

#### `admins`
`id`, `username` (UNIQUE), `password` (bcrypt 12 rounds), `business_id` FK, `refresh_token_hash` (SHA-256)

#### `password_resets`
`id`, `admin_id` FK CASCADE, `token_hash`, `expires_at` (+1 h), `used BOOLEAN`, `created_at`

#### `business_types`
Valores seed: `restaurant`, `hardware`, `stationery`, `pharmacy`, `clothing`, `other`

#### `subscriptions` + `permissions_types`
- `subscriptions`: `tipo_permiso → FK permissions_types`, `max_products` (NULL = ilimitado)
- `permissions_types`: 12 columnas booleanas: `dashboard`, `pedidos`, `productos`, `categorias`, `importar_productos`, `servicios`, `promociones`, `horarios`, `mi_haychat`, `mi_negocio`, `mi_webpage`, `suscripciones`

#### `product_query_logs` (analytics)
`id`, `business_id`, `product_id`, `query_date DATE DEFAULT TODAY`, `query_count INT DEFAULT 1`, `created_at TIMESTAMPTZ`  
UNIQUE(business_id, product_id, query_date)

#### `pedidos`
`id`, `business_id`, `nombre_cliente`, `telefono`, `detalle_pedido`, `hora_recogida`, `fecha`, `aceptado`, `rechazado`, `liberado` (false = aún en panel), `pedido_listo`, `notas_admin`, `created_at`

---

### `businessModel.js`

| Método | Query |
|---|---|
| `findById(id)` | `SELECT * FROM businesses WHERE id = $1` |
| `update(id, data)` | `UPDATE businesses SET name, category, city, email, phone, webpage_link, google_maps_url … WHERE id = $1 RETURNING *` |

### `productModel.js`

| Método | Query |
|---|---|
| `listByBusiness(bizId)` | `SELECT p.*, c.name as category FROM products p JOIN categories c … WHERE p.business_id = $1` |
| `findById(id, bizId)` | `SELECT … WHERE id = $1 AND business_id = $2` |
| `create(bizId, data)` | `INSERT INTO products (…, item_code_empresa) … RETURNING *` |
| `update(id, bizId, data)` | `UPDATE products SET … item_code_empresa … WHERE id=$1 AND business_id=$2 RETURNING *` |
| `remove(id, bizId)` | `DELETE FROM products WHERE id = $1 AND business_id = $2` |
| `countByBusiness(bizId)` | `SELECT COUNT(*) FROM products WHERE business_id = $1` |

### `serviceModel.js`

| Método | Query |
|---|---|
| `listByBusiness(bizId)` | `SELECT * FROM business_services WHERE business_id = $1 ORDER BY name` |
| `findById(id, bizId)` | Igual con AND `business_id = $2` |
| `create` / `update` / `remove` | CRUD estándar |
| `countByBusiness(bizId)` | COUNT |

### `promotionModel.js`

| Método | Query |
|---|---|
| `listByBusiness(bizId)` | `SELECT * FROM promotions WHERE business_id = $1 ORDER BY start_date DESC` |
| `findById` / `create` / `update` / `remove` | CRUD estándar |
| `countByBusiness(bizId)` | COUNT |

### `hoursModel.js`

| Método | Query |
|---|---|
| `listByBusiness(bizId)` | `SELECT * FROM business_hours WHERE business_id = $1 ORDER BY day_of_week` |
| `upsertOne(bizId, data)` | `INSERT INTO business_hours … ON CONFLICT (business_id, day_of_week) DO UPDATE SET …` |
| `bulkSave(bizId, days[])` | Llama `upsertOne` para cada día en una transacción |
| `remove(id, bizId)` | `DELETE FROM business_hours WHERE id = $1 AND business_id = $2` |

### `categoryModel.js`

| Método | Query |
|---|---|
| `listByBusiness(bizId)` | `SELECT id, name FROM categories WHERE business_id = $1 ORDER BY name` |

### `adminModel.js`

| Método | Query / Acción |
|---|---|
| `findByCredentials(username, password)` | `SELECT id, username, business_id, password FROM admins WHERE username=$1` + `bcrypt.compare()` |
| `findById(adminId)` | `SELECT * FROM admins WHERE id = $1` (incluye `refresh_token_hash`) |
| `saveRefreshTokenHash(adminId, hash)` | `UPDATE admins SET refresh_token_hash=$2 WHERE id=$1` |
| `clearRefreshToken(adminId)` | `UPDATE admins SET refresh_token_hash=NULL WHERE id=$1` |
| `ensureMigrations()` | `ALTER TABLE admins ADD COLUMN IF NOT EXISTS refresh_token_hash VARCHAR(255)` — se ejecuta al arrancar el servidor |

---

## 6. Controladores

Cada controlador sigue el patrón: recibe `req`, extrae `req.businessId` (inyectado por `requireAuth`), llama al modelo y responde con `{ success: true, data: … }` o pasa al `errorHandler`.

### `authController.js`

| Función | Descripción |
|---|---|
| `login` | Valida credenciales con `AdminModel.findByCredentials` (bcrypt). En éxito: firma access + refresh tokens, guarda hash SHA-256 del refresh en DB, establece cookie HTTP-only `rt`, devuelve `{ accessToken, businessId }` |
| `refreshToken` | Lee la cookie `rt`, verifica firma con `verifyRefresh`, compara hash con DB, rota ambos tokens (nuevo access + nuevo refresh), actualiza hash en DB, devuelve `{ accessToken, businessId }` |
| `logout` | Lee cookie `rt`, extrae `adminId`, llama `clearRefreshToken`, limpia cookie, devuelve `{ success: true }` |
| `forgotPassword` | Genera token de reset, guarda hash en DB, envía email via nodemailer |
| `resetPassword` | Verifica token + expiración, actualiza contraseña con bcrypt |
| `changePassword` | Verifica contraseña actual con bcrypt, actualiza con nueva; revoca refresh token activo |

### `businessController.js`

| Función | Descripción |
|---|---|
| `getStats` | Llama en paralelo a `countByBusiness` de productos, servicios y promociones. Devuelve stats + datos del negocio. |
| `getInfo` | Retorna los datos del negocio según `req.businessId`. |
| `updateInfo` | Actualiza campos del negocio. |

### `productController.js`

CRUD completo + `listCategories` (para el dropdown del formulario de producto).

### `serviceController.js` / `promotionController.js`

CRUD estándar. La misma estructura que `productController`.

### `hoursController.js`

| Función | Descripción |
|---|---|
| `list` | Devuelve los 7 registros de horario. |
| `upsertOne` | Inserta o actualiza un día específico (`ON CONFLICT`). |
| `bulkSave` | Guarda todos los días en una sola llamada. Usado por el botón "Guardar todo" de la página de horarios. |
| `remove` | Elimina un registro de horario por ID. |

---

## 7. Frontend — Páginas y componentes

### Rutas y permisos

| Ruta | Componente | Permiso requerido | Propósito |
|------|-----------|------------------|-----------|
| `/login` | `Login` | público | Login con username/password |
| `/register` | `Register` | público | Alta de nuevo negocio |
| `/forgot-password` | `ForgotPassword` | público | Solicita reset por email |
| `/reset-password` | `ResetPassword` | público | Confirma reset con token |
| `/dashboard` | `Dashboard` | `dashboard` | Stats del negocio + gráficas analytics |
| `/orders` | `Pedidos` | `pedidos` | Gestión de pedidos del día |
| `/products` | `Products` | `productos` | CRUD productos |
| `/categories` | `Categories` | `categorias` | CRUD categorías |
| `/import` | `Import` | `importar_productos` | Import masivo CSV/Excel |
| `/services` | `Services` | `servicios` | CRUD servicios |
| `/promotions` | `Promotions` | `promociones` | CRUD promociones |
| `/hours` | `Hours` | `horarios` | Configurar horarios de atención |
| `/mi-haychat` | `MiHayChat` | `mi_haychat` | QR + link del chat público del negocio |
| `/business` | `BusinessInfo` | `mi_negocio` | Editar info del negocio |
| `/subscriptions` | `Subscriptions` | `suscripciones` | Panel gestor: activar/desactivar negocios, asignar planes |
| `/change-password` | `ChangePassword` | ninguno (siempre) | Cambio de contraseña |

**SmartRedirect:** al entrar a `/`, redirige automáticamente al primer enlace que el usuario tenga habilitado.

**PermissionRoute:** guard de React Router que lee `permissions[permKey]` del contexto. Si el permiso no es `true`, redirige al primer enlace permitido o a `/change-password`.

### Layout

**`AdminLayout.jsx`** — shell: `Sidebar` + `Navbar` + `<Outlet>`. Gestiona el estado `sidebarOpen` para el drawer mobile.

**`Navbar.jsx`** — barra superior con botón hamburger (mobile).

**`Sidebar.jsx`** — menú lateral con íconos. Auto-cierra en mobile. Construido con `navLinks.js` que filtra los links según permisos.

### Contextos

**`AuthContext.jsx`**
- Access token en memoria React (`useState`) — nunca `localStorage`
- `silentRefresh()` en mount: restaura sesión desde cookie HTTP-only
- Auto-refresh cada 14 minutos con `setTimeout`
- Expone: `businessId`, `permissions`, `isActive`, `isAuthenticated`, `isReady`, `signIn`, `signOut`
- Registra `silentRefresh` como `refreshCallback` en `api.js` para recuperación de 401 automática

**`ToastContext.jsx`** — notificaciones flotantes con auto-dismiss a 3.5 s.

### Componentes UI nuevos

**`TopProductsChart.jsx`** — gráfica de barras horizontales (Recharts `BarChart`) con los top 10 productos más consultados del negocio. Datos de `GET /admin/analytics/top-products/:id`.

**`TrafficByHourChart.jsx`** — gráfica de área (Recharts `AreaChart`) con 24 slots de hora (0–23). Datos de `GET /admin/analytics/traffic-by-hour/:id`.

**`SubscriptionGate.jsx`** — envuelve cualquier sección que requiera `is_active = true`. Si el negocio está inactivo, muestra un banner de aviso en lugar del contenido.

**`PageTransition.jsx`** — envuelve el contenido de cada página con animación de entrada/salida (Framer Motion).

**`Icon.jsx`** — íconos SVG inline. `<Icon name="products" />`.

**`Spinner.jsx`** — círculo animado SVG.

### Servicio API (`api.js`)

HTTP client con inyección automática de `Authorization: Bearer <accessToken>` en todas las llamadas autenticadas. Arquitectura clave:

- **`setAccessToken(token)`** — llamado por `AuthContext` al recibir un nuevo access token
- **`setRefreshCallback(fn)`** — registra la función de renovación provista por `AuthContext`
- **`request(url, options)`** — función base: inyecta Bearer; en 401, entra en `runRefresh()` y reintenta una vez
- **`runRefresh()`** — deduplicación: si múltiples requests fallan con 401 simultáneamente, solo se hace **una** llamada `POST /admin/refresh`; todos los demás esperan en cola
- **`publicRequest()`** — para login, forgot/reset password (sin Bearer)
- **`apiRefresh()`** — `POST /admin/refresh` con `credentials: 'include'` (envía cookie)
- **`apiLogout()`** — `POST /admin/logout`, siempre resuelve (nunca lanza)
- **`importPreview(formData)`** — maneja FormData con Bearer pero sin `Content-Type` (el browser establece el multipart boundary)

```js
import * as api from '../services/api';

// Ejemplos de uso:
const stats    = await api.getDashboard();
const products = await api.getProducts();
await api.createProduct({ name: 'Hamburguesa', price: 150, category_id: 1, item_code_empresa: 'HAM-001' });
await api.updateProduct(5, { price: 160 });
await api.deleteProduct(5);
await api.saveAllHours(days);   // days: array de 7 objetos
```

### Rutas (`ProtectedRoute.jsx`)

Verifica `isAuthenticated` del `AuthContext`. Si es falso, redirige a `/login` preservando la ubicación actual para redirigir de vuelta después del login.

---

## 8. Flujo de una solicitud típica

Ejemplo: el administrador actualiza el precio de un producto.

```
[Products.jsx]
  handleSave(productData)
      │
      ▼
[api.js]
  updateProduct(id, productData)
  → PUT /admin/products/:id
    headers: { 'Authorization': 'Bearer <accessToken>', 'Content-Type': 'application/json' }
    body: { name, price, category_id, item_code_empresa, ... }
      │
      ▼  Vite proxy (dev) → http://localhost:4000
[requireAuth.js]
  verifyAccess(token) → { adminId, businessId }
  req.adminId   = adminId
  req.businessId = businessId
      │
      ▼
[productController.update]
  ProductModel.update(id, req.businessId, req.body)
  → UPDATE products SET price=$3 WHERE id=$1 AND business_id=$2 RETURNING *
      │
      ▼
[res.json({ success: true, data: updatedProduct })]
      │
      ▼
[Products.jsx]
  showToast('Producto actualizado', 'success')
  refetch lista de productos
```

El guard `AND business_id = $2` en la query garantiza que un administrador **no puede modificar datos de otro negocio**, incluso si su token JWT perteneciera a otro `businessId`.

---

## 9. Sistema de diseño (CSS)

Archivo: `admin-frontend/src/index.css`

### Variables

```css
:root {
  --sidebar-w:    240px;
  --sidebar-bg:   #1e1b4b;   /* indigo oscuro */
  --sidebar-text: rgba(255,255,255,0.7);
  --sidebar-active: #fff;
  --accent:       #6366f1;   /* indigo 500 */
  --accent-h:     #4f46e5;
  --bg:           #f8f9fc;
  --surface:      #ffffff;
  --border:       #e5e7eb;
  --text:         #111827;
  --text-2:       #6b7280;
  --success:      #10b981;
  --danger:       #ef4444;
  --warning:      #f59e0b;
}
```

### Clases principales

| Clase | Uso |
|---|---|
| `.admin-layout` | Flex container: sidebar izquierdo + main derecho |
| `.sidebar` | Menú lateral fijo (`240px`) con fondo `--sidebar-bg` |
| `.main-content` | Área derecha con `padding` y fondo `--bg` |
| `.page-header` | Título de página + acciones (botones) |
| `.stat-card` | Tarjeta de estadística con ícono y número |
| `.data-table` | Tabla de datos (sticky header, hover rows) |
| `.filter-bar` | Barra de filtros: input de búsqueda + selects |
| `.form-card` | Card contenedora de formulario |
| `.form-group` | Label + input |
| `.btn`, `.btn-primary`, `.btn-danger` | Botones |
| `.badge`, `.badge-success`, `.badge-warning` | Badges de estado |
| `.toast-container`, `.toast` | Contenedor y elemento de notificación |
| `.spinner` | Spinner de carga |

### Responsive

Breakpoints en `@media (max-width: 900px)` y `@media (max-width: 480px)`:

- Sidebar se convierte en drawer (`position: fixed`, `translateX(-100%)` oculto, `translateX(0)` visible con clase `.open`)
- `.stat-grid` pasa de 3 columnas a 1
- Tablas: scroll horizontal, columnas opcionales ocultas en mobile
- Formularios: `grid` de 2 columnas → 1 columna
- Login card: full-width en pantallas pequeñas

---

## Funcionalidades nuevas destacadas

### Registro público de negocios
`POST /admin/register` valida 6 reglas: campos requeridos, `category` FK a `business_types`, formato email, `password === confirmPassword`, longitud mínima 6, `username` único. Crea el negocio con `is_active = false` y genera el `chat_uuid` automáticamente. El negocio debe ser activado por un admin con permiso `suscripciones` en el panel de Suscripciones.

### Analytics
- `GET /analytics/top-products/:id` → consulta `product_query_logs`, agrupa por `product_id`, devuelve top 10. Renderizado con `TopProductsChart` (Recharts BarChart horizontal).
- `GET /analytics/traffic-by-hour/:id` → 24 slots (hora 0–23), COUNT de registros por `EXTRACT(HOUR FROM created_at)`. Renderizado con `TrafficByHourChart` (Recharts AreaChart).
- Guard multi-tenant: el admin solo puede consultar su propio `business_id`.

### Pedidos en tiempo real
- Panel `Pedidos.jsx` muestra pedidos del día donde `liberado = FALSE`.
- Estados del pedido: `aceptado`, `rechazado`, `pedido_listo`, `liberado`, `notas_admin`.
- Toggle `acepto_pedidos` (PUT /admin/business/acepto-pedidos) abre/cierra la recepción de pedidos desde el chat.
- Los pedidos llegan del chat vía Socket.io y se persisten en la tabla `pedidos`.

### Suscripciones
- Panel solo para admins con `permissions_types.suscripciones = true`.
- Middleware `requireSubscriptionPermission` verifica el permiso en BD antes de cada request (no solo en el JWT).
- Operaciones: listar todos los negocios, activar/desactivar (`is_active`), asignar plan (`subscription_id`).

### Legal
- `GET /admin/legal/privacy` → lee `avisoPrivacidad.md` del filesystem y lo devuelve como texto.
- `GET /admin/legal/terms` → lee `terminosYCondiciones.md`.
- Endpoint público (sin auth). El frontend renderiza el markdown con la librería `marked`.

### MiHayChat
- Página `MiHayChat.jsx` muestra el `chat_uuid` del negocio como código QR (qrcode.react) + URL pública copiable.
- El UUID es permanente: se genera una sola vez al crear el negocio.

---

### v1.4 — JWT dual-token auth + item_code_empresa *(4 abr 2026)*

#### Autenticación JWT

Reemplazo completo del mecanismo de autenticación basado en `x-business-id` header por JWT dual-token con rotación y revocación en base de datos.

- **`admin-backend/src/config/jwt.js`** _(nuevo)_ — helpers centralizados: `signAccess` (15 min), `signRefresh` (7 días), `verifyAccess`, `verifyRefresh`, `REFRESH_COOKIE_OPTS` (HttpOnly, Secure en prod, SameSite Strict). Guard de arranque: `process.exit(1)` si los secretos no están en `.env`
- **`server.js`** — ejecuta `AdminModel.ensureMigrations()` antes de `app.listen()`
- **`adminModel.js`** — new methods: `findById`, `saveRefreshTokenHash`, `clearRefreshToken`, `ensureMigrations`; `findByCredentials` actualizado a bcrypt
- **`authController.js`** — reescrito: `login` emite access + refresh tokens + cookie; nuevos handlers `refreshToken` (rotación) + `logout` (revocación); `changePassword` revoca refresh token activo
- **`requireAuth.js`** — reescrito: lee `Authorization: Bearer`, verifica con `verifyAccess`, inyecta `req.adminId` + `req.businessId`
- **`routes/index.js`** — added public routes `POST /refresh` y `POST /logout` antes del `router.use(requireAuth)`
- **`app.js`** — added `cookie-parser`
- **`AuthContext.jsx`** — reescrito: access token en memoria, `silentRefresh` en mount, auto-refresh timer 14 min, `isReady` gate para evitar redirect prematuro
- **`api.js`** — reescrito: `setAccessToken`/`setRefreshCallback`, inyección Bearer, `runRefresh()` con deduplicación de 401, `importPreview` con Bearer sin Content-Type

#### Campo `item_code_empresa` en productos

- **`productModel.js`** → `create` y `update` incluyen `item_code_empresa`
- **`Products.jsx`** → nueva columna "Código de ítem" en la tabla; colSpan actualizado 6→7
- **`ProductForm.jsx`** → nuevo campo "Código de ítem" (text input); campo en estado `EMPTY`, `useEffect` y payload de submit

---

### v1.0 — Scaffold inicial

- Express + React + Vite configurados
- Autenticación básica con tabla `admins`
- Rutas CRUD para productos, servicios y promociones
- `requireAuth` middleware con `x-business-id` header
- `AuthContext` con `localStorage`
- `ProtectedRoute`
- Sistema de diseño SaaS (sidebar indigo oscuro, tarjetas, tablas)

### v1.1 — Horarios de negocio

- Nuevo modelo `hoursModel.js` con `upsertOne` y `bulkSave`
- Nuevo controlador `hoursController.js`
- Rutas `GET|POST /admin/hours`, `POST /admin/hours/bulk`, `DELETE /admin/hours/:id`
- Página `Hours.jsx` con tabla de 7 días, toggle open/closed, campos de hora
- `api.js` — funciones `getHours`, `saveHour`, `saveAllHours`

### v1.2 — UI: Toast, Spinner, íconos y responsive

- `ToastContext.jsx` — notificaciones flotantes con auto-dismiss
- `Icon.jsx` — íconos SVG inline (dashboard, products, services, promotions, hours, logout, menu)
- `Spinner.jsx` — indicador de carga
- Todas las páginas actualizadas con toast en éxito/error y spinner en carga inicial
- `AdminLayout.jsx` — estado `sidebarOpen` + backdrop overlay para mobile
- `Navbar.jsx` — botón hamburger (visible solo en mobile)
- `Sidebar.jsx` — prop `onClose`, botón `✕`, auto-cierre al navegar
- CSS completo de responsive: drawer mobile, grid de stats adaptable, formularios compactos

---

### v1.3 — Importación Excel, Categorías, Framer Motion y contacto del negocio *(3 abr 2026)*

#### Importación masiva de productos (Excel)

- Nuevo `importController.js` — `POST /admin/import/products`: acepta archivo `.xlsx`, parsea las filas y crea/actualiza productos en lote
- Nueva página `Import.jsx` — formulario para subir el archivo Excel; muestra progreso y resumen (creados / actualizados / errores)
- **Bug fix:** se corrigió un bug por el que filas vacías ("phantom rows") al final del Excel generaban productos con nombre vacío en la BD

#### Datos de contacto del negocio

- `schema.sql` → columnas `email VARCHAR(255)`, `phone VARCHAR(50)`, `webpage_link VARCHAR(500)` en tabla `businesses`
- `admin-backend/businessModel.js` → `findById` y `update` incluyen los 3 nuevos campos (8 parámetros en UPDATE)
- `BusinessForm.jsx` → nuevos inputs: Email (`type="email"`), Teléfono (`type="tel"`), Página web (`type="url"`)
- `BusinessInfo.jsx` → tres nuevas filas de detalle: Email, Teléfono, Página web
- Los nuevos campos se usan en el chatbot para el intent `comprar` (`webpage_link`, `city`, `description`) y el intent `ubicacion` (ahora incluye `webpage_link`)

#### Animaciones Framer Motion

- `framer-motion` instalado en `admin-frontend`
- Animaciones de entrada/salida en páginas, tablas y formularios

---

## 11. Cómo correr el proyecto

### Requisitos

- Node.js ≥ 18
- PostgreSQL corriendo (misma instancia que el chat backend)
- La tabla `admins` debe tener al menos un registro

```sql
-- Crear un administrador de prueba (password = bcrypt hash de 'admin123')
INSERT INTO admins (username, password, business_id)
VALUES ('admin', '$2b$10$...', 1);
-- O en Node: const hash = await bcrypt.hash('admin123', 10);
```

### Admin Backend

```bash
cd admin-backend
cp .env.example .env   # editar con credenciales de postgres
npm install
npm run dev            # nodemon en puerto 4000
```

### Admin Frontend

```bash
cd admin-frontend
npm install
npm run dev            # Vite en puerto 5174
```

### Acceso

| Dispositivo | URL |
|---|---|
| PC | http://localhost:5174 |
| Celular (misma Wi-Fi) | http://192.168.1.3:5174 |

> Vite tiene `host: true` en `vite.config.js` — escucha en `0.0.0.0` y es accesible desde la red local.
> Credenciales por defecto de prueba: `admin` / `admin123`

### Relación con el chat

El panel de administración **comparte la misma base de datos** con el chat backend. Cualquier cambio realizado desde el panel (nuevo producto, nuevo horario, etc.) es inmediatamente visible para el chatbot sin necesidad de reiniciar ningún servicio.

```
admin-backend (4000) ─────┐
                           ├── PostgreSQL (5432) ── aichat / llm_chat
chat-backend   (3000) ─────┘
```
