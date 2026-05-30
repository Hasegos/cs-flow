/**
 * 메모리 관리 시각화
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

    const root    = el('div', 'mem-viz');
    const toolbar = el('div', 'mem-viz__toolbar');
    const tbLeft  = el('div', 'mem-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'mem-viz__title', 'Memory Management'));
    const badge = el('span', 'mem-viz__step-badge', 'IDLE');
    tbLeft.appendChild(badge);
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'mem-viz__speed');
    speedWrap.appendChild(el('span', 'mem-viz__speed-label', 'SPEED'));
    [['1x', 1800], ['2x', 900], ['3x', 600]].forEach(function (pair, i) {
        const b = el('button', 'mem-viz__speed-btn' + (i === 0 ? ' mem-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'mem-viz__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'mem-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const logEl = el('div', 'mem-viz__log', '▶ PLAY를 눌러 메모리 할당과 단편화 과정을 확인하세요.');
    root.appendChild(logEl);

    const controls = el('div', 'mem-viz__controls');
    const btnPlay  = el('button', 'mem-viz__btn mem-viz__btn--primary', '▶ PLAY');
    const btnStep  = el('button', 'mem-viz__btn', '▶| STEP');
    const btnReset = el('button', 'mem-viz__btn', '↺ RESET');
    btnPlay.addEventListener('click',  memStart);
    btnStep.addEventListener('click',  memStep);
    btnReset.addEventListener('click', memReset);
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
        const w = canvasWrap.offsetWidth;
        const h = Math.max(canvasWrap.offsetHeight, w < 520 ? 500 : 460);
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    let P = window.CsFlow.getP();

    /* ===================== 상수 ===================== */
    const TOTAL_KB = 512;
    const FRAME_KB = 64;
    const N_FRAMES = TOTAL_KB / FRAME_KB;

    function procCol(id) {
        if (id === 'P1') return P.teal;
        if (id === 'P2') return P.purple;
        if (id === 'P3') return P.orange;
        if (id === 'P4') return P.green;
        return P.muted;
    }

    /* ===================== 시나리오 ===================== */
    const STEPS = [
        {
            badge: '초기 상태 — 연속 할당',
            log:   'Step 1 — 512KB의 빈 메모리입니다. 연속 할당(Contiguous Allocation)은 프로세스에 연속된 메모리 공간을 통째로 할당합니다. 단순하지만 단편화 문제가 잠재되어 있습니다.',
            mode:  'bar',
            segs:  [{ id: 'free', size: 512, type: 'free' }],
        },
        {
            badge: 'P1 할당 (128KB)',
            log:   'Step 2 — P1(128KB)이 메모리 앞쪽에 적재됩니다. 연속된 128KB가 P1에 할당되고 나머지 384KB가 여유 공간으로 남습니다.',
            mode:  'bar',
            segs:  [
                { id: 'P1',   size: 128, type: 'proc' },
                { id: 'free', size: 384, type: 'free' },
            ],
            anim: { type: 'alloc', newId: 'P1', freeId: 'free' },
        },
        {
            badge: 'P2 할당 (256KB)',
            log:   'Step 3 — P2(256KB) 추가 할당. P1 바로 뒤에 연속된 256KB를 할당합니다. 남은 여유 공간 128KB. 두 프로세스가 서로 인접해 있습니다.',
            mode:  'bar',
            segs:  [
                { id: 'P1',   size: 128, type: 'proc' },
                { id: 'P2',   size: 256, type: 'proc' },
                { id: 'free', size: 128, type: 'free' },
            ],
            anim: { type: 'alloc', newId: 'P2', freeId: 'free' },
        },
        {
            badge: 'P3 할당 (64KB)',
            log:   'Step 4 — P3(64KB) 추가 할당. 메모리: P1(128) + P2(256) + P3(64) + 여유(64KB). 메모리가 거의 가득 찼고 프로세스들이 연속되어 있습니다.',
            mode:  'bar',
            segs:  [
                { id: 'P1',   size: 128, type: 'proc' },
                { id: 'P2',   size: 256, type: 'proc' },
                { id: 'P3',   size: 64,  type: 'proc' },
                { id: 'free', size: 64,  type: 'free' },
            ],
            anim: { type: 'alloc', newId: 'P3', freeId: 'free' },
        },
        {
            badge: 'P2 종료 → 외부 단편화 ⚠',
            log:   'Step 5 — P2가 종료되어 256KB가 해제됩니다. P1과 P3 사이에 구멍(Hole)이 생깁니다! 외부 단편화(External Fragmentation) 발생: 총 여유 메모리 320KB지만 연속된 최대 공간은 256KB입니다.',
            mode:  'bar',
            segs:  [
                { id: 'P1',   size: 128, type: 'proc' },
                { id: 'hole', size: 256, type: 'hole' },
                { id: 'P3',   size: 64,  type: 'proc' },
                { id: 'free', size: 64,  type: 'free' },
            ],
            showFrag: true,
        },
        {
            badge: 'P4 요청(320KB) → 실패! ⚠',
            log:   'Step 6 — P4가 320KB를 요청합니다. 총 여유 메모리 320KB로 딱 맞지만, 연속된 최대 공간은 256KB뿐입니다. 외부 단편화로 인해 P4 할당 실패! 압축(Compaction)은 모든 프로세스를 이동시켜야 해 비용이 매우 큽니다.',
            mode:  'bar',
            segs:  [
                { id: 'P1',   size: 128, type: 'proc' },
                { id: 'hole', size: 256, type: 'hole' },
                { id: 'P3',   size: 64,  type: 'proc' },
                { id: 'free', size: 64,  type: 'free' },
            ],
            showFrag: true,
            showFail: true,
        },
        {
            badge: '페이징으로 해결 ✓',
            log:   'Step 7 — 페이징(Paging) 적용! 물리 메모리를 64KB 프레임 8개로 분할하고, P4(320KB)도 64KB 페이지 5개로 분할합니다. P4의 5개 페이지를 빈 프레임(F2~F5, F7)에 비연속적으로 배치합니다. 외부 단편화 완전 해결 ✓',
            mode:  'paging',
            frames: [
                { n: 0, owner: 'P1', page: 0 },
                { n: 1, owner: 'P1', page: 1 },
                { n: 2, owner: 'P4', page: 0 },
                { n: 3, owner: 'P4', page: 1 },
                { n: 4, owner: 'P4', page: 2 },
                { n: 5, owner: 'P4', page: 3 },
                { n: 6, owner: 'P3', page: 0 },
                { n: 7, owner: 'P4', page: 4 },
            ],
            pagingOk: true,
        },
    ];

    /* ===================== 상태 변수 ===================== */
    let stepIdx  = -1;
    let running  = false;
    let timer    = null;
    let rafId    = null;
    let speed    = 1800;
    let animProg = 0;
    let animCb   = null;

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

    /* ===================== 레이아웃 ===================== */
    function buildLayout() {
        const W = GW(), H = GH();
        const mob = W < 520;
        const fMd = mob ? 12 : 14;
        const fSm = mob ? 10 : 12;

        const pad  = mob ? 14 : 28;
        const barX = pad;
        const barW = W - pad * 2;
        const barH = mob ? 64 : 90;
        const barY = mob ? 32 : Math.round(H * 0.13);

        const scaleH  = mob ? 26 : 30;
        const statsY  = barY + barH + scaleH + (mob ? 10 : 14);
        const infoY   = statsY + (mob ? 66 : 76);

        const gridCols = 4, gridRows = 2;
        const gridPad  = mob ? 6 : 10;
        const cellW    = mob ? Math.round((W - pad*2 - gridPad*(gridCols+1)) / gridCols)
                              : Math.round((W * 0.56 - gridPad*(gridCols+1)) / gridCols);
        const cellH    = mob ? 70 : 84;
        const gridW    = cellW * gridCols + gridPad * (gridCols + 1);
        const gridX    = pad;
        const gridY    = mob ? 32 : Math.round(H * 0.10);

        const tableX = mob ? pad : gridX + gridW + (mob ? 0 : 24);
        const tableW = mob ? barW : W - tableX - pad;
        const tableY = mob ? gridY + gridRows*(cellH+gridPad) + gridPad + 20 : gridY;

        return {
            W, H, mob, fMd, fSm,
            pad, barX, barW, barH, barY, scaleH, statsY, infoY,
            gridCols, gridRows, gridPad, cellW, cellH, gridW, gridX, gridY,
            tableX, tableW, tableY,
        };
    }

    /* ===================== 메모리 바 그리기 ===================== */
    function drawMemBar(L, step) {
        const { barX, barW, barH, barY, fMd, fSm, mob } = L;
        const segs = step.segs;
        const anim = step.anim;

        const widths = segs.map(function (s) {
            return s.size / TOTAL_KB * barW;
        });

        if (anim && anim.type === 'alloc' && animProg < 1) {
            const ni = segs.findIndex(function (s) { return s.id === anim.newId; });
            const fi = segs.findIndex(function (s) { return s.id === anim.freeId; });
            if (ni >= 0 && fi >= 0) {
                const fullW = widths[ni];
                widths[ni]   = fullW * animProg;
                widths[fi]  += fullW * (1 - animProg);
            }
        }

        let curX = barX;
        segs.forEach(function (seg, i) {
            const w = widths[i];
            if (w < 0.5) { curX += w; return; }

            if (seg.type === 'proc') {
                const col = procCol(seg.id);
                rr(curX, barY, w, barH, 4, col + '30', col, 2.5);
                if (w > (mob ? 28 : 44)) {
                    tx(seg.id,            curX + w/2, barY + barH*0.36, fMd,     col,       'center', true);
                    tx(seg.size + 'KB',   curX + w/2, barY + barH*0.65, fSm - 1, col+'cc',  'center', false);
                }
            } else if (seg.type === 'hole') {
                rr(curX, barY, w, barH, 4, P.red + '14', P.red, 2.5);
                ctx.save();
                ctx.beginPath();
                ctx.rect(curX + 1, barY + 1, w - 2, barH - 2);
                ctx.clip();
                ctx.strokeStyle = P.red + '28';
                ctx.lineWidth   = 1.5;
                for (let sx = curX - barH; sx < curX + w + barH; sx += 14) {
                    ctx.beginPath();
                    ctx.moveTo(sx, barY);
                    ctx.lineTo(sx + barH, barY + barH);
                    ctx.stroke();
                }
                ctx.restore();
                if (w > (mob ? 36 : 56)) {
                    tx('HOLE',            curX + w/2, barY + barH*0.36, fMd,     P.red,      'center', true);
                    tx(seg.size + 'KB',   curX + w/2, barY + barH*0.65, fSm - 1, P.red+'cc', 'center', false);
                }
            } else {
                rr(curX, barY, w, barH, 4, P.surf2, P.border, 1);
                if (w > (mob ? 24 : 40)) {
                    tx('FREE',           curX + w/2, barY + barH*0.36, mob ? fSm-1 : fSm, P.muted, 'center', false);
                    tx(seg.size + 'KB',  curX + w/2, barY + barH*0.65, mob ? fSm-2 : fSm-1, P.muted, 'center', false);
                }
            }

            curX += w;
        });

        drawScale(L);
    }

    function drawScale(L) {
        const { barX, barW, barY, barH, fSm, mob } = L;
        const ry = barY + barH + 6;
        [0, 128, 256, 384, 512].forEach(function (kb) {
            const x = barX + kb / TOTAL_KB * barW;
            ctx.beginPath(); ctx.moveTo(x, ry); ctx.lineTo(x, ry + 4);
            ctx.strokeStyle = P.border; ctx.lineWidth = 1; ctx.stroke();
            tx(kb + 'K', x, ry + 11, mob ? 9 : 10, P.muted, 'center', false);
        });
    }

    /* ===================== 단편화 통계 패널 ===================== */
    function drawFragPanel(L, step) {
        const { W, statsY, mob, fMd, fSm, barW, barX } = L;

        if (!step.showFrag) {
            const free = step.segs.reduce(function (s, sg) {
                return sg.type !== 'proc' ? s + sg.size : s;
            }, 0);
            tx('여유 공간: ' + free + 'KB', W / 2, statsY + (mob ? 10 : 12), fSm, P.muted, 'center', false);
            return;
        }

        const totalFree = step.segs.reduce(function (s, sg) {
            return sg.type !== 'proc' ? s + sg.size : s;
        }, 0);
        const maxContig = step.segs.reduce(function (mx, sg) {
            return (sg.type === 'hole' || sg.type === 'free') && sg.size > mx ? sg.size : mx;
        }, 0);

        const bW = mob ? W - 28 : Math.min(barW, 500);
        const bH = mob ? 58 : 64;
        const bX = Math.round((W - bW) / 2);

        rr(bX, statsY, bW, bH, 6, P.red + '12', P.red + '88', 1.5);
        tx('⚠ 외부 단편화', bX + bW/2, statsY + bH*0.28, fSm, P.red, 'center', true);

        const half = bW / 2;
        tx('총 여유 메모리', bX + half*0.5, statsY + bH*0.62, fSm - 1, P.muted, 'center', false);
        tx(totalFree + 'KB', bX + half*0.5, statsY + bH*0.82, fSm, P.orange, 'center', true);

        tx('최대 연속 공간', bX + half + half*0.5, statsY + bH*0.62, fSm - 1, P.muted, 'center', false);
        tx(maxContig + 'KB !!', bX + half + half*0.5, statsY + bH*0.82, fSm, P.red, 'center', true);

        ctx.beginPath();
        ctx.moveTo(bX + half, statsY + bH * 0.45);
        ctx.lineTo(bX + half, statsY + bH * 0.95);
        ctx.strokeStyle = P.red + '44'; ctx.lineWidth = 1; ctx.stroke();
    }

    /* ===================== P4 실패 비교 패널 ===================== */
    function drawFailPanel(L, step) {
        const { W, infoY, mob, fMd, fSm } = L;

        const bW   = mob ? W - 28 : Math.min(500, W - 56);
        const bH   = mob ? 90 : 100;
        const bX   = Math.round((W - bW) / 2);
        const gap  = mob ? 10 : 14;
        const colW = Math.round((bW - gap * 3) / 2);

        rr(bX, infoY, bW, bH, 8, P.surf, P.border, 1);

        rr(bX + gap, infoY + gap, colW, bH - gap*2, 6, P.green + '20', P.green, 2);
        tx('P4 필요',        bX + gap + colW/2, infoY + gap + (bH-gap*2)*0.26, fSm,     P.green, 'center', true);
        tx('320KB',          bX + gap + colW/2, infoY + gap + (bH-gap*2)*0.53, fMd + 2, P.green, 'center', true);
        tx('5 프레임',       bX + gap + colW/2, infoY + gap + (bH-gap*2)*0.78, fSm - 1, P.green + 'cc', 'center', false);

        rr(bX + gap*2 + colW, infoY + gap, colW, bH - gap*2, 6, P.red + '20', P.red, 2);
        tx('최대 연속 공간', bX + gap*2 + colW + colW/2, infoY + gap + (bH-gap*2)*0.26, fSm,     P.red, 'center', true);
        tx('256KB',          bX + gap*2 + colW + colW/2, infoY + gap + (bH-gap*2)*0.53, fMd + 2, P.red, 'center', true);
        tx('4 프레임만',     bX + gap*2 + colW + colW/2, infoY + gap + (bH-gap*2)*0.78, fSm - 1, P.red + 'cc', 'center', false);

        tx('>', bX + bW/2, infoY + bH/2, mob ? 22 : 28, P.red, 'center', true);

        tx('320KB > 256KB → 할당 불가!',
           W/2, infoY + bH + (mob ? 14 : 18), fSm, P.red, 'center', true);
    }

    /* ===================== 페이징 그리드 ===================== */
    function drawPagingGrid(L, step) {
        const { W, H, mob, fMd, fSm,
                gridCols, gridRows, gridPad, cellW, cellH,
                gridX, gridY, gridW,
                tableX, tableW, tableY } = L;

        const frames = step.frames;

        tx('물리 메모리  (8 × 64KB 프레임)',
           gridX + gridW/2, gridY - (mob ? 14 : 18),
           fSm, P.sub, 'center', false);

        frames.forEach(function (fr, i) {
            const row = Math.floor(i / gridCols);
            const col = i % gridCols;
            const cx  = gridX + gridPad + col * (cellW + gridPad);
            const cy  = gridY + gridPad + row * (cellH + gridPad);
            const col_ = procCol(fr.owner);
            const isP4 = fr.owner === 'P4';

            rr(cx, cy, cellW, cellH, 6,
               col_ + (isP4 ? '2a' : '1a'),
               col_, isP4 ? 2.5 : 2);

            tx('F' + fr.n,    cx + cellW/2, cy + cellH*0.24, mob ? fSm   : fSm + 2, P.muted,    'center', false);
            tx(fr.owner,      cx + cellW/2, cy + cellH*0.52, mob ? fMd+1 : fMd + 4, col_,       'center', true);
            tx('p' + fr.page, cx + cellW/2, cy + cellH*0.78, mob ? fSm   : fSm + 1, col_+'aa',  'center', false);
        });

        const p4Frames = frames.filter(function (f) { return f.owner === 'P4'; });
        const rowH = mob ? 22 : 26;

        tx('P4 페이지 테이블', tableX + tableW/2, tableY - (mob ? 12 : 16), fSm, P.green, 'center', true);

        const tH  = rowH * (p4Frames.length + 1) + 12;
        rr(tableX, tableY, tableW, tH, 4, P.surf, P.border, 1);

        tx('페이지', tableX + tableW * 0.22, tableY + rowH/2 + 2, fSm, P.muted, 'center', true);
        tx('프레임',  tableX + tableW * 0.78, tableY + rowH/2 + 2, fSm, P.muted, 'center', true);
        ctx.beginPath();
        ctx.moveTo(tableX + 10, tableY + rowH + 1);
        ctx.lineTo(tableX + tableW - 10, tableY + rowH + 1);
        ctx.strokeStyle = P.border; ctx.lineWidth = 1; ctx.stroke();

        p4Frames.forEach(function (fr, i) {
            const ry = tableY + rowH * (i + 1) + 4 + i * 2;
            tx('p' + fr.page,  tableX + tableW * 0.22, ry + rowH/2, fSm + 1, P.green,  'center', false);
            tx('→',            tableX + tableW * 0.50, ry + rowH/2, fSm,     P.muted,  'center', false);
            tx('F' + fr.n,     tableX + tableW * 0.78, ry + rowH/2, fSm + 1, P.green,  'center', true);
        });

        if (step.pagingOk) {
            const bY = mob
                ? tableY + tH + 12
                : gridY + gridRows*(cellH+gridPad) + gridPad + 14;
            const bW  = mob ? W - 28 : gridW;
            const bX  = mob ? 14 : gridX;
            rr(bX, bY, bW, mob ? 36 : 42, 6, P.green + '18', P.green, 2);
            tx('✓ 비연속 할당 성공 — 외부 단편화 해결',
               bX + bW/2, bY + (mob ? 18 : 21), fSm, P.green, 'center', true);
        }
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        ctx.fillStyle = P.bg;
        ctx.fillRect(0, 0, GW(), GH());
        tooltipHits = [];

        const L    = buildLayout();
        const step = stepIdx >= 0 ? STEPS[stepIdx] : STEPS[0];

        if (step.mode === 'bar') {
            drawMemBar(L, step);
            drawFragPanel(L, step);
            if (step.showFail) drawFailPanel(L, step);
        } else {
            drawPagingGrid(L, step);
        }

        if (hoveredKey) drawTooltip(L);
    }

    /* ===================== 툴팁 ===================== */
    const TIPS = {
        P1: 'Process 1 (128KB)\n메모리 앞쪽 2 프레임(F0·F1)을 점유합니다.',
        P2: 'Process 2 (256KB)\n종료 후 4 프레임이 HOLE(구멍)이 됩니다.',
        P3: 'Process 3 (64KB)\n1 프레임(F6)을 점유합니다.',
        P4: 'Process 4 (320KB)\n연속 할당에서는 실패하지만, 페이징으로 5개 프레임에 분산 배치되어 성공합니다.',
        HOLE: '외부 단편화 구멍 (256KB)\n총 여유 공간에는 포함되지만 연속 공간이 필요한 프로세스는 이 공간을 활용하지 못합니다.',
        FREE: '여유 공간 (64KB)\n아직 할당되지 않은 연속 메모리 영역입니다.',
    };

    function drawTooltip(L) {
        if (!hoveredKey || !TIPS[hoveredKey]) return;
        const parts = TIPS[hoveredKey].split('\n');
        const title = parts[0], desc = parts[1] || '';
        const W = GW(), H = GH();
        const pad = 14;
        const maxTW = Math.min(W - 24, W < 520 ? W * 0.85 : 300);
        const innerW = maxTW - pad * 2;
        const tFont = '700 13px "JetBrains Mono",monospace';
        const dFont = '400 12px "JetBrains Mono",monospace';
        ctx.font = tFont;
        const tW2 = ctx.measureText(title).width;
        ctx.font = dFont;
        const words = desc.split(' ');
        const lines = [];
        let cur = '';
        words.forEach(function (w) {
            const t = cur ? cur + ' ' + w : w;
            if (ctx.measureText(t).width > innerW && cur) { lines.push(cur); cur = w; }
            else cur = t;
        });
        if (cur) lines.push(cur);
        const lineH = 17, titleH = 24;
        const th = desc ? titleH + lines.length * lineH + 10 : 36;
        const tw = Math.min(Math.max(tW2, innerW) + pad * 2, maxTW);
        let bx = mousePos.x + 14, by = mousePos.y - th - 8;
        if (bx + tw > W - 8) bx = mousePos.x - tw - 14;
        if (bx < 8)          bx = 8;
        if (by < 8)          by = mousePos.y + 14;
        if (by + th > H - 8) by = H - th - 8;
        rr(bx, by, tw, th, 6, P.surf2, P.purple + 'cc', 2);
        ctx.font = tFont; ctx.fillStyle = P.text;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(title, bx + pad, by + (desc ? 14 : th / 2));
        if (lines.length) {
            ctx.font = dFont; ctx.fillStyle = P.sub;
            lines.forEach(function (l, i) {
                ctx.fillText(l, bx + pad, by + titleH + i * lineH + 4);
            });
        }
    }

    /* ===================== 애니메이션 ===================== */
    function runAnim(cb) {
        animProg = 0;
        animCb   = cb || null;
        if (rafId) cancelAnimationFrame(rafId);
        const BASE = 1800, baseStep = 0.007;
        const s = baseStep * (BASE / speed);
        (function tick() {
            animProg = Math.min(1, animProg + s);
            draw();
            if (animProg < 1) { rafId = requestAnimationFrame(tick); }
            else {
                animProg = 1;
                draw();
                if (animCb) { var fn = animCb; animCb = null; fn(); }
            }
        })();
    }

    /* ===================== 단계 적용 ===================== */
    function setBadge(s) {
        badge.textContent = s;
        badge.className = 'mem-viz__step-badge' + (s !== 'IDLE' ? ' mem-viz__step-badge--active' : '');
    }
    function setSpeedDisabled(v) {
        root.querySelectorAll('.mem-viz__speed-btn').forEach(function (b) { b.disabled = v; });
    }

    function applyStep(idx, onDone) {
        stepIdx  = idx;
        animProg = 1;
        const step = STEPS[idx];
        setBadge(step.badge);
        logEl.textContent = step.log;

        if (step.anim && step.anim.type === 'alloc') {
            runAnim(function () {
                draw();
                if (onDone) setTimeout(onDone, 0);
            });
        } else {
            draw();
            if (onDone) setTimeout(onDone, 0);
        }
    }

    /* ===================== 컨트롤 ===================== */
    function memStart() {
        if (running) return;
        running = true; btnPlay.disabled = true; btnStep.disabled = true;
        setSpeedDisabled(true);

        function tick() {
            const next = stepIdx + 1;
            if (next >= STEPS.length) { running = false; setSpeedDisabled(false); return; }
            applyStep(next, function () {
                if (next === STEPS.length - 1) {
                    running = false; btnStep.disabled = true; setSpeedDisabled(false);
                } else {
                    timer = setTimeout(tick, speed);
                }
            });
        }
        tick();
    }

    function memStep() {
        if (running || animProg < 1) return;
        const next = stepIdx + 1;
        if (next >= STEPS.length) return;
        applyStep(next, null);
        if (next === STEPS.length - 1) { btnPlay.disabled = true; btnStep.disabled = true; }
    }

    function memReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false; stepIdx = -1; animProg = 1; animCb = null;
        logEl.textContent = '▶ PLAY를 눌러 메모리 할당과 단편화 과정을 확인하세요.';
        setBadge('IDLE');
        btnPlay.disabled = false; btnStep.disabled = false;
        setSpeedDisabled(false);
        draw();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.mem-viz__speed-btn').forEach(function (b) {
            b.classList.remove('mem-viz__speed-btn--active');
        });
        btn.classList.add('mem-viz__speed-btn--active');
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