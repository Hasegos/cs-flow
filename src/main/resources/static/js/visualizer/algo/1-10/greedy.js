/**
 * 그리디(Greedy) 알고리즘 시각화
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
    var root    = el('div', 'greedy-viz');
    var toolbar = el('div', 'greedy-viz__toolbar');
    var tbLeft  = el('div', 'greedy-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'greedy-viz__title', 'GREEDY'));

    var modeWrap = el('div', 'greedy-viz__mode');
    var modeDefs = [
        { key: 'coin',     label: '거스름돈' },
        { key: 'activity', label: '활동 선택' },
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'greedy-viz__mode-btn' + (i === 0 ? ' greedy-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'greedy-viz__speed');
    speedWrap.appendChild(el('span', 'greedy-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1400], ['2x', 700], ['3x', 350]].forEach(function (pair, i) {
        var b = el('button', 'greedy-viz__speed-btn' + (i === 0 ? ' greedy-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'greedy-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'greedy-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'greedy-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'greedy-viz__controls');
    var btnPlay  = el('button', 'greedy-viz__btn greedy-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'greedy-viz__btn', '▶| STEP');
    var btnReset = el('button', 'greedy-viz__btn', '↺ RESET');
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

    /* ===================== 거스름돈 데이터 & 스텝 (실제 그리디 실행) ===================== */
    var COINS  = [500, 100, 50, 10];
    var TARGET = 860;

    function buildCoinSteps() {
        var steps = [];
        var remaining = TARGET;
        var picked = [];
        steps.push({ type: 'intro', remaining: remaining, picked: [], coin: null,
            log: 'PLAY를 눌러 ' + TARGET + '원을 큰 동전부터 그리디하게 거슬러주는 과정을 확인하세요.' });

        COINS.forEach(function (coin) {
            while (remaining >= coin) {
                picked.push(coin);
                remaining -= coin;
                var isDone = remaining === 0;
                steps.push({ type: isDone ? 'done' : 'pick', coin: coin, remaining: remaining, picked: picked.slice(),
                    log: coin + '원 동전을 하나 사용합니다 → 남은 금액 ' + remaining + '원' + (isDone ? ' — 다 거슬러줬습니다!' : '') });
            }
        });
        steps[steps.length - 1].log += ' 총 ' + picked.length + '개의 동전(' + picked.join(', ') + ')을 사용했습니다. ' +
            '한국 동전처럼 큰 단위가 작은 단위의 배수일 때는, 매번 "지금 쓸 수 있는 가장 큰 동전"만 골라도 항상 최소 개수가 됩니다.';
        return steps;
    }

    var COIN_STEPS = buildCoinSteps();

    /* ===================== 활동 선택 데이터 & 스텝 (실제 그리디 실행) ===================== */
    var ACTIVITIES = [
        { name: 'A', s: 1, e: 3 },
        { name: 'B', s: 2, e: 5 },
        { name: 'C', s: 4, e: 7 },
        { name: 'D', s: 1, e: 8 },
        { name: 'E', s: 5, e: 9 },
        { name: 'F', s: 8, e: 10 },
    ];
    var SORTED_ACTS = ACTIVITIES.slice().sort(function (a, b) { return a.e - b.e; });

    function buildActivitySteps() {
        var steps = [];
        var lastEnd = -1;
        var selected = [];
        steps.push({ type: 'intro', idx: -1, lastEnd: -1, selected: [], rejected: [],
            log: 'PLAY를 눌러 활동들을 "끝나는 시간이 빠른 순"으로 하나씩 검토하며, 겹치지 않으면 선택하는 과정을 확인하세요.' });

        var rejected = [];
        SORTED_ACTS.forEach(function (a, idx) {
            var ok = a.s >= lastEnd;
            var log;
            if (ok) {
                log = '활동 ' + a.name + '(' + a.s + '~' + a.e + ') → 시작 시간(' + a.s + ')이 마지막 선택 활동의 종료 시간(' +
                    (lastEnd < 0 ? '없음' : lastEnd) + ')보다 늦거나 같아 겹치지 않습니다. 선택합니다!';
                selected.push(a.name);
                lastEnd = a.e;
            } else {
                log = '활동 ' + a.name + '(' + a.s + '~' + a.e + ') → 시작 시간(' + a.s + ')이 마지막 선택 활동의 종료 시간(' + lastEnd + ')보다 빨라 겹칩니다. 제외합니다.';
                rejected.push(a.name);
            }
            var isLast = idx === SORTED_ACTS.length - 1;
            steps.push({ type: isLast ? 'done' : (ok ? 'select' : 'skip'), idx: idx, cur: a.name, lastEnd: lastEnd,
                selected: selected.slice(), rejected: rejected.slice(), log: log });
        });
        steps[steps.length - 1].log += ' 총 ' + selected.length + '개(' + selected.join(', ') + ')를 선택했습니다 — 이것이 이 문제의 최대 개수입니다.';
        return steps;
    }

    var ACTIVITY_STEPS = buildActivitySteps();

    /* ===================== 상태 변수 ===================== */
    var mode    = 'coin';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1400;

    function currentSteps() {
        return mode === 'coin' ? COIN_STEPS : ACTIVITY_STEPS;
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

    /* ===================== 거스름돈 렌더 ===================== */
    function drawCoinView(x0, top, w, mob, step) {
        var fLbl = mob ? 11 : 12, fBig = mob ? 22 : 28;

        tx('남은 금액', x0, top, mob ? 10 : 11, P.muted + 'aa', 'left', true);
        tx(step.remaining + '원', x0, top + (mob ? 26 : 30), fBig, step.remaining === 0 ? P.green + 'ee' : P.orange + 'ee', 'left', true);

        var row1Y = top + (mob ? 56 : 66);
        tx('동전 종류 (큰 것부터 확인)', x0, row1Y, mob ? 9 : 10, P.muted + 'aa', 'left', true);
        var chipY = row1Y + (mob ? 14 : 16);
        var chipH = mob ? 30 : 34, gap = mob ? 8 : 10;
        var x = x0;
        COINS.forEach(function (coin) {
            var isCur = step.coin === coin;
            var label = coin + '원';
            var cw = textWidth(label, fLbl, true) + (mob ? 20 : 26);
            var col = isCur ? P.orange : P.muted;
            rr(x, chipY, cw, chipH, 5, col + (isCur ? '28' : '10'), col + (isCur ? 'ee' : '55'), isCur ? 2.2 : 1.2);
            tx(label, x + cw / 2, chipY + chipH / 2, fLbl, isCur ? P.orange + 'ee' : P.text + 'bb', 'center', isCur);
            x += cw + gap;
        });

        var row2Y = chipY + chipH + (mob ? 22 : 26);
        tx('사용한 동전 (' + step.picked.length + '개)', x0, row2Y, mob ? 9 : 10, P.muted + 'aa', 'left', true);
        var chip2Y = row2Y + (mob ? 14 : 16);
        if (step.picked.length === 0) {
            tx('(아직 없음)', x0, chip2Y + chipH / 2, fLbl, P.text + '66', 'left', false);
        } else {
            var x2 = x0;
            var maxW = w - x0;
            var lineGap = chipH + (mob ? 8 : 10);
            var yy = chip2Y;
            step.picked.forEach(function (coin, idx) {
                var label = coin + '원';
                var cw2 = textWidth(label, fLbl, true) + (mob ? 18 : 22);
                if (x2 + cw2 > x0 + maxW && x2 > x0) { x2 = x0; yy += lineGap; }
                var isLastPicked = idx === step.picked.length - 1;
                var col2 = isLastPicked ? P.orange : P.green;
                rr(x2, yy, cw2, chipH, 5, col2 + '20', col2 + 'ee', isLastPicked ? 2 : 1.4);
                tx(label, x2 + cw2 / 2, yy + chipH / 2, fLbl, col2 + 'ee', 'center', true);
                x2 += cw2 + gap;
            });
        }
    }

    /* ===================== 활동 선택 렌더 ===================== */
    function drawActivityView(x0, top, w, mob, step) {
        var maxT = 10;
        var padR = mob ? 12 : 24;
        var plotW = w - x0 - padR;
        var rowH = mob ? 34 : 40;
        var barH = mob ? 20 : 24;
        var fLbl = mob ? 10 : 11;

        function tPx(t) { return x0 + (t / maxT) * plotW; }

        var axisY = top - (mob ? 6 : 8);
        for (var t = 0; t <= maxT; t += 2) {
            line(tPx(t), axisY, tPx(t), axisY + 4, P.muted + '77', 1);
            tx(String(t), tPx(t), axisY - (mob ? 8 : 9), mob ? 8 : 9, P.text + '77', 'center', false);
        }

        if (step.lastEnd >= 0) {
            var lx = tPx(step.lastEnd);
            ctx.save();
            ctx.setLineDash([5, 4]);
            line(lx, top, lx, top + rowH * SORTED_ACTS.length, P.green + 'aa', 2);
            ctx.restore();

            var baseLblSz = mob ? 10 : 11;
            var baseLbl = '기준선(' + step.lastEnd + ')';
            var halfW = textWidth(baseLbl, baseLblSz, true) / 2 + 2;
            var lblX = Math.min(Math.max(lx, x0 + halfW), x0 + plotW - halfW);
            tx(baseLbl, lblX, top - (mob ? 30 : 34), baseLblSz, P.green + 'ee', 'center', true);
        }

        SORTED_ACTS.forEach(function (a, idx) {
            var ry = top + idx * rowH + (rowH - barH) / 2;
            var bx = tPx(a.s), bw = tPx(a.e) - tPx(a.s);
            var isCur = step.idx === idx;
            var isSel = step.selected.indexOf(a.name) >= 0;
            var isRej = step.rejected.indexOf(a.name) >= 0;

            var col = P.muted, fillA = '14', strokeA = '55', lw = 1.2;
            if (isSel) { col = P.green; fillA = '28'; strokeA = 'ee'; lw = 1.6; }
            if (isRej) { col = P.muted; fillA = '0a'; strokeA = '40'; lw = 1.2; }
            if (isCur) { col = P.orange; fillA = '30'; strokeA = 'ee'; lw = 2.4; }

            rr(bx, ry, Math.max(bw, 4), barH, 4, col + fillA, col + strokeA, lw);
            tx(a.name + ' (' + a.s + '~' + a.e + ')', bx + Math.max(bw, 4) / 2, ry + barH / 2, fLbl,
                (isSel || isCur) ? P.text + 'ee' : P.text + '77', 'center', isSel || isCur);

            if (isSel || isRej || isCur) {
                var bR = mob ? 9 : 10;
                var bcx = bx - bR * 0.6, bcy = ry;
                ctx.beginPath(); ctx.arc(bcx, bcy, bR, 0, Math.PI * 2);
                ctx.fillStyle = (isSel ? P.green : (isCur ? P.orange : P.muted)) + 'ee';
                ctx.fill();
                tx(String(idx + 1), bcx, bcy, mob ? 8 : 9, '#0f0f1a', 'center', true);
            }
        });
    }

    /* ===================== 레이아웃 ===================== */
    function getLayout(mob) {
        return {
            top:      mob ? 16 : 22,
            coinH:    mob ? 190 : 210,
            actRowH:  mob ? 34 : 40,
            actTopPad: mob ? 44 : 50,
        };
    }

    /* ===================== resize ===================== */
    function calcH(W) {
        var mob = W < 600;
        var L = getLayout(mob);
        if (mode === 'coin') return L.top + L.coinH + L.top;
        return L.top + L.actTopPad + ACTIVITIES.length * L.actRowH + L.top;
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

        var padX = mob ? 12 : 24;
        if (mode === 'coin') {
            drawCoinView(padX, L.top, W - padX, mob, step);
        } else {
            drawActivityView(padX, L.top + L.actTopPad, W, mob, step);
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
        speedBtns.forEach(function (b) { b.classList.remove('greedy-viz__speed-btn--active'); });
        btn.classList.add('greedy-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) {
            modeBtns[d.key].classList.toggle('greedy-viz__mode-btn--active', d.key === m);
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