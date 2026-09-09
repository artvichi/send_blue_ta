import { cn } from '@/lib/utils';

export const Skeleton = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div className={cn('animate-pulse rounded-lg bg-sunk', className)} {...props} />
);
