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
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

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
    var mode    = 'scheme';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'prune') return PRU_STEPS;
        if (mode === 'scope') return SC_STEPS;
        return SCH_STEPS;
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

    /* ===================== 파티션: 행이 나뉜 모습 ===================== */
    function drawParts(x0, top, w, mob, s) {
        var fs = mob ? 11.5 : 13;
        var n = s.parts.length;
        var gap = mob ? 8 : 12;
        var bw = (w - gap * (n - 1)) / n;
        var cs = mob ? 11 : 13;
        var cg = 3;
        var qh = mob ? 28 : 30;
        var y0 = top;
        var k;
        var j;
        if (s.q) {
            rr(x0, top, w, qh, 6, P.purple + '22', P.purple + 'ff', 1.6);
            tx(s.q, x0 + w / 2, top + qh / 2, fs, P.text + 'ff', 'center', true);
        }
        y0 = top + qh + 14;
        var cols = Math.max(1, Math.floor((bw - 12 + cg) / (cs + cg)));
        var maxn = 0;
        s.parts.forEach(function (p) { if (p.ids.length > maxn) maxn = p.ids.length; });
        var crow = Math.ceil(maxn / cols);
        var bh = 50 + crow * (cs + cg) + 22;
        var ox = (bw - (cols * (cs + cg) - cg)) / 2;
        for (k = 0; k < n; k++) {
            var p = s.parts[k];
            var x = x0 + k * (bw + gap);
            var skip = !!s.scan && !s.scan[k];
            var col = skip ? P.sub : PC[k % 4];
            rr(x, y0, bw, bh, 6, col + (skip ? '11' : '22'), col + (skip ? '88' : 'ff'), skip ? 1.2 : 2);
            tx(p.name, x + bw / 2, y0 + 14, fs - 0.5, skip ? P.sub + 'ff' : P.text + 'ff', 'center', true);
            tx(p.sub, x + bw / 2, y0 + 32, fs - 1, P.sub + 'ff', 'center', false);
            for (j = 0; j < p.ids.length; j++) {
                rr(x + ox + (j % cols) * (cs + cg), y0 + 46 + Math.floor(j / cols) * (cs + cg), cs, cs, 2, col + (skip ? '55' : 'cc'), 'none', 0);
            }
            tx(p.ids.length + '행', x + bw / 2, y0 + bh - 12, fs - 1, skip ? P.sub + 'ff' : P.text + 'ff', 'center', true);
            if (s.scan) tx(skip ? '건너뜀' : '읽음', x + bw / 2, y0 + bh + 13, fs - 1, skip ? P.sub + 'ff' : P.green + 'ff', 'center', true);
        }
        drawCaps(s, x0, w, y0 + bh + (s.scan ? 34 : 20), fs);
    }

    /* ===================== 서버: 파티셔닝과 샤딩 ===================== */
    function drawScope(x0, top, w, mob, s) {
        var fs = mob ? 11.5 : 13;
        var ah = mob ? 28 : 30;
        var n = s.sv.length;
        var gap = mob ? 8 : 12;
        var sw = (w - gap * (n - 1)) / n;
        var sh = mob ? 100 : 108;
        var sy = top + ah + 28;
        var k;
        var j;
        rr(x0 + w * 0.1, top, w * 0.8, ah, 6, P.purple + '22', P.purple + 'ff', 1.6);
        tx(s.app, x0 + w / 2, top + ah / 2, fs, P.text + 'ff', 'center', true);
        for (k = 0; k < n; k++) {
            var x = x0 + k * (sw + gap);
            ctx.beginPath();
            ctx.moveTo(x0 + w / 2, top + ah);
            ctx.lineTo(x + sw / 2, sy);
            ctx.strokeStyle = P.sub + 'ff';
            ctx.lineWidth = 1.4;
            ctx.stroke();
            rr(x, sy, sw, sh, 6, P.sub + '11', P.sub + 'ff', 1.6);
            tx(s.sv[k].title, x + sw / 2, sy + 14, fs - 0.5, P.text + 'ff', 'center', true);
            var m = s.sv[k].inner.length;
            var ig = 6;
            var iw = (sw - 12 - ig * (m - 1)) / m;
            var ih = sh - 38;
            for (j = 0; j < m; j++) {
                var it = s.sv[k].inner[j];
                var col = PC[it.c % 4];
                var ix = x + 6 + j * (iw + ig);
                rr(ix, sy + 30, iw, ih, 5, col + '33', col + 'ff', 1.6);
                tx(it.name, ix + iw / 2, sy + 30 + ih / 2 - 9, fs - 1, P.text + 'ff', 'center', true);
                tx(it.n + '행', ix + iw / 2, sy + 30 + ih / 2 + 10, fs - 1, P.text + 'ff', 'center', false);
            }
        }
        drawCaps(s, x0, w, sy + sh + 24, fs);
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
        if (dsStep.kind === 'scope') drawScope(padX, top, fullW, mob, dsStep);
        else drawParts(padX, top, fullW, mob, dsStep);

        if (!step) {
            var hint = '아래 STEP으로 테이블 파티셔닝의 동작을 확인하세요.';
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
        neededH = mob ? 300 : 290;
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
        if (mode === 'prune') return '쿼리 조건에 따라 읽는 파티션이 달라지는 과정을 봅니다.';
        if (mode === 'scope') return '파티셔닝과 샤딩이 데이터를 두는 위치의 차이를 봅니다.';
        return '같은 테이블을 Range, List, Hash 세 방식으로 나누는 과정을 봅니다.';
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