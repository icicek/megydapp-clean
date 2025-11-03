'use client';

import * as React from 'react';

// basit class join helper (clsx yerine)
function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

type Variant =
  | 'default'       // mavi dolu (varsayılan)
  | 'secondary'     // gri dolu
  | 'ghost'         // şeffaf, hover vurgulu
  | 'outline'       // sadece border
  | 'destructive'   // kırmızı dolu
  | 'link';         // link görünümlü

type Size = 'default' | 'sm' | 'lg' | 'icon';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
  className?: string;
}

const VARIANT_STYLES: Record<Variant, string> = {
  default:
    'bg-blue-600 text-white hover:bg-blue-700',
  secondary:
    'bg-zinc-700 text-white hover:bg-zinc-600',
  ghost:
    'bg-transparent text-white hover:bg-white/10',
  outline:
    'border border-white/20 text-white hover:bg-white/10',
  destructive:
    'bg-red-600 text-white hover:bg-red-700',
  link:
    'bg-transparent text-blue-400 hover:underline px-0 py-0',
};

const SIZE_STYLES: Record<Size, string> = {
  default: 'h-10 px-4 py-2 text-sm',
  sm: 'h-9 px-3 py-1.5 text-xs',
  lg: 'h-11 px-5 py-2.5 text-base',
  icon: 'h-10 w-10 p-0',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'default',
      size = 'default',
      className = '',
      type = 'button',
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex items-center justify-center rounded-xl font-medium transition-colors',
          'focus:outline-none disabled:opacity-50 disabled:pointer-events-none',
          VARIANT_STYLES[variant],
          SIZE_STYLES[size],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
