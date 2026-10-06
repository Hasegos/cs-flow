/**
 * 비트 조작 트릭 시각화
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
    var root    = el('div', 'bit-viz');
    var toolbar = el('div', 'bit-viz__toolbar');
    var tbLeft  = el('div', 'bit-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'bit-viz__title', 'BIT MANIPULATION'));

    var modeWrap = el('div', 'bit-viz__mode');
    var modeDefs = [
        { key: 'ops', label: '비트 연산자' },
        { key: 'trick', label: 'n & (n-1) 트릭' },
        { key: 'mask', label: '비트마스크 집합' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'bit-viz__mode-btn' + (i === 0 ? ' bit-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'bit-viz__speed');
    speedWrap.appendChild(el('span', 'bit-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'bit-viz__speed-btn' + (i === 0 ? ' bit-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'bit-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'bit-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'bit-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'bit-viz__controls');
    var btnPlay  = el('button', 'bit-viz__btn bit-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'bit-viz__btn', '▶| STEP');
    var btnReset = el('button', 'bit-viz__btn', '↺ RESET');
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

    /* ===================== 엔진: 비트 조작 ===================== */
    var NUMS = ['7', '6', '5', '4', '3', '2', '1', '0'];
    var ELEM = ['H', 'G', 'F', 'E', 'D', 'C', 'B', 'A'];
    function bin8(v) {
        var s = (v & 255).toString(2);
        while (s.length < 8) s = '0' + s;
        return s;
    }
    function rowOf(lab, v, hot, tone) {
        return { lab: lab, v: v & 255, hot: hot, tone: tone };
    }
    function bstep(hdr, rows, cap, cap2, cap3, log) {
        return { hdr: hdr, rows: rows, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }
    function bitsWhere(v, fn) {
        var out = [];
        var i;
        for (i = 0; i < 8; i++) if (fn((v >> i) & 1, i)) out.push(i);
        return out;
    }
    function elemText(mask) {
        var out = [];
        var i;
        for (i = 0; i < 8; i++) if ((mask >> i) & 1) out.push(ELEM[7 - i]);
        return out.length ? '{' + out.join(', ') + '}' : '{ } (공집합)';
    }

    /* ===================== 데이터: 비트 연산자 ===================== */
    var OPS_STEPS = [];
    (function () {
        var a = 106;
        var b = 60;
        var ra = rowOf('a', a, [], 'a');
        var rb = rowOf('b', b, [], 'b');
        OPS_STEPS.push(bstep(NUMS, [ra, rb], '8비트 두 수 a = ' + a + ', b = ' + b, '비트 위치는 오른쪽이 0, 왼쪽이 7', '', '비트 연산은 정수를 이진수로 보고 각 자리를 한꺼번에 다루는 연산입니다. 8비트로 보는 두 수는 a = ' + bin8(a) + ' (' + a + '), b = ' + bin8(b) + ' (' + b + ')이고 여기에 여러 연산자를 적용해 봅니다. 오른쪽 끝이 0번 비트, 왼쪽 끝이 7번 비트입니다.'));
        function both(v1, v2, fn) {
            var o = [];
            var i;
            for (i = 0; i < 8; i++) if (fn((v1 >> i) & 1, (v2 >> i) & 1)) o.push(i);
            return o;
        }
        var and = a & b;
        OPS_STEPS.push(bstep(NUMS, [ra, rb, rowOf('a & b', and, both(a, b, function (x, y) { return x && y; }), 'r')], 'AND: 둘 다 1인 자리만 1', 'a & b = ' + and, '', 'AND(&)는 두 수의 같은 자리가 모두 1일 때만 그 자리를 1로 만듭니다. ' + bin8(a) + ' & ' + bin8(b) + ' = ' + bin8(and) + ' (' + and + ')입니다. 원하는 비트만 남기는 마스킹에 씁니다.'));
        var or = a | b;
        OPS_STEPS.push(bstep(NUMS, [ra, rb, rowOf('a | b', or, both(a, b, function (x, y) { return x || y; }), 'r')], 'OR: 하나라도 1이면 1', 'a | b = ' + or, '', 'OR(|)는 두 수의 같은 자리 중 하나라도 1이면 그 자리를 1로 만듭니다. ' + bin8(a) + ' | ' + bin8(b) + ' = ' + bin8(or) + ' (' + or + ')입니다. 특정 비트를 켜는 데 씁니다.'));
        var xr = a ^ b;
        OPS_STEPS.push(bstep(NUMS, [ra, rb, rowOf('a ^ b', xr, both(a, b, function (x, y) { return x !== y; }), 'r')], 'XOR: 서로 다르면 1', 'a ^ b = ' + xr, '', 'XOR(^)는 두 수의 같은 자리가 서로 다를 때 1로 만듭니다. ' + bin8(a) + ' ^ ' + bin8(b) + ' = ' + bin8(xr) + ' (' + xr + ')입니다. 같은 값끼리 XOR하면 0이 되고 0과 XOR하면 그대로라는 성질이 있습니다.'));
        var sl = (a << 1) & 255;
        OPS_STEPS.push(bstep(NUMS, [ra, rowOf('a << 1', sl, [], 'r')], '왼쪽 시프트: 모든 비트를 왼쪽으로 한 칸', 'a << 1 = ' + sl + ' (2배)', '', '왼쪽 시프트(<<)는 모든 비트를 왼쪽으로 옮기고 오른쪽을 0으로 채웁니다. ' + bin8(a) + ' << 1 = ' + bin8(sl) + ' (' + sl + ')이고 값이 2배가 됩니다. 8비트를 넘는 비트는 고정 폭에서는 버려집니다.'));
        var sr = a >> 2;
        OPS_STEPS.push(bstep(NUMS, [ra, rowOf('a >> 2', sr, [], 'r')], '오른쪽 시프트: 오른쪽으로 두 칸', 'a >> 2 = ' + sr + ' (4로 나눈 몫)', '', '오른쪽 시프트(>>)는 모든 비트를 오른쪽으로 옮깁니다. ' + bin8(a) + ' >> 2 = ' + bin8(sr) + ' (' + sr + ')이고 값을 4로 나눈 몫과 같습니다. 밀려난 오른쪽 비트는 사라집니다.'));
        var nt = (~a) & 255;
        OPS_STEPS.push(bstep(NUMS, [ra, rowOf('~a', nt, bitsWhere(a, function () { return true; }), 'r')], 'NOT: 모든 비트 반전', '~a = ' + nt + ' (8비트로 본 값)', '', 'NOT(~)은 모든 비트를 뒤집습니다. 8비트로 보면 ~' + bin8(a) + ' = ' + bin8(nt) + ' (' + nt + ')입니다. 부호 있는 정수에서는 같은 비트가 음수 ' + (~a) + '로 해석되어, ~x = -x - 1이 성립합니다.'));
        OPS_STEPS.push(bstep(NUMS, [ra, rb], '연산자 여섯 가지 정리', '& | ^ ~ << >>', '', '정리 — AND는 비트를 남기고, OR은 켜고, XOR은 비교하며, NOT은 뒤집고, 시프트는 2의 거듭제곱을 곱하거나 나눕니다. 모두 정수 비트를 한 번에 처리해서 한 번의 연산으로 끝납니다. 다음 탭에서 이 연산을 조합한 대표 트릭을 봅니다.'));
    })();

    /* ===================== 데이터: n & (n-1) 트릭 ===================== */
    var TRICK_STEPS = [];
    (function () {
        function trio(n, extra) {
            var m = n - 1;
            var r = n & m;
            var chg = bitsWhere(n ^ m, function (x) { return x === 1; });
            return { rows: [rowOf('n', n, [], 'a'), rowOf('n - 1', m, chg, 'b'), rowOf('n & (n - 1)', r, [], 'r')], r: r };
        }
        TRICK_STEPS.push(bstep(NUMS, [rowOf('n', 8, [], 'a')], 'n & (n-1): 가장 낮은 1을 지움', '2의 거듭제곱 판별, 1의 개수 세기', '', 'n에서 1을 빼면 가장 낮은 자리의 1이 0이 되고 그 아래 0들이 모두 1이 됩니다. 그래서 n & (n - 1)은 n의 가장 낮은 1 하나를 지운 값입니다. 이 한 줄로 2의 거듭제곱 판별과 1의 개수 세기를 풉니다.'));
        var t8 = trio(8);
        TRICK_STEPS.push(bstep(NUMS, t8.rows, 'n = 8: 결과 0 → 2의 거듭제곱', 'n & (n - 1) = ' + t8.r, '', 'n = ' + bin8(8) + ' (8), n - 1 = ' + bin8(7) + ' (7)입니다. 1이 하나뿐이라 그것을 지우면 남는 비트가 없어서 n & (n - 1) = 0입니다. n이 양수이고 이 값이 0이면 2의 거듭제곱입니다.'));
        var t12 = trio(12);
        TRICK_STEPS.push(bstep(NUMS, t12.rows, 'n = 12: 결과 ' + t12.r + ' ≠ 0 → 아님', 'n & (n - 1) = ' + t12.r, '', 'n = ' + bin8(12) + ' (12), n - 1 = ' + bin8(11) + ' (11)입니다. 가장 낮은 1(2번 비트)만 지워져 n & (n - 1) = ' + bin8(t12.r) + ' (' + t12.r + ') 값이 남습니다. 0이 아니므로 2의 거듭제곱이 아닙니다.'));
        var n = 13;
        var cnt = 0;
        while (n) {
            var t = trio(n);
            cnt++;
            TRICK_STEPS.push(bstep(NUMS, t.rows, '1의 개수 세기: 반복 ' + cnt + '번째', 'n = ' + n + ' → ' + t.r + ', 지금까지 ' + cnt + '번', '', 'n = ' + bin8(n) + ' (' + n + ')에서 n & (n - 1) = ' + bin8(t.r) + ' (' + t.r + ')입니다. 가장 낮은 1을 하나 지웠고 지운 횟수는 ' + cnt + '번입니다.' + (t.r === 0 ? ' n이 0이 되었으니 반복을 멈춥니다.' : '')));
            n = t.r;
        }
        TRICK_STEPS.push(bstep(NUMS, [rowOf('13', 13, bitsWhere(13, function (x) { return x === 1; }), 'a')], '13의 1의 개수 = ' + cnt, '1의 개수만큼만 반복', '', '정리 — 13 = ' + bin8(13) + '에는 1이 ' + cnt + '개이고, 이 방법은 가장 낮은 1을 하나씩 지우며 ' + cnt + '번만 반복했습니다. 비트를 하나씩 모두 확인하는 방법보다 1의 개수에 비례하는 만큼만 반복합니다. 이 방법은 K&R 교재 연습 문제로 알려져 커니핸의 방법이라고도 부릅니다.'));
    })();

    /* ===================== 데이터: 비트마스크 집합 ===================== */
    var MASK_STEPS = [];
    (function () {
        var mask = 0;
        MASK_STEPS.push(bstep(ELEM, [rowOf('mask', 0, [], 'a')], '원소 A~H를 비트 하나씩에 대응', 'A는 0번 비트, H는 7번 비트', elemText(0), '비트마스크는 정수의 각 비트를 집합의 원소 하나에 대응시킵니다. 여기서는 A가 0번 비트, B가 1번 비트, …, H가 7번 비트입니다. 비트가 1이면 그 원소가 집합에 있습니다. 처음에는 모든 비트가 0인 공집합입니다.'));
        function add(i) {
            var before = mask;
            mask = mask | (1 << i);
            MASK_STEPS.push(bstep(ELEM, [rowOf('mask', before, [], 'a'), rowOf('1 << ' + i, 1 << i, [i], 'b'), rowOf('mask | (1 << ' + i + ')', mask, [i], 'r')], ELEM[7 - i] + ' 추가: mask |= 1 << ' + i, 'mask = ' + mask, elemText(mask), ELEM[7 - i] + '를 넣으려면 ' + i + '번 비트만 1인 값 1 << ' + i + ' (' + (1 << i) + ') 값과 OR합니다. mask = ' + bin8(mask) + ' (' + mask + ')입니다. 집합은 ' + elemText(mask) + '입니다.'));
        }
        function check(i) {
            var bit = (mask >> i) & 1;
            MASK_STEPS.push(bstep(ELEM, [rowOf('mask', mask, [i], 'a'), rowOf('1 << ' + i, 1 << i, [i], 'b'), rowOf('mask & (1 << ' + i + ')', mask & (1 << i), [i], 'r')], ELEM[7 - i] + ' 확인: mask & (1 << ' + i + ')', bit ? '0이 아님 → 집합에 있음' : '0 → 집합에 없음', elemText(mask), ELEM[7 - i] + '가 집합에 있는지 보려면 mask & (1 << ' + i + ')을 계산합니다. 결과가 ' + (bit ? (mask & (1 << i)) + '(0이 아님)이므로 ' + ELEM[7 - i] + '는 집합에 있습니다.' : '0이므로 ' + ELEM[7 - i] + '는 집합에 없습니다.')));
        }
        function toggle(i) {
            var before = mask;
            mask = mask ^ (1 << i);
            MASK_STEPS.push(bstep(ELEM, [rowOf('mask', before, [i], 'a'), rowOf('1 << ' + i, 1 << i, [i], 'b'), rowOf('mask ^ (1 << ' + i + ')', mask, [i], 'r')], ELEM[7 - i] + ' 토글: mask ^= 1 << ' + i, 'mask = ' + mask, elemText(mask), ELEM[7 - i] + '의 ' + i + '번 비트를 XOR하면 있으면 빠지고 없으면 들어옵니다. 이번에는 있었으므로 빠져서 집합이 ' + elemText(mask) + '가 됩니다.'));
        }
        function remove(i) {
            var before = mask;
            var inv = (~(1 << i)) & 255;
            mask = mask & inv;
            MASK_STEPS.push(bstep(ELEM, [rowOf('mask', before, [i], 'a'), rowOf('~(1 << ' + i + ')', inv, [i], 'b'), rowOf('mask & ~(1 << ' + i + ')', mask, [i], 'r')], ELEM[7 - i] + ' 삭제: mask &= ~(1 << ' + i + ')', 'mask = ' + mask, elemText(mask), ELEM[7 - i] + '를 빼려면 ' + i + '번 비트만 0이고 나머지는 1인 ~(1 << ' + i + ') (8비트로 ' + inv + ') 값과 AND합니다. 그러면 ' + i + '번 비트만 0이 되어 집합이 ' + elemText(mask) + '가 됩니다.'));
        }
        add(2);
        add(4);
        add(6);
        check(4);
        check(3);
        toggle(4);
        remove(2);
        MASK_STEPS.push(bstep(ELEM, [rowOf('mask', mask, [], 'a')], '최종 mask = ' + mask, elemText(mask), '', '정리 — 추가는 |, 삭제는 & ~, 확인은 &, 토글은 ^로 합니다. 정수 하나가 집합 하나이므로 원소가 n개인 집합은 n비트로 표현되고, 집합 연산(합집합 |, 교집합 &)도 한 번의 연산으로 끝납니다. 원소가 n개이면 부분집합이 2^n개라 0부터 2^n - 1까지의 정수가 모든 부분집합에 하나씩 대응합니다.'));
    })();

    /* ===================== 상태 ===================== */
    var mode    = 'ops';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'trick') return TRICK_STEPS;
        if (mode === 'mask') return MASK_STEPS;
        return OPS_STEPS;
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
        if (sz < 11) sz = 11;
        if (color.indexOf(P.muted) === 0) color = P.sub + 'ff';
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    /* ===================== 공통: 비트 행 그리기 ===================== */
    function drawBits(x0, top, w, mob, step) {
        var s = step || (mode === 'mask' ? MASK_STEPS[0] : mode === 'trick' ? TRICK_STEPS[0] : OPS_STEPS[0]);
        var fs = mob ? 11.5 : 13;
        var valW = mob ? 42 : 56;
        var cb = Math.min(36, (w - valW - 4) / 8);
        var ox = x0 + (w - valW - cb * 8) / 2;
        var rowH = mob ? 54 : 58;
        var i;
        var k;
        for (i = 0; i < 8; i++) tx(s.hdr[i], ox + i * cb + cb / 2, top + 12, fs - 1, P.sub + 'ff', 'center', true);
        s.rows.forEach(function (row, ri) {
            var y = top + 22 + ri * rowH;
            var tone = row.tone === 'r' ? P.green : row.tone === 'b' ? P.purple : P.teal;
            tx(row.lab, ox, y + 8, fs - 0.5, P.text + 'ff', 'left', true);
            for (k = 0; k < 8; k++) {
                var bit = (row.v >> (7 - k)) & 1;
                var pos = 7 - k;
                var hot = row.hot.indexOf(pos) >= 0;
                rr(ox + k * cb + 1.5, y + 16, cb - 3, 30, 3, bit ? tone + '55' : 'none', hot ? P.yellow + 'ff' : bit ? tone + 'ff' : P.sub + '77', hot ? 2.6 : 1.2);
                tx(String(bit), ox + k * cb + cb / 2, y + 31, fs + 1, bit ? P.text + 'ff' : P.sub + 'ff', 'center', true);
            }
            tx(String(row.v), ox + cb * 8 + 8, y + 31, fs, tone + 'ff', 'left', true);
        });
        var at = top + 22 + s.rows.length * rowH + 14;
        if (s.cap) tx(s.cap, x0 + w / 2, at, fs - 0.5, P.yellow + 'ff', 'center', true);
        if (s.cap2) tx(s.cap2, x0 + w / 2, at + 19, fs - 1, P.text + 'ee', 'center', false);
        if (s.cap3) tx(s.cap3, x0 + w / 2, at + 38, fs - 1, P.green + 'ee', 'center', true);
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

        drawBits(padX, top, fullW, mob, step);

        if (!step) {
            var hint = '아래 STEP으로 비트 조작의 동작을 확인하세요.';
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
        neededH = mob ? 330 : 350;
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
        if (mode === 'trick') return 'n & (n-1)로 가장 낮은 1을 지우는 트릭을 봅니다.';
        if (mode === 'mask') return '정수 하나로 집합을 표현하는 비트마스크의 추가·삭제·확인을 봅니다.';
        return 'AND, OR, XOR, 시프트, NOT 연산이 비트에 하는 일을 봅니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('bit-viz__speed-btn--active'); });
        btn.classList.add('bit-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('bit-viz__mode-btn--active', d.key === m); });
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