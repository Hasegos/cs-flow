/**
 * 그리디(Greedy) 알고리즘 시각화 시각화
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
    var root    = el('div', 'greedy-viz');
    var toolbar = el('div', 'greedy-viz__toolbar');
    var tbLeft  = el('div', 'greedy-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'greedy-viz__title', 'GREEDY'));

    var modeWrap = el('div', 'greedy-viz__mode');
    var modeDefs = [
        { key: 'coin', label: '거스름돈' },
        { key: 'activity', label: '활동 선택' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'greedy-viz__mode-btn' + (i === 0 ? ' greedy-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'greedy-viz__speed');
    speedWrap.appendChild(el('span', 'greedy-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'greedy-viz__speed-btn' + (i === 0 ? ' greedy-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'greedy-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'greedy-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'greedy-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'greedy-viz__controls');
    var btnPlay  = el('button', 'greedy-viz__btn greedy-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'greedy-viz__btn', '▶| STEP');
    var btnReset = el('button', 'greedy-viz__btn', '↺ RESET');
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
    var mode    = 'coin';
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

    /* ===================== 거스름돈 데이터 & 스텝 (실제 그리디 실행) ===================== */
    var COINS  = [500, 100, 50, 10];
    var TARGET = 860;

    function buildCoinSteps() {
        var steps = [];
        var remaining = TARGET;
        var picked = [];
        steps.push({ type: 'intro', remaining: remaining, picked: [], coin: null,
            log: 'PLAY를 눌러 ' + TARGET + '원을 큰 동전부터 그리디하게 거슬러주는 과정을 확인하세요.' });

        COINS.forEach(function (coin) {
            while (remaining >= coin) {
                picked.push(coin);
                remaining -= coin;
                var isDone = remaining === 0;
                steps.push({ type: isDone ? 'done' : 'pick', coin: coin, remaining: remaining, picked: picked.slice(),
                    log: coin + '원 동전을 하나 사용합니다 → 남은 금액 ' + remaining + '원' + (isDone ? ' — 다 거슬러줬습니다!' : '') });
            }
        });
        steps[steps.length - 1].log += ' 총 ' + picked.length + '개의 동전(' + picked.join(', ') + ')을 사용했습니다. ' +
            '한국 동전처럼 큰 단위가 작은 단위의 배수일 때는, 매번 "지금 쓸 수 있는 가장 큰 동전"만 골라도 항상 최소 개수가 됩니다.';
        return steps;
    }

    var COIN_STEPS = buildCoinSteps();

    /* ===================== 활동 선택 데이터 & 스텝 (실제 그리디 실행) ===================== */
    var ACTIVITIES = [
        { name: 'A', s: 1, e: 3 },
        { name: 'B', s: 2, e: 5 },
        { name: 'C', s: 4, e: 7 },
        { name: 'D', s: 1, e: 8 },
        { name: 'E', s: 5, e: 9 },
        { name: 'F', s: 8, e: 10 },
    ];
    var SORTED_ACTS = ACTIVITIES.slice().sort(function (a, b) { return a.e - b.e; });

    function buildActivitySteps() {
        var steps = [];
        var lastEnd = -1;
        var selected = [];
        steps.push({ type: 'intro', idx: -1, lastEnd: -1, selected: [], rejected: [],
            log: 'PLAY를 눌러 활동들을 "끝나는 시간이 빠른 순"으로 하나씩 검토하며, 겹치지 않으면 선택하는 과정을 확인하세요.' });

        var rejected = [];
        SORTED_ACTS.forEach(function (a, idx) {
            var ok = a.s >= lastEnd;
            var log;
            if (ok) {
                log = '활동 ' + a.name + '(' + a.s + '~' + a.e + ') → 시작 시간(' + a.s + ')이 마지막 선택 활동의 종료 시간(' +
                    (lastEnd < 0 ? '없음' : lastEnd) + ')보다 늦거나 같아 겹치지 않습니다. 선택합니다!';
                selected.push(a.name);
                lastEnd = a.e;
            } else {
                log = '활동 ' + a.name + '(' + a.s + '~' + a.e + ') → 시작 시간(' + a.s + ')이 마지막 선택 활동의 종료 시간(' + lastEnd + ')보다 빨라 겹칩니다. 제외합니다.';
                rejected.push(a.name);
            }
            var isLast = idx === SORTED_ACTS.length - 1;
            steps.push({ type: isLast ? 'done' : (ok ? 'select' : 'skip'), idx: idx, cur: a.name, lastEnd: lastEnd,
                selected: selected.slice(), rejected: rejected.slice(), log: log });
        });
        steps[steps.length - 1].log += ' 총 ' + selected.length + '개(' + selected.join(', ') + ')를 선택했습니다 — 이것이 이 문제의 최대 개수입니다.';
        return steps;
    }

    var ACTIVITY_STEPS = buildActivitySteps();

    /* ===================== 상태 ===================== */
    function currentSteps() {
        return mode === 'activity' ? ACTIVITY_STEPS : COIN_STEPS;
    }
    function defaultLog() {
        return currentSteps()[0].log;
    }
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    /* ===================== 글씨 폭 ===================== */
    function gdW(str, sz) {
        var n = 0;
        for (var i = 0; i < str.length; i++) n += str.charCodeAt(i) < 128 ? 0.62 : 1.02;
        return n * sz;
    }
    function gdMix(pv, sv, k) { return lerp(pv ? 1 : 0, sv ? 1 : 0, k); }

    /* ===================== 레이아웃 ===================== */
    function gdLayoutCoin(w, mob) {
        var fCap = mob ? 11 : 12;
        var fBig = mob ? 22 : 28;
        var barH = mob ? 14 : 16;
        var chipH = mob ? 30 : 34;
        var trayH = mob ? 44 : 50;
        var cLabel = fCap / 2 + 1;
        var cBig = fCap + 6 + fBig / 2;
        var yBar = cBig + fBig / 2 + 10;
        var cBarCap = yBar + barH + 6 + fCap / 2;
        var cChipCap = cBarCap + fCap + 12;
        var yChip = cChipCap + fCap / 2 + 6;
        var cTrayCap = yChip + chipH + 14 + fCap / 2;
        var yTray = cTrayCap + fCap / 2 + 6;
        return {
            fCap: fCap, fLbl: mob ? 11 : 12, fBig: fBig, cLabel: cLabel, cBig: cBig,
            yBar: yBar, barH: barH, cBarCap: cBarCap, cChipCap: cChipCap, yChip: yChip, chipH: chipH,
            chipGap: mob ? 8 : 10, chipPad: mob ? 16 : 22,
            cTrayCap: cTrayCap, yTray: yTray, trayH: trayH, d: mob ? 30 : 36,
            total: yTray + trayH + 4
        };
    }
    function gdLayoutAct(w, mob) {
        var fs = mob ? 11 : 12;
        var rowH = mob ? 30 : 36;
        var yAxis = fs + 8;
        var yRows = yAxis + fs + 10;
        var rowsEnd = yRows + rowH * SORTED_ACTS.length;
        return {
            fs: fs, rowH: rowH, barH: mob ? 20 : 24, nameW: mob ? 24 : 34, padR: mob ? 8 : 14,
            cBase: fs / 2 + 1, yAxis: yAxis, yRows: yRows, cStrip: rowsEnd + 6 + fs / 2,
            total: rowsEnd + 6 + fs + 6
        };
    }
    function layout(w, mob) {
        return mode === 'activity' ? gdLayoutAct(w, mob) : gdLayoutCoin(w, mob);
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 거스름돈 장면 ===================== */
    function gdCoinDisc(cx, cy, d, v, col, fs) {
        circ(cx, cy, d / 2, col + '33', col + 'ff', 1.8);
        tx(String(v), cx, cy, fs, col + 'ff', 'center', true);
    }
    function gdChipGeo(L, x0) {
        var x = x0;
        return COINS.map(function (c) {
            var cw = gdW(c + '원', L.fLbl) + L.chipPad;
            var g = { coin: c, x: x, w: cw };
            x += cw + L.chipGap;
            return g;
        });
    }
    function gdDrawCoin(x0, top, w, mob, s, p, fresh, e) {
        var L = gdLayoutCoin(w, mob);
        var k = fresh ? ez(e) : 1;
        var remF = lerp(p.remaining, s.remaining, k);
        var remTxt = Math.round(remF);
        var xB = x0 + w * (TARGET - remF) / TARGET;
        var by = top + L.yBar;
        var n = s.picked.length;
        var landing = fresh && n > p.picked.length;
        var cum = 0;
        s.picked.forEach(function (v, i) {
            var xs = x0 + w * cum / TARGET;
            cum += v;
            var xe = i === n - 1 ? xB : x0 + w * cum / TARGET;
            var last = i === n - 1;
            rr(xs, by, xe - xs, L.barH, 0, (last ? P.orange + '40' : P.green + '2a'), 'none');
        });
        rr(xB, by, x0 + w - xB, L.barH, 0, (remTxt === 0 ? P.green : P.orange) + '1c', 'none');
        rr(x0, by, w, L.barH, 4, 'none', P.muted + '77', 1.2);

        tx('남은 금액', x0, top + L.cLabel, L.fCap, P.sub + 'ff', 'left', true);
        tx(remTxt + '원', x0, top + L.cBig, L.fBig, (remTxt === 0 ? P.green : P.orange) + 'ff', 'left', true);
        tx('사용 ' + (TARGET - remTxt) + '원 / 전체 ' + TARGET + '원', x0, top + L.cBarCap, L.fCap, P.sub + 'ff', 'left', false);

        tx('동전 종류 (큰 것부터 확인)', x0, top + L.cChipCap, L.fCap, P.sub + 'ff', 'left', true);
        var geo = gdChipGeo(L, x0);
        geo.forEach(function (g) {
            var a = gdMix(p.coin === g.coin, s.coin === g.coin, k);
            var cy0 = top + L.yChip;
            rr(g.x, cy0, g.w, L.chipH, 5, P.muted + '10', P.muted + '55', 1.2);
            if (a > 0.01) {
                ctx.globalAlpha = a;
                rr(g.x, cy0, g.w, L.chipH, 5, P.orange + '30', P.orange + 'ee', 2.2);
                ctx.globalAlpha = 1;
            }
            tx(g.coin + '원', g.x + g.w / 2, cy0 + L.chipH / 2, L.fLbl, (a > 0.5 ? P.orange : P.text) + 'ff', 'center', true);
        });

        var cyT = top + L.yTray + L.trayH / 2;
        var d = L.d;
        var slotX = function (i) { return x0 + 10 + d / 2 + i * (d + 6); };
        tx('사용한 동전 (' + n + '개)', x0, top + L.cTrayCap, L.fCap, P.sub + 'ff', 'left', true);
        rr(x0, top + L.yTray, w, L.trayH, 6, P.muted + '0c', P.muted + '44', 1.2);
        if (n === 0) tx('(아직 없음)', x0 + w / 2, cyT, L.fLbl, P.sub + 'ff', 'center', false);
        var settled = landing ? n - 1 : n;
        for (var i = 0; i < settled; i++) {
            gdCoinDisc(slotX(i), cyT, d, s.picked[i], i === n - 1 ? P.orange : P.green, L.fLbl);
        }
        if (landing) {
            var gg = geo.filter(function (g) { return g.coin === s.coin; })[0];
            var kf = ez(seg(e, 0.05, 0.8));
            var fx = lerp(gg.x + gg.w / 2, slotX(n - 1), kf);
            var fy = lerp(top + L.yChip + L.chipH / 2, cyT, kf);
            ctx.globalAlpha = seg(e, 0, 0.12);
            gdCoinDisc(fx, fy, d, s.coin, P.orange, L.fLbl);
            ctx.globalAlpha = 1;
        }
    }

    /* ===================== 활동 선택 장면 ===================== */
    function gdRowSt(st, name) {
        if (st.selected.indexOf(name) >= 0) return 'sel';
        if (st.rejected.indexOf(name) >= 0) return 'rej';
        return 'pend';
    }
    function gdRowStyle(st) {
        if (st === 'sel') return { fill: P.green + '2c', stroke: P.green + 'ee', lw: 1.8, tc: P.text + 'ff', nc: P.green + 'ff' };
        if (st === 'rej') return { fill: P.muted + '0a', stroke: P.muted + '44', lw: 1.2, tc: P.sub + '99', nc: P.sub + '99' };
        return { fill: P.muted + '14', stroke: P.sub + '55', lw: 1.2, tc: P.sub + 'ff', nc: P.sub + 'ff' };
    }
    function gdRowDraw(L, x0, cy, bx, bw, a, st, al) {
        if (al <= 0.01) return;
        var S = gdRowStyle(st);
        ctx.globalAlpha = al;
        rr(bx, cy - L.barH / 2, bw, L.barH, 4, S.fill, S.stroke, S.lw);
        tx(a.s + '~' + a.e, bx + bw / 2, cy, L.fs, S.tc, 'center', false);
        tx(a.name, x0, cy, L.fs, S.nc, 'left', true);
        ctx.globalAlpha = 1;
    }
    function gdOvl(bx, cy, L, endX, bw, al) {
        var ow = Math.min(endX - bx, bw);
        ctx.globalAlpha = al;
        rr(bx, cy - L.barH / 2, ow, L.barH, 4, P.red + '66', 'none');
        ctx.globalAlpha = 1;
    }
    function gdDrawAct(x0, top, w, mob, s, p, fresh, e) {
        var L = gdLayoutAct(w, mob);
        var k = fresh ? ez(e) : 1;
        var px0 = x0 + L.nameW;
        var plotW = w - L.nameW - L.padR;
        var tPx = function (t) { return px0 + plotW * t / 10; };
        var axY = top + L.yAxis;
        ln(px0, axY, px0 + plotW, axY, P.muted + '66', 1.2);
        for (var t = 0; t <= 10; t += 2) {
            ln(tPx(t), axY, tPx(t), axY + 4, P.sub + '99', 1);
            tx(String(t), tPx(t), axY + 6 + L.fs / 2, L.fs, P.sub + 'ff', 'center', false);
        }

        var pLE = p.lastEnd, sLE = s.lastEnd;
        var blA = gdMix(pLE >= 0, sLE >= 0, k);
        if (blA > 0.01) {
            var blV = lerp(Math.max(0, pLE), Math.max(0, sLE), k);
            var blX = tPx(blV);
            var rowsBot = top + L.yRows + L.rowH * SORTED_ACTS.length;
            var lbl = '기준선(' + Math.round(blV) + ')';
            var half = gdW(lbl, L.fs) / 2 + 2;
            var lblX = Math.min(Math.max(blX, x0 + half), x0 + w - half);
            ctx.globalAlpha = blA;
            ln(blX, axY, blX, rowsBot, P.green + 'cc', 2, [5, 4]);
            tx(lbl, lblX, top + L.cBase, L.fs, P.green + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        }

        SORTED_ACTS.forEach(function (a, idx) {
            var cy = top + L.yRows + idx * L.rowH + L.rowH / 2;
            var bx = tPx(a.s), bw = Math.max(tPx(a.e) - bx, 4);
            var sSt = gdRowSt(s, a.name), pSt = gdRowSt(p, a.name);
            var exS = s.idx === idx, exP = p.idx === idx;
            if (!fresh || sSt === pSt) {
                gdRowDraw(L, x0, cy, bx, bw, a, sSt, 1);
            } else {
                var f = ez(seg(e, 0.15, 0.85));
                gdRowDraw(L, x0, cy, bx, bw, a, pSt, 1 - f);
                gdRowDraw(L, x0, cy, bx, bw, a, sSt, f);
            }
            var ringA = gdMix(exP, exS, k);
            if (ringA > 0.01) {
                ctx.globalAlpha = ringA;
                rr(bx - 3, cy - L.barH / 2 - 3, bw + 6, L.barH + 6, 6, 'none', P.orange + 'ff', 2);
                ctx.globalAlpha = 1;
            }
            if (s.type === 'skip' && exS && k > 0.01) gdOvl(bx, cy, L, tPx(s.lastEnd), bw, k);
            if (fresh && p.type === 'skip' && exP && k < 0.99) gdOvl(bx, cy, L, tPx(p.lastEnd), bw, 1 - k);
        });

        var names = s.selected.length ? ' (' + s.selected.join(', ') + ')' : '';
        tx('선택 ' + s.selected.length + '개' + names, x0, top + L.cStrip, L.fs,
            (s.type === 'done' ? P.green : P.sub) + 'ff', 'left', true);
    }

    /* ===================== 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var steps = currentSteps();
        var s = step || steps[0];
        var p = prev || s;
        var fresh = s !== p;
        var e = fresh ? clamp01(t) : 1;
        if (mode === 'activity') gdDrawAct(x0, top, w, mob, s, p, fresh, e);
        else gdDrawCoin(x0, top, w, mob, s, p, fresh, e);
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
        speedBtns.forEach(function (b) { b.classList.remove('greedy-viz__speed-btn--active'); });
        btn.classList.add('greedy-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('greedy-viz__mode-btn--active', d.key === m); });
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