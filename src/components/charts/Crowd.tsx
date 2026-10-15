import type { DashboardStats, Person } from "@/lib/stats";
import { MIN_VOTES_FOR_AWARD } from "@/lib/stats";
import Avatar from "./Avatar";
import { percent, plural, signedDecimal } from "./chart-utils";

function AwardCard({
  emoji,
  title,
  person,
  value,
  detail,
  empty,
}: {
  emoji: string;
  title: string;
  person: Person | null;
  value: string;
  detail: string;
  empty: string;
}) {
  return (
    <article className="card flex min-w-0 flex-col gap-4 p-5">
      <h3 className="flex items-center gap-2 font-semibold">
        <span aria-hidden className="text-xl">
          {emoji}
        </span>
        {title}
      </h3>
      {person ? (
        <>
          <div className="flex min-w-0 items-center gap-3">
            <Avatar person={person} size={44} />
            <div className="min-w-0">
              <p className="truncate font-semibold">{person.name}</p>
              {person.email && person.email !== person.name ? (
                <p className="truncate text-xs text-muted">{person.email}</p>
              ) : !person.known ? (
                <p className="text-xs text-muted">No profile on file</p>
              ) : null}
            </div>
          </div>
          <div className="mt-auto">
            <p className="text-3xl font-semibold tracking-tight">{value}</p>
            <p className="mt-0.5 text-sm text-muted">{detail}</p>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted">{empty}</p>
      )}
    </article>
  );
}

/** Four "personality" awards: who votes how, and whose photos get laughs. */
export default function Crowd({ crowd }: { crowd: DashboardStats["crowd"] }) {
  const { generous, critic, mostActive, topUploader } = crowd;
  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AwardCard
          emoji="🤗"
          title="Most generous"
          person={generous?.person ?? null}
          value={generous ? `${percent(generous.upShare)} 👍` : ""}
          detail={generous ? `${plural(generous.upvotes, "upvote")} out of ${plural(generous.votes, "vote")}` : ""}
          empty="Nobody has handed out a 👍 yet."
        />
        <AwardCard
          emoji="🧐"
          title="Toughest critic"
          person={critic?.person ?? null}
          value={critic ? `${percent(1 - critic.upShare)} 👎` : ""}
          detail={critic ? `${plural(critic.downvotes, "downvote")} out of ${plural(critic.votes, "vote")}` : ""}
          empty="No downvotes yet. A very kind crowd."
        />
        <AwardCard
          emoji="🗳️"
          title="Most active voter"
          person={mostActive?.person ?? null}
          value={mostActive ? plural(mostActive.votes, "vote") : ""}
          detail={mostActive ? `${percent(mostActive.upShare)} of them upvotes` : ""}
          empty="No votes cast yet."
        />
        <AwardCard
          emoji="📸"
          title="Top uploader"
          person={topUploader?.person ?? null}
          value={topUploader ? `${signedDecimal(topUploader.netScore, 0)} net` : ""}
          detail={
            topUploader
              ? `${plural(topUploader.photos, "photo")} · ${plural(topUploader.jokes, "joke")} · ${plural(topUploader.votes, "vote")} received`
              : ""
          }
          empty="No photos uploaded yet."
        />
      </div>
      <p className="text-xs text-muted">
        {crowd.smallSample
          ? `Small sample: until two people have ${MIN_VOTES_FOR_AWARD}+ votes, every voter counts for the voting awards.`
          : `Voting awards count people with at least ${MIN_VOTES_FOR_AWARD} votes. Top uploader is ranked by the net score their photos' jokes received.`}
      </p>
    </div>
  );
}
