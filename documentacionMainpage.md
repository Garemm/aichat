# hayChat Business — Documentación de la Landing Page (mainPage)

> Última actualización: 15 de abril de 2026
> Estado: desarrollo activo
> Archivo: `documentacionMainpage.md`

---

## Resumen del proyecto

**mainPage** es la landing page de marketing de **hayChat Business**, el producto SaaS de chatbot híbrido para negocios locales. Es un sitio de una sola página (SPA sin router) con anclas de navegación, construido con React + Vite + Tailwind CSS + Framer Motion.

El objetivo es presentar el producto, sus funcionalidades, planes de precio y guiar al visitante a registrarse (panel admin) o probar el chat genérico de demostración. Todo el contenido está en **español**.

**Notas importantes sobre el estado actual:**
- Los CTAs "Registrar mi negocio" (Hero y CTA) apuntan a `href="#"` — no tienen destino real aún
- Los links del Footer y redes sociales también apuntan a `href="#"`
- El logo en Navbar tiene un typo: "hayChat **Businesss**" (triple `s`); el Footer dice "hayChat Business" correctamente
- `useCursorGlow` y `useScrollReveal` están definidos pero no conectados a ningún componente visible
- Los precios están en MXN (mercado objetivo: México)

---

## Índice

1. [Estructura del proyecto](#1-estructura-del-proyecto)
2. [Stack tecnológico](#2-stack-tecnológico)
3. [Variables de entorno y configuración](#3-variables-de-entorno-y-configuración)
4. [Arquitectura de la página](#4-arquitectura-de-la-página)
5. [Componentes](#5-componentes)
   - 5.1 [Navbar](#51-navbar)
   - 5.2 [Hero](#52-hero)
   - 5.3 [TrustBar](#53-trustbar)
   - 5.4 [Features](#54-features)
   - 5.5 [Demo](#55-demo)
   - 5.6 [ControlCenter](#56-controlcenter)
   - 5.7 [UseCases](#57-usecases)
   - 5.8 [HowItWorks](#58-howitworks)
   - 5.9 [Pricing](#59-pricing)
   - 5.10 [CTA](#510-cta)
   - 5.11 [Footer](#511-footer)
6. [Componentes UI reutilizables](#6-componentes-ui-reutilizables)
7. [Hooks personalizados](#7-hooks-personalizados)
8. [Sistema de diseño](#8-sistema-de-diseño)
9. [Cómo correr el proyecto](#9-cómo-correr-el-proyecto)

---

## 1. Estructura del proyecto

```
mainPage/
├── index.html                    ← HTML raíz: meta description, fuentes, viewport
├── package.json
├── vite.config.js                ← Puerto 5172, plugin react
└── src/
    ├── main.jsx                  ← Render raíz de React
    ├── index.css                 ← Sistema de diseño: variables CSS + clases Tailwind globales
    ├── App.jsx                   ← Shell: cursor glow + sección principal (import de todos los componentes)
    ├── components/
    │   ├── Navbar.jsx            ← Barra de navegación fija con glassmorphism
    │   ├── Hero.jsx              ← Sección principal con parallax y animaciones stagger
    │   ├── TrustBar.jsx          ← Banda de prueba social / logotipos
    │   ├── Features.jsx          ← Grid de 6 tarjetas de funcionalidades
    │   ├── Demo.jsx              ← Demo animada de chat + panel admin sincronizado
    │   ├── ControlCenter.jsx     ← ★ Panel admin mockup con switch Dashboard/Pedidos (nuevo)
    │   ├── UseCases.jsx          ← 4 casos de uso por tipo de negocio
    │   ├── HowItWorks.jsx        ← Proceso de 3 pasos con línea animada
    │   ├── Pricing.jsx           ← 5 planes de suscripción
    │   ├── CTA.jsx               ← Sección final de llamada a la acción
    │   ├── Footer.jsx            ← Footer con columnas de links y redes sociales
    │   └── ui/
    │       ├── Button.jsx        ← primary / secondary / ghost / outline
    │       ├── Card.jsx          ← Contenedor de tarjeta genérico
    │       └── Section.jsx       ← Wrapper de sección + SectionHeader con reveal
    └── hooks/
        ├── useCursorGlow.js      ← Efecto de resplandor que sigue al cursor (Framer Motion spring)
        └── useScrollReveal.js    ← Animaciones de entrada al hacer scroll
```

---

## 2. Stack tecnológico

| Herramienta | Versión | Uso |
|---|---|---|
| React | `^18.2.0` | Framework UI |
| Vite | `^5.1.4` | Bundler y dev server |
| Tailwind CSS | `^3.4.1` | Utilidades CSS + sistema de diseño |
| Framer Motion | `^11.0.3` | Animaciones declarativas (stagger, spring, scroll) |
| Lucide React | `^0.344.0` | Iconografía (Cpu, Globe, Zap, Check, etc.) |
| PostCSS / Autoprefixer | `^8.4 / ^10.4` | Preprocesado CSS |

**No hay router** (React Router no instalado). La navegación es mediante anclas HTML (`href="#features"` etc.).

---

## 3. Variables de entorno y configuración

### `vite.config.js`

```js
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5172,
    strictPort: true,
  },
})
```

Puerto fijo `5172`. No hay configures de proxy (la landing no hace llamadas al backend).

### `index.html`

```html
<html lang="en" class="dark">
```

El atributo `dark` en `<html>` NO está activo en la versión actual (el tema es lila/púrpura claro, NO modo oscuro). El `index.html` usa `lang="en"` pero todo el contenido está en español.

---

## 4. Arquitectura de la página

`App.jsx` renderiza todos los componentes de sección en orden vertical. No hay rutas ni pages — todo es una sola columna lineal. El hook `useCursorGlow` está definido pero **no está activo** en la versión actual.

**Orden de secciones (11 componentes):**

| # | Componente | Áncora | Propósito |
|---|-----------|--------|----------|
| 1 | `<Navbar />` | — | Navegación fija superior |
| 2 | `<Hero />` | — | Primera sección, headline + chat mockup |
| 3 | `<TrustBar />` | — | Logos de rubros + 4 stats clave |
| 4 | `<Features />` | `#features` | 6 cards de funcionalidades técnicas |
| 5 | `<Demo />` | `#demo` | Demo animada: chat + panel admin sincronizado |
| 6 | `<ControlCenter />` | `#control-center` | Mockup del panel admin con auto-switch cada 4.8 s |
| 7 | `<UseCases />` | `#use-cases` | 4 casos de uso por tipo de negocio |
| 8 | `<HowItWorks />` | `#how-it-works` | 3 pasos para empezar |
| 9 | `<Pricing />` | `#pricing` | 5 planes de suscripción |
| 10 | `<CTA />` | — | Llamada a la acción final |
| 11 | `<Footer />` | — | Links y copyright |

```jsx
// App.jsx — estructura simplificada
export default function App() {
  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-x-hidden">
      <Navbar />
      <main>
        <Hero />
        <TrustBar />
        <Features />
        <Demo />
        <ControlCenter />
        <UseCases />
        <HowItWorks />
        <Pricing />
        <CTA />
      </main>
      <Footer />
    </div>
  )
}
```

---

## 5. Componentes

### 5.1 Navbar

**Archivo:** `src/components/Navbar.jsx`

Barra de navegación fija (`position: fixed`, `z-50`) con efecto glassmorphism al hacer scroll.

**Comportamiento:**
- Al hacer scroll > 20px: clases `glass border-b border-border/60 shadow-card` se activan (transición CSS 300ms)
- Por encima del fold: fondo completamente transparente
- Mobile: menú hamburger abre un drawer animado con `AnimatePresence` de Framer Motion

**Links de navegación (5 items):** Funcionalidades (`#features`), Demo (`#demo`), Panel Admin (`#control-center`), Casos de uso (`#use-cases`), Precios (`#pricing`)

**CTAs en el header:**
- `"Inicia sesión"` → `http://localhost:5174/` (admin frontend)
- `"Prueba chat genérico"` → `http://localhost:5173/` (chat frontend)

**Logo:** SVG inline `NexusIcon` (cruz de 4 puntos azules). Texto: "hayChat **Businesss**" *(triple `s`, typo en Navbar; Footer dice "Business" correctamente)*.

**Animación de entrada:** `initial={{ y: -20, opacity: 0 }}` → `animate={{ y: 0, opacity: 1 }}` en 500ms.

---

### 5.2 Hero

**Archivo:** `src/components/Hero.jsx`

Sección principal de pantalla completa (`min-h-screen`) con layout de dos columnas en desktop (copy izquierda + visual derecha).

**Efectos visuales de fondo:**
- Radial gradient `bg-accent/5` con `blur-[120px]` centrado, animado con `animate-glow-pulse`
- Segundo blob `bg-accent-2/4` en la esquina inferior izquierda
- Grid CSS con líneas sutiles (opacidad `0.025`) para sensación tech

**Parallax:** usa `useScroll` + `useTransform` de Framer Motion. El contenido izquierdo se desplaza `y: 0→60px` y desvanece (`opacity: 1→0`) mientras el usuario hace scroll.

**Animación de contenido:** `containerVariants` con `staggerChildren: 0.12` — cada elemento hijo aparece con 120ms de retraso entre sí.

**Contenido del copy:**
- Badge: `"En desarrollo activo · NLP + IA Híbrida"`
- Headline: `"Chatbot Inteligente para tu Negocio Local"` (tres líneas con degradados blanco + azul)
- Subheadline: descripción del producto (NLP + IA generativa como respaldo, siempre preciso)
- CTAs: "Registrar mi negocio" (`href="#"` **sin destino real aún**) y "Ver demo" (`href="#demo"`)
- Social proof: 5 avatares con iniciales `R, T, P, F, B`

---

### 5.3 TrustBar

**Archivo:** `src/components/TrustBar.jsx`

Franja horizontal de prueba social entre el Hero y el grid de Features.

- Muestra 8 tipos de negocio (Restaurantes, Ferretérías, Papelerías, etc.) con fade-in staggered
- 4 stats: `< 2s` (tiempo de respuesta), `1600` (tests), `100%` privacidad de voz, `24/7`
- Nota: el código importa paths SVG de logos externos (Stripe, Vercel, Notion) pero los renderiza como texto plano — vestigio de una versión anterior

---

### 5.4 Features

**Archivo:** `src/components/Features.jsx`
**Ancla:** `#features` (sección `<Section id="features">`)

Grid de **6 tarjetas** de funcionalidades. Cada tarjeta tiene icono Lucide, título, descripción y color de acento propio.

| # | Icono | Título | Descripción resumida |
|---|---|---|---|
| 1 | `Cpu` | NLP Híbrido + IA Generativa | Reglas deterministas primero; OpenAI con RAG solo cuando ninguna regla aplica |
| 2 | `Globe` | Voz: STT + TTS Nativo | APIs nativas del navegador; ningún audio sale del dispositivo |
| 3 | `BookOpen` | Contexto Multi-turno con Redis | Recuerda la conversación; fallback en memoria si Redis no está disponible |
| 4 | `Zap` | Panel Admin SaaS Incluido | Gestiona productos, servicios y horarios desde un panel web moderno |
| 5 | `BarChart2` | Importación Masiva desde Excel | Un solo archivo para cargar el catálogo completo; vista previa con validación |
| 6 | `Plug` | Tiempo Real vía WebSocket | Socket.io con indicador de escritura, historial en Redis, sesión por dispositivo |

**Animación:** `cardVariants` con `custom(i)` → delay de `i * 0.08s`, `whileInView` se activa una sola vez (`once: true`).

**Header de sección:** `SectionHeader` con eyebrow "Plataforma".

---

### 5.5 Demo

**Archivo:** `src/components/Demo.jsx`
**Ancla:** `#demo`

Demo animada del chatbot con panel admin sincronizado. Completamente autónoma (sin props).

- Estado: `visibleMessages[]`, `typing`, `started`, `orderFlow` (objeto con 5 props)
- Flujo automatizado con **14 `setTimeout`** encadenados (600 ms – 17 700 ms):
  - 7 mensajes de conversación
  - Flujo de pedido: acción visible → form → recibo pending → accepted (14.9 s) → ready (17.7 s)
- Layout: 2 columnas `[1.08fr / 0.92fr]` — chat izquierdo | `<AdminOrdersSync />` derecho
- Subcomponentes: `DemoMessage`, `AgentAvatar`, `OrderFormPreview`, `OrderReceiptPreview`, `OrderReadyPreview`, `AdminOrdersSync`
- Botón "Repetir demo" que reinicia todos los timeouts

### 5.6 ControlCenter

**Archivo:** `src/components/ControlCenter.jsx`
**Áncora:** `#control-center`

Sección nueva que muestra el panel admin como mockup interactivo. Se ubica entre `Demo` y `UseCases`.

- Estado: `activeView` (`'dashboard'` | `'orders'`) — **auto-switch cada 4.8 segundos** con `setInterval`
- Layout: 2 columnas `[0.92fr / 1.08fr]` — tarjetas descripción | panel mockup
- Panel mockup tiene sidebar con 4 items (Resumen, Productos, Pedidos, Horarios)
- `AnimatePresence mode="wait"` para transición entre vistas
- Subcomponentes: `DashboardPreview`, `OrdersPreview`, `CompactMetric`, `StatTile`
- CTA: `href="http://localhost:5174/"` → "Ver panel admin"

### 5.7 UseCases

**Archivo:** `src/components/UseCases.jsx`
**Áncora:** `#use-cases`

Grid de **4 casos de uso** para distintos tipos de negocios locales: restaurantes, ferreterías, etc. Cada tarjeta incluye tipo de negocio, descripción, tags y color de acento.

- Íconos Lucide: `TrendingUp`, `Layers`, `Headphones`, `Users`
- Hover: `y: -4` + glow radial + flecha con `opacity: 0 → 100`
- Subcomponente `<UseCaseCard useCase index />`

### 5.8 HowItWorks

**Archivo:** `src/components/HowItWorks.jsx`
**Ancla:** `#how-it-works`

Proceso de **3 pasos** en un grid horizontal con línea conectora animada.

| Paso | Icono | Título | Descripción |
|---|---|---|---|
| 01 | `UserPlus` | Registra tu negocio | Crea cuenta en el panel admin: nombre, teléfono, correo y ubicación. Listo en < 5 minutos |
| 02 | `Database` | Carga tu catálogo | Agrega productos, servicios, horarios y promociones — uno a uno o por Excel. Sin código |
| 03 | `Rocket` | Comparte el chat | Comparte el enlace o embéde el chatbot en tu sitio. Clientes preguntan de inmediato |

**Línea conectora (desktop):** `div` absoluto entre los pasos con degradado `from-accent/20 via-accent/60 to-accent/20`. Punto animado que recorre la línea de izquierda a derecha en bucle de 3 s (`repeatType: 'reverse'`).

**Header de sección:** `SectionHeader` con eyebrow "Proceso" y headline "Listo para atender en minutos".

---

### 5.9 Pricing

**Archivo:** `src/components/Pricing.jsx`
**Ancla:** `#pricing`

Grid de **5 planes** (sin toggle mensual/anual): `Emprendedor`, `Lite`, `Empresarial`, `Premium` (deshabilitado) y `Custom` (precio personalizado).

| Plan | Precio | Estado | CTA | Notas |
|---|---|---|---|---|
| Emprendedor | $199 MXN/mes | Disponible | Elegir plan | Hasta 20 productos |
| Lite | $399 MXN/mes | Disponible | Elegir plan | Hasta 500 productos |
| Empresarial | $499 MXN/mes | Disponible | Elegir plan | **Recomendado** (highlighted) |
| Premium | $799 MXN/mes | En desarrollo | Próximamente | `disabled: true` |
| Custom | Personalizado | Futuro | Hablar con ventas | Integraciones a medida |

**Comportamiento clave:**
- Layout responsive: `grid-cols-1 md:grid-cols-2 xl:grid-cols-5`
- Animación de entrada por tarjeta con delay progresivo (`index * 0.1`)
- Hover vertical: `-6px` para highlighted, `-4px` para las demás
- Badge superior "Recomendado" solo en plan Empresarial
- Indicador visual: "Precios en MXN / mes"

---

### 5.10 CTA

**Archivo:** `src/components/CTA.jsx`

Sección final de conversión con fondo animado y doble llamada a la acción.

- Fondo: 2 capas radiales (`motion.div`) con escala/opacidad en loop (6s y 8s)
- Decoración: 3 líneas horizontales con gradiente violeta de baja opacidad
- Badge: "Listo para atender en minutos"
- Headline: "Dale voz a tu negocio hoy" (`text-gradient-white` + `text-gradient-blue`)
- CTA primario: `Registrar mi negocio` (`href="#"`, sin destino real)
- CTA secundario: botón `secondary` con texto `Ver demo`
- Nota de confianza: "Rápido y confiable · Cancela cuando quieras"

### 5.11 Footer

**Archivo:** `src/components/Footer.jsx`

Footer con marca, enlaces por categoría y barra inferior de estado.

- Grid principal: `grid-cols-2 md:grid-cols-6`
- Columnas de links: `Producto`, `Empresa`, `Plataforma`, `Legal` (todos `href="#"`)
- Redes sociales: `Instagram` y `LinkedIn` (también `href="#"`)
- Marca: `hayChat Business` con `NexusIcon` inline
- Barra inferior: copyright dinámico (`new Date().getFullYear()`) + badge "All systems operational"

---

## 6. Componentes UI reutilizables

### `Button.jsx`

`forwardRef` con `motion.div` wrapper (hover: `scale: 1.02`, tap: `scale: 0.97`).
Variantes: `primary` (bg-accent, shadow-glow), `secondary` (transparente + borde), `ghost`, `outline`.
Tamaños: `sm`, `md` (default), `lg`, `xl`.
Si recibe `href` usa `<a>`, si no usa el prop `as` (default `<button>`).

### `Card.jsx`

Contenedor de tarjeta genérico con `glass` background, borde `border-border/60` y sombra `shadow-card`. Acepta className para extensión.

### `Section.jsx` + `SectionHeader`

`Section` — wrapper semántico `<section>` con padding vertical estándar (`py-24 md:py-32`, o `py-16 md:py-20` con `tight`). Acepta prop `id` para anclas de navegación.

`SectionHeader` — header de sección con animación de entrada `whileInView` (se ejecuta una sola vez). Acepta:

| Prop | Descripción |
|---|---|
| `eyebrow` | Texto pequeño sobre el headline (ej: "Plataforma") con decoración de líneas a los lados |
| `headline` | H2 principal con clase `text-gradient-white` |
| `subheadline` | Párrafo de apoyo en `text-foreground-muted` |
| `center` | Centra el contenido (default `true`) |

---

## 7. Hooks personalizados

### `useCursorGlow.js`

Efecto de resplandor suavizado que sigue al cursor del mouse.

```js
const { x, y, visible } = useCursorGlow()
```

- Usa `useSpring` de Framer Motion para suavizar el movimiento (`stiffness: 500, damping: 50`)
- `visible` se activa al mover el mouse y se desactiva al salir del viewport
- Los valores `x` y `y` se pasan directamente a la prop `style` de `motion.div`

### `useScrollReveal.js`

Hook de utilidad para animar elementos al entrar en el viewport durante el scroll. Wrappea la API de Framer Motion `whileInView` / IntersectionObserver.

---

## 8. Sistema de diseño

**Paleta lila/púrpura clara** (NO modo oscuro):

| Token Tailwind | Valor | Uso |
|----------------|-------|-----|
| `background` | `#f6f3ff` | Fondo global (lila muy claro) |
| `surface` | `#ffffff` | Tarjetas |
| `surface-2` | `#f3effd` | Hover states |
| `surface-3` | `#ece5fb` | Hover activo |
| `border` | `#ddd6f3` | Bordes normales |
| `border-subtle` | `#cdbfe9` | Bordes hover |
| `accent` | `#2563eb` | Azul primario (blue-600) |
| `accent-glow` | `#3b82f6` | Hover del accent |
| `accent-dim` | `#1e3a8a` | Accent oscuro |
| `accent-2` | `#60a5fa` | Accent secundario (blue-400) |
| `foreground` | `#161325` | Texto principal |
| `foreground-muted` | `#615b78` | Texto secundario |
| `foreground-subtle` | `#8d87a3` | Texto desactivado |

**Sombras custom:**
- `shadow-glow`: `0 16px 40px rgba(124,58,237,0.16)` (violeta)
- `shadow-card`: `0 18px 45px rgba(63,38,100,0.08) + ring border`

**Animaciones CSS custom (keyframes en Tailwind):**
| Clase | Comportamiento |
|-------|---------------|
| `animate-float` | translateY 0 → -10px → 0, 6s loop |
| `animate-shimmer` | backgroundPosition sweep, 2.5s |
| `animate-typing` | opacity blink 1s steps(1) |
| `animate-fade-up` | opacity + translateY, 0.5s forwards |
| `animate-glow-pulse` | opacity 0.4→0.8 + scale 1→1.05, 3s |
| `animate-pulse-slow` | pulse nativo extendido a 4s |

**Tipografía:** Inter (sans-serif) para UI + JetBrains Mono / Fira Code para código. Cargadas desde Google Fonts.

**Capas visuales globales (`src/index.css`):**
- Fondo base con gradientes radiales + degradado vertical en `body` y `#root`
- Scrollbar personalizada (track lila y thumb violeta suave)
- `::selection` con highlight violeta translúcido

**Utilidades globales destacadas:**
- Texto: `text-gradient`, `text-gradient-white`, `text-gradient-blue`, `shimmer-text`
- Superficie: `glass`, `glass-light`, `chat-shell`, `chat-panel`
- Chat: `chat-bubble-ai`, `chat-bubble-user`, `typing-dot`
- Efectos: `border-gradient`, `glow-blue`, `glow-blue-sm`, `noise-bg`, `section-separator`

## 9. Cómo correr el proyecto

### Requisitos

- Node.js ≥ 18
- No necesita backend ni base de datos (es solo la landing page estática)

### Instalar y correr

```bash
cd mainPage
npm install
npm run dev        # Vite en puerto 5172
```

### Build de producción

```bash
cd mainPage
npm run build      # Genera dist/
npm run preview    # Sirve el build en localhost
```

### Acceso

| Entorno | URL |
|---|---|
| Desarrollo | http://localhost:5172 |
| Celular (misma Wi-Fi) | http://192.168.1.3:5172 |

### Relación con los otros proyectos

La landing page es completamente independiente. Los botones de CTA apuntan a:

| Botón | Destino | Proyecto |
|---|---|---|
| Start Free / Empezar gratis | http://localhost:5173 | `frontend/` (chat de demostración) |
| Admin Login | http://localhost:5174 | `admin-frontend/` (panel de administración) |

En producción, estas URLs hardcodeadas deben reemplazarse por las URLs de producción correspondientes (o variables de entorno vía `import.meta.env.VITE_*`).

---

## Notas de desarrollo

- El proyecto no tiene variables de entorno configuradas por diseño — todas las URLs de desarrollo están hardcodeadas en `Navbar.jsx`
- Hay referencias a `NexusIcon` (SVG inline) en `Navbar.jsx` y `Footer.jsx` — es el ícono del logo de ChatLocal AI, definido como función local dentro del mismo archivo
- El campo `lang="en"` en `index.html` es una inconsistencia pendiente — el contenido de la página está en español; debería cambiarse a `lang="es"` para SEO y accesibilidad
