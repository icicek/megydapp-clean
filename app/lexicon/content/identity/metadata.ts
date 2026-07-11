// app/lexicon/content/identity/metadata.ts

import type { LexiconMetadata } from "../../types";

const metadata: LexiconMetadata = {
    slug: "identity",
    title: "Identity",

    shortDefinition:
        "The persistent context through which a person’s actions, contributions, relationships, recognition, and participation can be understood across time.",

    category: "Foundations",
    status: "Published",

    order: 8,
    featured: true,

    updatedAt: "2026-07-11",
    revision: "1.0.0",

    aliases: [
        "Persistent Identity",
        "Participant Identity",
        "Identity Context",
        "Contribution Identity",
    ],

    keywords: [
        "identity",
        "persistent identity",
        "participant identity",
        "identity context",
        "digital identity",
        "contribution history",
        "recognition",
        "participation",
        "multiple wallets",
        "unified participation",
        "proof of value",
        "Levershare",
    ],

    relatedConcepts: [
        {
            slug: "contribution",
            title: "Contribution",
        },
        {
            slug: "proof-of-value",
            title: "Proof of Value",
        },
        {
            slug: "recognition",
            title: "Recognition",
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
            label: "Whitepaper — Identity Layer",
            href: "/docs/identity-layer",
            type: "Whitepaper",
        },
    ],

    description:
        "A foundational Levershare concept describing the persistent context through which actions, contributions, relationships, recognition, and participation can remain connected to a person across time and across multiple points of interaction.",
};

export default metadata;