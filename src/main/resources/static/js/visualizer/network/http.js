/**
 * HTTP 시각화 — HTTP/1.1 순차 요청 vs HTTP/2 멀티플렉싱
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
    const root    = el('div', 'http-viz');
    const toolbar = el('div', 'http-viz__toolbar');
    const tbLeft  = el('div', 'http-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'http-viz__title', 'HTTP Request / Response'));

    const btn11  = el('button', 'http-viz__mode-btn http-viz__mode-btn--active', 'HTTP/1.1');
    const btn2   = el('button', 'http-viz__mode-btn', 'HTTP/2');
    btn11.addEventListener('click', function () { if (!running) switchMode('http1'); });
    btn2.addEventListener('click',  function () { if (!running) switchMode('http2'); });
    tbLeft.appendChild(btn11);
    tbLeft.appendChild(btn2);
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'http-viz__speed');
    speedWrap.appendChild(el('span', 'http-viz__speed-label', 'SPEED'));
    [['1x', 1800], ['2x', 900], ['3x', 600]].forEach(function (pair, i) {
        const b = el('button', 'http-viz__speed-btn' + (i === 0 ? ' http-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'http-viz__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'http-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const logEl = el('div', 'http-viz__log', '▶ PLAY를 눌러 HTTP/1.1 요청/응답 흐름을 확인하세요.');
    root.appendChild(logEl);

    const controls = el('div', 'http-viz__controls');
    const btnPlay  = el('button', 'http-viz__btn http-viz__btn--primary', '▶ PLAY');
    const btnStep  = el('button', 'http-viz__btn', '▶| STEP');
    const btnReset = el('button', 'http-viz__btn', '↺ RESET');
    btnPlay.addEventListener('click',  httpStart);
    btnStep.addEventListener('click',  httpStep);
    btnReset.addEventListener('click', httpReset);
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

    /* ===================== 시나리오 ===================== */
    const SCENARIOS = {
        http1: [
            {
                log: 'HTTP/1.1 — 하나의 TCP 연결로 순차 요청합니다. 첫 번째 요청부터 시작합니다. HOL(Head-of-Line) 블로킹으로 이전 응답을 받아야 다음 요청을 보낼 수 있습니다.',
                pkts: null,
                phase: 'init',
            },
            {
                log: 'Step 1 — GET /index.html 요청. 브라우저가 HTML 파일을 요청합니다.',
                pkts: [{ dir: 'c2s', label: 'GET /index.html', sub: 'HTTP/1.1  Host: example.com', color: 'purple', slot: 0 }],
                phase: 'req1',
            },
            {
                log: 'Step 2 — 200 OK 응답. 서버가 HTML을 반환합니다. 이 응답이 도착해야 다음 요청을 보낼 수 있습니다.',
                pkts: [{ dir: 's2c', label: '200 OK', sub: 'Content-Type: text/html', color: 'green', slot: 0 }],
                phase: 'res1',
            },
            {
                log: 'Step 3 — GET /style.css 요청. HTML 파싱 후 CSS를 요청합니다. HTTP/1.1은 이전 응답 완료 후에야 다음 요청 가능합니다.',
                pkts: [{ dir: 'c2s', label: 'GET /style.css', sub: 'HTTP/1.1  Keep-Alive', color: 'teal', slot: 1 }],
                phase: 'req2',
            },
            {
                log: 'Step 4 — 200 OK 응답. CSS 파일을 반환합니다.',
                pkts: [{ dir: 's2c', label: '200 OK', sub: 'Content-Type: text/css', color: 'teal', slot: 1 }],
                phase: 'res2',
            },
            {
                log: 'Step 5 — GET /script.js 요청. JS 파일을 순차적으로 요청합니다.',
                pkts: [{ dir: 'c2s', label: 'GET /script.js', sub: 'HTTP/1.1  Keep-Alive', color: 'orange', slot: 2 }],
                phase: 'req3',
            },
            {
                log: 'Step 6 — 200 OK 응답 ✓  3개 리소스를 모두 받았습니다. HTTP/1.1은 요청→응답→요청→응답 순서로 처리해 총 6번의 왕복이 필요했습니다.',
                pkts: [{ dir: 's2c', label: '200 OK', sub: 'Content-Type: application/javascript', color: 'orange', slot: 2 }],
                phase: 'res3',
                done: true,
            },
        ],
        http2: [
            {
                log: 'HTTP/2 — 하나의 TCP 연결에서 멀티플렉싱으로 여러 스트림을 동시에 처리합니다. 스트림 ID(홀수)로 각 요청을 구분합니다.',
                pkts: null,
                phase: 'init',
            },
            {
                log: 'Step 1 — 3개 요청 동시 전송. Stream 1(HTML)·Stream 3(CSS)·Stream 5(JS)를 한꺼번에 전송합니다. HTTP/1.1의 HOL 블로킹이 없습니다.',
                pkts: [
                    { dir: 'c2s', label: 'GET /index.html', sub: 'Stream ID: 1', color: 'purple', slot: 0 },
                    { dir: 'c2s', label: 'GET /style.css',  sub: 'Stream ID: 3', color: 'teal',   slot: 1 },
                    { dir: 'c2s', label: 'GET /script.js',  sub: 'Stream ID: 5', color: 'orange', slot: 2 },
                ],
                phase: 'req_all',
            },
            {
                log: 'Step 2 — 3개 응답 동시 수신 ✓  서버가 준비된 순서대로 응답합니다. 스트림별로 독립 처리되어 한 응답이 느려도 다른 응답에 영향 없습니다. HTTP/1.1 대비 왕복 횟수가 절반으로 줄었습니다.',
                pkts: [
                    { dir: 's2c', label: '200 OK (HTML)', sub: 'Stream ID: 1', color: 'purple', slot: 0 },
                    { dir: 's2c', label: '200 OK (CSS)',  sub: 'Stream ID: 3', color: 'teal',   slot: 1 },
                    { dir: 's2c', label: '200 OK (JS)',   sub: 'Stream ID: 5', color: 'orange', slot: 2 },
                ],
                phase: 'res_all',
                done: true,
            },
        ],
    };

    let mode      = 'http1';
    let stepIdx   = -1;
    let running   = false;
    let timer     = null;
    let rafId     = null;
    let speed     = 1800;
    let pktMoving = false;
    let history   = [];
    let animProgs = [];

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

        const F_HOST   = mob ? 13 : 14;
        const F_STATUS = mob ? 10 : 11;
        const F_LABEL  = mob ? 11 : 12;
        const F_SUB    = mob ? 10 : 11;

        const hostW = mob ? 80 : 100;
        const hostH = mob ? 36 : 42;
        const hostY = mob ? 28 : 34;

        const cLineX = pad + hostW / 2;
        const sLineX = W - pad - hostW / 2;

        const lineTop = hostY + hostH + 8;
        const lineBot = H - 16;

        const slotCount = 3;
        var REQ_LBL  = mob ? 26 : 30;
        var LINE_PAD = mob ?  8 : 10;
        var RES_LBL  = mob ? 26 : 30;
        var SLOT_GAP = mob ? 12 : 16;
        var slotH    = REQ_LBL + LINE_PAD + LINE_PAD + RES_LBL + SLOT_GAP;

        return { W, H, mob, pad,
                 F_HOST, F_STATUS, F_LABEL, F_SUB,
                 hostW, hostH, hostY,
                 cLineX, sLineX, lineTop, lineBot,
                 slotH, slotCount,
                 REQ_LBL, LINE_PAD, RES_LBL };
    }

    function slotTopY(L, slot) {
        return L.lineTop + slot * L.slotH;
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());

        const L    = buildLayout();
        const step = stepIdx >= 0 ? SCENARIOS[mode][stepIdx] : SCENARIOS[mode][0];

        drawHosts(L, step);
        drawTimelines(L);
        drawHistory(L);
        if (step.pkts && pktMoving) drawMovingPkts(L, step);
        if (step.pkts && !pktMoving && stepIdx >= 0) drawArrivedPkts(L, step);
    }

    /* ===================== 호스트 박스 ===================== */
    function drawHosts(L, step) {
        const { pad, hostW, hostH, hostY, cLineX, sLineX, F_HOST, F_STATUS } = L;
        var isDone = step.done;

        var cCol = isDone ? P.green : P.purple;
        var sCol = isDone ? P.green : P.teal;

        rr(cLineX - hostW / 2, hostY, hostW, hostH, 5, cCol + '22', cCol, 2);
        tx('BROWSER', cLineX, hostY + hostH * 0.38, F_HOST, cCol, 'center', true);
        tx(mode === 'http1' ? 'HTTP/1.1' : 'HTTP/2',
           cLineX, hostY + hostH * 0.72, F_STATUS, cCol + 'cc', 'center', false);

        rr(sLineX - hostW / 2, hostY, hostW, hostH, 5, sCol + '22', sCol, 2);
        tx('SERVER',  sLineX, hostY + hostH * 0.38, F_HOST, sCol, 'center', true);
        tx(mode === 'http1' ? 'HTTP/1.1' : 'HTTP/2',
           sLineX, hostY + hostH * 0.72, F_STATUS, sCol + 'cc', 'center', false);
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

    /* ===================== 히스토리 (완료 패킷) ===================== */
    function drawHistory(L) {
        history.forEach(function (item) {
            item.pkts.forEach(function (pkt) {
                drawArrow(L, pkt, 1);
            });
        });
    }

    /* ===================== 이동 중 패킷 ===================== */
    function drawMovingPkts(L, step) {
        step.pkts.forEach(function (pkt, i) {
            var prog = animProgs[i] !== undefined ? animProgs[i] : 0;
            drawArrow(L, pkt, prog);
        });
    }

    /* ===================== 도착 패킷 ===================== */
    function drawArrivedPkts(L, step) {
        step.pkts.forEach(function (pkt) {
            drawArrow(L, pkt, 1);
        });
    }

    /* ===================== 화살표 + 레이블 ===================== */
    function drawArrow(L, pkt, prog) {
        const { cLineX, sLineX, mob, REQ_LBL, LINE_PAD, RES_LBL } = L;
        var fLbl = mob ? 13 : 14;
        var fSub = mob ? 11 : 12;
        var col   = pColor(pkt.color);
        var fromX = pkt.dir === 'c2s' ? cLineX : sLineX;
        var toX   = pkt.dir === 'c2s' ? sLineX : cLineX;

        var top = slotTopY(L, pkt.slot);
        var lineY, lblMainY, lblSubY;

        if (pkt.dir === 'c2s') {
            lblMainY = top + fLbl * 0.6;
            lblSubY  = top + fLbl + fSub * 0.8;
            lineY    = top + REQ_LBL + LINE_PAD;
        } else {
            lineY    = top + REQ_LBL + LINE_PAD * 2;
            lblSubY  = lineY + LINE_PAD * 0.6 + fSub * 0.6;
            lblMainY = lineY + LINE_PAD + fSub + fLbl * 0.6;
        }

        var cx   = fromX + (toX - fromX) * prog;
        var midX = (fromX + toX) / 2;

        ctx.beginPath();
        ctx.moveTo(fromX, lineY);
        ctx.lineTo(cx, lineY);
        ctx.strokeStyle = prog < 1 ? col + '55' : col + 'cc';
        ctx.lineWidth   = 1.5;
        ctx.stroke();

        if (prog >= 1) {
            var ad = toX > fromX ? 1 : -1;
            ctx.beginPath();
            ctx.moveTo(toX, lineY);
            ctx.lineTo(toX - ad * 10, lineY - 5);
            ctx.lineTo(toX - ad * 10, lineY + 5);
            ctx.closePath();
            ctx.fillStyle = col + 'cc';
            ctx.fill();
        }

        if (prog < 1) {
            var r = mob ? 14 : 18;
            ctx.beginPath(); ctx.arc(cx, lineY, r, 0, Math.PI * 2);
            ctx.fillStyle   = col + '22'; ctx.fill();
            ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
            tx(pkt.label, cx, lineY - r - fLbl * 0.6, fLbl, col, 'center', true);
        } else {
            tx(pkt.label, midX, lblMainY, fLbl, col,        'center', true);
            tx(pkt.sub,   midX, lblSubY,  fSub, col + 'aa', 'center', false);
        }
    }

    /* ===================== 애니메이션 ===================== */
    function animateStep(step, cb) {
        if (!step.pkts) { draw(); if (cb) cb(); return; }

        var count = step.pkts.length;
        animProgs = [];
        for (var i = 0; i < count; i++) animProgs[i] = 0;

        pktMoving = true;
        if (rafId) cancelAnimationFrame(rafId);

        var s = 0.007 * (1800 / speed);
        (function tick() {
            var allDone = true;
            for (var i = 0; i < count; i++) {
                animProgs[i] = Math.min(1, animProgs[i] + s);
                if (animProgs[i] < 1) allDone = false;
            }
            draw();
            if (!allDone) {
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
        root.querySelectorAll('.http-viz__speed-btn').forEach(function (b) { b.disabled = v; });
    }

    function setModeBtnsDisabled(v) {
        btn11.disabled = v;
        btn2.disabled  = v;
    }

    function applyStep(idx, onDone) {
        stepIdx = idx;
        var step = SCENARIOS[mode][idx];
        logEl.textContent = step.log;
        animateStep(step, function () {
            if (step.pkts) {
                history.push({ pkts: step.pkts });
            }
            if (onDone) setTimeout(onDone, 0);
        });
    }

    function httpStart() {
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

    function httpStep() {
        if (running || pktMoving) return;
        var next = stepIdx + 1;
        var sc   = SCENARIOS[mode];
        if (next >= sc.length) return;
        applyStep(next, null);
        if (next === sc.length - 1) { btnPlay.disabled = true; btnStep.disabled = true; }
    }

    function httpReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false; stepIdx = -1; pktMoving = false;
        animProgs = []; history = [];
        logEl.textContent = mode === 'http1'
            ? '▶ PLAY를 눌러 HTTP/1.1 요청/응답 흐름을 확인하세요.'
            : '▶ PLAY를 눌러 HTTP/2 멀티플렉싱 흐름을 확인하세요.';
        btnPlay.disabled = false; btnStep.disabled = false;
        setSpeedDisabled(false); setModeBtnsDisabled(false);
        draw();
    }

    function switchMode(m) {
        mode = m;
        btn11.classList.toggle('http-viz__mode-btn--active', m === 'http1');
        btn2.classList.toggle('http-viz__mode-btn--active',  m === 'http2');
        httpReset();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.http-viz__speed-btn').forEach(function (b) {
            b.classList.remove('http-viz__speed-btn--active');
        });
        btn.classList.add('http-viz__speed-btn--active');
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