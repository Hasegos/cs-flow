/**
 * NoSQL 데이터 모델 비교 시각화
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
    var root    = el('div', 'nosql-viz');
    var toolbar = el('div', 'nosql-viz__toolbar');
    var tbLeft  = el('div', 'nosql-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'nosql-viz__title', 'DATA MODEL'));

    var modeWrap = el('div', 'nosql-viz__mode');
    var modeDefs = [
        { key: 'kv', label: 'Key-Value' },
        { key: 'doc', label: 'Document' },
        { key: 'graph', label: 'Graph' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'nosql-viz__mode-btn' + (i === 0 ? ' nosql-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'nosql-viz__speed');
    speedWrap.appendChild(el('span', 'nosql-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'nosql-viz__speed-btn' + (i === 0 ? ' nosql-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'nosql-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'nosql-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'nosql-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'nosql-viz__controls');
    var btnPlay  = el('button', 'nosql-viz__btn nosql-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'nosql-viz__btn', '▶| STEP');
    var btnReset = el('button', 'nosql-viz__btn', '↺ RESET');
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
    var mode    = 'kv';
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



    /* ===================== 장면 데이터: NoSQL 데이터 모델 ===================== */
    function st(log, o) {
        var s = { log: log, put: {}, get: [], rd: 0, join: false, show: { name: 0, orders: 0, nested: 0 }, hl: '', nodes: {}, edges: {}, hop: 0, cap: '' };
        for (var k in o) s[k] = o[k];
        return s;
    }

    var KV_STEPS = [
        st('Key-Value 저장소는 키 하나로 값 하나를 저장합니다. 키를 해시해 값이 놓일 칸(버킷)을 정합니다.', { cap: '키 → 해시 → 버킷' }),
        st('SET user:1001: 키를 해시하면 버킷 2가 나오고, 사용자 정보가 그 칸에 저장됩니다.', { put: { 2: ['user:1001', '{ name: "Alice", grade: "VIP" }'] }, hot: 2, hash: 'user:1001', cap: 'hash("user:1001") = 2' }),
        st('주문 내역은 보통 별도의 키(orders:1001)로 따로 저장합니다. 해시 결과는 버킷 0입니다.', { put: { 2: ['user:1001', '{ name: "Alice", grade: "VIP" }'], 0: ['orders:1001', '[ "Order#1", "Order#2" ]'] }, hot: 0, hash: 'orders:1001', cap: 'hash("orders:1001") = 0' }),
        st('GET user:1001: 키를 해시한 값으로 버킷을 곧바로 찾아가므로 전체를 훑지 않습니다. 빠른 이유입니다.', { put: { 2: ['user:1001', '{ name: "Alice", grade: "VIP" }'], 0: ['orders:1001', '[ "Order#1", "Order#2" ]'] }, hot: 2, hash: 'user:1001', get: [2], rd: 1, cap: '버킷으로 바로 점프 — 읽기 1번' }),
        st('사용자와 주문을 함께 보려면 애플리케이션이 두 키를 각각 조회해서 직접 조합해야 합니다.', { put: { 2: ['user:1001', '{ name: "Alice", grade: "VIP" }'], 0: ['orders:1001', '[ "Order#1", "Order#2" ]'] }, hot: -1, get: [2, 0], rd: 2, join: true, cap: '읽기 2번 + 앱에서 조합' }),
        st('정리: Key-Value는 단순하고 빠르지만, 관계 표현은 전부 애플리케이션의 몫입니다.', { put: { 2: ['user:1001', '{ name: "Alice", grade: "VIP" }'], 0: ['orders:1001', '[ "Order#1", "Order#2" ]'] }, hot: -1, join: true, rd: 2, cap: '단순함 · 속도 ↔ 관계는 앱이 처리' })
    ];

    var DOC_LINES = [
        { t: '{', ind: 0, k: 'always' },
        { t: 'name: "Alice",', ind: 1, k: 'name' },
        { t: 'grade: "VIP",', ind: 1, k: 'name' },
        { t: 'orders: [', ind: 1, k: 'orders' },
        { t: '{ id: 1, item: "Book" },', ind: 2, k: 'orders', ord: 1 },
        { t: '{ id: 2, item: "Pen" }', ind: 2, k: 'orders', ord: 2 },
        { t: '],', ind: 1, k: 'orders' },
        { t: 'address: { city: "Seoul" }', ind: 1, k: 'nested' },
        { t: '}', ind: 0, k: 'always' }
    ];
    var DOC_STEPS = [
        st('Document 저장소는 관련 데이터를 하나의 문서(JSON) 안에 중첩해서 저장합니다. 먼저 사용자의 기본 필드입니다.', { show: { name: 1, orders: 0, nested: 0 }, cap: '문서 = 사용자 정보' }),
        st('주문 내역이 문서 안에 배열로 포함되어 있습니다. 사용자와 주문이 한 덩어리입니다.', { show: { name: 1, orders: 1, nested: 0 }, cap: '주문이 문서 안에 들어 있음' }),
        st('문서 안에 또 다른 구조(배송지 같은 객체)를 얼마든지 중첩할 수 있습니다.', { show: { name: 1, orders: 1, nested: 1 }, cap: '객체 안의 객체' }),
        st('문서 하나만 읽으면 사용자와 주문이 한 번에 옵니다. 조인이 필요 없습니다.', { show: { name: 1, orders: 1, nested: 1 }, hl: 'all', rd: 1, cap: '읽기 1번으로 끝' }),
        st('문서 안의 필드로도 조회할 수 있습니다. 예를 들어 주문 항목이 Book인 문서를 찾습니다.', { show: { name: 1, orders: 1, nested: 1 }, hl: 'book', rd: 1, cap: 'find({ "orders.item": "Book" })' }),
        st('정리: 다만 문서가 너무 커지거나 중첩이 깊어지면 오히려 다루기 어려워집니다.', { show: { name: 1, orders: 1, nested: 1 }, cap: '편하지만 너무 크게 키우면 부담' })
    ];

    var G_NODES = {
        alice: { x: 0.2, y: 0.34, l: 'Alice', c: 'orange' },
        order: { x: 0.2, y: 0.84, l: 'Order#1', c: 'teal' },
        book:  { x: 0.52, y: 0.9, l: 'Book', c: 'teal' },
        bob:   { x: 0.52, y: 0.14, l: 'Bob', c: 'purple' },
        carol: { x: 0.52, y: 0.54, l: 'Carol', c: 'purple' },
        dave:  { x: 0.84, y: 0.14, l: 'Dave', c: 'green' },
        eve:   { x: 0.84, y: 0.54, l: 'Eve', c: 'green' }
    };
    var G_EDGES = [
        ['alice', 'order', 'ORDERED', 'ord'], ['order', 'book', 'CONTAINS', 'ord2'],
        ['alice', 'bob', 'FRIEND', 'fr'], ['alice', 'carol', 'FRIEND', 'fr'],
        ['bob', 'dave', 'FRIEND', 'fr2'], ['carol', 'eve', 'FRIEND', 'fr2']
    ];
    function gstate(nodes, edges, hop, log, cap) { return st(log, { nodes: nodes, edges: edges, hop: hop, cap: cap }); }
    var GRAPH_STEPS = [
        gstate({ alice: 1 }, {}, 0, 'Graph 저장소는 데이터를 노드(정점)로 표현합니다. 먼저 Alice 노드입니다.', '노드 = 데이터 하나'),
        gstate({ alice: 1, order: 1 }, {}, 0, '주문도 하나의 노드입니다. Order#1 노드를 추가합니다.', '주문도 노드'),
        gstate({ alice: 1, order: 1, book: 1 }, { ord: 1, ord2: 1 }, 0, '노드 사이를 ORDERED, CONTAINS 같은 관계(엣지)로 연결합니다. 관계 자체가 데이터의 일부입니다.', '관계(엣지)도 저장됨'),
        gstate({ alice: 1, order: 1, book: 1, bob: 1, carol: 1, dave: 1, eve: 1 }, { ord: 1, ord2: 1, fr: 1, fr2: 1 }, 0, '친구 관계도 같은 방식으로 이어 붙입니다. 관계가 늘어도 구조를 바꾸지 않아도 됩니다.', '친구 네트워크 추가'),
        gstate({ alice: 1, order: 1, book: 1, bob: 1, carol: 1, dave: 1, eve: 1 }, { ord: 1, ord2: 1, fr: 1, fr2: 1 }, 1, '친구 찾기: Alice에서 FRIEND 엣지를 한 단계 따라가면 Bob과 Carol이 나옵니다.', '1단계: 친구'),
        gstate({ alice: 1, order: 1, book: 1, bob: 1, carol: 1, dave: 1, eve: 1 }, { ord: 1, ord2: 1, fr: 1, fr2: 1 }, 2, '한 단계 더 따라가면 친구의 친구 Dave와 Eve가 나옵니다. JOIN 없이 엣지를 따라가기만 합니다.', '2단계: 친구의 친구'),
        gstate({ alice: 1, order: 1, book: 1, bob: 1, carol: 1, dave: 1, eve: 1 }, { ord: 1, ord2: 1, fr: 1, fr2: 1 }, 2, '정리: Graph는 친구의 친구처럼 관계를 여러 단계 타고 들어가는 탐색에 강합니다.', '관계 탐색에 강함')
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'doc') return DOC_STEPS;
        if (mode === 'graph') return GRAPH_STEPS;
        return KV_STEPS;
    }
    function defaultLog() {
        if (mode === 'doc') return '관련 데이터를 문서 하나에 중첩해 저장하는 Document 모델을 봅니다.';
        if (mode === 'graph') return '데이터를 노드와 관계로 저장하는 Graph 모델을 봅니다.';
        return '키 하나로 값 하나를 저장하는 Key-Value 모델을 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        return { fs: mob ? 11 : 12, total: mode === 'graph' ? (mob ? 316 : 300) : (mode === 'doc' ? 292 : 274) };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function caption(s, cx, w, y, fs) {
        if (!s.cap) return;
        lines(s.cap, w - 20, fs).forEach(function (l, i) {
            tx(l, cx, y + i * (fs + 5), fs, P.yellow + 'ff', 'center', true);
        });
    }
    function readChip(n, x, y, fs) {
        rr(x - 46, y - 12, 92, 24, 12, P.purple + '22', P.purple + 'ff', 1.6);
        tx('읽기 ' + n + '번', x, y, fs, P.purple + 'ff', 'center', true);
    }

    /* ===================== Key-Value ===================== */
    function drawKV(x0, top, w, mob, s, prev, e, fs) {
        var appW = mob ? 64 : 92;
        var bw = mob ? w - appW - 34 : Math.min(w * 0.58, 280), bx = x0 + w - bw;
        var rowH = 42, by = top + 8;
        var appX = x0, appY = top + 8 + rowH * 1.5 - 22;
        rr(appX, appY, appW, 44, 10, P.orange + '1a', P.orange + 'ff', 2);
        tx('앱', appX + appW / 2, appY + 22, fs + 1, P.orange + 'ff', 'center', true);
        for (var i = 0; i < 4; i++) {
            var y = by + i * (rowH + 4);
            var it = s.put[i];
            var isHot = s.hot === i;
            var col = isHot ? P.yellow : (it ? P.teal : P.muted);
            rr(bx, y, bw, rowH, 8, col + (it ? '1a' : '08'), col + (it ? 'ff' : '66'), isHot ? 2.4 : 1.3);
            tx(String(i), bx + 12, y + rowH / 2, fs - 1, P.sub + 'ff', 'center', true);
            if (it) {
                var isNew = !(prev && prev.put[i]);
                ctx.globalAlpha = isNew ? clamp01((e - 0.3) * 2) : 1;
                tx(it[0], bx + 26, y + 13, fs, col + 'ff', 'left', true);
                ctx.font = '500 ' + (fs - 1.5) + 'px "JetBrains Mono",monospace';
                var shortVal = it[1].replace('name: "Alice", grade: "VIP"', 'Alice, VIP').replace('"Order#1", "Order#2"', '#1, #2');
                var val = ctx.measureText(it[1]).width > bw - 40 ? shortVal : it[1];
                if (ctx.measureText(val).width > bw - 40) val = val.replace(/^[\[{] | [\]}]$/g, '');
                tx(val, bx + 26, y + 29, fs - 1.5, P.text + 'dd', 'left', false);
                ctx.globalAlpha = 1;
            }
        }
        tx('버킷', bx + 12, top - 2, fs - 1, P.sub + 'ff', 'center', false);
        /* 해시 함수 표시 */
        if (s.hash) {
            var hx = (appX + appW + bx) / 2;
            var hy = top + 26;
            ctx.font = '700 ' + (fs - 0.5) + 'px "JetBrains Mono",monospace';
            var lab = 'hash(' + s.hash + ')';
            var hw = Math.min(bx - appX - appW - 6, ctx.measureText(lab).width + 14);
            tx(mob ? 'hash' : lab, hx, hy, fs - 0.5, P.purple + 'ff', 'center', true);
        }
        /* 이동 점선과 점 */
        var flows = [];
        if (s.hot >= 0 && !s.join) flows.push(s.hot);
        if (s.join) s.get.forEach(function (g) { flows.push(g); });
        flows.forEach(function (g) {
            var y = by + g * (rowH + 4) + rowH / 2;
            var ax = appX + appW, ay = appY + 22;
            ln(ax, ay, bx, y, (s.get.length ? P.green : P.yellow) + 'aa', 1.8, [5, 4]);
            if (e < 1 && !s.join) {
                var fwd = s.get.length ? 1 - e : e;
                circ(lerp(ax, bx, fwd), lerp(ay, y, fwd), 6, (s.get.length ? P.green : P.yellow) + 'ff', 'none');
            }
        });
        if (s.join && !prev.join) {
            /* 조합 표시는 아래 칩이 대신한다 */
        }
        if (s.rd) readChip(s.rd, Math.max(appX + appW / 2, x0 + 46), appY + 70, fs);
        if (s.join) {
            tx('앱이 직접 조합', x0, appY + 100, fs - 1, P.purple + 'ff', 'left', true);
        }
        caption(s, x0 + w / 2, w, by + 4 * (rowH + 4) + 18, fs);
    }

    /* ===================== Document ===================== */
    function drawDoc(x0, top, w, mob, s, e, fs) {
        var bw = Math.min(w, 420), bx = x0 + (w - bw) / 2, lh = 24;
        var h = DOC_LINES.length * lh + 16;
        rr(bx, top + 4, bw, h, 10, P.surf, P.sub + 'aa', 1.6);
        DOC_LINES.forEach(function (ln1, i) {
            var vis = ln1.k === 'always' || s.show[ln1.k];
            if (!vis) return;
            var a = ln1.k === 'always' ? 1 : (s.show[ln1.k] ? 1 : 0);
            var y = top + 4 + 8 + i * lh + lh / 2;
            var hot = s.hl === 'all' || (s.hl === 'book' && ln1.ord === 1);
            var col = P.text;
            if (ln1.k === 'orders') col = P.teal;
            if (ln1.k === 'nested') col = P.purple;
            if (ln1.k === 'name') col = P.orange;
            if (hot) {
                rr(bx + 6, y - lh / 2 + 2, bw - 12, lh - 4, 5, P.yellow + (s.hl === 'book' ? '33' : '1c'), s.hl === 'book' ? P.yellow + 'ff' : 'none', 1.6);
            }
            tx(ln1.t, bx + 14 + ln1.ind * 16, y, fs, (hot && s.hl === 'book' ? P.yellow : col) + 'ff', 'left', true);
        });
        if (s.rd) readChip(s.rd, bx + bw - 56, top + 4 + h + 22, fs);
        caption(s, x0 + w / 2, w, top + 4 + h + 22 + (s.rd ? 28 : 0), fs);
    }

    /* ===================== Graph ===================== */
    function drawGraph(x0, top, w, mob, s, prev, e, fs) {
        var gh = mob ? 210 : 196;
        function pos(k) { var n = G_NODES[k]; return [x0 + 34 + n.x * (w - 68), top + 18 + n.y * (gh - 56)]; }
        var pnodes = prev ? prev.nodes : {};
        var empty = !Object.keys(G_NODES).some(function (k) { return s.nodes[k]; });
        if (empty) {
            ctx.globalAlpha = 0.3;
            G_EDGES.forEach(function (ed) {
                var a = pos(ed[0]), b = pos(ed[1]);
                ln(a[0], a[1], b[0], b[1], P.muted + 'ff', 1.4, [4, 4]);
            });
            Object.keys(G_NODES).forEach(function (k) {
                var p = pos(k), n = G_NODES[k];
                circ(p[0], p[1], 13, 'none', P[n.c] + 'ff', 1.6);
                tx(n.l, p[0], p[1] + 25, fs, P[n.c] + 'ff', 'center', true);
            });
            ctx.globalAlpha = 1;
        }
        G_EDGES.forEach(function (ed) {
            if (!(s.nodes[ed[0]] && s.nodes[ed[1]]) || !s.edges[ed[3]]) return;
            var a = pos(ed[0]), b = pos(ed[1]);
            var isNew = !(prev && prev.edges && prev.edges[ed[3]]);
            var prog = isNew ? clamp01(e * 1.6) : 1;
            var hopHot = (ed[3] === 'fr' && s.hop >= 1) || (ed[3] === 'fr2' && s.hop >= 2);
            var col = hopHot ? (ed[3] === 'fr' ? P.yellow : P.green) : P.muted;
            var bx2 = lerp(a[0], b[0], prog), by2 = lerp(a[1], b[1], prog);
            ln(a[0], a[1], bx2, by2, col + (hopHot ? 'ff' : 'aa'), hopHot ? 2.6 : 1.8);
            if (prog > 0.9 && !mob) {
                var vert = Math.abs(a[0] - b[0]) < 4;
                tx(ed[2], (a[0] + b[0]) / 2 + (vert ? 8 : 0), (a[1] + b[1]) / 2 - (vert ? 0 : 8), fs - 2, (hopHot ? col : P.sub) + 'ff', vert ? 'left' : 'center', true);
            }
        });
        Object.keys(G_NODES).forEach(function (k) {
            if (!s.nodes[k]) return;
            var p = pos(k), n = G_NODES[k];
            var isNew = !pnodes[k];
            var a = isNew ? clamp01(e * 2) : 1;
            var col = P[n.c];
            if ((k === 'bob' || k === 'carol') && s.hop >= 1) col = P.yellow;
            if ((k === 'dave' || k === 'eve') && s.hop >= 2) col = P.green;
            var hit = ((k === 'bob' || k === 'carol') && s.hop >= 1) || ((k === 'dave' || k === 'eve') && s.hop >= 2) || (k === 'alice' && s.hop >= 1);
            ctx.globalAlpha = a;
            circ(p[0], p[1], 13, col + (hit ? '66' : '33'), col + 'ff', hit ? 3 : 2);
            tx(n.l, p[0], p[1] + 25, fs, col + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        });
        caption(s, x0 + w / 2, w, top + gh + 34, fs);
    }

    /* ===================== 장면 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var fs = mob ? 11 : 12;
        var e = clamp01(t);
        var s = step || st('', {});
        var pv = prev || st('', {});
        if (mode === 'doc') drawDoc(x0, top, w, mob, s, e, fs);
        else if (mode === 'graph') drawGraph(x0, top, w, mob, s, prev, e, fs);
        else drawKV(x0, top, w, mob, s, pv, e, fs);
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
        speedBtns.forEach(function (b) { b.classList.remove('nosql-viz__speed-btn--active'); });
        btn.classList.add('nosql-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('nosql-viz__mode-btn--active', d.key === m); });
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