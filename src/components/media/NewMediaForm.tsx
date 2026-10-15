"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { JokeStyle } from "@/lib/joke-styles";
import { AI_BATCH, CAPTION_MAX, DESCRIPTION_MAX, MAX_MANUAL_JOKES, MAX_UPLOAD_BYTES } from "@/lib/media";
import StylePicker from "./StylePicker";

type Mode = "ai" | "manual";
type Phase = "idle" | "preparing" | "uploading" | "processing" | "done";
const PHASES: Phase[] = ["preparing", "uploading", "processing", "done"];

/** Files bigger than this are likely to freeze the tab while decoding. */
const MAX_PICK_BYTES = 40 * 1024 * 1024;

/**
 * Downscales to a JPEG (longest edge <= 1600px) so uploads are fast and the
 * model gets a reasonable image. GIFs become a JPEG of their first frame.
 */
async function shrink(file: File, maxEdge = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Your browser couldn't open this image. Try a JPEG, PNG, WebP or GIF.");
  });
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn't process this image.");
  ctx.fillStyle = "#ffffff"; // transparent PNG/GIF areas become white, not black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  if (!blob) throw new Error("Your browser couldn't process this image.");
  return blob;
}

type Reply = { status: number; data: { id?: unknown; error?: unknown } | null };

/** POSTs with XMLHttpRequest so we can show real upload progress. */
function postMedia(form: FormData, onProgress: (fraction: number) => void, onSent: () => void): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media");
    xhr.timeout = 90_000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.upload.onload = () => {
      onProgress(1);
      onSent();
    };
    xhr.onload = () => {
      let data: Reply["data"] = null;
      try {
        data = JSON.parse(xhr.responseText) as Reply["data"];
      } catch {
        data = null;
      }
      resolve({ status: xhr.status, data });
    };
    xhr.onerror = () => reject(new Error("Network error. Check your connection and try again."));
    xhr.ontimeout = () => reject(new Error("The server took too long to answer. Please try again."));
    xhr.send(form);
  });
}

function statusMessage(status: number): string {
  if (status === 401) return "Your session expired. Sign in again.";
  if (status === 403) return "Only superadmins can add media.";
  if (status === 413) return "The photo is too large. Try a smaller one.";
  if (status === 504) return "The server timed out. Try again, or use manual mode.";
  return `Upload failed (error ${status}).`;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export default function NewMediaForm({ aiEnabled }: { aiEnabled: boolean }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<Mode>(aiEnabled ? "ai" : "manual");
  const [style, setStyle] = useState<JokeStyle>("mixed");
  const [description, setDescription] = useState("");
  const [jokes, setJokes] = useState<string[]>(["", "", ""]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Free the old preview URL whenever it changes, and on unmount.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  // Seconds counter while the server works (AI can take a few seconds).
  useEffect(() => {
    if (phase !== "processing" || error) return;
    const started = performance.now();
    const id = setInterval(() => setElapsed(Math.floor((performance.now() - started) / 1000)), 500);
    return () => clearInterval(id);
  }, [phase, error]);

  const busy = !error && phase !== "idle";

  const pick = (f: File | undefined | null) => {
    if (!f || busy) return;
    if (f.type && !f.type.startsWith("image/")) {
      setError("That file isn't an image. Use a JPEG, PNG, WebP or GIF.");
      setPhase("idle");
      return;
    }
    if (f.size > MAX_PICK_BYTES) {
      setError("That file is over 40 MB. Pick a smaller photo.");
      setPhase("idle");
      return;
    }
    setError(null);
    setPhase("idle");
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const descriptionText = clean(description);
  const jokeTexts = jokes.map(clean).filter(Boolean);
  const jokeTooLong = jokes.some((j) => clean(j).length > CAPTION_MAX);
  const manualReady = descriptionText.length >= 1 && descriptionText.length <= DESCRIPTION_MAX && !jokeTooLong;
  const ready = !!file && (mode === "ai" ? aiEnabled : manualReady);

  const submit = async () => {
    if (!file || !ready || busy) return;
    setError(null);
    setProgress(0);
    setElapsed(0);
    setPhase("preparing");
    try {
      const blob = await shrink(file);
      if (blob.size > MAX_UPLOAD_BYTES) throw new Error("Even after shrinking, this photo is over 6 MB.");

      const form = new FormData();
      form.append("file", blob, `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`);
      form.append("mode", mode);
      if (mode === "ai") {
        form.append("style", style);
      } else {
        form.append("description", descriptionText);
        for (const j of jokeTexts) form.append("caption", j);
      }

      setPhase("uploading");
      const reply = await postMedia(form, setProgress, () => setPhase("processing"));
      const id = reply.data?.id;
      if (reply.status !== 201 || typeof id !== "string") {
        const message = reply.data?.error;
        throw new Error(typeof message === "string" && message ? message : statusMessage(reply.status));
      }
      setPhase("done");
      router.push(`/media/${id}?created=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  const steps: { key: Phase; label: string; detail: string }[] = [
    { key: "preparing", label: "Preparing the photo", detail: "Shrinking to a JPEG, 1600px max" },
    {
      key: "uploading",
      label: "Uploading",
      detail: phase === "uploading" ? `${Math.round(progress * 100)}%` : "Sending it to the server",
    },
    {
      key: "processing",
      label: mode === "ai" ? "Gemini is describing it and writing jokes" : "Saving the photo and jokes",
      detail:
        phase === "processing" && !error
          ? `${elapsed}s${mode === "ai" ? " · usually 5–20 seconds" : ""}`
          : mode === "ai"
            ? `Two model calls, then ${AI_BATCH} jokes are saved`
            : "Storage upload and database rows",
    },
    { key: "done", label: "Done", detail: "Opening the photo page" },
  ];
  const current = PHASES.indexOf(phase);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Step 1: photo */}
      <section className="card space-y-4 p-4 sm:p-6" aria-labelledby="step-photo">
        <h2 id="step-photo" className="text-lg font-bold">
          1. Photo
        </h2>
        <label
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files?.[0]);
          }}
          className={`relative grid min-h-72 cursor-pointer place-items-center overflow-hidden rounded-2xl border-4 border-dashed transition focus-within:border-primary ${
            dragging ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/60"
          } ${busy ? "pointer-events-none opacity-80" : ""}`}
        >
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = ""; // allow re-picking the same file
            }}
          />
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Selected photo preview" className="max-h-[28rem] w-full object-contain" />
          ) : (
            <div className="p-8 text-center">
              <p className="text-5xl" aria-hidden>
                📷
              </p>
              <p className="mt-3 text-lg font-semibold">Drop a photo here</p>
              <p className="mt-1 text-sm text-muted">or click to choose · JPEG, PNG, WebP or GIF</p>
            </div>
          )}
        </label>
        {file && (
          <p className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
            <span className="min-w-0 truncate">
              {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
            </span>
            <span>Click the photo to change it</span>
          </p>
        )}
      </section>

      {/* Step 2: jokes, Step 3: create */}
      <section className="card space-y-5 p-4 sm:p-6" aria-labelledby="step-jokes">
        <h2 id="step-jokes" className="text-lg font-bold">
          2. Jokes
        </h2>

        <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">Who writes the jokes?</legend>
          <ModeOption
            checked={mode === "ai"}
            disabled={!aiEnabled}
            onSelect={() => setMode("ai")}
            title="✨ AI writes them"
            detail={
              aiEnabled
                ? `Gemini describes the photo and writes ${AI_BATCH} jokes.`
                : "Off: GEMINI_API_KEY is not set on the server."
            }
          />
          <ModeOption
            checked={mode === "manual"}
            onSelect={() => setMode("manual")}
            title="✍️ I'll write them"
            detail={`Type a description and up to ${MAX_MANUAL_JOKES} jokes.`}
          />
        </fieldset>

        {mode === "ai" ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold">Joke style</p>
            <StylePicker value={style} onChange={setStyle} disabled={busy} />
          </div>
        ) : (
          <fieldset disabled={busy} className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <label htmlFor="new-description" className="text-sm font-semibold">
                  Description <span className="text-danger">*</span>
                </label>
                <span
                  className={`text-xs tabular-nums ${descriptionText.length > DESCRIPTION_MAX ? "text-danger" : "text-muted"}`}
                >
                  {descriptionText.length}/{DESCRIPTION_MAX}
                </span>
              </div>
              <textarea
                id="new-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={DESCRIPTION_MAX + 200}
                placeholder="What's in the photo? The AI uses this later to write more jokes."
                className="input h-auto resize-y py-2"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold">
                Jokes <span className="font-normal text-muted">(optional, up to {MAX_MANUAL_JOKES})</span>
              </p>
              {jokes.map((joke, i) => {
                const tooLong = clean(joke).length > CAPTION_MAX;
                return (
                  <div key={i} className="flex gap-2">
                    <label htmlFor={`new-joke-${i}`} className="sr-only">
                      Joke {i + 1}
                    </label>
                    <input
                      id={`new-joke-${i}`}
                      value={joke}
                      onChange={(e) => setJokes((all) => all.map((j, k) => (k === i ? e.target.value : j)))}
                      maxLength={CAPTION_MAX + 50}
                      placeholder={`Joke ${i + 1}`}
                      aria-invalid={tooLong || undefined}
                      className={`input h-11 flex-1 ${tooLong ? "border-danger" : ""}`}
                    />
                    {jokes.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove joke ${i + 1}`}
                        className="btn btn-ghost h-11 w-11 px-0"
                        onClick={() => setJokes((all) => all.filter((_, k) => k !== i))}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
              {jokeTooLong && <p className="text-sm text-danger">Each joke can be at most {CAPTION_MAX} characters.</p>}
              {jokes.length < MAX_MANUAL_JOKES && (
                <button type="button" className="btn btn-secondary" onClick={() => setJokes((all) => [...all, ""])}>
                  + Add another joke
                </button>
              )}
            </div>
          </fieldset>
        )}

        <div className="space-y-3 border-t border-border pt-5">
          <button type="button" onClick={submit} disabled={!ready || busy} className="btn btn-primary btn-lg w-full">
            {busy ? "Working…" : error ? "Try again" : mode === "ai" ? "✨ Upload & write jokes" : "Upload photo"}
          </button>
          {!file && <p className="text-center text-sm text-muted">Choose a photo first.</p>}
          {file && mode === "manual" && !descriptionText && (
            <p className="text-center text-sm text-muted">Add a description to continue.</p>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-xl border-2 border-danger/40 bg-danger/10 p-3 text-sm font-semibold text-danger"
            >
              {error}
            </div>
          )}

          {phase !== "idle" && (
            <ol className="space-y-3 rounded-2xl bg-background p-4" aria-label="Progress">
              {steps.map((s, i) => {
                const failed = !!error && i === current;
                const complete = i < current || (phase === "done" && i === current);
                const active = i === current && !failed && !complete;
                return (
                  <li key={s.key} className="flex items-center gap-3">
                    <span
                      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${
                        failed
                          ? "bg-danger text-white"
                          : complete
                            ? "bg-primary text-primary-foreground"
                            : active
                              ? "border-2 border-primary text-primary"
                              : "border-2 border-border text-muted"
                      }`}
                      aria-hidden
                    >
                      {failed ? (
                        "✕"
                      ) : complete ? (
                        "✓"
                      ) : active ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      ) : (
                        i + 1
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-semibold ${active || complete || failed ? "" : "text-muted"}`}>
                        {s.label}
                      </p>
                      <p className="text-xs text-muted">{s.detail}</p>
                      {active && s.key === "uploading" && (
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${Math.round(progress * 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}

function ModeOption({
  checked,
  disabled,
  onSelect,
  title,
  detail,
}: {
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <label
      className={`flex cursor-pointer flex-col gap-1 rounded-2xl border-2 p-4 transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary ${
        checked ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/60"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <input
        type="radio"
        name="joke-mode"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
      />
      <span className="text-base font-bold">{title}</span>
      <span className="text-sm text-muted">{detail}</span>
    </label>
  );
}
