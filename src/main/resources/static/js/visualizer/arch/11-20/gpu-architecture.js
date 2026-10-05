/**
 * GPU 아키텍처 시각화
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
    var root    = el('div', 'gpu-viz');
    var toolbar = el('div', 'gpu-viz__toolbar');
    var tbLeft  = el('div', 'gpu-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'gpu-viz__title', 'GPU ENGINE'));

    var modeWrap = el('div', 'gpu-viz__mode');
    var modeDefs = [
        { key: 'cpugpu', label: 'CPU vs GPU' },
        { key: 'warp', label: '워프와 분기' },
        { key: 'latency', label: '지연 숨기기' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'gpu-viz__mode-btn' + (i === 0 ? ' gpu-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'gpu-viz__speed');
    speedWrap.appendChild(el('span', 'gpu-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'gpu-viz__speed-btn' + (i === 0 ? ' gpu-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'gpu-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'gpu-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'gpu-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'gpu-viz__controls');
    var btnPlay  = el('button', 'gpu-viz__btn gpu-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'gpu-viz__btn', '▶| STEP');
    var btnReset = el('button', 'gpu-viz__btn', '↺ RESET');
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

    /* ===================== 데이터: CPU vs GPU ===================== */
    var ELEMS     = 64;
    var CPU_CORES = 4;
    var GPU_CORES = 64;
    var CPU_ROUNDS = Math.ceil(ELEMS / CPU_CORES);
    var GPU_ROUNDS = Math.ceil(ELEMS / GPU_CORES);

    var CG_STEPS = [
        { c: false, g: false, log: '같은 일 — 원소 ' + ELEMS + '개짜리 두 배열을 원소끼리 더합니다. 원소마다 하는 일은 같고 서로 독립입니다. 코어 수는 설명을 위한 가정입니다.' },
        { c: true, g: false, log: 'CPU — 크고 복잡한 코어 ' + CPU_CORES + '개가 한 번에 ' + CPU_CORES + '개씩 처리하면 ' + CPU_ROUNDS + '번 반복해야 합니다. 코어마다 큰 캐시와 복잡한 제어 장치를 갖춰 한 코어는 빠르고 영리합니다.' },
        { c: true, g: true, log: 'GPU — 단순한 코어 ' + GPU_CORES + '개가 한 번에 ' + GPU_CORES + '개씩 처리하면 ' + GPU_ROUNDS + '번에 끝납니다. 코어마다 제어 장치와 캐시를 줄이고 연산 장치를 많이 둔 구조입니다.' },
        { c: true, g: true, log: '단, 이 이득은 원소가 많고 서로 독립일 때 생깁니다. 원소가 몇 개뿐이거나 앞 결과에 의존하면 GPU 코어 대부분이 놀고, 코어 하나의 속도는 CPU가 빠를 수 있습니다.' },
        { c: true, g: true, log: '정리 — CPU는 지연(한 작업을 빨리)에, GPU는 처리량(많은 작업을 한꺼번에)에 맞춘 설계입니다. 어느 쪽이 낫다기보다 알맞은 일이 다릅니다.' }
    ];

    /* ===================== 데이터: 워프와 분기 ===================== */
    var LANES = 32;
    var PRED = [];
    for (var li = 0; li < LANES; li++) PRED.push(((li * 5) % 8) < 3 ? 'A' : 'B');
    var CNT_A = PRED.filter(function (p) { return p === 'A'; }).length;
    var CNT_B = LANES - CNT_A;

    var WARP_STEPS = [
        { ph: 'none', log: '워프(warp) — NVIDIA GPU는 스레드 ' + LANES + '개를 묶어 한 번에 같은 명령어를 실행합니다. 한 칸이 스레드 하나입니다.' },
        { ph: 'all', passes: 1, log: '분기가 없으면 ' + LANES + '개 스레드가 모두 같은 명령을 실행해 한 번에 끝납니다.' },
        { ph: 'split', passes: 1, log: '조건문(if x < 0 … else …) — 스레드마다 데이터가 달라 ' + CNT_A + '개는 경로 A, ' + CNT_B + '개는 경로 B로 갈립니다.' },
        { ph: 'A', passes: 1, log: '경로 A 실행 — 경로 A의 스레드만 일하고 나머지 ' + CNT_B + '개는 꺼진 채(마스크) 기다립니다.' },
        { ph: 'B', passes: 2, log: '경로 B 실행 — 이번에는 경로 B의 스레드만 일하고 ' + CNT_A + '개가 기다립니다. 두 경로가 차례로 실행되어 2번이 걸립니다.' },
        { ph: 'B', passes: 2, log: '정리 — 한 워프 안에서 분기가 갈리면 각 경로가 차례로 실행되어 시간이 늘어납니다(워프 분기). 같은 워프의 스레드가 같은 경로를 타도록 데이터를 정리하면 피할 수 있습니다.' }
    ];

    /* ===================== 데이터: 지연 숨기기 ===================== */
    var C_RUN  = 4;
    var M_WAIT = 12;
    var T_MAX  = 32;
    function simulate(nw) {
        var st = [];
        var left = [];
        var wait = [];
        var i;
        for (i = 0; i < nw; i++) { st.push('run'); left.push(C_RUN); wait.push(0); }
        var grid = [];
        for (i = 0; i < nw; i++) grid.push([]);
        var busy = 0;
        for (var t = 0; t < T_MAX; t++) {
            var picked = -1;
            for (i = 0; i < nw; i++) {
                if (st[i] === 'wait' && wait[i] === 0) { st[i] = 'run'; left[i] = C_RUN; }
            }
            for (i = 0; i < nw; i++) if (picked < 0 && st[i] === 'run') picked = i;
            for (i = 0; i < nw; i++) {
                if (i === picked) {
                    grid[i].push('C');
                    left[i]--;
                    if (left[i] === 0) { st[i] = 'wait'; wait[i] = M_WAIT; }
                } else if (st[i] === 'wait') {
                    grid[i].push('M');
                    wait[i]--;
                } else {
                    grid[i].push('R');
                }
            }
            if (picked >= 0) busy++;
        }
        return { grid: grid, util: Math.round(busy * 100 / T_MAX) };
    }
    var SIM1 = simulate(1);
    var SIM2 = simulate(2);
    var SIM4 = simulate(4);
    var SIMS = { 1: SIM1, 2: SIM2, 4: SIM4 };

    var LAT_STEPS = [
        { w: 0, log: '워프는 계산 ' + C_RUN + '사이클 뒤에 메모리를 읽고 ' + M_WAIT + '사이클을 기다린다고 가정합니다(예시 값). 한 사이클에 한 워프만 계산할 수 있습니다.' },
        { w: 1, log: '워프 1개 — 메모리를 기다리는 동안 할 일이 없어 계산 유닛이 쉽니다. 활용률 ' + SIM1.util + '%.' },
        { w: 2, log: '워프 2개 — 한 워프가 기다리는 동안 다른 워프가 계산합니다. 활용률 ' + SIM2.util + '%.' },
        { w: 4, log: '워프 4개 — 기다리는 시간이 다른 워프의 계산으로 채워져 계산 유닛이 쉬지 않습니다. 활용률 ' + SIM4.util + '%.' },
        { w: 4, log: '정리 — GPU는 캐시로 지연을 줄이는 대신 많은 워프를 번갈아 실행해 메모리 지연을 숨깁니다. 이 모델에서는 활용률이 ' + SIM1.util + '% → ' + SIM2.util + '% → ' + SIM4.util + '%로 늘어납니다.' }
    ];

    /* ===================== 상태 ===================== */
    var mode    = 'cpugpu';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'warp') return WARP_STEPS;
        if (mode === 'latency') return LAT_STEPS;
        return CG_STEPS;
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

    /* ===================== 모드: CPU vs GPU ===================== */
    function drawCoreGrid(x, y, w, h, n, cols, col, big, on, fs, title) {
        tx(title, x, y - 10, fs + 0.5, on ? col + 'ee' : P.muted + '88', 'left', true);
        var rows = Math.ceil(n / cols);
        var gap = big ? 8 : 3;
        var cw = (w - gap * (cols - 1)) / cols;
        var ch = (h - gap * (rows - 1)) / rows;
        for (var i = 0; i < n; i++) {
            var cx = x + (i % cols) * (cw + gap);
            var cy = y + Math.floor(i / cols) * (ch + gap);
            rr(cx, cy, cw, ch, big ? 6 : 2, on ? col + '30' : P.muted + '14', on ? col + 'cc' : P.muted + '55', 1.2);
        }
    }

    function drawCg(x0, top, w, mob, step) {
        var fs = mob ? 10.5 : 12;
        var c  = step && step.c;
        var g  = step && step.g;
        var pw = (w - 30) / 2;
        var py = top + 34;
        var ph = mob ? 130 : 150;
        drawCoreGrid(x0, py, pw, ph, CPU_CORES, 2, P.orange, true, c, fs, 'CPU — 큰 코어 ' + CPU_CORES + '개');
        drawCoreGrid(x0 + pw + 30, py, pw, ph, GPU_CORES, 16, P.teal, false, g, fs, 'GPU — 단순한 코어 ' + GPU_CORES + '개');
        var ry = py + ph + 30;
        tx(c ? '한 번에 ' + CPU_CORES + '개 → ' + CPU_ROUNDS + '번' : '', x0, ry, fs + 1, P.orange + 'ee', 'left', true);
        tx(g ? '한 번에 ' + GPU_CORES + '개 → ' + GPU_ROUNDS + '번' : '', x0 + pw + 30, ry, fs + 1, P.teal + 'ee', 'left', true);
        if (g) tx('원소 ' + ELEMS + '개 덧셈 (개념도)', x0 + w / 2, ry + 34, fs, P.muted + 'dd', 'center', false);
    }

    /* ===================== 모드: 워프와 분기 ===================== */
    function drawWarp(x0, top, w, mob, step) {
        var fs = mob ? 10.5 : 12;
        var ph = step ? step.ph : 'none';
        var cols = mob ? 8 : 16;
        var rows = LANES / cols;
        var gap = 4;
        var cw = Math.min(40, (w - gap * (cols - 1)) / cols);
        var chh = mob ? 30 : 34;
        tx('워프 1개 = 스레드 ' + LANES + '개', x0, top + 8, fs + 1, P.text + 'ee', 'left', true);
        for (var i = 0; i < LANES; i++) {
            var cx = x0 + (i % cols) * (cw + gap);
            var cy = top + 28 + Math.floor(i / cols) * (chh + gap);
            var p = PRED[i];
            var col = P.muted;
            var on = false;
            if (ph === 'all') { col = P.teal; on = true; }
            else if (ph === 'split') { col = p === 'A' ? P.purple : P.orange; on = true; }
            else if (ph === 'A') { col = P.purple; on = p === 'A'; }
            else if (ph === 'B') { col = P.orange; on = p === 'B'; }
            rr(cx, cy, cw, chh, 4, on ? col + '30' : P.muted + '10', on ? col + 'cc' : P.muted + '44', on ? 1.6 : 1);
            if (ph === 'split') tx(p, cx + cw / 2, cy + chh / 2, fs, col + 'ee', 'center', true);
            else if (on) tx(ph === 'all' ? '▶' : '▶', cx + cw / 2, cy + chh / 2, fs, col + 'ee', 'center', true);
        }
        var ly = top + 28 + rows * (chh + gap) + 18;
        if (ph === 'split' || ph === 'A' || ph === 'B') {
            tx('경로 A: ' + CNT_A + '개 · 경로 B: ' + CNT_B + '개', x0, ly, fs, P.muted + 'ee', 'left', true);
        }
        if (step && step.passes) {
            tx('실행 횟수: ' + step.passes + '번' + (step.passes === 2 ? ' (분기 때문에 2배)' : ''), x0, ly + 26, fs + 2, step.passes === 2 ? P.orange + 'ee' : P.green + 'ee', 'left', true);
        }
    }

    /* ===================== 모드: 지연 숨기기 ===================== */
    function drawLatency(x0, top, w, mob, step) {
        var fs = mob ? 10 : 11.5;
        var nw = step ? step.w : 0;
        var labelW = mob ? 36 : 50;
        var cw = (w - labelW) / T_MAX;
        var rh = mob ? 26 : 30;
        tx('가로: 사이클 0~' + (T_MAX - 1) + ' · C 계산 · M 메모리 대기', x0, top + 8, fs, P.muted + 'ee', 'left', false);
        if (nw === 0) return;
        var sim = SIMS[nw];
        for (var i = 0; i < nw; i++) {
            var y = top + 28 + i * (rh + 6);
            tx('워프 ' + i, x0, y + rh / 2, fs, P.text + 'dd', 'left', true);
            for (var t = 0; t < T_MAX; t++) {
                var k = sim.grid[i][t];
                var col = k === 'C' ? P.teal : (k === 'M' ? P.orange : P.muted);
                rr(x0 + labelW + t * cw, y, cw - 1, rh, 2, col + (k === 'R' ? '18' : '38'), col + (k === 'R' ? '44' : 'aa'), 1);
            }
        }
        var uy = top + 28 + nw * (rh + 6) + 16;
        tx('계산 유닛 활용률: ' + sim.util + '%', x0, uy, fs + 2, sim.util === 100 ? P.green + 'ee' : P.orange + 'ee', 'left', true);
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

        if (mode === 'warp') drawWarp(padX, top, fullW, mob, step);
        else if (mode === 'latency') drawLatency(padX, top, fullW, mob, step);
        else drawCg(padX, top, fullW, mob, step);

        if (!step) {
            tx('아래 STEP을 눌러 GPU가 어떻게 동작하는지 확인하세요.', W / 2, GH() - (mob ? 12 : 14), mob ? 11 : 12.5, P.muted + 'aa', 'center', false);
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH;
        if (mode === 'warp') neededH = mob ? 340 : 320;
        else if (mode === 'latency') neededH = mob ? 300 : 310;
        else neededH = mob ? 330 : 340;
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
        if (mode === 'warp') return '스레드 32개가 묶인 워프가 같은 명령을 실행할 때 분기가 갈리면 어떻게 되는지 봅니다.';
        if (mode === 'latency') return '메모리를 기다리는 동안 다른 워프를 실행해 지연을 숨기는 GPU의 방식을 봅니다.';
        return '같은 덧셈을 큰 코어 몇 개인 CPU와 단순한 코어가 많은 GPU가 처리하는 방식을 비교합니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('gpu-viz__speed-btn--active'); });
        btn.classList.add('gpu-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('gpu-viz__mode-btn--active', d.key === m); });
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