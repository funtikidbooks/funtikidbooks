import { addMonths, PROBATION_MONTHS, vnDateOf } from "@/lib/probation";
import type { Profile, StaffIdDocument } from "@/lib/types";

// Hợp đồng mẫu: the {{…}} blanks a template may use, and how each is filled
// for the person a document is being made for (their profile and CCCD
// record). Anything missing stays as "[…]" for the director to fill in.
export const TEMPLATE_FIELDS: { key: string; label: string }[] = [
  { key: "ho_ten", label: "Họ và tên (theo CCCD)" },
  { key: "chuc_danh", label: "Chức danh" },
  { key: "dien_thoai", label: "Điện thoại" },
  { key: "email", label: "Email" },
  { key: "ngay_sinh", label: "Ngày sinh" },
  { key: "gioi_tinh", label: "Giới tính" },
  { key: "so_cccd", label: "Số CCCD" },
  { key: "ngay_cap", label: "Ngày cấp CCCD" },
  { key: "noi_cap", label: "Nơi cấp CCCD" },
  { key: "noi_cu_tru", label: "Nơi cư trú" },
  { key: "ngay_bat_dau", label: "Ngày vào làm" },
  { key: "ngay_het_thu_viec", label: "Ngày hết thử việc" },
  { key: "hom_nay", label: "ngày … tháng … năm … (hôm nay)" },
  { key: "nam", label: "Năm nay" },
];

// "2001-02-22" → 22/02/2001, without timezone drift.
function plainDate(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

export function fillTemplate(content: string, profile: Profile | undefined, id: StaffIdDocument | undefined, now = new Date()): string {
  const [y, m, d] = vnDateOf(now.toISOString()).split("-").map(Number);
  const joined = profile?.joined_at ? vnDateOf(profile.joined_at) : null;
  const values: Record<string, string | null> = {
    ho_ten: id?.full_name || profile?.display_name || null,
    chuc_danh: profile?.role || null,
    dien_thoai: profile?.phone || null,
    email: profile?.email || null,
    ngay_sinh: plainDate(id?.dob),
    gioi_tinh: id?.sex || null,
    so_cccd: id?.id_number || null,
    ngay_cap: plainDate(id?.issued_date),
    noi_cap: id?.issued_place || null,
    noi_cu_tru: id?.temporary_address || id?.permanent_address || profile?.address || null,
    ngay_bat_dau: plainDate(joined),
    ngay_het_thu_viec: joined ? plainDate(addMonths(joined, PROBATION_MONTHS)) : null,
    hom_nay: `ngày ${d} tháng ${m} năm ${y}`,
    nam: String(y),
  };
  return content.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (whole, key: string) => {
    if (!(key in values)) return whole;
    return values[key] ?? `[${TEMPLATE_FIELDS.find((f) => f.key === key)?.label ?? key}]`;
  });
}
