// app/essays/catalog.ts

import { EssayEntry } from "./types";
import * as Essay01 from "./content/a-question-worth-asking";
import * as Essay02 from "./content/when-human-potential-becomes-visible";
import * as Essay03 from "./content/the-cost-of-misalignment";
import * as Essay04 from "./content/every-economy-grows-what-it-chooses-to-recognize";

const ESSAYS: EssayEntry[] = [
    {
        ...Essay01.metadata,
        Content: Essay01.Content,
    },
    {
        ...Essay02.metadata,
        Content: Essay02.Content,
    },
    {
        ...Essay03.metadata,
        Content: Essay03.Content,
    },
    {
        ...Essay04.metadata,
        Content: Essay04.Content,
    },
];

export default ESSAYS;