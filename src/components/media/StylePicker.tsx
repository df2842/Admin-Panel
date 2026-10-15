"use client";

import { JOKE_STYLES, type JokeStyle } from "@/lib/joke-styles";

const KEYS = Object.keys(JOKE_STYLES) as JokeStyle[];

/** Chip selector for the kind of jokes Gemini should write. */
export default function StylePicker({
  value,
  onChange,
  disabled,
}: {
  value: JokeStyle;
  onChange: (style: JokeStyle) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Joke style" className="flex flex-wrap gap-2">
      {KEYS.map((key) => {
        const style = JOKE_STYLES[key];
        const selected = key === value;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(key)}
            className={`inline-flex h-10 items-center gap-1.5 rounded-full border-2 px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
              selected
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-card hover:border-primary hover:text-primary"
            }`}
          >
            <span aria-hidden>{style.emoji}</span> {style.label}
          </button>
        );
      })}
    </div>
  );
}
