interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusClasses: Record<string, string> = {
  New: 'badge-new',
  Processing: 'badge-processing',
  Success: 'badge-success',
  Completed: 'badge-success',
  Failed: 'badge-failed',
  Pending: 'badge-pending',
  Approved: 'badge-success',
  Rejected: 'badge-failed',
  Draft: 'badge-new',
  Sent: 'badge-processing',
  Accepted: 'badge-success',
  Confirmed: 'badge-success',
  Present: 'badge-success',
  Late: 'badge-pending',
  Absent: 'badge-failed',
  active: 'badge-success',
  inactive: 'badge-failed',
};

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const cls = statusClasses[status] || 'badge-new';
  return <span className={`${cls} ${className}`}>{status}</span>;
}
