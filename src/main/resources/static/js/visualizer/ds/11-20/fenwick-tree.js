/**
 * 펜윅 트리 시각화
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
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

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
    var mode    = 'build';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'query') return QUERY_STEPS;
        if (mode === 'update') return UP_STEPS;
        return BUILD_STEPS;
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

    /* ===================== 공통: 배열과 펜윅 트리 그리기 ===================== */
    function drawBit(x0, top, w, mob, step, mode) {
        var fs = mob ? 10 : 11.5;
        var cw = w / N;
        var bw = cw - 3;
        var arr = step ? step.arr : A;
        var bit = step ? step.bit : BIT;
        var shown = step ? step.shown : 0;
        var cur = step ? step.cur : 0;
        var hops = step ? step.hops : [];
        var mark = step && step.mark ? step.mark : 0;
        var rng = cur ? rangeOf(cur) : null;
        var ay = top + 30;
        var by = top + 98;
        for (var i = 1; i <= N; i++) {
            tx(String(i), x0 + (i - 0.5) * cw, top + 8, fs - 1.5, P.sub + 'ee', 'center', true);
        }
        tx('배열 A', x0, top + 22, fs - 1.5, P.sub + 'ee', 'left', true);
        for (var a = 1; a <= N; a++) {
            var inr = rng && a >= rng[0] && a <= rng[1];
            var mk = mark === a;
            var c = mk ? P.orange : (inr ? P.yellow : P.sub);
            rr(x0 + (a - 1) * cw + 1.5, ay, bw, 24, 3, mk ? P.orange + '35' : (inr ? P.yellow + '30' : 'none'), c + (mk || inr ? 'ff' : '88'), mk || inr ? 1.8 : 1.1);
            tx(String(arr[a - 1]), x0 + (a - 0.5) * cw, ay + 12, fs - 0.5, P.text + 'ee', 'center', true);
        }
        if (rng) {
            ctx.beginPath();
            ctx.moveTo(x0 + (rng[0] - 1) * cw + 2, ay + 32);
            ctx.lineTo(x0 + rng[1] * cw - 2, ay + 32);
            ctx.strokeStyle = P.yellow + 'ff';
            ctx.lineWidth = 3;
            ctx.stroke();
        }
        tx('펜윅 트리 BIT', x0, by - 8, fs - 1.5, P.sub + 'ee', 'left', true);
        for (var b = 1; b <= N; b++) {
            var vis = mode !== 'build' || b <= shown;
            var isCur = b === cur;
            var hopped = hops.indexOf(b) >= 0;
            var col = isCur ? (mode === 'update' ? P.orange : P.yellow) : (hopped ? (mode === 'update' ? P.orange : P.green) : P.teal);
            var fill = isCur || hopped ? col + '35' : (vis ? P.teal + '18' : 'none');
            rr(x0 + (b - 1) * cw + 1.5, by, bw, 24, 3, fill, col + (vis || isCur ? 'ff' : '55'), isCur ? 2 : 1.3);
            if (vis) tx(String(bit[b]), x0 + (b - 0.5) * cw, by + 12, fs - 0.5, P.text + 'ee', 'center', true);
        }
        if (step && step.cap) tx(step.cap, x0 + w / 2, by + 44, fs - 0.5, P.yellow + 'ff', 'center', true);
        if (step && step.cap2) tx(step.cap2, x0 + w / 2, by + 62, fs - 1, P.text + 'ee', 'center', false);
        if (step && step.cap3) tx(step.cap3, x0 + w / 2, by + 80, fs - 1, P.green + 'ee', 'center', true);
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

        drawBit(padX, top, fullW, mob, step, mode);

        if (!step) {
            var hint = '아래 STEP으로 펜윅 트리의 동작을 확인하세요.';
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
        neededH = mob ? 230 : 250;
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
        if (mode === 'query') return '누적 합을 구할 때 읽는 칸을 lowbit로 따라가 봅니다.';
        if (mode === 'update') return '값을 바꿀 때 고쳐야 하는 칸을 lowbit로 따라가 봅니다.';
        return '각 칸 BIT[i]가 담당하는 구간을 1번부터 차례로 봅니다.';
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