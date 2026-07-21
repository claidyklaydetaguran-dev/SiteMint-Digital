import "@/styles/platform-preview.css";
import { usePlatformPreviewDocumentMeta } from "@/hooks/usePlatformPreviewDocumentMeta";
import { PlatformPreviewPageShell } from "@/components/platform-preview/PlatformPreviewPageShell";
import { PreviewPageHeader } from "@/components/platform-preview/PreviewPageHeader";
import { aboutTeam, aboutValues } from "@/components/platform-preview/aboutContent";
import { FinalCtaSection } from "@/components/platform-preview/FinalCtaSection";

const PREVIEW_TITLE = "About — SiteMint Platform Preview (Internal, Unpublished)";
const PREVIEW_DESCRIPTION = "Internal, unpublished preview of SiteMint Digital's team, values, and working philosophy.";

export default function PlatformAboutPreview() {
  usePlatformPreviewDocumentMeta(PREVIEW_TITLE, PREVIEW_DESCRIPTION);

  return (
    <PlatformPreviewPageShell>
      <PreviewPageHeader
        eyebrow="About SiteMint Digital"
        headingId="pp-about-page-heading"
        heading="One connected team, not a vendor and a contractor working apart"
        intro="SiteMint Digital builds websites, products, and the systems that connect them — with a small, direct team that stays with your project from planning to launch and beyond."
      />

      <section aria-labelledby="pp-about-values-heading" className="px-4 pb-20 md:px-8">
        <div className="mx-auto max-w-[1280px]">
          <h2 id="pp-about-values-heading" className="pp-font-display text-2xl font-semibold text-[hsl(var(--sm-color-text-primary))] md:text-3xl">
            How we work
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {aboutValues.map((value) => (
              <div
                key={value.title}
                className="rounded-[var(--sm-radius-lg)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-default))] p-6"
                style={{ borderLeftColor: "hsl(var(--sm-mint-500))", borderLeftWidth: "3px" }}
              >
                <h3 className="text-base font-semibold text-[hsl(var(--sm-color-text-primary))]">{value.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--sm-color-text-secondary))]">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="pp-about-team-heading" className="bg-[hsl(var(--sm-color-bg-subtle))] px-4 py-20 md:px-8">
        <div className="mx-auto max-w-[1280px]">
          <h2 id="pp-about-team-heading" className="pp-font-display text-2xl font-semibold text-[hsl(var(--sm-color-text-primary))] md:text-3xl">
            The team behind every project
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {aboutTeam.map((member, index) => (
              <div
                key={member.name}
                className="pp-reveal flex flex-col overflow-hidden rounded-[var(--sm-radius-lg)] border border-[hsl(var(--sm-color-border-default))] bg-[hsl(var(--sm-color-surface-default))] transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--sm-shadow-glow-subtle)]"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <img
                  src={member.photo}
                  alt={`${member.name}, ${member.title}`}
                  loading="lazy"
                  decoding="async"
                  className="h-56 w-full object-cover"
                />
                <div className="p-5">
                  <h3 className="text-base font-semibold text-[hsl(var(--sm-color-text-primary))]">{member.name}</h3>
                  <p className="text-xs font-medium text-[hsl(var(--sm-color-action-primary))]">{member.title}</p>
                  <p className="mt-3 text-sm leading-relaxed text-[hsl(var(--sm-color-text-secondary))]">{member.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="pp-about-capability-heading" className="px-4 py-20 md:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 id="pp-about-capability-heading" className="pp-font-display text-2xl font-semibold text-[hsl(var(--sm-color-text-primary))] md:text-3xl">
            Honest about what's ready today
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[hsl(var(--sm-color-text-secondary))]">
            Every product and service across this preview is labeled Available, In development, or Planned — the same
            standard we hold ourselves to when we talk with clients about their own project's readiness.
          </p>
        </div>
      </section>

      <FinalCtaSection />
    </PlatformPreviewPageShell>
  );
}
