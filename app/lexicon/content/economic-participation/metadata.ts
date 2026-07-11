// app/lexicon/content/economic-participation/metadata.ts

import type { LexiconMetadata } from "../../types";

const metadata: LexiconMetadata = {
    slug: "economic-participation",
    title: "Economic Participation",

    shortDefinition:
        "The ability of people to access economic systems, apply their capabilities, contribute meaningfully, influence activity, and participate in the value and opportunities those systems create.",

    category: "Economics",
    status: "Published",

    order: 6,
    featured: true,

    updatedAt: "2026-07-11",
    revision: "1.0.0",

    aliases: [
        "Participation in Economic Life",
        "Inclusive Economic Participation",
        "Contribution-Based Participation",
    ],

    keywords: [
        "economic participation",
        "participation",
        "economic opportunity",
        "contribution",
        "recognition",
        "access",
        "value creation",
        "value sharing",
        "employment",
        "entrepreneurship",
        "ownership",
        "human potential",
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
        {
            slug: "recognition-gap",
            title: "Recognition Gap",
        },
        {
            slug: "human-potential",
            title: "Human Potential",
        },
    ],

    references: [
        {
            label: "Essay No. 03 — The Cost of Misalignment",
            href: "/essays/the-cost-of-misalignment",
            type: "Essay",
        },
        {
            label:
                "Essay No. 04 — Every Economy Grows What It Chooses to Recognize",
            href: "/essays/every-economy-grows-what-it-chooses-to-recognize",
            type: "Essay",
        },
    ],

    description:
        "A Levershare concept describing the conditions through which people can access economic systems, express capabilities through meaningful contribution, influence activity, and participate in the opportunities and value those systems create.",
};

export default metadata;