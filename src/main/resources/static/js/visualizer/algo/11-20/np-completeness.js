/**
 * P vs NP / NP-완전 시각화
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
    var root    = el('div', 'np-viz');
    var toolbar = el('div', 'np-viz__toolbar');
    var tbLeft  = el('div', 'np-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'np-viz__title', 'P VS NP'));

    var modeWrap = el('div', 'np-viz__mode');
    var modeDefs = [
        { key: 'verify', label: '찾기와 검증' },
        { key: 'reduce', label: '환원' },
        { key: 'classes', label: 'P · NP · NP-완전' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'np-viz__mode-btn' + (i === 0 ? ' np-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'np-viz__speed');
    speedWrap.appendChild(el('span', 'np-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'np-viz__speed-btn' + (i === 0 ? ' np-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'np-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'np-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'np-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'np-viz__controls');
    var btnPlay  = el('button', 'np-viz__btn np-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'np-viz__btn', '▶| STEP');
    var btnReset = el('button', 'np-viz__btn', '↺ RESET');
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

    /* ===================== 엔진: P, NP, NP-완전 ===================== */
    function bat(n) {
        return [0, 1, 3, 6, 7, 8].indexOf(Math.abs(n) % 10) >= 0;
    }
    function eu(n) {
        return bat(n) ? '을' : '를';
    }
    function ga(n) {
        return bat(n) ? '이' : '가';
    }
    function wa(n) {
        return bat(n) ? '과' : '와';
    }
    function ro(n) {
        return [0, 3, 6].indexOf(Math.abs(n) % 10) >= 0 ? '으로' : '로';
    }
    function setText(a) {
        return '{' + a.join(', ') + '}';
    }

    /* ===================== 데이터: 찾기와 검증 (부분집합 합) ===================== */
    var SS = [3, 34, 4, 12, 5, 2];
    var SS_T = 9;
    var SS_STEPS = [];
    function ssStep(sel, checked, add, cap, cap2, cap3, log) {
        return { kind: 'ss', sel: sel, checked: checked, add: add, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }
    function maskSel(m) {
        var r = [];
        var i;
        for (i = 0; i < SS.length; i++) if ((m >> i) & 1) r.push(i);
        return r;
    }
    function selVals(sel) {
        return sel.map(function (i) { return SS[i]; });
    }
    function sumOf(a) {
        var s = 0;
        a.forEach(function (v) { s += v; });
        return s;
    }
    (function () {
        var total = 1 << SS.length;
        var m;
        var found = -1;
        for (m = 0; m < total; m++) {
            if (sumOf(selVals(maskSel(m))) === SS_T) {
                found = m;
                break;
            }
        }
        SS_STEPS.push(ssStep([], 0, 0, '부분집합 합: 합이 ' + SS_T + '인 부분집합이 있을까?', '원소 ' + SS.length + '개 → 부분집합은 2^' + SS.length + ' = ' + total + '개', '', '집합 ' + setText(SS) + '에서 원소를 골라 합이 ' + SS_T + ga(SS_T) + ' 되게 만들 수 있는지 묻는 부분집합 합 문제입니다. 답을 찾으려면 가능한 부분집합을 하나씩 확인해야 하고, 원소가 ' + SS.length + '개이면 부분집합은 ' + total + '개입니다. 반대로 누군가 답(인증서)을 내밀면 합만 더해 보면 확인됩니다.'));
        for (m = 0; m < 5; m++) {
            var vals = selVals(maskSel(m));
            var s = sumOf(vals);
            SS_STEPS.push(ssStep(maskSel(m), m + 1, 0, '부분집합 #' + (m + 1) + ': ' + (vals.length ? setText(vals) : '{ } (공집합)'), '합 = ' + s + (s === SS_T ? ' → 찾음' : ' ≠ ' + SS_T), '확인 ' + (m + 1) + ' / ' + total,
                '부분집합 ' + (vals.length ? setText(vals) : '{ } (공집합)') + '의 합은 ' + s + '입니다. 목표 ' + SS_T + wa(SS_T) + ' 다르므로 다음 부분집합으로 넘어갑니다.'));
        }
        SS_STEPS.push(ssStep([], found, 0, '#6 ~ #' + found + ': ' + (found - 5) + '개를 더 확인', '합이 ' + SS_T + '인 것은 아직 없음', '확인 ' + found + ' / ' + total, '이어서 ' + (found - 5) + '개 부분집합을 같은 방식으로 더해 봅니다. 이 중에 합이 ' + SS_T + '인 것은 없습니다.'));
        var fv = selVals(maskSel(found));
        SS_STEPS.push(ssStep(maskSel(found), found + 1, 0, '부분집합 #' + (found + 1) + ': ' + setText(fv), '합 = ' + sumOf(fv) + ' → 찾음', '확인 ' + (found + 1) + ' / ' + total, '부분집합 ' + setText(fv) + '의 합이 ' + sumOf(fv) + ro(sumOf(fv)) + ' 목표와 같습니다. 이 순서로 찾으면 ' + (found + 1) + '번째에서 발견했지만, 합이 ' + SS_T + '인 부분집합이 없으면 ' + total + '개를 모두 확인해야 "없다"는 결론이 나옵니다.'));
        SS_STEPS.push(ssStep(maskSel(found), found + 1, fv.length - 1, '검증: ' + fv.join(' + ') + ' = ' + sumOf(fv) + '?', '덧셈 ' + (fv.length - 1) + '번으로 확인 → 참', '검증은 인증서 크기만큼의 계산', '누군가 ' + setText(fv) + eu(fv[fv.length - 1]) + ' 답으로 내밀면 ' + fv.join(' + ') + '의 합을 계산해 ' + SS_T + wa(SS_T) + ' 비교하면 됩니다. 덧셈 ' + (fv.length - 1) + '번이면 끝나고 원소 수 n에 비례하는 다항 시간이면 충분합니다. 이렇게 답이 주어졌을 때 다항 시간에 확인할 수 있는 결정 문제의 집합이 NP입니다.'));
        SS_STEPS.push(ssStep([], 0, 0, 'n = 6: 64개 · n = 20: 1,048,576개', 'n = 40: 1,099,511,627,776개', '검증은 n개 이하의 덧셈', '원소가 n개이면 부분집합은 2^n개입니다. n = 20이면 1,048,576개, n = 40이면 1,099,511,627,776개로 순식간에 늘어납니다. 모든 부분집합을 확인하는 방법은 이렇게 지수적이지만, 인증서를 검증하는 일은 여전히 n개 이하의 덧셈입니다. 다항 시간에 푸는 알고리즘이 있는지는 알려져 있지 않습니다.'));
    })();

    /* ===================== 데이터: 환원 ===================== */
    var RD = [
        { name: 'CIRCUIT-SAT', parent: -1, desc: '불리언 회로의 출력을 1로 만드는 입력이 있는지 묻는 문제입니다. 교재(CLRS)는 이 문제가 NP-완전임을 직접 증명하는 데서 출발합니다.' },
        { name: 'SAT', parent: 0, desc: '논리식을 참으로 만드는 값 배정이 있는지 묻는 문제입니다. CIRCUIT-SAT을 다항 시간에 SAT으로 바꿀 수 있습니다.' },
        { name: '3-CNF-SAT', parent: 1, desc: '모든 절에 리터럴이 3개인 논리식의 만족 가능성을 묻는 문제입니다. SAT 식을 다항 시간에 이 꼴로 바꿀 수 있습니다.' },
        { name: 'CLIQUE', parent: 2, desc: '그래프에 크기 k인 클리크(모든 정점이 서로 연결된 부분 그래프)가 있는지 묻는 문제입니다. 3-CNF 식을 그래프로 바꿉니다.' },
        { name: 'VERTEX-COVER', parent: 3, desc: '정점 k개로 모든 간선을 덮을 수 있는지 묻는 문제입니다. CLIQUE 입력의 보완 그래프를 쓰면 바뀝니다.' },
        { name: 'HAM-CYCLE', parent: 4, desc: '모든 정점을 정확히 한 번씩 지나는 사이클이 있는지 묻는 문제입니다. VERTEX-COVER 입력을 이 꼴로 바꿉니다.' },
        { name: 'TSP', parent: 5, desc: '모든 도시를 한 번씩 돌아오는 비용이 k 이하인 경로가 있는지 묻는 외판원 문제의 결정 버전입니다. HAM-CYCLE에서 바뀝니다.' },
        { name: 'SUBSET-SUM', parent: 2, desc: '앞 탭의 부분집합 합 문제입니다. 3-CNF-SAT 식을 다항 시간에 숫자 집합과 목표 합으로 바꿀 수 있습니다.' }
    ];
    var RD_STEPS = [];
    (function () {
        var k;
        RD_STEPS.push({ kind: 'reduce', upto: 0, cap: '환원: A ≤p B', cap2: 'A의 입력을 다항 시간에 B의 입력으로 바꾸는 것', cap3: '', log: 'A ≤p B는 A의 모든 입력을 다항 시간에 B의 입력으로 바꾸어, B의 답이 곧 A의 답이 되게 하는 변환이 있다는 뜻입니다. B를 다항 시간에 풀 수 있다면 A도 다항 시간에 풀립니다. 화살표를 따라 NP-완전 문제가 퍼져 나가는 모습을 봅니다.' });
        for (k = 0; k < RD.length; k++) {
            RD_STEPS.push({ kind: 'reduce', upto: k + 1, cap: k === 0 ? RD[0].name + ': 출발점' : RD[RD[k].parent].name + ' ≤p ' + RD[k].name, cap2: k === 0 ? '교재가 직접 증명하는 출발점' : RD[k].name + '도 NP-완전', cap3: '', log: RD[k].name + ': ' + RD[k].desc + (k === 0 ? '' : ' 그래서 ' + RD[k].name + ' 역시 NP-완전입니다.') });
        }
        RD_STEPS.push({ kind: 'reduce', upto: RD.length, cap: '하나라도 다항 시간에 풀리면', cap2: 'NP 전체가 다항 시간에 풀림 → P = NP', cap3: 'NP-완전: NP에서 가장 어려운 문제들', log: '정리 — A가 NP-완전이고 A ≤p B이며 B가 NP에 속하면 B도 NP-완전입니다. 화살표 방향의 반대로 보면 B를 다항 시간에 풀 수 있을 때 A도 풀리므로, 이 문제들 중 하나라도 다항 시간 알고리즘이 있으면 NP의 모든 문제가 다항 시간에 풀려 P = NP가 됩니다.' });
    })();

    /* ===================== 데이터: P, NP, NP-완전 ===================== */
    var CL_STEPS = [
        { kind: 'cls', st: 0, cap: 'P ⊆ NP', cap2: '풀 수 있으면 검증도 할 수 있기 때문', cap3: '', log: 'P는 다항 시간에 풀 수 있는 결정 문제, NP는 답이 주어졌을 때 다항 시간에 검증할 수 있는 결정 문제의 집합입니다. 문제를 다항 시간에 풀 수 있으면 풀이를 다시 실행해 검증도 할 수 있으므로 P는 NP 안에 들어갑니다.' },
        { kind: 'cls', st: 1, cap: 'P: 다항 시간에 풀 수 있는 문제', cap2: '정렬되어 있는가 · 경로 길이가 k 이하인가', cap3: '', log: 'P에는 "배열이 정렬되어 있는가", "거리가 k 이하인 경로가 있는가(음수 사이클이 없는 그래프)"처럼 다항 시간 알고리즘이 알려진 결정 문제가 들어갑니다.' },
        { kind: 'cls', st: 2, cap: 'NP: 검증이 다항 시간인 문제', cap2: '부분집합 합 · 해밀턴 사이클 · SAT', cap3: '', log: 'NP는 "풀기"가 아니라 "검증하기"가 다항 시간인 문제의 집합입니다. 부분집합 합이나 해밀턴 사이클처럼 답을 찾기는 어려워 보여도 답을 확인하는 일은 쉬운 문제가 들어갑니다. P도 이 안에 있습니다.' },
        { kind: 'cls', st: 3, cap: 'NP-완전: NP이면서 NP-난해', cap2: 'NP의 모든 문제가 다항 시간에 환원되는 문제', cap3: '', log: 'NP-난해(NP-hard)는 NP의 모든 문제가 다항 시간에 환원되는 문제이고, NP에도 속하는 NP-난해 문제가 NP-완전입니다. 그림에서 두 영역이 겹치는 부분입니다. 앞 탭의 CIRCUIT-SAT, SAT, 클리크가 여기에 속합니다.' },
        { kind: 'cls', st: 4, cap: 'P ≠ NP라면', cap2: 'NP-완전 문제에는 다항 시간 알고리즘이 없음', cap3: '대부분의 연구자가 이쪽을 예상', log: 'P ≠ NP이면 NP 안에 P가 아닌 문제가 있고, NP-완전 문제는 모두 P의 바깥에 있습니다. 즉 NP-완전 문제를 다항 시간에 푸는 알고리즘은 존재하지 않습니다. 많은 연구자가 이쪽이 맞을 것이라 예상하지만 증명은 없습니다.' },
        { kind: 'cls', st: 5, cap: 'P = NP라면', cap2: 'NP-완전 하나만 풀어도 NP 전체가 풀림', cap3: 'P와 NP가 같은 집합', log: 'P = NP이면 NP의 모든 문제가 다항 시간에 풀립니다. NP-완전 문제 하나에 다항 시간 알고리즘이 나오면 환원을 통해 NP 전체가 다항 시간에 풀리기 때문입니다. 그림에서 P가 NP 전체로 커집니다.' },
        { kind: 'cls', st: 6, cap: 'P = NP인가? 아직 미해결', cap2: '클레이 수학연구소 밀레니엄 문제 7개 중 하나', cap3: '', log: '정리 — P와 NP가 같은지는 아직 증명되지 않은 열린 문제이며, 클레이 수학연구소의 밀레니엄 문제 중 하나입니다. NP-완전 문제를 만나면 정확한 다항 시간 알고리즘을 찾기보다 근사 알고리즘이나 작은 입력용 알고리즘, 다항 시간에 풀리는 특수한 경우를 고려합니다.' }
    ];

    /* ===================== 상태 ===================== */
    var mode    = 'verify';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'reduce') return RD_STEPS;
        if (mode === 'classes') return CL_STEPS;
        return SS_STEPS;
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

    /* ===================== 공통: 캡션과 화살표 ===================== */
    function drawCaps(s, x0, w, y, fs) {
        if (s.cap) tx(s.cap, x0 + w / 2, y, fs - 0.5, P.yellow + 'ff', 'center', true);
        if (s.cap2) tx(s.cap2, x0 + w / 2, y + 19, fs - 1, P.text + 'ee', 'center', false);
        if (s.cap3) tx(s.cap3, x0 + w / 2, y + 38, fs - 1, P.green + 'ee', 'center', true);
    }
    function arrow(x1, y1, x2, y2, color) {
        var ang = Math.atan2(y2 - y1, x2 - x1);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 7 * Math.cos(ang - 0.45), y2 - 7 * Math.sin(ang - 0.45));
        ctx.lineTo(x2 - 7 * Math.cos(ang + 0.45), y2 - 7 * Math.sin(ang + 0.45));
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    }

    /* ===================== 부분집합 합: 탐색 대 검증 ===================== */
    function drawSS(x0, top, w, mob, s) {
        var fs = mob ? 11.5 : 13;
        var n = SS.length;
        var cw = Math.min(54, w / n);
        var ox = x0 + (w - cw * n) / 2;
        var k;
        tx('목표 합 = ' + SS_T, x0 + w / 2, top + 8, fs, P.text + 'ff', 'center', true);
        for (k = 0; k < n; k++) {
            var on = s.sel.indexOf(k) >= 0;
            rr(ox + k * cw + 4, top + 24, cw - 8, 34, 4, on ? P.teal + '44' : 'none', on ? P.teal + 'ff' : P.sub + 'aa', on ? 2.4 : 1.2);
            tx(String(SS[k]), ox + k * cw + cw / 2, top + 41, fs, on ? P.text + 'ff' : P.sub + 'ff', 'center', on);
        }
        var by = top + 78;
        var bw = w - 4;
        tx('탐색: 확인한 부분집합', x0 + 2, by, fs - 1, P.sub + 'ff', 'left', true);
        rr(x0 + 2, by + 10, bw, 12, 3, 'none', P.sub + '55', 1);
        if (s.checked > 0) rr(x0 + 2, by + 10, Math.max(4, bw * s.checked / (1 << n)), 12, 3, P.orange + '66', P.orange + 'ff', 1.4);
        var vy = by + 40;
        tx('검증: 덧셈 횟수', x0 + 2, vy, fs - 1, P.sub + 'ff', 'left', true);
        rr(x0 + 2, vy + 10, bw, 12, 3, 'none', P.sub + '55', 1);
        if (s.add > 0) rr(x0 + 2, vy + 10, Math.max(4, bw * s.add / (1 << n)), 12, 3, P.green + '66', P.green + 'ff', 1.4);
        drawCaps(s, x0, w, vy + 50, fs);
    }

    /* ===================== 환원 사슬 ===================== */
    function drawReduce(x0, top, w, mob, s) {
        var fs = mob ? 11.5 : 13;
        var bh = mob ? 24 : 28;
        var gap = mob ? 34 : 38;
        var cx = x0 + w * 0.3;
        var bw = Math.min(w * 0.48, 180);
        var sx = x0 + w * 0.64;
        var sw = w * 0.34;
        var k;
        var pos = [];
        for (k = 0; k < 8; k++) {
            if (k < 7) pos.push({ x: cx - bw / 2, y: top + 6 + k * gap, w: bw });
            else pos.push({ x: sx, y: top + 6 + 2 * gap, w: sw });
        }
        for (k = 1; k < RD.length; k++) {
            if (k >= s.upto) continue;
            var a = pos[RD[k].parent];
            var b = pos[k];
            if (k === 7) arrow(a.x + a.w, a.y + bh / 2, b.x - 2, b.y + bh / 2, P.purple + 'ff');
            else arrow(a.x + a.w / 2, a.y + bh, b.x + b.w / 2, b.y - 2, P.purple + 'ff');
        }
        for (k = 0; k < RD.length; k++) {
            var shown = k < s.upto;
            var cur = k === s.upto - 1;
            var p = pos[k];
            rr(p.x, p.y, p.w, bh, 4, shown ? P.teal + (cur ? '55' : '22') : 'none', shown ? P.teal + 'ff' : P.sub + '33', cur ? 2.6 : 1.3);
            tx(RD[k].name, p.x + p.w / 2, p.y + bh / 2, fs - 0.5, shown ? P.text + 'ff' : P.sub + 'aa', 'center', shown);
        }
        drawCaps(s, x0, w, top + 6 + 7 * gap + 8, fs);
    }

    /* ===================== P, NP, NP-난해의 포함 관계 ===================== */
    function ell(cx, cy, rx, ry, fill, stroke, lw) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        if (fill !== 'none') {
            ctx.fillStyle = fill;
            ctx.fill();
        }
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lw;
        ctx.stroke();
    }
    function drawClasses(x0, top, w, mob, s) {
        var fs = mob ? 11.5 : 13;
        var cy = top + 84;
        var ry = 70;
        var st = s.st;
        var npC = x0 + w * 0.4;
        var npR = w * 0.33;
        var nhC = x0 + w * 0.64;
        var nhR = w * 0.3;
        var pC = x0 + w * 0.22;
        var pR = w * 0.1;
        var pRy = 28;
        var pFill = P.teal + '22';
        var pStroke = P.teal + 'ff';
        var pLw = 1.6;
        var npFill = 'none';
        var npStroke = P.sub + 'cc';
        var npLw = 1.6;
        var cFill = 'none';
        if (st === 1) pLw = 3;
        if (st === 2) {
            npStroke = P.purple + 'ff';
            npLw = 3;
        }
        if (st === 3 || st === 4) cFill = P.orange + '33';
        if (st === 5 || st === 6) {
            pC = npC;
            pR = npR - 3;
            pRy = ry - 3;
            pFill = P.teal + '1a';
        }
        ell(nhC, cy, nhR, ry, 'none', P.sub + '88', 1.4);
        ell(npC, cy, npR, ry, npFill, npStroke, npLw);
        if (cFill !== 'none') {
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(npC, cy, npR, ry, 0, 0, Math.PI * 2);
            ctx.clip();
            ell(nhC, cy, nhR, ry, cFill, P.orange + 'ff', 2.4);
            ctx.restore();
        }
        ell(pC, cy, pR, pRy, pFill, pStroke, pLw);
        tx('P', st >= 5 ? x0 + w * 0.2 : pC, cy, fs, P.text + 'ff', 'center', true);
        tx('NP', x0 + w * 0.2, cy - ry + 14, fs, P.sub + 'ff', 'center', true);
        tx('NP-난해', x0 + w * 0.84, cy, fs - 1, P.sub + 'ff', 'center', true);
        tx('NP-완전', x0 + w * 0.53, cy, fs - 1, st === 3 || st === 4 ? P.orange + 'ff' : P.sub + 'ff', 'center', true);
        if (st === 4) tx('P 밖', x0 + w * 0.53, cy + 18, fs - 1, P.red + 'ff', 'center', true);
        if (st >= 5) tx('= P', x0 + w * 0.53, cy + 18, fs - 1, P.green + 'ff', 'center', true);
        drawCaps(s, x0, w, cy + ry + 26, fs);
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

        var dsStep = step || currentSteps()[0];
        if (dsStep.kind === 'reduce') drawReduce(padX, top, fullW, mob, dsStep);
        else if (dsStep.kind === 'cls') drawClasses(padX, top, fullW, mob, dsStep);
        else drawSS(padX, top, fullW, mob, dsStep);

        if (!step) {
            var hint = '아래 STEP으로 P와 NP, NP-완전의 관계를 확인하세요.';
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
        neededH = mob ? 330 : 370;
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
        if (mode === 'reduce') return '환원으로 NP-완전 문제가 서로 이어지는 모습을 따라갑니다.';
        if (mode === 'classes') return 'P, NP, NP-난해, NP-완전의 포함 관계를 단계별로 봅니다.';
        return '답을 찾는 일과 주어진 답을 검증하는 일의 비용 차이를 부분집합 합으로 봅니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('np-viz__speed-btn--active'); });
        btn.classList.add('np-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('np-viz__mode-btn--active', d.key === m); });
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