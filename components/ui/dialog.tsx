'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>{children}</DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

interface DialogContentProps {
  children: React.ReactNode;
  className?: string;
}

export function DialogContent({ children, className = '' }: DialogContentProps) {
  return (
    <DialogPrimitive.Content
      className={`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-zinc-900 text-white p-6 rounded-xl w-[90vw] max-w-md z-50 shadow-lg ${className}`}
    >
      {children}
    </DialogPrimitive.Content>
  );
}

// ✅ DialogTitle eklendi
export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className = '', ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={`text-lg font-semibold leading-none tracking-tight ${className}`}
    {...props}
  />
));

DialogTitle.displayName = 'DialogTitle';
