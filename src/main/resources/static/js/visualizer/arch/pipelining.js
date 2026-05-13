/**
 * 파이프라이닝 인터랙티브 시각화
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
    const root = el('div', 'pl');

    const toolbar = el('div', 'pl__toolbar');
    const tbLeft  = el('div', 'pl__toolbar-left');
    tbLeft.appendChild(el('span', 'pl__title', 'Pipelining'));
    const badge = el('span', 'pl__step-badge', 'IDLE');
    badge.id = 'pl-badge';
    tbLeft.appendChild(badge);
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'pl__speed');
    speedWrap.appendChild(el('span', 'pl__speed-label', 'SPEED'));
    [['1x', 1200], ['2x', 600], ['3x', 250]].forEach(([label, ms], i) => {
        const btn = el('button', 'pl__speed-btn' + (i === 0 ? ' pl__speed-btn--active' : ''), label);
        btn.dataset.ms = ms;
        btn.addEventListener('click', () => {
            if (running) return;
            setSpeed(ms, btn);
        });
        speedWrap.appendChild(btn);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'pl__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'pl__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const logEl = el('div', 'pl__log', '▶ PLAY를 눌러 파이프라인 동작을 확인하세요.');
    logEl.id = 'pl-log';
    root.appendChild(logEl);

    const controls = el('div', 'pl__controls');
    const btnPlay  = el('button', 'pl__btn pl__btn--primary', '▶ PLAY');
    const btnStep  = el('button', 'pl__btn', '▶| STEP');
    const btnReset = el('button', 'pl__btn', '↺ RESET');
    btnPlay.id = 'pl-btn-play';
    btnStep.id = 'pl-btn-step';
    btnPlay.addEventListener('click',  plStart);
    btnStep.addEventListener('click',  plStep);
    btnReset.addEventListener('click', plReset);
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
        const mob = w < 480;
        const sc  = mob ? Math.min(1, w / 340) : Math.min(1, w / 400);
        const pad = mob ? 8 : Math.max(14, 22 * sc);
        const hdrH  = mob ? Math.max(30, Math.round(38 * sc)) : Math.max(38, Math.round(50 * sc));
        const cellH = mob ? Math.max(42, Math.round(52 * sc)) : Math.max(54, Math.round(68 * sc));
        const cellGap = Math.max(3, Math.round(5 * sc));
        const rowH  = cellH + cellGap;
        const clkBh = Math.max(38, Math.round(48 * sc));
        const minH  = pad + hdrH + 10 + 4 * rowH + 10 + clkBh + pad + 10;
        const h = Math.max(canvasWrap.offsetHeight, minH);
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
        green:  '#4ade80',
        text:   '#e8e8f0',
        sub:    '#a0a0bc',
        muted:  '#6b6b8a',
    };

    /* ===================== 파이프라인 단계 정의 ===================== */
    const STAGES = [
        { id: 'IF',  label: 'IF',  full: 'Instruction Fetch',  col: P.purple },
        { id: 'ID',  label: 'ID',  full: 'Instruction Decode', col: P.teal   },
        { id: 'EX',  label: 'EX',  full: 'Execute',            col: P.orange },
        { id: 'MEM', label: 'MEM', full: 'Memory Access',      col: '#f472b6' },
        { id: 'WB',  label: 'WB',  full: 'Write Back',         col: P.green  },
    ];

    /* ===================== 약어 툴팁 ===================== */
    const TOOLTIPS = {
        'IF':  'Instruction Fetch\nPC 주소에서 명령어를 메모리로부터 읽어옴',
        'ID':  'Instruction Decode\nCU가 명령어를 해석하고 레지스터를 읽음',
        'EX':  'Execute\nALU가 연산을 수행하거나 주소를 계산',
        'MEM': 'Memory Access\nLOAD/STORE 명령어의 실제 메모리 접근',
        'WB':  'Write Back\n연산 결과를 목적지 레지스터에 저장',
    };

    let tooltipHits = [];
    let mousePos    = { x: -1, y: -1 };
    let hoveredKey  = null;

    /* ===================== 명령어 정의 ===================== */
    const INSTRUCTIONS = [
        { id: 'I1', label: 'LOAD  R1, [0x10]', short: 'LOAD R1' },
        { id: 'I2', label: 'ADD   R2, R1, #3',  short: 'ADD  R2' },
        { id: 'I3', label: 'STORE R2, [0x20]', short: 'STORE R2' },
        { id: 'I4', label: 'SUB   R3, R2, #1',  short: 'SUB  R3' },
    ];

    const CLOCK_STATES = [
        [0,    null, null, null],
        [1,    0,    null, null],
        [2,    1,    0,    null],
        [3,    2,    1,    0   ],
        [4,    3,    2,    1   ],
        [null, 4,    3,    2   ],
        [null, null, 4,    3   ],
        [null, null, null, 4   ],
    ];

    const LOGS = [
        'Clock 1 — I1(LOAD R1)이 IF 단계에 진입합니다.',
        'Clock 2 — I1→ID, I2가 IF에 진입합니다. 파이프라인이 채워지기 시작합니다.',
        'Clock 3 — I1→EX, I2→ID, I3→IF. 3개 명령어가 동시에 처리됩니다.',
        'Clock 4 — 4개 명령어가 파이프라인을 꽉 채웠습니다! 최대 병렬 처리 중.',
        'Clock 5 — I1이 WB 완료. 첫 번째 명령어가 파이프라인을 빠져나갑니다.',
        'Clock 6 — I2가 WB 완료. 매 클럭마다 명령어 하나씩 완료됩니다.',
        'Clock 7 — I3가 WB 완료. 파이프라인이 비워지기 시작합니다.',
        'Clock 8 — I4(SUB R3)가 WB 완료. 총 8클럭, 비파이프라인 대비 절반 이하.',
    ];

    /* ===================== 상태 ===================== */
    let clockIdx = -1;
    let running  = false;
    let timer    = null;
    let speed    = 1200;
    let rafId    = null;

    let cellAnims = [];

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

    /* ===================== 레이아웃 ===================== */
    function buildLayout() {
        const W   = GW(), H = GH();
        const mob = W < 480;

        const sc  = mob ? Math.min(1, W / 340) : Math.min(1, W / 400);
        const pad = mob ? 8 : Math.max(14, 22 * sc);
        const lblW = mob ? 36 : Math.max(90, Math.round(118 * sc));
        const gap   = mob ? 4 : Math.max(8, 12 * sc);
        const gridX = pad + lblW + gap;
        const gridW = W - gridX - pad;
        const cellW   = Math.max(mob ? 36 : 54, Math.floor(gridW / STAGES.length));
        const cellH   = mob ? Math.max(42, Math.round(52 * sc))
                            : Math.max(54, Math.round(68 * sc));
        const cellGap = Math.max(3, Math.round(5 * sc));
        const hdrH = mob ? Math.max(30, Math.round(38 * sc))
                         : Math.max(38, Math.round(50 * sc));
        const rowH = cellH + cellGap;
        const topY = pad + hdrH + Math.max(6, 10 * sc);
        const clkH = Math.max(20, Math.round(26 * sc));

        return { W, H, sc, mob, pad, lblW, gridX, gridW, cellW, cellH, cellGap, hdrH, rowH, topY, clkH };
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        const W = GW(), H = GH();
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = P.bg;
        ctx.fillRect(0, 0, W, H);

        tooltipHits = [];

        const L = buildLayout();
        drawBackground(L);
        drawStageHeaders(L);
        drawInstructionLabels(L);
        drawPipelineCells(L);
        drawClockCounter(L);

        if (hoveredKey && TOOLTIPS[hoveredKey]) {
            drawTooltip(mousePos.x, mousePos.y, hoveredKey);
        }
    }

    /* ===================== 배경 그리드 선 ===================== */
    function drawBackground(L) {
        const { W, H, pad, gridX, cellW, topY, rowH, hdrH } = L;
        ctx.setLineDash([3, 5]);
        ctx.strokeStyle = P.border;
        ctx.lineWidth = 1;
        for (let s = 0; s <= STAGES.length; s++) {
            const x = gridX + s * cellW;
            ctx.beginPath();
            ctx.moveTo(x, pad);
            ctx.lineTo(x, H - pad);
            ctx.stroke();
        }

        for (let i = 0; i <= INSTRUCTIONS.length; i++) {
            const y = topY + i * rowH;
            ctx.beginPath();
            ctx.moveTo(gridX, y);
            ctx.lineTo(gridX + cellW * STAGES.length, y);
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }

    /* ===================== 단계 헤더 ===================== */
    function drawStageHeaders(L) {
        const { pad, gridX, cellW, hdrH, sc, mob } = L;
        const fMd = mob ? Math.max(11, Math.round(13 * sc))
                        : Math.max(14, Math.round(17 * sc));

        STAGES.forEach((s, i) => {
            const x  = gridX + i * cellW;
            const cx = x + cellW / 2;
            const cy = pad + hdrH / 2;

            const isHov = hoveredKey === s.id;
            rr(x + 3, pad + 2, cellW - 6, hdrH - 4, 6,
                isHov ? s.col + '28' : P.surf2,
                isHov ? s.col : P.border, isHov ? 2 : 1);

            tx(s.label, cx, cy, fMd, isHov ? s.col : P.sub, 'center', true);

            const qx  = x + cellW - 10;
            const qy  = pad + hdrH - 8;
            ctx.beginPath();
            ctx.arc(qx, qy, 6, 0, Math.PI * 2);
            ctx.fillStyle   = isHov ? s.col : P.surf2;
            ctx.fill();
            ctx.strokeStyle = isHov ? s.col : P.muted;
            ctx.lineWidth = 1;
            ctx.stroke();
            tx('?', qx, qy, 7, isHov ? '#fff' : P.muted, 'center', true);
            tooltipHits.push({ x: qx - 6, y: qy - 6, w: 12, h: 12, key: s.id });
        });
    }

    /* ===================== 명령어 레이블 ===================== */
    function drawInstructionLabels(L) {
        const { pad, lblW, gridX, topY, rowH, cellH, sc, mob } = L;
        const fSm = Math.max(11, Math.round(13 * sc));
        const fMd = Math.max(13, Math.round(16 * sc));

        INSTRUCTIONS.forEach((instr, i) => {
            const y  = topY + i * rowH;
            const cy = y + cellH / 2;
            const x  = pad;

            const done = clockIdx >= 0 &&
                CLOCK_STATES[clockIdx][i] === null &&
                clockIdx >= (4 + i);

            rr(x, y + 2, lblW - 4, cellH - 4, 5,
                done ? P.green + '18' : P.surf2,
                done ? P.green + '66' : P.border, 1);

            if (mob) {
                tx(instr.id, x + (lblW - 4) / 2, cy, fMd,
                    done ? P.green : P.sub, 'center', true);
            } else {
                const divX = Math.max(30, 38 * sc);
                tx(instr.id, x + divX / 2, cy, fMd,
                    done ? P.green : P.sub, 'center', true);

                ctx.beginPath();
                ctx.moveTo(x + divX, y + 6);
                ctx.lineTo(x + divX, y + cellH - 6);
                ctx.strokeStyle = P.border;
                ctx.lineWidth = 1;
                ctx.stroke();

                tx(instr.short, x + divX + (lblW - 4 - divX) / 2,
                    cy, fSm, done ? P.green : P.sub, 'center', done);
            }
        });
    }

    /* ===================== 파이프라인 셀 ===================== */
    function drawPipelineCells(L) {
        const { gridX, topY, rowH, cellW, cellH, sc, mob } = L;
        const fMd = mob ? Math.max(10, Math.round(12 * sc))
                        : Math.max(13, Math.round(16 * sc));
        const fSm = mob ? Math.max(8,  Math.round(10 * sc))
                        : Math.max(10, Math.round(12 * sc));

        if (clockIdx < 0) return;

        const state = CLOCK_STATES[clockIdx];

        INSTRUCTIONS.forEach((instr, instrIdx) => {
            const stageIdx = state[instrIdx];
            if (stageIdx === null) return;

            const stage = STAGES[stageIdx];
            const x  = gridX + stageIdx * cellW;
            const y  = topY + instrIdx * rowH;
            const cx = x + cellW / 2;
            const cy = y + cellH / 2;

            const col = stage.col;
            rr(x + 4, y + 3, cellW - 8, cellH - 6, 6,
                col + '22', col, 2);

            tx(stage.label, cx, cy - Math.max(5, 7 * sc), fMd, col, 'center', true);

            tx('clk ' + (clockIdx + 1), cx, cy + Math.max(5, 7 * sc), fSm, col + 'bb', 'center', false);
        });

        for (let prevClock = 0; prevClock < clockIdx; prevClock++) {
            const prevState = CLOCK_STATES[prevClock];
            INSTRUCTIONS.forEach((instr, instrIdx) => {
                const prevStageIdx = prevState[instrIdx];
                const curStageIdx  = state[instrIdx];
                if (prevStageIdx === null) return;
                if (prevStageIdx === curStageIdx) return;

                const stage = STAGES[prevStageIdx];
                const x  = gridX + prevStageIdx * cellW;
                const y  = topY + instrIdx * rowH;
                const cx = x + cellW / 2;
                const cy = y + cellH / 2;

                rr(x + 4, y + 3, cellW - 8, cellH - 6, 6,
                    stage.col + '08', stage.col + '30', 1);
                tx(stage.label, cx, cy, fSm, stage.col + '55', 'center', false);
            });
        }
    }

    /* ===================== 클럭 카운터 ===================== */
    function drawClockCounter(L) {
        const { pad, lblW, topY, rowH, sc } = L;
        if (clockIdx < 0) return;

        const listBottom = topY + INSTRUCTIONS.length * rowH;
        const bw = lblW - 4;
        const bh = Math.max(38, Math.round(48 * sc));
        const bx = pad;
        const by = listBottom + Math.max(6, 10 * sc);

        const fLbl = Math.max(8,  Math.round(10 * sc));
        const fNum = Math.max(11, Math.round(13 * sc));

        rr(bx, by, bw, bh, 4, P.surf2, P.purple + '66', 1);
        tx('CLK',  bx + bw / 2, by + bh / 2 - Math.max(8, 10 * sc), fLbl, P.muted,  'center', false);
        tx(`${clockIdx + 1} / ${CLOCK_STATES.length}`,
                   bx + bw / 2, by + bh / 2 + Math.max(6, 8  * sc), fNum, P.purple, 'center', true);
    }

    /* ===================== 툴팁 ===================== */
    function drawTooltip(mx, my, key) {
        const lines  = TOOLTIPS[key].split('\n');
        const title  = lines[0];
        const desc   = lines[1] || '';
        const stageCol = (STAGES.find(s => s.id === key) || {}).col || P.purple;

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
        badge.className   = 'pl__step-badge' + (str !== 'IDLE' ? ' pl__step-badge--active' : '');
    }

    function applyStep(idx, onDone) {
        clockIdx = idx;
        const clk = idx + 1;
        setBadge('CLOCK ' + clk);
        setLog(LOGS[idx]);
        draw();
        onDone && setTimeout(onDone, 0);
    }

    /* ===================== 배속 버튼 활성/비활성 ===================== */
    function setSpeedBtnsDisabled(disabled) {
        root.querySelectorAll('.pl__speed-btn').forEach(b => { b.disabled = disabled; });
    }

    /* ===================== 공개 API ===================== */
    function plStart() {
        if (running) return;
        running = true;
        btnPlay.disabled = true;
        btnStep.disabled = true;
        setSpeedBtnsDisabled(true);

        function tick() {
            const next = clockIdx + 1;
            if (next >= CLOCK_STATES.length) {
                running = false;
                btnStep.disabled = true;
                setSpeedBtnsDisabled(false);
                return;
            }
            const isLast = (next === CLOCK_STATES.length - 1);
            applyStep(next, () => {
                if (isLast) {
                    running = false;
                    btnStep.disabled = true;
                    setSpeedBtnsDisabled(false);
                } else {
                    timer = setTimeout(tick, speed);
                }
            });
        }
        tick();
    }

    function plStep() {
        if (running) return;
        const next = clockIdx + 1;
        if (next >= CLOCK_STATES.length) return;
        applyStep(next);
        if (next === CLOCK_STATES.length - 1) {
            btnPlay.disabled = true;
            btnStep.disabled = true;
        }
    }

    function plReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false;
        clockIdx = -1;
        setLog('▶ PLAY를 눌러 파이프라인 동작을 확인하세요.');
        setBadge('IDLE');
        btnPlay.disabled = false;
        btnStep.disabled = false;
        setSpeedBtnsDisabled(false);
        draw();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.pl__speed-btn').forEach(b => b.classList.remove('pl__speed-btn--active'));
        btn.classList.add('pl__speed-btn--active');
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

    /* ===================== 초기화 ===================== */
    new ResizeObserver(() => resize()).observe(canvasWrap);
    setTimeout(resize, 60);
})();