import OpenAI from "openai";

/**
 * AR-001O — the OpenAI integration is optional, and it is fail-closed.
 *
 * This module used to throw at import time when either variable was absent.
 * Because `index.ts` re-exports it and three api-server modules import that
 * barrel (`lib/aiCampaign.ts`, `routes/copilot.ts`, `routes/intakeAgent.ts`),
 * the throw ran while `app.ts` was still being evaluated — before
 * `app.listen()` was ever reached. An environment that never calls an
 * OpenAI-dependent feature, such as an isolated provider-inert staging
 * deployment, therefore could not start the core server at all.
 *
 * The correction keeps the failure, but moves it from module evaluation to the
 * moment the integration is genuinely used:
 *
 *   • importing this module constructs no client and reads no network;
 *   • `openai` is a lazy proxy that resolves the real client on first property
 *     access, so every existing call site keeps its exact contract;
 *   • an unconfigured — or partially configured — environment raises
 *     `OpenAiUnavailableError` at that access, which the api-server maps to a
 *     truthful 503. No request is issued and no output is fabricated;
 *   • nothing is ever substituted for the real provider.
 *
 * Partial configuration is deliberately treated as unavailable rather than
 * "try it and see": a base URL without a key (or the reverse) can only produce
 * a failed call against a possibly-wrong endpoint.
 *
 * Neither value is ever logged or placed in an error. `missing` carries the
 * *names* of the absent variables, never their contents.
 */

export const OPENAI_BASE_URL_ENV = "AI_INTEGRATIONS_OPENAI_BASE_URL";
export const OPENAI_API_KEY_ENV = "AI_INTEGRATIONS_OPENAI_API_KEY";

export const OPENAI_UNAVAILABLE_CODE = "OPENAI_INTEGRATION_UNAVAILABLE";

/** The only two variables this integration reads. */
export type OpenAiEnv = {
  AI_INTEGRATIONS_OPENAI_BASE_URL?: string | undefined;
  AI_INTEGRATIONS_OPENAI_API_KEY?: string | undefined;
};

/**
 * Raised when an OpenAI-dependent feature is invoked without configuration.
 * `missing` holds variable names only — never a secret value.
 */
export class OpenAiUnavailableError extends Error {
  readonly code = OPENAI_UNAVAILABLE_CODE;
  readonly statusCode = 503;
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(
      `The OpenAI integration is not configured; missing ${missing.join(" and ")}.`,
    );
    this.name = "OpenAiUnavailableError";
    this.missing = [...missing];
  }
}

/** Names of the variables that are absent or empty, in a stable order. */
export function missingOpenAiConfig(
  env: OpenAiEnv = process.env,
): readonly string[] {
  const missing: string[] = [];
  if (!env[OPENAI_BASE_URL_ENV]) missing.push(OPENAI_BASE_URL_ENV);
  if (!env[OPENAI_API_KEY_ENV]) missing.push(OPENAI_API_KEY_ENV);
  return missing;
}

/** True only when both variables are present and non-empty. */
export function isOpenAiConfigured(env: OpenAiEnv = process.env): boolean {
  return missingOpenAiConfig(env).length === 0;
}

/**
 * Cached on the exact configuration it was built from, so a changed
 * environment yields a new client instead of a stale one, and repeated calls
 * under one configuration construct exactly once.
 */
let cached: { baseURL: string; apiKey: string; client: OpenAI } | undefined;

/**
 * Resolve the real client, constructing it at most once per configuration.
 * Throws `OpenAiUnavailableError` when the integration is not configured.
 * Constructing an `OpenAI` instance performs no I/O.
 */
export function getOpenAiClient(env: OpenAiEnv = process.env): OpenAI {
  const missing = missingOpenAiConfig(env);
  if (missing.length > 0) {
    throw new OpenAiUnavailableError(missing);
  }

  const baseURL = env[OPENAI_BASE_URL_ENV] as string;
  const apiKey = env[OPENAI_API_KEY_ENV] as string;

  if (cached && cached.baseURL === baseURL && cached.apiKey === apiKey) {
    return cached.client;
  }

  const client = new OpenAI({ apiKey, baseURL });
  cached = { baseURL, apiKey, client };
  return client;
}

/**
 * The published client handle. Every existing call site — `openai.chat`,
 * `openai.images`, `openai.audio` — reaches the real client through this
 * proxy, which resolves it on first access and never earlier.
 */
export const openai: OpenAI = new Proxy({} as OpenAI, {
  get(_target, property) {
    const client = getOpenAiClient();
    const value = Reflect.get(client, property, client) as unknown;
    return typeof value === "function" ? value.bind(client) : value;
  },
  has(_target, property) {
    return Reflect.has(getOpenAiClient(), property);
  },
});
