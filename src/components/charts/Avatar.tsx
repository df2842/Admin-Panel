import type { Person } from "@/lib/stats";

/** Profile photo, or an initial when there's no avatar (or no profile at all). */
export default function Avatar({ person, size = 40 }: { person: Person; size?: number }) {
  if (person.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={person.avatarUrl}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        loading="lazy"
        className="shrink-0 rounded-full bg-border object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const initial = person.known ? person.name.trim().charAt(0).toUpperCase() || "?" : "?";
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full bg-primary/15 font-semibold text-primary"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  );
}
