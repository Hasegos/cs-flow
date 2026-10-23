/**
 * 스킵 리스트 시각화 시각화
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
    var root    = el('div', 'sl-viz');
    var toolbar = el('div', 'sl-viz__toolbar');
    var tbLeft  = el('div', 'sl-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'sl-viz__title', 'SKIP LIST'));

    var modeWrap = el('div', 'sl-viz__mode');
    var modeDefs = [
        { key: 'build', label: '레벨 구성' },
        { key: 'search', label: '탐색' },
        { key: 'insert', label: '삽입' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'sl-viz__mode-btn' + (i === 0 ? ' sl-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'sl-viz__speed');
    speedWrap.appendChild(el('span', 'sl-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'sl-viz__speed-btn' + (i === 0 ? ' sl-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'sl-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'sl-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'sl-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'sl-viz__controls');
    var btnPlay  = el('button', 'sl-viz__btn sl-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'sl-viz__btn', '▶| STEP');
    var btnReset = el('button', 'sl-viz__btn', '↺ RESET');
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

    /* ===================== 엔진: 스킵 리스트 ===================== */
    function ju(n, a, b) {
        return [0, 1, 3, 6, 7, 8].indexOf(Math.abs(n) % 10) >= 0 ? a : b;
    }
    function jro(n) {
        return n + ([0, 3, 6].indexOf(Math.abs(n) % 10) >= 0 ? '으로' : '로');
    }
    var MAXL = 3;
    var KEYS = [3, 6, 7, 9, 12, 17, 19, 21, 25, 26];
    var HTS = [1, 2, 1, 3, 1, 2, 1, 2, 1, 3];
    var FLIPS = ['뒤', '앞뒤', '뒤', '앞앞뒤', '뒤', '앞뒤', '뒤', '앞뒤', '뒤', '앞앞뒤'];
    function mkNodes(n) {
        var out = [];
        for (var i = 0; i < n; i++) out.push({ k: KEYS[i], h: HTS[i], show: HTS[i] });
        return out;
    }
    function nextAt(nodes, idx, level) {
        for (var j = idx + 1; j < nodes.length; j++) {
            if (nodes[j].show >= level) return j;
        }
        return -1;
    }
    function countAt(nodes, level) {
        var c = 0;
        nodes.forEach(function (nd) { if (nd.show >= level) c++; });
        return c;
    }
    function lab(nodes, idx) { return idx < 0 ? 'H' : String(nodes[idx].k); }
    function snap(nodes) {
        return nodes.map(function (nd) { return { k: nd.k, h: nd.h, show: nd.show }; });
    }
    function sstep(nodes, path, preds, cur, fresh, cap, cap2, cap3, log) {
        return { nodes: snap(nodes), path: path.slice(), preds: preds, cur: cur, fresh: fresh, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }

    /* ===================== 데이터: 레벨 구성 ===================== */
    var BUILD_STEPS = [];
    (function () {
        BUILD_STEPS.push(sstep([], [], [], null, 0, '', '', '', '스킵 리스트(skip list)는 정렬된 연결 리스트 위에 "빠른 길"을 여러 층 얹은 자료구조입니다. 노드마다 동전을 던져 앞면이 나오는 동안 한 층씩 위로 올라갑니다. 키를 하나씩 넣으며 층이 어떻게 쌓이는지 봅니다. 맨 앞 H는 모든 층에 걸친 머리 노드입니다.'));
        for (var i = 0; i < KEYS.length; i++) {
            var nodes = mkNodes(i + 1);
            BUILD_STEPS.push(sstep(nodes, [], [], null, KEYS[i],
                '키 ' + KEYS[i] + ' · 동전 ' + FLIPS[i] + ' · 높이 ' + HTS[i],
                'L1 ' + countAt(nodes, 1) + '개 · L2 ' + countAt(nodes, 2) + '개 · L3 ' + countAt(nodes, 3) + '개', '',
                '키 ' + KEYS[i] + ju(KEYS[i], '을', '를') + ' 넣습니다. 동전을 던져 앞면이 나오면 한 층 올리고 뒷면이 나오면 멈춥니다. 결과가 ' + FLIPS[i] + '이므로 노드의 높이는 ' + HTS[i] + '입니다.'));
        }
        var all = mkNodes(KEYS.length);
        var ptr = countAt(all, 1) + countAt(all, 2) + countAt(all, 3);
        BUILD_STEPS.push(sstep(all, [], [], null, 0, 'L1 ' + countAt(all, 1) + ' → L2 ' + countAt(all, 2) + ' → L3 ' + countAt(all, 3), '포인터 ' + ptr + '개 · 노드당 평균 ' + (ptr / KEYS.length).toFixed(1), '',
            '정리 — 위층으로 갈수록 노드 수가 대략 절반씩 줄었습니다(' + countAt(all, 1) + ' → ' + countAt(all, 2) + ' → ' + countAt(all, 3) + '). 앞면 확률이 1/2이면 노드당 포인터 수의 기대값은 2입니다. 이 분포 덕분에 위층에서 크게 건너뛰고 아래층에서 좁혀 가는 탐색이 가능합니다.'));
    })();

    /* ===================== 데이터: 탐색 ===================== */
    var TARGET = 21;
    var SEARCH_STEPS = [];
    (function () {
        var nodes = mkNodes(KEYS.length);
        var idx = -1;
        var level = MAXL;
        var path = [{ i: -1, l: level }];
        var moves = 0;
        SEARCH_STEPS.push(sstep(nodes, path, [], { i: -1, l: level }, 0, '', '', '', '키 ' + TARGET + ju(TARGET, '을', '를') + ' 찾습니다. 머리 노드 H의 맨 위층에서 시작해, 오른쪽 다음 노드가 찾는 키보다 작으면 오른쪽으로 가고, 크거나 같으면 한 층 내려갑니다. 연결 리스트라면 ' + (KEYS.indexOf(TARGET) + 1) + '개 노드를 차례로 지나야 합니다.'));
        while (true) {
            var j = nextAt(nodes, idx, level);
            if (j >= 0 && nodes[j].k < TARGET) {
                idx = j;
                moves++;
                path.push({ i: idx, l: level });
                SEARCH_STEPS.push(sstep(nodes, path, [], { i: idx, l: level }, 0, 'L' + level + ' · 오른쪽 이동 → ' + nodes[idx].k, '오른쪽 다음 ' + nodes[idx].k + ' < ' + TARGET, '이동 ' + moves + '번',
                    '층 ' + level + '에서 오른쪽 다음 노드의 키 ' + nodes[idx].k + ju(nodes[idx].k, '은', '는') + ' ' + TARGET + '보다 작으므로 오른쪽으로 이동합니다.'));
            } else if (level > 1) {
                var nxt = j >= 0 ? String(nodes[j].k) : '없음';
                level--;
                path.push({ i: idx, l: level });
                SEARCH_STEPS.push(sstep(nodes, path, [], { i: idx, l: level }, 0, 'L' + (level + 1) + ' → L' + level + ' · 내려감', '오른쪽 다음 ' + nxt + (j >= 0 ? ' ≥ ' + TARGET : ''), '이동 ' + moves + '번',
                    '층 ' + (level + 1) + '에서 ' + (j >= 0 ? '오른쪽 다음 노드의 키 ' + nxt + ju(nodes[j].k, '은', '는') + ' ' + TARGET + ' 이상이므로' : '오른쪽 다음 노드가 없으므로') + ' 한 층 내려갑니다. 지금 위치 ' + lab(nodes, idx) + '에서 층 ' + level + ju(level, '을', '를') + ' 이어 갑니다.'));
            } else {
                idx = j;
                moves++;
                path.push({ i: idx, l: 1 });
                SEARCH_STEPS.push(sstep(nodes, path, [], { i: idx, l: 1 }, 0, '찾음 · ' + TARGET, '이동 ' + moves + '번 · 연결 리스트 ' + (KEYS.indexOf(TARGET) + 1) + '번', '',
                    '맨 아래층에서 오른쪽 다음 노드가 ' + TARGET + '입니다. 찾았습니다. 오른쪽 이동 ' + moves + '번으로 닿았고, 연결 리스트는 ' + (KEYS.indexOf(TARGET) + 1) + '번이 필요합니다.'));
                break;
            }
        }
        SEARCH_STEPS.push(sstep(nodes, path, [], { i: idx, l: 1 }, 0, '이동 ' + moves + '번 · 연결 리스트 ' + (KEYS.indexOf(TARGET) + 1) + '번', '', '',
            '정리 — 위층에서 크게 건너뛰고 내려오며 범위를 좁혔습니다. 층 수가 log n 정도이고 층마다 기대 약 2번(오른쪽 약 1번, 아래 1번) 움직이므로 평균 탐색은 O(log n)입니다. 확률적 구조라 최악의 경우는 O(n)까지 갈 수 있습니다.'));
    })();

    /* ===================== 데이터: 삽입 ===================== */
    var INS_KEY = 14;
    var INS_H = 2;
    var INS_STEPS = [];
    (function () {
        var nodes = mkNodes(KEYS.length);
        var idx = -1;
        var path = [{ i: -1, l: MAXL }];
        var preds = [];
        INS_STEPS.push(sstep(nodes, path, preds, { i: -1, l: MAXL }, 0, '', '', '', '키 ' + INS_KEY + ju(INS_KEY, '을', '를') + ' 넣습니다. 먼저 탐색처럼 내려가며 층마다 ' + INS_KEY + ' 바로 앞 노드(보라색 테두리)를 기록하고, 동전으로 높이를 정한 뒤 그 노드들 뒤에 새 노드를 끼워 넣습니다.'));
        for (var level = MAXL; level >= 1; level--) {
            if (level < MAXL) path.push({ i: idx, l: level });
            while (true) {
                var j = nextAt(nodes, idx, level);
                if (j >= 0 && nodes[j].k < INS_KEY) {
                    idx = j;
                    path.push({ i: idx, l: level });
                } else break;
            }
            preds.push({ i: idx, l: level });
            var nj = nextAt(nodes, idx, level);
            INS_STEPS.push(sstep(nodes, path, preds.slice(), { i: idx, l: level }, 0, '층 ' + level + ' · 앞 노드 ' + lab(nodes, idx), '오른쪽 다음 ' + (nj >= 0 ? nodes[nj].k + ' ≥ ' + INS_KEY : '없음'), '',
                '층 ' + level + '에서 ' + INS_KEY + ' 바로 앞 노드는 ' + lab(nodes, idx) + '입니다. ' + (nj >= 0 ? '오른쪽 다음 노드의 키 ' + nodes[nj].k + ju(nodes[nj].k, '은', '는') + ' ' + INS_KEY + ' 이상이므로' : '오른쪽 다음 노드가 없으므로') + ' 여기서 멈추고 ' + (level > 1 ? '한 층 내려갑니다.' : '탐색을 마칩니다.')));
        }
        INS_STEPS.push(sstep(nodes, path, preds.slice(), null, 0, '동전 앞 → 층 2로 올림', '', '', '새 노드의 높이를 동전으로 정합니다. 첫 번째 동전이 앞면이라 한 층 올라갑니다.'));
        INS_STEPS.push(sstep(nodes, path, preds.slice(), null, 0, '동전 뒤 → 멈춤', '새 노드 높이 ' + INS_H, '', '두 번째 동전이 뒷면이라 멈춥니다. 새 노드의 높이는 ' + INS_H + '입니다.'));
        var pos = 0;
        while (pos < nodes.length && nodes[pos].k < INS_KEY) pos++;
        var withNew = snap(nodes);
        withNew.splice(pos, 0, { k: INS_KEY, h: INS_H, show: 0 });
        for (var lv = 1; lv <= INS_H; lv++) {
            withNew[pos].show = lv;
            var pr = preds.filter(function (p) { return p.l === lv; })[0];
            INS_STEPS.push(sstep(withNew, path, preds.slice(), null, INS_KEY, '층 ' + lv + ' 연결', lab(nodes, pr.i) + ' → ' + INS_KEY + ' → ' + (function () { var q = nextAt(nodes, pr.i, lv); return q >= 0 ? nodes[q].k : '없음'; })(), '',
                '층 ' + lv + '에서 앞 노드 ' + lab(nodes, pr.i) + '의 오른쪽 포인터를 새 노드 ' + jro(INS_KEY) + ' 바꾸고, 새 노드가 원래 다음 노드를 가리키게 합니다. 포인터 두 개만 고칩니다.'));
        }
        INS_STEPS.push(sstep(withNew, path, [], null, INS_KEY, '삽입 끝 · 층별 포인터 2개씩', '', '',
            '정리 — 탐색으로 층마다 앞 노드를 찾고(평균 O(log n)), 높이만큼의 층에서 포인터 두 개씩만 고쳤습니다. 균형 트리처럼 회전이나 재배치가 필요 없고, 동전 던지기가 균형을 확률적으로 맞춰 줍니다.'));
    })();

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'search') return SEARCH_STEPS;
        if (mode === 'insert') return INS_STEPS;
        return BUILD_STEPS;
    }
    function defaultLog() {
        if (mode === 'search') return '위층에서 크게 건너뛰고 아래층에서 좁혀 가는 탐색 경로를 봅니다.';
        if (mode === 'insert') return '앞 노드를 찾고 동전으로 높이를 정한 뒤 포인터를 끼워 넣습니다.';
        return '키를 넣으며 동전 던지기로 층이 쌓이는 모습을 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    var skLayMemo = {};
    function ez(q) { var v = clamp01(q); return v * v * (3 - 2 * v); }
    function skCapH(w, mob) {
        var fs = mob ? 11.5 : 13;
        var fsub = mob ? 11 : 12;
        var best = 0;
        [BUILD_STEPS, SEARCH_STEPS, INS_STEPS].forEach(function (arr) {
            arr.forEach(function (s) {
                var h = 0;
                if (s.cap) h += lines(s.cap, w - 8, fs).length * (fs + 5);
                if (s.cap2) h += lines(s.cap2, w - 8, fsub).length * (fsub + 4);
                if (s.cap3) h += lines(s.cap3, w - 8, fsub).length * (fsub + 4);
                if (h > best) best = h;
            });
        });
        return best;
    }
    function layout(w, mob) {
        var key = Math.round(w) + (mob ? 'm' : 'd');
        if (skLayMemo[key]) return skLayMemo[key];
        var L = {
            mob: mob,
            fs: mob ? 11.5 : 13,
            fsub: mob ? 11 : 12,
            fkey: mob ? 11 : 13,
            bh: mob ? 20 : 24,
            coinH: mob ? 22 : 26,
            cr: mob ? 10 : 11,
            chipH: mob ? 18 : 22,
            rowsY: 0, rowH: 0, cw: 0, bw: 0, ox: 0, capTop: 0, total: 0
        };
        L.rowsY = L.coinH + (mob ? 20 : 22);
        L.rowH = L.bh + 26;
        L.cw = Math.min(mob ? 40 : 52, w / 12);
        L.bw = Math.min(L.cw - (mob ? 3 : 8), mob ? 26 : 40);
        L.ox = (w - L.cw * 12) / 2;
        L.capTop = L.rowsY + 2 * L.rowH + L.bh + 18;
        L.total = L.capTop + skCapH(w, mob) + 6;
        skLayMemo[key] = L;
        return L;
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 노드와 포인터 ===================== */
    function skRowY(L, l) { return L.rowsY + (MAXL - l) * L.rowH; }
    function skFind(list, key) {
        var i;
        for (i = 0; i < list.length; i++) { if (list[i].k === key) return list[i]; }
        return null;
    }
    function skCol(list, key) {
        var i;
        if (key < 0) return 0;
        for (i = 0; i < list.length; i++) { if (list[i].k === key) return i + 1; }
        return -1;
    }
    function skHas(list, key, l) {
        if (key < 0) return true;
        var nd = skFind(list, key);
        return nd !== null && nd.show >= l;
    }
    function skRails(list, l) {
        var keys = [-1];
        var out = [];
        var i;
        list.forEach(function (nd) { if (nd.show >= l) keys.push(nd.k); });
        for (i = 1; i < keys.length; i++) out.push({ a: keys[i - 1], b: keys[i], id: keys[i - 1] + '>' + keys[i] });
        return out;
    }
    function skAllKeys(a, b) {
        var out = [-1];
        [a.nodes, b.nodes].forEach(function (list) {
            list.forEach(function (nd) { if (out.indexOf(nd.k) < 0) out.push(nd.k); });
        });
        return out;
    }
    function skPathKey(i) { return i < 0 ? -1 : KEYS[i]; }
    function skCurHas(st, key, l) {
        return st.cur !== null && skPathKey(st.cur.i) === key && st.cur.l === l;
    }
    function skPredHas(st, key, l) {
        return st.preds.some(function (q) { return skPathKey(q.i) === key && q.l === l; });
    }

    /* ===================== 동전과 표시 ===================== */
    function skInsFirstCoin() {
        var i;
        for (i = 1; i < INS_STEPS.length; i++) { if (INS_STEPS[i].cur === null) return i; }
        return INS_STEPS.length;
    }
    function skCoinInfo(steps, idx) {
        var s = steps[idx];
        var list;
        var q;
        if (steps === INS_STEPS) {
            list = [];
            for (q = 0; q < INS_H - 1; q++) list.push('앞');
            list.push('뒤');
            var fc = skInsFirstCoin();
            return { list: list, n: idx < fc ? 0 : Math.min(list.length, idx - fc + 1) };
        }
        if (steps === BUILD_STEPS) {
            var ki = KEYS.indexOf(s.fresh);
            list = ki < 0 ? [] : FLIPS[ki].split('');
            return { list: list, n: list.length };
        }
        return { list: [], n: 0 };
    }
    function skChipText(md, s) {
        if (md === 'search') return '찾는 키 ' + TARGET;
        if (md === 'insert') return '넣을 키 ' + INS_KEY;
        return s.fresh ? '새 키 ' + s.fresh : '';
    }
    function skChip(x, y, h, text, fs) {
        ctx.font = '700 ' + fs + 'px "JetBrains Mono",monospace';
        var cwid = ctx.measureText(text).width + 14;
        rr(x, y, cwid, h, 6, P.purple + '33', P.purple + 'ff', 1.4);
        tx(text, x + cwid / 2, y + h / 2, fs, P.text + 'ff', 'center', true);
        return cwid;
    }
    function skCoin(cx, cy, r, sx, face, col, a, fs) {
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.max(1, r * sx), r, 0, 0, Math.PI * 2);
        ctx.fillStyle = col + '33';
        ctx.fill();
        ctx.strokeStyle = col + 'ff';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        if (sx > 0.35) tx(face, cx, cy, fs, col + 'ff', 'center', true);
        ctx.globalAlpha = 1;
    }

    /* ===================== 그리기 헬퍼 ===================== */
    function skRailDraw(xa, xb, yR, yB, prog, a) {
        var xe = xa + (xb - xa) * prog;
        var tk = seg(prog, 0.6, 1);
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.moveTo(xa, yR);
        ctx.lineTo(xe, yR);
        ctx.strokeStyle = P.sub + 'aa';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        if (tk > 0) {
            ctx.beginPath();
            ctx.moveTo(xb, yR);
            ctx.lineTo(xb, yR - (yR - yB) * tk);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }
    function skBlock(str, cx, y, w, fs, lh, col, bold) {
        if (!str) return y;
        var rows = lines(str, w - 8, fs);
        rows.forEach(function (row, li) {
            tx(row, cx, y + li * lh + lh / 2, fs, col, 'center', bold);
        });
        return y + rows.length * lh;
    }

    /* ===================== 메인 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var steps = currentSteps();
        var s = step || steps[0];
        var p = prev || s;
        var fresh = s !== p;
        var e = fresh ? clamp01(t) : 1;
        var L = layout(w, mob);
        var gs = mode === 'build' ? 0.4 : 0;
        var mv = fresh ? ez(seg(e, 0, 0.5)) : 1;
        var ox = x0 + L.ox;
        var cw = L.cw;
        var l, i, k;

        function colX(c) { return ox + (c + 0.5) * cw; }
        function xOf(key) {
            var cP = skCol(p.nodes, key);
            var cS = skCol(s.nodes, key);
            var c = cS < 0 ? cP : (cP < 0 ? cS : lerp(cP, cS, mv));
            return colX(c);
        }
        function railY(l2) { return top + skRowY(L, l2) + L.bh + 6; }
        function rowY(l2) { return top + skRowY(L, l2) + L.bh / 2; }
        function growOf(l2) { return ez(seg(e, gs + (l2 - 1) * 0.1, gs + (l2 - 1) * 0.1 + 0.3)); }
        function railOf(l2) { return ez(seg(e, gs + (l2 - 1) * 0.1 + 0.15, gs + (l2 - 1) * 0.1 + 0.4)); }
        function ringA(hasNow, hasPrev) {
            if (!fresh) return hasNow ? 1 : 0;
            if (hasNow && hasPrev) return 1;
            if (hasNow) return ez(seg(e, 0.3, 0.75));
            if (hasPrev) return 1 - ez(seg(e, 0, 0.35));
            return 0;
        }

        for (l = 1; l <= MAXL; l++) {
            tx('L' + l, ox, top + skRowY(L, l) - 8, L.fsub, P.sub + 'ff', 'left', true);
        }

        for (l = 1; l <= MAXL; l++) {
            var rS = skRails(s.nodes, l);
            var rP = fresh ? skRails(p.nodes, l) : rS;
            var rg = fresh ? railOf(l) : 1;
            var yRail = railY(l);
            var yBox = yRail - 5;
            for (i = 0; i < rS.length; i++) {
                var sg = rS[i];
                var kept = fresh && rP.some(function (q) { return q.id === sg.id; });
                skRailDraw(xOf(sg.a), xOf(sg.b), yRail, yBox, fresh && !kept ? rg : 1, 1);
            }
            if (fresh) {
                for (i = 0; i < rP.length; i++) {
                    var rp = rP[i];
                    if (rS.some(function (q) { return q.id === rp.id; })) continue;
                    skRailDraw(xOf(rp.a), xOf(rp.b), yRail, yBox, 1, 1 - ez(seg(e, 0, 0.5)));
                }
            }
        }

        var nNew = fresh ? Math.max(0, s.path.length - p.path.length) : 0;
        var base = p.path.length;
        var pts = s.path.map(function (pt) { return { x: xOf(skPathKey(pt.i)), y: railY(pt.l) }; });
        if (pts.length > 1) {
            var tip = pts[0];
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (i = 1; i < pts.length; i++) {
                if (i < base) { ctx.lineTo(pts[i].x, pts[i].y); tip = pts[i]; continue; }
                var q = clamp01(e * nNew - (i - base));
                if (q <= 0) break;
                tip = { x: lerp(pts[i - 1].x, pts[i].x, q), y: lerp(pts[i - 1].y, pts[i].y, q) };
                ctx.lineTo(tip.x, tip.y);
                if (q < 1) break;
                tip = pts[i];
            }
            ctx.strokeStyle = P.orange + 'cc';
            ctx.lineWidth = 3;
            ctx.stroke();
            if (fresh && e < 1 && nNew > 0) circ(tip.x, tip.y, 4.5, P.yellow + 'ff', 'none');
        }

        var keysAll = skAllKeys(p, s);
        for (l = 1; l <= MAXL; l++) {
            var cyL = rowY(l);
            for (k = 0; k < keysAll.length; k++) {
                var key = keysAll[k];
                var pS = skHas(s.nodes, key, l);
                var pP = skHas(p.nodes, key, l);
                if (!pS && !pP) continue;
                var a = 1;
                var sc = 1;
                if (fresh && pS && !pP) { a = growOf(l); sc = 0.6 + 0.4 * a; }
                if (fresh && !pS && pP) { a = 1 - ez(seg(e, 0, 0.5)); }
                if (a <= 0) continue;
                var bx = xOf(key);
                var bw2 = L.bw * sc;
                var bh2 = L.bh * sc;
                var base2 = key < 0 ? P.purple : P.teal;
                ctx.globalAlpha = a;
                rr(bx - bw2 / 2, cyL - bh2 / 2, bw2, bh2, 4, P.surf2 + 'ff', base2 + 'ff', 1.4);
                rr(bx - bw2 / 2, cyL - bh2 / 2, bw2, bh2, 4, base2 + '30', 'none');
                var rings = [
                    [pS && key >= 0 && key === s.fresh ? 1 : 0, P.green],
                    [ringA(pS && skPredHas(s, key, l), skPredHas(p, key, l)), P.purple],
                    [ringA(skCurHas(s, key, l), skCurHas(p, key, l)), P.yellow]
                ];
                rings.forEach(function (rg2) {
                    if (rg2[0] <= 0) return;
                    ctx.globalAlpha = a * rg2[0];
                    rr(bx - bw2 / 2 - 1, cyL - bh2 / 2 - 1, bw2 + 2, bh2 + 2, 5, 'none', rg2[1] + 'ff', 2.4);
                });
                ctx.globalAlpha = a;
                tx(key < 0 ? 'H' : String(key), bx, cyL, L.fkey, P.text + 'ff', 'center', true);
            }
        }
        ctx.globalAlpha = 1;

        var idx = steps.indexOf(s);
        var pIdx = steps.indexOf(p);
        var ci = skCoinInfo(steps, idx);
        var keep = fresh && mode === 'insert' ? skCoinInfo(steps, pIdx).n : 0;
        var cyC = top + L.coinH / 2;
        var cx0 = ox;
        var chipT = skChipText(mode, s);
        if (chipT) cx0 = ox + skChip(ox, top + (L.coinH - L.chipH) / 2, L.chipH, chipT, L.fsub) + 8;
        for (k = 0; k < ci.n; k++) {
            var cxk = cx0 + L.cr + k * (2 * L.cr + 5);
            var rv = fresh && k >= keep ? seg(e, 0.05 + (k - keep) * 0.2, 0.25 + (k - keep) * 0.2) : 1;
            var res = ci.list[k];
            if (rv <= 0) { skCoin(cxk, cyC, L.cr, 1, '?', P.sub, 0.4, L.fkey); continue; }
            var sx = Math.abs(Math.cos(rv * Math.PI));
            var face = rv < 0.5 ? '?' : res;
            var faceCol = rv < 0.5 ? P.yellow : (res === '앞' ? P.green : P.sub);
            skCoin(cxk, cyC, L.cr, sx, face, faceCol, 1, L.fkey);
        }

        var capA = fresh ? 0.35 + 0.65 * ez(e) : 1;
        var capX = x0 + w / 2;
        var capY = top + L.capTop;
        ctx.globalAlpha = capA;
        capY = skBlock(s.cap, capX, capY, w, L.fs, L.fs + 5, P.yellow + 'ff', true);
        capY = skBlock(s.cap2, capX, capY, w, L.fsub, L.fsub + 4, P.text + 'ee', false);
        skBlock(s.cap3, capX, capY, w, L.fsub, L.fsub + 4, P.green + 'ff', true);
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
        speedBtns.forEach(function (b) { b.classList.remove('sl-viz__speed-btn--active'); });
        btn.classList.add('sl-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('sl-viz__mode-btn--active', d.key === m); });
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