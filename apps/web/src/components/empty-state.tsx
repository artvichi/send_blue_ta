import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-rule bg-surface/50 px-6 py-14 text-center">
      <div className="text-ink-mute [&_svg]:size-7">{icon}</div>
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="max-w-sm text-sm text-ink-mute">{description}</p>
    </div>
  );
}
