/**
 * 버스 구조 인터랙티브 시각화
 */
(function () {
    'use strict';

    if (!window.CsFlow || typeof window.CsFlow.createVizLifecycle !== 'function') {
        console.error('[CSFlow] viz-common.js 로드 필요');
        return;
    }

    const container = document.getElementById('visualizer-container');
    if (!container) return;

    /* ===================== UI 구성 ===================== */
    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls)  e.className = cls;
        if (text) e.textContent = text;
        return e;
    }

    const root    = el('div', 'bus-viz');
    const toolbar = el('div', 'bus-viz__toolbar');
    const tbLeft  = el('div', 'bus-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'bus-viz__title', 'Bus Architecture'));
    const badge = el('span', 'bus-viz__step-badge', 'IDLE');
    tbLeft.appendChild(badge);
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'bus-viz__speed');
    speedWrap.appendChild(el('span', 'bus-viz__speed-label', 'SPEED'));
    [['1x', 1100], ['2x', 550], ['3x', 220]].forEach(([label, ms], i) => {
        const btn = el('button', 'bus-viz__speed-btn' + (i === 0 ? ' bus-viz__speed-btn--active' : ''), label);
        btn.dataset.ms = ms;
        btn.addEventListener('click', () => { if (!running) setSpeed(ms, btn); });
        speedWrap.appendChild(btn);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'bus-viz__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'bus-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const logEl = el('div', 'bus-viz__log', '▶ PLAY를 눌러 버스 동작을 확인하세요.');
    root.appendChild(logEl);

    const controls = el('div', 'bus-viz__controls');
    const btnPlay  = el('button', 'bus-viz__btn bus-viz__btn--primary', '▶ PLAY');
    const btnStep  = el('button', 'bus-viz__btn', '▶| STEP');
    const btnReset = el('button', 'bus-viz__btn', '↺ RESET');
    btnPlay.addEventListener('click',  bvStart);
    btnStep.addEventListener('click',  bvStep);
    btnReset.addEventListener('click', bvReset);
    controls.appendChild(btnPlay);
    controls.appendChild(btnStep);
    controls.appendChild(btnReset);
    root.appendChild(controls);
    container.appendChild(root);

    /* ===================== 캔버스 ===================== */
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const GW  = () => canvas.width  / dpr;
    const GH  = () => canvas.height / dpr;

    function resize() {
        const w   = canvasWrap.offsetWidth;
        const mob = w < 520;
        const minH = mob ? 420 : 520;
        const h    = Math.max(canvasWrap.offsetHeight, minH);
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    /* ===================== 팔레트 ===================== */
    const PALETTE = window.CsFlow.PALETTE;
    let P = window.CsFlow.getP();

    /* ===================== 툴팁 정의 ===================== */
    const TOOLTIPS = {
        CPU:  'CPU\n버스를 통해 데이터 전송을 요청하는 주체 (Bus Master)',
        MEM:  'Main Memory\n주소 버스로 지정된 위치에 데이터 읽기/쓰기 (Slave)',
        IO:   'I/O Device\n입출력 장치 — 버스 중재(Arbitration)를 거쳐 접근',
        ADDR: 'Address Bus\n단방향 — CPU가 접근할 메모리/I/O 주소를 전송',
        DATA: 'Data Bus\n양방향 — 실제 데이터를 주고받는 통로',
        CTRL: 'Control Bus\n양방향 — Read/Write/IRQ 등 제어 신호 전송',
        ARB:  'Bus Arbiter\n여러 장치의 버스 요청을 중재하여 우선순위 결정',
    };

    /* ===================== 시나리오 ===================== */
    const STEPS = [
        {
            badge: 'ADDR → MEM',
            log: 'Step 1 — CPU가 Address Bus에 메모리 주소(0x00FF)를 전송합니다. 단방향으로 CPU → Memory 방향으로만 흐릅니다.',
            activeBus: 'addr',
            arrows: [{ from: 'cpu', to: 'mem', via: 'addr' }],
        },
        {
            badge: 'CTRL READ',
            log: 'Step 2 — Control Bus로 READ 신호를 전송합니다. CPU가 메모리에서 데이터를 읽겠다고 알립니다.',
            activeBus: 'ctrl',
            arrows: [{ from: 'cpu', to: 'mem', via: 'ctrl' }],
        },
        {
            badge: 'DATA ← MEM',
            log: 'Step 3 — Memory가 Data Bus를 통해 요청한 데이터를 CPU로 반환합니다. 양방향 버스가 Memory → CPU 방향으로 동작합니다.',
            activeBus: 'data',
            arrows: [{ from: 'mem', to: 'cpu', via: 'data' }],
        },
        {
            badge: 'ADDR → I/O',
            log: 'Step 4 — CPU가 I/O 장치에 접근하기 위해 Address Bus에 I/O 포트 주소(0x03F8)를 전송합니다.',
            activeBus: 'addr',
            arrows: [{ from: 'cpu', to: 'io', via: 'addr' }],
        },
        {
            badge: 'CTRL WRITE',
            log: 'Step 5 — Control Bus로 WRITE 신호를 전송합니다. CPU가 I/O 장치에 데이터를 쓰겠다고 알립니다.',
            activeBus: 'ctrl',
            arrows: [{ from: 'cpu', to: 'io', via: 'ctrl' }],
        },
        {
            badge: 'DATA → I/O',
            log: 'Step 6 — CPU가 Data Bus를 통해 I/O 장치로 데이터를 전송합니다.',
            activeBus: 'data',
            arrows: [{ from: 'cpu', to: 'io', via: 'data' }],
        },
        {
            badge: 'BUS REQ',
            log: 'Step 7 — I/O 장치가 DMA를 위해 버스 사용을 요청(Bus Request)합니다. Arbiter가 요청을 수신합니다.',
            activeBus: 'ctrl',
            arrows: [{ from: 'io', to: 'arb', via: 'ctrl' }],
        },
        {
            badge: 'BUS GRANT + DMA',
            log: 'Step 8 — Arbiter가 버스 사용권(Bus Grant)을 I/O에 부여합니다. I/O는 Data Bus로 Memory에 직접 접근합니다(DMA).',
            activeBus: 'data',
            arrows: [
                { from: 'arb', to: 'io',  via: 'ctrl' },
                { from: 'io',  to: 'mem', via: 'data' },
            ],
        },
    ];

    /* ===================== 상태 ===================== */
    let stepIdx    = -1;
    let running    = false;
    let timer      = null;
    let speed      = 1100;
    let rafId      = null;

    let pktQueue   = [];
    let pktCurrent = null;
    let pktProg    = 0;
    let pktDone    = null;

    let tooltipHits = [];
    let mousePos    = { x: -1, y: -1 };
    let hoveredKey  = null;

    /* ===================== 드로우 헬퍼 ===================== */
    function rr(x, y, w, h, r, fill, stroke, lw) {
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
        ctx.font = `${bold ? 700 : 400} ${sz}px "JetBrains Mono",monospace`;
        ctx.fillStyle    = color;
        ctx.textAlign    = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    function drawArrow(x1, y1, x2, y2, col, active) {
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 2) return;
        const ux = dx / len, uy = dy / len;
        const ex = x2 - ux * 10, ey = y2 - uy * 10;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = active ? col : P.border;
        ctx.lineWidth   = active ? 2.5 : 1;
        ctx.setLineDash(active ? [] : [4, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        if (!active) return;
        const p = 5;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(ex - uy * p, ey + ux * p);
        ctx.lineTo(ex + uy * p, ey - ux * p);
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();
    }

    /* ===================== 레이아웃 계산 ===================== */
    function buildLayout() {
        const W = GW(), H = GH();
        const mob = W < 520;
        const nw = mob ? 72  : 100;
        const nh = mob ? 52  : 68;
        const busH   = mob ? 36 : 48;
        const busGap = mob ? 18 : 26;
        const padX = mob ? 10 : 24;
        const busTotalH = 3 * busH + 2 * busGap;
        const topPad   = mob ? 20 : 30;
        const arbH2    = mob ? 28 : 36;
        const arbGap   = mob ? 14 : 20;
        const availH   = H - topPad - arbH2 - arbGap - (mob ? 16 : 20);
        const busMidY  = topPad + availH / 2;

        const addrTop  = busMidY - busTotalH / 2;
        const dataTop  = addrTop + busH + busGap;
        const ctrlTop  = dataTop + busH + busGap;

        const busLeft  = padX + nw + (mob ? 6 : 10);
        const busRight = W - padX - nw - (mob ? 6 : 10);

        const cpuX  = padX;
        const rightX = W - padX - nw;

        const memY = addrTop + (busH - nh) / 2;
        const ioY  = ctrlTop + (busH - nh) / 2;
        const cpuY = busMidY - nh / 2;

        const arbW = mob ? 80 : 100;
        const arbH = arbH2;
        const arbX = (busLeft + busRight) / 2 - arbW / 2;
        const arbY = ctrlTop + busH + arbGap;

        return {
            W, H, mob,
            nw, nh,
            busH, busGap, busLeft, busRight,
            addrTop, dataTop, ctrlTop,
            cpuX, cpuY,
            memX: rightX, memY,
            ioX:  rightX, ioY,
            arbX, arbY, arbW, arbH,
        };
    }

    /* ===================== 연결선 — 점선(비활성) / 실선(활성) ===================== */
    function drawConnectors(L) {
        const buses = [
            { key: 'addr', top: L.addrTop, col: P.purple },
            { key: 'data', top: L.dataTop, col: P.green  },
            { key: 'ctrl', top: L.ctrlTop, col: P.teal   },
        ];
        const step = stepIdx >= 0 ? STEPS[stepIdx] : null;

        buses.forEach(bc => {
            const midY = bc.top + L.busH / 2;
            const isHL = step && step.activeBus === bc.key;
            const col  = isHL ? bc.col : P.border;
            const lw   = isHL ? 2 : 1;
            const dash = isHL ? [] : [4, 5];

            ctx.beginPath();
            ctx.moveTo(L.cpuX + L.nw, midY);
            ctx.lineTo(L.busLeft, midY);
            ctx.strokeStyle = col; ctx.lineWidth = lw;
            ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);

            ctx.beginPath();
            ctx.moveTo(L.busRight, midY);
            ctx.lineTo(L.memX, L.memY + L.nh / 2);
            ctx.strokeStyle = col; ctx.lineWidth = lw;
            ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);

            ctx.beginPath();
            ctx.moveTo(L.busRight, midY);
            ctx.lineTo(L.ioX, L.ioY + L.nh / 2);
            ctx.strokeStyle = col; ctx.lineWidth = lw;
            ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
        });

        const ctrlBot  = L.ctrlTop + L.busH;
        const arbMidX  = L.arbX + L.arbW / 2;
        const isHLCtrl = step && step.activeBus === 'ctrl';
        ctx.beginPath();
        ctx.moveTo(arbMidX, ctrlBot);
        ctx.lineTo(arbMidX, L.arbY);
        ctx.strokeStyle = isHLCtrl ? P.teal : P.border;
        ctx.lineWidth   = isHLCtrl ? 2 : 1;
        ctx.setLineDash(isHLCtrl ? [] : [4, 5]);
        ctx.stroke(); ctx.setLineDash([]);
    }

    function drawActiveArrows(L) {
        if (stepIdx < 0) return;
        const step = STEPS[stepIdx];
        const busColMap = { addr: P.purple, data: P.green, ctrl: P.teal };

        step.arrows.forEach(arr => {
            const col  = busColMap[arr.via] || P.purple;
            const midY = { addr: L.addrTop, data: L.dataTop, ctrl: L.ctrlTop }[arr.via] + L.busH / 2;

            if (arr.from === 'arb' && arr.to === 'io') {
                drawArrow(L.arbX + L.arbW / 2, L.arbY, L.arbX + L.arbW / 2, L.ioY + L.nh, col, true);
                return;
            }
            if (arr.from === 'io' && arr.to === 'arb') {
                drawArrow(L.arbX + L.arbW / 2, L.ioY + L.nh, L.arbX + L.arbW / 2, L.arbY + L.arbH, col, true);
                return;
            }

            const margin = 16;
            if (arr.from === 'cpu') {
                drawArrow(L.busLeft + margin, midY, L.busRight - margin, midY, col, true);
            } else if (arr.to === 'cpu') {
                drawArrow(L.busRight - margin, midY, L.busLeft + margin, midY, col, true);
            } else {
                drawArrow(L.busLeft + margin, midY, L.busRight - margin, midY, col, true);
            }
        });
    }

    /* ===================== 버스 레인 그리기 ===================== */
    function drawBuses(L) {
        const step = stepIdx >= 0 ? STEPS[stepIdx] : null;
        const busConfigs = [
            { key: 'addr', top: L.addrTop, col: P.purple, label: 'ADDRESS BUS', tipKey: 'ADDR' },
            { key: 'data', top: L.dataTop, col: P.green,  label: 'DATA BUS',    tipKey: 'DATA' },
            { key: 'ctrl', top: L.ctrlTop, col: P.teal,   label: 'CONTROL BUS', tipKey: 'CTRL' },
        ];

        busConfigs.forEach(bc => {
            const isHL  = step && step.activeBus === bc.key;
            const alpha = isHL ? 'ff' : '55';
            const bgAlp = isHL ? '22' : '0a';
            const lw    = isHL ? 2    : 1;
            const midY  = bc.top + L.busH / 2;

            ctx.fillStyle = bc.col + bgAlp;
            ctx.fillRect(L.busLeft, bc.top, L.busRight - L.busLeft, L.busH);

            ctx.beginPath();
            ctx.rect(L.busLeft, bc.top, L.busRight - L.busLeft, L.busH);
            ctx.strokeStyle = bc.col + alpha;
            ctx.lineWidth   = lw;
            ctx.stroke();

            tx(bc.label, (L.busLeft + L.busRight) / 2, midY,
                L.mob ? 9 : 13, bc.col + (isHL ? 'ff' : 'bb'), 'center', true);

            const qx = L.busLeft + 16, qy = midY;
            drawBadge(qx, qy, bc.tipKey);
            tooltipHits.push({ x: qx - 8, y: qy - 8, w: 16, h: 16, key: bc.tipKey });
        });
    }

    /* ===================== 노드 그리기 ===================== */
    function drawNodes(L) {
        const fMd = L.mob ? 11 : 14;
        const fSm = L.mob ? 9  : 11;

        const nodeList = [
            { key: 'CPU', x: L.cpuX, y: L.cpuY, w: L.nw, h: L.nh, col: P.purple, lbl: 'CPU',    sub: 'Master' },
            { key: 'MEM', x: L.memX, y: L.memY, w: L.nw, h: L.nh, col: P.orange, lbl: 'MEMORY', sub: 'Slave'  },
            { key: 'IO',  x: L.ioX,  y: L.ioY,  w: L.nw, h: L.nh, col: P.yellow, lbl: 'I/O',    sub: 'Device' },
        ];

        nodeList.forEach(n => {
            const isHov = hoveredKey === n.key;
            rr(n.x, n.y, n.w, n.h, 8,
                isHov ? n.col + '28' : P.surf,
                n.col, isHov ? 2.5 : 1.5);
            tx(n.lbl, n.x + n.w / 2, n.y + n.h / 2 - (L.mob ? 7 : 9),  fMd, n.col,  'center', true);
            tx(n.sub, n.x + n.w / 2, n.y + n.h / 2 + (L.mob ? 8 : 10), fSm, P.muted,'center', false);
            const qx = n.x + n.w - 9, qy = n.y + 9;
            drawBadge(qx, qy, n.key);
            tooltipHits.push({ x: qx - 7, y: qy - 7, w: 14, h: 14, key: n.key });
        });
    }

    /* ===================== Arbiter 그리기 ===================== */
    function drawArbiter(L) {
        const isHov = hoveredKey === 'ARB';
        const step  = stepIdx >= 0 ? STEPS[stepIdx] : null;
        const isHL  = step && step.activeBus === 'ctrl' &&
                      step.arrows.some(a => a.from === 'arb' || a.to === 'arb');
        rr(L.arbX, L.arbY, L.arbW, L.arbH, 6,
            isHov || isHL ? P.teal + '28' : P.surf,
            P.teal, isHov || isHL ? 2 : 1.5);
        tx('ARBITER', L.arbX + L.arbW / 2, L.arbY + L.arbH / 2,
            L.mob ? 9 : 11, P.teal, 'center', true);
        const qx = L.arbX + L.arbW - 9, qy = L.arbY + 9;
        drawBadge(qx, qy, 'ARB');
        tooltipHits.push({ x: qx - 7, y: qy - 7, w: 14, h: 14, key: 'ARB' });
    }

    /* ===================== ? 뱃지 ===================== */
    function drawBadge(qx, qy, key) {
        const isHov = hoveredKey === key;
        ctx.beginPath();
        ctx.arc(qx, qy, 7, 0, Math.PI * 2);
        ctx.fillStyle   = isHov ? P.purple : P.surf2;
        ctx.fill();
        ctx.strokeStyle = isHov ? P.purple : P.muted;
        ctx.lineWidth = 1; ctx.stroke();
        tx('?', qx, qy, 9, isHov ? '#fff' : P.muted, 'center', true);
    }

    /* ===================== 툴팁 ===================== */
    function drawTooltip(mx, my, key) {
        const lines = TOOLTIPS[key].split('\n');
        const title = lines[0], desc = lines[1] || '';
        const W = GW(), H = GH();
        const mob = W < 520;
        const pad = 16;
        const maxDescW = mob ? Math.min(W - 32, 220) : 300;

        ctx.font = '400 13px "JetBrains Mono",monospace';
        const descLines = [];
        if (desc) {
            const words = desc.split(' ');
            let line = '';
            words.forEach(word => {
                const test = line + (line ? ' ' : '') + word;
                if (ctx.measureText(test).width > maxDescW - pad * 2 && line) {
                    descLines.push(line);
                    line = word;
                } else {
                    line = test;
                }
            });
            if (line) descLines.push(line);
        }

        const lineH  = 20;
        const titleH = 28;
        const th = titleH + (descLines.length > 0 ? descLines.length * lineH + 10 : 0);

        ctx.font = '700 14px "JetBrains Mono",monospace';
        const tw1 = ctx.measureText(title).width;
        ctx.font = '400 13px "JetBrains Mono",monospace';
        const tw2 = descLines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0);
        const tw = Math.min(Math.max(tw1, tw2) + pad * 2, maxDescW);

        let tx_ = mx + 14, ty_ = my - th - 8;
        if (tx_ + tw > W - 8) tx_ = mx - tw - 14;
        if (tx_ < 8)          tx_ = 8;
        if (ty_ < 8)          ty_ = my + 14;
        if (ty_ + th > H - 8) ty_ = H - th - 8;

        rr(tx_, ty_, tw, th, 6, P.surf2, P.purple + 'cc', 2);

        ctx.font = '700 14px "JetBrains Mono",monospace';
        ctx.fillStyle = P.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(title, tx_ + pad, ty_ + titleH / 2);

        if (descLines.length > 0) {
            ctx.font = '400 13px "JetBrains Mono",monospace';
            ctx.fillStyle = P.sub;
            descLines.forEach((l, i) => {
                ctx.fillText(l, tx_ + pad, ty_ + titleH + 5 + i * lineH + lineH / 2);
            });
        }
    }

    /* ===================== 패킷 경로 구성 ===================== */
    function buildPath(arr, L) {
        const busYMap = {
            addr: L.addrTop + L.busH / 2,
            data: L.dataTop + L.busH / 2,
            ctrl: L.ctrlTop + L.busH / 2,
        };
        const by = busYMap[arr.via];

        if (arr.from === 'io' && arr.to === 'arb') {
            const ax   = L.arbX + L.arbW / 2;
            const ctrlMidY = L.ctrlTop + L.busH / 2;
            return [
                { x: L.ioX,  y: L.ioY + L.nh / 2 },
                { x: ax,     y: L.ioY + L.nh / 2 },
                { x: ax,     y: ctrlMidY           },
                { x: ax,     y: L.arbY             },
            ];
        }
        if (arr.from === 'arb' && arr.to === 'io') {
            const ax   = L.arbX + L.arbW / 2;
            const ctrlMidY = L.ctrlTop + L.busH / 2;
            return [
                { x: ax,     y: L.arbY + L.arbH    },
                { x: ax,     y: ctrlMidY            },
                { x: ax,     y: L.ioY + L.nh / 2   },
                { x: L.ioX,  y: L.ioY + L.nh / 2  },
            ];
        }

        const fromLeft = arr.from === 'cpu';
        const toLeft   = arr.to   === 'cpu';

        let sx, sy, ex2, ey2;
        if (arr.from === 'cpu')      { sx = L.cpuX + L.nw; sy = L.cpuY + L.nh / 2; }
        else if (arr.from === 'mem') { sx = L.memX;         sy = L.memY + L.nh / 2; }
        else                         { sx = L.ioX;          sy = L.ioY  + L.nh / 2; }

        if (arr.to === 'cpu')        { ex2 = L.cpuX + L.nw; ey2 = L.cpuY + L.nh / 2; }
        else if (arr.to === 'mem')   { ex2 = L.memX;         ey2 = L.memY + L.nh / 2; }
        else                         { ex2 = L.ioX;          ey2 = L.ioY  + L.nh / 2; }

        const entX = fromLeft ? L.busLeft  : L.busRight;
        const extX = toLeft   ? L.busLeft  : L.busRight;

        return [
            { x: sx,   y: sy  },
            { x: entX, y: sy  },
            { x: entX, y: by  },
            { x: extX, y: by  },
            { x: extX, y: ey2 },
            { x: ex2,  y: ey2 },
        ];
    }

    function pathTotalLen(path) {
        let len = 0;
        for (let i = 1; i < path.length; i++) {
            const dx = path[i].x - path[i-1].x;
            const dy = path[i].y - path[i-1].y;
            len += Math.sqrt(dx * dx + dy * dy);
        }
        return len;
    }

    function pathPoint(path, t) {
        const total = pathTotalLen(path);
        let target  = total * t;
        for (let i = 1; i < path.length; i++) {
            const dx  = path[i].x - path[i-1].x;
            const dy  = path[i].y - path[i-1].y;
            const seg = Math.sqrt(dx * dx + dy * dy);
            if (target <= seg || i === path.length - 1) {
                const r = seg > 0 ? target / seg : 0;
                return { x: path[i-1].x + dx * r, y: path[i-1].y + dy * r };
            }
            target -= seg;
        }
        return path[path.length - 1];
    }

    function drawPacketOnPath() {
        if (!pktCurrent) return;
        const pt = pathPoint(pktCurrent.path, pktProg);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 11, 0, Math.PI * 2);
        ctx.fillStyle = pktCurrent.col;
        ctx.fill();
        tx(pktCurrent.lbl, pt.x, pt.y, GW() < 520 ? 7 : 8, '#0f0f1a', 'center', true);
    }

    function spawnPkt(arr, col, lbl, L) {
        pktQueue.push({ path: buildPath(arr, L), col, lbl });
    }

    function pktNext() {
        if (!pktQueue.length) {
            pktCurrent = null;
            draw();
            if (pktDone) { const cb = pktDone; pktDone = null; cb(); }
            return;
        }
        pktCurrent = pktQueue.shift();
        pktProg = 0;
        if (rafId) cancelAnimationFrame(rafId);
        const BASE_SPEED  = 1100;
        const baseStep    = 0.0035;
        const step        = baseStep * (BASE_SPEED / speed);
        (function tick() {
            pktProg = Math.min(1, pktProg + step);
            draw();
            if (pktProg < 1) rafId = requestAnimationFrame(tick);
            else pktNext();
        })();
    }

    function animPkts(cb) { pktDone = cb || null; pktNext(); }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        const W = GW(), H = GH();
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = P.bg;
        ctx.fillRect(0, 0, W, H);
        tooltipHits = [];

        const L = buildLayout();
        drawConnectors(L);
        drawBuses(L);
        drawActiveArrows(L);
        drawNodes(L);
        drawArbiter(L);
        drawPacketOnPath();

        if (hoveredKey && TOOLTIPS[hoveredKey]) drawTooltip(mousePos.x, mousePos.y, hoveredKey);
    }

    /* ===================== 스텝 적용 ===================== */
    function applyStep(idx, onDone) {
        stepIdx = idx;
        const step = STEPS[idx];
        setBadge(step.badge);
        setLog(step.log);
        pktQueue = [];

        const busColMap = { addr: P.purple, data: P.green, ctrl: P.teal };
        const lblMap    = { addr: 'ADDR', data: 'DATA', ctrl: 'CTRL' };
        const multiCols = [P.teal, P.green];
        const multiLbls = ['BG', 'DMA'];

        const L = buildLayout();
        step.arrows.forEach((arr, i) => {
            const col = step.arrows.length > 1 ? multiCols[i] : busColMap[arr.via];
            const lbl = step.arrows.length > 1 ? multiLbls[i] : lblMap[arr.via];
            spawnPkt(arr, col, lbl, L);
        });

        animPkts(() => {
            draw();
            if (onDone) setTimeout(onDone, 0);
        });
    }

    /* ===================== 컨트롤 ===================== */
    function bvStart() {
        if (running) return;
        running = true;
        btnPlay.disabled = true;
        btnStep.disabled = true;
        setSpeedDisabled(true);
        function tick() {
            const next = stepIdx + 1;
            if (next >= STEPS.length) {
                running = false;
                setSpeedDisabled(false);
                return;
            }
            applyStep(next, () => {
                if (next === STEPS.length - 1) {
                    running = false;
                    btnPlay.disabled = true;
                    btnStep.disabled = true;
                    setSpeedDisabled(false);
                } else {
                    timer = setTimeout(tick, speed);
                }
            });
        }
        tick();
    }

    function bvStep() {
        if (running) return;
        const next = stepIdx + 1;
        if (next >= STEPS.length) return;
        applyStep(next, null);
        if (next === STEPS.length - 1) {
            btnPlay.disabled = true;
            btnStep.disabled = true;
        }
    }

    function bvReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running    = false;
        stepIdx    = -1;
        pktQueue   = [];
        pktCurrent = null;
        pktProg    = 0;
        pktDone    = null;
        setLog('▶ PLAY를 눌러 버스 동작을 확인하세요.');
        setBadge('IDLE');
        btnPlay.disabled = false;
        btnStep.disabled = false;
        setSpeedDisabled(false);
        draw();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.bus-viz__speed-btn').forEach(b => b.classList.remove('bus-viz__speed-btn--active'));
        btn.classList.add('bus-viz__speed-btn--active');
    }

    /* ===================== 상태 텍스트 ===================== */
    function setLog(str)   { logEl.textContent = str; }
    function setBadge(str) {
        badge.textContent = str;
        badge.className = 'bus-viz__step-badge' + (str !== 'IDLE' ? ' bus-viz__step-badge--active' : '');
    }
    function setSpeedDisabled(v) {
        root.querySelectorAll('.bus-viz__speed-btn').forEach(b => { b.disabled = v; });
    }

    /* ===================== 라이프사이클 ===================== */
    window.CsFlow.createVizLifecycle({
        canvas    : canvas,
        canvasWrap: canvasWrap,
        resize    : resize,
        draw      : draw,
        getState  : () => ({ rafId, timer, running }),
        setState  : s  => { rafId = s.rafId; timer = s.timer; running = s.running; },
        onPause   : () => setSpeedDisabled(false),
        getMouseCtx: () => ({
            GW,
            GH,
            mousePos,
            tooltipHits,
            hoveredKey   : () => hoveredKey,
            setHoveredKey: k  => { hoveredKey = k; },
            draw,
        }),
    });

    /* ===================== 초기화 ===================== */
    setTimeout(resize, 60);
})();