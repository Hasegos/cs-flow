/**
 * SIMD 벡터 연산 시각화
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
    var root    = el('div', 'simd-viz');
    var toolbar = el('div', 'simd-viz__toolbar');
    var tbLeft  = el('div', 'simd-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'simd-viz__title', 'SIMD ENGINE'));

    var modeWrap = el('div', 'simd-viz__mode');
    var modeDefs = [
        { key: 'vec',  label: '스칼라 vs SIMD' },
        { key: 'lane', label: '레지스터 폭과 레인' },
        { key: 'mask', label: '나머지와 조건문' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'simd-viz__mode-btn' + (i === 0 ? ' simd-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'simd-viz__speed');
    speedWrap.appendChild(el('span', 'simd-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'simd-viz__speed-btn' + (i === 0 ? ' simd-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'simd-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'simd-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'simd-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'simd-viz__controls');
    var btnPlay  = el('button', 'simd-viz__btn simd-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'simd-viz__btn', '▶| STEP');
    var btnReset = el('button', 'simd-viz__btn', '↺ RESET');
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

    /* ===================== 데이터: 스칼라 vs SIMD ===================== */
    var LANES = 4;
    var A = [1, 2, 3, 4, 5, 6, 7, 8];
    var B = [10, 20, 30, 40, 50, 60, 70, 80];
    var N = A.length;
    var C = A.map(function (v, i) { return v + B[i]; });
    var VECS = Math.ceil(N / LANES);

    var VEC_STEPS = [
        { sc: 0, vc: 0, log: '배열 A와 B의 같은 위치 원소끼리 더해 C를 만듭니다. 원소 ' + N + '개에 똑같은 덧셈을 적용하는 일입니다.' },
        { sc: 1, vc: 0, log: '스칼라 방식 — 덧셈 명령 한 번이 원소 한 쌍(A[0] + B[0] = ' + C[0] + ')만 처리합니다.' },
        { sc: LANES, vc: 0, log: '덧셈 명령 ' + LANES + '번이면 원소 ' + LANES + '개가 끝납니다. 명령 하나가 다루는 데이터는 언제나 한 개입니다.' },
        { sc: N, vc: 0, log: '스칼라 방식은 덧셈 명령 ' + N + '개로 끝납니다.' },
        { sc: N, vc: 1, log: 'SIMD 방식 — 벡터 레지스터 하나에 원소 ' + LANES + '개를 담아, 벡터 덧셈 한 번으로 A[0..' + (LANES - 1) + '] + B[0..' + (LANES - 1) + ']를 함께 계산합니다.' },
        { sc: N, vc: VECS, log: '벡터 덧셈 ' + VECS + '번이면 원소 ' + N + '개가 끝납니다. 같은 일을 하는 덧셈 명령이 ' + N + '개에서 ' + VECS + '개로 줄었습니다.' },
        { sc: N, vc: VECS, log: '정리 — 덧셈 명령 수는 레인 수(' + LANES + ')만큼 줄어듭니다. 다만 실행 시간이 같은 비율로 줄어든다고 단정할 수는 없습니다. 메모리에서 읽고 쓰는 시간도 걸리기 때문입니다.' }
    ];

    /* ===================== 데이터: 레지스터 폭과 레인 ===================== */
    var SUM_N = 64;
    var R128  = { bits: 128, elem: 32, isa: 'SSE · NEON' };
    var R256  = { bits: 256, elem: 32, isa: 'AVX · AVX2' };
    var R512  = { bits: 512, elem: 32, isa: 'AVX-512' };
    var R128B = { bits: 128, elem: 8, isa: 'SSE2 · NEON' };
    function lanesOf(r) { return r.bits / r.elem; }
    function opsFor(r) { return Math.ceil(SUM_N / lanesOf(r)); }

    var LANE_STEPS = [
        { rows: [R128], count: false, log: '128비트 벡터 레지스터에 32비트 float을 담으면 ' + lanesOf(R128) + '개가 들어갑니다. 이 칸 하나하나를 레인(lane)이라 부릅니다.' },
        { rows: [R128, R256], count: false, log: '256비트 레지스터는 같은 float을 ' + lanesOf(R256) + '개 담습니다. 레지스터가 넓을수록 한 명령이 처리하는 원소가 늘어납니다.' },
        { rows: [R128, R256, R512], count: false, log: '512비트 레지스터는 float ' + lanesOf(R512) + '개를 담습니다. 넓은 레지스터를 쓰려면 CPU가 그 확장을 지원해야 합니다.' },
        { rows: [R128, R128B], count: false, log: '원소가 작으면 레인이 늘어납니다. 같은 128비트라도 8비트 정수는 ' + lanesOf(R128B) + '개가 들어갑니다. 이미지 픽셀처럼 작은 정수를 다루는 작업에서 한 명령의 처리량이 커지는 이유입니다.' },
        { rows: [R128, R256, R512], count: true, log: '정리 — 레인 수 = 레지스터 폭 ÷ 원소 크기입니다. float ' + SUM_N + '개를 더하는 데 필요한 벡터 덧셈은 ' + opsFor(R128) + ' / ' + opsFor(R256) + ' / ' + opsFor(R512) + '개이고, 스칼라는 ' + SUM_N + '개입니다.' }
    ];

    /* ===================== 데이터: 나머지와 조건문 ===================== */
    var TOTAL = 10;
    var FULL = Math.floor(TOTAL / LANES);
    var REM = TOTAL - FULL * LANES;
    var CA = [3, -2, 5, -1];
    var MASK = CA.map(function (v) { return v > 0 ? 1 : 0; });
    var CRES = CA.map(function (v, i) { return MASK[i] ? v : 0; });

    var MASK_STEPS = [
        { stage: 0, cond: 0, log: '원소 ' + TOTAL + '개를 레인 ' + LANES + '개씩 처리합니다. ' + TOTAL + '은 ' + LANES + '의 배수가 아니라서 끝에 ' + REM + '개가 남습니다.' },
        { stage: 1, cond: 0, log: '벡터 반복 1 — 원소 0~' + (LANES - 1) + '을 벡터 연산 한 번으로 처리합니다.' },
        { stage: 2, cond: 0, log: '벡터 반복 2 — 원소 ' + LANES + '~' + (2 * LANES - 1) + '을 처리합니다. 레인을 가득 채울 수 있는 반복은 여기까지입니다.' },
        { stage: 3, cond: 0, log: '나머지 ' + (FULL * LANES) + '~' + (TOTAL - 1) + ' — 레인 ' + LANES + '개를 채우지 못하므로 스칼라 연산으로 따로 처리하는 방법이 흔합니다. 연산은 벡터 ' + FULL + '번 + 스칼라 ' + REM + '번 = ' + (FULL + REM) + '번입니다.' },
        { stage: 3, cond: 1, log: '조건문 — 분기하는 대신 레인마다 a > 0 비교를 한 번에 수행해 마스크를 만듭니다. 참인 레인은 1, 거짓인 레인은 0입니다.' },
        { stage: 3, cond: 2, log: '마스크로 결과를 고릅니다. 마스크가 1인 레인은 a를 그대로, 0인 레인은 0을 씁니다. 모든 레인이 같은 명령을 실행하고 선택만 달라집니다.' },
        { stage: 3, cond: 2, log: '정리 — 길이가 레인 수의 배수가 아니면 나머지 처리가 필요하고, 레인마다 다른 경로로 갈라지는 코드는 마스크로 바꿔 씁니다. 마스크로 만든 결과 중 쓰지 않는 레인의 계산도 함께 실행됩니다.' }
    ];

    /* ===================== 상태 ===================== */
    var mode    = 'vec';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'lane') return LANE_STEPS;
        if (mode === 'mask') return MASK_STEPS;
        return VEC_STEPS;
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

    /* ===================== 모드: 스칼라 vs SIMD ===================== */
    function drawBlock(x0, y, w, mob, title, col, started, done, lo, hi, countStr) {
        var fs     = mob ? 11 : 12.5;
        var labelW = mob ? 18 : 24;
        var cellW  = Math.min(64, (w - labelW) / N);
        var cellH  = mob ? 22 : 26;
        var rowGap = cellH + 4;
        var barX   = x0 + labelW;
        var y1     = y + 20;

        tx(title, x0, y + 6, fs, started ? col + 'ee' : P.muted + '88', 'left', true);
        tx(countStr, x0 + w, y + 6, fs, started ? col + 'ee' : P.muted + '88', 'right', true);

        [['A', A], ['B', B], ['C', C]].forEach(function (r, ri) {
            var ry = y1 + ri * rowGap;
            tx(r[0], x0, ry + cellH / 2, fs, P.muted + 'cc', 'left', true);
            r[1].forEach(function (v, i) {
                var cx = barX + i * cellW;
                var on = i >= lo && i <= hi;
                if (ri < 2) {
                    rr(cx + 1, ry, cellW - 2, cellH, 3, on ? col + '30' : P.muted + '12', on ? col + 'cc' : P.muted + '55', on ? 1.8 : 1);
                    tx(String(v), cx + cellW / 2, ry + cellH / 2, fs, on ? P.text + 'ee' : P.muted + 'cc', 'center', on);
                } else if (i < done) {
                    rr(cx + 1, ry, cellW - 2, cellH, 3, col + (on ? '40' : '22'), col + (on ? 'ee' : '88'), on ? 1.8 : 1.2);
                    tx(String(v), cx + cellW / 2, ry + cellH / 2, fs, col + 'ee', 'center', true);
                } else {
                    rr(cx + 1, ry, cellW - 2, cellH, 3, 'none', P.muted + '44', 1);
                    tx('?', cx + cellW / 2, ry + cellH / 2, fs, P.muted + '88', 'center', false);
                }
            });
        });

        if (hi >= lo && hi >= 0) {
            rr(barX + lo * cellW - 1, y1 - 3, (hi - lo + 1) * cellW + 2, rowGap * 3 + 2, 6, 'none', col + 'ee', 2);
        }
        return y1 + rowGap * 3;
    }

    function drawVec(x0, top, w, mob, step) {
        var sc = step ? step.sc : 0;
        var vc = step ? step.vc : 0;
        var vDone = Math.min(N, vc * LANES);

        var y = drawBlock(x0, top, w, mob, mob ? '스칼라' : '스칼라 (명령 1개 = 원소 1개)', P.orange,
            sc > 0, sc, sc - 1, sc - 1, '덧셈 명령 ' + sc + '개');
        y += 22;
        drawBlock(x0, y, w, mob, mob ? 'SIMD' : 'SIMD (명령 1개 = 원소 ' + LANES + '개)', P.teal,
            vc > 0, vDone, (vc - 1) * LANES, vDone - 1, '벡터 덧셈 ' + vc + '개');
    }

    /* ===================== 모드: 레지스터 폭과 레인 ===================== */
    function drawLane(x0, top, w, mob, step) {
        if (!step) return;
        var fs   = mob ? 10.5 : 12;
        var barH = mob ? 24 : 30;
        var rowH = barH + (mob ? 46 : 52);

        step.rows.forEach(function (r, i) {
            var y     = top + i * rowH;
            var lanes = lanesOf(r);
            var title = mob
                ? r.bits + '비트 · ' + lanes + '레인 × ' + r.elem + '비트'
                : r.bits + '비트 (' + r.isa + ') — ' + lanes + '레인 × ' + r.elem + '비트';
            var col   = r.elem === 8 ? P.teal : P.purple;
            var cw    = (w * r.bits / 512) / lanes;

            tx(title, x0, y + 6, fs + 0.5, P.text + 'ee', 'left', true);
            for (var k = 0; k < lanes; k++) {
                var cx = x0 + k * cw;
                rr(cx + 1, y + 18, cw - 2, barH, 3, col + '30', col + 'aa', 1.2);
                if (cw >= 16) tx(String(k), cx + cw / 2, y + 18 + barH / 2, fs - 1, col + 'ee', 'center', true);
            }
            if (step.count && r.elem === 32) {
                tx('float ' + SUM_N + '개 덧셈 → 벡터 덧셈 ' + opsFor(r) + '개', x0, y + 18 + barH + 14, fs, P.green + 'ee', 'left', true);
            }
        });
    }

    /* ===================== 모드: 나머지와 조건문 ===================== */
    function drawMask(x0, top, w, mob, step) {
        var fs    = mob ? 10.5 : 12;
        var stage = step ? step.stage : 0;
        var cond  = step ? step.cond : 0;
        var gap   = 4;
        var cellW = Math.min(56, (w - gap * (TOTAL - 1)) / TOTAL);
        var cellH = mob ? 26 : 30;
        var cy    = top + 22;

        tx(mob ? '원소 ' + TOTAL + '개, 레인 ' + LANES + '개' : '배열 원소 ' + TOTAL + '개를 레인 ' + LANES + '개씩 처리', x0, top + 6, fs + 0.5, P.text + 'ee', 'left', true);

        for (var i = 0; i < TOTAL; i++) {
            var g       = Math.floor(i / LANES);
            var isRem   = i >= FULL * LANES;
            var reached = isRem ? stage >= 3 : stage > g;
            var current = isRem ? stage === 3 : stage === g + 1;
            var col     = isRem ? P.orange : P.purple;
            var cx      = x0 + i * (cellW + gap);
            rr(cx, cy, cellW, cellH, 4, reached ? col + (current ? '40' : '22') : P.muted + '12', reached ? col + (current ? 'ee' : '88') : P.muted + '55', current ? 2 : 1.2);
            tx(String(i), cx + cellW / 2, cy + cellH / 2, fs, reached ? col + 'ee' : P.muted + 'cc', 'center', reached);
        }

        for (var gi = 0; gi < FULL; gi++) {
            if (stage <= gi) continue;
            var gx = x0 + gi * LANES * (cellW + gap);
            var gw = LANES * (cellW + gap) - gap;
            rr(gx, cy + cellH + 6, gw, 3, 1.5, P.purple + 'cc', 'none', 0);
            tx('벡터 ' + (gi + 1) + '회', gx + gw / 2, cy + cellH + 20, fs, P.purple + 'ee', 'center', true);
        }
        if (stage >= 3 && REM > 0) {
            var rx = x0 + FULL * LANES * (cellW + gap);
            var rw = REM * (cellW + gap) - gap;
            rr(rx, cy + cellH + 6, rw, 3, 1.5, P.orange + 'cc', 'none', 0);
            tx(mob ? '나머지' : '나머지 ' + REM + '개', rx + rw / 2, cy + cellH + 20, fs, P.orange + 'ee', 'center', true);
            tx('연산 ' + (FULL + REM) + '번 (원소를 하나씩 처리하면 ' + TOTAL + '번)', x0, cy + cellH + 42, fs, P.green + 'ee', 'left', true);
        }

        var y2 = cy + cellH + 70;
        tx(mob ? '조건문: a > 0 이면 a, 아니면 0' : '조건문 — a > 0 이면 a, 아니면 0 (레인 ' + LANES + '개가 동시에)', x0, y2, fs + 0.5, cond ? P.text + 'ee' : P.muted + '88', 'left', true);

        var lw   = mob ? 52 : 130;
        var cw2  = Math.min(64, (w - lw - gap * (LANES - 1)) / LANES);
        var defs = [
            ['a', CA, 1],
            [mob ? '마스크' : '마스크 (a > 0)', MASK, 1],
            ['결과', CRES, 2]
        ];
        defs.forEach(function (d, ri) {
            var ry = y2 + 14 + ri * (cellH + 8);
            var visible = cond >= d[2];
            tx(d[0], x0, ry + cellH / 2, fs, visible ? P.muted + 'ee' : P.muted + '77', 'left', true);
            d[1].forEach(function (v, k) {
                var cx = x0 + lw + k * (cw2 + gap);
                if (!visible) {
                    rr(cx, ry, cw2, cellH, 4, 'none', P.muted + '44', 1);
                    tx('?', cx + cw2 / 2, ry + cellH / 2, fs, P.muted + '88', 'center', false);
                    return;
                }
                var col = P.purple;
                if (ri === 1) col = v ? P.green : P.red;
                if (ri === 2) col = MASK[k] ? P.green : P.muted;
                rr(cx, ry, cw2, cellH, 4, col + '26', col + 'bb', 1.4);
                tx(String(v), cx + cw2 / 2, ry + cellH / 2, fs, col + 'ee', 'center', true);
            });
        });
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

        if (mode === 'lane') drawLane(padX, top, fullW, mob, step);
        else if (mode === 'mask') drawMask(padX, top, fullW, mob, step);
        else drawVec(padX, top, fullW, mob, step);

        if (!step) {
            tx('아래 STEP을 눌러 SIMD가 어떻게 동작하는지 확인하세요.', W / 2, GH() - (mob ? 12 : 14), mob ? 11 : 12.5, P.muted + 'aa', 'center', false);
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH;
        if (mode === 'lane') neededH = mob ? 290 : 330;
        else if (mode === 'mask') neededH = mob ? 330 : 380;
        else neededH = mob ? 300 : 330;
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
        if (mode === 'lane') return '벡터 레지스터의 폭과 원소 크기에 따라 한 명령이 처리하는 원소 수(레인 수)가 달라집니다.';
        if (mode === 'mask') return '배열 길이가 레인 수의 배수가 아닐 때의 나머지 처리와, 조건문을 마스크로 처리하는 방법을 봅니다.';
        return '배열 A와 B를 원소끼리 더하는 같은 일을 스칼라 방식과 SIMD 방식으로 처리할 때 덧셈 명령 수를 비교합니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('simd-viz__speed-btn--active'); });
        btn.classList.add('simd-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('simd-viz__mode-btn--active', d.key === m); });
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