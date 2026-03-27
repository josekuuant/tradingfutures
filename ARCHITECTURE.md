# Trading Signals Platform — Architecture Document

> Private platform for NQ/MNQ trading signals powered by Claude AI

---

## 1. Executive Summary

Platform web privada de un solo usuario para generar señales de trading (BUY / SELL / NO TRADE) en futuros NQ/MNQ. El sistema ingiere market data de Databento, permite configurar estrategias y prompts personalizados, ejecuta análisis via Claude API, y presenta señales en un dashboard financiero premium con dark mode.

**Principios de diseño:**
- Single-user, zero auth complexity (API key simple para proteger endpoints)
- Monorepo con frontend y backend claramente separados
- Cada módulo es independiente y reemplazable
- La app es funcional al final de cada fase

---

## 2. Recommended Architecture

### Stack Tecnológico

| Capa | Tecnología | Justificación |
|------|-----------|---------------|
| **Frontend** | Next.js 14 (App Router) + TypeScript | SSR, file-based routing, React Server Components |
| **UI** | Tailwind CSS + shadcn/ui | Componentes premium, dark mode nativo, sin overhead |
| **Charts** | Lightweight Charts (TradingView) | Librería financiera profesional, ligera, gratuita |
| **State** | Zustand | Mínimo boilerplate, ideal para single-user |
| **Backend** | Next.js API Routes + Server Actions | Un solo deploy, sin servidor separado |
| **Database** | SQLite (via Drizzle ORM) | Zero config, file-based, perfecto para single-user |
| **WebSocket** | Native WS (para Databento stream) | Conexión directa al feed de datos |
| **AI Engine** | Claude API (@anthropic-ai/sdk) | Motor de análisis y generación de señales |
| **Broker API** | Tradovate REST/WebSocket API | Ejecución de órdenes y datos de cuenta |
| **Validación** | Zod | Schema validation compartido front/back |
| **Testing** | Vitest + Playwright | Unit + E2E |

### Decisiones Arquitectónicas Clave

1. **Monolito modular** — No microservicios. Un solo proyecto Next.js con separación clara de responsabilidades. Para un solo usuario, la complejidad de microservicios no se justifica.

2. **SQLite sobre Postgres** — Sin necesidad de concurrencia multi-usuario ni escalado horizontal. SQLite es más simple, sin dependencia externa, backup = copiar un archivo.

3. **Next.js API Routes como backend** — Evita mantener dos servidores. Las API Routes de Next.js son suficientes para el volumen de un solo usuario.

4. **Server-side data fetching** — Las API keys de Databento, Tradovate y Claude nunca llegan al browser. Todo pasa por el backend.

---

## 3. Folder Structure

```
tradingfutures/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root layout (dark mode, fonts)
│   │   ├── page.tsx                  # Dashboard principal
│   │   ├── signals/
│   │   │   └── page.tsx              # Historial de señales
│   │   ├── strategies/
│   │   │   └── page.tsx              # Configuración de estrategias
│   │   ├── market/
│   │   │   └── page.tsx              # Market data & charts
│   │   ├── account/
│   │   │   └── page.tsx              # Estado de cuenta Tradovate
│   │   ├── settings/
│   │   │   └── page.tsx              # Configuración general
│   │   └── api/
│   │       ├── signals/
│   │       │   ├── route.ts          # CRUD señales
│   │       │   └── generate/
│   │       │       └── route.ts      # Trigger análisis Claude
│   │       ├── strategies/
│   │       │   └── route.ts          # CRUD estrategias
│   │       ├── market-data/
│   │       │   └── route.ts          # Proxy Databento
│   │       ├── account/
│   │       │   └── route.ts          # Proxy Tradovate
│   │       └── health/
│   │           └── route.ts          # Health check
│   │
│   ├── components/
│   │   ├── ui/                       # shadcn/ui components
│   │   ├── layout/
│   │   │   ├── sidebar.tsx           # Navigation sidebar
│   │   │   ├── header.tsx            # Top bar con status
│   │   │   └── status-bar.tsx        # Connection status strip
│   │   ├── dashboard/
│   │   │   ├── signal-card.tsx       # Señal activa BUY/SELL/NO TRADE
│   │   │   ├── market-summary.tsx    # Resumen de mercado
│   │   │   ├── recent-signals.tsx    # Últimas señales
│   │   │   └── account-summary.tsx   # Balance / P&L
│   │   ├── charts/
│   │   │   └── price-chart.tsx       # TradingView Lightweight Chart
│   │   ├── signals/
│   │   │   ├── signal-list.tsx       # Tabla de señales
│   │   │   └── signal-detail.tsx     # Detalle con reasoning
│   │   └── strategies/
│   │       ├── strategy-form.tsx     # Editor de estrategia
│   │       └── prompt-editor.tsx     # Editor de prompts
│   │
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts             # Drizzle client
│   │   │   ├── schema.ts            # Drizzle schema definitions
│   │   │   └── migrations/          # SQL migrations
│   │   ├── services/
│   │   │   ├── claude.ts            # Claude API client
│   │   │   ├── databento.ts         # Databento client
│   │   │   ├── tradovate.ts         # Tradovate client
│   │   │   └── signal-engine.ts     # Orchestrator: data → Claude → signal
│   │   ├── config.ts                # Environment config + validation
│   │   └── utils.ts                 # Helpers compartidos
│   │
│   ├── hooks/
│   │   ├── use-market-data.ts       # Hook para market data stream
│   │   └── use-signals.ts           # Hook para señales
│   │
│   └── types/
│       ├── market.ts                # Market data types
│       ├── signal.ts                # Signal types
│       ├── strategy.ts              # Strategy types
│       └── account.ts               # Account/order types
│
├── drizzle.config.ts                # Drizzle ORM config
├── next.config.ts                   # Next.js config
├── tailwind.config.ts               # Tailwind config
├── tsconfig.json
├── package.json
├── .env.local                       # API keys (gitignored)
├── .env.example                     # Template de env vars
├── .gitignore
└── ARCHITECTURE.md                  # Este documento
```

---

## 4. Main Modules

### Module 1: Market Data (Databento)
**Responsabilidad:** Conectar con Databento, recibir datos de NQ/MNQ, normalizar y almacenar.

```
Input:  Databento WebSocket/REST → OHLCV, quotes, trades
Output: MarketSnapshot normalizado para consumo interno
```

- Soporta timeframes: 1m, 5m, 15m, 1h, 1D
- Cachea el último snapshot en memoria para acceso rápido
- Persiste histórico en SQLite para backtesting futuro

### Module 2: Strategy Manager
**Responsabilidad:** CRUD de estrategias con prompts personalizados.

Una estrategia contiene:
- Nombre y descripción
- Prompt template para Claude (con variables inyectables)
- Condiciones de activación (horario, volatilidad mínima, etc.)
- Estado activo/inactivo

### Module 3: Signal Engine (Core)
**Responsabilidad:** Orquestar el flujo data → análisis → señal.

```
1. Obtener MarketSnapshot actual
2. Obtener estrategia activa + prompt template
3. Inyectar datos de mercado en el prompt
4. Enviar a Claude API
5. Parsear respuesta estructurada
6. Generar Signal {action, confidence, reasoning, entry, stop, target}
7. Persistir en DB
8. Notificar al frontend via polling/SSE
```

### Module 4: Account Manager (Tradovate)
**Responsabilidad:** Consultar estado de cuenta, posiciones abiertas, órdenes.

- Balance, P&L diario, margen disponible
- Posiciones abiertas en NQ/MNQ
- Historial de órdenes del día
- (Fase futura: ejecución automática de órdenes)

### Module 5: Dashboard UI
**Responsabilidad:** Presentar toda la información en un dashboard financiero premium.

---

## 5. Data Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Databento   │────▶│  Market Data  │────▶│                 │
│  (WebSocket) │     │   Service     │     │  Signal Engine   │
└─────────────┘     └──────────────┘     │                 │
                                          │  1. Get data     │
┌─────────────┐     ┌──────────────┐     │  2. Get strategy │
│  Strategy    │────▶│  Strategy     │────▶│  3. Build prompt │
│  Config (DB) │     │   Manager     │     │  4. Call Claude  │
└─────────────┘     └──────────────┘     │  5. Parse signal │
                                          │  6. Store result │
                    ┌──────────────┐     │                 │
                    │  Claude API   │◀───▶│                 │
                    └──────────────┘     └────────┬────────┘
                                                  │
                                                  ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Tradovate   │◀───▶│  Account      │     │   SQLite DB      │
│  (REST/WS)   │     │   Manager     │     │   (Signals,      │
└─────────────┘     └──────────────┘     │    Strategies)   │
                                          └────────┬────────┘
                                                  │
                                                  ▼
                                          ┌─────────────────┐
                                          │   Dashboard UI   │
                                          │   (Next.js)      │
                                          └─────────────────┘
```

### Flujo de una señal (paso a paso):

1. **Trigger** — Manual (botón "Analyze Now") o automático (cron cada N minutos)
2. **Market Data Service** obtiene el snapshot actual de Databento (OHLCV últimas N velas, volumen, spread)
3. **Strategy Manager** carga la estrategia activa con su prompt template
4. **Signal Engine** inyecta los datos de mercado en el prompt template:
   ```
   {{instrument}}, {{timeframe}}, {{ohlcv_data}}, {{volume_profile}}, {{current_price}}
   ```
5. **Claude API** recibe el prompt y responde con JSON estructurado:
   ```json
   {
     "action": "BUY" | "SELL" | "NO_TRADE",
     "confidence": 0.85,
     "reasoning": "...",
     "entry_price": 18450.25,
     "stop_loss": 18420.00,
     "take_profit": 18510.50,
     "risk_reward_ratio": 2.0
   }
   ```
6. **Signal** se persiste en SQLite con timestamp y metadata
7. **Dashboard** muestra la señal activa con indicador visual prominente

---

## 6. Pages / Dashboard Structure

### Layout General
```
┌─────────────────────────────────────────────────────┐
│  Status Bar: ● Databento ● Tradovate ● Claude       │
├──────────┬──────────────────────────────────────────┤
│          │                                          │
│  SIDEBAR │         MAIN CONTENT AREA                │
│          │                                          │
│  📊 Dashboard │                                     │
│  📈 Market    │                                     │
│  ⚡ Signals   │                                     │
│  🎯 Strategies│                                     │
│  💰 Account   │                                     │
│  ⚙ Settings  │                                     │
│          │                                          │
└──────────┴──────────────────────────────────────────┘
```

### Page 1: Dashboard (Home)
- **Signal Card** — Grande, centrado. Muestra la señal activa: BUY (verde), SELL (rojo), NO TRADE (gris). Con confidence %, entry, SL, TP.
- **Price Chart** — Lightweight Charts con la acción del precio reciente de NQ.
- **Recent Signals** — Últimas 5-10 señales en tabla compacta.
- **Account Summary** — Balance, P&L del día, posiciones abiertas.
- **Botón "Analyze Now"** — Trigger manual de análisis.

### Page 2: Market
- **Chart interactivo** — Timeframe selector (1m, 5m, 15m, 1h).
- **Datos en tiempo real** — Precio, volumen, high/low del día.
- **Estado de conexión Databento**.

### Page 3: Signals
- **Tabla completa** de señales históricas con filtros (fecha, acción, confidence).
- **Detalle expandible** — Click en una señal muestra el reasoning completo de Claude.
- **Estadísticas** — Win rate, promedio de confidence, señales por día.

### Page 4: Strategies
- **Lista de estrategias** — Cards con nombre, descripción, estado activo/inactivo.
- **Editor de estrategia** — Formulario con:
  - Nombre
  - Descripción
  - Prompt template (textarea con syntax highlighting)
  - Variables disponibles (chips informativos)
  - Toggle activa/inactiva
- **Solo una estrategia activa a la vez**.

### Page 5: Account
- **Balance y equity** de Tradovate.
- **Posiciones abiertas** con P&L en tiempo real.
- **Historial de órdenes** del día.
- **Estado de conexión Tradovate**.

### Page 6: Settings
- **API Keys** — Databento, Tradovate, Claude (inputs con máscara).
- **Preferencias** — Intervalo de análisis automático, notificaciones.
- **About** — Versión, status del sistema.

---

## 7. Database Schema (SQLite + Drizzle)

```sql
-- Estrategias de trading
CREATE TABLE strategies (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  description TEXT,
  prompt_template TEXT NOT NULL,
  instrument TEXT NOT NULL DEFAULT 'NQ',
  timeframe TEXT NOT NULL DEFAULT '5m',
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Señales generadas
CREATE TABLE signals (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  strategy_id TEXT NOT NULL REFERENCES strategies(id),
  action TEXT NOT NULL CHECK (action IN ('BUY', 'SELL', 'NO_TRADE')),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  reasoning TEXT NOT NULL,
  entry_price REAL,
  stop_loss REAL,
  take_profit REAL,
  risk_reward_ratio REAL,
  instrument TEXT NOT NULL DEFAULT 'NQ',
  timeframe TEXT NOT NULL,
  market_context TEXT,          -- JSON snapshot del mercado al momento
  claude_model TEXT,            -- Modelo usado
  claude_prompt TEXT,           -- Prompt enviado (para auditoría)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Snapshots de market data (para histórico/backtesting)
CREATE TABLE market_snapshots (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  instrument TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  data TEXT NOT NULL,            -- JSON con OHLCV array
  current_price REAL NOT NULL,
  volume REAL,
  high_of_day REAL,
  low_of_day REAL,
  captured_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Configuración de la app (key-value)
CREATE TABLE app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Log de actividad para debugging
CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,            -- 'signal_generated', 'api_error', 'connection_lost', etc.
  message TEXT NOT NULL,
  metadata TEXT,                 -- JSON opcional
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Índices

```sql
CREATE INDEX idx_signals_created_at ON signals(created_at DESC);
CREATE INDEX idx_signals_action ON signals(action);
CREATE INDEX idx_signals_strategy ON signals(strategy_id);
CREATE INDEX idx_market_snapshots_instrument ON market_snapshots(instrument, timeframe, captured_at DESC);
CREATE INDEX idx_activity_log_type ON activity_log(type, created_at DESC);
```

---

## 8. Implementation Roadmap

### Phase 1: Foundation (Semana 1)
> **Goal:** App funcional con UI skeleton y navegación completa.

- [x] Arquitectura documentada
- [ ] Inicializar proyecto Next.js 14 + TypeScript
- [ ] Configurar Tailwind + shadcn/ui (dark mode default)
- [ ] Configurar Drizzle ORM + SQLite
- [ ] Crear schema de DB + migraciones
- [ ] Layout principal: sidebar, header, status bar
- [ ] Todas las páginas con contenido placeholder
- [ ] Configuración de environment variables (.env.example)
- [ ] Health check endpoint

**Resultado:** App navegable con dark theme premium, sin datos reales.

### Phase 2: Strategy Manager + Signal Engine (Semana 2)
> **Goal:** Poder crear estrategias, ejecutar análisis con Claude, ver señales.

- [ ] CRUD completo de estrategias (UI + API)
- [ ] Editor de prompts con variables inyectables
- [ ] Integración Claude API
- [ ] Signal Engine: orquestación completa del flujo
- [ ] Página de señales con tabla y detalle
- [ ] Dashboard signal card funcional
- [ ] Botón "Analyze Now" con datos mock de mercado
- [ ] Activity log

**Resultado:** Puedes crear una estrategia, ejecutar análisis (con datos mock), y ver señales reales de Claude.

### Phase 3: Market Data Integration (Semana 3)
> **Goal:** Datos de mercado reales de Databento.

- [ ] Cliente Databento (REST para histórico)
- [ ] Market data service con normalización
- [ ] Price chart con Lightweight Charts
- [ ] Página Market completa
- [ ] Inyección de datos reales en el Signal Engine
- [ ] Market snapshots en DB
- [ ] Status indicator de conexión Databento

**Resultado:** Señales generadas con datos de mercado reales.

### Phase 4: Tradovate Integration (Semana 4)
> **Goal:** Visualizar estado de cuenta y posiciones.

- [ ] Cliente Tradovate (autenticación OAuth)
- [ ] Endpoints de account/positions/orders
- [ ] Página Account completa
- [ ] Account summary en dashboard
- [ ] Status indicator de conexión Tradovate

**Resultado:** Dashboard completo con datos de mercado, señales y estado de cuenta.

### Phase 5: Polish & Automation (Semana 5)
> **Goal:** Automatización, refinamiento visual, estabilidad.

- [ ] Análisis automático por intervalo configurable
- [ ] Estadísticas de señales (win rate, etc.)
- [ ] Página Settings funcional
- [ ] Manejo de errores robusto en todas las integraciones
- [ ] Loading states y error states en toda la UI
- [ ] Responsive design ajustes finales
- [ ] Tests unitarios para Signal Engine y servicios

**Resultado:** Plataforma completa, pulida y estable.

---

## 9. QA / Stability Principles

### Reglas de Calidad Inquebrantables

1. **Zero breaking changes** — Cada nueva feature se añade sin modificar interfaces existentes. Si hay que cambiar una interfaz, se hace con backwards compatibility temporal.

2. **Type safety end-to-end** — TypeScript strict mode. Zod para validación de inputs en API routes. Tipos compartidos en `src/types/`.

3. **Modular boundaries** — Cada servicio en `src/lib/services/` tiene una interfaz pública clara. Los servicios nunca se importan entre sí directamente; el Signal Engine es el único orquestador.

4. **Database migrations only** — Nunca modificar schema directamente. Siempre crear una nueva migración con Drizzle Kit.

5. **Environment isolation** — Todas las API keys en `.env.local`. Nunca hardcodeadas. Config validada al startup con Zod.

6. **Error boundaries** — Cada página tiene error boundary. Las llamadas a APIs externas siempre tienen try/catch con logging.

7. **No side effects en imports** — Los módulos no ejecutan código al importarse. Toda inicialización es explícita.

8. **Git hygiene** — Commits atómicos por feature. Branch por fase. No force push.

9. **API contract first** — Los tipos de request/response se definen antes de implementar el endpoint.

10. **Graceful degradation** — Si Databento se cae, el dashboard sigue funcionando con datos cacheados. Si Claude falla, se muestra el error sin romper la UI. Si Tradovate no conecta, el resto de la app funciona normal.

### Testing Strategy

| Nivel | Herramienta | Qué se testea |
|-------|------------|---------------|
| Unit | Vitest | Services (claude.ts, databento.ts, signal-engine.ts) |
| Integration | Vitest | API routes con mocks de servicios externos |
| E2E | Playwright | Flujos críticos: crear estrategia → generar señal → ver en dashboard |

### Checklist Pre-Merge (por cada feature)

- [ ] TypeScript compila sin errores (`tsc --noEmit`)
- [ ] Lint pasa (`eslint .`)
- [ ] Tests existentes no se rompen
- [ ] La app arranca y navega sin errores en consola
- [ ] Dark mode se ve correcto
- [ ] No hay API keys expuestas en el código

---

## 10. Technical Risks & Mitigations

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Databento WebSocket se desconecta | Sin datos de mercado | Reconnect automático con backoff exponencial + datos cacheados |
| Claude API rate limits o latencia | Señales retrasadas | Queue con retry + timeout de 30s + indicador de "analyzing..." |
| Tradovate OAuth token expira | Sin datos de cuenta | Refresh token automático + graceful degradation |
| SQLite file corruption | Pérdida de datos | WAL mode + backups periódicos del archivo .db |
| Prompt injection en estrategias | Respuestas inesperadas de Claude | Sanitización del prompt + response schema validation con Zod |
| Next.js cold start lento | UX pobre al abrir | Prefetch de datos críticos + skeleton loaders |
| Costos de Claude API descontrolados | Gastos inesperados | Rate limiting propio + contador de tokens por día + alerta |

---

*Document version: 1.0*
*Last updated: 2026-03-27*
