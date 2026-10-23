/**
 * 이진 트리 시각화 시각화
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
    var root    = el('div', 'tree-viz');
    var toolbar = el('div', 'tree-viz__toolbar');
    var tbLeft  = el('div', 'tree-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'tree-viz__title', 'Binary Tree'));

    var modeWrap = el('div', 'tree-viz__mode');
    var modeDefs = [
        { key: 'structure', label: '구조' },
        { key: 'pre', label: '전위순회' },
        { key: 'in', label: '중위순회' },
        { key: 'post', label: '후위순회' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'tree-viz__mode-btn' + (i === 0 ? ' tree-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'tree-viz__speed');
    speedWrap.appendChild(el('span', 'tree-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'tree-viz__speed-btn' + (i === 0 ? ' tree-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'tree-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'tree-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'tree-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'tree-viz__controls');
    var btnPlay  = el('button', 'tree-viz__btn tree-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'tree-viz__btn', '▶| STEP');
    var btnReset = el('button', 'tree-viz__btn', '↺ RESET');
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
    var mode    = 'structure';
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

    /* ===================== 트리 정의 ===================== */
    var NODES = {
        1: { id: 1, val: 50, level: 0, parent: null, left: 2, right: 3 },
        2: { id: 2, val: 30, level: 1, parent: 1,    left: 4, right: 5 },
        3: { id: 3, val: 70, level: 1, parent: 1,    left: 6, right: 7 },
        4: { id: 4, val: 20, level: 2, parent: 2,    left: null, right: null },
        5: { id: 5, val: 40, level: 2, parent: 2,    left: null, right: null },
        6: { id: 6, val: 60, level: 2, parent: 3,    left: null, right: null },
        7: { id: 7, val: 80, level: 2, parent: 3,    left: null, right: null },
    };
    var ROOT_ID = 1;
    var LEAF_IDS = [4, 5, 6, 7];

    /* ===================== 구조 탭 스텝 ===================== */
    var STRUCTURE_STEPS = [
        {
            log: '이진 트리(Binary Tree): 각 노드가 최대 2개의 자식(왼쪽/오른쪽)만 가지는 계층적 자료구조입니다. 노드 7개, 간선 6개(= 노드 수 − 1)로 구성됩니다.',
            highlight: { nodes: [1,2,3,4,5,6,7], edges: 'all' }, label: null,
        },
        {
            log: '루트(Root): 트리의 최상위 노드입니다. 부모가 없는 유일한 노드로, 모든 노드는 루트로부터의 경로로 도달할 수 있습니다.',
            highlight: { nodes: [1], edges: [] }, label: 'root',
        },
        {
            log: '부모-자식 관계: 50은 30과 70의 부모(Parent)이고, 30과 70은 50의 자식(Child)입니다. 간선(Edge)이 이 관계를 연결합니다.',
            highlight: { nodes: [1,2,3], edges: [[1,2],[1,3]] }, label: 'parent-child',
        },
        {
            log: '리프(Leaf): 자식이 하나도 없는 노드입니다. 20, 40, 60, 80이 리프 노드이며, 트리의 가장 바깥쪽 끝에 위치합니다.',
            highlight: { nodes: LEAF_IDS, edges: [] }, label: 'leaf',
        },
        {
            log: '레벨(Level): 루트로부터의 거리입니다. 루트는 레벨 0, 자식은 레벨 1, 그 자식은 레벨 2입니다. 이 트리의 높이(Height)는 2입니다.',
            highlight: { nodes: [1,2,3,4,5,6,7], edges: [], showLevels: true }, label: 'level',
        },
        {
            log: '서브트리(Subtree): 30을 루트로 하는 부분(30, 20, 40)도 그 자체로 또 하나의 이진 트리입니다. 이 자기 유사성 때문에 트리 알고리즘은 재귀로 자연스럽게 구현됩니다.',
            highlight: { nodes: [2,4,5], edges: [[2,4],[2,5]] }, label: 'subtree',
        },
    ];

    /* ===================== 순회 스텝 생성 ===================== */
    function buildTraversalSteps(order) {
        var steps = [];
        var visited = [];

        function enter(id) {
            steps.push({
                visit: id, action: 'enter', visited: visited.slice(),
                log: '노드 ' + NODES[id].val + ' 진입 (호출 스택에 push)',
            });
        }
        function doVisit(id) {
            visited.push(NODES[id].val);
            steps.push({
                visit: id, action: 'visit', visited: visited.slice(),
                log: '노드 ' + NODES[id].val + ' 방문 → 결과에 추가: [' + visited.join(', ') + ']',
            });
        }
        function ret(id) {
            steps.push({
                visit: id, action: 'return', visited: visited.slice(),
                log: '노드 ' + NODES[id].val + ' 서브트리 처리 완료 (호출 스택에서 pop)',
            });
        }

        function preorder(id) {
            if (id === null) return;
            enter(id);
            doVisit(id);
            preorder(NODES[id].left);
            preorder(NODES[id].right);
            ret(id);
        }
        function inorder(id) {
            if (id === null) return;
            enter(id);
            inorder(NODES[id].left);
            doVisit(id);
            inorder(NODES[id].right);
            ret(id);
        }
        function postorder(id) {
            if (id === null) return;
            enter(id);
            postorder(NODES[id].left);
            postorder(NODES[id].right);
            doVisit(id);
            ret(id);
        }

        if (order === 'pre')  preorder(ROOT_ID);
        if (order === 'in')   inorder(ROOT_ID);
        if (order === 'post') postorder(ROOT_ID);

        var introLog = order === 'pre'
            ? '전위 순회(Preorder): Root → Left → Right. 루트를 먼저 방문한 뒤 왼쪽, 오른쪽 서브트리 순으로 내려갑니다.'
            : order === 'in'
            ? '중위 순회(Inorder): Left → Root → Right. 왼쪽 서브트리를 끝까지 방문한 뒤 루트, 오른쪽 순입니다.'
            : '후위 순회(Postorder): Left → Right → Root. 양쪽 서브트리를 모두 방문한 뒤 마지막에 루트를 처리합니다.';
        steps.unshift({ visit: null, action: 'idle', visited: [], log: introLog });

        return steps;
    }

    var PRE_STEPS  = buildTraversalSteps('pre');
    var IN_STEPS   = buildTraversalSteps('in');
    var POST_STEPS = buildTraversalSteps('post');

    function computeStack(steps, idx) {
        var stack = [];
        for (var i = 0; i <= idx; i++) {
            var s = steps[i];
            if (s.action === 'enter') stack.push(s.visit);
            if (s.action === 'return') stack.pop();
        }
        return stack;
    }

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'structure') return STRUCTURE_STEPS;
        if (mode === 'pre') return PRE_STEPS;
        if (mode === 'in') return IN_STEPS;
        return POST_STEPS;
    }
    function defaultLog() {
        if (mode === 'structure') return '▶ PLAY를 눌러 트리 구조를 확인하세요.';
        return '▶ PLAY를 눌러 순회 과정을 확인하세요.';
    }
    function ez(q) { var v = clamp01(q); return v * v * (3 - 2 * v); }

    /* ===================== 레이아웃 ===================== */
    var DT_FX = { 1: 0.5, 2: 0.245, 3: 0.755, 4: 0.12, 5: 0.37, 6: 0.63, 7: 0.88 };
    function dtHeight() {
        var h = 0;
        Object.keys(NODES).forEach(function (k) { if (NODES[k].level > h) h = NODES[k].level; });
        return h;
    }
    function dtCapText() { return '높이 = ' + dtHeight() + ' (루트에서 가장 깊은 리프까지 간선 수)'; }
    function layout(w, mob) {
        var r = mob ? 18 : 26;
        var gl = mob ? 66 : 92;
        var pad = mob ? 30 : 36;
        var L = {
            r: r, gl: gl,
            g: mode === 'structure' ? (mob ? 40 : 64) : 0,
            fsub: mob ? 11 : 12.5,
            fv: mob ? 13 : 16,
            rootY: pad + r,
            leafY: pad + r + 2 * gl
        };
        L.tw = w - L.g;
        var bottom = L.leafY + r;
        if (mode === 'structure') {
            L.capL = lines(dtCapText(), w - 8, L.fsub);
            L.capY = bottom + (mob ? 26 : 30);
            L.total = L.capY + L.capL.length * (L.fsub + 5) + 6;
        } else {
            L.stackLabelY = bottom + (mob ? 20 : 26);
            L.stackY = L.stackLabelY + (mob ? 12 : 16);
            L.stackH = mob ? 24 : 30;
            L.resLabelY = L.stackY + L.stackH + (mob ? 12 : 18);
            L.chipY = L.resLabelY + (mob ? 12 : 16);
            L.chipH = mob ? 22 : 28;
            L.total = L.chipY + L.chipH + 6;
        }
        return L;
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 트리 헬퍼 ===================== */
    function dtPos(id, x0, top, L) {
        return { x: x0 + L.g + DT_FX[id] * L.tw, y: top + L.rootY + NODES[id].level * L.gl };
    }
    function dtIdOf(val) {
        var out = null;
        Object.keys(NODES).forEach(function (k) { if (NODES[k].val === val) out = NODES[k].id; });
        return out;
    }
    function dtAnc(id) {
        var out = [];
        while (id !== null) { out.push(id); id = NODES[id].parent; }
        return out;
    }
    function dtPath(a, b) {
        var A = dtAnc(a), B = dtAnc(b), lca = null, i, path = [], down = [];
        for (i = 0; i < A.length && lca === null; i++) { if (B.indexOf(A[i]) >= 0) lca = A[i]; }
        for (i = 0; i < A.length; i++) { path.push(A[i]); if (A[i] === lca) break; }
        for (i = 0; i < B.length && B[i] !== lca; i++) down.push(B[i]);
        for (i = down.length - 1; i >= 0; i--) path.push(down[i]);
        return path;
    }
    function dtAlong(pts, q) {
        var segs = [], tot = 0, i;
        for (i = 1; i < pts.length; i++) {
            var d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
            segs.push(d);
            tot += d;
        }
        if (!segs.length) return pts[0];
        var want = q * tot, acc = 0;
        for (i = 0; i < segs.length; i++) {
            if (acc + segs[i] >= want || i === segs.length - 1) {
                var u = segs[i] > 0 ? clamp01((want - acc) / segs[i]) : 1;
                return { x: lerp(pts[i].x, pts[i + 1].x, u), y: lerp(pts[i].y, pts[i + 1].y, u) };
            }
            acc += segs[i];
        }
        return pts[0];
    }
    function dtStructCol(st) {
        if (st.label === 'parent-child') return P.teal;
        if (st.label === 'leaf') return P.green;
        if (st.label === 'subtree') return P.orange;
        return P.purple;
    }
    function dtStructEdge(st, par, id) {
        var ed = st.highlight.edges;
        if (ed === 'all') return true;
        for (var i = 0; i < ed.length; i++) {
            if (ed[i][0] === par && ed[i][1] === id) return true;
        }
        return false;
    }
    function dtStructStyle(st, id) {
        if (st.highlight.nodes.indexOf(id) < 0) {
            return { kind: 'dim', col: P.muted, fill: P.muted + '14', stroke: P.muted + '77', lw: 1.4, text: P.text + 'aa' };
        }
        var c = dtStructCol(st);
        return { kind: 'hi', col: c, fill: c + '26', stroke: c + 'ff', lw: 2.4, text: c + 'ff' };
    }
    function dtTravInfo(stp, steps) {
        return {
            cur: stp.visit,
            act: stp.action,
            vis: stp.visited.map(dtIdOf),
            stk: computeStack(steps, steps.indexOf(stp))
        };
    }
    function dtTravStyle(id, inf) {
        if (inf.cur === id) {
            var c = inf.act === 'visit' ? P.green : (inf.act === 'enter' ? P.orange : P.teal);
            return { kind: 'cur', col: c, fill: c + 'ff', stroke: c + 'ff', lw: 2.6, text: '#111111' };
        }
        if (inf.vis.indexOf(id) >= 0) {
            return { kind: 'done', col: P.teal, fill: P.teal + '30', stroke: P.teal + 'ff', lw: 1.8, text: P.text + 'ff' };
        }
        if (inf.stk.indexOf(id) >= 0) {
            return { kind: 'stack', col: P.orange, fill: P.orange + '26', stroke: P.orange + 'cc', lw: 2, text: P.orange + 'ff' };
        }
        return { kind: 'idle', col: P.muted, fill: P.muted + '14', stroke: P.muted + '77', lw: 1.4, text: P.text + 'aa' };
    }
    function dtPaint(x, y, rad, sty, a, val, fv) {
        ctx.globalAlpha = a;
        circ(x, y, rad, sty.fill, sty.stroke, sty.lw);
        tx(val, x, y, fv, sty.text, 'center', true);
        ctx.globalAlpha = 1;
    }
    function dtXfEdge(a, b, r, cN, lwN, cP, lwP, cf) {
        if (cN === cP && lwN === lwP) {
            ln(a.x, a.y + r, b.x, b.y - r, cN, lwN);
            return;
        }
        ctx.globalAlpha = 1 - cf;
        ln(a.x, a.y + r, b.x, b.y - r, cP, lwP);
        ctx.globalAlpha = cf;
        ln(a.x, a.y + r, b.x, b.y - r, cN, lwN);
        ctx.globalAlpha = 1;
    }

    /* ===================== 구조 드로우 ===================== */
    function dtDrawStruct(x0, top, w, mob, L, s, p, fresh, e) {
        var r = L.r;
        var cf = fresh ? ez(seg(e, 0, 0.6)) : 1;
        var la = fresh ? ez(seg(e, 0.4, 1)) : 1;
        var keys = Object.keys(NODES);

        keys.forEach(function (k) {
            var n = NODES[k];
            if (n.parent === null) return;
            var a = dtPos(n.parent, x0, top, L), b = dtPos(n.id, x0, top, L);
            var hN = dtStructEdge(s, n.parent, n.id), hP = dtStructEdge(p, n.parent, n.id);
            dtXfEdge(a, b, r,
                hN ? dtStructCol(s) + 'cc' : P.muted + '44', hN ? 2.4 : 1.4,
                hP ? dtStructCol(p) + 'cc' : P.muted + '44', hP ? 2.4 : 1.4, cf);
        });

        var lvl = s.label === 'level';
        var ga = lvl ? (fresh ? ez(seg(e, 0, 0.5)) : 1) : 0;
        if (ga > 0) {
            var gx2 = x0 + L.g + L.tw * (fresh ? ez(seg(e, 0, 0.6)) : 1);
            var H = dtHeight(), lv, gy;
            ctx.globalAlpha = ga;
            for (lv = 0; lv <= H; lv++) {
                gy = top + L.rootY + lv * L.gl;
                ln(x0 + L.g, gy, gx2, gy, P.sub + '88', 1, [4, 4]);
                tx(String(lv), x0 + 2, gy, L.fsub, P.sub + 'ff', 'left', true);
            }
            tx('깊이', x0 + 2, top + L.rootY - r - 16, L.fsub, P.sub + 'ff', 'left', true);
            var yR = top + L.rootY, yL = top + L.leafY;
            var yE = yR + (yL - yR) * (fresh ? ez(seg(e, 0.2, 0.9)) : 1);
            var bx = x0 + L.g - 10;
            ln(bx, yR, bx, yE, P.teal + 'cc', 1.6);
            ln(bx, yR, bx + 5, yR, P.teal + 'cc', 1.6);
            ln(bx, yE, bx + 5, yE, P.teal + 'cc', 1.6);
            ctx.globalAlpha = 1;
        }

        var rp = dtPos(1, x0, top, L);
        if (s.label === 'root') {
            ctx.globalAlpha = 0.4;
            circ(rp.x, rp.y, r + 7, 'none', P.purple + 'ff', 2);
            if (fresh) {
                ctx.globalAlpha = 0.9 * (1 - e);
                circ(rp.x, rp.y, r + 7 + 24 * ez(e), 'none', P.purple + 'ff', 2.2);
            }
            ctx.globalAlpha = 1;
        }

        keys.forEach(function (k) {
            var n = NODES[k];
            var pt = dtPos(n.id, x0, top, L);
            var sN = dtStructStyle(s, n.id), sP = dtStructStyle(p, n.id);
            var rad = r;
            if (fresh && sN.kind === 'hi' && sP.kind !== 'hi') {
                rad = r * (0.6 + 0.4 * ez(seg(e, (n.id - 1) * 0.06, (n.id - 1) * 0.06 + 0.5)));
            }
            var val = String(n.val);
            if (fresh && (sN.kind !== sP.kind || sN.col !== sP.col)) {
                dtPaint(pt.x, pt.y, rad, sP, 1 - cf, val, L.fv);
                dtPaint(pt.x, pt.y, rad, sN, cf, val, L.fv);
            } else {
                dtPaint(pt.x, pt.y, rad, sN, 1, val, L.fv);
            }
        });

        if (s.label === 'parent-child') {
            ctx.globalAlpha = 1;
            if (fresh && e < 1) {
                [2, 3].forEach(function (cid) {
                    var cp = dtPos(cid, x0, top, L);
                    var q = ez(seg(e, 0.05, 0.95));
                    circ(lerp(rp.x, cp.x, q), lerp(rp.y + r, cp.y - r, q), 4.5, P.teal + 'ff', null, 0);
                });
            }
        }

        ctx.globalAlpha = la;
        if (s.label === 'root') {
            tx('ROOT', rp.x, rp.y - r - 16, L.fsub, P.purple + 'ff', 'center', true);
            tx('부모 없음', rp.x - r - 14, rp.y, L.fsub, P.sub + 'ff', 'right', false);
        }
        if (s.label === 'parent-child') {
            tx('PARENT', rp.x, rp.y - r - 16, L.fsub, P.teal + 'ff', 'center', true);
            [2, 3].forEach(function (cid) {
                var cp = dtPos(cid, x0, top, L);
                var mx = (rp.x + cp.x) / 2, my = (rp.y + cp.y) / 2;
                if (cid === 2) tx('CHILD', mx - 8, my, L.fsub, P.teal + 'ff', 'right', true);
                else tx('CHILD', mx + 8, my, L.fsub, P.teal + 'ff', 'left', true);
            });
        }
        if (s.label === 'leaf') {
            [4, 5, 6, 7].forEach(function (lid) {
                var lp = dtPos(lid, x0, top, L);
                tx('LEAF', lp.x, lp.y + r + 12, L.fsub, P.green + 'ff', 'center', true);
            });
        }
        if (s.label === 'subtree') {
            var sp2 = dtPos(2, x0, top, L), sp4 = dtPos(4, x0, top, L), sp5 = dtPos(5, x0, top, L);
            var bx1 = sp4.x - r - 10, bx2 = sp5.x + r + 10;
            var by1 = sp2.y - r - 12, by2 = sp4.y + r + 10;
            ctx.setLineDash([5, 4]);
            rr(bx1, by1, bx2 - bx1, by2 - by1, 10, 'none', P.orange + 'cc', 1.6);
            ctx.setLineDash([]);
            tx('SUBTREE', (bx1 + bx2) / 2, by2 + 12, L.fsub, P.orange + 'ff', 'center', true);
        }
        if (lvl) {
            L.capL.forEach(function (txt, i) {
                tx(txt, x0 + w / 2, top + L.capY + i * (L.fsub + 5) + (L.fsub + 5) / 2, L.fsub, P.text + 'ff', 'center', true);
            });
        }
        ctx.globalAlpha = 1;
    }

    /* ===================== 순회 드로우 ===================== */
    function dtDrawTrav(x0, top, w, mob, L, s, p, fresh, e) {
        var steps = currentSteps();
        var r = L.r;
        var cf = fresh ? ez(seg(e, 0, 0.5)) : 1;
        var iN = dtTravInfo(s, steps);
        var iP = fresh ? dtTravInfo(p, steps) : iN;

        Object.keys(NODES).forEach(function (k) {
            var n = NODES[k];
            if (n.parent === null) return;
            var a = dtPos(n.parent, x0, top, L), b = dtPos(n.id, x0, top, L);
            var onN = iN.stk.indexOf(n.parent) >= 0 && iN.stk.indexOf(n.id) >= 0;
            var onP = iP.stk.indexOf(n.parent) >= 0 && iP.stk.indexOf(n.id) >= 0;
            dtXfEdge(a, b, r,
                onN ? P.orange + 'cc' : P.muted + '44', onN ? 2.4 : 1.4,
                onP ? P.orange + 'cc' : P.muted + '44', onP ? 2.4 : 1.4, cf);
        });

        Object.keys(NODES).forEach(function (k) {
            var n = NODES[k];
            var pt = dtPos(n.id, x0, top, L);
            var sN = dtTravStyle(n.id, iN), sP = dtTravStyle(n.id, iP);
            var val = String(n.val);
            if (fresh && (sN.kind !== sP.kind || sN.col !== sP.col)) {
                dtPaint(pt.x, pt.y, r, sP, 1 - cf, val, L.fv);
                dtPaint(pt.x, pt.y, r, sN, cf, val, L.fv);
            } else {
                dtPaint(pt.x, pt.y, r, sN, 1, val, L.fv);
            }
        });

        if (s.visit !== null) {
            var from = (fresh && p.visit !== null) ? p.visit : s.visit;
            var mp, ma = 1;
            if (from === s.visit) {
                mp = dtPos(s.visit, x0, top, L);
                if (fresh && p.visit === null) ma = ez(seg(e, 0, 0.4));
            } else {
                var pts = dtPath(from, s.visit).map(function (id) { return dtPos(id, x0, top, L); });
                mp = dtAlong(pts, ez(seg(e, 0, 0.85)));
            }
            ctx.globalAlpha = ma;
            circ(mp.x, mp.y, r + 7, 'none', P.yellow + 'ff', 2.4);
            ctx.globalAlpha = 1;
        }

        var stk = iN.stk, stkP = iP.stk;
        var bw = mob ? 34 : 46, bh = L.stackH, gap = mob ? 6 : 8, fv = mob ? 12 : 14;
        var by = top + L.stackY;
        var i, bxx, byy, c, isTop, ap;
        tx('호출 스택', x0, top + L.stackLabelY, L.fsub, P.sub + 'ff', 'left', true);
        if (!stk.length && !stkP.length) tx('(비어 있음)', x0, by + bh / 2, L.fsub, P.sub + 'ff', 'left', false);
        for (i = 0; i < stk.length; i++) {
            isTop = i === stk.length - 1;
            ap = (fresh && isTop && stk.length > stkP.length) ? ez(e) : 1;
            bxx = x0 + i * (bw + gap);
            byy = by + (1 - ap) * -8;
            c = isTop ? P.orange : P.muted;
            ctx.globalAlpha = ap;
            rr(bxx, byy, bw, bh, 5, c + '26', c + 'cc', isTop ? 2 : 1.4);
            tx(String(NODES[stk[i]].val), bxx + bw / 2, byy + bh / 2, fv, isTop ? P.orange + 'ff' : P.text + 'cc', 'center', true);
        }
        if (fresh && stkP.length > stk.length) {
            ap = 1 - ez(e);
            for (i = stk.length; i < stkP.length; i++) {
                bxx = x0 + i * (bw + gap);
                byy = by - 10 * (1 - ap);
                ctx.globalAlpha = ap;
                rr(bxx, byy, bw, bh, 5, P.orange + '26', P.orange + 'cc', 2);
                tx(String(NODES[stkP[i]].val), bxx + bw / 2, byy + bh / 2, fv, P.orange + 'ff', 'center', true);
            }
        }
        ctx.globalAlpha = 1;

        var nm = mode === 'pre' ? 'Preorder' : (mode === 'in' ? 'Inorder' : 'Postorder');
        var vis = s.visited, nV = vis.length, prevN = p.visited.length;
        var cw = mob ? 26 : 32, ch = L.chipH, cg = mob ? 4 : 6, fc = mob ? 12 : 14;
        tx('결과 (' + nm + ')', x0, top + L.resLabelY, L.fsub, P.sub + 'ff', 'left', true);
        if (nV === 0) tx('(비어 있음)', x0, top + L.chipY + ch / 2, L.fsub, P.sub + 'ff', 'left', false);
        for (i = 0; i < nV; i++) {
            var newest = fresh && i === nV - 1 && nV > prevN;
            var a2 = newest ? ez(e) : 1;
            var cx = x0 + i * (cw + cg);
            var cy = top + L.chipY + (newest ? (1 - a2) * 8 : 0);
            var cc = newest ? P.green : P.teal;
            ctx.globalAlpha = a2;
            rr(cx, cy, cw, ch, 5, cc + '30', cc + 'ff', 1.4);
            tx(String(vis[i]), cx + cw / 2, cy + ch / 2, fc, P.text + 'ff', 'center', true);
        }
        ctx.globalAlpha = 1;
    }

    /* ===================== 메인 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var steps = currentSteps();
        var s = step || steps[0];
        var p = prev || s;
        var fresh = s !== p;
        var e = fresh ? clamp01(t) : 1;
        var L = layout(w, mob);
        if (mode === 'structure') dtDrawStruct(x0, top, w, mob, L, s, p, fresh, e);
        else dtDrawTrav(x0, top, w, mob, L, s, p, fresh, e);
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
        speedBtns.forEach(function (b) { b.classList.remove('tree-viz__speed-btn--active'); });
        btn.classList.add('tree-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('tree-viz__mode-btn--active', d.key === m); });
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