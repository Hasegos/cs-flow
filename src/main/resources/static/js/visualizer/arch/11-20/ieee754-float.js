/**
 * IEEE 754 부동소수점 시각화 시각화
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
    var root    = el('div', 'fp-viz');
    var toolbar = el('div', 'fp-viz__toolbar');
    var tbLeft  = el('div', 'fp-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'fp-viz__title', 'IEEE 754 FLOAT'));

    var modeWrap = el('div', 'fp-viz__mode');
    var modeDefs = [
        { key: 'fields', label: '비트 구성' },
        { key: 'sum', label: '0.1 + 0.2' },
        { key: 'range', label: '정밀도와 범위' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'fp-viz__mode-btn' + (i === 0 ? ' fp-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'fp-viz__speed');
    speedWrap.appendChild(el('span', 'fp-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'fp-viz__speed-btn' + (i === 0 ? ' fp-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'fp-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'fp-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'fp-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'fp-viz__controls');
    var btnPlay  = el('button', 'fp-viz__btn fp-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'fp-viz__btn', '▶| STEP');
    var btnReset = el('button', 'fp-viz__btn', '↺ RESET');
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
    var mode    = 'fields';
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

    /* ===================== 데이터: 비트 구성 ===================== */
    function bits32(x) {
        var dv = new DataView(new ArrayBuffer(4));
        dv.setFloat32(0, x);
        var u = dv.getUint32(0);
        return {
            s: u >>> 31,
            e: (u >>> 23) & 255,
            f: u & 8388607,
            str: ('00000000000000000000000000000000' + u.toString(2)).slice(-32)
        };
    }
    var EX    = 6.5;
    var B     = bits32(EX);
    var EXP   = B.e - 127;
    var MANT  = 1 + B.f / 8388608;
    var SIGN  = B.s ? -1 : 1;

    var FIELD_STEPS = [
        { k: 0, log: '단정밀도(float) 값 ' + EX + '의 32비트입니다. 맨 앞 1비트가 부호, 다음 8비트가 지수, 나머지 23비트가 가수(소수부)입니다.' },
        { k: 1, log: '부호 비트 s = ' + B.s + ' → ' + (B.s ? '음수' : '양수') + '입니다. 값에 곱해지는 부호는 (−1)^' + B.s + ' = ' + (SIGN > 0 ? '+1' : '−1') + '입니다.' },
        { k: 2, log: '지수 비트는 ' + B.str.slice(1, 9) + ' = ' + B.e + '입니다. 단정밀도는 바이어스 127을 빼서 실제 지수 ' + B.e + ' − 127 = ' + EXP + '를 얻고 2^' + EXP + ' = ' + Math.pow(2, EXP) + '이 됩니다.' },
        { k: 3, log: '가수 비트 f = ' + B.f + '입니다. 정규화된 수는 맨 앞의 1이 생략돼 있어서 1 + f / 2^23 = 1 + ' + (B.f / 8388608) + ' = ' + MANT + '입니다.' },
        { k: 4, log: '값 = ' + (SIGN > 0 ? '+1' : '−1') + ' × ' + MANT + ' × ' + Math.pow(2, EXP) + ' = ' + (SIGN * MANT * Math.pow(2, EXP)) + '입니다. 세 필드가 합쳐져 하나의 수를 나타냅니다.' }
    ];

    /* ===================== 데이터: 0.1 + 0.2 ===================== */
    var DA  = 0.1;
    var DB  = 0.2;
    var DS  = DA + DB;
    var DC  = 0.3;
    var DIFF = DS - DC;
    var DIG = 25;
    var SUM_STEPS = [
        { n: 0, log: '10진수 0.1과 0.2는 2진수로 쓰면 무한히 반복되는 소수입니다. 유한한 비트에는 가장 가까운 값을 저장합니다.' },
        { n: 1, log: '0.1을 배정밀도(double)로 저장한 실제 값은 ' + DA.toFixed(DIG) + '…로, 0.1과 약간 다릅니다.' },
        { n: 2, log: '0.2도 마찬가지로 ' + DB.toFixed(DIG) + '…으로 저장됩니다.' },
        { n: 3, log: '두 근사값을 더한 결과는 ' + DS.toFixed(DIG) + '…이고, 가장 짧게 출력하면 ' + String(DS) + '입니다.' },
        { n: 4, log: '0.3을 저장한 값은 ' + DC.toFixed(DIG) + '…입니다. 0.1 + 0.2 == 0.3은 ' + (DS === DC) + '입니다.' },
        { n: 5, log: '두 값의 차이는 ' + String(DIFF) + '입니다. 같은지 볼 때는 == 대신 차이가 허용 오차(예: ' + String(Number.EPSILON) + ')보다 작은지 확인하며, 결과는 ' + (Math.abs(DIFF) < Number.EPSILON) + '입니다.' },
        { n: 5, log: '정리 — 오차는 연산이 틀려서가 아니라 10진수 소수를 2진수 근사값으로 저장했기 때문에 생깁니다. 그래서 같음을 판단할 때 허용 오차를 씁니다.' }
    ];

    /* ===================== 데이터: 정밀도와 범위 ===================== */
    var F_STEP1  = Math.pow(2, -23);
    var D_STEP1  = Number.EPSILON;
    var F_BIG    = 16777216;
    var F_BIG_P1 = Math.fround(F_BIG + 1);
    var D_BIG    = 9007199254740992;
    var D_BIG_P1 = D_BIG + 1;
    var RANGE_CARDS = [
        { title: '1 근처의 간격', lines: ['float: 2^-23 = ' + String(F_STEP1), 'double: 2^-52 = ' + String(D_STEP1)] },
        { title: '큰 수에서는 간격이 벌어진다 (float)', lines: [F_BIG + ' + 1 = ' + F_BIG_P1 + ' (float으로 저장하면)', '2^24 다음 정수부터 float은 정수를 건너뜁니다'] },
        { title: '배정밀도도 같은 일이 생긴다', lines: [D_BIG + ' + 1 = ' + D_BIG_P1 + ' (double로 계산하면)', '2^53 다음 정수부터 double은 정수를 건너뜁니다'] },
        { title: '특수한 지수 값', lines: ['지수 비트가 모두 1: 가수 0이면 ±무한대, 아니면 NaN', '지수 비트가 모두 0: 가수 0이면 ±0, 아니면 비정규수'] }
    ];
    var RANGE_STEPS = [
        { c: 0, log: '부동소수점은 비트 수가 정해져 있어서 표현할 수 있는 수가 띄엄띄엄 있습니다. 수가 커질수록 이웃한 수 사이의 간격이 벌어집니다.' },
        { c: 1, log: '1 근처에서 float의 이웃한 수 간격은 2^-23 = ' + String(F_STEP1) + ', double은 2^-52 = ' + String(D_STEP1) + '입니다. 가수 비트가 많을수록 촘촘합니다.' },
        { c: 2, log: '수가 2^24 = ' + F_BIG + '에 이르면 float의 간격이 2가 되어 ' + F_BIG + ' + 1이 ' + F_BIG_P1 + '로 저장됩니다. 정수도 정확히 표현하지 못하는 구간이 생깁니다.' },
        { c: 3, log: 'double도 2^53 = ' + D_BIG + '을 넘으면 같습니다. ' + D_BIG + ' + 1을 계산해도 ' + D_BIG_P1 + '으로 같은 값이 나옵니다.' },
        { c: 4, log: '지수 필드의 양 끝 값은 특별한 의미를 갖습니다. 모두 1이면 무한대 또는 NaN, 모두 0이면 0 또는 비정규수입니다.' },
        { c: 4, log: '정리 — 간격은 지수에 따라 달라지고, 큰 수 근처에서는 작은 차이를 더해도 값이 변하지 않을 수 있습니다. 상대 오차는 비슷해도 절대 오차는 커집니다.' }
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'sum') return SUM_STEPS;
        if (mode === 'range') return RANGE_STEPS;
        return FIELD_STEPS;
    }
    function defaultLog() {
        if (mode === 'sum') return '0.1과 0.2가 2진수로 정확히 저장되지 않아 0.1 + 0.2가 0.3과 달라지는 과정을 봅니다.';
        if (mode === 'range') return '부동소수점이 표현할 수 있는 수의 간격이 크기에 따라 어떻게 달라지는지 봅니다.';
        return '32비트 float이 부호, 지수, 가수 세 필드로 하나의 수를 나타내는 방법을 따라가 봅니다.';
    }
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }
    function fpA(col, a) {
        var h = Math.round(clamp01(a) * 255).toString(16);
        return col + (h.length < 2 ? '0' + h : h);
    }
    function fpW(str, sz, bold) {
        ctx.font = (bold ? '700 ' : '500 ') + sz + 'px "JetBrains Mono",monospace';
        return ctx.measureText(str).width;
    }
    function fpGroupOf(i) { return i === 0 ? 0 : (i <= 8 ? 1 : 2); }
    function fpLit(k, g) { return (k === 0 || k === 4 || k === g + 1) ? 1 : 0; }
    function fpEqRows() {
        return [
            { from: 1, c: P.red,    t: '부호 s = ' + B.s + ' → (−1)^' + B.s + ' = ' + (SIGN > 0 ? '+1' : '−1') },
            { from: 2, c: P.orange, t: '지수 e = ' + B.e + ' → ' + B.e + ' − 127 = ' + EXP + ' → 2^' + EXP + ' = ' + Math.pow(2, EXP) },
            { from: 3, c: P.teal,   t: '가수 f = ' + B.f + ' → 1 + f / 2^23 = ' + MANT },
            { from: 4, c: P.green,  t: '값 = ' + (SIGN > 0 ? '+1' : '−1') + ' × ' + MANT + ' × ' + Math.pow(2, EXP) + ' = ' + (SIGN * MANT * Math.pow(2, EXP)) }
        ];
    }
    function fpSumHead() { return 'double로 저장된 실제 값 (소수 ' + DIG + '자리까지)'; }
    function fpSumRes(ok) { return '0.1 + 0.2 == 0.3  →  ' + ok; }
    function fpSumDiff() {
        return '|차이| = ' + String(Math.abs(DIFF)) + ' < ' + String(Number.EPSILON) + '  →  ' + (Math.abs(DIFF) < Number.EPSILON);
    }

    /* ===================== 레이아웃 ===================== */
    function fpFieldsLayout(w, mob) {
        var fs = mob ? 11 : 12;
        var rows = mob ? 2 : 1;
        var ch = mob ? 26 : 40;
        var gridTop = fs + 12;
        var gridH = rows * ch + (rows - 1) * 10;
        var lh = fs + 7;
        var eqTop = gridTop + gridH + (mob ? 30 : 34);
        var eqH = 0;
        fpEqRows().forEach(function (r) { eqH += lines(r.t, w, fs).length * lh + 4; });
        return { fs: fs, ch: ch, gridTop: gridTop, gridH: gridH, eqTop: eqTop, lh: lh, total: eqTop + eqH + 4 };
    }
    function fpSumLayout(w, mob) {
        var fs = mob ? 11 : 12;
        var rh = mob ? 50 : 54;
        var hdrH = lines(fpSumHead(), w, fs + 1).length * (fs + 7) + 8;
        var resY = hdrH + 4 * rh + 6;
        var diffY = resY + lines(fpSumRes(false), w, fs + 1).length * (fs + 8) + 8;
        var diffH = lines(fpSumDiff(), w, fs + 1).length * (fs + 8);
        return { fs: fs, rh: rh, hdrH: hdrH, resY: resY, diffY: diffY, total: diffY + diffH + 4 };
    }
    function fpRangeLayout(w, mob) {
        var fs = mob ? 11 : 12;
        var lh = fs + 5;
        var y = fs + 34 + 8;
        var cards = RANGE_CARDS.map(function (card) {
            var tl = lines(card.title, w - 24, fs + 1);
            var ls = [];
            card.lines.forEach(function (t) { lines(t, w - 24, fs).forEach(function (l) { ls.push(l); }); });
            var tH = tl.length * (fs + 7);
            var h = 10 + tH + 4 + ls.length * lh + 8;
            var c = { y: y, h: h, tl: tl, ls: ls, tH: tH };
            y += h + 8;
            return c;
        });
        return { fs: fs, lh: lh, cards: cards, total: y - 8 };
    }
    function layout(w, mob) {
        if (mode === 'sum') return fpSumLayout(w, mob);
        if (mode === 'range') return fpRangeLayout(w, mob);
        return fpFieldsLayout(w, mob);
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 비트 구성 장면 ===================== */
    function fpDrawFields(x0, top, w, mob, s, p, e, fresh) {
        var L = fpFieldsLayout(w, mob);
        var fs = L.fs;
        var k = s.k, pk = p.k;
        var cpr = mob ? 16 : 32;
        var cw = w / cpr;
        var cols = [P.red, P.orange, P.teal];
        var sizes = [1, 8, 23];
        tx(EX + ' (float 32비트)', x0, top + L.gridTop / 2, fs + 1, P.text + 'ee', 'left', true);
        for (var i = 0; i < 32; i++) {
            var g = fpGroupOf(i);
            var n = sizes[g];
            var j = i === 0 ? 0 : (i <= 8 ? i - 1 : i - 9);
            var sub = fresh ? ez(seg(e, j / n * 0.5, j / n * 0.5 + 0.5)) : 1;
            var amt = lerp(fpLit(pk, g), fpLit(k, g), sub);
            var col = cols[g];
            var row = mob && i >= 16 ? 1 : 0;
            var cx = x0 + (i % cpr) * cw;
            var cy = top + L.gridTop + row * (L.ch + 10);
            rr(cx + 0.5, cy, cw - 1, L.ch, 2, fpA(col, 0.07 + 0.12 * amt), fpA(col, 0.27 + 0.53 * amt), 1 + 0.6 * amt);
            tx(B.str.charAt(i), cx + cw / 2, cy + L.ch / 2, fs, fpA(col, 0.3 + 0.7 * amt), 'center', true);
            rr(cx + 0.5, cy + L.ch + 3, cw - 1, 3, 1.5, fpA(col, 0.25 + 0.75 * amt), 'none', 0);
        }
        var labY = top + L.gridTop + L.gridH + 16;
        if (mob) {
            var names = ['부호 1', '지수 8', '가수 23'];
            var widths = names.map(function (nm) { return 12 + fpW(nm, fs, true); });
            var total = widths[0] + widths[1] + widths[2] + 24;
            var lx = x0 + (w - total) / 2;
            names.forEach(function (nm, gi) {
                rr(lx, labY - 4, 8, 8, 2, cols[gi] + 'cc', 'none', 0);
                tx(nm, lx + 12, labY, fs, cols[gi] + 'ee', 'left', true);
                lx += widths[gi] + 12;
            });
        } else {
            [[0, 0, '부호 1'], [1, 8, '지수 8'], [9, 31, '가수 23']].forEach(function (gr, gi) {
                tx(gr[2], x0 + (gr[0] + gr[1] + 1) / 2 * cw, labY, fs, cols[gi] + 'ee', 'center', true);
            });
        }
        var eqs = fpEqRows();
        var y = top + L.eqTop;
        eqs.forEach(function (r) {
            var show = k >= r.from;
            var newly = fresh && show && !(pk >= r.from);
            var a = newly ? ez(e) : 1;
            var sx = newly ? -(1 - a) * 12 : 0;
            var txts = lines(r.t, w, fs);
            if (show) {
                ctx.globalAlpha = a;
                txts.forEach(function (t1, li) {
                    tx(t1, x0 + sx, y + li * L.lh + L.lh / 2, fs, r.c + 'ff', 'left', true);
                });
                ctx.globalAlpha = 1;
            }
            y += txts.length * L.lh + 4;
        });
    }

    /* ===================== 0.1 + 0.2 장면 ===================== */
    function fpDrawSum(x0, top, w, mob, s, p, e, fresh) {
        var L = fpSumLayout(w, mob);
        var fs = L.fs;
        var n = s.n, pn = p.n;
        lines(fpSumHead(), w, fs + 1).forEach(function (t1, li) {
            tx(t1, x0, top + 4 + (fs + 7) / 2 + li * (fs + 7), fs + 1, P.text + 'ee', 'left', true);
        });
        var rows = [
            [1, '0.1', DA.toFixed(DIG), P.purple],
            [2, '0.2', DB.toFixed(DIG), P.purple],
            [3, '0.1 + 0.2', DS.toFixed(DIG), P.orange],
            [4, '0.3', DC.toFixed(DIG), P.teal]
        ];
        rows.forEach(function (r, i) {
            var y = top + L.hdrH + i * L.rh;
            var on = n >= r[0];
            var newly = fresh && on && !(pn >= r[0]);
            var a = newly ? ez(e) : 1;
            var sx = newly ? (1 - a) * 14 : 0;
            var full = r[2] + '…';
            var vis = !on ? '?' : (newly ? full.slice(0, Math.max(1, Math.round(full.length * ez(e)))) : full);
            ctx.globalAlpha = a;
            rr(x0, y, w, L.rh - 8, 6, on ? fpA(r[3], 0.09) : 'none', on ? fpA(r[3], 0.67) : P.muted + '44', 1.4);
            tx(r[1], x0 + 12 + sx, y + 14, fs + 1, on ? r[3] + 'ee' : P.muted + '88', 'left', true);
            tx(vis, x0 + 12 + sx, y + 33, fs + 1, on ? P.text + 'ee' : P.muted + '77', 'left', true);
            ctx.globalAlpha = 1;
        });
        var ry = top + L.resY;
        if (n >= 4) {
            var ok = DS === DC;
            ctx.globalAlpha = fresh && pn < 4 ? ez(e) : 1;
            lines(fpSumRes(ok), w, fs + 1).forEach(function (t1, li) {
                tx(t1, x0, ry + li * (fs + 8) + (fs + 8) / 2, fs + 1, (ok ? P.green : P.red) + 'ee', 'left', true);
            });
            ctx.globalAlpha = 1;
        }
        if (n >= 5) {
            var okd = Math.abs(DIFF) < Number.EPSILON;
            ctx.globalAlpha = fresh && pn < 5 ? ez(e) : 1;
            lines(fpSumDiff(), w, fs + 1).forEach(function (t1, li) {
                tx(t1, x0, top + L.diffY + li * (fs + 8) + (fs + 8) / 2, fs + 1, (okd ? P.green : P.red) + 'ee', 'left', true);
            });
            ctx.globalAlpha = 1;
        }
    }

    /* ===================== 정밀도와 범위 장면 ===================== */
    function fpDrawRange(x0, top, w, mob, s, p, e, fresh) {
        var L = fpRangeLayout(w, mob);
        var fs = L.fs;
        var c = s.c, pc = p.c;
        var fr = [0.03, 0.1, 0.42, 0.7, 0.96];
        var ax0 = x0 + 10, ax1 = x0 + w - 10, ay = top + 14;
        ln(ax0, ay, ax1, ay, P.sub + '99', 1.4);
        [[0.03, '1'], [0.42, '2^24'], [0.7, '2^53'], [0.96, '∞']].forEach(function (tk) {
            var mx = ax0 + tk[0] * (ax1 - ax0);
            ln(mx, ay - 4, mx, ay + 4, P.sub + 'ff', 1.4);
            tx(tk[1], mx, ay + 17, fs, P.sub + 'ff', 'center', false);
        });
        var dx = ax0 + (ax1 - ax0) * (fresh ? lerp(fr[pc], fr[c], ez(e)) : fr[c]);
        circ(dx, ay, 6, P.purple + '55', P.purple + 'ff', 2);
        L.cards.forEach(function (card, i) {
            var on = c > i;
            var newly = fresh && on && !(pc > i);
            var a = newly ? ez(e) : 1;
            var sx = newly ? (1 - a) * 14 : 0;
            var y = top + card.y;
            ctx.globalAlpha = a;
            rr(x0, y, w, card.h - 8, 6, on ? P.purple + '14' : 'none', on ? P.purple + 'aa' : P.muted + '44', 1.4);
            card.tl.forEach(function (t1, li) {
                tx(t1, x0 + 12 + sx, y + 10 + (fs + 7) / 2 + li * (fs + 7), fs + 1, on ? P.text + 'ee' : P.muted + '77', 'left', true);
            });
            if (on) {
                card.ls.forEach(function (t1, li) {
                    tx(t1, x0 + 12 + sx, y + 10 + card.tH + 4 + L.lh / 2 + li * L.lh, fs, P.teal + 'ee', 'left', false);
                });
            }
            ctx.globalAlpha = 1;
        });
    }

    /* ===================== 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var steps = currentSteps();
        var s = step || steps[0];
        var p = prev || s;
        var fresh = s !== p;
        var e = fresh ? clamp01(t) : 1;
        if (mode === 'sum') fpDrawSum(x0, top, w, mob, s, p, e, fresh);
        else if (mode === 'range') fpDrawRange(x0, top, w, mob, s, p, e, fresh);
        else fpDrawFields(x0, top, w, mob, s, p, e, fresh);
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
        speedBtns.forEach(function (b) { b.classList.remove('fp-viz__speed-btn--active'); });
        btn.classList.add('fp-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('fp-viz__mode-btn--active', d.key === m); });
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