/**
 * 이진 탐색(Binary Search) 시각화 시각화
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
    var root    = el('div', 'binary-search-viz');
    var toolbar = el('div', 'binary-search-viz__toolbar');
    var tbLeft  = el('div', 'binary-search-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'binary-search-viz__title', 'SEARCH'));

    var modeWrap = el('div', 'binary-search-viz__mode');
    var modeDefs = [
        { key: 'binary', label: '이진 탐색' },
        { key: 'compare', label: '선형 탐색과 비교' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'binary-search-viz__mode-btn' + (i === 0 ? ' binary-search-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'binary-search-viz__speed');
    speedWrap.appendChild(el('span', 'binary-search-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'binary-search-viz__speed-btn' + (i === 0 ? ' binary-search-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'binary-search-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'binary-search-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'binary-search-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'binary-search-viz__controls');
    var btnPlay  = el('button', 'binary-search-viz__btn binary-search-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'binary-search-viz__btn', '▶| STEP');
    var btnReset = el('button', 'binary-search-viz__btn', '↺ RESET');
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
    var mode    = 'binary';
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

    /* ===================== 데이터 (정렬된 배열 16개, target=52) ===================== */
    var ARR    = [2, 5, 8, 12, 16, 19, 23, 27, 31, 34, 38, 41, 45, 49, 52, 56];
    var TARGET = 52;

    /* ===================== 이진 탐색 스텝 (실제 알고리즘을 실행하며 기록) ===================== */
    function buildBinarySteps() {
        var steps = [];
        steps.push({ type: 'intro', low: 0, high: ARR.length - 1, mid: -1, count: 0,
            log: 'PLAY를 눌러 정렬된 배열 16개에서 이진 탐색으로 target=' + TARGET + '을 찾는 과정을 확인하세요.' });

        var low = 0, high = ARR.length - 1, count = 0;
        while (low <= high) {
            var mid = Math.floor((low + high) / 2);
            var val = ARR[mid];
            count++;
            var rangeSize = high - low + 1;
            if (val === TARGET) {
                steps.push({ type: 'found', low: low, high: high, mid: mid, count: count,
                    log: '범위 크기 ' + rangeSize + ' (인덱스 ' + low + '~' + high + ') → mid=' + mid + ', arr[mid]=' + val +
                        ' → target과 정확히 일치! 총 ' + count + '번 비교 만에 발견했습니다.' });
                break;
            } else if (val < TARGET) {
                steps.push({ type: 'go-right', low: low, high: high, mid: mid, count: count,
                    log: '범위 크기 ' + rangeSize + ' (인덱스 ' + low + '~' + high + ') → mid=' + mid + ', arr[mid]=' + val +
                        ' < target(' + TARGET + ') → 오른쪽 절반만 다시 탐색합니다.' });
                low = mid + 1;
            } else {
                steps.push({ type: 'go-left', low: low, high: high, mid: mid, count: count,
                    log: '범위 크기 ' + rangeSize + ' (인덱스 ' + low + '~' + high + ') → mid=' + mid + ', arr[mid]=' + val +
                        ' > target(' + TARGET + ') → 왼쪽 절반만 다시 탐색합니다.' });
                high = mid - 1;
            }
        }

        var last = steps[steps.length - 1];
        steps.push({ type: 'done', low: last.low, high: last.high, mid: last.mid, count: last.count,
            log: '이진 탐색은 매 단계마다 탐색 범위를 절반으로 줄이므로 O(log n) 시간이 걸립니다. "선형 탐색과 비교" 탭에서 같은 target을 ' +
                '하나씩 확인하면 몇 번이 걸리는지 비교해보세요.' });
        return steps;
    }

    /* ===================== 선형 탐색 스텝 (같은 배열, 같은 target) ===================== */
    function buildLinearSteps() {
        var steps = [];
        steps.push({ type: 'intro', i: -1, count: 0,
            log: 'PLAY를 눌러 같은 배열, 같은 target=' + TARGET + '을 처음부터 하나씩 확인하는 선형 탐색과 비교해보세요.' });

        for (var i = 0; i < ARR.length; i++) {
            var val = ARR[i];
            var count = i + 1;
            if (val === TARGET) {
                steps.push({ type: 'found', i: i, count: count,
                    log: '인덱스 ' + i + ': arr[' + i + ']=' + val + ' → target과 일치! 선형 탐색은 총 ' + count +
                        '번 비교 만에 찾았습니다 (이진 탐색은 단 4번).' });
                break;
            } else {
                steps.push({ type: 'check', i: i, count: count,
                    log: '인덱스 ' + i + ': arr[' + i + ']=' + val + ' vs target(' + TARGET + ') → 다르므로 다음 칸으로 이동합니다.' });
            }
        }

        var last = steps[steps.length - 1];
        steps.push({ type: 'done', i: last.i, count: last.count,
            log: '정렬된 배열 16개에서 이진 탐색은 4번, 선형 탐색은 15번 비교했습니다. 데이터가 n=1,000,000개로 늘어나면 이진 탐색은 약 ' +
                '20번이면 충분하지만, 선형 탐색은 최악의 경우 1,000,000번까지 걸릴 수 있습니다.' });
        return steps;
    }

    var BINARY_STEPS = buildBinarySteps();
    var LINEAR_STEPS = buildLinearSteps();

    /* ===================== 상태 ===================== */
    function currentSteps() {
        return mode === 'compare' ? LINEAR_STEPS : BINARY_STEPS;
    }
    function defaultLog() {
        return currentSteps()[0].log;
    }

    /* ===================== 레이아웃 ===================== */
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    function bsCapText(c) { return '비교 횟수: ' + c + ' / 최대 4회 (log₂16)'; }

    function layout(w, mob) {
        var n = ARR.length;
        var cmp = mode === 'compare';
        var cols = mob ? Math.ceil(n / 2) : n;
        var rows = Math.ceil(n / cols);
        var gap = mob ? 4 : 5;
        var bw = Math.min(mob ? 36 : 46, Math.floor((w - (cols - 1) * gap) / cols));
        var gridW = cols * bw + (cols - 1) * gap;
        var fs = mob ? 11 : 12;
        var lineH = fs + 5;
        var boxH = mob ? 32 : 42;
        var laneH = mob ? 15 : 18;
        var laneBlockH = (cmp ? 1 : 3) * laneH;
        var rowGap = rows > 1 ? 12 : 0;
        var stride = laneBlockH + 4 + boxH + 18 + rowGap;
        var targetH = 16;
        var panelTop = rows * stride - rowGap + 14;
        var rowH = mob ? 22 : 26;
        var slotW = mob ? 34 : 40;
        var slotH = 16;
        var slotGap = 6;
        var capLines = 0;
        if (!cmp) {
            for (var c = 0; c <= 4; c++) { capLines = Math.max(capLines, lines(bsCapText(c), w, fs).length); }
        }
        var panelH = cmp ? targetH + 8 + 2 * rowH : targetH + 8 + slotH + 8 + capLines * lineH;
        var labelW = mob ? 68 : 84;
        var valW = mob ? 66 : 90;
        return {
            w: w, cols: cols, rows: rows, gap: gap, bw: bw, boxH: boxH,
            gridX: Math.max(0, (w - gridW) / 2),
            fs: fs, vfs: mob ? 11 : 14, lineH: lineH,
            laneH: laneH, laneBlockH: laneBlockH, stride: stride,
            targetH: targetH, panelTop: panelTop, rowH: rowH,
            slotW: slotW, slotH: slotH, slotGap: slotGap,
            labelW: labelW, valW: valW, barMax: Math.max(40, gridW - labelW - valW - 6),
            total: panelTop + panelH + 10
        };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 장면 상태 ===================== */
    function bsStateBin(s, i) {
        if (s.mid === i) return (s.type === 'found' || s.type === 'done') ? 'found' : 'mid';
        if (i >= s.low && i <= s.high) return 'range';
        return 'out';
    }
    function bsStateLin(s, i) {
        if (s.i == null || s.i < 0 || i > s.i) return 'idle';
        if (i === s.i) return (s.type === 'found' || s.type === 'done') ? 'found' : 'cur';
        return 'checked';
    }
    function bsStyle(st) {
        if (st === 'found') return { c: P.green, fa: '2a', sa: 'ff', lw: 2.2, tc: P.text + 'ff', bold: true };
        if (st === 'mid' || st === 'cur') return { c: P.orange, fa: '2a', sa: 'ff', lw: 2.2, tc: P.text + 'ff', bold: true };
        if (st === 'range') return { c: P.teal, fa: '18', sa: 'aa', lw: 1.4, tc: P.text + 'dd', bold: false };
        if (st === 'checked' || st === 'out') return { c: P.muted, fa: '0c', sa: '55', lw: 1.2, tc: P.sub + 'aa', bold: false };
        return { c: P.muted, fa: '00', sa: '44', lw: 1.2, tc: P.sub + 'cc', bold: false };
    }

    /* ===================== 장면 그리기 헬퍼 ===================== */
    function bsBoxPos(L, x0, top, i) {
        return {
            x: x0 + L.gridX + (i % L.cols) * (L.bw + L.gap),
            y: top + Math.floor(i / L.cols) * L.stride + L.laneBlockH + 4
        };
    }
    function bsDrawBox(L, x0, top, i, st, a) {
        if (a <= 0) return;
        var S = bsStyle(st);
        var q = bsBoxPos(L, x0, top, i);
        ctx.globalAlpha = a;
        rr(q.x, q.y, L.bw, L.boxH, 4, S.c + S.fa, S.c + S.sa, S.lw);
        tx(String(ARR[i]), q.x + L.bw / 2, q.y + L.boxH / 2, L.vfs, S.tc, 'center', S.bold);
        ctx.globalAlpha = 1;
    }
    function bsPtrPos(L, x0, top, idx, lane) {
        if (idx == null || idx < 0) return null;
        var row = Math.floor(idx / L.cols);
        var q = bsBoxPos(L, x0, top, idx);
        return {
            x: q.x + L.bw / 2,
            y: top + row * L.stride + lane * L.laneH + L.laneH / 2,
            bt: q.y - 2
        };
    }
    function bsPtrState(L, x0, top, pIdx, cIdx, lane, label, col, e) {
        var a = bsPtrPos(L, x0, top, pIdx, lane);
        var b = bsPtrPos(L, x0, top, cIdx, lane);
        var pos = null, al = 1;
        if (a && b) {
            var k = ez(e);
            pos = { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), bt: lerp(a.bt, b.bt, k) };
        } else if (b) {
            pos = b; al = ez(seg(e, 0.2, 0.8));
        } else if (a) {
            pos = a; al = 1 - ez(seg(e, 0, 0.6));
        }
        return pos && al > 0 ? { pos: pos, al: al, label: label, col: col } : null;
    }
    function bsPanel(L, x0, top, s, p, e) {
        var y = top + L.panelTop;
        var gx = x0 + L.gridX;
        tx('찾는 값 target = ' + TARGET, gx, y + L.targetH / 2, L.fs, P.text + 'cc', 'left', true);
        var y2 = y + L.targetH + 8;
        if (mode === 'compare') {
            var v = lerp(p.count || 0, s.count || 0, ez(e));
            var barX = gx + L.labelW;
            var items = [
                { label: '이진 탐색', val: 4, sub: '4회 (고정)', col: P.purple },
                { label: '선형 탐색', val: v, sub: Math.round(v) + '회', col: P.orange }
            ];
            items.forEach(function (it, k) {
                var ry = y2 + k * L.rowH + L.rowH / 2;
                var bh = L.rowH - 10;
                var bwid = Math.max(4, (it.val / ARR.length) * L.barMax);
                tx(it.label, gx, ry, L.fs, P.text + 'dd', 'left', true);
                rr(barX, ry - bh / 2, bwid, bh, 3, it.col + '55', it.col + 'ee', 1.4);
                tx(it.sub, barX + L.barMax + 8, ry, L.fs, P.text + '99', 'left', false);
            });
        } else {
            var cnt = s.count || 0, pc = p.count || 0;
            for (var k = 0; k < 4; k++) {
                var sx = gx + k * (L.slotW + L.slotGap);
                rr(sx, y2, L.slotW, L.slotH, 4, 'none', P.sub + '55', 1.2);
                var al = k < pc ? 1 : (k < cnt ? ez(seg(e, 0.1, 0.9)) : 0);
                if (al > 0) {
                    ctx.globalAlpha = al;
                    rr(sx, y2, L.slotW, L.slotH, 4, P.orange + '66', P.orange + 'ff', 1.6);
                    ctx.globalAlpha = 1;
                }
            }
            var capY = y2 + L.slotH + 8 + L.lineH / 2;
            lines(bsCapText(cnt), L.w, L.fs).forEach(function (ln2, li) {
                tx(ln2, gx, capY + li * L.lineH, L.fs, P.orange + 'ff', 'left', true);
            });
        }
    }

    /* ===================== 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var e = clamp01(t);
        var s = step || currentSteps()[0];
        var p = prev || s;
        var cmp = mode === 'compare';

        for (var i = 0; i < ARR.length; i++) {
            var cst = cmp ? bsStateLin(s, i) : bsStateBin(s, i);
            var pst = cmp ? bsStateLin(p, i) : bsStateBin(p, i);
            if (pst === cst) {
                bsDrawBox(L, x0, top, i, cst, 1);
            } else {
                var f = ez(seg(e, 0.15, 0.85));
                bsDrawBox(L, x0, top, i, pst, 1 - f);
                bsDrawBox(L, x0, top, i, cst, f);
            }
            var q = bsBoxPos(L, x0, top, i);
            tx(String(i), q.x + L.bw / 2, q.y + L.boxH + 9, L.fs, P.sub + 'ff', 'center', false);
        }

        var hit = (s.type === 'found' || s.type === 'done') ? (cmp ? s.i : s.mid) : -1;
        var wasHit = p.type === 'found' || p.type === 'done';
        if (hit >= 0 && !wasHit && e < 1) {
            var rg = ez(e);
            var hq = bsBoxPos(L, x0, top, hit);
            ctx.globalAlpha = 1 - seg(e, 0.3, 1);
            rr(hq.x - 3 - 8 * rg, hq.y - 3 - 8 * rg, L.bw + 6 + 16 * rg, L.boxH + 6 + 16 * rg, 6, 'none', P.green + 'ff', 2);
            ctx.globalAlpha = 1;
        }

        var ptrs = cmp
            ? [bsPtrState(L, x0, top, p.i, s.i, 0, 'i', P.orange, e)]
            : [
                bsPtrState(L, x0, top, p.low, s.low, 0, 'low', P.teal, e),
                bsPtrState(L, x0, top, p.mid, s.mid, 1, 'mid', P.orange, e),
                bsPtrState(L, x0, top, p.high, s.high, 2, 'high', P.purple, e)
            ];
        ptrs.forEach(function (k) {
            if (!k) return;
            ctx.globalAlpha = k.al;
            ln(k.pos.x, k.pos.y + 7, k.pos.x, k.pos.bt, k.col + '88', 1.4);
            ctx.globalAlpha = 1;
        });
        ptrs.forEach(function (k) {
            if (!k) return;
            ctx.globalAlpha = k.al;
            tx(k.label, k.pos.x, k.pos.y, L.fs, k.col + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        });

        bsPanel(L, x0, top, s, p, e);
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
        speedBtns.forEach(function (b) { b.classList.remove('binary-search-viz__speed-btn--active'); });
        btn.classList.add('binary-search-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('binary-search-viz__mode-btn--active', d.key === m); });
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