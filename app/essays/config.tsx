//app/essays/config.tsx

import { ComponentType } from "react";
import AQuestionWorthAsking from "./content/a-question-worth-asking";

export type Essay = {
  slug: string;
  no: string;
  part: string;
  title: string;
  status: "Published" | "Writing";
  updatedAt: string;
  words: number;
  summary: string;
  Content: ComponentType;
};

export const ESSAYS: Essay[] = [
  {
    slug: "a-question-worth-asking",
    no: "Essay No. 01 of ∞",
    part: "Part I — Foundations",
    title: "A Question Worth Asking",
    status: "Published",
    updatedAt: "2026-06-30",
    words: 560,
    summary:
      "A foundational introduction to the central question behind Levershare.",
    Content: AQuestionWorthAsking,
  },
];