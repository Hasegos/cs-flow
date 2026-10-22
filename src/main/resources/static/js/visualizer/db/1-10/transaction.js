/**
 * 트랜잭션 시각화
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
    var root    = el('div', 'transaction-viz');
    var toolbar = el('div', 'transaction-viz__toolbar');
    var tbLeft  = el('div', 'transaction-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'transaction-viz__title', 'TXN'));

    var modeWrap = el('div', 'transaction-viz__mode');
    var modeDefs = [
        { key: 'acid', label: 'ACID' },
        { key: 'commit', label: '커밋(성공)' },
        { key: 'rollback', label: '롤백(실패)' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'transaction-viz__mode-btn' + (i === 0 ? ' transaction-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'transaction-viz__speed');
    speedWrap.appendChild(el('span', 'transaction-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'transaction-viz__speed-btn' + (i === 0 ? ' transaction-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'transaction-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'transaction-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'transaction-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'transaction-viz__controls');
    var btnPlay  = el('button', 'transaction-viz__btn transaction-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'transaction-viz__btn', '▶| STEP');
    var btnReset = el('button', 'transaction-viz__btn', '↺ RESET');
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
    var mode    = 'acid';
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



    /* ===================== 장면 데이터: 트랜잭션 ===================== */
    var LETTERS = [
        { l: 'A', name: '원자성', en: 'Atomicity' },
        { l: 'C', name: '일관성', en: 'Consistency' },
        { l: 'I', name: '고립성', en: 'Isolation' },
        { l: 'D', name: '지속성', en: 'Durability' }
    ];

    function st(log, o) {
        var s = { log: log, letter: -1, rail: -1, bal: [50000, 30000], air: false, tok: null, temp: [false, false], done: false, fail: false, cap: '' };
        for (var k in o) s[k] = o[k];
        return s;
    }

    var ACID_STEPS = [
        st('트랜잭션은 여러 SQL 문을 하나의 작업 단위로 묶습니다. 이 단위가 지켜야 할 네 가지 성질을 ACID라고 부릅니다.', { cap: 'BEGIN … COMMIT 사이의 SQL 묶음' }),
        st('원자성(Atomicity): 트랜잭션 안의 모든 문장은 전부 성공하거나 전부 실패합니다. 하나라도 실패하면 이미 실행된 것도 전부 되돌립니다(ROLLBACK).', { letter: 0, cap: '전부 성공 또는 전부 취소' }),
        st('일관성(Consistency): 트랜잭션 전후로 데이터는 항상 규칙을 만족하는 상태여야 합니다. 예를 들어 두 계좌의 잔액 합은 송금 전후로 같아야 합니다.', { letter: 1, cap: '합계는 송금 전후로 같음' }),
        st('고립성(Isolation): 여러 트랜잭션이 동시에 실행되어도, 다른 트랜잭션의 커밋되지 않은 중간 상태는 보이지 않습니다.', { letter: 2, cap: '커밋 전 값은 다른 트랜잭션에 안 보임' }),
        st('지속성(Durability): COMMIT이 완료되면, 이후 시스템이 다운되더라도 그 결과는 디스크에 남아 사라지지 않습니다.', { letter: 3, cap: '커밋된 값은 정전 후에도 남음' }),
        st('정리: A·C·I·D 네 글자를 합쳐 ACID라고 부릅니다. 다음 탭에서 실제 계좌 이체로 커밋과 롤백을 확인해 보세요.', { letter: 4, cap: 'A · C · I · D' })
    ];

    var COMMIT_STEPS = [
        st('김민준이 이서연에게 20,000원을 송금하는 트랜잭션을 실행합니다.', { cap: '50,000 · 30,000 → ?' }),
        st('BEGIN: 트랜잭션을 시작합니다. 이 시점부터 COMMIT 전까지의 변경은 임시 상태입니다.', { rail: 0, cap: '여기서부터는 임시 상태' }),
        st('UPDATE: 김민준 잔액 50,000 → 30,000 (임시 반영). 빠진 20,000원은 아직 누구의 잔액도 아닙니다.', { rail: 1, bal: [30000, 30000], air: true, tok: ['A', 'air'], temp: [true, false], cap: '20,000원이 공중에 떠 있음' }),
        st('UPDATE: 이서연 잔액 30,000 → 50,000 (임시 반영). 두 번째 문장도 성공했습니다.', { rail: 2, bal: [30000, 50000], tok: ['air', 'B'], temp: [true, true], cap: '두 문장 모두 성공' }),
        st('COMMIT: 두 변경이 모두 성공했으므로 확정합니다. 이제 되돌릴 수 없습니다.', { rail: 3, bal: [30000, 50000], temp: [false, false], done: true, cap: '확정' }),
        st('정리: 커밋 이후 잔액은 영구적으로 저장됩니다(지속성). 합계는 송금 전과 같습니다(일관성).', { rail: 3, bal: [30000, 50000], done: true, cap: '합계 80,000원 유지' })
    ];

    var ROLLBACK_STEPS = [
        st('이번에는 두 번째 갱신에서 문제가 생기는 경우를 봅니다.', { cap: '50,000 · 30,000 → ?' }),
        st('BEGIN: 트랜잭션을 시작합니다.', { rail: 0, cap: '임시 상태 시작' }),
        st('UPDATE: 김민준 잔액 50,000 → 30,000 (임시 반영).', { rail: 1, bal: [30000, 30000], air: true, tok: ['A', 'air'], temp: [true, false], cap: '20,000원이 공중에 떠 있음' }),
        st('UPDATE 실패: 이서연의 계좌가 정지 상태라 입금할 수 없습니다.', { rail: 2, bal: [30000, 30000], air: true, temp: [true, false], fail: true, cap: '입금 실패 — 돈이 갈 곳이 없음' }),
        st('ROLLBACK: 이미 실행됐던 김민준의 변경도 전부 되돌립니다.', { rail: 3, bal: [50000, 30000], tok: ['air', 'A'], fail: true, cap: '공중의 20,000원이 돌아옴' }),
        st('정리: 두 번째 문장이 실패했으므로 첫 번째 문장까지 전부 취소됩니다(원자성). 잔액은 시작 전과 같습니다.', { rail: 3, bal: [50000, 30000], fail: true, cap: '원래 상태로 복구' })
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'commit') return COMMIT_STEPS;
        if (mode === 'rollback') return ROLLBACK_STEPS;
        return ACID_STEPS;
    }
    function defaultLog() {
        if (mode === 'commit') return '송금 트랜잭션이 커밋으로 끝나는 과정을 봅니다.';
        if (mode === 'rollback') return '송금 도중 실패해서 롤백되는 과정을 봅니다.';
        return '트랜잭션이 지켜야 할 네 가지 성질 ACID를 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        return { fs: mob ? 11 : 12, total: mode === 'acid' ? 276 : 282 };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function fmt(n) { return Math.round(n).toLocaleString('ko-KR'); }
    function caption(s, cx, w, y, fs) {
        if (!s.cap) return;
        lines(s.cap, w - 20, fs).forEach(function (l, i) {
            tx(l, cx, y + i * (fs + 5), fs, P.yellow + 'ff', 'center', true);
        });
    }
    function acct(x, y, w, h, name, bal, col, temp, fs, committed, failed) {
        var c = failed ? P.red : (committed ? P.green : (temp ? P.yellow : col));
        ctx.setLineDash(temp && !committed ? [5, 3] : []);
        rr(x, y, w, h, 10, c + '1a', c + 'ff', 2);
        ctx.setLineDash([]);
        tx(name, x + w / 2, y + 18, fs, c + 'ff', 'center', true);
        tx(fmt(bal) + '원', x + w / 2, y + h - 22, fs + 3, P.text + 'ff', 'center', true);
        tx(committed ? '확정' : (temp ? '임시' : ''), x + w / 2, y + h - 6, fs - 1, c + 'ff', 'center', false);
    }

    /* ===================== ACID 장면 ===================== */
    function drawAcid(x0, top, w, mob, s, e, fs) {
        var cx = x0 + w / 2;
        var pw = (w - 18) / 4;
        for (var i = 0; i < 4; i++) {
            var act = s.letter === i || s.letter === 4;
            var col = act ? P.orange : P.purple;
            var px = x0 + i * (pw + 6);
            rr(px, top + 4, pw, 34, 8, col + (act ? '30' : '12'), col + (act ? 'ff' : '88'), act ? 2.4 : 1.4);
            tx(mob ? LETTERS[i].l : LETTERS[i].l + ' ' + LETTERS[i].name, px + pw / 2, top + 21, fs + (mob ? 3 : 0), col + 'ff', 'center', true);
        }
        var ay = top + 56, ah = 150;
        var lt = s.letter;
        if (lt === -1 || lt === 4) {
            var bw2 = Math.min(w - 20, 340);
            rr(cx - bw2 / 2, ay + 4, bw2, 128, 12, P.purple + '12', P.purple + 'aa', 1.8);
            tx(lt === 4 ? 'ACID' : 'TRANSACTION', cx, ay + 18, fs, P.purple + 'ff', 'center', true);
            ['BEGIN', 'UPDATE 김민준 −20,000', 'UPDATE 이서연 +20,000', 'COMMIT'].forEach(function (t, k) {
                var a = lt === 4 ? 1 : clamp01(e * 3 - k * 0.5);
                ctx.globalAlpha = a;
                tx(t, cx, ay + 42 + k * 24, fs, (k === 0 || k === 3 ? P.sub : P.text) + 'ff', 'center', true);
                ctx.globalAlpha = 1;
            });
        } else if (lt === 0) {
            var cw = Math.min(150, (w - 30) / 2);
            var c1x = cx - cw - 8, c2x = cx + 8, cyy = ay + 34;
            var p1 = clamp01(e * 3), fail = clamp01((e - 0.35) * 4), undo = clamp01((e - 0.65) * 3);
            var col1 = undo > 0.5 ? P.muted : P.green, col2 = P.red;
            rr(cx - cw - 20, ay + 4, cw * 2 + 40, 108, 12, 'none', P.muted + '77', 1.4);
            tx('TRANSACTION', cx, ay + 16, fs - 1, P.sub + 'ff', 'center', false);
            rr(c1x, cyy, cw, 40, 8, col1 + '22', col1 + 'ff', 1.8);
            tx('① 김민준 −20,000', c1x + cw / 2, cyy + 20, fs - 0.5, col1 + 'ff', 'center', true);
            ctx.globalAlpha = p1;
            rr(c2x, cyy, cw, 40, 8, (fail > 0.3 ? col2 : P.yellow) + '22', (fail > 0.3 ? col2 : P.yellow) + 'ff', 1.8);
            tx(fail > 0.3 ? '② 이서연 +20,000 ✕' : '② 이서연 +20,000', c2x + cw / 2, cyy + 20, fs - 0.5, (fail > 0.3 ? col2 : P.yellow) + 'ff', 'center', true);
            ctx.globalAlpha = 1;
            if (undo > 0) {
                ctx.globalAlpha = undo;
                tx('↶ ROLLBACK: ①도 취소', cx, ay + 92, fs, P.red + 'ff', 'center', true);
                ctx.globalAlpha = 1;
            }
        } else if (lt === 1) {
            var cw2 = Math.min(140, (w - 40) / 2);
            var a1 = lerp(50000, 30000, e), a2 = lerp(30000, 50000, e);
            acct(cx - cw2 - 14, ay + 34, cw2, 74, '김민준', a1, P.orange, false, fs, false, false);
            acct(cx + 14, ay + 34, cw2, 74, '이서연', a2, P.teal, false, fs, false, false);
            arrow(cx - 8, ay + 70, cx + 8, ay + 70, P.sub + 'ff', 2);
            var sum = a1 + a2;
            rr(cx - 90, ay, 180, 26, 13, P.green + '22', P.green + 'ff', 1.6);
            tx('합계 ' + fmt(sum) + '원 ✓', cx, ay + 13, fs, P.green + 'ff', 'center', true);
        } else if (lt === 2) {
            var lw = Math.min(w - 20, 360);
            var lx = cx - lw / 2;
            tx('Txn A (쓰는 중)', lx + 10, ay + 10, fs, P.orange + 'ff', 'left', true);
            rr(lx, ay + 22, lw * 0.46, 40, 8, P.yellow + '1a', P.yellow + 'ff', 1.8);
            tx('잔액 → 30,000 (미커밋)', lx + lw * 0.23, ay + 42, fs - 0.5, P.yellow + 'ff', 'center', true);
            tx('Txn B (읽는 중)', lx + 10, ay + 84, fs, P.purple + 'ff', 'left', true);
            var rd = clamp01(e * 2);
            rr(lx + lw * 0.54, ay + 70, lw * 0.46, 40, 8, P.purple + '1a', P.purple + 'ff', 1.8);
            tx(rd > 0.6 ? '읽은 값: 50,000' : 'SELECT 잔액 …', lx + lw * 0.77, ay + 90, fs - 0.5, P.purple + 'ff', 'center', true);
            ln(lx + lw * 0.5, ay + 18, lx + lw * 0.5, ay + 120, P.red + 'cc', 2.4, [6, 4]);
            tx('커밋 전 값은 안 보임', lx + lw * 0.5, ay + 134, fs - 1, P.red + 'ff', 'center', true);
        } else if (lt === 3) {
            var bw3 = Math.min(130, (w - 60) / 2);
            var rx = cx - bw3 - 36, dx = cx + 36;
            var wr = clamp01(e * 2.2), boom = clamp01((e - 0.55) * 3);
            rr(rx, ay + 18, bw3, 64, 10, (boom > 0.4 ? P.red : P.orange) + '1a', (boom > 0.4 ? P.red : P.orange) + 'ff', 2);
            tx('메모리', rx + bw3 / 2, ay + 36, fs, P.sub + 'ff', 'center', true);
            tx(boom > 0.4 ? '사라짐' : '잔액 30,000', rx + bw3 / 2, ay + 62, fs, (boom > 0.4 ? P.red : P.text) + 'ff', 'center', true);
            rr(dx, ay + 18, bw3, 64, 10, P.green + '1a', P.green + 'ff', 2);
            tx('디스크', dx + bw3 / 2, ay + 36, fs, P.sub + 'ff', 'center', true);
            if (wr > 0.5) tx('30,000 ✓', dx + bw3 / 2, ay + 62, fs, P.green + 'ff', 'center', true);
            var ax1 = rx + bw3 + 4, ax2 = dx - 4;
            if (wr < 1) circ(lerp(ax1, ax2, wr), ay + 50, 6, P.yellow + 'ff', 'none');
            ln(ax1, ay + 50, ax2, ay + 50, P.muted + '88', 1.4, [4, 3]);
            tx('COMMIT', cx, ay + 36, fs - 1, P.yellow + 'ff', 'center', true);
            if (boom > 0) {
                tx('⚡ 정전', rx + bw3 / 2, ay + 100, fs + 1, P.red + 'ff', 'center', true);
                tx('디스크는 그대로', dx + bw3 / 2, ay + 100, fs, P.green + 'ff', 'center', true);
            }
        }
        caption(s, cx, w, top + 232, fs);
    }

    /* ===================== 송금 장면(커밋/롤백) ===================== */
    function drawTransfer(x0, top, w, mob, s, prev, e, fs) {
        var cx = x0 + w / 2;
        var pr = prev || st('', {});
        var nodes = mode === 'commit' ? ['BEGIN', 'UPDATE ①', 'UPDATE ②', 'COMMIT'] : ['BEGIN', 'UPDATE ①', 'UPDATE ②', 'ROLLBACK'];
        var nw = (w - 18) / 4;
        nodes.forEach(function (n, i) {
            var on = s.rail >= i;
            var col = i === 3 ? (mode === 'rollback' ? P.red : P.green) : (i === 2 && s.fail ? P.red : P.purple);
            var cur = s.rail === i;
            var px = x0 + i * (nw + 6);
            rr(px, top + 6, nw, 30, 8, col + (on ? (cur ? '40' : '22') : '0c'), col + (on ? 'ff' : '66'), cur ? 2.4 : 1.4);
            tx(n, px + nw / 2, top + 21, fs - (mob ? 1.5 : 0.5), col + (on ? 'ff' : '99'), 'center', true);
        });
        var cw = Math.min(150, (w - 90) / 2);
        var ya = top + 78, ch = 86;
        var xa = x0 + 6, xb = x0 + w - cw - 6;
        var balA = lerp(pr.bal[0], s.bal[0], e), balB = lerp(pr.bal[1], s.bal[1], e);
        acct(xa, ya, cw, ch, '김민준', balA, P.orange, s.temp[0], fs, s.done, false);
        acct(xb, ya, cw, ch, '이서연', balB, P.teal, s.temp[1], fs, s.done, s.fail && s.rail === 2);
        if (s.fail && s.rail === 2) tx('✕ 정지 계좌', xb + cw / 2, ya - 10, fs, P.red + 'ff', 'center', true);
        var posOf = { A: [xa + cw / 2, ya], air: [cx, top + 58], B: [xb + cw / 2, ya] };
        var ax = cx, ay = top + 58;
        if (s.tok) {
            var f = posOf[s.tok[0]], t = posOf[s.tok[1]];
            var px = lerp(f[0], t[0], e), py = lerp(f[1], t[1], e) - Math.sin(e * Math.PI) * 14;
            rr(px - 36, py - 12, 72, 24, 12, P.yellow + '33', P.yellow + 'ff', 2);
            tx('20,000', px, py, fs, P.yellow + 'ff', 'center', true);
        } else if (s.air) {
            rr(ax - 36, ay - 12, 72, 24, 12, P.yellow + '33', P.yellow + 'ff', 2);
            tx('20,000', ax, ay, fs, P.yellow + 'ff', 'center', true);
        }
        var sum;
        if (s.tok && s.tok[1] === 'air') sum = balA + balB + 20000 * e;
        else if (s.tok && s.tok[0] === 'air') sum = balA + balB + 20000 * (1 - e);
        else if (s.air) sum = balA + balB + 20000;
        else sum = balA + balB;
        rr(cx - 100, ya + ch + 22, 200, 26, 13, P.green + '22', P.green + 'ff', 1.6);
        tx('합계 ' + fmt(sum) + '원', cx, ya + ch + 35, fs, P.green + 'ff', 'center', true);
        caption(s, cx, w, ya + ch + 72, fs);
    }

    /* ===================== 장면 그리기 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var fs = mob ? 11 : 12;
        var e = clamp01(t);
        var s = step || st('', {});
        if (mode === 'acid') drawAcid(x0, top, w, mob, s, e, fs);
        else drawTransfer(x0, top, w, mob, s, prev, e, fs);
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
        speedBtns.forEach(function (b) { b.classList.remove('transaction-viz__speed-btn--active'); });
        btn.classList.add('transaction-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('transaction-viz__mode-btn--active', d.key === m); });
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