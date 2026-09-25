/**
 * 쿼리 실행 계획 시각화
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
    var root    = el('div', 'query-plan-viz');
    var toolbar = el('div', 'query-plan-viz__toolbar');
    var tbLeft  = el('div', 'query-plan-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'query-plan-viz__title', 'EXPLAIN'));

    var modeWrap = el('div', 'query-plan-viz__mode');
    var modeDefs = [
        { key: 'intro', label: 'EXPLAIN 읽기' },
        { key: 'high',  label: '선택도 높음' },
        { key: 'low',   label: '선택도 낮음' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'query-plan-viz__mode-btn' + (i === 0 ? ' query-plan-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'query-plan-viz__speed');
    speedWrap.appendChild(el('span', 'query-plan-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'query-plan-viz__speed-btn' + (i === 0 ? ' query-plan-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'query-plan-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'query-plan-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'query-plan-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'query-plan-viz__controls');
    var btnPlay  = el('button', 'query-plan-viz__btn query-plan-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'query-plan-viz__btn', '▶| STEP');
    var btnReset = el('button', 'query-plan-viz__btn', '↺ RESET');
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
    var TOTAL_ROWS = 20;
    var VIP_COUNT = 2;
    var NORMAL_COUNT = 18;
    var INDEX_OVERHEAD = 2;
    var RANDOM_ACCESS_WEIGHT = 4;

    /* ===================== 비용 계산 (실제 실행 — 하드코딩 아님) ===================== */
    function fullScanCost(total) { return total; }
    function indexScanCost(matching) { return INDEX_OVERHEAD + matching * RANDOM_ACCESS_WEIGHT; }
    function decide(matching, total) {
        var fs = fullScanCost(total);
        var ix = indexScanCost(matching);
        return { fullCost: fs, indexCost: ix, winner: ix < fs ? 'index' : 'full', selectivity: matching / total };
    }

    var HIGH_SEL = decide(NORMAL_COUNT, TOTAL_ROWS);
    var LOW_SEL  = decide(VIP_COUNT, TOTAL_ROWS);

    var EXPLAIN_CARDS = [
        { key: 'type', title: 'type', example: 'ALL / ref', desc: '어떤 방식으로 읽었는지. ALL(풀 스캔)이 가장 느리고, const·ref·range 등은 인덱스를 사용한 것입니다.' },
        { key: 'keyCol', title: 'key', example: 'idx_grade / NULL', desc: '실제로 사용된 인덱스 이름. 인덱스가 있어도 옵티마이저가 안 쓰기로 하면 NULL이 됩니다.' },
        { key: 'rows', title: 'rows', example: '2 / 20', desc: '옵티마이저가 예상한 스캔 행 수. 이 값이 작을수록 빠른 계획입니다.' }
    ];

    /* ===================== 스텝 빌더 ===================== */
    function buildIntroSteps() {
        var steps = [];
        steps.push({ kind: 'intro', card: -1,
            log: 'SQL을 실행하면 DB 옵티마이저가 여러 실행 방법의 비용을 계산해서 가장 싼 방법을 고릅니다. 그 선택 결과를 보여주는 것이 EXPLAIN입니다.' });
        EXPLAIN_CARDS.forEach(function (c, i) {
            steps.push({ kind: 'card', card: i, log: c.title + ' — ' + c.desc });
        });
        steps.push({ kind: 'done', card: -1,
            log: '정리 — 인덱스가 "있다"는 사실보다, 옵티마이저가 그 인덱스를 "쓰기로 했는지"가 중요합니다. 다음 두 탭에서 같은 인덱스를 두고 옵티마이저가 다르게 판단하는 걸 확인해보세요.' });
        return steps;
    }

    function buildSelectivitySteps(matching, label, sel) {
        var pct = Math.round(sel.selectivity * 100);
        var steps = [];
        steps.push({ kind: 'intro', showDist: true, distHi: label, showCost: false, winner: null,
            log: "user_grade = '" + label + "' 조건은 전체 " + TOTAL_ROWS + "행 중 " + matching + "행이 해당합니다 (선택도 " + pct + "%)." });
        steps.push({ kind: 'full-cost', showDist: true, distHi: label, showCost: 'full', winner: null,
            log: '풀 스캔 비용 = 전체 행 수 = ' + sel.fullCost });
        steps.push({ kind: 'index-cost', showDist: true, distHi: label, showCost: 'both', winner: null,
            log: '인덱스 스캔 비용 = 인덱스 탐색 비용(' + INDEX_OVERHEAD + ') + ' + matching + '행 × ' + RANDOM_ACCESS_WEIGHT + ' = ' + sel.indexCost });
        steps.push({ kind: 'decide', showDist: true, distHi: label, showCost: 'both', winner: sel.winner,
            log: sel.winner === 'index'
                ? sel.indexCost + ' < ' + sel.fullCost + ' 이므로 옵티마이저는 인덱스 스캔을 선택합니다.'
                : sel.fullCost + ' < ' + sel.indexCost + ' 이므로 인덱스가 있어도 옵티마이저는 풀 스캔을 선택합니다.' });
        steps.push({ kind: 'done', showDist: true, distHi: label, showCost: 'both', winner: sel.winner, showExplain: true,
            log: sel.winner === 'index'
                ? '정리 — EXPLAIN 결과: type=ref, key=idx_user_grade, rows=' + matching + '. 선택도가 낮을수록(희귀한 값일수록) 인덱스가 유리합니다.'
                : '정리 — EXPLAIN 결과: type=ALL, key=NULL, rows=' + TOTAL_ROWS + '. 조건에 맞는 행이 너무 많으면(선택도가 높으면) 인덱스보다 풀 스캔이 더 쌉니다.' });
        return steps;
    }

    var INTRO_STEPS = buildIntroSteps();
    var HIGH_STEPS  = buildSelectivitySteps(NORMAL_COUNT, '일반', HIGH_SEL);
    var LOW_STEPS   = buildSelectivitySteps(VIP_COUNT, 'VIP', LOW_SEL);

    /* ===================== 상태 ===================== */
    var mode    = 'intro';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'high') return HIGH_STEPS;
        if (mode === 'low') return LOW_STEPS;
        return INTRO_STEPS;
    }

    /* ===================== 드로우 헬퍼 ===================== */
    function rr(x, y, w, h, r, fill, stroke, lw) {
        if (w <= 0 || h <= 0) return;
        var rad = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rad, y);
        ctx.arcTo(x + w, y,     x + w, y + h, rad);
        ctx.arcTo(x + w, y + h, x,     y + h, rad);
        ctx.arcTo(x,     y + h, x,     y,     rad);
        ctx.arcTo(x,     y,     x + w, y,     rad);
        ctx.closePath();
        if (fill   && fill   !== 'none') { ctx.fillStyle   = fill;              ctx.fill();   }
        if (stroke && stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.4; ctx.stroke(); }
    }
    function tx(str, x, y, sz, color, align, bold) {
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }
    function wrapText(str, maxW, sz) {
        ctx.font = '500 ' + sz + 'px "JetBrains Mono",monospace';
        var words = str.split(' ');
        var lines = []; var cur = '';
        words.forEach(function (w) {
            var test = cur ? cur + ' ' + w : w;
            if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
            else cur = test;
        });
        if (cur) lines.push(cur);
        return lines;
    }

    /* ===================== 모드1: EXPLAIN 카드 ===================== */
    function drawExplainCards(x0, y0, w, activeIdx, mob) {
        var gap = mob ? 12 : 18;
        var boxW = (w - gap * 2) / 3;
        var boxH = mob ? 60 : 72;
        EXPLAIN_CARDS.forEach(function (c, i) {
            var bx = x0 + i * (boxW + gap);
            var isActive = activeIdx === i;
            var col = isActive ? P.orange : P.purple;
            rr(bx, y0, boxW, boxH, 8, isActive ? col + '20' : 'none', col + (isActive ? 'ee' : '66'), isActive ? 2.2 : 1.4);
            tx(c.title, bx + boxW / 2, y0 + boxH * 0.34, mob ? 14 : 16, col + 'ee', 'center', true);
            tx(c.example, bx + boxW / 2, y0 + boxH * 0.72, mob ? 9.5 : 11, col + 'bb', 'center', false);
        });
        return { height: boxH };
    }

    /* ===================== 모드2/3: 분포 바 + 비용 비교 ===================== */
    function drawDistBar(x0, y0, w, mob, hiLabel) {
        var h = mob ? 40 : 48;
        tx('USERS 분포 (user_grade)', x0, y0 - (mob ? 10 : 12), mob ? 11 : 12.5, P.muted + 'aa', 'left', true);
        var vipW = w * (VIP_COUNT / TOTAL_ROWS);
        var normW = w - vipW;
        var vipOn = hiLabel === 'VIP';
        var normOn = hiLabel === '일반';
        rr(x0, y0, vipW, h, 6, (vipOn ? P.orange : P.purple) + (vipOn ? '33' : '18'), (vipOn ? P.orange : P.purple) + (vipOn ? 'ee' : '55'), vipOn ? 2.2 : 1.3);
        rr(x0 + vipW, y0, normW, h, 6, (normOn ? P.orange : P.teal) + (normOn ? '33' : '18'), (normOn ? P.orange : P.teal) + (normOn ? 'ee' : '55'), normOn ? 2.2 : 1.3);
        tx('VIP ' + VIP_COUNT, x0 + vipW / 2, y0 + h / 2, mob ? 9 : 10.5, vipOn ? (P.orange + 'ee') : (P.purple + 'cc'), 'center', vipOn);
        tx('일반 ' + NORMAL_COUNT, x0 + vipW + normW / 2, y0 + h / 2, mob ? 10 : 11.5, normOn ? (P.orange + 'ee') : (P.teal + 'cc'), 'center', normOn);
        return { height: h };
    }

    function drawCostBars(x0, y0, w, mob, fullCost, indexCost, showWhich, winner) {
        var barH = mob ? 30 : 36;
        var gap = mob ? 14 : 18;
        var maxCost = Math.max(fullCost, indexCost, 1);
        var labelW = mob ? 78 : 96;
        var barAreaW = w - labelW - (mob ? 46 : 58);

        tx('예상 비용', x0, y0 - (mob ? 10 : 12), mob ? 11 : 12.5, P.muted + 'aa', 'left', true);

        var rows = [
            { key: 'full', label: '풀 스캔', cost: fullCost, show: showWhich === 'full' || showWhich === 'both' },
            { key: 'index', label: '인덱스 스캔', cost: indexCost, show: showWhich === 'both' }
        ];
        rows.forEach(function (r, i) {
            var ry = y0 + i * (barH + gap);
            var isWinner = winner && winner === r.key;
            var isLoser = winner && winner !== r.key;
            tx(r.label, x0 + labelW - 8, ry + barH / 2, mob ? 10 : 11.5, (P.text) + (isLoser ? '77' : 'dd'), 'right', isWinner);
            var trackX = x0 + labelW;
            rr(trackX, ry, barAreaW, barH, 6, P.muted + '0c', P.muted + '33', 1);
            if (r.show) {
                var bw = Math.max(6, barAreaW * (r.cost / maxCost));
                var accent = isWinner ? P.green : (isLoser ? P.muted : P.teal);
                rr(trackX, ry, bw, barH, 6, accent + (isWinner ? '33' : '1c'), accent + (isWinner ? 'ee' : '88'), isWinner ? 2 : 1.3);
                tx(String(r.cost), trackX + bw + (mob ? 10 : 14), ry + barH / 2, mob ? 10.5 : 12, accent + 'ee', 'left', isWinner);
            }
        });
        return { height: rows.length * barH + gap };
    }

    function drawExplainResult(x0, y0, w, mob, winner, matching) {
        var h = mob ? 44 : 50;
        var accent = winner === 'index' ? P.green : P.orange;
        rr(x0, y0, w, h, 8, accent + '14', accent + 'cc', 1.8);
        var typeVal = winner === 'index' ? 'ref' : 'ALL';
        var keyVal = winner === 'index' ? 'idx_user_grade' : 'NULL';
        var rowsVal = winner === 'index' ? matching : TOTAL_ROWS;
        tx('EXPLAIN → type=' + typeVal + '  key=' + keyVal + '  rows=' + rowsVal, x0 + w / 2, y0 + h / 2, mob ? 10.5 : 12, accent + 'ee', 'center', true);
        return { height: h };
    }

    /* ===================== 레이아웃 ===================== */
    function getGeom(mob) {
        return { padX: mob ? 16 : 26, titleGap: mob ? 18 : 22, sectionGap: mob ? 30 : 38 };
    }

    function calcH(w) {
        var mob = w < 600;
        var G = getGeom(mob);
        var top = mob ? 16 : 20, bottom = mob ? 18 : 22;
        if (mode === 'intro') {
            var boxH = mob ? 60 : 72;
            var descLines = mob ? 3 : 2;
            var descH = descLines * (mob ? 16 : 18) + (mob ? 14 : 18);
            return top + G.titleGap + boxH + G.sectionGap + descH + bottom;
        }
        var distH = mob ? 40 : 48;
        var barsH = 2 * (mob ? 30 : 36) + (mob ? 14 : 18);
        var explainH = mob ? 44 : 50;
        return top + G.titleGap + distH + G.sectionGap + barsH + G.sectionGap + explainH + bottom;
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
        var top = (mob ? 16 : 20) + extra / 2;
        var x0 = G.padX;
        var fullW = W - G.padX * 2;

        var steps = currentSteps();
        var step = stepIdx >= 0 ? steps[stepIdx] : steps[0];

        if (mode === 'intro') {
            var cardRes = drawExplainCards(x0, top + G.titleGap, fullW, step.card, mob);
            var descY = top + G.titleGap + cardRes.height + G.sectionGap;
            if (step.card >= 0) {
                var c = EXPLAIN_CARDS[step.card];
                var lines = wrapText(c.title + ' — ' + c.desc, fullW, mob ? 11 : 12.5);
                lines.forEach(function (line, i) {
                    tx(line, x0, descY + i * (mob ? 16 : 18), mob ? 11 : 12.5, P.orange + 'dd', 'left', false);
                });
            } else {
                tx('아래 STEP을 눌러 type → key → rows 순서로 하나씩 살펴보세요.', x0, descY, mob ? 11 : 12.5, P.muted + 'aa', 'left', false);
            }
            return;
        }

        var y = top + G.titleGap;
        var distRes = drawDistBar(x0, y, fullW, mob, step.distHi);
        y += distRes.height + G.sectionGap;

        var sel = mode === 'high' ? HIGH_SEL : LOW_SEL;
        var barsRes = drawCostBars(x0, y, fullW, mob, sel.fullCost, sel.indexCost, step.showCost, step.winner);
        y += barsRes.height + G.sectionGap;

        if (step.showExplain) {
            drawExplainResult(x0, y, fullW, mob, step.winner, mode === 'high' ? VIP_COUNT : NORMAL_COUNT);
        }
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
        speedBtns.forEach(function (b) { b.classList.remove('query-plan-viz__speed-btn--active'); });
        btn.classList.add('query-plan-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('query-plan-viz__mode-btn--active', d.key === m); });
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
