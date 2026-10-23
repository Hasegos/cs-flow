/**
 * 모노토닉 스택 시각화 시각화
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
    var root    = el('div', 'ms-viz');
    var toolbar = el('div', 'ms-viz__toolbar');
    var tbLeft  = el('div', 'ms-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'ms-viz__title', 'MONOTONIC STACK'));

    var modeWrap = el('div', 'ms-viz__mode');
    var modeDefs = [
        { key: 'nge', label: '다음 큰 원소' },
        { key: 'hist', label: '히스토그램 직사각형' },
        { key: 'span', label: '주가 스팬' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'ms-viz__mode-btn' + (i === 0 ? ' ms-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'ms-viz__speed');
    speedWrap.appendChild(el('span', 'ms-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'ms-viz__speed-btn' + (i === 0 ? ' ms-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'ms-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'ms-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'ms-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'ms-viz__controls');
    var btnPlay  = el('button', 'ms-viz__btn ms-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'ms-viz__btn', '▶| STEP');
    var btnReset = el('button', 'ms-viz__btn', '↺ RESET');
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
    var mode    = 'nge';
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

    /* ===================== 엔진: 모노토닉 스택 ===================== */
    function bat(n) {
        return [0, 1, 3, 6, 7, 8].indexOf(Math.abs(n) % 10) >= 0;
    }
    function eu(n) {
        return bat(n) ? '을' : '를';
    }
    function ga(n) {
        return bat(n) ? '이' : '가';
    }
    function eun(n) {
        return bat(n) ? '은' : '는';
    }
    function sstep(vals, i, stack, popped, ans, ext, cap, cap2, cap3, log) {
        return { vals: vals, i: i, stack: stack.slice(), popped: popped.slice(), ans: ans ? ans.slice() : null, ext: ext, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }
    function ro(n) {
        return [0, 3, 6].indexOf(Math.abs(n) % 10) >= 0 ? '으로' : '로';
    }
    function stackText(st) {
        return st.length ? st.join(', ') : '(비어 있음)';
    }

    /* ===================== 데이터: 다음 큰 원소 ===================== */
    var NGE_ARR = [2, 7, 3, 5, 4, 6, 8];
    var NGE_STEPS = [];
    (function () {
        var a = NGE_ARR;
        var n = a.length;
        var st = [];
        var ans = [];
        var i;
        var j;
        var pushes = 0;
        var pops = 0;
        for (j = 0; j < n; j++) ans.push(null);
        NGE_STEPS.push(sstep(a, -1, st, [], ans, null, '다음 큰 원소 찾기', '스택에는 아직 답을 못 찾은 원소의 인덱스를 쌓음', '', '각 원소의 오른쪽에서 처음 나오는 더 큰 값(Next Greater Element)을 구합니다. 원소마다 오른쪽을 끝까지 훑으면 O(n²)입니다. 모노토닉 스택은 아직 답을 찾지 못한 원소의 인덱스를 스택에 쌓아 두고, 새 원소가 오면 스택 맨 위(top)의 값과 비교합니다. 스택의 값은 아래에서 위로 갈수록 줄어드는 단조 감소 상태로 유지됩니다.'));
        for (i = 0; i < n; i++) {
            while (st.length && a[i] > a[st[st.length - 1]]) {
                var t = st.pop();
                pops++;
                ans[t] = a[i];
                NGE_STEPS.push(sstep(a, i, st, [t], ans, null, '꺼냄: 인덱스 ' + t + '의 답 = ' + a[i], 'arr[' + i + '] = ' + a[i] + ' > arr[' + t + '] = ' + a[t], '꺼낸 횟수 ' + pops + ' · 넣은 횟수 ' + pushes, '새 원소 arr[' + i + '] = ' + a[i] + ', top 인덱스 ' + t + '의 값 arr[' + t + '] = ' + a[t] + '. 새 원소가 더 큽니다. 인덱스 ' + t + '의 다음 큰 원소는 ' + a[i] + ro(a[i]) + ' 확정되므로 스택에서 꺼냅니다. 스택: ' + stackText(st) + '.'));
            }
            st.push(i);
            pushes++;
            NGE_STEPS.push(sstep(a, i, st, [], ans, null, '넣음: 인덱스 ' + i + ' (값 ' + a[i] + ')', '스택(아래 → 위): ' + stackText(st), '꺼낸 횟수 ' + pops + ' · 넣은 횟수 ' + pushes, 'arr[' + i + '] = ' + a[i] + '보다 작은 top이 더 없으므로 인덱스 ' + i + eu(i) + ' 스택에 넣습니다. 스택: ' + stackText(st) + ', 값은 아래에서 위로 줄어드는 순서입니다.'));
        }
        var rest = st.slice();
        for (j = 0; j < rest.length; j++) ans[rest[j]] = -1;
        NGE_STEPS.push(sstep(a, n, st, [], ans, null, '끝: 남은 원소는 답 없음(-1)', '인덱스 ' + stackText(rest) + ' → -1', '꺼낸 횟수 ' + pops + ' · 넣은 횟수 ' + pushes, '배열 끝까지 봤습니다. 스택에 남은 인덱스 ' + stackText(rest) + ' — 오른쪽에 더 큰 값이 없어 답이 -1입니다.'));
        NGE_STEPS.push(sstep(a, n, st, [], ans, null, '결과: [' + ans.join(', ') + ']', '각 원소를 한 번 넣고 최대 한 번 꺼냄', 'O(n)', '정리 — 다음 큰 원소는 [' + ans.join(', ') + ']입니다. 반복문 안에 while이 있어도 각 원소는 한 번 넣고(' + pushes + '번) 최대 한 번 꺼내므로(' + pops + '번) 전체 연산이 2n 이하이고 시간은 O(n)입니다.'));
    })();

    /* ===================== 데이터: 히스토그램 직사각형 ===================== */
    var HIST_ARR = [2, 1, 5, 6, 2, 3];
    var HIST_STEPS = [];
    (function () {
        var h = HIST_ARR;
        var n = h.length;
        var st = [];
        var best = 0;
        var i;
        HIST_STEPS.push(sstep(h, -1, st, [], null, null, '히스토그램의 가장 큰 직사각형', '막대 높이 [' + h.join(', ') + ']', '', '너비가 1인 막대들이 이어진 히스토그램에서 가장 넓은 직사각형의 넓이를 구합니다. 각 막대를 높이로 하는 직사각형이 좌우로 얼마나 퍼지는지는, 그 막대보다 낮은 첫 막대가 어디인지로 정해집니다. 모노토닉 스택에 높이가 줄지 않는 순서로 인덱스를 쌓고, 더 낮은 막대를 만나면 꺼내며 넓이를 계산합니다.'));
        for (i = 0; i <= n; i++) {
            var cur = i < n ? h[i] : 0;
            while (st.length && cur < h[st[st.length - 1]]) {
                var t = st.pop();
                var left = st.length ? st[st.length - 1] + 1 : 0;
                var width = i - left;
                var area = h[t] * width;
                if (area > best) best = area;
                HIST_STEPS.push(sstep(h, i, st, [t], null, [left, i - 1, h[t]], '꺼냄: 높이 ' + h[t] + ' × 너비 ' + width + ' = ' + area, '지금까지 최대 넓이 ' + best, i === n ? '끝에 높이 0인 막대를 하나 더 둠' : '', (i === n ? '끝에 높이 0인 가상 막대를 두어 남은 막대를 모두 꺼냅니다. ' : '새 막대의 높이 ' + cur + eun(cur) + ' top보다 낮습니다. ') + '인덱스 ' + t + '(높이 ' + h[t] + ')' + eu(h[t]) + ' 꺼냅니다. 이 막대보다 낮은 막대가 왼쪽은 ' + (left === 0 ? '없고' : '인덱스 ' + (left - 1)) + ', 오른쪽은 인덱스 ' + i + '이므로 너비는 ' + left + '부터 ' + (i - 1) + '까지 ' + width + '칸입니다. 넓이는 ' + h[t] + ' × ' + width + ' = ' + area + '입니다.'));
            }
            if (i < n) {
                st.push(i);
                HIST_STEPS.push(sstep(h, i, st, [], null, null, '넣음: 인덱스 ' + i + ' (높이 ' + h[i] + ')', '스택(아래 → 위): ' + stackText(st), '지금까지 최대 넓이 ' + best, '막대 ' + i + '의 높이 ' + h[i] + '보다 높은 top이 없으므로 인덱스 ' + i + eu(i) + ' 스택에 넣습니다. 스택: ' + stackText(st) + ', 높이가 줄지 않는 순서입니다.'));
            }
        }
        HIST_STEPS.push(sstep(h, n, st, [], null, null, '가장 큰 직사각형의 넓이 = ' + best, '모든 막대를 한 번 넣고 한 번 꺼냄', 'O(n)', '정리 — 가장 큰 직사각형의 넓이는 ' + best + '입니다. 높이 5인 막대와 높이 6인 막대가 이어진 구간에서 높이 5, 너비 2로 만들어집니다. 각 막대를 한 번 넣고 한 번 꺼내므로 시간은 O(n)입니다.'));
    })();

    /* ===================== 데이터: 주가 스팬 ===================== */
    var SPAN_ARR = [100, 80, 60, 70, 60, 75, 85];
    var SPAN_STEPS = [];
    (function () {
        var p = SPAN_ARR;
        var n = p.length;
        var st = [];
        var ans = [];
        var i;
        var j;
        for (j = 0; j < n; j++) ans.push(null);
        SPAN_STEPS.push(sstep(p, -1, st, [], ans, null, '주가 스팬: 이전에 더 큰 값까지의 거리', '오늘 가격 이하였던 연속 일수', '', '날마다 오늘 가격보다 큰 가격이 마지막으로 나온 날을 찾아, 그 뒤로 오늘까지 가격이 오늘 이하였던 연속 일수(스팬)를 구합니다. 이번에는 왼쪽에서 오른쪽으로 가며 스택에 단조 감소 순서로 인덱스를 쌓고, 오늘 가격 이하인 top은 더 이상 필요 없으므로 꺼냅니다.'));
        for (i = 0; i < n; i++) {
            var popped = [];
            while (st.length && p[st[st.length - 1]] <= p[i]) popped.push(st.pop());
            var prev = st.length ? st[st.length - 1] : -1;
            ans[i] = i - prev;
            st.push(i);
            SPAN_STEPS.push(sstep(p, i, st, popped, ans, null, '날 ' + i + ': 가격 ' + p[i] + ' → 스팬 ' + ans[i], popped.length ? '꺼낸 인덱스 ' + popped.join(', ') : '꺼낼 것 없음', '스택(아래 → 위): ' + stackText(st), '날 ' + i + '의 가격은 ' + p[i] + '입니다. ' + (popped.length ? '스택에서 가격이 이 값 이하인 인덱스를 꺼냅니다: ' + popped.join(', ') + '. ' : '스택 top보다 가격이 낮아 꺼낼 것이 없습니다. ') + (prev < 0 ? '스택이 비었으므로 처음부터 오늘까지 ' + ans[i] + '일입니다.' : '남은 top은 인덱스 ' + prev + '(가격 ' + p[prev] + ')이므로 스팬은 ' + i + ' - ' + prev + ' = ' + ans[i] + '입니다.') + ' 이어서 인덱스 ' + i + eu(i) + ' 스택에 넣습니다.'));
        }
        SPAN_STEPS.push(sstep(p, n, st, [], ans, null, '스팬 = [' + ans.join(', ') + ']', '각 날을 한 번 넣고 최대 한 번 꺼냄', 'O(n)', '정리 — 스팬은 [' + ans.join(', ') + ']입니다. 가격이 크게 오른 날(스팬 6)에는 이전의 낮은 가격 날들이 한꺼번에 스택에서 빠집니다. 꺼낸 날은 다시 보지 않으므로 전체 시간은 O(n)입니다.'));
    })();

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'hist') return HIST_STEPS;
        if (mode === 'span') return SPAN_STEPS;
        return NGE_STEPS;
    }
    function defaultLog() {
        if (mode === 'hist') return '막대 히스토그램에서 가장 큰 직사각형을 스택으로 찾는 과정을 봅니다.';
        if (mode === 'span') return '오늘 가격 이하인 날들을 스택에서 꺼내 스팬을 구하는 과정을 봅니다.';
        return '스택 top보다 큰 값이 오면 꺼내며 다음 큰 원소를 확정하는 과정을 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    var msCapMemo = {};
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }
    function msFs(mob) { return mob ? 10.5 : 12; }
    function msBlockH(str, w, fs, lh) {
        return str ? lines(str, w - 8, fs).length * lh : 0;
    }
    function msCapH(s, w, fs) {
        return 6 + msBlockH(s.cap, w, fs, fs + 5) + msBlockH(s.cap2, w, fs - 1, fs + 4) + msBlockH(s.cap3, w, fs - 1, fs + 4);
    }
    function msCapMax(w, mob) {
        var fs = msFs(mob);
        var key = Math.round(w) + (mob ? 'm' : 'd');
        if (msCapMemo[key] === undefined) {
            var best = 0;
            [NGE_STEPS, HIST_STEPS, SPAN_STEPS].forEach(function (arr) {
                arr.forEach(function (s) {
                    var h = msCapH(s, w, fs);
                    if (h > best) best = h;
                });
            });
            msCapMemo[key] = best;
        }
        return msCapMemo[key];
    }
    function layout(w, mob) {
        var fs = msFs(mob);
        var bh = mob ? 80 : 104;
        var barBase = 30 + bh;
        var capTop = barBase + 120;
        return { fs: fs, bh: bh, barBase: barBase, capTop: capTop, total: capTop + msCapMax(w, mob) + 4 };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 기하 ===================== */
    function msGeom(x0, top, w, mob, n) {
        var L = layout(w, mob);
        var cw = Math.min(54, w / n);
        var base = top + L.barBase;
        return {
            x0: x0, w: w, top: top, n: n, fs: L.fs, bh: L.bh, cw: cw,
            ox: x0 + (w - cw * n) / 2, base: base,
            idxY: base + 11, stTitleY: base + 30, stY: base + 40,
            ansTitleY: base + 72, ansY: base + 82, capTop: top + L.capTop
        };
    }
    function msL(g, k) { return g.ox + k * g.cw; }
    function msCX(g, k) { return g.ox + k * g.cw + g.cw / 2; }
    function msMax(vals) {
        var m = 1;
        vals.forEach(function (v) { if (v > m) m = v; });
        return m;
    }
    function msTop(g, v, maxV) { return g.base - Math.max(4, (v / maxV) * g.bh); }

    /* ===================== 막대 ===================== */
    function msBars(g, s, p, maxV, fresh, e) {
        s.vals.forEach(function (v, k) {
            var isPop = s.popped.indexOf(k) >= 0;
            var inSt = s.stack.indexOf(k) >= 0;
            var isCur = k === s.i;
            var col = isPop ? P.yellow : (inSt ? P.teal : P.sub);
            var y = msTop(g, v, maxV);
            rr(msL(g, k) + 4, y, g.cw - 8, g.base - y, 3, col + (isPop || inSt ? '66' : '33'), isCur ? P.purple + 'ff' : col + 'bb', isCur ? 3 : 1.4);
            tx(String(v), msCX(g, k), y - 8, g.fs - 1, P.text + 'ff', 'center', true);
            tx(String(k), msCX(g, k), g.idxY, g.fs - 1, P.sub + 'ff', 'center', false);
        });
        if (fresh && s.i >= 0 && s.i < g.n && s.i !== p.i) {
            ctx.globalAlpha = 1 - e;
            circ(msCX(g, s.i), msTop(g, s.vals[s.i], maxV), 6 + 16 * ez(e), 'none', P.purple + 'ff', 2);
            ctx.globalAlpha = 1;
        }
    }
    function msCompare(g, s, maxV, e) {
        if (s.i < 0 || s.i >= g.n || !s.popped.length) return;
        var yi = msTop(g, s.vals[s.i], maxV);
        ctx.globalAlpha = ez(seg(e, 0.1, 0.5));
        s.popped.forEach(function (k) {
            ln(msCX(g, s.i), yi, msCX(g, k), msTop(g, s.vals[k], maxV), P.yellow + 'ff', 1.4, [4, 3]);
        });
        ctx.globalAlpha = 1;
    }

    /* ===================== 직사각형 ===================== */
    function msRect(g, s, maxV, fresh, e) {
        if (!s.ext) return;
        var xL = msL(g, s.ext[0]) + 2;
        var xR = msL(g, s.ext[1]) + g.cw - 2;
        var grow = fresh ? ez(seg(e, 0, 0.7)) : 1;
        var xE = lerp(xL, xR, grow);
        var yT = msTop(g, s.ext[2], maxV);
        rr(xL, yT, xE - xL, g.base - yT, 2, P.green + '22', P.green + 'ff', 2);
    }
    function msBracket(g, s, p, e) {
        var i = s.i;
        if (!s.ans || i < 0 || i >= g.n || s.ans[i] === null || p.ans[i] !== null) return;
        var before = s.stack.length >= 2 ? s.stack[s.stack.length - 2] : -1;
        var xL = msL(g, before + 1) + 4;
        var xR = msL(g, i) + g.cw - 4;
        var yB = g.top + 9;
        ctx.globalAlpha = ez(seg(e, 0.15, 0.7));
        ln(xL, yB, xR, yB, P.green + 'ff', 1.6);
        ln(xL, yB, xL, yB + 5, P.green + 'ff', 1.6);
        ln(xR, yB, xR, yB + 5, P.green + 'ff', 1.6);
        ctx.globalAlpha = 1;
    }

    /* ===================== 스택 ===================== */
    function msChip(g, cx, cy, label, col, strong) {
        var wd = g.cw - 8;
        rr(cx - wd / 2, cy - 11, wd, 22, 4, col + '55', strong ? col + 'ff' : col + 'aa', strong ? 2 : 1.4);
        tx(label, cx, cy, g.fs, P.text + 'ff', 'center', true);
    }
    function msStackRow(g, s, p, maxV, fresh, e) {
        var k;
        tx('스택 (아래 → 위)', g.x0 + 2, g.stTitleY, g.fs - 1, P.sub + 'ff', 'left', true);
        for (k = 0; k < g.n; k++) rr(msL(g, k) + 4, g.stY, g.cw - 8, 22, 4, 'none', P.sub + '44', 1);
        var flying = fresh && s.stack.length > p.stack.length ? s.stack.length - 1 : -1;
        s.stack.forEach(function (id, sk) {
            if (sk === flying && e < 1) return;
            msChip(g, msCX(g, sk), g.stY + 11, String(id), P.teal, sk === s.stack.length - 1);
        });
        if (flying >= 0 && e < 1) {
            var id0 = s.stack[flying];
            var mvIn = ez(e);
            var fromX = msCX(g, id0);
            var fromY = msTop(g, s.vals[id0], maxV) - 4;
            msChip(g, lerp(fromX, msCX(g, flying), mvIn), lerp(fromY, g.stY + 11, mvIn) - Math.sin(Math.PI * mvIn) * 22, String(id0), P.yellow, true);
        }
        if (fresh) {
            s.popped.forEach(function (id, j) {
                var pk = p.stack.length - 1 - j;
                if (pk < 0) return;
                var sx = msCX(g, pk);
                var sy = g.stY + 11;
                if (mode === 'nge') {
                    if (e >= 0.65) return;
                    var mvOut = ez(seg(e, 0, 0.65));
                    msChip(g, lerp(sx, msCX(g, id), mvOut), lerp(sy, g.ansY + 11, mvOut) - Math.sin(Math.PI * mvOut) * 14, String(id), P.yellow, true);
                    return;
                }
                var fa = 1 - seg(e, 0.1, 0.8);
                if (fa <= 0) return;
                ctx.globalAlpha = fa;
                msChip(g, sx, sy + 26 * ez(e), String(id), P.sub, false);
                ctx.globalAlpha = 1;
            });
        }
    }

    /* ===================== 답 ===================== */
    function msAnsRow(g, s, p, fresh, e) {
        if (!s.ans) {
            tx('직사각형', g.x0 + 2, g.ansTitleY, g.fs - 1, P.sub + 'ff', 'left', true);
            var rw = s.ext ? s.ext[1] - s.ext[0] + 1 : 0;
            var info = s.ext ? '높이 ' + s.ext[2] + ' × 너비 ' + rw + ' = ' + s.ext[2] * rw : '(이 단계에서 꺼낸 막대가 없습니다)';
            tx(info, g.x0 + g.w / 2, g.ansY + 11, g.fs - 0.5, (s.ext ? P.green : P.sub) + 'ff', 'center', true);
            return;
        }
        tx(mode === 'span' ? '스팬' : '답', g.x0 + 2, g.ansTitleY, g.fs - 1, P.sub + 'ff', 'left', true);
        var sweep = fresh && s.ans.every(function (v) { return v !== null; }) && s.ans.join() === p.ans.join();
        var k;
        for (k = 0; k < g.n; k++) {
            var a = s.ans[k];
            var x = msL(g, k) + 4;
            var wd = g.cw - 8;
            if (a === null) {
                rr(x, g.ansY, wd, 22, 4, 'none', P.sub + '55', 1.2);
                continue;
            }
            var isNew = fresh && p.ans[k] === null;
            ctx.globalAlpha = isNew ? ez(seg(e, 0.55, 0.95)) : 1;
            rr(x, g.ansY, wd, 22, 4, P.green + '22', P.green + 'ff', 1.2);
            tx(String(a), msCX(g, k), g.ansY + 11, g.fs, P.green + 'ff', 'center', true);
            ctx.globalAlpha = 1;
            if (sweep) {
                var c0 = 0.6 * k / g.n;
                ctx.globalAlpha = Math.sin(Math.PI * seg(e, c0, c0 + 0.4));
                rr(x - 1, g.ansY - 1, wd + 2, 24, 4, 'none', P.yellow + 'ff', 2);
                ctx.globalAlpha = 1;
            }
        }
    }

    /* ===================== 설명 ===================== */
    function msCapBlock(str, cx, y, w, fs, lh, col, bold) {
        if (!str) return y;
        var rows = lines(str, w - 8, fs);
        rows.forEach(function (row, li) {
            tx(row, cx, y + li * lh + lh / 2, fs, col, 'center', bold);
        });
        return y + rows.length * lh;
    }
    function msCaps(g, s, fresh, e) {
        var cx = g.x0 + g.w / 2;
        var fs = g.fs;
        ctx.globalAlpha = fresh ? 0.35 + 0.65 * ez(e) : 1;
        var y = msCapBlock(s.cap, cx, g.capTop, g.w, fs, fs + 5, P.yellow + 'ff', true);
        y = msCapBlock(s.cap2, cx, y, g.w, fs - 1, fs + 4, P.text + 'ee', false);
        msCapBlock(s.cap3, cx, y, g.w, fs - 1, fs + 4, P.green + 'ff', true);
        ctx.globalAlpha = 1;
    }

    /* ===================== 메인 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var e = clamp01(t);
        var s = step || currentSteps()[0];
        var p = prev || s;
        var fresh = s !== p;
        var maxV = msMax(s.vals);
        var g = msGeom(x0, top, w, mob, s.vals.length);
        msBars(g, s, p, maxV, fresh, e);
        msRect(g, s, maxV, fresh, e);
        if (mode === 'span') msBracket(g, s, p, e);
        msCompare(g, s, maxV, e);
        msStackRow(g, s, p, maxV, fresh, e);
        msAnsRow(g, s, p, fresh, e);
        msCaps(g, s, fresh, e);
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
        speedBtns.forEach(function (b) { b.classList.remove('ms-viz__speed-btn--active'); });
        btn.classList.add('ms-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('ms-viz__mode-btn--active', d.key === m); });
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