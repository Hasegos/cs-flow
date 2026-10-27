/**
 * 벨만-포드 시각화 시각화
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
    var root    = el('div', 'bf-viz');
    var toolbar = el('div', 'bf-viz__toolbar');
    var tbLeft  = el('div', 'bf-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'bf-viz__title', 'BELLMAN-FORD'));

    var modeWrap = el('div', 'bf-viz__mode');
    var modeDefs = [
        { key: 'rounds', label: '라운드 반복' },
        { key: 'edge', label: '간선 완화' },
        { key: 'neg', label: '음수 사이클' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'bf-viz__mode-btn' + (i === 0 ? ' bf-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'bf-viz__speed');
    speedWrap.appendChild(el('span', 'bf-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'bf-viz__speed-btn' + (i === 0 ? ' bf-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'bf-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'bf-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'bf-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'bf-viz__controls');
    var btnPlay  = el('button', 'bf-viz__btn bf-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'bf-viz__btn', '▶| STEP');
    var btnReset = el('button', 'bf-viz__btn', '↺ RESET');
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
    var mode    = 'rounds';
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

    /* ===================== 엔진: 벨만-포드 ===================== */
    var N = 5;
    var NAMES = ['S', 'A', 'B', 'C', 'D'];
    var POS = [[0.07, 0.5], [0.37, 0.1], [0.37, 0.9], [0.68, 0.2], [0.93, 0.8]];
    var EDGES = [[3, 4, 2], [2, 3, 4], [1, 2, -3], [0, 1, 4], [0, 2, 5], [1, 3, 8], [2, 4, 7]];
    var NEG_EDGES = EDGES.concat([[2, 1, 1]]);
    var INF = 1000000000;
    function fmt(x) {
        return x >= INF ? '∞' : String(x);
    }
    function initD() {
        return [0, INF, INF, INF, INF];
    }
    function edgeText(e) {
        return NAMES[e[0]] + ' → ' + NAMES[e[1]] + ' (' + e[2] + ')';
    }
    function dText(d) {
        return d.map(function (x, i) { return NAMES[i] + ' ' + fmt(x); }).join(', ');
    }
    function bstep(edges, d, prev, hot, upd, cap, cap2, cap3, log) {
        return { edges: edges, d: d.slice(), prev: prev.slice(), hot: hot, upd: upd, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }
    function roundOnce(edges, d) {
        var upd = [];
        var lines = [];
        edges.forEach(function (e, i) {
            if (d[e[0]] < INF && d[e[0]] + e[2] < d[e[1]]) {
                lines.push(edgeText(e) + ': d[' + NAMES[e[1]] + '] ' + fmt(d[e[1]]) + ' → ' + (d[e[0]] + e[2]));
                d[e[1]] = d[e[0]] + e[2];
                upd.push(i);
            }
        });
        return { upd: upd, lines: lines };
    }

    /* ===================== 데이터: 라운드 반복 ===================== */
    function buildRounds(edges, steps, intro) {
        var d = initD();
        var r;
        steps.push(bstep(edges, d, d, [], [], '시작: 출발 정점 S의 거리만 0', '나머지는 아직 닿지 못해 ∞', '원 안의 숫자 = 현재 거리 d', intro));
        for (r = 1; r <= N; r++) {
            var prev = d.slice();
            var res = roundOnce(edges, d);
            var check = r === N;
            steps.push(bstep(edges, d, prev, [], res.upd, check ? '확인 라운드(' + r + '번째)' : '라운드 ' + r + '/' + (N - 1) + ' 끝', res.upd.length ? '갱신된 간선 ' + res.upd.length + '개 (초록색)' : '갱신된 간선 없음', check ? (res.upd.length ? '거리가 계속 줄어듭니다' : '더 줄일 거리가 없습니다') : '', (check ? '확인 라운드 — ' : '라운드 ' + r + ' — ') + '간선을 목록 순서대로 한 번씩 완화했습니다. ' + (res.lines.length ? res.lines.join(', ') + '.' : '갱신된 거리가 없습니다.') + (check ? (res.upd.length ? ' V-1번 반복한 뒤에도 거리가 줄어듭니다.' : ' V-1번 반복한 뒤에는 더 줄어드는 거리가 없습니다.') : '')));
        }
        return d;
    }
    var ROUND_STEPS = [];
    (function () {
        var d = buildRounds(EDGES, ROUND_STEPS, '벨만-포드 알고리즘은 모든 간선을 한 번씩 완화(relax)하는 라운드를 V-1번 반복합니다. 간선 u → v의 완화는 d[u] + 가중치가 d[v]보다 작으면 d[v]를 그 값으로 줄이는 일입니다. 정점 5개이므로 라운드를 4번 돌리고, 5번째로 한 번 더 확인합니다. 간선은 화면에 적힌 가중치 그대로 목록 순서(C → D, B → C, A → B, …)로 확인합니다.');
        ROUND_STEPS.push(bstep(EDGES, d, d, [], [], '최단 거리 확정', dText(d), '음수 사이클 없음', '정리 — 최단 거리는 ' + dText(d) + '입니다. 음수 간선 A → B(-3)가 있어도 정답을 구했고, 이 예에서는 간선 순서가 불리해 4라운드가 모두 필요했습니다. 라운드마다 간선 E개를 확인하므로 O(VE)입니다. 확인 라운드에서도 갱신이 없어 음수 사이클이 없다고 판단합니다.'));
    })();

    /* ===================== 데이터: 간선 완화 ===================== */
    var EDGE_STEPS = [];
    (function () {
        var d = initD();
        roundOnce(EDGES, d);
        var start = d.slice();
        EDGE_STEPS.push(bstep(EDGES, d, d, [], [], '라운드 2를 간선 하나씩 확인', '시작 거리: ' + dText(d), '', '라운드 1이 끝난 상태에서 라운드 2의 간선을 하나씩 완화해 봅니다. 완화는 간선 u → v에 대해 d[u] + 가중치와 현재 d[v]를 비교해, 더 작을 때만 d[v]를 갱신합니다. 앞에서 갱신된 값은 같은 라운드의 뒤쪽 간선에서 바로 쓰입니다.'));
        EDGES.forEach(function (e, i) {
            var prev = d.slice();
            var u = e[0];
            var v = e[1];
            var msg;
            var cap2;
            var upd = [];
            if (d[u] >= INF) {
                msg = '간선 ' + edgeText(e) + ' 확인: 출발 쪽 d[' + NAMES[u] + ']가 ∞라 아직 이 간선으로 갈 수 없어 건너뜁니다.';
                cap2 = '건너뜀 (출발 거리 ∞)';
            } else {
                var cand = d[u] + e[2];
                msg = '간선 ' + edgeText(e) + ' 확인: d[' + NAMES[u] + '] + (' + e[2] + ') = ' + d[u] + ' + (' + e[2] + ') = ' + cand + ', 현재 d[' + NAMES[v] + '] = ' + fmt(d[v]) + '. ';
                if (cand < d[v]) {
                    msg += cand + ' < ' + fmt(d[v]) + '이므로 갱신합니다: d[' + NAMES[v] + '] ' + fmt(d[v]) + ' → ' + cand + '.';
                    cap2 = '갱신 ' + fmt(d[v]) + ' → ' + cand + ' (초록색)';
                    d[v] = cand;
                    upd = [i];
                } else {
                    msg += cand + ' ≥ ' + fmt(d[v]) + '이므로 그대로 둡니다.';
                    cap2 = '비교 ' + cand + ' ≥ ' + fmt(d[v]) + ' → 변화 없음';
                }
            }
            EDGE_STEPS.push(bstep(EDGES, d, prev, [i], upd, '완화: ' + edgeText(e), cap2, '', msg));
        });
        EDGE_STEPS.push(bstep(EDGES, d, start, [], [], '라운드 2 끝', dText(d), '', '정리 — 라운드 2에서 C, B, D의 거리가 줄었습니다. B → C(4)는 A → B(-3)보다 목록에서 앞이라 아직 d[B] = 5를 써서 d[C]를 9까지만 줄였고, 이어지는 라운드 3에서야 d[B] = 1을 반영해 5가 됩니다. 간선 순서에 따라 같은 일에 필요한 라운드 수가 달라지지만, 음수 사이클이 없으면 최단 경로는 간선이 많아야 V-1개이므로 V-1번이면 충분합니다.'));
    })();

    /* ===================== 데이터: 음수 사이클 ===================== */
    var NEG_STEPS = [];
    (function () {
        var d = buildRounds(NEG_EDGES, NEG_STEPS, '같은 그래프에 B → A(1) 간선을 더했습니다. 이제 A → B(-3)와 B → A(1)가 A → B → A 순환을 이루고 그 합은 -3 + 1 = -2로 음수입니다. 이런 음수 사이클을 한 바퀴 돌 때마다 거리가 2씩 줄어들어 최단 거리가 정해지지 않습니다. 라운드 4번 뒤에 한 번 더 완화해 갱신이 일어나는지 봅니다.');
        NEG_STEPS.push(bstep(NEG_EDGES, d, d, [], [], '음수 사이클 발견', '확인 라운드에서도 거리가 줄었음', '최단 거리가 정해지지 않음', '정리 — V-1번 라운드를 돌린 뒤에도 완화가 일어났습니다. 음수 사이클이 없다면 V-1번이면 모든 최단 거리가 확정되므로, 이는 출발 정점에서 닿을 수 있는 음수 사이클이 있다는 신호입니다. 이때는 최단 거리가 정의되지 않으므로 알고리즘은 사이클이 있다고 보고합니다.'));
    })();

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'edge') return EDGE_STEPS;
        if (mode === 'neg') return NEG_STEPS;
        return ROUND_STEPS;
    }
    function defaultLog() {
        if (mode === 'edge') return '간선 하나를 완화할 때 거리를 비교하고 갱신하는 과정을 봅니다.';
        if (mode === 'neg') return '음수 사이클이 있을 때 V-1번 뒤에도 거리가 줄어드는 모습을 봅니다.';
        return '모든 간선을 한 번씩 완화하는 라운드를 V-1번 반복하는 과정을 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    var bfCapMemo = {};
    function ez(q) { var v = clamp01(q); return v * v * (3 - 2 * v); }
    function bfFs(mob) { return mob ? 11.5 : 13; }
    function bfSub(mob) { return mob ? 11 : 12; }
    function bfR(mob) { return mob ? 20 : 23; }
    function bfCapH(s, w, mob) {
        var fs = bfFs(mob);
        var fsub = bfSub(mob);
        var h = 0;
        if (s.cap) h += lines(s.cap, w - 8, fs).length * (fs + 5);
        if (s.cap2) h += lines(s.cap2, w - 8, fsub).length * (fsub + 4);
        if (s.cap3) h += lines(s.cap3, w - 8, fsub).length * (fsub + 4);
        return h;
    }
    function bfCapMax(w, mob) {
        var key = Math.round(w) + (mob ? 'm' : 'd');
        if (bfCapMemo[key] === undefined) {
            var best = 0;
            [ROUND_STEPS, EDGE_STEPS, NEG_STEPS].forEach(function (arr) {
                arr.forEach(function (s) {
                    var h = bfCapH(s, w, mob);
                    if (h > best) best = h;
                });
            });
            bfCapMemo[key] = best;
        }
        return bfCapMemo[key];
    }
    function layout(w, mob) {
        var trackH = mob ? 18 : 22;
        var gh = mob ? 190 : 240;
        var fsub = bfSub(mob);
        var capTop = trackH + 8 + gh + 6;
        return {
            fs: bfFs(mob), fsub: fsub, r: bfR(mob), trackH: trackH,
            graphTop: trackH + 8, gh: gh, eqH: fsub + 8, capTop: capTop,
            total: capTop + fsub + 8 + bfCapMax(w, mob) + 6
        };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 기하 ===================== */
    function bfGeom(x0, top, w, mob) {
        var L = layout(w, mob);
        var r = L.r;
        return {
            L: L, x0: x0, w: w, top: top, r: r, fs: L.fs, fsub: L.fsub,
            gx: x0 + r + 6, gw: w - 2 * (r + 6),
            gy0: top + L.graphTop + r + 6, gih: L.gh - 2 * r - 12,
            capY: top + L.capTop
        };
    }
    function bfPX(g, v) { return g.gx + POS[v][0] * g.gw; }
    function bfPY(g, v) { return g.gy0 + POS[v][1] * g.gih; }
    function bfFind(list, u, v) {
        var i;
        for (i = 0; i < list.length; i++) {
            if (list[i][0] === u && list[i][1] === v) return i;
        }
        return -1;
    }
    function bfEnds(g, edges, k) {
        var e0 = edges[k];
        var rev = bfFind(edges, e0[1], e0[0]) >= 0;
        var off = rev ? (e0[0] < e0[1] ? 5 : -5) : 0;
        var ax = bfPX(g, e0[0]);
        var ay = bfPY(g, e0[0]);
        var bx = bfPX(g, e0[1]);
        var by = bfPY(g, e0[1]);
        var a0 = Math.atan2(by - ay, bx - ax);
        var nx = -Math.sin(a0) * off;
        var ny = Math.cos(a0) * off;
        ax += nx; ay += ny; bx += nx; by += ny;
        var ang = Math.atan2(by - ay, bx - ax);
        var sx = ax + Math.cos(ang) * g.r;
        var sy = ay + Math.sin(ang) * g.r;
        var ex = bx - Math.cos(ang) * (g.r + 3);
        var ey = by - Math.sin(ang) * (g.r + 3);
        return {
            sx: sx, sy: sy, ex: ex, ey: ey,
            mx: (sx + ex) / 2 - Math.sin(ang) * 11,
            my: (sy + ey) / 2 + Math.cos(ang) * 11
        };
    }

    /* ===================== 추적 행 ===================== */
    function bfTrack(g, idx, fresh, e) {
        var edgeMode = mode === 'edge';
        var n = edgeMode ? EDGES.length : N;
        var cur = (idx >= 1 && idx <= n) ? idx - 1 : -1;
        var allDone = idx > n;
        var gap = 4;
        var cw = Math.min(56, (g.w - gap * (n - 1)) / n);
        var total = cw * n + gap * (n - 1);
        var x = g.x0 + (g.w - total) / 2;
        var h = g.L.trackH;
        var j;
        for (j = 0; j < n; j++) {
            var cx = x + j * (cw + gap);
            var label = edgeMode ? NAMES[EDGES[j][0]] + '→' + NAMES[EDGES[j][1]] : String(j + 1);
            var done = allDone || j < cur;
            if (j === cur) {
                ctx.globalAlpha = fresh ? ez(seg(e, 0, 0.5)) : 1;
                rr(cx, g.top, cw, h, 4, P.yellow + '55', P.yellow + 'ff', 2);
                ctx.globalAlpha = 1;
            } else if (done) {
                rr(cx, g.top, cw, h, 4, P.green + '33', P.green + 'aa', 1.2);
            } else {
                rr(cx, g.top, cw, h, 4, 'none', P.sub + '55', 1.2);
            }
            tx(label, cx + cw / 2, g.top + h / 2, g.fsub, (j === cur || done ? P.text : P.sub) + 'ff', 'center', j === cur);
        }
    }

    /* ===================== 간선과 이동 점 ===================== */
    function bfEdges(g, s, cyc) {
        var k;
        for (k = 0; k < s.edges.length; k++) {
            var en = bfEnds(g, s.edges, k);
            var w = s.edges[k][2];
            var isHot = s.hot.indexOf(k) >= 0;
            var isUpd = s.upd.indexOf(k) >= 0;
            var isCyc = cyc.indexOf(k) >= 0;
            var col = isCyc ? P.red + 'ff' : isHot ? P.yellow + 'ff' : isUpd ? P.green + 'ff' : P.sub + 'aa';
            arrow(en.sx, en.sy, en.ex, en.ey, col, (isHot || isUpd || isCyc) ? 3 : 1.6);
            tx(String(w), en.mx, en.my, g.fs, (w < 0 ? P.red : P.text) + 'ff', 'center', true);
        }
    }
    function bfDot(x, y, col) {
        circ(x, y, 9, col + '44', 'none');
        circ(x, y, 5, col + 'ff', 'none');
    }
    function bfPackets(g, s, fresh, e, cycle, ab, ba) {
        if (!fresh) return;
        if (cycle) {
            if (e >= 1) return;
            var lg = e < 0.5 ? ab : ba;
            var lq = (e * 2) % 1;
            var ce = bfEnds(g, s.edges, lg);
            bfDot(lerp(ce.sx, ce.ex, lq), lerp(ce.sy, ce.ey, lq), P.red);
            return;
        }
        if (s.hot.length) {
            var h = s.hot[0];
            var en = bfEnds(g, s.edges, h);
            var src = s.edges[h][0];
            var q;
            if (s.upd.indexOf(h) >= 0) {
                if (e < 0.6) {
                    q = ez(seg(e, 0, 0.6));
                    bfDot(lerp(en.sx, en.ex, q), lerp(en.sy, en.ey, q), P.green);
                }
            } else if (s.prev[src] < INF) {
                q = 0.6 * Math.sin(Math.PI * seg(e, 0, 0.7));
                if (q > 0.01) bfDot(lerp(en.sx, en.ex, q), lerp(en.sy, en.ey, q), P.yellow);
            } else {
                ctx.globalAlpha = 1 - seg(e, 0.3, 1);
                circ(bfPX(g, src), bfPY(g, src), g.r + 6 * ez(e), 'none', P.sub + 'ff', 1.6);
                ctx.globalAlpha = 1;
            }
            return;
        }
        s.upd.forEach(function (j) {
            if (e >= 0.6) return;
            var en2 = bfEnds(g, s.edges, j);
            var q2 = ez(seg(e, 0, 0.6));
            bfDot(lerp(en2.sx, en2.ex, q2), lerp(en2.sy, en2.ey, q2), P.green);
        });
    }

    /* ===================== 정점 ===================== */
    function bfNodes(g, s, before, fresh, e, sweep) {
        var k = fresh ? ez(seg(e, 0.6, 1)) : 1;
        var i;
        for (i = 0; i < N; i++) {
            var px = bfPX(g, i);
            var py = bfPY(g, i);
            var after = s.d[i];
            var old = before[i];
            var changed = after !== s.prev[i];
            var reached = (fresh && k < 0.5) ? old < INF : after < INF;
            circ(px, py, g.r, reached ? P.teal + '44' : P.surf2, reached ? P.teal + 'ff' : P.sub + 'ff', 2);
            if (changed) {
                ctx.globalAlpha = k;
                circ(px, py, g.r + (fresh ? 3 * Math.sin(Math.PI * k) : 0), P.yellow + '55', P.yellow + 'ff', 3.2);
                ctx.globalAlpha = 1;
            }
            if (sweep && fresh) {
                ctx.globalAlpha = Math.sin(Math.PI * seg(e, i * 0.12, i * 0.12 + 0.5));
                circ(px, py, g.r + 4, 'none', P.green + 'ff', 2.4);
                ctx.globalAlpha = 1;
            }
            tx(NAMES[i], px, py - 8, g.fs + 1, P.text + 'ff', 'center', true);
            if (changed && fresh && old !== after) {
                ctx.globalAlpha = 1 - k;
                tx(fmt(old), px, py + 10 - 8 * k, g.fs, P.green + 'ff', 'center', true);
                ctx.globalAlpha = k;
                tx(fmt(after), px, py + 10 + 8 * (1 - k), g.fs, P.yellow + 'ff', 'center', true);
                ctx.globalAlpha = 1;
            } else {
                tx(fmt(after), px, py + 10, g.fs, (changed ? P.yellow : reached ? P.green : P.sub) + 'ff', 'center', true);
            }
        }
    }

    /* ===================== 설명 ===================== */
    function bfEqText(s, cycle, ab, ba) {
        if (cycle) {
            return '한 바퀴 합: ' + NEG_EDGES[ab][2] + ' + ' + NEG_EDGES[ba][2] + ' = ' + (NEG_EDGES[ab][2] + NEG_EDGES[ba][2]);
        }
        if (!s.hot.length) return '';
        var h = s.hot[0];
        var u = s.edges[h][0];
        var v = s.edges[h][1];
        var w = s.edges[h][2];
        if (s.prev[u] >= INF) return NAMES[u] + ' 거리가 ∞라 건너뜀';
        return NAMES[u] + ' ' + fmt(s.prev[u]) + ' + ' + (w < 0 ? '(' + w + ')' : String(w)) + ' = ' + (s.prev[u] + w) +
            ' vs ' + NAMES[v] + ' ' + fmt(s.prev[v]) + (s.upd.indexOf(h) >= 0 ? ' → 갱신' : ' → 유지');
    }
    function bfBlock(str, cx, y, w, fs, lh, col, bold) {
        if (!str) return y;
        var rows = lines(str, w - 8, fs);
        rows.forEach(function (row, li) {
            tx(row, cx, y + li * lh + lh / 2, fs, col, 'center', bold);
        });
        return y + rows.length * lh;
    }
    function bfCaps(g, s, eq, fresh, e) {
        var cx = g.x0 + g.w / 2;
        var y;
        ctx.globalAlpha = fresh ? 0.35 + 0.65 * ez(e) : 1;
        if (eq) tx(eq, cx, g.capY + g.L.eqH / 2, g.fsub, P.teal + 'ff', 'center', true);
        y = bfBlock(s.cap, cx, g.capY + g.L.eqH, g.w, g.fs, g.fs + 5, P.yellow + 'ff', true);
        y = bfBlock(s.cap2, cx, y, g.w, g.fsub, g.fsub + 4, P.text + 'ee', false);
        bfBlock(s.cap3, cx, y, g.w, g.fsub, g.fsub + 4, P.green + 'ff', true);
        ctx.globalAlpha = 1;
    }

    /* ===================== 메인 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var steps = currentSteps();
        var s = step || steps[0];
        var p = prev || s;
        var fresh = s !== p;
        var e = fresh ? clamp01(t) : 1;
        var idx = steps.indexOf(s);
        var isLast = idx === steps.length - 1;
        var ab = bfFind(NEG_EDGES, 1, 2);
        var ba = bfFind(NEG_EDGES, 2, 1);
        var cycle = isLast && mode === 'neg';
        var g = bfGeom(x0, top, w, mob);
        bfTrack(g, idx, fresh, e);
        bfEdges(g, s, cycle ? [ab, ba] : []);
        bfPackets(g, s, fresh, e, cycle, ab, ba);
        bfNodes(g, s, fresh ? p.d : s.d, fresh, e, isLast && mode === 'rounds');
        bfCaps(g, s, bfEqText(s, cycle, ab, ba), fresh, e);
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
        speedBtns.forEach(function (b) { b.classList.remove('bf-viz__speed-btn--active'); });
        btn.classList.add('bf-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('bf-viz__mode-btn--active', d.key === m); });
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