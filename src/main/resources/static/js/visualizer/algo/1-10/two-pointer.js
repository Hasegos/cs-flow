/**
 * 투 포인터 / 슬라이딩 윈도우 시각화
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
    var root    = el('div', 'two-pointer-viz');
    var toolbar = el('div', 'two-pointer-viz__toolbar');
    var tbLeft  = el('div', 'two-pointer-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'two-pointer-viz__title', 'TWO POINTER'));

    var modeWrap = el('div', 'two-pointer-viz__mode');
    var modeDefs = [
        { key: 'twoptr',   label: '투 포인터' },
        { key: 'window',   label: '슬라이딩 윈도우' },
        { key: 'unsorted', label: '정렬이 필요한 이유' },
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'two-pointer-viz__mode-btn' + (i === 0 ? ' two-pointer-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'two-pointer-viz__speed');
    speedWrap.appendChild(el('span', 'two-pointer-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1400], ['2x', 700], ['3x', 350]].forEach(function (pair, i) {
        var b = el('button', 'two-pointer-viz__speed-btn' + (i === 0 ? ' two-pointer-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'two-pointer-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'two-pointer-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'two-pointer-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'two-pointer-viz__controls');
    var btnPlay  = el('button', 'two-pointer-viz__btn two-pointer-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'two-pointer-viz__btn', '▶| STEP');
    var btnReset = el('button', 'two-pointer-viz__btn', '↺ RESET');
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

    /* ===================== 투 포인터 데이터 & 스텝 (정렬 배열에서 합이 target인 두 수 찾기) ===================== */
    var TP_ARR = [1, 2, 3, 5, 7, 9, 11, 13, 15];
    var TP_TARGET = 9;

    var UNSORTED_ARR = [7, 2, 15, 1, 9, 3, 13, 5, 11];
    var UNSORTED_TARGET = 9;

    function buildTwoPointerSteps(arr, target, opts) {
        opts = opts || {};
        var steps = [];
        var left = 0, right = arr.length - 1;
        var leftMoves = 0, rightMoves = 0;
        steps.push({ type: 'intro', left: left, right: right, sum: null, leftMoves: 0, rightMoves: 0,
            log: opts.introLog || ('PLAY를 눌러보세요. 정렬된 배열 양 끝에서 포인터 둘이 출발해 합이 ' + target + '이 되는 두 수를 찾습니다.') });

        while (left < right) {
            var sum = arr[left] + arr[right];
            var log;
            if (sum === target) {
                log = arr[left] + ' + ' + arr[right] + ' = ' + sum + ' → 목표와 정확히 같아요! 찾았습니다.';
                steps.push({ type: 'found', left: left, right: right, sum: sum, leftMoves: leftMoves, rightMoves: rightMoves, log: log });
                break;
            } else if (sum < target) {
                log = arr[left] + ' + ' + arr[right] + ' = ' + sum + ' → 목표(' + target + ')보다 작아요. 왼쪽 포인터를 오른쪽으로 옮겨 더 큰 값을 시도해요.';
                left++; leftMoves++;
                steps.push({ type: 'move-left', left: left, right: right, sum: sum, leftMoves: leftMoves, rightMoves: rightMoves, log: log });
            } else {
                log = arr[left] + ' + ' + arr[right] + ' = ' + sum + ' → 목표(' + target + ')보다 커요. 오른쪽 포인터를 왼쪽으로 옮겨 더 작은 값을 시도해요.';
                right--; rightMoves++;
                steps.push({ type: 'move-right', left: left, right: right, sum: sum, leftMoves: leftMoves, rightMoves: rightMoves, log: log });
            }
        }
        var last = steps[steps.length - 1];
        if (last.type !== 'found') {
            last.log += opts.notFoundLog || ' 포인터가 서로 만나 더 확인할 쌍이 없어요 — 이 배열엔 답이 없습니다.';
            if (opts.actualPair) last.actualPair = opts.actualPair;
        } else {
            last.log += ' 왼쪽은 ' + leftMoves + '번, 오른쪽은 ' + rightMoves + '번 움직여서 찾았어요 — 둘 다 최대 배열 길이만큼만 움직이니 O(n)입니다.';
        }
        return steps;
    }

    var TWOPTR_STEPS = buildTwoPointerSteps(TP_ARR, TP_TARGET, {});

    var UNSORTED_STEPS = buildTwoPointerSteps(UNSORTED_ARR, UNSORTED_TARGET, {
        introLog: 'PLAY를 눌러보세요. 이번엔 같은 숫자들을 정렬만 안 한 배열에, 완전히 똑같은 투 포인터 로직을 그대로 적용해봅니다.',
        notFoundLog: ' 그런데 이 배열에는 ' + UNSORTED_ARR[0] + ' + ' + UNSORTED_ARR[1] + ' = ' + (UNSORTED_ARR[0] + UNSORTED_ARR[1]) +
            '이라는 답이 실제로 있어요(인덱스 0, 1)! 정렬 안 된 배열에서는 이 로직이 답을 그냥 지나쳐버립니다 — 그래서 투 포인터는 반드시 정렬된 배열에서만 써야 합니다.',
        actualPair: [0, 1],
    });

    /* ===================== 슬라이딩 윈도우 데이터 & 스텝 (합이 target 이상인 최소 길이 구간) ===================== */
    var SW_ARR = [2, 1, 5, 2, 3, 2];
    var SW_TARGET = 7;

    function buildWindowSteps() {
        var steps = [];
        var left = 0, sum = 0, minLen = Infinity, minStart = -1, minEnd = -1;
        steps.push({ type: 'intro', left: 0, right: -1, sum: 0, minLen: null,
            log: 'PLAY를 눌러보세요. 오른쪽 끝을 늘려가며 합이 ' + SW_TARGET + ' 이상이 되면, 왼쪽을 줄일 수 있는 만큼 줄여서 가장 짧은 구간을 찾습니다.' });

        for (var right = 0; right < SW_ARR.length; right++) {
            sum += SW_ARR[right];
            steps.push({ type: 'expand', left: left, right: right, sum: sum, minLen: minLen === Infinity ? null : minLen,
                log: '오른쪽을 ' + right + '번 칸까지 늘려요. 창 안의 합 = ' + sum + '.' });

            while (sum >= SW_TARGET) {
                var curLen = right - left + 1;
                var improved = curLen < minLen;
                if (improved) { minLen = curLen; minStart = left; minEnd = right; }
                var log = '합 ' + sum + ' ≥ 목표(' + SW_TARGET + ') → 이 구간 길이는 ' + curLen + '.' +
                    (improved ? ' 지금까지 가장 짧아요! 기록 갱신.' : ' 이전 기록(' + minLen + ')보다 길어서 기록은 그대로.');
                steps.push({ type: 'check', left: left, right: right, sum: sum, minLen: minLen, log: log });

                sum -= SW_ARR[left];
                left++;
                steps.push({ type: 'shrink', left: left, right: right, sum: sum, minLen: minLen,
                    log: '왼쪽을 한 칸 줄여요. 창 안의 합 = ' + sum + (sum >= SW_TARGET ? ' — 아직 목표 이상이니 계속 줄여봐요.' : ' — 목표보다 작아져서 이제 오른쪽을 늘릴 차례예요.') });
            }
        }
        var last = steps[steps.length - 1];
        last.type = 'done';
        last.log += ' 다 훑었어요! 가장 짧은 구간은 길이 ' + minLen + ' (인덱스 ' + minStart + '~' + minEnd + ', [' +
            SW_ARR.slice(minStart, minEnd + 1).join(', ') + ']) 입니다.';
        return steps;
    }

    var WINDOW_STEPS = buildWindowSteps();

    /* ===================== 상태 변수 ===================== */
    var mode    = 'twoptr';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1400;

    function currentSteps() {
        if (mode === 'twoptr') return TWOPTR_STEPS;
        if (mode === 'window') return WINDOW_STEPS;
        return UNSORTED_STEPS;
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

    /* ===================== 배열 박스 좌표 계산 (항상 한 줄에 들어오도록 동적 크기) ===================== */
    function boxLayout(n, W, mob) {
        var padX = mob ? 14 : 28;
        var gap  = mob ? 5 : 8;
        var plotW = W - 2 * padX;
        var boxW = Math.floor((plotW - (n - 1) * gap) / n);
        boxW = Math.max(mob ? 28 : 40, Math.min(mob ? 48 : 66, boxW));
        var totalW = n * boxW + (n - 1) * gap;
        var x0 = padX + Math.max(0, (plotW - totalW) / 2);
        return { n: n, boxW: boxW, gap: gap, x0: x0, totalW: totalW };
    }

    function idxX(BL, i) { return BL.x0 + i * (BL.boxW + BL.gap); }
    function idxCenterX(BL, i) { return idxX(BL, i) + BL.boxW / 2; }

    /* ===================== 투 포인터 렌더 ===================== */
    function drawTwoPointer(top, mob, W, step, arr, target) {
        var BL = boxLayout(arr.length, W, mob);
        var boxH = mob ? 40 : 50;
        var laneH = mob ? 22 : 26;
        var pointerTop = top;
        var boxTop = pointerTop + laneH + (mob ? 8 : 10);

        var lanes = [];
        if (step.left != null) lanes.push({ idx: step.left, label: 'left', col: P.teal });
        if (step.right != null) lanes.push({ idx: step.right, label: 'right', col: P.purple });
        lanes.forEach(function (ln) {
            var cx = idxCenterX(BL, ln.idx);
            tx(ln.label, cx, pointerTop + laneH / 2, mob ? 11 : 12.5, ln.col + 'ee', 'center', true);
            line(cx, pointerTop + laneH - (mob ? 2 : 3), cx, boxTop - 2, ln.col + '88', 1.4);
        });

        var revealPair = step.actualPair || null;

        for (var i = 0; i < arr.length; i++) {
            var bx = idxX(BL, i);
            var isLeft = step.left === i, isRight = step.right === i;
            var col = P.muted, fillA = '10', strokeA = '40', lw = 1.2, emph = false;
            if (step.type === 'found' && (isLeft || isRight)) { col = P.green; fillA = '28'; strokeA = 'ee'; lw = 2.4; emph = true; }
            else if (isLeft) { col = P.teal; fillA = '22'; strokeA = 'ee'; lw = 2; emph = true; }
            else if (isRight) { col = P.purple; fillA = '22'; strokeA = 'ee'; lw = 2; emph = true; }
            else if (step.left != null && step.right != null && i > step.left && i < step.right) { col = P.text; fillA = '08'; strokeA = '30'; }

            rr(bx, boxTop, BL.boxW, boxH, 4, col + fillA, col + strokeA, lw);
            tx(String(arr[i]), bx + BL.boxW / 2, boxTop + boxH / 2, mob ? 13 : 15, P.text + (emph ? 'ff' : 'aa'), 'center', emph);
            tx(String(i), bx + BL.boxW / 2, boxTop + boxH + (mob ? 12 : 14), mob ? 8 : 9, P.text + '66', 'center', false);

            if (revealPair && (i === revealPair[0] || i === revealPair[1])) {
                ctx.save();
                ctx.setLineDash([4, 3]);
                rr(bx - 3, boxTop - 3, BL.boxW + 6, boxH + 6, 6, 'none', P.orange + 'dd', 2);
                ctx.restore();
            }
        }

        var revealExtra = revealPair ? (mob ? 22 : 26) : 0;
        if (revealPair) {
            var midX = (idxCenterX(BL, revealPair[0]) + idxCenterX(BL, revealPair[1])) / 2;
            tx('놓친 정답이 여기 있었어요!', midX, boxTop + boxH + (mob ? 15 : 17), mob ? 9.5 : 10.5, P.orange + 'ee', 'center', true);
        }

        var statusTop = boxTop + boxH + (mob ? 26 : 30) + revealExtra;
        var fStat = mob ? 11 : 12.5;
        if (step.sum != null) {
            var sumCol = step.type === 'found' ? P.green : P.orange;
            tx('현재 합: ' + step.sum + '   목표: ' + target, BL.x0, statusTop, fStat, sumCol + 'ee', 'left', true);
        } else {
            tx('목표: ' + target, BL.x0, statusTop, fStat, P.text + 'aa', 'left', true);
        }
        var moveTxt = '왼쪽 이동 ' + (step.leftMoves || 0) + '번   오른쪽 이동 ' + (step.rightMoves || 0) + '번';
        tx(moveTxt, BL.x0, statusTop + (mob ? 20 : 24), fStat, P.teal + 'ee', 'left', true);
    }

    /* ===================== 슬라이딩 윈도우 렌더 ===================== */
    function drawWindow(top, mob, W, step) {
        var BL = boxLayout(SW_ARR.length, W, mob);
        var boxH = mob ? 44 : 56;
        var bandH = mob ? 18 : 22;
        var bandTop = top;
        var boxTop = bandTop + bandH + (mob ? 10 : 12);

        if (step.right >= step.left && step.right >= 0) {
            var bx0 = idxX(BL, step.left) - BL.gap / 2;
            var bx1 = idxX(BL, step.right) + BL.boxW + BL.gap / 2;
            rr(bx0, bandTop, bx1 - bx0, bandH, 4, P.orange + '20', P.orange + 'aa', 1.4);
            tx('창(윈도우)', (bx0 + bx1) / 2, bandTop + bandH / 2, mob ? 9 : 10, P.orange + 'ee', 'center', true);
        }

        for (var i = 0; i < SW_ARR.length; i++) {
            var bx = idxX(BL, i);
            var inWindow = i >= step.left && i <= step.right;
            var col = inWindow ? P.orange : P.muted;
            var fillA = inWindow ? '20' : '0a', strokeA = inWindow ? 'ee' : '30', lw = inWindow ? 2 : 1.2;
            if (step.type === 'done' && i >= 0) {
            }
            rr(bx, boxTop, BL.boxW, boxH, 4, col + fillA, col + strokeA, lw);
            tx(String(SW_ARR[i]), bx + BL.boxW / 2, boxTop + boxH / 2, mob ? 14 : 16, P.text + (inWindow ? 'ff' : '99'), 'center', inWindow);
            tx(String(i), bx + BL.boxW / 2, boxTop + boxH + (mob ? 12 : 14), mob ? 8 : 9, P.text + '66', 'center', false);
        }

        var statusTop = boxTop + boxH + (mob ? 26 : 30);
        var fStat = mob ? 11 : 12.5;
        var sumCol = step.sum >= SW_TARGET ? P.green : P.orange;
        tx('창의 합: ' + step.sum + '   목표: ' + SW_TARGET + ' 이상', BL.x0, statusTop, fStat, sumCol + 'ee', 'left', true);
        var recordTxt = step.minLen != null ? ('최소 길이 기록: ' + step.minLen) : '최소 길이 기록: 아직 없음';
        tx(recordTxt, BL.x0, statusTop + (mob ? 20 : 24), fStat, P.teal + 'ee', 'left', true);
    }

    /* ===================== 레이아웃 ===================== */
    function getLayout(mob) {
        return {
            top:  mob ? 18 : 24,
            bodyH: mob ? 190 : 230,
        };
    }

    /* ===================== resize ===================== */
    function calcH(W) {
        var mob = W < 600;
        var L = getLayout(mob);
        return L.top + L.bodyH + L.top;
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

        if (mode === 'twoptr') {
            drawTwoPointer(L.top, mob, W, step, TP_ARR, TP_TARGET);
        } else if (mode === 'window') {
            drawWindow(L.top, mob, W, step);
        } else {
            drawTwoPointer(L.top, mob, W, step, UNSORTED_ARR, UNSORTED_TARGET);
        }
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
        speedBtns.forEach(function (b) { b.classList.remove('two-pointer-viz__speed-btn--active'); });
        btn.classList.add('two-pointer-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) {
            modeBtns[d.key].classList.toggle('two-pointer-viz__mode-btn--active', d.key === m);
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