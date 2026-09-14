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
  uploadClientAvatar,
  uploadClientProjectImage,
} from "@/lib/actions/clientPortal";
import { ImageLightbox } from "@/components/workspace/ImageLightbox";
import type { ClientMessage, ClientProfile, ClientProject, ClientType } from "@/lib/types";

type Stage = "loading" | "signed-out" | "sent-link" | "needs-profile" | "ready";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function PortalContent() {
  const [stage, setStage] = useState<Stage>("loading");
  const [profile, setProfile] = useState<ClientProfile | null>(null);
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
    <section className="site-container py-14" style={{ maxWidth: 720 }}>
      <div className="flex items-center justify-between gap-3 mb-8">
        <h1 className="text-3xl">My Projects</h1>
        {stage === "ready" && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleSignOut}>
            Sign out
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm font-semibold mb-4" style={{ color: "var(--status-red)" }}>
          {error}
        </p>
      )}

      {stage === "loading" && (
        <p style={{ color: "var(--color-neutral-500)" }}>Loading…</p>
      )}

      {stage === "signed-out" && <LoginForm onSent={() => setStage("sent-link")} onError={setError} />}

      {stage === "sent-link" && (
        <div className="card elev-sm p-6 max-w-[420px]">
          <p className="font-bold mb-1">Check your email 📩</p>
          <p className="text-sm" style={{ color: "var(--color-neutral-600)" }}>
            We&apos;ve sent you a sign-in link. Open it on this device to continue.
          </p>
        </div>
      )}

      {stage === "needs-profile" && (
        <RegisterForm
          onDone={(p) => {
            setProfile(p);
            setStage("ready");
          }}
          onError={setError}
        />
      )}

      {stage === "ready" && profile && (
        <ProjectsDashboard profile={profile} unreadCount={unreadCount} onUnreadChange={setUnreadCount} onError={setError} />
      )}
    </section>
  );
}

function LoginForm({ onSent, onError }: { onSent: () => void; onError: (msg: string | null) => void }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || sending) return;
    setSending(true);
    onError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/cong-viec` },
      });
      if (error) throw error;
      onSent();
    } catch {
      onError("Could not send the sign-in link. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card elev-sm p-6 max-w-[420px]">
      <p className="text-sm mb-4" style={{ color: "var(--color-neutral-600)" }}>
        Sign in with your email to submit a project brief and talk with our team — no password needed.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          required
          className="input"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" disabled={sending} className="btn btn-primary">
          {sending ? "Sending…" : "Send sign-in link"}
        </button>
      </form>
    </div>
  );
}

const CLIENT_TYPES: { value: ClientType; label: string }[] = [
  { value: "individual", label: "Individual client" },
  { value: "business", label: "Business (B2B)" },
];

function RegisterForm({
  onDone,
  onError,
}: {
  onDone: (profile: ClientProfile) => void;
  onError: (msg: string | null) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [country, setCountry] = useState("");
  const [clientType, setClientType] = useState<ClientType>("individual");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    onError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const url = await uploadClientAvatar(formData);
      setAvatarUrl(url);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not upload the image.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    onError(null);
    try {
      const profile = await registerClientProfile({ displayName, country, avatarUrl, clientType });
      onDone(profile);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card elev-sm p-6 max-w-[460px]">
      <p className="font-bold mb-4">Tell us a bit about yourself</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center justify-center rounded-full overflow-hidden flex-none"
            style={{ width: 56, height: 56, background: "var(--color-accent-100)", border: "1px dashed var(--color-neutral-300)" }}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
                {uploading ? "…" : "Add"}
              </span>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          <span className="text-xs" style={{ color: "var(--color-neutral-500)" }}>
            Profile photo (optional)
          </span>
        </div>

        <input
          required
          className="input"
          placeholder="Your name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <input
          required
          className="input"
          placeholder="Country"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        />

        <div className="flex gap-2">
          {CLIENT_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setClientType(t.value)}
              className="flex-1 text-sm font-semibold rounded-[8px] py-2"
              style={{
                border: `1.5px solid ${clientType === t.value ? "var(--color-accent-500)" : "var(--color-neutral-300)"}`,
                background: clientType === t.value ? "var(--color-accent-100)" : "transparent",
                color: clientType === t.value ? "var(--color-accent-700)" : "var(--color-text)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button type="submit" disabled={saving || uploading} className="btn btn-primary">
          {saving ? "Saving…" : "Continue"}
        </button>
      </form>
    </div>
  );
}

function ProjectsDashboard({
  profile,
  unreadCount,
  onUnreadChange,
  onError,
}: {
  profile: ClientProfile;
  unreadCount: number;
  onUnreadChange: (n: number) => void;
  onError: (msg: string | null) => void;
}) {
  const [projects, setProjects] = useState<ClientProject[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  useEffect(() => {
    listMyProjects().then((list) => {
      setProjects(list);
      setLoadingList(false);
      if (list.length === 0) setShowNewForm(true);
    });
  }, []);

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
            {profile.country} · {profile.client_type === "business" ? "Business" : "Individual"}
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
          + New project
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
        <p style={{ color: "var(--color-neutral-500)" }}>Loading…</p>
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
                {p.status === "closed" ? " · Closed" : ""}
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
      onError(err instanceof Error ? err.message : "Could not upload one of the images.");
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
        {uploading ? "…" : "+ Add"}
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
      onError(err instanceof Error ? err.message : "Could not submit your project.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card elev-sm p-5 flex flex-col gap-3">
      <p className="font-bold text-sm">Describe your project</p>
      <textarea
        required
        className="input"
        style={{ minHeight: 110, resize: "vertical" }}
        placeholder="Tell us about the book, characters, style, timeline…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <ImagePicker images={images} onChange={setImages} onError={onError} />
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? "Submitting…" : "Submit"}
        </button>
        {canCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
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
      onError(err instanceof Error ? err.message : "Could not send your message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card elev-sm flex flex-col" style={{ height: 520 }}>
      <div className="flex-none flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
        <button type="button" onClick={onBack} className="btn-icon" aria-label="Back" style={{ width: 30, height: 30 }}>
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
            placeholder="Type a message…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" disabled={sending || (!text.trim() && images.length === 0)} className="btn btn-primary btn-sm flex-none">
            Send
          </button>
        </form>
      </div>

      {lightboxUrl && <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  );
}
