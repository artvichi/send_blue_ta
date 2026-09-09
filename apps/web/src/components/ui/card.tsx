import * as React from 'react';
import { cn } from '@/lib/utils';

export const Card = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-2xl border border-rule bg-surface shadow-sm', className)}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

export const CardHeader = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div className={cn('flex flex-col gap-1 p-5', className)} {...props} />
);

export const CardTitle = ({ className, ...props }: React.ComponentProps<'h3'>) => (
  <h3 className={cn('text-sm font-semibold tracking-tight text-ink', className)} {...props} />
);

export const CardContent = ({ className, ...props }: React.ComponentProps<'div'>) => (
  <div className={cn('p-5 pt-0', className)} {...props} />
);
