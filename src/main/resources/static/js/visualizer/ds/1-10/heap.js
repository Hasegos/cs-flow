/**
 * 힙(Max-Heap) 시각화 시각화
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
    var root    = el('div', 'heap-viz');
    var toolbar = el('div', 'heap-viz__toolbar');
    var tbLeft  = el('div', 'heap-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'heap-viz__title', 'Max-Heap'));

    var modeWrap = el('div', 'heap-viz__mode');
    var modeDefs = [
        { key: 'insert', label: '삽입' },
        { key: 'delete', label: '삭제' },
        { key: 'sort', label: '힙정렬' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'heap-viz__mode-btn' + (i === 0 ? ' heap-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'heap-viz__speed');
    speedWrap.appendChild(el('span', 'heap-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'heap-viz__speed-btn' + (i === 0 ? ' heap-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'heap-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'heap-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'heap-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'heap-viz__controls');
    var btnPlay  = el('button', 'heap-viz__btn heap-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'heap-viz__btn', '▶| STEP');
    var btnReset = el('button', 'heap-viz__btn', '↺ RESET');
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
    var mode    = 'insert';
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

    /* ===================== 스텝 정의 ===================== */
    var INSERT_STEPS = [
        { arr:[],                   heapSize:0, swapA:null, swapB:null, phase:'idle',    log:'빈 Max-Heap. 삽입 순서: 4 → 8 → 15 → 16 → 23 → 42. 삽입 후 Heapify-Up으로 힙 조건을 복원합니다.' },
        { arr:[4],                  heapSize:1, swapA:null, swapB:null, phase:'add',     log:'INSERT 4 → 배열 끝에 추가. 루트이므로 Heapify-Up 불필요. 힙: [4]' },
        { arr:[4,8],                heapSize:2, swapA:1,    swapB:null, phase:'add',     log:'INSERT 8 → index 1에 추가. 부모(index 0)=4 < 8 → 스왑 필요.' },
        { arr:[8,4],                heapSize:2, swapA:1,    swapB:0,    phase:'swap-up', log:'Heapify-Up: 8(idx 1) ↔ 4(idx 0) 스왑. 루트 도달 → 완료. 힙: [8, 4]' },
        { arr:[8,4,15],             heapSize:3, swapA:2,    swapB:null, phase:'add',     log:'INSERT 15 → index 2에 추가. 부모(index 0)=8 < 15 → 스왑 필요.' },
        { arr:[15,4,8],             heapSize:3, swapA:2,    swapB:0,    phase:'swap-up', log:'Heapify-Up: 15(idx 2) ↔ 8(idx 0) 스왑. 루트 도달 → 완료. 힙: [15, 4, 8]' },
        { arr:[15,4,8,16],          heapSize:4, swapA:3,    swapB:null, phase:'add',     log:'INSERT 16 → index 3에 추가. 부모(index 1)=4 < 16 → 스왑 필요.' },
        { arr:[15,16,8,4],          heapSize:4, swapA:3,    swapB:1,    phase:'swap-up', log:'Heapify-Up 1회: 16(idx 3) ↔ 4(idx 1) 스왑. 다시 부모(idx 0)=15 < 16 → 추가 스왑.' },
        { arr:[16,15,8,4],          heapSize:4, swapA:1,    swapB:0,    phase:'swap-up', log:'Heapify-Up 2회: 16(idx 1) ↔ 15(idx 0) 스왑. 루트 도달 → 완료. 힙: [16, 15, 8, 4]' },
        { arr:[16,15,8,4,23],       heapSize:5, swapA:4,    swapB:null, phase:'add',     log:'INSERT 23 → index 4에 추가. 부모(index 1)=15 < 23 → 스왑 필요.' },
        { arr:[16,23,8,4,15],       heapSize:5, swapA:4,    swapB:1,    phase:'swap-up', log:'Heapify-Up 1회: 23(idx 4) ↔ 15(idx 1) 스왑. 부모(idx 0)=16 < 23 → 추가 스왑.' },
        { arr:[23,16,8,4,15],       heapSize:5, swapA:1,    swapB:0,    phase:'swap-up', log:'Heapify-Up 2회: 23(idx 1) ↔ 16(idx 0) 스왑. 루트 도달 → 완료. 힙: [23, 16, 8, 4, 15]' },
        { arr:[23,16,8,4,15,42],    heapSize:6, swapA:5,    swapB:null, phase:'add',     log:'INSERT 42 → index 5에 추가. 부모(index 2)=8 < 42 → 스왑 필요.' },
        { arr:[23,16,42,4,15,8],    heapSize:6, swapA:5,    swapB:2,    phase:'swap-up', log:'Heapify-Up 1회: 42(idx 5) ↔ 8(idx 2) 스왑. 부모(idx 0)=23 < 42 → 추가 스왑.' },
        { arr:[42,16,23,4,15,8],    heapSize:6, swapA:2,    swapB:0,    phase:'swap-up', log:'Heapify-Up 2회: 42(idx 2) ↔ 23(idx 0) 스왑. 루트 도달 → 완료. Max-Heap 완성: [42, 16, 23, 4, 15, 8]' },
    ];

    var DELETE_STEPS = [
        { arr:[42,16,23,4,15,8],  heapSize:6, swapA:null, swapB:null, phase:'idle',      log:'Max-Heap [42, 16, 23, 4, 15, 8]. Extract-Max: 루트(최댓값 42)를 꺼냅니다.' },
        { arr:[8,16,23,4,15,42],  heapSize:5, swapA:0,    swapB:5,    phase:'extract',   log:'루트(42) 제거. 마지막 원소(8)를 루트(index 0)로 이동. 힙 크기 5. 이제 Heapify-Down 시작.' },
        { arr:[23,16,8,4,15,42],  heapSize:5, swapA:0,    swapB:2,    phase:'swap-down', log:'Heapify-Down: 루트 8, 왼쪽 자식 16(idx 1), 오른쪽 자식 23(idx 2). 가장 큰 자식 23(idx 2)과 스왑.' },
        { arr:[23,16,8,4,15,42],  heapSize:5, swapA:null, swapB:null, phase:'idle',      log:'8의 자식: index 5는 힙 범위 밖. 더 이상 스왑 불필요. Extract-Max 완료. 결과 Max-Heap: [23, 16, 8, 4, 15]' },
    ];

    var SORT_STEPS = [
        { arr:[42,16,23,4,15,8], heapSize:6, swapA:null, swapB:null, phase:'idle',      log:'Max-Heap [42, 16, 23, 4, 15, 8]. 힙 정렬: 루트(최댓값)를 끝으로 보내고 힙 크기를 줄이며 반복합니다.' },
        { arr:[8,16,23,4,15,42],  heapSize:5, swapA:0,    swapB:5,    phase:'extract',   log:'EXTRACT: 루트 42(최댓값) ↔ 마지막 원소 8 교환. 42는 정렬 영역으로 확정. 힙 크기 → 5.' },
        { arr:[23,16,8,4,15,42],  heapSize:5, swapA:0,    swapB:2,    phase:'swap-down', log:'Heapify-Down: 8(root) → 자식 중 최대 23(idx 2)과 스왑.' },
        { arr:[15,16,8,4,23,42],  heapSize:4, swapA:0,    swapB:4,    phase:'extract',   log:'EXTRACT: 루트 23 ↔ 마지막 원소 15 교환. 23 확정. 힙 크기 → 4.' },
        { arr:[16,15,8,4,23,42],  heapSize:4, swapA:0,    swapB:1,    phase:'swap-down', log:'Heapify-Down: 15(root) → 자식 중 최대 16(idx 1)과 스왑.' },
        { arr:[4,15,8,16,23,42],  heapSize:3, swapA:0,    swapB:3,    phase:'extract',   log:'EXTRACT: 루트 16 ↔ 마지막 원소 4 교환. 16 확정. 힙 크기 → 3.' },
        { arr:[15,4,8,16,23,42],  heapSize:3, swapA:0,    swapB:1,    phase:'swap-down', log:'Heapify-Down: 4(root) → 자식 중 최대 15(idx 1)과 스왑.' },
        { arr:[8,4,15,16,23,42],  heapSize:2, swapA:0,    swapB:2,    phase:'extract',   log:'EXTRACT: 루트 15 ↔ 마지막 원소 8 교환. 15 확정. 힙 크기 → 2.' },
        { arr:[4,8,15,16,23,42],  heapSize:1, swapA:0,    swapB:1,    phase:'extract',   log:'EXTRACT: 루트 8 ↔ 마지막 원소 4 교환. 8 확정. 힙 크기 → 1.' },
        { arr:[4,8,15,16,23,42],  heapSize:0, swapA:null, swapB:null, phase:'done',      log:'힙 정렬 완료! 오름차순 정렬: [4, 8, 15, 16, 23, 42]. 시간복잡도 O(n log n), 추가 메모리 O(1).' },
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'delete') return DELETE_STEPS;
        if (mode === 'sort') return SORT_STEPS;
        return INSERT_STEPS;
    }
    function defaultLog() {
        return '▶ PLAY를 눌러 힙 동작을 확인하세요.';
    }

    /* ===================== 공용 계산 ===================== */
    var HP_X = [0.5, 0.25, 0.75, 0.125, 0.375, 0.625];
    var HP_LV = [0, 1, 1, 2, 2, 2];
    var HP_EDGE = [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5]];
    var HP_SLOTS = 6;
    function ez(q) {
        q = clamp01(q);
        return q * q * (3 - 2 * q);
    }
    function hpFont(mob) {
        return mob ? { body: 11.5, small: 11, val: 12 } : { body: 13, small: 12, val: 14 };
    }
    function hpCaption() {
        if (mode === 'delete') return 'Extract-Max 후 Heapify-Down: 자식보다 작으면 아래로';
        if (mode === 'sort') return '힙 정렬: Extract-Max 반복 → 오름차순 정렬';
        return '삽입 후 Heapify-Up: 부모보다 크면 위로';
    }
    function hpDoneText() {
        var last = SORT_STEPS[SORT_STEPS.length - 1];
        return '오름차순 정렬 완료: [' + last.arr.join(', ') + ']';
    }
    function hpStyleOf(st, i) {
        var sorted = i >= st.heapSize;
        var hot = i === st.swapA || i === st.swapB;
        var col = P.teal;
        if (sorted) col = P.green;
        else if (st.phase === 'add' && i === st.swapA) col = P.yellow;
        else if (i === st.swapA) col = P.orange;
        else if (i === st.swapB) col = P.purple;
        var lit = sorted || hot;
        return { col: col, fa: lit ? '28' : '15', sa: lit ? 'ee' : '77', lw: hot ? 2.5 : 1.5, bold: lit };
    }
    function hpKey(st) {
        return st.col + st.fa + st.sa + st.lw;
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var S = hpFont(mob);
        var lhS = S.small + 5;
        var r = mob ? 17 : 23;
        var levelGap = mob ? 60 : 80;
        var cap = lines(hpCaption(), w, S.small);
        var capH = cap.length * lhS;
        var y0 = capH + (mob ? 30 : 36) + r;
        var treeBot = y0 + 2 * levelGap + r;
        var gap = mob ? 4 : 6;
        var cellH = mob ? 34 : 42;
        var cellW = Math.min(mob ? 46 : 54, (w - gap * (HP_SLOTS - 1)) / HP_SLOTS);
        var labelCY = treeBot + (mob ? 14 : 18);
        var arrTop = labelCY + lhS / 2 + (mob ? 6 : 8);
        var doneLines = mode === 'sort' ? lines(hpDoneText(), w, S.body) : [];
        var total = arrTop + cellH + (mob ? 46 : 54);
        if (doneLines.length > 0) {
            total = arrTop + cellH + (mob ? 50 : 60) + doneLines.length * (S.body + 5) + 4;
        }
        return {
            S: S, lhS: lhS, r: r, levelGap: levelGap, y0: y0, cap: cap, gap: gap,
            cellH: cellH, cellW: cellW, labelCY: labelCY, arrTop: arrTop,
            doneLines: doneLines, lhD: S.body + 5, total: total
        };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 그리기 헬퍼 ===================== */
    function hpText(str, x, y, fs, col, bold, a, align) {
        if (a <= 0) return;
        ctx.globalAlpha = a;
        tx(str, x, y, fs, col, align || 'center', bold);
        ctx.globalAlpha = 1;
    }
    function hpCircle(x, y, r, st, a) {
        if (a <= 0) return;
        ctx.globalAlpha = a;
        circ(x, y, r, st.col + st.fa, st.col + st.sa, st.lw);
        ctx.globalAlpha = 1;
    }
    function hpRect(x, y, w, h, st, a) {
        if (a <= 0) return;
        ctx.globalAlpha = a;
        rr(x, y, w, h, 4, st.col + st.fa, st.col + st.sa, st.lw);
        ctx.globalAlpha = 1;
    }
    function hpChipCircle(x, y, rad, val, fs, a) {
        if (a <= 0) return;
        ctx.globalAlpha = a;
        circ(x, y, rad, P.yellow + 'ff', 'none');
        tx(String(val), x, y, fs, '#111111', 'center', true);
        ctx.globalAlpha = 1;
    }
    function hpChipRect(x, y, w, h, val, fs, a) {
        if (a <= 0) return;
        ctx.globalAlpha = a;
        rr(x - w / 2, y - h / 2, w, h, 4, P.yellow + 'ff', 'none');
        tx(String(val), x, y, fs, '#111111', 'center', true);
        ctx.globalAlpha = 1;
    }

    /* ===================== 장면 진입점 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var now = step || currentSteps()[0];
        var pv = prev || now;
        var L = layout(w, mob);
        var S = L.S;
        var r = L.r;
        var fv = S.val;
        var cellW = L.cellW;
        var cellH = L.cellH;
        var gap = L.gap;
        var isAn = pv !== now;
        var addK = isAn && now.arr.length > pv.arr.length ? now.arr.length - 1 : -1;
        var sw = isAn && addK < 0 && now.swapA !== null && now.swapB !== null && pv.arr.length === now.arr.length;
        var sA = sw ? now.swapA : -1;
        var sB = sw ? now.swapB : -1;
        var cx0 = x0 + (w - (HP_SLOTS * cellW + (HP_SLOTS - 1) * gap)) / 2;
        var cellY = top + L.arrTop;
        var cy = cellY + cellH / 2;
        function nX(i) { return x0 + HP_X[i] * w; }
        function nY(i) { return top + L.y0 + HP_LV[i] * L.levelGap; }
        function cX(i) { return cx0 + i * (cellW + gap) + cellW / 2; }
        function treeA(i) {
            if (i >= now.arr.length) return 0;
            return i === addK ? ez(seg(t, 0.6, 0.9)) : 1;
        }
        function arrA(i) {
            if (i >= now.arr.length) return 0;
            return i === addK ? ez(seg(t, 0, 0.2)) : 1;
        }
        function valA(i, base) {
            if (sw && (i === sA || i === sB)) return ez(seg(t, 0.92, 1));
            return base;
        }

        var i, j;
        for (i = 0; i < L.cap.length; i++) {
            hpText(L.cap[i], x0 + w / 2, top + i * L.lhS + L.lhS / 2, S.small, P.sub + 'ff', false, 1);
        }

        HP_EDGE.forEach(function (e) {
            var p = e[0], c = e[1];
            if (c >= now.arr.length) return;
            var ax = nX(p), ay = nY(p), bx = nX(c), by = nY(c);
            var dx = bx - ax, dy = by - ay, dl = Math.sqrt(dx * dx + dy * dy);
            var ux = dx / dl, uy = dy / dl;
            var hot = sw && ((p === sA && c === sB) || (p === sB && c === sA));
            var col = hot ? P.orange + 'cc' : (c < now.heapSize ? P.sub + '77' : P.sub + '33');
            ctx.globalAlpha = addK === c ? ez(seg(t, 0.6, 0.9)) : 1;
            ln(ax + ux * r, ay + uy * r, bx - ux * r, by - uy * r, col, hot ? 2.5 : 1.5);
            ctx.globalAlpha = 1;
        });

        for (i = 0; i < HP_SLOTS; i++) {
            var px = nX(i), py = nY(i);
            var na = treeA(i);
            var nowSt = hpStyleOf(now, i);
            var pvSt = isAn && i < pv.arr.length ? hpStyleOf(pv, i) : null;
            var f = pvSt && hpKey(pvSt) !== hpKey(nowSt) ? ez(seg(t, 0, 0.5)) : 1;
            if (na < 1) {
                ctx.globalAlpha = 1 - na;
                circ(px, py, r, 'none', P.sub + '66', 1.2);
                ctx.globalAlpha = 1;
            }
            if (pvSt && f < 1) hpCircle(px, py, r, pvSt, 1 - f);
            if (na > 0) hpCircle(px, py, r, nowSt, na * f);
            if (na > 0) hpText(String(now.arr[i]), px, py, fv, P.text + 'ff', nowSt.bold, valA(i, na));
            hpText('[' + i + ']', px, py - r - (mob ? 9 : 12), mob ? 10 : 12,
                (i === sA || i === sB) ? nowSt.col + 'ff' : P.sub + 'cc', false, 1);
        }

        if (sw) {
            var chipA = 1 - ez(seg(t, 0.92, 1));
            var lane = ez(seg(t, 0, 0.08)) * (1 - ez(seg(t, 0.9, 1)));
            var pmS = ez(seg(t, 0.05, 0.92));
            var tax = nX(sA), tay = nY(sA), tbx = nX(sB), tby = nY(sB);
            var tdx = tbx - tax, tdy = tby - tay, tdl = Math.sqrt(tdx * tdx + tdy * tdy);
            var nxT = -tdy / tdl * r * 0.95 * lane;
            var nyT = tdx / tdl * r * 0.95 * lane;
            hpChipCircle(lerp(tax, tbx, pmS) + nxT, lerp(tay, tby, pmS) + nyT, r * 0.9, pv.arr[sA], fv, chipA);
            hpChipCircle(lerp(tbx, tax, pmS) - nxT, lerp(tby, tay, pmS) - nyT, r * 0.9, pv.arr[sB], fv, chipA);
        }

        var arrLabelX = cx0;
        hpText('배열 표현', arrLabelX, top + L.labelCY, S.small, P.sub + 'ff', true, 1, 'left');
        for (j = 0; j < HP_SLOTS; j++) {
            var cxj = cX(j);
            var ax2 = cxj - cellW / 2;
            var aa = arrA(j);
            var nowA = hpStyleOf(now, j);
            var pvA = isAn && j < pv.arr.length ? hpStyleOf(pv, j) : null;
            var g = pvA && hpKey(pvA) !== hpKey(nowA) ? ez(seg(t, 0, 0.5)) : 1;
            if (aa < 1) {
                ctx.globalAlpha = 1 - aa;
                rr(ax2, cellY, cellW, cellH, 4, 'none', P.sub + '44', 1.2);
                ctx.globalAlpha = 1;
            }
            if (pvA && g < 1) hpRect(ax2, cellY, cellW, cellH, pvA, 1 - g);
            if (aa > 0) hpRect(ax2, cellY, cellW, cellH, nowA, aa * g);
            if (aa > 0) hpText(String(now.arr[j]), cxj, cy, fv, P.text + 'ff', nowA.bold, valA(j, aa));
            hpText('[' + j + ']', cxj, cellY + cellH + (mob ? 11 : 13), mob ? 10 : 12, P.sub + 'cc', false, 1);
            if (j > 0) {
                hpText('p=' + Math.floor((j - 1) / 2), cxj, cellY + cellH + (mob ? 24 : 30), mob ? 10 : 12, P.sub + 'bb', false, 1);
            }
        }

        if (sw) {
            var chipB = 1 - ez(seg(t, 0.92, 1));
            var laneE = ez(seg(t, 0, 0.08)) * (1 - ez(seg(t, 0.9, 1)));
            var pmA = ez(seg(t, 0.05, 0.92));
            var cxA = cX(sA), cxB = cX(sB);
            var chW = cellW - 6;
            var chH = lerp(cellH - 6, cellH * 0.46, laneE);
            var laneY = cellH * 0.25 * laneE;
            hpChipRect(lerp(cxA, cxB, pmA), cy + laneY, chW, chH, pv.arr[sA], fv, chipB);
            hpChipRect(lerp(cxB, cxA, pmA), cy - laneY, chW, chH, pv.arr[sB], fv, chipB);
        }

        if (addK >= 0) {
            var pmK = ez(seg(t, 0.2, 0.6));
            var kA = ez(seg(t, 0.12, 0.25)) * (1 - ez(seg(t, 0.6, 0.7)));
            hpChipCircle(lerp(cX(addK), nX(addK), pmK), lerp(cy, nY(addK), pmK), r * 0.9, now.arr[addK], fv, kA);
        }

        if (mode !== 'insert') {
            var hs = isAn ? lerp(pv.heapSize, now.heapSize, ez(seg(t, 0.1, 0.9))) : now.heapSize;
            var bA = clamp01((now.arr.length - hs) / 0.5);
            if (bA > 0) {
                var bx = cx0 + hs * (cellW + gap) - gap / 2;
                ctx.globalAlpha = bA;
                ln(bx, cellY - 4, bx, cellY + cellH + (mob ? 36 : 44), P.orange + 'cc', 1.5, [4, 3]);
                ctx.globalAlpha = 1;
                var bl = mob ? 46 : 52;
                var lblX = Math.min(Math.max(bx, x0 + bl), x0 + w - bl);
                hpText('heap | sorted', lblX, cellY + cellH + (mob ? 38 : 47), S.small, P.orange + 'ff', true, bA);
            }
        }

        if (mode === 'sort') {
            var da = now.phase === 'done' ? (isAn ? ez(seg(t, 0.4, 1)) : 1) : 0;
            var dTop = cellY + cellH + (mob ? 50 : 60);
            L.doneLines.forEach(function (ds, di) {
                hpText(ds, x0 + w / 2, dTop + di * L.lhD + L.lhD / 2, S.body, P.green + 'ff', true, da);
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
        speedBtns.forEach(function (b) { b.classList.remove('heap-viz__speed-btn--active'); });
        btn.classList.add('heap-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('heap-viz__mode-btn--active', d.key === m); });
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