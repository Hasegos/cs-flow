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
        { key: 'types',    label: '락의 종류' },
        { key: 'wait',     label: '락 대기' },
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
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

    /* ===================== 락 매니저 (실제 실행 — 하드코딩 아님) ===================== */
    function LockManager() { this.locks = {}; }
    LockManager.prototype.tryAcquire = function (txn, row) {
        if (!this.locks[row] || this.locks[row] === txn) { this.locks[row] = txn; return true; }
        return false;
    };
    LockManager.prototype.release = function (txn) {
        var self = this;
        Object.keys(this.locks).forEach(function (k) { if (self.locks[k] === txn) delete self.locks[k]; });
    };

    var ROW_LABEL = { row1: '김민준', row2: '이서연' };

    /* ===================== 락 호환 매트릭스 (데이터) ===================== */
    var LOCK_TYPES = ['S', 'X'];
    var LOCK_COMPAT = { S: { S: true, X: false }, X: { S: false, X: false } };

    /* ===================== 스텝 빌더: 락의 종류 ===================== */
    function buildTypesSteps() {
        var steps = [];
        steps.push({ kind: 'intro', hi: null,
            log: '여러 트랜잭션이 동시에 같은 데이터를 건드리지 못하게 막는 장치가 락(Lock)입니다. 대표적으로 두 종류가 있습니다.' });
        steps.push({ kind: 'S', hi: 'S',
            log: '공유락(Shared Lock, S) — 읽기(SELECT)용 락입니다. 여러 트랜잭션이 동시에 걸 수 있습니다.' });
        steps.push({ kind: 'X', hi: 'X',
            log: '배타락(Exclusive Lock, X) — 쓰기(UPDATE/DELETE)용 락입니다. 한 번에 하나의 트랜잭션만 가질 수 있습니다.' });
        steps.push({ kind: 'SS', hi: 'SS',
            log: 'S-S는 호환됩니다 — 여러 명이 동시에 읽기만 하는 건 서로 방해가 되지 않습니다.' });
        steps.push({ kind: 'conflict', hi: 'conflict',
            log: 'S-X, X-S, X-X는 모두 충돌합니다 — 쓰기가 하나라도 끼면 동시에 진행할 수 없어 한쪽은 대기해야 합니다.' });
        steps.push({ kind: 'done', hi: 'all',
            log: '정리 — 읽기끼리는 함께 허용되지만, 쓰기가 관여하면 반드시 순서대로 처리됩니다. 다음 탭에서 실제로 어떻게 대기하는지 확인하세요.' });
        return steps;
    }

    /* ===================== 스텝 빌더: 락 대기 (실제 LockManager 실행) ===================== */
    function buildWaitSteps() {
        var lm = new LockManager();
        var steps = [];
        steps.push({ kind: 'intro', holders: {}, waitFor: {}, cycle: false, txnStatus: { A: 'idle', B: 'idle' },
            log: '트랜잭션 A가 김민준 행에 배타락을 건 상태에서, 트랜잭션 B가 같은 행을 수정하려 하면 어떻게 될까요?' });

        var okA = lm.tryAcquire('A', 'row1');
        steps.push({ kind: 'a-lock', holders: { row1: 'A' }, waitFor: {}, cycle: false, txnStatus: { A: 'running', B: 'idle' },
            log: 'A: UPDATE 김민준 ... → ' + (okA ? '김민준 행에 배타락(X) 획득' : '(오류)') });

        var okB = lm.tryAcquire('B', 'row1');
        steps.push({ kind: 'b-wait', holders: { row1: 'A' }, waitFor: okB ? {} : { B: 'row1' }, cycle: false, txnStatus: { A: 'running', B: okB ? 'running' : 'waiting' },
            log: 'B: UPDATE 김민준 ... 시도 → ' + (okB ? '락 획득' : '이미 A가 배타락을 갖고 있어 대기(WAITING)') });

        lm.release('A');
        steps.push({ kind: 'a-commit', holders: {}, waitFor: { B: 'row1' }, cycle: false, txnStatus: { A: 'done', B: 'waiting' },
            log: 'A: COMMIT → 락 해제' });

        var okB2 = lm.tryAcquire('B', 'row1');
        steps.push({ kind: 'b-resume', holders: { row1: 'B' }, waitFor: {}, cycle: false, txnStatus: { A: 'done', B: 'running' },
            log: 'B: 대기 해제, 배타락 획득 → UPDATE 진행 (' + (okB2 ? 'OK' : '오류') + ')' });

        steps.push({ kind: 'done', holders: { row1: 'B' }, waitFor: {}, cycle: false, txnStatus: { A: 'done', B: 'done' },
            log: '정리 — 락 덕분에 A와 B가 같은 행을 동시에 고치는 일은 없습니다. B는 A가 끝날 때까지 "대기"했을 뿐, 데이터가 꼬이진 않았습니다.' });
        return steps;
    }

    /* ===================== 스텝 빌더: 데드락 (실제 LockManager + 순환 탐지 실행) ===================== */
    function hasCycle(waitFor) {
        var keys = Object.keys(waitFor);
        for (var i = 0; i < keys.length; i++) {
            var start = keys[i]; var cur = start; var hops = 0;
            while (waitFor[cur] && hops <= keys.length + 1) {
                cur = waitFor[cur]; hops++;
                if (cur === start) return true;
            }
        }
        return false;
    }

    function buildDeadlockSteps() {
        var lm = new LockManager();
        var steps = [];
        steps.push({ kind: 'intro', holders: {}, waitFor: {}, cycle: false, txnStatus: { A: 'idle', B: 'idle' },
            log: '이번엔 두 트랜잭션이 서로 다른 행을 하나씩 잠근 뒤, 상대방이 잠근 행을 요청하면 어떻게 될까요?' });

        lm.tryAcquire('A', 'row1');
        steps.push({ kind: 'a-lock1', holders: { row1: 'A' }, waitFor: {}, cycle: false, txnStatus: { A: 'running', B: 'idle' },
            log: 'A: UPDATE 김민준 → 김민준 행에 배타락 획득' });

        lm.tryAcquire('B', 'row2');
        steps.push({ kind: 'b-lock2', holders: { row1: 'A', row2: 'B' }, waitFor: {}, cycle: false, txnStatus: { A: 'running', B: 'running' },
            log: 'B: UPDATE 이서연 → 이서연 행에 배타락 획득' });

        var okA2 = lm.tryAcquire('A', 'row2');
        var wf1 = okA2 ? {} : { A: 'B' };
        steps.push({ kind: 'a-wait2', holders: { row1: 'A', row2: 'B' }, waitFor: wf1, cycle: hasCycle(wf1), txnStatus: { A: 'waiting', B: 'running' },
            log: 'A: UPDATE 이서연 시도 → B가 이미 배타락 보유 → A 대기' });

        var okB1 = lm.tryAcquire('B', 'row1');
        var wf2 = { A: 'B' };
        if (!okB1) wf2.B = 'A';
        steps.push({ kind: 'b-wait1', holders: { row1: 'A', row2: 'B' }, waitFor: wf2, cycle: hasCycle(wf2), txnStatus: { A: 'waiting', B: 'waiting' },
            log: 'B: UPDATE 김민준 시도 → A가 이미 배타락 보유 → B 대기. A↔B가 서로를 기다리는 순환 대기 — 데드락 발생!' });

        lm.release('B');
        steps.push({ kind: 'victim', holders: { row1: 'A' }, waitFor: {}, cycle: false, txnStatus: { A: 'waiting', B: 'aborted' },
            log: 'DB가 데드락을 감지해 트랜잭션 B를 희생자(victim)로 골라 강제 ROLLBACK — 순환 대기가 끊깁니다.' });

        var okA3 = lm.tryAcquire('A', 'row2');
        steps.push({ kind: 'a-resume', holders: { row1: 'A', row2: 'A' }, waitFor: {}, cycle: false, txnStatus: { A: 'running', B: 'aborted' },
            log: 'A: 이서연 행의 락을 획득해 계속 진행 (' + (okA3 ? 'OK' : '오류') + ') → COMMIT' });

        steps.push({ kind: 'done', holders: {}, waitFor: {}, cycle: false, txnStatus: { A: 'done', B: 'aborted' },
            log: '정리 — 데드락은 서로가 서로를 기다리는 순환 대기입니다. DB는 이를 감지해 한 트랜잭션을 강제로 롤백시켜 순환을 끊습니다.' });
        return steps;
    }

    var TYPES_STEPS    = buildTypesSteps();
    var WAIT_STEPS     = buildWaitSteps();
    var DEADLOCK_STEPS = buildDeadlockSteps();

    /* ===================== 상태 ===================== */
    var mode    = 'types';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'wait') return WAIT_STEPS;
        if (mode === 'deadlock') return DEADLOCK_STEPS;
        return TYPES_STEPS;
    }

    /* ===================== 드로우 헬퍼 ===================== */
    function rr(x, y, w, h, r, fill, stroke, lw, dash) {
        if (w <= 0 || h <= 0) return;
        var rad = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rad, y);
        ctx.arcTo(x + w, y,     x + w, y + h, rad);
        ctx.arcTo(x + w, y + h, x,     y + h, rad);
        ctx.arcTo(x,     y + h, x,     y,     rad);
        ctx.arcTo(x,     y,     x + w, y,     rad);
        ctx.closePath();
        if (dash) ctx.setLineDash(dash); else ctx.setLineDash([]);
        if (fill   && fill   !== 'none') { ctx.fillStyle   = fill;              ctx.fill();   }
        if (stroke && stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.4; ctx.stroke(); }
        ctx.setLineDash([]);
    }
    function tx(str, x, y, sz, color, align, bold) {
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }
    function circle(cx, cy, r, fill, stroke, lw) {
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        if (fill && fill !== 'none') { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke && stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.4; ctx.stroke(); }
    }
    function arcArrow(x1, y1, x2, y2, bow, col, lw) {
        var midX = (x1 + x2) / 2, midY = (y1 + y2) / 2 + bow;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(midX, midY, x2, y2);
        ctx.strokeStyle = col; ctx.lineWidth = lw || 2;
        ctx.stroke();
        var angle = Math.atan2(y2 - midY, x2 - midX);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 9 * Math.cos(angle - 0.4), y2 - 9 * Math.sin(angle - 0.4));
        ctx.lineTo(x2 - 9 * Math.cos(angle + 0.4), y2 - 9 * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fillStyle = col; ctx.fill();
    }

    function cellActive(hi, r, c, compat) {
        var isSS = hi === 'SS' && r === 'S' && c === 'S';
        var isConflict = hi === 'conflict' && !compat;
        var showAll = hi === 'all';
        return isSS || isConflict || showAll || hi === r || hi === c;
    }

    function typesGeom(mob) {
        var cell = mob ? 64 : 80;
        var labelW = mob ? 52 : 64;
        var matrixW = labelW + LOCK_TYPES.length * cell;
        var matrixH = (mob ? 28 : 32) + LOCK_TYPES.length * cell;
        var listGap = mob ? 36 : 56;
        var listW = mob ? 210 : 250;
        var listHeaderH = mob ? 28 : 32;
        var listRowH = mob ? 34 : 40;
        var listH = listHeaderH + 4 * listRowH;
        return { cell: cell, labelW: labelW, matrixW: matrixW, matrixH: matrixH, listGap: listGap, listW: listW, listH: listH };
    }
    function typesTotalH(w, mob) {
        var Tg = typesGeom(mob);
        var sideBySide = w >= Tg.matrixW + Tg.listGap + Tg.listW;
        if (sideBySide) return Math.max(Tg.matrixH, Tg.listH);
        return Tg.matrixH + (mob ? 26 : 30) + Tg.listH;
    }

    /* ===================== 모드1: 락 종류 — 매트릭스 + 리스트 표(남는 공간 활용) ===================== */
    function drawCompatTable(x0, y0, w, mob, hi) {
        var Tg = typesGeom(mob);
        var cell = Tg.cell, labelW = Tg.labelW;
        tx('S = 공유락 / X = 배타락', x0, y0 - (mob ? 12 : 14), mob ? 12 : 13.5, P.muted + 'aa', 'left', true);
        var gx = x0 + labelW, gy = y0 + (mob ? 28 : 32);

        LOCK_TYPES.forEach(function (t, i) {
            var on = hi === t || hi === 'all';
            tx(t, gx + i * cell + cell / 2, gy - (mob ? 20 : 22), mob ? 15 : 17, (on ? P.purple : P.text) + 'dd', 'center', true);
            tx(t, gx - (mob ? 18 : 20), gy + i * cell + cell / 2, mob ? 15 : 17, (on ? P.purple : P.text) + 'dd', 'center', true);
        });

        LOCK_TYPES.forEach(function (r, ri) {
            LOCK_TYPES.forEach(function (c, ci) {
                var compat = LOCK_COMPAT[r][c];
                var active = cellActive(hi, r, c, compat);
                var accent = compat ? P.green : P.orange;
                var fill = active ? accent + '22' : P.muted + '0c';
                var stroke = active ? accent + 'cc' : P.muted + '44';
                var cx = gx + ci * cell, cy = gy + ri * cell;
                rr(cx + 2, cy + 2, cell - 4, cell - 4, 6, fill, stroke, active ? 2 : 1.3);
                tx(compat ? '호환' : '충돌', cx + cell / 2, cy + cell / 2, mob ? 12 : 14, active ? (accent + 'ee') : (P.text + '88'), 'center', active);
            });
        });

        var sideBySide = w >= Tg.matrixW + Tg.listGap + Tg.listW;
        if (sideBySide) {
            drawCompatList(x0 + Tg.matrixW + Tg.listGap, y0, Tg.listW, mob, hi);
            return { height: Math.max(Tg.matrixH, Tg.listH) };
        }
        drawCompatList(x0, y0 + Tg.matrixH + (mob ? 26 : 30), Math.min(w, Tg.listW + 60), mob, hi);
        return { height: Tg.matrixH + (mob ? 26 : 30) + Tg.listH };
    }

    function drawCompatList(x0, y0, w, mob, hi) {
        var headerH = mob ? 28 : 32;
        var rowH = mob ? 34 : 40;
        var combos = [['S', 'S'], ['S', 'X'], ['X', 'S'], ['X', 'X']];
        var colA = w * 0.26, colB = w * 0.26, colR = w - colA - colB;

        tx('표로 보기', x0, y0 - (mob ? 12 : 14), mob ? 12 : 13.5, P.muted + 'aa', 'left', true);
        rr(x0, y0, w, headerH + combos.length * rowH, 6, 'none', P.muted + '55', 1.3);
        rr(x0, y0, w, headerH, 0, P.muted + '12', 'none');
        tx('락 A', x0 + colA / 2, y0 + headerH / 2, mob ? 11 : 12.5, P.text + 'cc', 'center', true);
        tx('락 B', x0 + colA + colB / 2, y0 + headerH / 2, mob ? 11 : 12.5, P.text + 'cc', 'center', true);
        tx('결과', x0 + colA + colB + colR / 2, y0 + headerH / 2, mob ? 11 : 12.5, P.text + 'cc', 'center', true);
        seg2(x0, y0 + headerH, x0 + w, y0 + headerH, P.muted + '55', 1.3);

        combos.forEach(function (pair, i) {
            var r = pair[0], c = pair[1];
            var compat = LOCK_COMPAT[r][c];
            var active = cellActive(hi, r, c, compat);
            var accent = compat ? P.green : P.orange;
            var ry = y0 + headerH + i * rowH;
            if (active) rr(x0, ry, w, rowH, 0, accent + '16', 'none');
            if (i > 0) seg2(x0, ry, x0 + w, ry, P.muted + '2a', 1);
            tx(r, x0 + colA / 2, ry + rowH / 2, mob ? 12 : 13.5, active ? (P.purple + 'ee') : (P.text + 'cc'), 'center', active);
            tx(c, x0 + colA + colB / 2, ry + rowH / 2, mob ? 12 : 13.5, active ? (P.purple + 'ee') : (P.text + 'cc'), 'center', active);
            tx(compat ? '호환' : '충돌', x0 + colA + colB + colR / 2, ry + rowH / 2, mob ? 12 : 13.5, active ? (accent + 'ee') : (P.text + '99'), 'center', active);
        });
        return { height: headerH + combos.length * rowH };
    }

    /* ===================== 모드2/3: 락 상태 + 대기-그래프 ===================== */
    function drawLockState(x0, y0, w, mob, holders, waitFor, cycle, txnStatus) {
        var rowW = mob ? 150 : 190;
        var rowH = mob ? 52 : 60;
        var gap = w - rowW * 2;
        tx('락 상태', x0, y0 - (mob ? 12 : 14), mob ? 12 : 14, P.muted + 'aa', 'left', true);

        var row1X = x0, row2X = x0 + rowW + gap;
        [['row1', row1X], ['row2', row2X]].forEach(function (pair) {
            var key = pair[0], rx = pair[1];
            var holder = holders[key];
            var accent = holder ? P.orange : P.muted;
            rr(rx, y0, rowW, rowH, 8, holder ? accent + '18' : 'none', accent + (holder ? 'cc' : '55'), holder ? 2 : 1.3);
            tx(ROW_LABEL[key], rx + rowW / 2, y0 + rowH * 0.35, mob ? 13 : 15, P.text + 'dd', 'center', true);
            tx(holder ? ('🔒 X-lock: ' + holder) : '🔓 잠금 없음', rx + rowW / 2, y0 + rowH * 0.72, mob ? 11 : 12.5, accent + 'ee', 'center', false);
        });

        var txnY = y0 + rowH + (mob ? 60 : 74);
        var r = mob ? 34 : 40;
        var aX = row1X + rowW / 2, bX = row2X + rowW / 2;

        seg2(aX, y0 + rowH, aX, txnY - r, holders.row1 === 'A' ? P.teal + 'cc' : P.muted + '33', holders.row1 === 'A' ? 2.2 : 1.3);
        seg2(bX, y0 + rowH, bX, txnY - r, holders.row2 === 'B' ? P.teal + 'cc' : P.muted + '33', holders.row2 === 'B' ? 2.2 : 1.3);

        if (waitFor.A === 'B') arcArrow(aX + r * 0.7, txnY - r * 0.6, bX - r * 0.7, txnY - r * 0.6, mob ? -26 : -34, cycle ? (P.orange + 'ee') : (P.orange + 'aa'), cycle ? 2.6 : 2);
        if (waitFor.B === 'A') arcArrow(bX - r * 0.7, txnY + r * 0.6, aX + r * 0.7, txnY + r * 0.6, mob ? 26 : 34, cycle ? (P.orange + 'ee') : (P.orange + 'aa'), cycle ? 2.6 : 2);

        [['A', aX], ['B', bX]].forEach(function (pair) {
            var name = pair[0], cx = pair[1];
            var st = txnStatus[name];
            var accent = st === 'waiting' ? P.orange : st === 'aborted' ? (P.muted) : st === 'done' ? P.green : (st === 'running' ? P.teal : P.muted);
            circle(cx, txnY, r, accent + (st === 'idle' ? '0c' : '20'), accent + (st === 'idle' ? '44' : 'cc'), st === 'waiting' ? 2.4 : 1.8);
            tx(name, cx, txnY - (mob ? 4 : 5), mob ? 17 : 20, accent + 'ee', 'center', true);
            var stLabel = { idle: '대기전', running: '실행중', waiting: 'WAITING', done: 'COMMIT', aborted: 'ROLLBACK' }[st];
            tx(stLabel, cx, txnY + r + (mob ? 16 : 18), mob ? 11 : 12.5, accent + 'cc', 'center', false);
        });

        if (cycle) {
            tx('⚠ 데드락', (aX + bX) / 2, txnY, mob ? 14 : 16, P.orange + 'ee', 'center', true);
        }

        return { height: rowH + (mob ? 60 : 74) + r + (mob ? 32 : 36) };
    }
    function seg2(x1, y1, x2, y2, col, lw) {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.strokeStyle = col; ctx.lineWidth = lw || 1; ctx.stroke();
    }

    /* ===================== 레이아웃 ===================== */
    function getGeom(mob) {
        return { padX: mob ? 16 : 26, titleGap: mob ? 18 : 22 };
    }

    function calcH(w) {
        var mob = w < 600;
        var G = getGeom(mob);
        var top = mob ? 16 : 20, bottom = mob ? 18 : 22;
        if (mode === 'types') {
            return top + G.titleGap + typesTotalH(w - G.padX * 2, mob) + bottom;
        }
        var rowH = mob ? 52 : 60;
        var r = mob ? 34 : 40;
        var stateH = rowH + (mob ? 60 : 74) + r + (mob ? 32 : 36);
        return top + G.titleGap + stateH + bottom;
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var neededH = calcH(w);
        canvasWrap.style.height    = 'auto';
        canvasWrap.style.minHeight = neededH + 'px';
        var actualH = canvasWrap.offsetHeight || neededH;
        if (actualH < neededH) actualH = neededH;
        canvas.width  = w * dpr;
        canvas.height = actualH * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        draw();
    }

    /* ===================== 메인 드로우 ===================== */
    function draw() {
        P = window.CsFlow.getP();
        ctx.clearRect(0, 0, GW(), GH());
        var W = GW(); var mob = W < 600;
        var G = getGeom(mob);
        var neededH = calcH(W);
        var extra = Math.max(0, GH() - neededH);
        var top = (mob ? 16 : 20) + extra / 2;
        var x0 = G.padX;
        var fullW = W - G.padX * 2;

        var steps = currentSteps();
        var step = stepIdx >= 0 ? steps[stepIdx] : steps[0];

        if (mode === 'types') {
            drawCompatTable(x0, top + G.titleGap, fullW, mob, step.hi);
            return;
        }

        drawLockState(x0, top + G.titleGap, fullW, mob, step.holders || {}, step.waitFor || {}, !!step.cycle, step.txnStatus || { A: 'idle', B: 'idle' });
    }

    /* ===================== 애니메이션(스텝 전환) ===================== */
    function animateStep(onDone) {
        if (rafId) cancelAnimationFrame(rafId);
        draw();
        rafId = requestAnimationFrame(function () { rafId = null; if (onDone) onDone(); });
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) { speedBtns.forEach(function (b) { b.disabled = v; }); }
    function defaultLog() { return currentSteps()[0].log; }

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

        speed = ms;
    function setSpeed(ms, btn) {
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