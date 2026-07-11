// app/lexicon/catalog.ts

import type { LexiconEntry } from "./types";

import * as HumanPotential from "./content/human-potential";
import * as Contribution from "./content/contribution";
import * as Recognition from "./content/recognition";
import * as DiscoveryInfrastructure from "./content/discovery-infrastructure";
import * as RecognitionGap from "./content/recognition-gap";
import * as EconomicParticipation from "./content/economic-participation";

const LEXICON: LexiconEntry[] = [
    {
        ...HumanPotential.metadata,
        Content: HumanPotential.Content,
    },
    {
        ...Contribution.metadata,
        Content: Contribution.Content,
    },
    {
        ...Recognition.metadata,
        Content: Recognition.Content,
    },
    {
        ...DiscoveryInfrastructure.metadata,
        Content: DiscoveryInfrastructure.Content,
    },
    {
        ...RecognitionGap.metadata,
        Content: RecognitionGap.Content,
    },
    {
        ...EconomicParticipation.metadata,
        Content: EconomicParticipation.Content,
    },
].sort((a, b) => a.order - b.order);

export default LEXICON;