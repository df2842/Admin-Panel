"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { MAX_UPLOAD_BYTES, type ActionResult, type ReplacePhotoReply } from "@/lib/media";
import { jpegName, pickError, sendForm, shrinkImage, uploadStatusMessage } from "./upload";
import { ResultLine } from "./useAction";

type Phase = "idle" | "preparing" | "uploading" | "saving";

/**
 * "Replace photo": swaps the image file of this photo for a new upload while
 * keeping its jokes, votes and link. The browser shrinks the new image to a
 * JPEG (1600px max), then PUT /api/media/[id] stores it, updates the row and
 * deletes the old file. Two steps: open the panel and pick a file, then
 * confirm with "Replace photo".
 */
export default function ReplacePhoto({ imageId, aiEnabled }: { imageId: string; aiEnabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // On by default: the old description no longer matches the new photo.
  const [redescribe, setRedescribe] = useState(aiEnabled);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ActionResult | null>(null);

  const openRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const opened = useRef(false);
  const ids = useId();

  // Free the old preview URL whenever it changes, and on unmount.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  // Focus the file picker when the panel opens, and the button again when it closes.
  useEffect(() => {
    if (open) {
      opened.current = true;
      inputRef.current?.focus();
    } else if (opened.current) {
      openRef.current?.focus();
    }
  }, [open]);

  const busy = phase !== "idle";

  const reset = () => {
    setFile(null);
    setPreview(null);
    setDragging(false);
    setRedescribe(aiEnabled);
    setProgress(0);
  };

  const close = () => {
    if (busy) return;
    reset();
    setOpen(false);
  };

  const pick = (f: File | undefined | null) => {
    if (!f || busy) return;
    const problem = pickError(f);
    if (problem) {
      setResult({ ok: false, error: problem });
      return;
    }
    setResult(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const submit = async () => {
    if (!file || busy) return;
    setResult(null);
    setProgress(0);
    setPhase("preparing");
    try {
      const blob = await shrinkImage(file);
      if (blob.size > MAX_UPLOAD_BYTES) throw new Error("Even after shrinking, this photo is over 6 MB.");

      const form = new FormData();
      form.append("file", blob, jpegName(file));
      if (aiEnabled && redescribe) form.append("redescribe", "1");

      setPhase("uploading");
      const reply = await sendForm<Partial<ReplacePhotoReply>>(
        "PUT",
        `/api/media/${encodeURIComponent(imageId)}`,
        form,
        setProgress,
        () => setPhase("saving"),
      );
      if (reply.status !== 200 || reply.data?.ok !== true) {
        const message = reply.data?.error;
        throw new Error(typeof message === "string" && message ? message : uploadStatusMessage(reply.status));
      }

      const parts = [
        "Photo replaced.",
        reply.data.described ? "Gemini wrote a new description." : "The description still describes the old photo.",
      ];
      if (reply.data.oldFileRemoved === false) parts.push("(The old file couldn't be deleted from storage.)");
      setResult({ ok: true, message: parts.join(" ") });
      setPhase("idle");
      reset();
      setOpen(false);
      router.refresh();
    } catch (err) {
      setPhase("idle");
      setResult({ ok: false, error: err instanceof Error ? err.message : "Something went wrong. Please try again." });
    }
  };

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          ref={openRef}
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setResult(null);
            setOpen(true);
          }}
        >
          🔄 Replace photo
        </button>
        <ResultLine result={result} />
      </div>
    );
  }

  const statusText =
    phase === "preparing"
      ? "Shrinking the photo…"
      : phase === "uploading"
        ? `Uploading… ${Math.round(progress * 100)}%`
        : phase === "saving"
          ? aiEnabled && redescribe
            ? "Gemini is describing the new photo… usually 3–10 seconds."
            : "Saving…"
          : null;

  return (
    <section
      aria-labelledby={`${ids}-title`}
      className="space-y-3"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) {
          e.stopPropagation();
          close();
        }
      }}
    >
      <div>
        <h2 id={`${ids}-title`} className="text-base font-bold">
          Replace photo
        </h2>
        <p className="text-sm text-muted">
          Upload a new image for this photo. Jokes, votes and the link stay the same. The old file is deleted.
        </p>
      </div>

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
        className={`relative grid min-h-40 cursor-pointer place-items-center overflow-hidden rounded-2xl border-4 border-dashed transition focus-within:border-primary ${
          dragging ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/60"
        } ${busy ? "pointer-events-none opacity-80" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          disabled={busy}
          aria-describedby={`${ids}-hint`}
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = ""; // allow re-picking the same file
          }}
        />
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="New photo preview" className="max-h-72 w-full object-contain" />
        ) : (
          <div className="p-6 text-center">
            <p className="text-4xl" aria-hidden>
              📷
            </p>
            <p className="mt-2 font-semibold">Choose the new photo</p>
            <p className="mt-1 text-sm text-muted">Click or drop a file here</p>
          </div>
        )}
      </label>
      <p id={`${ids}-hint`} className="text-xs text-muted">
        {file
          ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB · click the preview to pick another`
          : "JPEG, PNG, WebP or GIF. It's shrunk to a JPEG (1600px max) before upload."}
      </p>

      {aiEnabled && (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-border p-3 has-[:checked]:border-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
            checked={redescribe}
            disabled={busy}
            onChange={(e) => setRedescribe(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-semibold">✨ Re-describe with AI</span>
            <span className="block text-xs text-muted">
              Gemini writes a new description from the new photo. Existing jokes are kept.
            </span>
          </span>
        </label>
      )}

      {busy && statusText && (
        <div role="status" className="space-y-1.5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <span
              aria-hidden
              className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent"
            />
            {statusText}
          </p>
          {phase === "uploading" && (
            <div className="h-1.5 overflow-hidden rounded-full bg-border" aria-hidden>
              <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!file || busy} className="btn btn-primary btn-lg" onClick={submit}>
          {busy ? "Replacing…" : "Replace photo"}
        </button>
        <button type="button" disabled={busy} className="btn btn-secondary btn-lg" onClick={close}>
          Cancel
        </button>
      </div>
      {!file && !busy && <p className="text-sm text-muted">Choose a photo first.</p>}
      <ResultLine result={result} />
    </section>
  );
}
