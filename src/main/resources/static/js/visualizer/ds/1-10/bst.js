/**
 * 이진 탐색 트리(BST) 시각화 시각화
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
        { key: 'insert', label: '삽입' },
        { key: 'search', label: '탐색' },
        { key: 'delete', label: '삭제' },
        { key: 'skewed', label: '불균형' }
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
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
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

    var logEl = el('div', 'bst-viz__log', '');
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
    function GW() { return canvas.width / dpr; }
    function GH() { return canvas.height / dpr; }

    var P = window.CsFlow.getP();

    /* ===================== 상태 ===================== */
    var mode    = 'insert';
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

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'search') return SEARCH_STEPS;
        if (mode === 'delete') return DELETE_STEPS;
        if (mode === 'skewed') return SKEWED_STEPS;
        return INSERT_STEPS;
    }
    function defaultLog() {
        return '▶ PLAY를 눌러 BST 동작을 확인하세요.';
    }
    function ez(q) { var v = clamp01(q); return v * v * (3 - 2 * v); }

    /* ===================== 레이아웃 ===================== */
    var BS_WALK = 0.6;
    var BS_SK_PATH = [30, 40, 50];
    var BS_SK_EDGES = [[30, 10], [30, 40], [10, 20], [40, 50]];
    var BS_SK_POS = { 30: [0, 0], 10: [-0.22, 1], 40: [0.22, 1], 20: [-0.08, 2], 50: [0.3, 2] };
    function bsKeys() {
        return INSERT_STEPS[INSERT_STEPS.length - 1].vals.slice().sort(function (a, b) { return a - b; });
    }
    function bsNote() {
        if (mode === 'search') return '탐색 성공 O(log n)  |  탐색 실패: null 도달 시 종료';
        if (mode === 'delete') return 'Case3 후계자: 오른쪽 서브트리 최솟값 — BST 조건을 유지하는 유일한 대체 후보';
        return 'BST 조건: 왼쪽 < 부모 < 오른쪽   |   삽입: 비교마다 절반씩 좁혀 O(log n)';
    }
    function bsSkLast() {
        var v = SKEWED_STEPS[SKEWED_STEPS.length - 1].skewedVals;
        return v[v.length - 1];
    }
    function bsSkCmpL() {
        var n = SKEWED_STEPS[SKEWED_STEPS.length - 1].skewedVals.length;
        return '편향: SEARCH ' + bsSkLast() + ' → ' + n + '번 비교  O(n=' + n + ')';
    }
    function bsSkCmpR() {
        return '균형: SEARCH ' + bsSkLast() + ' → ' + BS_SK_PATH.length + '번 비교  O(log n)';
    }
    function bsLayTree(w, mob) {
        var keys = bsKeys();
        var r = mob ? 12.5 : 19;
        var fs = mob ? 11 : 13;
        var fsub = mob ? 11 : 12;
        var dy = mob ? 44 : 66;
        var top = mob ? 36 : 42;
        var sp = Math.min(mob ? 38 : 96, (w - 2 * r - 6) / (keys.length - 1));
        var cmpTop = top + 3 * dy + r + (mob ? 16 : 22);
        var cmpLH = fsub + 5;
        var noteTop = cmpTop + 4 * cmpLH + (mob ? 10 : 14);
        var noteL = lines(bsNote(), w - 8, fsub);
        return {
            keys: keys, r: r, fs: fs, fsub: fsub, dy: dy, top: top, sp: sp,
            cmpTop: cmpTop, cmpLH: cmpLH, noteTop: noteTop, noteL: noteL,
            total: noteTop + noteL.length * (fsub + 4) + 6
        };
    }
    function bsLaySkew(w, mob) {
        var fs = mob ? 11 : 13;
        var fsub = mob ? 11 : 12;
        var r = mob ? 13 : 17;
        var gap = mob ? 40 : 54;
        var colW = w / 2;
        var top = mob ? 50 : 60;
        var n = SKEWED_STEPS[SKEWED_STEPS.length - 1].skewedVals.length;
        var labelY = top + (n - 1) * gap + r + 14;
        var cmpTop = labelY + fsub + 10;
        var cmpL = lines(bsSkCmpL(), colW - 8, fsub);
        var cmpR = lines(bsSkCmpR(), colW - 8, fsub);
        var cmpN = Math.max(cmpL.length, cmpR.length);
        return {
            fs: fs, fsub: fsub, r: r, gap: gap, top: top, hdrY: mob ? 12 : 14,
            labelY: labelY, cmpTop: cmpTop, cmpLH: fsub + 4, cmpL: cmpL, cmpR: cmpR,
            total: cmpTop + cmpN * (fsub + 4) + 6
        };
    }
    function layout(w, mob) {
        return mode === 'skewed' ? bsLaySkew(w, mob) : bsLayTree(w, mob);
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 트리 헬퍼 ===================== */
    function bsDepthOf(vals, edges) {
        var dep = {};
        var isChild = {};
        edges.forEach(function (ed) { isChild[ed[1]] = true; });
        var roots = vals.filter(function (k) { return !isChild[k]; });
        function walk(k, d) {
            dep[k] = d;
            edges.forEach(function (ed) { if (ed[0] === k) walk(ed[1], d + 1); });
        }
        if (roots.length > 0) walk(roots[0], 0);
        return dep;
    }
    function bsEdgesOf(st) {
        if (st.edges) return st.edges;
        return EDGES_FULL.filter(function (ed) {
            return st.vals.indexOf(ed[0]) >= 0 && st.vals.indexOf(ed[1]) >= 0;
        });
    }
    function bsSkEdgesOf(vals) {
        return BS_SK_EDGES.filter(function (ed) {
            return vals.indexOf(ed[0]) >= 0 && vals.indexOf(ed[1]) >= 0;
        });
    }
    function bsTreeH(vals) {
        var dep = bsDepthOf(vals, bsSkEdgesOf(vals));
        var h = 0;
        Object.keys(dep).forEach(function (k) { if (dep[k] + 1 > h) h = dep[k] + 1; });
        return h;
    }
    function bsHasEdge(list, a, b) {
        return list.some(function (ed) { return ed[0] === a && ed[1] === b; });
    }
    function bsPrefix(prev, cur) {
        return cur.length > prev.length && prev.every(function (k, i) { return cur[i] === k; });
    }
    function bsVisits(s) {
        var v = s.path.slice();
        if (mode === 'insert' && s.newVal !== null) v.push(s.newVal);
        if (mode === 'delete' && s.target !== null) {
            v.push(s.target);
            if (s.successor !== null) v.push(s.successor);
        }
        return v;
    }
    function bsCount(v, keys) {
        return keys.filter(function (k) { return k < v; }).length;
    }
    function bsAlong(pts, g) {
        var j = Math.floor(g);
        if (j >= pts.length - 1) return pts[pts.length - 1];
        var f = g - j;
        return { x: lerp(pts[j].x, pts[j + 1].x, f), y: lerp(pts[j].y, pts[j + 1].y, f) };
    }
    function bsCmpLine(T, k) {
        if (T === k) return T + ' = ' + k + ' → 찾음';
        return T < k ? T + ' < ' + k + ' → 왼쪽' : T + ' > ' + k + ' → 오른쪽';
    }
    function bsDelLines(s) {
        var T = s.target, S = s.successor, D = s.deleted;
        if (s.phase === 'case1-target') return [T + ': 자식 없음 (리프)', '부모의 포인터를 null로 끊는다'];
        if (s.phase === 'case1-done') return [D + ' 제거 완료', '나머지 노드와 연결은 그대로'];
        if (s.phase === 'case2-target') return [T + ': 자식 1개', '부모와 자식을 직접 잇는다'];
        if (s.phase === 'case2-done') return [D + ' 제거, 자식을 부모에 직접 연결', 'BST 조건 유지'];
        if (s.phase === 'case3-target') return [T + ': 자식 2개', '대체할 중위 후계자를 찾는다'];
        if (s.phase === 'case3-successor') return ['오른쪽 서브트리에서 가장 왼쪽 노드', '후계자 = ' + S];
        if (s.phase === 'case3-done') return [D + ' 자리에 ' + S + ' 값을 올리고', '원래 ' + S + ' 노드는 제거'];
        return [];
    }
    function bsDelHead(ph) {
        if (ph === 'case1-target' || ph === 'case1-done') return ['Case 1: 리프 노드 제거', P.teal];
        if (ph === 'case2-target' || ph === 'case2-done') return ['Case 2: 자식 1개 → 부모-자식 직결', P.purple];
        if (ph === 'case3-target' || ph === 'case3-successor' || ph === 'case3-done') return ['Case 3: 자식 2개 → 후계자 대체', P.orange];
        return ['BST 삭제 — 3가지 케이스', P.sub];
    }
    function bsHeader(s) {
        if (mode === 'insert') return [s.newVal !== null ? 'INSERT ' + s.newVal : '삽입 전 · 점선은 들어갈 자리', P.teal];
        if (mode === 'search') {
            if (s.target === null) return ['완성된 BST에서 탐색 시작', P.purple];
            if (s.phase === 'found') return ['SEARCH ' + s.target + ' → 찾음', P.green];
            if (s.phase === 'notfound') return ['SEARCH ' + s.target + ' → 없음', P.orange];
            return ['SEARCH ' + s.target, P.purple];
        }
        return bsDelHead(s.phase);
    }

    /* ===================== 그리기 헬퍼 ===================== */
    function bsGhost(x, y, rad, label, fs, a, col) {
        ctx.globalAlpha = a;
        ctx.setLineDash([3, 3]);
        circ(x, y, rad, 'none', col + 'ff', 1.2);
        ctx.setLineDash([]);
        tx(label, x, y, fs, col + 'ff', 'center', false);
        ctx.globalAlpha = 1;
    }

    /* ===================== 트리 장면 ===================== */
    function bsDrawTree(x0, top, w, mob, s, p, fresh, e) {
        var lay = layout(w, mob);
        var keys = lay.keys;
        var r = lay.r;
        var cx = x0 + w / 2;
        var y0 = top + lay.top;
        var WE = BS_WALK;
        var curEd = bsEdgesOf(s);
        var prevEd = fresh ? bsEdgesOf(p) : curEd;
        var curDep = bsDepthOf(s.vals, curEd);
        var prevDep = fresh ? bsDepthOf(p.vals, prevEd) : curDep;
        var V = bsVisits(s);
        var base = fresh && mode === 'search' && bsPrefix(p.path, s.path) ? p.path.length : 0;
        var from = base > 0 ? base - 1 : 0;
        var last = V.length - 1;
        var mv = fresh ? ez(seg(e, 0, 0.6)) : 1;
        var fullDep = bsDepthOf(INSERT_STEPS[INSERT_STEPS.length - 1].vals, EDGES_FULL);
        function slotX(k) { return cx + (keys.indexOf(k) - (keys.length - 1) / 2) * lay.sp; }
        function reachT(j) {
            if (j <= from || last <= from) return 0;
            return WE * (j - from) / (last - from);
        }
        function posOf(k) {
            var inC = curDep[k] !== undefined;
            var inP = fresh && prevDep[k] !== undefined;
            var yc = y0 + (inC ? curDep[k] : 0) * lay.dy;
            var yp = y0 + (inP ? prevDep[k] : 0) * lay.dy;
            if (inC && inP) return { x: slotX(k), y: lerp(yp, yc, mv) };
            return { x: slotX(k), y: inC ? yc : yp };
        }
        function segProg(j) { return j <= from ? 1 : seg(e, reachT(j - 1), reachT(j)); }
        function pathSeg(a, b) {
            for (var j = 1; j < V.length; j++) { if (V[j - 1] === a && V[j] === b) return j; }
            return -1;
        }
        var hasGhost = mode === 'insert';
        var fullDepAll = fullDep;

        keys.forEach(function (k) {
            var inC = curDep[k] !== undefined;
            var inP = fresh && prevDep[k] !== undefined;
            if (!inC && !inP) {
                if (hasGhost) bsGhost(slotX(k), y0 + fullDepAll[k] * lay.dy, r, String(k), lay.fs, 0.45, P.sub);
                return;
            }
            var pos = posOf(k);
            var appear = inC && !inP ? ez(seg(e, WE, 1)) : 1;
            var al = inC ? appear : 1 - ez(seg(e, 0, 0.5));
            var rad = inC && !inP ? r * (0.55 + 0.45 * appear) : r;
            var vi = V.indexOf(k);
            var hit = vi >= 0 && e >= reachT(vi);
            var col = P.teal;
            if (!inC) col = P.red;
            else if (mode === 'insert' && k === s.newVal) col = P.green;
            else if (mode === 'search' && s.phase === 'found' && k === s.target && hit) col = P.green;
            else if (mode === 'delete' && k === s.target && hit) col = P.red;
            else if (mode === 'delete' && k === s.successor && (hit || s.phase === 'case3-done')) col = P.purple;
            else if (hit) col = P.orange;
            var strong = col !== P.teal;
            ctx.globalAlpha = al;
            circ(pos.x, pos.y, rad, col + (strong ? '2a' : '1f'), col + (strong ? 'ff' : '77'), strong ? 2.2 : 1.6);
            tx(String(k), pos.x, pos.y, lay.fs, P.text + 'ff', 'center', true);
            if (!inC) tx('✕', pos.x, pos.y - r - 9, lay.fsub, P.red + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        });

        curEd.forEach(function (ed) {
            var a = ed[0], b = ed[1];
            var A = posOf(a), B = posOf(b);
            var isNew = fresh && !bsHasEdge(prevEd, a, b);
            var j = pathSeg(a, b);
            var q = isNew ? ez(seg(e, 0.5, 1)) : 1;
            if (j > 0) q = Math.min(q, segProg(j));
            if (q <= 0) return;
            var col = j > 0 ? P.orange + 'ff' : isNew ? P.yellow + 'ff' : P.sub + 'aa';
            ln(A.x, A.y, A.x + (B.x - A.x) * q, A.y + (B.y - A.y) * q, col, j > 0 || isNew ? 2.4 : 1.6);
        });
        if (fresh) {
            prevEd.forEach(function (ed) {
                if (bsHasEdge(curEd, ed[0], ed[1])) return;
                var A = posOf(ed[0]), B = posOf(ed[1]);
                ctx.globalAlpha = 1 - ez(seg(e, 0, 0.5));
                ln(A.x, A.y, B.x, B.y, P.sub + 'aa', 1.6);
                ctx.globalAlpha = 1;
            });
        }

        if (mode === 'search' && s.phase === 'notfound' && s.target !== null && s.path.length > 0) {
            var lk = s.path[s.path.length - 1];
            var lp = posOf(lk);
            var gx = cx + (bsCount(s.target, keys) - 0.5 - (keys.length - 1) / 2) * lay.sp;
            var gy = y0 + (curDep[lk] + 1) * lay.dy;
            var ga = fresh ? ez(seg(e, WE, 1)) : 1;
            ctx.globalAlpha = ga;
            ln(lp.x, lp.y, gx, gy, P.orange + 'aa', 1.4, [3, 3]);
            ctx.globalAlpha = 1;
            bsGhost(gx, gy, r, String(s.target), lay.fs, ga, P.orange);
        }

        if (V.length > 0) {
            var cp = bsAlong(V.map(function (k) { return posOf(k); }), from + (last - from) * seg(e, 0, WE));
            var ca = mode === 'search' ? 1 : (fresh ? 1 - ez(seg(e, WE + 0.15, WE + 0.35)) : 0);
            if (ca > 0) {
                ctx.globalAlpha = ca;
                circ(cp.x, cp.y, r + 4, 'none', P.yellow + 'ff', 2);
                ctx.globalAlpha = 1;
            }
        }

        var items = [];
        if (mode === 'delete') {
            bsDelLines(s).forEach(function (txt, i) {
                items.push({ txt: txt, t: 0.25 + 0.3 * i, col: P.sub });
            });
        } else {
            var T = mode === 'insert' ? s.newVal : s.target;
            s.path.forEach(function (k, j) {
                items.push({ txt: bsCmpLine(T, k), t: j < base ? -1 : reachT(j), col: P.text });
            });
            if (mode === 'insert' && s.newVal !== null) {
                items.push({ txt: s.path.length > 0 ? '빈 자리 → ' + s.newVal + ' 삽입' : '빈 트리 → 루트에 삽입', t: WE, col: P.green });
            }
            if (mode === 'search' && s.phase === 'notfound') {
                items.push({ txt: (T < s.path[s.path.length - 1] ? '왼쪽' : '오른쪽') + ' 자식이 비어 있음 → 없음', t: WE, col: P.orange });
            }
        }
        items.forEach(function (it, i) {
            ctx.globalAlpha = fresh && it.t >= 0 ? ez(seg(e, it.t, it.t + 0.15)) : 1;
            tx(it.txt, x0 + 4, top + lay.cmpTop + i * lay.cmpLH + lay.cmpLH / 2, lay.fsub, it.col + 'ff', 'left', false);
        });
        ctx.globalAlpha = 1;

        var hd = bsHeader(s);
        tx(hd[0], cx, top + 12, lay.fs, hd[1] + 'ff', 'center', true);
        lay.noteL.forEach(function (txt, i) {
            tx(txt, cx, top + lay.noteTop + i * (lay.fsub + 4) + (lay.fsub + 4) / 2, lay.fsub, P.sub + 'ff', 'center', false);
        });
    }

    /* ===================== 불균형 장면 ===================== */
    function bsDrawSkew(x0, top, w, mob, s, p, fresh, e) {
        var lay = layout(w, mob);
        var r = lay.r, fs = lay.fs, fsub = lay.fsub, gap = lay.gap;
        var colW = w / 2;
        var yT = top + lay.top;
        var cxL = x0 + colW * 0.3;
        var cxR = x0 + colW * 1.5;
        var full = SKEWED_STEPS[SKEWED_STEPS.length - 1];
        var svs = s.skewedVals, bvs = s.balancedVals;
        var pS = fresh ? p.skewedVals : svs;
        var pB = fresh ? p.balancedVals : bvs;
        var nS = svs.length;
        var newI = fresh && nS > pS.length ? nS - 1 : -1;
        var phase = s.phase;
        var wStep = phase === 'compare' || phase === 'highlight';
        var walking = wStep && fresh && phase === 'compare';
        var gi = wStep ? (walking ? (nS - 1) * seg(e, 0, 0.9) : nS - 1) : -1;
        var gb = wStep ? (walking ? (BS_SK_PATH.length - 1) * seg(e, 0, 0.9) : BS_SK_PATH.length - 1) : -1;
        function cY(i) { return yT + i * gap; }
        function yNode(i) {
            if (i !== newI || i === 0) return cY(i);
            return lerp(cY(i - 1), cY(i), ez(seg(e, 0, 0.6)));
        }
        function bX(k) { return cxR + BS_SK_POS[k][0] * colW; }
        function bY(k) { return yT + BS_SK_POS[k][1] * gap; }

        for (var gi2 = nS; gi2 < full.skewedVals.length; gi2++) {
            bsGhost(cxL, cY(gi2), r, String(full.skewedVals[gi2]), fsub, 0.4, P.sub);
        }
        full.balancedVals.forEach(function (k) {
            if (bvs.indexOf(k) < 0) bsGhost(bX(k), bY(k), r, String(k), fsub, 0.4, P.sub);
        });

        for (var i = 1; i < nS; i++) {
            var on = gi >= i;
            ln(cxL, cY(i - 1), cxL, yNode(i), on ? P.orange + 'ff' : P.sub + 'aa', on ? 2.4 : 1.6);
        }
        for (var i2 = 0; i2 < nS; i2++) {
            var isNew = i2 === newI;
            var a2 = isNew ? ez(seg(e, 0, 0.4)) : 1;
            var lastN = i2 === nS - 1;
            var hot = lastN || i2 <= gi;
            var c2 = lastN ? P.green : (i2 <= gi ? P.orange : P.teal);
            ctx.globalAlpha = a2;
            circ(cxL, yNode(i2), r, c2 + (hot ? '2a' : '1f'), c2 + (hot ? 'ff' : '77'), hot ? 2.2 : 1.6);
            tx(String(svs[i2]), cxL, yNode(i2), fs, P.text + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        }

        var bEd = bsSkEdgesOf(bvs);
        bEd.forEach(function (ed) {
            var a = ed[0], b = ed[1];
            var isNewE = fresh && !(pB.indexOf(a) >= 0 && pB.indexOf(b) >= 0);
            var q = isNewE ? ez(seg(e, 0.4, 1)) : 1;
            var j = BS_SK_PATH.indexOf(b);
            var onP = wStep && j > 0 && BS_SK_PATH[j - 1] === a;
            var col = P.sub + 'aa', lw = 1.6;
            if (onP) {
                q = q * clamp01(gb - (j - 1));
                col = phase === 'highlight' ? P.green + 'ff' : P.orange + 'ff';
                lw = 2.4;
            }
            if (q <= 0) return;
            ln(bX(a), bY(a), bX(a) + (bX(b) - bX(a)) * q, bY(a) + (bY(b) - bY(a)) * q, col, lw);
        });
        full.balancedVals.forEach(function (k) {
            if (bvs.indexOf(k) < 0) return;
            var isNewB = fresh && pB.indexOf(k) < 0;
            var ap = isNewB ? ez(seg(e, 0.2, 0.9)) : 1;
            var rad = isNewB ? r * (0.55 + 0.45 * ap) : r;
            var jp = BS_SK_PATH.indexOf(k);
            var hotB = wStep && jp >= 0 && jp <= gb;
            var c = phase === 'highlight' && jp >= 0 ? P.green : (hotB ? P.orange : P.teal);
            var strong = c !== P.teal;
            ctx.globalAlpha = ap;
            circ(bX(k), bY(k), rad, c + (strong ? '2a' : '1f'), c + (strong ? 'ff' : '77'), strong ? 2.2 : 1.6);
            tx(String(k), bX(k), bY(k), fs, P.text + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        });

        if (phase === 'compare' && nS > 0) {
            var chainPts = [];
            for (var ci = 0; ci < nS; ci++) chainPts.push({ x: cxL, y: cY(ci) });
            var cpL = bsAlong(chainPts, gi);
            circ(cpL.x, cpL.y, r + 4, 'none', P.yellow + 'ff', 2);
            var cpR = bsAlong(BS_SK_PATH.map(function (k) { return { x: bX(k), y: bY(k) }; }), gb);
            circ(cpR.x, cpR.y, r + 4, 'none', P.yellow + 'ff', 2);
        }

        tx('편향 트리 O(n)', x0 + colW / 2, top + lay.hdrY, fs, P.orange + 'ff', 'center', true);
        tx('균형 BST O(log n)', x0 + colW * 1.5, top + lay.hdrY, fs, P.green + 'ff', 'center', true);
        ln(x0 + colW, top + lay.hdrY + 8, x0 + colW, top + lay.total - 6, P.sub + '55', 1, [4, 4]);
        if (nS > 0) tx('높이 = ' + nS, x0 + colW / 2, top + lay.labelY, fsub, P.orange + 'ff', 'center', true);
        if (bvs.length > 0) tx('높이 = ' + bsTreeH(bvs), x0 + colW * 1.5, top + lay.labelY, fsub, P.green + 'ff', 'center', true);
        if (wStep) {
            ctx.globalAlpha = walking ? ez(seg(e, 0.6, 1)) : 1;
            lay.cmpL.forEach(function (txt, i3) {
                tx(txt, x0 + 4, top + lay.cmpTop + i3 * lay.cmpLH + lay.cmpLH / 2, fsub, P.orange + 'ff', 'left', false);
            });
            lay.cmpR.forEach(function (txt, i3) {
                tx(txt, x0 + colW + 4, top + lay.cmpTop + i3 * lay.cmpLH + lay.cmpLH / 2, fsub, P.green + 'ff', 'left', false);
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
        if (mode === 'skewed') bsDrawSkew(x0, top, w, mob, s, p, fresh, e);
        else bsDrawTree(x0, top, w, mob, s, p, fresh, e);
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
        speedBtns.forEach(function (b) { b.classList.remove('bst-viz__speed-btn--active'); });
        btn.classList.add('bst-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('bst-viz__mode-btn--active', d.key === m); });
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