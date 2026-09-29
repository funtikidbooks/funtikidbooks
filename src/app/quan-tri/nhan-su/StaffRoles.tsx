"use client";

import { useState, useTransition } from "react";
import { CreateAccountDialog } from "@/components/admin/CreateAccountDialog";
import { StaffIdModal } from "@/components/admin/StaffIdModal";
import { ProbationPanel } from "@/components/admin/ProbationPanel";
import { ProfileChangeLog } from "@/components/admin/ProfileChangeLog";
import { deleteStaffAccount, updateAccessRole, updateJobTitle } from "@/lib/actions/admin";
import { JOB_TITLE_SUGGESTIONS } from "@/lib/constants/staff";
import type { AccessRole, Profile, ProfileChange, StaffIdDocument, StaffProbation } from "@/lib/types";

const ROLE_LABELS: Record<AccessRole, string> = {
  director: "Giám đốc",
  admin: "Admin",
  staff: "Hoạ sĩ / PM",
};

export function StaffRoles({
  initialProfiles,
  currentUserId,
  isDirector,
  initialIdDocuments,
  initialProbation,
  profileChanges,
}: {
  initialProfiles: Profile[];
  currentUserId: string;
  isDirector: boolean;
  initialIdDocuments: StaffIdDocument[];
  initialProbation: StaffProbation[];
  profileChanges: ProfileChange[];
}) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [idDocsByProfile, setIdDocsByProfile] = useState(() => new Map(initialIdDocuments.map((d) => [d.profile_id, d])));
  const [editingIdFor, setEditingIdFor] = useState<Profile | null>(null);

  function changeRole(id: string, role: AccessRole) {
    const prev = profiles;
    setProfiles((p) => p.map((x) => (x.id === id ? { ...x, access_role: role } : x)));
    setError(null);
    startTransition(async () => {
      try {
        await updateAccessRole(id, role);
      } catch (err) {
        setProfiles(prev);
        setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
      }
    });
  }

  function changeJobTitle(id: string, jobTitle: string) {
    const prev = profiles;
    setProfiles((p) => p.map((x) => (x.id === id ? { ...x, role: jobTitle || null } : x)));
    setError(null);
    startTransition(async () => {
      try {
        await updateJobTitle(id, jobTitle);
      } catch (err) {
        setProfiles(prev);
        setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
      }
    });
  }

  function removeStaff(p: Profile) {
    if (!confirm(`Xoá tài khoản của "${p.display_name}"? Họ sẽ không đăng nhập được nữa. Không thể hoàn tác.`)) return;
    const prev = profiles;
    setDeletingId(p.id);
    setProfiles((list) => list.filter((x) => x.id !== p.id));
    setError(null);
    startTransition(async () => {
      try {
        await deleteStaffAccount(p.id);
      } catch (err) {
        setProfiles(prev);
        setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
      } finally {
        setDeletingId(null);
      }
    });
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 sm:px-6 py-3 sm:py-4"
        style={{ borderBottom: "1px solid var(--color-neutral-200)" }}
      >
        <h1 className="text-lg sm:text-xl whitespace-nowrap">Nhân sự & phân quyền</h1>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="tag tag-neutral whitespace-nowrap">{profiles.length} tài khoản</span>
          {isDirector && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
              + Thêm tài khoản
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <p className="text-sm mb-4 max-w-[110ch]" style={{ color: "var(--color-neutral-600)" }}>
          {isDirector ? (
            <>
              Đổi vai trò để quyết định trang nào mỗi người vào được: <b>Giám đốc</b> vào được tất cả, <b>Admin</b> chỉ quản trị
              nội dung (không vào bảng công việc), <b>Hoạ sĩ / PM</b> chỉ vào bảng công việc. Chức danh chỉ là nhãn hiển thị,
              không ảnh hưởng quyền truy cập — cũng là tag lọc ở trang Thành viên.
            </>
          ) : (
            "Xem danh sách vai trò và chức danh của cả studio. Chỉ Giám đốc mới đổi được vai trò, chức danh, hoặc xoá tài khoản."
          )}
        </p>
        {error && (
          <p className="text-sm font-semibold mb-3" style={{ color: "var(--status-red)" }}>
            {error}
          </p>
        )}
        {/* Phone/iPad: one column (thử việc, staff, change log). A computer
            screen: staff down the left, thử việc + change log on the right,
            so the page uses the whole width. */}
        <div className="flex flex-col xl:grid xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] xl:gap-x-6 xl:items-start xl:[grid-template-areas:'list_prob''list_log']">
          <div className="xl:[grid-area:prob]">
            <ProbationPanel profiles={profiles} initialRows={initialProbation} />
          </div>
          <datalist id="job-title-suggestions">
            {JOB_TITLE_SUGGESTIONS.map((title) => (
              <option key={title} value={title} />
            ))}
          </datalist>
          <div className="flex flex-col gap-2 xl:[grid-area:list]">
            {profiles.map((p) => (
              <div key={p.id} className="card elev-sm p-3 flex flex-wrap sm:flex-nowrap items-center gap-3">
                <div
                  className="flex items-center justify-center rounded-full text-sm font-bold flex-none"
                  style={{ width: 36, height: 36, background: "var(--color-accent-2-100)", color: "var(--color-accent-2-800)" }}
                >
                  {p.display_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col min-w-0 flex-1 basis-[140px]">
                  <span className="text-sm font-bold truncate">{p.display_name}</span>
                  <span className="text-xs truncate" style={{ color: "var(--color-neutral-500)" }}>
                    {p.email}
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-icon flex-none"
                  onClick={() => setEditingIdFor(p)}
                  aria-label={`CCCD của ${p.display_name}`}
                  title={idDocsByProfile.has(p.id) ? "Đã có thông tin CCCD" : "Chưa có thông tin CCCD"}
                  style={idDocsByProfile.has(p.id) ? { color: "var(--color-accent-700)" } : undefined}
                >
                  🪪
                </button>
                {isDirector ? (
                  <>
                    <input
                      key={`title-${p.id}-${p.role ?? ""}`}
                      className="input fk-input-150"
                      list="job-title-suggestions"
                      placeholder="Chức danh"
                      defaultValue={p.role ?? ""}
                      disabled={pending}
                      onBlur={(e) => {
                        const value = e.target.value.trim();
                        if (value !== (p.role ?? "")) changeJobTitle(p.id, value);
                      }}
                    />
                    <select
                      className="input fk-input-150"
                      value={p.access_role}
                      disabled={pending}
                      onChange={(e) => changeRole(p.id, e.target.value as AccessRole)}
                    >
                      {(Object.keys(ROLE_LABELS) as AccessRole[]).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    {p.id !== currentUserId && (
                      <button
                        type="button"
                        className="btn-icon flex-none"
                        disabled={pending}
                        onClick={() => removeStaff(p)}
                        aria-label={`Xoá tài khoản ${p.display_name}`}
                        title="Xoá tài khoản"
                        style={{ color: "var(--status-red)" }}
                      >
                        {deletingId === p.id ? "…" : "🗑"}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-sm truncate" style={{ width: 150 }}>
                      {p.role || "—"}
                    </span>
                    <span className="tag tag-neutral" style={{ width: 150, textAlign: "center" }}>
                      {ROLE_LABELS[p.access_role]}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
          {isDirector && (
            <div className="xl:[grid-area:log]">
              <ProfileChangeLog changes={profileChanges} profiles={profiles} />
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateAccountDialog
          onClose={() => setShowCreate(false)}
          onCreated={(p) => setProfiles((prev) => [...prev, p].sort((a, b) => a.display_name.localeCompare(b.display_name)))}
        />
      )}

      {editingIdFor && (
        <StaffIdModal
          profile={editingIdFor}
          existing={idDocsByProfile.get(editingIdFor.id) ?? null}
          onClose={() => setEditingIdFor(null)}
          onSaved={(doc) => setIdDocsByProfile((prev) => new Map(prev).set(doc.profile_id, doc))}
        />
      )}
    </div>
  );
}
