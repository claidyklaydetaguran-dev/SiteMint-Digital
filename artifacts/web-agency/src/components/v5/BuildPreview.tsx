/**
 * V5 — Build Preview (owner directive, 2026-09-06: "The empty right-hand
 * area must become a substantial interactive Build Preview, not another
 * static decorative card").
 *
 * Mounted in the Websites & Web Apps split section of `HomeV5.tsx` (and
 * optionally as `WebsitesAppsV3.tsx`'s demo pane). A self-contained,
 * CSS/DOM-only interactive widget — no canvas, no new dependency — that
 * lets a visitor drive four axes at once:
 *
 *   1. Website vs. Web App          — what kind of product is being shown.
 *   2. New Build vs. Redesign       — the engagement, reflected in the
 *      Discover stage's content and a persistent chrome-bar tag.
 *   3. Discover → Design → Build → Launch — a clickable stage stepper.
 *      Advancing the stage visibly changes the preview's own modules:
 *      wireframe blocks → Glacier-styled blocks → populated real-looking
 *      modules → a finished, "live" state.
 *   4. Desktop / Tablet / Mobile    — a viewport control that resizes the
 *      device frame and reflows its modules (nav collapses, grids restack,
 *      a table column drops) via `data-viewport` CSS selectors — no JS
 *      layout branching required.
 *
 * At Website + Launch, one real, owner-approved portfolio capture
 * (`/portfolio/current/hand-homecare-desktop.webp` — see
 * `components/platform-preview/portfolioProjects.ts` for the same asset's
 * approved alt text/dimensions) stands in for the generic hero mockup,
 * deliberately cropped inside the device frame with an honest caption. It
 * never appears for Web App (that capture is a website, not a dashboard),
 * and every other name on screen ("Bloom Dental", "Summit Repairs") is
 * obviously generic.
 *
 * Motion: all transitions (frame width, block recoloring, hover lifts, the
 * Launch "live" pulse) are gated the same way as the rest of this page's
 * `sm-*` motion system — `prefers-reduced-motion: reduce` collapses every
 * transition to instant and freezes the live pulse to a static dot; no
 * autoplaying loop exists outside that one pulse, and it only runs in the
 * Launch stage, never on mount.
 */

import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { Monitor, Tablet, Smartphone } from "lucide-react";

type BuildType = "website" | "webapp";
type BuildMode = "new" | "redesign";
type Stage = "discover" | "design" | "build" | "launch";
type Viewport = "desktop" | "tablet" | "mobile";

const STAGES: ReadonlyArray<{ id: Stage; label: string }> = [
  { id: "discover", label: "Discover" },
  { id: "design", label: "Design" },
  { id: "build", label: "Build" },
  { id: "launch", label: "Launch" },
];

const VIEWPORTS: ReadonlyArray<{ id: Viewport; label: string; Icon: typeof Monitor }> = [
  { id: "desktop", label: "Desktop", Icon: Monitor },
  { id: "tablet", label: "Tablet", Icon: Tablet },
  { id: "mobile", label: "Mobile", Icon: Smartphone },
];

const BRAND: Record<BuildType, string> = {
  website: "Bloom Dental",
  webapp: "Summit Repairs",
};

const PORTFOLIO_IMAGE = {
  src: "/portfolio/current/hand-homecare-desktop.webp",
  width: 1221,
  height: 850,
  alt: "Hand Homecare website homepage on desktop, showing the elderly care hero section and service overview",
};

const FEATURE_TEXT = ["Online booking", "Insurance accepted", "Same-day visits"];
const STAT_TILES: ReadonlyArray<{ label: string; value: string }> = [
  { label: "Open jobs", value: "18" },
  { label: "Invoices due", value: "4" },
  { label: "Active crews", value: "6" },
];
const TABLE_ROWS: ReadonlyArray<{ client: string; status: string; tone: "ok" | "pending"; next: string }> = [
  { client: "R. Alvarez", status: "Scheduled", tone: "ok", next: "Tue 9:00a" },
  { client: "J. Whitfield", status: "Awaiting parts", tone: "pending", next: "Thu 1:00p" },
  { client: "M. Okafor", status: "Scheduled", tone: "ok", next: "Fri 11:30a" },
];
const CHART_VALUES: ReadonlyArray<number> = [38, 62, 45, 80, 55, 70];

function getStageCaption(stage: Stage, mode: BuildMode): string {
  if (stage === "discover") {
    return mode === "redesign"
      ? "Auditing the existing site's structure before anything changes."
      : "Mapping the sitemap and content from a blank canvas.";
  }
  if (stage === "design") return "Applying the SiteMint system — type, color, spacing.";
  if (stage === "build") return "Real modules go in — navigation, content, and the components the business needs.";
  return "Reviewed, tested, and live — ready for real visitors.";
}

function Block({ variant, className }: { variant: string; className?: string }): ReactNode {
  return <span className={["sm-bp__block", `sm-bp__block--${variant}`, className].filter(Boolean).join(" ")} aria-hidden="true" />;
}

function WebsiteModules({ stage, mode }: { stage: Stage; mode: BuildMode }): ReactNode {
  const populated = stage === "build" || stage === "launch";
  const isLaunch = stage === "launch";

  return (
    <div className="sm-bp__site">
      <div className="sm-bp__module sm-bp__nav">
        {populated ? (
          <>
            <span className="sm-bp__logo">{BRAND.website}</span>
            <nav className="sm-bp__nav-links" aria-hidden="true">
              <span>Home</span>
              <span>Services</span>
              <span>About</span>
              <span>Contact</span>
            </nav>
            <span className="sm-bp__nav-burger" aria-hidden="true">☰</span>
          </>
        ) : (
          <>
            <Block variant="logo" />
            <Block variant="nav-item" />
            <Block variant="nav-item" />
            <Block variant="nav-item" />
          </>
        )}
      </div>

      {isLaunch ? (
        <figure className="sm-bp__hero-shot">
          <img
            src={PORTFOLIO_IMAGE.src}
            width={PORTFOLIO_IMAGE.width}
            height={PORTFOLIO_IMAGE.height}
            alt={PORTFOLIO_IMAGE.alt}
            loading="lazy"
            decoding="async"
            className="sm-bp__hero-img"
          />
        </figure>
      ) : (
        <div className="sm-bp__module sm-bp__hero">
          {populated ? (
            <>
              <h3 className="sm-bp__headline">Book your appointment online</h3>
              <p className="sm-bp__sub">Same-day openings for cleanings and checkups.</p>
              <span className="sm-bp__cta-btn">Book Now</span>
            </>
          ) : (
            <>
              <Block variant="headline" />
              <Block variant="sub" />
              <Block variant="cta" />
            </>
          )}
        </div>
      )}

      <div className="sm-bp__module sm-bp__features">
        {FEATURE_TEXT.map((text, i) => (
          <div className="sm-bp__feature" key={text}>
            <Block variant="icon" />
            {populated ? <span className="sm-bp__feature-text">{text}</span> : <Block variant="line" className={`sm-bp__line-${i}`} />}
          </div>
        ))}
      </div>

      <div className="sm-bp__module sm-bp__form">
        {populated ? (
          <>
            <span className="sm-bp__form-label">Request an appointment</span>
            <span className="sm-bp__form-field">Full name</span>
            <span className="sm-bp__form-field">Phone number</span>
            <span className="sm-bp__cta-btn sm-bp__cta-btn--form">Submit</span>
          </>
        ) : (
          <>
            <Block variant="label" />
            <Block variant="field" />
            <Block variant="field" />
            <Block variant="cta" />
          </>
        )}
      </div>

      {mode === "redesign" && stage === "discover" && (
        <div className="sm-bp__audit-tag">Auditing existing homepage</div>
      )}
    </div>
  );
}

function WebAppModules({ stage, mode }: { stage: Stage; mode: BuildMode }): ReactNode {
  const populated = stage === "build" || stage === "launch";

  return (
    <div className="sm-bp__app">
      <div className="sm-bp__module sm-bp__app-topbar">
        {populated ? (
          <span className="sm-bp__app-title">{BRAND.webapp} — Dashboard</span>
        ) : (
          <Block variant="headline" />
        )}
      </div>

      <div className="sm-bp__module sm-bp__stats">
        {STAT_TILES.map((tile) => (
          <div className="sm-bp__stat" key={tile.label}>
            {populated ? (
              <>
                <span className="sm-bp__stat-value">{tile.value}</span>
                <span className="sm-bp__stat-label">{tile.label}</span>
              </>
            ) : (
              <>
                <Block variant="stat-value" />
                <Block variant="stat-label" />
              </>
            )}
          </div>
        ))}
      </div>

      <div className="sm-bp__module sm-bp__table">
        {populated ? (
          <table className="sm-bp__data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Status</th>
                <th>Next visit</th>
              </tr>
            </thead>
            <tbody>
              {TABLE_ROWS.map((row) => (
                <tr key={row.client}>
                  <td>{row.client}</td>
                  <td>
                    <span className={`sm-bp__status sm-bp__status--${row.tone}`}>{row.status}</span>
                  </td>
                  <td>{row.next}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="sm-bp__table-wire">
            <Block variant="row" />
            <Block variant="row" />
            <Block variant="row" />
            <Block variant="row" />
          </div>
        )}
      </div>

      <div className="sm-bp__module sm-bp__chart" aria-hidden="true">
        <div className="sm-bp__chart-bars">
          {CHART_VALUES.map((v, i) => (
            <span
              key={i}
              className="sm-bp__chart-bar"
              data-populated={populated || undefined}
              style={{ "--bp-bar-h": `${v}%` } as CSSProperties}
            />
          ))}
        </div>
      </div>

      {mode === "redesign" && stage === "discover" && (
        <div className="sm-bp__audit-tag">Auditing existing dashboard</div>
      )}
    </div>
  );
}

export function BuildPreview() {
  const [buildType, setBuildType] = useState<BuildType>("website");
  const [mode, setMode] = useState<BuildMode>("new");
  const [stageIdx, setStageIdx] = useState(2);
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const groupId = useId();
  const stage = STAGES[stageIdx].id;

  return (
    <div
      className="sm-bp"
      data-stage={stage}
      data-viewport={viewport}
      data-type={buildType}
      data-mode={mode}
      role="group"
      aria-label="Interactive build preview"
    >
      <div className="sm-bp__controls">
        <div className="sm-bp__control-row" role="group" aria-label="Choose what to preview">
          <button
            type="button"
            className="sm-bp__toggle"
            aria-pressed={buildType === "website"}
            onClick={() => setBuildType("website")}
          >
            Website
          </button>
          <button
            type="button"
            className="sm-bp__toggle"
            aria-pressed={buildType === "webapp"}
            onClick={() => setBuildType("webapp")}
          >
            Web App
          </button>
        </div>

        <div className="sm-bp__control-row" role="group" aria-label="Choose the engagement type">
          <button
            type="button"
            className="sm-bp__toggle sm-bp__toggle--ghost"
            aria-pressed={mode === "new"}
            onClick={() => setMode("new")}
          >
            New Build
          </button>
          <button
            type="button"
            className="sm-bp__toggle sm-bp__toggle--ghost"
            aria-pressed={mode === "redesign"}
            onClick={() => setMode("redesign")}
          >
            Redesign
          </button>
        </div>

        <div className="sm-bp__control-row sm-bp__viewport-row" role="group" aria-label="Preview viewport size">
          {VIEWPORTS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className="sm-bp__viewport-btn"
              aria-pressed={viewport === id}
              aria-label={`Preview at ${label} width`}
              onClick={() => setViewport(id)}
            >
              <Icon size={15} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <ol className="sm-bp__stages" aria-label="Build stage" id={`${groupId}-stages`}>
        {STAGES.map((s, i) => (
          <li key={s.id} className="sm-bp__stage-item">
            <button
              type="button"
              className="sm-bp__stage-btn"
              aria-current={stageIdx === i ? "step" : undefined}
              aria-pressed={stageIdx === i}
              data-complete={stageIdx > i || undefined}
              onClick={() => setStageIdx(i)}
            >
              <span className="sm-bp__stage-dot" aria-hidden="true">
                {stageIdx > i ? "✓" : i + 1}
              </span>
              <span className="sm-bp__stage-label">{s.label}</span>
            </button>
          </li>
        ))}
      </ol>

      <p className="sm-bp__stage-caption" aria-live="polite">
        {getStageCaption(stage, mode)}
      </p>

      <div className="sm-bp__frame-wrap">
        {/* The device-frame mockup is illustrative preview content, not real
            functional UI — its accessible summary is the live-region stage
            caption above plus the control states themselves, so the frame's
            interior is hidden from assistive tech; the honest portfolio
            caption below stays announced. */}
        <div className="sm-bp__frame" aria-hidden="true">
          <div className="sm-bp__chrome">
            <span className="sm-bp__dot" />
            <span className="sm-bp__dot" />
            <span className="sm-bp__dot" />
            <span className="sm-bp__chrome-tag">{mode === "new" ? "New build" : "Redesign"}</span>
            {stage === "launch" && (
              <span className="sm-bp__live">
                <span className="sm-bp__live-dot" aria-hidden="true" />
                Live
              </span>
            )}
          </div>
          <div className="sm-bp__canvas">
            {buildType === "website" ? (
              <WebsiteModules stage={stage} mode={mode} />
            ) : (
              <WebAppModules stage={stage} mode={mode} />
            )}
          </div>
        </div>
        {stage === "launch" && buildType === "website" && (
          <p className="sm-bp__caption">Hand Homecare — a SiteMint build</p>
        )}
      </div>
    </div>
  );
}

export default BuildPreview;
