// components/wallet/isMobile.ts
export const isMobile = () => {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
    return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Windows Phone/i.test(ua);
  };
  
  export const isInAppBrowser = () => {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent || '';
    // basit in-app browser tespiti (Instagram, Facebook, Twitter vb.)
    return /Instagram|FBAN|FBAV|Twitter|Line|Messenger|WhatsApp|Chrome\/[0-9]+ Mobile/i.test(ua);
  };
  