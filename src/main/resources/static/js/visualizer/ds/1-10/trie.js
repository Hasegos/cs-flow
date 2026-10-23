/**
 * 트라이 시각화 시각화
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
        { key: 'insert', label: '삽입' },
        { key: 'search', label: '검색' },
        { key: 'prefix', label: '접두사' }
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
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
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

    var logEl = el('div', 'trie-viz__log', '');
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

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'structure') return STRUCTURE_STEPS;
        if (mode === 'insert')    return INSERT_STEPS;
        if (mode === 'search')    return SEARCH_STEPS;
        return PREFIX_STEPS;
    }
    function defaultLog() {
        if (mode === 'structure') return '▶ PLAY를 눌러 트라이 구조를 확인하세요.';
        if (mode === 'insert')    return '▶ PLAY를 눌러 단어 삽입 과정을 확인하세요.';
        if (mode === 'search')    return '▶ PLAY를 눌러 검색(contains) 과정을 확인하세요.';
        return '▶ PLAY를 눌러 접두사 검색(startsWith) 과정을 확인하세요.';
    }
    function ez(q) { var v = clamp01(q); return v * v * (3 - 2 * v); }

    /* ===================== 레이아웃 ===================== */
    function computeBounds(ids) {
        var minX = 1, maxX = 0, minY = 1, maxY = 0;
        ids.forEach(function (id) {
            var n = NODES[id];
            if (n.x < minX) minX = n.x;
            if (n.x > maxX) maxX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.y > maxY) maxY = n.y;
        });
        return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
    }
    var TR_DEPTH = { root: 0, C: 1, D0: 1, A: 2, O: 2, R: 3, T: 3, G: 3, D4: 4, E4: 4 };
    var TR_COL   = { root: 2.125, C: 1.25, D0: 3, A: 1.25, O: 3, R: 0.5, T: 2, G: 3, D4: 0, E4: 1 };
    var trMemo   = {};

    function trGeo(w, mob) {
        var r = mob ? 13 : 19;
        var span = Math.min(w - (mob ? 36 : 60), 3 * (mob ? 80 : 130));
        return {
            r: r, span: span, left: (w - span) / 2, pad: r + 8,
            dy: mob ? 46 : 62, fs: mob ? 12 : 14, fsub: mob ? 11 : 12
        };
    }
    function trPt(g, x0, top, id) {
        return { x: x0 + g.left + TR_COL[id] / 3 * g.span, y: top + g.pad + TR_DEPTH[id] * g.dy };
    }
    function trWalk(word, n) {
        var out = ['root'];
        var cur = 'root';
        for (var i = 0; i < n; i++) {
            cur = CHILDREN[cur][word[i]];
            out.push(cur);
        }
        return out;
    }
    function trSubtree(id) {
        return NODE_IDS_ALL.filter(function (k) {
            var c = k;
            while (c) {
                if (c === id) return true;
                c = NODES[c].parent;
            }
            return false;
        });
    }
    function trSubWords(id) {
        return trSubtree(id).filter(function (k) { return NODES[k].isEnd; })
            .map(function (k) { return NODES[k].word; }).sort().join(', ');
    }

    /* ===================== 캡션과 범례 ===================== */
    function trCapText(s) {
        if (mode === 'structure') {
            if (s.label === 'root')   return 'ROOT: 빈 문자열에서 시작하는 출발점';
            if (s.label === 'end')    return '이중 테두리 = isEnd, 여기서 끝나면 단어';
            if (s.label === 'shared') return 'CAR, CARD, CARE가 root→C→A→R 경로 공유';
            return '간선 하나 = 문자 하나, 같은 접두사는 공유';
        }
        if (mode === 'insert') {
            if (s.type === 'intro') return '루트만 있는 빈 트라이에서 시작';
            if (s.type === 'start') return "'" + s.word + "'는 루트에서 출발";
            if (s.type === 'match') {
                var ch = s.word[s.matched - 1];
                return s.action === 'create'
                    ? "'" + ch + "' 간선이 없어 새 노드를 만듦"
                    : "'" + ch + "' 노드가 이미 있어 재사용";
            }
            if (s.type === 'result') return 'isEnd 표시 → 단어 저장 완료';
            return INSERT_WORDS.length + '개 단어 삽입 완료';
        }
        if (s.type === 'intro') return mode === 'search' ? '루트에서 글자를 하나씩 따라 내려감' : '루트에서 접두사 경로를 따라감';
        if (s.type === 'start') return "'" + s.word + "' 탐색을 루트에서 시작";
        if (s.type === 'match') {
            return s.matched < s.word.length
                ? "다음 글자 '" + s.word[s.matched] + "'를 자식에서 찾음"
                : '마지막 글자, 도착 노드를 확인';
        }
        if (s.outcome && mode === 'prefix') return '접두사 아래 단어: ' + trSubWords(s.node);
        if (s.outcome) return 'isEnd = true → 단어 끝 표시가 있음';
        if (s.matched < s.word.length) return "'" + s.word[s.matched] + "' 자식이 없어 탐색 중단";
        return 'isEnd = false → 경로만 있고 단어는 아님';
    }
    function trCapCol(s) {
        if (mode === 'structure') {
            if (s.label === 'end') return P.orange;
            if (s.label === 'shared') return P.teal;
            if (s.label === 'root') return P.purple;
            return P.sub;
        }
        if (mode === 'insert') {
            if (s.type === 'match') return s.action === 'create' ? P.purple : P.orange;
            if (s.type === 'result') return P.green;
            return P.sub;
        }
        if (s.type === 'result') return s.outcome ? P.green : P.orange;
        return P.sub;
    }
    function trCapHeight(w, mob) {
        var fsub = mob ? 11 : 12;
        var rows = 0;
        currentSteps().forEach(function (s) {
            var t = trCapText(s);
            var n = t ? lines(t, w - 8, fsub).length : 0;
            if (n > rows) rows = n;
        });
        return rows * (fsub + 5);
    }
    function trLegendItems() {
        if (mode === 'insert') return [
            { key: 'new', label: '신규 생성' }, { key: 'reuse', label: '재사용' },
            { key: 'path', label: '지나온 경로' }, { key: 'done', label: '삽입 완료' },
            { key: 'cursor', label: '현재 위치' }
        ];
        return [
            { key: 'path', label: '지나온 경로' }, { key: 'cur', label: '현재·실패' },
            { key: 'ok', label: '성공' }, { key: 'rest', label: '아직' },
            { key: 'cursor', label: '현재 위치' }
        ];
    }
    function trLegendCol(key) {
        if (key === 'new') return P.purple;
        if (key === 'reuse' || key === 'cur') return P.orange;
        if (key === 'path') return P.teal;
        if (key === 'done' || key === 'ok') return P.green;
        if (key === 'cursor') return P.yellow;
        return P.muted;
    }
    function trLegendRows(items, w, fs) {
        var rows = [[]];
        var x = 0;
        ctx.font = '500 ' + fs + 'px "JetBrains Mono",monospace';
        items.forEach(function (it) {
            var iw = 12 + ctx.measureText(it.label).width + 14;
            if (x + iw > w && rows[rows.length - 1].length > 0) { rows.push([]); x = 0; }
            rows[rows.length - 1].push({ key: it.key, label: it.label, x: x });
            x += iw;
        });
        return rows;
    }
    function layout(w, mob) {
        var key = mode + '|' + Math.round(w) + '|' + (mob ? 'm' : 'd');
        if (trMemo[key]) return trMemo[key];
        var g = trGeo(w, mob);
        var L = { g: g, treeH: 2 * g.pad + 4 * g.dy };
        L.capY = L.treeH + 6;
        L.capH = trCapHeight(w, mob);
        L.wpY = L.capY + L.capH + 10;
        L.total = L.capY + L.capH + 4;
        if (mode !== 'structure') {
            L.fsm = mob ? 11 : 12;
            L.fval = mob ? 13 : 16;
            L.bw = mob ? 26 : 34;
            L.bh = mob ? 26 : 34;
            L.bg = mob ? 4 : 7;
            L.boxY = L.wpY + g.fsub + 10;
            L.resY = L.boxY + L.bh + 14;
            L.legY = L.resY + 14;
            L.legRows = trLegendRows(trLegendItems(), w, L.fsm);
            L.total = L.legY + L.legRows.length * (L.fsm + 8) + 2;
        }
        trMemo[key] = L;
        return L;
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 그리기 헬퍼 ===================== */
    function trDrawNode(x, y, r, col, strong, ch, fs, a) {
        if (a <= 0) return;
        ctx.globalAlpha = a;
        circ(x, y, r, col + (strong ? '2a' : '14'), col + (strong ? 'ee' : '66'), strong ? 2.4 : 1.6);
        tx(ch, x, y, fs, P.text + 'ff', 'center', true);
        ctx.globalAlpha = 1;
    }
    function trEndRing(x, y, r, a) {
        if (a <= 0) return;
        ctx.globalAlpha = a;
        circ(x, y, r * 0.72, null, P.text + 'bb', 1.4);
        ctx.globalAlpha = 1;
    }
    function trCrossNode(pos, r, id, cp, cc, k, fs) {
        var ch = NODES[id].char;
        var c1 = cp || P.muted;
        var c2 = cc || P.muted;
        if (c1 === c2) {
            trDrawNode(pos.x, pos.y, r, c2, cc !== null, ch, fs, 1);
            return;
        }
        trDrawNode(pos.x, pos.y, r, c1, cp !== null, ch, fs, 1 - k);
        trDrawNode(pos.x, pos.y, r, c2, cc !== null, ch, fs, k);
    }
    function trCrossEdge(a, b, cp, cc, k) {
        var base = P.muted + '44';
        var c1 = cp || base;
        var c2 = cc || base;
        if (c1 === c2) {
            ln(a.x, a.y, b.x, b.y, c2, cc ? 2.4 : 1.6);
            return;
        }
        ctx.globalAlpha = 1 - k;
        ln(a.x, a.y, b.x, b.y, c1, cp ? 2.4 : 1.6);
        ctx.globalAlpha = k;
        ln(a.x, a.y, b.x, b.y, c2, cc ? 2.4 : 1.6);
        ctx.globalAlpha = 1;
    }
    function trEdgeTag(a, b, ch, fs, al) {
        var mx = (a.x + b.x) / 2 + 13;
        var my = (a.y + b.y) / 2;
        ctx.globalAlpha = al;
        rr(mx - 7, my - 7, 14, 14, 3, P.bg + 'cc', null, 0);
        tx(ch, mx, my, fs, P.text + 'ff', 'center', true);
        ctx.globalAlpha = 1;
    }
    function trCursor(x, y, r) {
        circ(x, y, r + 5, null, P.yellow + 'ff', 2.2);
    }

    /* ===================== 구조 장면 ===================== */
    function trStructCol(st, id) {
        if (st.highlight.nodes.indexOf(id) < 0) return null;
        if (st.label === 'end') return P.orange;
        if (st.label === 'shared') return P.teal;
        return P.purple;
    }
    function trStructEdgeCol(st, ed) {
        var list = st.highlight.edges;
        var hit = list === 'all' || list.some(function (x) {
            return (x[0] === ed[0] && x[1] === ed[1]) || (x[0] === ed[1] && x[1] === ed[0]);
        });
        if (!hit) return null;
        return st.label === 'shared' ? P.teal + 'cc' : P.purple + 'cc';
    }
    function trDrawStructure(x0, top, s, p, fresh, e, L) {
        var g = L.g;
        var k = fresh ? ez(e) : 1;
        EDGES_ALL.forEach(function (ed) {
            var a = trPt(g, x0, top, ed[0]);
            var b = trPt(g, x0, top, ed[1]);
            var cc = trStructEdgeCol(s, ed);
            var cp = fresh ? trStructEdgeCol(p, ed) : cc;
            trCrossEdge(a, b, cp, cc, k);
            trEdgeTag(a, b, NODES[ed[1]].char, g.fsub, cc ? 1 : 0.55);
        });
        NODE_IDS_ALL.forEach(function (id) {
            var pos = trPt(g, x0, top, id);
            var cc = trStructCol(s, id);
            var cp = fresh ? trStructCol(p, id) : cc;
            trCrossNode(pos, g.r, id, cp, cc, k, g.fs);
        });
        NODE_IDS_ALL.forEach(function (id) {
            if (!NODES[id].isEnd) return;
            var pos = trPt(g, x0, top, id);
            trEndRing(pos.x, pos.y, g.r, 1);
        });
        var rp = trPt(g, x0, top, 'root');
        if (s.label === 'root') {
            ctx.globalAlpha = k;
            tx('ROOT', rp.x + g.r + 8, rp.y, g.fsub, P.purple + 'ff', 'left', true);
            ctx.globalAlpha = 1;
        }
        if (s.label === 'end') {
            ctx.globalAlpha = k;
            tx('END', x0 + g.left + 1.25 / 3 * g.span, top + g.pad + 3 * g.dy, g.fsub, P.orange + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        }
    }

    /* ===================== 삽입 장면 ===================== */
    function trDrawInsert(x0, top, s, p, fresh, e, L) {
        var g = L.g;
        var r = g.r;
        var mvC = fresh ? ez(seg(e, 0, 0.6)) : 1;
        var apC = fresh ? ez(seg(e, 0.6, 1)) : 1;
        var vis = s.createdSoFar;
        var pvis = fresh ? p.createdSoFar : vis;
        var path = s.word ? trWalk(s.word, s.matched) : [];
        var cur = s.node;
        var from = (fresh && s.type !== 'start' && s.type !== 'intro') ? p.node : cur;
        function isNew(id) { return fresh && vis.indexOf(id) >= 0 && pvis.indexOf(id) < 0; }
        EDGES_ALL.forEach(function (ed) {
            if (vis.indexOf(ed[1]) < 0) return;
            var a = trPt(g, x0, top, ed[0]);
            var b = trPt(g, x0, top, ed[1]);
            var nw = isNew(ed[1]);
            var onP = path.indexOf(ed[0]) >= 0 && path.indexOf(ed[1]) >= 0;
            if (nw) ln(a.x, a.y, lerp(a.x, b.x, mvC), lerp(a.y, b.y, mvC), P.purple + 'ff', 2.4);
            else ln(a.x, a.y, b.x, b.y, onP ? P.teal + 'ff' : P.sub + '88', onP ? 2.4 : 1.6);
            trEdgeTag(a, b, NODES[ed[1]].char, g.fsub, nw ? ez(seg(e, 0.5, 1)) : 1);
        });
        vis.forEach(function (id) {
            var pos = trPt(g, x0, top, id);
            var nw = isNew(id);
            var sc = nw ? 0.4 + 0.6 * apC : 1;
            var col = P.sub;
            if (id === cur && s.type === 'result') col = P.green;
            else if (id === cur && s.type === 'match') col = s.action === 'create' ? P.purple : P.orange;
            else if (path.indexOf(id) >= 0) col = P.teal;
            trDrawNode(pos.x, pos.y, r * sc, col, col !== P.sub, NODES[id].char, g.fs, nw ? apC : 1);
            if (s.markedEndSoFar.indexOf(id) >= 0) {
                var mk = fresh && p.markedEndSoFar.indexOf(id) < 0 ? ez(seg(e, 0.5, 1)) : 1;
                trEndRing(pos.x, pos.y, r * sc, mk);
            }
        });
        if (s.word && (s.type === 'start' || s.type === 'match')) {
            var cp = trPt(g, x0, top, from);
            var cc = trPt(g, x0, top, cur);
            trCursor(lerp(cp.x, cc.x, mvC), lerp(cp.y, cc.y, mvC), r);
        }
    }

    /* ===================== 검색 · 접두사 장면 ===================== */
    function trDrawQuery(x0, top, s, p, fresh, e, L) {
        var g = L.g;
        var r = g.r;
        var path = s.path || [];
        var pp = fresh ? (p.path || []) : path;
        var mvC = fresh ? ez(seg(e, 0, 0.7)) : 1;
        var from = (fresh && s.type !== 'start' && s.type !== 'intro') ? p.node : s.node;
        var last = s.node;
        var okRes = s.type === 'result' && s.outcome;
        var failRes = s.type === 'result' && !s.outcome && s.matched < s.word.length;
        var grow = fresh && path.length > pp.length;
        var sub = (mode === 'prefix' && okRes) ? trSubtree(last) : [];
        function subAct(id) {
            if (!fresh) return 1;
            var rel = TR_DEPTH[id] - TR_DEPTH[last];
            return ez(seg(e, 0.2 + 0.25 * rel, 0.6 + 0.25 * rel));
        }
        EDGES_ALL.forEach(function (ed) {
            var a = trPt(g, x0, top, ed[0]);
            var b = trPt(g, x0, top, ed[1]);
            var onP = path.indexOf(ed[0]) >= 0 && path.indexOf(ed[1]) >= 0;
            var isLast = onP && ed[1] === last;
            if (!onP) {
                ln(a.x, a.y, b.x, b.y, P.muted + '55', 1.4);
                trEdgeTag(a, b, NODES[ed[1]].char, g.fsub, 0.6);
                return;
            }
            var col = isLast ? (okRes ? P.green : P.orange) : P.teal;
            var tip = (isLast && grow) ? { x: lerp(a.x, b.x, mvC), y: lerp(a.y, b.y, mvC) } : b;
            ln(a.x, a.y, tip.x, tip.y, col + 'ff', 2.4);
            trEdgeTag(a, b, NODES[ed[1]].char, g.fsub, isLast && grow ? ez(seg(e, 0.5, 1)) : 1);
        });
        if (failRes) {
            var cPos = trPt(g, x0, top, last);
            var gx = cPos.x + 0.75 * g.span / 3;
            var gy = cPos.y + g.dy;
            var ga = fresh ? ez(seg(e, 0.3, 0.8)) : 1;
            ctx.globalAlpha = ga;
            ln(cPos.x, cPos.y, gx, gy, P.orange + 'aa', 1.6, [4, 3]);
            ctx.setLineDash([3, 3]);
            circ(gx, gy, r, P.orange + '22', P.orange + 'ff', 1.6);
            ctx.setLineDash([]);
            tx(s.word[s.matched], gx, gy, g.fs, P.orange + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        }
        NODE_IDS_ALL.forEach(function (id) {
            var pos = trPt(g, x0, top, id);
            var onP = path.indexOf(id) >= 0;
            var isCur = id === last;
            var col = P.muted;
            if (isCur && s.type === 'intro') col = P.sub;
            else if (isCur) col = okRes ? P.green : P.orange;
            else if (onP) col = P.teal;
            var strong = col !== P.muted && col !== P.sub;
            trDrawNode(pos.x, pos.y, r, col, strong, NODES[id].char, g.fs, 1);
            if (sub.indexOf(id) >= 0 && !onP) {
                trDrawNode(pos.x, pos.y, r, P.green, true, NODES[id].char, g.fs, subAct(id));
            }
        });
        NODE_IDS_ALL.forEach(function (id) {
            if (!NODES[id].isEnd) return;
            var pos = trPt(g, x0, top, id);
            trEndRing(pos.x, pos.y, r, 1);
        });
        if (s.type === 'result') {
            var lp = trPt(g, x0, top, last);
            ctx.globalAlpha = fresh ? ez(seg(e, 0.4, 1)) : 1;
            circ(lp.x, lp.y, r + 4, null, (okRes ? P.green : P.orange) + 'ff', 2.2);
            ctx.globalAlpha = 1;
        }
        if (s.type === 'start' || s.type === 'match') {
            var cp = trPt(g, x0, top, from);
            var cc = trPt(g, x0, top, last);
            trCursor(lerp(cp.x, cc.x, mvC), lerp(cp.y, cc.y, mvC), r);
        }
    }

    /* ===================== 단어 패널 ===================== */
    function trBoxCol(i, s) {
        var n = s.word.length;
        if (s.type === 'result' && s.outcome) return P.green;
        if (s.type === 'result' && s.matched === n) return i === n - 1 ? P.orange : P.teal;
        if (s.type === 'result') {
            if (i < s.matched) return P.teal;
            if (i === s.matched) return P.orange;
            return P.muted;
        }
        if (mode === 'insert' && s.type === 'match') {
            if (i < s.matched - 1) return P.teal;
            if (i === s.matched - 1) return s.action === 'create' ? P.purple : P.orange;
            return P.muted;
        }
        if (i < s.matched) return P.teal;
        if (i === s.matched) return P.orange;
        return P.muted;
    }
    function trDrawWordPanel(x0, top, s, L) {
        var fsub = L.g.fsub;
        var head = mode === 'insert' ? 'INSERT' : (mode === 'search' ? 'SEARCH (contains)' : 'STARTSWITH (prefix)');
        tx(head + (s.word ? " : '" + s.word + "'" : ''), x0, top + L.wpY + (fsub + 4) / 2, fsub, P.sub + 'ff', 'left', true);
        var by = top + L.boxY;
        if (!s.word) {
            var done = s.type === 'done';
            tx(done ? INSERT_WORDS.length + '개 단어 삽입 완료' : '(대기 중)', x0, by + L.bh / 2, fsub + 1,
                (done ? P.green : P.sub) + 'ff', 'left', true);
            return;
        }
        for (var i = 0; i < s.word.length; i++) {
            var bx = x0 + i * (L.bw + L.bg);
            var col = trBoxCol(i, s);
            var pend = col === P.muted;
            rr(bx, by, L.bw, L.bh, 5, col + (pend ? '14' : '33'), col + (pend ? '77' : 'ee'), pend ? 1.4 : 2.2);
            tx(s.word[i], bx + L.bw / 2, by + L.bh / 2, L.fval, P.text + (pend ? 'bb' : 'f5'), 'center', true);
        }
        if (s.type === 'result') {
            tx('RESULT : ' + (s.outcome ? 'true' : 'false'), x0, top + L.resY, fsub + 2,
                (s.outcome ? P.green : P.orange) + 'ff', 'left', true);
        }
    }

    /* ===================== 메인 장면 ===================== */
    function trDrawCaption(x0, top, w, L, s, fresh, e) {
        var txt = trCapText(s);
        if (!txt) return;
        var fsub = L.g.fsub;
        ctx.globalAlpha = fresh ? 0.35 + 0.65 * ez(e) : 1;
        lines(txt, w - 8, fsub).forEach(function (row, i) {
            tx(row, x0 + w / 2, top + L.capY + i * (fsub + 5) + (fsub + 5) / 2, fsub, trCapCol(s) + 'ff', 'center', true);
        });
        ctx.globalAlpha = 1;
    }
    function trDrawLegend(x0, top, L) {
        L.legRows.forEach(function (row, ri) {
            var y = top + L.legY + ri * (L.fsm + 8) + (L.fsm + 8) / 2;
            row.forEach(function (it) {
                var lc = trLegendCol(it.key);
                circ(x0 + it.x + 4, y, 4, lc + 'dd', lc + 'ee', 1);
                tx(it.label, x0 + it.x + 12, y, L.fsm, P.sub + 'ff', 'left', false);
            });
        });
    }
    function drawScene(x0, top, w, mob, step, prev, t) {
        var steps = currentSteps();
        var s = step || steps[0];
        var p = prev || s;
        var fresh = s !== p;
        var e = fresh ? clamp01(t) : 1;
        var L = layout(w, mob);
        if (mode === 'structure') trDrawStructure(x0, top, s, p, fresh, e, L);
        else if (mode === 'insert') trDrawInsert(x0, top, s, p, fresh, e, L);
        else trDrawQuery(x0, top, s, p, fresh, e, L);
        trDrawCaption(x0, top, w, L, s, fresh, e);
        if (mode !== 'structure') {
            trDrawWordPanel(x0, top, s, L);
            trDrawLegend(x0, top, L);
        }
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
        speedBtns.forEach(function (b) { b.classList.remove('trie-viz__speed-btn--active'); });
        btn.classList.add('trie-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('trie-viz__mode-btn--active', d.key === m); });
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