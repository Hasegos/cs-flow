/**
 * 비순차 실행 시각화
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
        { key: 'seq',   label: '순차 vs 비순차' },
        { key: 'issue', label: '의존성과 발행' },
        { key: 'rob',   label: '리오더 버퍼' }
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
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

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
    var mode    = 'seq';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'issue') return ISSUE_STEPS;
        if (mode === 'rob') return ROB_STEPS;
        return SEQ_STEPS;
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
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }
    function textW(str, sz, bold) {
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        return ctx.measureText(str).width;
    }
    function chip(str, x, y, h, sz, col, strong) {
        var w = textW(str, sz, true) + 12;
        rr(x, y, w, h, 4, col + (strong ? '33' : '1a'), col + (strong ? 'cc' : '66'), strong ? 1.6 : 1.1);
        tx(str, x + w / 2, y + h / 2, sz, col + 'ee', 'center', true);
        return w;
    }
    function instrColor(i) {
        if (INSTR[i].op === 'LOAD') return P.orange;
        return INSTR[i].deps.length ? P.purple : P.teal;
    }

    /* ===================== 모드: 순차 vs 비순차 ===================== */
    function drawTimeline(x0, w, y, title, sched, rev, barX, cellW, cellH, fs, mob) {
        var active = rev > 0;
        tx(title, x0, y + 6, fs, active ? P.text + 'ee' : P.muted + '88', 'left', true);
        if (rev >= sched.total) {
            tx(sched.total + '사이클', x0 + w, y + 6, fs, (sched === OOO ? P.teal : P.orange) + 'ee', 'right', true);
        }
        var yy = y + 20;
        var showText = cellW >= 30;
        INSTR.forEach(function (it, i) {
            var ry = yy + i * (cellH + 4);
            tx(mob ? it.id + ' ' + it.op : it.id + ' ' + it.asm, x0, ry + cellH / 2, mob ? 10 : 11.5,
                active ? instrColor(i) + 'ee' : P.muted + '77', 'left', true);
            if (!active) return;
            for (var c = it.arrive; c <= Math.min(sched.end[i], rev); c++) {
                var cx = barX + (c - 1) * cellW;
                if (c < sched.start[i]) {
                    rr(cx + 1, ry + 3, cellW - 2, cellH - 6, 3, P.muted + '1a', P.muted + '55', 1);
                    if (showText) tx('대기', cx + cellW / 2, ry + cellH / 2, mob ? 9 : 10, P.muted + 'cc', 'center', false);
                } else {
                    var col = instrColor(i);
                    rr(cx + 1, ry, cellW - 2, cellH, 3, col + '30', col + 'aa', 1.4);
                    if (showText) tx(it.op === 'LOAD' ? 'MEM' : 'EX', cx + cellW / 2, ry + cellH / 2, mob ? 9.5 : 11, col + 'ee', 'center', true);
                }
            }
        });
        return yy + N * (cellH + 4);
    }

    function drawSeq(x0, top, w, mob, step) {
        var fs     = mob ? 11 : 12.5;
        var labelW = mob ? 62 : 150;
        var barX   = x0 + labelW;
        var cellW  = Math.min(56, (w - labelW) / COLS);
        var cellH  = mob ? 20 : 24;

        tx('사이클', x0, top + 6, mob ? 9.5 : 11, P.muted + 'cc', 'left', false);
        for (var c = 1; c <= COLS; c++) {
            tx(String(c), barX + (c - 0.5) * cellW, top + 6, mob ? 9.5 : 11.5, P.muted + 'cc', 'center', false);
        }

        var y = top + 22;
        y = drawTimeline(x0, w, y, mob ? '순차 실행' : '순차 실행 (in-order)', IO, step ? step.io : 0, barX, cellW, cellH, fs, mob);
        y += 12;
        y = drawTimeline(x0, w, y, mob ? '비순차 실행' : '비순차 실행 (out-of-order)', OOO, step ? step.oo : 0, barX, cellW, cellH, fs, mob);

        var ly = y + 16;
        var lx = x0;
        var items = [
            [P.muted,  mob ? '대기' : '대기 (피연산자·차례 기다림)'],
            [P.orange, mob ? 'LOAD 미스' : 'LOAD (캐시 미스)'],
            [P.purple, mob ? '의존' : '앞 결과에 의존'],
            [P.teal,   mob ? '독립' : '독립 명령어']
        ];
        items.forEach(function (it) {
            rr(lx, ly - 6, 12, 12, 3, it[0] + '30', it[0] + 'aa', 1.2);
            tx(it[1], lx + 17, ly, mob ? 9.5 : 11, P.muted + 'dd', 'left', false);
            lx += 17 + textW(it[1], mob ? 9.5 : 11, false) + (mob ? 10 : 18);
        });
    }

    /* ===================== 모드: 의존성과 발행 ===================== */
    var STATE_TEXT = {
        none  : ['도착 전', '도착 전'],
        wait  : ['대기 (피연산자)', '대기'],
        ready : ['준비 (다음 사이클 발행)', '준비'],
        exec  : ['실행 중', '실행'],
        done  : ['완료', '완료'],
        commit: ['확정', '확정']
    };
    function stateColor(s) {
        if (s === 'wait') return P.orange;
        if (s === 'ready') return P.purple;
        if (s === 'exec') return P.teal;
        if (s === 'done') return P.yellow;
        if (s === 'commit') return P.green;
        return P.muted;
    }

    function drawArrow(x1, y1, x2, y2, bend, col) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(bend, y1, bend, y2, x2, y2);
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 7, y2 - 4);
        ctx.lineTo(x2 - 7, y2 + 4);
        ctx.closePath();
        ctx.fill();
    }

    function drawIssue(x0, top, w, mob, step) {
        var fs     = mob ? 10.5 : 12;
        var c      = step ? step.c : 0;
        var gutter = mob ? 26 : 44;
        var rowH   = mob ? 40 : 46;
        var boxH   = rowH - 8;
        var y0     = top + 30;
        var issued = -1;
        for (var k = 0; k < N; k++) if (OOO.start[k] === c) issued = k;

        tx(c ? '사이클 ' + c + ' 종료 시점' : '사이클 0', x0, top + 6, fs + 0.5, P.text + 'ee', 'left', true);
        if (c) {
            tx(issued >= 0 ? '이번 사이클 발행: ' + INSTR[issued].id : '이번 사이클 발행 없음', x0 + w, top + 6, fs,
                (issued >= 0 ? P.purple : P.muted) + 'ee', 'right', true);
        }

        INSTR.forEach(function (it, i) {
            it.prod.forEach(function (p, pk) {
                if (p < 0 || !c || it.arrive > c) return;
                var col = operandReady(i, pk, c) ? P.green : P.orange;
                var ya = y0 + p * rowH + boxH / 2;
                var yb = y0 + i * rowH + boxH / 2;
                drawArrow(x0 + gutter - 2, ya, x0 + gutter - 2, yb, x0 + 2, col + 'cc');
                if (!mob) tx(it.src[pk], x0 + 12, (ya + yb) / 2, 10.5, col + 'ee', 'center', true);
            });
        });

        INSTR.forEach(function (it, i) {
            var y   = y0 + i * rowH;
            var bx  = x0 + gutter;
            var bw  = w - gutter;
            var st  = c ? stateAt(i, c, false) : 'none';
            var col = stateColor(st);
            var isIssued = i === issued;
            rr(bx, y, bw, boxH, 6, col + (st === 'none' ? '0d' : '1a'), isIssued ? P.purple + 'ee' : col + (st === 'none' ? '33' : '77'), isIssued ? 2.4 : 1.2);

            var dim = st === 'none';
            tx(mob ? it.id + ' ' + it.op : it.id + '  ' + it.asm, bx + 10, y + boxH / 2, fs, dim ? P.muted + '88' : P.text + 'ee', 'left', true);

            if (!dim) {
                var cx = bx + (mob ? 64 : 200);
                var chH = mob ? 20 : 22;
                it.src.forEach(function (r, k2) {
                    var ready = operandReady(i, k2, c);
                    var label = ready ? r + ' ✓' : r + '←' + INSTR[it.prod[k2]].id;
                    cx += chip(label, cx, y + (boxH - chH) / 2, chH, mob ? 9.5 : 10.5, ready ? P.green : P.orange, !ready) + 5;
                });
            }

            var stLabel = STATE_TEXT[st][mob ? 1 : 0];
            if (st === 'exec') stLabel += ' ' + (c - OOO.start[i] + 1) + '/' + it.lat;
            tx(stLabel, bx + bw - 10, y + boxH / 2, fs, dim ? P.muted + '88' : col + 'ee', 'right', true);
        });
    }

    /* ===================== 모드: 리오더 버퍼 ===================== */
    function drawRob(x0, top, w, mob, step) {
        var fs    = mob ? 10.5 : 12;
        var c     = step ? step.c : 0;
        var exc   = step && step.exc;
        var gap   = mob ? 6 : 12;
        var slotW = Math.min(150, (w - gap * (N - 1)) / N);
        var slotH = mob ? 70 : 80;
        var sx0   = x0 + (w - (slotW * N + gap * (N - 1))) / 2;
        var sy    = top + 46;

        tx(mob ? 'ROB (프로그램 순서)' : 'ROB — 들어온 순서대로 자리를 잡는 버퍼', x0, top + 6, fs + 0.5, P.text + 'ee', 'left', true);
        if (c) tx('사이클 ' + c, x0 + w, top + 6, fs, P.muted + 'dd', 'right', true);

        var head = -1;
        for (var h = 0; h < N; h++) {
            if (exc ? h === 1 : (c && stateAt(h, c, true) !== 'commit' && INSTR[h].arrive <= c)) { head = h; break; }
        }

        INSTR.forEach(function (it, i) {
            var x  = sx0 + i * (slotW + gap);
            var st = c ? stateAt(i, c, true) : 'none';
            var label, col;
            if (exc && i === 1) { label = '예외'; col = P.red; }
            else if (exc && i > 1) { label = '폐기'; col = P.red; }
            else { label = STATE_TEXT[st][1]; col = stateColor(st); }

            if (st === 'none' && !exc) {
                ctx.save();
                ctx.setLineDash([4, 4]);
                rr(x, sy, slotW, slotH, 6, 'none', P.muted + '55', 1.2);
                ctx.restore();
                tx('빈 칸', x + slotW / 2, sy + slotH / 2, mob ? 9.5 : 11, P.muted + '88', 'center', false);
                return;
            }
            var discarded = exc && i > 1;
            rr(x, sy, slotW, slotH, 6, col + (discarded ? '12' : '26'), col + (discarded ? '66' : 'cc'), i === head ? 2.6 : 1.4);
            tx(it.id, x + slotW / 2, sy + (mob ? 16 : 18), fs + 1.5, (discarded ? P.muted : P.text) + 'ee', 'center', true);
            tx(it.op + ' ' + it.dst, x + slotW / 2, sy + slotH / 2, mob ? 9.5 : 11, (discarded ? P.muted : P.text) + 'aa', 'center', false);
            tx(label, x + slotW / 2, sy + slotH - (mob ? 14 : 16), mob ? 10 : 11.5, col + 'ee', 'center', true);
            if (discarded) {
                ctx.strokeStyle = P.red + '99';
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.moveTo(x + 6, sy + 6);
                ctx.lineTo(x + slotW - 6, sy + slotH - 6);
                ctx.stroke();
            }
        });

        if (head >= 0) {
            var hx = sx0 + head * (slotW + gap) + slotW / 2;
            tx('HEAD ▼', hx, sy - 13, mob ? 10 : 11.5, P.purple + 'ee', 'center', true);
        } else if (c) {
            tx('모두 확정 ✓', x0 + w / 2, sy - 13, mob ? 10 : 11.5, P.green + 'ee', 'center', true);
        }

        var ry = sy + slotH + (mob ? 28 : 34);
        tx(mob ? '레지스터 (확정된 값만)' : '레지스터 — 프로그램이 보는 값 (확정된 결과만 반영)', x0, ry, fs, P.text + 'cc', 'left', true);
        var cx = x0;
        var cy = ry + 14;
        INSTR.forEach(function (it, i) {
            var committed = c && stateAt(i, c, true) === 'commit' && !(exc && i > 0);
            var lbl = committed ? it.dst + ' = ' + it.id + (mob ? '' : ' 결과') : it.dst + (mob ? ' = old' : ' = 이전 값');
            cx += chip(lbl, cx, cy, mob ? 22 : 26, mob ? 9.5 : 11, committed ? P.green : P.muted, committed) + (mob ? 5 : 8);
        });
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

        if (mode === 'issue') drawIssue(padX, top, fullW, mob, step);
        else if (mode === 'rob') drawRob(padX, top, fullW, mob, step);
        else drawSeq(padX, top, fullW, mob, step);

        if (!step) {
            tx('아래 STEP을 눌러 비순차 실행이 어떻게 동작하는지 확인하세요.', W / 2, GH() - (mob ? 12 : 14), mob ? 11 : 12.5, P.muted + 'aa', 'center', false);
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH;
        if (mode === 'issue') neededH = mob ? 300 : 350;
        else if (mode === 'rob') neededH = mob ? 290 : 320;
        else neededH = mob ? 400 : 450;
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
        if (mode === 'issue') return '예약 스테이션에서 명령어마다 피연산자가 준비됐는지 확인하고, 준비된 명령어부터 실행 유닛으로 보냅니다.';
        if (mode === 'rob') return '실행이 끝난 순서와 상관없이, 리오더 버퍼(ROB)의 맨 앞부터 순서대로 결과를 확정합니다.';
        return '같은 명령어 5개를 순차 실행과 비순차 실행으로 처리할 때 걸리는 사이클을 비교합니다.';
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

    setTimeout(resize, 60);
})();