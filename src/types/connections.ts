import { z } from "zod";

// ─── Provider types ──────────────────────────────────────────
export const PROVIDERS = ["databento", "tradovate", "claude"] as const;
export type Provider = (typeof PROVIDERS)[number];

export type Environment = "sandbox" | "production";
export type ConnectionStatus = "untested" | "connected" | "error";

// ─── Credential shapes per provider ─────────────────────────
export const databentoCredentialsSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
});

export const tradovateCredentialsSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  appId: z.string().optional().default(""),
  cid: z.string().optional().default(""),
  sec: z.string().optional().default(""),
});

export const claudeCredentialsSchema = z.object({
  apiKey: z.string().min(1, "API key is required"),
  model: z
    .string()
    .optional()
    .default("claude-sonnet-4-6"),
  maxTokens: z.coerce.number().min(100).max(32000).optional().default(4096),
});

export const credentialSchemas = {
  databento: databentoCredentialsSchema,
  tradovate: tradovateCredentialsSchema,
  claude: claudeCredentialsSchema,
} as const;

export type DatabentoCredentials = z.infer<typeof databentoCredentialsSchema>;
export type TradovateCredentials = z.infer<typeof tradovateCredentialsSchema>;
export type ClaudeCredentials = z.infer<typeof claudeCredentialsSchema>;
export type ProviderCredentials =
  | DatabentoCredentials
  | TradovateCredentials
  | ClaudeCredentials;

// ─── API request/response ────────────────────────────────────
export const updateConnectionSchema = z.object({
  provider: z.enum(PROVIDERS),
  isEnabled: z.boolean(),
  environment: z.enum(["sandbox", "production"]),
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
  // Credentials masked for frontend display
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
  name: string;
  description: string;
  supportsEnvironment: boolean;
  fields: FieldConfig[];
}

export interface FieldConfig {
  key: string;
  label: string;
  type: "text" | "password" | "number" | "select";
  placeholder: string;
  required: boolean;
  options?: { value: string; label: string }[];
}

export const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    provider: "databento",
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
      },
    ],
  },
  {
    provider: "tradovate",
    name: "Tradovate",
    description: "Broker connection for account data and order execution",
    supportsEnvironment: true,
    fields: [
      {
        key: "username",
        label: "Username",
        type: "text",
        placeholder: "your-username",
        required: true,
      },
      {
        key: "password",
        label: "Password",
        type: "password",
        placeholder: "••••••••",
        required: true,
      },
      {
        key: "appId",
        label: "App ID",
        type: "text",
        placeholder: "Optional",
        required: false,
      },
      {
        key: "cid",
        label: "Client ID",
        type: "text",
        placeholder: "Optional",
        required: false,
      },
      {
        key: "sec",
        label: "Client Secret",
        type: "password",
        placeholder: "Optional",
        required: false,
      },
    ],
  },
  {
    provider: "claude",
    name: "Claude API",
    description: "AI analysis engine for signal generation",
    supportsEnvironment: false,
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        placeholder: "sk-ant-...",
        required: true,
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
];
