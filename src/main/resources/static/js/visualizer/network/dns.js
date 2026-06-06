/**
 * DNS 시각화
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
    const root    = el('div', 'dns-viz');
    const toolbar = el('div', 'dns-viz__toolbar');
    const tbLeft  = el('div', 'dns-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'dns-viz__title', 'DNS Recursive Query'));
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'dns-viz__speed');
    speedWrap.appendChild(el('span', 'dns-viz__speed-label', 'SPEED'));
    [['1x', 1800], ['2x', 900], ['3x', 600]].forEach(function (pair, i) {
        const b = el('button', 'dns-viz__speed-btn' + (i === 0 ? ' dns-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'dns-viz__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'dns-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const logEl = el('div', 'dns-viz__log', '▶ PLAY를 눌러 DNS 재귀 질의 과정을 확인하세요.');
    root.appendChild(logEl);

    const controls = el('div', 'dns-viz__controls');
    const btnPlay  = el('button', 'dns-viz__btn dns-viz__btn--primary', '▶ PLAY');
    const btnStep  = el('button', 'dns-viz__btn', '▶| STEP');
    const btnReset = el('button', 'dns-viz__btn', '↺ RESET');
    btnPlay.addEventListener('click',  dnsStart);
    btnStep.addEventListener('click',  dnsStep);
    btnReset.addEventListener('click', dnsReset);
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
        const h = Math.max(canvasWrap.offsetHeight, 500);
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    let P = window.CsFlow.getP();

    /* ===================== 노드 정의 ===================== */
    var NODES = [
        { id: 0, label: 'CLIENT',    sub: 'Browser',         color: 'purple' },
        { id: 1, label: 'LOCAL DNS', sub: 'Recursive Resolver', color: 'teal'   },
        { id: 2, label: 'ROOT DNS',  sub: '. (root)',         color: 'yellow' },
        { id: 3, label: 'TLD DNS',   sub: '.com NS',          color: 'orange' },
        { id: 4, label: 'AUTH DNS',  sub: 'example.com NS',   color: 'green'  },
    ];

    function nColor(name) {
        if (name === 'purple') return P.purple;
        if (name === 'teal')   return P.teal;
        if (name === 'yellow') return P.yellow;
        if (name === 'orange') return P.orange;
        if (name === 'green')  return P.green;
        return P.purple;
    }

    /* ===================== 시나리오 ===================== */
    var STEPS = [
        {
            log: '초기 상태. 브라우저에 example.com을 입력했습니다. OS는 먼저 /etc/hosts와 브라우저 캐시를 확인합니다. 캐시에 없으면 로컬 DNS 리졸버에 질의합니다.',
            pkt: null,
            active: [0],
        },
        {
            log: 'Step 1 — 클라이언트 → 로컬 DNS. 브라우저가 로컬 DNS 리졸버(보통 ISP 제공)에 "example.com의 IP가 무엇인가요?" 질의합니다. UDP 53번 포트를 사용합니다.',
            pkt: { from: 0, to: 1, dir: 'query', label: 'example.com?', color: 'purple' },
            active: [0, 1],
        },
        {
            log: 'Step 2 — 로컬 DNS → 루트 DNS. 로컬 리졸버 캐시에 없습니다. 루트 DNS 서버에 "example.com의 IP가 무엇인가요?" 질의합니다. 루트 서버 주소는 리졸버에 하드코딩되어 있습니다.',
            pkt: { from: 1, to: 2, dir: 'query', label: 'example.com?', color: 'teal' },
            active: [1, 2],
        },
        {
            log: 'Step 3 — 루트 DNS 응답. 루트 서버는 IP를 모르지만 .com TLD 네임서버 주소를 알고 있습니다. "저는 모릅니다. .com NS는 a.gtld-servers.net입니다"라고 응답합니다.',
            pkt: { from: 2, to: 1, dir: 'answer', label: '.com NS 주소 반환', color: 'yellow' },
            active: [1, 2],
        },
        {
            log: 'Step 4 — 로컬 DNS → TLD DNS. .com TLD 서버에 "example.com의 IP가 무엇인가요?" 질의합니다. TLD 서버는 example.com의 권한 네임서버를 알고 있습니다.',
            pkt: { from: 1, to: 3, dir: 'query', label: 'example.com?', color: 'teal' },
            active: [1, 3],
        },
        {
            log: 'Step 5 — TLD DNS 응답. "저는 모릅니다. example.com의 NS는 ns1.example.com입니다"라고 응답합니다. 권한 네임서버 주소를 알려줍니다.',
            pkt: { from: 3, to: 1, dir: 'answer', label: 'example.com NS 주소 반환', color: 'orange' },
            active: [1, 3],
        },
        {
            log: 'Step 6 — 로컬 DNS → 권한 DNS. example.com의 권한 네임서버에 직접 질의합니다. 권한 서버는 해당 도메인의 모든 레코드를 갖고 있습니다.',
            pkt: { from: 1, to: 4, dir: 'query', label: 'example.com A record?', color: 'teal' },
            active: [1, 4],
        },
        {
            log: 'Step 7 — 권한 DNS 응답. 드디어 실제 IP를 반환합니다. "example.com → 93.184.216.34 (TTL: 3600)"를 응답합니다. 로컬 DNS는 이 결과를 TTL 동안 캐시합니다.',
            pkt: { from: 4, to: 1, dir: 'answer', label: '93.184.216.34 (TTL 3600)', color: 'green' },
            active: [1, 4],
        },
        {
            log: 'Step 8 — 로컬 DNS → 클라이언트. 최종 IP 주소를 클라이언트에 전달합니다. 브라우저는 93.184.216.34로 TCP 연결을 시작합니다. 전체 과정 완료 ✓',
            pkt: { from: 1, to: 0, dir: 'answer', label: '93.184.216.34 반환 ✓', color: 'purple' },
            active: [0, 1],
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

    /* ===================== 레이아웃 ===================== */
    function buildLayout() {
        const W   = GW(), H = GH();
        const mob = W < 560;
        const pad = mob ? 6 : 16;

        const F_NODE = mob ? 10 : 12;
        const F_PKT  = mob ? 10 : 12;
        const F_PSUB = mob ?  9 : 10;

        const nodeH  = mob ? 36 : 48;
        const nodeY  = mob ?  8 : 14;
        const unit   = Math.floor((W - pad * 2) / 5);
        const nodeW  = unit - (mob ? 6 : 10);
        const nodeXs = NODES.map(function (_, i) {
            return pad + i * unit + unit / 2;
        });

        var pktCount  = STEPS.filter(function (s) { return s.pkt; }).length;
        const areaTop = nodeY + nodeH + (mob ? 8 : 12);
        const avail   = H - areaTop - (mob ? 4 : 8);
        const ROW_H   = Math.floor(avail / pktCount);

        return { W, H, mob, pad,
                 F_NODE, F_PKT, F_PSUB,
                 nodeW, nodeH, nodeY, nodeXs,
                 areaTop, ROW_H, pktCount };
    }

    function rowY(L, rowIdx) {
        return L.areaTop + rowIdx * L.ROW_H + L.ROW_H / 2;
    }

    function pktRowIdx(sIdx) {
        var n = 0;
        for (var k = 0; k < sIdx; k++) { if (STEPS[k] && STEPS[k].pkt) n++; }
        return n;
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        const L    = buildLayout();
        const step = stepIdx >= 0 ? STEPS[stepIdx] : STEPS[0];

        drawNodes(L, step);
        drawHistory(L);
        if (stepIdx >= 0 && step.pkt) {
            var ri = pktRowIdx(stepIdx);
            if (pktMoving) {
                drawMovingPkt(L, step, pktProg, ri);
            } else {
                var inHistory = history.some(function (h) { return h.rowIdx === ri; });
                if (!inHistory) drawStaticPkt(L, step, ri);
            }
        }
    }

    /* ===================== 노드 박스 ===================== */
    function drawNodes(L, step) {
        const { nodeXs, nodeY, nodeW, nodeH, F_NODE, mob } = L;
        var active = step.active || [];

        NODES.forEach(function (node, i) {
            var col   = nColor(node.color);
            var isAct = active.indexOf(i) !== -1;
            var bx    = nodeXs[i] - nodeW / 2;

            rr(bx, nodeY, nodeW, nodeH, 5,
               isAct ? col + '28' : P.surf,
               isAct ? col : P.border,
               isAct ? 2.5 : 1.5);

            ctx.save();
            ctx.beginPath();
            ctx.rect(bx + 3, nodeY + 2, nodeW - 6, nodeH - 4);
            ctx.clip();
            if (mob) {
                tx(node.label, nodeXs[i], nodeY + nodeH / 2,
                   F_NODE, isAct ? col : P.muted + 'cc', 'center', isAct);
            } else {
                tx(node.label, nodeXs[i], nodeY + nodeH * 0.34,
                   F_NODE, isAct ? col : P.muted + 'cc', 'center', isAct);
                tx(node.sub, nodeXs[i], nodeY + nodeH * 0.70,
                   F_NODE - 2, P.muted + '77', 'center', false);
            }
            ctx.restore();

            if (isAct) {
                ctx.beginPath();
                ctx.arc(nodeXs[i], nodeY + nodeH, 4, 0, Math.PI * 2);
                ctx.fillStyle = col;
                ctx.fill();
            }
        });
    }


    /* ===================== 히스토리 패킷 (완료) ===================== */
    function drawHistory(L) {
        history.forEach(function (item, hi) {
            drawStaticPkt(L, item.step, item.rowIdx);
        });
    }

    /* ===================== 정적 패킷 (도착 완료) ===================== */
    function drawStaticPkt(L, step, rowIdx) {
        if (!step.pkt) return;
        var pkt    = step.pkt;
        var col    = nColor(pkt.color);
        var fromX  = L.nodeXs[pkt.from];
        var toX    = L.nodeXs[pkt.to];
        var ry     = rowY(L, rowIdx);

        var isQuery = pkt.dir === 'query';
        var midX    = (fromX + toX) / 2;
        var fPkt    = L.F_PKT;
        var lblH    = fPkt + 5;

        var lineY, lblY;
        if (isQuery) {
            lblY  = ry - L.ROW_H * 0.30;
            lineY = lblY + lblH;
        } else {
            lineY = ry + L.ROW_H * 0.02;
            lblY  = lineY + lblH;
        }

        ctx.beginPath();
        ctx.moveTo(fromX, lineY);
        ctx.lineTo(toX,   lineY);
        ctx.strokeStyle = col + 'bb';
        ctx.lineWidth   = 1.5;
        ctx.stroke();

        var ad = toX > fromX ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(toX, lineY);
        ctx.lineTo(toX - ad * 9, lineY - 5);
        ctx.lineTo(toX - ad * 9, lineY + 5);
        ctx.closePath();
        ctx.fillStyle = col + 'bb';
        ctx.fill();

        tx(pkt.label, midX, lblY, fPkt, col, 'center', true);
    }

    /* ===================== 이동 중 패킷 ===================== */
    function drawMovingPkt(L, step, prog, rowIdx) {
        if (!step.pkt) return;
        var pkt   = step.pkt;
        var col   = nColor(pkt.color);
        var fromX = L.nodeXs[pkt.from];
        var toX   = L.nodeXs[pkt.to];
        var ry    = rowY(L, rowIdx);
        var isQuery = pkt.dir === 'query';
        var lineY   = isQuery ? ry - L.ROW_H * 0.20 : ry + L.ROW_H * 0.05;
        var cx      = fromX + (toX - fromX) * prog;

        ctx.beginPath();
        ctx.moveTo(fromX, lineY);
        ctx.lineTo(cx, lineY);
        ctx.strokeStyle = col + '55';
        ctx.lineWidth   = 1.5;
        ctx.stroke();

        var r = L.mob ? 12 : 15;
        ctx.beginPath(); ctx.arc(cx, lineY, r, 0, Math.PI * 2);
        ctx.fillStyle   = col + '22'; ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
        tx(isQuery ? '?' : '!', cx, lineY, L.F_PKT, col, 'center', true);

        var lblY = isQuery ? lineY - r - 7 : lineY + r + 7;
        tx(pkt.label, cx, lblY, L.F_PSUB, col + 'cc', 'center', false);
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
        root.querySelectorAll('.dns-viz__speed-btn').forEach(function (b) { b.disabled = v; });
    }

    function applyStep(idx, onDone) {
        stepIdx = idx;
        var step = STEPS[idx];
        logEl.textContent = step.log;
        animateStep(step, function () {
            if (step.pkt) history.push({ step: step, rowIdx: pktRowIdx(idx) });
            draw();
            if (onDone) setTimeout(onDone, 0);
        });
    }

    function dnsStart() {
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

    function dnsStep() {
        if (running || pktMoving) return;
        var next = stepIdx + 1;
        if (next >= STEPS.length) return;
        applyStep(next, null);
        if (next === STEPS.length - 1) { btnPlay.disabled = true; btnStep.disabled = true; }
    }

    function dnsReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false; stepIdx = -1; pktProg = 1; pktMoving = false; history = [];
        logEl.textContent = '▶ PLAY를 눌러 DNS 재귀 질의 과정을 확인하세요.';
        btnPlay.disabled = false; btnStep.disabled = false;
        setSpeedDisabled(false);
        draw();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.dns-viz__speed-btn').forEach(function (b) {
            b.classList.remove('dns-viz__speed-btn--active');
        });
        btn.classList.add('dns-viz__speed-btn--active');
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