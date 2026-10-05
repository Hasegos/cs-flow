/**
 * cgroups / namespace 시각화
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
    var root    = el('div', 'ns-viz');
    var toolbar = el('div', 'ns-viz__toolbar');
    var tbLeft  = el('div', 'ns-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'ns-viz__title', 'NAMESPACE CGROUPS'));

    var modeWrap = el('div', 'ns-viz__mode');
    var modeDefs = [
        { key: 'pid', label: 'namespace' },
        { key: 'cg', label: 'cgroups' },
        { key: 'compose', label: '컨테이너의 조합' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'ns-viz__mode-btn' + (i === 0 ? ' ns-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'ns-viz__speed');
    speedWrap.appendChild(el('span', 'ns-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'ns-viz__speed-btn' + (i === 0 ? ' ns-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'ns-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'ns-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'ns-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'ns-viz__controls');
    var btnPlay  = el('button', 'ns-viz__btn ns-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'ns-viz__btn', '▶| STEP');
    var btnReset = el('button', 'ns-viz__btn', '↺ RESET');
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

    /* ===================== 데이터: namespace ===================== */
    var PROCS = [
        { h: 1,    n: 'systemd', ns: 'host' },
        { h: 412,  n: 'sshd',    ns: 'host' },
        { h: 3001, n: 'app',     ns: 'A' },
        { h: 3002, n: 'worker',  ns: 'A' },
        { h: 3101, n: 'db',      ns: 'B' },
        { h: 3102, n: 'cache',   ns: 'B' }
    ];
    function inNs(ns) { return PROCS.filter(function (p) { return p.ns === ns; }); }
    function nsPid(p) { return inNs(p.ns).indexOf(p) + 1; }
    var A_FIRST = inNs('A')[0];
    var B_FIRST = inNs('B')[0];

    var PID_STEPS = [
        { k: 0, log: '호스트에서 본 프로세스 목록입니다. 컨테이너 A와 B의 프로세스도 모두 호스트 PID(' + A_FIRST.h + ', ' + inNs('A')[1].h + ', ' + B_FIRST.h + ', ' + inNs('B')[1].h + ')를 가진 일반 프로세스로 보입니다.' },
        { k: 1, log: '컨테이너 A에 PID namespace를 만들면 A 안에서는 자기 프로세스 ' + inNs('A').length + '개만 보이고, 첫 프로세스(' + A_FIRST.n + ')의 PID가 ' + nsPid(A_FIRST) + '로 매겨집니다. 호스트에서는 같은 프로세스가 PID ' + A_FIRST.h + '입니다.' },
        { k: 2, log: '컨테이너 B도 자기 PID namespace를 가져 첫 프로세스(' + B_FIRST.n + ')가 PID ' + nsPid(B_FIRST) + '입니다. A와 B에 PID ' + nsPid(A_FIRST) + '이 각각 있어도 서로 다른 namespace라 충돌하지 않습니다.' },
        { k: 3, log: '정리 — namespace는 프로세스가 볼 수 있는 시스템 자원의 범위를 나눕니다. PID뿐 아니라 마운트, 네트워크, 호스트명 등도 namespace별로 분리할 수 있습니다.' }
    ];

    /* ===================== 데이터: cgroups ===================== */
    var MEM_LIMIT = 512;
    var ALLOC = 128;
    var CPU_QUOTA = 50000;
    var CPU_PERIOD = 100000;
    var CPU_ALLOWED = CPU_QUOTA / CPU_PERIOD;
    var CPU_DEMAND = 1;
    function cpuGot(d) { return Math.min(d, CPU_ALLOWED); }
    function pct(v) { return Math.round(v * 100) + '%'; }

    var CG_STEPS = [
        { k: 0, mem: 0, log: '프로세스 그룹에 cgroup을 만들어 메모리 상한 ' + MEM_LIMIT + 'MB와 CPU 상한을 겁니다(값은 예시). cgroups는 "얼마나 쓸 수 있는가"를 제한하고 측정합니다.' },
        { k: 1, mem: 2 * ALLOC, log: '그룹의 프로세스가 메모리를 ' + (2 * ALLOC) + 'MB 쓰고 있습니다. 상한 ' + MEM_LIMIT + 'MB의 ' + pct(2 * ALLOC / MEM_LIMIT) + '입니다.' },
        { k: 1, mem: MEM_LIMIT, log: '사용량이 ' + MEM_LIMIT + 'MB로 상한에 닿았습니다. 상한에 가까워지면 커널이 그 그룹의 메모리를 회수하려고 합니다.' },
        { k: 1, mem: MEM_LIMIT + ALLOC, oom: true, log: '그룹이 ' + ALLOC + 'MB를 더 요청합니다. 회수로도 해결되지 않으면 상한을 넘은 그룹 안에서 OOM killer가 프로세스를 종료합니다. 종료 대상은 그 그룹 안에서 고르므로 다른 그룹의 프로세스는 보통 영향받지 않습니다.' },
        { k: 2, mem: MEM_LIMIT, cpu: true, log: 'CPU — 그룹의 상한이 ' + CPU_PERIOD + 'µs 주기마다 ' + CPU_QUOTA + 'µs(' + pct(CPU_ALLOWED) + ')라면, CPU를 ' + pct(CPU_DEMAND) + ' 쓰려는 프로세스도 ' + pct(cpuGot(CPU_DEMAND)) + '까지만 실행되고 나머지는 다음 주기까지 멈춥니다(throttling).' },
        { k: 2, mem: MEM_LIMIT, cpu: true, log: '정리 — cgroups는 그룹 단위로 CPU, 메모리, I/O 같은 자원의 사용량을 제한하고 측정합니다. 한 컨테이너가 호스트 자원을 독점하지 못하게 합니다.' }
    ];

    /* ===================== 데이터: 컨테이너의 조합 ===================== */
    var LAYERS = [
        { name: '프로세스', col: 'orange', desc: '평범한 프로세스입니다. 호스트의 모든 프로세스와 같은 시야를 갖습니다.' },
        { name: 'PID namespace', col: 'teal', desc: 'PID namespace — 자기 프로세스만 보이고 첫 프로세스가 PID 1이 됩니다.' },
        { name: 'Mount namespace', col: 'purple', desc: 'Mount namespace — 자기만의 파일 시스템 마운트(루트)를 봅니다. 컨테이너 이미지가 이 루트가 됩니다.' },
        { name: 'Network namespace', col: 'green', desc: 'Network namespace — 자기만의 네트워크 인터페이스, IP, 포트 공간을 갖습니다.' },
        { name: 'cgroups', col: 'yellow', desc: 'cgroups — CPU, 메모리 등 쓸 수 있는 자원의 상한을 정합니다. 앞의 namespace들은 "보이는 범위", cgroups는 "쓰는 양"을 다룹니다.' }
    ];
    var COMPOSE_STEPS = LAYERS.map(function (l, i) { return { k: i + 1, log: l.desc }; })
        .concat([{ k: LAYERS.length, done: true, log: '정리 — 컨테이너는 별도의 커널 기능이 아니라 호스트 커널의 namespace(보이는 범위)와 cgroups(자원 상한) 같은 기능을 조합해 프로세스를 격리한 것입니다.' }]);

    /* ===================== 상태 ===================== */
    var mode    = 'pid';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'cg') return CG_STEPS;
        if (mode === 'compose') return COMPOSE_STEPS;
        return PID_STEPS;
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

    /* ===================== 공통: 선 ===================== */
    function ln(x1, y1, x2, y2, col, lw) {
        ctx.strokeStyle = col;
        ctx.lineWidth = lw || 1.4;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    /* ===================== 모드: namespace ===================== */
    function drawPid(x0, top, w, mob, step) {
        var fs = mob ? 10 : 11.5;
        var k = step ? step.k : 0;
        var rh = 24;
        var hw = w * 0.5;
        var gx = x0 + hw + (mob ? 22 : 40);
        var gw = w - hw - (mob ? 22 : 40);
        tx('호스트에서 본 프로세스', x0, top + 12, fs, P.text + 'ee', 'left', true);
        var rowY = [];
        PROCS.forEach(function (p, i) {
            var y = top + 28 + i * (rh + 4);
            rowY.push(y);
            var col = p.ns === 'A' ? P.orange : (p.ns === 'B' ? P.teal : P.muted);
            rr(x0, y, hw, rh, 4, col + '1c', col + 'aa', 1.2);
            tx('PID ' + p.h + '  ' + p.n, x0 + 8, y + rh / 2, fs, P.text + 'ee', 'left', true);
        });
        var panels = [['A', P.orange, 1, top + 28], ['B', P.teal, 2, top + 28 + 2 * (rh + 4) + 44]];
        panels.forEach(function (pn) {
            var on = k >= pn[2];
            tx('컨테이너 ' + pn[0] + ' 안', gx, pn[3] - 12 + 4, fs - 0.5, on ? pn[1] + 'ee' : P.muted + '77', 'left', true);
            inNs(pn[0]).forEach(function (p, i) {
                var y = pn[3] + 6 + i * (rh + 4);
                rr(gx, y, gw, rh, 4, on ? pn[1] + '24' : 'none', on ? pn[1] + 'cc' : P.muted + '33', 1.3);
                if (on) {
                    tx('PID ' + nsPid(p) + '  ' + p.n, gx + 6, y + rh / 2, fs - 0.5, P.text + 'ee', 'left', true);
                    if (k >= 3) ln(x0 + hw, rowY[PROCS.indexOf(p)] + rh / 2, gx, y + rh / 2, pn[1] + '88', 1.2);
                }
            });
        });
    }

    /* ===================== 모드: cgroups ===================== */
    function drawCg(x0, top, w, mob, step) {
        var fs = mob ? 10.5 : 12;
        var mem = step ? step.mem : 0;
        var oom = step ? !!step.oom : false;
        var k = step ? step.k : 0;
        var barH = mob ? 30 : 34;
        var lw = 0;
        tx('메모리 (상한 ' + MEM_LIMIT + 'MB)', x0, top + 12, fs, P.text + 'ee', 'left', true);
        var maxW = w - 2 - (mob ? 80 : 100);
        var scale = maxW / (MEM_LIMIT + ALLOC);
        var by = top + 24;
        rr(x0, by, maxW, barH, 4, 'none', P.muted + '33', 1);
        var used = Math.min(mem, MEM_LIMIT);
        if (used > 0) rr(x0, by, used * scale, barH, 4, (used >= MEM_LIMIT ? P.orange : P.teal) + '30', (used >= MEM_LIMIT ? P.orange : P.teal) + 'cc', 1.5);
        var limX = x0 + MEM_LIMIT * scale;
        ln(limX, by - 6, limX, by + barH + 6, P.yellow + 'ee', 2);
        tx('상한', limX, by + barH + 18, fs - 1.5, P.yellow + 'ee', 'center', true);
        if (oom) {
            rr(limX, by, ALLOC * scale, barH, 4, P.red + '38', P.red + 'ee', 1.8);
            tx('OOM', limX + ALLOC * scale / 2, by + barH / 2, fs - 1, P.red + 'ee', 'center', true);
        }
        tx((oom ? MEM_LIMIT + ALLOC : mem) + 'MB', x0 + maxW + 8, by + barH / 2, fs, oom ? P.red + 'ee' : P.text + 'ee', 'left', true);
        if (oom) tx('그룹 안에서 프로세스 종료 (다른 그룹은 보통 무사)', x0, by + barH + 42, fs - 0.5, P.red + 'ee', 'left', true);

        var cy = top + 148;
        tx('CPU (' + CPU_QUOTA + 'µs / ' + CPU_PERIOD + 'µs 주기)', x0, cy, fs, k >= 2 ? P.text + 'ee' : P.muted + '88', 'left', true);
        var rows = [['요구', CPU_DEMAND, P.orange], ['실행됨', cpuGot(CPU_DEMAND), P.teal]];
        rows.forEach(function (r, i) {
            var y = cy + 14 + i * (barH * 0.8 + 6);
            var hh = barH * 0.8;
            rr(x0, y, maxW, hh, 4, 'none', P.muted + '33', 1);
            if (k >= 2) {
                rr(x0, y, maxW * r[1], hh, 4, r[2] + '30', r[2] + 'cc', 1.4);
                tx(r[0] + ' ' + pct(r[1]), x0 + maxW * r[1] + 8, y + hh / 2, fs - 1, r[2] + 'ee', 'left', true);
            }
        });
    }

    /* ===================== 모드: 컨테이너의 조합 ===================== */
    function drawCompose(x0, top, w, mob, step) {
        var fs = mob ? 10 : 11.5;
        var k = step ? step.k : 0;
        var colMap = { orange: P.orange, teal: P.teal, purple: P.purple, green: P.green, yellow: P.yellow };
        var pad = mob ? 18 : 22;
        var totalH = 250;
        var n = LAYERS.length;
        for (var i = n - 1; i >= 0; i--) {
            var on = k >= i + 1;
            var shrink = (n - 1 - i) * pad;
            var rx = x0 + shrink;
            var ry = top + 6 + shrink;
            var rw = w - 2 * shrink;
            var rh = totalH - 2 * shrink;
            var c = colMap[LAYERS[i].col];
            rr(rx, ry, rw, rh, 8, on ? c + '14' : 'none', on ? c + 'cc' : P.muted + '22', on ? 1.6 : 1);
            if (on) tx(LAYERS[i].name, rx + 8, ry + 12, fs - (mob ? 1 : 0), c + 'ee', 'left', true);
        }
        tx('컨테이너 속 프로세스', x0 + w / 2, top + 6 + totalH / 2 + 8, fs + 0.5, P.orange + 'ee', 'center', true);
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

        if (mode === 'cg') drawCg(padX, top, fullW, mob, step);
        else if (mode === 'compose') drawCompose(padX, top, fullW, mob, step);
        else drawPid(padX, top, fullW, mob, step);

        if (!step) {
            tx('아래 STEP을 눌러 namespace와 cgroups가 하는 일을 확인하세요.', W / 2, GH() - (mob ? 12 : 14), mob ? 11 : 12.5, P.muted + 'aa', 'center', false);
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH;
        if (mode === 'cg') neededH = mob ? 270 : 280;
        else if (mode === 'compose') neededH = mob ? 280 : 280;
        else neededH = mob ? 290 : 290;
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
        if (mode === 'cg') return 'cgroups가 프로세스 그룹의 메모리와 CPU 사용량을 제한하는 방식을 봅니다.';
        if (mode === 'compose') return '일반 프로세스에 namespace와 cgroups를 하나씩 더해 컨테이너가 되는 과정을 봅니다.';
        return 'PID namespace가 컨테이너마다 프로세스 번호와 보이는 범위를 분리하는 모습을 봅니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('ns-viz__speed-btn--active'); });
        btn.classList.add('ns-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('ns-viz__mode-btn--active', d.key === m); });
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