/**
 * 커넥션 풀 시각화
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
    var root    = el('div', 'cn-viz');
    var toolbar = el('div', 'cn-viz__toolbar');
    var tbLeft  = el('div', 'cn-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'cn-viz__title', 'ConnectionPool'));

    var modeWrap = el('div', 'cn-viz__mode');
    var modeDefs = [
        { key: 'pool', label: '풀의 동작' },
        { key: 'size', label: '풀 크기' },
        { key: 'leak', label: '연결 누수' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'cn-viz__mode-btn' + (i === 0 ? ' cn-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'cn-viz__speed');
    speedWrap.appendChild(el('span', 'cn-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'cn-viz__speed-btn' + (i === 0 ? ' cn-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'cn-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'cn-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'cn-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'cn-viz__controls');
    var btnPlay  = el('button', 'cn-viz__btn cn-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'cn-viz__btn', '▶| STEP');
    var btnReset = el('button', 'cn-viz__btn', '↺ RESET');
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

    /* ===================== 엔진: 요청, 풀, DB ===================== */
    function pstep(reqs, slots, ptitle, hot, cap, cap2, cap3, log) {
        return { reqs: reqs, slots: slots, ptitle: ptitle, hot: hot, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }

    /* ===================== 데이터: 풀의 동작 ===================== */
    var POOL_STEPS = [];
    (function () {
        POOL_STEPS.push(pstep('iii', [], '연결 없음', false, 'DB 연결은 만들 때마다 비용이 든다', '네트워크 연결, 인증, 세션 준비를 거쳐야 함', '풀: 미리 만든 연결을 빌려 쓰고 반납', 'DB에 연결하려면 네트워크 연결을 맺고 인증과 세션 준비를 거쳐야 해서, 요청마다 새로 맺으면 시간과 서버 자원이 듭니다. 커넥션 풀은 연결을 미리 만들어 두고 빌려 쓰고 반납하게 해 이 비용을 줄입니다. 아래 STEP으로 풀 없이 쓸 때와 풀을 쓸 때를 비교합니다.'));
        POOL_STEPS.push(pstep('rrr', ['n:R1', 'n:R2', 'n:R3'], '풀 없음', false, '풀 없음: 요청마다 연결을 새로 만든다', '요청 3개 = 연결 생성 3번', '쿼리가 끝나면 연결도 닫음', '풀이 없으면 요청마다 연결을 만들고 쿼리가 끝나면 닫습니다. 요청이 3개면 연결 생성과 종료도 3번 일어나고, 짧은 쿼리라면 쿼리보다 연결에 드는 시간이 더 클 수도 있습니다.'));
        POOL_STEPS.push(pstep('iii', ['i', 'i', 'i'], '연결 풀 (크기 3)', false, '풀: 연결 3개를 미리 만들어 둔다', '연결은 열린 채 대기(idle)', '연결 생성 비용은 풀을 채울 때 위주', '풀은 연결을 만들어 열린 채로 보관합니다. 요청이 오면 이 중 놀고 있는 연결을 빌려 줍니다. 연결을 만드는 비용은 풀을 채울 때(그리고 오래된 연결을 교체할 때)만 듭니다.'));
        POOL_STEPS.push(pstep('rri', ['u:R1', 'u:R2', 'i'], '연결 풀 (크기 3)', false, 'R1과 R2가 연결을 빌려 간다', '놀던 연결을 바로 받음', '새 연결을 만들지 않음', '요청 R1과 R2가 풀에서 놀고 있는 연결을 하나씩 빌립니다. 새 연결을 만들 필요가 없으므로 바로 쿼리를 실행합니다.'));
        POOL_STEPS.push(pstep('dri', ['i', 'u:R2', 'i'], '연결 풀 (크기 3)', false, 'R1이 끝나면 연결을 반납한다', 'close()는 연결을 끊지 않고 풀로 돌려줌', '연결은 열린 채 재사용 대기', '요청이 끝나면 애플리케이션은 close()를 호출하지만, 풀이 빌려 준 연결 객체의 close()는 실제 연결을 끊지 않고 연결을 풀에 반납합니다. 연결은 열린 채 다음 요청을 기다립니다.'));
        POOL_STEPS.push(pstep('drr', ['u:R3', 'u:R2', 'i'], '연결 풀 (크기 3)', false, 'R3이 반납된 연결을 받는다', 'R1이 쓰던 연결을 R3이 재사용', '풀 안의 연결 3개를 계속 돌려 씀', '새 요청 R3이 R1이 반납한 연결을 그대로 받아 씁니다. 연결을 새로 맺지 않으므로 연결 비용 없이 쿼리를 실행합니다.'));
        POOL_STEPS.push(pstep('ddd', ['i', 'i', 'i'], '연결 풀 (크기 3)', false, '풀은 연결을 돌려 쓴다', '연결 3개를 미리 만들어 두고 재사용', '연결 생성과 종료 비용을 줄임', '정리 — 커넥션 풀은 DB 연결을 미리 만들어 두고 요청이 빌려 쓰고 반납하게 해 연결 생성 비용을 줄입니다. 풀 크기만큼으로 동시 연결 수도 제한되어 DB를 보호하는 효과가 있습니다.'));
    })();

    /* ===================== 데이터: 풀 크기 ===================== */
    var SIZE_STEPS = [];
    (function () {
        SIZE_STEPS.push(pstep('iiiii', ['i', 'i', 'i'], '연결 풀 (크기 3)', false, '풀 크기: 동시에 빌려 줄 수 있는 연결 수', '풀 크기 3 · 동시 요청 5', '남는 요청은 기다려야 함', '풀 크기는 풀이 동시에 빌려 줄 수 있는 연결의 최대 수입니다. 여기서는 풀 크기가 3인데 요청이 동시에 5개 옵니다.'));
        SIZE_STEPS.push(pstep('rrrww', ['u:R1', 'u:R2', 'u:R3'], '연결 풀 (크기 3)', false, '연결이 다 차면 나머지 요청은 대기', 'R4와 R5가 빈 연결을 기다림', '대기 요청 2개', '연결 3개가 모두 사용 중이면 R4와 R5는 연결이 반납될 때까지 기다립니다. 풀이 요청을 줄 세워 DB에 동시에 가는 쿼리 수를 풀 크기로 제한하는 것입니다.'));
        SIZE_STEPS.push(pstep('drrrw', ['u:R4', 'u:R2', 'u:R3'], '연결 풀 (크기 3)', false, '반납되면 대기하던 요청이 받는다', 'R4가 R1의 연결을 받음', 'R5는 계속 대기', 'R1이 연결을 반납하면 기다리던 R4가 그 연결을 받아 실행합니다. R5는 다음 반납을 계속 기다립니다.'));
        SIZE_STEPS.push(pstep('drrrf', ['u:R4', 'u:R2', 'u:R3'], '연결 풀 (크기 3)', false, '너무 오래 기다리면 시간 초과', 'R5가 오류를 받음', 'HikariCP 기본 대기 한도는 30초', '풀은 연결을 얻으려 기다리는 시간에 한도를 둡니다. HikariCP에서는 connectionTimeout이고 기본값이 30초이며, 넘으면 SQLTransientConnectionException으로 실패합니다. 시각화에서는 시간을 줄여 보여 줍니다.'));
        SIZE_STEPS.push(pstep('rrrrr', ['u', 'u', 'u', 'u', 'u'], '연결 풀 (크기 5)', true, 'DB가 감당할 양보다 풀을 크게 잡으면', '동시에 실행되는 쿼리가 늘어 경합 증가', '연결 수와 처리량은 비례하지 않음', '이 예시는 DB가 한 번에 효율적으로 처리할 수 있는 양을 3개쯤으로 가정합니다. 풀을 키우면 대기는 줄지만 DB가 동시에 처리해야 하는 쿼리가 늘어 CPU, 메모리, 잠금 경합이 커집니다. DB 서버가 한 번에 효율적으로 처리할 수 있는 양에는 한계가 있어, 연결을 무작정 늘리면 오히려 처리량이 줄 수 있습니다.'));
        SIZE_STEPS.push(pstep('ddddd', ['i', 'i', 'i'], '연결 풀 (크기 3)', false, '풀 크기는 DB가 감당할 만큼으로', '시작점을 정하고 부하 테스트로 조정', '작은 풀이 더 나은 경우가 많음', '정리 — 풀 크기는 DB 서버의 코어 수와 쿼리 특성을 고려해 잡고 측정으로 조정합니다. HikariCP 문서는 작은 풀이 더 나은 경우가 많다고 설명하며, 코어 수를 바탕으로 한 공식을 시작점으로 소개합니다.'));
    })();

    /* ===================== 데이터: 연결 누수 ===================== */
    var LEAK_STEPS = [];
    (function () {
        LEAK_STEPS.push(pstep('iiii', ['i', 'i', 'i'], '연결 풀 (크기 3)', false, 'close()를 빠뜨리면 연결이 돌아오지 않는다', '연결 누수(connection leak)', '풀 안의 연결이 하나씩 줄어듦', '연결 누수는 빌린 연결을 반납하지 않는 것입니다. 쿼리가 끝나도 close()를 호출하지 않거나 예외 때문에 건너뛰면 그 연결은 풀로 돌아오지 않습니다.'));
        LEAK_STEPS.push(pstep('liii', ['l:R1', 'i', 'i'], '연결 풀 (크기 3)', false, 'R1이 close()를 빠뜨림', '일은 끝났지만 연결을 돌려주지 않음', '풀은 연결이 쓰이는 중이라고 봄', 'R1이 쿼리를 끝냈지만 연결을 반납하지 않았습니다. 풀은 이 연결이 아직 쓰이는 중이라고 보아 다른 요청에 빌려 주지 못합니다.'));
        LEAK_STEPS.push(pstep('llli', ['l:R1', 'l:R2', 'l:R3'], '연결 풀 (크기 3)', false, '누수가 쌓이면 풀이 비어 간다', '빌려 줄 연결이 0개', '요청이 와도 쓸 연결이 없음', 'R2와 R3도 연결을 반납하지 않으면 풀의 연결 3개가 모두 돌아오지 않는 연결이 됩니다. 빌려 줄 연결이 남지 않았습니다.'));
        LEAK_STEPS.push(pstep('lllf', ['l:R1', 'l:R2', 'l:R3'], '연결 풀 (크기 3)', false, '새 요청은 기다리다 실패한다', '쿼리는 끝났는데 연결은 돌아오지 않음', '풀 고갈(pool exhaustion)', 'R4는 연결을 얻으려 기다리다 시간 초과로 실패합니다. 쿼리는 이미 끝났는데 연결이 돌아오지 않아 애플리케이션이 멈춘 것처럼 보이는 풀 고갈 상태입니다.'));
        LEAK_STEPS.push(pstep('dddd', ['i', 'i', 'i'], '연결 풀 (크기 3)', false, 'try-with-resources로 항상 반납한다', '예외가 나도 close()가 호출됨', '누수 감지: leakDetectionThreshold', '정리 — 자바에서는 try-with-resources로 연결을 열어 예외가 나도 close()가 호출되게 합니다. HikariCP는 leakDetectionThreshold를 설정하면 그 시간보다 오래 반납되지 않는 연결을 로그로 알려 줍니다. 기본값은 0으로 꺼져 있습니다.'));
    })();

    /* ===================== 상태 ===================== */
    var mode    = 'pool';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'size') return SIZE_STEPS;
        if (mode === 'leak') return LEAK_STEPS;
        return POOL_STEPS;
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

    /* ===================== 공통: 캡션 ===================== */
    function drawCaps(s, x0, w, y, fs) {
        if (s.cap) tx(s.cap, x0 + w / 2, y, fs - 0.5, P.yellow + 'ff', 'center', true);
        if (s.cap2) tx(s.cap2, x0 + w / 2, y + 19, fs - 1, P.text + 'ee', 'center', false);
        if (s.cap3) tx(s.cap3, x0 + w / 2, y + 38, fs - 1, P.green + 'ee', 'center', true);
    }

    /* ===================== 요청, 풀, DB ===================== */
    function drawPool(x0, top, w, mob, s) {
        var fs = mob ? 11.5 : 13;
        var rh = 24;
        var rg = 6;
        var lw = mob ? 86 : 112;
        var dw = mob ? 72 : 100;
        var gap = mob ? 10 : 26;
        var pw = w - lw - dw - gap * 2;
        var H = 5 * (rh + rg) - rg;
        var y0 = top + 20;
        var px = x0 + lw + gap;
        var dx = x0 + w - dw;
        var k;
        var RC = { i: P.sub, r: P.teal, w: P.orange, d: P.sub, f: P.red, l: P.red };
        var RT = { i: '', r: ' 실행', w: ' 대기', d: ' 완료', f: ' 실패', l: ' 미반납' };
        tx('요청', x0 + lw / 2, top + 8, fs - 1, P.sub + 'ff', 'center', true);
        tx(s.ptitle, px + pw / 2, top + 8, fs - 1, P.sub + 'ff', 'center', true);
        tx('DB', dx + dw / 2, top + 8, fs - 1, P.sub + 'ff', 'center', true);
        for (k = 0; k < s.reqs.length; k++) {
            var c = s.reqs.charAt(k);
            var y = y0 + k * (rh + rg);
            rr(x0, y, lw, rh, 5, RC[c] + (c === 'i' || c === 'd' ? '11' : '33'), RC[c] + (c === 'i' ? '88' : 'ff'), c === 'i' ? 1.2 : 1.8);
            tx('R' + (k + 1) + RT[c], x0 + lw / 2, y + rh / 2, fs - 1, c === 'i' || c === 'd' ? P.sub + 'ff' : P.text + 'ff', 'center', c !== 'i');
        }
        rr(px, y0, pw, H, 8, P.sub + '11', P.sub + 'ff', 1.6);
        var hot = s.hot;
        rr(dx, y0, dw, H, 8, (hot ? P.red : P.teal) + '22', (hot ? P.red : P.teal) + 'ff', hot ? 2.6 : 1.8);
        tx('DB 서버', dx + dw / 2, y0 + H / 2 - (hot ? 12 : 0), fs, P.text + 'ff', 'center', true);
        if (hot) tx('경합', dx + dw / 2, y0 + H / 2 + 12, fs, P.red + 'ff', 'center', true);
        var m = s.slots.length;
        if (m === 0) tx('(없음)', px + pw / 2, y0 + H / 2, fs - 1, P.sub + 'ff', 'center', false);
        var sp = (H - 12) / Math.max(m, 1);
        var sh = sp * 0.75;
        var SC = { i: P.green, u: P.orange, l: P.red, n: P.purple };
        var ST = { i: '놀고 있음', u: '사용 중', l: '누수', n: '새 연결' };
        for (k = 0; k < m; k++) {
            var code = s.slots[k].charAt(0);
            var who = s.slots[k].length > 2 ? s.slots[k].substring(2) : '';
            var sy = y0 + 6 + k * sp + (sp - sh) / 2;
            var col = SC[code];
            rr(px + 6, sy, pw - 12, sh, 5, col + '33', col + 'ff', 1.6);
            if (sh >= 24) tx((who ? who + ' ' : '') + ST[code], px + pw / 2, sy + sh / 2, fs - 1, P.text + 'ff', 'center', true);
            if (code !== 'i') {
                ctx.beginPath();
                ctx.moveTo(px + pw - 6, sy + sh / 2);
                ctx.lineTo(dx, sy + sh / 2);
                ctx.strokeStyle = col + 'ff';
                ctx.lineWidth = code === 'l' ? 1.4 : 2.2;
                ctx.setLineDash(code === 'n' ? [4, 3] : []);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
        drawCaps(s, x0, w, y0 + H + 24, fs);
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

        var dsStep = step || currentSteps()[0];
        drawPool(padX, top, fullW, mob, dsStep);

        if (!step) {
            var hint = '아래 STEP으로 커넥션 풀의 동작을 확인하세요.';
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
        neededH = mob ? 300 : 290;
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
        if (mode === 'size') return '풀 크기보다 요청이 많을 때와 풀을 너무 크게 잡을 때를 봅니다.';
        if (mode === 'leak') return '빌린 연결을 반납하지 않아 풀이 비어 가는 과정을 봅니다.';
        return '풀 없이 쓸 때와 풀을 쓸 때 연결이 어떻게 달라지는지 봅니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('cn-viz__speed-btn--active'); });
        btn.classList.add('cn-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('cn-viz__mode-btn--active', d.key === m); });
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