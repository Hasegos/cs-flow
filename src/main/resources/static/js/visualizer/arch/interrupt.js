/**
 * 인터럽트 인터랙티브 시각화
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

    const root    = el('div', 'intr');
    const toolbar = el('div', 'intr__toolbar');
    const tbLeft  = el('div', 'intr__toolbar-left');
    tbLeft.appendChild(el('span', 'intr__title', 'INTERRUPT'));
    const badge = el('span', 'intr__step-badge', 'IDLE');
    tbLeft.appendChild(badge);
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'intr__speed');
    speedWrap.appendChild(el('span', 'intr__speed-label', 'SPEED'));
    [['1x', 1000], ['2x', 500], ['3x', 200]].forEach(function(pair, i) {
        const lbl = pair[0], ms = pair[1];
        const b = el('button', 'intr__speed-btn' + (i === 0 ? ' intr__speed-btn--active' : ''), lbl);
        b.addEventListener('click', function () { if (!running) setSpeed(ms, b); });
        speedWrap.appendChild(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'intr__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'intr__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const logEl = el('div', 'intr__log', '▶ PLAY를 눌러 인터럽트 처리 과정을 확인하세요.');
    root.appendChild(logEl);

    const controls = el('div', 'intr__controls');
    const btnPlay  = el('button', 'intr__btn intr__btn--primary', '▶ PLAY');
    const btnStep  = el('button', 'intr__btn', '▶| STEP');
    const btnReset = el('button', 'intr__btn', '↺ RESET');
    btnPlay.addEventListener('click',  intrStart);
    btnStep.addEventListener('click',  intrStep);
    btnReset.addEventListener('click', intrReset);
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
        const w   = canvasWrap.offsetWidth;
        const mob = w < 520;
        const minH = mob ? 260 : 460;
        const h    = Math.max(canvasWrap.offsetHeight, minH);
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    /* ===================== 팔레트 ===================== */
    const PALETTE = window.CsFlow.PALETTE;
    let P = window.CsFlow.getP();

    /* ===================== 툴팁 ===================== */
    const TOOLTIPS = {
        CPU:   'CPU\n명령어를 실행하는 프로세서. 인터럽트 신호를 감지하면 현재 작업을 중단한다.',
        PIC:   'PIC (Programmable Interrupt Controller)\n하드웨어 장치로부터 인터럽트를 수집하고 우선순위를 조정해 CPU에 전달한다.',
        IVT:   'IVT (Interrupt Vector Table)\n인터럽트 번호와 ISR 주소를 매핑한 테이블. CPU가 이를 참조해 ISR을 찾는다.',
        STACK: 'Stack (컨텍스트 저장)\nPC·레지스터 등 현재 실행 상태를 저장한다. ISR 종료 후 복원해 원래 작업을 재개한다.',
        ISR:   'ISR (Interrupt Service Routine)\n인터럽트를 실제로 처리하는 함수. 처리 완료 후 RETI 명령으로 원래 흐름으로 복귀한다.',
    };

    /* ===================== 시나리오 정의 ===================== */
    const STEPS = [
        {
            badge: 'CPU 실행 중',
            phase: 'normal',
            log:   'Step 1 — CPU가 프로그램을 정상 실행 중입니다. 키보드에서 인터럽트 신호(IRQ1)가 발생했습니다! PIC가 이를 감지합니다.',
            active: ['CPU', 'PIC'],
            arrow:  [['CPU', 'PIC', 'signal']],
        },
        {
            badge: 'CONTEXT 저장',
            phase: 'save',
            log:   'Step 2 — CPU가 현재 PC(프로그램 카운터)와 레지스터 값을 스택에 저장합니다. 나중에 원래 위치로 돌아오기 위한 필수 과정입니다.',
            active: ['CPU', 'STACK'],
            arrow:  [['CPU', 'STACK', 'save']],
        },
        {
            badge: 'IVT 조회',
            phase: 'ivt',
            log:   'Step 3 — CPU가 인터럽트 번호(IRQ1 = 키보드)를 인터럽트 벡터 테이블에서 검색합니다. ISR의 주소 0x0204를 찾았습니다.',
            active: ['CPU', 'IVT'],
            arrow:  [['CPU', 'IVT', 'lookup']],
        },
        {
            badge: 'ISR 실행',
            phase: 'isr',
            log:   'Step 4 — CPU가 키보드 ISR(0x0204)로 점프해 인터럽트를 처리합니다. 키 입력 데이터를 읽고 버퍼에 저장합니다.',
            active: ['IVT', 'ISR'],
            arrow:  [['IVT', 'ISR', 'jump']],
        },
        {
            badge: 'RETI 복귀',
            phase: 'return',
            log:   'Step 5 — ISR이 완료됐습니다. RETI 명령이 실행되어 스택에서 PC·레지스터를 복원하고 원래 프로그램으로 돌아갑니다.',
            active: ['ISR', 'STACK', 'CPU'],
            arrow:  [['ISR', 'STACK', 'restore'], ['STACK', 'CPU', 'resume']],
        },
    ];

    /* ===================== 상태 ===================== */
    let stepIdx   = -1;
    let running   = false;
    let timer     = null;
    let speed     = 1800;
    let activeSet = new Set();
    let phase     = 'normal';

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

    /* ===================== 레이아웃 ===================== */
    function buildLayout() {
        const W = GW(), H = GH();
        const mob = W < 520;

        const nw = mob ? 80  : 120;
        const nh = mob ? 52  : 70;

        if (mob) {
            const colX0 = 6;
            const colX1 = W - nw - 6;
            const usableH = H - 30 - 10;
            const gap     = Math.max(14, (usableH - nh * 3) / 2);
            const rowY0   = 10;
            const rowY1   = rowY0 + nh + gap;
            const rowY2   = rowY1 + nh + gap;

            const nodes = {
                CPU:   { x: colX0, y: rowY0, w: nw, h: nh, col: P.purple, lbl: 'CPU',   sub: 'Processor' },
                PIC:   { x: colX1, y: rowY0, w: nw, h: nh, col: P.orange, lbl: 'PIC',   sub: 'IRQ 컨트롤러' },
                STACK: { x: colX0, y: rowY1, w: nw, h: nh, col: P.teal,   lbl: 'STACK', sub: '컨텍스트' },
                IVT:   { x: colX1, y: rowY1, w: nw, h: nh, col: P.yellow, lbl: 'IVT',   sub: '벡터 테이블' },
                ISR:   { x: W/2 - nw/2, y: rowY2, w: nw, h: nh, col: P.green, lbl: 'ISR', sub: '처리 루틴' },
            };
            return { W, H, mob, nw, nh, nodes };
        }

        const padX = 32;
        const colW = (W - padX * 2 - nw) / 3;
        const x0   = padX;
        const x1   = padX + colW + nw / 2;
        const x2   = padX + (colW + nw / 2) * 2;
        const rowY0 = 30;
        const rowY1 = rowY0 + nh + 80;

        const nodes = {
            CPU:   { x: x0,              y: rowY0, w: nw, h: nh, col: P.purple, lbl: 'CPU',   sub: 'Processor' },
            PIC:   { x: x1,              y: rowY0, w: nw, h: nh, col: P.orange, lbl: 'PIC',   sub: 'IRQ Controller' },
            STACK: { x: x0,              y: rowY1, w: nw, h: nh, col: P.teal,   lbl: 'STACK', sub: 'Context Save' },
            IVT:   { x: x1,              y: rowY1, w: nw, h: nh, col: P.yellow, lbl: 'IVT',   sub: 'Vector Table' },
            ISR:   { x: x2,              y: rowY1, w: nw, h: nh, col: P.green,  lbl: 'ISR',   sub: 'Service Routine' },
        };
        return { W, H, mob, nw, nh, nodes };
    }

    function nc(n) { return { x: n.x + n.w / 2, y: n.y + n.h / 2 }; }

    /* ===================== 엣지 그리기 ===================== */
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

    function edgeMid(a, b, margin) {
        const m = margin || 0.18;
        const ca = nc(a), cb = nc(b);
        return {
            x1: ca.x + (cb.x - ca.x) * m,
            y1: ca.y + (cb.y - ca.y) * m,
            x2: ca.x + (cb.x - ca.x) * (1 - m),
            y2: ca.y + (cb.y - ca.y) * (1 - m),
        };
    }

    /* ===================== 엣지 정의 ===================== */
    const EDGES = [
        ['CPU', 'PIC'],
        ['CPU', 'STACK'],
        ['CPU', 'IVT'],
        ['IVT', 'ISR'],
        ['ISR', 'STACK'],
    ];

    function getArrowCol(a, b) {
        if (stepIdx < 0) return P.border;
        const step = STEPS[stepIdx];
        for (let i = 0; i < step.arrow.length; i++) {
            const arr = step.arrow[i];
            if ((arr[0] === a && arr[1] === b) || (arr[0] === b && arr[1] === a)) {
                const type = arr[2];
                if (type === 'signal')  return P.orange;
                if (type === 'save')    return P.teal;
                if (type === 'lookup')  return P.yellow;
                if (type === 'jump')    return P.green;
                if (type === 'restore') return P.teal;
                if (type === 'resume')  return P.purple;
            }
        }
        return null;
    }

    function drawEdges(L) {
        const { nodes } = L;
        EDGES.forEach(function (pair) {
            const a = pair[0], b = pair[1];
            if (!nodes[a] || !nodes[b]) return;
            const col = getArrowCol(a, b);
            const e   = edgeMid(nodes[a], nodes[b]);
            drawArrow(e.x1, e.y1, e.x2, e.y2, col || P.border, !!col);
        });
    }

    /* ===================== 노드 그리기 ===================== */
    function drawNodes(L) {
        const { nodes, mob } = L;
        const fMd = mob ? 12 : 15;
        const fSm = mob ? 9  : 11;

        Object.entries(nodes).forEach(function (entry) {
            const key = entry[0], n = entry[1];
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
            const isHovQ = hoveredKey === key;
            ctx.beginPath();
            ctx.arc(qx, qy, 6, 0, Math.PI * 2);
            ctx.fillStyle   = isHovQ ? col : P.surf2; ctx.fill();
            ctx.strokeStyle = isHovQ ? col : P.muted;  ctx.lineWidth = 1; ctx.stroke();
            tx('?', qx, qy, 7, isHovQ ? '#fff' : P.muted, 'center', true);
            tooltipHits.push({ x: qx - 6, y: qy - 6, w: 12, h: 12, key: key });
        });
    }

    /* ===================== IRQ 레이블 그리기 ===================== */
    function drawIRQLabel(L) {
        if (stepIdx < 0) return;
        const step  = STEPS[stepIdx];
        const { W, H, mob } = L;

        /* phase 별 상태 텍스트 */
        const phaseMap = {
            'normal':  ['IRQ1 감지 (키보드)', P.orange],
            'save':    ['PC + Registers → Stack', P.teal],
            'ivt':     ['IRQ1 → ISR 주소: 0x0204', P.yellow],
            'isr':     ['ISR 실행 중 (키 입력 처리)', P.green],
            'return':  ['RETI → 원래 작업 복귀', P.purple],
        };
        const info = phaseMap[step.phase];
        if (!info) return;

        const fy = mob ? H - 22 : H - 18;
        tx(info[0], W / 2, fy, mob ? 13 : 14, info[1], 'center', true);
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

    function spawnPkt(from, to, col, lbl) { pktQueue.push({ from: from, to: to, col: col, lbl: lbl }); }

    function pktNext() {
        if (!pktQueue.length) {
            pktCurrent = null;
            draw();
            if (pktDone) { const cb = pktDone; pktDone = null; cb(); }
            return;
        }
        pktCurrent = pktQueue.shift();
        pktProg = 0;
        activeSet.add(pktCurrent.from);
        activeSet.add(pktCurrent.to);
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
        const W = GW(), H = GH();
        const mob = W < 520;
        const pad = 14;
        const maxDescW = mob ? Math.min(W - 32, 200) : 280;

        /* desc 줄바꿈 계산 */
        ctx.font = '400 12px "JetBrains Mono",monospace';
        const descLines = [];
        if (desc) {
            const words = desc.split(' ');
            let line = '';
            words.forEach(function (word) {
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

        const lineH  = 18;
        const titleH = 24;
        const th = titleH + (descLines.length > 0 ? descLines.length * lineH + 8 : 0);

        ctx.font = '700 13px "JetBrains Mono",monospace';
        const tw1 = ctx.measureText(title).width;
        ctx.font = '400 12px "JetBrains Mono",monospace';
        const tw2 = descLines.reduce(function (mx2, l) { return Math.max(mx2, ctx.measureText(l).width); }, 0);
        const tw = Math.min(Math.max(tw1, tw2) + pad * 2, maxDescW);

        let tx_ = mx + 14, ty_ = my - th - 8;
        if (tx_ + tw > W - 8) tx_ = mx - tw - 14;
        if (tx_ < 8)          tx_ = 8;
        if (ty_ < 8)          ty_ = my + 14;
        if (ty_ + th > H - 8) ty_ = H - th - 8;

        rr(tx_, ty_, tw, th, 6, P.surf2, P.purple + 'cc', 2);

        ctx.font = '700 13px "JetBrains Mono",monospace';
        ctx.fillStyle = P.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(title, tx_ + pad, ty_ + titleH / 2);

        if (descLines.length > 0) {
            ctx.font = '400 12px "JetBrains Mono",monospace';
            ctx.fillStyle = P.sub;
            descLines.forEach(function (l, i) {
                ctx.fillText(l, tx_ + pad, ty_ + titleH + 4 + i * lineH + lineH / 2);
            });
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
        drawNodes(L);
        drawIRQLabel(L);
        drawPacket(L);

        if (hoveredKey && TOOLTIPS[hoveredKey]) drawTooltip(mousePos.x, mousePos.y, hoveredKey);
    }

    /* ===================== 단계 제어 ===================== */
    function setLog(s)   { logEl.textContent = s; }
    function setBadge(s) {
        badge.textContent = s;
        badge.className = 'intr__step-badge' + (s !== 'IDLE' ? ' intr__step-badge--active' : '');
    }
    function setSpeedDis(v) {
        root.querySelectorAll('.intr__speed-btn').forEach(function (b) { b.disabled = v; });
    }

    function applyStep(idx, onDone) {
        stepIdx = idx;
        const step = STEPS[idx];
        phase = step.phase;
        setBadge(step.badge);
        setLog(step.log);
        activeSet.clear();
        pktQueue = [];

        /* 화살표별 패킷 색상 */
        const colMap = {
            signal:  P.orange,
            save:    P.teal,
            lookup:  P.yellow,
            jump:    P.green,
            restore: P.teal,
            resume:  P.purple,
        };
        const lblMap = {
            signal:  'IRQ',
            save:    'CTX',
            lookup:  'VEC',
            jump:    'JMP',
            restore: 'RST',
            resume:  'RET',
        };

        step.arrow.forEach(function (arr) {
            spawnPkt(arr[0], arr[1], colMap[arr[2]], lblMap[arr[2]]);
        });

        animPkts(function () {
            draw();
            if (onDone) setTimeout(onDone, 0);
        });
    }

    /* ===================== 컨트롤 ===================== */
    function intrStart() {
        if (running) return;
        running = true;
        btnPlay.disabled = true;
        btnStep.disabled = true;
        setSpeedDis(true);
        function tick() {
            const next = stepIdx + 1;
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

    function intrStep() {
        if (running) return;
        const next = stepIdx + 1;
        if (next >= STEPS.length) return;
        applyStep(next, null);
        if (next === STEPS.length - 1) {
            btnPlay.disabled = true;
            btnStep.disabled = true;
        }
    }

    function intrReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false;
        stepIdx = -1;
        phase   = 'normal';
        activeSet.clear();
        pktQueue   = [];
        pktCurrent = null;
        pktProg    = 0;
        pktDone    = null;
        setLog('▶ PLAY를 눌러 인터럽트 처리 과정을 확인하세요.');
        setBadge('IDLE');
        btnPlay.disabled = false;
        btnStep.disabled = false;
        setSpeedDis(false);
        draw();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.intr__speed-btn').forEach(function (b) {
            b.classList.remove('intr__speed-btn--active');
        });
        btn.classList.add('intr__speed-btn--active');
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
        onPause    : function () { setSpeedDis(false); },
        getMouseCtx: function () {
            return {
                GW         : GW,
                GH         : GH,
                mousePos   : mousePos,
                tooltipHits: tooltipHits,
                hoveredKey : function ()  { return hoveredKey; },
                setHoveredKey: function (k) { hoveredKey = k; },
                draw       : draw,
            };
        },
    });

    /* ===================== 초기화 ===================== */
    setTimeout(resize, 60);
})();