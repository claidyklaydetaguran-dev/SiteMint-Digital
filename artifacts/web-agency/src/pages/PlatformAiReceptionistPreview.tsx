import { Link } from "wouter";
import { ArrowRight, LogIn } from "lucide-react";
import "@/styles/platform-preview.css";
import { usePlatformPreviewDocumentMeta } from "@/hooks/usePlatformPreviewDocumentMeta";
import { PlatformPreviewPageShell } from "@/components/platform-preview/PlatformPreviewPageShell";
import { PreviewPageHeader } from "@/components/platform-preview/PreviewPageHeader";
import { PlatformPreviewGoalProvider } from "@/components/platform-preview/PlatformPreviewGoalContext";
import { AiReceptionistDemo } from "@/components/platform-preview/AiReceptionistDemo";
import { CapabilityBadge } from "@/components/platform-preview/CapabilityBadge";
import { startProjectHref, signInHref } from "@/components/platform-preview/navConfig";
import { FinalCtaSection } from "@/components/platform-preview/FinalCtaSection";

const PREVIEW_TITLE = "AI Receptionist — SiteMint Platform Preview (Internal, Unpublished)";
const PREVIEW_DESCRIPTION = "Internal, unpublished preview of the AI Receptionist product page and interactive demo.";

const readiness: { label: string; level: "available" | "in-development" | "planned" }[] = [
  { label: "SMS receptionist", level: "available" },
  { label: "Voice experience", level: "in-development" },
  { label: "Connected CRM & follow-up", level: "planned" },
];

const problems = [
  "Missed calls and slow follow-up cost businesses real leads.",
  "After-hours inquiries go unanswered until the next business day.",
  "Team members spend time on repetitive intake questions instead of real conversations.",
];

export default function PlatformAiReceptionistPreview() {
  usePlatformPreviewDocumentMeta(PREVIEW_TITLE, PREVIEW_DESCRIPTION);

  return (
    <PlatformPreviewPageShell>
      <PreviewPageHeader
        eyebrow="Product — AI Receptionist"
        headingId="pp-receptionist-page-heading"
        heading="An AI receptionist that never misses an inquiry"
        intro="Answers and qualifies every inbound text, day or night, so no lead goes unanswered — with a clear line between what's live today and what's still on the way."
      >
        <div className="mt-6 flex flex-wrap gap-2">
          {readiness.map((row) => (
            <span key={row.label} className="inline-flex items-center gap-1.5 text-xs text-[hsl(var(--sm-color-text-secondary))]">
              {row.label}
              <CapabilityBadge level={row.level} />
            </span>
          ))}
        </div>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href={startProjectHref}
            className="inline-flex items-center justify-center gap-2 rounded-[var(--sm-radius-pill)] bg-[var(--sm-button-primary-background)] px-6 py-3 text-sm font-semibold text-[var(--sm-button-primary-text)] shadow-[var(--sm-shadow-md)] transition-colors hover:bg-[var(--sm-button-primary-background-hover)]"
          >
            Start Your Project
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link
            href={signInHref}
            aria-label="Sign in to AI Receptionist"
            className="inline-flex items-center justify-center gap-2 rounded-[var(--sm-radius-pill)] border border-[hsl(var(--sm-color-border-strong))] px-6 py-3 text-sm font-semibold text-[hsl(var(--sm-color-text-primary))] transition-colors hover:bg-[hsl(var(--sm-color-surface-interactive))]"
          >
            <LogIn size={15} aria-hidden="true" />
            Sign In
          </Link>
        </div>
      </PreviewPageHeader>

      <section aria-labelledby="pp-receptionist-problems-heading" className="px-4 pb-16 md:px-8">
        <div className="mx-auto max-w-[1280px]">
          <h2 id="pp-receptionist-problems-heading" className="pp-font-display text-2xl font-semibold text-[hsl(var(--sm-color-text-primary))] md:text-3xl">
            The problem it solves
          </h2>
          <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {problems.map((problem) => (
              <li key={problem} className="rounded-[var(--sm-radius-lg)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-default))] p-5 text-sm leading-relaxed text-[hsl(var(--sm-color-text-secondary))]">
                {problem}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="pp-receptionist-demo-heading" className="bg-[hsl(var(--sm-color-bg-subtle))] px-4 py-20 md:px-8">
        <div className="mx-auto max-w-3xl">
          <h2 id="pp-receptionist-demo-heading" className="pp-font-display text-2xl font-semibold text-[hsl(var(--sm-color-text-primary))] md:text-3xl">
            Try the interactive demo
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[hsl(var(--sm-color-text-secondary))]">
            Pick a scenario to see how a real inquiry would move from first message to a routed next action — this is a
            synthetic walkthrough, not a live call or connection to any real customer data.
          </p>
          <PlatformPreviewGoalProvider>
            <AiReceptionistDemo />
          </PlatformPreviewGoalProvider>
        </div>
      </section>

      <FinalCtaSection />
    </PlatformPreviewPageShell>
  );
}
