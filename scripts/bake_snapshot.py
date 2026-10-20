"""운영 사이트를 크롤링해서 Cloudflare Pages에 올릴 정적 스냅샷(dist)을 만든다.

사용법: python scripts/bake_snapshot.py [출력 폴더]
환경변수 SNAPSHOT_BASE로 대상 주소를 바꾼다(기본 https://csflow.kr).
원본이 아니라 Worker 폴백(X-Served-By 헤더)이 응답한 페이지는 실패로 보고, 하나라도 실패하면 종료 코드 1로 끝난다.
조회수가 굽는 횟수만큼 오르지 않도록 고정 방문자 쿠키(cv)로 요청한다.
sitemap에 없는 /study, /search(검색어 없는 빈 화면)도 굽는다.
과목 페이지는 정렬(default/view/like)과 페이지 조합마다 {과목}/_list/{정렬}-{페이지}.html로 따로 굽는다.
"""
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

BASE = os.environ.get("SNAPSHOT_BASE", "https://csflow.kr").rstrip("/")
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "dist")
WORKERS = 6
MIN_PAGES = 100
WAIT_SECONDS = 180
UA = "csflow-snapshot/1.0"
VISITOR_COOKIE = "cv=00000000-0000-4000-8000-00000000c5f1"
SORTS = ("default", "view", "like")
EXTRA_PAGES = ("/study", "/search")
SUBJECT_RE = re.compile(r"^/(arch|os|network|ds|algo|db)$")
PAGE_RE = re.compile(r"[?&;](?:amp;)?page=(\d+)")
ASSET_RE = re.compile(r'''(?:href|src)=["'](/[^"'#]+?)["']''')
CSS_URL_RE = re.compile(r'url\(["\']?(/[^"\')]+)["\']?\)')
ASSET_EXT = (".css", ".js", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".ico", ".woff", ".woff2", ".txt")
ROBOTS_MANAGED_RE = re.compile(r"(?s)# As a condition of accessing.*?# END Cloudflare Managed Content\s*")

errors: list[str] = []


def fetch(path: str) -> tuple[int, bytes]:
    """원본이 응답한 결과만 돌려준다. 폴백 응답이나 네트워크 오류는 세 번 시도하고 실패로 기록한다. 429(요청 제한)는 `Retry-After`나 점점 늘리는 대기 뒤에 다섯 번까지 다시 시도한다."""
    req = urllib.request.Request(BASE + path, headers={"User-Agent": UA, "Cookie": VISITOR_COOKIE})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                status, headers, body = resp.status, resp.headers, resp.read()
        except urllib.error.HTTPError as exc:
            status, headers, body = exc.code, exc.headers, exc.read()
        except Exception:
            time.sleep(1 + attempt)
            continue
        if status == 429:
            retry_after = headers.get("Retry-After", "")
            time.sleep(min(int(retry_after), 30) if retry_after.isdigit() else 5 * (attempt + 1))
            continue
        if attempt >= 3 and (headers.get("X-Served-By") or status >= 500):
            break
        if headers.get("X-Served-By") or status >= 500:
            time.sleep(2 + attempt)
            continue
        return status, body
    errors.append(f"origin not serving: {path}")
    return 0, b""


def wait_for_origin() -> None:
    """배포 직후 앱이 뜰 때까지 원본이 응답하기를 기다린다."""
    deadline = time.time() + WAIT_SECONDS
    while time.time() < deadline:
        req = urllib.request.Request(BASE + "/", headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                if resp.status == 200 and not resp.headers.get("X-Served-By"):
                    return
        except Exception:
            pass
        time.sleep(5)
    sys.exit("원본이 응답하지 않아 스냅샷을 만들지 않는다")


def page_file(path: str) -> Path:
    clean = urllib.parse.unquote(path).strip("/")
    return OUT / ("index.html" if not clean else clean + ".html")


def asset_file(path: str) -> Path:
    return OUT / urllib.parse.unquote(path).lstrip("/")


def save(target: Path, body: bytes) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(body)


def bake_page(path: str) -> tuple[str, bytes]:
    status, body = fetch(path)
    if status == 0:
        return path, b""
    if status != 200:
        errors.append(f"{status} {path}")
        return path, b""
    save(page_file(path), body)
    return path, body


def bake_list(combo: tuple[str, str, int]) -> tuple[str, bytes]:
    """과목 목록의 (과목, 정렬, 페이지) 조합 하나를 {과목}/_list/{정렬}-{페이지}.html로 굽는다."""
    slug, sort, page = combo
    query = f"/{slug}?sort={sort}&page={page}"
    status, body = fetch(query)
    if status == 0:
        return query, b""
    if status != 200:
        errors.append(f"{status} {query}")
        return query, b""
    save(OUT / slug / "_list" / f"{sort}-{page}.html", body)
    return query, body


def bake_asset(path: str) -> bytes:
    status, body = fetch(path)
    if status == 0:
        return b""
    if status != 200:
        errors.append(f"{status} asset {path}")
        return b""
    save(asset_file(path.split("?")[0]), body)
    return body


def list_combos(bodies: dict[str, bytes]) -> list[tuple[str, str, int]]:
    """과목 기본 페이지의 페이지 링크에서 전체 쪽수를 읽어 정렬 · 페이지 조합 목록을 만든다."""
    combos = []
    for path, body in bodies.items():
        match = SUBJECT_RE.match(path)
        if not match or not body:
            continue
        pages = [int(n) for n in PAGE_RE.findall(body.decode("utf-8", "ignore"))]
        total = max(pages) + 1 if pages else 1
        combos += [(match.group(1), sort, page) for sort in SORTS for page in range(total)]
    return combos


def main() -> None:
    wait_for_origin()
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    _, sitemap = fetch("/sitemap.xml")
    (OUT / "sitemap.xml").write_bytes(sitemap)
    paths = [urllib.parse.urlparse(u).path for u in re.findall(r"<loc>([^<]+)</loc>", sitemap.decode("utf-8"))]
    print(f"sitemap urls: {len(paths)}")
    paths += EXTRA_PAGES

    with ThreadPoolExecutor(WORKERS) as pool:
        results = list(pool.map(bake_page, paths))
    saved = sum(1 for _, body in results if body)
    print(f"pages saved: {saved}")

    combos = list_combos(dict(results))
    with ThreadPoolExecutor(WORKERS) as pool:
        results += list(pool.map(bake_list, combos))
    print(f"list pages saved: {len(combos)}")

    status, body = fetch("/__snapshot_404_probe__")
    if status == 404:
        (OUT / "404.html").write_bytes(body)
        results.append(("/404", body))
    else:
        errors.append(f"404 probe returned {status}")

    assets: set[str] = set()
    for _, body in results:
        for ref in ASSET_RE.findall(body.decode("utf-8", "ignore")):
            if not ref.startswith("/cdn-cgi/") and ref.split("?")[0].lower().endswith(ASSET_EXT):
                assets.add(ref)
    assets |= {"/robots.txt", "/ads.txt"}

    with ThreadPoolExecutor(WORKERS) as pool:
        bodies = dict(zip(sorted(assets), pool.map(bake_asset, sorted(assets))))

    nested = {
        sub
        for ref, body in bodies.items()
        if ref.split("?")[0].lower().endswith(".css")
        for sub in CSS_URL_RE.findall(body.decode("utf-8", "ignore"))
        if sub not in assets
    }
    with ThreadPoolExecutor(WORKERS) as pool:
        list(pool.map(bake_asset, sorted(nested)))
    print(f"assets saved: {len(assets) + len(nested)}")

    robots = OUT / "robots.txt"
    if robots.exists():
        robots.write_text(ROBOTS_MANAGED_RE.sub("", robots.read_text("utf-8")), "utf-8")

    files = [p for p in OUT.rglob("*") if p.is_file()]
    print(f"files: {len(files)}, size: {sum(p.stat().st_size for p in files) / 1e6:.1f} MB")
    print(f"errors: {len(errors)}")
    for e in errors[:20]:
        print("  ", e)
    if errors or saved < MIN_PAGES or len(paths) < MIN_PAGES + len(EXTRA_PAGES):
        sys.exit("검증 실패: 스냅샷을 배포하지 않는다")


main()
