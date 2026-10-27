/**
 * 투 포인터 / 슬라이딩 윈도우 시각화 시각화
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
    var root    = el('div', 'two-pointer-viz');
    var toolbar = el('div', 'two-pointer-viz__toolbar');
    var tbLeft  = el('div', 'two-pointer-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'two-pointer-viz__title', 'TWO POINTER'));

    var modeWrap = el('div', 'two-pointer-viz__mode');
    var modeDefs = [
        { key: 'twoptr', label: '투 포인터' },
        { key: 'window', label: '슬라이딩 윈도우' },
        { key: 'unsorted', label: '정렬이 필요한 이유' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'two-pointer-viz__mode-btn' + (i === 0 ? ' two-pointer-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'two-pointer-viz__speed');
    speedWrap.appendChild(el('span', 'two-pointer-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'two-pointer-viz__speed-btn' + (i === 0 ? ' two-pointer-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'two-pointer-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'two-pointer-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'two-pointer-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'two-pointer-viz__controls');
    var btnPlay  = el('button', 'two-pointer-viz__btn two-pointer-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'two-pointer-viz__btn', '▶| STEP');
    var btnReset = el('button', 'two-pointer-viz__btn', '↺ RESET');
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
    var mode    = 'twoptr';
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

    /* ===================== 투 포인터 데이터 & 스텝 (정렬 배열에서 합이 target인 두 수 찾기) ===================== */
    var TP_ARR = [1, 2, 3, 5, 7, 9, 11, 13, 15];
    var TP_TARGET = 9;

    var UNSORTED_ARR = [7, 2, 15, 1, 9, 3, 13, 5, 11];
    var UNSORTED_TARGET = 9;

    function buildTwoPointerSteps(arr, target, opts) {
        opts = opts || {};
        var steps = [];
        var left = 0, right = arr.length - 1;
        var leftMoves = 0, rightMoves = 0;
        steps.push({ type: 'intro', left: left, right: right, sum: null, leftMoves: 0, rightMoves: 0,
            log: opts.introLog || ('PLAY를 눌러보세요. 정렬된 배열 양 끝에서 포인터 둘이 출발해 합이 ' + target + '이 되는 두 수를 찾습니다.') });

        while (left < right) {
            var sum = arr[left] + arr[right];
            var log;
            if (sum === target) {
                log = arr[left] + ' + ' + arr[right] + ' = ' + sum + ' → 목표와 정확히 같아요! 찾았습니다.';
                steps.push({ type: 'found', left: left, right: right, sum: sum, leftMoves: leftMoves, rightMoves: rightMoves, log: log });
                break;
            } else if (sum < target) {
                log = arr[left] + ' + ' + arr[right] + ' = ' + sum + ' → 목표(' + target + ')보다 작아요. 왼쪽 포인터를 오른쪽으로 옮겨 더 큰 값을 시도해요.';
                left++; leftMoves++;
                steps.push({ type: 'move-left', left: left, right: right, sum: sum, leftMoves: leftMoves, rightMoves: rightMoves, log: log });
            } else {
                log = arr[left] + ' + ' + arr[right] + ' = ' + sum + ' → 목표(' + target + ')보다 커요. 오른쪽 포인터를 왼쪽으로 옮겨 더 작은 값을 시도해요.';
                right--; rightMoves++;
                steps.push({ type: 'move-right', left: left, right: right, sum: sum, leftMoves: leftMoves, rightMoves: rightMoves, log: log });
            }
        }
        var last = steps[steps.length - 1];
        if (last.type !== 'found') {
            last.log += opts.notFoundLog || ' 포인터가 서로 만나 더 확인할 쌍이 없어요 — 이 배열엔 답이 없습니다.';
            if (opts.actualPair) last.actualPair = opts.actualPair;
        } else {
            last.log += ' 왼쪽은 ' + leftMoves + '번, 오른쪽은 ' + rightMoves + '번 움직여서 찾았어요 — 둘 다 최대 배열 길이만큼만 움직이니 O(n)입니다.';
        }
        return steps;
    }

    var TWOPTR_STEPS = buildTwoPointerSteps(TP_ARR, TP_TARGET, {});

    var UNSORTED_STEPS = buildTwoPointerSteps(UNSORTED_ARR, UNSORTED_TARGET, {
        introLog: 'PLAY를 눌러보세요. 이번엔 같은 숫자들을 정렬만 안 한 배열에, 완전히 똑같은 투 포인터 로직을 그대로 적용해봅니다.',
        notFoundLog: ' 그런데 이 배열에는 ' + UNSORTED_ARR[0] + ' + ' + UNSORTED_ARR[1] + ' = ' + (UNSORTED_ARR[0] + UNSORTED_ARR[1]) +
            '이라는 답이 실제로 있어요(인덱스 0, 1)! 정렬 안 된 배열에서는 이 로직이 답을 그냥 지나쳐버립니다 — 그래서 투 포인터는 반드시 정렬된 배열에서만 써야 합니다.',
        actualPair: [0, 1],
    });

    /* ===================== 슬라이딩 윈도우 데이터 & 스텝 (합이 target 이상인 최소 길이 구간) ===================== */
    var SW_ARR = [2, 1, 5, 2, 3, 2];
    var SW_TARGET = 7;

    function buildWindowSteps() {
        var steps = [];
        var left = 0, sum = 0, minLen = Infinity, minStart = -1, minEnd = -1;
        steps.push({ type: 'intro', left: 0, right: -1, sum: 0, minLen: null,
            log: 'PLAY를 눌러보세요. 오른쪽 끝을 늘려가며 합이 ' + SW_TARGET + ' 이상이 되면, 왼쪽을 줄일 수 있는 만큼 줄여서 가장 짧은 구간을 찾습니다.' });

        for (var right = 0; right < SW_ARR.length; right++) {
            sum += SW_ARR[right];
            steps.push({ type: 'expand', left: left, right: right, sum: sum, minLen: minLen === Infinity ? null : minLen,
                log: '오른쪽을 ' + right + '번 칸까지 늘려요. 창 안의 합 = ' + sum + '.' });

            while (sum >= SW_TARGET) {
                var curLen = right - left + 1;
                var improved = curLen < minLen;
                if (improved) { minLen = curLen; minStart = left; minEnd = right; }
                var log = '합 ' + sum + ' ≥ 목표(' + SW_TARGET + ') → 이 구간 길이는 ' + curLen + '.' +
                    (improved ? ' 지금까지 가장 짧아요! 기록 갱신.' : ' 이전 기록(' + minLen + ')보다 길어서 기록은 그대로.');
                steps.push({ type: 'check', left: left, right: right, sum: sum, minLen: minLen, log: log });

                sum -= SW_ARR[left];
                left++;
                steps.push({ type: 'shrink', left: left, right: right, sum: sum, minLen: minLen,
                    log: '왼쪽을 한 칸 줄여요. 창 안의 합 = ' + sum + (sum >= SW_TARGET ? ' — 아직 목표 이상이니 계속 줄여봐요.' : ' — 목표보다 작아져서 이제 오른쪽을 늘릴 차례예요.') });
            }
        }
        var last = steps[steps.length - 1];
        last.type = 'done';
        last.log += ' 다 훑었어요! 가장 짧은 구간은 길이 ' + minLen + ' (인덱스 ' + minStart + '~' + minEnd + ', [' +
            SW_ARR.slice(minStart, minEnd + 1).join(', ') + ']) 입니다.';
        return steps;
    }

    var WINDOW_STEPS = buildWindowSteps();

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'window') return WINDOW_STEPS;
        if (mode === 'unsorted') return UNSORTED_STEPS;
        return TWOPTR_STEPS;
    }
    function defaultLog() {
        return currentSteps()[0].log;
    }

    /* ===================== 레이아웃 ===================== */
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    function tpArr() {
        if (mode === 'window') return SW_ARR;
        if (mode === 'unsorted') return UNSORTED_ARR;
        return TP_ARR;
    }

    function tpTarget() {
        if (mode === 'window') return SW_TARGET;
        if (mode === 'unsorted') return UNSORTED_TARGET;
        return TP_TARGET;
    }

    function tpLayout(w, mob) {
        var n = tpArr().length;
        var fs = mob ? 11 : 12.5;
        var lineH = fs + 5;
        var gap = mob ? 4 : 8;
        var bw = Math.min(mob ? 34 : 52, Math.floor((w - (n - 1) * gap) / n));
        var gridW = n * bw + (n - 1) * gap;
        var topH = mob ? 24 : 28;
        var boxTop = topH + 4;
        var boxH = mob ? 36 : 44;
        var eqTop = boxTop + boxH + 20;
        var eqH = mob ? 22 : 24;
        var stripTop = eqTop + eqH + 4;
        var worst = mode === 'window'
            ? ['창의 합: 999   목표: 99 이상', '최소 길이 기록: 아직 없음']
            : ['현재 합: 999   목표: 99', 'L 왼쪽 이동 99번   R 오른쪽 이동 99번'];
        var stripH = 0;
        worst.forEach(function (str) { stripH += lines(str, w, fs).length * lineH + 4; });
        var revealH = mode === 'unsorted' ? lineH + 4 : 0;
        return {
            bw: bw, gap: gap, gridX: Math.max(0, (w - gridW) / 2), boxH: boxH,
            boxTop: boxTop, topH: topH, eqTop: eqTop, eqH: eqH,
            stripTop: stripTop, revealTop: stripTop + stripH,
            fs: fs, vfs: mob ? 13 : 15, lineH: lineH,
            markR: mob ? 8 : 9.5, markOff: mob ? 9 : 11,
            total: stripTop + stripH + revealH + 8
        };
    }
    function sceneH(w, mob) { return tpLayout(w, mob).total; }

    /* ===================== 장면 그리기 헬퍼 ===================== */
    function tpBoxX(L, x0, i) { return x0 + L.gridX + i * (L.bw + L.gap); }
    function tpCx(L, x0, i) { return tpBoxX(L, x0, i) + L.bw / 2; }

    function tpClampX(x, str, fs, minX, maxX) {
        ctx.font = '700 ' + fs + 'px "JetBrains Mono",monospace';
        var hw = ctx.measureText(str).width / 2;
        return Math.max(minX + hw, Math.min(maxX - hw, x));
    }

    function tpRow(x0, y, w, L, str, col) {
        var rows = lines(str, w, L.fs);
        rows.forEach(function (row, li) {
            tx(row, x0, y + li * L.lineH + L.lineH / 2, L.fs, col, 'left', true);
        });
        return y + rows.length * L.lineH + 4;
    }

    function tpStyle(st) {
        if (st === 'found') return { c: P.green, fa: '2a', sa: 'ee', lw: 2.4, tc: P.text + 'ff', bold: true };
        if (st === 'left') return { c: P.teal, fa: '22', sa: 'ee', lw: 2, tc: P.text + 'ff', bold: true };
        if (st === 'right') return { c: P.purple, fa: '22', sa: 'ee', lw: 2, tc: P.text + 'ff', bold: true };
        if (st === 'both' || st === 'in') return { c: P.orange, fa: '22', sa: 'ee', lw: 2, tc: P.text + 'ff', bold: true };
        if (st === 'inner') return { c: P.text, fa: '0c', sa: '40', lw: 1.2, tc: P.text + 'cc', bold: false };
        return { c: P.muted, fa: '06', sa: '22', lw: 1.2, tc: P.sub + '88', bold: false };
    }

    function tpBoxDraw(L, bx, boxTop, val, st, a) {
        if (a <= 0) return;
        var S = tpStyle(st);
        ctx.globalAlpha = a;
        rr(bx, boxTop, L.bw, L.boxH, 4, S.c + S.fa, S.c + S.sa, S.lw);
        tx(String(val), bx + L.bw / 2, boxTop + L.boxH / 2, L.vfs, S.tc, 'center', S.bold);
        ctx.globalAlpha = 1;
    }

    function tpDrawBoxes(L, x0, boxTop, arr, s, p, fresh, e, stateOf) {
        var i;
        for (i = 0; i < arr.length; i++) {
            var bx = tpBoxX(L, x0, i);
            var cst = stateOf(s, i), pst = stateOf(p, i);
            if (cst === pst || !fresh) {
                tpBoxDraw(L, bx, boxTop, arr[i], cst, 1);
            } else {
                var g = ez(seg(e, 0.15, 0.85));
                tpBoxDraw(L, bx, boxTop, arr[i], pst, 1 - g);
                tpBoxDraw(L, bx, boxTop, arr[i], cst, g);
            }
            tx(String(i), bx + L.bw / 2, boxTop + L.boxH + 10, L.fs, P.sub + 'ff', 'center', false);
        }
    }

    function tpBoxState(s, i) {
        if (s.type === 'found' && (i === s.left || i === s.right)) return 'found';
        if (i === s.left && i === s.right) return 'both';
        if (i === s.left) return 'left';
        if (i === s.right) return 'right';
        if (i < s.left || i > s.right) return 'out';
        return 'inner';
    }

    function tpMarkX(L, x0, w, st, isLeft) {
        var idx = isLeft ? st.left : st.right;
        var cx = tpCx(L, x0, idx);
        if (st.left === st.right) cx += isLeft ? -L.markOff : L.markOff;
        return Math.max(x0 + L.markR, Math.min(x0 + w - L.markR, cx));
    }

    function tpMarker(L, x, my, boxTop, col, letter) {
        ln(x, my + L.markR, x, boxTop - 2, col + '88', 1.4);
        circ(x, my, L.markR, col + '28', col + 'ee', 1.6);
        tx(letter, x, my, L.fs, col + 'ff', 'center', true);
    }

    function tpWinState(s, i) { return i >= s.left && i <= s.right ? 'in' : 'out'; }

    function tpWinEdges(L, x0, s) {
        var n = SW_ARR.length;
        var l = Math.max(0, Math.min(n - 1, s.left));
        var x = tpBoxX(L, x0, l) - L.gap / 2;
        if (s.right < s.left) return { x0: x, x1: x, empty: true };
        var r = Math.min(n - 1, s.right);
        return { x0: x, x1: tpBoxX(L, x0, r) + L.bw + L.gap / 2, empty: false };
    }

    function tpWinRecord(steps, upto) {
        var rec = null;
        for (var k = 0; k <= upto && k < steps.length; k++) {
            var st = steps[k];
            if (st.type !== 'check') continue;
            var len = st.right - st.left + 1;
            if (rec === null || len < rec.len) rec = { l: st.left, r: st.right, len: len };
        }
        return rec;
    }

    /* ===================== 투 포인터 장면 ===================== */
    function tpDrawPair(x0, top, w, L, s, p, fresh, e) {
        var arr = tpArr();
        var target = tpTarget();
        var pr = function (a, b) { return fresh ? seg(e, a, b) : 1; };
        var boxTop = top + L.boxTop;
        var my = top + L.topH / 2;

        tpDrawBoxes(L, x0, boxTop, arr, s, p, fresh, e, tpBoxState);

        if (fresh && s.sum != null) {
            var found = s.type === 'found';
            var ba = pr(0, 0.2) * (found ? 1 : 1 - pr(0.7, 0.95));
            if (ba > 0) {
                var col = found ? P.green : P.orange;
                var xa = tpCx(L, x0, p.left), xb = tpCx(L, x0, p.right);
                var yb = top + L.eqTop + 3;
                var eqStr = arr[p.left] + ' + ' + arr[p.right] + ' = ' + s.sum;
                ctx.globalAlpha = ba;
                ln(xa, yb, xb, yb, col + 'cc', 1.6);
                ln(xa, yb - 4, xa, yb, col + 'cc', 1.6);
                ln(xb, yb - 4, xb, yb, col + 'cc', 1.6);
                tx(eqStr, tpClampX((xa + xb) / 2, eqStr, L.fs, x0, x0 + w), yb + 4 + L.lineH / 2, L.fs, col + 'ff', 'center', true);
                ctx.globalAlpha = 1;
            }
        }

        var k = ez(pr(0.3, 0.8));
        var lx = lerp(tpMarkX(L, x0, w, p, true), tpMarkX(L, x0, w, s, true), k);
        var rx = lerp(tpMarkX(L, x0, w, p, false), tpMarkX(L, x0, w, s, false), k);
        tpMarker(L, lx, my, boxTop, P.teal, 'L');
        tpMarker(L, rx, my, boxTop, P.purple, 'R');

        var rv = s.actualPair ? pr(0.5, 1) : 0;
        if (rv > 0) {
            ctx.globalAlpha = rv;
            ctx.setLineDash([4, 3]);
            s.actualPair.forEach(function (idx) {
                rr(tpBoxX(L, x0, idx) - 3, boxTop - 3, L.bw + 6, L.boxH + 6, 6, 'none', P.orange + 'dd', 2);
            });
            ctx.setLineDash([]);
            tx('놓친 정답이 여기 있었어요!', x0 + w / 2, top + L.revealTop + L.lineH / 2, L.fs, P.orange + 'ee', 'center', true);
            ctx.globalAlpha = 1;
        }

        var y = top + L.stripTop;
        var sumStr = s.sum != null ? '현재 합: ' + s.sum + '   목표: ' + target : '목표: ' + target;
        var sumCol = s.sum != null ? (s.type === 'found' ? P.green : P.orange) : P.text;
        y = tpRow(x0, y, w, L, sumStr, sumCol + 'ff');
        tpRow(x0, y, w, L, 'L 왼쪽 이동 ' + (s.leftMoves || 0) + '번   R 오른쪽 이동 ' + (s.rightMoves || 0) + '번', P.teal + 'ee');
    }

    /* ===================== 슬라이딩 윈도우 장면 ===================== */
    function tpDrawWindow(x0, top, w, L, steps, s, p, fresh, e) {
        var pr = function (a, b) { return fresh ? seg(e, a, b) : 1; };
        var boxTop = top + L.boxTop;
        var cur = tpWinEdges(L, x0, s), pv = tpWinEdges(L, x0, p);
        var f = ez(pr(0, 0.7));
        var bx0 = lerp(pv.x0, cur.x0, f), bx1 = lerp(pv.x1, cur.x1, f);
        if (bx1 - bx0 > 0.5) {
            rr(bx0, boxTop - 4, bx1 - bx0, L.boxH + 6, 6, P.orange + '20', P.orange + 'aa', 1.4);
            var la = cur.empty ? 0 : (pv.empty ? f : 1);
            if (la > 0) {
                ctx.globalAlpha = la;
                tx('창(윈도우)', tpClampX((bx0 + bx1) / 2, '창(윈도우)', L.fs, x0, x0 + w), top + L.topH / 2, L.fs, P.orange + 'ee', 'center', true);
                ctx.globalAlpha = 1;
            }
        }

        tpDrawBoxes(L, x0, boxTop, SW_ARR, s, p, fresh, e, tpWinState);

        var idxS = steps.indexOf(s);
        var rec = tpWinRecord(steps, idxS);
        if (rec) {
            var prevRec = tpWinRecord(steps, idxS - 1);
            var changed = !prevRec || prevRec.l !== rec.l || prevRec.r !== rec.r;
            var grow = fresh && changed ? ez(seg(e, 0, 0.8)) : 1;
            var xa = tpBoxX(L, x0, rec.l), xb = tpBoxX(L, x0, rec.r) + L.bw;
            var mid = (xa + xb) / 2;
            var ry = top + L.eqTop + 4;
            ln(lerp(mid, xa, grow), ry, lerp(mid, xb, grow), ry, P.green + 'ee', 3);
        }

        var y = top + L.stripTop;
        var sumCol = s.sum >= SW_TARGET ? P.green : P.orange;
        y = tpRow(x0, y, w, L, '창의 합: ' + s.sum + '   목표: ' + SW_TARGET + ' 이상', sumCol + 'ff');
        tpRow(x0, y, w, L, s.minLen != null ? '최소 길이 기록: ' + s.minLen : '최소 길이 기록: 아직 없음', P.teal + 'ee');
    }

    /* ===================== 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var steps = currentSteps();
        var s = step || steps[0];
        var p = prev || s;
        var fresh = s !== p;
        var e = clamp01(t);
        var L = tpLayout(w, mob);
        if (mode === 'window') {
            tpDrawWindow(x0, top, w, L, steps, s, p, fresh, e);
        } else {
            tpDrawPair(x0, top, w, L, s, p, fresh, e);
        }
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
        speedBtns.forEach(function (b) { b.classList.remove('two-pointer-viz__speed-btn--active'); });
        btn.classList.add('two-pointer-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('two-pointer-viz__mode-btn--active', d.key === m); });
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