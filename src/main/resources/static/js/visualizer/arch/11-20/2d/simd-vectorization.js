/**
 * SIMD 벡터 연산 시각화 시각화
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
        { key: 'vec', label: '스칼라 vs SIMD' },
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
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
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
    function GW() { return canvas.width / dpr; }
    function GH() { return canvas.height / dpr; }

    var P = window.CsFlow.getP();

    /* ===================== 상태 ===================== */
    var mode    = 'vec';
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
    window.CsFlow.simdVectorizationData = { n: N, lanes: LANES, vecs: VECS, a: A, b: B, c: C, steps: VEC_STEPS };

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
    function currentSteps() {
        if (mode === 'lane') return LANE_STEPS;
        if (mode === 'mask') return MASK_STEPS;
        return VEC_STEPS;
    }
    function defaultLog() {
        if (mode === 'lane') return '벡터 레지스터의 폭과 원소 크기에 따라 한 명령이 처리하는 원소 수(레인 수)가 달라집니다.';
        if (mode === 'mask') return '배열 길이가 레인 수의 배수가 아닐 때의 나머지 처리와, 조건문을 마스크로 처리하는 방법을 봅니다.';
        return '배열 A와 B를 원소끼리 더하는 같은 일을 스칼라 방식과 SIMD 방식으로 처리할 때 덧셈 명령 수를 비교합니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function svLayoutV(mob) {
        var ch = mob ? 22 : 26;
        var uh = mob ? 20 : 24;
        var yA = 20;
        var yB = yA + ch + 8;
        var yU = yB + ch + 12;
        var yC = yU + uh + 12;
        var h = yC + ch + 4;
        return { ch: ch, uh: uh, yA: yA, yB: yB, yU: yU, yC: yC, h: h, b2: h + 26, sum: h * 2 + 32, total: h * 2 + 52 };
    }
    function svLayoutL(mob) {
        var barH = mob ? 24 : 28;
        var rowH = barH + 60;
        return { barH: barH, by: 34, rowH: rowH, total: rowH * 3 + 4 };
    }
    function svLayoutM(mob) {
        var ch = mob ? 26 : 30;
        var sp = mob ? 34 : 38;
        var cy = 22;
        var y2 = cy + ch + 56;
        var rows0 = y2 + 16;
        return { ch: ch, sp: sp, cy: cy, y2: y2, rows0: rows0, total: rows0 + sp * 2 + ch + 8 };
    }
    function layout(w, mob) {
        if (mode === 'lane') return svLayoutL(mob);
        if (mode === 'mask') return svLayoutM(mob);
        return svLayoutV(mob);
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    /* ===================== 모드: 스칼라 vs SIMD ===================== */
    function svGrid(x0, w, mob) {
        var gap = mob ? 3 : 6;
        var lw = mob ? 16 : 24;
        var cw = Math.min(60, (w - lw - gap * (N - 1)) / N);
        var gridW = lw + cw * N + gap * (N - 1);
        return { gap: gap, lw: lw, cw: cw, gx: x0 + Math.max(0, (w - gridW) / 2) + lw };
    }
    function svState(j, from, cnt, jAct) {
        if (j < from) return 1;
        if (j >= from + cnt) return 0;
        if (jAct < 0) return 1;
        var q = j - from;
        if (q < jAct) return 1;
        return q === jAct ? 2 : 0;
    }
    function svDone(from, cnt, t) {
        return from + (cnt > 0 ? Math.min(cnt, Math.floor(t * cnt + 1e-9)) : 0);
    }
    function svChip(x, y, str, col, cw, fs) {
        var wd = Math.max(14, Math.min(cw - 2, 34));
        rr(x - wd / 2, y - 8, wd, 16, 4, col + 'ff', col + 'ff', 1.2);
        tx(str, x, y, fs - 1.5, '#111111', 'center', true);
    }
    function svBlock(g, r, y, mob, fs, o) {
        var t = o.t, cnt = o.cnt, from = o.from, per = o.per, col = o.col;
        var jAct = cnt > 0 && t < 1 ? Math.min(cnt - 1, Math.floor(t * cnt)) : -1;
        var pAct = jAct >= 0 ? seg(t, jAct / cnt, (jAct + 1) / cnt) : 1;
        var ch = r.ch, uh = r.uh, cw = g.cw, gap = g.gap;
        var yA = y + r.yA, yB = y + r.yB, yU = y + r.yU, yC = y + r.yC;
        var c0 = jAct >= 0 ? (from + jAct) * per : -1;
        var c1 = c0 >= 0 ? Math.min(N, c0 + per) - 1 : -1;
        tx('A', g.gx - g.lw, yA + ch / 2, fs, P.sub + 'ff', 'left', true);
        tx('B', g.gx - g.lw, yB + ch / 2, fs, P.sub + 'ff', 'left', true);
        tx('C', g.gx - g.lw, yC + ch / 2, fs, P.sub + 'ff', 'left', true);
        for (var c = 0; c < N; c++) {
            var st = svState(Math.floor(c / per), from, cnt, jAct);
            var x = g.gx + c * (cw + gap);
            var mx = x + cw / 2;
            var ring = st === 2 ? col + 'ff' : (st > 0 ? col + '88' : P.sub + '55');
            rr(x, yA, cw, ch, 3, st > 0 ? col + '22' : P.sub + '12', ring, st === 2 ? 1.8 : 1);
            tx(String(A[c]), mx, yA + ch / 2, fs, P.text + 'ee', 'center', st > 0);
            rr(x, yB, cw, ch, 3, st > 0 ? col + '22' : P.sub + '12', ring, st === 2 ? 1.8 : 1);
            tx(String(B[c]), mx, yB + ch / 2, fs, P.text + 'ee', 'center', st > 0);
            if (st === 1) {
                rr(x, yC, cw, ch, 3, col + '30', col + 'bb', 1.2);
                tx(String(C[c]), mx, yC + ch / 2, fs, col + 'ff', 'center', true);
            } else {
                rr(x, yC, cw, ch, 3, 'none', P.sub + '55', 1);
                tx('?', mx, yC + ch / 2, fs, P.sub + 'ff', 'center', false);
            }
        }
        if (c0 < 0) return;
        var aP = ez(seg(pAct, 0, 0.35)), bP = ez(seg(pAct, 0.3, 0.65)), oP = ez(seg(pAct, 0.7, 1));
        var lit = seg(pAct, 0.55, 0.7) > 0.5;
        var ox0 = g.gx + c0 * (cw + gap) - 3, ox1 = g.gx + c1 * (cw + gap) + cw + 3;
        rr(ox0, yA - 3, ox1 - ox0, yB + ch + 3 - (yA - 3), 6, 'none', col + '88', 1.4);
        for (var u = c0; u <= c1; u++) {
            var ux = g.gx + u * (cw + gap);
            rr(ux, yU, cw, uh, 4, col + (lit ? '70' : '30'), col + 'ff', 1.6);
            tx('+', ux + cw / 2, yU + uh / 2, fs, P.text + 'ee', 'center', true);
        }
        for (var v = c0; v <= c1; v++) {
            var vx = g.gx + v * (cw + gap) + cw / 2;
            if (aP > 0 && aP < 1) svChip(vx, lerp(yA + ch / 2, yU + uh / 2, aP), String(A[v]), col, cw, fs);
            if (bP > 0 && bP < 1) svChip(vx, lerp(yB + ch / 2, yU + uh / 2, bP), String(B[v]), col, cw, fs);
            if (oP > 0 && oP < 1) svChip(vx, lerp(yU + uh / 2, yC + ch / 2, oP), String(C[v]), P.green, cw, fs);
        }
    }
    function svDrawV(x0, top, w, mob, step, prev, t) {
        var s = step || VEC_STEPS[0];
        var p = prev || s;
        var fs = mob ? 11 : 12.5;
        var g = svGrid(x0, w, mob);
        var r = svLayoutV(mob);
        var fromS = p.sc, cntS = Math.max(0, s.sc - p.sc);
        var fromV = p.vc, cntV = Math.max(0, s.vc - p.vc);
        var y2 = top + r.b2;
        tx(mob ? '스칼라 · 원소 1개씩' : '스칼라 (명령 1개 = 원소 1개)', x0, top + 6, fs, P.orange + 'ff', 'left', true);
        tx('덧셈 명령 ' + svDone(fromS, cntS, t) + '개', x0 + w, top + 6, fs, P.orange + 'ff', 'right', true);
        svBlock(g, r, top, mob, fs, { per: 1, col: P.orange, from: fromS, cnt: cntS, t: t });
        tx(mob ? 'SIMD · 원소 ' + LANES + '개씩' : 'SIMD (명령 1개 = 원소 ' + LANES + '개)', x0, y2 + 6, fs, P.teal + 'ff', 'left', true);
        tx('벡터 덧셈 ' + svDone(fromV, cntV, t) + '개', x0 + w, y2 + 6, fs, P.teal + 'ff', 'right', true);
        svBlock(g, r, y2, mob, fs, { per: LANES, col: P.teal, from: fromV, cnt: cntV, t: t });
        tx(mob ? '원소 ' + N + '개 · 스칼라 ' + N + '번 → SIMD ' + VECS + '번' : '원소 ' + N + '개 — 스칼라 덧셈 ' + N + '번, SIMD 벡터 덧셈 ' + VECS + '번', x0 + w / 2, top + r.sum, fs, P.sub + 'ff', 'center', false);
    }

    /* ===================== 모드: 레지스터 폭과 레인 ===================== */
    function svDrawL(x0, top, w, mob, step, prev, t) {
        var s = step || LANE_STEPS[0];
        var p = prev || s;
        var fs = mob ? 11 : 12.5;
        var L = svLayoutL(mob);
        var cntAnim = s.count && !p.count ? t : 1;
        s.rows.forEach(function (rw, i) {
            var y = top + i * L.rowH;
            var by = y + L.by;
            var fresh = p !== s && p.rows.indexOf(rw) < 0;
            var lanes = lanesOf(rw);
            var regW = w * rw.bits / 512;
            var cw = regW / lanes;
            var showL = cw - 2 >= String(lanes - 1).length * 0.6 * (fs - 1) + 3;
            var col = rw.elem === 8 ? P.teal : P.purple;
            var pr = fresh ? seg(t, 0, 0.6) : 1;
            var lit = fresh ? seg(t, 0.55, 0.75) : 1;
            var title = mob ? rw.bits + '비트 · ' + lanes + '레인 × ' + rw.elem + '비트' : rw.bits + '비트 (' + rw.isa + ') — ' + lanes + '레인 × ' + rw.elem + '비트';
            tx(title, x0, y + 6, fs, P.text + 'ee', 'left', true);
            if (fresh && pr < 1) {
                var rx = lerp(x0 + w, x0, ez(pr));
                rr(rx, y + 18, regW, 12, 3, col + '99', col + 'ff', 1.2);
            }
            ctx.globalAlpha = 0.3 + 0.7 * lit;
            for (var k = 0; k < lanes; k++) {
                var cx = x0 + k * cw;
                rr(cx + 1, by, cw - 2, L.barH, 3, col + '40', col + 'aa', 1.2);
                if (showL) tx(String(k), cx + cw / 2, by + L.barH / 2, fs - 1, col + 'ee', 'center', true);
            }
            ctx.globalAlpha = 1;
            if (s.count && rw.elem === 32) {
                var shown = Math.floor(cntAnim * opsFor(rw) + 1e-9);
                tx(mob ? 'float ' + SUM_N + ' → 벡터 덧셈 ' + shown + '개' : 'float ' + SUM_N + '개 덧셈 → 벡터 덧셈 ' + shown + '개', x0, by + L.barH + 12, fs, P.green + 'ff', 'left', true);
            }
        });
    }

    /* ===================== 모드: 나머지와 조건문 ===================== */
    function svMFrame(stg, gr) {
        if (stg === 0) return null;
        var c0 = stg < 3 ? (stg - 1) * LANES : FULL * LANES;
        var c1 = stg < 3 ? c0 + LANES - 1 : TOTAL - 1;
        return { x: gr.x0 + c0 * (gr.cw + gr.gap) - 3, w: (c1 - c0 + 1) * (gr.cw + gr.gap) - gr.gap + 6 };
    }
    function svMLit(i, s, p, t) {
        if (i >= FULL * LANES) {
            var ri = i - FULL * LANES;
            if (s.stage < 3) return 0;
            if (p.stage >= 3) return 1;
            return seg(t, ri / REM, (ri + 1) / REM);
        }
        var g = Math.floor(i / LANES);
        if (s.stage <= g) return 0;
        if (p.stage > g) return 1;
        return seg(t, 0, 0.7);
    }
    function svDrawM(x0, top, w, mob, step, prev, t) {
        var s = step || MASK_STEPS[0];
        var p = prev || s;
        var fs = mob ? 11 : 12.5;
        var L = svLayoutM(mob);
        var ch = L.ch;
        var gap = mob ? 3 : 4;
        var cw = Math.min(56, (w - gap * (TOTAL - 1)) / TOTAL);
        var sx = x0 + (w - (cw * TOTAL + gap * (TOTAL - 1))) / 2;
        var gr = { x0: sx, cw: cw, gap: gap };
        var cy = top + L.cy;
        tx(mob ? '원소 ' + TOTAL + '개, 레인 ' + LANES + '개' : '배열 원소 ' + TOTAL + '개를 레인 ' + LANES + '개씩 처리', x0, top + 6, fs, P.text + 'ee', 'left', true);
        for (var i = 0; i < TOTAL; i++) {
            var cx = sx + i * (cw + gap);
            var isRem = i >= FULL * LANES;
            var lt = svMLit(i, s, p, t);
            var col = isRem ? P.orange : P.purple;
            if (lt > 0) {
                ctx.globalAlpha = 0.35 + 0.65 * lt;
                rr(cx, cy, cw, ch, 4, col + '33', col + 'bb', 1.4);
                tx(String(i), cx + cw / 2, cy + ch / 2, fs, col + 'ff', 'center', true);
                ctx.globalAlpha = 1;
            } else {
                rr(cx, cy, cw, ch, 4, P.sub + '12', P.sub + '55', 1);
                tx(String(i), cx + cw / 2, cy + ch / 2, fs, P.sub + 'ff', 'center', false);
            }
        }
        var fr0 = svMFrame(p.stage, gr), fr1 = svMFrame(s.stage, gr);
        var fr = null, fa = 1;
        if (p.stage === s.stage) fr = fr1;
        else if (fr0 && fr1) fr = { x: lerp(fr0.x, fr1.x, ez(t)), w: lerp(fr0.w, fr1.w, ez(t)) };
        else if (fr1) { fr = fr1; fa = ez(t); }
        else if (fr0) { fr = fr0; fa = 1 - ez(t); }
        if (fr && fa > 0) {
            ctx.globalAlpha = fa;
            rr(fr.x, cy - 4, fr.w, ch + 8, 6, 'none', P.purple + 'ff', 2);
            ctx.globalAlpha = 1;
        }
        for (var gi = 0; gi < FULL; gi++) {
            var gl = svMLit(gi * LANES, s, p, t);
            if (gl <= 0) continue;
            var gx = sx + gi * LANES * (cw + gap);
            var gw = LANES * (cw + gap) - gap;
            ctx.globalAlpha = gl;
            rr(gx, cy + ch + 6, gw, 3, 1.5, P.purple + 'cc', 'none', 0);
            tx('벡터 ' + (gi + 1) + '회', gx + gw / 2, cy + ch + 16, fs, P.purple + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        }
        var rl = svMLit(FULL * LANES, s, p, t);
        if (rl > 0 && REM > 0) {
            var rx2 = sx + FULL * LANES * (cw + gap);
            var rw2 = REM * (cw + gap) - gap;
            ctx.globalAlpha = rl;
            rr(rx2, cy + ch + 6, rw2, 3, 1.5, P.orange + 'cc', 'none', 0);
            tx(mob ? '나머지' : '나머지 ' + REM + '개', rx2 + rw2 / 2, cy + ch + 16, fs, P.orange + 'ff', 'center', true);
            tx(mob ? '연산 ' + (FULL + REM) + '번 (하나씩이면 ' + TOTAL + '번)' : '연산 ' + (FULL + REM) + '번 (원소를 하나씩 처리하면 ' + TOTAL + '번)', x0, cy + ch + 38, fs, P.green + 'ff', 'left', true);
            ctx.globalAlpha = 1;
        }
        var y2 = top + L.y2;
        var cond = s.cond;
        tx(mob ? '조건: a > 0 → a, 아니면 0' : '조건문 — a > 0 이면 a, 아니면 0 (레인 ' + LANES + '개가 동시에)', x0, y2, fs, cond ? P.text + 'ee' : P.sub + 'ff', 'left', true);
        var lw = mob ? 44 : 110;
        var gap2 = mob ? 3 : 6;
        var cw2 = Math.min(64, (w - lw - gap2 * (LANES - 1)) / LANES);
        var ry0 = top + L.rows0;
        var labels = ['a', mob ? '마스크' : '마스크 (a > 0)', '결과'];
        var needs = [0, 1, 2];
        for (var ri = 0; ri < 3; ri++) {
            var yy = ry0 + ri * L.sp;
            tx(labels[ri], x0, yy + ch / 2, fs, (cond >= needs[ri] ? P.text : P.sub) + 'ff', 'left', true);
            for (var k = 0; k < LANES; k++) {
                var kx = x0 + lw + k * (cw2 + gap2);
                if (ri === 0) {
                    rr(kx, yy, cw2, ch, 4, P.purple + '26', P.purple + 'bb', 1.4);
                    tx(String(CA[k]), kx + cw2 / 2, yy + ch / 2, fs, P.purple + 'ff', 'center', true);
                    continue;
                }
                var lk = 0;
                if (ri === 1) lk = cond < 1 ? 0 : (p.cond >= 1 ? 1 : seg(t, k * 0.2, k * 0.2 + 0.4));
                if (ri === 2) lk = cond < 2 ? 0 : (p.cond >= 2 ? 1 : ez(seg(t, k * 0.12, k * 0.12 + 0.6)));
                if (lk <= 0) {
                    rr(kx, yy, cw2, ch, 4, 'none', P.sub + '44', 1);
                    tx('?', kx + cw2 / 2, yy + ch / 2, fs, P.sub + 'ff', 'center', false);
                } else {
                    var vcol = ri === 1 ? (MASK[k] ? P.green : P.red) : (MASK[k] ? P.green : P.sub);
                    ctx.globalAlpha = lk;
                    rr(kx, yy, cw2, ch, 4, vcol + '26', vcol + 'bb', 1.4);
                    tx(String(ri === 1 ? MASK[k] : CRES[k]), kx + cw2 / 2, yy + ch / 2, fs, vcol + 'ff', 'center', true);
                    ctx.globalAlpha = 1;
                }
                if (ri === 2 && cond >= 2 && p.cond < 2 && lk > 0 && lk < 1) {
                    svChip(kx + cw2 / 2, lerp(ry0 + ch / 2, yy + ch / 2, lk), String(CA[k]), P.yellow, cw2, fs);
                }
            }
        }
    }

    /* ===================== 드로우 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        if (mode === 'lane') svDrawL(x0, top, w, mob, step, prev, t);
        else if (mode === 'mask') svDrawM(x0, top, w, mob, step, prev, t);
        else svDrawV(x0, top, w, mob, step, prev, t);
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

    window.CsFlow.mount3dButton({
        container: container,
        parent: controls,
        cls: 'simd-viz__btn simd-viz__btn--primary',
        label: '3D 붕어빵 틀',
        onOpen: function () {
            vizReset();
            root.classList.add('simd-viz--hidden');
        },
        onExit: function () {
            root.classList.remove('simd-viz--hidden');
            resize();
        }
    });

    setTimeout(resize, 60);
})();