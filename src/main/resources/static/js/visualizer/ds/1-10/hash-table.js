/**
 * 해시 테이블 시각화 시각화
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

    var modeWrap = el('div', 'ht-viz__mode');
    var modeDefs = [
        { key: 'chain', label: 'Chaining' },
        { key: 'open', label: 'Open Addressing' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'ht-viz__mode-btn' + (i === 0 ? ' ht-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'ht-viz__speed');
    speedWrap.appendChild(el('span', 'ht-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
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

    var logEl = el('div', 'ht-viz__log', '');
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
    function GW() { return canvas.width / dpr; }
    function GH() { return canvas.height / dpr; }

    var P = window.CsFlow.getP();

    /* ===================== 상태 ===================== */
    var mode    = 'chain';
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

    /* ===================== 상태 ===================== */
    function currentSteps() {
        return mode === 'open' ? OPEN_STEPS : CHAIN_STEPS;
    }
    function defaultLog() {
        return '▶ PLAY를 눌러 해시 테이블 동작을 확인하세요.';
    }

    /* ===================== 문구 ===================== */
    var hsChCap = {
        idle: '키를 넣으면 h(k) = k % 7 로 버킷 번호를 계산하고, 그 버킷의 체인에 연결합니다.',
        inserted: '빈 버킷이면 노드를 바로 놓습니다. 충돌이 없으니 O(1)입니다.',
        collision: '같은 버킷에 이미 키가 있으면 충돌. 체이닝은 연결 리스트 끝에 새 노드를 붙입니다.',
        search: '버킷 체인을 처음부터 따라가며 키를 비교합니다. 같으면 발견, 다르면 다음 노드로 갑니다.'
    };
    var hsOpCap = {
        idle: '키를 넣으면 h(k)로 시작 슬롯을 정하고, 비어 있는 칸을 찾을 때까지 (h(k) + i) % 7 순서로 옮겨 갑니다.',
        inserted: '시작 슬롯이 비어 있으면 바로 저장합니다.',
        collision: '시작 슬롯이 차 있으면 다음 칸을 차례로 탐사합니다. 빈 칸을 찾으면 거기에 저장합니다.',
        delete: '찾은 키의 칸을 null로 비우면 뒤쪽 탐색 경로가 끊깁니다. 그래서 묘비(✝)를 남깁니다.',
        search: '묘비 칸은 건너뛰고 탐색을 이어 갑니다. 같은 키를 찾으면 발견입니다.'
    };
    var hsChLegend = ['삽입/발견', '기존 항목', '충돌', '탐색'];
    var hsOpLegend = ['삽입/발견', '기존 항목', '충돌/탐사', 'Tombstone'];
    var hsInfo = {
        chain: '평균 O(1)  ·  최악 O(n)  ·  Java: 체인 ≥ 8 이고 capacity ≥ 64 → Red-Black Tree 전환',
        open: 'Linear Probing: (h(k) + i) % 7  ·  Clustering 주의  ·  Tombstone(✝)으로 탐색 체인 보존'
    };

    /* ===================== 레이아웃 ===================== */
    var hsLayMemo = {};
    function ez(q) {
        q = clamp01(q);
        return q * q * (3 - 2 * q);
    }
    function hsFs(mob) {
        return { body: mob ? 11.5 : 13, small: mob ? 11 : 12 };
    }
    function hsTw(str, fs) {
        var n = 0;
        var i;
        for (i = 0; i < str.length; i++) n += str.charCodeAt(i) > 0x2000 ? fs : fs * 0.6;
        return n;
    }
    function hsCommon(w, mob, S) {
        var boxW = mob ? Math.min(200, w - 80) : Math.min(320, w - 240);
        return { S: S, mob: mob, boxW: boxW, boxH: mob ? 40 : 46, boxX: (w - boxW) / 2, boxTop: mob ? 30 : 34 };
    }
    function hsMaxLines(obj, w, S) {
        var mx = 1;
        Object.keys(obj).forEach(function (k) {
            var n = lines(obj[k], w - 8, S.body).length;
            if (n > mx) mx = n;
        });
        return mx;
    }
    function hsLegendRows(labels, w, S) {
        var rows = [];
        var cur = [];
        var curW = 0;
        labels.forEach(function (lb, i) {
            var iw = 16 + hsTw(lb, S.small) + 14;
            if (cur.length && curW + iw > w) {
                rows.push(cur);
                cur = [];
                curW = 0;
            }
            cur.push(i);
            curW += iw;
        });
        if (cur.length) rows.push(cur);
        return rows;
    }
    function hsTail(L, w, capLines, info, labels) {
        var S = L.S;
        L.capTop = L.rowsBot + (L.mob ? 8 : 10);
        L.capH = capLines * (S.body + 6);
        L.legTop = L.capTop + L.capH + (L.mob ? 6 : 8);
        L.legH = hsLegendRows(labels, w, S).length * (S.small + 10);
        L.infoTop = L.legTop + L.legH + (L.mob ? 4 : 6);
        L.infoLines = lines(info, w - 8, S.small).length;
        L.total = L.infoTop + L.infoLines * (S.small + 5) + 4;
        L.labels = labels;
        return L;
    }
    function hsChainLayout(w, mob) {
        var L = hsCommon(w, mob, hsFs(mob));
        L.labelW = mob ? 28 : 36;
        L.railX = L.labelW + (mob ? 4 : 6);
        L.bucketX = L.labelW + (mob ? 8 : 10);
        L.nodeW = mob ? 40 : 52;
        L.nodeH = mob ? 22 : 30;
        L.arrowW = mob ? 14 : 20;
        L.rowH = mob ? 32 : 44;
        L.rowsTop = L.boxTop + L.boxH + (mob ? 18 : 22);
        L.rowsBot = L.rowsTop + CAP * L.rowH;
        return hsTail(L, w, hsMaxLines(hsChCap, w, L.S), hsInfo.chain, hsChLegend);
    }
    function hsOpenLayout(w, mob) {
        var L = hsCommon(w, mob, hsFs(mob));
        L.railY = L.boxTop + L.boxH + (mob ? 16 : 20);
        L.slotsTop = L.railY + (mob ? 20 : 24);
        L.slotGap = mob ? 4 : 8;
        L.slotW = Math.min(mob ? 40 : 96, Math.floor((w - L.slotGap * (CAP - 1)) / CAP));
        L.slotsTotal = L.slotW * CAP + L.slotGap * (CAP - 1);
        L.slotX0 = (w - L.slotsTotal) / 2;
        L.slotH = mob ? 40 : 52;
        L.idxOff = mob ? 11 : 13;
        L.rowsBot = L.slotsTop + L.slotH + L.idxOff + L.S.small;
        return hsTail(L, w, hsMaxLines(hsOpCap, w, L.S), hsInfo.open, hsOpLegend);
    }
    function layout(w, mob) {
        var key = mode + '|' + Math.round(w) + (mob ? 'm' : 'd');
        if (!hsLayMemo[key]) hsLayMemo[key] = mode === 'open' ? hsOpenLayout(w, mob) : hsChainLayout(w, mob);
        return hsLayMemo[key];
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 그리기 헬퍼 ===================== */
    function hsPhaseCol(phase) {
        if (phase === 'collision' || phase === 'delete') return P.orange;
        if (phase === 'inserted') return P.green;
        if (phase === 'search') return P.yellow;
        return P.purple;
    }
    function hsStCol(st) {
        if (st === 'new' || st === 'found') return P.green;
        if (st === 'probe' || st === 'collision') return P.orange;
        if (st === 'search') return P.yellow;
        if (st === 'tomb') return P.sub;
        if (st === 'exist') return P.teal;
        return P.text;
    }
    function hsAlong(pts, q) {
        var segs = [];
        var total = 0;
        var i;
        for (i = 1; i < pts.length; i++) {
            segs.push(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
            total += segs[i - 1];
        }
        var target = clamp01(q) * total;
        for (i = 1; i < pts.length; i++) {
            var len = segs[i - 1];
            if (target <= len || i === pts.length - 1) {
                var r = len > 0 ? clamp01(target / len) : 1;
                return [lerp(pts[i - 1][0], pts[i][0], r), lerp(pts[i - 1][1], pts[i][1], r)];
            }
            target -= len;
        }
        return pts[pts.length - 1];
    }
    function hsBox(x0, top, L, now) {
        var col = hsPhaseCol(now.phase);
        var hasKey = now.hashKey !== null && now.hashKey !== undefined;
        var bx = x0 + L.boxX;
        var by = top + L.boxTop;
        rr(bx, by, L.boxW, L.boxH, 6, hasKey ? col + '18' : 'none', hasKey ? col + 'cc' : P.sub + '66', 2);
        var str = hasKey ? 'h(' + now.hashKey + ') = ' + now.hashKey + ' % 7 = ' + now.hashIdx : 'h(k) = k % 7';
        tx(str, bx + L.boxW / 2, by + L.boxH / 2, L.S.body, hasKey ? col + 'ff' : P.sub + 'ff', 'center', hasKey);
    }
    function hsChip(x, y, label, col, alpha, fs) {
        if (alpha <= 0.01) return;
        var cw = Math.max(26, hsTw(label, fs) + 12);
        var ch = fs + 8;
        ctx.globalAlpha = alpha;
        rr(x - cw / 2, y - ch / 2, cw, ch, ch / 2, col + 'ff', 'none', 1);
        tx(label, x, y, fs, '#111111', 'center', true);
        ctx.globalAlpha = 1;
    }
    function hsNode(x, y, w, h, key, st, alpha, fs) {
        if (alpha <= 0.01) return;
        var c = hsStCol(st);
        ctx.globalAlpha = alpha;
        rr(x, y, w, h, 5, c + '22', c + 'ff', 1.5);
        tx(String(key), x + w / 2, y + h / 2, fs, c + 'ff', 'center', true);
        ctx.globalAlpha = 1;
    }
    function hsSlotKey(x, y, w, h, nd, alpha, fs) {
        if (alpha <= 0.01) return;
        ctx.globalAlpha = alpha;
        tx(String(nd.key), x + w / 2, y + h / 2, fs, hsStCol(nd.st) + 'ff', 'center', true);
        ctx.globalAlpha = 1;
    }
    function hsLegend(x0, top, w, L, cols) {
        var S = L.S;
        hsLegendRows(L.labels, w, S).forEach(function (row, ri) {
            var total = 0;
            row.forEach(function (i) { total += 16 + hsTw(L.labels[i], S.small) + 14; });
            var cx = x0 + (w - total) / 2;
            var cy = top + L.legTop + ri * (S.small + 10) + (S.small + 10) / 2;
            row.forEach(function (i) {
                circ(cx + 5, cy, 5, cols[i] + 'ff', 'none');
                tx(L.labels[i], cx + 16, cy, S.small, P.sub + 'ff', 'left', false);
                cx += 16 + hsTw(L.labels[i], S.small) + 14;
            });
        });
    }
    function hsTailDraw(x0, top, w, L, now, cols, caps, info) {
        var S = L.S;
        lines(caps[now.phase] || '', w - 8, S.body).forEach(function (row, i) {
            tx(row, x0 + w / 2, top + L.capTop + i * (S.body + 6) + (S.body + 6) / 2, S.body, P.text + 'ff', 'center', true);
        });
        hsLegend(x0, top, w, L, cols);
        lines(info, w - 8, S.small).forEach(function (row, i) {
            tx(row, x0 + w / 2, top + L.infoTop + i * (S.small + 5) + (S.small + 5) / 2, S.small, P.sub + 'ff', 'center', false);
        });
    }

    /* ===================== 체이닝 장면 ===================== */
    function hsChainDraw(x0, top, w, L, now, fresh, e) {
        var S = L.S;
        var col = hsPhaseCol(now.phase);
        var idx = now.hashIdx;
        var hasKey = now.hashKey !== null && now.hashKey !== undefined && idx >= 0;
        var isSearch = now.phase === 'search';
        var boxMidY = top + L.boxTop + L.boxH / 2;
        var railX = x0 + L.railX;
        var bucketX = x0 + L.bucketX;
        var rowY0 = top + L.rowsTop;
        var i, j;
        ln(x0 + L.boxX, boxMidY, railX, boxMidY, P.sub + '66', 1.2, [4, 3]);
        ln(railX, boxMidY, railX, top + L.rowsBot, P.sub + '66', 1.2, [4, 3]);
        hsBox(x0, top, L, now);
        if (hasKey) {
            ctx.globalAlpha = fresh ? ez(seg(e, 0.2, 0.4)) : 1;
            rr(x0 + 2, rowY0 + idx * L.rowH + 1, w - 4, L.rowH - 2, 4, col + '18', col + '66', 1);
            ctx.globalAlpha = 1;
        }
        for (i = 0; i < CAP; i++) {
            var cy = rowY0 + i * L.rowH + L.rowH / 2;
            var isT = i === idx;
            var chain = now.buckets[i] || [];
            tx('[' + i + ']', x0 + L.labelW / 2, cy, S.small, isT ? col + 'ff' : P.sub + 'ff', 'center', isT);
            if (!chain.length) {
                rr(bucketX, cy - L.nodeH / 2, L.nodeW, L.nodeH, 5, 'none', P.sub + '66', 1);
                tx('∅', bucketX + L.nodeW / 2, cy, S.small, P.sub + 'ff', 'center', false);
            }
            for (j = 0; j < chain.length; j++) {
                var nx = bucketX + j * (L.nodeW + L.arrowW);
                var isNew = fresh && isT && chain[j].st === 'new';
                if (j > 0) {
                    var ap = isNew ? ez(seg(e, 0.72, 0.9)) : 1;
                    var ax1 = nx - L.arrowW;
                    if (ap > 0.02) arrow(ax1, cy, ax1 + (nx - 3 - ax1) * ap, cy, hsStCol(chain[j].st) + 'cc', 1.5);
                }
                hsNode(nx, cy - L.nodeH / 2, L.nodeW, L.nodeH, chain[j].key, chain[j].st, isNew ? ez(seg(e, 0.8, 0.95)) : 1, S.body);
            }
            if (chain.length) tx('→ null', bucketX + (chain.length - 1) * (L.nodeW + L.arrowW) + L.nodeW + 6, cy, S.small, P.sub + 'aa', 'left', false);
        }
        if (hasKey && fresh) {
            var endT = isSearch ? 0.6 : 0.8;
            var jNew = 0;
            (now.buckets[idx] || []).forEach(function (nd, k) { if (nd.st === 'new') jNew = k; });
            var yT = rowY0 + idx * L.rowH + L.rowH / 2;
            var tX = bucketX + jNew * (L.nodeW + L.arrowW) + L.nodeW / 2;
            var pts = [[x0 + L.boxX, boxMidY], [railX, boxMidY], [railX, yT], [tX, yT]];
            var label = (isSearch || e < 0.3) ? String(now.hashKey) : String(idx);
            var pa = ez(seg(e, 0, 0.22));
            var pos = e < 0.4
                ? [lerp(x0 + L.boxX + 14, x0 + L.boxX, pa), lerp(top + 10, boxMidY, pa)]
                : hsAlong(pts, ez(seg(e, 0.4, endT)));
            var ca = e < endT ? ez(seg(e, 0, 0.1)) : 1 - ez(seg(e, endT, endT + 0.12));
            hsChip(pos[0], pos[1], label, col, ca, S.body);
            if (isSearch) {
                var chainS = now.buckets[idx] || [];
                var cur = Math.min(chainS.length - 1, Math.floor(seg(e, 0.6, 0.98) * chainS.length));
                ctx.globalAlpha = ez(seg(e, 0.6, 0.64));
                rr(bucketX + cur * (L.nodeW + L.arrowW) - 4, yT - L.nodeH / 2 - 4, L.nodeW + 8, L.nodeH + 8, 7, 'none', P.yellow + 'ff', 2.2);
                ctx.globalAlpha = 1;
            }
        }
    }

    /* ===================== 오픈 어드레싱 장면 ===================== */
    function hsOpenDraw(x0, top, w, L, now, pv, fresh, e) {
        var S = L.S;
        var col = hsPhaseCol(now.phase);
        var probes = now.probeSeq || [];
        var hasKey = now.hashKey !== null && now.hashKey !== undefined && now.hashIdx >= 0;
        var isSearch = now.phase === 'search';
        var boxCX = x0 + L.boxX + L.boxW / 2;
        var boxMidY = top + L.boxTop + L.boxH / 2;
        var boxBot = top + L.boxTop + L.boxH;
        var railY = top + L.railY;
        var slotsTop = top + L.slotsTop;
        var slotMidY = slotsTop + L.slotH / 2;
        var i;
        function slotX(s) { return x0 + L.slotX0 + s * (L.slotW + L.slotGap); }
        function slotCX(s) { return slotX(s) + L.slotW / 2; }
        ln(boxCX, boxBot, boxCX, railY, P.sub + '66', 1.2, [4, 3]);
        ln(x0 + L.slotX0, railY, x0 + L.slotX0 + L.slotsTotal, railY, P.sub + '44', 1.2, [4, 3]);
        hsBox(x0, top, L, now);
        var pts = [[boxCX, boxMidY], [boxCX, railY]];
        probes.forEach(function (p, n) {
            var cx = slotCX(p);
            pts.push([cx, railY]);
            pts.push([cx, slotMidY]);
            if (n < probes.length - 1) pts.push([cx, railY]);
        });
        probes.forEach(function (p, n) {
            var last = n === probes.length - 1;
            var bc = slotCX(p);
            var by = slotsTop - (L.mob ? 9 : 10);
            var pc = last ? hsStCol(now.slots[p] ? now.slots[p].st : 'probe') : P.orange;
            ctx.globalAlpha = fresh ? ez(seg(e, 0.2, 0.36)) : 1;
            circ(bc, by, 7.5, pc + '33', pc + 'ff', 1.4);
            tx(String(n + 1), bc, by, S.small, pc + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        });
        for (i = 0; i < CAP; i++) {
            var sx = slotX(i);
            var nd = now.slots[i];
            var pd = pv.slots[i];
            var isP = probes.indexOf(i) >= 0;
            var sc = nd ? hsStCol(nd.st) : P.sub;
            var changed = fresh && (pd ? pd.key : null) !== (nd ? nd.key : null);
            var ca = changed ? ez(seg(e, 0.8, 0.95)) : 1;
            ctx.globalAlpha = (changed && !pd) ? ca : 1;
            rr(sx, slotsTop, L.slotW, L.slotH, 5, nd ? sc + '22' : 'none', nd ? sc + 'ff' : P.sub + '66', isP ? 2 : 1.2);
            ctx.globalAlpha = 1;
            tx(String(i), sx + L.slotW / 2, slotsTop + L.slotH + L.idxOff, S.small, isP ? P.text + 'ff' : P.sub + 'ff', 'center', isP);
            if (changed) {
                if (pd) hsSlotKey(sx, slotsTop, L.slotW, L.slotH, pd, 1 - ca, S.body);
                if (nd) hsSlotKey(sx, slotsTop, L.slotW, L.slotH, nd, ca, S.body);
            } else if (nd) {
                hsSlotKey(sx, slotsTop, L.slotW, L.slotH, nd, 1, S.body);
            }
        }
        if (hasKey && fresh) {
            var endT = isSearch ? 0.7 : 0.8;
            var pa = ez(seg(e, 0, 0.22));
            var pos = e < 0.4
                ? [boxCX, lerp(top + 10, boxMidY, pa)]
                : hsAlong(pts, ez(seg(e, 0.4, endT)));
            var label = (isSearch || e < 0.3) ? String(now.hashKey) : String(now.hashIdx);
            var ca2 = e < endT ? ez(seg(e, 0, 0.1)) : 1 - ez(seg(e, endT, endT + 0.12));
            hsChip(pos[0], pos[1], label, col, ca2, S.body);
        }
    }

    /* ===================== 장면 진입점 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var steps = currentSteps();
        var now = step || steps[0];
        var pv = prev || now;
        var fresh = now !== pv;
        var e = fresh ? clamp01(t) : 1;
        var L = layout(w, mob);
        var open = mode === 'open';
        if (open) hsOpenDraw(x0, top, w, L, now, pv, fresh, e);
        else hsChainDraw(x0, top, w, L, now, fresh, e);
        hsTailDraw(x0, top, w, L, now,
            open ? [P.green, P.teal, P.orange, P.sub] : [P.green, P.teal, P.orange, P.yellow],
            open ? hsOpCap : hsChCap,
            open ? hsInfo.open : hsInfo.chain);
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
        speedBtns.forEach(function (b) { b.classList.remove('ht-viz__speed-btn--active'); });
        btn.classList.add('ht-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('ht-viz__mode-btn--active', d.key === m); });
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