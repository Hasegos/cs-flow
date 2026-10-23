/**
 * 라우팅 — RIP (홉 수) vs OSPF (링크 비용) 시각화
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
    var root    = el('div', 'routing-viz');
    var toolbar = el('div', 'routing-viz__toolbar');
    var tbLeft  = el('div', 'routing-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'routing-viz__title', 'Routing Protocol'));

    var modeWrap = el('div', 'routing-viz__mode');
    var modeDefs = [
        { key: 'rip', label: 'RIP (홉 수)' },
        { key: 'ospf', label: 'OSPF (링크 비용)' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'routing-viz__mode-btn' + (i === 0 ? ' routing-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    if (modeDefs.length) tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'routing-viz__speed');
    speedWrap.appendChild(el('span', 'routing-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'routing-viz__speed-btn' + (i === 0 ? ' routing-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'routing-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'routing-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'routing-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'routing-viz__controls');
    var btnPlay  = el('button', 'routing-viz__btn routing-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'routing-viz__btn', '▶| STEP');
    var btnReset = el('button', 'routing-viz__btn', '↺ RESET');
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
    var mode    = 'rip';
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
    var tipHits = [];
    var mousePos = { x: -1, y: -1 };
    var hoveredKey = null;
    function tipHit(x, y, w, h, key) { tipHits.push({ x: x, y: y, w: w, h: h, key: key }); }
    function tipBadge(cx, cy, key) {
        var on = hoveredKey === key;
        circ(cx, cy, 7, on ? P.purple + '44' : 'none', P.purple + (on ? 'ff' : '99'), 1.2);
        tx('?', cx, cy, 9.5, on ? P.text + 'ff' : P.sub + 'ff', 'center', true);
        tipHit(cx - 10, cy - 10, 20, 20, key);
    }
    function drawTip(mx, my, text) {
        var parts = text.split(String.fromCharCode(10));
        var title = parts[0], desc = parts[1] || '';
        var W = GW(), H = GH();
        var pad = 14;
        var maxIn = W - 16 - pad * 2;
        ctx.font = '700 14px "JetBrains Mono",monospace';
        var titleW = Math.min(maxIn, ctx.measureText(title).width);
        ctx.font = '400 13px "JetBrains Mono",monospace';
        var dl = desc ? window.CsFlow.wrapText(ctx, desc, maxIn) : [];
        var descW = 0;
        dl.forEach(function (l) { descW = Math.max(descW, ctx.measureText(l).width); });
        var tw = Math.min(W - 16, Math.max(titleW, descW) + pad * 2);
        var th = desc ? 42 + dl.length * 18 : 36;
        var bx = mx + 14, by = my - th - 8;
        if (bx + tw > W - 8) bx = mx - tw - 14;
        if (bx < 8) bx = 8;
        if (by < 8) by = my + 14;
        if (by + th > H - 8) by = H - th - 8;
        rr(bx, by, tw, th, 6, P.surf2, P.purple + 'cc', 2);
        tx(title, bx + pad, by + (desc ? 18 : th / 2), 14, P.text + 'ff', 'left', true);
        dl.forEach(function (l, i) { tx(l, bx + pad, by + 42 + i * 18, 13, P.sub + 'ff', 'left', false); });
    }
    function colorOf(key) { return P[key] || P.muted; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
    function seg(t, a, b) { return clamp01((t - a) / (b - a)); }
    function lines(str, maxW, fs) {
        ctx.font = '700 ' + fs + 'px "JetBrains Mono",monospace';
        return window.CsFlow.wrapText(ctx, str, maxW);
    }

    /* ===================== 그래프 정의 ===================== */
    var EDGES = [
        { a:0, b:1, rip:1, ospf:1  },
        { a:1, b:2, rip:1, ospf:1  },
        { a:2, b:5, rip:1, ospf:1  },
        { a:0, b:3, rip:1, ospf:5  },
        { a:3, b:4, rip:1, ospf:1  },
        { a:4, b:5, rip:1, ospf:1  },
        { a:1, b:4, rip:1, ospf:2  },
    ];

    var NODE_LABELS = ['A','B','C','D','E','F'];

    /* ===================== 시나리오 ===================== */
    var SCENARIOS = {
        rip: [
            {
                log: 'RIP는 모든 링크를 "홉 수=1"로 동일하게 봅니다. 링크 속도나 대역폭은 무시합니다. 출발지 A에서 목적지 F까지 3가지 경로가 모두 3홉으로 동일합니다.',
                path:[], rejected:[], considering:[], activeNode:0, badge:{},
                pktPath:[], pktEdgeIdx:-1,
            },
            {
                log: 'Step 1 — A에서 출발. 인접 라우터 탐색: B(1홉), D(1홉). RIP는 홉 수가 같으면 먼저 발견된 경로를 선택합니다. B 방향을 먼저 탐색합니다.',
                path:[], rejected:[], considering:[0,3], activeNode:0,
                badge:{1:'1홉', 3:'1홉'},
                pktPath:[], pktEdgeIdx:-1,
            },
            {
                log: 'Step 2 — B 도착(1홉). B의 인접: C(2홉), E(2홉). 계속 탐색합니다.',
                path:[0], rejected:[], considering:[1,6], activeNode:1,
                badge:{1:'1홉', 2:'2홉', 4:'2홉'},
                pktPath:[], pktEdgeIdx:-1,
            },
            {
                log: 'Step 3 — C 도착(2홉). C → F 발견! 총 3홉. 같은 홉 수의 D 경유 경로(A-D-E-F, 3홉)보다 먼저 발견됐으므로 A→B→C→F를 선택합니다.',
                path:[0,1], rejected:[3,4,5], considering:[2], activeNode:2,
                badge:{1:'1홉', 2:'2홉', 5:'3홉'},
                pktPath:[], pktEdgeIdx:-1,
            },
            {
                log: 'Step 4 — 경로 확정: A→B→C→F (3홉). 이제 패킷을 전송합니다. A→B로 이동합니다.',
                path:[0,1,2], rejected:[3,4,5,6], considering:[], activeNode:0,
                badge:{},
                pktPath:[0,1,2], pktEdgeIdx:0,
            },
            {
                log: 'Step 5 — B→C로 이동합니다.',
                path:[0,1,2], rejected:[3,4,5,6], considering:[], activeNode:1,
                badge:{},
                pktPath:[0,1,2], pktEdgeIdx:1,
            },
            {
                log: 'Step 6 — C→F 도착 ✓  RIP 결과: A→B→C→F (3홉). 문제점: A-D 링크가 느린 링크(비용 5)여도 RIP는 홉 수만 보기 때문에 이를 고려하지 않습니다. OSPF 탭에서 차이를 확인하세요.',
                path:[0,1,2], rejected:[3,4,5,6], considering:[], activeNode:5,
                badge:{},
                pktPath:[0,1,2], pktEdgeIdx:2,
                done: true,
            },
        ],
        ospf: [
            {
                log: 'OSPF는 링크 비용(대역폭의 역수)을 메트릭으로 사용합니다. A-D 링크는 느린 링크라 비용이 5입니다. 다익스트라 알고리즘으로 비용 합계가 가장 낮은 경로를 선택합니다.',
                path:[], rejected:[], considering:[], activeNode:0, badge:{},
                pktPath:[], pktEdgeIdx:-1,
            },
            {
                log: 'Step 1 — A(비용 0)에서 시작. 인접 탐색: B=비용1, D=비용5. B가 훨씬 저렴! B를 먼저 확정합니다.',
                path:[], rejected:[], considering:[0,3], activeNode:0,
                badge:{1:'비용1', 3:'비용5'},
                pktPath:[], pktEdgeIdx:-1,
            },
            {
                log: 'Step 2 — B(비용1) 확정. B의 인접: C=1+1=2, E=1+2=3. D는 비용5로 아직 높습니다. C(비용2)가 가장 저렴 → C 확정.',
                path:[0], rejected:[], considering:[1,6], activeNode:1,
                badge:{1:'비용1', 2:'비용2', 4:'비용3', 3:'비용5'},
                pktPath:[], pktEdgeIdx:-1,
            },
            {
                log: 'Step 3 — C(비용2) 확정. C→F = 2+1 = 비용3. E(비용3) 확정. E→F = 3+1 = 4. F 최단비용 = 3 (C를 통해). D는 비용5로 탈락.',
                path:[0,1], rejected:[3,4], considering:[2,5], activeNode:2,
                badge:{1:'비용1', 2:'비용2', 4:'비용3', 5:'비용3', 3:'비용5(탈락)'},
                pktPath:[], pktEdgeIdx:-1,
            },
            {
                log: 'Step 4 — 경로 확정: A→B→C→F (비용 합계: 1+1+1=3). D 경유 경로(비용 5+1+1=7)는 탈락. 이제 패킷을 전송합니다.',
                path:[0,1,2], rejected:[3,4,5,6], considering:[], activeNode:0,
                badge:{},
                pktPath:[0,1,2], pktEdgeIdx:0,
            },
            {
                log: 'Step 5 — B→C로 이동합니다.',
                path:[0,1,2], rejected:[3,4,5,6], considering:[], activeNode:1,
                badge:{},
                pktPath:[0,1,2], pktEdgeIdx:1,
            },
            {
                log: 'Step 6 — C→F 도착 ✓  OSPF 결과: A→B→C→F (비용 3). RIP와 같은 경로지만, A-D 링크(비용5)를 고려해 합리적으로 선택했습니다. 느린 링크를 자동으로 회피합니다.',
                path:[0,1,2], rejected:[3,4,5,6], considering:[], activeNode:5,
                badge:{},
                pktPath:[0,1,2], pktEdgeIdx:2,
                done: true,
            },
        ],
    };

    /* ===================== 상태 ===================== */
    function currentSteps() {
        return SCENARIOS[mode] || SCENARIOS.rip;
    }
    function defaultLog() {
        return '▶ PLAY를 눌러 라우팅 경로 선택 과정을 확인하세요.';
    }
    function ez(q) {
        q = clamp01(q);
        return q * q * (3 - 2 * q);
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var nHH = mob ? 16 : 22;
        var badgeH = mob ? 20 : 22;
        var padX = mob ? 26 : 64;
        var rowGap = mob ? 96 : 130;
        var y0 = badgeH + nHH + 12;
        var y1 = y0 + rowGap;
        var stripY = y1 + nHH + badgeH + 17;
        var stripH = mob ? 26 : 30;
        return {
            mob: mob, nHW: mob ? 20 : 30, nHH: nHH, badgeH: badgeH,
            padX: padX, colStep: (w - padX * 2) / 2, rowGap: rowGap,
            y0: y0, y1: y1, stripY: stripY, stripH: stripH,
            fsN: mob ? 13 : 15, fsE: mob ? 11 : 12, fsB: 11, fsS: 11,
            total: stripY + stripH + 8
        };
    }
    function sceneH(w, mob) {
        return layout(w, mob).total;
    }
    function rtPos(L, x0, top, i) {
        return { x: x0 + L.padX + (i % 3) * L.colStep, y: top + (i < 3 ? L.y0 : L.y1) };
    }

    /* ===================== 단계 해석 ===================== */
    function rtKind(st, i) {
        if (st.path.indexOf(i) !== -1) return 'path';
        if (st.considering.indexOf(i) !== -1) return 'cons';
        if (st.rejected.indexOf(i) !== -1) return 'rej';
        return 'idle';
    }
    function rtStyle(kind, i) {
        if (kind === 'path') return { line: P.green + 'ff', lw: 3, dash: [], txt: P.green + 'ff', pill: P.green + 'cc' };
        if (kind === 'cons') return { line: P.yellow + 'ff', lw: 2.5, dash: [], txt: P.yellow + 'ff', pill: P.yellow + 'cc' };
        if (kind === 'rej') return { line: P.muted + '77', lw: 1.2, dash: [4, 4], txt: P.sub + 'ff', pill: P.border + '66' };
        if (mode === 'ospf' && EDGES[i].ospf >= 3) return { line: P.orange + 'aa', lw: 2, dash: [], txt: P.orange + 'ff', pill: P.orange + 'cc' };
        return { line: P.border + 'cc', lw: 1.5, dash: [], txt: P.text + 'bb', pill: P.border + 'aa' };
    }
    function rtLabel(i) {
        return mode === 'rip' ? '홉 1' : '비용 ' + EDGES[i].ospf;
    }
    function rtChain(list) {
        var seq = [0];
        var used = [];
        var cur = 0;
        var moved = true;
        while (moved) {
            moved = false;
            for (var q = 0; q < list.length; q++) {
                var ed = EDGES[list[q]];
                if (used.indexOf(list[q]) !== -1) continue;
                if (ed.a !== cur && ed.b !== cur) continue;
                cur = ed.a === cur ? ed.b : ed.a;
                seq.push(cur);
                used.push(list[q]);
                moved = true;
                break;
            }
        }
        return seq;
    }
    function rtNodes(list) {
        var out = [];
        list.forEach(function (ei) {
            if (out.indexOf(EDGES[ei].a) === -1) out.push(EDGES[ei].a);
            if (out.indexOf(EDGES[ei].b) === -1) out.push(EDGES[ei].b);
        });
        return out;
    }
    function rtSum(list) {
        var sum = 0;
        list.forEach(function (ei) { sum += EDGES[ei].ospf; });
        return sum;
    }

    /* ===================== 그리기 ===================== */
    function rtGrow(L, x0, top, s, ed) {
        var fromN = ed.b === s.activeNode ? ed.b : ed.a;
        var toN = fromN === ed.a ? ed.b : ed.a;
        return [rtPos(L, x0, top, fromN), rtPos(L, x0, top, toN)];
    }
    function rtDrawEdge(L, x0, top, s, i, kind, g, alpha) {
        var pts = rtGrow(L, x0, top, s, EDGES[i]);
        var st = rtStyle(kind, i);
        ctx.globalAlpha = alpha;
        ln(pts[0].x, pts[0].y,
           pts[0].x + (pts[1].x - pts[0].x) * g, pts[0].y + (pts[1].y - pts[0].y) * g,
           st.line, st.lw, st.dash);
        ctx.globalAlpha = 1;
    }
    function rtPill(L, cx, cy, label, st, alpha) {
        if (alpha <= 0) return;
        ctx.font = '700 ' + L.fsE + 'px "JetBrains Mono",monospace';
        var pw = ctx.measureText(label).width + (L.mob ? 10 : 16);
        var ph = L.fsE + (L.mob ? 8 : 10);
        ctx.globalAlpha = alpha;
        rr(cx - pw / 2, cy - ph / 2, pw, ph, 4, P.bg, st.pill, 1.5);
        tx(label, cx, cy, L.fsE, st.txt, 'center', true);
        ctx.globalAlpha = 1;
    }
    function rtBadge(L, pt, ni, txt, a, rise, x0, w) {
        if (a <= 0) return;
        var col = txt.indexOf('탈락') !== -1 ? P.orange : P.yellow;
        ctx.font = '700 ' + L.fsB + 'px "JetBrains Mono",monospace';
        var bw = ctx.measureText(txt).width + (L.mob ? 12 : 16);
        var bh = L.badgeH;
        var by = ni < 3 ? pt.y - L.nHH - 5 - bh + rise : pt.y + L.nHH + 5 - rise;
        var bx = Math.min(x0 + w - 4 - bw, Math.max(x0 + 4, pt.x - bw / 2));
        ctx.globalAlpha = a;
        rr(bx, by, bw, bh, 4, P.bg, col + 'cc', 1.5);
        tx(txt, bx + bw / 2, by + bh / 2, L.fsB, col + 'ff', 'center', true);
        ctx.globalAlpha = 1;
    }

    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var steps = currentSteps();
        var s = step || steps[0];
        var p = prev || s;
        var fresh = p !== s;
        var e = fresh ? clamp01(t) : 1;

        EDGES.forEach(function (ed, i) {
            var kb = rtKind(s, i);
            var ka = rtKind(p, i);
            if (!fresh || ka === kb) {
                rtDrawEdge(L, x0, top, s, i, kb, 1, 1);
            } else {
                rtDrawEdge(L, x0, top, s, i, ka, 1, 1 - ez(seg(e, 0.2, 0.8)));
                rtDrawEdge(L, x0, top, s, i, kb, kb === 'rej' ? 1 : ez(seg(e, 0, 0.6)), kb === 'rej' ? ez(seg(e, 0.3, 0.9)) : 1);
            }
        });

        var pk = s.pktPath || [];
        var k = s.pktEdgeIdx, pkt = null;
        if (k >= 0 && k < pk.length) {
            var seq = rtChain(pk);
            var moving = fresh && p.pktEdgeIdx !== k;
            var pr = moving ? ez(e) : 1;
            var a0 = rtPos(L, x0, top, seq[k]);
            var a1 = rtPos(L, x0, top, seq[k + 1]);
            var rad = L.mob ? 13 : 16;
            var off = (a0.y === a1.y ? L.nHW : L.nHH) + rad;
            var dx = a1.x > a0.x ? 1 : (a1.x < a0.x ? -1 : 0);
            var dy = a1.y > a0.y ? 1 : (a1.y < a0.y ? -1 : 0);
            var px = lerp(a0.x + dx * off, a1.x - dx * off, pr);
            var py = lerp(a0.y + dy * off, a1.y - dy * off, pr);
            pkt = { x: px, y: py, r: rad };
        }

        EDGES.forEach(function (ed, i) {
            var kb = rtKind(s, i);
            var ka = rtKind(p, i);
            var A = rtPos(L, x0, top, ed.a);
            var B = rtPos(L, x0, top, ed.b);
            var mx = (A.x + B.x) / 2;
            var my = (A.y + B.y) / 2;
            var label = rtLabel(i);
            var pa0 = pkt && Math.hypot(mx - pkt.x, my - pkt.y) < pkt.r + 24 ? 0.2 : 1;
            if (!fresh || ka === kb) {
                rtPill(L, mx, my, label, rtStyle(kb, i), pa0);
            } else {
                var pa = ez(seg(e, 0.4, 0.9));
                rtPill(L, mx, my, label, rtStyle(ka, i), (1 - pa) * pa0);
                rtPill(L, mx, my, label, rtStyle(kb, i), pa * pa0);
            }
            if (mode === 'rip' && ed.ospf > 1) {
                tx('실제 비용 ' + ed.ospf, mx, my + (L.mob ? 18 : 20), L.fsS, P.sub + 'ff', 'center', false);
            }
        });

        if (pkt) {
            circ(pkt.x, pkt.y, pkt.r, P.green + 'ff', P.green + 'ff', 2.5);
            tx('PKT', pkt.x, pkt.y, L.fsE, '#111111', 'center', true);
        }

        var pathNow = rtNodes(s.path);
        var pathPrev = rtNodes(p.path);
        NODE_LABELS.forEach(function (name, i) {
            var pt = rtPos(L, x0, top, i);
            var isSrc = i === 0;
            var isDst = i === NODE_LABELS.length - 1;
            var base = isSrc ? P.purple : (isDst ? P.teal : P.sub);
            var onNow = pathNow.indexOf(i) !== -1;
            var onPrev = pathPrev.indexOf(i) !== -1;
            var pa = onNow ? (fresh && !onPrev ? ez(seg(e, 0.2, 0.9)) : 1) : 0;
            var hw = L.nHW;
            var hh = L.nHH;
            rr(pt.x - hw, pt.y - hh, hw * 2, hh * 2, 6, base + '22', base + 'cc', 1.8);
            if (pa > 0) {
                ctx.globalAlpha = pa;
                rr(pt.x - hw, pt.y - hh, hw * 2, hh * 2, 6, P.green + '33', P.green + 'ff', 2.5);
                ctx.globalAlpha = 1;
            }
            if (isSrc || isDst) {
                tx(name, pt.x, pt.y - 4, L.fsN, P.text + 'ff', 'center', true);
                tx(isSrc ? 'SRC' : 'DST', pt.x, pt.y + (L.mob ? 8 : 9), L.fsS, P.sub + 'ff', 'center', false);
            } else {
                tx(name, pt.x, pt.y, L.fsN, P.text + 'ff', 'center', true);
            }
        });

        var curPt = rtPos(L, x0, top, s.activeNode);
        var ring = curPt;
        if (fresh && p.activeNode !== s.activeNode) {
            var fromPt = rtPos(L, x0, top, p.activeNode);
            var rk = ez(e);
            ring = { x: lerp(fromPt.x, curPt.x, rk), y: lerp(fromPt.y, curPt.y, rk) };
        }
        rr(ring.x - L.nHW - 6, ring.y - L.nHH - 6, (L.nHW + 6) * 2, (L.nHH + 6) * 2, 9, null, P.purple + 'cc', 2.2);

        Object.keys(s.badge).forEach(function (key) {
            var ni = parseInt(key, 10);
            var changed = fresh && p.badge[key] !== s.badge[key];
            var a = changed ? ez(seg(e, 0.45, 0.95)) : 1;
            rtBadge(L, rtPos(L, x0, top, ni), ni, s.badge[key], a, changed ? (1 - a) * 5 : 0, x0, w);
        });
        if (fresh) {
            Object.keys(p.badge).forEach(function (key) {
                if (s.badge[key] !== undefined) return;
                var ni = parseInt(key, 10);
                rtBadge(L, rtPos(L, x0, top, ni), ni, p.badge[key], 1 - ez(seg(e, 0, 0.35)), 0, x0, w);
            });
        }

        var chain = rtChain(s.path);
        var names = chain.map(function (n) { return NODE_LABELS[n]; }).join(' → ');
        var cost = s.path.length ? (mode === 'rip' ? s.path.length + '홉' : '비용 ' + rtSum(s.path)) : '';
        var stY = top + L.stripY;
        var stC = stY + L.stripH / 2;
        rr(x0, stY, w, L.stripH, 6, 'none', P.sub + '66', 1.2);
        tx('경로', x0 + 10, stC, L.fsE, P.sub + 'ff', 'left', true);
        tx(names, x0 + (L.mob ? 40 : 52), stC, L.fsE + 1, s.done ? P.green + 'ff' : P.text + 'ff', 'left', true);
        if (cost) tx(cost, x0 + w - 10, stC, L.fsE, (s.done ? P.green : P.yellow) + 'ff', 'right', true);
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
        tipHits.length = 0;
        drawScene(sidePad(W), topPad(W), W - sidePad(W) * 2, mob, step, prev, anim);
        if (hoveredKey && typeof TIPS !== 'undefined' && TIPS[hoveredKey]) drawTip(mousePos.x, mousePos.y, TIPS[hoveredKey]);
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
        speedBtns.forEach(function (b) { b.classList.remove('routing-viz__speed-btn--active'); });
        btn.classList.add('routing-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('routing-viz__mode-btn--active', d.key === m); });
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
                mousePos: mousePos,
                tooltipHits: tipHits,
                hoveredKey: function () { return hoveredKey; },
                setHoveredKey: function (k) { hoveredKey = k; },
                draw: draw
            };
        }
    });

    setTimeout(resize, 60);
})();