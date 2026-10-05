/**
 * 스레드 풀 시각화
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
    var root    = el('div', 'tp-viz');
    var toolbar = el('div', 'tp-viz__toolbar');
    var tbLeft  = el('div', 'tp-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'tp-viz__title', 'THREAD POOL'));

    var modeWrap = el('div', 'tp-viz__mode');
    var modeDefs = [
        { key: 'create', label: '생성 비용 비교' },
        { key: 'queue', label: '작업 큐' },
        { key: 'size', label: '풀 크기' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'tp-viz__mode-btn' + (i === 0 ? ' tp-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'tp-viz__speed');
    speedWrap.appendChild(el('span', 'tp-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'tp-viz__speed-btn' + (i === 0 ? ' tp-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'tp-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'tp-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'tp-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'tp-viz__controls');
    var btnPlay  = el('button', 'tp-viz__btn tp-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'tp-viz__btn', '▶| STEP');
    var btnReset = el('button', 'tp-viz__btn', '↺ RESET');
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

    /* ===================== 데이터: 생성 비용 비교 ===================== */
    var N_TASKS   = 8;
    var T_CREATE  = 3;
    var T_DESTROY = 1;
    var T_RUN     = 2;
    var POOL_N    = 3;
    var PER_REQ = { create: N_TASKS * T_CREATE, run: N_TASKS * T_RUN, destroy: N_TASKS * T_DESTROY };
    var POOLED  = { create: POOL_N * T_CREATE, run: N_TASKS * T_RUN, destroy: POOL_N * T_DESTROY };
    function sum3(o) { return o.create + o.run + o.destroy; }
    var MAX_TOTAL = Math.max(sum3(PER_REQ), sum3(POOLED));

    var CREATE_STEPS = [
        { k: 0, log: '요청 ' + N_TASKS + '개를 처리합니다. 스레드 하나를 만드는 데 ' + T_CREATE + ', 없애는 데 ' + T_DESTROY + ', 작업 하나를 실행하는 데 ' + T_RUN + '만큼 든다고 가정합니다(설명용 단위).' },
        { k: 1, log: '요청마다 스레드 — 요청 ' + N_TASKS + '개에 스레드를 ' + N_TASKS + '번 만들고 없앱니다. 생성 ' + PER_REQ.create + ' + 소멸 ' + PER_REQ.destroy + ' = ' + (PER_REQ.create + PER_REQ.destroy) + '를 일 아닌 곳에 씁니다. 요청이 한꺼번에 몰리면 스레드도 그만큼 동시에 생깁니다.' },
        { k: 2, log: '스레드 풀 — 스레드 ' + POOL_N + '개를 미리 만들어 두고 재사용합니다. 생성 ' + POOLED.create + ' + 소멸 ' + POOLED.destroy + ' = ' + (POOLED.create + POOLED.destroy) + '만 듭니다. 동시에 존재하는 스레드는 최대 ' + POOL_N + '개입니다.' },
        { k: 3, log: '같은 일(실행 ' + PER_REQ.run + ')을 하는 데 요청마다 스레드는 총 ' + sum3(PER_REQ) + ', 스레드 풀은 총 ' + sum3(POOLED) + '입니다. 스레드 시간의 합으로 본 값이며 실제 소요 시간은 병렬 실행에 따라 다릅니다.' },
        { k: 3, log: '정리 — 풀은 생성·소멸 비용을 줄이고 스레드 수의 상한을 둡니다. 이 수치는 가정한 값이며 실제 비용은 운영체제와 환경마다 다릅니다.' }
    ];

    /* ===================== 데이터: 작업 큐 ===================== */
    var WORKERS = 3;
    var TASKS = [
        { id: 1, at: 0, dur: 3 }, { id: 2, at: 0, dur: 3 }, { id: 3, at: 0, dur: 3 },
        { id: 4, at: 1, dur: 2 }, { id: 5, at: 1, dur: 2 }, { id: 6, at: 2, dur: 1 }, { id: 7, at: 3, dur: 2 }
    ];
    function simulate() {
        var workers = [];
        for (var i = 0; i < WORKERS; i++) workers.push({ id: 0, left: 0 });
        var queue = [];
        var snaps = [];
        var done = 0;
        for (var t = 0; done < TASKS.length && t < 100; t++) {
            TASKS.forEach(function (tk) { if (tk.at === t) queue.push(tk); });
            workers.forEach(function (w) {
                if (w.left === 0 && queue.length) {
                    var tk = queue.shift();
                    w.id = tk.id;
                    w.left = tk.dur;
                }
            });
            snaps.push({ t: t, workers: workers.map(function (w) { return w.left > 0 ? w.id : 0; }), queue: queue.map(function (q) { return q.id; }), done: done });
            workers.forEach(function (w) {
                if (w.left > 0) {
                    w.left--;
                    if (w.left === 0) { done++; w.id = 0; }
                }
            });
        }
        return snaps;
    }
    var SNAPS = simulate();
    var MAX_Q = SNAPS.reduce(function (m, s) { return Math.max(m, s.queue.length); }, 0);
    function snapLog(s) {
        var busy = s.workers.filter(function (id) { return id > 0; }).length;
        var q = s.queue.length ? ' 대기 큐 ' + s.queue.length + '개(작업 ' + s.queue.join(', ') + ')' : ' 대기 큐 비어 있음';
        return 't=' + s.t + ' — 일하는 스레드 ' + busy + '/' + WORKERS + ',' + q + ', 완료 ' + s.done + '개.';
    }
    var QUEUE_STEPS = [{ s: null, log: '스레드 풀 — 스레드 ' + WORKERS + '개와 작업 큐가 있습니다. 작업 ' + TASKS.length + '개가 시간에 맞춰 들어옵니다(작업 길이는 예시 값).' }]
        .concat(SNAPS.map(function (s) { return { s: s, log: snapLog(s) }; }))
        .concat([{ s: SNAPS[SNAPS.length - 1], log: '정리 — 스레드가 모두 일하는 동안 새 작업은 큐에서 순서를 기다리고(최대 ' + MAX_Q + '개), 스레드가 비면 큐 앞의 작업부터 꺼내 실행합니다.' }]);

    /* ===================== 데이터: 풀 크기 ===================== */
    var CORES  = 4;
    var C_TIME = 1;
    var W_TIME = 3;
    var SIZES  = [2, 4, 8, 16, 32];
    function utilCpu(n) { return Math.min(CORES, n) / CORES; }
    function utilIo(n) { return Math.min(CORES, n * C_TIME / (C_TIME + W_TIME)) / CORES; }
    var NEED_IO = CORES * (C_TIME + W_TIME) / C_TIME;
    function pct(v) { return (Math.round(v * 1000) / 10) + '%'; }

    var SIZE_STEPS = [
        { k: 0, log: 'CPU 코어 ' + CORES + '개에서 풀 크기를 정합니다. 작업이 계산만 하는지, 입출력을 기다리는 시간이 긴지에 따라 알맞은 크기가 달라집니다.' },
        { k: 1, log: 'CPU 바운드 작업(계산만) — 스레드가 ' + CORES + '개면 코어가 모두 찹니다(' + pct(utilCpu(CORES)) + '). 그 이상은 코어를 더 쓰지 못하고 전환 비용만 늘립니다.' },
        { k: 2, log: 'I/O 바운드 작업 — 계산 ' + C_TIME + ' 뒤 입출력 대기 ' + W_TIME + '인 작업이라면 스레드 하나가 CPU를 쓰는 비율은 ' + pct(C_TIME / (C_TIME + W_TIME)) + '뿐입니다. 스레드 ' + CORES + '개의 코어 사용률은 ' + pct(utilIo(CORES)) + '입니다.' },
        { k: 3, log: '코어를 채우려면 코어 수 × (1 + 대기/계산) = ' + CORES + ' × (1 + ' + W_TIME + '/' + C_TIME + ') = ' + NEED_IO + '개 정도가 필요합니다. 대기 시간이 길수록 더 큰 풀이 도움이 됩니다.' },
        { k: 3, log: '정리 — CPU 바운드는 코어 수 안팎, I/O 바운드는 대기 비율만큼 더 크게 잡는 것이 출발점입니다. 최종 크기는 측정으로 정합니다.' }
    ];

    /* ===================== 상태 ===================== */
    var mode    = 'create';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'queue') return QUEUE_STEPS;
        if (mode === 'size') return SIZE_STEPS;
        return CREATE_STEPS;
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

    /* ===================== 모드: 생성 비용 비교 ===================== */
    function drawCreate(x0, top, w, mob, step) {
        var fs = mob ? 10.5 : 12;
        var k  = step ? step.k : 0;
        var bh = mob ? 30 : 36;
        var unit = (w - 2) / MAX_TOTAL;
        var segs = [['create', '생성', P.orange], ['run', '실행', P.teal], ['destroy', '소멸', P.red]];
        var rows = [
            [1, mob ? '요청마다 스레드' : '요청마다 스레드 생성·소멸', PER_REQ, top + 36],
            [2, mob ? '스레드 풀' : '스레드 풀(' + POOL_N + '개 재사용)', POOLED, top + 36 + bh + 64]
        ];
        tx('스레드 시간의 합 (작업 ' + N_TASKS + '개)', x0, top + 10, fs, P.muted + 'ee', 'left', false);
        rows.forEach(function (row) {
            var on = k >= row[0];
            var y = row[3];
            tx(row[1], x0, y - 8, fs, on ? P.text + 'ee' : P.muted + '88', 'left', true);
            if (!on) { rr(x0, y + 4, w - 2, bh, 4, 'none', P.muted + '33', 1); return; }
            var x = x0;
            segs.forEach(function (s) {
                var v = row[2][s[0]];
                if (v <= 0) return;
                rr(x, y + 4, v * unit - 2, bh, 4, s[2] + '30', s[2] + 'cc', 1.4);
                if (v * unit > 26) tx(String(v), x + (v * unit) / 2 - 1, y + 4 + bh / 2, fs, s[2] + 'ee', 'center', true);
                x += v * unit;
            });
            tx('합계 ' + sum3(row[2]), x0, y + bh + 22, fs, P.text + 'ee', 'left', true);
            tx(row[0] === 1 ? '동시 스레드 최대 ' + N_TASKS + '개' : '동시 스레드 최대 ' + POOL_N + '개', x0 + w, y + bh + 22, fs - 0.5, P.muted + 'ee', 'right', false);
        });
        var ly = top + 36 + 2 * bh + 64 + 56;
        var lx = x0;
        segs.forEach(function (s) {
            rr(lx, ly - 6, 12, 12, 3, s[2] + '30', s[2] + 'cc', 1.2);
            tx(s[1], lx + 18, ly, fs - 0.5, P.muted + 'ee', 'left', false);
            lx += mob ? 64 : 80;
        });
    }

    /* ===================== 모드: 작업 큐 ===================== */
    function drawQueue(x0, top, w, mob, step) {
        var fs = mob ? 10.5 : 12;
        var s  = step ? step.s : null;
        var cw = mob ? 30 : 40;
        tx('작업 큐 (대기 중인 작업)', x0, top + 10, fs, P.text + 'ee', 'left', true);
        for (var i = 0; i < 8; i++) {
            var qx = x0 + i * (cw + 6);
            var id = s && s.queue[i] ? s.queue[i] : 0;
            rr(qx, top + 22, cw, 30, 5, id ? P.purple + '30' : 'none', id ? P.purple + 'cc' : P.muted + '33', 1.3);
            if (id) tx('T' + id, qx + cw / 2, top + 37, fs, P.purple + 'ee', 'center', true);
        }
        tx('스레드 풀 (' + WORKERS + '개)', x0, top + 82, fs, P.text + 'ee', 'left', true);
        var bw = Math.min(110, (w - 2 * 12) / WORKERS);
        for (var j = 0; j < WORKERS; j++) {
            var bx = x0 + j * (bw + 12);
            var wid = s ? s.workers[j] : 0;
            rr(bx, top + 94, bw, 50, 6, wid ? P.teal + '30' : 'none', wid ? P.teal + 'cc' : P.muted + '44', 1.5);
            tx('스레드 ' + (j + 1), bx + bw / 2, top + 108, fs - 1.5, P.muted + 'ee', 'center', false);
            tx(wid ? '작업 ' + wid + ' 실행' : '쉬는 중', bx + bw / 2, top + 128, fs, wid ? P.teal + 'ee' : P.muted + '88', 'center', true);
        }
        var doneN = s ? s.done : 0;
        tx('완료 ' + doneN + ' / ' + TASKS.length + (s ? '   (t=' + s.t + ')' : ''), x0, top + 176, fs + 0.5, doneN === TASKS.length ? P.green + 'ee' : P.text + 'ee', 'left', true);
        var pw = w - 2;
        rr(x0, top + 192, pw, 8, 4, 'none', P.muted + '33', 1);
        if (doneN > 0) rr(x0, top + 192, pw * doneN / TASKS.length, 8, 4, P.green + '55', P.green + 'cc', 1);
    }

    /* ===================== 모드: 풀 크기 ===================== */
    function drawSize(x0, top, w, mob, step) {
        var fs = mob ? 10.5 : 12;
        var k  = step ? step.k : 0;
        var lw = mob ? 62 : 84;
        var barX = x0 + lw;
        var maxW = w - lw - (mob ? 46 : 56);
        var bh = mob ? 12 : 14;
        tx('코어 사용률  (코어 ' + CORES + '개)', x0, top + 10, fs, P.text + 'ee', 'left', true);
        var lg = x0 + w;
        tx('I/O 바운드', lg, top + 10, fs - 1, P.orange + 'ee', 'right', true);
        tx('CPU 바운드', lg - (mob ? 70 : 82), top + 10, fs - 1, P.teal + 'ee', 'right', true);
        SIZES.forEach(function (n, i) {
            var y = top + 30 + i * (2 * bh + 16);
            tx('스레드 ' + n, x0, y + bh, fs, P.text + 'ee', 'left', true);
            [[1, utilCpu(n), P.teal], [2, utilIo(n), P.orange]].forEach(function (b, bi) {
                var by = y + bi * (bh + 3);
                rr(barX, by, maxW, bh, 3, 'none', P.muted + '33', 1);
                if (k >= b[0]) {
                    rr(barX, by, Math.max(2, maxW * b[1]), bh, 3, b[2] + '38', b[2] + 'cc', 1.2);
                    tx(pct(b[1]), barX + maxW + 6, by + bh / 2, fs - 1.5, b[2] + 'ee', 'left', true);
                }
            });
        });
        if (k >= 3) {
            var fy = top + 30 + SIZES.length * (2 * bh + 16) + 6;
            tx(CORES + ' × (1 + ' + W_TIME + '/' + C_TIME + ') = ' + NEED_IO + '개 (I/O 바운드 기준)', x0, fy, fs + 0.5, P.yellow + 'ee', 'left', true);
        }
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

        if (mode === 'queue') drawQueue(padX, top, fullW, mob, step);
        else if (mode === 'size') drawSize(padX, top, fullW, mob, step);
        else drawCreate(padX, top, fullW, mob, step);

        if (!step) {
            tx('아래 STEP을 눌러 스레드 풀이 어떻게 동작하는지 확인하세요.', W / 2, GH() - (mob ? 12 : 14), mob ? 11 : 12.5, P.muted + 'aa', 'center', false);
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH;
        if (mode === 'queue') neededH = mob ? 230 : 230;
        else if (mode === 'size') neededH = mob ? 340 : 350;
        else neededH = mob ? 290 : 300;
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
        if (mode === 'queue') return '스레드가 모두 일하는 동안 새 작업이 작업 큐에서 순서를 기다리는 과정을 봅니다.';
        if (mode === 'size') return 'CPU 바운드와 I/O 바운드 작업에서 풀 크기에 따라 코어 사용률이 어떻게 달라지는지 봅니다.';
        return '요청마다 스레드를 만들 때와 스레드 풀을 쓸 때 생성·소멸에 드는 시간을 비교합니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('tp-viz__speed-btn--active'); });
        btn.classList.add('tp-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('tp-viz__mode-btn--active', d.key === m); });
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