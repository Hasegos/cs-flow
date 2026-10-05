/**
 * 컨텍스트 스위칭 시각화
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
    var root    = el('div', 'ctx-viz');
    var toolbar = el('div', 'ctx-viz__toolbar');
    var tbLeft  = el('div', 'ctx-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'ctx-viz__title', 'CONTEXT SWITCH'));

    var modeWrap = el('div', 'ctx-viz__mode');
    var modeDefs = [
        { key: 'state', label: '저장과 복원' },
        { key: 'cost', label: '전환 비용' },
        { key: 'thread', label: '프로세스 vs 스레드' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'ctx-viz__mode-btn' + (i === 0 ? ' ctx-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'ctx-viz__speed');
    speedWrap.appendChild(el('span', 'ctx-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'ctx-viz__speed-btn' + (i === 0 ? ' ctx-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'ctx-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'ctx-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'ctx-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'ctx-viz__controls');
    var btnPlay  = el('button', 'ctx-viz__btn ctx-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'ctx-viz__btn', '▶| STEP');
    var btnReset = el('button', 'ctx-viz__btn', '↺ RESET');
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

    /* ===================== 데이터: 저장과 복원 ===================== */
    var REG_NAMES = ['PC', 'SP', 'R0'];
    var STATE_A = [0x4010, 0x7ff0, 5];
    var STATE_B = [0x8200, 0x6ff0, 9];
    function hx(n) { return '0x' + n.toString(16); }
    function fmtReg(i, v) { return i < 2 ? hx(v) : String(v); }

    var STATE_STEPS = [
        { cpu: STATE_A, a: null, b: STATE_B, run: 'A', log: '프로세스 A가 CPU에서 실행 중입니다. CPU 레지스터에 A의 실행 상태(PC ' + hx(STATE_A[0]) + ', SP ' + hx(STATE_A[1]) + ', R0 ' + STATE_A[2] + ')가 들어 있습니다. B는 이전에 멈춘 상태가 PCB에 저장돼 있습니다(값은 예시).' },
        { cpu: STATE_A, a: null, b: STATE_B, run: 'switch', log: '타이머 인터럽트 — 할당된 시간이 끝났거나 A가 입출력을 기다리게 되면 커널이 개입해 다른 프로세스로 바꿀 준비를 합니다.' },
        { cpu: STATE_A, a: STATE_A, b: STATE_B, run: 'switch', log: '저장 — 커널이 CPU 레지스터의 현재 값을 A의 PCB에 저장합니다. 나중에 PC ' + hx(STATE_A[0]) + '부터 이어서 실행할 수 있어야 하기 때문입니다.' },
        { cpu: STATE_B, a: STATE_A, b: STATE_B, run: 'switch', log: '복원 — 다음에 실행할 B의 PCB에서 저장된 값을 꺼내 CPU 레지스터에 채웁니다. PC가 ' + hx(STATE_B[0]) + '로 바뀝니다.' },
        { cpu: STATE_B, a: STATE_A, b: STATE_B, run: 'B', log: 'B가 멈췄던 지점(PC ' + hx(STATE_B[0]) + ')부터 이어서 실행합니다. 이 과정이 컨텍스트 스위칭이며, A도 나중에 PCB의 값으로 같은 방식으로 이어집니다.' },
        { cpu: STATE_B, a: STATE_A, b: STATE_B, run: 'B', log: '정리 — 컨텍스트 스위칭은 실행 중이던 작업의 상태를 PCB(스레드는 보통 TCB)에 저장하고, 다음 작업의 상태를 복원하는 일입니다. 이 사이에는 사용자 작업이 실행되지 못합니다.' }
    ];

    /* ===================== 데이터: 전환 비용 ===================== */
    var SWITCH_T = 1;
    var WINDOW_T = 33;
    var SLICES = [2, 5, 10];
    function buildTimeline(q) {
        var segs = [];
        var t = 0;
        var useful = 0;
        while (t < WINDOW_T) {
            var run = Math.min(q, WINDOW_T - t);
            segs.push({ kind: 'run', len: run });
            useful += run;
            t += run;
            if (t >= WINDOW_T) break;
            var sw = Math.min(SWITCH_T, WINDOW_T - t);
            segs.push({ kind: 'sw', len: sw });
            t += sw;
        }
        return { q: q, segs: segs, useful: useful };
    }
    var TIMELINES = SLICES.map(buildTimeline);
    function usefulPct(tl) { return Math.round(tl.useful / WINDOW_T * 1000) / 10; }

    var COST_STEPS = [
        { n: 0, log: '시간 ' + WINDOW_T + ' 동안의 CPU를 봅니다. 전환 한 번에 ' + SWITCH_T + '만큼의 시간이 들고 그동안은 사용자 작업이 실행되지 않는다고 가정합니다(설명용 값).' },
        { n: 1, log: '시간 조각 ' + SLICES[0] + ' — 전환이 자주 일어나 사용자 작업을 한 시간이 ' + TIMELINES[0].useful + '/' + WINDOW_T + '(' + usefulPct(TIMELINES[0]) + '%)입니다.' },
        { n: 2, log: '시간 조각 ' + SLICES[1] + ' — 전환 횟수가 줄어 사용자 작업 시간이 ' + TIMELINES[1].useful + '/' + WINDOW_T + '(' + usefulPct(TIMELINES[1]) + '%)입니다.' },
        { n: 3, log: '시간 조각 ' + SLICES[2] + ' — 전환이 드물어 사용자 작업 시간이 ' + TIMELINES[2].useful + '/' + WINDOW_T + '(' + usefulPct(TIMELINES[2]) + '%)입니다.' },
        { n: 3, log: '정리 — 시간 조각이 짧을수록 응답은 빨라지지만 전환 비용의 비율이 커집니다. 길수록 비용은 줄지만 다른 작업이 기다리는 시간이 늘어납니다.' }
    ];

    /* ===================== 데이터: 프로세스 vs 스레드 ===================== */
    var ITEMS = [
        { name: '실행 상태(레지스터, PC) 저장·복원', proc: true, thr: true },
        { name: '커널이 개입해 CPU를 넘김', proc: true, thr: true },
        { name: '주소 공간(페이지 테이블) 전환', proc: true, thr: false },
        { name: 'TLB 내용 무효화 또는 구분 필요', proc: true, thr: false }
    ];
    var PROC_COUNT = ITEMS.filter(function (it) { return it.proc; }).length;
    var THR_COUNT  = ITEMS.filter(function (it) { return it.thr; }).length;

    var THREAD_STEPS = [
        { k: 0, log: '컨텍스트 스위칭이 해야 하는 일을 항목별로 봅니다. 서로 다른 프로세스 사이의 전환과 같은 프로세스 안의 스레드 사이 전환을 비교합니다.' },
        { k: 1, log: '실행 상태 저장·복원 — 두 경우 모두 현재 실행 상태를 저장하고 다음 실행 상태를 복원해야 합니다.' },
        { k: 2, log: '커널 개입 — 두 경우 모두 운영체제가 개입해 CPU를 넘깁니다.' },
        { k: 3, log: '주소 공간 전환 — 다른 프로세스로 바꾸면 페이지 테이블을 바꿔야 합니다. 같은 프로세스의 스레드는 주소 공간을 공유해 필요 없습니다.' },
        { k: 4, log: 'TLB — 주소 공간이 바뀌면 이전 주소 변환 결과가 맞지 않으므로 TLB를 비우거나 주소 공간 식별자로 구분해야 합니다. 스레드 전환에는 이 일이 없습니다.' },
        { k: 4, log: '정리 — 해야 할 일이 프로세스 전환은 ' + PROC_COUNT + '개, 같은 프로세스 안의 스레드 전환은 ' + THR_COUNT + '개라서 스레드 전환이 보통 더 가볍습니다.' }
    ];

    /* ===================== 상태 ===================== */
    var mode    = 'state';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'cost') return COST_STEPS;
        if (mode === 'thread') return THREAD_STEPS;
        return STATE_STEPS;
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

    /* ===================== 공통: 레지스터 박스 ===================== */
    function regBox(x, y, bw, bh, title, vals, col, on, fs, empty) {
        rr(x, y, bw, bh, 6, on ? col + '22' : 'none', on ? col + 'cc' : P.muted + '44', on ? 1.8 : 1.2);
        tx(title, x + 10, y + 14, fs, on ? col + 'ee' : P.muted + 'aa', 'left', true);
        for (var i = 0; i < REG_NAMES.length; i++) {
            var ry = y + 34 + i * 20;
            tx(REG_NAMES[i], x + 12, ry, fs - 0.5, P.muted + 'ee', 'left', false);
            tx(vals ? fmtReg(i, vals[i]) : (empty || '-'), x + bw - 12, ry, fs, vals ? P.text + 'ee' : P.muted + '77', 'right', true);
        }
    }

    /* ===================== 모드: 저장과 복원 ===================== */
    function drawState(x0, top, w, mob, step) {
        var fs = mob ? 10.5 : 12;
        var s  = step || STATE_STEPS[0];
        var gap = mob ? 14 : 28;
        var cw = (w - gap) * 0.46;
        var pw = (w - gap) - cw;
        var bh = 96;
        var run = s.run;
        var cpuCol = run === 'B' ? P.teal : (run === 'switch' ? P.yellow : P.orange);
        var who = run === 'B' ? 'B' : 'A';
        regBox(x0, top + 24, cw, bh, mob ? 'CPU' : 'CPU 레지스터', s.cpu, cpuCol, true, fs, '');
        tx(run === 'switch' ? '커널이 전환 중' : '프로세스 ' + who + ' 실행 중', x0, top + 12, fs - 0.5, cpuCol + 'ee', 'left', true);
        var px = x0 + cw + gap;
        regBox(px, top + 6, pw, bh, 'PCB A', s.a, P.orange, !!s.a && s.run === 'switch' && s.cpu === STATE_A, fs, '(비어 있음)');
        regBox(px, top + 6 + bh + 14, pw, bh, 'PCB B', s.b, P.teal, s.cpu === STATE_B && s.run === 'switch', fs, '(비어 있음)');
        var ay = top + 24 + bh / 2;
        if (s.a && s.run === 'switch' && s.cpu === STATE_A) tx(mob ? '▶' : '저장 ▶', x0 + cw + gap / 2, top + 40, fs - 1.5, P.orange + 'ee', 'center', true);
        if (s.run === 'switch' && s.cpu === STATE_B) tx(mob ? '◀' : '◀ 복원', x0 + cw + gap / 2, top + 6 + bh + 40, fs - 1.5, P.teal + 'ee', 'center', true);
    }

    /* ===================== 모드: 전환 비용 ===================== */
    function drawCost(x0, top, w, mob, step) {
        var fs = mob ? 10.5 : 12;
        var n  = step ? step.n : 0;
        var unit = (w - 2) / WINDOW_T;
        var bh = mob ? 26 : 30;
        tx(mob ? '주황 사용자 작업 · 빨강 전환' : '시간 ' + WINDOW_T + ' 동안의 CPU  (주황 = 사용자 작업, 빨강 = 전환)', x0, top + 8, fs - 0.5, P.muted + 'ee', 'left', false);
        TIMELINES.forEach(function (tl, i) {
            var y = top + 38 + i * (bh + 46);
            var on = n >= i + 1;
            tx('시간 조각 ' + tl.q, x0, y - 6, fs, on ? P.text + 'ee' : P.muted + '88', 'left', true);
            if (!on) { rr(x0, y + 4, w - 2, bh, 4, 'none', P.muted + '33', 1); return; }
            var x = x0;
            tl.segs.forEach(function (sg) {
                var col = sg.kind === 'run' ? P.orange : P.red;
                rr(x, y + 4, Math.max(1.5, sg.len * unit - 1.5), bh, 2, col + (sg.kind === 'run' ? '30' : '66'), col + 'cc', 1);
                x += sg.len * unit;
            });
            tx('사용자 작업 ' + tl.useful + '/' + WINDOW_T + ' (' + usefulPct(tl) + '%)', x0 + w, y - 6, fs - 0.5, P.green + 'ee', 'right', true);
        });
    }

    /* ===================== 모드: 프로세스 vs 스레드 ===================== */
    function drawThread(x0, top, w, mob, step) {
        var fs = mob ? 10.5 : 12;
        var k  = step ? step.k : 0;
        var nameW = w - (mob ? 92 : 150);
        var cx = [x0 + nameW + (mob ? 14 : 28), x0 + nameW + (mob ? 56 : 100)];
        tx('해야 할 일', x0, top + 12, fs, P.text + 'ee', 'left', true);
        tx(mob ? '프로세스' : '프로세스 전환', cx[0], top + 12, fs - 1.5, P.orange + 'ee', 'center', true);
        tx(mob ? '스레드' : '스레드 전환', cx[1], top + 12, fs - 1.5, P.teal + 'ee', 'center', true);
        ITEMS.forEach(function (it, i) {
            var y = top + 36 + i * (mob ? 46 : 40);
            var on = k > i;
            rr(x0, y, w - 2, mob ? 38 : 32, 5, on ? P.muted + '14' : 'none', on ? P.muted + '55' : P.muted + '30', 1);
            tx(it.name, x0 + 10, y + (mob ? 19 : 16), fs - (mob ? 1.5 : 0.5), on ? P.text + 'ee' : P.muted + '88', 'left', true);
            if (on) {
                tx(it.proc ? '필요' : '-', cx[0], y + (mob ? 19 : 16), fs, it.proc ? P.orange + 'ee' : P.muted + '88', 'center', true);
                tx(it.thr ? '필요' : '필요 없음', cx[1], y + (mob ? 19 : 16), fs - (it.thr ? 0 : 1.5), it.thr ? P.teal + 'ee' : P.green + 'ee', 'center', true);
            }
        });
        if (k >= 5) {
            var by = top + 36 + ITEMS.length * (mob ? 46 : 40) + 12;
            var bw = w - 2;
            tx('해야 할 일의 수', x0, by, fs, P.text + 'ee', 'left', true);
            [[PROC_COUNT, P.orange, '프로세스 전환'], [THR_COUNT, P.teal, '스레드 전환']].forEach(function (b, bi) {
                var yy = by + 12 + bi * 26;
                rr(x0, yy, bw * 0.7, 18, 4, 'none', P.muted + '33', 1);
                rr(x0, yy, bw * 0.7 * b[0] / ITEMS.length, 18, 4, b[1] + '30', b[1] + 'cc', 1.3);
                tx(b[2] + ' ' + b[0] + '개', x0 + bw * 0.7 + 8, yy + 9, fs - 1, b[1] + 'ee', 'left', true);
            });
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

        if (mode === 'cost') drawCost(padX, top, fullW, mob, step);
        else if (mode === 'thread') drawThread(padX, top, fullW, mob, step);
        else drawState(padX, top, fullW, mob, step);

        if (!step) {
            tx('아래 STEP을 눌러 컨텍스트 스위칭의 과정을 확인하세요.', W / 2, GH() - (mob ? 12 : 14), mob ? 11 : 12.5, P.muted + 'aa', 'center', false);
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH;
        if (mode === 'cost') neededH = mob ? 260 : 270;
        else if (mode === 'thread') neededH = mob ? 340 : 330;
        else neededH = mob ? 270 : 270;
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
        if (mode === 'cost') return '시간 조각 길이에 따라 전환 비용이 CPU 시간에서 차지하는 비율이 어떻게 달라지는지 봅니다.';
        if (mode === 'thread') return '프로세스 사이 전환과 같은 프로세스 안의 스레드 사이 전환이 해야 하는 일을 비교합니다.';
        return '실행 중이던 프로세스의 상태를 PCB에 저장하고 다음 프로세스의 상태를 복원하는 과정을 봅니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('ctx-viz__speed-btn--active'); });
        btn.classList.add('ctx-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('ctx-viz__mode-btn--active', d.key === m); });
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