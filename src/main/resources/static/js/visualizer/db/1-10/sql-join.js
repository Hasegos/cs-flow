/**
 * SQL JOIN 시각화 시각화
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
    var root    = el('div', 'sql-join-viz');
    var toolbar = el('div', 'sql-join-viz__toolbar');
    var tbLeft  = el('div', 'sql-join-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'sql-join-viz__title', 'JOIN'));

    var modeWrap = el('div', 'sql-join-viz__mode');
    var modeDefs = [
        { key: 'inner', label: 'INNER' },
        { key: 'left', label: 'LEFT' },
        { key: 'right', label: 'RIGHT' },
        { key: 'full', label: 'FULL' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'sql-join-viz__mode-btn' + (i === 0 ? ' sql-join-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'sql-join-viz__speed');
    speedWrap.appendChild(el('span', 'sql-join-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'sql-join-viz__speed-btn' + (i === 0 ? ' sql-join-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'sql-join-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'sql-join-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'sql-join-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'sql-join-viz__controls');
    var btnPlay  = el('button', 'sql-join-viz__btn sql-join-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'sql-join-viz__btn', '▶| STEP');
    var btnReset = el('button', 'sql-join-viz__btn', '↺ RESET');
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
    var mode    = 'inner';
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

    /* ===================== 기준 데이터 ===================== */
    var A_COLS = ['id', 'name'];
    var A_ROWS = [
        { id: 1, name: '김민준' },
        { id: 2, name: '이서연' },
        { id: 3, name: '박도윤' }
    ];
    var B_COLS = ['id', 'user_id', 'product'];
    var B_ROWS = [
        { id: 101, user_id: 1, product: '노트북' },
        { id: 102, user_id: 2, product: '키보드' },
        { id: 103, user_id: 5, product: '마우스' }
    ];

    var A_COL_W = { d: { id: 46, name: 88 }, m: { id: 36, name: 70 } };
    var B_COL_W = { d: { id: 46, user_id: 66, product: 88 }, m: { id: 36, user_id: 52, product: 70 } };

    function indexOfA(id) { for (var i = 0; i < A_ROWS.length; i++) if (A_ROWS[i].id === id) return i; return -1; }
    function indexOfBForA(aid) { for (var i = 0; i < B_ROWS.length; i++) if (B_ROWS[i].user_id === aid) return i; return -1; }

    function mkRow(aIdx, bIdx) {
        var a = aIdx >= 0 ? A_ROWS[aIdx] : null;
        var b = bIdx >= 0 ? B_ROWS[bIdx] : null;
        return { aIdx: aIdx, bIdx: bIdx, a_id: a ? a.id : null, a_name: a ? a.name : null, b_id: b ? b.id : null, b_product: b ? b.product : null };
    }

    /* ===================== JOIN 연산 (실제 실행 — 하드코딩 아님) ===================== */
    function innerJoinRows() {
        var out = [];
        B_ROWS.forEach(function (b, bIdx) {
            var aIdx = indexOfA(b.user_id);
            if (aIdx >= 0) out.push(mkRow(aIdx, bIdx));
        });
        return out;
    }
    function leftJoinRows() {
        var out = [];
        A_ROWS.forEach(function (a, aIdx) {
            out.push(mkRow(aIdx, indexOfBForA(a.id)));
        });
        return out;
    }
    function rightJoinRows() {
        var out = [];
        B_ROWS.forEach(function (b, bIdx) {
            out.push(mkRow(indexOfA(b.user_id), bIdx));
        });
        return out;
    }
    function fullJoinRows() {
        var out = leftJoinRows();
        B_ROWS.forEach(function (b, bIdx) {
            if (indexOfA(b.user_id) < 0) out.push(mkRow(-1, bIdx));
        });
        return out;
    }

    var JOIN_FN = { inner: innerJoinRows, left: leftJoinRows, right: rightJoinRows, full: fullJoinRows };
    var JOIN_LABEL = { inner: 'INNER JOIN', left: 'LEFT JOIN', right: 'RIGHT JOIN', full: 'FULL OUTER JOIN' };
    var JOIN_DESC = {
        inner: '양쪽 모두에 값이 있는 행만 남깁니다 — 벤 다이어그램의 겹치는 부분(교집합)만 결과가 됩니다.',
        left:  'A(USERS)의 모든 행을 남기고, 짝이 없는 B 쪽은 NULL로 채웁니다 — 벤 다이어그램에서 왼쪽 원 전체입니다.',
        right: 'B(ORDERS)의 모든 행을 남기고, 짝이 없는 A 쪽은 NULL로 채웁니다 — 벤 다이어그램에서 오른쪽 원 전체입니다.',
        full:  '양쪽의 모든 행을 남기고, 짝이 없는 쪽은 NULL로 채웁니다 — 벤 다이어그램에서 두 원의 합집합입니다.'
    };

    /* ===================== 스텝 빌더 ===================== */
    function rowLogText(r) {
        if (r.aIdx >= 0 && r.bIdx >= 0) {
            return 'USERS(' + r.a_id + ', ' + r.a_name + ') ↔ ORDERS(' + r.b_id + ', ' + r.b_product + ') — user_id=' + r.a_id + ' 일치';
        }
        if (r.aIdx >= 0 && r.bIdx < 0) {
            return 'USERS(' + r.a_id + ', ' + r.a_name + ')는 주문이 없어 ORDERS 쪽이 NULL로 채워집니다.';
        }
        return 'ORDERS(' + r.b_id + ', ' + r.b_product + ')의 user_id=' + B_ROWS[r.bIdx].user_id + '가 USERS에 없어 A 쪽이 NULL로 채워집니다.';
    }

    function buildSteps(joinType) {
        var rows = JOIN_FN[joinType]();
        var steps = [];
        steps.push({ kind: 'intro', joinType: joinType, revealed: [],
            log: JOIN_LABEL[joinType] + ' — ' + JOIN_DESC[joinType] });
        var revealed = [];
        rows.forEach(function (r) {
            revealed = revealed.concat([r]);
            steps.push({ kind: 'reveal', joinType: joinType, revealed: revealed.slice(), active: r,
                log: rowLogText(r) });
        });
        steps.push({ kind: 'done', joinType: joinType, revealed: revealed.slice(),
            log: '정리 — ' + JOIN_LABEL[joinType] + ' 결과는 총 ' + rows.length + '행입니다. (' + JOIN_DESC[joinType] + ')' });
        return steps;
    }

    var STEPS_BY_MODE = {
        inner: buildSteps('inner'),
        left:  buildSteps('left'),
        right: buildSteps('right'),
        full:  buildSteps('full')
    };

    /* ===================== 상태 ===================== */
    function currentSteps() { return STEPS_BY_MODE[mode]; }
    function defaultLog() { return currentSteps()[0].log; }

    /* ===================== 레이아웃 ===================== */
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    function layout(w, mob) {
        var aCols = A_COL_W[mob ? 'm' : 'd'];
        var bCols = B_COL_W[mob ? 'm' : 'd'];
        var aW = aCols.id + aCols.name;
        var bW = bCols.id + bCols.user_id + bCols.product;
        var rW = aW + bCols.id + bCols.product;
        var hh = mob ? 24 : 30;
        var rh = mob ? 24 : 28;
        var g = {
            fs: mob ? 11 : 12, hh: hh, rh: rh, aCols: aCols, bCols: bCols,
            aW: aW, bW: bW, rW: rW, resH: hh + 4 * rh,
            aTop: 22, aH: hh + A_ROWS.length * rh, bH: hh + B_ROWS.length * rh,
            rCols: { a_id: aCols.id, a_name: aCols.name, b_id: bCols.id, b_product: bCols.product }
        };
        if (mob) {
            g.bX = 0;
            g.bTop = g.aTop + g.aH + 30;
            g.lx = (w - 108) / 2 + 36;
            g.rx = g.lx + 36;
            g.vr = 36;
            g.vtitleY = g.bTop + g.bH + 22;
            g.vcy = g.bTop + g.bH + 66;
            g.rX = 0;
            g.rtitleY = g.vcy + 54;
            g.resTop = g.rtitleY + 22;
        } else {
            g.bX = aW + 150;
            g.bTop = g.aTop;
            g.lx = 58;
            g.rx = 112;
            g.vr = 54;
            g.vtitleY = g.aTop + g.aH + 44;
            g.vcy = g.vtitleY + 124;
            g.rX = 240;
            g.rtitleY = g.vtitleY;
            g.resTop = g.vtitleY + 38;
        }
        g.H = g.resTop + g.resH + 12;
        return g;
    }

    function sceneH(w, mob) { return Math.ceil(layout(w, mob).H); }

    /* ===================== 장면 보조 ===================== */
    function sjKindOf(r) {
        if (r.aIdx >= 0 && r.bIdx >= 0) return 'both';
        return r.aIdx >= 0 ? 'lonly' : 'ronly';
    }

    function sjKinds(st) {
        var out = [];
        st.revealed.forEach(function (r) {
            var k = sjKindOf(r);
            if (out.indexOf(k) < 0) out.push(k);
        });
        return out;
    }

    function sjKindCol(k) { return k === 'both' ? P.green : (k === 'lonly' ? P.purple : P.teal); }

    function sjChipText(r) {
        return (r.aIdx >= 0 ? r.a_name : 'NULL') + ' · ' + (r.bIdx >= 0 ? r.b_product : 'NULL');
    }

    function sjTextW(str, fs) {
        var n = 0;
        for (var i = 0; i < str.length; i++) n += str.charCodeAt(i) > 255 ? fs : fs * 0.6;
        return n;
    }

    function sjMid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

    function sjPairPts(g, x0, top, r, mob) {
        var ay = top + g.aTop + g.hh + r.aIdx * g.rh + g.rh / 2;
        var by = top + g.bTop + g.hh + r.bIdx * g.rh + g.rh / 2;
        if (!mob) return [{ x: x0 + g.aW + 3, y: ay }, { x: x0 + g.bX - 3, y: by }];
        var lane = x0 + g.bW + 8 + (r.aIdx === 0 ? 7 : 0);
        return [{ x: x0 + g.aW + 3, y: ay }, { x: lane, y: ay }, { x: lane, y: by }, { x: x0 + g.bW + 3, y: by }];
    }

    function sjHead(x1, y1, x2, y2, col) {
        var a = Math.atan2(y2 - y1, x2 - x1);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 8 * Math.cos(a - 0.45), y2 - 8 * Math.sin(a - 0.45));
        ctx.lineTo(x2 - 8 * Math.cos(a + 0.45), y2 - 8 * Math.sin(a + 0.45));
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();
    }

    function sjPoly(pts, pr, col, lw) {
        var segs = [], tot = 0, i;
        for (i = 1; i < pts.length; i++) {
            var l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
            segs.push(l);
            tot += l;
        }
        var want = tot * pr;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (i = 1; i < pts.length; i++) {
            var sl = segs[i - 1];
            if (want >= sl) {
                ctx.lineTo(pts[i].x, pts[i].y);
                want -= sl;
            } else {
                var f = sl > 0 ? want / sl : 0;
                ctx.lineTo(lerp(pts[i - 1].x, pts[i].x, f), lerp(pts[i - 1].y, pts[i].y, f));
                break;
            }
        }
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        ctx.stroke();
        if (pr >= 1) {
            var n = pts.length;
            sjHead(pts[n - 2].x, pts[n - 2].y, pts[n - 1].x, pts[n - 1].y, col);
        }
    }

    function sjSource(x, y, cols, colW, rows, hh, rh, fs) {
        var colX = {}, tw = 0;
        cols.forEach(function (c) { colX[c] = tw; tw += colW[c]; });
        var H = hh + rows.length * rh;
        rr(x, y, tw, H, 6, 'none', P.muted + '55', 1.3);
        cols.forEach(function (c) {
            rr(x + colX[c], y, colW[c], hh, 0, P.muted + '12', 'none');
            tx(c, x + colX[c] + colW[c] / 2, y + hh / 2, fs, P.text + 'cc', 'center', true);
            if (colX[c] > 0) ln(x + colX[c], y, x + colX[c], y + H, P.muted + '2a', 1);
        });
        ln(x, y + hh, x + tw, y + hh, P.muted + '55', 1.3);
        rows.forEach(function (row, ri) {
            var ry = y + hh + ri * rh;
            if (ri > 0) ln(x, ry, x + tw, ry, P.muted + '2a', 1);
            cols.forEach(function (c) {
                tx(String(row[c]), x + colX[c] + colW[c] / 2, ry + rh / 2, fs, P.text + 'dd', 'center', false);
            });
        });
    }

    function sjHi(x, y, tw, ri, hh, rh, a) {
        if (a <= 0) return;
        ctx.globalAlpha = a;
        rr(x, y + hh + ri * rh, tw, rh, 0, P.orange + '2e', P.orange + 'ff', 1.4);
        ctx.globalAlpha = 1;
    }

    function sjVenn(g, x0, top, e, s, p, mob) {
        var lx = x0 + g.lx, rx = x0 + g.rx, cy = top + g.vcy, r = g.vr;
        var ks = sjKinds(s), kp = sjKinds(p);
        var all = currentSteps();
        var targets = sjKinds(all[all.length - 1]);
        var lvl = function (k) {
            if (ks.indexOf(k) < 0) return 0;
            return kp.indexOf(k) >= 0 ? 1 : ez(seg(e, 0.75, 0.95));
        };
        var fillK = function (k, a) {
            if (a <= 0) return;
            var ownX = k === 'ronly' ? rx : lx;
            var othX = k === 'ronly' ? lx : rx;
            ctx.save();
            ctx.globalAlpha = a;
            ctx.fillStyle = sjKindCol(k) + 'aa';
            ctx.beginPath();
            ctx.arc(ownX, cy, r, 0, Math.PI * 2);
            ctx.clip();
            ctx.beginPath();
            if (k !== 'both') ctx.rect(lx - 4 * r, cy - 3 * r, 10 * r, 6 * r);
            ctx.moveTo(othX + r, cy);
            ctx.arc(othX, cy, r, 0, Math.PI * 2);
            ctx.fill(k === 'both' ? 'nonzero' : 'evenodd');
            ctx.restore();
        };
        targets.forEach(function (k) { fillK(k, 0.14); });
        ['lonly', 'both', 'ronly'].forEach(function (k) { fillK(k, lvl(k)); });
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(lx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = P.purple + 'dd';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(rx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = P.teal + 'dd';
        ctx.lineWidth = 2;
        ctx.stroke();
        tx('A', lx - r * 0.5, cy - 6, mob ? 13 : 15, P.purple + 'ee', 'center', true);
        tx('B', rx + r * 0.5, cy - 6, mob ? 13 : 15, P.teal + 'ee', 'center', true);
        tx('USERS', lx - r * 0.5, cy + (mob ? 10 : 14), mob ? 11 : 12, P.purple + 'cc', 'center', false);
        tx('ORDERS', rx + r * 0.5, cy + (mob ? 10 : 14), mob ? 11 : 12, P.teal + 'cc', 'center', false);
    }

    /* ===================== 장면 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var g = layout(w, mob);
        var steps = currentSteps();
        var s = step || steps[0];
        var p = prev || s;
        var e = clamp01(t);
        var fresh = p !== s;
        var fs = g.fs, hh = g.hh, rh = g.rh;
        var act = s.active || null;
        var pAct = fresh && p.active ? p.active : null;
        var ax = x0, bx = x0 + g.bX, ay0 = top + g.aTop, by0 = top + g.bTop;
        var hiA = act && fresh ? ez(seg(e, 0, 0.25)) : 1;
        var pFade = pAct ? 1 - ez(seg(e, 0, 0.3)) : 0;

        if (pAct && pAct !== act) {
            if (pAct.aIdx >= 0) sjHi(ax, ay0, g.aW, pAct.aIdx, hh, rh, pFade);
            if (pAct.bIdx >= 0) sjHi(bx, by0, g.bW, pAct.bIdx, hh, rh, pFade);
        }
        if (act) {
            if (act.aIdx >= 0) sjHi(ax, ay0, g.aW, act.aIdx, hh, rh, hiA);
            if (act.bIdx >= 0) sjHi(bx, by0, g.bW, act.bIdx, hh, rh, hiA);
        }
        tx('A = USERS', ax, ay0 - 12, fs, P.sub + 'ff', 'left', true);
        tx('B = ORDERS', bx, by0 - 12, fs, P.sub + 'ff', 'left', true);
        sjSource(ax, ay0, A_COLS, g.aCols, A_ROWS, hh, rh, fs);
        sjSource(bx, by0, B_COLS, g.bCols, B_ROWS, hh, rh, fs);

        s.revealed.forEach(function (r) {
            if (sjKindOf(r) !== 'both') return;
            var pts = sjPairPts(g, x0, top, r, mob);
            if (r === act) sjPoly(pts, fresh ? ez(seg(e, 0, 0.35)) : 1, P.orange + 'ff', 2.2);
            else sjPoly(pts, 1, P.green + '88', 1.4);
        });

        tx('벤 다이어그램', x0, top + g.vtitleY, fs, P.sub + 'ff', 'left', true);
        sjVenn(g, x0, top, e, s, p, mob);

        var rc = ['a_id', 'a_name', 'b_id', 'b_product'];
        var rl = { a_id: 'id', a_name: 'name', b_id: 'id', b_product: 'product' };
        var rx0 = x0 + g.rX, ry0 = top + g.resTop;
        var aGW = g.rCols.a_id + g.rCols.a_name, bGW = g.rCols.b_id + g.rCols.b_product;
        tx('결과 (JOIN 결과)', rx0, top + g.rtitleY, fs, P.sub + 'ff', 'left', true);
        tx(s.revealed.length + '행', rx0 + g.rW, top + g.rtitleY, fs, P.sub + 'ff', 'right', true);
        tx('A(USERS)', rx0 + aGW / 2, ry0 - 9, fs, P.purple + 'cc', 'center', false);
        tx('B(ORDERS)', rx0 + aGW + bGW / 2, ry0 - 9, fs, P.teal + 'cc', 'center', false);
        rr(rx0, ry0, g.rW, g.resH, 6, 'none', P.muted + '55', 1.3);
        var cxr = rx0;
        rc.forEach(function (c) {
            var cwr = g.rCols[c];
            rr(cxr, ry0, cwr, hh, 0, P.muted + '12', 'none');
            tx(rl[c], cxr + cwr / 2, ry0 + hh / 2, fs, P.text + 'cc', 'center', true);
            cxr += cwr;
        });
        ln(rx0, ry0 + hh, rx0 + g.rW, ry0 + hh, P.muted + '55', 1.3);
        var vx = rx0;
        rc.forEach(function (c, i) {
            if (i > 0 && i !== 2) ln(vx, ry0, vx, ry0 + g.resH, P.muted + '2a', 1);
            vx += g.rCols[c];
        });
        ln(rx0 + aGW, ry0, rx0 + aGW, ry0 + g.resH, P.muted + '66', 1.6);

        s.revealed.forEach(function (r, ri) {
            var ry = ry0 + hh + ri * rh;
            var isNew = p.revealed.indexOf(r) < 0;
            var a = isNew ? seg(e, 0.8, 0.95) : 1;
            if (ri > 0) ln(rx0, ry, rx0 + g.rW, ry, P.muted + '2a', 1);
            ctx.globalAlpha = a;
            if (r === act) rr(rx0, ry, g.rW, rh, 0, P.orange + '2a', 'none');
            var shift = isNew ? (1 - a) * 10 : 0;
            var cx = rx0;
            rc.forEach(function (c) {
                var v = r[c];
                var isNull = v === null || v === undefined;
                var colr = isNull ? P.sub + 'ff' : (r === act ? P.orange + 'ff' : P.text + 'dd');
                tx(isNull ? 'NULL' : String(v), cx + g.rCols[c] / 2 + shift, ry + rh / 2, fs, colr, 'center', r === act && !isNull);
                cx += g.rCols[c];
            });
            ctx.globalAlpha = 1;
        });

        if (fresh && s.kind === 'done') {
            ctx.globalAlpha = ez(seg(e, 0, 0.5)) * (1 - ez(seg(e, 0.5, 1)));
            rr(rx0 - 3, ry0 - 3, g.rW + 6, g.resH + 6, 7, 'none', P.green + 'ff', 2);
            ctx.globalAlpha = 1;
        }

        if (act && fresh) {
            var kind = sjKindOf(act);
            var txt = sjChipText(act);
            var cw = sjTextW(txt, fs) + 14, ch = rh - 6;
            var from;
            if (kind === 'both') {
                var pts2 = sjPairPts(g, x0, top, act, mob);
                from = mob ? sjMid(pts2[1], pts2[2]) : sjMid(pts2[0], pts2[1]);
            } else if (kind === 'lonly') {
                from = { x: ax + g.aW / 2, y: ay0 + hh + act.aIdx * rh + rh / 2 };
            } else {
                from = { x: bx + g.bW / 2, y: by0 + hh + act.bIdx * rh + rh / 2 };
            }
            var slot = s.revealed.indexOf(act);
            var to = { x: rx0 + g.rW / 2, y: ry0 + hh + slot * rh + rh / 2 };
            var q = ez(seg(e, 0.2, 0.8));
            var px = lerp(from.x, to.x, q), py = lerp(from.y, to.y, q);
            px = Math.min(Math.max(px, x0 + cw / 2), x0 + w - cw / 2);
            var ca = ez(seg(e, 0, 0.12)) * (1 - seg(e, 0.82, 0.95));
            if (ca > 0) {
                var col = sjKindCol(kind);
                ctx.globalAlpha = ca;
                rr(px - cw / 2, py - ch / 2, cw, ch, 5, col + 'ff', col + 'ff', 1.2);
                tx(txt, px, py, fs, '#111111', 'center', true);
                ctx.globalAlpha = 1;
            }
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
        speedBtns.forEach(function (b) { b.classList.remove('sql-join-viz__speed-btn--active'); });
        btn.classList.add('sql-join-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('sql-join-viz__mode-btn--active', d.key === m); });
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