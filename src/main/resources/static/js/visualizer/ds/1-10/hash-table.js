/**
 * 해시 테이블 시각화
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
    var root    = el('div', 'ht-viz');
    var toolbar = el('div', 'ht-viz__toolbar');
    var tbLeft  = el('div', 'ht-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'ht-viz__title', 'Hash Table'));

    var modeWrap  = el('div', 'ht-viz__mode');
    var modeChain = el('button', 'ht-viz__mode-btn ht-viz__mode-btn--active', 'Chaining');
    var modeOpen  = el('button', 'ht-viz__mode-btn', 'Open Addressing');
    modeChain.addEventListener('click', function () { if (!running) switchMode('chain'); });
    modeOpen.addEventListener('click',  function () { if (!running) switchMode('open');  });
    modeWrap.appendChild(modeChain);
    modeWrap.appendChild(modeOpen);
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'ht-viz__speed');
    speedWrap.appendChild(el('span', 'ht-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1800], ['2x', 900], ['3x', 600]].forEach(function (pair, i) {
        var b = el('button', 'ht-viz__speed-btn' + (i === 0 ? ' ht-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'ht-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'ht-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'ht-viz__log', '▶ PLAY를 눌러 해시 테이블 동작을 확인하세요.');
    root.appendChild(logEl);

    var controls = el('div', 'ht-viz__controls');
    var btnPlay  = el('button', 'ht-viz__btn ht-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'ht-viz__btn', '▶| STEP');
    var btnReset = el('button', 'ht-viz__btn', '↺ RESET');
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

    /* ===================== 상수 ===================== */
    var CAP = 7;

    /* ===================== 체이닝 시나리오 ===================== */
    var CHAIN_STEPS = [
        {
            log: '초기 상태. 버킷 7개 (용량 = 7). 해시 함수: h(k) = k % 7. 모든 버킷이 비어 있습니다.',
            buckets: [[], [], [], [], [], [], []],
            hashKey: null, hashIdx: -1, phase: 'idle',
        },
        {
            log: 'INSERT 10  →  h(10) = 10 % 7 = 3. 버킷 [3] 비어 있음 — 충돌 없이 바로 삽입. O(1).',
            buckets: [[], [], [], [{key:10, st:'new'}], [], [], []],
            hashKey: 10, hashIdx: 3, phase: 'inserted',
        },
        {
            log: 'INSERT 22  →  h(22) = 22 % 7 = 1. 버킷 [1] 비어 있음 — 충돌 없이 바로 삽입.',
            buckets: [[], [{key:22, st:'new'}], [], [{key:10, st:'exist'}], [], [], []],
            hashKey: 22, hashIdx: 1, phase: 'inserted',
        },
        {
            log: 'INSERT 31  →  h(31) = 31 % 7 = 3. 버킷 [3]에 이미 10이 있음 — 충돌! 체이닝: 연결 리스트 뒤에 추가합니다.',
            buckets: [[], [{key:22, st:'exist'}], [], [{key:10, st:'exist'}, {key:31, st:'new'}], [], [], []],
            hashKey: 31, hashIdx: 3, phase: 'collision',
        },
        {
            log: 'INSERT 4   →  h(4) = 4 % 7 = 4. 버킷 [4] 비어 있음 — 충돌 없이 바로 삽입.',
            buckets: [[], [{key:22, st:'exist'}], [], [{key:10, st:'exist'}, {key:31, st:'exist'}], [{key:4, st:'new'}], [], []],
            hashKey: 4, hashIdx: 4, phase: 'inserted',
        },
        {
            log: 'INSERT 15  →  h(15) = 15 % 7 = 1. 버킷 [1]에 이미 22가 있음 — 충돌! 체이닝: 연결 리스트 뒤에 추가합니다.',
            buckets: [[], [{key:22, st:'exist'}, {key:15, st:'new'}], [], [{key:10, st:'exist'}, {key:31, st:'exist'}], [{key:4, st:'exist'}], [], []],
            hashKey: 15, hashIdx: 1, phase: 'collision',
        },
        {
            log: 'SEARCH 31  →  h(31) = 3. 버킷 [3] 체인 순회: 10 ≠ 31 → 다음 노드. 31 = 31 → 발견! 탐색 비용 O(k), k = 체인 길이.',
            buckets: [[], [{key:22, st:'exist'}, {key:15, st:'exist'}], [], [{key:10, st:'search'}, {key:31, st:'found'}], [{key:4, st:'exist'}], [], []],
            hashKey: 31, hashIdx: 3, phase: 'search',
        },
        {
            log: 'INSERT 28  →  h(28) = 28 % 7 = 0. 버킷 [0] 비어 있음 — 삽입. 부하율 = 6/7 ≈ 0.86. Java HashMap은 부하율 0.75 초과 시 2배 리사이징합니다 (데모는 용량 7을 쓰지만 실제 Java 용량은 2의 거듭제곱).',
            buckets: [[{key:28, st:'new'}], [{key:22, st:'exist'}, {key:15, st:'exist'}], [], [{key:10, st:'exist'}, {key:31, st:'exist'}], [{key:4, st:'exist'}], [], []],
            hashKey: 28, hashIdx: 0, phase: 'inserted',
        },
    ];

    /* ===================== 오픈 어드레싱 시나리오 ===================== */
    var OPEN_STEPS = [
        {
            log: '초기 상태. 슬롯 7개. Linear Probing: 충돌 시 (h(k) + i) % 7 순서로 빈 슬롯을 탐색합니다.',
            slots: [null, null, null, null, null, null, null],
            hashKey: null, hashIdx: -1, probeSeq: [], phase: 'idle',
        },
        {
            log: 'INSERT 10  →  h(10) = 3. 슬롯 [3] 비어 있음 — 바로 삽입.',
            slots: [null, null, null, {key:10, st:'new'}, null, null, null],
            hashKey: 10, hashIdx: 3, probeSeq: [3], phase: 'inserted',
        },
        {
            log: 'INSERT 22  →  h(22) = 1. 슬롯 [1] 비어 있음 — 바로 삽입.',
            slots: [null, {key:22, st:'new'}, null, {key:10, st:'exist'}, null, null, null],
            hashKey: 22, hashIdx: 1, probeSeq: [1], phase: 'inserted',
        },
        {
            log: 'INSERT 31  →  h(31) = 3. 슬롯 [3] 점유(10) — 충돌! [4] 탐색 → 비어 있음. 슬롯 [4]에 삽입.',
            slots: [null, {key:22, st:'exist'}, null, {key:10, st:'probe'}, {key:31, st:'new'}, null, null],
            hashKey: 31, hashIdx: 3, probeSeq: [3, 4], phase: 'collision',
        },
        {
            log: 'INSERT 4   →  h(4) = 4. 슬롯 [4] 점유(31) — 충돌! [5] 탐색 → 비어 있음. 슬롯 [5]에 삽입. 연속 점유(Clustering) 발생 중!',
            slots: [null, {key:22, st:'exist'}, null, {key:10, st:'exist'}, {key:31, st:'probe'}, {key:4, st:'new'}, null],
            hashKey: 4, hashIdx: 4, probeSeq: [4, 5], phase: 'collision',
        },
        {
            log: 'INSERT 15  →  h(15) = 1. 슬롯 [1] 점유(22) → [2] 비어 있음. 슬롯 [2]에 삽입. Clustering: 연속 점유로 탐색 길이가 늘어납니다.',
            slots: [null, {key:22, st:'probe'}, {key:15, st:'new'}, {key:10, st:'exist'}, {key:31, st:'exist'}, {key:4, st:'exist'}, null],
            hashKey: 15, hashIdx: 1, probeSeq: [1, 2], phase: 'collision',
        },
        {
            log: 'DELETE 31  →  h(31) = 3. 슬롯 [3→4] 탐색 → 슬롯 [4]에서 31 삭제. 단순 null 처리 시 탐색 체인이 끊깁니다. Tombstone(✝) 마커를 남겨 이후 탐색을 보존합니다.',
            slots: [null, {key:22, st:'exist'}, {key:15, st:'exist'}, {key:10, st:'exist'}, {key:'✝', st:'tomb'}, {key:4, st:'exist'}, null],
            hashKey: 31, hashIdx: 3, probeSeq: [3, 4], phase: 'delete',
        },
        {
            log: 'SEARCH 4   →  h(4) = 4. 슬롯 [4]: Tombstone ✝ — 건너뜀(탐색 계속). 슬롯 [5]: 4 발견! Tombstone 덕분에 체인이 끊기지 않았습니다.',
            slots: [null, {key:22, st:'exist'}, {key:15, st:'exist'}, {key:10, st:'exist'}, {key:'✝', st:'probe'}, {key:4, st:'found'}, null],
            hashKey: 4, hashIdx: 4, probeSeq: [4, 5], phase: 'search',
        },
    ];

    /* ===================== 상태 변수 ===================== */
    var mode     = 'chain';
    var stepIdx  = -1;
    var running  = false;
    var timer    = null;
    var rafId    = null;
    var speed    = 1800;
    var animProg = 1;

    function currentSteps() { return mode === 'chain' ? CHAIN_STEPS : OPEN_STEPS; }

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

    function arrowV(x, y1, y2, col, lw) {
        if (Math.abs(y2 - y1) < 4) return;
        var dir = y2 > y1 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(x, y1);
        ctx.lineTo(x, y2 - dir * 8);
        ctx.strokeStyle = col; ctx.lineWidth = lw || 1.5; ctx.setLineDash([]); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y2);
        ctx.lineTo(x - 5, y2 - dir * 9);
        ctx.lineTo(x + 5, y2 - dir * 9);
        ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
    }

    function arrowH(x1, y, x2, col, lw) {
        if (Math.abs(x2 - x1) < 4) return;
        var dir = x2 > x1 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2 - dir * 8, y);
        ctx.strokeStyle = col; ctx.lineWidth = lw || 1.5; ctx.setLineDash([]); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x2, y);
        ctx.lineTo(x2 - dir * 9, y - 5);
        ctx.lineTo(x2 - dir * 9, y + 5);
        ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
    }

    function arrowBend(x1, y1, x2, y2, col, lw) {
        var midY = (y1 + y2) / 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1, midY);
        ctx.lineTo(x2 - 8, midY);
        ctx.strokeStyle = col; ctx.lineWidth = lw || 1.5; ctx.setLineDash([]); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x2, midY);
        ctx.lineTo(x2 - 9, midY - 5);
        ctx.lineTo(x2 - 9, midY + 5);
        ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
    }

    function stateCol(st) {
        if (st === 'new')    return P.green;
        if (st === 'collision') return P.orange;
        if (st === 'probe')  return P.orange;
        if (st === 'found')  return P.green;
        if (st === 'search') return P.yellow;
        if (st === 'tomb')   return P.muted;
        if (st === 'exist')  return P.teal;
        return P.text;
    }

    /* ===================== 해시 함수 박스 ===================== */
    function drawHashBox(W, mob, hashKey, hashIdx, phase) {
        var topY  = mob ? 18 : 24;
        var boxW  = mob ? Math.min(240, W - 40) : 300;
        var boxH  = mob ? 38 : 48;
        var boxX  = (W - boxW) / 2;
        var fFunc = mob ? 10 : 12;
        var r6    = 6;

        var col = (phase === 'collision' || phase === 'delete') ? P.orange
                : (phase === 'inserted' || phase === 'search') ? P.green
                : P.purple;

        rr(boxX, topY, boxW, boxH, r6, col + '18', col + 'cc', 2);

        var formula = hashKey !== null && hashKey !== undefined
            ? 'h(' + hashKey + ')  =  ' + hashKey + ' % 7  =  ' + hashIdx
            : 'h(k)  =  k % 7';
        var bold = hashKey !== null && hashKey !== undefined;
        tx(formula, W / 2, topY + boxH / 2, fFunc + 1, bold ? col : P.muted, 'center', bold);

        return topY + boxH;
    }

    /* ===================== 범례 ===================== */
    function drawLegend(W, H, mob) {
        var items = [
            { col: P.green,  label: '삽입/발견' },
            { col: P.teal,   label: '기존 항목' },
            { col: P.orange, label: '충돌/탐색' },
            { col: P.muted,  label: 'Tombstone' },
        ];
        var fsz    = mob ? 10 : 12;
        var dotR   = mob ? 5  : 6;
        var dotGap = mob ? 6  : 8;
        var itemW  = mob ? 74 : 96;
        var totalW = itemW * items.length;
        var startX = (W - totalW) / 2;
        var ly     = H - (mob ? 14 : 16);

        items.forEach(function (item, i) {
            var itemLeft = startX + i * itemW;
            var dotCX    = itemLeft + dotR;
            var labelX   = dotCX + dotR + dotGap;

            ctx.beginPath();
            ctx.arc(dotCX, ly, dotR, 0, Math.PI * 2);
            ctx.fillStyle = item.col;
            ctx.fill();

            ctx.font = '500 ' + fsz + 'px "JetBrains Mono",monospace';
            ctx.fillStyle    = P.muted;
            ctx.textAlign    = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(item.label, labelX, ly);
        });
    }

    /* ===================== 체이닝 드로우 ===================== */
    function drawChain(W, H, mob, step) {
        if (!step) return;

        var fIdx  = mob ? 10 : 12;
        var fVal  = mob ? 13 : 16;
        var fSub  = mob ? 8  : 10;

        var cellH  = mob ? 38 : 48;
        var cellW  = mob ? 50 : 64;
        var nodeW  = mob ? 40 : 52;
        var nodeH  = mob ? 26 : 34;
        var arrowW = mob ? 16 : 22;
        var pad    = mob ? 14 : 24;

        var labelW  = mob ? 28 : 36;
        var bucketX = pad + labelW;

        var boxBot      = drawHashBox(W, mob, step.hashKey, step.hashIdx, step.phase);
        var arrowGapV   = mob ? 14 : 18;
        var bucketsTopY = boxBot + arrowGapV;

        if (step.hashIdx >= 0) {
            var aCol = (step.phase === 'collision' || step.phase === 'delete') ? P.orange
                     : (step.phase === 'inserted' || step.phase === 'search') ? P.green
                     : P.purple;

            var boxW2   = mob ? Math.min(240, W - 40) : 300;
            var boxX2   = (W - boxW2) / 2;
            var boxMidY = (mob ? 18 : 24) + (mob ? 38 : 48) / 2;
            var exitX   = boxX2 + boxW2 + (mob ? 12 : 18);
            var targetY = bucketsTopY + step.hashIdx * cellH + cellH / 2;

            var targetChain = step.buckets[step.hashIdx] || [];
            var entryX;
            if (targetChain.length <= 1) {
                entryX = bucketX + cellW;
            } else {
                var lastNodeStart = bucketX + cellW + arrowW + (targetChain.length - 2) * (nodeW + arrowW);
                entryX = lastNodeStart + nodeW;
            }

            ctx.beginPath();
            ctx.moveTo(boxX2 + boxW2, boxMidY);
            ctx.lineTo(exitX,          boxMidY);
            ctx.lineTo(exitX,          targetY);
            ctx.lineTo(entryX + 8,     targetY);
            ctx.strokeStyle = aCol + 'cc'; ctx.lineWidth = 1.5; ctx.setLineDash([]); ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(entryX, targetY);
            ctx.lineTo(entryX + 9, targetY - 5);
            ctx.lineTo(entryX + 9, targetY + 5);
            ctx.closePath();
            ctx.fillStyle = aCol + 'cc'; ctx.fill();
        }

        for (var i = 0; i < CAP; i++) {
            var by  = bucketsTopY + i * cellH;
            var bcy = by + cellH / 2;
            var isTarget = (i === step.hashIdx);
            var bCol = isTarget
                ? ((step.phase === 'collision' || step.phase === 'delete') ? P.orange
                   : (step.phase === 'inserted' || step.phase === 'search') ? P.green
                   : P.purple)
                : P.muted;

            tx('[' + i + ']', pad + labelW / 2, bcy, fIdx, isTarget ? bCol : P.muted + '99', 'center', isTarget);

            var chain = step.buckets[i] || [];

            var bx = bucketX;
            if (chain.length === 0) {
                rr(bx, by + (cellH - nodeH) / 2, cellW, nodeH, 4, 'none', bCol + '55', 1);
                tx('∅', bx + cellW / 2, bcy, fSub + 1, P.muted + '66', 'center', false);
            } else {
                var fc   = chain[0];
                var fcol = stateCol(fc.st);
                rr(bx, by + (cellH - nodeH) / 2, cellW, nodeH, 4, fcol + '18', fcol + 'cc', 1.5);
                tx(String(fc.key), bx + cellW / 2, bcy, fVal, fcol, 'center', true);

                var cx = bx + cellW + arrowW;
                for (var j = 1; j < chain.length; j++) {
                    var nc   = chain[j];
                    var ncol = stateCol(nc.st);
                    arrowH(cx - arrowW + 2, bcy, cx, ncol + 'cc', 1.5);
                    rr(cx, by + (cellH - nodeH) / 2, nodeW, nodeH, 4, ncol + '18', ncol + 'cc', 1.5);
                    tx(String(nc.key), cx + nodeW / 2, bcy, fVal, ncol, 'center', true);
                    cx += nodeW + arrowW;
                }
                tx('→ null', cx, bcy, fSub, P.muted + '66', 'left', false);
            }
        }

        var infoY = bucketsTopY + CAP * cellH + (mob ? 12 : 16);
        tx('평균 O(1)  ·  최악 O(n)  ·  Java: 체인 ≥ 8 이고 capacity ≥ 64 → Red-Black Tree 전환', W / 2, infoY, mob ? 10 : 12, P.muted + 'aa', 'center', false);

        drawLegend(W, H, mob);
    }

    /* ===================== 오픈 어드레싱 드로우 ===================== */
    function drawOpen(W, H, mob, step) {
        if (!step) return;

        var fVal  = mob ? 14 : 18;
        var fIdx  = mob ? 10 : 13;
        var fSub  = mob ? 10 : 12;

        var pad   = mob ? 12 : 28;

        var gapX   = mob ? 5 : 8;
        var slotW  = Math.floor((W - pad * 2 - gapX * (CAP - 1)) / CAP);
        var slotH  = mob ? 52 : 68;
        var slotR  = 6;
        var slotStartX = pad;

        var boxBot    = drawHashBox(W, mob, step.hashKey, step.hashIdx, step.phase);

        var idxY       = boxBot + (mob ? 18 : 24);
        var arrowZoneH = mob ? 22 : 28;
        var slotsTopY  = idxY + (mob ? 10 : 12) + arrowZoneH;

        var probeSeq = step.probeSeq || [];
        var probeMap = {};
        for (var pi = 0; pi < probeSeq.length; pi++) probeMap[probeSeq[pi]] = pi + 1;

        if (probeSeq.length > 0) {
            var firstIdx  = probeSeq[0];
            var arrowCX   = slotStartX + firstIdx * (slotW + gapX) + slotW / 2;
            var aCol0 = (step.phase === 'collision' || step.phase === 'delete') ? P.orange
                      : (step.phase === 'inserted' || step.phase === 'search') ? P.green
                      : P.purple;
            arrowV(arrowCX, idxY + (mob ? 12 : 14), slotsTopY, aCol0 + 'cc', 1.5);
        }

        for (var i = 0; i < CAP; i++) {
            var sx   = slotStartX + i * (slotW + gapX);
            var scx  = sx + slotW / 2;
            var scy  = slotsTopY + slotH / 2;
            var nd   = step.slots[i];

            var probeN   = probeMap[i];
            var isProbed = probeN !== undefined;

            var fillCol   = 'none';
            var strokeCol = P.muted + '44';
            var label     = '';
            var valCol    = P.muted;

            if (nd) {
                valCol    = stateCol(nd.st);
                fillCol   = valCol + '1a';
                strokeCol = valCol + 'cc';
                label     = String(nd.key);
            }

            tx(String(i), scx, idxY, fIdx, isProbed ? (nd ? stateCol(nd.st) : P.purple) : P.muted + '88', 'center', isProbed);

            rr(sx, slotsTopY, slotW, slotH, slotR, fillCol, strokeCol, isProbed ? 2 : 1);

            if (label) {
                tx(label, scx, scy, fVal, valCol, 'center', true);
            }

            if (isProbed) {
                var circR  = mob ? 10 : 13;
                var circCX = scx;
                var circCY = slotsTopY + slotH + (mob ? 16 : 20);
                var pCol   = (nd && nd.st === 'found') ? P.green
                           : (probeN === 1 && step.phase !== 'collision') ? P.purple
                           : P.orange;
                ctx.beginPath(); ctx.arc(circCX, circCY, circR, 0, Math.PI * 2);
                ctx.fillStyle = pCol + '28'; ctx.fill();
                ctx.strokeStyle = pCol + 'cc'; ctx.lineWidth = 1.5; ctx.stroke();
                tx(String(probeN), circCX, circCY, fIdx + 1, pCol, 'center', true);
            }
        }

        if (probeSeq.length > 1) {
            var circLineY = slotsTopY + slotH + (mob ? 16 : 20);
            var circR2    = mob ? 10 : 13;
            for (var k = 0; k < probeSeq.length - 1; k++) {
                var fI   = probeSeq[k];
                var tI   = probeSeq[k + 1];
                var fCX  = slotStartX + fI * (slotW + gapX) + slotW / 2;
                var tCX  = slotStartX + tI * (slotW + gapX) + slotW / 2;
                ctx.beginPath();
                ctx.moveTo(fCX + circR2 + 3, circLineY);
                ctx.lineTo(tCX - circR2 - 3, circLineY);
                ctx.strokeStyle = P.orange + '99'; ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
                ctx.beginPath();
                ctx.moveTo(tCX - circR2 - 3, circLineY);
                ctx.lineTo(tCX - circR2 - 10, circLineY - 4);
                ctx.lineTo(tCX - circR2 - 10, circLineY + 4);
                ctx.closePath();
                ctx.fillStyle = P.orange + '99'; ctx.fill();
            }
        }

        var infoY = slotsTopY + slotH + (mob ? 42 : 52);
        tx('Linear Probing: (h(k) + i) % 7  ·  Clustering 주의  ·  Tombstone(✝)으로 탐색 체인 보존', W / 2, infoY, fSub, P.muted + 'aa', 'center', false);

        drawLegend(W, H, mob);
    }

    /* ===================== resize ===================== */
    function calcH(W) {
        var mob = W < 600;
        var boxH  = mob ? 38 : 48;
        var topY  = mob ? 18 : 24;

        if (mode === 'chain') {
            var cellH   = mob ? 38 : 48;
            var arrowGV = mob ? 14 : 18;
            return topY + boxH + arrowGV + CAP * cellH + (mob ? 14 : 18) + (mob ? 26 : 30) + (mob ? 24 : 28);
        } else {
            var slotH    = mob ? 52 : 68;
            return topY + boxH
                 + (mob ? 18 : 24) + (mob ? 10 : 12) + (mob ? 22 : 28)
                 + slotH
                 + (mob ? 16 : 20) + (mob ? 20 : 26)
                 + (mob ? 26 : 32) + (mob ? 26 : 30)
                 + (mob ? 18 : 22);
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

        if (mode === 'chain') drawChain(W, H, mob, step);
        else                  drawOpen(W, H, mob, step);
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
                    timer = setTimeout(tick, speed * 0.7);
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
        logEl.textContent = '▶ PLAY를 눌러 해시 테이블 동작을 확인하세요.';
        setSpeedDisabled(false);
        resize();
    }

    function setSpeed(ms, btn) {
        speed = ms;
        speedBtns.forEach(function (b) { b.classList.remove('ht-viz__speed-btn--active'); });
        btn.classList.add('ht-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeChain.classList.toggle('ht-viz__mode-btn--active', m === 'chain');
        modeOpen.classList.toggle('ht-viz__mode-btn--active',  m === 'open');
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