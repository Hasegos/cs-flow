/**
 * WebSocket 시각화
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
    const root    = el('div', 'ws-viz');
    const toolbar = el('div', 'ws-viz__toolbar');
    const tbLeft  = el('div', 'ws-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'ws-viz__title', 'WebSocket Protocol'));
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'ws-viz__speed');
    speedWrap.appendChild(el('span', 'ws-viz__speed-label', 'SPEED'));
    [['1x', 1800], ['2x', 900], ['3x', 600]].forEach(function (pair, i) {
        const b = el('button', 'ws-viz__speed-btn' + (i === 0 ? ' ws-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'ws-viz__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'ws-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const logEl = el('div', 'ws-viz__log', '▶ PLAY를 눌러 WebSocket 연결 과정을 확인하세요.');
    root.appendChild(logEl);

    const controls = el('div', 'ws-viz__controls');
    const btnPlay  = el('button', 'ws-viz__btn ws-viz__btn--primary', '▶ PLAY');
    const btnStep  = el('button', 'ws-viz__btn', '▶| STEP');
    const btnReset = el('button', 'ws-viz__btn', '↺ RESET');
    btnPlay.addEventListener('click',  wsStart);
    btnStep.addEventListener('click',  wsStep);
    btnReset.addEventListener('click', wsReset);
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
        var w   = canvasWrap.offsetWidth || 320;
        var mob = w < 520;
        var rowH = mob ? 44 : 52;
        var minH = rowH * 10 + (mob ? 44 : 52) + (mob ? 20 : 26) + 8 + 20;
        var h = Math.max(canvasWrap.offsetHeight || 0, minH);
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    let P = window.CsFlow.getP();

    /* ===================== 시나리오 ===================== */
    var STEPS = [
        {
            log: '초기 상태. 브라우저가 ws://example.com/chat에 접속합니다. WebSocket은 HTTP Upgrade 핸드셰이크로 시작합니다.',
            pkt: null,
            clientState: 'CLOSED', serverState: 'LISTEN',
        },
        {
            log: 'Step 1 — HTTP GET Upgrade 요청. 클라이언트가 HTTP/1.1 GET 요청에 Upgrade: websocket, Connection: Upgrade, Sec-WebSocket-Key 헤더를 포함해 전송합니다.',
            pkt: { dir: 'c2s', label: 'GET /chat HTTP/1.1', sub: 'Upgrade: websocket | Sec-WebSocket-Key', color: 'muted', phase: 'http' },
            clientState: 'CONNECTING', serverState: 'LISTEN',
        },
        {
            log: 'Step 2 — 101 Switching Protocols. 서버가 Sec-WebSocket-Accept 헤더와 함께 101로 응답합니다. 이 시점부터 HTTP가 아닌 WebSocket 프로토콜로 전환됩니다.',
            pkt: { dir: 's2c', label: '101 Switching Protocols', sub: 'Upgrade: websocket | Sec-WebSocket-Accept', color: 'teal', phase: 'http' },
            clientState: 'OPEN', serverState: 'OPEN',
        },
        {
            log: 'Step 3 — WebSocket 연결 수립 ✓  양방향 채널이 열렸습니다. 이제 HTTP 오버헤드 없이 프레임 단위로 데이터를 주고받을 수 있습니다.',
            pkt: null,
            clientState: 'OPEN', serverState: 'OPEN',
            divider: 'ws',
        },
        {
            log: 'Step 4 — 클라이언트 → 서버 메시지. 텍스트 프레임(OpCode: 0x1)으로 채팅 메시지를 전송합니다. 클라이언트 메시지는 반드시 마스킹됩니다.',
            pkt: { dir: 'c2s', label: '💬 "안녕하세요!"', sub: 'Text Frame | OpCode: 0x1 | Masked', color: 'purple', phase: 'ws' },
            clientState: 'OPEN', serverState: 'OPEN',
        },
        {
            log: 'Step 5 — 서버 → 클라이언트 메시지. 서버가 다른 사용자의 메시지를 브로드캐스트합니다. 서버 메시지는 마스킹하지 않습니다.',
            pkt: { dir: 's2c', label: '💬 "반갑습니다!"', sub: 'Text Frame | OpCode: 0x1 | Unmasked', color: 'green', phase: 'ws' },
            clientState: 'OPEN', serverState: 'OPEN',
        },
        {
            log: 'Step 6 — 서버 Ping. 서버가 연결 유지를 위해 Ping 프레임을 전송합니다. 클라이언트는 즉시 Pong으로 응답해야 합니다.',
            pkt: { dir: 's2c', label: 'Ping 🏓', sub: 'Ping Frame | OpCode: 0x9', color: 'yellow', phase: 'ws' },
            clientState: 'OPEN', serverState: 'OPEN',
        },
        {
            log: 'Step 7 — 클라이언트 Pong. Ping에 대한 응답입니다. Pong이 돌아오지 않으면 서버는 연결이 끊겼다고 판단합니다.',
            pkt: { dir: 'c2s', label: 'Pong 🏓', sub: 'Pong Frame | OpCode: 0xA', color: 'yellow', phase: 'ws' },
            clientState: 'OPEN', serverState: 'OPEN',
        },
        {
            log: 'Step 8 — 바이너리 데이터 전송. 이미지나 파일도 Binary Frame(OpCode: 0x2)으로 전송할 수 있습니다. HTTP multipart 없이 효율적으로 전송됩니다.',
            pkt: { dir: 'c2s', label: '📁 Binary Data', sub: 'Binary Frame | OpCode: 0x2', color: 'orange', phase: 'ws' },
            clientState: 'OPEN', serverState: 'OPEN',
        },
        {
            log: 'Step 9 — 연결 종료. 클라이언트가 Close Frame(OpCode: 0x8)을 전송합니다. 상태 코드 1000은 정상 종료를 의미합니다.',
            pkt: { dir: 'c2s', label: 'Close Frame', sub: 'OpCode: 0x8 | Code: 1000 (Normal)', color: 'muted', phase: 'close' },
            clientState: 'CLOSING', serverState: 'OPEN',
        },
        {
            log: 'Step 10 — 서버 Close 응답 ✓  서버도 Close Frame으로 응답하고 TCP 연결을 닫습니다. WebSocket 세션 종료. HTTP 요청 1회로 수백 개의 메시지를 교환했습니다.',
            pkt: { dir: 's2c', label: 'Close Frame', sub: 'OpCode: 0x8 | TCP 연결 종료', color: 'muted', phase: 'close' },
            clientState: 'CLOSED', serverState: 'CLOSED',
            done: true,
        },
    ];

    let stepIdx   = -1;
    let running   = false;
    let timer     = null;
    let rafId     = null;
    let speed     = 1800;
    let pktMoving = false;
    let pktProg   = 1;
    let history   = [];

    /* ===================== 헬퍼 ===================== */
    function rr(x, y, w, h, r, fill, stroke, lw) {
        if (w <= 0 || h <= 0) return;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x+w, y, x+w, y+h, r); ctx.arcTo(x+w, y+h, x, y+h, r);
        ctx.arcTo(x, y+h, x, y, r);     ctx.arcTo(x, y, x+w, y, r);
        ctx.closePath();
        if (fill)   { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
    }

    function tx(str, x, y, sz, color, align, bold) {
        ctx.font = (bold ? '700' : '400') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    function pColor(name) {
        if (name === 'purple') return P.purple;
        if (name === 'teal')   return P.teal;
        if (name === 'green')  return P.green;
        if (name === 'yellow') return P.yellow;
        if (name === 'orange') return P.orange;
        if (name === 'muted')  return P.muted;
        return P.purple;
    }

    /* ===================== 레이아웃 ===================== */
    function buildLayout() {
        var W   = GW(), H = GH();
        var mob = W < 520;
        var pad = mob ? 10 : 24;

        var F_HOST  = mob ? 13 : 15;
        var F_STATE = mob ? 10 : 11;
        var F_LABEL = mob ? 13 : 15;
        var F_SUB   = mob ? 11 : 13;

        var hostW = mob ?  80 : 110;
        var hostH = mob ?  42 :  52;
        var hostY = mob ?  16 :  22;

        var cLineX = pad + hostW / 2;
        var sLineX = W - pad - hostW / 2;

        var areaTop  = hostY + hostH + 8;
        var areaBot  = H - 10;
        var rowCount = STEPS.filter(function (s) { return s.pkt || s.divider; }).length;
        var pktCount = STEPS.filter(function (s) { return s.pkt; }).length;
        var ROW_H    = Math.floor((areaBot - areaTop) / rowCount);

        return { W, H, mob, pad,
                 F_HOST, F_STATE, F_LABEL, F_SUB,
                 hostW, hostH, hostY,
                 cLineX, sLineX,
                 areaTop, areaBot, ROW_H, pktCount, rowCount };
    }

    function pktRowIdx(sIdx) {
        var n = 0;
        for (var k = 0; k < sIdx; k++) {
            if (STEPS[k] && (STEPS[k].pkt || STEPS[k].divider)) n++;
        }
        return n;
    }

    function dividerRowIdx(divName) {
        var n = 0;
        for (var k = 0; k < STEPS.length; k++) {
            if (STEPS[k].divider === divName) return n;
            if (STEPS[k].pkt || STEPS[k].divider) n++;
        }
        return -1;
    }

    function rowY(L, rowIdx) {
        return L.areaTop + rowIdx * L.ROW_H + L.ROW_H / 2;
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        var L    = buildLayout();
        var step = stepIdx >= 0 ? STEPS[stepIdx] : STEPS[0];

        drawHosts(L, step);
        drawTimelines(L);
        drawDividers(L);
        drawHistory(L);

        if (stepIdx >= 0 && step.pkt) {
            var ri = pktRowIdx(stepIdx);
            if (pktMoving) {
                drawMovingPkt(L, step, pktProg, ri);
            } else {
                var inHist = history.some(function (h) { return h.rowIdx === ri; });
                if (!inHist) drawStaticPkt(L, step, ri);
            }
        }
    }

    /* ===================== 호스트 박스 ===================== */
    function drawHosts(L, step) {
        var cs = step.clientState || 'CLOSED';
        var ss = step.serverState || 'LISTEN';
        var cCol = cs === 'OPEN' ? P.green : cs === 'CONNECTING' ? P.yellow : P.purple;
        var sCol = ss === 'OPEN' ? P.green : P.teal;

        rr(L.cLineX - L.hostW/2, L.hostY, L.hostW, L.hostH, 6, cCol+'22', cCol, 2);
        tx('CLIENT',  L.cLineX, L.hostY + L.hostH * 0.35, L.F_HOST,  cCol,        'center', true);
        tx(cs,        L.cLineX, L.hostY + L.hostH * 0.70, L.F_STATE, cCol + 'cc', 'center', false);

        rr(L.sLineX - L.hostW/2, L.hostY, L.hostW, L.hostH, 6, sCol+'22', sCol, 2);
        tx('SERVER',  L.sLineX, L.hostY + L.hostH * 0.35, L.F_HOST,  sCol,        'center', true);
        tx(ss,        L.sLineX, L.hostY + L.hostH * 0.70, L.F_STATE, sCol + 'cc', 'center', false);
    }

    /* ===================== 타임라인 ===================== */
    function drawTimelines(L) {
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = P.border + 'cc';
        ctx.lineWidth   = 1.5;
        ctx.beginPath(); ctx.moveTo(L.cLineX, L.areaTop); ctx.lineTo(L.cLineX, L.areaBot); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(L.sLineX, L.areaTop); ctx.lineTo(L.sLineX, L.areaBot); ctx.stroke();
        ctx.setLineDash([]);
    }

    /* ===================== 구간 구분선 ===================== */
    function drawDividers(L) {
        if (stepIdx < 0) return;
        var di = dividerRowIdx('ws');
        if (di < 0 || stepIdx < 3) return;

        var divY = rowY(L, di);
        ctx.beginPath();
        ctx.moveTo(L.cLineX, divY);
        ctx.lineTo(L.sLineX, divY);
        ctx.strokeStyle = P.green + '66';
        ctx.lineWidth   = 1;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        tx('── WebSocket 연결 수립 ──', (L.cLineX + L.sLineX) / 2, divY,
           L.mob ? 9 : 11, P.green + 'cc', 'center', false);
    }

    /* ===================== 히스토리 ===================== */
    function drawHistory(L) {
        history.forEach(function (item) {
            drawStaticPkt(L, item.step, item.rowIdx);
        });
    }

    /* ===================== 정적 패킷 ===================== */
    function drawStaticPkt(L, step, rowIdx) {
        if (!step.pkt) return;
        var pkt   = step.pkt;
        var col   = pColor(pkt.color);
        var fromX = pkt.dir === 'c2s' ? L.cLineX : L.sLineX;
        var toX   = pkt.dir === 'c2s' ? L.sLineX : L.cLineX;
        var midX  = (fromX + toX) / 2;
        var ry    = rowY(L, rowIdx);
        var fL    = L.F_LABEL;
        var fS    = L.F_SUB;
        var fL    = L.F_LABEL;
        var fS    = L.F_SUB;
        var G     = 3;
        var lineY, lblY, subY;
        var rowTop = ry - L.ROW_H / 2;
        var rowBot = ry + L.ROW_H / 2;
        if (pkt.dir === 'c2s') {
            lineY = ry + 2;
            lblY  = lineY - G - fL * 0.5;
            subY  = lblY  - fL * 0.5 - G - fS * 0.5;
            if (subY - fS * 0.5 < rowTop + 2) {
                subY  = rowTop + 2 + fS * 0.5;
                lblY  = subY + fS * 0.5 + G + fL * 0.5;
                lineY = lblY + fL * 0.5 + G;
            }
        } else {
            lineY = ry - 2;
            lblY  = lineY + G + fL * 0.5;
            subY  = lblY  + fL * 0.5 + G + fS * 0.5;
            /* 행 하단을 넘지 않도록 클리핑 */
            if (subY + fS * 0.5 > rowBot - 2) {
                subY  = rowBot - 2 - fS * 0.5;
                lblY  = subY - fS * 0.5 - G - fL * 0.5;
                lineY = lblY - fL * 0.5 - G;
            }
        }

        var isWs = pkt.phase === 'ws' || pkt.phase === 'close';
        ctx.beginPath();
        ctx.moveTo(fromX, lineY); ctx.lineTo(toX, lineY);
        ctx.strokeStyle = col + (isWs ? 'ee' : '88');
        ctx.lineWidth   = isWs ? 2 : 1.5;
        if (!isWs) ctx.setLineDash([4, 3]);
        ctx.stroke(); ctx.setLineDash([]);

        var ad = toX > fromX ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(toX, lineY);
        ctx.lineTo(toX - ad*10, lineY - 5);
        ctx.lineTo(toX - ad*10, lineY + 5);
        ctx.closePath();
        ctx.fillStyle = col + (isWs ? 'ee' : '88');
        ctx.fill();

        tx(pkt.label, midX, lblY, fL, col, 'center', true);
        tx(pkt.sub,   midX, subY, fS, col + 'aa', 'center', false);
    }

    /* ===================== 이동 중 패킷 ===================== */
    function drawMovingPkt(L, step, prog, rowIdx) {
        if (!step.pkt) return;
        var pkt   = step.pkt;
        var col   = pColor(pkt.color);
        var fromX = pkt.dir === 'c2s' ? L.cLineX : L.sLineX;
        var toX   = pkt.dir === 'c2s' ? L.sLineX : L.cLineX;
        var ry    = rowY(L, rowIdx);
        var lineY = pkt.dir === 'c2s' ? ry + 2 : ry - 2;
        var cx    = fromX + (toX - fromX) * prog;
        var r     = L.mob ? 14 : 18;

        ctx.beginPath(); ctx.moveTo(fromX, lineY); ctx.lineTo(cx, lineY);
        ctx.strokeStyle = col + '55'; ctx.lineWidth = 1.5; ctx.stroke();

        ctx.beginPath(); ctx.arc(cx, lineY, r, 0, Math.PI * 2);
        ctx.fillStyle = col + '22'; ctx.fill();
        ctx.strokeStyle = col;
        ctx.lineWidth = (pkt.phase === 'ws' || pkt.phase === 'close') ? 3 : 2;
        ctx.stroke();

        tx(pkt.phase === 'http' ? 'HTTP' : 'WS', cx, lineY, L.F_SUB, col, 'center', true);

        var lblY = pkt.dir === 'c2s' ? lineY - r - 6 : lineY + r + 6;
        tx(pkt.label, cx, lblY, L.F_SUB, col + 'cc', 'center', false);
    }

    /* ===================== 애니메이션 ===================== */
    function animateStep(step, cb) {
        if (!step.pkt) { pktProg = 1; draw(); if (cb) cb(); return; }
        pktProg   = 0;
        pktMoving = true;
        if (rafId) cancelAnimationFrame(rafId);
        var s = 0.007 * (1800 / speed);
        (function tick() {
            pktProg = Math.min(1, pktProg + s);
            draw();
            if (pktProg < 1) {
                rafId = requestAnimationFrame(tick);
            } else {
                pktMoving = false;
                draw();
                if (cb) cb();
            }
        })();
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) {
        root.querySelectorAll('.ws-viz__speed-btn').forEach(function (b) { b.disabled = v; });
    }

    function applyStep(idx, onDone) {
        stepIdx = idx;
        var step = STEPS[idx];
        logEl.textContent = step.log;
        animateStep(step, function () {
            if (step.pkt) {
                history.push({ step: step, rowIdx: pktRowIdx(idx) });
                draw();
            }
            if (onDone) setTimeout(onDone, 0);
        });
    }

    function wsStart() {
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
                    timer = setTimeout(tick, speed);
                }
            });
        }
        tick();
    }

    function wsStep() {
        if (running || pktMoving) return;
        var next = stepIdx + 1;
        if (next >= STEPS.length) return;
        applyStep(next, null);
        if (next === STEPS.length - 1) { btnPlay.disabled = true; btnStep.disabled = true; }
    }

    function wsReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false; stepIdx = -1; pktProg = 1; pktMoving = false; history = [];
        logEl.textContent = '▶ PLAY를 눌러 WebSocket 연결 과정을 확인하세요.';
        btnPlay.disabled = false; btnStep.disabled = false;
        setSpeedDisabled(false);
        draw();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.ws-viz__speed-btn').forEach(function (b) {
            b.classList.remove('ws-viz__speed-btn--active');
        });
        btn.classList.add('ws-viz__speed-btn--active');
    }

    window.CsFlow.createVizLifecycle({
        canvas, canvasWrap, resize, draw,
        getState : function () { return { rafId: rafId, timer: timer, running: running }; },
        setState : function (s) { rafId = s.rafId; timer = s.timer; running = s.running; },
        onPause  : function () { setSpeedDisabled(false); },
        getMouseCtx: function () {
            return { GW, GH, mousePos:{x:-1,y:-1}, tooltipHits:[],
                     hoveredKey:function(){return null;}, setHoveredKey:function(){}, draw };
        },
    });

    setTimeout(resize, 60);
})();