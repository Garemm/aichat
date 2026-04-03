# LLM Chat AI — Documentación del Panel de Administración (SaaS)

> Última actualización: 3 de abril de 2026
> Estado: desarrollo activo
> Archivo: `documentacionSaaS.md`

---

## Resumen del proyecto

El **Panel de Administración** es una aplicación web SaaS que permite a los dueños de negocios gestionar toda la información que el chatbot (ver `documentacionChat.md`) usa para responder preguntas. Desde este panel el administrador puede actualizar datos del negocio, productos, servicios, promociones y horarios sin tocar la base de datos directamente.

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
└── src/
    ├── app.js                      ← Express app, CORS, rutas
    ├── config/
    │   └── database.js             ← Pool PostgreSQL (pg)
    ├── controllers/
    │   ├── authController.js       ← POST /admin/login
    │   ├── businessController.js   ← GET|PUT /admin/business, GET /admin/dashboard
    │   ├── hoursController.js      ← GET|POST|DELETE /admin/hours
    │   ├── productController.js    ← CRUD /admin/products + /admin/categories
    │   ├── promotionController.js  ← CRUD /admin/promotions
    │   └── serviceController.js    ← CRUD /admin/services
    ├── middlewares/
    │   ├── errorHandler.js         ← Manejador global de errores Express
    │   └── requireAuth.js          ← Guard: valida x-business-id header
    ├── models/
    │   ├── adminModel.js           ← findByCredentials (tabla admins)
    │   ├── businessModel.js        ← findById, update
    │   ├── categoryModel.js        ← listByBusiness
    │   ├── hoursModel.js           ← list, upsertOne, bulkSave, remove
    │   ├── productModel.js         ← CRUD + countByBusiness
    │   ├── promotionModel.js       ← CRUD + countByBusiness
    │   └── serviceModel.js         ← CRUD + countByBusiness
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
    │   │   ├── BusinessForm.jsx    ← Formulario de información del negocio
    │   │   ├── ProductForm.jsx     ← Formulario de producto (create/edit)
    │   │   ├── PromotionForm.jsx   ← Formulario de promoción
    │   │   └── ServiceForm.jsx     ← Formulario de servicio
    │   └── ui/
    │       ├── Icon.jsx            ← Componente SVG con íconos inline
    │       └── Spinner.jsx         ← Spinner de carga
    ├── context/
    │   ├── AuthContext.jsx         ← businessId en localStorage, signIn/signOut
    │   └── ToastContext.jsx        ← Notificaciones toast (success/error/info)
    ├── layout/
    │   ├── AdminLayout.jsx         ← Shell: Sidebar + Navbar + Outlet; gestión hamburger
    │   ├── Navbar.jsx              ← Barra superior con botón hamburger (mobile)
    │   └── Sidebar.jsx             ← Menú lateral con íconos; auto-cierre en mobile
    ├── pages/
    │   ├── Dashboard.jsx           ← Stats: nº productos, servicios, promociones
    │   ├── BusinessInfo.jsx        ← Editar nombre, ciudad, teléfono, dirección
    │   ├── Hours.jsx               ← Horarios por día (7 días, toggle open/closed)
    │   ├── Login.jsx               ← Pantalla de login
    │   ├── Products.jsx            ← Lista + filtro + CRUD de productos
    │   ├── Promotions.jsx          ← Lista + filtro + CRUD de promociones
    │   └── Services.jsx            ← Lista + filtro + CRUD de servicios
    ├── routes/
    │   └── ProtectedRoute.jsx      ← Redirige a /login si no está autenticado
    └── services/
        └── api.js                  ← Thin wrapper sobre fetch; inyecta x-business-id
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
```

> `ADMIN_CLIENT_URL` acepta múltiples orígenes separados por coma (igual que `CLIENT_URL` en el chat backend).

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

### Mecanismo actual

La autenticación es simple y está diseñada para la etapa de desarrollo. **No usa JWT ni sesiones de servidor.**

**Flujo de login:**

```
[Login.jsx]
  signIn(username, password)
      │
      ▼
[api.js] POST /admin/login { username, password }
      │
      ▼
[authController.js]
  AdminModel.findByCredentials(username, password)
  → SELECT id, username, business_id FROM admins WHERE username=$1 AND password=$2
      │
      ▼  si existe
  res.json({ businessId: row.business_id })
      │
      ▼
[AuthContext.jsx]
  localStorage.setItem('admin_business_id', businessId)
  setBusinessId(businessId)
```

**Cada request autenticado:**

```
[api.js] headers: { 'x-business-id': localStorage.getItem('admin_business_id') }
      │
      ▼
[requireAuth.js]
  const businessId = parseInt(req.headers['x-business-id'], 10)
  si inválido → 401 Unauthorized
  req.businessId = businessId
  next()
```

### Tabla `admins`

```sql
CREATE TABLE admins (
  id          SERIAL PRIMARY KEY,
  username    VARCHAR(100) UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,   -- plain text en dev, pendiente bcrypt
  business_id INTEGER REFERENCES businesses(id)
);
```

### TODOs de seguridad pendientes

- [ ] Reemplazar comparación plain-text con bcrypt (`adminModel.js`)
- [ ] Reemplazar `x-business-id` header con JWT firmado (tiempo de expiración + refresh token)
- [ ] Agregar rate limiting en `/admin/login` para prevenir fuerza bruta

---

## 4. API REST — Endpoints

Todos los endpoints (excepto `POST /admin/login`) requieren el header `x-business-id: <id>`.

Base URL de desarrollo: `http://localhost:4000`

### Auth

| Método | Ruta | Descripción | Body | Respuesta |
|---|---|---|---|---|
| `POST` | `/admin/login` | Login de administrador | `{ username, password }` | `{ businessId }` |

### Dashboard

| Método | Ruta | Descripción | Respuesta |
|---|---|---|---|
| `GET` | `/admin/dashboard` | Stats del negocio | `{ business, stats: { products, services, promotions } }` |

### Información del negocio

| Método | Ruta | Descripción | Body | Respuesta |
|---|---|---|---|---|
| `GET` | `/admin/business` | Obtener datos del negocio | — | `{ id, name, type, city, address, phone }` |
| `PUT` | `/admin/business` | Actualizar datos | `{ name, city, address, phone, … }` | Registro actualizado |

### Categorías

| Método | Ruta | Descripción | Respuesta |
|---|---|---|---|
| `GET` | `/admin/categories` | Lista de categorías del negocio | `[{ id, name }]` |

### Productos

| Método | Ruta | Descripción | Body |
|---|---|---|---|
| `GET` | `/admin/products` | Listar productos | — |
| `GET` | `/admin/products/:id` | Obtener un producto | — |
| `POST` | `/admin/products` | Crear producto | `{ name, price, category_id, description, is_available }` |
| `PUT` | `/admin/products/:id` | Actualizar producto | Cualquier campo |
| `DELETE` | `/admin/products/:id` | Eliminar producto | — |

### Servicios

| Método | Ruta | Descripción | Body |
|---|---|---|---|
| `GET` | `/admin/services` | Listar servicios | — |
| `GET` | `/admin/services/:id` | Obtener un servicio | — |
| `POST` | `/admin/services` | Crear servicio | `{ name, price, description, is_active }` |
| `PUT` | `/admin/services/:id` | Actualizar servicio | Cualquier campo |
| `DELETE` | `/admin/services/:id` | Eliminar servicio | — |

### Promociones

| Método | Ruta | Descripción | Body |
|---|---|---|---|
| `GET` | `/admin/promotions` | Listar promociones | — |
| `GET` | `/admin/promotions/:id` | Obtener una promoción | — |
| `POST` | `/admin/promotions` | Crear promoción | `{ title, description, start_date, end_date }` |
| `PUT` | `/admin/promotions/:id` | Actualizar promoción | Cualquier campo |
| `DELETE` | `/admin/promotions/:id` | Eliminar promoción | — |

### Horarios

| Método | Ruta | Descripción | Body |
|---|---|---|---|
| `GET` | `/admin/hours` | Obtener horarios (7 días) | — |
| `POST` | `/admin/hours` | Crear/actualizar un día | `{ day_of_week, open_time, close_time, is_open }` |
| `POST` | `/admin/hours/bulk` | Guardar todos los días | `{ days: [{ day_of_week, open_time, close_time, is_open }] }` |
| `DELETE` | `/admin/hours/:id` | Eliminar registro de horario | — |

> La convención de `day_of_week` es: `0` = domingo, `1` = lunes … `6` = sábado (consistente con PostgreSQL `EXTRACT(DOW …)`).

---

## 5. Modelos de base de datos

Todos los modelos usan el pool `pg` de `config/database.js`. Cada método recibe `businessId` como parámetro para el aislamiento multi-tenant.

### `businessModel.js`

| Método | Query |
|---|---|
| `findById(id)` | `SELECT * FROM businesses WHERE id = $1` |
| `update(id, data)` | `UPDATE businesses SET … WHERE id = $1 RETURNING *` |

### `productModel.js`

| Método | Query |
|---|---|
| `listByBusiness(bizId)` | `SELECT p.*, c.name as category FROM products p JOIN categories c … WHERE p.business_id = $1` |
| `findById(id, bizId)` | `SELECT … WHERE id = $1 AND business_id = $2` |
| `create(bizId, data)` | `INSERT INTO products … RETURNING *` |
| `update(id, bizId, data)` | `UPDATE products SET … WHERE id = $1 AND business_id = $2 RETURNING *` |
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

| Método | Query |
|---|---|
| `findByCredentials(username, password)` | `SELECT id, username, business_id FROM admins WHERE username=$1 AND password=$2` |

---

## 6. Controladores

Cada controlador sigue el patrón: recibe `req`, extrae `req.businessId` (inyectado por `requireAuth`), llama al modelo y responde con `{ success: true, data: … }` o pasa al `errorHandler`.

### `authController.js`

`login(req, res, next)` — valida credenciales con `AdminModel.findByCredentials`, devuelve `{ businessId }` en éxito o 401 si no existe el usuario.

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

### Layout

**`AdminLayout.jsx`** — shell de la aplicación. Gestiona el estado `sidebarOpen` para el drawer mobile. Renderiza `Sidebar` + `Navbar` + `<Outlet>` (React Router).

**`Navbar.jsx`** — barra superior. En mobile muestra el botón hamburger que llama a `onMenuClick`. En desktop se oculta el botón via CSS.

**`Sidebar.jsx`** — menú lateral. En desktop: fijo a la izquierda. En mobile: posición `fixed`, aparece como drawer al activar `sidebarOpen`. Incluye botón de cierre `✕` y auto-cierra al navegar.

### Contextos

**`AuthContext.jsx`**

```js
const { businessId, isAuthenticated, signIn, signOut } = useAuth();
```

Persiste `businessId` en `localStorage` bajo la clave `admin_business_id`. Todos los requests de `api.js` leen este valor para el header `x-business-id`.

**`ToastContext.jsx`**

```js
const { showToast } = useToast();
showToast('Guardado', 'success');   // success | error | info
showToast('Error al guardar', 'error');
```

Muestra notificaciones flotantes (esquina inferior-derecha). Se auto-eliminan después de 3 segundos.

### Páginas

**`Login.jsx`** — formulario simple. Si `isAuthenticated` redirige a `/dashboard`. Llama a `signIn` en submit.

**`Dashboard.jsx`** — tres tarjetas de stats (productos, servicios, promociones) obtenidas de `GET /admin/dashboard`. Muestra nombre y ciudad del negocio.

**`BusinessInfo.jsx`** — formulario para editar los datos del negocio: nombre, tipo, ciudad, dirección, teléfono. Usa `BusinessForm.jsx`. Muestra spinner durante la carga y toast en éxito/error.

**`Products.jsx`** — lista completa de productos con búsqueda por texto (filter en el frontend). Abre `ProductForm.jsx` en un modal/drawer para crear o editar. Incluye botón de eliminar con confirmación.

**`Services.jsx`** — lista de servicios del negocio. Mismo patrón que `Products.jsx` con `ServiceForm.jsx`.

**`Promotions.jsx`** — lista de promociones. Muestra fechas de inicio/fin. Mismo patrón con `PromotionForm.jsx`.

**`Hours.jsx`** — tabla de 7 días (lunes-domingo). Cada fila tiene:
- Toggle switch "Abierto / Cerrado"
- Campos de hora apertura y cierre (ocultos cuando cerrado)
- Botón "Guardar todo" que llama a `POST /admin/hours/bulk`

### Componentes de UI

**`Icon.jsx`** — íconos SVG inline. Uso: `<Icon name="products" />`. Íconos disponibles: `dashboard`, `business`, `products`, `services`, `promotions`, `hours`, `logout`, `menu`.

**`Spinner.jsx`** — círculo animado SVG para estados de carga.

### Servicio API (`api.js`)

Thin wrapper alrededor de `fetch`. Inyecta automáticamente el header `x-business-id` en todas las llamadas autenticadas. Lanza un `Error` con el mensaje del servidor si `res.ok === false`.

```js
import * as api from '../services/api';

// Ejemplos de uso:
const stats    = await api.getDashboard();
const products = await api.getProducts();
await api.createProduct({ name: 'Hamburguesa', price: 150, category_id: 1 });
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
    headers: { 'x-business-id': '1', 'Content-Type': 'application/json' }
    body: { name, price, category_id, ... }
      │
      ▼  Vite proxy (dev) → http://localhost:4000
[requireAuth.js]
  req.businessId = 1
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

El guard `AND business_id = $2` en la query garantiza que un administrador **no puede modificar datos de otro negocio**, incluso si manipula el header `x-business-id`.

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

## 10. Historial de cambios

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

## 11. Cómo correr el proyecto

### Requisitos

- Node.js ≥ 18
- PostgreSQL corriendo (misma instancia que el chat backend)
- La tabla `admins` debe tener al menos un registro

```sql
-- Crear un administrador de prueba
INSERT INTO admins (username, password, business_id)
VALUES ('admin', 'admin123', 1);
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
