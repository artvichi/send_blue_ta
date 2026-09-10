import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium',
    // A short, eased transition on the properties that actually change, rather
    // than transition-all, which animates colour and layout by accident.
    'transition-[transform,box-shadow,background-color,color,border-color,filter]',
    'duration-150 ease-out',
    // Press is where feedback matters most: it should feel like the button took
    // the click, and it must return instantly.
    'active:translate-y-0 active:duration-75',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:transition-transform',
  ],
  {
    variants: {
      variant: {
        // The primary action carries the only gradient in the interface, which
        // is what makes it read as the primary action.
        // The gradient shifts on hover rather than the whole button brightening,
        // so the motion reads as light moving across it.
        primary: [
          'bg-linear-to-r from-brand to-brand-deep bg-[length:180%_100%] bg-left text-white',
          'shadow-sm hover:bg-right hover:shadow-md hover:-translate-y-px',
          'transition-[background-position,transform,box-shadow] duration-300',
          'active:translate-y-0 active:shadow-sm',
        ],
        secondary: 'bg-surface text-ink border border-rule hover:bg-sunk hover:border-ink-mute/40 hover:-translate-y-px active:translate-y-0',
        ghost: 'text-ink-soft hover:bg-sunk hover:text-ink active:scale-95',
        danger: 'bg-bad-soft text-bad border border-bad/25 hover:bg-bad/15 hover:border-bad/40 hover:-translate-y-px active:translate-y-0',
      },
      size: {
        sm: 'h-8 px-3 text-xs [&_svg]:size-3.5',
        md: 'h-10 px-4 [&_svg]:size-4',
        lg: 'h-14 px-6 text-base [&_svg]:size-5',
        icon: 'size-8 [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
