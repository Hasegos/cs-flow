/**
 * 인덱스 시각화 시각화
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
    var root    = el('div', 'index-viz');
    var toolbar = el('div', 'index-viz__toolbar');
    var tbLeft  = el('div', 'index-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'index-viz__title', 'B-TREE'));

    var modeWrap = el('div', 'index-viz__mode');
    var modeDefs = [
        { key: 'structure', label: '인덱스 구조' },
        { key: 'scan', label: '풀 스캔' },
        { key: 'search', label: '인덱스 탐색' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'index-viz__mode-btn' + (i === 0 ? ' index-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'index-viz__speed');
    speedWrap.appendChild(el('span', 'index-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'index-viz__speed-btn' + (i === 0 ? ' index-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'index-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'index-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'index-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'index-viz__controls');
    var btnPlay  = el('button', 'index-viz__btn index-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'index-viz__btn', '▶| STEP');
    var btnReset = el('button', 'index-viz__btn', '↺ RESET');
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

    /* ===================== 기준 데이터 ===================== */
    var DATA = [7, 12, 18, 23, 29, 34, 41, 47, 52, 58, 63, 74];
    var TARGET = 41;
    var ROOT_KEYS = [23, 52];
    var LEAVES = [ [7, 12, 18], [23, 29, 34, 41, 47], [52, 58, 63, 74] ];

    /* ===================== 탐색 로직 (실제 실행 — 하드코딩 아님) ===================== */
    function fullScan(arr, target) {
        var comparisons = 0, foundIndex = -1;
        for (var i = 0; i < arr.length; i++) {
            comparisons++;
            if (arr[i] === target) { foundIndex = i; break; }
        }
        return { comparisons: comparisons, foundIndex: foundIndex };
    }
    function chooseChild(rootKeys, target) {
        var comparisons = 0;
        for (var i = 0; i < rootKeys.length; i++) {
            comparisons++;
            if (target < rootKeys[i]) return { child: i, comparisons: comparisons };
        }
        return { child: rootKeys.length, comparisons: comparisons };
    }
    function leafScan(leaf, target) {
        var comparisons = 0, foundIndex = -1;
        for (var i = 0; i < leaf.length; i++) {
            comparisons++;
            if (leaf[i] === target) { foundIndex = i; break; }
        }
        return { comparisons: comparisons, foundIndex: foundIndex };
    }

    var FULL_SCAN_RESULT = fullScan(DATA, TARGET);
    var ROOT_RESULT = chooseChild(ROOT_KEYS, TARGET);
    var LEAF_RESULT = leafScan(LEAVES[ROOT_RESULT.child], TARGET);
    var BTREE_TOTAL = ROOT_RESULT.comparisons + LEAF_RESULT.comparisons;

    /* ===================== 스텝 빌더 ===================== */
    function buildStructureSteps() {
        var steps = [];
        steps.push({ kind: 'intro',
            log: '인덱스는 데이터를 정렬된 트리 구조로 유지해 빠르게 찾을 수 있게 해줍니다. B-Tree 구조를 살펴봅시다.' });
        steps.push({ kind: 'root', hiRoot: true,
            log: '루트 노드는 자식이 어느 쪽에 있는지 정하는 기준값(' + ROOT_KEYS.join(', ') + ')을 가지고 있습니다.' });
        steps.push({ kind: 'leaves', hiLeaves: 'all',
            log: '리프 노드에 실제 데이터 값이 정렬된 채로 나뉘어 저장됩니다: [' + LEAVES[0].join(',') + '] / [' + LEAVES[1].join(',') + '] / [' + LEAVES[2].join(',') + ']' });
        steps.push({ kind: 'sorted', hiLeaves: 'all', hiRoot: true,
            log: '왼쪽 리프의 모든 값 < ' + ROOT_KEYS[0] + ' ≤ 가운데 리프의 모든 값 < ' + ROOT_KEYS[1] + ' ≤ 오른쪽 리프의 모든 값 — 항상 정렬 순서가 유지됩니다.' });
        steps.push({ kind: 'done',
            log: '정리 — B-Tree는 "정렬 + 분기"로 데이터를 나눠 저장해서, 트리를 몇 단계만 타고 내려가도 원하는 값 근처에 도달할 수 있습니다.' });
        return steps;
    }

    function buildScanSteps() {
        var steps = [];
        steps.push({ kind: 'intro', checked: [],
            log: '인덱스가 없다면 처음부터 하나씩 비교하며 찾아야 합니다(Full Table Scan). target=' + TARGET + '을 찾아봅시다.' });
        var checked = [];
        for (var i = 0; i <= FULL_SCAN_RESULT.foundIndex; i++) {
            checked = checked.concat([i]);
            var match = DATA[i] === TARGET;
            steps.push({ kind: 'check', checked: checked.slice(), lastIdx: i, found: match,
                log: (i + 1) + '번째 비교: ' + DATA[i] + ' vs ' + TARGET + ' → ' + (match ? '일치! 찾았습니다.' : '다름, 다음 값으로.') });
        }
        steps.push({ kind: 'done', checked: checked.slice(), lastIdx: FULL_SCAN_RESULT.foundIndex, found: true,
            log: '정리 — Full Scan은 총 ' + FULL_SCAN_RESULT.comparisons + '번 비교했습니다. 데이터가 늘어날수록 비교 횟수도 그만큼 늘어납니다(O(n)).' });
        return steps;
    }

    function buildSearchSteps() {
        var steps = [];
        steps.push({ kind: 'intro', rootChecked: [], leafChecked: [], visitedLeaf: -1,
            log: '같은 target=' + TARGET + '을 이번엔 B-Tree 인덱스로 찾아봅시다. 루트에서 시작합니다.' });

        var rootChecked = [];
        for (var i = 0; i < ROOT_RESULT.comparisons; i++) {
            rootChecked = rootChecked.concat([i]);
            var goLeft = TARGET < ROOT_KEYS[i];
            steps.push({ kind: 'root-compare', rootChecked: rootChecked.slice(), leafChecked: [], visitedLeaf: -1,
                log: '루트 비교 ' + (i + 1) + ': ' + TARGET + ' vs ' + ROOT_KEYS[i] + ' → ' + (goLeft ? '더 작음, 왼쪽으로' : '크거나 같음, 오른쪽으로') });
        }
        steps.push({ kind: 'goto-leaf', rootChecked: rootChecked.slice(), leafChecked: [], visitedLeaf: ROOT_RESULT.child,
            log: '루트 비교 결과 ' + (ROOT_RESULT.child + 1) + '번째 리프로 이동합니다 — 나머지 리프 ' + (LEAVES.length - 1) + '개는 아예 들여다보지 않습니다.' });

        var leafChecked = [];
        var leaf = LEAVES[ROOT_RESULT.child];
        for (var j = 0; j <= LEAF_RESULT.foundIndex; j++) {
            leafChecked = leafChecked.concat([j]);
            var match = leaf[j] === TARGET;
            steps.push({ kind: 'leaf-compare', rootChecked: rootChecked.slice(), leafChecked: leafChecked.slice(), visitedLeaf: ROOT_RESULT.child, found: match,
                log: '리프 내부 비교 ' + (j + 1) + ': ' + leaf[j] + ' vs ' + TARGET + ' → ' + (match ? '일치! 찾았습니다.' : '다름, 다음 값으로.') });
        }
        steps.push({ kind: 'done', rootChecked: rootChecked.slice(), leafChecked: leafChecked.slice(), visitedLeaf: ROOT_RESULT.child, found: true,
            log: '정리 — 인덱스 탐색은 총 ' + BTREE_TOTAL + '번 비교, 노드는 ' + (1 + 1) + '/' + (1 + LEAVES.length) + '개만 방문했습니다. Full Scan(' + FULL_SCAN_RESULT.comparisons + '번, 전체 노드 확인)보다 적은 데이터만 들여다보고 끝났습니다.' });
        return steps;
    }

    var STRUCTURE_STEPS = buildStructureSteps();
    var SCAN_STEPS       = buildScanSteps();
    var SEARCH_STEPS     = buildSearchSteps();

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'scan') return SCAN_STEPS;
        if (mode === 'search') return SEARCH_STEPS;
        return STRUCTURE_STEPS;
    }
    function defaultLog() { return currentSteps()[0].log; }
    function ez(q) { var v = clamp01(q); return v * v * (3 - 2 * v); }

    /* ===================== 공통 헬퍼 ===================== */
    function ixA(a) {
        var v = Math.round(clamp01(a) * 255);
        return (v < 16 ? '0' : '') + v.toString(16);
    }
    function ixC(key, a) { return colorOf(key) + ixA(a); }
    function ixAmt(pOn, cOn, t, a0, a1) {
        if (cOn) return pOn ? 1 : ez(seg(t, a0, a1));
        return pOn ? 1 - ez(seg(t, a0, a1)) : 0;
    }
    function ixRep(n, v) {
        var out = [];
        for (var i = 0; i < n; i++) out.push(v);
        return out;
    }
    function ixW(str, fs) {
        var n = 0;
        for (var i = 0; i < str.length; i++) n += str.charCodeAt(i) > 127 ? fs : fs * 0.6;
        return n;
    }
    function ixHiRoot(st) { return !!st.hiRoot || st.kind === 'done'; }
    function ixLit(st) { return st.hiLeaves === 'all' || st.kind === 'done'; }
    function ixRange(st) { return st.kind === 'sorted' || st.kind === 'done'; }
    function ixBox(x, y, cw, h, n, frame, lw) {
        rr(x, y, cw * n, h, 6, 'none', frame, lw);
        for (var i = 1; i < n; i++) ln(x + cw * i, y + 4, x + cw * i, y + h - 4, ixC('sub', 0.3), 1);
    }
    function ixFill(x, y, cw, h, i, col) { rr(x + cw * i + 2, y + 3, cw - 4, h - 6, 4, col, 'none'); }
    function ixCells(x, y, cw, h, vals, fs, amt, hues, frame, lw, k) {
        amt.forEach(function (a, i) { if (a > 0) ixFill(x, y, cw, h, i, ixC(hues[i], 0.2 * a * k)); });
        ixBox(x, y, cw, h, vals.length, frame, lw);
        vals.forEach(function (v, i) {
            var cx = x + cw * i + cw / 2;
            var cy = y + h / 2;
            tx(String(v), cx, cy, fs, ixC('text', k), 'center', false);
            if (amt[i] > 0) {
                ctx.globalAlpha = amt[i] * k;
                tx(String(v), cx, cy, fs, ixC(hues[i], 1), 'center', true);
                ctx.globalAlpha = 1;
            }
        });
    }
    function ixRipple(x, y, w, h, t) {
        var pad = 2 + 10 * ez(t);
        rr(x - pad, y - pad, w + pad * 2, h + pad * 2, 8, 'none', ixC('green', 0.9 * (1 - t)), 2);
    }
    function ixPtr(x, y, col) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 5, y + 7);
        ctx.lineTo(x + 5, y + 7);
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();
    }
    function ixPtrTag(x0, w, px, apexY, tagY, v, pA, tagA, fs) {
        var eq = v === TARGET;
        var hue = eq ? 'green' : 'orange';
        var txt = v + (eq ? ' = ' : ' ≠ ') + TARGET;
        var tw = ixW(txt, fs);
        var cx = Math.min(x0 + w - tw / 2, Math.max(x0 + tw / 2, px));
        ixPtr(px, apexY, ixC(hue, pA));
        ctx.globalAlpha = tagA;
        tx(txt, cx, tagY, fs, ixC(hue, 1), 'center', true);
        ctx.globalAlpha = 1;
    }
    function ixBadge(cx, y, h, mob) {
        var bw = mob ? 150 : 178;
        rr(cx - bw / 2, y, bw, h, h / 2, ixC('orange', 0.1), ixC('orange', 0.8), 1.8);
        tx('🔍 찾는 값 = ' + TARGET, cx, y + h / 2, mob ? 11 : 13, ixC('orange', 0.93), 'center', true);
    }

    /* ===================== 레이아웃 ===================== */
    var ixMemo = {};
    function ixGeom(w, mob) {
        return {
            fsT: mob ? 11 : 12,
            fsN: mob ? 12 : 15,
            fsC: mob ? 11 : 14,
            fsS: mob ? 11 : 12,
            nodeH: mob ? 40 : 52,
            linkH: mob ? 40 : 56,
            rootW: mob ? 120 : 168,
            gap: mob ? 8 : 22,
            cw: Math.min(mob ? 26 : 40, (w - (mob ? 16 : 44)) / 12)
        };
    }
    function layout(w, mob) {
        var key = mode + '|' + Math.round(w) + '|' + (mob ? 'm' : 'd');
        if (ixMemo[key]) return ixMemo[key];
        var g = ixGeom(w, mob);
        var L = { g: g, cell: Math.min(w / 12, mob ? 26 : 56) };
        if (mode === 'scan') {
            L.cellY = mob ? 40 : 48;
            L.cellH = mob ? 36 : 48;
            L.tagY = L.cellY + L.cellH + (mob ? 22 : 26);
            L.capY = L.tagY + (mob ? 20 : 26);
            L.total = L.capY + (mob ? 12 : 14);
        } else if (mode === 'search') {
            L.badgeY = mob ? 22 : 28;
            L.badgeH = mob ? 26 : 32;
            L.rootY = mob ? 76 : 98;
            L.leafY = L.rootY + g.nodeH + g.linkH;
            L.tagY = L.leafY + g.nodeH + (mob ? 20 : 24);
            L.capY = L.tagY + (mob ? 20 : 26);
            L.total = L.capY + (mob ? 12 : 14);
        } else {
            L.rootY = mob ? 40 : 52;
            L.leafY = L.rootY + g.nodeH + g.linkH;
            L.sweepY = L.leafY + g.nodeH + (mob ? 8 : 10);
            L.rangeY = L.leafY + g.nodeH + (mob ? 26 : 30);
            L.total = L.rangeY + (mob ? 14 : 16);
        }
        ixMemo[key] = L;
        return L;
    }
    function sceneH(w, mob) { return layout(w, mob).total; }
    function ixBoxes(x0, w, g) {
        var total = g.gap * (LEAVES.length - 1);
        LEAVES.forEach(function (lf) { total += lf.length * g.cw; });
        var x = x0 + (w - total) / 2;
        return LEAVES.map(function (lf) {
            var b = { x: x, w: lf.length * g.cw };
            x += b.w + g.gap;
            return b;
        });
    }

    /* ===================== 구조 장면 ===================== */
    function ixDrawStructure(x0, top, w, mob, s, p, fresh, e, L) {
        var g = L.g;
        var rootCx = x0 + w / 2;
        var rootX = rootCx - g.rootW / 2;
        var rootY = top + L.rootY;
        var leafY = top + L.leafY;
        var rootCw = g.rootW / ROOT_KEYS.length;
        var boxes = ixBoxes(x0, w, g);
        var hiA = ixAmt(ixHiRoot(p), ixHiRoot(s), e, 0, 0.6);
        var litCur = ixLit(s);
        var litPrev = ixLit(p);
        var pad = 4 + 3 * (1 - hiA);
        tx('B-Tree 인덱스', x0, top + (mob ? 8 : 10), g.fsT, ixC('sub', 1), 'left', true);
        rr(rootX - pad, rootY - pad, g.rootW + pad * 2, g.nodeH + pad * 2, 8, ixC('purple', 0.14 * hiA), ixC('purple', 0.9 * hiA), 2);
        ixCells(rootX, rootY, rootCw, g.nodeH, ROOT_KEYS, g.fsN, ixRep(ROOT_KEYS.length, 0), ixRep(ROOT_KEYS.length, 'purple'), ixC('purple', 0.5 + 0.5 * hiA), 1.4 + 0.8 * hiA, 1);
        tx('루트', rootX - 8, rootY + g.nodeH / 2, g.fsS, ixC('purple', 0.9), 'right', true);
        tx('리프', boxes[0].x, leafY - 9, g.fsS, ixC('teal', 0.9), 'left', true);
        boxes.forEach(function (b, li) {
            var a = litCur ? (litPrev ? 1 : ez(seg(e, li * 0.2, li * 0.2 + 0.5))) : (litPrev ? 1 - ez(e) : 0);
            var lcX = b.x + b.w / 2;
            var rcY = rootY + g.nodeH;
            ln(rootCx, rcY, lcX, leafY, ixC('muted', 0.45), 1.6);
            if (a > 0) {
                ctx.globalAlpha = a;
                ln(rootCx, rcY, lcX, leafY, ixC('teal', 1), 2.4);
                ctx.globalAlpha = 1;
                rr(b.x, leafY, b.w, g.nodeH, 6, ixC('teal', 0.12 * a), 'none');
            }
            ixCells(b.x, leafY, g.cw, g.nodeH, LEAVES[li], g.fsC, ixRep(LEAVES[li].length, 0), ixRep(LEAVES[li].length, 'teal'), ixC('teal', 0.4 + 0.6 * a), 1.4 + 0.8 * a, 1);
        });
        var rA = ixAmt(ixRange(p), ixRange(s), e, 0, 0.6);
        if (rA > 0) {
            var labs = ['< ' + ROOT_KEYS[0], ROOT_KEYS[0] + ' ≤ 값 < ' + ROOT_KEYS[1], '≥ ' + ROOT_KEYS[1]];
            ctx.globalAlpha = rA;
            labs.forEach(function (txt, li) {
                tx(txt, boxes[li].x + boxes[li].w / 2, top + L.rangeY, g.fsS, ixC('sub', 1), 'center', false);
            });
            ctx.globalAlpha = 1;
        }
        if (fresh && s.kind === 'sorted' && e < 1) {
            var sx = lerp(boxes[0].x, boxes[2].x + boxes[2].w, ez(e));
            ln(boxes[0].x, top + L.sweepY, sx, top + L.sweepY, ixC('yellow', 0.35), 2);
            circ(sx, top + L.sweepY, 4, ixC('yellow', 1), 'none');
        }
        if (fresh && s.kind === 'done' && e < 1) {
            var dk = ez(e);
            boxes.forEach(function (b) {
                circ(lerp(rootCx, b.x + b.w / 2, dk), lerp(rootY + g.nodeH, leafY, dk), 3.5, ixC('teal', 1), 'none');
            });
        }
    }

    /* ===================== 풀 스캔 장면 ===================== */
    function ixDrawScan(x0, top, w, mob, s, p, fresh, e, L) {
        var g = L.g;
        var cell = L.cell;
        var rowX = x0 + (w - cell * DATA.length) / 2;
        var cellY = top + L.cellY;
        var cellH = L.cellH;
        var sChk = s.checked || [];
        var pChk = p.checked || [];
        var last = s.lastIdx !== undefined ? s.lastIdx : -1;
        var lastP = p.lastIdx !== undefined ? p.lastIdx : -1;
        var found = !!s.found;
        var amt = DATA.map(function (v, i) { return ixAmt(pChk.indexOf(i) !== -1, sChk.indexOf(i) !== -1, e, 0.3, 0.9); });
        var hues = DATA.map(function (v, i) { return found && i === last ? 'green' : 'orange'; });
        tx('DATA (정렬된 배열, 인덱스 없음)', x0, top + (mob ? 8 : 10), g.fsT, ixC('sub', 1), 'left', true);
        ixCells(rowX, cellY, cell, cellH, DATA, g.fsC, amt, hues, ixC('sub', 0.6), 1.4, 1);
        var fromX = rowX + cell * ((lastP >= 0 ? lastP : 0) + 0.5);
        var toX = rowX + cell * ((last >= 0 ? last : 0) + 0.5);
        var px = lerp(fromX, toX, ez(e));
        var pA = last < 0 ? 0 : (fresh && lastP < 0 ? ez(e) : 1);
        var tagA = fresh ? ez(seg(e, 0.4, 1)) : 1;
        if (last >= 0) ixPtrTag(x0, w, px, cellY + cellH + 4, top + L.tagY, DATA[last], pA, tagA, g.fsC);
        var cntS = fresh ? Math.round(lerp(pChk.length, sChk.length, ez(e))) : sChk.length;
        tx('비교 횟수: ' + cntS + ' / ' + DATA.length, x0, top + L.capY, g.fsS, ixC('orange', 0.9), 'left', true);
        if (fresh && s.kind === 'done' && e < 1 && last >= 0) ixRipple(rowX + cell * last, cellY, cell, cellH, e);
    }

    /* ===================== 인덱스 탐색 장면 ===================== */
    function ixDrawSearch(x0, top, w, mob, s, p, fresh, e, L) {
        var g = L.g;
        var rootCx = x0 + w / 2;
        var rootX = rootCx - g.rootW / 2;
        var rootY = top + L.rootY;
        var leafY = top + L.leafY;
        var rootCw = g.rootW / ROOT_KEYS.length;
        var boxes = ixBoxes(x0, w, g);
        var rc = s.rootChecked || [];
        var rcP = p.rootChecked || [];
        var lc = s.leafChecked || [];
        var lcP = p.leafChecked || [];
        var vis = s.visitedLeaf;
        var visP = p.visitedLeaf;
        var found = !!s.found;
        var lastC = lc.length ? lc[lc.length - 1] : -1;
        var lastP = lcP.length ? lcP[lcP.length - 1] : -1;
        var hiA = ixAmt(rcP.length > 0, rc.length > 0, e, 0, 0.6);
        var pad = 4 + 3 * (1 - hiA);
        tx('B-Tree 인덱스', x0, top + (mob ? 8 : 10), g.fsT, ixC('sub', 1), 'left', true);
        ixBadge(rootCx, top + L.badgeY, L.badgeH, mob);
        rr(rootX - pad, rootY - pad, g.rootW + pad * 2, g.nodeH + pad * 2, 8, ixC('purple', 0.14 * hiA), ixC('purple', 0.9 * hiA), 2);
        var rAmt = ROOT_KEYS.map(function (v, i) { return ixAmt(rcP.indexOf(i) !== -1, rc.indexOf(i) !== -1, e, 0.6, 1); });
        ixCells(rootX, rootY, rootCw, g.nodeH, ROOT_KEYS, g.fsN, rAmt, ixRep(ROOT_KEYS.length, 'orange'), ixC('purple', 0.5 + 0.5 * hiA), 1.4 + 0.8 * hiA, 1);
        tx('루트', rootX - 8, rootY + g.nodeH / 2, g.fsS, ixC('purple', 0.9), 'right', true);
        tx('리프', boxes[0].x, leafY - 9, g.fsS, ixC('teal', 0.9), 'left', true);
        boxes.forEach(function (b, li) {
            var dA = ixAmt(visP >= 0 && visP !== li, vis >= 0 && vis !== li, e, 0.2, 0.8);
            var k = 1 - 0.65 * dA;
            var lcX = b.x + b.w / 2;
            var rcY = rootY + g.nodeH;
            var gp = vis === li ? (visP === li ? 1 : ez(seg(e, 0, 0.7))) : 0;
            ln(rootCx, rcY, lcX, leafY, ixC('muted', 0.45 * k), 1.6);
            if (gp > 0) ln(rootCx, rcY, lerp(rootCx, lcX, gp), lerp(rcY, leafY, gp), ixC('teal', 1), 2.4);
            var hA = ixAmt(visP === li, vis === li, e, 0.5, 1);
            var cChk = vis === li ? lc : [];
            var pChk = visP === li ? lcP : [];
            var amt = LEAVES[li].map(function (v, i) { return ixAmt(pChk.indexOf(i) !== -1, cChk.indexOf(i) !== -1, e, 0.3, 0.9); });
            var hues = LEAVES[li].map(function (v, i) { return found && i === lastC ? 'green' : 'orange'; });
            if (hA > 0) rr(b.x, leafY, b.w, g.nodeH, 6, ixC('teal', 0.1 * hA * k), 'none');
            ixCells(b.x, leafY, g.cw, g.nodeH, LEAVES[li], g.fsC, amt, hues, ixC('teal', (0.35 + 0.55 * hA) * k), 1.4 + 0.4 * hA, k);
        });
        if (fresh && s.kind === 'root-compare' && rc.length > rcP.length) {
            var ni = rc[rc.length - 1];
            var dk = ez(seg(e, 0, 0.75));
            circ(lerp(rootCx, rootX + rootCw * (ni + 0.5), dk), lerp(top + L.badgeY + L.badgeH, rootY - 4, dk), 4.5, ixC('orange', 1 - ez(seg(e, 0.75, 1))), 'none');
        }
        if (vis >= 0 && lastC >= 0) {
            var vb = boxes[vis];
            var fromI = lastP >= 0 ? lastP : 0;
            var px = lerp(vb.x + g.cw * (fromI + 0.5), vb.x + g.cw * (lastC + 0.5), ez(e));
            var pA = fresh && lastP < 0 ? ez(e) : 1;
            var tagA = fresh ? ez(seg(e, 0.4, 1)) : 1;
            ixPtrTag(x0, w, px, leafY + g.nodeH + 4, top + L.tagY, LEAVES[vis][lastC], pA, tagA, g.fsC);
        }
        var rcS = fresh ? Math.round(lerp(rcP.length, rc.length, ez(e))) : rc.length;
        var lcS = fresh ? Math.round(lerp(lcP.length, lc.length, ez(e))) : lc.length;
        tx('비교 횟수: ' + (rcS + lcS) + '  (루트 ' + rcS + ' + 리프 ' + lcS + ')', x0, top + L.capY, g.fsS, ixC('teal', 0.9), 'left', true);
        if (fresh && s.kind === 'done' && e < 1 && lastC >= 0) ixRipple(boxes[vis].x + g.cw * lastC, leafY, g.cw, g.nodeH, e);
    }

    /* ===================== 메인 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var steps = currentSteps();
        var s = step || steps[0];
        var p = prev || s;
        var fresh = s !== p;
        var e = fresh ? clamp01(t) : 1;
        var L = layout(w, mob);
        if (mode === 'scan') ixDrawScan(x0, top, w, mob, s, p, fresh, e, L);
        else if (mode === 'search') ixDrawSearch(x0, top, w, mob, s, p, fresh, e, L);
        else ixDrawStructure(x0, top, w, mob, s, p, fresh, e, L);
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
        speedBtns.forEach(function (b) { b.classList.remove('index-viz__speed-btn--active'); });
        btn.classList.add('index-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('index-viz__mode-btn--active', d.key === m); });
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