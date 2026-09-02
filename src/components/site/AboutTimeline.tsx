"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { EditableImage } from "@/components/site/EditableImage";
import { Reveal } from "@/components/site/Reveal";
import { useDict } from "@/components/site/LocaleProvider";
import { pickLocalized } from "@/lib/i18n";
import { saveJsonSetting, uploadContentImage } from "@/lib/actions/admin";

export type TimelineItem = {
  id: string;
  year: string;
  yearEn?: string | null;
  title: string;
  titleEn?: string | null;
  description: string;
  descriptionEn?: string | null;
  image: string | null;
};

const SETTINGS_KEY = "gioi-thieu-timeline";

export function AboutTimeline({ items, canEdit }: { items: TimelineItem[]; canEdit: boolean }) {
  const { locale, t } = useDict();
  const [list, setList] = useState(items);
  const [editing, setEditing] = useState<TimelineItem | "new" | null>(null);

  async function persist(next: TimelineItem[]) {
    setList(next);
    await saveJsonSetting(SETTINGS_KEY, next, ["/gioi-thieu"]);
  }

  async function handleUploadImage(id: string, file: File) {
    const url = await uploadContentImage(file);
    await persist(list.map((it) => (it.id === id ? { ...it, image: url } : it)));
    return url;
  }

  return (
    <section className="py-16">
      <div className="max-w-[920px] mx-auto px-5">
        <Reveal className="flex flex-col items-center text-center gap-2 mb-14">
          <div className="text-xs font-bold tracking-[0.1em]" style={{ color: "var(--color-accent-2-700)" }}>
            {t.about.storyKicker}
          </div>
          <h2 className="text-3xl">
            {t.about.storyTitle[0]} <span style={{ color: "var(--color-accent-600)" }}>{t.about.storyTitle[1]}</span>
          </h2>
        </Reveal>

        <div className="relative flex flex-col gap-16">
          <div className="fk-timeline-line" aria-hidden />

          {list.map((item, i) => {
            const isRight = i % 2 === 1;
            const year = pickLocalized(locale, item.year, item.yearEn);
            const title = pickLocalized(locale, item.title, item.titleEn);
            const description = pickLocalized(locale, item.description, item.descriptionEn);

            return (
              <Reveal key={item.id} y={28} className="relative grid gap-6 sm:grid-cols-2 items-center">
                <span className="fk-timeline-marker">{i + 1}</span>

                <div className={isRight ? "sm:order-2" : ""}>
                  <EditableImage
                    src={item.image}
                    emoji="📖"
                    canEdit={canEdit}
                    onUpload={(file) => handleUploadImage(item.id, file)}
                    className="w-full"
                    style={{ aspectRatio: "4 / 3" }}
                    resizeWidth={700}
                  />
                </div>

                <div
                  className={`flex flex-col gap-2 ${isRight ? "sm:order-1 sm:items-end sm:text-right" : ""}`}
                >
                  <span className="text-sm font-bold" style={{ color: "var(--color-accent-700)" }}>
                    {year}
                  </span>
                  <h3 className="text-xl">{title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--color-neutral-700)" }}>
                    {description}
                  </p>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setEditing(item)}
                      className="fk-edit-link text-xs font-bold w-fit mt-1"
                      style={{ color: "var(--color-accent-700)" }}
                    >
                      {t.about.edit}
                    </button>
                  )}
                </div>
              </Reveal>
            );
          })}
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="gallery-add-tile w-full flex items-center justify-center gap-1.5 py-4 rounded-[var(--radius-md)] mt-10"
            style={{ border: "2px dashed var(--color-neutral-300)", color: "var(--color-neutral-500)" }}
          >
            <span className="text-lg leading-none" aria-hidden>
              +
            </span>
            <span className="text-sm font-bold">{t.about.addMilestone}</span>
          </button>
        )}
      </div>

      {editing && (
        <TimelineEditDialog
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            const next =
              editing === "new"
                ? [...list, { ...data, id: crypto.randomUUID(), image: null }]
                : list.map((it) => (it.id === (editing as TimelineItem).id ? { ...it, ...data } : it));
            await persist(next);
            setEditing(null);
          }}
          onDelete={
            editing !== "new"
              ? async () => {
                  await persist(list.filter((it) => it.id !== (editing as TimelineItem).id));
                  setEditing(null);
                }
              : undefined
          }
        />
      )}
    </section>
  );
}

function TimelineEditDialog({
  item,
  onClose,
  onSave,
  onDelete,
}: {
  item: TimelineItem | null;
  onClose: () => void;
  onSave: (data: Omit<TimelineItem, "id" | "image">) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const { t } = useDict();
  const [lang, setLang] = useState<"vi" | "en">("vi");
  const [year, setYear] = useState(item?.year ?? "");
  const [yearEn, setYearEn] = useState(item?.yearEn ?? "");
  const [title, setTitle] = useState(item?.title ?? "");
  const [titleEn, setTitleEn] = useState(item?.titleEn ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [descriptionEn, setDescriptionEn] = useState(item?.descriptionEn ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!year.trim() || !title.trim()) {
      setError("Vui lòng nhập năm và tiêu đề.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        year: year.trim(),
        yearEn: yearEn.trim() || null,
        title: title.trim(),
        titleEn: titleEn.trim() || null,
        description: description.trim(),
        descriptionEn: descriptionEn.trim() || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể lưu");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!onDelete || !confirm(t.about.confirmRemove)) return;
    setDeleting(true);
    try {
      await onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không thể xoá");
      setDeleting(false);
    }
  }

  const busy = saving || deleting;

  return (
    <Modal onClose={onClose} maxWidth={520}>
      <div className="flex flex-col p-6 gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg">{item ? t.about.editMilestoneTitle : t.about.newMilestoneTitle}</h2>
          <button type="button" onClick={onClose} className="btn-icon" aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="flex items-center gap-1" role="tablist">
          {(["vi", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={lang === l}
              onClick={() => setLang(l)}
              className="category-chip px-3 py-1.5 rounded-full text-xs font-bold"
              style={{
                background: lang === l ? "var(--color-accent-2-700)" : "var(--color-surface)",
                color: lang === l ? "#fff" : "var(--color-text)",
                border: `1.5px solid ${lang === l ? "var(--color-accent-2-700)" : "var(--color-neutral-200)"}`,
              }}
            >
              {l === "vi" ? "🇻🇳 Tiếng Việt" : "🇬🇧 English (tuỳ chọn)"}
            </button>
          ))}
        </div>

        <div className="grid gap-3">
          {lang === "vi" ? (
            <div className="field">
              <label>{t.about.fieldYear}</label>
              <input className="input" value={year} onChange={(e) => setYear(e.target.value)} />
            </div>
          ) : (
            <div className="field">
              <label>{t.about.fieldYear}</label>
              <input className="input" value={yearEn} onChange={(e) => setYearEn(e.target.value)} />
            </div>
          )}

          <div className="field">
            <label>
              {t.about.fieldTitle} {lang === "vi" && <span style={{ color: "var(--status-red)" }}>*</span>}
            </label>
            <input
              className="input"
              value={lang === "vi" ? title : titleEn}
              onChange={(e) => (lang === "vi" ? setTitle(e.target.value) : setTitleEn(e.target.value))}
            />
          </div>

          <div className="field">
            <label>{t.about.fieldDesc}</label>
            <textarea
              className="input"
              rows={3}
              value={lang === "vi" ? description : descriptionEn}
              onChange={(e) => (lang === "vi" ? setDescription(e.target.value) : setDescriptionEn(e.target.value))}
            />
          </div>
        </div>

        {error && (
          <p className="text-xs font-semibold" style={{ color: "var(--status-red)" }}>
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 mt-1">
          {onDelete ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="btn btn-ghost btn-sm"
              style={{ color: "var(--status-red)" }}
            >
              {deleting ? "…" : t.about.remove}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn btn-ghost btn-sm" disabled={busy}>
              {t.about.cancel}
            </button>
            <button type="button" onClick={handleSave} className="btn btn-primary btn-sm" disabled={busy || !year.trim() || !title.trim()}>
              {saving ? "…" : t.about.save}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
