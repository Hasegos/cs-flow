/**
 * HTTPS / TLS 시각화 — TLS 1.3 핸드셰이크
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
    const root    = el('div', 'tls-viz');
    const toolbar = el('div', 'tls-viz__toolbar');
    const tbLeft  = el('div', 'tls-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'tls-viz__title', 'TLS 1.3 Handshake'));
    tbLeft.appendChild(el('span', 'tls-viz__badge tls-viz__badge--tls', 'HTTPS'));
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'tls-viz__speed');
    speedWrap.appendChild(el('span', 'tls-viz__speed-label', 'SPEED'));
    [['1x', 1800], ['2x', 900], ['3x', 600]].forEach(function (pair, i) {
        const b = el('button', 'tls-viz__speed-btn' + (i === 0 ? ' tls-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'tls-viz__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'tls-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const logEl = el('div', 'tls-viz__log', '▶ PLAY를 눌러 TLS 1.3 핸드셰이크 과정을 확인하세요.');
    root.appendChild(logEl);

    const controls = el('div', 'tls-viz__controls');
    const btnPlay  = el('button', 'tls-viz__btn tls-viz__btn--primary', '▶ PLAY');
    const btnStep  = el('button', 'tls-viz__btn', '▶| STEP');
    const btnReset = el('button', 'tls-viz__btn', '↺ RESET');
    btnPlay.addEventListener('click',  tlsStart);
    btnStep.addEventListener('click',  tlsStep);
    btnReset.addEventListener('click', tlsReset);
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
        const w   = canvasWrap.offsetWidth  || 320;
        const mob = w < 520;
        const minH = (mob ? 50 : 62) * 9 + (mob ? 44 : 52) + (mob ? 20 : 26) + 8 + 20;
        const h   = Math.max(canvasWrap.offsetHeight || 0, minH);
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    let P = window.CsFlow.getP();

    /* ===================== 시나리오 정의 ===================== */
    var STEPS = [
        {
            log: '초기 상태. 브라우저가 https://example.com에 접속합니다. TLS 핸드셰이크 전에 TCP 3-way handshake로 연결을 수립합니다.',
            pkt: null,
            clientState: 'CLOSED', serverState: 'LISTEN',
            phase: 'init',
        },
        {
            log: 'Step 1 — TCP SYN. TCP 연결 수립 시작. TLS는 TCP 위에서 동작합니다.',
            pkt: { dir: 'c2s', label: 'TCP SYN', sub: 'port 443', color: 'muted', phase: 'tcp' },
            clientState: 'SYN_SENT', serverState: 'LISTEN',
        },
        {
            log: 'Step 2 — TCP SYN+ACK / ACK. TCP 연결 수립 완료. 이제 TLS 핸드셰이크를 시작합니다.',
            pkt: { dir: 's2c', label: 'TCP SYN+ACK', sub: 'TCP 연결 수립', color: 'muted', phase: 'tcp' },
            clientState: 'ESTABLISHED', serverState: 'ESTABLISHED',
        },
        {
            log: 'Step 3 — ClientHello. 클라이언트가 지원하는 TLS 버전, 암호 스위트 목록, 클라이언트 랜덤값, ECDHE 공개키를 전송합니다. 이 메시지는 평문입니다.',
            pkt: { dir: 'c2s', label: 'ClientHello', sub: 'TLS 1.3 | ECDHE 공개키 | 암호 스위트', color: 'purple', phase: 'hello' },
            clientState: 'ESTABLISHED', serverState: 'ESTABLISHED',
        },
        {
            log: 'Step 4 — ServerHello. 서버가 선택한 암호 스위트, 서버 랜덤값, ECDHE 공개키를 응답합니다. 클라이언트와 서버 모두 이 시점에 동일한 세션 키를 계산할 수 있습니다.',
            pkt: { dir: 's2c', label: 'ServerHello', sub: 'TLS_AES_256_GCM | ECDHE 공개키', color: 'teal', phase: 'hello' },
            clientState: 'ESTABLISHED', serverState: 'ESTABLISHED',
        },
        {
            log: 'Step 5 — Certificate + CertificateVerify. 서버가 인증서(공개키 + CA 서명)와 서명을 전송합니다. 클라이언트는 CA 체인을 검증해 서버 신원을 확인합니다. 이미 암호화됩니다.',
            pkt: { dir: 's2c', label: 'Certificate', sub: 'example.com 인증서 | CA 서명 검증', color: 'green', phase: 'cert', encrypted: true },
            clientState: 'ESTABLISHED', serverState: 'ESTABLISHED',
        },
        {
            log: 'Step 6 — Server Finished. 서버가 핸드셰이크 메시지의 MAC을 전송합니다. 클라이언트는 이를 검증해 핸드셰이크 무결성을 확인합니다. 서버 측 핸드셰이크 완료.',
            pkt: { dir: 's2c', label: 'Finished', sub: 'HMAC 검증 | 서버 핸드셰이크 완료', color: 'green', phase: 'fin', encrypted: true },
            clientState: 'ESTABLISHED', serverState: 'TLS_READY',
        },
        {
            log: 'Step 7 — Client Finished. 클라이언트가 핸드셰이크 MAC을 전송하며 핸드셰이크를 완료합니다. 총 1-RTT 핸드셰이크 완료. 양쪽 모두 동일한 세션 키를 보유합니다.',
            pkt: { dir: 'c2s', label: 'Finished', sub: 'HMAC 검증 | 1-RTT 핸드셰이크 완료', color: 'purple', phase: 'fin', encrypted: true },
            clientState: 'TLS_READY', serverState: 'TLS_READY',
        },
        {
            log: 'Step 8 — 암호화된 HTTP 요청. TLS 터널이 수립됐습니다. 이제 모든 HTTP 데이터가 AES-256-GCM으로 암호화됩니다. 도청자는 암호문만 볼 수 있습니다.',
            pkt: { dir: 'c2s', label: '🔒 GET /index.html', sub: 'AES-256-GCM 암호화', color: 'yellow', phase: 'data', encrypted: true },
            clientState: 'TLS_READY', serverState: 'TLS_READY',
        },
        {
            log: 'Step 9 — 암호화된 HTTP 응답 ✓  서버가 암호화된 응답을 전송합니다. HTTPS 통신 완료. 인증(Certificate) + 기밀성(AES) + 무결성(HMAC)이 모두 보장됩니다.',
            pkt: { dir: 's2c', label: '🔒 200 OK', sub: 'AES-256-GCM 암호화 | 통신 완료 ✓', color: 'yellow', phase: 'data', encrypted: true },
            clientState: 'TLS_READY', serverState: 'TLS_READY',
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
        if (name === 'yellow') return P.yellow;
        if (name === 'orange') return P.orange;
        if (name === 'muted')  return P.muted;
        return P.purple;
    }

    /* ===================== 레이아웃 ===================== */
    function buildLayout() {
        const W   = GW(), H = GH();
        const mob = W < 520;
        const pad = mob ? 10 : 24;

        const F_HOST  = mob ? 13 : 14;
        const F_STATE = mob ? 10 : 11;
        const F_LABEL = mob ? 12 : 14;
        const F_SUB   = mob ? 11 : 12;

        const hostW = mob ? 80 : 110;
        const hostH = mob ? 44 : 52;
        const hostY = mob ? 20 : 26;

        const cLineX = pad + hostW / 2;
        const sLineX = W - pad - hostW / 2;

        const lineTop = hostY + hostH + 8;
        const lineBot = H - 20;

        var pktCount = STEPS.filter(function (s) { return s.pkt; }).length;
        var avail    = lineBot - lineTop;
        var ROW_H    = Math.max(mob ? 50 : 62,
                                Math.floor(avail / pktCount));

        return { W, H, mob, pad,
                 F_HOST, F_STATE, F_LABEL, F_SUB,
                 hostW, hostH, hostY,
                 cLineX, sLineX, lineTop, lineBot,
                 ROW_H, pktCount };
    }

    function pktRowIdx(sIdx) {
        var n = 0;
        for (var k = 0; k < sIdx; k++) {
            if (STEPS[k] && STEPS[k].pkt) n++;
        }
        return n;
    }

    function rowY(L, rowIdx) {
        return L.lineTop + rowIdx * L.ROW_H + L.ROW_H / 2;
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());

        const L    = buildLayout();
        const step = stepIdx >= 0 ? STEPS[stepIdx] : STEPS[0];

        drawHosts(L, step);
        drawTimelines(L);
        drawPhaseDividers(L);
        drawHistory(L);

        if (stepIdx >= 0 && step.pkt) {
            var ri = pktRowIdx(stepIdx);
            if (pktMoving) {
                drawMovingPkt(L, step, pktProg, ri);
            } else {
                /* history에 없을 때만 직접 그림 (push 전 순간) */
                var inHist = history.some(function (h) { return h.rowIdx === ri; });
                if (!inHist) drawStaticPkt(L, step, ri);
            }
        }
    }

    /* ===================== 호스트 박스 ===================== */
    function drawHosts(L, step) {
        const { pad, hostW, hostH, hostY, cLineX, sLineX, F_HOST, F_STATE, mob } = L;
        var cs = step.clientState || 'CLOSED';
        var ss = step.serverState || 'LISTEN';

        var cReady = cs === 'TLS_READY';
        var sReady = ss === 'TLS_READY';

        var cCol = cReady ? P.green  : P.purple;
        var sCol = sReady ? P.green  : P.teal;

        rr(cLineX - hostW / 2, hostY, hostW, hostH, 6, cCol + '22', cCol, 2);
        tx('BROWSER', cLineX, hostY + hostH * 0.35, F_HOST, cCol, 'center', true);
        tx(cs,        cLineX, hostY + hostH * 0.70, F_STATE, cCol + 'cc', 'center', false);

        rr(sLineX - hostW / 2, hostY, hostW, hostH, 6, sCol + '22', sCol, 2);
        tx('SERVER',  sLineX, hostY + hostH * 0.35, F_HOST, sCol, 'center', true);
        tx(ss,        sLineX, hostY + hostH * 0.70, F_STATE, sCol + 'cc', 'center', false);

        if (cReady && sReady) {
            tx('🔒', cLineX - hostW / 2 + (mob ? 10 : 14), hostY + hostH * 0.35, mob ? 12 : 14, P.green, 'center', false);
            tx('🔒', sLineX + hostW / 2 - (mob ? 10 : 14), hostY + hostH * 0.35, mob ? 12 : 14, P.green, 'center', false);
        }
    }

    /* ===================== 타임라인 수직선 ===================== */
    function drawTimelines(L) {
        const { cLineX, sLineX, lineTop, lineBot } = L;
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = P.border + 'cc';
        ctx.lineWidth   = 1.5;
        ctx.beginPath(); ctx.moveTo(cLineX, lineTop); ctx.lineTo(cLineX, lineBot); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sLineX, lineTop); ctx.lineTo(sLineX, lineBot); ctx.stroke();
        ctx.setLineDash([]);
    }

    /* ===================== 페이즈 구분선 ===================== */
    function drawPhaseDividers(L) {
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
        var pkt    = step.pkt;
        var col    = pColor(pkt.color);
        var fromX  = pkt.dir === 'c2s' ? L.cLineX : L.sLineX;
        var toX    = pkt.dir === 'c2s' ? L.sLineX : L.cLineX;
        var ry     = rowY(L, rowIdx);
        var midX   = (fromX + toX) / 2;

        var fL     = L.F_LABEL;
        var fS     = L.F_SUB;
        var margin = 4;
        var lineY, lblY, subY;
        if (pkt.dir === 'c2s') {
            lineY = ry + L.ROW_H * 0.20;
            lblY  = lineY - margin - fL * 0.5;
            subY  = lblY  - fL * 0.5 - margin - fS * 0.5;
        } else {
            lineY = ry - L.ROW_H * 0.20;
            lblY  = lineY + margin + fL * 0.5;
            subY  = lblY  + fL * 0.5 + margin + fS * 0.5;
        }

        ctx.beginPath();
        ctx.moveTo(fromX, lineY);
        ctx.lineTo(toX,   lineY);
        ctx.strokeStyle = pkt.encrypted ? col + 'dd' : col + '88';
        ctx.lineWidth   = pkt.encrypted ? 2 : 1.5;
        if (!pkt.encrypted) ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        var ad = toX > fromX ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(toX, lineY);
        ctx.lineTo(toX - ad * 10, lineY - 5);
        ctx.lineTo(toX - ad * 10, lineY + 5);
        ctx.closePath();
        ctx.fillStyle = pkt.encrypted ? col + 'dd' : col + '88';
        ctx.fill();

        tx(pkt.label, midX, lblY, L.F_LABEL, col, 'center', true);
        tx(pkt.sub,   midX, subY, L.F_SUB,   col + 'aa', 'center', false);
    }

    /* ===================== 이동 중 패킷 ===================== */
    function drawMovingPkt(L, step, prog, rowIdx) {
        if (!step.pkt) return;
        var pkt     = step.pkt;
        var col     = pColor(pkt.color);
        var fromX   = pkt.dir === 'c2s' ? L.cLineX : L.sLineX;
        var toX     = pkt.dir === 'c2s' ? L.sLineX : L.cLineX;
        var ry      = rowY(L, rowIdx);
        var lineY = pkt.dir === 'c2s'
                  ? ry + L.ROW_H * 0.20
                  : ry - L.ROW_H * 0.20;
        var cx      = fromX + (toX - fromX) * prog;

        ctx.beginPath();
        ctx.moveTo(fromX, lineY);
        ctx.lineTo(cx, lineY);
        ctx.strokeStyle = col + '55';
        ctx.lineWidth   = 1.5;
        ctx.stroke();

        var r = L.mob ? 14 : 18;
        ctx.beginPath(); ctx.arc(cx, lineY, r, 0, Math.PI * 2);
        ctx.fillStyle   = col + '22'; ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = pkt.encrypted ? 3 : 2; ctx.stroke();

        if (pkt.encrypted) {
            tx('🔒', cx, lineY, L.mob ? 14 : 16, col, 'center', false);
        } else {
            tx(pkt.phase === 'tcp' ? 'TCP' : 'TLS', cx, lineY, L.F_SUB, col, 'center', true);
        }

        var lblY = pkt.dir === 'c2s' ? lineY - r - 8 : lineY + r + 8;
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
        root.querySelectorAll('.tls-viz__speed-btn').forEach(function (b) { b.disabled = v; });
    }

    function applyStep(idx, onDone) {
        stepIdx = idx;
        var step = STEPS[idx];
        logEl.textContent = step.log;
        animateStep(step, function () {
            if (step.pkt) {
                history.push({ step: step, rowIdx: pktRowIdx(idx) });
            }
            if (onDone) setTimeout(onDone, 0);
        });
    }

    function tlsStart() {
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

    function tlsStep() {
        if (running || pktMoving) return;
        var next = stepIdx + 1;
        if (next >= STEPS.length) return;
        applyStep(next, null);
        if (next === STEPS.length - 1) { btnPlay.disabled = true; btnStep.disabled = true; }
    }

    function tlsReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false; stepIdx = -1; pktProg = 1; pktMoving = false; history = [];
        logEl.textContent = '▶ PLAY를 눌러 TLS 1.3 핸드셰이크 과정을 확인하세요.';
        btnPlay.disabled = false; btnStep.disabled = false;
        setSpeedDisabled(false);
        draw();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.tls-viz__speed-btn').forEach(function (b) {
            b.classList.remove('tls-viz__speed-btn--active');
        });
        btn.classList.add('tls-viz__speed-btn--active');
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