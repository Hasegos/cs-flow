/**
 * 프로세스 동기화 시각화
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

    const root    = el('div', 'sync-viz');
    const toolbar = el('div', 'sync-viz__toolbar');
    const tbLeft  = el('div', 'sync-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'sync-viz__title', 'Process Sync'));

    const modeTabs = el('div', 'sync-viz__mode-tabs');
    const modeHint = el('span', 'sync-viz__mode-hint', '모드 선택 →');
    ['Race', 'Mutex', 'Semaphore'].forEach(function (lbl, i) {
        const b = el('button', 'sync-viz__mode-btn' + (i === 0 ? ' sync-viz__mode-btn--active' : ''), lbl);
        b.addEventListener('click', function () { if (!running) setMode(i, b); });
        modeTabs.appendChild(b);
    });
    tbLeft.appendChild(modeHint);
    tbLeft.appendChild(modeTabs);
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'sync-viz__speed');
    speedWrap.appendChild(el('span', 'sync-viz__speed-label', 'SPEED'));
    [['1x', 1800], ['2x', 900], ['3x', 600]].forEach(function (pair, i) {
        const b = el('button', 'sync-viz__speed-btn' + (i === 0 ? ' sync-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'sync-viz__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'sync-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const logEl = el('div', 'sync-viz__log', '▶ PLAY를 눌러 동기화 원리를 확인하세요. 상단 버튼으로 모드를 바꿀 수 있습니다.');
    root.appendChild(logEl);

    const controls = el('div', 'sync-viz__controls');
    const btnPlay  = el('button', 'sync-viz__btn sync-viz__btn--primary', '▶ PLAY');
    const btnStep  = el('button', 'sync-viz__btn', '▶| STEP');
    const btnReset = el('button', 'sync-viz__btn', '↺ RESET');
    btnPlay.addEventListener('click',  syncStart);
    btnStep.addEventListener('click',  syncStep);
    btnReset.addEventListener('click', syncReset);
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

    function calcMobH() {
        const tH     = 66;
        const midH   = 80;
        const botH   = 100;
        const topPad = 22;
        const vGap1  = 42;
        const vGap2  = 38;
        const botPad = 28;
        if (modeIdx === 0) {
            return topPad + tH + vGap1 + (midH + vGap2 + botH) + botPad;
        }
        return topPad + tH + vGap1 + midH + vGap2 + botH + botPad;
    }

    function resize() {
        const w   = canvasWrap.offsetWidth;
        const mob = w < 520;
        const minH = mob ? calcMobH() : 460;
        const h    = mob ? minH : Math.max(canvasWrap.offsetHeight, minH);
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        if (mob) canvasWrap.style.minHeight = minH + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    /* ===================== 팔레트 ===================== */
    let P = window.CsFlow.getP();

    /* ===================== 시나리오 ===================== */
    const RACE_STEPS = [
        {
            badge: 'counter = 0 (초기)',
            log:   'Step 1 — 두 스레드가 공유 변수 counter=0을 보고 있습니다. 아직 아무도 접근하지 않았습니다.',
            t1: 'READY', t2: 'READY', counter: 0,
            t1reg: null, t2reg: null, phase: 'init',
        },
        {
            badge: 'T1: counter 읽기 (R=0)',
            log:   'Step 2 — T1이 counter를 읽어 레지스터 R에 저장합니다(R=0). 이 시점에 T1은 R=0을 들고 있습니다.',
            t1: 'RUNNING', t2: 'READY', counter: 0,
            t1reg: 0, t2reg: null, phase: 't1-read',
            pkt: { from: 'MEM', to: 'T1' },
        },
        {
            badge: '컨텍스트 스위치 → T2',
            log:   'Step 3 — 타임 퀀텀 만료! T1의 레지스터(R=0)를 TCB에 저장하고 T2로 전환합니다.',
            t1: 'READY', t2: 'RUNNING', counter: 0,
            t1reg: 0, t2reg: null, phase: 'ctx-switch',
        },
        {
            badge: 'T2: counter 읽기 (R=0) ⚠',
            log:   'Step 4 — T2도 counter를 읽습니다. T1이 아직 쓰지 않았으므로 counter=0, T2도 R=0을 가집니다. 두 스레드 모두 R=0을 들고 있습니다!',
            t1: 'READY', t2: 'RUNNING', counter: 0,
            t1reg: 0, t2reg: 0, phase: 't2-read',
            pkt: { from: 'MEM', to: 'T2' },
        },
        {
            badge: 'T2: counter ← R+1=1 쓰기',
            log:   'Step 5 — T2가 R+1=1을 counter에 씁니다. counter=1이 됩니다.',
            t1: 'READY', t2: 'RUNNING', counter: 1,
            t1reg: 0, t2reg: 0, phase: 't2-write',
            pkt: { from: 'T2', to: 'MEM' },
        },
        {
            badge: 'T1 재개: counter ← 1 ⚠ 갱신 분실!',
            log:   'Step 6 — T1이 재개됩니다. 저장해 둔 R=0으로 +1=1을 counter에 씁니다. T2의 쓰기가 덮어써졌습니다! 갱신 분실(Lost Update)!',
            t1: 'RUNNING', t2: 'READY', counter: 1,
            t1reg: 0, t2reg: 0, phase: 'lost-update',
            pkt: { from: 'T1', to: 'MEM' },
            raceResult: true,
        },
    ];

    const MUTEX_STEPS = [
        {
            badge: 'Mutex 초기화 (UNLOCKED)',
            log:   'Step 1 — Mutex가 UNLOCKED 상태입니다. counter=0, 두 스레드 모두 Ready 상태입니다.',
            t1: 'READY', t2: 'READY', counter: 0,
            mutex: 'UNLOCKED', owner: null, phase: 'init',
        },
        {
            badge: 'T1: Lock 획득',
            log:   'Step 2 — T1이 mutex.lock()을 호출합니다. Mutex가 UNLOCKED이므로 즉시 획득하고 LOCKED로 전환합니다. T1이 임계 구역에 진입합니다.',
            t1: 'RUNNING', t2: 'READY', counter: 0,
            mutex: 'LOCKED', owner: 'T1', phase: 't1-lock',
            pkt: { from: 'T1', to: 'LOCK' },
        },
        {
            badge: 'T2: Lock 시도 → Blocked',
            log:   'Step 3 — T2도 mutex.lock()을 시도합니다. Mutex가 이미 LOCKED(T1 보유)이므로 T2는 Blocked 상태로 전환되어 대기합니다.',
            t1: 'RUNNING', t2: 'BLOCKED', counter: 0,
            mutex: 'LOCKED', owner: 'T1', phase: 't2-blocked',
            pkt: { from: 'T2', to: 'LOCK' },
        },
        {
            badge: 'T1: 임계 구역 → counter=1',
            log:   'Step 4 — T1이 임계 구역에서 counter++를 안전하게 실행합니다. 읽기→증가→쓰기가 원자적으로 완료됩니다. counter=1.',
            t1: 'RUNNING', t2: 'BLOCKED', counter: 1,
            mutex: 'LOCKED', owner: 'T1', phase: 't1-cs',
            pkt: { from: 'T1', to: 'MEM' },
        },
        {
            badge: 'T1: Unlock → T2 깨어남',
            log:   'Step 5 — T1이 mutex.unlock()을 호출합니다. Mutex가 UNLOCKED로 전환되고 대기 중인 T2가 Lock을 획득합니다.',
            t1: 'READY', t2: 'RUNNING', counter: 1,
            mutex: 'LOCKED', owner: 'T2', phase: 't2-wakeup',
            pkt: { from: 'LOCK', to: 'T2' },
        },
        {
            badge: 'T2: 임계 구역 → counter=2 ✓',
            log:   'Step 6 — T2가 임계 구역에서 counter++=2를 안전하게 실행합니다. 최종 counter=2. 예상값과 일치합니다 ✓',
            t1: 'READY', t2: 'RUNNING', counter: 2,
            mutex: 'LOCKED', owner: 'T2', phase: 't2-cs',
            pkt: { from: 'T2', to: 'MEM' },
            mutexOk: true,
        },
    ];

    const SEM_STEPS = [
        {
            badge: 'Semaphore S=2 초기화',
            log:   'Step 1 — 계수형 Semaphore S=2로 초기화합니다. 동시에 최대 2개의 스레드가 자원을 사용할 수 있습니다.',
            ts: ['READY','READY','READY'], sem: 2, using: [], phase: 'init',
        },
        {
            badge: 'T1: wait(S) → S=1, 진입',
            log:   'Step 2 — T1이 wait(P)를 호출합니다. S=2>0이므로 S--하여 S=1이 되고 T1이 자원에 진입합니다.',
            ts: ['RUNNING','READY','READY'], sem: 1, using: ['T1'],
            pkt: { from: 'T1', to: 'SEM' },
        },
        {
            badge: 'T2: wait(S) → S=0, 진입',
            log:   'Step 3 — T2가 wait(P)를 호출합니다. S=1>0이므로 S--하여 S=0이 됩니다. T2도 자원에 진입합니다. 두 스레드가 동시에 자원을 사용 중입니다.',
            ts: ['RUNNING','RUNNING','READY'], sem: 0, using: ['T1','T2'],
            pkt: { from: 'T2', to: 'SEM' },
        },
        {
            badge: 'T3: wait(S) → S=0, Blocked!',
            log:   'Step 4 — T3가 wait(P)를 호출합니다. S=0이므로 블로킹됩니다. 자원이 해제될 때까지 T3는 대기합니다.',
            ts: ['RUNNING','RUNNING','BLOCKED'], sem: 0, using: ['T1','T2'],
            pkt: { from: 'T3', to: 'SEM' },
        },
        {
            badge: 'T1: signal(S) → S=1, T3 깨어남',
            log:   'Step 5 — T1이 자원 사용을 마치고 signal(V)을 호출합니다. S++하여 S=1이 됩니다. 대기 중인 T3가 깨어나 자원에 진입합니다.',
            ts: ['READY','RUNNING','RUNNING'], sem: 1, using: ['T2','T3'],
            pkt: { from: 'SEM', to: 'T3' },
        },
        {
            badge: 'T2·T3 완료 → S=2 복원 ✓',
            log:   'Step 6 — T2와 T3가 순차적으로 signal(V)을 호출합니다. S가 다시 2로 복원됩니다. 동시 접근 수를 정확히 N=2로 제어했습니다 ✓',
            ts: ['READY','READY','READY'], sem: 2, using: [], semOk: true,
            pkt: { from: 'SEM', to: 'T2' },
        },
    ];

    const MODES = [
        { name: 'Race Condition', steps: RACE_STEPS },
        { name: 'Mutex',          steps: MUTEX_STEPS },
        { name: 'Semaphore',      steps: SEM_STEPS },
    ];

    /* ===================== 상태 변수 ===================== */
    let modeIdx    = 0;
    let stepIdx    = -1;
    let running    = false;
    let timer      = null;
    let rafId      = null;
    let speed      = 1800;
    let pktCurrent = null;
    let pktProg    = 0;
    let pktDone    = null;

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

    function arrowHead(x2, y2, ux, uy, col) {
        const p = 6;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - ux*p*2 - uy*p, y2 - uy*p*2 + ux*p);
        ctx.lineTo(x2 - ux*p*2 + uy*p, y2 - uy*p*2 - ux*p);
        ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
    }

    function drawEdge(x1, y1, x2, y2, col, dashed) {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.strokeStyle = col; ctx.lineWidth = 1.5;
        if (dashed) ctx.setLineDash([5, 5]);
        ctx.stroke(); ctx.setLineDash([]);
        const dx = x2-x1, dy = y2-y1, len = Math.sqrt(dx*dx+dy*dy);
        if (len > 2) arrowHead(x2, y2, dx/len, dy/len, col);
    }

    function nc(n) { return { x: n.x + n.w/2, y: n.y + n.h/2 }; }

    /* ===================== 색상 헬퍼 ===================== */
    function tColByKey(k) {
        if (k === 'T1') return P.teal;
        if (k === 'T2') return P.purple;
        if (k === 'T3') return P.green;
        return null;
    }

    function stateCol(s) {
        return s === 'RUNNING' ? P.green
             : s === 'READY'   ? P.purple
             : s === 'BLOCKED' ? P.red
             : P.muted;
    }

    function pktCol(step) {
        if (!step || !step.pkt) return P.orange;
        return tColByKey(step.pkt.from) || tColByKey(step.pkt.to) || P.orange;
    }

    /* ===================== 레이아웃 — 수직 흐름 (Threads→LOCK→MEM) ===================== */
    function buildLayout() {
        const W = GW(), H = GH();
        const mob = W < 520;
        const fMd = mob ? 13 : 15;
        const fSm = mob ? 11 : 12;

        const tH    = mob ? 66  : Math.round(H * 0.175);
        const midH  = mob ? 80  : Math.round(H * 0.195);
        const botH  = mob ? 100 : Math.round(H * 0.225);

        const topPad   = mob ? 22 : Math.round(H * 0.06);
        const vGap1    = mob ? 42 : Math.round(H * 0.09);
        const vGap2    = mob ? 38 : Math.round(H * 0.08);

        const tY   = topPad;
        const midY = tY + tH + vGap1;
        const botY = midY + midH + vGap2;

        if (modeIdx === 0) {
            const tW   = mob ? Math.round((W - 28) / 2) : Math.round(W * 0.24);
            const tGap = mob ? 8 : Math.round(W * 0.04);
            const ttW  = tW * 2 + tGap;
            const tStartX = Math.round((W - ttW) / 2);
            const memW = mob ? Math.round(W * 0.56) : Math.round(W * 0.32);
            const memH = botH + midH + vGap2;
            const memYr = midY;
            return {
                W, H, mob, fMd, fSm, tH,
                nodes: {
                    T1:  { x: tStartX,          y: tY, w: tW, h: tH, col: P.teal,   lbl: 'T1' },
                    T2:  { x: tStartX+tW+tGap,  y: tY, w: tW, h: tH, col: P.purple, lbl: 'T2' },
                    MEM: { x: Math.round((W-memW)/2), y: memYr, w: memW, h: memH, col: P.orange, lbl: 'Shared Memory' },
                },
            };
        }

        if (modeIdx === 1) {
            const tW   = mob ? Math.round((W - 28) / 2) : Math.round(W * 0.24);
            const tGap = mob ? 8 : Math.round(W * 0.04);
            const ttW  = tW * 2 + tGap;
            const tStartX = Math.round((W - ttW) / 2);
            const lockW = mob ? Math.round(W * 0.52) : Math.round(W * 0.32);
            const memW  = mob ? Math.round(W * 0.56) : Math.round(W * 0.36);
            const lockX = Math.round((W - lockW) / 2);
            const memX  = Math.round((W - memW) / 2);
            return {
                W, H, mob, fMd, fSm, tH, midH, botH,
                lockX, lockY: midY, lockW, lockH: midH,
                memX, memY: botY, memW, memH: botH,
                nodes: {
                    T1:   { x: tStartX,         y: tY, w: tW, h: tH, col: P.teal,   lbl: 'T1' },
                    T2:   { x: tStartX+tW+tGap, y: tY, w: tW, h: tH, col: P.purple, lbl: 'T2' },
                    LOCK: { x: lockX, y: midY, w: lockW, h: midH, col: P.red,    lbl: '' },
                    MEM:  { x: memX,  y: botY, w: memW,  h: botH, col: P.orange, lbl: 'Shared Memory' },
                },
            };
        }

        /* Semaphore: T1 T2 T3, SEM 중앙, Resources 하단 */
        const tW3  = mob ? Math.round((W - 36) / 3) : Math.round(W * 0.20);
        const tGap3 = mob ? 8 : Math.round((W - tW3*3 - 40) / 2);
        const tStart3 = Math.round((W - (tW3*3 + tGap3*2)) / 2);
        const semW  = mob ? Math.round(W * 0.50) : Math.round(W * 0.30);
        const resW  = mob ? Math.round(W * 0.72) : Math.round(W * 0.50);
        const semX  = Math.round((W - semW) / 2);
        const resX  = Math.round((W - resW) / 2);
        const slotW = Math.round((resW - 20) / 2);
        const slotH = Math.round(botH * 0.50);
        return {
            W, H, mob, fMd, fSm, tH, midH, botH,
            semX, semY: midY, semW, semH: midH,
            resX, resY: botY, resW, resH: botH, slotW, slotH,
            nodes: {
                T1:  { x: tStart3,               y: tY, w: tW3, h: tH, col: P.teal,   lbl: 'T1' },
                T2:  { x: tStart3+tW3+tGap3,     y: tY, w: tW3, h: tH, col: P.purple, lbl: 'T2' },
                T3:  { x: tStart3+(tW3+tGap3)*2, y: tY, w: tW3, h: tH, col: P.green,  lbl: 'T3' },
                SEM: { x: semX, y: midY, w: semW, h: midH, col: P.teal,   lbl: '' },
                RES: { x: resX, y: botY, w: resW, h: botH, col: P.orange, lbl: '' },
            },
        };
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        ctx.fillStyle = P.bg;
        ctx.fillRect(0, 0, GW(), GH());
        tooltipHits = [];

        const L    = buildLayout();
        const step = stepIdx >= 0 ? MODES[modeIdx].steps[stepIdx] : null;

        if      (modeIdx === 0) drawRace(L, step);
        else if (modeIdx === 1) drawMutex(L, step);
        else                    drawSemaphore(L, step);

        drawPkt(L, step);
        drawTooltip(L);
    }

    /* ===================== 스레드 노드 ===================== */
    function drawThread(n, key, state, regVal, L) {
        const { fMd, fSm } = L;
        const col   = n.col;
        const isAct = pktCurrent && (pktCurrent.from === key || pktCurrent.to === key);
        const isHov = hoveredKey === key;
        const sCol  = stateCol(state);

        rr(n.x, n.y, n.w, n.h, 8,
            isAct ? col+'25' : state==='BLOCKED' ? P.red+'12' : P.surf,
            isAct ? col : state==='BLOCKED' ? P.red+'bb' : isHov ? P.purple : P.border,
            isAct ? 2.5 : 1.5);

        const cx  = n.x + n.w/2;
        const lblY = n.y + n.h * 0.32;
        const pilY = n.y + n.h * 0.62;
        tx(n.lbl, cx, lblY, fMd, isAct ? col : state==='BLOCKED' ? P.red : P.text, 'center', true);

        const pW = Math.round(n.w*0.70), pH = 18;
        rr(cx-pW/2, pilY-pH/2, pW, pH, 5, sCol+'22', sCol, 1.5);
        tx(state, cx, pilY, Math.max(8, fSm-2), sCol, 'center', true);

        if (regVal !== null && regVal !== undefined) {
            tx('R=' + regVal, cx, n.y + n.h*0.88, fSm-1, P.yellow, 'center', true);
        }

        const qx = n.x+n.w-11, qy = n.y+11;
        ctx.beginPath(); ctx.arc(qx, qy, 7, 0, Math.PI*2);
        ctx.fillStyle   = isHov ? col : P.surf2; ctx.fill();
        ctx.strokeStyle = isHov ? col : P.muted; ctx.lineWidth=1; ctx.stroke();
        tx('?', qx, qy, 8, isHov ? '#fff' : P.muted, 'center', true);
        tooltipHits.push({ x: qx-7, y: qy-7, w: 14, h: 14, key });
    }

    /* ===================== 공유 메모리 노드 ===================== */
    function drawMem(n, counter, raceResult, mutexOk, L) {
        const { fMd, fSm } = L;
        const isAct = pktCurrent && (pktCurrent.from==='MEM'||pktCurrent.to==='MEM');
        const isHov = hoveredKey === 'MEM';
        const bCol  = raceResult ? P.red : mutexOk ? P.green : isAct ? P.orange : isHov ? P.purple : P.border;
        const bW    = (raceResult||mutexOk||isAct) ? 2.5 : isHov ? 2 : 1.5;

        rr(n.x, n.y, n.w, n.h, 8,
            (raceResult||mutexOk||isAct) ? bCol+'18' : P.surf, bCol, bW);

        const cx = n.x+n.w/2;
        tx('Shared Memory', cx, n.y+n.h*0.14, fSm, isAct?P.orange:P.sub, 'center', true);
        ctx.beginPath(); ctx.moveTo(n.x+14, n.y+n.h*0.27); ctx.lineTo(n.x+n.w-14, n.y+n.h*0.27);
        ctx.strokeStyle=P.border; ctx.lineWidth=1; ctx.stroke();
        tx('counter =', cx, n.y+n.h*0.44, fSm-1, P.muted, 'center', false);
        const vCol = raceResult?P.red : mutexOk?P.green : isAct?P.orange : P.text;
        tx(String(counter), cx, n.y+n.h*0.66, Math.round(n.h*0.26), vCol, 'center', true);
        if (raceResult) tx('⚠ 예상: 2  /  실제: '+counter, cx, n.y+n.h*0.88, fSm-1, P.red, 'center', true);
        if (mutexOk)    tx('✓ 정확한 결과', cx, n.y+n.h*0.88, fSm-1, P.green, 'center', true);

        const qx = n.x+n.w-11, qy = n.y+11;
        ctx.beginPath(); ctx.arc(qx, qy, 7, 0, Math.PI*2);
        ctx.fillStyle   = isHov ? P.orange : P.surf2; ctx.fill();
        ctx.strokeStyle = isHov ? P.orange : P.muted; ctx.lineWidth=1; ctx.stroke();
        tx('?', qx, qy, 8, isHov?'#fff':P.muted, 'center', true);
        tooltipHits.push({ x: qx-7, y: qy-7, w: 14, h: 14, key: 'MEM' });
    }

    /* ===================== Race 모드 ===================== */
    function drawRace(L, step) {
        const { nodes, fSm, mob } = L;
        if (!step) { drawIdle(L); return; }

        ['T1','T2'].forEach(function (k) {
            const tn = nodes[k], mn = nodes.MEM;
            const active = pktCurrent && (pktCurrent.from===k||pktCurrent.to===k||
                                          pktCurrent.from==='MEM'||pktCurrent.to==='MEM');
            const frac = k==='T1' ? 0.32 : 0.68;
            drawEdge(
                tn.x+tn.w/2, tn.y+tn.h,
                mn.x+mn.w*frac, mn.y,
                active ? tn.col : P.border, !active
            );
        });

        drawThread(nodes.T1, 'T1', step.t1, step.t1reg, L);
        drawThread(nodes.T2, 'T2', step.t2, step.t2reg, L);
        drawMem(nodes.MEM, step.counter, !!step.raceResult, false, L);

        if (step.phase !== 'init') {
            const mn = nodes.MEM;
            tx('⚠ 임계 구역 보호 없음', mn.x+mn.w/2, mn.y - (mob?14:18),
               fSm-1, P.red+'cc', 'center', false);
        }
    }

    /* ===================== Mutex 모드 ===================== */
    function drawMutex(L, step) {
        const { nodes, fMd, fSm, lockX, lockY, lockW, lockH, memX, memY, memW, memH } = L;
        if (!step) { drawIdle(L); return; }

        const locked  = step.mutex === 'LOCKED';
        const lockCol = locked ? P.red : P.green;

        ['T1','T2'].forEach(function (k) {
            const tn = nodes[k];
            const active = pktCurrent && (pktCurrent.from===k||pktCurrent.to===k);
            const frac   = k==='T1' ? 0.30 : 0.70;
            drawEdge(
                tn.x+tn.w/2, tn.y+tn.h,
                lockX+lockW*frac, lockY,
                active ? tn.col : P.border, !active
            );
        });

        const memActive = pktCurrent && (pktCurrent.from==='MEM'||pktCurrent.to==='MEM'||
                                         pktCurrent.from==='T1'&&step.phase==='t1-cs'||
                                         pktCurrent.from==='T2'&&step.phase==='t2-cs');
        const ownerCol  = step.owner === 'T1' ? P.teal : step.owner === 'T2' ? P.purple : lockCol;
        drawEdge(
            lockX+lockW/2, lockY+lockH,
            memX+memW/2,   memY,
            memActive ? ownerCol : P.border, !memActive
        );

        drawThread(nodes.T1, 'T1', step.t1, null, L);
        drawThread(nodes.T2, 'T2', step.t2, null, L);

        const isLkAct = pktCurrent && (pktCurrent.from==='LOCK'||pktCurrent.to==='LOCK'||
                                        pktCurrent.from==='T1'||pktCurrent.from==='T2');
        const isLkHov = hoveredKey === 'LOCK';
        rr(lockX, lockY, lockW, lockH, 8,
            locked ? P.red+'15' : P.green+'15',
            isLkAct ? lockCol : isLkHov ? P.purple : lockCol, isLkAct?2.5:1.5);

        tx('Mutex', lockX+lockW/2, lockY+lockH*0.24, fMd, lockCol, 'center', true);
        ctx.beginPath(); ctx.moveTo(lockX+14,lockY+lockH*0.40); ctx.lineTo(lockX+lockW-14,lockY+lockH*0.40);
        ctx.strokeStyle=lockCol+'44'; ctx.lineWidth=1; ctx.stroke();
        tx(locked?'LOCKED':'UNLOCKED', lockX+lockW/2, lockY+lockH*0.60, fMd, lockCol, 'center', true);
        tx(step.owner?'보유: '+step.owner:'대기 없음', lockX+lockW/2, lockY+lockH*0.82, fSm-1, P.sub, 'center', false);

        const qx=lockX+lockW-11, qy=lockY+11;
        ctx.beginPath(); ctx.arc(qx,qy,7,0,Math.PI*2);
        ctx.fillStyle=isLkHov?lockCol:P.surf2; ctx.fill();
        ctx.strokeStyle=isLkHov?lockCol:P.muted; ctx.lineWidth=1; ctx.stroke();
        tx('?',qx,qy,8,isLkHov?'#fff':P.muted,'center',true);
        tooltipHits.push({x:qx-7,y:qy-7,w:14,h:14,key:'LOCK'});

        drawMem(nodes.MEM, step.counter, false, !!step.mutexOk, L);
    }

    /* ===================== Semaphore 모드 ===================== */
    function drawSemaphore(L, step) {
        const { nodes, fMd, fSm, semX, semY, semW, semH,
                resX, resY, resW, resH, slotW, slotH, mob } = L;
        if (!step) { drawIdle(L); return; }

        const semCol = step.sem > 0 ? P.teal : P.red;
        const tKeys  = ['T1','T2','T3'];
        const fracArr = [0.22, 0.50, 0.78];

        tKeys.forEach(function (k, i) {
            const tn = nodes[k];
            const active = pktCurrent && (pktCurrent.from===k||pktCurrent.to===k);
            drawEdge(
                tn.x+tn.w/2, tn.y+tn.h,
                semX+semW*fracArr[i], semY,
                active ? tn.col : P.border, !active
            );
        });

        const resActive = pktCurrent && (pktCurrent.from==='SEM'||pktCurrent.to==='SEM');
        drawEdge(semX+semW/2, semY+semH, resX+resW/2, resY, resActive?semCol:P.border, !resActive);

        const tsStates = step.ts || ['READY','READY','READY'];
        tKeys.forEach(function (k, i) {
            drawThread(nodes[k], k, tsStates[i], null, L);
        });

        const isSemAct = pktCurrent && (pktCurrent.from==='SEM'||pktCurrent.to==='SEM'||
                                         tKeys.indexOf(pktCurrent.from)>=0||tKeys.indexOf(pktCurrent.to)>=0);
        const isSemHov = hoveredKey === 'SEM';
        rr(semX, semY, semW, semH, 8, semCol+'18', isSemAct?semCol:isSemHov?P.purple:semCol, isSemAct?2.5:1.5);
        tx('Semaphore', semX+semW/2, semY+semH*0.24, fMd, semCol, 'center', true);
        ctx.beginPath(); ctx.moveTo(semX+14,semY+semH*0.40); ctx.lineTo(semX+semW-14,semY+semH*0.40);
        ctx.strokeStyle=semCol+'44'; ctx.lineWidth=1; ctx.stroke();
        tx('S = '+step.sem, semX+semW/2, semY+semH*0.62, fMd+4, semCol, 'center', true);
        tx(step.sem===0?'자원 없음 (블로킹)':'진입 가능 ('+step.sem+'개)',
           semX+semW/2, semY+semH*0.84, fSm-1, P.sub, 'center', false);

        const qxs=semX+semW-11, qys=semY+11;
        ctx.beginPath(); ctx.arc(qxs,qys,7,0,Math.PI*2);
        ctx.fillStyle=isSemHov?semCol:P.surf2; ctx.fill();
        ctx.strokeStyle=isSemHov?semCol:P.muted; ctx.lineWidth=1; ctx.stroke();
        tx('?',qxs,qys,8,isSemHov?'#fff':P.muted,'center',true);
        tooltipHits.push({x:qxs-7,y:qys-7,w:14,h:14,key:'SEM'});

        const using = step.using || [];
        rr(resX, resY, resW, resH, 8, P.surf, P.border, 1.5);
        tx('공유 자원 (동시 접근 허용: 2개)', resX+resW/2, resY+resH*0.18, fSm-1, P.sub, 'center', false);
        for (let si = 0; si < 2; si++) {
            const slotPad = 8;
            const sx = resX + slotPad + si*(slotW+slotPad);
            const sy = resY + Math.round(resH*0.32);
            const who = using[si] || null;
            const sc  = who ? tColByKey(who) : P.surf2;
            rr(sx, sy, slotW, slotH, 6, who?sc+'33':P.surf2, who?sc:P.border, who?2:1);
            tx(who?who+' 사용 중':'빈 슬롯', sx+slotW/2, sy+slotH/2, fSm-1,
               who?sc:P.muted, 'center', !!who);
        }
        if (step.semOk) {
            tx('✓ 최대 2개 동시 접근 제어 완료', resX+resW/2, resY+resH*0.86, fSm-1, P.green, 'center', true);
        }
    }

    /* ===================== 유휴 화면 ===================== */
    function drawIdle(L) {
        const { fMd, fSm } = L;
        const W = GW(), H = GH();
        const names = ['Race Condition', 'Mutex', 'Semaphore'];
        tx(names[modeIdx] + ' 시각화', W/2, H/2-14, fMd, P.sub, 'center', false);
        tx('PLAY 또는 STEP을 눌러 시작하세요', W/2, H/2+16, fSm, P.muted, 'center', false);
    }

    /* ===================== 패킷 ===================== */
    function drawPkt(L, step) {
        if (!pktCurrent || !step || !step.pkt) return;
        const { nodes } = L;
        const fn = nodes[step.pkt.from], tn = nodes[step.pkt.to];
        if (!fn || !tn) return;
        const fc = nc(fn), tc = nc(tn);
        const x  = fc.x + (tc.x-fc.x)*pktProg;
        const y  = fc.y + (tc.y-fc.y)*pktProg;
        const col = pktCol(step);
        ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI*2);
        ctx.fillStyle = col; ctx.fill();
        tx('→', x, y, 9, '#0f0f1a', 'center', true);
    }

    function animPkt(step, cb) {
        if (!step || !step.pkt) { if (cb) cb(); return; }
        pktCurrent = step.pkt;
        pktProg    = 0;
        pktDone    = cb || null;
        if (rafId) cancelAnimationFrame(rafId);
        const BASE = 1800, baseStep = 0.005;
        const s = baseStep * (BASE / speed);
        (function tick() {
            pktProg = Math.min(1, pktProg + s);
            draw();
            if (pktProg < 1) { rafId = requestAnimationFrame(tick); }
            else {
                pktCurrent = null; draw();
                if (pktDone) { var fn = pktDone; pktDone = null; fn(); }
            }
        })();
    }

    /* ===================== 툴팁 ===================== */
    const TIPS = {
        T1:   'Thread 1\n독립된 Stack·PC를 가집니다. 공유 자원에 접근 시 동기화가 필요합니다.',
        T2:   'Thread 2\nT1과 같은 프로세스 내에서 Heap·Data 영역을 공유합니다.',
        T3:   'Thread 3\n계수형 Semaphore 예제에서 세 번째 경쟁자입니다.',
        MEM:  'Shared Memory\n여러 스레드가 동시에 읽고 쓰는 공유 변수입니다. Race Condition의 발생 지점입니다.',
        LOCK: 'Mutex Lock\n한 번에 하나의 스레드만 임계 구역에 진입하도록 보장하는 상호 배제 락입니다.',
        SEM:  'Semaphore\n정수 카운터 S로 동시 접근 수를 제한합니다. wait(P): S-- 또는 블로킹, signal(V): S++.',
    };

    function drawTooltip(L) {
        if (!hoveredKey || !TIPS[hoveredKey]) return;
        const parts = TIPS[hoveredKey].split('\n');
        const title = parts[0], desc = parts[1] || '';
        const W = GW(), H = GH();
        const pad = 14;
        const maxTW = Math.min(W-24, W<520 ? W*0.85 : 300);
        const innerW = maxTW - pad*2;
        const tFont = '700 13px "JetBrains Mono",monospace';
        const dFont = '400 12px "JetBrains Mono",monospace';
        ctx.font = tFont;
        const tW2 = ctx.measureText(title).width;
        ctx.font = dFont;
        const words = desc.split(' ');
        const lines = [];
        let cur = '';
        words.forEach(function (w) {
            const t = cur ? cur+' '+w : w;
            if (ctx.measureText(t).width > innerW && cur) { lines.push(cur); cur=w; }
            else cur=t;
        });
        if (cur) lines.push(cur);
        const lineH=17, titleH=24;
        const th = desc ? titleH+lines.length*lineH+10 : 36;
        const tw = Math.min(Math.max(tW2, innerW)+pad*2, maxTW);
        let bx = mousePos.x+14, by = mousePos.y-th-8;
        if (bx+tw > W-8) bx = mousePos.x-tw-14;
        if (bx < 8)      bx = 8;
        if (by < 8)      by = mousePos.y+14;
        if (by+th > H-8) by = H-th-8;
        rr(bx, by, tw, th, 6, P.surf2, P.purple+'cc', 2);
        ctx.font=tFont; ctx.fillStyle=P.text; ctx.textAlign='left'; ctx.textBaseline='middle';
        ctx.fillText(title, bx+pad, by+(desc?14:th/2));
        if (lines.length) {
            ctx.font=dFont; ctx.fillStyle=P.sub;
            lines.forEach(function(l,i){ ctx.fillText(l, bx+pad, by+titleH+i*lineH+4); });
        }
    }

    /* ===================== 단계 적용 ===================== */
    function setLog(s)  { logEl.textContent = s; }
    function setModeBtnsDisabled(v) {
        root.querySelectorAll('.sync-viz__mode-btn').forEach(function(b){b.disabled=v;});
    }
    function setSpeedDisabled(v) {
        root.querySelectorAll('.sync-viz__speed-btn').forEach(function(b){b.disabled=v;});
    }

    function applyStep(idx, onDone) {
        stepIdx = idx;
        const step = MODES[modeIdx].steps[idx];
        setLog(step.log);
        animPkt(step, function() {
            draw();
            if (onDone) setTimeout(onDone, 0);
        });
    }

    /* ===================== 컨트롤 ===================== */
    function syncStart() {
        if (running) return;
        running = true; btnPlay.disabled = true; btnStep.disabled = true;
        setModeBtnsDisabled(true); setSpeedDisabled(true);

        function tick() {
            const steps = MODES[modeIdx].steps;
            const next  = stepIdx + 1;
            if (next >= steps.length) { running = false; setSpeedDisabled(false); return; }
            applyStep(next, function() {
                if (next === steps.length-1) {
                    running = false; btnStep.disabled = true; setSpeedDisabled(false);
                } else {
                    timer = setTimeout(tick, speed);
                }
            });
        }
        tick();
    }

    function syncStep() {
        if (running || pktCurrent) return;
        const steps = MODES[modeIdx].steps;
        const next  = stepIdx + 1;
        if (next >= steps.length) return;
        applyStep(next, null);
        if (next === steps.length-1) { btnPlay.disabled = true; btnStep.disabled = true; }
    }

    function syncReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false; stepIdx = -1;
        pktCurrent = null; pktProg = 0; pktDone = null;
        setLog('▶ PLAY를 눌러 동기화 원리를 확인하세요. 상단 버튼으로 모드를 바꿀 수 있습니다.');
        btnPlay.disabled = false; btnStep.disabled = false;
        setModeBtnsDisabled(false); setSpeedDisabled(false);
        resize();
    }

    function setMode(idx, btn) {
        modeIdx = idx;
        root.querySelectorAll('.sync-viz__mode-btn').forEach(function(b){
            b.classList.remove('sync-viz__mode-btn--active');
        });
        btn.classList.add('sync-viz__mode-btn--active');
        syncReset();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.sync-viz__speed-btn').forEach(function(b){
            b.classList.remove('sync-viz__speed-btn--active');
        });
        btn.classList.add('sync-viz__speed-btn--active');
    }

    /* ===================== 라이프사이클 ===================== */
    window.CsFlow.createVizLifecycle({
        canvas, canvasWrap, resize, draw,
        getState : function() { return { rafId, timer, running }; },
        setState : function(s) { rafId=s.rafId; timer=s.timer; running=s.running; },
        onPause  : function() { setSpeedDisabled(false); },
        getMouseCtx: function() {
            return {
                GW, GH, mousePos, tooltipHits,
                hoveredKey   : function()  { return hoveredKey; },
                setHoveredKey: function(k) { hoveredKey = k; },
                draw,
            };
        },
    });

    setTimeout(resize, 60);
})();