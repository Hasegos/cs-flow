/**
 * IEEE 754 부동소수점 시각화
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
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

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
    var mode    = 'fields';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'sum') return SUM_STEPS;
        if (mode === 'range') return RANGE_STEPS;
        return FIELD_STEPS;
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
        if (sz < 9.5) sz = 9.5;
        if (color.indexOf(P.muted) === 0) color = P.sub + 'ff';
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    /* ===================== 모드: 비트 구성 ===================== */
    function drawFields(x0, top, w, mob, step) {
        var fs = mob ? 10.5 : 12;
        var k  = step ? step.k : 0;
        var cw = w / 32;
        var by = top + 22;
        var ch = mob ? 30 : 38;
        var cols = [P.red, P.orange, P.teal];
        var groups = [[0, 0, '부호 1'], [1, 8, '지수 8'], [9, 31, '가수 23']];
        tx(EX + ' (float 32비트)', x0, top + 6, fs + 1, P.text + 'ee', 'left', true);
        for (var i = 0; i < 32; i++) {
            var g = i === 0 ? 0 : (i <= 8 ? 1 : 2);
            var lit = k === 0 || k === 4 || k === g + 1;
            rr(x0 + i * cw + 0.5, by, cw - 1, ch, 2, cols[g] + (lit ? '30' : '10'), cols[g] + (lit ? 'cc' : '44'), lit && k !== 0 ? 1.6 : 1);
            if (cw >= 14) tx(B.str.charAt(i), x0 + i * cw + cw / 2, by + ch / 2, fs, lit ? cols[g] + 'ee' : P.muted + '88', 'center', true);
        }
        groups.forEach(function (gr, gi) {
            var gx = x0 + gr[0] * cw;
            var gw = (gr[1] - gr[0] + 1) * cw;
            rr(gx + 1, by + ch + 5, gw - 2, 3, 1.5, cols[gi] + 'cc', 'none', 0);
            tx(gr[2], gx + gw / 2, by + ch + 20, fs, cols[gi] + 'ee', 'center', true);
        });
        var ly = by + ch + 52;
        var lines = [
            [1, '부호 s = ' + B.s + ' → (−1)^' + B.s + ' = ' + (SIGN > 0 ? '+1' : '−1'), P.red],
            [2, '지수 e = ' + B.e + ' → ' + B.e + ' − 127 = ' + EXP + ' → 2^' + EXP + ' = ' + Math.pow(2, EXP), P.orange],
            [3, '가수 f = ' + B.f + ' → 1 + f / 2^23 = ' + MANT, P.teal],
            [4, '값 = ' + (SIGN > 0 ? '+1' : '−1') + ' × ' + MANT + ' × ' + Math.pow(2, EXP) + ' = ' + (SIGN * MANT * Math.pow(2, EXP)), P.green]
        ];
        lines.forEach(function (ln, i) {
            var show = k >= ln[0];
            tx(show ? ln[1] : '', x0, ly + i * (mob ? 26 : 30), fs + 0.5, ln[2] + 'ee', 'left', true);
        });
    }

    /* ===================== 모드: 0.1 + 0.2 ===================== */
    function drawSum(x0, top, w, mob, step) {
        var fs = mob ? 10 : 12;
        var n  = step ? step.n : 0;
        var rows = [
            [1, '0.1', DA.toFixed(DIG), P.purple],
            [2, '0.2', DB.toFixed(DIG), P.purple],
            [3, '0.1 + 0.2', DS.toFixed(DIG), P.orange],
            [4, '0.3', DC.toFixed(DIG), P.teal]
        ];
        tx('double로 저장된 실제 값 (소수 ' + DIG + '자리까지)', x0, top + 6, fs + 1, P.text + 'ee', 'left', true);
        var rh = mob ? 54 : 56;
        rows.forEach(function (r, i) {
            var y = top + 28 + i * rh;
            var on = n >= r[0];
            rr(x0, y, w, rh - 8, 6, on ? r[3] + '18' : 'none', on ? r[3] + 'aa' : P.muted + '44', 1.4);
            tx(r[1], x0 + 12, y + 14, fs + 1, on ? r[3] + 'ee' : P.muted + '88', 'left', true);
            tx(on ? r[2] + '…' : '?', x0 + 12, y + 33, fs + 1, on ? P.text + 'ee' : P.muted + '77', 'left', true);
        });
        var ry = top + 28 + 4 * rh + 6;
        if (n >= 4) {
            tx('0.1 + 0.2 == 0.3  →  ' + (DS === DC), x0, ry, fs + 2, DS === DC ? P.green + 'ee' : P.red + 'ee', 'left', true);
        }
        if (n >= 5) {
            var ok = Math.abs(DIFF) < Number.EPSILON;
            tx('|차이| = ' + String(Math.abs(DIFF)) + ' < ' + String(Number.EPSILON) + '  →  ' + ok, x0, ry + 26, fs + 1, ok ? P.green + 'ee' : P.red + 'ee', 'left', true);
        }
    }

    /* ===================== 모드: 정밀도와 범위 ===================== */
    function drawRange(x0, top, w, mob, step) {
        var fs = mob ? 10 : 12;
        var c  = step ? step.c : 0;
        var ch = mob ? 62 : 64;
        RANGE_CARDS.forEach(function (card, i) {
            var y  = top + i * (ch + 8);
            var on = c > i;
            rr(x0, y, w, ch, 6, on ? P.purple + '14' : 'none', on ? P.purple + 'aa' : P.muted + '44', 1.4);
            tx(card.title, x0 + 12, y + 16, fs + 1, on ? P.text + 'ee' : P.muted + '77', 'left', true);
            card.lines.forEach(function (ln, li) {
                tx(on ? ln : '', x0 + 12, y + 34 + li * (mob ? 15 : 17), fs - 0.5, P.teal + 'ee', 'left', false);
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

        if (mode === 'sum') drawSum(padX, top, fullW, mob, step);
        else if (mode === 'range') drawRange(padX, top, fullW, mob, step);
        else drawFields(padX, top, fullW, mob, step);

        if (!step) {
            tx('아래 STEP을 눌러 부동소수점이 어떻게 저장되는지 확인하세요.', W / 2, GH() - (mob ? 12 : 14), mob ? 11 : 12.5, P.muted + 'aa', 'center', false);
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH;
        if (mode === 'sum') neededH = mob ? 360 : 370;
        else if (mode === 'range') neededH = mob ? 360 : 360;
        else neededH = mob ? 300 : 320;
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
        if (mode === 'sum') return '0.1과 0.2가 2진수로 정확히 저장되지 않아 0.1 + 0.2가 0.3과 달라지는 과정을 봅니다.';
        if (mode === 'range') return '부동소수점이 표현할 수 있는 수의 간격이 크기에 따라 어떻게 달라지는지 봅니다.';
        return '32비트 float이 부호, 지수, 가수 세 필드로 하나의 수를 나타내는 방법을 따라가 봅니다.';
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