/**
 * 원형 버퍼 시각화 시각화
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
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
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
    function GW() { return canvas.width / dpr; }
    function GH() { return canvas.height / dpr; }

    var P = window.CsFlow.getP();

    /* ===================== 상태 ===================== */
    var mode    = 'basic';
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
    var CB_HINT = '아래 STEP으로 원형 버퍼의 동작을 확인하세요.';

    function currentSteps() {
        if (mode === 'wrap') return WRAP_STEPS;
        if (mode === 'full') return FULL_STEPS;
        return BASIC_STEPS;
    }

    function defaultLog() {
        if (mode === 'wrap') return 'head와 tail이 배열 끝에서 처음으로 돌아오는 모습을 봅니다.';
        if (mode === 'full') return 'head와 tail이 같을 때 비어 있음과 가득 참을 어떻게 구분하는지 봅니다.';
        return '원소를 옮기지 않고 head와 tail만 움직이는 쓰기와 읽기를 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var fs = mob ? 11 : 12;
        var bw = mob ? 36 : 48;
        var bh = mob ? 34 : 40;
        var R = mob ? 56 : 84;
        var RT = R + ((bw + bh) / 2) * 0.7071 + 4;
        var RB = RT + 7;
        var LR = RB + 8;
        return { fs: fs, vf: mob ? 12 : 14, bw: bw, bh: bh, R: R, RT: RT, RB: RB, LR: LR, lh: fs + 5, cy: LR + 8, cx: w / 2, maxW: w - 8 };
    }

    function cbAllSteps() {
        return BASIC_STEPS.concat(WRAP_STEPS, FULL_STEPS);
    }

    function cbCapLines(s, maxW, fs) {
        var out = [];
        [[s.c1, 0], [s.c2, 1], [s.c3, 2]].forEach(function (pair) {
            if (!pair[0]) return;
            lines(pair[0], maxW, fs).forEach(function (txt) { out.push({ txt: txt, kind: pair[1] }); });
        });
        return out;
    }

    function sceneH(w, mob) {
        var L = layout(w, mob);
        var n = lines(CB_HINT, L.maxW, L.fs).length;
        cbAllSteps().forEach(function (s) { n = Math.max(n, cbCapLines(s, L.maxW, L.fs).length); });
        return Math.ceil(L.cy + L.LR + 11 + n * L.lh + 4);
    }

    /* ===================== 장면 공통 ===================== */
    function ez(q) {
        var c = clamp01(q);
        return c * c * (3 - 2 * c);
    }

    function cbHex(a) {
        var v = Math.round(clamp01(a) * 255);
        return (v < 16 ? '0' : '') + v.toString(16);
    }

    function cbAng(pos, cap) {
        return -Math.PI / 2 + (2 * Math.PI * pos) / cap;
    }

    function cbMove(a, b, k, cap) {
        var d = (((b - a) % cap) + cap) % cap;
        if (d === 0) return a;
        if (d === 1) return a + k;
        return k < 0.5 ? a : b;
    }

    function cbXY(cx, cy, R, i, cap) {
        var a = cbAng(i, cap);
        return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
    }

    function cbMarker(cx, cy, L, cap, pos, off, label, col) {
        var a = cbAng(pos, cap) + off;
        var ca = Math.cos(a), sa = Math.sin(a);
        var bx = cx + L.RB * ca, by = cy + L.RB * sa;
        var nx = -sa * 4, ny = ca * 4;
        ctx.beginPath();
        ctx.moveTo(cx + L.RT * ca, cy + L.RT * sa);
        ctx.lineTo(bx + nx, by + ny);
        ctx.lineTo(bx - nx, by - ny);
        ctx.closePath();
        ctx.fillStyle = col + 'ff';
        ctx.fill();
        tx(label, cx + L.LR * ca, cy + L.LR * sa, L.fs, col + 'ff', 'center', true);
    }

    /* ===================== 장면 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var st = step || currentSteps()[0];
        var pv = step && prev ? prev : st;
        var cap = st.cap;
        var k = pv !== st ? ez(t) : 1;
        var cx = x0 + w / 2;
        var cy = top + L.cy;
        var R = L.R;
        var i;

        var anyChange = false;
        for (i = 0; i < cap; i++) { if (pv.buf[i] !== st.buf[i]) anyChange = true; }
        var crossing = pv !== st && ((pv.tail === cap - 1 && st.tail === 0) || (pv.head === cap - 1 && st.head === 0));
        var seamA = crossing ? Math.sin(Math.PI * k) : 0;
        var idle = pv !== st && !anyChange && st.w < 0 && st.rd < 0;
        var hPos = cbMove(pv.head, st.head, k, cap);
        var tPos = cbMove(pv.tail, st.tail, k, cap);
        var bandFull = k < 0.5 ? pv.size >= cap : st.size >= cap;
        var span = (((tPos - hPos) % cap) + cap) % cap;
        if (span < 0.0001 || span > cap - 0.0001) span = 0;

        function cbBand(alpha, lw) {
            ctx.lineWidth = lw;
            ctx.strokeStyle = P.teal + cbHex(alpha);
            ctx.beginPath();
            if (bandFull) ctx.arc(cx, cy, R, 0, Math.PI * 2);
            else ctx.arc(cx, cy, R, cbAng(hPos, cap), cbAng(hPos + span, cap));
            ctx.stroke();
        }
        if (bandFull || span > 0) {
            cbBand(0.23, 6);
            if (idle) cbBand(0.6 * Math.sin(Math.PI * k), 9);
        }

        for (i = 0; i < cap; i++) {
            var pt = cbXY(cx, cy, R, i, cap);
            var bx = pt.x - L.bw / 2, by = pt.y - L.bh / 2;
            var pvv = pv.buf[i], stv = st.buf[i];
            var gain = pvv === '' && stv !== '';
            var lost = pvv !== '' && stv === '';
            var swap = pvv !== '' && stv !== '' && pvv !== stv;
            var fillA = stv !== '' ? (pvv === '' ? k : 1) : (pvv === '' ? 0 : 1 - k);
            var newA = stv === '' ? 0 : (pvv === '' ? seg(k, 0.4, 1) : (swap ? seg(k, 0.5, 1) : 1));
            var oldA = pvv === '' ? 0 : (stv === '' ? 1 - seg(k, 0, 0.6) : (swap ? 1 - seg(k, 0, 0.5) : 0));
            var dotA = stv === '' ? (pvv === '' ? 1 : seg(k, 0.6, 1)) : (pvv === '' ? 1 - seg(k, 0, 0.4) : 0);
            var idxA = lost ? (k < 0.5 ? 1 - seg(k, 0, 0.25) : seg(k, 0.75, 1)) : 1;
            var vy = pt.y + 6;
            var ang = cbAng(i, cap);
            var ox = pt.x, oy = vy;
            if (lost) { ox += Math.cos(ang) * 14 * k; oy += Math.sin(ang) * 14 * k; }

            rr(bx, by, L.bw, L.bh, 5, 'none', P.sub + '88', 1.4);
            if (fillA > 0) rr(bx, by, L.bw, L.bh, 5, P.teal + cbHex(0.19 * fillA), P.teal + cbHex(fillA), 1.4);
            if (st.w === i && pv !== st && k < 1) {
                var g = 3 + 8 * k;
                rr(bx - g, by - g, L.bw + 2 * g, L.bh + 2 * g, 6 + g, 'none', P.green + cbHex(1 - k), 1.6);
            }
            if (st.w === i) rr(bx, by, L.bw, L.bh, 5, 'none', P.green + cbHex(k), 2.6);
            if (st.rd === i || (st.amb && st.head === i)) rr(bx, by, L.bw, L.bh, 5, 'none', P.red + cbHex(k), 2.6);
            if (crossing && (i === 0 || i === cap - 1)) rr(bx - 3, by - 3, L.bw + 6, L.bh + 6, 7, 'none', P.yellow + cbHex(seamA), 2);

            if (idxA > 0.01) tx(String(i), pt.x, pt.y - L.bh / 2 + 8, L.fs, P.sub + cbHex(idxA), 'center', true);
            if (dotA > 0.01) tx('·', pt.x, vy, L.vf, P.sub + cbHex(0.8 * dotA), 'center', true);
            if (oldA > 0.01) tx(pvv, ox, oy, L.vf, P.text + cbHex(oldA), 'center', true);
            if (newA > 0.01) tx(stv, pt.x, vy, L.vf, P.text + cbHex(newA), 'center', true);
        }

        var eqP = pv.head === pv.tail, eqC = st.head === st.tail;
        cbMarker(cx, cy, L, cap, hPos, lerp(eqP ? -0.25 : 0, eqC ? -0.25 : 0, k), 'head', P.orange);
        cbMarker(cx, cy, L, cap, tPos, lerp(eqP ? 0.25 : 0, eqC ? 0.25 : 0, k), 'tail', P.purple);

        tx(Math.round(lerp(pv.size, st.size, k)) + '/' + cap, cx, cy - 8, L.fs + 3, P.text + 'ff', 'center', true);
        tx('원소 수', cx, cy + 12, L.fs, P.sub + 'ee', 'center', false);

        var capY = cy + L.LR + 11 + L.lh / 2;
        if (!step) {
            lines(CB_HINT, L.maxW, L.fs).forEach(function (txt, j) {
                tx(txt, cx, capY + j * L.lh, L.fs, P.sub + 'ff', 'center', false);
            });
        } else {
            cbCapLines(st, L.maxW, L.fs).forEach(function (line, j) {
                var col = line.kind === 0 ? P.yellow + 'ff' : (line.kind === 1 ? P.text + 'ee' : P.green + 'ff');
                tx(line.txt, cx, capY + j * L.lh, L.fs, col, 'center', line.kind !== 1);
            });
        }
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