/**
 * 로드 밸런서 시각화
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
    const root    = el('div', 'lb-viz');
    const toolbar = el('div', 'lb-viz__toolbar');
    const tbLeft  = el('div', 'lb-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'lb-viz__title', 'Load Balancer'));

    var modeBtns = {};
    [['rr', 'Round Robin'], ['lc', 'Least Conn'], ['ih', 'IP Hash']].forEach(function (pair) {
        var b = el('button', 'lb-viz__mode-btn' + (pair[0] === 'rr' ? ' lb-viz__mode-btn--active' : ''), pair[1]);
        b.addEventListener('click', function () { if (!running) switchMode(pair[0]); });
        modeBtns[pair[0]] = b;
        tbLeft.appendChild(b);
    });
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'lb-viz__speed');
    speedWrap.appendChild(el('span', 'lb-viz__speed-label', 'SPEED'));
    [['1x', 1800], ['2x', 900], ['3x', 600]].forEach(function (pair, i) {
        const b = el('button', 'lb-viz__speed-btn' + (i === 0 ? ' lb-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'lb-viz__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'lb-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const logEl = el('div', 'lb-viz__log', '▶ PLAY를 눌러 로드 밸런싱 동작을 확인하세요.');
    root.appendChild(logEl);

    const controls = el('div', 'lb-viz__controls');
    const btnPlay  = el('button', 'lb-viz__btn lb-viz__btn--primary', '▶ PLAY');
    const btnStep  = el('button', 'lb-viz__btn', '▶| STEP');
    const btnReset = el('button', 'lb-viz__btn', '↺ RESET');
    btnPlay.addEventListener('click',  lbStart);
    btnStep.addEventListener('click',  lbStep);
    btnReset.addEventListener('click', lbReset);
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

    /* ===================== 상태 ===================== */
    var mode    = 'rr';
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1800;

    var serverConns = [0, 0, 0];
    var rrIndex     = 0;

    var CLIENT_IPS = ['192.168.1.10', '10.0.0.5', '172.16.0.3',
                      '192.168.1.10', '10.0.0.5', '192.168.2.20',
                      '172.16.0.3',  '192.168.1.10', '10.0.0.5'];

    var stepIdx   = -1;
    var pktPhase  = 'idle';
    var pktProg   = 0;
    var pktTarget = 0;
    var pktClientIp = '';
    var pktMoving = false;
    var history   = [];

    function buildSteps() {
        var steps = [];
        var _rr = 0, _conns = [0, 0, 0];

        for (var i = 0; i < CLIENT_IPS.length; i++) {
            var ip  = CLIENT_IPS[i];
            var srv, reason;

            if (mode === 'rr') {
                srv    = _rr % 3;
                reason = 'Round Robin → Server ' + (srv + 1) + ' (순서: ' + (_rr + 1) + '번째)';
                _rr++;
            } else if (mode === 'lc') {
                srv    = _conns.indexOf(Math.min.apply(null, _conns));
                reason = 'Least Connection → Server ' + (srv + 1) + ' (연결 수: ' + _conns[srv] + ')';
            } else {
                var hash = 0;
                for (var c = 0; c < ip.length; c++) hash = (hash * 31 + ip.charCodeAt(c)) & 0xffff;
                srv    = hash % 3;
                reason = 'IP Hash(' + ip + ') → Server ' + (srv + 1);
            }
            _conns[srv]++;

            steps.push({
                clientIp: ip,
                target:   srv,
                log: '요청 ' + (i + 1) + ' — 클라이언트 ' + ip + '. ' + reason + '. 서버 연결 수: [' + _conns.join(', ') + ']',
                conns: _conns.slice(),
            });
        }
        return steps;
    }

    var STEPS = buildSteps();

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

    /* ===================== 레이아웃 ===================== */
    function buildLayout() {
        var W   = GW(), H = GH();
        var mob = W < 520;
        var pad = mob ? 10 : 20;

        var F_NODE = mob ? 12 : 14;
        var F_SUB  = mob ? 11 : 12;
        var F_CONN = mob ? 11 : 13;

        var cW = mob ? 80 : 110, cH = mob ? 44 : 54;
        var cX = pad + cW / 2;
        var cY = H / 2;

        var lbW = mob ? 84 : 110, lbH = mob ? 52 : 64;
        var lbX = W * 0.45;
        var lbY = H / 2;

        var srvW = mob ? 86 : 110, srvH = mob ? 44 : 54;
        var srvX = W - pad - srvW / 2;
        var srvGap = mob ? 16 : 24;
        var totalSrvH = 3 * srvH + 2 * srvGap;
        var srvAreaTop = H * 0.10;
        var srvAreaH   = H * 0.80;
        var srvStep    = (srvAreaH - srvH) / 2;
        var srvYs = [
            srvAreaTop + srvH / 2,
            srvAreaTop + srvH / 2 + srvStep,
            srvAreaTop + srvH / 2 + srvStep * 2,
        ];

        return { W, H, mob, pad, F_NODE, F_SUB, F_CONN,
                 cW, cH, cX, cY,
                 lbW, lbH, lbX, lbY,
                 srvW, srvH, srvX, srvYs };
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        var L = buildLayout();

        drawConnLines(L);
        drawHistory(L);
        drawNodes(L);
        drawPacket(L);
    }

    /* ===================== 연결선 (정적) ===================== */
    function drawConnLines(L) {
        L.srvYs.forEach(function (sy, i) {
            ctx.beginPath();
            ctx.moveTo(L.lbX + L.lbW / 2, L.lbY);
            ctx.lineTo(L.srvX - L.srvW / 2, sy);
            ctx.strokeStyle = P.border + '55';
            ctx.lineWidth   = 1;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
        });

        ctx.beginPath();
        ctx.moveTo(L.cX + L.cW / 2, L.cY);
        ctx.lineTo(L.lbX - L.lbW / 2, L.lbY);
        ctx.strokeStyle = P.border + '55';
        ctx.lineWidth   = 1;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    /* ===================== 히스토리 (완료된 요청 표시) ===================== */
    function drawHistory(L) {
        history.forEach(function (item, idx) {
            var col = serverColor(item.target);
            var sy  = L.srvYs[item.target];

            ctx.beginPath();
            ctx.moveTo(L.srvX - L.srvW / 2, sy);
            ctx.lineTo(L.lbX + L.lbW / 2, L.lbY);
            ctx.strokeStyle = col + '44';
            ctx.lineWidth   = 1.5;
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(L.lbX - L.lbW / 2, L.lbY);
            ctx.lineTo(L.cX + L.cW / 2, L.cY);
            ctx.strokeStyle = col + '44';
            ctx.lineWidth   = 1.5;
            ctx.stroke();
        });
    }

    /* ===================== 노드 ===================== */
    function drawNodes(L) {
        var { F_NODE, F_SUB, F_CONN, mob } = L;

        var curIp = pktClientIp || (stepIdx >= 0 ? STEPS[stepIdx].clientIp : '');
        rr(L.cX - L.cW/2, L.cY - L.cH/2, L.cW, L.cH, 6, P.purple+'22', P.purple, 2);
        if (curIp) {
            tx('CLIENT', L.cX, L.cY - L.cH * 0.18, F_NODE, P.purple, 'center', true);
            tx(curIp,    L.cX, L.cY + L.cH * 0.22, F_SUB,  P.purple + 'cc', 'center', false);
        } else {
            tx('CLIENT', L.cX, L.cY, F_NODE, P.purple, 'center', true);
        }

        var lbCol = pktPhase === 'toserver' ? P.yellow : P.teal;
        rr(L.lbX - L.lbW/2, L.lbY - L.lbH/2, L.lbW, L.lbH, 8, lbCol+'22', lbCol, 2.5);
        tx('LOAD',      L.lbX, L.lbY - F_NODE * 0.6, F_NODE, lbCol, 'center', true);
        tx('BALANCER',  L.lbX, L.lbY + F_NODE * 0.6, F_NODE, lbCol, 'center', true);

        L.srvYs.forEach(function (sy, i) {
            var isTarget = (pktPhase === 'toserver' || pktPhase === 'done') && pktTarget === i;
            var isHistory = history.some(function (h) { return h.target === i; });
            var col = serverColor(i);
            var active = isTarget || isHistory;
            rr(L.srvX - L.srvW/2, sy - L.srvH/2, L.srvW, L.srvH, 6,
               active ? col+'28' : P.surf, active ? col : P.border, active ? 2 : 1.5);

            ctx.save();
            ctx.beginPath();
            ctx.rect(L.srvX - L.srvW/2 + 2, sy - L.srvH/2 + 1, L.srvW - 4, L.srvH - 2);
            ctx.clip();
            tx('SERVER ' + (i+1), L.srvX, sy - 4, F_NODE, active ? col : P.muted+'cc', 'center', active);
            tx('conn: ' + serverConns[i], L.srvX, sy + F_NODE * 0.7, F_CONN, active ? col+'cc' : P.muted+'66', 'center', false);
            ctx.restore();
        });
    }

    /* ===================== 패킷 애니메이션 ===================== */
    function drawPacket(L) {
        if (pktPhase === 'idle' || pktPhase === 'done') return;

        var col = pktPhase === 'toserver' ? serverColor(pktTarget) : P.teal;
        var r   = L.mob ? 11 : 14;
        var sx, sy, ex, ey, cx2, cy2;

        if (pktPhase === 'toserver') {
            sx = L.lbX + L.lbW / 2; sy = L.lbY;
            ex = L.srvX - L.srvW / 2; ey = L.srvYs[pktTarget];
        } else {
            sx = L.cX + L.cW / 2; sy = L.cY;
            ex = L.lbX - L.lbW / 2; ey = L.lbY;
        }

        cx2 = sx + (ex - sx) * pktProg;
        cy2 = sy + (ey - sy) * pktProg;

        ctx.beginPath(); ctx.arc(cx2, cy2, r, 0, Math.PI * 2);
        ctx.fillStyle = col + '33'; ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
        tx('REQ', cx2, cy2, L.F_SUB, col, 'center', true);
    }

    /* ===================== 서버 색상 ===================== */
    function serverColor(idx) {
        return [P.green, P.orange, P.purple][idx] || P.teal;
    }

    /* ===================== 애니메이션 ===================== */
    function animPkt(fromPhase, toPhase, onDone) {
        pktPhase  = fromPhase;
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
        root.querySelectorAll('.lb-viz__speed-btn').forEach(function (b) { b.disabled = v; });
    }
    function setModeBtnsDisabled(v) {
        Object.values(modeBtns).forEach(function (b) { b.disabled = v; });
    }

    function applyStep(idx, onDone) {
        stepIdx      = idx;
        var step     = STEPS[idx];
        pktClientIp  = step.clientIp;
        pktTarget    = step.target;
        logEl.textContent = step.log;

        animPkt('tolb', 'tolb', function () {
            pktPhase  = 'idle';
            pktMoving = true;
            draw();
            setTimeout(function () {
                animPkt('toserver', 'toserver', function () {
                    pktPhase    = 'done';
                    pktMoving   = false;
                    serverConns = step.conns.slice();
                    history.push({ target: step.target, clientIp: step.clientIp });
                    draw();
                    if (onDone) setTimeout(onDone, 0);
                });
            }, speed * 0.2);
        });
    }

    function lbStart() {
        if (running) return;
        running = true; btnPlay.disabled = true; btnStep.disabled = true;
        setSpeedDisabled(true); setModeBtnsDisabled(true);
        function tick() {
            var next = stepIdx + 1;
            if (next >= STEPS.length) {
                running = false; setSpeedDisabled(false); setModeBtnsDisabled(false);
                return;
            }
            applyStep(next, function () {
                if (next === STEPS.length - 1) {
                    running = false; btnStep.disabled = true;
                    setSpeedDisabled(false); setModeBtnsDisabled(false);
                } else {
                    timer = setTimeout(tick, speed * 0.3);
                }
            });
        }
        tick();
    }

    function lbStep() {
        if (running || pktMoving) return;
        var next = stepIdx + 1;
        if (next >= STEPS.length) return;
        applyStep(next, null);
        if (next === STEPS.length - 1) { btnPlay.disabled = true; btnStep.disabled = true; }
    }

    function lbReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false; stepIdx = -1; pktPhase = 'idle'; pktProg = 0;
        pktMoving = false;
        serverConns = [0, 0, 0]; rrIndex = 0; history = []; pktClientIp = '';
        logEl.textContent = '▶ PLAY를 눌러 로드 밸런싱 동작을 확인하세요.';
        btnPlay.disabled = false; btnStep.disabled = false;
        setSpeedDisabled(false); setModeBtnsDisabled(false);
        draw();
    }

    function switchMode(m) {
        mode = m;
        Object.keys(modeBtns).forEach(function (k) {
            modeBtns[k].classList.toggle('lb-viz__mode-btn--active', k === m);
        });
        STEPS = buildSteps();
        lbReset();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.lb-viz__speed-btn').forEach(function (b) {
            b.classList.remove('lb-viz__speed-btn--active');
        });
        btn.classList.add('lb-viz__speed-btn--active');
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