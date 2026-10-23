/**
 * 프로세스 상태 전이 인터랙티브 시각화 시각화
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
    var root    = el('div', 'proc-viz');
    var toolbar = el('div', 'proc-viz__toolbar');
    var tbLeft  = el('div', 'proc-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'proc-viz__title', 'Process State'));

    var modeWrap = el('div', 'proc-viz__mode');
    var modeDefs = [

    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'proc-viz__mode-btn' + (i === 0 ? ' proc-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    if (modeDefs.length) tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'proc-viz__speed');
    speedWrap.appendChild(el('span', 'proc-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'proc-viz__speed-btn' + (i === 0 ? ' proc-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'proc-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'proc-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'proc-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'proc-viz__controls');
    var btnPlay  = el('button', 'proc-viz__btn proc-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'proc-viz__btn', '▶| STEP');
    var btnReset = el('button', 'proc-viz__btn', '↺ RESET');
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
    var mode    = '';
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
        var parts = text.split('\n');
        var title = parts[0], desc = parts[1] || '';
        ctx.font = '700 14px "JetBrains Mono",monospace';
        var titleW = ctx.measureText(title).width;
        ctx.font = '400 13px "JetBrains Mono",monospace';
        var descW = ctx.measureText(desc).width;
        var W = GW(), H = GH();
        var pad = 14;
        var tw = Math.min(W - 16, Math.max(titleW, descW) + pad * 2);
        var th = desc ? 60 : 36;
        var bx = mx + 14, by = my - th - 8;
        if (bx + tw > W - 8) bx = mx - tw - 14;
        if (bx < 8) bx = 8;
        if (by < 8) by = my + 14;
        if (by + th > H - 8) by = H - th - 8;
        rr(bx, by, tw, th, 6, P.surf2, P.purple + 'cc', 2);
        tx(title, bx + pad, by + (desc ? 18 : th / 2), 14, P.text + 'ff', 'left', true);
        if (desc) tx(desc, bx + pad, by + 42, 13, P.sub + 'ff', 'left', false);
    }
    function colorOf(key) { return P[key] || P.muted; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
    function seg(t, a, b) { return clamp01((t - a) / (b - a)); }
    function lines(str, maxW, fs) {
        ctx.font = '700 ' + fs + 'px "JetBrains Mono",monospace';
        return window.CsFlow.wrapText(ctx, str, maxW);
    }

    /* ===================== 약어 툴팁 ===================== */
    const TOOLTIPS = {
        NEW:        'New (생성)\nfork() 호출 등으로 프로세스가 처음 만들어진 상태. OS가 PCB를 초기화합니다.',
        READY:      'Ready (준비)\nCPU 할당만 기다리는 상태. Ready Queue에서 스케줄러를 대기합니다.',
        RUNNING:    'Running (실행)\n실제로 CPU를 점유해 명령어를 실행하는 상태. 단일 코어에서는 프로세스 하나만 이 상태입니다.',
        WAITING:    'Waiting / Blocked (대기)\nI/O 완료·세마포어 등 외부 이벤트를 기다리는 상태. CPU를 줘도 실행할 수 없습니다.',
        TERMINATED: 'Terminated (종료)\n실행이 끝난 상태. PCB는 부모가 wait()를 호출할 때까지 남아 있어 좀비가 됩니다.',
    };

    /* ===================== 시나리오 정의 ===================== */
    const STEPS = [
        {
            badge:  'NEW → READY',
            from:   'NEW',
            to:     'READY',
            log:    'Step 1 — fork()로 프로세스가 생성(New)되고, OS가 PCB를 초기화합니다. 메모리 할당이 완료되면 Ready Queue에 삽입되어 Ready 상태로 전이합니다.',
            pcb:    { pid: '1024', state: 'READY', pc: '0x0040', priority: '20', cpu: '0ms' },
        },
        {
            badge:  'READY → RUNNING',
            from:   'READY',
            to:     'RUNNING',
            log:    'Step 2 — CPU 스케줄러가 Ready Queue에서 이 프로세스를 선택하고, 디스패처가 컨텍스트 스위칭을 수행해 CPU를 넘겨줍니다. 프로세스는 Running 상태로 전이합니다.',
            pcb:    { pid: '1024', state: 'RUNNING', pc: '0x0048', priority: '20', cpu: '12ms' },
        },
        {
            badge:  'RUNNING → WAITING',
            from:   'RUNNING',
            to:     'WAITING',
            log:    'Step 3 — 프로세스가 디스크 I/O를 요청(read() 시스템 콜)합니다. I/O가 완료될 때까지 CPU를 반납하고 Waiting(Blocked) 상태로 전이합니다.',
            pcb:    { pid: '1024', state: 'WAITING', pc: '0x0060', priority: '20', cpu: '12ms' },
        },
        {
            badge:  'WAITING → READY',
            from:   'WAITING',
            to:     'READY',
            log:    'Step 4 — 디스크 I/O가 완료되어 인터럽트가 발생합니다. OS가 해당 프로세스를 Waiting에서 Ready Queue로 이동시킵니다. CPU 할당을 다시 기다립니다.',
            pcb:    { pid: '1024', state: 'READY', pc: '0x0060', priority: '20', cpu: '12ms' },
        },
        {
            badge:  'RUNNING → READY',
            from:   'RUNNING',
            to:     'READY',
            log:    'Step 5 — 타임 퀀텀(Time Quantum)이 만료되어 타이머 인터럽트가 발생합니다. OS가 선점(Preempt)하여 현재 프로세스를 Ready Queue로 되돌립니다.',
            pcb:    { pid: '1024', state: 'READY', pc: '0x0074', priority: '20', cpu: '24ms' },
        },
        {
            badge:  'RUNNING → TERMINATED',
            from:   'RUNNING',
            to:     'TERMINATED',
            log:    'Step 6 — 프로세스가 exit() 시스템 콜을 호출하거나 main()에서 반환합니다. OS가 할당된 자원을 해제하고 부모 프로세스에 종료 신호를 보냅니다. PCB는 부모의 wait() 호출 전까지 잔류합니다.',
            pcb:    { pid: '1024', state: 'TERMINATED', pc: '0x00FF', priority: '-', cpu: '36ms' },
        },
    ];

    var TIPS = TOOLTIPS;
    /* ===================== 상태 ===================== */
    var PR_OFF = { 'NEW>READY': 0, 'READY>RUNNING': 26, 'RUNNING>READY': 26, 'RUNNING>TERMINATED': 0, 'RUNNING>WAITING': 30, 'WAITING>READY': -30 };
    var PR_EMPTY = { pid: '-', state: 'IDLE', pc: '-', priority: '-', cpu: '-' };

    function currentSteps() { return STEPS; }
    function defaultLog() { return '▶ PLAY를 눌러 프로세스 상태 전이 과정을 확인하세요.'; }
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var wide = w >= 740;
        var k = wide ? 1 : 0.6;
        var nw, nh, nodes, lq, iq, pcb, total, bx, fsL, fsS;
        if (wide) {
            var pcbW = 220;
            var gw = w - pcbW - 24;
            nw = 108; nh = 62;
            var gap = (gw - nw * 4) / 3;
            var c1 = nw + gap, c2 = (nw + gap) * 2, c3 = (nw + gap) * 3;
            var y1 = 56, y2 = y1 + nh + 66;
            nodes = {
                NEW:        { x: 0,  y: y1, w: nw, h: nh, lbl: 'NEW',        sub: '생성' },
                READY:      { x: c1, y: y1, w: nw, h: nh, lbl: 'READY',      sub: '준비' },
                RUNNING:    { x: c2, y: y1, w: nw, h: nh, lbl: 'RUNNING',    sub: '실행' },
                TERMINATED: { x: c3, y: y1, w: nw, h: nh, lbl: 'TERMINATED', sub: '종료' },
                WAITING:    { x: c2, y: y2, w: nw, h: nh, lbl: 'WAITING',    sub: '대기 / Blocked' }
            };
            lq = { x: c1 + 11, y: y1 + nh + 22, w: 86, h: 46, lbl: 'Ready Queue' };
            iq = { x: c2 + 11, y: y2 + nh + 22, w: 86, h: 46, lbl: 'I/O 대기 큐' };
            pcb = { x: w - pcbW, y: 0, w: pcbW, h: iq.y + iq.h + 12 };
            total = pcb.h;
            bx = gw / 2;
            fsL = 14; fsS = 12;
        } else {
            nw = mob ? 72 : 96; nh = mob ? 44 : 50;
            var gy = mob ? 30 : 34;
            var ca = 0, cb = w - nw;
            var r0 = 46, r1 = r0 + nh + gy, r2 = r1 + nh + gy, r3 = r2 + nh + (mob ? 14 : 16);
            nodes = {
                NEW:        { x: ca, y: r0, w: nw, h: nh, lbl: 'NEW',                        sub: '생성' },
                READY:      { x: cb, y: r0, w: nw, h: nh, lbl: 'READY',                      sub: '준비' },
                RUNNING:    { x: ca, y: r1, w: nw, h: nh, lbl: 'RUNNING',                    sub: '실행' },
                WAITING:    { x: ca, y: r2, w: nw, h: nh, lbl: 'WAITING',                    sub: '대기' },
                TERMINATED: { x: cb, y: r2, w: nw, h: nh, lbl: mob ? 'TERM' : 'TERMINATED',  sub: '종료' }
            };
            lq = { x: cb, y: r1, w: nw, h: nh, lbl: mob ? 'Ready Q' : 'Ready Queue' };
            iq = { x: ca, y: r3, w: nw, h: 40, lbl: mob ? 'I/O Q' : 'I/O 대기 큐' };
            pcb = { x: 0, y: iq.y + iq.h + 14, w: w, h: mob ? 96 : 100 };
            total = pcb.y + pcb.h + 8;
            bx = w / 2;
            fsL = mob ? 11 : 12; fsS = mob ? 11 : 12;
        }
        return { wide: wide, mob: mob, k: k, nodes: nodes, lq: lq, iq: iq, pcb: pcb, total: total, bx: bx, fsL: fsL, fsS: fsS };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 경로 계산 ===================== */
    function prCol(st) {
        return P[st === 'NEW' ? 'teal' : st === 'READY' ? 'purple' : st === 'RUNNING' ? 'green' : st === 'WAITING' ? 'orange' : st === 'TERMINATED' ? 'red' : 'sub'];
    }
    function prNodeC(L, n) { var nd = L.nodes[n]; return { x: nd.x + nd.w / 2, y: nd.y + nd.h / 2 }; }
    function prIsLane(st) { return st === 'READY' || st === 'WAITING'; }
    function prLaneC(L, st) { var q = st === 'READY' ? L.lq : L.iq; return { x: q.x + q.w / 2, y: q.y + q.h / 2 + 6 }; }
    function prRestPos(L, st) {
        if (prIsLane(st)) return prLaneC(L, st);
        var nd = L.nodes[st];
        return { x: nd.x + nd.w / 2, y: nd.y };
    }
    function prIn(r, p, m) { return p.x > r.x - m && p.x < r.x + r.w + m && p.y > r.y - m && p.y < r.y + r.h + m; }
    function prInAnyNode(L, p) {
        return Object.keys(L.nodes).some(function (key) { return prIn(L.nodes[key], p, -2); });
    }
    function prEdge(L, a, b) {
        var A = prNodeC(L, a), B = prNodeC(L, b);
        var off = (PR_OFF[a + '>' + b] || 0) * L.k;
        var dx = B.x - A.x, dy = B.y - A.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
        var qx = (A.x + B.x) / 2 - dy / len * off, qy = (A.y + B.y) / 2 + dx / len * off;
        var out = [];
        for (var i = 0; i <= 40; i++) {
            var u = i / 40, m = 1 - u;
            out.push({ x: m * m * A.x + 2 * m * u * qx + u * u * B.x, y: m * m * A.y + 2 * m * u * qy + u * u * B.y });
        }
        return out;
    }
    function prPieces(L, a, b) {
        var out = [];
        if (prIsLane(a)) out.push({ pts: [prLaneC(L, a), prNodeC(L, a)], end: a });
        if (a !== b) out.push({ pts: prEdge(L, a, b), end: b });
        if (prIsLane(b)) out.push({ pts: [prNodeC(L, b), prLaneC(L, b)], end: b });
        return out;
    }
    function prPath(L, trans) {
        var pts = [], cum = [0], ends = [];
        trans.forEach(function (tr) {
            prPieces(L, tr[0], tr[1]).forEach(function (pc) {
                pc.pts.forEach(function (p, qi) {
                    if (pts.length) {
                        if (qi === 0) return;
                        var q = pts[pts.length - 1];
                        cum.push(cum[cum.length - 1] + Math.hypot(p.x - q.x, p.y - q.y));
                    }
                    pts.push(p);
                });
                ends.push({ n: pts.length - 1, st: pc.end });
            });
        });
        var total = cum[cum.length - 1] || 1;
        return {
            pts: pts, cum: cum, total: total,
            ends: ends.map(function (en) { return { f: cum[en.n] / total, st: en.st }; })
        };
    }
    function prPointAt(path, f) {
        var target = f * path.total, pts = path.pts, cum = path.cum;
        for (var i = 1; i < pts.length; i++) {
            if (cum[i] >= target) {
                var span = cum[i] - cum[i - 1] || 1, r = (target - cum[i - 1]) / span;
                return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * r, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * r };
            }
        }
        return pts[pts.length - 1];
    }
    function prStateAt(path, start, f) {
        var st = start;
        path.ends.forEach(function (en) { if (f >= en.f - 0.000001) st = en.st; });
        return st;
    }

    /* ===================== PCB 값 보간 ===================== */
    function prParse(v, kind) {
        if (v === '-' || v === null || v === undefined) return null;
        var n = kind === 'pc' ? parseInt(String(v).replace(/^0x/i, ''), 16) : parseInt(v, 10);
        return isNaN(n) ? null : n;
    }
    function prFmt(n, kind) {
        if (kind === 'pc') return '0x' + ('000' + Math.round(n).toString(16).toUpperCase()).slice(-4);
        if (kind === 'cpu') return Math.round(n) + 'ms';
        return String(Math.round(n));
    }
    function prPick(bv, av, f, kind) {
        var a = prParse(bv, kind), b = prParse(av, kind);
        if (a === null || b === null) return f > 0.0001 ? av : bv;
        return prFmt(a + (b - a) * f, kind);
    }

    /* ===================== 그리기 헬퍼 ===================== */
    function prDrawEdge(L, key, col, on) {
        var sp = key.split('>');
        var pts = prEdge(L, sp[0], sp[1]);
        var A = L.nodes[sp[0]], B = L.nodes[sp[1]];
        var i0 = 0, i1 = pts.length - 1;
        while (i0 < i1 && prIn(A, pts[i0], 3)) i0++;
        while (i1 > i0 && prIn(B, pts[i1], 3)) i1--;
        if (i1 <= i0) return;
        ctx.beginPath();
        ctx.moveTo(pts[i0].x, pts[i0].y);
        for (var i = i0 + 1; i <= i1; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.setLineDash(on ? [] : [4, 5]);
        ctx.strokeStyle = on ? col + 'ff' : P.border + 'ff';
        ctx.lineWidth = on ? 2.2 : 1;
        ctx.stroke();
        ctx.setLineDash([]);
        if (!on) return;
        var last = pts[i1], before = pts[i1 - 1];
        var ang = Math.atan2(last.y - before.y, last.x - before.x);
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(last.x - 9 * Math.cos(ang - 0.4), last.y - 9 * Math.sin(ang - 0.4));
        ctx.lineTo(last.x - 9 * Math.cos(ang + 0.4), last.y - 9 * Math.sin(ang + 0.4));
        ctx.closePath();
        ctx.fillStyle = col + 'ff';
        ctx.fill();
    }
    function prPill(x, y, lab, col) {
        var pw = lab.length * 5.9 + 12;
        rr(x - pw / 2, y - 8, pw, 16, 8, col + 'ff', col + 'ff', 1);
        tx(lab, x, y, 9.5, '#111111', 'center', true);
    }

    /* ===================== 장면 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var idle = !step;
        var s = idle ? currentSteps()[0] : step;
        var pv = idle ? null : (prev || null);
        var f = idle ? 0 : ez(clamp01(t));
        var beforeSt = pv ? pv.to : 'NEW';
        var trans = [];
        var dispatch = !!pv && pv.to !== s.from;
        if (dispatch) trans.push([pv.to, s.from]);
        trans.push([s.from, s.to]);
        var path = prPath(L, trans);
        var dN = dispatch ? prPieces(L, pv.to, s.from).length : 0;
        var dEnd = dN ? path.ends[dN - 1].f : 0;
        var stNow = idle ? 'NEW' : prStateAt(path, beforeSt, f);
        var pcbState = idle ? 'IDLE' : stNow;

        var before = pv ? pv.pcb : PR_EMPTY;
        var after = idle ? PR_EMPTY : s.pcb;
        var pidV = prPick(before.pid, after.pid, f, 'int');
        var pcV = prPick(before.pc, after.pc, f, 'pc');
        var priV = prPick(before.priority, after.priority, f, 'int');
        var cpuV = prPick(before.cpu, after.cpu, f, 'cpu');

        var mainCol = s.from === 'RUNNING' && s.to === 'WAITING' ? P.orange
                    : s.to === 'TERMINATED' ? P.red
                    : s.from === 'WAITING' ? P.teal
                    : P.purple;

        var tokShow = !idle, tokPos = null;
        if (!idle) {
            if (f <= 0.0001) tokPos = prRestPos(L, beforeSt);
            else if (f >= 0.9999) tokPos = prRestPos(L, s.to);
            else {
                tokPos = prPointAt(path, f);
                if (prInAnyNode(L, tokPos)) tokShow = false;
            }
        }

        ctx.save();
        ctx.translate(x0, top);

        var rd = L.nodes.READY, rw = L.nodes.WAITING;
        var cxR = rd.x + rd.w / 2, cxW = rw.x + rw.w / 2;
        ln(cxR, rd.y + rd.h, cxR, L.lq.y, P.sub + '66', 1.2, [3, 3]);
        ln(cxW, rw.y + rw.h, cxW, L.iq.y, P.sub + '66', 1.2, [3, 3]);

        var mainKey = s.from + '>' + s.to;
        var dispKey = dispatch ? pv.to + '>' + s.from : '';
        Object.keys(PR_OFF).forEach(function (key) {
            prDrawEdge(L, key, mainCol, !idle && (key === mainKey || key === dispKey));
        });

        Object.keys(L.nodes).forEach(function (key) {
            var nd = L.nodes[key];
            var col = prCol(key);
            var act = !idle && (key === s.from || key === s.to);
            var hov = hoveredKey === key;
            rr(nd.x, nd.y, nd.w, nd.h, 8, act ? col + '28' : hov ? P.purple + '18' : P.surf,
                act ? col : hov ? P.purple : P.border, act ? 2.5 : hov ? 2 : 1.5);
            var cy = nd.y + nd.h / 2;
            var ly = L.wide ? cy - 6 : cy + 3;
            var sy = L.wide ? cy + 12 : cy + 14;
            tx(nd.lbl, nd.x + nd.w / 2, ly, L.fsL, act ? col + 'ff' : hov ? P.purple + 'ff' : P.text + 'ff', 'center', true);
            tx(nd.sub, nd.x + nd.w / 2, sy, L.fsS, P.sub + 'ff', 'center', false);
        });

        [['READY', L.lq], ['WAITING', L.iq]].forEach(function (pr) {
            var q = pr[1], on = stNow === pr[0], col = prCol(pr[0]);
            rr(q.x, q.y, q.w, q.h, 6, P.surf2, on ? col : P.sub + '66', on ? 1.8 : 1.2);
            tx(q.lbl, q.x + q.w / 2, q.y + 10, L.fsS, P.sub + 'ff', 'center', true);
            if (!on) tx('비어 있음', q.x + q.w / 2, q.y + q.h / 2 + 6, L.fsS, P.sub + 'ff', 'center', false);
        });

        if (tokShow && tokPos) {
            if (f <= 0.0001 || f >= 0.9999) prPill(tokPos.x, tokPos.y, 'P' + (pidV === '-' ? '?' : pidV), prCol(stNow));
            else circ(tokPos.x, tokPos.y, 6, prCol(stNow) + 'ff', '#111111', 1.2);
        }

        var pb = L.pcb;
        rr(pb.x, pb.y, pb.w, pb.h, 8, P.surf2, P.purple + '55', 1.5);
        var rowsData = [['PID', pidV], ['State', pcbState], ['PC', pcV], ['Priority', priV], ['CPU Time', cpuV]];
        if (L.wide) {
            tx('PCB', pb.x + pb.w / 2, pb.y + 22, 13, P.purple + 'ff', 'center', true);
            ctx.beginPath();
            ctx.moveTo(pb.x + 14, pb.y + 36);
            ctx.lineTo(pb.x + pb.w - 14, pb.y + 36);
            ctx.strokeStyle = P.purple + '44';
            ctx.lineWidth = 1;
            ctx.stroke();
            rowsData.forEach(function (r, i) {
                var ry = pb.y + 58 + i * 38;
                var vc = r[0] === 'State' ? prCol(pcbState) : P.text;
                tx(r[0], pb.x + 18, ry, 12, P.sub + 'ff', 'left', false);
                tx(r[1], pb.x + pb.w - 18, ry, 13, vc + 'ff', 'right', true);
            });
        } else {
            tx('PCB', pb.x + 10, pb.y + 12, 11, P.purple + 'ff', 'left', true);
            var cw = pb.w / 3;
            rowsData.forEach(function (r, i) {
                var col3 = i < 3 ? i : i - 3;
                var rowY = i < 3 ? pb.y + 30 : pb.y + 64;
                var cxp = pb.x + cw * col3 + cw / 2;
                var vc2 = r[0] === 'State' ? prCol(pcbState) : P.text;
                tx(r[0], cxp, rowY, L.fsS, P.sub + 'ff', 'center', false);
                tx(r[1], cxp, rowY + 17, 11, vc2 + 'ff', 'center', true);
            });
        }

        var by = L.wide ? 16 : 12;
        tx(idle ? 'IDLE' : s.badge, L.bx, by, L.fsL, idle ? P.sub + 'ff' : mainCol + 'ff', 'center', true);
        if (dN && f < dEnd) tx('(디스패치: CPU 할당)', L.bx, L.wide ? 34 : 28, L.fsS, P.sub + 'ff', 'center', false);

        ctx.restore();

        Object.keys(L.nodes).forEach(function (key) {
            var nd = L.nodes[key];
            tipBadge(x0 + nd.x + 9, top + nd.y + 9, key);
        });
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
        speedBtns.forEach(function (b) { b.classList.remove('proc-viz__speed-btn--active'); });
        btn.classList.add('proc-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('proc-viz__mode-btn--active', d.key === m); });
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