/**
 * 스레드 동작 원리 시각화 — 실행 / 컨텍스트 스위치 / Race Condition / Mutex
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

    const root    = el('div', 'thr-viz');
    const toolbar = el('div', 'thr-viz__toolbar');
    const tbLeft  = el('div', 'thr-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'thr-viz__title', 'Thread Execution'));
    const badge = el('span', 'thr-viz__step-badge', 'IDLE');
    tbLeft.appendChild(badge);
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'thr-viz__speed');
    speedWrap.appendChild(el('span', 'thr-viz__speed-label', 'SPEED'));
    [['1x', 1800], ['2x', 900], ['3x', 600]].forEach(function (pair, i) {
        const lbl = pair[0], ms = pair[1];
        const b = el('button', 'thr-viz__speed-btn' + (i === 0 ? ' thr-viz__speed-btn--active' : ''), lbl);
        b.addEventListener('click', function () { if (!running) setSpeed(ms, b); });
        speedWrap.appendChild(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'thr-viz__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'thr-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const logEl = el('div', 'thr-viz__log', '▶ PLAY를 눌러 스레드 동작 원리를 확인하세요. (단일 코어 기준 시각화 — 멀티코어에서는 동시 메모리 접근으로 race가 더 빈번히 발생합니다)');
    root.appendChild(logEl);

    const controls = el('div', 'thr-viz__controls');
    const btnPlay  = el('button', 'thr-viz__btn thr-viz__btn--primary', '▶ PLAY');
    const btnStep  = el('button', 'thr-viz__btn', '▶| STEP');
    const btnReset = el('button', 'thr-viz__btn', '↺ RESET');
    btnPlay.addEventListener('click',  thrStart);
    btnStep.addEventListener('click',  thrStep);
    btnReset.addEventListener('click', thrReset);
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
        const w    = canvasWrap.offsetWidth;
        const mob  = w < 520;
        const minH = mob ? 540 : 460;
        const h    = Math.max(canvasWrap.offsetHeight, minH);
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    /* ===================== 팔레트 ===================== */
    let P = window.CsFlow.getP();

    /* ===================== 툴팁 ===================== */
    const TOOLTIPS = {
        T1:   'Thread 1\nOS 스케줄러가 관리하는 실행 단위. 독립된 Stack과 PC를 가지며 Code·Data·Heap은 같은 프로세스 내 스레드들과 공유합니다.',
        T2:   'Thread 2\n같은 프로세스 내 다른 스레드. T1과 공유 메모리(counter)에 동시 접근 시 Race Condition이 발생할 수 있습니다.',
        T3:   'Thread 3\nReady Queue에서 대기 중인 스레드. CPU가 할당되면 Running 상태로 전이합니다.',
        CPU:  'CPU Core\n한 번에 하나의 스레드만 실행합니다(단일 코어 기준). OS 스케줄러가 타임 퀀텀마다 실행할 스레드를 결정합니다.',
        MEM:  'Shared Memory — counter\n프로세스 내 모든 스레드가 공유하는 전역 변수입니다. 동시에 읽기·쓰기가 발생하면 Race Condition이 생기므로 Mutex로 보호해야 합니다.',
        LOCK: 'Mutex Lock\n한 번에 하나의 스레드만 임계 구역(Critical Section)에 진입하도록 보장합니다. Lock 보유 스레드만 공유 자원에 접근하고, 나머지는 Blocked 상태로 대기합니다.',
    };

    /* ===================== 시나리오 ===================== */
    const STEPS = [
        {
            badge:  'T1 → CPU 진입',
            log:    'Step 1 — 스케줄러가 Ready Queue에서 Thread 1을 선택합니다. 디스패처가 TCB에서 레지스터·PC를 복원하고 CPU를 넘깁니다. T1은 Running 상태로 전이, T2·T3은 Ready Queue에서 대기합니다.',
            pkts:   [{ from: 'T1', to: 'CPU', col: 'T1' }],
            states: { T1: 'RUNNING', T2: 'READY', T3: 'READY' },
            counter: 0, cpuLabel: 'T1', mutex: null,
        },
        {
            badge:  'T1: counter 읽기 (R1=0)',
            log:    'Step 2 — T1이 공유 변수 counter를 읽어 레지스터 R1에 저장합니다(R1=0). R1+1=1을 counter에 쓰려는 순간, 타이머 인터럽트가 발생할 수 있습니다.',
            pkts:   [{ from: 'CPU', to: 'MEM', col: 'T1' }],
            states: { T1: 'RUNNING', T2: 'READY', T3: 'READY' },
            counter: 0, cpuLabel: 'T1', mutex: null,
            memNote: 'T1: R1 = 0',
        },
        {
            badge:  '컨텍스트 스위치 T1 → T2',
            log:    'Step 3 — 타임 퀀텀 만료! OS가 T1의 레지스터 상태(R1=0 포함)를 TCB에 저장하고 T2를 선택합니다. T1은 R1=0을 든 채 Ready 상태로 돌아가고, T2가 CPU를 넘겨받습니다.',
            pkts:   [{ from: 'CPU', to: 'T1', col: 'T1' }, { from: 'T2', to: 'CPU', col: 'T2' }],
            states: { T1: 'READY', T2: 'RUNNING', T3: 'READY' },
            counter: 0, cpuLabel: 'T2', mutex: null,
            ctxSwitch: true,
        },
        {
            badge:  'T2: counter 읽기 (R1=0)',
            log:    'Step 4 — T2도 counter를 읽습니다. T1이 아직 쓰기를 하지 않아 counter는 여전히 0입니다. T2의 R1에도 0이 들어갑니다. 두 스레드 모두 R1=0을 들고 있습니다. Race Condition 발생 직전입니다.',
            pkts:   [{ from: 'CPU', to: 'MEM', col: 'T2' }],
            states: { T1: 'READY', T2: 'RUNNING', T3: 'READY' },
            counter: 0, cpuLabel: 'T2', mutex: null,
            memNote: 'T2: R1 = 0', race: true,
        },
        {
            badge:  'Race Condition! 결과=1 (예상=2)',
            log:    'Step 5 — T2가 R1+1=1을 counter에 씁니다. 이후 T1이 재개되어 저장해 둔 R1=0에 +1=1을 다시 씁니다. 두 스레드가 각각 +1을 했지만 최종값은 1입니다. 예상값 2와 다릅니다! 갱신 분실(Lost Update)이 발생했습니다. (멀티코어에서는 두 코어가 동시에 counter를 읽을 수 있어 같은 결과가 더 자주 나타납니다)',
            pkts:   [],
            states: { T1: 'RUNNING', T2: 'READY', T3: 'READY' },
            counter: 1, cpuLabel: 'T1', mutex: null,
            raceResult: true,
        },
        {
            badge:  'Mutex 적용 → counter=2',
            log:    'Step 6 — Mutex로 임계 구역을 보호합니다. T1이 Lock을 획득하는 동안 T2는 Blocked 상태로 대기합니다. T1이 0→1로 안전하게 업데이트하고 Unlock하면, T2가 Lock을 획득해 1→2로 업데이트합니다. 최종값 2 정확합니다.',
            pkts:   [{ from: 'T1', to: 'CPU', col: 'T1' }, { from: 'CPU', to: 'MEM', col: 'T1' }],
            states: { T1: 'RUNNING', T2: 'BLOCKED', T3: 'READY' },
            counter: 2, cpuLabel: 'T1', mutex: 'LOCKED',
            mutexOk: true,
        },
    ];

    /* ===================== 상태 변수 ===================== */
    let stepIdx       = -1;
    let running       = false;
    let timer         = null;
    let speed         = 1800;
    let rafId         = null;

    let threadStates   = { T1: 'READY', T2: 'READY', T3: 'READY' };
    let counterVal     = 0;
    let cpuLblCur      = '';
    let mutexCur       = null;
    let memNoteCur     = null;
    let showRace       = false;
    let showRaceResult = false;
    let showMutexOk    = false;
    let showCtxSwitch  = false;

    let activeFrom = null;
    let activeTo   = null;
    let pktQueue   = [];
    let pktCurrent = null;
    let pktProg    = 0;
    let pktDone    = null;

    let tooltipHits = [];
    let mousePos    = { x: -1, y: -1 };
    let hoveredKey  = null;

    /* ===================== 레이아웃 ===================== */
    function buildLayout() {
        const W = GW(), H = GH();
        const mob = W < 520;

        if (mob) {
            const tW   = Math.round((W - 36) / 3);
            const tH   = 66;
            const cpuW = Math.min(W - 16, 3 * tW + 20);
            const cpuH = 74;
            const memW = Math.min(W - 12, 3 * tW + 20);
            const memH = 130;
            const lkW  = Math.min(W - 24, 3 * tW + 10);
            const lkH  = 70;

            const usedH   = tH + cpuH + memH + (mutexCur ? lkH : 0);
            const nGaps   = mutexCur ? 5 : 4;
            const gapSize = Math.max(18, Math.round((H - usedH) / nGaps));

            const t1Y   = gapSize;
            const cpuY  = t1Y + tH + gapSize;
            const memY  = cpuY + cpuH + gapSize;
            const lockY = memY + memH + gapSize;

            const t1X  = 8;
            const t2X  = t1X + tW + 10;
            const t3X  = t1X + (tW + 10) * 2;
            const cpuX = Math.round((W - cpuW) / 2);
            const memX = Math.round((W - memW) / 2);
            const lkX  = Math.round((W - lkW) / 2);

            return {
                W, H, mob: true, direction: 'vertical',
                fMd: 13, fSm: 11, sc: 1,
                nodes: {
                    T1:   { x: t1X,  y: t1Y,  w: tW,   h: tH,   col: P.teal,   lbl: 'Thread 1' },
                    T2:   { x: t2X,  y: t1Y,  w: tW,   h: tH,   col: P.purple, lbl: 'Thread 2' },
                    T3:   { x: t3X,  y: t1Y,  w: tW,   h: tH,   col: P.green,  lbl: 'Thread 3' },
                    CPU:  { x: cpuX, y: cpuY, w: cpuW, h: cpuH, col: P.yellow, lbl: 'CPU Core' },
                    MEM:  { x: memX, y: memY, w: memW, h: memH, col: P.orange, lbl: 'Shared Memory' },
                    LOCK: { x: lkX,  y: lockY, w: lkW,  h: lkH,  col: P.red,    lbl: 'Mutex Lock' },
                },
            };
        }

        const sc   = Math.min(1.45, Math.max(0.88, W / 900));
        const tW   = Math.round(158 * sc);
        const tH   = Math.round(84  * sc);
        const thG  = Math.round(24  * sc);
        const cpuW = Math.round(170 * sc);
        const memW = Math.round(206 * sc);
        const memH = Math.round(158 * sc);
        const lkW  = Math.round(186 * sc);
        const lkH  = Math.round(80  * sc);

        const threadsTH  = tH * 3 + thG * 2;
        const cpuH       = threadsTH - Math.round(18 * sc);
        const totalNodeW = tW + cpuW + memW;
        const hGap  = Math.max(46, Math.min(98, (W - totalNodeW - 40) / 2));
        const tX    = Math.max(16, Math.round((W - totalNodeW - hGap * 2) / 2));
        const cpuX  = tX + tW + hGap;
        const memX  = cpuX + cpuW + hGap;

        const t1Y   = Math.max(20, Math.round((H - threadsTH) / 2));
        const t2Y   = t1Y + tH + thG;
        const t3Y   = t2Y + tH + thG;
        const cpuY  = Math.round(t1Y + (threadsTH - cpuH) / 2);
        const memY  = Math.round(cpuY + (cpuH - memH) / 2);
        const lockY = memY + memH + Math.round(20 * sc);
        const lkX   = memX + Math.round((memW - lkW) / 2);

        return {
            W, H, mob: false, direction: 'horizontal',
            fMd: 15, fSm: 12, sc,
            nodes: {
                T1:   { x: tX,   y: t1Y,  w: tW,   h: tH,   col: P.teal,   lbl: 'Thread 1' },
                T2:   { x: tX,   y: t2Y,  w: tW,   h: tH,   col: P.purple, lbl: 'Thread 2' },
                T3:   { x: tX,   y: t3Y,  w: tW,   h: tH,   col: P.green,  lbl: 'Thread 3' },
                CPU:  { x: cpuX, y: cpuY, w: cpuW, h: cpuH, col: P.yellow, lbl: 'CPU Core' },
                MEM:  { x: memX, y: memY, w: memW, h: memH, col: P.orange, lbl: 'Shared Memory' },
                LOCK: { x: lkX,  y: lockY, w: lkW,  h: lkH,  col: P.red,    lbl: 'Mutex Lock' },
            },
        };
    }

    function nc(n) { return { x: n.x + n.w / 2, y: n.y + n.h / 2 }; }

    /* ===================== 드로우 헬퍼 ===================== */
    function rr(x, y, w, h, r, fill, stroke, lw) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        if (fill)   { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
    }

    function tx(str, x, y, sz, color, align, bold) {
        ctx.font = (bold ? '700' : '400') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    function arrowHead(x2, y2, ux, uy, col) {
        const p = 6;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - ux * p * 2 - uy * p, y2 - uy * p * 2 + ux * p);
        ctx.lineTo(x2 - ux * p * 2 + uy * p, y2 - uy * p * 2 - ux * p);
        ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
    }

    function drawSingleEdge(x1, y1, x2, y2, col, active) {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.strokeStyle = col; ctx.lineWidth = active ? 2 : 1;
        ctx.setLineDash(active ? [] : [5, 5]); ctx.stroke(); ctx.setLineDash([]);
        if (active) {
            const dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx*dx + dy*dy);
            if (len > 2) arrowHead(x2, y2, dx / len, dy / len, col);
        }
    }

    /* ===================== 엣지 ===================== */
    function drawEdges(L) {
        const { nodes, direction } = L;
        const tKeys = ['T1', 'T2', 'T3'];

        tKeys.forEach(function (k) {
            const tn = nodes[k], cn = nodes.CPU;
            if (!tn || !cn) return;
            const active = !!pktCurrent && (
                (pktCurrent.from === k && pktCurrent.to === 'CPU') ||
                (pktCurrent.from === 'CPU' && pktCurrent.to === k)
            );
            const col = active ? tn.col : P.border;

            var x1, y1, x2, y2;
            if (direction === 'vertical') {
                x1 = tn.x + tn.w / 2;
                y1 = tn.y + tn.h;
                const frac = (k === 'T1') ? 0.22 : (k === 'T3') ? 0.78 : 0.50;
                x2 = cn.x + cn.w * frac;
                y2 = cn.y;
            } else {
                x1 = tn.x + tn.w;
                y1 = tn.y + tn.h / 2;
                x2 = cn.x;
                y2 = cn.y + cn.h / 2;
            }
            drawSingleEdge(x1, y1, x2, y2, col, active);
        });

        if (nodes.CPU && nodes.MEM) {
            const cn = nodes.CPU, mn = nodes.MEM;
            const active = !!pktCurrent && (
                (pktCurrent.from === 'CPU' && pktCurrent.to === 'MEM') ||
                (pktCurrent.from === 'MEM' && pktCurrent.to === 'CPU')
            );
            const pCol = (active && pktCurrent) ? pktColor(pktCurrent.col) : P.border;
            var x1, y1, x2, y2;
            if (direction === 'vertical') {
                x1 = cn.x + cn.w / 2; y1 = cn.y + cn.h;
                x2 = mn.x + mn.w / 2; y2 = mn.y;
            } else {
                x1 = cn.x + cn.w; y1 = cn.y + cn.h / 2;
                x2 = mn.x; y2 = mn.y + mn.h / 2;
            }
            drawSingleEdge(x1, y1, x2, y2, pCol, active);
        }

        if (nodes.MEM && nodes.LOCK && mutexCur) {
            const mn = nodes.MEM, ln = nodes.LOCK;
            ctx.beginPath();
            ctx.moveTo(mn.x + mn.w / 2, mn.y + mn.h);
            ctx.lineTo(ln.x + ln.w / 2, ln.y);
            ctx.strokeStyle = P.red + '55'; ctx.lineWidth = 1;
            ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]);
        }
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        ctx.fillStyle = P.bg;
        ctx.fillRect(0, 0, GW(), GH());
        tooltipHits = [];

        const L = buildLayout();
        drawEdges(L);

        ['T1', 'T2', 'T3'].forEach(function (k) {
            if (L.nodes[k]) drawThreadNode(L.nodes[k], k, L);
        });
        if (L.nodes.CPU)              drawCpuNode(L.nodes.CPU, L);
        if (L.nodes.MEM)              drawMemNode(L.nodes.MEM, L);
        if (L.nodes.LOCK && mutexCur) drawLockNode(L.nodes.LOCK, L);

        drawPacket(L);
        if (hoveredKey && TOOLTIPS[hoveredKey]) drawTooltip(mousePos.x, mousePos.y, hoveredKey);
    }

    /* ===================== 스레드 노드 ===================== */
    function drawThreadNode(n, key, L) {
        const { fMd } = L;
        const state = threadStates[key] || 'READY';
        const col   = n.col;
        const isAct = (activeFrom === key || activeTo === key);
        const isHov = hoveredKey === key;
        const stCol = stateColor(state);

        rr(n.x, n.y, n.w, n.h, 8,
            isAct ? col + '25' : state === 'BLOCKED' ? P.red + '12' : P.surf,
            isAct ? col : state === 'BLOCKED' ? P.red + 'bb' : isHov ? P.purple : P.border,
            isAct ? 2.5 : isHov ? 2 : 1.5);

        const cx   = n.x + n.w / 2;
        const lblY = n.y + n.h * 0.36;
        const pilY = n.y + n.h * 0.68;

        tx(n.lbl, cx, lblY, fMd,
            isAct ? col : state === 'BLOCKED' ? P.red : P.text, 'center', true);

        const pW = Math.round(n.w * 0.60), pH = 18;
        rr(cx - pW / 2, pilY - pH / 2, pW, pH, 5, stCol + '22', stCol, 1.5);
        tx(state, cx, pilY, Math.max(8, fMd - 5), stCol, 'center', true);

        if (showCtxSwitch && key === 'T1' && activeTo === 'T1') {
            tx('TCB 저장', cx, n.y - 13, fMd - 4, P.teal + 'cc', 'center', false);
        }
        if (showCtxSwitch && key === 'T2' && activeFrom === 'T2') {
            tx('TCB 복원', cx, n.y - 13, fMd - 4, P.purple + 'cc', 'center', false);
        }

        const qx = n.x + n.w - 11, qy = n.y + 11;
        ctx.beginPath(); ctx.arc(qx, qy, 7, 0, Math.PI * 2);
        ctx.fillStyle   = isHov ? col : P.surf2; ctx.fill();
        ctx.strokeStyle = isHov ? col : P.muted; ctx.lineWidth = 1; ctx.stroke();
        tx('?', qx, qy, 8, isHov ? '#fff' : P.muted, 'center', true);
        tooltipHits.push({ x: qx - 7, y: qy - 7, w: 14, h: 14, key: key });
    }

    /* ===================== CPU 노드 ===================== */
    function drawCpuNode(n, L) {
        const { fMd, fSm } = L;
        const isAct = (activeFrom === 'CPU' || activeTo === 'CPU');
        const isHov = hoveredKey === 'CPU';

        rr(n.x, n.y, n.w, n.h, 8,
            isAct ? P.yellow + '18' : P.surf,
            isAct ? P.yellow : isHov ? P.purple : P.border,
            isAct ? 2.5 : isHov ? 2 : 1.5);

        const cx   = n.x + n.w / 2;
        const cy   = n.y + n.h / 2;
        const sepY = n.y + Math.round(n.h * 0.30);

        tx(n.lbl, cx, n.y + Math.round(n.h * 0.18), fMd - 1,
            isAct ? P.yellow : P.sub, 'center', true);

        ctx.beginPath();
        ctx.moveTo(n.x + 14, sepY); ctx.lineTo(n.x + n.w - 14, sepY);
        ctx.strokeStyle = isAct ? P.yellow + '66' : P.border; ctx.lineWidth = 1; ctx.stroke();

        if (cpuLblCur) {
            const runCol = cpuLblCur === 'T1' ? P.teal : cpuLblCur === 'T2' ? P.purple : P.green;
            tx('실행 중', cx, cy - Math.round(n.h * 0.10), fSm, P.muted, 'center', false);
            tx(cpuLblCur, cx, cy + Math.round(n.h * 0.15), fMd + 6, runCol, 'center', true);
        } else {
            tx('IDLE', cx, cy + 4, fSm + 1, P.muted, 'center', false);
        }

        const qx = n.x + n.w - 11, qy = n.y + 11;
        ctx.beginPath(); ctx.arc(qx, qy, 7, 0, Math.PI * 2);
        ctx.fillStyle   = isHov ? P.yellow : P.surf2; ctx.fill();
        ctx.strokeStyle = isHov ? P.yellow : P.muted; ctx.lineWidth = 1; ctx.stroke();
        tx('?', qx, qy, 8, isHov ? '#fff' : P.muted, 'center', true);
        tooltipHits.push({ x: qx - 7, y: qy - 7, w: 14, h: 14, key: 'CPU' });
    }

    /* ===================== 메모리 노드 ===================== */
    function drawMemNode(n, L) {
        const { fMd, fSm } = L;
        const isAct = (activeFrom === 'MEM' || activeTo === 'MEM');
        const isHov = hoveredKey === 'MEM';

        const borderCol = showRaceResult ? P.red
                        : showMutexOk    ? P.green
                        : showRace       ? P.red
                        : isAct          ? P.orange
                        : isHov          ? P.purple
                        : P.border;
        const borderW = (showRace || showRaceResult || showMutexOk || isAct) ? 2.5
                      : isHov ? 2 : 1.5;

        rr(n.x, n.y, n.w, n.h, 8,
            (isAct || showRaceResult || showMutexOk || showRace) ? borderCol + '18' : P.surf,
            borderCol, borderW);

        const cx      = n.x + n.w / 2;
        const titleY  = n.y + Math.round(n.h * 0.12);
        const sepY    = n.y + Math.round(n.h * 0.24);
        const labelY  = n.y + Math.round(n.h * 0.40);
        const valueY  = n.y + Math.round(n.h * 0.62);
        const noteY   = n.y + Math.round(n.h * 0.84);

        const titleCol = showRaceResult ? P.red : showMutexOk ? P.green
                       : isAct ? P.orange : P.sub;
        tx(n.lbl, cx, titleY, fSm + 1, titleCol, 'center', true);

        ctx.beginPath();
        ctx.moveTo(n.x + 14, sepY); ctx.lineTo(n.x + n.w - 14, sepY);
        ctx.strokeStyle = P.border; ctx.lineWidth = 1; ctx.stroke();

        tx('counter =', cx, labelY, fSm, P.muted, 'center', false);

        const vCol = showRaceResult ? P.red : showMutexOk ? P.green
                   : isAct ? P.orange : P.text;
        const valSz = Math.round(n.h * 0.24);
        tx(String(counterVal), cx, valueY, valSz, vCol, 'center', true);

        if (memNoteCur && !showRaceResult && !showMutexOk && !showRace) {
            const nCol = memNoteCur.indexOf('T1') !== -1 ? P.teal : P.purple;
            tx(memNoteCur, cx, noteY, fSm, nCol, 'center', true);
        }
        if (showRace && !showRaceResult) {
            tx('T1+T2: R1=0 동시', cx, noteY, fSm, P.red, 'center', true);
        }
        if (showRaceResult) {
            tx('예상: 2  /  실제: ' + counterVal, cx, noteY, fSm, P.red, 'center', true);
        }
        if (showMutexOk) {
            tx('순차 갱신 완료', cx, noteY, fSm, P.green, 'center', true);
        }

        const qx = n.x + n.w - 11, qy = n.y + 11;
        ctx.beginPath(); ctx.arc(qx, qy, 7, 0, Math.PI * 2);
        ctx.fillStyle   = isHov ? P.orange : P.surf2; ctx.fill();
        ctx.strokeStyle = isHov ? P.orange : P.muted; ctx.lineWidth = 1; ctx.stroke();
        tx('?', qx, qy, 8, isHov ? '#fff' : P.muted, 'center', true);
        tooltipHits.push({ x: qx - 7, y: qy - 7, w: 14, h: 14, key: 'MEM' });
    }

    /* ===================== Mutex 노드 ===================== */
    function drawLockNode(n, L) {
        const { fMd, fSm } = L;
        const locked = (mutexCur === 'LOCKED');
        const col    = locked ? P.red : P.green;
        const isAct  = (activeFrom === 'LOCK' || activeTo === 'LOCK');
        const isHov  = hoveredKey === 'LOCK';

        rr(n.x, n.y, n.w, n.h, 6, isAct ? col + '22' : P.surf, col, isAct ? 2.5 : 2);

        const cx  = n.x + n.w / 2;
        const l1Y = n.y + Math.round(n.h * 0.32);
        const sepY = n.y + Math.round(n.h * 0.54);
        const l2Y = n.y + Math.round(n.h * 0.76);

        tx(locked ? 'LOCKED' : 'UNLOCKED', cx, l1Y, fMd, col, 'center', true);

        ctx.beginPath();
        ctx.moveTo(n.x + 14, sepY); ctx.lineTo(n.x + n.w - 14, sepY);
        ctx.strokeStyle = col + '55'; ctx.lineWidth = 1; ctx.stroke();

        tx(locked ? 'T2 : Blocked' : 'T2 : 진입 가능', cx, l2Y, fSm, P.sub, 'center', false);

        const qx = n.x + n.w - 11, qy = n.y + 11;
        ctx.beginPath(); ctx.arc(qx, qy, 7, 0, Math.PI * 2);
        ctx.fillStyle   = isHov ? col : P.surf2; ctx.fill();
        ctx.strokeStyle = isHov ? col : P.muted; ctx.lineWidth = 1; ctx.stroke();
        tx('?', qx, qy, 8, isHov ? '#fff' : P.muted, 'center', true);
        tooltipHits.push({ x: qx - 7, y: qy - 7, w: 14, h: 14, key: 'LOCK' });
    }

    /* ===================== 상태 색상 ===================== */
    function stateColor(s) {
        return s === 'RUNNING' ? P.green
             : s === 'READY'   ? P.purple
             : s === 'BLOCKED' ? P.red
             : P.muted;
    }

    /* ===================== 패킷 ===================== */
    function pktColor(c) {
        return c === 'T1' ? P.teal : c === 'T2' ? P.purple : c === 'T3' ? P.green : P.orange;
    }

    function drawPacket(L) {
        if (!pktCurrent) return;
        const { nodes } = L;
        const fn = nodes[pktCurrent.from], tn = nodes[pktCurrent.to];
        if (!fn || !tn) return;
        const fc = nc(fn), tc = nc(tn);
        const x   = fc.x + (tc.x - fc.x) * pktProg;
        const y   = fc.y + (tc.y - fc.y) * pktProg;
        const col = pktColor(pktCurrent.col);
        ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill();
        tx('→', x, y, 9, '#0f0f1a', 'center', true);
    }

    function pktNext() {
        if (!pktQueue.length) {
            pktCurrent = null; activeFrom = null; activeTo = null;
            draw();
            if (pktDone) { var cb = pktDone; pktDone = null; cb(); }
            return;
        }
        pktCurrent = pktQueue.shift();
        pktProg    = 0;
        activeFrom = pktCurrent.from;
        activeTo   = pktCurrent.to;
        if (rafId) cancelAnimationFrame(rafId);
        const BASE_SPEED = 1800, baseStep = 0.007;
        const step = baseStep * (BASE_SPEED / speed);
        (function tick() {
            pktProg = Math.min(1, pktProg + step);
            draw();
            if (pktProg < 1) { rafId = requestAnimationFrame(tick); }
            else             { pktNext(); }
        })();
    }

    function animPkts(cb) { pktDone = cb || null; pktNext(); }

    /* ===================== 툴팁 ===================== */
    function wrapText(text, maxW, font) {
        ctx.font = font;
        const words = text.split(' ');
        const lines = [];
        let cur = '';
        words.forEach(function (w) {
            const test = cur ? cur + ' ' + w : w;
            if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
            else { cur = test; }
        });
        if (cur) lines.push(cur);
        return lines;
    }

    function drawTooltip(mx, my, key) {
        const parts = TOOLTIPS[key].split('\n');
        const title = parts[0], desc = parts[1] || '';
        const W = GW(), H = GH();
        const pad    = 14;
        const maxTW  = Math.min(W - 24, W < 520 ? W * 0.85 : 300);
        const innerW = maxTW - pad * 2;
        const tFont  = '700 13px "JetBrains Mono",monospace';
        const dFont  = '400 12px "JetBrains Mono",monospace';
        ctx.font = tFont;
        const tW2       = ctx.measureText(title).width;
        const descLines = desc ? wrapText(desc, innerW, dFont) : [];
        const lineH = 17, titleH = 24;
        const th = desc ? titleH + descLines.length * lineH + 10 : 36;
        const tw = Math.min(Math.max(tW2, innerW) + pad * 2, maxTW);
        let tx_ = mx + 14, ty_ = my - th - 8;
        if (tx_ + tw > W - 8) tx_ = mx - tw - 14;
        if (tx_ < 8)          tx_ = 8;
        if (ty_ < 8)          ty_ = my + 14;
        if (ty_ + th > H - 8) ty_ = H - th - 8;
        rr(tx_, ty_, tw, th, 6, P.surf2, P.purple + 'cc', 2);
        ctx.font = tFont; ctx.fillStyle = P.text;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(title, tx_ + pad, ty_ + (desc ? 14 : th / 2));
        if (descLines.length) {
            ctx.font = dFont; ctx.fillStyle = P.sub;
            descLines.forEach(function (line, i) {
                ctx.fillText(line, tx_ + pad, ty_ + titleH + i * lineH + 4);
            });
        }
    }

    /* ===================== 단계 적용 ===================== */
    function setLog(s)   { logEl.textContent = s; }
    function setBadge(s) {
        badge.textContent = s;
        badge.className = 'thr-viz__step-badge' + (s !== 'IDLE' ? ' thr-viz__step-badge--active' : '');
    }
    function setSpeedDisabled(v) {
        root.querySelectorAll('.thr-viz__speed-btn').forEach(function (b) { b.disabled = v; });
    }

    function applyStep(idx, onDone) {
        stepIdx = idx;
        const step = STEPS[idx];

        setBadge(step.badge);
        setLog(step.log);

        threadStates   = Object.assign({}, step.states);
        counterVal     = step.counter;
        cpuLblCur      = step.cpuLabel || '';
        mutexCur       = step.mutex    || null;
        memNoteCur     = step.memNote  || null;
        showRace       = !!step.race;
        showRaceResult = !!step.raceResult;
        showMutexOk    = !!step.mutexOk;
        showCtxSwitch  = !!step.ctxSwitch;

        pktQueue = (step.pkts || []).map(function (p) {
            return { from: p.from, to: p.to, col: p.col };
        });

        animPkts(function () {
            draw();
            if (onDone) setTimeout(onDone, 0);
        });
    }

    /* ===================== 컨트롤 ===================== */
    function thrStart() {
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

    function thrStep() {
        if (running) return;
        var next = stepIdx + 1;
        if (next >= STEPS.length) return;
        applyStep(next, null);
        if (next === STEPS.length - 1) { btnPlay.disabled = true; btnStep.disabled = true; }
    }

    function thrReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false; stepIdx = -1;
        threadStates   = { T1: 'READY', T2: 'READY', T3: 'READY' };
        counterVal = 0; cpuLblCur = ''; mutexCur = null;
        memNoteCur = null; showRace = false; showRaceResult = false;
        showMutexOk = false; showCtxSwitch = false;
        activeFrom = null; activeTo = null;
        pktQueue = []; pktCurrent = null; pktProg = 0; pktDone = null;
        setLog('▶ PLAY를 눌러 스레드 동작 원리를 확인하세요. (단일 코어 기준 시각화 — 멀티코어에서는 동시 메모리 접근으로 race가 더 빈번히 발생합니다)');
        setBadge('IDLE');
        btnPlay.disabled = false; btnStep.disabled = false;
        setSpeedDisabled(false);
        draw();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.thr-viz__speed-btn').forEach(function (b) {
            b.classList.remove('thr-viz__speed-btn--active');
        });
        btn.classList.add('thr-viz__speed-btn--active');
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