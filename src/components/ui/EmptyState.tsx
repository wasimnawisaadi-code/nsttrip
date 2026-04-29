import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        {icon || <Inbox className="w-8 h-8 text-muted-foreground" />}
      </div>
      <h3 className="text-lg font-semibold text-foreground font-display mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-sm">{description}</p>
      {action}
    </div>
  );
}
