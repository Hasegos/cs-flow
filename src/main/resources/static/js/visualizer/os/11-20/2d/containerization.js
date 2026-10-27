/**
 * VM vs 컨테이너 시각화
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
    var root    = el('div', 'ct-viz');
    var toolbar = el('div', 'ct-viz__toolbar');
    var tbLeft  = el('div', 'ct-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'ct-viz__title', 'VM VS CONTAINER'));

    var modeWrap = el('div', 'ct-viz__mode');
    var modeDefs = [
        { key: 'stack', label: '구조 비교' },
        { key: 'cost', label: '자원과 시작' },
        { key: 'isolate', label: '격리의 경계' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'ct-viz__mode-btn' + (i === 0 ? ' ct-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'ct-viz__speed');
    speedWrap.appendChild(el('span', 'ct-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'ct-viz__speed-btn' + (i === 0 ? ' ct-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'ct-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'ct-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'ct-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'ct-viz__controls');
    var btnPlay  = el('button', 'ct-viz__btn ct-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'ct-viz__btn', '▶| STEP');
    var btnReset = el('button', 'ct-viz__btn', '↺ RESET');
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
    var mode    = 'stack';
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

    /* ===================== 데이터: 구조 비교 ===================== */
    var N_APPS = 3;
    var GUEST_KERNELS = N_APPS;
    var CT_EXTRA_KERNELS = 0;

    var STACK_STEPS = [
        { k: 0, log: '같은 하드웨어에서 앱 ' + N_APPS + '개를 격리해 실행하는 두 가지 방법을 비교합니다. 왼쪽은 가상 머신(VM), 오른쪽은 컨테이너입니다.' },
        { k: 1, log: '맨 아래는 같은 하드웨어(CPU, 메모리, 디스크)입니다.' },
        { k: 2, log: 'VM은 하드웨어를 가상화하는 하이퍼바이저를 두고, 컨테이너는 호스트 운영체제(커널)와 컨테이너 런타임을 둡니다.' },
        { k: 3, log: '그 위에서 앱 ' + N_APPS + '개를 실행합니다. 앱은 필요한 라이브러리와 함께 묶여 있습니다.' },
        { k: 4, log: 'VM은 앱마다 게스트 운영체제를 따로 띄우므로 커널이 ' + GUEST_KERNELS + '개 더 있습니다. 컨테이너는 호스트 커널 하나를 공유해 추가 커널이 ' + CT_EXTRA_KERNELS + '개입니다.' },
        { k: 4, log: '정리 — VM은 컴퓨터 한 대를 통째로 흉내 내고, 컨테이너는 같은 커널 위에서 프로세스를 격리합니다. 그래서 컨테이너는 게스트 운영체제 비용이 없습니다.' }
    ];

    /* ===================== 데이터: 자원과 시작 ===================== */
    var GUEST_OS_MB = 1024;
    var APP_MB = 100;
    var BOOT_VM = 30;
    var BOOT_CT = 1;
    var VM_TOTAL = N_APPS * (GUEST_OS_MB + APP_MB);
    var CT_TOTAL = N_APPS * APP_MB;
    function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

    var COST_STEPS = [
        { k: 0, log: '앱 ' + N_APPS + '개를 띄울 때 드는 자원을 비교합니다. 값은 방식의 차이를 보이기 위한 가정이며 실제 크기는 환경마다 다릅니다.' },
        { k: 1, log: 'VM — 앱마다 게스트 운영체제(' + GUEST_OS_MB + 'MB 가정)와 앱(' + APP_MB + 'MB 가정)이 필요해 ' + N_APPS + ' × ' + (GUEST_OS_MB + APP_MB) + ' = ' + fmt(VM_TOTAL) + 'MB입니다.' },
        { k: 2, log: '컨테이너 — 호스트 커널을 공유하므로 앱만 있으면 되어 ' + N_APPS + ' × ' + APP_MB + ' = ' + fmt(CT_TOTAL) + 'MB입니다.' },
        { k: 3, log: '시작 — VM은 게스트 운영체제를 부팅해야 하고(' + BOOT_VM + ' 단위 가정), 컨테이너는 격리된 프로세스를 시작하면 됩니다(' + BOOT_CT + ' 단위 가정).' },
        { k: 3, log: '정리 — 컨테이너는 게스트 운영체제가 없어 자원을 적게 쓰고 빨리 시작합니다. 대신 호스트와 같은 종류의 커널을 써야 하는 제약이 있습니다.' }
    ];

    /* ===================== 데이터: 격리의 경계 ===================== */
    var CT_HIT = [true, true, true];
    var VM_HIT = [true, false, false];
    var CT_N = CT_HIT.filter(Boolean).length;
    var VM_N = VM_HIT.filter(Boolean).length;

    var ISO_STEPS = [
        { k: 0, log: '격리의 경계를 비교합니다. 호스트 커널 또는 게스트 커널에 취약점이 있고 악용된다고 가정합니다.' },
        { k: 1, log: '컨테이너 — ' + N_APPS + '개의 컨테이너가 호스트 커널 하나를 공유합니다. 격리는 커널이 제공하는 기능(네임스페이스, cgroups)에 기댑니다.' },
        { k: 2, log: '호스트 커널의 취약점이 악용되면 그 커널을 쓰는 컨테이너 ' + CT_N + '/' + N_APPS + '개가 영향을 받을 수 있고 호스트도 위험해집니다.' },
        { k: 3, log: 'VM — 게스트마다 커널이 따로 있고, 게스트와 호스트 사이에는 하이퍼바이저라는 경계가 있습니다.' },
        { k: 4, log: '한 게스트의 커널이 뚫려도 그 VM(' + VM_N + '/' + N_APPS + '개)에 한정되고, 다른 VM이나 호스트로 번지려면 하이퍼바이저 같은 경계를 또 넘어야 합니다.' },
        { k: 4, log: '정리 — 컨테이너는 격리 경계가 상대적으로 얇고, VM은 더 두껍습니다. 그래서 보안이 중요하면 컨테이너를 VM 안에서 돌리는 구성도 씁니다.' }
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'cost') return COST_STEPS;
        if (mode === 'isolate') return ISO_STEPS;
        return STACK_STEPS;
    }
    function defaultLog() {
        if (mode === 'cost') return 'VM과 컨테이너가 쓰는 자원과 시작 시간을 막대로 비교합니다.';
        if (mode === 'isolate') return '커널이 뚫렸을 때 영향이 어디까지 번지는지 비교합니다.';
        return 'VM과 컨테이너가 같은 하드웨어 위에 쌓이는 층을 비교합니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var t = mode === 'cost' ? (mob ? 226 : 240) : (mode === 'isolate' ? 204 : 252);
        return { fs: mob ? 10.5 : 12, total: t };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    /* ===================== 구조 비교 ===================== */
    function drawStack(x0, top, w, mob, s, p, e, fs) {
        var k = s.k, pk = p.k, q = ez(e);
        var gap = mob ? 14 : 28;
        var cw = (w - gap) / 2;
        var lh = mob ? 30 : 34;
        var base = top + 244;
        var cols = [
            { x: x0, name: '가상 머신', col: P.orange, mid: '하이퍼바이저', guest: true },
            { x: x0 + cw + gap, name: '컨테이너', col: P.teal, mid: mob ? '호스트 OS + 런타임' : '호스트 OS(커널) + 런타임', guest: false }
        ];
        var layer = function (x, y, lw2, label, col, lk, fs2) {
            var on = k >= lk;
            if (!on) {
                rr(x, y, lw2, lh, 5, 'none', P.sub + '44', 1.2);
                return;
            }
            var fresh = pk < lk;
            var dy = fresh ? -(1 - q) * 28 : 0;
            ctx.globalAlpha = fresh ? clamp01(e * 2) : 1;
            rr(x, y + dy, lw2, lh, 5, col + '28', col + 'ff', 1.5);
            tx(label, x + lw2 / 2, y + dy + lh / 2, fs2, P.text + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        };
        cols.forEach(function (c) {
            tx(c.name, c.x, top + 12, fs + 1.5, c.col + 'ff', 'left', true);
            layer(c.x, base - lh, cw, '하드웨어', P.sub, 1, fs);
            var midCol = (k >= 4 && !c.guest) ? P.green : P.purple;
            layer(c.x, base - 2 * lh - 4, cw, c.mid, midCol, 2, fs);
            var aw = (cw - 2 * 6) / N_APPS;
            var yMid = base - 2 * lh - 4;
            for (var i = 0; i < N_APPS; i++) {
                var ax = c.x + i * (aw + 6);
                if (c.guest) {
                    var gy = yMid - 4 - lh;
                    var gOn = k >= 4;
                    var gf = gOn && pk < 4;
                    var gh = gOn ? (gf ? lh * ez(clamp01((e - i * 0.15) / 0.6)) : lh) : 0;
                    rr(ax, gy, aw, lh, 5, 'none', P.sub + '33', 1);
                    if (gh > 0) {
                        rr(ax, yMid - 4 - gh, aw, gh, 5, P.red + '28', P.red + 'ff', 1.5);
                        if (gh > lh * 0.7) tx(mob ? 'OS' : '게스트 OS', ax + aw / 2, gy + lh / 2, fs - 1, P.text + 'ff', 'center', true);
                    }
                    layer(ax, gy - 4 - lh, aw, '앱 ' + (i + 1), c.col, 3, fs - 0.5);
                } else {
                    layer(ax, yMid - 4 - lh, aw, '앱 ' + (i + 1), c.col, 3, fs - 0.5);
                }
            }
        });
        if (k >= 4) {
            var vmN = pk >= 4 ? GUEST_KERNELS : Math.round(GUEST_KERNELS * q);
            tx('추가 커널 ' + vmN + '개', cols[0].x, top + 32, fs, P.red + 'ff', 'left', true);
            ctx.globalAlpha = pk >= 4 ? 1 : clamp01(e * 2);
            tx('추가 커널 ' + CT_EXTRA_KERNELS + '개', cols[1].x, top + 32, fs, P.green + 'ff', 'left', true);
            tx('호스트 커널 공유', cols[1].x, top + 48, fs - 0.5, P.green + 'ff', 'left', true);
            ctx.globalAlpha = 1;
        }
    }

    /* ===================== 자원과 시작 ===================== */
    function drawCost(x0, top, w, mob, s, p, e, fs) {
        var k = s.k, pk = p.k;
        var bh = mob ? 26 : 30;
        var lw = mob ? 56 : 70;
        var maxW = w - lw - (mob ? 70 : 90);
        var unit = maxW / VM_TOTAL;
        var memY = top + 36;
        var bootY = top + 36 + 2 * bh + 62;
        var vmSegs = [], ctSegs = [];
        for (var i = 0; i < N_APPS; i++) {
            vmSegs.push([GUEST_OS_MB, P.red, 'OS'], [APP_MB, P.orange, '']);
            ctSegs.push([APP_MB, P.teal, '']);
        }
        var drawSegs = function (segs, bx, by, shown) {
            var start = 0;
            segs.forEach(function (sg) {
                var vis = Math.min(sg[0], shown - start);
                if (vis > 0) {
                    rr(bx + start * unit + 0.5, by, Math.max(1, vis * unit - 1), bh, 2, sg[1] + '44', sg[1] + 'ff', 1.2);
                    if (sg[2] && vis >= sg[0] && sg[0] * unit > 26) tx(sg[2], bx + start * unit + sg[0] * unit / 2, by + bh / 2, fs - 1, sg[1] + 'ff', 'center', true);
                }
                start += sg[0];
            });
        };

        var memOn = k >= 1, memFresh = memOn && pk < 1;
        var mg = memOn ? (memFresh ? ez(e) : 1) : 0;
        tx('디스크·메모리(앱 ' + N_APPS + '개, MB)', x0, memY - 8, fs, memOn ? P.text + 'ff' : P.sub + 'ff', 'left', true);
        [['VM', vmSegs, VM_TOTAL, P.orange], ['컨테이너', ctSegs, CT_TOTAL, P.teal]].forEach(function (b, bi) {
            var by = memY + 6 + bi * (bh + 6);
            tx(b[0], x0, by + bh / 2, fs - 1.5, memOn ? b[3] + 'ff' : P.sub + 'ff', 'left', true);
            rr(x0 + lw, by, maxW, bh, 4, 'none', P.sub + '44', 1);
            if (!memOn) return;
            var shown = b[2] * mg;
            if (memFresh) shown = Math.min(b[2], VM_TOTAL * mg);
            drawSegs(b[1], x0 + lw, by, shown);
            var vis = Math.min(b[2], shown);
            if (vis > 0) tx(fmt(Math.round(vis)), x0 + lw + vis * unit + 6, by + bh / 2, fs - 0.5, b[3] + 'ff', 'left', true);
        });

        var bootOn = k >= 3, bootFresh = bootOn && pk < 3;
        var tt = bootOn ? (bootFresh ? e : 1) : 0;
        tx('시작 시간 (상대 단위, 가정)', x0, bootY - 8, fs, bootOn ? P.text + 'ff' : P.sub + 'ff', 'left', true);
        [['VM', BOOT_VM, P.orange], ['컨테이너', BOOT_CT, P.teal]].forEach(function (b, bi) {
            var by = bootY + 6 + bi * (bh + 6);
            tx(b[0], x0, by + bh / 2, fs - 1.5, bootOn ? b[2] + 'ff' : P.sub + 'ff', 'left', true);
            rr(x0 + lw, by, maxW, bh, 4, 'none', P.sub + '44', 1);
            if (!bootOn) return;
            var elapsed = Math.min(b[1], tt * BOOT_VM);
            var bw = Math.max(3, maxW * elapsed / BOOT_VM);
            rr(x0 + lw, by, bw, bh, 4, b[2] + '44', b[2] + 'ff', 1.5);
            tx(String(Math.round(elapsed)), x0 + lw + bw + 6, by + bh / 2, fs - 0.5, b[2] + 'ff', 'left', true);
        });
    }

    /* ===================== 격리의 경계 ===================== */
    function drawIsolate(x0, top, w, mob, s, p, e, fs) {
        var k = s.k, pk = p.k;
        var gap = mob ? 14 : 28;
        var cw = (w - gap) / 2;
        var bh = mob ? 40 : 44;
        var aw = (cw - 2 * 6) / N_APPS;
        var y0 = top + 40;
        var panels = [
            { x: x0, name: '컨테이너', onK: 1, badK: 2, hit: CT_HIT, col: P.teal, shared: true },
            { x: x0 + cw + gap, name: '가상 머신', onK: 3, badK: 4, hit: VM_HIT, col: P.orange, shared: false }
        ];
        panels.forEach(function (pn) {
            var on = k >= pn.onK, bad = k >= pn.badK;
            var onFresh = on && pk < pn.onK;
            var b = bad ? (pk >= pn.badK ? 1 : e) : 0;
            var oa = on ? (onFresh ? ez(e) : 1) : 0;
            tx(pn.name, pn.x, top + 12, fs + 1.5, on ? pn.col + 'ff' : P.sub + 'ff', 'left', true);
            var kernY = y0 + bh + 6;
            var redA = ez(b / 0.35);
            var hitN = 0;
            for (var i = 0; i < N_APPS; i++) {
                var ax = pn.x + i * (aw + 6);
                var hit = pn.hit[i];
                var ha = bad && hit ? clamp01((b - 0.35 - (pn.shared ? i * 0.15 : 0)) / 0.3) : 0;
                if (ha > 0.5) hitN++;
                rr(ax, y0, aw, bh, 5, 'none', P.sub + '44', 1.2);
                if (on) {
                    ctx.globalAlpha = oa;
                    rr(ax, y0, aw, bh, 5, pn.col + '22', pn.col + 'cc', 1.4);
                    tx('앱 ' + (i + 1), ax + aw / 2, y0 + bh / 2, fs, P.text + 'ff', 'center', true);
                    ctx.globalAlpha = 1;
                    if (ha > 0) {
                        ctx.globalAlpha = ha;
                        rr(ax, y0, aw, bh, 5, P.red + '55', P.red + 'ff', 2.2);
                        ctx.globalAlpha = 1;
                    }
                }
                if (!pn.shared) {
                    rr(ax, kernY, aw, 30, 5, 'none', P.sub + '44', 1.2);
                    if (on) {
                        ctx.globalAlpha = oa;
                        rr(ax, kernY, aw, 30, 5, P.sub + '22', P.sub + 'aa', 1.2);
                        tx(mob ? '커널' : '게스트 커널', ax + aw / 2, kernY + 15, fs - 1, P.text + 'ff', 'center', true);
                        ctx.globalAlpha = 1;
                        if (bad && hit) {
                            ctx.globalAlpha = redA;
                            rr(ax, kernY, aw, 30, 5, P.red + '55', P.red + 'ff', 2.2);
                            ctx.globalAlpha = 1;
                        }
                    }
                }
            }
            if (pn.shared) {
                rr(pn.x, kernY, cw, 30, 5, 'none', P.sub + '44', 1.2);
                if (on) {
                    ctx.globalAlpha = oa;
                    rr(pn.x, kernY, cw, 30, 5, P.sub + '22', P.sub + 'aa', 1.2);
                    tx('호스트 커널 (공유)', pn.x + cw / 2, kernY + 15, fs - 0.5, P.text + 'ff', 'center', true);
                    ctx.globalAlpha = 1;
                    if (bad) {
                        ctx.globalAlpha = redA;
                        rr(pn.x, kernY, cw, 30, 5, P.red + '55', P.red + 'ff', 2.2);
                        ctx.globalAlpha = 1;
                        if (b < 1) {
                            ctx.globalAlpha = 1 - b;
                            circ(pn.x + cw / 2, kernY + 15, 8 + b * 40, 'none', P.red + 'ff', 2);
                            ctx.globalAlpha = 1;
                        }
                    }
                }
            } else {
                var hy = kernY + 36;
                rr(pn.x, hy, cw, 22, 5, 'none', P.sub + '44', 1.2);
                if (on) {
                    ctx.globalAlpha = oa;
                    rr(pn.x, hy, cw, 22, 5, P.purple + '28', P.purple + 'ff', 1.5);
                    tx('하이퍼바이저 (경계)', pn.x + cw / 2, hy + 11, fs - 1, P.text + 'ff', 'center', true);
                    ctx.globalAlpha = 1;
                    if (bad) {
                        var la = clamp01((b - 0.45) / 0.3);
                        var ax0 = pn.x + aw / 2;
                        ctx.globalAlpha = la;
                        ln(ax0, kernY + 32, ax0, hy - 2, P.red + 'ff', 2);
                        ln(ax0 - 8, hy - 12, ax0 + 8, hy + 4, P.red + 'ff', 3);
                        ln(ax0 - 8, hy + 4, ax0 + 8, hy - 12, P.red + 'ff', 3);
                        ctx.globalAlpha = 1;
                    }
                }
            }
            if (on) {
                var label = bad ? '영향 ' + hitN + '/' + N_APPS : '영향 없음';
                tx(label, pn.x, kernY + 82, fs + 1, bad ? P.red + 'ff' : P.sub + 'ff', 'left', true);
            }
        });
    }

    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var e = clamp01(t);
        var s = step || currentSteps()[0];
        var p = prev || s;
        if (mode === 'cost') drawCost(x0, top, w, mob, s, p, e, L.fs);
        else if (mode === 'isolate') drawIsolate(x0, top, w, mob, s, p, e, L.fs);
        else drawStack(x0, top, w, mob, s, p, e, L.fs);
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
        speedBtns.forEach(function (b) { b.classList.remove('ct-viz__speed-btn--active'); });
        btn.classList.add('ct-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('ct-viz__mode-btn--active', d.key === m); });
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