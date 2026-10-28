/**
 * 스크립트 JSON의 copy 블록으로 플랫폼별 게시 문구(shorts-out/{id}/copy.md)를 만든다.
 * 인스타 캡션은 docs/INSTAGRAM.md 5번 규칙(첫 줄 후크, 3줄 이내, 캡션에 링크 없음, 해시태그 5~8개)을 따른다.
 *
 * 사용: node tools/shorts/copy.mjs <script.json>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const scriptPath = process.argv[2];
if (!scriptPath) { console.error('사용: node tools/shorts/copy.mjs <script.json>'); process.exit(1); }

const cfg = JSON.parse(readFileSync(scriptPath, 'utf8'));
const c = cfg.copy;
const COMMON_TAGS = ['CS공부', '개발자', '컴퓨터공학'];

/**
 * 플랫폼별 추적 링크를 만든다.
 *
 * @param source utm_source 값
 * @param medium utm_medium 값
 * @returns 토픽 주소 + UTM
 */
function link(source, medium) {
    return 'https://csflow.kr/' + c.subject + '/' + c.slug + '?utm_source=' + source + '&utm_medium=' + medium + '&utm_campaign=' + cfg.id;
}

const topicTags = c.tags.map((t) => '#' + t);
const allTags = topicTags.concat(COMMON_TAGS.map((t) => '#' + t));
const lines = c.points;

const md = [
    '# ' + cfg.id + ' 게시 문구',
    '',
    '영상: `' + cfg.id + '.mp4` · 녹화일: ' + new Date().toISOString().slice(0, 10) + ' (사이트 화면이 바뀌면 영상도 다시 만든다)',
    '',
    '## YouTube Shorts',
    '',
    '제목',
    '```',
    c.hookQ + ' #Shorts',
    '```',
    '설명',
    '```',
    lines.join('\n'),
    '',
    '직접 돌려 보기: ' + link('youtube', 'shorts'),
    '',
    allTags.join(' ') + ' #Shorts',
    '```',
    '',
    '## Instagram Reels',
    '',
    '캡션 (링크는 넣지 않는다. 프로필 링크로 보낸다)',
    '```',
    c.hookQ,
    lines.join('\n'),
    '프로필 링크에서 직접 돌려보세요 👆',
    allTags.join(' '),
    '```',
    '프로필 링크(참고): ' + link('instagram', 'reels'),
    '',
    '## Threads',
    '',
    '```',
    c.hookQ,
    '',
    lines.join('\n'),
    '',
    link('threads', 'post'),
    '```',
    ''
].join('\n');

const out = join(ROOT, 'shorts-out', cfg.id);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'copy.md'), md, 'utf8');
console.log('문구:', join(out, 'copy.md'));