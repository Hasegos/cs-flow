/**
 * Copy-on-Write(COW) 시각화
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
    var root    = el('div', 'cow-viz');
    var toolbar = el('div', 'cow-viz__toolbar');
    var tbLeft  = el('div', 'cow-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'cow-viz__title', 'COPY ON WRITE'));

    var modeWrap = el('div', 'cow-viz__mode');
    var modeDefs = [
        { key: 'fork', label: 'fork 직후 공유' },
        { key: 'write', label: '쓰기 시 복사' },
        { key: 'exec', label: 'fork 뒤 exec' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'cow-viz__mode-btn' + (i === 0 ? ' cow-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'cow-viz__speed');
    speedWrap.appendChild(el('span', 'cow-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'cow-viz__speed-btn' + (i === 0 ? ' cow-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'cow-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'cow-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'cow-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'cow-viz__controls');
    var btnPlay  = el('button', 'cow-viz__btn cow-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'cow-viz__btn', '▶| STEP');
    var btnReset = el('button', 'cow-viz__btn', '↺ RESET');
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
    var mode    = 'fork';
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

    /* ===================== 데이터: 페이지 상태 모델 ===================== */
    var NP = 4;
    function cloneSt(s) { return JSON.parse(JSON.stringify(s)); }
    function baseState() {
        var par = [];
        for (var i = 0; i < NP; i++) par.push({ f: i, w: true });
        return { par: par, chi: null, nf: NP, copied: 0 };
    }
    function refs(s, f) {
        var n = s.par.filter(function (p) { return p.f === f; }).length;
        if (s.chi) n += s.chi.filter(function (p) { return p.f === f; }).length;
        return n;
    }
    function framesUsed(s) {
        var seen = {};
        s.par.forEach(function (p) { seen[p.f] = true; });
        if (s.chi) s.chi.forEach(function (p) { seen[p.f] = true; });
        return Object.keys(seen).length;
    }
    function forkEager(s) {
        var n = cloneSt(s);
        n.chi = [];
        for (var i = 0; i < NP; i++) n.chi.push({ f: n.nf++, w: true });
        n.copied += NP;
        return n;
    }
    function forkCow(s) {
        var n = cloneSt(s);
        n.par.forEach(function (p) { p.w = false; });
        n.chi = n.par.map(function (p) { return { f: p.f, w: false }; });
        return n;
    }
    function writePage(s, who, i) {
        var n = cloneSt(s);
        var c = (who === 'c' ? n.chi : n.par)[i];
        if (refs(n, c.f) > 1) {
            c.f = n.nf++;
            n.copied++;
        }
        c.w = true;
        return n;
    }

    var S_BASE  = baseState();
    var S_EAGER = forkEager(S_BASE);
    var S_COW   = forkCow(S_BASE);
    var S_WRITE = writePage(S_COW, 'c', 2);
    var S_PWRITE = writePage(S_WRITE, 'p', 2);
    var PG = 2;

    /* ===================== 데이터: fork 직후 공유 ===================== */
    var FORK_STEPS = [
        { st: S_BASE, who: 'p', log: '부모 프로세스의 페이지 ' + NP + '개가 물리 프레임 ' + NP + '개에 매핑돼 있습니다. 여기서 fork로 자식을 만듭니다.' },
        { st: S_EAGER, who: 'pc', log: '모두 복사하는 fork — 부모의 페이지 ' + NP + '개를 새 프레임에 전부 복사합니다. 프레임 ' + framesUsed(S_EAGER) + '개를 쓰고 복사한 페이지는 ' + S_EAGER.copied + '개입니다.' },
        { st: S_COW, who: 'pc', log: 'COW fork — 자식은 부모와 같은 프레임을 가리키는 페이지 테이블만 갖고, 양쪽 페이지를 모두 읽기 전용으로 바꿉니다. 프레임은 ' + framesUsed(S_COW) + '개 그대로이고 복사한 페이지는 ' + S_COW.copied + '개입니다.' },
        { st: S_COW, who: 'pc', cmp: true, log: '같은 fork의 결과 — 모두 복사하면 프레임 ' + framesUsed(S_EAGER) + '개·복사 ' + S_EAGER.copied + '개, COW는 프레임 ' + framesUsed(S_COW) + '개·복사 ' + S_COW.copied + '개입니다. 페이지 테이블 복제 비용은 COW에도 남습니다.' },
        { st: S_COW, who: 'pc', cmp: true, log: '정리 — COW는 fork 시점에 메모리를 복사하지 않고 공유합니다. 실제로 쓰는 시점까지 복사를 미루기 때문에 fork가 빠르고 메모리를 아낍니다.' }
    ];

    /* ===================== 데이터: 쓰기 시 복사 ===================== */
    var WRITE_STEPS = [
        { st: S_COW, who: 'pc', log: 'fork 직후 — 부모와 자식이 같은 프레임 ' + NP + '개를 읽기 전용으로 공유합니다. 각 프레임을 가리키는 페이지는 2개씩입니다.' },
        { st: S_COW, who: 'pc', hl: { w: 'c', i: PG, k: 'read' }, log: '자식이 페이지 P' + PG + '를 읽습니다. 읽기는 읽기 전용 페이지에서도 가능하므로 아무것도 복사하지 않습니다.' },
        { st: S_COW, who: 'pc', hl: { w: 'c', i: PG, k: 'fault' }, log: '자식이 P' + PG + '에 씁니다. 읽기 전용 페이지에 쓰려 하므로 페이지 폴트가 발생하고 커널이 개입합니다.' },
        { st: S_WRITE, who: 'pc', hl: { w: 'c', i: PG, k: 'copy' }, log: '커널이 P' + PG + '의 프레임만 새 프레임(F' + S_WRITE.chi[PG].f + ')에 복사해 자식의 P' + PG + '가 가리키게 하고 쓰기를 허용합니다. 복사한 페이지는 ' + S_WRITE.copied + '개입니다.' },
        { st: S_WRITE, who: 'pc', hl: { w: 'c', i: PG, k: 'copy' }, log: '부모의 P' + PG + ' 데이터는 그대로입니다. 프레임 ' + framesUsed(S_WRITE) + '개를 쓰고, 나머지 ' + (NP - 1) + '개 페이지는 계속 공유합니다.' },
        { st: S_PWRITE, who: 'pc', hl: { w: 'p', i: PG, k: 'own' }, log: '이제 F' + S_WRITE.par[PG].f + '를 가리키는 페이지는 부모 것 하나뿐이므로, 부모가 P' + PG + '에 쓸 때는 복사 없이 쓰기만 허용하면 됩니다. 복사한 페이지는 여전히 ' + S_PWRITE.copied + '개입니다.' },
        { st: S_PWRITE, who: 'pc', log: '정리 — 쓰는 순간 그 페이지만 복사하므로 쓰지 않는 페이지는 끝까지 공유됩니다. 쓰기가 많은 프로세스일수록 복사가 늘어 COW의 이득이 줄어듭니다.' }
    ];

    /* ===================== 데이터: fork 뒤 exec ===================== */
    var PAGES = 1000;
    var EXEC_STEPS = [
        { k: 0, log: '자식이 fork 직후 곧바로 exec으로 다른 프로그램을 실행하는 흔한 패턴입니다. 부모 메모리를 페이지 ' + PAGES + '개로 가정합니다(설명용 값).' },
        { k: 1, log: '모두 복사하는 fork — 페이지 ' + PAGES + '개를 복사합니다.' },
        { k: 2, log: '자식이 exec을 호출하면 방금 복사한 메모리가 새 프로그램으로 교체되어 버려집니다. 복사한 ' + PAGES + '개가 쓰이지 못하고 낭비됩니다.' },
        { k: 3, log: 'COW fork — 페이지는 복사하지 않고 공유만 합니다. exec이 메모리를 교체해도 버려진 복사가 없습니다. 복사한 페이지는 0개입니다.' },
        { k: 3, log: '정리 — fork 직후 exec 패턴에서 COW는 곧 교체될 메모리를 복사하는 낭비를 없앱니다. 페이지 테이블 복제 비용은 남습니다.' }
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'write') return WRITE_STEPS;
        if (mode === 'exec') return EXEC_STEPS;
        return FORK_STEPS;
    }
    function defaultLog() {
        if (mode === 'write') return '쓰기가 일어나는 순간에만 그 페이지가 복사되는 과정을 봅니다.';
        if (mode === 'exec') return 'fork 직후 exec을 호출하는 흔한 패턴에서 복사가 얼마나 낭비되는지 봅니다.';
        return 'fork 직후 부모와 자식이 메모리를 어떻게 나누는지 모두 복사와 COW를 비교합니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        return { fs: mob ? 11 : 12, total: mode === 'exec' ? (mob ? 232 : 240) : (mob ? 316 : 310) };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    function maxFrames() {
        var m = NP;
        currentSteps().forEach(function (s) { if (s.st) m = Math.max(m, s.st.nf); });
        return m;
    }

    /* ===================== 페이지 테이블과 프레임 ===================== */
    function drawPages(x0, top, w, mob, s, p, e, fs) {
        var st = s.st, pst = p.st;
        var hl = s.hl;
        var q = ez(e);
        var lw = mob ? 40 : 56;
        var cw = Math.min(76, (w - lw - 12) / NP - 4);
        var ch = 38;
        var yP = top + 10, yF = top + 112, yC = top + 200;
        var nF = maxFrames();
        var fcw = Math.min(70, (w - 2) / nF - 4);
        var fx = function (f) { return x0 + f * (fcw + 4) + fcw / 2; };
        var ptx = x0 + lw;
        var ptcx = function (i) { return ptx + i * (cw + 4) + cw / 2; };
        var prevPte = function (who, i) {
            if (who === 'c') return pst.chi ? pst.chi[i] : (pst.par ? pst.par[i] : null);
            return pst.par ? pst.par[i] : null;
        };
        var k, i;

        /* 연결선 */
        function line(pt, i2, who) {
            var up = who === 'p';
            var pp = prevPte(who, i2);
            var newChild = who === 'c' && !pst.chi;
            var a = newChild ? clamp01(e * 2) : 1;
            var f0 = pp ? pp.f : pt.f;
            var xf = lerp(fx(f0), fx(pt.f), q);
            var shared = refs(st, pt.f) > 1;
            var col = shared ? P.teal : (up ? P.orange : P.purple);
            var yy = up ? yP : yC;
            ctx.globalAlpha = a;
            ln(ptcx(i2), up ? yy + ch : yy, xf, up ? yF : yF + 40, col + 'bb', shared ? 1.4 : 2);
            ctx.globalAlpha = 1;
        }
        st.par.forEach(function (pt, i2) { line(pt, i2, 'p'); });
        if (st.chi) st.chi.forEach(function (pt, i2) { line(pt, i2, 'c'); });

        /* 페이지 테이블 */
        function pt(who, ptes, y, name, col) {
            var newRow = who === 'c' && !pst.chi;
            var a = ptes ? (newRow ? clamp01(e * 2) : 1) : 1;
            tx(name, x0, y + ch / 2, fs, ptes ? col + 'ff' : P.sub + 'ff', 'left', true);
            for (var j = 0; j < NP; j++) {
                var cx = ptx + j * (cw + 4);
                var pte = ptes ? ptes[j] : null;
                var pp = ptes ? prevPte(who, j) : null;
                var hot = hl && hl.w === who && hl.i === j;
                var hcol = hot ? (hl.k === 'fault' ? P.red : (hl.k === 'read' ? P.green : P.yellow)) : col;
                var shake = hot && hl.k === 'fault' && e < 1 ? Math.sin(e * 44) * 3 * (1 - e) : 0;
                var flip = pte && pp && pte.w !== pp.w && e < 1;
                var oy = newRow ? (1 - a) * -26 : 0;
                ctx.globalAlpha = pte ? a : 1;
                rr(cx + shake, y + oy, cw, ch, 5, pte ? hcol + (hot ? '40' : '22') : 'none', pte ? (flip ? P.yellow : hcol) + (hot || flip ? 'ff' : 'cc') : P.sub + '55', hot || flip ? 2.4 : 1.3);
                if (pte) {
                    tx('P' + j, cx + cw / 2 + shake, y + oy + 12, fs, P.text + 'ff', 'center', true);
                    tx(pte.w ? (mob ? '쓰기' : '쓰기 가능') : (mob ? '읽기' : '읽기 전용'), cx + cw / 2 + shake, y + oy + ch - 10, fs - 2.5, pte.w ? P.green + 'ff' : P.sub + 'ff', 'center', false);
                }
                ctx.globalAlpha = 1;
                if (hot && hl.k === 'read' && e < 1) circ(cx + cw / 2, y + ch / 2, 8 + e * 34, 'none', P.green + 'ff', 2);
                if (hot && hl.k === 'copy' && e < 1) circ(cx + cw / 2, y + ch / 2, 8 + e * 34, 'none', P.yellow + 'ff', 2);
            }
        }
        pt('p', st.par, yP, '부모', P.orange);
        pt('c', st.chi, yC, '자식', P.purple);

        /* 물리 프레임 */
        tx('물리 프레임', x0, yF - 8, fs - 1, P.sub + 'ff', 'left', false);
        for (var f = 0; f < nF; f++) {
            var rc = refs(st, f);
            var used = rc > 0;
            var prc = pst ? refs(pst, f) : rc;
            var isNew = used && prc === 0;
            var bx = x0 + f * (fcw + 4);
            rr(bx, yF, fcw, 40, 5, 'none', P.sub + '44', 1.2);
            if (!used) continue;
            var a2 = isNew ? clamp01((e - 0.45) / 0.4) : 1;
            ctx.globalAlpha = a2;
            rr(bx, yF, fcw, 40, 5, rc > 1 ? P.teal + '24' : P.sub + '22', rc > 1 ? P.teal + 'ff' : P.sub + 'ff', 1.4);
            tx('F' + f, bx + fcw / 2, yF + 14, fs, P.text + 'ff', 'center', true);
            tx(rc > 1 ? (fcw < 44 ? '×' + rc : '공유 ×' + rc) : '전용', bx + fcw / 2, yF + 29, fs - 2.5, rc > 1 ? P.teal + 'ff' : P.sub + 'ff', 'center', false);
            ctx.globalAlpha = 1;
            if (isNew && e < 0.9) {
                var src = f;
                ['par', 'chi'].forEach(function (key) {
                    if (!st[key]) return;
                    st[key].forEach(function (ptn, ii) {
                        if (ptn.f === f) {
                            var pv = key === 'chi' ? (pst.chi ? pst.chi[ii] : null) : pst.par[ii];
                            if (pv) src = pv.f;
                            else if (key === 'chi') src = st.par[ii].f;
                        }
                    });
                });
                var cq = clamp01((e - 0.1 - (f % NP) * 0.04) / 0.5);
                if (cq > 0 && cq < 1) {
                    var cxm = lerp(fx(src), fx(f), cq);
                    var cym = yF + 20 - Math.sin(cq * Math.PI) * 16;
                    rr(cxm - 9, cym - 9, 18, 18, 4, P.yellow + '66', P.yellow + 'ff', 1.8);
                    tx('복사', cxm, cym - 22, fs - 3, P.yellow + 'ff', 'center', true);
                }
            }
        }
        var cy = yC + ch + 28;
        var shownCopied = Math.round(lerp(pst.copied, st.copied, e >= 0.8 ? 1 : 0));
        tx(mob ? '프레임 ' + framesUsed(st) + '개 · 복사 ' + shownCopied + '개' : '사용 프레임 ' + framesUsed(st) + '개   복사한 페이지 ' + shownCopied + '개', x0, cy, fs + 0.5, P.text + 'ff', 'left', true);
        if (s.cmp) {
            ctx.globalAlpha = p.cmp ? 1 : clamp01(e * 2);
            tx('모두 복사: 프레임 ' + framesUsed(S_EAGER) + '개 · 복사 ' + S_EAGER.copied + '개', x0, cy + 22, fs - 0.5, P.red + 'ff', 'left', true);
            ctx.globalAlpha = 1;
        }
        if (hl && hl.k === 'fault') {
            ctx.globalAlpha = e < 0.3 ? e / 0.3 : 1;
            tx(mob ? '폴트 → 커널 개입' : '페이지 폴트 → 커널 개입', x0 + w, cy, fs - 0.5, P.red + 'ff', 'right', true);
            ctx.globalAlpha = 1;
        }
    }

    /* ===================== fork 뒤 exec ===================== */
    function drawExec(x0, top, w, mob, s, p, e, fs) {
        var k = s.k, pk = p.k;
        var bh = mob ? 30 : 34;
        tx('부모 메모리 ' + PAGES + '페이지 가정', x0, top + 10, fs - 0.5, P.sub + 'ff', 'left', false);
        var rows = [
            [1, '모두 복사하는 fork', PAGES, P.orange, top + 46],
            [3, 'COW fork', 0, P.teal, top + 46 + bh + 64]
        ];
        rows.forEach(function (row) {
            var on = k >= row[0];
            var y = row[4];
            tx(row[1], x0, y - 8, fs, on ? P.text + 'ff' : P.sub + 'ff', 'left', true);
            rr(x0, y + 4, w - 2, bh, 4, 'none', P.sub + '55', 1);
            if (!on) return;
            var fresh = pk < row[0];
            var g = fresh ? ez(e) : 1;
            var bw = w - 2;
            if (row[2] > 0) rr(x0, y + 4, bw * g, bh, 4, row[3] + '30', row[3] + 'ff', 1.5);
            if (row[0] === 1 && k >= 2) {
                var g2 = pk >= 2 ? 1 : ez(e);
                rr(x0, y + 4, bw * g2, bh, 4, P.red + '40', P.red + 'ff', 1.6);
            }
            if (!fresh || e > 0.2) tx('fork 때 복사 ' + Math.round(row[2] * g) + '개', x0 + 8, y + 4 + bh / 2, fs - 0.5, row[0] === 1 && k >= 2 && pk >= 2 ? P.red + 'ff' : row[3] + 'ff', 'left', true);
            if (row[0] === 1 && k >= 2) {
                ctx.globalAlpha = pk >= 2 ? 1 : clamp01((e - 0.4) / 0.6);
                tx('exec이 전부 버림 → 버려진 복사 ' + PAGES + '개', x0, y + bh + 22, fs - 0.5, P.red + 'ff', 'left', true);
                ctx.globalAlpha = 1;
            }
            if (row[0] === 3) {
                ctx.globalAlpha = fresh ? clamp01((e - 0.3) / 0.7) : 1;
                tx('버려진 복사 0개', x0, y + bh + 22, fs - 0.5, P.green + 'ff', 'left', true);
                ctx.globalAlpha = 1;
            }
        });
    }

    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var e = clamp01(t);
        var s = step || (mode === 'exec' ? currentSteps()[0] : currentSteps()[0]);
        var p = prev || s;
        if (mode === 'exec') drawExec(x0, top, w, mob, s, p, e, L.fs);
        else drawPages(x0, top, w, mob, s, p, e, L.fs);
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
        speedBtns.forEach(function (b) { b.classList.remove('cow-viz__speed-btn--active'); });
        btn.classList.add('cow-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('cow-viz__mode-btn--active', d.key === m); });
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