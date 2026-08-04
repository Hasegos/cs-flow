/**
 * 시간/공간 복잡도(Big-O) 시각화
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
    var root    = el('div', 'complexity-viz');
    var toolbar = el('div', 'complexity-viz__toolbar');
    var tbLeft  = el('div', 'complexity-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'complexity-viz__title', 'BIG-O'));

    var modeWrap = el('div', 'complexity-viz__mode');
    var modeDefs = [
        { key: 'graph', label: '그래프로 보기' },
        { key: 'table', label: '숫자로 비교' },
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'complexity-viz__mode-btn' + (i === 0 ? ' complexity-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'complexity-viz__speed');
    speedWrap.appendChild(el('span', 'complexity-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1600], ['2x', 800], ['3x', 500]].forEach(function (pair, i) {
        var b = el('button', 'complexity-viz__speed-btn' + (i === 0 ? ' complexity-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'complexity-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'complexity-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'complexity-viz__log', '▶ PLAY를 눌러 n(입력 크기)이 1부터 12까지 커질 때 각 복잡도가 얼마나 다르게 자라는지 확인하세요.');
    root.appendChild(logEl);

    var controls = el('div', 'complexity-viz__controls');
    var btnPlay  = el('button', 'complexity-viz__btn complexity-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'complexity-viz__btn', '▶| STEP');
    var btnReset = el('button', 'complexity-viz__btn', '↺ RESET');
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

    /* ===================== 복잡도 클래스 정의 ===================== */
    var N_MAX = 12;
    var CLASSES = [
        { key: 'o1',   label: 'O(1)',     colorKey: 'muted',  calc: function (n) { return 1; } },
        { key: 'olog', label: 'O(log n)', colorKey: 'teal',   calc: function (n) { return n <= 1 ? 0 : Math.log2(n); } },
        { key: 'on',   label: 'O(n)',     colorKey: 'green',  calc: function (n) { return n; } },
        { key: 'on2',  label: 'O(n²)',    colorKey: 'orange', calc: function (n) { return n * n; } },
        { key: 'o2n',  label: 'O(2ⁿ)',    colorKey: 'purple', calc: function (n) { return Math.pow(2, n); } },
    ];

    function classColor(cls) { return P[cls.colorKey]; }

    /* ===================== 큰 수 표기 (log2/log10 기반, overflow 없음) ===================== */
    function fmtCount(num) {
        if (!isFinite(num)) return '∞';
        var r = Math.round(num);
        if (r < 1e12) return r.toLocaleString('ko-KR');
        var exp = Math.floor(Math.log10(num));
        var mant = num / Math.pow(10, exp);
        return mant.toFixed(2) + '×10^' + exp;
    }

    /* ===================== 그래프 모드 스텝 (n = 1..12 성장) ===================== */
    function buildGraphSteps() {
        var steps = [];
        steps.push({ type: 'intro', n: 0,
            log: 'PLAY를 눌러 n(입력 크기)이 1부터 12까지 커질 때 각 복잡도가 얼마나 다르게 자라는지 확인하세요.' });

        for (var n = 1; n <= N_MAX; n++) {
            var logVal = n <= 1 ? 0 : Math.log2(n);
            var msg = 'n=' + n + '일 때 → O(1)=1회, O(log n)≈' + logVal.toFixed(1) + '회, ' +
                'O(n)=' + n + '회, O(n²)=' + (n * n) + '회, O(2ⁿ)=' + Math.pow(2, n) + '회';
            steps.push({ type: n === N_MAX ? 'done' : 'grow', n: n, log: msg });
        }

        var last = steps[steps.length - 1];
        last.log = 'n이 겨우 12까지 늘었을 뿐인데 O(2ⁿ)은 4096, O(n²)은 144인 반면 O(1)은 1, O(log n)은 약 3.6에 머뭅니다. ' +
            'n이 100, 1000으로 커지면 이 차이는 상상하기 어려운 수준으로 벌어집니다 — "숫자로 보기" 탭에서 직접 확인해보세요.';
        return steps;
    }

    /* ===================== 표 모드 스텝 (n = 10 → 100 → 1000 순차 공개) ===================== */
    var TABLE_COLS = [10, 100, 1000];

    function buildTableSteps() {
        var steps = [];
        steps.push({ type: 'intro', reveal: 0,
            log: 'PLAY를 눌러 n=10 → 100 → 1000으로 커질 때 실제 연산 횟수가 얼마나 벌어지는지 확인하세요.' });

        steps.push({ type: 'reveal', reveal: 1,
            log: 'n=10일 때는 다섯 복잡도의 연산 횟수 차이가 크지 않습니다 — O(1)=1회, O(log n)≈3.3회, O(n)=10회, ' +
                'O(n²)=100회, O(2ⁿ)=1,024회.' });

        steps.push({ type: 'reveal', reveal: 2,
            log: 'n=100이 되면 벌써 벌어지기 시작합니다 — O(n)=100회, O(n²)=10,000회, O(2ⁿ)=1.27×10^30회. ' +
                'O(1)과 O(log n)은 각각 1회, 약 6.6회로 거의 그대로입니다.' });

        steps.push({ type: 'done', reveal: 3,
            log: 'n=1000이면 O(n²)=1,000,000회, O(2ⁿ)=1.07×10^301회로 상상하기 어려운 크기가 됩니다. ' +
                '반면 O(1)=1회, O(log n)≈10.0회는 여전히 작습니다 — 이것이 빅오 표기법이 중요한 이유입니다.' });

        return steps;
    }

    var GRAPH_STEPS = buildGraphSteps();
    var TABLE_STEPS = buildTableSteps();

    /* ===================== 상태 변수 ===================== */
    var mode    = 'graph';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1600;

    function currentSteps() {
        return mode === 'graph' ? GRAPH_STEPS : TABLE_STEPS;
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
        if (stroke && stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
    }

    function tx(str, x, y, sz, color, align, bold) {
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    function textWidth(str, sz, bold) {
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        return ctx.measureText(str).width;
    }

    function circle(cx, cy, r, fill, stroke, lw) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        if (fill)   { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
    }

    function line(x1, y1, x2, y2, col, lw) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = col; ctx.lineWidth = lw || 1.5;
        ctx.stroke();
    }

    /* ===================== 범례 (줄바꿈 지원) ===================== */
    function drawLegend(W, top, mob, padX) {
        var fLbl = mob ? 10 : 11;
        var sw    = mob ? 9  : 10;
        var lineGap = mob ? 18 : 20;
        var x = padX, y = top + (mob ? 7 : 9);

        CLASSES.forEach(function (cls) {
            var col = classColor(cls);
            var w = sw + 5 + textWidth(cls.label, fLbl, false) + (mob ? 14 : 18);
            if (x + w > W - padX && x > padX) { x = padX; y += lineGap; }
            circle(x + sw / 2, y, sw / 2, col + 'dd', col + 'ee', 1);
            tx(cls.label, x + sw + 5, y, fLbl, P.text + 'cc', 'left', false);
            x += w;
        });
        return y + lineGap / 2;
    }

    /* ===================== 그래프 (성장 곡선) ===================== */
    function drawGraph(W, top, h, mob, step) {
        var padL = mob ? 34 : 46;
        var padR = mob ? 10 : 18;
        var padT = mob ? 8  : 10;
        var padB = mob ? 22 : 26;
        var plotW = Math.max(10, W - padL - padR);
        var plotH = Math.max(10, h - padT - padB);
        var n     = step.n || 0;
        var maxY  = Math.pow(2, N_MAX);
        var x0 = padL, y0 = top + padT;

        line(x0, y0, x0, y0 + plotH, P.muted + '55', 1);
        line(x0, y0 + plotH, x0 + plotW, y0 + plotH, P.muted + '55', 1);

        var fTick = mob ? 8 : 9;
        [0, 0.5, 1].forEach(function (r) {
            var ty = y0 + plotH - r * plotH;
            line(x0 - 3, ty, x0, ty, P.muted + '77', 1);
            tx(fmtCount(maxY * r), x0 - 6, ty, fTick, P.text + '88', 'right', false);
        });

        var ticks = mob ? [0, 6, 12] : [0, 3, 6, 9, 12];
        ticks.forEach(function (tn) {
            var tx2 = x0 + (tn / N_MAX) * plotW;
            line(tx2, y0 + plotH, tx2, y0 + plotH + 3, P.muted + '77', 1);
            tx(String(tn), tx2, y0 + plotH + padB - (mob ? 8 : 10), fTick, P.text + '88', 'center', false);
        });
        tx('n (입력 크기)', x0 + plotW - (mob ? 0 : 6), y0 + plotH + padB - (mob ? 8 : 10), fTick, P.text + '66', mob ? 'center' : 'right', false);

        if (n > 0) {
            var curX = x0 + (n / N_MAX) * plotW;
            ctx.save();
            ctx.setLineDash([4, 4]);
            line(curX, y0, curX, y0 + plotH, P.text + '33', 1);
            ctx.restore();
        }

        CLASSES.forEach(function (cls) {
            var col = classColor(cls);
            var lw = cls.key === 'o2n' ? (mob ? 2.6 : 3.2) : (mob ? 1.6 : 2);
            ctx.beginPath();
            for (var i = 0; i <= n; i++) {
                var val = cls.calc(i);
                var px = x0 + (i / N_MAX) * plotW;
                var py = y0 + plotH - Math.min(1, val / maxY) * plotH;
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.strokeStyle = col + 'ee';
            ctx.lineWidth = lw;
            ctx.stroke();

            if (n >= 0) {
                var lastVal = cls.calc(n);
                var lastX = x0 + (n / N_MAX) * plotW;
                var lastY = y0 + plotH - Math.min(1, lastVal / maxY) * plotH;
                circle(lastX, lastY, mob ? 3 : 4, col + 'ee', null, 0);
            }
        });
    }

    /* ===================== 현재 n의 값 목록 (줄바꿈 지원) ===================== */
    function drawValuesRow(W, top, mob, step) {
        var n = step.n || 0;
        var fLbl = mob ? 10 : 11;
        var padX = mob ? 12 : 24;
        var lineGap = mob ? 20 : 22;
        var x = padX, y = top + (mob ? 12 : 14);

        tx('n=' + n + '일 때 연산 횟수', padX, top, mob ? 9 : 10, P.muted + 'aa', 'left', true);
        y += mob ? 6 : 8;

        CLASSES.forEach(function (cls) {
            var col = classColor(cls);
            var str = cls.label + '=' + fmtCount(cls.calc(n));
            var w = textWidth(str, fLbl, true) + (mob ? 18 : 24);
            if (x + w > W - padX && x > padX) { x = padX; y += lineGap; }
            tx(str, x, y, fLbl, col + 'ee', 'left', true);
            x += w;
        });
    }

    /* ===================== 표 (n=10 / 100 / 1000 비교) ===================== */
    function drawTable(W, top, mob, step) {
        var reveal = step.reveal || 0;
        var fLbl  = mob ? 10 : 11;
        var fVal  = mob ? 11 : 12.5;
        var labelW = mob ? 76 : 100;
        var cellW  = mob ? 82 : 108;
        var cellH  = mob ? 34 : 40;
        var headH  = mob ? 26 : 30;
        var totalW = labelW + TABLE_COLS.length * cellW;
        var x0 = Math.max(mob ? 10 : 20, (W - totalW) / 2);
        var y0 = top;

        tx('복잡도', x0, y0 + headH / 2, fLbl, P.muted + 'aa', 'left', true);
        TABLE_COLS.forEach(function (colN, ci) {
            var on = ci < reveal;
            var cx = x0 + labelW + ci * cellW + cellW / 2;
            tx('n=' + colN.toLocaleString('ko-KR'), cx, y0 + headH / 2, fLbl, (on ? P.text + 'dd' : P.muted + '66'), 'center', true);
        });

        CLASSES.forEach(function (cls, ri) {
            var ry = y0 + headH + ri * cellH;
            var col = classColor(cls);
            circle(x0 + 5, ry + cellH / 2, mob ? 3.5 : 4, col + 'ee', null, 0);
            tx(cls.label, x0 + 14, ry + cellH / 2, fLbl, P.text + 'dd', 'left', true);

            TABLE_COLS.forEach(function (colN, ci) {
                var on = ci < reveal;
                var cx = x0 + labelW + ci * cellW;
                var cyMid = ry + cellH / 2;
                if (on) {
                    rr(cx + 4, ry + 4, cellW - 8, cellH - 8, 5, col + '16', col + '55', 1.2);
                    tx(fmtCount(cls.calc(colN)) + '회', cx + cellW / 2, cyMid, fVal, P.text + 'ee', 'center', false);
                } else {
                    rr(cx + 4, ry + 4, cellW - 8, cellH - 8, 5, P.muted + '0c', P.muted + '33', 1);
                    tx('?', cx + cellW / 2, cyMid, fVal, P.muted + '77', 'center', false);
                }
            });
        });
    }

    /* ===================== 레이아웃 상수 ===================== */
    function getLayout(mob) {
        return {
            top:      mob ? 18 : 24,
            legendH:  mob ? 40 : 30,
            graphH:   mob ? 190 : 250,
            valuesH:  mob ? 56  : 52,
            headH:    mob ? 26 : 30,
            cellH:    mob ? 34 : 40,
        };
    }

    /* ===================== resize ===================== */
    function calcH(W) {
        var mob = W < 600;
        var L = getLayout(mob);
        if (mode === 'graph') {
            return L.top + L.legendH + L.graphH + L.valuesH + L.top;
        }
        return L.top + L.headH + CLASSES.length * L.cellH + L.top;
    }

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
        var W   = GW();
        var mob = W < 600;
        var L   = getLayout(mob);

        var neededH = calcH(W);
        var extra = Math.max(0, GH() - neededH);
        L.top = L.top + extra / 2;

        var steps = currentSteps();
        var step  = stepIdx >= 0 ? steps[stepIdx] : steps[0];

        if (mode === 'graph') {
            var padX = mob ? 12 : 24;
            drawLegend(W, L.top, mob, padX);
            drawGraph(W, L.top + L.legendH, L.graphH, mob, step);
            drawValuesRow(W, L.top + L.legendH + L.graphH + (mob ? 10 : 12), mob, step);
        } else {
            drawTable(W, L.top, mob, step);
        }
    }

    /* ===================== 애니메이션(스텝 전환 타이밍) ===================== */
    function animateStep(onDone) {
        if (rafId) cancelAnimationFrame(rafId);
        draw();
        rafId = requestAnimationFrame(function () {
            rafId = null;
            if (onDone) onDone();
        });
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) {
        speedBtns.forEach(function (b) { b.disabled = v; });
    }

    function defaultLog() {
        return mode === 'graph'
            ? 'PLAY를 눌러 n(입력 크기)이 1부터 12까지 커질 때 각 복잡도가 얼마나 다르게 자라는지 확인하세요.'
            : 'PLAY를 눌러 n=10 → 100 → 1000으로 커질 때 실제 연산 횟수가 얼마나 벌어지는지 확인하세요.';
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
                    timer = setTimeout(tick, speed * 0.4);
                }
            });
        }
        tick();
    }

    function vizStep() {
        if (running) return;
        var steps = currentSteps();
        var next  = stepIdx + 1;
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
        speedBtns.forEach(function (b) { b.classList.remove('complexity-viz__speed-btn--active'); });
        btn.classList.add('complexity-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) {
            modeBtns[d.key].classList.toggle('complexity-viz__mode-btn--active', d.key === m);
        });
        vizReset();
    }

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
                draw: draw,
            };
        },
    });

    setTimeout(resize, 60);
})();