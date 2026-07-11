// app/lexicon/content/proof-of-value/metadata.ts

import type { LexiconMetadata } from "../../types";

const metadata: LexiconMetadata = {
    slug: "proof-of-value",
    title: "Proof of Value",

    shortDefinition:
        "A Levershare framework for producing structured, contextual evidence of meaningful contribution so that value may become more understandable, verifiable, recognizable, and capable of informing participation.",

    category: "Protocol",
    status: "Published",

    order: 7,
    featured: true,

    updatedAt: "2026-07-11",
    revision: "1.0.0",

    aliases: [
        "PoV",
        "Value Proof",
        "Contribution Proof Framework",
        "Proof of Meaningful Value",
    ],

    keywords: [
        "proof of value",
        "PoV",
        "value",
        "proof",
        "meaningful contribution",
        "evidence",
        "context",
        "verification",
        "recognition",
        "recognition gap",
        "economic participation",
        "human potential",
        "economic coordination",
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
            label:
                "Essay No. 04 — Every Economy Grows What It Chooses to Recognize",
            href: "/essays/every-economy-grows-what-it-chooses-to-recognize",
            type: "Essay",
        },
    ],

    description:
        "The foundational Levershare framework for producing structured and contextual evidence of meaningful contribution, improving how value may become visible, understandable, verifiable, recognizable, and connected with participation.",
};

export default metadata;