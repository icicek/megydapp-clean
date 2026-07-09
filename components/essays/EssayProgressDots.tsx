//components/essays/EssayProgressDots.tsx

import Link from "next/link";
import { EssayEntry } from "@/app/essays/types";

type EssayProgressDotsProps = {
    essays: EssayEntry[];
    currentSlug: string;
};

export default function EssayProgressDots({
    essays,
    currentSlug,
}: EssayProgressDotsProps) {
    return (
        <div className="mt-8 flex items-center gap-2">
            {essays.map((essay) => {
                const isCurrent = essay.slug === currentSlug;
                const isPublished = essay.status === "Published";

                const dot = (
                    <span
                        className={
                            isCurrent
                                ? "block h-2.5 w-6 rounded-full bg-cyan-200"
                                : isPublished
                                    ? "block h-2.5 w-2.5 rounded-full bg-white/35 transition hover:bg-cyan-200/70"
                                    : "block h-2.5 w-2.5 rounded-full border border-white/20"
                        }
                        title={essay.title}
                    />
                );

                return isPublished ? (
                    <Link key={essay.slug} href={`/essays/${essay.slug}`}>
                        {dot}
                    </Link>
                ) : (
                    <span key={essay.slug} className="opacity-70">
                        {dot}
                    </span>
                );
            })}
        </div>
    );
}