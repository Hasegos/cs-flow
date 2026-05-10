/**
 * von-neumann.js
 * 폰 노이만 구조 인터랙티브 시각화
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
    const root = el('div', 'vn');

    const toolbar = el('div', 'vn__toolbar');
    const tbLeft  = el('div', 'vn__toolbar-left');
    tbLeft.appendChild(el('span', 'vn__title', 'Von Neumann Architecture'));

    const phases = el('div', 'vn__phases');
    const lblFetch   = el('span', 'vn__phase', 'FETCH');   lblFetch.id   = 'vn-fetch';
    const lblDecode  = el('span', 'vn__phase', 'DECODE');  lblDecode.id  = 'vn-decode';
    const lblExecute = el('span', 'vn__phase', 'EXECUTE'); lblExecute.id = 'vn-execute';
    const sep1 = el('span', 'vn__phase-sep', '→');
    const sep2 = el('span', 'vn__phase-sep', '→');
    phases.appendChild(lblFetch);
    phases.appendChild(sep1);
    phases.appendChild(lblDecode);
    phases.appendChild(sep2);
    phases.appendChild(lblExecute);
    tbLeft.appendChild(phases);
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'vn__speed');
    speedWrap.appendChild(el('span', 'vn__speed-label', 'SPEED'));
    [['1x', 1800], ['2x', 1000], ['3x', 500]].forEach(([label, ms], i) => {
        const btn = el('button', 'vn__speed-btn' + (i === 0 ? ' vn__speed-btn--active' : ''), label);
        btn.addEventListener('click', () => setSpeed(ms, btn));
        speedWrap.appendChild(btn);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'vn__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'vn__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const log = el('div', 'vn__log', '시작 버튼을 눌러 Fetch → Decode → Execute 사이클을 확인하세요.');
    log.id = 'vn-log';
    root.appendChild(log);

    const controls = el('div', 'vn__controls');
    const btnPlay  = el('button', 'vn__btn vn__btn--primary', '▶ PLAY');
    const btnReset = el('button', 'vn__btn', '↺ RESET');
    btnPlay.id = 'vn-btn-play';
    btnPlay.addEventListener('click', vnStart);
    btnReset.addEventListener('click', vnReset);
    controls.appendChild(btnPlay);
    controls.appendChild(btnReset);
    root.appendChild(controls);

    container.appendChild(root);

    /* ===================== 캔버스 설정 ===================== */
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
    const MEM_INIT = [
        { addr: '0x00', label: 'LOAD R1,[10]',  type: 'i' },
        { addr: '0x02', label: 'LOAD R2,[11]',  type: 'i' },
        { addr: '0x04', label: 'ADD  R1, R2',   type: 'i' },
        { addr: '0x06', label: 'STORE R1,[12]', type: 'i' },
        { addr: '0x08', label: 'HALT',          type: 'i' },
        { addr: '0x10', label: '7',             type: 'd' },
        { addr: '0x11', label: '3',             type: 'd' },
        { addr: '0x12', label: '?',             type: 'd' },
    ];

    //   'A' → ADDR BUS (CPU→메모리 주소 전달, busY + gap)
    //   'I' → CTRL BUS (메모리→CPU 명령어 전달, busY - gap)
    //   'D' → DATA BUS (데이터 읽기/쓰기,       busY)
    const STEPS = [
        // ── 1번째 명령어: LOAD R1,[0x10] ──
        { ph:'f', mh:0, reg:{PC:'0x00',IR:'—',   R1:'—', R2:'—'}, log:'[FETCH-1] PC=0x00 → ADDR BUS로 메모리에 주소 전달',          bus:{toMem:true,  label:'A'} },
        { ph:'f', mh:0, reg:{PC:'0x00',IR:'—',   R1:'—', R2:'—'}, log:'[FETCH-2] 메모리[0x00] → CTRL BUS로 명령어 CPU에 전달',      bus:{toMem:false, label:'I'} },
        { ph:'d', mh:0, reg:{PC:'0x00',IR:'LOAD', R1:'—', R2:'—'}, log:'[DECODE]  IR ← LOAD R1,[0x10] — CU가 명령어 해석',          bus:null },
        { ph:'e', mh:5, reg:{PC:'0x02',IR:'LOAD', R1:'—', R2:'—'}, log:'[EXECUTE-1] 피연산자 주소 0x10 → ADDR BUS로 메모리 전달',   bus:{toMem:true,  label:'A'} },
        { ph:'e', mh:5, reg:{PC:'0x02',IR:'LOAD', R1:'7', R2:'—'}, log:'[EXECUTE-2] Mem[0x10]=7 → DATA BUS로 CPU R1에 전달',        bus:{toMem:false, label:'D'} },

        // ── 2번째 명령어: LOAD R2,[0x11] ──
        { ph:'f', mh:1, reg:{PC:'0x02',IR:'LOAD', R1:'7', R2:'—'}, log:'[FETCH-1] PC=0x02 → ADDR BUS로 메모리에 주소 전달',          bus:{toMem:true,  label:'A'} },
        { ph:'f', mh:1, reg:{PC:'0x02',IR:'LOAD', R1:'7', R2:'—'}, log:'[FETCH-2] 메모리[0x02] → CTRL BUS로 명령어 CPU에 전달',      bus:{toMem:false, label:'I'} },
        { ph:'d', mh:1, reg:{PC:'0x02',IR:'LOAD', R1:'7', R2:'—'}, log:'[DECODE]  IR ← LOAD R2,[0x11] — CU가 명령어 해석',          bus:null },
        { ph:'e', mh:6, reg:{PC:'0x04',IR:'LOAD', R1:'7', R2:'—'}, log:'[EXECUTE-1] 피연산자 주소 0x11 → ADDR BUS로 메모리 전달',   bus:{toMem:true,  label:'A'} },
        { ph:'e', mh:6, reg:{PC:'0x04',IR:'LOAD', R1:'7', R2:'3'}, log:'[EXECUTE-2] Mem[0x11]=3 → DATA BUS로 CPU R2에 전달',        bus:{toMem:false, label:'D'} },

        // ── 3번째 명령어: ADD R1, R2 ──
        { ph:'f', mh:2, reg:{PC:'0x04',IR:'LOAD', R1:'7', R2:'3'}, log:'[FETCH-1] PC=0x04 → ADDR BUS로 메모리에 주소 전달',          bus:{toMem:true,  label:'A'} },
        { ph:'f', mh:2, reg:{PC:'0x04',IR:'LOAD', R1:'7', R2:'3'}, log:'[FETCH-2] 메모리[0x04] → CTRL BUS로 명령어 CPU에 전달',      bus:{toMem:false, label:'I'} },
        { ph:'d', mh:2, reg:{PC:'0x04',IR:'ADD',  R1:'7', R2:'3'}, log:'[DECODE]  IR ← ADD R1,R2 — CU가 명령어 해석',               bus:null },
        { ph:'e', mh:2, reg:{PC:'0x06',IR:'ADD',  R1:'10',R2:'3'}, log:'[EXECUTE] R1 ← R1+R2=10 — ALU 내부 연산 (버스 사용 없음)',  bus:null },

        // ── 4번째 명령어: STORE R1,[0x12] ──
        { ph:'f', mh:3, reg:{PC:'0x06',IR:'ADD',  R1:'10',R2:'3'}, log:'[FETCH-1] PC=0x06 → ADDR BUS로 메모리에 주소 전달',          bus:{toMem:true,  label:'A'} },
        { ph:'f', mh:3, reg:{PC:'0x06',IR:'ADD',  R1:'10',R2:'3'}, log:'[FETCH-2] 메모리[0x06] → CTRL BUS로 명령어 CPU에 전달',      bus:{toMem:false, label:'I'} },
        { ph:'d', mh:3, reg:{PC:'0x06',IR:'STORE',R1:'10',R2:'3'}, log:'[DECODE]  IR ← STORE R1,[0x12] — CU가 명령어 해석',         bus:null },
        { ph:'e', mh:7, reg:{PC:'0x08',IR:'STORE',R1:'10',R2:'3'}, log:'[EXECUTE-1] 저장 주소 0x12 → ADDR BUS로 메모리 전달',        bus:{toMem:true,  label:'A'} },
        { ph:'e', mh:7, reg:{PC:'0x08',IR:'STORE',R1:'10',R2:'3'}, log:'[EXECUTE-2] R1=10 → DATA BUS로 메모리[0x12]에 쓰기',         bus:{toMem:true,  label:'D'} },

        // ── 5번째 명령어: HALT ──
        { ph:'f', mh:4, reg:{PC:'0x08',IR:'STORE',R1:'10',R2:'3'}, log:'[FETCH-1] PC=0x08 → ADDR BUS로 메모리에 주소 전달',          bus:{toMem:true,  label:'A'} },
        { ph:'f', mh:4, reg:{PC:'0x08',IR:'STORE',R1:'10',R2:'3'}, log:'[FETCH-2] 메모리[0x08] → CTRL BUS로 명령어 CPU에 전달',      bus:{toMem:false, label:'I'} },
        { ph:'d', mh:4, reg:{PC:'0x08',IR:'HALT', R1:'10',R2:'3'}, log:'[DECODE]  IR ← HALT — CU가 명령어 해석',                    bus:null },
        { ph:'e', mh:7, reg:{PC:'HALT',IR:'HALT', R1:'10',R2:'3'}, log:'[EXECUTE] HALT — 실행 완료! Mem[0x12]=10 저장됨 ✓',          bus:null, done:true },
    ];

    /* ===================== 상태 ===================== */
    let stepIdx = -1;
    let running = false;
    let timer   = null;
    let speed   = 1800;
    let memHL   = -1;
    let curReg  = { PC: '—', IR: '—', R1: '—', R2: '—' };
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
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
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

        const pad   = 20;
        const gap   = 18;
        const cpuW  = Math.min(220, W * 0.32);
        const memW  = Math.min(230, W * 0.34);
        const boxH  = Math.min(H - 32, 320);
        const boxY  = (H - boxH) / 2;
        const cpuX  = pad;
        const memX  = W - memW - pad;
        const busX1 = cpuX + cpuW;
        const busX2 = memX;
        const busY  = H / 2;

        drawBus(busX1, busX2, busY, gap);
        drawCPU(cpuX, boxY, cpuW, boxH);
        drawMem(memX, boxY, memW, boxH);

        if (busAnim) {
            // label별 버스 선 Y좌표
            // 'A' → ADDR BUS (busY + gap)
            // 'I' → CTRL BUS (busY - gap)
            // 'D' → DATA BUS (busY)
            const packetY = busAnim.label === 'A' ? busY + gap
                          : busAnim.label === 'I' ? busY - gap
                          : busY;
            drawPacket(busX1, busX2, packetY);
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

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(x + 10, y);
        ctx.arcTo(x + w, y, x + w, y + 10, 10);
        ctx.lineTo(x + w, y + 32);
        ctx.lineTo(x, y + 32);
        ctx.arcTo(x, y, x + 10, y, 10);
        ctx.closePath();
        ctx.fill();
        tx('CPU', x + w / 2, y + 16, 11, '#0f0f1a', 'center', true);

        const rp = 12, rh = 34, rg = 6;
        const rt = y + 44;

        const regs = [
            { n: 'PC', v: curReg.PC, hi: curPh === 'f' },
            { n: 'IR', v: curReg.IR, hi: curPh === 'd' },
            { n: 'R1', v: curReg.R1, hi: false },
            { n: 'R2', v: curReg.R2, hi: false },
        ];

        regs.forEach((r, i) => {
            const ry = rt + i * (rh + rg);
            const c  = r.hi ? phCol(curPh) : P.border;
            rr(x + rp, ry, w - rp * 2, rh, 5,
                r.hi ? phCol(curPh) + '1a' : P.surf2, c, r.hi ? 2 : 1);
            rr(x + rp, ry, 32, rh, 5, r.hi ? phCol(curPh) + '33' : P.bg, null);
            tx(r.n, x + rp + 16, ry + rh / 2, 9, r.hi ? phCol(curPh) : P.muted, 'center', true);
            ctx.beginPath();
            ctx.moveTo(x + rp + 32, ry + 6);
            ctx.lineTo(x + rp + 32, ry + rh - 6);
            ctx.strokeStyle = c;
            ctx.lineWidth = 1;
            ctx.stroke();
            tx(r.v, x + rp + 32 + (w - rp * 2 - 32) / 2, ry + rh / 2, 10,
                r.hi ? phCol(curPh) : P.text, 'center', r.hi);
        });

        const uy = y + h - 76;
        const uw = (w - rp * 2 - 8) / 2;

        rr(x + rp, uy, uw, 42, 5,
            aluOn ? P.purple + '1a' : P.surf2,
            aluOn ? P.purple : P.border, aluOn ? 2 : 1);
        tx('ALU', x + rp + uw / 2, uy + 21, 10, aluOn ? P.purple : P.muted, 'center', aluOn);

        rr(x + rp + uw + 8, uy, uw, 42, 5,
            cuOn ? P.teal + '1a' : P.surf2,
            cuOn ? P.teal : P.border, cuOn ? 2 : 1);
        tx('CU', x + rp + uw + 8 + uw / 2, uy + 21, 10, cuOn ? P.teal : P.muted, 'center', cuOn);
    }

    function drawMem(x, y, w, h) {
        rr(x, y, w, h, 10, P.surf, P.border, 1.5);

        ctx.fillStyle = P.teal + '33';
        ctx.beginPath();
        ctx.moveTo(x + 10, y);
        ctx.arcTo(x + w, y, x + w, y + 10, 10);
        ctx.lineTo(x + w, y + 32);
        ctx.lineTo(x, y + 32);
        ctx.arcTo(x, y, x + 10, y, 10);
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

            const label = (i === 7 && stepIdx >= 18) ? '10' : m.label;
            tx(label, x + rp + 44 + (w - rp * 2 - 44) / 2, ry + rh / 2, 9,
                hl ? P.text : P.sub, 'center', hl);
        });
    }

    function drawPacket(x1, x2, y) {
        if (!busAnim) return;
        const toM = busAnim.toMem;
        const px  = toM ? x1 + (x2 - x1) * busAnim.t : x2 - (x2 - x1) * busAnim.t;

        // label별 색상
        // 'A' → ADDR BUS → 민트
        // 'I' → CTRL BUS → 주황
        // 'D' → DATA BUS → 보라
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

    /* ===================== 단계 제어 ===================== */
    function setPhase(ph) {
        curPh = ph;
        aluOn = ph === 'e';
        cuOn  = ph === 'd';

        const map = { 'vn-fetch': 'f', 'vn-decode': 'd', 'vn-execute': 'e' };
        const cls = { 'f': 'vn__phase--fetch', 'd': 'vn__phase--decode', 'e': 'vn__phase--execute' };

        Object.entries(map).forEach(([id, p]) => {
            const e = document.getElementById(id);
            if (!e) return;
            e.classList.remove('vn__phase--fetch', 'vn__phase--decode', 'vn__phase--execute');
            if (p === ph) e.classList.add(cls[ph]);
        });
    }

    function setLog(str) {
        log.textContent = str;
    }

    function animBus(info, cb) {
        if (!info) { cb && cb(); return; }
        busAnim = { t: 0, toMem: info.toMem, label: info.label };
        const N = 140;
        let f = 0;
        function tick() {
            f++;
            busAnim.t = f / N;
            draw();
            if (f < N) rafId = requestAnimationFrame(tick);
            else { busAnim = null; draw(); cb && cb(); }
        }
        rafId = requestAnimationFrame(tick);
    }

    function applyStep(s) {
        curReg = { ...s.reg };
        memHL  = s.mh;
        setPhase(s.ph);
        setLog(s.log);
        animBus(s.bus, () => draw());
        draw();
    }

    /* ===================== 공개 API ===================== */
    function vnStart() {
        if (running) return;
        running = true;
        btnPlay.disabled = true;

        function tick() {
            stepIdx++;
            if (stepIdx >= STEPS.length) { running = false; return; }
            const s = STEPS[stepIdx];
            applyStep(s);
            if (s.done) { running = false; return; }
            timer = setTimeout(tick, speed);
        }
        tick();
    }

    function vnReset() {
        clearTimeout(timer);
        cancelAnimationFrame(rafId);
        running = false; stepIdx = -1; curPh = null; memHL = -1;
        busAnim = null; aluOn = false; cuOn = false;
        curReg = { PC: '—', IR: '—', R1: '—', R2: '—' };
        mem = MEM_INIT.map(m => ({ ...m }));

        ['vn-fetch', 'vn-decode', 'vn-execute'].forEach(id => {
            const e = document.getElementById(id);
            if (e) e.classList.remove('vn__phase--fetch', 'vn__phase--decode', 'vn__phase--execute');
        });
        setLog('시작 버튼을 눌러 Fetch → Decode → Execute 사이클을 확인하세요.');
        btnPlay.disabled = false;
        draw();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.vn__speed-btn').forEach(b => b.classList.remove('vn__speed-btn--active'));
        btn.classList.add('vn__speed-btn--active');
    }

    window.vnStart = vnStart;
    window.vnReset = vnReset;

    /* ===================== 초기화 ===================== */
    new ResizeObserver(() => resize()).observe(canvasWrap);
    setTimeout(resize, 60);
})();