/**
 * CAP 정리 시각화
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
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
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
    function GW() { return canvas.width / dpr; }
    function GH() { return canvas.height / dpr; }

    var P = window.CsFlow.getP();

    /* ===================== 상태 ===================== */
    var mode    = 'split';
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
    function currentSteps() {
        if (mode === 'cp') return CP_STEPS;
        if (mode === 'ap') return AP_STEPS;
        return SPLIT_STEPS;
    }
    function defaultLog() {
        if (mode === 'cp') return '네트워크가 끊겼을 때 일관성을 지키는 CP 선택을 봅니다.';
        if (mode === 'ap') return '네트워크가 끊겼을 때 가용성을 지키는 AP 선택을 봅니다.';
        return '같은 데이터를 복제한 두 노드의 네트워크가 끊기는 상황을 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        return { fs: mob ? 11 : 12, nodeW: mob ? 112 : 160, nodeH: mob ? 70 : 78, total: mob ? 332 : 316 };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 장면 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var fs = L.fs;
        var e = clamp01(t);
        var s = step || { a: 1, b: 1, link: true, req: null, resp: null, dv: '', cap: '', cap2: '', cap3: '' };
        var p = prev || s;
        var cx = x0 + w / 2;
        var cw = 112, ch = 30;
        var nodeY = top + 112;
        var ax = x0 + 2, bx = x0 + w - L.nodeW - 2;
        var midY = nodeY + L.nodeH / 2;

        /* 클라이언트 */
        rr(cx - cw / 2, top + 4, cw, ch, 8, P.purple + '22', P.purple + 'ff', 1.8);
        tx('클라이언트', cx, top + 4 + ch / 2, fs, P.text + 'ff', 'center', true);

        /* 노드 사이 연결 */
        var linkX1 = ax + L.nodeW, linkX2 = bx;
        if (s.link) {
            ln(linkX1, midY, linkX2, midY, P.green + 'ff', 2.6);
            tx('복제 연결', cx, midY - 14, fs - 1, P.green + 'ff', 'center', true);
            if (p.a !== p.b || s.a !== p.a || s.b !== p.b) {
                if (s.b !== p.b || s.a !== p.a) {
                    var from = s.b !== p.b ? linkX1 : linkX2, to = s.b !== p.b ? linkX2 : linkX1;
                    circ(lerp(from, to, e), midY, 6, P.green + 'ff', 'none');
                }
            }
        } else {
            ln(linkX1, midY, linkX2, midY, P.red + 'ff', 2.4, [5, 4]);
            tx('✕', cx, midY, fs + 6, P.red + 'ff', 'center', true);
            tx('분할', cx, midY - 20, fs - 1, P.red + 'ff', 'center', true);
        }

        /* 노드 */
        var defs = [{ key: 'A', x: ax, v: s.a, pv: p.a, col: P.teal }, { key: 'B', x: bx, v: s.b, pv: p.b, col: P.orange }];
        defs.forEach(function (n) {
            var stale = s.dv === 'both' || s.dv === n.key;
            var hit = s.req && s.req.to === n.key;
            var col = stale ? P.yellow : n.col;
            rr(n.x, nodeY, L.nodeW, L.nodeH, 10, col + '1a', col + 'ff', hit ? 3 : 1.8);
            tx('노드 ' + n.key, n.x + L.nodeW / 2, nodeY + 16, fs, col + 'ff', 'center', true);
            tx('x = ' + n.v, n.x + L.nodeW / 2, nodeY + 42, fs + 6, P.text + 'ff', 'center', true);
            tx(stale ? '오래된 값' : '최신', n.x + L.nodeW / 2, nodeY + L.nodeH - 10, fs - 1, (stale ? P.yellow : P.green) + 'ff', 'center', true);
            if (n.v !== n.pv && e < 1) {
                ctx.globalAlpha = 1 - e;
                rr(n.x - 4, nodeY - 4, L.nodeW + 8, L.nodeH + 8, 13, 'none', P.yellow + 'ff', 3);
                ctx.globalAlpha = 1;
            }
        });

        /* 요청과 응답 */
        if (s.req) {
            var tn = s.req.to === 'A' ? defs[0] : defs[1];
            var tx2 = tn.x + L.nodeW / 2, ty2 = nodeY;
            var sx = cx, sy = top + 4 + ch;
            var te = clamp01(e * 2);
            var px = lerp(sx, tx2, te), py = lerp(sy, ty2, te);
            ln(sx, sy, tx2, ty2, P.purple + '88', 1.6, [4, 3]);
            if (te < 1) circ(px, py, 7, P.purple + 'ff', 'none');
            tx(s.req.label, (sx + tx2) / 2 + (s.req.to === 'A' ? -4 : 4), (sy + ty2) / 2 - 10, fs, P.purple + 'ff', s.req.to === 'A' ? 'right' : 'left', true);
            if (s.resp && e > 0.5) {
                var re = clamp01((e - 0.5) * 2);
                var rc = s.resp.kind === 'err' ? P.red : (s.resp.kind === 'stale' ? P.yellow : P.green);
                var rx2 = lerp(tx2, sx, re), ry2 = lerp(ty2, sy, re);
                if (re < 1) circ(rx2, ry2, 7, rc + 'ff', 'none');
                var bw = Math.min(L.nodeW + 30, 190), bxp = tn.x + L.nodeW / 2 - bw / 2;
                bxp = Math.max(x0, Math.min(x0 + w - bw, bxp));
                ctx.globalAlpha = re;
                rr(bxp, nodeY + L.nodeH + 10, bw, 30, 8, rc + '22', rc + 'ff', 1.8);
                tx(s.resp.text, bxp + bw / 2, nodeY + L.nodeH + 25, fs - 0.5, rc + 'ff', 'center', true);
                ctx.globalAlpha = 1;
            }
        }

        /* 캡션 */
        var cy = nodeY + L.nodeH + 58;
        var cap1 = lines(s.cap || '', w - 12, fs);
        cap1.forEach(function (l, i) { tx(l, cx, cy + i * (fs + 5), fs, P.yellow + 'ff', 'center', true); });
        var cy2 = cy + cap1.length * (fs + 5) + 2;
        [s.cap2, s.cap3].forEach(function (c, k) {
            if (!c) return;
            lines(c, w - 12, fs - 1).forEach(function (l, i) {
                tx(l, cx, cy2 + i * (fs + 4), fs - 1, (k === 0 ? P.text : P.green) + 'ee', 'center', k === 1);
            });
            cy2 += lines(c, w - 12, fs - 1).length * (fs + 4) + 2;
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