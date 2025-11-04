// components/share/open.ts
// Pure helpers — no window/document at module scope

export function openInNewTab(url: string): void {
    if (typeof window === 'undefined') return;
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      // ignore
    }
  }
  
  export function navigateSameTab(url: string): void {
    if (typeof window === 'undefined') return;
    try {
      window.location.href = url;
    } catch {
      // ignore
    }
  }
  