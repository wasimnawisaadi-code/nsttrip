export function SkeletonCard() {
  return (
    <div className="card-nawi animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-lg bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-muted rounded w-20" />
          <div className="h-5 bg-muted rounded w-32" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card-nawi animate-pulse space-y-3">
      <div className="h-10 bg-muted rounded" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-8 bg-muted/50 rounded" />
      ))}
    </div>
  );
}
