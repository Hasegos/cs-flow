/**
 * 이진 탐색(Binary Search) 시각화 — low/mid/high 포인터 이동 + 선형 탐색과의 비교
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
    var root    = el('div', 'binary-search-viz');
    var toolbar = el('div', 'binary-search-viz__toolbar');
    var tbLeft  = el('div', 'binary-search-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'binary-search-viz__title', 'SEARCH'));

    var modeWrap = el('div', 'binary-search-viz__mode');
    var modeDefs = [
        { key: 'binary',  label: '이진 탐색' },
        { key: 'compare', label: '선형 탐색과 비교' },
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'binary-search-viz__mode-btn' + (i === 0 ? ' binary-search-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'binary-search-viz__speed');
    speedWrap.appendChild(el('span', 'binary-search-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1600], ['2x', 800], ['3x', 500]].forEach(function (pair, i) {
        var b = el('button', 'binary-search-viz__speed-btn' + (i === 0 ? ' binary-search-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'binary-search-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'binary-search-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'binary-search-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'binary-search-viz__controls');
    var btnPlay  = el('button', 'binary-search-viz__btn binary-search-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'binary-search-viz__btn', '▶| STEP');
    var btnReset = el('button', 'binary-search-viz__btn', '↺ RESET');
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

    /* ===================== 데이터 (정렬된 배열 16개, target=52) ===================== */
    var ARR    = [2, 5, 8, 12, 16, 19, 23, 27, 31, 34, 38, 41, 45, 49, 52, 56];
    var TARGET = 52;

    /* ===================== 이진 탐색 스텝 (실제 알고리즘을 실행하며 기록) ===================== */
    function buildBinarySteps() {
        var steps = [];
        steps.push({ type: 'intro', low: 0, high: ARR.length - 1, mid: -1, count: 0,
            log: 'PLAY를 눌러 정렬된 배열 16개에서 이진 탐색으로 target=' + TARGET + '을 찾는 과정을 확인하세요.' });

        var low = 0, high = ARR.length - 1, count = 0;
        while (low <= high) {
            var mid = Math.floor((low + high) / 2);
            var val = ARR[mid];
            count++;
            var rangeSize = high - low + 1;
            if (val === TARGET) {
                steps.push({ type: 'found', low: low, high: high, mid: mid, count: count,
                    log: '범위 크기 ' + rangeSize + ' (인덱스 ' + low + '~' + high + ') → mid=' + mid + ', arr[mid]=' + val +
                        ' → target과 정확히 일치! 총 ' + count + '번 비교 만에 발견했습니다.' });
                break;
            } else if (val < TARGET) {
                steps.push({ type: 'go-right', low: low, high: high, mid: mid, count: count,
                    log: '범위 크기 ' + rangeSize + ' (인덱스 ' + low + '~' + high + ') → mid=' + mid + ', arr[mid]=' + val +
                        ' < target(' + TARGET + ') → 오른쪽 절반만 다시 탐색합니다.' });
                low = mid + 1;
            } else {
                steps.push({ type: 'go-left', low: low, high: high, mid: mid, count: count,
                    log: '범위 크기 ' + rangeSize + ' (인덱스 ' + low + '~' + high + ') → mid=' + mid + ', arr[mid]=' + val +
                        ' > target(' + TARGET + ') → 왼쪽 절반만 다시 탐색합니다.' });
                high = mid - 1;
            }
        }

        var last = steps[steps.length - 1];
        steps.push({ type: 'done', low: last.low, high: last.high, mid: last.mid, count: last.count,
            log: '이진 탐색은 매 단계마다 탐색 범위를 절반으로 줄이므로 O(log n) 시간이 걸립니다. "선형 탐색과 비교" 탭에서 같은 target을 ' +
                '하나씩 확인하면 몇 번이 걸리는지 비교해보세요.' });
        return steps;
    }

    /* ===================== 선형 탐색 스텝 (같은 배열, 같은 target) ===================== */
    function buildLinearSteps() {
        var steps = [];
        steps.push({ type: 'intro', i: -1, count: 0,
            log: 'PLAY를 눌러 같은 배열, 같은 target=' + TARGET + '을 처음부터 하나씩 확인하는 선형 탐색과 비교해보세요.' });

        for (var i = 0; i < ARR.length; i++) {
            var val = ARR[i];
            var count = i + 1;
            if (val === TARGET) {
                steps.push({ type: 'found', i: i, count: count,
                    log: '인덱스 ' + i + ': arr[' + i + ']=' + val + ' → target과 일치! 선형 탐색은 총 ' + count +
                        '번 비교 만에 찾았습니다 (이진 탐색은 단 4번).' });
                break;
            } else {
                steps.push({ type: 'check', i: i, count: count,
                    log: '인덱스 ' + i + ': arr[' + i + ']=' + val + ' vs target(' + TARGET + ') → 다르므로 다음 칸으로 이동합니다.' });
            }
        }

        var last = steps[steps.length - 1];
        steps.push({ type: 'done', i: last.i, count: last.count,
            log: '정렬된 배열 16개에서 이진 탐색은 4번, 선형 탐색은 15번 비교했습니다. 데이터가 n=1,000,000개로 늘어나면 이진 탐색은 약 ' +
                '20번이면 충분하지만, 선형 탐색은 최악의 경우 1,000,000번까지 걸릴 수 있습니다.' });
        return steps;
    }

    var BINARY_STEPS = buildBinarySteps();
    var LINEAR_STEPS = buildLinearSteps();

    /* ===================== 상태 변수 ===================== */
    var mode    = 'binary';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1600;

    function currentSteps() {
        return mode === 'binary' ? BINARY_STEPS : LINEAR_STEPS;
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

    function textWidth(str, sz, bold) {
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        return ctx.measureText(str).width;
    }

    function line(x1, y1, x2, y2, col, lw) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = col; ctx.lineWidth = lw || 1.5;
        ctx.stroke();
    }

    /* ===================== 배열 박스 좌표 계산 (항상 한 줄에 들어오도록 동적 크기) ===================== */
    function boxLayout(W, mob) {
        var n = ARR.length;
        var padX = mob ? 12 : 24;
        var gap  = mob ? 3 : 5;
        var plotW = W - 2 * padX;
        var boxW = Math.floor((plotW - (n - 1) * gap) / n);
        boxW = Math.max(mob ? 15 : 20, Math.min(mob ? 30 : 46, boxW));
        var totalW = n * boxW + (n - 1) * gap;
        var x0 = padX + Math.max(0, (plotW - totalW) / 2);
        return { n: n, boxW: boxW, gap: gap, x0: x0, totalW: totalW };
    }

    function boxCenterX(BL, i) { return BL.x0 + i * (BL.boxW + BL.gap) + BL.boxW / 2; }

    /* ===================== low/mid/high 포인터 (고정 레인, 겹침 방지) ===================== */
    function drawPointers(BL, top, mob, step, blockH) {
        var laneH = mob ? 16 : 18;
        if (mode === 'binary') {
            var lanes = [
                { idx: step.low,  label: 'low',  col: P.teal },
                { idx: step.mid,  label: 'mid',  col: P.orange },
                { idx: step.high, label: 'high', col: P.purple },
            ];
            lanes.forEach(function (ln, li) {
                if (ln.idx == null || ln.idx < 0) return;
                var cx = boxCenterX(BL, ln.idx);
                var ly = top + li * laneH + laneH / 2;
                tx(ln.label, cx, ly, mob ? 10 : 12, ln.col + 'ee', 'center', true);
                line(cx, ly + (mob ? 6 : 7), cx, top + blockH, ln.col + '88', 1.4);
            });
        } else {
            if (step.i != null && step.i >= 0) {
                var cx2 = boxCenterX(BL, step.i);
                var ly2 = top + laneH / 2;
                tx('i', cx2, ly2, mob ? 10 : 12, P.orange + 'ee', 'center', true);
                line(cx2, ly2 + (mob ? 6 : 7), cx2, top + blockH, P.orange + '88', 1.4);
            }
        }
    }

    /* ===================== 배열 박스 렌더 ===================== */
    function drawArrayRow(BL, top, mob, step) {
        var boxH = mob ? 34 : 44;
        var fVal = mob ? 11 : 13;
        var fIdx = mob ? 8 : 9;

        for (var i = 0; i < BL.n; i++) {
            var bx = BL.x0 + i * (BL.boxW + BL.gap);
            var col, fillA, strokeA, lw, emph, textA;

            if (mode === 'binary') {
                if (step.type === 'found' && step.mid === i) {
                    col = P.green; fillA = '28'; strokeA = 'ee'; lw = 2.4; emph = true; textA = 'ee';
                } else if (step.mid === i) {
                    col = P.orange; fillA = '28'; strokeA = 'ee'; lw = 2.4; emph = true; textA = 'ee';
                } else if (step.low != null && i >= step.low && i <= step.high) {
                    col = P.teal; fillA = '14'; strokeA = '99'; lw = 1.4; emph = false; textA = 'dd';
                } else {
                    col = P.muted; fillA = '08'; strokeA = '40'; lw = 1.2; emph = false; textA = '55';
                }
            } else {
                if (step.type === 'found' && step.i === i) {
                    col = P.green; fillA = '28'; strokeA = 'ee'; lw = 2.4; emph = true; textA = 'ee';
                } else if (step.i === i) {
                    col = P.orange; fillA = '28'; strokeA = 'ee'; lw = 2.4; emph = true; textA = 'ee';
                } else if (step.i != null && i < step.i) {
                    col = P.muted; fillA = '10'; strokeA = '55'; lw = 1.2; emph = false; textA = '66';
                } else {
                    col = P.muted; fillA = '00'; strokeA = '30'; lw = 1.2; emph = false; textA = '55';
                }
            }

            rr(bx, top, BL.boxW, boxH, 4, col + fillA, col + strokeA, lw);
            tx(String(ARR[i]), bx + BL.boxW / 2, top + boxH / 2, fVal, P.text + textA, 'center', emph);
            tx(String(i), bx + BL.boxW / 2, top + boxH + (mob ? 10 : 11), fIdx, P.text + '66', 'center', false);
        }
        return boxH;
    }

    /* ===================== 하단 카운트 패널 ===================== */
    function drawCountPanel(BL, top, mob, step) {
        var fLbl = mob ? 10 : 11;
        if (mode === 'binary') {
            var cnt = step.count || 0;
            tx('비교 횟수: ' + cnt + ' / 최대 4회 (log₂16)', BL.x0, top + (mob ? 10 : 12), fLbl, P.orange + 'dd', 'left', true);
        } else {
            var maxScale = ARR.length;
            var labelW = mob ? 70 : 90;
            var barMaxW = Math.max(60, BL.totalW - labelW - (mob ? 50 : 70));
            var rowH = mob ? 22 : 26;
            var rows = [
                { label: '이진 탐색', value: 4,             sub: '4회 (고정)',            col: P.purple },
                { label: '선형 탐색', value: step.count || 0, sub: (step.count || 0) + '회', col: P.orange },
            ];

            tx('비교 횟수 비교', BL.x0, top, fLbl, P.muted + 'aa', 'left', true);
            var rowsTop = top + (mob ? 16 : 20);
            rows.forEach(function (r, i) {
                var ry = rowsTop + i * rowH;
                tx(r.label, BL.x0, ry, fLbl, P.text + 'dd', 'left', true);
                var barX = BL.x0 + labelW;
                var barW = Math.max(4, (r.value / maxScale) * barMaxW);
                rr(barX, ry - (mob ? 7 : 8), barW, mob ? 14 : 16, 3, r.col + '55', r.col + 'ee', 1.4);
                tx(r.sub, barX + barMaxW + 10, ry, mob ? 9 : 10, P.text + '99', 'left', false);
            });
        }
    }

    /* ===================== 레이아웃 상수 ===================== */
    function laneCount() { return mode === 'binary' ? 3 : 1; }

    function countPanelH(mob) {
        return mode === 'binary' ? (mob ? 30 : 34) : (mob ? 70 : 82);
    }

    function getLayout(mob) {
        return {
            top:      mob ? 18 : 24,
            laneH:    mob ? 16 : 18,
            gapAfterPointers: mob ? 8 : 10,
            boxH:     mob ? 34 : 44,
            labelH:   mob ? 16 : 18,
            gapAfterArray: mob ? 14 : 16,
            countH:   countPanelH(mob),
        };
    }

    /* ===================== resize ===================== */
    function calcH(W) {
        var mob = W < 600;
        var L = getLayout(mob);
        var pointerBlockH = laneCount() * L.laneH;
        return L.top + pointerBlockH + L.gapAfterPointers + L.boxH + L.labelH + L.gapAfterArray + L.countH + L.top;
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
        var BL = boxLayout(W, mob);

        var pointerBlockH = laneCount() * L.laneH;
        drawPointers(BL, L.top, mob, step, pointerBlockH);

        var arrTop = L.top + pointerBlockH + L.gapAfterPointers;
        var boxH = drawArrayRow(BL, arrTop, mob, step);

        var countTop = arrTop + boxH + L.labelH + L.gapAfterArray;
        drawCountPanel(BL, countTop, mob, step);
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
                    timer = setTimeout(tick, speed * 0.4);
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
        speedBtns.forEach(function (b) { b.classList.remove('binary-search-viz__speed-btn--active'); });
        btn.classList.add('binary-search-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) {
            modeBtns[d.key].classList.toggle('binary-search-viz__mode-btn--active', d.key === m);
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