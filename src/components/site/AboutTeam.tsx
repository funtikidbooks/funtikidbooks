"use client";

import { useEffect, useState } from "react";
import { DEFAULT_IMAGE_TRANSFORM, EditableImage, type ImageTransform } from "@/components/site/EditableImage";
import { InlineField } from "@/components/site/InlineField";
import { Reveal } from "@/components/site/Reveal";
import { useDict } from "@/components/site/LocaleProvider";
import { pickLocalized } from "@/lib/i18n";
import { saveJsonSetting, uploadContentImage } from "@/lib/actions/admin";

export type TeamMember = {
  id: string;
  name: string;
  role: string;
  roleEn?: string | null;
  bio?: string | null;
  bioEn?: string | null;
  photo: string | null;
  photoTransform?: ImageTransform | null;
};

const SETTINGS_KEY = "gioi-thieu-team";
const PHOTO_SIZE_ACTIVE = 176;
const PHOTO_SIZE_SIDE = 116;
const ROTATE_MS = 5500;
const SPACING = 190;
const CAROUSEL_HEIGHT = 320;

export function AboutTeam({ members, canEdit }: { members: TeamMember[]; canEdit: boolean }) {
  const { locale, t } = useDict();
  const [list, setList] = useState(members);
  const [active, setActive] = useState(0);
  const [editingCount, setEditingCount] = useState(0);
  const [adding, setAdding] = useState(false);
  const count = list.length;

  async function persist(next: TeamMember[]) {
    setList(next);
    await saveJsonSetting(SETTINGS_KEY, next, ["/gioi-thieu"]);
  }

  function patchMember(id: string, patch: Partial<TeamMember>) {
    persist(list.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  async function handleUploadPhoto(id: string, file: File) {
    const url = await uploadContentImage(file);
    await persist(list.map((m) => (m.id === id ? { ...m, photo: url } : m)));
    return url;
  }

  async function addMember() {
    // Guards against a double-fired click adding two blank members at once —
    // the button is disabled for the duration of this call (see below).
    if (adding) return;
    setAdding(true);
    try {
      const newIndex = list.length;
      await persist([...list, { id: crypto.randomUUID(), name: "", role: "", bio: null, photo: null }]);
      // Jump the carousel to the new slide immediately — it's appended at the
      // end of the list, so without this the click looks like it did nothing.
      setActive(newIndex);
    } finally {
      setAdding(false);
    }
  }

  function removeMember(id: string) {
    persist(list.filter((m) => m.id !== id));
  }

  function go(delta: number) {
    setActive((i) => (count === 0 ? 0 : (i + delta + count) % count));
  }

  // Auto-advance every 5-6s, looping — paused while a field is being edited
  // so the row doesn't shift size/position out from under the director.
  useEffect(() => {
    if (count <= 1 || editingCount > 0) return;
    const id = setInterval(() => setActive((i) => (i + 1) % count), ROTATE_MS);
    return () => clearInterval(id);
  }, [count, editingCount]);

  function markEditing(editing: boolean) {
    setEditingCount((n) => Math.max(0, n + (editing ? 1 : -1)));
  }

  return (
    <section className="py-16" style={{ background: "var(--color-surface)" }}>
      <div className="site-container">
        <Reveal className="flex flex-col items-center text-center gap-2 mb-8">
          <h2 className="text-3xl">{t.about.teamTitle}</h2>
        </Reveal>

        <div className="relative w-full flex items-center justify-center" style={{ height: CAROUSEL_HEIGHT }}>
          {count > 1 && (
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Trước"
              className="absolute left-2 sm:left-8 z-20 flex items-center justify-center rounded-full text-white"
              style={{ width: 40, height: 40, background: "rgba(20,18,17,.85)" }}
            >
              ‹
            </button>
          )}

          {list.map((member, i) => {
            let offset = i - active;
            if (offset > count / 2) offset -= count;
            if (offset < -count / 2) offset += count;
            const abs = Math.abs(offset);
            if (abs > 2) return null;
            const isActive = abs === 0;

            const translate = offset * SPACING;
            const scale = Math.max(0.6, 1 - abs * 0.2);
            const opacity = Math.max(0.15, 1 - abs * 0.42);
            const z = 10 - abs;

            const role = pickLocalized(locale, member.role, member.roleEn);
            const bio = pickLocalized(locale, member.bio ?? "", member.bioEn);
            const size = isActive ? PHOTO_SIZE_ACTIVE : PHOTO_SIZE_SIDE;

            return (
              <div
                key={member.id}
                className="absolute flex flex-col items-center text-center gap-2"
                style={{
                  width: 160,
                  transform: `translateX(${translate}px) scale(${scale})`,
                  opacity,
                  zIndex: z,
                  transition: "transform .45s cubic-bezier(.22,1,.36,1), opacity .35s ease, width .3s ease",
                }}
              >
                <EditableImage
                  src={member.photo}
                  emoji="🧑‍🎨"
                  canEdit={canEdit}
                  onUpload={(file) => handleUploadPhoto(member.id, file)}
                  circle
                  placeholderVariant="dropzone"
                  dropzoneLabel={t.about.photoLabel}
                  dropzoneHint={t.about.photoBrowse}
                  resizeWidth={350}
                  style={{ width: size, height: size }}
                  transform={member.photoTransform ?? DEFAULT_IMAGE_TRANSFORM}
                  onTransformChange={(next) => patchMember(member.id, { photoTransform: next })}
                />
                <InlineField
                  value={member.name}
                  placeholder={t.about.fieldName}
                  canEdit={canEdit}
                  onSave={(v) => patchMember(member.id, { name: v })}
                  onEditingChange={markEditing}
                  className="font-semibold"
                />
                <InlineField
                  value={role}
                  placeholder={`${t.about.fieldRole} [${t.about.roleTbd}]`}
                  canEdit={canEdit}
                  onSave={(v) => patchMember(member.id, { role: v })}
                  onEditingChange={markEditing}
                  className="text-sm"
                  style={{ color: "var(--color-accent-700)" }}
                />
                <InlineField
                  value={bio}
                  placeholder={t.about.fieldBio}
                  canEdit={canEdit}
                  onSave={(v) => patchMember(member.id, { bio: v || null })}
                  onEditingChange={markEditing}
                  multiline
                  rows={2}
                  className="text-xs italic"
                  style={{ color: "var(--color-neutral-600)" }}
                />
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => removeMember(member.id)}
                    className="text-[11px] font-semibold"
                    style={{ color: "var(--color-neutral-400)" }}
                  >
                    {t.about.remove}
                  </button>
                )}
              </div>
            );
          })}

          {count > 1 && (
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Tiếp"
              className="absolute right-2 sm:right-8 z-20 flex items-center justify-center rounded-full text-white"
              style={{ width: 40, height: 40, background: "rgba(20,18,17,.85)" }}
            >
              ›
            </button>
          )}
        </div>

        {canEdit && (
          <div className="flex justify-center mt-6">
            <button
              type="button"
              onClick={addMember}
              disabled={adding}
              className="flex items-center gap-2 text-xs font-bold"
              style={{ color: "var(--color-neutral-500)" }}
            >
              <span
                className="flex items-center justify-center rounded-full"
                style={{ width: 24, height: 24, border: "2px dashed var(--color-neutral-300)" }}
                aria-hidden
              >
                +
              </span>
              {t.about.addMember}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
