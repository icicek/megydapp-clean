// utils/share/open.ts
export type OpenTarget = '_self' | '_blank' | 'popup';

export function openURL(url: string, target: OpenTarget = '_self') {
  if (target === '_self') {
    window.location.href = url;            // aynı sekmede aç
    return;
  }
  if (target === 'popup') {
    window.open(url, 'share', 'noopener,noreferrer,width=720,height=640');
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
