/**
 * 디스크 스케줄링 시각화
 */
(function () {
    'use strict';

    const container = document.getElementById('visualizer-container');
    if (!container) return;

    /* ===================== UI 구성 ===================== */
    function el(tag, cls, txt) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (txt) e.textContent = txt;
        return e;
    }

    const root    = el('div', 'dsk-viz');
    const toolbar = el('div', 'dsk-viz__toolbar');
    const tbLeft  = el('div', 'dsk-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'dsk-viz__title', 'Disk Scheduling'));

    const algoHint = el('span', 'dsk-viz__algo-hint', '알고리즘 →');
    const algoTabs = el('div', 'dsk-viz__algo-tabs');
    ['FCFS', 'SSTF', 'SCAN', 'C-SCAN'].forEach(function (lbl, i) {
        const b = el('button', 'dsk-viz__algo-btn' + (i === 0 ? ' dsk-viz__algo-btn--active' : ''), lbl);
        b.addEventListener('click', function () { if (!running) setAlgo(i, b); });
        algoTabs.appendChild(b);
    });
    tbLeft.appendChild(algoHint);
    tbLeft.appendChild(algoTabs);
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'dsk-viz__speed');
    speedWrap.appendChild(el('span', 'dsk-viz__speed-label', 'SPEED'));
    [['1x', 1200], ['2x', 600], ['3x', 300]].forEach(function (pair, i) {
        const b = el('button', 'dsk-viz__speed-btn' + (i === 0 ? ' dsk-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'dsk-viz__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'dsk-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const logEl = el('div', 'dsk-viz__log', '▶ PLAY를 눌러 헤드 이동 경로를 확인하세요. 알고리즘을 바꿔 비교해 보세요.');
    root.appendChild(logEl);

    const controls = el('div', 'dsk-viz__controls');
    const btnPlay  = el('button', 'dsk-viz__btn dsk-viz__btn--primary', '▶ PLAY');
    const btnStep  = el('button', 'dsk-viz__btn', '▶| STEP');
    const btnReset = el('button', 'dsk-viz__btn', '↺ RESET');
    btnPlay.addEventListener('click',  dskStart);
    btnStep.addEventListener('click',  dskStep);
    btnReset.addEventListener('click', dskReset);
    controls.appendChild(btnPlay);
    controls.appendChild(btnStep);
    controls.appendChild(btnReset);
    root.appendChild(controls);
    container.appendChild(root);

    /* ===================== 캔버스 ===================== */
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const GW  = function () { return canvas.width  / dpr; };
    const GH  = function () { return canvas.height / dpr; };

    function resize() {
        const w = canvasWrap.offsetWidth;
        const h = Math.max(canvasWrap.offsetHeight, w < 520 ? 460 : 440);
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    let P = window.CsFlow.getP();

    /* ===================== 상수 ===================== */
    const INIT_HEAD = 53;
    const REQUESTS  = [98, 183, 37, 122, 14, 124, 65, 67];
    const MAX_TRACK = 199;
    const MIN_TRACK = 0;

    /* ===================== 알고리즘 계산 ===================== */

    function calcFCFS() {
        const seq = [INIT_HEAD].concat(REQUESTS.slice());
        return seq;
    }

    function calcSSTF() {
        const seq  = [INIT_HEAD];
        const rem  = REQUESTS.slice();
        let   cur  = INIT_HEAD;

        while (rem.length > 0) {
            let minDist = Infinity, minIdx = 0;
            rem.forEach(function (t, i) {
                const d = Math.abs(t - cur);
                if (d < minDist) { minDist = d; minIdx = i; }
            });
            cur = rem.splice(minIdx, 1)[0];
            seq.push(cur);
        }
        return seq;
    }

    function calcSCAN() {
        const seq  = [INIT_HEAD];
        const high = REQUESTS.filter(function (t) { return t >= INIT_HEAD; }).sort(function (a, b) { return a - b; });
        const low  = REQUESTS.filter(function (t) { return t <  INIT_HEAD; }).sort(function (a, b) { return b - a; });

        high.forEach(function (t) { seq.push(t); });
        if (high.length > 0 || low.length > 0) seq.push(MAX_TRACK);
        low.forEach(function (t) { seq.push(t); });
        return seq;
    }

    function calcCSCAN() {
        const seq  = [INIT_HEAD];
        const high = REQUESTS.filter(function (t) { return t >= INIT_HEAD; }).sort(function (a, b) { return a - b; });
        const low  = REQUESTS.filter(function (t) { return t <  INIT_HEAD; }).sort(function (a, b) { return a - b; });

        high.forEach(function (t) { seq.push(t); });
        seq.push(MAX_TRACK);
        seq.push(MIN_TRACK);
        low.forEach(function (t)  { seq.push(t); });
        return seq;
    }

    function totalDist(seq) {
        let d = 0;
        for (let i = 1; i < seq.length; i++) d += Math.abs(seq[i] - seq[i-1]);
        return d;
    }

    const ALGOS = [
        { name: 'FCFS',   fn: calcFCFS,  col: function() { return P.teal;   }, desc: 'First-Come First-Served — 요청 순서대로 처리' },
        { name: 'SSTF',   fn: calcSSTF,  col: function() { return P.purple; }, desc: 'Shortest Seek Time First — 가장 가까운 트랙 우선' },
        { name: 'SCAN',   fn: calcSCAN,  col: function() { return P.orange; }, desc: 'SCAN (엘리베이터) — 끝까지 이동 후 방향 전환' },
        { name: 'C-SCAN', fn: calcCSCAN, col: function() { return P.green;  }, desc: 'Circular SCAN — 한 방향, 끝에서 0으로 점프' },
    ];

    /* ===================== 상태 변수 ===================== */
    let algoIdx  = 0;
    let sequence = calcFCFS();
    let stepIdx  = 0;
    let running  = false;
    let timer    = null;
    let rafId    = null;
    let speed    = 1200;

    /* ===================== 드로우 헬퍼 ===================== */
    function tx(str, x, y, sz, color, align, bold) {
        ctx.font = (bold ? '700' : '400') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    function rr(x, y, w, h, r, fill, stroke, lw) {
        if (w <= 0 || h <= 0) return;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        if (fill)   { ctx.fillStyle = fill;   ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
    }

    /* ===================== 레이아웃 ===================== */
    function buildLayout() {
        const W = GW(), H = GH();
        const mob = W < 520;
        const fSm = mob ? 11 : 12;
        const fMd = mob ? 13 : 14;

        const pad   = mob ? 10 : 20;
        const yLblW = mob ? 32 : 40;
        const statH  = mob ? 152 : 162;
        const topPad = mob ? 18 : 22;
        const botPad = mob ? 8  : 10;

        const chartX = pad + yLblW;
        const chartY = topPad;
        const chartW = W - chartX - pad;
        const chartH = H - topPad - statH - botPad;

        const totalSteps = sequence.length - 1;
        const xStep = totalSteps > 0 ? chartW / totalSteps : chartW;

        const yPad = Math.round(chartH * 0.06);
        const yUse = chartH - yPad * 2;
        function trackToY(track) {
            return chartY + yPad + yUse - Math.round((track / MAX_TRACK) * yUse);
        }
        function stepToX(i) {
            return chartX + Math.round(i * xStep);
        }

        return {
            W, H, mob, fSm, fMd,
            pad, yLblW, statH, topPad, botPad,
            chartX, chartY, chartW, chartH,
            xStep, trackToY, stepToX,
        };
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        ctx.fillStyle = P.bg;
        ctx.fillRect(0, 0, GW(), GH());

        const L = buildLayout();
        drawGrid(L);
        drawPath(L);
        drawStats(L);
    }

    /* ===================== 그리드 + 축 ===================== */
    function drawGrid(L) {
        const { chartX, chartY, chartW, chartH, fSm, pad, yLblW, trackToY, mob } = L;

        const yMarks = [0, 50, 100, 150, 199];
        yMarks.forEach(function (t) {
            const y = trackToY(t);
            ctx.setLineDash([4, 6]);
            ctx.beginPath(); ctx.moveTo(chartX, y); ctx.lineTo(chartX + chartW, y);
            ctx.strokeStyle = P.border; ctx.lineWidth = 1; ctx.stroke();
            ctx.setLineDash([]);
            tx(String(t), chartX - 6, y, fSm, P.muted, 'right', false);
        });

        ctx.beginPath();
        ctx.moveTo(chartX, chartY);
        ctx.lineTo(chartX, chartY + chartH);
        ctx.strokeStyle = P.border; ctx.lineWidth = 1.5; ctx.stroke();

        ctx.save();
        ctx.translate(Math.round(pad / 2) + 1, chartY + chartH / 2);
        ctx.rotate(-Math.PI / 2);
        tx('트랙 번호', 0, 0, fSm, P.muted, 'center', false);
        ctx.restore();

        const total = sequence.length - 1;
        const showEvery = mob ? 2 : 1;
        for (let i = 0; i <= total; i++) {
            if (i % showEvery !== 0) continue;
            const x = L.stepToX(i);
            ctx.beginPath(); ctx.moveTo(x, chartY + chartH); ctx.lineTo(x, chartY + chartH + 4);
            ctx.strokeStyle = P.border; ctx.lineWidth = 1; ctx.stroke();
            if (i > 0 || true) {
                tx(String(i), x, chartY + chartH + (mob ? 12 : 14), fSm - 1, P.muted, 'center', false);
            }
        }
        tx('처리 순서', chartX + chartW / 2, chartY + chartH + (mob ? 24 : 28), fSm, P.muted, 'center', false);

        REQUESTS.forEach(function (t) {
            const y = trackToY(t);
            ctx.setLineDash([2, 8]);
            ctx.beginPath(); ctx.moveTo(chartX, y); ctx.lineTo(chartX + chartW, y);
            ctx.strokeStyle = P.muted + '44'; ctx.lineWidth = 1; ctx.stroke();
            ctx.setLineDash([]);
        });
    }

    /* ===================== 헤드 경로 그리기 ===================== */
    function drawPath(L) {
        const { chartX, chartY, chartW, chartH, fSm, mob, trackToY, stepToX } = L;
        const col    = ALGOS[algoIdx].col();
        const isCscan = algoIdx === 3;

        for (let i = 1; i <= stepIdx && i < sequence.length; i++) {
            const x1 = stepToX(i - 1);
            const y1 = trackToY(sequence[i - 1]);
            const x2 = stepToX(i);
            const y2 = trackToY(sequence[i]);

            const isJump = isCscan && sequence[i-1] === MAX_TRACK && sequence[i] === MIN_TRACK;
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
            ctx.strokeStyle = col;
            ctx.lineWidth   = mob ? 2 : 2.5;
            if (isJump) ctx.setLineDash([6, 5]);
            ctx.stroke(); ctx.setLineDash([]);
        }

        for (let i = 0; i <= stepIdx && i < sequence.length; i++) {
            const x  = stepToX(i);
            const y  = trackToY(sequence[i]);
            const isHead    = i === 0;
            const isRequest = i > 0;
            const isCur     = i === stepIdx;

            const r = isCur ? (mob ? 8 : 9) : isHead ? (mob ? 6 : 7) : (mob ? 4 : 5);

            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = isCur ? col : isHead ? P.yellow : col + 'bb';
            ctx.fill();

            if (isCur) {
                ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
            }

            const lbl   = String(sequence[i]);
            const above = (i === 0 || sequence[i] >= sequence[Math.max(0, i-1)]);
            const ly    = above ? y - r - (mob ? 9 : 11) : y + r + (mob ? 9 : 11);
            tx(lbl, x, ly, mob ? fSm - 1 : fSm, isCur ? col : P.sub, 'center', isCur);
        }

        if (stepIdx > 0 && stepIdx < sequence.length) {
            const hy = trackToY(sequence[stepIdx]);
            ctx.beginPath(); ctx.moveTo(chartX, hy); ctx.lineTo(chartX + chartW, hy);
            ctx.strokeStyle = col + '55'; ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
        }
    }

    /* ===================== 하단 통계 ===================== */
    function drawStats(L) {
        const { W, H, chartX, chartH, chartY, chartW, statH, fSm, fMd, mob, topPad, botPad } = L;
        const col  = ALGOS[algoIdx].col();
        const dist = calcDistUpTo(stepIdx);
        const done = stepIdx >= sequence.length - 1;

        const bY = chartY + chartH + (mob ? 36 : 40);
        const bW = mob ? W - 20 : Math.min(W - 40, 440);
        const bX = Math.round((W - bW) / 2);
        const bH = mob ? 44 : 50;

        rr(bX, bY, bW, bH, 6, P.surf, done ? col : P.border, done ? 2 : 1);

        const third = bW / 3;

        tx(ALGOS[algoIdx].name, bX + third * 0.5, bY + bH * 0.32, fSm - 1, P.muted, 'center', false);
        tx(String(dist), bX + third * 0.5, bY + bH * 0.70, fMd + 2, col, 'center', true);

        tx('헤드 이동 거리', bX + third * 1.5, bY + bH * 0.32, fSm - 1, P.muted, 'center', false);
        tx(dist + (done ? ' 트랙' : '...'), bX + third * 1.5, bY + bH * 0.70, fMd + (mob?0:2), col, 'center', true);

        const totalAll = totalDist(sequence);
        tx('최대 가능', bX + third * 2.5, bY + bH * 0.32, fSm - 1, P.muted, 'center', false);
        tx(String(totalAll), bX + third * 2.5, bY + bH * 0.70, fMd + 2, P.muted, 'center', false);

        [1, 2].forEach(function (d) {
            ctx.beginPath();
            ctx.moveTo(bX + third * d, bY + 6);
            ctx.lineTo(bX + third * d, bY + bH - 6);
            ctx.strokeStyle = P.border; ctx.lineWidth = 1; ctx.stroke();
        });

        if (done) {
            drawCompare(L, bY + bH);
        }
    }

    function calcDistUpTo(idx) {
        let d = 0;
        for (let i = 1; i <= idx && i < sequence.length; i++) {
            d += Math.abs(sequence[i] - sequence[i-1]);
        }
        return d;
    }

    function drawCompare(L, startY) {
        const { W, mob, fSm, fMd } = L;
        const gap = mob ? 8 : 10;
        const bY  = startY + gap;
        const bW  = mob ? W - 20 : Math.min(W - 40, 440);
        const bX  = Math.round((W - bW) / 2);
        const bH  = mob ? 48 : 54;

        rr(bX, bY, bW, bH, 6, P.surf2, P.border, 1);
        tx('알고리즘 비교 (총 이동 거리)', bX + bW/2, bY + bH * 0.22, fSm - 1, P.muted, 'center', false);

        const fourth = bW / 4;
        ALGOS.forEach(function (algo, i) {
            const cx     = bX + fourth * (i + 0.5);
            const d      = totalDist(algo.fn());
            const isMine = algoIdx === i;
            const col_   = algo.col();
            tx(algo.name, cx, bY + bH * 0.48, fSm - 1, isMine ? col_ : P.muted, 'center', isMine);
            tx(String(d), cx, bY + bH * 0.76, fMd,     isMine ? col_ : P.muted, 'center', isMine);
        });

        [1, 2, 3].forEach(function (d) {
            ctx.beginPath();
            ctx.moveTo(bX + fourth * d, bY + 8);
            ctx.lineTo(bX + fourth * d, bY + bH - 8);
            ctx.strokeStyle = P.border; ctx.lineWidth = 1; ctx.stroke();
        });
    }

    /* ===================== 로그 텍스트 ===================== */
    function makeLog(idx) {
        if (idx === 0) {
            return ALGOS[algoIdx].name + ' — 초기 헤드 위치: 트랙 ' + INIT_HEAD +
                   '. 요청 큐: [' + REQUESTS.join(', ') + ']. 헤드 이동을 시작합니다.';
        }
        const from = sequence[idx - 1];
        const to   = sequence[idx];
        const dist = Math.abs(to - from);
        const total = calcDistUpTo(idx);
        const algo  = ALGOS[algoIdx].name;

        const isCscan = algoIdx === 3;
        const isJump  = isCscan && from === MAX_TRACK && to === MIN_TRACK;

        if (isJump) {
            return algo + ' Step ' + idx + ' — C-SCAN: 끝(트랙 199)에서 트랙 0으로 점프(이동 없이 복귀). 총 이동: ' + total + ' 트랙.';
        }

        const isEdge = (to === MAX_TRACK || to === MIN_TRACK) && (algoIdx === 2 || algoIdx === 3);
        if (isEdge) {
            const dir = to === MAX_TRACK ? '최대(199)' : '최소(0)';
            return algo + ' Step ' + idx + ' — 헤드가 ' + dir + '에 도달했습니다. (' + dist + ' 트랙 이동) 총: ' + total + ' 트랙.';
        }

        return algo + ' Step ' + idx + ' — 트랙 ' + from + ' → ' + to +
               ' (' + dist + ' 트랙 이동). 누적 이동 거리: ' + total + ' 트랙.';
    }

    /* ===================== 단계 적용 ===================== */
    function setAlgoBtnsDisabled(v) {
        root.querySelectorAll('.dsk-viz__algo-btn').forEach(function (b) { b.disabled = v; });
    }
    function setSpeedDisabled(v) {
        root.querySelectorAll('.dsk-viz__speed-btn').forEach(function (b) { b.disabled = v; });
    }

    function applyStep(idx, onDone) {
        stepIdx = idx;
        logEl.textContent = makeLog(idx);
        draw();
        if (onDone) setTimeout(onDone, 0);
    }

    /* ===================== 컨트롤 ===================== */
    function dskStart() {
        if (running) return;
        running = true; btnPlay.disabled = true; btnStep.disabled = true;
        setAlgoBtnsDisabled(true); setSpeedDisabled(true);

        function tick() {
            const next = stepIdx + 1;
            if (next >= sequence.length) { running = false; setSpeedDisabled(false); return; }
            applyStep(next, function () {
                if (next >= sequence.length - 1) {
                    running = false; btnStep.disabled = true; setSpeedDisabled(false);
                } else {
                    timer = setTimeout(tick, speed);
                }
            });
        }
        tick();
    }

    function dskStep() {
        if (running) return;
        const next = stepIdx + 1;
        if (next >= sequence.length) return;
        applyStep(next, null);
        if (next >= sequence.length - 1) { btnPlay.disabled = true; btnStep.disabled = true; }
    }

    function dskReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false; stepIdx = 0;
        logEl.textContent = '▶ PLAY를 눌러 헤드 이동 경로를 확인하세요. 알고리즘을 바꿔 비교해 보세요.';
        btnPlay.disabled = false; btnStep.disabled = false;
        setAlgoBtnsDisabled(false); setSpeedDisabled(false);
        draw();
    }

    function setAlgo(idx, btn) {
        algoIdx  = idx;
        sequence = ALGOS[idx].fn();
        root.querySelectorAll('.dsk-viz__algo-btn').forEach(function (b) {
            b.classList.remove('dsk-viz__algo-btn--active');
        });
        btn.classList.add('dsk-viz__algo-btn--active');
        dskReset();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.dsk-viz__speed-btn').forEach(function (b) {
            b.classList.remove('dsk-viz__speed-btn--active');
        });
        btn.classList.add('dsk-viz__speed-btn--active');
    }

    /* ===================== 라이프사이클 ===================== */
    window.CsFlow.createVizLifecycle({
        canvas, canvasWrap, resize, draw,
        getState : function () { return { rafId, timer, running }; },
        setState : function (s) { rafId = s.rafId; timer = s.timer; running = s.running; },
        onPause  : function () { setSpeedDisabled(false); },
        getMouseCtx: function () {
            return {
                GW, GH,
                mousePos:    { x: -1, y: -1 },
                tooltipHits: [],
                hoveredKey   : function () { return null; },
                setHoveredKey: function () {},
                draw,
            };
        },
    });

    setTimeout(resize, 60);
})();