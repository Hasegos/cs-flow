/**
 * CPU 구성 요소 인터랙티브 시각화
 */
(function () {
    'use strict';

    const container = document.getElementById('visualizer-container');
    if (!container) return;

    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls)  e.className = cls;
        if (text) e.textContent = text;
        return e;
    }

    /* ===================== UI 구성 ===================== */
    const root = el('div', 'cpu');

    const toolbar = el('div', 'cpu__toolbar');
    const tbLeft  = el('div', 'cpu__toolbar-left');
    tbLeft.appendChild(el('span', 'cpu__title', 'CPU Components'));
    const badge = el('span', 'cpu__step-badge', 'IDLE');
    badge.id = 'cpu-badge';
    tbLeft.appendChild(badge);
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'cpu__speed');
    speedWrap.appendChild(el('span', 'cpu__speed-label', 'SPEED'));
    [['1x', 2000], ['2x', 1000], ['3x', 400]].forEach(([label, ms], i) => {
        const btn = el('button', 'cpu__speed-btn' + (i === 0 ? ' cpu__speed-btn--active' : ''), label);
        btn.dataset.ms = ms;
        btn.addEventListener('click', () => {
            if (running) return;
            setSpeed(ms, btn);
        });
        speedWrap.appendChild(btn);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'cpu__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'cpu__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const logEl = el('div', 'cpu__log', '▶ PLAY를 눌러 CPU 구성 요소의 동작을 확인하세요.');
    logEl.id = 'cpu-log';
    root.appendChild(logEl);

    const controls = el('div', 'cpu__controls');
    const btnPlay  = el('button', 'cpu__btn cpu__btn--primary', '▶ PLAY');
    const btnStep  = el('button', 'cpu__btn', '▶| STEP');
    const btnReset = el('button', 'cpu__btn', '↺ RESET');
    btnPlay.id = 'cpu-btn-play';
    btnStep.id = 'cpu-btn-step';
    btnPlay.addEventListener('click',  cpuStart);
    btnStep.addEventListener('click',  cpuStep);
    btnReset.addEventListener('click', cpuReset);
    controls.appendChild(btnPlay);
    controls.appendChild(btnStep);
    controls.appendChild(btnReset);
    root.appendChild(controls);

    container.appendChild(root);

    /* ===================== 캔버스 ===================== */
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    function resize() {
        const w = canvasWrap.offsetWidth;
        const h = Math.max(canvasWrap.offsetHeight, 340);
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    const GW = () => canvas.width  / dpr;
    const GH = () => canvas.height / dpr;

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

    /* ===================== 약어 툴팁 데이터 ===================== */
    const TOOLTIPS = {
        'PC':  'Program Counter\n다음에 실행할 명령어의 메모리 주소를 보관',
        'IR':  'Instruction Register\n인출한 명령어를 보관',
        'MAR': 'Memory Address Register\n메모리에 접근할 주소를 임시 저장',
        'MBR': 'Memory Buffer Register\n메모리와 주고받는 데이터를 임시 저장',
        'ACC': 'Accumulator\n연산 중간 결과를 임시 저장',
        'ALU': 'Arithmetic Logic Unit\n산술·논리 연산을 수행하는 회로',
        'CU':  'Control Unit\n명령어를 해석하고 각 장치를 제어',
    };

    let tooltipHits = [];
    let mousePos    = { x: -1, y: -1 };
    let hoveredKey  = null;

    /* ===================== 시뮬레이션 데이터 ===================== */
    const STEPS = [
        { active:'PC',  flow:null,                   regs:{PC:'0x04',IR:'—',      MAR:'—',    MBR:'—',     ACC:'5'}, alu:false, cu:false, badge:'FETCH',   log:'[PC] 다음 명령어 주소 0x04를 MAR로 전달합니다.' },
        { active:'MAR', flow:{from:'PC',  to:'MAR'}, regs:{PC:'0x04',IR:'—',      MAR:'0x04', MBR:'—',     ACC:'5'}, alu:false, cu:false, badge:'FETCH',   log:'[MAR] 메모리 주소 0x04 저장 완료. 메모리에서 명령어를 읽습니다.' },
        { active:'MBR', flow:{from:'MEM', to:'MBR'}, regs:{PC:'0x04',IR:'—',      MAR:'0x04', MBR:'ADD 10',ACC:'5'}, alu:false, cu:false, badge:'FETCH',   log:'[MBR] 메모리[0x04]에서 명령어 "ADD 0x10"을 읽어 MBR에 저장했습니다.' },
        { active:'IR',  flow:{from:'MBR', to:'IR'},  regs:{PC:'0x05',IR:'ADD 10', MAR:'0x04', MBR:'ADD 10',ACC:'5'}, alu:false, cu:true,  badge:'DECODE',  log:'[IR → CU] 명령어를 IR에 적재. CU가 명령어를 해석합니다.' },
        { active:'MAR', flow:{from:'CU',  to:'MAR'}, regs:{PC:'0x05',IR:'ADD 10', MAR:'0x10', MBR:'ADD 10',ACC:'5'}, alu:false, cu:true,  badge:'DECODE',  log:'[CU → MAR] CU가 피연산자 주소 0x10을 MAR로 전달합니다.' },
        { active:'MBR', flow:{from:'MEM', to:'MBR'}, regs:{PC:'0x05',IR:'ADD 10', MAR:'0x10', MBR:'3',     ACC:'5'}, alu:false, cu:false, badge:'EXECUTE', log:'[메모리 → MBR] 메모리[0x10] = 3 읽기 완료.' },
        { active:'ALU', flow:{from:'MBR', to:'ALU'}, regs:{PC:'0x05',IR:'ADD 10', MAR:'0x10', MBR:'3',     ACC:'5'}, alu:true,  cu:false, badge:'EXECUTE', log:'[ALU] ACC(5) + MBR(3) 덧셈 연산 수행 중...' },
        { active:'ACC', flow:{from:'ALU', to:'ACC'}, regs:{PC:'0x05',IR:'ADD 10', MAR:'0x10', MBR:'3',     ACC:'8'}, alu:true,  cu:false, badge:'EXECUTE', log:'[ALU → ACC] 연산 결과 8이 ACC에 저장되었습니다. 완료!', done:true },
    ];

    /* ===================== 상태 ===================== */
    let stepIdx  = -1;
    let running  = false;
    let timer    = null;
    let speed    = 2000;
    let curStep  = null;
    let flowAnim = null;
    let rafId    = null;
    let _layout  = null;

    /* ===================== 드로우 헬퍼 ===================== */
    function rr(x, y, w, h, r, fill, stroke, lw) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        if (fill)   { ctx.fillStyle   = fill;   ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
    }

    function tx(str, x, y, sz, color, align, bold) {
        ctx.font = `${bold ? 700 : 400} ${sz}px "JetBrains Mono",monospace`;
        ctx.fillStyle    = color;
        ctx.textAlign    = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    function getScale(W) { return Math.min(1, W / 600); }

    /* ===================== 레이아웃 ===================== */
    function buildLayout() {
        const W   = GW(), H = GH();
        const sc  = getScale(W);
        const pad = Math.max(12, 24 * sc);

        const memW = Math.max(100, Math.min(160, W * 0.22));
        const memH = Math.max(110, 150 * sc);
        const memX = W - memW - pad;
        const memY = (H - memH) / 2;

        const cpuMaxW = memX - pad * 2 - Math.max(40, 60 * sc);
        const cpuW    = Math.min(580, cpuMaxW);
        const cpuX    = pad;
        const cpuY    = pad + 8;
        const cpuH    = H - pad * 2 - 16;

        return { W, H, sc, pad, cpuX, cpuY, cpuW, cpuH, memW, memH, memX, memY };
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
        _layout = L;

        drawCPUBox(L);
        drawMemoryBox(L);
        drawDataBus(L);
        if (flowAnim) drawFlowPacket(L);

        if (hoveredKey && TOOLTIPS[hoveredKey]) {
            drawTooltip(mousePos.x, mousePos.y, hoveredKey);
        }
    }

    /* ===================== CPU 박스 ===================== */
    function drawCPUBox(L) {
        const { cpuX, cpuY, cpuW, cpuH, sc } = L;
        const active = curStep ? curStep.active : null;
        const aluOn  = curStep ? curStep.alu    : false;
        const cuOn   = curStep ? curStep.cu     : false;
        const regs   = curStep ? curStep.regs   : { PC:'—', IR:'—', MAR:'—', MBR:'—', ACC:'—' };

        const fSm   = Math.max(7,  Math.round(9  * sc));
        const fMd   = Math.max(9,  Math.round(13 * sc));
        const fLg   = Math.max(10, Math.round(14 * sc));
        const fHd   = Math.max(10, Math.round(13 * sc));
        const lblW  = Math.max(36, Math.round(56 * sc));
        const rp    = Math.max(8,  Math.round(14 * sc));
        const rGap  = Math.max(6,  Math.round(10 * sc));
        const rH    = Math.max(44, Math.round(60 * sc));
        const rVGap = Math.max(6,  Math.round(10 * sc));
        const rTop  = cpuY + Math.max(36, Math.round(48 * sc));

        rr(cpuX, cpuY, cpuW, cpuH, 10, P.surf, P.purple, 2);

        const hdrH = Math.max(28, Math.round(36 * sc));
        ctx.fillStyle = P.purple;
        ctx.beginPath();
        ctx.moveTo(cpuX + 10, cpuY);
        ctx.arcTo(cpuX + cpuW, cpuY, cpuX + cpuW, cpuY + 10, 10);
        ctx.lineTo(cpuX + cpuW, cpuY + hdrH);
        ctx.lineTo(cpuX, cpuY + hdrH);
        ctx.arcTo(cpuX, cpuY, cpuX + 10, cpuY, 10);
        ctx.closePath();
        ctx.fill();
        tx('CPU', cpuX + cpuW / 2, cpuY + hdrH / 2, fHd, '#0f0f1a', 'center', true);

        const REGS = [
            { id:'PC',  label:'PC',  desc:'Program Counter',   col: P.orange },
            { id:'IR',  label:'IR',  desc:'Instruction Reg',   col: P.teal   },
            { id:'MAR', label:'MAR', desc:'Memory Addr Reg',   col: P.purple },
            { id:'MBR', label:'MBR', desc:'Memory Buffer Reg', col: P.purple },
            { id:'ACC', label:'ACC', desc:'Accumulator',       col: P.teal   },
        ];

        const cols = 2;
        const rW   = (cpuW - rp * 2 - rGap) / cols;
        const regPos = {};

        REGS.forEach((r, i) => {
            const isACC = r.id === 'ACC';
            const col   = i % cols;
            const row   = Math.floor(i / cols);
            const rx    = isACC ? cpuX + rp : cpuX + rp + col * (rW + rGap);
            const ry    = rTop + row * (rH + rVGap);
            const rw    = isACC ? cpuW - rp * 2 : rW;
            const isAct = active === r.id;
            const isHov = hoveredKey === r.id;

            regPos[r.id] = { x: rx, y: ry, w: rw, h: rH, cx: rx + rw / 2, cy: ry + rH / 2 };

            rr(rx, ry, rw, rH, 6,
                isAct ? r.col + '22' : isHov ? P.purple + '18' : P.surf2,
                isAct ? r.col : isHov ? P.purple : P.border, isAct ? 2.5 : isHov ? 2 : 1);
            rr(rx, ry, lblW, rH, 6, isAct ? r.col + '33' : isHov ? P.purple + '28' : P.bg, null);

            tx(r.label, rx + lblW / 2, ry + rH / 2, fMd, isAct ? r.col : isHov ? P.purple : P.sub, 'center', true);

            ctx.beginPath();
            ctx.moveTo(rx + lblW, ry + 6);
            ctx.lineTo(rx + lblW, ry + rH - 6);
            ctx.strokeStyle = isAct ? r.col + '88' : isHov ? P.purple + '88' : P.border;
            ctx.lineWidth = 1;
            ctx.stroke();

            const val = regs[r.id] || '—';
            tx(val, rx + lblW + (rw - lblW) / 2, ry + rH / 2, fLg,
                isAct ? r.col : P.text, 'center', isAct);

            const qx    = rx + rw - 10;
            const qy    = ry + rH - 10;
            ctx.beginPath();
            ctx.arc(qx, qy, 6, 0, Math.PI * 2);
            ctx.fillStyle   = isHov ? P.purple : P.surf2;
            ctx.fill();
            ctx.strokeStyle = isHov ? P.purple : P.muted;
            ctx.lineWidth = 1;
            ctx.stroke();
            tx('?', qx, qy, 7, isHov ? '#fff' : P.muted, 'center', true);
            tooltipHits.push({ x: qx - 6, y: qy - 6, w: 12, h: 12, key: r.id });
        });

        const unitTop = rTop + 3 * (rH + rVGap) + rVGap / 2;
        const unitW   = (cpuW - rp * 2 - rGap) / 2;
        const unitH   = Math.max(40, Math.round(56 * sc));
        const aluX    = cpuX + rp;
        const cuX     = cpuX + rp + unitW + rGap;

        rr(aluX, unitTop, unitW, unitH, 6,
            aluOn ? P.teal + '1a' : P.surf2,
            aluOn ? P.teal : P.border, aluOn ? 2.5 : 1);
        tx('ALU',                   aluX + unitW / 2, unitTop + unitH / 2, fLg, aluOn ? P.teal : P.muted, 'center', aluOn);

        const aluQx = aluX + unitW - 10, aluQy = unitTop + unitH - 10;
        const aluHov = hoveredKey === 'ALU';
        ctx.beginPath(); ctx.arc(aluQx, aluQy, 6, 0, Math.PI * 2);
        ctx.fillStyle = aluHov ? P.teal : P.surf2; ctx.fill();
        ctx.strokeStyle = aluHov ? P.teal : P.muted; ctx.lineWidth = 1; ctx.stroke();
        tx('?', aluQx, aluQy, 7, aluHov ? '#fff' : P.muted, 'center', true);
        tooltipHits.push({ x: aluQx - 6, y: aluQy - 6, w: 12, h: 12, key: 'ALU' });

        rr(cuX, unitTop, unitW, unitH, 6,
            cuOn ? P.orange + '1a' : P.surf2,
            cuOn ? P.orange : P.border, cuOn ? 2.5 : 1);
        tx('CU',           cuX + unitW / 2, unitTop + unitH / 2, fLg, cuOn ? P.orange : P.muted, 'center', cuOn);

        const cuQx = cuX + unitW - 10, cuQy = unitTop + unitH - 10;
        const cuHov = hoveredKey === 'CU';
        ctx.beginPath(); ctx.arc(cuQx, cuQy, 6, 0, Math.PI * 2);
        ctx.fillStyle = cuHov ? P.orange : P.surf2; ctx.fill();
        ctx.strokeStyle = cuHov ? P.orange : P.muted; ctx.lineWidth = 1; ctx.stroke();
        tx('?', cuQx, cuQy, 7, cuHov ? '#fff' : P.muted, 'center', true);
        tooltipHits.push({ x: cuQx - 6, y: cuQy - 6, w: 12, h: 12, key: 'CU' });

        L._regPos = regPos;
        L._aluBox = { cx: aluX + unitW / 2, cy: unitTop + unitH / 2 };
        L._cuBox  = { cx: cuX  + unitW / 2, cy: unitTop + unitH / 2 };
    }

    /* ===================== 메모리 박스 ===================== */
    function drawMemoryBox(L) {
        const { memX, memY, memW, memH, sc } = L;
        const fSm = Math.max(7, Math.round(9  * sc));
        const fMd = Math.max(8, Math.round(10 * sc));
        const fHd = Math.max(9, Math.round(11 * sc));

        rr(memX, memY, memW, memH, 8, P.surf, P.teal, 1.5);

        ctx.fillStyle = P.teal + '28';
        ctx.beginPath();
        ctx.moveTo(memX + 8, memY);
        ctx.arcTo(memX + memW, memY, memX + memW, memY + 8, 8);
        ctx.lineTo(memX + memW, memY + 28);
        ctx.lineTo(memX, memY + 28);
        ctx.arcTo(memX, memY, memX + 8, memY, 8);
        ctx.closePath();
        ctx.fill();
        tx('MEMORY', memX + memW / 2, memY + 14, fHd, P.teal, 'center', true);

        const rowH   = Math.max(30, Math.round(38 * sc));
        const rowGap = Math.max(4,  Math.round(8  * sc));
        const mRows  = [
            { addr:'0x04', val:'ADD 0x10', hl: curStep && curStep.regs.MAR === '0x04' },
            { addr:'0x10', val:'3',        hl: curStep && curStep.regs.MAR === '0x10' },
        ];

        mRows.forEach((r, i) => {
            const ry    = memY + 34 + i * (rowH + rowGap);
            const addrW = Math.max(32, Math.round(44 * sc));
            rr(memX + 6, ry, memW - 12, rowH, 4,
                r.hl ? P.teal + '18' : P.surf2,
                r.hl ? P.teal : P.border, r.hl ? 2 : 1);
            tx(r.addr, memX + 6 + addrW / 2, ry + rowH / 2, fSm, P.teal, 'center', true);
            ctx.beginPath();
            ctx.moveTo(memX + 6 + addrW, ry + 5);
            ctx.lineTo(memX + 6 + addrW, ry + rowH - 5);
            ctx.strokeStyle = r.hl ? P.teal + '88' : P.border;
            ctx.lineWidth = 1;
            ctx.stroke();
            tx(r.val, memX + 6 + addrW + (memW - 12 - addrW) / 2, ry + rowH / 2, fMd,
                r.hl ? P.text : P.sub, 'center', r.hl);
        });

        L._memBox = { x: memX, y: memY, w: memW, h: memH, cx: memX, cy: memY + memH / 2 };
    }

    /* ===================== DATA BUS ===================== */
    function drawDataBus(L) {
        if (!L._regPos || !L._memBox) return;
        const mbr = L._regPos['MBR'];
        if (!mbr) return;

        const sx = mbr.x + mbr.w;
        const sy = mbr.cy;
        const ex = L._memBox.x;
        const ey = L._memBox.cy;
        const mx = (sx + ex) / 2;
        const my = (sy + ey) / 2;

        ctx.beginPath();
        ctx.setLineDash([7, 4]);
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = P.purple;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth   = 2.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);

        const fBus = Math.max(8, Math.round(10 * L.sc));
        const lblW = Math.max(56, Math.round(78 * L.sc));
        const lblH = Math.max(16, Math.round(22 * L.sc));
        rr(mx - lblW / 2, my - lblH / 2, lblW, lblH, 4, P.surf2, P.purple, 1.5);
        tx('DATA BUS', mx, my, fBus, P.purple, 'center', true);
    }

    /* ===================== 플로우 패킷 ===================== */
    function getFromCenter(key) {
        if (!_layout) return null;
        if (_layout._regPos && _layout._regPos[key]) {
            const n = _layout._regPos[key];
            return { x: n.cx, y: n.cy };
        }
        if (key === 'ALU' && _layout._aluBox) return { x: _layout._aluBox.cx, y: _layout._aluBox.cy };
        if (key === 'CU'  && _layout._cuBox)  return { x: _layout._cuBox.cx,  y: _layout._cuBox.cy  };
        if (key === 'MEM' && _layout._memBox) return { x: _layout._memBox.x,  y: _layout._memBox.cy };
        return null;
    }

    function getToCenter(key, fromKey) {
        if (!_layout) return null;
        const from = getFromCenter(fromKey);

        if (_layout._regPos && _layout._regPos[key]) {
            const n = _layout._regPos[key];
            if (!from) return { x: n.cx, y: n.cy };
            const dx   = n.cx - from.x;
            const dy   = n.cy - from.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist === 0) return { x: n.cx, y: n.cy };
            const offset = 16;
            return {
                x: n.cx - (dx / dist) * (n.w / 2 - offset),
                y: n.cy - (dy / dist) * (n.h / 2 - offset),
            };
        }
        if (key === 'ALU' && _layout._aluBox) return { x: _layout._aluBox.cx, y: _layout._aluBox.cy };
        if (key === 'CU'  && _layout._cuBox)  return { x: _layout._cuBox.cx,  y: _layout._cuBox.cy  };
        if (key === 'MEM' && _layout._memBox) return { x: _layout._memBox.x + 16, y: _layout._memBox.cy };
        return null;
    }

    function animFlow(from, to, cb) {
        if (!from || !to) { cb && cb(); return; }
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        const fromPos = getFromCenter(from);
        const toPos   = getToCenter(to, from);
        if (!fromPos || !toPos) { cb && cb(); return; }
        flowAnim = { fromPos, toPos, t: 0 };

        const dx   = toPos.x - fromPos.x;
        const dy   = toPos.y - fromPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const PX_PER_FRAME_1X = 1.8;
        const BASE_SPEED = 900;
        const speedRatio = BASE_SPEED / speed;
        const N = Math.max(10, Math.round(dist / (PX_PER_FRAME_1X * speedRatio)));

        let f = 0;
        function animTick() {
            f++;
            flowAnim.t = f / N;
            draw();
            if (f < N) rafId = requestAnimationFrame(animTick);
            else { flowAnim = null; draw(); cb && cb(); }
        }
        rafId = requestAnimationFrame(animTick);
    }

    function drawFlowPacket(L) {
        if (!flowAnim) return;
        const { fromPos, toPos } = flowAnim;
        if (!fromPos || !toPos) return;

        const t   = flowAnim.t;
        const px  = fromPos.x + (toPos.x - fromPos.x) * t;
        const py  = fromPos.y + (toPos.y - fromPos.y) * t;
        const col = P.purple;
        const r   = Math.max(7, Math.round(10 * L.sc));

        const g = ctx.createRadialGradient(px, py, 0, px, py, r * 2.2);
        g.addColorStop(0, col + '55');
        g.addColorStop(1, col + '00');
        ctx.beginPath();
        ctx.arc(px, py, r * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();

        if (t > 0.08) {
            const angle = Math.atan2(toPos.y - fromPos.y, toPos.x - fromPos.x);
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + Math.cos(angle) * r * 1.8, py + Math.sin(angle) * r * 1.8);
            ctx.strokeStyle = col + 'aa';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
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

    /* ===================== 단계 제어 ===================== */
    function setLog(str)   { logEl.textContent = str; }
    function setBadge(str) {
        badge.textContent = str;
        badge.className   = 'cpu__step-badge' + (str !== 'IDLE' ? ' cpu__step-badge--active' : '');
    }

    function applyStep(s, onDone) {
        curStep = s;
        setLog(s.log);
        setBadge(s.badge);
        if (s.flow) {
            animFlow(s.flow.from, s.flow.to, onDone || (() => draw()));
        } else {
            draw();
            onDone && onDone();
        }
    }

    /* ===================== 배속 버튼 활성/비활성 ===================== */
    function setSpeedBtnsDisabled(disabled) {
        root.querySelectorAll('.cpu__speed-btn').forEach(b => { b.disabled = disabled; });
    }

    /* ===================== 공개 API ===================== */
    function cpuStart() {
        if (running) return;
        running = true;
        btnPlay.disabled = true;
        btnStep.disabled = true;
        setSpeedBtnsDisabled(true);

        function tick() {
            stepIdx++;
            if (stepIdx >= STEPS.length) { running = false; setSpeedBtnsDisabled(false); return; }
            const s = STEPS[stepIdx];
            if (s.done) {
                applyStep(s);
                running = false;
                btnStep.disabled = false;
                setSpeedBtnsDisabled(false);
                return;
            }
            applyStep(s, () => {
                draw();
                timer = setTimeout(tick, speed);
            });
        }
        tick();
    }

    function cpuStep() {
        if (running) return;
        stepIdx++;
        if (stepIdx >= STEPS.length) return;
        const s = STEPS[stepIdx];
        applyStep(s);
        if (s.done) {
            btnPlay.disabled = true;
            btnStep.disabled = true;
        }
    }

    function cpuReset() {
        clearTimeout(timer);
        cancelAnimationFrame(rafId);
        running = false; stepIdx = -1; curStep = null; flowAnim = null; rafId = null;
        setLog('▶ PLAY를 눌러 CPU 구성 요소의 동작을 확인하세요.');
        setBadge('IDLE');
        btnPlay.disabled = false;
        btnStep.disabled = false;
        setSpeedBtnsDisabled(false);
        draw();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.cpu__speed-btn').forEach(b => b.classList.remove('cpu__speed-btn--active'));
        btn.classList.add('cpu__speed-btn--active');
    }

    /* ===================== 마우스 이벤트 ===================== */
    canvas.addEventListener('mousemove', function(e) {
        const rect   = canvas.getBoundingClientRect();
        const scaleX = GW() / rect.width;
        const scaleY = GH() / rect.height;
        mousePos.x = (e.clientX - rect.left) * scaleX;
        mousePos.y = (e.clientY - rect.top)  * scaleY;

        const hit = tooltipHits.find(h =>
            mousePos.x >= h.x && mousePos.x <= h.x + h.w &&
            mousePos.y >= h.y && mousePos.y <= h.y + h.h
        );
        const newKey = hit ? hit.key : null;
        if (newKey !== hoveredKey) {
            hoveredKey = newKey;
            canvas.style.cursor = newKey ? 'help' : 'default';
            draw();
        }
    });

    canvas.addEventListener('mouseleave', function() {
        if (hoveredKey) {
            hoveredKey = null;
            canvas.style.cursor = 'default';
            draw();
        }
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