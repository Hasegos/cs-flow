/**
 * 펜윅 트리 시각화 시각화
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
    var root    = el('div', 'bit-viz');
    var toolbar = el('div', 'bit-viz__toolbar');
    var tbLeft  = el('div', 'bit-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'bit-viz__title', 'FENWICK'));

    var modeWrap = el('div', 'bit-viz__mode');
    var modeDefs = [
        { key: 'build', label: '구조' },
        { key: 'query', label: '구간 합' },
        { key: 'update', label: '값 갱신' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'bit-viz__mode-btn' + (i === 0 ? ' bit-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'bit-viz__speed');
    speedWrap.appendChild(el('span', 'bit-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'bit-viz__speed-btn' + (i === 0 ? ' bit-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'bit-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'bit-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'bit-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'bit-viz__controls');
    var btnPlay  = el('button', 'bit-viz__btn bit-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'bit-viz__btn', '▶| STEP');
    var btnReset = el('button', 'bit-viz__btn', '↺ RESET');
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
    var mode    = 'build';
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

    /* ===================== 엔진: 펜윅 트리 ===================== */
    function jg(n, a, b) {
        return n + ([0, 1, 3, 6, 7, 8].indexOf(Math.abs(n) % 10) >= 0 ? a : b);
    }
    function jro(n) {
        return n + ([0, 3, 6].indexOf(Math.abs(n) % 10) >= 0 ? '으로' : '로');
    }
    function ju(n, a, b) {
        return [0, 1, 3, 6, 7, 8].indexOf(Math.abs(n) % 10) >= 0 ? a : b;
    }
    function lowbit(i) { return i & -i; }
    function bin(i) { return i.toString(2); }
    var A = [3, 2, 5, 1, 4, 2, 6, 3, 1, 4, 2, 5];
    var N = A.length;
    function makeBit(arr) {
        var t = [0];
        for (var i = 1; i <= arr.length; i++) t.push(0);
        for (var j = 1; j <= arr.length; j++) {
            for (var k = j; k <= arr.length; k += lowbit(k)) t[k] += arr[j - 1];
        }
        return t;
    }
    var BIT = makeBit(A);
    function rangeOf(i) { return [i - lowbit(i) + 1, i]; }
    function covered(i) {
        var r = rangeOf(i);
        var out = [];
        for (var x = r[0]; x <= r[1]; x++) out.push(x);
        return out;
    }

    /* ===================== 데이터: 구조 ===================== */
    var BUILD_STEPS = [
        { shown: 0, cur: 0, hops: [], arr: A, bit: BIT, cap: '', cap2: '', cap3: '', log: '펜윅 트리(Fenwick tree, BIT)는 배열의 앞에서부터의 합(누적 합)을 O(log n)에 구하고 값도 O(log n)에 바꾸는 자료구조입니다. 인덱스 i의 칸 BIT[i]가 배열의 어느 구간 합을 저장하는지 1번부터 ' + N + '번까지 차례로 봅니다. 인덱스는 1부터 시작합니다.' }
    ];
    for (var bi = 1; bi <= N; bi++) {
        (function (i) {
            var r = rangeOf(i);
            var len = lowbit(i);
            BUILD_STEPS.push({
                shown: i, cur: i, hops: [], arr: A, bit: BIT,
                cap: 'i = ' + i + ' = ' + bin(i) + '(2진수) · lowbit = ' + len,
                cap2: 'BIT[' + i + '] = A[' + r[0] + ' ~ ' + r[1] + '] 의 합 = ' + BIT[i],
                cap3: '',
                log: 'i = ' + i + '의 2진수는 ' + bin(i) + '이고 가장 낮은 1비트 lowbit는 ' + len + '입니다. BIT[' + i + '] 칸은 i에서 시작해 앞으로 ' + len + '개, 즉 A[' + r[0] + ']부터 A[' + r[1] + ']까지의 합 ' + jg(BIT[i], '을', '를') + ' 저장합니다.' + (len === 1 ? ' lowbit가 1이어서 원소 하나만 담당합니다.' : '')
            });
        })(bi);
    }
    BUILD_STEPS.push({ shown: N, cur: 0, hops: [], arr: A, bit: BIT, cap: '칸 ' + N + '개 · 배열과 같은 크기', cap2: '', cap3: '', log: '정리 — BIT[i]는 i의 lowbit 길이만큼의 구간 합을 저장합니다. 칸 수는 배열과 같은 n개이고, 포인터 없이 배열 하나로 표현됩니다. 이 규칙 덕분에 i에서 lowbit를 빼며 이동하면 구간이 겹치지 않고 이어집니다.' });

    /* ===================== 데이터: 구간 합 ===================== */
    var QI = 11;
    var QHOPS = [];
    for (var qi = QI; qi > 0; qi -= lowbit(qi)) QHOPS.push(qi);
    var QUERY_STEPS = [
        { shown: N, cur: 0, hops: [], arr: A, bit: BIT, cap: '', cap2: '', cap3: '', log: 'A[1]부터 A[' + QI + ']까지의 합(누적 합)을 구합니다. i = ' + QI + '에서 시작해 lowbit를 빼며 0이 될 때까지 이동하고, 거쳐 간 칸의 값을 모두 더합니다.' }
    ];
    var qsum = 0;
    var qparts = [];
    QHOPS.forEach(function (i, k) {
        qsum += BIT[i];
        qparts.push(BIT[i]);
        var next = i - lowbit(i);
        var r = rangeOf(i);
        QUERY_STEPS.push({
            shown: N, cur: i, hops: QHOPS.slice(0, k + 1), arr: A, bit: BIT,
            cap: 'i = ' + i + ' = ' + bin(i) + ' · lowbit = ' + lowbit(i),
            cap2: 'BIT[' + i + '] = A[' + r[0] + ' ~ ' + r[1] + '] = ' + BIT[i],
            cap3: '합: ' + qparts.join(' + ') + (qparts.length > 1 ? ' = ' + qsum : ''),
            log: 'BIT[' + i + ']에는 A[' + r[0] + ']부터 A[' + r[1] + ']까지의 합 ' + jg(BIT[i], '이', '가') + ' 있어 더합니다. 이 구간 앞쪽은 i - lowbit(i) = ' + next + '까지의 합이 담당합니다.' + (next === 0 ? ' 0이 되었으므로 끝납니다.' : '')
        });
    });
    var QRANGE_L = 4;
    var QRANGE_R = 9;
    function pref(i) {
        var s = 0;
        for (var x = i; x > 0; x -= lowbit(x)) s += BIT[x];
        return s;
    }
    QUERY_STEPS.push({ shown: N, cur: 0, hops: QHOPS, arr: A, bit: BIT, cap: '누적 합 ' + qsum + ' · 칸 ' + QHOPS.length + '개만 읽음', cap2: '구간 [' + QRANGE_L + ', ' + QRANGE_R + '] = ' + pref(QRANGE_R) + ' - ' + pref(QRANGE_L - 1) + ' = ' + (pref(QRANGE_R) - pref(QRANGE_L - 1)), cap3: '',
        log: '정리 — A[1]~A[' + QI + ']의 합은 ' + qparts.join(' + ') + ' = ' + qsum + '입니다. 칸 ' + QHOPS.length + '개만 읽었습니다. 읽는 칸 수는 i의 2진수에서 1인 비트의 개수라 최대 log2(n) 정도입니다. 구간 [' + QRANGE_L + ', ' + QRANGE_R + ']의 합은 누적 합 두 개의 차 ' + pref(QRANGE_R) + ' - ' + pref(QRANGE_L - 1) + ' = ' + jro(pref(QRANGE_R) - pref(QRANGE_L - 1)) + ' 구합니다.' });

    /* ===================== 데이터: 값 갱신 ===================== */
    var UI = 5;
    var UD = 3;
    var UHOPS = [];
    for (var ui = UI; ui <= N; ui += lowbit(ui)) UHOPS.push(ui);
    var UP_ARR = A.slice();
    var UP_BIT = BIT.slice();
    var UP_STEPS = [
        { shown: N, cur: 0, hops: [], arr: A, bit: BIT, mark: 0, cap: '', cap2: '', cap3: '', log: 'A[' + UI + ']에 ' + UD + '을 더하면 A[' + UI + ']' + ju(UI, '을', '를') + ' 포함하는 구간을 담당하는 칸이 모두 바뀝니다. i = ' + UI + '에서 시작해 lowbit를 더하며 n 이하인 동안 이동하고, 거쳐 간 칸에 ' + UD + '을 더합니다.' }
    ];
    UHOPS.forEach(function (i, k) {
        var oldV = UP_BIT[i];
        UP_BIT[i] += UD;
        if (k === 0) UP_ARR[UI - 1] += UD;
        var next = i + lowbit(i);
        var r = rangeOf(i);
        UP_STEPS.push({
            shown: N, cur: i, hops: UHOPS.slice(0, k + 1), arr: UP_ARR.slice(), bit: UP_BIT.slice(), mark: UI,
            cap: 'i = ' + i + ' = ' + bin(i) + ' · lowbit = ' + lowbit(i),
            cap2: 'BIT[' + i + '] (A[' + r[0] + ' ~ ' + r[1] + ']): ' + oldV + ' → ' + UP_BIT[i],
            cap3: '다음 i = ' + i + ' + ' + lowbit(i) + ' = ' + next + (next > N ? ' (n 초과, 끝)' : ''),
            log: 'BIT[' + i + '] 칸은 A[' + r[0] + ']부터 A[' + r[1] + ']까지를 담당하고 A[' + UI + ']' + ju(UI, '을', '를') + ' 포함하므로 ' + oldV + '에서 ' + jro(UP_BIT[i]) + ' 바꿉니다. 다음 칸은 i + lowbit(i) = ' + next + '입니다.' + (next > N ? ' n = ' + N + ' 한도를 넘었으므로 끝납니다.' : '')
        });
    });
    UP_STEPS.push({ shown: N, cur: 0, hops: UHOPS, arr: UP_ARR.slice(), bit: UP_BIT.slice(), mark: UI, cap: '갱신한 칸 ' + UHOPS.length + '개 (전체 ' + N + '개)', cap2: '', cap3: '', log: '정리 — 값 하나를 바꾸려고 칸 ' + UHOPS.length + '개만 고쳤습니다. 이동할 때마다 lowbit가 커지므로 최대 log2(n) + 1번 안에 끝나 갱신은 O(log n)입니다.' });

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'query') return QUERY_STEPS;
        if (mode === 'update') return UP_STEPS;
        return BUILD_STEPS;
    }
    function defaultLog() {
        if (mode === 'query') return '누적 합을 구할 때 읽는 칸을 lowbit로 따라가 봅니다.';
        if (mode === 'update') return '값을 바꿀 때 고쳐야 하는 칸을 lowbit로 따라가 봅니다.';
        return '각 칸 BIT[i]가 담당하는 구간을 1번부터 차례로 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    var fwLayMemo = {};
    function ez(q) {
        q = clamp01(q);
        return q * q * (3 - 2 * q);
    }
    function fwFs(mob) {
        if (mob) return { body: 11, small: 11, lh: 15 };
        return { body: 13, small: 12, lh: 18 };
    }
    function fwTw(str, sz, bold) {
        var n = 0;
        Array.from(String(str)).forEach(function (ch) { n += ch.charCodeAt(0) < 128 ? 0.6 : 1; });
        return n * sz * (bold ? 1.08 : 1);
    }
    function fwC(col, a) {
        var v = Math.round(clamp01(a) * 255);
        return col + (v < 16 ? '0' : '') + v.toString(16);
    }
    function fwOv(a, rg) {
        return rg ? clamp01(Math.min(a, rg[1]) - Math.max(a - 1, rg[0])) : 0;
    }
    function fwCapParts(s, w, S) {
        var out = [];
        if (s.cap) lines(s.cap, w - 8, S.body).forEach(function (str) { out.push({ t: str, c: P.yellow + 'ff', b: true, f: S.body }); });
        if (s.cap2) lines(s.cap2, w - 8, S.small).forEach(function (str) { out.push({ t: str, c: P.text + 'ee', b: false, f: S.small }); });
        if (s.cap3) lines(s.cap3, w - 8, S.small).forEach(function (str) { out.push({ t: str, c: P.green + 'ff', b: true, f: S.small }); });
        return out;
    }
    function fwCapH(w, S) {
        var mx = 0;
        currentSteps().forEach(function (s) {
            var n = fwCapParts(s, w, S).length;
            if (n > mx) mx = n;
        });
        return mx * S.lh;
    }
    function layout(w, mob) {
        var key = mode + '|' + Math.round(w) + (mob ? 'm' : 'd');
        if (fwLayMemo[key]) return fwLayMemo[key];
        var S = fwFs(mob);
        var L = { S: S, cw: w / N, ch: 24, yLbl: 22, yIdx: 8, yA: 30, yBar: 62, yB: 98, capTop: 0, total: 0 };
        L.capTop = L.yB + L.ch + 22;
        L.total = L.capTop + fwCapH(w, S) + 8;
        fwLayMemo[key] = L;
        return L;
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 그리기 헬퍼 ===================== */
    function fwBar(xa, xb, y, col) {
        ctx.beginPath();
        ctx.moveTo(xa, y);
        ctx.lineTo(xb, y);
        ctx.strokeStyle = col + 'ff';
        ctx.lineWidth = 3;
        ctx.stroke();
    }
    function fwArc(xa, xb, yb, p, col) {
        var n = 24;
        var i, s;
        if (p <= 0) return;
        ctx.beginPath();
        for (i = 0; i <= n; i++) {
            s = p * i / n;
            if (i === 0) ctx.moveTo(xa + (xb - xa) * s, yb - 64 * s * (1 - s));
            else ctx.lineTo(xa + (xb - xa) * s, yb - 64 * s * (1 - s));
        }
        ctx.strokeStyle = col + 'ff';
        ctx.lineWidth = 2;
        ctx.stroke();
        if (p >= 0.999) {
            ctx.beginPath();
            ctx.moveTo(xb, yb);
            ctx.lineTo(xb - 4, yb - 7);
            ctx.lineTo(xb + 4, yb - 7);
            ctx.closePath();
            ctx.fillStyle = col + 'ff';
            ctx.fill();
        }
    }
    function fwChip(cx, cy, txt, col, fs, a) {
        var bw = fwTw(txt, fs, true) + 10;
        if (a <= 0.01) return;
        ctx.globalAlpha = a;
        rr(cx - bw / 2, cy - 8, bw, 16, 5, col + 'ff', null, 0);
        tx(txt, cx, cy, fs, P.bg + 'ff', 'center', true);
        ctx.globalAlpha = 1;
    }

    /* ===================== 장면 진입점 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var e = clamp01(t);
        var now = step || currentSteps()[0];
        var pv = prev || now;
        var fresh = now !== pv;
        var L = layout(w, mob);
        var S = L.S;
        var cw = L.cw;
        var yA = top + L.yA;
        var yB = top + L.yB;
        var yBar = top + L.yBar;
        var cur = now.cur;
        var hops = now.hops;
        var mk = now.mark || 0;
        var rgNow = cur > 0 ? [rangeOf(cur)[0] - 1, rangeOf(cur)[1]] : null;
        var rgFrom;
        var rg = null;
        var sumRg = mode === 'query' && cur === 0 && hops.length > 0 ? [QRANGE_L - 1, QRANGE_R] : null;
        var sumA = sumRg ? (fresh ? ez(seg(e, 0.2, 0.9)) : 1) : 0;
        var newArc = fresh && cur > 0 ? hops.length - 1 : -1;
        var a, b, k, x, ov, os, col, fill, vis, isCur, hopped, born, bv, cp, cq, sx, sy, ex, ey, parts, cy;

        if (rgNow) {
            if (!fresh) rgFrom = rgNow;
            else if (pv.cur > 0) rgFrom = [rangeOf(pv.cur)[0] - 1, rangeOf(pv.cur)[1]];
            else rgFrom = [cur - 0.5, cur - 0.5];
            cp = fresh ? ez(seg(e, 0, 0.45)) : 1;
            rg = [lerp(rgFrom[0], rgNow[0], cp), lerp(rgFrom[1], rgNow[1], cp)];
        }

        tx('배열 A', x0, top + L.yLbl, S.small, P.sub + 'ff', 'left', true);
        for (a = 1; a <= N; a++) {
            x = x0 + (a - 1) * cw;
            ov = fwOv(a, rg);
            os = fwOv(a, sumRg) * sumA;
            tx(String(a), x + cw / 2, top + L.yIdx, S.small, (a === mk ? P.orange : P.sub) + 'ff', 'center', a === mk);
            rr(x + 1.5, yA, cw - 3, L.ch, 3, ov > 0 ? fwC(P.yellow, 0.19 * ov) : 'none', ov > 0 ? fwC(P.yellow, ov) : P.sub + '88', ov > 0 ? 1.8 : 1.1);
            if (os > 0) rr(x + 1.5, yA, cw - 3, L.ch, 3, fwC(P.green, 0.25 * os), fwC(P.green, os), 1.8);
            if (a === mk) rr(x + 1.5, yA, cw - 3, L.ch, 3, fwC(P.orange, 0.21), P.orange + 'ff', 2);
            tx(String(now.arr[a - 1]), x + cw / 2, yA + L.ch / 2, S.body, P.text + 'ff', 'center', true);
        }
        if (rg && rg[1] - rg[0] > 0.02) fwBar(x0 + rg[0] * cw + 2, x0 + rg[1] * cw - 2, yBar, P.yellow);
        if (sumRg && sumA > 0) {
            ctx.globalAlpha = sumA;
            fwBar(x0 + sumRg[0] * cw + 2, x0 + sumRg[1] * cw - 2, yBar, P.green);
            ctx.globalAlpha = 1;
        }

        for (b = 1; b <= N; b++) {
            x = x0 + (b - 1) * cw;
            isCur = b === cur;
            hopped = hops.indexOf(b) >= 0;
            born = fresh && mode === 'build' && b === now.shown && now.shown > pv.shown;
            vis = mode !== 'build' || b <= now.shown;
            if (born) vis = e >= 0.8;
            col = isCur ? (mode === 'update' ? P.orange : P.yellow) : (hopped ? (mode === 'update' ? P.orange : P.green) : P.teal);
            fill = isCur ? fwC(col, 0.21) : (hopped ? fwC(col, 0.13) : fwC(P.teal, 0.09));
            ctx.globalAlpha = born ? ez(seg(e, 0.8, 1)) : 1;
            rr(x + 1.5, yB, cw - 3, L.ch, 3, vis ? fill : 'none', vis || isCur || hopped ? col + 'ff' : P.teal + '55', isCur ? 2 : 1.3);
            bv = now.bit[b];
            if (mode === 'update' && fresh && isCur && e < 0.7) bv = pv.bit[b];
            if (vis) tx(String(bv), x + cw / 2, yB + L.ch / 2, S.body, P.text + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        }
        tx('펜윅 트리 BIT', x0, yB + L.ch + 9, S.small, P.sub + 'ff', 'left', true);

        if (mode === 'query') {
            for (k = 1; k < hops.length; k++) {
                fwArc(x0 + (hops[k - 1] - 0.5) * cw, x0 + (hops[k] - 0.5) * cw, yB - 3, k === newArc ? ez(seg(e, 0.05, 0.85)) : 1, P.green);
            }
        }

        if (fresh && mode === 'build' && cur > 0 && e > 0.25 && e < 0.85) {
            cq = ez(seg(e, 0.3, 0.8));
            sx = x0 + (rgNow[0] + rgNow[1]) / 2 * cw;
            sy = yBar + 2;
            ex = x0 + (cur - 0.5) * cw;
            ey = yB - 4;
            fwChip(lerp(sx, ex, cq), lerp(sy, ey, cq), String(now.bit[cur]), P.yellow, S.body, ez(seg(e, 0.25, 0.35)) * (1 - ez(seg(e, 0.7, 0.85))));
        }
        if (fresh && mode === 'update' && cur > 0 && e < 0.8) {
            cq = ez(seg(e, 0, 0.7));
            fwChip(lerp(x0 + (mk - 0.5) * cw, x0 + (cur - 0.5) * cw, cq), lerp(yA + L.ch + 4, yB - 4, cq), '+' + UD, P.orange, S.body, 1 - ez(seg(e, 0.7, 0.8)));
        }

        parts = fwCapParts(now, w, S);
        cy = top + L.capTop;
        ctx.globalAlpha = fresh ? 0.35 + 0.65 * ez(e) : 1;
        parts.forEach(function (pt) {
            tx(pt.t, x0 + w / 2, cy + S.lh / 2, pt.f, pt.c, 'center', pt.b);
            cy += S.lh;
        });
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
        speedBtns.forEach(function (b) { b.classList.remove('bit-viz__speed-btn--active'); });
        btn.classList.add('bit-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('bit-viz__mode-btn--active', d.key === m); });
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