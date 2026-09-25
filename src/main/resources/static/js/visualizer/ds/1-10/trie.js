/**
 * 트라이 시각화
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
    var root    = el('div', 'trie-viz');
    var toolbar = el('div', 'trie-viz__toolbar');
    var tbLeft  = el('div', 'trie-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'trie-viz__title', 'Trie'));

    var modeWrap = el('div', 'trie-viz__mode');
    var modeDefs = [
        { key: 'structure', label: '구조' },
        { key: 'insert',    label: '삽입' },
        { key: 'search',    label: '검색' },
        { key: 'prefix',    label: '접두사' },
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'trie-viz__mode-btn' + (i === 0 ? ' trie-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'trie-viz__speed');
    speedWrap.appendChild(el('span', 'trie-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1800], ['2x', 900], ['3x', 600]].forEach(function (pair, i) {
        var b = el('button', 'trie-viz__speed-btn' + (i === 0 ? ' trie-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'trie-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'trie-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'trie-viz__log', '▶ PLAY를 눌러 트라이 구조를 확인하세요.');
    root.appendChild(logEl);

    var controls = el('div', 'trie-viz__controls');
    var btnPlay  = el('button', 'trie-viz__btn trie-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'trie-viz__btn', '▶| STEP');
    var btnReset = el('button', 'trie-viz__btn', '↺ RESET');
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

    /* ===================== 트라이 정의 ===================== */
    var NODES = {
        root: { id: 'root', char: '•', parent: null, x: 0.00, y: 0.66, isEnd: false },
        C:    { id: 'C',    char: 'C', parent: 'root', x: 0.25, y: 0.44, isEnd: false },
        D0:   { id: 'D0',   char: 'D', parent: 'root', x: 0.25, y: 0.88, isEnd: false },
        A:    { id: 'A',    char: 'A', parent: 'C',    x: 0.50, y: 0.44, isEnd: false },
        O:    { id: 'O',    char: 'O', parent: 'D0',   x: 0.50, y: 0.88, isEnd: false },
        R:    { id: 'R',    char: 'R', parent: 'A',    x: 0.75, y: 0.25, isEnd: true,  word: 'CAR'  },
        T:    { id: 'T',    char: 'T', parent: 'A',    x: 0.75, y: 0.63, isEnd: true,  word: 'CAT'  },
        G:    { id: 'G',    char: 'G', parent: 'O',    x: 0.75, y: 0.88, isEnd: true,  word: 'DOG'  },
        D4:   { id: 'D4',   char: 'D', parent: 'R',    x: 1.00, y: 0.13, isEnd: true,  word: 'CARD' },
        E4:   { id: 'E4',   char: 'E', parent: 'R',    x: 1.00, y: 0.38, isEnd: true,  word: 'CARE' },
    };
    var NODE_IDS_ALL = Object.keys(NODES);
    var EDGES_ALL = [
        ['root', 'C'], ['root', 'D0'],
        ['C', 'A'], ['D0', 'O'],
        ['A', 'R'], ['A', 'T'], ['O', 'G'],
        ['R', 'D4'], ['R', 'E4'],
    ];

    var CHILDREN = {};
    NODE_IDS_ALL.forEach(function (id) { CHILDREN[id] = {}; });
    EDGES_ALL.forEach(function (e) { CHILDREN[e[0]][NODES[e[1]].char] = e[1]; });

    var FULL_BOUNDS = computeBounds(NODE_IDS_ALL);

    var INSERT_WORDS = ['CAR', 'CARD', 'CARE', 'CAT', 'DOG'];
    var SEARCH_WORDS = ['CARD', 'CA', 'COW'];
    var PREFIX_WORDS = ['CA', 'DO', 'COW'];

    /* ===================== 구조 탭 스텝 ===================== */
    var STRUCTURE_STEPS = [
        {
            log: '트라이(Trie)는 문자열 저장·검색에 특화된 트리입니다. 루트는 빈 문자열이고, 간선 하나가 문자 하나에 대응하며, 루트에서 특정 노드까지의 경로가 하나의 문자열(접두사)을 이룹니다.',
            highlight: { nodes: NODE_IDS_ALL, edges: 'all' }, label: null,
        },
        {
            log: '루트(Root): 빈 문자열을 나타내는 시작점입니다. 실제 문자를 담지 않습니다.',
            highlight: { nodes: ['root'], edges: [] }, label: 'root',
        },
        {
            log: '간선 = 문자: 루트에서 C, A를 거치는 경로는 문자열 "CA"를 의미합니다. 노드가 아니라 간선이 문자 하나를 나타낸다는 점이 핵심입니다.',
            highlight: { nodes: ['root', 'C', 'A'], edges: [['root', 'C'], ['C', 'A']] }, label: null,
        },
        {
            log: 'isEnd 플래그: 노드가 실제 단어의 끝이면 isEnd=true로 표시합니다. R 노드는 "CAR"의 끝인 동시에 "CARD", "CARE"로 이어지는 접두사이기도 합니다.',
            highlight: { nodes: ['R'], edges: [] }, label: 'end',
        },
        {
            log: '접두사 공유: CAR, CARD, CARE는 "CAR"까지 같은 경로(root→C→A→R)를 공유합니다. 공통 접두사를 가진 문자열을 메모리 효율적으로 저장할 수 있습니다.',
            highlight: {
                nodes: ['root', 'C', 'A', 'R', 'D4', 'E4'],
                edges: [['root', 'C'], ['C', 'A'], ['A', 'R'], ['R', 'D4'], ['R', 'E4']],
            },
            label: 'shared',
        },
    ];

    /* ===================== 삽입 스텝 ===================== */
    function buildInsertSteps(words) {
        var steps = [];
        var created = { root: true };
        var markedEnd = {};

        words.forEach(function (w) {
            steps.push({
                type: 'start', word: w, node: 'root', matched: 0,
                createdSoFar: Object.keys(created), markedEndSoFar: Object.keys(markedEnd),
                log: "'" + w + "' 삽입 시작 (루트에서 출발)",
            });

            var cur = 'root';
            for (var i = 0; i < w.length; i++) {
                var ch = w[i];
                var childId = CHILDREN[cur][ch];
                var isNew = !created[childId];
                if (isNew) created[childId] = true;
                cur = childId;
                steps.push({
                    type: 'match', word: w, node: cur, matched: i + 1, action: isNew ? 'create' : 'traverse',
                    createdSoFar: Object.keys(created), markedEndSoFar: Object.keys(markedEnd),
                    log: isNew
                        ? "'" + ch + "' 노드 새로 생성 → 다음 노드로 이동"
                        : "'" + ch + "' 이미 존재하는 노드 재사용 (접두사 공유) → 다음 노드로 이동",
                });
            }

            markedEnd[cur] = true;
            steps.push({
                type: 'result', word: w, node: cur, matched: w.length, outcome: true,
                createdSoFar: Object.keys(created), markedEndSoFar: Object.keys(markedEnd),
                log: "'" + w + "'의 끝 → 해당 노드에 isEnd = true 표시 (삽입 완료)",
            });
        });

        steps.push({
            type: 'done', word: null, node: null, matched: 0,
            createdSoFar: Object.keys(created), markedEndSoFar: Object.keys(markedEnd),
            log: words.length + '개 단어 삽입 완료. 삽입 시간복잡도는 단어 길이 L에 비례한 O(L)이며, 저장된 단어 개수와는 무관합니다.',
        });
        steps.unshift({
            type: 'intro', word: null, node: 'root', matched: 0,
            createdSoFar: ['root'], markedEndSoFar: [],
            log: '삽입(Insert)은 문자를 하나씩 따라가며, 이미 있는 노드는 재사용하고 없는 노드는 새로 만듭니다.',
        });
        return steps;
    }

    /* ===================== 검색 / 접두사 검색 스텝 ===================== */
    function buildQuerySteps(word, kind) {
        var steps = [];
        var path = ['root'];
        var cur = 'root';

        steps.push({
            type: 'start', word: word, kind: kind, node: 'root', path: path.slice(), matched: 0,
            log: (kind === 'exact' ? "탐색(search) 시작: '" : "접두사 탐색(startsWith) 시작: '") + word + "'",
        });

        var ok = true, i;
        for (i = 0; i < word.length; i++) {
            var ch = word[i];
            var childId = CHILDREN[cur] ? CHILDREN[cur][ch] : null;
            if (childId) {
                cur = childId;
                path.push(cur);
                steps.push({
                    type: 'match', word: word, kind: kind, node: cur, path: path.slice(), matched: i + 1,
                    log: "'" + ch + "' 일치 → 다음 노드로 이동 (" + (i + 1) + '/' + word.length + ')',
                });
            } else {
                ok = false;
                steps.push({
                    type: 'result', word: word, kind: kind, node: cur, path: path.slice(), matched: i, outcome: false,
                    log: "'" + ch + "'에 해당하는 자식 노드가 없음 → '" + word + "' 없음 (false)",
                });
                break;
            }
        }

        if (ok) {
            if (kind === 'prefix') {
                steps.push({
                    type: 'result', word: word, kind: kind, node: cur, path: path.slice(), matched: word.length, outcome: true,
                    log: "모든 문자가 일치하는 경로 존재 → 접두사 '" + word + "'로 시작하는 단어가 있음 (true)",
                });
            } else {
                var isWord = NODES[cur].isEnd;
                steps.push({
                    type: 'result', word: word, kind: kind, node: cur, path: path.slice(), matched: word.length, outcome: isWord,
                    log: isWord
                        ? "모든 문자 일치 + isEnd = true → '" + word + "' 존재 (true)"
                        : "모든 문자는 일치했지만 isEnd = false → '" + word + "'는 저장된 완전한 단어가 아님 (false)",
                });
            }
        }
        return steps;
    }

    function buildSearchSteps() {
        var steps = [];
        SEARCH_WORDS.forEach(function (w) { steps = steps.concat(buildQuerySteps(w, 'exact')); });
        steps.unshift({
            type: 'intro', word: null, kind: 'exact', node: 'root', path: ['root'], matched: 0,
            log: '탐색(contains)은 문자를 하나씩 따라가다, 경로를 다 확인한 뒤 마지막 노드의 isEnd가 true인지 검사합니다. 경로가 있어도 isEnd가 false면 false입니다.',
        });
        return steps;
    }

    function buildPrefixSteps() {
        var steps = [];
        PREFIX_WORDS.forEach(function (w) { steps = steps.concat(buildQuerySteps(w, 'prefix')); });
        steps.unshift({
            type: 'intro', word: null, kind: 'prefix', node: 'root', path: ['root'], matched: 0,
            log: '접두사 탐색(startsWith)은 경로만 끝까지 존재하면 true입니다. 마지막 노드의 isEnd 여부는 확인하지 않습니다.',
        });
        return steps;
    }

    var INSERT_STEPS = buildInsertSteps(INSERT_WORDS);
    var SEARCH_STEPS = buildSearchSteps();
    var PREFIX_STEPS = buildPrefixSteps();

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
        if (mode === 'insert')    return INSERT_STEPS;
        if (mode === 'search')    return SEARCH_STEPS;
        return PREFIX_STEPS;
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
    function computeBounds(ids) {
        var minX = 1, maxX = 0, minY = 1, maxY = 0;
        ids.forEach(function (id) {
            var n = NODES[id];
            if (n.x < minX) minX = n.x;
            if (n.x > maxX) maxX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.y > maxY) maxY = n.y;
        });
        if (maxX - minX < 0.001) { minX = Math.max(0, minX - 0.16); maxX = Math.min(1, maxX + 0.16); }
        if (maxY - minY < 0.001) { minY = Math.max(0, minY - 0.05); maxY = Math.min(1, maxY + 0.35); }
        return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
    }

    function nodePos(id, W, top, h, mob, r, bounds) {
        var n = NODES[id];
        var marginX = mob ? r + 12 : r + 20;
        var marginY = mob ? r + 10 : r + 14;
        var nx = (bounds.maxX > bounds.minX) ? (n.x - bounds.minX) / (bounds.maxX - bounds.minX) : 0.5;
        var ny = (bounds.maxY > bounds.minY) ? (n.y - bounds.minY) / (bounds.maxY - bounds.minY) : 0.5;
        var x = marginX + nx * (W - 2 * marginX);
        var y = top + marginY + ny * (h - 2 * marginY);
        return { x: x, y: y };
    }

    /* ===================== 가시 노드/간선 (삽입 탭은 점진적 생성) ===================== */
    function visibleNodeIds(step) {
        if (mode === 'insert') return step.createdSoFar || ['root'];
        return NODE_IDS_ALL;
    }
    function visibleEdges(step) {
        var vis = visibleNodeIds(step);
        return EDGES_ALL.filter(function (e) { return vis.indexOf(e[0]) >= 0 && vis.indexOf(e[1]) >= 0; });
    }

    function edgeInList(edge, list) {
        if (list === 'all') return true;
        if (!list) return false;
        return list.some(function (e) {
            return (e[0] === edge[0] && e[1] === edge[1]) || (e[0] === edge[1] && e[1] === edge[0]);
        });
    }

    /* ===================== 상태 색상 ===================== */
    function nodeColor(id, step) {
        if (mode === 'structure') {
            var hi = step.highlight;
            if (hi && hi.nodes.indexOf(id) >= 0) {
                if (step.label === 'end')    return P.orange;
                if (step.label === 'shared') return P.teal;
                return P.purple;
            }
            return P.muted;
        }
        if (mode === 'insert') {
            if (step.node === id) {
                if (step.type === 'result') return P.green;
                if (step.action === 'create') return P.purple;
                return P.orange;
            }
            return P.teal;
        }
        if (!step.path || step.path.indexOf(id) < 0) return P.muted;
        if (step.node === id) {
            if (step.type === 'result') return step.outcome ? P.green : P.orange;
            return P.orange;
        }
        return P.teal;
    }

    function edgeColor(e, step) {
        if (mode === 'structure') {
            var isHi = edgeInList(e, step.highlight ? step.highlight.edges : []);
            return isHi ? (P.purple + 'aa') : (P.muted + '33');
        }
        if (mode === 'insert') {
            if (step.node === e[1]) {
                if (step.type === 'result') return P.green + 'cc';
                if (step.action === 'create') return P.purple + 'cc';
                return P.orange + 'cc';
            }
            return P.teal + '77';
        }
        var path = step.path || [];
        if (path.indexOf(e[0]) >= 0 && path.indexOf(e[1]) >= 0) {
            if (step.node === e[1]) return (step.type === 'result' ? (step.outcome ? P.green : P.orange) : P.orange) + 'cc';
            return P.teal + '77';
        }
        return P.muted + '25';
    }

    /* ===================== 트라이 다이어그램 드로우 ===================== */
    function drawTrie(W, top, h, mob, step) {
        var r     = mob ? 22 : 28;
        var fVal  = mob ? 14 : 16;
        var fLbl  = mob ? 9  : 11;
        var fEdge = mob ? 10 : 11;
        var labelCol = P.text + 'ee';

        var nodes  = visibleNodeIds(step);
        var edges  = visibleEdges(step);
        var bounds = FULL_BOUNDS;

        edges.forEach(function (e) {
            var p1 = nodePos(e[0], W, top, h, mob, r, bounds);
            var p2 = nodePos(e[1], W, top, h, mob, r, bounds);
            var col = edgeColor(e, step);
            var isBright = col.indexOf(P.purple) === 0 || col.indexOf(P.orange) === 0 || col.indexOf(P.green) === 0;
            line(p1.x, p1.y, p2.x, p2.y, col, isBright ? 2.4 : 1.5);

            var mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
            rr(mx - fEdge * 0.7, my - (mob ? 15 : 17), fEdge * 1.4, fEdge * 1.3, 3, 'rgba(10,10,20,0.55)', null, 0);
            tx(NODES[e[1]].char, mx, my - (mob ? 8 : 10), fEdge, labelCol, 'center', true);
        });

        nodes.forEach(function (id) {
            var pos = nodePos(id, W, top, h, mob, r, bounds);
            var col = nodeColor(id, step);
            var isEmph = col !== P.muted;
            circle(pos.x, pos.y, r, col + (isEmph ? '2a' : '14'), col + (isEmph ? 'ee' : '66'), isEmph ? 2.4 : 1.5);
            tx(NODES[id].char, pos.x, pos.y, fVal, labelCol, 'center', true);

            var isEndVisible = (mode === 'insert')
                ? (step.markedEndSoFar && step.markedEndSoFar.indexOf(id) >= 0)
                : NODES[id].isEnd;
            if (isEndVisible) {
                circle(pos.x, pos.y, r * 0.72, null, P.text + 'bb', 1.4);
            }

            if (mode === 'structure' && step.label === 'root' && id === 'root') {
                tx('ROOT', pos.x, pos.y - r - (mob ? 14 : 18), fLbl, P.purple, 'center', true);
            }
            if (mode === 'structure' && step.label === 'end' && id === 'R') {
                tx('END (이중 테두리 = isEnd)', pos.x, pos.y - r - (mob ? 14 : 18), fLbl, P.orange, 'center', true);
            }
        });

        if (mode === 'structure' && step.label === 'shared') {
            var rp = nodePos('R', W, top, h, mob, r, bounds);
            tx('공유 접두사: CAR', rp.x, rp.y - r - (mob ? 16 : 20), fLbl, P.teal, 'center', true);
        }

        if (mode !== 'structure') drawLegend(W, top, mob);
    }

    /* ===================== 범례 (초심자를 위한 색상 설명) ===================== */
    function textWidth(str, sz, bold) {
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        return ctx.measureText(str).width;
    }

    function drawLegend(W, top, mob) {
        var items = (mode === 'insert')
            ? [
                { col: P.purple, label: '신규 생성' },
                { col: P.orange, label: '재사용' },
                { col: P.teal,   label: '지나온 경로' },
                { col: P.green,  label: '삽입 완료' },
            ]
            : [
                { col: P.teal,   label: '방문 완료' },
                { col: P.orange, label: '현재/실패' },
                { col: P.green,  label: '성공' },
                { col: P.muted,  label: '아직' },
            ];
        var fLbl = mob ? 10 : 11;
        var sw   = mob ? 9  : 10;
        var x0   = mob ? 16 : 28;
        var y    = top + (mob ? 7 : 9);
        var gapAfterLabel = mob ? 16 : 20;

        var x = x0;
        items.forEach(function (it) {
            circle(x, y, sw / 2, it.col + 'dd', it.col + 'ee', 1);
            x += sw + 5;
            tx(it.label, x, y, fLbl, P.text + 'cc', 'left', false);
            x += textWidth(it.label, fLbl, false) + gapAfterLabel;
        });
    }

    /* ===================== 단어 진행 패널 (삽입/검색/접두사 공용) ===================== */
    function boxColor(i, step) {
        var word = step.word;
        if (!word) return P.muted;
        if (step.type === 'result' && step.outcome) return P.green;
        if (step.type === 'result' && !step.outcome && step.matched === word.length) {
            return (i === word.length - 1) ? P.orange : P.teal;
        }
        if (step.type === 'result' && !step.outcome) {
            if (i < step.matched) return P.teal;
            if (i === step.matched) return P.orange;
            return P.muted;
        }
        if (mode === 'insert' && step.type === 'match') {
            if (i < step.matched - 1) return P.teal;
            if (i === step.matched - 1) return step.action === 'create' ? P.purple : P.orange;
            return P.muted;
        }
        if (i < step.matched) return P.teal;
        if (i === step.matched) return P.orange;
        return P.muted;
    }

    function drawWordPanel(W, top, mob, step) {
        var fLbl  = mob ? 9  : 11;
        var fVal  = mob ? 14 : 16;
        var boxW  = mob ? 28 : 34;
        var boxH  = mob ? 30 : 36;
        var gap   = mob ? 5  : 7;
        var x0    = mob ? 16 : 28;

        var heading = mode === 'insert' ? 'INSERT'
            : (step.kind === 'exact' ? 'SEARCH (contains)' : 'STARTSWITH (prefix)');
        tx(heading + (step.word ? " : '" + step.word + "'" : ''), x0, top, fLbl, P.muted + 'aa', 'left', true);

        var by = top + (mob ? 18 : 22);
        if (!step.word) {
            tx('(대기 중)', x0, by + boxH / 2, mob ? 11 : 13, P.muted + '77', 'left', false);
            return;
        }

        for (var i = 0; i < step.word.length; i++) {
            var bx = x0 + i * (boxW + gap);
            var col = boxColor(i, step);
            var isPending = col === P.muted;
            rr(bx, by, boxW, boxH, 5, col + (isPending ? '14' : '33'), col + (isPending ? '77' : 'ee'), isPending ? 1.4 : 2.2);
            tx(step.word[i], bx + boxW / 2, by + boxH / 2, fVal, P.text + (isPending ? 'bb' : 'f5'), 'center', true);
        }

        if (step.type === 'result') {
            var resY = by + boxH + (mob ? 22 : 26);
            var resTxt = 'RESULT : ' + (step.outcome ? 'true' : 'false');
            tx(resTxt, x0, resY, mob ? 12 : 14, step.outcome ? P.green : P.orange, 'left', true);
        }
    }

    /* ===================== 레이아웃 상수 (calcH / draw 공용) ===================== */
    function getLayout(mob) {
        return {
            top:      mob ? 22  : 30,
            r:        mob ? 22  : 28,
            ghFull:   mob ? 250 : 320,
            ghPanel:  mob ? 235 : 305,
            panelGap: mob ? 26  : 32,
        };
    }

    /* ===================== resize ===================== */
    function calcH(W) {
        var mob = W < 600;
        var L = getLayout(mob);
        if (mode === 'structure') {
            return L.top + L.ghFull + L.r + (mob ? 30 : 40);
        }
        var wordPanelH = (mob ? 18 : 22) + (mob ? 30 : 36) + (mob ? 22 : 26) + (mob ? 20 : 24);
        return L.top + L.ghPanel + L.panelGap + wordPanelH;
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
        var mob = W < 600;
        var L   = getLayout(mob);

        var steps = currentSteps();
        var step  = stepIdx >= 0 ? steps[stepIdx] : steps[0];

        if (mode === 'structure') {
            drawTrie(W, L.top, L.ghFull, mob, step);
            return;
        }

        drawTrie(W, L.top, L.ghPanel, mob, step);
        drawWordPanel(W, L.top + L.ghPanel + L.panelGap, mob, step);
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
        if (mode === 'structure') return '▶ PLAY를 눌러 트라이 구조를 확인하세요.';
        if (mode === 'insert')    return '▶ PLAY를 눌러 단어 삽입 과정을 확인하세요.';
        if (mode === 'search')    return '▶ PLAY를 눌러 검색(contains) 과정을 확인하세요.';
        return '▶ PLAY를 눌러 접두사 검색(startsWith) 과정을 확인하세요.';
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
        speedBtns.forEach(function (b) { b.classList.remove('trie-viz__speed-btn--active'); });
        btn.classList.add('trie-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) {
            modeBtns[d.key].classList.toggle('trie-viz__mode-btn--active', d.key === m);
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