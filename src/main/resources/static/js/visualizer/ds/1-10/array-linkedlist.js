/**
 * 배열 vs 연결 리스트 시각화
 */
(function () {
    'use strict';

    var container = document.getElementById('visualizer-container');
    if (!container) return;

    function el(tag, cls, txt) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (txt) e.textContent = txt;
        return e;
    }

    /* ===================== DOM 구성 ===================== */
    var root    = el('div', 'al-viz');
    var toolbar = el('div', 'al-viz__toolbar');
    var tbLeft  = el('div', 'al-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'al-viz__title', 'Array vs Linked List'));

    var modeWrap   = el('div', 'al-viz__mode');
    var modeArray  = el('button', 'al-viz__mode-btn al-viz__mode-btn--active', 'Array');
    var modeLinked = el('button', 'al-viz__mode-btn', 'Linked List');
    modeArray.addEventListener('click',  function () { if (!running) switchMode('array'); });
    modeLinked.addEventListener('click', function () { if (!running) switchMode('linked'); });
    modeWrap.appendChild(modeArray);
    modeWrap.appendChild(modeLinked);
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'al-viz__speed');
    speedWrap.appendChild(el('span', 'al-viz__speed-label', 'SPEED'));
    [['1x', 1800], ['2x', 900], ['3x', 600]].forEach(function (pair, i) {
        var b = el('button', 'al-viz__speed-btn' + (i === 0 ? ' al-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'al-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'al-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'al-viz__log', '▶ PLAY를 눌러 삽입 동작을 확인하세요.');
    root.appendChild(logEl);

    var controls = el('div', 'al-viz__controls');
    var btnPlay  = el('button', 'al-viz__btn al-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'al-viz__btn', '▶| STEP');
    var btnReset = el('button', 'al-viz__btn', '↺ RESET');
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

    /* ===================== resize: FIX 4 콘텐츠 높이 계산 ===================== */
    function calcContentHeight(W) {
        var mob = W < 600;
        if (mode === 'array') {
            var cellH = mob ? 72 : 88;
            var tblH  = mob ? 28 * 4 + 4 : 34 * 4 + 4;
            return (mob ? 20 : 28)
                 + (mob ? 44 : 54)
                 + cellH
                 + (mob ? 28 : 32)
                 + (mob ? 16 : 24)
                 + tblH
                 + (mob ? 16 : 24);
        } else {
            var nodeH = mob ? 64 : 80;
            var tblH  = mob ? 28 * 4 + 4 : 34 * 4 + 4;
            return (mob ? 20 : 28)
                 + (mob ? 36 : 44)
                 + nodeH
                 + nodeH + (mob ? 52 : 62)
                 + tblH
                 + (mob ? 20 : 28);
        }
    }

    function resize() {
        var w   = canvasWrap.offsetWidth || 320;
        var h   = calcContentHeight(w);
        canvasWrap.style.minHeight = h + 'px';
        canvasWrap.style.height    = h + 'px';
        canvas.width  = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    var P = window.CsFlow.getP();

    /* ===================== 시나리오 ===================== */
    var ARRAY_STEPS = [
        {
            log: '초기 상태. 크기 5인 배열 [10, 30, 40, 50, _]이 연속된 메모리에 저장되어 있습니다. 인덱스로 O(1) 임의 접근이 가능합니다.',
            cells: [
                { val: '10', addr: '0x100', state: 'normal' },
                { val: '30', addr: '0x104', state: 'normal' },
                { val: '40', addr: '0x108', state: 'normal' },
                { val: '50', addr: '0x10C', state: 'normal' },
                { val: '_',  addr: '0x110', state: 'empty'  },
            ],
            insertIdx: -1, arrowIdx: -1,
        },
        {
            log: 'Step 1 — 삽입 위치 탐색. 인덱스 2를 인덱스 계산으로 즉시 찾습니다. 배열의 임의 접근 — O(1).',
            cells: [
                { val: '10', addr: '0x100', state: 'normal' },
                { val: '30', addr: '0x104', state: 'normal' },
                { val: '40', addr: '0x108', state: 'target' },
                { val: '50', addr: '0x10C', state: 'normal' },
                { val: '_',  addr: '0x110', state: 'empty'  },
            ],
            insertIdx: 2, arrowIdx: -1,
        },
        {
            log: 'Step 2 — 원소 이동 (인덱스 4 ← 3). 삽입 공간 확보를 위해 뒤에서부터 한 칸씩 오른쪽으로 이동합니다.',
            cells: [
                { val: '10', addr: '0x100', state: 'normal'  },
                { val: '30', addr: '0x104', state: 'normal'  },
                { val: '40', addr: '0x108', state: 'target'  },
                { val: '50', addr: '0x10C', state: 'moving'  },
                { val: '50', addr: '0x110', state: 'shifted' },
            ],
            insertIdx: 2, arrowIdx: 3,
        },
        {
            log: 'Step 3 — 원소 이동 (인덱스 3 ← 2). 왼쪽 원소를 계속 밀어냅니다. 최악의 경우 n개 이동 — O(n).',
            cells: [
                { val: '10', addr: '0x100', state: 'normal'  },
                { val: '30', addr: '0x104', state: 'normal'  },
                { val: '40', addr: '0x108', state: 'moving'  },
                { val: '40', addr: '0x10C', state: 'shifted' },
                { val: '50', addr: '0x110', state: 'shifted' },
            ],
            insertIdx: 2, arrowIdx: 2,
        },
        {
            log: 'Step 4 — 삽입 완료. 인덱스 2에 20을 씁니다. 이동 O(n) + 쓰기 O(1) = 전체 O(n). 이동 횟수: 2회.',
            cells: [
                { val: '10', addr: '0x100', state: 'normal'   },
                { val: '30', addr: '0x104', state: 'normal'   },
                { val: '20', addr: '0x108', state: 'inserted' },
                { val: '40', addr: '0x10C', state: 'shifted'  },
                { val: '50', addr: '0x110', state: 'shifted'  },
            ],
            insertIdx: -1, arrowIdx: -1, done: true,
        },
    ];

    var LINKED_STEPS = [
        {
            log: '초기 상태. 10 → 30 → 40 → 50 → null. 각 노드는 힙 메모리에 분산 저장되며 next 포인터로 연결됩니다.',
            nodes: [
                { val: '10', addr: '0xA00', next: '0xB00', state: 'normal' },
                { val: '30', addr: '0xB00', next: '0xC00', state: 'normal' },
                { val: '40', addr: '0xC00', next: '0xD00', state: 'normal' },
                { val: '50', addr: '0xD00', next: 'null',  state: 'normal' },
            ],
            newNode: null, headArrow: true,
        },
        {
            log: 'Step 1 — 삽입 위치 탐색. head부터 순차 탐색합니다. 10 확인 → 목표 아님. 탐색 비용 — O(n).',
            nodes: [
                { val: '10', addr: '0xA00', next: '0xB00', state: 'visited' },
                { val: '30', addr: '0xB00', next: '0xC00', state: 'normal'  },
                { val: '40', addr: '0xC00', next: '0xD00', state: 'normal'  },
                { val: '50', addr: '0xD00', next: 'null',  state: 'normal'  },
            ],
            newNode: null, headArrow: true,
        },
        {
            log: 'Step 2 — 삽입 위치 발견. 0xB00(값: 30)을 찾았습니다. 이 노드의 next(0xC00)가 새 노드의 next가 됩니다.',
            nodes: [
                { val: '10', addr: '0xA00', next: '0xB00', state: 'visited' },
                { val: '30', addr: '0xB00', next: '0xC00', state: 'target'  },
                { val: '40', addr: '0xC00', next: '0xD00', state: 'normal'  },
                { val: '50', addr: '0xD00', next: 'null',  state: 'normal'  },
            ],
            newNode: null, headArrow: true,
        },
        {
            log: 'Step 3 — 새 노드 생성. 힙에 노드(val:20, addr:0xE00)를 할당하고 next를 0xC00으로 설정합니다.',
            nodes: [
                { val: '10', addr: '0xA00', next: '0xB00', state: 'visited' },
                { val: '30', addr: '0xB00', next: '0xC00', state: 'target'  },
                { val: '40', addr: '0xC00', next: '0xD00', state: 'normal'  },
                { val: '50', addr: '0xD00', next: 'null',  state: 'normal'  },
            ],
            newNode: { val: '20', addr: '0xE00', next: '0xC00', state: 'new' },
            headArrow: true,
        },
        {
            log: 'Step 4 — 포인터 연결 완료. 0xB00.next = 0xE00. 포인터 2번 교환으로 삽입 완료 — O(1). 원소 이동 없음.',
            nodes: [
                { val: '10', addr: '0xA00', next: '0xB00', state: 'normal'   },
                { val: '30', addr: '0xB00', next: '0xE00', state: 'normal'   },
                { val: '20', addr: '0xE00', next: '0xC00', state: 'inserted' },
                { val: '40', addr: '0xC00', next: '0xD00', state: 'normal'   },
                { val: '50', addr: '0xD00', next: 'null',  state: 'normal'   },
            ],
            newNode: null, headArrow: true, done: true,
        },
    ];

    /* ===================== 상태 변수 ===================== */
    var mode     = 'array';
    var stepIdx  = -1;
    var running  = false;
    var timer    = null;
    var rafId    = null;
    var speed    = 1800;
    var animProg = 1;
    var animDir  = 'none';

    function currentSteps() { return mode === 'array' ? ARRAY_STEPS : LINKED_STEPS; }

    /* ===================== 헬퍼 ===================== */
    function rr(x, y, w, h, r, fill, stroke, lw) {
        if (w <= 0 || h <= 0) return;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x+w, y, x+w, y+h, r); ctx.arcTo(x+w, y+h, x, y+h, r);
        ctx.arcTo(x, y+h, x, y, r);     ctx.arcTo(x, y, x+w, y, r);
        ctx.closePath();
        if (fill   && fill   !== 'none') { ctx.fillStyle   = fill;   ctx.fill();   }
        if (stroke && stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
    }

    function tx(str, x, y, sz, color, align, bold) {
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    function arrowLine(x1, y1, x2, y2, col, lw) {
        ctx.beginPath();
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.strokeStyle = col; ctx.lineWidth = lw || 2;
        ctx.setLineDash([]); ctx.stroke();
        var angle = Math.atan2(y2 - y1, x2 - x1);
        var hs = 8;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - hs * Math.cos(angle - 0.4), y2 - hs * Math.sin(angle - 0.4));
        ctx.lineTo(x2 - hs * Math.cos(angle + 0.4), y2 - hs * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
    }

    function isLight() {
        return document.documentElement.getAttribute('data-theme') === 'light';
    }

    function stateColor(state) {
        if (state === 'target')   return P.yellow;
        if (state === 'moving')   return P.orange;
        if (state === 'shifted')  return P.teal;
        if (state === 'inserted') return P.green;
        if (state === 'new')      return P.green;
        if (state === 'visited')  return P.purple;
        if (state === 'empty')    return P.muted;
        return P.text;
    }

    /* ===================== 레이아웃 ===================== */
    function buildLayout() {
        var W   = GW(), H = GH();
        var mob = W < 600;
        var pad = mob ? 16 : 40;
        return { W: W, H: H, mob: mob, pad: pad };
    }

    /* ===================== 배열 드로우 ===================== */
    function drawArray(L, step) {
        if (!step || !step.cells) return;
        var cells = step.cells;
        var n     = cells.length;
        var W     = L.W;
        var mob   = L.mob;
        var pad   = L.pad;

        var fVal  = mob ? 18 : 24;
        var fAddr = mob ? 10 : 12;
        var fLbl  = mob ? 11 : 13;

        var gap   = mob ? 5 : 10;
        var avail = W - pad * 2 - gap * (n - 1);
        var cellW = Math.floor(avail / n);
        var cellH = mob ? 72 : 88;
        var totalW = n * cellW + (n - 1) * gap;
        var startX = (W - totalW) / 2;

        var arrowAreaH = mob ? 40 : 50;
        var topPad     = mob ? 20 : 28;
        var memLblY    = topPad;
        var idxLblY    = memLblY + (mob ? 18 : 22);
        var cellTopY   = idxLblY + arrowAreaH;
        var baseY      = cellTopY + cellH / 2;

        tx('MEMORY  (연속 주소)', W / 2, memLblY, fLbl, P.muted, 'center', false);

        rr(startX - 6, cellTopY - 2, totalW + 12, cellH + 4, 8,
           'none', P.border + '55', 1);

        for (var i = 0; i < n; i++) {
            var cx = startX + i * (cellW + gap) + cellW / 2;
            tx('[' + i + ']', cx, idxLblY, fLbl, P.muted, 'center', false);
        }

        if (step.arrowIdx >= 0) {
            var ai   = step.arrowIdx;
            var ax   = startX + ai * (cellW + gap) + cellW / 2;
            var arTxtY = idxLblY + (mob ? 14 : 16);
            var arBotY = cellTopY - 4;
            var arTopY = arTxtY + (mob ? 12 : 14);
            tx('이동', ax, arTxtY, fLbl, P.orange, 'center', true);
            arrowLine(ax, arTopY, ax, arBotY, P.orange, 2.5);
        }

        for (var i = 0; i < n; i++) {
            var cell  = cells[i];
            var col   = stateColor(cell.state);
            var cellX = startX + i * (cellW + gap);

            var offX = 0;
            if (animDir === 'shift' && animProg < 1 && cell.state === 'moving') {
                offX = (cellW + gap) * animProg;
            }

            rr(cellX + offX, cellTopY, cellW, cellH, 6, 'none', col + 'dd', 2);

            tx(cell.val,  cellX + offX + cellW / 2, cellTopY + cellH * 0.38, fVal,  col, 'center', true);
            tx(cell.addr, cellX + offX + cellW / 2, cellTopY + cellH * 0.72, fAddr, P.muted, 'center', false);
        }

        if (step.insertIdx >= 0) {
            var ix = startX + step.insertIdx * (cellW + gap) + cellW / 2;
            var iy = cellTopY + cellH + (mob ? 18 : 22);
            tx('← 삽입 위치', ix, iy, fLbl, P.yellow, 'center', false);
        }

        var tblTop = cellTopY + cellH + (mob ? 46 : 54);
        drawTable(L, 'array', tblTop);
    }

    /* ===================== 연결 리스트 드로우 ===================== */
    function drawLinked(L, step) {
        if (!step || !step.nodes) return;
        var nodes = step.nodes;
        var n     = nodes.length;
        var W     = L.W;
        var mob   = L.mob;
        var pad   = L.pad;

        var fVal  = mob ? 16 : 22;
        var fAddr = mob ? 8   : 11;
        var fLbl  = mob ? 11 : 13;
        var fNext = mob ? 7   : 10;

        var nodeH  = mob ? 64 : 80;
        var nullW  = mob ? 36 : 50;
        var arrW   = mob ? 18 : 28;
        var maxN   = 5;
        var avail  = W - pad * 2 - nullW - arrW * maxN;
        var nodeW  = Math.max(mob ? 50 : 70, Math.floor(avail / maxN));
        var testW  = maxN * nodeW + (maxN - 1) * arrW + nullW;
        if (testW > W - pad * 2) {
            nodeW = Math.floor((W - pad * 2 - (maxN - 1) * arrW - nullW) / maxN);
        }

        var topPad = mob ? 20 : 28;
        var headLblY  = topPad + (mob ? 12 : 14);
        var baseY     = headLblY + (mob ? 42 : 52);
        var startX    = pad;

        var headX = startX + nodeW / 2;
        if (step.headArrow) {
            tx('HEAD', headX, headLblY, fLbl + 1, P.purple, 'center', true);
            arrowLine(headX, headLblY + (mob ? 10 : 12), headX, baseY - nodeH / 2 - 3, P.purple, 2);
        }

        if (step.newNode) {
            var nn    = step.newNode;
            var nnCol = stateColor(nn.state);
            var nnX   = startX + nodeW + arrW;
            var nnY   = baseY + nodeH / 2 + (mob ? 22 : 30);
            var alpha = animDir === 'nodeappear' ? animProg : 1;
            var nnA   = Math.round(alpha * 255).toString(16).padStart(2, '0');

            rr(nnX, nnY, nodeW, nodeH, 6, 'none', nnCol + nnA, 2);

            var divX = nnX + Math.round(nodeW * 0.62);
            ctx.beginPath();
            ctx.moveTo(divX, nnY + 5);
            ctx.lineTo(divX, nnY + nodeH - 5);
            ctx.strokeStyle = nnCol + nnA; ctx.lineWidth = 1; ctx.stroke();

            tx(nn.val,  nnX + nodeW * 0.29, nnY + nodeH * 0.36, fVal,  nnCol, 'center', true);
            tx(nn.addr, nnX + nodeW * 0.50, nnY + nodeH * 0.70, fAddr, P.muted, 'center', false);
            var nnNextDisp = (mob && nn.next.length > 4) ? nn.next.replace('0x', '') : nn.next;
            tx(nnNextDisp, nnX + nodeW * 0.81, nnY + nodeH * 0.50, fNext, nnCol + nnA, 'center', false);
            tx('NEW NODE', nnX + nodeW / 2, nnY - (mob ? 13 : 16), fLbl, nnCol, 'center', true);
        }

        for (var i = 0; i < n; i++) {
            var nd  = nodes[i];
            var col = stateColor(nd.state);
            var nx  = startX + i * (nodeW + arrW);
            var ny  = baseY - nodeH / 2;

            rr(nx, ny, nodeW, nodeH, 6, 'none', col + 'dd', 2);

            var divX = nx + Math.round(nodeW * 0.62);
            ctx.beginPath();
            ctx.moveTo(divX, ny + 5);
            ctx.lineTo(divX, ny + nodeH - 5);
            ctx.strokeStyle = col + '66'; ctx.lineWidth = 1; ctx.stroke();

            tx(nd.val,  nx + nodeW * 0.29, baseY - nodeH * 0.14, fVal,  col, 'center', true);
            tx(nd.addr, nx + nodeW * 0.50, baseY + nodeH * 0.28, fAddr, P.muted, 'center', false);
            var nxt = nd.next === 'null' ? 'null' : nd.next;
            var nxtDisp = (mob && nxt.length > 4) ? nxt.replace('0x', '') : nxt;
            tx(nxtDisp, nx + nodeW * 0.81, baseY, fNext, col + 'bb', 'center', false);

            if (nd.next !== 'null' && i < n - 1) {
                arrowLine(nx + nodeW + 3, baseY, nx + nodeW + arrW - 3, baseY, col + 'bb', 2);
            } else if (nd.next === 'null') {
                var nxRight = nx + nodeW + 4;
                if (nxRight + nullW <= W - 2) {
                    tx('→ null', nxRight, baseY, fNext + 1, P.muted, 'left', false);
                } else {
                    tx('→ null', nx + nodeW / 2, ny + nodeH + 13, fNext, P.muted, 'center', false);
                }
            }
        }

        var hasNew = step.newNode !== null && step.newNode !== undefined;
        var tblTop = baseY + nodeH / 2
            + (hasNew ? nodeH + (mob ? 52 : 62) : (mob ? 24 : 32));
        drawTable(L, 'linked', tblTop);
    }

    /* ===================== 복잡도 표 ===================== */
    function drawTable(L, activeMode, topY) {
        var W   = L.W;
        var mob = L.mob;
        var fHead = mob ? 11 : 13;
        var fBody = mob ? 11 : 13;
        var rowH  = mob ? 28 : 34;

        var rows = [
            ['연산',      'Array',   'Linked List'],
            ['임의 접근', 'O(1) ✓',  'O(n)'],
            ['맨 앞 삽입', 'O(n)',   'O(1) ✓'],
            ['중간 삽입', 'O(n)',    'O(1) *'],
        ];

        var panW = mob ? Math.min(W - 32, 380) : Math.min(480, W - 80);
        var panH = rows.length * rowH + 4;
        var panX = (W - panW) / 2;
        var panY = topY;
        var colW = panW / 3;

        rr(panX, panY, panW, panH, 6, 'none', P.border + '66', 1);

        var hiC = activeMode === 'array' ? 1 : 2;
        rr(panX + hiC * colW, panY, colW, panH, 0,
           isLight() ? P.green + '18' : P.green + '12', 'none', 0);

        for (var r = 0; r < rows.length; r++) {
            var cy = panY + r * rowH + rowH / 2 + 2;
            for (var c = 0; c < 3; c++) {
                var cx       = panX + c * colW + colW / 2;
                var txt      = rows[r][c];
                var isHead   = r === 0;
                var isActive = (c === 1 && activeMode === 'array') || (c === 2 && activeMode === 'linked');
                var hasCheck = txt.indexOf('✓') >= 0;
                var hasAster = txt.indexOf('*') >= 0;

                var color;
                if (isHead) {
                    color = P.text;
                } else if (isActive && hasCheck) {
                    color = P.green;
                } else if (isActive) {
                    color = P.text;
                } else if (hasCheck) {
                    color = P.green + 'aa';
                } else {
                    color = P.muted;
                }

                tx(txt, cx, cy, isHead ? fHead : fBody, color, 'center',
                   isHead || hasCheck || hasAster);
            }

            ctx.beginPath();
            ctx.moveTo(panX + 6, panY + (r + 1) * rowH + 2);
            ctx.lineTo(panX + panW - 6, panY + (r + 1) * rowH + 2);
            ctx.strokeStyle = P.border + '55'; ctx.lineWidth = 1; ctx.stroke();
        }

        for (var c = 1; c < 3; c++) {
            ctx.beginPath();
            ctx.moveTo(panX + c * colW, panY + 4);
            ctx.lineTo(panX + c * colW, panY + panH - 4);
            ctx.strokeStyle = P.border + '55'; ctx.lineWidth = 1; ctx.stroke();
        }
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        var L     = buildLayout();
        var steps = currentSteps();
        var step  = stepIdx >= 0 ? steps[stepIdx] : steps[0];
        if (mode === 'array') drawArray(L, step);
        else drawLinked(L, step);
    }

    /* ===================== 애니메이션 ===================== */
    function getAnimDir(idx) {
        var steps = currentSteps();
        var step  = steps[idx];
        if (!step) return 'none';
        if (mode === 'array') {
            if (step.arrowIdx >= 0) return 'shift';
            if (step.cells && step.cells.some(function (c) { return c.state === 'inserted'; })) return 'insert';
        } else {
            if (step.newNode) return 'nodeappear';
            if (step.nodes && step.nodes.some(function (nd) { return nd.state === 'inserted'; })) return 'ptrchange';
        }
        return 'none';
    }

    function animateStep(onDone) {
        animDir  = getAnimDir(stepIdx);
        animProg = 0;
        if (rafId) cancelAnimationFrame(rafId);
        var s = 0.007 * (1800 / speed);
        (function tick() {
            animProg = Math.min(1, animProg + s);
            draw();
            if (animProg < 1) {
                rafId = requestAnimationFrame(tick);
            } else {
                animDir = 'none'; draw();
                if (onDone) onDone();
            }
        })();
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) {
        root.querySelectorAll('.al-viz__speed-btn').forEach(function (b) { b.disabled = v; });
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
                    timer = setTimeout(tick, speed);
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
        running = false; stepIdx = -1; animProg = 1; animDir = 'none';
        logEl.textContent = mode === 'array'
            ? '▶ PLAY를 눌러 배열 삽입 과정을 확인하세요.'
            : '▶ PLAY를 눌러 연결 리스트 삽입 과정을 확인하세요.';
        btnPlay.disabled = false; btnStep.disabled = false;
        setSpeedDisabled(false);
        resize();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        root.querySelectorAll('.al-viz__speed-btn').forEach(function (b) {
            b.classList.remove('al-viz__speed-btn--active');
        });
        btn.classList.add('al-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeArray.classList.toggle('al-viz__mode-btn--active',  m === 'array');
        modeLinked.classList.toggle('al-viz__mode-btn--active', m === 'linked');
        vizReset();
    }

    /* ===================== 라이프사이클 ===================== */
    window.CsFlow.createVizLifecycle({
        canvas: canvas, canvasWrap: canvasWrap, resize: resize, draw: draw,
        getState : function () { return { rafId: rafId, timer: timer, running: running }; },
        setState : function (s) { rafId = s.rafId; timer = s.timer; running = s.running; },
        onPause  : function () { setSpeedDisabled(false); },
        getMouseCtx: function () {
            return { GW: GW, GH: GH, mousePos: { x: -1, y: -1 }, tooltipHits: [],
                     hoveredKey: function () { return null; }, setHoveredKey: function () {}, draw: draw };
        },
    });

    setTimeout(resize, 60);
})();