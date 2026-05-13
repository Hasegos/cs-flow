/**
 * 캐시 메모리 인터랙티브 시각화
 */
(function () {
    'use strict';

    const container = document.getElementById('visualizer-container');
    if (!container) return;

    /* ===================== UI 구성 ===================== */
    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls)  e.className = cls;
        if (text) e.textContent = text;
        return e;
    }

    const root    = el('div', 'cache-viz');
    const toolbar = el('div', 'cache-viz__toolbar');
    const tbLeft  = el('div', 'cache-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'cache-viz__title', 'Cache Memory'));
    const badge = el('span', 'cache-viz__step-badge', 'IDLE');
    badge.id = 'cm-badge';
    tbLeft.appendChild(badge);
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'cache-viz__speed');
    speedWrap.appendChild(el('span', 'cache-viz__speed-label', 'SPEED'));
    [['1x', 1100], ['2x', 550], ['3x', 220]].forEach(([label, ms], i) => {
        const btn = el('button', 'cache-viz__speed-btn' + (i === 0 ? ' cm__speed-btn--active' : ''), label);
        btn.dataset.ms = ms;
        btn.addEventListener('click', () => { if (!running) setSpeed(ms, btn); });
        speedWrap.appendChild(btn);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'cache-viz__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'cache-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const logEl = el('div', 'cache-viz__log', '▶ PLAY를 눌러 캐시 동작을 확인하세요.');
    root.appendChild(logEl);

    const controls = el('div', 'cache-viz__controls');
    const btnPlay  = el('button', 'cache-viz__btn cache-viz__btn--primary', '▶ PLAY');
    const btnStep  = el('button', 'cache-viz__btn', '▶| STEP');
    const btnReset = el('button', 'cache-viz__btn', '↺ RESET');
    btnPlay.addEventListener('click',  cmStart);
    btnStep.addEventListener('click',  cmStep);
    btnReset.addEventListener('click', cmReset);
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
        const mob = w < 500;
        const vpad = mob ? 12 : 20;
        const cacheMinH = 36 + 4 * 60 + 3 * 7 + vpad * 2;
        const memMinH   = 36 + 8 * 38 + 7 * 6  + vpad * 2;
        const minH = Math.max(cacheMinH, memMinH) + 40;
        const h    = Math.max(canvasWrap.offsetHeight, minH);
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    /* ===================== 팔레트 ===================== */
    const PALETTE = {
        dark: {
            bg:     '#0f0f1a', surf:   '#1a1a2e', surf2:  '#222238',
            border: 'rgba(108,99,255,0.22)',
            purple: '#6c63ff', teal:   '#3ecfb2', orange: '#f7a14a',
            green:  '#4ade80', red:    '#f87171', yellow: '#fbbf24',
            text:   '#e8e8f0', sub:    '#a0a0bc', muted:  '#6b6b8a',
        },
        light: {
            bg:     '#f5f5ff', surf:   '#ffffff', surf2:  '#eeeeff',
            border: 'rgba(108,99,255,0.2)',
            purple: '#6c63ff', teal:   '#2ab89e', orange: '#d97706',
            green:  '#16a34a', red:    '#dc2626', yellow: '#ca8a04',
            text:   '#1a1a2e', sub:    '#3a3a5c', muted:  '#6b6b8a',
        },
    };

    function getP() {
        return document.documentElement.getAttribute('data-theme') === 'light'
            ? PALETTE.light : PALETTE.dark;
    }
    let P = getP();

    /* ===================== 툴팁 정의 ===================== */
    const TOOLTIPS = {
        CPU:    'CPU\nCache에 데이터를 요청하는 프로세서',
        CACHE:  'Cache Memory\nCPU와 RAM 사이의 초고속 임시 저장소',
        MEM:    'Main Memory (RAM)\n실제 데이터가 저장된 주기억장치',
        HIT:    'Cache Hit\n요청 데이터가 캐시에 존재 — 빠름',
        MISS:   'Cache Miss\n요청 데이터가 캐시에 없음 — RAM 접근 필요',
        LRU:    'LRU 교체\n가장 오래 사용 안 한 슬롯을 새 데이터로 교체',
    };

    /* ===================== 시나리오 정의 ===================== */
    const MEM_BLOCKS = ['A','B','C','D','E','F','G','H'];

    const STEPS = [
        {
            req: 'A', hit: false, load: 'A', evict: null,
            badge: 'MISS #1',
            log: 'Step 1 — CPU가 블록 A 요청. 캐시 미스! 메인 메모리에서 A를 가져와 슬롯 0에 적재합니다.',
        },
        {
            req: 'B', hit: false, load: 'B', evict: null,
            badge: 'MISS #2',
            log: 'Step 2 — CPU가 블록 B 요청. 캐시 미스! 메인 메모리에서 B를 가져와 슬롯 1에 적재합니다.',
        },
        {
            req: 'A', hit: true, load: null, evict: null,
            badge: 'HIT #1',
            log: 'Step 3 — CPU가 블록 A 재요청. 캐시 히트! 메인 메모리 접근 없이 슬롯 0에서 즉시 반환합니다.',
        },
        {
            req: 'C', hit: false, load: 'C', evict: null,
            badge: 'MISS #3',
            log: 'Step 4 — CPU가 블록 C 요청. 캐시 미스! 메인 메모리에서 C를 가져와 슬롯 2에 적재합니다.',
        },
        {
            req: 'D', hit: false, load: 'D', evict: null,
            badge: 'MISS #4',
            log: 'Step 5 — CPU가 블록 D 요청. 캐시 미스! 메인 메모리에서 D를 가져와 슬롯 3에 적재합니다. 캐시가 꽉 찼습니다.',
        },
        {
            req: 'B', hit: true, load: null, evict: null,
            badge: 'HIT #2',
            log: 'Step 6 — CPU가 블록 B 재요청. 캐시 히트! 슬롯 1에서 즉시 반환합니다. B의 LRU 순위가 갱신됩니다.',
        },
        {
            req: 'E', hit: false, load: 'E', evict: 'A',
            badge: 'LRU 교체',
            log: 'Step 7 — CPU가 블록 E 요청. 캐시 미스 + 캐시 풀! LRU 정책으로 가장 오래된 A를 제거하고 E를 슬롯 0에 적재합니다.',
        },
    ];

    /* ===================== 상태 ===================== */
    let stepIdx  = -1;
    let running  = false;
    let timer    = null;
    let speed    = 1100;
    let cacheSlots = [null, null, null, null];
    let lruCounter = 0;
    let rafId   = null;

    /* ===================== 툴팁 히트박스 ===================== */
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
        if (fill)   { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
    }

    function tx(str, x, y, sz, color, align, bold) {
        ctx.font = `${bold ? 700 : 400} ${sz}px "JetBrains Mono",monospace`;
        ctx.fillStyle    = color;
        ctx.textAlign    = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    function arrow(x1, y1, x2, y2, col) {
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.sqrt(dx*dx + dy*dy);
        if (len < 1) return;
        const ux = dx/len, uy = dy/len;
        const hx = x2 - ux*10, hy = y2 - uy*10;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(hx, hy);
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        const perp = 4;
        ctx.moveTo(x2, y2);
        ctx.lineTo(hx - uy*perp, hy + ux*perp);
        ctx.lineTo(hx + uy*perp, hy - ux*perp);
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();
    }

    /* ===================== 레이아웃 계산 ===================== */
    function buildLayout() {
        const W = GW(), H = GH();
        const mob = W < 500;
        const pad = mob ? 8 : 20;
        const vpad = mob ? 14 : 20;
        const cpuW = mob ? 54  : 84;
        const cpuH = mob ? 44  : 64;
        const cpuX = pad;
        const cpuY = H / 2 - cpuH / 2;
        const cacheHdrH = 36;
        const slotGap   = 7;
        const slotH     = 60;
        const cacheH    = cacheHdrH + 4 * slotH + 3 * slotGap + 10;
        const cacheW    = mob ? 120 : 158;
        const memHdrH = 36;
        const memBGap = 6;
        const memBH   = 38;
        const memH    = memHdrH + 8 * memBH + 7 * memBGap + 10;
        const memW    = mob ? 100 : 130;
        const totalBoxW = cpuW + cacheW + memW;
        const gapCount  = 3;
        const gap = Math.max(mob ? 12 : 24, Math.floor((W - totalBoxW - pad * 2) / (gapCount - 1)));

        const cacheX = cpuX + cpuW + gap;
        const memX   = cacheX + cacheW + gap;

        const cacheY = Math.max(vpad, H / 2 - cacheH / 2);
        const memY   = Math.max(vpad, H / 2 - memH   / 2);

        return { W, H, mob, pad, vpad,
            cpuX, cpuY, cpuW, cpuH,
            cacheX, cacheY, cacheW, cacheH, slotH, slotGap, cacheHdrH,
            memX, memY, memW, memH, memBH, memBGap, memHdrH };
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = getP();
        const W = GW(), H = GH();
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = P.bg;
        ctx.fillRect(0, 0, W, H);

        tooltipHits = [];

        const L = buildLayout();
        drawCPU(L);
        drawCache(L);
        drawMemory(L);
        drawConnectors(L);
        drawPackets(L);

        if (hoveredKey && TOOLTIPS[hoveredKey]) {
            drawTooltip(mousePos.x, mousePos.y, hoveredKey);
        }
    }

    /* ===================== CPU ===================== */
    function drawCPU(L) {
        const { cpuX, cpuY, cpuW, cpuH, mob } = L;
        const isHov = hoveredKey === 'CPU';
        const cx = cpuX + cpuW / 2, cy = cpuY + cpuH / 2;

        rr(cpuX, cpuY, cpuW, cpuH, 8,
            isHov ? P.purple + '28' : P.surf,
            isHov ? P.purple : P.purple, isHov ? 2 : 1.5);

        const fSm = mob ? 9  : 11;
        const fMd = mob ? 11 : 14;
        tx('CPU', cx, cy - (mob ? 5 : 6), fMd, P.purple, 'center', true);
        tx('Processor', cx, cy + (mob ? 6 : 8), fSm, P.muted, 'center', false);

        const qx = cpuX + cpuW - 8, qy = cpuY + 8;
        drawBadge(qx, qy, 'CPU');
        tooltipHits.push({ x: qx - 6, y: qy - 6, w: 12, h: 12, key: 'CPU' });
    }

    /* ===================== Cache ===================== */
    function drawCache(L) {
        const { cacheX, cacheY, cacheW, cacheH, slotH, slotGap, cacheHdrH, mob } = L;
        const isHov = hoveredKey === 'CACHE';
        const hdrH  = cacheHdrH;
        const fHdr  = mob ? 9  : 11;
        const fSlot = mob ? 10 : 13;
        const fSub  = mob ? 8  : 10;
        const pad   = mob ? 8  : 12;

        rr(cacheX, cacheY, cacheW, cacheH, 8,
            isHov ? P.teal + '10' : P.surf,
            isHov ? P.teal : P.teal, isHov ? 2 : 1.5);

        tx('CACHE', cacheX + cacheW / 2, cacheY + hdrH / 2, fHdr, P.teal, 'center', true);

        const qx = cacheX + cacheW - 8, qy = cacheY + 8;
        drawBadge(qx, qy, 'CACHE');
        tooltipHits.push({ x: qx - 6, y: qy - 6, w: 12, h: 12, key: 'CACHE' });

        const step = STEPS[stepIdx] || {};
        cacheSlots.forEach((slot, i) => {
            const sy = cacheY + hdrH + slotGap / 2 + i * (slotH + slotGap);
            const sx = cacheX + pad;
            const sw = cacheW - pad * 2;

            const isEvict  = step.evict && slot && slot.block === step.evict;
            const isLoaded = step.load  && slot && slot.block === step.load && !step.hit;
            const isHit    = step.hit   && slot && slot.block === step.req;

            let bgCol  = P.surf2;
            let bdCol  = P.border;
            let lw     = 1;

            if (isEvict)  { bgCol = P.red    + '22'; bdCol = P.red;    lw = 2; }
            else if (isLoaded) { bgCol = P.teal + '22'; bdCol = P.teal; lw = 2; }
            else if (isHit)    { bgCol = P.green + '22'; bdCol = P.green; lw = 2; }

            rr(sx, sy, sw, slotH, 5, bgCol, bdCol, lw);

            tx(`S${i}`, sx + (mob ? 14 : 18), sy + slotH / 2 - (mob ? 7 : 9), fSub, P.muted, 'center', false);

            const divX = sx + (mob ? 26 : 34);
            ctx.beginPath();
            ctx.moveTo(divX, sy + 5);
            ctx.lineTo(divX, sy + slotH - 5);
            ctx.strokeStyle = P.border;
            ctx.lineWidth = 1;
            ctx.stroke();

            if (slot) {
                const col = isEvict ? P.red : isLoaded ? P.teal : isHit ? P.green : P.sub;
                tx(slot.block, sx + divX - sx + (sw - (divX - sx)) / 2 + (mob ? 0 : 4),
                    sy + slotH / 2 - (mob ? 5 : 6), fSlot, col, 'center', true);
                tx(`LRU:${slot.lruRank}`, sx + divX - sx + (sw - (divX - sx)) / 2 + (mob ? 0 : 4),
                    sy + slotH / 2 + (mob ? 5 : 7), fSub, P.muted, 'center', false);
            } else {
                tx('—', sx + divX - sx + (sw - (divX - sx)) / 2 + (mob ? 0 : 4),
                    sy + slotH / 2, fSlot, P.muted, 'center', false);
            }

            if (isEvict)       tx('EVICT', sx + (mob ? 14 : 18), sy + slotH / 2 + (mob ? 9 : 11), fSub - 1, P.red,   'center', true);
            else if (isLoaded) tx('LOAD',  sx + (mob ? 14 : 18), sy + slotH / 2 + (mob ? 9 : 11), fSub - 1, P.teal,  'center', true);
            else if (isHit)    tx('HIT',   sx + (mob ? 14 : 18), sy + slotH / 2 + (mob ? 9 : 11), fSub - 1, P.green, 'center', true);
        });
    }

    /* ===================== Memory ===================== */
    function drawMemory(L) {
        const { memX, memY, memW, memH, memBH, memBGap, memHdrH, mob } = L;
        const isHov = hoveredKey === 'MEM';
        const hdrH  = memHdrH;
        const fHdr  = mob ? 9  : 11;
        const fBlk  = mob ? 10 : 13;
        const pad   = mob ? 8  : 12;

        rr(memX, memY, memW, memH, 8,
            isHov ? P.orange + '10' : P.surf,
            isHov ? P.orange : P.orange, isHov ? 2 : 1.5);

        tx('MEMORY', memX + memW / 2, memY + hdrH / 2, fHdr, P.orange, 'center', true);

        const qx = memX + memW - 8, qy = memY + 8;
        drawBadge(qx, qy, 'MEM');
        tooltipHits.push({ x: qx - 6, y: qy - 6, w: 12, h: 12, key: 'MEM' });

        const step = STEPS[stepIdx] || {};
        MEM_BLOCKS.forEach((blk, i) => {
            const by  = memY + hdrH + memBGap / 2 + i * (memBH + memBGap);
            const bx  = memX + pad;
            const bw  = memW - pad * 2;
            const isReq = step.req === blk;

            rr(bx, by, bw, memBH, 4,
                isReq ? P.orange + '22' : P.surf2,
                isReq ? P.orange : P.border, isReq ? 2 : 1);

            tx(blk, bx + bw / 2, by + memBH / 2, fBlk,
                isReq ? P.orange : P.sub, 'center', isReq);
        });
    }

    /* ===================== 연결선 (양방향) ===================== */
    function drawConnectors(L) {
        const { cpuX, cpuY, cpuW, cpuH,
                cacheX, cacheY, cacheW, cacheH,
                memX, memY, memW, memH } = L;

        const cpuRx   = cpuX + cpuW,      cpuMy   = cpuY + cpuH / 2;
        const cacheLx = cacheX,            cacheMy = cacheY + cacheH / 2;
        const cacheRx = cacheX + cacheW;
        const memLx   = memX,              memMy   = memY + memH / 2;
        const off = 5;

        arrow(cpuRx + 2,    cpuMy - off,  cacheLx - 2,  cacheMy - off, P.purple + 'aa');
        arrow(cacheLx - 2,  cacheMy + off, cpuRx + 2,   cpuMy + off,   P.green  + 'aa');

        arrow(cacheRx + 2,  cacheMy - off, memLx - 2,   memMy - off,   P.purple + 'aa');
        arrow(memLx - 2,    memMy + off,   cacheRx + 2, cacheMy + off, P.orange + 'aa');
    }

    /* ===================== 패킷 애니메이션 (큐 기반) ===================== */
    let pktQueue   = [];
    let pktCurrent = null;
    let pktProg    = 0;
    let pktDoneAll = null;

    function drawPackets() {
        if (!pktCurrent) return;
        const t = pktProg;
        const x = pktCurrent.x + (pktCurrent.tx - pktCurrent.x) * t;
        const y = pktCurrent.y + (pktCurrent.ty - pktCurrent.y) * t;
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fillStyle = pktCurrent.col;
        ctx.fill();
        tx(pktCurrent.label, x, y, 8, '#0f0f1a', 'center', true);
    }

    function pktNext() {
        if (pktQueue.length === 0) {
            pktCurrent = null;
            draw();
            if (pktDoneAll) { const cb = pktDoneAll; pktDoneAll = null; cb(); }
            return;
        }
        pktCurrent = pktQueue.shift();
        pktProg    = 0;
        if (rafId) cancelAnimationFrame(rafId);
        function tick() {
            pktProg = Math.min(1, pktProg + 0.013);
            draw();
            if (pktProg < 1) {
                rafId = requestAnimationFrame(tick);
            } else {
                pktNext();
            }
        }
        rafId = requestAnimationFrame(tick);
    }

    function spawnPacket(x, y, tx_, ty_, col, label) {
        pktQueue.push({ x, y, tx: tx_, ty: ty_, col, label });
    }

    function animatePackets(onDone) {
        pktDoneAll = onDone || null;
        pktNext();
    }

    /* ===================== ? 뱃지 ===================== */
    function drawBadge(qx, qy, key) {
        const isHov = hoveredKey === key;
        ctx.beginPath();
        ctx.arc(qx, qy, 6, 0, Math.PI * 2);
        ctx.fillStyle   = isHov ? P.purple : P.surf2;
        ctx.fill();
        ctx.strokeStyle = isHov ? P.purple : P.muted;
        ctx.lineWidth = 1;
        ctx.stroke();
        tx('?', qx, qy, 7, isHov ? '#fff' : P.muted, 'center', true);
    }

    /* ===================== 툴팁 ===================== */
    function drawTooltip(mx, my, key) {
        const lines = TOOLTIPS[key].split('\n');
        const title = lines[0];
        const desc  = lines[1] || '';

        ctx.font = '700 14px "JetBrains Mono",monospace';
        const titleW = ctx.measureText(title).width;
        ctx.font = '400 13px "JetBrains Mono",monospace';
        const descW  = ctx.measureText(desc).width;

        const pad = 14;
        const tw  = Math.max(titleW, descW) + pad * 2;
        const th  = desc ? 60 : 36;
        const W   = GW(), H = GH();

        let tx_ = mx + 14;
        let ty_ = my - th - 8;
        if (tx_ + tw > W - 8) tx_ = mx - tw - 14;
        if (tx_ < 8)          tx_ = 8;
        if (ty_ < 8)          ty_ = my + 14;
        if (ty_ + th > H - 8) ty_ = H - th - 8;

        rr(tx_, ty_, tw, th, 6, P.surf2, P.purple + 'cc', 2);

        ctx.font = '700 14px "JetBrains Mono",monospace';
        ctx.fillStyle = P.text;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(title, tx_ + pad, ty_ + (desc ? 18 : th / 2));

        if (desc) {
            ctx.font = '400 13px "JetBrains Mono",monospace';
            ctx.fillStyle = P.sub;
            ctx.fillText(desc, tx_ + pad, ty_ + 42);
        }
    }

    /* ===================== 상태 텍스트 ===================== */
    function setLog(str)   { logEl.textContent = str; }
    function setBadge(str) {
        badge.textContent = str;
        badge.className = 'cache-viz__step-badge' + (str !== 'IDLE' ? ' cm__step-badge--active' : '');
    }
    function setSpeedDisabled(v) {
        root.querySelectorAll('.cache-viz__speed-btn').forEach(b => { b.disabled = v; });
    }

    /* ===================== 캐시 상태 적용 ===================== */
    function applyStep(idx, onDone) {
        stepIdx = idx;
        const step = STEPS[idx];
        setBadge(step.badge);
        setLog(step.log);

        if (!step.hit) {
            if (step.evict) {
                const evictIdx = cacheSlots.findIndex(s => s && s.block === step.evict);
                if (evictIdx !== -1) cacheSlots[evictIdx] = { block: step.load, lruRank: ++lruCounter };
            } else {
                const emptyIdx = cacheSlots.findIndex(s => s === null);
                if (emptyIdx !== -1) cacheSlots[emptyIdx] = { block: step.load, lruRank: ++lruCounter };
            }
        } else {
            const hitSlot = cacheSlots.find(s => s && s.block === step.req);
            if (hitSlot) hitSlot.lruRank = ++lruCounter;
        }

        const L  = buildLayout();
        const cpuRx   = L.cpuX + L.cpuW;
        const cpuMy   = L.cpuY + L.cpuH / 2;
        const cacheLx = L.cacheX;
        const cacheRx = L.cacheX + L.cacheW;
        const cacheMy = L.cacheY + L.cacheH / 2;
        const memLx   = L.memX;
        const memMy   = L.memY + L.memH / 2;

        pktQueue = [];

        if (step.hit) {
            spawnPacket(cpuRx, cpuMy, cacheLx, cacheMy, P.purple, step.req);
            spawnPacket(cacheLx, cacheMy, cpuRx, cpuMy, P.green, step.req);
        } else {
            spawnPacket(cpuRx, cpuMy, cacheLx, cacheMy, P.purple, step.req);
            spawnPacket(cacheRx, cacheMy, memLx, memMy, P.orange, step.req);
            spawnPacket(memLx, memMy, cacheRx, cacheMy, P.orange, step.load);
            spawnPacket(cacheLx, cacheMy, cpuRx, cpuMy, P.teal, step.load);
        }

        animatePackets(onDone);
    }

    /* ===================== 컨트롤 ===================== */
    function cmStart() {
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
                    btnStep.disabled = true;
                    setSpeedDisabled(false);
                } else {
                    timer = setTimeout(tick, speed);
                }
            });
        }
        tick();
    }

    function cmStep() {
        if (running) return;
        const next = stepIdx + 1;
        if (next >= STEPS.length) return;
        applyStep(next, null);
        if (next === STEPS.length - 1) {
            btnPlay.disabled = true;
            btnStep.disabled = true;
        }
    }

    function cmReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running    = false;
        stepIdx    = -1;
        cacheSlots = [null, null, null, null];
        lruCounter = 0;
        pktQueue = []; pktCurrent = null; pktProg = 0; pktDoneAll = null;
        setLog('▶ PLAY를 눌러 캐시 동작을 확인하세요.');
        setBadge('IDLE');
        btnPlay.disabled = false;
        btnStep.disabled = false;
        setSpeedDisabled(false);
        draw();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.cache-viz__speed-btn').forEach(b => b.classList.remove('cache-viz__speed-btn--active'));
        btn.classList.add('cache-viz__speed-btn--active');
    }

    /* ===================== 마우스 ===================== */
    canvas.addEventListener('mousemove', function (e) {
        const rect  = canvas.getBoundingClientRect();
        mousePos.x  = (e.clientX - rect.left) * (GW() / rect.width);
        mousePos.y  = (e.clientY - rect.top)  * (GH() / rect.height);
        const hit   = tooltipHits.find(h =>
            mousePos.x >= h.x && mousePos.x <= h.x + h.w &&
            mousePos.y >= h.y && mousePos.y <= h.y + h.h);
        const newKey = hit ? hit.key : null;
        if (newKey !== hoveredKey) {
            hoveredKey = newKey;
            canvas.style.cursor = newKey ? 'help' : 'default';
            draw();
        }
    });

    canvas.addEventListener('mouseleave', function () {
        if (hoveredKey) { hoveredKey = null; canvas.style.cursor = 'default'; draw(); }
    });

    /* ===================== 테마 변경 대응 ===================== */
    window.addEventListener('csflow-theme-change', function () {
        P = getP();
        draw();
    });

    /* ===================== 초기화 ===================== */
    new ResizeObserver(() => resize()).observe(canvasWrap);
    setTimeout(resize, 60);
})();