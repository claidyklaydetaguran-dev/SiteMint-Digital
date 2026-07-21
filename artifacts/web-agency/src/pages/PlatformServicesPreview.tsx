import "@/styles/platform-preview.css";
import { usePlatformPreviewDocumentMeta } from "@/hooks/usePlatformPreviewDocumentMeta";
import { PlatformPreviewPageShell } from "@/components/platform-preview/PlatformPreviewPageShell";
import { PreviewPageHeader } from "@/components/platform-preview/PreviewPageHeader";
import { ServiceDetailCard } from "@/components/platform-preview/ServiceDetailCard";
import { servicesDetail } from "@/components/platform-preview/servicesDetail";
import { FinalCtaSection } from "@/components/platform-preview/FinalCtaSection";

const PREVIEW_TITLE = "Services — SiteMint Platform Preview (Internal, Unpublished)";
const PREVIEW_DESCRIPTION =
  "Internal, unpublished preview of SiteMint's service catalog — websites, applications, CRM, automation, and more.";

export default function PlatformServicesPreview() {
  usePlatformPreviewDocumentMeta(PREVIEW_TITLE, PREVIEW_DESCRIPTION);

  return (
    <PlatformPreviewPageShell>
      <PreviewPageHeader
        eyebrow="Services"
        headingId="pp-services-page-heading"
        heading="Work SiteMint performs on your website, application, or systems"
        intro="No subscription required — every service below is real work SiteMint does for your business, labeled honestly by how ready it is today."
      />

      <section aria-labelledby="pp-services-page-heading" className="px-4 pb-24 md:px-8">
        <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {servicesDetail.map((service, index) => (
            <div key={service.id} className="pp-reveal" style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}>
              <ServiceDetailCard service={service} />
            </div>
          ))}
        </div>
      </section>

      <FinalCtaSection />
    </PlatformPreviewPageShell>
  );
}
