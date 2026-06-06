/**
 * 라우팅 시각화 — RIP (홉 수) vs OSPF (링크 비용)
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
    const root    = el('div', 'rt-viz');
    const toolbar = el('div', 'rt-viz__toolbar');
    const tbLeft  = el('div', 'rt-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'rt-viz__title', 'Routing Protocol'));

    const btnRip  = el('button', 'rt-viz__mode-btn rt-viz__mode-btn--active', 'RIP (홉 수)');
    const btnOspf = el('button', 'rt-viz__mode-btn', 'OSPF (링크 비용)');
    btnRip.addEventListener('click',  function () { if (!running) switchMode('rip');  });
    btnOspf.addEventListener('click', function () { if (!running) switchMode('ospf'); });
    tbLeft.appendChild(btnRip);
    tbLeft.appendChild(btnOspf);
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'rt-viz__speed');
    speedWrap.appendChild(el('span', 'rt-viz__speed-label', 'SPEED'));
    [['1x', 1800], ['2x', 900], ['3x', 600]].forEach(function (pair, i) {
        const b = el('button', 'rt-viz__speed-btn' + (i === 0 ? ' rt-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'rt-viz__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'rt-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const logEl = el('div', 'rt-viz__log', '▶ PLAY를 눌러 라우팅 경로 선택 과정을 확인하세요.');
    root.appendChild(logEl);

    const controls = el('div', 'rt-viz__controls');
    const btnPlay  = el('button', 'rt-viz__btn rt-viz__btn--primary', '▶ PLAY');
    const btnStep  = el('button', 'rt-viz__btn', '▶| STEP');
    const btnReset = el('button', 'rt-viz__btn', '↺ RESET');
    btnPlay.addEventListener('click',  rtStart);
    btnStep.addEventListener('click',  rtStep);
    btnReset.addEventListener('click', rtReset);
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

    /* ===================== 그래프 정의 ===================== */
    var EDGES = [
        { a:0, b:1, rip:1, ospf:1  },
        { a:1, b:2, rip:1, ospf:1  },
        { a:2, b:5, rip:1, ospf:1  },
        { a:0, b:3, rip:1, ospf:5  },
        { a:3, b:4, rip:1, ospf:1  },
        { a:4, b:5, rip:1, ospf:1  },
        { a:1, b:4, rip:1, ospf:2  },
    ];

    var NODE_LABELS = ['A','B','C','D','E','F'];

    /* ===================== 시나리오 ===================== */
    var SCENARIOS = {
        rip: [
            {
                log: 'RIP는 모든 링크를 "홉 수=1"로 동일하게 봅니다. 링크 속도나 대역폭은 무시합니다. 출발지 A에서 목적지 F까지 3가지 경로가 모두 3홉으로 동일합니다.',
                path:[], rejected:[], considering:[], activeNode:0, badge:{},
                pktPath:[], pktEdgeIdx:-1,
            },
            {
                log: 'Step 1 — A에서 출발. 인접 라우터 탐색: B(1홉), D(1홉). RIP는 홉 수가 같으면 먼저 발견된 경로를 선택합니다. B 방향을 먼저 탐색합니다.',
                path:[], rejected:[], considering:[0,3], activeNode:0,
                badge:{1:'1홉', 3:'1홉'},
                pktPath:[], pktEdgeIdx:-1,
            },
            {
                log: 'Step 2 — B 도착(1홉). B의 인접: C(2홉), E(2홉). 계속 탐색합니다.',
                path:[0], rejected:[], considering:[1,6], activeNode:1,
                badge:{1:'1홉', 2:'2홉', 4:'2홉'},
                pktPath:[], pktEdgeIdx:-1,
            },
            {
                log: 'Step 3 — C 도착(2홉). C → F 발견! 총 3홉. 같은 홉 수의 D 경유 경로(A-D-E-F, 3홉)보다 먼저 발견됐으므로 A→B→C→F를 선택합니다.',
                path:[0,1], rejected:[3,4,5], considering:[2], activeNode:2,
                badge:{1:'1홉', 2:'2홉', 5:'3홉'},
                pktPath:[], pktEdgeIdx:-1,
            },
            {
                log: 'Step 4 — 경로 확정: A→B→C→F (3홉). 이제 패킷을 전송합니다. A→B로 이동합니다.',
                path:[0,1,2], rejected:[3,4,5,6], considering:[], activeNode:0,
                badge:{},
                pktPath:[0,1,2], pktEdgeIdx:0,
            },
            {
                log: 'Step 5 — B→C로 이동합니다.',
                path:[0,1,2], rejected:[3,4,5,6], considering:[], activeNode:1,
                badge:{},
                pktPath:[0,1,2], pktEdgeIdx:1,
            },
            {
                log: 'Step 6 — C→F 도착 ✓  RIP 결과: A→B→C→F (3홉). 문제점: A-D 링크가 느린 링크(비용 5)여도 RIP는 홉 수만 보기 때문에 이를 고려하지 않습니다. OSPF 탭에서 차이를 확인하세요.',
                path:[0,1,2], rejected:[3,4,5,6], considering:[], activeNode:5,
                badge:{},
                pktPath:[0,1,2], pktEdgeIdx:2,
                done: true,
            },
        ],
        ospf: [
            {
                log: 'OSPF는 링크 비용(대역폭의 역수)을 메트릭으로 사용합니다. A-D 링크는 느린 링크라 비용이 5입니다. 다익스트라 알고리즘으로 비용 합계가 가장 낮은 경로를 선택합니다.',
                path:[], rejected:[], considering:[], activeNode:0, badge:{},
                pktPath:[], pktEdgeIdx:-1,
            },
            {
                log: 'Step 1 — A(비용 0)에서 시작. 인접 탐색: B=비용1, D=비용5. B가 훨씬 저렴! B를 먼저 확정합니다.',
                path:[], rejected:[], considering:[0,3], activeNode:0,
                badge:{1:'비용1', 3:'비용5'},
                pktPath:[], pktEdgeIdx:-1,
            },
            {
                log: 'Step 2 — B(비용1) 확정. B의 인접: C=1+1=2, E=1+2=3. D는 비용5로 아직 높습니다. C(비용2)가 가장 저렴 → C 확정.',
                path:[0], rejected:[], considering:[1,6], activeNode:1,
                badge:{1:'비용1', 2:'비용2', 4:'비용3', 3:'비용5'},
                pktPath:[], pktEdgeIdx:-1,
            },
            {
                log: 'Step 3 — C(비용2) 확정. C→F = 2+1 = 비용3. E(비용3) 확정. E→F = 3+1 = 4. F 최단비용 = 3 (C를 통해). D는 비용5로 탈락.',
                path:[0,1], rejected:[3,4], considering:[2,5], activeNode:2,
                badge:{1:'비용1', 2:'비용2', 4:'비용3', 5:'비용3', 3:'비용5(탈락)'},
                pktPath:[], pktEdgeIdx:-1,
            },
            {
                log: 'Step 4 — 경로 확정: A→B→C→F (비용 합계: 1+1+1=3). D 경유 경로(비용 5+1+1=7)는 탈락. 이제 패킷을 전송합니다.',
                path:[0,1,2], rejected:[3,4,5,6], considering:[], activeNode:0,
                badge:{},
                pktPath:[0,1,2], pktEdgeIdx:0,
            },
            {
                log: 'Step 5 — B→C로 이동합니다.',
                path:[0,1,2], rejected:[3,4,5,6], considering:[], activeNode:1,
                badge:{},
                pktPath:[0,1,2], pktEdgeIdx:1,
            },
            {
                log: 'Step 6 — C→F 도착 ✓  OSPF 결과: A→B→C→F (비용 3). RIP와 같은 경로지만, A-D 링크(비용5)를 고려해 합리적으로 선택했습니다. 느린 링크를 자동으로 회피합니다.',
                path:[0,1,2], rejected:[3,4,5,6], considering:[], activeNode:5,
                badge:{},
                pktPath:[0,1,2], pktEdgeIdx:2,
                done: true,
            },
        ],
    };

    let mode      = 'rip';
    let stepIdx   = -1;
    let running   = false;
    let timer     = null;
    let rafId     = null;
    let speed     = 1800;
    let pktMoving = false;
    let pktProg   = 1;

    /* ===================== 헬퍼 ===================== */
    function rr(x, y, w, h, r, fill, stroke, lw) {
        if (w <= 0 || h <= 0) return;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x+w, y, x+w, y+h, r);
        ctx.arcTo(x+w, y+h, x, y+h, r);
        ctx.arcTo(x, y+h, x, y, r);
        ctx.arcTo(x, y, x+w, y, r);
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
        const mob = W < 520;

        const F_NODE  = mob ? 13 : 15;
        const F_EDGE  = mob ? 12 : 13;
        const F_BADGE = mob ? 11 : 11;
        const F_SUB   = mob ?  9 : 10;

        const nodeHW = mob ? 24 : 32;
        const nodeHH = mob ? 18 : 24;

        const badgeH = F_BADGE + 10;
        const topPad = nodeHH + badgeH + 10;
        const botPad = nodeHH + (mob ? 20 : 24);
        const sidePad = nodeHW + (mob ? 48 : 56);

        const gW      = W - sidePad * 2;
        const gH      = H - topPad - botPad;
        const colStep = gW / 2;
        const rowStep = gH;

        var nodePos = [
            { x: sidePad,             y: topPad           },
            { x: sidePad + colStep,   y: topPad           },
            { x: sidePad + colStep*2, y: topPad           },
            { x: sidePad,             y: topPad + rowStep },
            { x: sidePad + colStep,   y: topPad + rowStep },
            { x: sidePad + colStep*2, y: topPad + rowStep },
        ];

        return { W, H, mob,
                 F_NODE, F_EDGE, F_BADGE, F_SUB,
                 nodeHW, nodeHH, badgeH, nodePos };
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        const L    = buildLayout();
        const step = stepIdx >= 0 ? SCENARIOS[mode][stepIdx] : SCENARIOS[mode][0];
        drawEdges(L, step);
        drawNodes(L, step);
        drawBadges(L, step);
        if (step.pktPath && step.pktEdgeIdx >= 0) drawPacket(L, step);
    }

    /* ===================== 엣지 ===================== */
    function drawEdges(L, step) {
        const { nodePos, F_EDGE, mob } = L;
        var path       = step.path        || [];
        var rejected   = step.rejected    || [];
        var considering= step.considering || [];

        EDGES.forEach(function (edge, i) {
            var ax = nodePos[edge.a].x, ay = nodePos[edge.a].y;
            var bx = nodePos[edge.b].x, by = nodePos[edge.b].y;

            var isPath  = path.indexOf(i)        !== -1;
            var isRej   = rejected.indexOf(i)    !== -1;
            var isCons  = considering.indexOf(i) !== -1;

            var col, lw;
            if (isPath)  { col = P.green;           lw = 3;   }
            else if (isCons) { col = P.yellow;       lw = 2.5; }
            else if (isRej)  { col = P.muted + '44'; lw = 1;   }
            else             { col = P.border + 'cc'; lw = 1.5; }

            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.strokeStyle = col;
            ctx.lineWidth   = lw;
            if (isRej) ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);

            var mx   = (ax + bx) / 2;
            var my   = (ay + by) / 2;
            var cost = mode === 'rip' ? edge.rip : edge.ospf;
            var costStr = mode === 'rip'
                ? (edge.ospf > 1 ? '홉1\n(실제비용' + edge.ospf + ')' : '홉 1')
                : '비용 ' + edge.ospf;

            var isExpensive = mode === 'ospf' && edge.ospf >= 3;
            var badgeCol    = isPath ? P.green
                            : isCons ? P.yellow
                            : isRej  ? P.muted + '66'
                            : isExpensive ? P.orange
                            : P.text + 'bb';

            var label = mode === 'rip' ? '홉 1' : '비용 ' + edge.ospf;
            if (mode === 'ospf' && edge.ospf >= 3) label = '비용' + edge.ospf + ' ⚡';
            ctx.font = '700 ' + F_EDGE + 'px "JetBrains Mono",monospace';
            var tw   = ctx.measureText(label).width + (mob ? 14 : 18);
            var bh2  = F_EDGE + (mob ? 8 : 10);
            var pillX = Math.max(tw/2 + 2, Math.min(L.W - tw/2 - 2, mx));
            rr(pillX - tw/2, my - bh2/2, tw, bh2, 4, P.bg,
               isPath ? P.green + 'cc' : (isCons ? P.yellow + 'cc' : P.border + 'aa'), 1.5);
            tx(label, pillX, my, F_EDGE, badgeCol, 'center', true);
        });
    }

    /* ===================== 노드 ===================== */
    function drawNodes(L, step) {
        const { nodePos, nodeHW, nodeHH, F_NODE, F_SUB } = L;
        var activeNode = step.activeNode;
        var pathNodes  = new Set();
        (step.path || []).forEach(function (ei) {
            pathNodes.add(EDGES[ei].a);
            pathNodes.add(EDGES[ei].b);
        });

        NODE_LABELS.forEach(function (label, i) {
            var nx = nodePos[i].x, ny = nodePos[i].y;
            var isSrc    = i === 0;
            var isDst    = i === 5;
            var isActive = i === activeNode;
            var isOnPath = pathNodes.has(i);
            var isRej    = !isOnPath && (step.rejected || []).some(function (ei) {
                return EDGES[ei].a === i || EDGES[ei].b === i;
            });

            var col = isDst && isOnPath ? P.green
                    : isSrc             ? P.purple
                    : isDst             ? P.teal
                    : isOnPath          ? P.green
                    : isActive          ? P.purple
                    : isRej             ? P.muted + '55'
                    : P.muted           + '88';

            var fillAlpha = (isActive || isOnPath) ? '28' : '10';

            var hw = L.nodeHW, hh = L.nodeHH;
            rr(nx - hw, ny - hh, hw*2, hh*2, 6,
               col + fillAlpha, col,
               isActive ? 3 : (isOnPath ? 2.5 : 1.5));

            ctx.save();
            ctx.beginPath();
            ctx.rect(nx - hw + 2, ny - hh + 1, hw*2 - 4, hh*2 - 2);
            ctx.clip();
            var labelY = (isSrc || isDst) ? ny - 3 : ny;
            tx(label, nx, labelY, F_NODE, col, 'center', true);
            if (isSrc || isDst) {
                tx(isSrc ? 'SRC' : 'DST', nx, ny + F_NODE * 0.6,
                   F_SUB, col + 'cc', 'center', false);
            }
            ctx.restore();

            if (isActive) {
                ctx.beginPath();
                ctx.arc(nx, ny, hw + 6, 0, Math.PI * 2);
                ctx.strokeStyle = col + '44';
                ctx.lineWidth   = 2;
                ctx.stroke();
            }
        });
    }

    /* ===================== 비용 배지 ===================== */
    function drawBadges(L, step) {
        const { nodePos, nodeHH, badgeH, F_BADGE, mob } = L;
        var badge = step.badge || {};
        Object.keys(badge).forEach(function (ni) {
            var nx  = nodePos[parseInt(ni)].x;
            var ny  = nodePos[parseInt(ni)].y;
            var txt = badge[ni];
            var isRej = txt.indexOf('탈락') !== -1;
            var col   = isRej ? P.orange : P.yellow;
            ctx.font = '700 ' + F_BADGE + 'px "JetBrains Mono",monospace';
            var bw  = ctx.measureText(txt).width + (mob ? 12 : 16);
            var bh  = badgeH;
            var bby = ny - nodeHH - 4 - bh;
            rr(nx - bw/2, bby, bw, bh, 4, P.bg, col + 'cc', 1.5);
            tx(txt, nx, bby + bh/2, F_BADGE, col, 'center', true);
        });
    }

    /* ===================== 패킷 이동 ===================== */
    function drawPacket(L, step) {
        var pktPath   = step.pktPath   || [];
        var edgeIdx   = step.pktEdgeIdx;
        if (edgeIdx < 0 || edgeIdx >= pktPath.length) return;

        var eIdx = pktPath[edgeIdx];
        var edge = EDGES[eIdx];
        var ax   = L.nodePos[edge.a].x, ay = L.nodePos[edge.a].y;
        var bx   = L.nodePos[edge.b].x, by = L.nodePos[edge.b].y;
        var prog = pktMoving ? pktProg : 1;
        var cx   = ax + (bx - ax) * prog;
        var cy   = ay + (by - ay) * prog;

        var r = L.mob ? 14 : 17;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle   = P.green + '33'; ctx.fill();
        ctx.strokeStyle = P.green; ctx.lineWidth = 2.5; ctx.stroke();

        tx('PKT', cx, cy, L.F_EDGE - 1, P.green, 'center', true);
    }

    /* ===================== 애니메이션 ===================== */
    function animateStep(step, cb) {
        var pktPath = step.pktPath || [];
        var needsAnim = pktPath.length > 0 && step.pktEdgeIdx >= 0;
        pktProg = needsAnim ? 0 : 1;
        pktMoving = needsAnim;
        if (!needsAnim) { draw(); if (cb) cb(); return; }
        if (rafId) cancelAnimationFrame(rafId);
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
        root.querySelectorAll('.rt-viz__speed-btn').forEach(function (b) { b.disabled = v; });
    }
    function setModeBtnsDisabled(v) {
        btnRip.disabled  = v;
        btnOspf.disabled = v;
    }

    function applyStep(idx, onDone) {
        stepIdx = idx;
        logEl.textContent = SCENARIOS[mode][idx].log;
        animateStep(SCENARIOS[mode][idx], function () {
            if (onDone) setTimeout(onDone, 0);
        });
    }

    function rtStart() {
        if (running) return;
        running = true; btnPlay.disabled = true; btnStep.disabled = true;
        setSpeedDisabled(true); setModeBtnsDisabled(true);
        function tick() {
            var next = stepIdx + 1;
            var sc   = SCENARIOS[mode];
            if (next >= sc.length) { running = false; setSpeedDisabled(false); setModeBtnsDisabled(false); return; }
            applyStep(next, function () {
                if (next === sc.length - 1) {
                    running = false; btnStep.disabled = true;
                    setSpeedDisabled(false); setModeBtnsDisabled(false);
                } else {
                    timer = setTimeout(tick, speed);
                }
            });
        }
        tick();
    }

    function rtStep() {
        if (running || pktMoving) return;
        var next = stepIdx + 1;
        if (next >= SCENARIOS[mode].length) return;
        applyStep(next, null);
        if (next === SCENARIOS[mode].length - 1) { btnPlay.disabled = true; btnStep.disabled = true; }
    }

    function rtReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false; stepIdx = -1; pktProg = 1; pktMoving = false;
        logEl.textContent = '▶ PLAY를 눌러 라우팅 경로 선택 과정을 확인하세요.';
        btnPlay.disabled = false; btnStep.disabled = false;
        setSpeedDisabled(false); setModeBtnsDisabled(false);
        draw();
    }

    function switchMode(m) {
        mode = m;
        btnRip.classList.toggle('rt-viz__mode-btn--active',  m === 'rip');
        btnOspf.classList.toggle('rt-viz__mode-btn--active', m === 'ospf');
        rtReset();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.rt-viz__speed-btn').forEach(function (b) {
            b.classList.remove('rt-viz__speed-btn--active');
        });
        btn.classList.add('rt-viz__speed-btn--active');
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