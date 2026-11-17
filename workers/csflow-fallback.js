/*
 * Cloudflare Worker `csflow-fallback`
 *
 * csflow.kr 앞에 두고 원본(Rocky Linux)이 응답하지 못할 때 구워 둔 정적 스냅샷
 * (Cloudflare Pages `csflow-snapshot`)을 대신 내보낸다. 원본이 살아 있으면 아무것도 하지 않는다.
 *
 * 이 파일은 기록용 사본이다. 실제 동작은 Cloudflare 대시보드의 Worker 편집기에 붙여 넣은
 * 코드가 한다. 여기를 고쳤으면 대시보드에도 같은 내용을 붙여 넣어야 적용된다.
 *
 * 스냅샷은 scripts/bake_snapshot.py 가 운영 사이트를 크롤링해서 만든다.
 */
const SNAPSHOT = "https://csflow-snapshot.pages.dev";
const ORIGIN_TIMEOUT_MS = 8000;
const SKIP_PREFIXES = ["/api/", "/actuator/"];
const SUBJECT = /^\/(arch|os|network|ds|algo|db|robot)$/;
const SORTS = ["default", "view", "like"];

/**
 * 요청 주소를 스냅샷 안의 경로로 바꾼다.
 * 과목 홈의 정렬 · 페이지 조합은 굽는 쪽에서 {과목}/_list/{정렬}-{페이지} 로 저장한다.
 */
function snapshotPath(url) {
  const m = SUBJECT.exec(url.pathname);
  if (!m) return url.pathname;
  const p = url.searchParams;
  if (p.has("q") || p.has("tag")) return url.pathname;
  const sort = p.get("sort") || "default";
  const page = p.get("page") || "0";
  if (!SORTS.includes(sort) || !/^\d+$/.test(page)) return url.pathname;
  if (sort === "default" && page === "0") return url.pathname;
  return "/" + m[1] + "/_list/" + sort + "-" + page;
}

/** 스냅샷이 응답했음을 헤더로 알린다. 굽는 스크립트가 이 헤더로 원본 응답과 구분한다. */
function fromSnapshot(response) {
  const res = new Response(response.body, response);
  res.headers.set("X-Served-By", "snapshot");
  return res;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const readOnly = request.method === "GET" || request.method === "HEAD";
    const liveOnly = SKIP_PREFIXES.some((p) => url.pathname.startsWith(p))
      || request.headers.get("Sec-Fetch-Mode") === "cors";
    if (!readOnly || liveOnly) {
      return fetch(request);
    }
    try {
      const origin = await fetch(request, { signal: AbortSignal.timeout(ORIGIN_TIMEOUT_MS) });
      if (origin.status < 500) return origin;
    } catch (e) {}
    try {
      const headers = { "X-Snapshot-Key": env.SNAPSHOT_KEY };
      const snap = await fetch(SNAPSHOT + snapshotPath(url), {
        method: request.method,
        headers,
        redirect: "manual",
      });
      // 스냅샷이 주소를 바로잡아 주는 경우(/algo/ → /algo)는 그 주소를 스냅샷에서 한 번 더 가져온다.
      // 원본으로 되돌리면 여기까지 온 시점에 원본은 이미 죽어 있으므로 530 이 된다.
      // Location 에서 경로만 꺼내 SNAPSHOT 에 다시 붙이므로 키가 다른 호스트로 나갈 수 없다.
      if (snap.status >= 300 && snap.status < 400) {
        const location = snap.headers.get("Location");
        if (location) {
          const next = new URL(location, SNAPSHOT);
          const again = await fetch(SNAPSHOT + next.pathname + next.search, {
            method: request.method,
            headers,
            redirect: "manual",
          });
          if (again.status < 300) return fromSnapshot(again);
        }
        return fetch(request);
      }
      return fromSnapshot(snap);
    } catch (e) {
      return fetch(request);
    }
  },
};
