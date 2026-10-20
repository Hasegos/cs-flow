export async function onRequest({ request, env, next }) {
  if (request.headers.get("X-Snapshot-Key") === env.SNAPSHOT_KEY) return next();
  const { pathname } = new URL(request.url);
  const path = pathname.replace(/\/_list\/[^/]*$/, "") || "/";
  return Response.redirect("https://csflow.kr" + path, 302);
}
