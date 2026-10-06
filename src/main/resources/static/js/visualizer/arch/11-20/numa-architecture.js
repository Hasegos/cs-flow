/**
 * NUMA 아키텍처 시각화
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
    var root    = el('div', 'numa-viz');
    var toolbar = el('div', 'numa-viz__toolbar');
    var tbLeft  = el('div', 'numa-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'numa-viz__title', 'NUMA ENGINE'));

    var modeWrap = el('div', 'numa-viz__mode');
    var modeDefs = [
        { key: 'arch', label: 'UMA vs NUMA' },
        { key: 'cost', label: '로컬 vs 원격 비용' },
        { key: 'policy', label: '배치와 이동' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'numa-viz__mode-btn' + (i === 0 ? ' numa-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'numa-viz__speed');
    speedWrap.appendChild(el('span', 'numa-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'numa-viz__speed-btn' + (i === 0 ? ' numa-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'numa-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'numa-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'numa-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'numa-viz__controls');
    var btnPlay  = el('button', 'numa-viz__btn numa-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'numa-viz__btn', '▶| STEP');
    var btnReset = el('button', 'numa-viz__btn', '↺ RESET');
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

    /* ===================== 데이터: UMA vs NUMA ===================== */
    var LOCAL  = 10;
    var REMOTE = 21;
    var ACC    = 100;

    var ARCH_STEPS = [
        { a: 'uma', hl: '', log: 'UMA(균일 메모리 접근) — 모든 CPU가 하나의 메모리를 같은 경로로 씁니다. 어느 CPU가 어느 주소를 읽든 접근 시간이 같습니다.' },
        { a: 'uma', hl: 'bus', log: 'CPU가 늘어나면 모두 같은 버스와 메모리 컨트롤러를 나눠 써서 경쟁이 심해집니다. 이 병목이 UMA 확장의 한계입니다.' },
        { a: 'numa', hl: '', log: 'NUMA — 메모리를 여러 개로 나눠 각 CPU(소켓)에 직접 붙입니다. CPU와 그 CPU에 붙은 메모리를 묶어 노드라고 부릅니다.' },
        { a: 'numa', hl: 'local', log: '로컬 접근 — 노드 0의 CPU가 노드 0의 메모리를 읽습니다. 경로가 짧아 지연이 가장 짧습니다(예시 거리 ' + LOCAL + ').' },
        { a: 'numa', hl: 'remote', log: '원격 접근 — 노드 0의 CPU가 노드 1의 메모리를 읽으면 인터커넥트를 거쳐 상대 노드의 메모리까지 가야 합니다(예시 거리 ' + REMOTE + ').' },
        { a: 'numa', hl: '', log: '정리 — 접근 시간이 어느 메모리인지에 따라 달라서 "불균일(Non-Uniform)"입니다. 대신 CPU마다 자기 메모리를 가져, 접근이 분산되면 대역폭이 노드 수만큼 늘어날 수 있습니다.' }
    ];

    /* ===================== 데이터: 로컬 vs 원격 비용 ===================== */
    var COST_LOCAL  = ACC * LOCAL;
    var COST_REMOTE = ACC * REMOTE;
    var COST_STEPS = [
        { loc: false, rem: false, log: '노드 0의 스레드가 같은 데이터를 ' + ACC + '번 읽는다고 가정합니다. 데이터가 로컬 메모리에 있을 때와 원격 메모리에 있을 때 걸리는 총 거리를 비교합니다.' },
        { loc: true, rem: false, log: '로컬 메모리 — 접근 1회의 거리 ' + LOCAL + ' × ' + ACC + '회 = ' + COST_LOCAL + '입니다.' },
        { loc: true, rem: true, log: '원격 메모리 — 접근 1회의 거리 ' + REMOTE + ' × ' + ACC + '회 = ' + COST_REMOTE + '입니다.' },
        { loc: true, rem: true, log: '정리 — 같은 작업이 원격에서는 ' + (COST_REMOTE / COST_LOCAL).toFixed(1) + '배의 거리를 지납니다. 예시 값이며 실제 비율은 하드웨어마다 다르므로 numactl --hardware 같은 도구로 확인합니다.' }
    ];

    /* ===================== 데이터: 배치와 이동 ===================== */
    var POLICY_STEPS = [
        { t: 0, pages: null, tag: '', log: '스레드 T가 노드 0에서 실행됩니다. T가 쓸 데이터 D(페이지 4개)는 아직 할당되지 않았습니다.' },
        { t: 0, pages: [0, 0, 0, 0], tag: '처음 접근한 노드에 배치', log: '첫 접근(first touch) — T가 D를 처음 쓰는 순간 페이지가 T가 있는 노드 0의 메모리에 놓입니다. 리눅스의 기본 정책은 요청한 CPU의 노드에 할당하는 것입니다.' },
        { t: 1, pages: [0, 0, 0, 0], tag: '스레드만 이동', log: '스케줄러가 T를 노드 1의 CPU로 옮깁니다. D는 그대로 노드 0에 있어서 모든 접근이 원격 접근이 됩니다.' },
        { t: 0, pages: [0, 0, 0, 0], tag: '스레드를 노드에 고정', log: '해결 1 — T를 노드 0에 고정(pin)하면 데이터와 스레드가 같은 노드에 있어 로컬 접근을 유지합니다. 페이지를 T가 있는 노드로 옮기는 방법도 있습니다.' },
        { t: 0, pages: [0, 1, 0, 1], tag: '페이지를 노드에 번갈아 배치', log: '해결 2 — 인터리브(interleave) 정책은 페이지를 노드에 번갈아 배치합니다. 한 노드에 몰리는 것은 막지만 접근의 절반은 원격이 됩니다.' },
        { t: 0, pages: [0, 1, 0, 1], tag: '', log: '정리 — 스레드와 데이터를 같은 노드에 두는 것이 기본 원칙입니다. 여러 노드가 같은 데이터를 쓰면 인터리브로 부하를 나누는 선택을 합니다.' }
    ];
    function avgDist(t, pages) {
        var sum = 0;
        pages.forEach(function (n) { sum += n === t ? LOCAL : REMOTE; });
        return sum / pages.length;
    }

    /* ===================== 상태 ===================== */
    var mode    = 'arch';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'cost') return COST_STEPS;
        if (mode === 'policy') return POLICY_STEPS;
        return ARCH_STEPS;
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

    /* ===================== 공통 ===================== */
    function line(x1, y1, x2, y2, col, lw) {
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }
    function box(x, y, w, h, label, col, strong, fs) {
        rr(x, y, w, h, 6, col + (strong ? '30' : '14'), col + (strong ? 'ee' : '88'), strong ? 2 : 1.3);
        tx(label, x + w / 2, y + h / 2, fs, strong ? P.text + 'ee' : P.text + 'cc', 'center', true);
    }

    /* ===================== 모드: UMA vs NUMA ===================== */
    function drawUma(x0, top, w, mob, step) {
        var fs   = mob ? 10.5 : 12;
        var cw   = Math.min(150, (w - 40) / 2);
        var cx0  = x0 + w / 2 - cw - 20;
        var cx1  = x0 + w / 2 + 20;
        var cy   = top + 14;
        var busY = cy + 56 + 36;
        var hot  = step && step.hl === 'bus';
        var col  = hot ? P.orange : P.muted;
        tx('UMA — 균일 메모리 접근', x0, top + 2, fs + 0.5, P.text + 'ee', 'left', true);
        box(cx0, cy + 8, cw, 48, 'CPU 0', P.purple, false, fs);
        box(cx1, cy + 8, cw, 48, 'CPU 1', P.purple, false, fs);
        line(cx0 + cw / 2, cy + 56, cx0 + cw / 2, busY, col + 'cc', 2);
        line(cx1 + cw / 2, cy + 56, cx1 + cw / 2, busY, col + 'cc', 2);
        rr(cx0 + cw / 2 - 12, busY, cx1 - cx0 + 24, 26, 6, col + '26', col + 'cc', 1.5);
        tx(hot ? '같은 버스에 접근이 몰림' : '공용 버스', x0 + w / 2, busY + 13, fs, col + 'ee', 'center', true);
        var mx = x0 + w / 2;
        line(mx, busY + 26, mx, busY + 52, col + 'cc', 2);
        box(mx - 90, busY + 52, 180, 48, 'Memory (하나)', P.green, false, fs);
    }

    function drawNuma(x0, top, w, mob, step) {
        var fs   = mob ? 10.5 : 12;
        var nw   = Math.min(240, (w - 40) / 2);
        var nh   = mob ? 176 : 190;
        var nx   = [x0 + w / 2 - nw - 20, x0 + w / 2 + 20];
        var ny   = top + 18;
        var cpuH = 44;
        var memY = ny + nh - 14 - 48;
        var hl   = step ? step.hl : '';
        tx('NUMA — 노드마다 로컬 메모리', x0, top + 2, fs + 0.5, P.text + 'ee', 'left', true);
        for (var i = 0; i < 2; i++) {
            rr(nx[i], ny, nw, nh, 8, P.muted + '10', P.muted + '77', 1.4);
            tx('노드 ' + i, nx[i] + 12, ny + 14, fs, P.muted + 'ee', 'left', true);
            var local = hl === 'local' && i === 0;
            var onPath = (hl === 'remote') && i === 1;
            box(nx[i] + 14, ny + 28, nw - 28, cpuH, 'CPU ' + i, P.purple, i === 0 && (hl === 'local' || hl === 'remote'), fs);
            box(nx[i] + 14, memY, nw - 28, 48, 'Memory ' + i, P.green, local || onPath, fs);
            line(nx[i] + nw / 2, ny + 28 + cpuH, nx[i] + nw / 2, memY, local || onPath ? P.orange + 'ee' : P.muted + '88', local || onPath ? 3 : 1.6);
        }
        var iy = ny + 28 + cpuH / 2;
        var rem = hl === 'remote';
        line(nx[0] + nw - 14, iy, nx[1] + 14, iy, rem ? P.orange + 'ee' : P.muted + '99', rem ? 3 : 1.6);
        tx('인터커넥트', x0 + w / 2, iy - 10, fs - 1, rem ? P.orange + 'ee' : P.muted + 'cc', 'center', true);
        if (hl === 'local') tx('로컬 접근: 거리 ' + LOCAL, x0 + w / 2, ny + nh + 22, fs + 1, P.orange + 'ee', 'center', true);
        if (hl === 'remote') tx('원격 접근: 거리 ' + REMOTE, x0 + w / 2, ny + nh + 22, fs + 1, P.orange + 'ee', 'center', true);
    }

    /* ===================== 모드: 로컬 vs 원격 비용 ===================== */
    function drawCost(x0, top, w, mob, step) {
        var fs    = mob ? 10.5 : 12;
        var loc   = step && step.loc;
        var rem   = step && step.rem;
        var barX  = x0 + (mob ? 70 : 110);
        var maxW  = w - (barX - x0) - (mob ? 56 : 80);
        var barH  = mob ? 34 : 40;
        tx('같은 데이터를 ' + ACC + '번 읽을 때 총 거리', x0, top + 8, fs + 1, P.text + 'ee', 'left', true);
        var rows = [
            ['로컬', COST_LOCAL, loc, P.green, '거리 ' + LOCAL + ' × ' + ACC],
            ['원격', COST_REMOTE, rem, P.orange, '거리 ' + REMOTE + ' × ' + ACC]
        ];
        rows.forEach(function (r, i) {
            var y = top + 40 + i * (barH + 44);
            tx(r[0], x0, y + barH / 2, fs + 1, r[2] ? r[3] + 'ee' : P.muted + '99', 'left', true);
            rr(barX, y, maxW, barH, 5, 'none', P.muted + '44', 1);
            if (r[2]) {
                var bw = maxW * r[1] / COST_REMOTE;
                rr(barX, y, bw, barH, 5, r[3] + '38', r[3] + 'dd', 1.6);
                tx(String(r[1]), barX + bw + 8, y + barH / 2, fs + 1, r[3] + 'ee', 'left', true);
            }
            tx(r[4], barX, y + barH + 16, fs - 1, P.muted + 'cc', 'left', false);
        });
        if (rem) tx('원격 / 로컬 = ' + (COST_REMOTE / COST_LOCAL).toFixed(1) + '배', x0, top + 40 + 2 * (barH + 44) + 4, fs + 2, P.orange + 'ee', 'left', true);
    }

    /* ===================== 모드: 배치와 이동 ===================== */
    function drawPolicy(x0, top, w, mob, step) {
        var fs = mob ? 10.5 : 12;
        var nw = Math.min(240, (w - 40) / 2);
        var nh = mob ? 150 : 160;
        var nx = [x0 + w / 2 - nw - 20, x0 + w / 2 + 20];
        var ny = top + 14;
        var t  = step ? step.t : 0;
        var pg = step ? step.pages : null;
        for (var i = 0; i < 2; i++) {
            rr(nx[i], ny, nw, nh, 8, P.muted + '10', P.muted + '77', 1.4);
            tx('노드 ' + i, nx[i] + 12, ny + 14, fs, P.muted + 'ee', 'left', true);
            var onThis = t === i;
            box(nx[i] + 14, ny + 28, nw - 28, 40, onThis ? '스레드 T (CPU ' + i + ')' : 'CPU ' + i, P.purple, onThis, fs);
            tx('메모리', nx[i] + 14, ny + 86, fs - 1, P.muted + 'cc', 'left', false);
            var cw = (nw - 28 - 3 * 6) / 4;
            for (var k = 0; k < 4; k++) {
                var px = nx[i] + 14 + k * (cw + 6);
                var has = pg && pg[k] === i;
                rr(px, ny + 98, cw, 34, 4, has ? P.green + '30' : 'none', has ? P.green + 'cc' : P.muted + '44', has ? 1.6 : 1);
                if (has) tx('D' + k, px + cw / 2, ny + 115, fs, P.green + 'ee', 'center', true);
            }
        }
        var y = ny + nh + 26;
        if (!pg) {
            tx('아직 데이터가 할당되지 않았습니다', x0 + w / 2, y, fs + 1, P.muted + 'aa', 'center', false);
            return;
        }
        var avg = avgDist(t, pg);
        var col = avg === LOCAL ? P.green : P.orange;
        if (step.tag) tx(step.tag, x0 + w / 2, y, fs + 1, P.text + 'ee', 'center', true);
        tx('접근 1회 평균 거리: ' + (avg === Math.floor(avg) ? String(avg) : avg.toFixed(1)), x0 + w / 2, y + 26, fs + 2, col + 'ee', 'center', true);
        var remote = 0;
        pg.forEach(function (n) { if (n !== t) remote++; });
        tx('원격 접근 비율 ' + Math.round(remote * 100 / pg.length) + '%', x0 + w / 2, y + 50, fs, P.muted + 'dd', 'center', false);
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
        else if (mode === 'policy') drawPolicy(padX, top, fullW, mob, step);
        else if (step && step.a === 'numa') drawNuma(padX, top, fullW, mob, step);
        else drawUma(padX, top, fullW, mob, step);

        if (!step) {
            var hint = '아래 STEP을 눌러 NUMA가 어떻게 동작하는지 확인하세요.';
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
        if (mode === 'cost') neededH = mob ? 300 : 320;
        else if (mode === 'policy') neededH = mob ? 340 : 350;
        else neededH = mob ? 340 : 350;
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
        if (mode === 'cost') return '같은 데이터를 로컬 메모리에서 읽을 때와 원격 메모리에서 읽을 때의 총 거리를 비교합니다.';
        if (mode === 'policy') return '스레드와 데이터가 같은 노드에 있어야 로컬 접근이 유지됩니다. 배치 정책과 스레드 이동의 영향을 봅니다.';
        return 'UMA와 NUMA의 구조 차이와, NUMA에서 로컬 접근과 원격 접근의 차이를 봅니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('numa-viz__speed-btn--active'); });
        btn.classList.add('numa-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('numa-viz__mode-btn--active', d.key === m); });
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