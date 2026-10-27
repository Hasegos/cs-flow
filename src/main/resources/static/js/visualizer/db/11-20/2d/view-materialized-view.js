/**
 * 뷰 / 구체화 뷰 시각화
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
    var root    = el('div', 'vw-viz');
    var toolbar = el('div', 'vw-viz__toolbar');
    var tbLeft  = el('div', 'vw-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'vw-viz__title', 'View'));

    var modeWrap = el('div', 'vw-viz__mode');
    var modeDefs = [
        { key: 'view', label: '일반 뷰' },
        { key: 'mview', label: '구체화 뷰' },
        { key: 'refresh', label: 'REFRESH' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'vw-viz__mode-btn' + (i === 0 ? ' vw-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'vw-viz__speed');
    speedWrap.appendChild(el('span', 'vw-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'vw-viz__speed-btn' + (i === 0 ? ' vw-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'vw-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'vw-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'vw-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'vw-viz__controls');
    var btnPlay  = el('button', 'vw-viz__btn vw-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'vw-viz__btn', '▶| STEP');
    var btnReset = el('button', 'vw-viz__btn', '↺ RESET');
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
    var mode    = 'view';
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

    /* ===================== 엔진: 원본과 뷰 ===================== */
    var BASE0 = [['KR', 100], ['KR', 200], ['US', 150], ['KR', 50], ['US', 300], ['JP', 80]];
    var BASE1 = BASE0.concat([['KR', 150]]);
    function agg(base) {
        var order = ['KR', 'US', 'JP'];
        return order.map(function (rg) {
            var sum = 0;
            base.forEach(function (r) { if (r[0] === rg) sum += r[1]; });
            return [rg, sum];
        });
    }
    function vstep(o) {
        return { base: o.base, nw: o.nw === undefined ? -1 : o.nw, vname: o.vname, vkind: o.vkind, vcol: o.vcol, result: o.result || null, stale: !!o.stale, lock: !!o.lock, note: o.note || '', arrow: o.arrow || '', cost: o.cost || '', reader: o.reader || null, cap: o.cap, cap2: o.cap2, cap3: o.cap3, log: o.log };
    }
    function rd(text, kind) {
        return { text: text, kind: kind };
    }

    /* ===================== 데이터: 일반 뷰 ===================== */
    var VIEW_STEPS = [];
    (function () {
        var n = { vname: 'region_sales', vkind: '일반 뷰', vcol: 'teal' };
        function mk(o) {
            Object.keys(n).forEach(function (k) { o[k] = n[k]; });
            return vstep(o);
        }
        VIEW_STEPS.push(mk({ base: BASE0, note: '저장된 데이터 없음', cap: '뷰: 이름을 붙여 저장한 쿼리', cap2: '데이터는 저장하지 않음', cap3: '조회할 때마다 원본에서 실행', log: '일반 뷰는 SELECT 문에 이름을 붙여 저장한 것입니다. 테이블처럼 조회할 수 있지만 결과 데이터를 저장하지는 않습니다. 여기서는 orders를 지역별로 합산하는 region_sales 뷰를 예로 듭니다. 값은 설명을 위한 예시입니다.' }));
        VIEW_STEPS.push(mk({ base: BASE0, result: agg(BASE0), arrow: 'SELECT', cost: '원본 6행을 읽어 집계', reader: rd('조회 결과: 3행', 'ok'), cap: '조회하면 뷰의 쿼리가 원본에 실행된다', cap2: '원본 6행 → 결과 3행', cap3: '결과는 조회 시점의 최신 데이터', log: 'SELECT * FROM region_sales를 실행하면 데이터베이스가 뷰에 저장된 쿼리를 원본 orders에 실행합니다. 원본 6행을 읽어 지역별로 합산한 3행이 결과입니다.' }));
        VIEW_STEPS.push(mk({ base: BASE1, nw: 6, note: '저장된 데이터 없음', cap: 'orders에 새 행이 들어온다', cap2: '뷰는 따로 할 일이 없음', cap3: '뷰가 데이터를 저장하지 않으므로', log: '원본에 KR 150 행을 INSERT합니다. 뷰는 결과를 저장해 두지 않았으므로 갱신할 것이 없습니다.' }));
        VIEW_STEPS.push(mk({ base: BASE1, result: agg(BASE1), arrow: 'SELECT', cost: '원본 7행을 읽어 집계', reader: rd('조회 결과: KR 500', 'ok'), cap: '다시 조회하면 새 행이 반영된다', cap2: 'KR 합계가 350에서 500으로', cap3: '항상 최신, 대신 조회마다 계산', log: '다시 조회하면 뷰의 쿼리가 새 데이터가 든 원본에 실행되어 KR 합계가 500으로 나옵니다. 뷰는 항상 현재 원본을 보여 주지만, 조회할 때마다 원본 7행을 읽어 다시 계산합니다.' }));
        VIEW_STEPS.push(mk({ base: BASE1, result: agg(BASE1), cap: '일반 뷰: 항상 최신, 조회마다 계산', cap2: '무거운 쿼리는 조회할 때마다 비용이 듦', cap3: '쿼리를 감싸 단순하게 쓰는 용도에 적합', log: '정리 — 일반 뷰는 쿼리만 저장하므로 원본이 바뀌면 다음 조회부터 바로 반영됩니다. 대신 집계처럼 무거운 쿼리는 조회할 때마다 계산 비용이 듭니다. 복잡한 쿼리에 이름을 붙이거나 보여 줄 열을 제한하는 용도에 쓰입니다.' }));
    })();

    /* ===================== 데이터: 구체화 뷰 ===================== */
    var MV_STEPS = [];
    (function () {
        var n = { vname: 'region_mv', vkind: '구체화 뷰', vcol: 'purple' };
        function mk(o) {
            Object.keys(n).forEach(function (k) { o[k] = n[k]; });
            return vstep(o);
        }
        MV_STEPS.push(mk({ base: BASE0, note: '결과를 저장할 공간', cap: '구체화 뷰: 쿼리 결과를 저장해 둔다', cap2: '만들 때 쿼리를 실행해 결과를 채움', cap3: '조회는 저장된 결과를 읽음', log: '구체화 뷰는 뷰의 쿼리를 실행한 결과를 실제 데이터로 저장해 두는 객체입니다. 같은 지역별 합계를 이번에는 region_mv라는 구체화 뷰로 만듭니다.' }));
        MV_STEPS.push(mk({ base: BASE0, result: agg(BASE0), arrow: 'CREATE', cost: '원본 6행을 읽어 저장 (한 번)', cap: '생성: 쿼리를 실행해 결과를 저장', cap2: '원본 6행 → 저장된 3행', cap3: '결과가 실제 데이터로 존재', log: 'CREATE MATERIALIZED VIEW는 쿼리를 한 번 실행해 그 결과를 저장합니다. 원본 6행을 읽어 지역별 합계 3행이 구체화 뷰에 채워집니다.' }));
        MV_STEPS.push(mk({ base: BASE0, result: agg(BASE0), arrow: 'SELECT', cost: '저장된 3행만 읽음', reader: rd('조회 결과: 3행', 'ok'), cap: '조회: 저장된 결과를 바로 읽는다', cap2: '원본을 다시 집계하지 않음', cap3: '무거운 집계도 저장본을 읽기만 하면 됨', log: '구체화 뷰를 조회하면 저장된 3행을 그대로 읽습니다. 원본 orders를 다시 읽거나 집계하지 않으므로 무거운 쿼리를 매번 계산하는 일반 뷰보다 조회 비용이 작습니다.' }));
        MV_STEPS.push(mk({ base: BASE1, nw: 6, result: agg(BASE0), stale: true, note: '저장본은 그대로 (오래됨)', cap: 'orders에 새 행이 들어와도', cap2: '저장된 결과는 자동으로 바뀌지 않음', cap3: 'KR 합계: 저장본 350 · 실제 500', log: '원본에 KR 150 행을 INSERT합니다. 구체화 뷰에 저장된 결과는 이 변경을 자동으로 알지 못하므로 KR 합계가 저장본에서는 350, 실제로는 500이 되어 서로 달라집니다.' }));
        MV_STEPS.push(mk({ base: BASE1, result: agg(BASE0), stale: true, arrow: 'SELECT', cost: '저장된 3행만 읽음', reader: rd('조회 결과: 오래된 값 (KR 350)', 'stale'), cap: '조회하면 오래된 값이 나온다', cap2: '갱신 전까지 원본과 차이가 남', cap3: '허용 가능한 지연인지 판단해야 함', log: '이때 조회하면 저장본의 KR 350이 나옵니다. 빠르게 읽는 대신 갱신 전까지는 최신 값이 아닐 수 있고, 이 지연을 서비스가 허용할 수 있는지 판단해야 합니다.' }));
        MV_STEPS.push(mk({ base: BASE1, result: agg(BASE1), arrow: 'REFRESH', cost: '원본 7행을 다시 읽어 저장', cap: 'REFRESH로 저장된 결과를 갱신한다', cap2: 'KR 합계가 500으로', cap3: '다시 원본과 같아짐', log: 'REFRESH MATERIALIZED VIEW를 실행하면 쿼리를 다시 실행해 저장본을 새 결과로 바꿉니다. 원본 7행을 읽어 KR 합계가 500으로 갱신되고 저장본이 원본과 같아집니다.' }));
        MV_STEPS.push(mk({ base: BASE1, result: agg(BASE1), cap: '구체화 뷰: 빠른 조회, 대신 신선도를 양보', cap2: '갱신 주기를 정해야 함', cap3: '약간의 지연이 허용되는 집계 리포트에 적합', log: '정리 — 구체화 뷰는 쿼리 결과를 저장해 조회를 빠르게 하는 대신, 원본이 바뀌어도 자동으로 반영되지 않아 REFRESH로 갱신해야 합니다. 집계 리포트처럼 약간의 지연이 허용되는 무거운 쿼리에 맞습니다.' }));
    })();

    /* ===================== 데이터: REFRESH ===================== */
    var REF_STEPS = [];
    (function () {
        var n = { vname: 'region_mv', vkind: '구체화 뷰', vcol: 'purple' };
        function mk(o) {
            Object.keys(n).forEach(function (k) { o[k] = n[k]; });
            return vstep(o);
        }
        REF_STEPS.push(mk({ base: BASE1, result: agg(BASE0), stale: true, note: '저장본은 오래됨', cap: 'REFRESH 중에 조회는 어떻게 될까?', cap2: '구체화 뷰를 갱신하는 두 가지 방법', cap3: '일반 REFRESH와 CONCURRENTLY', log: '저장본이 오래된 구체화 뷰를 갱신하려고 합니다. 갱신하는 동안 다른 세션의 조회가 어떻게 되는지는 REFRESH 방식에 따라 다릅니다. 아래 STEP으로 일반 REFRESH와 CONCURRENTLY를 비교합니다.' }));
        REF_STEPS.push(mk({ base: BASE1, result: agg(BASE0), stale: true, lock: true, arrow: 'REFRESH', cost: '원본 7행을 다시 읽는 중', reader: rd('조회 대기 (잠금)', 'err'), cap: '일반 REFRESH: 갱신 동안 조회가 막힌다', cap2: '구체화 뷰에 강한 잠금을 잡음', cap3: '갱신이 끝날 때까지 SELECT가 기다림', log: '옵션 없이 REFRESH MATERIALIZED VIEW를 실행하면 구체화 뷰에 ACCESS EXCLUSIVE 잠금을 잡고 내용을 통째로 바꿉니다. 그동안 이 구체화 뷰를 조회하려는 세션은 갱신이 끝날 때까지 기다립니다. 변경되는 행이 많을 때는 자원을 적게 쓰고 더 빨리 끝나는 경향이 있습니다.' }));
        REF_STEPS.push(mk({ base: BASE1, result: agg(BASE1), arrow: 'REFRESH', cost: '갱신 완료', reader: rd('조회 가능 (새 데이터)', 'ok'), cap: '갱신이 끝나면 새 데이터로 조회된다', cap2: 'KR 합계 500', cap3: '대기하던 조회가 이어서 실행됨', log: '갱신이 끝나면 잠금이 풀리고 대기하던 조회가 새 데이터로 실행됩니다. 갱신 시간이 길수록 조회가 막히는 시간도 깁니다.' }));
        REF_STEPS.push(mk({ base: BASE1, result: agg(BASE0), stale: true, arrow: 'REFRESH', cost: '새 결과를 따로 만드는 중', reader: rd('조회 가능 (이전 데이터)', 'stale'), cap: 'CONCURRENTLY: 갱신 중에도 조회가 된다', cap2: '이전 데이터를 보여 주다가 차이만 반영', cap3: 'UNIQUE 인덱스 필요 · 변경이 많으면 더 느림', log: 'REFRESH MATERIALIZED VIEW CONCURRENTLY는 조회를 막지 않고 갱신합니다. 새 결과를 따로 만든 뒤 기존 저장본과의 차이만 반영하는 방식으로 동작하므로 그동안 조회는 이전 데이터를 읽습니다. 컬럼으로만 만든 UNIQUE 인덱스가 하나 이상 있어야 하고, 한 구체화 뷰에 동시에 하나의 REFRESH만 실행할 수 있습니다.' }));
        REF_STEPS.push(mk({ base: BASE1, result: agg(BASE1), cap: '갱신 방식은 조회를 막아도 되는지로 고른다', cap2: 'PostgreSQL은 자동으로 갱신하지 않음', cap3: '정기 실행은 외부 스케줄러로', log: '정리 — 조회를 잠시 막아도 되면 일반 REFRESH, 갱신 중에도 조회가 계속되어야 하면 CONCURRENTLY를 씁니다. PostgreSQL의 구체화 뷰는 REFRESH 명령을 실행해야 갱신되므로, 정기적으로 갱신하려면 예를 들어 외부 스케줄러로 명령을 실행합니다.' }));
    })();

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'mview') return MV_STEPS;
        if (mode === 'refresh') return REF_STEPS;
        return VIEW_STEPS;
    }
    function defaultLog() {
        if (mode === 'mview') return '쿼리 결과를 저장해 두는 구체화 뷰의 동작을 봅니다.';
        if (mode === 'refresh') return '구체화 뷰를 갱신하는 동안 조회가 어떻게 되는지 봅니다.';
        return '쿼리만 저장하는 일반 뷰의 동작을 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        return { fs: mob ? 11.5 : 13, rowH: 20, H: 30 + 7 * 20, total: 8 + 170 + 78 + (mob ? 100 : 70) };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function caps(s, cx, w, y, fs) {
        var yy = y;
        [[s.cap, P.yellow, true, fs - 0.5], [s.cap2, P.text, false, fs - 1], [s.cap3, P.green, true, fs - 1]].forEach(function (c) {
            if (!c[0]) return;
            var ls = lines(c[0], w - 12, c[3]);
            ls.forEach(function (l, i) { tx(l, cx, yy + i * (c[3] + 5), c[3], c[1] + 'ee', 'center', c[2]); });
            yy += ls.length * (c[3] + 5) + 3;
        });
    }

    /* ===================== 원본과 뷰 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var fs = L.fs, rowH = L.rowH, H = L.H;
        var e = clamp01(t);
        var s = step || currentSteps()[0];
        var p = prev || s;
        var lw = mob ? 98 : 150, rw = mob ? 140 : 190;
        var y0 = top + 8;
        var rx = x0 + w - rw;
        var k;
        var reads = s.arrow === 'CREATE' || s.arrow === 'REFRESH' || (s.arrow === 'SELECT' && s.vkind === '일반 뷰');
        var n = s.base.length;
        var pos = reads && e < 1 ? e * n : (reads ? n : 0);

        /* 원본 테이블 */
        rr(x0, y0, lw, H, 8, P.teal + '11', P.teal + 'ff', 1.6);
        tx('orders', x0 + lw / 2, y0 + 12, fs, P.text + 'ff', 'center', true);
        tx('(원본)', x0 + lw / 2, y0 + 27, fs - 1, P.sub + 'ff', 'center', false);
        for (k = 0; k < n; k++) {
            var ry = y0 + 30 + k * rowH + rowH / 2 + 4;
            var isNew = k === s.nw;
            var fresh = isNew && (p.nw !== s.nw || p.base.length !== n);
            var a = fresh ? clamp01(e * 1.6) : 1;
            var ox = fresh ? (1 - clamp01(e * 1.6)) * 36 : 0;
            ctx.globalAlpha = a;
            if (isNew) rr(x0 + 4 + ox, ry - rowH / 2 + 1, lw - 8, rowH - 2, 4, P.green + '44', P.green + 'ff', 1.4);
            else if (k < pos && e < 1) rr(x0 + 4, ry - rowH / 2 + 1, lw - 8, rowH - 2, 4, P.yellow + '44', P.yellow + 'aa', 1.2);
            tx(s.base[k][0], x0 + 12 + ox, ry, fs - 0.5, P.text + 'ff', 'left', isNew);
            tx(String(s.base[k][1]), x0 + lw - 12 + ox, ry, fs - 0.5, P.text + 'ff', 'right', isNew);
            ctx.globalAlpha = 1;
        }
        if (reads && e < 1) {
            var scanY = y0 + 30 + 4 + pos * rowH;
            ln(x0 + 4, scanY, x0 + lw - 4, scanY, P.yellow + 'ff', 2);
        }

        /* 뷰 */
        var vc = s.lock ? P.red : (s.stale ? P.orange : P[s.vcol]);
        var shake = s.lock && !p.lock && e < 1 ? Math.sin(e * 36) * 2.5 : 0;
        rr(rx + shake, y0, rw, H, 8, vc + '11', vc + 'ff', s.lock ? 2.6 : 1.8);
        tx(s.vname, rx + rw / 2 + shake, y0 + 12, fs, P.text + 'ff', 'center', true);
        tx(s.vkind, rx + rw / 2 + shake, y0 + 28, fs - 1, P[s.vcol] + 'ff', 'center', true);
        var actual = agg(s.base);
        if (s.result) {
            for (k = 0; k < s.result.length; k++) {
                var yy = y0 + 62 + k * 26;
                var val = s.result[k][1];
                var pv = p.result && p.result[k] ? p.result[k][1] : null;
                var diff = s.stale && s.result[k][0] === 'KR';
                var q = clamp01((e - 0.4) / 0.6);
                var al = p.result ? 1 : (reads ? q : clamp01(e * 1.6));
                var shown = (pv !== null && pv !== val) ? Math.round(lerp(pv, val, q)) : val;
                var flash = pv !== null && pv !== val && e < 1;
                var rc = flash ? P.yellow : (diff ? P.orange : P.sub);
                ctx.globalAlpha = al;
                rr(rx + 8 + shake, yy - 11, rw - 16, 22, 4, rc + (flash ? '55' : '22'), rc + (flash ? 'ff' : '88'), flash ? 2 : 1.2);
                tx(s.result[k][0], rx + 18 + shake, yy, fs - 0.5, P.text + 'ff', 'left', true);
                if (diff) tx('→ ' + actual[k][1], rx + rw / 2 + 6 + shake, yy, fs - 1, P.sub + 'ff', 'center', false);
                tx(String(shown), rx + rw - 18 + shake, yy, fs - 0.5, diff ? P.orange + 'ff' : P.text + 'ff', 'right', true);
                ctx.globalAlpha = 1;
            }
        }
        if (s.lock) tx('조회 잠금', rx + rw / 2, y0 + H - 18, fs - 1, P.red + 'ff', 'center', true);
        else if (s.note) {
            var nl = lines(s.note, rw - 10, fs - 1);
            nl.forEach(function (l2, li2) {
                tx(l2, rx + rw / 2, y0 + H - 12 - (nl.length - li2) * (fs + 1) + (fs + 1) / 2, fs - 1, s.stale ? P.orange + 'ff' : P.sub + 'ff', 'center', false);
            });
        }

        /* 화살표와 행 이동 */
        var my = y0 + H / 2;
        if (s.arrow) {
            var ax0 = x0 + lw + 6, ax1 = rx - 6;
            var ac = (s.lock ? P.red : P.purple) + 'ff';
            ln(ax0, my, ax1, my, ac, 2.2);
            ln(ax1, my, ax1 - 7, my - 5, ac, 2.2);
            ln(ax1, my, ax1 - 7, my + 5, ac, 2.2);
            tx(s.arrow, (ax0 + ax1) / 2, my - 14, fs - 1, P.purple + 'ff', 'center', true);
            if (reads && e < 1) {
                for (var d = 0; d < 3; d++) {
                    var qd = clamp01(e * 1.5 - d * 0.18);
                    if (qd > 0 && qd < 1) circ(lerp(ax0, ax1, qd), my + 14 + (d - 1) * 9, 4.5, P.yellow + 'ff', 'none');
                }
            }
        }

        /* 비용과 조회 결과 */
        ctx.globalAlpha = s.cost && !p.cost ? e : 1;
        if (s.cost) tx(s.cost, x0 + w / 2, y0 + H + 16, fs - 0.5, P.text + 'ee', 'center', true);
        ctx.globalAlpha = 1;
        if (s.reader) {
            var bw = Math.min(w, mob ? 320 : 380);
            var rk = s.reader.kind === 'ok' ? P.green : (s.reader.kind === 'err' ? P.red : P.orange);
            var fresh2 = !p.reader || p.reader.text !== s.reader.text;
            var pulse = s.reader.kind === 'err' ? 1.8 + Math.sin(e * 14) * 0.8 : 1.8;
            var bx = x0 + (w - bw) / 2;
            var by = y0 + H + 30;
            if (fresh2 && e < 1) {
                var dq = clamp01(e * 1.6);
                circ(lerp(rx + rw / 2, bx + bw / 2, dq), lerp(y0 + H - 4, by + 13, dq), 5, rk + 'ff', 'none');
            }
            ctx.globalAlpha = fresh2 ? clamp01((e - 0.3) / 0.7) : 1;
            rr(bx, by, bw, 26, 6, rk + '22', rk + 'ff', pulse);
            tx(s.reader.text, x0 + w / 2, by + 13, fs - 0.5, rk + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        }
        caps(s, x0 + w / 2, w, y0 + H + 78, fs);
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
        speedBtns.forEach(function (b) { b.classList.remove('vw-viz__speed-btn--active'); });
        btn.classList.add('vw-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('vw-viz__mode-btn--active', d.key === m); });
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