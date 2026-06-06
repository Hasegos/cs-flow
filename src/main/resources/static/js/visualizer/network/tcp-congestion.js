/**
 * TCP 혼잡 제어 시각화
 */
(function () {
    'use strict';

    const container = document.getElementById('visualizer-container');
    if (!container) return;

    function el(tag, cls, txt) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (txt) e.textContent = txt;
        return e;
    }

    /* ===================== DOM 구성 ===================== */
    const root    = el('div', 'tc-viz');
    const toolbar = el('div', 'tc-viz__toolbar');
    const tbLeft  = el('div', 'tc-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'tc-viz__title', 'TCP Congestion Control'));
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'tc-viz__speed');
    speedWrap.appendChild(el('span', 'tc-viz__speed-label', 'SPEED'));
    [['1x', 1800], ['2x', 900], ['3x', 600]].forEach(function (pair, i) {
        const b = el('button', 'tc-viz__speed-btn' + (i === 0 ? ' tc-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'tc-viz__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'tc-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const logEl = el('div', 'tc-viz__log', '▶ PLAY를 눌러 TCP 혼잡 제어 동작을 확인하세요.');
    root.appendChild(logEl);

    const controls = el('div', 'tc-viz__controls');
    const btnPlay  = el('button', 'tc-viz__btn tc-viz__btn--primary', '▶ PLAY');
    const btnStep  = el('button', 'tc-viz__btn', '▶| STEP');
    const btnReset = el('button', 'tc-viz__btn', '↺ RESET');
    btnPlay.addEventListener('click',  tcStart);
    btnStep.addEventListener('click',  tcStep);
    btnReset.addEventListener('click', tcReset);
    controls.appendChild(btnPlay);
    controls.appendChild(btnStep);
    controls.appendChild(btnReset);
    root.appendChild(controls);
    container.appendChild(root);

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const GW  = function () { return canvas.width  / dpr; };
    const GH  = function () { return canvas.height / dpr; };

    function resize() {
        const w = canvasWrap.offsetWidth;
        const h = Math.max(canvasWrap.offsetHeight, 380);
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    let P = window.CsFlow.getP();

    /* ===================== 시나리오 정의 ===================== */
    var STEPS = [
        { rtt:  1, cwnd:  1, ssthresh: 16, phase: 'SS', event: null,
          log: 'RTT 1 — Slow Start 시작. cwnd=1 MSS. 연결 초기에는 네트워크 상태를 모르므로 작게 시작합니다. ACK를 받을 때마다 cwnd를 1씩 늘려 RTT마다 2배 증가합니다.' },
        { rtt:  2, cwnd:  2, ssthresh: 16, phase: 'SS', event: null,
          log: 'RTT 2 — cwnd=2. Slow Start: ACK 1개당 cwnd+1. RTT 내 2개 ACK → cwnd 2 증가(1→2). 지수적 증가 시작.' },
        { rtt:  3, cwnd:  4, ssthresh: 16, phase: 'SS', event: null,
          log: 'RTT 3 — cwnd=4. 지수 증가 계속. 아직 ssthresh(16)에 못 미쳐 Slow Start 유지.' },
        { rtt:  4, cwnd:  8, ssthresh: 16, phase: 'SS', event: null,
          log: 'RTT 4 — cwnd=8. 2배씩 빠르게 증가. ssthresh=16까지 2배 더 가면 도달합니다.' },
        { rtt:  5, cwnd: 16, ssthresh: 16, phase: 'SS', event: null,
          log: 'RTT 5 — cwnd=16, ssthresh=16 도달! Slow Start에서 Congestion Avoidance로 전환합니다. 이제부터 선형 증가합니다.' },

        { rtt:  6, cwnd: 17, ssthresh: 16, phase: 'CA', event: null,
          log: 'RTT 6 — Congestion Avoidance 시작. cwnd=17. RTT마다 +1 MSS씩만 증가합니다. 네트워크 한계에 조심스럽게 접근합니다.' },
        { rtt:  7, cwnd: 18, ssthresh: 16, phase: 'CA', event: null,
          log: 'RTT 7 — cwnd=18. 선형 증가 중. 천천히 네트워크 용량 탐색.' },
        { rtt:  8, cwnd: 19, ssthresh: 16, phase: 'CA', event: null,
          log: 'RTT 8 — cwnd=19. 계속 선형 증가.' },
        { rtt:  9, cwnd: 20, ssthresh: 16, phase: 'CA', event: null,
          log: 'RTT 9 — cwnd=20.' },

        { rtt: 10, cwnd: 21, ssthresh: 16, phase: 'CA', event: '3dup',
          log: 'RTT 10 — ⚠ 3개 중복 ACK 감지! 패킷 손실 발생. Fast Retransmit: 즉시 재전송. ssthresh = cwnd/2 = 10, cwnd = ssthresh = 10으로 감소. Fast Recovery로 진입합니다.' },
        { rtt: 11, cwnd: 10, ssthresh: 10, phase: 'CA', event: null,
          log: 'RTT 11 — Fast Recovery 후 cwnd=10, ssthresh=10. Slow Start 없이 바로 Congestion Avoidance로 복귀. 선형 증가 재개.' },
        { rtt: 12, cwnd: 11, ssthresh: 10, phase: 'CA', event: null,
          log: 'RTT 12 — cwnd=11. CA 선형 증가.' },
        { rtt: 13, cwnd: 12, ssthresh: 10, phase: 'CA', event: null,
          log: 'RTT 13 — cwnd=12.' },
        { rtt: 14, cwnd: 13, ssthresh: 10, phase: 'CA', event: null,
          log: 'RTT 14 — cwnd=13. 안정적으로 증가 중.' },

        { rtt: 15, cwnd: 14, ssthresh: 10, phase: 'CA', event: 'timeout',
          log: 'RTT 15 — ⚠ 타임아웃 발생! 더 심각한 혼잡 신호. ssthresh = cwnd/2 = 7, cwnd = 1로 리셋. Slow Start부터 재시작합니다. 3-Dup ACK보다 훨씬 큰 패널티입니다.' },
        { rtt: 16, cwnd:  1, ssthresh:  7, phase: 'SS', event: null,
          log: 'RTT 16 — Slow Start 재시작. cwnd=1, ssthresh=7. 타임아웃 후에는 항상 cwnd=1부터 시작합니다.' },
        { rtt: 17, cwnd:  2, ssthresh:  7, phase: 'SS', event: null,
          log: 'RTT 17 — cwnd=2. 지수 증가 재개.' },
        { rtt: 18, cwnd:  4, ssthresh:  7, phase: 'SS', event: null,
          log: 'RTT 18 — cwnd=4.' },
        { rtt: 19, cwnd:  7, ssthresh:  7, phase: 'SS', event: null,
          log: 'RTT 19 — cwnd=7, ssthresh=7 도달. 다시 CA로 전환. AIMD 사이클이 반복됩니다 ✓' ,
          done: true },
    ];

    var MAX_RTT  = STEPS[STEPS.length - 1].rtt;
    var MAX_CWND = 24; /* Y축 최대값 */

    let stepIdx   = -1;
    let running   = false;
    let timer     = null;
    let rafId     = null;
    let speed     = 1800;
    let pktMoving = false;
    let animProg  = 1;

    /* ===================== 헬퍼 ===================== */
    function tx(str, x, y, sz, color, align, bold) {
        ctx.font = (bold ? '700' : '400') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle    = color;
        ctx.textAlign    = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    /* ===================== 레이아웃 ===================== */
    function buildLayout() {
        const W   = GW(), H = GH();
        const mob = W < 520;

        const padL = mob ? 40 : 52;
        const padR = mob ? 12 : 20;
        const padT = mob ? 16 : 20;
        const padB = mob ? 32 : 38;

        const F_AXIS  = mob ? 9  : 10;
        const F_LABEL = mob ? 9  : 10;
        const F_PHASE = mob ? 10 : 11;

        const gW = W - padL - padR;
        const gH = H - padT - padB;

        function toX(rtt)  { return padL + (rtt - 1) / (MAX_RTT - 1) * gW; }
        function toY(cwnd) { return padT + (1 - cwnd / MAX_CWND) * gH; }

        return { W, H, mob, padL, padR, padT, padB,
                 F_AXIS, F_LABEL, F_PHASE, gW, gH, toX, toY };
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        const L = buildLayout();
        drawGrid(L);
        drawSsthreshLine(L);
        drawPhaseBands(L);
        drawGraph(L);
        drawEvents(L);
        drawAxes(L);
        if (stepIdx >= 0) drawCurrentDot(L);
    }

    /* ===================== 그리드 ===================== */
    function drawGrid(L) {
        const { padL, padR, padT, padB, gW, gH, W, H, toX, toY, F_AXIS, mob } = L;

        var yTicks = [4, 8, 12, 16, 20, 24];
        yTicks.forEach(function (v) {
            var y = toY(v);
            ctx.beginPath();
            ctx.moveTo(padL, y);
            ctx.lineTo(padL + gW, y);
            ctx.strokeStyle = P.border + '55';
            ctx.lineWidth   = 1;
            ctx.setLineDash([3, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
            tx(String(v), padL - 6, y, F_AXIS, P.muted + 'aa', 'right', false);
        });

        var xTicks = [1, 5, 10, 15, 19];
        xTicks.forEach(function (v) {
            var x = toX(v);
            ctx.beginPath();
            ctx.moveTo(x, padT);
            ctx.lineTo(x, padT + gH);
            ctx.strokeStyle = P.border + '44';
            ctx.lineWidth   = 1;
            ctx.setLineDash([3, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
            tx(String(v), x, padT + gH + (mob ? 10 : 12), F_AXIS, P.muted + 'aa', 'center', false);
        });

        tx('cwnd (MSS)', mob ? 10 : 12, padT + gH / 2, F_AXIS + 1, P.muted + 'cc', 'center', false);
        tx('RTT', padL + gW / 2, padT + gH + (mob ? 24 : 28), F_AXIS + 1, P.muted + 'cc', 'center', false);
    }

    /* ===================== ssthresh 선 ===================== */
    function drawSsthreshLine(L) {
        const { padL, gW, toY, F_LABEL, mob } = L;
        if (stepIdx < 0) return;

        var sst = STEPS[stepIdx].ssthresh;
        var y   = toY(sst);

        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + gW, y);
        ctx.strokeStyle = P.orange + 'aa';
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        tx('ssthresh=' + sst, padL + gW - (mob ? 2 : 4), y - 8,
           F_LABEL, P.orange + 'dd', 'right', true);
    }

    /* ===================== 페이즈 배경 밴드 ===================== */
    function drawPhaseBands(L) {
        const { padL, padT, gH, toX, F_PHASE, mob } = L;
        if (stepIdx < 0) return;

        var bands = [
            { from: 1,  to: 5,  phase: 'SS', col: P.purple },
            { from: 6,  to: 10, phase: 'CA', col: P.teal   },
            { from: 11, to: 15, phase: 'CA', col: P.teal   },
            { from: 16, to: 19, phase: 'SS', col: P.purple },
        ];

        bands.forEach(function (band) {
            if (STEPS[stepIdx].rtt < band.from) return;
            var x1 = toX(band.from);
            var x2 = toX(Math.min(band.to, STEPS[stepIdx].rtt));
            ctx.fillStyle = band.col + '10';
            ctx.fillRect(x1, padT, x2 - x1, gH);

            var mx = (x1 + x2) / 2;
            tx(band.phase, mx, padT + (mob ? 10 : 12), F_PHASE, band.col + '88', 'center', true);
        });
    }

    /* ===================== 그래프 선 ===================== */
    function drawGraph(L) {
        const { toX, toY } = L;
        if (stepIdx < 0) return;

        var pts = [];
        for (var i = 0; i <= stepIdx; i++) {
            pts.push({ x: toX(STEPS[i].rtt), y: toY(STEPS[i].cwnd), step: STEPS[i] });
        }

        for (var j = 0; j < pts.length - 1; j++) {
            var s = STEPS[j];
            var col = s.phase === 'SS' ? P.purple : P.teal;

            if (STEPS[j + 1] && (s.event === '3dup' || s.event === 'timeout')) {
                ctx.beginPath();
                ctx.moveTo(pts[j].x, pts[j].y);
                ctx.lineTo(pts[j + 1].x, pts[j + 1].y);
                ctx.strokeStyle = P.red + 'cc';
                ctx.lineWidth   = 2;
                ctx.setLineDash([4, 3]);
                ctx.stroke();
                ctx.setLineDash([]);
            } else {
                ctx.beginPath();
                ctx.moveTo(pts[j].x, pts[j].y);
                var ex = j === pts.length - 2
                    ? pts[j].x + (pts[j + 1].x - pts[j].x) * animProg
                    : pts[j + 1].x;
                var ey = j === pts.length - 2
                    ? pts[j].y + (pts[j + 1].y - pts[j].y) * animProg
                    : pts[j + 1].y;
                ctx.lineTo(ex, ey);
                ctx.strokeStyle = col + 'ee';
                ctx.lineWidth   = 2.5;
                ctx.stroke();
            }
        }

        for (var k = 0; k < pts.length - 1; k++) {
            var sc  = STEPS[k];
            var col2 = sc.phase === 'SS' ? P.purple : P.teal;
            var r   = sc.event ? 6 : 4;
            ctx.beginPath();
            ctx.arc(pts[k].x, pts[k].y, r, 0, Math.PI * 2);
            ctx.fillStyle   = sc.event ? P.red + 'cc' : col2 + 'cc';
            ctx.fill();
        }
    }

    /* ===================== 이벤트 마커 ===================== */
    function drawEvents(L) {
        const { toX, padT, gH, F_LABEL, mob } = L;
        if (stepIdx < 0) return;

        STEPS.forEach(function (s, i) {
            if (i > stepIdx) return;
            if (!s.event) return;
            var x   = toX(s.rtt);
            var col = P.red;
            var lbl = s.event === '3dup' ? '3-Dup ACK' : 'Timeout';

            ctx.beginPath();
            ctx.moveTo(x, padT);
            ctx.lineTo(x, padT + gH);
            ctx.strokeStyle = col + '55';
            ctx.lineWidth   = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.save();
            ctx.translate(x + (mob ? 8 : 10), padT + gH * 0.5);
            ctx.rotate(-Math.PI / 2);
            ctx.font = '700 ' + (mob ? 9 : 10) + 'px "JetBrains Mono",monospace';
            ctx.fillStyle    = col + 'cc';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(lbl, 0, 0);
            ctx.restore();
        });
    }

    /* ===================== 현재 위치 점 ===================== */
    function drawCurrentDot(L) {
        const { toX, toY, F_LABEL, mob } = L;
        var s   = STEPS[stepIdx];
        var x   = toX(s.rtt);
        var y   = toY(s.cwnd);
        var col = s.phase === 'SS' ? P.purple : P.teal;

        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.strokeStyle = col + '44';
        ctx.lineWidth   = 2;
        ctx.stroke();

        var lbl = 'cwnd=' + s.cwnd;
        ctx.font = '700 ' + (mob ? 10 : 11) + 'px "JetBrains Mono",monospace';
        var tw   = ctx.measureText(lbl).width + 10;
        var bh   = mob ? 16 : 18;
        var bx   = Math.min(x - tw / 2, GW() - tw - 4);
        bx = Math.max(bx, 4);
        var by   = y - (mob ? 22 : 26);

        ctx.fillStyle = P.bg;
        ctx.fillRect(bx, by, tw, bh);
        ctx.strokeStyle = col + 'cc';
        ctx.lineWidth   = 1;
        ctx.strokeRect(bx, by, tw, bh);
        tx(lbl, bx + tw / 2, by + bh / 2, mob ? 10 : 11, col, 'center', true);
    }

    /* ===================== 축 ===================== */
    function drawAxes(L) {
        const { padL, padT, gW, gH } = L;
        ctx.beginPath();
        ctx.moveTo(padL, padT);
        ctx.lineTo(padL, padT + gH);
        ctx.lineTo(padL + gW, padT + gH);
        ctx.strokeStyle = P.border + 'cc';
        ctx.lineWidth   = 1.5;
        ctx.stroke();
    }

    /* ===================== 애니메이션 ===================== */
    function animateStep(onDone) {
        animProg  = 0;
        pktMoving = true;
        if (rafId) cancelAnimationFrame(rafId);
        var s = 0.007 * (1800 / speed);
        (function tick() {
            animProg = Math.min(1, animProg + s);
            draw();
            if (animProg < 1) {
                rafId = requestAnimationFrame(tick);
            } else {
                pktMoving = false;
                draw();
                if (onDone) onDone();
            }
        })();
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) {
        root.querySelectorAll('.tc-viz__speed-btn').forEach(function (b) { b.disabled = v; });
    }

    function applyStep(idx, onDone) {
        stepIdx = idx;
        logEl.textContent = STEPS[idx].log;
        if (idx === 0) {
            animProg = 1;
            draw();
            if (onDone) onDone();
        } else {
            animateStep(function () {
                if (onDone) setTimeout(onDone, 0);
            });
        }
    }

    function tcStart() {
        if (running) return;
        running = true; btnPlay.disabled = true; btnStep.disabled = true;
        setSpeedDisabled(true);
        function tick() {
            var next = stepIdx + 1;
            if (next >= STEPS.length) { running = false; setSpeedDisabled(false); return; }
            applyStep(next, function () {
                if (next === STEPS.length - 1) {
                    running = false; btnStep.disabled = true; setSpeedDisabled(false);
                } else {
                    timer = setTimeout(tick, speed * 0.4);
                }
            });
        }
        tick();
    }

    function tcStep() {
        if (running || pktMoving) return;
        var next = stepIdx + 1;
        if (next >= STEPS.length) return;
        applyStep(next, null);
        if (next === STEPS.length - 1) { btnPlay.disabled = true; btnStep.disabled = true; }
    }

    function tcReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false; stepIdx = -1; animProg = 1; pktMoving = false;
        logEl.textContent = '▶ PLAY를 눌러 TCP 혼잡 제어 동작을 확인하세요.';
        btnPlay.disabled = false; btnStep.disabled = false;
        setSpeedDisabled(false);
        draw();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.tc-viz__speed-btn').forEach(function (b) {
            b.classList.remove('tc-viz__speed-btn--active');
        });
        btn.classList.add('tc-viz__speed-btn--active');
    }

    window.CsFlow.createVizLifecycle({
        canvas, canvasWrap, resize, draw,
        getState : function () { return { rafId: rafId, timer: timer, running: running }; },
        setState : function (s) { rafId = s.rafId; timer = s.timer; running = s.running; },
        onPause  : function () { setSpeedDisabled(false); },
        getMouseCtx: function () {
            return {
                GW, GH, mousePos: { x: -1, y: -1 }, tooltipHits: [],
                hoveredKey: function () { return null; }, setHoveredKey: function () {}, draw,
            };
        },
    });

    setTimeout(resize, 60);
})();