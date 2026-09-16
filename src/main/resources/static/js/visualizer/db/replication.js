/**
 * 복제(Replication) 시각화
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
    var root    = el('div', 'replication-viz');
    var toolbar = el('div', 'replication-viz__toolbar');
    var tbLeft  = el('div', 'replication-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'replication-viz__title', 'REPLICATION'));

    var modeWrap = el('div', 'replication-viz__mode');
    var modeDefs = [
        { key: 'sync',  label: '동기 복제' },
        { key: 'async', label: '비동기 복제' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'replication-viz__mode-btn' + (i === 0 ? ' replication-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'replication-viz__speed');
    speedWrap.appendChild(el('span', 'replication-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'replication-viz__speed-btn' + (i === 0 ? ' replication-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'replication-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'replication-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'replication-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'replication-viz__controls');
    var btnPlay  = el('button', 'replication-viz__btn replication-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'replication-viz__btn', '▶| STEP');
    var btnReset = el('button', 'replication-viz__btn', '↺ RESET');
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

    /* ===================== 노드 정의 ===================== */
    var NODES = [
        { key: 'client',  label: 'CLIENT' },
        { key: 'primary', label: 'PRIMARY' },
        { key: 'replica', label: 'REPLICA' }
    ];

    /* ===================== 스텝 정의 ===================== */
    var SYNC_STEPS = [
        { from: 'client',  to: 'primary', label: '쓰기 요청', log: 'CLIENT가 PRIMARY에 쓰기 요청을 보냅니다.' },
        { from: 'primary', to: 'primary', label: '기록',      log: 'PRIMARY가 데이터를 기록합니다.' },
        { from: 'primary', to: 'replica', label: '복제 전송', log: 'PRIMARY가 REPLICA로 변경사항을 전송합니다.' },
        { from: 'replica', to: 'primary', label: 'ack',       log: 'REPLICA가 기록을 마치고 PRIMARY에 ack을 보냅니다.' },
        { from: 'primary', to: 'client',  label: '커밋 완료', log: 'PRIMARY가 REPLICA의 ack을 확인한 뒤에야 CLIENT에 커밋 완료를 알립니다 — 동기 복제는 이 대기 시간만큼 느립니다.' }
    ];

    var ASYNC_STEPS = [
        { from: 'client',  to: 'primary', label: '쓰기 요청',       log: 'CLIENT가 PRIMARY에 쓰기 요청을 보냅니다.' },
        { from: 'primary', to: 'primary', label: '기록',            log: 'PRIMARY가 데이터를 기록합니다.' },
        { from: 'primary', to: 'client',  label: '커밋 완료',       log: 'PRIMARY는 REPLICA를 기다리지 않고 곧바로 CLIENT에 커밋 완료를 알립니다 — 비동기 복제는 이래서 빠릅니다.' },
        { from: 'primary', to: 'replica', label: '복제 전송(백그라운드)', log: '그 사이 PRIMARY는 백그라운드로 REPLICA에 변경사항을 전송합니다.' },
        { from: 'replica', to: 'replica', label: '뒤늦게 기록',     log: 'REPLICA는 CLIENT 응답이 끝난 후에야 기록을 마칩니다 — 이 시간차가 복제 지연(Replication Lag)입니다.' }
    ];

    /* ===================== 상태 ===================== */
    var mode    = 'sync';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        return mode === 'async' ? ASYNC_STEPS : SYNC_STEPS;
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
    function arrow(x1, y1, x2, y2, color, lw) {
        ctx.strokeStyle = color;
        ctx.lineWidth = lw || 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        var angle = Math.atan2(y2 - y1, x2 - x1);
        var headLen = 9;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    }

    /* ===================== 노드 위치 ===================== */
    function nodePositions(x0, w, y, mob) {
        var boxW = mob ? 124 : 176;
        var boxH = mob ? 64 : 80;
        var gap  = (w - boxW * 3) / 2;
        var pos = {};
        NODES.forEach(function (n, i) {
            pos[n.key] = { x: x0 + i * (boxW + gap), y: y, w: boxW, h: boxH, cx: x0 + i * (boxW + gap) + boxW / 2, cy: y + boxH / 2 };
        });
        return pos;
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        var W = GW(); var mob = W < 600;
        var padX = mob ? 16 : 26;
        var fullW = W - padX * 2;
        var nodeY = mob ? 60 : 90;

        var pos = nodePositions(padX, fullW, nodeY, mob);
        var steps = currentSteps();
        var step = stepIdx >= 0 ? steps[stepIdx] : null;

        NODES.forEach(function (n) {
            var p = pos[n.key];
            var isActive = step && (step.from === n.key || step.to === n.key);
            var col = isActive ? P.orange : P.purple;
            rr(p.x, p.y, p.w, p.h, 10, col + (isActive ? '20' : '10'), col + (isActive ? 'ee' : '99'), isActive ? 2.4 : 1.6);
            tx(n.label, p.cx, p.cy, mob ? 13 : 15, col + 'ee', 'center', true);
        });

        var boxH = mob ? 64 : 80;
        for (var i = 0; i <= stepIdx; i++) {
            var s = steps[i];
            var isCurrent = i === stepIdx;
            var labelCol = isCurrent ? P.orange + 'ee' : P.text + 'aa';

            if (s.from === s.to) {
                var self = pos[s.from];
                tx(s.label, self.cx, self.y + self.h + (mob ? 20 : 24), mob ? 11 : 13, labelCol, 'center', isCurrent);
                continue;
            }

            var a = pos[s.from], b = pos[s.to];
            var forward = a.cx < b.cx;
            var y = nodeY + boxH + 44 + (forward ? 0 : (mob ? 30 : 36));
            var lineCol = isCurrent ? P.orange : (P.orange + '4a');
            arrow(forward ? a.cx + a.w / 2 - 4 : a.cx - a.w / 2 + 4, y,
                  forward ? b.cx - b.w / 2 + 4 : b.cx + b.w / 2 - 4, y,
                  lineCol, isCurrent ? 2.4 : 1.4);
            tx(s.label, (a.cx + b.cx) / 2, y - (mob ? 13 : 15), mob ? 11 : 13, labelCol, 'center', isCurrent);
        }

        if (!step) {
            tx('아래 STEP을 눌러 흐름을 하나씩 확인하세요.', W / 2, nodeY + boxH + (mob ? 100 : 130), mob ? 12 : 13.5, P.text + 'aa', 'center', false);
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var neededH = w < 600 ? 340 : 400;
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
    function defaultLog() { return mode === 'async' ? '비동기 복제: PRIMARY는 REPLICA를 기다리지 않습니다.' : '동기 복제: PRIMARY는 REPLICA의 ack을 기다린 뒤 응답합니다.'; }

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
        speedBtns.forEach(function (b) { b.classList.remove('replication-viz__speed-btn--active'); });
        btn.classList.add('replication-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('replication-viz__mode-btn--active', d.key === m); });
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