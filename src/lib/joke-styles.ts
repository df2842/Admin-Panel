/**
 * Joke styles a user can pick before generating captions. Kept in its own
 * module (no server imports) so client components can render the picker.
 */
export const JOKE_STYLES = {
  mixed: {
    label: "Mixed bag",
    emoji: "🎲",
    prompt:
      "Mix styles: one deadpan, one pun or wordplay, one absurd escalation, one painfully relatable.",
  },
  dad: {
    label: "Dad jokes",
    emoji: "🧔",
    prompt: "Every caption is a groan-worthy dad joke or pun, proudly corny.",
  },
  sarcastic: {
    label: "Dry sarcasm",
    emoji: "🙄",
    prompt: "Every caption is dry, deadpan sarcasm delivered with total confidence.",
  },
  wholesome: {
    label: "Wholesome",
    emoji: "🥹",
    prompt: "Every caption is warm and wholesome but still genuinely funny, never mean.",
  },
  absurd: {
    label: "Absurd",
    emoji: "🦄",
    prompt: "Every caption escalates into surreal, absurd territory with a straight face.",
  },
  internet: {
    label: "Internet brain",
    emoji: "📱",
    prompt:
      "Every caption sounds like a viral post: 'me when', 'nobody:', POV or relatable-group-chat energy.",
  },
} as const;

export type JokeStyle = keyof typeof JOKE_STYLES;

export function parseStyle(value: unknown): JokeStyle {
  return typeof value === "string" && Object.hasOwn(JOKE_STYLES, value) ? (value as JokeStyle) : "mixed";
}

/** Short, readable model name for the UI, e.g. "Gemini 3.5 Flash-Lite". */
export function prettyModel(model: string | null | undefined): string {
  if (!model) return "Gemini";
  return model
    .replace(/^gemini-/, "Gemini ")
    .replace(/-flash-lite/, " Flash-Lite")
    .replace(/-flash/, " Flash")
    .replace(/-latest$/, "")
    .replace(/^Gemini flash-lite$/i, "Gemini Flash-Lite")
    .trim();
}
