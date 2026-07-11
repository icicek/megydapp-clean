// app/lexicon/content/recognition-gap/metadata.ts

import type { LexiconMetadata } from "../../types";

const metadata: LexiconMetadata = {
    slug: "recognition-gap",
    title: "Recognition Gap",

    shortDefinition:
        "The distance between the value a person creates and the portion of that value that becomes visible, acknowledged, connected to opportunity, or reflected in an economic outcome.",

    category: "Foundations",
    status: "Published",

    order: 5,
    featured: true,

    updatedAt: "2026-07-11",
    revision: "1.0.1",

    aliases: [
        "Contribution Recognition Gap",
        "Value Recognition Gap",
        "Invisible Contribution Gap",
    ],

    keywords: [
        "recognition gap",
        "recognition",
        "contribution",
        "human potential",
        "invisible contribution",
        "unrecognized value",
        "visibility",
        "opportunity",
        "economic participation",
        "economic outcome",
        "Levershare",
    ],

    relatedConcepts: [
        {
            slug: "recognition",
            title: "Recognition",
        },
        {
            slug: "contribution",
            title: "Contribution",
        },
        {
            slug: "economic-participation",
            title: "Economic Participation",
        },
        {
            slug: "human-potential",
            title: "Human Potential",
        },
        {
            slug: "discovery-infrastructure",
            title: "Discovery Infrastructure",
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
        "A foundational Levershare concept describing the distance between meaningful contribution and the portion of that contribution that becomes visible, recognized, connected to opportunity, or translated into economic participation.",
};

export default metadata;