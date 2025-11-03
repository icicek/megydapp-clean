// components/share/ShareCenter.tsx
'use client';

import { useState } from 'react';
import { shareVia } from '@/lib/share';
import type { SharePayload, ShareChannel } from '@/lib/share/channels';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

// Aşağıdaki import sende named export ise böyle kalsın.
// Eğer default export ise satırı şu şekilde değiştir: `import Button from '@/components/ui/button'`
import { Button } from '@/components/ui/button';

import { Share2, Twitter, Send, Mail, Link as LinkIcon, Download, MessageSquare } from 'lucide-react';

export type ShareContext = 'profile' | 'contribution' | 'leaderboard' | 'success';

export type ShareCenterProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  payload: SharePayload; // { url, text?, hashtags?, via?, imageUrl?, utm? }
  context?: ShareContext;
  txId?: string;
  imageId?: string;
  className?: string;
  title?: string;

  // Yeni: paylaşım bittikten sonra (kanalı biliyoruz) backend’e kayıt atmak için
  onAfterShare?: (args: { channel: ShareChannel; context: ShareContext; txId?: string; imageId?: string }) => Promise<void> | void;
};

export default function ShareCenter({
  open,
  onOpenChange,
  payload,
  context = 'profile',
  txId,
  imageId,
  className,
  title = 'Share',
  onAfterShare,
}: ShareCenterProps) {
  const [busy, setBusy] = useState<null | string>(null);

  async function doShare(label: string, channel: ShareChannel) {
    setBusy(label);
    try {
      await shareVia(channel, payload, { context, txId, imageId });
      // Paylaşım tetiklendi → dışarıya haber ver (wallet address gibi bilgiler orada var)
      await onAfterShare?.({ channel, context, txId, imageId });
    } finally {
      setBusy(null);
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-w-md rounded-2xl ${className || ''}`}>
        <div className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Share2 className="w-5 h-5" /> {title}
          </DialogTitle>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button disabled={!!busy} onClick={() => doShare('x', 'x')} className="justify-start gap-2">
            <Twitter className="w-4 h-4" /> Post on X
          </Button>

          <Button disabled={!!busy} onClick={() => doShare('telegram', 'telegram')} className="justify-start gap-2">
            <Send className="w-4 h-4" /> Telegram
          </Button>

          <Button disabled={!!busy} onClick={() => doShare('whatsapp', 'whatsapp')} className="justify-start gap-2">
            <MessageSquare className="w-4 h-4" /> WhatsApp
          </Button>

          <Button disabled={!!busy} onClick={() => doShare('email', 'email')} className="justify-start gap-2">
            <Mail className="w-4 h-4" /> Email
          </Button>

          <Button
            disabled={!!busy}
            onClick={() => doShare('copy-link', 'copy-link')}
            variant="secondary"
            className="justify-start gap-2"
          >
            <LinkIcon className="w-4 h-4" /> Copy Link
          </Button>

          <Button
            disabled={!!busy || !payload.imageUrl}
            onClick={() => doShare('download-image', 'download-image')}
            variant="secondary"
            className="justify-start gap-2"
          >
            <Download className="w-4 h-4" /> Download Image
          </Button>

          <Button
            disabled={!!busy}
            onClick={() => doShare('system', 'system')}
            variant="ghost"
            className="col-span-2 justify-center"
          >
            Use system share
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
