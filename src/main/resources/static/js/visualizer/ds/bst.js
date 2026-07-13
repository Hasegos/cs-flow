/**
 * 이진 탐색 트리(BST) 시각화
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
    var root    = el('div', 'bst-viz');
    var toolbar = el('div', 'bst-viz__toolbar');
    var tbLeft  = el('div', 'bst-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'bst-viz__title', 'BST'));

    var modeWrap = el('div', 'bst-viz__mode');
    var modeDefs = [
        { key: 'insert',   label: '삽입' },
        { key: 'search',   label: '탐색' },
        { key: 'delete',   label: '삭제' },
        { key: 'skewed',   label: '불균형' },
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'bst-viz__mode-btn' + (i === 0 ? ' bst-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'bst-viz__speed');
    speedWrap.appendChild(el('span', 'bst-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1800], ['2x', 900], ['3x', 600]].forEach(function (pair, i) {
        var b = el('button', 'bst-viz__speed-btn' + (i === 0 ? ' bst-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'bst-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'bst-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'bst-viz__log', '▶ PLAY를 눌러 BST 동작을 확인하세요.');
    root.appendChild(logEl);

    var controls = el('div', 'bst-viz__controls');
    var btnPlay  = el('button', 'bst-viz__btn bst-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'bst-viz__btn', '▶| STEP');
    var btnReset = el('button', 'bst-viz__btn', '↺ RESET');
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

    /* ===================== 트리 스냅샷 구조 ===================== */
    var XPOS = {
        50: 0.50,
        30: 0.25,  70: 0.75,
        20: 0.125, 40: 0.375, 60: 0.625, 80: 0.875,
        10: 0.0625,
    };
    var LEVEL = {
        50: 0,
        30: 1, 70: 1,
        20: 2, 40: 2, 60: 2, 80: 2,
        10: 3,
    };
    var PARENT_VAL = {
        30: 50, 70: 50,
        20: 30, 40: 30, 60: 70, 80: 70,
        10: 20,
    };
    var EDGES_FULL = [
        [50,30],[50,70],
        [30,20],[30,40],
        [70,60],[70,80],
        [20,10],
    ];

    /* ===================== 삽입 스텝 ===================== */
    var INSERT_STEPS = [
        {
            log: '초기 상태. 빈 BST. 삽입 순서: 50, 30, 70, 20, 40, 60, 80, 10',
            vals: [], path: [], newVal: null, phase: 'idle',
        },
        {
            log: 'INSERT 50 → 트리가 비어 있으므로 루트로 삽입합니다.',
            vals: [50], path: [], newVal: 50, phase: 'insert',
        },
        {
            log: 'INSERT 30 → 50 비교: 30 < 50 → 왼쪽. 왼쪽이 비어 있음 → 삽입.',
            vals: [50,30], path: [50], newVal: 30, phase: 'insert',
        },
        {
            log: 'INSERT 70 → 50 비교: 70 > 50 → 오른쪽. 오른쪽이 비어 있음 → 삽입.',
            vals: [50,30,70], path: [50], newVal: 70, phase: 'insert',
        },
        {
            log: 'INSERT 20 → 50: 20 < 50 → 왼쪽. 30: 20 < 30 → 왼쪽. 비어 있음 → 삽입.',
            vals: [50,30,70,20], path: [50,30], newVal: 20, phase: 'insert',
        },
        {
            log: 'INSERT 40 → 50: 40 < 50 → 왼쪽. 30: 40 > 30 → 오른쪽. 비어 있음 → 삽입.',
            vals: [50,30,70,20,40], path: [50,30], newVal: 40, phase: 'insert',
        },
        {
            log: 'INSERT 60 → 50: 60 > 50 → 오른쪽. 70: 60 < 70 → 왼쪽. 비어 있음 → 삽입.',
            vals: [50,30,70,20,40,60], path: [50,70], newVal: 60, phase: 'insert',
        },
        {
            log: 'INSERT 80 → 50: 80 > 50 → 오른쪽. 70: 80 > 70 → 오른쪽. 비어 있음 → 삽입.',
            vals: [50,30,70,20,40,60,80], path: [50,70], newVal: 80, phase: 'insert',
        },
        {
            log: 'INSERT 10 → 50: 10 < 50 → 왼쪽. 30: 10 < 30 → 왼쪽. 20: 10 < 20 → 왼쪽. 비어 있음 → 삽입. BST 완성.',
            vals: [50,30,70,20,40,60,80,10], path: [50,30,20], newVal: 10, phase: 'insert',
        },
    ];

    /* ===================== 탐색 스텝 ===================== */
    var SEARCH_STEPS = [
        {
            log: '완성된 BST. 탐색은 루트부터 시작해 값을 비교하며 내려갑니다. BST 조건 덕분에 항상 절반씩 탐색 범위를 줄입니다.',
            vals: [50,30,70,20,40,60,80,10], path: [], target: null, phase: 'idle',
        },
        {
            log: 'SEARCH 40 → 루트 50 확인: 40 < 50 → 왼쪽 서브트리로 이동. 오른쪽 절반은 탐색 불필요.',
            vals: [50,30,70,20,40,60,80,10], path: [50], target: 40, phase: 'search',
        },
        {
            log: 'SEARCH 40 → 노드 30 확인: 40 > 30 → 오른쪽 서브트리로 이동.',
            vals: [50,30,70,20,40,60,80,10], path: [50,30], target: 40, phase: 'search',
        },
        {
            log: 'SEARCH 40 → 노드 40 확인: 40 = 40 → 탐색 성공! 총 3번의 비교만으로 발견. O(log 8) = 3.',
            vals: [50,30,70,20,40,60,80,10], path: [50,30,40], target: 40, phase: 'found',
        },
        {
            log: 'SEARCH 35 → 새로운 탐색. 루트 50: 35 < 50 → 왼쪽.',
            vals: [50,30,70,20,40,60,80,10], path: [50], target: 35, phase: 'search',
        },
        {
            log: 'SEARCH 35 → 노드 30: 35 > 30 → 오른쪽.',
            vals: [50,30,70,20,40,60,80,10], path: [50,30], target: 35, phase: 'search',
        },
        {
            log: 'SEARCH 35 → 노드 40: 35 < 40 → 왼쪽. 왼쪽이 null → 탐색 실패! 35는 트리에 없습니다.',
            vals: [50,30,70,20,40,60,80,10], path: [50,30,40], target: 35, phase: 'notfound',
        },
    ];

    /* ===================== 삭제 스텝 ===================== */
    var DELETE_STEPS = [
        {
            log: '완성된 BST. 삭제는 3가지 케이스로 나뉩니다. 순서대로 각 케이스를 시연합니다.',
            vals: [50,30,70,20,40,60,80,10], path: [], target: null,
            deleted: null, successor: null, phase: 'idle',
        },
        {
            log: 'Case 1: DELETE 10 (리프 노드). 자식이 없으므로 단순 제거. 부모(20)의 왼쪽 포인터를 null로 설정.',
            vals: [50,30,70,20,40,60,80,10], path: [50,30,20], target: 10,
            deleted: null, successor: null, phase: 'case1-target',
        },
        {
            log: 'Case 1 완료: 10이 제거되었습니다. 트리에 영향을 주는 노드가 없어 가장 단순한 케이스입니다.',
            vals: [50,30,70,20,40,60,80], path: [], target: null,
            deleted: 10, successor: null, phase: 'case1-done',
        },
        {
            log: 'Case 2: DELETE 20 (자식 1개). 20의 왼쪽에 10이 있습니다. 삭제 후 부모(30)가 10을 직접 가리키도록 연결.',
            vals: [50,30,70,20,40,60,80,10], path: [50,30], target: 20,
            deleted: null, successor: null, phase: 'case2-target',
        },
        {
            log: 'Case 2 완료: 20이 제거되고 30 → 10이 직접 연결되었습니다. BST 조건(10 < 30)이 유지됩니다.',
            vals: [50,30,70,10,40,60,80], path: [], target: null,
            deleted: 20, successor: null, phase: 'case2-done', edges: [[50,30],[50,70],[30,10],[30,40],[70,60],[70,80]],
        },
        {
            log: 'Case 3: DELETE 30 (자식 2개). 30의 왼쪽 서브트리: 10, 오른쪽 서브트리: 40. 중위 후계자(오른쪽 서브트리 최솟값)를 찾습니다.',
            vals: [50,30,70,10,40,60,80], path: [50], target: 30,
            deleted: null, successor: null, phase: 'case3-target', edges: [[50,30],[50,70],[30,10],[30,40],[70,60],[70,80]],
        },
        {
            log: '중위 후계자 탐색: 30의 오른쪽 서브트리(40)에서 가장 왼쪽 노드 = 40. 40이 후계자입니다.',
            vals: [50,30,70,10,40,60,80], path: [50], target: 30,
            deleted: null, successor: 40, phase: 'case3-successor', edges: [[50,30],[50,70],[30,10],[30,40],[70,60],[70,80]],
        },
        {
            log: 'Case 3 완료: 30의 값을 40으로 교체하고, 원래 40 노드를 제거합니다. BST 조건이 유지됩니다.',
            vals: [50,40,70,10,60,80], path: [], target: null,
            deleted: 30, successor: 40, phase: 'case3-done', edges: [[50,40],[40,10],[50,70],[70,60],[70,80]],
        },
    ];

    /* ===================== 불균형 스텝 ===================== */
    var SKEWED_STEPS = [
        {
            log: '불균형 시연: 정렬된 순서(10→20→30→40→50)로 삽입하면 어떻게 될까요?',
            skewedVals: [], balancedVals: [], phase: 'idle',
        },
        {
            log: 'INSERT 10 → 루트.',
            skewedVals: [10], balancedVals: [30], phase: 'build',
        },
        {
            log: 'INSERT 20 → 10: 20 > 10 → 오른쪽만 존재. 오른쪽 방향으로만 자랍니다.',
            skewedVals: [10,20], balancedVals: [30,10,40], phase: 'build',
        },
        {
            log: 'INSERT 30 → 10 → 20: 모두 오른쪽. 트리가 일직선으로 뻗고 있습니다.',
            skewedVals: [10,20,30], balancedVals: [30,10,40,20], phase: 'build',
        },
        {
            log: 'INSERT 40 → 계속 오른쪽으로만. 높이 = 삽입 수 = 4. 균형 트리라면 높이가 log n 수준이라 훨씬 낮습니다.',
            skewedVals: [10,20,30,40], balancedVals: [30,10,40,20,50], phase: 'build',
        },
        {
            log: 'INSERT 50 → 편향 트리(Skewed Tree) 완성! 높이 = 5(=n). SEARCH 50: 10 → 20 → 30 → 40 → 50 — 5번 비교 O(n).',
            skewedVals: [10,20,30,40,50], balancedVals: [30,10,40,20,50], phase: 'compare',
        },
        {
            log: '균형 BST(같은 값, 다른 삽입 순서: 30→10→40→20→50)는 높이 = 3으로 log n 수준입니다. SEARCH 50: 30 → 40 → 50 — 3번 비교 O(log n). 편향 트리 대비 탐색이 훨씬 빠릅니다. AVL/Red-Black Tree는 자동으로 균형을 유지합니다.',
            skewedVals: [10,20,30,40,50], balancedVals: [30,10,40,20,50], phase: 'highlight',
        },
    ];

    /* ===================== 레이아웃 계산 ===================== */
    function getNodePx(val, W, topY, levelGap) {
        return {
            x: XPOS[val] * W,
            y: topY + LEVEL[val] * levelGap,
        };
    }

    function getEdges(vals, list) {
        var edges = [];
        (list || EDGES_FULL).forEach(function (e) {
            if (vals.indexOf(e[0]) >= 0 && vals.indexOf(e[1]) >= 0) edges.push(e);
        });
        return edges;
    }

    /* ===================== 드로우 헬퍼 ===================== */
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
        if (fill)   { ctx.fillStyle   = fill;              ctx.fill();   }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
    }

    function line(x1, y1, x2, y2, col, lw, dash) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = col; ctx.lineWidth = lw || 1.5;
        ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]);
    }

    /* ===================== 공통 트리 드로우 ===================== */
    function drawBST(vals, pathVals, specials, W, topY, levelGap, r, edgeList) {
        var fVal = W < 600 ? 11 : 14;
        specials = specials || {};

        var edges = getEdges(vals, edgeList);
        edges.forEach(function (e) {
            var p1 = getNodePx(e[0], W, topY, levelGap);
            var p2 = getNodePx(e[1], W, topY, levelGap);
            var onPath = pathVals.indexOf(e[0]) >= 0 && pathVals.indexOf(e[1]) >= 0;
            var col = onPath ? P.orange + 'cc' : P.muted + '44';
            var dx = p2.x - p1.x, dy = p2.y - p1.y;
            var dist = Math.sqrt(dx*dx + dy*dy);
            var ux = dx/dist, uy = dy/dist;
            line(p1.x + ux*r, p1.y + uy*r, p2.x - ux*r, p2.y - uy*r, col, onPath ? 2 : 1.5);
        });

        vals.forEach(function (val) {
            var pos  = getNodePx(val, W, topY, levelGap);
            var sp   = specials[val] || 'normal';
            var onPath = pathVals.indexOf(val) >= 0;

            var col = sp === 'new'       ? P.green
                    : sp === 'found'     ? P.green
                    : sp === 'target'    ? P.orange
                    : sp === 'successor' ? P.purple
                    : sp === 'notfound'  ? P.red || P.orange
                    : onPath             ? P.orange
                    : P.teal;

            var fillA   = (sp !== 'normal' || onPath) ? '22' : '12';
            var strokeA = (sp !== 'normal' || onPath) ? 'ee' : '66';
            var lw      = (sp !== 'normal' || onPath) ? 2.5  : 1.5;

            circle(pos.x, pos.y, r, col + fillA, col + strokeA, lw);
            tx(String(val), pos.x, pos.y, fVal, col, 'center', sp !== 'normal' || onPath);

            var lbl = sp === 'new'       ? 'NEW'
                    : sp === 'found'     ? 'FOUND'
                    : sp === 'successor' ? 'SUCCESSOR'
                    : sp === 'notfound'  ? 'NOT FOUND'
                    : '';
            if (lbl) {
                tx(lbl, pos.x, pos.y - r - (W < 600 ? 10 : 14), W < 600 ? 8 : 10, col, 'center', true);
            }
        });
    }

    /* ===================== 삽입 드로우 ===================== */
    function drawInsert(W, H, mob, step) {
        var topY     = mob ? 44 : 56;
        var levelGap = mob ? 64 : 86;
        var r        = mob ? 19 : 24;

        var specials = {};
        if (step.newVal !== null) specials[step.newVal] = 'new';

        drawBST(step.vals, step.path, specials, W, topY, levelGap, r, step.edges);

        var infoY = topY + 3 * levelGap + r + (mob ? 18 : 24);
        tx('BST 조건: 왼쪽 < 부모 < 오른쪽   |   삽입: 비교마다 절반씩 좁혀 O(log n)', W/2, infoY, mob ? 9 : 11, P.muted + 'aa', 'center', false);
    }

    /* ===================== 탐색 드로우 ===================== */
    function drawSearch(W, H, mob, step) {
        var topY     = mob ? 44 : 56;
        var levelGap = mob ? 64 : 86;
        var r        = mob ? 19 : 24;

        var specials = {};
        if (step.phase === 'found' && step.target !== null) {
            specials[step.target] = 'found';
        }
        if (step.phase === 'notfound' && step.target !== null) {
            var lastPath = step.path[step.path.length - 1];
            if (lastPath !== undefined) specials[lastPath] = 'notfound';
        }

        drawBST(step.vals, step.path, specials, W, topY, levelGap, r, step.edges);

        if (step.target !== null) {
            var tLabel = 'SEARCH ' + step.target;
            var tCol = step.phase === 'found' ? P.green
                     : step.phase === 'notfound' ? P.orange
                     : P.purple;
            tx(tLabel, W/2, topY - (mob ? 26 : 32), mob ? 11 : 14, tCol, 'center', true);
        }

        var infoY = topY + 3 * levelGap + r + (mob ? 18 : 24);
        tx('탐색 성공 O(log n)  |  탐색 실패: null 도달 시 종료', W/2, infoY, mob ? 9 : 11, P.muted + 'aa', 'center', false);
    }

    /* ===================== 삭제 드로우 ===================== */
    function drawDelete(W, H, mob, step) {
        var topY     = mob ? 44 : 56;
        var levelGap = mob ? 64 : 86;
        var r        = mob ? 19 : 24;

        var specials = {};
        if (step.target !== null) specials[step.target] = 'target';
        if (step.successor !== null) specials[step.successor] = 'successor';

        drawBST(step.vals, step.path, specials, W, topY, levelGap, r, step.edges);

        if (step.deleted !== null && XPOS[step.deleted] !== undefined) {
            var dp = getNodePx(step.deleted, W, topY, levelGap);
            tx('✕', dp.x, dp.y - r - (mob ? 10 : 14), mob ? 10 : 13, P.orange, 'center', true);
        }

        var caseLabel = step.phase === 'case1-target' || step.phase === 'case1-done' ? 'Case 1: 리프 노드 제거'
                      : step.phase === 'case2-target' || step.phase === 'case2-done' ? 'Case 2: 자식 1개 — 부모-자식 직결'
                      : step.phase === 'case3-target' || step.phase === 'case3-successor' || step.phase === 'case3-done'
                        ? 'Case 3: 자식 2개 — 중위 후계자(Inorder Successor)로 대체'
                      : 'BST 삭제 — 3가지 케이스';
        var cCol = step.phase.indexOf('case1') >= 0 ? P.teal
                 : step.phase.indexOf('case2') >= 0 ? P.purple
                 : step.phase.indexOf('case3') >= 0 ? P.orange
                 : P.muted;
        tx(caseLabel, W/2, topY - (mob ? 24 : 30), mob ? 9 : 11, cCol, 'center', true);

        var infoY = topY + 3 * levelGap + r + (mob ? 18 : 24);
        tx('Case3 후계자: 오른쪽 서브트리 최솟값 — BST 조건을 유지하는 유일한 대체 후보', W/2, infoY, mob ? 9 : 11, P.muted + 'aa', 'center', false);
    }

    /* ===================== 불균형 드로우 ===================== */
    function drawSkewed(W, H, mob, step) {
        var fSub  = mob ? 9 : 11;
        var fVal  = mob ? 11 : 13;
        var r     = mob ? 16 : 20;
        var half  = W / 2;
        var pad   = mob ? 16 : 28;

        var skewX  = pad + r + (mob ? 10 : 20);
        var skewTopY  = mob ? 50 : 64;
        var skewGap   = mob ? 46 : 60;

        tx('편향 트리 O(n)', half / 2, mob ? 28 : 36, mob ? 10 : 13, P.orange, 'center', true);

        var svs = step.skewedVals;
        for (var i = 0; i < svs.length; i++) {
            var sy = skewTopY + i * skewGap;
            if (i > 0) {
                line(skewX, sy - skewGap + r, skewX, sy - r, P.orange + 'aa', 1.5);
            }
            var isLast = (i === svs.length - 1);
            var isHighlighted = (step.phase === 'highlight' && svs[i] === 50);
            var col = isLast ? P.green
                    : isHighlighted ? P.green
                    : P.orange;
            circle(skewX, sy, r, col + '1a', col + (isLast ? 'ee' : 'aa'), isLast ? 2.5 : 1.5);
            tx(String(svs[i]), skewX, sy, fVal, col, 'center', isLast);
        }

        if (svs.length > 0) {
            var heightY = skewTopY + (svs.length - 1) * skewGap;
            tx('높이 = ' + svs.length, skewX + r + (mob ? 14 : 20), skewTopY + (svs.length - 1) * skewGap / 2, fSub, P.orange + 'cc', 'left', false);
        }

        ctx.beginPath();
        ctx.moveTo(half, mob ? 24 : 28);
        ctx.lineTo(half, H - (mob ? 28 : 36));
        ctx.strokeStyle = P.muted + '44'; ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);

        var bTopY   = mob ? 50 : 64;
        var bGap    = mob ? 52 : 68;
        var bCenterX = half + (W - half) / 2;
        var bW      = (W - half);

        tx('균형 BST O(log n)', half + bW / 2, mob ? 28 : 36, mob ? 10 : 13, P.green, 'center', true);

        var bvs = step.balancedVals;
        var bLayout = {
            30: { x: bCenterX,              y: bTopY },
            10: { x: bCenterX - bW * 0.22,  y: bTopY + bGap },
            40: { x: bCenterX + bW * 0.22,  y: bTopY + bGap },
            20: { x: bCenterX - bW * 0.08,  y: bTopY + bGap * 2 },
            50: { x: bCenterX + bW * 0.30,  y: bTopY + bGap * 2 },
        };
        var bEdges = [[30,10],[30,40],[10,20],[40,50]];
        var bHighlight = (step.phase === 'highlight') ? [30, 40, 50] : [];

        bEdges.forEach(function (e) {
            if (bvs.indexOf(e[0]) < 0 || bvs.indexOf(e[1]) < 0) return;
            var p1 = bLayout[e[0]], p2 = bLayout[e[1]];
            if (!p1 || !p2) return;
            var onHL = bHighlight.indexOf(e[0]) >= 0 && bHighlight.indexOf(e[1]) >= 0;
            var dx = p2.x - p1.x, dy = p2.y - p1.y;
            var dist = Math.sqrt(dx*dx + dy*dy);
            var ux = dx/dist, uy = dy/dist;
            line(p1.x + ux*r, p1.y + uy*r, p2.x - ux*r, p2.y - uy*r,
                 onHL ? P.green + 'cc' : P.muted + '44', onHL ? 2 : 1.5);
        });

        bvs.forEach(function (val) {
            var pos = bLayout[val];
            if (!pos) return;
            var onHL = bHighlight.indexOf(val) >= 0;
            var isLast = (val === 50 && step.phase !== 'idle');
            var col = isLast ? P.green : (onHL ? P.green : P.teal);
            circle(pos.x, pos.y, r, col + '18', col + (onHL ? 'ee' : '77'), onHL ? 2.5 : 1.5);
            tx(String(val), pos.x, pos.y, fVal, col, 'center', onHL);
        });

        if (bvs.length > 0) {
            var bHeight = bvs.length <= 1 ? 1 : bvs.length <= 3 ? 2 : 3;
            tx('높이 = ' + bHeight, bCenterX + r + (mob ? 14 : 20), bTopY + bHeight * bGap / 2, fSub, P.green + 'cc', 'left', false);
        }

        if (step.phase === 'compare' || step.phase === 'highlight') {
            var bottomY = H - (mob ? 38 : 46);
            tx('편향: SEARCH 50 → 5번 비교  O(n=5)', pad, bottomY, fSub, P.orange + 'cc', 'left', false);
            tx('균형: SEARCH 50 → 3번 비교  O(log n)', half + pad, bottomY, fSub, P.green + 'cc', 'left', false);
        }
    }

    /* ===================== resize ===================== */
    function calcH(W) {
        var mob = W < 600;
        if (mode === 'skewed') {
            return mob ? 420 : 520;
        }
        var topY     = mob ? 44 : 56;
        var levelGap = mob ? 64 : 86;
        var r        = mob ? 19 : 24;
        return topY + (mob ? 30 : 38) + 3 * levelGap + r + (mob ? 32 : 44) + (mob ? 20 : 28);
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
        var si    = stepIdx >= 0 ? stepIdx : 0;
        var step  = steps[si];

        if      (mode === 'insert') drawInsert(W, H, mob, step);
        else if (mode === 'search') drawSearch(W, H, mob, step);
        else if (mode === 'delete') drawDelete(W, H, mob, step);
        else                        drawSkewed(W, H, mob, step);
    }

    /* ===================== 상태 ===================== */
    var mode     = 'insert';
    var stepIdx  = -1;
    var running  = false;
    var timer    = null;
    var rafId    = null;
    var speed    = 1800;
    var animProg = 1;

    function currentSteps() {
        if (mode === 'insert') return INSERT_STEPS;
        if (mode === 'search') return SEARCH_STEPS;
        if (mode === 'delete') return DELETE_STEPS;
        return SKEWED_STEPS;
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
        return '▶ PLAY를 눌러 BST 동작을 확인하세요.';
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
                    timer = setTimeout(tick, speed * 0.65);
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
        speedBtns.forEach(function (b) { b.classList.remove('bst-viz__speed-btn--active'); });
        btn.classList.add('bst-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) {
            modeBtns[d.key].classList.toggle('bst-viz__mode-btn--active', d.key === m);
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