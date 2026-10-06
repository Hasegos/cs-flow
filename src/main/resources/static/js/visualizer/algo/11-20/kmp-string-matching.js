/**
 * KMP 문자열 검색 시각화
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
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
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
    function GW() { return canvas.width  / dpr; }
    function GH() { return canvas.height / dpr; }

    /* ===================== 팔레트 ===================== */
    var P = window.CsFlow.getP();

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
    var mode    = 'fail';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'search') return SEARCH_STEPS;
        if (mode === 'naive') return NAIVE_STEPS;
        return FAIL_STEPS;
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

    /* ===================== 공통: 문자열 겹쳐 그리기 ===================== */
    function drawKMP(x0, top, w, mob, step) {
        var s = step || kstep(mode === 'fail' ? PAT : TEXT, PAT, 0, -1, -1, null, 0, [], mode === 'fail' ? [0, -1, -1, -1, -1] : PI, -1, mode !== 'naive', '', '', '', '');
        var fs = mob ? 11.5 : 13;
        var lm = 22;
        var la = s.a.length;
        var span = mode === 'fail' ? 2 * NP - 1 : la;
        var cw = Math.min(36, (w - lm - 4) / span);
        var ox = x0 + lm + (w - lm - cw * span) / 2;
        var ch = mob ? 28 : 32;
        var yA = top + 22;
        var yB = yA + ch + 14;
        var k;
        var col = s.res === 'match' ? P.green : P.red;
        tx(mode === 'fail' ? 'P' : 'T', x0 + 8, yA + ch / 2, fs, P.sub + 'ff', 'center', true);
        tx('P', x0 + 8, yB + ch / 2, fs, P.sub + 'ff', 'center', true);
        function inFound(idx) {
            return s.found.some(function (f) { return idx >= f && idx < f + NP; });
        }
        for (k = 0; k < la; k++) {
            var bx = ox + k * cw;
            var on = k === s.ai;
            var tint = inFound(k) ? P.green + '55' : (s.matched > 0 && k >= s.off && k < s.off + s.matched) ? P.teal + '44' : 'none';
            tx(String(k), bx + cw / 2, yA - 9, fs - 2, P.sub + 'ff', 'center', false);
            rr(bx + 1, yA, cw - 2, ch, 3, tint, on ? col + 'ff' : P.sub + '88', on ? 2.8 : 1);
            tx(s.a.charAt(k), bx + cw / 2, yA + ch / 2, fs + 1, P.text + 'ff', 'center', true);
        }
        for (k = 0; k < s.b.length; k++) {
            var bx2 = ox + (s.off + k) * cw;
            var on2 = k === s.bj;
            var tint2 = k < s.matched ? P.teal + '44' : 'none';
            rr(bx2 + 1, yB, cw - 2, ch, 3, tint2, on2 ? col + 'ff' : P.sub + '88', on2 ? 2.8 : 1);
            tx(s.b.charAt(k), bx2 + cw / 2, yB + ch / 2, fs + 1, P.text + 'ff', 'center', true);
            tx(String(k), bx2 + cw / 2, yB + ch + 9, fs - 2, P.sub + 'ff', 'center', false);
        }
        var yP = yB + ch + 30;
        if (s.showPi) {
            var pw = Math.min(44, (w - 90) / NP);
            var px0 = x0 + (w - pw * NP) / 2;
            tx('π (실패 함수)', x0 + w / 2, yP, fs - 1, P.sub + 'ff', 'center', true);
            for (k = 0; k < NP; k++) {
                var cur = k === s.piCur;
                rr(px0 + k * pw + 1.5, yP + 10, pw - 3, 26, 3, cur ? P.yellow + '33' : 'none', cur ? P.yellow + 'ff' : P.sub + '88', cur ? 2.4 : 1);
                tx(PAT.charAt(k), px0 + k * pw + pw / 2, yP + 23, fs, P.text + 'ff', 'center', true);
                var v = s.pi[k];
                rr(px0 + k * pw + 1.5, yP + 38, pw - 3, 26, 3, v >= 0 ? P.teal + '22' : 'none', cur ? P.yellow + 'ff' : P.sub + '88', cur ? 2.4 : 1);
                tx(v < 0 ? '?' : String(v), px0 + k * pw + pw / 2, yP + 51, fs, v < 0 ? P.sub + 'ff' : P.green + 'ff', 'center', true);
            }
        }
        var at = yP + (s.showPi ? 86 : 10);
        if (s.cap) tx(s.cap, x0 + w / 2, at, fs - 0.5, P.yellow + 'ff', 'center', true);
        if (s.cap2) tx(s.cap2, x0 + w / 2, at + 19, fs - 1, P.text + 'ee', 'center', false);
        if (s.cap3) tx(s.cap3, x0 + w / 2, at + 38, fs - 1, P.green + 'ee', 'center', true);
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

        drawKMP(padX, top, fullW, mob, step);

        if (!step) {
            var hint = '아래 STEP으로 KMP 검색의 동작을 확인하세요.';
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
        neededH = mob ? 330 : 350;
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
        if (mode === 'search') return '텍스트 위치를 되돌리지 않고 패턴만 밀며 검색하는 KMP를 봅니다.';
        if (mode === 'naive') return '모든 위치에서 처음부터 비교하는 단순 검색과 KMP의 비교 횟수를 견줍니다.';
        return '패턴을 자기 자신에 겹쳐 밀며 실패 함수를 만드는 과정을 봅니다.';
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