"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createClientProject,
  getMyUnreadCount,
  getPortalState,
  getProjectMessages,
  listMyProjects,
  markProjectReadByClient,
  registerClientProfile,
  sendClientMessage,
  uploadClientProjectImage,
} from "@/lib/actions/clientPortal";
import { ImageLightbox } from "@/components/workspace/ImageLightbox";
import { PortalChatWidget } from "./PortalChatWidget";
import { FuntiWordmark } from "@/components/site/FuntiWordmark";
import { useDict } from "@/components/site/LocaleProvider";
import type { ClientMessage, ClientProfile, ClientProject } from "@/lib/types";

type Stage = "loading" | "signed-out" | "sent-link" | "needs-profile" | "ready";

// Staged across the magic-link email round trip so a first-time visitor
// only ever fills in ONE form (name, email, what they need) instead of
// three separate screens (sign in → tell us about yourself → describe your
// project) before they can say anything to the studio. Best-effort: if
// storage is unavailable (private browsing) or they verify on a different
// device, CompleteSignUp below just falls back to asking for a name.
const PORTAL_DRAFT_KEY = "funti-portal-draft";

type PortalDraft = { name: string; description: string };

function savePortalDraft(draft: PortalDraft) {
  try {
    localStorage.setItem(PORTAL_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // ignore — CompleteSignUp's fallback form covers this
  }
}

function loadPortalDraft(): PortalDraft | null {
  try {
    const raw = localStorage.getItem(PORTAL_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PortalDraft>;
    if (typeof parsed.name === "string" && typeof parsed.description === "string") return parsed as PortalDraft;
    return null;
  } catch {
    return null;
  }
}

function clearPortalDraft() {
  try {
    localStorage.removeItem(PORTAL_DRAFT_KEY);
  } catch {
    // ignore
  }
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function PortalContent({ showcaseImages = [] }: { showcaseImages?: string[] }) {
  const { t } = useDict();
  const [stage, setStage] = useState<Stage>("loading");
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  // Set when CompleteSignUp auto-creates a project from the staged draft —
  // tells ProjectsDashboard which thread to jump straight into instead of
  // landing on an empty list right after all that setup.
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPortalState().then((state) => {
      if (cancelled) return;
      setStage(state.loggedIn ? (state.profile ? "ready" : "needs-profile") : "signed-out");
      setProfile(state.profile);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (stage !== "ready") return;
    getMyUnreadCount().then(setUnreadCount);
  }, [stage]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setStage("signed-out");
    setProfile(null);
  }

  return (
    <section className="site-container py-14" style={{ maxWidth: 1040 }}>
      <div className={`flex items-center gap-3 mb-8 ${stage === "ready" ? "justify-between" : "justify-center"}`}>
        <h1 className="text-3xl">
          Work With <FuntiWordmark />
        </h1>
        {stage === "ready" && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleSignOut}>
            {t.portal.signOut}
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm font-semibold mb-4" style={{ color: "var(--status-red)" }}>
          {error}
        </p>
      )}

      {stage === "loading" && (
        <p style={{ color: "var(--color-neutral-500)" }}>{t.portal.loading}</p>
      )}

      {stage === "signed-out" && (
        <div className="flex flex-col gap-7">
          <div className="text-center">
            <p className="text-xl font-bold mb-1">{t.portal.heroTitle}</p>
            <p style={{ color: "var(--color-neutral-600)" }}>{t.portal.heroBody}</p>
          </div>
          {showcaseImages.length > 0 && <ShowcaseStrip images={showcaseImages} />}
          <div className="flex flex-col lg:flex-row gap-4 justify-center items-center">
            <StartForm onSent={() => setStage("sent-link")} onError={setError} />
            <div className="w-full lg:max-w-[360px]">
              <PortalChatWidget />
            </div>
          </div>
          <HowItWorks />
        </div>
      )}

      {stage === "sent-link" && (
        <div className="card elev-sm p-6 max-w-[420px] mx-auto">
          <p className="font-bold mb-1">{t.portal.checkEmailTitle}</p>
          <p className="text-sm" style={{ color: "var(--color-neutral-600)" }}>
            {t.portal.checkEmailBody}
          </p>
        </div>
      )}

      {stage === "needs-profile" && (
        <CompleteSignUp
          onDone={(p, project) => {
            setProfile(p);
            setPendingProjectId(project?.id ?? null);
            setStage("ready");
          }}
          onError={setError}
        />
      )}

      {stage === "ready" && profile && (
        <ProjectsDashboard
          profile={profile}
          unreadCount={unreadCount}
          onUnreadChange={setUnreadCount}
          onError={setError}
          initialActiveProjectId={pendingProjectId}
        />
      )}
    </section>
  );
}

// A real taste of the work before asking for a brief — reusing the same
// cover images featured on the homepage's own project showcase, in the
// same curated order, so a first-time visitor isn't taking the studio's
// quality on faith. Purely decorative (no click-through) — the goal is
// "yes, this is the team I want", not a detour into browsing /du-an.
function shuffleImages(images: string[]): string[] {
  const result = images.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Slow, continuous right-to-left drift through every project's cover AND
// gallery images — "cho họ chiêm ngưỡng, từ từ thôi". Same loop technique as
// the homepage's PartnersMarquee (duplicate the row, animate 0 → -50%), and
// the same dimmed-overlay ImageLightbox used for chat images elsewhere on
// this page for the click-to-zoom.
function ShowcaseStrip({ images }: { images: string[] }) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // Shuffled once per visit, client-side — this page is statically
  // generated, so a server-side shuffle would freeze one order for every
  // visitor instead of feeling fresh each time.
  const [shuffled] = useState(() => shuffleImages(images));
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  if (reducedMotion) {
    return (
      <>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {shuffled.map((url) => (
            <button key={url} type="button" onClick={() => setLightboxUrl(url)} className="rounded-[10px] overflow-hidden flex-none">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="object-cover block" style={{ width: 160, height: 160 }} />
            </button>
          ))}
        </div>
        {lightboxUrl && <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
      </>
    );
  }

  // Duplicated so the track can travel from 0 to -50% and land back on an
  // identical frame — the loop is seamless because the two halves match.
  const loop = [...shuffled, ...shuffled];
  // Speed (px/s) stays roughly constant regardless of pool size — without
  // this, a studio with many more projects would see the same strip fly by
  // much faster instead of staying "từ từ".
  const durationSeconds = Math.max(40, shuffled.length * 5);

  return (
    <>
      <div
        className="overflow-hidden"
        style={{
          width: "100vw",
          marginLeft: "calc(50% - 50vw)",
          maskImage: "linear-gradient(90deg, transparent, black 6%, black 94%, transparent)",
          WebkitMaskImage: "linear-gradient(90deg, transparent, black 6%, black 94%, transparent)",
        }}
      >
        <div className="flex gap-3 w-max fk-image-marquee" style={{ animationDuration: `${durationSeconds}s` }}>
          {loop.map((url, i) => (
            <button key={url + i} type="button" onClick={() => setLightboxUrl(url)} className="rounded-[10px] overflow-hidden flex-none">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="object-cover block" style={{ width: 160, height: 160 }} />
            </button>
          ))}
        </div>
      </div>
      {lightboxUrl && <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </>
  );
}

// Sets expectations right where the anxiety actually is — "I just described
// my project to a form, now what?" A brief without this reads like sending
// something into a black hole, which is exactly the moment someone abandons
// the page instead of hitting submit.
function HowItWorks() {
  const { t } = useDict();
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
      {t.portal.howItWorks.map((step, i) => (
        <div key={step.title} className="flex flex-col gap-1">
          <span className="text-2xl" aria-hidden>
            {step.emoji}
          </span>
          <span className="font-bold text-sm">
            {i + 1}. {step.title}
          </span>
          <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
            {step.body}
          </span>
        </div>
      ))}
    </div>
  );
}

function StartForm({ onSent, onError }: { onSent: () => void; onError: (msg: string | null) => void }) {
  const { t } = useDict();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [description, setDescription] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !description.trim() || sending) return;
    setSending(true);
    onError(null);
    try {
      // Staged before the redirect, not after — signInWithOtp navigates
      // this tab away once the email link is clicked, so there's no later
      // point in this flow where writing to localStorage is still
      // guaranteed to run.
      savePortalDraft({ name: name.trim(), description: description.trim() });
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/cong-viec` },
      });
      if (error) throw error;
      onSent();
    } catch {
      onError(t.portal.sendLinkError);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card elev-sm p-6 max-w-[460px] w-full">
      <p className="text-sm mb-4" style={{ color: "var(--color-neutral-600)" }}>
        {t.portal.startFormIntro}
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          required
          className="input"
          placeholder={t.portal.namePlaceholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="email"
          required
          className="input"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <textarea
          required
          className="input"
          style={{ minHeight: 110, resize: "vertical" }}
          placeholder={t.portal.descriptionPlaceholder}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button type="submit" disabled={sending} className="btn btn-primary">
          {sending ? t.portal.sending : t.portal.sendLink}
        </button>
      </form>
    </div>
  );
}

// Lands here right after the magic-link click. If StartForm's draft made it
// into localStorage (same device, storage available), this finishes signup
// and creates the project from it with no further input — the visitor never
// re-types anything. Falls back to just asking for a name when there's no
// draft (a different device, private browsing, or the auto-setup itself
// failed) so nobody gets stuck with no way to continue.
function CompleteSignUp({
  onDone,
  onError,
}: {
  onDone: (profile: ClientProfile, project: ClientProject | null) => void;
  onError: (msg: string | null) => void;
}) {
  const { t } = useDict();
  const [draft] = useState(() => loadPortalDraft());
  const [autoRunning, setAutoRunning] = useState(!!draft);
  const [autoFailed, setAutoFailed] = useState(false);

  useEffect(() => {
    if (!draft) return;
    let cancelled = false;
    (async () => {
      try {
        const profile = await registerClientProfile({
          displayName: draft.name,
          country: "",
          avatarUrl: null,
          clientType: "individual",
        });
        const project = await createClientProject(draft.description, []);
        if (cancelled) return;
        clearPortalDraft();
        onDone(profile, project);
      } catch (err) {
        if (cancelled) return;
        onError(err instanceof Error ? err.message : t.portal.setupError);
        setAutoRunning(false);
        setAutoFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  if (autoRunning) {
    return (
      <div className="card elev-sm p-6 max-w-[420px] mx-auto">
        <p className="text-sm" style={{ color: "var(--color-neutral-600)" }}>
          {t.portal.settingUp}
        </p>
      </div>
    );
  }

  return (
    <div className="card elev-sm p-6 max-w-[420px] mx-auto">
      {autoFailed && (
        <p className="text-sm mb-4" style={{ color: "var(--color-neutral-600)" }}>
          {t.portal.autoSetupFailed}
        </p>
      )}
      <p className="font-bold mb-4">{t.portal.askName}</p>
      <NameOnlyForm onDone={(p) => onDone(p, null)} onError={onError} />
    </div>
  );
}

function NameOnlyForm({
  onDone,
  onError,
}: {
  onDone: (profile: ClientProfile) => void;
  onError: (msg: string | null) => void;
}) {
  const { t } = useDict();
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim() || saving) return;
    setSaving(true);
    onError(null);
    try {
      const profile = await registerClientProfile({ displayName, country: "", avatarUrl: null, clientType: "individual" });
      onDone(profile);
    } catch (err) {
      onError(err instanceof Error ? err.message : t.portal.saveProfileError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        required
        className="input"
        placeholder={t.portal.namePlaceholder}
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />
      <button type="submit" disabled={saving} className="btn btn-primary">
        {saving ? t.portal.saving : t.portal.continueBtn}
      </button>
    </form>
  );
}

function ProjectsDashboard({
  profile,
  unreadCount,
  onUnreadChange,
  onError,
  initialActiveProjectId,
}: {
  profile: ClientProfile;
  unreadCount: number;
  onUnreadChange: (n: number) => void;
  onError: (msg: string | null) => void;
  initialActiveProjectId?: string | null;
}) {
  const { t } = useDict();
  const [projects, setProjects] = useState<ClientProject[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  useEffect(() => {
    listMyProjects().then((list) => {
      setProjects(list);
      setLoadingList(false);
      // CompleteSignUp just created this one from the visitor's very first
      // message — open it directly instead of landing on the list they'd
      // have to click right back into.
      if (initialActiveProjectId && list.some((p) => p.id === initialActiveProjectId)) {
        setActiveId(initialActiveProjectId);
      } else if (list.length === 0) {
        setShowNewForm(true);
      }
    });
  }, [initialActiveProjectId]);

  const active = projects.find((p) => p.id === activeId) ?? null;

  function handleCreated(project: ClientProject) {
    setProjects((prev) => [project, ...prev]);
    setShowNewForm(false);
    setActiveId(project.id);
  }

  if (active) {
    return (
      <ProjectThread
        project={active}
        onBack={() => setActiveId(null)}
        onUnreadDelta={(delta) => onUnreadChange(Math.max(0, unreadCount + delta))}
        onError={onError}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center rounded-full overflow-hidden flex-none"
          style={{ width: 44, height: 44, background: "var(--color-accent-2-100)" }}
        >
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="font-bold" style={{ color: "var(--color-accent-2-800)" }}>
              {(profile.display_name || profile.email).charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-sm">{profile.display_name || profile.email}</span>
          <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
            {profile.country} · {profile.client_type === "business" ? t.portal.business : t.portal.individual}
          </span>
        </div>
        {unreadCount > 0 && (
          <span
            className="ml-auto flex items-center justify-center rounded-full font-bold flex-none"
            style={{ minWidth: 22, height: 22, padding: "0 6px", fontSize: 12, background: "var(--status-red)", color: "#fff" }}
          >
            {unreadCount}
          </span>
        )}
      </div>

      {!showNewForm && (
        <button type="button" className="btn btn-primary w-fit" onClick={() => setShowNewForm(true)}>
          {t.portal.newProject}
        </button>
      )}

      {showNewForm && (
        <NewProjectForm
          onCreated={handleCreated}
          onCancel={() => setShowNewForm(false)}
          canCancel={projects.length > 0}
          onError={onError}
        />
      )}

      {loadingList ? (
        <p style={{ color: "var(--color-neutral-500)" }}>{t.portal.loading}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActiveId(p.id)}
              className="card elev-sm p-4 text-left flex flex-col gap-1"
            >
              <p className="text-sm font-semibold line-clamp-2">{p.description}</p>
              <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
                {formatDate(p.last_message_at)}
                {p.status === "closed" ? t.portal.closedSuffix : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ImagePicker({
  images,
  onChange,
  onError,
}: {
  images: string[];
  onChange: (urls: string[]) => void;
  onError: (msg: string | null) => void;
}) {
  const { t } = useDict();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    onError(null);
    try {
      const uploaded = await Promise.all(
        files.map(async (file) => {
          const formData = new FormData();
          formData.set("file", file);
          return uploadClientProjectImage(formData);
        }),
      );
      onChange([...images, ...uploaded]);
    } catch (err) {
      onError(err instanceof Error ? err.message : t.portal.uploadError);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {images.map((url) => (
        <div key={url} className="relative rounded-[8px] overflow-hidden flex-none" style={{ width: 64, height: 64 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(images.filter((u) => u !== url))}
            className="absolute flex items-center justify-center rounded-full"
            style={{ top: 2, right: 2, width: 18, height: 18, background: "rgba(0,0,0,.6)", color: "#fff", fontSize: 10 }}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="flex items-center justify-center rounded-[8px] flex-none text-xs"
        style={{ width: 64, height: 64, border: "1.5px dashed var(--color-neutral-300)", color: "var(--color-neutral-500)" }}
      >
        {uploading ? "…" : t.portal.addImage}
      </button>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
    </div>
  );
}

function NewProjectForm({
  onCreated,
  onCancel,
  canCancel,
  onError,
}: {
  onCreated: (project: ClientProject) => void;
  onCancel: () => void;
  canCancel: boolean;
  onError: (msg: string | null) => void;
}) {
  const { t } = useDict();
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || saving) return;
    setSaving(true);
    onError(null);
    try {
      const project = await createClientProject(description, images);
      onCreated(project);
    } catch (err) {
      onError(err instanceof Error ? err.message : t.portal.submitProjectError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card elev-sm p-5 flex flex-col gap-3">
      <p className="font-bold text-sm">{t.portal.describeProject}</p>
      <textarea
        required
        className="input"
        style={{ minHeight: 110, resize: "vertical" }}
        placeholder={t.portal.descriptionPlaceholder}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <ImagePicker images={images} onChange={setImages} onError={onError} />
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? t.portal.submitting : t.portal.submitBtn}
        </button>
        {canCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {t.portal.cancel}
          </button>
        )}
      </div>
    </form>
  );
}

function ProjectThread({
  project,
  onBack,
  onUnreadDelta,
  onError,
}: {
  project: ClientProject;
  onBack: () => void;
  onUnreadDelta: (delta: number) => void;
  onError: (msg: string | null) => void;
}) {
  const { t } = useDict();
  const [messages, setMessages] = useState<ClientMessage[]>([]);
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    getProjectMessages(project.id).then((msgs) => {
      if (cancelled) return;
      setMessages(msgs);
      const unread = msgs.filter((m) => m.sender_type === "staff" && !m.read_by_client).length;
      if (unread > 0) {
        markProjectReadByClient(project.id).then(() => onUnreadDelta(-unread));
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`client-project-${project.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "client_messages", filter: `project_id=eq.${project.id}` },
        (payload) => {
          const row = payload.new as ClientMessage;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          if (row.sender_type === "staff") {
            markProjectReadByClient(project.id).then(() => onUnreadDelta(-1));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if ((!text.trim() && images.length === 0) || sending) return;
    setSending(true);
    onError(null);
    try {
      const sent = await sendClientMessage(project.id, text, images);
      setMessages((prev) => [...prev, sent]);
      setText("");
      setImages([]);
    } catch (err) {
      onError(err instanceof Error ? err.message : t.portal.sendMessageError);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card elev-sm flex flex-col" style={{ height: 520 }}>
      <div className="flex-none flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
        <button type="button" onClick={onBack} className="btn-icon" aria-label={t.portal.back} style={{ width: 30, height: 30 }}>
          ←
        </button>
        <span className="font-bold text-sm truncate">{project.description}</span>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto flex flex-col gap-3 p-4">
        <div className="flex flex-col items-start gap-1">
          <div className="rounded-[12px] px-3 py-2 text-sm max-w-[85%]" style={{ background: "var(--color-accent-500)", color: "#fff" }}>
            {project.description}
          </div>
          {project.image_urls.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {project.image_urls.map((url) => (
                <button key={url} type="button" onClick={() => setLightboxUrl(url)} className="flex-none">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="rounded-[8px] object-cover" style={{ width: 72, height: 72 }} />
                </button>
              ))}
            </div>
          )}
          <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
            {formatDate(project.created_at)}
          </span>
        </div>

        {messages.map((m) => {
          const mine = m.sender_type === "client";
          return (
            <div key={m.id} className={`flex flex-col gap-1 ${mine ? "items-start" : "items-end"}`}>
              {m.content && (
                <div
                  className="rounded-[12px] px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap break-words"
                  style={{
                    background: mine ? "var(--color-accent-500)" : "var(--color-surface)",
                    color: mine ? "#fff" : "var(--color-text)",
                  }}
                >
                  {m.content}
                </div>
              )}
              {m.image_urls.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {m.image_urls.map((url) => (
                    <button key={url} type="button" onClick={() => setLightboxUrl(url)} className="flex-none">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="rounded-[8px] object-cover" style={{ width: 72, height: 72 }} />
                    </button>
                  ))}
                </div>
              )}
              <span className="text-[11px]" style={{ color: "var(--color-neutral-500)" }}>
                {formatTime(m.created_at)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex-none p-3 flex flex-col gap-2" style={{ borderTop: "1px solid var(--color-neutral-200)" }}>
        <ImagePicker images={images} onChange={setImages} onError={onError} />
        <form onSubmit={handleSend} className="flex items-center gap-2">
          <input
            className="input flex-1"
            placeholder={t.portal.typeMessage}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" disabled={sending || (!text.trim() && images.length === 0)} className="btn btn-primary btn-sm flex-none">
            {t.portal.sendBtn}
          </button>
        </form>
      </div>

      {lightboxUrl && <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  );
}
