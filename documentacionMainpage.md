# ChatLocal AI — Documentación de la Landing Page (mainPage)

> Creado: 4 de abril de 2026
> Estado: desarrollo activo
> Archivo: `documentacionMainpage.md`

---

## Resumen del proyecto

**mainPage** es la landing page de marketing de **ChatLocal AI**, el producto SaaS de chatbot híbrido para negocios locales. Es un sitio de una sola página (SPA sin router) con anclas de navegación, construido con React + Vite + Tailwind CSS + Framer Motion. El objetivo es presentar el producto, sus funcionalidades, planes de precio y guiar al visitante a registrarse (panel admin) o probar el chat genérico de demostración.

Todo el contenido está en **español** (excepto los labels de navegación que están en inglés por decisión de diseño — Features, Demo, How it works, Pricing).

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
   - 5.6 [UseCases](#56-usecases)
   - 5.7 [HowItWorks](#57-howitworks)
   - 5.8 [Pricing](#58-pricing)
   - 5.9 [CTA](#59-cta)
   - 5.10 [Footer](#510-footer)
6. [Componentes UI reutilizables](#6-componentes-ui-reutilizables)
7. [Hooks personalizados](#7-hooks-personalizados)
8. [Sistema de diseño](#8-sistema-de-diseño)
9. [Cómo correr el proyecto](#9-cómo-correr-el-proyecto)

---

## 1. Estructura del proyecto

```
mainPage/
├── index.html                    ← HTML raíz: dark class, meta description, fuentes, viewport
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
    │   ├── Demo.jsx              ← Sección demo interactiva del chatbot
    │   ├── UseCases.jsx          ← Casos de uso por tipo de negocio
    │   ├── HowItWorks.jsx        ← Proceso de 3 pasos con línea animada
    │   ├── Pricing.jsx           ← Tres planes con toggle mensual/anual
    │   ├── CTA.jsx               ← Sección final de llamada a la acción
    │   ├── Footer.jsx            ← Footer con columnas de links y redes sociales
    │   └── ui/
    │       ├── Button.jsx        ← Componente de botón (primary / secondary / outline)
    │       ├── Card.jsx          ← Contenedor de tarjeta genérico
    │       └── Section.jsx       ← Wrapper de sección + SectionHeader con reveal animation
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

- El atributo `dark` en `<html>` activa el tema oscuro de Tailwind desde el inicio (sin parpadeo de tema claro).
- Fuentes cargadas desde Google Fonts: **Inter** (400–900) para UI + **JetBrains Mono** (400–500) para bloques de código.
- Meta description: `"ChatLocal AI — Chatbot híbrido inteligente para negocios locales."`
- Título: `"ChatLocal AI — Chatbot Inteligente para Negocios Locales"`

---

## 4. Arquitectura de la página

`App.jsx` es el único componente con estado propio (cursor glow a través de `useCursorGlow()`). Renderiza todos los componentes de sección en orden vertical. No hay rutas ni pages — todo es una sola columna lineal.

```jsx
// App.jsx — estructura simplificada
export default function App() {
  const { x, y, visible } = useCursorGlow()

  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-x-hidden">
      <motion.div className="cursor-glow" style={{ left: x, top: y, opacity: visible ? 1 : 0 }} />
      <Navbar />
      <main>
        <Hero />
        <TrustBar />
        <Features />
        <Demo />
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

El elemento `.cursor-glow` es un blob radial posicionado con `position: fixed` que sigue al cursor via spring animation de Framer Motion.

---

## 5. Componentes

### 5.1 Navbar

**Archivo:** `src/components/Navbar.jsx`

Barra de navegación fija (`position: fixed`, `z-50`) con efecto glassmorphism al hacer scroll.

**Comportamiento:**
- Al hacer scroll > 20px: clases `glass border-b border-border/60 shadow-card` se activan (transición CSS 300ms)
- Por encima del fold: fondo completamente transparente
- Mobile: menú hamburger abre un drawer animado con `AnimatePresence` de Framer Motion

**Links de navegación:**

| Label | Ancla |
|---|---|
| Features | `#features` |
| Demo | `#demo` |
| How it works | `#how-it-works` |
| Pricing | `#pricing` |

**CTAs en el header:**
- `Admin Login` → link a `http://localhost:5174/` (panel admin, abre en nueva pestaña)
- `Start Free` (botón primario) → `http://localhost:5173/` (chat de demostración, abre en nueva pestaña)

**Logo:** "ChatLocal**AI**" con el texto "AI" en color `text-accent`. Ícono SVG personalizado (`NexusIcon`) dentro de un contenedor con borde y glow accent.

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
- CTAs: botón primario "Empezar gratis" + botón outline con icono Play "Demo interactiva" / "Ver cómo funciona"
- Trust indicators: N negocios piloto, M categorías, K respuestas resueltas

---

### 5.3 TrustBar

**Archivo:** `src/components/TrustBar.jsx`

Franja horizontal de prueba social entre el Hero y el grid de Features. Puede incluir métricas destacadas, logotipos de empresas que usan el producto o badges de tecnología (React, Node.js, PostgreSQL, etc.).

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

Sección de demostración interactiva del chatbot. Puede mostrar un chat simulado con mensajes de ejemplo o incrustar el widget real del chat.

---

### 5.6 UseCases

**Archivo:** `src/components/UseCases.jsx`

Muestra casos de uso del chatbot para distintos tipos de negocios locales: restaurantes, ferreterías, papelerías, spas, etc. Cada caso incluye tipo de negocio, preguntas de ejemplo que el chatbot puede responder y los beneficios clave.

---

### 5.7 HowItWorks

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

### 5.8 Pricing

**Archivo:** `src/components/Pricing.jsx`
**Ancla:** `#pricing`

Tres planes de precio con toggle mensual/anual (estado React local `yearly`). Al activar annual se muestran precios menores.

| Plan | Precio mensual | Precio anual | Highlighted |
|---|---|---|---|
| **Básico** | $29/mo | $23/mo | No |
| **Pro** | $69/mo | $55/mo | **Sí** (borde accent, badge "Más popular") |
| **Enterprise** | Contactar | Contactar | No |

**Características por plan:**

*Básico:* 1 negocio, chat web, motor NLP, productos/servicios/horarios, contexto básico, soporte por correo.

*Pro (todo lo de Básico +):* Voz STT+TTS, IA generativa con OpenAI RAG, Importación Excel, Contexto multi-turno completo (Redis), Historial de conversaciones, Soporte prioritario.

*Enterprise:* Negocios ilimitados, white-label, IA personalizada, integraciones a medida, infraestructura dedicada, SLA garantizado, Gerente de éxito dedicado.

**CTA por plan:** "Empezar gratis" (Básico y Pro) / "Contactar ventas" (Enterprise).

---

### 5.9 CTA

**Archivo:** `src/components/CTA.jsx`

Sección final de llamada a la acción antes del footer. Reafirma la propuesta de valor y tiene botones de registro / demo.

---

### 5.10 Footer

**Archivo:** `src/components/Footer.jsx`

Grid de 6 columnas (2 para el branding + 4 para links).

**Columnas de links:**

| Categoría | Links |
|---|---|
| Producto | Características, Demo, Precios, Cómo funciona |
| Empresa | Nosotros, Blog, Contacto |
| Plataforma | Panel Admin, Importación Excel, API |
| Legal | Privacidad, Términos de uso |

**Branding:** Logo "ChatLocal**AI**" con ícono SVG inline + descripción "Chatbot híbrido inteligente para negocios locales. NLP determinísta + IA generativa con contexto real de tu negocio."

**Redes sociales:** Twitter, GitHub, LinkedIn, Discord (íconos Lucide, todos con href `#` en dev).

**Sub-footer:** copyright © ChatLocal AI + "Hecho con ❤️ para negocios locales" + badges "NLP · IA · Real-time".

---

## 6. Componentes UI reutilizables

### `Button.jsx`

Botón polimórfico: renderiza `<a>` si se le pasa `href`, de lo contrario `<button>`.

| Prop | Tipo | Valores | Default |
|---|---|---|---|
| `variant` | string | `'primary'` / `'secondary'` / `'outline'` | `'primary'` |
| `size` | string | `'sm'` / `'md'` / `'lg'` | `'md'` |
| `href` | string | URL o ancla | — |
| `target` | string | `'_blank'` etc. | — |

Uso en Navbar y Hero:
```jsx
<Button variant="primary" size="sm" href="http://localhost:5173/" target="_blank">
  Start Free
</Button>

<Button variant="outline" size="lg">
  <Play className="w-4 h-4" /> Demo interactiva
</Button>
```

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

### Tema

La página utiliza el tema **oscuro** de Tailwind CSS con variables CSS personalizadas. La clase `dark` está hardcodeada en `<html>` — no hay toggle de tema.

### Paleta de colores (variables Tailwind extendidas)

| Token | Descripción | Uso |
|---|---|---|
| `background` | Fondo principal oscuro (navy profundo) | Body, secciones |
| `foreground` | Texto principal (blanco/casi-blanco) | Títulos, texto principal |
| `foreground-muted` | Texto secundario (gris medio) | Subtítulos, descripciones |
| `surface` | Superficie elevada (cards, modals) | Cards, dropdown |
| `surface-2` | Superficie secundaria | Hover states, inputs |
| `border` | Color de bordes | Divisores, outline de cards |
| `accent` | Azul cielo primario `#0ea5e9` | Botones primarios, highlights |
| `accent-2` | Cyan secundario `#06b6d4` | Acentos alternativos |

### Clases utilitarias globales

| Clase | Descripción |
|---|---|
| `.glass` | Glassmorphism: `backdrop-blur` + fondo semitransparente + borde sutil |
| `.text-gradient-white` | Degradado blanco a gris para headlines |
| `.text-gradient-blue` | Degradado `accent` a `accent-2` para palabras clave |
| `.shadow-card` | Sombra suave para tarjetas |
| `.shadow-glow-sm` | Glow sutil en color accent |
| `.animate-glow-pulse` | Animación CSS de pulso para blobs de fondo |
| `.section-separator` | Separador visual entre secciones |
| `.cursor-glow` | Blob circular `position: fixed` que sigue al cursor |

### Tipografía

| Rol | Fuente | Pesos |
|---|---|---|
| UI / cuerpo | Inter | 400, 500, 600, 700, 800, 900 |
| Código / mono | JetBrains Mono | 400, 500 |

---

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
