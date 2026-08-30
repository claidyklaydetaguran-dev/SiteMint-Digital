/**
 * AR-001O — the OpenAI integration is optional and fail-closed.
 *
 * Run via: pnpm --filter @workspace/api-server run test
 *
 * The defect: `lib/integrations-openai-ai-server/src/client.ts` threw while it
 * was being imported when either variable was absent. Three api-server modules
 * import that barrel, so the throw happened during `app.ts` evaluation and the
 * core server could never reach `app.listen()` — even for a deployment that
 * never calls an OpenAI-dependent feature.
 *
 * The integration package resolves `openai` from its own `node_modules` under
 * pnpm, so a `vi.mock("openai")` placed here would not intercept it. Laziness
 * is therefore proved by observable behaviour rather than a spy: importing with
 * the variables cleared succeeds (it used to throw), touching the handle then
 * raises the typed error, and `getOpenAiClient` returns one cached instance per
 * configuration. No network is reachable from this file — `fetch` is stubbed
 * and asserted unused, and no assertion performs a request.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Synthetic values, used only inside this file.
const FAKE_KEY = "sk-test-only-not-a-real-key-4b19";
const FAKE_URL = "https://openai.invalid/v1";

const BASE_URL_VAR = "AI_INTEGRATIONS_OPENAI_BASE_URL";
const API_KEY_VAR = "AI_INTEGRATIONS_OPENAI_API_KEY";

let savedBaseUrl: string | undefined;
let savedApiKey: string | undefined;
let fetchSpy: ReturnType<typeof vi.fn>;

function clearOpenAiEnv(): void {
  delete process.env[BASE_URL_VAR];
  delete process.env[API_KEY_VAR];
}

function configureOpenAiEnv(): void {
  process.env[BASE_URL_VAR] = FAKE_URL;
  process.env[API_KEY_VAR] = FAKE_KEY;
}

beforeEach(() => {
  savedBaseUrl = process.env[BASE_URL_VAR];
  savedApiKey = process.env[API_KEY_VAR];
  fetchSpy = vi.fn(() => {
    throw new Error("No network request may be made from this test.");
  });
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  if (savedBaseUrl === undefined) delete process.env[BASE_URL_VAR];
  else process.env[BASE_URL_VAR] = savedBaseUrl;
  if (savedApiKey === undefined) delete process.env[API_KEY_VAR];
  else process.env[API_KEY_VAR] = savedApiKey;
  vi.unstubAllGlobals();
});

describe("importing the integration without configuration", () => {
  it("resolves with neither variable set, and calls no network", async () => {
    clearOpenAiEnv();
    vi.resetModules();

    const module = await import("@workspace/integrations-openai-ai-server");

    expect(module.openai).toBeDefined();
    expect(module.isOpenAiConfigured()).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("resolves with only the base URL set", async () => {
    clearOpenAiEnv();
    process.env[BASE_URL_VAR] = FAKE_URL;
    vi.resetModules();

    await expect(
      import("@workspace/integrations-openai-ai-server"),
    ).resolves.toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("resolves with only the API key set", async () => {
    clearOpenAiEnv();
    process.env[API_KEY_VAR] = FAKE_KEY;
    vi.resetModules();

    await expect(
      import("@workspace/integrations-openai-ai-server"),
    ).resolves.toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("configuration reporting", () => {
  it("names both variables when neither is set", async () => {
    const { missingOpenAiConfig, isOpenAiConfigured } = await import(
      "@workspace/integrations-openai-ai-server"
    );
    expect(missingOpenAiConfig({})).toEqual([BASE_URL_VAR, API_KEY_VAR]);
    expect(isOpenAiConfigured({})).toBe(false);
  });

  it("treats partial configuration as unavailable", async () => {
    const { missingOpenAiConfig, isOpenAiConfigured } = await import(
      "@workspace/integrations-openai-ai-server"
    );
    expect(isOpenAiConfigured({ [BASE_URL_VAR]: FAKE_URL })).toBe(false);
    expect(missingOpenAiConfig({ [BASE_URL_VAR]: FAKE_URL })).toEqual([API_KEY_VAR]);

    expect(isOpenAiConfigured({ [API_KEY_VAR]: FAKE_KEY })).toBe(false);
    expect(missingOpenAiConfig({ [API_KEY_VAR]: FAKE_KEY })).toEqual([BASE_URL_VAR]);
  });

  it("treats an empty string as absent", async () => {
    const { isOpenAiConfigured } = await import(
      "@workspace/integrations-openai-ai-server"
    );
    expect(
      isOpenAiConfigured({ [BASE_URL_VAR]: "", [API_KEY_VAR]: FAKE_KEY }),
    ).toBe(false);
  });

  it("reports configured only when both are present", async () => {
    const { isOpenAiConfigured } = await import(
      "@workspace/integrations-openai-ai-server"
    );
    expect(
      isOpenAiConfigured({ [BASE_URL_VAR]: FAKE_URL, [API_KEY_VAR]: FAKE_KEY }),
    ).toBe(true);
  });
});

describe("invoking an OpenAI-dependent feature", () => {
  it("raises the typed unavailable error and issues no request when unconfigured", async () => {
    clearOpenAiEnv();
    const { openai, OpenAiUnavailableError } = await import(
      "@workspace/integrations-openai-ai-server"
    );

    expect(() => openai.chat).toThrowError(OpenAiUnavailableError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("raises the typed unavailable error under partial configuration", async () => {
    clearOpenAiEnv();
    process.env[BASE_URL_VAR] = FAKE_URL;
    const { openai, OpenAiUnavailableError } = await import(
      "@workspace/integrations-openai-ai-server"
    );

    let caught: unknown;
    try {
      void openai.chat;
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(OpenAiUnavailableError);
    expect((caught as InstanceType<typeof OpenAiUnavailableError>).missing).toEqual([
      API_KEY_VAR,
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("carries a 503 status and a stable code", async () => {
    const { OpenAiUnavailableError, OPENAI_UNAVAILABLE_CODE } = await import(
      "@workspace/integrations-openai-ai-server"
    );
    const error = new OpenAiUnavailableError([BASE_URL_VAR, API_KEY_VAR]);
    expect(error.statusCode).toBe(503);
    expect(error.code).toBe(OPENAI_UNAVAILABLE_CODE);
    expect(error.name).toBe("OpenAiUnavailableError");
  });
});

describe("constructing the client", () => {
  it("constructs nothing until the integration is genuinely used", async () => {
    clearOpenAiEnv();
    const { openai, getOpenAiClient, OpenAiUnavailableError } = await import(
      "@workspace/integrations-openai-ai-server"
    );

    // Importing resolved no client: the very first touch is what fails.
    expect(() => openai.chat).toThrowError(OpenAiUnavailableError);
    expect(() => getOpenAiClient()).toThrowError(OpenAiUnavailableError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("caches one client per configuration and rebuilds when it changes", async () => {
    const { getOpenAiClient } = await import(
      "@workspace/integrations-openai-ai-server"
    );

    const configured = { [BASE_URL_VAR]: FAKE_URL, [API_KEY_VAR]: FAKE_KEY };
    const first = getOpenAiClient(configured);
    const second = getOpenAiClient(configured);
    expect(second).toBe(first);

    const rotated = getOpenAiClient({ ...configured, [API_KEY_VAR]: `${FAKE_KEY}-2` });
    expect(rotated).not.toBe(first);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("preserves the existing call contract when configured", async () => {
    configureOpenAiEnv();
    const { openai, getOpenAiClient } = await import(
      "@workspace/integrations-openai-ai-server"
    );

    // The handle resolves to the same cached client the accessor returns, and
    // the call surface every existing site uses is intact. No request is made.
    expect(openai.baseURL).toBe(FAKE_URL);
    expect(openai.baseURL).toBe(getOpenAiClient().baseURL);
    expect(typeof openai.chat.completions.create).toBe("function");
    expect(typeof openai.images.generate).toBe("function");
    expect(typeof openai.audio.transcriptions.create).toBe("function");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("the unavailable response", () => {
  it("answers 503 with the exact body and never leaks a value", async () => {
    const { openAiUnavailableErrorHandler, OPENAI_UNAVAILABLE_BODY } =
      await import("./openAiUnavailable.js");
    const { OpenAiUnavailableError } = await import(
      "@workspace/integrations-openai-ai-server"
    );

    const logged: unknown[] = [];
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const next = vi.fn();
    const res = { headersSent: false, status, json } as never;
    const req = {
      log: { error: (payload: unknown) => void logged.push(payload) },
    } as never;

    openAiUnavailableErrorHandler(
      new OpenAiUnavailableError([BASE_URL_VAR, API_KEY_VAR]),
      req,
      res,
      next,
    );

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith(OPENAI_UNAVAILABLE_BODY);
    expect(next).not.toHaveBeenCalled();

    const serialised = JSON.stringify({ body: OPENAI_UNAVAILABLE_BODY, logged });
    expect(serialised).not.toContain(FAKE_KEY);
    expect(serialised).not.toContain(FAKE_URL);
    expect(serialised).toContain(BASE_URL_VAR);
  });

  it("delegates errors that are not the unavailable error", async () => {
    const { openAiUnavailableErrorHandler } = await import("./openAiUnavailable.js");
    const next = vi.fn();
    const status = vi.fn().mockReturnThis();
    const other = new Error("something else");

    openAiUnavailableErrorHandler(
      other,
      { log: { error: () => {} } } as never,
      { headersSent: false, status, json: vi.fn() } as never,
      next,
    );

    expect(next).toHaveBeenCalledWith(other);
    expect(status).not.toHaveBeenCalled();
  });

  it("delegates rather than rewriting a response whose headers are already sent", async () => {
    const { openAiUnavailableErrorHandler } = await import("./openAiUnavailable.js");
    const { OpenAiUnavailableError } = await import(
      "@workspace/integrations-openai-ai-server"
    );
    const next = vi.fn();
    const status = vi.fn().mockReturnThis();

    openAiUnavailableErrorHandler(
      new OpenAiUnavailableError([API_KEY_VAR]),
      { log: { error: () => {} } } as never,
      { headersSent: true, status, json: vi.fn() } as never,
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });
});

describe("wiring", () => {
  const here = dirname(fileURLToPath(import.meta.url));

  it("registers the handler once, after the router", () => {
    const app = readFileSync(join(here, "..", "app.ts"), "utf8");
    const routerAt = app.indexOf('app.use("/api", router)');
    const handlerAt = app.indexOf("openAiUnavailableErrorHandler)");

    expect(routerAt).toBeGreaterThan(-1);
    expect(handlerAt).toBeGreaterThan(routerAt);
  });

  it("keeps every integration client free of import-time guards", () => {
    const packageSrc = join(
      here,
      "..",
      "..",
      "..",
      "..",
      "lib",
      "integrations-openai-ai-server",
      "src",
    );

    for (const rel of [
      ["client.ts"],
      ["image", "client.ts"],
      ["audio", "client.ts"],
    ]) {
      const source = readFileSync(join(packageSrc, ...rel), "utf8");
      // The exact shapes that used to run during module evaluation.
      expect(source).not.toMatch(/^if \(!process\.env\.AI_INTEGRATIONS/m);
      expect(source).not.toMatch(/^export const openai = new OpenAI\(/m);
    }
  });
});
