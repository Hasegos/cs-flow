/**
 * SQL JOIN 시각화
 */
(function () {
    'use strict';

    var container = document.getElementById('visualizer-container');
    if (!container) return;

    function el(tag, cls, txt) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (txt !== undefined && txt !== null) e.textContent = txt;
        return e;
    }

    /* ===================== DOM ===================== */
    var root    = el('div', 'sql-join-viz');
    var toolbar = el('div', 'sql-join-viz__toolbar');
    var tbLeft  = el('div', 'sql-join-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'sql-join-viz__title', 'JOIN'));

    var modeWrap = el('div', 'sql-join-viz__mode');
    var modeDefs = [
        { key: 'inner', label: 'INNER' },
        { key: 'left',  label: 'LEFT' },
        { key: 'right', label: 'RIGHT' },
        { key: 'full',  label: 'FULL' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'sql-join-viz__mode-btn' + (i === 0 ? ' sql-join-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'sql-join-viz__speed');
    speedWrap.appendChild(el('span', 'sql-join-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1600], ['2x', 800], ['3x', 450]].forEach(function (pair, i) {
        var b = el('button', 'sql-join-viz__speed-btn' + (i === 0 ? ' sql-join-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'sql-join-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'sql-join-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'sql-join-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'sql-join-viz__controls');
    var btnPlay  = el('button', 'sql-join-viz__btn sql-join-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'sql-join-viz__btn', '▶| STEP');
    var btnReset = el('button', 'sql-join-viz__btn', '↺ RESET');
    btnPlay.addEventListener('click',  vizStart);
    btnStep.addEventListener('click',  vizStep);
    btnReset.addEventListener('click', vizReset);
    controls.appendChild(btnPlay);
    controls.appendChild(btnStep);
    controls.appendChild(btnReset);
    root.appendChild(controls);
    container.appendChild(root);

    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

    /* ===================== 기준 데이터 ===================== */
    var A_COLS = ['id', 'name'];
    var A_ROWS = [
        { id: 1, name: '김민준' },
        { id: 2, name: '이서연' },
        { id: 3, name: '박도윤' }
    ];
    var B_COLS = ['id', 'user_id', 'product'];
    var B_ROWS = [
        { id: 101, user_id: 1, product: '노트북' },
        { id: 102, user_id: 2, product: '키보드' },
        { id: 103, user_id: 5, product: '마우스' }
    ];

    var A_COL_W = { d: { id: 46, name: 88 }, m: { id: 36, name: 70 } };
    var B_COL_W = { d: { id: 46, user_id: 66, product: 88 }, m: { id: 36, user_id: 52, product: 70 } };

    function indexOfA(id) { for (var i = 0; i < A_ROWS.length; i++) if (A_ROWS[i].id === id) return i; return -1; }
    function indexOfBForA(aid) { for (var i = 0; i < B_ROWS.length; i++) if (B_ROWS[i].user_id === aid) return i; return -1; }

    function mkRow(aIdx, bIdx) {
        var a = aIdx >= 0 ? A_ROWS[aIdx] : null;
        var b = bIdx >= 0 ? B_ROWS[bIdx] : null;
        return { aIdx: aIdx, bIdx: bIdx, a_id: a ? a.id : null, a_name: a ? a.name : null, b_id: b ? b.id : null, b_product: b ? b.product : null };
    }

    /* ===================== JOIN 연산 (실제 실행 — 하드코딩 아님) ===================== */
    function innerJoinRows() {
        var out = [];
        B_ROWS.forEach(function (b, bIdx) {
            var aIdx = indexOfA(b.user_id);
            if (aIdx >= 0) out.push(mkRow(aIdx, bIdx));
        });
        return out;
    }
    function leftJoinRows() {
        var out = [];
        A_ROWS.forEach(function (a, aIdx) {
            out.push(mkRow(aIdx, indexOfBForA(a.id)));
        });
        return out;
    }
    function rightJoinRows() {
        var out = [];
        B_ROWS.forEach(function (b, bIdx) {
            out.push(mkRow(indexOfA(b.user_id), bIdx));
        });
        return out;
    }
    function fullJoinRows() {
        var out = leftJoinRows();
        B_ROWS.forEach(function (b, bIdx) {
            if (indexOfA(b.user_id) < 0) out.push(mkRow(-1, bIdx));
        });
        return out;
    }

    var JOIN_FN = { inner: innerJoinRows, left: leftJoinRows, right: rightJoinRows, full: fullJoinRows };
    var JOIN_LABEL = { inner: 'INNER JOIN', left: 'LEFT JOIN', right: 'RIGHT JOIN', full: 'FULL OUTER JOIN' };
    var JOIN_DESC = {
        inner: '양쪽 모두에 값이 있는 행만 남깁니다 — 벤 다이어그램의 겹치는 부분(교집합)만 결과가 됩니다.',
        left:  'A(USERS)의 모든 행을 남기고, 짝이 없는 B 쪽은 NULL로 채웁니다 — 벤 다이어그램에서 왼쪽 원 전체입니다.',
        right: 'B(ORDERS)의 모든 행을 남기고, 짝이 없는 A 쪽은 NULL로 채웁니다 — 벤 다이어그램에서 오른쪽 원 전체입니다.',
        full:  '양쪽의 모든 행을 남기고, 짝이 없는 쪽은 NULL로 채웁니다 — 벤 다이어그램에서 두 원의 합집합입니다.'
    };

    /* ===================== 스텝 빌더 ===================== */
    function rowLogText(r) {
        if (r.aIdx >= 0 && r.bIdx >= 0) {
            return 'USERS(' + r.a_id + ', ' + r.a_name + ') ↔ ORDERS(' + r.b_id + ', ' + r.b_product + ') — user_id=' + r.a_id + ' 일치';
        }
        if (r.aIdx >= 0 && r.bIdx < 0) {
            return 'USERS(' + r.a_id + ', ' + r.a_name + ')는 주문이 없어 ORDERS 쪽이 NULL로 채워집니다.';
        }
        return 'ORDERS(' + r.b_id + ', ' + r.b_product + ')의 user_id=' + B_ROWS[r.bIdx].user_id + '가 USERS에 없어 A 쪽이 NULL로 채워집니다.';
    }

    function buildSteps(joinType) {
        var rows = JOIN_FN[joinType]();
        var steps = [];
        steps.push({ kind: 'intro', joinType: joinType, revealed: [],
            log: JOIN_LABEL[joinType] + ' — ' + JOIN_DESC[joinType] });
        var revealed = [];
        rows.forEach(function (r) {
            revealed = revealed.concat([r]);
            steps.push({ kind: 'reveal', joinType: joinType, revealed: revealed.slice(), active: r,
                log: rowLogText(r) });
        });
        steps.push({ kind: 'done', joinType: joinType, revealed: revealed.slice(),
            log: '정리 — ' + JOIN_LABEL[joinType] + ' 결과는 총 ' + rows.length + '행입니다. (' + JOIN_DESC[joinType] + ')' });
        return steps;
    }

    var STEPS_BY_MODE = {
        inner: buildSteps('inner'),
        left:  buildSteps('left'),
        right: buildSteps('right'),
        full:  buildSteps('full')
    };

    /* ===================== 상태 ===================== */
    var mode    = 'inner';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1600;

    function currentSteps() { return STEPS_BY_MODE[mode]; }

    /* ===================== 드로우 헬퍼 ===================== */
    function rr(x, y, w, h, r, fill, stroke, lw, dash) {
        if (w <= 0 || h <= 0) return;
        var rad = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rad, y);
        ctx.arcTo(x + w, y,     x + w, y + h, rad);
        ctx.arcTo(x + w, y + h, x,     y + h, rad);
        ctx.arcTo(x,     y + h, x,     y,     rad);
        ctx.arcTo(x,     y,     x + w, y,     rad);
        ctx.closePath();
        if (dash) ctx.setLineDash(dash); else ctx.setLineDash([]);
        if (fill   && fill   !== 'none') { ctx.fillStyle   = fill;              ctx.fill();   }
        if (stroke && stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.4; ctx.stroke(); }
        ctx.setLineDash([]);
    }

    function tx(str, x, y, sz, color, align, bold) {
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    /* ===================== 작은 테이블(A/B 원본) 렌더 ===================== */
    function drawSmallTable(x0, y0, cols, colW, rows, headerH, rowH, mob, opts) {
        opts = opts || {};
        var colX = {}; var totalW = 0;
        cols.forEach(function (c) { colX[c] = totalW; totalW += colW[c]; });
        if (opts.title) tx(opts.title, x0, y0 - (mob ? 10 : 12), mob ? 10.5 : 12, P.muted + 'aa', 'left', true);
        rr(x0, y0, totalW, headerH + rows.length * rowH, 6, 'none', P.muted + '55', 1.3);
        cols.forEach(function (c) {
            var cx = x0 + colX[c];
            rr(cx, y0, colW[c], headerH, 0, P.muted + '12', 'none');
            tx(c, cx + colW[c] / 2, y0 + headerH / 2, mob ? 9.5 : 10.5, P.text + 'cc', 'center', true);
        });
        seg(x0, y0 + headerH, x0 + totalW, y0 + headerH, P.muted + '55', 1.3);
        var centers = {};
        rows.forEach(function (row, ri) {
            var ry = y0 + headerH + ri * rowH;
            var hi = opts.highlightRow === ri;
            var dim = opts.dimRow === ri;
            centers[ri] = {};
            cols.forEach(function (c) {
                var cx = x0 + colX[c];
                if (hi) rr(cx, ry, colW[c], rowH, 0, (opts.highlightColor || P.teal) + '2a', 'none');
                var col = dim ? P.muted + '77' : (P.text + 'dd');
                tx(String(row[c]), cx + colW[c] / 2, ry + rowH / 2, mob ? 9.5 : 11, col, 'center', hi);
                centers[ri][c] = { x: cx + colW[c] / 2, y: ry + rowH / 2 };
            });
            if (ri > 0) seg(x0, ry, x0 + totalW, ry, P.muted + '2a', 1);
        });
        var vx = x0;
        cols.forEach(function (c) { if (vx > x0) seg(vx, y0, vx, y0 + headerH + rows.length * rowH, P.muted + '2a', 1); vx += colW[c]; });
        return { width: totalW, height: headerH + rows.length * rowH, centers: centers };
    }

    function seg(x1, y1, x2, y2, col, lw) {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.strokeStyle = col; ctx.lineWidth = lw || 1; ctx.stroke();
    }

    /* ===================== 벤 다이어그램 ===================== */
    function drawVenn(leftCx, rightCx, cy, r, joinType, mob) {
        if (joinType === 'inner') {
            ctx.save();
            ctx.beginPath(); ctx.arc(leftCx, cy, r, 0, Math.PI * 2); ctx.clip();
            ctx.beginPath(); ctx.arc(rightCx, cy, r, 0, Math.PI * 2);
            ctx.fillStyle = P.green + '55'; ctx.fill();
            ctx.restore();
        } else if (joinType === 'left') {
            ctx.beginPath(); ctx.arc(leftCx, cy, r, 0, Math.PI * 2); ctx.fillStyle = P.green + '40'; ctx.fill();
        } else if (joinType === 'right') {
            ctx.beginPath(); ctx.arc(rightCx, cy, r, 0, Math.PI * 2); ctx.fillStyle = P.green + '40'; ctx.fill();
        } else {
            ctx.beginPath(); ctx.arc(leftCx, cy, r, 0, Math.PI * 2); ctx.fillStyle = P.green + '40'; ctx.fill();
            ctx.beginPath(); ctx.arc(rightCx, cy, r, 0, Math.PI * 2); ctx.fillStyle = P.green + '40'; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(leftCx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = P.purple + 'dd'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(rightCx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = P.teal + 'dd'; ctx.lineWidth = 2; ctx.stroke();
        tx('A', leftCx - r * 0.55, cy, mob ? 12 : 14, P.purple + 'ee', 'center', true);
        tx('B', rightCx + r * 0.55, cy, mob ? 12 : 14, P.teal + 'ee', 'center', true);
        tx('USERS', leftCx - r * 0.55, cy + (mob ? 16 : 19), mob ? 8.5 : 9.5, P.purple + 'aa', 'center', false);
        tx('ORDERS', rightCx + r * 0.55, cy + (mob ? 16 : 19), mob ? 8.5 : 9.5, P.teal + 'aa', 'center', false);
    }

    /* ===================== 결과 테이블 ===================== */
    var RESULT_COLS = ['a_id', 'a_name', 'b_id', 'b_product'];
    var RESULT_LABELS = { a_id: 'id', a_name: 'name', b_id: 'id', b_product: 'product' };

    function drawResultTable(x0, y0, colW, revealed, activeRow, headerH, rowH, mob) {
        var colX = {}; var totalW = 0;
        RESULT_COLS.forEach(function (c) { colX[c] = totalW; totalW += colW[c]; });
        tx('결과 (JOIN 결과)', x0, y0 - (mob ? 24 : 27), mob ? 10.5 : 12, P.muted + 'aa', 'left', true);

        var aGroupW = colW.a_id + colW.a_name;
        var bGroupW = colW.b_id + colW.b_product;
        tx('A(USERS)', x0 + aGroupW / 2, y0 - (mob ? 9 : 10), mob ? 8.5 : 9.5, P.purple + '99', 'center', false);
        tx('B(ORDERS)', x0 + aGroupW + bGroupW / 2, y0 - (mob ? 9 : 10), mob ? 8.5 : 9.5, P.teal + '99', 'center', false);

        var maxRows = 4;
        rr(x0, y0, totalW, headerH + maxRows * rowH, 6, 'none', P.muted + '55', 1.3);
        RESULT_COLS.forEach(function (c) {
            var cx = x0 + colX[c];
            rr(cx, y0, colW[c], headerH, 0, P.muted + '12', 'none');
            tx(RESULT_LABELS[c], cx + colW[c] / 2, y0 + headerH / 2, mob ? 9.5 : 10.5, P.text + 'cc', 'center', true);
        });
        seg(x0, y0 + headerH, x0 + totalW, y0 + headerH, P.muted + '55', 1.3);
        var midX = x0 + colW.a_id + colW.a_name;
        seg(midX, y0, midX, y0 + headerH + maxRows * rowH, P.muted + '66', 1.6);

        revealed.forEach(function (r, ri) {
            var ry = y0 + headerH + ri * rowH;
            var isActive = activeRow && r === activeRow;
            if (isActive) rr(x0, ry, totalW, rowH, 0, P.orange + '20', 'none');
            RESULT_COLS.forEach(function (c) {
                var cx = x0 + colX[c];
                var v = r[c];
                var display = (v === null || v === undefined) ? 'NULL' : String(v);
                var isNull = (v === null || v === undefined);
                var color = isNull ? (P.muted + '88') : (isActive ? P.orange + 'ee' : P.text + 'dd');
                tx(display, cx + colW[c] / 2, ry + rowH / 2, mob ? 9.5 : 11, color, 'center', isActive && !isNull);
            });
            if (ri > 0) seg(x0, ry, x0 + totalW, ry, P.muted + '2a', 1);
        });
        var vx = x0;
        RESULT_COLS.forEach(function (c) { if (vx > x0) seg(vx, y0, vx, y0 + headerH + maxRows * rowH, P.muted + '2a', 1); vx += colW[c]; });

        return { height: headerH + maxRows * rowH };
    }

    /* ===================== 레이아웃 ===================== */
    function getGeom(mob) {
        return {
            headerH: mob ? 28 : 32,
            rowH:    mob ? 26 : 30,
            padX:    mob ? 14 : 24,
            titleGap: mob ? 16 : 18,
            sectionGap: mob ? 18 : 22
        };
    }

    function calcH(w) {
        var mob = w < 600;
        var G = getGeom(mob);
        var aColW = A_COL_W[mob ? 'm' : 'd'];
        var sourceH = G.headerH + A_ROWS.length * G.rowH;
        var vennR = mob ? 42 : 56;
        var vennH = vennR * 2 + (mob ? 26 : 30);
        var resultH = G.headerH + 4 * G.rowH + (mob ? 14 : 16);
        var top = mob ? 14 : 18, bottom = mob ? 16 : 20;
        return top + G.titleGap + sourceH + G.sectionGap + vennH + G.sectionGap + G.titleGap + resultH + bottom;
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var neededH = calcH(w);
        canvasWrap.style.height    = 'auto';
        canvasWrap.style.minHeight = neededH + 'px';
        var actualH = canvasWrap.offsetHeight || neededH;
        if (actualH < neededH) actualH = neededH;
        canvas.width  = w * dpr;
        canvas.height = actualH * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        var W = GW(); var mob = W < 600;
        var G = getGeom(mob);
        var neededH = calcH(W);
        var extra = Math.max(0, GH() - neededH);
        var top = (mob ? 14 : 18) + extra / 2;

        var steps = currentSteps();
        var step = stepIdx >= 0 ? steps[stepIdx] : steps[0];
        var x0 = G.padX;

        var aColW = A_COL_W[mob ? 'm' : 'd'];
        var bColW = B_COL_W[mob ? 'm' : 'd'];

        var highlightA = -1, highlightB = -1, dimA = -1, dimB = -1, hiColor = P.orange;
        if (step.active) {
            highlightA = step.active.aIdx >= 0 ? step.active.aIdx : -1;
            highlightB = step.active.bIdx >= 0 ? step.active.bIdx : -1;
            hiColor = P.orange;
        }

        var aRes = drawSmallTable(x0, top + G.titleGap, A_COLS, aColW, A_ROWS, G.headerH, G.rowH, mob, {
            title: 'A = USERS', highlightRow: highlightA, highlightColor: hiColor
        });
        var bX = x0 + aRes.width + (mob ? 30 : 44);
        var bRes = drawSmallTable(bX, top + G.titleGap, B_COLS, bColW, B_ROWS, G.headerH, G.rowH, mob, {
            title: 'B = ORDERS', highlightRow: highlightB, highlightColor: hiColor
        });

        var vennR = mob ? 42 : 56;
        var vennTop = top + G.titleGap + aRes.height + G.sectionGap;
        var vennCy = vennTop + vennR + (mob ? 10 : 12);
        var combinedW = bX + bRes.width - x0;
        var vennCenterX = x0 + combinedW / 2;
        var vennOverlap = vennR * 0.7;
        var leftCx = vennCenterX - vennOverlap / 2;
        var rightCx = vennCenterX + vennOverlap / 2;
        drawVenn(leftCx, rightCx, vennCy, vennR, step.joinType, mob);

        var resultY = vennTop + vennR * 2 + (mob ? 24 : 28) + G.sectionGap + G.titleGap + (mob ? 14 : 16);
        var resultColW = {
            a_id: aColW.id, a_name: aColW.name, b_id: bColW.id, b_product: bColW.product
        };
        drawResultTable(x0, resultY, resultColW, step.revealed || [], step.active, G.headerH, G.rowH, mob);
    }

    /* ===================== 애니메이션(스텝 전환) ===================== */
    function animateStep(onDone) {
        if (rafId) cancelAnimationFrame(rafId);
        draw();
        rafId = requestAnimationFrame(function () { rafId = null; if (onDone) onDone(); });
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) { speedBtns.forEach(function (b) { b.disabled = v; }); }
    function defaultLog() { return currentSteps()[0].log; }

    function applyStep(idx, onDone) {
        stepIdx = idx;
        logEl.textContent = currentSteps()[idx].log;
        animateStep(function () { if (onDone) setTimeout(onDone, 0); });
    }

    function vizStart() {
        if (running) return;
        running = true; btnPlay.disabled = true; btnStep.disabled = true;
        setSpeedDisabled(true);
        var steps = currentSteps();
        function tick() {
            var next = stepIdx + 1;
            if (next >= steps.length) { running = false; setSpeedDisabled(false); return; }
            applyStep(next, function () {
                if (next === steps.length - 1) {
                    running = false; btnStep.disabled = true; setSpeedDisabled(false);
                } else {
                    timer = setTimeout(tick, speed * 0.6);
                }
            });
        }
        tick();
    }

    function vizStep() {
        if (running) return;
        var steps = currentSteps();
        var next = stepIdx + 1;
        if (next >= steps.length) return;
        applyStep(next, null);
        if (next === steps.length - 1) { btnPlay.disabled = true; btnStep.disabled = true; }
    }

    function vizReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false; stepIdx = -1;
        btnPlay.disabled = false; btnStep.disabled = false;
        logEl.textContent = defaultLog();
        setSpeedDisabled(false);
        resize();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        speedBtns.forEach(function (b) { b.classList.remove('sql-join-viz__speed-btn--active'); });
        btn.classList.add('sql-join-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('sql-join-viz__mode-btn--active', d.key === m); });
        vizReset();
    }

    logEl.textContent = defaultLog();

    /* ===================== 라이프사이클 ===================== */
    window.CsFlow.createVizLifecycle({
        canvas: canvas, canvasWrap: canvasWrap, resize: resize, draw: draw,
        getState : function () { return { rafId: rafId, timer: timer, running: running }; },
        setState : function (s) { rafId = s.rafId; timer = s.timer; running = s.running; },
        onPause  : function () { setSpeedDisabled(false); },
        getMouseCtx: function () {
            return {
                GW: GW, GH: GH,
                mousePos: { x: -1, y: -1 },
                tooltipHits: [],
                hoveredKey: function () { return null; },
                setHoveredKey: function () {},
                draw: draw
            };
        }
    });

    setTimeout(resize, 60);
})();