/**
 * 원형 버퍼 시각화
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
    var root    = el('div', 'cb-viz');
    var toolbar = el('div', 'cb-viz__toolbar');
    var tbLeft  = el('div', 'cb-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'cb-viz__title', 'CIRCULAR BUFFER'));

    var modeWrap = el('div', 'cb-viz__mode');
    var modeDefs = [
        { key: 'basic', label: '쓰기와 읽기' },
        { key: 'wrap', label: '끝에서 처음으로' },
        { key: 'full', label: '가득 참과 빈 상태' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'cb-viz__mode-btn' + (i === 0 ? ' cb-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'cb-viz__speed');
    speedWrap.appendChild(el('span', 'cb-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'cb-viz__speed-btn' + (i === 0 ? ' cb-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'cb-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'cb-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'cb-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'cb-viz__controls');
    var btnPlay  = el('button', 'cb-viz__btn cb-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'cb-viz__btn', '▶| STEP');
    var btnReset = el('button', 'cb-viz__btn', '↺ RESET');
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

    /* ===================== 엔진: 원형 버퍼 ===================== */
    function ju(n, a, b) {
        return [0, 1, 3, 6, 7, 8].indexOf(Math.abs(n) % 10) >= 0 ? a : b;
    }
    function mkBuf(cap) {
        var b = [];
        for (var i = 0; i < cap; i++) b.push('');
        return b;
    }
    function Ring(cap) {
        this.cap = cap;
        this.buf = mkBuf(cap);
        this.head = 0;
        this.tail = 0;
        this.size = 0;
    }
    Ring.prototype.enq = function (v) {
        var w = this.tail;
        this.buf[w] = v;
        this.tail = (this.tail + 1) % this.cap;
        this.size++;
        return w;
    };
    Ring.prototype.deq = function () {
        var r = this.head;
        var v = this.buf[r];
        this.buf[r] = '';
        this.head = (this.head + 1) % this.cap;
        this.size--;
        return { idx: r, val: v };
    };
    function snap(r, w, rd, tailFrom, cap, cap2, cap3, log, extra) {
        var s = { cap: r.cap, buf: r.buf.slice(), head: r.head, tail: r.tail, size: r.size, w: w, rd: rd, c1: cap, c2: cap2, c3: cap3, log: log, amb: false };
        if (extra) { for (var k in extra) s[k] = extra[k]; }
        return s;
    }

    /* ===================== 데이터: 쓰기와 읽기 ===================== */
    var BASIC_STEPS = [];
    (function () {
        var r = new Ring(8);
        BASIC_STEPS.push(snap(r, -1, -1, 0, '', '', '', '원형 버퍼(circular buffer, ring buffer)는 고정 크기 배열의 끝과 처음을 이어 붙여 원처럼 쓰는 큐입니다. 읽을 위치 head와 쓸 위치 tail 두 인덱스만 움직이고 원소는 옮기지 않습니다. 용량은 ' + r.cap + '이고 처음에는 head와 tail이 모두 0입니다.'));
        ['A', 'B', 'C', 'D'].forEach(function (v) {
            var before = r.tail;
            var w = r.enq(v);
            BASIC_STEPS.push(snap(r, w, -1, 0, 'enqueue(' + v + ')', '칸 ' + w + '에 쓰고 tail = (' + before + ' + 1) % ' + r.cap + ' = ' + r.tail, '원소 ' + r.size + '개 / ' + r.cap + '칸',
                'enqueue(' + v + ') — tail 위치인 칸 ' + w + '에 ' + v + '를 쓰고, tail을 한 칸 앞으로 옮깁니다(' + before + ' → ' + r.tail + '). 원소는 이동하지 않고 인덱스만 바뀌므로 O(1)입니다.'));
        });
        [1, 2].forEach(function () {
            var before = r.head;
            var d = r.deq();
            BASIC_STEPS.push(snap(r, -1, d.idx, 0, 'dequeue() → ' + d.val, '칸 ' + d.idx + '에서 읽고 head = (' + before + ' + 1) % ' + r.cap + ' = ' + r.head, '원소 ' + r.size + '개 / ' + r.cap + '칸',
                'dequeue() — head 위치인 칸 ' + d.idx + '에서 ' + d.val + '를 읽고, head를 한 칸 앞으로 옮깁니다(' + before + ' → ' + r.head + '). 읽은 칸은 비워진 것으로 보고 다음 쓰기에서 덮어씁니다.'));
        });
        BASIC_STEPS.push(snap(r, -1, -1, 0, 'head ' + r.head + ' · tail ' + r.tail + ' · 원소 ' + r.size + '개', '칸 0 ~ ' + (r.head - 1) + '은 다시 쓸 수 있음', '',
            '정리 — 원소를 옮기지 않고 head와 tail 두 인덱스만 움직여 쓰기와 읽기가 모두 O(1)입니다. 일반 배열 큐처럼 앞에서 꺼낼 때 나머지를 한 칸씩 당기지 않아도 됩니다.'));
    })();

    /* ===================== 데이터: 끝에서 처음으로 ===================== */
    var WRAP_STEPS = [];
    (function () {
        var r = new Ring(8);
        r.head = 5; r.tail = 5;
        r.enq('X'); r.enq('Y');
        WRAP_STEPS.push(snap(r, -1, -1, 0, '', '', '', '배열 끝에 가까운 상태에서 시작합니다. 칸 5와 6에 X, Y가 있고 head는 5, tail은 7입니다. tail이 배열의 마지막 칸을 지나면 어떻게 되는지 봅니다.'));
        [1, 2, 3].forEach(function (n) {
            var before = r.tail;
            var w = r.enq(String(n));
            var wrapped = before + 1 >= r.cap;
            WRAP_STEPS.push(snap(r, w, -1, 0, 'enqueue(' + n + ')', 'tail = (' + before + ' + 1) % ' + r.cap + ' = ' + r.tail + (wrapped ? '  ← 처음으로' : ''), '원소 ' + r.size + '개 / ' + r.cap + '칸',
                'enqueue(' + n + ') — 칸 ' + w + '에 ' + n + ju(n, '을', '를') + ' 씁니다. tail은 (' + before + ' + 1) % ' + r.cap + ' = ' + r.tail + ju(r.tail, '이', '가') + ' 됩니다.' + (wrapped ? ' 마지막 칸을 지나 인덱스가 0으로 돌아왔습니다. 나머지 연산이 끝과 처음을 이어 줍니다.' : '')));
        });
        [1, 2, 3].forEach(function () {
            var before = r.head;
            var d = r.deq();
            var wrapped = before + 1 >= r.cap;
            WRAP_STEPS.push(snap(r, -1, d.idx, 0, 'dequeue() → ' + d.val, 'head = (' + before + ' + 1) % ' + r.cap + ' = ' + r.head + (wrapped ? '  ← 처음으로' : ''), '원소 ' + r.size + '개 / ' + r.cap + '칸',
                'dequeue() — 칸 ' + d.idx + '에서 ' + d.val + '를 읽습니다. head는 (' + before + ' + 1) % ' + r.cap + ' = ' + r.head + ju(r.head, '이', '가') + ' 됩니다.' + (wrapped ? ' head도 마지막 칸을 지나 0으로 돌아왔습니다.' : '')));
        });
        WRAP_STEPS.push(snap(r, -1, -1, 0, '인덱스 증가는 (i + 1) % 용량', '', '',
            '정리 — head와 tail은 늘 (index + 1) % capacity로 한 칸씩 움직입니다. 배열 끝에 닿으면 0으로 돌아가므로 같은 칸이 계속 재사용되고, 배열이 커지지 않습니다.'));
    })();

    /* ===================== 데이터: 가득 참과 빈 상태 ===================== */
    var FULL_STEPS = [];
    (function () {
        var r = new Ring(4);
        FULL_STEPS.push(snap(r, -1, -1, 0, 'head == tail → 비어 있음', '원소 0개 / 4칸', '', '용량 4인 작은 버퍼로 head와 tail이 같을 때의 의미를 봅니다. 처음에는 head와 tail이 모두 0이고 비어 있습니다.'));
        ['a', 'b', 'c'].forEach(function (v) {
            var w = r.enq(v);
            FULL_STEPS.push(snap(r, w, -1, 0, 'enqueue(' + v + ')', 'head ' + r.head + ' · tail ' + r.tail, '원소 ' + r.size + '개 / ' + r.cap + '칸',
                'enqueue(' + v + ') — 칸 ' + w + '에 쓰고 tail은 ' + r.tail + ju(r.tail, '이', '가') + ' 됩니다. 아직 head와 tail이 다릅니다.'));
        });
        var w4 = r.enq('d');
        FULL_STEPS.push(snap(r, w4, -1, 0, 'head == tail → 가득 참?', 'head ' + r.head + ' · tail ' + r.tail + ' · 원소 ' + r.size + '개', '비어 있을 때와 같은 모양',
            'enqueue(d) — 네 번째 칸까지 채우니 tail이 (3 + 1) % 4 = 0으로 돌아와 head와 같아졌습니다. 이번에는 가득 찬 상태인데, 처음의 빈 상태와 head == tail로 똑같아 보입니다.', { amb: true }));
        var r2 = new Ring(4);
        r2.enq('a'); r2.enq('b'); r2.enq('c');
        FULL_STEPS.push(snap(r2, -1, -1, 0, '방법 1 · 한 칸을 비워 둠', '(tail + 1) % 4 == head 이면 가득 참', '실제로는 3개까지만 저장',
            '방법 1 — 칸 하나를 항상 비워 두고 (tail + 1) % 용량 == head일 때 가득 찼다고 봅니다. 그러면 head == tail은 오직 비어 있음을 뜻합니다. 대신 저장할 수 있는 원소는 용량 - 1개입니다.'));
        FULL_STEPS.push(snap(r, -1, -1, 0, '방법 2 · 개수(size)를 따로 관리', 'size == 4 == 용량 → 가득 참', 'size == 0 → 비어 있음',
            '방법 2 — 원소 개수 size를 따로 두고 size == 용량이면 가득, size == 0이면 비어 있다고 판단합니다. 칸을 낭비하지 않지만 변수 하나가 늘고, 생산자와 소비자가 나뉘면 size 갱신에 동기화가 필요합니다.'));
        FULL_STEPS.push(snap(r, -1, -1, 0, '가득 찼을 때는 정책을 정한다', '쓰기 거부 · 또는 가장 오래된 값을 덮어씀', '',
            '정리 — head == tail만으로는 비어 있음과 가득 참을 구분할 수 없어서, 한 칸을 비우거나 개수를 따로 셉니다. 가득 찼을 때 새 쓰기를 거부할지, 가장 오래된 값을 덮어쓸지는 용도에 따라 정합니다.'));
    })();

    /* ===================== 상태 ===================== */
    var mode    = 'basic';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'wrap') return WRAP_STEPS;
        if (mode === 'full') return FULL_STEPS;
        return BASIC_STEPS;
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
        if (sz < 11) sz = 11;
        if (color.indexOf(P.muted) === 0) color = P.sub + 'ff';
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    /* ===================== 공통: 원형 버퍼 그리기 ===================== */
    function drawRing(x0, top, w, mob, step) {
        var cap = step ? step.cap : 8;
        var buf = step ? step.buf : mkBuf(8);
        var head = step ? step.head : 0;
        var tail = step ? step.tail : 0;
        var wi = step ? step.w : -1;
        var ri = step ? step.rd : -1;
        var amb = step ? step.amb : false;
        var fs = mob ? 11.5 : 13;
        var R = mob ? 62 : 74;
        var cx = x0 + w / 2;
        var cy = top + R + 36;
        var bw = mob ? 38 : 46;
        var bh = mob ? 32 : 36;
        var i;
        function ang(k) { return -Math.PI / 2 + (2 * Math.PI * k) / cap; }
        for (i = 0; i < cap; i++) {
            var px = cx + R * Math.cos(ang(i));
            var py = cy + R * Math.sin(ang(i));
            var filled = buf[i] !== '';
            var col = filled ? P.teal : P.sub;
            if (i === wi) col = P.green;
            if (i === ri) col = P.red;
            if (amb && (i === head)) col = P.red;
            rr(px - bw / 2, py - bh / 2, bw, bh, 5, filled || i === wi ? col + '30' : 'none', col + (filled || i === wi || i === ri ? 'ff' : '88'), i === wi || i === ri ? 2.6 : 1.4);
            tx(String(i), px, py - bh / 2 + 9, fs - 2, P.sub + 'ee', 'center', true);
            tx(buf[i] === '' ? '·' : buf[i], px, py + 7, fs + 1, filled ? P.text + 'ff' : P.sub + 'cc', 'center', true);
        }
        function marker(idx, label, color, offset) {
            var a = ang(idx) + offset;
            var rx = cx + (R + (mob ? 40 : 46)) * Math.cos(a);
            var ry = cy + (R + (mob ? 40 : 46)) * Math.sin(a);
            ctx.beginPath();
            ctx.moveTo(cx + (R + bw / 2 + 2) * Math.cos(ang(idx)), cy + (R + bh / 2 + 2) * Math.sin(ang(idx)));
            ctx.lineTo(rx - 10 * Math.cos(a), ry - 10 * Math.sin(a));
            ctx.strokeStyle = color + 'ff';
            ctx.lineWidth = 2;
            ctx.stroke();
            tx(label, rx, ry, fs - 0.5, color + 'ff', 'center', true);
        }
        if (step) {
            var same = head === tail;
            marker(head, 'head', P.orange, same ? -0.28 : 0);
            marker(tail, 'tail', P.purple, same ? 0.28 : 0);
            tx(step.size + '/' + cap, cx, cy - 6, fs + 3, P.text + 'ff', 'center', true);
            tx('원소 수', cx, cy + 14, fs - 1.5, P.sub + 'ee', 'center', false);
        } else {
            tx('0/' + cap, cx, cy - 6, fs + 3, P.text + 'ff', 'center', true);
        }
        var capY = cy + R + (mob ? 40 : 46) + 20;
        if (step && step.c1) tx(step.c1, x0 + w / 2, capY, fs - 0.5, P.yellow + 'ff', 'center', true);
        if (step && step.c2) tx(step.c2, x0 + w / 2, capY + 19, fs - 1, P.text + 'ee', 'center', false);
        if (step && step.c3) tx(step.c3, x0 + w / 2, capY + 38, fs - 1, P.green + 'ee', 'center', true);
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        var W = GW(); var mob = W < 600;
        var padX = mob ? 16 : 26;
        var fullW = W - padX * 2;
        var top = mob ? 18 : 26;

        var steps = currentSteps();
        var step = stepIdx >= 0 ? steps[stepIdx] : null;

        drawRing(padX, top, fullW, mob, step);

        if (!step) {
            var hint = '아래 STEP으로 원형 버퍼의 동작을 확인하세요.';
            ctx.font = '500 ' + (mob ? 11 : 12.5) + 'px "JetBrains Mono",monospace';
            var hs = mob ? 11 : 12.5;
            var hl = [hint];
            if (ctx.measureText(hint).width > W - 16) {
                var cut = hint.indexOf(' ', Math.floor(hint.length / 2));
                if (cut < 0) cut = hint.lastIndexOf(' ');
                hl = [hint.slice(0, cut), hint.slice(cut + 1)];
            }
            hl.forEach(function (line, li) {
                tx(line, W / 2, GH() - (mob ? 12 : 14) - (hl.length - 1 - li) * (hs + 4), hs, P.muted + 'aa', 'center', false);
            });
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH;
        neededH = mob ? 380 : 410;
        canvasWrap.style.height    = 'auto';
        canvasWrap.style.minHeight = neededH + 'px';
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
        draw();
        rafId = requestAnimationFrame(function () { rafId = null; if (onDone) onDone(); });
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) { speedBtns.forEach(function (b) { b.disabled = v; }); }
    function defaultLog() {
        if (mode === 'wrap') return 'head와 tail이 배열 끝에서 처음으로 돌아오는 모습을 봅니다.';
        if (mode === 'full') return 'head와 tail이 같을 때 비어 있음과 가득 참을 어떻게 구분하는지 봅니다.';
        return '원소를 옮기지 않고 head와 tail만 움직이는 쓰기와 읽기를 봅니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('cb-viz__speed-btn--active'); });
        btn.classList.add('cb-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('cb-viz__mode-btn--active', d.key === m); });
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