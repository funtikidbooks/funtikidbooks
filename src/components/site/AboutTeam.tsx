"use client";

import { useState } from "react";
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

// Everyone at once, in a grid — a carousel showed one face at a time and
// made visitors wait to see the team. Director/admin edit each card in place.
export function AboutTeam({ members, canEdit }: { members: TeamMember[]; canEdit: boolean }) {
  const { locale, t } = useDict();
  const [list, setList] = useState(members);
  const [adding, setAdding] = useState(false);

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
    // Guards against a double-fired click adding two blank members at once.
    if (adding) return;
    setAdding(true);
    try {
      await persist([...list, { id: crypto.randomUUID(), name: "", role: "", bio: null, photo: null }]);
    } finally {
      setAdding(false);
    }
  }

  function removeMember(id: string) {
    persist(list.filter((m) => m.id !== id));
  }

  // Visitors don't see half-filled cards (no name yet).
  const shown = canEdit ? list : list.filter((m) => m.name.trim());

  return (
    <section className="py-16" style={{ background: "var(--color-surface)" }}>
      <div className="site-container">
        <Reveal className="flex flex-col items-center text-center gap-2 mb-10">
          <h2 className="text-[28px] sm:text-[34px]">{t.about.teamTitle}</h2>
        </Reveal>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-x-4 gap-y-9">
          {shown.map((member, i) => {
            const role = pickLocalized(locale, member.role, member.roleEn);
            const bio = pickLocalized(locale, member.bio ?? "", member.bioEn);
            return (
              <Reveal key={member.id} delay={(i % 6) * 60} y={14} className="flex flex-col items-center text-center gap-1.5 min-w-0">
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
                  style={{ width: "min(136px, 100%)", aspectRatio: "1", minHeight: 0, marginBottom: 6, boxShadow: "0 0 0 4px var(--color-panel), var(--shadow-md)" }}
                  transform={member.photoTransform ?? DEFAULT_IMAGE_TRANSFORM}
                  onTransformChange={(next) => patchMember(member.id, { photoTransform: next })}
                />
                <InlineField
                  value={member.name}
                  placeholder={t.about.fieldName}
                  canEdit={canEdit}
                  onSave={(v) => patchMember(member.id, { name: v })}
                  className="font-bold text-[15px]"
                />
                <InlineField
                  value={role}
                  placeholder={`${t.about.fieldRole} [${t.about.roleTbd}]`}
                  canEdit={canEdit}
                  onSave={(v) => patchMember(member.id, { role: v })}
                  className="text-[13px] font-semibold"
                  style={{ color: "var(--color-accent-700)" }}
                />
                {(bio || canEdit) && (
                  <InlineField
                    value={bio}
                    placeholder={t.about.fieldBio}
                    canEdit={canEdit}
                    onSave={(v) => patchMember(member.id, { bio: v || null })}
                    multiline
                    rows={2}
                    className="text-[12.5px] leading-snug"
                    style={{ color: "var(--color-neutral-600)" }}
                  />
                )}
                {canEdit && (
                  <button type="button" onClick={() => removeMember(member.id)} className="text-[11px] font-semibold" style={{ color: "var(--color-neutral-400)" }}>
                    {t.about.remove}
                  </button>
                )}
              </Reveal>
            );
          })}

          {canEdit && (
            <button
              type="button"
              onClick={addMember}
              disabled={adding}
              className="flex flex-col items-center justify-center gap-2 text-xs font-bold rounded-[16px]"
              style={{ color: "var(--color-neutral-500)", border: "2px dashed var(--color-neutral-300)", minHeight: 180 }}
            >
              <span className="text-2xl leading-none" aria-hidden>
                +
              </span>
              {t.about.addMember}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
