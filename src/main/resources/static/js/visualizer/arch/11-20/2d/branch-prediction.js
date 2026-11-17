/**
 * 분기 예측 시각화 시각화
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
    var root    = el('div', 'bp-viz');
    var toolbar = el('div', 'bp-viz__toolbar');
    var tbLeft  = el('div', 'bp-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'bp-viz__title', 'BRANCH PREDICTOR'));

    var modeWrap = el('div', 'bp-viz__mode');
    var modeDefs = [
        { key: 'pipe', label: '파이프라인 페널티' },
        { key: 'bits', label: '1비트 vs 2비트' },
        { key: 'acc', label: '적중률 비교' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'bp-viz__mode-btn' + (i === 0 ? ' bp-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'bp-viz__speed');
    speedWrap.appendChild(el('span', 'bp-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'bp-viz__speed-btn' + (i === 0 ? ' bp-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'bp-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'bp-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'bp-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'bp-viz__controls');
    var btnPlay  = el('button', 'bp-viz__btn bp-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'bp-viz__btn', '▶| STEP');
    var btnReset = el('button', 'bp-viz__btn', '↺ RESET');
    btnPlay.addEventListener('click',  vizStart);
    btnStep.addEventListener('click',  vizStep);
    btnReset.addEventListener('click', vizReset);
    controls.appendChild(btnPlay);
    controls.appendChild(btnStep);
    controls.appendChild(btnReset);
    root.appendChild(controls);
    container.appendChild(root);

    /* ===================== 3D 철도 분기점 전환 ===================== */
    window.CsFlow.mount3dButton({
        container: container,
        parent: toolbar,
        cls: 'bp-viz__btn bp-viz__btn--primary',
        label: '3D 철도 분기점',
        onOpen: function () {
            vizReset();
            root.classList.add('bp-viz--hidden');
        },
        onExit: function () {
            root.classList.remove('bp-viz--hidden');
            resize();
        }
    });

    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    function GW() { return canvas.width / dpr; }
    function GH() { return canvas.height / dpr; }

    var P = window.CsFlow.getP();

    /* ===================== 상태 ===================== */
    var mode    = 'pipe';
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

    /* ===================== 데이터: 파이프라인 ===================== */
    var STAGES = ['IF', 'ID', 'EX', 'MEM', 'WB'];
    var COLS   = 9;
    var ROWS_A = [
        { name: 'BEQ', start: 1, len: 5, kind: 'br' },
        { name: 'T1',  start: 2, len: 5, kind: 'ok' },
        { name: 'T2',  start: 3, len: 5, kind: 'ok' },
        { name: 'T3',  start: 4, len: 5, kind: 'ok' }
    ];
    var ROWS_B = [
        { name: 'BEQ', start: 1, len: 5, kind: 'br' },
        { name: 'F1',  start: 2, len: 2, kind: 'bad' },
        { name: 'F2',  start: 3, len: 1, kind: 'bad' },
        { name: 'T1',  start: 4, len: 5, kind: 'ok' },
        { name: 'T2',  start: 5, len: 5, kind: 'ok' }
    ];

    var PIPE_STEPS = [
        { a: 2, b: 0, log: '예측 성공 — BEQ의 결과가 EX에서 확정되기 전에 예측기가 taken으로 예측해, 목적지 T1을 사이클 2에 미리 fetch합니다.' },
        { a: 8, b: 0, log: '예측이 맞으면 T1, T2, T3가 빈틈없이 이어져 낭비되는 사이클(버블)이 0입니다.' },
        { a: 8, b: 3, log: '예측 실패 — 예측기가 not-taken이라 예측해 BEQ 다음 명령 F1, F2(fall-through)를 미리 fetch합니다. BEQ는 사이클 3(EX)에서야 결과가 확정됩니다.' },
        { a: 8, b: 4, log: '사이클 3 끝에 BEQ가 taken으로 확정 — 예측이 틀렸으므로 F1, F2를 버리고(flush) 사이클 4에 올바른 목적지 T1을 fetch합니다.' },
        { a: 8, b: 9, log: 'T1은 사이클 8에 끝납니다. 예측이 맞았다면 사이클 6에 끝났을 것이므로 예측 실패 한 번에 2사이클을 잃었습니다.' },
        { a: 8, b: 9, log: '정리 — 예측 실패로 잃는 사이클은 분기가 확정되는 단계의 깊이만큼입니다. 파이프라인이 깊을수록 예측 실패의 비용도 커집니다.' }
    ];

    /* ===================== 데이터: 1비트 vs 2비트 ===================== */
    var SEQ   = [1, 1, 1, 0, 1, 1, 1, 0];
    var INIT1 = 1;
    var INIT2 = 3;
    var pred1 = [], pred2 = [], after1 = [], after2 = [];
    (function () {
        var s1 = INIT1, s2 = INIT2;
        SEQ.forEach(function (o) {
            pred1.push(s1);
            pred2.push(s2 >= 2 ? 1 : 0);
            s1 = o;
            s2 = o ? Math.min(3, s2 + 1) : Math.max(0, s2 - 1);
            after1.push(s1);
            after2.push(s2);
        });
    })();

    function tn(v) { return v ? 'taken' : 'not-taken'; }
    var BITS_STEPS = [];
    var miss1 = 0, miss2 = 0;
    SEQ.forEach(function (o, i) {
        var hit1 = pred1[i] === o;
        var hit2 = pred2[i] === o;
        if (!hit1) miss1++;
        if (!hit2) miss2++;
        var prev2 = i === 0 ? INIT2 : after2[i - 1];
        var msg = '분기 ' + (i + 1) + ' — 실제 ' + tn(o) + '. 1비트는 ' + tn(pred1[i]) + ' 예측(' + (hit1 ? '적중' : '실패') +
            '), 2비트는 ' + tn(pred2[i]) + ' 예측(' + (hit2 ? '적중' : '실패') + ', 카운터 ' + prev2 + '→' + after2[i] + ').';
        if (i === 3) msg += ' 반복문이 끝났습니다. 1비트는 상태가 뒤집혔고, 2비트는 3에서 2로 한 칸만 내려갔습니다.';
        if (i === 4) msg += ' 새 반복문 시작 — 1비트는 not-taken을 예측해 또 틀리지만, 2비트는 아직 taken을 예측해 맞춥니다.';
        BITS_STEPS.push({ log: msg });
    });
    BITS_STEPS.push({ log: '정리 — 8번 중 1비트는 ' + miss1 + '번, 2비트는 ' + miss2 + '번 틀렸습니다. 반복문이 계속되면 1비트는 반복문마다 2번, 2비트는 1번 틀립니다.' });

    /* ===================== 데이터: 적중률 ===================== */
    var ACC_N = 100;
    var PATTERNS = [
        { name: '반복문 (T×9, N)', short: '반복문 T×9,N', gen: function (i) { return i % 10 === 9 ? 0 : 1; } },
        { name: '교대 (T, N, T, N…)', short: '교대 T,N,T,N', gen: function (i) { return i % 2 === 0 ? 1 : 0; } },
        { name: '항상 taken', short: '항상 taken', gen: function () { return 1; } }
    ];
    var PREDICTORS = [
        { key: 'static', label: '정적 (항상 T)', short: '정적', color: 'purple' },
        { key: 'one',    label: '1비트',         short: '1비트', color: 'orange' },
        { key: 'two',    label: '2비트',         short: '2비트', color: 'teal' }
    ];

    function simulate(pattern, kind) {
        var hits = 0, s1 = 1, s2 = 3;
        for (var i = 0; i < ACC_N; i++) {
            var o = pattern.gen(i);
            var p;
            if (kind === 'static') p = 1;
            else if (kind === 'one') p = s1;
            else p = s2 >= 2 ? 1 : 0;
            if (p === o) hits++;
            s1 = o;
            s2 = o ? Math.min(3, s2 + 1) : Math.max(0, s2 - 1);
        }
        return hits * 100 / ACC_N;
    }
    var ACC = PATTERNS.map(function (pt) {
        return PREDICTORS.map(function (pr) { return simulate(pt, pr.key); });
    });
    function pct(v) { return v.toFixed(0) + '%'; }

    var ACC_STEPS = [
        { groups: 1, log: '반복문 패턴 — 정적 ' + pct(ACC[0][0]) + ', 1비트 ' + pct(ACC[0][1]) + ', 2비트 ' + pct(ACC[0][2]) +
            '. 1비트는 종료 때와 재진입 때 두 번 틀려서 정적 예측보다도 낮습니다.' },
        { groups: 2, log: '교대 패턴 — 1비트는 직전 결과를 그대로 따라 하므로 거의 계속 틀립니다(' + pct(ACC[1][1]) +
            '). 2비트는 카운터가 2와 3 사이를 오가며 절반(' + pct(ACC[1][2]) + ')은 맞춥니다.' },
        { groups: 3, log: '항상 taken — 세 예측기 모두 ' + pct(ACC[2][0]) + '. 단순한 패턴에서는 예측기 사이에 차이가 없습니다.' },
        { groups: 3, log: '정리 — 패턴이 단순하면 어떤 예측기든 잘 맞지만, 반복문 종료나 교대 같은 패턴에서는 상태를 기억하는 방식에 따라 적중률이 크게 갈립니다.' }
    ];

    window.CsFlow.branchPredictionData = {
        SEQ: SEQ,
        INIT1: INIT1,
        INIT2: INIT2,
        pred1: pred1,
        pred2: pred2,
        after1: after1,
        after2: after2,
        PATTERNS: PATTERNS,
        ACC: ACC,
        PIPE_STEPS: PIPE_STEPS,
        BITS_STEPS: BITS_STEPS,
        ACC_STEPS: ACC_STEPS
    };

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'bits') return BITS_STEPS;
        if (mode === 'acc') return ACC_STEPS;
        return PIPE_STEPS;
    }
    function defaultLog() {
        if (mode === 'bits') return '같은 분기 결과를 1비트 예측기와 2비트 포화 카운터 예측기가 어떻게 다르게 예측하는지 비교합니다.';
        if (mode === 'acc') return '분기 100번의 결과 패턴별로 세 가지 예측기의 적중률을 비교합니다.';
        return '분기 예측: 결과가 확정되기 전에 다음 명령어를 미리 가져오고, 틀리면 버리고 다시 시작합니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        if (mode === 'bits') {
            var bcH  = mob ? 26 : 30;
            var bgap = mob ? 8 : 10;
            var bsy  = 22 + 3 * (bcH + bgap) + 14;
            return { fs: mob ? 11 : 12.5, labelW: mob ? 58 : 92, cellH: bcH, rowGap: bgap, y0: 22, sy: bsy, sy2: bsy + 56, total: bsy + 116 };
        }
        if (mode === 'acc') {
            var arH = mob ? 24 : 28;
            var agH = 20 + 3 * arH + (mob ? 8 : 10);
            return { fs: mob ? 11 : 12.5, labelW: mob ? 50 : 96, valW: mob ? 44 : 56, rowH: arH, barH: mob ? 16 : 20, gapG: mob ? 8 : 10, total: 4 + 3 * agH + 6 };
        }
        var pcH = mob ? 20 : 24;
        var prH = pcH + 4;
        var secA = 20 + 4 * prH;
        var secB = 20 + 5 * prH;
        var bT = 22 + secA + 12;
        return { fs: mob ? 11 : 12.5, labelW: mob ? 36 : 60, cellH: pcH, rowH: prH, bTop: bT, total: bT + secB + 8 };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 보조 함수 ===================== */
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }
    function bpFlag(pv, nv, th, e, a0, a1) {
        var from = pv >= th ? 1 : 0;
        var to = nv >= th ? 1 : 0;
        return lerp(from, to, seg(e, a0, a1));
    }
    function bpOnAmt(from, to, v, e) {
        if (from === to) return to === v ? 1 : 0;
        return (from === v ? 1 - e : 0) + (to === v ? e : 0);
    }
    function bpKindCol(kind) {
        if (kind === 'br') return P.purple;
        if (kind === 'bad') return P.red;
        return P.teal;
    }
    function bpVis1(j) { return j < 0 ? INIT1 : after1[Math.min(j, SEQ.length - 1)]; }
    function bpVis2(j) { return j < 0 ? INIT2 : after2[Math.min(j, SEQ.length - 1)]; }

    /* ===================== 모드: 파이프라인 페널티 ===================== */
    function bpPipeSec(x0, barX, cellW, y, fs, cellH, rowH, rows, rf, dimF) {
        rows.forEach(function (r, ri) {
            var ry = y + 20 + ri * rowH;
            var rc = bpKindCol(r.kind);
            var la = clamp01(rf - (r.start - 1));
            if (la > 0) {
                ctx.globalAlpha = la;
                tx(r.name, x0, ry + cellH / 2, fs, rc + 'ff', 'left', true);
                ctx.globalAlpha = 1;
            }
            for (var k = 0; k < r.len; k++) {
                var cyc = r.start + k;
                var dim = r.kind === 'bad' ? 1 - 0.45 * dimF : 1;
                var ca = clamp01(rf - (cyc - 1)) * dim;
                if (ca <= 0) continue;
                var cx = barX + (cyc - 1) * cellW;
                ctx.globalAlpha = ca;
                rr(cx + 0.5, ry, cellW - 1, cellH, 3, rc + '33', rc + '99', 1.3);
                tx(STAGES[k], cx + cellW / 2, ry + cellH / 2, fs, rc + 'ff', 'center', true);
                ctx.globalAlpha = 1;
            }
        });
    }
    function bpDrawPipe(x0, top, w, mob, s, p, e) {
        var L = layout(w, mob);
        var fs = L.fs, cellH = L.cellH, rowH = L.rowH;
        var barX = x0 + L.labelW;
        var cellW = Math.min(50, (w - L.labelW) / COLS);
        var ra = lerp(p.a, s.a, e);
        var rb = lerp(p.b, s.b, e);
        var aTop = top + 22;
        var bTop = top + L.bTop;
        var aTitle = mob ? '예측 성공' : '예측 성공 — taken 예측, 실제 taken';
        var bTitle = mob ? '예측 실패' : '예측 실패 — not-taken 예측, 실제 taken';
        var fl = bpFlag(p.b, s.b, 4, e, 0.5, 1);
        var rv = bpFlag(p.b, s.b, 3, e, 0.6, 1);

        tx('사이클', x0, top + 6, fs, P.sub + 'ff', 'left', false);
        for (var c = 1; c <= COLS; c++) {
            tx(String(c), barX + (c - 0.5) * cellW, top + 6, fs, P.sub + 'ff', 'center', false);
        }
        tx(aTitle, x0, aTop + 6, fs, (s.a > 0 ? P.teal : P.sub) + 'ff', 'left', true);
        tx(bTitle, x0, bTop + 6, fs, (s.b > 0 ? P.red : P.sub) + 'ff', 'left', true);
        var fa = bpFlag(p.a, s.a, 8, e, 0, 1);
        if (fa > 0) {
            ctx.globalAlpha = fa;
            tx('버블 0', x0 + w, aTop + 6, fs, P.teal + 'ff', 'right', true);
            ctx.globalAlpha = 1;
        }
        var fb = bpFlag(p.b, s.b, 9, e, 0, 1);
        if (fb > 0) {
            ctx.globalAlpha = fb;
            tx('2사이클 지연', x0 + w, bTop + 6, fs, P.red + 'ff', 'right', true);
            ctx.globalAlpha = 1;
        }

        bpPipeSec(x0, barX, cellW, aTop, fs, cellH, rowH, ROWS_A, ra, 0);
        bpPipeSec(x0, barX, cellW, bTop, fs, cellH, rowH, ROWS_B, rb, fl);

        if (rv > 0) {
            ctx.globalAlpha = rv;
            rr(barX + 2 * cellW + 0.5, bTop + 20, cellW - 1, cellH, 3, 'none', P.orange + 'ff', 2.6);
            ctx.globalAlpha = 1;
        }
        if (fl > 0) {
            var lx = barX + 3 * cellW;
            ctx.globalAlpha = fl;
            ln(lx, bTop + 20, lx, bTop + 20 + ROWS_B.length * rowH - 4, P.orange + 'cc', 1.6, [5, 4]);
            ROWS_B.forEach(function (r, ri) {
                if (r.kind !== 'bad') return;
                tx('✕', barX + 3.5 * cellW, bTop + 20 + ri * rowH + cellH / 2, fs + 2, P.red + 'ff', 'center', true);
            });
            ctx.globalAlpha = 1;
        }
    }

    /* ===================== 모드: 1비트 vs 2비트 ===================== */
    function bpDrawBits(x0, top, w, mob, s, p, e) {
        var L = layout(w, mob);
        var n = SEQ.length;
        var steps = currentSteps();
        var ci = steps.indexOf(s);
        var pi = steps.indexOf(p);
        var fs = L.fs, cellH = L.cellH, rowGap = L.rowGap;
        var boxH = 30;
        var barX = x0 + L.labelW;
        var cellW = Math.min(52, (w - L.labelW) / n);
        var shown = Math.min(ci + 1, n);
        var shownPrev = Math.min(pi + 1, n);
        var y0 = top + L.y0;
        var curCol = ci < n ? ci : -1;
        var prevCol = pi < n ? pi : -1;

        tx('분기 #', x0, top + 6, fs, P.sub + 'ff', 'left', false);
        for (var i = 0; i < n; i++) {
            tx(String(i + 1), barX + (i + 0.5) * cellW, top + 6, fs, P.sub + 'ff', 'center', false);
        }

        var rowLabels = ['실제 결과', mob ? '1비트' : '1비트 예측', mob ? '2비트' : '2비트 예측'];
        rowLabels.forEach(function (label, ri) {
            var ry = y0 + ri * (cellH + rowGap);
            tx(label, x0, ry + cellH / 2, fs, P.text + 'ff', 'left', true);
            for (var j = 0; j < shown; j++) {
                var fresh = j >= shownPrev;
                var ca = fresh ? e : 1;
                if (ca <= 0) continue;
                var o = SEQ[j];
                var col, val;
                if (ri === 0) {
                    col = o ? P.teal : P.orange;
                    val = o ? 'T' : 'N';
                } else {
                    var pv = ri === 1 ? pred1[j] : pred2[j];
                    col = pv === o ? P.green : P.red;
                    val = pv ? 'T' : 'N';
                }
                var cx = barX + j * cellW;
                var dy = fresh ? (1 - e) * -8 : 0;
                ctx.globalAlpha = ca;
                rr(cx + 1.5, ry + dy, cellW - 3, cellH, 4, col + '33', col + 'aa', 1.4);
                tx(val, cx + cellW / 2, ry + dy + cellH / 2, fs + 1, col + 'ff', 'center', true);
                ctx.globalAlpha = 1;
            }
        });

        var frameCol = curCol >= 0 ? curCol : prevCol;
        var frameFrom = prevCol >= 0 ? prevCol : frameCol;
        var frameA = curCol >= 0 ? 1 : 1 - e;
        if (frameCol >= 0 && frameA > 0) {
            ctx.globalAlpha = frameA;
            rr(barX + lerp(frameFrom, frameCol, e) * cellW, y0 - 4, cellW, 3 * cellH + 2 * rowGap + 8, 5, 'none', P.purple + 'cc', 2);
            ctx.globalAlpha = 1;
        }

        var sy = y0 + 3 * (cellH + rowGap) + 14;
        var sy2 = sy + 56;
        var st1From = bpVis1(pi), st1To = bpVis1(ci);
        var st2From = bpVis2(pi), st2To = bpVis2(ci);
        var boxW = mob ? 44 : 56;

        tx(mob ? '1비트' : '1비트 상태', x0, sy + 15, fs, P.text + 'ff', 'left', true);
        [1, 0].forEach(function (v) {
            var bx = barX + (v ? 0 : boxW + 10);
            var col = v ? P.teal : P.orange;
            var on = bpOnAmt(st1From, st1To, v, e);
            rr(bx, sy, boxW, boxH, 5, col + '14', col + '55', 1.2);
            if (on > 0) {
                ctx.globalAlpha = on;
                rr(bx, sy, boxW, boxH, 5, col + '44', col + 'ee', 2.4);
                ctx.globalAlpha = 1;
            }
            ctx.globalAlpha = 0.45 + 0.55 * on;
            tx(v ? 'T' : 'N', bx + boxW / 2, sy + 15, fs + 1, col + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        });
        tx('직전 결과', barX + 2 * (boxW + 10) + 4, sy + 15, mob ? 11 : 11.5, P.sub + 'ff', 'left', false);
        if (st1From !== st1To) {
            var dx1 = lerp(barX + (st1From ? 0 : boxW + 10) + boxW / 2, barX + (st1To ? 0 : boxW + 10) + boxW / 2, ez(e));
            ctx.globalAlpha = clamp01(4 * e * (1 - e));
            circ(dx1, sy - 9, 4.5, P.purple + 'ff', null);
            ctx.globalAlpha = 1;
        }

        tx(mob ? '2비트' : '2비트 카운터', x0, sy2 + 15, fs, P.text + 'ff', 'left', true);
        var gap2 = mob ? 6 : 18;
        var bw2 = Math.floor(Math.min(78, (w - L.labelW - gap2 * 3) / 4));
        var names = ['0 SN', '1 WN', '2 WT', '3 ST'];
        for (var sI = 0; sI < 4; sI++) {
            var bx2 = barX + sI * (bw2 + gap2);
            var col2 = sI >= 2 ? P.teal : P.orange;
            var on2 = bpOnAmt(st2From, st2To, sI, e);
            rr(bx2, sy2, bw2, boxH, 5, col2 + '14', col2 + '55', 1.2);
            if (on2 > 0) {
                ctx.globalAlpha = on2;
                rr(bx2, sy2, bw2, boxH, 5, col2 + '44', col2 + 'ee', 2.4);
                ctx.globalAlpha = 1;
            }
            ctx.globalAlpha = 0.45 + 0.55 * on2;
            tx(names[sI], bx2 + bw2 / 2, sy2 + 15, mob ? 11 : 12, col2 + 'ff', 'center', true);
            ctx.globalAlpha = 1;
            tx(sI >= 2 ? '예측 T' : '예측 N', bx2 + bw2 / 2, sy2 + 44, mob ? 11 : 11.5, P.sub + 'ff', 'center', false);
            if (!mob && sI < 3) tx('⇄', bx2 + bw2 + gap2 / 2, sy2 + 15, fs, P.sub + 'ff', 'center', false);
        }
        if (st2From !== st2To) {
            var c2f = barX + st2From * (bw2 + gap2) + bw2 / 2;
            var c2t = barX + st2To * (bw2 + gap2) + bw2 / 2;
            ctx.globalAlpha = clamp01(4 * e * (1 - e));
            circ(lerp(c2f, c2t, ez(e)), sy2 - 9, 4.5, P.purple + 'ff', null);
            ctx.globalAlpha = 1;
        }
    }

    /* ===================== 모드: 적중률 비교 ===================== */
    function bpDrawAcc(x0, top, w, mob, s, p, e) {
        var L = layout(w, mob);
        var fs = L.fs;
        var barX = x0 + L.labelW;
        var barMax = Math.max(100, w - L.labelW - L.valW - 6);
        var y = top + 4;
        PATTERNS.forEach(function (pt, gi) {
            var on = gi < s.groups;
            var fresh = on && gi >= p.groups;
            var ga = on ? (fresh ? e : 1) : 0.5;
            var gr = fresh ? ez(e) : 1;
            ctx.globalAlpha = ga;
            tx(mob ? pt.short : pt.name, x0, y + 6, fs, (on ? P.text : P.sub) + 'ff', 'left', true);
            var yy = y + 20;
            PREDICTORS.forEach(function (pr, pi) {
                var ry = yy + pi * L.rowH;
                tx(mob ? pr.short : pr.label, x0, ry + L.barH / 2, fs, (on ? P.text : P.sub) + 'ff', 'left', false);
                if (!on) return;
                var v = ACC[gi][pi];
                var col = P[pr.color];
                rr(barX, ry, barMax, L.barH, 4, P.muted + '18', null);
                if (v > 0 && gr > 0) rr(barX, ry, Math.max(4, barMax * v / 100 * gr), L.barH, 4, col + '55', col + 'ee', 1.6);
                tx(pct(v * gr), barX + barMax + 8, ry + L.barH / 2, fs, col + 'ff', 'left', true);
            });
            ctx.globalAlpha = 1;
            y = yy + PREDICTORS.length * L.rowH + L.gapG;
        });
    }

    /* ===================== 장면 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var steps = currentSteps();
        var s = step || steps[0];
        var p = prev || s;
        var e = clamp01(t);
        if (mode === 'bits') bpDrawBits(x0, top, w, mob, s, p, e);
        else if (mode === 'acc') bpDrawAcc(x0, top, w, mob, s, p, e);
        else bpDrawPipe(x0, top, w, mob, s, p, e);
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
        speedBtns.forEach(function (b) { b.classList.remove('bp-viz__speed-btn--active'); });
        btn.classList.add('bp-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('bp-viz__mode-btn--active', d.key === m); });
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