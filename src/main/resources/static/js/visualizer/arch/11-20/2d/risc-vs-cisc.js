/**
 * RISC vs CISC 시각화 시각화
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
    var root    = el('div', 'isa-viz');
    var toolbar = el('div', 'isa-viz__toolbar');
    var tbLeft  = el('div', 'isa-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'isa-viz__title', 'ISA COMPARE'));

    var modeWrap = el('div', 'isa-viz__mode');
    var modeDefs = [
        { key: 'one', label: '같은 일 다른 명령어' },
        { key: 'decode', label: '명령어 길이와 디코딩' },
        { key: 'perf', label: '성능 식' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'isa-viz__mode-btn' + (i === 0 ? ' isa-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'isa-viz__speed');
    speedWrap.appendChild(el('span', 'isa-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'isa-viz__speed-btn' + (i === 0 ? ' isa-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'isa-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'isa-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'isa-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'isa-viz__controls');
    var btnPlay  = el('button', 'isa-viz__btn isa-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'isa-viz__btn', '▶| STEP');
    var btnReset = el('button', 'isa-viz__btn', '↺ RESET');
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
    var mode    = 'one';
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

    /* ===================== 데이터: 같은 일, 다른 명령어 ===================== */
    var CISC_I  = ['add [x], eax'];
    var RISC_I  = ['lw   t0, 0(a0)', 'add  t0, t0, t1', 'sw   t0, 0(a0)'];
    var RISC_NOTE = ['메모리에서 읽기(load)', '레지스터끼리 더하기', '메모리에 쓰기(store)'];
    var UOPS    = ['load', 'add', 'store'];

    var ONE_STEPS = [
        { c: 0, r: 0, u: false, log: '같은 일 — 메모리 변수 x에 레지스터 값을 더해 다시 x에 저장합니다. x86(CISC)과 RISC-V(RISC)가 이 일을 어떻게 명령어로 쓰는지 비교합니다.' },
        { c: 1, r: 0, u: false, log: 'CISC(x86) — 명령어 한 개로 메모리 읽기, 덧셈, 메모리 쓰기를 모두 처리합니다. 연산 명령어가 메모리 피연산자를 직접 다룰 수 있습니다.' },
        { c: 1, r: 1, u: false, log: 'RISC(RISC-V) — 메모리 접근은 load/store 명령어만 합니다. 먼저 lw로 x의 값을 레지스터로 읽어 옵니다.' },
        { c: 1, r: 2, u: false, log: '덧셈은 레지스터끼리만 합니다. 명령어 하나가 하는 일이 단순합니다.' },
        { c: 1, r: 3, u: false, log: '결과는 sw로 메모리에 씁니다. 같은 일에 명령어가 ' + RISC_I.length + '개 필요해, 명령어 수는 CISC ' + CISC_I.length + '개 대 RISC ' + RISC_I.length + '개입니다.' },
        { c: 1, r: 3, u: true, log: '하지만 현대 x86 CPU는 복잡한 명령어를 내부에서 더 단순한 마이크로 연산으로 나눠 실행합니다. 겉모습은 CISC이고 안쪽 실행은 RISC와 비슷해졌습니다(마이크로 연산의 개수는 CPU마다 다릅니다).' },
        { c: 1, r: 3, u: true, log: '정리 — RISC는 단순한 명령어를 많이, CISC는 복잡한 명령어를 적게 쓰는 설계입니다. 두 방식의 경계는 예전보다 흐려졌습니다.' }
    ];

    /* ===================== 데이터: 명령어 길이와 디코딩 ===================== */
    var RISC_LEN = [4, 4, 4, 4, 4, 4];
    var CISC_LEN = [1, 3, 2, 6, 1, 4];
    function starts(lens) {
        var out = [];
        var pos = 0;
        lens.forEach(function (l) { out.push(pos); pos += l; });
        return out;
    }
    var RISC_START = starts(RISC_LEN);
    var CISC_START = starts(CISC_LEN);
    var TOTAL_R = RISC_LEN.reduce(function (a, b) { return a + b; }, 0);
    var TOTAL_C = CISC_LEN.reduce(function (a, b) { return a + b; }, 0);
    var N_I = RISC_LEN.length;

    var DECODE_STEPS = [
        { rk: 0, ck: 0, log: '명령어 ' + N_I + '개가 메모리에 이어져 있습니다. 디코더가 각 명령어의 시작 위치를 알아야 읽을 수 있습니다. 길이는 예시 값입니다.' },
        { rk: N_I, ck: 0, log: '고정 길이(예: 32비트 = 4바이트) — 시작 위치가 4바이트마다로 정해져 있어, 앞 명령어를 해석하지 않아도 ' + N_I + '개의 경계를 한 번에 알 수 있습니다.' },
        { rk: N_I, ck: 1, log: '가변 길이 — 첫 명령어는 0바이트에서 시작하고, 그 길이(' + CISC_LEN[0] + '바이트)를 알아야 다음 시작 위치(' + CISC_START[1] + ')를 알 수 있습니다.' },
        { rk: N_I, ck: 3, log: '다음 명령어들도 앞 명령어의 길이를 해석한 뒤에야 위치가 정해집니다. 경계를 찾는 일이 앞에서 뒤로 이어지는 의존성이 됩니다.' },
        { rk: N_I, ck: N_I, log: '같은 ' + N_I + '개 명령어가 RISC에서는 ' + TOTAL_R + '바이트, 이 예의 CISC에서는 ' + TOTAL_C + '바이트를 차지합니다. 가변 길이는 코드가 짧아질 수 있는 대신 디코딩이 복잡합니다.' },
        { rk: N_I, ck: N_I, log: '정리 — 고정 길이는 디코딩과 파이프라인을 단순하게 하고, 가변 길이는 코드 크기에 유리할 수 있습니다. 현대 x86 CPU는 이 복잡한 디코딩을 하드웨어가 감당하도록 설계합니다.' }
    ];

    /* ===================== 데이터: 성능 식 ===================== */
    var CLOCK_NS = 1;
    var PA = { name: 'CISC', ic: 1000000, cpi: 3.0 };
    var PB = { name: 'RISC', ic: 1400000, cpi: 1.5 };
    function cpuTimeMs(p) { return p.ic * p.cpi * CLOCK_NS / 1000000; }
    function fmtN(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

    var PERF_STEPS = [
        { k: 0, log: 'CPU 시간 = 명령어 수 × 명령어당 평균 사이클(CPI) × 사이클 시간입니다. 명령어 수와 CPI는 서로 맞바꿔지는 관계일 수 있습니다.' },
        { k: 1, log: '명령어 수 — CISC 예시는 ' + fmtN(PA.ic) + '개, RISC 예시는 같은 프로그램에 ' + fmtN(PB.ic) + '개를 쓴다고 가정합니다(예시 값).' },
        { k: 2, log: 'CPI — 복잡한 명령어는 한 개에 여러 사이클이 걸려 CPI가 큽니다(' + PA.cpi + '). 단순한 명령어는 CPI가 작습니다(' + PB.cpi + ').' },
        { k: 3, log: 'CPU 시간(사이클 시간 ' + CLOCK_NS + 'ns) — CISC ' + fmtN(PA.ic) + ' × ' + PA.cpi + ' × ' + CLOCK_NS + 'ns = ' + cpuTimeMs(PA) + 'ms, RISC ' + fmtN(PB.ic) + ' × ' + PB.cpi + ' × ' + CLOCK_NS + 'ns = ' + cpuTimeMs(PB) + 'ms입니다.' },
        { k: 3, log: '정리 — 어느 쪽이 빠른지는 세 요소의 곱으로 정해지며, 명령어 수만 보아서는 알 수 없습니다. 이 값들은 설명을 위한 가정입니다.' }
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'decode') return DECODE_STEPS;
        if (mode === 'perf') return PERF_STEPS;
        return ONE_STEPS;
    }
    function defaultLog() {
        if (mode === 'decode') return '명령어 길이가 고정일 때와 가변일 때 명령어의 시작 위치를 알아내는 방식의 차이를 봅니다.';
        if (mode === 'perf') return 'CPU 시간 = 명령어 수 × CPI × 사이클 시간 식으로 RISC와 CISC의 성능을 비교하는 방법을 봅니다.';
        return '메모리 값에 레지스터를 더해 저장하는 같은 일을 CISC와 RISC가 어떻게 명령어로 표현하는지 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    var ISA_FORMULA = 'CPU 시간 = 명령어 수 × CPI × 사이클 시간';
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }
    function isaPos(k) { return k < N_I ? CISC_START[k] : TOTAL_C; }

    function isaOneLayout(w, mob) {
        var fs = mob ? 11 : 12;
        var nfs = mob ? 11 : 11.5;
        var nlh = nfs + 3;
        var instrFs = mob ? 11 : 12.5;
        var instrLH = instrFs + 5;
        var pad = mob ? 8 : 12;
        var gapC = mob ? 10 : 28;
        var cw = Math.min(260, (w - gapC) / 2);
        var nMax = 1;
        RISC_NOTE.forEach(function (nt) { nMax = Math.max(nMax, lines(nt, cw - 2 * pad, nfs).length); });
        var bh = 12 + instrLH + nMax * nlh;
        var bgap = 12;
        var colTop = 46;
        var countOff = colTop + 3 * bh + 2 * bgap + 12;
        var offL = (w - (2 * cw + gapC)) / 2;
        return { fs: fs, nfs: nfs, nlh: nlh, instrFs: instrFs, instrLH: instrLH, pad: pad, cw: cw,
                 cxL: offL, cxR: offL + cw + gapC, bh: bh, bgap: bgap, colTop: colTop, countOff: countOff,
                 total: countOff + 16 };
    }

    function isaDecodeLayout(w, mob) {
        var fs = mob ? 11 : 12;
        var bh = mob ? 30 : 34;
        var lhS = fs + 5;
        var capN = 1;
        for (var k = 1; k < N_I; k++) {
            capN = Math.max(capN, lines('I' + k + '의 길이를 해석해야 I' + (k + 1) + '의 위치를 앎', w, fs).length);
        }
        capN = Math.max(capN, lines('같은 ' + N_I + '개 명령어: ' + TOTAL_R + '바이트 vs ' + TOTAL_C + '바이트', w, fs).length);
        var riscBot = 34 + bh;
        var ciscSec = riscBot + 40;
        var ciscBot = ciscSec + 34 + bh;
        var capTop = ciscBot + 18;
        return { fs: fs, bh: bh, lhS: lhS, riscBot: riscBot, ciscSec: ciscSec, ciscBot: ciscBot, capTop: capTop,
                 total: capTop + capN * lhS + 8 };
    }

    function isaPerfLayout(w, mob) {
        var fs = mob ? 11 : 12;
        var lhR = fs + 5;
        var bh = mob ? 18 : 22;
        var lhF = fs + 6;
        var nF = lines(ISA_FORMULA, w, fs + 0.5).length;
        var rowsTop = nF * lhF + 12;
        var rowH = lhR + 4 + 2 * bh + 6 + 12;
        return { fs: fs, lhR: lhR, bh: bh, lhF: lhF, rowsTop: rowsTop, rowH: rowH,
                 barOff: mob ? 46 : 62, valW: mob ? 66 : 84, total: rowsTop + 3 * rowH };
    }

    function layout(w, mob) {
        if (mode === 'decode') return isaDecodeLayout(w, mob);
        if (mode === 'perf') return isaPerfLayout(w, mob);
        return isaOneLayout(w, mob);
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 모드: 같은 일, 다른 명령어 ===================== */
    function isaDrawOne(x0, top, w, mob, s, p, e) {
        var L = layout(w, mob);
        var fs = L.fs;
        var cw = L.cw;
        var cxL = x0 + L.cxL;
        var cxR = x0 + L.cxR;
        var colY = top + L.colTop;
        var bh = L.bh;

        tx('x = x + r', x0 + w / 2, top + 8, fs, P.sub + 'ff', 'center', false);
        tx('CISC (x86)', cxL, top + 28, fs + 1, P.orange + 'ee', 'left', true);
        tx('RISC (RISC-V)', cxR, top + 28, fs + 1, P.teal + 'ee', 'left', true);

        var cA = s.c >= 1 ? (p.c >= 1 ? 1 : ez(e)) : 0;
        if (cA > 0) {
            ctx.globalAlpha = cA;
            var kx = cxL + (1 - cA) * -18;
            rr(kx, colY, cw, bh, 6, P.orange + '26', P.orange + 'cc', 1.4);
            tx(CISC_I[0], kx + L.pad, colY + bh / 2, L.instrFs, P.text + 'ee', 'left', true);
            ctx.globalAlpha = 1;
        }

        for (var i = 0; i < RISC_I.length; i++) {
            var rA = s.r > i ? (p.r > i ? 1 : ez(e)) : 0;
            if (rA <= 0) continue;
            var ry = colY + i * (bh + L.bgap);
            var rx = cxR + (1 - rA) * 18;
            ctx.globalAlpha = rA;
            rr(rx, ry, cw, bh, 6, P.teal + '26', P.teal + 'cc', 1.4);
            tx(RISC_I[i], rx + L.pad, ry + 6 + L.instrLH / 2, L.instrFs, P.text + 'ee', 'left', true);
            var nl = lines(RISC_NOTE[i], cw - 2 * L.pad, L.nfs);
            for (var li = 0; li < nl.length; li++) {
                tx(nl[li], rx + L.pad, ry + 6 + L.instrLH + li * L.nlh + L.nlh / 2, L.nfs, P.sub + 'ff', 'left', false);
            }
            ctx.globalAlpha = 1;
        }

        var cyN = top + L.countOff;
        tx('명령어 ' + (s.c ? CISC_I.length : 0) + '개', cxL, cyN, fs + 1, s.c ? P.orange + 'ee' : P.muted + '88', 'left', true);
        tx('명령어 ' + s.r + '개', cxR, cyN, fs + 1, s.r ? P.teal + 'ee' : P.muted + '88', 'left', true);

        var uA = s.u ? (p.u ? 1 : ez(e)) : 0;
        if (uA > 0) {
            var uw = (cw - 6) / 3;
            var chipY = colY + bh + L.bgap;
            ctx.globalAlpha = uA;
            for (var k = 0; k < UOPS.length; k++) {
                var ux = cxL + k * (uw + 3);
                var uy = lerp(colY + bh - 36, chipY, uA);
                rr(ux, uy, uw, 26, 5, P.purple + '26', P.purple + 'cc', 1.3);
                tx(UOPS[k], ux + uw / 2, uy + 13, L.nfs, P.purple + 'ee', 'center', true);
            }
            var cl = lines('내부에서 마이크로 연산으로 분해(개념도)', cw, L.nfs);
            for (var ci = 0; ci < cl.length; ci++) {
                tx(cl[ci], cxL, chipY + 32 + ci * L.nlh + L.nlh / 2, L.nfs, P.sub + 'ff', 'left', true);
            }
            ctx.globalAlpha = 1;
        }
    }

    /* ===================== 모드: 명령어 길이와 디코딩 ===================== */
    function isaStrip(x0, y, w, unit, lens, starts0, known, prevKnown, col, title, total, fs, e, bh) {
        tx(title, x0, y + 8, fs + 1, col + 'ee', 'left', true);
        tx('전체 ' + total + '바이트', x0 + w, y + 8, fs, P.sub + 'ff', 'right', false);
        var by = y + 34;
        for (var i = 0; i < lens.length; i++) {
            var bx = x0 + starts0[i] * unit + 1;
            var bw = lens[i] * unit - 2;
            rr(bx, by, bw, bh, 4, P.muted + '10', P.muted + '55', 1);
            var a = i < known ? (i < prevKnown ? 1 : ez(e)) : 0;
            if (a <= 0) continue;
            ctx.globalAlpha = a;
            rr(bx, by, bw, bh, 4, col + '2a', col + 'cc', 1.6);
            tx('I' + (i + 1), bx + bw / 2, y + 24, fs, col + 'ee', 'center', true);
            if (bw >= 16) tx(lens[i] + 'B', bx + bw / 2, by + bh / 2, fs, P.text + 'ee', 'center', true);
            ctx.globalAlpha = 1;
        }
    }

    function isaDrawDecode(x0, top, w, mob, s, p, e) {
        var L = layout(w, mob);
        var fs = L.fs;
        var unit = (w - 2) / Math.max(TOTAL_R, TOTAL_C);
        isaStrip(x0, top, w, unit, RISC_LEN, RISC_START, s.rk, p.rk, P.teal,
            mob ? 'RISC 고정 4바이트' : 'RISC — 고정 길이 4바이트', TOTAL_R, fs, e, L.bh);
        isaStrip(x0, top + L.ciscSec, w, unit, CISC_LEN, CISC_START, s.ck, p.ck, P.orange,
            mob ? 'CISC 가변 길이' : 'CISC — 가변 길이(예시)', TOTAL_C, fs, e, L.bh);

        if (s.rk > 0) tx('경계를 한 번에 알 수 있음', x0, top + L.riscBot + 14, fs, P.teal + 'ee', 'left', true);

        var cap = '';
        var capCol = P.orange;
        if (s.ck > 0 && s.ck < N_I) {
            cap = 'I' + s.ck + '의 길이를 해석해야 I' + (s.ck + 1) + '의 위치를 앎';
        } else if (s.ck >= N_I) {
            cap = '같은 ' + N_I + '개 명령어: ' + TOTAL_R + '바이트 vs ' + TOTAL_C + '바이트';
            capCol = P.green;
        }
        if (cap) {
            var cl = lines(cap, w, fs);
            for (var ci = 0; ci < cl.length; ci++) {
                tx(cl[ci], x0, top + L.capTop + ci * L.lhS + L.lhS / 2, fs, capCol + 'ee', 'left', true);
            }
        }

        var px = x0 + 1 + lerp(isaPos(p.ck), isaPos(s.ck), ez(e)) * unit;
        var tipY = top + L.ciscBot + 3;
        ctx.beginPath();
        ctx.moveTo(px, tipY);
        ctx.lineTo(px - 5, tipY + 8);
        ctx.lineTo(px + 5, tipY + 8);
        ctx.closePath();
        ctx.fillStyle = P.orange + 'ff';
        ctx.fill();
    }

    /* ===================== 모드: 성능 식 ===================== */
    function isaDrawPerf(x0, top, w, mob, s, p, e) {
        var L = layout(w, mob);
        var fs = L.fs;
        var fl = lines(ISA_FORMULA, w, fs + 0.5);
        for (var fi = 0; fi < fl.length; fi++) {
            tx(fl[fi], x0, top + fi * L.lhF + L.lhF / 2, fs + 0.5, P.text + 'ee', 'left', true);
        }

        var rows = [
            { k: 1, name: '명령어 수', v: function (q) { return q.ic; }, max: Math.max(PA.ic, PB.ic),
              f: function (q) { return fmtN(q.ic); } },
            { k: 2, name: 'CPI', v: function (q) { return q.cpi; }, max: Math.max(PA.cpi, PB.cpi),
              f: function (q) { return String(q.cpi); } },
            { k: 3, name: 'CPU 시간', v: cpuTimeMs, max: Math.max(cpuTimeMs(PA), cpuTimeMs(PB)),
              f: function (q) { return cpuTimeMs(q) + 'ms'; } }
        ];
        var cols = [[PA, P.orange], [PB, P.teal]];
        var barX = x0 + L.barOff;
        var maxW = w - L.barOff - L.valW;

        for (var ri = 0; ri < rows.length; ri++) {
            var row = rows[ri];
            var on = s.k >= row.k;
            var wasOn = p.k >= row.k;
            var gy = top + L.rowsTop + ri * L.rowH;
            tx(row.name, x0, gy + L.lhR / 2, fs + 0.5, on ? P.text + 'ee' : P.muted + '88', 'left', true);
            for (var ci = 0; ci < 2; ci++) {
                var q = cols[ci][0];
                var col = cols[ci][1];
                var by = gy + L.lhR + 4 + ci * (L.bh + 6);
                tx(q.name, x0, by + L.bh / 2, fs, on ? col + 'ee' : P.muted + '77', 'left', true);
                rr(barX, by, maxW, L.bh, 4, 'none', P.muted + '33', 1);
                if (!on) continue;
                var g = wasOn ? 1 : ez(e);
                var bw = maxW * row.v(q) / row.max * g;
                rr(barX, by, bw, L.bh, 4, col + '30', col + 'cc', 1.5);
                var la = wasOn ? 1 : seg(e, 0.6, 1);
                if (la > 0) {
                    ctx.globalAlpha = la;
                    tx(row.f(q), barX + bw + 6, by + L.bh / 2, fs, col + 'ee', 'left', true);
                    ctx.globalAlpha = 1;
                }
            }
        }
    }

    /* ===================== 장면 진입 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var s = step || currentSteps()[0];
        var p = prev || s;
        var e = clamp01(t);
        if (mode === 'decode') isaDrawDecode(x0, top, w, mob, s, p, e);
        else if (mode === 'perf') isaDrawPerf(x0, top, w, mob, s, p, e);
        else isaDrawOne(x0, top, w, mob, s, p, e);
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
        speedBtns.forEach(function (b) { b.classList.remove('isa-viz__speed-btn--active'); });
        btn.classList.add('isa-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('isa-viz__mode-btn--active', d.key === m); });
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