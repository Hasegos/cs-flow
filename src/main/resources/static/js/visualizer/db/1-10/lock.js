/**
 * 락 / 동시성 시각화
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
    var root    = el('div', 'lock-viz');
    var toolbar = el('div', 'lock-viz__toolbar');
    var tbLeft  = el('div', 'lock-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'lock-viz__title', 'LOCK'));

    var modeWrap = el('div', 'lock-viz__mode');
    var modeDefs = [
        { key: 'types', label: '락의 종류' },
        { key: 'wait', label: '락 대기' },
        { key: 'deadlock', label: '데드락' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'lock-viz__mode-btn' + (i === 0 ? ' lock-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'lock-viz__speed');
    speedWrap.appendChild(el('span', 'lock-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'lock-viz__speed-btn' + (i === 0 ? ' lock-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'lock-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'lock-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'lock-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'lock-viz__controls');
    var btnPlay  = el('button', 'lock-viz__btn lock-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'lock-viz__btn', '▶| STEP');
    var btnReset = el('button', 'lock-viz__btn', '↺ RESET');
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
    var mode    = 'types';
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



    /* ===================== 장면 데이터: 락 ===================== */
    function st(log, o) {
        var s = { log: log, h: [], blocked: null, hi: '', T: 0, hold: {}, wait: {}, cycle: false, stat: { A: 'idle', B: 'idle' }, cap: '' };
        for (var k in o) s[k] = o[k];
        return s;
    }

    var TYPES_STEPS = [
        st('여러 트랜잭션이 같은 데이터를 동시에 건드리지 못하게 막는 장치가 락(Lock)입니다. 김민준 행 하나를 두고 두 종류의 락을 봅니다.', { cap: '행 하나 + 락 두 종류' }),
        st('공유락(Shared Lock, S) — 읽기(SELECT)용 락입니다. 여러 트랜잭션이 동시에 걸 수 있습니다.', { h: [['A', 'S']], hi: 'S', cap: 'A가 S락으로 읽는 중' }),
        st('배타락(Exclusive Lock, X) — 쓰기(UPDATE/DELETE)용 락입니다. 한 번에 하나의 트랜잭션만 가질 수 있습니다.', { h: [['A', 'X']], hi: 'X', cap: 'A가 X락으로 쓰는 중' }),
        st('S-S는 호환됩니다. 여러 명이 동시에 읽기만 하는 것은 서로 방해가 되지 않습니다.', { h: [['A', 'S'], ['B', 'S']], hi: 'SS', cap: 'S + S → 둘 다 통과' }),
        st('S-X, X-S, X-X는 모두 충돌합니다. 쓰기가 하나라도 끼면 동시에 진행할 수 없어 한쪽은 대기해야 합니다.', { h: [['A', 'S']], blocked: ['B', 'X'], hi: 'conflict', cap: 'S가 잡고 있는데 X를 요청 → 대기' }),
        st('정리: 읽기끼리는 함께 허용되지만 쓰기가 관여하면 반드시 순서대로 처리됩니다. 다음 탭에서 실제로 어떻게 대기하는지 확인하세요.', { hi: 'all', cap: '읽기끼리만 호환' })
    ];

    var WAIT_STEPS = [
        st('트랜잭션 A가 김민준 행에 배타락을 건 상태에서, 트랜잭션 B가 같은 행을 수정하려 하면 어떻게 될까요?', { T: 0, cap: '같은 행, 두 트랜잭션' }),
        st('A: UPDATE 김민준 ... → 김민준 행에 배타락(X)을 획득합니다.', { T: 1, hold: { row1: 'A' }, stat: { A: 'run', B: 'idle' }, cap: 'A가 락 획득' }),
        st('B: UPDATE 김민준 ... 시도 → 이미 A가 배타락을 갖고 있어 대기(WAITING)합니다.', { T: 2, hold: { row1: 'A' }, stat: { A: 'run', B: 'wait' }, cap: 'B는 락을 못 얻고 대기' }),
        st('A: COMMIT → 락을 해제합니다.', { T: 4, hold: {}, stat: { A: 'done', B: 'wait' }, cap: 'A가 끝나며 락 해제' }),
        st('B: 대기가 풀리고 배타락을 획득해 UPDATE를 진행합니다.', { T: 5, hold: { row1: 'B' }, stat: { A: 'done', B: 'run' }, cap: 'B 진행' }),
        st('정리: 락 덕분에 A와 B가 같은 행을 동시에 고치는 일은 없습니다. B는 A가 끝날 때까지 대기했을 뿐 데이터가 꼬이지 않았습니다.', { T: 6, hold: {}, stat: { A: 'done', B: 'done' }, cap: '순서대로 처리됨' })
    ];

    var DEAD_STEPS = [
        st('이번에는 두 트랜잭션이 서로 다른 행을 하나씩 잠근 뒤, 상대방이 잠근 행을 요청하면 어떻게 될까요?', { cap: '행 2개, 트랜잭션 2개' }),
        st('A: UPDATE 김민준 → 김민준 행에 배타락을 획득합니다.', { hold: { row1: 'A' }, stat: { A: 'run', B: 'idle' }, cap: 'A가 row1 보유' }),
        st('B: UPDATE 이서연 → 이서연 행에 배타락을 획득합니다.', { hold: { row1: 'A', row2: 'B' }, stat: { A: 'run', B: 'run' }, cap: 'B가 row2 보유' }),
        st('A: UPDATE 이서연 시도 → B가 이미 배타락을 갖고 있어 A가 대기합니다.', { hold: { row1: 'A', row2: 'B' }, wait: { A: 'row2' }, stat: { A: 'wait', B: 'run' }, cap: 'A가 B를 기다림' }),
        st('B: UPDATE 김민준 시도 → A가 이미 배타락을 갖고 있어 B도 대기합니다. A와 B가 서로를 기다리는 순환 대기, 데드락입니다.', { hold: { row1: 'A', row2: 'B' }, wait: { A: 'row2', B: 'row1' }, cycle: true, stat: { A: 'wait', B: 'wait' }, cap: '서로 기다림 → 영원히 멈춤' }),
        st('DB가 데드락을 감지해 트랜잭션 B를 희생자(victim)로 골라 강제 ROLLBACK합니다. 순환 대기가 끊깁니다.', { hold: { row1: 'A' }, wait: { A: 'row2' }, stat: { A: 'wait', B: 'abort' }, cap: 'B 롤백 → row2 락 해제' }),
        st('A가 이서연 행의 락을 얻어 계속 진행하고 COMMIT합니다.', { hold: { row1: 'A', row2: 'A' }, stat: { A: 'run', B: 'abort' }, cap: 'A 진행' }),
        st('정리: 데드락은 서로가 서로를 기다리는 순환 대기입니다. DB는 이를 감지해 한 트랜잭션을 강제로 롤백시켜 순환을 끊습니다.', { stat: { A: 'done', B: 'abort' }, cap: '순환 대기 해소' })
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'wait') return WAIT_STEPS;
        if (mode === 'deadlock') return DEAD_STEPS;
        return TYPES_STEPS;
    }
    function defaultLog() {
        if (mode === 'wait') return '한 행을 두 트랜잭션이 동시에 고치려 할 때 락이 어떻게 순서를 정하는지 봅니다.';
        if (mode === 'deadlock') return '두 트랜잭션이 서로의 락을 기다리는 데드락을 봅니다.';
        return '공유락과 배타락이 언제 함께 허용되고 언제 충돌하는지 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var h = mode === 'types' ? (mob ? 374 : 232) : (mode === 'wait' ? 244 : 284);
        return { fs: mob ? 11 : 12, total: h };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function txCol(t) { return t === 'A' ? P.orange : P.purple; }
    function chip(label, cx, cy, col, fs, dashed, alpha) {
        ctx.font = '700 ' + fs + 'px "JetBrains Mono",monospace';
        var cw = ctx.measureText(label).width + 18;
        ctx.globalAlpha = alpha;
        ctx.setLineDash(dashed ? [4, 3] : []);
        rr(cx - cw / 2, cy - 12, cw, 24, 12, col + '22', col + 'ff', 1.6);
        ctx.setLineDash([]);
        tx(label, cx, cy, fs, col + 'ff', 'center', true);
        ctx.globalAlpha = 1;
    }
    function caption(s, x0, w, y, fs) {
        if (!s.cap) return;
        lines(s.cap, w - 20, fs).forEach(function (l, i) {
            tx(l, x0 + w / 2, y + i * (fs + 5), fs, P.yellow + 'ff', 'center', true);
        });
    }

    /* ===================== 장면: 락의 종류 ===================== */
    function drawTypes(x0, top, w, mob, s, e, fs) {
        var cardW = 150, cardH = 58;
        var areaW = mob ? w : w * 0.5;
        var cx = x0 + areaW / 2, cy = top + 96;
        rr(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 10, P.surf, P.sub + 'cc', 1.8);
        tx('김민준 행', cx, cy - 10, fs + 1, P.text + 'ff', 'center', true);
        tx('id=1 · 잔액 50,000', cx, cy + 12, fs - 1, P.sub + 'ff', 'center', false);
        s.h.forEach(function (it, i) {
            var n = s.h.length;
            var tx0 = cx + (i - (n - 1) / 2) * 132;
            var ty = cy - cardH / 2 - 26 - (1 - clamp01(e * 1.4)) * 18;
            var mm = it[1] === 'S' ? 'S 읽기' : 'X 쓰기';
            var col = txCol(it[0]);
            chip(it[0] + ' · ' + mm, tx0, ty, col, fs, false, clamp01(e * 1.6));
            ln(tx0, ty + 12, tx0, cy - cardH / 2, col + 'cc', 1.6);
        });
        if (s.blocked) {
            var bx = cx + (e < 1 ? Math.sin(e * 22) * 5 * (1 - e) : 0);
            var by = cy + cardH / 2 + 34;
            chip(s.blocked[0] + ' · X 쓰기 요청', bx, by, P.red, fs, true, 1);
            tx('✕ 대기', bx, by + 24, fs, P.red + 'ff', 'center', true);
            ln(bx, by - 12, bx, cy + cardH / 2, P.red + 'cc', 1.6, [4, 3]);
        }
        /* 호환표 */
        var mx, my, cw = 52, chh = 34;
        if (mob) { mx = x0 + w / 2 - (cw * 3) / 2; my = top + 214; }
        else { mx = x0 + areaW + (w - areaW) / 2 - (cw * 3) / 2; my = top + 52; }
        tx('락 호환표', mx + cw * 1.5, my - 14, fs, P.sub + 'ff', 'center', true);
        var names = ['S', 'X'];
        names.forEach(function (n, i) {
            var hotCol = (s.hi === 'S' && n === 'S') || (s.hi === 'X' && n === 'X') || s.hi === 'all';
            tx(n, mx + cw * (i + 1.5), my + chh / 2, fs + 1, (hotCol ? P.yellow : P.sub) + 'ff', 'center', true);
            tx(n, mx + cw * 0.5, my + chh * (i + 1) + chh / 2, fs + 1, (hotCol ? P.yellow : P.sub) + 'ff', 'center', true);
        });
        for (var r = 0; r < 2; r++) {
            for (var c = 0; c < 2; c++) {
                var ok = (r === 0 && c === 0);
                var hot = s.hi === 'all' || (s.hi === 'SS' && ok) || (s.hi === 'conflict' && !ok) ||
                    (s.hi === 'S' && (r === 0 || c === 0)) || (s.hi === 'X' && (r === 1 || c === 1));
                var col = ok ? P.green : P.red;
                var rx = mx + cw * (c + 1), ry = my + chh * (r + 1);
                rr(rx + 2, ry + 2, cw - 4, chh - 4, 6, col + (hot ? '33' : '12'), col + (hot ? 'ff' : '66'), hot ? 2.2 : 1.2);
                tx(ok ? '✓' : '✕', rx + cw / 2, ry + chh / 2, fs + 3, col + (hot ? 'ff' : '99'), 'center', true);
            }
        }
        caption(s, x0, w, mob ? top + 334 : top + 188, fs);
    }

    /* ===================== 장면: 락 대기(시간 흐름) ===================== */
    function drawWait(x0, top, w, mob, s, prev, e, fs) {
        var labelW = 30, ax = x0 + labelW, aw = w - labelW - 6;
        var tick = aw / 6;
        var T = lerp(prev ? prev.T : 0, s.T, e);
        var holder = s.hold.row1;
        var hc = holder ? txCol(holder) : P.muted;
        chip('김민준 행 락: ' + (holder ? holder + '(X) 보유' : '없음'), x0 + w / 2, top + 22, hc, fs, !holder, 1);
        var laneY = { A: top + 62, B: top + 112 }, laneH = 34;
        ['A', 'B'].forEach(function (t) {
            tx(t, x0 + 12, laneY[t] + laneH / 2, fs + 2, txCol(t) + 'ff', 'center', true);
            rr(ax, laneY[t], aw, laneH, 6, 'none', P.muted + '55', 1);
        });
        for (var i = 0; i <= 6; i++) ln(ax + tick * i, top + 52, ax + tick * i, top + 154, P.muted + '33', 1);
        tx('시간 →', ax + aw, top + 168, fs - 1, P.sub + 'ff', 'right', false);
        function seg(t, a, b, kind, lab) {
            var end = Math.min(b, T);
            if (end <= a) return;
            var sx = ax + tick * a, sw = tick * (end - a);
            var col = kind === 'wait' ? P.yellow : txCol(t);
            if (kind === 'wait') {
                rr(sx, laneY[t] + 3, sw, laneH - 6, 5, P.yellow + '1f', P.yellow + 'ff', 1.6);
                ctx.save(); ctx.beginPath(); ctx.rect(sx, laneY[t] + 3, sw, laneH - 6); ctx.clip();
                for (var k = -laneH; k < sw; k += 9) ln(sx + k, laneY[t] + laneH - 3, sx + k + laneH, laneY[t] + 3, P.yellow + '55', 1.2);
                ctx.restore();
            } else {
                rr(sx, laneY[t] + 3, sw, laneH - 6, 5, col + '44', col + 'ff', 1.6);
            }
            var shown = sw > 112 ? lab : (sw > 70 ? (kind === 'wait' ? 'WAIT' : 'X락') : '');
            if (shown) tx(shown, sx + sw / 2, laneY[t] + laneH / 2, fs - 1, col + 'ff', 'center', true);
        }
        seg('A', 1, 4, 'run', 'UPDATE X락');
        seg('B', 2, 4, 'wait', 'WAITING');
        seg('B', 4, 6, 'run', 'UPDATE X락');
        if (T >= 4 && s.T >= 4) tx('COMMIT', ax + tick * 4 - 3, laneY.A - 8, fs - 1, P.green + 'ff', 'right', true);
        var mxp = ax + tick * T;
        ln(mxp, top + 48, mxp, top + 158, P.yellow + 'ff', 2);
        circ(mxp, top + 48, 4, P.yellow + 'ff', 'none');
        caption(s, x0, w, top + 196, fs);
    }

    /* ===================== 장면: 데드락(대기 그래프) ===================== */
    function drawDead(x0, top, w, mob, s, e, fs) {
        var midY = top + 122;
        var cx = x0 + w / 2;
        var xA = x0 + Math.max(34, w * 0.1), xB = x0 + w - Math.max(34, w * 0.1);
        var cardW = Math.min(132, w * 0.34), cardH = 46;
        var rowPos = { row1: [cx, midY - 48], row2: [cx, midY + 48] };
        var names = { row1: '김민준 행', row2: '이서연 행' };
        var txPos = { A: [xA, midY], B: [xB, midY] };
        ['A', 'B'].forEach(function (t) {
            var stt = s.stat[t];
            var col = stt === 'abort' ? P.red : (stt === 'wait' ? P.yellow : txCol(t));
            circ(txPos[t][0], midY, 28, col + '22', col + 'ff', 2.2);
            tx('Txn ' + t, txPos[t][0], midY - 6, fs, col + 'ff', 'center', true);
            tx(stt === 'abort' ? '롤백' : (stt === 'wait' ? '대기' : (stt === 'run' ? '실행' : (stt === 'done' ? '완료' : ''))), txPos[t][0], midY + 11, fs - 1, col + 'ff', 'center', false);
        });
        ['row1', 'row2'].forEach(function (k) {
            var hold = s.hold[k];
            var col = hold ? txCol(hold) : P.muted;
            var p = rowPos[k];
            rr(p[0] - cardW / 2, p[1] - cardH / 2, cardW, cardH, 9, P.surf, col + 'ff', hold ? 2.2 : 1.4);
            tx(names[k], p[0], p[1] - 8, fs, P.text + 'ff', 'center', true);
            tx(hold ? ('X락: ' + hold) : '락 없음', p[0], p[1] + 11, fs - 1, (hold ? col : P.sub) + 'ff', 'center', true);
        });
        function edgePt(t, k, dy) {
            var left = t === 'A';
            return [[txPos[t][0] + (left ? 26 : -26), midY + dy], [rowPos[k][0] + (left ? -cardW / 2 : cardW / 2), rowPos[k][1]]];
        }
        ['row1', 'row2'].forEach(function (k) {
            var hold = s.hold[k];
            if (!hold) return;
            var pts = edgePt(hold, k, k === 'row1' ? -10 : 10);
            ln(pts[0][0], pts[0][1], pts[1][0], pts[1][1], txCol(hold) + 'ff', 2.6);
        });
        ['A', 'B'].forEach(function (t) {
            var k = s.wait[t];
            if (!k) return;
            var pts = edgePt(t, k, k === 'row1' ? -10 : 10);
            var pulse = s.cycle ? 0.6 + 0.4 * Math.sin(e * 12) : 1;
            ctx.globalAlpha = clamp01(e * 1.5) * pulse;
            arrow(pts[0][0], pts[0][1], pts[1][0], pts[1][1], (s.cycle ? P.red : P.yellow) + 'ff', 2.4, [6, 4]);
            ctx.globalAlpha = 1;
        });
        if (s.cycle) tx('순환 대기 — 영원히 멈춤', cx, top + 12, fs + 1, P.red + 'ff', 'center', true);
        ln(x0 + w / 2 - 70, top + 214, x0 + w / 2 - 44, top + 214, P.sub + 'ff', 2.4);
        tx('보유', x0 + w / 2 - 36, top + 214, fs - 1, P.sub + 'ff', 'left', false);
        ln(x0 + w / 2 + 12, top + 214, x0 + w / 2 + 38, top + 214, P.sub + 'ff', 2.4, [5, 3]);
        tx('대기 요청', x0 + w / 2 + 46, top + 214, fs - 1, P.sub + 'ff', 'left', false);
        caption(s, x0, w, top + 242, fs);
    }

    /* ===================== 장면 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var fs = mob ? 11 : 12;
        var e = clamp01(t);
        var s = step || st('', {});
        if (mode === 'types') drawTypes(x0, top, w, mob, s, e, fs);
        else if (mode === 'wait') drawWait(x0, top, w, mob, s, prev, e, fs);
        else drawDead(x0, top, w, mob, s, e, fs);
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
        speedBtns.forEach(function (b) { b.classList.remove('lock-viz__speed-btn--active'); });
        btn.classList.add('lock-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('lock-viz__mode-btn--active', d.key === m); });
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