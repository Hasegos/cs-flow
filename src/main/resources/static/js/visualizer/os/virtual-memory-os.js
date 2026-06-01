/**
 * 가상 메모리 — 페이지 교체 알고리즘 시각화
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

    const root    = el('div', 'vmos-viz');
    const toolbar = el('div', 'vmos-viz__toolbar');
    const tbLeft  = el('div', 'vmos-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'vmos-viz__title', 'Page Replacement'));

    /* 알고리즘 탭 */
    const algoHint = el('span', 'vmos-viz__algo-hint', '알고리즘 →');
    const algoTabs = el('div', 'vmos-viz__algo-tabs');
    ['FIFO', 'LRU', 'Optimal'].forEach(function (lbl, i) {
        const b = el('button', 'vmos-viz__algo-btn' + (i === 0 ? ' vmos-viz__algo-btn--active' : ''), lbl);
        b.addEventListener('click', function () { if (!running) setAlgo(i, b); });
        algoTabs.appendChild(b);
    });
    tbLeft.appendChild(algoHint);
    tbLeft.appendChild(algoTabs);
    toolbar.appendChild(tbLeft);

    const speedWrap = el('div', 'vmos-viz__speed');
    speedWrap.appendChild(el('span', 'vmos-viz__speed-label', 'SPEED'));
    [['1x', 1800], ['2x', 900], ['3x', 600]].forEach(function (pair, i) {
        const b = el('button', 'vmos-viz__speed-btn' + (i === 0 ? ' vmos-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    const canvasWrap = el('div', 'vmos-viz__canvas-wrap');
    const canvas     = document.createElement('canvas');
    canvas.className = 'vmos-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    const logEl = el('div', 'vmos-viz__log', '▶ PLAY를 눌러 페이지 교체 과정을 확인하세요. 알고리즘을 바꿔서 비교해 보세요.');
    root.appendChild(logEl);

    const controls = el('div', 'vmos-viz__controls');
    const btnPlay  = el('button', 'vmos-viz__btn vmos-viz__btn--primary', '▶ PLAY');
    const btnStep  = el('button', 'vmos-viz__btn', '▶| STEP');
    const btnReset = el('button', 'vmos-viz__btn', '↺ RESET');
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
    const GW  = function () { return canvas.width  / dpr; };
    const GH  = function () { return canvas.height / dpr; };

    function calcMobMinH() {
        const refY    = 22, refH = 42;
        const frameH  = 80;
        const vGap1   = 24, vGap2 = 20;
        const histH   = 28, histGap = 14;
        const cntH    = 44, cntGap = 14;
        const cmpH    = 52, cmpGap = 54;
        const botPad  = 28;
        return refY + refH + vGap1 + frameH + vGap2 + histH + histGap + cntH + cntGap + cmpH + cmpGap + botPad;
    }

    function resize() {
        const w = canvasWrap.offsetWidth;
        const mob = w < 520;
        const minH = mob ? calcMobMinH() : 440;
        const h = Math.max(canvasWrap.offsetHeight, minH);
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        if (mob) canvasWrap.style.minHeight = minH + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    let P = window.CsFlow.getP();

    /* ===================== 상수 ===================== */
    const REF   = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2];
    const N_FRAMES = 3;

    const PAGE_COLS = [P.teal, P.purple, P.orange, P.green, P.yellow, P.red, '#e879f9', '#38bdf8'];
    function pageCol(pg) {
        return PAGE_COLS[pg % PAGE_COLS.length];
    }

    /* ===================== 알고리즘 계산 ===================== */
    function computeFIFO(refs, n) {
        const results = [];
        let frames = new Array(n).fill(-1);
        let pointer = 0;

        refs.forEach(function (pg, i) {
            const hit    = frames.indexOf(pg) !== -1;
            const victim = hit ? -1 : frames[pointer];
            if (!hit) {
                frames[pointer] = pg;
                pointer = (pointer + 1) % n;
            }
            results.push({
                page:   pg,
                frames: frames.slice(),
                hit:    hit,
                victim: victim,
                victimSlot: hit ? -1 : (pointer - 1 + n) % n,
            });
        });
        return results;
    }

    function computeLRU(refs, n) {
        const results = [];
        let frames = new Array(n).fill(-1);
        let lastUsed = new Array(n).fill(-1);

        refs.forEach(function (pg, i) {
            const slot = frames.indexOf(pg);
            const hit  = slot !== -1;
            let victim = -1, victimSlot = -1;

            if (hit) {
                lastUsed[slot] = i;
            } else {
                const emptySlot = frames.indexOf(-1);
                if (emptySlot !== -1) {
                    victimSlot = emptySlot;
                } else {
                    victimSlot = lastUsed.indexOf(Math.min.apply(null, lastUsed));
                }
                victim = frames[victimSlot];
                frames[victimSlot]   = pg;
                lastUsed[victimSlot] = i;
            }

            results.push({
                page:   pg,
                frames: frames.slice(),
                lastUsed: lastUsed.slice(),
                hit:    hit,
                victim: victim,
                victimSlot,
            });
        });
        return results;
    }

    function computeOptimal(refs, n) {
        const results = [];
        let frames = new Array(n).fill(-1);

        refs.forEach(function (pg, i) {
            const slot = frames.indexOf(pg);
            const hit  = slot !== -1;
            let victim = -1, victimSlot = -1;

            if (hit) {
            } else {
                const emptySlot = frames.indexOf(-1);
                if (emptySlot !== -1) {
                    victimSlot = emptySlot;
                } else {
                    let farthest = -1;
                    frames.forEach(function (fp, fi) {
                        const nextUse = refs.slice(i + 1).indexOf(fp);
                        const dist    = nextUse === -1 ? Infinity : nextUse;
                        if (dist > farthest) { farthest = dist; victimSlot = fi; }
                    });
                }
                victim = frames[victimSlot];
                frames[victimSlot] = pg;
            }

            results.push({
                page:   pg,
                frames: frames.slice(),
                hit:    hit,
                victim: victim,
                victimSlot,
            });
        });
        return results;
    }

    const ALGOS = [
        { name: 'FIFO',    fn: computeFIFO,    desc: 'First-In, First-Out — 가장 먼저 들어온 페이지 교체' },
        { name: 'LRU',     fn: computeLRU,     desc: 'Least Recently Used — 가장 오래 미사용 페이지 교체' },
        { name: 'Optimal', fn: computeOptimal, desc: 'Optimal — 앞으로 가장 늦게 사용될 페이지 교체 (이론적 최적)' },
    ];

    /* ===================== 상태 변수 ===================== */
    let algoIdx = 0;
    let stepIdx = -1;
    let running = false;
    let timer   = null;
    let rafId   = null;
    let speed   = 1800;

    let results = computeFIFO(REF, N_FRAMES);

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
        const fMd = mob ? 13 : 15;
        const fSm = mob ? 11 : 12;
        const fLg = mob ? 20 : 26;
        const pad = mob ? 12 : 24;

        const refH    = mob ? 42 : 52;
        const refY    = mob ? 22 : 28;
        const cellW   = Math.min(mob ? 30 : 38, Math.floor((W - pad * 2) / REF.length));
        const refX    = Math.round((W - cellW * REF.length) / 2);

        const frameW  = mob ? Math.round((W - pad * 2 - 20) / 3) : Math.round(Math.min(140, (W - pad * 2 - 40) / 3));
        const frameH  = mob ? 80 : 100;
        const frameGap = mob ? 10 : 20;
        const framesW = frameW * 3 + frameGap * 2;
        const framesX = Math.round((W - framesW) / 2);
        const framesY = refY + refH + (mob ? 24 : 32);

        const histY   = framesY + frameH + (mob ? 20 : 28);
        const histH   = mob ? 28 : 34;
        const histX   = refX;
        const histCW  = cellW;

        const cntY    = histY + histH + (mob ? 14 : 18);

        return { W, H, mob, fMd, fSm, fLg, pad,
                 refH, refY, cellW, refX,
                 frameW, frameH, frameGap, framesX, framesY,
                 histY, histH, histX, histCW, cntY };
    }

    /* ===================== 참조열 타임라인 ===================== */
    function drawRefString(L) {
        const { refX, refY, refH, cellW, fMd, fSm, mob } = L;

        tx(ALGOS[algoIdx].name + '  |  참조열 ' + REF.length + '개  프레임 ' + N_FRAMES + '개',
           GW() / 2, refY - (mob ? 10 : 13), fSm, P.muted, 'center', false);

        REF.forEach(function (pg, i) {
            const cx  = refX + i * cellW + cellW / 2;
            const cy  = refY + refH / 2;
            const col = pageCol(pg);
            const isCur = (i === stepIdx);
            const isPast = (i < stepIdx);

            rr(refX + i * cellW + 2, refY + 2, cellW - 4, refH - 4, 4,
               isCur  ? col + '30' :
               isPast ? col + '18' : P.surf,
               isCur  ? col :
               isPast ? col + '66' : P.border,
               isCur  ? 2.5 : 1);

            tx(String(pg), cx, cy, isCur ? fMd + 1 : fSm + 1, isCur ? col : isPast ? col + 'cc' : P.muted, 'center', true);

            if (isCur) {
                const ty = refY + refH + 5;
                ctx.beginPath();
                ctx.moveTo(cx - 5, ty);
                ctx.lineTo(cx + 5, ty);
                ctx.lineTo(cx, ty + 6);
                ctx.closePath();
                ctx.fillStyle = col; ctx.fill();
            }
        });
    }

    /* ===================== 프레임 박스 ===================== */
    function drawFrames(L) {
        const { framesX, framesY, frameW, frameH, frameGap, fMd, fSm, fLg, mob } = L;
        const cur = stepIdx >= 0 ? results[stepIdx] : null;
        const frames = cur ? cur.frames : new Array(N_FRAMES).fill(-1);

        for (let f = 0; f < N_FRAMES; f++) {
            const fx  = framesX + f * (frameW + frameGap);
            const pg  = frames[f];
            const col = pg >= 0 ? pageCol(pg) : P.muted;

            const isVictim = cur && !cur.hit && cur.victimSlot === f;
            const isNew    = cur && !cur.hit && cur.frames[f] === cur.page && cur.victimSlot === f;
            const borderCol = isVictim ? P.red : (cur && cur.hit && frames[f] === cur.page ? P.green : col);
            const borderW   = (isVictim || (cur && cur.hit && frames[f] === cur.page)) ? 3 : 1.5;

            rr(fx, framesY, frameW, frameH, 8,
               pg >= 0 ? col + '1a' : P.surf,
               borderCol, borderW);

            tx('F' + f, fx + frameW / 2, framesY + frameH * 0.14, fSm - 1, P.muted, 'center', false);

            ctx.beginPath();
            ctx.moveTo(fx + 10, framesY + frameH * 0.28);
            ctx.lineTo(fx + frameW - 10, framesY + frameH * 0.28);
            ctx.strokeStyle = P.border; ctx.lineWidth = 1; ctx.stroke();

            if (pg >= 0) {
                tx(String(pg), fx + frameW / 2, framesY + frameH * 0.58, fLg, col, 'center', true);
            } else {
                tx('—', fx + frameW / 2, framesY + frameH * 0.58, fMd, P.muted, 'center', false);
            }

            if (isVictim && cur.victim >= 0) {
                rr(fx + frameW / 2 - 22, framesY - 22, 44, 18, 4, P.red + '22', P.red, 1.5);
                tx('교체', fx + frameW / 2, framesY - 13, fSm - 1, P.red, 'center', true);
            }

            if (cur && cur.hit && frames[f] === cur.page) {
                rr(fx + frameW / 2 - 16, framesY - 22, 32, 18, 4, P.green + '22', P.green, 1.5);
                tx('HIT', fx + frameW / 2, framesY - 13, fSm - 1, P.green, 'center', true);
            }
        }

        if (algoIdx === 2 && stepIdx >= 0 && !results[stepIdx].hit) {
            drawOptimalHints(L, frames);
        }
        if (algoIdx === 1 && stepIdx >= 0) {
            drawLRUHints(L, frames);
        }
    }

    function drawOptimalHints(L, frames) {
        const { framesX, framesY, frameW, frameH, frameGap, fSm } = L;
        const futureRefs = REF.slice(stepIdx + 1);

        frames.forEach(function (pg, f) {
            if (pg < 0) return;
            const fx      = framesX + f * (frameW + frameGap);
            const nextUse = futureRefs.indexOf(pg);
            const label   = nextUse === -1 ? '∞ 안씀' : 'next:' + (stepIdx + 1 + nextUse);
            tx(label, fx + frameW / 2, framesY + frameH + 14, fSm + 1, P.yellow, 'center', true);
        });
    }

    /* ===================== LRU 힌트: 마지막 사용 시각 ===================== */
    function drawLRUHints(L, frames) {
        const { framesX, framesY, frameW, frameH, frameGap, fSm } = L;
        if (!results[stepIdx] || !results[stepIdx].lastUsed) return;
        const lastUsed = results[stepIdx].lastUsed;

        frames.forEach(function (pg, f) {
            if (pg < 0) return;
            const fx    = framesX + f * (frameW + frameGap);
            const col   = pageCol(pg);
            const label = 't=' + lastUsed[f];
            tx(label, fx + frameW / 2, framesY + frameH + 14, fSm + 1, P.yellow, 'center', true);
        });
    }

    /* ===================== Hit/Fault 히스토리 바 ===================== */
    function drawHistory(L) {
        const { histX, histY, histH, histCW, fSm, mob } = L;

        for (let i = 0; i <= stepIdx && i < results.length; i++) {
            const r   = results[i];
            const cx  = histX + i * histCW + histCW / 2;
            const isCur = i === stepIdx;
            const col = r.hit ? P.green : P.red;

            rr(histX + i * histCW + 2, histY + 2, histCW - 4, histH - 4, 3,
               col + (isCur ? '30' : '18'),
               col + (isCur ? 'ff' : '66'),
               isCur ? 2 : 1);

            if (histCW > 22) {
                tx(r.hit ? 'H' : 'F', cx, histY + histH / 2, mob ? 9 : 10, col, 'center', true);
            }
        }

        for (let i = stepIdx + 1; i < REF.length; i++) {
            rr(histX + i * histCW + 2, histY + 2, histCW - 4, histH - 4, 3, P.surf, P.border, 1);
        }
    }

    /* ===================== 카운터 ===================== */
    function drawCounter(L) {
        const { W, cntY, mob, fMd, fSm } = L;
        const done = stepIdx + 1;
        let hits = 0, faults = 0;
        for (let i = 0; i < done; i++) {
            if (results[i].hit) hits++; else faults++;
        }

        const total = done;
        const hitRate = total > 0 ? Math.round(hits / total * 100) : 0;

        const bW = mob ? GW() - 24 : 320;
        const bH = mob ? 44 : 50;
        const bX = Math.round((W - bW) / 2);

        rr(bX, cntY, bW, bH, 6, P.surf, P.border, 1);

        const third = bW / 3;
        tx('HIT', bX + third * 0.5, cntY + bH * 0.30, fSm - 1, P.green, 'center', false);
        tx(String(hits), bX + third * 0.5, cntY + bH * 0.68, fMd + 2, P.green, 'center', true);
        tx('FAULT', bX + third * 1.5, cntY + bH * 0.30, fSm - 1, P.red, 'center', false);
        tx(String(faults), bX + third * 1.5, cntY + bH * 0.68, fMd + 2, P.red, 'center', true);
        tx('HIT RATE', bX + third * 2.5, cntY + bH * 0.30, fSm - 1, P.purple, 'center', false);
        tx(hitRate + '%', bX + third * 2.5, cntY + bH * 0.68, fMd + 2, P.purple, 'center', true);

        [1, 2].forEach(function (d) {
            ctx.beginPath();
            ctx.moveTo(bX + third * d, cntY + 6);
            ctx.lineTo(bX + third * d, cntY + bH - 6);
            ctx.strokeStyle = P.border; ctx.lineWidth = 1; ctx.stroke();
        });

        if (stepIdx >= REF.length - 1) {
            drawCompareSummary(L, faults);
        }
    }

    /* ===================== 완료 시 비교 요약 ===================== */
    function drawCompareSummary(L, myFaults) {
        const { W, mob, fSm, fMd, cntY } = L;
        const fifoF  = computeFIFO(REF, N_FRAMES).filter(function (r) { return !r.hit; }).length;
        const lruF   = computeLRU(REF, N_FRAMES).filter(function (r) { return !r.hit; }).length;
        const optF   = computeOptimal(REF, N_FRAMES).filter(function (r) { return !r.hit; }).length;

        const faults = [fifoF, lruF, optF];
        const names  = ['FIFO', 'LRU', 'OPT'];
        const cols   = [P.orange, P.purple, P.green];

        const bW  = mob ? GW() - 24 : 320;
        const bH  = mob ? 62 : 68;
        const bX  = Math.round((W - bW) / 2);
        const bY  = cntY + (mob ? 54 : 62);

        rr(bX, bY, bW, bH, 6, P.surf2, P.border, 1);
        tx('알고리즘 비교 (폴트 횟수)', bX + bW / 2, bY + bH * 0.22, fSm - 1, P.muted, 'center', false);

        const third = bW / 3;
        names.forEach(function (name, i) {
            const cx    = bX + third * (i + 0.5);
            const isMine = algoIdx === i;
            tx(name,           cx, bY + bH * 0.40, fSm - 1, isMine ? cols[i] : P.muted, 'center', isMine);
            tx(String(faults[i]), cx, bY + bH * 0.65, fMd,  isMine ? cols[i] : P.muted, 'center', isMine);
            if (i === 2) {
                tx('(최적)', cx, bY + bH * 0.88, fSm - 1, P.green + '88', 'center', false);
            }
        });

        [1, 2].forEach(function (d) {
            ctx.beginPath();
            ctx.moveTo(bX + third * d, bY + 8);
            ctx.lineTo(bX + third * d, bY + bH - 8);
            ctx.strokeStyle = P.border; ctx.lineWidth = 1; ctx.stroke();
        });
    }

    /* ===================== 알고리즘 설명 라벨 ===================== */
    function drawAlgoLabel(L) {
        const { mob, fSm } = L;
        tx(ALGOS[algoIdx].desc, GW() / 2, mob ? 10 : 12, mob ? 9 : 10, P.muted, 'center', false);
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        ctx.fillStyle = P.bg;
        ctx.fillRect(0, 0, GW(), GH());
        tooltipHits = [];

        const L = buildLayout();
        drawRefString(L);
        drawFrames(L);
        drawHistory(L);
        if (stepIdx >= 0) drawCounter(L);
    }

    /* ===================== 로그 텍스트 ===================== */
    function makeLog(idx) {
        const r = results[idx];
        const algo = ALGOS[algoIdx].name;
        if (r.hit) {
            return 'Step ' + (idx + 1) + ' — 페이지 ' + r.page + ' 참조: HIT ✓ (프레임에 이미 있음). ' + algo + ': 교체 불필요.';
        }
        const victimStr = r.victim >= 0 ? '페이지 ' + r.victim + ' → 페이지 ' + r.page + '로 교체.' : '빈 프레임에 페이지 ' + r.page + ' 적재.';

        let reason = '';
        if (algo === 'FIFO') reason = '가장 먼저 들어온 페이지를 교체합니다.';
        else if (algo === 'LRU') reason = '가장 오랫동안 사용되지 않은 페이지를 교체합니다.';
        else reason = '앞으로 가장 늦게(또는 영원히) 사용될 페이지를 교체합니다.';

        return 'Step ' + (idx + 1) + ' — 페이지 ' + r.page + ' 참조: PAGE FAULT ⚠  ' + victimStr + ' ' + reason;
    }

    /* ===================== 단계 적용 ===================== */
    function setAlgoTabsDisabled(v) {
        root.querySelectorAll('.vmos-viz__algo-btn').forEach(function (b) { b.disabled = v; });
    }
    function setSpeedDisabled(v) {
        root.querySelectorAll('.vmos-viz__speed-btn').forEach(function (b) { b.disabled = v; });
    }

    function applyStep(idx, onDone) {
        stepIdx = idx;
        logEl.textContent = makeLog(idx);
        draw();
        if (onDone) setTimeout(onDone, 0);
    }

    /* ===================== 컨트롤 ===================== */
    function vmStart() {
        if (running) return;
        running = true; btnPlay.disabled = true; btnStep.disabled = true;
        setAlgoTabsDisabled(true); setSpeedDisabled(true);

        function tick() {
            const next = stepIdx + 1;
            if (next >= REF.length) { running = false; setSpeedDisabled(false); return; }
            applyStep(next, function () {
                if (next === REF.length - 1) {
                    running = false; btnStep.disabled = true; setSpeedDisabled(false);
                } else {
                    timer = setTimeout(tick, speed);
                }
            });
        }
        tick();
    }

    function vmStep() {
        if (running) return;
        const next = stepIdx + 1;
        if (next >= REF.length) return;
        applyStep(next, null);
        if (next === REF.length - 1) { btnPlay.disabled = true; btnStep.disabled = true; }
    }

    function vmReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false; stepIdx = -1;
        logEl.textContent = '▶ PLAY를 눌러 페이지 교체 과정을 확인하세요. [ ' + ALGOS[algoIdx].name + ' ] ' + ALGOS[algoIdx].desc;
        btnPlay.disabled = false; btnStep.disabled = false;
        setAlgoTabsDisabled(false); setSpeedDisabled(false);
        draw();
    }

    function setAlgo(idx, btn) {
        algoIdx = idx;
        results = ALGOS[idx].fn(REF, N_FRAMES);
        root.querySelectorAll('.vmos-viz__algo-btn').forEach(function (b) {
            b.classList.remove('vmos-viz__algo-btn--active');
        });
        btn.classList.add('vmos-viz__algo-btn--active');
        vmReset();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.vmos-viz__speed-btn').forEach(function (b) {
            b.classList.remove('vmos-viz__speed-btn--active');
        });
        btn.classList.add('vmos-viz__speed-btn--active');
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