/**
 * 분기 예측 시각화
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
        { key: 'acc',  label: '적중률 비교' }
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
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
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

    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

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

    /* ===================== 상태 ===================== */
    var mode    = 'pipe';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'bits') return BITS_STEPS;
        if (mode === 'acc') return ACC_STEPS;
        return PIPE_STEPS;
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
    function kindColor(kind) {
        if (kind === 'br') return P.purple;
        if (kind === 'bad') return P.red;
        return P.teal;
    }

    /* ===================== 모드: 파이프라인 페널티 ===================== */
    function drawPipeSection(x0, w, y, title, rightText, rightColor, rows, revealed, barX, cellW, cellH, fs, mob, flushed) {
        tx(title, x0, y + 6, fs, P.text + 'ee', 'left', true);
        if (rightText) tx(rightText, x0 + w, y + 6, fs, rightColor, 'right', true);
        var yy = y + 20;
        rows.forEach(function (r, ri) {
            var ry = yy + ri * (cellH + 4);
            tx(r.name, x0, ry + cellH / 2, fs, kindColor(r.kind) + 'ee', 'left', true);
            for (var k = 0; k < r.len; k++) {
                var cyc = r.start + k;
                if (cyc > revealed) break;
                var col = kindColor(r.kind);
                var cx = barX + (cyc - 1) * cellW;
                var isResolve = flushed && r.name === 'BEQ' && k === 2 && revealed >= 3;
                rr(cx + 1, ry, cellW - 2, cellH, 3, col + '30', isResolve ? P.orange + 'ee' : col + '99', isResolve ? 2.6 : 1.3);
                tx(STAGES[k], cx + cellW / 2, ry + cellH / 2, mob ? 9.5 : 11, col + 'ee', 'center', true);
            }
            if (flushed && revealed >= 4 && r.kind === 'bad') {
                tx('✕', barX + 3.5 * cellW + cellW * 0.5, ry + cellH / 2, mob ? 12 : 14, P.red + 'ee', 'center', true);
            }
        });
        return yy + rows.length * (cellH + 4);
    }

    function drawPipe(x0, top, w, mob, step) {
        var fs     = mob ? 11 : 12.5;
        var labelW = mob ? 38 : 54;
        var barX   = x0 + labelW;
        var cellW  = Math.min(50, (w - labelW) / COLS);
        var cellH  = mob ? 20 : 24;
        var a      = step ? step.a : 0;
        var b      = step ? step.b : 0;

        tx('사이클', x0, top + 6, mob ? 9.5 : 11, P.muted + 'cc', 'left', false);
        for (var c = 1; c <= COLS; c++) {
            tx(String(c), barX + (c - 0.5) * cellW, top + 6, mob ? 10 : 11.5, P.muted + 'cc', 'center', false);
        }

        var y = top + 22;
        var aTitle = mob ? '예측 성공' : '예측 성공 — taken 예측, 실제 taken';
        var bTitle = mob ? '예측 실패' : '예측 실패 — not-taken 예측, 실제 taken';
        var aRight = a >= 8 ? '버블 0' : '';
        var bRight = b >= 9 ? '2사이클 지연' : '';

        if (a > 0) {
            y = drawPipeSection(x0, w, y, aTitle, aRight, P.teal + 'ee', ROWS_A, a, barX, cellW, cellH, fs, mob, false);
        } else {
            tx(aTitle, x0, y + 6, fs, P.muted + '88', 'left', true);
            y += 20 + ROWS_A.length * (cellH + 4);
        }
        y += 12;
        var bTop = y;
        if (b > 0) {
            y = drawPipeSection(x0, w, y, bTitle, bRight, P.red + 'ee', ROWS_B, b, barX, cellW, cellH, fs, mob, true);
            if (b >= 4) {
                var lx = barX + 3 * cellW;
                dashedLine(lx, bTop + 22, lx, y - 2, P.orange + 'cc');
            }
        } else {
            tx(bTitle, x0, y + 6, fs, P.muted + '88', 'left', true);
        }
    }

    /* ===================== 모드: 1비트 vs 2비트 ===================== */
    function drawBits(x0, top, w, mob, step) {
        var fs      = mob ? 11 : 12.5;
        var labelW  = mob ? 58 : 92;
        var barX    = x0 + labelW;
        var n       = SEQ.length;
        var cellW   = Math.min(52, (w - labelW) / n);
        var cellH   = mob ? 26 : 30;
        var rowGap  = mob ? 8 : 10;
        var shown   = step ? Math.min(stepIdx + 1, n) : 0;
        var curCol  = (step && stepIdx < n) ? stepIdx : -1;
        var rowsDef = [
            { label: '실제 결과' },
            { label: mob ? '1비트' : '1비트 예측' },
            { label: mob ? '2비트' : '2비트 예측' }
        ];
        var y0 = top + 22;

        for (var i = 0; i < n; i++) {
            tx(String(i + 1), barX + (i + 0.5) * cellW, top + 6, mob ? 10 : 11.5, P.muted + 'cc', 'center', false);
        }
        tx('분기 #', x0, top + 6, mob ? 9.5 : 11, P.muted + 'cc', 'left', false);

        rowsDef.forEach(function (rd, ri) {
            var ry = y0 + ri * (cellH + rowGap);
            tx(rd.label, x0, ry + cellH / 2, fs, P.text + 'cc', 'left', true);
            for (var i2 = 0; i2 < shown; i2++) {
                var o = SEQ[i2];
                var cx = barX + i2 * cellW;
                var col, val;
                if (ri === 0) {
                    col = o ? P.teal : P.orange;
                    val = o ? 'T' : 'N';
                } else {
                    var pv = ri === 1 ? pred1[i2] : pred2[i2];
                    col = pv === o ? P.green : P.red;
                    val = pv ? 'T' : 'N';
                }
                rr(cx + 2, ry, cellW - 4, cellH, 4, col + '30', col + 'aa', 1.4);
                tx(val, cx + cellW / 2, ry + cellH / 2, fs + 1, col + 'ee', 'center', true);
            }
        });

        if (curCol >= 0) {
            var hx = barX + curCol * cellW;
            rr(hx, y0 - 4, cellW, 3 * cellH + 2 * rowGap + 8, 5, 'none', P.purple + 'cc', 2);
        }

        var st1 = curCol >= 0 ? after1[curCol] : (step ? after1[n - 1] : INIT1);
        var st2 = curCol >= 0 ? after2[curCol] : (step ? after2[n - 1] : INIT2);

        var sy = y0 + 3 * (cellH + rowGap) + 14;
        tx(mob ? '1비트' : '1비트 상태', x0, sy + 15, fs, P.text + 'cc', 'left', true);
        var boxW = mob ? 44 : 56;
        [1, 0].forEach(function (v, vi) {
            var bx = barX + vi * (boxW + 10);
            var on = st1 === v;
            var col = v ? P.teal : P.orange;
            rr(bx, sy, boxW, 30, 5, col + (on ? '44' : '14'), col + (on ? 'ee' : '55'), on ? 2.4 : 1.2);
            tx(v ? 'T' : 'N', bx + boxW / 2, sy + 15, fs + 1, col + (on ? 'ee' : '88'), 'center', true);
        });
        tx('직전 결과', barX + 2 * (boxW + 10) + 4, sy + 15, mob ? 10 : 11.5, P.muted + 'cc', 'left', false);

        var sy2 = sy + 30 + 26;
        tx(mob ? '2비트' : '2비트 카운터', x0, sy2 + 15, fs, P.text + 'cc', 'left', true);
        var gap = mob ? 10 : 18;
        var bw2 = Math.max(44, Math.min(78, (w - labelW - gap * 3) / 4));
        var names = ['0 SN', '1 WN', '2 WT', '3 ST'];
        for (var s = 0; s < 4; s++) {
            var bx2 = barX + s * (bw2 + gap);
            var on2 = st2 === s;
            var col2 = s >= 2 ? P.teal : P.orange;
            rr(bx2, sy2, bw2, 30, 5, col2 + (on2 ? '44' : '14'), col2 + (on2 ? 'ee' : '55'), on2 ? 2.4 : 1.2);
            tx(names[s], bx2 + bw2 / 2, sy2 + 15, mob ? 10.5 : 12, col2 + (on2 ? 'ee' : '88'), 'center', true);
            tx(s >= 2 ? '예측 T' : '예측 N', bx2 + bw2 / 2, sy2 + 44, mob ? 9.5 : 11, P.muted + 'cc', 'center', false);
            if (s < 3) tx('⇄', bx2 + bw2 + gap / 2, sy2 + 15, fs, P.muted + 'aa', 'center', false);
        }
    }

    /* ===================== 모드: 적중률 비교 ===================== */
    function drawAcc(x0, top, w, mob, step) {
        var fs     = mob ? 11 : 12.5;
        var labelW = mob ? 50 : 96;
        var valW   = mob ? 44 : 56;
        var barX   = x0 + labelW;
        var barMax = Math.max(100, w - labelW - valW - 6);
        var rowH   = mob ? 24 : 28;
        var barH   = mob ? 16 : 20;
        var groups = step ? step.groups : 0;
        var y      = top + 4;

        PATTERNS.forEach(function (pt, gi) {
            var on = gi < groups;
            tx(mob ? pt.short : pt.name, x0, y + 6, fs, on ? P.text + 'ee' : P.muted + '88', 'left', true);
            var yy = y + 20;
            PREDICTORS.forEach(function (pr, pi) {
                var ry = yy + pi * rowH;
                tx(mob ? pr.short : pr.label, x0, ry + barH / 2, mob ? 10.5 : 12, on ? P.text + 'cc' : P.muted + '77', 'left', false);
                if (!on) return;
                var v = ACC[gi][pi];
                var col = P[pr.color];
                rr(barX, ry, barMax, barH, 4, P.muted + '18', null);
                if (v > 0) rr(barX, ry, Math.max(4, barMax * v / 100), barH, 4, col + '55', col + 'ee', 1.6);
                tx(pct(v), barX + barMax + 8, ry + barH / 2, fs, col + 'ee', 'left', true);
            });
            y = yy + PREDICTORS.length * rowH + (mob ? 8 : 10);
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

        if (mode === 'bits') drawBits(padX, top, fullW, mob, step);
        else if (mode === 'acc') drawAcc(padX, top, fullW, mob, step);
        else drawPipe(padX, top, fullW, mob, step);

        if (!step) {
            tx('아래 STEP을 눌러 분기 예측이 어떻게 동작하는지 확인하세요.', W / 2, GH() - (mob ? 12 : 14), mob ? 11 : 12.5, P.muted + 'aa', 'center', false);
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH;
        if (mode === 'bits') neededH = mob ? 340 : 372;
        else if (mode === 'acc') neededH = mob ? 330 : 380;
        else neededH = mob ? 340 : 392;
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
        if (mode === 'bits') return '같은 분기 결과를 1비트 예측기와 2비트 포화 카운터 예측기가 어떻게 다르게 예측하는지 비교합니다.';
        if (mode === 'acc') return '분기 100번의 결과 패턴별로 세 가지 예측기의 적중률을 비교합니다.';
        return '분기 예측: 결과가 확정되기 전에 다음 명령어를 미리 가져오고, 틀리면 버리고 다시 시작합니다.';
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