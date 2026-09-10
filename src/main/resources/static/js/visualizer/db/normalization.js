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
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

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
    var mode    = '1nf';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === '2nf') return NF2_STEPS;
        if (mode === '3nf') return NF3_STEPS;
        return NF1_STEPS;
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
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }
    function seg(x1, y1, x2, y2, col, lw) {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.strokeStyle = col; ctx.lineWidth = lw || 1; ctx.stroke();
    }

    /* ===================== 컬럼 너비 (컬럼명 기준 공용) ===================== */
    var COL_W = {
        d: { order_id: 84, product: 96, user_name: 112, user_grade: 92, products: 210 },
        m: { order_id: 62, product: 76, user_name: 86, user_grade: 70, products: 156 }
    };

    /* ===================== 스키마 테이블 렌더 ===================== */
    function drawSchemaTable(x0, y0, spec, mob, hiCols) {
        var colW = mob ? COL_W.m : COL_W.d;
        var headerH = mob ? 38 : 44;
        var rowH = mob ? 36 : 42;
        var colX = {}; var totalW = 0;
        spec.cols.forEach(function (c) { colX[c] = totalW; totalW += colW[c]; });

        tx(spec.title, x0, y0 - (mob ? 12 : 14), mob ? 12.5 : 14, P.muted + 'aa', 'left', true);
        rr(x0, y0, totalW, headerH + spec.rows.length * rowH, 6, 'none', P.muted + '55', 1.3);

        spec.cols.forEach(function (c) {
            var isPk = spec.pk.indexOf(c) !== -1;
            var isHi = (hiCols || []).indexOf(c) !== -1;
            var fill = isHi ? P.orange + '22' : (P.muted + '12');
            rr(x0 + colX[c], y0, colW[c], headerH, 0, fill, 'none');
            var labelColor = isHi ? P.orange + 'ee' : (P.text + 'cc');
            var labelY = isPk ? y0 + headerH * 0.38 : y0 + headerH / 2;
            tx(c, x0 + colX[c] + colW[c] / 2, labelY, mob ? 12 : 13.5, labelColor, 'center', true);
            if (isPk) tx('PK', x0 + colX[c] + colW[c] / 2, y0 + headerH * 0.76, mob ? 9.5 : 10.5, P.purple + 'cc', 'center', true);
        });
        seg(x0, y0 + headerH, x0 + totalW, y0 + headerH, P.muted + '55', 1.3);

        spec.rows.forEach(function (row, ri) {
            var ry = y0 + headerH + ri * rowH;
            if (ri > 0) seg(x0, ry, x0 + totalW, ry, P.muted + '2a', 1);
            spec.cols.forEach(function (c) {
                var isHi = (hiCols || []).indexOf(c) !== -1;
                var cx = x0 + colX[c];
                if (isHi) rr(cx, ry, colW[c], rowH, 0, P.orange + '14', 'none');
                var color = isHi ? (P.orange + 'ee') : (P.text + 'dd');
                tx(String(row[c]), cx + colW[c] / 2, ry + rowH / 2, mob ? 12 : 13.5, color, 'center', isHi);
            });
        });
        var vx = x0;
        spec.cols.forEach(function (c) { if (vx > x0) seg(vx, y0, vx, y0 + headerH + spec.rows.length * rowH, P.muted + '2a', 1); vx += colW[c]; });

        return { width: totalW, height: headerH + spec.rows.length * rowH };
    }

    function tableWidth(spec, mob) {
        var colW = mob ? COL_W.m : COL_W.d;
        var w = 0; spec.cols.forEach(function (c) { w += colW[c]; });
        return w;
    }
    function tableHeight(spec, mob) {
        var headerH = mob ? 38 : 44, rowH = mob ? 36 : 42;
        return headerH + spec.rows.length * rowH;
    }

    /* ===================== 레이아웃 ===================== */
    function getGeom(mob) {
        return { padX: mob ? 16 : 26, titleGap: mob ? 18 : 22 };
    }

    function calcH(w) {
        var mob = w < 600;
        var G = getGeom(mob);
        var top = mob ? 16 : 20, bottom = mob ? 18 : 22;
        var steps = currentSteps();
        var maxH = 0;
        steps.forEach(function (s) {
            var h = 0;
            var hasAfter = s.after && s.after.length;
            if (s.before) {
                h += tableHeight(s.before, mob);
                if (hasAfter) h += s.showArrow ? (mob ? 58 : 72) : (mob ? 30 : 36);
            }
            if (hasAfter) {
                var afterH = 0;
                s.after.forEach(function (spec) { afterH = Math.max(afterH, tableHeight(spec, mob)); });
                h += afterH;
            }
            if (h > maxH) maxH = h;
        });
        return top + G.titleGap + maxH + bottom;
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var neededH = calcH(w);
        canvasWrap.style.height    = 'auto';
        canvasWrap.style.minHeight = neededH + 'px';
        var actualH = canvasWrap.offsetHeight || neededH;
        if (actualH < neededH) actualH = neededH;
        canvas.width  = w * dpr;
        canvas.height = actualH * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        var W = GW(); var mob = W < 600;
        var G = getGeom(mob);
        var neededH = calcH(W);
        var extra = Math.max(0, GH() - neededH);
        var top = (mob ? 16 : 20) + extra / 2;
        var x0 = G.padX;

        var steps = currentSteps();
        var step = stepIdx >= 0 ? steps[stepIdx] : steps[0];
        var y = top + G.titleGap;

        if (step.before) {
            var bw = tableWidth(step.before, mob);
            var bx = x0 + Math.max(0, (GW() - G.padX * 2 - bw) / 2);
            var bRes = drawSchemaTable(bx, y, step.before, mob, step.hiCols);
            y += bRes.height;

            if (step.showArrow) {
                var midX = x0 + (GW() - G.padX * 2) / 2;
                var arrowY1 = y + (mob ? 12 : 15), arrowY2 = y + (mob ? 32 : 40);
                seg(midX, arrowY1, midX, arrowY2, P.teal + 'cc', 2.6);
                ctx.beginPath();
                ctx.moveTo(midX, arrowY2 + 10);
                ctx.lineTo(midX - 8, arrowY2);
                ctx.lineTo(midX + 8, arrowY2);
                ctx.closePath();
                ctx.fillStyle = P.teal + 'cc';
                ctx.fill();
                tx('분리', midX + (mob ? 20 : 24), (arrowY1 + arrowY2) / 2 + 5, mob ? 12 : 13.5, P.teal + 'cc', 'left', true);
            }
        }

        if (step.after && step.after.length) {
            var afterY = step.before ? (y + (step.showArrow ? (mob ? 58 : 72) : (mob ? 30 : 36))) : y;
            if (step.after.length === 1) {
                var spec = step.after[0];
                var aw = tableWidth(spec, mob);
                var ax = x0 + Math.max(0, (GW() - G.padX * 2 - aw) / 2);
                drawSchemaTable(ax, afterY, spec, mob, []);
            } else {
                var totalW = 0; var gap = mob ? 30 : 48;
                step.after.forEach(function (s) { totalW += tableWidth(s, mob); });
                totalW += gap * (step.after.length - 1);
                var startX = x0 + Math.max(0, (GW() - G.padX * 2 - totalW) / 2);
                var cx = startX;
                step.after.forEach(function (s) {
                    drawSchemaTable(cx, afterY, s, mob, []);
                    cx += tableWidth(s, mob) + gap;
                });
            }
        }
    }

    /* ===================== 애니메이션(스텝 전환) ===================== */
    function animateStep(onDone) {
        if (rafId) cancelAnimationFrame(rafId);
        draw();
        rafId = requestAnimationFrame(function () { rafId = null; if (onDone) onDone(); });
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) { speedBtns.forEach(function (b) { b.disabled = v; }); }
    function defaultLog() { return currentSteps()[0].log; }

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