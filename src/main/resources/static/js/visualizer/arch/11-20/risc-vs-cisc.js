/**
 * RISC vs CISC 시각화
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
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

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
    var mode    = 'one';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'decode') return DECODE_STEPS;
        if (mode === 'perf') return PERF_STEPS;
        return ONE_STEPS;
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

    /* ===================== 모드: 같은 일, 다른 명령어 ===================== */
    function drawOne(x0, top, w, mob, step) {
        var fs  = mob ? 10.5 : 12;
        var cw  = Math.min(260, (w - 24) / 2);
        var gx  = x0 + (w - 2 * cw - 24) / 2;
        var cx  = [gx, gx + cw + 24];
        var bh  = mob ? 34 : 38;
        var c   = step ? step.c : 0;
        var r   = step ? step.r : 0;
        var u   = step ? step.u : false;
        tx('CISC (x86)', cx[0], top + 6, fs + 1, P.orange + 'ee', 'left', true);
        tx('RISC (RISC-V)', cx[1], top + 6, fs + 1, P.teal + 'ee', 'left', true);
        tx('x = x + r', x0 + w / 2, top + 6, fs - 0.5, P.muted + 'dd', 'center', false);

        for (var i = 0; i < 3; i++) {
            var y = top + 28 + i * (bh + 10);
            var cShow = i === 0 && c >= 1;
            rr(cx[0], y, cw, bh, 6, cShow ? P.orange + '26' : 'none', cShow ? P.orange + 'cc' : P.muted + '44', 1.4);
            if (cShow) tx(CISC_I[0], cx[0] + 12, y + bh / 2, fs + 0.5, P.text + 'ee', 'left', true);
            var rShow = r > i;
            rr(cx[1], y, cw, bh, 6, rShow ? P.teal + '26' : 'none', rShow ? P.teal + 'cc' : P.muted + '44', 1.4);
            if (rShow) {
                tx(RISC_I[i], cx[1] + 12, y + bh / 2 - 6, fs + 0.5, P.text + 'ee', 'left', true);
                tx(RISC_NOTE[i], cx[1] + 12, y + bh / 2 + 9, fs - 1.5, P.muted + 'dd', 'left', false);
            }
        }
        var cy = top + 28 + 3 * (bh + 10) + 6;
        tx('명령어 ' + (c ? CISC_I.length : 0) + '개', cx[0], cy, fs + 1, c ? P.orange + 'ee' : P.muted + '88', 'left', true);
        tx('명령어 ' + r + '개', cx[1], cy, fs + 1, r ? P.teal + 'ee' : P.muted + '88', 'left', true);
        if (u) {
            tx('내부에서 마이크로 연산으로 분해(개념도)', cx[0], cy + 26, fs - 0.5, P.muted + 'ee', 'left', true);
            var uw = (cw - 16) / 3;
            UOPS.forEach(function (name, k) {
                var ux = cx[0] + k * (uw + 8);
                rr(ux, cy + 38, uw, 28, 5, P.purple + '26', P.purple + 'cc', 1.3);
                tx(name, ux + uw / 2, cy + 52, fs, P.purple + 'ee', 'center', true);
            });
        }
    }

    /* ===================== 모드: 명령어 길이와 디코딩 ===================== */
    function drawStrip(x0, y, w, lens, starts0, known, col, fs, title, total, mob) {
        tx(title, x0, y, fs + 1, col + 'ee', 'left', true);
        var unit = (w - 2) / Math.max(TOTAL_R, TOTAL_C);
        var by = y + 14;
        var bh = mob ? 30 : 34;
        lens.forEach(function (l, i) {
            var bx = x0 + starts0[i] * unit;
            var on = i < known;
            rr(bx + 1, by, l * unit - 2, bh, 4, on ? col + '2a' : P.muted + '10', on ? col + 'cc' : P.muted + '55', on ? 1.6 : 1);
            tx(on ? 'I' + (i + 1) : '', bx + l * unit / 2, by + bh / 2 - (on && l * unit > 40 ? 6 : 0), fs, col + 'ee', 'center', true);
            if (on && l * unit > 40) tx(l + 'B', bx + l * unit / 2, by + bh / 2 + 8, fs - 2, P.muted + 'ee', 'center', false);
        });
        tx('전체 ' + total + '바이트', x0 + w, y, fs - 0.5, P.muted + 'dd', 'right', false);
    }

    function drawDecode(x0, top, w, mob, step) {
        var fs = mob ? 10.5 : 12;
        var rk = step ? step.rk : 0;
        var ck = step ? step.ck : 0;
        drawStrip(x0, top + 8, w, RISC_LEN, RISC_START, rk, P.teal, fs, mob ? 'RISC 고정 4바이트' : 'RISC — 고정 길이 4바이트', TOTAL_R, mob);
        drawStrip(x0, top + 110, w, CISC_LEN, CISC_START, ck, P.orange, fs, mob ? 'CISC 가변 길이' : 'CISC — 가변 길이(예시)', TOTAL_C, mob);
        if (rk > 0) tx('경계를 한 번에 알 수 있음', x0, top + 76, fs, P.teal + 'ee', 'left', true);
        if (ck > 0 && ck < N_I) tx('I' + ck + '의 길이를 해석해야 I' + (ck + 1) + '의 위치를 앎', x0, top + 178, fs, P.orange + 'ee', 'left', true);
        if (ck >= N_I) tx('같은 ' + N_I + '개 명령어: ' + TOTAL_R + '바이트 vs ' + TOTAL_C + '바이트', x0, top + 178, fs, P.green + 'ee', 'left', true);
    }

    /* ===================== 모드: 성능 식 ===================== */
    function drawPerf(x0, top, w, mob, step) {
        var fs = mob ? 10.5 : 12;
        var k  = step ? step.k : 0;
        var barX = x0 + (mob ? 56 : 70);
        var maxW = w - (barX - x0) - (mob ? 70 : 100);
        var bh = mob ? 22 : 26;
        tx('CPU 시간 = 명령어 수 × CPI × 사이클 시간', x0, top + 8, fs + 1, P.text + 'ee', 'left', true);
        var rows = [
            [1, '명령어 수', function (p) { return p.ic; }, Math.max(PA.ic, PB.ic), function (p) { return fmtN(p.ic); }],
            [2, 'CPI', function (p) { return p.cpi; }, Math.max(PA.cpi, PB.cpi), function (p) { return String(p.cpi); }],
            [3, 'CPU 시간', cpuTimeMs, Math.max(cpuTimeMs(PA), cpuTimeMs(PB)), function (p) { return cpuTimeMs(p) + 'ms'; }]
        ];
        rows.forEach(function (row, ri) {
            var gy = top + 36 + ri * (2 * bh + 44);
            var on = k >= row[0];
            tx(row[1], x0, gy, fs + 0.5, on ? P.text + 'ee' : P.muted + '88', 'left', true);
            [[PA, P.orange], [PB, P.teal]].forEach(function (pc, pi) {
                var y = gy + 12 + pi * (bh + 6);
                tx(pc[0].name, x0, y + bh / 2, fs - 0.5, on ? pc[1] + 'ee' : P.muted + '77', 'left', true);
                rr(barX, y, maxW, bh, 4, 'none', P.muted + '33', 1);
                if (on) {
                    var bw = maxW * row[2](pc[0]) / row[3];
                    rr(barX, y, bw, bh, 4, pc[1] + '30', pc[1] + 'cc', 1.5);
                    tx(row[4](pc[0]), barX + bw + 6, y + bh / 2, fs - 0.5, pc[1] + 'ee', 'left', true);
                }
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

        if (mode === 'decode') drawDecode(padX, top, fullW, mob, step);
        else if (mode === 'perf') drawPerf(padX, top, fullW, mob, step);
        else drawOne(padX, top, fullW, mob, step);

        if (!step) {
            tx('아래 STEP을 눌러 RISC와 CISC가 어떻게 다른지 확인하세요.', W / 2, GH() - (mob ? 12 : 14), mob ? 11 : 12.5, P.muted + 'aa', 'center', false);
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH;
        if (mode === 'decode') neededH = mob ? 300 : 300;
        else if (mode === 'perf') neededH = mob ? 360 : 380;
        else neededH = mob ? 360 : 340;
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
        if (mode === 'decode') return '명령어 길이가 고정일 때와 가변일 때 명령어의 시작 위치를 알아내는 방식의 차이를 봅니다.';
        if (mode === 'perf') return 'CPU 시간 = 명령어 수 × CPI × 사이클 시간 식으로 RISC와 CISC의 성능을 비교하는 방법을 봅니다.';
        return '메모리 값에 레지스터를 더해 저장하는 같은 일을 CISC와 RISC가 어떻게 명령어로 표현하는지 봅니다.';
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