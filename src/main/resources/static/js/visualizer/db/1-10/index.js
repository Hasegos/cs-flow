/**
 * 인덱스 시각화
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
        { key: 'scan',      label: '풀 스캔' },
        { key: 'search',    label: '인덱스 탐색' }
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
    [['1x', 1500], ['2x', 750], ['3x', 400]].forEach(function (pair, i) {
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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

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
    var mode    = 'structure';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1500;

    function currentSteps() {
        if (mode === 'scan') return SCAN_STEPS;
        if (mode === 'search') return SEARCH_STEPS;
        return STRUCTURE_STEPS;
    }

    /* ===================== 드로우 헬퍼 ===================== */
    function rr(x, y, w, h, r, fill, stroke, lw, dash) {
        if (w <= 0 || h <= 0) return;
        var rad = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rad, y);
        ctx.arcTo(x + w, y,     x + w, y + h, rad);
        ctx.arcTo(x + w, y + h, x,     y + h, rad);
        ctx.arcTo(x,     y + h, x,     y,     rad);
        ctx.arcTo(x,     y,     x + w, y,     rad);
        ctx.closePath();
        if (dash) ctx.setLineDash(dash); else ctx.setLineDash([]);
        if (fill   && fill   !== 'none') { ctx.fillStyle   = fill;              ctx.fill();   }
        if (stroke && stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.4; ctx.stroke(); }
        ctx.setLineDash([]);
    }
    function tx(str, x, y, sz, color, align, bold) {
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }
    function seg(x1, y1, x2, y2, col, lw, dash) {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.strokeStyle = col; ctx.lineWidth = lw || 1;
        if (dash) ctx.setLineDash(dash); else ctx.setLineDash([]);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    /* ===================== 타겟 배지 (텍스트 로그 대신 시각적으로도 target을 드러냄) ===================== */
    function drawTargetBadge(cx, y, mob) {
        var label = '\uD83D\uDD0D 찾는 값 = ' + TARGET;
        var w = mob ? 150 : 178;
        var h = mob ? 30 : 34;
        rr(cx - w / 2, y, w, h, h / 2, P.orange + '18', P.orange + 'cc', 1.8);
        tx(label, cx, y + h / 2, mob ? 12 : 14, P.orange + 'ee', 'center', true);
    }

    /* ===================== 노드(박스) 렌더 ===================== */
    function drawNode(x, y, w, h, values, opts) {
        opts = opts || {};
        var fill = opts.dim ? (P.muted + '0c') : (opts.hi ? (opts.hiColor || P.orange) + '20' : 'none');
        var stroke = opts.dim ? (P.muted + '33') : ((opts.strokeColor || P.muted) + (opts.hi ? 'dd' : '66'));
        rr(x, y, w, h, 6, fill, stroke, opts.hi ? 2 : 1.4);
        var cellW = w / values.length;
        values.forEach(function (v, i) {
            var cx = x + cellW * i + cellW / 2;
            var checkedSet = opts.checked || [];
            var isChecked = checkedSet.indexOf(i) !== -1;
            var isLast = opts.lastIdx === i;
            var color;
            if (opts.dim) color = P.muted + '55';
            else if (isChecked && isLast && opts.found) color = P.green + 'ee';
            else if (isChecked) color = P.orange + 'ee';
            else color = P.text + (opts.dim ? '55' : 'dd');
            if (isChecked && !opts.dim) {
                rr(x + cellW * i + 2, y + 3, cellW - 4, h - 6, 4, (isLast && opts.found ? P.green : P.orange) + '22', 'none');
            }
            tx(String(v), cx, y + h / 2, opts.sz || 11, color, 'center', isChecked);
            if (i > 0) seg(x + cellW * i, y + 4, x + cellW * i, y + h - 4, (opts.strokeColor || P.muted) + '33', 1);
        });
    }

    /* ===================== 레이아웃 ===================== */
    function getGeom(mob) {
        return {
            padX: mob ? 16 : 28,
            titleGap: mob ? 20 : 24,
            nodeH: mob ? 44 : 58,
            cellSz: mob ? 13 : 16,
            sectionGap: mob ? 24 : 32,
            badgeH: mob ? 32 : 38
        };
    }

    function calcH(w) {
        var mob = w < 600;
        var G = getGeom(mob);
        var top = mob ? 16 : 20, bottom = mob ? 18 : 22;
        if (mode === 'scan') {
            return top + G.titleGap + G.badgeH + 10 + G.nodeH + (mob ? 36 : 44) + bottom;
        }
        var rootH = G.nodeH;
        var linkH = mob ? 42 : 62;
        var leafH = G.nodeH;
        var badgeBlock = mode === 'search' ? (G.badgeH + 26) : 0;
        return top + G.titleGap + badgeBlock + rootH + linkH + leafH + (mob ? 40 : 48) + bottom;
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var neededH = calcH(w);
        canvasWrap.style.height    = 'auto';
        canvasWrap.style.minHeight = neededH + 'px';
        var actualH = canvasWrap.offsetHeight || neededH;
        if (actualH < neededH) actualH = neededH;
        canvas.width  = w * dpr;
        canvas.height = actualH * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        var W = GW(); var mob = W < 600;
        var G = getGeom(mob);
        var neededH = calcH(W);
        var extra = Math.max(0, GH() - neededH);
        var top = (mob ? 14 : 18) + extra / 2;
        var x0 = G.padX;
        var fullW = W - G.padX * 2;

        var steps = currentSteps();
        var step = stepIdx >= 0 ? steps[stepIdx] : steps[0];

        if (mode === 'scan') {
            tx('DATA (정렬된 배열, 인덱스 없음)', x0, top + G.titleGap - (mob ? 12 : 14), mob ? 11 : 12, P.muted + 'aa', 'left', true);
            drawTargetBadge(x0 + fullW / 2, top + G.titleGap, mob);
            var arrY = top + G.titleGap + G.badgeH + 10;
            drawNode(x0, arrY, fullW, G.nodeH, DATA, {
                checked: step.checked || [], lastIdx: step.lastIdx, found: step.found, sz: G.cellSz, strokeColor: P.muted
            });
            var capY = arrY + G.nodeH + (mob ? 22 : 26);
            var cnt = (step.checked || []).length;
            tx('비교 횟수: ' + cnt + ' / ' + DATA.length, x0, capY, mob ? 11 : 12, P.orange + 'cc', 'left', true);
            return;
        }

        var rootChecked = mode === 'search' ? (step.rootChecked || []) : (step.hiRoot ? [0, 1] : []);
        tx('B-Tree 인덱스', x0, top + G.titleGap - (mob ? 12 : 14), mob ? 11 : 12, P.muted + 'aa', 'left', true);

        var badgeBlock = mode === 'search' ? (G.badgeH + 26) : 0;
        if (mode === 'search') drawTargetBadge(x0 + fullW / 2, top + G.titleGap, mob);

        var rootW = mob ? 130 : 168;
        var rootX = x0 + fullW / 2 - rootW / 2;
        var rootY = top + G.titleGap + badgeBlock;
        var rootHi = mode === 'search' ? (rootChecked.length > 0 || step.kind === 'goto-leaf' || step.kind === 'leaf-compare' || step.kind === 'done') : !!step.hiRoot;
        drawNode(rootX, rootY, rootW, G.nodeH, ROOT_KEYS, {
            checked: mode === 'search' ? rootChecked : [], hi: rootHi, hiColor: P.purple, strokeColor: P.purple, sz: G.cellSz + 1
        });
        tx('루트', rootX + rootW / 2, rootY - (mob ? 11 : 12), mob ? 9.5 : 10.5, P.purple + '99', 'center', false);

        var linkH = mob ? 42 : 62;
        var leafY = rootY + G.nodeH + linkH;
        var leafGap = mob ? 14 : 22;
        var leafWs = LEAVES.map(function (lf) { return Math.max(mob ? 84 : 104, lf.length * (mob ? 28 : 36)); });
        var totalLeafW = leafWs.reduce(function (a, b) { return a + b; }, 0) + leafGap * 2;
        var leafStartX = x0 + fullW / 2 - totalLeafW / 2;

        var visitedLeaf = mode === 'search' ? step.visitedLeaf : (step.hiLeaves === 'all' ? -1 : -2);
        var leafShowAllHi = mode === 'structure' && step.hiLeaves === 'all';

        var lx = leafStartX;
        LEAVES.forEach(function (lf, li) {
            var lw = leafWs[li];
            var rootCx = rootX + rootW / 2;
            var leafCx = lx + lw / 2;
            var dim = mode === 'search' && visitedLeaf >= 0 && visitedLeaf !== li;
            var lineOn = mode === 'search' ? (visitedLeaf === li) : leafShowAllHi;
            seg(rootCx, rootY + G.nodeH, leafCx, leafY, dim ? (P.muted + '22') : (lineOn ? P.teal + 'cc' : P.muted + '55'), lineOn ? 2.4 : 1.6);

            var checkedForLeaf = (mode === 'search' && visitedLeaf === li) ? (step.leafChecked || []) : [];
            drawNode(lx, leafY, lw, G.nodeH, lf, {
                checked: checkedForLeaf, lastIdx: checkedForLeaf.length ? checkedForLeaf[checkedForLeaf.length - 1] : -1,
                found: step.found, sz: G.cellSz, dim: dim, hi: mode === 'structure' && leafShowAllHi, hiColor: P.teal, strokeColor: P.teal
            });
            lx += lw + leafGap;
        });
        tx('리프', leafStartX + totalLeafW / 2, leafY - (mob ? 11 : 12), mob ? 9.5 : 10.5, P.teal + '99', 'center', false);

        if (mode === 'search') {
            var capY2 = leafY + G.nodeH + (mob ? 22 : 26);
            var rc = (step.rootChecked || []).length;
            var lc = (step.leafChecked || []).length;
            tx('비교 횟수: ' + (rc + lc) + '  (루트 ' + rc + ' + 리프 ' + lc + ')', x0, capY2, mob ? 11 : 12, P.teal + 'cc', 'left', true);
        }
    }

    /* ===================== 애니메이션(스텝 전환) ===================== */
    function animateStep(onDone) {
        if (rafId) cancelAnimationFrame(rafId);
        draw();
        rafId = requestAnimationFrame(function () { rafId = null; if (onDone) onDone(); });
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) { speedBtns.forEach(function (b) { b.disabled = v; }); }
    function defaultLog() { return currentSteps()[0].log; }

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