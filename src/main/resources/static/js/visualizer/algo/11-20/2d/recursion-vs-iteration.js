/**
 * 재귀 vs 반복 시각화 시각화
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
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
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
    function currentSteps() {
        if (mode === 'fib') return FIB_STEPS;
        if (mode === 'tail') return TAIL_STEPS;
        return STACK_STEPS;
    }
    function defaultLog() {
        if (mode === 'fib') return '메모이제이션 없는 재귀 피보나치의 호출 트리와 중복 계산을 봅니다.';
        if (mode === 'tail') return '꼬리 재귀가 최적화 지원 여부에 따라 스택을 어떻게 쓰는지 비교합니다.';
        return '재귀의 호출 스택과 반복문의 변수를 같은 계산으로 비교합니다.';
    }
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    /* ===================== 레이아웃 ===================== */
    function fibR(w) { return Math.min(15, w / FIB_LEAVES / 2 - 2); }
    function capRows(s, w, fs) {
        var rows = [];
        [[s.cap, fs + 0.5, P.yellow, true], [s.cap2, fs - 0.5, P.text, false], [s.cap3, fs - 0.5, P.green, true]].forEach(function (it) {
            if (!it[0]) return;
            lines(it[0], w, it[1]).forEach(function (str) { rows.push({ str: str, sz: it[1], col: it[2], bold: it[3] }); });
        });
        return rows;
    }
    function capH(s, w, fs) {
        return capRows(s, w, fs).reduce(function (a, r) { return a + r.sz + 5; }, 0);
    }
    function layout(w, mob) {
        var fs = mob ? 10.5 : 12;
        var capY;
        if (mode === 'fib') capY = 22 + 4 * (mob ? 42 : 50) + fibR(w) + 24;
        else if (mode === 'tail') capY = mob ? 58 + 14 + TAIL_CALLS.length * 26 + 16 : 26 + TAIL_CALLS.length * 32 + 22;
        else capY = mob ? 20 + FACT_N * 26 + 58 : 26 + FACT_N * 32 + 22;
        var cap = 0;
        currentSteps().forEach(function (st) { cap = Math.max(cap, capH(st, w, fs)); });
        return { fs: fs, capY: capY, total: capY + cap + 6 };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 프레임과 변수 ===================== */
    function drawCaps(s, x0, w, y, fs) {
        capRows(s, w, fs).forEach(function (r) {
            tx(r.str, x0 + w / 2, y, r.sz, r.col + 'ff', 'center', r.bold);
            y += r.sz + 5;
        });
    }
    function frameBox(x, y, bw, bh, f, fs, a) {
        var col = f.ret ? P.green : (f.hot ? P.purple : P.teal);
        ctx.globalAlpha = a;
        rr(x, y, bw, bh, 4, col + (f.hot ? '44' : '22'), col + 'ff', f.hot ? 2.4 : 1.4);
        tx(f.t, x + 8, y + bh / 2, fs, P.text + 'ff', 'left', true);
        tx(f.note, x + bw - 8, y + bh / 2, fs - 1, (f.ret ? P.green : P.sub) + 'ff', 'right', false);
        ctx.globalAlpha = 1;
    }
    function drawPane(x, baseY, bw, fh, slots, frames, pframes, e, fs) {
        var k;
        for (k = 0; k < slots; k++) rr(x, baseY - (k + 1) * fh + 2, bw, fh - 4, 4, 'none', P.sub + '33', 1);
        frames.forEach(function (f, i) {
            var pf = pframes[i];
            var y = baseY - (i + 1) * fh + 2;
            var q;
            if (!pf) {
                frameBox(x, y - (1 - ez(seg(e, 0, 0.6))) * fh * 0.8, bw, fh - 4, f, fs, ez(seg(e, 0, 0.4)));
            } else if (pf.note === f.note) {
                frameBox(x, y, bw, fh - 4, f, fs, 1);
            } else {
                q = ez(seg(e, 0, 0.5));
                if (q < 1) frameBox(x, y, bw, fh - 4, pf, fs, 1 - q);
                frameBox(x, y, bw, fh - 4, f, fs, q);
            }
        });
        pframes.forEach(function (pf, i) {
            if (frames[i]) return;
            frameBox(x, baseY - (i + 1) * fh + 2 - ez(e) * fh * 0.8, bw, fh - 4, pf, fs, 1 - ez(seg(e, 0.2, 1)));
        });
    }
    function varBox(x, y, bw, bh, label, val, pval, e, fs, col) {
        var changed = val !== pval;
        var q = changed ? ez(seg(e, 0, 0.6)) : 1;
        var flash = changed ? 1 - ez(seg(e, 0.4, 1)) : 0;
        var cy = y + bh / 2;
        rr(x, y, bw, bh, 4, col + '22', col + 'ff', 1.4);
        if (flash > 0) {
            ctx.globalAlpha = flash;
            rr(x - 3, y - 3, bw + 6, bh + 6, 6, 'none', col + 'ff', 2);
            ctx.globalAlpha = 1;
        }
        if (changed && q < 1) {
            ctx.globalAlpha = 1 - q;
            tx(label + ' = ' + pval, x + 8, cy, fs, col + 'ff', 'left', true);
        }
        ctx.globalAlpha = q;
        tx(label + ' = ' + val, x + 8, cy, fs, col + 'ff', 'left', true);
        ctx.globalAlpha = 1;
    }

    /* ===================== 호출 스택 장면 ===================== */
    function drawStackScene(x0, top, w, mob, s, p, e, L) {
        var fs = L.fs;
        var fh = mob ? 26 : 32;
        var half = mob ? w : w / 2 - 8;
        var rx = x0 + w / 2 + 8;
        var baseY = top + (mob ? 20 : 26) + FACT_N * fh;
        var rCol = s.iter.pre ? P.sub : P.green;
        tx('재귀: 호출 스택', x0, top + (mob ? 6 : 8), fs, P.sub + 'ff', 'left', true);
        drawPane(x0, baseY, half, fh, FACT_N, s.frames, p.frames, e, fs);
        if (mob) {
            tx('반복: 변수', x0, baseY + 8, fs, P.sub + 'ff', 'left', true);
            varBox(x0, baseY + 20, w / 2 - 3, 26, 'i', s.iter.i, p.iter.i, e, fs, P.teal);
            varBox(x0 + w / 2 + 3, baseY + 20, w / 2 - 3, 26, 'result', s.iter.result, p.iter.result, e, fs, rCol);
        } else {
            tx('반복: 변수', rx, top + 8, fs, P.sub + 'ff', 'left', true);
            varBox(rx, baseY - 2 * fh + 2, half, fh - 4, 'i', s.iter.i, p.iter.i, e, fs, P.teal);
            varBox(rx, baseY - fh + 2, half, fh - 4, 'result', s.iter.result, p.iter.result, e, fs, rCol);
        }
        drawCaps(s, x0, w, top + L.capY, fs);
    }

    /* ===================== 꼬리 호출 장면 ===================== */
    function tailLeftOf(st) {
        if (st.k <= 0) return [];
        var c = TAIL_CALLS[st.k - 1];
        return [{ t: 'fact_tail', note: st.done ? 'return 120' : 'n=' + c[0] + ' acc=' + c[1], hot: true, ret: st.done }];
    }
    function tailRightOf(st) {
        var out = [];
        var k;
        for (k = 0; k < st.k; k++) out.push({ t: 'f(' + TAIL_CALLS[k][0] + ', ' + TAIL_CALLS[k][1] + ')', note: st.done ? 'return 120' : '', hot: !st.done && k === st.k - 1, ret: st.done });
        return out;
    }
    function drawTailScene(x0, top, w, mob, s, p, e, L) {
        var fs = L.fs;
        var fh = mob ? 26 : 32;
        var n = TAIL_CALLS.length;
        var half = mob ? w : w / 2 - 8;
        var rx = x0 + w / 2 + 8;
        var leftBase = top + (mob ? 46 : 26 + n * fh);
        var rightBase = top + (mob ? 202 : 26 + n * fh);
        if (mob) {
            tx('최적화 지원: 프레임 재사용', x0, top + 6, fs - 1, P.sub + 'ff', 'left', true);
            tx('미지원: 프레임 누적', x0, top + 58, fs - 1, P.sub + 'ff', 'left', true);
        } else {
            tx('최적화 지원: 프레임 재사용', x0, top + 8, fs - 1, P.sub + 'ff', 'left', true);
            tx('미지원: 프레임 누적', rx, top + 8, fs - 1, P.sub + 'ff', 'left', true);
        }
        drawPane(x0, leftBase, half, fh, 1, tailLeftOf(s), tailLeftOf(p), e, fs);
        drawPane(mob ? x0 : rx, rightBase, half, fh, n, tailRightOf(s), tailRightOf(p), e, fs);
        drawCaps(s, x0, w, top + L.capY, fs);
    }

    /* ===================== 피보나치 장면 ===================== */
    function drawFibScene(x0, top, w, mob, s, p, e, L) {
        var fs = L.fs;
        var lh = mob ? 42 : 50;
        var r = fibR(w);
        var px = function (nd) { return x0 + (nd.x + 0.5) / FIB_LEAVES * w; };
        var py = function (nd) { return top + 22 + nd.depth * lh; };
        var fresh = s.cur >= 0 && s.cur >= p.upto;
        var summary = s.cur < 0 && s.upto > 0 && p.cur >= 0;
        var g = fresh ? ez(seg(e, 0, 0.6)) : 1;
        var k;
        for (k = 0; k < FIB_NODES.length; k++) {
            var nd = FIB_NODES[k];
            if (!nd.parent || k >= s.upto) continue;
            var x1 = px(nd.parent), y1 = py(nd.parent) + r;
            var x2 = px(nd), y2 = py(nd) - r;
            if (fresh && k === s.cur && g < 1) {
                ln(x1, y1, lerp(x1, x2, g), lerp(y1, y2, g), P.purple + 'ff', 2);
                circ(lerp(x1, x2, g), lerp(y1, y2, g), 4, P.purple + 'ff', 'none', 1);
            } else {
                ln(x1, y1, x2, y2, P.sub + '88', 1.2);
            }
        }
        for (k = 0; k < FIB_NODES.length; k++) {
            var n2 = FIB_NODES[k];
            var called = k < s.upto;
            var dup = called && s.occ[k] > 1;
            var isNew = fresh && k === s.cur;
            var nx = px(n2), ny = py(n2);
            var fill = 'none', stroke = P.sub + '33', lw = 1, tc = P.sub + 'aa';
            if (called) {
                fill = (dup ? P.orange : P.teal) + '44';
                stroke = (dup ? P.orange : P.teal) + 'ff';
                lw = 1.6;
                tc = P.text + 'ff';
            }
            if (k === s.cur) { stroke = P.purple + 'ff'; lw = 3; }
            ctx.globalAlpha = isNew ? ez(seg(e, 0.6, 1)) : 1;
            circ(nx, ny, r, fill, stroke, lw);
            tx(String(n2.n), nx, ny, fs, tc, 'center', called);
            ctx.globalAlpha = 1;
            if (summary && dup) {
                ctx.globalAlpha = 1 - ez(e);
                circ(nx, ny, r + 3 + 6 * ez(e), 'none', P.orange + 'ff', 2);
                ctx.globalAlpha = 1;
            }
        }
        drawCaps(s, x0, w, top + L.capY, fs);
    }

    /* ===================== 진입 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var e = clamp01(t);
        var s = step || currentSteps()[0];
        var p = prev || s;
        if (mode === 'fib') drawFibScene(x0, top, w, mob, s, p, e, L);
        else if (mode === 'tail') drawTailScene(x0, top, w, mob, s, p, e, L);
        else drawStackScene(x0, top, w, mob, s, p, e, L);
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