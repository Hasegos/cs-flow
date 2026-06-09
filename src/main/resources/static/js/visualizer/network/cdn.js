/**
 * CDN 시각화
 *
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
    const root    = el('div', 'cdn-viz');
    const toolbar = el('div', 'cdn-viz__toolbar');
    const tbLeft  = el('div', 'cdn-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'cdn-viz__title', 'CDN'));

    var modeBtns = {};
    [['hit', '캐시 히트'], ['miss', '캐시 미스']].forEach(function (pair, i) {
        var b = el('button', 'cdn-viz__mode-btn' + (i === 0 ? ' cdn-viz__mode-btn--active' : ''), pair[1]);
        b.addEventListener('click', function () { if (!running) switchMode(pair[0]); });
        modeBtns[pair[0]] = b;
        tbLeft.appendChild(b);
    });
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'cdn-viz__speed');
    speedWrap.appendChild(el('span', 'cdn-viz__speed-label', 'SPEED'));
    [['1x', 1800], ['2x', 900], ['3x', 600]].forEach(function (pair, i) {
        const b = el('button', 'cdn-viz__speed-btn' + (i === 0 ? ' cdn-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'cdn-viz__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'cdn-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const logEl = el('div', 'cdn-viz__log', '▶ PLAY를 눌러 CDN 동작을 확인하세요.');
    root.appendChild(logEl);

    const controls = el('div', 'cdn-viz__controls');
    const btnPlay  = el('button', 'cdn-viz__btn cdn-viz__btn--primary', '▶ PLAY');
    const btnStep  = el('button', 'cdn-viz__btn', '▶| STEP');
    const btnReset = el('button', 'cdn-viz__btn', '↺ RESET');
    btnPlay.addEventListener('click',  cdnStart);
    btnStep.addEventListener('click',  cdnStep);
    btnReset.addEventListener('click', cdnReset);
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
        var w = canvasWrap.offsetWidth || 320;
        var h = Math.max(canvasWrap.offsetHeight || 0, 380);
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    let P = window.CsFlow.getP();

    /* ===================== 상태 ===================== */
    var mode      = 'hit';
    var running   = false;
    var timer     = null;
    var rafId     = null;
    var speed     = 1800;
    var stepIdx   = -1;
    var pktMoving = false;
    var pktProg   = 0;
    var pktPhase  = 'idle';
    var edgeCached = (mode === 'hit');

    /* ===================== 시나리오 ===================== */
    var STEPS_HIT = [
        {
            log: '캐시 히트 시나리오. 엣지 서버에 이미 콘텐츠가 캐싱되어 있습니다. 오리진 서버 요청 없이 응답합니다.',
            phase: null,
        },
        {
            log: 'Step 1 — 사용자 요청. 브라우저가 image.png를 요청합니다. DNS가 가장 가까운 CDN 엣지 서버로 라우팅합니다.',
            phase: 'user_to_edge',
            label: 'GET /image.png',
            col: 'purple',
        },
        {
            log: 'Step 2 — 캐시 히트 ✓  엣지 서버에 콘텐츠가 있습니다. 오리진 서버에 요청하지 않고 즉시 응답합니다. X-Cache: HIT 헤더가 포함됩니다.',
            phase: 'edge_to_user',
            label: '200 OK (X-Cache: HIT)',
            col: 'green',
            cacheHit: true,
        },
    ];

    var STEPS_MISS = [
        {
            log: '캐시 미스 시나리오. 엣지 서버에 콘텐츠가 없거나 만료되었습니다. 오리진 서버에서 가져와 캐싱합니다.',
            phase: null,
        },
        {
            log: 'Step 1 — 사용자 요청. 브라우저가 image.png를 요청합니다.',
            phase: 'user_to_edge',
            label: 'GET /image.png',
            col: 'purple',
        },
        {
            log: 'Step 2 — 캐시 미스. 엣지 서버에 콘텐츠가 없습니다. 오리진 서버에 요청을 전달합니다. X-Cache: MISS 헤더가 반환됩니다.',
            phase: 'edge_to_origin',
            label: 'GET /image.png (Forwarded)',
            col: 'yellow',
            cacheMiss: true,
        },
        {
            log: 'Step 3 — 오리진 응답. 오리진 서버가 콘텐츠를 반환합니다. Cache-Control: max-age=86400 헤더로 캐시 TTL을 설정합니다.',
            phase: 'origin_to_edge',
            label: '200 OK (Cache-Control: max-age=86400)',
            col: 'teal',
        },
        {
            log: 'Step 4 — 캐싱 완료. 엣지 서버가 콘텐츠를 캐싱합니다. 이후 동일 요청은 캐시 히트로 처리됩니다.',
            phase: 'edge_cache',
            label: '캐싱 완료',
            col: 'green',
        },
        {
            log: 'Step 5 — 사용자에게 응답. 엣지 서버가 캐싱한 콘텐츠를 사용자에게 전달합니다. X-Cache: MISS (첫 요청), 이후 HIT.',
            phase: 'edge_to_user',
            label: '200 OK (X-Cache: MISS)',
            col: 'purple',
        },
    ];

    function getSteps() { return mode === 'hit' ? STEPS_HIT : STEPS_MISS; }

    /* ===================== 헬퍼 ===================== */
    function rr(x, y, w, h, r, fill, stroke, lw) {
        if (w <= 0 || h <= 0) return;
        ctx.beginPath();
        ctx.moveTo(x+r, y);
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
        if (name === 'green')  return P.green;
        if (name === 'teal')   return P.teal;
        if (name === 'yellow') return P.yellow;
        if (name === 'orange') return P.orange;
        return P.purple;
    }

    /* ===================== 레이아웃 ===================== */
    function buildLayout() {
        var W   = GW(), H = GH();
        var mob = W < 520;
        var pad = mob ? 10 : 20;

        var F_NODE = mob ? 11 : 13;
        var F_SUB  = mob ? 10 : 11;
        var F_PKT  = mob ? 10 : 12;

        var nodeW = mob ? 80 : 110;
        var nodeH = mob ? 48 : 60;
        var nodeY = H / 2;

        var userX = pad + nodeW / 2;

        var edgeX = W / 2;

        var originX = W - pad - nodeW / 2;

        return { W, H, mob, pad, F_NODE, F_SUB, F_PKT,
                 nodeW, nodeH, nodeY,
                 userX, edgeX, originX };
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        var L = buildLayout();

        drawConnLines(L);
        drawNodes(L);
        drawPacket(L);
    }

    /* ===================== 연결선 ===================== */
    function drawConnLines(L) {
        [[L.userX + L.nodeW/2, L.edgeX - L.nodeW/2],
         [L.edgeX + L.nodeW/2, L.originX - L.nodeW/2]].forEach(function (pair) {
            ctx.beginPath();
            ctx.moveTo(pair[0], L.nodeY);
            ctx.lineTo(pair[1], L.nodeY);
            ctx.strokeStyle = P.border + '55';
            ctx.lineWidth   = 1.5;
            ctx.setLineDash([5, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
        });
    }

    /* ===================== 노드 ===================== */
    function drawNodes(L) {
        var { F_NODE, F_SUB, nodeW, nodeH, nodeY } = L;

        rr(L.userX - nodeW/2, nodeY - nodeH/2, nodeW, nodeH, 6,
           P.purple + '22', P.purple, 2);
        tx('USER', L.userX, nodeY - 4, F_NODE, P.purple, 'center', true);
        tx('Browser', L.userX, nodeY + F_NODE * 0.7, F_SUB, P.purple + 'aa', 'center', false);

        var edgeCol  = edgeCached ? P.green : P.teal;
        var edgeLabel = edgeCached ? '✓ CACHED' : 'EMPTY';
        rr(L.edgeX - nodeW/2, nodeY - nodeH/2, nodeW, nodeH, 6,
           edgeCol + '22', edgeCol, 2.5);
        tx('EDGE', L.edgeX, nodeY - F_NODE * 0.6, F_NODE, edgeCol, 'center', true);
        tx(edgeLabel, L.edgeX, nodeY + F_NODE * 0.6, F_SUB, edgeCol + 'cc', 'center', false);

        var badgeCol  = mode === 'hit' ? P.green : P.yellow;
        var badgeText = mode === 'hit' ? 'HIT' : (edgeCached ? 'CACHED' : 'MISS');
        rr(L.edgeX - 22, nodeY + nodeH/2 + 6, 44, 20, 4,
           badgeCol + '22', badgeCol, 1.5);
        tx(badgeText, L.edgeX, nodeY + nodeH/2 + 16, F_SUB - 1, badgeCol, 'center', true);

        rr(L.originX - nodeW/2, nodeY - nodeH/2, nodeW, nodeH, 6,
           P.orange + '22', P.orange, 2);
        tx('ORIGIN', L.originX, nodeY - 4, F_NODE, P.orange, 'center', true);
        tx('Server', L.originX, nodeY + F_NODE * 0.7, F_SUB, P.orange + 'aa', 'center', false);

        if (pktPhase === 'edge_to_origin' || pktPhase === 'origin_to_edge') {
            ctx.beginPath();
            ctx.arc(L.originX, nodeY - nodeH/2 - 8, 5, 0, Math.PI * 2);
            ctx.fillStyle = P.orange;
            ctx.fill();
        }
    }

    /* ===================== 패킷 ===================== */
    function drawPacket(L) {
        if (pktPhase === 'idle' || pktPhase === 'edge_cache') return;
        var step = stepIdx >= 0 ? getSteps()[stepIdx] : null;
        if (!step || !step.phase || step.phase === 'edge_cache') return;

        var col  = pColor(step.col || 'purple');
        var fromX, toX;
        if (step.phase === 'user_to_edge') {
            fromX = L.userX + L.nodeW / 2; toX = L.edgeX - L.nodeW / 2;
        } else if (step.phase === 'edge_to_origin') {
            fromX = L.edgeX + L.nodeW / 2; toX = L.originX - L.nodeW / 2;
        } else if (step.phase === 'origin_to_edge') {
            fromX = L.originX - L.nodeW / 2; toX = L.edgeX + L.nodeW / 2;
        } else {
            fromX = L.edgeX - L.nodeW / 2; toX = L.userX + L.nodeW / 2;
        }

        var cx = fromX + (toX - fromX) * pktProg;
        var cy = L.nodeY;
        var r  = L.mob ? 12 : 16;

        ctx.beginPath(); ctx.moveTo(fromX, cy); ctx.lineTo(cx, cy);
        ctx.strokeStyle = col + '44'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = col + '33'; ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();

        var lblY = cy - r - 8;
        var maxW = Math.abs(toX - fromX) * 0.6;
        ctx.save();
        ctx.font = '600 ' + L.F_PKT + 'px "JetBrains Mono",monospace';
        ctx.fillStyle    = col + 'cc';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        var midX = (fromX + toX) / 2;
        ctx.beginPath();
        ctx.rect(fromX, cy - 60, Math.abs(toX - fromX), 52);
        ctx.clip();
        ctx.fillText(step.label || '', cx, lblY);
        ctx.restore();
    }

    /* ===================== 애니메이션 ===================== */
    function animPkt(onDone) {
        pktMoving = true;
        pktProg   = 0;
        if (rafId) cancelAnimationFrame(rafId);
        var s = 0.008 * (1800 / speed);
        (function tick() {
            pktProg = Math.min(1, pktProg + s);
            draw();
            if (pktProg < 1) {
                rafId = requestAnimationFrame(tick);
            } else {
                if (onDone) onDone();
            }
        })();
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) {
        root.querySelectorAll('.cdn-viz__speed-btn').forEach(function (b) { b.disabled = v; });
    }
    function setModeBtnsDisabled(v) {
        Object.values(modeBtns).forEach(function (b) { b.disabled = v; });
    }

    function applyStep(idx, onDone) {
        stepIdx  = idx;
        var step = getSteps()[idx];
        logEl.textContent = step.log;

        if (!step.phase) {
            pktPhase  = 'idle';
            pktMoving = false;
            draw();
            if (onDone) setTimeout(onDone, 0);
            return;
        }

        if (step.phase === 'edge_cache') {
            pktPhase   = 'edge_cache';
            pktMoving  = true;
            edgeCached = true;
            draw();
            setTimeout(function () {
                pktMoving = false;
                draw();
                if (onDone) setTimeout(onDone, 0);
            }, speed * 0.4);
            return;
        }

        pktPhase = step.phase;
        animPkt(function () {
            if (step.cacheHit)  { }
            if (step.cacheMiss) { }
            pktMoving = false;
            draw();
            if (onDone) setTimeout(onDone, 0);
        });
    }

    function cdnStart() {
        if (running) return;
        running = true; btnPlay.disabled = true; btnStep.disabled = true;
        setSpeedDisabled(true); setModeBtnsDisabled(true);
        var steps = getSteps();
        function tick() {
            var next = stepIdx + 1;
            if (next >= steps.length) {
                running = false; setSpeedDisabled(false); setModeBtnsDisabled(false);
                return;
            }
            applyStep(next, function () {
                if (next === steps.length - 1) {
                    running = false; btnStep.disabled = true;
                    setSpeedDisabled(false); setModeBtnsDisabled(false);
                } else {
                    timer = setTimeout(tick, speed * 0.3);
                }
            });
        }
        tick();
    }

    function cdnStep() {
        if (running || pktMoving) return;
        var next = stepIdx + 1;
        if (next >= getSteps().length) return;
        applyStep(next, null);
        if (next === getSteps().length - 1) { btnPlay.disabled = true; btnStep.disabled = true; }
    }

    function cdnReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false; stepIdx = -1; pktPhase = 'idle'; pktProg = 0;
        pktMoving = false; edgeCached = (mode === 'hit');
        logEl.textContent = '▶ PLAY를 눌러 CDN 동작을 확인하세요.';
        btnPlay.disabled = false; btnStep.disabled = false;
        setSpeedDisabled(false); setModeBtnsDisabled(false);
        draw();
    }

    function switchMode(m) {
        mode = m;
        Object.keys(modeBtns).forEach(function (k) {
            modeBtns[k].classList.toggle('cdn-viz__mode-btn--active', k === m);
        });
        cdnReset();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.cdn-viz__speed-btn').forEach(function (b) {
            b.classList.remove('cdn-viz__speed-btn--active');
        });
        btn.classList.add('cdn-viz__speed-btn--active');
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

    cdnReset();
    setTimeout(resize, 60);
})();