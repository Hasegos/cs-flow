/**
 * NUMA 아키텍처 시각화 시각화
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
    var root    = el('div', 'numa-viz');
    var toolbar = el('div', 'numa-viz__toolbar');
    var tbLeft  = el('div', 'numa-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'numa-viz__title', 'NUMA ENGINE'));

    var modeWrap = el('div', 'numa-viz__mode');
    var modeDefs = [
        { key: 'arch', label: 'UMA vs NUMA' },
        { key: 'cost', label: '로컬 vs 원격 비용' },
        { key: 'policy', label: '배치와 이동' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'numa-viz__mode-btn' + (i === 0 ? ' numa-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'numa-viz__speed');
    speedWrap.appendChild(el('span', 'numa-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'numa-viz__speed-btn' + (i === 0 ? ' numa-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'numa-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'numa-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'numa-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'numa-viz__controls');
    var btnPlay  = el('button', 'numa-viz__btn numa-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'numa-viz__btn', '▶| STEP');
    var btnReset = el('button', 'numa-viz__btn', '↺ RESET');
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
    var mode    = 'arch';
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

    /* ===================== 데이터: UMA vs NUMA ===================== */
    var LOCAL  = 10;
    var REMOTE = 21;
    var ACC    = 100;

    var ARCH_STEPS = [
        { a: 'uma', hl: '', log: 'UMA(균일 메모리 접근) — 모든 CPU가 하나의 메모리를 같은 경로로 씁니다. 어느 CPU가 어느 주소를 읽든 접근 시간이 같습니다.' },
        { a: 'uma', hl: 'bus', log: 'CPU가 늘어나면 모두 같은 버스와 메모리 컨트롤러를 나눠 써서 경쟁이 심해집니다. 이 병목이 UMA 확장의 한계입니다.' },
        { a: 'numa', hl: '', log: 'NUMA — 메모리를 여러 개로 나눠 각 CPU(소켓)에 직접 붙입니다. CPU와 그 CPU에 붙은 메모리를 묶어 노드라고 부릅니다.' },
        { a: 'numa', hl: 'local', log: '로컬 접근 — 노드 0의 CPU가 노드 0의 메모리를 읽습니다. 경로가 짧아 지연이 가장 짧습니다(예시 거리 ' + LOCAL + ').' },
        { a: 'numa', hl: 'remote', log: '원격 접근 — 노드 0의 CPU가 노드 1의 메모리를 읽으면 인터커넥트를 거쳐 상대 노드의 메모리까지 가야 합니다(예시 거리 ' + REMOTE + ').' },
        { a: 'numa', hl: '', log: '정리 — 접근 시간이 어느 메모리인지에 따라 달라서 "불균일(Non-Uniform)"입니다. 대신 CPU마다 자기 메모리를 가져, 접근이 분산되면 대역폭이 노드 수만큼 늘어날 수 있습니다.' }
    ];

    /* ===================== 데이터: 로컬 vs 원격 비용 ===================== */
    var COST_LOCAL  = ACC * LOCAL;
    var COST_REMOTE = ACC * REMOTE;
    var COST_STEPS = [
        { loc: false, rem: false, log: '노드 0의 스레드가 같은 데이터를 ' + ACC + '번 읽는다고 가정합니다. 데이터가 로컬 메모리에 있을 때와 원격 메모리에 있을 때 걸리는 총 거리를 비교합니다.' },
        { loc: true, rem: false, log: '로컬 메모리 — 접근 1회의 거리 ' + LOCAL + ' × ' + ACC + '회 = ' + COST_LOCAL + '입니다.' },
        { loc: true, rem: true, log: '원격 메모리 — 접근 1회의 거리 ' + REMOTE + ' × ' + ACC + '회 = ' + COST_REMOTE + '입니다.' },
        { loc: true, rem: true, log: '정리 — 같은 작업이 원격에서는 ' + (COST_REMOTE / COST_LOCAL).toFixed(1) + '배의 거리를 지납니다. 예시 값이며 실제 비율은 하드웨어마다 다르므로 numactl --hardware 같은 도구로 확인합니다.' }
    ];

    /* ===================== 데이터: 배치와 이동 ===================== */
    var POLICY_STEPS = [
        { t: 0, pages: null, tag: '', log: '스레드 T가 노드 0에서 실행됩니다. T가 쓸 데이터 D(페이지 4개)는 아직 할당되지 않았습니다.' },
        { t: 0, pages: [0, 0, 0, 0], tag: '처음 접근한 노드에 배치', log: '첫 접근(first touch) — T가 D를 처음 쓰는 순간 페이지가 T가 있는 노드 0의 메모리에 놓입니다. 리눅스의 기본 정책은 요청한 CPU의 노드에 할당하는 것입니다.' },
        { t: 1, pages: [0, 0, 0, 0], tag: '스레드만 이동', log: '스케줄러가 T를 노드 1의 CPU로 옮깁니다. D는 그대로 노드 0에 있어서 모든 접근이 원격 접근이 됩니다.' },
        { t: 0, pages: [0, 0, 0, 0], tag: '스레드를 노드에 고정', log: '해결 1 — T를 노드 0에 고정(pin)하면 데이터와 스레드가 같은 노드에 있어 로컬 접근을 유지합니다. 페이지를 T가 있는 노드로 옮기는 방법도 있습니다.' },
        { t: 0, pages: [0, 1, 0, 1], tag: '페이지를 노드에 번갈아 배치', log: '해결 2 — 인터리브(interleave) 정책은 페이지를 노드에 번갈아 배치합니다. 한 노드에 몰리는 것은 막지만 접근의 절반은 원격이 됩니다.' },
        { t: 0, pages: [0, 1, 0, 1], tag: '', log: '정리 — 스레드와 데이터를 같은 노드에 두는 것이 기본 원칙입니다. 여러 노드가 같은 데이터를 쓰면 인터리브로 부하를 나누는 선택을 합니다.' }
    ];

    window.CsFlow.numaData = { local: LOCAL, remote: REMOTE, acc: ACC, arch: ARCH_STEPS, cost: COST_STEPS, policy: POLICY_STEPS };

    function avgDist(t, pages) {
        var sum = 0;
        pages.forEach(function (n) { sum += n === t ? LOCAL : REMOTE; });
        return sum / pages.length;
    }

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'cost') return COST_STEPS;
        if (mode === 'policy') return POLICY_STEPS;
        return ARCH_STEPS;
    }
    function defaultLog() {
        if (mode === 'cost') return '같은 데이터를 로컬 메모리에서 읽을 때와 원격 메모리에서 읽을 때의 총 거리를 비교합니다.';
        if (mode === 'policy') return '스레드와 데이터가 같은 노드에 있어야 로컬 접근이 유지됩니다. 배치 정책과 스레드 이동의 영향을 봅니다.';
        return 'UMA와 NUMA의 구조 차이와, NUMA에서 로컬 접근과 원격 접근의 차이를 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    var NU_COST_TITLE = '같은 데이터를 ' + ACC + '번 읽을 때 총 거리';
    function layout(w, mob) {
        var fs = mob ? 11 : 12;
        var lh = fs + 5;
        var gap = mob ? 28 : 110;
        var nh = mob ? 146 : 160;
        var barH = mob ? 30 : 36;
        var costRow0 = lines(NU_COST_TITLE, w, fs + 1).length * lh + 18;
        var costStep = barH + 44;
        var polNh = mob ? 136 : 150;
        var polTag = 4 + polNh + 18;
        return {
            fs: fs, lh: lh, gap: gap, nh: nh, ny: 28, nw: Math.min(240, (w - gap) / 2),
            barH: barH, costRow0: costRow0, costStep: costStep,
            polNh: polNh, polTag: polTag,
            archH: 28 + nh + 56,
            costH: costRow0 + costStep + barH + 62,
            polH: polTag + 66
        };
    }
    function sceneH(w, mob) {
        var L = layout(w, mob);
        if (mode === 'cost') return L.costH;
        if (mode === 'policy') return L.polH;
        return L.archH;
    }
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }
    function nuFmt(v) { return Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1); }

    /* ===================== 경로와 상자 헬퍼 ===================== */
    function nuD(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
    function nuLen(pts) {
        var tot = 0;
        for (var i = 1; i < pts.length; i++) tot += nuD(pts[i - 1], pts[i]);
        return tot;
    }
    function nuSub(pts, f) {
        var want = clamp01(f) * nuLen(pts);
        var acc = 0;
        var out = [pts[0]];
        for (var i = 1; i < pts.length; i++) {
            var sl = nuD(pts[i - 1], pts[i]);
            if (acc + sl >= want) {
                var q = sl > 0 ? (want - acc) / sl : 0;
                out.push([lerp(pts[i - 1][0], pts[i][0], q), lerp(pts[i - 1][1], pts[i][1], q)]);
                return out;
            }
            out.push(pts[i]);
            acc += sl;
        }
        return out;
    }
    function nuPoly(pts, col, lw) {
        if (pts.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        ctx.lineJoin = 'round';
        ctx.stroke();
    }
    function nuPill(cx, cy, label, col, fs) {
        var pw = fs * 2 + 10;
        rr(cx - pw / 2, cy - 9, pw, 18, 5, col + 'ff', col + 'ff', 1);
        tx(label, cx, cy, fs, '#111111', 'center', true);
    }
    function nuFlow(pts, f, col, label, fs) {
        var sub = nuSub(pts, f);
        nuPoly(sub, col + '88', 2.6);
        var pt = sub[sub.length - 1];
        nuPill(pt[0], pt[1], label, col, fs);
    }
    function nuBox(x, y, w, h, label, col, strong, fs) {
        rr(x, y, w, h, 6, col + (strong ? '30' : '16'), col + (strong ? 'ff' : '88'), strong ? 2 : 1.3);
        tx(label, x + w / 2, y + h / 2, fs, strong ? P.text + 'ff' : P.text + 'cc', 'center', true);
    }

    /* ===================== 모드: UMA vs NUMA ===================== */
    function nuDrawUma(x0, top, w, mob, L, s, t, live) {
        var fs = L.fs;
        var cw = Math.min(mob ? 110 : 150, (w - 60) / 2);
        var mx = x0 + w / 2;
        var cx0 = mx - cw - 30, cx1 = mx + 30;
        var cpuY = top + 30, cpuH = 40;
        var busY = cpuY + cpuH + 26, busH = 24;
        var memY = busY + busH + 24, memH = 40;
        var memW = mob ? 130 : 170;
        var c0 = cx0 + cw / 2, c1 = cx1 + cw / 2;
        var hot = s.hl === 'bus';
        var lc = hot ? P.orange : P.sub;
        var jy = busY + busH / 2;
        nuBox(cx0, cpuY, cw, cpuH, 'CPU 0', P.purple, false, fs);
        nuBox(cx1, cpuY, cw, cpuH, 'CPU 1', P.purple, false, fs);
        ln(c0, cpuY + cpuH, c0, busY, lc + 'cc', 2);
        ln(c1, cpuY + cpuH, c1, busY, lc + 'cc', 2);
        rr(c0 - 10, busY, c1 - c0 + 20, busH, 6, lc + '26', lc + 'cc', 1.5);
        tx(hot ? '같은 버스에 접근이 몰림' : '공용 버스', mx, jy, fs, lc + 'ff', 'center', true);
        ln(mx, busY + busH, mx, memY, lc + 'cc', 2);
        nuBox(mx - memW / 2, memY, memW, memH, 'Memory (하나)', P.green, false, fs);
        if (!live) return;
        var path0 = [[c0, cpuY + cpuH], [c0, jy], [mx - 22, jy], [mx - 22, memY]];
        var path1 = [[c1, cpuY + cpuH], [c1, jy], [mx + 22, jy], [mx + 22, memY]];
        if (!hot) {
            var f = ez(seg(t, 0, 0.95));
            nuFlow(path0, f, P.yellow, '요청', fs);
            nuFlow(path1, f, P.yellow, '요청', fs);
            return;
        }
        var jn = nuLen([[c1, cpuY + cpuH], [c1, jy]]) / nuLen(path1);
        var waiting = t < 0.6;
        nuFlow(path0, ez(seg(t, 0, 0.6)), P.yellow, '요청', fs);
        nuFlow(path1, waiting ? jn * ez(seg(t, 0, 0.4)) : jn + (1 - jn) * ez(seg(t, 0.6, 1)), waiting ? P.red : P.yellow, waiting ? '대기' : '요청', fs);
    }

    function nuDrawNuma(x0, top, w, L, s, t, link, live) {
        var fs = L.fs, nw = L.nw, nh = L.nh;
        var ny = top + L.ny;
        var mx = x0 + w / 2;
        var nx = [mx - L.gap / 2 - nw, mx + L.gap / 2];
        var cpuY = ny + 30, cpuH = 36, cpuMid = cpuY + cpuH / 2, cpuBot = cpuY + cpuH;
        var memH = 40, memY = ny + nh - 14 - memH, memMid = memY + memH / 2;
        var hl = s.hl;
        var rem = hl === 'remote';
        var last = ARCH_STEPS.indexOf(s) === ARCH_STEPS.length - 1;
        var ax = nx[0] + nw - 14, bx = nx[1] + 7;
        var base = ctx.globalAlpha;
        for (var i = 0; i < 2; i++) {
            var hot = i === 0 ? hl !== '' : rem;
            var mHot = (hl === 'local' && i === 0) || (rem && i === 1);
            rr(nx[i], ny, nw, nh, 8, P.muted + '10', hot ? P.orange + 'aa' : P.muted + '77', 1.4);
            tx('노드 ' + i, nx[i] + 10, ny + 12, fs, P.sub + 'ff', 'left', true);
            nuBox(nx[i] + 14, cpuY, nw - 28, cpuH, 'CPU ' + i, P.purple, hot, fs);
            nuBox(nx[i] + 14, memY, nw - 28, memH, 'Memory ' + i, P.green, mHot, fs);
            ln(nx[i] + nw / 2, cpuBot, nx[i] + nw / 2, memY, mHot ? P.orange + 'ee' : P.muted + '88', mHot ? 3 : 1.6);
        }
        var lx = lerp(ax, bx, clamp01(link));
        ln(ax, cpuMid, lx, cpuMid, rem ? P.orange + 'ff' : P.muted + '99', rem ? 3 : 1.6);
        tx('인터커넥트', mx, ny + nh + 16, fs, (rem ? P.orange : P.sub) + 'ff', 'center', true);
        var lab = null, labCol = P.green;
        if (hl === 'local') lab = '로컬 접근: 거리 ' + LOCAL;
        else if (rem) { lab = '원격 접근: 거리 ' + REMOTE; labCol = P.orange; }
        else if (last) lab = '자기 메모리 접근: 거리 ' + LOCAL;
        if (lab) {
            ctx.globalAlpha = base * ez(seg(t, 0.6, 1));
            tx(lab, mx, ny + nh + 36, fs + 1, labCol + 'ff', 'center', true);
            ctx.globalAlpha = base;
        }
        if (!live) return;
        var n0x = nx[0] + nw / 2, n1x = nx[1] + nw / 2;
        if (hl === 'local') {
            nuFlow([[n0x, cpuBot], [n0x, memY]], ez(seg(t, 0.05, 0.85)), P.green, '읽기', fs);
        } else if (rem) {
            nuFlow([[ax, cpuMid], [bx, cpuMid], [bx, memMid], [nx[1] + 14, memMid]], ez(seg(t, 0.05, 0.9)), P.orange, '읽기', fs);
        } else if (last) {
            var f2 = ez(seg(t, 0.05, 0.9));
            nuFlow([[n0x, cpuBot], [n0x, memY]], f2, P.green, '읽기', fs);
            nuFlow([[n1x, cpuBot], [n1x, memY]], f2, P.green, '읽기', fs);
        }
    }

    function nuDrawArch(x0, top, w, mob, L, s, p, t, live) {
        var sw = p.a !== s.a ? ez(t) : 1;
        var numaA = s.a === 'numa' ? sw : 1 - sw;
        tx(s.a === 'numa' ? 'NUMA — 노드마다 로컬 메모리' : 'UMA — 균일 메모리 접근', x0, top + 8, L.fs + 0.5, P.text + 'ee', 'left', true);
        if (numaA < 1) {
            ctx.globalAlpha = 1 - numaA;
            nuDrawUma(x0, top, w, mob, L, s, t, live && s.a === 'uma');
        }
        if (numaA > 0) {
            ctx.globalAlpha = numaA;
            nuDrawNuma(x0, top, w, L, s, t, sw, live && s.a === 'numa');
        }
        ctx.globalAlpha = 1;
    }

    /* ===================== 모드: 로컬 vs 원격 비용 ===================== */
    function nuDrawCost(x0, top, w, mob, L, s, p, t) {
        var fs = L.fs, barH = L.barH, lh = L.lh;
        var cs = currentSteps();
        var last = cs.indexOf(s) === cs.length - 1;
        var barX = x0 + (mob ? 52 : 68);
        var maxW = w - (barX - x0) - (mob ? 50 : 64);
        var y0 = top + L.costRow0;
        var locA = s.loc ? (p.loc ? 1 : ez(t)) : 0;
        var remA = s.rem ? (p.rem ? 1 : ez(t)) : 0;
        lines(NU_COST_TITLE, w, fs + 1).forEach(function (txt, li) {
            tx(txt, x0, top + 8 + li * lh, fs + 1, P.text + 'ee', 'left', true);
        });
        var rows = [
            { nm: '로컬', full: COST_LOCAL, a: locA, col: P.green, sub: '거리 ' + LOCAL + ' × ' + ACC },
            { nm: '원격', full: COST_REMOTE, a: remA, col: P.orange, sub: '거리 ' + REMOTE + ' × ' + ACC }
        ];
        rows.forEach(function (r, i) {
            var y = y0 + i * L.costStep;
            var hc = r.a > 0 ? r.col : P.sub;
            tx(r.nm, x0, y + barH / 2, fs + 1, hc + 'ff', 'left', true);
            rr(barX, y, maxW, barH, 5, 'none', P.muted + '55', 1);
            var bw = maxW * r.full / COST_REMOTE * r.a;
            if (bw > 0.5) rr(barX, y, bw, barH, 5, r.col + '38', r.col + 'dd', 1.6);
            tx(String(Math.round(r.full * r.a)), x0 + w, y + barH / 2, fs + 1, hc + 'ff', 'right', true);
            tx(r.sub, barX, y + barH + 14, fs, P.sub + 'ff', 'left', false);
        });
        var ry = y0 + L.costStep + barH + 40;
        if (!s.loc && !s.rem) {
            tx('읽기 ' + Math.round(ACC * t) + ' / ' + ACC + '회', x0, ry, fs + 1, P.sub + 'ff', 'left', true);
        }
        if (remA > 0) {
            ctx.globalAlpha = remA;
            tx('원격 / 로컬 = ' + (COST_REMOTE / COST_LOCAL).toFixed(1) + '배', x0, ry, fs + 2, P.orange + 'ee', 'left', true);
            ctx.globalAlpha = 1;
        }
        if (last) {
            var dA = ez(t);
            var dx = barX + maxW * COST_LOCAL / COST_REMOTE;
            var dw = barX + maxW - dx;
            rr(dx, y0, dw * dA, barH, 5, P.orange + '22', P.orange + '66', 1);
            ctx.globalAlpha = dA;
            tx('+' + (COST_REMOTE - COST_LOCAL), dx + dw / 2, y0 + barH / 2, fs, P.orange + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        }
    }

    /* ===================== 모드: 배치와 이동 ===================== */
    function nuDrawPolicy(x0, top, w, L, s, p, t) {
        var fs = L.fs, nw = L.nw, nh = L.polNh, gap = L.gap;
        var ny = top + 4;
        var mx = x0 + w / 2;
        var nx = [mx - gap / 2 - nw, mx + gap / 2];
        var laneY = ny + 24, laneH = 20;
        var cpuY = ny + 52, cpuH = 30;
        var pageY = ny + 104, pageH = 24;
        var cellW = (nw - 40) / 4;
        var cellX = function (i, k) { return nx[i] + 14 + k * (cellW + 4); };
        var cs = currentSteps();
        var last = cs.indexOf(s) === cs.length - 1;
        var chipX = lerp(nx[p.t] + nw / 2, nx[s.t] + nw / 2, p.t !== s.t ? ez(t) : 1);
        for (var i = 0; i < 2; i++) {
            rr(nx[i], ny, nw, nh, 8, P.muted + '10', P.muted + '77', 1.4);
            tx('노드 ' + i, nx[i] + 10, ny + 12, fs, P.sub + 'ff', 'left', true);
            nuBox(nx[i] + 14, cpuY, nw - 28, cpuH, 'CPU ' + i, P.purple, s.t === i, fs);
            tx('메모리', nx[i] + 14, ny + 94, fs, P.sub + 'ff', 'left', false);
            for (var k = 0; k < 4; k++) rr(cellX(i, k), pageY, cellW, pageH, 4, 'none', P.muted + '44', 1);
        }
        if (s.pages) {
            for (var j = 0; j < 4; j++) {
                var mvk = !!p.pages && p.pages[j] !== s.pages[j];
                var dst = cellX(s.pages[j], j);
                if (!mvk || t >= 1) {
                    ctx.globalAlpha = p.pages ? 1 : ez(seg(t, j * 0.12, j * 0.12 + 0.5));
                    rr(dst, pageY, cellW, pageH, 4, P.green + '30', P.green + 'cc', 1.6);
                    tx('D' + j, dst + cellW / 2, pageY + pageH / 2, fs, P.green + 'ff', 'center', true);
                    ctx.globalAlpha = 1;
                }
                if (last && s.pages[j] !== s.t) {
                    ctx.globalAlpha = ez(seg(t, j * 0.15, j * 0.15 + 0.5));
                    rr(dst - 2, pageY - 2, cellW + 4, pageH + 4, 6, 'none', P.orange + 'ff', 1.4);
                    ctx.globalAlpha = 1;
                }
                if (mvk && t < 1) {
                    var fromX = cellX(p.pages[j], j) + cellW / 2;
                    var px = lerp(fromX, dst + cellW / 2, ez(t));
                    rr(px - cellW / 2 - 1, pageY - 1, cellW + 2, pageH + 2, 4, P.green + 'ff', P.green + 'ff', 1.2);
                    tx('D' + j, px, pageY + pageH / 2, fs, '#111111', 'center', true);
                }
            }
        }
        rr(chipX - 30, laneY, 60, laneH, 10, P.orange + '30', P.orange + 'ff', 1.6);
        tx('스레드 T', chipX, laneY + laneH / 2, fs, P.orange + 'ff', 'center', true);
        var tagY = ny + nh + 18;
        if (!s.pages) {
            tx('아직 데이터가 할당되지 않았습니다', mx, tagY + 26, fs, P.sub + 'ff', 'center', false);
            return;
        }
        if (s.tag) {
            ctx.globalAlpha = s.tag !== p.tag ? ez(t) : 1;
            tx(s.tag, mx, tagY, fs + 1, P.text + 'ee', 'center', true);
            ctx.globalAlpha = 1;
        }
        var a = avgDist(s.t, s.pages);
        var pa = p.pages ? avgDist(p.t, p.pages) : null;
        var v = pa === null ? a : lerp(pa, a, ez(t));
        var rc = s.pages.filter(function (n) { return n !== s.t; }).length;
        ctx.globalAlpha = pa === null ? ez(t) : 1;
        tx('접근 1회 평균 거리: ' + nuFmt(v), mx, tagY + 26, fs + 2, (a === LOCAL ? P.green : P.orange) + 'ee', 'center', true);
        tx('원격 접근 비율 ' + Math.round(rc * 100 / s.pages.length) + '%', mx, tagY + 48, fs, P.sub + 'ff', 'center', false);
        ctx.globalAlpha = 1;
    }

    /* ===================== 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var s = step || currentSteps()[0];
        var p = prev || s;
        var u = step ? clamp01(t) : 0;
        if (mode === 'cost') nuDrawCost(x0, top, w, mob, L, s, p, u);
        else if (mode === 'policy') nuDrawPolicy(x0, top, w, L, s, p, u);
        else nuDrawArch(x0, top, w, mob, L, s, p, u, !!step);
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
        speedBtns.forEach(function (b) { b.classList.remove('numa-viz__speed-btn--active'); });
        btn.classList.add('numa-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('numa-viz__mode-btn--active', d.key === m); });
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

    window.CsFlow.mount3dButton({
        container: container,
        parent: toolbar,
        cls: 'numa-viz__btn numa-viz__btn--primary',
        label: '3D 공항 허브',
        onOpen: function () {
            vizReset();
            root.classList.add('numa-viz--hidden');
        },
        onExit: function () {
            root.classList.remove('numa-viz--hidden');
            resize();
        }
    });

    setTimeout(resize, 60);
})();