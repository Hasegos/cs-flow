/**
 * 에라토스테네스의 체 시각화 시각화
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
    var root    = el('div', 'sv-viz');
    var toolbar = el('div', 'sv-viz__toolbar');
    var tbLeft  = el('div', 'sv-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'sv-viz__title', 'SIEVE OF ERATOSTHENES'));

    var modeWrap = el('div', 'sv-viz__mode');
    var modeDefs = [
        { key: 'sieve', label: '체 걸러내기' },
        { key: 'sq', label: 'p²부터 지우는 이유' },
        { key: 'scale', label: 'n이 커지면' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'sv-viz__mode-btn' + (i === 0 ? ' sv-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'sv-viz__speed');
    speedWrap.appendChild(el('span', 'sv-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'sv-viz__speed-btn' + (i === 0 ? ' sv-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'sv-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'sv-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'sv-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'sv-viz__controls');
    var btnPlay  = el('button', 'sv-viz__btn sv-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'sv-viz__btn', '▶| STEP');
    var btnReset = el('button', 'sv-viz__btn', '↺ RESET');
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
    var mode    = 'sieve';
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

    /* ===================== 엔진: 에라토스테네스의 체 ===================== */
    function bat(n) {
        return [0, 1, 3, 6, 7, 8].indexOf(Math.abs(n) % 10) >= 0;
    }
    function eu(n) {
        return bat(n) ? '을' : '를';
    }
    function ga(n) {
        return bat(n) ? '이' : '가';
    }
    function eun(n) {
        return bat(n) ? '은' : '는';
    }
    function fmt(n) {
        return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    function listShort(a) {
        if (a.length > 8) return a[0] + ', ' + a[1] + ', ' + a[2] + ', ..., ' + a[a.length - 1];
        return a.join(', ');
    }
    var NN = 50;
    function newState() {
        var a = [];
        var i;
        for (i = 0; i <= NN; i++) a.push(0);
        a[0] = 4;
        a[1] = 4;
        return a;
    }
    function gstep(st, cur, fresh, hl, cap, cap2, cap3, log) {
        return { kind: 'grid', st: st.slice(), cur: cur, fresh: fresh.slice(), hl: hl, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }
    function crossOut(st, p) {
        var fresh = [];
        var touched = 0;
        var m;
        st[p] = 1;
        for (m = p * p; m <= NN; m += p) {
            touched++;
            if (st[m] === 0) {
                st[m] = 2;
                fresh.push(m);
            }
        }
        return { fresh: fresh, touched: touched };
    }

    /* ===================== 데이터: 체 걸러내기 ===================== */
    var SIEVE_STEPS = [];
    (function () {
        var st = newState();
        var total = 0;
        var ps = [2, 3, 5, 7];
        var k;
        var p;
        var m;
        SIEVE_STEPS.push(gstep(st, 0, [], [], '2부터 ' + NN + '까지, 소수는 어느 수일까?', '1은 소수가 아니므로 처음부터 제외', '', '1부터 ' + NN + '까지 수를 늘어놓고, 2부터 차례로 소수를 확정하며 그 배수를 지워 나갑니다. 지워지지 않고 끝까지 남은 수가 소수입니다. 각 수를 모든 수로 나눠 보는 대신 배수만 지우기 때문에 나눗셈이 필요 없습니다.'));
        for (k = 0; k < ps.length; k++) {
            p = ps[k];
            var r = crossOut(st, p);
            total += r.touched;
            SIEVE_STEPS.push(gstep(st, p, r.fresh, [], 'p = ' + p + ': ' + (p * p) + '부터 ' + p + '씩 건너뛰며 지움', '접근 ' + r.touched + '번, 새로 지운 수 ' + r.fresh.length + '개', '지금까지 접근 ' + total + '번',
                '아직 지워지지 않은 가장 작은 수 ' + p + eun(p) + ' 소수입니다. ' + p + '의 배수는 ' + p + ' × ' + p + ' = ' + (p * p) + '부터 지우면 충분합니다. ' +
                (p === 3 ? '3 × 2 = 6은 ' : p > 3 ? p + ' × 2 ~ ' + p + ' × ' + (p - 1) + '은 ' : '') + (p > 2 ? '더 작은 소수가 이미 지웠기 때문입니다. ' : '') +
                '새로 지운 수: ' + listShort(r.fresh) + (r.touched > r.fresh.length ? '. 접근한 ' + r.touched + '칸 중 ' + (r.touched - r.fresh.length) + '칸은 앞선 소수가 이미 지운 칸이었습니다.' : '.')));
        }
        var nextP = 0;
        var primes = [];
        for (m = 2; m <= NN; m++) {
            if (st[m] === 0) {
                if (!nextP) nextP = m;
                st[m] = 1;
            }
            if (st[m] === 1) primes.push(m);
        }
        SIEVE_STEPS.push(gstep(st, 0, [], [], '다음 소수 ' + nextP + '의 제곱 ' + (nextP * nextP) + '이 ' + NN + '보다 커서 중단', '남은 ' + primes.length + '개가 모두 소수', '총 접근 ' + total + '번',
            '지워지지 않은 다음 수 ' + nextP + '의 제곱은 ' + (nextP * nextP) + '로 ' + NN + '보다 큽니다. 지울 배수가 더 없으므로 여기서 멈추고, 남은 수를 모두 소수로 확정합니다. ' + NN + ' 이하의 소수 ' + primes.length + '개: ' + primes.join(', ') + '. 지우는 동안 칸에 접근한 횟수는 모두 ' + total + '번입니다.'));
    })();

    /* ===================== 데이터: p² 부터 지우는 이유 ===================== */
    var SQ_STEPS = [];
    (function () {
        var st = newState();
        var total = 0;
        var m;
        crossOut(st, 2);
        crossOut(st, 3);
        st[5] = 1;
        SQ_STEPS.push(gstep(st, 5, [], [], 'p = 5: 5의 배수는 어디서부터 지울까?', '2와 3의 배수는 이미 지워진 상태', '', '2와 3의 배수를 지운 직후, 소수 5를 확정한 상태입니다. 5의 배수 10, 15, 20, 25, 30, 35, 40, 45, 50 중 어디서부터 지워야 할까요? 하나씩 확인합니다.'));
        SQ_STEPS.push(gstep(st, 5, [], [{ m: 10, k: 'dup' }], '5 × 2 = 10', '10은 2의 배수라서 2가 이미 지웠음', '주황 테두리 = 이미 지워진 칸', '5 × 2 = 10은 2의 배수입니다. 2의 배수는 2가 이미 모두 지웠으므로 다시 지울 필요가 없습니다.'));
        SQ_STEPS.push(gstep(st, 5, [], [{ m: 15, k: 'dup' }], '5 × 3 = 15', '15는 3의 배수라서 3이 이미 지웠음', '주황 테두리 = 이미 지워진 칸', '5 × 3 = 15는 3의 배수입니다. 3의 배수는 3이 이미 지웠습니다.'));
        SQ_STEPS.push(gstep(st, 5, [], [{ m: 20, k: 'dup' }], '5 × 4 = 20', '20은 2의 배수라서 2가 이미 지웠음 (4 = 2 × 2)', '주황 테두리 = 이미 지워진 칸', '5 × 4 = 20은 4가 2 × 2이므로 2의 배수입니다. 2가 이미 지웠습니다.'));
        st[25] = 2;
        SQ_STEPS.push(gstep(st, 5, [25], [{ m: 25, k: 'new' }], '5 × 5 = 25: 여기서 처음 지움', '5보다 작은 소수의 배수가 아니기 때문', '5 × k (k < 5)는 k의 소인수가 이미 지움', '5 × 5 = 25는 2와 3의 배수가 아니므로 아직 지워지지 않았습니다. 5 × k에서 k가 5보다 작으면 k의 소인수가 5보다 작은 소수이므로 이미 지워졌습니다. 따라서 5의 배수는 5 × 5 = 25부터 지우면 충분합니다.'));
        st[35] = 2;
        SQ_STEPS.push(gstep(st, 5, [35], [{ m: 30, k: 'dup' }, { m: 35, k: 'new' }, { m: 40, k: 'dup' }, { m: 45, k: 'dup' }, { m: 50, k: 'dup' }], '그 뒤: 30, 35, 40, 45, 50', '35만 새로 지움 (35 = 5 × 7)', '30, 40, 50은 2가, 45는 3이 이미 지웠음', '25 다음 배수 30, 35, 40, 45, 50 중 30, 40, 50은 2가, 45는 3이 이미 지웠고, 35만 5가 처음 지웁니다. 5가 지운 수는 25와 35 두 개이고, 접근은 25, 30, 35, 40, 45, 50의 6번입니다.'));
        crossOut(st, 7);
        for (m = 2; m <= NN; m++) if (st[m] === 0) st[m] = 1;
        SQ_STEPS.push(gstep(st, 7, [49], [{ m: 49, k: 'new' }], 'p = 7: 7 × 7 = 49만 남음', '합성수의 가장 작은 소인수는 √n 이하', '50 이하에서는 최대 7 (49 = 7 × 7)', '7은 49부터 지웁니다. 7 × 2 ~ 7 × 6은 더 작은 소수가 이미 지웠고, 7 × 7 = 49 다음 배수 56은 ' + NN + '을 넘습니다. 합성수는 자신의 제곱근 이하의 소인수를 반드시 가지므로, ' + NN + ' 이하의 합성수는 7 이하의 소수로 모두 지워집니다.'));
        SQ_STEPS.push(gstep(st, 0, [], [], 'p가 아니라 p²부터, √n까지만', '2, 3, 5, 7만 처리하면 충분 (11 × 11 = 121 > ' + NN + ')', '남은 15개가 소수', '소수 p의 배수는 p²부터 지우면 되고, p² 이 n을 넘으면 더 지울 것이 없습니다. 그래서 p가 √n 이하인 소수만 처리하면 됩니다. ' + NN + '의 제곱근은 약 7.07이므로 2, 3, 5, 7만 사용했습니다.'));
    })();

    /* ===================== 데이터: n이 커지면 ===================== */
    var SC = [];
    (function () {
        var ns = [100, 1000, 10000, 100000, 1000000];
        var j;
        var p;
        var m;
        var i;
        for (j = 0; j < ns.length; j++) {
            var n = ns[j];
            var c = new Uint8Array(n + 1);
            var ops = 0;
            var cnt = 0;
            for (p = 2; p * p <= n; p++) {
                if (!c[p]) {
                    for (m = p * p; m <= n; m += p) {
                        c[m] = 1;
                        ops++;
                    }
                }
            }
            for (i = 2; i <= n; i++) if (!c[i]) cnt++;
            SC.push({ n: n, ops: ops, cnt: cnt, r: ops / n });
        }
    })();
    var SC_STEPS = [];
    (function () {
        var j;
        SC_STEPS.push({ kind: 'scale', rows: 0, cap: 'n이 커지면 지우는 횟수는 얼마나 늘까?', cap2: '실제로 체를 돌려 센 값', cap3: '', log: 'n = 100부터 1,000,000까지 체를 실제로 돌려, 지우기 위해 칸에 접근한 횟수를 셉니다. 막대는 n당 접근 횟수를 나타냅니다.' });
        for (j = 0; j < SC.length; j++) {
            var s = SC[j];
            SC_STEPS.push({ kind: 'scale', rows: j + 1, cap: 'n = ' + fmt(s.n) + ': 접근 ' + fmt(s.ops) + '번', cap2: 'n당 ' + s.r.toFixed(2) + '번', cap3: '소수 ' + fmt(s.cnt) + '개',
                log: 'n = ' + fmt(s.n) + '에서 √n 이하의 소수의 배수를 지우며 칸에 접근한 횟수는 ' + fmt(s.ops) + '번이고, n으로 나누면 ' + s.r.toFixed(2) + '입니다. n 이하의 소수는 ' + fmt(s.cnt) + '개입니다.' });
        }
        var a = SC[0];
        var b = SC[SC.length - 1];
        SC_STEPS.push({ kind: 'scale', rows: SC.length, cap: 'n이 ' + fmt(b.n / a.n) + '배가 되어도 n당 ' + a.r.toFixed(2) + ' → ' + b.r.toFixed(2), cap2: '대략 n log log n 으로 자랍니다', cap3: 'n × n 이라면 ' + fmt((b.n / a.n) * (b.n / a.n)) + '배',
            log: 'n이 ' + fmt(b.n / a.n) + '배로 커지는 동안 n당 접근 횟수는 ' + a.r.toFixed(2) + '에서 ' + b.r.toFixed(2) + '로 약 2배만 늘었습니다. 총 시간이 n에 거의 비례해 자란다는 뜻이며, 점근적으로는 O(n log log n)입니다. 만약 시간이 n²에 비례했다면 같은 구간에서 ' + fmt((b.n / a.n) * (b.n / a.n)) + '배가 되었을 것입니다.' });
    })();

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'sq') return SQ_STEPS;
        if (mode === 'scale') return SC_STEPS;
        return SIEVE_STEPS;
    }
    function defaultLog() {
        if (mode === 'sq') return '소수 p의 배수를 왜 p²부터 지우는지 5의 배수로 확인합니다.';
        if (mode === 'scale') return 'n을 키워 가며 체가 지우는 횟수가 얼마나 늘어나는지 실제로 셉니다.';
        return '2부터 소수의 배수를 지워 나가며 50 이하의 소수를 찾는 과정을 봅니다.';
    }

    /* ===================== 공용 계산 ===================== */
    function ez(q) {
        q = clamp01(q);
        return q * q * (3 - 2 * q);
    }
    function fontSet(mob) {
        if (mob) return { body: 11.5, small: 11 };
        return { body: 13, small: 12 };
    }
    function lhOf(S) {
        return S.body + 5;
    }
    function spfOf(n) {
        var d;
        for (d = 2; d * d <= n; d++) {
            if (n % d === 0) return d;
        }
        return n;
    }
    function multiplesOf(p) {
        var arr = [];
        var m;
        if (!p) return arr;
        for (m = p * p; m <= NN; m += p) arr.push(m);
        return arr;
    }
    function sqValsOf(cur) {
        var arr = [];
        var k;
        if (!cur) return [2, 3, 5, 7, 11];
        for (k = cur; k <= NN; k += cur) arr.push(k);
        return arr;
    }
    function sqVisited(steps, upto, cur) {
        var map = {};
        var i;
        for (i = 0; i <= upto && i < steps.length; i++) {
            if (steps[i].cur === cur) {
                steps[i].hl.forEach(function (h) { map[h.m] = h.k; });
            }
        }
        return map;
    }
    function scaleLabel(d) {
        return 'n = ' + fmt(d.n) + ' · 접근 ' + fmt(d.ops) + '번';
    }
    function arcAt(xa, xb, base, H, f) {
        return { x: lerp(xa, xb, f), y: base - 4 * H * f * (1 - f) };
    }
    function cellStyle(code, hi) {
        if (hi) return { fill: P.yellow + '66', stroke: P.yellow + 'ff', lw: 1.4, text: P.text + 'ff', bold: true, x: P.red + 'cc' };
        if (code === 1) return { fill: P.teal + '33', stroke: P.teal + 'ff', lw: 1.4, text: P.text + 'ff', bold: true, x: null };
        if (code === 2) return { fill: 'none', stroke: P.sub + '55', lw: 1.2, text: P.sub + 'ff', bold: false, x: P.sub + 'cc' };
        if (code === 4) return { fill: 'none', stroke: P.sub + '33', lw: 1.2, text: P.sub + 'ff', bold: false, x: null };
        return { fill: 'none', stroke: P.sub + 'aa', lw: 1.2, text: P.text + 'ff', bold: false, x: null };
    }
    function chipStyleOf(key) {
        if (key === 'cur' || key === 'prime') return { fill: P.teal + '33', stroke: P.teal + 'ff', text: P.text + 'ff', bold: true };
        if (key === 'dup') return { fill: P.orange + '33', stroke: P.orange + 'ff', text: P.text + 'ff', bold: true };
        if (key === 'new') return { fill: P.green + '33', stroke: P.green + 'ff', text: P.text + 'ff', bold: true };
        if (key === 'pre') return { fill: 'none', stroke: P.orange + '99', text: P.sub + 'ff', bold: false };
        if (key === 'out') return { fill: 'none', stroke: P.sub + '33', text: P.sub + 'aa', bold: false };
        return { fill: 'none', stroke: P.sub + '88', text: P.sub + 'ff', bold: false };
    }

    /* ===================== 레이아웃 ===================== */
    function gridLayout(w, mob) {
        var cw = Math.min(54, w / 10);
        return { cw: cw, ch: mob ? 30 : 36, gx: (w - cw * 10) / 2 };
    }
    function sieveLegend() {
        return [
            { fill: P.teal + '33', stroke: P.teal + 'ff', label: '소수' },
            { fill: 'none', stroke: P.purple + 'ff', label: '현재 p' },
            { fill: P.yellow + '66', stroke: P.yellow + 'ff', label: '새로 지움' },
            { fill: 'none', stroke: P.sub + '66', label: '지워짐' }
        ];
    }
    function sqLegend() {
        return [
            { fill: P.teal + '33', stroke: P.teal + 'ff', label: '소수 p' },
            { fill: P.orange + '33', stroke: P.orange + 'ff', label: '이미 지움' },
            { fill: P.green + '33', stroke: P.green + 'ff', label: '처음 지움' },
            { fill: 'none', stroke: P.orange + '99', label: '앞선 소수가 지움' },
            { fill: 'none', stroke: P.sub + '88', label: '아직' }
        ];
    }
    function scaleLabelH(w, S) {
        var mx = 1;
        SC.forEach(function (d) {
            var c = lines(scaleLabel(d), w, S.body).length;
            if (c > mx) mx = c;
        });
        return mx * lhOf(S);
    }
    function capParts(s, w, S) {
        var out = [];
        if (s.cap) lines(s.cap, w, S.body).forEach(function (t) { out.push({ t: t, c: P.yellow + 'ff', b: true, f: S.body }); });
        if (s.cap2) lines(s.cap2, w, S.small).forEach(function (t) { out.push({ t: t, c: P.text + 'ee', b: false, f: S.small }); });
        if (s.cap3) lines(s.cap3, w, S.small).forEach(function (t) { out.push({ t: t, c: P.green + 'ff', b: true, f: S.small }); });
        return out;
    }
    function capHeight(w, S) {
        var mx = 0;
        currentSteps().forEach(function (s) {
            var n = capParts(s, w, S).length;
            if (n > mx) mx = n;
        });
        return mx * lhOf(S);
    }
    function legendFlow(x0, y, w, items, S, doDraw) {
        var lh = 18;
        var sw = 11;
        var cx = x0;
        var row = 0;
        ctx.font = '500 ' + S.small + 'px "JetBrains Mono",monospace';
        items.forEach(function (it) {
            var need = sw + 5 + ctx.measureText(it.label).width;
            if (cx > x0 && cx + need > x0 + w) {
                cx = x0;
                row++;
            }
            if (doDraw) {
                var cy = y + row * lh + lh / 2;
                rr(cx, cy - sw / 2, sw, sw, 2.5, it.fill, it.stroke, 1.4);
                tx(it.label, cx + sw + 5, cy, S.small, P.sub + 'ff', 'left', false);
            }
            cx += need + 14;
        });
        return (row + 1) * lh;
    }
    function layout(w, mob) {
        var S = fontSet(mob);
        var capH = capHeight(w, S);
        var L = { S: S, gap: mob ? 4 : 6, hopH: mob ? 24 : 28, chipH: mob ? 30 : 36, noteY: 0, legTop: 0, capTop: 0, total: 0, labelH: 0, rowH: 0, rowsTop: 6 };
        if (mode === 'scale') {
            L.labelH = scaleLabelH(w, S);
            L.rowH = L.labelH + 28;
            L.capTop = L.rowsTop + SC.length * L.rowH + 6;
        } else if (mode === 'sq') {
            L.noteY = L.hopH + L.chipH + 27;
            L.legTop = L.noteY + 14;
            L.capTop = L.legTop + legendFlow(0, 0, w, sqLegend(), S, false) + 6;
        } else {
            var g = gridLayout(w, mob);
            L.legTop = 4 + g.ch * 5 + 10;
            L.capTop = L.legTop + legendFlow(0, 0, w, sieveLegend(), S, false) + 6;
        }
        L.total = L.capTop + capH + 8;
        return L;
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 그리기 헬퍼 ===================== */
    function drawCapBlock(s, x0, w, y, S) {
        var lh = lhOf(S);
        capParts(s, w, S).forEach(function (pt, i) {
            tx(pt.t, x0 + w / 2, y + i * lh + lh / 2, pt.f, pt.c, 'center', pt.b);
        });
    }
    function paintCell(x, y, cw, ch, m, code, hi, a, S) {
        var st = cellStyle(code, hi);
        ctx.globalAlpha = a;
        rr(x + 2, y + 2, cw - 4, ch - 4, 4, st.fill, st.stroke, st.lw);
        tx(String(m), x + cw / 2, y + ch / 2, S.body, st.text, 'center', st.bold);
        if (st.x) {
            ctx.beginPath();
            ctx.moveTo(x + 6, y + ch - 6);
            ctx.lineTo(x + cw - 6, y + 6);
            ctx.strokeStyle = st.x;
            ctx.lineWidth = 1.4;
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }
    function drawChip(x, y, cw, ch, m, key, a, S) {
        var st = chipStyleOf(key);
        ctx.globalAlpha = a;
        rr(x, y, cw, ch, 5, st.fill, st.stroke, 1.4);
        tx(String(m), x + cw / 2, y + ch / 2, S.body, st.text, 'center', st.bold);
        ctx.globalAlpha = 1;
    }

    /* ===================== 격자: 1부터 50 ===================== */
    function drawSieveScene(x0, top, w, mob, now, pv, t, L) {
        var S = L.S;
        var animating = pv !== now;
        var g = gridLayout(w, mob);
        var gy = top + 4;
        var M = multiplesOf(now.cur);
        var N = M.length;
        var walkPos = animating ? seg(t, 0.1, 0.9) * Math.max(0, N - 1) : 0;
        function cellX(v) { return x0 + g.gx + ((v - 1) % 10) * g.cw; }
        function cellY(v) { return gy + Math.floor((v - 1) / 10) * g.ch; }
        function crossP(v) {
            var i = M.indexOf(v);
            if (!animating || i < 0) return 1;
            return ez(clamp01((walkPos - i) / 0.6));
        }
        var m;
        for (m = 1; m <= NN; m++) {
            var cx = cellX(m);
            var cy = cellY(m);
            var nowC = now.st[m];
            var nowH = now.fresh.indexOf(m) >= 0;
            var preC = animating ? pv.st[m] : nowC;
            var preH = animating ? pv.fresh.indexOf(m) >= 0 : nowH;
            paintCell(cx, cy, g.cw, g.ch, m, preC, false, 1, S);
            if (preH) paintCell(cx, cy, g.cw, g.ch, m, 2, true, nowH ? 1 : 1 - ez(seg(t, 0, 0.35)), S);
            if (nowC !== preC) {
                var chA = 1;
                if (animating && nowC === 1) chA = ez(seg(t, 0.45 * m / NN, 0.45 * m / NN + 0.4));
                else if (animating && nowC === 2) chA = crossP(m);
                paintCell(cx, cy, g.cw, g.ch, m, nowC, false, chA, S);
            }
            if (nowH && !preH) paintCell(cx, cy, g.cw, g.ch, m, 2, true, crossP(m), S);
            var bA = 0;
            if (animating && pv.cur !== now.cur) {
                if (m === now.cur) bA = ez(seg(t, 0, 0.25));
                else if (m === pv.cur) bA = 1 - ez(seg(t, 0, 0.25));
            } else if (m === now.cur) {
                bA = 1;
            }
            if (bA > 0) {
                ctx.globalAlpha = bA;
                rr(cx + 2, cy + 2, g.cw - 4, g.ch - 4, 4, 'none', P.purple + 'ff', 3);
                ctx.globalAlpha = 1;
            }
        }
        if (animating && N > 0) {
            var wa = 1 - ez(seg(t, 0.85, 0.95));
            if (wa > 0) {
                var wk = Math.min(Math.floor(walkPos), N - 1);
                var wn = Math.min(wk + 1, N - 1);
                var wf = walkPos - wk;
                var ax = cellX(M[wk]) + g.cw / 2;
                var ay = cellY(M[wk]) + g.ch / 2;
                var bx = cellX(M[wn]) + g.cw / 2;
                var by = cellY(M[wn]) + g.ch / 2;
                ctx.globalAlpha = wa;
                circ(lerp(ax, bx, wf), lerp(ay, by, wf), 5, P.purple + 'ff', P.text + 'ff', 1.2);
                ctx.globalAlpha = 1;
            }
        }
        legendFlow(x0, top + L.legTop, w, sieveLegend(), S, true);
        drawCapBlock(now, x0, w, top + L.capTop, S);
    }

    /* ===================== 칩 줄: p의 배수를 p²부터 지우는 이유 ===================== */
    function sqRow(x0, top, w, L, cur, base, fresh, walkU, alpha) {
        var S = L.S;
        var vals = sqValsOf(cur);
        var n = vals.length;
        var gap = L.gap;
        var cw = Math.min(44, (w - gap * (n - 1)) / n);
        var total = cw * n + gap * (n - 1);
        var ox = x0 + (w - total) / 2;
        var rowY = top + L.hopH;
        var nF = fresh.length;
        var i;
        function cxOf(k) { return ox + k * (cw + gap) + cw / 2; }
        for (i = 0; i < n; i++) {
            var m = vals[i];
            var bk = base[m];
            var baseKey;
            if (cur === 0) baseKey = m * m > NN ? 'out' : 'prime';
            else if (m === cur) baseKey = 'cur';
            else if (bk) baseKey = bk;
            else baseKey = spfOf(m) < cur ? 'pre' : 'todo';
            var fj = -1;
            var j;
            for (j = 0; j < nF; j++) {
                if (fresh[j].m === m) fj = j;
            }
            var x = ox + i * (cw + gap);
            drawChip(x, rowY, cw, L.chipH, m, baseKey, alpha, S);
            if (fj >= 0) {
                var fp = ez(clamp01(walkU * nF - fj));
                if (fp > 0) drawChip(x, rowY, cw, L.chipH, m, fresh[fj].k, alpha * fp, S);
            }
            var subTxt = cur === 0 ? String(m * m) : String(spfOf(m));
            var subCol = baseKey === 'cur' || baseKey === 'prime' ? P.teal : P.sub;
            ctx.globalAlpha = alpha;
            tx(subTxt, x + cw / 2, rowY + L.chipH + 11, S.small, subCol + 'ff', 'center', false);
            ctx.globalAlpha = 1;
        }
        if (nF > 0 && walkU < 1 && alpha > 0) {
            var pos = walkU * nF;
            var k = Math.min(Math.floor(pos), nF - 1);
            var f = pos - k;
            var nodes = [cxOf(0)];
            fresh.forEach(function (h) { nodes.push(cxOf(vals.indexOf(h.m))); });
            var baseY = rowY - 2;
            var H = L.hopH - 8;
            var h2;
            var q;
            ctx.globalAlpha = alpha;
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = P.purple + 'aa';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (h2 = 0; h2 <= k; h2++) {
                var fe = h2 < k ? 1 : f;
                for (q = 0; q <= 8; q++) {
                    var pt = arcAt(nodes[h2], nodes[h2 + 1], baseY, H, fe * q / 8);
                    if (h2 === 0 && q === 0) {
                        ctx.moveTo(pt.x, pt.y);
                    } else {
                        ctx.lineTo(pt.x, pt.y);
                    }
                }
            }
            ctx.stroke();
            ctx.setLineDash([]);
            var wp = arcAt(nodes[k], nodes[k + 1], baseY, H, f);
            circ(wp.x, wp.y, 4, P.purple + 'ff', 'none');
            ctx.globalAlpha = 1;
        }
        ctx.globalAlpha = alpha;
        tx(cur === 0 ? '아래 숫자 = p²' : '아래 숫자 = 가장 작은 소인수', x0 + w / 2, top + L.noteY, S.small, P.sub + 'ff', 'center', false);
        ctx.globalAlpha = 1;
    }
    function drawSqScene(x0, top, w, mob, now, pv, t, L) {
        var steps = currentSteps();
        var idx = steps.indexOf(now);
        var animating = pv !== now;
        var prevIdx = animating ? idx - 1 : idx;
        if (animating && pv.cur !== now.cur) {
            var cf = ez(seg(t, 0, 0.3));
            sqRow(x0, top, w, L, pv.cur, sqVisited(steps, prevIdx, pv.cur), [], 1, 1 - cf);
            sqRow(x0, top, w, L, now.cur, sqVisited(steps, prevIdx, now.cur), now.hl, seg(t, 0.3, 0.9), cf);
        } else if (animating) {
            sqRow(x0, top, w, L, now.cur, sqVisited(steps, prevIdx, now.cur), now.hl, seg(t, 0.1, 0.9), 1);
        } else {
            sqRow(x0, top, w, L, now.cur, sqVisited(steps, idx, now.cur), [], 1, 1);
        }
        legendFlow(x0, top + L.legTop, w, sqLegend(), L.S, true);
        drawCapBlock(now, x0, w, top + L.capTop, L.S);
    }

    /* ===================== 막대: n당 접근 횟수 ===================== */
    function drawScaleScene(x0, top, w, mob, now, pv, t, L) {
        var S = L.S;
        var animating = pv !== now;
        var grow = animating && pv.rows < now.rows ? now.rows - 1 : -1;
        var gA = grow >= 0 ? ez(seg(t, 0.05, 0.95)) : 1;
        var barMax = w - 64;
        var lh = lhOf(S);
        var j;
        for (j = 0; j < SC.length; j++) {
            var d = SC[j];
            var y = top + L.rowsTop + j * L.rowH;
            var barY = y + L.labelH + 6;
            rr(x0, barY, barMax, 12, 3, 'none', P.sub + '33', 1);
            if (j >= now.rows) continue;
            var cur = j === now.rows - 1;
            var isNew = j === grow;
            var lblA = isNew ? clamp01(gA * 3) : 1;
            var barA = isNew ? gA : 1;
            ctx.globalAlpha = lblA;
            lines(scaleLabel(d), w, S.body).forEach(function (txt, li) {
                tx(txt, x0, y + li * lh + lh / 2, S.body, (cur ? P.text : P.sub) + 'ff', 'left', cur);
            });
            ctx.globalAlpha = 1;
            var len = Math.max(4, (d.r / 2.5) * barMax) * barA;
            rr(x0, barY, len, 12, 3, P.teal + (cur ? '88' : '44'), P.teal + 'ff', cur ? 2 : 1.2);
            tx('n당 ' + d.r.toFixed(2), x0 + w, barY + 6, S.small, (cur ? P.text : P.sub) + 'ff', 'right', cur);
        }
        drawCapBlock(now, x0, w, top + L.capTop, S);
    }

    /* ===================== 장면 진입점 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var now = step || currentSteps()[0];
        var pv = prev || now;
        var L = layout(w, mob);
        if (mode === 'scale') drawScaleScene(x0, top, w, mob, now, pv, t, L);
        else if (mode === 'sq') drawSqScene(x0, top, w, mob, now, pv, t, L);
        else drawSieveScene(x0, top, w, mob, now, pv, t, L);
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
        speedBtns.forEach(function (b) { b.classList.remove('sv-viz__speed-btn--active'); });
        btn.classList.add('sv-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('sv-viz__mode-btn--active', d.key === m); });
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