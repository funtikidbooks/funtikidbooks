"use client";

import { useState } from "react";

// Click-to-edit text: renders as plain text for visitors, and as an
// editable field for director/admin — used across the About page's
// director-editable copy (team bios, hero text, ...).
export function InlineField({
  value,
  placeholder,
  canEdit,
  onSave,
  onEditingChange,
  multiline = false,
  rows = 4,
  className = "",
  style,
}: {
  value: string;
  placeholder: string;
  canEdit: boolean;
  onSave: (next: string) => void;
  onEditingChange?: (editing: boolean) => void;
  multiline?: boolean;
  rows?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!canEdit) {
    if (!value) return null;
    return (
      <span className={className} style={style}>
        {value}
      </span>
    );
  }

  if (editing) {
    function commit() {
      setEditing(false);
      onEditingChange?.(false);
      const trimmed = draft.trim();
      if (trimmed !== value) onSave(trimmed);
    }
    const shared = {
      autoFocus: true,
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
      onBlur: commit,
      className: `input ${className}`,
      style,
    };
    return multiline ? (
      <textarea
        {...shared}
        rows={rows}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
            onEditingChange?.(false);
          }
        }}
      />
    ) : (
      <input
        {...shared}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
            onEditingChange?.(false);
          }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
        onEditingChange?.(true);
      }}
      className={`fk-inline-edit ${className}`}
      style={style}
    >
      {value || (
        <span className="italic" style={{ opacity: 0.55 }}>
          {placeholder}
        </span>
      )}
    </button>
  );
}
