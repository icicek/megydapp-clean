// app/lexicon/content/human-potential/metadata.ts

import type { LexiconMetadata } from "../../types";

const metadata: LexiconMetadata = {
    slug: "human-potential",
    title: "Human Potential",

    shortDefinition:
        "The capacity within a person to discover, develop, and express talents, abilities, knowledge, experience, creativity, and other meaningful forms of human capability.",

    category: "Foundations",
    status: "Published",

    order: 1,
    featured: true,

    updatedAt: "2026-07-10",
    revision: "1.0.0",

    aliases: ["Potential", "Individual Potential"],

    keywords: [
        "human potential",
        "talent",
        "self-discovery",
        "development",
        "self-actualization",
        "Levershare",
    ],

    relatedConcepts: [
        {
            slug: "contribution",
            title: "Contribution",
        },
        {
            slug: "recognition",
            title: "Recognition",
        },
    ],

    references: [
        {
            label: "Essay No. 02 — When Human Potential Becomes Visible",
            href: "/essays/when-human-potential-becomes-visible",
            type: "Essay",
        },
    ],

    description:
        "A foundational Levershare concept describing the capacity already present within people to discover, develop, express, and apply their unique abilities.",
};

export default metadata;