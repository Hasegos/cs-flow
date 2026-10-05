/**
 * 균형 이진트리 AVL과 레드-블랙 시각화
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
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

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
    var mode    = 'avl';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'rb') return RB_STEPS;
        if (mode === 'cmp') return CMP_STEPS;
        return AVL_STEPS;
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
        if (sz < 9.5) sz = 9.5;
        if (color.indexOf(P.muted) === 0) color = P.sub + 'ff';
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    /* ===================== 공통: 트리 배치 ===================== */
    function layoutTree(root) {
        var nodes = [];
        var idx = 0;
        function walk(n, d) {
            if (!n) return;
            walk(n.l, d + 1);
            nodes.push({ n: n, x: idx++, d: d });
            walk(n.r, d + 1);
        }
        walk(root, 0);
        return nodes;
    }
    function drawTreeBox(x0, top, w, mob, step, kind) {
        var fs = mob ? 10 : 11.5;
        var tree = step ? step.tree : null;
        var capY = top + (mob ? 214 : 230);
        if (!tree) {
            tx('(아직 키가 없습니다)', x0 + w / 2, top + 100, fs, P.sub + 'ee', 'center', false);
            return;
        }
        var nodes = layoutTree(tree);
        var total = Math.max(nodes.length, kind === 'avl' ? 6 : 7);
        var r = mob ? 13 : 15;
        var dx = (w - 2 * r) / (total - 1);
        var dy = mob ? 46 : 50;
        var pos = {};
        nodes.forEach(function (p) {
            pos[p.n.k] = { x: x0 + r + p.x * dx + (total - nodes.length) * dx / 2, y: top + 34 + p.d * dy };
        });
        function edges(n) {
            if (!n) return;
            [n.l, n.r].forEach(function (ch) {
                if (!ch) return;
                ctx.beginPath();
                ctx.moveTo(pos[n.k].x, pos[n.k].y);
                ctx.lineTo(pos[ch.k].x, pos[ch.k].y);
                ctx.strokeStyle = P.sub + 'aa';
                ctx.lineWidth = 1.6;
                ctx.stroke();
                edges(ch);
            });
        }
        edges(tree);
        var hl = step.hl || [];
        nodes.forEach(function (p) {
            var n = p.n;
            var ps = pos[n.k];
            var on = hl.indexOf(n.k) >= 0;
            var bad = kind === 'avl' && step.bad === n.k;
            var fill;
            var edge;
            if (kind === 'rb') {
                fill = n.c === 'R' ? P.red + '55' : '#0d0d16';
                edge = n.c === 'R' ? P.red + 'ff' : P.sub + 'ff';
            } else {
                fill = P.teal + '25';
                edge = P.teal + 'ff';
            }
            if (bad) edge = P.red + 'ff';
            ctx.beginPath();
            ctx.arc(ps.x, ps.y, r, 0, Math.PI * 2);
            ctx.fillStyle = fill;
            ctx.fill();
            ctx.lineWidth = on || bad ? 3 : 1.6;
            ctx.strokeStyle = on && !bad ? P.yellow + 'ff' : edge;
            ctx.stroke();
            tx(String(n.k), ps.x, ps.y, fs, P.text + 'ff', 'center', true);
            if (kind === 'avl') {
                var bf = avlH(n.l) - avlH(n.r);
                tx(String(bf), ps.x + r + 3, ps.y - r - 1, fs - 1.5, (Math.abs(bf) > 1 ? P.red : P.green) + 'ff', 'left', true);
            }
        });
        if (step.cap) tx(step.cap, x0 + w / 2, capY, fs - 0.5, (step.bad >= 0 ? P.red : P.yellow) + 'ff', 'center', true);
    }

    /* ===================== 모드: 높이 비교 ===================== */
    function drawCompare(x0, top, w, mob, step) {
        var fs = mob ? 10 : 11.5;
        var k = step ? step.k : 0;
        var lab = mob ? 86 : 130;
        var bw = w - lab - 34;
        var unit = bw / N_SORT;
        tx('키 1~' + jg(N_SORT, '을', '를') + ' 정렬된 순서로 삽입했을 때 높이', x0, top + 8, fs - 1, P.sub + 'ee', 'left', true);
        CMP_ROWS.forEach(function (r, i) {
            if (k < i + 1) return;
            var y = top + 28 + i * 58;
            var cur = k === i + 1;
            var c = P[r.col];
            tx(r.name, x0, y + 10, fs - 1.5, (cur ? P.text : P.sub) + 'ee', 'left', true);
            rr(x0 + lab, y, r.h * unit, 20, 3, c + (cur ? '55' : '30'), c + (cur ? 'ff' : '99'), cur ? 1.8 : 1.2);
            tx(String(r.h), x0 + lab + r.h * unit + 6, y + 10, fs, c + 'ff', 'left', true);
            tx(r.note, x0, y + 34, fs - 2, P.sub + 'ee', 'left', false);
        });
        if (k >= 4) tx('이론 상한: AVL 약 1.44 log2(n + 2) · 레드-블랙 2 log2(n + 1)', x0 + w / 2, top + 28 + 3 * 58 + 6, fs - 1.5, P.yellow + 'ff', 'center', true);
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

        if (mode === 'cmp') drawCompare(padX, top, fullW, mob, step);
        else drawTreeBox(padX, top, fullW, mob, step, mode === 'rb' ? 'rb' : 'avl');

        if (!step) {
            var hint = '아래 STEP으로 삽입과 재균형을 확인하세요.';
            ctx.font = '500 ' + (mob ? 11 : 12.5) + 'px "JetBrains Mono",monospace';
            var hs = (mob ? 11 : 12.5) * Math.min(1, (W - 16) / ctx.measureText(hint).width);
            tx(hint, W / 2, GH() - (mob ? 12 : 14), hs, P.muted + 'aa', 'center', false);
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH;
        if (mode === 'cmp') neededH = mob ? 250 : 260;
        else neededH = mob ? 250 : 270;
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
        if (mode === 'rb') return '레드-블랙 트리에 키를 삽입하며 색 바꾸기와 회전이 일어나는 과정을 봅니다.';
        if (mode === 'cmp') return '정렬된 키를 삽입했을 때 세 트리의 높이를 비교합니다.';
        return 'AVL 트리에 키를 삽입하며 불균형이 회전으로 복구되는 과정을 봅니다.';
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