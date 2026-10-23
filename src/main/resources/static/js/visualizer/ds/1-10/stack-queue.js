/**
 * 스택 / 큐 시각화 시각화
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
    var root    = el('div', 'sq-viz');
    var toolbar = el('div', 'sq-viz__toolbar');
    var tbLeft  = el('div', 'sq-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'sq-viz__title', 'Stack / Queue'));

    var modeWrap = el('div', 'sq-viz__mode');
    var modeDefs = [
        { key: 'stack', label: 'Stack' },
        { key: 'queue', label: 'Queue' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'sq-viz__mode-btn' + (i === 0 ? ' sq-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'sq-viz__speed');
    speedWrap.appendChild(el('span', 'sq-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'sq-viz__speed-btn' + (i === 0 ? ' sq-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'sq-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'sq-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'sq-viz__log', '');
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
    function GW() { return canvas.width / dpr; }
    function GH() { return canvas.height / dpr; }

    var P = window.CsFlow.getP();

    /* ===================== 상태 ===================== */
    var mode    = 'stack';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1900;
    var anim    = 1;

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
        if (sz < 9.5) sz = 9.5;
        if (color.indexOf(P.muted) === 0) color = P.sub + 'ff';
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }
    function ln(x1, y1, x2, y2, color, lw, dash) {
        ctx.beginPath();
        ctx.setLineDash(dash || []);
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = color;
        ctx.lineWidth = lw || 1.4;
        ctx.stroke();
        ctx.setLineDash([]);
    }
    function arrow(x1, y1, x2, y2, color, lw, dash) {
        ln(x1, y1, x2, y2, color, lw, dash);
        var a = Math.atan2(y2 - y1, x2 - x1);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 9 * Math.cos(a - 0.4), y2 - 9 * Math.sin(a - 0.4));
        ctx.lineTo(x2 - 9 * Math.cos(a + 0.4), y2 - 9 * Math.sin(a + 0.4));
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    }
    function circ(x, y, r, fill, stroke, lw) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        if (fill   && fill   !== 'none') { ctx.fillStyle   = fill;   ctx.fill();   }
        if (stroke && stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.4; ctx.stroke(); }
    }
    function colorOf(key) { return P[key] || P.muted; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
    function seg(t, a, b) { return clamp01((t - a) / (b - a)); }
    function lines(str, maxW, fs) {
        ctx.font = '700 ' + fs + 'px "JetBrains Mono",monospace';
        return window.CsFlow.wrapText(ctx, str, maxW);
    }

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

    /* ===================== 상태 ===================== */
    function currentSteps() { return mode === 'queue' ? QUEUE_STEPS : STACK_STEPS; }
    function defaultLog() {
        return mode === 'queue' ? '▶ PLAY를 눌러 큐의 Enqueue·Dequeue 동작을 확인하세요.' : '▶ PLAY를 눌러 스택의 Push·Pop 동작을 확인하세요.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        if (mode === 'queue') {
            var qSlotH = mob ? 50 : 64;
            var qGap = mob ? 4 : 8;
            var qSlotW = Math.min(mob ? 60 : 110, Math.floor((w - qGap * 5) / 6));
            var qTop = mob ? 70 : 80;
            var qBot = qTop + qSlotH;
            var qBoxY = qBot + 46;
            return {
                fVal: mob ? 16 : 20, fLbl: mob ? 10.5 : 12, fSub: mob ? 10 : 11,
                slotH: qSlotH, slotW: qSlotW, gap: qGap, rowW: qSlotW * 6 + qGap * 5, slotTop: qTop,
                boxY: qBoxY, boxW: mob ? 118 : 150, boxH: 24,
                info1: qBoxY + 40, info2: qBoxY + 56, total: qBoxY + 70
            };
        }
        var sSlotH = mob ? 28 : 34;
        var sPtrW = mob ? 44 : 64;
        var sIdxW = mob ? 26 : 34;
        var sRetW = mob ? 62 : 100;
        var sGap = mob ? 8 : 14;
        var sBody = mob ? 66 : 80;
        var sBase = sBody + 6 * sSlotH;
        return {
            fVal: mob ? 16 : 20, fLbl: mob ? 10.5 : 12, fSub: mob ? 10 : 11,
            slotH: sSlotH, ptrW: sPtrW, idxW: sIdxW, retW: sRetW, gapG: sGap,
            colW: Math.min(mob ? 120 : 200, w - (sPtrW + sIdxW + sRetW + sGap * 2)),
            bodyTop: sBody, base: sBase, info1: sBase + 18, info2: sBase + 34, total: sBase + 46
        };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 장면 헬퍼 ===================== */
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }
    function sqzOpCol(op) {
        if (op === 'push' || op === 'enqueue') return P.green;
        if (op === 'pop' || op === 'dequeue') return P.orange;
        if (op === 'peek') return P.yellow;
        return P.muted;
    }
    function sqzShown(from, to, e) {
        if (from === to) return to;
        if (from === '') return e >= 0.55 ? to : '';
        return to;
    }
    function sqzChip(cx, cy, cw, ch, str, col, sz) {
        rr(cx - cw / 2, cy - ch / 2, cw, ch, 5, col + 'ff', col + 'ff', 1.4);
        tx(str, cx, cy, sz, '#111111', 'center', true);
    }

    /* ===================== 스택 그리기 ===================== */
    function sqzStackDraw(x0, top, w, mob, s, p, e) {
        var L = layout(w, mob);
        var slotH = L.slotH, colW = L.colW, retW = L.retW;
        var groupW = L.ptrW + colW + L.idxW + L.gapG + retW;
        var colX = x0 + (w - groupW) / 2 + L.ptrW;
        var colCX = colX + colW / 2;
        var bodyTop = top + L.bodyTop;
        var base = top + L.base;
        var slotCY = function (i) { return base - (i + 0.5) * slotH; };
        var op = s.action;
        var ai = s.activeIdx;
        var opCol = sqzOpCol(op);
        var mvVal = (op === 'pop' ? p : s).slots[ai] || '';
        var ret = (op === 'pop' || op === 'peek') ? mvVal : '';
        var retCol = op === 'pop' ? P.orange : P.yellow;
        var boxX = colX + colW + L.idxW + L.gapG;
        var boxCX = boxX + retW / 2;
        var boxCY = bodyTop + slotH;
        var chipH = slotH - 6;

        tx('STACK  ( LIFO )', x0 + w / 2, top + 10, L.fLbl, P.sub, 'center', false);
        var opTxt = op === 'push' ? '▼  PUSH ' + mvVal : (op === 'pop' ? '▲  POP ' + mvVal : (op === 'peek' ? '◉  PEEK ' + mvVal : ''));
        if (opTxt) tx(opTxt, x0, top + 30, L.fLbl + 1, opCol, 'left', true);

        ln(colX - 6, base, colX + colW + 6, base, P.sub + '88', 2);

        var tMove = ez(seg(e, op === 'pop' ? 0.4 : 0.55, op === 'pop' ? 0.8 : 0.95));
        var tv = p.top === s.top ? s.top : lerp(p.top, s.top, tMove);
        var ty = slotCY(Math.max(0, tv));
        ctx.globalAlpha = clamp01(tv + 1);
        arrow(colX - 15, ty, colX - 3, ty, P.purple + 'ff', 2);
        ctx.globalAlpha = 1;
        tx('top', colX - 18, ty - 7, L.fLbl, P.purple, 'right', true);
        tx(tv < 0 ? '= -1' : '= ' + Math.round(tv), colX - 18, ty + 7, L.fSub, P.purple, 'right', false);

        for (var i = 0; i < 6; i++) {
            var from = p.slots[i] || '';
            var to = s.slots[i] || '';
            var shown = sqzShown(from, to, e);
            var sy = slotCY(i) - slotH / 2;
            var isAct = i === ai && !!op;
            rr(colX, sy + 1, colW, slotH - 2, 5,
                isAct ? opCol + '22' : (shown ? P.teal + '22' : 'none'),
                isAct ? opCol + 'ff' : (shown ? P.teal + 'cc' : P.sub + '55'),
                isAct ? 2 : 1.4);
            if (shown) tx(shown, colCX, sy + slotH / 2, L.fVal, P.text, 'center', true);
            tx('[' + i + ']', colX + colW + 6, sy + slotH / 2, L.fSub, P.sub, 'left', false);
        }

        var rA = ret !== '' ? seg(e, 0.6, 0.9) : 0;
        var boxOn = ret !== '' && rA > 0.3;
        tx('반환값', boxCX, bodyTop - 9, L.fSub, P.sub, 'center', false);
        rr(boxX, bodyTop, retW, 2 * slotH, 6, 'none', boxOn ? retCol + 'ff' : P.sub + '66', boxOn ? 1.8 : 1.2);
        ctx.globalAlpha = 1 - rA;
        tx('—', boxCX, boxCY, L.fVal, P.sub, 'center', false);
        if (ret !== '') { ctx.globalAlpha = rA; tx(ret, boxCX, boxCY, L.fVal, P.text, 'center', true); }
        ctx.globalAlpha = 1;

        if (ret !== '' && e < 0.9) {
            var rm = ez(seg(e, 0.05, 0.6));
            ctx.globalAlpha = 1 - seg(e, 0.6, 0.9);
            sqzChip(lerp(colCX, boxCX, rm), lerp(slotCY(ai), boxCY, rm), lerp(colW - 8, retW - 10, rm), chipH, ret, retCol, L.fVal);
            ctx.globalAlpha = 1;
        }

        for (var j = 0; j < 6; j++) {
            var f2 = p.slots[j] || '';
            var t2 = s.slots[j] || '';
            if (f2 === '' && t2 !== '' && e < 0.55) {
                var dm = ez(seg(e, 0, 0.55));
                sqzChip(colCX, lerp(bodyTop - 4 - chipH / 2, slotCY(j), dm), colW - 8, chipH, t2, opCol, L.fVal);
            }
        }

        tx('Push O(1) · Pop O(1) · Peek O(1)', x0 + w / 2, top + L.info1, L.fSub, P.sub, 'center', false);
        tx('Search O(n)', x0 + w / 2, top + L.info2, L.fSub, P.sub, 'center', false);
    }

    /* ===================== 큐 그리기 ===================== */
    function sqzQueueDraw(x0, top, w, mob, s, p, e) {
        var L = layout(w, mob);
        var slotW = L.slotW, gap = L.gap, slotH = L.slotH;
        var rowX = x0 + (w - L.rowW) / 2;
        var slotX = function (i) { return rowX + i * (slotW + gap); };
        var slotCX = function (i) { return slotX(i) + slotW / 2; };
        var xOf = function (v) { return v <= 5 ? slotCX(0) + v * (slotW + gap) : slotCX(5) + (v - 5) * (slotW + gap) / 2; };
        var clampX = function (x) { return Math.min(x0 + w - 18, Math.max(x0 + 18, x)); };
        var slotTop = top + L.slotTop;
        var slotCY = slotTop + slotH / 2;
        var slotBot = slotTop + slotH;
        var op = s.action;
        var ai = s.activeIdx;
        var opCol = sqzOpCol(op);
        var mvVal = (op === 'dequeue' ? p : s).slots[ai] || '';
        var ret = op === 'dequeue' ? mvVal : '';
        var boxW = L.boxW, boxH = L.boxH;
        var boxX = x0 + (w - boxW) / 2;
        var boxY = top + L.boxY;
        var boxCX = x0 + w / 2;
        var boxCY = boxY + boxH / 2;

        tx('QUEUE  ( FIFO )', x0 + w / 2, top + 10, L.fLbl, P.sub, 'center', false);
        var opTxt = op === 'enqueue' ? '▶  ENQUEUE (rear에 추가)' : (op === 'dequeue' ? '◀  DEQUEUE (front에서 제거)' : '');
        if (opTxt) tx(opTxt, x0 + w / 2, top + 30, L.fLbl + 1, opCol, 'center', true);

        var fV = p.front === s.front ? s.front : lerp(p.front, s.front, ez(seg(e, 0.45, 0.9)));
        var rV = p.rear === s.rear ? s.rear : lerp(p.rear, s.rear, ez(seg(e, 0.55, 0.95)));
        var fx = xOf(fV);
        var rx = xOf(rV);
        tx('front', clampX(fx), slotTop - 24, L.fLbl, P.purple, 'center', true);
        arrow(fx, slotTop - 14, fx, slotTop - 3, P.purple + 'ff', 2);
        arrow(rx, slotBot + 22, rx, slotBot + 3, P.yellow + 'ff', 2);
        tx('rear', clampX(rx), slotBot + 32, L.fLbl, P.yellow, 'center', true);

        for (var i = 0; i < 6; i++) {
            var from = p.slots[i] || '';
            var to = s.slots[i] || '';
            var shown = sqzShown(from, to, e);
            var isAct = i === ai && !!op;
            var sx = slotX(i);
            rr(sx, slotTop, slotW, slotH, 5,
                isAct ? opCol + '22' : (shown ? P.teal + '22' : 'none'),
                isAct ? opCol + 'ff' : (shown ? P.teal + 'cc' : P.sub + '55'),
                isAct ? 2 : 1.4);
            tx(String(i), sx + 4, slotTop + 9, L.fSub, P.sub, 'left', false);
            if (shown) tx(shown, sx + slotW / 2, slotCY + 3, L.fVal, P.text, 'center', true);
        }

        var rA = ret !== '' ? seg(e, 0.6, 0.9) : 0;
        var boxOn = ret !== '' && rA > 0.3;
        rr(boxX, boxY, boxW, boxH, 6, 'none', boxOn ? P.orange + 'ff' : P.sub + '66', boxOn ? 1.8 : 1.2);
        ctx.globalAlpha = 1 - rA;
        tx('반환  —', boxCX, boxCY, L.fLbl + 1, P.sub, 'center', false);
        if (ret !== '') { ctx.globalAlpha = rA; tx('반환  ' + ret, boxCX, boxCY, L.fLbl + 1, P.text, 'center', true); }
        ctx.globalAlpha = 1;

        if (ret !== '' && e < 0.9) {
            var dm2 = ez(seg(e, 0.05, 0.6));
            ctx.globalAlpha = 1 - seg(e, 0.6, 0.9);
            sqzChip(lerp(slotCX(ai), boxCX, dm2), lerp(slotCY, boxCY, dm2), slotW - 4, slotH - 6, ret, P.orange, L.fVal);
            ctx.globalAlpha = 1;
        }

        for (var j = 0; j < 6; j++) {
            var f2 = p.slots[j] || '';
            var t2 = s.slots[j] || '';
            if (f2 === '' && t2 !== '' && e < 0.55) {
                var em = ez(seg(e, 0, 0.55));
                sqzChip(slotCX(j), lerp(slotBot + 14, slotCY, em), lerp(slotW * 0.8, slotW - 4, em), lerp(24, slotH - 6, em), t2, opCol, L.fVal);
            }
        }

        tx('Enqueue O(1) · Dequeue O(1)', x0 + w / 2, top + L.info1, L.fSub, P.sub, 'center', false);
        tx('Peek O(1) · Search O(n)', x0 + w / 2, top + L.info2, L.fSub, P.sub, 'center', false);
    }

    /* ===================== 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var e = clamp01(t);
        var s = step || currentSteps()[0];
        var p = prev || s;
        if (mode === 'queue') sqzQueueDraw(x0, top, w, mob, s, p, e);
        else sqzStackDraw(x0, top, w, mob, s, p, e);
    }

    /* ===================== 메인 드로우 ===================== */
    function sidePad(w) { return w < 600 ? 14 : 24; }
    function topPad(w) { return w < 600 ? 14 : 20; }

    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        var W = GW(); var mob = W < 600;
        var steps = currentSteps();
        var step = stepIdx >= 0 ? steps[stepIdx] : null;
        var prev = stepIdx > 0 ? steps[stepIdx - 1] : null;
        drawScene(sidePad(W), topPad(W), W - sidePad(W) * 2, mob, step, prev, anim);
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH = 260;
        currentSteps().concat([null]).forEach(function (s) {
            var h = topPad(w) + sceneH(w - sidePad(w) * 2, mob, s) + 14;
            if (h > neededH) neededH = h;
        });
        canvasWrap.style.height    = 'auto';
        canvasWrap.style.minHeight = Math.ceil(neededH) + 'px';
        var actualH = canvasWrap.offsetHeight || neededH;
        if (actualH < neededH) actualH = neededH;
        canvas.width  = w * dpr;
        canvas.height = actualH * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    /* ===================== 애니메이션(스텝 전환) ===================== */
    function animateStep(onDone) {
        if (rafId) cancelAnimationFrame(rafId);
        var dur = Math.max(320, speed * 0.55);
        var t0 = null;
        function frame(now) {
            if (t0 === null) t0 = now;
            var p = Math.min(1, (now - t0) / dur);
            anim = p;
            draw();
            if (p < 1) { rafId = requestAnimationFrame(frame); }
            else { rafId = null; anim = 1; if (onDone) onDone(); }
        }
        anim = 0;
        rafId = requestAnimationFrame(frame);
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) { speedBtns.forEach(function (b) { b.disabled = v; }); }

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
        running = false; stepIdx = -1; anim = 1;
        btnPlay.disabled = false; btnStep.disabled = false;
        logEl.textContent = defaultLog();
        setSpeedDisabled(false);
        resize();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        speedBtns.forEach(function (b) { b.classList.remove('sq-viz__speed-btn--active'); });
        btn.classList.add('sq-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('sq-viz__mode-btn--active', d.key === m); });
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