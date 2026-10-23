/**
 * 테이블 파티셔닝 시각화
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
    var root    = el('div', 'tp-viz');
    var toolbar = el('div', 'tp-viz__toolbar');
    var tbLeft  = el('div', 'tp-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'tp-viz__title', 'Partitioning'));

    var modeWrap = el('div', 'tp-viz__mode');
    var modeDefs = [
        { key: 'scheme', label: '분할 방식' },
        { key: 'prune', label: '파티션 프루닝' },
        { key: 'scope', label: '파티셔닝과 샤딩' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'tp-viz__mode-btn' + (i === 0 ? ' tp-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'tp-viz__speed');
    speedWrap.appendChild(el('span', 'tp-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'tp-viz__speed-btn' + (i === 0 ? ' tp-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'tp-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'tp-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'tp-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'tp-viz__controls');
    var btnPlay  = el('button', 'tp-viz__btn tp-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'tp-viz__btn', '▶| STEP');
    var btnReset = el('button', 'tp-viz__btn', '↺ RESET');
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
    function GW() { return canvas.width / dpr; }
    function GH() { return canvas.height / dpr; }

    var P = window.CsFlow.getP();

    /* ===================== 상태 ===================== */
    var mode    = 'scheme';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1900;
    var anim    = 1;

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
        if (sz < 9.5) sz = 9.5;
        if (color.indexOf(P.muted) === 0) color = P.sub + 'ff';
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }
    function ln(x1, y1, x2, y2, color, lw, dash) {
        ctx.beginPath();
        ctx.setLineDash(dash || []);
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = color;
        ctx.lineWidth = lw || 1.4;
        ctx.stroke();
        ctx.setLineDash([]);
    }
    function arrow(x1, y1, x2, y2, color, lw, dash) {
        ln(x1, y1, x2, y2, color, lw, dash);
        var a = Math.atan2(y2 - y1, x2 - x1);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 9 * Math.cos(a - 0.4), y2 - 9 * Math.sin(a - 0.4));
        ctx.lineTo(x2 - 9 * Math.cos(a + 0.4), y2 - 9 * Math.sin(a + 0.4));
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    }
    function circ(x, y, r, fill, stroke, lw) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        if (fill   && fill   !== 'none') { ctx.fillStyle   = fill;   ctx.fill();   }
        if (stroke && stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.4; ctx.stroke(); }
    }
    function colorOf(key) { return P[key] || P.muted; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
    function seg(t, a, b) { return clamp01((t - a) / (b - a)); }
    function lines(str, maxW, fs) {
        ctx.font = '700 ' + fs + 'px "JetBrains Mono",monospace';
        return window.CsFlow.wrapText(ctx, str, maxW);
    }

    /* ===================== 엔진: 행 배정 ===================== */
    var PC = [P.teal, P.orange, P.purple, P.green];
    var ROWS = [];
    (function () {
        var rg = ['KR', 'KR', 'US', 'JP', 'KR', 'US'];
        var i;
        for (i = 0; i < 24; i++) ROWS.push({ id: i + 1, month: i < 6 ? 1 : i < 11 ? 2 : i < 18 ? 3 : 4, region: rg[i % 6] });
    })();
    var SCHEMES = {
        range: { names: ['p_2024_01', 'p_2024_02', 'p_2024_03', 'p_2024_04'], subs: ['1월', '2월', '3월', '4월'], key: function (r) { return r.month - 1; } },
        list: { names: ['p_KR', 'p_US', 'p_JP'], subs: ['KR', 'US', 'JP'], key: function (r) { return ['KR', 'US', 'JP'].indexOf(r.region); } },
        hash: { names: ['p_0', 'p_1', 'p_2', 'p_3'], subs: ['id % 4 = 0', 'id % 4 = 1', 'id % 4 = 2', 'id % 4 = 3'], key: function (r) { return r.id % 4; } }
    };
    function partsOf(scheme) {
        var out = [];
        var sc = SCHEMES[scheme];
        if (!sc) {
            out.push({ name: 'orders', sub: '파티션 없음', ids: ROWS.map(function (r) { return r.id; }) });
            return out;
        }
        sc.names.forEach(function (n, i) { out.push({ name: n, sub: sc.subs[i], ids: [] }); });
        ROWS.forEach(function (r) { out[sc.key(r)].ids.push(r.id); });
        return out;
    }
    function cnt(scheme, k) {
        return partsOf(scheme)[k].ids.length;
    }

    /* ===================== 데이터: 분할 방식 ===================== */
    var SCH_STEPS = [];
    function pstep(scheme, q, scan, cap, cap2, cap3, log) {
        return { kind: 'parts', parts: partsOf(scheme), q: q, scan: scan, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }
    (function () {
        SCH_STEPS.push(pstep(null, '', null, '큰 테이블을 기준 열로 쪼갠다', '쿼리에서는 여전히 하나의 테이블', 'orders 24행 (예시)', '파티셔닝은 논리적으로 하나인 큰 테이블을 더 작은 물리 조각(파티션)으로 나누는 방법입니다. 여기서는 주문 24행이 든 orders 테이블(id, month, region)을 예로 듭니다. 아래 STEP으로 같은 24행이 세 가지 방식으로 나뉘는 모습을 봅니다. 행 수와 값은 설명을 위해 만든 예시입니다.'));
        SCH_STEPS.push(pstep('range', '', null, 'Range: 값의 범위로 나눔', 'month를 파티션 키로 사용', cnt('range', 0) + ' · ' + cnt('range', 1) + ' · ' + cnt('range', 2) + ' · ' + cnt('range', 3) + '행', 'Range 파티셔닝은 파티션 키의 값 범위로 행을 나눕니다. month를 키로 하면 1월부터 4월까지 네 파티션에 각각 ' + cnt('range', 0) + ', ' + cnt('range', 1) + ', ' + cnt('range', 2) + ', ' + cnt('range', 3) + '행이 들어갑니다. 범위끼리는 겹치지 않습니다. 날짜나 시간처럼 이어지는 값에 잘 맞고, 오래된 기간의 파티션만 떼어 내거나 지우기 쉽습니다.'));
        SCH_STEPS.push(pstep('list', '', null, 'List: 값 목록으로 나눔', 'region을 파티션 키로 사용', cnt('list', 0) + ' · ' + cnt('list', 1) + ' · ' + cnt('list', 2) + '행', 'List 파티셔닝은 키 값이 어느 값 목록에 속하는지로 나눕니다. region을 키로 하면 KR ' + cnt('list', 0) + '행, US ' + cnt('list', 1) + '행, JP ' + cnt('list', 2) + '행으로 나뉩니다. 국가나 상태 코드처럼 값이 몇 가지로 정해진 열에 맞습니다. 값의 분포에 따라 파티션 크기가 고르지 않을 수 있습니다.'));
        SCH_STEPS.push(pstep('hash', '', null, 'Hash: 해시 값으로 고르게 나눔', 'id를 4로 나눈 나머지로 배정 (단순화)', cnt('hash', 0) + ' · ' + cnt('hash', 1) + ' · ' + cnt('hash', 2) + ' · ' + cnt('hash', 3) + '행', 'Hash 파티셔닝은 키 값의 해시를 modulus로 나눈 나머지로 행을 배정합니다(보통 modulus를 파티션 수와 같게 둡니다). 여기서는 설명을 위해 id % 4로 단순화했고, 실제 PostgreSQL은 파티션마다 MODULUS와 REMAINDER를 지정합니다. 네 파티션에 6행씩 고르게 들어갑니다. 키의 범위를 찾는 조회는 파티션을 골라내기 어렵습니다.'));
        SCH_STEPS.push(pstep('range', '', null, '키와 방식은 쿼리 모양에 맞춰 고른다', 'Range: 기간 · List: 값 목록 · Hash: 고른 분산', '', '정리 — 파티셔닝은 큰 테이블을 키 기준으로 나눈 조각들입니다. Range는 이어지는 값, List는 정해진 값 목록, Hash는 고른 분산에 맞습니다. 어떤 키로 나눌지는 자주 쓰는 WHERE 조건에 맞춰 정해야 하고, 그래야 다음 탭의 파티션 프루닝이 효과를 냅니다.'));
    })();

    /* ===================== 데이터: 파티션 프루닝 ===================== */
    var PRU_STEPS = [];
    (function () {
        PRU_STEPS.push(pstep('range', '', null, '프루닝: 필요 없는 파티션은 건너뜀', 'WHERE의 파티션 키 조건으로 판단', '파티션 4개 · 24행', '파티션 프루닝은 쿼리의 WHERE 조건을 보고 계획 수립 또는 실행 중에 읽을 필요가 없는 파티션을 제외하는 최적화입니다. 이 예는 month로 Range 파티셔닝한 orders입니다. 아래 STEP으로 조건에 따라 읽는 파티션이 달라지는 모습을 봅니다.'));
        PRU_STEPS.push(pstep('range', "WHERE month = 3", [0, 0, 1, 0], '키 조건이라 p_2024_03만 읽음', '나머지 3개 파티션은 건너뜀', '검사 대상 ' + cnt('range', 2) + '행 / 24행', 'WHERE month = 3은 파티션 키 조건이므로 옵티마이저가 3월 파티션만 남기고 나머지 3개를 계획에서 뺍니다. 검사 대상 행이 24행에서 ' + cnt('range', 2) + '행으로 줄어듭니다. 파티션 안에서 인덱스를 쓰는 것과는 별개로 읽을 테이블 자체가 작아지는 효과입니다.'));
        PRU_STEPS.push(pstep('range', "WHERE month BETWEEN 2 AND 3", [0, 1, 1, 0], '범위 조건도 해당 파티션만 읽음', '2월 · 3월 파티션 2개', '검사 대상 ' + (cnt('range', 1) + cnt('range', 2)) + '행 / 24행', 'Range 파티션은 범위 조건에도 프루닝이 동작합니다. 2월부터 3월 사이의 값이 들어갈 수 있는 파티션 2개만 읽으므로 ' + cnt('range', 1) + '행과 ' + cnt('range', 2) + '행, 모두 ' + (cnt('range', 1) + cnt('range', 2)) + '행이 검사 대상입니다.'));
        PRU_STEPS.push(pstep('range', "WHERE region = 'KR'", [1, 1, 1, 1], '키가 아닌 열로 찾으면 전부 읽음', '4개 파티션 모두 검사', '검사 대상 24행 / 24행', 'region은 파티션 키가 아니므로 어느 파티션에 KR 행이 있는지 알 수 없어 4개 파티션을 모두 검사합니다. 이 경우 프루닝의 이점이 없습니다. 자주 쓰는 조건에 맞는 열을 키로 골라야 하는 이유입니다.'));
        PRU_STEPS.push(pstep('range', '', null, '프루닝이 되려면 WHERE에 파티션 키가 있어야 한다', 'EXPLAIN으로 읽는 파티션을 확인', '', '정리 — 파티션 프루닝은 WHERE에 파티션 키 조건이 있을 때 동작하고, 키 조건이 없는 쿼리는 모든 파티션을 훑습니다. 실제로 어느 파티션이 선택되었는지는 EXPLAIN으로 확인합니다. PostgreSQL에서는 enable_partition_pruning 설정이 기본으로 켜져 있습니다.'));
    })();

    /* ===================== 데이터: 파티셔닝과 샤딩 ===================== */
    var SC_STEPS = [];
    function sstep(sv, cap, cap2, cap3, log) {
        return { kind: 'scope', app: 'SELECT ... FROM orders', sv: sv, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }
    (function () {
        var rp = partsOf('range');
        SC_STEPS.push(sstep([{ title: '서버 1', inner: [{ name: 'orders', n: 24, c: 0 }] }], '테이블 하나가 너무 커졌다', '행 24개가 서버 한 대의 테이블 하나에', '', '테이블이 커지면 인덱스 관리, 정리 작업, 보관 기간이 지난 행의 삭제 같은 관리가 부담스러워집니다. 나누는 방법에는 크게 파티셔닝과 샤딩이 있습니다. 아래 STEP으로 둘이 데이터를 두는 위치의 차이를 봅니다.'));
        SC_STEPS.push(sstep([{ title: '서버 1 (DB 한 대)', inner: rp.map(function (p, i) { return { name: p.name, n: p.ids.length, c: i }; }) }], '파티셔닝: 보통 한 DB 안에서 나눔', '앱은 여전히 orders 하나를 조회', '파티션 4개 · 서버 1대', '파티셔닝은 보통 한 데이터베이스 안에서 테이블을 여러 파티션으로 나눕니다. 응용 프로그램은 SELECT ... FROM orders처럼 하나의 테이블을 조회하고, 어느 파티션을 읽을지는 데이터베이스가 정합니다. 파티션은 보통 같은 서버에서 처리됩니다.'));
        SC_STEPS.push(sstep([0, 1, 2, 3].map(function (i) { return { title: '서버 ' + (i + 1), inner: [{ name: '샤드 ' + (i + 1), n: 6, c: i }] }; }), '샤딩: 여러 서버에 나눠 저장', '어느 서버로 보낼지 정하는 라우팅이 필요', '서버 4대 · 서버마다 6행', '샤딩은 데이터를 여러 서버에 나눠 저장합니다. 서버를 늘려 저장 용량과 처리량을 키울 수 있는 대신, 어느 샤드에 보낼지 정하는 라우팅과 샤드를 넘나드는 조인, 트랜잭션 같은 부담이 생깁니다. 자세한 내용은 샤딩 토픽에서 봅니다.'));
        SC_STEPS.push(sstep([{ title: '샤드 1 (서버 1)', inner: [{ name: rp[0].name, n: rp[0].ids.length, c: 0 }, { name: rp[1].name, n: rp[1].ids.length, c: 1 }] }, { title: '샤드 2 (서버 2)', inner: [{ name: rp[2].name, n: rp[2].ids.length, c: 2 }, { name: rp[3].name, n: rp[3].ids.length, c: 3 }] }], '파티셔닝 = 보통 한 DB 안, 샤딩 = 여러 서버', '둘은 목적이 달라 함께 쓰기도 함', '서버 2대 · 서버마다 파티션 2개', '정리 — 파티셔닝은 보통 한 데이터베이스 안에서 테이블을 나누고, 샤딩은 데이터를 여러 서버에 나눕니다. 둘은 풀려는 문제가 달라 함께 쓰기도 합니다. 위 그림은 서버 두 대에 데이터를 나누고 각 서버 안에서 다시 월별 파티션으로 나눈 예입니다.'));
    })();

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'prune') return PRU_STEPS;
        if (mode === 'scope') return SC_STEPS;
        return SCH_STEPS;
    }
    function defaultLog() {
        if (mode === 'prune') return '쿼리 조건에 따라 읽는 파티션이 달라지는 파티션 프루닝을 봅니다.';
        if (mode === 'scope') return '파티셔닝과 샤딩이 데이터를 두는 위치의 차이를 봅니다.';
        return '큰 테이블이 Range, List, Hash 방식으로 나뉘는 모습을 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function pcol(k) { return [P.teal, P.orange, P.purple, P.green][k % 4]; }
    function geom(parts, x0, w, mob) {
        var n = parts.length;
        var gap = mob ? 8 : 12;
        var bw = (w - gap * (n - 1)) / n;
        var cs = mob ? 11 : 13, cg = 3;
        var cols = Math.max(1, Math.floor((bw - 12 + cg) / (cs + cg)));
        var maxn = 0;
        parts.forEach(function (p) { if (p.ids.length > maxn) maxn = p.ids.length; });
        var crow = Math.ceil(maxn / cols);
        return { n: n, gap: gap, bw: bw, cs: cs, cg: cg, cols: cols, bh: 56 + crow * (cs + cg) + 24, ox: (bw - (cols * (cs + cg) - cg)) / 2 };
    }
    function cellPos(G, parts, x0, y0) {
        var map = {};
        parts.forEach(function (p, k) {
            p.ids.forEach(function (id, j) {
                map[id] = [x0 + k * (G.bw + G.gap) + G.ox + (j % G.cols) * (G.cs + G.cg), y0 + 48 + Math.floor(j / G.cols) * (G.cs + G.cg), k];
            });
        });
        return map;
    }
    function shortName(name, boxW) {
        return boxW < 84 ? name.replace('p_2024_', 'p_') : name;
    }
    function layout(w, mob, s) {
        var fs = mob ? 11 : 12;
        if (mode === 'scope') return { fs: fs, total: mob ? 370 : 330 };
        var worst = 0;
        ['range', 'list', 'hash', null].forEach(function (sc) {
            var h = geom(partsOf(sc), 0, w, mob).bh;
            if (h > worst) worst = h;
        });
        return { fs: fs, total: 30 + 14 + worst + 48 + (mob ? 130 : 100) };
    }
    function sceneH(w, mob, s) { return layout(w, mob, s).total; }

    function caps(s, cx, w, y, fs) {
        var yy = y;
        [[s.cap, P.yellow, true, fs], [s.cap2, P.text, false, fs - 1], [s.cap3, P.green, true, fs - 1]].forEach(function (c) {
            if (!c[0]) return;
            var ls = lines(c[0], w - 12, c[3]);
            ls.forEach(function (l, i) { tx(l, cx, yy + i * (c[3] + 5), c[3], c[1] + 'ee', 'center', c[2]); });
            yy += ls.length * (c[3] + 5) + 3;
        });
    }

    /* ===================== 파티션: 행이 나뉜 모습 ===================== */
    function drawParts(x0, top, w, mob, s, prev, e, fs) {
        var cx = x0 + w / 2;
        var qh = 30;
        if (s.q) {
            rr(x0, top, w, qh, 8, P.purple + '22', P.purple + 'ff', 1.8);
            tx(s.q, cx, top + qh / 2, fs + 0.5, P.text + 'ff', 'center', true);
        }
        var y0 = top + qh + 14;
        var G = geom(s.parts, x0, w, mob);
        var cur = cellPos(G, s.parts, x0, y0);
        var pv = prev && prev.kind === 'parts' ? prev : s;
        var G0 = geom(pv.parts, x0, w, mob);
        var from = cellPos(G0, pv.parts, x0, y0);
        var move = clamp01(e * 1.25);
        var ease = move * move * (3 - 2 * move);
        var scanned = 0;
        s.parts.forEach(function (p, k) {
            var x = x0 + k * (G.bw + G.gap);
            var skip = !!s.scan && !s.scan[k];
            var col = skip ? P.sub : pcol(k);
            rr(x, y0, G.bw, G.bh, 8, col + (skip ? '11' : '22'), col + (skip ? '88' : 'ff'), skip ? 1.2 : 2);
            tx(shortName(p.name, G.bw), x + G.bw / 2, y0 + 15, fs, skip ? P.sub + 'ff' : P.text + 'ff', 'center', true);
            tx(p.sub, x + G.bw / 2, y0 + 33, fs - 1, P.sub + 'ff', 'center', false);
            tx(p.ids.length + '행', x + G.bw / 2, y0 + G.bh - 11, fs - 1, skip ? P.sub + 'ff' : P.text + 'ff', 'center', true);
            if (s.scan && !skip) {
                scanned += p.ids.length;
                var sweep = seg(e, 0.1, 0.8);
                ctx.save();
                ctx.beginPath(); ctx.rect(x, y0, G.bw, G.bh); ctx.clip();
                ctx.fillStyle = P.green + '33';
                ctx.fillRect(x, y0, G.bw * sweep, G.bh);
                ctx.fillStyle = P.green + 'ff';
                ctx.fillRect(x + G.bw * sweep - 2, y0, 2, G.bh);
                ctx.restore();
            }
        });
        ROWS.forEach(function (r) {
            var a = from[r.id] || cur[r.id], b = cur[r.id];
            var k = b[2];
            var skip = !!s.scan && !s.scan[k];
            var px = lerp(a[0], b[0], ease), py = lerp(a[1], b[1], ease);
            var c = skip ? P.sub : pcol(k);
            var read = s.scan && !skip && seg(e, 0.1, 0.8) * G.bw + 0 > (b[0] - (x0 + k * (G.bw + G.gap)));
            rr(px, py, G.cs, G.cs, 2, (read ? P.green : c) + (skip ? '55' : 'cc'), 'none', 0);
        });
        var yb = y0 + G.bh + 12;
        if (s.scan) {
            s.parts.forEach(function (p, k) {
                var skip = !s.scan[k];
                var x = x0 + k * (G.bw + G.gap);
                tx(skip ? '건너뜀' : '읽음', x + G.bw / 2, yb + 2, fs - 1, (skip ? P.sub : P.green) + 'ff', 'center', true);
            });
            var pc = pv.scan ? pv.parts.reduce(function (a, p, k) { return a + (pv.scan[k] ? p.ids.length : 0); }, 0) : 24;
            var cnt = lerp(pc, scanned, ease);
            var bw2 = Math.min(w - 20, 300);
            tx('검사 대상 ' + Math.round(cnt) + '행 / 24행', cx, yb + 24, fs, P.green + 'ff', 'center', true);
            rr(cx - bw2 / 2, yb + 36, bw2, 10, 5, 'none', P.muted + '99', 1.2);
            rr(cx - bw2 / 2, yb + 36, Math.max(6, bw2 * cnt / 24), 10, 5, P.green + 'aa', P.green + 'ff', 1.2);
            caps({ cap: s.cap, cap2: s.cap2 }, cx, w, yb + 66, fs);
        } else {
            caps(s, cx, w, yb + 22, fs);
        }
    }

    /* ===================== 서버: 파티셔닝과 샤딩 ===================== */
    function drawScope(x0, top, w, mob, s, prev, e, fs) {
        var cx = x0 + w / 2;
        var ah = 32;
        var n = s.sv.length;
        var gap = mob ? 8 : 12;
        var sw = (w - gap * (n - 1)) / n;
        var sh = mob ? 116 : 112;
        var sy = top + ah + 34;
        rr(x0 + w * 0.1, top, w * 0.8, ah, 8, P.purple + '22', P.purple + 'ff', 1.8);
        tx(s.app, cx, top + ah / 2, fs + 0.5, P.text + 'ff', 'center', true);
        var te = seg(e, 0, 0.5), be = seg(e, 0.3, 1);
        s.sv.forEach(function (sv, k) {
            var x = x0 + k * (sw + gap);
            var tgtX = x + sw / 2;
            ln(cx, top + ah, lerp(cx, tgtX, te), lerp(top + ah, sy, te), P.sub + 'ff', 1.6);
            if (te < 1) circ(lerp(cx, tgtX, te), lerp(top + ah, sy, te), 5, P.yellow + 'ff', 'none');
            ctx.globalAlpha = clamp01(be * 1.5);
            rr(x, sy, sw, sh, 8, P.sub + '11', P.sub + 'ff', 1.8);
            tx(sv.title, x + sw / 2, sy + 15, fs - 0.5, P.text + 'ff', 'center', true);
            var m = sv.inner.length, ig = 6;
            var iw = (sw - 12 - ig * (m - 1)) / m;
            var ih = sh - 40;
            sv.inner.forEach(function (it, j) {
                var col = pcol(it.c);
                var ix = x + 6 + j * (iw + ig);
                var grow = clamp01(be * 1.4 - j * 0.15);
                rr(ix, sy + 32 + ih * (1 - grow) / 2, iw, ih * grow, 6, col + '33', col + 'ff', 1.8);
                if (grow > 0.8) {
                    tx(shortName(it.name, iw), ix + iw / 2, sy + 32 + ih / 2 - 9, fs - 1, P.text + 'ff', 'center', true);
                    tx(it.n + '행', ix + iw / 2, sy + 32 + ih / 2 + 10, fs - 1, P.text + 'ff', 'center', false);
                }
            });
            ctx.globalAlpha = 1;
        });
        caps(s, cx, w, sy + sh + 26, fs);
    }

    /* ===================== 장면 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var fs = mob ? 11 : 12;
        var e = clamp01(t);
        var s = step || (mode === 'scope' ? SC_STEPS[0] : { kind: 'parts', parts: partsOf(null), q: '', scan: null, cap: '', cap2: '', cap3: '' });
        if (mode === 'scope') drawScope(x0, top, w, mob, s, prev, e, fs);
        else drawParts(x0, top, w, mob, s, prev, e, fs);
    }

    /* ===================== 메인 드로우 ===================== */
    function sidePad(w) { return w < 600 ? 14 : 24; }
    function topPad(w) { return w < 600 ? 14 : 20; }

    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        var W = GW(); var mob = W < 600;
        var steps = currentSteps();
        var step = stepIdx >= 0 ? steps[stepIdx] : null;
        var prev = stepIdx > 0 ? steps[stepIdx - 1] : null;
        drawScene(sidePad(W), topPad(W), W - sidePad(W) * 2, mob, step, prev, anim);
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH = 260;
        currentSteps().concat([null]).forEach(function (s) {
            var h = topPad(w) + sceneH(w - sidePad(w) * 2, mob, s) + 14;
            if (h > neededH) neededH = h;
        });
        canvasWrap.style.height    = 'auto';
        canvasWrap.style.minHeight = Math.ceil(neededH) + 'px';
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
        var dur = Math.max(320, speed * 0.55);
        var t0 = null;
        function frame(now) {
            if (t0 === null) t0 = now;
            var p = Math.min(1, (now - t0) / dur);
            anim = p;
            draw();
            if (p < 1) { rafId = requestAnimationFrame(frame); }
            else { rafId = null; anim = 1; if (onDone) onDone(); }
        }
        anim = 0;
        rafId = requestAnimationFrame(frame);
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) { speedBtns.forEach(function (b) { b.disabled = v; }); }

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
        running = false; stepIdx = -1; anim = 1;
        btnPlay.disabled = false; btnStep.disabled = false;
        logEl.textContent = defaultLog();
        setSpeedDisabled(false);
        resize();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        speedBtns.forEach(function (b) { b.classList.remove('tp-viz__speed-btn--active'); });
        btn.classList.add('tp-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('tp-viz__mode-btn--active', d.key === m); });
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