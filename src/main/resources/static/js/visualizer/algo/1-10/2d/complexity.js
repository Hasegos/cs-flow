/**
 * 시간/공간 복잡도(Big-O) 시각화 시각화
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
        { key: 'table', label: '숫자로 비교' }
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
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
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

    var logEl = el('div', 'complexity-viz__log', '');
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
    function GW() { return canvas.width / dpr; }
    function GH() { return canvas.height / dpr; }

    var P = window.CsFlow.getP();

    /* ===================== 상태 ===================== */
    var mode    = 'graph';
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

    /* ===================== 상태 ===================== */
    function currentSteps() {
        return mode === 'graph' ? GRAPH_STEPS : TABLE_STEPS;
    }
    function defaultLog() {
        return mode === 'graph'
            ? 'PLAY를 눌러 n(입력 크기)이 1부터 12까지 커질 때 각 복잡도가 얼마나 다르게 자라는지 확인하세요.'
            : 'PLAY를 눌러 n=10 → 100 → 1000으로 커질 때 실제 연산 횟수가 얼마나 벌어지는지 확인하세요.';
    }

    /* ===================== 레이아웃 ===================== */
    var acxLgMax = Math.log10(Math.pow(2, TABLE_COLS[TABLE_COLS.length - 1]));

    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    function acxTw(str, sz, bold) {
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        return ctx.measureText(str).width;
    }
    function acxCol(cls) { return cls.colorKey === 'muted' ? P.sub : classColor(cls); }
    function acxFmt(cls, v) { return cls.key === 'olog' ? v.toFixed(1) : fmtCount(v); }
    function acxBarFrac(v) { return v <= 1 ? 0 : clamp01(Math.log10(v) / acxLgMax); }

    function acxGraphL(w, mob) {
        var fs = mob ? 10 : 11;
        var padL = Math.ceil(acxTw(fmtCount(Math.pow(2, N_MAX)), fs, false)) + 10;
        var cols = mob ? 2 : CLASSES.length;
        var rows = Math.ceil(CLASSES.length / cols);
        var cellH = mob ? 20 : 26;
        var hdrH = mob ? 18 : 22;
        var plotH = mob ? 118 : 196;
        var padB = mob ? 20 : 24;
        var gridH = rows * cellH;
        return {
            fs: fs, padL: padL, padR: mob ? 8 : 16, cols: cols, cellH: cellH, hdrH: hdrH,
            plotH: plotH, padB: padB, gridH: gridH,
            total: hdrH + 6 + plotH + padB + 4 + gridH + 4
        };
    }

    function acxTableL(w, mob) {
        var fs = mob ? 10 : 12;
        var hdrH = mob ? 18 : 22;
        var colH = mob ? 18 : 22;
        var rowH = mob ? 46 : 40;
        var labelW = mob ? 0 : 124;
        var cellW = (w - labelW) / TABLE_COLS.length;
        return {
            fs: fs, hdrH: hdrH, colH: colH, rowH: rowH, labelW: labelW, cellW: cellW,
            total: hdrH + 4 + colH + CLASSES.length * rowH + 4
        };
    }

    function layout(w, mob) {
        return mode === 'graph' ? acxGraphL(w, mob) : acxTableL(w, mob);
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 그래프 그리기 (n이 늘면 곡선이 자라고 마커가 따라간다) ===================== */
    function acxDrawGraph(x0, top, w, mob, s, p, e) {
        var L = acxGraphL(w, mob);
        var fs = L.fs;
        var maxY = Math.pow(2, N_MAX);
        var nNow = lerp(p.n || 0, s.n || 0, ez(e));
        var plotX = x0 + L.padL;
        var plotW = w - L.padL - L.padR;
        var plotY = top + L.hdrH + 6;
        var bottom = plotY + L.plotH;
        var xOf = function (nv) { return plotX + (nv / N_MAX) * plotW; };
        var yOf = function (v) { return bottom - Math.min(1, v / maxY) * L.plotH; };
        var xNow = xOf(nNow);

        tx('연산 횟수(회)', x0, top + L.hdrH / 2, fs, P.sub + 'ff', 'left', true);
        tx('n = ' + Math.round(nNow) + ' (입력 크기)', x0 + w, top + L.hdrH / 2, fs, P.text + 'ff', 'right', true);

        ln(plotX, plotY, plotX, bottom, P.muted + '77', 1);
        ln(plotX, bottom, plotX + plotW, bottom, P.muted + '77', 1);
        [0, 0.5, 1].forEach(function (r) {
            var ty = bottom - r * L.plotH;
            if (r > 0) ln(plotX, ty, plotX + plotW, ty, P.muted + '33', 1, [3, 3]);
            ln(plotX - 3, ty, plotX, ty, P.muted + '77', 1);
            tx(fmtCount(maxY * r), plotX - 6, ty, fs, P.sub + 'ff', 'right', false);
        });
        (mob ? [0, 6, 12] : [0, 3, 6, 9, 12]).forEach(function (tn) {
            var gx = xOf(tn);
            ln(gx, bottom, gx, bottom + 3, P.muted + '77', 1);
            tx(String(tn), gx, bottom + 11, fs, P.sub + 'ff', 'center', false);
        });

        if (nNow > 0) ln(xNow, plotY, xNow, bottom, P.text + '44', 1, [4, 4]);

        CLASSES.forEach(function (cls) {
            var col = acxCol(cls);
            var whole = Math.floor(nNow);
            ctx.beginPath();
            for (var i = 0; i <= whole; i++) {
                if (i === 0) ctx.moveTo(xOf(0), yOf(cls.calc(0)));
                else ctx.lineTo(xOf(i), yOf(cls.calc(i)));
            }
            if (nNow > whole) ctx.lineTo(xNow, yOf(cls.calc(nNow)));
            ctx.strokeStyle = col + 'ee';
            ctx.lineWidth = cls.key === 'o2n' ? (mob ? 2.6 : 3.2) : (mob ? 1.6 : 2);
            ctx.stroke();
            circ(xNow, yOf(cls.calc(nNow)), mob ? 3.5 : 4.5, col + 'ff', null, 0);
        });

        var gy0 = bottom + L.padB + 4;
        var cw = w / L.cols;
        CLASSES.forEach(function (cls, i) {
            var col = acxCol(cls);
            var cx = x0 + (i % L.cols) * cw;
            var cy = gy0 + Math.floor(i / L.cols) * L.cellH + L.cellH / 2;
            circ(cx + 5, cy, mob ? 3.5 : 4, col + 'ff', null, 0);
            tx(cls.label, cx + 14, cy, fs, P.text + 'ff', 'left', true);
            tx(acxFmt(cls, cls.calc(nNow)), cx + cw - 6, cy, fs, col + 'ff', 'right', true);
        });
    }

    /* ===================== 표 그리기 (열이 차례로 공개되고 막대가 자란다) ===================== */
    function acxDrawTable(x0, top, w, mob, s, p, e) {
        var L = acxTableL(w, mob);
        var fs = L.fs;
        var reveal = s.reveal || 0;
        var pReveal = p.reveal || 0;
        var colY = top + L.hdrH + 4;
        var rowsY = colY + L.colH;

        tx('연산 횟수(회)', x0, top + L.hdrH / 2, fs, P.sub + 'ff', 'left', true);
        tx('막대 = 자릿수(로그)', x0 + w, top + L.hdrH / 2, fs, P.sub + 'ff', 'right', false);

        TABLE_COLS.forEach(function (colN, ci) {
            var cx = x0 + L.labelW + ci * L.cellW + L.cellW / 2;
            var on = ci < reveal;
            var fresh = on && ci >= pReveal;
            ctx.globalAlpha = fresh ? seg(e, 0, 0.35) : 1;
            tx('n=' + colN.toLocaleString('ko-KR'), cx, colY + L.colH / 2, fs, on ? P.text + 'ff' : P.sub + '66', 'center', true);
            ctx.globalAlpha = 1;
        });

        CLASSES.forEach(function (cls, ri) {
            var col = acxCol(cls);
            var rowTop = rowsY + ri * L.rowH;
            var labelY = mob ? rowTop + 7 : rowTop + L.rowH / 2;
            var boxTop = mob ? rowTop + 14 : rowTop + 3;
            var boxH = mob ? 30 : L.rowH - 6;
            var valY = boxTop + (mob ? 10 : 11);
            var barY = boxTop + (mob ? 19 : 21);
            circ(x0 + 5, labelY, mob ? 3.5 : 4, col + 'ff', null, 0);
            tx(cls.label, x0 + 14, labelY, fs, P.text + 'ff', 'left', true);

            TABLE_COLS.forEach(function (colN, ci) {
                var cx = x0 + L.labelW + ci * L.cellW;
                var cw = L.cellW;
                var bx = cx + 3;
                var bw = cw - 6;
                var on = ci < reveal;
                var fresh = on && ci >= pReveal;
                var boxA = on ? (fresh ? seg(e, 0, 0.3) : 1) : 0;
                var phA = on ? (fresh ? 1 - boxA : 0) : 1;

                if (phA > 0) {
                    ctx.globalAlpha = phA;
                    rr(bx, boxTop, bw, boxH, 5, P.muted + '0c', P.muted + '33', 1);
                    tx('?', cx + cw / 2, boxTop + boxH / 2, fs, P.sub + '88', 'center', false);
                    ctx.globalAlpha = 1;
                }
                if (!on) return;

                ctx.globalAlpha = boxA;
                rr(bx, boxTop, bw, boxH, 5, col + '16', col + '55', 1.2);
                ctx.globalAlpha = fresh ? seg(e, 0.15, 0.5) : 1;
                tx(acxFmt(cls, cls.calc(colN)), cx + cw / 2, valY, fs, P.text + 'ff', 'center', true);

                var trackW = bw - 8;
                var frac = acxBarFrac(cls.calc(colN));
                var grow = fresh ? ez(seg(e, 0.25, 1)) : 1;
                var barW = frac > 0 ? Math.max(3, trackW * frac) : 0;
                rr(bx + 4, barY, trackW, 5, 2.5, P.muted + '22', null);
                rr(bx + 4, barY, barW * grow, 5, 2.5, col + 'ff', null);
                ctx.globalAlpha = 1;
            });
        });
    }

    /* ===================== 장면 진입 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var s = step || currentSteps()[0];
        var p = prev || s;
        var e = clamp01(t);
        if (mode === 'graph') acxDrawGraph(x0, top, w, mob, s, p, e);
        else acxDrawTable(x0, top, w, mob, s, p, e);
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
        speedBtns.forEach(function (b) { b.classList.remove('complexity-viz__speed-btn--active'); });
        btn.classList.add('complexity-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('complexity-viz__mode-btn--active', d.key === m); });
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