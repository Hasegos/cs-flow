/**
 * 그래프 색칠 문제 시각화 시각화
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
    var root    = el('div', 'gc-viz');
    var toolbar = el('div', 'gc-viz__toolbar');
    var tbLeft  = el('div', 'gc-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'gc-viz__title', 'GRAPH COLORING'));

    var modeWrap = el('div', 'gc-viz__mode');
    var modeDefs = [
        { key: 'greedy', label: '그리디 색칠' },
        { key: 'order', label: '정점 순서의 영향' },
        { key: 'back', label: '백트래킹' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'gc-viz__mode-btn' + (i === 0 ? ' gc-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'gc-viz__speed');
    speedWrap.appendChild(el('span', 'gc-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'gc-viz__speed-btn' + (i === 0 ? ' gc-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'gc-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'gc-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'gc-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'gc-viz__controls');
    var btnPlay  = el('button', 'gc-viz__btn gc-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'gc-viz__btn', '▶| STEP');
    var btnReset = el('button', 'gc-viz__btn', '↺ RESET');
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
    var mode    = 'greedy';
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

    /* ===================== 엔진: 그래프 색칠 ===================== */
    function ju(n, a, b) {
        return [0, 1, 3, 6, 7, 8].indexOf(Math.abs(n) % 10) >= 0 ? a : b;
    }
    var N = 6;
    var NAMES = ['A', 'B', 'C', 'D', 'E', 'F'];
    var POS = [[0.5, 0.05], [0.2, 0.33], [0.8, 0.33], [0.2, 0.66], [0.8, 0.66], [0.5, 0.95]];
    var EDGES = [[0, 1], [0, 2], [1, 2], [1, 3], [1, 5], [2, 4], [2, 5], [4, 5]];
    var ADJ = [];
    (function () {
        var i;
        for (i = 0; i < N; i++) ADJ.push([]);
        EDGES.forEach(function (e) { ADJ[e[0]].push(e[1]); ADJ[e[1]].push(e[0]); });
        ADJ.forEach(function (a) { a.sort(function (x, y) { return x - y; }); });
    })();
    var DEG_ORDER = [1, 2, 5, 0, 4, 3];
    var NAT_ORDER = [0, 1, 2, 3, 4, 5];
    function zeros() {
        var z = [];
        for (var i = 0; i < N; i++) z.push(0);
        return z;
    }
    function nameList(list) {
        return list.map(function (v) { return NAMES[v]; }).join(', ');
    }
    function orderText(order) {
        return order.map(function (v) { return NAMES[v]; }).join(', ');
    }
    function usedBy(col, v) {
        return ADJ[v].filter(function (u) { return col[u] > 0; });
    }
    function neighborColors(col, v) {
        return usedBy(col, v).map(function (u) { return NAMES[u] + '(색 ' + col[u] + ')'; }).join(', ');
    }
    function usedColors(col, v) {
        var out = [];
        usedBy(col, v).forEach(function (u) { if (out.indexOf(col[u]) < 0) out.push(col[u]); });
        return out.sort(function (x, y) { return x - y; });
    }
    function pickColor(col, v) {
        var used = usedBy(col, v).map(function (u) { return col[u]; });
        var c = 1;
        while (used.indexOf(c) >= 0) c++;
        return c;
    }
    function maxColor(col) {
        var m = 0;
        col.forEach(function (c) { if (c > m) m = c; });
        return m;
    }
    function gstep(col, order, cur, tryC, bad, cap, cap2, cap3, log) {
        return { col: col.slice(), order: order, cur: cur, tryC: tryC, bad: bad, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }
    function greedyRun(order) {
        var col = zeros();
        order.forEach(function (v) { col[v] = pickColor(col, v); });
        return col;
    }

    /* ===================== 데이터: 그리디 색칠 ===================== */
    var GREEDY_STEPS = [];
    (function () {
        var col = zeros();
        var order = DEG_ORDER;
        GREEDY_STEPS.push(gstep(col, order, -1, 0, [], '', '', '', '그래프 색칠은 간선으로 이어진 두 정점이 서로 다른 색을 갖도록 모든 정점에 색을 칠하는 문제이고, 되도록 적은 색을 쓰는 것이 목표입니다. 그리디 방식은 정점을 정해진 순서로 하나씩 보면서 이웃이 쓰지 않는 가장 작은 번호의 색을 칠합니다. 여기서는 이웃이 많은(차수가 큰) 정점부터 ' + orderText(order) + ' 순서로 칠합니다.'));
        order.forEach(function (v) {
            var c = pickColor(col, v);
            var nb = usedBy(col, v);
            var usedList = usedColors(col, v);
            col[v] = c;
            GREEDY_STEPS.push(gstep(col, order, v, c, nb,
                NAMES[v] + ' → 색 ' + c,
                nb.length ? '금지 색 ' + usedList.join(', ') : '금지 색 없음',
                '지금까지 쓴 색 ' + maxColor(col) + '개',
                '정점 ' + NAMES[v] + '의 이웃은 ' + nameList(ADJ[v]) + '입니다. ' + (nb.length ? '이 중 이미 칠해진 이웃은 ' + neighborColors(col, v) + '입니다. 이웃이 쓰는 색은 쓸 수 없으므로 남은 가장 작은 번호인 색 ' + c + ju(c, '을', '를') + ' 칠합니다.' : '아직 칠해진 이웃이 없어 금지된 색이 없으므로 가장 작은 번호인 색 1을 칠합니다.')));
        });
        var maxDeg = 0;
        ADJ.forEach(function (a) { if (a.length > maxDeg) maxDeg = a.length; });
        GREEDY_STEPS.push(gstep(col, order, -1, 0, [], '색 ' + maxColor(col) + '개로 완성', '최대 차수 ' + maxDeg + ' → 그리디는 최대 ' + (maxDeg + 1) + '색 이하', '',
            '정리 — 색 ' + maxColor(col) + '개로 모든 정점을 칠했습니다. 그리디는 정점마다 이웃 수보다 하나 많은 색만 있으면 항상 칠할 수 있으므로, 최대 차수가 ' + maxDeg + '인 이 그래프는 어떤 순서로도 ' + (maxDeg + 1) + '색 이하로 칠합니다. A, B, C는 서로 이웃이라 최소 3색이 필요하므로 이 결과가 최소입니다.'));
    })();

    /* ===================== 데이터: 정점 순서의 영향 ===================== */
    var ORDER_STEPS = [];
    var DEG_COL = greedyRun(DEG_ORDER);
    (function () {
        var col = zeros();
        var order = NAT_ORDER;
        ORDER_STEPS.push(gstep(col, order, -1, 0, [], '', '', '', '같은 그래프를 정점 순서만 바꿔 칠해 봅니다. 그리디가 쓰는 색의 수는 정점을 보는 순서에 따라 달라질 수 있습니다. 먼저 알파벳 순서 ' + orderText(order) + '로 칠합니다.'));
        order.forEach(function (v) {
            var c = pickColor(col, v);
            var nb = usedBy(col, v);
            var usedList = usedColors(col, v);
            col[v] = c;
            var extra = c > 3 ? ' 색 1, 2, 3이 모두 이웃에게 쓰이고 있어 네 번째 색이 필요해집니다.' : '';
            ORDER_STEPS.push(gstep(col, order, v, c, nb,
                NAMES[v] + ' → 색 ' + c,
                nb.length ? '금지 색 ' + usedList.join(', ') : '금지 색 없음',
                '지금까지 쓴 색 ' + maxColor(col) + '개',
                '정점 ' + NAMES[v] + (nb.length ? '의 칠해진 이웃은 ' + neighborColors(col, v) + '입니다. 이웃이 쓰는 색을 뺀 가장 작은 번호인 색 ' + c + ju(c, '을', '를') + ' 칠합니다.' : '는 아직 칠해진 이웃이 없어 색 1을 칠합니다.') + extra));
        });
        ORDER_STEPS.push(gstep(DEG_COL, DEG_ORDER, -1, 0, [], '순서를 ' + orderText(DEG_ORDER) + '로 바꾸면 색 ' + maxColor(DEG_COL) + '개', '알파벳 순서는 색 ' + maxColor(col) + '개', '',
            '정리 — 알파벳 순서로는 색 ' + maxColor(col) + '개가 필요했지만, 차수가 큰 ' + orderText(DEG_ORDER) + ' 순서로 칠하면 색 ' + maxColor(DEG_COL) + '개로 끝납니다. 그리디는 순서에 따라 최소보다 많은 색을 쓸 수 있습니다. 이웃이 많은 정점부터 보는 순서는 Welsh-Powell 방법으로 알려져 있지만, 이것도 항상 최소 색을 보장하지는 않습니다.'));
    })();

    /* ===================== 데이터: 백트래킹 ===================== */
    var BACK_STEPS = [];
    var BACK_M = 3;
    (function () {
        var col = zeros();
        var attempts = 0;
        var backs = 0;
        BACK_STEPS.push(gstep(col, NAT_ORDER, -1, 0, [], '', '', '', '백트래킹은 정점을 순서대로 보며 색을 하나씩 시도합니다. 이웃과 충돌하면 다음 색을 시도하고, 모든 색이 충돌하면 앞 정점에서 한 선택을 취소하고(되돌아가기) 다른 색을 시도합니다. 색을 ' + BACK_M + '가지(색 1~' + BACK_M + ')만 써서 ' + orderText(NAT_ORDER) + ' 순서로 칠할 수 있는지 찾습니다.'));
        function rec(v) {
            if (v === N) return true;
            var c;
            for (c = 1; c <= BACK_M; c++) {
                var bad = ADJ[v].filter(function (u) { return col[u] === c; });
                attempts++;
                if (bad.length) {
                    BACK_STEPS.push(gstep(col, NAT_ORDER, v, c, bad, NAMES[v] + ' · 색 ' + c + ' 시도', '충돌: ' + nameList(bad) + '가 색 ' + c + ' 사용', '시도 ' + attempts + '번 · 되돌아간 횟수 ' + backs,
                        '정점 ' + NAMES[v] + '에 색 ' + c + ju(c, '을', '를') + ' 시도합니다. 이웃 ' + nameList(bad) + '가 이미 색 ' + c + ju(c, '을', '를') + ' 쓰고 있어 충돌하므로 다음 색으로 넘어갑니다.'));
                } else {
                    col[v] = c;
                    BACK_STEPS.push(gstep(col, NAT_ORDER, v, c, [], NAMES[v] + ' · 색 ' + c + ' 시도', '충돌 없음 → 색 ' + c + ' 배정', '시도 ' + attempts + '번 · 되돌아간 횟수 ' + backs,
                        '정점 ' + NAMES[v] + '에 색 ' + c + ju(c, '을', '를') + ' 시도합니다. 칠해진 이웃과 겹치지 않으므로 배정하고 다음 정점으로 넘어갑니다.'));
                    if (rec(v + 1)) return true;
                    col[v] = 0;
                    backs++;
                    BACK_STEPS.push(gstep(col, NAT_ORDER, v, 0, [], '되돌아가기 · ' + NAMES[v] + '의 색 취소', '다음 색을 시도', '시도 ' + attempts + '번 · 되돌아간 횟수 ' + backs,
                        '정점 ' + NAMES[v + 1] + '에 쓸 수 있는 색이 없습니다. 앞 정점 ' + NAMES[v] + '의 색 ' + c + ' 선택을 취소하고(되돌아가기) ' + NAMES[v] + '에 다음 색을 시도합니다.'));
                }
            }
            return false;
        }
        rec(0);
        BACK_STEPS.push(gstep(col, NAT_ORDER, -1, 0, [], BACK_M + '색으로 완성', '시도 ' + attempts + '번 · 되돌아간 횟수 ' + backs, '',
            '정리 — 색 ' + BACK_M + '개로 모든 정점을 칠했고, 되돌아간 것은 ' + backs + '번입니다. 되돌아가기 덕분에 한 번 잘못 고른 색도 고칠 수 있습니다. 대신 최악에는 ' + BACK_M + '^' + N + '가지 배정을 모두 살펴봐야 해서 정점이 많아지면 시간이 급격히 늘어납니다.'));
    })();

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'order') return ORDER_STEPS;
        if (mode === 'back') return BACK_STEPS;
        return GREEDY_STEPS;
    }
    function defaultLog() {
        if (mode === 'order') return '같은 그래프를 정점 순서만 바꿔 칠하면 필요한 색의 수가 어떻게 달라지는지 봅니다.';
        if (mode === 'back') return '색을 시도하다 막히면 되돌아가 다른 색을 시도하는 백트래킹을 봅니다.';
        return '이웃이 쓰지 않는 가장 작은 번호의 색을 정점마다 칠하는 그리디 방식을 봅니다.';
    }

    /* ===================== 색과 시간 ===================== */
    var gcCols = ['', 'teal', 'orange', 'purple', 'red', 'yellow'];
    function gcCol(c) { return P[gcCols[c]] || P.sub; }
    function ez(q) { var v = clamp01(q); return v * v * (3 - 2 * v); }

    /* ===================== 레이아웃 ===================== */
    var gcCapMemo = {};
    function gcFs(mob) { return mob ? 11.5 : 13; }
    function gcSub(mob) { return mob ? 11 : 12; }
    function gcR(mob) { return mob ? 17 : 21; }
    function gcPalN() {
        var m = 3;
        currentSteps().forEach(function (s) { var k = maxColor(s.col); if (k > m) m = k; });
        return m;
    }
    function gcCapH(s, w, mob) {
        var fs = gcFs(mob), fsub = gcSub(mob), h = 0;
        if (s.cap) h += lines(s.cap, w - 8, fs).length * (fs + 5);
        if (s.cap2) h += lines(s.cap2, w - 8, fsub).length * (fsub + 4);
        if (s.cap3) h += lines(s.cap3, w - 8, fsub).length * (fsub + 4);
        return h;
    }
    function gcCapMax(w, mob) {
        var key = Math.round(w) + (mob ? 'm' : 'd');
        if (gcCapMemo[key] === undefined) {
            var best = 0;
            [GREEDY_STEPS, ORDER_STEPS, BACK_STEPS].forEach(function (arr) {
                arr.forEach(function (s) { var h = gcCapH(s, w, mob); if (h > best) best = h; });
            });
            gcCapMemo[key] = best;
        }
        return gcCapMemo[key];
    }
    function layout(w, mob) {
        var palH = mob ? 28 : 32;
        var gh = mob ? 170 : 210;
        var stripH = mob ? 32 : 36;
        var gY = palH + 12;
        var stripY = gY + gh + 12;
        var capY = stripY + stripH + 12;
        return {
            fs: gcFs(mob), fsub: gcSub(mob), r: gcR(mob),
            palH: palH, gY: gY, gh: gh, stripY: stripY, stripH: stripH, capY: capY,
            total: capY + gcCapMax(w, mob) + 6
        };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 기하 ===================== */
    function gcGeom(x0, top, w, mob) {
        var L = layout(w, mob);
        var r = L.r;
        var n = gcPalN();
        var sw = Math.min(70, (w - 8) / n);
        return {
            L: L, x0: x0, w: w, top: top, r: r, mob: mob, fs: L.fs, fsub: L.fsub,
            n: n, sw: sw, palX0: x0 + (w - sw * n) / 2,
            gx: x0 + r + 6, gw: w - 2 * (r + 6),
            gy: top + L.gY + r + 4, gih: L.gh - 2 * r - 8
        };
    }
    function gcPX(g, v) { return g.gx + POS[v][0] * g.gw; }
    function gcPY(g, v) { return g.gy + POS[v][1] * g.gih; }
    function gcSwX(g, c) { return g.palX0 + (c - 1) * g.sw + g.sw / 2; }

    /* ===================== 칠해진 색 ===================== */
    function gcShown(p, s, i, fresh, e) {
        var a = p.col[i], b = s.col[i];
        if (!fresh || a === b) return { c: b, k: 1 };
        if (b === 0) return { c: a, k: 1 - ez(seg(e, 0, 0.5)) };
        if (a === 0) return { c: b, k: e < 0.6 ? 0 : 1 };
        return { c: e < 0.5 ? a : b, k: 1 };
    }

    /* ===================== 색 팔레트 ===================== */
    function gcPalette(g, s) {
        var forb = [];
        s.bad.forEach(function (u) { if (forb.indexOf(s.col[u]) < 0) forb.push(s.col[u]); });
        var c;
        for (c = 1; c <= g.n; c++) {
            var x = g.palX0 + (c - 1) * g.sw + 3;
            var bw = g.sw - 6;
            var isF = forb.indexOf(c) >= 0;
            rr(x, g.top, bw, g.L.palH, 6, gcCol(c) + '22', gcCol(c) + 'aa', 1.4);
            if (isF) rr(x, g.top, bw, g.L.palH, 6, P.red + '22', P.red + 'ff', 2);
            if (s.cur >= 0 && s.tryC === c) rr(x - 2, g.top - 2, bw + 4, g.L.palH + 4, 7, 'none', P.yellow + 'ff', 2.4);
            tx('색 ' + c + (isF ? ' ×' : ''), gcSwX(g, c), g.top + g.L.palH / 2, g.fsub, (isF ? P.red : P.text) + 'ff', 'center', true);
        }
    }

    /* ===================== 간선과 정점 ===================== */
    function gcEdges(g, s, fresh, e) {
        var k = fresh ? ez(seg(e, 0, 0.3)) : 1;
        EDGES.forEach(function (ed) {
            var hot = s.cur >= 0 && ((ed[0] === s.cur && s.bad.indexOf(ed[1]) >= 0) || (ed[1] === s.cur && s.bad.indexOf(ed[0]) >= 0));
            ctx.globalAlpha = hot ? k : 1;
            ctx.beginPath();
            ctx.moveTo(gcPX(g, ed[0]), gcPY(g, ed[0]));
            ctx.lineTo(gcPX(g, ed[1]), gcPY(g, ed[1]));
            ctx.strokeStyle = hot ? P.red + 'ff' : P.sub + '88';
            ctx.lineWidth = hot ? 3 : 1.6;
            ctx.stroke();
        });
        ctx.globalAlpha = 1;
    }
    function gcNodes(g, s, p, fresh, e, isLast) {
        var r = g.r, i;
        var bk = fresh ? ez(seg(e, 0, 0.3)) : 1;
        for (i = 0; i < N; i++) {
            var px = gcPX(g, i), py = gcPY(g, i);
            var sh = gcShown(p, s, i, fresh, e);
            var showC = sh.c > 0 && sh.k > 0;
            var isCur = i === s.cur;
            circ(px, py, r, P.surf2, (isCur ? P.yellow : P.sub) + 'ff', isCur ? 3 : 1.8);
            if (showC) {
                ctx.globalAlpha = sh.k;
                circ(px, py, r, gcCol(sh.c) + '55', isCur ? 'none' : gcCol(sh.c) + 'ff', 2.4);
                ctx.globalAlpha = 1;
            }
            if (s.bad.indexOf(i) >= 0) {
                ctx.globalAlpha = bk;
                ctx.setLineDash([3, 3]);
                circ(px, py, r + 4, 'none', P.red + 'ff', 1.8);
                ctx.setLineDash([]);
                ctx.globalAlpha = 1;
            }
            if (fresh && p.col[i] === 0 && s.col[i] > 0 && e >= 0.6) {
                var lk = seg(e, 0.6, 1);
                ctx.globalAlpha = 1 - lk;
                circ(px, py, r + 2 + 10 * lk, 'none', gcCol(s.col[i]) + 'ff', 2);
                ctx.globalAlpha = 1;
            }
            if (isLast && fresh) {
                ctx.globalAlpha = Math.sin(Math.PI * seg(e, i * 0.1, i * 0.1 + 0.5));
                circ(px, py, r + 7, 'none', P.green + 'ff', 2);
                ctx.globalAlpha = 1;
            }
            tx(NAMES[i], px, showC ? py - 6 : py, g.fs + 1, P.text + 'ff', 'center', true);
            if (showC) {
                ctx.globalAlpha = sh.k;
                tx(String(sh.c), px, py + 8, g.fs, P.text + 'ff', 'center', true);
                ctx.globalAlpha = 1;
            }
        }
    }

    /* ===================== 시도 칩 ===================== */
    function gcChip(g, s, p, fresh, e) {
        var cur = s.cur;
        if (!fresh || cur < 0 || s.tryC <= 0) return;
        var conflict = s.bad.length > 0 && s.col[cur] === 0;
        var assign = s.col[cur] === s.tryC && p.col[cur] === 0;
        var q;
        if (assign) {
            if (e >= 0.6) return;
            q = ez(seg(e, 0.05, 0.6));
        } else if (conflict) {
            q = 0.6 * Math.sin(Math.PI * seg(e, 0.1, 0.9));
        } else {
            return;
        }
        var x = lerp(gcSwX(g, s.tryC), gcPX(g, cur), q);
        var y = lerp(g.top + g.L.palH / 2, gcPY(g, cur), q);
        circ(x, y, 8, gcCol(s.tryC) + 'ff', (conflict ? P.red : P.text) + 'ff', 2);
    }

    /* ===================== 정점 순서 띠 ===================== */
    function gcStrip(g, s, p, fresh, e) {
        var lw = g.mob ? 30 : 36;
        var cw = Math.min(50, (g.w - lw - 4) / N);
        var bx0 = g.x0 + lw + (g.w - lw - cw * N) / 2;
        var y = g.top + g.L.stripY;
        var h = g.L.stripH;
        var v;
        tx('순서', g.x0, y + h / 2, g.fsub, P.sub + 'ee', 'left', true);
        for (v = 0; v < N; v++) {
            var fk = p.order.indexOf(v);
            var tk = s.order.indexOf(v);
            var moved = fresh && fk !== tk;
            var idx = !moved ? tk : (e < 0.5 ? fk : tk);
            var al = !moved ? 1 : (e < 0.5 ? 1 - ez(seg(e, 0, 0.5)) : ez(seg(e, 0.5, 1)));
            var bx = bx0 + idx * cw;
            var sh = gcShown(p, s, v, fresh, e);
            var isC = v === s.cur;
            ctx.globalAlpha = al;
            rr(bx + 2, y, cw - 4, h, 4, sh.c > 0 ? gcCol(sh.c) + '33' : 'none',
                (isC ? P.yellow : sh.c > 0 ? gcCol(sh.c) : P.sub) + (isC || sh.c > 0 ? 'ff' : '88'), isC ? 2.4 : 1.3);
            tx(NAMES[v], bx + cw / 2, y + h * 0.32, g.fs, P.text + 'ff', 'center', true);
            tx(sh.c > 0 ? '색 ' + sh.c : '·', bx + cw / 2, y + h * 0.74, g.fsub, (sh.c > 0 ? gcCol(sh.c) : P.sub) + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        }
        var curK = s.cur >= 0 ? s.order.indexOf(s.cur) : -1;
        var prevK = p.cur >= 0 ? p.order.indexOf(p.cur) : -1;
        var pk = -1, pa = 0;
        if (!fresh) {
            if (curK >= 0) { pk = curK; pa = 1; }
        } else if (curK >= 0 && prevK >= 0) {
            pk = lerp(prevK, curK, ez(seg(e, 0, 0.6))); pa = 1;
        } else if (curK >= 0) {
            pk = curK; pa = ez(seg(e, 0, 0.4));
        } else if (prevK >= 0) {
            pk = prevK; pa = 1 - ez(seg(e, 0, 0.4));
        }
        if (pa > 0.01) {
            var ax = bx0 + pk * cw + cw / 2;
            ctx.globalAlpha = pa;
            ctx.beginPath();
            ctx.moveTo(ax, y - 2);
            ctx.lineTo(ax - 5, y - 8);
            ctx.lineTo(ax + 5, y - 8);
            ctx.closePath();
            ctx.fillStyle = P.yellow + 'ff';
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    /* ===================== 설명 문구 ===================== */
    function gcBlock(str, cx, y, w, fs, lh, col, bold) {
        if (!str) return y;
        var rows = lines(str, w - 8, fs);
        rows.forEach(function (row, li) { tx(row, cx, y + li * lh + lh / 2, fs, col, 'center', bold); });
        return y + rows.length * lh;
    }
    function gcCaps(g, s, fresh, e) {
        var cx = g.x0 + g.w / 2;
        var y = g.top + g.L.capY;
        ctx.globalAlpha = fresh ? 0.35 + 0.65 * ez(e) : 1;
        y = gcBlock(s.cap, cx, y, g.w, g.fs, g.fs + 5, P.yellow + 'ff', true);
        y = gcBlock(s.cap2, cx, y, g.w, g.fsub, g.fsub + 4, P.text + 'ee', false);
        gcBlock(s.cap3, cx, y, g.w, g.fsub, g.fsub + 4, P.green + 'ff', true);
        ctx.globalAlpha = 1;
    }

    /* ===================== 메인 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var steps = currentSteps();
        var s = step || steps[0];
        var p = prev || s;
        var fresh = s !== p;
        var e = fresh ? clamp01(t) : 1;
        var isLast = steps.indexOf(s) === steps.length - 1;
        var g = gcGeom(x0, top, w, mob);
        gcPalette(g, s);
        gcEdges(g, s, fresh, e);
        gcNodes(g, s, p, fresh, e, isLast);
        gcChip(g, s, p, fresh, e);
        gcStrip(g, s, p, fresh, e);
        gcCaps(g, s, fresh, e);
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
        speedBtns.forEach(function (b) { b.classList.remove('gc-viz__speed-btn--active'); });
        btn.classList.add('gc-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('gc-viz__mode-btn--active', d.key === m); });
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