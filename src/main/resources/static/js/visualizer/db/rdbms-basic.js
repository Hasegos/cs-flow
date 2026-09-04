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
        { key: 'pk',        label: '기본키' },
        { key: 'fk',        label: '외래키 관계' }
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
    [['1x', 1800], ['2x', 900], ['3x', 500]].forEach(function (pair, i) {
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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

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

    /* ===================== 상태 변수 ===================== */
    var mode    = 'structure';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1800;

    function currentSteps() {
        if (mode === 'pk') return PK_STEPS;
        if (mode === 'fk') return FK_STEPS;
        return STRUCTURE_STEPS;
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

    function seg(x1, y1, x2, y2, col, lw) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = col; ctx.lineWidth = lw || 1;
        ctx.stroke();
    }

    function arrowUp(x1, y1, x2, y2, col, lw, dash, bow) {
        bow = bow || 0;
        var midY = (y1 + y2) / 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(x1 + bow, midY, x2 + bow, midY, x2, y2 + 9);
        ctx.strokeStyle = col; ctx.lineWidth = lw || 1.6;
        if (dash) ctx.setLineDash(dash); else ctx.setLineDash([]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 5, y2 + 9);
        ctx.lineTo(x2 + 5, y2 + 9);
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();
    }

    function elbowBelow(x1, y1, laneY, x2, y2, col, lw) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1, laneY);
        ctx.lineTo(x2, laneY);
        ctx.lineTo(x2, y2 + 9);
        ctx.strokeStyle = col; ctx.lineWidth = lw || 1.6;
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 5, y2 + 9);
        ctx.lineTo(x2 + 5, y2 + 9);
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();
    }

    /* ===================== 테이블 렌더 (열/행/셀 공용) ===================== */
    function drawTable(x0, y0, cols, colW, rows, headerH, rowH, mob, opts) {
        opts = opts || {};
        var colX = {};
        var totalW = 0;
        cols.forEach(function (c) { colX[c] = totalW; totalW += colW[c]; });

        if (opts.title) tx(opts.title, x0, y0 - (mob ? 11 : 13), mob ? 11 : 12.5, P.muted + 'aa', 'left', true);

        var bodyRows = rows.length + (opts.reserveAttempt ? 1 : 0);
        var totalH = headerH + bodyRows * rowH;

        rr(x0, y0, totalW, headerH + rows.length * rowH, 6, 'none', P.muted + '55', 1.3);

        cols.forEach(function (c) {
            var cx = x0 + colX[c];
            var isHighlighted = opts.highlightCols && opts.highlightCols.indexOf(c) !== -1;
            var isPk = opts.pkCol === c;
            var isFk = opts.fkCol === c;
            var headerFill = isHighlighted ? P.orange + '22' : (P.muted + '12');
            rr(cx, y0, colW[c], headerH, 0, headerFill, 'none');
            var labelColor = isHighlighted ? P.orange + 'ee' : P.text + 'cc';
            var labelY = (isPk || isFk) ? y0 + headerH * 0.38 : y0 + headerH / 2;
            tx(c, cx + colW[c] / 2, labelY, mob ? 11.5 : 13, labelColor, 'center', true);
            if (isPk) {
                var pkColor = opts.pkOn ? P.purple + 'ee' : P.muted + '99';
                tx('PK', cx + colW[c] / 2, y0 + headerH * 0.76, mob ? 10 : 11, pkColor, 'center', true);
            }
            if (isFk) {
                var fkColor = opts.fkOn ? P.teal + 'ee' : P.muted + '99';
                tx('FK', cx + colW[c] / 2, y0 + headerH * 0.76, mob ? 10 : 11, fkColor, 'center', true);
            }
        });

        seg(x0, y0 + headerH, x0 + totalW, y0 + headerH, P.muted + '55', 1.3);

        var cellCenters = { header: {} };
        cols.forEach(function (c) { cellCenters.header[c] = { x: x0 + colX[c] + colW[c] / 2, y: y0 + headerH / 2 }; });

        rows.forEach(function (row, ri) {
            var ry = y0 + headerH + ri * rowH;
            var rowOn = opts.highlightRows === 'all' || (opts.highlightRows && opts.highlightRows.indexOf(ri) !== -1);
            cellCenters[ri] = {};
            cols.forEach(function (c) {
                var cx = x0 + colX[c];
                var isCellHi = opts.highlightCell && opts.highlightCell.row === ri && opts.highlightCell.col === c;
                var isColHi  = opts.pkCol === c && opts.pkOn;
                var isFkHi   = opts.fkCol === c && opts.fkOn;
                var fill = 'none';
                if (isCellHi) fill = P.orange + '2a';
                else if (isColHi) fill = P.purple + '16';
                else if (isFkHi) fill = P.teal + '16';
                else if (rowOn) fill = P.orange + '14';
                if (fill !== 'none') rr(cx, ry, colW[c], rowH, 0, fill, 'none');
                var txtColor = isCellHi ? P.orange + 'ee' : (P.text + 'dd');
                tx(String(row[c]), cx + colW[c] / 2, ry + rowH / 2, mob ? 11 : 13, txtColor, 'center', isCellHi);
                cellCenters[ri][c] = { x: cx + colW[c] / 2, y: ry + rowH / 2 };
            });
            if (ri > 0) seg(x0, ry, x0 + totalW, ry, P.muted + '2a', 1);
        });
        var vx = x0;
        cols.forEach(function (c) {
            if (vx > x0) seg(vx, y0, vx, y0 + headerH + rows.length * rowH, P.muted + '2a', 1);
            vx += colW[c];
        });

        var attemptCenters = null;
        var dataBottom = y0 + headerH + rows.length * rowH;
        var channelGap = opts.channelGap || 0;
        var channelTop = dataBottom;
        var channelBottom = dataBottom + channelGap;
        var attemptTop = channelBottom;
        if (opts.attemptRow) {
            var res = opts.attemptResult;
            var accent = res.ok ? P.green : P.orange;
            var ay = attemptTop + 7;
            rr(x0, ay, totalW, rowH, 4, accent + '18', accent + 'aa', 1.3, [4, 3]);
            attemptCenters = {};
            cols.forEach(function (c) {
                var cx = x0 + colX[c];
                var v = opts.attemptRow[c];
                var display = (v === null || v === undefined) ? 'NULL' : String(v);
                tx(display, cx + colW[c] / 2, ay + rowH / 2, mob ? 11 : 13, accent + 'ee', 'center', true);
                attemptCenters[c] = { x: cx + colW[c] / 2, y: ay + rowH / 2 };
            });
            var capY = ay + rowH + (mob ? 14 : 16);
            var capText = (res.ok ? '✓ 추가됨 — ' : '✕ 거부 — ') + res.msg;
            tx(capText, x0, capY, mob ? 10.5 : 12, accent + 'ee', 'left', true);
        }

        var baseH = headerH + rows.length * rowH + channelGap;
        var fullH = baseH + (opts.reserveAttempt ? (7 + rowH + (mob ? 26 : 30)) : 0);
        return { width: totalW, height: fullH,
                 cellCenters: cellCenters, attemptCenters: attemptCenters, colX: colX,
                 channelTop: channelTop, channelBottom: channelBottom };
    }

    /* ===================== 레이아웃 계산 ===================== */
    function getGeom(mob) {
        return {
            headerH: mob ? 32 : 40,
            rowH:    mob ? 30 : 38,
            padX:    mob ? 14 : 24,
            titleGap: mob ? 18 : 20,
            arrowGap: mob ? 66 : 92
        };
    }

    function fkDecideLayout(W, mob) {
        var G = getGeom(mob);
        var uColW = USERS_COL_W[mob ? 'm' : 'd'];
        var oColW = ORDERS_COL_W[mob ? 'm' : 'd'];
        var usersW = 0; USERS_COLS.forEach(function (c) { usersW += uColW[c]; });
        var ordersW = 0; ORDERS_COLS.forEach(function (c) { ordersW += oColW[c]; });
        var horizGap = mob ? 90 : 110;
        var marginH = 60;
        var needed = G.padX * 2 + usersW + horizGap + ordersW;
        return { side: !mob && W >= needed, uColW: uColW, oColW: oColW, usersW: usersW, ordersW: ordersW, horizGap: horizGap, marginH: marginH, G: G };
    }

    function calcH(w) {
        var mob = w < 600;
        var G = getGeom(mob);
        var top = mob ? 14 : 18, bottom = mob ? 16 : 20;
        if (mode === 'structure') {
            return top + G.titleGap + G.headerH + USERS_ROWS.length * G.rowH + bottom;
        }
        if (mode === 'pk') {
            var usersReserved = G.headerH + USERS_ROWS.length * G.rowH + 7 + G.rowH + (mob ? 26 : 30);
            return top + G.titleGap + usersReserved + bottom;
        }
        var L = fkDecideLayout(w, mob);
        var usersH = G.headerH + USERS_ROWS.length * G.rowH;
        var ordersReserved = G.headerH + ORDERS_ROWS.length * G.rowH + 7 + G.rowH + (mob ? 26 : 30);
        if (L.side) {
            return top + G.titleGap + Math.max(usersH, ordersReserved) + L.marginH + bottom;
        }
        return top + G.titleGap + usersH + G.arrowGap + G.titleGap + ordersReserved + bottom;
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
        var W   = GW();
        var mob = W < 600;
        var G   = getGeom(mob);

        var neededH = calcH(W);
        var extra = Math.max(0, GH() - neededH);
        var top = (mob ? 14 : 18) + extra / 2;

        var steps = currentSteps();
        var step  = stepIdx >= 0 ? steps[stepIdx] : steps[0];
        var x0 = G.padX;

        if (mode === 'structure') {
            drawTable(x0, top + G.titleGap, USERS_COLS, USERS_COL_W[mob ? 'm' : 'd'], USERS_ROWS, G.headerH, G.rowH, mob, {
                title: 'USERS',
                pkCol: 'id', pkOn: false,
                highlightCols: step.highlightCols || [],
                highlightRows: step.highlightRows || null,
                highlightCell: step.highlightCell || null
            });
        } else if (mode === 'pk') {
            drawTable(x0, top + G.titleGap, USERS_COLS, USERS_COL_W[mob ? 'm' : 'd'], USERS_ROWS, G.headerH, G.rowH, mob, {
                title: 'USERS',
                pkCol: 'id', pkOn: !!step.pkOn,
                attemptRow: step.attemptRow || null,
                attemptResult: step.attemptResult || null,
                reserveAttempt: true
            });
        } else {
            var L = fkDecideLayout(W, mob);
            var uColW = L.uColW, oColW = L.oColW;
            var usersRes, ordersRes;

            if (L.side) {
                var usersX  = x0;
                var ordersX = x0 + L.usersW + L.horizGap;
                usersRes = drawTable(usersX, top + G.titleGap, USERS_COLS, uColW, USERS_ROWS, G.headerH, G.rowH, mob, {
                    title: 'USERS', pkCol: 'id', pkOn: !!step.fkOn
                });
                ordersRes = drawTable(ordersX, top + G.titleGap, ORDERS_COLS, oColW, ORDERS_ROWS, G.headerH, G.rowH, mob, {
                    title: 'ORDERS', fkCol: 'user_id', fkOn: !!step.fkOn,
                    attemptRow: step.attemptRow || null, attemptResult: step.attemptResult || null,
                    reserveAttempt: true
                });

                var tablesBottom = top + G.titleGap + Math.max(
                    G.headerH + USERS_ROWS.length * G.rowH,
                    G.headerH + ORDERS_ROWS.length * G.rowH + 7 + G.rowH + (mob ? 26 : 30)
                );
                var marginTop = tablesBottom + 6;
                var laneYFor = function (idx) { return marginTop + 8 + idx * 15; };

                (step.revealed || []).forEach(function (link) {
                    var offset = (link.orderIdx - (ORDERS_ROWS.length - 1) / 2) * 9;
                    var from = ordersRes.cellCenters[link.orderIdx].user_id;
                    var to   = usersRes.cellCenters[link.userIdx].id;
                    var active = step.activeIdx === link.orderIdx;
                    var col = active ? P.teal + 'ee' : P.teal + '77';
                    var laneY = laneYFor(link.orderIdx);
                    elbowBelow(from.x + offset, from.y + G.rowH / 2, laneY, to.x + offset, to.y, col, active ? 2.2 : 1.3);
                });

                if (step.attemptRow && ordersRes.attemptCenters) {
                    var fromBadS = ordersRes.attemptCenters.user_id;
                    var badLaneY = laneYFor(ORDERS_ROWS.length);
                    seg(fromBadS.x, fromBadS.y + G.rowH / 2, fromBadS.x, badLaneY, P.orange + 'cc', 1.6);
                    seg(fromBadS.x, badLaneY, fromBadS.x - 42, badLaneY, P.orange + 'cc', 1.6);
                    tx('✕', fromBadS.x - 58, badLaneY, 13, P.orange + 'ee', 'center', true);
                }
            } else {
                usersRes = drawTable(x0, top + G.titleGap, USERS_COLS, uColW, USERS_ROWS, G.headerH, G.rowH, mob, {
                    title: 'USERS', pkCol: 'id', pkOn: !!step.fkOn
                });
                var ordersTop = top + G.titleGap + (G.headerH + USERS_ROWS.length * G.rowH) + G.arrowGap;
                ordersRes = drawTable(x0, ordersTop, ORDERS_COLS, oColW, ORDERS_ROWS, G.headerH, G.rowH, mob, {
                    title: 'ORDERS', fkCol: 'user_id', fkOn: !!step.fkOn,
                    attemptRow: step.attemptRow || null, attemptResult: step.attemptResult || null, reserveAttempt: true
                });

                (step.revealed || []).forEach(function (link) {
                    var from = ordersRes.cellCenters[link.orderIdx].user_id;
                    var to   = usersRes.cellCenters[link.userIdx].id;
                    var active = step.activeIdx === link.orderIdx;
                    var col = active ? P.teal + 'ee' : P.teal + '66';
                    var bow = (link.orderIdx - (ORDERS_ROWS.length - 1) / 2) * (mob ? 16 : 20);
                    arrowUp(from.x, from.y - G.rowH / 2 + 2, to.x, to.y + G.rowH / 2 - 2, col, active ? 2 : 1.3, null, bow);
                });

                if (step.attemptRow && ordersRes.attemptCenters) {
                    var fromBad = ordersRes.attemptCenters.user_id;
                    var stubY = fromBad.y - G.rowH * 1.4;
                    seg(fromBad.x, fromBad.y - G.rowH / 2 + 2, fromBad.x, stubY, P.orange + 'cc', 1.6);
                    tx('✕', fromBad.x, stubY - (mob ? 10 : 12), mob ? 13 : 15, P.orange + 'ee', 'center', true);
                    tx('(대상 없음)', fromBad.x, stubY - (mob ? 22 : 26), mob ? 10 : 11, P.orange + 'aa', 'center', false);
                }
            }
        }
    }

    /* ===================== 애니메이션(스텝 전환) ===================== */
    function animateStep(onDone) {
        if (rafId) cancelAnimationFrame(rafId);
        draw();
        rafId = requestAnimationFrame(function () {
            rafId = null;
            if (onDone) onDone();
        });
    }

    /* ===================== 컨트롤 ===================== */
    function setSpeedDisabled(v) {
        speedBtns.forEach(function (b) { b.disabled = v; });
    }

    function defaultLog() {
        return currentSteps()[0].log;
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
        var next  = stepIdx + 1;
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
        speedBtns.forEach(function (b) { b.classList.remove('rdbms-viz__speed-btn--active'); });
        btn.classList.add('rdbms-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) {
            modeBtns[d.key].classList.toggle('rdbms-viz__mode-btn--active', d.key === m);
        });
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