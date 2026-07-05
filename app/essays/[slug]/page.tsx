//app/essays/[slug]/page.tsx

import { notFound } from "next/navigation";
import ESSAYS from "../catalog";
import EssayLayout from "@/components/essays/EssayLayout";

type EssayPageProps = {
    params: Promise<{
        slug: string;
    }>;
};

export function generateStaticParams() {
    return ESSAYS.map((essay) => ({
        slug: essay.slug,
    }));
}

export async function generateMetadata({ params }: EssayPageProps) {
    const { slug } = await params;
    const essay = ESSAYS.find((item) => item.slug === slug);

    if (!essay) {
        return {
            title: "Essay — Levershare",
        };
    }

    return {
        title: `${essay.title} — Levershare Essays`,
        description: essay.description,
        keywords: essay.keywords,
        openGraph: {
            title: essay.title,
            description: essay.description,
            type: "article",
            publishedTime: essay.publishedAt,
            modifiedTime: essay.updatedAt,
        },
    };
}

export default async function EssayPage({ params }: EssayPageProps) {
    const { slug } = await params;

    const essayIndex = ESSAYS.findIndex((item) => item.slug === slug);
    const essay = ESSAYS[essayIndex];

    if (!essay) notFound();

    const previousEssay = ESSAYS[essayIndex - 1];
    const nextEssay = ESSAYS[essayIndex + 1];

    const Content = essay.Content;

    return (
        <EssayLayout
            essay={essay}
            previousEssay={previousEssay}
            nextEssay={nextEssay}
        >
            <Content />
        </EssayLayout>
    );
}