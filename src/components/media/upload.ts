/**
 * Browser-side upload helpers shared by "New media" and "Replace photo".
 * Client-only: they use canvas, createImageBitmap and XMLHttpRequest.
 */

/** Files bigger than this are likely to freeze the tab while decoding. */
export const MAX_PICK_BYTES = 40 * 1024 * 1024;

/** Checks a picked file before decoding it. Returns an error message or null. */
export function pickError(file: File): string | null {
  if (file.type && !file.type.startsWith("image/")) return "That file isn't an image. Use a JPEG, PNG, WebP or GIF.";
  if (file.size > MAX_PICK_BYTES) return "That file is over 40 MB. Pick a smaller photo.";
  return null;
}

/**
 * Downscales to a JPEG (longest edge <= 1600px) so uploads are fast and the
 * model gets a reasonable image. GIFs become a JPEG of their first frame.
 */
export async function shrinkImage(file: File, maxEdge = 1600): Promise<Blob> {
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

/** "holiday.png" -> "holiday.jpg" (the shrunk upload is always a JPEG). */
export function jpegName(file: File): string {
  return `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`;
}

export type UploadReply<T> = { status: number; data: (T & { error?: unknown }) | null };

/** Sends a form with XMLHttpRequest so we can show real upload progress. */
export function sendForm<T>(
  method: "POST" | "PUT",
  url: string,
  form: FormData,
  onProgress: (fraction: number) => void,
  onSent: () => void,
): Promise<UploadReply<T>> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.timeout = 90_000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.upload.onload = () => {
      onProgress(1);
      onSent();
    };
    xhr.onload = () => {
      let data: UploadReply<T>["data"] = null;
      try {
        data = JSON.parse(xhr.responseText) as UploadReply<T>["data"];
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

/** Fallback message when the server didn't send a JSON error. */
export function uploadStatusMessage(status: number): string {
  if (status === 401) return "Your session expired. Sign in again.";
  if (status === 403) return "Only superadmins can change media.";
  if (status === 404) return "That photo no longer exists.";
  if (status === 413) return "The photo is too large. Try a smaller one.";
  if (status === 504) return "The server timed out. Please try again.";
  return `Upload failed (error ${status}).`;
}
