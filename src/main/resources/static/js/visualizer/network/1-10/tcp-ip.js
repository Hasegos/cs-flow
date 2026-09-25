/**
 * TCP/IP 시각화 — 3-way Handshake / 4-way Termination
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
    const root    = el('div', 'tcp-viz');
    const toolbar = el('div', 'tcp-viz__toolbar');
    const tbLeft  = el('div', 'tcp-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'tcp-viz__title', 'TCP Connection'));

    const btn3way = el('button', 'tcp-viz__mode-btn tcp-viz__mode-btn--active', '3-way Handshake');
    const btn4way = el('button', 'tcp-viz__mode-btn', '4-way Termination');
    btn3way.addEventListener('click', function () { if (!running) switchMode('handshake'); });
    btn4way.addEventListener('click', function () { if (!running) switchMode('termination'); });
    tbLeft.appendChild(btn3way);
    tbLeft.appendChild(btn4way);
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'tcp-viz__speed');
    speedWrap.appendChild(el('span', 'tcp-viz__speed-label', 'SPEED'));
    [['1x', 1800], ['2x', 900], ['3x', 600]].forEach(function (pair, i) {
        const b = el('button', 'tcp-viz__speed-btn' + (i === 0 ? ' tcp-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'tcp-viz__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'tcp-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const logEl = el('div', 'tcp-viz__log', '▶ PLAY를 눌러 TCP 3-way Handshake 과정을 확인하세요.');
    root.appendChild(logEl);

    const controls = el('div', 'tcp-viz__controls');
    const btnPlay  = el('button', 'tcp-viz__btn tcp-viz__btn--primary', '▶ PLAY');
    const btnStep  = el('button', 'tcp-viz__btn', '▶| STEP');
    const btnReset = el('button', 'tcp-viz__btn', '↺ RESET');
    btnPlay.addEventListener('click',  tcpStart);
    btnStep.addEventListener('click',  tcpStep);
    btnReset.addEventListener('click', tcpReset);
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
        const h = Math.max(canvasWrap.offsetHeight, 420);
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    let P = window.CsFlow.getP();

    /* ===================== 시나리오 정의 ===================== */
    const SCENARIOS = {
        handshake: [
            {
                log: '초기 상태. 클라이언트는 CLOSED, 서버는 LISTEN 상태입니다. 서버는 클라이언트의 연결 요청을 기다리고 있습니다.',
                pkt: null,
                clientState: 'CLOSED', serverState: 'LISTEN',
            },
            {
                log: 'Step 1 — SYN. 클라이언트가 연결을 요청합니다. 임의의 초기 시퀀스 번호(ISN=100)를 선택하고 SYN 플래그를 설정해 전송합니다. 클라이언트는 SYN_SENT 상태가 됩니다.',
                pkt: { dir: 'c2s', flag: 'SYN', detail: 'seq=100', color: 'purple' },
                clientState: 'SYN_SENT', serverState: 'LISTEN',
            },
            {
                log: 'Step 2 — SYN + ACK. 서버가 SYN을 수신했습니다. 자신의 ISN(seq=300)을 선택하고, 클라이언트 seq+1(ack=101)을 확인 번호로 설정해 SYN+ACK를 전송합니다. 서버는 SYN_RECEIVED 상태가 됩니다.',
                pkt: { dir: 's2c', flag: 'SYN + ACK', detail: 'seq=300, ack=101', color: 'teal' },
                clientState: 'SYN_SENT', serverState: 'SYN_RECEIVED',
            },
            {
                log: 'Step 3 — ACK. 클라이언트가 서버의 SYN+ACK를 수신했습니다. 서버 seq+1(ack=301)을 확인 번호로 설정해 ACK를 전송합니다. 양쪽 모두 ESTABLISHED 상태가 되어 데이터 전송이 가능합니다.',
                pkt: { dir: 'c2s', flag: 'ACK', detail: 'seq=101, ack=301', color: 'green' },
                clientState: 'ESTABLISHED', serverState: 'ESTABLISHED',
                done: true,
            },
        ],
        termination: [
            {
                log: '연결 종료 전. 양쪽 모두 ESTABLISHED 상태로 데이터 전송 중입니다. 클라이언트가 연결 종료를 시작합니다.',
                pkt: null,
                clientState: 'ESTABLISHED', serverState: 'ESTABLISHED',
            },
            {
                log: 'Step 1 — FIN. 클라이언트가 더 이상 보낼 데이터가 없어 연결 종료를 요청합니다. FIN 플래그를 설정해 전송합니다. 클라이언트는 FIN_WAIT_1 상태가 됩니다.',
                pkt: { dir: 'c2s', flag: 'FIN', detail: 'seq=200', color: 'orange' },
                clientState: 'FIN_WAIT_1', serverState: 'ESTABLISHED',
            },
            {
                log: 'Step 2 — ACK. 서버가 FIN을 수신하고 ACK를 전송합니다. 서버는 CLOSE_WAIT 상태가 됩니다. 클라이언트는 FIN_WAIT_2 상태가 됩니다. 서버는 아직 전송 중인 데이터가 있으면 계속 전송할 수 있습니다.',
                pkt: { dir: 's2c', flag: 'ACK', detail: 'ack=201', color: 'teal' },
                clientState: 'FIN_WAIT_2', serverState: 'CLOSE_WAIT',
            },
            {
                log: 'Step 3 — FIN. 서버가 남은 데이터를 모두 전송하고 연결 종료를 알립니다. FIN 플래그를 설정해 전송합니다. 서버는 LAST_ACK 상태가 됩니다.',
                pkt: { dir: 's2c', flag: 'FIN', detail: 'seq=500', color: 'orange' },
                clientState: 'FIN_WAIT_2', serverState: 'LAST_ACK',
            },
            {
                log: 'Step 4 — ACK. 클라이언트가 서버의 FIN을 수신하고 ACK를 전송합니다. 클라이언트는 TIME_WAIT(2MSL) 상태를 거쳐 CLOSED됩니다. 서버는 ACK 수신 즉시 CLOSED됩니다.',
                pkt: { dir: 'c2s', flag: 'ACK', detail: 'ack=501', color: 'green' },
                clientState: 'TIME_WAIT', serverState: 'CLOSED',
                done: true,
            },
        ],
    };

    let mode    = 'handshake';
    let stepIdx = -1;
    let running = false;
    let timer   = null;
    let rafId   = null;
    let speed   = 1800;
    let pktProg = 1;

    let history = [];

    /* ===================== 헬퍼 ===================== */
    function rr(x, y, w, h, r, fill, stroke, lw) {
        if (w <= 0 || h <= 0) return;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        if (fill)   { ctx.fillStyle = fill;                        ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
    }

    function tx(str, x, y, sz, color, align, bold) {
        ctx.font = (bold ? '700' : '400') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle    = color;
        ctx.textAlign    = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    function pColor(name) {
        if (name === 'purple') return P.purple;
        if (name === 'teal')   return P.teal;
        if (name === 'green')  return P.green;
        if (name === 'orange') return P.orange;
        return P.purple;
    }

    /* ===================== 레이아웃 ===================== */
    function buildLayout() {
        const W   = GW(), H = GH();
        const mob = W < 520;
        const pad = mob ? 12 : 28;

        const F_HOST  = mob ? 13 : 14;
        const F_STATE = mob ? 10 : 11;
        const F_FLAG  = mob ? 12 : 13;
        const F_DETAIL= mob ? 10 : 11;

        const hostW = mob ? 80 : 100;
        const hostH = mob ? 36 : 42;
        const hostY = mob ? 28 : 34;

        const cLineX = pad + hostW / 2;
        const sLineX = W - pad - hostW / 2;

        const lineTop = hostY + hostH;
        const lineBot = H - 20;

        const steps   = SCENARIOS[mode].length - 1;
        const slotH   = steps > 0 ? Math.floor((lineBot - lineTop) / steps) : 80;

        return { W, H, mob, pad, F_HOST, F_STATE, F_FLAG, F_DETAIL,
                 hostW, hostH, hostY, cLineX, sLineX, lineTop, lineBot, slotH };
    }

    function slotY(L, pktIdx) {
        return L.lineTop + pktIdx * L.slotH + L.slotH / 2;
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());

        const L    = buildLayout();
        const step = stepIdx >= 0
            ? SCENARIOS[mode][stepIdx]
            : SCENARIOS[mode][0];

        drawHosts(L, step);
        drawTimelines(L);
        drawHistory(L);
        if (step.pkt && pktProg < 1) drawMovingPkt(L, step, pktProg);
        if (step.pkt && pktProg >= 1) drawArrivedPkt(L, step, pktIdx(stepIdx));
    }

    function pktIdx(sIdx) {
        var count = 0;
        for (var k = 0; k <= sIdx; k++) {
            if (SCENARIOS[mode][k].pkt) count++;
        }
        return count - 1;
    }

    /* ===================== 호스트 박스 ===================== */
    function drawHosts(L, step) {
        const { pad, hostW, hostH, hostY, cLineX, sLineX,
                F_HOST, F_STATE, mob } = L;

        var cState = step.clientState || '';
        var sState = step.serverState || '';

        var cDone = (cState === 'ESTABLISHED' || cState === 'CLOSED');
        var sDone = (sState === 'ESTABLISHED' || sState === 'CLOSED');

        var cCol = cState === 'ESTABLISHED' ? P.green
                 : cState === 'CLOSED'      ? P.muted
                 : P.purple;
        var sCol = sState === 'ESTABLISHED' ? P.green
                 : sState === 'CLOSED'      ? P.muted
                 : P.teal;

        rr(cLineX - hostW / 2, hostY, hostW, hostH, 5,
           cCol + '22', cCol, 2);
        tx('CLIENT', cLineX, hostY + hostH * 0.38, F_HOST, cCol, 'center', true);
        tx(cState,   cLineX, hostY + hostH * 0.72, F_STATE, cCol + 'cc', 'center', false);

        rr(sLineX - hostW / 2, hostY, hostW, hostH, 5,
           sCol + '22', sCol, 2);
        tx('SERVER', sLineX, hostY + hostH * 0.38, F_HOST, sCol, 'center', true);
        tx(sState,   sLineX, hostY + hostH * 0.72, F_STATE, sCol + 'cc', 'center', false);
    }

    /* ===================== 타임라인 수직선 ===================== */
    function drawTimelines(L) {
        const { cLineX, sLineX, lineTop, lineBot } = L;
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = P.border + 'cc';
        ctx.lineWidth   = 1.5;
        ctx.beginPath(); ctx.moveTo(cLineX, lineTop); ctx.lineTo(cLineX, lineBot); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sLineX, lineTop); ctx.lineTo(sLineX, lineBot); ctx.stroke();
        ctx.setLineDash([]);
    }

    /* ===================== 완료 패킷 히스토리 ===================== */
    function drawHistory(L) {
        history.forEach(function (item) {
            drawStaticArrow(L, item.step, item.pktIdx);
        });
    }

    function drawStaticArrow(L, step, pi) {
        if (!step.pkt) return;
        const { cLineX, sLineX, F_FLAG, F_DETAIL, mob } = L;
        var pkt    = step.pkt;
        var col    = pColor(pkt.color);
        var fromX  = pkt.dir === 'c2s' ? cLineX : sLineX;
        var toX    = pkt.dir === 'c2s' ? sLineX : cLineX;
        var y      = slotY(L, pi);
        var midX   = (fromX + toX) / 2;

        ctx.beginPath();
        ctx.moveTo(fromX, y - L.slotH * 0.3);
        ctx.lineTo(toX,   y + L.slotH * 0.3);
        ctx.strokeStyle = col + 'cc';
        ctx.lineWidth   = 1.5;
        ctx.stroke();

        var ang = Math.atan2(L.slotH * 0.6, toX - fromX);
        ctx.beginPath();
        ctx.moveTo(toX, y + L.slotH * 0.3);
        ctx.lineTo(toX - 10 * Math.cos(ang - 0.4), y + L.slotH * 0.3 - 10 * Math.sin(ang - 0.4));
        ctx.lineTo(toX - 10 * Math.cos(ang + 0.4), y + L.slotH * 0.3 - 10 * Math.sin(ang + 0.4));
        ctx.closePath();
        ctx.fillStyle = col + 'cc';
        ctx.fill();

        var lblX = midX;
        var lblY = y;
        tx(pkt.flag,   lblX, lblY - (mob ? 8 : 9),  F_FLAG,   col, 'center', true);
        tx(pkt.detail, lblX, lblY + (mob ? 5 : 6),  F_DETAIL, col + 'aa', 'center', false);
    }

    /* ===================== 이동 중인 패킷 ===================== */
    function drawMovingPkt(L, step, prog) {
        if (!step.pkt) return;
        const { cLineX, sLineX, F_FLAG, F_DETAIL, mob } = L;
        var pkt   = step.pkt;
        var col   = pColor(pkt.color);
        var pi    = pktIdx(stepIdx);

        var fromX = pkt.dir === 'c2s' ? cLineX : sLineX;
        var toX   = pkt.dir === 'c2s' ? sLineX : cLineX;
        var fromY = slotY(L, pi) - L.slotH * 0.3;
        var toY   = slotY(L, pi) + L.slotH * 0.3;

        var cx = fromX + (toX - fromX) * prog;
        var cy = fromY + (toY - fromY) * prog;

        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(cx, cy);
        ctx.strokeStyle = col + '66';
        ctx.lineWidth   = 1.5;
        ctx.stroke();

        ctx.beginPath(); ctx.arc(cx, cy, mob ? 18 : 22, 0, Math.PI * 2);
        ctx.fillStyle   = col + '22'; ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();

        var fSz = mob ? 10 : 11;
        if (pkt.flag.length > 7) {
            var parts = pkt.flag.split(' + ');
            tx(parts[0], cx, cy - 6, fSz - 1, col, 'center', true);
            if (parts[1]) tx('+' + parts[1], cx, cy + 6, fSz - 1, col, 'center', true);
        } else {
            tx(pkt.flag, cx, cy, fSz, col, 'center', true);
        }
    }

    function drawArrivedPkt(L, step, pi) {
        drawStaticArrow(L, step, pi);
    }

    /* ===================== 애니메이션 ===================== */
    var pktMoving = false;

    function animateStep(step, cb) {
        var needsAnim = !!step.pkt;
        pktProg = needsAnim ? 0 : 1;
        if (!needsAnim) { draw(); if (cb) cb(); return; }
        if (rafId) cancelAnimationFrame(rafId);
        pktMoving = true;
        var s = 0.007 * (1800 / speed);
        (function tick() {
            pktProg = Math.min(1, pktProg + s);
            draw();
            if (pktProg < 1) { rafId = requestAnimationFrame(tick); }
            else { pktMoving = false; draw(); if (cb) cb(); }
        })();
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) {
        root.querySelectorAll('.tcp-viz__speed-btn').forEach(function (b) { b.disabled = v; });
    }

    function applyStep(idx, onDone) {
        stepIdx = idx;
        var step = SCENARIOS[mode][idx];
        logEl.textContent = step.log;
        animateStep(step, function () {
            if (step.pkt && pktProg >= 1) {
                history.push({ step: step, pktIdx: pktIdx(idx) });
            }
            if (onDone) setTimeout(onDone, 0);
        });
    }

    function tcpStart() {
        if (running) return;
        running = true; btnPlay.disabled = true; btnStep.disabled = true;
        setSpeedDisabled(true);
        function tick() {
            var next = stepIdx + 1;
            var sc   = SCENARIOS[mode];
            if (next >= sc.length) { running = false; setSpeedDisabled(false); return; }
            applyStep(next, function () {
                if (next === sc.length - 1) {
                    running = false; btnStep.disabled = true; setSpeedDisabled(false);
                } else {
                    timer = setTimeout(tick, speed);
                }
            });
        }
        tick();
    }

    function tcpStep() {
        if (running || pktMoving) return;
        var next = stepIdx + 1;
        var sc   = SCENARIOS[mode];
        if (next >= sc.length) return;
        applyStep(next, null);
        if (next === sc.length - 1) { btnPlay.disabled = true; btnStep.disabled = true; }
    }

    function tcpReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false; stepIdx = -1; pktProg = 1; pktMoving = false; history = [];
        var sc = SCENARIOS[mode];
        logEl.textContent = mode === 'handshake'
            ? '▶ PLAY를 눌러 TCP 3-way Handshake 과정을 확인하세요.'
            : '▶ PLAY를 눌러 TCP 4-way Termination 과정을 확인하세요.';
        btnPlay.disabled = false; btnStep.disabled = false;
        setSpeedDisabled(false);
        draw();
    }

    function switchMode(m) {
        mode = m;
        btn3way.classList.toggle('tcp-viz__mode-btn--active', m === 'handshake');
        btn4way.classList.toggle('tcp-viz__mode-btn--active', m === 'termination');
        tcpReset();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.tcp-viz__speed-btn').forEach(function (b) {
            b.classList.remove('tcp-viz__speed-btn--active');
        });
        btn.classList.add('tcp-viz__speed-btn--active');
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