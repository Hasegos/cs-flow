/**
 * 정규화 시각화
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
    var root    = el('div', 'normalize-viz');
    var toolbar = el('div', 'normalize-viz__toolbar');
    var tbLeft  = el('div', 'normalize-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'normalize-viz__title', 'NORMAL FORM'));

    var modeWrap = el('div', 'normalize-viz__mode');
    var modeDefs = [
        { key: '1nf', label: '1NF' },
        { key: '2nf', label: '2NF' },
        { key: '3nf', label: '3NF' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'normalize-viz__mode-btn' + (i === 0 ? ' normalize-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'normalize-viz__speed');
    speedWrap.appendChild(el('span', 'normalize-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'normalize-viz__speed-btn' + (i === 0 ? ' normalize-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'normalize-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'normalize-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'normalize-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'normalize-viz__controls');
    var btnPlay  = el('button', 'normalize-viz__btn normalize-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'normalize-viz__btn', '▶| STEP');
    var btnReset = el('button', 'normalize-viz__btn', '↺ RESET');
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
    var mode    = '1nf';
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

    /* ===================== 기준 데이터 (비정규형) ===================== */
    var RAW = {
        cols: ['order_id', 'user_name', 'user_grade', 'products'],
        rows: [
            { order_id: 101, user_name: '김민준', user_grade: 'VIP', products: '노트북, 마우스' },
            { order_id: 102, user_name: '이서연', user_grade: '일반', products: '키보드' }
        ]
    };

    /* ===================== 분해 함수 (실제 실행 — 하드코딩 아님) ===================== */
    function splitToFirstNF(raw) {
        var rows = [];
        raw.rows.forEach(function (r) {
            r.products.split(',').forEach(function (p) {
                rows.push({ order_id: r.order_id, product: p.trim(), user_name: r.user_name, user_grade: r.user_grade });
            });
        });
        return { cols: ['order_id', 'product', 'user_name', 'user_grade'], pk: ['order_id', 'product'], rows: rows };
    }
    function splitToSecondNF(nf1) {
        var ordersMap = {}; var items = [];
        nf1.rows.forEach(function (r) {
            if (!ordersMap[r.order_id]) ordersMap[r.order_id] = { order_id: r.order_id, user_name: r.user_name, user_grade: r.user_grade };
            items.push({ order_id: r.order_id, product: r.product });
        });
        var orders = Object.keys(ordersMap).map(function (k) { return ordersMap[k]; });
        return {
            orders: { cols: ['order_id', 'user_name', 'user_grade'], pk: ['order_id'], rows: orders },
            items: { cols: ['order_id', 'product'], pk: ['order_id', 'product'], rows: items }
        };
    }
    function splitToThirdNF(orders2nf) {
        var usersMap = {}; var ordersRows = [];
        orders2nf.rows.forEach(function (r) {
            if (!usersMap[r.user_name]) usersMap[r.user_name] = { user_name: r.user_name, user_grade: r.user_grade };
            ordersRows.push({ order_id: r.order_id, user_name: r.user_name });
        });
        var users = Object.keys(usersMap).map(function (k) { return usersMap[k]; });
        return {
            orders: { cols: ['order_id', 'user_name'], pk: ['order_id'], rows: ordersRows },
            users: { cols: ['user_name', 'user_grade'], pk: ['user_name'], rows: users }
        };
    }

    var NF1 = splitToFirstNF(RAW);
    var NF2 = splitToSecondNF(NF1);
    var NF3 = splitToThirdNF(NF2.orders);

    var RAW_SPEC = { cols: RAW.cols, pk: ['order_id'], rows: RAW.rows, title: '주문 (비정규형)' };
    var NF1_SPEC = { cols: NF1.cols, pk: NF1.pk, rows: NF1.rows, title: '주문 (1NF)' };
    var ORD2_SPEC = { cols: NF2.orders.cols, pk: NF2.orders.pk, rows: NF2.orders.rows, title: 'ORDERS (2NF)' };
    var ITEM2_SPEC = { cols: NF2.items.cols, pk: NF2.items.pk, rows: NF2.items.rows, title: 'ORDER_ITEMS (2NF)' };
    var ORD3_SPEC = { cols: NF3.orders.cols, pk: NF3.orders.pk, rows: NF3.orders.rows, title: 'ORDERS (3NF)' };
    var USER3_SPEC = { cols: NF3.users.cols, pk: NF3.users.pk, rows: NF3.users.rows, title: 'USERS (3NF)' };

    /* ===================== 스텝 빌더 ===================== */
    function buildNf1Steps() {
        var steps = [];
        steps.push({ kind: 'intro', before: RAW_SPEC, hiCols: [], showArrow: false, after: [],
            log: '정규화되지 않은 원본 테이블입니다. products 컬럼을 살펴보세요.' });
        steps.push({ kind: 'violate', before: RAW_SPEC, hiCols: ['products'], showArrow: false, after: [],
            log: 'products 컬럼 하나에 "노트북, 마우스"처럼 여러 값이 들어있습니다 — 한 칸에는 값 하나만 있어야 한다는 원자성 규칙(1NF)을 어겼습니다.' });
        steps.push({ kind: 'transform', before: RAW_SPEC, hiCols: ['products'], showArrow: true, after: [NF1_SPEC],
            log: 'products를 쪼개서 상품 하나당 한 행으로 나눕니다. (' + RAW.rows.length + '행 → ' + NF1.rows.length + '행)' });
        steps.push({ kind: 'result', before: RAW_SPEC, hiCols: [], showArrow: true, after: [NF1_SPEC],
            log: '이제 모든 칸에 값이 하나씩만 들어있습니다 — 제1정규형(1NF)을 만족합니다. 기본키는 (order_id, product) 복합키입니다.' });
        steps.push({ kind: 'done', before: RAW_SPEC, hiCols: [], showArrow: true, after: [NF1_SPEC],
            log: '정리 — 그런데 order_id=101 행에서 김민준·VIP가 두 번 반복됩니다. 이 중복은 다음 탭(2NF)에서 다룹니다.' });
        return steps;
    }

    function buildNf2Steps() {
        var steps = [];
        steps.push({ kind: 'intro', before: NF1_SPEC, hiCols: [], showArrow: false, after: [],
            log: '이 테이블은 1NF를 만족하지만, 기본키가 (order_id, product) 복합키라는 점에 문제가 있습니다.' });
        steps.push({ kind: 'violate', before: NF1_SPEC, hiCols: ['user_name', 'user_grade'], showArrow: false, after: [],
            log: 'user_name과 user_grade는 product와 무관하게 order_id만으로 결정됩니다 — 복합키의 일부에만 종속되는 부분 함수 종속(2NF 위반)입니다.' });
        steps.push({ kind: 'transform', before: NF1_SPEC, hiCols: ['user_name', 'user_grade'], showArrow: true, after: [ORD2_SPEC, ITEM2_SPEC],
            log: 'order_id에만 의존하는 컬럼들을 별도 테이블(ORDERS)로 분리합니다.' });
        steps.push({ kind: 'result', before: NF1_SPEC, hiCols: [], showArrow: true, after: [ORD2_SPEC, ITEM2_SPEC],
            log: 'ORDERS는 주문 정보만, ORDER_ITEMS는 주문-상품 관계만 담습니다. 이제 모든 non-key 컬럼이 각 테이블 기본키 전체에 의존합니다 — 제2정규형(2NF)을 만족합니다.' });
        steps.push({ kind: 'done', before: NF1_SPEC, hiCols: [], showArrow: true, after: [ORD2_SPEC, ITEM2_SPEC],
            log: '정리 — 그런데 ORDERS의 user_grade는 사실 order_id가 아니라 user_name(어떤 사용자인지)에 의존합니다. 이 문제는 다음 탭(3NF)에서 다룹니다.' });
        return steps;
    }

    function buildNf3Steps() {
        var steps = [];
        steps.push({ kind: 'intro', before: ORD2_SPEC, hiCols: [], showArrow: false, after: [],
            log: '이 테이블은 2NF를 만족하지만, user_grade 컬럼에 문제가 있습니다.' });
        steps.push({ kind: 'violate', before: ORD2_SPEC, hiCols: ['user_grade'], showArrow: false, after: [],
            log: 'user_grade는 order_id가 아니라 user_name에 의존합니다 — order_id → user_name → user_grade로 이어지는 이행 종속(3NF 위반)입니다.' });
        steps.push({ kind: 'transform', before: ORD2_SPEC, hiCols: ['user_grade'], showArrow: true, after: [ORD3_SPEC, USER3_SPEC],
            log: 'user_name에 의존하는 컬럼을 다시 별도 테이블(USERS)로 분리합니다.' });
        steps.push({ kind: 'result', before: ORD2_SPEC, hiCols: [], showArrow: true, after: [ORD3_SPEC, USER3_SPEC],
            log: 'ORDERS는 누가 주문했는지만, USERS는 등급 정보를 담습니다. 이제 모든 non-key 컬럼이 기본키에 직접 의존합니다 — 제3정규형(3NF)을 만족합니다.' });
        steps.push({ kind: 'done', before: ORD2_SPEC, hiCols: [], showArrow: true, after: [ORD3_SPEC, USER3_SPEC],
            log: '정리 — 정규화는 반복되는 값을 제거해 "하나만 고치면 되게" 만드는 과정입니다. 다만 테이블이 잘게 나뉠수록 조회할 때 JOIN이 늘어나는 트레이드오프가 있습니다.' });
        return steps;
    }

    var NF1_STEPS = buildNf1Steps();
    var NF2_STEPS = buildNf2Steps();
    var NF3_STEPS = buildNf3Steps();

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === '2nf') return NF2_STEPS;
        if (mode === '3nf') return NF3_STEPS;
        return NF1_STEPS;
    }
    function defaultLog() { return currentSteps()[0].log; }

    /* ===================== 표 크기 ===================== */
    var COL_W = {
        d: { order_id: 84, product: 96, user_name: 112, user_grade: 92, products: 210 },
        m: { order_id: 60, product: 62, user_name: 72, user_grade: 70, products: 100 }
    };
    var TAGS = { '1nf': '✕ 한 칸에 값이 여러 개', '2nf': '✕ 부분 함수 종속', '3nf': '✕ 이행 종속' };
    var OKS = { '1nf': '✓ 1NF', '2nf': '✓ 2NF', '3nf': '✓ 3NF' };

    function tblW(spec, mob) {
        var cw = mob ? COL_W.m : COL_W.d;
        var w = 0;
        spec.cols.forEach(function (c) { w += cw[c]; });
        return w;
    }
    function tblH(spec, mob) { return (mob ? 38 : 44) + spec.rows.length * (mob ? 36 : 42); }
    function stacked(specs, mob, availW) {
        if (specs.length < 2) return false;
        var total = (mob ? 30 : 48) * (specs.length - 1);
        specs.forEach(function (s) { total += tblW(s, mob); });
        return total > availW;
    }

    /* ===================== 레이아웃 ===================== */
    function titleGap(mob) { return mob ? 18 : 22; }
    function stepH(s, w, mob) {
        var h = 0;
        var has = s.after && s.after.length;
        if (s.before) {
            h += tblH(s.before, mob);
            if (has) h += s.showArrow ? (mob ? 58 : 72) : (mob ? 30 : 36);
        }
        if (has) {
            var ah = 0;
            if (stacked(s.after, mob, w)) s.after.forEach(function (sp, si) { ah += tblH(sp, mob) + (si ? 36 : 0); });
            else s.after.forEach(function (sp) { ah = Math.max(ah, tblH(sp, mob)); });
            h += ah;
        }
        return h;
    }
    function layout(w, mob) {
        var maxH = 0;
        currentSteps().forEach(function (s) { maxH = Math.max(maxH, stepH(s, w, mob)); });
        return { fs: mob ? 12 : 13.5, total: titleGap(mob) + maxH + 12 };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function place(s, w, mob) {
        var out = { before: null, afters: [], arrowY: 0 };
        var y = 0;
        var has = s.after && s.after.length;
        if (s.before) {
            var bw = tblW(s.before, mob);
            out.before = { x: Math.max(0, (w - bw) / 2), y: 0, spec: s.before };
            y += tblH(s.before, mob);
            out.arrowY = y;
            if (has) y += s.showArrow ? (mob ? 58 : 72) : (mob ? 30 : 36);
        }
        if (!has) return out;
        if (s.after.length === 1) {
            out.afters.push({ x: Math.max(0, (w - tblW(s.after[0], mob)) / 2), y: y, spec: s.after[0] });
        } else if (stacked(s.after, mob, w)) {
            var sy = y;
            s.after.forEach(function (sp) {
                out.afters.push({ x: Math.max(0, (w - tblW(sp, mob)) / 2), y: sy, spec: sp });
                sy += tblH(sp, mob) + 36;
            });
        } else {
            var gap = mob ? 30 : 48;
            var tot = gap * (s.after.length - 1);
            s.after.forEach(function (sp) { tot += tblW(sp, mob); });
            var cx = Math.max(0, (w - tot) / 2);
            s.after.forEach(function (sp) {
                out.afters.push({ x: cx, y: y, spec: sp });
                cx += tblW(sp, mob) + gap;
            });
        }
        return out;
    }

    /* ===================== 셀 위치와 출처 ===================== */
    function cellCenter(pl, col, ri, mob) {
        var cw = mob ? COL_W.m : COL_W.d;
        var x = pl.x;
        for (var i = 0; i < pl.spec.cols.length; i++) {
            if (pl.spec.cols[i] === col) break;
            x += cw[pl.spec.cols[i]];
        }
        return { x: x + cw[col] / 2, y: pl.y + (mob ? 38 : 44) + ri * (mob ? 36 : 42) + (mob ? 18 : 21) };
    }
    function sourceRow(before, row) {
        for (var ri = 0; ri < before.rows.length; ri++) {
            var br = before.rows[ri];
            var ok = true;
            for (var c in row) {
                if (before.cols.indexOf(c) >= 0) { if (br[c] !== row[c]) { ok = false; break; } }
                else if (c === 'product' && before.cols.indexOf('products') >= 0) { if (String(br.products).indexOf(row.product) < 0) { ok = false; break; } }
            }
            if (ok) return ri;
        }
        return 0;
    }

    /* ===================== 표 그리기 ===================== */
    function drawTable(pl, mob, hiCols, o) {
        var spec = pl.spec;
        var cw = mob ? COL_W.m : COL_W.d;
        var headerH = mob ? 38 : 44, rowH = mob ? 36 : 42;
        var fs = mob ? 12 : 13.5;
        var x0 = pl.x, y0 = pl.y;
        var totalW = tblW(spec, mob);
        var colX = {};
        var acc = 0;
        spec.cols.forEach(function (c) { colX[c] = acc; acc += cw[c]; });
        var pulse = o.pulse || 1;
        ctx.globalAlpha = o.frame;
        tx(spec.title, x0, y0 - (mob ? 12 : 14), fs, P.sub + 'ff', 'left', true);
        rr(x0, y0, totalW, headerH + spec.rows.length * rowH, 6, 'none', (o.frameCol || P.sub) + '88', o.frameCol ? 2 : 1.3);
        spec.cols.forEach(function (c) {
            var isPk = spec.pk.indexOf(c) !== -1;
            var isHi = (hiCols || []).indexOf(c) !== -1;
            rr(x0 + colX[c], y0, cw[c], headerH, 0, isHi ? P.orange + (pulse > 1.2 ? '44' : '22') : P.sub + '14', 'none');
            tx(c, x0 + colX[c] + cw[c] / 2, isPk ? y0 + headerH * 0.38 : y0 + headerH / 2, fs - 1, isHi ? P.orange + 'ff' : P.text + 'ee', 'center', true);
            if (isPk) tx('PK', x0 + colX[c] + cw[c] / 2, y0 + headerH * 0.76, fs - 2, P.purple + 'ff', 'center', true);
        });
        ln(x0, y0 + headerH, x0 + totalW, y0 + headerH, P.sub + '88', 1.3);
        spec.rows.forEach(function (row, ri) {
            var ry = y0 + headerH + ri * rowH;
            if (ri > 0) ln(x0, ry, x0 + totalW, ry, P.sub + '44', 1);
            spec.cols.forEach(function (c) {
                var isHi = (hiCols || []).indexOf(c) !== -1;
                var dup = o.dup && o.dup(c, ri, row);
                var cx = x0 + colX[c];
                var a = o.cellA ? o.cellA(c, ri) : 1;
                ctx.globalAlpha = o.frame * a;
                if (isHi) rr(cx, ry, cw[c], rowH, 0, P.orange + (pulse > 1.2 ? '30' : '14'), 'none');
                if (dup) rr(cx + 2, ry + 2, cw[c] - 4, rowH - 4, 4, P.orange + (pulse > 1.2 ? '44' : '22'), P.orange + 'ff', 1.6);
                tx(String(row[c]), cx + cw[c] / 2, ry + rowH / 2, fs, (isHi || dup) ? P.orange + 'ff' : P.text + 'ee', 'center', isHi || dup);
            });
        });
        ctx.globalAlpha = o.frame;
        var vx = x0;
        spec.cols.forEach(function (c) { if (vx > x0) ln(vx, y0, vx, y0 + headerH + spec.rows.length * rowH, P.sub + '44', 1); vx += cw[c]; });
        ctx.globalAlpha = 1;
    }

    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var e = clamp01(t);
        var s = step || currentSteps()[0];
        var fs = L.fs;
        var oy = top + titleGap(mob);
        var pl = place(s, w, mob);
        function off(p0) { return { x: x0 + p0.x, y: oy + p0.y, spec: p0.spec }; }
        var tr = s.kind === 'transform';
        var pulseE = (s.kind === 'violate' || tr) && e < 1 ? 1 + 0.6 * Math.sin(e * 16) : 1;
        var bp = pl.before ? off(pl.before) : null;
        var ap = pl.afters.map(off);
        var k;

        if (bp) {
            drawTable(bp, mob, s.hiCols, { frame: 1, pulse: pulseE });
            if (s.kind === 'violate') {
                ctx.globalAlpha = clamp01(e * 2.5);
                tx(TAGS[mode], bp.x + tblW(bp.spec, mob), bp.y - (mob ? 12 : 14), fs - 1, P.red + 'ff', 'right', true);
                ctx.globalAlpha = 1;
            }
        }
        if (bp && s.showArrow && ap.length) {
            var midX = x0 + w / 2;
            var a1 = oy + pl.before.y + tblH(pl.before.spec, mob) + (mob ? 12 : 15);
            var a2 = a1 + (mob ? 20 : 25);
            ctx.globalAlpha = tr ? clamp01(e * 3) : 1;
            ln(midX, a1, midX, a2, P.teal + 'ff', 2.6);
            ctx.beginPath();
            ctx.moveTo(midX, a2 + 10);
            ctx.lineTo(midX - 8, a2);
            ctx.lineTo(midX + 8, a2);
            ctx.closePath();
            ctx.fillStyle = P.teal + 'ff';
            ctx.fill();
            tx('분리', midX + (mob ? 20 : 24), (a1 + a2) / 2 + 5, fs, P.teal + 'ff', 'left', true);
            ctx.globalAlpha = 1;
        }

        var idx = 0;
        var flights = [];
        ap.forEach(function (pl2, ai) {
            var done = s.kind === 'done';
            var dupFn = null;
            if (done && mode === '1nf') dupFn = function (c, ri, row) { return (c === 'user_name' || c === 'user_grade') && pl2.spec.rows.filter(function (r) { return r.order_id === row.order_id; }).length > 1; };
            if (done && mode === '2nf' && ai === 0) dupFn = function (c) { return c === 'user_grade'; };
            var pulse2 = done && dupFn && e < 1 ? 1 + 0.6 * Math.sin(e * 16) : 1;
            var cellA = null;
            if (tr && bp) {
                var starts = {};
                pl2.spec.rows.forEach(function (row, ri) {
                    pl2.spec.cols.forEach(function (c) {
                        var st = 0.12 + idx * 0.055;
                        starts[c + ':' + ri] = st;
                        idx++;
                        var sr = sourceRow(bp.spec, row);
                        var sc = c === 'product' && bp.spec.cols.indexOf('product') < 0 ? 'products' : c;
                        var from = cellCenter(bp, sc, sr, mob);
                        var to = cellCenter(pl2, c, ri, mob);
                        flights.push({ st: st, from: from, to: to, text: String(row[c]) });
                    });
                });
                cellA = function (c, ri) { return e >= starts[c + ':' + ri] + 0.5 ? 1 : 0; };
            }
            drawTable(pl2, mob, [], { frame: tr ? clamp01(e * 3) : 1, cellA: cellA, dup: dupFn, pulse: pulse2, frameCol: done && mode === '3nf' && e < 1 ? P.teal : null });
            if (s.kind === 'result' && ai === 0) {
                var q = clamp01(e * 2);
                ctx.globalAlpha = q;
                tx(OKS[mode], pl2.x + tblW(pl2.spec, mob), pl2.y - (mob ? 12 : 14), fs, P.green + 'ff', 'right', true);
                ctx.globalAlpha = 1;
                if (e < 1) circ(pl2.x + tblW(pl2.spec, mob) - 16, pl2.y - (mob ? 12 : 14), 6 + e * 26, 'none', P.green + 'ff', 2);
            }
        });
        for (k = 0; k < flights.length; k++) {
            var f = flights[k];
            var q2 = clamp01((e - f.st) / 0.5);
            if (q2 <= 0 || q2 >= 1) continue;
            var ez = q2 * q2 * (3 - 2 * q2);
            var fx = lerp(f.from.x, f.to.x, ez);
            var fy = lerp(f.from.y, f.to.y, ez) - Math.sin(ez * Math.PI) * 10;
            tx(f.text, fx, fy, fs, P.yellow + 'ff', 'center', true);
        }
        if (tr && bp && e < 1) {
            for (k = 0; k < flights.length; k++) {
                var f2 = flights[k];
                if (e >= f2.st && e < f2.st + 0.25) circ(f2.from.x, f2.from.y, 4 + (e - f2.st) * 40, 'none', P.yellow + 'ff', 1.4);
            }
        }
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
        speedBtns.forEach(function (b) { b.classList.remove('normalize-viz__speed-btn--active'); });
        btn.classList.add('normalize-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('normalize-viz__mode-btn--active', d.key === m); });
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