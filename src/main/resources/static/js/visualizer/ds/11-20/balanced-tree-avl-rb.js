/**
 * 균형 이진트리 AVL과 레드-블랙 시각화 시각화
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
    var root    = el('div', 'bal-viz');
    var toolbar = el('div', 'bal-viz__toolbar');
    var tbLeft  = el('div', 'bal-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'bal-viz__title', 'BALTREE'));

    var modeWrap = el('div', 'bal-viz__mode');
    var modeDefs = [
        { key: 'avl', label: 'AVL 트리' },
        { key: 'rb', label: '레드-블랙 트리' },
        { key: 'cmp', label: '높이 비교' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'bal-viz__mode-btn' + (i === 0 ? ' bal-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'bal-viz__speed');
    speedWrap.appendChild(el('span', 'bal-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'bal-viz__speed-btn' + (i === 0 ? ' bal-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'bal-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'bal-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'bal-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'bal-viz__controls');
    var btnPlay  = el('button', 'bal-viz__btn bal-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'bal-viz__btn', '▶| STEP');
    var btnReset = el('button', 'bal-viz__btn', '↺ RESET');
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
    var mode    = 'avl';
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

    /* ===================== 엔진: 조사 ===================== */
    function jg(n, a, b) {
        return n + ([0, 1, 3, 6, 7, 8].indexOf(Math.abs(n) % 10) >= 0 ? a : b);
    }

    /* ===================== 엔진: AVL 삽입 ===================== */
    function avlClone(n) {
        if (!n) return null;
        return { k: n.k, h: n.h, l: avlClone(n.l), r: avlClone(n.r) };
    }
    function avlH(n) { return n ? n.h : 0; }
    function avlUpd(n) { n.h = 1 + Math.max(avlH(n.l), avlH(n.r)); }
    function avlBf(n) { return avlH(n.l) - avlH(n.r); }
    function avlRotR(z) {
        var y = z.l;
        z.l = y.r;
        y.r = z;
        avlUpd(z);
        avlUpd(y);
        return y;
    }
    function avlRotL(z) {
        var y = z.r;
        z.r = y.l;
        y.l = z;
        avlUpd(z);
        avlUpd(y);
        return y;
    }
    function avlRun(keys) {
        var root = null;
        var steps = [];
        var rot = 0;
        function snap(hl, bad, cap, log) {
            steps.push({ tree: avlClone(root), hl: hl, bad: bad, cap: cap, log: log });
        }
        keys.forEach(function (k) {
            var path = [];
            var node = { k: k, h: 1, l: null, r: null };
            if (!root) {
                root = node;
                snap([k], -1, '', '첫 키 ' + jg(k, '이', '가') + ' 루트가 됩니다. 노드 위의 숫자는 균형 인수(왼쪽 높이 - 오른쪽 높이)입니다.');
                return;
            }
            var c = root;
            for (;;) {
                path.push(c);
                if (k < c.k) {
                    if (!c.l) { c.l = node; break; }
                    c = c.l;
                } else {
                    if (!c.r) { c.r = node; break; }
                    c = c.r;
                }
            }
            for (var i = path.length - 1; i >= 0; i--) avlUpd(path[i]);
            var z = null;
            var zi = -1;
            for (var j = path.length - 1; j >= 0; j--) {
                if (Math.abs(avlBf(path[j])) > 1) { z = path[j]; zi = j; break; }
            }
            if (!z) {
                snap([k], -1, '', '키 ' + jg(k, '을', '를') + ' 이진 탐색 트리처럼 삽입하고 경로 위 노드의 높이를 갱신합니다. 모든 노드의 균형 인수가 -1, 0, 1이어서 회전이 필요 없습니다.');
                return;
            }
            var bf = avlBf(z);
            var kind;
            if (bf > 1) kind = avlBf(z.l) >= 0 ? 'LL' : 'LR';
            else kind = avlBf(z.r) <= 0 ? 'RR' : 'RL';
            snap([k], z.k, '노드 ' + z.k + ' 불균형 (균형 인수 ' + bf + ', ' + kind + ')',
                '키 ' + jg(k, '을', '를') + ' 삽입했더니 노드 ' + z.k + '의 균형 인수가 ' + jg(bf, '이', '가') + ' 되어 조건이 깨졌습니다. 새 키는 ' + z.k + '의 ' + (kind.charAt(0) === 'L' ? '왼쪽' : '오른쪽') + ' 자식의 ' + (kind.charAt(1) === 'L' ? '왼쪽' : '오른쪽') + ' 서브트리에 들어가 ' + kind + ' 경우입니다.');
            var top;
            function relink(newTop) {
                if (zi === 0) root = newTop;
                else if (path[zi - 1].l === z) path[zi - 1].l = newTop;
                else path[zi - 1].r = newTop;
                for (var q = zi - 1; q >= 0; q--) avlUpd(path[q]);
            }
            if (kind === 'LL') {
                top = avlRotR(z);
                relink(top);
                rot++;
                snap([top.k], -1, '오른쪽 회전 후 ' + jg(top.k, '이', '가') + ' 위로 올라옴', kind + ' 경우는 ' + jg(z.k, '을', '를') + ' 기준으로 오른쪽 회전 한 번으로 해결합니다. ' + jg(top.k, '이', '가') + ' 서브트리의 루트가 되고 ' + jg(z.k, '은', '는') + ' 그 오른쪽 자식이 됩니다.');
            } else if (kind === 'RR') {
                top = avlRotL(z);
                relink(top);
                rot++;
                snap([top.k], -1, '왼쪽 회전 후 ' + jg(top.k, '이', '가') + ' 위로 올라옴', kind + ' 경우는 ' + jg(z.k, '을', '를') + ' 기준으로 왼쪽 회전 한 번으로 해결합니다. ' + jg(top.k, '이', '가') + ' 서브트리의 루트가 되고 ' + jg(z.k, '은', '는') + ' 그 왼쪽 자식이 됩니다.');
            } else if (kind === 'LR') {
                z.l = avlRotL(z.l);
                rot++;
                snap([z.l.k], z.k, '먼저 ' + z.l.k + ' 기준 왼쪽 회전', 'LR 경우는 회전 두 번이 필요합니다. 먼저 왼쪽 자식을 기준으로 왼쪽 회전해 LL 모양으로 바꿉니다.');
                top = avlRotR(z);
                relink(top);
                rot++;
                snap([top.k], -1, '이어서 ' + z.k + ' 기준 오른쪽 회전', '이어서 ' + jg(z.k, '을', '를') + ' 기준으로 오른쪽 회전하면 ' + jg(top.k, '이', '가') + ' 서브트리의 루트가 되어 균형이 복구됩니다.');
            } else {
                z.r = avlRotR(z.r);
                rot++;
                snap([z.r.k], z.k, '먼저 ' + z.r.k + ' 기준 오른쪽 회전', 'RL 경우는 회전 두 번이 필요합니다. 먼저 오른쪽 자식을 기준으로 오른쪽 회전해 RR 모양으로 바꿉니다.');
                top = avlRotL(z);
                relink(top);
                rot++;
                snap([top.k], -1, '이어서 ' + z.k + ' 기준 왼쪽 회전', '이어서 ' + jg(z.k, '을', '를') + ' 기준으로 왼쪽 회전하면 ' + jg(top.k, '이', '가') + ' 서브트리의 루트가 되어 균형이 복구됩니다.');
            }
        });
        return { steps: steps, rot: rot, height: avlH(root) };
    }

    /* ===================== 엔진: 레드-블랙 삽입 ===================== */
    function rbClone(n) {
        if (!n) return null;
        return { k: n.k, c: n.c, l: rbClone(n.l), r: rbClone(n.r) };
    }
    function rbHeight(n) { return n ? 1 + Math.max(rbHeight(n.l), rbHeight(n.r)) : 0; }
    function rbRun(keys) {
        var root = null;
        var steps = [];
        var rot = 0;
        var rec = 0;
        function snap(hl, cap, log) {
            steps.push({ tree: rbClone(root), hl: hl, cap: cap, log: log });
        }
        function rotL(x) {
            var y = x.r;
            x.r = y.l;
            if (y.l) y.l.p = x;
            y.p = x.p;
            if (!x.p) root = y;
            else if (x === x.p.l) x.p.l = y;
            else x.p.r = y;
            y.l = x;
            x.p = y;
            rot++;
        }
        function rotR(x) {
            var y = x.l;
            x.l = y.r;
            if (y.r) y.r.p = x;
            y.p = x.p;
            if (!x.p) root = y;
            else if (x === x.p.r) x.p.r = y;
            else x.p.l = y;
            y.r = x;
            x.p = y;
            rot++;
        }
        keys.forEach(function (k) {
            var z = { k: k, c: 'R', l: null, r: null, p: null };
            if (!root) {
                root = z;
                z.c = 'B';
                snap([k], '루트는 검정', '첫 키 ' + jg(k, '이', '가') + ' 루트가 됩니다. 새 노드는 빨강으로 넣지만, 루트는 항상 검정이어야 해서 검정으로 칠합니다.');
                return;
            }
            var c = root;
            for (;;) {
                if (k < c.k) {
                    if (!c.l) { c.l = z; z.p = c; break; }
                    c = c.l;
                } else {
                    if (!c.r) { c.r = z; z.p = c; break; }
                    c = c.r;
                }
            }
            var p0 = z.p;
            if (p0.c === 'B') {
                snap([k], '부모 ' + jg(p0.k, '이', '가') + ' 검정: 끝', '키 ' + jg(k, '을', '를') + ' 빨강 노드로 삽입합니다. 부모 ' + jg(p0.k, '이', '가') + ' 검정이어서 빨강-빨강 충돌이 없고 규칙이 지켜지므로 더 할 일이 없습니다.');
                return;
            }
            snap([k], '빨강-빨강 충돌 (' + p0.k + ', ' + k + ')', '키 ' + jg(k, '을', '를') + ' 빨강 노드로 삽입했더니 부모 ' + p0.k + '도 빨강입니다. 빨강 노드의 자식은 검정이어야 한다는 규칙이 깨졌으므로 삼촌의 색을 보고 고칩니다.');
            while (z.p && z.p.c === 'R') {
                var p = z.p;
                var g = p.p;
                var left = p === g.l;
                var u = left ? g.r : g.l;
                if (u && u.c === 'R') {
                    p.c = 'B';
                    u.c = 'B';
                    g.c = 'R';
                    rec++;
                    var isRoot = !g.p;
                    if (isRoot) g.c = 'B';
                    snap([p.k, u.k, g.k], '삼촌 빨강: 색만 바꿈', '삼촌 ' + jg(u.k, '이', '가') + ' 빨강이므로 회전 없이 색만 바꿉니다. 부모 ' + jg(p.k, '과', '와') + ' 삼촌 ' + jg(u.k, '을', '를') + ' 검정으로, 조부모 ' + jg(g.k, '을', '를') + ' ' + (isRoot ? '빨강으로 바꾸려 했으나 루트라 검정으로 둡니다.' : '빨강으로 바꿉니다. 조부모가 빨강이 되어 위쪽에서 충돌이 생기면 같은 방식으로 계속 확인합니다.'));
                    z = g;
                } else {
                    var dbl = (left && z === p.r) || (!left && z === p.l);
                    if (dbl) {
                        z = p;
                        if (left) rotL(z);
                        else rotR(z);
                        snap([z.k], '먼저 ' + z.k + ' 기준 ' + (left ? '왼쪽' : '오른쪽') + ' 회전', '삼촌이 검정(없음 포함)이고 새 노드가 안쪽 자식이어서 ' + (left ? 'LR' : 'RL') + ' 모양입니다. 먼저 ' + jg(z.k, '을', '를') + ' 기준으로 ' + (left ? '왼쪽' : '오른쪽') + ' 회전해 바깥쪽 모양으로 바꿉니다.');
                    }
                    z.p.c = 'B';
                    z.p.p.c = 'R';
                    var gg = z.p.p;
                    var topK = z.p.k;
                    if (left) rotR(gg);
                    else rotL(gg);
                    snap([topK, gg.k], '회전 후 ' + topK + ' 검정, ' + gg.k + ' 빨강', '삼촌이 검정(없음 포함)이므로 회전으로 해결합니다. ' + jg(gg.k, '을', '를') + ' 기준으로 ' + (left ? '오른쪽' : '왼쪽') + ' 회전하고, ' + jg(topK, '을', '를') + ' 검정, ' + jg(gg.k, '을', '를') + ' 빨강으로 칠하면 규칙이 모두 지켜집니다.');
                }
            }
            if (root.c === 'R') root.c = 'B';
        });
        return { steps: steps, rot: rot, rec: rec, height: rbHeight(root) };
    }

    /* ===================== 데이터: 시나리오와 비교 ===================== */
    var AVL_KEYS = [10, 20, 30, 40, 50, 25];
    var RB_KEYS = [10, 18, 7, 15, 16, 30, 25];
    var AVL_RUN = avlRun(AVL_KEYS);
    var RB_RUN = rbRun(RB_KEYS);
    var N_SORT = 15;
    var SORTED = [];
    for (var si = 1; si <= N_SORT; si++) SORTED.push(si);
    var AVL_SORT = avlRun(SORTED);
    var RB_SORT = rbRun(SORTED);
    var CMP_ROWS = [
        { name: '일반 이진 탐색 트리', h: N_SORT, col: 'red', note: '정렬된 입력이면 한쪽으로만 자람' },
        { name: 'AVL 트리', h: AVL_SORT.height, col: 'teal', note: '회전 ' + AVL_SORT.rot + '번' },
        { name: '레드-블랙 트리', h: RB_SORT.height, col: 'orange', note: '회전 ' + RB_SORT.rot + '번' }
    ];
    var LOG2 = Math.log(N_SORT + 1) / Math.log(2);
    var CMP_STEPS = [
        { k: 0, log: '키 1부터 ' + N_SORT + '까지를 정렬된 순서로 삽입했을 때 트리의 높이를 비교합니다. 정렬된 입력은 이진 탐색 트리에 가장 나쁜 경우입니다.' },
        { k: 1, log: '일반 이진 탐색 트리는 모든 키가 오른쪽으로만 이어져 높이가 ' + N_SORT + '입니다. 연결 리스트와 같아져 탐색이 O(n)입니다.' },
        { k: 2, log: 'AVL 트리는 회전으로 균형을 유지해 높이가 ' + AVL_SORT.height + '입니다. 회전은 모두 ' + AVL_SORT.rot + '번 일어났고, 탐색은 O(log n)입니다.' },
        { k: 3, log: '레드-블랙 트리는 높이가 ' + RB_SORT.height + '입니다. 회전은 ' + RB_SORT.rot + '번이고, 색만 바꾸는 작업이 회전을 줄여 줍니다. 이 입력에서는 AVL보다 높지만 높이는 여전히 2 log2(n + 1) 이하입니다.' },
        { k: 4, log: '정리 — 두 트리 모두 높이가 O(log n)입니다. AVL은 엄격하게 균형을 맞춰 탐색에 유리한 경향이 있고, 레드-블랙은 느슨하게 맞춰 삽입과 삭제의 재균형 비용이 적은 경향이 있습니다.' }
    ];

    var AVL_STEPS = [{ tree: null, hl: [], bad: -1, cap: '', log: 'AVL 트리는 모든 노드에서 왼쪽과 오른쪽 서브트리의 높이 차이(균형 인수)가 -1, 0, 1이 되도록 유지하는 이진 탐색 트리입니다. 키 ' + AVL_KEYS.join(', ') + '를 차례로 삽입하며 회전으로 균형이 복구되는 과정을 봅니다.' }].concat(AVL_RUN.steps);
    var RB_STEPS = [{ tree: null, hl: [], cap: '', log: '레드-블랙 트리는 노드에 색을 두고 규칙으로 균형을 맞추는 이진 탐색 트리입니다. 루트는 검정, 빨강 노드의 자식은 검정, 모든 경로의 검정 노드 수는 같아야 합니다. 키 ' + RB_KEYS.join(', ') + '를 차례로 삽입해 색 바꾸기와 회전이 일어나는 과정을 봅니다.' }].concat(RB_RUN.steps);
    AVL_STEPS.push({ tree: AVL_STEPS[AVL_STEPS.length - 1].tree, hl: [], bad: -1, cap: '높이 ' + AVL_RUN.height + ' · 회전 ' + AVL_RUN.rot + '번', log: '정리 — 키 ' + AVL_KEYS.length + '개를 넣는 동안 회전은 ' + AVL_RUN.rot + '번 일어났고 최종 높이는 ' + AVL_RUN.height + '입니다. 삽입 하나에 필요한 회전은 최대 두 번(이중 회전)이고, 균형 조건 덕분에 높이는 항상 O(log n)입니다.' });
    RB_STEPS.push({ tree: RB_STEPS[RB_STEPS.length - 1].tree, hl: [], cap: '높이 ' + RB_RUN.height + ' · 회전 ' + RB_RUN.rot + '번 · 색만 바꾼 처리 ' + RB_RUN.rec + '번', log: '정리 — 키 ' + RB_KEYS.length + '개를 넣는 동안 회전은 ' + RB_RUN.rot + '번이고 최종 높이는 ' + RB_RUN.height + '입니다. 삼촌이 빨강이면 색만 바꾸고, 검정이면 회전 한두 번으로 끝나 재균형 비용이 작습니다.' });

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'rb') return RB_STEPS;
        if (mode === 'cmp') return CMP_STEPS;
        return AVL_STEPS;
    }
    function defaultLog() {
        if (mode === 'rb') return '레드-블랙 트리에 키를 삽입하며 색 바꾸기와 회전이 일어나는 과정을 봅니다.';
        if (mode === 'cmp') return '정렬된 키를 삽입했을 때 세 트리의 높이를 비교합니다.';
        return 'AVL 트리에 키를 삽입하며 불균형이 회전으로 복구되는 과정을 봅니다.';
    }
    function ez(q) { var v = clamp01(q); return v * v * (3 - 2 * v); }

    /* ===================== 레이아웃 ===================== */
    var btMemo = {};
    var BT_CMP_TITLE = '키 1~' + jg(N_SORT, '을', '를') + ' 정렬된 순서로 삽입했을 때 높이';
    var BT_CMP_SUM = '이론 상한: AVL 약 1.44 log2(n + 2) · 레드-블랙 2 log2(n + 1)';
    var BT_LEG_AVL = '숫자는 균형 인수(왼쪽 높이 - 오른쪽 높이)입니다. -1, 0, 1이면 정상입니다.';
    var BT_LEG_RB = '빨강 원은 빨강 노드, 어두운 원은 검정 노드입니다. 루트는 항상 검정입니다.';
    function btFs(mob) { return mob ? 11 : 12.5; }
    function btFsSub(mob) { return mob ? 11 : 12; }
    function btR(mob) { return mob ? 13 : 15; }
    function btDy(mob) { return mob ? 44 : 50; }
    function btSlots() { return mode === 'rb' ? RB_KEYS.length : AVL_KEYS.length; }
    function btLevels() {
        var best = 1;
        currentSteps().forEach(function (st) {
            var h = mode === 'rb' ? rbHeight(st.tree) : avlH(st.tree);
            if (h > best) best = h;
        });
        return best;
    }
    function btCapMax(w, mob) {
        var fs = btFs(mob);
        var best = 0;
        currentSteps().forEach(function (st) {
            if (!st.cap) return;
            var h = lines(st.cap, w - 8, fs).length * (fs + 5);
            if (h > best) best = h;
        });
        return best;
    }
    function btBuildCmp(w, mob) {
        var fs = btFs(mob), fsub = btFsSub(mob);
        var L = { fs: fs, fsub: fsub, unit: (w - 40) / N_SORT, rows: [] };
        L.titleL = lines(BT_CMP_TITLE, w, fs);
        var y = L.titleL.length * (fs + 4) + 8;
        CMP_ROWS.forEach(function (rw) {
            var nl = lines(rw.note, w - 4, fsub);
            L.rows.push({ y: y, nl: nl });
            y += fs + 40 + nl.length * (fsub + 4);
        });
        L.sumY = y;
        L.sumL = lines(BT_CMP_SUM, w - 8, fsub);
        L.total = y + L.sumL.length * (fsub + 5) + 4;
        return L;
    }
    function btBuildTree(w, mob) {
        var fs = btFs(mob), fsub = btFsSub(mob), r = btR(mob), dy = btDy(mob);
        var L = { fs: fs, fsub: fsub, r: r, dy: dy };
        L.treeH = 2 * r + 12 + (btLevels() - 1) * dy;
        L.capY = L.treeH + 8;
        L.legL = lines(mode === 'rb' ? BT_LEG_RB : BT_LEG_AVL, w - 8, fsub);
        L.legY = L.capY + btCapMax(w, mob) + 6;
        L.total = L.legY + L.legL.length * (fsub + 4) + 4;
        return L;
    }
    function layout(w, mob) {
        var key = mode + '|' + Math.round(w) + '|' + (mob ? 'm' : 'd');
        if (!btMemo[key]) btMemo[key] = mode === 'cmp' ? btBuildCmp(w, mob) : btBuildTree(w, mob);
        return btMemo[key];
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 트리 헬퍼 ===================== */
    function btPlace(tree, slots, x0, w, r, top, dy) {
        var list = [];
        function walk(nd, d) {
            if (!nd) return;
            walk(nd.l, d + 1);
            list.push({ k: nd.k, d: d });
            walk(nd.r, d + 1);
        }
        walk(tree, 0);
        var pos = {};
        var dx = slots > 1 ? (w - 2 * r) / (slots - 1) : 0;
        var off = (slots - list.length) / 2;
        list.forEach(function (it, i) {
            pos[it.k] = { x: x0 + r + (i + off) * dx, y: top + r + 8 + it.d * dy };
        });
        return pos;
    }
    function btNodes(tree, out) {
        if (!tree) return out;
        out.push(tree);
        btNodes(tree.l, out);
        btNodes(tree.r, out);
        return out;
    }
    function btEdges(tree, out) {
        if (!tree) return out;
        if (tree.l) out.push([tree.k, tree.l.k]);
        if (tree.r) out.push([tree.k, tree.r.k]);
        btEdges(tree.l, out);
        btEdges(tree.r, out);
        return out;
    }
    function btHasEdge(list, a, b) {
        for (var i = 0; i < list.length; i++) {
            if (list[i][0] === a && list[i][1] === b) return true;
        }
        return false;
    }
    function btByKey(tree) {
        var m = {};
        btNodes(tree, []).forEach(function (nd) { m[nd.k] = nd; });
        return m;
    }
    function btStyle(isRb, c) {
        if (!isRb) return { fill: P.teal + '25', edge: P.teal + 'ff', text: P.text + 'ff' };
        if (c === 'R') return { fill: P.red + 'ff', edge: P.red + 'ff', text: P.bg + 'ff' };
        return { fill: '#0d0d16ff', edge: P.sub + 'ff', text: '#e8e8f0ff' };
    }
    function btPaint(x, y, rad, st, hot, bad) {
        var edge = bad ? P.red + 'ff' : hot ? P.yellow + 'ff' : st.edge;
        circ(x, y, rad, st.fill, edge, bad || hot ? 3 : 1.6);
    }
    function btBfCol(v) { return (Math.abs(v) > 1 ? P.red : P.green) + 'ff'; }

    /* ===================== 트리 그리기 ===================== */
    function btDrawTree(x0, top, w, mob, s, p, fresh, e) {
        var L = layout(w, mob);
        var r = L.r, fs = L.fs, fsub = L.fsub;
        var isRb = mode === 'rb';
        var slots = btSlots();
        var cur = btPlace(s.tree, slots, x0, w, r, top, L.dy);
        var prevPos = fresh ? btPlace(p.tree, slots, x0, w, r, top, L.dy) : null;
        var prevNd = fresh ? btByKey(p.tree) : {};
        var mv = fresh ? ez(seg(e, 0, 0.7)) : 1;
        var cf = fresh ? ez(seg(e, 0.4, 1)) : 1;
        var curEdges = btEdges(s.tree, []);
        var prevEdges = fresh ? btEdges(p.tree, []) : [];
        var hl = s.hl || [];
        function at(k) {
            var c = cur[k];
            var pr = prevPos ? prevPos[k] : null;
            if (!pr) return { x: c.x, y: c.y };
            return { x: lerp(pr.x, c.x, mv), y: lerp(pr.y, c.y, mv) };
        }
        if (!s.tree) tx('(아직 키가 없습니다)', x0 + w / 2, top + L.treeH / 2, fsub, P.sub + 'ff', 'center', false);
        prevEdges.forEach(function (ed) {
            if (btHasEdge(curEdges, ed[0], ed[1])) return;
            var a = at(ed[0]), b = at(ed[1]);
            ctx.globalAlpha = 1 - ez(seg(e, 0, 0.5));
            ln(a.x, a.y, b.x, b.y, P.sub + 'aa', 1.6);
        });
        curEdges.forEach(function (ed) {
            var a = at(ed[0]), b = at(ed[1]);
            var added = fresh && !btHasEdge(prevEdges, ed[0], ed[1]);
            ctx.globalAlpha = added ? ez(seg(e, 0.55, 1)) : 1;
            ln(a.x, a.y, b.x, b.y, added ? P.yellow + 'ff' : P.sub + 'aa', added ? 2.4 : 1.6);
        });
        btNodes(s.tree, []).forEach(function (nd) {
            var ps = at(nd.k);
            var pn = prevNd[nd.k];
            var isNew = fresh && !pn;
            var a = isNew ? ez(seg(e, 0.35, 1)) : 1;
            var rad = isNew ? r * (0.55 + 0.45 * a) : r;
            var hot = hl.indexOf(nd.k) >= 0;
            var bad = !isRb && s.bad === nd.k;
            var st = btStyle(isRb, nd.c);
            var recolor = isRb && pn && pn.c !== nd.c;
            if (bad) {
                ctx.globalAlpha = 0.5 + 0.5 * Math.sin(Math.PI * clamp01(e));
                circ(ps.x, ps.y, rad + 5, 'none', P.red + 'ff', 1.6);
            }
            ctx.globalAlpha = a;
            if (recolor) {
                btPaint(ps.x, ps.y, rad, btStyle(true, pn.c), hot, bad);
                ctx.globalAlpha = cf;
                btPaint(ps.x, ps.y, rad, st, hot, bad);
                ctx.globalAlpha = 1 - cf;
                tx(String(nd.k), ps.x, ps.y, fs, btStyle(true, pn.c).text, 'center', true);
                ctx.globalAlpha = cf;
                tx(String(nd.k), ps.x, ps.y, fs, st.text, 'center', true);
            } else {
                btPaint(ps.x, ps.y, rad, st, hot, bad);
                tx(String(nd.k), ps.x, ps.y, fs, st.text, 'center', true);
            }
            if (!isRb) {
                var bfc = avlBf(nd);
                var bx = ps.x, by = ps.y - rad - 6;
                if (fresh && pn && avlBf(pn) !== bfc) {
                    var bcf = ez(seg(e, 0.4, 1));
                    ctx.globalAlpha = 1 - bcf;
                    tx(String(avlBf(pn)), bx, by, fsub, btBfCol(avlBf(pn)), 'center', true);
                    ctx.globalAlpha = bcf;
                    tx(String(bfc), bx, by, fsub, btBfCol(bfc), 'center', true);
                } else {
                    ctx.globalAlpha = a;
                    tx(String(bfc), bx, by, fsub, btBfCol(bfc), 'center', true);
                }
            }
            ctx.globalAlpha = 1;
        });
        var capCol = !isRb && s.bad >= 0 ? P.red + 'ff' : P.yellow + 'ff';
        ctx.globalAlpha = fresh ? 0.35 + 0.65 * ez(e) : 1;
        if (s.cap) lines(s.cap, w - 8, fs).forEach(function (txt, i) {
            tx(txt, x0 + w / 2, top + L.capY + i * (fs + 5) + (fs + 5) / 2, fs, capCol, 'center', true);
        });
        ctx.globalAlpha = 1;
        L.legL.forEach(function (txt, i) {
            tx(txt, x0 + w / 2, top + L.legY + i * (fsub + 4) + (fsub + 4) / 2, fsub, P.sub + 'ff', 'center', false);
        });
    }

    /* ===================== 높이 비교 그리기 ===================== */
    function btDrawCmp(x0, top, w, mob, s, p, fresh, e) {
        var L = layout(w, mob);
        var fs = L.fs, fsub = L.fsub;
        var k = s.k;
        var pk = fresh ? p.k : k;
        L.titleL.forEach(function (txt, i) {
            tx(txt, x0, top + i * (fs + 4) + (fs + 4) / 2, fs, P.sub + 'ff', 'left', true);
        });
        CMP_ROWS.forEach(function (rw, i) {
            if (k < i + 1) return;
            var lay = L.rows[i];
            var cur = k === i + 1;
            var appear = fresh && pk < i + 1;
            var g = appear ? ez(seg(e, 0, 0.8)) : 1;
            var c = P[rw.col];
            var y = top + lay.y;
            var barY = y + fs + 8;
            var bw = rw.h * L.unit * g;
            var shown = appear ? Math.round(rw.h * g) : rw.h;
            ctx.globalAlpha = g;
            tx(rw.name, x0, y + (fs + 4) / 2, fs, (cur ? P.text : P.sub) + 'ff', 'left', true);
            rr(x0, barY, bw, 16, 3, c + (cur ? '55' : '30'), c + (cur ? 'ff' : '99'), cur ? 1.8 : 1.2);
            tx(String(shown), x0 + bw + 6, barY + 8, fs, c + 'ff', 'left', true);
            lay.nl.forEach(function (txt, j) {
                tx(txt, x0, barY + 22 + j * (fsub + 4) + (fsub + 4) / 2, fsub, P.sub + 'ff', 'left', false);
            });
            ctx.globalAlpha = 1;
        });
        if (k >= 4) {
            ctx.globalAlpha = fresh && pk < 4 ? ez(seg(e, 0.3, 1)) : 1;
            L.sumL.forEach(function (txt, j) {
                tx(txt, x0 + w / 2, top + L.sumY + j * (fsub + 5) + (fsub + 5) / 2, fsub, P.yellow + 'ff', 'center', true);
            });
            ctx.globalAlpha = 1;
        }
    }

    /* ===================== 메인 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var steps = currentSteps();
        var s = step || steps[0];
        var p = prev || s;
        var fresh = s !== p;
        var e = fresh ? clamp01(t) : 1;
        if (mode === 'cmp') btDrawCmp(x0, top, w, mob, s, p, fresh, e);
        else btDrawTree(x0, top, w, mob, s, p, fresh, e);
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
        speedBtns.forEach(function (b) { b.classList.remove('bal-viz__speed-btn--active'); });
        btn.classList.add('bal-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('bal-viz__mode-btn--active', d.key === m); });
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