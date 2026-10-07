/**
 * 전문 검색(역색인) 시각화
 */
(function () {
    'use strict';

    var container = document.getElementById('visualizer-container');
    if (!container) return;

    function el(tag, cls, txt) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (txt !== undefined && txt !== null) e.textContent = txt;
        return e;
    }

    /* ===================== DOM ===================== */
    var root    = el('div', 'ft-viz');
    var toolbar = el('div', 'ft-viz__toolbar');
    var tbLeft  = el('div', 'ft-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'ft-viz__title', 'FullText'));

    var modeWrap = el('div', 'ft-viz__mode');
    var modeDefs = [
        { key: 'index', label: '역색인' },
        { key: 'like', label: 'LIKE와 전문 검색' },
        { key: 'tokens', label: '토큰과 정규화' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'ft-viz__mode-btn' + (i === 0 ? ' ft-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'ft-viz__speed');
    speedWrap.appendChild(el('span', 'ft-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'ft-viz__speed-btn' + (i === 0 ? ' ft-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'ft-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'ft-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'ft-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'ft-viz__controls');
    var btnPlay  = el('button', 'ft-viz__btn ft-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'ft-viz__btn', '▶| STEP');
    var btnReset = el('button', 'ft-viz__btn', '↺ RESET');
    btnPlay.addEventListener('click',  vizStart);
    btnStep.addEventListener('click',  vizStep);
    btnReset.addEventListener('click', vizReset);
    controls.appendChild(btnPlay);
    controls.appendChild(btnStep);
    controls.appendChild(btnReset);
    root.appendChild(controls);
    container.appendChild(root);

    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

    /* ===================== 엔진: 문서와 역색인 ===================== */
    var DOCS = ['fat cat sat', 'fat rat ran', 'cat ate rat', 'big fat cat', 'dog ran fast', 'big dog sat', 'cat ran fast', 'fast dog'];
    function postings(n) {
        var map = {};
        var i;
        DOCS.slice(0, n).forEach(function (t, di) {
            t.split(' ').forEach(function (w) {
                if (!map[w]) map[w] = [];
                map[w].push(di + 1);
            });
        });
        return Object.keys(map).sort().map(function (w) { return { w: w, d: map[w] }; });
    }
    function istep(o) {
        return { kind: 'idx', n: o.n || 0, hdocs: o.hdocs || [], hwords: o.hwords || [], marks: o.marks || null, info: o.info || null, cap: o.cap, cap2: o.cap2, cap3: o.cap3, log: o.log };
    }

    /* ===================== 데이터: 역색인 ===================== */
    var IDX_STEPS = [];
    (function () {
        IDX_STEPS.push(istep({ n: 0, cap: '역색인: 단어에서 문서 목록을 찾는 구조', cap2: '책 뒤의 찾아보기(색인)와 같은 구조', cap3: '문서 8개로 만들어 본다', log: '역색인(inverted index)은 단어를 키로 하고 그 단어가 나오는 문서의 목록을 값으로 저장한 구조입니다. 전문 검색(full-text search)은 이 구조 덕분에 문서를 하나씩 훑지 않고 단어가 든 문서를 찾습니다. 왼쪽의 짧은 문서 8개로 색인을 만들어 봅니다. 문서 내용은 설명을 위한 예시입니다.' }));
        IDX_STEPS.push(istep({ n: 2, hdocs: [0, 1], cap: '① 문서의 단어를 하나씩 색인에 넣는다', cap2: '단어 옆에 그 단어가 나온 문서 번호를 적음', cap3: 'D1과 D2까지 처리', log: '문서를 하나씩 읽으며 단어를 색인에 넣고 그 단어가 나온 문서 번호를 적습니다. D1과 D2까지 처리하면 fat은 D1과 D2에 있어 목록이 1, 2가 됩니다.' }));
        IDX_STEPS.push(istep({ n: 8, cap: '② 모든 문서를 처리하면 색인이 완성된다', cap2: '단어 9개 · 각 단어에 문서 목록(posting list)', cap3: '단어는 정렬된 순서로 보관', log: '8개 문서를 모두 처리하면 서로 다른 단어 9개마다 그 단어가 나온 문서 목록이 만들어집니다. 이 목록을 포스팅 리스트(posting list)라 하고, 단어는 정렬된 순서로 보관해 빠르게 찾습니다.' }));
        IDX_STEPS.push(istep({ n: 8, hwords: ['cat'], hdocs: [0, 2, 3, 6], cap: '③ cat 검색: 색인에서 단어를 한 번 찾는다', cap2: 'cat → D1, D3, D4, D7', cap3: '문서를 하나씩 훑지 않음', log: 'cat이 든 문서를 찾으려면 색인에서 cat을 찾아 목록 D1, D3, D4, D7을 바로 얻습니다. 문서 8개를 모두 읽어 보지 않아도 됩니다.' }));
        IDX_STEPS.push(istep({ n: 8, hwords: ['fat', 'cat'], hdocs: [0, 3], cap: '④ fat & cat: 문서 목록의 교집합', cap2: 'fat → 1 2 4 · cat → 1 3 4 7', cap3: '두 목록에 모두 있는 문서: D1, D4', log: '두 단어가 모두 든 문서는 두 목록의 교집합입니다. fat의 목록 1, 2, 4와 cat의 목록 1, 3, 4, 7에 모두 있는 D1과 D4가 결과입니다. 목록이 정렬되어 있어 합치기도 빠릅니다.' }));
        IDX_STEPS.push(istep({ n: 8, cap: '역색인: 단어에서 문서 목록으로', cap2: '검색은 색인을 찾고 목록을 합치는 일', cap3: '일치하는 문서 위주로 접근', log: '정리 — 역색인은 단어에서 그 단어가 든 문서 목록을 찾는 구조입니다. 검색은 단어를 색인에서 찾아 문서 목록을 얻고, 여러 단어는 목록을 합쳐 처리하므로 모든 문서를 훑지 않고 일치하는 문서 위주로 접근합니다.' }));
    })();

    /* ===================== 데이터: LIKE와 전문 검색 ===================== */
    var LIKE_STEPS = [];
    (function () {
        var M = [0, 2, 3, 6];
        function marks(fn) { return DOCS.map(function (t, i) { return fn(i, M.indexOf(i) >= 0); }); }
        var none = marks(function () { return 'n'; });
        var scan = marks(function (i, m) { return m ? 'm' : 'c'; });
        var fetch = marks(function (i, m) { return m ? 'f' : 'n'; });
        LIKE_STEPS.push(istep({ n: 8, marks: none, info: ['질문: cat이 든 문서', '두 가지 방법을 비교'], cap: 'LIKE와 전문 검색은 찾는 방법이 다르다', cap2: "WHERE body LIKE '%cat%'", cap3: 'vs 역색인 조회', log: "같은 질문, cat이 들어 있는 문서를 찾는 방법이 두 가지입니다. LIKE '%cat%'로 글자를 부분 일치시키는 방법과 역색인을 쓰는 전문 검색입니다. 같은 8개 문서로 비교합니다." }));
        LIKE_STEPS.push(istep({ n: 8, marks: scan, info: ['B-Tree 인덱스 사용 불가', '문서 8개를 모두 검사', '일치 4개 (초록)'], cap: "LIKE '%cat%': 문서를 하나씩 검사한다", cap2: '앞이 %이면 B-Tree의 정렬 순서를 쓸 수 없음', cap3: '검사한 문서 8개', log: "B-Tree 인덱스는 값을 정렬해 두므로 앞부분이 정해진 패턴은 쓸 수 있지만, LIKE '%cat%'처럼 %로 시작하면 정렬 순서를 쓸 수 없습니다. pg_trgm 같은 별도 인덱스가 없으면 문서를 하나씩 모두 검사합니다. 8개를 모두 읽고 그중 4개가 일치합니다." }));
        LIKE_STEPS.push(istep({ n: 8, marks: fetch, hwords: ['cat'], info: ['색인에서 cat 조회 1번', '목록: D1 D3 D4 D7', '이 4개만 접근'], cap: '전문 검색: 색인에서 cat을 찾는다', cap2: '문서 목록 D1, D3, D4, D7', cap3: '접근한 문서 4개 (8개 중)', log: '전문 검색은 색인에서 cat을 한 번 찾아 문서 목록 D1, D3, D4, D7을 얻고 그 문서에만 접근합니다. 일치하지 않는 문서 4개는 읽지 않습니다.' }));
        LIKE_STEPS.push(istep({ n: 8, marks: fetch, info: ['문서가 수백만 개라면', 'LIKE: 전체를 검사', '색인: 일치한 문서 위주'], cap: '문서가 많을수록 차이가 커진다', cap2: 'LIKE는 전체를 검사, 색인은 일치하는 문서 위주', cap3: '단, 흔한 단어는 목록이 길어짐', log: '문서가 수백만 개로 늘면 LIKE는 전체를 검사하지만 색인은 일치하는 문서 위주로 접근해 차이가 커집니다. 다만 거의 모든 문서에 나오는 흔한 단어는 문서 목록이 길어져 이점이 줄어듭니다.' }));
        LIKE_STEPS.push(istep({ n: 8, marks: none, info: ['LIKE: 글자 부분 일치', '전문 검색: 단어 단위', '정규화와 순위 제공'], cap: '찾는 방식만이 아니라 검색 품질도 다르다', cap2: '전문 검색은 어간 추출, 불용어 제거, 순위를 제공', cap3: 'LIKE는 글자 그대로의 부분 일치', log: '정리 — LIKE는 글자를 그대로 부분 일치시키는 반면, 전문 검색은 단어 단위로 정규화(어간 추출, 불용어 제거)해 검색하고 관련도 순위도 낼 수 있습니다. 부분 문자열 검색을 빠르게 하려면 PostgreSQL의 pg_trgm 확장 같은 별도 인덱스도 있습니다.' }));
    })();

    /* ===================== 데이터: 토큰과 정규화 ===================== */
    var TEXT = 'a fat cat sat on a mat - it ate a fat rats';
    var TOKS = ['a', 'fat', 'cat', 'sat', 'on', 'a', 'mat', 'it', 'ate', 'a', 'fat', 'rats'];
    var STOPS = [0, 4, 5, 7, 9];
    var LEX = ['ate:9', 'cat:3', 'fat:2,11', 'mat:7', 'rat:12', 'sat:4'];
    function pstep(stage, cap, cap2, cap3, log) {
        return { kind: 'pipe', stage: stage, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }
    var TOK_STEPS = [];
    (function () {
        TOK_STEPS.push(pstep(0, '전문 검색은 텍스트를 단어로 바꿔 저장한다', '글자 그대로가 아닌 정규화한 단어(lexeme)', 'PostgreSQL에서는 to_tsvector', '전문 검색은 문서의 글을 글자 그대로 저장하지 않고 정규화한 단어 목록으로 바꿔 색인합니다. PostgreSQL에서는 to_tsvector 함수가 이 변환을 하고, 변환 결과 타입이 tsvector입니다. 위 문장 하나가 어떻게 바뀌는지 단계별로 봅니다.'));
        TOK_STEPS.push(pstep(1, '① 토큰으로 나눈다', '단어 12개, 위치 번호를 붙임', '기호는 버려짐', '먼저 파서가 문장을 토큰으로 나누고 위치 번호를 붙입니다. 이 문장은 12개의 토큰이 되고 가운데의 - 기호는 색인되지 않습니다.'));
        TOK_STEPS.push(pstep(2, '② 불용어를 뺀다', 'a, on, it 같은 흔한 단어는 색인하지 않음', '위치 번호는 그대로 유지', 'a, on, it처럼 거의 모든 문서에 나와 검색에 도움이 되지 않는 흔한 단어를 불용어(stop word)라 하며, 이 설정에서는 색인에서 뺍니다. 뺀 뒤에도 남은 단어의 위치 번호는 그대로 유지됩니다.'));
        TOK_STEPS.push(pstep(3, '③ 어간을 추출한다', 'rats → rat · 기본형으로 맞춤', '사전(설정)에 따라 결과가 다름', '남은 단어를 기본형에 가깝게 맞추는 어간 추출(stemming)을 합니다. rats가 rat이 되어 rat을 검색해도 찾을 수 있습니다. 어떤 규칙을 쓸지는 텍스트 검색 설정(여기서는 english)에 따라 다릅니다.'));
        TOK_STEPS.push(pstep(4, '④ tsvector: 단어와 위치의 목록', 'fat은 위치 2와 11에 두 번 나옴', '단어마다 위치를 함께 저장', '결과가 tsvector입니다. 정규화된 단어를 정렬해 모으고, 같은 단어는 위치를 함께 적습니다. fat은 위치 2와 11에 있어 fat:2,11로 표현됩니다.'));
        TOK_STEPS.push(pstep(5, '⑤ tsquery로 검색: fat & rat', '두 단어가 모두 들어 있으면 일치 (@@)', '결과: t (참)', '검색어도 같은 방식으로 정규화해 tsquery로 만듭니다. fat & rat은 두 단어가 모두 들어 있어야 한다는 뜻이고, tsvector @@ tsquery가 일치 여부를 판단합니다. 이 문장은 fat과 rat이 모두 있으므로 결과가 t입니다.'));
        TOK_STEPS.push(pstep(5, '정규화한 단어로 단어 단위 검색', '불용어 제거, 어간 추출로 형태 차이를 흡수', '색인에는 GIN 인덱스를 씀', '정리 — 전문 검색은 텍스트를 토큰으로 나누고 불용어를 빼고 어간을 추출해 tsvector로 만들고, 검색어도 tsquery로 정규화해 일치시킵니다. tsvector 열에 GIN 인덱스를 만들면 역색인으로 빠르게 찾습니다.'));
    })();

    /* ===================== 상태 ===================== */
    var mode    = 'index';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'like') return LIKE_STEPS;
        if (mode === 'tokens') return TOK_STEPS;
        return IDX_STEPS;
    }

    /* ===================== 드로우 헬퍼 ===================== */
    function rr(x, y, w, h, r, fill, stroke, lw) {
        if (w <= 0 || h <= 0) return;
        var rad = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rad, y);
        ctx.arcTo(x + w, y,     x + w, y + h, rad);
        ctx.arcTo(x + w, y + h, x,     y + h, rad);
        ctx.arcTo(x,     y + h, x,     y,     rad);
        ctx.arcTo(x,     y,     x + w, y,     rad);
        ctx.closePath();
        if (fill   && fill   !== 'none') { ctx.fillStyle   = fill;              ctx.fill();   }
        if (stroke && stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.4; ctx.stroke(); }
    }
    function tx(str, x, y, sz, color, align, bold) {
        if (sz < 11) sz = 11;
        if (color.indexOf(P.muted) === 0) color = P.sub + 'ff';
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    /* ===================== 공통: 캡션 ===================== */
    function drawCaps(s, x0, w, y, fs) {
        if (s.cap) tx(s.cap, x0 + w / 2, y, fs - 0.5, P.yellow + 'ff', 'center', true);
        if (s.cap2) tx(s.cap2, x0 + w / 2, y + 19, fs - 1, P.text + 'ee', 'center', false);
        if (s.cap3) tx(s.cap3, x0 + w / 2, y + 38, fs - 1, P.green + 'ee', 'center', true);
    }

    /* ===================== 문서 목록과 색인 ===================== */
    function drawIdx(x0, top, w, mob, s) {
        var fs = mob ? 11.5 : 13;
        var rowH = 25;
        var lw = mob ? 148 : 220;
        var gap = mob ? 10 : 20;
        var rx = x0 + lw + gap;
        var rw = w - lw - gap;
        var y0 = top + 8;
        var k;
        tx('문서', x0 + lw / 2, y0 + 8, fs - 1, P.sub + 'ff', 'center', true);
        tx(s.info ? '검색 방법' : '역색인 (단어 → 문서)', rx + rw / 2, y0 + 8, fs - 1, P.sub + 'ff', 'center', true);
        for (k = 0; k < DOCS.length; k++) {
            var y = y0 + 22 + k * rowH;
            var st = s.marks ? s.marks[k] : 'n';
            var hit = s.hdocs.indexOf(k) >= 0;
            var col = P.sub;
            var fillA = '11';
            if (st === 'm' || st === 'f') { col = P.green; fillA = '44'; }
            else if (st === 'c') { col = P.orange; fillA = '22'; }
            else if (hit) { col = P.teal; fillA = '44'; }
            var untouched = s.marks && st === 'n';
            rr(x0, y, lw, rowH - 3, 4, col + fillA, col + (untouched ? '66' : 'ff'), hit || st !== 'n' ? 1.8 : 1.2);
            tx('D' + (k + 1) + '  ' + DOCS[k], x0 + 8, y + (rowH - 3) / 2, fs - 0.5, untouched ? P.sub + 'ff' : P.text + 'ff', 'left', hit || st === 'm' || st === 'f');
            if (st === 'c') tx('✕', x0 + lw - 10, y + (rowH - 3) / 2, fs - 1, P.orange + 'ff', 'center', true);
            if (st === 'm') tx('✓', x0 + lw - 10, y + (rowH - 3) / 2, fs - 1, P.green + 'ff', 'center', true);
        }
        if (s.info) {
            for (k = 0; k < s.info.length; k++) {
                var iy = y0 + 22 + k * 40;
                rr(rx, iy, rw, 34, 5, P.purple + '22', P.purple + 'ff', 1.4);
                tx(s.info[k], rx + rw / 2, iy + 17, fs - 0.5, P.text + 'ff', 'center', true);
            }
        } else {
            var pl = postings(s.n);
            if (pl.length === 0) tx('(비어 있음)', rx + rw / 2, y0 + 22 + 60, fs - 1, P.sub + 'ff', 'center', false);
            for (k = 0; k < pl.length; k++) {
                var py = y0 + 22 + k * 22;
                var hw = s.hwords.indexOf(pl[k].w) >= 0;
                var pc = hw ? P.teal : P.sub;
                rr(rx, py, rw, 19, 4, pc + (hw ? '44' : '11'), pc + (hw ? 'ff' : '66'), hw ? 1.8 : 1);
                tx(pl[k].w, rx + 8, py + 10, fs - 1, P.text + 'ff', 'left', true);
                tx(pl[k].d.join(' '), rx + rw - 8, py + 10, fs - 1, hw ? P.green + 'ff' : P.text + 'ee', 'right', hw);
            }
        }
        drawCaps(s, x0, w, y0 + 22 + 8 * rowH + 22, fs);
    }

    /* ===================== 정규화 단계 ===================== */
    function drawPipe(x0, top, w, mob, s) {
        var fs = mob ? 11.5 : 13;
        var y0 = top + 8;
        var tw = w / 12;
        var k;
        tx(TEXT, x0 + w / 2, y0 + 10, fs, P.text + 'ff', 'center', true);
        if (s.stage >= 1) {
            for (k = 0; k < 12; k++) {
                var stop = s.stage >= 2 && STOPS.indexOf(k) >= 0;
                var stem = s.stage >= 3 && k === 11;
                var col = stop ? P.sub : (stem ? P.orange : P.teal);
                rr(x0 + k * tw + 1, y0 + 30, tw - 2, 24, 3, col + (stop ? '11' : '33'), col + (stop ? '66' : 'ff'), 1.2);
                tx(stem ? 'rat' : TOKS[k], x0 + k * tw + tw / 2, y0 + 42, fs - 1, stop ? P.sub + 'ff' : P.text + 'ff', 'center', !stop);
                tx(String(k + 1), x0 + k * tw + tw / 2, y0 + 66, fs - 1, P.sub + 'ff', 'center', false);
                if (stop) {
                    ctx.beginPath();
                    ctx.moveTo(x0 + k * tw + 3, y0 + 42);
                    ctx.lineTo(x0 + (k + 1) * tw - 3, y0 + 42);
                    ctx.strokeStyle = P.red + 'ff';
                    ctx.lineWidth = 1.6;
                    ctx.stroke();
                }
            }
        }
        if (s.stage >= 4) {
            tx('tsvector', x0 + 2, y0 + 92, fs - 1, P.sub + 'ff', 'left', true);
            var cx = x0;
            var cy = y0 + 112;
            for (k = 0; k < LEX.length; k++) {
                var cw = LEX[k].length * 7.6 + 18;
                if (cx + cw > x0 + w) { cx = x0; cy += 30; }
                rr(cx, cy - 12, cw, 24, 5, P.purple + '33', P.purple + 'ff', 1.6);
                tx(LEX[k], cx + cw / 2, cy, fs - 0.5, P.text + 'ff', 'center', true);
                cx += cw + 6;
            }
        }
        if (s.stage >= 5) {
            var qy = y0 + 178;
            tx('tsquery', x0 + 2, qy - 20, fs - 1, P.sub + 'ff', 'left', true);
            rr(x0, qy - 12, 48, 24, 5, P.teal + '33', P.teal + 'ff', 1.6);
            tx('fat', x0 + 24, qy, fs - 0.5, P.text + 'ff', 'center', true);
            tx('&', x0 + 62, qy, fs, P.text + 'ff', 'center', true);
            rr(x0 + 76, qy - 12, 48, 24, 5, P.teal + '33', P.teal + 'ff', 1.6);
            tx('rat', x0 + 100, qy, fs - 0.5, P.text + 'ff', 'center', true);
            tx('@@  →', x0 + 150, qy, fs, P.text + 'ff', 'center', true);
            rr(x0 + 178, qy - 12, 40, 24, 5, P.green + '44', P.green + 'ff', 2);
            tx('t', x0 + 198, qy, fs, P.green + 'ff', 'center', true);
        }
        drawCaps(s, x0, w, y0 + (s.stage >= 5 ? 226 : (s.stage >= 4 ? 190 : 120)), fs);
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        var W = GW(); var mob = W < 600;
        var padX = mob ? 16 : 26;
        var fullW = W - padX * 2;
        var top = mob ? 18 : 26;

        var steps = currentSteps();
        var step = stepIdx >= 0 ? steps[stepIdx] : null;

        var dsStep = step || currentSteps()[0];
        if (dsStep.kind === 'pipe') drawPipe(padX, top, fullW, mob, dsStep);
        else drawIdx(padX, top, fullW, mob, dsStep);

        if (!step) {
            var hint = '아래 STEP으로 전문 검색과 역색인의 동작을 확인하세요.';
            ctx.font = '500 ' + (mob ? 11 : 12.5) + 'px "JetBrains Mono",monospace';
            var hs = mob ? 11 : 12.5;
            var hl = [hint];
            if (ctx.measureText(hint).width > W - 16) {
                var cut = hint.indexOf(' ', Math.floor(hint.length / 2));
                if (cut < 0) cut = hint.lastIndexOf(' ');
                hl = [hint.slice(0, cut), hint.slice(cut + 1)];
            }
            hl.forEach(function (line, li) {
                tx(line, W / 2, GH() - (mob ? 12 : 14) - (hl.length - 1 - li) * (hs + 4), hs, P.muted + 'aa', 'center', false);
            });
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH;
        neededH = mob ? 385 : 350;
        canvasWrap.style.height    = 'auto';
        canvasWrap.style.minHeight = neededH + 'px';
        var actualH = canvasWrap.offsetHeight || neededH;
        if (actualH < neededH) actualH = neededH;
        canvas.width  = w * dpr;
        canvas.height = actualH * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    /* ===================== 애니메이션(스텝 전환) ===================== */
    function animateStep(onDone) {
        if (rafId) cancelAnimationFrame(rafId);
        draw();
        rafId = requestAnimationFrame(function () { rafId = null; if (onDone) onDone(); });
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) { speedBtns.forEach(function (b) { b.disabled = v; }); }
    function defaultLog() {
        if (mode === 'like') return "LIKE '%단어%'와 전문 검색이 문서를 찾는 방식을 비교합니다.";
        if (mode === 'tokens') return '텍스트가 토큰, 어간, tsvector로 바뀌는 과정을 봅니다.';
        return '단어에서 문서 목록을 찾는 역색인을 만들고 검색하는 과정을 봅니다.';
    }

    function applyStep(idx, onDone) {
        stepIdx = idx;
        logEl.textContent = currentSteps()[idx].log;
        animateStep(function () { if (onDone) setTimeout(onDone, 0); });
    }

    function vizStart() {
        if (running) return;
        running = true; btnPlay.disabled = true; btnStep.disabled = true;
        setSpeedDisabled(true);
        var steps = currentSteps();
        function tick() {
            var next = stepIdx + 1;
            if (next >= steps.length) { running = false; setSpeedDisabled(false); return; }
            applyStep(next, function () {
                if (next === steps.length - 1) {
                    running = false; btnStep.disabled = true; setSpeedDisabled(false);
                } else {
                    timer = setTimeout(tick, speed * 0.6);
                }
            });
        }
        tick();
    }

    function vizStep() {
        if (running) return;
        var steps = currentSteps();
        var next = stepIdx + 1;
        if (next >= steps.length) return;
        applyStep(next, null);
        if (next === steps.length - 1) { btnPlay.disabled = true; btnStep.disabled = true; }
    }

    function vizReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false; stepIdx = -1;
        btnPlay.disabled = false; btnStep.disabled = false;
        logEl.textContent = defaultLog();
        setSpeedDisabled(false);
        resize();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        speedBtns.forEach(function (b) { b.classList.remove('ft-viz__speed-btn--active'); });
        btn.classList.add('ft-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('ft-viz__mode-btn--active', d.key === m); });
        vizReset();
    }

    logEl.textContent = defaultLog();

    /* ===================== 라이프사이클 ===================== */
    window.CsFlow.createVizLifecycle({
        canvas: canvas, canvasWrap: canvasWrap, resize: resize, draw: draw,
        getState : function () { return { rafId: rafId, timer: timer, running: running }; },
        setState : function (s) { rafId = s.rafId; timer = s.timer; running = s.running; },
        onPause  : function () { setSpeedDisabled(false); },
        getMouseCtx: function () {
            return {
                GW: GW, GH: GH,
                mousePos: { x: -1, y: -1 },
                tooltipHits: [],
                hoveredKey: function () { return null; },
                setHoveredKey: function () {},
                draw: draw
            };
        }
    });

    setTimeout(resize, 60);
})();