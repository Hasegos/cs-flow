/**
 * DP 기초 시각화
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
    var root    = el('div', 'dp-basic-viz');
    var toolbar = el('div', 'dp-basic-viz__toolbar');
    var tbLeft  = el('div', 'dp-basic-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'dp-basic-viz__title', 'KNAPSACK'));

    var modeWrap = el('div', 'dp-basic-viz__mode');
    var modeDefs = [
        { key: 'table',     label: '표 채우기' },
        { key: 'backtrack', label: '선택 아이템 역추적' },
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'dp-basic-viz__mode-btn' + (i === 0 ? ' dp-basic-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'dp-basic-viz__speed');
    speedWrap.appendChild(el('span', 'dp-basic-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1200], ['2x', 600], ['3x', 300]].forEach(function (pair, i) {
        var b = el('button', 'dp-basic-viz__speed-btn' + (i === 0 ? ' dp-basic-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'dp-basic-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'dp-basic-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'dp-basic-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'dp-basic-viz__controls');
    var btnPlay  = el('button', 'dp-basic-viz__btn dp-basic-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'dp-basic-viz__btn', '▶| STEP');
    var btnReset = el('button', 'dp-basic-viz__btn', '↺ RESET');
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

    /* ===================== 문제 데이터 (고정 0/1 배낭 문제 — 이해 부담을 줄이기 위해 작게 유지) ===================== */
    var ITEMS = [
        { w: 2, v: 3 },
        { w: 3, v: 4 },
        { w: 4, v: 5 },
    ];
    var CAP = 5;
    var NI  = ITEMS.length;

    /* ===================== 표 채우기 스텝 (실제 DP 점화식 실행) ===================== */
    function buildTableSteps() {
        var dp = [];
        for (var i = 0; i <= NI; i++) dp.push(new Array(CAP + 1).fill(0));
        var steps = [];

        steps.push({ type: 'intro', dp: dp.map(function (r) { return r.slice(); }), cur: null,
            log: 'PLAY를 눌러 배낭 문제의 DP 테이블이 채워지는 과정을 확인하세요. 0열(아이템 없음)과 0행(무게 0)은 항상 0입니다(기저 사례).' });

        for (var it = 1; it <= NI; it++) {
            var item = ITEMS[it - 1];
            for (var w = 0; w <= CAP; w++) {
                var without = dp[it - 1][w];
                var withVal = -1, withSrcW = null;
                if (item.w <= w) { withVal = dp[it - 1][w - item.w] + item.v; withSrcW = w - item.w; }
                var include = withVal > without;
                var best = include ? withVal : without;
                dp[it][w] = best;

                var log;
                if (item.w > w) {
                    log = '지금 칸: 아이템' + it + '의 무게(' + item.w + ')가 지금 용량(' + w + ')보다 커서 애초에 넣을 수 없습니다 → 왼쪽 칸(이 아이템 없이 얻은 값) ' + without + '을 그대로 가져옵니다.';
                } else if (include) {
                    log = '지금 칸: 안 넣으면 ' + without + ', 넣으면 ' + withVal + '(대각선 칸의 값 ' + dp[it - 1][withSrcW] + ' + 이 아이템의 가치 ' + item.v + '). 넣는 쪽이 더 크므로 ' + best + '을 씁니다.';
                } else {
                    log = '지금 칸: 안 넣으면 ' + without + ', 넣으면 ' + withVal + '. 안 넣는 쪽이 더 크거나 같으므로 ' + best + '을 그대로 씁니다.';
                }

                var isLast = it === NI && w === CAP;
                steps.push({ type: isLast ? 'done' : 'fill', cur: { i: it, w: w }, include: include,
                    without: without, withVal: withVal, possible: item.w <= w,
                    srcAbove: { i: it - 1, w: w }, srcDiag: withSrcW != null ? { i: it - 1, w: withSrcW } : null,
                    dp: dp.map(function (r) { return r.slice(); }), log: log });
            }
        }
        steps[steps.length - 1].log += ' 표가 완성되었습니다 — 오른쪽 아래 칸(' + dp[NI][CAP] + ')이 최적 답입니다. "선택 아이템 역추적" 탭에서 어떤 아이템을 골랐는지 확인하세요.';
        return { steps: steps, dp: dp };
    }

    var TABLE = buildTableSteps();
    var TABLE_STEPS = TABLE.steps;
    var DP = TABLE.dp;

    /* ===================== 역추적 스텝 (완성된 표를 거슬러 올라가며 선택 아이템 확인) ===================== */
    function buildBacktrackSteps() {
        var steps = [];
        var i = NI, w = CAP;
        var selected = [];

        steps.push({ type: 'intro', i: i, w: w, selected: [],
            log: 'PLAY를 눌러 완성된 표의 오른쪽 아래(최적값 ' + DP[NI][CAP] + ')에서 왼쪽 위로 거슬러 올라가며 어떤 아이템을 골랐는지 확인하세요.' });

        while (i >= 1) {
            var item = ITEMS[i - 1];
            var included = DP[i][w] !== DP[i - 1][w];
            var log;
            if (included) {
                selected = [i - 1].concat(selected);
                log = 'dp[' + i + '][' + w + ']=' + DP[i][w] + '가 dp[' + (i - 1) + '][' + w + ']=' + DP[i - 1][w] + '와 달라 → 아이템' + i + '(무게' + item.w + ',가치' + item.v + ')을 포함했습니다. 용량을 ' + w + '→' + (w - item.w) + '로 줄여 계속 거슬러 올라갑니다.';
                w -= item.w;
            } else {
                log = 'dp[' + i + '][' + w + ']=' + DP[i][w] + '가 dp[' + (i - 1) + '][' + w + ']=' + DP[i - 1][w] + '와 같아 → 아이템' + i + '은 포함되지 않았습니다.';
            }
            i -= 1;
            steps.push({ type: i === 0 ? 'done' : 'step', i: i, w: w, included: included, itemIdx: i, selected: selected.slice(), log: log });
        }
        var totalW = 0, totalV = 0;
        selected.forEach(function (idx) { totalW += ITEMS[idx].w; totalV += ITEMS[idx].v; });
        steps[steps.length - 1].log += ' 최종 선택: 아이템 ' + selected.map(function (x) { return x + 1; }).join(', ') +
            ' (총 무게 ' + totalW + ' / 총 가치 ' + totalV + ') — DP 테이블의 최적값과 정확히 일치합니다.';
        return steps;
    }

    var BACKTRACK_STEPS = buildBacktrackSteps();

    /* ===================== 상태 변수 ===================== */
    var mode    = 'table';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1200;

    function currentSteps() {
        return mode === 'table' ? TABLE_STEPS : BACKTRACK_STEPS;
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
        if (stroke && stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
    }

    function tx(str, x, y, sz, color, align, bold) {
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    function line(x1, y1, x2, y2, col, lw) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = col; ctx.lineWidth = lw || 1.5;
        ctx.stroke();
    }

    function arrow(x1, y1, x2, y2, col, lw) {
        line(x1, y1, x2, y2, col, lw);
        var angle = Math.atan2(y2 - y1, x2 - x1);
        var headLen = (lw || 1.5) * 3.2 + 4;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 7), y2 - headLen * Math.sin(angle - Math.PI / 7));
        ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 7), y2 - headLen * Math.sin(angle + Math.PI / 7));
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();
    }

    /* ===================== 아이템 목록 (표 위 범례) ===================== */
    function drawItemsLegend(x0, top, mob, W, spec) {
        var fLbl = mob ? 10.5 : 11.5;
        var chipH = mob ? 30 : 34, gap = mob ? 6 : 8;
        var chipW = (W - x0 * 2 - gap * (NI - 1)) / NI;
        ITEMS.forEach(function (item, idx) {
            var it = idx + 1;
            var x = x0 + idx * (chipW + gap);
            var isSel = spec.selectedSet && spec.selectedSet[idx];
            var col = isSel ? P.green : P.muted;
            rr(x, top, chipW, chipH, 4, col + (isSel ? '22' : '10'), col + (isSel ? 'ee' : '55'), isSel ? 2 : 1);
            tx('아이템' + it + '  무게' + item.w + ' 가치' + item.v, x + chipW / 2, top + chipH / 2, fLbl, isSel ? P.green + 'ee' : P.text + 'bb', 'center', isSel);
        });
    }

    /* ===================== DP 테이블 렌더 ===================== */
    function drawTable(x0, top, mob, spec, step) {
        var cellW = mob ? 58 : 74, cellH = mob ? 32 : 38;
        var headerRowH = mob ? 46 : 52;
        var headW = mob ? 62 : 78;
        var fHead = mob ? 10 : 11.5, fVal = mob ? 12.5 : 14;

        function cellCenter(i, w) {
            return { x: x0 + headW + i * cellW + cellW / 2, y: top + headerRowH + w * cellH + cellH / 2 };
        }

        tx('무게 \\ 아이템', x0 + headW / 2, top + headerRowH / 2, mob ? 9 : 10, P.muted + 'aa', 'center', true);
        for (var i = 0; i <= NI; i++) {
            var hx = x0 + headW + i * cellW + cellW / 2;
            if (i === 0) {
                tx('0개', hx, top + headerRowH / 2, fHead, P.text + '99', 'center', true);
            } else {
                var hItem = ITEMS[i - 1];
                tx('아이템' + i, hx, top + headerRowH / 2 - (mob ? 9 : 10), fHead, P.text + 'cc', 'center', true);
                tx('무게' + hItem.w + ' 가치' + hItem.v, hx, top + headerRowH / 2 + (mob ? 10 : 11), mob ? 9.5 : 10.5, P.muted + 'bb', 'center', false);
            }
        }

        for (var w = 0; w <= CAP; w++) {
            var ry = top + headerRowH + w * cellH;
            tx('무게 ' + w, x0 + headW / 2, ry + cellH / 2, fHead, P.text + '99', 'center', true);

            for (var i2 = 0; i2 <= NI; i2++) {
                var cx2 = x0 + headW + i2 * cellW;
                var known = spec.dp[i2] && spec.dp[i2][w] != null;
                var key = i2 + '-' + w;
                var isCur = spec.cur && spec.cur.i === i2 && spec.cur.w === w;
                var isSrc = spec.srcKeys && spec.srcKeys[key];
                var onBacktrackPath = spec.pathKeys && spec.pathKeys[key];

                var col = P.muted, fillA = '08', strokeA = '30', lw = 1;
                if (known) { col = spec.includeMap && spec.includeMap[key] ? P.green : P.teal; fillA = '18'; strokeA = '66'; lw = 1.2; }
                if (isSrc) { col = P.purple; fillA = '20'; strokeA = 'aa'; lw = 1.6; }
                if (onBacktrackPath) { col = P.orange; fillA = '26'; strokeA = 'ee'; lw = 2; }
                if (isCur) { col = P.orange; fillA = '30'; strokeA = 'ee'; lw = 2.4; }

                rr(cx2, ry, cellW - 2, cellH - 2, 3, col + fillA, col + strokeA, lw);
                if (known) tx(String(spec.dp[i2][w]), cx2 + cellW / 2, ry + cellH / 2, fVal, P.text + 'ee', 'center', isCur || onBacktrackPath);
            }
        }

        if (mode === 'table' && step && step.cur) {
            var curC = cellCenter(step.cur.i, step.cur.w);
            if (step.srcAbove) {
                var a = cellCenter(step.srcAbove.i, step.srcAbove.w);
                arrow(a.x + cellW * 0.32, a.y, curC.x - cellW * 0.32, curC.y, P.teal + 'dd', 2);
            }
            if (step.srcDiag) {
                var d = cellCenter(step.srcDiag.i, step.srcDiag.w);
                arrow(d.x + cellW * 0.26, d.y + cellH * 0.26, curC.x - cellW * 0.26, curC.y - cellH * 0.26, P.purple + 'dd', 2);
            }

            if (step.type !== 'intro') {
                var boxW = mob ? 104 : 130, lineH = mob ? 17 : 19;
                var boxH = lineH * 2 + (mob ? 8 : 10);
                var bx = Math.min(Math.max(curC.x - boxW / 2, x0), x0 + headW + (NI + 1) * cellW - boxW);
                var by = curC.y - cellH / 2 - boxH - (mob ? 6 : 8);
                if (by < top + headerRowH) by = curC.y + cellH / 2 + (mob ? 6 : 8);
                rr(bx, by, boxW, boxH, 5, '#1a1a2eee', P.orange + '88', 1.3);
                var wo = step.without, wv = step.withVal;
                var LOSE_COL = '#9a9aad';
                var woCol = (!step.include) ? P.green : LOSE_COL;
                var wvCol = step.include ? P.green : LOSE_COL;
                tx('제외: ' + wo, bx + boxW / 2, by + lineH * 0.5 + (mob ? 3 : 4), mob ? 10.5 : 11.5, woCol + 'ee', 'center', !step.include);
                tx('포함: ' + (step.possible ? wv : '불가'), bx + boxW / 2, by + lineH * 1.5 + (mob ? 4 : 5), mob ? 10.5 : 11.5, wvCol + 'ee', 'center', step.include);
            }
        }
    }

    /* ===================== 스텝 → 렌더 스펙 ===================== */
    function computeSpec(step) {
        var spec = { dp: step.dp, cur: step.cur || null, srcKeys: {}, includeMap: {}, pathKeys: {}, selectedSet: {} };

        if (mode === 'table') {
            var idx = TABLE_STEPS.indexOf(step);
            for (var s = 1; s <= idx; s++) {
                var st = TABLE_STEPS[s];
                if (st.cur) spec.includeMap[st.cur.i + '-' + st.cur.w] = st.include;
            }
            if (step.srcAbove) spec.srcKeys[step.srcAbove.i + '-' + step.srcAbove.w] = true;
            if (step.srcDiag) spec.srcKeys[step.srcDiag.i + '-' + step.srcDiag.w] = true;
        } else {
            spec.dp = DP;
            for (var i = 0; i <= NI; i++) {
                for (var w = 0; w <= CAP; w++) {
                    var key = i + '-' + w;
                    if (i > 0) spec.includeMap[key] = DP[i][w] !== DP[i - 1][w];
                }
            }
            spec.pathKeys[NI + '-' + CAP] = true;
            var curI = NI, curW = CAP;
            var idx2 = BACKTRACK_STEPS.indexOf(step);
            for (var s2 = 1; s2 <= idx2; s2++) {
                var st2 = BACKTRACK_STEPS[s2];
                var prevW = curW;
                if (st2.included) curW -= ITEMS[curI - 1].w;
                curI -= 1;
                spec.pathKeys[curI + '-' + curW] = true;
            }
            (step.selected || []).forEach(function (i2) { spec.selectedSet[i2] = true; });
        }
        return spec;
    }

    /* ===================== 레이아웃 ===================== */
    function getLayout(mob) {
        var headerRowH = mob ? 46 : 52;
        var cellH = mob ? 32 : 38;
        return {
            top:      mob ? 14 : 20,
            legendH:  mob ? 38 : 42,
            gapMid:   mob ? 10 : 12,
            tableH:   headerRowH + (CAP + 1) * cellH,
        };
    }

    /* ===================== resize ===================== */
    function calcH(W) {
        var mob = W < 600;
        var L = getLayout(mob);
        return L.top + L.legendH + L.gapMid + L.tableH + L.top;
    }

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
        var W   = GW();
        var mob = W < 600;
        var L   = getLayout(mob);

        var neededH = calcH(W);
        var extra = Math.max(0, GH() - neededH);
        L.top = L.top + extra / 2;

        var steps = currentSteps();
        var step  = stepIdx >= 0 ? steps[stepIdx] : steps[0];
        var spec  = computeSpec(step);

        var padX = mob ? 12 : 20;
        drawItemsLegend(padX, L.top, mob, W, spec);
        drawTable(padX, L.top + L.legendH + L.gapMid, mob, spec, step);
    }

    /* ===================== 애니메이션(스텝 전환 타이밍) ===================== */
    function animateStep(onDone) {
        if (rafId) cancelAnimationFrame(rafId);
        draw();
        rafId = requestAnimationFrame(function () {
            rafId = null;
            if (onDone) onDone();
        });
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) {
        speedBtns.forEach(function (b) { b.disabled = v; });
    }

    function defaultLog() {
        return currentSteps()[0].log;
    }

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
                    timer = setTimeout(tick, speed * 0.35);
                }
            });
        }
        tick();
    }

    function vizStep() {
        if (running) return;
        var steps = currentSteps();
        var next  = stepIdx + 1;
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
        speedBtns.forEach(function (b) { b.classList.remove('dp-basic-viz__speed-btn--active'); });
        btn.classList.add('dp-basic-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) {
            modeBtns[d.key].classList.toggle('dp-basic-viz__mode-btn--active', d.key === m);
        });
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
                draw: draw,
            };
        },
    });

    setTimeout(resize, 60);
})();