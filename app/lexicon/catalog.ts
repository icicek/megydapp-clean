// app/lexicon/catalog.ts

import type { LexiconEntry } from "./types";

import * as HumanPotential from "./content/human-potential";
import * as Contribution from "./content/contribution";
import * as Recognition from "./content/recognition";

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
].sort((a, b) => a.order - b.order);

export default LEXICON;