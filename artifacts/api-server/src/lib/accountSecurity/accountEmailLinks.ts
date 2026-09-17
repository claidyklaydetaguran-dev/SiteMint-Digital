// One-click links for the account emails (verification, password reset).
//
// Why this exists: those emails used to carry only a raw code, and the reset
// page could only read a `?token=` it was never given — so a customer who
// asked for a reset received a string with nowhere to put it.
//
// The link is built from VOICE_DASHBOARD_BASE_URL, the same public origin the
// post-call email already uses for its call link (notificationOutbox.ts
// `dashboardCallUrl`). Unlike that link, these carry a single-use credential,
// so the rule is stricter and fails closed:
//
//   - unset, unparseable, or not https → NO link (the email keeps the code);
//   - a loopback or localhost host → NO link;
//   - never a relative link — a relative href in an email opens nothing.
//
// The raw code stays in the email either way, so a customer is never stranded
// by a missing or mangled link. Nothing here logs; callers must not log the
// returned text either, because it contains the token.
//
// No imports: this module is pure, so it can be exercised without a database.

export const DASHBOARD_BASE_URL_ENV_VAR = "VOICE_DASHBOARD_BASE_URL";

/** Where the helpdesk SPA is mounted on the public origin (its Vite BASE_PATH). */
export const DASHBOARD_MOUNT_PATH = "/ai-receptionist/dashboard";

/**
 * The dashboard routes that consume a token from `?token=`. These are
 * `ROUTES.verifyEmail`, `ROUTES.passwordResetComplete` and
 * `ROUTES.acceptInvitation` in artifacts/helpdesk/src/lib/routes.ts.
 */
export const ACCOUNT_LINK_PATHS = {
  verifyEmail: "/verify-email",
  passwordResetComplete: "/password-reset/complete",
  acceptInvitation: "/accept-invitation",
} as const;

export type AccountLinkKind = keyof typeof ACCOUNT_LINK_PATHS;

type Env = Record<string, string | undefined>;

/** The configured public https origin with no trailing slash, or null when it cannot safely carry a token. */
export function publicDashboardBase(env: Env = process.env): string | null {
  const raw = (env[DASHBOARD_BASE_URL_ENV_VAR] ?? "").trim().replace(/\/+$/, "");
  if (raw.length === 0) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null; // a relative or malformed value
  }
  if (url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") return null;
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    /^127\.\d+\.\d+\.\d+$/.test(host)
  ) {
    return null;
  }
  return raw;
}

/** An absolute dashboard link carrying the token, or null when no safe public base is configured. */
export function accountEmailLink(kind: AccountLinkKind, rawToken: string, env: Env = process.env): string | null {
  const base = publicDashboardBase(env);
  if (base === null) return null;
  return `${base}${DASHBOARD_MOUNT_PATH}${ACCOUNT_LINK_PATHS[kind]}?token=${encodeURIComponent(rawToken)}`;
}

/**
 * Body of the password-reset email. The "Your reset code (valid 30 minutes):"
 * line is kept verbatim — it is the fallback when there is no link.
 */
export function passwordResetEmailText(rawToken: string, env: Env = process.env): string {
  const link = accountEmailLink("passwordResetComplete", rawToken, env);
  return [
    "A password reset was requested for your account.",
    "",
    ...(link === null ? [] : ["Choose a new password here (the link works once, for 30 minutes):", link, ""]),
    `Your reset code (valid 30 minutes): ${rawToken}`,
    ...(link === null ? [] : ["If the link does not open, enter that code on the password reset page."]),
    "",
    "If you did not request this, you can ignore this email — nothing changes without the code.",
  ].join("\n");
}

/**
 * Body of a team invitation. The link opens the dashboard screen where the
 * invited person sets their own password; the code is the fallback.
 */
export function invitationEmailText(
  businessName: string | null,
  role: "owner" | "staff",
  rawToken: string,
  env: Env = process.env,
): string {
  const link = accountEmailLink("acceptInvitation", rawToken, env);
  const who = businessName ? `${businessName} invited you` : "You were invited";
  const access =
    role === "owner"
      ? "As an owner you can manage the receptionist, its phone number, calendar, team and billing."
      : "As staff you can see calls, messages, contacts and bookings, and handle them. Settings stay with the owners.";
  return [
    `${who} to its SiteMint AI Receptionist team.`,
    access,
    "",
    ...(link === null ? [] : ["Accept and choose your password here (the link works once, for 7 days):", link, ""]),
    `Your invitation code (valid 7 days): ${rawToken}`,
    ...(link === null ? [] : ["If the link does not open, enter that code on the invitation page of the dashboard."]),
    "",
    "If you were not expecting this, ignore this email — nothing happens without the code.",
  ].join("\n");
}

/**
 * Body of the email-verification email, shared by the plain "verify my
 * address" request and by an address change, so the two cannot drift.
 */
export function verificationEmailText(rawToken: string, env: Env = process.env): string {
  const link = accountEmailLink("verifyEmail", rawToken, env);
  return [
    "Confirm this address to secure your account.",
    "",
    ...(link === null ? [] : ["Confirm it here (the link works once, for 24 hours):", link, ""]),
    `Your verification code (valid 24 hours): ${rawToken}`,
  ].join("\n");
}
