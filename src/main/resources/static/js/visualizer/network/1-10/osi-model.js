/**
 * OSI 7계층 시각화
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
    const root    = el('div', 'osi-viz');
    const toolbar = el('div', 'osi-viz__toolbar');
    const tbLeft  = el('div', 'osi-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'osi-viz__title', 'OSI 7-Layer Model'));
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'osi-viz__speed');
    speedWrap.appendChild(el('span', 'osi-viz__speed-label', 'SPEED'));
    [['1x', 1800], ['2x', 900], ['3x', 600]].forEach(function (pair, i) {
        const b = el('button', 'osi-viz__speed-btn' + (i === 0 ? ' osi-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'osi-viz__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'osi-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const logEl = el('div', 'osi-viz__log', '▶ PLAY를 눌러 OSI 7계층 캡슐화 흐름을 확인하세요.');
    root.appendChild(logEl);

    const controls = el('div', 'osi-viz__controls');
    const btnPlay  = el('button', 'osi-viz__btn osi-viz__btn--primary', '▶ PLAY');
    const btnStep  = el('button', 'osi-viz__btn', '▶| STEP');
    const btnReset = el('button', 'osi-viz__btn', '↺ RESET');
    btnPlay.addEventListener('click',  osiStart);
    btnStep.addEventListener('click',  osiStep);
    btnReset.addEventListener('click', osiReset);
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
        const h = Math.max(canvasWrap.offsetHeight, w < 520 ? 600 : 520);
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    let P = window.CsFlow.getP();

    /* ===================== 계층 정의 ===================== */
    const LAYERS = [
        { num: 7, name: 'Application',  unit: 'Message', proto: 'HTTP / DNS / SMTP'  },
        { num: 6, name: 'Presentation', unit: 'Message', proto: 'SSL/TLS / JPEG'     },
        { num: 5, name: 'Session',      unit: 'Message', proto: 'NetBIOS / RPC'      },
        { num: 4, name: 'Transport',    unit: 'Segment', proto: 'TCP / UDP'          },
        { num: 3, name: 'Network',      unit: 'Packet',  proto: 'IPv4 / IPv6 / ICMP' },
        { num: 2, name: 'Data Link',    unit: 'Frame',   proto: 'Ethernet / Wi-Fi'   },
        { num: 1, name: 'Physical',     unit: 'Bit',     proto: 'Cable / Wi-Fi'      },
    ];

    function layerColor(idx) {
        return [
            '#6C63FF',
            '#9B8FF7',
            '#4ECDC4',
            '#45B7D1',
            '#F7B731',
            '#F59E0B',
            '#EF4444',
        ][idx] || P.purple;
    }

    var HDR_LABEL = ['', '', '', 'TCP', 'IP', 'ETH', ''];

    /* ===================== 시나리오 ===================== */
    const STEPS = [
        {
            log: 'Step 1 — 송신 호스트 Application 계층. 사용자가 HTTP 요청을 생성합니다. 아직 헤더가 없는 순수 데이터(Message) 상태입니다.',
            phase: 'enc', activeLayer: 0,
        },
        {
            log: 'Step 2 — Transport 계층. TCP 헤더(출발지·목적지 포트, 시퀀스 번호)를 앞에 붙입니다. 데이터 단위가 세그먼트(Segment)가 됩니다.',
            phase: 'enc', activeLayer: 3,
        },
        {
            log: 'Step 3 — Network 계층. IP 헤더(출발지·목적지 IP 주소, TTL)를 앞에 붙입니다. 데이터 단위가 패킷(Packet)이 됩니다. 라우터가 이 헤더를 보고 경로를 결정합니다.',
            phase: 'enc', activeLayer: 4,
        },
        {
            log: 'Step 4 — Data Link 계층. Ethernet 헤더(MAC 주소)와 트레일러(FCS)를 붙입니다. 데이터 단위가 프레임(Frame)이 됩니다.',
            phase: 'enc', activeLayer: 5,
        },
        {
            log: 'Step 5 — Physical 계층. 프레임을 전기·광·무선 신호(비트 스트림)로 변환해 전송 매체로 내보냅니다. 캡슐화 완료.',
            phase: 'enc', activeLayer: 6,
        },
        {
            log: 'Step 6 — 비트 스트림이 물리 매체를 통해 수신 호스트로 이동합니다. 라우터가 IP 헤더를 읽어 경로를 결정하며 중간 전달합니다.',
            phase: 'travel', activeLayer: 6,
        },
        {
            log: 'Step 7 — 수신 호스트 Physical → Data Link. 비트를 프레임으로 복원하고 Ethernet 헤더·트레일러를 제거합니다. CRC로 오류를 검사합니다.',
            phase: 'dec', activeLayer: 5,
        },
        {
            log: 'Step 8 — Network → Transport → Application. IP·TCP 헤더를 순서대로 제거하고 순서 재조합·신뢰성 확인 후 Application에 전달 — 역캡슐화 완료 ✓',
            phase: 'dec', activeLayer: 0,
            done: true,
        },
    ];

    let stepIdx = -1;
    let running = false;
    let timer   = null;
    let rafId   = null;
    let speed   = 1800;
    let pktProg = 1;

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
        if (fill)   { ctx.fillStyle   = fill;   ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
    }

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
        const pad = mob ? 6 : 14;

        const F_NAME  = mob ? 12 : 14;
        const F_PROTO = mob ? 10 : 12;
        const F_UNIT  = mob ? 10 : 12;
        const F_NUM   = mob ? 10 : 12;
        const F_COL   = mob ? 11 : 12;
        const F_PKT   = mob ? 10 : 12;
        const F_HDR   = mob ?  9 : 11;

        const midW   = mob ? 36 : 60;
        const colW   = Math.floor((W - pad * 2 - midW) / 2);
        const leftX  = pad;
        const midX   = pad + colW;
        const rightX = pad + colW + midW;


        const numW    = mob ? 20 : 28;
        const pduW    = mob ?  0 : 100;
        const infoW   = Math.max(30, colW - numW - (mob ? 4 : pduW + 4));

        const mobPduH = mob ? 30 : 0;

        const topY   = mob ? 34 : 38;
        const totalH = H - topY - 10;
        const layerH = Math.max(mob ? 46 : 58,
                       Math.floor((totalH - mobPduH) / 7));

        return {
            W, H, mob, pad,
            F_NAME, F_PROTO, F_UNIT, F_NUM, F_COL, F_PKT, F_HDR,
            colW, midW, midX, leftX, rightX,
            numW, pduW, infoW, mobPduH,
            topY, layerH,
        };
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());

        const L    = buildLayout();
        const step = stepIdx >= 0 ? STEPS[stepIdx] : STEPS[0];

        drawColumnLabels(L, step);
        drawLayers(L, step);
        drawMidArrow(L, step);
        if (step.phase === 'travel' && pktProg < 1) drawTravelPkt(L);
    }

    /* ===================== 컬럼 레이블 ===================== */
    function drawColumnLabels(L, step) {
        const { leftX, colW, rightX, midX, midW, F_COL, topY } = L;
        const cy = topY - 16;
        tx('송신 호스트', leftX  + colW / 2, cy, F_COL, P.purple + 'cc', 'center', true);
        tx('수신 호스트', rightX + colW / 2, cy, F_COL, P.teal   + 'cc', 'center', true);
        tx('전송 매체',   midX   + midW / 2, cy, F_COL - 1, P.muted + 'aa', 'center', false);
    }

    /* ===================== 계층 행 ===================== */
    function calcRowY(L, step, targetIdx) {
        var y = L.topY;
        for (var k = 0; k < targetIdx; k++) {
            y += L.layerH;
            if (L.mob && k === step.activeLayer) y += L.mobPduH;
        }
        return y;
    }

    function drawLayers(L, step) {
        const { leftX, rightX, colW, topY, layerH,
                numW, pduW, infoW, mobPduH,
                F_NAME, F_PROTO, F_NUM, F_PKT, F_HDR, mob } = L;

        LAYERS.forEach(function (layer, i) {
            const rowY = calcRowY(L, step, i);
            const col  = layerColor(i);

            var isEncActive = step.phase === 'enc' && i === step.activeLayer;
            var isDecActive = step.phase === 'dec' && i === step.activeLayer;

            var encFilled = (step.phase === 'enc' && i >= step.activeLayer)
                          || step.phase === 'travel'
                          || step.phase === 'dec'
                          || step.done;
            var decFilled = (step.phase === 'dec' && i >= step.activeLayer)
                          || step.done;

            var sFill   = encFilled  ? col + '1e' : P.surf;
            var sStroke = isEncActive ? col : (encFilled ? col + '99' : P.border);
            rr(leftX,  rowY + 1, colW, layerH - 2, 5, sFill,  sStroke,  isEncActive ? 2.5 : 1.5);

            var dFill   = decFilled  ? col + '1e' : P.surf;
            var dStroke = isDecActive ? col : (decFilled ? col + '99' : P.border);
            rr(rightX, rowY + 1, colW, layerH - 2, 5, dFill,  dStroke,  isDecActive ? 2.5 : 1.5);

            var numColor = (isEncActive || isDecActive) ? col : (encFilled ? col + 'bb' : P.muted);
            tx('L' + layer.num, leftX  + numW / 2, rowY + layerH / 2, L.F_NUM, numColor, 'center', isEncActive);
            tx('L' + layer.num, rightX + numW / 2, rowY + layerH / 2, L.F_NUM, numColor, 'center', isDecActive);

            var lInfoX = leftX  + numW + 4;
            var rInfoX = rightX + numW + 4;
            var nameY  = rowY + layerH * (mob ? 0.38 : 0.36);
            var protoY = rowY + layerH * (mob ? 0.70 : 0.68);
            var lNameCol = isEncActive ? col : (encFilled ? col + 'dd' : P.muted + 'aa');
            var rNameCol = isDecActive ? col : (decFilled ? col + 'dd' : P.muted + 'aa');

            ctx.save();
            ctx.beginPath(); ctx.rect(lInfoX, rowY + 1, infoW, layerH - 2); ctx.clip();
            tx(layer.name,  lInfoX, nameY,  L.F_NAME,  lNameCol,      'left', isEncActive);
            tx(layer.proto, lInfoX, protoY, L.F_PROTO, P.muted + '88','left', false);
            ctx.restore();

            ctx.save();
            ctx.beginPath(); ctx.rect(rInfoX, rowY + 1, infoW, layerH - 2); ctx.clip();
            tx(layer.name,  rInfoX, nameY,  L.F_NAME,  rNameCol,      'left', isDecActive);
            tx(layer.proto, rInfoX, protoY, L.F_PROTO, P.muted + '88','left', false);
            ctx.restore();

            if (!mob) {
                var pduX  = leftX  + colW - pduW;
                var dPduX = rightX + colW - pduW;
                var pH    = layerH - 8;
                drawPduBox(i, step, pduX,  rowY + 4, pduW, pH, col, L.F_PKT, L.F_HDR, mob, false);
                drawPduBox(i, step, dPduX, rowY + 4, pduW, pH, col, L.F_PKT, L.F_HDR, mob, true);
            } else {
                var isActive = isEncActive || isDecActive || (step.done && i === 0);
                if (isActive) {
                    var mobPduY = rowY + layerH;
                    var mobPduW = leftX + colW * 2 + L.midW;
                    drawPduBoxMob(i, step, leftX, mobPduY, mobPduW, mobPduH - 2,
                                  col, L.F_PKT, L.F_HDR);
                }
            }
        });
    }

    /* ===================== PDU 박스 그리기 ===================== */
    function drawPduBox(i, step, pduX, pduY, pduW, pH, col, F_PKT, F_HDR, mob, isRight) {
        var showEnc  = !isRight && step.phase === 'enc'    && i === step.activeLayer;
        var showDec  = isRight  && step.phase === 'dec'    && i === step.activeLayer;
        var showDone = step.done && i === 0;

        if (!showEnc && !showDec && !showDone) return;

        if (showDone) {
            var doneCol = isRight ? P.green : col;
            var label   = isRight ? 'DATA ✓' : 'DATA';
            rr(pduX, pduY, pduW, pH, 4, doneCol + '22', doneCol, 2);
            tx(label, pduX + pduW / 2, pduY + pH / 2, F_PKT, doneCol, 'center', true);
            return;
        }

        var hdrCount;
        if (showEnc) {
            hdrCount = step.activeLayer <= 3 ? 1
                     : step.activeLayer === 4 ? 2
                     : step.activeLayer >= 5  ? 3 : 0;
            if (step.activeLayer === 0) hdrCount = 0;
        } else {
            hdrCount = step.activeLayer === 5 ? 2
                     : step.activeLayer === 0 ? 0 : 1;
        }

        var hdrW = hdrCount > 0 ? Math.floor(pduW / (hdrCount + 2)) : 0;
        var datW = pduW - hdrCount * hdrW;

        var hdrLabels = showEnc
            ? ['ETH', 'IP', 'TCP'].slice(0, hdrCount)
            : ['TCP', 'IP', 'ETH'].slice(0, hdrCount);
        var hdrColors = showEnc
            ? [layerColor(5), layerColor(4), layerColor(3)].slice(0, hdrCount)
            : [layerColor(3), layerColor(4), layerColor(5)].slice(0, hdrCount);

        ctx.save();
        ctx.beginPath();
        ctx.rect(pduX, pduY, pduW, pH);
        ctx.clip();

        for (var h = 0; h < hdrCount; h++) {
            var hx = pduX + h * hdrW;
            rr(hx, pduY, hdrW, pH, 2, hdrColors[h] + '33', hdrColors[h] + 'bb', 1.5);
            if (hdrW >= 20) {
                tx(hdrLabels[h], hx + hdrW / 2, pduY + pH / 2, F_HDR, hdrColors[h], 'center', true);
            }
        }

        var datX = pduX + hdrCount * hdrW;
        rr(datX, pduY, datW, pH, 3, col + '2a', col, 2);
        tx('DATA', datX + datW / 2, pduY + pH / 2, F_PKT, col, 'center', true);

        ctx.restore();
    }

    /* ===================== 모바일 PDU 행 (활성 계층 아래 풀 너비) ===================== */
    function drawPduBoxMob(i, step, x, y, w, h, col, F_PKT, F_HDR) {
        if (h <= 0 || w <= 0) return;

        var isEnc  = step.phase === 'enc'  && i === step.activeLayer;
        var isDec  = step.phase === 'dec'  && i === step.activeLayer;
        var isDone = step.done && i === 0;
        if (!isEnc && !isDec && !isDone) return;

        var hdrCount;
        if (isEnc) {
            hdrCount = step.activeLayer === 0 ? 0
                     : step.activeLayer <= 3  ? 1
                     : step.activeLayer === 4 ? 2 : 3;
        } else if (isDec) {
            hdrCount = step.activeLayer === 0 ? 0
                     : step.activeLayer === 5 ? 2 : 1;
        } else {
            hdrCount = 0;
        }

        var hdrLabels = isEnc
            ? ['ETH','IP','TCP'].slice(0, hdrCount)
            : ['TCP','IP','ETH'].slice(0, hdrCount);
        var hdrColors = isEnc
            ? [layerColor(5), layerColor(4), layerColor(3)].slice(0, hdrCount)
            : [layerColor(3), layerColor(4), layerColor(5)].slice(0, hdrCount);

        var parts  = hdrCount + 2;
        var unit   = Math.floor(w / parts);
        var hdrW   = unit;
        var datW   = w - hdrCount * hdrW;

        rr(x, y, w, h, 4, col + '12', col + '44', 1);

        for (var h2 = 0; h2 < hdrCount; h2++) {
            var hx = x + h2 * hdrW;
            rr(hx, y, hdrW, h, 2, hdrColors[h2] + '33', hdrColors[h2] + 'cc', 1.5);
            tx(hdrLabels[h2], hx + hdrW / 2, y + h / 2, F_HDR + 1, hdrColors[h2], 'center', true);
        }

        var datX   = x + hdrCount * hdrW;
        var doneCol = isDone ? P.green : col;
        var label   = isDone ? 'DATA ✓' : 'DATA';
        rr(datX, y, datW, h, 3, doneCol + '2a', doneCol, 2);
        tx(label, datX + datW / 2, y + h / 2, F_PKT + 1, doneCol, 'center', true);
    }

    /* ===================== 중앙 화살표 / 방향 표시 ===================== */
    function drawMidArrow(L, step) {
        const { topY, layerH, midX, midW, mob } = L;

        var y1  = calcRowY(L, step, 0) + layerH / 2;
        var y2  = calcRowY(L, step, 6) + layerH / 2;
        var cx  = midX + midW / 2;
        var fSz = mob ? 10 : 11;

        if (step.phase === 'enc' || step.phase === 'travel') {
            tx('캡슐화', cx, topY - 2, fSz, P.purple + 'cc', 'center', true);
            drawVertArrow(cx, y1, y2, P.purple + '99');
        }

        if (step.phase === 'dec' || step.done) {
            tx('역캡슐화', cx, topY - 2, fSz, P.teal + 'cc', 'center', true);
            drawVertArrow(cx, y2, y1, P.teal + '99');
        }

        if (step.phase === 'travel') {
            var phy = calcRowY(L, step, 6) + layerH / 2;
            ctx.beginPath();
            ctx.moveTo(midX + 2, phy);
            ctx.lineTo(midX + midW - 2, phy);
            ctx.strokeStyle = P.yellow + '99';
            ctx.lineWidth   = 2;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(midX + midW - 2, phy);
            ctx.lineTo(midX + midW - 10, phy - 5);
            ctx.lineTo(midX + midW - 10, phy + 5);
            ctx.closePath();
            ctx.fillStyle = P.yellow + '99';
            ctx.fill();
        }
    }

    function drawVertArrow(x, y1, y2, col) {
        var goDown = y2 > y1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, y1);
        ctx.lineTo(x, y2);
        ctx.strokeStyle = col;
        ctx.lineWidth   = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
        var tip  = y2;
        var base = goDown ? y2 - 10 : y2 + 10;
        ctx.beginPath();
        ctx.moveTo(x, tip);
        ctx.lineTo(x - 5, base);
        ctx.lineTo(x + 5, base);
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();
    }

    /* ===================== 이동 패킷 (travel) ===================== */
    function drawTravelPkt(L) {
        const { midX, midW, topY, layerH } = L;
        var y   = topY + layerH * 6.5;
        var x   = midX + midW * pktProg;
        var col = P.yellow;
        ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2);
        ctx.fillStyle   = col + '33'; ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();
        tx('BIT', x, y, 11, col, 'center', true);
    }

    /* ===================== 애니메이션 ===================== */
    function animateStep(step, cb) {
        var needsAnim = step.phase === 'travel';
        pktProg = needsAnim ? 0 : 1;
        if (!needsAnim) { draw(); if (cb) cb(); return; }
        if (rafId) cancelAnimationFrame(rafId);
        var s = 0.007 * (1800 / speed);
        (function tick() {
            pktProg = Math.min(1, pktProg + s);
            draw();
            if (pktProg < 1) { rafId = requestAnimationFrame(tick); }
            else { draw(); if (cb) cb(); }
        })();
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) {
        root.querySelectorAll('.osi-viz__speed-btn').forEach(function (b) { b.disabled = v; });
    }

    function applyStep(idx, onDone) {
        stepIdx = idx;
        logEl.textContent = STEPS[idx].log;
        animateStep(STEPS[idx], function () { if (onDone) setTimeout(onDone, 0); });
    }

    function osiStart() {
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

    function osiStep() {
        if (running) return;
        var next = stepIdx + 1;
        if (next >= STEPS.length) return;
        applyStep(next, null);
        if (next === STEPS.length - 1) { btnPlay.disabled = true; btnStep.disabled = true; }
    }

    function osiReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false; stepIdx = -1; pktProg = 1;
        logEl.textContent = '▶ PLAY를 눌러 OSI 7계층 캡슐화 흐름을 확인하세요.';
        btnPlay.disabled = false; btnStep.disabled = false;
        setSpeedDisabled(false);
        draw();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.osi-viz__speed-btn').forEach(function (b) {
            b.classList.remove('osi-viz__speed-btn--active');
        });
        btn.classList.add('osi-viz__speed-btn--active');
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