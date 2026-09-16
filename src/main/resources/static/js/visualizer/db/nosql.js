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
        { key: 'kv',    label: 'Key-Value' },
        { key: 'doc',   label: 'Document' },
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
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

    /* ===================== 스텝 정의 ===================== */
    var KV_STEPS = [
        { reveal: ['user'],           log: 'Key-Value는 키 하나로 값 하나를 저장합니다 — "user:1001" 키에 사용자 정보를 담습니다.' },
        { reveal: ['user', 'orders'], log: '주문 내역은 보통 별도의 키("orders:1001")로 따로 저장합니다.' },
        { reveal: ['user', 'orders'], link: true, log: '두 값을 연결하려면 애플리케이션이 두 키를 각각 조회해서 직접 조합해야 합니다.' },
        { reveal: ['user', 'orders'], link: true, log: '정리 — Key-Value는 단순하고 빠르지만, 관계 표현은 전부 애플리케이션 몫입니다.' }
    ];

    var DOC_STEPS = [
        { reveal: ['name'],                    log: 'Document는 관련 데이터를 하나의 문서 안에 중첩해서 저장합니다.' },
        { reveal: ['name', 'orders'],           log: '주문 내역이 문서 안에 배열로 포함되어 있어, 문서 하나만 조회하면 사용자와 주문을 한 번에 가져옵니다.' },
        { reveal: ['name', 'orders', 'nested'], log: '문서 안에 또 다른 구조(배송지 등)를 얼마든지 중첩할 수 있습니다.' },
        { reveal: ['name', 'orders', 'nested'], log: '정리 — 다만 문서가 너무 커지거나 중첩이 깊어지면 오히려 다루기 어려워집니다.' }
    ];

    var GRAPH_STEPS = [
        { reveal: ['alice'],                     log: 'Graph는 데이터를 노드(정점)로 표현합니다 — 먼저 "Alice" 노드입니다.' },
        { reveal: ['alice', 'order'],             log: '주문도 하나의 노드입니다 — "Order#1" 노드를 추가합니다.' },
        { reveal: ['alice', 'order'], edge: true,  log: '두 노드를 "ORDERED"라는 관계(엣지)로 연결합니다 — 관계 자체가 데이터의 일부입니다.' },
        { reveal: ['alice', 'order'], edge: true,  log: '정리 — Graph는 "친구의 친구"처럼 관계를 여러 단계 타고 들어가는 탐색에 강합니다.' }
    ];

    /* ===================== 상태 ===================== */
    var mode    = 'kv';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'doc') return DOC_STEPS;
        if (mode === 'graph') return GRAPH_STEPS;
        return KV_STEPS;
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
    function circle(cx, cy, r, fill, stroke, lw) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        if (fill)   { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.6; ctx.stroke(); }
    }
    function dashedLine(x1, y1, x2, y2, color) {
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();
    }

    /* ===================== 모드별 드로우 ===================== */
    function drawKV(x0, top, w, mob, step) {
        var gap = mob ? 24 : 64;
        var boxW = mob ? (w - gap) / 2 : 280, boxH = mob ? 104 : 130;
        var y = top + (mob ? 26 : 36);
        var userX = x0, ordersX = mob ? x0 + boxW + gap : x0 + Math.max(boxW + gap, (w - boxW * 2 - gap) / 2 + boxW + gap);
        if (!mob) ordersX = x0 + w - boxW;
        var showUser = step && step.reveal.indexOf('user') >= 0;
        var showOrders = step && step.reveal.indexOf('orders') >= 0;

        rr(userX, y, boxW, boxH, 10, P.orange + (showUser ? '1c' : '0c'), P.orange + (showUser ? 'ee' : '77'), showUser ? 2.4 : 1.6);
        tx('user:1001', userX + boxW / 2, y + 28, mob ? 13 : 15, P.orange + 'ee', 'center', true);
        if (showUser) tx('{ name: "Alice", grade: "VIP" }', userX + boxW / 2, y + boxH / 2 + 20, mob ? 11 : 13, P.text + 'dd', 'center', false);

        rr(ordersX, y, boxW, boxH, 10, P.teal + (showOrders ? '1c' : '0c'), P.teal + (showOrders ? 'ee' : '77'), showOrders ? 2.4 : 1.6);
        tx('orders:1001', ordersX + boxW / 2, y + 28, mob ? 13 : 15, P.teal + 'ee', 'center', true);
        if (showOrders) tx('[ "Order#1", "Order#2" ]', ordersX + boxW / 2, y + boxH / 2 + 20, mob ? 11 : 13, P.text + 'dd', 'center', false);

        if (step && step.link) {
            dashedLine(userX + boxW, y + boxH / 2, ordersX, y + boxH / 2, P.purple + 'cc');
            tx('앱에서 조합', (userX + boxW + ordersX) / 2, y - (mob ? 14 : 18), mob ? 11 : 12.5, P.purple + 'ee', 'center', true);
        }
    }

    function drawDoc(x0, top, w, mob, step) {
        var boxW = Math.min(w, mob ? w : 640), boxH = mob ? 220 : 260;
        var x = x0 + (w - boxW) / 2;
        var y = top + (mob ? 20 : 30);
        var showOrders = step && step.reveal.indexOf('orders') >= 0;
        var showNested = step && step.reveal.indexOf('nested') >= 0;

        rr(x, y, boxW, boxH, 12, P.purple + '10', P.purple + 'cc', 1.8);
        tx('user:1001 (문서 1개)', x + 22, y + 30, mob ? 12.5 : 14.5, P.purple + 'ee', 'left', true);

        var lineY = y + 68;
        var lineGap = mob ? 26 : 32;
        tx('name: "Alice"', x + 36, lineY, mob ? 12 : 14, P.text + 'ee', 'left', false);

        if (showOrders) {
            lineY += lineGap;
            tx('orders: [', x + 36, lineY, mob ? 12 : 14, P.teal + 'ee', 'left', false);
            lineY += lineGap;
            tx('{ id: "Order#1", amount: 32000 }' + (showNested ? ',' : ''), x + 58, lineY, mob ? 10.5 : 12, P.text + 'dd', 'left', false);
            if (showNested) {
                lineY += lineGap;
                tx('{ id: "Order#2", shipTo: { city: "Seoul" } }', x + 58, lineY, mob ? 10.5 : 12, P.text + 'dd', 'left', false);
            }
            lineY += lineGap;
            tx(']', x + 36, lineY, mob ? 12 : 14, P.teal + 'ee', 'left', false);
        }
    }

    function drawGraph(x0, top, w, mob, step) {
        var r = mob ? 52 : 68;
        var aliceX = x0 + w * 0.24, orderX = x0 + w * 0.76;
        var cy = top + (mob ? 96 : 120);
        var showAlice = step && step.reveal.indexOf('alice') >= 0;
        var showOrder = step && step.reveal.indexOf('order') >= 0;

        if (step && step.edge) {
            dashedLine(aliceX + r, cy, orderX - r, cy, P.orange + 'dd');
            tx('ORDERED', (aliceX + orderX) / 2, cy - (mob ? 18 : 22), mob ? 11 : 13, P.orange + 'ee', 'center', true);
        }

        circle(aliceX, cy, r, P.purple + (showAlice ? '28' : '14'), P.purple + (showAlice ? 'ee' : 'aa'), showAlice ? 2.6 : 1.8);
        tx('Alice', aliceX, cy, mob ? 13 : 15, P.purple + 'ee', 'center', true);

        circle(orderX, cy, r, P.teal + (showOrder ? '28' : '14'), P.teal + (showOrder ? 'ee' : 'aa'), showOrder ? 2.6 : 1.8);
        tx('Order#1', orderX, cy, mob ? 12 : 14, P.teal + 'ee', 'center', true);
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

        if (mode === 'doc') drawDoc(padX, top, fullW, mob, step);
        else if (mode === 'graph') drawGraph(padX, top, fullW, mob, step);
        else drawKV(padX, top, fullW, mob, step);

        if (!step) {
            tx('아래 STEP을 눌러 이 모델이 데이터를 어떻게 표현하는지 확인하세요.', W / 2, GH() - (mob ? 30 : 40), mob ? 11 : 12.5, P.muted + 'aa', 'center', false);
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH = mode === 'doc' ? (mob ? 300 : 340) : (mode === 'graph' ? (mob ? 300 : 340) : (mob ? 280 : 320));
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
        if (mode === 'doc') return 'Document: 관련 데이터를 하나의 문서로 묶어 저장합니다.';
        if (mode === 'graph') return 'Graph: 데이터를 노드와 관계(엣지)로 표현합니다.';
        return 'Key-Value: 키 하나에 값 하나를 저장하는 가장 단순한 모델입니다.';
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