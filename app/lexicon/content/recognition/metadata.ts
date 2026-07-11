// app/lexicon/content/recognition/metadata.ts

import type { LexiconMetadata } from "../../types";

const metadata: LexiconMetadata = {
    slug: "recognition",
    title: "Recognition",

    shortDefinition:
        "The capacity of a system or community to meaningfully identify, understand, record, coordinate, and respond to contribution.",

    category: "Foundations",
    status: "Published",

    order: 3,
    featured: true,

    updatedAt: "2026-07-10",
    revision: "1.0.0",

    aliases: ["Contribution Recognition", "Recognition Capacity"],

    keywords: [
        "recognition",
        "recognition capacity",
        "contribution",
        "coordination",
        "participation",
        "Levershare",
    ],

    relatedConcepts: [
        {
            slug: "contribution",
            title: "Contribution",
        },
        {
            slug: "human-potential",
            title: "Human Potential",
        },
    ],

    references: [
        {
            label:
                "Essay No. 04 — Every Economy Grows What It Chooses to Recognize",
            href: "/essays/every-economy-grows-what-it-chooses-to-recognize",
            type: "Essay",
        },
    ],

    description:
        "A foundational Levershare concept describing how systems identify, understand, record, coordinate, and respond to meaningful contribution.",
};

export default metadata;