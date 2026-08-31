// P9: the environment contract — one declarative registry of every
// variable the voice program owns, and a validator that answers "is this
// environment configured the way the operator thinks it is?" BEFORE
// anything relies on it.
//
// It changes no behavior: fail-closed loaders keep failing at their use
// sites exactly as before. This surfaces the two silent classes those
// loaders cannot: a flag set to something that does not enable it
// ("TRUE", "1", "yes" — only the exact string "true" ever enables), and a
// fail-closed config that will throw the moment its feature is touched.
//
// The registry is completeness-tested: every *_ENV_VAR constant declared
// under src/ must appear here, so a new variable cannot ship undocumented.

export type EnvKind = "flag" | "secret" | "config" | "identifier" | "core";

export interface EnvContractEntry {
  name: string;
  kind: EnvKind;
  phase: string;
  description: string;
}

export interface EnvFinding {
  name: string;
  level: "error" | "warning";
  message: string;
}

/** Exact-"true" gates. Anything else — including "TRUE", "1", "yes" — is OFF. */
const FLAGS: Array<[string, string, string]> = [
  ["VOICE_PUBLISH_ENABLED", "pre", "Backend publishing to the voice provider"],
  ["VOICE_SYNC_ENABLED", "pre", "Provider config sync"],
  ["VOICE_BROWSER_TEST_ENABLED", "pre", "Browser test-call session issuing"],
  ["VOICE_STAGING_CLEANUP_ENABLED", "pre", "Staging assistant cleanup CLI"],
  ["VOICE_WEBHOOK_ATTACH_ENABLED", "P2", "Attaching the server webhook block to provider payloads"],
  ["VAPI_WEBHOOK_ALLOW_BEARER", "P2", "Staging-only bearer bridge for webhook auth (production is HMAC-only)"],
  ["VOICE_RECONCILIATION_ENABLED", "P2/P7/P8", "Call-state reconciliation, metering backfill, and grace-expiry sweeps"],
  ["VOICE_TOOLS_ATTACH_ENABLED", "P3", "Attaching the tool catalog to provider payloads (requires the server attachment)"],
  ["CALENDAR_CONNECT_ENABLED", "P4", "Per-firm Google Calendar OAuth connect flow"],
  ["CALENDAR_WRITE_ENABLED", "P4", "Writing booked appointments into connected calendars"],
  ["VOICE_SMS_ENABLED", "P5", "Voice-side SMS sending (consent-gated outbox)"],
  ["VOICE_ALERTS_ENABLED", "P7", "Operator email alerts (critical issues)"],
  ["VOICE_DIGEST_ENABLED", "P7", "Daily per-firm digest emails"],
  ["STRIPE_BOOT_SYNC_ENABLED", "core", "Stripe webhook registration/backfill at boot"],
  ["PUBLIC_REGISTRATION_ENABLED", "R4", "Unauthenticated self-registration (POST /receptionist/auth/signup)"],
  ["PUBLIC_FORM_SUBMISSIONS_ENABLED", "R4", "Unauthenticated public lead forms (contact / discovery / landing-test submit)"],
  ["PUBLIC_ANALYTICS_WRITES_ENABLED", "R5", "Unauthenticated analytics/telemetry writes (POST /landing-test/view)"],
  ["AI_TOOLKIT_CHECKOUT_ENABLED", "R6", "Unauthenticated Stripe Checkout Session creation (POST /ai-toolkit/checkout)"],
  ["PUBLIC_SCHEDULING_REQUESTS_ENABLED", "R7", "Unauthenticated public booking requests (POST /public/schedule/:slug/requests)"],
  ["PASSWORD_RESET_REQUESTS_ENABLED", "R8", "Unauthenticated password-reset initiation (POST /receptionist/account/password-reset/request)"],
];

const SECRETS: Array<[string, string, string]> = [
  ["VAPI_API_KEY", "pre", "Vapi private key (server-only, never in a browser build)"],
  ["VAPI_WEBHOOK_SECRET", "P2", "HMAC secret for the Vapi webhook (also the publish server credential)"],
  ["VAPI_WEBHOOK_SECRET_PREVIOUS", "P2", "Rotation-overlap secret for the Vapi webhook"],
  ["CALENDAR_TOKEN_KEY", "P4", "32-byte base64 AES-256-GCM key for calendar token envelopes"],
  ["GOOGLE_OAUTH_CLIENT_ID", "P4", "Google OAuth client id"],
  ["GOOGLE_OAUTH_CLIENT_SECRET", "P4", "Google OAuth client secret"],
  ["VOICE_TWILIO_ACCOUNT_SID", "P5", "Voice Twilio SID (structurally refused if equal to the intake SID)"],
  ["VOICE_TWILIO_AUTH_TOKEN", "P5", "Voice Twilio token (structurally refused if equal to the intake token)"],
  ["RESEND_API_KEY", "P7", "Resend key for alerts/digest/account email"],
  ["VOICE_METRICS_TOKEN", "P7", "Bearer for /api/metricz (unset = endpoint does not exist)"],
  ["VOICE_BILLING_WEBHOOK_SECRET", "P8", "Stripe signature secret for the voice billing webhook (unset = 503)"],
  ["ADMIN_PASSWORD", "core", "Admin login (unset = admin login 503s)"],
];

const CONFIGS: Array<[string, string, string]> = [
  ["VOICE_ARTIFACT_POLICY", "pre", "Provider artifact capture: none | transcript_only | full — required for publish; only 'none' approved"],
  ["VOICE_RUNTIME_CATALOG_JSON", "pre", "Model/voice/transcriber catalog for publish"],
  ["VOICE_SERVER_URL", "P2", "Webhook URL sent to the provider when attachment is enabled"],
  ["VOICE_CALL_POLICY_JSON", "P6", "Call behavior: silence/max-duration/end/voicemail lines"],
  ["VOICE_USAGE_INCLUDED_MINUTES", "P7", "Flat included-minutes cap (metering-only when unset)"],
  ["VOICE_ALERTS_FROM", "P7", "Alert sender address"],
  ["VOICE_ALERTS_TO", "P7", "Operator alert inbox"],
  ["VOICE_PLAN_CATALOG_JSON", "P8", "Plan entitlement catalog"],
  ["VOICE_DEFAULT_PLAN_CODE", "P8", "Default plan for firms without a subscription"],
  ["VOICE_BILLING_GRACE_DAYS", "P8", "Dunning window (default 7, bounded 1-60)"],
  ["GOOGLE_OAUTH_REDIRECT_URI", "P4", "OAuth redirect (must be this API's /callback)"],
  ["CORS_ALLOWED_ORIGINS", "core", "Credentialed-origin allowlist — REQUIRED in production; startup fails without it"],
  ["VOICE_TWILIO_FROM_NUMBER", "P5", "Voice SMS from-number (structurally refused if equal to the intake number)"],
];

const IDENTIFIERS: Array<[string, string, string]> = [
  ["VOICE_SMS_OWNER_FIRM_ID", "P5", "Pre-inventory inbound-SMS tenant fallback (P6 inventory maps To→firm first)"],
  ["DATABASE_URL", "core", "Postgres connection (identify the environment before ANY migration; never print)"],
];

export function describeEnvContract(): EnvContractEntry[] {
  return [
    ...FLAGS.map(([name, phase, description]) => ({ name, kind: "flag" as const, phase, description })),
    ...SECRETS.map(([name, phase, description]) => ({ name, kind: "secret" as const, phase, description })),
    ...CONFIGS.map(([name, phase, description]) => ({ name, kind: "config" as const, phase, description })),
    ...IDENTIFIERS.map(([name, phase, description]) => ({ name, kind: "identifier" as const, phase, description })),
  ];
}

async function probe(
  findings: EnvFinding[],
  name: string,
  loader: () => Promise<unknown>,
): Promise<void> {
  try {
    await loader();
  } catch (err) {
    findings.push({
      name,
      level: "error",
      message: `fail-closed config would refuse at use time: ${err instanceof Error ? err.message : "invalid"}`,
    });
  }
}

/**
 * Validates the environment against the contract. Read-only; loaders are
 * probed in try/catch and lazily imported so this can run at boot without
 * side effects.
 */
export async function validateEnvContract(
  env: Record<string, string | undefined> = process.env,
): Promise<EnvFinding[]> {
  const findings: EnvFinding[] = [];

  for (const [name] of FLAGS) {
    const value = env[name];
    if (value !== undefined && value !== "true" && value !== "false" && value.trim().length > 0) {
      findings.push({
        name,
        level: "warning",
        message: `set to "${value}" — only the exact string "true" enables this; the current value leaves it OFF`,
      });
    }
  }

  // Absent-means-null loaders: probe unconditionally.
  await probe(findings, "VOICE_CALL_POLICY_JSON", async () => {
    const { loadVoiceCallPolicyFromEnv } = await import("./voicePublishing/callPolicyConfig.js");
    loadVoiceCallPolicyFromEnv(env);
  });
  await probe(findings, "VOICE_PLAN_CATALOG_JSON", async () => {
    const { loadVoicePlanCatalogFromEnv } = await import("./voiceBilling/entitlements.js");
    loadVoicePlanCatalogFromEnv(env);
  });
  await probe(findings, "VOICE_USAGE_INCLUDED_MINUTES", async () => {
    const { loadUsageCapMinutesFromEnv } = await import("./voiceUsage/usageService.js");
    loadUsageCapMinutesFromEnv(env);
  });
  await probe(findings, "VOICE_BILLING_GRACE_DAYS", async () => {
    const { loadGraceDaysFromEnv } = await import("./voiceBilling/subscriptionState.js");
    loadGraceDaysFromEnv(env);
  });
  await probe(findings, "VOICE_ALERTS_ENABLED", async () => {
    const { loadVoiceAlertConfigFromEnv } = await import("./voiceAlerts/alertTransport.js");
    loadVoiceAlertConfigFromEnv(env);
  });
  await probe(findings, "VOICE_SERVER_URL", async () => {
    const { loadVoiceServerConfigFromEnv } = await import("./voicePublishing/serverConfig.js");
    loadVoiceServerConfigFromEnv(env);
  });

  // Feature-owned configs: probe only when their owning flag is on —
  // absent config under an off flag is the intended default state.
  if (env["VOICE_SMS_ENABLED"] === "true") {
    await probe(findings, "VOICE_TWILIO_ACCOUNT_SID", async () => {
      const { loadVoiceSmsConfig } = await import("./voiceSms/smsCore.js");
      loadVoiceSmsConfig(env);
    });
  }
  if (env["VOICE_TOOLS_ATTACH_ENABLED"] === "true") {
    await probe(findings, "VOICE_TOOLS_ATTACH_ENABLED", async () => {
      const { loadVoiceServerConfigFromEnv } = await import("./voicePublishing/serverConfig.js");
      const { loadVoiceToolsConfigFromEnv } = await import("./voicePublishing/toolsConfig.js");
      // Both loaders read the PROVIDED env — the flag default is process.env.
      loadVoiceToolsConfigFromEnv(loadVoiceServerConfigFromEnv(env), env);
    });
  }

  return findings;
}

/** Boot helper: logs findings without changing startup behavior. */
export async function logEnvContractFindings(
  log: (level: "warn" | "error", message: string) => void,
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  try {
    const findings = await validateEnvContract(env);
    for (const finding of findings) {
      log(finding.level === "error" ? "error" : "warn", `[env contract] ${finding.name}: ${finding.message}`);
    }
    if (findings.length === 0) log("warn", "[env contract] clean — no misconfiguration findings");
  } catch {
    // The validator must never break boot.
  }
}
