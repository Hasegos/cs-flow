/**
 * 트랜잭션 격리 수준 시각화
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
    var root    = el('div', 'il-viz');
    var toolbar = el('div', 'il-viz__toolbar');
    var tbLeft  = el('div', 'il-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'il-viz__title', 'ISOLATION LEVELS'));

    var modeWrap = el('div', 'il-viz__mode');
    var modeDefs = [
        { key: 'dirty', label: 'Dirty Read' },
        { key: 'nonrep', label: 'Non-repeatable Read' },
        { key: 'phantom', label: 'Phantom Read' },
        { key: 'levels', label: '격리 수준 표' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'il-viz__mode-btn' + (i === 0 ? ' il-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'il-viz__speed');
    speedWrap.appendChild(el('span', 'il-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'il-viz__speed-btn' + (i === 0 ? ' il-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'il-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'il-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'il-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'il-viz__controls');
    var btnPlay  = el('button', 'il-viz__btn il-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'il-viz__btn', '▶| STEP');
    var btnReset = el('button', 'il-viz__btn', '↺ RESET');
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
    var mode    = 'dirty';
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

    /* ===================== 엔진: 격리 수준과 이상 현상 ===================== */
    var LEVELS = ['Read Uncommitted', 'Read Committed', 'Repeatable Read', 'Serializable'];
    var ANOM = ['Dirty', 'Non-rep.', 'Phantom'];
    var STD = [[1, 1, 1], [0, 1, 1], [0, 0, 1], [0, 0, 0]];

    /* ===================== 데이터: 이상 현상 시나리오 ===================== */
    function evt(lane, col, t, res, cap, cap2, cap3, log) {
        return { lane: lane, col: col, t: t, res: res, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }
    var SCEN = {
        dirty: {
            col: 0,
            title: 'Dirty Read: 커밋되지 않은 값을 읽음',
            intro: '계좌 잔액이 1000인 행이 있습니다. T2가 잔액을 500으로 바꾸고 아직 커밋하지 않은 상태에서 T1이 읽으면 어떻게 될까요? 격리 수준에 따라 결과가 다릅니다.',
            ev: [
                evt(0, 0, 'BEGIN', null, 'T1 시작', '잔액 = 1000', '', 'T1이 트랜잭션을 시작합니다. 잔액은 1000입니다.'),
                evt(1, 1, 'UPDATE 500', null, 'T2: 잔액을 500으로 변경', '아직 COMMIT하지 않음', '', 'T2가 잔액을 500으로 바꿉니다. 아직 커밋하지 않았으므로 다른 트랜잭션에는 확정된 값이 아닙니다.'),
                evt(0, 2, 'SELECT', [['RU: 500', 'bad'], ['RC+: 1000', 'ok']], 'T1이 잔액을 읽음', 'RU: 500 (더러운 값) · RC 이상: 1000', 'RC+ = Read Committed 이상', 'Read Uncommitted에서는 T1이 T2의 미커밋 값 500을 읽을 수 있습니다. Read Committed 이상에서는 커밋된 값 1000만 읽습니다.'),
                evt(1, 3, 'ROLLBACK', null, 'T2가 ROLLBACK', '잔액은 다시 1000', 'T1이 읽은 500은 존재한 적 없는 값', 'T2가 롤백하면 500은 확정된 적이 없는 값이 됩니다. Read Uncommitted로 500을 읽었다면 T1은 잘못된 값을 근거로 일을 한 셈입니다. PostgreSQL은 Read Uncommitted를 Read Committed처럼 처리해 이 현상이 일어나지 않습니다.')
            ]
        },
        nonrep: {
            col: 1,
            title: 'Non-repeatable Read: 같은 행을 두 번 읽었는데 값이 다름',
            intro: '같은 트랜잭션 안에서 같은 행을 두 번 읽는 사이에 T2가 그 행을 수정하고 커밋합니다. 두 번째 읽기가 첫 번째와 같을까요?',
            ev: [
                evt(0, 0, 'BEGIN', null, 'T1 시작', '잔액 = 1000', '', 'T1이 트랜잭션을 시작합니다.'),
                evt(0, 1, 'SELECT', [['1000', 'ok']], 'T1 첫 번째 읽기', '잔액 = 1000', '', 'T1이 처음 읽으면 1000입니다.'),
                evt(1, 2, 'UPDATE+COMMIT', null, 'T2: 500으로 변경하고 COMMIT', '확정된 값이 500으로 바뀜', '', 'T2가 잔액을 500으로 바꾸고 커밋합니다. 이제 확정된 값이 500입니다.'),
                evt(0, 3, 'SELECT', [['RC: 500', 'bad'], ['RR+: 1000', 'ok']], 'T1 두 번째 읽기', 'RC: 500 (값이 달라짐) · RR 이상: 1000', 'RR+ = Repeatable Read 이상', 'Read Committed는 문장마다 그 시점의 커밋된 값을 읽으므로 두 번째 읽기가 500입니다. Repeatable Read 이상은 트랜잭션 동안 같은 스냅샷을 유지해 두 번째도 1000입니다.')
            ]
        },
        phantom: {
            col: 2,
            title: 'Phantom Read: 같은 조건으로 조회했는데 행이 늘어남',
            intro: '같은 조건의 조회를 두 번 하는 사이에 T2가 조건에 맞는 행을 새로 추가하고 커밋합니다. 두 번째 조회 결과의 행 수가 같을까요?',
            ev: [
                evt(0, 0, 'BEGIN', null, 'T1 시작', '금액 100 초과인 행 2개', '', 'T1이 트랜잭션을 시작합니다. 금액이 100을 넘는 행은 2개입니다.'),
                evt(0, 1, 'COUNT', [['2', 'ok']], 'T1 첫 번째 조회', '금액 > 100 인 행 수 = 2', '', 'T1이 조건에 맞는 행의 수를 세면 2입니다.'),
                evt(1, 2, 'INSERT+COMMIT', null, 'T2: 금액 200인 행 추가 후 COMMIT', '조건에 맞는 행이 3개로 늘어남', '', 'T2가 금액 200인 행을 추가하고 커밋합니다. 조건에 맞는 행이 3개가 됩니다.'),
                evt(0, 3, 'COUNT', [['RC: 3', 'bad'], ['PG RR+: 2', 'ok']], 'T1 두 번째 조회', 'RC: 3 (유령 행) · PostgreSQL RR 이상: 2', 'SQL 표준의 RR은 팬텀을 허용할 수 있음', 'Read Committed에서는 두 번째 조회가 3이라 새로 생긴 행(유령)이 보입니다. SQL 표준은 Repeatable Read에서도 팬텀을 허용하지만, PostgreSQL의 Repeatable Read는 스냅샷을 쓰므로 2로 유지됩니다. Serializable은 표준과 PostgreSQL 모두 막습니다.')
            ]
        }
    };
    var IL_STEPS = {};
    (function () {
        var key;
        var k;
        for (key in SCEN) {
            var sc = SCEN[key];
            var arr = [{ kind: 'tl', key: key, upto: 0, cap: sc.title, cap2: '아래 STEP으로 T1과 T2의 순서를 따라가세요', cap3: '', log: sc.intro }];
            for (k = 0; k < sc.ev.length; k++) {
                var e = sc.ev[k];
                arr.push({ kind: 'tl', key: key, upto: k + 1, cap: e.cap, cap2: e.cap2, cap3: e.cap3, log: e.log });
            }
            IL_STEPS[key] = arr;
        }
    })();
    var LV_STEPS = [
        { kind: 'lv', row: -1, cap: 'SQL 표준의 격리 수준 4단계', cap2: '높을수록 이상 현상을 더 막음', cap3: '표는 SQL 표준 기준, 빨강 = 발생 가능', log: '격리 수준은 동시에 실행되는 트랜잭션이 서로의 변경을 얼마나 볼 수 있는지를 정합니다. SQL 표준은 Dirty Read, Non-repeatable Read, Phantom Read 세 가지 이상 현상을 기준으로 네 단계를 정의합니다.' },
        { kind: 'lv', row: 0, cap: 'Read Uncommitted', cap2: '표준: 세 현상 모두 발생 가능', cap3: 'PostgreSQL은 Read Committed와 동일하게 동작', log: 'Read Uncommitted는 표준에서 미커밋 변경도 읽을 수 있는 가장 낮은 수준입니다. PostgreSQL은 이 수준을 요청해도 Read Committed처럼 동작하므로 Dirty Read가 일어나지 않습니다.' },
        { kind: 'lv', row: 1, cap: 'Read Committed', cap2: 'Dirty Read 방지 · 문장마다 새 스냅샷', cap3: 'PostgreSQL의 기본 격리 수준', log: 'Read Committed는 커밋된 데이터만 읽고, 각 문장이 실행되는 시점의 최신 커밋 상태를 봅니다. 그래서 같은 행을 두 번 읽으면 값이 달라질 수 있습니다. PostgreSQL의 기본 격리 수준입니다.' },
        { kind: 'lv', row: 2, cap: 'Repeatable Read', cap2: '트랜잭션 동안 같은 스냅샷', cap3: '표준: 팬텀 가능 · PostgreSQL: 팬텀도 방지', log: 'Repeatable Read는 트랜잭션 동안 같은 스냅샷을 보므로 같은 행을 다시 읽어도 값이 같습니다. SQL 표준은 팬텀을 허용하지만 PostgreSQL의 구현은 팬텀도 막습니다. 다른 트랜잭션과 충돌하는 수정은 직렬화 실패로 중단될 수 있어 재시도가 필요합니다.' },
        { kind: 'lv', row: 3, cap: 'Serializable', cap2: '세 현상 모두 방지', cap3: '직렬화 실패 시 재시도 필요', log: 'Serializable은 트랜잭션들이 한 번에 하나씩 순서대로 실행된 것과 같은 결과를 보장하는 가장 높은 수준입니다. 대신 충돌이 감지되면 트랜잭션이 직렬화 실패로 중단될 수 있어 애플리케이션이 재시도해야 합니다.' },
        { kind: 'lv', row: -1, cap: '수준을 올릴수록 안전하지만', cap2: '충돌과 재시도 비용이 늘 수 있음', cap3: '업무에 필요한 만큼만 선택', log: '정리 — 높은 격리 수준은 이상 현상을 더 막는 대신 충돌 처리 비용(대기, 직렬화 실패와 재시도)이 늘 수 있습니다. 업무가 어떤 이상 현상을 견딜 수 있는지에 따라 수준을 고릅니다.' }
    ];

    /* ===================== 장면 데이터: DB 상태 ===================== */
    var DBV = {
        dirty: { label: '잔액', vals: [['1000'], ['1000'], ['1000', '500'], ['1000', '500'], ['1000']] },
        nonrep: { label: '잔액', vals: [['1000'], ['1000'], ['1000'], ['500'], ['500']] },
        phantom: { label: '금액 > 100 인 행 수', vals: [['2'], ['2'], ['2'], ['3'], ['3']] }
    };

    /* ===================== 장면 데이터: DB 상태 ===================== */
    var DBV = {
        dirty: { label: '잔액', vals: [['1000'], ['1000'], ['1000', '500'], ['1000', '500'], ['1000']] },
        nonrep: { label: '잔액', vals: [['1000'], ['1000'], ['1000'], ['500'], ['500']] },
        phantom: { label: '금액 > 100 인 행 수', vals: [['2'], ['2'], ['2'], ['3'], ['3']] }
    };

    /* ===================== 장면 데이터: DB 상태 ===================== */
    var DBV = {
        dirty: { label: '잔액', vals: [['1000'], ['1000'], ['1000', '500'], ['1000', '500'], ['1000']] },
        nonrep: { label: '잔액', vals: [['1000'], ['1000'], ['1000'], ['500'], ['500']] },
        phantom: { label: '금액 > 100 인 행 수', vals: [['2'], ['2'], ['2'], ['3'], ['3']] }
    };

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'levels') return LV_STEPS;
        return IL_STEPS[mode];
    }
    function defaultLog() {
        if (mode === 'levels') return '격리 수준별로 어떤 이상 현상이 막히는지 표로 봅니다.';
        return '두 트랜잭션 T1, T2가 시간 순서대로 실행될 때 T1이 읽는 값이 어떻게 달라지는지 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        return { fs: mob ? 11 : 12, total: mode === 'levels' ? (mob ? 372 : 318) : (mob ? 372 : 312) };
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

    /* ===================== 타임라인 장면 ===================== */
    function drawTimeline(x0, top, w, mob, s, prev, e, fs) {
        var cx = x0 + w / 2;
        var sc = SCEN[s.key];
        var upto = s.upto;
        var pupto = prev && prev.key === s.key ? prev.upto : upto;

        /* DB 상태 */
        var dv = DBV[s.key].vals[upto], pv = DBV[s.key].vals[pupto];
        var lab = DBV[s.key].label;
        tx('DB의 ' + lab, cx, top + 8, fs, P.sub + 'ff', 'center', true);
        var pw = 92, py = top + 18;
        var cc = dv[0] !== pv[0] && e < 1 ? P.yellow : P.green;
        rr(cx - pw - 8, py, pw, 30, 8, cc + '22', cc + 'ff', 2);
        tx('확정 ' + dv[0], cx - pw / 2 - 8, py + 15, fs + 1, cc + 'ff', 'center', true);
        if (dv[1]) {
            rr(cx + 8, py, pw + 14, 30, 8, P.orange + '1a', P.orange + 'ff', 1.8);
            tx('T2 미커밋 ' + dv[1], cx + 8 + (pw + 14) / 2, py + 15, fs, P.orange + 'ff', 'center', true);
        }

        /* 레인 */
        var labW = 34, ax = x0 + labW, aw = w - labW;
        var colW = aw / 4;
        var laneTop = [top + 62, top + 62 + 104];
        var laneH = [100, 52];
        ['T1', 'T2'].forEach(function (nm, i) {
            var col = i === 0 ? P.teal : P.orange;
            rr(ax, laneTop[i], aw, laneH[i], 8, 'none', P.muted + '55', 1.2);
            tx(nm, x0 + labW / 2 - 2, laneTop[i] + 24, fs + 1, col + 'ff', 'center', true);
        });
        for (var c = 1; c < 4; c++) ln(ax + colW * c, laneTop[0], ax + colW * c, laneTop[1] + laneH[1], P.muted + '33', 1);

        /* 이벤트 */
        for (var k = 0; k < upto; k++) {
            var ev = sc.ev[k];
            var isNew = k === upto - 1 && upto > pupto;
            var a = isNew ? clamp01(e * 2) : 1;
            var col = ev.lane === 0 ? P.teal : P.orange;
            var chW = colW - 8, chH = 34;
            var chX = ax + colW * ev.col + 4;
            var chY = laneTop[ev.lane] + 8 + (isNew ? (1 - a) * -12 : 0);
            ctx.globalAlpha = a;
            rr(chX, chY, chW, chH, 7, col + '26', col + 'ff', isNew ? 2.4 : 1.6);
            var parts = ev.t.split('+');
            if (parts.length > 1) {
                tx(parts[0], chX + chW / 2, chY + 11, fs - 1, col + 'ff', 'center', true);
                tx('+' + parts[1], chX + chW / 2, chY + 25, fs - 1, col + 'ff', 'center', true);
            } else {
                tx(ev.t, chX + chW / 2, chY + chH / 2, fs - 0.5, col + 'ff', 'center', true);
            }
            if (ev.res) {
                ev.res.forEach(function (rs, j) {
                    var rc = rs[1] === 'bad' ? P.red : P.green;
                    var ra = isNew ? clamp01((e - 0.4) * 2.2) : 1;
                    ctx.globalAlpha = ra;
                    ctx.font = '700 ' + (fs - 1) + 'px "JetBrains Mono",monospace';
                    var pw2 = Math.max(chW + 4, ctx.measureText(rs[0]).width + 12);
                    var px2 = Math.max(x0 + labW, Math.min(x0 + w - pw2, chX + chW / 2 - pw2 / 2));
                    rr(px2, chY + chH + 6 + j * 25, pw2, 21, 6, rc + '22', rc + 'ff', 1.5);
                    tx(rs[0], px2 + pw2 / 2, chY + chH + 16.5 + j * 25, fs - 1, rc + 'ff', 'center', true);
                });
            }
            ctx.globalAlpha = 1;
        }
        tx('시간 →', x0 + w, laneTop[1] + laneH[1] + 12, fs - 1, P.sub + 'ff', 'right', false);
        caps(s, cx, w, laneTop[1] + laneH[1] + 34, fs);
    }

    /* ===================== 격리 수준 표 장면 ===================== */
    function drawLevels(x0, top, w, mob, s, prev, e, fs) {
        var cx = x0 + w / 2;
        var nameW = mob ? 124 : 150;
        var cw = (w - nameW) / 3, rh = 34, hy = top + 4, ty = top + 34;
        ANOM.forEach(function (a, i) {
            tx(a, x0 + nameW + cw * (i + 0.5), hy + 12, fs - (mob ? 1 : 0), P.sub + 'ff', 'center', true);
        });
        var prow = prev ? prev.row : -1;
        var hy2 = lerp(prow >= 0 ? prow : (s.row >= 0 ? s.row : 0), s.row >= 0 ? s.row : (prow >= 0 ? prow : 0), e);
        if (s.row >= 0) {
            var ry = ty + hy2 * rh;
            rr(x0 - 2, ry, w + 4, rh, 8, P.yellow + '1c', P.yellow + 'ff', 2.4);
        }
        LEVELS.forEach(function (lv, r) {
            var y = ty + r * rh;
            var act = s.row === r;
            tx(lv, x0 + 8, y + rh / 2, fs, (act ? P.yellow : P.text) + 'ff', 'left', true);
            STD[r].forEach(function (v, c) {
                var col = v ? P.red : P.green;
                var shown = s.row < 0 || r <= s.row ? 1 : 0.45;
                ctx.globalAlpha = shown;
                var x = x0 + nameW + cw * (c + 0.5);
                rr(x - 24, y + 5, 48, rh - 10, 6, col + '22', col + 'ff', act ? 2 : 1.3);
                tx(v ? '발생' : '방지', x, y + rh / 2, fs - 1, col + 'ff', 'center', true);
                ctx.globalAlpha = 1;
            });
        });
        tx('빨강 = 발생 가능(SQL 표준) · 초록 = 방지', cx, ty + 4 * rh + 14, fs - 1, P.sub + 'ff', 'center', false);
        caps(s, cx, w, ty + 4 * rh + 40, fs);
    }

    /* ===================== 장면 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var fs = mob ? 11 : 12;
        var e = clamp01(t);
        var s = step || (mode === 'levels' ? { kind: 'lv', row: -1 } : { kind: 'tl', key: mode, upto: 0 });
        if (mode === 'levels') drawLevels(x0, top, w, mob, s, prev, e, fs);
        else drawTimeline(x0, top, w, mob, s, prev, e, fs);
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
        speedBtns.forEach(function (b) { b.classList.remove('il-viz__speed-btn--active'); });
        btn.classList.add('il-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('il-viz__mode-btn--active', d.key === m); });
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