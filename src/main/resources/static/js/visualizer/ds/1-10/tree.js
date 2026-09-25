/**
 * 이진 트리 시각화
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

    var modeWrap   = el('div', 'tree-viz__mode');
    var modeDefs   = [
        { key: 'structure', label: '구조' },
        { key: 'pre',       label: '전위순회' },
        { key: 'in',        label: '중위순회' },
        { key: 'post',      label: '후위순회' },
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
    [['1x', 1800], ['2x', 900], ['3x', 600]].forEach(function (pair, i) {
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

    var logEl = el('div', 'tree-viz__log', '▶ PLAY를 눌러 트리 구조를 확인하세요.');
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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

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

    /* ===================== 상태 변수 ===================== */
    var mode     = 'structure';
    var stepIdx  = -1;
    var running  = false;
    var timer    = null;
    var rafId    = null;
    var speed    = 1800;
    var animProg = 1;

    function currentSteps() {
        if (mode === 'structure') return STRUCTURE_STEPS;
        if (mode === 'pre')  return PRE_STEPS;
        if (mode === 'in')   return IN_STEPS;
        return POST_STEPS;
    }

    /* ===================== 드로우 헬퍼 ===================== */
    function rr(x, y, w, h, r, fill, stroke, lw) {
        if (w <= 0 || h <= 0) return;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y,     x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x,     y + h, r);
        ctx.arcTo(x,     y + h, x,     y,     r);
        ctx.arcTo(x,     y,     x + w, y,     r);
        ctx.closePath();
        if (fill   && fill   !== 'none') { ctx.fillStyle   = fill;              ctx.fill();   }
        if (stroke && stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
    }

    function tx(str, x, y, sz, color, align, bold) {
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    function circle(cx, cy, r, fill, stroke, lw) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        if (fill)   { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
    }

    function line(x1, y1, x2, y2, col, lw, dash) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = col; ctx.lineWidth = lw || 1.5;
        ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]);
    }

    /* ===================== 노드 좌표 계산 ===================== */
    function nodePos(id, W, topY, levelGap) {
        var n = NODES[id];
        var cx;
        if (n.level === 0) cx = W / 2;
        else if (n.level === 1) cx = (n.id === 2) ? W / 2 - W * 0.22 : W / 2 + W * 0.22;
        else {
            var offsets = { 4: -0.34, 5: -0.10, 6: 0.10, 7: 0.34 };
            cx = W / 2 + W * offsets[id];
        }
        var cy = topY + n.level * levelGap;
        return { x: cx, y: cy };
    }

    /* ===================== 상태 색상 ===================== */
    function nodeColor(id, step, mode) {
        if (mode === 'structure') {
            var hi = step.highlight;
            if (hi && hi.nodes && hi.nodes.indexOf(id) >= 0) {
                if (step.label === 'root') return P.purple;
                if (step.label === 'leaf') return P.green;
                if (step.label === 'parent-child') return P.teal;
                if (step.label === 'subtree') return P.orange;
                return P.purple;
            }
            return P.muted;
        }
        if (step.visit === id) {
            if (step.action === 'visit') return P.green;
            if (step.action === 'enter') return P.orange;
            if (step.action === 'return') return P.teal;
        }
        if (step.visited && step.visitedIds && step.visitedIds.indexOf(id) >= 0) return P.teal;
        return P.muted;
    }

    function visitedIdSet(steps, idx) {
        var ids = [];
        for (var i = 0; i <= idx; i++) {
            if (steps[i].action === 'visit') ids.push(steps[i].visit);
        }
        return ids;
    }

    /* ===================== 구조 탭 드로우 ===================== */
    function drawStructure(W, H, mob, step) {
        var topY     = mob ? 50 : 64;
        var levelGap = mob ? 78 : 104;
        var r        = mob ? 22 : 28;
        var fVal     = mob ? 13 : 16;
        var fLbl     = mob ? 9  : 11;

        var hi = step.highlight || { nodes: [], edges: [] };

        Object.keys(NODES).forEach(function (key) {
            var n = NODES[key];
            if (!n.parent) return;
            var p1 = nodePos(n.parent, W, topY, levelGap);
            var p2 = nodePos(n.id, W, topY, levelGap);
            var isHi = hi.edges === 'all' ||
                (Array.isArray(hi.edges) && hi.edges.some(function (e) { return e[0] === n.parent && e[1] === n.id; }));
            var col = isHi ? P.purple + 'aa' : P.muted + '44';
            line(p1.x, p1.y + r, p2.x, p2.y - r, col, isHi ? 2 : 1.5);
        });

        if (hi.showLevels) {
            [0, 1, 2].forEach(function (lv) {
                var y = topY + lv * levelGap;
                line(mob ? 10 : 20, y, W - (mob ? 10 : 20), y, P.muted + '22', 1, [3, 4]);
                tx('L' + lv, mob ? 22 : 36, y, fLbl, P.muted + 'aa', 'left', false);
            });
        }

        Object.keys(NODES).forEach(function (key) {
            var n = NODES[key];
            var pos = nodePos(n.id, W, topY, levelGap);
            var col = nodeColor(n.id, step, 'structure');
            var isHi = hi.nodes.indexOf(n.id) >= 0;

            circle(pos.x, pos.y, r, col + (isHi ? '22' : '12'), col + (isHi ? 'ee' : '55'), isHi ? 2.5 : 1.5);
            tx(String(n.val), pos.x, pos.y, fVal, isHi ? col : P.text + 'cc', 'center', isHi);

            if (isHi && step.label) {
                var labelText = '';
                if (step.label === 'root' && n.id === ROOT_ID) labelText = 'ROOT';
                if (step.label === 'leaf' && LEAF_IDS.indexOf(n.id) >= 0) labelText = 'LEAF';
                if (labelText) {
                    tx(labelText, pos.x, pos.y - r - (mob ? 12 : 16), fLbl, col, 'center', true);
                }
            }
        });

        if (step.label === 'parent-child') {
            var p1 = nodePos(1, W, topY, levelGap);
            tx('PARENT', p1.x, p1.y - r - (mob ? 12 : 16), fLbl, P.teal, 'center', true);
        }
        if (step.label === 'subtree') {
            var sp = nodePos(2, W, topY, levelGap);
            var boxX = sp.x - (mob ? 60 : 80);
            var boxY = sp.y - r - (mob ? 14 : 18);
            var boxW = (mob ? 120 : 160);
            var boxH = levelGap + r * 2 + (mob ? 20 : 26);
            rr(boxX, boxY, boxW, boxH, 10, 'none', P.orange + '88', 1.5);
            tx('SUBTREE', sp.x, boxY - (mob ? 8 : 10), fLbl, P.orange, 'center', true);
        }
    }

    /* ===================== 순회 탭 드로우 ===================== */
    function drawTraversal(W, H, mob, steps, step, stepIdx) {
        var topY     = mob ? 50 : 64;
        var levelGap = mob ? 78 : 104;
        var r        = mob ? 22 : 28;
        var fVal     = mob ? 13 : 16;
        var fOrd     = mob ? 10 : 12;

        var visitedIds = visitedIdSet(steps, stepIdx);
        var stack      = computeStack(steps, stepIdx);

        Object.keys(NODES).forEach(function (key) {
            var n = NODES[key];
            if (!n.parent) return;
            var p1 = nodePos(n.parent, W, topY, levelGap);
            var p2 = nodePos(n.id, W, topY, levelGap);
            var onPath = stack.indexOf(n.parent) >= 0 && stack.indexOf(n.id) >= 0;
            var col = onPath ? P.orange + 'cc' : P.muted + '44';
            line(p1.x, p1.y + r, p2.x, p2.y - r, col, onPath ? 2.5 : 1.5);
        });

        Object.keys(NODES).forEach(function (key) {
            var n = NODES[key];
            var pos = nodePos(n.id, W, topY, levelGap);
            var col = nodeColor(n.id, step, 'traversal');
            var isCurrent = step.visit === n.id;
            var isVisited = visitedIds.indexOf(n.id) >= 0;
            var isOnStack = stack.indexOf(n.id) >= 0;

            var fillA = isCurrent ? '28' : (isVisited ? '18' : '0f');
            var strokeA = isCurrent ? 'ee' : (isOnStack ? 'bb' : (isVisited ? '99' : '44'));
            circle(pos.x, pos.y, r, col + fillA, col + strokeA, isCurrent ? 2.5 : (isOnStack ? 2 : 1.5));
            tx(String(n.val), pos.x, pos.y, fVal, (isCurrent || isVisited) ? col : P.text + 'aa', 'center', isCurrent);

            var ord = -1;
            for (var i = 0; i <= stepIdx; i++) {
                if (steps[i].action === 'visit' && steps[i].visit === n.id) {
                    ord = visitedIdSet(steps, i).length;
                    break;
                }
            }
            if (ord > 0) {
                var badgeR = mob ? 9 : 11;
                var bcx = pos.x;
                var bcy = pos.y - r - badgeR - (mob ? 3 : 4);
                circle(bcx, bcy, badgeR, P.green + 'ee', null, 0);
                tx(String(ord), bcx, bcy, fOrd, '#0f0f1a', 'center', true);
            }
        });

        var stackAreaY = topY + 2 * levelGap + r + (mob ? 36 : 46);
        var stackLabelFsz = mob ? 10 : 12;
        tx('CALL STACK', mob ? 16 : 28, stackAreaY, stackLabelFsz, P.muted + 'aa', 'left', true);

        var stackBoxY = stackAreaY + (mob ? 16 : 20);
        var stackBoxH = mob ? 30 : 38;
        var stackBoxW = mob ? 46 : 58;
        var stackGap  = mob ? 6 : 8;
        var stackStartX = mob ? 16 : 28;
        if (stack.length === 0) {
            tx('(empty)', stackStartX, stackBoxY + stackBoxH / 2, mob ? 10 : 12, P.muted + '77', 'left', false);
        } else {
            for (var si = 0; si < stack.length; si++) {
                var sid = stack[si];
                var sx  = stackStartX + si * (stackBoxW + stackGap);
                var sCol = (si === stack.length - 1) ? P.orange : P.muted;
                rr(sx, stackBoxY, stackBoxW, stackBoxH, 5, sCol + '18', sCol + 'cc', si === stack.length - 1 ? 2 : 1.5);
                tx(String(NODES[sid].val), sx + stackBoxW / 2, stackBoxY + stackBoxH / 2, mob ? 12 : 14, sCol, 'center', true);
            }
        }

        var resultY = stackAreaY;
        var resultLabel = '결과 (' + (mode === 'pre' ? 'Preorder' : mode === 'in' ? 'Inorder' : 'Postorder') + ')';
        var resultAlign = mob ? 'left' : 'right';
        var resultX = mob ? stackStartX : W - (mob ? 16 : 28);
        if (mob) {
            var resY2 = stackBoxY + stackBoxH + 22;
            tx(resultLabel, stackStartX, resY2, stackLabelFsz, P.muted + 'aa', 'left', true);
            tx(step.visited.length ? step.visited.join(', ') : '(empty)', stackStartX, resY2 + 18, 12, P.green, 'left', false);
        } else {
            tx(resultLabel, resultX, resultY, stackLabelFsz, P.muted + 'aa', resultAlign, true);
            tx(step.visited.length ? step.visited.join(', ') : '(empty)', resultX, resultY + 20, 13, P.green, resultAlign, false);
        }
    }

    /* ===================== resize ===================== */
    function calcH(W) {
        var mob = W < 600;
        var topY     = mob ? 50 : 64;
        var levelGap = mob ? 78 : 104;
        var r        = mob ? 22 : 28;

        var treeBottom = topY + 2 * levelGap + r;

        if (mode === 'structure') {
            return treeBottom + (mob ? 30 : 40);
        } else {
            if (mob) {
                return treeBottom + 36 + 16 + 30 + 22 + 18 + 24;
            }
            return treeBottom + 46 + 20 + 38 + 30;
        }
    }

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

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        var W   = GW();
        var H   = GH();
        var mob = W < 600;

        var steps = currentSteps();
        var step  = stepIdx >= 0 ? steps[stepIdx] : steps[0];

        if (mode === 'structure') {
            drawStructure(W, H, mob, step);
        } else {
            drawTraversal(W, H, mob, steps, step, stepIdx >= 0 ? stepIdx : 0);
        }
    }

    /* ===================== 애니메이션 ===================== */
    function animateStep(onDone) {
        animProg = 0;
        if (rafId) cancelAnimationFrame(rafId);
        var s = 0.007 * (1800 / speed);
        (function tick() {
            animProg = Math.min(1, animProg + s);
            draw();
            if (animProg < 1) {
                rafId = requestAnimationFrame(tick);
            } else {
                draw();
                if (onDone) onDone();
            }
        })();
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) {
        speedBtns.forEach(function (b) { b.disabled = v; });
    }

    function defaultLog() {
        if (mode === 'structure') return '▶ PLAY를 눌러 트리 구조를 확인하세요.';
        return '▶ PLAY를 눌러 순회 과정을 확인하세요.';
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
                    timer = setTimeout(tick, speed * 0.55);
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
        running = false; stepIdx = -1; animProg = 1;
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
        modeDefs.forEach(function (d) {
            modeBtns[d.key].classList.toggle('tree-viz__mode-btn--active', d.key === m);
        });
        vizReset();
    }

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
                draw: draw,
            };
        },
    });

    setTimeout(resize, 60);
})();