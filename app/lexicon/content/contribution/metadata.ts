// app/lexicon/content/contribution/metadata.ts

import type { LexiconMetadata } from "../../types";

const metadata: LexiconMetadata = {
    slug: "contribution",
    title: "Contribution",

    shortDefinition:
        "An action, capability, resource, insight, effort, or other form of participation that meaningfully supports the creation, improvement, coordination, or continuation of value.",

    category: "Foundations",
    status: "Published",

    order: 2,
    featured: true,

    updatedAt: "2026-07-11",
    revision: "1.0.3",

    aliases: ["Human Contribution", "Meaningful Contribution"],

    keywords: [
        "contribution",
        "meaningful contribution",
        "participation",
        "value creation",
        "Levershare",
    ],

    relatedConcepts: [
        {
            slug: "human-potential",
            title: "Human Potential",
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
        {
            slug: "discovery-infrastructure",
            title: "Discovery Infrastructure",
        },
    ],

    references: [
        {
            label: "Essay No. 01 — A Question Worth Asking",
            href: "/essays/a-question-worth-asking",
            type: "Essay",
        },
        {
            label: "Essay No. 03 — The Cost of Misalignment",
            href: "/essays/the-cost-of-misalignment",
            type: "Essay",
        },
    ],

    description:
        "A Levershare definition of contribution as meaningful participation in the creation, improvement, coordination, or continuation of value.",
};

export default metadata;