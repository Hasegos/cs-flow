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
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
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
    function GW() { return canvas.width / dpr; }
    function GH() { return canvas.height / dpr; }

    var P = window.CsFlow.getP();

    /* ===================== 상태 ===================== */
    var mode    = 'pool';
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
    function currentSteps() {
        if (mode === 'size') return SIZE_STEPS;
        if (mode === 'leak') return LEAK_STEPS;
        return POOL_STEPS;
    }
    function defaultLog() {
        if (mode === 'size') return '풀 크기보다 요청이 많을 때 어떻게 되는지 봅니다.';
        if (mode === 'leak') return '연결을 반납하지 않으면 풀이 어떻게 고갈되는지 봅니다.';
        return '연결을 미리 만들어 두고 빌려 쓰고 반납하는 풀의 동작을 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        return { fs: mob ? 11 : 12, rh: 26, rg: 7, total: 20 + 5 * 33 - 7 + (mob ? 148 : 120) };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function caps(s, cx, w, y, fs) {
        var yy = y;
        [[s.cap, P.yellow, true, fs], [s.cap2, P.text, false, fs - 1], [s.cap3, P.green, true, fs - 1]].forEach(function (c) {
            if (!c[0]) return;
            var ls = lines(c[0], w - 12, c[3]);
            ls.forEach(function (l, i) { tx(l, cx, yy + i * (c[3] + 5), c[3], c[1] + 'ee', 'center', c[2]); });
            yy += ls.length * (c[3] + 5) + 3;
        });
    }

    /* ===================== 요청, 풀, DB ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var fs = L.fs, rh = L.rh, rg = L.rg;
        var e = clamp01(t);
        var s = step || { reqs: 'iii', slots: [], ptitle: '', hot: false, cap: '', cap2: '', cap3: '' };
        var p = prev || s;
        var lw = mob ? 90 : 118, dw = mob ? 72 : 104, gap = mob ? 12 : 30;
        var pw = w - lw - dw - gap * 2;
        var H = 5 * (rh + rg) - rg;
        var y0 = top + 20;
        var px = x0 + lw + gap, dx = x0 + w - dw;
        var RC = { i: P.sub, r: P.teal, w: P.orange, d: P.sub, f: P.red, l: P.red };
        var RT = { i: '', r: ' 실행', w: ' 대기', d: ' 완료', f: ' 실패', l: ' 미반납' };
        var SC = { i: P.green, u: P.orange, l: P.red, n: P.purple };
        var ST = { i: '놀고 있음', u: '사용 중', l: '누수', n: '새 연결' };

        tx('요청', x0 + lw / 2, top + 8, fs - 1, P.sub + 'ff', 'center', true);
        tx(s.ptitle, px + pw / 2, top + 8, fs - 1, P.sub + 'ff', 'center', true);
        tx('DB', dx + dw / 2, top + 8, fs - 1, P.sub + 'ff', 'center', true);

        /* DB */
        var hot = s.hot;
        var hc = hot ? P.red : P.teal;
        var shake = hot ? Math.sin(e * 30) * 2 : 0;
        rr(dx + shake, y0, dw, H, 8, hc + '22', hc + 'ff', hot ? 2.6 : 1.8);
        tx('DB 서버', dx + dw / 2 + shake, y0 + H / 2 - (hot ? 12 : 0), fs, P.text + 'ff', 'center', true);
        if (hot) tx('경합', dx + dw / 2, y0 + H / 2 + 12, fs, P.red + 'ff', 'center', true);

        /* 풀 */
        rr(px, y0, pw, H, 8, P.sub + '11', P.sub + 'ff', 1.6);
        var m = s.slots.length;
        if (m === 0) tx('(없음)', px + pw / 2, y0 + H / 2, fs - 1, P.sub + 'ff', 'center', false);
        var sp = (H - 12) / Math.max(m, 1);
        var sh = sp * 0.75;
        var slotY = [];
        for (var k = 0; k < m; k++) {
            var code = s.slots[k].charAt(0);
            var who = s.slots[k].length > 2 ? s.slots[k].substring(2) : '';
            var sy = y0 + 6 + k * sp + (sp - sh) / 2;
            slotY.push(sy + sh / 2);
            var pc = p.slots[k] ? p.slots[k].charAt(0) : null;
            var changed = pc !== code;
            var col = SC[code];
            var a = changed && pc === null ? clamp01(e * 2) : 1;
            ctx.globalAlpha = a;
            rr(px + 6, sy, pw - 12, sh, 6, col + (changed ? '55' : '33'), col + 'ff', changed ? 2.6 : 1.6);
            if (sh >= 22) tx((who ? who + ' ' : '') + ST[code], px + pw / 2, sy + sh / 2, fs - 1, P.text + 'ff', 'center', true);
            if (code !== 'i') {
                ln(px + pw - 6, sy + sh / 2, dx, sy + sh / 2, col + 'ff', code === 'l' ? 1.4 : 2.2, code === 'n' || code === 'l' ? [4, 3] : []);
            }
            ctx.globalAlpha = 1;
            if (code === 'n' && changed && e < 1) {
                ctx.globalAlpha = 1 - e;
                circ(px + pw / 2, sy + sh / 2, 10 + e * 26, 'none', P.purple + 'ff', 2);
                ctx.globalAlpha = 1;
            }
        }
        if (s.slots.some(function (x) { return x.charAt(0) === 'n'; })) {
            var nn = s.slots.filter(function (x) { return x.charAt(0) === 'n'; }).length;
            tx('연결 생성 ' + nn + '번', px + pw / 2, y0 + H + 12, fs - 0.5, P.purple + 'ff', 'center', true);
        }

        /* 요청 칩과 이동 점 */
        function slotOf(rn) {
            for (var q = 0; q < m; q++) { if (s.slots[q].length > 2 && s.slots[q].substring(2) === 'R' + rn) return q; }
            return -1;
        }
        for (var r = 0; r < s.reqs.length; r++) {
            var c = s.reqs.charAt(r);
            var pcode = p.reqs.charAt(r);
            var y = y0 + r * (rh + rg);
            var sway = (c === 'f' && pcode !== 'f' && e < 1) ? Math.sin(e * 26) * 3 : (c === 'w' ? Math.sin(e * 8) * 1.5 : 0);
            rr(x0 + sway, y, lw, rh, 6, RC[c] + (c === 'i' || c === 'd' ? '11' : '33'), RC[c] + (c === 'i' ? '88' : 'ff'), c === 'i' ? 1.2 : 1.8);
            tx('R' + (r + 1) + RT[c], x0 + lw / 2 + sway, y + rh / 2, fs - 1, c === 'i' || c === 'd' ? P.sub + 'ff' : P.text + 'ff', 'center', c !== 'i');
            if (c === pcode) continue;
            var yc = y + rh / 2;
            var si = slotOf(r + 1);
            if (c === 'r' && si >= 0 && e < 1) {
                var ph = e < 0.5 ? e * 2 : 1;
                var xx = e < 0.5 ? lerp(x0 + lw, px + 6, ph) : lerp(px + 6, dx, (e - 0.5) * 2);
                var yy = e < 0.5 ? lerp(yc, slotY[si], ph) : slotY[si];
                circ(xx, yy, 6, P.yellow + 'ff', 'none');
            } else if (c === 'r' && s.slots.some(function (q) { return q.charAt(0) === 'n'; }) && e < 1) {
                circ(lerp(x0 + lw, dx, e), yc, 6, P.purple + 'ff', 'none');
            } else if (c === 'd' && pcode === 'r' && e < 1) {
                var rsi = -1;
                for (var q2 = 0; q2 < p.slots.length; q2++) { if (p.slots[q2].length > 2 && p.slots[q2].substring(2) === 'R' + (r + 1)) rsi = q2; }
                var fy = rsi >= 0 ? slotY[Math.min(rsi, m - 1)] : yc;
                circ(lerp(px + 6, x0 + lw, e), lerp(fy, yc, e), 6, P.green + 'ff', 'none');
            }
        }
        caps(s, x0 + w / 2, w, y0 + H + 40, fs);
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