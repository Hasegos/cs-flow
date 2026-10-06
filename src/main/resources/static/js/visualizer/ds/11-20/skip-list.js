/**
 * 스킵 리스트 시각화
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
    var root    = el('div', 'sl-viz');
    var toolbar = el('div', 'sl-viz__toolbar');
    var tbLeft  = el('div', 'sl-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'sl-viz__title', 'SKIP LIST'));

    var modeWrap = el('div', 'sl-viz__mode');
    var modeDefs = [
        { key: 'build', label: '레벨 구성' },
        { key: 'search', label: '탐색' },
        { key: 'insert', label: '삽입' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'sl-viz__mode-btn' + (i === 0 ? ' sl-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'sl-viz__speed');
    speedWrap.appendChild(el('span', 'sl-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'sl-viz__speed-btn' + (i === 0 ? ' sl-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'sl-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'sl-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'sl-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'sl-viz__controls');
    var btnPlay  = el('button', 'sl-viz__btn sl-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'sl-viz__btn', '▶| STEP');
    var btnReset = el('button', 'sl-viz__btn', '↺ RESET');
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

    /* ===================== 엔진: 스킵 리스트 ===================== */
    function ju(n, a, b) {
        return [0, 1, 3, 6, 7, 8].indexOf(Math.abs(n) % 10) >= 0 ? a : b;
    }
    function jro(n) {
        return n + ([0, 3, 6].indexOf(Math.abs(n) % 10) >= 0 ? '으로' : '로');
    }
    var MAXL = 3;
    var KEYS = [3, 6, 7, 9, 12, 17, 19, 21, 25, 26];
    var HTS = [1, 2, 1, 3, 1, 2, 1, 2, 1, 3];
    var FLIPS = ['뒤', '앞뒤', '뒤', '앞앞뒤', '뒤', '앞뒤', '뒤', '앞뒤', '뒤', '앞앞뒤'];
    function mkNodes(n) {
        var out = [];
        for (var i = 0; i < n; i++) out.push({ k: KEYS[i], h: HTS[i], show: HTS[i] });
        return out;
    }
    function nextAt(nodes, idx, level) {
        for (var j = idx + 1; j < nodes.length; j++) {
            if (nodes[j].show >= level) return j;
        }
        return -1;
    }
    function countAt(nodes, level) {
        var c = 0;
        nodes.forEach(function (nd) { if (nd.show >= level) c++; });
        return c;
    }
    function lab(nodes, idx) { return idx < 0 ? 'H' : String(nodes[idx].k); }
    function snap(nodes) {
        return nodes.map(function (nd) { return { k: nd.k, h: nd.h, show: nd.show }; });
    }
    function sstep(nodes, path, preds, cur, fresh, cap, cap2, cap3, log) {
        return { nodes: snap(nodes), path: path.slice(), preds: preds, cur: cur, fresh: fresh, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }

    /* ===================== 데이터: 레벨 구성 ===================== */
    var BUILD_STEPS = [];
    (function () {
        BUILD_STEPS.push(sstep([], [], [], null, 0, '', '', '', '스킵 리스트(skip list)는 정렬된 연결 리스트 위에 "빠른 길"을 여러 층 얹은 자료구조입니다. 노드마다 동전을 던져 앞면이 나오는 동안 한 층씩 위로 올라갑니다. 키를 하나씩 넣으며 층이 어떻게 쌓이는지 봅니다. 맨 앞 H는 모든 층에 걸친 머리 노드입니다.'));
        for (var i = 0; i < KEYS.length; i++) {
            var nodes = mkNodes(i + 1);
            BUILD_STEPS.push(sstep(nodes, [], [], null, KEYS[i],
                '키 ' + KEYS[i] + ' · 동전 ' + FLIPS[i] + ' · 높이 ' + HTS[i],
                'L1 ' + countAt(nodes, 1) + '개 · L2 ' + countAt(nodes, 2) + '개 · L3 ' + countAt(nodes, 3) + '개', '',
                '키 ' + KEYS[i] + ju(KEYS[i], '을', '를') + ' 넣습니다. 동전을 던져 앞면이 나오면 한 층 올리고 뒷면이 나오면 멈춥니다. 결과가 ' + FLIPS[i] + '이므로 노드의 높이는 ' + HTS[i] + '입니다.'));
        }
        var all = mkNodes(KEYS.length);
        var ptr = countAt(all, 1) + countAt(all, 2) + countAt(all, 3);
        BUILD_STEPS.push(sstep(all, [], [], null, 0, 'L1 ' + countAt(all, 1) + ' → L2 ' + countAt(all, 2) + ' → L3 ' + countAt(all, 3), '포인터 ' + ptr + '개 · 노드당 평균 ' + (ptr / KEYS.length).toFixed(1), '',
            '정리 — 위층으로 갈수록 노드 수가 대략 절반씩 줄었습니다(' + countAt(all, 1) + ' → ' + countAt(all, 2) + ' → ' + countAt(all, 3) + '). 앞면 확률이 1/2이면 노드당 포인터 수의 기대값은 2입니다. 이 분포 덕분에 위층에서 크게 건너뛰고 아래층에서 좁혀 가는 탐색이 가능합니다.'));
    })();

    /* ===================== 데이터: 탐색 ===================== */
    var TARGET = 21;
    var SEARCH_STEPS = [];
    (function () {
        var nodes = mkNodes(KEYS.length);
        var idx = -1;
        var level = MAXL;
        var path = [{ i: -1, l: level }];
        var moves = 0;
        SEARCH_STEPS.push(sstep(nodes, path, [], { i: -1, l: level }, 0, '', '', '', '키 ' + TARGET + ju(TARGET, '을', '를') + ' 찾습니다. 머리 노드 H의 맨 위층에서 시작해, 오른쪽 다음 노드가 찾는 키보다 작으면 오른쪽으로 가고, 크거나 같으면 한 층 내려갑니다. 연결 리스트라면 ' + (KEYS.indexOf(TARGET) + 1) + '개 노드를 차례로 지나야 합니다.'));
        while (true) {
            var j = nextAt(nodes, idx, level);
            if (j >= 0 && nodes[j].k < TARGET) {
                idx = j;
                moves++;
                path.push({ i: idx, l: level });
                SEARCH_STEPS.push(sstep(nodes, path, [], { i: idx, l: level }, 0, 'L' + level + ' · 오른쪽 이동 → ' + nodes[idx].k, '오른쪽 다음 ' + nodes[idx].k + ' < ' + TARGET, '이동 ' + moves + '번',
                    '층 ' + level + '에서 오른쪽 다음 노드의 키 ' + nodes[idx].k + ju(nodes[idx].k, '은', '는') + ' ' + TARGET + '보다 작으므로 오른쪽으로 이동합니다.'));
            } else if (level > 1) {
                var nxt = j >= 0 ? String(nodes[j].k) : '없음';
                level--;
                path.push({ i: idx, l: level });
                SEARCH_STEPS.push(sstep(nodes, path, [], { i: idx, l: level }, 0, 'L' + (level + 1) + ' → L' + level + ' · 내려감', '오른쪽 다음 ' + nxt + (j >= 0 ? ' ≥ ' + TARGET : ''), '이동 ' + moves + '번',
                    '층 ' + (level + 1) + '에서 ' + (j >= 0 ? '오른쪽 다음 노드의 키 ' + nxt + ju(nodes[j].k, '은', '는') + ' ' + TARGET + ' 이상이므로' : '오른쪽 다음 노드가 없으므로') + ' 한 층 내려갑니다. 지금 위치 ' + lab(nodes, idx) + '에서 층 ' + level + ju(level, '을', '를') + ' 이어 갑니다.'));
            } else {
                idx = j;
                moves++;
                path.push({ i: idx, l: 1 });
                SEARCH_STEPS.push(sstep(nodes, path, [], { i: idx, l: 1 }, 0, '찾음 · ' + TARGET, '이동 ' + moves + '번 · 연결 리스트 ' + (KEYS.indexOf(TARGET) + 1) + '번', '',
                    '맨 아래층에서 오른쪽 다음 노드가 ' + TARGET + '입니다. 찾았습니다. 오른쪽 이동 ' + moves + '번으로 닿았고, 연결 리스트는 ' + (KEYS.indexOf(TARGET) + 1) + '번이 필요합니다.'));
                break;
            }
        }
        SEARCH_STEPS.push(sstep(nodes, path, [], { i: idx, l: 1 }, 0, '이동 ' + moves + '번 · 연결 리스트 ' + (KEYS.indexOf(TARGET) + 1) + '번', '', '',
            '정리 — 위층에서 크게 건너뛰고 내려오며 범위를 좁혔습니다. 층 수가 log n 정도이고 층마다 기대 약 2번(오른쪽 약 1번, 아래 1번) 움직이므로 평균 탐색은 O(log n)입니다. 확률적 구조라 최악의 경우는 O(n)까지 갈 수 있습니다.'));
    })();

    /* ===================== 데이터: 삽입 ===================== */
    var INS_KEY = 14;
    var INS_H = 2;
    var INS_STEPS = [];
    (function () {
        var nodes = mkNodes(KEYS.length);
        var idx = -1;
        var path = [{ i: -1, l: MAXL }];
        var preds = [];
        INS_STEPS.push(sstep(nodes, path, preds, { i: -1, l: MAXL }, 0, '', '', '', '키 ' + INS_KEY + ju(INS_KEY, '을', '를') + ' 넣습니다. 먼저 탐색처럼 내려가며 층마다 ' + INS_KEY + ' 바로 앞 노드(보라색 테두리)를 기록하고, 동전으로 높이를 정한 뒤 그 노드들 뒤에 새 노드를 끼워 넣습니다.'));
        for (var level = MAXL; level >= 1; level--) {
            if (level < MAXL) path.push({ i: idx, l: level });
            while (true) {
                var j = nextAt(nodes, idx, level);
                if (j >= 0 && nodes[j].k < INS_KEY) {
                    idx = j;
                    path.push({ i: idx, l: level });
                } else break;
            }
            preds.push({ i: idx, l: level });
            var nj = nextAt(nodes, idx, level);
            INS_STEPS.push(sstep(nodes, path, preds.slice(), { i: idx, l: level }, 0, '층 ' + level + ' · 앞 노드 ' + lab(nodes, idx), '오른쪽 다음 ' + (nj >= 0 ? nodes[nj].k + ' ≥ ' + INS_KEY : '없음'), '',
                '층 ' + level + '에서 ' + INS_KEY + ' 바로 앞 노드는 ' + lab(nodes, idx) + '입니다. ' + (nj >= 0 ? '오른쪽 다음 노드의 키 ' + nodes[nj].k + ju(nodes[nj].k, '은', '는') + ' ' + INS_KEY + ' 이상이므로' : '오른쪽 다음 노드가 없으므로') + ' 여기서 멈추고 ' + (level > 1 ? '한 층 내려갑니다.' : '탐색을 마칩니다.')));
        }
        INS_STEPS.push(sstep(nodes, path, preds.slice(), null, 0, '동전 앞 → 층 2로 올림', '', '', '새 노드의 높이를 동전으로 정합니다. 첫 번째 동전이 앞면이라 한 층 올라갑니다.'));
        INS_STEPS.push(sstep(nodes, path, preds.slice(), null, 0, '동전 뒤 → 멈춤', '새 노드 높이 ' + INS_H, '', '두 번째 동전이 뒷면이라 멈춥니다. 새 노드의 높이는 ' + INS_H + '입니다.'));
        var pos = 0;
        while (pos < nodes.length && nodes[pos].k < INS_KEY) pos++;
        var withNew = snap(nodes);
        withNew.splice(pos, 0, { k: INS_KEY, h: INS_H, show: 0 });
        for (var lv = 1; lv <= INS_H; lv++) {
            withNew[pos].show = lv;
            var pr = preds.filter(function (p) { return p.l === lv; })[0];
            INS_STEPS.push(sstep(withNew, path, preds.slice(), null, INS_KEY, '층 ' + lv + ' 연결', lab(nodes, pr.i) + ' → ' + INS_KEY + ' → ' + (function () { var q = nextAt(nodes, pr.i, lv); return q >= 0 ? nodes[q].k : '없음'; })(), '',
                '층 ' + lv + '에서 앞 노드 ' + lab(nodes, pr.i) + '의 오른쪽 포인터를 새 노드 ' + jro(INS_KEY) + ' 바꾸고, 새 노드가 원래 다음 노드를 가리키게 합니다. 포인터 두 개만 고칩니다.'));
        }
        INS_STEPS.push(sstep(withNew, path, [], null, INS_KEY, '삽입 끝 · 층별 포인터 2개씩', '', '',
            '정리 — 탐색으로 층마다 앞 노드를 찾고(평균 O(log n)), 높이만큼의 층에서 포인터 두 개씩만 고쳤습니다. 균형 트리처럼 회전이나 재배치가 필요 없고, 동전 던지기가 균형을 확률적으로 맞춰 줍니다.'));
    })();

    /* ===================== 상태 ===================== */
    var mode    = 'build';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'search') return SEARCH_STEPS;
        if (mode === 'insert') return INS_STEPS;
        return BUILD_STEPS;
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
        if (sz < 11) sz = 11;
        if (color.indexOf(P.muted) === 0) color = P.sub + 'ff';
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    /* ===================== 공통: 스킵 리스트 그리기 ===================== */
    function drawSL(x0, top, w, mob, step) {
        var nodes = step ? step.nodes : mkNodes(KEYS.length);
        var path = step ? step.path : [];
        var preds = step ? step.preds : [];
        var cur = step ? step.cur : null;
        var fresh = step ? step.fresh : 0;
        var fs = mob ? 10 : 11.5;
        var cols = nodes.length + 2;
        var cw = Math.min(54, w / cols);
        var bw = Math.min(cw - 4, 34);
        var bh = mob ? 20 : 22;
        var rowH = mob ? 32 : 36;
        var ox = x0 + (w - cw * cols) / 2;
        function cx(i) { return ox + (i + 2.5) * cw; }
        function cy(l) { return top + 14 + (MAXL - l) * rowH + bh / 2; }
        function present(i, l) { return i < 0 || nodes[i].show >= l; }
        var l, i;
        for (l = 1; l <= MAXL; l++) {
            tx('L' + l, ox + cw * 0.5, cy(l), fs - 1, P.sub + 'ee', 'center', true);
        }
        for (l = 1; l <= MAXL; l++) {
            var prev = -1;
            for (i = 0; i < nodes.length; i++) {
                if (!present(i, l)) continue;
                var ax = cx(prev) + bw / 2;
                var bx = cx(i) - bw / 2;
                ctx.beginPath();
                ctx.moveTo(ax, cy(l));
                ctx.lineTo(bx, cy(l));
                ctx.strokeStyle = P.sub + 'aa';
                ctx.lineWidth = 1.4;
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(bx, cy(l));
                ctx.lineTo(bx - 5, cy(l) - 3);
                ctx.lineTo(bx - 5, cy(l) + 3);
                ctx.closePath();
                ctx.fillStyle = P.sub + 'aa';
                ctx.fill();
                prev = i;
            }
        }
        if (path.length > 1) {
            ctx.beginPath();
            path.forEach(function (p, k) {
                if (k === 0) ctx.moveTo(cx(p.i), cy(p.l)); else ctx.lineTo(cx(p.i), cy(p.l));
            });
            ctx.strokeStyle = P.orange + 'cc';
            ctx.lineWidth = 3;
            ctx.stroke();
        }
        for (l = 1; l <= MAXL; l++) {
            for (i = -1; i < nodes.length; i++) {
                if (!present(i, l)) continue;
                var isCur = cur && cur.i === i && cur.l === l;
                var isPred = preds.some(function (p) { return p.i === i && p.l === l; });
                var isNew = i >= 0 && nodes[i].k === fresh;
                var col = i < 0 ? P.purple : P.teal;
                if (isNew) col = P.green;
                if (isPred) col = P.purple;
                if (isCur) col = P.yellow;
                rr(cx(i) - bw / 2, cy(l) - bh / 2, bw, bh, 4, col + '30', col + 'ff', isCur || isPred ? 2.4 : 1.4);
                tx(i < 0 ? 'H' : String(nodes[i].k), cx(i), cy(l), fs - 0.5, P.text + 'ff', 'center', true);
            }
        }
        var capY = cy(1) + bh / 2 + 22;
        if (step && step.cap) tx(step.cap, x0 + w / 2, capY, fs - 0.5, P.yellow + 'ff', 'center', true);
        if (step && step.cap2) tx(step.cap2, x0 + w / 2, capY + 18, fs - 1, P.text + 'ee', 'center', false);
        if (step && step.cap3) tx(step.cap3, x0 + w / 2, capY + 36, fs - 1, P.green + 'ee', 'center', true);
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

        drawSL(padX, top, fullW, mob, step);

        if (!step) {
            var hint = '아래 STEP으로 스킵 리스트의 동작을 확인하세요.';
            ctx.font = '500 ' + (mob ? 11 : 12.5) + 'px "JetBrains Mono",monospace';
            var hs = mob ? 11 : 12.5;
            var hl = [hint];
            if (ctx.measureText(hint).width > W - 16) {
                var cut = hint.indexOf(' ', Math.floor(hint.length / 2));
                if (cut < 0) cut = hint.lastIndexOf(' ');
                hl = [hint.slice(0, cut), hint.slice(cut + 1)];
            }
            hl.forEach(function (line, li) {
                tx(line, W / 2, GH() - (mob ? 12 : 14) - (hl.length - 1 - li) * (hs + 4), hs, P.muted + 'aa', 'center', false);
            });
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH;
        neededH = mob ? 235 : 255;
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
        if (mode === 'search') return '위층에서 크게 건너뛰고 아래층에서 좁혀 가는 탐색 경로를 봅니다.';
        if (mode === 'insert') return '앞 노드를 찾고 동전으로 높이를 정한 뒤 포인터를 끼워 넣습니다.';
        return '키를 넣으며 동전 던지기로 층이 쌓이는 모습을 봅니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('sl-viz__speed-btn--active'); });
        btn.classList.add('sl-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('sl-viz__mode-btn--active', d.key === m); });
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