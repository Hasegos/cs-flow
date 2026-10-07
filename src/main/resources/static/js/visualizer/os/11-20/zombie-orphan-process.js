/**
 * 좀비 / 고아 프로세스 시각화
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
    var root    = el('div', 'zo-viz');
    var toolbar = el('div', 'zo-viz__toolbar');
    var tbLeft  = el('div', 'zo-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'zo-viz__title', 'PROCESS TABLE'));

    var modeWrap = el('div', 'zo-viz__mode');
    var modeDefs = [
        { key: 'zombie', label: '좀비 프로세스' },
        { key: 'orphan', label: '고아 프로세스' },
        { key: 'pile', label: '좀비 누적' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'zo-viz__mode-btn' + (i === 0 ? ' zo-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'zo-viz__speed');
    speedWrap.appendChild(el('span', 'zo-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'zo-viz__speed-btn' + (i === 0 ? ' zo-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'zo-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'zo-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'zo-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'zo-viz__controls');
    var btnPlay  = el('button', 'zo-viz__btn zo-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'zo-viz__btn', '▶| STEP');
    var btnReset = el('button', 'zo-viz__btn', '↺ RESET');
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

    /* ===================== 데이터: 프로세스 테이블 ===================== */
    var INIT = { pid: 1, ppid: 0, st: 'S', n: 'init (systemd)' };
    function row(pid, ppid, st, n) { return { pid: pid, ppid: ppid, st: st, n: n }; }
    var P_PID = 200;
    var C_PID = 201;
    var STATE_LABEL = { R: '실행 중', S: '대기', Z: '좀비' };

    /* ===================== 데이터: 좀비 프로세스 ===================== */
    var ZOMBIE_STEPS = [
        { rows: [INIT, row(P_PID, 50, 'R', '부모'), row(C_PID, P_PID, 'R', '자식')], hl: -1, log: '부모(PID ' + P_PID + ')가 fork로 자식(PID ' + C_PID + ')을 만들었습니다. 커널은 두 프로세스를 프로세스 테이블에 기록합니다.' },
        { rows: [INIT, row(P_PID, 50, 'R', '부모'), row(C_PID, P_PID, 'Z', '자식')], hl: 2, log: '자식이 exit으로 종료했습니다. 메모리 같은 자원은 반납되지만, 부모가 종료 상태를 읽어 갈 수 있도록 커널이 PID와 종료 상태 항목을 프로세스 테이블에 남겨 둡니다. 이 상태가 좀비(Z)입니다.' },
        { rows: [INIT, row(P_PID, 50, 'R', '부모'), row(C_PID, P_PID, 'Z', '자식')], hl: 2, log: '부모가 다른 일을 하느라 wait()를 부르지 않으면 좀비는 그대로 남습니다. ps에는 defunct로 보이고, 이미 끝난 프로세스라 kill로 신호를 보내도 없어지지 않습니다.' },
        { rows: [INIT, row(P_PID, 50, 'R', '부모')], hl: -1, log: '부모가 wait() 또는 waitpid()를 호출하면 자식의 종료 상태를 받아 가고, 커널이 좀비의 프로세스 테이블 항목을 지웁니다.' },
        { rows: [INIT, row(P_PID, 50, 'R', '부모')], hl: -1, log: '정리 — 좀비는 실행 중인 프로세스가 아니라, 부모가 종료 상태를 회수하기를 기다리는 기록입니다. 없애려면 부모가 회수하거나 부모가 종료되어야 합니다.' }
    ];

    /* ===================== 데이터: 고아 프로세스 ===================== */
    var ORPHAN_STEPS = [
        { rows: [INIT, row(P_PID, 50, 'R', '부모'), row(C_PID, P_PID, 'R', '자식')], hl: -1, log: '부모(PID ' + P_PID + ')와 자식(PID ' + C_PID + ')이 실행 중입니다.' },
        { rows: [INIT, row(C_PID, P_PID, 'R', '자식')], hl: 1, log: '부모가 자식보다 먼저 종료했습니다. 자식은 아직 실행 중이지만 PPID가 가리키던 부모(' + P_PID + ')가 없어졌습니다. 이 자식이 고아 프로세스입니다.' },
        { rows: [INIT, row(C_PID, 1, 'R', '자식')], hl: 1, log: '커널이 고아의 부모를 init(PID 1, 현대 리눅스에서는 보통 systemd)으로 바꿉니다. PPID가 ' + P_PID + '에서 1이 되었고, 자식은 계속 실행됩니다.' },
        { rows: [INIT, row(C_PID, 1, 'Z', '자식')], hl: 1, log: '자식이 종료하면 잠시 좀비 상태가 되지만, 부모가 된 init이 종료 상태를 회수합니다.' },
        { rows: [INIT], hl: -1, log: '정리 — 고아 프로세스는 init이 입양해 종료될 때 회수해 주므로 좀비로 남지 않습니다. 고아는 문제가 아니라 정상적으로 처리되는 상태입니다.' }
    ];

    /* ===================== 데이터: 좀비 누적 ===================== */
    var CAP = 8;
    var FIXED = 2;
    var FREE = CAP - FIXED;
    var PILE_COUNTS = [0, 1, 3, FREE];
    var PILE_STEPS = [{ z: 0, log: '프로세스 테이블에 넣을 수 있는 항목 수는 한정되어 있습니다(설명을 위해 ' + CAP + '칸으로 가정). 부모가 wait()를 호출하지 않고 자식을 계속 만들고 종료시킵니다.' }]
        .concat(PILE_COUNTS.slice(1).map(function (c) {
            return { z: c, log: '자식이 ' + c + '개 종료됐지만 회수되지 않아 좀비 ' + c + '개가 테이블 ' + c + '칸을 차지합니다.' + (c === FREE ? ' 남은 칸이 없습니다(' + (FIXED + c) + '/' + CAP + ').' : '') };
        }))
        .concat([{ z: FREE, fail: true, log: '테이블이 가득 차면 새 프로세스를 만들 수 없어 fork가 실패합니다. 이 호스트에서는 다른 프로그램도 새 프로세스를 못 만들게 됩니다.' }])
        .concat([{ z: 0, reaped: true, log: '부모가 wait()로 좀비를 회수하거나 부모가 종료되면 좀비 항목이 사라지고 칸이 비워집니다. 자식이 끝날 때마다 회수하는 것이 해결책입니다.' }]);

    /* ===================== 상태 ===================== */
    var mode    = 'zombie';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'orphan') return ORPHAN_STEPS;
        if (mode === 'pile') return PILE_STEPS;
        return ZOMBIE_STEPS;
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

    /* ===================== 모드: 프로세스 테이블 ===================== */
    function drawTable(x0, top, w, mob, step) {
        var fs = mob ? 10.5 : 12;
        var rows = step ? step.rows : [];
        var hl = step ? step.hl : -1;
        var rh = mob ? 32 : 36;
        var c = [x0 + 8, x0 + w * 0.2, x0 + w * 0.38, x0 + w * 0.6];
        tx('PID', c[0], top + 12, fs - 1, P.muted + 'ee', 'left', true);
        tx('PPID', c[1], top + 12, fs - 1, P.muted + 'ee', 'left', true);
        tx('상태', c[2], top + 12, fs - 1, P.muted + 'ee', 'left', true);
        tx('프로세스', c[3], top + 12, fs - 1, P.muted + 'ee', 'left', true);
        rows.forEach(function (r, i) {
            var y = top + 24 + i * (rh + 6);
            var zom = r.st === 'Z';
            var col = zom ? P.red : (r.pid === 1 ? P.purple : P.teal);
            var hot = i === hl;
            rr(x0, y, w - 2, rh, 5, col + (hot ? '34' : '1c'), col + (hot ? 'ff' : 'aa'), hot ? 2 : 1.3);
            tx(String(r.pid), c[0], y + rh / 2, fs, P.text + 'ee', 'left', true);
            tx(String(r.ppid), c[1], y + rh / 2, fs, r.ppid === 1 && r.pid !== 1 ? P.yellow + 'ee' : P.text + 'ee', 'left', true);
            tx(STATE_LABEL[r.st], c[2], y + rh / 2, fs - 0.5, col + 'ee', 'left', true);
            tx(r.n, c[3], y + rh / 2, fs - 0.5, P.text + 'ee', 'left', false);
        });
    }

    /* ===================== 모드: 좀비 누적 ===================== */
    function drawPile(x0, top, w, mob, step) {
        var fs = mob ? 10.5 : 12;
        var z = step ? step.z : 0;
        var fail = step ? !!step.fail : false;
        var gap = 6;
        var perRow = 4;
        var cw = (w - gap * (perRow - 1)) / perRow;
        var ch = mob ? 44 : 50;
        tx('프로세스 테이블 (' + CAP + '칸 가정)', x0, top + 12, fs, P.text + 'ee', 'left', true);
        for (var i = 0; i < CAP; i++) {
            var gx = x0 + (i % perRow) * (cw + gap);
            var gy = top + 28 + Math.floor(i / perRow) * (ch + gap);
            var label = '';
            var col = P.muted;
            if (i === 0) { label = 'init'; col = P.purple; }
            else if (i === 1) { label = '부모'; col = P.teal; }
            else if (i - FIXED < z) { label = '좀비'; col = P.red; }
            var on = label !== '';
            rr(gx, gy, cw, ch, 5, on ? col + '24' : 'none', on ? col + 'cc' : P.muted + '44', on ? 1.6 : 1.2);
            if (on) tx(label, gx + cw / 2, gy + ch / 2, fs, col + 'ee', 'center', true);
        }
        var used = FIXED + z;
        var by = top + 28 + 2 * (ch + gap) + 14;
        tx('사용 ' + used + ' / ' + CAP, x0, by, fs + 0.5, used >= CAP ? P.red + 'ee' : P.text + 'ee', 'left', true);
        if (fail) tx('fork 실패: 더 만들 수 없음', x0 + w, by, fs, P.red + 'ee', 'right', true);
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

        if (mode === 'pile') drawPile(padX, top, fullW, mob, step);
        else drawTable(padX, top, fullW, mob, step);

        if (!step) {
            var hint = '아래 STEP으로 좀비와 고아의 차이를 확인하세요.';
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
        if (mode === 'pile') neededH = mob ? 230 : 240;
        else neededH = mob ? 210 : 220;
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
        if (mode === 'orphan') return '부모가 먼저 종료되었을 때 자식이 init에게 입양되는 과정을 봅니다.';
        if (mode === 'pile') return '부모가 종료 상태를 회수하지 않을 때 좀비가 프로세스 테이블을 채우는 모습을 봅니다.';
        return '자식이 종료했는데 부모가 회수하지 않을 때 좀비가 되는 과정을 봅니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('zo-viz__speed-btn--active'); });
        btn.classList.add('zo-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('zo-viz__mode-btn--active', d.key === m); });
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