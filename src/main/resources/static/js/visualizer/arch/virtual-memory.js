/**
 * 가상 메모리 인터랙티브 시각화
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

    const root    = el('div', 'virt-mem');
    const toolbar = el('div', 'virt-mem__toolbar');
    const tbLeft  = el('div', 'virt-mem__toolbar-left');
    tbLeft.appendChild(el('span', 'virt-mem__title', 'Virtual Memory'));
    const badge = el('span', 'virt-mem__step-badge', 'IDLE');
    tbLeft.appendChild(badge);
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'virt-mem__speed');
    speedWrap.appendChild(el('span', 'virt-mem__speed-label', 'SPEED'));
    [['1x', 1000], ['2x', 500], ['3x', 200]].forEach(([lbl, ms], i) => {
        const b = el('button', 'virt-mem__speed-btn' + (i === 0 ? ' virt-mem__speed-btn--active' : ''), lbl);
        b.addEventListener('click', () => { if (!running) setSpeed(ms, b); });
        speedWrap.appendChild(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'virt-mem__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'virt-mem__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const logEl = el('div', 'virt-mem__log', '▶ PLAY를 눌러 가상 주소 변환 과정을 확인하세요.');
    root.appendChild(logEl);

    const controls = el('div', 'virt-mem__controls');
    const btnPlay  = el('button', 'virt-mem__btn virt-mem__btn--primary', '▶ PLAY');
    const btnStep  = el('button', 'virt-mem__btn', '▶| STEP');
    const btnReset = el('button', 'virt-mem__btn', '↺ RESET');
    btnPlay.addEventListener('click',  vmStart);
    btnStep.addEventListener('click',  vmStep);
    btnReset.addEventListener('click', vmReset);
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
        const minH = mob ? 280 : 420;
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

    /* ===================== 약어 툴팁 ===================== */
    const TOOLTIPS = {
        CPU:  'CPU\n가상 주소로 데이터를 요청하는 프로세서',
        TLB:  'TLB (Translation Lookaside Buffer)\n최근 주소 변환 결과를 저장하는 하드웨어 캐시',
        PT:   'Page Table\n가상 페이지 번호를 물리 프레임 번호로 변환',
        PM:   'Physical Memory (RAM)\n실제 데이터가 올라와있는 물리 메모리',
        DISK: 'Disk (Swap)\n페이지 폴트 시 페이지를 로드하는 보조 저장소',
    };

    /* ===================== 시나리오 정의 ===================== */
    const STEPS = [
        {
            badge:  'TLB HIT',
            result: 'tlb-hit',
            addr:   '0x1000',
            vpn:    'VPN: 1',
            pfn:    'PFN: 5',
            offset: 'Offset: 0x000',
            phys:   '0x5000',
            log:    'Step 1 — CPU가 가상 주소 0x1000 요청. TLB에 VPN:1 → PFN:5 변환 정보가 있습니다! 물리 주소 0x5000으로 즉시 변환 후 RAM에 접근합니다.',
            path:   ['CPU','TLB','PM'],
            cols:   [P.purple, P.green, P.green],
        },
        {
            badge:  'TLB MISS',
            result: 'tlb-miss',
            addr:   '0x2000',
            vpn:    'VPN: 2',
            pfn:    'PFN: 8',
            offset: 'Offset: 0x000',
            phys:   '0x8000',
            log:    'Step 2 — CPU가 가상 주소 0x2000 요청. TLB에 없습니다(Miss). 페이지 테이블에서 VPN:2 → PFN:8 을 찾아 TLB를 갱신하고 RAM에 접근합니다.',
            path:   ['CPU','TLB','PT','TLB','PM'],
            cols:   [P.purple, P.orange, P.orange, P.teal, P.teal],
        },
        {
            badge:  'TLB HIT',
            result: 'tlb-hit',
            addr:   '0x2000',
            vpn:    'VPN: 2',
            pfn:    'PFN: 8',
            offset: 'Offset: 0x000',
            phys:   '0x8000',
            log:    'Step 3 — CPU가 0x2000 재요청. 방금 TLB에 등록된 VPN:2 → PFN:8 변환이 있습니다(Hit). 페이지 테이블 조회 없이 즉시 RAM에 접근합니다.',
            path:   ['CPU','TLB','PM'],
            cols:   [P.purple, P.green, P.green],
        },
        {
            badge:  'PAGE FAULT',
            result: 'page-fault',
            addr:   '0x3000',
            vpn:    'VPN: 3',
            pfn:    'PFN: -',
            offset: 'Offset: 0x000',
            phys:   '0xC000',
            log:    'Step 4 — CPU가 0x3000 요청. TLB Miss + 페이지 테이블에도 없습니다(Page Fault)! OS가 Disk에서 페이지를 RAM으로 로드하고 페이지 테이블과 TLB를 갱신합니다.',
            path:   ['CPU','TLB','PT','DISK','PM','TLB','PM'],
            cols:   [P.purple, P.orange, P.red, P.red, P.yellow, P.teal, P.teal],
        },
    ];

    /* ===================== 상태 ===================== */
    let stepIdx    = -1;
    let running    = false;
    let timer      = null;
    let speed      = 1000;
    let activeSet  = new Set();
    let resultState = null;

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
        ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    function dottedArrow(x1, y1, x2, y2, col, active) {
        const dx = x2-x1, dy = y2-y1, len = Math.sqrt(dx*dx+dy*dy);
        if (len < 2) return;
        const ux = dx/len, uy = dy/len;
        const ex = x2 - ux*10, ey = y2 - uy*10;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(ex, ey);
        ctx.strokeStyle = active ? col : P.border;
        ctx.lineWidth   = active ? 2 : 1;
        ctx.setLineDash(active ? [] : [4, 5]);
        ctx.stroke(); ctx.setLineDash([]);
        if (!active) return;
        const p = 4;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(ex - uy*p, ey + ux*p);
        ctx.lineTo(ex + uy*p, ey - ux*p);
        ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    }

    /* ===================== 레이아웃 ===================== */
    function buildLayout() {
        const W = GW(), H = GH();
        const mob = W < 520;

        const nw = mob ? 76  : 110;
        const nh = mob ? 54  : 72;

        if (mob) {
            const hGap  = Math.max(8, (W - 12 - nw*3) / 2);
            const addrH = 52;
            const pad   = 12;
            const totalEl  = nh * 2 + addrH;
            const gapSpace = Math.max(14, (H - totalEl) / 4);

            const row1Y = gapSpace;
            const row2Y = row1Y + nh + gapSpace;
            const addrY = row2Y + nh + gapSpace;

            const nodes = {
                CPU:  { x: 6,              y: row1Y, w: nw, h: nh, col: P.purple,  lbl: 'CPU',  sub: 'Processor' },
                TLB:  { x: 6+nw+hGap,     y: row1Y, w: nw, h: nh, col: P.teal,    lbl: 'TLB',  sub: 'Addr Cache' },
                PM:   { x: 6+(nw+hGap)*2, y: row1Y, w: nw, h: nh, col: P.orange,  lbl: 'RAM',  sub: 'Phys Mem' },
                PT:   { x: 6+nw+hGap,     y: row2Y, w: nw, h: nh, col: '#a78bfa', lbl: 'PT',   sub: 'Page Table' },
                DISK: { x: 6+(nw+hGap)*2, y: row2Y, w: nw, h: nh, col: P.red,     lbl: 'DISK', sub: 'Swap' },
            };
            return { W, H, mob, nw, nh, nodes, addrY, addrH };
        }
=
        const hGap  = Math.max(40, (W - 48 - nw*3) / 2);
        const vGap  = Math.max(60, (H - 48 - nh*2) / 1);
        const row1Y = 24;
        const row2Y = row1Y + nh + vGap;
        const x0 = 24, x1 = 24 + nw + hGap, x2 = 24 + (nw + hGap)*2;

        const nodes = {
            CPU:  { x: x0, y: row1Y, w: nw, h: nh, col: P.purple, lbl: 'CPU',    sub: 'Processor' },
            TLB:  { x: x1, y: row1Y, w: nw, h: nh, col: P.teal,   lbl: 'TLB',    sub: 'Translation LB' },
            PM:   { x: x2, y: row1Y, w: nw, h: nh, col: P.orange, lbl: 'RAM',    sub: 'Physical Memory' },
            PT:   { x: x1, y: row2Y, w: nw, h: nh, col: '#a78bfa',lbl: 'PT',     sub: 'Page Table' },
            DISK: { x: x2, y: row2Y, w: nw, h: nh, col: P.red,    lbl: 'DISK',   sub: 'Swap Space' },
        };
        return { W, H, mob, nw, nh, nodes };
    }

    function nc(n) { return { x: n.x + n.w/2, y: n.y + n.h/2 }; }

    /* ===================== 주소 변환 패널 ===================== */
    function drawAddrPanel(L) {
        if (stepIdx < 0) return;
        const step = STEPS[stepIdx];
        const { W, H, mob, addrY, addrH } = L;

        const pw = mob ? W - 12 : 220;
        const ph = mob ? (addrH || 56) : 130;
        const px = mob ? 6 : W - pw - 16;
        const py = mob ? (addrY || H - ph - 6) : H / 2 - ph / 2;

        rr(px, py, pw, ph, 8, P.surf2, P.purple + '66', 1.5);

        const fSm = mob ? 9  : 10;
        const fMd = mob ? 10 : 12;
        const col = step.result === 'tlb-hit' ? P.green
                  : step.result === 'page-fault' ? P.red : P.orange;

        if (mob) {
            tx('VA: ' + step.addr,  px + pw*0.16, py + ph/2, fMd, P.purple, 'center', true);
            tx(step.vpn,            px + pw*0.38, py + ph/2, fMd, P.teal,   'center', false);
            tx(step.pfn,            px + pw*0.60, py + ph/2, fMd, col,      'center', false);
            tx('PA: ' + step.phys,  px + pw*0.82, py + ph/2, fMd, P.orange, 'center', true);
        } else {
            tx('주소 변환',     px + pw/2, py + 18,  fSm, P.muted,  'center', false);
            tx('VA  ' + step.addr,  px + pw/2, py + 40,  fMd, P.purple, 'center', true);
            tx(step.vpn,            px + pw/2, py + 62,  fMd, P.teal,   'center', false);
            tx(step.pfn,            px + pw/2, py + 82,  fMd, col,      'center', false);
            tx(step.offset,         px + pw/2, py + 102, fSm, P.muted,  'center', false);
            tx('PA  ' + step.phys,  px + pw/2, py + 118, fMd, P.orange, 'center', true);
        }
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = getP();
        ctx.clearRect(0, 0, GW(), GH());
        ctx.fillStyle = P.bg; ctx.fillRect(0, 0, GW(), GH());
        tooltipHits = [];

        const L = buildLayout();
        drawEdges(L);
        drawNodes(L);
        drawAddrPanel(L);
        drawPacket(L);

        if (hoveredKey && TOOLTIPS[hoveredKey]) drawTooltip(mousePos.x, mousePos.y, hoveredKey);
    }

    /* ===================== 연결선 ===================== */
    function drawEdges(L) {
        const { nodes } = L;
        const step = stepIdx >= 0 ? STEPS[stepIdx] : null;

        function isActive(a, b) {
            if (!step) return false;
            for (let i = 0; i < step.path.length - 1; i++) {
                if ((step.path[i]===a && step.path[i+1]===b) ||
                    (step.path[i]===b && step.path[i+1]===a))
                    return true;
            }
            return false;
        }
        function edgeCol(a, b) {
            if (!step) return P.border;
            for (let i = 0; i < step.path.length - 1; i++) {
                if ((step.path[i]===a && step.path[i+1]===b) ||
                    (step.path[i]===b && step.path[i+1]===a))
                    return step.cols[i];
            }
            return P.border;
        }

        [['CPU','TLB'],['TLB','PM'],['TLB','PT'],['PT','DISK'],['DISK','PM']].forEach(([a, b]) => {
            const ca = nc(nodes[a]), cb = nc(nodes[b]);
            const act = isActive(a, b);
            const margin = 0.18;
            dottedArrow(
                ca.x + (cb.x-ca.x)*margin, ca.y + (cb.y-ca.y)*margin,
                ca.x + (cb.x-ca.x)*(1-margin), ca.y + (cb.y-ca.y)*(1-margin),
                edgeCol(a, b), act
            );
        });
    }

    /* ===================== 노드 ===================== */
    function drawNodes(L) {
        const { nodes, mob } = L;
        const fMd = mob ? 12 : 15;
        const fSm = mob ? 9  : 11;

        Object.entries(nodes).forEach(([key, n]) => {
            const isAct = activeSet.has(key);
            const isHov = hoveredKey === key;
            const col   = n.col;

            rr(n.x, n.y, n.w, n.h, 8,
                isAct ? col+'28' : isHov ? P.purple+'18' : P.surf,
                isAct ? col : isHov ? P.purple : P.border,
                isAct ? 2.5 : isHov ? 2 : 1.5);

            const cx = n.x + n.w/2, cy = n.y + n.h/2;
            tx(n.lbl, cx, cy - (mob ? 7 : 9), fMd, isAct ? col : isHov ? P.purple : P.text, 'center', true);
            tx(n.sub, cx, cy + (mob ? 7 : 10), fSm, P.muted, 'center', false);

            const qx = n.x + n.w - 9, qy = n.y + 9;
            const isHovQ = hoveredKey === key;
            ctx.beginPath(); ctx.arc(qx, qy, 6, 0, Math.PI*2);
            ctx.fillStyle   = isHovQ ? col : P.surf2; ctx.fill();
            ctx.strokeStyle = isHovQ ? col : P.muted; ctx.lineWidth = 1; ctx.stroke();
            tx('?', qx, qy, 7, isHovQ ? '#fff' : P.muted, 'center', true);
            tooltipHits.push({ x: qx-6, y: qy-6, w: 12, h: 12, key });
        });

        if (resultState) {
            const { W, H, mob, addrY, addrH } = L;
            const info = {
                'tlb-hit':    ['TLB HIT ✓ — 즉시 변환',        P.green ],
                'tlb-miss':   ['TLB MISS → 페이지 테이블 조회', P.orange],
                'page-fault': ['PAGE FAULT! → 디스크 로드',     P.red   ],
            }[resultState];
            const ry = mob ? (addrY ? addrY - 14 : H - 80) : H - 14;
            if (info) tx(info[0], W/2, ry, mob ? 10 : 12, info[1], 'center', true);
        }
    }

    /* ===================== 패킷 애니메이션 ===================== */
    function drawPacket(L) {
        if (!pktCurrent) return;
        const { nodes } = L;
        const fn = nodes[pktCurrent.from], tn = nodes[pktCurrent.to];
        if (!fn || !tn) return;
        const fc = nc(fn), tc = nc(tn);
        const x = fc.x + (tc.x-fc.x)*pktProg;
        const y = fc.y + (tc.y-fc.y)*pktProg;
        ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI*2);
        ctx.fillStyle = pktCurrent.col; ctx.fill();
        tx(pktCurrent.lbl, x, y, 8, '#0f0f1a', 'center', true);
    }

    function spawnPkt(from, to, col, lbl) { pktQueue.push({ from, to, col, lbl }); }

    function pktNext() {
        if (!pktQueue.length) {
            pktCurrent = null; draw();
            if (pktDone) { const cb = pktDone; pktDone = null; cb(); }
            return;
        }
        pktCurrent = pktQueue.shift(); pktProg = 0;
        activeSet.add(pktCurrent.from); activeSet.add(pktCurrent.to);
        if (rafId) cancelAnimationFrame(rafId);
        (function tick() {
            pktProg = Math.min(1, pktProg + 0.014);
            draw();
            if (pktProg < 1) rafId = requestAnimationFrame(tick);
            else pktNext();
        })();
    }

    function animPkts(cb) { pktDone = cb || null; pktNext(); }

    /* ===================== 툴팁 ===================== */
    function drawTooltip(mx, my, key) {
        const lines = TOOLTIPS[key].split('\n');
        const title = lines[0], desc = lines[1] || '';
        ctx.font = '700 14px "JetBrains Mono",monospace';
        const tw1 = ctx.measureText(title).width;
        ctx.font = '400 13px "JetBrains Mono",monospace';
        const tw2 = ctx.measureText(desc).width;
        const pad = 14, tw = Math.max(tw1, tw2) + pad*2, th = desc ? 60 : 36;
        const W = GW(), H = GH();
        let tx_ = mx+14, ty_ = my-th-8;
        if (tx_+tw > W-8) tx_ = mx-tw-14;
        if (tx_ < 8)      tx_ = 8;
        if (ty_ < 8)      ty_ = my+14;
        if (ty_+th > H-8) ty_ = H-th-8;
        rr(tx_, ty_, tw, th, 6, P.surf2, P.purple+'cc', 2);
        ctx.font = '700 14px "JetBrains Mono",monospace';
        ctx.fillStyle = P.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(title, tx_+pad, ty_+(desc ? 18 : th/2));
        if (desc) {
            ctx.font = '400 13px "JetBrains Mono",monospace';
            ctx.fillStyle = P.sub;
            ctx.fillText(desc, tx_+pad, ty_+42);
        }
    }

    /* ===================== 단계 제어 ===================== */
    function setLog(s)   { logEl.textContent = s; }
    function setBadge(s) {
        badge.textContent = s;
        badge.className = 'virt-mem__step-badge' + (s !== 'IDLE' ? ' virt-mem__step-badge--active' : '');
    }
    function setSpeedDis(v) { root.querySelectorAll('.virt-mem__speed-btn').forEach(b => { b.disabled = v; }); }

    function applyStep(idx, onDone) {
        stepIdx = idx;
        const step = STEPS[idx];
        setBadge(step.badge);
        setLog(step.log);
        resultState = null;
        activeSet.clear();
        pktQueue = [];

        for (let i = 0; i < step.path.length - 1; i++) {
            spawnPkt(step.path[i], step.path[i+1], step.cols[i], step.path[i+1]);
        }
        animPkts(() => {
            resultState = step.result;
            draw();
            onDone && setTimeout(onDone, 0);
        });
    }

    /* ===================== 컨트롤 ===================== */
    function vmStart() {
        if (running) return;
        running = true; btnPlay.disabled = true; btnStep.disabled = true; setSpeedDis(true);
        function tick() {
            const next = stepIdx + 1;
            if (next >= STEPS.length) { running = false; setSpeedDis(false); return; }
            applyStep(next, () => {
                if (next === STEPS.length - 1) { running = false; btnStep.disabled = true; setSpeedDis(false); }
                else timer = setTimeout(tick, speed);
            });
        }
        tick();
    }

    function vmStep() {
        if (running) return;
        const next = stepIdx + 1;
        if (next >= STEPS.length) return;
        applyStep(next, null);
        if (next === STEPS.length - 1) { btnPlay.disabled = true; btnStep.disabled = true; }
    }

    function vmReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false; stepIdx = -1; activeSet.clear(); resultState = null;
        pktQueue = []; pktCurrent = null; pktProg = 0; pktDone = null;
        setLog('▶ PLAY를 눌러 가상 주소 변환 과정을 확인하세요.');
        setBadge('IDLE');
        btnPlay.disabled = false; btnStep.disabled = false; setSpeedDis(false);
        draw();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.virt-mem__speed-btn').forEach(b => b.classList.remove('virt-mem__speed-btn--active'));
        btn.classList.add('virt-mem__speed-btn--active');
    }

    /* ===================== 마우스 이벤트 ===================== */
    canvas.addEventListener('mousemove', function (e) {
        const rect = canvas.getBoundingClientRect();
        mousePos.x = (e.clientX - rect.left) * (GW() / rect.width);
        mousePos.y = (e.clientY - rect.top)  * (GH() / rect.height);
        const hit = tooltipHits.find(h =>
            mousePos.x >= h.x && mousePos.x <= h.x+h.w &&
            mousePos.y >= h.y && mousePos.y <= h.y+h.h);
        const nk = hit ? hit.key : null;
        if (nk !== hoveredKey) {
            hoveredKey = nk;
            canvas.style.cursor = nk ? 'help' : 'default';
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