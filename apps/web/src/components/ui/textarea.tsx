import * as React from 'react';
import { cn } from '@/lib/utils';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[132px] w-full resize-y rounded-xl border border-rule bg-surface px-4 py-3 text-base text-ink',
        'placeholder:text-ink-mute',
        'transition-colors focus-visible:border-brand focus-visible:outline-none',
        'aria-invalid:border-bad',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
