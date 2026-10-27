/**
 * LRU 캐시 구현 시각화 시각화
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
    var root    = el('div', 'lru-viz');
    var toolbar = el('div', 'lru-viz__toolbar');
    var tbLeft  = el('div', 'lru-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'lru-viz__title', 'LRU CACHE'));

    var modeWrap = el('div', 'lru-viz__mode');
    var modeDefs = [
        { key: 'build', label: '구조' },
        { key: 'get', label: '조회' },
        { key: 'evict', label: '제거' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'lru-viz__mode-btn' + (i === 0 ? ' lru-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'lru-viz__speed');
    speedWrap.appendChild(el('span', 'lru-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'lru-viz__speed-btn' + (i === 0 ? ' lru-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'lru-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'lru-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'lru-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'lru-viz__controls');
    var btnPlay  = el('button', 'lru-viz__btn lru-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'lru-viz__btn', '▶| STEP');
    var btnReset = el('button', 'lru-viz__btn', '↺ RESET');
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
    var mode    = 'build';
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

    /* ===================== 엔진: LRU 캐시 ===================== */
    function ju(n, a, b) {
        return [0, 1, 3, 6, 7, 8].indexOf(Math.abs(n) % 10) >= 0 ? a : b;
    }
    var CAP = 3;
    function nd(k, v) { return { k: k, v: v }; }
    function lstep(list, held, cur, victim, cap, cap2, cap3, log) {
        return {
            list: list.map(function (n) { return nd(n.k, n.v); }),
            keys: list.map(function (n) { return n.k; }).concat(held ? [held.k] : []),
            held: held, cur: cur, victim: victim, cap: cap, cap2: cap2, cap3: cap3, log: log
        };
    }

    /* ===================== 데이터: 구조 ===================== */
    var BUILD_STEPS = [];
    (function () {
        var list = [];
        BUILD_STEPS.push(lstep(list, null, 0, 0, '', '', '', 'LRU 캐시는 용량이 가득 차면 가장 오래 쓰지 않은 항목을 버리는 캐시입니다. 해시맵으로 키에서 노드를 바로 찾고, 이중 연결 리스트로 사용 순서를 관리합니다. 왼쪽이 가장 최근에 쓴 쪽(MRU), 오른쪽이 가장 오래된 쪽(LRU)입니다. 용량은 ' + CAP + '입니다.'));
        [[1, 'A'], [2, 'B'], [3, 'C']].forEach(function (kv) {
            list.unshift(nd(kv[0], kv[1]));
            BUILD_STEPS.push(lstep(list, null, kv[0], 0, 'put(' + kv[0] + ', ' + kv[1] + ')', '항목 ' + list.length + '개 / 용량 ' + CAP, '',
                'put(' + kv[0] + ', ' + kv[1] + ') — 키 ' + kv[0] + ju(kv[0], '은', '는') + ' 캐시에 없으므로 새 노드를 만들어 리스트 맨 앞에 넣고, 해시맵에 키 ' + kv[0] + ' → 노드를 등록합니다. 둘 다 O(1)입니다.'));
        });
        BUILD_STEPS.push(lstep(list, null, 0, list[list.length - 1].k, '용량 ' + CAP + '이 가득 참', '다음 삽입 때 제거 후보: 키 ' + list[list.length - 1].k, '',
            '정리 — 리스트는 사용 순서(왼쪽이 최근)를 담고, 해시맵은 키로 노드를 바로 찾게 해 줍니다. 용량 ' + CAP + '이 가득 찼고, 다음 삽입에서는 맨 오른쪽(LRU)인 키 ' + list[list.length - 1].k + ju(list[list.length - 1].k, '이', '가') + ' 제거 후보(빨간색)입니다.'));
    })();

    /* ===================== 데이터: 조회 ===================== */
    var GET_STEPS = [];
    (function () {
        var list = [nd(3, 'C'), nd(2, 'B'), nd(1, 'A')];
        GET_STEPS.push(lstep(list, null, 0, 0, '', '', '', '용량 ' + CAP + '인 캐시에 1, 2, 3을 넣어 리스트가 3, 2, 1 순서입니다. get(1)을 실행해 조회한 항목이 어떻게 맨 앞으로 이동하는지 봅니다.'));
        GET_STEPS.push(lstep(list, null, 1, 0, 'get(1) · 해시맵 조회', '키 1 → 노드 (O(1))', '', 'get(1) — 해시맵에서 키 1로 노드를 바로 찾습니다. 리스트를 처음부터 훑지 않으므로 O(1)입니다.'));
        var node = list.pop();
        GET_STEPS.push(lstep(list, node, 1, 0, 'get(1) · 노드 떼기', '앞뒤 노드의 포인터만 수정', '', 'get(1) — 찾은 노드를 이중 연결 리스트에서 떼어 냅니다. 이웃 노드의 포인터만 고치면 되어 O(1)입니다.'));
        list.unshift(node);
        GET_STEPS.push(lstep(list, null, 1, 0, 'get(1) · 맨 앞에 삽입', '최근 1 · 오래됨 ' + list[list.length - 1].k, '', 'get(1) — 노드를 맨 앞에 다시 끼워 넣습니다. 이제 키 1' + ju(1, '이', '가') + ' 가장 최근에 사용된 항목이고, 맨 뒤의 키 ' + list[list.length - 1].k + ju(list[list.length - 1].k, '이', '가') + ' 가장 오래된 항목입니다.'));
        GET_STEPS.push(lstep(list, null, 0, 0, 'get(9) · 해시맵에 키 9 없음', '리스트는 그대로 · None 반환', '', 'get(9) — 해시맵에 키 9가 없습니다. 캐시 미스이므로 리스트를 건드리지 않고 None을 돌려줍니다.'));
        GET_STEPS.push(lstep(list, null, 0, 0, '조회는 모두 O(1)', '', '', '정리 — 조회는 해시맵 찾기, 노드 떼기, 맨 앞 삽입으로 이루어지고 모두 O(1)입니다. 조회할 때마다 그 항목이 맨 앞으로 오므로, 맨 뒤는 늘 가장 오래 쓰지 않은 항목이 됩니다.'));
    })();

    /* ===================== 데이터: 제거 ===================== */
    var EV_STEPS = [];
    (function () {
        var list = [nd(1, 'A'), nd(3, 'C'), nd(2, 'B')];
        EV_STEPS.push(lstep(list, null, 0, 0, '', '', '', '용량 ' + CAP + '인 캐시가 가득 찬 상태에서 put(4, D)를 합니다. 앞의 조회 뒤라 리스트는 1, 3, 2 순서이고 맨 뒤가 키 2입니다.'));
        EV_STEPS.push(lstep(list, null, 0, 0, 'put(4, D) · 새 키', '해시맵에 키 4 없음 · ' + list.length + ' / ' + CAP, '', 'put(4, D) — 해시맵에 키 4가 없어 새 항목입니다. 그런데 항목이 ' + list.length + '개로 용량 ' + CAP + '이 가득 차 있어 하나를 버려야 합니다.'));
        var vic = list[list.length - 1].k;
        EV_STEPS.push(lstep(list, null, 0, vic, '제거 대상 · 키 ' + vic, '맨 뒤 = 가장 오래 쓰지 않음', '', '맨 뒤 노드가 가장 오래 쓰지 않은 항목이므로 키 ' + vic + ju(vic, '을', '를') + ' 제거 대상으로 고릅니다. 삽입 순서가 아니라 사용 순서가 기준이라, 가장 먼저 들어온 키 1이 아니라는 점에 주의하세요.'));
        list.pop();
        EV_STEPS.push(lstep(list, null, 0, 0, '키 ' + vic + ' 제거', '리스트와 해시맵 모두에서 삭제', '', '맨 뒤 노드를 리스트에서 떼고, 해시맵에서도 키 ' + vic + ju(vic, '을', '를') + ' 지웁니다. 둘 다 O(1)입니다.'));
        list.unshift(nd(4, 'D'));
        EV_STEPS.push(lstep(list, null, 4, 0, 'put(4, D) · 맨 앞에 삽입', '항목 ' + list.length + '개 / 용량 ' + CAP, '', '새 노드를 맨 앞에 넣고 해시맵에 키 4를 등록합니다. 용량 ' + CAP + '을 지켰습니다.'));
        EV_STEPS.push(lstep(list, null, 3, 0, 'put(3, E) · 이미 있는 키', '해시맵으로 노드를 찾아 값을 E로 변경', '', 'put(3, E) — 키 3은 이미 있습니다. 해시맵으로 노드를 찾고 값을 E로 바꿉니다. 새 항목이 아니라서 제거는 일어나지 않습니다.'));
        var idx = 0;
        list.forEach(function (n, i) { if (n.k === 3) idx = i; });
        var n3 = list.splice(idx, 1)[0];
        n3.v = 'E';
        list.unshift(n3);
        EV_STEPS.push(lstep(list, null, 3, 0, 'put(3, E) · 맨 앞으로 이동', '값을 바꿔도 사용한 것', '', '값을 바꾼 항목도 사용한 것이므로 맨 앞으로 옮깁니다. 리스트는 3, 4, 1 순서가 됩니다.'));
        EV_STEPS.push(lstep(list, null, 0, 0, '제거 대상은 사용 순서로 결정', '', '', '정리 — FIFO였다면 가장 먼저 들어온 키 1이 제거됐겠지만, 키 1은 방금 조회돼 최근 쪽에 있어서 LRU는 키 2를 제거했습니다. put은 해시맵 조회, 필요하면 맨 뒤 제거, 맨 앞 삽입으로 이루어져 O(1)입니다.'));
    })();

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'get') return GET_STEPS;
        if (mode === 'evict') return EV_STEPS;
        return BUILD_STEPS;
    }
    function defaultLog() {
        if (mode === 'get') return '조회한 항목이 리스트 맨 앞으로 이동하는 과정을 봅니다.';
        if (mode === 'evict') return '용량이 가득 찼을 때 맨 뒤 항목이 제거되는 과정을 봅니다.';
        return '해시맵과 이중 연결 리스트가 함께 사용 순서를 관리하는 구조를 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    var lruCapCache = {};
    function lruCap(w, mob) {
        var key = Math.round(w) + (mob ? 'm' : 'd');
        if (lruCapCache[key]) return lruCapCache[key];
        var fB = mob ? 11.5 : 13;
        var fR = mob ? 11 : 12.5;
        var n1 = 1;
        var n2 = 0;
        [BUILD_STEPS, GET_STEPS, EV_STEPS].forEach(function (arr) {
            arr.forEach(function (st) {
                if (st.cap) n1 = Math.max(n1, lines(st.cap, w - 8, fB).length);
                if (st.cap2) n2 = Math.max(n2, lines(st.cap2, w - 8, fR).length);
            });
        });
        lruCapCache[key] = { fB: fB, fR: fR, n1: n1, n2: n2, h: n1 * (fB + 5) + (n2 ? 6 + n2 * (fR + 5) : 0) };
        return lruCapCache[key];
    }
    function layout(w, mob) {
        var bh = mob ? 28 : 32;
        var heldY = 16 + bh / 2;
        var trayY = heldY + bh / 2 + 14;
        var trayH = bh + 18;
        var hashY = trayY + trayH + 34;
        var ch = mob ? 20 : 24;
        var slot = w / CAP;
        return {
            slot: slot,
            bw: Math.min(mob ? 54 : 84, slot - (mob ? 24 : 26)),
            bh: bh,
            heldY: heldY,
            trayY: trayY,
            trayH: trayH,
            nodeY: trayY + trayH / 2,
            cw: mob ? 26 : 32,
            ch: ch,
            hashY: hashY,
            capY: hashY + ch / 2 + (mob ? 26 : 30),
            fs: mob ? 11 : 12.5,
            fsS: mob ? 11 : 12
        };
    }
    function sceneH(w, mob) {
        return Math.ceil(layout(w, mob).capY + lruCap(w, mob).h + 8);
    }

    /* ===================== 장면 계산 ===================== */
    var LRU_IN = EV_STEPS[4].list[0];
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }
    function lruPend(st) {
        if (!st || EV_STEPS.indexOf(st) < 1) return false;
        return st.list.every(function (n) { return n.k !== LRU_IN.k; });
    }
    function lruMiss(st) {
        var m = /get\((\d+)\)/.exec(st.cap || '');
        return m && st.cap.indexOf('없음') >= 0 ? m[1] : null;
    }
    function lruLast(st) {
        var arr = currentSteps();
        return st === arr[arr.length - 1];
    }
    function lruNodeAt(st, k, L, x0, w, top) {
        if (st.held && st.held.k === k) return { x: x0 + w / 2, y: top + L.heldY, v: st.held.v };
        var i = -1;
        st.list.forEach(function (n, j) { if (n.k === k) i = j; });
        if (i < 0) return null;
        return { x: x0 + (i + 0.5) * L.slot, y: top + L.nodeY, v: st.list[i].v };
    }
    function lruPlace(s, p, k, L, x0, w, top, e) {
        var a = lruNodeAt(s, k, L, x0, w, top);
        var b = lruNodeAt(p, k, L, x0, w, top);
        var q = ez(e);
        if (a && b) return { x: lerp(b.x, a.x, q), y: lerp(b.y, a.y, q), a: 1, v: a.v, pv: b.v };
        if (a && lruPend(p)) return { x: lerp(x0 + w / 2, a.x, q), y: lerp(top + L.heldY, a.y, q), a: 1, v: a.v };
        if (a) return { x: a.x, y: lerp(a.y - 40, a.y, q), a: e, v: a.v };
        if (b) return { x: b.x, y: lerp(b.y, b.y + 36, q), a: 1 - e, v: b.v };
        return null;
    }
    function lruKeys(s, p) {
        var out = [];
        function add(k) { if (out.indexOf(k) < 0) out.push(k); }
        s.list.forEach(function (n) { add(n.k); });
        p.list.forEach(function (n) { add(n.k); });
        if (s.held) add(s.held.k);
        if (p.held) add(p.held.k);
        return out;
    }
    function lruPairs(st) {
        var out = [];
        for (var i = 0; i < st.list.length - 1; i++) out.push([st.list[i].k, st.list[i + 1].k]);
        return out;
    }

    /* ===================== 장면 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var CP = lruCap(w, mob);
        var e = clamp01(t);
        var arr = currentSteps();
        var s = step || arr[0];
        var p = prev || s;
        var bw = L.bw;
        var bh = L.bh;
        var cellW = w / 4;
        var trayT = top + L.trayY;
        var hy = top + L.hashY;
        var cy0 = hy - L.ch / 2;
        var nodeAt = function (k) { return lruPlace(s, p, k, L, x0, w, top, e); };

        tx('MRU 최근', x0 + 2, top + 8, L.fsS, P.sub + 'ff', 'left', true);
        tx('LRU 오래됨', x0 + w - 2, top + 8, L.fsS, P.sub + 'ff', 'right', true);

        var glow = lruLast(s) ? (lruLast(p) ? 1 : e) : (lruLast(p) ? 1 - e : 0);
        if (glow > 0) {
            ctx.globalAlpha = glow;
            rr(x0 - 3, trayT - 3, w + 6, L.trayH + 6, 9, P.green + '18', P.green + 'ff', 1.6);
            ctx.globalAlpha = 1;
        }
        rr(x0, trayT, w, L.trayH, 8, 'none', s.victim ? P.red + 'aa' : P.sub + '55', 1.3);
        ctx.setLineDash([4, 3]);
        for (var i = 0; i < CAP; i++) {
            rr(x0 + i * L.slot + 4, trayT + 5, L.slot - 8, bh + 8, 6, 'none', P.sub + '66', 1.1);
        }
        ctx.setLineDash([]);

        var pairsS = lruPairs(s);
        var pairsP = lruPairs(p);
        var done = {};
        pairsS.concat(pairsP).forEach(function (pr) {
            var id = pr[0] + '-' + pr[1];
            if (done[id]) return;
            done[id] = true;
            var inS = pairsS.some(function (q) { return q[0] === pr[0] && q[1] === pr[1]; });
            var inP = pairsP.some(function (q) { return q[0] === pr[0] && q[1] === pr[1]; });
            var A = nodeAt(pr[0]);
            var B = nodeAt(pr[1]);
            if (!A || !B || B.x - A.x < bw + 12) return;
            var yy = (A.y + B.y) / 2;
            ctx.globalAlpha = (inS && inP ? 1 : (inS ? e : 1 - e)) * Math.min(A.a, B.a);
            arrow(A.x + bw / 2 + 2, yy, B.x - bw / 2 - 2, yy, P.sub + 'ff', 1.6);
            arrow(B.x - bw / 2 - 2, yy, A.x + bw / 2 + 2, yy, P.sub + 'ff', 1.6);
            ctx.globalAlpha = 1;
        });

        for (var k = 1; k <= 4; k++) {
            var cx = x0 + (k - 0.5) * cellW;
            var inKS = s.keys.indexOf(k) >= 0;
            var inKP = p.keys.indexOf(k) >= 0;
            var ca = inKS && inKP ? 1 : (inKS ? e : (inKP ? 1 - e : 0));
            var pl = nodeAt(k);
            rr(cx - L.cw / 2, cy0, L.cw, L.ch, 4, 'none', P.sub + '55', 1);
            if (pl && ca > 0) {
                var isCur = s.cur === k;
                ctx.globalAlpha = ca * pl.a;
                ln(cx, cy0, pl.x, pl.y + bh / 2 + 2, isCur ? P.yellow + 'ff' : P.sub + '88', isCur ? 2 : 1.2, isCur ? [] : [3, 3]);
                ctx.globalAlpha = 1;
            }
            if (ca > 0) {
                var colK = !inKS ? P.sub : (s.victim === k ? P.red : (s.cur === k ? P.yellow : P.teal));
                ctx.globalAlpha = ca;
                rr(cx - L.cw / 2, cy0, L.cw, L.ch, 4, colK + '30', colK + 'ff', 1.3);
                tx(String(k), cx, hy, L.fs, P.text + 'ff', 'center', true);
                ctx.globalAlpha = 1;
            }
        }
        tx('해시맵 · 키 → 노드', x0 + w / 2, cy0 + L.ch + 12, L.fsS, P.sub + 'ff', 'center', true);

        if (s.cur && s.cur !== p.cur && s.keys.indexOf(s.cur) >= 0) {
            var cn = nodeAt(s.cur);
            if (cn) {
                var pq = ez(seg(e, 0, 0.7));
                ctx.globalAlpha = 1 - seg(e, 0.7, 1);
                circ(lerp(x0 + (s.cur - 0.5) * cellW, cn.x, pq), lerp(cy0, cn.y + bh / 2 + 2, pq), 4.5, P.yellow + 'ff', 'none');
                ctx.globalAlpha = 1;
            }
        }

        var mk = lruMiss(s);
        if (mk) {
            var ma = p === s ? 1 : seg(e, 0, 0.3);
            var mx = x0 + w / 2;
            ctx.globalAlpha = ma;
            rr(mx - L.cw / 2, cy0, L.cw, L.ch, 4, P.red + '30', P.red + 'ff', 1.4);
            tx(mk, mx, hy, L.fs, P.text + 'ff', 'center', true);
            ctx.globalAlpha = ma * (p === s ? 1 : seg(e, 0.35, 0.8));
            ln(mx - L.cw / 2 - 3, cy0 - 3, mx + L.cw / 2 + 3, cy0 + L.ch + 3, P.red + 'ff', 2);
            ctx.globalAlpha = 1;
        }

        lruKeys(s, p).forEach(function (kk) {
            var pn = nodeAt(kk);
            if (!pn || pn.a <= 0) return;
            var gone = !lruNodeAt(s, kk, L, x0, w, top);
            if (s.victim === kk && p.victim !== kk) {
                var rg = seg(e, 0, 0.6);
                ctx.globalAlpha = (1 - rg) * pn.a;
                rr(pn.x - bw / 2 - 4 - rg * 8, pn.y - bh / 2 - 4 - rg * 8, bw + 8 + rg * 16, bh + 8 + rg * 16, 9, 'none', P.red + 'ff', 1.6);
            }
            var col = gone || kk === s.victim ? P.red : (kk === s.cur ? P.yellow : P.teal);
            var lw = kk === s.cur || kk === s.victim ? 2.4 : 1.4;
            ctx.globalAlpha = pn.a;
            rr(pn.x - bw / 2, pn.y - bh / 2, bw, bh, 5, col + '30', col + 'ff', lw);
            if (pn.pv !== undefined && pn.pv !== pn.v) {
                ctx.globalAlpha = pn.a * (1 - e);
                tx(kk + ':' + pn.pv, pn.x, pn.y, L.fs, P.text + 'ff', 'center', true);
                ctx.globalAlpha = pn.a * e;
            }
            tx(kk + ':' + pn.v, pn.x, pn.y, L.fs, P.text + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        });

        var ia = lruPend(s) ? (lruPend(p) ? 1 : e) : (lruPend(p) ? 1 - e : 0);
        if (ia > 0) {
            var ix = x0 + w / 2;
            var iy = top + L.heldY;
            ctx.globalAlpha = ia;
            rr(ix - bw / 2, iy - bh / 2, bw, bh, 5, P.sub + '22', P.sub + 'ff', 1.4);
            tx(LRU_IN.k + ':' + LRU_IN.v, ix, iy, L.fs, P.text + 'ff', 'center', true);
            tx('새 항목', ix + bw / 2 + 8, iy, L.fsS, P.sub + 'ff', 'left', true);
            ctx.globalAlpha = 1;
        }

        var capY = top + L.capY;
        var lhB = CP.fB + 5;
        var lhR = CP.fR + 5;
        if (s.cap) {
            ctx.globalAlpha = s.cap === p.cap ? 1 : e;
            lines(s.cap, w - 8, CP.fB).forEach(function (txt, j) {
                tx(txt, x0 + w / 2, capY + j * lhB + lhB / 2, CP.fB, P.yellow + 'ff', 'center', true);
            });
        }
        if (s.cap2) {
            ctx.globalAlpha = s.cap2 === p.cap2 ? 1 : e;
            lines(s.cap2, w - 8, CP.fR).forEach(function (txt, j) {
                tx(txt, x0 + w / 2, capY + CP.n1 * lhB + 6 + j * lhR + lhR / 2, CP.fR, P.text + 'ff', 'center', false);
            });
        }
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
        speedBtns.forEach(function (b) { b.classList.remove('lru-viz__speed-btn--active'); });
        btn.classList.add('lru-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('lru-viz__mode-btn--active', d.key === m); });
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