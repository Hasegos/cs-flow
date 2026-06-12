/**
 * 스택 / 큐 시각화
 */
(function () {
    'use strict';

    var container = document.getElementById('visualizer-container');
    if (!container) return;

    function el(tag, cls, txt) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (txt) e.textContent = txt;
        return e;
    }

    /* ===================== DOM 구성 ===================== */
    var root    = el('div', 'sq-viz');
    var toolbar = el('div', 'sq-viz__toolbar');
    var tbLeft  = el('div', 'sq-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'sq-viz__title', 'Stack / Queue'));

    var modeWrap   = el('div', 'sq-viz__mode');
    var modeStack  = el('button', 'sq-viz__mode-btn sq-viz__mode-btn--active', 'Stack');
    var modeQueue  = el('button', 'sq-viz__mode-btn', 'Queue');
    modeStack.addEventListener('click', function () { if (!running) switchMode('stack'); });
    modeQueue.addEventListener('click', function () { if (!running) switchMode('queue'); });
    modeWrap.appendChild(modeStack);
    modeWrap.appendChild(modeQueue);
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'sq-viz__speed');
    speedWrap.appendChild(el('span', 'sq-viz__speed-label', 'SPEED'));
    [['1x', 1800], ['2x', 900], ['3x', 600]].forEach(function (pair, i) {
        var b = el('button', 'sq-viz__speed-btn' + (i === 0 ? ' sq-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'sq-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'sq-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'sq-viz__log', '▶ PLAY를 눌러 동작을 확인하세요.');
    root.appendChild(logEl);

    var controls = el('div', 'sq-viz__controls');
    var btnPlay  = el('button', 'sq-viz__btn sq-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'sq-viz__btn', '▶| STEP');
    var btnReset = el('button', 'sq-viz__btn', '↺ RESET');
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

    /* ===================== resize ===================== */
    function calcH(W) {
        var mob = W < 600;
        if (mode === 'stack') {
            var slotH = mob ? 48 : 58;
            var opLblH = mob ? 20 : 22;
            return (mob ? 24 : 32) + (mob ? 22 : 28) + opLblH + slotH * 6 + (mob ? 50 : 60) + (mob ? 20 : 24);
        } else {
            var slotH    = mob ? 60 : 72;
            var ptrAreaH = mob ? 46 : 56;
            return (mob ? 24 : 32)
                 + (mob ? 22 : 28)
                 + ptrAreaH
                 + slotH
                 + (mob ? 22 : 26)
                 + (mob ? 30 : 36)
                 + (mob ? 22 : 26)
                 + (mob ? 24 : 32);
        }    }

    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var h = calcH(w);
        canvasWrap.style.height    = h + 'px';
        canvasWrap.style.minHeight = h + 'px';
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    var P = window.CsFlow.getP();

    /* ===================== 스택 시나리오 ===================== */
    var STACK_STEPS = [
        {
            log: '초기 상태. 빈 스택입니다. top = -1. 스택은 배열 또는 연결 리스트로 구현하며, 항상 top에서만 삽입·삭제가 일어납니다.',
            slots: ['', '', '', '', '', ''],
            top: -1, action: null, activeIdx: -1,
        },
        {
            log: 'Push(10). top을 0으로 올리고 슬롯[0]에 10을 저장합니다. top = 0. 시간복잡도 O(1).',
            slots: ['10', '', '', '', '', ''],
            top: 0, action: 'push', activeIdx: 0,
        },
        {
            log: 'Push(20). top을 1로 올리고 슬롯[1]에 20을 저장합니다. top = 1. 시간복잡도 O(1).',
            slots: ['10', '20', '', '', '', ''],
            top: 1, action: 'push', activeIdx: 1,
        },
        {
            log: 'Push(30). top을 2로 올리고 슬롯[2]에 30을 저장합니다. top = 2. 시간복잡도 O(1).',
            slots: ['10', '20', '30', '', '', ''],
            top: 2, action: 'push', activeIdx: 2,
        },
        {
            log: 'Peek(). top 위치의 값 30을 반환합니다. 제거하지 않습니다. top = 2 (변화 없음). 시간복잡도 O(1).',
            slots: ['10', '20', '30', '', '', ''],
            top: 2, action: 'peek', activeIdx: 2,
        },
        {
            log: 'Pop(). top 위치의 값 30을 꺼내고 top을 1로 낮춥니다. 반환값: 30. top = 1. 시간복잡도 O(1).',
            slots: ['10', '20', '', '', '', ''],
            top: 1, action: 'pop', activeIdx: 2,
        },
        {
            log: 'Pop(). top 위치의 값 20을 꺼내고 top을 0으로 낮춥니다. 반환값: 20. top = 0. 시간복잡도 O(1).',
            slots: ['10', '', '', '', '', ''],
            top: 0, action: 'pop', activeIdx: 1,
        },
        {
            log: 'Push(40). top을 1로 올리고 슬롯[1]에 40을 저장합니다. LIFO — 가장 나중에 넣은 값이 가장 먼저 나옵니다. top = 1.',
            slots: ['10', '40', '', '', '', ''],
            top: 1, action: 'push', activeIdx: 1,
        },
    ];

    /* ===================== 큐 시나리오 ===================== */
    var QUEUE_STEPS = [
        {
            log: '초기 상태. 빈 큐입니다 (용량: 6). front = 0, rear = 0. 큐는 배열 또는 연결 리스트로 구현하며, front에서 꺼내고 rear에 넣습니다.',
            slots: ['', '', '', '', '', ''],
            front: 0, rear: 0, size: 0, action: null, activeIdx: -1,
        },
        {
            log: 'Enqueue(10). rear 위치(0)에 10을 저장하고 rear를 1로 이동합니다. front = 0, rear = 1. 시간복잡도 O(1).',
            slots: ['10', '', '', '', '', ''],
            front: 0, rear: 1, size: 1, action: 'enqueue', activeIdx: 0,
        },
        {
            log: 'Enqueue(20). rear 위치(1)에 20을 저장하고 rear를 2로 이동합니다. front = 0, rear = 2. 시간복잡도 O(1).',
            slots: ['10', '20', '', '', '', ''],
            front: 0, rear: 2, size: 2, action: 'enqueue', activeIdx: 1,
        },
        {
            log: 'Enqueue(30). rear 위치(2)에 30을 저장하고 rear를 3으로 이동합니다. front = 0, rear = 3. 시간복잡도 O(1).',
            slots: ['10', '20', '30', '', '', ''],
            front: 0, rear: 3, size: 3, action: 'enqueue', activeIdx: 2,
        },
        {
            log: 'Dequeue(). front 위치(0)의 값 10을 꺼내고 front를 1로 이동합니다. 반환값: 10. front = 1, rear = 3. FIFO — 먼저 넣은 값이 먼저 나옵니다.',
            slots: ['', '20', '30', '', '', ''],
            front: 1, rear: 3, size: 2, action: 'dequeue', activeIdx: 0,
        },
        {
            log: 'Enqueue(40). rear 위치(3)에 40을 저장하고 rear를 4로 이동합니다. front = 1, rear = 4. 시간복잡도 O(1).',
            slots: ['', '20', '30', '40', '', ''],
            front: 1, rear: 4, size: 3, action: 'enqueue', activeIdx: 3,
        },
        {
            log: 'Dequeue(). front 위치(1)의 값 20을 꺼내고 front를 2로 이동합니다. 반환값: 20. front = 2, rear = 4.',
            slots: ['', '', '30', '40', '', ''],
            front: 2, rear: 4, size: 2, action: 'dequeue', activeIdx: 1,
        },
        {
            log: 'Enqueue(50), Enqueue(60). rear가 5→6으로 이동합니다. front = 2, rear = 6. 배열 끝에 도달했습니다. 원형 큐(Circular Queue)를 쓰면 앞 공간을 재활용할 수 있습니다.',
            slots: ['', '', '30', '40', '50', '60'],
            front: 2, rear: 6, size: 4, action: 'enqueue', activeIdx: 5,
        },
    ];

    /* ===================== 상태 변수 ===================== */
    var mode     = 'stack';
    var stepIdx  = -1;
    var running  = false;
    var timer    = null;
    var rafId    = null;
    var speed    = 1800;
    var animProg = 1;
    var animDir  = 'none';

    function currentSteps() { return mode === 'stack' ? STACK_STEPS : QUEUE_STEPS; }

    /* ===================== 헬퍼 ===================== */
    function rr(x, y, w, h, r, fill, stroke, lw) {
        if (w <= 0 || h <= 0) return;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x+w, y, x+w, y+h, r); ctx.arcTo(x+w, y+h, x, y+h, r);
        ctx.arcTo(x, y+h, x, y, r);     ctx.arcTo(x, y, x+w, y, r);
        ctx.closePath();
        if (fill   && fill   !== 'none') { ctx.fillStyle   = fill;   ctx.fill();   }
        if (stroke && stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
    }

    function tx(str, x, y, sz, color, align, bold) {
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    function arrowLine(x1, y1, x2, y2, col, lw) {
        ctx.beginPath();
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.strokeStyle = col; ctx.lineWidth = lw || 2;
        ctx.setLineDash([]); ctx.stroke();
        var angle = Math.atan2(y2 - y1, x2 - x1);
        var hs = 8;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - hs * Math.cos(angle - 0.4), y2 - hs * Math.sin(angle - 0.4));
        ctx.lineTo(x2 - hs * Math.cos(angle + 0.4), y2 - hs * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
    }

    function isLight() {
        return document.documentElement.getAttribute('data-theme') === 'light';
    }

    /* ===================== 스택 드로우 ===================== */
    function drawStack(L, step) {
        if (!step) return;
        var W = L.W, mob = L.mob, pad = L.pad;

        var fVal  = mob ? 18 : 22;
        var fLbl  = mob ? 11 : 13;
        var fSub  = mob ? 10 : 12;

        var slotH = mob ? 48 : 58;
        var slotW = mob ? Math.min(160, W - pad * 2) : Math.min(220, W * 0.35);
        var capN  = 6;

        var topPad  = mob ? 24 : 32;
        var titleY  = topPad + (mob ? 11 : 14);
        var opLblH  = mob ? 20 : 22;
        var stackBaseY = titleY + (mob ? 18 : 22) + opLblH + slotH * capN;
        var slotX  = (W - slotW) / 2;

        tx('STACK  ( LIFO )', W / 2, titleY, fLbl, P.muted, 'center', false);

        var opLblY = titleY + (mob ? 16 : 18);
        var opTxt = '';
        var opCol = P.muted;
        if (step.action === 'push') { opTxt = '▼  PUSH'; opCol = P.green; }
        else if (step.action === 'pop')  { opTxt = '▲  POP';  opCol = P.orange; }
        else if (step.action === 'peek') { opTxt = '◉  PEEK'; opCol = P.yellow; }
        if (opTxt) tx(opTxt, slotX + slotW / 2, opLblY, fLbl + 1, opCol, 'center', true);

        for (var i = 0; i < capN; i++) {
            var val    = step.slots[i] || '';
            var slotY  = stackBaseY - (i + 1) * slotH;
            var isTop  = (i === step.top);
            var isAct  = (i === step.activeIdx);

            var col;
            if (isAct && step.action === 'push') col = P.green;
            else if (isAct && step.action === 'pop')  col = P.orange;
            else if (isAct && step.action === 'peek') col = P.yellow;
            else if (val !== '') col = P.teal;
            else col = P.muted;

            var offY = 0;
            if (animDir === 'slidein' && animProg < 1 && isAct) {
                offY = -(1 - animProg) * slotH;
            }
            if (animDir === 'slideout' && animProg < 1 && isAct) {
                offY = -(animProg) * slotH * 1.5;
                col = P.orange;
            }

            rr(slotX, slotY + offY, slotW, slotH - 2, 6, 'none', col + 'cc', 2);
            if (val !== '') {
                tx(val, slotX + slotW / 2, slotY + offY + slotH / 2 - 1, fVal, col, 'center', true);
            }

            tx('[' + i + ']', slotX + slotW + (mob ? 10 : 14), slotY + slotH / 2 - 1, fSub, P.muted, 'left', false);
        }

        ctx.beginPath();
        ctx.moveTo(slotX, stackBaseY);
        ctx.lineTo(slotX + slotW, stackBaseY);
        ctx.strokeStyle = P.muted + '66'; ctx.lineWidth = 2; ctx.stroke();

        if (step.top >= 0) {
            var topSlotY = stackBaseY - (step.top + 1) * slotH + slotH / 2 - 1;
            var arX = slotX - (mob ? 36 : 50);
            tx('top', arX - (mob ? 18 : 22), topSlotY, fLbl, P.purple, 'right', true);
            arrowLine(arX - (mob ? 2 : 4), topSlotY, slotX - 4, topSlotY, P.purple, 2);
        } else {
            var emptyY = stackBaseY - slotH / 2;
            tx('top = -1', slotX - (mob ? 10 : 14), emptyY, fLbl, P.muted, 'right', false);
        }

        var infoY = stackBaseY + (mob ? 18 : 24);
        tx('Push O(1)  ·  Pop O(1)  ·  Peek O(1)  ·  Search O(n)', W / 2, infoY, fSub, P.muted, 'center', false);
    }

    /* ===================== 큐 드로우 ===================== */
    function drawQueue(L, step) {
        if (!step) return;
        var W = L.W, mob = L.mob, pad = L.pad;

        var fVal     = mob ? 16 : 20;
        var fLbl     = mob ? 11 : 13;
        var fSub     = mob ? 10 : 12;

        var capN     = 6;
        var slotH    = mob ? 60 : 72;
        var gap      = mob ? 4  : 6;
        var avail    = W - pad * 2;
        var slotW    = Math.floor((avail - gap * (capN - 1)) / capN);
        var startX   = pad;

        var topPad   = mob ? 24 : 32;
        var titleY   = topPad + (mob ? 11 : 14);
        var ptrTxtY  = titleY + (mob ? 20 : 24);
        var arrBotY  = ptrTxtY + (mob ? 22 : 28);
        var slotTopY = arrBotY + 2;
        var idxY     = slotTopY + slotH + (mob ? 13 : 16);
        var opY      = idxY + (mob ? 20 : 24);
        var infoY    = opY + (mob ? 20 : 24);

        tx('QUEUE  ( FIFO )', W / 2, titleY, fLbl, P.muted, 'center', false);

        if (step.size > 0) {
            var frontX = startX + step.front * (slotW + gap) + slotW / 2;
            tx('front', frontX, ptrTxtY, fSub, P.purple, 'center', true);
            arrowLine(frontX, ptrTxtY + (mob ? 9 : 11), frontX, arrBotY, P.purple, 2);

            var rearIdx = step.rear - 1;
            if (rearIdx >= 0 && rearIdx < capN && rearIdx !== step.front) {
                var rearX = startX + rearIdx * (slotW + gap) + slotW / 2;
                tx('rear', rearX, ptrTxtY, fSub, P.yellow, 'center', true);
                arrowLine(rearX, ptrTxtY + (mob ? 9 : 11), rearX, arrBotY, P.yellow, 2);
            }
        }

        for (var i = 0; i < capN; i++) {
            var val   = step.slots[i] || '';
            var slotX = startX + i * (slotW + gap);
            var isAct = (i === step.activeIdx);

            var col;
            if (isAct && step.action === 'enqueue') col = P.green;
            else if (isAct && step.action === 'dequeue') col = P.orange;
            else if (val !== '') col = P.teal;
            else col = P.muted;

            var offX = 0;
            if (animDir === 'slidein' && animProg < 1 && isAct) {
                offX = (1 - animProg) * (slotW + gap) * 1.2;
            }
            var offXout = 0;
            if (animDir === 'slideout' && animProg < 1 && isAct) {
                offXout = -animProg * (slotW + gap) * 1.5;
                col = P.orange;
            }

            rr(slotX + offX + offXout, slotTopY, slotW, slotH, 6, 'none', col + 'cc', 2);
            if (val !== '') {
                tx(val, slotX + offX + offXout + slotW / 2, slotTopY + slotH / 2, fVal, col, 'center', true);
            }

            tx('[' + i + ']', slotX + slotW / 2, idxY, fSub, P.muted, 'center', false);
        }

        var opTxt = '';
        var opCol = P.muted;
        if (step.action === 'enqueue')      { opTxt = '▶  ENQUEUE (rear에 추가)';    opCol = P.green;  }
        else if (step.action === 'dequeue') { opTxt = '◀  DEQUEUE (front에서 제거)'; opCol = P.orange; }
        if (opTxt) tx(opTxt, W / 2, opY, fLbl + 1, opCol, 'center', true);

        tx('Enqueue O(1)  ·  Dequeue O(1)  ·  Peek O(1)  ·  Search O(n)', W / 2, infoY, fSub, P.muted, 'center', false);
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        var W   = GW(), H = GH();
        var mob = W < 600;
        var pad = mob ? 16 : 40;
        var L   = { W: W, H: H, mob: mob, pad: pad };
        var steps = currentSteps();
        var step  = stepIdx >= 0 ? steps[stepIdx] : steps[0];
        if (mode === 'stack') drawStack(L, step);
        else drawQueue(L, step);
    }

    /* ===================== 애니메이션 ===================== */
    function getAnimDir(idx) {
        var steps = currentSteps();
        var step  = steps[idx];
        if (!step) return 'none';
        if (step.action === 'push' || step.action === 'enqueue') return 'slidein';
        if (step.action === 'pop'  || step.action === 'dequeue') return 'slideout';
        return 'none';
    }

    function animateStep(onDone) {
        animDir  = getAnimDir(stepIdx);
        animProg = 0;
        if (rafId) cancelAnimationFrame(rafId);
        var s = 0.007 * (1800 / speed);
        (function tick() {
            animProg = Math.min(1, animProg + s);
            draw();
            if (animProg < 1) {
                rafId = requestAnimationFrame(tick);
            } else {
                animDir = 'none'; draw();
                if (onDone) onDone();
            }
        })();
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) {
        root.querySelectorAll('.sq-viz__speed-btn').forEach(function (b) { b.disabled = v; });
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
                    timer = setTimeout(tick, speed * 0.6);
                }
            });
        }
        tick();
    }

    function vizStep() {
        if (running || animProg < 1) return;
        var steps = currentSteps();
        var next  = stepIdx + 1;
        if (next >= steps.length) return;
        applyStep(next, null);
        if (next === steps.length - 1) { btnPlay.disabled = true; btnStep.disabled = true; }
    }

    function vizReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false; stepIdx = -1; animProg = 1; animDir = 'none';
        logEl.textContent = mode === 'stack'
            ? '▶ PLAY를 눌러 스택의 Push·Pop 동작을 확인하세요.'
            : '▶ PLAY를 눌러 큐의 Enqueue·Dequeue 동작을 확인하세요.';
        btnPlay.disabled = false; btnStep.disabled = false;
        setSpeedDisabled(false);
        resize();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.sq-viz__speed-btn').forEach(function (b) {
            b.classList.remove('sq-viz__speed-btn--active');
        });
        btn.classList.add('sq-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeStack.classList.toggle('sq-viz__mode-btn--active', m === 'stack');
        modeQueue.classList.toggle('sq-viz__mode-btn--active', m === 'queue');
        vizReset();
    }

    /* ===================== 라이프사이클 ===================== */
    window.CsFlow.createVizLifecycle({
        canvas: canvas, canvasWrap: canvasWrap, resize: resize, draw: draw,
        getState : function () { return { rafId: rafId, timer: timer, running: running }; },
        setState : function (s) { rafId = s.rafId; timer = s.timer; running = s.running; },
        onPause  : function () { setSpeedDisabled(false); },
        getMouseCtx: function () {
            return { GW: GW, GH: GH, mousePos: { x: -1, y: -1 }, tooltipHits: [],
                     hoveredKey: function () { return null; }, setHoveredKey: function () {}, draw: draw };
        },
    });

    setTimeout(resize, 60);
})();