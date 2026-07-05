// app/essays/types.tsx

import { ComponentType } from "react";

export type EssayStatus = "Published" | "Writing" | "Draft";

export type EssayMetadata = {
    slug: string;
    number: number;
    label: string;
    part: number;
    series: string;

    title: string;
    subtitle: string;

    status: EssayStatus;
    publishedAt?: string;
    updatedAt: string;
    revision: string;

    words: number;

    summary: string;
    excerpt: string;
    description: string;
    keywords: string[];

    categories: string[];
    tags: string[];
    theme: string;

    featured?: boolean;
    cover?: string;
    ogImage?: string;
};

export type EssayEntry = EssayMetadata & {
    Content: ComponentType;
};