// Sends GoFamTree contact-request emails through Resend.
// POST { request_id, kind: "request" | "response" } with the signed-in user's token.
// Secrets: RESEND_API_KEY, MAIL_FROM (e.g. "GoFamTree <hello@gofamtree.com>"), SITE_URL (https://gofamtree.com)
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "Sign in first." }, 401);
    const { request_id, kind } = await req.json();
    const { data: r } = await admin.from("contact_requests").select("*").eq("id", request_id).single();
    if (!r) return json({ error: "Not found" }, 404);

    const site = Deno.env.get("SITE_URL") || "https://gofamtree.com";
    const nameOf = async (uid: string) => {
      const { data: p } = await admin.from("profiles").select("display_name").eq("id", uid).single();
      const { data: m } = await admin.from("family_members").select("person_id").eq("family_id", r.family_id).eq("user_id", uid).single();
      let treeName = "";
      if (m?.person_id) { const { data: d } = await admin.from("family_docs").select("data").eq("family_id", r.family_id).eq("collection", "people").eq("doc_id", m.person_id).single(); treeName = d?.data?.name || ""; }
      return treeName || p?.display_name || "A family member";
    };
    const emailOf = async (uid: string) => (await admin.auth.admin.getUserById(uid)).data.user?.email;
    const { data: fam } = await admin.from("families").select("name").eq("id", r.family_id).single();
    const family = fam?.name || "your family tree";

    let to: string | undefined, subject: string, body: string;
    if (kind === "request") {
      if (r.from_user !== user.id) return json({ error: "Not yours" }, 403);
      if (r.request_emailed_at) return json({ ok: true, already: true });
      const from = await nameOf(r.from_user);
      to = await emailOf(r.to_user);
      subject = `${from} would like to exchange contact info`;
      body = `<p>${esc(from)} found you in <strong>${esc(family)}</strong> on GoFamTree and would like to exchange contact info.</p>`
        + (r.note ? `<blockquote style="margin:12px 0;padding:8px 12px;border-left:3px solid #D9C6A8;color:#24211D">${esc(r.note)}</blockquote>` : "")
        + `<p>You choose what to share (address, email, phone) or you can decline. Nothing is shared unless you accept.</p>`
        + button(`${site}/?request=${r.id}`, "Accept or decline");
      await admin.from("contact_requests").update({ request_emailed_at: new Date().toISOString() }).eq("id", r.id);
    } else if (kind === "response") {
      if (r.to_user !== user.id) return json({ error: "Not yours" }, 403);
      if (r.status !== "accepted" || r.response_emailed_at) return json({ ok: true, skipped: true });
      const who = await nameOf(r.to_user);
      to = await emailOf(r.from_user);
      subject = `${who} shared contact info with you`;
      body = `<p>${esc(who)} accepted your request in <strong>${esc(family)}</strong> and shared their contact info with you.</p>`
        + button(`${site}/?request=${r.id}`, "See what they shared");
      await admin.from("contact_requests").update({ response_emailed_at: new Date().toISOString() }).eq("id", r.id);
    } else return json({ error: "Unknown kind" }, 400);

    if (!to) return json({ error: "No email on file" }, 400);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: Deno.env.get("MAIL_FROM") || "GoFamTree <hello@gofamtree.com>", to: [to], subject,
        html: wrap(body), text: body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() }),
    });
    if (!res.ok) return json({ error: "Email didn’t send", detail: await res.text() }, 502);
    return json({ ok: true });
  } catch (e) { return json({ error: String(e) }, 500); }
});

const button = (href: string, label: string) =>
  `<p style="margin:20px 0"><a href="${href}" style="background:#86602F;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600;display:inline-block">${label}</a></p>`;
const wrap = (inner: string) => `<div style="background:#FBFAF8;padding:24px 12px;font-family:Inter,-apple-system,Segoe UI,Roboto,sans-serif;color:#24211D;font-size:15px;line-height:1.55">
<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #E4DDD2;border-radius:12px;padding:24px">
<div style="font-family:Georgia,serif;font-size:20px;font-weight:600;margin-bottom:12px">GoFamTree</div>${inner}
<p style="color:#756D63;font-size:12px;margin-top:24px">You got this because you’re a member of a family tree on gofamtree.com.</p></div></div>`;
