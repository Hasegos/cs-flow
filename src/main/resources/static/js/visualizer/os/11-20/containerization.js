/**
 * VM vs 컨테이너 시각화
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
    var root    = el('div', 'ct-viz');
    var toolbar = el('div', 'ct-viz__toolbar');
    var tbLeft  = el('div', 'ct-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'ct-viz__title', 'VM VS CONTAINER'));

    var modeWrap = el('div', 'ct-viz__mode');
    var modeDefs = [
        { key: 'stack', label: '구조 비교' },
        { key: 'cost', label: '자원과 시작' },
        { key: 'isolate', label: '격리의 경계' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'ct-viz__mode-btn' + (i === 0 ? ' ct-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'ct-viz__speed');
    speedWrap.appendChild(el('span', 'ct-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'ct-viz__speed-btn' + (i === 0 ? ' ct-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'ct-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'ct-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'ct-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'ct-viz__controls');
    var btnPlay  = el('button', 'ct-viz__btn ct-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'ct-viz__btn', '▶| STEP');
    var btnReset = el('button', 'ct-viz__btn', '↺ RESET');
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

    /* ===================== 데이터: 구조 비교 ===================== */
    var N_APPS = 3;
    var GUEST_KERNELS = N_APPS;
    var CT_EXTRA_KERNELS = 0;

    var STACK_STEPS = [
        { k: 0, log: '같은 하드웨어에서 앱 ' + N_APPS + '개를 격리해 실행하는 두 가지 방법을 비교합니다. 왼쪽은 가상 머신(VM), 오른쪽은 컨테이너입니다.' },
        { k: 1, log: '맨 아래는 같은 하드웨어(CPU, 메모리, 디스크)입니다.' },
        { k: 2, log: 'VM은 하드웨어를 가상화하는 하이퍼바이저를 두고, 컨테이너는 호스트 운영체제(커널)와 컨테이너 런타임을 둡니다.' },
        { k: 3, log: '그 위에서 앱 ' + N_APPS + '개를 실행합니다. 앱은 필요한 라이브러리와 함께 묶여 있습니다.' },
        { k: 4, log: 'VM은 앱마다 게스트 운영체제를 따로 띄우므로 커널이 ' + GUEST_KERNELS + '개 더 있습니다. 컨테이너는 호스트 커널 하나를 공유해 추가 커널이 ' + CT_EXTRA_KERNELS + '개입니다.' },
        { k: 4, log: '정리 — VM은 컴퓨터 한 대를 통째로 흉내 내고, 컨테이너는 같은 커널 위에서 프로세스를 격리합니다. 그래서 컨테이너는 게스트 운영체제 비용이 없습니다.' }
    ];

    /* ===================== 데이터: 자원과 시작 ===================== */
    var GUEST_OS_MB = 1024;
    var APP_MB = 100;
    var BOOT_VM = 30;
    var BOOT_CT = 1;
    var VM_TOTAL = N_APPS * (GUEST_OS_MB + APP_MB);
    var CT_TOTAL = N_APPS * APP_MB;
    function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

    var COST_STEPS = [
        { k: 0, log: '앱 ' + N_APPS + '개를 띄울 때 드는 자원을 비교합니다. 값은 방식의 차이를 보이기 위한 가정이며 실제 크기는 환경마다 다릅니다.' },
        { k: 1, log: 'VM — 앱마다 게스트 운영체제(' + GUEST_OS_MB + 'MB 가정)와 앱(' + APP_MB + 'MB 가정)이 필요해 ' + N_APPS + ' × ' + (GUEST_OS_MB + APP_MB) + ' = ' + fmt(VM_TOTAL) + 'MB입니다.' },
        { k: 2, log: '컨테이너 — 호스트 커널을 공유하므로 앱만 있으면 되어 ' + N_APPS + ' × ' + APP_MB + ' = ' + fmt(CT_TOTAL) + 'MB입니다.' },
        { k: 3, log: '시작 — VM은 게스트 운영체제를 부팅해야 하고(' + BOOT_VM + ' 단위 가정), 컨테이너는 격리된 프로세스를 시작하면 됩니다(' + BOOT_CT + ' 단위 가정).' },
        { k: 3, log: '정리 — 컨테이너는 게스트 운영체제가 없어 자원을 적게 쓰고 빨리 시작합니다. 대신 호스트와 같은 종류의 커널을 써야 하는 제약이 있습니다.' }
    ];

    /* ===================== 데이터: 격리의 경계 ===================== */
    var CT_HIT = [true, true, true];
    var VM_HIT = [true, false, false];
    var CT_N = CT_HIT.filter(Boolean).length;
    var VM_N = VM_HIT.filter(Boolean).length;

    var ISO_STEPS = [
        { k: 0, log: '격리의 경계를 비교합니다. 호스트 커널 또는 게스트 커널에 취약점이 있고 악용된다고 가정합니다.' },
        { k: 1, log: '컨테이너 — ' + N_APPS + '개의 컨테이너가 호스트 커널 하나를 공유합니다. 격리는 커널이 제공하는 기능(네임스페이스, cgroups)에 기댑니다.' },
        { k: 2, log: '호스트 커널의 취약점이 악용되면 그 커널을 쓰는 컨테이너 ' + CT_N + '/' + N_APPS + '개가 영향을 받을 수 있고 호스트도 위험해집니다.' },
        { k: 3, log: 'VM — 게스트마다 커널이 따로 있고, 게스트와 호스트 사이에는 하이퍼바이저라는 경계가 있습니다.' },
        { k: 4, log: '한 게스트의 커널이 뚫려도 그 VM(' + VM_N + '/' + N_APPS + '개)에 한정되고, 다른 VM이나 호스트로 번지려면 하이퍼바이저 같은 경계를 또 넘어야 합니다.' },
        { k: 4, log: '정리 — 컨테이너는 격리 경계가 상대적으로 얇고, VM은 더 두껍습니다. 그래서 보안이 중요하면 컨테이너를 VM 안에서 돌리는 구성도 씁니다.' }
    ];

    /* ===================== 상태 ===================== */
    var mode    = 'stack';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'cost') return COST_STEPS;
        if (mode === 'isolate') return ISO_STEPS;
        return STACK_STEPS;
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

    /* ===================== 모드: 구조 비교 ===================== */
    function layer(x, y, w, h, label, col, on, fs) {
        rr(x, y, w, h, 5, on ? col + '24' : 'none', on ? col + 'cc' : P.muted + '33', 1.4);
        if (on) tx(label, x + w / 2, y + h / 2, fs, P.text + 'ee', 'center', true);
    }

    function drawStack(x0, top, w, mob, step) {
        var fs = mob ? 10 : 11.5;
        var k = step ? step.k : 0;
        var gap = mob ? 14 : 28;
        var cw = (w - gap) / 2;
        var lh = mob ? 30 : 34;
        var base = top + 236;
        var cols = [
            { x: x0, name: '가상 머신', col: P.orange, mid: '하이퍼바이저', guest: true },
            { x: x0 + cw + gap, name: '컨테이너', col: P.teal, mid: mob ? '호스트 OS + 런타임' : '호스트 OS(커널) + 런타임', guest: false }
        ];
        cols.forEach(function (c) {
            tx(c.name, c.x, top + 12, fs + 1.5, c.col + 'ee', 'left', true);
            layer(c.x, base - lh, cw, lh, '하드웨어', P.muted, k >= 1, fs);
            layer(c.x, base - 2 * lh - 4, cw, lh, c.mid, P.purple, k >= 2, fs);
            var aw = (cw - 2 * 6) / N_APPS;
            for (var i = 0; i < N_APPS; i++) {
                var ax = c.x + i * (aw + 6);
                var yBottom = base - 2 * lh - 4;
                if (c.guest) {
                    layer(ax, yBottom - 4 - lh, aw, lh, mob ? 'OS' : '게스트 OS', P.red, k >= 4, fs - 1);
                    layer(ax, yBottom - 4 - lh - 4 - lh, aw, lh, '앱 ' + (i + 1), c.col, k >= 3, fs - 0.5);
                } else {
                    layer(ax, yBottom - 4 - lh, aw, lh, '앱 ' + (i + 1), c.col, k >= 3, fs - 0.5);
                }
            }
        });
        if (k >= 4) {
            tx('추가 커널 ' + GUEST_KERNELS + '개', cols[0].x, top + 30, fs, P.red + 'ee', 'left', true);
            tx('추가 커널 ' + CT_EXTRA_KERNELS + '개 (호스트 커널 공유)', cols[1].x, top + 30, fs - (mob ? 1.5 : 0), P.green + 'ee', 'left', true);
        }
    }

    /* ===================== 모드: 자원과 시작 ===================== */
    function drawCost(x0, top, w, mob, step) {
        var fs = mob ? 10.5 : 12;
        var k = step ? step.k : 0;
        var bh = mob ? 26 : 30;
        var lw = mob ? 56 : 70;
        var maxW = w - lw - (mob ? 70 : 90);
        var rows = [
            [1, '디스크·메모리(앱 ' + N_APPS + '개, MB)', [[VM_TOTAL, P.orange, 'VM', fmt(VM_TOTAL)], [CT_TOTAL, P.teal, '컨테이너', fmt(CT_TOTAL)]], VM_TOTAL, top + 36],
            [3, '시작 시간 (상대 단위, 가정)', [[BOOT_VM, P.orange, 'VM', String(BOOT_VM)], [BOOT_CT, P.teal, '컨테이너', String(BOOT_CT)]], BOOT_VM, top + 36 + 2 * bh + 62]
        ];
        rows.forEach(function (row) {
            var y = row[4];
            var on = k >= row[0];
            tx(row[1], x0, y - 8, fs, on ? P.text + 'ee' : P.muted + '88', 'left', true);
            row[2].forEach(function (b, bi) {
                var by = y + 6 + bi * (bh + 6);
                tx(b[2], x0, by + bh / 2, fs - 1.5, on ? b[1] + 'ee' : P.muted + '77', 'left', true);
                rr(x0 + lw, by, maxW, bh, 4, 'none', P.muted + '33', 1);
                if (on) {
                    var bw = Math.max(3, maxW * b[0] / row[3]);
                    rr(x0 + lw, by, bw, bh, 4, b[1] + '30', b[1] + 'cc', 1.5);
                    tx(b[3], x0 + lw + bw + 6, by + bh / 2, fs - 0.5, b[1] + 'ee', 'left', true);
                }
            });
        });
    }

    /* ===================== 모드: 격리의 경계 ===================== */
    function drawIsolate(x0, top, w, mob, step) {
        var fs = mob ? 10 : 11.5;
        var k = step ? step.k : 0;
        var gap = mob ? 14 : 28;
        var cw = (w - gap) / 2;
        var bh = mob ? 40 : 44;
        var aw = (cw - 2 * 6) / N_APPS;
        var y0 = top + 40;
        var panels = [
            { x: x0, name: '컨테이너', on: k >= 1, bad: k >= 2, hit: CT_HIT, col: P.teal, shared: true },
            { x: x0 + cw + gap, name: '가상 머신', on: k >= 3, bad: k >= 4, hit: VM_HIT, col: P.orange, shared: false }
        ];
        panels.forEach(function (p) {
            tx(p.name, p.x, top + 12, fs + 1.5, p.on ? p.col + 'ee' : P.muted + '88', 'left', true);
            for (var i = 0; i < N_APPS; i++) {
                var ax = p.x + i * (aw + 6);
                var hit = p.bad && p.hit[i];
                var col = hit ? P.red : p.col;
                rr(ax, y0, aw, bh, 5, p.on ? col + (hit ? '40' : '22') : 'none', p.on ? col + 'cc' : P.muted + '33', hit ? 2 : 1.4);
                if (p.on) tx('앱 ' + (i + 1), ax + aw / 2, y0 + bh / 2, fs, P.text + 'ee', 'center', true);
                if (!p.shared) {
                    rr(ax, y0 + bh + 6, aw, 30, 5, p.on ? col + (hit ? '40' : '14') : 'none', p.on ? col + 'aa' : P.muted + '33', hit ? 2 : 1.2);
                    if (p.on) tx(mob ? '커널' : '게스트 커널', ax + aw / 2, y0 + bh + 21, fs - 1, P.text + 'dd', 'center', true);
                }
            }
            if (p.shared) {
                var any = p.bad;
                rr(p.x, y0 + bh + 6, cw, 30, 5, p.on ? (any ? P.red + '40' : P.muted + '24') : 'none', p.on ? (any ? P.red + 'ff' : P.muted + 'aa') : P.muted + '33', any ? 2 : 1.2);
                if (p.on) tx('호스트 커널 (공유)', p.x + cw / 2, y0 + bh + 21, fs - 0.5, P.text + 'ee', 'center', true);
            }
            if (p.on) {
                var n = p.bad ? p.hit.filter(Boolean).length : 0;
                tx(p.bad ? '영향 ' + n + '/' + N_APPS : '영향 없음', p.x, y0 + bh + 62, fs + 1, p.bad ? P.red + 'ee' : P.muted + 'ee', 'left', true);
            }
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

        if (mode === 'cost') drawCost(padX, top, fullW, mob, step);
        else if (mode === 'isolate') drawIsolate(padX, top, fullW, mob, step);
        else drawStack(padX, top, fullW, mob, step);

        if (!step) {
            tx('아래 STEP을 눌러 가상 머신과 컨테이너의 차이를 확인하세요.', W / 2, GH() - (mob ? 12 : 14), mob ? 11 : 12.5, P.muted + 'aa', 'center', false);
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH;
        if (mode === 'cost') neededH = mob ? 270 : 280;
        else if (mode === 'isolate') neededH = mob ? 220 : 220;
        else neededH = mob ? 270 : 276;
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
        if (mode === 'cost') return '앱을 여러 개 띄울 때 가상 머신과 컨테이너가 쓰는 자원과 시작 시간을 비교합니다.';
        if (mode === 'isolate') return '커널 취약점이 악용되었을 때 컨테이너와 가상 머신에서 영향을 받는 범위를 비교합니다.';
        return '가상 머신과 컨테이너가 같은 하드웨어 위에 어떤 층으로 쌓이는지 비교합니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('ct-viz__speed-btn--active'); });
        btn.classList.add('ct-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('ct-viz__mode-btn--active', d.key === m); });
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