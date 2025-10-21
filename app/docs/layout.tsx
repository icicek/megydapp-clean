// app/docs/layout.tsx
import Link from "next/link";
import { DOC_SECTIONS } from "./config";
import { ReactNode } from "react";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#090d15] text-white">
      <div className="mx-auto max-w-6xl px-4 md:px-6 py-10 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">
        {/* Sidebar */}
        <aside className="md:sticky md:top-6 h-max rounded-2xl border border-white/10 bg-[#0b0f18] p-4">
          <h2 className="text-sm font-semibold text-white/80 mb-3">
            Whitepaper – Contents
          </h2>
          <nav className="space-y-1">
            {DOC_SECTIONS.map((s) => (
              <Link
                key={s.slug}
                href={`/docs/${s.slug}`}
                className="block rounded-md px-3 py-2 text-sm text-white/80 hover:bg-white/5 hover:text-white"
              >
                {s.title}
              </Link>
            ))}
          </nav>
          <div className="mt-4 text-xs text-white/50">
            <Link href="/" className="underline">
              ← Back to Home
            </Link>
          </div>
        </aside>

        {/* Main content */}
        <main>{children}</main>
      </div>
    </div>
  );
}
