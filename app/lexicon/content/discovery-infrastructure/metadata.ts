// app/lexicon/content/discovery-infrastructure/metadata.ts

import type { LexiconMetadata } from "../../types";

const metadata: LexiconMetadata = {
    slug: "discovery-infrastructure",
    title: "Discovery Infrastructure",

    shortDefinition:
        "A coordinated ecosystem of education, technology, guidance, identity, community, and opportunity designed to help more people discover, develop, express, and apply the potential they already possess.",

    category: "Foundations",
    status: "Published",

    order: 4,
    featured: true,

    updatedAt: "2026-07-11",
    revision: "1.0.3",

    aliases: [
        "Infrastructure for Self-Discovery",
        "Human Potential Infrastructure",
    ],

    keywords: [
        "discovery infrastructure",
        "human potential",
        "self-discovery",
        "education",
        "talent",
        "development",
        "technology",
        "economic participation",
        "Levershare",
    ],

    relatedConcepts: [
        {
            slug: "human-potential",
            title: "Human Potential",
        },
        {
            slug: "contribution",
            title: "Contribution",
        },
        {
            slug: "recognition",
            title: "Recognition",
        },
        {
            slug: "proof-of-value",
            title: "Proof of Value",
        },
        {
            slug: "recognition-gap",
            title: "Recognition Gap",
        },
        {
            slug: "economic-participation",
            title: "Economic Participation",
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
        "A foundational Levershare concept describing the coordinated conditions, technologies, educational pathways, and social mechanisms through which more people may discover, develop, express, and apply their human potential.",
};

export default metadata;