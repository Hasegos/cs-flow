/**
 * 비순차 실행 시각화 시각화
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
    var root    = el('div', 'ooo-viz');
    var toolbar = el('div', 'ooo-viz__toolbar');
    var tbLeft  = el('div', 'ooo-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'ooo-viz__title', 'OUT-OF-ORDER ENGINE'));

    var modeWrap = el('div', 'ooo-viz__mode');
    var modeDefs = [
        { key: 'seq', label: '순차 vs 비순차' },
        { key: 'issue', label: '의존성과 발행' },
        { key: 'rob', label: '리오더 버퍼' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'ooo-viz__mode-btn' + (i === 0 ? ' ooo-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'ooo-viz__speed');
    speedWrap.appendChild(el('span', 'ooo-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'ooo-viz__speed-btn' + (i === 0 ? ' ooo-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'ooo-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'ooo-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'ooo-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'ooo-viz__controls');
    var btnPlay  = el('button', 'ooo-viz__btn ooo-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'ooo-viz__btn', '▶| STEP');
    var btnReset = el('button', 'ooo-viz__btn', '↺ RESET');
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
    var mode    = 'seq';
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

    /* ===================== 데이터: 명령어 ===================== */
    var INSTR = [
        { id: 'I1', op: 'LOAD', asm: 'LOAD r1,[a]',    dst: 'r1', src: [],             lat: 6 },
        { id: 'I2', op: 'ADD',  asm: 'ADD r2,r1,r3',   dst: 'r2', src: ['r1', 'r3'],   lat: 1 },
        { id: 'I3', op: 'MUL',  asm: 'MUL r4,r5,r6',   dst: 'r4', src: ['r5', 'r6'],   lat: 3 },
        { id: 'I4', op: 'SUB',  asm: 'SUB r7,r4,r8',   dst: 'r7', src: ['r4', 'r8'],   lat: 1 },
        { id: 'I5', op: 'ADD',  asm: 'ADD r9,r10,r11', dst: 'r9', src: ['r10', 'r11'], lat: 1 }
    ];
    var N = INSTR.length;

    INSTR.forEach(function (it, i) {
        it.arrive = i + 1;
        it.prod = it.src.map(function (r) {
            for (var j = i - 1; j >= 0; j--) if (INSTR[j].dst === r) return j;
            return -1;
        });
        it.deps = it.prod.filter(function (p) { return p >= 0; });
    });

    function schedule(ooo) {
        var start = [], end = [], done = 0, c = 1;
        while (done < N) {
            for (var i = 0; i < N; i++) {
                if (start[i]) continue;
                var ok = INSTR[i].arrive <= c && INSTR[i].deps.every(function (p) { return end[p] < c; });
                if (!ooo && !ok) break;
                if (ok) { start[i] = c; end[i] = c + INSTR[i].lat - 1; done++; break; }
            }
            c++;
        }
        return { start: start, end: end, total: Math.max.apply(null, end) };
    }
    var IO  = schedule(false);
    var OOO = schedule(true);

    var COMMIT_WIDTH = 2;
    var commit = [];
    (function () {
        var head = 0, c = 1;
        while (head < N) {
            var k = 0;
            while (head < N && k < COMMIT_WIDTH && OOO.end[head] < c) { commit[head] = c; head++; k++; }
            c++;
        }
    })();

    function stateAt(i, c, withCommit) {
        if (INSTR[i].arrive > c) return 'none';
        if (withCommit && commit[i] <= c) return 'commit';
        if (OOO.end[i] <= c) return 'done';
        if (OOO.start[i] <= c) return 'exec';
        return INSTR[i].deps.every(function (p) { return OOO.end[p] <= c; }) ? 'ready' : 'wait';
    }
    function operandReady(i, k, c) {
        var p = INSTR[i].prod[k];
        return p < 0 || OOO.end[p] <= c;
    }

    window.CsFlow.oooData = { instr: INSTR, io: IO, ooo: OOO, commit: commit, commitWidth: COMMIT_WIDTH };

    /* ===================== 데이터: 스텝 ===================== */
    var COLS = IO.total;

    var SEQ_STEPS = [
        { io: 6, oo: 0, log: '순차 실행 — I1 LOAD가 캐시 미스로 6사이클 걸립니다. 뒤의 명령어는 이미 도착해 있어도 I1 뒤에서 차례를 기다립니다.' },
        { io: COLS, oo: 0, log: '순차 실행은 I2가 I1을 기다리는 동안 r1과 상관없는 I3~I5도 함께 멈춥니다. 명령어 5개를 끝내는 데 ' + IO.total + '사이클이 걸립니다.' },
        { io: COLS, oo: 3, log: '비순차 실행 — I2는 r1이 없어 대기하지만, r1과 무관한 I3 MUL은 사이클 3에 먼저 실행을 시작합니다.' },
        { io: COLS, oo: 6, log: 'I5는 도착하자마자 실행하고, I4는 I3의 결과(r4)가 나온 다음인 사이클 6에 실행합니다. 모두 I1이 메모리를 기다리는 동안 처리됩니다.' },
        { io: COLS, oo: COLS, log: 'I1이 끝나자 I2가 사이클 7에 실행되고 모든 실행이 끝납니다. ' + IO.total + '사이클 → ' + OOO.total + '사이클입니다.' },
        { io: COLS, oo: COLS, log: '정리 — I1에 진짜로 의존하는 I2는 비순차 실행으로도 앞당길 수 없습니다. 비순차 실행은 기다리는 시간을 다른 독립 명령어로 채우는 방식입니다.' }
    ];

    var ISSUE_STEPS = [
        { c: 1, log: '사이클 1 — I1 LOAD 발행. 데이터가 캐시에 없어 6사이클 동안 메모리를 기다립니다.' },
        { c: 2, log: '사이클 2 — I2 ADD 도착. r1은 I1이 만들어야 하므로 예약 스테이션에서 대기합니다. 이번 사이클에 발행할 명령어가 없습니다.' },
        { c: 3, log: '사이클 3 — I3 MUL 도착. 피연산자 r5, r6이 이미 준비돼 있어 I2보다 먼저 발행됩니다(3사이클 연산).' },
        { c: 4, log: '사이클 4 — I4 SUB 도착. r4는 I3이 아직 계산 중이라 대기합니다. I2도 여전히 r1을 기다립니다.' },
        { c: 5, log: '사이클 5 — I5 ADD는 도착과 동시에 발행됩니다. 이 사이클에 I3도 끝나 r4가 준비됩니다.' },
        { c: 6, log: '사이클 6 — r4가 준비된 I4 발행. I1의 로드도 이 사이클에 끝나 r1이 준비됩니다.' },
        { c: 7, log: '사이클 7 — 마지막으로 I2 발행. 발행 순서는 I1 → I3 → I5 → I4 → I2로 프로그램 순서와 다릅니다.' },
        { c: 7, log: '정리 — 예약 스테이션은 명령어마다 필요한 값이 준비됐는지 추적하고, 준비되는 순간 실행 유닛으로 보냅니다. 기다리는 명령어가 있어도 다른 명령어의 실행을 막지 않습니다.' }
    ];

    var ROB_STEPS = [
        { c: 1, log: '사이클 1 — 명령어는 들어오는 순서대로 ROB에 한 칸씩 자리를 잡습니다. 가장 오래된 I1이 맨 앞(head)입니다.' },
        { c: 3, log: '사이클 3 — I2는 대기, I3은 실행 중입니다. 실행 순서는 달라도 ROB 안의 순서는 프로그램 순서 그대로입니다.' },
        { c: 5, log: '사이클 5 — I3, I5가 먼저 완료됐습니다. 하지만 head인 I1이 끝나지 않아 결과는 ROB에만 있고 레지스터에는 반영되지 않습니다.' },
        { c: 6, log: '사이클 6 — I1과 I4도 완료. head인 I1이 끝났으므로 다음 사이클부터 확정할 수 있습니다.' },
        { c: 7, log: '사이클 7 — I1 확정(commit). r1에 결과가 반영됩니다. 다음 칸 I2는 이번 사이클에 실행이 끝나 아직 확정 전입니다.' },
        { c: 8, log: '사이클 8 — I2, I3 확정. 이 시각화는 한 사이클에 최대 ' + COMMIT_WIDTH + '개까지 확정합니다.' },
        { c: 9, log: '사이클 9 — I4, I5 확정. 실행은 I1 → I3 → I5 → I4 → I2 순이었지만 확정은 I1부터 I5까지 프로그램 순서 그대로입니다.' },
        { c: 8, exc: true, log: '만약 사이클 8에 I2를 확정하려는 순간 예외(예: MIPS의 add처럼 오버플로 시 트랩을 거는 명령어)가 확인되면 — I3~I5는 실행이 끝났어도 확정 전이므로 버리면 됩니다. 레지스터에는 I1까지만 반영돼 있어 예외 지점이 정확합니다(정밀 예외).' },
        { c: 9, log: '정리 — ROB 덕분에 실행은 자유롭게 앞당기면서도 결과가 보이는 순서는 지킵니다. 분기 예측이 틀렸을 때 잘못 실행한 명령어를 버리는 것도 같은 원리입니다.' }
    ];

    /* ===================== 상태 ===================== */
    var OO_ST_LBL = { none: '도착 전', wait: '대기', ready: '준비', exec: '실행', done: '완료', commit: '확정' };
    var ooPos = [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]];

    function currentSteps() {
        if (mode === 'issue') return ISSUE_STEPS;
        if (mode === 'rob') return ROB_STEPS;
        return SEQ_STEPS;
    }
    function defaultLog() {
        if (mode === 'issue') return '예약 스테이션에서 명령어마다 피연산자가 준비됐는지 확인하고, 준비된 명령어부터 실행 유닛으로 보냅니다.';
        if (mode === 'rob') return '실행이 끝난 순서와 상관없이, 리오더 버퍼(ROB)의 맨 앞부터 순서대로 결과를 확정합니다.';
        return '같은 명령어 5개를 순차 실행과 비순차 실행으로 처리할 때 걸리는 사이클을 비교합니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }
    function ooStCol(st) {
        if (st === 'wait') return P.orange;
        if (st === 'ready') return P.purple;
        if (st === 'exec') return P.teal;
        if (st === 'done') return P.yellow;
        if (st === 'commit') return P.green;
        return P.sub;
    }
    function ooInstrCol(i) {
        if (INSTR[i].op === 'LOAD') return P.orange;
        return INSTR[i].deps.length ? P.purple : P.teal;
    }
    function ooSeqLayout(w, mob) {
        var cellH = mob ? 20 : 24;
        var pitch = cellH + 4;
        var labW = mob ? 62 : 150;
        var tlH = 20 + N * pitch;
        var y1 = 22;
        var y2 = y1 + tlH + 12;
        var ly = y2 + tlH + 16;
        return {
            fs: mob ? 11 : 12.5, cellH: cellH, pitch: pitch, labW: labW,
            cw: Math.min(56, (w - labW) / COLS),
            y1: y1, y2: y2, ly: ly, total: ly + (mob ? 36 : 18)
        };
    }
    function ooIssueLayout(w, mob) {
        var nodeW = mob ? 92 : 170;
        var nodeH = mob ? 42 : 48;
        var pitch = mob ? 52 : 58;
        var rowY0 = mob ? 30 : 32;
        var stripLbl = rowY0 + 2 * pitch + nodeH + 16;
        var slotY = stripLbl + 12;
        var slotH = mob ? 26 : 30;
        return {
            fs: mob ? 11 : 13, nodeW: nodeW, nodeH: nodeH, pitch: pitch, rowY0: rowY0,
            stripLbl: stripLbl, slotY: slotY, slotH: slotH, slotGap: 6,
            total: slotY + slotH + 10
        };
    }
    function ooRobLayout(w, mob) {
        var gap = mob ? 6 : 12;
        var sy = mob ? 34 : 46;
        var slotH = mob ? 74 : 80;
        var ry = sy + slotH + (mob ? 30 : 36);
        var regY = sy + slotH + (mob ? 30 : 36);
        var regH = mob ? 40 : 46;
        return {
            fs: mob ? 10.5 : 12, gap: gap, sy: sy, slotH: slotH, regY: regY, regH: regH,
            slotW: Math.min(150, (w - gap * (N - 1)) / N),
            total: regY + regH + 26
        };
    }
    function layout(w, mob) {
        if (mode === 'issue') return ooIssueLayout(w, mob);
        if (mode === 'rob') return ooRobLayout(w, mob);
        return ooSeqLayout(w, mob);
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 순차 vs 비순차 ===================== */
    function ooSeqTL(x0, w, y, title, sched, rev, barX, L, mob, isOoo) {
        var fs = L.fs;
        var on = rev > 0.001;
        tx(title, x0, y + 6, fs, on ? P.text + 'ee' : P.sub + 'ff', 'left', true);
        if (rev >= sched.total - 0.001) tx(sched.total + '사이클', x0 + w, y + 6, fs, (isOoo ? P.teal : P.orange) + 'ee', 'right', true);
        var yy = y + 20;
        INSTR.forEach(function (it, i) {
            var ry = yy + i * L.pitch;
            tx(mob ? it.id + ' ' + it.op : it.id + ' ' + it.asm, x0, ry + L.cellH / 2, mob ? 10 : 11.5, (on ? ooInstrCol(i) : P.sub) + 'ff', 'left', true);
            for (var c = it.arrive; c <= sched.end[i]; c++) {
                var f = clamp01(rev - (c - 1));
                if (f <= 0) continue;
                var cx = barX + (c - 1) * L.cw + 1;
                var cwid = (L.cw - 2) * f;
                var waiting = c < sched.start[i];
                if (waiting) {
                    rr(cx, ry + 3, cwid, L.cellH - 6, 3, P.sub + '1a', P.sub + '66', 1);
                } else {
                    var col = ooInstrCol(i);
                    rr(cx, ry, cwid, L.cellH, 3, col + '30', col + 'aa', 1.4);
                }
                if (f >= 1 && L.cw >= 30) tx(waiting ? '대기' : (it.op === 'LOAD' ? 'MEM' : 'EX'), cx + cwid / 2, ry + L.cellH / 2, mob ? 9.5 : 11, (waiting ? P.sub : ooInstrCol(i)) + 'cc', 'center', !waiting);
            }
        });
        if (rev > 0.001 && rev < COLS - 0.001) {
            var px = barX + rev * L.cw;
            ln(px, y + 16, px, yy + N * L.pitch, P.yellow + 'cc', 1.6, [3, 3]);
        }
    }
    function ooSeqLegend(x0, w, y, mob) {
        var items = [
            [P.sub, mob ? '대기' : '대기 (피연산자·차례 기다림)'],
            [P.orange, mob ? 'LOAD 미스' : 'LOAD (캐시 미스)'],
            [P.purple, mob ? '의존' : '앞 결과에 의존'],
            [P.teal, mob ? '독립' : '독립 명령어']
        ];
        var dx = [0, 210, 400, 530];
        items.forEach(function (it, k) {
            var lx = mob ? x0 + (k % 2) * (w / 2) : x0 + dx[k];
            var ly = mob ? y + Math.floor(k / 2) * 18 : y;
            rr(lx, ly - 6, 12, 12, 3, it[0] + '30', it[0] + 'aa', 1.2);
            tx(it[1], lx + 17, ly, mob ? 9.5 : 11, P.sub + 'dd', 'left', false);
        });
    }
    function ooSeqDraw(x0, top, w, mob, s, p, e) {
        var L = ooSeqLayout(w, mob);
        var m = ez(e);
        var barX = x0 + L.labW;
        var fs = mob ? 9.5 : 11;
        var c;
        tx('사이클', x0, top + 6, fs, P.sub + 'ff', 'left', false);
        for (c = 1; c <= COLS; c++) tx(String(c), barX + (c - 0.5) * L.cw, top + 6, fs, P.sub + 'ff', 'center', false);
        ooSeqTL(x0, w, top + L.y1, mob ? '순차 실행' : '순차 실행 (in-order)', IO, lerp(p.io, s.io, m), barX, L, mob, false);
        ooSeqTL(x0, w, top + L.y2, mob ? '비순차 실행' : '비순차 실행 (out-of-order)', OOO, lerp(p.oo, s.oo, m), barX, L, mob, true);
        ooSeqLegend(x0, w, top + L.ly, mob);
    }

    /* ===================== 의존성과 발행 ===================== */
    function ooIssueDraw(x0, top, w, mob, s, p, fresh, e) {
        var L = ooIssueLayout(w, mob);
        var c = s.c, pc = p.c, fs = L.fs;
        var newIssue = fresh && pc < c;
        var issued = -1;
        var k, i;
        for (k = 0; k < N; k++) if (OOO.start[k] === c) issued = k;
        var order = [];
        for (k = 0; k < N; k++) order.push(k);
        order.sort(function (a, b) { return OOO.start[a] - OOO.start[b]; });

        tx('사이클 ' + c + (mob ? '' : ' 종료 시점'), x0, top + 6, fs + 0.5, P.text + 'ee', 'left', true);
        tx(issued >= 0 ? (mob ? '발행 ' + INSTR[issued].id : '이번 사이클 발행: ' + INSTR[issued].id) : (mob ? '발행 없음' : '이번 사이클 발행 없음'),
            x0 + w, top + 6, fs, (issued >= 0 ? P.purple : P.sub) + 'ee', 'right', true);

        var pos = function (j) {
            var g = ooPos[j];
            return { x: x0 + g[0] * (w - L.nodeW), y: top + L.rowY0 + g[1] * L.pitch };
        };

        INSTR.forEach(function (it, j) {
            if (it.arrive > c) return;
            it.prod.forEach(function (pr, kk) {
                if (pr < 0) return;
                var a = pos(pr), b = pos(j);
                var ay = a.y + L.nodeH / 2;
                var x1 = a.x + L.nodeW + 3, x2 = b.x - 3;
                var ready = operandReady(j, kk, c);
                var col = ready ? P.green : P.orange;
                arrow(x1, ay, x2, ay, col + 'ff', 1.6);
                tx(it.src[kk], (x1 + x2) / 2, ay - 9, fs - 1, col + 'ff', 'center', true);
                if (newIssue && OOO.end[pr] === c && e < 1) circ(lerp(x1, x2, e), ay, 4.5, P.green + 'ff');
            });
        });

        INSTR.forEach(function (it, j) {
            var n = pos(j);
            var st = stateAt(j, c, false);
            var isNone = st === 'none';
            var col = ooStCol(st);
            var isIss = j === issued;
            var fadeIn = fresh && pc < c && it.arrive === c;
            ctx.globalAlpha = fadeIn ? 0.3 + 0.7 * ez(e) : 1;
            if (isNone) ctx.setLineDash([4, 4]);
            rr(n.x, n.y, L.nodeW, L.nodeH, 7, isNone ? 'none' : col + '1f', isIss ? P.purple + 'ff' : (isNone ? P.sub + '66' : col + 'aa'), isIss ? 2.4 : 1.4);
            ctx.setLineDash([]);
            tx(mob ? it.id + ' ' + it.op : it.id + '  ' + it.asm, n.x + 9, n.y + L.nodeH * 0.32, fs, (isNone ? P.sub : P.text) + 'ff', 'left', true);
            var sub = st === 'exec' ? '실행 ' + (c - OOO.start[j] + 1) + '/' + it.lat : OO_ST_LBL[st];
            tx(sub, n.x + 9, n.y + L.nodeH * 0.74, fs - 1, col + 'ff', 'left', true);
            if (st === 'exec') {
                var frac = Math.min(1, (c - OOO.start[j] + 1) / it.lat);
                rr(n.x + 9, n.y + L.nodeH - 5, L.nodeW - 18, 3, 1.5, P.sub + '33', 'none');
                rr(n.x + 9, n.y + L.nodeH - 5, (L.nodeW - 18) * frac, 3, 1.5, P.teal + 'cc', 'none');
            }
            if (newIssue && isIss && e < 1) {
                ctx.globalAlpha = 1 - e;
                rr(n.x - 3 - 4 * e, n.y - 3 - 4 * e, L.nodeW + 6 + 8 * e, L.nodeH + 6 + 8 * e, 9, 'none', P.purple + 'ff', 2);
            }
            ctx.globalAlpha = 1;
        });

        var sw = (w - L.slotGap * (N - 1)) / N;
        var sy = top + L.slotY;
        tx('발행 순서', x0, top + L.stripLbl, fs, P.text + 'cc', 'left', true);
        for (k = 0; k < N; k++) {
            var sx = x0 + k * (sw + L.slotGap);
            var j2 = order[k];
            var filled = OOO.start[j2] < c || (OOO.start[j2] === c && (!newIssue || e >= 1));
            rr(sx, sy, sw, L.slotH, 5, filled ? P.purple + '26' : 'none', (filled ? P.purple + 'aa' : P.sub + '55'), 1.2);
            if (filled) tx(INSTR[j2].id, sx + sw / 2, sy + L.slotH / 2, fs, P.purple + 'ff', 'center', true);
        }
        if (newIssue && issued >= 0 && e < 1) {
            var fk = order.indexOf(issued);
            var from = pos(issued);
            var m = ez(e);
            var fx = lerp(from.x + L.nodeW + 2, x0 + fk * (sw + L.slotGap) + sw / 2, m);
            var fy = lerp(from.y + L.nodeH / 2, sy + L.slotH / 2, m);
            rr(fx - 15, fy - 9, 30, 18, 5, P.purple + 'ff', P.purple + 'ff', 1.4);
            tx(INSTR[issued].id, fx, fy, fs - 1, '#111111', 'center', true);
        }
    }

    /* ===================== 리오더 버퍼 ===================== */
    function ooRobHead(stp) {
        var h;
        for (h = 0; h < N; h++) {
            if (stp.exc ? h === 1 : (stateAt(h, stp.c, true) !== 'commit' && INSTR[h].arrive <= stp.c)) return h;
        }
        return -1;
    }
    function ooRegOn(stp, i) {
        return stp.c && stateAt(i, stp.c, true) === 'commit' && !(stp.exc && i > 0);
    }
    function ooRobDraw(x0, top, w, mob, s, p, fresh, e) {
        var L = ooRobLayout(w, mob);
        var c = s.c, pc = p.c, fs = L.fs, exc = !!s.exc;
        var slotW = L.slotW, gap = L.gap;
        var sx0 = x0 + (w - (slotW * N + gap * (N - 1))) / 2;
        var sxOf = function (k) { return sx0 + k * (slotW + gap); };
        var sy = top + L.sy, regY = top + L.regY;
        var hs = ooRobHead(s), hp = ooRobHead(p);
        var i;

        tx(mob ? 'ROB (프로그램 순서)' : 'ROB — 들어온 순서대로 자리를 잡는 버퍼', x0, top + 6, fs + 0.5, P.text + 'ee', 'left', true);
        tx('사이클 ' + c, x0 + w, top + 6, fs, P.sub + 'ee', 'right', true);
        if (hs >= 0) {
            var hi = fresh && hp >= 0 ? lerp(hp, hs, ez(e)) : hs;
            tx('HEAD ▼', sxOf(hi) + slotW / 2, sy - 13, mob ? 10 : 11.5, P.purple + 'ee', 'center', true);
        } else {
            tx('모두 확정 ✓', x0 + w / 2, sy - 13, mob ? 10 : 11.5, P.green + 'ee', 'center', true);
        }

        for (i = 0; i < N; i++) {
            var it = INSTR[i];
            var st = stateAt(i, c, true);
            var fadeIn = fresh && pc < c && it.arrive === c;
            var x = sxOf(i);
            ctx.globalAlpha = fadeIn ? 0.3 + 0.7 * ez(e) : 1;
            if (st === 'none' && !exc) {
                ctx.setLineDash([4, 4]);
                rr(x, sy, slotW, L.slotH, 6, 'none', P.sub + '66', 1.2);
                ctx.setLineDash([]);
                tx('빈 칸', x + slotW / 2, sy + L.slotH / 2, fs - 1, P.sub + 'ff', 'center', false);
            } else {
                var disc = exc && i > 1;
                var label, col;
                if (exc && i === 1) { label = '예외'; col = P.red; }
                else if (disc) { label = '폐기'; col = P.red; }
                else { label = OO_ST_LBL[st]; col = ooStCol(st); }
                var tc = disc ? P.sub : P.text;
                rr(x, sy, slotW, L.slotH, 6, col + (disc ? '12' : '26'), col + (disc ? '66' : 'cc'), i === hs ? 2.6 : 1.4);
                tx(it.id, x + slotW / 2, sy + (mob ? 16 : 18), fs + 1.5, tc + 'ee', 'center', true);
                tx(it.op, x + slotW / 2, sy + (mob ? 32 : 37), fs - 1, tc + 'aa', 'center', false);
                tx(it.dst, x + slotW / 2, sy + (mob ? 45 : 52), fs - 1, tc + 'aa', 'center', false);
                tx(label, x + slotW / 2, sy + L.slotH - (mob ? 13 : 14), fs - 0.5, col + 'ee', 'center', true);
                if (disc) {
                    ctx.strokeStyle = P.red + '99';
                    ctx.lineWidth = 1.6;
                    ctx.beginPath();
                    ctx.moveTo(x + 6, sy + 6);
                    ctx.lineTo(x + slotW - 6, sy + L.slotH - 6);
                    ctx.stroke();
                }
            }
            ctx.globalAlpha = 1;
        }

        if (fresh && !exc && pc < c && e < 1) {
            for (i = 0; i < N; i++) {
                if (commit[i] !== c) continue;
                var fy = lerp(sy + L.slotH + 2, regY + L.regH / 2, ez(e));
                var fxc = sxOf(i) + slotW / 2;
                rr(fxc - 15, fy - 8, 30, 16, 4, P.green + 'ff', P.green + 'ff', 1.2);
                tx(INSTR[i].id, fxc, fy, fs - 1, '#111111', 'center', true);
            }
        }

        tx(mob ? '레지스터 (확정된 값만)' : '레지스터 — 프로그램이 보는 값 (확정된 결과만 반영)', x0, regY + L.regH + 14, fs, P.text + 'cc', 'left', true);
        for (i = 0; i < N; i++) {
            var rx = sxOf(i);
            var onS = ooRegOn(s, i), onP = ooRegOn(p, i);
            var ra = 0;
            if (onS) ra = fresh && !onP ? ez(seg(e, 0.8, 1)) : 1;
            else if (fresh && onP) ra = 1 - ez(e);
            rr(rx, regY, slotW, L.regH, 6, 'none', onS ? P.green + 'cc' : P.sub + '66', 1.2);
            if (ra > 0) {
                ctx.globalAlpha = ra;
                rr(rx, regY, slotW, L.regH, 6, P.green + '2a', 'none');
                ctx.globalAlpha = 1;
            }
            tx(INSTR[i].dst, rx + slotW / 2, regY + L.regH * 0.32, fs - 0.5, (onS ? P.text : P.sub) + 'ff', 'center', true);
            tx(onS ? (mob ? INSTR[i].id : INSTR[i].id + ' 결과') : (mob ? '이전' : '이전 값'), rx + slotW / 2, regY + L.regH * 0.7, fs - 1, (onS ? P.green : P.sub) + 'ff', 'center', onS);
        }
        ctx.globalAlpha = 1;
    }

    /* ===================== 메인 장면 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var s = step || currentSteps()[0];
        var p = prev || s;
        var fresh = s !== p;
        var e = fresh ? clamp01(t) : 1;
        if (mode === 'issue') ooIssueDraw(x0, top, w, mob, s, p, fresh, e);
        else if (mode === 'rob') ooRobDraw(x0, top, w, mob, s, p, fresh, e);
        else ooSeqDraw(x0, top, w, mob, s, p, e);
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
        speedBtns.forEach(function (b) { b.classList.remove('ooo-viz__speed-btn--active'); });
        btn.classList.add('ooo-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('ooo-viz__mode-btn--active', d.key === m); });
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

    window.CsFlow.mount3dButton({
        container: container,
        parent: toolbar,
        cls: 'ooo-viz__btn ooo-viz__btn--primary',
        label: '3D 출고 센터',
        onOpen: function () {
            vizReset();
            root.classList.add('ooo-viz--hidden');
        },
        onExit: function () {
            root.classList.remove('ooo-viz--hidden');
            resize();
        }
    });

    setTimeout(resize, 60);
})();