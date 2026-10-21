import type { FieldSpec } from "@/components/crud/schema";
import { APP_MAX_EXAMPLES, FLAVOR_MAX } from "@/lib/config-data";
import { LIMITS } from "@/lib/domain";

/**
 * Form + validation for public.ai_generation_examples. The flavor
 * suggestions and the prompt-chain choices are filled in per request
 * (withOptions); the server validates chain_id as an id and lets the
 * foreign key catch a chain that no longer exists.
 */
export const EXAMPLE_FIELDS: FieldSpec[] = [
  {
    name: "image_description",
    label: "Photo description",
    kind: "textarea",
    required: true,
    max: LIMITS.exampleDescription,
    rows: 3,
    wide: true,
    placeholder: "A golden retriever sits at a dinner table wearing a bib, staring at an empty plate.",
    help: "Written like step 1's output: what the photo shows.",
  },
  {
    name: "caption",
    label: "Caption",
    kind: "textarea",
    required: true,
    max: LIMITS.exampleCaption,
    rows: 2,
    wide: true,
    placeholder: "He has been told dinner is at six. It is 6:01. He has questions.",
    help: "A joke that works for that photo: the tone the AI should copy.",
  },
  {
    name: "flavor",
    label: "Flavor",
    kind: "combo",
    max: FLAVOR_MAX,
    placeholder: "deadpan",
    options: [],
    help: "Shown to the AI as a style label. Pick a mix flavor or type your own.",
  },
  {
    name: "chain_id",
    label: "Prompt chain",
    kind: "ref",
    options: [],
    emptyLabel: "All chains",
    help: "Leave on “All chains” to use it everywhere.",
  },
  {
    name: "is_active",
    label: "Active",
    kind: "checkbox",
    defaultValue: true,
    help: `The ${APP_MAX_EXAMPLES} newest active ones go to the joke step.`,
  },
];
