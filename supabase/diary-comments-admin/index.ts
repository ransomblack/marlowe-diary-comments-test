import { createClient } from "npm:@supabase/supabase-js@2";
const projectUrl = Deno.env.get("SUPABASE_URL")!;
const publicKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const permittedOrigins = new Set(["https://ransomblack.github.io", "https://marlowerosemusic.com"]);
const ownerEmail = "contact@marlowerosemusic.com";
Deno.serve(async (request) => {
  const origin = request.headers.get("origin") || "";
  const headers = {
    "content-type": "application/json",
    "access-control-allow-origin": permittedOrigins.has(origin) ? origin : "null",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "vary": "Origin"
  };
  const result = (status: number, body: unknown) => new Response(JSON.stringify(body), {status, headers});
  if (request.method === "OPTIONS") return new Response(null, {headers});
  if (request.method !== "POST") return result(405, {error:"Method not allowed"});
  if (!permittedOrigins.has(origin)) return result(403, {error:"Origin not allowed"});
  const bearer = request.headers.get("authorization") || "";
  if (!bearer.startsWith("Bearer ")) return result(401, {error:"Sign in required"});
  const authClient = createClient(projectUrl, publicKey);
  const {data:{user},error:authError} = await authClient.auth.getUser(bearer.slice(7));
  if (authError || !user || !user.email_confirmed_at || user.email?.toLowerCase() !== ownerEmail) return result(403,{error:"Not authorized"});
  const db = createClient(projectUrl, serviceKey);
  let body: Record<string,unknown>;
  try { body = await request.json(); } catch { return result(400,{error:"Invalid JSON"}); }
  if (body.action === "delete") {
    if (typeof body.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id)) return result(400,{error:"Invalid comment ID"});
    const {error} = await db.from("diary_comments").delete().eq("id",body.id);
    if (error) {console.error("Delete error",error.code);return result(500,{error:"Unable to delete comment"});}
    return result(200,{success:true});
  }
  if (body.action === "reply") {
    if (typeof body.parent_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.parent_id)) return result(400,{error:"Invalid comment ID"});
    if (typeof body.comment_text !== "string" || body.comment_text.trim().length < 1 || body.comment_text.length > 2000) return result(400,{error:"Reply must be between 1 and 2000 characters"});
    const {data:parent,error:lookupError} = await db.from("diary_comments").select("id,entry_id,parent_id").eq("id",body.parent_id).maybeSingle();
    if (lookupError || !parent || parent.parent_id !== null) return result(400,{error:"Invalid parent comment"});
    const {error} = await db.from("diary_comments").insert({entry_id:parent.entry_id,parent_id:parent.id,author_name:"Marlowe Rose",comment_text:body.comment_text.trim(),is_marlowe:true});
    if (error) {console.error("Reply error",error.code);return result(500,{error:"Unable to post reply"});}
    return result(201,{success:true});
  }
  return result(400,{error:"Unknown action"});
});