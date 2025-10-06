'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

// Basit class birleştirici
function cx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(' ');
}

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    {...props}
    // Blur YOK, karartma VAR; z-index overlay < content
    className={cx(
      'fixed inset-0 z-[90] bg-black/60 backdrop-blur-0',
      // animasyon class’ları varsa sorun etmez; yoksa da çalışır
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
  />
));
DialogOverlay.displayName = 'DialogOverlay';

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      {...props}
      // Merkezde, overlay’in ÜSTÜNDE
      className={cx(
        'fixed z-[100] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
        'outline-none',
        // responsive genişlik/verdiğin class’larla override edilebilir
        'w-[92vw] max-w-md',
        className
      )}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = 'DialogContent';

export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
