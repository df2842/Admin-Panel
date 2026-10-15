"use client";

import { useState } from "react";
import { addCaption, deleteImage, generateCaptions } from "@/app/(admin)/media/actions";
import type { JokeStyle } from "@/lib/joke-styles";
import { AI_BATCH, CAPTION_MAX, MAX_JOKES_PER_PHOTO } from "@/lib/media";
import StylePicker from "./StylePicker";
import { ResultLine, useAction } from "./useAction";

/** Type a joke by hand and add it to the photo. */
export function AddCaptionForm({ imageId, jokeCount }: { imageId: string; jokeCount: number }) {
  const [text, setText] = useState("");
  const { pending, result, run, clear } = useAction();
  const full = jokeCount >= MAX_JOKES_PER_PHOTO;
  const clean = text.replace(/\s+/g, " ").trim();
  const valid = clean.length >= 1 && clean.length <= CAPTION_MAX;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !full)
          run(
            () => addCaption(imageId, text),
            () => setText(""),
          );
      }}
    >
      <label htmlFor="new-joke" className="block text-base font-bold">
        Add a joke manually
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="new-joke"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (result) clear();
          }}
          maxLength={CAPTION_MAX + 50}
          disabled={full}
          placeholder={full ? "This photo is full" : "Type a caption…"}
          className="input h-12 flex-1 text-base"
        />
        <button type="submit" disabled={!valid || full || pending} className="btn btn-primary btn-lg">
          {pending ? "Adding…" : "+ Add joke"}
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ResultLine result={result} />
        <span className={`ml-auto text-xs tabular-nums ${clean.length > CAPTION_MAX ? "text-danger" : "text-muted"}`}>
          {clean.length}/{CAPTION_MAX}
        </span>
      </div>
      {full && (
        <p className="text-sm text-muted">
          This photo has the maximum of {MAX_JOKES_PER_PHOTO} jokes. Delete one to add another.
        </p>
      )}
    </form>
  );
}

/** "Generate N more with AI" with a joke-style picker. */
export function GenerateCaptions({
  imageId,
  jokeCount,
  aiEnabled,
}: {
  imageId: string;
  jokeCount: number;
  aiEnabled: boolean;
}) {
  const [style, setStyle] = useState<JokeStyle>("mixed");
  const { pending, result, run } = useAction();
  const room = Math.max(0, MAX_JOKES_PER_PHOTO - jokeCount);
  const count = Math.min(AI_BATCH, room);

  if (!aiEnabled) {
    return (
      <div className="space-y-2">
        <p className="text-base font-bold">✨ Generate jokes with AI</p>
        <p className="rounded-xl bg-border/40 p-3 text-sm text-muted">
          AI generation is off because <code className="font-mono text-foreground">GEMINI_API_KEY</code> is not set on
          the server. Add it to the environment variables to turn this on. You can still add jokes manually.
        </p>
        <button type="button" disabled className="btn btn-primary btn-lg">
          ✨ Generate {AI_BATCH} more with AI
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-base font-bold">✨ Generate jokes with AI</p>
        <p className="text-sm text-muted">
          Gemini reads the description and writes new jokes, avoiding the ones already here.
        </p>
      </div>
      <StylePicker value={style} onChange={setStyle} disabled={pending || room === 0} />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || room === 0}
          onClick={() => run(() => generateCaptions(imageId, style))}
          className="btn btn-primary btn-lg"
        >
          {pending ? "Writing jokes…" : `✨ Generate ${count || AI_BATCH} more with AI`}
        </button>
        {pending && <span className="text-sm text-muted">This usually takes 5–15 seconds.</span>}
        <ResultLine result={result} />
      </div>
      {room === 0 && (
        <p className="text-sm text-muted">
          This photo has the maximum of {MAX_JOKES_PER_PHOTO} jokes. Delete some to generate more.
        </p>
      )}
    </div>
  );
}

/** Two-step "Delete photo": removes the row (jokes + votes cascade) and the file. */
export function DeleteImageButton({
  imageId,
  jokeCount,
  voteCount,
}: {
  imageId: string;
  jokeCount: number;
  voteCount: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const { pending, result, run } = useAction();

  if (!confirming) {
    return (
      <button type="button" className="btn btn-danger btn-lg" onClick={() => setConfirming(true)}>
        🗑️ Delete photo
      </button>
    );
  }

  return (
    <div role="alertdialog" aria-label="Confirm delete" className="card space-y-3 border-danger/50 p-4">
      <p className="text-sm font-semibold">
        Delete this photo, its {jokeCount} joke{jokeCount === 1 ? "" : "s"} and {voteCount} vote
        {voteCount === 1 ? "" : "s"}? This can&apos;t be undone.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          className="btn btn-danger btn-lg"
          onClick={() => run(() => deleteImage(imageId))}
        >
          {pending ? "Deleting…" : "Yes, delete everything"}
        </button>
        <button
          type="button"
          disabled={pending}
          className="btn btn-secondary btn-lg"
          onClick={() => setConfirming(false)}
        >
          Cancel
        </button>
      </div>
      <ResultLine result={result} />
    </div>
  );
}
