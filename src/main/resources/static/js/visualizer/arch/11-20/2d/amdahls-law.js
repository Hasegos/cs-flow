/**
 * 암달의 법칙 시각화 시각화
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
        { key: 'time', label: '시간 분할' },
        { key: 'curve', label: '속도 향상 곡선' },
        { key: 'bars', label: '병렬 비율 비교' }
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
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
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
    function GW() { return canvas.width / dpr; }
    function GH() { return canvas.height / dpr; }

    var P = window.CsFlow.getP();

    /* ===================== 상태 ===================== */
    var mode    = 'time';
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
    window.CsFlow.amdahlsLawData = { speedup: speedup, TIME_SER: TIME_SER, TIME_PAR: TIME_PAR, TIME_CORES: TIME_CORES, CURVE_PS: CURVE_PS };

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
    function currentSteps() {
        if (mode === 'curve') return CURVE_STEPS;
        if (mode === 'bars') return BARS_STEPS;
        return TIME_STEPS;
    }
    function defaultLog() {
        if (mode === 'curve') return '코어 수에 따른 속도 향상 곡선 — 병렬 비율이 높을수록 곡선이 더 높이 올라갑니다.';
        if (mode === 'bars') return '코어 8개로 고정 — 병렬 비율에 따라 속도 향상이 얼마나 달라지는지 비교합니다.';
        return '암달의 법칙: 코어를 늘려도 병렬화할 수 없는 직렬 구간은 줄어들지 않습니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var fs = mob ? 11 : 13;
        if (mode === 'curve') {
            var plotTop = mob ? 42 : 46;
            var plotH = mob ? 150 : 230;
            return { fs: fs, padL: mob ? 34 : 54, padR: mob ? 12 : 14, plotTop: plotTop, plotH: plotH, plotBot: plotTop + plotH, total: plotTop + plotH + 40 };
        }
        if (mode === 'bars') {
            var bLabelW = mob ? 50 : 76;
            var bValW = mob ? 44 : 68;
            var bRowH = mob ? 36 : 44;
            var bBarH = mob ? 22 : 28;
            var bY0 = mob ? 26 : 30;
            var bYb = bY0 + 4 * bRowH + bBarH + 14;
            return { fs: fs, labelW: bLabelW, barMaxW: Math.max(60, w - bLabelW - bValW - 8), y0: bY0, rowH: bRowH, barH: bBarH, yb: bYb, total: bYb + 24 };
        }
        var tLabelW = mob ? 50 : 78;
        var tValW = mob ? 84 : 140;
        var tRowH = mob ? 36 : 44;
        var tBarH = mob ? 22 : 28;
        var tY0 = (mob ? 34 : 20) + 14;
        return { fs: fs, labelW: tLabelW, valW: tValW, barMaxW: Math.max(60, w - tLabelW - tValW - 6), y0: tY0, rowH: tRowH, barH: tBarH, total: tY0 + 5 * tRowH + 24 };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 드로우 헬퍼 ===================== */
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }
    function amdHex(a) { var v = Math.round(clamp01(a) * 255); return (v < 16 ? '0' : '') + v.toString(16); }
    function amdA(c, a) { return c + amdHex(a); }
    function amdTW(str, fs) {
        var n = 0;
        for (var i = 0; i < str.length; i++) n += str.charCodeAt(i) < 128 ? 0.6 : 1;
        return n * fs;
    }
    function amdDot(cx, cy, r, fill) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
    }

    /* ===================== 시간 분할 장면 ===================== */
    function amdDrawTime(x0, top, w, mob, s, p, e, L) {
        var fs = L.fs;
        var rows = s.rows;
        var pRows = p ? p.rows : 0;
        var grew = rows !== pRows;
        var cur = rows - 1;
        var pCur = pRows - 1;
        var barX = x0 + L.labelW;
        var serW = L.barMaxW * TIME_SER / 100;
        var rightX = barX + L.barMaxW + 8;
        var legend = [['직렬(병렬화 불가)', P.orange], ['병렬(코어로 분할)', P.teal]];
        legend.forEach(function (it, k) {
            var lx = mob ? x0 : x0 + (k === 0 ? 0 : 18 + amdTW(legend[0][0], fs) + 22);
            var ly = top + (mob ? 8 + k * 18 : 8);
            rr(lx, ly - 6, 12, 12, 3, amdA(it[1], 0.8), null);
            tx(it[0], lx + 18, ly, fs, amdA(P.text, 0.8), 'left', false);
        });
        for (var i = 0; i < rows; i++) {
            var n = TIME_CORES[i];
            var par = TIME_PAR / n;
            var total = TIME_SER + par;
            var fresh = i >= pRows;
            var isCur = i === cur;
            var hw = isCur ? (grew ? ez(seg(e, 0.35, 1)) : 1) : (grew && i === pCur ? 1 - ez(seg(e, 0, 0.4)) : 0);
            var rowA = fresh ? ez(seg(e, 0, 0.35)) : 1;
            var y = top + L.y0 + i * L.rowH + (fresh ? (1 - rowA) * -8 : 0);
            var cy = y + L.barH / 2;
            var parTgt = L.barMaxW * par / 100;
            var parFrom = i === 0 ? 0 : L.barMaxW * (TIME_PAR / TIME_CORES[i - 1]) / 100;
            var parW = fresh ? lerp(parFrom, parTgt, ez(seg(e, 0.2, 0.85))) : parTgt;
            var serDraw = (fresh && i === 0) ? serW * ez(seg(e, 0, 0.5)) : serW;
            var lw = lerp(1.4, 2.2, hw);
            ctx.globalAlpha = rowA;
            tx('코어 ' + n, x0, cy, fs, amdA(P.text, lerp(0.67, 0.93, hw)), 'left', true);
            rr(barX, y, serDraw, L.barH, 4, amdA(P.orange, lerp(0.19, 0.33, hw)), amdA(P.orange, lerp(0.53, 0.93, hw)), lw);
            rr(barX + serDraw, y, parW, L.barH, 4, amdA(P.teal, lerp(0.19, 0.33, hw)), amdA(P.teal, lerp(0.53, 0.93, hw)), lw);
            if (serDraw >= 22) tx(String(TIME_SER), barX + serDraw / 2, cy, fs, amdA(P.orange, 0.93), 'center', true);
            if (parW >= 22) tx(String(par), barX + serDraw + parW / 2, cy, fs, amdA(P.teal, 0.93), 'center', true);
            ctx.globalAlpha = fresh ? seg(e, 0.6, 1) : 1;
            tx((mob ? '' : '총 ') + total + ' → ' + (100 / total).toFixed(2) + 'x', rightX, cy, fs, isCur ? amdA(P.text, 0.93) : P.sub, 'left', isCur);
            ctx.globalAlpha = 1;
        }
        if (s.limit) {
            var lim = !(p && p.limit);
            var lineX = barX + serW;
            var yTop = top + L.y0 - 6;
            var yBot = top + L.y0 + rows * L.rowH - 8;
            var yEnd = lim ? yTop + (yBot - yTop) * ez(seg(e, 0, 0.6)) : yBot;
            ln(lineX, yTop, lineX, yEnd, amdA(P.purple, 0.87), 1.6, [5, 4]);
            var lbl = '최소 시간 20 → 최대 5x';
            var lblX = Math.min(lineX + 8, x0 + w - amdTW(lbl, fs));
            ctx.globalAlpha = lim ? seg(e, 0.5, 1) : 1;
            tx(lbl, lblX, top + L.y0 + rows * L.rowH + 8, fs, amdA(P.purple, 0.93), 'left', true);
            ctx.globalAlpha = 1;
        }
    }

    /* ===================== 곡선 장면 ===================== */
    function amdDrawCurve(x0, top, w, mob, s, p, e, L) {
        var fs = L.fs;
        var plotL = x0 + L.padL;
        var plotR = x0 + w - L.padR;
        var plotW = plotR - plotL;
        var plotBot = top + L.plotBot;
        var plotH = L.plotH;
        var nN = CURVE_N.length;
        var pShown = p ? p.curves : 0;
        var yOf = function (v) { return plotBot - (v / 20) * plotH; };
        var xOf = function (i) { return plotL + plotW * i / (nN - 1); };
        var lx = x0;
        CURVE_PS.forEach(function (c, k) {
            var on = k < s.curves;
            var label = 'p=' + c.p;
            ctx.globalAlpha = (on && k >= pShown) ? seg(e, 0, 0.3) : 1;
            rr(lx, top + 2, 12, 12, 3, amdA(P[c.color], on ? 0.8 : 0.27), null);
            tx(label, lx + 18, top + 8, fs, on ? amdA(P.text, 0.93) : P.sub, 'left', on);
            ctx.globalAlpha = 1;
            lx += 18 + amdTW(label, fs) + 22;
        });
        [0, 5, 10, 15, 20].forEach(function (v) {
            var gy = yOf(v);
            ln(plotL, gy, plotR, gy, amdA(P.sub, v === 0 ? 0.53 : 0.2), 1);
            tx(v + 'x', plotL - 6, gy, fs, P.sub, 'right', false);
        });
        CURVE_N.forEach(function (n, i) {
            tx(String(n), xOf(i), plotBot + 14, fs, P.sub, 'center', false);
        });
        tx('코어 수(N)', (plotL + plotR) / 2, plotBot + 32, fs, P.sub, 'center', false);
        for (var k = 0; k < s.curves; k++) {
            var c = CURVE_PS[k];
            var col = P[c.color];
            var limit = 1 / (1 - c.p);
            var fresh = k >= pShown;
            var f = fresh ? ez(seg(e, 0, 0.8)) : 1;
            ctx.globalAlpha = fresh ? seg(e, 0.75, 1) : 1;
            ln(plotL, yOf(limit), plotR, yOf(limit), amdA(col, 0.67), 1.6, [5, 4]);
            tx('한계 ' + Math.round(limit) + 'x', plotR - 4, yOf(limit) - 10, fs, amdA(col, 0.93), 'right', true);
            ctx.globalAlpha = 1;
            var pos = (nN - 1) * f;
            ctx.strokeStyle = amdA(col, 0.93);
            ctx.lineWidth = 2.6;
            ctx.beginPath();
            ctx.moveTo(xOf(0), yOf(speedup(c.p, CURVE_N[0])));
            for (var i = 1; i < nN && i <= pos; i++) ctx.lineTo(xOf(i), yOf(speedup(c.p, CURVE_N[i])));
            var i0 = Math.floor(pos);
            if (i0 < nN - 1 && pos > i0) {
                var fr = pos - i0;
                ctx.lineTo(lerp(xOf(i0), xOf(i0 + 1), fr), lerp(yOf(speedup(c.p, CURVE_N[i0])), yOf(speedup(c.p, CURVE_N[i0 + 1])), fr));
            }
            ctx.stroke();
            for (var j = 0; j < nN; j++) {
                if (j <= pos) amdDot(xOf(j), yOf(speedup(c.p, CURVE_N[j])), 3.6, amdA(col, 0.93));
            }
        }
        if (s === CURVE_STEPS[CURVE_STEPS.length - 1]) {
            var c3 = CURVE_PS[2];
            var sp = (nN - 1) * ez(seg(e, 0, 0.9));
            var q0 = Math.min(Math.floor(sp), nN - 2);
            var fq = sp - q0;
            var mx = lerp(xOf(q0), xOf(q0 + 1), fq);
            var my = lerp(yOf(speedup(c3.p, CURVE_N[q0])), yOf(speedup(c3.p, CURVE_N[q0 + 1])), fq);
            var near = Math.round(sp);
            var mtxt = 'N=' + CURVE_N[near] + ' → ' + speedup(c3.p, CURVE_N[near]).toFixed(1) + 'x';
            var mw = amdTW(mtxt, fs);
            var mlx = Math.max(plotL, Math.min(mx - mw / 2, plotR - mw));
            amdDot(mx, my, 5, amdA(P.yellow, 0.93));
            tx(mtxt, mlx + mw / 2, my - 12, fs, P.yellow, 'center', true);
        }
    }

    /* ===================== 병렬 비율 장면 ===================== */
    function amdDrawBars(x0, top, w, mob, s, p, e, L) {
        var fs = L.fs;
        var rows = s.rows;
        var pRows = p ? p.rows : 0;
        var grew = rows !== pRows;
        var cur = rows - 1;
        var pCur = pRows - 1;
        var barX = x0 + L.labelW;
        var idealX = barX + L.barMaxW;
        ln(idealX, top + L.y0 - 8, idealX, top + L.y0 + 5 * L.rowH - 10, amdA(P.purple, 0.8), 1.6, [5, 4]);
        tx('이상적 ' + BARS_N + 'x', idealX, top + 10, fs, amdA(P.purple, 0.93), 'center', true);
        for (var i = 0; i < rows; i++) {
            var pv = BARS_P[i];
            var sv = speedup(pv, BARS_N);
            var fresh = i >= pRows;
            var isCur = i === cur;
            var hw = isCur ? (grew ? ez(seg(e, 0.35, 1)) : 1) : (grew && i === pCur ? 1 - ez(seg(e, 0, 0.4)) : 0);
            var rowA = fresh ? ez(seg(e, 0, 0.35)) : 1;
            var y = top + L.y0 + i * L.rowH + (fresh ? (1 - rowA) * -8 : 0);
            var cy = y + L.barH / 2;
            var len = L.barMaxW * sv / BARS_N * (fresh ? ez(seg(e, 0.1, 0.85)) : 1);
            ctx.globalAlpha = rowA;
            tx('p=' + pv.toFixed(2), x0, cy, fs, amdA(P.text, lerp(0.67, 0.93, hw)), 'left', true);
            rr(barX, y, len, L.barH, 4, amdA(P.teal, lerp(0.19, 0.33, hw)), amdA(P.teal, lerp(0.53, 0.93, hw)), lerp(1.4, 2.2, hw));
            ctx.globalAlpha = fresh ? seg(e, 0.6, 1) : 1;
            tx(sv.toFixed(2) + 'x', idealX + 10, cy, fs, isCur ? amdA(P.text, 0.93) : P.sub, 'left', isCur);
            ctx.globalAlpha = 1;
        }
        if (s === BARS_STEPS[BARS_STEPS.length - 1]) {
            var bp = p ? ez(seg(e, 0.2, 0.9)) : 1;
            var first = BARS_P[0];
            var last = BARS_P[BARS_P.length - 1];
            var x1 = barX + L.barMaxW * speedup(first, BARS_N) / BARS_N;
            var x5 = barX + L.barMaxW * speedup(last, BARS_N) / BARS_N;
            var yb = top + L.yb;
            var xe = x1 + (x5 - x1) * bp;
            var bcol = amdA(P.yellow, 0.93);
            ln(x1, yb, xe, yb, bcol, 1.8);
            ln(x1, yb - 5, x1, yb + 5, bcol, 1.8);
            ln(xe, yb - 5, xe, yb + 5, bcol, 1.8);
            ctx.globalAlpha = p ? seg(e, 0.6, 1) : 1;
            tx(speedup(first, BARS_N).toFixed(2) + 'x → ' + speedup(last, BARS_N).toFixed(2) + 'x', x1, yb + 14, fs, bcol, 'left', true);
            ctx.globalAlpha = 1;
        }
    }

    /* ===================== 메인 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var e = clamp01(t);
        var s = step || currentSteps()[0];
        if (mode === 'curve') amdDrawCurve(x0, top, w, mob, s, prev, e, L);
        else if (mode === 'bars') amdDrawBars(x0, top, w, mob, s, prev, e, L);
        else amdDrawTime(x0, top, w, mob, s, prev, e, L);
        ctx.globalAlpha = 1;
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

    window.CsFlow.mount3dButton({
        container: container,
        parent: toolbar,
        cls: 'amdahl-viz__btn amdahl-viz__btn--primary',
        label: '3D 이삿짐',
        onOpen: function () {
            vizReset();
            root.classList.add('amdahl-viz--hidden');
        },
        onExit: function () {
            root.classList.remove('amdahl-viz--hidden');
            resize();
        }
    });

    setTimeout(resize, 60);
})();