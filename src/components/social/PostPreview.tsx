import { useState } from "react";
import { Linkedin, Facebook, Instagram, Twitter, Youtube, ThumbsUp, MessageCircle, Repeat2, Send, Heart, Bookmark, MoreHorizontal, Globe, BadgeCheck } from "lucide-react";

export type PreviewPlatform = "linkedin" | "facebook" | "instagram" | "twitter" | "youtube";

type Author = { name?: string; avatar_url?: string | null; headline?: string };
type Props = {
  hook: string;
  body: string;
  image_url?: string | null;
  document_filename?: string | null;
  author: Author;
  selectedPlatforms?: string[];
};

const PLATFORM_META: { id: PreviewPlatform; label: string; Icon: any; color: string }[] = [
  { id: "linkedin", label: "LinkedIn", Icon: Linkedin, color: "#1877F2" },
  { id: "facebook", label: "Facebook", Icon: Facebook, color: "#1877F2" },
  { id: "instagram", label: "Instagram", Icon: Instagram, color: "#d62976" },
  { id: "twitter", label: "X / Twitter", Icon: Twitter, color: "#000000" },
  { id: "youtube", label: "YouTube", Icon: Youtube, color: "#FF0000" },
];

function initials(name?: string) {
  if (!name) return "U";
  return name.trim().split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
}

function Avatar({ author, size = 40 }: { author: Author; size?: number }) {
  if (author.avatar_url) {
    return <img src={author.avatar_url} alt="" style={{ width: size, height: size }} className="rounded-full object-cover shrink-0" />;
  }
  return (
    <div style={{ width: size, height: size }} className="rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground flex items-center justify-center font-semibold text-sm shrink-0">
      {initials(author.name)}
    </div>
  );
}

function truncate(s: string, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** Combined hook + body, exactly how each platform shows the post text. */
function PostText({ hook, body, max, expandable = true }: { hook: string; body: string; max: number; expandable?: boolean }) {
  const text = [hook, body].filter(Boolean).join("\n\n");
  const [open, setOpen] = useState(false);
  if (!text) return <p className="text-xs text-muted-foreground italic">No text yet — start with a hook.</p>;
  const isLong = text.length > max;
  const shown = open || !isLong ? text : truncate(text, max);
  return (
    <div className="text-[13px] whitespace-pre-wrap leading-relaxed text-foreground">
      {shown}
      {isLong && expandable && (
        <button onClick={() => setOpen((o) => !o)} className="ml-1 text-muted-foreground hover:text-primary text-xs font-medium">
          {open ? "see less" : "…see more"}
        </button>
      )}
    </div>
  );
}

function MediaBlock({ image_url, document_filename, ratio = "square" }: { image_url?: string | null; document_filename?: string | null; ratio?: "square" | "portrait" | "video" | "auto" }) {
  if (document_filename && !image_url) {
    return (
      <div className="border-y border-border bg-muted/40 p-6 text-center text-xs text-muted-foreground">
        📄 PDF carousel · {document_filename}
      </div>
    );
  }
  if (!image_url) {
    return (
      <div className={`border-y border-dashed border-border bg-muted/20 flex items-center justify-center text-[11px] text-muted-foreground ${ratio === "video" ? "aspect-video" : ratio === "portrait" ? "aspect-[4/5]" : "aspect-square"}`}>
        No image yet — generate or upload one
      </div>
    );
  }
  const cls = ratio === "auto" ? "max-h-[420px] w-full object-contain bg-black/5"
    : ratio === "video" ? "aspect-video w-full object-cover"
    : ratio === "portrait" ? "aspect-[4/5] w-full object-cover"
    : "aspect-square w-full object-cover";
  return <img src={image_url} alt="" className={cls} />;
}

/* ─────────────── LinkedIn ─────────────── */
function LinkedInCard({ hook, body, image_url, document_filename, author }: Props) {
  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden shadow-sm">
      <div className="p-3 flex items-start gap-2">
        <Avatar author={author} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{author.name || "Your name"}</div>
          <div className="text-[11px] text-muted-foreground truncate">{author.headline || "Your headline · Now · 🌐"}</div>
        </div>
        <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="px-3 pb-3">
        <PostText hook={hook} body={body} max={210} />
      </div>
      <MediaBlock image_url={image_url} document_filename={document_filename} ratio="auto" />
      <div className="px-3 py-2 text-[11px] text-muted-foreground flex justify-between border-b border-border">
        <span>👍❤️💡 12</span><span>3 comments · 1 repost</span>
      </div>
      <div className="grid grid-cols-4 text-xs text-muted-foreground">
        {[
          { Ic: ThumbsUp, l: "Like" }, { Ic: MessageCircle, l: "Comment" },
          { Ic: Repeat2, l: "Repost" }, { Ic: Send, l: "Send" },
        ].map(({ Ic, l }) => (
          <button key={l} className="py-2 flex items-center justify-center gap-1.5 hover:bg-muted/50">
            <Ic className="w-4 h-4" /> {l}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────── Facebook ─────────────── */
function FacebookCard({ hook, body, image_url, author }: Props) {
  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden shadow-sm">
      <div className="p-3 flex items-start gap-2">
        <Avatar author={author} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{author.name || "Your Page"}</div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1">Just now · <Globe className="w-3 h-3" /></div>
        </div>
        <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="px-3 pb-3">
        <PostText hook={hook} body={body} max={280} />
      </div>
      <MediaBlock image_url={image_url} ratio="auto" />
      <div className="px-3 py-2 text-[11px] text-muted-foreground flex justify-between border-b border-border">
        <span>👍❤️ 24</span><span>5 comments · 2 shares</span>
      </div>
      <div className="grid grid-cols-3 text-xs text-muted-foreground">
        {[{ Ic: ThumbsUp, l: "Like" }, { Ic: MessageCircle, l: "Comment" }, { Ic: Send, l: "Share" }].map(({ Ic, l }) => (
          <button key={l} className="py-2 flex items-center justify-center gap-1.5 hover:bg-muted/50"><Ic className="w-4 h-4" /> {l}</button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────── Instagram ─────────────── */
function InstagramCard({ hook, body, image_url, author }: Props) {
  const caption = [hook, body].filter(Boolean).join(" ");
  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden shadow-sm">
      <div className="p-2.5 flex items-center gap-2">
        <div className="p-[2px] rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600">
          <div className="bg-background rounded-full p-[2px]">
            <Avatar author={author} size={32} />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold truncate flex items-center gap-1">
            {(author.name || "your.handle").toLowerCase().replace(/\s+/g, ".")} <BadgeCheck className="w-3 h-3 text-blue-500" />
          </div>
        </div>
        <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
      </div>
      <MediaBlock image_url={image_url} ratio="square" />
      <div className="p-2.5 space-y-1.5">
        <div className="flex items-center gap-3">
          <Heart className="w-5 h-5" /><MessageCircle className="w-5 h-5" /><Send className="w-5 h-5" />
          <div className="flex-1" /><Bookmark className="w-5 h-5" />
        </div>
        <div className="text-xs font-semibold">142 likes</div>
        <div className="text-xs">
          <span className="font-semibold mr-1">{(author.name || "you").toLowerCase().replace(/\s+/g, ".")}</span>
          {caption ? truncate(caption, 140) : <span className="text-muted-foreground italic">No caption yet</span>}
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Twitter / X ─────────────── */
function TwitterCard({ hook, body, image_url, author }: Props) {
  const text = [hook, body].filter(Boolean).join("\n\n");
  const limited = truncate(text, 280);
  const over = text.length > 280;
  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden shadow-sm">
      <div className="p-3 flex items-start gap-2.5">
        <Avatar author={author} />
        <div className="flex-1 min-w-0">
          <div className="text-sm flex items-center gap-1 truncate">
            <span className="font-semibold">{author.name || "Your name"}</span>
            <BadgeCheck className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-muted-foreground text-xs truncate">@{(author.name || "you").toLowerCase().replace(/\s+/g, "")} · now</span>
          </div>
          <div className="text-[14px] whitespace-pre-wrap leading-snug mt-1">
            {limited || <span className="text-muted-foreground italic">No text yet</span>}
          </div>
          {over && <div className="mt-1 text-[11px] text-destructive">Over 280 chars by {text.length - 280} — will be truncated.</div>}
          {image_url && <img src={image_url} alt="" className="mt-2 rounded-2xl border border-border max-h-[360px] w-full object-cover" />}
          <div className="mt-2 flex items-center justify-between text-muted-foreground max-w-[320px] text-xs">
            <span className="flex items-center gap-1"><MessageCircle className="w-4 h-4" /> 8</span>
            <span className="flex items-center gap-1"><Repeat2 className="w-4 h-4" /> 3</span>
            <span className="flex items-center gap-1"><Heart className="w-4 h-4" /> 42</span>
            <span className="flex items-center gap-1"><Send className="w-4 h-4" /></span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── YouTube (Community / Short) ─────────────── */
function YouTubeCard({ hook, body, image_url, author }: Props) {
  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden shadow-sm">
      <div className="relative">
        <MediaBlock image_url={image_url} ratio="video" />
        {hook && (
          <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent text-white text-sm font-semibold line-clamp-2">
            {hook}
          </div>
        )}
      </div>
      <div className="p-3 flex items-start gap-2.5">
        <Avatar author={author} size={36} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium line-clamp-2">{hook || "Your video title"}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {author.name || "Your channel"} · 0 views · just now
          </div>
          {body && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-3 whitespace-pre-wrap">{body}</p>}
        </div>
      </div>
    </div>
  );
}

export function PostPreview(props: Props) {
  // Default to first selected platform if any, else linkedin
  const sel = (props.selectedPlatforms ?? []).find((p) => PLATFORM_META.some((m) => m.id === p)) as PreviewPlatform | undefined;
  const [active, setActive] = useState<PreviewPlatform>(sel ?? "linkedin");

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 p-1 bg-muted/60 rounded-lg mb-3 overflow-x-auto">
        {PLATFORM_META.map(({ id, label, Icon, color }) => {
          const on = active === id;
          const inSel = (props.selectedPlatforms ?? []).includes(id);
          return (
            <button
              key={id}
              onClick={() => setActive(id)}
              className={`flex-1 min-w-fit text-[11px] px-2 py-1.5 rounded-md inline-flex items-center justify-center gap-1.5 transition-colors ${
                on ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
              }`}
              title={label}
            >
              <Icon className="w-3.5 h-3.5" style={{ color: on ? color : undefined }} />
              <span className="hidden sm:inline">{label.split(" ")[0]}</span>
              {inSel && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-auto rounded-xl bg-muted/30 p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium mb-2 px-1">
          Live preview · {PLATFORM_META.find((p) => p.id === active)?.label}
        </div>
        {active === "linkedin" && <LinkedInCard {...props} />}
        {active === "facebook" && <FacebookCard {...props} />}
        {active === "instagram" && <InstagramCard {...props} />}
        {active === "twitter" && <TwitterCard {...props} />}
        {active === "youtube" && <YouTubeCard {...props} />}

        <div className="mt-3 text-[10px] text-muted-foreground px-1 leading-relaxed">
          Preview is approximate — exact rendering depends on the platform. Character soft-limits:
          LinkedIn 210 (truncates), Facebook 280, Instagram caption 2,200, X 280, YouTube title 100.
        </div>
      </div>
    </div>
  );
}
