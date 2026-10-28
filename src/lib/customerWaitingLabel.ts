// "chờ 12 phút" / "chờ 3 giờ" / "chờ 5 ngày" — how long a customer has been
// waiting for a person to answer (Khách chờ trả lời, customer_waiting.sql).
export function waitingFor(sinceIso: string, now = Date.now()): string {
  const min = Math.max(0, Math.floor((now - Date.parse(sinceIso)) / 60_000));
  if (min < 1) return "vừa xong";
  if (min < 60) return `${min} phút`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} giờ`;
  return `${Math.floor(h / 24)} ngày`;
}
