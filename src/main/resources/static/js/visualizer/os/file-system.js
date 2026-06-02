/**
 * 파일 시스템 시각화
 * 모드 0: inode — /home/user/hello.txt 경로 탐색
 * 모드 1: FAT   — 클러스터 체인 3→7→12→EOF
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

    const root    = el('div', 'fs-viz');
    const toolbar = el('div', 'fs-viz__toolbar');
    const tbLeft  = el('div', 'fs-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'fs-viz__title', 'File System'));

    const modeHint = el('span', 'fs-viz__mode-hint', '모드 →');
    const modeTabs = el('div', 'fs-viz__mode-tabs');
    ['inode', 'FAT'].forEach(function (lbl, i) {
        const b = el('button', 'fs-viz__mode-btn' + (i === 0 ? ' fs-viz__mode-btn--active' : ''), lbl);
        b.addEventListener('click', function () { if (!running) setMode(i, b); });
        modeTabs.appendChild(b);
    });
    tbLeft.appendChild(modeHint);
    tbLeft.appendChild(modeTabs);
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'fs-viz__speed');
    speedWrap.appendChild(el('span', 'fs-viz__speed-label', 'SPEED'));
    [['1x', 1800], ['2x', 900], ['3x', 600]].forEach(function (pair, i) {
        const b = el('button', 'fs-viz__speed-btn' + (i === 0 ? ' fs-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'fs-viz__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'fs-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const logEl = el('div', 'fs-viz__log', '▶ PLAY를 눌러 파일 시스템 동작을 확인하세요.');
    root.appendChild(logEl);

    const controls = el('div', 'fs-viz__controls');
    const btnPlay  = el('button', 'fs-viz__btn fs-viz__btn--primary', '▶ PLAY');
    const btnStep  = el('button', 'fs-viz__btn', '▶| STEP');
    const btnReset = el('button', 'fs-viz__btn', '↺ RESET');
    btnPlay.addEventListener('click',  fsStart);
    btnStep.addEventListener('click',  fsStep);
    btnReset.addEventListener('click', fsReset);
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
        const h   = Math.max(canvasWrap.offsetHeight, mob ? 520 : 480);
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        if (mob) canvasWrap.style.minHeight = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    let P = window.CsFlow.getP();

    /* ===================== 시나리오 ===================== */
    const INODE_STEPS = [
        {
            log: 'Step 1 — open("/home/user/hello.txt") 호출. OS는 루트 디렉토리(/)의 inode(번호 2)부터 탐색을 시작합니다. 모든 경로 탐색은 항상 루트 inode에서 시작합니다.',
            hl: ['root'],
        },
        {
            log: 'Step 2 — 루트 inode가 가리키는 데이터 블록에서 "home" 항목을 찾습니다. home 디렉토리의 inode 번호(7)를 확인하고 inode 테이블에서 inode 7을 읽습니다.',
            hl: ['root', 'home'],
        },
        {
            log: 'Step 3 — inode 7(home)의 데이터 블록에서 "user" 항목을 찾습니다. user 디렉토리의 inode 번호(23)를 확인합니다.',
            hl: ['root', 'home', 'user'],
        },
        {
            log: 'Step 4 — inode 23(user)의 데이터 블록에서 "hello.txt" 항목을 찾습니다. hello.txt의 inode 번호(91)를 획득합니다. inode 91에 파일 크기·권한·블록 포인터가 저장됩니다.',
            hl: ['root', 'home', 'user', 'inode'],
        },
        {
            log: 'Step 5 — inode 91의 직접 블록 포인터가 데이터 블록(#142, #143)을 가리킵니다. OS가 해당 블록을 읽어 파일 내용을 반환합니다. 경로 탐색 완료!',
            hl: ['root', 'home', 'user', 'inode', 'data'],
        },
    ];

    const FAT_TABLE = [
        { n:0,  val:'Reserved' }, { n:1,  val:'Reserved' },
        { n:2,  val:'FREE'     }, { n:3,  val:'7',   file:'hello' },
        { n:4,  val:'FREE'     }, { n:5,  val:'9',   file:'world' },
        { n:6,  val:'FREE'     }, { n:7,  val:'12',  file:'hello' },
        { n:8,  val:'FREE'     }, { n:9,  val:'EOF', file:'world' },
        { n:10, val:'FREE'     }, { n:11, val:'FREE' },
        { n:12, val:'EOF', file:'hello' }, { n:13, val:'FREE' },
        { n:14, val:'FREE'     }, { n:15, val:'FREE' },
    ];

    const FAT_STEPS = [
        {
            log:    'Step 1 — FAT 초기 상태. 클러스터 0·1 예약(Reserved), 나머지 FREE 또는 파일 체인. 디렉토리 엔트리에서 hello.txt의 시작 클러스터(3)를 얻습니다.',
            active: [],
        },
        {
            log:    'Step 2 — 디렉토리 엔트리에서 hello.txt 시작 클러스터 = 3. FAT[3]을 읽습니다.',
            active: [3],
        },
        {
            log:    'Step 3 — FAT[3] = 7. 다음 클러스터는 7. 클러스터 3 데이터 읽고 FAT[7]로 이동합니다.',
            active: [3, 7],
        },
        {
            log:    'Step 4 — FAT[7] = 12. 다음 클러스터는 12. 클러스터 7 데이터 읽고 FAT[12]로 이동합니다.',
            active: [3, 7, 12],
        },
        {
            log:    'Step 5 — FAT[12] = EOF. 마지막 클러스터. 체인 3→7→12 총 3개 클러스터 읽기 완료. FAT는 연결 리스트 방식이라 랜덤 접근 시 처음부터 체인을 따라가야 합니다.',
            active: [3, 7, 12],
            done:   true,
        },
    ];

    /* ===================== 상태 변수 ===================== */
    let modeIdx  = 0;
    let stepIdx  = -1;
    let running  = false;
    let timer    = null;
    let rafId    = null;
    let speed    = 1800;

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

    function arrowH(x2, y2, ux, uy, col, sz) {
        const p = sz || 7;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - ux*p*2 - uy*p, y2 - uy*p*2 + ux*p);
        ctx.lineTo(x2 - ux*p*2 + uy*p, y2 - uy*p*2 - ux*p);
        ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
    }

    function arrow(x1, y1, x2, y2, col, lw) {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.strokeStyle = col; ctx.lineWidth = lw || 2; ctx.stroke();
        const dx = x2-x1, dy = y2-y1, len = Math.sqrt(dx*dx+dy*dy);
        if (len > 4) arrowH(x2, y2, dx/len, dy/len, col);
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        ctx.fillStyle = P.bg;
        ctx.fillRect(0, 0, GW(), GH());
        tooltipHits = [];

        if (modeIdx === 0) drawInode();
        else               drawFAT();
    }

    /* ==========================================
     * inode 모드
     * ========================================== */
    function drawInode() {
        const W = GW(), H = GH();
        const mob = W < 520;
        const fMd = mob ? 12 : 14;
        const fSm = mob ? 10 : 12;
        const pad = mob ? 10 : 20;

        const step = stepIdx >= 0 ? INODE_STEPS[stepIdx] : INODE_STEPS[0];
        const hl   = step.hl || [];

        /* ── 경로 바 ── */
        const pathH   = mob ? 38 : 46;
        const pathY   = mob ? 16 : 20;
        const segs    = [
            { lbl: '/',        key: null   },
            { lbl: 'home',     key: 'home' },
            { lbl: '/',        key: null   },
            { lbl: 'user',     key: 'user' },
            { lbl: '/',        key: null   },
            { lbl: 'hello.txt',key: 'inode'},
        ];
        const segW  = Math.floor((W - pad*2) / segs.length);
        const pathX = pad;

        rr(pathX, pathY, W - pad*2, pathH, 6, P.surf, P.border, 1);
        segs.forEach(function (seg, i) {
            const sx    = pathX + i * segW;
            const isHl  = seg.key && hl.indexOf(seg.key) !== -1;
            const col   = seg.lbl === '/' ? P.muted : (isHl ? P.teal : P.sub);
            tx(seg.lbl, sx + segW/2, pathY + pathH/2, isHl ? fSm+1 : fSm, col, 'center', isHl);
        });

        /* ── 노드 배치 계산 ── */
        const nodeTop = pathY + pathH + (mob ? 18 : 24);
        const botPad  = mob ? 12 : 16;
        const nodeH   = Math.floor((H - nodeTop - botPad) / (mob ? 3 : 1));
        const nodeHadj = mob ? nodeH - 10 : Math.min(nodeH, mob ? 160 : 200);

        if (mob) {
            /* 모바일: 수직 3단 - 각 박스가 화면 너비 꽉 차게 */
            const nW  = W - pad*2;
            const gap = 12;
            const h1  = Math.round((H - nodeTop - botPad - gap*2) / 3);

            const y1 = nodeTop;
            const y2 = y1 + h1 + gap;
            const y3 = y2 + h1 + gap;

            drawDir(pad, y1, nW, h1, hl, fMd, fSm);
            if (hl.indexOf('inode') !== -1 || hl.indexOf('data') !== -1) {
                /* 화살표 */
                arrow(pad + nW/2, y1 + h1, pad + nW/2, y2, P.teal, 2);
                drawInodePanel(pad, y2, nW, h1, hl, fMd, fSm);
            }
            if (hl.indexOf('data') !== -1) {
                arrow(pad + nW/2, y2 + h1, pad + nW/2, y3, P.purple, 2);
                drawDataPanel(pad, y3, nW, h1, fMd, fSm);
            }
        } else {
            /* 데스크탑: 수평 3열 — 남은 세로 공간 전부 활용 */
            const totalH  = H - nodeTop - botPad;
            const col1W   = Math.round(W * 0.28);
            const col2W   = Math.round(W * 0.32);
            const col3W   = W - col1W - col2W - pad*2 - 36;
            const col1X   = pad;
            const col2X   = col1X + col1W + 18;
            const col3X   = col2X + col2W + 18;
            const boxH    = Math.min(totalH, 280);
            const boxY    = nodeTop + Math.round((totalH - boxH) / 2);

            drawDir(col1X, boxY, col1W, boxH, hl, fMd, fSm);

            if (hl.indexOf('inode') !== -1 || hl.indexOf('data') !== -1) {
                arrow(col1X + col1W + 2, boxY + boxH/2, col2X - 2, boxY + boxH/2, P.teal, 2.5);
                drawInodePanel(col2X, boxY, col2W, boxH, hl, fMd, fSm);
            }
            if (hl.indexOf('data') !== -1) {
                arrow(col2X + col2W + 2, boxY + boxH/2, col3X - 2, boxY + boxH/2, P.purple, 2.5);
                drawDataPanel(col3X, boxY, col3W, boxH, fMd, fSm);
            }
        }
    }

    /* 디렉토리 트리 박스 */
    function drawDir(x, y, w, h, hl, fMd, fSm) {
        rr(x, y, w, h, 8, P.surf, P.border, 1.5);

        /* 타이틀 */
        const titleH = Math.round(h * 0.14);
        tx('Directory', x + w/2, y + titleH/2, fSm, P.muted, 'center', true);
        ctx.beginPath(); ctx.moveTo(x+10, y+titleH); ctx.lineTo(x+w-10, y+titleH);
        ctx.strokeStyle = P.border; ctx.lineWidth = 1; ctx.stroke();

        const entries = [
            { key:'root', lbl:'/ (root)', sub:'inode 2',  col: P.teal },
            { key:'home', lbl:'home/',    sub:'inode 7',  col: P.purple },
            { key:'user', lbl:'user/',    sub:'inode 23', col: P.orange },
        ];
        const rowH = Math.floor((h - titleH - 8) / entries.length);

        entries.forEach(function (e, i) {
            const ry    = y + titleH + 4 + i * rowH;
            const isHl  = hl.indexOf(e.key) !== -1;

            if (isHl) {
                rr(x + 6, ry + 2, w - 12, rowH - 4, 4,
                   e.col + '22', e.col, 1.5);
            }

            const indent = i * 12;
            tx(e.lbl, x + 14 + indent, ry + rowH/2, fSm, isHl ? e.col : P.sub, 'left', isHl);
            tx(e.sub, x + w - 10, ry + rowH/2, fSm - 1, isHl ? e.col + 'cc' : P.muted, 'right', false);
        });
    }

    /* inode 상세 박스 */
    function drawInodePanel(x, y, w, h, hl, fMd, fSm) {
        const isData = hl.indexOf('data') !== -1;
        const col    = P.purple;

        rr(x, y, w, h, 8, col + '18', col, 2);

        const titleH = Math.round(h * 0.14);
        tx('inode  #91', x + w/2, y + titleH/2, fMd, col, 'center', true);
        ctx.beginPath(); ctx.moveTo(x+10, y+titleH); ctx.lineTo(x+w-10, y+titleH);
        ctx.strokeStyle = col + '44'; ctx.lineWidth = 1; ctx.stroke();

        const fields = [
            { label: '링크 수', value: '1'         },
            { label: '크기',   value: '2.3 KB'    },
            { label: '권한',   value: 'rw-r--r--' },
            { label: '블록 →', value: '#142, #143' },
        ];
        const rowH = Math.floor((h - titleH - 8) / fields.length);

        fields.forEach(function (f, i) {
            const fy  = y + titleH + 4 + i * rowH;
            const isBlk = i === 3;
            const vc  = isBlk && isData ? P.green : P.text;

            /* 블록 행 강조 */
            if (isBlk && isData) {
                rr(x + 6, fy + 2, w - 12, rowH - 4, 3, P.green + '18', P.green, 1);
            }

            tx(f.label, x + 14,     fy + rowH/2, fSm - 1, P.muted, 'left',  false);
            tx(f.value, x + w - 10, fy + rowH/2, fSm,     vc,      'right', isBlk && isData);
        });
    }

    /* 데이터 블록 박스 */
    function drawDataPanel(x, y, w, h, fMd, fSm) {
        rr(x, y, w, h, 8, P.green + '18', P.green, 2.5);

        const titleH = Math.round(h * 0.14);
        tx('Data Blocks', x + w/2, y + titleH/2, fMd, P.green, 'center', true);
        ctx.beginPath(); ctx.moveTo(x+10, y+titleH); ctx.lineTo(x+w-10, y+titleH);
        ctx.strokeStyle = P.green + '44'; ctx.lineWidth = 1; ctx.stroke();

        /* 블록 2개 나란히 */
        const blkPad  = 10;
        const blkGap  = 8;
        const blkW    = Math.floor((w - blkPad*2 - blkGap) / 2);
        const blkH    = Math.round((h - titleH - blkPad*2 - 30) * 0.85);
        const blkY    = y + titleH + blkPad;

        ['#142', '#143'].forEach(function (lbl, i) {
            const bx = x + blkPad + i * (blkW + blkGap);
            rr(bx, blkY, blkW, blkH, 4, P.green + '25', P.green, 1.5);
            tx(lbl,       bx + blkW/2, blkY + blkH * 0.38, fSm,   P.green, 'center', true);
            tx('data...', bx + blkW/2, blkY + blkH * 0.68, fSm-2, P.muted, 'center', false);
        });

        /* 완료 텍스트 — 블록 아래 충분한 공간 */
        const doneY = blkY + blkH + Math.round((h - titleH - blkPad - blkH - blkY + y) / 2) + 8;
        tx('✓ 파일 읽기 완료', x + w/2, doneY, fSm, P.green, 'center', true);
    }

    /* ==========================================
     * FAT 모드
     * ========================================== */
    function drawFAT() {
        const W = GW(), H = GH();
        const mob = W < 520;
        const fMd = mob ? 12 : 14;
        const fSm = mob ? 10 : 11;
        const pad = mob ? 8  : 20;

        const step   = stepIdx >= 0 ? FAT_STEPS[stepIdx] : FAT_STEPS[0];
        const active = step.active || [];

        /* 타이틀 */
        tx('FAT (File Allocation Table)  —  hello.txt 탐색',
           W/2, mob ? 14 : 18, fSm, P.muted, 'center', false);

        /* 그리드 4×4 */
        const cols    = 4;
        const rows    = 4;
        const legH    = 28;
        const doneH   = mob ? 32 : 38;  /* 완료 배너 높이 */
        const botGap  = mob ? 8  : 10;  /* 요소 간 여백 */
        const titleY  = mob ? 26 : 32;
        /* 그리드가 끝난 뒤: doneH + botGap + legH + botGap */
        const botReserve = doneH + legH + botGap * 4;
        const gridH   = H - titleY - botReserve;
        const cellW   = Math.floor((W - pad*2) / cols);
        const cellH   = Math.floor(gridH / rows);
        const gridX   = pad;
        const gridY   = titleY;

        FAT_TABLE.forEach(function (entry, i) {
            const col  = i % cols;
            const row  = Math.floor(i / cols);
            const cx   = gridX + col * cellW;
            const cy   = gridY + row * cellH;

            const isActive   = active.indexOf(entry.n) !== -1;
            const isHello    = entry.file === 'hello';
            const isWorld    = entry.file === 'world';
            const isFree     = entry.val === 'FREE';
            const isReserved = entry.val === 'Reserved';
            const isDone     = step.done && isActive;

            const borderCol = isDone    ? P.green
                            : isActive  ? P.teal
                            : isHello   ? P.teal + '55'
                            : isWorld   ? P.purple + '55'
                            : P.border;
            const fillCol   = isDone    ? P.green + '28'
                            : isActive  ? P.teal  + '28'
                            : isHello   ? P.teal  + '10'
                            : isWorld   ? P.purple+ '10'
                            : P.surf;
            const bW = isDone || isActive ? 2.5 : 1;

            rr(cx + 3, cy + 3, cellW - 6, cellH - 6, 5, fillCol, borderCol, bW);

            /* 클러스터 번호 */
            tx(String(entry.n),
               cx + cellW/2, cy + cellH * 0.30,
               fSm - 1, isActive || isDone ? P.text : P.muted, 'center', false);

            /* 값 */
            const valCol = isDone    ? P.green
                         : isActive  ? P.teal
                         : isFree    ? P.muted
                         : isReserved? P.muted
                         : entry.val === 'EOF' ? P.green
                         : P.text;

            const dispVal = isReserved ? 'Rsv' : entry.val;
            tx(dispVal,
               cx + cellW/2, cy + cellH * 0.65,
               isActive || isDone ? fSm + 1 : fSm, valCol, 'center', isActive || isDone);

            /* 파일 소유 표시 (우상단 작은 배지) */
            if (isHello && !isActive) {
                ctx.beginPath(); ctx.arc(cx + cellW - 10, cy + 10, 4, 0, Math.PI*2);
                ctx.fillStyle = P.teal + '88'; ctx.fill();
            }
            if (isWorld) {
                ctx.beginPath(); ctx.arc(cx + cellW - 10, cy + 10, 4, 0, Math.PI*2);
                ctx.fillStyle = P.purple + '88'; ctx.fill();
            }
        });

        /* 체인 화살표 */
        for (let i = 0; i < active.length - 1; i++) {
            drawChainArrow(active[i], active[i+1], cols, gridX, gridY, cellW, cellH);
        }

        /* 완료 배너 */
        /* 완료 배너 — 그리드 바로 아래 */
        const afterGridY = gridY + rows * cellH + botGap;
        if (step.done) {
            const bW = mob ? W - 28 : Math.min(W - 80, 440);
            const bX = Math.round((W - bW) / 2);
            rr(bX, afterGridY, bW, doneH, 6, P.green + '18', P.green, 2);
            tx('✓  hello.txt  체인:  클러스터 3 → 7 → 12 → EOF',
               bX + bW/2, afterGridY + doneH/2, fSm, P.green, 'center', true);
        }

        /* 범례 — 완료 배너 아래 */
        const legY  = afterGridY + doneH + botGap * 2;
        const items = [
            { col: P.teal,   lbl: 'hello.txt' },
            { col: P.purple, lbl: 'world.txt'  },
            { col: P.muted,  lbl: 'FREE / Rsv' },
        ];
        const step2 = Math.round((W - 20) / items.length);
        items.forEach(function (it, i) {
            const lx = 20 + i * step2;
            ctx.beginPath(); ctx.arc(lx + 6, legY, 5, 0, Math.PI*2);
            ctx.fillStyle = it.col; ctx.fill();
            tx(it.lbl, lx + 16, legY, fSm - 1, it.col + 'cc', 'left', false);
        });
    }

    /* FAT 체인 화살표 — 직선 수평/수직 */
    function drawChainArrow(from, to, cols, gridX, gridY, cellW, cellH) {
        const rows = 4;
        const fi = FAT_TABLE.findIndex(function (e) { return e.n === from; });
        const ti = FAT_TABLE.findIndex(function (e) { return e.n === to;   });
        if (fi < 0 || ti < 0) return;

        const fc = fi % cols, fr = Math.floor(fi / cols);
        const tc = ti % cols, tr = Math.floor(ti / cols);

        const fx = gridX + fc * cellW + cellW/2;
        const fy = gridY + fr * cellH + cellH/2;
        const tx_ = gridX + tc * cellW + cellW/2;
        const ty_ = gridY + tr * cellH + cellH/2;

        /* 같은 행: 수평 */
        if (fr === tr) {
            const dir = tc > fc ? 1 : -1;
            const x1  = gridX + fc * cellW + (dir > 0 ? cellW - 4 : 4);
            const x2  = gridX + tc * cellW + (dir > 0 ? 4 : cellW - 4);
            arrow(x1, fy, x2, ty_, P.teal, 2);
            return;
        }

        /* 다른 행: L자형 꺾인 화살표 */
        const x1 = gridX + fc * cellW + cellW/2;
        const y1 = gridY + fr * cellH + cellH - 4;
        const x2 = gridX + tc * cellW + cellW/2;
        const y2 = gridY + tr * cellH + 4;

        /* 중간 꺾임점: 오른쪽 끝으로 돌아서 다음 행으로 */
        const midX = Math.max(x1, x2) + 20;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1, fy + cellH/2 + 10);
        ctx.lineTo(x2, fy + cellH/2 + 10);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = P.teal;
        ctx.lineWidth   = 2;
        ctx.setLineDash([]);
        ctx.stroke();
        arrowH(x2, y2, 0, -1, P.teal, 6);
    }

    /* ===================== 단계 적용 ===================== */
    function currentSteps() {
        return modeIdx === 0 ? INODE_STEPS : FAT_STEPS;
    }

    function setModeBtnsDisabled(v) {
        root.querySelectorAll('.fs-viz__mode-btn').forEach(function (b) { b.disabled = v; });
    }
    function setSpeedDisabled(v) {
        root.querySelectorAll('.fs-viz__speed-btn').forEach(function (b) { b.disabled = v; });
    }

    function applyStep(idx, onDone) {
        stepIdx = idx;
        logEl.textContent = currentSteps()[idx].log;
        draw();
        if (onDone) setTimeout(onDone, 0);
    }

    /* ===================== 컨트롤 ===================== */
    function fsStart() {
        if (running) return;
        running = true; btnPlay.disabled = true; btnStep.disabled = true;
        setModeBtnsDisabled(true); setSpeedDisabled(true);

        function tick() {
            const steps = currentSteps();
            const next  = stepIdx + 1;
            if (next >= steps.length) { running = false; setSpeedDisabled(false); return; }
            applyStep(next, function () {
                if (next === steps.length - 1) {
                    running = false; btnStep.disabled = true; setSpeedDisabled(false);
                } else {
                    timer = setTimeout(tick, speed);
                }
            });
        }
        tick();
    }

    function fsStep() {
        if (running) return;
        const steps = currentSteps();
        const next  = stepIdx + 1;
        if (next >= steps.length) return;
        applyStep(next, null);
        if (next === steps.length - 1) { btnPlay.disabled = true; btnStep.disabled = true; }
    }

    function fsReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false; stepIdx = -1;
        logEl.textContent = '▶ PLAY를 눌러 파일 시스템 동작을 확인하세요.';
        btnPlay.disabled = false; btnStep.disabled = false;
        setModeBtnsDisabled(false); setSpeedDisabled(false);
        draw();
    }

    function setMode(idx, btn) {
        modeIdx = idx;
        root.querySelectorAll('.fs-viz__mode-btn').forEach(function (b) {
            b.classList.remove('fs-viz__mode-btn--active');
        });
        btn.classList.add('fs-viz__mode-btn--active');
        fsReset();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.fs-viz__speed-btn').forEach(function (b) {
            b.classList.remove('fs-viz__speed-btn--active');
        });
        btn.classList.add('fs-viz__speed-btn--active');
    }

    /* ===================== 라이프사이클 ===================== */
    window.CsFlow.createVizLifecycle({
        canvas, canvasWrap, resize, draw,
        getState : function () { return { rafId, timer, running }; },
        setState : function (s) { rafId = s.rafId; timer = s.timer; running = s.running; },
        onPause  : function () { setSpeedDisabled(false); },
        getMouseCtx: function () {
            return {
                GW, GH, mousePos, tooltipHits,
                hoveredKey   : function ()  { return hoveredKey; },
                setHoveredKey: function (k) { hoveredKey = k; },
                draw,
            };
        },
    });

    setTimeout(resize, 60);
})();