//components/essays/EssayToc.tsx

type EssayTocProps = {
    items?: {
        id: string;
        title: string;
    }[];
};

export default function EssayToc({ items }: EssayTocProps) {
    if (!items || items.length === 0) return null;

    return (
        <aside className="hidden xl:block fixed right-8 top-32 w-56">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/30">
                On this essay
            </p>

            <nav className="mt-4 space-y-3">
                {items.map((item) => (
                    <a
                        key={item.id}
                        href={`#${item.id}`}
                        className="block text-sm leading-relaxed text-white/35 transition hover:text-cyan-200"
                    >
                        {item.title}
                    </a>
                ))}
            </nav>
        </aside>
    );
}