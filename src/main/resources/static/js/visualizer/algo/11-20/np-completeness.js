/**
 * P vs NP / NP-완전 시각화 시각화
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
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
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
    function GW() { return canvas.width / dpr; }
    function GH() { return canvas.height / dpr; }

    var P = window.CsFlow.getP();

    /* ===================== 상태 ===================== */
    var mode    = 'verify';
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
    function currentSteps() {
        if (mode === 'reduce') return RD_STEPS;
        if (mode === 'classes') return CL_STEPS;
        return SS_STEPS;
    }
    function defaultLog() {
        if (mode === 'reduce') return '환원으로 NP-완전 문제가 서로 이어지는 모습을 따라갑니다.';
        if (mode === 'classes') return 'P, NP, NP-난해, NP-완전의 포함 관계를 단계별로 봅니다.';
        return '답을 찾는 일과 주어진 답을 검증하는 일의 비용 차이를 부분집합 합으로 봅니다.';
    }

    /* ===================== 공통: 보조 함수 ===================== */
    function ez(q) {
        q = clamp01(q);
        return q * q * (3 - 2 * q);
    }
    function fadeAmt(on, was, e) {
        if (on === was) return on ? 1 : 0;
        return on ? ez(e) : 1 - ez(e);
    }
    function commaNum(v) {
        return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
    function oval(cx, cy, rx, ry, fill, stroke, lw) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        if (fill !== 'none') { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke !== 'none') { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.4; ctx.stroke(); }
    }

    /* ===================== 레이아웃과 캡션 ===================== */
    function capTop(mob) {
        if (mode === 'reduce') return 14 + 7 * (mob ? 34 : 38);
        if (mode === 'classes') return 180;
        return 218;
    }
    function layout(w, mob) {
        return { fs: mob ? 11 : 13, lh: mob ? 15 : 17, capY: capTop(mob) };
    }
    function capRows(s, w, fs) {
        var rows = [];
        var parts = [[s.cap, 'yellow', true, fs], [s.cap2, 'text', false, fs - 1], [s.cap3, 'green', true, fs - 1]];
        parts.forEach(function (pt) {
            if (!pt[0]) return;
            lines(pt[0], w - 8, pt[3]).forEach(function (lt) { rows.push({ t: lt, c: pt[1], b: pt[2], f: pt[3] }); });
        });
        return rows;
    }
    function capH(w, mob) {
        var fs = mob ? 11 : 13;
        var mx = 0;
        currentSteps().forEach(function (st) { mx = Math.max(mx, capRows(st, w, fs).length); });
        return mx * (mob ? 15 : 17);
    }
    function sceneH(w, mob) {
        return layout(w, mob).capY + capH(w, mob) + 8;
    }
    function drawCap(rows, x0, w, y, lh) {
        rows.forEach(function (rw, ii) {
            tx(rw.t, x0 + w / 2, y + ii * lh, rw.f, colorOf(rw.c) + 'ff', 'center', rw.b);
        });
    }

    /* ===================== 부분집합 합: 탐색 대 검증 ===================== */
    function drawSs(x0, top, w, mob, s, p, e) {
        var L = layout(w, mob);
        var fs = L.fs, lh = L.lh;
        var n = SS.length;
        var total = 1 << n;
        var cw = Math.min(54, w / n);
        var ox = x0 + (w - cw * n) / 2;
        var last = SS_STEPS[SS_STEPS.length - 1];
        var gAmt = fadeAmt(s === last, p === last, e);
        var qa = ez(seg(e, 0, 0.5));
        var cq = ez(seg(e, 0, 0.5));
        var aq = ez(seg(e, 0.6, 1));
        var sumNow = sumOf(selVals(s.sel));
        var sumVal = Math.round(lerp(sumOf(selVals(p.sel)), sumNow, qa));
        var hit = s.sel.length > 0 && sumNow === SS_T;
        var vals = selVals(s.sel);
        var vel = s.add > 0 && s.add !== p.add;
        var chipY = top + 26, chH = 34;
        var sumCx = x0 + w / 2, sumY = top + 70, sbH = 28, sumCy = sumY + sbH / 2;
        var midY = top + 108;
        var k;

        tx('목표 합 = ' + SS_T, x0 + w / 2, top + 8, fs, colorOf('text') + 'ff', 'center', true);

        for (k = 0; k < n; k++) {
            var on1 = s.sel.indexOf(k) >= 0;
            var on0 = p.sel.indexOf(k) >= 0;
            var a = on1 === on0 ? (on1 ? 1 : 0) : (on1 ? qa : 1 - qa);
            var kx = ox + k * cw + 4, kw = cw - 8;
            var ky = chipY - a * 8;
            rr(kx, ky, kw, chH, 4, 'none', colorOf('sub') + 'aa', 1.2);
            if (a > 0) {
                ctx.globalAlpha = a;
                rr(kx, ky, kw, chH, 4, colorOf('teal') + '44', colorOf('teal') + 'ff', 2.4);
                ctx.globalAlpha = 1;
            }
            ctx.globalAlpha = vel && on1 ? 1 - seg(e, 0, 0.2) : 1;
            tx(String(SS[k]), kx + kw / 2, ky + chH / 2, fs, (a > 0.5 ? colorOf('text') : colorOf('sub')) + 'ff', 'center', a > 0.5);
            ctx.globalAlpha = 1;
        }

        rr(x0 + 2, sumY, w - 4, sbH, 6, hit ? colorOf('green') + '22' : 'none', hit ? colorOf('green') + 'ff' : colorOf('sub') + '88', hit ? 2 : 1.2);
        if (vel) {
            var tq = ez(seg(e, 0, 0.6));
            var tA = seg(e, 0, 0.2) * (1 - seg(e, 0.6, 1));
            if (tA > 0.001) {
                ctx.globalAlpha = tA;
                for (k = 0; k < s.sel.length; k++) {
                    var fx = lerp(ox + s.sel[k] * cw + cw / 2, sumCx + (k - (s.sel.length - 1) / 2) * 26, tq);
                    var fy = lerp(chipY - 8 + chH / 2, sumCy, tq);
                    rr(fx - 12, fy - 9, 24, 18, 4, colorOf('yellow') + 'ff', 'none', 1);
                    tx(String(SS[s.sel[k]]), fx, fy, fs - 1, '#111111ff', 'center', true);
                }
                ctx.globalAlpha = 1;
            }
        }
        var verifyTxt = s.add > 0;
        var boxTxt = verifyTxt ? vals.join(' + ') + ' = ' + sumNow : (vals.length ? setText(vals) : '공집합') + ' 합 = ' + sumVal;
        ctx.globalAlpha = vel ? seg(e, 0.55, 0.85) : 1;
        tx(boxTxt, sumCx, sumCy, fs, (hit ? colorOf('green') : colorOf('text')) + 'ff', 'center', true);
        ctx.globalAlpha = 1;

        var tallyA = 1 - gAmt;
        var tallyT = 1 - seg(gAmt, 0, 0.5);
        var growT = seg(gAmt, 0.5, 1);
        if (tallyA > 0.001) {
            var cv = lerp(p.checked, s.checked, cq);
            var av = lerp(p.add, s.add, aq);
            ctx.globalAlpha = tallyT;
            tx('탐색: 확인 ' + Math.round(cv) + ' / ' + total, x0 + 2, midY + 6, fs - 1, colorOf('sub') + 'ff', 'left', true);
            tx('검증: 덧셈 ' + Math.round(av) + '번', x0 + 2, midY + 40, fs - 1, colorOf('sub') + 'ff', 'left', true);
            ctx.globalAlpha = tallyA;
            rr(x0 + 2, midY + 14, w - 4, 10, 3, 'none', colorOf('sub') + '55', 1);
            if (cv > 0.5) rr(x0 + 2, midY + 14, Math.max(4, (w - 4) * cv / total), 10, 3, colorOf('orange') + '66', colorOf('orange') + 'ff', 1.4);
            rr(x0 + 2, midY + 48, w - 4, 10, 3, 'none', colorOf('sub') + '55', 1);
            if (av > 0.5) rr(x0 + 2, midY + 48, Math.max(4, (w - 4) * av / total), 10, 3, colorOf('green') + '66', colorOf('green') + 'ff', 1.4);
            ctx.globalAlpha = 1;
        }

        if (gAmt > 0.001) {
            var gns = [6, 20, 40];
            ctx.globalAlpha = growT;
            tx('막대 = 개수의 자릿수(log10)', x0 + 2, midY + 6, fs - 1, colorOf('sub') + 'ff', 'left', true);
            ctx.globalAlpha = 1;
            for (var gi = 0; gi < 3; gi++) {
                var cnt = Math.pow(2, gns[gi]);
                var frac = Math.log(cnt) / Math.log(Math.pow(2, 40));
                var rowY = midY + 22 + gi * 28;
                var gr = clamp01(gAmt * 1.5 - gi * 0.25);
                ctx.globalAlpha = growT;
                tx('n = ' + gns[gi] + '  ·  ' + commaNum(cnt) + '개', x0 + 2, rowY, fs - 1, colorOf('text') + 'ff', 'left', true);
                ctx.globalAlpha = gAmt;
                rr(x0 + 2, rowY + 10, w - 4, 8, 3, 'none', colorOf('sub') + '55', 1);
                if (gr > 0) rr(x0 + 2, rowY + 10, Math.max(4, (w - 4) * frac * gr), 8, 3, colorOf('purple') + '66', colorOf('purple') + 'ff', 1.2);
                ctx.globalAlpha = 1;
            }
        }

        drawCap(capRows(s, w, fs), x0, w, top + L.capY, lh);
    }

    /* ===================== 환원 사슬 ===================== */
    function rdEdge(k, pos, bh) {
        var a = pos[RD[k].parent];
        var b = pos[k];
        if (k === 7) return [a.x + a.w, a.y + bh / 2, b.x - 2, b.y + bh / 2];
        return [a.x + a.w / 2, a.y + bh, b.x + b.w / 2, b.y - 2];
    }
    function drawRd(x0, top, w, mob, s, p, e) {
        var L = layout(w, mob);
        var fs = L.fs, lh = L.lh;
        var bh = mob ? 24 : 28;
        var gap = mob ? 34 : 38;
        var cx = x0 + w * 0.3;
        var bw = Math.min(w * 0.48, 180);
        var sx = x0 + w * 0.64;
        var sw = w * 0.34;
        var last = RD_STEPS[RD_STEPS.length - 1];
        var fresh = p.upto < s.upto;
        var finalNow = s === last;
        var revDot = finalNow && p !== s;
        var pos = [];
        var k, j, oi;
        for (k = 0; k < RD.length; k++) {
            if (k < 7) pos.push({ x: cx - bw / 2, y: top + 6 + k * gap, w: bw });
            else pos.push({ x: sx, y: top + 6 + 2 * gap, w: sw });
        }

        for (k = 1; k < RD.length; k++) {
            if (k >= s.upto) continue;
            var ed = rdEdge(k, pos, bh);
            var f = fresh && k === s.upto - 1 ? ez(seg(e, 0, 0.5)) : 1;
            if (f < 1) {
                var ex = lerp(ed[0], ed[2], f), ey = lerp(ed[1], ed[3], f);
                ln(ed[0], ed[1], ex, ey, colorOf('purple') + 'ff', 1.6);
                circ(ex, ey, 3.5, colorOf('purple') + 'ff', 'none');
            } else {
                arrow(ed[0], ed[1], ed[2], ed[3], colorOf('purple') + 'ff', 1.6);
            }
        }

        var order = [7, 2, 1];
        for (oi = 0; oi < 3 && revDot; oi++) {
            var tt = seg(e, oi / 3, (oi + 1) / 3);
            if (tt <= 0 || tt >= 1) continue;
            var ed2 = rdEdge(order[oi], pos, bh);
            var dx = lerp(ed2[2], ed2[0], ez(tt)), dy = lerp(ed2[3], ed2[1], ez(tt));
            ln(ed2[0], ed2[1], ed2[2], ed2[3], colorOf('yellow') + 'ff', 2.4);
            circ(dx, dy, 4.5, colorOf('yellow') + 'ff', 'none');
        }

        for (j = 0; j < RD.length; j++) {
            var pj = pos[j];
            var shown = j < s.upto;
            var cur = j === s.upto - 1;
            var appear = shown ? (cur && fresh ? ez(seg(e, 0.35, 0.9)) : 1) : 0;
            rr(pj.x, pj.y, pj.w, bh, 4, 'none', colorOf('sub') + '33', 1.3);
            if (appear > 0) {
                ctx.globalAlpha = appear;
                rr(pj.x, pj.y, pj.w, bh, 4, colorOf('teal') + (cur ? '55' : '22'), colorOf('teal') + 'ff', cur ? 2.6 : 1.3);
                ctx.globalAlpha = 1;
            }
            tx(RD[j].name, pj.x + pj.w / 2, pj.y + bh / 2, fs, colorOf(shown ? 'text' : 'sub') + (shown ? 'ff' : 'aa'), 'center', shown);
        }

        var finA = finalNow ? (revDot ? seg(e, 0.8, 1) : 1) : 0;
        if (finA > 0.001) {
            ctx.globalAlpha = finA;
            tx('P = NP', sx + sw / 2, pos[0].y + bh / 2, fs, colorOf('green') + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        }

        drawCap(capRows(s, w, fs), x0, w, top + L.capY, lh);
    }

    /* ===================== P, NP, NP-난해의 포함 관계 ===================== */
    function drawCls(x0, top, w, mob, s, p, e) {
        var L = layout(w, mob);
        var fs = L.fs, lh = L.lh;
        var cy = top + 84, ry = 70;
        var npC = x0 + w * 0.4, npR = w * 0.33;
        var nhC = x0 + w * 0.64, nhR = w * 0.3;
        var q = p === s ? 1 : ez(e);
        var big = lerp(p.st >= 5 ? 1 : 0, s.st >= 5 ? 1 : 0, q);
        var pC = lerp(x0 + w * 0.22, npC, big);
        var pR = lerp(w * 0.1, npR - 3, big);
        var pRy = lerp(28, ry - 3, big);
        var pLw = lerp(p.st === 1 ? 3 : 1.6, s.st === 1 ? 3 : 1.6, q);
        var cut = lerp(p.st === 3 || p.st === 4 ? 1 : 0, s.st === 3 || s.st === 4 ? 1 : 0, q);
        var emph = lerp(p.st === 2 ? 1 : 0, s.st === 2 ? 1 : 0, q);

        oval(nhC, cy, nhR, ry, 'none', colorOf('sub') + '88', 1.4);
        oval(npC, cy, npR, ry, 'none', colorOf('sub') + 'cc', 1.6);
        if (emph > 0.001) {
            ctx.globalAlpha = emph;
            oval(npC, cy, npR, ry, 'none', colorOf('purple') + 'ff', 3);
            ctx.globalAlpha = 1;
        }
        if (cut > 0.001) {
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(npC, cy, npR, ry, 0, 0, Math.PI * 2);
            ctx.clip();
            ctx.globalAlpha = cut;
            oval(nhC, cy, nhR, ry, colorOf('orange') + '33', colorOf('orange') + 'ff', 2.4);
            ctx.restore();
        }
        oval(pC, cy, pR, pRy, colorOf('teal') + '22', colorOf('teal') + 'ff', pLw);

        tx('P', x0 + w * 0.2, cy, fs, colorOf('text') + 'ff', 'center', true);
        tx('NP', x0 + w * 0.3, cy - 50, fs, colorOf('sub') + 'ff', 'center', true);
        tx('NP-난해', x0 + w * 0.84, cy, fs - 1, colorOf('sub') + 'ff', 'center', true);
        tx('NP-완전', x0 + w * 0.53, cy, fs - 1, (s.st === 3 || s.st === 4 ? colorOf('orange') : colorOf('sub')) + 'ff', 'center', true);
        ctx.globalAlpha = fadeAmt(s.st === 4, p.st === 4, seg(e, 0, 0.5));
        tx('P 밖', x0 + w * 0.53, cy + 18, fs - 1, colorOf('red') + 'ff', 'center', true);
        ctx.globalAlpha = fadeAmt(s.st >= 5, p.st >= 5, seg(e, 0.5, 1));
        tx('= P', x0 + w * 0.53, cy + 18, fs - 1, colorOf('green') + 'ff', 'center', true);
        ctx.globalAlpha = 1;

        drawCap(capRows(s, w, fs), x0, w, top + L.capY, lh);
    }

    /* ===================== 장면 진입 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var s = step || currentSteps()[0];
        var p = prev || s;
        var e = clamp01(t);
        if (s.kind === 'ss') drawSs(x0, top, w, mob, s, p, e);
        else if (s.kind === 'reduce') drawRd(x0, top, w, mob, s, p, e);
        else drawCls(x0, top, w, mob, s, p, e);
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