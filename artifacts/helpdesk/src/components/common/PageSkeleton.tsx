/**
 * V5 — shared loading skeleton for pages, matching `Overview.tsx`'s
 * `OverviewSkeleton` shape (`sd-skel*` classes already defined in
 * `v2-dashboard.css`) so every new screen's loading state looks like the
 * rest of the dashboard instead of a bare "Loading…" line.
 */

export function PageSkeleton({
  label,
  figures = false,
  list = false,
}: {
  label: string;
  figures?: boolean;
  list?: boolean;
}) {
  return (
    <div className="sd-page" aria-busy="true">
      <p className="sd-sr" role="status">{label}</p>
      <div className="sd-skel sd-skel--title" />
      <div className="sd-skel sd-skel--status" />
      {figures && <div className="sd-skel sd-skel--figures" />}
      {list && <div className="sd-skel sd-skel--list" />}
    </div>
  );
}

export default PageSkeleton;
