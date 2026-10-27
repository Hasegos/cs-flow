/**
 * 배열 vs 연결 리스트 시각화 시각화
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
    var root    = el('div', 'al-viz');
    var toolbar = el('div', 'al-viz__toolbar');
    var tbLeft  = el('div', 'al-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'al-viz__title', 'Array vs Linked List'));

    var modeWrap = el('div', 'al-viz__mode');
    var modeDefs = [
        { key: 'array', label: 'Array' },
        { key: 'linked', label: 'Linked List' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'al-viz__mode-btn' + (i === 0 ? ' al-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'al-viz__speed');
    speedWrap.appendChild(el('span', 'al-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'al-viz__speed-btn' + (i === 0 ? ' al-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'al-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'al-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'al-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'al-viz__controls');
    var btnPlay  = el('button', 'al-viz__btn al-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'al-viz__btn', '▶| STEP');
    var btnReset = el('button', 'al-viz__btn', '↺ RESET');
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
    var mode    = 'array';
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

    /* ===================== 시나리오 ===================== */
    var ARRAY_STEPS = [
        {
            log: '초기 상태. 크기 5인 배열 [10, 30, 40, 50, _]이 연속된 메모리에 저장되어 있습니다. 인덱스로 O(1) 임의 접근이 가능합니다.',
            cells: [
                { val: '10', addr: '0x100', state: 'normal' },
                { val: '30', addr: '0x104', state: 'normal' },
                { val: '40', addr: '0x108', state: 'normal' },
                { val: '50', addr: '0x10C', state: 'normal' },
                { val: '_',  addr: '0x110', state: 'empty'  },
            ],
            insertIdx: -1, arrowIdx: -1,
        },
        {
            log: 'Step 1 — 삽입 위치 탐색. 인덱스 2를 인덱스 계산으로 즉시 찾습니다. 배열의 임의 접근 — O(1).',
            cells: [
                { val: '10', addr: '0x100', state: 'normal' },
                { val: '30', addr: '0x104', state: 'normal' },
                { val: '40', addr: '0x108', state: 'target' },
                { val: '50', addr: '0x10C', state: 'normal' },
                { val: '_',  addr: '0x110', state: 'empty'  },
            ],
            insertIdx: 2, arrowIdx: -1,
        },
        {
            log: 'Step 2 — 원소 이동 (인덱스 4 ← 3). 삽입 공간 확보를 위해 뒤에서부터 한 칸씩 오른쪽으로 이동합니다.',
            cells: [
                { val: '10', addr: '0x100', state: 'normal'  },
                { val: '30', addr: '0x104', state: 'normal'  },
                { val: '40', addr: '0x108', state: 'target'  },
                { val: '50', addr: '0x10C', state: 'moving'  },
                { val: '50', addr: '0x110', state: 'shifted' },
            ],
            insertIdx: 2, arrowIdx: 3,
        },
        {
            log: 'Step 3 — 원소 이동 (인덱스 3 ← 2). 왼쪽 원소를 계속 밀어냅니다. 최악의 경우 n개 이동 — O(n).',
            cells: [
                { val: '10', addr: '0x100', state: 'normal'  },
                { val: '30', addr: '0x104', state: 'normal'  },
                { val: '40', addr: '0x108', state: 'moving'  },
                { val: '40', addr: '0x10C', state: 'shifted' },
                { val: '50', addr: '0x110', state: 'shifted' },
            ],
            insertIdx: 2, arrowIdx: 2,
        },
        {
            log: 'Step 4 — 삽입 완료. 인덱스 2에 20을 씁니다. 이동 O(n) + 쓰기 O(1) = 전체 O(n). 이동 횟수: 2회.',
            cells: [
                { val: '10', addr: '0x100', state: 'normal'   },
                { val: '30', addr: '0x104', state: 'normal'   },
                { val: '20', addr: '0x108', state: 'inserted' },
                { val: '40', addr: '0x10C', state: 'shifted'  },
                { val: '50', addr: '0x110', state: 'shifted'  },
            ],
            insertIdx: -1, arrowIdx: -1, done: true,
        },
    ];

    var LINKED_STEPS = [
        {
            log: '초기 상태. 10 → 30 → 40 → 50 → null. 각 노드는 힙 메모리에 분산 저장되며 next 포인터로 연결됩니다.',
            nodes: [
                { val: '10', addr: '0xA00', next: '0xB00', state: 'normal' },
                { val: '30', addr: '0xB00', next: '0xC00', state: 'normal' },
                { val: '40', addr: '0xC00', next: '0xD00', state: 'normal' },
                { val: '50', addr: '0xD00', next: 'null',  state: 'normal' },
            ],
            newNode: null, headArrow: true,
        },
        {
            log: 'Step 1 — 삽입 위치 탐색. head부터 순차 탐색합니다. 10 확인 → 목표 아님. 탐색 비용 — O(n).',
            nodes: [
                { val: '10', addr: '0xA00', next: '0xB00', state: 'visited' },
                { val: '30', addr: '0xB00', next: '0xC00', state: 'normal'  },
                { val: '40', addr: '0xC00', next: '0xD00', state: 'normal'  },
                { val: '50', addr: '0xD00', next: 'null',  state: 'normal'  },
            ],
            newNode: null, headArrow: true,
        },
        {
            log: 'Step 2 — 삽입 위치 발견. 0xB00(값: 30)을 찾았습니다. 이 노드의 next(0xC00)가 새 노드의 next가 됩니다.',
            nodes: [
                { val: '10', addr: '0xA00', next: '0xB00', state: 'visited' },
                { val: '30', addr: '0xB00', next: '0xC00', state: 'target'  },
                { val: '40', addr: '0xC00', next: '0xD00', state: 'normal'  },
                { val: '50', addr: '0xD00', next: 'null',  state: 'normal'  },
            ],
            newNode: null, headArrow: true,
        },
        {
            log: 'Step 3 — 새 노드 생성. 힙에 노드(val:20, addr:0xE00)를 할당하고 next를 0xC00으로 설정합니다.',
            nodes: [
                { val: '10', addr: '0xA00', next: '0xB00', state: 'visited' },
                { val: '30', addr: '0xB00', next: '0xC00', state: 'target'  },
                { val: '40', addr: '0xC00', next: '0xD00', state: 'normal'  },
                { val: '50', addr: '0xD00', next: 'null',  state: 'normal'  },
            ],
            newNode: { val: '20', addr: '0xE00', next: '0xC00', state: 'new' },
            headArrow: true,
        },
        {
            log: 'Step 4 — 포인터 연결 완료. 0xB00.next = 0xE00. 포인터 2번 교환으로 삽입 완료 — O(1). 원소 이동 없음.',
            nodes: [
                { val: '10', addr: '0xA00', next: '0xB00', state: 'normal'   },
                { val: '30', addr: '0xB00', next: '0xE00', state: 'normal'   },
                { val: '20', addr: '0xE00', next: '0xC00', state: 'inserted' },
                { val: '40', addr: '0xC00', next: '0xD00', state: 'normal'   },
                { val: '50', addr: '0xD00', next: 'null',  state: 'normal'   },
            ],
            newNode: null, headArrow: true, done: true,
        },
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() { return mode === 'linked' ? LINKED_STEPS : ARRAY_STEPS; }
    function defaultLog() {
        return mode === 'linked' ? '▶ PLAY를 눌러 연결 리스트 삽입 과정을 확인하세요.' : '▶ PLAY를 눌러 배열 삽입 과정을 확인하세요.';
    }
    function ez(q) { var v = clamp01(q); return v * v * (3 - 2 * v); }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var fl = mob ? 11 : 13;
        var fa = mob ? 11 : 12;
        var capH = fl + 6;
        var nh = mob ? 34 : 44;
        var aCellH = mob ? 58 : 74;
        var aCellTop = capH + (mob ? 40 : 46);
        var aIdxCY = aCellTop + aCellH + 6 + fl / 2;
        var aMarkCY = aIdxCY + fl + 6;
        var aBottom = aMarkCY + fl / 2 + 2;
        var lCurCY = capH + fl / 2 + 8;
        var lAddrCY = lCurCY + fl / 2 + fa / 2 + 6;
        var lNodeTop = lAddrCY + fa / 2 + 5;
        var lNodeBot = lNodeTop + nh;
        var lHeapTop = lNodeBot + 44;
        var lBottom = lHeapTop + nh + 4 + fa;
        var tr = mob ? 22 : 30;
        var tblTop = Math.max(aBottom, lBottom) + 12;
        var tblH = tr * 4 + 4;
        var footTop = tblTop + tblH + 6;
        var footH = 2 * (fl + 5);
        return {
            fl: fl, fa: fa, nh: nh, capH: capH, aCellH: aCellH, aCellTop: aCellTop,
            aIdxCY: aIdxCY, aMarkCY: aMarkCY,
            lCurCY: lCurCY, lNodeCY: lNodeTop + nh / 2, lHeadCY: lNodeBot + 26,
            lHeapCY: lHeapTop + nh / 2,
            tblTop: tblTop, tblH: tblH, tr: tr, footTop: footTop,
            total: footTop + footH + 2
        };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 공통 스타일과 데이터 ===================== */
    function dsalSty(st) {
        if (st === 'target') return { f: P.yellow + '44', s: P.yellow + 'ff', t: P.yellow + 'ff' };
        if (st === 'moving') return { f: P.orange + '44', s: P.orange + 'ff', t: P.orange + 'ff' };
        if (st === 'shifted') return { f: P.teal + '33', s: P.teal + 'ff', t: P.teal + 'ff' };
        if (st === 'inserted' || st === 'new') return { f: P.green + '44', s: P.green + 'ff', t: P.green + 'ff' };
        if (st === 'visited') return { f: P.purple + '33', s: P.purple + 'ff', t: P.purple + 'ff' };
        if (st === 'empty') return { f: 'none', s: P.sub + '99', t: P.sub + 'ff' };
        return { f: P.surf2 + 'ff', s: P.sub + '88', t: P.text + 'ff' };
    }
    function dsalCursor(st) {
        var found = -1;
        var lab = '';
        var i;
        for (i = 0; i < st.nodes.length; i++) {
            if (st.nodes[i].state === 'visited') { found = i; lab = '확인'; }
        }
        for (i = 0; i < st.nodes.length; i++) {
            if (st.nodes[i].state === 'target') { found = i; lab = '발견'; }
        }
        return found < 0 ? null : { i: found, lab: lab };
    }
    function dsalRecs(st) {
        var out = [];
        st.nodes.forEach(function (nd, i) {
            out.push({ addr: nd.addr, val: nd.val, next: nd.next, state: nd.state, col: i, row: 0 });
        });
        if (st.newNode) {
            out.push({ addr: st.newNode.addr, val: st.newNode.val, next: st.newNode.next, state: st.newNode.state, col: 2, row: 1 });
        }
        return out;
    }

    /* ===================== 배열 장면 ===================== */
    function dsalArrDraw(x0, top, w, mob, L, s, p, fresh, e) {
        var n = s.cells.length;
        var pitch = Math.min(w / n, 120);
        var sx = x0 + (w - pitch * n) / 2;
        var bw = pitch - (mob ? 6 : 12);
        var cellH = L.aCellH;
        var cellTop = top + L.aCellTop;
        var cyc = cellTop + cellH / 2;
        var chH = mob ? 24 : 30;
        var chW = bw * 0.8;
        var apexY = cellTop - 8 - chH / 2;
        var fv = mob ? 16 : 22;
        var fl = L.fl;
        var fa = L.fa;
        var m = s.arrowIdx;
        var shift = m >= 0;
        var ins = -1;
        var jump = -1;
        var i, k;
        for (i = 0; i < n; i++) {
            if (s.cells[i].state === 'inserted') ins = i;
            if (!shift && s.cells[i].state === 'target') jump = i;
        }
        function cxOf(j) { return sx + (j + 0.5) * pitch; }
        function drawCell(j, val, st, sc, alpha) {
            var c = dsalSty(st);
            var bh = cellH * sc;
            var bwS = bw * sc;
            var bx = cxOf(j) - bwS / 2;
            var by = cyc - bh / 2;
            ctx.globalAlpha = alpha;
            if (st === 'empty') {
                ctx.setLineDash([4, 3]);
                rr(bx, by, bwS, bh, 6, 'none', c.s, 1.4);
                ctx.setLineDash([]);
            } else {
                rr(bx, by, bwS, bh, 6, c.f, c.s, 2);
            }
            tx(val, cxOf(j), by + bh * 0.38, fv * sc, c.t, 'center', true);
            tx(s.cells[j].addr, cxOf(j), by + bh * 0.76, fa, P.sub + 'ff', 'center', false);
            ctx.globalAlpha = 1;
        }
        for (i = 0; i < n; i++) {
            var cc = s.cells[i];
            var val = cc.val;
            var st = cc.state;
            var sc = 1;
            if (fresh && shift && i === m + 1 && e < 0.75) { val = p.cells[i].val; st = p.cells[i].state; }
            if (fresh && i === ins) {
                if (e < 0.45) { val = p.cells[i].val; st = p.cells[i].state; }
                else { sc = 0.8 + 0.2 * ez(seg(e, 0.45, 0.9)); }
            }
            drawCell(i, val, st, sc, 1);
        }
        if (fresh && shift && e > 0 && e < 0.9) {
            var xs = cxOf(m);
            var xd = cxOf(m + 1);
            var cq = ez(seg(e, 0, 0.75));
            ctx.globalAlpha = 0.6 * ez(seg(e, 0, 0.1));
            ctx.beginPath();
            for (k = 0; k <= 16; k++) {
                var pq = k / 16;
                var pxk = lerp(xs, xd, pq);
                var pyk = lerp(cyc, apexY, Math.sin(Math.PI * pq));
                if (k === 0) ctx.moveTo(pxk, pyk); else ctx.lineTo(pxk, pyk);
            }
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = P.orange + 'ff';
            ctx.lineWidth = 1.4;
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = ez(seg(e, 0, 0.1)) * (1 - ez(seg(e, 0.75, 0.9)));
            var chx = lerp(xs, xd, cq);
            var chy = lerp(cyc, apexY, Math.sin(Math.PI * cq));
            rr(chx - chW / 2, chy - chH / 2, chW, chH, 5, P.orange + 'ff', 'none');
            tx(s.cells[m].val, chx, chy, fv - 2, '#111111', 'center', true);
            ctx.globalAlpha = 1;
        }
        if (fresh && ins >= 0 && e < 0.6) {
            var iy = lerp(apexY, cyc, ez(seg(e, 0, 0.45)));
            ctx.globalAlpha = ez(seg(e, 0, 0.12)) * (1 - ez(seg(e, 0.45, 0.6)));
            rr(cxOf(ins) - chW / 2, iy - chH / 2, chW, chH, 5, P.green + 'ff', 'none');
            tx(s.cells[ins].val, cxOf(ins), iy, fv - 2, '#111111', 'center', true);
            ctx.globalAlpha = 1;
        }
        if (jump >= 0) {
            var jx0 = cxOf(0);
            var jx1 = cxOf(jump);
            var jy0 = cellTop - 3;
            var jyA = cellTop - 14;
            ctx.globalAlpha = 0.9;
            ctx.beginPath();
            for (k = 0; k <= 20; k++) {
                var jq = k / 20;
                var jxk = lerp(jx0, jx1, jq);
                var jyk = lerp(jy0, jyA, Math.sin(Math.PI * jq));
                if (k === 0) ctx.moveTo(jxk, jyk); else ctx.lineTo(jxk, jyk);
            }
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = P.yellow + 'ff';
            ctx.lineWidth = 1.6;
            ctx.stroke();
            ctx.setLineDash([]);
            if (fresh) {
                var bq = ez(seg(e, 0, 0.85));
                ctx.globalAlpha = 1 - ez(seg(e, 0.9, 1));
                circ(lerp(jx0, jx1, bq), lerp(jy0, jyA, Math.sin(Math.PI * bq)), 5, P.yellow + 'ff', 'none');
            }
            ctx.globalAlpha = 1;
            tx('인덱스 ' + jump + ' 계산으로 바로 점프', x0 + w / 2, top + L.capH + 6, fl, P.yellow + 'ff', 'center', true);
        }
        for (i = 0; i < n; i++) {
            tx('[' + i + ']', cxOf(i), top + L.aIdxCY, fl, P.sub + 'ff', 'center', false);
        }
        if (s.insertIdx >= 0) {
            tx(mob ? '▲ 삽입' : '▲ 삽입 위치', cxOf(s.insertIdx), top + L.aMarkCY, fl, P.yellow + 'ff', 'center', true);
        }
        if (shift) {
            tx('이동', cxOf(m + 1), top + L.aMarkCY, fl, P.orange + 'ff', 'center', true);
        }
        ctx.globalAlpha = 1;
    }

    /* ===================== 연결 리스트 장면 ===================== */
    function dsalLnkDraw(x0, top, w, mob, L, s, p, fresh, e) {
        var fl = L.fl;
        var fa = L.fa;
        var nh = L.nh;
        var fv = mob ? 13 : 18;
        var pitch = Math.min(w / 6, 130);
        var sx = x0 + (w - pitch * 6) / 2;
        var bw = Math.min(pitch - (mob ? 15 : 26), 84);
        var nullHalf = mob ? 14 : 20;
        var cur = dsalRecs(s);
        var prv = dsalRecs(p);
        var cm = {};
        var pm = {};
        var q = ez(seg(e, 0, 0.7));
        cur.forEach(function (r) { cm[r.addr] = r; });
        prv.forEach(function (r) { pm[r.addr] = r; });
        function pxOf(col) { return sx + (col + 0.5) * pitch; }
        function pyOf(row) { return top + (row ? L.lHeapCY : L.lNodeCY); }
        function dsalPlace(r) {
            var pr = fresh ? pm[r.addr] : null;
            var pt = { x: pxOf(r.col), y: pyOf(r.row), a: 1 };
            if (pr) {
                pt.x = lerp(pxOf(pr.col), pt.x, q);
                pt.y = lerp(pyOf(pr.row), pt.y, q);
            } else if (fresh) {
                pt.a = ez(seg(e, 0, 0.5));
            }
            return pt;
        }
        function dsalLink(fp, fr, tp, tr, alpha, col, lw) {
            if (!tp || alpha <= 0) return;
            var x1, y1, x2, y2;
            if (fr === tr) {
                x1 = fp.x + bw / 2 + 1; y1 = fp.y;
                x2 = tp.x - bw / 2 - 1; y2 = tp.y;
            } else if (tp.y > fp.y) {
                x1 = fp.x; y1 = fp.y + nh / 2 + 2;
                x2 = tp.x; y2 = tp.y - nh / 2 - 3;
            } else {
                x1 = fp.x; y1 = fp.y - nh / 2 - 2;
                x2 = tp.x; y2 = tp.y + nh / 2 + 3;
            }
            ctx.globalAlpha = alpha;
            arrow(x1, y1, x2, y2, col, lw);
            ctx.globalAlpha = 1;
        }
        var nN = s.nodes.length;
        var pN = p.nodes.length;
        var nullX = fresh ? lerp(pxOf(pN), pxOf(nN), q) : pxOf(nN);
        var nullY = pyOf(0);
        var nullTP = { x: nullX - nullHalf + bw / 2 + 1, y: nullY };

        cur.forEach(function (r) {
            var pt = dsalPlace(r);
            var pr = fresh ? pm[r.addr] : null;
            var k2 = ez(seg(e, 0.35, 1));
            var tgtNow = r.next === 'null' ? null : cm[r.next];
            var tpNow = r.next === 'null' ? nullTP : (tgtNow ? dsalPlace(tgtNow) : null);
            var rowNow = tgtNow ? tgtNow.row : 0;
            if (pr && pr.next !== r.next) {
                var oldTgt = pr.next === 'null' ? null : cm[pr.next];
                var oldTP = pr.next === 'null' ? nullTP : (oldTgt ? dsalPlace(oldTgt) : null);
                var oldRow = oldTgt ? oldTgt.row : 0;
                dsalLink(pt, r.row, oldTP, oldRow, pt.a * (1 - k2), P.sub + 'ff', 1.8);
                dsalLink(pt, r.row, tpNow, rowNow, pt.a * k2, P.green + 'ff', 2.4);
            } else {
                dsalLink(pt, r.row, tpNow, rowNow, pt.a, P.sub + 'ff', 1.8);
            }
        });

        cur.forEach(function (r) {
            var pt = dsalPlace(r);
            var c = dsalSty(r.state);
            ctx.globalAlpha = pt.a;
            rr(pt.x - bw / 2, pt.y - nh / 2, bw, nh, 6, c.f, c.s, 2);
            tx(r.val, pt.x, pt.y, fv, c.t, 'center', true);
            tx(r.addr, pt.x, r.row ? pt.y + nh / 2 + 4 + fa / 2 : pt.y - nh / 2 - 5 - fa / 2, fa, P.sub + 'ff', 'center', false);
            if (r.row) tx('NEW', pt.x + bw / 2 + 5, pt.y, fl, P.green + 'ff', 'left', true);
            ctx.globalAlpha = 1;
        });

        var hx = pxOf(0);
        tx('HEAD', hx, top + L.lHeadCY, fl, P.purple + 'ff', 'center', true);
        arrow(hx, top + L.lHeadCY - fl / 2 - 3, hx, top + L.lNodeCY + nh / 2 + 2, P.purple + 'ff', 2);
        tx('힙 메모리', hx, top + L.lHeapCY, fl, P.sub + 'ff', 'center', false);
        tx('null', nullX, nullY, fl, P.sub + 'ff', 'center', false);

        var cc = dsalCursor(s);
        var pc = fresh ? dsalCursor(p) : null;
        var cz = null;
        if (cc) {
            cz = { x: pxOf(cc.i), lab: cc.lab, a: 1 };
            if (pc) cz.x = lerp(pxOf(pc.i), cz.x, ez(seg(e, 0, 0.6)));
            else if (fresh) cz.a = ez(seg(e, 0, 0.5));
        } else if (pc) {
            cz = { x: pxOf(pc.i), lab: pc.lab, a: 1 - ez(seg(e, 0, 0.5)) };
        }
        if (cz) {
            ctx.globalAlpha = cz.a;
            tx(cz.lab, cz.x, top + L.lCurCY, fl, (cz.lab === '발견' ? P.yellow : P.purple) + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        }
    }

    /* ===================== 복잡도 표 ===================== */
    function dsalTable(x0, top, w, mob, L, activeMode) {
        var fl = L.fl;
        var tr = L.tr;
        var panW = mob ? w : Math.min(w, 480);
        var panX = x0 + (w - panW) / 2;
        var colW = panW / 3;
        var py = top + L.tblTop;
        var rows = [
            ['연산', 'Array', 'Linked List'],
            ['임의 접근', 'O(1) ✓', 'O(n)'],
            ['맨 앞 삽입', 'O(n)', 'O(1) ✓'],
            ['중간 삽입', 'O(n)', 'O(1) *']
        ];
        var hi = activeMode === 'linked' ? 2 : 1;
        var r, c;
        rr(panX + hi * colW, py, colW, L.tblH, 0, P.green + '22', 'none', 0);
        rr(panX, py, panW, L.tblH, 6, 'none', P.border + '99', 1);
        for (r = 0; r < rows.length; r++) {
            var cy = py + 2 + r * tr + tr / 2;
            for (c = 0; c < 3; c++) {
                var txt = rows[r][c];
                var isHead = r === 0;
                var isActive = c === hi;
                var hasCheck = txt.indexOf('✓') >= 0;
                var hasAster = txt.indexOf('*') >= 0;
                var color;
                if (isHead) color = P.text + 'ff';
                else if (hasCheck) color = P.green + (isActive ? 'ff' : 'aa');
                else color = (isActive ? P.text : P.sub) + 'ff';
                tx(txt, panX + colW * (c + 0.5), cy, fl, color, 'center', isHead || hasCheck || hasAster);
            }
            if (r < rows.length - 1) {
                ln(panX + 6, py + (r + 1) * tr + 2, panX + panW - 6, py + (r + 1) * tr + 2, P.border + '99', 1);
            }
        }
        ln(panX + colW, py + 4, panX + colW, py + L.tblH - 4, P.border + '99', 1);
        ln(panX + 2 * colW, py + 4, panX + 2 * colW, py + L.tblH - 4, P.border + '99', 1);
        lines('* 위치를 이미 알고 있을 때 기준', w, fl).forEach(function (row, idx) {
            tx(row, x0 + w / 2, top + L.footTop + idx * (fl + 5) + (fl + 5) / 2, fl, P.sub + 'ff', 'center', false);
        });
    }

    /* ===================== 메인 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var steps = currentSteps();
        var s = step || steps[0];
        var p = prev || s;
        var fresh = s !== p;
        var e = fresh ? clamp01(t) : 1;
        var L = layout(w, mob);
        tx(mode === 'linked' ? '노드는 흩어진 주소에 저장' : '연속된 메모리 칸', x0 + w / 2, top + L.capH / 2, L.fl, P.sub + 'ff', 'center', false);
        if (mode === 'linked') dsalLnkDraw(x0, top, w, mob, L, s, p, fresh, e);
        else dsalArrDraw(x0, top, w, mob, L, s, p, fresh, e);
        dsalTable(x0, top, w, mob, L, mode);
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
        speedBtns.forEach(function (b) { b.classList.remove('al-viz__speed-btn--active'); });
        btn.classList.add('al-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('al-viz__mode-btn--active', d.key === m); });
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