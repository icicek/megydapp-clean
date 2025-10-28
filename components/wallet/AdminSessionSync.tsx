'use client';

/**
 * ✅ Passive AdminSessionSync
 * No logout, no redirects, no wallet checks.
 * Leaves all security to middleware + HttpOnly session cookie.
 *
 * (This fixed admin drop-outs while navigating between pages.)
 */
export default function AdminSessionSync() {
  return null;
}
