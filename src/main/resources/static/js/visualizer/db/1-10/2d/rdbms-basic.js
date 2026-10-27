/**
 * 관계형 DB 기초 시각화
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
    var root    = el('div', 'rdbms-viz');
    var toolbar = el('div', 'rdbms-viz__toolbar');
    var tbLeft  = el('div', 'rdbms-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'rdbms-viz__title', 'RDBMS'));

    var modeWrap = el('div', 'rdbms-viz__mode');
    var modeDefs = [
        { key: 'structure', label: '테이블 구조' },
        { key: 'pk', label: '기본키' },
        { key: 'fk', label: '외래키 관계' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'rdbms-viz__mode-btn' + (i === 0 ? ' rdbms-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'rdbms-viz__speed');
    speedWrap.appendChild(el('span', 'rdbms-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'rdbms-viz__speed-btn' + (i === 0 ? ' rdbms-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'rdbms-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'rdbms-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'rdbms-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'rdbms-viz__controls');
    var btnPlay  = el('button', 'rdbms-viz__btn rdbms-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'rdbms-viz__btn', '▶| STEP');
    var btnReset = el('button', 'rdbms-viz__btn', '↺ RESET');
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
    var mode    = 'structure';
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

    /* ===================== 기준 데이터 (두 테이블) ===================== */
    var USERS_COLS = ['id', 'name', 'email'];
    var USERS_ROWS = [
        { id: 1, name: '김민준', email: 'minjun@mail.com' },
        { id: 2, name: '이서연', email: 'seoyeon@mail.com' },
        { id: 3, name: '박도윤', email: 'doyoon@mail.com' }
    ];
    var ORDERS_COLS = ['id', 'user_id', 'product'];
    var ORDERS_ROWS = [
        { id: 101, user_id: 1, product: '노트북' },
        { id: 102, user_id: 2, product: '키보드' },
        { id: 103, user_id: 1, product: '마우스' }
    ];

    var USERS_COL_W  = { d: { id: 58, name: 96, email: 160 }, m: { id: 44, name: 74, email: 132 } };
    var ORDERS_COL_W = { d: { id: 58, user_id: 92, product: 100 }, m: { id: 46, user_id: 70, product: 80 } };

    function findRowIdx(rows, field, val) {
        for (var i = 0; i < rows.length; i++) { if (rows[i][field] === val) return i; }
        return -1;
    }

    /* ===================== PK/FK 검증 로직 (실제 실행 — 하드코딩 아님) ===================== */
    function checkPkInsert(rows, pkField, newRow) {
        if (newRow[pkField] === null || newRow[pkField] === undefined) {
            return { ok: false, msg: pkField + ' 값이 비어 있습니다 (NOT NULL 위반)' };
        }
        var dup = rows.some(function (r) { return r[pkField] === newRow[pkField]; });
        if (dup) {
            return { ok: false, msg: pkField + '=' + newRow[pkField] + '가 이미 존재합니다 (UNIQUE 위반)' };
        }
        return { ok: true, msg: pkField + '=' + newRow[pkField] + '는 유일하고 비어있지 않습니다' };
    }

    function checkFkInsert(childRow, fkField, parentRows, parentPk) {
        var idx = findRowIdx(parentRows, parentPk, childRow[fkField]);
        if (idx === -1) {
            return { ok: false, msg: parentPk + '=' + childRow[fkField] + '가 부모 테이블에 없습니다 (참조 무결성 위반)' };
        }
        return { ok: true, matched: parentRows[idx], matchedIdx: idx };
    }

    /* ===================== 스텝 빌더 (데이터를 실제로 검사해 생성) ===================== */
    function buildStructureSteps() {
        var steps = [];
        steps.push({ kind: 'intro',
            log: 'USERS 테이블입니다. PLAY 또는 STEP을 눌러 표가 어떻게 구성되는지 하나씩 살펴보세요.' });
        steps.push({ kind: 'columns', highlightCols: USERS_COLS.slice(),
            log: '맨 위 가로줄은 헤더(header)입니다. 각 세로줄(컬럼/열)은 하나의 속성(attribute)을 의미합니다 — id, name, email.' });
        steps.push({ kind: 'rows', highlightRows: 'all',
            log: '헤더 아래 가로줄들은 각각 하나의 데이터입니다. 이걸 행(row) 또는 레코드(record)라고 부릅니다. 지금 이 표에는 ' + USERS_ROWS.length + '개의 레코드가 있습니다.' });
        steps.push({ kind: 'cell', highlightCell: { row: 0, col: 'name' },
            log: '행과 열이 만나는 하나의 칸을 셀(cell)이라고 합니다. 예: id=1인 행의 name 값은 "' + USERS_ROWS[0].name + '"입니다.' });
        steps.push({ kind: 'done',
            log: '정리 — 테이블(table) = 컬럼(열) 여러 개 + 레코드(행) 여러 개. 엑셀 스프레드시트와 구조가 똑같습니다.' });
        return steps;
    }

    function buildPkSteps() {
        var steps = [];
        steps.push({ kind: 'intro', pkOn: false,
            log: '여러 행 중 하나를 정확히 구별하려면 특별한 열이 필요합니다. id 컬럼을 살펴봅시다.' });
        steps.push({ kind: 'pkcol', pkOn: true,
            log: 'id 값은 ' + USERS_ROWS.map(function (r) { return r.id; }).join(', ') + '로 서로 다릅니다 — 이 컬럼으로 각 행을 구별할 수 있습니다.' });

        var dupAttempt = { id: 2, name: '테스트', email: 'test@mail.com' };
        var dupResult  = checkPkInsert(USERS_ROWS, 'id', dupAttempt);
        steps.push({ kind: 'attempt', pkOn: true, attemptRow: dupAttempt, attemptResult: dupResult,
            log: 'id=' + dupAttempt.id + '로 새 행을 추가하면? → ' + dupResult.msg + ' → 저장이 거부됩니다.' });

        var nullAttempt = { id: null, name: '테스트2', email: 'test2@mail.com' };
        var nullResult  = checkPkInsert(USERS_ROWS, 'id', nullAttempt);
        steps.push({ kind: 'attempt', pkOn: true, attemptRow: nullAttempt, attemptResult: nullResult,
            log: 'id를 비워두고 저장하면? → ' + nullResult.msg + ' → 이 역시 저장이 거부됩니다.' });

        var okAttempt = { id: 4, name: '최지우', email: 'jiwoo@mail.com' };
        var okResult  = checkPkInsert(USERS_ROWS, 'id', okAttempt);
        steps.push({ kind: 'attempt', pkOn: true, attemptRow: okAttempt, attemptResult: okResult,
            log: okResult.msg + ' → 정상적으로 추가됩니다.' });

        steps.push({ kind: 'done', pkOn: true,
            log: '정리 — 기본키(Primary Key, PK) = 각 행을 유일하게 식별하는 열. 조건: 중복 불가(UNIQUE) + 비어있으면 안 됨(NOT NULL).' });
        return steps;
    }

    function buildFkSteps() {
        var steps = [];
        steps.push({ kind: 'intro', fkOn: false, revealed: [],
            log: '이번엔 두 개의 테이블, USERS와 ORDERS를 함께 봅니다.' });
        steps.push({ kind: 'fkcol', fkOn: true, revealed: [],
            log: 'ORDERS 테이블의 user_id 컬럼을 보세요. 이 값들은 USERS 테이블의 id와 같은 값입니다.' });

        var revealed = [];
        ORDERS_ROWS.forEach(function (o, idx) {
            var r = checkFkInsert(o, 'user_id', USERS_ROWS, 'id');
            revealed = revealed.concat([{ orderIdx: idx, userIdx: r.matchedIdx }]);
            steps.push({ kind: 'match', fkOn: true, revealed: revealed.slice(), activeIdx: idx,
                log: '주문 ' + o.id + '번(user_id=' + o.user_id + ')은 USERS의 id=' + o.user_id + '인 "' + r.matched.name + '"를 가리킵니다.' });
        });

        var badAttempt = { id: 104, user_id: 99, product: '모니터' };
        var badResult  = checkFkInsert(badAttempt, 'user_id', USERS_ROWS, 'id');
        steps.push({ kind: 'attempt', fkOn: true, revealed: revealed.slice(), attemptRow: badAttempt, attemptResult: badResult,
            log: 'user_id=' + badAttempt.user_id + '로 새 주문을 추가하면? → ' + badResult.msg + ' → 저장이 거부됩니다. 이를 참조 무결성(referential integrity)이라 합니다.' });

        var u1Count = ORDERS_ROWS.filter(function (o) { return o.user_id === 1; }).length;
        steps.push({ kind: 'done', fkOn: true, revealed: revealed.slice(),
            log: '정리 — 외래키(Foreign Key, FK) = 다른 테이블의 기본키를 참조하는 열. user_id=1은 주문 ' + u1Count + '건에 등장하듯, 한 사용자가 여러 주문을 가질 수 있습니다(1:N 관계).' });
        return steps;
    }

    var STRUCTURE_STEPS = buildStructureSteps();
    var PK_STEPS        = buildPkSteps();
    var FK_STEPS         = buildFkSteps();

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'pk') return PK_STEPS;
        if (mode === 'fk') return FK_STEPS;
        return STRUCTURE_STEPS;
    }
    function defaultLog() {
        if (mode === 'pk') return '기본키가 행을 구별하는 방법과 중복 · 빈 값이 거부되는 모습을 봅니다.';
        if (mode === 'fk') return '외래키가 다른 테이블의 행을 가리키는 방법을 봅니다.';
        return '테이블이 컬럼과 행으로 이루어진 구조를 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function geom(w, mob) {
        var uCW = USERS_COL_W[mob ? 'm' : 'd'], oCW = ORDERS_COL_W[mob ? 'm' : 'd'];
        var uW = 0, oW = 0;
        USERS_COLS.forEach(function (c) { uW += uCW[c]; });
        ORDERS_COLS.forEach(function (c) { oW += oCW[c]; });
        var hH = mob ? 32 : 40, rH = mob ? 30 : 38;
        return { hH: hH, rH: rH, tg: mob ? 18 : 22, uCW: uCW, oCW: oCW, uW: uW, oW: oW, uH: hH + USERS_ROWS.length * rH, oH: hH + ORDERS_ROWS.length * rH, side: !mob && w >= uW + oW + 130, fs: mob ? 11.5 : 13 };
    }
    function layout(w, mob) {
        var g = geom(w, mob);
        var tot;
        if (mode === 'structure') tot = g.tg + g.uH + 40;
        else if (mode === 'pk') tot = g.tg + g.uH + 7 + g.rH + (mob ? 46 : 34) + 8;
        else if (g.side) tot = g.tg + Math.max(g.uH, g.oH + 7 + g.rH + 44) + 10;
        else tot = g.tg + g.uH + 58 + g.oH + 7 + g.rH + 44 + 10;
        return { fs: g.fs, total: tot, g: g };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 표 ===================== */
    function drawTbl(x0, y0, cols, colW, rows, g, o) {
        var hH = g.hH, rH = g.rH, fs = g.fs;
        var colX = {}, totalW = 0;
        cols.forEach(function (c) { colX[c] = totalW; totalW += colW[c]; });
        var cc = { header: {} };
        tx(o.title, x0, y0 - 11, fs - 0.5, P.sub + 'ff', 'left', true);
        var ha = o.headerA === undefined ? 1 : o.headerA;
        ctx.globalAlpha = ha;
        rr(x0, y0 + (1 - ha) * -14, totalW, hH + rows.length * rH, 6, 'none', P.sub + '88', 1.3);
        cols.forEach(function (c) {
            var cx = x0 + colX[c];
            var hi = o.colHi ? o.colHi(c) : 0;
            var isPk = o.pkCol === c, isFk = o.fkCol === c;
            var col = isPk && o.pkOn ? P.purple : P.orange;
            rr(cx, y0 + (1 - ha) * -14, colW[c], hH, 0, hi > 0 ? col + (hi > 0.7 ? '44' : '28') : P.sub + '14', 'none');
            tx(c, cx + colW[c] / 2, ((isPk || isFk) ? y0 + hH * 0.38 : y0 + hH / 2) + (1 - ha) * -14, fs - 0.5, hi > 0 ? col + 'ff' : P.text + 'ee', 'center', true);
            if (isPk) tx('PK', cx + colW[c] / 2, y0 + hH * 0.76, fs - 2, o.pkOn ? P.purple + 'ff' : P.sub + 'ff', 'center', true);
            if (isFk) tx('FK', cx + colW[c] / 2, y0 + hH * 0.76, fs - 2, o.fkOn ? P.teal + 'ff' : P.sub + 'ff', 'center', true);
            cc.header[c] = { x: cx + colW[c] / 2, y: y0 + hH / 2 };
        });
        ln(x0, y0 + hH, x0 + totalW, y0 + hH, P.sub + '88', 1.3);
        ctx.globalAlpha = 1;
        rows.forEach(function (row, ri) {
            var ry = y0 + hH + ri * rH;
            var ra = o.rowA ? o.rowA(ri) : 1;
            var dx = (1 - ra) * 26;
            var rowHi = o.rowHi ? o.rowHi(ri) : 0;
            cc[ri] = {};
            ctx.globalAlpha = ra;
            if (ri > 0) ln(x0, ry, x0 + totalW, ry, P.sub + '44', 1);
            cols.forEach(function (c) {
                var cx = x0 + colX[c] + dx;
                var colHi = o.colHi ? o.colHi(c) : 0;
                var isCell = o.cell && o.cell.row === ri && o.cell.col === c;
                var isErr = o.err && o.err.row === ri && o.err.col === c;
                var fill = null;
                if (isErr) fill = P.red + '44';
                else if (isCell) fill = P.orange + '44';
                else if (o.pkCol === c && o.pkOn && o.pkHi) fill = P.purple + '22';
                else if (o.fkCol === c && o.fkOn) fill = P.teal + '22';
                else if (rowHi > 0) fill = P.orange + (rowHi > 0.7 ? '30' : '18');
                else if (colHi > 0) fill = P.orange + '16';
                if (fill) rr(cx, ry, colW[c], rH, 0, fill, 'none');
                if (isErr || isCell) rr(cx + 1, ry + 1, colW[c] - 2, rH - 2, 3, 'none', (isErr ? P.red : P.orange) + 'ff', 2);
                tx(String(row[c]), cx + colW[c] / 2, ry + rH / 2, fs - 0.5, (isCell || isErr) ? (isErr ? P.red : P.orange) + 'ff' : P.text + 'ee', 'center', isCell || isErr);
                cc[ri][c] = { x: cx + colW[c] / 2, y: ry + rH / 2 };
            });
            ctx.globalAlpha = 1;
        });
        var vx = x0;
        cols.forEach(function (c) { if (vx > x0) ln(vx, y0, vx, y0 + hH + rows.length * rH, P.sub + '44', 1); vx += colW[c]; });
        return { cc: cc, colX: colX, w: totalW };
    }

    function attemptRow(x0, y, cols, colW, g, row, res, e, onErr) {
        var rH = g.rH, fs = g.fs;
        var totalW = 0, colX = {};
        cols.forEach(function (c) { colX[c] = totalW; totalW += colW[c]; });
        var q = clamp01(e * 2.2);
        var verdict = clamp01((e - 0.5) / 0.3);
        var acc = verdict > 0 ? (res.ok ? P.green : P.red) : P.yellow;
        var sx = !res.ok && verdict > 0 && e < 1 ? Math.sin(e * 60) * 3 * (1 - e) : 0;
        var oy = (1 - q) * 22;
        ctx.globalAlpha = q;
        rr(x0 + sx, y + oy, totalW, rH, 4, acc + '22', acc + 'cc', 1.6, [4, 3]);
        var centers = {};
        cols.forEach(function (c) {
            var v = row[c];
            var disp = (v === null || v === undefined) ? 'NULL' : String(v);
            var cx = x0 + colX[c] + colW[c] / 2 + sx;
            tx(disp, cx, y + oy + rH / 2, fs - 0.5, (onErr === c && verdict > 0 ? P.red : acc) + 'ff', 'center', true);
            centers[c] = { x: cx, y: y + oy + rH / 2 };
        });
        ctx.globalAlpha = 1;
        return { centers: centers, verdict: verdict, y: y + oy };
    }

    function caption(txt, x0, y, w, fs, col, bold) {
        var ls = lines(txt, w, fs - 0.5);
        ls.forEach(function (l, i) { tx(l, x0, y + i * (fs + 3), fs - 0.5, col, 'left', bold); });
    }

    /* ===================== 선 따라 가기 ===================== */
    function polyPos(pts, q) {
        var tot = 0, i;
        var lens = [];
        for (i = 1; i < pts.length; i++) { var l = Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y); lens.push(l); tot += l; }
        var d = clamp01(q) * tot;
        for (i = 0; i < lens.length; i++) {
            if (d <= lens[i] || i === lens.length - 1) {
                var f = lens[i] === 0 ? 1 : Math.min(1, d / lens[i]);
                return { x: lerp(pts[i].x, pts[i + 1].x, f), y: lerp(pts[i].y, pts[i + 1].y, f), seg: i, f: f };
            }
            d -= lens[i];
        }
        return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y, seg: lens.length - 1, f: 1 };
    }
    function drawRoute(pts, q, col, lw) {
        var pos = polyPos(pts, q);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (var i = 1; i <= pos.seg; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        ctx.stroke();
        if (q >= 1) {
            var a = pts[pts.length - 1], b = pts[pts.length - 2];
            var dir = a.x >= b.x ? 1 : -1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(a.x - dir * 9, a.y - 5);
            ctx.lineTo(a.x - dir * 9, a.y + 5);
            ctx.closePath();
            ctx.fillStyle = col;
            ctx.fill();
        }
        return pos;
    }

    /* ===================== 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var g = L.g;
        var fs = L.fs;
        var e = clamp01(t);
        var s = step || currentSteps()[0];
        var p = prev || s;
        var oy = top + g.tg;
        var uX = x0 + Math.max(0, (w - g.uW) / 2);
        var k;

        if (mode === 'structure') {
            var kind = s.kind;
            var res = drawTbl(uX, oy, USERS_COLS, g.uCW, USERS_ROWS, g, {
                title: 'USERS',
                headerA: kind === 'intro' ? clamp01(e * 3) : 1,
                rowA: function (ri) { return kind === 'intro' ? clamp01((e - 0.25 - ri * 0.15) / 0.3) : 1; },
                colHi: function (c) {
                    var i = USERS_COLS.indexOf(c);
                    if (kind === 'columns') return e * 3 > i ? (e * 3 - i < 1 ? 1 : 0.8) : 0;
                    if (kind === 'cell') return c === 'name' ? 0.4 : 0;
                    return 0;
                },
                rowHi: function (ri) {
                    if (kind === 'rows') return e * 3 > ri ? (e * 3 - ri < 1 ? 1 : 0.8) : 0;
                    if (kind === 'cell') return ri === 0 ? 0.4 : 0;
                    return 0;
                },
                cell: kind === 'cell' && e > 0.4 ? s.highlightCell : null
            });
            if (kind === 'cell' && e < 1) {
                var cp = res.cc[0].name;
                circ(cp.x, cp.y, 8 + e * 30, 'none', P.orange + 'ff', 2);
            }
            var ay = oy + g.uH + 22;
            var ann = { intro: '', columns: '컬럼(열) = 속성: id · name · email', rows: '행(레코드) × ' + USERS_ROWS.length, cell: '셀 = 행 × 열  →  "' + USERS_ROWS[0].name + '"', done: '테이블 = 컬럼 여러 개 × 행 여러 개' }[kind];
            ctx.globalAlpha = p.kind === kind ? 1 : clamp01(e * 1.5);
            tx(ann, x0 + w / 2, ay, fs, kind === 'done' ? P.green + 'ff' : P.orange + 'ff', 'center', true);
            ctx.globalAlpha = 1;
            return;
        }

        if (mode === 'pk') {
            var kd = s.kind;
            var att = kd === 'attempt';
            var errCol = att && s.attemptResult && !s.attemptResult.ok ? 'id' : null;
            var dupIdx = att && !s.attemptResult.ok && s.attemptRow.id !== null ? findRowIdx(USERS_ROWS, 'id', s.attemptRow.id) : -1;
            var r2 = drawTbl(uX, oy, USERS_COLS, g.uCW, USERS_ROWS, g, {
                title: 'USERS', pkCol: 'id', pkOn: s.pkOn, pkHi: s.pkOn,
                colHi: function (c) { return c === 'id' && kd === 'pkcol' ? (e < 1 ? 1 : 0.8) : 0; },
                rowHi: function (ri) { return kd === 'pkcol' && e * 3 > ri ? 0.4 : 0; },
                err: dupIdx >= 0 && e > 0.55 ? { row: dupIdx, col: 'id' } : null
            });
            if (kd === 'pkcol' && e < 1) {
                for (k = 0; k < USERS_ROWS.length; k++) {
                    if (e * 3 > k && e * 3 - k < 1) circ(r2.cc[k].id.x, r2.cc[k].id.y, 6 + (e * 3 - k) * 14, 'none', P.purple + 'ff', 2);
                }
            }
            var ty = oy + g.uH + 7;
            if (att) {
                var ar = attemptRow(uX, ty, USERS_COLS, g.uCW, g, s.attemptRow, s.attemptResult, e, s.attemptRow.id === null ? 'id' : null);
                var rs = s.attemptResult;
                var capCol = rs.ok ? P.green : P.red;
                ctx.globalAlpha = ar.verdict;
                caption((rs.ok ? '✓ 추가됨 — ' : '✕ 거부 — ') + rs.msg, uX, ty + g.rH + 16, Math.max(g.uW, w - 4), fs, capCol + 'ff', true);
                ctx.globalAlpha = 1;
                if (dupIdx >= 0 && e > 0.5 && e < 1) {
                    ln(ar.centers.id.x, ar.centers.id.y - g.rH / 2, r2.cc[dupIdx].id.x, r2.cc[dupIdx].id.y + g.rH / 2, P.red + 'ff', 1.8);
                }
            } else if (kd === 'done') {
                tx('PK = UNIQUE + NOT NULL', x0 + w / 2, ty + g.rH / 2, fs, P.purple + 'ff', 'center', true);
            }
            return;
        }

        /* 외래키 */
        var uY = oy;
        var oX, oY;
        if (g.side) {
            var tot = g.uW + 130 + g.oW;
            uX = x0 + (w - tot) / 2;
            oX = uX + g.uW + 130;
            oY = oy;
        } else {
            uX = x0 + 4;
            oX = x0 + 4;
            oY = uY + g.uH + 58;
        }
        var revealed = s.revealed;
        var act = s.kind === 'match' ? s.activeIdx : -1;
        var ur = drawTbl(uX, uY, USERS_COLS, g.uCW, USERS_ROWS, g, {
            title: 'USERS', pkCol: 'id', pkOn: true, pkHi: s.fkOn,
            rowHi: function (ri) {
                for (var i = 0; i < revealed.length; i++) { if (revealed[i].userIdx === ri) return act >= 0 && revealed[i].orderIdx === act ? (e < 1 ? 1 : 0.5) : 0.35; }
                return 0;
            }
        });
        var or = drawTbl(oX, oY, ORDERS_COLS, g.oCW, ORDERS_ROWS, g, {
            title: 'ORDERS', fkCol: 'user_id', fkOn: s.fkOn,
            rowHi: function (ri) {
                for (var i = 0; i < revealed.length; i++) { if (revealed[i].orderIdx === ri) return ri === act ? (e < 1 ? 1 : 0.5) : 0.35; }
                return 0;
            }
        });
        function route(oRowY, uRowY, lane) {
            if (g.side) {
                var gx = (uX + g.uW + oX) / 2 + (lane - 1) * 14;
                return [{ x: oX, y: oRowY }, { x: gx, y: oRowY }, { x: gx, y: uRowY }, { x: uX + g.uW, y: uRowY }];
            }
            var rx = Math.max(oX + g.oW, uX + g.uW) + 8 + lane * 7;
            return [{ x: oX + g.oW, y: oRowY }, { x: rx, y: oRowY }, { x: rx, y: uRowY }, { x: uX + g.uW, y: uRowY }];
        }
        for (k = 0; k < revealed.length; k++) {
            var rv = revealed[k];
            var pts = route(or.cc[rv.orderIdx].user_id.y, ur.cc[rv.userIdx].id.y, rv.orderIdx);
            var growing = rv.orderIdx === act;
            var q = growing ? clamp01(e * 1.3) : 1;
            drawRoute(pts, q, (growing ? P.teal : P.teal + '99'), growing ? 2.6 : 1.8);
            if (growing && e < 1) {
                var dpos = polyPos(pts, q);
                circ(dpos.x, dpos.y, 5, P.yellow + 'ff', 'none');
            }
        }
        if (s.kind === 'attempt') {
            var aY = oY + g.oH + 7;
            var cols3 = ORDERS_COLS;
            var ar2 = attemptRow(oX, aY, cols3, g.oCW, g, s.attemptRow, s.attemptResult, e, 'user_id');
            var lastU = ur.cc[USERS_ROWS.length - 1].id;
            var pts2 = route(ar2.centers.user_id.y, lastU.y + g.rH * 0.9, 3);
            var go = clamp01(e / 0.5);
            if (e < 0.5) {
                var dp = polyPos(pts2, go);
                circ(dp.x, dp.y, 5, P.yellow + 'ff', 'none');
                ctx.setLineDash([4, 3]);
                drawRoute(pts2, go, P.yellow + 'ff', 1.6);
                ctx.setLineDash([]);
            } else if (e < 1) {
                var back = clamp01((e - 0.5) / 0.5);
                var bp = polyPos(pts2, 1 - back);
                circ(bp.x, bp.y, 5, P.red + 'ff', 'none');
                tx('?', pts2[3].x + 10, pts2[3].y, fs, P.red + 'ff', 'left', true);
            }
            ctx.globalAlpha = ar2.verdict;
            tx('✕ ' + s.attemptResult.msg.split(' (')[0], oX, aY + g.rH + 16, fs - 1, P.red + 'ff', 'left', true);
            ctx.globalAlpha = 1;
        }
        if (s.kind === 'done' && e < 1) {
            for (k = 0; k < revealed.length; k++) circ(or.cc[revealed[k].orderIdx].user_id.x, or.cc[revealed[k].orderIdx].user_id.y, 6 + e * 22, 'none', P.teal + 'ff', 1.6);
        }
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
        speedBtns.forEach(function (b) { b.classList.remove('rdbms-viz__speed-btn--active'); });
        btn.classList.add('rdbms-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('rdbms-viz__mode-btn--active', d.key === m); });
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