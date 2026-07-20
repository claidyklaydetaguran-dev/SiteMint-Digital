/**
 * Data-driven Selected Work model (Checkpoint 2B.3). Adding, replacing, or
 * reordering a project is a data-only change — SelectedWorkSection.tsx and
 * PortfolioVisual.tsx read this array and render whichever visualMode a
 * project declares; neither file needs to change for a normal project swap.
 *
 * Only projects with owner-approved public publication and owner-approved
 * visual assets appear here (see docs/sitemint-platform/
 * PORTFOLIO_PERMISSION_MANIFEST.md §12 for the full approval record). Shasta
 * Greene Real Estate is an approved future featured project, but no current
 * screenshot has cleared visual approval — it is intentionally omitted from
 * this array rather than rendered as an empty card. It will be added here,
 * without any redesign of this file's consumers, once a recapture is
 * approved.
 *
 * No internal permission/audit field (approval status, verification source,
 * capture provenance) is modeled here — those live only in the manifest
 * docs above. Nothing in this file may render as public-facing text.
 */

export type PortfolioVisualMode = "responsive-pair" | "desktop-only" | "mobile-only";

export type PortfolioImageAsset = {
  src: string;
  width: number;
  height: number;
  alt: string;
};

export type PortfolioProject = {
  id: string;
  projectName: string;
  category: string;
  industry: string;
  summary: string;
  contribution: string[];
  publicUrl?: string;
  ctaLabel: string;
  desktopAsset?: PortfolioImageAsset;
  mobileAsset?: PortfolioImageAsset;
  fallbackAsset?: PortfolioImageAsset;
  featured: boolean;
  sortOrder: number;
  imageFit: "cover" | "contain";
  desktopPosition?: string;
  mobilePosition?: string;
  visualMode: PortfolioVisualMode;
  statusLabel?: string;
};

export const portfolioProjects: PortfolioProject[] = [
  {
    id: "hand-homecare",
    projectName: "Hand Homecare",
    category: "Home Care Services",
    industry: "Healthcare & Home Care",
    summary:
      "A trustworthy digital presence that helps families understand care services and reach the business quickly.",
    contribution: [
      "Responsive website design",
      "Service presentation",
      "Conversion-focused contact pathways",
    ],
    publicUrl: "https://website-crm.replit.app/",
    ctaLabel: "View Project",
    desktopAsset: {
      src: "/portfolio/current/hand-homecare-desktop.webp",
      width: 1221,
      height: 850,
      alt: "Hand Homecare website homepage on desktop, showing the elderly care hero section and service overview",
    },
    mobileAsset: {
      src: "/portfolio/current/hand-homecare-mobile.webp",
      width: 388,
      height: 838,
      alt: "Hand Homecare website homepage on a mobile screen",
    },
    featured: true,
    sortOrder: 0,
    imageFit: "cover",
    desktopPosition: "top center",
    mobilePosition: "top center",
    visualMode: "responsive-pair",
  },
  {
    id: "onefilam-community",
    projectName: "OneFilAm Community",
    category: "Community Organization",
    industry: "Nonprofit & Community",
    summary:
      "A central digital home for community programs, events, resources, and participation.",
    contribution: [
      "Community-focused web experience",
      "Structured content",
      "Clear participation pathways",
    ],
    publicUrl: "https://onefilamcommunity.org/",
    ctaLabel: "Visit the Community",
    desktopAsset: {
      src: "/portfolio/current/onefilam-community-desktop.webp",
      width: 1221,
      height: 844,
      alt: "OneFilAm Community website homepage on desktop",
    },
    mobileAsset: {
      src: "/portfolio/current/onefilam-community-mobile.webp",
      width: 388,
      height: 840,
      alt: "OneFilAm Community website homepage on a mobile screen",
    },
    featured: false,
    sortOrder: 1,
    imageFit: "cover",
    desktopPosition: "top center",
    mobilePosition: "top center",
    visualMode: "responsive-pair",
  },
  {
    id: "herlinda-valdovinos",
    projectName: "Herlinda Valdovinos",
    category: "Real Estate",
    industry: "Professional Services",
    summary:
      "A professional real estate presence that communicates local expertise and invites client conversations.",
    contribution: [
      "Personal-brand website",
      "Property-focused storytelling",
      "Lead-generation pathways",
    ],
    publicUrl: "https://sunshine-herlinda-site.replit.app/",
    ctaLabel: "Explore the Website",
    desktopAsset: {
      src: "/portfolio/current/herlinda-valdovinos-desktop.webp",
      width: 1218,
      height: 804,
      alt: "Herlinda Valdovinos real estate website homepage on desktop",
    },
    featured: false,
    sortOrder: 2,
    imageFit: "cover",
    desktopPosition: "center",
    visualMode: "desktop-only",
  },
  {
    id: "claidy-taguran",
    projectName: "Claidy Taguran",
    category: "Portfolio Experience",
    industry: "Technology & Design",
    summary:
      "A modern portfolio experience that presents technical skills and project work clearly.",
    contribution: [
      "Interactive portfolio design",
      "Responsive presentation",
      "Modern frontend experience",
    ],
    publicUrl: "https://ClaidyTaguranPorfolio.replit.app",
    ctaLabel: "View the Portfolio",
    mobileAsset: {
      src: "/portfolio/current/claidy-taguran-mobile.webp",
      width: 388,
      height: 528,
      alt: "Claidy Taguran portfolio website homepage on a mobile screen",
    },
    featured: false,
    sortOrder: 3,
    imageFit: "cover",
    mobilePosition: "top center",
    visualMode: "mobile-only",
    statusLabel: "Portfolio Experience",
  },
];
