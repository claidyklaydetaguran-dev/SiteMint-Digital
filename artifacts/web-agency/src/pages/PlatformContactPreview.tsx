import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ArrowRight, CheckCircle2, Mail, Phone } from "lucide-react";
import "@/styles/platform-preview.css";
import { usePlatformPreviewDocumentMeta } from "@/hooks/usePlatformPreviewDocumentMeta";
import { PlatformPreviewPageShell } from "@/components/platform-preview/PlatformPreviewPageShell";
import { InnerPageHero } from "@/components/platform-preview/InnerPageHero";
import { InnerPageAtmosphere } from "@/components/platform-preview/InnerPageAtmosphere";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { startProjectHref } from "@/components/platform-preview/navConfig";

const PREVIEW_TITLE = "Contact — SiteMint Platform Preview (Internal, Unpublished)";
const PREVIEW_DESCRIPTION = "Internal, unpublished preview of the SiteMint contact experience.";

/**
 * Wired to the real, mounted POST /api/contact/submit contract (verified in
 * artifacts/api-server/src/routes/contact.ts, validated server-side by
 * contactValidation.ts). Required/optional, whitespace handling, and max
 * lengths are now deliberately aligned with the backend, closing the gap
 * where this page previously required `message` but the server didn't
 * enforce it at all:
 *
 * - name, email, message: required, whitespace-only rejected server-side
 *   too (both sides `.trim()` before checking).
 * - businessType: optional on both sides.
 * - Max lengths (200 / 320 / 200 / 2000) match CONTACT_MAX_LENGTHS in
 *   contactValidation.ts exactly — those aren't invented either; they mirror
 *   @workspace/discovery-contract's real schemas.ts limits for the same
 *   field shapes (shortText(200) for name-like fields, z.email().max(320),
 *   the repeated max(2000) convention for long-text fields).
 * - message's 10-character client minimum is a client-only UX floor on top
 *   of the shared "non-empty" requirement — anything passing it already
 *   satisfies the backend's own (looser) non-empty check, so this doesn't
 *   create a client/server disagreement, just a friendlier minimum bar.
 * - `hp_field` is the honeypot key the server checks (contactProtection.ts)
 *   — always blank for a human, never rendered as a visible/labeled input.
 */
const CONTACT_MAX_LENGTHS = { name: 200, email: 320, businessType: 200, message: 2000 } as const;

const contactFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Please enter your name.")
    .max(CONTACT_MAX_LENGTHS.name, `Name must be ${CONTACT_MAX_LENGTHS.name} characters or fewer.`),
  email: z
    .string()
    .trim()
    .min(1, "Please enter your email address.")
    .max(CONTACT_MAX_LENGTHS.email, `Email must be ${CONTACT_MAX_LENGTHS.email} characters or fewer.`)
    .email("Enter a valid email address, like name@example.com."),
  businessType: z
    .string()
    .trim()
    .max(CONTACT_MAX_LENGTHS.businessType, `Organization must be ${CONTACT_MAX_LENGTHS.businessType} characters or fewer.`)
    .optional(),
  message: z
    .string()
    .trim()
    .min(10, "Tell us a little more — at least 10 characters.")
    .max(CONTACT_MAX_LENGTHS.message, `Message must be ${CONTACT_MAX_LENGTHS.message} characters or fewer.`),
  hp_field: z.string().optional(),
});

type ContactFormValues = z.infer<typeof contactFormSchema>;

type SubmitState = "idle" | "submitting" | "success" | "error";

function textOnDark(muted = false) {
  return { color: muted ? "hsl(var(--pp-text-on-dark-muted))" : "hsl(var(--pp-text-on-dark))" };
}
function textOnLight(muted = false) {
  return { color: muted ? "hsl(var(--pp-text))" : "hsl(var(--pp-navy-950))" };
}

const lightPanelShadow = "0 1px 2px hsl(var(--pp-navy-950) / 0.04), 0 10px 24px -14px hsl(var(--pp-navy-950) / 0.16)";

const warmSectionBackground: CSSProperties = {
  backgroundImage: "radial-gradient(circle at 10% -10%, hsl(var(--pp-mint-pale) / 0.45) 0%, transparent 55%)",
  backgroundColor: "hsl(var(--pp-white))",
};
const coolSectionBackground: CSSProperties = {
  backgroundImage: "radial-gradient(circle at 90% 0%, hsl(var(--pp-mint-pale) / 0.5) 0%, transparent 60%)",
  backgroundColor: "hsl(var(--pp-surface-soft))",
};

function LightPanel({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`rounded-[var(--sm-radius-lg)] border bg-white ${className}`}
      style={{ borderColor: "hsl(var(--pp-border-pale))", boxShadow: lightPanelShadow, ...style }}
    >
      {children}
    </div>
  );
}

const inputClassName =
  "border-[hsl(var(--pp-border-pale))] bg-white text-[hsl(var(--pp-navy-950))] transition-shadow focus-visible:ring-2 focus-visible:ring-[hsl(var(--pp-cyan-mint))] focus-visible:ring-offset-0 min-h-11";

/**
 * Maps a failed /api/contact/submit response to safe, customer-facing
 * copy. Never renders arbitrary backend/provider text: 400 and 429 already
 * return deliberately safe, pre-written messages server-side
 * (contact.ts/contactValidation.ts), so those are shown as-is; a 500 or any
 * response this client doesn't recognize (including a malformed/non-JSON
 * body) always falls back to a fixed generic retry message instead of
 * whatever the server happened to send — defense in depth even though
 * today's 500 handler is already static.
 */
async function mapErrorResponse(res: Response): Promise<{ message: string; fields?: Record<string, string> }> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const parsed = body && typeof body === "object" ? (body as { error?: unknown; fields?: unknown }) : {};
  const fields =
    parsed.fields && typeof parsed.fields === "object"
      ? Object.fromEntries(
          Object.entries(parsed.fields as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        )
      : undefined;

  if (res.status === 429) {
    return { message: typeof parsed.error === "string" ? parsed.error : "You're sending messages too quickly. Please wait a bit and try again." };
  }
  if (res.status === 400) {
    return { message: typeof parsed.error === "string" ? parsed.error : "Please fix the errors below and try again.", fields };
  }
  return { message: "Something went wrong on our end. Please try again." };
}

const fieldLabels: Record<keyof ContactFormValues, string> = {
  name: "Your name",
  email: "Email address",
  businessType: "Organization or business type",
  message: "How can we help?",
  hp_field: "",
};

export default function PlatformContactPreview() {
  usePlatformPreviewDocumentMeta(PREVIEW_TITLE, PREVIEW_DESCRIPTION);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [serverErrorMessage, setServerErrorMessage] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  const serverErrorRef = useRef<HTMLDivElement>(null);

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: { name: "", email: "", businessType: "", message: "", hp_field: "" },
  });

  useEffect(() => {
    if (submitState === "success") successHeadingRef.current?.focus();
    if (submitState === "error") serverErrorRef.current?.focus();
  }, [submitState]);

  // No manual focus handling needed here: react-hook-form's default
  // shouldFocusError already moves focus to the first invalid field (a
  // standard accessible pattern on its own), and the error summary below
  // is a role="alert" live region — screen readers announce it as soon as
  // it appears, independent of where focus lands.

  async function onSubmit(values: ContactFormValues) {
    if (submittingRef.current) return; // duplicate-submit guard, not rate limiting
    submittingRef.current = true;
    setSubmitState("submitting");
    setServerErrorMessage(null);

    try {
      const res = await fetch("/api/contact/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          email: values.email,
          businessType: values.businessType || undefined,
          message: values.message,
          hp_field: values.hp_field,
        }),
      });

      if (res.ok) {
        setSubmitState("success");
        form.reset();
      } else {
        const { message, fields } = await mapErrorResponse(res);
        if (fields) {
          for (const [key, fieldMessage] of Object.entries(fields)) {
            if (key === "name" || key === "email" || key === "businessType" || key === "message") {
              form.setError(key, { type: "server", message: fieldMessage });
            }
          }
        }
        setServerErrorMessage(message);
        setSubmitState("error");
      }
    } catch {
      setServerErrorMessage("We couldn't reach the server. Check your connection and try again.");
      setSubmitState("error");
    } finally {
      submittingRef.current = false;
    }
  }

  const errorEntries = Object.entries(form.formState.errors).filter(([key]) => key !== "hp_field") as [
    keyof ContactFormValues,
    { message?: string },
  ][];

  return (
    <PlatformPreviewPageShell footerVariant="dark">
      {/* Hero — dark */}
      <InnerPageHero
        eyebrow="Contact"
        headingId="pp-contact-page-heading"
        heading="Tell us what you're trying to build — or what isn't working yet."
        intro="Whether you already have a scoped project or just know something isn't working, a real person on the SiteMint team reads every message."
      >
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="#pp-contact-form-heading" className="pp-btn pp-btn-primary rounded-[var(--sm-radius-pill)] px-6 py-3 text-sm font-semibold">
            Send a message
          </a>
          <Link href={startProjectHref} className="pp-btn pp-btn-secondary rounded-[var(--sm-radius-pill)] px-6 py-3 text-sm font-semibold">
            Start a Project instead
          </Link>
        </div>
      </InnerPageHero>

      {/* Inquiry-path orientation — light, bridges from the dark hero */}
      <section aria-labelledby="pp-contact-orientation-heading" className="px-4 py-14 md:px-8 md:py-16" style={warmSectionBackground}>
        <div className="mx-auto max-w-[1280px]">
          <h2 id="pp-contact-orientation-heading" className="sr-only">
            Ways to reach SiteMint
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <LightPanel className="p-5">
              <p className="text-sm font-semibold" style={textOnLight()}>
                Not sure where to start?
              </p>
              <p className="mt-1.5 text-sm leading-relaxed" style={textOnLight(true)}>
                Send a general message below — no need to have it all figured out first.
              </p>
            </LightPanel>
            <LightPanel className="p-5">
              <p className="text-sm font-semibold" style={textOnLight()}>
                Already know the project?
              </p>
              <p className="mt-1.5 text-sm leading-relaxed" style={textOnLight(true)}>
                <Link href={startProjectHref} className="font-semibold underline" style={{ color: "hsl(var(--pp-cyan-mint-deep))" }}>
                  Start a Project
                </Link>{" "}
                walks through it step by step.
              </p>
            </LightPanel>
            <LightPanel className="p-5">
              <p className="text-sm font-semibold" style={textOnLight()}>
                Prefer email or phone?
              </p>
              <p className="mt-1.5 text-sm leading-relaxed" style={textOnLight(true)}>
                Verified direct contact details are on this page, below the form.
              </p>
            </LightPanel>
          </div>
        </div>
      </section>

      {/* Contact form (primary object) + sidebar — light/warm */}
      <section aria-labelledby="pp-contact-form-heading" className="px-4 pb-16 md:px-8 md:pb-24" style={warmSectionBackground}>
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          {/* Form */}
          <LightPanel className="p-6 sm:p-8">
            <h2 id="pp-contact-form-heading" className="pp-font-display text-xl font-semibold sm:text-2xl" style={textOnLight()}>
              Send a message
            </h2>
            <p className="mt-2 text-sm leading-relaxed" style={textOnLight(true)}>
              Required fields are marked. Everything else is optional.
            </p>

            {submitState === "success" ? (
              <div role="status" aria-live="polite" className="pp-reveal flex flex-col items-center py-10 text-center">
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-full"
                  style={{ backgroundColor: "hsl(var(--pp-mint-pale))" }}
                >
                  <CheckCircle2 size={28} aria-hidden="true" style={{ color: "hsl(var(--pp-cyan-mint-deep))" }} />
                </span>
                <h3
                  ref={successHeadingRef}
                  tabIndex={-1}
                  className="pp-font-display mt-4 text-xl font-semibold outline-none"
                  style={textOnLight()}
                >
                  Message sent
                </h3>
                <p className="mt-2 max-w-sm text-sm leading-relaxed" style={textOnLight(true)}>
                  Your message reached the SiteMint team. SiteMint typically responds within one business day.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-6"
                  onClick={() => setSubmitState("idle")}
                >
                  Send another message
                </Button>
              </div>
            ) : (
              <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="mt-6 flex flex-col gap-5">
                {errorEntries.length > 0 && (
                  <div
                    role="alert"
                    className="rounded-[var(--sm-radius-md)] border p-4"
                    style={{ borderColor: "hsl(4 74% 42% / 0.4)", backgroundColor: "hsl(0 85% 97%)" }}
                  >
                    <p className="text-sm font-semibold" style={{ color: "hsl(4 74% 42%)" }}>
                      Please fix the following before sending:
                    </p>
                    <ul className="mt-2 flex flex-col gap-1">
                      {errorEntries.map(([key, err]) => (
                        <li key={key}>
                          <a href={`#pp-contact-${key}`} className="text-sm underline" style={{ color: "hsl(4 74% 42%)" }}>
                            {fieldLabels[key]}: {err.message}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {submitState === "error" && (
                  <div
                    ref={serverErrorRef}
                    role="alert"
                    tabIndex={-1}
                    className="rounded-[var(--sm-radius-md)] border p-4 outline-none"
                    style={{ borderColor: "hsl(4 74% 42% / 0.4)", backgroundColor: "hsl(0 85% 97%)" }}
                  >
                    <p className="text-sm font-semibold" style={{ color: "hsl(4 74% 42%)" }}>
                      {serverErrorMessage}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: "hsl(4 74% 42%)" }}>
                      Nothing you entered was lost — you can try sending again.
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pp-contact-name">
                    Your name <span aria-hidden="true" style={{ color: "hsl(var(--pp-cyan-mint-deep))" }}>*</span>
                  </Label>
                  <Input
                    id="pp-contact-name"
                    autoComplete="name"
                    className={inputClassName}
                    aria-required="true"
                    aria-invalid={!!form.formState.errors.name}
                    aria-describedby={form.formState.errors.name ? "pp-contact-name-error" : undefined}
                    {...form.register("name")}
                  />
                  {form.formState.errors.name && (
                    <p id="pp-contact-name-error" className="text-xs" style={{ color: "hsl(4 74% 42%)" }}>
                      {form.formState.errors.name.message}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pp-contact-email">
                    Email address <span aria-hidden="true" style={{ color: "hsl(var(--pp-cyan-mint-deep))" }}>*</span>
                  </Label>
                  <Input
                    id="pp-contact-email"
                    type="email"
                    autoComplete="email"
                    className={inputClassName}
                    aria-required="true"
                    aria-invalid={!!form.formState.errors.email}
                    aria-describedby={form.formState.errors.email ? "pp-contact-email-error" : undefined}
                    {...form.register("email")}
                  />
                  {form.formState.errors.email && (
                    <p id="pp-contact-email-error" className="text-xs" style={{ color: "hsl(4 74% 42%)" }}>
                      {form.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pp-contact-businessType">Organization or business type (optional)</Label>
                  <Input
                    id="pp-contact-businessType"
                    autoComplete="organization"
                    className={inputClassName}
                    aria-invalid={!!form.formState.errors.businessType}
                    {...form.register("businessType")}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pp-contact-message">
                    How can we help? <span aria-hidden="true" style={{ color: "hsl(var(--pp-cyan-mint-deep))" }}>*</span>
                  </Label>
                  <Textarea
                    id="pp-contact-message"
                    rows={5}
                    className={inputClassName}
                    aria-required="true"
                    aria-invalid={!!form.formState.errors.message}
                    aria-describedby={form.formState.errors.message ? "pp-contact-message-error" : "pp-contact-message-hint"}
                    {...form.register("message")}
                  />
                  {form.formState.errors.message && (
                    <p id="pp-contact-message-error" className="text-xs" style={{ color: "hsl(4 74% 42%)" }}>
                      {form.formState.errors.message.message}
                    </p>
                  )}
                  <div id="pp-contact-message-hint" className="mt-1 rounded-[var(--sm-radius-md)] p-3" style={{ backgroundColor: "hsl(var(--pp-surface-soft))" }}>
                    <p className="text-xs font-medium" style={textOnLight(true)}>
                      A useful message usually covers, if you have it:
                    </p>
                    <ul className="mt-1.5 flex flex-col gap-0.5 text-xs" style={textOnLight(true)}>
                      <li>What you're trying to accomplish</li>
                      <li>What isn't working today, if anything</li>
                      <li>Whether there's an existing website or system</li>
                      <li>Rough timing, if you have any</li>
                    </ul>
                  </div>
                </div>

                {/* Honeypot — never visible, never focusable, never announced.
                    A populated value means a bot, not a person; the server
                    (contactProtection.ts) rejects it independently of this
                    UI, so this is defense-in-depth, not the actual check. */}
                <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
                  <label htmlFor="pp-contact-hp">Leave this field blank</label>
                  <input id="pp-contact-hp" type="text" tabIndex={-1} autoComplete="off" {...form.register("hp_field")} />
                </div>

                <div>
                  <Button
                    type="submit"
                    disabled={submitState === "submitting"}
                    aria-disabled={submitState === "submitting"}
                    className="pp-btn pp-btn-primary w-fit"
                  >
                    {submitState === "submitting" ? "Sending…" : "Send message"}
                  </Button>
                </div>
              </form>
            )}
          </LightPanel>

          {/* Sidebar: verified direct contact + what happens next */}
          <div className="flex flex-col gap-6">
            <LightPanel className="p-6">
              <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--pp-cyan-mint-deep))" }}>
                Direct contact
              </p>
              <div className="mt-4 flex flex-col gap-3">
                <a
                  href="mailto:info.sitemint@gmail.com"
                  className="flex items-center gap-3 rounded-[var(--sm-radius-md)] border p-3 transition-colors hover:border-[hsl(var(--pp-cyan-mint-deep))]"
                  style={{ borderColor: "hsl(var(--pp-border-pale))" }}
                >
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--sm-radius-pill)]"
                    style={{ backgroundColor: "hsl(var(--pp-mint-pale))", color: "hsl(var(--pp-cyan-mint-deep))" }}
                  >
                    <Mail size={16} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium" style={textOnLight()}>
                      Email
                    </span>
                    <span className="block truncate text-sm" style={textOnLight(true)}>
                      info.sitemint@gmail.com
                    </span>
                  </span>
                </a>
                <a
                  href="tel:+19498806515"
                  aria-label="Call SiteMint at 949-880-6515"
                  className="flex items-center gap-3 rounded-[var(--sm-radius-md)] border p-3 transition-colors hover:border-[hsl(var(--pp-cyan-mint-deep))]"
                  style={{ borderColor: "hsl(var(--pp-border-pale))" }}
                >
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--sm-radius-pill)]"
                    style={{ backgroundColor: "hsl(var(--pp-mint-pale))", color: "hsl(var(--pp-cyan-mint-deep))" }}
                  >
                    <Phone size={16} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium" style={textOnLight()}>
                      Phone
                    </span>
                    <span className="block text-sm" style={textOnLight(true)}>
                      949-880-6515
                    </span>
                  </span>
                </a>
              </div>
              <p className="mt-4 text-xs leading-relaxed" style={textOnLight(true)}>
                SiteMint typically responds within one business day.
              </p>
            </LightPanel>

            <LightPanel className="p-6" style={coolSectionBackground}>
              <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: "hsl(var(--pp-cyan-mint-deep))" }}>
                What happens next
              </p>
              <ol className="mt-4 flex flex-col gap-3">
                {[
                  "SiteMint reviews your message.",
                  "A team member follows up, typically within one business day.",
                  "If it's a project, scope and pricing are confirmed together — never assumed up front.",
                ].map((step, i) => (
                  <li key={step} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--sm-radius-pill)] text-[11px] font-semibold"
                      style={{ backgroundColor: "hsl(var(--pp-mint-pale))", color: "hsl(var(--pp-cyan-mint-deep))" }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-sm leading-relaxed" style={textOnLight(true)}>
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
            </LightPanel>
          </div>
        </div>
      </section>

      {/* Final routing option — one dark panel, distinct copy from the shared FinalCtaSection */}
      <section aria-labelledby="pp-contact-final-heading" className="relative px-4 pb-20 md:px-8 md:pb-28">
        <div
          className="relative mx-auto max-w-3xl overflow-hidden rounded-[var(--sm-radius-xl)] px-8 py-12 text-center shadow-[var(--sm-shadow-lg)] md:px-16 md:py-16"
          style={{ backgroundColor: "hsl(var(--pp-navy-950))" }}
        >
          <InnerPageAtmosphere intensity="transition" />
          <h2 id="pp-contact-final-heading" className="pp-font-display relative text-2xl font-semibold sm:text-3xl" style={textOnDark()}>
            Ready to send that message — or already scoped?
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-sm leading-relaxed sm:text-base" style={textOnDark(true)}>
            Send a general message above, or go straight to the guided project walkthrough.
          </p>
          <div className="relative mt-7 flex flex-wrap items-center justify-center gap-3">
            <a href="#pp-contact-form-heading" className="pp-btn pp-btn-primary rounded-[var(--sm-radius-pill)] px-6 py-3 text-sm font-semibold">
              Send a message
            </a>
            <Link
              href={startProjectHref}
              className="inline-flex items-center gap-2 rounded-[var(--sm-radius-pill)] px-6 py-3 text-sm font-semibold"
              style={{ border: "1px solid hsl(var(--pp-cyan-mint) / 0.4)", color: "hsl(var(--pp-text-on-dark))" }}
            >
              Start a Project
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </PlatformPreviewPageShell>
  );
}
