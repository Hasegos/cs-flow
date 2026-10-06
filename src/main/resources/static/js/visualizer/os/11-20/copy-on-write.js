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
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

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
    var mode    = 'fork';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'write') return WRITE_STEPS;
        if (mode === 'exec') return EXEC_STEPS;
        return FORK_STEPS;
    }

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

    /* ===================== 공통: 선과 페이지 테이블 그리기 ===================== */
    function ln(x1, y1, x2, y2, col, lw) {
        ctx.strokeStyle = col;
        ctx.lineWidth = lw || 1.4;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    function drawPT(x, y, cw, ch, name, col, ptes, st, hl, who, fs, lw, x0) {
        tx(name, x0, y + ch / 2, fs, ptes ? col + 'ee' : P.muted + '88', 'left', true);
        for (var i = 0; i < NP; i++) {
            var cx = x + i * (cw + 4);
            var pte = ptes ? ptes[i] : null;
            var hot = hl && hl.w === who && hl.i === i;
            var hcol = hot ? (hl.k === 'fault' ? P.red : (hl.k === 'read' ? P.green : P.yellow)) : col;
            rr(cx, y, cw, ch, 5, pte ? hcol + (hot ? '40' : '22') : 'none', pte ? hcol + (hot ? 'ff' : 'cc') : P.muted + '33', hot ? 2.2 : 1.3);
            if (!pte) continue;
            tx('P' + i, cx + cw / 2, y + 12, fs, P.text + 'ee', 'center', true);
            tx(pte.w ? '쓰기 가능' : '읽기 전용', cx + cw / 2, y + ch - 10, fs - 2.5, pte.w ? P.green + 'ee' : P.muted + 'ee', 'center', false);
        }
    }

    /* ===================== 모드: fork 직후 공유 · 쓰기 시 복사 ===================== */
    function drawPages(x0, top, w, mob, step, cmpOn) {
        var fs = mob ? 10.5 : 12;
        var s = step ? step.st : S_BASE;
        var hl = step ? step.hl : null;
        var lw = mob ? 40 : 56;
        var cw = Math.min(76, (w - lw - 12) / NP - 4);
        var ch = 38;
        var yP = top + 10;
        var yF = top + 112;
        var yC = top + 200;
        var nF = Math.max(NP, s.nf);
        var fcw = Math.min(70, (w - 2) / nF - 4);
        var fx = function (f) { return x0 + f * (fcw + 4) + fcw / 2; };
        var ptx = x0 + lw;
        var ptcx = function (i) { return ptx + i * (cw + 4) + cw / 2; };

        var drawLine = function (pt, i, yy, up) {
            var shared = refs(s, pt.f) > 1;
            var col = shared ? P.teal : (up ? P.orange : P.purple);
            ln(ptcx(i), up ? yy + ch : yy, fx(pt.f), up ? yF : yF + 40, col + 'aa', shared ? 1.2 : 1.8);
        };
        s.par.forEach(function (pt, i) { drawLine(pt, i, yP, true); });
        if (s.chi) s.chi.forEach(function (pt, i) { drawLine(pt, i, yC, false); });

        drawPT(ptx, yP, cw, ch, mob ? '부모' : '부모', P.orange, s.par, s, hl, 'p', fs, lw, x0);
        drawPT(ptx, yC, cw, ch, mob ? '자식' : '자식', P.purple, s.chi, s, hl, 'c', fs, lw, x0);

        tx('물리 프레임', x0, yF - 8, fs - 1, P.muted + 'ee', 'left', false);
        for (var f = 0; f < nF; f++) {
            var used = refs(s, f) > 0;
            var rc = refs(s, f);
            var bx = x0 + f * (fcw + 4);
            rr(bx, yF, fcw, 40, 5, used ? (rc > 1 ? P.teal + '24' : P.muted + '1c') : 'none', used ? (rc > 1 ? P.teal + 'cc' : P.muted + 'aa') : P.muted + '33', 1.3);
            if (used) {
                tx('F' + f, bx + fcw / 2, yF + 14, fs, P.text + 'ee', 'center', true);
                tx(rc > 1 ? '공유 ×' + rc : '전용', bx + fcw / 2, yF + 29, fs - 2.5, rc > 1 ? P.teal + 'ee' : P.muted + 'ee', 'center', false);
            }
        }
        var cy = yC + ch + 28;
        tx(mob ? '프레임 ' + framesUsed(s) + '개 · 복사 ' + s.copied + '개' : '사용 프레임 ' + framesUsed(s) + '개   복사한 페이지 ' + s.copied + '개', x0, cy, fs + 0.5, P.text + 'ee', 'left', true);
        if (cmpOn) tx('모두 복사: 프레임 ' + framesUsed(S_EAGER) + '개 · 복사 ' + S_EAGER.copied + '개', x0, cy + 22, fs - 0.5, P.red + 'ee', 'left', true);
        if (hl && hl.k === 'fault') tx(mob ? '폴트 → 커널 개입' : '페이지 폴트 → 커널 개입', x0 + w, cy, fs - 0.5, P.red + 'ee', 'right', true);
    }

    /* ===================== 모드: fork 뒤 exec ===================== */
    function drawExec(x0, top, w, mob, step) {
        var fs = mob ? 10.5 : 12;
        var k  = step ? step.k : 0;
        var bh = mob ? 30 : 34;
        var unit = (w - 2) / (2 * PAGES);
        tx('복사한 페이지 수 (부모 메모리 ' + PAGES + '페이지 가정)', x0, top + 10, fs - 0.5, P.muted + 'ee', 'left', false);
        var rows = [
            [1, '모두 복사하는 fork', PAGES, P.orange, top + 46],
            [3, 'COW fork', 0, P.teal, top + 46 + bh + 74]
        ];
        rows.forEach(function (row) {
            var on = k >= row[0];
            var y = row[4];
            tx(row[1], x0, y - 8, fs, on ? P.text + 'ee' : P.muted + '88', 'left', true);
            rr(x0, y + 4, w - 2, bh, 4, 'none', P.muted + '33', 1);
            if (!on) return;
            if (row[2] > 0) rr(x0, y + 4, row[2] * unit, bh, 4, row[3] + '30', row[3] + 'cc', 1.5);
            tx('fork 때 복사 ' + row[2] + '개', x0 + (row[2] > 0 ? 8 : 4), y + 4 + bh / 2, fs - 0.5, row[3] + 'ee', 'left', true);
            if (row[0] === 1 && k >= 2) {
                rr(x0 + PAGES * unit, y + 4, PAGES * unit - 2, bh, 4, P.red + '26', P.red + 'cc', 1.5);
                tx('exec으로 버려짐 ' + PAGES + '개', x0 + PAGES * unit + 8, y + 4 + bh / 2, fs - 0.5, P.red + 'ee', 'left', true);
            }
            if (row[0] === 3) tx('버려진 복사 0개', x0, y + bh + 24, fs, P.green + 'ee', 'left', true);
        });
        if (k >= 2) tx('버려진 복사 ' + PAGES + '개', x0, top + 46 + bh + 28, fs, P.red + 'ee', 'left', true);
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        var W = GW(); var mob = W < 600;
        var padX = mob ? 16 : 26;
        var fullW = W - padX * 2;
        var top = mob ? 18 : 26;

        var steps = currentSteps();
        var step = stepIdx >= 0 ? steps[stepIdx] : null;

        if (mode === 'exec') drawExec(padX, top, fullW, mob, step);
        else if (mode === 'write') drawPages(padX, top, fullW, mob, step, false);
        else drawPages(padX, top, fullW, mob, step, !!(step && step.cmp));

        if (!step) {
            var hint = '아래 STEP으로 COW 동작을 확인하세요.';
            ctx.font = '500 ' + (mob ? 11 : 12.5) + 'px "JetBrains Mono",monospace';
            var hs = mob ? 11 : 12.5;
            var hl = [hint];
            if (ctx.measureText(hint).width > W - 16) {
                var cut = hint.indexOf(' ', Math.floor(hint.length / 2));
                if (cut < 0) cut = hint.lastIndexOf(' ');
                hl = [hint.slice(0, cut), hint.slice(cut + 1)];
            }
            hl.forEach(function (line, li) {
                tx(line, W / 2, GH() - (mob ? 12 : 14) - (hl.length - 1 - li) * (hs + 4), hs, P.muted + 'aa', 'center', false);
            });
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH;
        if (mode === 'exec') neededH = mob ? 260 : 270;
        else neededH = mob ? 330 : 340;
        canvasWrap.style.height    = 'auto';
        canvasWrap.style.minHeight = neededH + 'px';
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
        draw();
        rafId = requestAnimationFrame(function () { rafId = null; if (onDone) onDone(); });
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) { speedBtns.forEach(function (b) { b.disabled = v; }); }
    function defaultLog() {
        if (mode === 'exec') return 'fork 직후 exec을 호출하는 패턴에서 COW가 어떤 낭비를 없애는지 봅니다.';
        if (mode === 'write') return '공유 중인 페이지에 쓰는 순간 그 페이지만 복사되는 과정을 봅니다.';
        return 'fork 때 메모리를 모두 복사하는 방식과 COW로 공유하는 방식을 비교합니다.';
    }

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
        running = false; stepIdx = -1;
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