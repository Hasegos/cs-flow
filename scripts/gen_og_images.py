"""토픽과 에러 사전 항목마다 링크 미리보기(OG) 카드 이미지를 만든다.

사용법: python scripts/gen_og_images.py [출력 폴더]
출력 폴더 기본값은 src/main/resources/static/img/og 이고, {과목}/{slug}.png, errors/{slug}.png 로 쓴다.
운영 사이트(환경변수 OG_BASE, 기본 https://csflow.kr)의 sitemap에서 목록을 읽고 각 페이지에서 제목 · 과목 · 에러 메시지를 가져온다.
조회수가 오르지 않도록 고정 방문자 쿠키(cv)로 요청한다. 새 토픽을 발행한 뒤 다시 실행하면 이미 있는 파일은 건너뛴다(--force로 전부 다시 생성).
글꼴은 Windows 기본 글꼴(맑은 고딕, Consolas)을 쓴다.
"""
import html
import os
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

BASE = os.environ.get("OG_BASE", "https://csflow.kr").rstrip("/")
HEADERS = {"User-Agent": "csflow-og/1.0", "Cookie": "cv=00000000-0000-4000-8000-00000000c5f1"}
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
FORCE = "--force" in sys.argv
OUT = Path(ARGS[0] if ARGS else "src/main/resources/static/img/og")
FONT_DIR = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"

W, H = 1200, 630
BG = (15, 15, 26)
TEXT = (232, 232, 240)
SUB = (154, 154, 184)
SUBJECTS = ("arch", "os", "network", "ds", "algo", "db", "robot")
TABS = ("큰 그림", "작동 원리", "코드 연결", "퀴즈")
CATEGORIES = {"algorithm": "알고리즘", "network": "네트워크", "web": "웹", "ros2": "ROS 2", "spring": "Spring Boot",
              "python": "Python", "java": "Java", "git": "Git", "postgresql": "PostgreSQL", "sqlite": "SQLite",
              "docker": "Docker", "ssh": "SSH"}


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    """글꼴 파일을 크기에 맞춰 연다."""
    return ImageFont.truetype(str(FONT_DIR / name), size)


def fetch(path: str) -> str:
    """운영 사이트 페이지를 문자열로 받는다."""
    req = urllib.request.Request(BASE + path, headers=HEADERS)
    return urllib.request.urlopen(req, timeout=30).read().decode("utf-8")


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    """#rrggbb 문자열을 (r, g, b)로 바꾼다."""
    value = value.lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def first(pattern: str, text: str, flags: int = re.S) -> str:
    """정규식 첫 일치의 첫 그룹을 HTML 엔티티를 풀어서 돌려준다. 없으면 빈 문자열."""
    m = re.search(pattern, text, flags)
    return html.unescape(m.group(1)).strip() if m else ""


def wrap(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, width: int, max_lines: int) -> list[str]:
    """너비에 맞춰 단어 단위로 줄을 나눈다. 단어 하나가 너비보다 길면 글자 단위로 자르고, 줄이 넘치면 마지막 줄 끝을 …로 줄인다."""
    lines: list[str] = []
    line = ""
    for word in text.split(" "):
        candidate = (line + " " + word).strip()
        if draw.textlength(candidate, font=fnt) <= width:
            line = candidate
            continue
        if line:
            lines.append(line)
        line = ""
        for ch in word:
            if draw.textlength(line + ch, font=fnt) > width and line:
                lines.append(line)
                line = ch
            else:
                line += ch
    if line:
        lines.append(line)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        while draw.textlength(lines[-1] + "…", font=fnt) > width:
            lines[-1] = lines[-1][:-1]
        lines[-1] += "…"
    return lines


def fit_title(draw: ImageDraw.ImageDraw, title: str, sizes: tuple[int, ...], max_lines: int) -> tuple[ImageFont.FreeTypeFont, list[str]]:
    """제목이 max_lines 안에 들어가는 가장 큰 글자 크기를 고른다. 전부 넘치면 가장 작은 크기로 줄인다."""
    for size in sizes:
        fnt = font("malgunbd.ttf", size)
        lines = wrap(draw, title, fnt, W - 128, 99)
        if len(lines) <= max_lines:
            return fnt, lines
    fnt = font("malgunbd.ttf", sizes[-1])
    return fnt, wrap(draw, title, fnt, W - 128, max_lines)


def background(accent: tuple[int, int, int]) -> Image.Image:
    """어두운 바탕에 격자와 강조색 글로우를 깐다."""
    img = Image.new("RGB", (W, H), BG)
    glow = Image.new("RGB", (W, H), BG)
    ImageDraw.Draw(glow).ellipse((W - 620, -380, W + 260, 420), fill=tuple(int(c * 0.55) for c in accent))
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(150)), 0.9)
    draw = ImageDraw.Draw(img)
    grid = tuple(int(c * 0.12 + b * 0.88) for c, b in zip(accent, BG))
    for x in range(0, W, 60):
        draw.line((x, 0, x, H), fill=grid, width=1)
    for y in range(0, H, 60):
        draw.line((0, y, W, y), fill=grid, width=1)
    return img


def chip(draw: ImageDraw.ImageDraw, xy: tuple[int, int], label: str, fnt: ImageFont.FreeTypeFont,
         color: tuple[int, int, int], filled: bool) -> int:
    """둥근 칩을 그리고 오른쪽 끝 x좌표를 돌려준다."""
    x, y = xy
    w = int(draw.textlength(label, font=fnt)) + 36
    box = (x, y, x + w, y + 46)
    if filled:
        draw.rounded_rectangle(box, radius=23, fill=tuple(int(c * 0.22 + b * 0.78) for c, b in zip(color, BG)), outline=color, width=2)
        draw.text((x + 18, y + 6), label, font=fnt, fill=color)
    else:
        draw.rounded_rectangle(box, radius=23, outline=(70, 70, 100), width=2)
        draw.text((x + 18, y + 6), label, font=fnt, fill=SUB)
    return x + w


def render(kind: str, label: str, title: str, accent: tuple[int, int, int], message: str = "") -> Image.Image:
    """카드 한 장을 그린다. kind가 topic이면 탭 칩을, error이면 에러 메시지 상자를 아래에 둔다."""
    img = background(accent)
    draw = ImageDraw.Draw(img)

    draw.ellipse((64, 62, 90, 88), fill=accent)
    draw.text((104, 52), "CS Flow", font=font("malgunbd.ttf", 38), fill=TEXT)
    label_font = font("malgunbd.ttf", 28)
    label_w = int(draw.textlength(label, font=label_font)) + 36
    chip(draw, (W - 64 - label_w, 50), label, label_font, accent, True)

    sizes = (76, 64, 54) if kind == "topic" else (60, 52, 46)
    title_font, lines = fit_title(draw, title, sizes, 3 if kind == "topic" else 2)
    line_h = int(title_font.size * 1.28)
    y = 170
    for line in lines:
        draw.text((64, y), line, font=title_font, fill=TEXT)
        y += line_h

    if kind == "topic":
        x = 64
        tab_font = font("malgun.ttf", 28)
        for tab in TABS:
            x = chip(draw, (x, 470), tab, tab_font, accent, False) + 14
    else:
        mono = font("consola.ttf" if message.isascii() else "malgun.ttf", 30)
        msg_lines = wrap(draw, message, mono, W - 128 - 56, 2)
        top = max(y + 14, 380)
        height = 40 + 42 * len(msg_lines)
        draw.rounded_rectangle((64, top, W - 64, top + height), radius=16, fill=(10, 10, 18), outline=(60, 60, 90), width=2)
        for i, line in enumerate(msg_lines):
            draw.text((92, top + 22 + 42 * i), line, font=mono, fill=(255, 170, 120))

    draw.text((64, 548), "csflow.kr", font=font("malgunbd.ttf", 34), fill=accent)
    tag = "시각화로 배우는 CS 지식" if kind == "topic" else "직접 재현해 확인한 에러 사전"
    tag_font = font("malgun.ttf", 28)
    draw.text((W - 64 - draw.textlength(tag, font=tag_font), 552), tag, font=tag_font, fill=SUB)
    return img


def save(img: Image.Image, path: Path) -> None:
    """팔레트로 줄여 PNG로 저장한다."""
    path.parent.mkdir(parents=True, exist_ok=True)
    img.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).save(path, optimize=True)


def sitemap_paths() -> list[str]:
    """sitemap의 경로 목록을 읽는다. 에지 캐시를 피하려고 쿼리를 붙인다."""
    xml = fetch("/sitemap.xml?og=" + str(os.getpid()))
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    locs = [e.text for e in ET.fromstring(xml).findall("s:url/s:loc", ns)]
    return [urllib.parse.urlparse(u).path for u in locs]


def main() -> int:
    """sitemap의 토픽과 에러 항목마다 카드를 만든다. 실패가 있으면 종료 코드 1."""
    accents = {}
    names = {}
    for sub in SUBJECTS:
        try:
            page = fetch("/" + sub)
        except Exception:
            continue
        accents[sub] = hex_to_rgb(first(r"--subject-accent: ?(#[0-9a-fA-F]{6})", page))
        names[sub] = first(r'<h1 class="subject-hero__title">(.*?)</h1>', page)

    made = skipped = 0
    failed: list[str] = []
    for path in sitemap_paths():
        parts = [p for p in path.split("/") if p]
        if len(parts) != 2:
            continue
        group, slug = parts
        if group == "errors" and slug == "category":
            continue
        is_error = group == "errors"
        if not is_error and group not in accents:
            continue
        target = OUT / group / (slug + ".png")
        if target.exists() and not FORCE:
            skipped += 1
            continue
        try:
            page = fetch(path)
            title = first(r'<h1 class="topic-hero__title">(.*?)</h1>', page)
            if is_error:
                message = first(r'<pre class="errdict-message">(.*?)</pre>', page).splitlines()[0]
                category = first(r'topic-hero__slug">errors · ([^<]*)', page)
                img = render("error", "에러 사전 · " + CATEGORIES.get(category, category), title, (62, 207, 178), message)
            else:
                img = render("topic", names[group], title, accents[group])
            save(img, target)
            made += 1
        except Exception as e:
            failed.append(path + " " + str(e))

    print("생성 %d, 건너뜀 %d, 실패 %d" % (made, skipped, len(failed)))
    for f in failed:
        print("  실패:", f)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())