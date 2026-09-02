"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { isSupabaseStorageUrl } from "@/lib/imageTransform";
import type { Project } from "@/lib/types";

const ProjectEditDialog = dynamic(() => import("@/components/admin/ProjectEditDialog").then((m) => m.ProjectEditDialog), {
  ssr: false,
});

export function ProjectsAdmin({ initialProjects }: { initialProjects: Project[] }) {
  const [projects, setProjects] = useState(initialProjects);
  const [editing, setEditing] = useState<Project | "new" | null>(null);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-4 px-6 py-4" style={{ borderBottom: "1px solid var(--color-neutral-200)" }}>
        <h1 className="text-xl">Quản trị Dự án</h1>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing("new")}>
          + Thêm dự án
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {projects.length === 0 ? (
          <p style={{ color: "var(--color-neutral-500)" }}>Chưa có dự án nào. Bấm &quot;+ Thêm dự án&quot; để tạo mới.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setEditing(p)}
                className="relative text-left card elev-sm overflow-hidden"
                style={{ height: 200, opacity: p.published ? 1 : 0.5 }}
              >
                {p.cover_image_url ? (
                  <Image
                    src={p.cover_image_url}
                    alt={p.title}
                    fill
                    unoptimized={isSupabaseStorageUrl(p.cover_image_url)}
                    className="object-cover"
                    sizes="360px"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--color-surface)" }}>
                    🖼
                  </div>
                )}
                <div
                  className="absolute inset-x-0 bottom-0 p-3"
                  style={{ background: "linear-gradient(180deg, transparent, rgba(20,18,17,.85))" }}
                >
                  <span className="tag tag-accent w-fit mb-1">{p.tag}</span>
                  <h3 className="text-white text-sm font-bold">{p.title}</h3>
                  {!p.published && <span className="text-[11px] text-white/70">Chưa xuất bản</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <ProjectEditDialog
          project={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onCreated={(p) => setProjects((prev) => [...prev, p])}
          onUpdated={(id, patch) => setProjects((prev) => prev.map((p) => (p.id === id ? patch : p)))}
          onDeleted={(id) => setProjects((prev) => prev.filter((p) => p.id !== id))}
        />
      )}
    </div>
  );
}
