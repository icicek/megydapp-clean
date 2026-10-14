'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export const REFERRAL_SESSION_KEY = 'coincarnation:referral';
export const REFERRAL_PERSISTENT_KEY = 'coincarnation:referral:persistent';
export const REFERRAL_DISMISSED_KEY = 'coincarnation:referral:dismissed';

export const REFERRAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type StoredReferral = {
  code: string;
  savedAt: number;
};

function isValidReferralFormat(code: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(code);
}

export function getPersistedReferral(): StoredReferral | null {
  try {
    const raw = localStorage.getItem(REFERRAL_PERSISTENT_KEY);

    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
      localStorage.removeItem(REFERRAL_PERSISTENT_KEY);
      return null;
    }

    const stored = parsed as Partial<StoredReferral>;

    if (
      typeof stored.code !== 'string' ||
      !isValidReferralFormat(stored.code) ||
      typeof stored.savedAt !== 'number' ||
      !Number.isFinite(stored.savedAt)
    ) {
      localStorage.removeItem(REFERRAL_PERSISTENT_KEY);
      return null;
    }

    const age = Date.now() - stored.savedAt;

    if (age < 0 || age >= REFERRAL_TTL_MS) {
      localStorage.removeItem(REFERRAL_PERSISTENT_KEY);
      return null;
    }

    return {
      code: stored.code,
      savedAt: stored.savedAt,
    };
  } catch {
    return null;
  }
}

export function clearStoredReferral(): void {
  try {
    localStorage.removeItem(REFERRAL_PERSISTENT_KEY);
    sessionStorage.removeItem(REFERRAL_SESSION_KEY);
  } catch {
    // Storage erişimi engellenmiş olabilir.
  }
}

export default function ReferralSessionCapture() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const referral = searchParams.get('r')?.trim();

    // Yeni referral bağlantısı geldiyse önceki kodun yerine kaydet.
    if (referral && isValidReferralFormat(referral)) {
      try {
        const dismissedCode = sessionStorage.getItem(
          REFERRAL_DISMISSED_KEY
        );

        // Kullanıcının bu oturumda bilerek sildiği aynı kodu
        // URL üzerinden yeniden kaydetme.
        if (
          dismissedCode &&
          dismissedCode.toLowerCase() === referral.toLowerCase()
        ) {
          return;
        }

        // Farklı bir referral bağlantısı bilinçli olarak açılmışsa
        // önceki reddetme tercihini temizle.
        if (dismissedCode) {
          sessionStorage.removeItem(REFERRAL_DISMISSED_KEY);
        }
      } catch {
        // Storage erişimi engellense bile Coincarnation çalışmalı.
      }

      const stored: StoredReferral = {
        code: referral,
        savedAt: Date.now(),
      };

      try {
        localStorage.setItem(
          REFERRAL_PERSISTENT_KEY,
          JSON.stringify(stored)
        );
      } catch {
        // Local storage engellense bile session çalışabilir.
      }

      try {
        sessionStorage.setItem(REFERRAL_SESSION_KEY, referral);
      } catch {
        // Storage erişimi engellenmiş olabilir.
      }

      return;
    }

    // URL'de yeni kod yoksa 30 günlük kaydı kontrol et.
    const persisted = getPersistedReferral();

    if (persisted) {
      try {
        sessionStorage.setItem(
          REFERRAL_SESSION_KEY,
          persisted.code
        );
      } catch {
        // Storage erişimi engellenmiş olabilir.
      }
    } else {
      // Süresi dolmuş eski session kodunun tekrar kullanılmasını engelle.
      try {
        sessionStorage.removeItem(REFERRAL_SESSION_KEY);
      } catch {
        // Storage erişimi engellenmiş olabilir.
      }
    }
  }, [pathname, searchParams]);

  return null;
}