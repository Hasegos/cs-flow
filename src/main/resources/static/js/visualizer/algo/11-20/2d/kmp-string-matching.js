/**
 * KMP 문자열 검색 시각화 시각화
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
    var root    = el('div', 'kmp-viz');
    var toolbar = el('div', 'kmp-viz__toolbar');
    var tbLeft  = el('div', 'kmp-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'kmp-viz__title', 'KMP STRING MATCHING'));

    var modeWrap = el('div', 'kmp-viz__mode');
    var modeDefs = [
        { key: 'fail', label: '실패 함수 만들기' },
        { key: 'search', label: 'KMP 검색' },
        { key: 'naive', label: '단순 검색과 비교' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'kmp-viz__mode-btn' + (i === 0 ? ' kmp-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'kmp-viz__speed');
    speedWrap.appendChild(el('span', 'kmp-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'kmp-viz__speed-btn' + (i === 0 ? ' kmp-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'kmp-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'kmp-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'kmp-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'kmp-viz__controls');
    var btnPlay  = el('button', 'kmp-viz__btn kmp-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'kmp-viz__btn', '▶| STEP');
    var btnReset = el('button', 'kmp-viz__btn', '↺ RESET');
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
    var mode    = 'fail';
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

    /* ===================== 엔진: KMP ===================== */
    var TEXT = 'ABABABCABABC';
    var PAT = 'ABABC';
    var NP = PAT.length;
    var PI = [0, 0, 1, 2, 0];
    function kstep(a, b, off, ai, bj, res, matched, found, pi, piCur, showPi, cap, cap2, cap3, log) {
        return { a: a, b: b, off: off, ai: ai, bj: bj, res: res, matched: matched, found: found.slice(), pi: pi.slice(), piCur: piCur, showPi: showPi, cap: cap, cap2: cap2, cap3: cap3, log: log };
    }
    function piText(pi) {
        return pi.map(function (v) { return v < 0 ? '?' : String(v); }).join(', ');
    }
    function ro(n) {
        return [0, 3, 6].indexOf(n % 10) >= 0 ? '으로' : '로';
    }
    function prefixText(n) {
        return n > 0 ? PAT.slice(0, n) : '(빈 문자열)';
    }

    /* ===================== 데이터: 실패 함수 만들기 ===================== */
    var FAIL_STEPS = [];
    (function () {
        var pi = [0, -1, -1, -1, -1];
        var j = 0;
        var i;
        FAIL_STEPS.push(kstep(PAT, PAT, 0, -1, -1, null, 0, [], pi, 0, true, '실패 함수 π 계산', 'π[i] = 앞 i+1글자에서 접두사 = 접미사인 최대 길이', '', 'KMP는 패턴 ' + PAT + '의 실패 함수(π 배열)를 먼저 만듭니다. π[i]는 패턴의 앞 ' + 'i+1글자에서, 자기 자신을 제외하고 접두사이면서 접미사이기도 한 가장 긴 문자열의 길이입니다. 패턴을 자기 자신의 위에 겹쳐 밀면서 구합니다. π[0]은 항상 0입니다.'));
        i = 1;
        while (i < NP) {
            var ok = PAT.charAt(i) === PAT.charAt(j);
            if (ok) {
                var before = j;
                j++;
                pi[i] = j;
                FAIL_STEPS.push(kstep(PAT, PAT, i - before, i, before, 'match', before, [], pi, i, true, 'P[' + i + '] = P[' + before + '] → 일치', 'π[' + i + '] = ' + j, '', 'P[' + i + '] = ' + PAT.charAt(i) + '와 P[' + before + '] = ' + PAT.charAt(before) + '를 비교합니다. 같으므로 접두사 ' + prefixText(j) + '가 접미사와도 겹치는 길이가 ' + j + ro(j) + ' 늘어납니다. π[' + i + '] = ' + j + '.'));
                i++;
            } else if (j > 0) {
                var back = PI[j - 1];
                FAIL_STEPS.push(kstep(PAT, PAT, i - j, i, j, 'miss', j, [], pi, i, true, 'P[' + i + '] ≠ P[' + j + '] → 불일치', 'j를 줄임: ' + j + ' → ' + back, '', 'P[' + i + '] = ' + PAT.charAt(i) + '와 P[' + j + '] = ' + PAT.charAt(j) + '를 비교하니 다릅니다. 지금까지 겹친 ' + prefixText(j) + '보다 짧은 접두사 중에서 접미사와 겹치는 가장 긴 것을 π[' + (j - 1) + '] = ' + back + '이 알려 주므로 j를 ' + back + ro(back) + ' 줄이고 다시 비교합니다.'));
                j = back;
            } else {
                pi[i] = 0;
                FAIL_STEPS.push(kstep(PAT, PAT, i, i, 0, 'miss', 0, [], pi, i, true, 'P[' + i + '] ≠ P[0] → 불일치', 'π[' + i + '] = 0', '', 'P[' + i + '] = ' + PAT.charAt(i) + '와 P[0] = ' + PAT.charAt(0) + '를 비교하니 다르고 더 줄일 접두사도 없습니다. 겹치는 부분이 없으므로 π[' + i + '] = 0입니다.'));
                i++;
            }
        }
        FAIL_STEPS.push(kstep(PAT, PAT, 0, -1, -1, null, 0, [], pi, -1, true, 'π = [' + piText(pi) + ']', '패턴 길이 ' + NP + '만큼만 한 번 훑음', '', '정리 — ' + PAT + '의 실패 함수는 [' + piText(pi) + ']입니다. ABAB에서 AB가 접두사이자 접미사라 π[3] = 2입니다. 위치 i를 한 번씩만 지나고 j는 늘어난 만큼만 줄어들므로 계산은 O(m)입니다.'));
    })();

    /* ===================== 데이터: KMP 검색 ===================== */
    var SEARCH_STEPS = [];
    var KMP_CMP = 0;
    (function () {
        var found = [];
        var j = 0;
        var i = 0;
        var cmp = 0;
        SEARCH_STEPS.push(kstep(TEXT, PAT, 0, -1, -1, null, 0, found, PI, -1, true, '텍스트 ' + TEXT + ' 에서 ' + PAT + ' 찾기', '텍스트 길이 ' + TEXT.length + ', 패턴 길이 ' + NP, '', 'KMP 검색은 텍스트 위치 i와 패턴 위치 j를 함께 움직입니다. 글자가 같으면 둘 다 한 칸 전진하고, 다르면 텍스트 위치 i는 그대로 두고 j만 π[j-1]로 줄여 패턴을 밀어 줍니다. 이미 맞춘 글자를 다시 비교하지 않는 것이 핵심입니다.'));
        while (i < TEXT.length) {
            var ok = TEXT.charAt(i) === PAT.charAt(j);
            cmp++;
            if (ok) {
                var jb = j;
                j++;
                if (j === NP) {
                    var s = i - NP + 1;
                    found.push(s);
                    var nj = PI[NP - 1];
                    SEARCH_STEPS.push(kstep(TEXT, PAT, i - jb, i, jb, 'match', jb, found, PI, NP - 1, true, '일치 발견: 위치 ' + s, '비교 ' + cmp + '번째 · j: ' + NP + ' → ' + nj, '', 'T[' + i + '] = ' + TEXT.charAt(i) + '와 P[' + jb + '] = ' + PAT.charAt(jb) + '가 같고 패턴을 모두 맞췄습니다. 위치 ' + s + '에서 일치하는 구간을 찾았습니다. 이어서 겹치는 일치도 찾도록 j를 π[' + (NP - 1) + '] = ' + nj + ro(nj) + ' 줄이고 i는 앞으로 갑니다.'));
                    j = nj;
                } else {
                    SEARCH_STEPS.push(kstep(TEXT, PAT, i - jb, i, jb, 'match', jb, found, PI, -1, true, 'T[' + i + '] = P[' + jb + '] → 일치', '비교 ' + cmp + '번째 · i = ' + (i + 1) + ', j = ' + j, '', 'T[' + i + '] = ' + TEXT.charAt(i) + '와 P[' + jb + '] = ' + PAT.charAt(jb) + '가 같습니다. i와 j를 각각 한 칸 전진합니다.'));
                }
                i++;
            } else if (j > 0) {
                var nj2 = PI[j - 1];
                SEARCH_STEPS.push(kstep(TEXT, PAT, i - j, i, j, 'miss', j, found, PI, j - 1, true, 'T[' + i + '] ≠ P[' + j + '] → 불일치', '비교 ' + cmp + '번째 · j: ' + j + ' → ' + nj2, '', 'T[' + i + '] = ' + TEXT.charAt(i) + '와 P[' + j + '] = ' + PAT.charAt(j) + '가 다릅니다. 앞의 ' + j + '글자 ' + prefixText(j) + '는 이미 맞춰 봤으므로 π[' + (j - 1) + '] = ' + nj2 + '이 알려 주는 길이만큼은 다시 비교하지 않습니다. i는 그대로 두고 j를 ' + nj2 + ro(nj2) + ' 줄여 패턴을 밀어 줍니다.'));
                j = nj2;
            } else {
                SEARCH_STEPS.push(kstep(TEXT, PAT, i, i, 0, 'miss', 0, found, PI, -1, true, 'T[' + i + '] ≠ P[0] → 불일치', '비교 ' + cmp + '번째 · i = ' + (i + 1) + ', j = 0', '', 'T[' + i + '] = ' + TEXT.charAt(i) + '와 P[0] = ' + PAT.charAt(0) + '가 다르고 줄일 j도 없습니다. i만 한 칸 전진합니다.'));
                i++;
            }
        }
        KMP_CMP = cmp;
        SEARCH_STEPS.push(kstep(TEXT, PAT, 0, -1, -1, null, 0, found, PI, -1, true, '검색 끝: 일치 위치 ' + found.join(', '), '글자 비교 ' + cmp + '번', '', '정리 — 텍스트를 한 번만 훑으며 글자를 ' + cmp + '번 비교해 위치 ' + found.join(', ') + '에서 일치를 찾았습니다. 텍스트 위치 i는 한 번도 뒤로 가지 않았고, 비교는 O(n)번입니다. 실패 함수 계산 O(m)을 더해 전체 O(n + m)입니다.'));
    })();

    /* ===================== 데이터: 단순 검색과 비교 ===================== */
    var NAIVE_STEPS = [];
    (function () {
        var found = [];
        var cmp = 0;
        var s;
        NAIVE_STEPS.push(kstep(TEXT, PAT, 0, -1, -1, null, 0, found, PI, -1, false, '단순 검색: 모든 위치에서 처음부터 비교', '시작 위치 ' + (TEXT.length - NP + 1) + '곳', '', '단순한 방법은 패턴을 텍스트의 모든 시작 위치에 맞대 보며, 매번 패턴의 처음부터 글자를 비교합니다. 불일치가 나면 한 칸만 밀고 처음부터 다시 비교합니다. 같은 텍스트와 패턴으로 KMP와 비교 횟수를 견줍니다.'));
        for (s = 0; s + NP <= TEXT.length; s++) {
            var k = 0;
            while (k < NP && TEXT.charAt(s + k) === PAT.charAt(k)) {
                k++;
                cmp++;
            }
            var hit = k === NP;
            if (!hit) cmp++;
            if (hit) found.push(s);
            NAIVE_STEPS.push(kstep(TEXT, PAT, s, hit ? -1 : s + k, hit ? -1 : k, hit ? 'match' : 'miss', k, found, PI, -1, false, '시작 위치 ' + s + ': ' + (hit ? NP + '글자 모두 일치' : (k + 1) + '번째 글자에서 불일치'), '누적 비교 ' + cmp + '번', '', '시작 위치 ' + s + '에서 패턴을 맞대 비교합니다. ' + (hit ? '앞에서부터 ' + NP + '글자가 모두 같아 일치입니다.' : '앞의 ' + k + '글자는 같고 ' + (k + 1) + '번째에서 T[' + (s + k) + '] = ' + TEXT.charAt(s + k) + '와 P[' + k + '] = ' + PAT.charAt(k) + '가 달라 멈춥니다.') + ' 한 칸 밀면 지금까지 비교한 글자를 처음부터 다시 비교합니다. 누적 비교 ' + cmp + '번.'));
        }
        NAIVE_STEPS.push(kstep(TEXT, PAT, 0, -1, -1, null, 0, found, PI, -1, false, '단순 ' + cmp + '번 vs KMP ' + KMP_CMP + '번', '일치 위치는 같음: ' + found.join(', '), '', '정리 — 같은 텍스트에서 단순 검색은 글자를 ' + cmp + '번, KMP는 ' + KMP_CMP + '번 비교했고 찾은 위치는 ' + found.join(', ') + '로 같습니다. 단순 검색은 최악에 O(n × m)이지만 KMP는 O(n + m)입니다. 이 예시는 짧아서 차이가 작고, 같은 글자가 길게 반복되는 입력에서 차이가 크게 벌어집니다.'));
    })();

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'search') return SEARCH_STEPS;
        if (mode === 'naive') return NAIVE_STEPS;
        return FAIL_STEPS;
    }
    function defaultLog() {
        if (mode === 'search') return '텍스트 위치를 되돌리지 않고 패턴만 밀며 검색하는 KMP를 봅니다.';
        if (mode === 'naive') return '모든 위치에서 처음부터 비교하는 단순 검색과 KMP의 비교 횟수를 견줍니다.';
        return '패턴을 자기 자신에 겹쳐 밀며 실패 함수를 만드는 과정을 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    var kpLayMemo = {};
    function ez(q) {
        q = clamp01(q);
        return q * q * (3 - 2 * q);
    }
    function kpFs(mob) {
        if (mob) return { body: 11.5, small: 11 };
        return { body: 13, small: 12 };
    }
    function kpSpan() {
        return mode === 'fail' ? 2 * NP - 1 : TEXT.length + NP - 1;
    }
    function kpCapParts(s, w, S) {
        var out = [];
        if (s.cap) lines(s.cap, w - 8, S.body).forEach(function (str) { out.push({ t: str, c: P.yellow + 'ff', b: true, f: S.body }); });
        if (s.cap2) lines(s.cap2, w - 8, S.small).forEach(function (str) { out.push({ t: str, c: P.text + 'ee', b: false, f: S.small }); });
        if (s.cap3) lines(s.cap3, w - 8, S.small).forEach(function (str) { out.push({ t: str, c: P.green + 'ff', b: true, f: S.small }); });
        return out;
    }
    function kpCapH(w, S) {
        var mx = 0;
        currentSteps().forEach(function (s) {
            var h = 0;
            kpCapParts(s, w, S).forEach(function (pt) { h += pt.f + 5; });
            if (h > mx) mx = h;
        });
        return mx;
    }
    function layout(w, mob) {
        var key = mode + '|' + Math.round(w) + (mob ? 'm' : 'd');
        if (kpLayMemo[key]) return kpLayMemo[key];
        var S = kpFs(mob);
        var gut = mob ? 14 : 22;
        var span = kpSpan();
        var cw = Math.min(mob ? 30 : 40, (w - gut - 4) / span);
        var ch = mob ? 26 : 32;
        var yA = 18;
        var yB = yA + ch + 24;
        var bodyEnd = yB + ch + 16;
        var L = { S: S, gut: gut, span: span, cw: cw, ch: ch, yA: yA, yB: yB, piLbl: 0, piRow1: 0, piRow2: 0, barTop: 0, blockEnd: 0, capTop: 0, total: 0 };
        if (mode === 'naive') {
            L.barTop = bodyEnd + 6;
            L.blockEnd = L.barTop + 66;
        } else {
            L.piLbl = bodyEnd + 4;
            L.piRow1 = L.piLbl + 18;
            L.piRow2 = L.piRow1 + 24;
            L.blockEnd = L.piRow2 + 26;
        }
        L.capTop = L.blockEnd + 8;
        L.total = L.capTop + kpCapH(w, S) + 8;
        kpLayMemo[key] = L;
        return L;
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    /* ===================== 그리기 헬퍼 ===================== */
    function kpInWin(arr, k) {
        return arr.some(function (f) { return k >= f && k < f + NP; });
    }
    function kpHi(x, y, cw, ch, col, a) {
        if (a <= 0) return;
        ctx.globalAlpha = a;
        rr(x + 1, y, cw - 2, ch, 3, 'none', col, 2.6);
        ctx.globalAlpha = 1;
    }
    function kpCum(steps, idx) {
        var sum = 0;
        var q;
        for (q = 1; q <= idx; q++) sum += steps[q].matched + (steps[q].res === 'miss' ? 1 : 0);
        return sum;
    }
    function kpPi(x0, top, w, L, now, pv, fresh, e) {
        var S = L.S;
        var pw = Math.min(44, (w - 90) / NP);
        var px0 = x0 + (w - pw * NP) / 2;
        var r1 = top + L.piRow1;
        var r2 = top + L.piRow2;
        var piChg = fresh && pv.piCur !== now.piCur;
        var k;
        function frame(idx, a) {
            if (idx < 0 || a <= 0) return;
            ctx.globalAlpha = a;
            rr(px0 + idx * pw + 1, r1 - 3, pw - 2, r2 - r1 + 28, 4, 'none', P.yellow + 'ff', 2.2);
            ctx.globalAlpha = 1;
        }
        tx('π (실패 함수)', x0 + w / 2, top + L.piLbl + 7, S.small, P.sub + 'ff', 'center', true);
        frame(pv.piCur, piChg ? 1 - ez(seg(e, 0, 0.4)) : 0);
        frame(now.piCur, piChg ? ez(seg(e, 0.3, 0.8)) : 1);
        for (k = 0; k < NP; k++) {
            var px = px0 + k * pw;
            var v = now.pi[k];
            var vOld = pv.pi[k];
            var changed = fresh && vOld !== v;
            rr(px + 1.5, r1, pw - 3, 22, 3, 'none', P.sub + '88', 1);
            tx(PAT.charAt(k), px + pw / 2, r1 + 11, S.body, P.text + 'ff', 'center', true);
            rr(px + 1.5, r2, pw - 3, 22, 3, v >= 0 ? P.teal + '22' : 'none', P.sub + '88', 1);
            if (changed) {
                ctx.globalAlpha = 1 - ez(seg(e, 0, 0.4));
                tx(vOld < 0 ? '?' : String(vOld), px + pw / 2, r2 + 11, S.body, P.sub + 'ff', 'center', true);
            }
            ctx.globalAlpha = changed ? ez(seg(e, 0.4, 0.9)) : 1;
            tx(v < 0 ? '?' : String(v), px + pw / 2, r2 + 11, S.body, (v < 0 ? P.sub : P.green) + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        }
    }
    function kpBars(x0, top, w, L, now, fresh, e) {
        var S = L.S;
        var steps = currentSteps();
        var idx = steps.indexOf(now);
        var vNow = kpCum(steps, idx);
        var vPrev = fresh ? kpCum(steps, idx - 1) : vNow;
        var v = fresh ? lerp(vPrev, vNow, ez(seg(e, 0.1, 0.9))) : vNow;
        var maxV = Math.max(kpCum(steps, steps.length - 1), KMP_CMP, 1);
        var b1 = top + L.barTop;
        var b2 = b1 + 36;
        tx('단순 검색 ' + Math.round(v) + '번', x0, b1 + 8, S.small, P.text + 'ff', 'left', true);
        rr(x0, b1 + 18, w, 10, 3, 'none', P.sub + '33', 1);
        rr(x0, b1 + 18, w * v / maxV, 10, 3, P.orange + 'aa', P.orange + 'ff', 1.2);
        tx('KMP 검색 ' + KMP_CMP + '번', x0, b2 + 8, S.small, P.text + 'ff', 'left', true);
        rr(x0, b2 + 18, w, 10, 3, 'none', P.sub + '33', 1);
        rr(x0, b2 + 18, w * KMP_CMP / maxV, 10, 3, P.teal + 'aa', P.teal + 'ff', 1.2);
    }

    /* ===================== 장면 진입점 ===================== */
    function drawScene(x0, top, w, mob, step, prev, t) {
        var e = clamp01(t);
        var now = step || currentSteps()[0];
        var pv = prev || now;
        var fresh = now !== pv;
        var L = layout(w, mob);
        var S = L.S;
        var cw = L.cw;
        var ox = x0 + L.gut + (w - L.gut - 4 - cw * L.span) / 2;
        var yA = top + L.yA;
        var yB = top + L.yB;
        var offCur = fresh ? lerp(pv.off, now.off, ez(seg(e, 0, 0.7))) : now.off;
        var colNow = now.res === 'match' ? P.green : (now.res === 'miss' ? P.red : P.purple);
        var newWin = fresh && now.found.length > pv.found.length ? now.found[now.found.length - 1] : -1;
        var k;
        var x;
        var tint;
        function cellX(idx) { return ox + idx * cw; }

        tx(mode === 'fail' ? 'P' : 'T', x0 + L.gut / 2, yA + L.ch / 2, S.small, P.sub + 'ff', 'center', true);
        for (k = 0; k < now.a.length; k++) {
            x = cellX(k);
            tint = 'none';
            if (kpInWin(now.found, k)) tint = P.green + '55';
            else if (now.matched > 0 && k >= now.off && k < now.off + now.matched) tint = P.teal + '44';
            rr(x + 1, yA, cw - 2, L.ch, 3, tint, P.sub + '88', 1);
            if (k === now.ai) kpHi(x, yA, cw, L.ch, colNow + 'ff', 1);
            if (cw >= 15 || k === now.ai) tx(String(k), x + cw / 2, yA - 9, S.small, (k === now.ai ? colNow : P.sub) + 'ff', 'center', k === now.ai);
            tx(now.a.charAt(k), x + cw / 2, yA + L.ch / 2, S.body, P.text + 'ff', 'center', true);
        }
        if (newWin >= 0) {
            ctx.globalAlpha = ez(seg(e, 0.3, 0.9));
            rr(cellX(newWin) + 1, yA - 2, NP * cw - 2, L.ch + 4, 4, 'none', P.green + 'ff', 2.4);
            ctx.globalAlpha = 1;
        }
        if (fresh && pv.ai >= 0 && pv.ai !== now.ai) kpHi(cellX(pv.ai), yA, cw, L.ch, P.purple + 'ff', 1 - ez(seg(e, 0, 0.5)));

        tx('P', x0 + L.gut / 2, yB + L.ch / 2, S.small, P.sub + 'ff', 'center', true);
        for (k = 0; k < now.b.length; k++) {
            x = cellX(offCur + k);
            rr(x + 1, yB, cw - 2, L.ch, 3, k < now.matched ? P.teal + '44' : 'none', P.sub + '88', 1);
            if (k === now.bj) kpHi(x, yB, cw, L.ch, colNow + 'ff', 1);
            tx(now.b.charAt(k), x + cw / 2, yB + L.ch / 2, S.body, P.text + 'ff', 'center', true);
            tx(String(k), x + cw / 2, yB + L.ch + 9, S.small, P.sub + 'ff', 'center', false);
        }

        if (now.res && now.ai >= 0 && now.bj >= 0) {
            var fa = fresh ? ez(seg(e, 0.35, 0.85)) : 1;
            var x1 = cellX(now.ai) + cw / 2;
            var x2 = cellX(offCur + now.bj) + cw / 2;
            var y1 = yA + L.ch;
            var my = (y1 + yB) / 2;
            ctx.globalAlpha = fa;
            ln(x1, y1, x2, yB, colNow + 'ff', 1.6, [4, 3]);
            circ((x1 + x2) / 2, my, 8, colNow + '33', colNow + 'ff', 1.4);
            tx(now.res === 'match' ? '=' : '≠', (x1 + x2) / 2, my, S.body, colNow + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        }

        if (mode === 'naive') kpBars(x0, top, w, L, now, fresh, e);
        else kpPi(x0, top, w, L, now, pv, fresh, e);

        var parts = kpCapParts(now, w, S);
        var cy = top + L.capTop;
        ctx.globalAlpha = fresh ? 0.35 + 0.65 * ez(e) : 1;
        parts.forEach(function (pt) {
            tx(pt.t, x0 + w / 2, cy + (pt.f + 5) / 2, pt.f, pt.c, 'center', pt.b);
            cy += pt.f + 5;
        });
        ctx.globalAlpha = 1;
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
        speedBtns.forEach(function (b) { b.classList.remove('kmp-viz__speed-btn--active'); });
        btn.classList.add('kmp-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('kmp-viz__mode-btn--active', d.key === m); });
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