/**
 * 세그먼트 트리 시각화 시각화
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
    var root    = el('div', 'seg-viz');
    var toolbar = el('div', 'seg-viz__toolbar');
    var tbLeft  = el('div', 'seg-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'seg-viz__title', 'SEGTREE'));

    var modeWrap = el('div', 'seg-viz__mode');
    var modeDefs = [
        { key: 'build', label: '트리 만들기' },
        { key: 'query', label: '구간 합 쿼리' },
        { key: 'update', label: '값 갱신' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'seg-viz__mode-btn' + (i === 0 ? ' seg-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'seg-viz__speed');
    speedWrap.appendChild(el('span', 'seg-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'seg-viz__speed-btn' + (i === 0 ? ' seg-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'seg-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'seg-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'seg-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'seg-viz__controls');
    var btnPlay  = el('button', 'seg-viz__btn seg-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'seg-viz__btn', '▶| STEP');
    var btnReset = el('button', 'seg-viz__btn', '↺ RESET');
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
    var mode    = 'build';
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

    /* ===================== 엔진: 구간 합 세그먼트 트리 ===================== */
    function jg(n, a, b) {
        return n + ([0, 1, 3, 6, 7, 8].indexOf(Math.abs(n) % 10) >= 0 ? a : b);
    }
    function jro(n) {
        return n + ([0, 3, 6].indexOf(Math.abs(n) % 10) >= 0 ? '으로' : '로');
    }
    var ARR = [5, 8, 6, 3, 2, 7, 1, 4];
    var N = ARR.length;
    var TREE = [];
    var RNG = [];
    function build(node, l, r) {
        RNG[node] = [l, r];
        if (l === r) {
            TREE[node] = ARR[l];
            return;
        }
        var m = (l + r) >> 1;
        build(node * 2, l, m);
        build(node * 2 + 1, m + 1, r);
        TREE[node] = TREE[node * 2] + TREE[node * 2 + 1];
    }
    build(1, 0, N - 1);
    function depthOf(node) {
        var d = 0;
        while (node > 1) { node >>= 1; d++; }
        return d;
    }
    function rtxt(node) { return '[' + RNG[node][0] + ', ' + RNG[node][1] + ']'; }
    var MAXD = depthOf(2 * N - 1);

    /* ===================== 데이터: 트리 만들기 ===================== */
    var BUILD_STEPS = [
        { show: 99, st: {}, cap: '', cap2: '', arr: [], log: '세그먼트 트리는 배열의 구간 정보(합, 최솟값 등)를 이진 트리에 미리 저장해 두는 자료구조입니다. 배열 ' + ARR.join(', ') + '의 구간 합 트리를 아래에서 위로 만들어 봅니다.' }
    ];
    for (var bd = MAXD; bd >= 0; bd--) {
        (function (d) {
            var nodes = [];
            for (var i = 1; i < 2 * N; i++) if (depthOf(i) === d) nodes.push(i);
            var step = { show: d, st: {}, cap: '', cap2: '', arr: [] };
            nodes.forEach(function (i) { step.st[i] = 'new'; });
            if (d === MAXD) {
                step.cap = '리프: 배열 원소 ' + N + '개를 그대로 저장';
                step.log = '맨 아래 리프 노드 ' + N + '개에 배열 원소를 그대로 저장합니다. 리프 하나가 길이 1인 구간 하나를 담당합니다.';
            } else {
                step.cap = '두 자식의 합으로 ' + nodes.length + '개 노드 계산';
                step.cap2 = nodes.map(function (i) { return rtxt(i) + '=' + TREE[i]; }).join('  ');
                step.log = '한 층 위의 노드 ' + nodes.length + '개를 만듭니다. 각 노드는 두 자식 구간의 합을 저장하고, 담당 구간은 두 자식 구간을 이은 것입니다.' + (d === 0 ? ' 루트는 전체 구간 ' + rtxt(1) + '의 합 ' + TREE[1] + '을 저장합니다.' : '');
            }
            BUILD_STEPS.push(step);
        })(bd);
    }
    BUILD_STEPS.push({ show: 0, st: {}, cap: '노드 ' + (2 * N - 1) + '개 · 층 ' + (MAXD + 1) + '개', cap2: '', arr: [], log: '정리 — 원소 ' + N + '개에 노드는 ' + (2 * N - 1) + '개이고 층은 ' + (MAXD + 1) + '개(높이 ' + MAXD + ')입니다. 구간을 절반씩 나누므로 층 수가 ⌈log2 n⌉ + 1이고, 만드는 데 O(n)이 걸립니다.' });

    /* ===================== 데이터: 구간 합 쿼리 ===================== */
    var QL = 2;
    var QR = 6;
    var QEVS = [];
    function qrun(node, l, r) {
        if (QR < l || r < QL) { QEVS.push({ n: node, t: 'out' }); return; }
        if (QL <= l && r <= QR) { QEVS.push({ n: node, t: 'full' }); return; }
        QEVS.push({ n: node, t: 'part' });
        var m = (l + r) >> 1;
        qrun(node * 2, l, m);
        qrun(node * 2 + 1, m + 1, r);
    }
    qrun(1, 0, N - 1);
    var QUERY_ARR = [];
    for (var qi = QL; qi <= QR; qi++) QUERY_ARR.push(qi);
    var QUERY_STEPS = [
        { show: 0, st: {}, sum: [], cap: '', cap2: '', arr: QUERY_ARR, log: '구간 [' + QL + ', ' + QR + ']의 합을 구합니다. 배열을 직접 더하면 ' + (QR - QL + 1) + '개를 훑어야 하지만, 세그먼트 트리는 루트에서 내려가며 이미 저장된 구간 합을 재사용합니다.' }
    ];
    var qst = {};
    var qsum = [];
    QEVS.forEach(function (ev) {
        qst[ev.n] = ev.t;
        var msg;
        if (ev.t === 'out') {
            msg = '구간 ' + rtxt(ev.n) + ' 노드는 찾는 구간 [' + QL + ', ' + QR + ']과 겹치지 않으므로 0으로 보고 건너뜁니다. 더 내려가지 않습니다.';
        } else if (ev.t === 'full') {
            qsum.push(TREE[ev.n]);
            msg = '구간 ' + rtxt(ev.n) + ' 노드는 찾는 구간 안에 완전히 포함됩니다. 저장된 값 ' + jg(TREE[ev.n], '을', '를') + ' 그대로 더하고 더 내려가지 않습니다.';
        } else {
            msg = '구간 ' + rtxt(ev.n) + ' 노드는 찾는 구간과 일부만 겹칩니다. 두 자식으로 나누어 각각 확인합니다.';
        }
        var snapSt = {};
        Object.keys(qst).forEach(function (k) { snapSt[k] = qst[k]; });
        QUERY_STEPS.push({ show: 0, st: snapSt, sum: qsum.slice(), cap: qsum.length ? '합계: ' + qsum.join(' + ') + (qsum.length > 1 ? ' = ' + qsum.reduce(function (a, b) { return a + b; }, 0) : '') : '아직 더한 값 없음', cap2: '', arr: QUERY_ARR, log: msg });
    });
    var QTOTAL = qsum.reduce(function (a, b) { return a + b; }, 0);
    var QUSED = qsum.length;
    QUERY_STEPS.push({ show: 0, st: QUERY_STEPS[QUERY_STEPS.length - 1].st, sum: qsum.slice(), cap: '합계 ' + QTOTAL + ' · 방문 ' + QEVS.length + '개 · 합산 ' + QUSED + '개', cap2: '', arr: QUERY_ARR, log: '정리 — 구간 합은 ' + qsum.join(' + ') + ' = ' + QTOTAL + '입니다. 노드를 ' + QEVS.length + '개 방문했고 그 가운데 ' + QUSED + '개의 저장값만 더했습니다. 한 층에서 방문하는 노드는 최대 4개이므로 쿼리는 O(log n)입니다.' });

    /* ===================== 데이터: 값 갱신 ===================== */
    var UP_IDX = 3;
    var UP_NEW = 10;
    var UP_DELTA = UP_NEW - ARR[UP_IDX];
    var UP_PATH = [];
    (function () {
        var node = N + UP_IDX;
        while (node >= 1) { UP_PATH.push(node); node >>= 1; }
    })();
    var UP_VALS_OLD = TREE.slice();
    var UP_STEPS = [
        { show: 0, vals: UP_VALS_OLD, st: {}, cap: '', cap2: '', arr: [], mark: -1, log: '배열의 값을 바꾸면 그 원소를 포함하는 구간의 합도 모두 바뀝니다. A[' + UP_IDX + ']을 ' + ARR[UP_IDX] + '에서 ' + jro(UP_NEW) + ' 바꿀 때(변화량 ' + (UP_DELTA > 0 ? '+' : '') + UP_DELTA + ') 트리가 어떻게 갱신되는지 봅니다.' }
    ];
    var upVals = TREE.slice();
    var upSt = {};
    UP_PATH.forEach(function (node, i) {
        var oldV = upVals[node];
        if (i === 0) upVals[node] = UP_NEW;
        else upVals[node] = upVals[node * 2] + upVals[node * 2 + 1];
        upSt[node] = 'upd';
        var snapSt = {};
        Object.keys(upSt).forEach(function (k) { snapSt[k] = upSt[k]; });
        UP_STEPS.push({
            show: 0, vals: upVals.slice(), st: snapSt, cap: '구간 ' + rtxt(node) + ': ' + oldV + ' → ' + upVals[node], cap2: '', arr: [], mark: UP_IDX,
            log: i === 0
                ? '리프 ' + rtxt(node) + '의 값을 ' + oldV + '에서 ' + jro(upVals[node]) + ' 바꿉니다. 이 리프가 배열의 A[' + UP_IDX + ']에 해당합니다.'
                : '부모 ' + rtxt(node) + '의 값을 두 자식의 합으로 다시 계산합니다. ' + oldV + '에서 ' + jro(upVals[node]) + ' 바뀌고, 변화량 ' + (UP_DELTA > 0 ? '+' : '') + UP_DELTA + '만큼 달라집니다.'
        });
    });
    UP_STEPS.push({ show: 0, vals: upVals.slice(), st: upSt, cap: '갱신한 노드 ' + UP_PATH.length + '개 (전체 ' + (2 * N - 1) + '개)', cap2: '', arr: [], mark: UP_IDX, log: '정리 — 값 하나를 바꾸려고 리프에서 루트까지의 노드 ' + UP_PATH.length + '개만 다시 계산했습니다. 이 개수는 층 수와 같은 ⌈log2 n⌉ + 1이어서 갱신은 O(log n)입니다.' });

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'query') return QUERY_STEPS;
        if (mode === 'update') return UP_STEPS;
        return BUILD_STEPS;
    }
    function defaultLog() {
        if (mode === 'query') return '구간 합을 구할 때 트리의 어떤 노드를 방문하고 더하는지 봅니다.';
        if (mode === 'update') return '배열 값을 바꿀 때 트리의 노드가 어떻게 갱신되는지 봅니다.';
        return '배열에서 구간 합 세그먼트 트리를 아래에서 위로 만드는 과정을 봅니다.';
    }
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    /* ===================== 레이아웃 ===================== */
    var sgLayMemo = {};
    function sgCapH(w, fs) {
        var mx = 0;
        currentSteps().forEach(function (s) {
            var h = 0;
            if (s.cap) h += lines(s.cap, w - 8, fs).length * (fs + 5);
            if (s.cap2) h += lines(s.cap2, w - 8, fs).length * (fs + 5);
            if (h > mx) mx = h;
        });
        return mx;
    }
    function layout(w, mob) {
        var key = mode + '|' + Math.round(w) + (mob ? 'm' : 'd');
        if (sgLayMemo[key]) return sgLayMemo[key];
        var fs = mob ? 11 : 12;
        var bh = mob ? 20 : 24;
        var ah = mob ? 20 : 24;
        var dy = mob ? 38 : 50;
        var L = { fs: fs, bw: mob ? 24 : 40, bh: bh, ah: ah, dy: dy, leafW: w / N, treeTop: bh / 2 + 4, gc: mob ? 32 : 46, cw2: mob ? 28 : 38 };
        L.arrY = L.treeTop + MAXD * dy + bh / 2 + (mob ? 20 : 24);
        L.idxY = L.arrY + ah + 8;
        L.barY = L.arrY + ah + 18;
        L.accY = L.barY + 14;
        L.capTop = (mode === 'query' ? L.accY + ah : L.barY + 6) + 14;
        L.total = L.capTop + sgCapH(w, fs) + 6;
        sgLayMemo[key] = L;
        return L;
    }
    function sceneH(w, mob) { return layout(w, mob).total; }
    function sgPos(x0, top, L) {
        var pos = {};
        var i;
        for (i = 2 * N - 1; i >= 1; i--) {
            var x = i >= N ? x0 + (i - N + 0.5) * L.leafW : (pos[i * 2].x + pos[i * 2 + 1].x) / 2;
            pos[i] = { x: x, y: top + L.treeTop + depthOf(i) * L.dy };
        }
        return pos;
    }
    function sgVis(st, n) { return depthOf(n) >= st.show; }
    function sgVal(st, n) { return st.vals ? st.vals[n] : TREE[n]; }
    function sgArrVal(st, a) { return st.mark === a && st.vals ? st.vals[N + a] : ARR[a]; }
    function sgCover(st) {
        var out = [];
        var a;
        var n;
        for (a = 0; a < N; a++) out.push(false);
        for (n = 1; n < 2 * N; n++) {
            if (st.st[n] !== 'full') continue;
            for (a = RNG[n][0]; a <= RNG[n][1]; a++) out[a] = true;
        }
        return out;
    }

    /* ===================== 그리기 헬퍼 ===================== */
    function sgCol(st) {
        if (st === 'out') return P.red;
        if (st === 'full') return P.green;
        if (st === 'part') return P.yellow;
        if (st === 'upd') return P.orange;
        if (st === 'new') return P.teal;
        return P.sub;
    }
    function sgStyle(st) {
        if (!st) return null;
        return { col: sgCol(st), fill: sgCol(st) + '40', lw: 2 };
    }
    function sgBox(x, y, L, sty, alpha) {
        ctx.globalAlpha = alpha;
        if (sty) rr(x - L.bw / 2, y - L.bh / 2, L.bw, L.bh, 4, sty.fill, sty.col + 'ff', sty.lw);
        else rr(x - L.bw / 2, y - L.bh / 2, L.bw, L.bh, 4, 'none', P.sub + '88', 1.2);
        ctx.globalAlpha = 1;
    }
    function sgGhost(x, y, L) {
        rr(x - L.bw / 2, y - L.bh / 2, L.bw, L.bh, 4, 'none', P.sub + '44', 1);
    }
    function sgNum(x, y, str, L, alpha) {
        ctx.globalAlpha = alpha;
        tx(str, x, y, L.fs, P.text + 'ff', 'center', true);
        ctx.globalAlpha = 1;
    }
    function sgChip(x, y, L, str, col, alpha) {
        ctx.globalAlpha = alpha;
        rr(x - L.cw2 / 2, y - L.ah / 2, L.cw2, L.ah, 4, col + '40', col + 'ff', 1.4);
        tx(str, x, y, L.fs, P.text + 'ff', 'center', true);
        ctx.globalAlpha = 1;
    }
    function sgLink(a, b, L, col, lw, alpha) {
        ctx.globalAlpha = alpha;
        ln(a.x, a.y + L.bh / 2, b.x, b.y - L.bh / 2, col, lw);
        ctx.globalAlpha = 1;
    }
    function sgBar(x0, y, L, l, r, col, prog) {
        rr(x0 + l * L.leafW + 2, y, ((r - l + 1) * L.leafW - 4) * prog, 6, 3, col + 'bb', col + 'ff', 1);
    }
    function sgSlotX(gx0, L, idx) { return gx0 + idx * L.gc + L.gc / 2; }

    /* ===================== 장면 진입점 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var s = step || currentSteps()[0];
        var p = prev || s;
        var fresh = s !== p;
        var e = fresh ? clamp01(t) : 1;
        var L = layout(w, mob);
        var NN = 2 * N;
        var pos = sgPos(x0, top, L);
        var cur = -1;
        var mv = [];
        var rise = [];
        var dpos = [];
        var n;
        var a;
        if (fresh && mode !== 'build') {
            for (n = 1; n < NN; n++) {
                if ((s.st[n] || '') !== (p.st[n] || '')) cur = n;
            }
        }
        for (n = 1; n < NN; n++) {
            rise[n] = fresh && sgVis(s, n) && !sgVis(p, n);
            if (!sgVis(s, n)) mv[n] = 0;
            else if (!rise[n]) mv[n] = 1;
            else if (n >= N) mv[n] = ez(seg(e, (n - N) * 0.07, (n - N) * 0.07 + 0.5));
            else mv[n] = ez(seg(e, 0.2, 1));
            dpos[n] = pos[n];
            if (rise[n]) {
                var og = n >= N
                    ? { x: x0 + (n - N + 0.5) * L.leafW, y: top + L.arrY + L.ah / 2 }
                    : { x: (pos[n * 2].x + pos[n * 2 + 1].x) / 2, y: (pos[n * 2].y + pos[n * 2 + 1].y) / 2 };
                dpos[n] = { x: lerp(og.x, pos[n].x, mv[n]), y: lerp(og.y, pos[n].y, mv[n]) };
            }
        }

        if (mode === 'build') {
            for (n = 1; n < NN; n++) {
                if (!sgVis(s, n)) sgGhost(pos[n].x, pos[n].y, L);
            }
        }
        for (n = 2; n < NN; n++) {
            var par = n >> 1;
            var hot = mode === 'update' && s.st[n] === 'upd' && s.st[par] === 'upd';
            if (mv[n] * mv[par] <= 0) continue;
            sgLink(dpos[par], dpos[n], L, hot ? P.orange + 'ff' : P.sub + 'aa', hot ? 2.4 : 1.3, mv[n] * mv[par]);
        }
        for (n = 1; n < NN; n++) {
            if (!sgVis(s, n)) continue;
            var st = s.st[n];
            if (fresh && n === cur && e < 0.5) st = p.st[n];
            var sty = sgStyle(st);
            if (!sty && mode === 'build') sty = { col: P.teal, fill: P.teal + '18', lw: 1.4 };
            var na = rise[n] ? clamp01(mv[n] * 2.5) : 1;
            var nx = dpos[n].x;
            var ny = dpos[n].y;
            sgBox(nx, ny, L, sty, na);
            if (fresh && mode === 'update' && p.vals[n] !== s.vals[n]) {
                var f = ez(seg(e, 0.5, 1));
                sgNum(nx, ny - 7 * f, String(p.vals[n]), L, na * (1 - f));
                sgNum(nx, ny + 7 * (1 - f), String(s.vals[n]), L, na * f);
            } else {
                sgNum(nx, ny, String(sgVal(s, n)), L, na);
            }
        }

        if (fresh && cur > 0 && mode !== 'build') {
            var cp = pos[cur];
            var ccol = sgCol(mode === 'query' ? s.st[cur] : 'upd');
            if (mode === 'query') {
                if (cur > 1 && e < 0.5) {
                    var fp = pos[cur >> 1];
                    var dq = ez(seg(e, 0, 0.5));
                    circ(lerp(fp.x, cp.x, dq), lerp(fp.y, cp.y, dq), 5, ccol + 'ff');
                }
            } else if (e < 0.6) {
                var from = cur >= N
                    ? { x: x0 + (cur - N + 0.5) * L.leafW, y: top + L.arrY + L.ah / 2 }
                    : (s.st[cur * 2] === 'upd' ? pos[cur * 2] : pos[cur * 2 + 1]);
                var dd = ez(seg(e, 0.1, 0.5));
                sgChip(lerp(from.x, cp.x, dd), lerp(from.y, cp.y, dd), L, (UP_DELTA > 0 ? '+' : '') + UP_DELTA, P.orange, seg(e, 0.1, 0.2) * (1 - seg(e, 0.5, 0.6)));
            }
            if (e >= 0.5) {
                var rq = seg(e, 0.5, 1);
                ctx.globalAlpha = 1 - rq;
                circ(cp.x, cp.y, Math.max(L.bw, L.bh) / 2 + 4 + 10 * ez(rq), 'none', ccol + 'ff', 2);
                ctx.globalAlpha = 1;
            }
        }

        var barY = top + L.barY;
        rr(x0, barY, w, 6, 3, 'none', P.sub + '33', 1);
        if (mode === 'build') {
            var bl = [];
            for (n = 1; n < NN; n++) {
                if (s.st[n] === 'new') bl.push(n);
            }
            if (!bl.length && s.show === 0) bl.push(1);
            bl.forEach(function (bn, j) {
                var pr = fresh && s.st[bn] === 'new' ? ez(seg(e, 0.2 + j * 0.1, 0.7 + j * 0.1)) : 1;
                sgBar(x0, barY, L, RNG[bn][0], RNG[bn][1], P.teal, pr);
            });
        } else if (fresh && cur > 0) {
            sgBar(x0, barY, L, RNG[cur][0], RNG[cur][1], sgCol(mode === 'query' ? s.st[cur] : 'upd'), ez(seg(e, 0.5, 1)));
        }

        var covS = mode === 'query' ? sgCover(s) : null;
        var covP = mode === 'query' ? sgCover(p) : null;
        var ayTop = top + L.arrY;
        for (a = 0; a < N; a++) {
            var ax = x0 + a * L.leafW + 2;
            var aw = L.leafW - 4;
            var inQ = s.arr.indexOf(a) >= 0;
            var mk = s.mark === a;
            var hi = inQ || mk;
            var tint = 'none';
            var talpha = 1;
            if (covS && covS[a]) {
                tint = P.green + '40';
                if (fresh && !covP[a]) talpha = ez(e);
            }
            if (mode === 'update' && cur > 0 && a >= RNG[cur][0] && a <= RNG[cur][1]) tint = P.orange + '2a';
            ctx.globalAlpha = talpha;
            rr(ax, ayTop, aw, L.ah, 3, tint, hi ? (mk ? P.orange : P.yellow) + 'ff' : P.sub + '88', hi ? 1.6 : 1.1);
            ctx.globalAlpha = 1;
            var nv = sgArrVal(s, a);
            var ov = sgArrVal(p, a);
            var acx = ax + aw / 2;
            var acy = ayTop + L.ah / 2;
            if (fresh && nv !== ov) {
                var af = ez(seg(e, 0.5, 1));
                sgNum(acx, acy - 6 * af, String(ov), L, 1 - af);
                sgNum(acx, acy + 6 * (1 - af), String(nv), L, af);
            } else {
                sgNum(acx, acy, String(nv), L, 1);
            }
            tx(String(a), acx, top + L.idxY, L.fs, P.sub + 'ff', 'center', false);
        }

        if (mode === 'query') {
            var gx0 = x0 + (w - L.gc * (2 * QUSED + 1)) / 2;
            var ay = top + L.accY + L.ah / 2;
            var k;
            for (k = 0; k <= QUSED; k++) {
                rr(sgSlotX(gx0, L, 2 * k) - L.cw2 / 2, top + L.accY, L.cw2, L.ah, 4, 'none', P.sub + '44', 1);
            }
            for (k = 0; k < s.sum.length; k++) {
                if (fresh && k === s.sum.length - 1 && p.sum.length < s.sum.length) continue;
                sgChip(sgSlotX(gx0, L, 2 * k), ay, L, String(s.sum[k]), P.green, 1);
            }
            for (k = 0; k + 1 < s.sum.length; k++) {
                tx('+', sgSlotX(gx0, L, 2 * k + 1), ay, L.fs, P.sub + 'ff', 'center', true);
            }
            if (s.sum.length === QUSED) {
                tx('=', sgSlotX(gx0, L, 2 * QUSED - 1), ay, L.fs, P.sub + 'ff', 'center', true);
                sgChip(sgSlotX(gx0, L, 2 * QUSED), ay, L, String(QTOTAL), P.yellow, fresh && p.sum.length < QUSED ? ez(seg(e, 0.8, 1)) : 1);
            }
            if (fresh && cur > 0 && s.sum.length > p.sum.length && e >= 0.5) {
                var kf = s.sum.length - 1;
                var qf = ez(seg(e, 0.5, 1));
                var tgx = sgSlotX(gx0, L, 2 * kf);
                sgChip(lerp(pos[cur].x, tgx, qf), lerp(pos[cur].y, ay, qf), L, String(s.sum[kf]), P.green, 1);
            }
        }

        ctx.globalAlpha = fresh ? 0.35 + 0.65 * ez(e) : 1;
        var capY = top + L.capTop;
        var cx = x0 + w / 2;
        if (s.cap) lines(s.cap, w - 8, L.fs).forEach(function (row) {
            tx(row, cx, capY + (L.fs + 5) / 2, L.fs, P.yellow + 'ff', 'center', true);
            capY += L.fs + 5;
        });
        if (s.cap2) lines(s.cap2, w - 8, L.fs).forEach(function (row) {
            tx(row, cx, capY + (L.fs + 5) / 2, L.fs, P.text + 'ee', 'center', false);
            capY += L.fs + 5;
        });
        ctx.globalAlpha = 1;
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
        speedBtns.forEach(function (b) { b.classList.remove('seg-viz__speed-btn--active'); });
        btn.classList.add('seg-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('seg-viz__mode-btn--active', d.key === m); });
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