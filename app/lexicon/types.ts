// app/lexicon/types.ts

import type { ComponentType } from "react";

export type LexiconCategory =
    | "Foundations"
    | "Economics"
    | "Protocol"
    | "Technology"
    | "Governance";

export type LexiconStatus = "Published" | "Draft";

export type LexiconReference = {
    label: string;
    href: string;
    type: "Essay" | "Whitepaper" | "Lexicon" | "External";
};

export type RelatedConcept = {
    slug: string;
    title: string;
};

export type LexiconMetadata = {
    slug: string;
    title: string;
    shortDefinition: string;
    category: LexiconCategory;
    status: LexiconStatus;

    order: number;
    featured?: boolean;

    updatedAt: string;
    revision: string;

    aliases?: string[];
    keywords: string[];

    relatedConcepts?: RelatedConcept[];
    references?: LexiconReference[];

    description: string;
};

export type LexiconEntry = LexiconMetadata & {
    Content: ComponentType;
};