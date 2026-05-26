/**
 * 프로세스 상태 전이 인터랙티브 시각화
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

    const root    = el('div', 'proc-viz');
    const toolbar = el('div', 'proc-viz__toolbar');
    const tbLeft  = el('div', 'proc-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'proc-viz__title', 'Process State'));
    const badge = el('span', 'proc-viz__step-badge', 'IDLE');
    tbLeft.appendChild(badge);
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'proc-viz__speed');
    speedWrap.appendChild(el('span', 'proc-viz__speed-label', 'SPEED'));
    [['1x', 1800], ['2x', 900], ['3x', 600]].forEach(function (pair, i) {
        const lbl = pair[0], ms = pair[1];
        const b = el('button', 'proc-viz__speed-btn' + (i === 0 ? ' proc-viz__speed-btn--active' : ''), lbl);
        b.addEventListener('click', function () { if (!running) setSpeed(ms, b); });
        speedWrap.appendChild(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'proc-viz__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'proc-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const logEl = el('div', 'proc-viz__log', '▶ PLAY를 눌러 프로세스 상태 전이 과정을 확인하세요.');
    root.appendChild(logEl);

    const controls = el('div', 'proc-viz__controls');
    const btnPlay  = el('button', 'proc-viz__btn proc-viz__btn--primary', '▶ PLAY');
    const btnStep  = el('button', 'proc-viz__btn', '▶| STEP');
    const btnReset = el('button', 'proc-viz__btn', '↺ RESET');
    btnPlay.addEventListener('click',  procStart);
    btnStep.addEventListener('click',  procStep);
    btnReset.addEventListener('click', procReset);
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
        const minH = mob ? 480 : 440;
        const h    = Math.max(canvasWrap.offsetHeight, minH);
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    /* ===================== 팔레트 ===================== */
    let P = window.CsFlow.getP();

    /* ===================== 약어 툴팁 ===================== */
    const TOOLTIPS = {
        NEW:        'New (생성)\nfork() 호출 등으로 프로세스가 처음 만들어진 상태. OS가 PCB를 초기화합니다.',
        READY:      'Ready (준비)\nCPU 할당만 기다리는 상태. Ready Queue에서 스케줄러를 대기합니다.',
        RUNNING:    'Running (실행)\n실제로 CPU를 점유해 명령어를 실행하는 상태. 단일 코어에서는 프로세스 하나만 이 상태입니다.',
        WAITING:    'Waiting / Blocked (대기)\nI/O 완료·세마포어 등 외부 이벤트를 기다리는 상태. CPU를 줘도 실행할 수 없습니다.',
        TERMINATED: 'Terminated (종료)\n실행이 끝난 상태. PCB는 부모가 wait()를 호출할 때까지 남아 있어 좀비가 됩니다.',
    };

    /* ===================== 시나리오 정의 ===================== */
    const STEPS = [
        {
            badge:  'NEW → READY',
            from:   'NEW',
            to:     'READY',
            log:    'Step 1 — fork()로 프로세스가 생성(New)되고, OS가 PCB를 초기화합니다. 메모리 할당이 완료되면 Ready Queue에 삽입되어 Ready 상태로 전이합니다.',
            pcb:    { pid: '1024', state: 'READY', pc: '0x0040', priority: '20', cpu: '0ms' },
        },
        {
            badge:  'READY → RUNNING',
            from:   'READY',
            to:     'RUNNING',
            log:    'Step 2 — CPU 스케줄러가 Ready Queue에서 이 프로세스를 선택하고, 디스패처가 컨텍스트 스위칭을 수행해 CPU를 넘겨줍니다. 프로세스는 Running 상태로 전이합니다.',
            pcb:    { pid: '1024', state: 'RUNNING', pc: '0x0048', priority: '20', cpu: '12ms' },
        },
        {
            badge:  'RUNNING → WAITING',
            from:   'RUNNING',
            to:     'WAITING',
            log:    'Step 3 — 프로세스가 디스크 I/O를 요청(read() 시스템 콜)합니다. I/O가 완료될 때까지 CPU를 반납하고 Waiting(Blocked) 상태로 전이합니다.',
            pcb:    { pid: '1024', state: 'WAITING', pc: '0x0060', priority: '20', cpu: '12ms' },
        },
        {
            badge:  'WAITING → READY',
            from:   'WAITING',
            to:     'READY',
            log:    'Step 4 — 디스크 I/O가 완료되어 인터럽트가 발생합니다. OS가 해당 프로세스를 Waiting에서 Ready Queue로 이동시킵니다. CPU 할당을 다시 기다립니다.',
            pcb:    { pid: '1024', state: 'READY', pc: '0x0060', priority: '20', cpu: '12ms' },
        },
        {
            badge:  'RUNNING → READY',
            from:   'RUNNING',
            to:     'READY',
            log:    'Step 5 — 타임 퀀텀(Time Quantum)이 만료되어 타이머 인터럽트가 발생합니다. OS가 선점(Preempt)하여 현재 프로세스를 Ready Queue로 되돌립니다.',
            pcb:    { pid: '1024', state: 'READY', pc: '0x0074', priority: '20', cpu: '24ms' },
        },
        {
            badge:  'RUNNING → TERMINATED',
            from:   'RUNNING',
            to:     'TERMINATED',
            log:    'Step 6 — 프로세스가 exit() 시스템 콜을 호출하거나 main()에서 반환합니다. OS가 할당된 자원을 해제하고 부모 프로세스에 종료 신호를 보냅니다. PCB는 부모의 wait() 호출 전까지 잔류합니다.',
            pcb:    { pid: '1024', state: 'TERMINATED', pc: '0x00FF', priority: '-', cpu: '36ms' },
        },
    ];

    /* ===================== 상태 ===================== */
    let stepIdx    = -1;
    let running    = false;
    let timer      = null;
    let speed      = 1800;
    let activeFrom = null;
    let activeTo   = null;
    let currentPcb = null;

    let pktQueue   = [];
    let pktCurrent = null;
    let pktProg    = 0;
    let pktDone    = null;
    let rafId      = null;

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
        ctx.font = (bold ? '700' : '400') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    /* ===================== 화살표 (곡선) ===================== */
    function curvedArrow(x1, y1, x2, y2, col, active, cpOffset) {
        const dx = x2 - x1, dy = y2 - y1;
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 2) return;
        const nx = -dy / len, ny = dx / len;
        const off = cpOffset || 0;
        const cx = mx + nx * off, cy = my + ny * off;

        const shrink = 0.12;
        const ex = x2 - (x2 - cx) * shrink;
        const ey = y2 - (y2 - cy) * shrink;

        ctx.beginPath();
        ctx.moveTo(x1 + (cx - x1) * shrink, y1 + (cy - y1) * shrink);
        ctx.quadraticCurveTo(cx, cy, ex, ey);
        ctx.strokeStyle = active ? col : P.border;
        ctx.lineWidth   = active ? 2.2 : 1;
        ctx.setLineDash(active ? [] : [4, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        if (!active) return;
        const tang_x = ex - cx, tang_y = ey - cy;
        const tl = Math.sqrt(tang_x * tang_x + tang_y * tang_y);
        const ux = tang_x / tl, uy = tang_y / tl;
        const p = 5;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - ux * p * 2 - uy * p, ey - uy * p * 2 + ux * p);
        ctx.lineTo(ex - ux * p * 2 + uy * p, ey - uy * p * 2 - ux * p);
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();
    }

    /* ===================== 레이아웃 ===================== */
    function buildLayout() {
        const W = GW(), H = GH();
        const mob = W < 520;

        const nw = mob ? 72  : 108;
        const nh = mob ? 44  : 62;
        const r  = 8;

        let nodes, pcbArea;

        if (mob) {
            const pcbH  = 70;
            const pcbGap = 8;
            const nodeH = H - pcbH - pcbGap - 8;

            const colW  = (W - 24) / 2;
            const colX0 = 8, colX1 = colX0 + colW + 8;
            const rowH  = (nodeH - 8 - nh * 3) / 2;
            const y0    = 8;
            const y1    = y0 + nh + Math.max(10, rowH);
            const y2    = y1 + nh + Math.max(10, rowH);
            const cx0   = colX0 + (colW - nw) / 2;
            const cx1   = colX1 + (colW - nw) / 2;

            nodes = {
                NEW:        { x: cx0,  y: y0, w: nw, h: nh, col: P.teal,   lbl: 'NEW',    sub: '생성' },
                READY:      { x: cx1,  y: y0, w: nw, h: nh, col: P.purple, lbl: 'READY',  sub: '준비' },
                RUNNING:    { x: cx0,  y: y1, w: nw, h: nh, col: P.green,  lbl: 'RUNNING',sub: '실행' },
                WAITING:    { x: cx1,  y: y1, w: nw, h: nh, col: P.orange, lbl: 'WAITING',sub: '대기' },
                TERMINATED: { x: cx0 + (colW / 2) - nw / 2, y: y2, w: nw, h: nh, col: P.red, lbl: 'TERM', sub: '종료' },
            };
            pcbArea = null;
        } else {
            const pcbW  = 220;
            const pcbMg = 20;
            const drawW = W - pcbW - pcbMg - 16;
            const col0  = 16;
            const gapX  = Math.max(20, (drawW - col0 - nw * 4) / 3);
            const midY  = (H * 0.38) - nh / 2;
            const waitY = midY + nh + Math.max(50, (H - midY - nh * 2 - 16) * 0.55);

            const x0 = col0;
            const x1 = col0 + nw + gapX;
            const x2 = col0 + (nw + gapX) * 2;
            const x3 = col0 + (nw + gapX) * 3;

            nodes = {
                NEW:        { x: x0, y: midY,  w: nw, h: nh, col: P.teal,   lbl: 'NEW',        sub: '생성' },
                READY:      { x: x1, y: midY,  w: nw, h: nh, col: P.purple, lbl: 'READY',      sub: '준비' },
                RUNNING:    { x: x2, y: midY,  w: nw, h: nh, col: P.green,  lbl: 'RUNNING',    sub: '실행' },
                TERMINATED: { x: x3, y: midY,  w: nw, h: nh, col: P.red,    lbl: 'TERMINATED', sub: '종료' },
                WAITING:    { x: x2, y: waitY, w: nw, h: nh, col: P.orange, lbl: 'WAITING',    sub: '대기 / Blocked' },
            };
            pcbArea = { x: W - pcbW - pcbMg, y: 16, w: pcbW, h: H - 32 };
        }

        return { W, H, mob, nw, nh, r, nodes, pcbArea };
    }

    function nc(n) { return { x: n.x + n.w / 2, y: n.y + n.h / 2 }; }

    /* ===================== 엣지 정의 ===================== */
    function getEdges() {
        return [
            { a: 'NEW',     b: 'READY',      off:  0,  bidir: false },
            { a: 'READY',   b: 'RUNNING',    off:  26, bidir: true  },
            { a: 'RUNNING', b: 'TERMINATED', off:  0,  bidir: false },
            { a: 'RUNNING', b: 'WAITING',    off:  30, bidir: false },
            { a: 'WAITING', b: 'READY',      off: -30, bidir: false },
        ];
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
        drawNodes(L);
        drawPcbPanel(L);
        drawPacket(L);

        if (hoveredKey && TOOLTIPS[hoveredKey]) drawTooltip(mousePos.x, mousePos.y, hoveredKey);
    }

    /* ===================== 연결선 ===================== */
    function drawEdges(L) {
        const { nodes, mob } = L;
        const edges = getEdges();
        const step  = stepIdx >= 0 ? STEPS[stepIdx] : null;

        edges.forEach(function (e) {
            const na = nodes[e.a], nb = nodes[e.b];
            if (!na || !nb) return;
            const ca = nc(na), cb = nc(nb);

            const fwdActive = step && step.from === e.a && step.to === e.b;
            const revActive = e.bidir && step && step.from === e.b && step.to === e.a;

            const fwdCol = step ? P.purple : P.border;
            const revCol = step ? P.orange : P.border;
            const offMob = mob ? e.off * 0.6 : e.off;

            curvedArrow(ca.x, ca.y, cb.x, cb.y, fwdCol, fwdActive, offMob);

            if (e.bidir) {
                curvedArrow(cb.x, cb.y, ca.x, ca.y, revCol, revActive, -offMob);
            }
        });
    }

    /* ===================== 노드 ===================== */
    function drawNodes(L) {
        const { nodes, mob } = L;
        const fMd = mob ? 11 : 14;
        const fSm = mob ? 8  : 10;

        Object.entries(nodes).forEach(function (entry) {
            const key = entry[0], n = entry[1];
            const isFrom = key === activeFrom;
            const isTo   = key === activeTo;
            const isAct  = isFrom || isTo;
            const isHov  = hoveredKey === key;
            const col    = n.col;

            rr(n.x, n.y, n.w, n.h, 8,
                isAct ? col + '28' : isHov ? P.purple + '18' : P.surf,
                isAct ? col : isHov ? P.purple : P.border,
                isAct ? 2.5 : isHov ? 2 : 1.5);

            const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
            tx(n.lbl, cx, cy - (mob ? 6 : 8), fMd, isAct ? col : isHov ? P.purple : P.text, 'center', true);
            tx(n.sub, cx, cy + (mob ? 7 : 10), fSm, P.muted, 'center', false);

            const qx = n.x + n.w - 9, qy = n.y + 9;
            ctx.beginPath();
            ctx.arc(qx, qy, 6, 0, Math.PI * 2);
            ctx.fillStyle   = isHov ? col : P.surf2; ctx.fill();
            ctx.strokeStyle = isHov ? col : P.muted; ctx.lineWidth = 1; ctx.stroke();
            tx('?', qx, qy, 7, isHov ? '#fff' : P.muted, 'center', true);
            tooltipHits.push({ x: qx - 6, y: qy - 6, w: 12, h: 12, key: key });
        });
    }

    /* ===================== PCB 패널 ===================== */
    function drawPcbPanel(L) {
        const { pcbArea, W, H, mob } = L;

        let px, py, pw, ph;
        if (mob) {
            pw = W - 16; ph = 70;
            px = 8; py = H - ph - 6;
        } else {
            if (!pcbArea) return;
            px = pcbArea.x; py = pcbArea.y;
            pw = pcbArea.w; ph = pcbArea.h;
        }

        rr(px, py, pw, ph, 8, P.surf2, P.purple + '55', 1.5);

        const fTitle = mob ? 10 : 12;
        const fVal   = mob ? 10 : 13;
        const fHead  = mob ? 11 : 13;

        tx('PCB', px + pw / 2, py + (mob ? 14 : 22), fHead, P.purple, 'center', true);
        if (!mob) {
            ctx.beginPath();
            ctx.moveTo(px + 14, py + 36); ctx.lineTo(px + pw - 14, py + 36);
            ctx.strokeStyle = P.purple + '44'; ctx.lineWidth = 1; ctx.stroke();
        }

        const pcb = currentPcb || { pid: '-', state: 'IDLE', pc: '-', priority: '-', cpu: '-' };
        const rows = [
            ['PID',      pcb.pid],
            ['State',    pcb.state],
            ['PC',       pcb.pc],
            ['Priority', pcb.priority],
            ['CPU Time', pcb.cpu],
        ];

        if (mob) {
            const itemW = pw / rows.length;
            rows.forEach(function (row, i) {
                const ix = px + itemW * i + itemW / 2;
                tx(row[0], ix, py + 28, fTitle, P.muted, 'center', false);
                const col = row[0] === 'State' ? stateColor(pcb.state) : P.text;
                tx(row[1], ix, py + 50, fVal, col, 'center', true);
            });
        } else {
            const startY = py + 54;
            const rowGap = Math.min(34, (ph - 66) / rows.length);
            rows.forEach(function (row, i) {
                const ry = startY + i * rowGap;
                tx(row[0], px + 18, ry, fTitle, P.muted, 'left', false);
                const col = row[0] === 'State' ? stateColor(pcb.state) : P.text;
                tx(row[1], px + pw - 18, ry, fVal, col, 'right', true);
            });
        }
    }

    function stateColor(s) {
        return s === 'RUNNING' ? P.green
             : s === 'READY'   ? P.purple
             : s === 'WAITING' ? P.orange
             : s === 'TERMINATED' ? P.red
             : P.teal;
    }

    /* ===================== 패킷 애니메이션 ===================== */
    function drawPacket(L) {
        if (!pktCurrent) return;
        const { nodes } = L;
        const fn = nodes[pktCurrent.from], tn = nodes[pktCurrent.to];
        if (!fn || !tn) return;
        const fc = nc(fn), tc = nc(tn);
        const x = fc.x + (tc.x - fc.x) * pktProg;
        const y = fc.y + (tc.y - fc.y) * pktProg;
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fillStyle = pktCurrent.col;
        ctx.fill();
        tx(pktCurrent.lbl, x, y, 7, '#0f0f1a', 'center', true);
    }

    function pktNext() {
        if (!pktQueue.length) {
            pktCurrent = null;
            draw();
            if (pktDone) { var cb = pktDone; pktDone = null; cb(); }
            return;
        }
        pktCurrent = pktQueue.shift();
        pktProg = 0;
        activeFrom = pktCurrent.from;
        activeTo   = pktCurrent.to;
        if (rafId) cancelAnimationFrame(rafId);
        const BASE_SPEED = 1800;
        const baseStep   = 0.014;
        const step       = baseStep * (BASE_SPEED / speed);
        (function tick() {
            pktProg = Math.min(1, pktProg + step);
            draw();
            if (pktProg < 1) { rafId = requestAnimationFrame(tick); }
            else { pktNext(); }
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
            if (ctx.measureText(test).width > maxW && cur) {
                lines.push(cur);
                cur = w;
            } else {
                cur = test;
            }
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

        const titleFont = '700 13px "JetBrains Mono",monospace';
        const descFont  = '400 12px "JetBrains Mono",monospace';

        ctx.font = titleFont;
        const titleW = ctx.measureText(title).width;

        const descLines = desc ? wrapText(desc, innerW, descFont) : [];
        const lineH  = 17;
        const titleH = 24;
        const th = desc ? titleH + descLines.length * lineH + 10 : 36;
        const tw = Math.min(Math.max(titleW, innerW) + pad * 2, maxTW);

        let tx_ = mx + 14, ty_ = my - th - 8;
        if (tx_ + tw > W - 8) tx_ = mx - tw - 14;
        if (tx_ < 8)          tx_ = 8;
        if (ty_ < 8)          ty_ = my + 14;
        if (ty_ + th > H - 8) ty_ = H - th - 8;

        rr(tx_, ty_, tw, th, 6, P.surf2, P.purple + 'cc', 2);

        ctx.font = titleFont;
        ctx.fillStyle = P.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(title, tx_ + pad, ty_ + (desc ? 14 : th / 2));

        if (descLines.length) {
            ctx.font = descFont;
            ctx.fillStyle = P.sub;
            descLines.forEach(function (line, i) {
                ctx.fillText(line, tx_ + pad, ty_ + titleH + i * lineH + 4);
            });
        }
    }

    /* ===================== 단계 제어 ===================== */
    function setLog(s)   { logEl.textContent = s; }
    function setBadge(s) {
        badge.textContent = s;
        badge.className = 'proc-viz__step-badge' + (s !== 'IDLE' ? ' proc-viz__step-badge--active' : '');
    }
    function setSpeedDis(v) {
        root.querySelectorAll('.proc-viz__speed-btn').forEach(function (b) { b.disabled = v; });
    }

    function applyStep(idx, onDone) {
        stepIdx    = idx;
        const step = STEPS[idx];
        setBadge(step.badge);
        setLog(step.log);
        currentPcb = step.pcb;
        activeFrom = null;
        activeTo   = null;
        pktQueue   = [];

        const col = step.from === 'RUNNING' && step.to === 'WAITING' ? P.orange
                  : step.to   === 'TERMINATED' ? P.red
                  : step.from === 'WAITING' ? P.teal
                  : P.purple;

        pktQueue.push({ from: step.from, to: step.to, col: col, lbl: '→' });

        animPkts(function () {
            activeFrom = step.from;
            activeTo   = step.to;
            draw();
            if (onDone) setTimeout(onDone, 0);
        });
    }

    /* ===================== 컨트롤 ===================== */
    function procStart() {
        if (running) return;
        running = true;
        btnPlay.disabled = true;
        btnStep.disabled = true;
        setSpeedDis(true);

        function tick() {
            var next = stepIdx + 1;
            if (next >= STEPS.length) {
                running = false;
                setSpeedDis(false);
                return;
            }
            applyStep(next, function () {
                if (next === STEPS.length - 1) {
                    running = false;
                    btnStep.disabled = true;
                    setSpeedDis(false);
                } else {
                    timer = setTimeout(tick, speed);
                }
            });
        }
        tick();
    }

    function procStep() {
        if (running) return;
        var next = stepIdx + 1;
        if (next >= STEPS.length) return;
        applyStep(next, null);
        if (next === STEPS.length - 1) {
            btnPlay.disabled = true;
            btnStep.disabled = true;
        }
    }

    function procReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running    = false;
        stepIdx    = -1;
        activeFrom = null;
        activeTo   = null;
        currentPcb = null;
        pktQueue   = [];
        pktCurrent = null;
        pktProg    = 0;
        pktDone    = null;
        setLog('▶ PLAY를 눌러 프로세스 상태 전이 과정을 확인하세요.');
        setBadge('IDLE');
        btnPlay.disabled = false;
        btnStep.disabled = false;
        setSpeedDis(false);
        draw();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.proc-viz__speed-btn').forEach(function (b) {
            b.classList.remove('proc-viz__speed-btn--active');
        });
        btn.classList.add('proc-viz__speed-btn--active');
    }

    /* ===================== 라이프사이클 ===================== */
    window.CsFlow.createVizLifecycle({
        canvas    : canvas,
        canvasWrap: canvasWrap,
        resize    : resize,
        draw      : draw,
        getState  : function () {
            return { rafId: rafId, timer: timer, running: running };
        },
        setState  : function (s) {
            rafId   = s.rafId;
            timer   = s.timer;
            running = s.running;
        },
        onPause   : function () { setSpeedDis(false); },
        getMouseCtx: function () {
            return {
                GW          : GW,
                GH          : GH,
                mousePos    : mousePos,
                tooltipHits : tooltipHits,
                hoveredKey  : function ()  { return hoveredKey; },
                setHoveredKey: function (k) { hoveredKey = k; },
                draw        : draw,
            };
        },
    });

    /* ===================== 초기화 ===================== */
    setTimeout(resize, 60);
})();