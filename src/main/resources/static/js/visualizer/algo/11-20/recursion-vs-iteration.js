/**
 * 재귀 vs 반복 시각화
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
    var root    = el('div', 'ri-viz');
    var toolbar = el('div', 'ri-viz__toolbar');
    var tbLeft  = el('div', 'ri-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'ri-viz__title', 'RECURSION VS ITERATION'));

    var modeWrap = el('div', 'ri-viz__mode');
    var modeDefs = [
        { key: 'stack', label: '호출 스택' },
        { key: 'fib', label: '중복 계산' },
        { key: 'tail', label: '꼬리 호출' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'ri-viz__mode-btn' + (i === 0 ? ' ri-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'ri-viz__speed');
    speedWrap.appendChild(el('span', 'ri-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'ri-viz__speed-btn' + (i === 0 ? ' ri-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'ri-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'ri-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'ri-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'ri-viz__controls');
    var btnPlay  = el('button', 'ri-viz__btn ri-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'ri-viz__btn', '▶| STEP');
    var btnReset = el('button', 'ri-viz__btn', '↺ RESET');
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

    /* ===================== 엔진: 재귀와 반복 ===================== */
    function bat(n) {
        return [0, 1, 3, 6, 7, 8].indexOf(Math.abs(n) % 10) >= 0;
    }
    function eu(n) {
        return bat(n) ? '을' : '를';
    }
    function eun(n) {
        return bat(n) ? '은' : '는';
    }
    function ga(n) {
        return bat(n) ? '이' : '가';
    }
    function wa(n) {
        return bat(n) ? '과' : '와';
    }

    /* ===================== 데이터: 호출 스택 (팩토리얼) ===================== */
    var FACT_N = 5;
    var STACK_STEPS = [];
    (function () {
        var N = FACT_N;
        var n;
        var m;
        var j;
        var vals = [1];
        for (m = 2; m <= N; m++) vals.push(vals[m - 2] * m);
        STACK_STEPS.push({ kind: 'stack', frames: [], iter: { i: '?', result: '1', pre: true }, cap: 'fact(' + N + ') = ' + N + ' × fact(' + (N - 1) + ')', cap2: '재귀는 호출마다 프레임이 스택에 쌓입니다', cap3: '', log: N + '!' + eu(N) + ' 두 가지 방식으로 계산합니다. 재귀 fact(n)은 n × fact(n - 1)을 호출하다가 fact(1)에서 멈추고, 반복문은 result에 1부터 N까지 곱합니다. 왼쪽은 호출 스택, 오른쪽은 반복문의 변수입니다.' });
        for (n = N; n >= 1; n--) {
            var fr = [];
            for (m = N; m >= n; m--) fr.push({ t: 'fact(' + m + ')', note: m === 1 ? 'return 1' : m + ' × ?', hot: m === n });
            STACK_STEPS.push({ kind: 'stack', frames: fr, iter: { i: '?', result: '1', pre: true }, cap: '호출: fact(' + n + ')', cap2: n === 1 ? '기저 사례: 더 호출하지 않고 1을 돌려줌' : 'fact(' + (n - 1) + ')의 결과를 기다리며 프레임이 쌓임', cap3: '스택 깊이 ' + (N - n + 1),
                log: n === 1 ? 'fact(1)은 기저 사례라 재귀 호출 없이 1을 돌려줍니다. 지금 스택에는 fact(' + N + ')부터 fact(1)까지 프레임 ' + N + '개가 쌓여 있습니다. 반복문은 아직 곱셈을 시작하지 않았고 변수는 2개뿐입니다.' : 'fact(' + n + ')' + eu(n) + ' 호출합니다. fact(' + (n + 1) + ')' + eun(n + 1) + ' ' + (n + 1) + ' × fact(' + n + ')의 결과를 기다려야 하므로 프레임이 스택에 남습니다. 스택 깊이는 ' + (N - n + 1) + '입니다.' });
        }
        for (j = 1; j <= N; j++) {
            var fr2 = [];
            for (m = N; m >= j; m--) fr2.push({ t: 'fact(' + m + ')', note: m === j ? (j === 1 ? 'return 1' : j + ' × ' + vals[j - 2] + ' = ' + vals[j - 1]) : m + ' × ?', hot: m === j, ret: m === j });
            STACK_STEPS.push({ kind: 'stack', frames: fr2, iter: { i: String(j), result: String(vals[j - 1]), pre: false }, cap: 'fact(' + j + ') 반환 = ' + vals[j - 1], cap2: '프레임을 꺼내며 결과를 위로 전달', cap3: '스택 깊이 ' + (N - j + 1) + ' · 반복문 result = ' + vals[j - 1],
                log: j === 1 ? 'fact(1)이 1을 돌려주고 프레임이 사라집니다. 반복문에서 i = 1일 때 result = 1과 같은 값입니다.' : 'fact(' + j + ')' + ga(j) + ' ' + j + ' × ' + vals[j - 2] + ' = ' + vals[j - 1] + eu(vals[j - 1]) + ' 돌려줍니다. 반복문에서 i = ' + j + '일 때 result = ' + vals[j - 1] + wa(vals[j - 1]) + ' 같은 값이며, 반복문은 프레임 없이 변수 두 개만 갱신했습니다.' });
        }
        STACK_STEPS.push({ kind: 'stack', frames: [], iter: { i: String(N), result: String(vals[N - 1]), pre: false }, cap: 'fact(' + N + ') = ' + vals[N - 1], cap2: '재귀: 프레임 최대 ' + N + '개 · 반복: 변수 2개', cap3: '깊이 n에 비례하는 O(n) 대 O(1)',
            log: '정리 — 두 방식 모두 ' + vals[N - 1] + '을 얻습니다. 재귀는 깊이 ' + N + '만큼 스택 프레임을 썼고, 반복문은 변수 두 개로 끝났습니다. 깊이가 매우 큰 입력에서는 스택이 가득 차 스택 오버플로우가 날 수 있습니다.' });
    })();

    /* ===================== 데이터: 중복 계산 (피보나치) ===================== */
    var FIB_N = 5;
    var FIB_NODES = [];
    var FIB_LEAVES = 0;
    function buildFib(n, depth, parent) {
        var node = { n: n, depth: depth, parent: parent, order: FIB_NODES.length, x: 0, kids: [] };
        FIB_NODES.push(node);
        if (n >= 2) {
            node.kids.push(buildFib(n - 1, depth + 1, node));
            node.kids.push(buildFib(n - 2, depth + 1, node));
            node.x = (node.kids[0].x + node.kids[1].x) / 2;
        } else {
            node.x = FIB_LEAVES;
            FIB_LEAVES++;
        }
        return node;
    }
    buildFib(FIB_N, 0, null);
    var FIB_STEPS = [];
    (function () {
        var seen = {};
        var dups = 0;
        var k;
        var total = FIB_NODES.length;
        FIB_STEPS.push({ kind: 'fib', upto: 0, cur: -1, occ: [], cap: 'fib(' + FIB_N + ')의 호출 트리', cap2: 'fib(n) = fib(n-1) + fib(n-2)', cap3: '', log: 'fib(' + FIB_N + ')' + eu(FIB_N) + ' 메모이제이션 없이 재귀로 계산하면 호출이 어떻게 퍼지는지 봅니다. 노드는 fib(n) 호출 하나이고 숫자는 n입니다. 같은 n이 이미 계산된 적이 있으면 주황색으로 표시합니다.' });
        var occ = [];
        for (k = 0; k < total; k++) {
            var nd = FIB_NODES[k];
            seen[nd.n] = (seen[nd.n] || 0) + 1;
            occ.push(seen[nd.n]);
            if (seen[nd.n] > 1) dups++;
            FIB_STEPS.push({ kind: 'fib', upto: k + 1, cur: k, occ: occ.slice(), cap: '호출 ' + (k + 1) + ': fib(' + nd.n + ')', cap2: nd.n + '에 대한 계산은 이번이 ' + seen[nd.n] + '번째', cap3: '중복 호출 누적 ' + dups + '번',
                log: '호출 ' + (k + 1) + '번째는 fib(' + nd.n + ')입니다. ' + (nd.n < 2 ? '기저 사례라 바로 ' + nd.n + eu(nd.n) + ' 돌려줍니다. ' : 'fib(' + (nd.n - 1) + ')' + wa(nd.n - 1) + ' fib(' + (nd.n - 2) + ')' + eu(nd.n - 2) + ' 차례로 호출합니다. ') + (seen[nd.n] > 1 ? 'fib(' + nd.n + ')' + eun(nd.n) + ' 이미 ' + (seen[nd.n] - 1) + '번 계산한 값이라 같은 일을 반복합니다.' : '처음 계산하는 값입니다.') });
        }
        var cnt = {};
        for (k = 0; k < total; k++) cnt[FIB_NODES[k].n] = (cnt[FIB_NODES[k].n] || 0) + 1;
        FIB_STEPS.push({ kind: 'fib', upto: total, cur: -1, occ: occ.slice(), cap: '총 ' + total + '번 호출, 서로 다른 값은 ' + (FIB_N + 1) + '가지', cap2: 'fib(1) ' + cnt[1] + '번 · fib(2) ' + cnt[2] + '번 · fib(3) ' + cnt[3] + '번 계산', cap3: '메모이제이션: 호출 ' + (2 * FIB_N - 1) + '번, 계산 ' + (FIB_N + 1) + '번',
            log: '정리 — fib(' + FIB_N + ') 하나에 호출이 ' + total + '번 일어나지만 서로 다른 n은 0부터 ' + FIB_N + '까지 ' + (FIB_N + 1) + '가지뿐이라 ' + dups + '번은 같은 계산의 반복입니다. 호출 수는 n이 1 늘 때마다 대략 1.6배씩 늘어나 fib(30)에서는 2,692,537번에 이릅니다. 계산한 값을 저장하는 메모이제이션이나 반복문으로 바꾸면 덧셈을 상수 시간으로 볼 때 n에 비례하는 시간이 됩니다.' });
    })();

    /* ===================== 데이터: 꼬리 호출 ===================== */
    var TAIL_CALLS = [[5, 1], [4, 5], [3, 20], [2, 60], [1, 120]];
    var TAIL_STEPS = [];
    (function () {
        var k;
        TAIL_STEPS.push({ kind: 'tail', k: 0, done: false, cap: 'fact_tail(n, acc): 호출이 마지막 연산', cap2: '호출 뒤에 곱셈이 남아 있지 않음', cap3: '', log: '꼬리 재귀 버전은 곱셈을 호출 전에 acc에 미리 끝내 두고, 재귀 호출의 결과를 그대로 돌려줍니다. 호출 뒤에 할 일이 없으므로 이전 프레임을 재사용해도 되지만, 그 최적화를 지원하는 언어와 아닌 언어가 있습니다.' });
        for (k = 1; k <= TAIL_CALLS.length; k++) {
            var c = TAIL_CALLS[k - 1];
            TAIL_STEPS.push({ kind: 'tail', k: k, done: false, cap: '호출 ' + k + ': fact_tail(' + c[0] + ', ' + c[1] + ')', cap2: k === TAIL_CALLS.length ? 'n = 1이면 acc를 그대로 반환' : '다음 호출: fact_tail(' + TAIL_CALLS[k][0] + ', ' + TAIL_CALLS[k][1] + ')', cap3: '미지원이면 프레임 ' + k + '개 · 지원하면 1개',
                log: 'fact_tail(' + c[0] + ', ' + c[1] + ')' + eu(c[1]) + ' 실행합니다. ' + (k === TAIL_CALLS.length ? 'n이 1이므로 acc = ' + c[1] + eu(c[1]) + ' 반환합니다. ' : '곱셈 ' + c[0] + ' × ' + c[1] + ' = ' + (c[0] * c[1]) + '은 호출 전에 끝났고, 마지막 연산이 fact_tail(' + TAIL_CALLS[k][0] + ', ' + TAIL_CALLS[k][1] + ') 호출입니다. ') + '꼬리 호출 최적화가 있으면 같은 프레임의 n과 acc만 바뀌고, 없으면 프레임이 ' + k + '개 쌓입니다.' });
        }
        TAIL_STEPS.push({ kind: 'tail', k: TAIL_CALLS.length, done: true, cap: '결과 120', cap2: '최적화가 있으면 스택 깊이 1, 없으면 ' + TAIL_CALLS.length, cap3: 'Java · CPython은 미지원', log: '정리 — 결과 120은 같지만 스택 깊이가 다릅니다. 꼬리 호출 최적화가 있는 환경에서는 깊이가 1로 유지되어 큰 n에서도 스택 오버플로우가 없습니다. Java는 이 최적화를 하지 않고 CPython도 하지 않아 꼬리 재귀로 써도 깊이가 n까지 자랍니다.' });
    })();

    /* ===================== 상태 ===================== */
    var mode    = 'stack';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'fib') return FIB_STEPS;
        if (mode === 'tail') return TAIL_STEPS;
        return STACK_STEPS;
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

    /* ===================== 공통: 캡션과 프레임 ===================== */
    function drawCaps(s, x0, w, y, fs) {
        if (s.cap) tx(s.cap, x0 + w / 2, y, fs - 0.5, P.yellow + 'ff', 'center', true);
        if (s.cap2) tx(s.cap2, x0 + w / 2, y + 19, fs - 1, P.text + 'ee', 'center', false);
        if (s.cap3) tx(s.cap3, x0 + w / 2, y + 38, fs - 1, P.green + 'ee', 'center', true);
    }
    function drawFrames(frames, x, baseY, half, fh, fs, slots) {
        var k;
        for (k = 0; k < slots; k++) rr(x, baseY - (k + 1) * fh + 2, half, fh - 4, 4, 'none', P.sub + '33', 1);
        frames.forEach(function (f, i) {
            var y = baseY - (i + 1) * fh + 2;
            var col = f.ret ? P.green : f.hot ? P.purple : P.teal;
            rr(x, y, half, fh - 4, 4, col + (f.hot ? '44' : '22'), col + 'ff', f.hot ? 2.4 : 1.4);
            tx(f.t, x + 8, y + (fh - 4) / 2, fs, P.text + 'ff', 'left', true);
            tx(f.note, x + half - 8, y + (fh - 4) / 2, fs - 1, f.ret ? P.green + 'ff' : P.sub + 'ff', 'right', false);
        });
    }

    /* ===================== 호출 스택과 반복 변수 ===================== */
    function drawStack(x0, top, w, mob, s) {
        var fs = mob ? 11.5 : 13;
        var half = w / 2 - 8;
        var fh = mob ? 28 : 32;
        var baseY = top + 26 + FACT_N * fh;
        tx('재귀: 호출 스택', x0, top + 8, fs, P.sub + 'ff', 'left', true);
        tx('반복: 변수', x0 + w / 2 + 8, top + 8, fs, P.sub + 'ff', 'left', true);
        drawFrames(s.frames, x0, baseY, half, fh, fs, FACT_N);
        var rx = x0 + w / 2 + 8;
        rr(rx, baseY - 2 * fh + 2, half, 2 * fh - 4, 4, P.teal + '22', P.teal + 'ff', 1.4);
        tx('i = ' + s.iter.i, rx + 8, baseY - 2 * fh + 2 + fh / 2 - 2, fs, P.text + 'ff', 'left', true);
        tx('result = ' + s.iter.result, rx + 8, baseY - fh + fh / 2, fs, s.iter.pre ? P.sub + 'ff' : P.green + 'ff', 'left', true);
        drawCaps(s, x0, w, baseY + 22, fs);
    }

    /* ===================== 피보나치 호출 트리 ===================== */
    function drawFib(x0, top, w, mob, s) {
        var fs = mob ? 11.5 : 13;
        var lh = mob ? 42 : 50;
        var r = Math.min(15, w / FIB_LEAVES / 2 - 2);
        var k;
        var px = function (nd) { return x0 + (nd.x + 0.5) / FIB_LEAVES * w; };
        var py = function (nd) { return top + 22 + nd.depth * lh; };
        for (k = 0; k < FIB_NODES.length; k++) {
            var nd = FIB_NODES[k];
            if (nd.parent && k < s.upto) {
                ctx.beginPath();
                ctx.moveTo(px(nd.parent), py(nd.parent) + r);
                ctx.lineTo(px(nd), py(nd) - r);
                ctx.strokeStyle = P.sub + '88';
                ctx.lineWidth = 1.2;
                ctx.stroke();
            }
        }
        for (k = 0; k < FIB_NODES.length; k++) {
            var n2 = FIB_NODES[k];
            var called = k < s.upto;
            var dup = called && s.occ[k] > 1;
            var fill = 'none';
            var stroke = P.sub + '33';
            var lw = 1;
            var tc = P.sub + 'aa';
            if (called) {
                fill = (dup ? P.orange : P.teal) + '44';
                stroke = (dup ? P.orange : P.teal) + 'ff';
                lw = 1.6;
                tc = P.text + 'ff';
            }
            if (k === s.cur) {
                stroke = P.purple + 'ff';
                lw = 3;
            }
            ctx.beginPath();
            ctx.arc(px(n2), py(n2), r, 0, Math.PI * 2);
            if (fill !== 'none') {
                ctx.fillStyle = fill;
                ctx.fill();
            }
            ctx.strokeStyle = stroke;
            ctx.lineWidth = lw;
            ctx.stroke();
            tx(String(n2.n), px(n2), py(n2), fs, tc, 'center', called);
        }
        drawCaps(s, x0, w, top + 22 + 4 * lh + r + 24, fs);
    }

    /* ===================== 꼬리 호출: 프레임 재사용 대 누적 ===================== */
    function drawTail(x0, top, w, mob, s) {
        var fs = mob ? 11.5 : 13;
        var half = w / 2 - 8;
        var fh = mob ? 28 : 32;
        var baseY = top + 26 + TAIL_CALLS.length * fh;
        var rx = x0 + w / 2 + 8;
        var left = [];
        var right = [];
        var k;
        tx('최적화 지원: 프레임 재사용', x0, top + 8, fs - 1, P.sub + 'ff', 'left', true);
        tx('미지원: 프레임 누적', rx, top + 8, fs - 1, P.sub + 'ff', 'left', true);
        if (s.k > 0) {
            var c = TAIL_CALLS[s.k - 1];
            left.push({ t: 'fact_tail', note: s.done ? 'return 120' : 'n=' + c[0] + ' acc=' + c[1], hot: true, ret: s.done });
            for (k = 0; k < s.k; k++) right.push({ t: 'f(' + TAIL_CALLS[k][0] + ', ' + TAIL_CALLS[k][1] + ')', note: s.done ? 'return 120' : '', hot: !s.done && k === s.k - 1, ret: s.done });
        }
        drawFrames(left, x0, baseY, half, fh, fs, TAIL_CALLS.length);
        drawFrames(right, rx, baseY, half, fh, fs, TAIL_CALLS.length);
        drawCaps(s, x0, w, baseY + 22, fs);
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

        var dsStep = step || currentSteps()[0];
        if (dsStep.kind === 'fib') drawFib(padX, top, fullW, mob, dsStep);
        else if (dsStep.kind === 'tail') drawTail(padX, top, fullW, mob, dsStep);
        else drawStack(padX, top, fullW, mob, dsStep);

        if (!step) {
            var hint = '아래 STEP으로 재귀와 반복의 동작을 확인하세요.';
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
        neededH = mob ? 310 : 340;
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
        if (mode === 'fib') return '메모이제이션 없는 재귀 피보나치의 호출 트리와 중복 계산을 봅니다.';
        if (mode === 'tail') return '꼬리 재귀가 최적화 지원 여부에 따라 스택을 어떻게 쓰는지 비교합니다.';
        return '재귀의 호출 스택과 반복문의 변수를 같은 계산으로 비교합니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('ri-viz__speed-btn--active'); });
        btn.classList.add('ri-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('ri-viz__mode-btn--active', d.key === m); });
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