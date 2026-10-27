/**
 * 포워드 / 리버스 프록시 시각화
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
    var root    = el('div', 'px-viz');
    var toolbar = el('div', 'px-viz__toolbar');
    var tbLeft  = el('div', 'px-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'px-viz__title', 'PROXY'));

    var modeWrap = el('div', 'px-viz__mode');
    var modeDefs = [
        { key: 'fwd', label: '포워드 프록시' },
        { key: 'rev', label: '리버스 프록시' },
        { key: 'cmp', label: '비교' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'px-viz__mode-btn' + (i === 0 ? ' px-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'px-viz__speed');
    speedWrap.appendChild(el('span', 'px-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
        var b = el('button', 'px-viz__speed-btn' + (i === 0 ? ' px-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'px-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'px-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'px-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'px-viz__controls');
    var btnPlay  = el('button', 'px-viz__btn px-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'px-viz__btn', '▶| STEP');
    var btnReset = el('button', 'px-viz__btn', '↺ RESET');
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
    var mode    = 'fwd';
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

    /* ===================== 데이터: 주소와 단계 ===================== */
    var C_IP = '10.0.0.5';
    var P_IN = '10.0.0.1';
    var P_OUT = '203.0.113.5';
    var S_IP = '198.51.100.20';
    var BLK = 'blocked.example';
    var R_CLIENT = '198.51.100.7';
    var RP = '203.0.113.10';
    var BA = '10.0.1.11';
    var BB = '10.0.1.12';

    var FWD_NODES = [
        { t: '클라이언트', s: C_IP, c: 'orange' },
        { t: '포워드 프록시', s: P_OUT, c: 'green' },
        { t: '외부 서버', s: S_IP, c: 'teal' }
    ];
    var REV_NODES = [
        { t: '클라이언트', s: R_CLIENT, c: 'orange' },
        { t: '리버스 프록시', s: RP, c: 'green' },
        { t: '백엔드 A', s: BA, c: 'teal' },
        { t: '백엔드 B', s: BB, c: 'purple' }
    ];

    var FWD_STEPS = [
        { a: [], hot: [], lines: [], lab: '', val: '', ver: '', vc: 'green',
          log: '포워드 프록시는 클라이언트 쪽에 놓여 클라이언트를 대신해 외부 서버에 요청을 보냅니다. 사내 클라이언트 ' + C_IP + '는 프록시(' + P_IN + ':3128)를 거치도록 설정되어 있고, 프록시의 외부 주소는 ' + P_OUT + '입니다.' },
        { a: [[0, 1, 'yellow']], hot: [1], lines: ['프록시 ' + P_IN + ':3128로 요청 전송', 'GET http://example.com/ HTTP/1.1'], lab: '프록시 설정', val: '클라이언트가 프록시를 지정', ver: '', vc: 'green',
          log: '클라이언트는 example.com 서버가 아니라 프록시로 요청을 보냅니다. 프록시로 보내는 HTTP 요청은 요청 줄에 전체 URL(http://example.com/)이 적힙니다.' },
        { a: [[1, 2, 'yellow']], hot: [1], lines: ['정책 확인: 허용 → 대신 요청', '출발지가 ' + P_OUT + '로 바뀜'], lab: '서버가 보는 요청자', val: P_OUT + ' (프록시)', ver: '허용 · 프록시가 대신 요청', vc: 'green',
          log: '프록시가 접속 규칙을 확인하고 허용된 요청을 외부 서버로 대신 보냅니다. 외부 서버에는 ' + P_OUT + '에서 온 요청으로 보이며, 프록시가 따로 알리지 않는 한 클라이언트 주소 ' + C_IP + '는 전달되지 않습니다.' },
        { a: [[2, 1, 'teal']], hot: [1], lines: ['서버 응답이 프록시로 돌아옴', '프록시가 응답을 캐시에 저장'], lab: '프록시 캐시', val: 'example.com/ 저장됨', ver: '', vc: 'green',
          log: '외부 서버의 응답이 프록시로 돌아옵니다. 프록시는 캐시할 수 있는 응답을 저장해 둡니다.' },
        { a: [[1, 0, 'teal']], hot: [1], lines: ['저장한 응답을 클라이언트에 전달', '클라이언트가 응답을 받음'], lab: '프록시 캐시', val: 'example.com/ 저장됨', ver: '', vc: 'green',
          log: '프록시가 응답을 클라이언트에 전달합니다. 클라이언트 입장에서는 프록시를 통해 원하는 페이지를 받은 것입니다.' },
        { a: [[0, 1, 'yellow'], [1, 0, 'teal']], hot: [1], lines: ['같은 URL 재요청: 캐시에 있음', '서버로는 요청을 보내지 않음'], lab: '프록시 캐시', val: '적중 · 서버 요청 없음', ver: '허용 · 캐시에서 응답', vc: 'green',
          log: '같은 URL을 다시 요청하면 캐시에 저장한 응답이 아직 유효할 때 프록시가 그 응답으로 바로 답합니다. 외부 서버까지 가지 않아 응답이 빠르고 외부 대역폭도 줄어듭니다.' },
        { a: [[0, 1, 'red']], hot: [1], lines: ['요청: http://' + BLK + '/', '정책: 이 도메인은 차단'], lab: '프록시 정책', val: BLK + ' 차단', ver: '차단 · 서버로 보내지 않음', vc: 'red',
          log: '차단 목록에 있는 도메인(' + BLK + ')으로 가는 요청은 프록시가 외부로 내보내지 않고 거절합니다. 모든 외부 요청이 프록시를 지나므로 접속 제어를 한 곳에서 할 수 있습니다.' },
        { a: [], hot: [1], lines: ['서버가 아는 것: 프록시의 주소', '접속 제어와 캐시는 프록시에서'], lab: '서버에 도달한 요청', val: '3개 중 1개', ver: '', vc: 'green',
          log: '정리 — 포워드 프록시는 클라이언트의 대리인입니다. 요청 3개 가운데 외부 서버에 도달한 것은 1개이고, 나머지는 캐시와 차단 정책이 프록시에서 처리했습니다.' }
    ];

    var REV_STEPS = [
        { a: [], hot: [], lines: [], lab: '', val: '', ver: '', vc: 'green',
          log: '리버스 프록시는 서버 쪽에 놓여 서버를 대신해 클라이언트의 요청을 받습니다. 클라이언트 ' + R_CLIENT + '가 아는 주소는 프록시 ' + RP + ' 하나이고, 그 뒤에 백엔드 서버 ' + BA + '와 ' + BB + '가 있습니다.' },
        { a: [[0, 1, 'yellow']], hot: [1], lines: ['HTTPS 요청 → ' + RP + ':443', '클라이언트가 아는 주소는 이것뿐'], lab: '클라이언트가 아는 주소', val: RP, ver: '', vc: 'green',
          log: '클라이언트는 도메인의 IP인 ' + RP + '로 요청을 보냅니다. 요청이 어느 백엔드 서버로 갈지는 클라이언트가 알지 못합니다.' },
        { a: [[0, 1, 'yellow']], hot: [1], lines: ['TLS 종료: 프록시가 복호화', '백엔드와는 HTTP로 통신 가능'], lab: '암호화 구간', val: '클라이언트 ↔ 프록시', ver: '', vc: 'green',
          log: '프록시가 HTTPS 연결을 끝맺고(TLS 종료) 요청을 복호화합니다. 인증서는 프록시에만 두면 되고, 사설망 안의 백엔드와는 HTTP로 통신할 수도 있습니다.' },
        { a: [[1, 2, 'yellow']], hot: [1, 2], lines: ['요청 1 → 백엔드 A ' + BA, '라운드 로빈으로 분배'], lab: '백엔드로 간 요청', val: 'A 1개 · B 0개', ver: '', vc: 'green',
          log: '프록시가 요청 1을 백엔드 A(' + BA + ')로 전달합니다. 프록시는 원래 클라이언트 주소 ' + R_CLIENT + '를 X-Forwarded-For 같은 헤더에 담아 백엔드에 알려 줄 수 있습니다.' },
        { a: [[1, 3, 'yellow']], hot: [1, 3], lines: ['요청 2 → 백엔드 B ' + BB, '다음 요청은 다른 서버로'], lab: '백엔드로 간 요청', val: 'A 1개 · B 1개', ver: '', vc: 'green',
          log: '다음 요청 2는 백엔드 B(' + BB + ')로 갑니다. 라운드 로빈은 서버를 번갈아 고르는 가장 단순한 분산 방식이며, nginx의 upstream 기본 방식도 라운드 로빈입니다.' },
        { a: [[2, 1, 'teal'], [1, 0, 'teal']], hot: [1], lines: ['응답이 프록시를 거쳐 돌아옴', '백엔드 주소는 보이지 않음'], lab: '클라이언트가 본 응답 출처', val: RP, ver: '', vc: 'green',
          log: '백엔드의 응답이 프록시를 거쳐 클라이언트로 돌아갑니다. 클라이언트는 응답이 ' + RP + '에서 왔다고만 알고, 백엔드의 주소와 대수는 알 수 없습니다.' },
        { a: [[0, 1, 'yellow'], [1, 0, 'teal']], hot: [1], lines: ['정적 파일 요청: 캐시에 있음', '백엔드로 보내지 않고 응답'], lab: '백엔드로 간 요청', val: 'A 1개 · B 1개 (그대로)', ver: '', vc: 'green',
          log: '캐시에 저장된 정적 파일이 아직 유효하면 프록시가 백엔드를 거치지 않고 바로 응답합니다. 백엔드 요청 수가 늘지 않아 서버 부하가 줄어듭니다.' },
        { a: [], hot: [1], lines: ['클라이언트에는 프록시 하나만 보임', '백엔드는 바꿔도 주소는 그대로'], lab: '백엔드에 도달한 요청', val: '3개 중 2개', ver: '', vc: 'green',
          log: '정리 — 리버스 프록시는 서버의 대리인입니다. 요청 3개 가운데 백엔드에 도달한 것은 2개이고, 클라이언트는 백엔드를 늘리거나 바꿔도 같은 주소로 접속합니다.' }
    ];

    var CMP_ROWS = [
        { name: '위치', fwd: '클라이언트 쪽', rev: '서버 쪽' },
        { name: '클라이언트는', fwd: '프록시를 지정함', rev: '프록시를 모름' },
        { name: '숨기는 것', fwd: '클라이언트의 IP', rev: '내부 서버 구조' },
        { name: '대표 용도', fwd: '접속 제어 · 캐시', rev: '부하 분산 · TLS' },
        { name: '대표 소프트웨어', fwd: 'Squid', rev: 'nginx, HAProxy' }
    ];
    var CMP_STEPS = [
        { k: 0, log: '포워드 프록시와 리버스 프록시는 같은 중계 서버이지만 어느 편을 대신하느냐가 다릅니다. 표를 한 줄씩 채우며 차이를 비교합니다.' },
        { k: 1, log: '위치 — 포워드 프록시는 클라이언트 쪽(사내망 등)에, 리버스 프록시는 서버 쪽(서비스 앞단)에 놓입니다.' },
        { k: 2, log: '설정 — 포워드 프록시는 보통 클라이언트가 프록시를 지정하거나 관리자가 설정합니다. 리버스 프록시는 클라이언트가 존재를 알 필요가 없고, 서버 운영자가 앞에 둡니다.' },
        { k: 3, log: '숨기는 것 — 포워드 프록시는 외부 서버에 대해 클라이언트의 주소를, 리버스 프록시는 클라이언트에 대해 내부 서버의 구조를 가립니다.' },
        { k: 4, log: '용도 — 포워드 프록시는 접속 제어, 캐시, 사용 기록에, 리버스 프록시는 부하 분산, TLS 종료, 캐시, 서버 보호에 많이 쓰입니다.' },
        { k: 5, log: '정리 — 클라이언트의 대리인이면 포워드, 서버의 대리인이면 리버스입니다. 이 구분은 프록시 소프트웨어가 아니라 놓인 위치와 역할로 정해집니다.' }
    ];

    /* ===================== 상태 ===================== */
    function currentSteps() {
        if (mode === 'rev') return REV_STEPS;
        if (mode === 'cmp') return CMP_STEPS;
        return FWD_STEPS;
    }
    function defaultLog() {
        if (mode === 'rev') return '서버 앞에서 요청을 받아 백엔드로 나눠 주는 리버스 프록시의 중계를 봅니다.';
        if (mode === 'cmp') return '포워드 프록시와 리버스 프록시의 차이를 표로 비교합니다.';
        return '클라이언트를 대신해 외부 서버에 요청하는 포워드 프록시의 중계를 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var lh = mob ? 15 : 17;
        var ph = lh * (mob ? 4 : 3) + 14;
        var py = 6 + 104 + 12;
        var ty = py + ph + 12;
        var total = mode === 'cmp' ? (mob ? 300 : 300) : ty + 24 + lh + 40;
        return { fs: mob ? 10.5 : 12, lh: lh, ph: ph, py: py, ty: ty, total: total };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    function fit(str, maxW, fs) {
        ctx.font = '500 ' + fs + 'px "JetBrains Mono",monospace';
        var out = str;
        while (out.length > 3 && ctx.measureText(out).width > maxW) out = '…' + out.slice(2);
        return out;
    }

    function backendCounts(idx) {
        var a = 0, b = 0;
        for (var i = 0; i <= idx; i++) {
            var m = /A (\d+)개 · B (\d+)개/.exec(REV_STEPS[i].val || '');
            if (m) { a = +m[1]; b = +m[2]; }
        }
        return [a, b];
    }

    /* ===================== 장면 ===================== */
    function drawFlow(x0, top, w, mob, s, p, e, fs, nodes, rev) {
        var bw = mob ? 78 : 120;
        var bh = rev ? 44 : 50;
        var areaH = 104;
        var xs = [x0, x0 + (w - bw) / 2, x0 + w - bw, x0 + w - bw];
        var ys, hs;
        if (rev) {
            ys = [top + 6 + (areaH - 50) / 2, top + 6 + (areaH - 50) / 2, top + 6, top + 6 + areaH - bh];
            hs = [50, 50, bh, bh];
        } else {
            ys = [top + 6 + (areaH - bh) / 2, top + 6 + (areaH - bh) / 2, top + 6 + (areaH - bh) / 2];
            hs = [bh, bh, bh];
        }
        var steps = currentSteps();
        var idx = steps.indexOf(s);
        var counts = rev ? backendCounts(idx) : null;
        var pcounts = rev ? backendCounts(steps.indexOf(p)) : null;
        nodes.forEach(function (n, i) {
            var c = P[n.c];
            var on = s.hot.indexOf(i) >= 0;
            var pon = p.hot.indexOf(i) >= 0;
            var ha = on && !pon ? seg(e, 0.4, 0.8) : 1;
            rr(xs[i], ys[i], bw, hs[i], 6, c + (on ? '30' : '18'), c + (on && ha > 0.3 ? 'ff' : 'aa'), on && ha > 0.3 ? 2 : 1.3);
            tx(mob ? n.t.replace(' 프록시', '') : n.t, xs[i] + bw / 2, ys[i] + hs[i] * 0.34, fs - (mob ? 1 : 0), c + 'ff', 'center', true);
            tx(fit(n.s, bw - 6, fs - 1.5), xs[i] + bw / 2, ys[i] + hs[i] * 0.72, fs - 1.5, P.sub + 'ff', 'center', false);
            if (rev && (i === 2 || i === 3)) {
                var cv = counts[i - 2], pv = pcounts[i - 2];
                if (cv > 0) {
                    var pop = cv !== pv ? ez(seg(e, 0.6, 0.9)) : 1;
                    circ(xs[i] + bw - 4, ys[i] + 2, 9 * pop, c + 'ff', 'none', 1);
                    if (pop > 0.6) tx(String(cv), xs[i] + bw - 4, ys[i] + 2, fs - 1.5, '#111111', 'center', true);
                }
            }
        });

        var sameA = JSON.stringify(s.a) === JSON.stringify(p.a);
        var n = s.a.length;
        var cpx = null;
        s.a.forEach(function (ar, ai) {
            var a = ar[0], b = ar[1];
            var fwdDir = xs[b] > xs[a];
            var off = fwdDir ? -6 : 6;
            var x1 = fwdDir ? xs[a] + bw : xs[a];
            var x2 = fwdDir ? xs[b] : xs[b] + bw;
            var y1 = ys[a] + hs[a] / 2 + off, y2 = ys[b] + hs[b] / 2 + off;
            var col = P[ar[2]] + 'ff';
            var u = sameA ? 1 : ez(seg(e, 0.05 + ai / n * 0.6, 0.05 + (ai + 1) / n * 0.6 + 0.1));
            var blocked = ar[2] === 'red';
            var ue = blocked ? Math.min(u, 0.55) : u;
            var xe = lerp(x1, x2, ue), ye = lerp(y1, y2, ue);
            if (u >= 1 && !blocked) arrow(x1, y1, x2, y2, col, 2.6);
            else if (ue > 0) ln(x1, y1, xe, ye, col, 2.6);
            if (u > 0 && u < 1) {
                var lab = ar[2] === 'teal' ? '응답' : '요청';
                if (Math.abs(x2 - x1) >= 60) {
                    var cwid = lab.length * 11 + 12;
                    rr(xe - cwid / 2, ye - 22, cwid, 18, 5, col, col, 1.2);
                    tx(lab, xe, ye - 13, fs - 1.5, '#111111', 'center', true);
                } else {
                    circ(xe, ye, 6, col, 'none', 1);
                }
            }
            if (blocked && u >= 0.55) {
                var xm = lerp(x1, x2, 0.55);
                var xa = sameA ? 1 : seg(e, 0.4, 0.7);
                ctx.globalAlpha = xa;
                ln(xm - 8, ye - 8, xm + 8, ye + 8, P.red + 'ff', 3.4);
                ln(xm - 8, ye + 8, xm + 8, ye - 8, P.red + 'ff', 3.4);
                ctx.globalAlpha = 1;
            }
        });
        if (!rev && s.lab && s.lab.indexOf('프록시 캐시') === 0) {
            var hit = (s.val || '').indexOf('적중') >= 0;
            var ta = s.lab === p.lab && s.val === p.val ? 1 : ez(seg(e, 0.5, 0.9));
            ctx.globalAlpha = ta;
            tx(hit ? '캐시 적중' : '캐시: example.com/', xs[1] + bw / 2, ys[1] + hs[1] + 12, fs - 1, (hit ? P.green : P.yellow) + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        } else if (!rev && s.lab === '프록시 정책') {
            ctx.globalAlpha = s.lab === p.lab ? 1 : ez(seg(e, 0.5, 0.9));
            tx('차단 목록: ' + BLK, xs[1] + bw / 2, ys[1] + hs[1] + 12, fs - 1, P.red + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        }

        var L = layout(w, mob);
        var lh = L.lh;
        var py0 = top + L.py;
        var same = s.lines.join('|') === p.lines.join('|');
        var ca = same ? 1 : ez(seg(e, 0.2, 0.6));
        rr(x0, py0, w, L.ph, 6, 'none', P.sub + '66', 1.2);
        tx('요청과 판단', x0 + 10, py0 + 12, fs - 1, P.sub + 'ff', 'left', true);
        if (s.lines.length) {
            ctx.globalAlpha = ca;
            var yy = py0 + 12 + lh;
            s.lines.forEach(function (l, i) {
                lines(l, w - 20, fs - 1).forEach(function (m) {
                    tx(m, x0 + 10, yy, fs - 1, (i === 0 ? P.text : P.yellow) + 'ff', 'left', false);
                    yy += lh;
                });
            });
            ctx.globalAlpha = 1;
        } else {
            tx('(아직 요청이 없습니다)', x0 + 10, py0 + 12 + lh, fs - 1, P.sub + 'ff', 'left', false);
        }
        var ty0 = top + L.ty;
        var th = 24 + lh;
        rr(x0, ty0, w, th, 6, 'none', P.sub + '66', 1.2);
        tx(s.lab || '확인할 값', x0 + 10, ty0 + 12, fs - 1, P.sub + 'ff', 'left', true);
        var va = s.val === p.val ? 1 : ez(seg(e, 0.4, 0.8));
        ctx.globalAlpha = s.val ? va : 1;
        tx(s.val || '(없음)', x0 + 10, ty0 + 12 + lh, fs - 1, (s.val ? P.green : P.sub) + 'ff', 'left', false);
        ctx.globalAlpha = 1;
        if (s.ver) {
            var vp = s.ver === p.ver ? 1 : ez(seg(e, 0.6, 0.95));
            var vc = P[s.vc];
            var label = '결과: ' + s.ver;
            var vw = Math.min(w, label.length * 10 + 24);
            ctx.globalAlpha = vp;
            rr(x0 + w / 2 - vw / 2 * vp, ty0 + th + 6, vw * vp, 24, 8, vc + '30', vc + 'ff', 1.8);
            if (vp > 0.7) tx(label, x0 + w / 2, ty0 + th + 18, fs - 0.5, vc + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        }
    }

    /* ===================== 비교 ===================== */
    function drawCompare(x0, top, w, mob, s, p, e, fs) {
        var k = s.k, pk = p.k;
        var gap = 8;
        var cw = (w - gap) / 2;
        var cols = [
            { key: 'fwd', title: '포워드 프록시', col: P.orange, x: x0, dir: -1 },
            { key: 'rev', title: '리버스 프록시', col: P.teal, x: x0 + cw + gap, dir: 1 }
        ];
        cols.forEach(function (c) {
            rr(c.x, top, cw, 24, 5, c.col + '25', c.col + 'ff', 1.6);
            tx(c.title, c.x + cw / 2, top + 12, fs, c.col + 'ff', 'center', true);
        });
        var y0 = top + 36;
        CMP_ROWS.forEach(function (r, i) {
            if (k < i + 1) return;
            var y = y0 + i * 50;
            var cur = k === i + 1;
            var fresh = cur && pk < k;
            var q = fresh ? ez(seg(e, 0, 0.55)) : 1;
            ctx.globalAlpha = fresh ? clamp01(e * 4) : 1;
            tx(r.name, x0, y, fs - 0.5, (cur ? P.text : P.sub) + 'ff', 'left', true);
            ctx.globalAlpha = q;
            cols.forEach(function (c) {
                var dx = (1 - q) * 40 * c.dir;
                rr(c.x + dx, y + 8, cw, 26, 5, c.col + (cur ? '30' : '18'), c.col + (cur ? 'ff' : '88'), cur ? 1.8 : 1.2);
                tx(r[c.key], c.x + cw / 2 + dx, y + 21, fs - 0.5, c.col + 'ff', 'center', true);
            });
            ctx.globalAlpha = 1;
        });
    }

    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var e = clamp01(t);
        var s = step || currentSteps()[0];
        var p = prev || s;
        if (mode === 'rev') drawFlow(x0, top, w, mob, s, p, e, L.fs, REV_NODES, true);
        else if (mode === 'cmp') drawCompare(x0, top, w, mob, s, p, e, L.fs);
        else drawFlow(x0, top, w, mob, s, p, e, L.fs, FWD_NODES, false);
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
        speedBtns.forEach(function (b) { b.classList.remove('px-viz__speed-btn--active'); });
        btn.classList.add('px-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('px-viz__mode-btn--active', d.key === m); });
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