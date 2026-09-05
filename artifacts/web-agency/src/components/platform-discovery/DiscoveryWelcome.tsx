import { ArrowRight, Clock, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DiscoveryWelcomeProps {
  hasDraft: boolean;
  onStart: () => void;
  onRestoreDraft: () => void;
}

const WHAT_WE_ASK = [
  "Where you're starting from and what your business does",
  "The system or service you need",
  "Your business and audience",
  "Brand and visual direction",
  "Content and functionality",
  "Systems and integrations",
  "Growth and advertising support, if you're interested",
  "Delivery timeline, budget, and how to reach you",
];

export function DiscoveryWelcome({ hasDraft, onStart, onRestoreDraft }: DiscoveryWelcomeProps) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      {/* Icon badge */}
      <div
        aria-hidden="true"
        className="mb-5 flex h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: "hsl(var(--sm-mint-100))" }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M9 12h6M9 16h6M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"
            stroke="hsl(var(--sm-mint-700))"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Headline */}
      <h1 className="pp-font-display text-3xl font-semibold text-[hsl(var(--sm-color-text-primary))] leading-tight">
        Tell us what you're building
      </h1>
      <p className="mt-3 text-base leading-relaxed text-[hsl(var(--sm-color-text-secondary))]">
        This form helps us understand your project, your situation, and what success looks like for your team.
        We'll use your answers to prepare a personalized scope of work and proposal — at no cost.
      </p>

      {/* Time estimate chip */}
      <div
        className="mt-6 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm"
        style={{
          borderColor: "hsl(var(--sm-color-border-default))",
          backgroundColor: "hsl(var(--sm-color-bg-subtle))",
        }}
      >
        <Clock size={15} aria-hidden="true" className="shrink-0 text-[hsl(var(--sm-mint-700))]" />
        <span className="text-[hsl(var(--sm-color-text-secondary))]">
          <strong className="font-semibold text-[hsl(var(--sm-color-text-primary))]">About 10–15 minutes.</strong>{" "}
          Your progress is saved automatically so you can come back anytime.
        </span>
      </div>

      {/* What we'll ask about */}
      <div className="mt-8">
        <p className="mb-3 text-sm font-semibold text-[hsl(var(--sm-color-text-primary))]">What we'll ask about:</p>
        <ul className="space-y-2" aria-label="Topics covered in this form">
          {WHAT_WE_ASK.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm text-[hsl(var(--sm-color-text-secondary))]">
              <CheckCircle
                size={15}
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-[hsl(var(--sm-mint-700))]"
              />
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* CTAs */}
      <div className="mt-9">
        {hasDraft ? (
          <div className="space-y-3">
            <Button
              type="button"
              size="lg"
              className="pp-btn pp-btn-primary gap-2"
              onClick={onRestoreDraft}
            >
              Continue where you left off
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
            <div>
              <button
                type="button"
                className="text-sm text-[hsl(var(--sm-color-text-muted))] underline underline-offset-2 hover:no-underline"
                onClick={onStart}
              >
                Start fresh instead
              </button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            size="lg"
            className="pp-btn pp-btn-primary gap-2"
            onClick={onStart}
          >
            Start the form
            <ArrowRight size={16} aria-hidden="true" />
          </Button>
        )}
      </div>

      <p className="mt-6 text-xs text-[hsl(var(--sm-color-text-muted))]">
        Your information is kept private and used only to prepare your proposal. We'll never share or sell your data.
      </p>
    </div>
  );
}
