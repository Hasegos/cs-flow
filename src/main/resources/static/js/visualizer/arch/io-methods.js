/**
 * I/O 방식 인터랙티브 시각화
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

    const root    = el('div', 'io-viz');
    const toolbar = el('div', 'io-viz__toolbar');
    const tbLeft  = el('div', 'io-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'io-viz__title', 'I/O Methods'));
    const badge = el('span', 'io-viz__step-badge', 'IDLE');
    tbLeft.appendChild(badge);
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'io-viz__speed');
    speedWrap.appendChild(el('span', 'io-viz__speed-label', 'SPEED'));
    [['1x', 1100], ['2x', 550], ['3x', 220]].forEach(([lbl, ms], i) => {
        const b = el('button', 'io-viz__speed-btn' + (i === 0 ? ' io-viz__speed-btn--active' : ''), lbl);
        b.addEventListener('click', () => { if (!running) setSpeed(ms, b); });
        speedWrap.appendChild(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'io-viz__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'io-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const logEl = el('div', 'io-viz__log', '▶ PLAY를 눌러 I/O 방식별 동작 과정을 확인하세요.');
    root.appendChild(logEl);

    const controls = el('div', 'io-viz__controls');
    const btnPlay  = el('button', 'io-viz__btn io-viz__btn--primary', '▶ PLAY');
    const btnStep  = el('button', 'io-viz__btn', '▶| STEP');
    const btnReset = el('button', 'io-viz__btn', '↺ RESET');
    btnPlay.addEventListener('click',  ioStart);
    btnStep.addEventListener('click',  ioStep);
    btnReset.addEventListener('click', ioReset);
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
        const minH = mob ? 340 : 440;
        const h    = Math.max(canvasWrap.offsetHeight, minH);
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    /* ===================== 팔레트 ===================== */
    const PALETTE = window.CsFlow.PALETTE;
    let P = window.CsFlow.getP();

    /* ===================== 약어 툴팁 ===================== */
    const TOOLTIPS = {
        CPU:  'CPU\n명령어를 실행하고 I/O를 요청하는 프로세서',
        BUS:  'System Bus\nCPU·메모리·장치가 데이터를 주고받는 통로',
        DEV:  'Device Controller\n실제 I/O 장치(디스크·키보드 등)를 제어하는 하드웨어',
        MEM:  'Memory (RAM)\n데이터가 최종적으로 저장되는 주기억장치',
        INTC: 'Interrupt Controller\n장치가 보내는 인터럽트 신호를 CPU에 전달하는 회로',
    };

    /* ===================== 시나리오 정의 ===================== */
    const STEPS = [
        {
            badge:  'PROGRAMMED I/O',
            result: 'pio',
            log:    'Step 1 — Programmed I/O: CPU가 장치 레지스터를 직접 반복 폴링합니다. I/O 완료까지 CPU는 다른 일을 못 하고 대기(Busy-Wait)합니다.',
            path:   ['CPU', 'BUS', 'DEV', 'BUS', 'CPU'],
            cols:   [P.purple, P.purple, P.orange, P.orange, P.purple],
            note:   'CPU BUSY-WAIT',
        },
        {
            badge:  'INTERRUPT-DRIVEN',
            result: 'irq',
            log:    'Step 2 — Interrupt-Driven I/O: CPU가 I/O를 요청한 뒤 다른 작업을 계속합니다. 장치가 완료되면 Interrupt Controller를 통해 CPU에 인터럽트를 보냅니다.',
            path:   ['CPU', 'BUS', 'DEV', 'DEV', 'INTC', 'CPU'],
            cols:   [P.purple, P.teal, P.teal, P.green, P.green, P.green],
            note:   'CPU FREE → IRQ',
        },
        {
            badge:  'DMA TRANSFER',
            result: 'dma-run',
            log:    'Step 3 — DMA: CPU는 DMA 컨트롤러(Device Controller 내장)에 전송을 위임합니다. DMA가 장치↔메모리 직접 전송을 수행하는 동안 CPU는 자유롭습니다.',
            path:   ['CPU', 'BUS', 'DEV', 'BUS', 'MEM'],
            cols:   [P.purple, P.yellow, P.yellow, P.yellow, P.yellow],
            note:   'CPU FREE → DMA runs',
        },
        {
            badge:  'DMA COMPLETE',
            result: 'dma-done',
            log:    'Step 4 — DMA 완료: 전송이 끝나면 DMA가 Interrupt Controller를 통해 CPU에 완료 인터럽트를 보냅니다. CPU는 결과만 확인합니다.',
            path:   ['DEV', 'INTC', 'CPU'],
            cols:   [P.green, P.green, P.purple],
            note:   'DMA DONE → IRQ',
        },
    ];

    /* ===================== 상태 ===================== */
    let stepIdx    = -1;
    let running    = false;
    let timer      = null;
    let speed      = 1100;
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

        const nw = mob ? 72  : 124;
        const nh = mob ? 50  : 68;

        if (mob) {
            const panelH = 44 + 10;
            const hGap   = Math.max(6, (W - 16 - nw * 3) / 2);
            const vGap   = Math.max(20, (H - 24 - nh * 2 - panelH) / 3);
            const row1Y  = vGap;
            const row2Y  = row1Y + nh + vGap;

            const nodes = {
                CPU:  { x: 8,              y: row1Y, w: nw, h: nh, col: P.purple, lbl: 'CPU',  sub: 'Processor' },
                BUS:  { x: 8+nw+hGap,     y: row1Y, w: nw, h: nh, col: P.teal,   lbl: 'BUS',  sub: 'Sys Bus' },
                DEV:  { x: 8+(nw+hGap)*2, y: row1Y, w: nw, h: nh, col: P.orange, lbl: 'DEV',  sub: 'Controller' },
                MEM:  { x: 8+nw+hGap,     y: row2Y, w: nw, h: nh, col: P.yellow, lbl: 'MEM',  sub: 'RAM' },
                INTC: { x: 8+(nw+hGap)*2, y: row2Y, w: nw, h: nh, col: P.green,  lbl: 'INTC', sub: 'IRQ Ctrl' },
            };
            return { W, H, mob, nw, nh, nodes };
        }

        const hGap = Math.max(50, (W - 56 - nw * 3) / 2);
        const vGap = Math.max(70, (H - 56 - nh * 2) / 1);
        const row1Y = 28;
        const row2Y = row1Y + nh + vGap;
        const x0 = 28, x1 = 28 + nw + hGap, x2 = 28 + (nw + hGap) * 2;

        const nodes = {
            CPU:  { x: x0, y: row1Y, w: nw, h: nh, col: P.purple, lbl: 'CPU',  sub: 'Processor' },
            BUS:  { x: x1, y: row1Y, w: nw, h: nh, col: P.teal,   lbl: 'BUS',  sub: 'System Bus' },
            DEV:  { x: x2, y: row1Y, w: nw, h: nh, col: P.orange, lbl: 'DEV',  sub: 'Device Controller' },
            MEM:  { x: x1, y: row2Y, w: nw, h: nh, col: P.yellow, lbl: 'MEM',  sub: 'Memory (RAM)' },
            INTC: { x: x2, y: row2Y, w: nw, h: nh, col: P.green,  lbl: 'INTC', sub: 'Interrupt Ctrl' },
        };
        return { W, H, mob, nw, nh, nodes };
    }

    function nc(n) { return { x: n.x + n.w / 2, y: n.y + n.h / 2 }; }

    /* ===================== 연결선 ===================== */
    function drawEdges(L) {
        const { nodes } = L;
        const step = stepIdx >= 0 ? STEPS[stepIdx] : null;

        function isActive(a, b) {
            if (!step) return false;
            for (let i = 0; i < step.path.length - 1; i++) {
                if ((step.path[i] === a && step.path[i+1] === b) ||
                    (step.path[i] === b && step.path[i+1] === a))
                    return true;
            }
            return false;
        }
        function edgeCol(a, b) {
            if (!step) return P.border;
            for (let i = 0; i < step.path.length - 1; i++) {
                if ((step.path[i] === a && step.path[i+1] === b) ||
                    (step.path[i] === b && step.path[i+1] === a))
                    return step.cols[i];
            }
            return P.border;
        }

        [['CPU','BUS'], ['BUS','DEV'], ['BUS','MEM'], ['DEV','INTC'], ['INTC','CPU']].forEach(([a, b]) => {
            const ca = nc(nodes[a]), cb = nc(nodes[b]);
            const act = isActive(a, b);
            const margin = 0.18;
            dottedArrow(
                ca.x + (cb.x - ca.x) * margin, ca.y + (cb.y - ca.y) * margin,
                ca.x + (cb.x - ca.x) * (1 - margin), ca.y + (cb.y - ca.y) * (1 - margin),
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
                isAct ? col + '28' : isHov ? P.purple + '18' : P.surf,
                isAct ? col : isHov ? P.purple : P.border,
                isAct ? 2.5 : isHov ? 2 : 1.5);

            const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
            tx(n.lbl, cx, cy - (mob ? 7 : 9), fMd, isAct ? col : isHov ? P.purple : P.text, 'center', true);
            tx(n.sub, cx, cy + (mob ? 7 : 10), fSm, P.muted, 'center', false);

            const qx = n.x + n.w - 9, qy = n.y + 9;
            ctx.beginPath(); ctx.arc(qx, qy, 6, 0, Math.PI * 2);
            ctx.fillStyle   = isHov ? col : P.surf2; ctx.fill();
            ctx.strokeStyle = isHov ? col : P.muted; ctx.lineWidth = 1; ctx.stroke();
            tx('?', qx, qy, 7, isHov ? '#fff' : P.muted, 'center', true);
            tooltipHits.push({ x: qx - 6, y: qy - 6, w: 12, h: 12, key });
        });

        if (resultState && stepIdx >= 0) {
            const step = STEPS[stepIdx];
            const { W, H, mob } = L;
            const infoMap = {
                'pio':      [step.note, P.orange],
                'irq':      [step.note, P.green ],
                'dma-run':  [step.note, P.yellow],
                'dma-done': [step.note, P.green ],
            };
            const info = infoMap[resultState];
            if (info) {
                tx(info[0], W / 2, mob ? H - 16 : H - 16, mob ? 10 : 12, info[1], 'center', true);
            }
        }
    }

    /* ===================== 정보 패널 ===================== */
    function drawInfoPanel(L) {
        if (stepIdx < 0) return;
        const { W, H, mob, nodes, nh } = L;

        const labels = {
            'pio':      [['방식', 'Programmed I/O'], ['CPU', 'Busy-Wait'], ['전송', 'CPU 직접']],
            'irq':      [['방식', 'Interrupt-Driven'], ['CPU', 'Free→IRQ'], ['전송', 'CPU 직접']],
            'dma-run':  [['방식', 'DMA'], ['CPU', 'Free'], ['전송', 'DMA 직접']],
            'dma-done': [['방식', 'DMA'], ['CPU', 'IRQ만 처리'], ['전송', '완료']],
        };
        const rows = labels[resultState] || labels['pio'];

        if (mob) {
            /* 모바일: MEM 노드 바로 아래 배치 */
            const mem  = nodes['MEM'];
            const pw   = W - 16;
            const ph   = 58;
            const px   = 8;
            const py   = mem.y + nh + 30;

            rr(px, py, pw, ph, 8, P.surf2, P.purple + '55', 1.5);

            const cellW = pw / rows.length;
            rows.forEach(([k, v], i) => {
                const cx = px + cellW * i + cellW / 2;
                tx(k, cx, py + ph * 0.30, 12,  P.muted, 'center', false);
                tx(v, cx, py + ph * 0.70, 13, P.text,  'center', true);
            });
        } else {
            const pw = 230;
            const ph = 138;
            const px = W - pw - 20;
            const py = H / 2 - ph / 2;

            rr(px, py, pw, ph, 8, P.surf2, P.purple + '55', 1.5);

            tx('I/O 방식 비교', px + pw / 2, py + 20, 13, P.muted, 'center', false);
            rows.forEach(([k, v], i) => {
                const ry = py + 48 + i * 30;
                tx(k, px + 18, ry, 13, P.sub,  'left',  false);
                tx(v, px + pw - 14, ry, 13, P.text, 'right', true);
            });
        }
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
        ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2);
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
        const BASE_SPEED = 1100;
        const baseStep   = 0.0055;
        const step       = baseStep * (BASE_SPEED / speed);
        (function tick() {
            pktProg = Math.min(1, pktProg + step);
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
        const pad = 14, tw = Math.max(tw1, tw2) + pad * 2, th = desc ? 60 : 36;
        const W = GW(), H = GH();
        let tx_ = mx + 14, ty_ = my - th - 8;
        if (tx_ + tw > W - 8) tx_ = mx - tw - 14;
        if (tx_ < 8)          tx_ = 8;
        if (ty_ < 8)          ty_ = my + 14;
        if (ty_ + th > H - 8) ty_ = H - th - 8;
        rr(tx_, ty_, tw, th, 6, P.surf2, P.purple + 'cc', 2);
        ctx.font = '700 14px "JetBrains Mono",monospace';
        ctx.fillStyle = P.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(title, tx_ + pad, ty_ + (desc ? 18 : th / 2));
        if (desc) {
            ctx.font = '400 13px "JetBrains Mono",monospace';
            ctx.fillStyle = P.sub;
            ctx.fillText(desc, tx_ + pad, ty_ + 42);
        }
    }

    /* ===================== 단계 제어 ===================== */
    function setLog(s)   { logEl.textContent = s; }
    function setBadge(s) {
        badge.textContent = s;
        badge.className = 'io-viz__step-badge' + (s !== 'IDLE' ? ' io-viz__step-badge--active' : '');
    }
    function setSpeedDisabled(v) {
        root.querySelectorAll('.io-viz__speed-btn').forEach(b => { b.disabled = v; });
    }

    function applyStep(idx, onDone) {
        stepIdx = idx;
        const step = STEPS[idx];
        setBadge(step.badge);
        setLog(step.log);
        resultState = null;
        activeSet.clear();
        pktQueue = [];

        for (let i = 0; i < step.path.length - 1; i++) {
            spawnPkt(step.path[i], step.path[i + 1], step.cols[i], step.path[i + 1]);
        }
        animPkts(() => {
            resultState = step.result;
            draw();
            onDone && setTimeout(onDone, 0);
        });
    }

    /* ===================== 컨트롤 ===================== */
    function ioStart() {
        if (running) return;
        running = true; btnPlay.disabled = true; btnStep.disabled = true; setSpeedDisabled(true);
        function tick() {
            const next = stepIdx + 1;
            if (next >= STEPS.length) { running = false; setSpeedDisabled(false); return; }
            applyStep(next, () => {
                if (next === STEPS.length - 1) { running = false; btnStep.disabled = true; setSpeedDisabled(false); }
                else timer = setTimeout(tick, speed);
            });
        }
        tick();
    }

    function ioStep() {
        if (running) return;
        const next = stepIdx + 1;
        if (next >= STEPS.length) return;
        applyStep(next, null);
        if (next === STEPS.length - 1) { btnPlay.disabled = true; btnStep.disabled = true; }
    }

    function ioReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false; stepIdx = -1; activeSet.clear(); resultState = null;
        pktQueue = []; pktCurrent = null; pktProg = 0; pktDone = null;
        setLog('▶ PLAY를 눌러 I/O 방식별 동작 과정을 확인하세요.');
        setBadge('IDLE');
        btnPlay.disabled = false; btnStep.disabled = false; setSpeedDisabled(false);
        draw();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.io-viz__speed-btn').forEach(b => b.classList.remove('io-viz__speed-btn--active'));
        btn.classList.add('io-viz__speed-btn--active');
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        ctx.fillStyle = P.bg; ctx.fillRect(0, 0, GW(), GH());
        tooltipHits = [];

        const L = buildLayout();
        drawEdges(L);
        drawNodes(L);
        drawInfoPanel(L);
        drawPacket(L);

        if (hoveredKey && TOOLTIPS[hoveredKey]) drawTooltip(mousePos.x, mousePos.y, hoveredKey);
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
        onPause    : function () { setSpeedDisabled(false); },
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