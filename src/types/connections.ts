import { z } from "zod";

// ─── Provider types ──────────────────────────────────────────

export const PROVIDERS = [
  "databento",
  "claude",
  "tradovate",
  "rithmic",
  "ninjatrader",
  "topstepx",
  "polymarket",
] as const;

export type Provider = (typeof PROVIDERS)[number];

export type ProviderCategory = "data" | "ai" | "execution";

export type Environment = "sandbox" | "production" | "demo";
export type ConnectionStatus = "untested" | "connected" | "error" | "auth_expired";

// ─── Credential schemas per provider ────────────────────────

export const databentoCredentialsSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
});

export const claudeCredentialsSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  model: z.string().optional().default("claude-sonnet-4-6"),
  maxTokens: z.coerce.number().min(100).max(32000).optional().default(4096),
});

export const tradovateCredentialsSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  appId: z.string().optional().default(""),
  cid: z.string().optional().default(""),
  sec: z.string().optional().default(""),
});

export const rithmicCredentialsSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  server: z.string().optional().default(""),
  gateway: z.string().optional().default(""),
  systemName: z.string().optional().default(""),
  appName: z.string().optional().default(""),
  appVersion: z.string().optional().default(""),
});

export const ninjatraderCredentialsSchema = z.object({
  host: z.string().optional().default("localhost"),
  port: z.coerce.number().min(1).max(65535).optional().default(36973),
  apiKey: z.string().optional().default(""),
  mode: z.enum(["native_api", "desktop_bridge"]).optional().default("native_api"),
});

export const topstepxCredentialsSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  username: z.string().optional().default(""),
  accountId: z.string().optional().default(""),
});

export const polymarketCredentialsSchema = z.object({
  privateKey: z.string().min(1, "Wallet private key is required"),
  apiKey: z.string().optional().default(""),
  apiSecret: z.string().optional().default(""),
  apiPassphrase: z.string().optional().default(""),
});

export const credentialSchemas: Record<Provider, z.ZodTypeAny> = {
  databento: databentoCredentialsSchema,
  claude: claudeCredentialsSchema,
  tradovate: tradovateCredentialsSchema,
  rithmic: rithmicCredentialsSchema,
  ninjatrader: ninjatraderCredentialsSchema,
  topstepx: topstepxCredentialsSchema,
  polymarket: polymarketCredentialsSchema,
};

// ─── Type exports ────────────────────────────────────────────

export type DatabentoCredentials = z.infer<typeof databentoCredentialsSchema>;
export type ClaudeCredentials = z.infer<typeof claudeCredentialsSchema>;
export type TradovateCredentials = z.infer<typeof tradovateCredentialsSchema>;
export type RithmicCredentials = z.infer<typeof rithmicCredentialsSchema>;
export type NinjaTraderCredentials = z.infer<typeof ninjatraderCredentialsSchema>;
export type TopstepXCredentials = z.infer<typeof topstepxCredentialsSchema>;

// ─── API request/response ────────────────────────────────────

export const updateConnectionSchema = z.object({
  provider: z.enum(PROVIDERS),
  isEnabled: z.boolean(),
  environment: z.enum(["sandbox", "production", "demo"]),
  credentials: z.record(z.string(), z.unknown()),
});

export type UpdateConnectionPayload = z.infer<typeof updateConnectionSchema>;

export interface ConnectionResponse {
  id: string;
  provider: Provider;
  isEnabled: boolean;
  environment: Environment;
  status: ConnectionStatus;
  lastTestedAt: string | null;
  lastError: string | null;
  maskedCredentials: Record<string, string>;
  updatedAt: string;
}

export interface TestConnectionResponse {
  success: boolean;
  message: string;
  testedAt: string;
}

// ─── Provider display config ─────────────────────────────────

export interface ProviderConfig {
  provider: Provider;
  category: ProviderCategory;
  name: string;
  description: string;
  supportsEnvironment: boolean;
  environments?: Environment[];
  fields: FieldConfig[];
  notes?: string;
}

export interface FieldConfig {
  key: string;
  label: string;
  type: "text" | "password" | "number" | "select";
  placeholder: string;
  required: boolean;
  options?: { value: string; label: string }[];
  helpText?: string;
}

// ─── Provider configurations ─────────────────────────────────

export const PROVIDER_CONFIGS: ProviderConfig[] = [
  // ── Data ───────────────────────────────────────────────────
  {
    provider: "databento",
    category: "data",
    name: "Databento",
    description: "Real-time and historical market data for NQ/MNQ futures",
    supportsEnvironment: false,
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        placeholder: "db-...",
        required: true,
        helpText: "Generate at databento.com/portal/keys",
      },
    ],
  },

  // ── AI ─────────────────────────────────────────────────────
  {
    provider: "claude",
    category: "ai",
    name: "Claude API",
    description: "Institutional-grade AI analysis engine for signal generation",
    supportsEnvironment: false,
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        placeholder: "sk-ant-...",
        required: true,
        helpText: "Generate at console.anthropic.com",
      },
      {
        key: "model",
        label: "Model",
        type: "select",
        placeholder: "",
        required: false,
        options: [
          { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
          { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
          { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
        ],
      },
      {
        key: "maxTokens",
        label: "Max Tokens",
        type: "number",
        placeholder: "4096",
        required: false,
      },
    ],
  },

  // ── Execution ──────────────────────────────────────────────
  {
    provider: "tradovate",
    category: "execution",
    name: "Tradovate",
    description: "Broker for account data, positions, and order execution",
    supportsEnvironment: true,
    environments: ["demo", "production"],
    fields: [
      { key: "username", label: "Username", type: "text", placeholder: "your-username", required: true },
      { key: "password", label: "Password", type: "password", placeholder: "••••••••", required: true },
      { key: "appId", label: "App ID", type: "text", placeholder: "Optional", required: false },
      { key: "cid", label: "Client ID", type: "text", placeholder: "Optional", required: false },
      { key: "sec", label: "Client Secret", type: "password", placeholder: "Optional", required: false },
    ],
    notes: "REST auth + WebSocket for live data. Token auto-renewal supported.",
  },
  {
    provider: "rithmic",
    category: "execution",
    name: "Rithmic",
    description: "Low-latency execution via R | Protocol API",
    supportsEnvironment: true,
    environments: ["demo", "production"],
    fields: [
      { key: "username", label: "Username", type: "text", placeholder: "your-username", required: true },
      { key: "password", label: "Password", type: "password", placeholder: "••••••••", required: true },
      { key: "server", label: "Server Name", type: "text", placeholder: "e.g. Rithmic Paper Trading", required: false, helpText: "Server/system for connection routing" },
      { key: "gateway", label: "Gateway", type: "text", placeholder: "e.g. chicago", required: false, helpText: "Gateway region for order routing" },
      { key: "systemName", label: "System Name", type: "text", placeholder: "e.g. Rithmic01", required: false },
      { key: "appName", label: "App Name", type: "text", placeholder: "TradingFutures", required: false },
      { key: "appVersion", label: "App Version", type: "text", placeholder: "1.0.0", required: false },
    ],
    notes: "Requires entitlements. Session management and heartbeat handled internally.",
  },
  {
    provider: "ninjatrader",
    category: "execution",
    name: "NinjaTrader",
    description: "Execution via NinjaTrader external API or bridge",
    supportsEnvironment: true,
    environments: ["demo", "production"],
    fields: [
      { key: "mode", label: "Connection Mode", type: "select", placeholder: "", required: false, options: [
        { value: "crosstrade", label: "CrossTrade REST API" },
        { value: "custom_bridge", label: "Custom Bridge" },
      ], helpText: "CrossTrade: third-party NT8 REST add-on. Requires NinjaTrader 8 desktop running." },
      { key: "host", label: "Host", type: "text", placeholder: "localhost", required: false, helpText: "NinjaTrader machine address" },
      { key: "port", label: "Port", type: "number", placeholder: "36973", required: false, helpText: "ATI server port" },
      { key: "apiKey", label: "API Key", type: "password", placeholder: "Optional — for cloud API", required: false },
    ],
    notes: "Native API: connects to NinjaTrader ATI on localhost. Desktop Bridge: future local middleware option.",
  },
  {
    provider: "topstepx",
    category: "execution",
    name: "TopstepX / ProjectX",
    description: "Funded account execution via ProjectX API",
    supportsEnvironment: true,
    environments: ["demo", "production"],
    fields: [
      { key: "apiKey", label: "API Key", type: "password", placeholder: "Generated in ProjectX dashboard", required: true, helpText: "Generate at projectx.com/api-keys" },
      { key: "username", label: "Username / Email", type: "text", placeholder: "Optional — for account identification", required: false },
      { key: "accountId", label: "Account ID", type: "text", placeholder: "e.g. TSX-12345", required: false, helpText: "Specific funded account to trade" },
    ],
    notes: "OAuth-based auth. Token refresh handled automatically.",
  },
  {
    provider: "polymarket",
    category: "execution",
    name: "Polymarket",
    description: "Prediction markets trading via CLOB API on Polygon",
    supportsEnvironment: false,
    fields: [
      { key: "privateKey", label: "Wallet Private Key", type: "password", placeholder: "0x...", required: true, helpText: "Polygon wallet private key for signing orders. L2 API key derived automatically." },
      { key: "apiKey", label: "API Key (optional)", type: "password", placeholder: "Auto-derived if empty", required: false, helpText: "L2 API key — leave empty to auto-derive from private key" },
      { key: "apiSecret", label: "API Secret (optional)", type: "password", placeholder: "Auto-derived if empty", required: false },
      { key: "apiPassphrase", label: "API Passphrase (optional)", type: "password", placeholder: "Auto-derived if empty", required: false },
    ],
    notes: "Non-custodial. Orders signed with your wallet. USDC on Polygon.",
  },
];

// ─── Helpers ─────────────────────────────────────────────────

export function getProvidersByCategory(category: ProviderCategory): ProviderConfig[] {
  return PROVIDER_CONFIGS.filter((p) => p.category === category);
}

export const CATEGORY_LABELS: Record<ProviderCategory, string> = {
  data: "Market Data",
  ai: "AI Engine",
  execution: "Execution & Brokers",
};
