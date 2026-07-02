/**
 * 힙(Max-Heap) 시각화
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
    var root    = el('div', 'heap-viz');
    var toolbar = el('div', 'heap-viz__toolbar');
    var tbLeft  = el('div', 'heap-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'heap-viz__title', 'Max-Heap'));

    var modeWrap = el('div', 'heap-viz__mode');
    var modeDefs = [
        { key: 'insert', label: '삽입' },
        { key: 'delete', label: '삭제' },
        { key: 'sort',   label: '힙정렬' },
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'heap-viz__mode-btn' + (i === 0 ? ' heap-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'heap-viz__speed');
    speedWrap.appendChild(el('span', 'heap-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1800], ['2x', 900], ['3x', 600]].forEach(function (pair, i) {
        var b = el('button', 'heap-viz__speed-btn' + (i === 0 ? ' heap-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'heap-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'heap-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'heap-viz__log', '▶ PLAY를 눌러 힙 동작을 확인하세요.');
    root.appendChild(logEl);

    var controls = el('div', 'heap-viz__controls');
    var btnPlay  = el('button', 'heap-viz__btn heap-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'heap-viz__btn', '▶| STEP');
    var btnReset = el('button', 'heap-viz__btn', '↺ RESET');
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

    var P = window.CsFlow.getP();

    /* ===================== 스텝 정의 ===================== */
    var INSERT_STEPS = [
        { arr:[],                   heapSize:0, swapA:null, swapB:null, phase:'idle',    log:'빈 Max-Heap. 삽입 순서: 4 → 8 → 15 → 16 → 23 → 42. 삽입 후 Heapify-Up으로 힙 조건을 복원합니다.' },
        { arr:[4],                  heapSize:1, swapA:null, swapB:null, phase:'add',     log:'INSERT 4 → 배열 끝에 추가. 루트이므로 Heapify-Up 불필요. 힙: [4]' },
        { arr:[4,8],                heapSize:2, swapA:1,    swapB:null, phase:'add',     log:'INSERT 8 → index 1에 추가. 부모(index 0)=4 < 8 → 스왑 필요.' },
        { arr:[8,4],                heapSize:2, swapA:1,    swapB:0,    phase:'swap-up', log:'Heapify-Up: 8(idx 1) ↔ 4(idx 0) 스왑. 루트 도달 → 완료. 힙: [8, 4]' },
        { arr:[8,4,15],             heapSize:3, swapA:2,    swapB:null, phase:'add',     log:'INSERT 15 → index 2에 추가. 부모(index 0)=8 < 15 → 스왑 필요.' },
        { arr:[15,4,8],             heapSize:3, swapA:2,    swapB:0,    phase:'swap-up', log:'Heapify-Up: 15(idx 2) ↔ 8(idx 0) 스왑. 루트 도달 → 완료. 힙: [15, 4, 8]' },
        { arr:[15,4,8,16],          heapSize:4, swapA:3,    swapB:null, phase:'add',     log:'INSERT 16 → index 3에 추가. 부모(index 1)=4 < 16 → 스왑 필요.' },
        { arr:[15,16,8,4],          heapSize:4, swapA:3,    swapB:1,    phase:'swap-up', log:'Heapify-Up 1회: 16(idx 3) ↔ 4(idx 1) 스왑. 다시 부모(idx 0)=15 < 16 → 추가 스왑.' },
        { arr:[16,15,8,4],          heapSize:4, swapA:1,    swapB:0,    phase:'swap-up', log:'Heapify-Up 2회: 16(idx 1) ↔ 15(idx 0) 스왑. 루트 도달 → 완료. 힙: [16, 15, 8, 4]' },
        { arr:[16,15,8,4,23],       heapSize:5, swapA:4,    swapB:null, phase:'add',     log:'INSERT 23 → index 4에 추가. 부모(index 1)=15 < 23 → 스왑 필요.' },
        { arr:[16,23,8,4,15],       heapSize:5, swapA:4,    swapB:1,    phase:'swap-up', log:'Heapify-Up 1회: 23(idx 4) ↔ 15(idx 1) 스왑. 부모(idx 0)=16 < 23 → 추가 스왑.' },
        { arr:[23,16,8,4,15],       heapSize:5, swapA:1,    swapB:0,    phase:'swap-up', log:'Heapify-Up 2회: 23(idx 1) ↔ 16(idx 0) 스왑. 루트 도달 → 완료. 힙: [23, 16, 8, 4, 15]' },
        { arr:[23,16,8,4,15,42],    heapSize:6, swapA:5,    swapB:null, phase:'add',     log:'INSERT 42 → index 5에 추가. 부모(index 2)=8 < 42 → 스왑 필요.' },
        { arr:[23,16,42,4,15,8],    heapSize:6, swapA:5,    swapB:2,    phase:'swap-up', log:'Heapify-Up 1회: 42(idx 5) ↔ 8(idx 2) 스왑. 부모(idx 0)=23 < 42 → 추가 스왑.' },
        { arr:[42,16,23,4,15,8],    heapSize:6, swapA:2,    swapB:0,    phase:'swap-up', log:'Heapify-Up 2회: 42(idx 2) ↔ 23(idx 0) 스왑. 루트 도달 → 완료. Max-Heap 완성: [42, 16, 23, 4, 15, 8]' },
    ];

    var DELETE_STEPS = [
        { arr:[42,16,23,4,15,8],  heapSize:6, swapA:null, swapB:null, phase:'idle',      log:'Max-Heap [42, 16, 23, 4, 15, 8]. Extract-Max: 루트(최댓값 42)를 꺼냅니다.' },
        { arr:[8,16,23,4,15,42],  heapSize:5, swapA:0,    swapB:5,    phase:'extract',   log:'루트(42) 제거. 마지막 원소(8)를 루트(index 0)로 이동. 힙 크기 5. 이제 Heapify-Down 시작.' },
        { arr:[23,16,8,4,15,42],  heapSize:5, swapA:0,    swapB:2,    phase:'swap-down', log:'Heapify-Down: 루트 8, 왼쪽 자식 16(idx 1), 오른쪽 자식 23(idx 2). 가장 큰 자식 23(idx 2)과 스왑.' },
        { arr:[23,16,8,4,15,42],  heapSize:5, swapA:null, swapB:null, phase:'idle',      log:'8의 자식: index 5는 힙 범위 밖. 더 이상 스왑 불필요. Extract-Max 완료. 결과 Max-Heap: [23, 16, 8, 4, 15]' },
    ];

    var SORT_STEPS = [
        { arr:[42,16,23,4,15,8], heapSize:6, swapA:null, swapB:null, phase:'idle',      log:'Max-Heap [42, 16, 23, 4, 15, 8]. 힙 정렬: 루트(최댓값)를 끝으로 보내고 힙 크기를 줄이며 반복합니다.' },
        { arr:[8,16,23,4,15,42],  heapSize:5, swapA:0,    swapB:5,    phase:'extract',   log:'EXTRACT: 루트 42(최댓값) ↔ 마지막 원소 8 교환. 42는 정렬 영역으로 확정. 힙 크기 → 5.' },
        { arr:[23,16,8,4,15,42],  heapSize:5, swapA:0,    swapB:2,    phase:'swap-down', log:'Heapify-Down: 8(root) → 자식 중 최대 23(idx 2)과 스왑.' },
        { arr:[15,16,8,4,23,42],  heapSize:4, swapA:0,    swapB:4,    phase:'extract',   log:'EXTRACT: 루트 23 ↔ 마지막 원소 15 교환. 23 확정. 힙 크기 → 4.' },
        { arr:[16,15,8,4,23,42],  heapSize:4, swapA:0,    swapB:1,    phase:'swap-down', log:'Heapify-Down: 15(root) → 자식 중 최대 16(idx 1)과 스왑.' },
        { arr:[4,15,8,16,23,42],  heapSize:3, swapA:0,    swapB:3,    phase:'extract',   log:'EXTRACT: 루트 16 ↔ 마지막 원소 4 교환. 16 확정. 힙 크기 → 3.' },
        { arr:[15,4,8,16,23,42],  heapSize:3, swapA:0,    swapB:1,    phase:'swap-down', log:'Heapify-Down: 4(root) → 자식 중 최대 15(idx 1)과 스왑.' },
        { arr:[8,4,15,16,23,42],  heapSize:2, swapA:0,    swapB:2,    phase:'extract',   log:'EXTRACT: 루트 15 ↔ 마지막 원소 8 교환. 15 확정. 힙 크기 → 2.' },
        { arr:[4,8,15,16,23,42],  heapSize:1, swapA:0,    swapB:1,    phase:'extract',   log:'EXTRACT: 루트 8 ↔ 마지막 원소 4 교환. 8 확정. 힙 크기 → 1.' },
        { arr:[4,8,15,16,23,42],  heapSize:0, swapA:null, swapB:null, phase:'done',      log:'힙 정렬 완료! 오름차순 정렬: [4, 8, 15, 16, 23, 42]. 시간복잡도 O(n log n), 추가 메모리 O(1).' },
    ];

    /* ===================== 레이아웃 상수 계산 ===================== */
    var TREE_LAYOUT = [
        { level:0, xr:0.50 },
        { level:1, xr:0.27 },
        { level:1, xr:0.73 },
        { level:2, xr:0.15 },
        { level:2, xr:0.39 },
        { level:2, xr:0.61 },
    ];
    var TREE_EDGES = [[0,1],[0,2],[1,3],[1,4],[2,5]];

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
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.strokeStyle = col; ctx.lineWidth = lw || 1.5;
        ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]);
    }

    function rr(x, y, w, h, r, fill, stroke, lw) {
        ctx.beginPath();
        ctx.moveTo(x+r, y);
        ctx.arcTo(x+w,y, x+w,y+h, r); ctx.arcTo(x+w,y+h, x,y+h, r);
        ctx.arcTo(x,y+h, x,y, r);     ctx.arcTo(x,y, x+w,y, r);
        ctx.closePath();
        if (fill   && fill   !== 'none') { ctx.fillStyle   = fill;              ctx.fill();   }
        if (stroke && stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = lw||1.5; ctx.stroke(); }
    }

    /* ===================== 트리 드로우 ===================== */
    function drawTree(step, W, treeTopY, levelGap, r) {
        var arr      = step.arr;
        var heapSize = step.heapSize;
        var swapA    = step.swapA;
        var swapB    = step.swapB;
        var fVal     = W < 600 ? 11 : 14;

        function pos(i) {
            var L = TREE_LAYOUT[i];
            return { x: L.xr * W, y: treeTopY + L.level * levelGap };
        }

        TREE_EDGES.forEach(function (e) {
            var p1 = e[0], p2 = e[1];
            if (p1 >= arr.length || p2 >= arr.length) return;
            var a = pos(p1), b = pos(p2);
            var dx = b.x-a.x, dy = b.y-a.y, d = Math.sqrt(dx*dx+dy*dy);
            var ux = dx/d, uy = dy/d;
            var inHeap = p1 < heapSize && p2 < heapSize;
            var onSwap = (swapA !== null) && ((p1===swapA&&p2===swapB)||(p1===swapB&&p2===swapA));
            var col = onSwap ? P.orange + 'cc' : (inHeap ? P.muted + '55' : P.muted + '22');
            line(a.x+ux*r, a.y+uy*r, b.x-ux*r, b.y-uy*r, col, onSwap ? 2 : 1.5);
        });

        arr.forEach(function (val, i) {
            if (i >= TREE_LAYOUT.length) return;
            var p   = pos(i);
            var inHeap = i < heapSize;
            var isSwapA = (i === swapA);
            var isSwapB = (i === swapB);
            var isSorted = !inHeap;

            var col = isSorted  ? P.green
                    : isSwapA   ? P.orange
                    : isSwapB   ? P.purple
                    : step.phase === 'add' && i === arr.length - 1 ? P.yellow || P.green
                    : P.teal;

            var fillA   = (isSwapA || isSwapB || isSorted) ? '28' : '15';
            var strokeA = (isSwapA || isSwapB || isSorted) ? 'ee' : '77';
            var lw      = (isSwapA || isSwapB) ? 2.5 : (isSorted ? 2 : 1.5);

            circle(p.x, p.y, r, col+fillA, col+strokeA, lw);
            tx(String(val), p.x, p.y, fVal, col, 'center', isSwapA || isSwapB || isSorted);

            tx('['+i+']', p.x, p.y - r - (W<600 ? 9 : 12), W<600 ? 8 : 10,
               (isSwapA||isSwapB) ? col : P.muted + '88', 'center', false);
        });
    }

    /* ===================== 배열 표현 드로우 ===================== */
    function drawArray(step, W, arrayY, mob) {
        var arr      = step.arr;
        var heapSize = step.heapSize;
        var swapA    = step.swapA;
        var swapB    = step.swapB;

        if (arr.length === 0) return;

        var cellW  = mob ? 40 : 54;
        var cellH  = mob ? 34 : 42;
        var gapX   = mob ? 4  : 6;
        var totalW = arr.length * cellW + (arr.length - 1) * gapX;
        var startX = (W - totalW) / 2;
        var fVal   = mob ? 11 : 14;
        var fIdx   = mob ? 8  : 10;

        tx('배열 표현', mob ? 16 : 28, arrayY - (mob ? 14 : 18), mob ? 9 : 11, P.muted + 'aa', 'left', true);

        arr.forEach(function (val, i) {
            var cx   = startX + i * (cellW + gapX);
            var inHeap  = i < heapSize;
            var isSwapA = (i === swapA);
            var isSwapB = (i === swapB);
            var isSorted = !inHeap;

            var col = isSorted  ? P.green
                    : isSwapA   ? P.orange
                    : isSwapB   ? P.purple
                    : step.phase === 'add' && i === arr.length - 1 ? P.green
                    : inHeap    ? P.teal
                    : P.muted;

            var fillA   = (isSwapA || isSwapB || isSorted) ? '28' : '15';
            var strokeA = (isSwapA || isSwapB || isSorted) ? 'ee' : '55';

            rr(cx, arrayY, cellW, cellH, 4, col+fillA, col+strokeA, (isSwapA||isSwapB) ? 2 : 1.5);
            tx(String(val), cx + cellW/2, arrayY + cellH/2, fVal, col, 'center', isSwapA || isSwapB || isSorted);

            tx('['+i+']', cx + cellW/2, arrayY + cellH + (mob ? 10 : 13), mob ? 10 : 12, P.muted + 'cc', 'center', false);

            if (i > 0) {
                var par = Math.floor((i-1)/2);
                tx('p='+ par, cx + cellW/2, arrayY + cellH + (mob ? 23 : 30), mob ? 10 : 12,
                   (isSwapA||isSwapB) ? col + 'dd' : P.muted + 'bb', 'center', false);
            }
        });

        if (heapSize > 0 && heapSize < arr.length) {
            var bx = startX + heapSize * (cellW + gapX) - gapX/2;
            line(bx, arrayY - (mob?4:6), bx, arrayY + cellH + (mob?38:48), P.orange + 'cc', 1.5, [4,3]);
            tx('heap | sorted', bx, arrayY + cellH + (mob?48:60), mob?10:12, P.orange + 'dd', 'center', true);
        }
    }

    /* ===================== resize ===================== */
    function calcH(W) {
        var mob      = W < 600;
        var labelH   = mob ? 24 : 30;
        var treeTopY = labelH + (mob ? 32 : 40);
        var levelGap = mob ? 64 : 84;
        var r        = mob ? 18 : 23;
        var treeBot  = treeTopY + 2 * levelGap + r;
        var arrayGap = mob ? 32 : 40;
        var cellH    = mob ? 34 : 42;
        var arrayBot = treeBot + arrayGap + cellH + (mob ? 58 : 72);
        return arrayBot + (mob ? 16 : 20);
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

        var labelH   = mob ? 24 : 30;
        var treeTopY = labelH + (mob ? 32 : 40);
        var levelGap = mob ? 64 : 84;
        var r        = mob ? 18 : 23;
        var treeBot  = treeTopY + 2 * levelGap + r;
        var arrayY   = treeBot + (mob ? 32 : 40);

        var steps = currentSteps();
        var step  = steps[stepIdx >= 0 ? stepIdx : 0];

        var modeLabel = mode === 'insert' ? '삽입 후 Heapify-Up: 부모보다 크면 위로'
                      : mode === 'delete' ? 'Extract-Max 후 Heapify-Down: 자식보다 작으면 아래로'
                      : '힙 정렬: Extract-Max 반복 → 오름차순 정렬';
        tx(modeLabel, W/2, mob ? 14 : 17, mob ? 10 : 12, P.muted + 'cc', 'center', false);

        drawTree(step, W, treeTopY, levelGap, r);
        drawArray(step, W, arrayY, mob);

        if (step.phase === 'done') {
            var doneY = arrayY + (mob ? 34 : 42) + (mob ? 50 : 62) - 10;
            tx('오름차순 정렬 완료: [4, 8, 15, 16, 23, 42]', W/2, doneY, mob ? 11 : 14, P.green, 'center', true);
        }
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
        if (mode === 'delete') return DELETE_STEPS;
        return SORT_STEPS;
    }

    /* ===================== 애니메이션 ===================== */
    function animateStep(onDone) {
        animProg = 0;
        if (rafId) cancelAnimationFrame(rafId);
        var s = 0.007 * (1800 / speed);
        (function tick() {
            animProg = Math.min(1, animProg + s);
            draw();
            if (animProg < 1) { rafId = requestAnimationFrame(tick); }
            else { draw(); if (onDone) onDone(); }
        })();
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) { speedBtns.forEach(function(b){ b.disabled=v; }); }

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
                if (next === steps.length - 1) { running = false; btnStep.disabled = true; setSpeedDisabled(false); }
                else { timer = setTimeout(tick, speed * 0.65); }
            });
        }
        tick();
    }

    function vizStep() {
        if (running || animProg < 1) return;
        var next = stepIdx + 1;
        if (next >= currentSteps().length) return;
        applyStep(next, null);
        if (next === currentSteps().length - 1) { btnPlay.disabled = true; btnStep.disabled = true; }
    }

    function vizReset() {
        clearTimeout(timer);
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        running = false; stepIdx = -1; animProg = 1;
        btnPlay.disabled = false; btnStep.disabled = false;
        logEl.textContent = '▶ PLAY를 눌러 힙 동작을 확인하세요.';
        setSpeedDisabled(false);
        resize();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        speedBtns.forEach(function(b){ b.classList.remove('heap-viz__speed-btn--active'); });
        btn.classList.add('heap-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function(d){ modeBtns[d.key].classList.toggle('heap-viz__mode-btn--active', d.key===m); });
        vizReset();
    }

    /* ===================== 라이프사이클 ===================== */
    window.CsFlow.createVizLifecycle({
        canvas: canvas, canvasWrap: canvasWrap, resize: resize, draw: draw,
        getState : function () { return { rafId:rafId, timer:timer, running:running }; },
        setState : function (s) { rafId=s.rafId; timer=s.timer; running=s.running; },
        onPause  : function () { setSpeedDisabled(false); },
        getMouseCtx: function () {
            return { GW:GW, GH:GH, mousePos:{x:-1,y:-1}, tooltipHits:[],
                     hoveredKey:function(){ return null; }, setHoveredKey:function(){}, draw:draw };
        },
    });

    setTimeout(resize, 60);
})();