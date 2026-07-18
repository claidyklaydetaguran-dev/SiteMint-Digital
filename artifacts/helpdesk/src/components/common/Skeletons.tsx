/** Shared loading skeletons — shapes match the final layout so loading never jumps. */
export function SkeletonCard({ className = "" }: { className?: string }) {
  return <div className={`rounded-xl border border-border bg-card animate-pulse ${className}`} />;
}

export function SkeletonRow({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3.5 border-b border-border last:border-0 ${className}`}>
      <div className="flex-1 h-4 bg-muted rounded animate-pulse" />
      <div className="h-5 w-14 bg-muted rounded-full animate-pulse" />
      <div className="h-4 w-10 bg-muted rounded animate-pulse" />
    </div>
  );
}
