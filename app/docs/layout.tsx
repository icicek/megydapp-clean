// app/docs/layout.tsx
'use client';

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOC_SECTIONS } from "./config";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // aktif slug
  const activeSlug = useMemo(() => {
    const m = pathname?.match(/\/docs\/([^/]+)/);
    return m?.[1] ?? null;
  }, [pathname]);

  // route değişince drawer’ı kapat
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // drawer açıkken body scroll kilitle
  useEffect(() => {
    if (open) {
      document.documentElement.style.overflow = "hidden";
    } else {
      document.documentElement.style.overflow = "";
    }
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="min-h-screen bg-[#090d15] text-white">
      {/* Top bar (mobile) */}
      <div className="md:hidden sticky top-0 z-40 bg-[#0b0f18]/90 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            aria-label="Open contents"
            onClick={() => setOpen(true)}
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-white/10 hover:bg-white/5"
          >
            {/* hamburger */}
            <span className="inline-block w-4 h-0.5 bg-white mb-1.5" />
            <span className="inline-block w-4 h-0.5 bg-white mb-1.5" />
            <span className="inline-block w-4 h-0.5 bg-white" />
          </button>
          <div className="text-sm text-white/70">
            <Link href="/" className="underline">Coincarnation</Link> · Whitepaper
          </div>
          <div className="w-9" />
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 md:px-6 py-6 md:py-10 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">
        {/* Sidebar (desktop static) */}
        <aside className="hidden md:block md:sticky md:top-6 h-max rounded-2xl border border-white/10 bg-[#0b0f18] p-4">
          <h2 className="text-sm font-semibold text-white/80 mb-3">
            Whitepaper – Contents
          </h2>
          <nav className="space-y-1">
            {DOC_SECTIONS.map((s) => {
              const active = s.slug === activeSlug;
              return (
                <Link
                  key={s.slug}
                  href={`/docs/${s.slug}`}
                  className={
                    "block rounded-md px-3 py-2 text-sm " +
                    (active
                      ? "bg-white/10 text-white"
                      : "text-white/80 hover:bg-white/5 hover:text-white")
                  }
                >
                  {s.title}
                </Link>
              );
            })}
          </nav>

          {/* Sidebar footer (desktop) */}
          <div className="mt-4 text-xs text-white/60">
            {/* Print first */}
            <Link
              href="/docs/print"
              className="group inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 hover:bg-white/5 transition"
            >
              <span className="text-base leading-none">🖨️</span>
              <span>Print / PDF view</span>
            </Link>

            {/* separator */}
            <div className="my-3 border-t border-white/10" />

            {/* Back to Home (last, subtle) */}
            <Link
              href="/"
              className="group inline-flex items-center gap-1.5 text-white/60 hover:text-white transition"
            >
              <span className="-ml-0.5">←</span>
              <span>Back to Home</span>
            </Link>
          </div>
        </aside>

        {/* Main content */}
        <main>{children}</main>
      </div>

      {/* Mobile Drawer + Scrim */}
      <div
        className={
          "md:hidden fixed inset-0 z-50 transition-opacity " +
          (open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none")
        }
        aria-hidden={!open}
        onClick={() => setOpen(false)}
      >
        {/* scrim */}
        <div className="absolute inset-0 bg-black/60" />

        {/* drawer panel */}
        <div
          className={
            "absolute left-0 top-0 h-full w-[80%] max-w-[320px] bg-[#0b0f18] border-r border-white/10 " +
            "transition-transform duration-300 " +
            (open ? "translate-x-0" : "-translate-x-full")
          }
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Whitepaper contents"
        >
          <div className="p-4 flex items-center justify-between border-b border-white/10">
            <div className="text-sm font-semibold">Contents</div>
            <button
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-white/10 hover:bg-white/5"
            >
              ✕
            </button>
          </div>

          <nav className="p-2">
            {DOC_SECTIONS.map((s) => {
              const active = s.slug === activeSlug;
              return (
                <Link
                  key={s.slug}
                  href={`/docs/${s.slug}`}
                  className={
                    "block rounded-md px-3 py-2 text-sm " +
                    (active
                      ? "bg-white/10 text-white"
                      : "text-white/80 hover:bg-white/5 hover:text-white")
                  }
                >
                  {s.title}
                </Link>
              );
            })}
          </nav>

          {/* Drawer footer (mobile) */}
          <div className="mt-auto p-4 text-xs text-white/60 border-t border-white/10 space-y-2">
            {/* Print first */}
            <Link
              href="/docs/print"
              onClick={() => setOpen(false)}
              className="group flex items-center justify-between rounded-md border border-white/10 px-3 py-2 hover:bg-white/5 transition"
            >
              <span className="inline-flex items-center gap-1.5">
                <span className="text-base leading-none">🖨️</span>
                <span>Print / PDF view</span>
              </span>
              <span className="opacity-60 group-hover:opacity-100">↗</span>
            </Link>

            {/* Back to Home (last, subtle) */}
            <Link
              href="/"
              onClick={() => setOpen(false)}
              className="group inline-flex items-center gap-1.5 text-white/60 hover:text-white transition"
            >
              <span>←</span>
              <span>Back to Home</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
