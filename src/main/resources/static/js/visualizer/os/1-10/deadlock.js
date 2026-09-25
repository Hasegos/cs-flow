/**
 * 교착 상태 시각화
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

    const root    = el('div', 'dl-viz');
    const toolbar = el('div', 'dl-viz__toolbar');
    const tbLeft  = el('div', 'dl-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'dl-viz__title', 'Deadlock'));
    const badge = el('span', 'dl-viz__step-badge', 'IDLE');
    tbLeft.appendChild(badge);
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'dl-viz__speed');
    speedWrap.appendChild(el('span', 'dl-viz__speed-label', 'SPEED'));
    [['1x', 1800], ['2x', 900], ['3x', 600]].forEach(function (pair, i) {
        const b = el('button', 'dl-viz__speed-btn' + (i === 0 ? ' dl-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'dl-viz__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'dl-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const logEl = el('div', 'dl-viz__log', '▶ PLAY를 눌러 교착 상태 발생 과정을 확인하세요.');
    root.appendChild(logEl);

    const controls = el('div', 'dl-viz__controls');
    const btnPlay  = el('button', 'dl-viz__btn dl-viz__btn--primary', '▶ PLAY');
    const btnStep  = el('button', 'dl-viz__btn', '▶| STEP');
    const btnReset = el('button', 'dl-viz__btn', '↺ RESET');
    btnPlay.addEventListener('click',  dlStart);
    btnStep.addEventListener('click',  dlStep);
    btnReset.addEventListener('click', dlReset);
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

    const MOB_PANEL_H = 104;

    function resize() {
        const w   = canvasWrap.offsetWidth;
        const mob = w < 520;
        const minH = mob ? 460 : 460;
        const h    = Math.max(canvasWrap.offsetHeight, minH);
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        if (mob) canvasWrap.style.minHeight = minH + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    let P = window.CsFlow.getP();

    /* ===================== 시나리오 ===================== */
    const STEPS = [
        {
            badge: '초기 상태',
            log:   'Step 1 — P1·P2 두 프로세스, R1·R2 두 자원이 있습니다. 아직 어떤 자원도 할당되지 않았습니다. 자원 할당 그래프(RAG)에 간선이 없습니다.',
            alloc: {}, request: {}, cycle: false, resolved: false, conditions: [],
        },
        {
            badge: 'P1: R1 획득',
            log:   'Step 2 — P1이 R1을 획득합니다. R1→P1 할당 간선이 생깁니다. 【조건 1: 상호 배제】 R1은 P1만 사용할 수 있습니다.',
            alloc: { R1: 'P1' }, request: {}, cycle: false, resolved: false,
            conditions: ['상호 배제'],
            animEdge: { type: 'alloc', from: 'R1', to: 'P1' },
        },
        {
            badge: 'P2: R2 획득',
            log:   'Step 3 — P2가 R2를 획득합니다. R2→P2 할당 간선 추가. 【조건 2: 점유와 대기】 각 프로세스가 자원을 보유한 채 추가 자원을 요청할 준비가 됩니다.',
            alloc: { R1: 'P1', R2: 'P2' }, request: {}, cycle: false, resolved: false,
            conditions: ['상호 배제', '점유와 대기'],
            animEdge: { type: 'alloc', from: 'R2', to: 'P2' },
        },
        {
            badge: 'P1: R2 요청 → 대기',
            log:   'Step 4 — P1이 R2를 추가 요청합니다. R2는 P2가 보유 중이므로 P1은 대기합니다. P1→R2 요청 간선(점선) 추가. 【조건 3: 비선점】 P2가 자발적으로 반납 전까지 R2를 빼앗을 수 없습니다.',
            alloc: { R1: 'P1', R2: 'P2' }, request: { P1: 'R2' }, cycle: false, resolved: false,
            conditions: ['상호 배제', '점유와 대기', '비선점'],
            animEdge: { type: 'req', from: 'P1', to: 'R2' },
        },
        {
            badge: 'P2: R1 요청 → 대기',
            log:   'Step 5 — P2도 R1을 추가 요청합니다. R1은 P1이 보유 중이므로 P2도 대기합니다. P2→R1 요청 간선 추가. 【조건 4: 순환 대기】 P1→R2→P2→R1→P1 사이클이 형성됩니다!',
            alloc: { R1: 'P1', R2: 'P2' }, request: { P1: 'R2', P2: 'R1' }, cycle: false, resolved: false,
            conditions: ['상호 배제', '점유와 대기', '비선점', '순환 대기'],
            animEdge: { type: 'req', from: 'P2', to: 'R1' },
        },
        {
            badge: '교착 상태 발생! ⚠',
            log:   'Step 6 — 교착 상태! 4조건이 모두 성립했습니다. P1은 R2를, P2는 R1을 기다리며 영원히 진행되지 못합니다. 사이클이 존재합니다.',
            alloc: { R1: 'P1', R2: 'P2' }, request: { P1: 'R2', P2: 'R1' }, cycle: true, resolved: false,
            conditions: ['상호 배제', '점유와 대기', '비선점', '순환 대기'],
        },
        {
            badge: '해결: Lock 순서 통일',
            log:   'Step 7 — 순환 대기 조건을 제거합니다. 모든 프로세스가 자원을 R1→R2 오름차순으로만 요청하도록 강제합니다. P1은 R1을 보유한 채 R2를 요청하고, P2는 R1부터 요청하며 대기합니다. R2가 비어 있어 P1이 완료·반납하면 P2가 진행되어 사이클이 형성되지 않습니다. 교착 상태 예방 ✓',
            alloc: { R1: 'P1' }, request: { P1: 'R2', P2: 'R1' }, cycle: false, resolved: true,
            conditions: ['상호 배제', '점유와 대기', '비선점'],
            resolveNote: 'R1 → R2 순서 통일',
        },
    ];

    /* ===================== 상태 변수 ===================== */
    let stepIdx    = -1;
    let running    = false;
    let timer      = null;
    let rafId      = null;
    let speed      = 1800;
    let edgeAnim   = null;
    let cycleAlpha = 1;
    let cycleDir   = -1;
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

    function arrowHead(x2, y2, ux, uy, col, size) {
        const p = size || 8;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - ux*p*2 - uy*p, y2 - uy*p*2 + ux*p);
        ctx.lineTo(x2 - ux*p*2 + uy*p, y2 - uy*p*2 - ux*p);
        ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
    }

    /* ===================== 레이아웃 ===================== */
    function buildLayout() {
        const W = GW(), H = GH();
        const mob = W < 520;
        const fMd = mob ? 15 : 18;
        const fSm = mob ? 12 : 14;

        const pR = mob ? 42  : 56;
        const rW = mob ? 72  : 90;
        const rH = mob ? 50  : 62;

        const panelW = mob ? 0   : 240;
        const panelH = mob ? MOB_PANEL_H : 0;

        const graphW = W - (mob ? 0   : panelW + 24);
        const graphH = H - (mob ? panelH + 12 : 0);

        const cx = mob ? W / 2 : graphW / 2;
        const cy = mob ? graphH * 0.46 : H * 0.50;

        const dx = mob ? Math.round(W * 0.31)    : Math.round(graphW * 0.30);
        const dy = mob ? Math.round(graphH * 0.26) : Math.round(H * 0.24);

        return {
            W, H, mob, fMd, fSm, pR, rW, rH, cx, cy, panelW, panelH,
            nodes: {
                P1: { x: cx - dx, y: cy - dy, r: pR, type: 'proc', col: P.teal,   lbl: 'P1' },
                P2: { x: cx + dx, y: cy + dy, r: pR, type: 'proc', col: P.purple, lbl: 'P2' },
                R1: { x: cx - dx, y: cy + dy, type: 'res', col: P.orange, lbl: 'R1', w: rW, h: rH },
                R2: { x: cx + dx, y: cy - dy, type: 'res', col: P.green,  lbl: 'R2', w: rW, h: rH },
            },
        };
    }

    function edgePoint(n, tx_, ty_, offset) {
        const off = offset || 0;
        const dx = tx_ - n.x, dy = ty_ - n.y;
        const len = Math.sqrt(dx*dx + dy*dy);
        if (len < 0.001) return { x: n.x, y: n.y };
        const ux = dx/len, uy = dy/len;
        if (n.type === 'proc') {
            const r = n.r + off;
            return { x: n.x + ux*r, y: n.y + uy*r };
        }
        const hw = n.w/2 + off, hh = n.h/2 + off;
        const tx2 = Math.abs(ux) < 0.001 ? Infinity : hw / Math.abs(ux);
        const ty2 = Math.abs(uy) < 0.001 ? Infinity : hh / Math.abs(uy);
        const t   = Math.min(tx2, ty2);
        return { x: n.x + ux*t, y: n.y + uy*t };
    }

    /* ===================== 4조건 패널 ===================== */
    function drawConditions(L, step) {
        const { W, H, mob, fSm, panelW, panelH } = L;
        const conds  = ['상호 배제', '점유와 대기', '비선점', '순환 대기'];
        const active = step.conditions || [];
        const allFour = active.length === 4 && !step.resolved;

        if (mob) {
            const titleH   = 24;
            const panelTop = H - panelH;

            rr(4, panelTop, W - 8, panelH - 2, 6, P.surf, P.border, 1);

            tx('Deadlock 4조건', W / 2, panelTop + titleH / 2, fSm - 1, P.muted, 'center', true);

            ctx.beginPath();
            ctx.moveTo(14, panelTop + titleH);
            ctx.lineTo(W - 14, panelTop + titleH);
            ctx.strokeStyle = P.border; ctx.lineWidth = 1; ctx.stroke();

            const gridTop = panelTop + titleH + 2;
            const gridH   = panelH - titleH - 6;
            const col0X   = 8;
            const col1X   = Math.round(W / 2) + 4;
            const iH      = Math.round(gridH / 2);

            conds.forEach(function (c, i) {
                const on  = active.indexOf(c) !== -1;
                const col = allFour ? P.red : on ? P.green : P.muted;
                const ix  = i % 2 === 0 ? col0X + 10 : col1X + 10;
                const iy  = gridTop + Math.floor(i / 2) * iH + iH / 2;

                ctx.beginPath(); ctx.arc(ix - 6, iy, 4, 0, Math.PI*2);
                ctx.fillStyle = col; ctx.fill();
                tx((on ? '✓ ' : '○ ') + c, ix, iy, fSm - 1, col, 'left', on);
            });
        } else {
            const px     = W - panelW - 12;
            const py     = Math.round(H * 0.08);
            const itemH  = 34;
            const pH     = conds.length * itemH + 44;

            rr(px, py, panelW, pH, 8, P.surf, P.border, 1.5);
            tx('Deadlock 4조건', px + panelW/2, py + 22, fSm, P.muted, 'center', true);

            ctx.beginPath();
            ctx.moveTo(px + 14, py + 38); ctx.lineTo(px + panelW - 14, py + 38);
            ctx.strokeStyle = P.border; ctx.lineWidth = 1; ctx.stroke();

            conds.forEach(function (c, i) {
                const on  = active.indexOf(c) !== -1;
                const col = allFour ? P.red : on ? P.green : P.muted;
                const iy  = py + 44 + i * itemH + itemH / 2;

                ctx.beginPath(); ctx.arc(px + 22, iy, 6, 0, Math.PI*2);
                ctx.fillStyle = col; ctx.fill();
                tx((on ? '✓ ' : '○ ') + c, px + 36, iy, fSm, col, 'left', on);
            });
        }
    }

    /* ===================== 간선 ===================== */
    function drawArrowEdge(fx, fy, tx_, ty_, col, lw, prog, dashed) {
        const ex = fx + (tx_ - fx) * (prog !== undefined ? prog : 1);
        const ey = fy + (ty_ - fy) * (prog !== undefined ? prog : 1);
        ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(ex, ey);
        ctx.strokeStyle = col; ctx.lineWidth = lw || 2;
        if (dashed) ctx.setLineDash([6, 5]);
        ctx.stroke(); ctx.setLineDash([]);
        if (prog === undefined || prog >= 0.95) {
            const dx = tx_ - fx, dy = ty_ - fy, len = Math.sqrt(dx*dx+dy*dy);
            if (len > 2) arrowHead(ex, ey, dx/len, dy/len, col, 8);
        }
    }

    function drawEdges(L, step) {
        const { nodes } = L;
        const alloc   = step.alloc   || {};
        const request = step.request || {};

        Object.keys(alloc).forEach(function (res) {
            const proc = alloc[res];
            const rn = nodes[res], pn = nodes[proc];
            if (!rn || !pn) return;
            const isAnim = edgeAnim && edgeAnim.type==='alloc' && edgeAnim.from===res && edgeAnim.to===proc;
            const prog   = isAnim ? edgeAnim.prog : undefined;
            const col    = step.cycle ? P.red : rn.col;
            const fp = edgePoint(rn, pn.x, pn.y, 2);
            const tp = edgePoint(pn, rn.x, rn.y, 2);
            drawArrowEdge(fp.x, fp.y, tp.x, tp.y, col, step.cycle?3:2, prog, false);
        });

        Object.keys(request).forEach(function (proc) {
            const res = request[proc];
            const pn = nodes[proc], rn = nodes[res];
            if (!pn || !rn) return;
            const isAnim = edgeAnim && edgeAnim.type==='req' && edgeAnim.from===proc && edgeAnim.to===res;
            const prog   = isAnim ? edgeAnim.prog : undefined;
            const col    = step.cycle ? P.red : pn.col;
            const fp = edgePoint(pn, rn.x, rn.y, 2);
            const tp = edgePoint(rn, pn.x, pn.y, 2);
            drawArrowEdge(fp.x, fp.y, tp.x, tp.y, col, step.cycle?3:2, prog, !step.cycle);
        });
    }

    /* ===================== 노드 ===================== */
    function drawNodes(L, step) {
        const { nodes, fMd, fSm, mob, cx } = L;
        const alloc   = step.alloc   || {};
        const request = step.request || {};
        const lblGap  = mob ? 10 : 12;

        Object.keys(nodes).forEach(function (key) {
            const n      = nodes[key];
            const isHov  = hoveredKey === key;
            const onLeft = n.x < cx;

            if (n.type === 'proc') {
                const inCycle = step.cycle;
                const col     = inCycle ? P.red : n.col;
                const pulse   = inCycle ? 0.22 + 0.12 * cycleAlpha : 0.18;

                ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI*2);
                ctx.fillStyle = col + Math.round(pulse*255).toString(16).padStart(2,'0');
                ctx.fill();
                ctx.strokeStyle = isHov ? P.purple : col;
                ctx.lineWidth   = inCycle ? 3.5 : isHov ? 2.5 : 2;
                ctx.stroke();
                tx(n.lbl, n.x, n.y, fMd, inCycle ? P.red : P.text, 'center', true);

                const held    = Object.keys(alloc).filter(function(r){ return alloc[r]===key; });
                const waiting = request[key];
                const lx     = mob
                    ? (onLeft ? n.x + n.r + lblGap : n.x - n.r - lblGap)
                    : (onLeft ? n.x - n.r - lblGap : n.x + n.r + lblGap);
                const lalign = mob
                    ? (onLeft ? 'left'  : 'right')
                    : (onLeft ? 'right' : 'left');

                if (held.length) {
                    tx('보유: '+held.join(','), lx, n.y + (waiting ? 10 : 0),
                       fSm - 1, P.muted, lalign, false);
                }
                if (waiting) {
                    const wCol = inCycle ? P.red : P.yellow;
                    tx('대기: '+waiting, lx, n.y - (held.length ? 10 : 0),
                       fSm - 1, wCol, lalign, false);
                }

                const qx = n.x + Math.round(n.r * 0.68);
                const qy = n.y - Math.round(n.r * 0.68);
                ctx.beginPath(); ctx.arc(qx, qy, 7, 0, Math.PI*2);
                ctx.fillStyle   = isHov ? col : P.surf2; ctx.fill();
                ctx.strokeStyle = isHov ? col : P.muted; ctx.lineWidth=1; ctx.stroke();
                tx('?', qx, qy, 8, isHov?'#fff':P.muted, 'center', true);
                tooltipHits.push({ x: qx-7, y: qy-7, w: 14, h: 14, key });

            } else {
                const inCycle = step.cycle;
                const col     = inCycle ? P.red : n.col;
                const cx_     = n.x - n.w/2;
                const cy_     = n.y - n.h/2;

                rr(cx_, cy_, n.w, n.h, 8,
                   col + '22', isHov ? P.purple : col, inCycle ? 3 : 2);
                tx(n.lbl, n.x, n.y - (mob?4:5), fMd, inCycle ? P.red : P.text, 'center', true);

                const who = alloc[key];
                ctx.beginPath(); ctx.arc(n.x, n.y + (mob?12:14), 5, 0, Math.PI*2);
                ctx.fillStyle = who ? (inCycle ? P.red : col) : P.surf2; ctx.fill();
                ctx.strokeStyle = who ? (inCycle ? P.red : col) : P.border;
                ctx.lineWidth=1.5; ctx.stroke();

                const qx = n.x + n.w/2 - 10;
                const qy = n.y - n.h/2 + 10;
                ctx.beginPath(); ctx.arc(qx, qy, 7, 0, Math.PI*2);
                ctx.fillStyle   = isHov ? col : P.surf2; ctx.fill();
                ctx.strokeStyle = isHov ? col : P.muted; ctx.lineWidth=1; ctx.stroke();
                tx('?', qx, qy, 8, isHov?'#fff':P.muted, 'center', true);
                tooltipHits.push({ x: qx-7, y: qy-7, w: 14, h: 14, key });
            }
        });
    }

    /* ===================== 사이클 라벨 ===================== */
    function drawCycleLabel(L) {
        const { cx, cy, mob } = L;
        ctx.globalAlpha = 0.7 + 0.3 * cycleAlpha;
        tx('⚠ 교착 상태 — 사이클 검출', cx, cy, mob ? 13 : 16, P.red, 'center', true);
        ctx.globalAlpha = 1;
    }

    /* ===================== 해결 라벨 ===================== */
    function drawResolvedLabel(L, step) {
        const { W, H, mob, panelH, nodes } = L;
        const note = step.resolveNote || '';
        const bW   = mob ? W - 24 : 340;
        const bH   = 48;
        const bX   = Math.round((W - bW) / 2);
        const bY   = mob
            ? H - panelH - bH - 12
            : nodes.P2.y + nodes.P2.r + 14;
        rr(bX, bY, bW, bH, 6, P.green+'18', P.green, 2);
        tx('✓ 순환 대기 조건 제거 — 교착 상태 예방', bX+bW/2, bY+bH*0.38, mob?11:13, P.green, 'center', true);
        if (note) tx(note, bX+bW/2, bY+bH*0.72, mob?10:12, P.sub, 'center', false);
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        ctx.fillStyle = P.bg;
        ctx.fillRect(0, 0, GW(), GH());
        tooltipHits = [];

        const L    = buildLayout();
        const step = stepIdx >= 0 ? STEPS[stepIdx] : STEPS[0];

        drawConditions(L, step);
        drawEdges(L, step);
        drawNodes(L, step);
        if (step.cycle)    drawCycleLabel(L);
        if (step.resolved) drawResolvedLabel(L, step);
        if (hoveredKey)    drawTooltip(L);
    }

    /* ===================== 툴팁 ===================== */
    const TIPS = {
        P1: 'Process 1\n자원 R1을 보유하고 R2를 요청하는 프로세스입니다. 교착 상태에서 R2가 해제될 때까지 영원히 대기합니다.',
        P2: 'Process 2\n자원 R2를 보유하고 R1을 요청하는 프로세스입니다. R1은 P1이 보유 중이어서 진행 불가입니다.',
        R1: 'Resource 1\n단일 인스턴스 자원입니다. P1이 보유 중이며 P2가 요청하고 있습니다. 비선점 조건으로 강제 회수 불가합니다.',
        R2: 'Resource 2\n단일 인스턴스 자원입니다. P2가 보유 중이며 P1이 요청하고 있습니다. 자원 할당 그래프에서 사이클의 일부입니다.',
    };

    function drawTooltip(L) {
        if (!hoveredKey || !TIPS[hoveredKey]) return;
        const parts = TIPS[hoveredKey].split('\n');
        const title = parts[0], desc = parts[1] || '';
        const W = GW(), H = GH();
        const pad = 14;
        const maxTW  = Math.min(W-24, W<520 ? W*0.85 : 300);
        const innerW = maxTW - pad*2;
        const tFont  = '700 13px "JetBrains Mono",monospace';
        const dFont  = '400 12px "JetBrains Mono",monospace';
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
        const tw = Math.min(Math.max(tW2,innerW)+pad*2, maxTW);
        const col = hoveredKey==='P1'?P.teal:hoveredKey==='P2'?P.purple:hoveredKey==='R1'?P.orange:P.green;
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

    /* ===================== 사이클 펄스 ===================== */
    function startCyclePulse() {
        if (rafId) cancelAnimationFrame(rafId);
        (function pulse() {
            const step = stepIdx >= 0 ? STEPS[stepIdx] : null;
            if (!step || !step.cycle) return;
            cycleAlpha += cycleDir * 0.03;
            if (cycleAlpha <= 0) { cycleAlpha = 0; cycleDir = 1; }
            if (cycleAlpha >= 1) { cycleAlpha = 1; cycleDir = -1; }
            draw();
            rafId = requestAnimationFrame(pulse);
        })();
    }

    /* ===================== 간선 등장 애니메이션 ===================== */
    function animateEdge(anim, cb) {
        if (!anim) { if (cb) cb(); return; }
        edgeAnim = { type: anim.type, from: anim.from, to: anim.to, prog: 0 };
        if (rafId) cancelAnimationFrame(rafId);
        const BASE = 1800, baseStep = 0.010;
        const s = baseStep * (BASE / speed);
        (function tick() {
            edgeAnim.prog = Math.min(1, edgeAnim.prog + s);
            draw();
            if (edgeAnim.prog < 1) { rafId = requestAnimationFrame(tick); }
            else {
                edgeAnim = null; draw();
                if (cb) cb();
            }
        })();
    }

    /* ===================== 단계 적용 ===================== */
    function setBadge(s) {
        badge.textContent = s;
        badge.className = 'dl-viz__step-badge' + (s!=='IDLE'?' dl-viz__step-badge--active':'');
    }
    function setSpeedDisabled(v) {
        root.querySelectorAll('.dl-viz__speed-btn').forEach(function(b){b.disabled=v;});
    }

    function applyStep(idx, onDone) {
        stepIdx = idx;
        const step = STEPS[idx];
        setBadge(step.badge);
        logEl.textContent = step.log;
        edgeAnim = null;

        animateEdge(step.animEdge, function() {
            if (step.cycle) startCyclePulse();
            else draw();
            if (onDone) setTimeout(onDone, 0);
        });
    }

    /* ===================== 컨트롤 ===================== */
    function dlStart() {
        if (running) return;
        running = true; btnPlay.disabled = true; btnStep.disabled = true;
        setSpeedDisabled(true);

        function tick() {
            const next = stepIdx + 1;
            if (next >= STEPS.length) { running = false; setSpeedDisabled(false); return; }
            applyStep(next, function() {
                if (next === STEPS.length-1) {
                    running = false; btnStep.disabled = true; setSpeedDisabled(false);
                } else {
                    timer = setTimeout(tick, speed);
                }
            });
        }
        tick();
    }

    function dlStep() {
        if (running || edgeAnim) return;
        const next = stepIdx + 1;
        if (next >= STEPS.length) return;
        applyStep(next, null);
        if (next === STEPS.length-1) { btnPlay.disabled = true; btnStep.disabled = true; }
    }

    function dlReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false; stepIdx = -1;
        edgeAnim = null; cycleAlpha = 1; cycleDir = -1;
        logEl.textContent = '▶ PLAY를 눌러 교착 상태 발생 과정을 확인하세요.';
        setBadge('IDLE');
        btnPlay.disabled = false; btnStep.disabled = false;
        setSpeedDisabled(false);
        draw();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.dl-viz__speed-btn').forEach(function(b){
            b.classList.remove('dl-viz__speed-btn--active');
        });
        btn.classList.add('dl-viz__speed-btn--active');
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