/**
 * 암달의 법칙 시각화
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
    var root    = el('div', 'amdahl-viz');
    var toolbar = el('div', 'amdahl-viz__toolbar');
    var tbLeft  = el('div', 'amdahl-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'amdahl-viz__title', 'SPEEDUP'));

    var modeWrap = el('div', 'amdahl-viz__mode');
    var modeDefs = [
        { key: 'time',  label: '시간 분할' },
        { key: 'curve', label: '속도 향상 곡선' },
        { key: 'bars',  label: '병렬 비율 비교' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'amdahl-viz__mode-btn' + (i === 0 ? ' amdahl-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'amdahl-viz__speed');
    speedWrap.appendChild(el('span', 'amdahl-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'amdahl-viz__speed-btn' + (i === 0 ? ' amdahl-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'amdahl-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'amdahl-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'amdahl-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'amdahl-viz__controls');
    var btnPlay  = el('button', 'amdahl-viz__btn amdahl-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'amdahl-viz__btn', '▶| STEP');
    var btnReset = el('button', 'amdahl-viz__btn', '↺ RESET');
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

    /* ===================== 데이터 ===================== */
    function speedup(p, n) { return 1 / ((1 - p) + p / n); }

    var TIME_SER   = 20;
    var TIME_PAR   = 80;
    var TIME_CORES = [1, 2, 4, 8, 16];
    var CURVE_N    = [1, 2, 4, 8, 16, 32, 64, 128];
    var CURVE_PS   = [
        { p: 0.5,  color: 'purple' },
        { p: 0.8,  color: 'orange' },
        { p: 0.95, color: 'teal' }
    ];
    var BARS_N = 8;
    var BARS_P = [0.5, 0.8, 0.9, 0.95, 0.99];

    /* ===================== 스텝 정의 ===================== */
    var TIME_STEPS = [
        { rows: 1, log: '코어 1개 — 전체 실행 시간 100 = 직렬 20 + 병렬 80. 이 시간이 기준(1.00배)입니다.' },
        { rows: 2, log: '코어 2개 — 병렬 80이 40으로 줄지만 직렬 20은 그대로입니다. 총 60 → 1.67배.' },
        { rows: 3, log: '코어 4개 — 병렬 20, 직렬 20. 총 40 → 2.50배. 코어를 두 배로 늘렸는데 시간은 60에서 40으로만 줄었습니다.' },
        { rows: 4, log: '코어 8개 — 병렬 10, 직렬 20. 총 30 → 3.33배.' },
        { rows: 5, log: '코어 16개 — 병렬 5, 직렬 20. 총 25 → 4.00배. 이제 병렬 구간보다 직렬 구간이 훨씬 큽니다.' },
        { rows: 5, limit: true, log: '정리 — 코어를 무한히 늘려도 직렬 20은 그대로 남아 총 시간은 20 아래로 내려갈 수 없습니다. 최대 5배가 한계입니다.' }
    ];

    var CURVE_STEPS = [
        { curves: 1, log: '병렬 비율 50% — 코어를 128개까지 늘려도 2배(점선)를 넘지 못합니다.' },
        { curves: 2, log: '병렬 비율 80% — 한계는 5배입니다. 병렬 비율이 올라가자 곡선이 더 높이 올라갑니다.' },
        { curves: 3, log: '병렬 비율 95% — 한계는 20배이지만 128코어에서도 약 17배로, 한계에 가까워질수록 곡선이 평평해집니다.' },
        { curves: 3, log: '정리 — 코어가 늘수록 곡선이 점점 평평해집니다(수확 체감). 곡선의 천장은 코어 수가 아니라 직렬 비율이 정합니다.' }
    ];

    var BARS_STEPS = [
        { rows: 1, log: 'p=0.50 — 병렬 비율이 50%면 코어 8개로도 1.78배뿐입니다. 이상적인 8배(점선)에 한참 못 미칩니다.' },
        { rows: 2, log: 'p=0.80 — 3.33배. 병렬 비율이 30%p 오르자 이득이 두 배 가까이 커졌습니다.' },
        { rows: 3, log: 'p=0.90 — 4.71배.' },
        { rows: 4, log: 'p=0.95 — 5.93배.' },
        { rows: 5, log: 'p=0.99 — 7.48배. 직렬 구간이 1%만 남아도 이상적인 8배에는 미치지 못합니다.' },
        { rows: 5, log: '정리 — 같은 코어 8개여도 병렬 비율에 따라 1.78배부터 7.48배까지 크게 달라집니다. 코어를 늘리기 전에 직렬 구간을 줄이는 것이 우선입니다.' }
    ];

    /* ===================== 상태 ===================== */
    var mode    = 'time';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'curve') return CURVE_STEPS;
        if (mode === 'bars') return BARS_STEPS;
        return TIME_STEPS;
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
    function line(x1, y1, x2, y2, color, lw) {
        ctx.strokeStyle = color;
        ctx.lineWidth = lw || 1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }
    function dashedLine(x1, y1, x2, y2, color) {
        ctx.save();
        ctx.setLineDash([5, 4]);
        line(x1, y1, x2, y2, color, 1.6);
        ctx.restore();
    }
    function dot(cx, cy, r, fill) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
    }

    /* ===================== 모드별 드로우 ===================== */
    function drawTime(x0, top, w, mob, step) {
        var fs      = mob ? 11.5 : 13;
        var labelW  = mob ? 56 : 78;
        var rightW  = mob ? 98 : 140;
        var barX    = x0 + labelW;
        var barMaxW = Math.max(120, w - labelW - rightW - 6);
        var rowH    = mob ? 40 : 46;
        var barH    = mob ? 26 : 30;
        var rows    = step ? step.rows : 0;

        var ly = top + 8;
        rr(x0, ly - 6, 12, 12, 3, P.orange + 'cc', null);
        tx('직렬(병렬화 불가)', x0 + 18, ly, fs, P.text + 'cc', 'left', false);
        var serLabelW = ctx.measureText('직렬(병렬화 불가)').width;
        var lx2 = x0 + 18 + serLabelW + 22;
        rr(lx2, ly - 6, 12, 12, 3, P.teal + 'cc', null);
        tx('병렬(코어로 분할)', lx2 + 18, ly, fs, P.text + 'cc', 'left', false);

        var y0 = top + 34;
        var serW = barMaxW * TIME_SER / 100;

        for (var i = 0; i < rows; i++) {
            var n     = TIME_CORES[i];
            var par   = TIME_PAR / n;
            var total = TIME_SER + par;
            var y     = y0 + i * rowH;
            var isCur = (i === rows - 1);
            var parW  = barMaxW * par / 100;

            tx('코어 ' + n, x0, y + barH / 2, fs, isCur ? P.text + 'ee' : P.text + 'aa', 'left', true);

            rr(barX, y, serW, barH, 4, P.orange + (isCur ? '55' : '30'), P.orange + (isCur ? 'ee' : '88'), isCur ? 2.2 : 1.4);
            rr(barX + serW, y, parW, barH, 4, P.teal + (isCur ? '55' : '30'), P.teal + (isCur ? 'ee' : '88'), isCur ? 2.2 : 1.4);

            if (serW >= 30) tx('20', barX + serW / 2, y + barH / 2, fs - 1, P.orange + 'ee', 'center', true);
            if (parW >= 30) tx(String(par), barX + serW + parW / 2, y + barH / 2, fs - 1, P.teal + 'ee', 'center', true);

            var endX = barX + serW + parW;
            var label = (mob ? '' : '총 ') + total + ' → ' + (100 / total).toFixed(2) + 'x';
            tx(label, endX + 10, y + barH / 2, fs, isCur ? P.text + 'ee' : P.muted + 'dd', 'left', isCur);
        }

        if (step && step.limit) {
            var lineX = barX + serW;
            dashedLine(lineX, y0 - 6, lineX, y0 + rows * rowH - 8, P.purple + 'dd');
            tx('최소 시간 20 → 최대 5x', lineX + 8, y0 + rows * rowH + 8, fs, P.purple + 'ee', 'left', true);
        }
    }

    function drawCurve(x0, top, w, mob, step) {
        var fs     = mob ? 11.5 : 13;
        var padL   = mob ? 40 : 54;
        var padR   = mob ? 6 : 14;
        var plotL  = x0 + padL;
        var plotR  = x0 + w - padR;
        var plotW  = plotR - plotL;
        var plotTop = top + 40;
        var plotH   = mob ? 190 : 240;
        var plotBot = plotTop + plotH;
        var shown   = step ? step.curves : 0;
        var yMax    = 20;

        function yOf(v) { return plotBot - (v / yMax) * plotH; }
        function xOf(i) { return plotL + plotW * i / (CURVE_N.length - 1); }

        var lx = plotL;
        CURVE_PS.forEach(function (c, idx) {
            var on = idx < shown;
            var label = 'p=' + c.p;
            rr(lx, top + 2, 12, 12, 3, P[c.color] + (on ? 'cc' : '44'), null);
            tx(label, lx + 18, top + 8, fs, on ? P.text + 'ee' : P.muted + 'aa', 'left', on);
            lx += 18 + ctx.measureText(label).width + 22;
        });

        [0, 5, 10, 15, 20].forEach(function (v) {
            var y = yOf(v);
            line(plotL, y, plotR, y, P.muted + (v === 0 ? '88' : '33'), 1);
            tx(v + 'x', plotL - 8, y, fs - 1, P.muted + 'cc', 'right', false);
        });
        CURVE_N.forEach(function (n, i) {
            tx(String(n), xOf(i), plotBot + 16, fs - 1, P.muted + 'cc', 'center', false);
        });
        tx('코어 수(N)', (plotL + plotR) / 2, plotBot + 36, fs, P.muted + 'cc', 'center', false);

        for (var k = 0; k < shown; k++) {
            var c = CURVE_PS[k];
            var col = P[c.color];
            var limit = 1 / (1 - c.p);

            dashedLine(plotL, yOf(limit), plotR, yOf(limit), col + 'aa');
            tx('한계 ' + Math.round(limit) + 'x', plotR - 4, yOf(limit) - 10, fs, col + 'ee', 'right', true);

            ctx.strokeStyle = col + 'ee';
            ctx.lineWidth = 2.6;
            ctx.beginPath();
            CURVE_N.forEach(function (n, i) {
                var px = xOf(i), py = yOf(speedup(c.p, n));
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            });
            ctx.stroke();
            CURVE_N.forEach(function (n, i) {
                dot(xOf(i), yOf(speedup(c.p, n)), 3.6, col + 'ee');
            });
        }
    }

    function drawBars(x0, top, w, mob, step) {
        var fs      = mob ? 11.5 : 13;
        var labelW  = mob ? 56 : 76;
        var valW    = mob ? 54 : 68;
        var barX    = x0 + labelW;
        var barMaxW = Math.max(120, w - labelW - valW - 8);
        var rowH    = mob ? 40 : 46;
        var barH    = mob ? 24 : 28;
        var y0      = top + 30;
        var rows    = step ? step.rows : 0;
        var idealX  = barX + barMaxW;

        dashedLine(idealX, y0 - 8, idealX, y0 + BARS_P.length * rowH - 10, P.purple + 'cc');
        tx('이상적 ' + BARS_N + 'x', idealX, top + 10, fs, P.purple + 'ee', 'center', true);

        for (var i = 0; i < rows; i++) {
            var p     = BARS_P[i];
            var s     = speedup(p, BARS_N);
            var len   = barMaxW * s / BARS_N;
            var y     = y0 + i * rowH;
            var isCur = (i === rows - 1);

            tx('p=' + p.toFixed(2), x0, y + barH / 2, fs, isCur ? P.text + 'ee' : P.text + 'aa', 'left', true);
            rr(barX, y, len, barH, 4, P.teal + (isCur ? '55' : '30'), P.teal + (isCur ? 'ee' : '88'), isCur ? 2.2 : 1.4);
            tx(s.toFixed(2) + 'x', idealX + 10, y + barH / 2, fs, isCur ? P.text + 'ee' : P.muted + 'dd', 'left', isCur);
        }
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

        if (mode === 'curve') drawCurve(padX, top, fullW, mob, step);
        else if (mode === 'bars') drawBars(padX, top, fullW, mob, step);
        else drawTime(padX, top, fullW, mob, step);

        if (!step) {
            tx('아래 STEP을 눌러 병렬 처리의 이득이 어떻게 변하는지 확인하세요.', W / 2, GH() - (mob ? 12 : 14), mob ? 11 : 12.5, P.muted + 'aa', 'center', false);
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH;
        if (mode === 'curve') neededH = mob ? 322 : 384;
        else if (mode === 'bars') neededH = mob ? 300 : 340;
        else neededH = mob ? 310 : 340;
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
        if (mode === 'curve') return '코어 수에 따른 속도 향상 곡선 — 병렬 비율이 높을수록 곡선이 더 높이 올라갑니다.';
        if (mode === 'bars') return '코어 8개로 고정 — 병렬 비율에 따라 속도 향상이 얼마나 달라지는지 비교합니다.';
        return '암달의 법칙: 코어를 늘려도 병렬화할 수 없는 직렬 구간은 줄어들지 않습니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('amdahl-viz__speed-btn--active'); });
        btn.classList.add('amdahl-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('amdahl-viz__mode-btn--active', d.key === m); });
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