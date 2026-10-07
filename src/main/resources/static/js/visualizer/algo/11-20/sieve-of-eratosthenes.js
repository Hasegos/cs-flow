/**
 * 에라토스테네스의 체 시각화
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
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

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
    var mode    = 'sieve';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'sq') return SQ_STEPS;
        if (mode === 'scale') return SC_STEPS;
        return SIEVE_STEPS;
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
        if (sz < 11) sz = 11;
        if (color.indexOf(P.muted) === 0) color = P.sub + 'ff';
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    /* ===================== 공통: 캡션 ===================== */
    function drawCaps(s, x0, w, y, fs) {
        if (s.cap) tx(s.cap, x0 + w / 2, y, fs - 0.5, P.yellow + 'ff', 'center', true);
        if (s.cap2) tx(s.cap2, x0 + w / 2, y + 19, fs - 1, P.text + 'ee', 'center', false);
        if (s.cap3) tx(s.cap3, x0 + w / 2, y + 38, fs - 1, P.green + 'ee', 'center', true);
    }

    /* ===================== 격자: 1부터 50 ===================== */
    function drawGrid(x0, top, w, mob, step) {
        var s = step || SIEVE_STEPS[0];
        var fs = mob ? 11.5 : 13;
        var cw = Math.min(54, w / 10);
        var ch = mob ? 32 : 38;
        var gx = x0 + (w - cw * 10) / 2;
        var gy = top + 6;
        var m;
        var k;
        for (m = 1; m <= NN; m++) {
            var cx = gx + ((m - 1) % 10) * cw;
            var cy = gy + Math.floor((m - 1) / 10) * ch;
            var stt = s.st[m];
            var isFresh = s.fresh.indexOf(m) >= 0;
            var fill = 'none';
            var stroke = P.sub + 'aa';
            var lw = 1.2;
            var tc = P.text + 'ff';
            var bold = false;
            if (isFresh) {
                fill = P.yellow + '66';
                stroke = P.yellow + 'ff';
                bold = true;
            } else if (stt === 2) {
                stroke = P.sub + '55';
                tc = P.sub + 'ff';
            } else if (stt === 1) {
                fill = P.teal + '33';
                stroke = P.teal + 'ff';
                bold = true;
            } else if (stt === 4) {
                stroke = P.sub + '33';
                tc = P.sub + 'ff';
            }
            if (m === s.cur) {
                stroke = P.purple + 'ff';
                lw = 3;
            }
            for (k = 0; k < s.hl.length; k++) {
                if (s.hl[k].m === m) {
                    stroke = s.hl[k].k === 'new' ? P.green + 'ff' : P.orange + 'ff';
                    lw = 3;
                }
            }
            rr(cx + 2, cy + 2, cw - 4, ch - 4, 4, fill, stroke, lw);
            tx(String(m), cx + cw / 2, cy + ch / 2, fs, tc, 'center', bold);
            if (stt === 2) {
                ctx.beginPath();
                ctx.moveTo(cx + 6, cy + ch - 6);
                ctx.lineTo(cx + cw - 6, cy + 6);
                ctx.strokeStyle = (isFresh ? P.red : P.sub) + 'cc';
                ctx.lineWidth = 1.4;
                ctx.stroke();
            }
        }
        var ly = gy + ch * 5 + 16;
        var items = [['소수', P.teal + '33', P.teal + 'ff'], ['현재 p', 'none', P.purple + 'ff'], ['새로 지움', P.yellow + '66', P.yellow + 'ff'], ['지워짐', 'none', P.sub + '55']];
        var iw = w / 4;
        for (k = 0; k < 4; k++) {
            var lx = x0 + k * iw;
            rr(lx + 2, ly - 6, 12, 12, 3, items[k][1], items[k][2], 2);
            tx(items[k][0], lx + 20, ly, fs - 1.5, P.sub + 'ff', 'left', false);
        }
        drawCaps(s, x0, w, ly + 30, fs);
    }

    /* ===================== 막대: n당 접근 횟수 ===================== */
    function drawScale(x0, top, w, mob, step) {
        var s = step || SC_STEPS[0];
        var fs = mob ? 11.5 : 13;
        var rh = mob ? 42 : 48;
        var maxR = 2.5;
        var j;
        for (j = 0; j < SC.length; j++) {
            var y = top + 8 + j * rh;
            if (j < s.rows) {
                var d = SC[j];
                var cur = j === s.rows - 1;
                tx('n = ' + fmt(d.n) + ' · 접근 ' + fmt(d.ops) + '번 · n당 ' + d.r.toFixed(2), x0 + 2, y + 6, fs - 1, cur ? P.text + 'ff' : P.sub + 'ff', 'left', cur);
                rr(x0 + 2, y + 18, Math.max(4, (d.r / maxR) * (w - 4)), 12, 3, P.teal + (cur ? '88' : '44'), P.teal + 'ff', cur ? 2.4 : 1.2);
            } else {
                rr(x0 + 2, y + 18, w - 4, 12, 3, 'none', P.sub + '33', 1);
            }
        }
        drawCaps(s, x0, w, top + 8 + SC.length * rh + 14, fs);
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

        var dsStep = step || currentSteps()[0];
        if (dsStep.kind === 'scale') drawScale(padX, top, fullW, mob, dsStep);
        else drawGrid(padX, top, fullW, mob, dsStep);

        if (!step) {
            var hint = '아래 STEP으로 에라토스테네스의 체 동작을 확인하세요.';
            ctx.font = '500 ' + (mob ? 11 : 12.5) + 'px "JetBrains Mono",monospace';
            var hs = mob ? 11 : 12.5;
            var hl = [hint];
            if (ctx.measureText(hint).width > W - 16) {
                var cut = hint.indexOf(' ', Math.floor(hint.length / 2));
                if (cut < 0) cut = hint.lastIndexOf(' ');
                hl = [hint.slice(0, cut), hint.slice(cut + 1)];
            }
            hl.forEach(function (line, li) {
                tx(line, W / 2, GH() - (mob ? 12 : 14) - (hl.length - 1 - li) * (hs + 4), hs, P.muted + 'aa', 'center', false);
            });
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH;
        neededH = mob ? 320 : 360;
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
        if (mode === 'sq') return '소수 p의 배수를 왜 p²부터 지우는지 5의 배수로 확인합니다.';
        if (mode === 'scale') return 'n을 키워 가며 체가 지우는 횟수가 얼마나 늘어나는지 실제로 셉니다.';
        return '2부터 소수의 배수를 지워 나가며 50 이하의 소수를 찾는 과정을 봅니다.';
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