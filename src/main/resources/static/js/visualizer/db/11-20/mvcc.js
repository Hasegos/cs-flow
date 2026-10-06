/**
 * MVCC 시각화
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
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

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
    var mode    = 'versions';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'snapshot') return SNAP_STEPS;
        if (mode === 'vacuum') return VAC_STEPS;
        return VER_STEPS;
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

    /* ===================== 버전 표: xmin과 xmax ===================== */
    function drawTable(x0, top, w, mob, s) {
        var fs = mob ? 11.5 : 13;
        var rh = mob ? 34 : 38;
        var cols = [0.1, 0.3, 0.5, 0.7];
        var heads = ['버전', '값', 'xmin', 'xmax'];
        var k;
        for (k = 0; k < 4; k++) tx(heads[k], x0 + w * cols[k] + (k === 0 ? 4 : 0), top + 8, fs - 1, P.sub + 'ff', 'left', true);
        tx('상태', x0 + w * 0.86, top + 8, fs - 1, P.sub + 'ff', 'left', true);
        for (k = 0; k < 4; k++) {
            var y = top + 20 + k * rh;
            rr(x0, y, w, rh - 4, 4, 'none', P.sub + '33', 1);
        }
        s.rows.forEach(function (r) {
            var v = VER[r.i];
            var y = top + 20 + r.i * rh;
            var col = r.cur ? P.teal : P.sub;
            rr(x0, y, w, rh - 4, 4, col + (r.cur ? '33' : '11'), col + 'ff', r.cur ? 2 : 1.2);
            tx(v.name, x0 + w * 0.1 + 4, y + (rh - 4) / 2, fs, P.text + 'ff', 'left', true);
            tx(String(v.val), x0 + w * 0.3, y + (rh - 4) / 2, fs, P.text + 'ff', 'left', true);
            tx(String(v.xmin), x0 + w * 0.5, y + (rh - 4) / 2, fs, P.text + 'ff', 'left', false);
            tx(String(r.xmax), x0 + w * 0.7, y + (rh - 4) / 2, fs, r.xmax ? P.orange + 'ff' : P.sub + 'ff', 'left', r.xmax !== 0);
            tx(r.cur ? '현재' : '이전', x0 + w * 0.86, y + (rh - 4) / 2, fs - 1, r.cur ? P.green + 'ff' : P.sub + 'ff', 'left', true);
        });
        drawCaps(s, x0, w, top + 20 + 4 * rh + 14, fs);
    }

    /* ===================== 시간축: 버전 구간과 스냅샷 ===================== */
    function drawBars(x0, top, w, mob, s) {
        var fs = mob ? 11.5 : 13;
        var lw = mob ? 62 : 84;
        var cw = (w - lw) / TMAX;
        var rh = mob ? 30 : 34;
        var k;
        var gx = function (t) { return x0 + lw + (t - 0.5) * cw; };
        for (k = 1; k <= TMAX - 1; k++) tx(String(k), gx(k), top + 8, fs - 1.5, P.sub + 'ff', 'center', false);
        tx('t', x0 + lw - 10, top + 8, fs - 1.5, P.sub + 'ff', 'right', true);
        for (k = 0; k < VER.length; k++) {
            var y = top + 20 + k * rh;
            var v = VER[k];
            var shown = k < s.vcount;
            var gone = shown && k < s.removed;
            tx(v.name + ' ' + v.val, x0 + 2, y + (rh - 6) / 2, fs - 0.5, shown ? (gone ? P.sub + 'ff' : P.text + 'ff') : P.sub + '88', 'left', shown && !gone);
            rr(x0 + lw, y, w - lw, rh - 6, 3, 'none', P.sub + '22', 1);
            if (shown) {
                var xe = v.e === 0 ? x0 + w : gx(v.e) - cw / 2;
                var xb = gx(v.b) - cw / 2;
                var col = gone ? P.sub : (v.e === 0 ? P.green : P.teal);
                rr(xb, y, xe - xb, rh - 6, 3, col + (gone ? '11' : '44'), col + (gone ? '88' : 'ff'), 1.6);
                if (gone) {
                    ctx.beginPath();
                    ctx.moveTo(xb + 4, y + 4);
                    ctx.lineTo(xe - 4, y + rh - 10);
                    ctx.strokeStyle = P.red + 'cc';
                    ctx.lineWidth = 1.6;
                    ctx.stroke();
                }
            }
        }
        var bottom = top + 20 + VER.length * rh;
        for (k = 0; k < s.readers; k++) {
            var r = RD[k];
            var x = gx(r.t);
            var cur = k === s.readers - 1;
            ctx.beginPath();
            ctx.moveTo(x, top + 14);
            ctx.lineTo(x, bottom);
            ctx.strokeStyle = P.purple + 'ff';
            ctx.lineWidth = cur ? 2.8 : 1.6;
            ctx.setLineDash([4, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
            var vi = visibleAt(r.t);
            tx(r.name, x, bottom + 10, fs - 0.5, P.purple + 'ff', 'center', true);
            tx(String(VER[vi].val), x, bottom + 24, fs - 1, P.text + 'ff', 'center', true);
        }
        if (s.hz) {
            var hx = gx(s.hz);
            ctx.beginPath();
            ctx.moveTo(hx, top + 14);
            ctx.lineTo(hx, bottom);
            ctx.strokeStyle = P.orange + 'ff';
            ctx.lineWidth = 2.4;
            ctx.stroke();
            tx('기준', hx, bottom + 40, fs - 1, P.orange + 'ff', 'center', true);
        }
        drawCaps(s, x0, w, bottom + (s.hz ? 62 : 44), fs);
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
        if (dsStep.kind === 'bars') drawBars(padX, top, fullW, mob, dsStep);
        else drawTable(padX, top, fullW, mob, dsStep);

        if (!step) {
            var hint = '아래 STEP으로 MVCC의 동작을 확인하세요.';
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
        neededH = mob ? 340 : 370;
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
        if (mode === 'snapshot') return '읽기 트랜잭션이 자기 스냅샷 시점의 버전을 보는 과정을 봅니다.';
        if (mode === 'vacuum') return '더 이상 필요 없는 이전 버전을 VACUUM이 치우는 과정을 봅니다.';
        return '행을 수정할 때 새 버전이 만들어지는 과정을 xmin과 xmax로 봅니다.';
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