/**
 * CPU 스케줄링 시각화 — FCFS / SJF / Round Robin 간트 차트 애니메이션
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

    const root    = el('div', 'sched-viz');
    const toolbar = el('div', 'sched-viz__toolbar');
    const tbLeft  = el('div', 'sched-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'sched-viz__title', 'CPU Scheduling'));

    const algoTabs = el('div', 'sched-viz__algo-tabs');
    ['FCFS', 'SJF', 'RR (q=2)'].forEach(function (lbl, i) {
        const b = el('button', 'sched-viz__algo-btn' + (i === 0 ? ' sched-viz__algo-btn--active' : ''), lbl);
        b.dataset.algo = i;
        b.addEventListener('click', function () {
            if (running) return;
            setAlgo(i, b);
        });
        algoTabs.appendChild(b);
    });
    const algoHint = el('span', 'sched-viz__algo-hint', '알고리즘 선택 →');
    tbLeft.appendChild(algoHint);
    tbLeft.appendChild(algoTabs);
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'sched-viz__speed');
    speedWrap.appendChild(el('span', 'sched-viz__speed-label', 'SPEED'));
    [['1x', 1800], ['2x', 900], ['3x', 600]].forEach(function (pair, i) {
        const lbl = pair[0], ms = pair[1];
        const b = el('button', 'sched-viz__speed-btn' + (i === 0 ? ' sched-viz__speed-btn--active' : ''), lbl);
        b.addEventListener('click', function () { if (!running) setSpeed(ms, b); });
        speedWrap.appendChild(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'sched-viz__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'sched-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const logEl = el('div', 'sched-viz__log', '▶ PLAY를 눌러 스케줄링 과정을 확인하세요. 상단 버튼으로 알고리즘을 바꿀 수 있습니다.');
    root.appendChild(logEl);

    const controls = el('div', 'sched-viz__controls');
    const btnPlay  = el('button', 'sched-viz__btn sched-viz__btn--primary', '▶ PLAY');
    const btnStep  = el('button', 'sched-viz__btn', '▶| STEP');
    const btnReset = el('button', 'sched-viz__btn', '↺ RESET');
    btnPlay.addEventListener('click',  schedStart);
    btnStep.addEventListener('click',  schedStep);
    btnReset.addEventListener('click', schedReset);
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

    function calcMinHeight() {
        const rowH   = 34, rowGap = 8, rows = PROCS.length;
        const tAxisH = 48;
        const ganttH = rows * (rowH + rowGap);
        const timeLblH = 20;
        const statH  = (rows + 2) * 24 + 8;
        const extra  = 48;
        return tAxisH + ganttH + timeLblH + statH + extra;
    }

    function resize() {
        const w    = canvasWrap.offsetWidth;
        const mob  = w < 520;
        const minH = mob ? calcMinHeight() : 480;
        const h    = Math.max(canvasWrap.offsetHeight, minH);
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    /* ===================== 팔레트 ===================== */
    let P = window.CsFlow.getP();

    /* ===================== 프로세스 데이터 ===================== */
    const PROCS = [
        { id: 'P1', arrival: 0, burst: 6 },
        { id: 'P2', arrival: 1, burst: 3 },
        { id: 'P3', arrival: 2, burst: 4 },
        { id: 'P4', arrival: 3, burst: 2 },
    ];

    const PROC_COLS = { P1: null, P2: null, P3: null, P4: null };

    /* ===================== 알고리즘별 간트 슬롯 계산 ===================== */
    function calcFCFS(procs) {
        const slots = [];
        let t = 0;
        const sorted = procs.slice().sort(function (a, b) { return a.arrival - b.arrival; });
        sorted.forEach(function (p) {
            if (t < p.arrival) t = p.arrival;
            slots.push({ id: p.id, start: t, end: t + p.burst });
            t += p.burst;
        });
        return slots;
    }

    function calcSJF(procs) {
        const slots = [];
        let t = 0;
        const remaining = procs.map(function (p) { return Object.assign({}, p); });
        const done = [];
        while (done.length < procs.length) {
            const avail = remaining.filter(function (p) {
                return done.indexOf(p.id) === -1 && p.arrival <= t;
            });
            if (!avail.length) {
                const next = remaining
                    .filter(function (p) { return done.indexOf(p.id) === -1; })
                    .reduce(function (mn, p) { return p.arrival < mn ? p.arrival : mn; }, Infinity);
                t = next;
                continue;
            }
            avail.sort(function (a, b) { return a.burst - b.burst || a.arrival - b.arrival; });
            const sel = avail[0];
            slots.push({ id: sel.id, start: t, end: t + sel.burst });
            t += sel.burst;
            done.push(sel.id);
        }
        return slots;
    }

    function calcRR(procs, quantum) {
        const slots = [];
        const q = quantum || 2;
        let t = 0;
        const rem = procs.map(function (p) {
            return { id: p.id, arrival: p.arrival, rem: p.burst };
        });
        const queue = [];
        const enqueued = {};
        let safety = 0;

        while (true) {
            rem.forEach(function (p) {
                if (p.arrival <= t && !enqueued[p.id] && p.rem > 0) {
                    queue.push(p.id);
                    enqueued[p.id] = true;
                }
            });

            if (!queue.length) {
                const next = rem.filter(function (p) { return p.rem > 0; });
                if (!next.length) break;
                t = next.reduce(function (mn, p) { return p.arrival < mn ? p.arrival : mn; }, Infinity);
                continue;
            }

            const cur = queue.shift();
            const proc = rem.find(function (p) { return p.id === cur; });
            const run  = Math.min(q, proc.rem);
            slots.push({ id: proc.id, start: t, end: t + run });
            t += run;
            proc.rem -= run;

            rem.forEach(function (p) {
                if (p.arrival <= t && !enqueued[p.id] && p.rem > 0) {
                    queue.push(p.id);
                    enqueued[p.id] = true;
                }
            });
            if (proc.rem > 0) queue.push(proc.id);

            if (++safety > 500) break;
        }
        return slots;
    }

    /* ===================== 통계 계산 ===================== */
    function calcStats(procs, slots) {
        return procs.map(function (p) {
            const mySlots = slots.filter(function (s) { return s.id === p.id; });
            const finish  = mySlots.reduce(function (mx, s) { return s.end > mx ? s.end : mx; }, 0);
            const turnaround = finish - p.arrival;
            const waiting = turnaround - p.burst;
            return { id: p.id, arrival: p.arrival, burst: p.burst, finish, turnaround, waiting };
        });
    }

    /* ===================== 알고리즘 데이터 ===================== */
    const ALGOS = [
        {
            name: 'FCFS',
            desc: 'First-Come, First-Served — 도착 순서대로 비선점 실행',
            slots: calcFCFS(PROCS),
        },
        {
            name: 'SJF',
            desc: 'Shortest Job First — 도착한 프로세스 중 버스트가 가장 짧은 것 먼저',
            slots: calcSJF(PROCS),
        },
        {
            name: 'RR (q=2)',
            desc: 'Round Robin (Quantum=2) — 타임 퀀텀 2단위마다 선점',
            slots: calcRR(PROCS, 2),
        },
    ];

    const MAX_T = ALGOS.reduce(function (mx, a) {
        const end = a.slots.reduce(function (m, s) { return s.end > m ? s.end : m; }, 0);
        return end > mx ? end : mx;
    }, 0);

    /* ===================== 상태 변수 ===================== */
    let algoIdx    = 0;
    let stepIdx    = -1;
    let running    = false;
    let timer      = null;
    let rafId      = null;
    let speed      = 1800;

    let animProg   = 0;
    let animActive = false;

    let tooltipHits = [];
    let mousePos    = { x: -1, y: -1 };
    let hoveredKey  = null;

    /* ===================== 드로우 헬퍼 ===================== */
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

    function tx(str, x, y, sz, color, align, bold) {
        ctx.font = (bold ? '700' : '400') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    /* ===================== 프로세스 색상 ===================== */
    function procCol(id) {
        const map = { P1: P.teal, P2: P.purple, P3: P.orange, P4: P.green };
        return map[id] || P.muted;
    }

    /* ===================== 레이아웃 계산 ===================== */
    function layout() {
        const W   = GW(), H = GH();
        const mob = W < 520;
        const pad = mob ? 12 : 24;

        const chartX = pad + (mob ? 28 : 36);
        const chartW = W - chartX - pad;
        const unitW  = chartW / MAX_T;

        const rowH   = mob ? 34 : 42;
        const rowGap = mob ? 8  : 12;
        const rows   = PROCS.length;

        const timeAxisY = (mob ? 28 : 36);
        const ganttStartY = timeAxisY + (mob ? 20 : 26);
        const statsY = ganttStartY + rows * (rowH + rowGap) + (mob ? 24 : 36);

        return { W, H, mob, pad, chartX, chartW, unitW, rowH, rowGap, rows,
                 timeAxisY, ganttStartY, statsY };
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        ctx.fillStyle = P.bg;
        ctx.fillRect(0, 0, GW(), GH());
        tooltipHits = [];

        const L    = layout();
        const algo = ALGOS[algoIdx];
        const slots = algo.slots;

        drawAlgoLabel(L, algo);
        drawTimeAxis(L);
        drawGantt(L, slots);
        drawStats(L, slots);
        drawTooltipIfNeeded();
    }

    /* ===================== 알고리즘 라벨 ===================== */
    function drawAlgoLabel(L, algo) {
        const { mob } = L;
        tx(algo.desc, GW() / 2, mob ? 10 : 14, mob ? 11 : 12, P.muted, 'center', false);
    }

    /* ===================== 타임 축 ===================== */
    function drawTimeAxis(L) {
        const { chartX, chartW, unitW, timeAxisY, mob } = L;
        const fSm = mob ? 11 : 13;

        ctx.beginPath();
        ctx.moveTo(chartX, timeAxisY + 14);
        ctx.lineTo(chartX + chartW, timeAxisY + 14);
        ctx.strokeStyle = P.border; ctx.lineWidth = 1; ctx.stroke();

        for (let t = 0; t <= MAX_T; t++) {
            const x = chartX + t * unitW;
            ctx.beginPath();
            ctx.moveTo(x, timeAxisY + 10);
            ctx.lineTo(x, timeAxisY + 18);
            ctx.strokeStyle = P.border; ctx.lineWidth = 1; ctx.stroke();
            if (t === 0 || t % 2 === 0 || t === MAX_T) {
                tx(String(t), x, timeAxisY + 4, fSm, P.muted, 'center', false);
            }
        }
    }

    /* ===================== 간트 차트 ===================== */
    function drawGantt(L, slots) {
        const { pad, chartX, chartW, unitW, rowH, rowGap, ganttStartY, mob } = L;
        const fSm = mob ? 11 : 13;
        const fMd = mob ? 12 : 14;

        PROCS.forEach(function (p, i) {
            const rowY = ganttStartY + i * (rowH + rowGap);

            ctx.fillStyle = P.surf + 'aa';
            ctx.fillRect(chartX, rowY, chartW, rowH);
            ctx.strokeStyle = P.border;
            ctx.lineWidth = 0.5;
            ctx.strokeRect(chartX, rowY, chartW, rowH);

            const lx = chartX - (mob ? 4 : 6);
            const col = procCol(p.id);
            tx(p.id, lx, rowY + rowH / 2, fMd, col, 'right', true);

            if (p.arrival > 0) {
                const ax = chartX + p.arrival * unitW;
                ctx.beginPath();
                ctx.moveTo(ax, rowY + 2);
                ctx.lineTo(ax, rowY + rowH - 2);
                ctx.strokeStyle = col + '55';
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        });

        const drawUpTo = animActive ? stepIdx : stepIdx;

        slots.forEach(function (slot, si) {
            if (si > drawUpTo) return;

            const procIdx = PROCS.findIndex(function (p) { return p.id === slot.id; });
            if (procIdx === -1) return;

            const rowY  = ganttStartY + procIdx * (rowH + rowGap);
            const col   = procCol(slot.id);
            const slotW = (slot.end - slot.start) * unitW;
            const slotX = chartX + slot.start * unitW;

            const drawW = (si === drawUpTo && animActive)
                ? slotW * animProg
                : slotW;

            if (drawW < 1) return;

            rr(slotX, rowY + 2, drawW, rowH - 4, 4,
                col + '30', col, 2);

            if (drawW > 22) {
                ctx.save();
                ctx.rect(slotX, rowY, drawW, rowH);
                ctx.clip();
                tx(slot.id, slotX + drawW / 2, rowY + rowH / 2, fSm, col, 'center', true);
                ctx.restore();
            }

            if (si === 0 || slots[si - 1].id !== slot.id || si === drawUpTo) {
                tx(String(slot.start), slotX, ganttStartY - (mob ? 2 : 4) +
                    PROCS.length * (rowH + rowGap) + (mob ? 8 : 10),
                    mob ? 11 : 12, P.muted + 'bb', 'center', false);
            }

            if (si < drawUpTo || (si === drawUpTo && !animActive)) {
                tx(String(slot.end), slotX + slotW, ganttStartY - (mob ? 2 : 4) +
                    PROCS.length * (rowH + rowGap) + (mob ? 8 : 10),
                    mob ? 11 : 12, P.muted + 'bb', 'center', false);
            }

            if (si === drawUpTo && animActive) {
                ctx.beginPath();
                ctx.arc(slotX + drawW, rowY + rowH / 2, 5, 0, Math.PI * 2);
                ctx.fillStyle = col;
                ctx.globalAlpha = 0.5 + 0.5 * Math.sin(Date.now() / 200);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        });
    }

    /* ===================== 통계 테이블 ===================== */
    function drawStats(L, slots) {
        const { W, mob, pad, chartX, chartW, statsY } = L;

        /* 통계를 모두 표시할 충분한 단계인지 확인 */
        const totalSlots  = slots.length;
        const revealStats = stepIdx >= totalSlots - 1 && !animActive;
        if (stepIdx < 0) return;

        const stats = calcStats(PROCS, slots);
        const fSm   = mob ? 11 : 13;
        const fMd   = mob ? 12 : 13;
        const cols  = mob
            ? [0, 0.20, 0.42, 0.63, 0.82]
            : [0, 0.18, 0.36, 0.54, 0.72, 0.88];
        const headers = mob
            ? ['PID', 'Arr', 'Burst', 'Wait', 'TAT']
            : ['Process', 'Arrival', 'Burst', 'Finish', 'Waiting', 'Turnaround'];

        const tblX = chartX;
        const tblW = chartW;
        const rowH = mob ? 22 : 26;

        rr(tblX, statsY, tblW, rowH, 4, P.surf2, P.border, 1);
        headers.forEach(function (h, ci) {
            tx(h, tblX + tblW * cols[ci] + (mob ? 4 : 6), statsY + rowH / 2,
                fSm, P.muted, 'left', true);
        });

        stats.forEach(function (s, i) {
            const ry  = statsY + rowH * (i + 1) + 2;
            const col = procCol(s.id);

            const myDone = revealStats || slots.slice(0, stepIdx + 1)
                .filter(function (sl) { return sl.id === s.id; })
                .reduce(function (sm, sl) { return sm + (sl.end - sl.start); }, 0) >= s.burst;

            rr(tblX, ry, tblW, rowH, 2,
                myDone ? col + '12' : P.surf,
                myDone ? col + '44' : P.border, 1);

            if (!mob) {
                const vals = [s.id, s.arrival, s.burst,
                    myDone ? s.finish     : '-',
                    myDone ? s.waiting    : '-',
                    myDone ? s.turnaround : '-'];
                vals.forEach(function (v, ci) {
                    const vc = ci === 0 ? col : myDone ? P.text : P.muted;
                    tx(String(v), tblX + tblW * cols[ci] + 6, ry + rowH / 2,
                        fMd, vc, 'left', ci === 0);
                });
            } else {
                const vals = [s.id, s.arrival, s.burst,
                    myDone ? s.waiting    : '-',
                    myDone ? s.turnaround : '-'];
                vals.forEach(function (v, ci) {
                    const vc = ci === 0 ? col : myDone ? P.text : P.muted;
                    tx(String(v), tblX + tblW * cols[ci] + 4, ry + rowH / 2,
                        fMd - 1, vc, 'left', ci === 0);
                });
            }
        });

        if (revealStats) {
            const avgW = stats.reduce(function (s, r) { return s + r.waiting; }, 0) / stats.length;
            const avgT = stats.reduce(function (s, r) { return s + r.turnaround; }, 0) / stats.length;
            const sumY = statsY + rowH * (stats.length + 1) + 8;
            const col  = ALGOS[algoIdx].name === 'FCFS' ? P.orange
                       : ALGOS[algoIdx].name === 'SJF'  ? P.green
                       : P.purple;
            rr(tblX, sumY, tblW, rowH, 4, col + '18', col, 1.5);
            const avgTxt = '평균 대기: ' + avgW.toFixed(1) + 'ms    평균 반환: ' + avgT.toFixed(1) + 'ms';
            tx(avgTxt, tblX + tblW / 2, sumY + rowH / 2, fSm + 1, col, 'center', true);
        }
    }

    /* ===================== 툴팁 ===================== */
    function drawTooltipIfNeeded() {
        if (!hoveredKey) return;
        const p = PROCS.find(function (x) { return x.id === hoveredKey; });
        if (!p) return;
        const algo  = ALGOS[algoIdx];
        const stats = calcStats(PROCS, algo.slots);
        const st    = stats.find(function (x) { return x.id === hoveredKey; });
        const lines = [
            p.id + ' — 도착: ' + p.arrival + '   버스트: ' + p.burst,
            '반환 시간: ' + st.turnaround + '   대기 시간: ' + st.waiting,
        ];
        const col  = procCol(p.id);
        const pad  = 14, lineH = 20;
        const tw   = 260, th = lines.length * lineH + pad * 2;
        const W = GW(), H = GH();
        let tx_ = mousePos.x + 14, ty_ = mousePos.y - th - 8;
        if (tx_ + tw > W - 8) tx_ = mousePos.x - tw - 14;
        if (ty_ < 8)          ty_ = mousePos.y + 14;
        if (ty_ + th > H - 8) ty_ = H - th - 8;

        rr(tx_, ty_, tw, th, 6, P.surf2, col + 'cc', 2);
        lines.forEach(function (line, i) {
            ctx.font = (i === 0 ? '700' : '400') + ' 12px "JetBrains Mono",monospace';
            ctx.fillStyle = i === 0 ? P.text : P.sub;
            ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText(line, tx_ + pad, ty_ + pad + i * lineH + lineH / 2);
        });
    }

    /* ===================== 단계 로그 ===================== */
    function stepLog(si, slots) {
        if (si < 0)              return '▶ PLAY를 눌러 스케줄링 과정을 확인하세요. 상단 버튼으로 알고리즘을 바꿀 수 있습니다.';
        if (si >= slots.length)  return ALGOS[algoIdx].name + ' 완료 — 통계 테이블에서 각 프로세스의 대기·반환 시간을 확인하세요.';
        const s = slots[si];
        const p = PROCS.find(function (x) { return x.id === s.id; });
        const algo = ALGOS[algoIdx].name;

        if (algo === 'FCFS') {
            return 'T=' + s.start + ' — ' + s.id + ' 실행 시작 (버스트: ' + p.burst +
                   '). FCFS: 도착 순서대로 선점 없이 완료까지 실행합니다. → T=' + s.end + ' 완료.';
        }
        if (algo === 'SJF') {
            const avail = PROCS.filter(function (x) { return x.arrival <= s.start; });
            avail.sort(function (a, b) { return a.burst - b.burst; });
            return 'T=' + s.start + ' — 도착한 프로세스 중 버스트 최소인 ' + s.id +
                   ' 선택 (버스트: ' + p.burst + '). 비선점 실행 → T=' + s.end + ' 완료.';
        }
        const sliceLen = s.end - s.start;
        return 'T=' + s.start + ' — ' + s.id + ' 에 퀀텀 ' + sliceLen +
               ' 단위 할당' + (sliceLen < p.burst ? ' (선점 후 Ready Queue 재삽입)' : ' (완료)') +
               '. → T=' + s.end + '.';
    }

    /* ===================== 슬롯 애니메이션 ===================== */
    function animSlot(si, onDone) {
        animActive = true;
        animProg   = 0;
        const BASE_SPEED = 1800, baseStep = 0.007;
        const step = baseStep * (BASE_SPEED / speed);

        function tick() {
            animProg = Math.min(1, animProg + step);
            draw();
            if (animProg < 1) {
                rafId = requestAnimationFrame(tick);
            } else {
                animActive = false;
                draw();
                if (onDone) onDone();
            }
        }
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(tick);
    }

    /* ===================== 컨트롤 ===================== */
    function schedStart() {
        if (running) return;
        running = true; btnPlay.disabled = true; btnStep.disabled = true;
        setAlgoTabsDisabled(true);
        setSpeedDisabled(true);

        function tick() {
            const slots = ALGOS[algoIdx].slots;
            const next  = stepIdx + 1;
            if (next >= slots.length) {
                running = false;
                logEl.textContent = stepLog(slots.length, slots);
                btnStep.disabled  = true;
                setSpeedDisabled(false);
                draw();
                return;
            }
            stepIdx = next;
            logEl.textContent = stepLog(next, slots);
            animSlot(next, function () {
                timer = setTimeout(tick, speed * 0.3);
            });
        }
        tick();
    }

    function schedStep() {
        if (running || animActive) return;
        const slots = ALGOS[algoIdx].slots;
        const next  = stepIdx + 1;
        if (next >= slots.length) {
            logEl.textContent = stepLog(slots.length, slots);
            draw();
            btnPlay.disabled = true;
            btnStep.disabled = true;
            return;
        }
        stepIdx = next;
        logEl.textContent = stepLog(next, slots);
        animSlot(next, function () {
            if (stepIdx >= slots.length - 1) {
                logEl.textContent = stepLog(slots.length, slots);
                btnPlay.disabled = true;
                btnStep.disabled = true;
            }
            draw();
        });
    }

    function schedReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false; stepIdx = -1; animActive = false; animProg = 0;
        logEl.textContent = '▶ PLAY를 눌러 스케줄링 과정을 확인하세요. 상단 버튼으로 알고리즘을 바꿀 수 있습니다.';
        btnPlay.disabled = false; btnStep.disabled = false;
        setAlgoTabsDisabled(false);
        setSpeedDisabled(false);
        draw();
    }

    function setAlgo(idx, btn) {
        algoIdx = idx;
        root.querySelectorAll('.sched-viz__algo-btn').forEach(function (b) {
            b.classList.remove('sched-viz__algo-btn--active');
        });
        btn.classList.add('sched-viz__algo-btn--active');
        schedReset();
    }

    function setAlgoTabsDisabled(v) {
        root.querySelectorAll('.sched-viz__algo-btn').forEach(function (b) {
            b.disabled = v;
        });
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.sched-viz__speed-btn').forEach(function (b) {
            b.classList.remove('sched-viz__speed-btn--active');
        });
        btn.classList.add('sched-viz__speed-btn--active');
    }

    function setSpeedDisabled(v) {
        root.querySelectorAll('.sched-viz__speed-btn').forEach(function (b) { b.disabled = v; });
    }

    /* ===================== 라이프사이클 ===================== */
    window.CsFlow.createVizLifecycle({
        canvas    : canvas,
        canvasWrap: canvasWrap,
        resize    : resize,
        draw      : draw,
        getState  : function () { return { rafId: rafId, timer: timer, running: running }; },
        setState  : function (s) { rafId = s.rafId; timer = s.timer; running = s.running; },
        onPause   : function () { setSpeedDisabled(false); },
        getMouseCtx: function () {
            return {
                GW           : GW,
                GH           : GH,
                mousePos     : mousePos,
                tooltipHits  : tooltipHits,
                hoveredKey   : function ()  { return hoveredKey; },
                setHoveredKey: function (k) { hoveredKey = k; },
                draw         : draw,
            };
        },
    });

    setTimeout(resize, 60);
})();