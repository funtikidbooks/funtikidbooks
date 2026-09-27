import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Browser errors from staff screens (see ClientErrorReporter). Always
// written to the Vercel runtime log; also saved to client_errors once
// supabase/migrations/performance_night.sql has created that table.
// Only signed-in users are accepted, and each field is length-capped, so
// this can't be used to flood the table from outside.
const cap = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : null);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return new Response(null, { status: 204 });

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 204 });
  }

  const row = {
    profile_id: data.user.id,
    message: cap(body.message, 500) ?? "(no message)",
    stack: cap(body.stack, 4000),
    page_url: cap(body.url, 500),
    user_agent: cap(request.headers.get("user-agent"), 300),
  };
  console.error("[client-error]", row.profile_id, row.page_url, row.message);

  try {
    await createAdminClient().from("client_errors").insert(row);
  } catch {
    // Table not there yet — the log line above still has it.
  }
  return new Response(null, { status: 204 });
}
