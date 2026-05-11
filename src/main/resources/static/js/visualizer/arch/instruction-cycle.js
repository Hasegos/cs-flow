/**
 * instruction-cycle.js
 * 명령어 사이클 인터랙티브 시각화
 */
(function () {
    'use strict';

    const container = document.getElementById('visualizer-container');
    if (!container) return;

    /* ===================== DOM 생성 유틸 ===================== */
    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls)  e.className = cls;
        if (text) e.textContent = text;
        return e;
    }

    /* ===================== UI 구성 ===================== */
    const root = el('div', 'ic');

    // 툴바
    const toolbar = el('div', 'ic__toolbar');
    const tbLeft  = el('div', 'ic__toolbar-left');
    tbLeft.appendChild(el('span', 'ic__title', 'Instruction Cycle'));

    const phases = el('div', 'ic__phases');
    const lblFetch   = el('span', 'ic__phase', 'FETCH');   lblFetch.id   = 'ic-fetch';
    const lblDecode  = el('span', 'ic__phase', 'DECODE');  lblDecode.id  = 'ic-decode';
    const lblExecute = el('span', 'ic__phase', 'EXECUTE'); lblExecute.id = 'ic-execute';
    const sep1 = el('span', 'ic__phase-sep', '→');
    const sep2 = el('span', 'ic__phase-sep', '→');
    phases.appendChild(lblFetch);
    phases.appendChild(sep1);
    phases.appendChild(lblDecode);
    phases.appendChild(sep2);
    phases.appendChild(lblExecute);
    tbLeft.appendChild(phases);
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'ic__speed');
    speedWrap.appendChild(el('span', 'ic__speed-label', 'SPEED'));
    [['1x', 1800], ['2x', 1000], ['3x', 500]].forEach(([label, ms], i) => {
        const btn = el('button', 'ic__speed-btn' + (i === 0 ? ' ic__speed-btn--active' : ''), label);
        btn.dataset.ms = ms;
        btn.addEventListener('click', () => {
            if (running) return;
            setSpeed(ms, btn);
        });
        speedWrap.appendChild(btn);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    // 캔버스
    const canvasWrap = el('div', 'ic__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'ic__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    // 로그
    const logBar = el('div', 'ic__log', '시작 버튼을 눌러 Fetch → Decode → Execute 사이클을 확인하세요.');
    logBar.id = 'ic-log';
    root.appendChild(logBar);

    // 컨트롤
    const controls = el('div', 'ic__controls');
    const btnPlay  = el('button', 'ic__btn ic__btn--primary', '▶ PLAY');
    const btnStep  = el('button', 'ic__btn', '▶| STEP');
    const btnReset = el('button', 'ic__btn', '↺ RESET');
    btnPlay.id  = 'ic-btn-play';
    btnStep.id  = 'ic-btn-step';
    btnPlay.addEventListener('click',  icStart);
    btnStep.addEventListener('click',  icStep);
    btnReset.addEventListener('click', icReset);
    controls.appendChild(btnPlay);
    controls.appendChild(btnStep);
    controls.appendChild(btnReset);
    root.appendChild(controls);

    container.appendChild(root);

    /* ===================== 캔버스 설정 ===================== */
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    function resize() {
        const w = canvasWrap.offsetWidth;
        const h = Math.max(canvasWrap.offsetHeight, 380);
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    const GW = () => canvas.width  / dpr;
    const GH = () => canvas.height / dpr;

    /* ===================== 팔레트 ===================== */
    const P = {
        bg:     '#0f0f1a',
        surf:   '#1a1a2e',
        surf2:  '#222238',
        border: 'rgba(108,99,255,0.22)',
        purple: '#6c63ff',
        teal:   '#3ecfb2',
        orange: '#f7a14a',
        text:   '#e8e8f0',
        sub:    '#a0a0bc',
        muted:  '#6b6b8a',
    };

    /* ===================== 시뮬레이션 데이터 ===================== */
    // 예시 프로그램: LOAD ACC,[0x05] → ADD ACC,[0x06] → STORE ACC,[0x07] → HALT
    // 메모리 레이아웃
    const MEM_INIT = [
        { addr: '0x00', label: 'LOAD  [0x05]', type: 'i' },
        { addr: '0x01', label: 'ADD   [0x06]', type: 'i' },
        { addr: '0x02', label: 'STORE [0x07]', type: 'i' },
        { addr: '0x03', label: 'HALT',         type: 'i' },
        { addr: '0x04', label: '',             type: 'i' },
        { addr: '0x05', label: '10',           type: 'd' },
        { addr: '0x06', label: '20',           type: 'd' },
        { addr: '0x07', label: '?',            type: 'd' },
    ];

    // bus 방향: toMem=true → CPU→메모리, false → 메모리→CPU
    // label: 'A'=ADDR BUS(민트), 'I'=CTRL BUS(주황), 'D'=DATA BUS(보라)
    const STEPS = [
        // ── 1번째 명령어: LOAD ACC,[0x05] ──
        { ph:'f', mh:0, reg:{PC:'0x00', MAR:'0x00', MDR:'—',  IR:'—',    ACC:'—'}, log:'[FETCH-1] PC=0x00 → MAR=0x00, ADDR BUS로 메모리에 주소 전달',       bus:{toMem:true,  label:'A'} },
        { ph:'f', mh:0, reg:{PC:'0x01', MAR:'0x00', MDR:'LOAD',IR:'—',   ACC:'—'}, log:'[FETCH-2] MEM[0x00]=LOAD → CTRL BUS로 MDR에 전달, PC→0x01',         bus:{toMem:false, label:'I'} },
        { ph:'d', mh:0, reg:{PC:'0x01', MAR:'0x00', MDR:'LOAD',IR:'LOAD',ACC:'—'}, log:'[DECODE]  IR ← LOAD [0x05] — CU가 명령어 해석, 피연산자=0x05',       bus:null },
        { ph:'e', mh:5, reg:{PC:'0x01', MAR:'0x05', MDR:'LOAD',IR:'LOAD',ACC:'—'}, log:'[EXEC-1]  피연산자 주소 0x05 → ADDR BUS로 메모리 전달',              bus:{toMem:true,  label:'A'} },
        { ph:'e', mh:5, reg:{PC:'0x01', MAR:'0x05', MDR:'10',  IR:'LOAD',ACC:'10'},log:'[EXEC-2]  MEM[0x05]=10 → DATA BUS로 ACC에 전달, ACC=10',             bus:{toMem:false, label:'D'} },

        // ── 2번째 명령어: ADD ACC,[0x06] ──
        { ph:'f', mh:1, reg:{PC:'0x01', MAR:'0x01', MDR:'10',  IR:'LOAD',ACC:'10'},log:'[FETCH-1] PC=0x01 → MAR=0x01, ADDR BUS로 메모리에 주소 전달',        bus:{toMem:true,  label:'A'} },
        { ph:'f', mh:1, reg:{PC:'0x02', MAR:'0x01', MDR:'ADD', IR:'LOAD',ACC:'10'},log:'[FETCH-2] MEM[0x01]=ADD → CTRL BUS로 MDR에 전달, PC→0x02',           bus:{toMem:false, label:'I'} },
        { ph:'d', mh:1, reg:{PC:'0x02', MAR:'0x01', MDR:'ADD', IR:'ADD', ACC:'10'},log:'[DECODE]  IR ← ADD [0x06] — CU가 명령어 해석, 피연산자=0x06',        bus:null },
        { ph:'e', mh:6, reg:{PC:'0x02', MAR:'0x06', MDR:'ADD', IR:'ADD', ACC:'10'},log:'[EXEC-1]  피연산자 주소 0x06 → ADDR BUS로 메모리 전달',              bus:{toMem:true,  label:'A'} },
        { ph:'e', mh:6, reg:{PC:'0x02', MAR:'0x06', MDR:'20',  IR:'ADD', ACC:'30'},log:'[EXEC-2]  MEM[0x06]=20 → DATA BUS, ACC=10+20=30',                    bus:{toMem:false, label:'D'} },

        // ── 3번째 명령어: STORE ACC,[0x07] ──
        { ph:'f', mh:2, reg:{PC:'0x02', MAR:'0x02', MDR:'20',  IR:'ADD', ACC:'30'},log:'[FETCH-1] PC=0x02 → MAR=0x02, ADDR BUS로 메모리에 주소 전달',        bus:{toMem:true,  label:'A'} },
        { ph:'f', mh:2, reg:{PC:'0x03', MAR:'0x02', MDR:'STORE',IR:'ADD',ACC:'30'},log:'[FETCH-2] MEM[0x02]=STORE → CTRL BUS로 MDR에 전달, PC→0x03',         bus:{toMem:false, label:'I'} },
        { ph:'d', mh:2, reg:{PC:'0x03', MAR:'0x02', MDR:'STORE',IR:'STORE',ACC:'30'},log:'[DECODE] IR ← STORE [0x07] — CU가 명령어 해석, 피연산자=0x07',     bus:null },
        { ph:'e', mh:7, reg:{PC:'0x03', MAR:'0x07', MDR:'STORE',IR:'STORE',ACC:'30'},log:'[EXEC-1] 저장 주소 0x07 → ADDR BUS로 메모리 전달',                 bus:{toMem:true,  label:'A'} },
        { ph:'e', mh:7, reg:{PC:'0x03', MAR:'0x07', MDR:'30',   IR:'STORE',ACC:'30'},log:'[EXEC-2] ACC=30 → DATA BUS로 MEM[0x07]에 쓰기',                    bus:{toMem:true,  label:'D'} },

        // ── 4번째 명령어: HALT ──
        { ph:'f', mh:3, reg:{PC:'0x03', MAR:'0x03', MDR:'30',  IR:'STORE',ACC:'30'},log:'[FETCH-1] PC=0x03 → MAR=0x03, ADDR BUS로 메모리에 주소 전달',       bus:{toMem:true,  label:'A'} },
        { ph:'f', mh:3, reg:{PC:'0x04', MAR:'0x03', MDR:'HALT',IR:'STORE',ACC:'30'},log:'[FETCH-2] MEM[0x03]=HALT → CTRL BUS로 MDR에 전달',                  bus:{toMem:false, label:'I'} },
        { ph:'d', mh:3, reg:{PC:'0x04', MAR:'0x03', MDR:'HALT',IR:'HALT', ACC:'30'},log:'[DECODE]  IR ← HALT — CU가 명령어 해석',                            bus:null },
        { ph:'e', mh:7, reg:{PC:'HALT', MAR:'0x03', MDR:'HALT',IR:'HALT', ACC:'30'},log:'[EXECUTE] HALT — 실행 완료! MEM[0x07]=30 저장됨 ✓',                 bus:null, done:true },
    ];

    /* ===================== 약어 툴팁 데이터 ===================== */
    const TOOLTIPS = {
        'PC':  'Program Counter\n다음에 실행할 명령어의 메모리 주소를 보관',
        'MAR': 'Memory Address Register\n메모리에 접근할 주소를 임시 저장',
        'MDR': 'Memory Data Register\n메모리와 주고받는 데이터를 임시 저장',
        'IR':  'Instruction Register\n인출한 명령어를 보관',
        'ACC': 'Accumulator\n연산 중간 결과를 임시 저장',
        'ALU': 'Arithmetic Logic Unit\n산술·논리 연산을 수행하는 회로',
        'CU':  'Control Unit\n명령어를 해석하고 각 장치를 제어',
    };

    // 툴팁 히트박스: draw 시마다 갱신
    let tooltipHits = []; // [{ x, y, w, h, key }]
    let mousePos    = { x: -1, y: -1 };
    let hoveredKey  = null;

    /* ===================== 상태 ===================== */
    let stepIdx = -1;
    let running = false;
    let timer   = null;
    let speed   = 1800;
    let memHL   = -1;
    let curReg  = { PC: '—', MAR: '—', MDR: '—', IR: '—', ACC: '—' };
    let curPh   = null;
    let mem     = MEM_INIT.map(m => ({ ...m }));
    let busAnim = null;
    let rafId   = null;
    let aluOn   = false;
    let cuOn    = false;

    /* ===================== 드로우 헬퍼 ===================== */
    function rr(x, y, w, h, r, fill, stroke, lw) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y,     x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x,     y + h, r);
        ctx.arcTo(x,     y + h, x,     y,     r);
        ctx.arcTo(x,     y,     x + w, y,     r);
        ctx.closePath();
        if (fill)   { ctx.fillStyle = fill;     ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
    }

    function tx(str, x, y, sz, color, align, bold) {
        ctx.font = `${bold ? 700 : 400} ${sz}px "JetBrains Mono",monospace`;
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    function phCol(ph) {
        return ph === 'f' ? P.orange : ph === 'd' ? P.teal : P.purple;
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        const W = GW(), H = GH();
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = P.bg;
        ctx.fillRect(0, 0, W, H);

        const pad  = 20;
        const gap  = 18;
        const cpuW = Math.min(230, W * 0.33);
        const memW = Math.min(230, W * 0.34);
        const boxH = Math.min(H - 32, 340);
        const boxY = (H - boxH) / 2;
        const cpuX = pad;
        const memX = W - memW - pad;
        const busX1 = cpuX + cpuW;
        const busX2 = memX;
        const busY  = H / 2;

        tooltipHits = [];   // 히트박스 매 프레임 초기화
        drawBus(busX1, busX2, busY, gap);
        drawCPU(cpuX, boxY, cpuW, boxH);
        drawMem(memX, boxY, memW, boxH);

        if (busAnim) {
            const packetY = busAnim.label === 'A' ? busY + gap
                          : busAnim.label === 'I' ? busY - gap
                          : busY;
            drawPacket(busX1, busX2, packetY);
        }

        // 툴팁 히트박스 초기화는 drawCPU 전에 해야 하므로 여기서 렌더만
        if (hoveredKey && TOOLTIPS[hoveredKey]) {
            drawTooltip(mousePos.x, mousePos.y, hoveredKey);
        }
    }

    function drawBus(x1, x2, busY, gap) {
        const mx = (x1 + x2) / 2;

        const buses = [
            { y: busY,       col: P.purple, op: 0.5,  lw: 2.5, label: 'DATA BUS' },
            { y: busY + gap, col: P.teal,   op: 0.45, lw: 1.8, label: 'ADDR BUS' },
            { y: busY - gap, col: P.orange, op: 0.45, lw: 1.8, label: 'CTRL BUS' },
        ];

        buses.forEach(b => {
            ctx.beginPath();
            ctx.setLineDash([6, 4]);
            ctx.moveTo(x1, b.y);
            ctx.lineTo(x2, b.y);
            ctx.strokeStyle = b.col;
            ctx.globalAlpha = b.op;
            ctx.lineWidth   = b.lw;
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.setLineDash([]);

            const lw = 60, lh = 14;
            rr(mx - lw / 2, b.y - lh / 2, lw, lh, 3, P.bg, b.col + '55', 1);
            tx(b.label, mx, b.y, 7.5, b.col, 'center', true);
        });
    }

    function drawCPU(x, y, w, h) {
        const col = curPh ? phCol(curPh) : P.border;

        rr(x, y, w, h, 10, P.surf, col, curPh ? 2 : 1.5);

        // 헤더
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(x + 10, y);
        ctx.arcTo(x + w, y,     x + w, y + 10, 10);
        ctx.lineTo(x + w, y + 32);
        ctx.lineTo(x,     y + 32);
        ctx.arcTo(x, y,   x + 10, y,   10);
        ctx.closePath();
        ctx.fill();
        tx('CPU', x + w / 2, y + 16, 11, '#0f0f1a', 'center', true);

        // 레지스터 5개: PC, MAR, MDR, IR, ACC
        const rp = 12, rh = 28, rg = 5;
        const rt = y + 44;

        const regs = [
            { n: 'PC',  v: curReg.PC,  hi: curPh === 'f' },
            { n: 'MAR', v: curReg.MAR, hi: curPh === 'f' },
            { n: 'MDR', v: curReg.MDR, hi: curPh === 'f' || curPh === 'e' },
            { n: 'IR',  v: curReg.IR,  hi: curPh === 'd' },
            { n: 'ACC', v: curReg.ACC, hi: curPh === 'e' },
        ];

        regs.forEach((r, i) => {
            const ry = rt + i * (rh + rg);
            const c  = r.hi ? phCol(curPh) : P.border;
            rr(x + rp, ry, w - rp * 2, rh, 5,
                r.hi ? phCol(curPh) + '1a' : P.surf2, c, r.hi ? 2 : 1);
            rr(x + rp, ry, 36, rh, 5, r.hi ? phCol(curPh) + '33' : P.bg, null);
            tx(r.n, x + rp + 18, ry + rh / 2, 8, r.hi ? phCol(curPh) : P.muted, 'center', true);

            ctx.beginPath();
            ctx.moveTo(x + rp + 36, ry + 5);
            ctx.lineTo(x + rp + 36, ry + rh - 5);
            ctx.strokeStyle = c;
            ctx.lineWidth = 1;
            ctx.stroke();

            tx(r.v, x + rp + 36 + (w - rp * 2 - 36) / 2, ry + rh / 2, 9,
                r.hi ? phCol(curPh) : P.text, 'center', r.hi);

            // ? 뱃지
            const qx = x + w - rp - 10, qy = ry + rh - 8;
            const isHov = hoveredKey === r.n;
            ctx.beginPath();
            ctx.arc(qx, qy, 6, 0, Math.PI * 2);
            ctx.fillStyle = isHov ? P.purple : P.surf2;
            ctx.fill();
            ctx.strokeStyle = isHov ? P.purple : P.muted;
            ctx.lineWidth = 1;
            ctx.stroke();
            tx('?', qx, qy, 7, isHov ? '#fff' : P.muted, 'center', true);

            tooltipHits.push({ x: qx - 6, y: qy - 6, w: 12, h: 12, key: r.n });
        });

        // ALU / CU
        const uy = y + h - 60;
        const uw = (w - rp * 2 - 8) / 2;

        rr(x + rp, uy, uw, 38, 5,
            aluOn ? P.purple + '1a' : P.surf2,
            aluOn ? P.purple : P.border, aluOn ? 2 : 1);
        tx('ALU', x + rp + uw / 2, uy + 19, 9, aluOn ? P.purple : P.muted, 'center', aluOn);

        // ALU ? 뱃지
        const aluQx = x + rp + uw - 8, aluQy = uy + 30;
        const aluHov = hoveredKey === 'ALU';
        ctx.beginPath(); ctx.arc(aluQx, aluQy, 6, 0, Math.PI * 2);
        ctx.fillStyle = aluHov ? P.purple : P.surf2; ctx.fill();
        ctx.strokeStyle = aluHov ? P.purple : P.muted; ctx.lineWidth = 1; ctx.stroke();
        tx('?', aluQx, aluQy, 7, aluHov ? '#fff' : P.muted, 'center', true);
        tooltipHits.push({ x: aluQx - 6, y: aluQy - 6, w: 12, h: 12, key: 'ALU' });

        rr(x + rp + uw + 8, uy, uw, 38, 5,
            cuOn ? P.teal + '1a' : P.surf2,
            cuOn ? P.teal : P.border, cuOn ? 2 : 1);
        tx('CU', x + rp + uw + 8 + uw / 2, uy + 19, 9, cuOn ? P.teal : P.muted, 'center', cuOn);

        // CU ? 뱃지
        const cuQx = x + rp + uw + 8 + uw - 8, cuQy = uy + 30;
        const cuHov = hoveredKey === 'CU';
        ctx.beginPath(); ctx.arc(cuQx, cuQy, 6, 0, Math.PI * 2);
        ctx.fillStyle = cuHov ? P.teal : P.surf2; ctx.fill();
        ctx.strokeStyle = cuHov ? P.teal : P.muted; ctx.lineWidth = 1; ctx.stroke();
        tx('?', cuQx, cuQy, 7, cuHov ? '#fff' : P.muted, 'center', true);
        tooltipHits.push({ x: cuQx - 6, y: cuQy - 6, w: 12, h: 12, key: 'CU' });
    }

    function drawMem(x, y, w, h) {
        rr(x, y, w, h, 10, P.surf, P.border, 1.5);

        // 헤더
        ctx.fillStyle = P.teal + '33';
        ctx.beginPath();
        ctx.moveTo(x + 10, y);
        ctx.arcTo(x + w, y,     x + w, y + 10, 10);
        ctx.lineTo(x + w, y + 32);
        ctx.lineTo(x,     y + 32);
        ctx.arcTo(x, y,   x + 10, y,   10);
        ctx.closePath();
        ctx.fill();
        tx('MEMORY', x + w / 2, y + 16, 11, P.teal, 'center', true);

        const rp = 10;
        const rh = Math.min(28, (h - 46) / mem.length - 3);
        const rg = 3;

        mem.forEach((m, i) => {
            const ry  = y + 40 + i * (rh + rg);
            const hl  = i === memHL;
            const isD = m.type === 'd';
            const hc  = isD ? P.teal : P.orange;

            rr(x + rp, ry, w - rp * 2, rh, 4,
                hl ? hc + '1a' : P.surf2,
                hl ? hc : P.border, hl ? 2 : 1);
            rr(x + rp, ry, 44, rh, 4, hl ? hc + '28' : P.bg, null);
            tx(m.addr, x + rp + 22, ry + rh / 2, 8, isD ? P.teal : P.orange, 'center', true);

            ctx.beginPath();
            ctx.moveTo(x + rp + 44, ry + 5);
            ctx.lineTo(x + rp + 44, ry + rh - 5);
            ctx.strokeStyle = hl ? hc + '88' : P.border;
            ctx.lineWidth = 1;
            ctx.stroke();

            // STORE 완료 후 결과값 반영
            const label = (i === 7 && stepIdx >= 14) ? '30' : m.label;
            tx(label, x + rp + 44 + (w - rp * 2 - 44) / 2, ry + rh / 2, 9,
                hl ? P.text : P.sub, 'center', hl);
        });
    }

    function drawPacket(x1, x2, y) {
        if (!busAnim) return;
        const toM = busAnim.toMem;
        const px  = toM ? x1 + (x2 - x1) * busAnim.t
                        : x2 - (x2 - x1) * busAnim.t;

        const col = busAnim.label === 'A' ? P.teal
                  : busAnim.label === 'I' ? P.orange
                  : P.purple;

        const g = ctx.createRadialGradient(px, y, 0, px, y, 20);
        g.addColorStop(0, col + '55');
        g.addColorStop(1, col + '00');
        ctx.beginPath();
        ctx.arc(px, y, 20, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(px, y, 10, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();

        tx(busAnim.label, px, y, 8, '#0f0f1a', 'center', true);

        const ax = toM ? px + 22 : px - 22;
        ctx.beginPath();
        if (toM) { ctx.moveTo(ax - 6, y - 4); ctx.lineTo(ax, y); ctx.lineTo(ax - 6, y + 4); }
        else     { ctx.moveTo(ax + 6, y - 4); ctx.lineTo(ax, y); ctx.lineTo(ax + 6, y + 4); }
        ctx.strokeStyle = col;
        ctx.lineWidth   = 2;
        ctx.stroke();
    }

    function drawTooltip(mx, my, key) {
        const lines = TOOLTIPS[key].split('\n');
        const title = lines[0];
        const desc  = lines[1] || '';

        const pad   = 10;
        const tw    = Math.max(
            ctx.measureText(title).width,
            ctx.measureText(desc).width
        ) + pad * 2 + 20;
        const th    = desc ? 46 : 28;
        const W     = GW(), H = GH();

        // 화면 밖으로 나가지 않게 위치 보정
        let tx_ = mx + 14;
        let ty_ = my - th - 8;
        if (tx_ + tw > W - 8) tx_ = mx - tw - 8;
        if (ty_ < 8)          ty_ = my + 14;

        // 배경
        rr(tx_, ty_, tw, th, 6, P.surf2, P.purple + '88', 1);

        // 타이틀
        ctx.font = '700 10px "JetBrains Mono",monospace';
        ctx.fillStyle = P.text;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(title, tx_ + pad, ty_ + (desc ? 14 : th / 2));

        // 설명
        if (desc) {
            ctx.font = '400 9px "JetBrains Mono",monospace';
            ctx.fillStyle = P.sub;
            ctx.fillText(desc, tx_ + pad, ty_ + 32);
        }
    }

    /* ===================== 단계 제어 ===================== */
    function setPhase(ph) {
        curPh = ph;
        aluOn = ph === 'e';
        cuOn  = ph === 'd';

        const map = { 'ic-fetch': 'f', 'ic-decode': 'd', 'ic-execute': 'e' };
        const cls = { 'f': 'ic__phase--fetch', 'd': 'ic__phase--decode', 'e': 'ic__phase--execute' };

        Object.entries(map).forEach(([id, p]) => {
            const e = document.getElementById(id);
            if (!e) return;
            e.classList.remove('ic__phase--fetch', 'ic__phase--decode', 'ic__phase--execute');
            if (p === ph) e.classList.add(cls[ph]);
        });
    }

    function setLog(str) {
        logBar.textContent = str;
    }

    function animBus(info, cb) {
        if (!info) { cb && cb(); return; }
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        busAnim = { t: 0, toMem: info.toMem, label: info.label };
        const BASE_SPEED = 1800;
        const N = Math.max(30, Math.round(140 * speed / BASE_SPEED));
        let f = 0;
        function animTick() {
            f++;
            busAnim.t = f / N;
            draw();
            if (f < N) rafId = requestAnimationFrame(animTick);
            else { busAnim = null; draw(); cb && cb(); }
        }
        rafId = requestAnimationFrame(animTick);
    }

    function applyStep(s, onDone) {
        curReg = { ...s.reg };
        memHL  = s.mh;
        setPhase(s.ph);
        setLog(s.log);
        animBus(s.bus, onDone || (() => draw()));
        draw();
    }

    /* ===================== 공개 API ===================== */
    function setSpeedBtnsDisabled(disabled) {
        root.querySelectorAll('.ic__speed-btn').forEach(b => {
            b.disabled = disabled;
        });
    }

    function icStart() {
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

    function icStep() {
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

    function icReset() {
        clearTimeout(timer);
        cancelAnimationFrame(rafId);
        running = false; stepIdx = -1; curPh = null; memHL = -1;
        busAnim = null; aluOn = false; cuOn = false;
        curReg = { PC: '—', MAR: '—', MDR: '—', IR: '—', ACC: '—' };
        mem = MEM_INIT.map(m => ({ ...m }));

        ['ic-fetch', 'ic-decode', 'ic-execute'].forEach(id => {
            const e = document.getElementById(id);
            if (e) e.classList.remove('ic__phase--fetch', 'ic__phase--decode', 'ic__phase--execute');
        });
        setLog('시작 버튼을 눌러 Fetch → Decode → Execute 사이클을 확인하세요.');
        btnPlay.disabled = false;
        btnStep.disabled = false;
        setSpeedBtnsDisabled(false);
        draw();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.ic__speed-btn').forEach(b => b.classList.remove('ic__speed-btn--active'));
        btn.classList.add('ic__speed-btn--active');
    }

    window.icStart = icStart;
    window.icReset = icReset;

    /* ===================== 마우스 이벤트 ===================== */
    canvas.addEventListener('mousemove', function(e) {
        const rect = canvas.getBoundingClientRect();
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

    /* ===================== 초기화 ===================== */
    new ResizeObserver(() => resize()).observe(canvasWrap);
    setTimeout(resize, 60);
})();