import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, ExternalLink, MapPin, Building2, Users, TrendingUp, Heart, MessageCircle, Share2, Eye, Sparkles, Camera } from "lucide-react";
import { toast } from "sonner";
import {
  getSelfProfile, getSelfPostsAnalytics, listSelfSnapshots, recordSelfSnapshot,
  analyzeSelfProfile, scrapeMyLastPosts, getWriterSettings, upsertWriterSettings,
  type SelfProfile, type SelfPostsAnalytics, type SelfSnapshot,
} from "@/lib/social-queries";
import { getMyLinkedInConnection, type SocialConnectionMeta } from "@/lib/social-connections";
import EngagementAnalytics from "./EngagementAnalytics";

function num(n?: number | null) {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function initials(name?: string | null) {
  return (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
}

function Sparkline({ data, color = "hsl(var(--primary))" }: { data: number[]; color?: string }) {
  if (!data.length) return <div className="h-10 text-xs text-muted-foreground">No data</div>;
  const w = 200, h = 40;
  const max = Math.max(1, ...data);
  const min = Math.min(...data);
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / Math.max(1, max - min)) * h * 0.9 - 2).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10" preserveAspectRatio="none">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={pts} />
    </svg>
  );
}

function Bars({ data, getValue, label }: { data: any[]; getValue: (d: any) => number; label: (d: any) => string }) {
  const max = Math.max(1, ...data.map(getValue));
  return (
    <div className="flex items-end gap-1 h-24">
      {data.map((d, i) => {
        const v = getValue(d);
        const h = max ? Math.max(2, (v / max) * 100) : 2;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group" title={`${label(d)}: ${v}`}>
            <div className="w-full rounded-sm bg-primary/70 group-hover:bg-primary transition-colors" style={{ height: `${h}%` }} />
          </div>
        );
      })}
    </div>
  );
}

function Metric({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground"><Icon className="w-3.5 h-3.5" />{label}</div>
      <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export default function LinkedInAnalyticsTab() {
  const [profile, setProfile] = useState<SelfProfile | null>(null);
  const [posts, setPosts] = useState<SelfPostsAnalytics | null>(null);
  const [snaps, setSnaps] = useState<SelfSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [linkedinConn, setLinkedinConn] = useState<SocialConnectionMeta | null>(null);
  const [profileUrl, setProfileUrl] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [p, a, s, conn, ws] = await Promise.all([
        getSelfProfile(), getSelfPostsAnalytics(), listSelfSnapshots(),
        getMyLinkedInConnection().catch(() => null),
        getWriterSettings().catch(() => null),
      ]);
      setProfile(p); setPosts(a); setSnaps(s);
      setLinkedinConn(conn);
      setProfileUrl((p?.profile_url || (ws as any)?.linkedin_url || "").toString());
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load analytics");
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function refreshProfile() {
    const url = profileUrl.trim();
    if (!url && !profile?.profile_url) {
      toast.error("Add your LinkedIn profile URL first");
      return;
    }
    setRefreshing(true);
    try {
      if (url) {
        try { await upsertWriterSettings({ linkedin_url: url }); } catch { /* non-fatal */ }
      }
      const { error } = await analyzeSelfProfile(url || undefined);
      if (error) throw error;
      // Pull followers + post metrics via Apify right after.
      try { await scrapeMyLastPosts(50); } catch (e: any) { console.warn("scrape after analyze failed", e?.message); }
      await recordSelfSnapshot();
      toast.success("Profile refreshed and snapshot saved");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to refresh profile");
    } finally { setRefreshing(false); }
  }

  async function scrapePosts() {
    setScraping(true);
    try {
      const { error } = await scrapeMyLastPosts(50);
      if (error) throw error;
      await recordSelfSnapshot();
      toast.success("Posts refreshed");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to refresh posts");
    } finally { setScraping(false); }
  }

  async function snapshotNow() {
    try {
      await recordSelfSnapshot();
      toast.success("Snapshot saved");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save snapshot");
    }
  }

  const followers = profile?.num_followers ?? profile?.followers ?? null;
  const followerSeries = useMemo(() => snaps.map((s) => s.followers ?? 0), [snaps]);
  const followerGrowth = useMemo(() => {
    if (snaps.length < 2 || followers == null) return null;
    const prev = snaps[snaps.length - 2]?.followers;
    if (prev == null) return null;
    return followers - prev;
  }, [snaps, followers]);

  if (loading && !profile) {
    return <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Self profile header */}
      <Card className="p-5">
        {!profile ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
            <div>
              <h3 className="font-semibold">Connect your LinkedIn profile</h3>
              <p className="text-sm text-muted-foreground">Analyze your own profile to see follower growth, post performance and engagement.</p>
            </div>
            <Button onClick={refreshProfile} disabled={refreshing} className="gap-1.5">
              {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Analyze my LinkedIn
            </Button>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-display font-bold text-xl shrink-0">
              {initials(profile.display_name || profile.full_name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-semibold truncate">{profile.display_name || profile.full_name || profile.username}</h3>
                {profile.profile_url && (
                  <a href={profile.profile_url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                    View on LinkedIn <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              {profile.title && <div className="text-sm text-foreground/80">{profile.title}</div>}
              <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                {profile.company && <span className="inline-flex items-center gap-1"><Building2 className="w-3 h-3" />{profile.company}</span>}
                {(profile.location || profile.country) && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{profile.location || profile.country}</span>}
                {profile.last_scraped_at && <span>Last scraped {new Date(profile.last_scraped_at).toLocaleDateString()}</span>}
              </div>
              {profile.info_summary && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{profile.info_summary}</p>}
            </div>
            <div className="flex flex-col gap-2 md:items-end">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold tabular-nums">{num(followers)}</span>
                <span className="text-xs text-muted-foreground">followers</span>
                {followerGrowth != null && followerGrowth !== 0 && (
                  <Badge variant="outline" className={`text-[10px] ${followerGrowth > 0 ? "border-emerald-500/40 text-emerald-600 bg-emerald-500/10" : "border-rose-500/40 text-rose-600 bg-rose-500/10"}`}>
                    {followerGrowth > 0 ? "+" : ""}{followerGrowth} since last
                  </Badge>
                )}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={refreshProfile} disabled={refreshing}>
                  {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh profile
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={scrapePosts} disabled={scraping}>
                  {scraping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />} Refresh posts
                </Button>
                <Button size="sm" variant="ghost" className="gap-1.5 h-8 text-xs" onClick={snapshotNow}>
                  <TrendingUp className="w-3.5 h-3.5" /> Save snapshot
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Follower growth */}
      {profile && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold inline-flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Follower growth</h3>
            <span className="text-xs text-muted-foreground">{snaps.length} snapshot{snaps.length === 1 ? "" : "s"}</span>
          </div>
          {snaps.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No snapshots yet. Refresh your profile or save a snapshot to start tracking growth weekly.
            </div>
          ) : (
            <>
              <Sparkline data={followerSeries} />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{new Date(snaps[0].captured_at).toLocaleDateString()}</span>
                <span>{new Date(snaps[snaps.length - 1].captured_at).toLocaleDateString()}</span>
              </div>
            </>
          )}
        </Card>
      )}

      {/* Posts performance */}
      {posts && (
        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-semibold inline-flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" /> Your post performance</h3>
            <span className="text-xs text-muted-foreground">{posts.count} post{posts.count === 1 ? "" : "s"} analyzed{posts.latestPostedAt ? ` · latest ${new Date(posts.latestPostedAt).toLocaleDateString()}` : ""}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Metric icon={Heart} label="Total likes" value={num(posts.totals.likes)} sub={`avg ${posts.averages.likes}/post`} />
            <Metric icon={MessageCircle} label="Total comments" value={num(posts.totals.comments)} sub={`avg ${posts.averages.comments}/post`} />
            <Metric icon={Share2} label="Total shares" value={num(posts.totals.shares)} sub={`avg ${posts.averages.shares}/post`} />
            <Metric icon={Eye} label="Total views" value={num(posts.totals.views)} sub={`avg ${posts.averages.views}/post`} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">Posts per month</span>
                <span className="text-muted-foreground tabular-nums">{posts.byMonth.reduce((a, b) => a + b.posts, 0)} total</span>
              </div>
              <Bars data={posts.byMonth} getValue={(d) => d.posts} label={(d) => d.month} />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{posts.byMonth[0]?.month}</span>
                <span>{posts.byMonth[posts.byMonth.length - 1]?.month}</span>
              </div>
            </div>
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">Engagement per month</span>
                <span className="text-muted-foreground tabular-nums">likes + comments + shares</span>
              </div>
              <Bars data={posts.byMonth} getValue={(d) => d.likes + d.comments + d.shares} label={(d) => d.month} />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{posts.byMonth[0]?.month}</span>
                <span>{posts.byMonth[posts.byMonth.length - 1]?.month}</span>
              </div>
            </div>
          </div>

          {posts.top.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top performing posts</h4>
              <div className="space-y-2">
                {posts.top.map((p) => (
                  <div key={p.id} className="rounded-lg border border-border p-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm line-clamp-2">{p.post_text || "(no text)"}</p>
                      <div className="flex flex-wrap gap-3 mt-1.5 text-[11px] text-muted-foreground">
                        {p.posted_at && <span>{new Date(p.posted_at).toLocaleDateString()}</span>}
                        <span className="inline-flex items-center gap-1"><Heart className="w-3 h-3" />{num(p.likes)}</span>
                        <span className="inline-flex items-center gap-1"><MessageCircle className="w-3 h-3" />{num(p.comments)}</span>
                        <span className="inline-flex items-center gap-1"><Share2 className="w-3 h-3" />{num(p.shares)}</span>
                        {p.views ? <span className="inline-flex items-center gap-1"><Eye className="w-3 h-3" />{num(p.views)}</span> : null}
                      </div>
                    </div>
                    {p.post_url && (
                      <a href={p.post_url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 hover:underline shrink-0">
                        Open <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Commenting analytics (moved from Engagement Feed) */}
      <EngagementAnalytics />
    </div>
  );
}