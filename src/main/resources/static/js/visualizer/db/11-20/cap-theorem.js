/**
 * CAP 이론 시각화
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
    var root    = el('div', 'cp-viz');
    var toolbar = el('div', 'cp-viz__toolbar');
    var tbLeft  = el('div', 'cp-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'cp-viz__title', 'CAP'));

    var modeWrap = el('div', 'cp-viz__mode');
    var modeDefs = [
        { key: 'split', label: '네트워크 분할' },
        { key: 'cp', label: 'CP 선택' },
        { key: 'ap', label: 'AP 선택' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'cp-viz__mode-btn' + (i === 0 ? ' cp-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'cp-viz__speed');
    speedWrap.appendChild(el('span', 'cp-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'cp-viz__speed-btn' + (i === 0 ? ' cp-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'cp-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'cp-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'cp-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'cp-viz__controls');
    var btnPlay  = el('button', 'cp-viz__btn cp-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'cp-viz__btn', '▶| STEP');
    var btnReset = el('button', 'cp-viz__btn', '↺ RESET');
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

    /* ===================== 엔진: 두 노드와 연결 ===================== */
    function cstep(a, b, link, req, resp, dv, cap, cap2, cap3, log) {
        return { a: a, b: b, link: link, req: req, resp: resp, dv: dv, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }
    function rq(to, label) {
        return { to: to, label: label };
    }
    function rs(on, text, kind) {
        return { on: on, text: text, kind: kind };
    }

    /* ===================== 데이터: 네트워크 분할 ===================== */
    var SPLIT_STEPS = [];
    (function () {
        SPLIT_STEPS.push(cstep(1, 1, true, null, null, '', 'CAP: 분산 저장소가 네트워크가 끊길 때 겪는 선택', '노드 A와 B가 같은 데이터 x를 복제해 가짐', '지금은 둘 다 x = 1', 'CAP 이론은 분산 데이터 저장소가 일관성(C), 가용성(A), 분할 내성(P)을 모두 동시에 보장할 수는 없다고 말합니다. 여기서는 같은 데이터 x를 복제해 가진 두 노드 A와 B로 네트워크가 끊기는 상황을 봅니다. 값은 설명을 위한 예시입니다.'));
        SPLIT_STEPS.push(cstep(2, 2, true, rq('A', '쓰기 x = 2'), rs('A', '쓰기 수락', 'ok'), '', '정상 연결: 쓰기가 B로 복제된다', 'A와 B가 모두 x = 2', '일관성 유지 · 모든 요청에 응답', '네트워크가 정상이면 A에 쓴 x = 2가 B로 복제되어 두 노드가 같은 값을 갖습니다. 어느 노드에서 읽어도 같은 값이 나오고 모든 요청에 응답하므로 일관성과 가용성이 함께 지켜집니다.'));
        SPLIT_STEPS.push(cstep(2, 2, false, null, null, '', '분할(P): 노드 사이 메시지가 닿지 않음', 'A와 B는 서로의 상태를 알 수 없음', '두 노드는 모두 살아 있음', '네트워크 분할은 노드는 살아 있는데 노드 사이 메시지가 전달되지 않는 상황입니다. 케이블 단절이나 스위치 장애, 과부하로 생길 수 있고, 현실의 네트워크에서는 언제든 생길 수 있어 설계에 넣어야 합니다. 이제부터 두 노드는 서로의 변경을 알 수 없습니다.'));
        SPLIT_STEPS.push(cstep(3, 2, false, rq('A', '쓰기 x = 3'), rs('A', '쓰기 수락', 'ok'), 'B', 'A에만 x = 3이 쓰였다', 'B는 여전히 x = 2', 'B의 값이 오래된 값이 됨', '분할된 동안 A가 x = 3을 받아 저장했지만 B에는 전달되지 않습니다. 이제 두 노드의 값이 다르고, B의 x = 2는 오래된 값입니다.'));
        SPLIT_STEPS.push(cstep(3, 2, false, rq('B', '읽기 x'), null, 'B', '이때 B로 읽기 요청이 오면?', '최신값을 모르는 B가 선택해야 한다', '거절하면 CP · 오래된 값을 주면 AP', '정리 — 분할 중에 B가 읽기 요청을 받으면 선택지가 둘입니다. 최신값을 확인할 수 없으니 응답을 거절해 일관성을 지키거나(CP), 가진 값을 그대로 돌려 가용성을 지킵니다(AP). 분할이 일어난 동안은 둘을 모두 가질 수 없습니다. 다음 두 탭에서 각각을 봅니다.'));
    })();

    /* ===================== 데이터: CP 선택 ===================== */
    var CP_STEPS = [];
    (function () {
        CP_STEPS.push(cstep(3, 2, false, null, null, 'B', 'CP: 일관성을 지키고 가용성을 포기', '최신값을 보장하지 못하면 응답하지 않음', '분할 상태: A = 3, B = 2', 'CP 방식은 분할 중에 일관성을 우선합니다. 최신값임을 보장할 수 없는 노드는 요청을 거절하거나 기다리게 합니다. 앞 탭에서 만든 분할 상태(A = 3, B = 2)에서 시작하며, 이 예시에서 A는 쓰기를 받는 쪽이라고 가정합니다.'));
        CP_STEPS.push(cstep(3, 2, false, rq('B', '읽기 x'), rs('B', '오류 · 응답 거절', 'err'), 'B', 'B가 읽기를 거절한다', '최신값을 확인할 수 없어서', '일관성 유지 · 가용성 포기', '클라이언트가 B에 읽기를 요청합니다. B는 A와 통신할 수 없어 자신의 x = 2가 최신인지 알 수 없으므로 오류를 반환하거나 응답을 미룹니다. 오래된 값을 주지 않으니 일관성은 지켜지지만, 살아 있는 B가 요청에 답하지 못하므로 가용성은 포기한 것입니다.'));
        CP_STEPS.push(cstep(3, 3, true, null, null, '', '분할 해소: B가 A를 따라잡음', 'B = 3으로 동기화', '다시 일관된 상태', '네트워크가 복구되면 B가 A의 변경을 받아 x = 3으로 따라잡습니다. 그동안 B는 읽기에 응답하지 못했습니다.'));
        CP_STEPS.push(cstep(3, 3, true, rq('B', '읽기 x'), rs('B', 'x = 3', 'ok'), '', '복구 후 B가 최신값으로 응답', '오래된 값을 준 적은 없음', '일관성은 계속 유지', '복구 뒤에는 B가 최신값 x = 3을 돌려줍니다. CP 방식은 분할 중에 일부 요청이 실패하거나 지연되는 대신, 응답할 때는 최신값만 돌려줍니다.'));
        CP_STEPS.push(cstep(3, 3, true, null, null, '', 'CP: 틀린 답보다 답이 없는 쪽을 택함', '틀린 값의 피해가 큰 데이터에서 많이 택함', '예: 잔액, 재고', '정리 — CP는 분할 중에 일관성을 지키려고 일부 요청을 거절하거나 지연시킵니다. 잔액이나 재고처럼 틀린 값의 피해가 큰 데이터에서 많이 택하는 선택입니다.'));
    })();

    /* ===================== 데이터: AP 선택 ===================== */
    var AP_STEPS = [];
    (function () {
        AP_STEPS.push(cstep(3, 2, false, null, null, 'B', 'AP: 가용성을 지키고 일관성을 양보', '모든 노드가 가진 값으로 계속 응답', '분할 상태: A = 3, B = 2', 'AP 방식은 분할 중에 가용성을 우선합니다. 살아 있는 노드는 최신인지 확인하지 못해도 자기가 가진 값으로 요청에 응답합니다. 앞 탭에서 만든 분할 상태(A = 3, B = 2)에서 시작합니다.'));
        AP_STEPS.push(cstep(3, 2, false, rq('B', '읽기 x'), rs('B', 'x = 2 (오래된 값)', 'stale'), 'B', 'B가 오래된 값으로 응답한다', '거절하지 않으니 가용성 유지', '최신 x = 3과 다름 · 일관성 양보', '클라이언트가 B에 읽기를 요청하면 B는 가진 x = 2를 바로 돌려줍니다. 요청에 응답했으니 가용성은 지켜지지만, A에 이미 쓰인 최신값 x = 3과 다른 값을 읽었으므로 일관성은 양보한 것입니다.'));
        AP_STEPS.push(cstep(3, 5, false, rq('B', '쓰기 x = 5'), rs('B', '쓰기 수락', 'ok'), 'both', '분할 중에도 B가 쓰기를 받는다', 'A = 3, B = 5로 갈라짐', '복구할 때 충돌을 풀어야 함', 'AP 방식은 분할 중에도 양쪽 노드가 쓰기를 받을 수 있습니다. 같은 x에 A는 3을, B는 5를 갖게 되어 값이 갈라집니다.'));
        AP_STEPS.push(cstep(5, 5, true, null, null, '', '복구 후 충돌 해결: 예) 마지막 쓰기 우선', 'x = 5가 이기고 x = 3 쓰기는 사라짐', '두 노드가 다시 같은 값으로 수렴', '네트워크가 복구되면 두 노드의 값을 합쳐야 합니다. 마지막 쓰기 우선(LWW) 규칙이면 나중에 쓴 x = 5가 남고 x = 3 쓰기는 사라집니다. 버전 정보로 충돌을 감지해 응용이 합치게 하는 방식도 있습니다. 새 쓰기가 없으면 시간이 지나 같은 값으로 수렴하는 성질을 최종적 일관성(eventual consistency)이라 합니다.'));
        AP_STEPS.push(cstep(5, 5, true, null, null, '', 'AP: 답은 항상 주되 잠시 틀릴 수 있음', '지연된 반영이 허용되는 데이터에 맞음', '예: 좋아요 수, 조회수, 장바구니', '정리 — AP는 분할 중에도 요청에 응답하는 대신 오래된 값을 주거나 갈라진 값을 나중에 합쳐야 합니다. 잠깐 틀려도 괜찮고 항상 응답하는 것이 중요한 데이터에서 많이 택하는 선택입니다.'));
    })();

    /* ===================== 상태 ===================== */
    var mode    = 'split';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'cp') return CP_STEPS;
        if (mode === 'ap') return AP_STEPS;
        return SPLIT_STEPS;
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

    /* ===================== 노드와 연결 ===================== */
    function drawNodes(x0, top, w, mob, s) {
        var fs = mob ? 11.5 : 13;
        var nw = mob ? 118 : 160;
        var nh = mob ? 70 : 76;
        var ch = mob ? 28 : 30;
        var ny = top + ch + 44;
        var ax = x0 + 2;
        var bx = x0 + w - nw - 2;
        var cx = x0 + w / 2;
        var k;
        rr(cx - 56, top, 112, ch, 6, P.purple + '22', P.purple + 'ff', 1.6);
        tx('클라이언트', cx, top + ch / 2, fs, P.text + 'ff', 'center', true);
        var nodes = [{ key: 'A', x: ax, v: s.a, col: P.teal }, { key: 'B', x: bx, v: s.b, col: P.orange }];
        var midY = ny + nh / 2;
        if (s.link) {
            ctx.beginPath();
            ctx.moveTo(ax + nw, midY);
            ctx.lineTo(bx, midY);
            ctx.strokeStyle = P.green + 'ff';
            ctx.lineWidth = 2.4;
            ctx.stroke();
            tx('복제 연결', cx, midY - 14, fs - 1, P.green + 'ff', 'center', true);
        } else {
            ctx.beginPath();
            ctx.moveTo(ax + nw, midY);
            ctx.lineTo(bx, midY);
            ctx.strokeStyle = P.red + 'ff';
            ctx.lineWidth = 2.4;
            ctx.setLineDash([5, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
            tx('✕', cx, midY, fs + 4, P.red + 'ff', 'center', true);
            tx('분할', cx, midY - 18, fs - 1, P.red + 'ff', 'center', true);
        }
        for (k = 0; k < 2; k++) {
            var nd = nodes[k];
            var stale = s.dv === 'both' || s.dv === nd.key;
            var hit = s.req && s.req.to === nd.key;
            rr(nd.x, ny, nw, nh, 8, nd.col + '22', nd.col + 'ff', hit ? 3 : 1.8);
            tx('노드 ' + nd.key, nd.x + nw / 2, ny + 16, fs, P.text + 'ff', 'center', true);
            tx('x = ' + nd.v, nd.x + nw / 2, ny + nh - 22, fs + 3, stale ? P.orange + 'ff' : P.green + 'ff', 'center', true);
            if (hit) {
                var tx0 = nd.x + nw / 2;
                ctx.beginPath();
                ctx.moveTo(cx, top + ch);
                ctx.lineTo(tx0, ny);
                ctx.strokeStyle = P.purple + 'ff';
                ctx.lineWidth = 2.2;
                ctx.stroke();
                var lx = (cx + tx0) / 2;
                tx(s.req.label, nd.key === 'A' ? lx - 6 : lx + 6, top + ch + 22, fs - 0.5, P.purple + 'ff', nd.key === 'A' ? 'right' : 'left', true);
            }
            if (s.resp && s.resp.on === nd.key) {
                var rw = mob ? 150 : 190;
                var rx = Math.max(x0, Math.min(x0 + w - rw, nd.x + nw / 2 - rw / 2));
                var rc = s.resp.kind === 'ok' ? P.green : (s.resp.kind === 'err' ? P.red : P.orange);
                rr(rx, ny + nh + 10, rw, 28, 6, rc + '22', rc + 'ff', 1.8);
                tx(s.resp.text, rx + rw / 2, ny + nh + 24, fs - 0.5, rc + 'ff', 'center', true);
            }
        }
        drawCaps(s, x0, w, ny + nh + 62, fs);
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
        drawNodes(padX, top, fullW, mob, dsStep);

        if (!step) {
            var hint = '아래 STEP으로 CAP 이론의 선택을 확인하세요.';
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
        neededH = mob ? 330 : 320;
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
        if (mode === 'cp') return '분할 중에 일관성을 지키려고 응답을 거절하는 CP 방식을 봅니다.';
        if (mode === 'ap') return '분할 중에도 가용성을 지키려고 오래된 값을 주는 AP 방식을 봅니다.';
        return '두 노드 사이의 네트워크가 끊기면 어떤 선택을 해야 하는지 봅니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('cp-viz__speed-btn--active'); });
        btn.classList.add('cp-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('cp-viz__mode-btn--active', d.key === m); });
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