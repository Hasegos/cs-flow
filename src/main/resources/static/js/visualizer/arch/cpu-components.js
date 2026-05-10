/**
 * cpu-components.js
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
    [['1x', 1000], ['2x', 500], ['3x', 220]].forEach(([label, ms], i) => {
        const btn = el('button', 'cpu__speed-btn' + (i === 0 ? ' cpu__speed-btn--active' : ''), label);
        btn.addEventListener('click', () => setSpeed(ms, btn));
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
    const btnReset = el('button', 'cpu__btn', '↺ RESET');
    btnPlay.id = 'cpu-btn-play';
    btnPlay.addEventListener('click', cpuStart);
    btnReset.addEventListener('click', cpuReset);
    controls.appendChild(btnPlay);
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
    const STEPS = [
        { active:'PC',  flow:null,                  regs:{PC:'0x04',IR:'—',      MAR:'—',    MBR:'—',     ACC:'5'}, alu:false, cu:false, badge:'FETCH',   log:'[PC] 다음 명령어 주소 0x04를 MAR로 전달합니다.' },
        { active:'MAR', flow:{from:'PC',  to:'MAR'},regs:{PC:'0x04',IR:'—',      MAR:'0x04', MBR:'—',     ACC:'5'}, alu:false, cu:false, badge:'FETCH',   log:'[MAR] 메모리 주소 0x04 저장 완료. 메모리에서 명령어를 읽습니다.' },
        { active:'MBR', flow:{from:'MEM',to:'MBR'}, regs:{PC:'0x04',IR:'—',      MAR:'0x04', MBR:'ADD 10',ACC:'5'}, alu:false, cu:false, badge:'FETCH',   log:'[MBR] 메모리[0x04]에서 명령어 "ADD 0x10"을 읽어 MBR에 저장했습니다.' },
        { active:'IR',  flow:{from:'MBR',to:'IR'},  regs:{PC:'0x05',IR:'ADD 10', MAR:'0x04', MBR:'ADD 10',ACC:'5'}, alu:false, cu:true,  badge:'DECODE',  log:'[IR → CU] 명령어를 IR에 적재. CU가 명령어를 해석합니다.' },
        { active:'MAR', flow:{from:'CU', to:'MAR'}, regs:{PC:'0x05',IR:'ADD 10', MAR:'0x10', MBR:'ADD 10',ACC:'5'}, alu:false, cu:true,  badge:'DECODE',  log:'[CU → MAR] CU가 피연산자 주소 0x10을 MAR로 전달합니다.' },
        { active:'MBR', flow:{from:'MEM',to:'MBR'}, regs:{PC:'0x05',IR:'ADD 10', MAR:'0x10', MBR:'3',     ACC:'5'}, alu:false, cu:false, badge:'EXECUTE', log:'[메모리 → MBR] 메모리[0x10] = 3 읽기 완료.' },
        { active:'ALU', flow:{from:'MBR',to:'ALU'}, regs:{PC:'0x05',IR:'ADD 10', MAR:'0x10', MBR:'3',     ACC:'5'}, alu:true,  cu:false, badge:'EXECUTE', log:'[ALU] ACC(5) + MBR(3) 덧셈 연산 수행 중...' },
        { active:'ACC', flow:{from:'ALU',to:'ACC'}, regs:{PC:'0x05',IR:'ADD 10', MAR:'0x10', MBR:'3',     ACC:'8'}, alu:true,  cu:false, badge:'EXECUTE', log:'[ALU → ACC] 연산 결과 8이 ACC에 저장되었습니다. 완료!', done:true },
    ];

    /* ===================== 상태 ===================== */
    let stepIdx  = -1;
    let running  = false;
    let timer    = null;
    let speed    = 1900;
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

    /* ===================== 반응형 스케일 계산 ===================== */
    function getScale(W) {
        // 600px 기준, 그 이하면 비율에 맞게 축소
        return Math.min(1, W / 600);
    }

    /* ===================== 레이아웃 ===================== */
    function buildLayout() {
        const W   = GW(), H = GH();
        const sc  = getScale(W);
        const pad = Math.max(12, 24 * sc);

        const memW = Math.max(100, Math.min(160, W * 0.22));
        const memH = Math.max(110, 150 * sc);
        const memX = W - memW - pad;
        const memY = (H - memH) / 2;

        // CPU 박스 — 화면 크기에 따라 적정 너비
        const cpuMaxW = memX - pad * 2 - Math.max(40, 60 * sc);
        const cpuW    = Math.min(580, cpuMaxW);
        const cpuX    = pad;
        const cpuY    = pad + 8;
        const cpuH    = H - pad * 2 - 16;

        return { W, H, sc, pad, cpuX, cpuY, cpuW, cpuH, memW, memH, memX, memY };
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        const W = GW(), H = GH();
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = P.bg;
        ctx.fillRect(0, 0, W, H);

        const L = buildLayout();
        _layout = L;

        drawCPUBox(L);
        drawMemoryBox(L);
        drawDataBus(L);
        if (flowAnim) drawFlowPacket(L);
    }

    /* ===================== CPU 박스 ===================== */
    function drawCPUBox(L) {
        const { cpuX, cpuY, cpuW, cpuH, sc } = L;
        const active = curStep ? curStep.active : null;
        const aluOn  = curStep ? curStep.alu    : false;
        const cuOn   = curStep ? curStep.cu     : false;
        const regs   = curStep ? curStep.regs   : { PC:'—', IR:'—', MAR:'—', MBR:'—', ACC:'—' };

        // 스케일에 따른 폰트/크기
        const fSm   = Math.max(7,  Math.round(9  * sc));  // 설명 텍스트
        const fMd   = Math.max(9,  Math.round(13 * sc));  // 레이블
        const fLg   = Math.max(10, Math.round(14 * sc));  // 값
        const fHd   = Math.max(10, Math.round(13 * sc));  // 헤더
        const lblW  = Math.max(36, Math.round(56 * sc));  // 레이블 영역 너비
        const rp    = Math.max(8,  Math.round(14 * sc));  // 패딩
        const rGap  = Math.max(6,  Math.round(10 * sc));
        const rH    = Math.max(44, Math.round(60 * sc));
        const rVGap = Math.max(6,  Math.round(10 * sc));
        const rTop  = cpuY + Math.max(36, Math.round(48 * sc));

        rr(cpuX, cpuY, cpuW, cpuH, 10, P.surf, P.purple, 2);

        // 헤더
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
            { id:'PC',  label:'PC',  desc:'Program Counter',      col: P.orange },
            { id:'IR',  label:'IR',  desc:'Instruction Reg',      col: P.teal   },
            { id:'MAR', label:'MAR', desc:'Memory Addr Reg',      col: P.purple },
            { id:'MBR', label:'MBR', desc:'Memory Buffer Reg',    col: P.purple },
            { id:'ACC', label:'ACC', desc:'Accumulator',          col: P.teal   },
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

            regPos[r.id] = { x: rx, y: ry, w: rw, h: rH, cx: rx + rw / 2, cy: ry + rH / 2 };

            rr(rx, ry, rw, rH, 6,
                isAct ? r.col + '22' : P.surf2,
                isAct ? r.col : P.border, isAct ? 2.5 : 1);

            // 레이블 배경
            rr(rx, ry, lblW, rH, 6, isAct ? r.col + '33' : P.bg, null);

            // 레이블명
            tx(r.label, rx + lblW / 2, ry + rH / 2 - fSm - 1, fMd, isAct ? r.col : P.sub, 'center', true);
            // 설명 — sc가 작아도 표시
            tx(r.desc,  rx + lblW / 2, ry + rH / 2 + fSm + 1, fSm, isAct ? r.col + 'cc' : P.muted, 'center');

            // 구분선
            ctx.beginPath();
            ctx.moveTo(rx + lblW, ry + 6);
            ctx.lineTo(rx + lblW, ry + rH - 6);
            ctx.strokeStyle = isAct ? r.col + '88' : P.border;
            ctx.lineWidth = 1;
            ctx.stroke();

            const val = regs[r.id] || '—';
            tx(val, rx + lblW + (rw - lblW) / 2, ry + rH / 2, fLg,
                isAct ? r.col : P.text, 'center', isAct);
        });

        // ALU / CU
        const unitTop = rTop + 3 * (rH + rVGap) + rVGap / 2;
        const unitW   = (cpuW - rp * 2 - rGap) / 2;
        const unitH   = Math.max(40, Math.round(56 * sc));
        const aluX    = cpuX + rp;
        const cuX     = cpuX + rp + unitW + rGap;

        rr(aluX, unitTop, unitW, unitH, 6,
            aluOn ? P.teal + '1a' : P.surf2,
            aluOn ? P.teal : P.border, aluOn ? 2.5 : 1);
        tx('ALU',                   aluX + unitW / 2, unitTop + unitH / 2 - fSm - 1, fLg, aluOn ? P.teal : P.muted, 'center', aluOn);
        tx('Arithmetic Logic Unit', aluX + unitW / 2, unitTop + unitH / 2 + fSm + 1, fSm, P.muted, 'center');

        rr(cuX, unitTop, unitW, unitH, 6,
            cuOn ? P.orange + '1a' : P.surf2,
            cuOn ? P.orange : P.border, cuOn ? 2.5 : 1);
        tx('CU',           cuX + unitW / 2, unitTop + unitH / 2 - fSm - 1, fLg, cuOn ? P.orange : P.muted, 'center', cuOn);
        tx('Control Unit', cuX + unitW / 2, unitTop + unitH / 2 + fSm + 1, fSm, P.muted, 'center');

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

        const rowH  = Math.max(30, Math.round(38 * sc));
        const rowGap = Math.max(4, Math.round(8 * sc));
        const mRows = [
            { addr:'0x04', val:'ADD 0x10', hl: curStep && curStep.regs.MAR === '0x04' },
            { addr:'0x10', val:'3',        hl: curStep && curStep.regs.MAR === '0x10' },
        ];

        mRows.forEach((r, i) => {
            const ry   = memY + 34 + i * (rowH + rowGap);
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

        const fBus  = Math.max(8, Math.round(10 * L.sc));
        const lblW  = Math.max(56, Math.round(78 * L.sc));
        const lblH  = Math.max(16, Math.round(22 * L.sc));
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

        // 출발 중심
        const from = getFromCenter(fromKey);

        if (_layout._regPos && _layout._regPos[key]) {
            const n = _layout._regPos[key];
            if (!from) return { x: n.cx, y: n.cy };

            // 방향 벡터 계산
            const dx = n.cx - from.x;
            const dy = n.cy - from.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist === 0) return { x: n.cx, y: n.cy };

            // 노드 경계까지의 오프셋 (박스 안으로 16px 진입)
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
        const fromPos = getFromCenter(from);
        const toPos   = getToCenter(to, from);
        if (!fromPos || !toPos) { cb && cb(); return; }
        flowAnim = { fromPos, toPos, t: 0 };
        const N = 50;
        let f = 0;
        function tick() {
            f++;
            flowAnim.t = f / N;
            draw();
            if (f < N) rafId = requestAnimationFrame(tick);
            else { flowAnim = null; draw(); cb && cb(); }
        }
        rafId = requestAnimationFrame(tick);
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

    /* ===================== 단계 제어 ===================== */
    function setLog(str)   { logEl.textContent = str; }
    function setBadge(str) {
        badge.textContent = str;
        badge.className   = 'cpu__step-badge' + (str !== 'IDLE' ? ' cpu__step-badge--active' : '');
    }

    function animFlow(from, to, cb) {
        if (!from || !to) { cb && cb(); return; }
        const fromPos = getFromCenter(from);
        const toPos   = getToCenter(to);

        if (!fromPos || !toPos) { cb && cb(); return; }
        flowAnim = { fromPos, toPos, t: 0 };
        const N = 140;
        let f = 0;
        function tick() {
            f++;
            flowAnim.t = f / N;
            draw();
            if (f < N) rafId = requestAnimationFrame(tick);
            else { flowAnim = null; draw(); cb && cb(); }
        }
        rafId = requestAnimationFrame(tick);
    }

    function applyStep(s) {
        curStep = s;
        setLog(s.log);
        setBadge(s.badge);
        if (s.flow) animFlow(s.flow.from, s.flow.to, () => draw());
        else draw();
    }

    /* ===================== 공개 API ===================== */
    function cpuStart() {
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

    function cpuReset() {
        clearTimeout(timer);
        cancelAnimationFrame(rafId);
        running = false; stepIdx = -1; curStep = null; flowAnim = null;
        setLog('▶ PLAY를 눌러 CPU 구성 요소의 동작을 확인하세요.');
        setBadge('IDLE');
        btnPlay.disabled = false;
        draw();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.cpu__speed-btn').forEach(b => b.classList.remove('cpu__speed-btn--active'));
        btn.classList.add('cpu__speed-btn--active');
    }

    /* ===================== 초기화 ===================== */
    new ResizeObserver(() => resize()).observe(canvasWrap);
    setTimeout(resize, 60);
})();