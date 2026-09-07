/**
 * ProjectDialog — the interactive project-detail overlay opened from a
 * portfolio card (owner featured-work directive, 2026-09-07). Follows the
 * same native-<dialog> accessibility contract as TeamMemberDialog (the
 * approved "people doing the work" pattern this system is modeled on):
 *
 *  - `showModal()` = real top-layer modal with a native focus trap and
 *    native Escape-to-close; backdrop click closes; focus returns to the
 *    trigger card; background scroll locked while open.
 *  - Browser Back can never trap the UI: the dialog is plain component
 *    state, so navigating unloads it with the page.
 *  - The screenshot carousel has labelled previous/next buttons and a
 *    position readout; it only renders controls when a project has more
 *    than one approved capture.
 *  - Next/previous project navigation cycles through the published lineup
 *    without closing the dialog.
 *  - Reduced motion: entrance styling is gated in CSS; closing is always
 *    instant. On small screens the CSS presents it as a full-screen
 *    project viewer instead of a floating panel.
 *
 * Content is exclusively the truthful `detail` copy from the portfolio
 * manifest data — no invented metrics, totals, or client claims.
 */

import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, X } from "lucide-react";
import type { PortfolioProject } from "./portfolioProjects";

export interface ProjectDialogProps {
  /** Ordered, published lineup (for next/previous navigation). */
  projects: PortfolioProject[];
  /** Index into `projects` of the open project, or null when closed. */
  openIndex: number | null;
  onNavigate: (index: number) => void;
  onClose: () => void;
}

export function ProjectDialog({ projects, openIndex, onNavigate, onClose }: ProjectDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // Keep the last project rendered while the (instant) native close runs.
  const [displayIndex, setDisplayIndex] = useState<number | null>(null);
  const [slide, setSlide] = useState(0);

  const isOpen = openIndex !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (openIndex !== null) {
      setDisplayIndex(openIndex);
      setSlide(0);
      if (!dialog.open) {
        returnFocusRef.current = document.activeElement as HTMLElement | null;
        dialog.showModal();
      }
      return;
    }

    if (dialog.open) dialog.close();
  }, [openIndex]);

  // Scroll lock keyed on open-ness only, so navigating between projects
  // while the dialog stays open never briefly unlocks the page.
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && displayIndex !== null) closeButtonRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    function handleClose() {
      onClose();
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    }
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  function handleDialogClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) dialogRef.current?.close();
  }

  const project = displayIndex !== null ? projects[displayIndex] : null;
  const captures = project
    ? [
        project.desktopAsset && { ...project.desktopAsset, label: "Desktop" },
        project.mobileAsset && { ...project.mobileAsset, label: "Mobile" },
        !project.desktopAsset && !project.mobileAsset && project.fallbackAsset
          ? { ...project.fallbackAsset, label: "Capture" }
          : null,
      ].filter((c): c is NonNullable<typeof c> => Boolean(c))
    : [];
  const capture = captures[Math.min(slide, Math.max(captures.length - 1, 0))];
  const count = projects.length;
  const prevIndex = displayIndex !== null ? (displayIndex + count - 1) % count : 0;
  const nextIndex = displayIndex !== null ? (displayIndex + 1) % count : 0;

  return (
    <dialog
      ref={dialogRef}
      className="sm-proj-dialog"
      aria-modal="true"
      aria-labelledby={project ? titleId : undefined}
      onClick={handleDialogClick}
    >
      {project && (
        <div className="sm-proj-dialog__panel">
          <button
            ref={closeButtonRef}
            type="button"
            className="sm-proj-dialog__close"
            aria-label={`Close ${project.projectName} project details`}
            onClick={() => dialogRef.current?.close()}
          >
            <X aria-hidden="true" />
          </button>

          <div className="sm-proj-dialog__media">
            {capture && (
              <img
                key={capture.src}
                src={capture.src}
                alt={capture.alt}
                width={capture.width}
                height={capture.height}
                className={capture.label === "Mobile" ? "is-portrait" : undefined}
              />
            )}
            {captures.length > 1 && (
              <div className="sm-proj-dialog__carousel" role="group" aria-label="Project captures">
                <button
                  type="button"
                  aria-label="Previous capture"
                  onClick={() => setSlide((s) => (s + captures.length - 1) % captures.length)}
                >
                  <ArrowLeft aria-hidden="true" />
                </button>
                <span aria-live="polite">
                  {capture?.label} · {Math.min(slide, captures.length - 1) + 1} / {captures.length}
                </span>
                <button
                  type="button"
                  aria-label="Next capture"
                  onClick={() => setSlide((s) => (s + 1) % captures.length)}
                >
                  <ArrowRight aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          <div className="sm-proj-dialog__body">
            <span className="sm-proj-dialog__category">{project.category}</span>
            <h2 id={titleId} className="sm-proj-dialog__name">
              {project.projectName}
            </h2>

            <p className="sm-proj-dialog__overview">{project.detail.overview}</p>

            <h3 className="sm-proj-dialog__subhead">The challenge</h3>
            <p>{project.detail.challenge}</p>

            <h3 className="sm-proj-dialog__subhead">What SiteMint designed and built</h3>
            <ul className="sm-proj-dialog__built">
              {project.detail.built.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <h3 className="sm-proj-dialog__subhead">The outcome</h3>
            <p>{project.detail.outcome}</p>

            <div className="sm-proj-dialog__tags">
              {project.contribution.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>

            <div className="sm-proj-dialog__actions">
              {project.publicUrl && (
                <a
                  className="v3-btn v3-btn--primary"
                  href={project.publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Visit the live site <ExternalLink aria-hidden="true" size={16} />
                </a>
              )}
            </div>

            <nav className="sm-proj-dialog__pager" aria-label="More projects">
              <button type="button" onClick={() => { setSlide(0); onNavigate(prevIndex); }}>
                <ArrowLeft aria-hidden="true" size={16} /> {projects[prevIndex].projectName}
              </button>
              <button type="button" onClick={() => { setSlide(0); onNavigate(nextIndex); }}>
                {projects[nextIndex].projectName} <ArrowRight aria-hidden="true" size={16} />
              </button>
            </nav>
          </div>
        </div>
      )}
    </dialog>
  );
}
