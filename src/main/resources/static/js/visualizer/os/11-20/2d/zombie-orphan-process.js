/**
 * 좀비 / 고아 프로세스 시각화
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
    var root    = el('div', 'zo-viz');
    var toolbar = el('div', 'zo-viz__toolbar');
    var tbLeft  = el('div', 'zo-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'zo-viz__title', 'PROCESS TABLE'));

    var modeWrap = el('div', 'zo-viz__mode');
    var modeDefs = [
        { key: 'zombie', label: '좀비 프로세스' },
        { key: 'orphan', label: '고아 프로세스' },
        { key: 'pile', label: '좀비 누적' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'zo-viz__mode-btn' + (i === 0 ? ' zo-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'zo-viz__speed');
    speedWrap.appendChild(el('span', 'zo-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'zo-viz__speed-btn' + (i === 0 ? ' zo-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'zo-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'zo-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'zo-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'zo-viz__controls');
    var btnPlay  = el('button', 'zo-viz__btn zo-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'zo-viz__btn', '▶| STEP');
    var btnReset = el('button', 'zo-viz__btn', '↺ RESET');
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
    var mode    = 'zombie';
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

    /* ===================== 데이터: 프로세스 테이블 ===================== */
    var INIT = { pid: 1, ppid: 0, st: 'S', n: 'init (systemd)' };
    function row(pid, ppid, st, n) { return { pid: pid, ppid: ppid, st: st, n: n }; }
    var P_PID = 200;
    var C_PID = 201;
    var STATE_LABEL = { R: '실행 중', S: '대기', Z: '좀비' };

    /* ===================== 데이터: 좀비 프로세스 ===================== */
    var ZOMBIE_STEPS = [
        { rows: [INIT, row(P_PID, 50, 'R', '부모'), row(C_PID, P_PID, 'R', '자식')], hl: -1, log: '부모(PID ' + P_PID + ')가 fork로 자식(PID ' + C_PID + ')을 만들었습니다. 커널은 두 프로세스를 프로세스 테이블에 기록합니다.' },
        { rows: [INIT, row(P_PID, 50, 'R', '부모'), row(C_PID, P_PID, 'Z', '자식')], hl: 2, log: '자식이 exit으로 종료했습니다. 메모리 같은 자원은 반납되지만, 부모가 종료 상태를 읽어 갈 수 있도록 커널이 PID와 종료 상태 항목을 프로세스 테이블에 남겨 둡니다. 이 상태가 좀비(Z)입니다.' },
        { rows: [INIT, row(P_PID, 50, 'R', '부모'), row(C_PID, P_PID, 'Z', '자식')], hl: 2, log: '부모가 다른 일을 하느라 wait()를 부르지 않으면 좀비는 그대로 남습니다. ps에는 defunct로 보이고, 이미 끝난 프로세스라 kill로 신호를 보내도 없어지지 않습니다.' },
        { rows: [INIT, row(P_PID, 50, 'R', '부모')], hl: -1, log: '부모가 wait() 또는 waitpid()를 호출하면 자식의 종료 상태를 받아 가고, 커널이 좀비의 프로세스 테이블 항목을 지웁니다.' },
        { rows: [INIT, row(P_PID, 50, 'R', '부모')], hl: -1, log: '정리 — 좀비는 실행 중인 프로세스가 아니라, 부모가 종료 상태를 회수하기를 기다리는 기록입니다. 없애려면 부모가 회수하거나 부모가 종료되어야 합니다.' }
    ];

    /* ===================== 데이터: 고아 프로세스 ===================== */
    var ORPHAN_STEPS = [
        { rows: [INIT, row(P_PID, 50, 'R', '부모'), row(C_PID, P_PID, 'R', '자식')], hl: -1, log: '부모(PID ' + P_PID + ')와 자식(PID ' + C_PID + ')이 실행 중입니다.' },
        { rows: [INIT, row(C_PID, P_PID, 'R', '자식')], hl: 1, log: '부모가 자식보다 먼저 종료했습니다. 자식은 아직 실행 중이지만 PPID가 가리키던 부모(' + P_PID + ')가 없어졌습니다. 이 자식이 고아 프로세스입니다.' },
        { rows: [INIT, row(C_PID, 1, 'R', '자식')], hl: 1, log: '커널이 고아의 부모를 init(PID 1, 현대 리눅스에서는 보통 systemd)으로 바꿉니다. PPID가 ' + P_PID + '에서 1이 되었고, 자식은 계속 실행됩니다.' },
        { rows: [INIT, row(C_PID, 1, 'Z', '자식')], hl: 1, log: '자식이 종료하면 잠시 좀비 상태가 되지만, 부모가 된 init이 종료 상태를 회수합니다.' },
        { rows: [INIT], hl: -1, log: '정리 — 고아 프로세스는 init이 입양해 종료될 때 회수해 주므로 좀비로 남지 않습니다. 고아는 문제가 아니라 정상적으로 처리되는 상태입니다.' }
    ];

    /* ===================== 데이터: 좀비 누적 ===================== */
    var CAP = 8;
    var FIXED = 2;
    var FREE = CAP - FIXED;
    var PILE_COUNTS = [0, 1, 3, FREE];
    var PILE_STEPS = [{ z: 0, log: '프로세스 테이블에 넣을 수 있는 항목 수는 한정되어 있습니다(설명을 위해 ' + CAP + '칸으로 가정). 부모가 wait()를 호출하지 않고 자식을 계속 만들고 종료시킵니다.' }]
        .concat(PILE_COUNTS.slice(1).map(function (c) {
            return { z: c, log: '자식이 ' + c + '개 종료됐지만 회수되지 않아 좀비 ' + c + '개가 테이블 ' + c + '칸을 차지합니다.' + (c === FREE ? ' 남은 칸이 없습니다(' + (FIXED + c) + '/' + CAP + ').' : '') };
        }))
        .concat([{ z: FREE, fail: true, log: '테이블이 가득 차면 새 프로세스를 만들 수 없어 fork가 실패합니다. 이 호스트에서는 다른 프로그램도 새 프로세스를 못 만들게 됩니다.' }])
        .concat([{ z: 0, reaped: true, log: '부모가 wait()로 좀비를 회수하거나 부모가 종료되면 좀비 항목이 사라지고 칸이 비워집니다. 자식이 끝날 때마다 회수하는 것이 해결책입니다.' }]);

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'orphan') return ORPHAN_STEPS;
        if (mode === 'pile') return PILE_STEPS;
        return ZOMBIE_STEPS;
    }
    function defaultLog() {
        if (mode === 'orphan') return '부모가 먼저 종료되었을 때 자식이 init에게 입양되는 과정을 봅니다.';
        if (mode === 'pile') return '부모가 종료 상태를 회수하지 않을 때 좀비가 프로세스 테이블을 채우는 모습을 봅니다.';
        return '자식이 종료했는데 부모가 회수하지 않을 때 좀비가 되는 과정을 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function dims(w, mob) {
        var lvl = mob ? 46 : 52;
        var nodeH = 34;
        var rh = mob ? 32 : 36;
        var treeH = 2 * lvl + nodeH + 44;
        var tableH = 24 + 3 * (rh + 6);
        var stack = mob;
        return { lvl: lvl, nodeH: nodeH, rh: rh, treeH: treeH, tableH: tableH, stack: stack, fs: mob ? 11 : 12 };
    }
    function layout(w, mob) {
        var d = dims(w, mob);
        if (mode === 'pile') return { fs: d.fs, total: 28 + 2 * ((mob ? 44 : 50) + 6) + 14 + 24 };
        return { fs: d.fs, total: (d.stack ? d.treeH + 10 + d.tableH : Math.max(d.treeH, d.tableH)) + 14 };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }
    function findRow(rows, pid) {
        for (var i = 0; i < rows.length; i++) { if (rows[i].pid === pid) return i; }
        return -1;
    }
    function depthOf(rows, r) {
        if (r.pid === 1) return 0;
        var pi = findRow(rows, r.ppid);
        if (pi >= 0) return depthOf(rows, rows[pi]) + 1;
        if (r.ppid === 1) return 1;
        return r.pid === C_PID ? 2 : 1;
    }

    /* ===================== 프로세스 트리와 표 ===================== */
    function drawTree(x0, top, w, mob, s, p, e, d) {
        var cx = x0 + w / 2;
        var nw = mob ? 104 : 116;
        var y0 = top + 40;
        var col = function (r) { return r.st === 'Z' ? P.red : (r.pid === 1 ? P.purple : P.teal); };
        tx('프로세스 트리', x0, top + 8, d.fs - 0.5, P.sub + 'ff', 'left', true);
        function posOf(rows, r) { return { x: cx, y: y0 + depthOf(rows, r) * d.lvl }; }
        var k;
        var seen = {};
        var list = [];
        s.rows.forEach(function (r) { list.push({ r: r, cur: true }); seen[r.pid] = 1; });
        p.rows.forEach(function (r) { if (!seen[r.pid]) list.push({ r: r, cur: false }); });
        var q = ez(e);
        var ghost = null;
        s.rows.forEach(function (r) {
            if (r.pid !== 1 && r.ppid !== 1 && findRow(s.rows, r.ppid) < 0 && r.pid === C_PID) ghost = { pid: r.ppid, y: y0 + d.lvl };
        });
        /* 선 */
        s.rows.forEach(function (r) {
            if (r.pid === 1) return;
            var pi = findRow(p.rows, r.pid);
            var to = posOf(s.rows, r);
            var from = pi >= 0 ? posOf(p.rows, p.rows[pi]) : null;
            var par = findRow(s.rows, r.ppid);
            var src = par >= 0 ? posOf(s.rows, s.rows[par]) : (r.ppid === 1 ? posOf(s.rows, s.rows[0]) : (ghost && r.pid === C_PID ? { x: cx, y: ghost.y } : null));
            if (!src) return;
            var ppar = pi >= 0 ? findRow(p.rows, p.rows[pi].ppid) : -1;
            var psrc = ppar >= 0 ? posOf(p.rows, p.rows[ppar]) : (pi >= 0 && p.rows[pi].ppid === 1 ? posOf(p.rows, p.rows[0]) : (pi >= 0 ? { x: cx, y: y0 + d.lvl } : src));
            var sy = lerp(psrc.y, src.y, q);
            var ny = pi >= 0 ? lerp(from.y, to.y, q) : lerp(src.y, to.y, q);
            var dang = par < 0 && r.ppid !== 1;
            ctx.setLineDash(dang ? [4, 3] : []);
            ln(cx, sy + d.nodeH / 2 - 2, cx, ny - d.nodeH / 2 + 2, (dang ? P.yellow : P.sub) + 'ff', 2);
            ctx.setLineDash([]);
        });
        /* 사라지는 부모의 자리표시 */
        if (ghost) {
            ctx.setLineDash([4, 3]);
            rr(cx - nw / 2, ghost.y - d.nodeH / 2, nw, d.nodeH, 6, 'none', P.red + 'aa', 1.4);
            ctx.setLineDash([]);
            tx('PID ' + ghost.pid + ' 종료', cx, ghost.y, d.fs - 1, P.red + 'cc', 'center', true);
        }
        /* 노드 */
        list.forEach(function (it) {
            var r = it.r;
            var pi = findRow(p.rows, r.pid);
            var ci = findRow(s.rows, r.pid);
            var to = ci >= 0 ? posOf(s.rows, r) : posOf(p.rows, r);
            var from = pi >= 0 ? posOf(p.rows, p.rows[pi]) : null;
            var pos = { x: to.x, y: to.y };
            var a = 1;
            var sc = 1;
            if (ci >= 0 && pi >= 0) pos.y = lerp(from.y, to.y, q);
            else if (ci >= 0) {
                var pr = findRow(s.rows, r.ppid);
                var ps = pr >= 0 ? posOf(s.rows, s.rows[pr]) : to;
                pos.y = lerp(ps.y, to.y, q);
                a = clamp01(e * 2);
            } else { a = clamp01(1 - e * 1.6); sc = 1 - 0.1 * q; }
            if (a <= 0) return;
            var c = col(r);
            var prevSt = pi >= 0 ? p.rows[pi].st : r.st;
            var changed = ci >= 0 && pi >= 0 && prevSt !== r.st;
            var hot = ci >= 0 && s.hl === ci && s.rows.length > 0;
            ctx.globalAlpha = a;
            rr(cx - nw * sc / 2, pos.y - d.nodeH * sc / 2, nw * sc, d.nodeH * sc, 6, c + '2a', changed && e < 1 ? P.yellow + 'ff' : c + (hot ? 'ff' : 'cc'), changed && e < 1 ? 3 : (hot ? 2.4 : 1.6));
            var label = r.n.split(' ')[0] + ' · ' + r.pid;
            tx(label, cx, pos.y - 6, d.fs - 1, P.text + 'ff', 'center', true);
            tx(STATE_LABEL[r.st], cx, pos.y + 8, d.fs - 1.5, c + 'ff', 'center', true);
            ctx.globalAlpha = 1;
            if (changed && e < 1) circ(cx, pos.y, 14 + e * 40, 'none', c + 'ff', 2);
            if (ci < 0 && e < 1) {
                tx('exit', cx + nw / 2 + 24, pos.y, d.fs - 1, P.red + 'ff', 'left', true);
            }
        });
        /* wait() 회수 */
        var zIn = p.rows.filter(function (r) { return r.st === 'Z'; });
        zIn.forEach(function (z) {
            if (findRow(s.rows, z.pid) >= 0 || e >= 1) return;
            var par = findRow(p.rows, z.ppid);
            if (par < 0) return;
            var a = posOf(p.rows, z), b = posOf(p.rows, p.rows[par]);
            circ(cx + nw / 2 + 10, lerp(a.y, b.y, ez(e)), 5, P.yellow + 'ff', 'none');
            tx('wait()', cx + nw / 2 + 22, lerp(a.y, b.y, ez(e)) - 12, d.fs - 1, P.yellow + 'ff', 'left', true);
        });
    }

    function drawTable(x0, top, w, mob, s, p, e, d) {
        var fs = d.fs;
        var rh = d.rh;
        var c = [x0 + 8, x0 + w * 0.2, x0 + w * 0.38, x0 + w * 0.6];
        var q = ez(e);
        tx('PID', c[0], top + 12, fs - 1, P.sub + 'ff', 'left', true);
        tx('PPID', c[1], top + 12, fs - 1, P.sub + 'ff', 'left', true);
        tx('상태', c[2], top + 12, fs - 1, P.sub + 'ff', 'left', true);
        tx('프로세스', c[3], top + 12, fs - 1, P.sub + 'ff', 'left', true);
        var seen = {};
        var list = [];
        s.rows.forEach(function (r, i) { list.push({ r: r, i: i, cur: true }); seen[r.pid] = 1; });
        p.rows.forEach(function (r, i) { if (!seen[r.pid]) list.push({ r: r, i: i, cur: false }); });
        list.forEach(function (it) {
            var r = it.r;
            var pi = findRow(p.rows, r.pid);
            var ci = findRow(s.rows, r.pid);
            var yi = ci >= 0 ? ci : pi;
            var y = top + 24 + yi * (rh + 6);
            var a = 1;
            if (ci >= 0 && pi >= 0) y = top + 24 + lerp(pi, ci, q) * (rh + 6);
            else if (ci >= 0) a = clamp01(e * 2);
            else a = clamp01(1 - e * 1.6);
            if (a <= 0) return;
            var zom = r.st === 'Z';
            var col = zom ? P.red : (r.pid === 1 ? P.purple : P.teal);
            var hot = ci >= 0 && ci === s.hl;
            var prow = pi >= 0 ? p.rows[pi] : r;
            var chSt = ci >= 0 && pi >= 0 && prow.st !== r.st && e < 1;
            var chPp = ci >= 0 && pi >= 0 && prow.ppid !== r.ppid;
            var off = ci >= 0 && pi < 0 ? (1 - clamp01(e * 2)) * 24 : 0;
            ctx.globalAlpha = a;
            rr(x0 + off, y, w - 2, rh, 5, col + (hot ? '34' : '1c'), chSt ? P.yellow + 'ff' : col + (hot ? 'ff' : 'aa'), chSt ? 2.6 : (hot ? 2 : 1.3));
            tx(String(r.pid), c[0] + off, y + rh / 2, fs, P.text + 'ee', 'left', true);
            if (chPp && e < 1) {
                ctx.globalAlpha = a * (1 - q);
                tx(String(prow.ppid), c[1], y + rh / 2 - q * 10, fs, P.text + 'ee', 'left', true);
                ctx.globalAlpha = a * q;
                tx(String(r.ppid), c[1], y + rh / 2 + (1 - q) * 10, fs, P.yellow + 'ff', 'left', true);
                ctx.globalAlpha = a;
            } else {
                tx(String(r.ppid), c[1] + off, y + rh / 2, fs, r.ppid === 1 && r.pid !== 1 ? P.yellow + 'ee' : P.text + 'ee', 'left', true);
            }
            tx(STATE_LABEL[r.st], c[2] + off, y + rh / 2, fs - 0.5, col + 'ee', 'left', true);
            tx(r.n, c[3] + off, y + rh / 2, fs - 0.5, P.text + 'ee', 'left', false);
            ctx.globalAlpha = 1;
        });
    }

    /* ===================== 좀비 누적 ===================== */
    function drawPile(x0, top, w, mob, s, p, e, d) {
        var fs = d.fs;
        var gap = 6, perRow = 4;
        var cw = (w - gap * (perRow - 1)) / perRow;
        var ch = mob ? 44 : 50;
        var shake = s.fail && !p.fail && e < 1 ? Math.sin(e * 50) * 3 * (1 - e) : 0;
        tx('프로세스 테이블 (' + CAP + '칸 가정)', x0, top + 12, fs, P.text + 'ee', 'left', true);
        for (var i = 0; i < CAP; i++) {
            var gx = x0 + (i % perRow) * (cw + gap) + shake;
            var gy = top + 28 + Math.floor(i / perRow) * (ch + gap);
            var label = '';
            var col = P.sub;
            var a = 1;
            var sc = 1;
            if (i === 0) { label = 'init'; col = P.purple; }
            else if (i === 1) { label = '부모'; col = P.teal; }
            else if (i - FIXED < s.z) {
                label = '좀비'; col = P.red;
                if (i - FIXED >= p.z) { var qq = clamp01((e - (i - FIXED - p.z) * 0.18) / 0.4); a = qq; sc = 0.6 + 0.4 * qq; }
            } else if (i - FIXED < p.z) {
                label = '좀비'; col = P.red;
                a = clamp01(1 - e * 1.8);
                sc = 0.6 + 0.4 * a;
            }
            var on = label !== '';
            rr(gx, gy, cw, ch, 5, 'none', P.sub + '66', 1.2);
            if (on) {
                ctx.globalAlpha = a;
                rr(gx + cw * (1 - sc) / 2, gy + ch * (1 - sc) / 2, cw * sc, ch * sc, 5, col + '30', s.fail ? P.red + 'ff' : col + 'dd', s.fail ? 2.4 : 1.8);
                tx(label, gx + cw / 2, gy + ch / 2, fs, col + 'ff', 'center', true);
                ctx.globalAlpha = 1;
            }
        }
        var used = FIXED + s.z;
        var by = top + 28 + 2 * (ch + gap) + 14;
        var shownUsed = Math.round(lerp(FIXED + p.z, used, ez(e)));
        tx('사용 ' + shownUsed + ' / ' + CAP, x0, by, fs + 0.5, shownUsed >= CAP ? P.red + 'ff' : P.text + 'ee', 'left', true);
        if (s.fail) {
            ctx.globalAlpha = p.fail ? 1 : clamp01((e - 0.4) / 0.6);
            tx('fork 실패: 더 만들 수 없음', x0 + w, by, fs, P.red + 'ff', 'right', true);
            ctx.globalAlpha = 1;
        }
        if (s.reaped && e < 1) tx('wait()로 회수', x0 + w, by, fs, P.yellow + 'ff', 'right', true);
    }

    function drawScene(x0, top, w, mob, step, prev, t) {
        var d = dims(w, mob);
        var e = clamp01(t);
        var s = step || currentSteps()[0];
        var p = prev || s;
        if (mode === 'pile') { drawPile(x0, top + 8, w, mob, s, p, e, d); return; }
        if (d.stack) {
            drawTree(x0, top + 8, w, mob, s, p, e, d);
            drawTable(x0, top + 8 + d.treeH + 10, w, mob, s, p, e, d);
        } else {
            var tw = w * 0.4;
            drawTree(x0, top + 8, tw, mob, s, p, e, d);
            drawTable(x0 + tw + w * 0.04, top + 8, w - tw - w * 0.04, mob, s, p, e, d);
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
        speedBtns.forEach(function (b) { b.classList.remove('zo-viz__speed-btn--active'); });
        btn.classList.add('zo-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('zo-viz__mode-btn--active', d.key === m); });
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