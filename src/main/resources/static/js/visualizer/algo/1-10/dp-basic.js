/**
 * DP 기초 시각화 시각화
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
    var root    = el('div', 'dp-basic-viz');
    var toolbar = el('div', 'dp-basic-viz__toolbar');
    var tbLeft  = el('div', 'dp-basic-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'dp-basic-viz__title', 'KNAPSACK'));

    var modeWrap = el('div', 'dp-basic-viz__mode');
    var modeDefs = [
        { key: 'table', label: '표 채우기' },
        { key: 'backtrack', label: '선택 아이템 역추적' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'dp-basic-viz__mode-btn' + (i === 0 ? ' dp-basic-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'dp-basic-viz__speed');
    speedWrap.appendChild(el('span', 'dp-basic-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'dp-basic-viz__speed-btn' + (i === 0 ? ' dp-basic-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'dp-basic-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'dp-basic-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'dp-basic-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'dp-basic-viz__controls');
    var btnPlay  = el('button', 'dp-basic-viz__btn dp-basic-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'dp-basic-viz__btn', '▶| STEP');
    var btnReset = el('button', 'dp-basic-viz__btn', '↺ RESET');
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
    var mode    = 'table';
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

    /* ===================== 문제 데이터 (고정 0/1 배낭 문제 — 이해 부담을 줄이기 위해 작게 유지) ===================== */
    var ITEMS = [
        { w: 2, v: 3 },
        { w: 3, v: 4 },
        { w: 4, v: 5 },
    ];
    var CAP = 5;
    var NI  = ITEMS.length;

    /* ===================== 표 채우기 스텝 (실제 DP 점화식 실행) ===================== */
    function buildTableSteps() {
        var dp = [];
        for (var i = 0; i <= NI; i++) dp.push(new Array(CAP + 1).fill(0));
        var steps = [];

        steps.push({ type: 'intro', dp: dp.map(function (r) { return r.slice(); }), cur: null,
            log: 'PLAY를 눌러 배낭 문제의 DP 테이블이 채워지는 과정을 확인하세요. 0열(아이템 없음)과 0행(무게 0)은 항상 0입니다(기저 사례).' });

        for (var it = 1; it <= NI; it++) {
            var item = ITEMS[it - 1];
            for (var w = 0; w <= CAP; w++) {
                var without = dp[it - 1][w];
                var withVal = -1, withSrcW = null;
                if (item.w <= w) { withVal = dp[it - 1][w - item.w] + item.v; withSrcW = w - item.w; }
                var include = withVal > without;
                var best = include ? withVal : without;
                dp[it][w] = best;

                var log;
                if (item.w > w) {
                    log = '지금 칸: 아이템' + it + '의 무게(' + item.w + ')가 지금 용량(' + w + ')보다 커서 애초에 넣을 수 없습니다 → 왼쪽 칸(이 아이템 없이 얻은 값) ' + without + '을 그대로 가져옵니다.';
                } else if (include) {
                    log = '지금 칸: 안 넣으면 ' + without + ', 넣으면 ' + withVal + '(대각선 칸의 값 ' + dp[it - 1][withSrcW] + ' + 이 아이템의 가치 ' + item.v + '). 넣는 쪽이 더 크므로 ' + best + '을 씁니다.';
                } else {
                    log = '지금 칸: 안 넣으면 ' + without + ', 넣으면 ' + withVal + '. 안 넣는 쪽이 더 크거나 같으므로 ' + best + '을 그대로 씁니다.';
                }

                var isLast = it === NI && w === CAP;
                steps.push({ type: isLast ? 'done' : 'fill', cur: { i: it, w: w }, include: include,
                    without: without, withVal: withVal, possible: item.w <= w,
                    srcAbove: { i: it - 1, w: w }, srcDiag: withSrcW != null ? { i: it - 1, w: withSrcW } : null,
                    dp: dp.map(function (r) { return r.slice(); }), log: log });
            }
        }
        steps[steps.length - 1].log += ' 표가 완성되었습니다 — 오른쪽 아래 칸(' + dp[NI][CAP] + ')이 최적 답입니다. "선택 아이템 역추적" 탭에서 어떤 아이템을 골랐는지 확인하세요.';
        return { steps: steps, dp: dp };
    }

    var TABLE = buildTableSteps();
    var TABLE_STEPS = TABLE.steps;
    var DP = TABLE.dp;

    /* ===================== 역추적 스텝 (완성된 표를 거슬러 올라가며 선택 아이템 확인) ===================== */
    function buildBacktrackSteps() {
        var steps = [];
        var i = NI, w = CAP;
        var selected = [];

        steps.push({ type: 'intro', i: i, w: w, selected: [],
            log: 'PLAY를 눌러 완성된 표의 오른쪽 아래(최적값 ' + DP[NI][CAP] + ')에서 왼쪽 위로 거슬러 올라가며 어떤 아이템을 골랐는지 확인하세요.' });

        while (i >= 1) {
            var item = ITEMS[i - 1];
            var included = DP[i][w] !== DP[i - 1][w];
            var log;
            if (included) {
                selected = [i - 1].concat(selected);
                log = 'dp[' + i + '][' + w + ']=' + DP[i][w] + '가 dp[' + (i - 1) + '][' + w + ']=' + DP[i - 1][w] + '와 달라 → 아이템' + i + '(무게' + item.w + ',가치' + item.v + ')을 포함했습니다. 용량을 ' + w + '→' + (w - item.w) + '로 줄여 계속 거슬러 올라갑니다.';
                w -= item.w;
            } else {
                log = 'dp[' + i + '][' + w + ']=' + DP[i][w] + '가 dp[' + (i - 1) + '][' + w + ']=' + DP[i - 1][w] + '와 같아 → 아이템' + i + '은 포함되지 않았습니다.';
            }
            i -= 1;
            steps.push({ type: i === 0 ? 'done' : 'step', i: i, w: w, included: included, itemIdx: i, selected: selected.slice(), log: log });
        }
        var totalW = 0, totalV = 0;
        selected.forEach(function (idx) { totalW += ITEMS[idx].w; totalV += ITEMS[idx].v; });
        steps[steps.length - 1].log += ' 최종 선택: 아이템 ' + selected.map(function (x) { return x + 1; }).join(', ') +
            ' (총 무게 ' + totalW + ' / 총 가치 ' + totalV + ') — DP 테이블의 최적값과 정확히 일치합니다.';
        return steps;
    }

    var BACKTRACK_STEPS = buildBacktrackSteps();

    /* ===================== 상태 ===================== */
    function currentSteps() {
        return mode === 'backtrack' ? BACKTRACK_STEPS : TABLE_STEPS;
    }
    function defaultLog() {
        return currentSteps()[0].log;
    }
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var headW = mob ? 44 : 76;
        var span = (w - headW) / (NI + 1);
        var colH = mob ? 30 : 40;
        var rh = mob ? 26 : 36;
        var tabH = colH + (CAP + 1) * rh;
        var pillH = mob ? 24 : 28;
        var candH = pillH + (mob ? 20 : 24);
        var legH = mob ? 36 : 44;
        var gap = mob ? 8 : 12;
        var stripH = mob ? 20 : 22;
        var cw = mob ? span : Math.min(110, span);
        return {
            mob: mob, headW: headW, cw: cw, colH: colH, rh: rh, tabH: tabH,
            tabW: headW + (NI + 1) * cw, legH: legH, gap: gap,
            pillH: pillH, candH: candH, stripH: stripH,
            total: legH + gap + tabH + gap + candH + 6 + stripH
        };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 격자 기하 ===================== */
    function dpGeom(x0, top, w, mob) {
        var L = layout(w, mob);
        var tx0 = x0 + (w - L.tabW) / 2;
        var ty0 = top + L.legH + L.gap;
        var pillY = ty0 + L.tabH + L.gap;
        return {
            L: L, x0: x0, w: w, top: top, tx0: tx0, ty0: ty0, pillY: pillY,
            resY: pillY + L.pillH + 4 + (L.candH - L.pillH - 4) / 2,
            cx: function (it) { return tx0 + L.headW + it * L.cw + L.cw / 2; },
            cy: function (c) { return ty0 + L.colH + c * L.rh + L.rh / 2; }
        };
    }
    function dpInc(it, c) { return it > 0 && DP[it][c] !== DP[it - 1][c]; }
    function dpWalker(st) {
        if (st.type === 'intro') return { it: NI, c: CAP };
        return { it: st.i + 1, c: st.w + (st.included ? ITEMS[st.i].w : 0) };
    }

    /* ===================== 격자 칸 그리기 ===================== */
    function dpRing(g, it, c, col, lw, a) {
        ctx.globalAlpha = a;
        rr(g.cx(it) - g.L.cw / 2 + 1, g.cy(c) - g.L.rh / 2 + 1, g.L.cw - 2, g.L.rh - 2, 3, 'none', col, lw);
        ctx.globalAlpha = 1;
    }
    function dpCell(g, it, c, st) {
        var L = g.L;
        rr(g.cx(it) - L.cw / 2 + 1, g.cy(c) - L.rh / 2 + 1, L.cw - 2, L.rh - 2, 3, st.fill, st.stroke, st.lw);
        if (st.val === null) return;
        ctx.globalAlpha = st.va;
        tx(String(st.val), g.cx(it), g.cy(c), L.mob ? 12.5 : 14, st.tc, 'center', st.bold);
        ctx.globalAlpha = 1;
    }
    function dpGrid(g, actIt, actC) {
        var L = g.L, fs = L.mob ? 11 : 12.5;
        for (var it = 0; it <= NI; it++) {
            tx(it === 0 ? '0개' : '아이템' + it, g.cx(it), g.ty0 + L.colH / 2, fs, (it === actIt ? P.orange : P.text) + 'ee', 'center', true);
        }
        for (var c = 0; c <= CAP; c++) {
            tx('무게 ' + c, g.tx0 + L.headW / 2, g.cy(c), fs, (c === actC ? P.orange : P.text) + 'cc', 'center', true);
        }
    }
    function dpTableStyle(s, fresh, e, it, c) {
        if (it === 0 || c === 0) return { fill: P.muted + '10', stroke: P.muted + '44', lw: 1, val: s.dp[it][c], tc: P.sub + 'ff', va: 1, bold: false };
        var curOrd = s.cur ? (s.cur.i - 1) * (CAP + 1) + s.cur.w : -1;
        var ord = (it - 1) * (CAP + 1) + c;
        if (s.cur && s.cur.i === it && s.cur.w === c) {
            return { fill: P.orange + '30', stroke: P.orange + 'ee', lw: 2.4, val: s.dp[it][c], tc: P.text + 'ff', va: fresh ? ez(seg(e, 0.85, 1)) : 1, bold: true };
        }
        if (ord < curOrd) {
            var cl = dpInc(it, c) ? P.green : P.teal;
            return { fill: cl + '18', stroke: cl + '66', lw: 1.2, val: s.dp[it][c], tc: P.text + 'ee', va: 1, bold: false };
        }
        return { fill: P.muted + '08', stroke: P.muted + '30', lw: 1, val: null, tc: P.sub, va: 1, bold: false };
    }

    /* ===================== 후보 칩과 두 후보 칸 ===================== */
    function dpChip(x, y, txt, col, a, fs) {
        ctx.globalAlpha = a;
        rr(x - 19, y - 9, 38, 18, 4, col + '33', col + 'ff', 1.4);
        tx(txt, x, y, fs, P.text + 'ff', 'center', true);
        ctx.globalAlpha = 1;
    }
    function dpPath(x1, y1, x2, y2, p, col, lw) {
        if (p <= 0) return;
        if (p >= 1) { arrow(x1, y1, x2, y2, col, lw); return; }
        ln(x1, y1, lerp(x1, x2, p), lerp(y1, y2, p), col, lw);
    }
    function dpPill(x, y, bw, bh, txt, win, a, fs) {
        var col = win ? P.green : P.muted;
        ctx.globalAlpha = a;
        rr(x, y, bw, bh, bh / 2, col + (win ? '22' : '10'), col + (win ? 'ee' : '55'), win ? 1.8 : 1);
        tx(txt, x + bw / 2, y + bh / 2, fs, (win ? P.green : P.sub) + 'ff', 'center', win);
        ctx.globalAlpha = 1;
    }
    function dpPairPills(g, leftTxt, rightTxt, rightWins, pa, la) {
        var L = g.L, pw = (g.w - L.gap) / 2, fs = L.mob ? 11 : 12.5;
        dpPill(g.x0, g.pillY, pw, L.pillH, leftTxt, !rightWins, rightWins ? la : pa, fs);
        dpPill(g.x0 + pw + L.gap, g.pillY, pw, L.pillH, rightTxt, rightWins, rightWins ? pa : la, fs);
    }

    /* ===================== 아이템 범례 ===================== */
    function dpLegend(g, s, fresh, e) {
        var L = g.L, gapX = L.mob ? 6 : 8, fs = L.mob ? 11 : 12.5;
        var chipW = (g.w - gapX * (NI - 1)) / NI;
        var bt = mode === 'backtrack';
        var actK = bt ? s.i : (s.cur ? s.cur.i - 1 : -1);
        ITEMS.forEach(function (item, k) {
            var newly = bt && fresh && s.included && k === s.i && e < 0.6;
            var on = !newly && (s.selected || []).indexOf(k) >= 0;
            var act = k === actK;
            var hot = on || act;
            var col = on ? P.green : (act ? P.orange : P.muted);
            var x = g.x0 + k * (chipW + gapX);
            rr(x, g.top, chipW, L.legH, 5, col + (hot ? '22' : '10'), col + (hot ? 'ee' : '55'), hot ? 1.8 : 1);
            tx('아이템' + (k + 1), x + chipW / 2, g.top + L.legH * 0.32, fs, (hot ? col : P.text) + 'ff', 'center', true);
            tx('무게' + item.w + ' 가치' + item.v, x + chipW / 2, g.top + L.legH * 0.72, fs, P.text + 'dd', 'center', false);
        });
    }

    /* ===================== 표 채우기 장면 ===================== */
    function dpDrawTable(g, s, fresh, e) {
        var L = g.L, fs = L.mob ? 11 : 12.5;
        dpGrid(g, s.cur ? s.cur.i : -1, s.cur ? s.cur.w : -1);
        for (var it = 0; it <= NI; it++) {
            for (var c = 0; c <= CAP; c++) dpCell(g, it, c, dpTableStyle(s, fresh, e, it, c));
        }
        if (!s.cur) {
            tx('칸을 채우면 두 후보를 비교합니다', g.x0 + g.w / 2, g.pillY + L.pillH / 2, fs, P.sub + 'ff', 'center', false);
            return;
        }
        var ci = s.cur.i, cc = s.cur.w, cw = L.cw, rh = L.rh;
        var cur = { x: g.cx(ci), y: g.cy(cc) };
        var lf = { x: g.cx(ci - 1), y: g.cy(cc) };
        var vi = ITEMS[ci - 1].v;
        var hi = fresh ? ez(seg(e, 0, 0.2)) : 1;
        var gl = fresh ? ez(seg(e, 0.05, 0.35)) : 1;
        var fl = fresh ? ez(seg(e, 0.25, 0.6)) : 1;
        var chipA = fresh ? ez(seg(e, 0.2, 0.3)) * (1 - ez(seg(e, 0.6, 0.7))) : 0;
        dpRing(g, ci - 1, cc, P.teal + 'ff', 2, hi);
        dpPath(lf.x + cw * 0.3, lf.y, cur.x - cw * 0.3, cur.y, gl, P.teal + 'dd', 2);
        if (chipA > 0) dpChip(lerp(lf.x, cur.x, fl), lerp(lf.y, cur.y, fl), String(s.without), P.teal, chipA, fs);
        if (s.srcDiag) {
            var dr = s.srcDiag.w;
            var dg = { x: g.cx(ci - 1), y: g.cy(dr) };
            dpRing(g, ci - 1, dr, P.purple + 'ff', 2, hi);
            dpPath(dg.x + cw * 0.25, dg.y + rh * 0.25, cur.x - cw * 0.25, cur.y - rh * 0.25, gl, P.purple + 'dd', 2);
            if (chipA > 0) dpChip(lerp(dg.x, cur.x, fl), lerp(dg.y, cur.y, fl), s.dp[ci - 1][dr] + '+' + vi, P.purple, chipA, fs);
        }
        dpRing(g, ci, cc, P.yellow + 'ff', 2.4, fresh ? ez(seg(e, 0.72, 0.8)) : 1);
        var pa = fresh ? ez(seg(e, 0.6, 0.7)) : 1;
        var la = fresh ? pa * (1 - 0.6 * ez(seg(e, 0.75, 0.85))) : 0.6;
        dpPairPills(g, '제외: ' + s.without, s.possible ? '포함: ' + s.withVal : '포함: 불가', s.include, pa, la);
        ctx.globalAlpha = fresh ? ez(seg(e, 0.85, 0.95)) : 1;
        tx('더 큰 값 ' + s.dp[ci][cc] + ' 선택 (' + (s.include ? '포함' : '제외') + ')', g.x0 + g.w / 2, g.resY, fs, (s.include ? P.green : P.sub) + 'ff', 'center', true);
        ctx.globalAlpha = 1;
    }

    /* ===================== 역추적 장면 ===================== */
    function dpDrawBacktrack(g, s, pv, fresh, e) {
        var L = g.L, fs = L.mob ? 11 : 12.5;
        var k = BACKTRACK_STEPS.indexOf(s);
        var cur = dpWalker(s);
        var intro = s.type === 'intro';
        dpGrid(g, intro ? -1 : cur.it, cur.c);
        for (var it = 0; it <= NI; it++) {
            for (var c = 0; c <= CAP; c++) {
                var cl = (it === 0 || c === 0) ? P.muted : (dpInc(it, c) ? P.green : P.teal);
                dpCell(g, it, c, { fill: cl + '18', stroke: cl + '66', lw: 1.2, val: DP[it][c], tc: P.text + 'ee', va: 1, bold: false });
            }
        }
        for (var j = 1; j <= k; j++) {
            var bs = BACKTRACK_STEPS[j], from = dpWalker(bs);
            var ga = (fresh && j === k) ? ez(seg(e, 0.6, 1)) : 1;
            dpPath(g.cx(from.it) - L.cw * 0.3, g.cy(from.c), g.cx(bs.i) + L.cw * 0.3, g.cy(bs.w), ga, P.purple + 'dd', 2);
        }
        var pw = dpWalker(pv);
        if (fresh && (pw.it !== cur.it || pw.c !== cur.c)) {
            var ap = ez(seg(e, 0, 0.4));
            ctx.globalAlpha = 1 - ez(seg(e, 0.4, 0.5));
            circ(lerp(g.cx(pw.it), g.cx(cur.it), ap), lerp(g.cy(pw.c), g.cy(cur.c), ap), 6, P.orange + 'ff', 'none');
            ctx.globalAlpha = 1;
        }
        dpRing(g, cur.it, cur.c, P.orange + 'ff', 2.6, 1);
        if (intro) {
            tx('시작: 오른쪽 아래 칸 (최적값 ' + DP[NI][CAP] + ')', g.x0 + g.w / 2, g.pillY + L.pillH / 2, fs, P.sub + 'ff', 'center', true);
            return;
        }
        var wi = ITEMS[cur.it - 1].w, vi = ITEMS[cur.it - 1].v;
        var lf = { x: g.cx(cur.it - 1), y: g.cy(cur.c) }, rp = { x: g.cx(cur.it), y: g.cy(cur.c) };
        var ca = fresh ? ez(seg(e, 0.2, 0.45)) : 1;
        dpRing(g, cur.it - 1, cur.c, P.sub + 'ff', 1.6, ca);
        ctx.globalAlpha = ca;
        ln(lf.x + L.cw * 0.3, lf.y, rp.x - L.cw * 0.3, rp.y, P.sub + 'aa', 1.6, [4, 3]);
        ctx.globalAlpha = 1;
        var pa = fresh ? ez(seg(e, 0.45, 0.6)) : 1;
        var la = fresh ? pa * (1 - 0.6 * ez(seg(e, 0.7, 0.8))) : 0.6;
        var possible = wi <= cur.c;
        dpPairPills(g, '제외: ' + DP[cur.it - 1][cur.c], possible ? '포함: ' + (DP[cur.it - 1][cur.c - wi] + vi) : '포함: 불가', s.included, pa, la);
        ctx.globalAlpha = fresh ? ez(seg(e, 0.8, 0.95)) : 1;
        tx(s.included ? '포함: 용량 ' + cur.c + ' → ' + (cur.c - wi) : '제외: 왼쪽 칸과 같은 값', g.x0 + g.w / 2, g.resY, fs, (s.included ? P.green : P.sub) + 'ff', 'center', true);
        ctx.globalAlpha = 1;
    }

    /* ===================== 하단 상태 띠 ===================== */
    function dpStrip(g, s) {
        var L = g.L, fs = L.mob ? 11 : 12.5, y = g.top + L.total - L.stripH / 2, cx = g.x0 + g.w / 2;
        if (mode === 'backtrack') {
            var sel = (s.selected || []).map(function (x) { return x + 1; }).join(', ');
            if (s.type === 'done') tx('최종 선택: 아이템 ' + sel, cx, y, fs, P.green + 'ff', 'center', true);
            else tx('선택 아이템: ' + (s.type === 'intro' ? '확인 전' : (sel || '없음')), cx, y, fs, P.sub + 'ff', 'center', true);
            return;
        }
        var last = TABLE_STEPS.length - 1, idx = TABLE_STEPS.indexOf(s);
        if (idx === last) tx('완성: 최적값 ' + DP[NI][CAP], cx, y, fs, P.green + 'ff', 'center', true);
        else tx('채운 칸 ' + idx + ' / ' + last, cx, y, fs, P.sub + 'ff', 'center', true);
    }

    /* ===================== 메인 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var steps = currentSteps();
        var s = step || steps[0];
        var pv = prev || s;
        var fresh = s !== pv;
        var e = fresh ? clamp01(t) : 1;
        var g = dpGeom(x0, top, w, mob);
        dpLegend(g, s, fresh, e);
        if (mode === 'backtrack') dpDrawBacktrack(g, s, pv, fresh, e);
        else dpDrawTable(g, s, fresh, e);
        dpStrip(g, s);
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
        speedBtns.forEach(function (b) { b.classList.remove('dp-basic-viz__speed-btn--active'); });
        btn.classList.add('dp-basic-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('dp-basic-viz__mode-btn--active', d.key === m); });
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