/**
 * 다중 버전 동시성 제어(MVCC) 시각화
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
    var root    = el('div', 'mv-viz');
    var toolbar = el('div', 'mv-viz__toolbar');
    var tbLeft  = el('div', 'mv-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'mv-viz__title', 'MVCC'));

    var modeWrap = el('div', 'mv-viz__mode');
    var modeDefs = [
        { key: 'versions', label: '버전 만들기' },
        { key: 'snapshot', label: '스냅샷 읽기' },
        { key: 'vacuum', label: 'VACUUM' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'mv-viz__mode-btn' + (i === 0 ? ' mv-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'mv-viz__speed');
    speedWrap.appendChild(el('span', 'mv-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'mv-viz__speed-btn' + (i === 0 ? ' mv-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'mv-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'mv-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'mv-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'mv-viz__controls');
    var btnPlay  = el('button', 'mv-viz__btn mv-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'mv-viz__btn', '▶| STEP');
    var btnReset = el('button', 'mv-viz__btn', '↺ RESET');
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
    var mode    = 'versions';
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

    /* ===================== 엔진: 다중 버전 동시성 제어 ===================== */
    function bat(n) {
        return [0, 1, 3, 6, 7, 8].indexOf(Math.abs(n) % 10) >= 0;
    }
    function ga(n) {
        return bat(n) ? '이' : '가';
    }
    function eun(n) {
        return bat(n) ? '은' : '는';
    }
    function ro(n) {
        return [0, 3, 6].indexOf(Math.abs(n) % 10) >= 0 ? '으로' : '로';
    }
    var VER = [
        { name: 'v1', val: 1000, xmin: 100, b: 1, e: 3, xmax: 101 },
        { name: 'v2', val: 500, xmin: 101, b: 3, e: 5, xmax: 102 },
        { name: 'v3', val: 300, xmin: 102, b: 5, e: 7, xmax: 103 },
        { name: 'v4', val: 100, xmin: 103, b: 7, e: 0, xmax: 0 }
    ];
    var TMAX = 9;
    function visibleAt(t) {
        var k;
        for (k = VER.length - 1; k >= 0; k--) if (VER[k].b <= t && (VER[k].e === 0 || t < VER[k].e)) return k;
        return -1;
    }

    /* ===================== 데이터: 버전 만들기 ===================== */
    var VER_STEPS = [];
    function tstep(rows, cap, cap2, cap3, log) {
        return { kind: 'tbl', rows: rows, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }
    (function () {
        var k;
        var j;
        VER_STEPS.push(tstep([], '한 행의 수정은 새 버전을 만든다', 'xmin: 만든 트랜잭션 · xmax: 지운 트랜잭션', '커밋된 트랜잭션이라고 가정', 'PostgreSQL은 행을 수정할 때 기존 행을 덮어쓰지 않고 새 버전을 만듭니다. 각 버전에는 만든 트랜잭션 ID(xmin)와 지운 트랜잭션 ID(xmax, 없으면 0)가 붙습니다. 아래 STEP으로 같은 행이 세 번 수정되는 모습을 봅니다. 트랜잭션 ID는 설명을 위해 임의로 붙인 값입니다.'));
        var caps = ['INSERT (트랜잭션 100)', 'UPDATE → 500 (트랜잭션 101)', 'UPDATE → 300 (트랜잭션 102)', 'UPDATE → 100 (트랜잭션 103)'];
        var cap2 = ['첫 버전 v1 생성', 'v1의 xmax = 101, 새 버전 v2 생성', 'v2의 xmax = 102, 새 버전 v3 생성', 'v3의 xmax = 103, 새 버전 v4 생성'];
        for (k = 0; k < VER.length; k++) {
            var rows = [];
            for (j = 0; j <= k; j++) rows.push({ i: j, xmax: j < k ? VER[j].xmax : 0, cur: j === k, old: j < k });
            VER_STEPS.push(tstep(rows, caps[k], cap2[k], '버전 ' + (k + 1) + '개 · 현재 버전은 xmax = 0',
                k === 0 ? '트랜잭션 100이 값 1000인 행을 삽입합니다. 이 버전의 xmin은 100이고 아직 지운 트랜잭션이 없으므로 xmax는 0입니다.' :
                '트랜잭션 ' + (100 + k) + ga(100 + k) + ' 값을 ' + VER[k].val + ro(VER[k].val) + ' 수정합니다. 기존 버전 v' + k + eun(k) + ' 지워지지 않고 xmax가 ' + (100 + k) + ro(100 + k) + ' 표시되며, 새 버전 v' + (k + 1) + ga(k + 1) + ' 만들어집니다. 이제 행의 버전이 ' + (k + 1) + '개입니다.'));
        }
        var all = [];
        for (j = 0; j < VER.length; j++) all.push({ i: j, xmax: VER[j].xmax, cur: j === VER.length - 1, old: j < VER.length - 1 });
        VER_STEPS.push(tstep(all, '수정 3번 → 같은 행의 버전 4개', '이전 버전 3개는 xmax가 찍힌 채 남아 있음', '정리는 VACUUM이 나중에 한다', '정리 — 수정은 덮어쓰기가 아니라 새 버전 추가이고, 이전 버전은 xmax만 표시된 채 남습니다. 그 덕분에 다른 트랜잭션이 이전 버전을 읽을 수 있습니다. 더 이상 아무도 볼 필요가 없어진 이전 버전은 VACUUM이 나중에 치웁니다.'));
    })();

    /* ===================== 데이터: 스냅샷 읽기 ===================== */
    var RD = [{ name: 'A', t: 2 }, { name: 'B', t: 4 }, { name: 'C', t: 8 }];
    var SNAP_STEPS = [];
    function bstep(vcount, readers, cap, cap2, cap3, log, hz, removed) {
        return { kind: 'bars', vcount: vcount, readers: readers, hz: hz || 0, removed: removed || 0, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }
    (function () {
        SNAP_STEPS.push(bstep(0, 0, '읽기는 자기 스냅샷 시점의 버전을 본다', '막대 = 버전이 보이는 구간', '세로선 = 읽기 트랜잭션의 스냅샷', '한 행의 버전이 시간에 따라 만들어지고 사라지는 구간을 막대로 그렸습니다. 읽기 트랜잭션은 자기 스냅샷 시점에 세로선이 지나는 버전을 봅니다. 쓰기가 새 버전을 만들어도 읽기는 기다리지 않습니다.'));
        SNAP_STEPS.push(bstep(1, 0, 't = 1: INSERT, v1 = 1000', 'v1이 보이기 시작', '', 't = 1에 값 1000인 첫 버전 v1이 커밋됩니다.'));
        SNAP_STEPS.push(bstep(1, 1, 't = 2: 읽기 A가 시작', 'A의 스냅샷 = 2 → v1(1000)', '', '읽기 트랜잭션 A가 t = 2에 스냅샷을 잡습니다. 이 시점에 보이는 버전은 v1이므로 A는 1000을 봅니다.'));
        SNAP_STEPS.push(bstep(2, 1, 't = 3: UPDATE → 500', '새 버전 v2, v1은 t = 3에 끝남', 'A는 기다리지 않고 계속 v1을 봄', 't = 3에 쓰기 트랜잭션이 값을 500으로 수정하고 커밋합니다. v2가 생기고 v1의 구간은 3에서 끝나지만, A의 스냅샷은 2이므로 A는 여전히 v1(1000)을 봅니다. 쓰기는 A 때문에 막히지 않았고 A도 쓰기 때문에 막히지 않았습니다.'));
        SNAP_STEPS.push(bstep(2, 2, 't = 4: 읽기 B가 시작', 'B의 스냅샷 = 4 → v2(500)', 'A는 1000, B는 500', '읽기 B가 t = 4에 시작하면 이미 커밋된 v2를 봅니다. 같은 시각에 A는 1000을, B는 500을 읽습니다. 서로 다른 스냅샷이 서로 다른 버전을 보는 것입니다.'));
        SNAP_STEPS.push(bstep(3, 2, 't = 5: UPDATE → 300', '새 버전 v3', 'A와 B의 결과는 그대로', 't = 5에 값이 300으로 수정됩니다. A와 B의 스냅샷은 각각 2와 4로 고정되어 있으므로 읽는 값은 바뀌지 않습니다.'));
        SNAP_STEPS.push(bstep(4, 2, 't = 7: UPDATE → 100', '새 버전 v4(현재 버전)', '', 't = 7에 값이 100으로 수정됩니다. 현재 버전은 v4이고 v1부터 v3은 이전 버전이 되었습니다.'));
        SNAP_STEPS.push(bstep(4, 3, 't = 8: 읽기 C가 시작', 'C의 스냅샷 = 8 → v4(100)', 'A는 1000, B는 500, C는 100', '읽기 C는 t = 8에 시작해 최신 버전 v4를 봅니다. 세 읽기가 같은 행에서 각각 1000, 500, 100을 읽었고, 그동안 쓰기는 한 번도 읽기를 기다리지 않았습니다.'));
        SNAP_STEPS.push(bstep(4, 3, '읽기와 쓰기가 서로 막지 않는다', '각 읽기는 자기 시점의 일관된 값을 본다', '대신 이전 버전이 쌓임 → VACUUM', '정리 — MVCC는 이전 버전을 남겨 두어 읽기가 쓰기를 막지 않고 쓰기도 읽기를 막지 않게 합니다. 읽는 쪽은 자기 스냅샷에 맞는 버전을 보므로 읽는 도중 값이 바뀌어도 일관된 결과를 얻습니다. 쓰는 쪽끼리의 충돌은 별도로 처리됩니다. 대가는 이전 버전이 쌓이는 것입니다.'));
    })();

    /* ===================== 데이터: VACUUM ===================== */
    var VAC_STEPS = [];
    (function () {
        VAC_STEPS.push(bstep(4, 1, 'VACUUM: 쓸모없어진 버전을 치움', 'A가 t = 2의 스냅샷으로 아직 열려 있음', '버전 4개 · 현재 버전 v4', '수정이 쌓이면 이전 버전이 테이블에 남고, 더 이상 필요 없어진 버전은 dead tuple이 되어 VACUUM이 회수합니다. 지금은 읽기 A가 t = 2의 스냅샷을 잡은 채 열려 있고, v4가 현재 버전입니다.', 2, 0));
        VAC_STEPS.push(bstep(4, 1, 'A가 열린 채 VACUUM 실행', '회수 가능한 버전 0개', '가장 오래된 스냅샷(t = 2)이 기준', 'VACUUM은 가장 오래된 열린 트랜잭션의 기준(주황 선)보다 이전에 지워진 버전만 치울 수 있습니다. A의 기준이 t = 2에 묶여 있어 v1은 A가 읽고 있고, v2와 v3은 t = 2 이후에 지워진 버전이라 회수할 수 없습니다. 오래 열린 트랜잭션이 정리를 막는 모습입니다.', 2, 0));
        VAC_STEPS.push(bstep(4, 0, 'A가 끝남: 기준이 최신으로 이동', '기준 = t = 8', '', '읽기 A가 끝나면 열린 트랜잭션 중 가장 오래된 기준이 t = 8(현재)로 올라옵니다. 이제 v1부터 v3은 어떤 트랜잭션도 볼 필요가 없습니다.', 8, 0));
        VAC_STEPS.push(bstep(4, 0, 'VACUUM 실행: 버전 3개 회수', 'v1, v2, v3 제거 · v4만 남음', '공간은 테이블이 재사용', '기준이 올라간 상태에서 VACUUM이 실행되면 v1, v2, v3이 회수됩니다. 회수된 공간은 같은 테이블의 새 버전을 저장하는 데 다시 쓰입니다. 일반 VACUUM은 공간을 보통 운영체제에 돌려주지 않습니다.', 8, 3));
        VAC_STEPS.push(bstep(4, 0, '오래 열린 트랜잭션을 조심', 'autovacuum이 필요한 테이블을 자동 실행', '테이블이 불어나는 원인이 될 수 있음', '정리 — PostgreSQL은 autovacuum이 기본으로 켜져 있어 주기적으로 점검하며 필요한 테이블의 이전 버전을 치웁니다. 다만 스냅샷을 쥔 채 오래 열린 트랜잭션이 있으면 그 시점 이후에 지워진 버전을 치우지 못해 테이블이 불어날 수 있으므로, 긴 트랜잭션을 만들지 않는 것이 중요합니다.', 8, 3));
    })();

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'snapshot') return SNAP_STEPS;
        if (mode === 'vacuum') return VAC_STEPS;
        return VER_STEPS;
    }
    function defaultLog() {
        if (mode === 'snapshot') return '쓰기가 새 버전을 만들어도 읽기가 자기 스냅샷의 버전을 보는 모습을 봅니다.';
        if (mode === 'vacuum') return '더 이상 필요 없는 이전 버전을 VACUUM이 치우는 조건을 봅니다.';
        return '행을 수정할 때마다 새 버전이 쌓이는 모습을 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        return { fs: mob ? 11 : 12, total: mode === 'versions' ? (mob ? 352 : 300) : (mob ? 392 : 338) };
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

    /* ===================== 버전 표(힙 페이지) ===================== */
    function drawVersions(x0, top, w, mob, s, prev, e, fs) {
        var cx = x0 + w / 2;
        var cols = mob ? [0.1, 0.34, 0.62, 0.86] : [0.1, 0.32, 0.58, 0.82];
        var hy = top + 12;
        ['버전', '값', 'xmin(만든 트랜잭션)', 'xmax(지운 트랜잭션)'].forEach(function (h, i) {
            var lab = mob ? ['버전', '값', 'xmin', 'xmax'][i] : h;
            tx(lab, x0 + w * cols[i], hy, fs - 1, P.sub + 'ff', 'center', true);
        });
        var rh = 38, ty = top + 30;
        var prevN = prev && prev.rows ? prev.rows.length : 0;
        rr(x0, ty - 4, w, rh * 4 + 8, 10, P.surf, P.sub + '66', 1.4);
        s.rows.forEach(function (r) {
            var v = VER[r.i];
            var isNew = r.i >= prevN && s.rows.length > prevN;
            var a = isNew ? clamp01(e * 1.8) : 1;
            var y = ty + r.i * rh + (isNew ? (1 - a) * 24 : 0);
            var col = r.cur ? P.green : P.muted;
            ctx.globalAlpha = a;
            rr(x0 + 6, y + 3, w - 12, rh - 6, 8, col + (r.cur ? '26' : '12'), col + (r.cur ? 'ff' : 'aa'), r.cur ? 2.2 : 1.3);
            tx(v.name, x0 + w * cols[0], y + rh / 2, fs, (r.cur ? P.green : P.sub) + 'ff', 'center', true);
            tx(String(v.val), x0 + w * cols[1], y + rh / 2, fs + 1, (r.cur ? P.text : P.sub) + 'ff', 'center', true);
            tx(String(v.xmin), x0 + w * cols[2], y + rh / 2, fs, P.teal + 'ff', 'center', true);
            var stamped = !r.cur && r.xmax && r.i === prevN - 1 && s.rows.length > prevN;
            var xc = r.cur ? P.sub : (stamped && e < 1 ? P.yellow : P.orange);
            if (stamped && e < 1) rr(x0 + w * cols[3] - 22, y + 6, 44, rh - 12, 6, P.yellow + '33', P.yellow + 'ff', 2);
            tx(r.cur ? '0' : String(r.xmax), x0 + w * cols[3], y + rh / 2, fs, xc + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        });
        for (var i = s.rows.length; i < 4; i++) {
            var yy = ty + i * rh;
            rr(x0 + 6, yy + 3, w - 12, rh - 6, 8, 'none', P.muted + '44', 1);
        }
        caps(s, cx, w, ty + rh * 4 + 26, fs);
    }

    /* ===================== 시간축(스냅샷과 VACUUM) ===================== */
    function drawBars(x0, top, w, mob, s, prev, e, fs) {
        var cx = x0 + w / 2;
        var labW = 28, ax = x0 + labW + 4, aw = w - labW - 10;
        var tickW = aw / TMAX;
        function X(t) { return ax + t * tickW; }
        var by = top + 52, rh = 32;
        var pv = prev && prev.kind === 'bars' ? prev : s;
        /* 눈금 */
        for (var t = 0; t <= TMAX; t++) {
            ln(X(t), by - 6, X(t), by + rh * 4 + 2, P.muted + '2a', 1);
            if (t % 1 === 0) tx(String(t), X(t), by + rh * 4 + 14, fs - 1, P.sub + 'ff', 'center', false);
        }
        tx('시간 t', x0 + w, by + rh * 4 + 30, fs - 1, P.sub + 'ff', 'right', false);
        /* 버전 막대 */
        VER.forEach(function (v, k) {
            var shown = k < s.vcount;
            var wasShown = k < pv.vcount;
            var isNew = shown && !wasShown;
            var removed = k < s.removed;
            var a = isNew ? clamp01(e * 1.8) : 1;
            var y = by + k * rh;
            tx(v.name, x0 + labW / 2, y + rh / 2, fs, (shown ? P.text : P.sub) + 'ff', 'center', true);
            rr(ax, y + 4, aw, rh - 8, 6, 'none', P.muted + '33', 1);
            if (!shown) return;
            var endT = (k < s.vcount - 1) ? v.e : TMAX;
            var col = removed ? P.red : (k === s.vcount - 1 ? P.green : P.teal);
            var wasRemoved = k < pv.removed;
            var grow = isNew ? e : 1;
            ctx.globalAlpha = removed && !wasRemoved ? 1 - e * 0.7 : (removed ? 0.3 : a);
            rr(X(v.b), y + 4, Math.max(8, (X(endT) - X(v.b)) * grow), rh - 8, 6, col + '33', col + 'ff', k === s.vcount - 1 ? 2.2 : 1.6);
            if (X(endT) - X(v.b) > 60) tx(removed ? '회수됨' : String(v.val), (X(v.b) + X(endT)) / 2, y + rh / 2, fs, col + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        });
        /* 읽기 스냅샷 */
        var rcols = [P.orange, P.purple, P.yellow];
        RD.slice(0, s.readers).forEach(function (r, i) {
            var isNew = i >= pv.readers;
            var dropE = isNew ? clamp01(e * 1.6) : 1;
            var x = X(r.t);
            var yTop = top + 22;
            var yEnd = lerp(yTop, by + rh * 4, dropE);
            ln(x, yTop, x, yEnd, rcols[i] + 'ff', 2.4);
            var vk = -1;
            for (var k = Math.min(s.vcount, VER.length) - 1; k >= 0; k--) if (VER[k].b <= r.t && (k === s.vcount - 1 || r.t < VER[k].e)) { vk = k; break; }
            var chipTx = r.name + (vk >= 0 && dropE > 0.95 ? ' ' + VER[vk].val : '');
            ctx.font = '700 ' + fs + 'px "JetBrains Mono",monospace';
            var chw = ctx.measureText(chipTx).width + 14;
            var chx = Math.max(x0, Math.min(x0 + w - chw, x - chw / 2));
            rr(chx, yTop - 17, chw, 20, 6, rcols[i] + '33', rcols[i] + 'ff', 1.6);
            tx(chipTx, chx + chw / 2, yTop - 7, fs, rcols[i] + 'ff', 'center', true);
            if (vk >= 0 && dropE > 0.95) circ(x, by + vk * rh + rh / 2, 6, rcols[i] + 'ff', 'none');
        });
        /* VACUUM 기준선 */
        if (s.hz) {
            var hzx = X(s.hz);
            ln(hzx, by - 8, hzx, by + rh * 4, P.orange + 'ff', 2.4, [6, 4]);
            tx('기준 t=' + s.hz, hzx, by - 14, fs - 1, P.orange + 'ff', 'center', true);
        }
        caps(s, cx, w, by + rh * 4 + 46, fs);
    }

    /* ===================== 장면 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var fs = mob ? 11 : 12;
        var e = clamp01(t);
        var s = step || (mode === 'versions' ? { kind: 'tbl', rows: [], cap: '', cap2: '', cap3: '' } : { kind: 'bars', vcount: 0, readers: 0, hz: 0, removed: 0, cap: '', cap2: '', cap3: '' });
        if (mode === 'versions') drawVersions(x0, top, w, mob, s, prev, e, fs);
        else drawBars(x0, top, w, mob, s, prev, e, fs);
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
        speedBtns.forEach(function (b) { b.classList.remove('mv-viz__speed-btn--active'); });
        btn.classList.add('mv-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('mv-viz__mode-btn--active', d.key === m); });
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