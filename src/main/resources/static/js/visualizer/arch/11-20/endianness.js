/**
 * 엔디언(빅/리틀) 시각화
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
    var root    = el('div', 'end-viz');
    var toolbar = el('div', 'end-viz__toolbar');
    var tbLeft  = el('div', 'end-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'end-viz__title', 'BYTE ORDER'));

    var modeWrap = el('div', 'end-viz__mode');
    var modeDefs = [
        { key: 'store', label: '바이트 저장 순서' },
        { key: 'net', label: '네트워크 바이트 순서' },
        { key: 'read', label: '같은 바이트 다른 값' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'end-viz__mode-btn' + (i === 0 ? ' end-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'end-viz__speed');
    speedWrap.appendChild(el('span', 'end-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'end-viz__speed-btn' + (i === 0 ? ' end-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'end-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'end-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'end-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'end-viz__controls');
    var btnPlay  = el('button', 'end-viz__btn end-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'end-viz__btn', '▶| STEP');
    var btnReset = el('button', 'end-viz__btn', '↺ RESET');
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

    /* ===================== 데이터: 공통 ===================== */
    var BYTES = [0x12, 0x34, 0x56, 0x78];
    var VAL   = 0x12345678;
    var BASE  = 0x1000;
    function hx(n, d) {
        var s = n.toString(16).toUpperCase();
        while (s.length < d) s = '0' + s;
        return s;
    }
    function valOf(mem, n, little) {
        var v = 0;
        for (var i = 0; i < n; i++) v = v * 256 + (little ? mem[n - 1 - i] : mem[i]);
        return v;
    }
    function memBig() { return BYTES.slice(); }
    function memLittle() { return BYTES.slice().reverse(); }

    /* ===================== 데이터: 바이트 저장 순서 ===================== */
    var STORE_STEPS = [
        { big: false, little: false, log: '32비트 값 0x' + hx(VAL, 8) + '는 바이트 ' + BYTES.length + '개(' + BYTES.map(function (b) { return hx(b, 2); }).join(' ') + ')로 이뤄집니다. 왼쪽 12가 가장 큰 자릿수(MSB) 바이트, 오른쪽 78이 가장 작은 자릿수(LSB) 바이트입니다.' },
        { big: true, little: false, log: '빅 엔디언 — 가장 큰 자릿수 바이트를 가장 낮은 주소(0x' + hx(BASE, 4) + ')에 먼저 저장합니다. 메모리를 낮은 주소부터 읽으면 ' + memBig().map(function (b) { return hx(b, 2); }).join(' ') + ' 순서로 값을 쓴 모양 그대로 보입니다.' },
        { big: true, little: true, log: '리틀 엔디언 — 가장 작은 자릿수 바이트를 가장 낮은 주소(0x' + hx(BASE, 4) + ')에 먼저 저장합니다. 낮은 주소부터 ' + memLittle().map(function (b) { return hx(b, 2); }).join(' ') + ' 순서가 됩니다. x86과 x86-64가 이 방식입니다.' },
        { big: true, little: true, log: '값은 같고 바이트가 놓이는 순서만 다릅니다. 순서가 바뀌는 단위는 바이트이고, 바이트 안의 비트 모양은 그대로입니다.' },
        { big: true, little: true, log: '정리 — 엔디언은 여러 바이트로 이뤄진 값을 메모리에 놓는 순서의 약속입니다. 한 바이트짜리 값에는 순서가 없으므로 영향이 없습니다.' }
    ];

    /* ===================== 데이터: 네트워크 바이트 순서 ===================== */
    var HI = 0x12;
    var LO = 0x34;
    var HOST_MEM = [LO, HI];
    var NET_ORDER = [HI, LO];
    var RAW_AS_BIG = valOf(HOST_MEM, 2, false);
    var GOOD_VAL = valOf(NET_ORDER, 2, false);

    var NET_STEPS = [
        { s: null, w: null, r: null, log: '16비트 값 0x' + hx(GOOD_VAL, 4) + '를 네트워크로 보냅니다. 송신 호스트는 리틀 엔디언, 수신 호스트는 빅 엔디언이라고 가정합니다(변환의 필요를 보이기 위한 예입니다).' },
        { s: HOST_MEM, w: null, r: null, log: '송신 호스트 메모리 — 리틀 엔디언이라 낮은 주소부터 ' + HOST_MEM.map(function (b) { return hx(b, 2); }).join(' ') + ' 순서로 놓입니다.' },
        { s: HOST_MEM, w: HOST_MEM, r: RAW_AS_BIG, bad: true, log: '변환 없이 메모리 바이트를 그대로 보내면 ' + HOST_MEM.map(function (b) { return hx(b, 2); }).join(' ') + ' 순서로 전송됩니다. 빅 엔디언 수신자는 먼저 온 바이트를 큰 자릿수로 읽어 0x' + hx(RAW_AS_BIG, 4) + '(' + RAW_AS_BIG + ')를 얻습니다. 값이 달라졌습니다.' },
        { s: HOST_MEM, w: NET_ORDER, r: null, c1: true, log: '그래서 전송 전에 htons로 호스트 순서를 네트워크 바이트 순서(빅 엔디언)로 바꿉니다. 큰 자릿수 바이트가 먼저 나가 ' + NET_ORDER.map(function (b) { return hx(b, 2); }).join(' ') + ' 순서가 됩니다.' },
        { s: HOST_MEM, w: NET_ORDER, r: GOOD_VAL, c1: true, c2: true, log: '수신 호스트는 ntohs로 네트워크 순서를 자기 호스트 순서로 되돌려 0x' + hx(GOOD_VAL, 4) + '(' + GOOD_VAL + ')를 얻습니다. 호스트의 엔디언이 달라도 같은 값이 됩니다.' },
        { s: HOST_MEM, w: NET_ORDER, r: GOOD_VAL, c1: true, c2: true, log: '정리 — 통신 양쪽이 같은 순서를 쓰도록 네트워크 바이트 순서를 빅 엔디언으로 정했고, 호스트와 네트워크 사이에서 htons/htonl, ntohs/ntohl로 변환합니다.' }
    ];

    /* ===================== 데이터: 같은 바이트 다른 값 ===================== */
    var READ_STEPS = [
        { n: 0, log: '메모리 낮은 주소부터 ' + BYTES.map(function (b) { return hx(b, 2); }).join(' ') + ' 네 바이트가 놓여 있습니다. 이 바이트를 정수로 읽을 때 CPU의 엔디언이 값을 정합니다.' },
        { n: 1, log: '1바이트로 읽으면 0x' + hx(valOf(BYTES, 1, true), 2) + '로 어느 엔디언이든 같습니다. 바이트 하나에는 순서가 없기 때문입니다.' },
        { n: 2, log: '16비트로 읽으면 빅 엔디언은 0x' + hx(valOf(BYTES, 2, false), 4) + ', 리틀 엔디언은 0x' + hx(valOf(BYTES, 2, true), 4) + '입니다. 먼저 나오는 바이트를 큰 자릿수로 보느냐 작은 자릿수로 보느냐의 차이입니다.' },
        { n: 4, log: '32비트로 읽으면 빅 엔디언은 0x' + hx(valOf(BYTES, 4, false), 8) + ', 리틀 엔디언은 0x' + hx(valOf(BYTES, 4, true), 8) + '입니다. 같은 네 바이트가 전혀 다른 값이 됩니다.' },
        { n: 4, log: '정리 — 파일이나 네트워크로 여러 바이트 정수를 주고받을 때는 양쪽이 같은 바이트 순서를 쓰기로 약속해야 합니다.' }
    ];

    /* ===================== 상태 ===================== */
    var mode    = 'store';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'net') return NET_STEPS;
        if (mode === 'read') return READ_STEPS;
        return STORE_STEPS;
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

    /* ===================== 공통: 바이트 칸 ===================== */
    function byteCol(i) { return [P.orange, P.purple, P.teal, P.green][i]; }

    function byteCells(x, y, cw, ch, vals, colOf, fs, hlFirst, mob) {
        vals.forEach(function (b, i) {
            var col = colOf(b, i);
            var hl = hlFirst && i === 0;
            rr(x + i * cw + 1, y, cw - 2, ch, 5, col + (hl ? '40' : '26'), col + (hl ? 'ff' : 'cc'), hl ? 2.4 : 1.5);
            tx(hx(b, 2), x + i * cw + cw / 2, y + ch / 2, fs + 1, col + 'ee', 'center', true);
        });
    }

    /* ===================== 모드: 바이트 저장 순서 ===================== */
    function drawStore(x0, top, w, mob, step) {
        var fs = mob ? 10.5 : 12;
        var big = step ? step.big : false;
        var little = step ? step.little : false;
        var lw = mob ? 92 : 118;
        var cw = Math.min(72, (w - lw) / 4);
        var ch = mob ? 34 : 40;
        var bx = x0 + lw;
        var yV = top + 14;
        var yB = yV + ch + 54;
        var yL = yB + ch + 54;
        var byIdx = function (b) { return byteCol(BYTES.indexOf(b)); };

        tx('값 0x' + hx(VAL, 8), x0, yV + ch / 2, fs, P.text + 'ee', 'left', true);
        byteCells(bx, yV, cw, ch, BYTES, byIdx, fs, false, mob);
        tx('MSB', bx + cw / 2, yV - 8, fs - 2, P.muted + 'dd', 'center', false);
        tx('LSB', bx + cw * 3.5, yV - 8, fs - 2, P.muted + 'dd', 'center', false);

        [[big, yB, '빅 엔디언', memBig()], [little, yL, '리틀 엔디언', memLittle()]].forEach(function (row) {
            var on = row[0];
            var y = row[1];
            tx(row[2], x0, y + ch / 2, fs, on ? P.text + 'ee' : P.muted + '77', 'left', true);
            if (on) {
                byteCells(bx, y, cw, ch, row[3], byIdx, fs, true, mob);
                for (var i = 0; i < 4; i++) tx(mob ? '+' + i : '0x' + hx(BASE + i, 4), bx + i * cw + cw / 2, y + ch + 12, fs - 2, P.muted + 'dd', 'center', false);
            } else {
                for (var j = 0; j < 4; j++) rr(bx + j * cw + 1, y, cw - 2, ch, 5, 'none', P.muted + '33', 1);
            }
        });
        tx('낮은 주소', bx, yL + ch + 32, fs - 1.5, P.muted + 'dd', 'left', false);
        tx('높은 주소', bx + 4 * cw, yL + ch + 32, fs - 1.5, P.muted + 'dd', 'right', false);
    }

    /* ===================== 모드: 네트워크 바이트 순서 ===================== */
    function drawNet(x0, top, w, mob, step) {
        var fs = mob ? 10.5 : 12;
        var s = step ? step.s : null;
        var wv = step ? step.w : null;
        var r = step ? step.r : null;
        var bad = step ? !!step.bad : false;
        var c1 = step ? !!step.c1 : false;
        var c2 = step ? !!step.c2 : false;
        var cw = mob ? 52 : 64;
        var ch = mob ? 32 : 38;
        var rowGap = mob ? 92 : 98;
        var colOf = function (b) { return b === HI ? P.orange : P.purple; };
        var rows = [
            [top + 10, mob ? '송신 호스트(리틀) 메모리' : '송신 호스트(리틀 엔디언) 메모리', s],
            [top + 10 + rowGap, '네트워크로 나가는 순서', wv]
        ];
        rows.forEach(function (row) {
            tx(row[1], x0, row[0], fs, row[2] ? P.text + 'ee' : P.muted + '88', 'left', true);
            if (row[2]) byteCells(x0, row[0] + 14, cw, ch, row[2], colOf, fs, false, mob);
            else for (var i = 0; i < 2; i++) rr(x0 + i * cw + 1, row[0] + 14, cw - 2, ch, 5, 'none', P.muted + '33', 1);
        });
        if (c1) tx('htons — 호스트 순서를 빅 엔디언으로 변환', x0 + 2 * cw + 14, top + 10 + 14 + ch + 22, fs - 0.5, P.yellow + 'ee', 'left', true);
        var y3 = top + 10 + 2 * rowGap;
        tx(mob ? '빅 엔디언 수신자가 읽은 값' : '빅 엔디언 수신 호스트가 읽은 값', x0, y3, fs, r !== null ? P.text + 'ee' : P.muted + '88', 'left', true);
        var vcol = bad ? P.red : P.green;
        if (r !== null) {
            rr(x0, y3 + 14, Math.min(w, 2 * cw + 150), ch, 5, vcol + '26', vcol + 'cc', 1.6);
            tx('0x' + hx(r, 4) + ' (' + r + ')' + (bad ? '  값이 달라짐' : ''), x0 + 12, y3 + 14 + ch / 2, fs + 0.5, vcol + 'ee', 'left', true);
        } else {
            rr(x0, y3 + 14, Math.min(w, 2 * cw + 150), ch, 5, 'none', P.muted + '33', 1);
        }
        if (c2) tx('ntohs — 네트워크 순서를 호스트 순서로 변환', x0 + 2 * cw + 14, top + 10 + rowGap + 14 + ch + 22, fs - 0.5, P.yellow + 'ee', 'left', true);
    }

    /* ===================== 모드: 같은 바이트 다른 값 ===================== */
    function drawRead(x0, top, w, mob, step) {
        var fs = mob ? 10.5 : 12;
        var n = step ? step.n : 0;
        var lw = mob ? 58 : 84;
        var cw = Math.min(72, (w - lw) / 4);
        var ch = mob ? 34 : 40;
        var bx = x0 + lw;
        var yM = top + 18;
        tx('메모리', x0, yM + ch / 2, fs, P.text + 'ee', 'left', true);
        BYTES.forEach(function (b, i) {
            var col = byteCol(i);
            var on = i < n;
            rr(bx + i * cw + 1, yM, cw - 2, ch, 5, col + (on ? '40' : '22'), col + (on ? 'ff' : 'aa'), on ? 2.4 : 1.4);
            tx(hx(b, 2), bx + i * cw + cw / 2, yM + ch / 2, fs + 1, col + 'ee', 'center', true);
            tx(mob ? '+' + i : '0x' + hx(BASE + i, 4), bx + i * cw + cw / 2, yM + ch + 12, fs - 2, P.muted + 'dd', 'center', false);
        });
        var results = [['빅 엔디언 CPU', false, P.teal], ['리틀 엔디언 CPU', true, P.orange]];
        results.forEach(function (res, ri) {
            var y = yM + ch + 44 + ri * (ch + 22);
            tx(res[0], x0, y - 10, fs - 0.5, n ? res[2] + 'ee' : P.muted + '88', 'left', true);
            rr(x0, y, w, ch, 5, n ? res[2] + '26' : 'none', n ? res[2] + 'cc' : P.muted + '33', 1.5);
            if (n) tx(n * 8 + '비트로 읽은 값  0x' + hx(valOf(BYTES, n, res[1]), n * 2), x0 + 12, y + ch / 2, fs + 0.5, res[2] + 'ee', 'left', true);
        });
        if (n === 1) tx('두 CPU의 값이 같음', x0 + w, yM + ch + 34, fs - 0.5, P.green + 'ee', 'right', true);
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

        if (mode === 'net') drawNet(padX, top, fullW, mob, step);
        else if (mode === 'read') drawRead(padX, top, fullW, mob, step);
        else drawStore(padX, top, fullW, mob, step);

        if (!step) {
            var hint = '아래 STEP으로 두 방식의 차이를 확인하세요.';
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
        if (mode === 'net') neededH = mob ? 330 : 340;
        else if (mode === 'read') neededH = mob ? 270 : 280;
        else neededH = mob ? 322 : 332;
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
        if (mode === 'net') return '리틀 엔디언 호스트가 빅 엔디언 네트워크 바이트 순서로 값을 보낼 때 일어나는 변환을 봅니다.';
        if (mode === 'read') return '메모리의 같은 바이트를 엔디언이 다른 CPU가 정수로 읽으면 어떤 값이 되는지 봅니다.';
        return '32비트 값을 메모리에 놓는 순서가 빅 엔디언과 리틀 엔디언에서 어떻게 다른지 봅니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('end-viz__speed-btn--active'); });
        btn.classList.add('end-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('end-viz__mode-btn--active', d.key === m); });
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