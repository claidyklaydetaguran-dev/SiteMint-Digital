import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { CheckCircle2, Mail } from "lucide-react";
import "@/styles/platform-preview.css";
import { usePlatformPreviewDocumentMeta } from "@/hooks/usePlatformPreviewDocumentMeta";
import { PlatformPreviewPageShell } from "@/components/platform-preview/PlatformPreviewPageShell";
import { PreviewPageHeader } from "@/components/platform-preview/PreviewPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const PREVIEW_TITLE = "Contact — SiteMint Platform Preview (Internal, Unpublished)";
const PREVIEW_DESCRIPTION = "Internal, unpublished preview of a SiteMint contact experience. Preview form data is never sent or saved.";

/**
 * Contact-form schema — a plain name/email/message-shaped object, separate
 * in kind from @workspace/discovery-contract's DiscoverySubmissionContract
 * (which validates the full multi-step project-discovery draft). This is
 * not a second Discovery schema; it's this page's own small local
 * validation, the same relationship production Contact.tsx already has to
 * its own contact form today.
 */
const contactFormSchema = z.object({
  name: z.string().min(2, "Please enter your name."),
  email: z.string().email("Please enter a valid email address."),
  businessType: z.string().min(2, "Let us know what kind of business this is for."),
  message: z.string().min(10, "Tell us a little more — at least 10 characters."),
});

type ContactFormValues = z.infer<typeof contactFormSchema>;

const inputClassName =
  "border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-default))] text-[hsl(var(--sm-color-text-primary))] transition-shadow focus-visible:ring-2 focus-visible:ring-[hsl(var(--sm-mint-500))] focus-visible:ring-offset-0";

export default function PlatformContactPreview() {
  usePlatformPreviewDocumentMeta(PREVIEW_TITLE, PREVIEW_DESCRIPTION);
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: { name: "", email: "", businessType: "", message: "" },
  });

  // Preview-only: no fetch, no API call, no persistence. Client-side
  // validation runs via zodResolver above; this handler only flips local
  // state once validation passes.
  function onSubmit() {
    setSubmitted(true);
  }

  return (
    <PlatformPreviewPageShell>
      <PreviewPageHeader
        eyebrow="Contact"
        headingId="pp-contact-page-heading"
        heading="Let's talk about your project"
        intro="Reach us directly, or send a message below. This preview form is for demonstration only — nothing you enter here is sent or saved."
      />

      <section aria-labelledby="pp-contact-page-heading" className="px-4 pb-24 md:px-8">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="flex flex-col gap-4">
            <a
              href="mailto:info.sitemint@gmail.com"
              className="flex items-center gap-3 rounded-[var(--sm-radius-lg)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-default))] p-5 transition-colors hover:border-[hsl(var(--sm-mint-500))]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-[var(--sm-radius-pill)] bg-[hsl(var(--sm-mint-100))] text-[hsl(var(--sm-color-action-primary))]">
                <Mail size={18} aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-[hsl(var(--sm-color-text-primary))]">Email us directly</p>
                <p className="text-sm text-[hsl(var(--sm-color-text-muted))]">info.sitemint@gmail.com</p>
              </div>
            </a>
            <p className="text-sm leading-relaxed text-[hsl(var(--sm-color-text-secondary))]">
              Prefer a guided walkthrough of your project instead? Use{" "}
              <a href="/platform-preview/start-project" className="font-semibold text-[hsl(var(--sm-color-action-primary))] hover:underline">
                Start Your Project
              </a>{" "}
              to share details step by step.
            </p>
          </div>

          <div className="rounded-[var(--sm-radius-xl)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-default))] p-7">
            {submitted ? (
              <div role="status" aria-live="polite" className="pp-reveal flex flex-col items-center py-10 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: "hsl(var(--sm-mint-100))" }}>
                  <CheckCircle2 size={28} aria-hidden="true" className="text-[hsl(var(--sm-mint-500))]" />
                </span>
                <h2 className="pp-font-display mt-4 text-xl font-semibold text-[hsl(var(--sm-color-text-primary))]">Message ready — preview only</h2>
                <p className="mt-2 max-w-sm text-sm text-[hsl(var(--sm-color-text-secondary))]">
                  This was a preview. Nothing was sent or saved — no email, database record, or CRM entry was created.
                </p>
                <Button type="button" variant="outline" className="mt-6" onClick={() => { form.reset(); setSubmitted(false); }}>
                  Send another test message
                </Button>
              </div>
            ) : (
              <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5" aria-describedby="pp-contact-preview-notice">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pp-contact-name">Your name</Label>
                  <Input id="pp-contact-name" className={inputClassName} {...form.register("name")} aria-invalid={!!form.formState.errors.name} />
                  {form.formState.errors.name && <p className="text-xs text-[hsl(var(--sm-color-status-danger))]">{form.formState.errors.name.message}</p>}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pp-contact-email">Email address</Label>
                  <Input id="pp-contact-email" type="email" className={inputClassName} {...form.register("email")} aria-invalid={!!form.formState.errors.email} />
                  {form.formState.errors.email && <p className="text-xs text-[hsl(var(--sm-color-status-danger))]">{form.formState.errors.email.message}</p>}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pp-contact-business">What kind of business is this for?</Label>
                  <Input id="pp-contact-business" className={inputClassName} {...form.register("businessType")} aria-invalid={!!form.formState.errors.businessType} />
                  {form.formState.errors.businessType && <p className="text-xs text-[hsl(var(--sm-color-status-danger))]">{form.formState.errors.businessType.message}</p>}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pp-contact-message">How can we help?</Label>
                  <Textarea id="pp-contact-message" rows={4} className={inputClassName} {...form.register("message")} aria-invalid={!!form.formState.errors.message} />
                  {form.formState.errors.message && <p className="text-xs text-[hsl(var(--sm-color-status-danger))]">{form.formState.errors.message.message}</p>}
                </div>

                <p id="pp-contact-preview-notice" className="text-xs text-[hsl(var(--sm-color-text-muted))]">
                  Preview only — this form does not send or save your information.
                </p>

                <Button type="submit" className="w-fit">
                  Send preview message
                </Button>
              </form>
            )}
          </div>
        </div>
      </section>
    </PlatformPreviewPageShell>
  );
}
