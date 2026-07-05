//app/essays/catalog.ts

import { EssayEntry } from "./types";
import * as Essay01 from "./content/a-question-worth-asking";

const ESSAYS: EssayEntry[] = [
    {
        ...Essay01.metadata,
        Content: Essay01.Content,
    },
];

export default ESSAYS;