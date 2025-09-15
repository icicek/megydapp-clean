// components/ui/dialog.tsx
'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

/** Root + Portal sarmalayıcısı */
export function Dialog({ open, onOpenChange, children }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>{children}</DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Opsiyonel overlay: İstersen modallarda kullan */
export function DialogOverlay({ className = '' }: { className?: string }) {
  return (
    <DialogPrimitive.Overlay
      className={`fixed inset-0 bg-black/70 backdrop-blur-sm z-40 ${className}`}
    />
  );
}

type ContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  className?: string;
};

/** İçerik: default stiller + tüm Content prop’larını geçirir (aria vs. dahil) */
export function DialogContent({ children, className = '', ...props }: ContentProps) {
  return (
    <DialogPrimitive.Content
      className={`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                  bg-zinc-900 text-white p-6 rounded-xl w-[90vw] max-w-md z-50 shadow-lg ${className}`}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  );
}

/** Başlık (Title) */
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

/** Açıklama (Description) — a11y uyarılarını susturmak için */
export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className = '', ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={className}
    {...props}
  />
));
DialogDescription.displayName = 'DialogDescription';

/** İsteğe bağlı kapatma (Close) export’u */
export const DialogClose = DialogPrimitive.Close;
