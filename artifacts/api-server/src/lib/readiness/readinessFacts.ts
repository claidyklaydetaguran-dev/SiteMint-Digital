// Reads the facts `deriveReadiness` needs, for one business.
//
// Each fact is read on its own and fails on its own: an unreadable calendar
// must not hide a working phone number. A read that fails yields `null`
// ("Not checked"), never a guess.

import type { ReadinessFacts } from "./receptionistReadiness.js";

async function attempt<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch {
    return null;
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function loadReadinessFacts(firmId: number): Promise<ReadinessFacts> {
  const [profile, recipient, assistants, capabilities, calendar, calls, numbers, catalog] = await Promise.all([
    attempt(async () => (await import("../accountProfile/profileService.js")).readBusinessProfile(firmId)),
    attempt(async () => (await import("../voiceNotifications/recipient.js")).resolveVerifiedBusinessRecipient(firmId)),
    attempt(async () => (await import("../voiceAssistants/service.js")).voiceAssistantService.list(firmId)),
    attempt(async () => (await import("../voice/tools/firmCapabilities.js")).resolveEffectiveCapabilities(firmId)),
    attempt(async () => {
      const { findAnyConnection } = await import("../calendar/calendarConnectionsRepository.js");
      const { assessConnectionHealth } = await import("../calendar/connectionHealth.js");
      return assessConnectionHealth(await findAnyConnection(firmId));
    }),
    attempt(async () => (await import("../voice/webhooks/realCallsRepository.js")).listRealCallsForFirm(firmId)),
    attempt(async () => {
      const { db } = await import("@workspace/db");
      const { voiceNumbers } = await import("@workspace/db/schema/voice");
      const { eq } = await import("drizzle-orm");
      return db.select({ state: voiceNumbers.state }).from(voiceNumbers).where(eq(voiceNumbers.firmId, firmId));
    }),
    attempt(async () => (await import("../voicePublishing/runtimeCatalog.js")).loadRuntimeCatalogFromEnv()),
  ]);
  const [publishAvailable, access] = await Promise.all([
    attempt(async () => (await import("../voicePublishing/publishService.js")).isPublishConfigurationReady()),
    attempt(async () => (await import("../voiceBilling/serviceAccess.js")).resolveServiceAccess(firmId)),
  ]);
  const serviceAccess: ReadinessFacts["serviceAccess"] = access === null ? null : access.allowed ? "active" : access.reason;

  // The receptionist a business is working on: the most recently changed one.
  const latest = assistants?.items.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const config = (latest?.config ?? {}) as Record<string, unknown>;
  const prompt = (config.prompt ?? {}) as Record<string, unknown>;
  const voiceModel = (config.voiceModel ?? {}) as Record<string, unknown>;

  let voiceAvailable: boolean | null = null;
  if (assistants && !latest) voiceAvailable = false;
  else if (latest && catalog) {
    const preset = text(voiceModel.preset);
    const voice = voiceModel.voice;
    voiceAvailable =
      preset !== "" &&
      catalog.presets[preset] !== undefined &&
      (voice === undefined || voice === null || (typeof voice === "string" && catalog.voices[voice] !== undefined));
  }

  const greetingSet =
    assistants === null
      ? null
      : latest === undefined
        ? false
        : text(prompt.firstMessageMode) !== "assistant-speaks-first" || text(prompt.firstMessage) !== "";

  let booking: ReadinessFacts["booking"] = null;
  let bookingGap: ReadinessFacts["bookingGap"] = null;
  let transfer: ReadinessFacts["transfer"] = null;
  let platformDisabled: ReadinessFacts["platformDisabled"];
  if (capabilities) {
    platformDisabled = capabilities.reports
      .filter((r) => (r.key === "scheduling" || r.key === "transfer" || r.key === "messages") && r.state !== "active" && (r.reason === "platform_disabled" || r.reason === "not_authorized"))
      .map((r) => r.key as "scheduling" | "transfer" | "messages");
    const scheduling = capabilities.reports.find((r) => r.key === "scheduling");
    if (scheduling?.state === "active") booking = "on";
    else if (scheduling?.reason === "platform_disabled" || scheduling?.reason === "not_authorized") booking = "off";
    else if (capabilities.readiness.bookableAppointmentTypes < 1) booking = "off";
    else {
      booking = "partial";
      bookingGap =
        scheduling?.reason === "needs_opening_hours" ? "opening_hours" : scheduling?.reason === "needs_timezone" ? "timezone" : "appointment_type";
    }
    transfer = capabilities.reports.find((r) => r.key === "transfer")?.state === "active" ? "on" : "off";
  }

  const realCalls = calls?.filter((c) => !c.synthetic) ?? null;
  const completedOn = (channel: "browser" | "telephone") =>
    realCalls === null ? null : realCalls.some((c) => c.channel === channel && c.state === "completed");

  const phoneState: ReadinessFacts["phoneState"] =
    numbers === null
      ? null
      : numbers.some((n) => n.state === "assigned")
        ? "assigned"
        : numbers.some((n) => n.state === "paused")
          ? "paused"
          : "none";

  return {
    businessNamed: profile ? text(profile.name) !== "" : null,
    businessTradeSet: profile ? text(profile.industry) !== "" : null,
    timezoneSet: profile ? text(profile.timezone) !== "" : null,
    emailVerified: recipient ? recipient.ok : null,
    assistantExists: assistants ? latest !== undefined : null,
    greetingSet,
    voiceAvailable,
    assistantErrored: assistants ? latest?.status === "error" : null,
    booking,
    bookingGap,
    platformDisabled,
    publishAvailable,
    serviceAccess,
    calendarState: calendar ? calendar.state : null,
    transfer,
    published: assistants ? latest?.status === "published" : null,
    inSync: latest ? (latest.providerSyncState === "unknown" ? null : latest.providerSyncState === "synchronized") : assistants ? false : null,
    browserTestCompleted: completedOn("browser"),
    phoneState,
    liveCallCompleted: completedOn("telephone"),
  };
}
