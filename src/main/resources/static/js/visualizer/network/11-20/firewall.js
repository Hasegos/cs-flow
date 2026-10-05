/**
 * 방화벽 패킷 필터링 시각화
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
    var root    = el('div', 'fw-viz');
    var toolbar = el('div', 'fw-viz__toolbar');
    var tbLeft  = el('div', 'fw-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'fw-viz__title', 'FIREWALL'));

    var modeWrap = el('div', 'fw-viz__mode');
    var modeDefs = [
        { key: 'rules', label: '규칙 매칭' },
        { key: 'stateful', label: '상태 추적' },
        { key: 'policy', label: '기본 정책' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'fw-viz__mode-btn' + (i === 0 ? ' fw-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'fw-viz__speed');
    speedWrap.appendChild(el('span', 'fw-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'fw-viz__speed-btn' + (i === 0 ? ' fw-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'fw-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'fw-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'fw-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'fw-viz__controls');
    var btnPlay  = el('button', 'fw-viz__btn fw-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'fw-viz__btn', '▶| STEP');
    var btnReset = el('button', 'fw-viz__btn', '↺ RESET');
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

    /* ===================== 데이터: 규칙과 패킷 ===================== */
    var SRV_IP = '203.0.113.10';
    function ipInt(s) {
        var p = s.split('.');
        return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
    }
    function inCidr(ip, base, bits) {
        var mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0;
        return (ipInt(ip) & mask) === (ipInt(base) & mask);
    }
    var RULES = [
        { action: 'allow', text: 'tcp  출발지 10.0.0.0/8  포트 22', test: function (p) { return p.proto === 'tcp' && inCidr(p.src, '10.0.0.0', 8) && p.port === 22; } },
        { action: 'allow', text: 'tcp  모든 출발지  포트 443', test: function (p) { return p.proto === 'tcp' && p.port === 443; } },
        { action: 'deny', text: 'tcp  모든 출발지  포트 23', test: function (p) { return p.proto === 'tcp' && p.port === 23; } },
        { action: 'deny', text: '그 외 모든 패킷 (기본 거부)', test: function () { return true; } }
    ];
    var PKTS = [
        { proto: 'tcp', src: '10.0.0.7', port: 22, note: '내부에서 SSH' },
        { proto: 'tcp', src: '198.51.100.9', port: 22, note: '외부에서 SSH' },
        { proto: 'tcp', src: '198.51.100.9', port: 443, note: '외부에서 HTTPS' },
        { proto: 'tcp', src: '198.51.100.9', port: 23, note: '외부에서 텔넷' },
        { proto: 'udp', src: '198.51.100.9', port: 53, note: '외부에서 UDP 53' }
    ];
    function judge(p) {
        for (var i = 0; i < RULES.length; i++) {
            if (RULES[i].test(p)) return { idx: i, action: RULES[i].action };
        }
        return { idx: RULES.length - 1, action: 'deny' };
    }
    function pktText(p) { return p.proto + ' ' + p.src + ' → ' + SRV_IP + ':' + p.port; }

    var RULE_STEPS = [
        { pk: -1, log: '방화벽은 규칙 목록을 위에서부터 차례로 비교해 처음 일치하는 규칙의 동작(허용 또는 차단)을 적용합니다. 패킷 헤더의 프로토콜, 출발지 IP, 목적지 포트 같은 값을 규칙과 견줍니다. 서버 ' + SRV_IP + '를 지키는 방화벽에 패킷 5개가 차례로 도착합니다.' }
    ];
    PKTS.forEach(function (p, i) {
        var j = judge(p);
        var verdict = j.action === 'allow' ? '허용' : '차단';
        var why = j.idx === RULES.length - 1 ? '앞의 규칙이 모두 일치하지 않아 마지막 기본 거부 규칙에 걸려 ' : (j.idx + 1) + '번 규칙에 일치해 ';
        RULE_STEPS.push({ pk: i, log: '패킷 ' + (i + 1) + ' (' + p.note + ') ' + pktText(p) + ' — ' + why + verdict + '됩니다.' });
    });
    RULE_STEPS.push({ pk: -2, log: '정리 — 규칙은 위에서부터 처음 일치하는 것이 적용되므로 순서가 중요합니다. 어떤 규칙에도 일치하지 않는 패킷은 마지막의 기본 거부로 차단됩니다. 필요한 것만 허용하고 나머지를 막는 방식입니다.' });

    var CLIENT_IP = '192.168.0.10';
    var REMOTE_IP = '198.51.100.7';
    var OTHER_IP = '198.51.100.99';
    var CONN = CLIENT_IP + ':51000 ↔ ' + REMOTE_IP + ':443';
    var STATE_STEPS = [
        { s: 0, log: '상태 기반(stateful) 방화벽은 연결 상태를 추적하는 표를 둡니다. 이 방화벽의 정책은 "안에서 밖으로 나가는 것은 허용, 밖에서 안으로 먼저 들어오는 것은 차단"입니다.' },
        { s: 1, log: '내부 호스트 ' + CLIENT_IP + '가 ' + REMOTE_IP + ':443로 연결을 시작합니다. 나가는 방향은 허용 규칙에 맞아 통과하고, 방화벽이 이 연결을 상태 표에 기록합니다.' },
        { s: 2, log: '서버의 응답이 밖에서 안으로 들어옵니다. 들어오는 방향을 허용하는 규칙은 없지만, 상태 표에 이 연결(' + CONN + ')이 있어 응답으로 인정되어 통과합니다. 응답용 규칙을 따로 쓰지 않아도 됩니다.' },
        { s: 3, log: '다른 곳(' + OTHER_IP + ')에서 먼저 보낸 패킷은 상태 표에 해당하는 연결이 없습니다. 들어오는 방향의 허용 규칙도 없어 차단됩니다.' },
        { s: 4, log: '연결이 끝나거나 오랫동안 쓰이지 않으면 상태 표에서 항목이 지워지고, 그 뒤에 들어오는 같은 모양의 패킷은 응답으로 인정되지 않아 차단됩니다.' },
        { s: 5, log: '정리 — 상태를 보지 않는 필터는 응답을 받으려면 "밖에서 출발지 포트 443인 패킷 허용" 같은 규칙이 필요한데, 이 규칙은 먼저 시작한 가짜 패킷도 통과시킵니다. 상태 기반은 실제 요청에 대한 응답만 통과시켜 규칙이 단순하고 안전합니다.' }
    ];

    var POLICY_ROWS = [
        { name: 'tcp 443 (웹)', deny: 'allow', allow: 'allow' },
        { name: 'tcp 3306 (DB)', deny: 'deny', allow: 'allow' },
        { name: 'tcp 8080 (새 서비스)', deny: 'deny', allow: 'allow' }
    ];
    var POLICY_STEPS = [
        { k: 0, log: '방화벽의 기본 정책 두 가지를 비교합니다. 기본 거부(default deny)는 허용한 것만 통과시키고, 기본 허용은 차단한 것만 막습니다.' },
        { k: 1, log: '관리자가 규칙을 작성했습니다. 기본 거부 쪽은 "443과 22만 허용, 나머지 차단"이고, 기본 허용 쪽은 "23과 3389만 차단, 나머지 허용"입니다.' },
        { k: 2, log: 'tcp 443(웹) 트래픽은 두 정책 모두 허용됩니다. 여기까지는 차이가 없습니다.' },
        { k: 3, log: 'tcp 3306(DB)은 어느 쪽 규칙에도 적혀 있지 않습니다. 기본 거부는 차단하지만, 기본 허용은 통과시켜 DB 포트가 외부에 열립니다.' },
        { k: 4, log: '새로 띄운 서비스(tcp 8080)의 규칙을 깜빡했을 때도 마찬가지입니다. 기본 거부는 서비스가 안 열리니 곧 알아차리지만, 기본 허용은 조용히 열려 있습니다.' },
        { k: 5, log: '정리 — 규칙에서 빠뜨린 트래픽이 자동으로 차단되는 기본 거부가 안전하다고 권장됩니다. 기본 허용은 차단 규칙을 하나 놓치면 곧바로 보안 구멍이 됩니다.' }
    ];

    /* ===================== 상태 ===================== */
    var mode    = 'rules';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'stateful') return STATE_STEPS;
        if (mode === 'policy') return POLICY_STEPS;
        return RULE_STEPS;
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
        if (sz < 9.5) sz = 9.5;
        if (color.indexOf(P.muted) === 0) color = P.sub + 'ff';
        ctx.font = (bold ? '700' : '500') + ' ' + sz + 'px "JetBrains Mono",monospace';
        ctx.fillStyle = color;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(str, x, y);
    }

    /* ===================== 공통 ===================== */
    function actColor(a) { return a === 'allow' ? P.green : P.red; }
    function drawArrow(x1, y1, x2, y2, color) {
        var ang = Math.atan2(y2 - y1, x2 - x1);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.6;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 9 * Math.cos(ang - 0.45), y2 - 9 * Math.sin(ang - 0.45));
        ctx.lineTo(x2 - 9 * Math.cos(ang + 0.45), y2 - 9 * Math.sin(ang + 0.45));
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    }

    /* ===================== 모드: 규칙 매칭 ===================== */
    function drawRules(x0, top, w, mob, step) {
        var fs = mob ? 10 : 11.5;
        var pk = step ? step.pk : -1;
        var p = pk >= 0 ? PKTS[pk] : null;
        var res = p ? judge(p) : null;
        var ph = 38;
        rr(x0, top, w, ph, 6, p ? P.yellow + '18' : 'none', (p ? P.yellow : P.muted) + (p ? 'ff' : '55'), p ? 1.8 : 1.2);
        tx(p ? '패킷 ' + (pk + 1) + '/' + PKTS.length + '  ' + p.note : '도착한 패킷', x0 + 10, top + 12, fs - 1, P.sub + 'ee', 'left', true);
        tx(p ? pktText(p) : '(없음)', x0 + 10, top + 28, fs - 0.5, (p ? P.text : P.sub) + 'ee', 'left', false);
        var rh = mob ? 32 : 34;
        var y0 = top + ph + 12;
        RULES.forEach(function (r, i) {
            var y = y0 + i * (rh + 5);
            var examined = res && i <= res.idx;
            var hit = res && i === res.idx;
            var skipped = res && i > res.idx;
            var c = actColor(r.action);
            rr(x0, y, w, rh, 5, hit ? c + '30' : 'none', hit ? c + 'ff' : (examined ? P.sub + '99' : P.muted + '55'), hit ? 2 : 1.2);
            tx((i + 1) + '', x0 + 12, y + rh / 2, fs, (skipped ? P.sub : P.text) + 'ee', 'center', true);
            tx(r.action === 'allow' ? '허용' : '차단', x0 + 34, y + rh / 2, fs - 0.5, c + (skipped ? '88' : 'ff'), 'left', true);
            tx(r.text, x0 + 70, y + rh / 2, fs - 1.5, (skipped ? P.sub : P.text) + 'ee', 'left', false);
            if (examined) tx(hit ? '✓ 일치' : '✗', x0 + w - 10, y + rh / 2, fs - 1, (hit ? c : P.sub) + 'ff', 'right', true);
            else if (skipped) tx('건너뜀', x0 + w - 10, y + rh / 2, fs - 2, P.sub + 'dd', 'right', false);
        });
        var ry = y0 + RULES.length * (rh + 5) + 12;
        if (res) {
            var c2 = actColor(res.action);
            tx('결과: ' + (res.action === 'allow' ? '허용 (ACCEPT)' : '차단 (DROP)'), x0 + w / 2, ry, fs + 1, c2 + 'ff', 'center', true);
        } else if (pk === -2) {
            tx('처음 일치한 규칙이 적용된다 · 일치가 없으면 기본 거부', x0 + w / 2, ry, fs - 0.5, P.yellow + 'ee', 'center', true);
        }
    }

    /* ===================== 모드: 상태 추적 ===================== */
    function drawState(x0, top, w, mob, step) {
        var fs = mob ? 10 : 11.5;
        var s = step ? step.s : 0;
        var bw = mob ? 78 : 120;
        var bh = 50;
        var xs = [x0, x0 + (w - bw) / 2, x0 + w - bw];
        var names = [['내부 호스트', CLIENT_IP, P.orange], ['방화벽', '상태 기반', P.green], ['외부 서버', REMOTE_IP, P.teal]];
        var y = top + 6;
        function seg(a, b, color, dir) {
            var x1 = dir > 0 ? xs[a] + bw : xs[a];
            var x2 = dir > 0 ? xs[b] : xs[b] + bw;
            drawArrow(x1, y + bh / 2 + (dir > 0 ? -8 : 8), x2, y + bh / 2 + (dir > 0 ? -8 : 8), color);
        }
        var lines = [];
        var table = [];
        var verdict = '';
        var vcol = P.green;
        if (s === 1) {
            seg(0, 1, P.yellow + 'ff', 1);
            seg(1, 2, P.yellow + 'ff', 1);
            lines = ['나가는 패킷: ' + CLIENT_IP + ':51000 → ' + REMOTE_IP + ':443', '규칙: 안 → 밖 허용'];
            table = [CONN + '  새 연결'];
            verdict = '허용 · 상태 표에 기록';
        } else if (s === 2) {
            seg(2, 1, P.teal + 'ff', -1);
            seg(1, 0, P.teal + 'ff', -1);
            lines = ['들어오는 패킷: ' + REMOTE_IP + ':443 → ' + CLIENT_IP + ':51000', '밖 → 안 허용 규칙 없음, 표에는 연결 있음'];
            table = [CONN + '  연결됨'];
            verdict = '허용 · 응답으로 인정';
        } else if (s === 3) {
            seg(2, 1, P.red + 'ff', -1);
            lines = ['들어오는 패킷: ' + OTHER_IP + ':443 → ' + CLIENT_IP + ':51000', '밖 → 안 허용 규칙 없음, 표에 연결 없음'];
            table = [CONN + '  연결됨'];
            verdict = '차단 · 먼저 시작한 패킷';
            vcol = P.red;
        } else if (s === 4) {
            seg(2, 1, P.red + 'ff', -1);
            lines = ['들어오는 패킷: ' + REMOTE_IP + ':443 → ' + CLIENT_IP + ':51000', '연결이 끝나 표의 항목이 지워진 뒤'];
            table = [];
            verdict = '차단 · 응답으로 인정되지 않음';
            vcol = P.red;
        } else if (s === 5) {
            lines = ['상태 기반: 표에 있는 연결의 응답만 통과', '상태 없는 필터: "출발지 포트 443 허용" 규칙 필요'];
            table = [];
        } else {
            lines = [];
        }
        names.forEach(function (n, i) {
            rr(xs[i], y, bw, bh, 6, n[2] + '18', n[2] + 'aa', 1.3);
            tx(n[0], xs[i] + bw / 2, y + 16, fs - (mob ? 1 : 0), n[2] + 'ee', 'center', true);
            tx(n[1], xs[i] + bw / 2, y + 34, fs - 3, P.sub + 'ee', 'center', false);
        });
        var py = y + bh + 14;
        var lh = mob ? 15 : 17;
        var ph = lh * 3 + 14;
        rr(x0, py, w, ph, 6, 'none', P.muted + '55', 1.2);
        tx('패킷과 판단', x0 + 10, py + 11, fs - 2, P.sub + 'ee', 'left', true);
        if (lines.length) {
            lines.forEach(function (ln, i) {
                tx(ln, x0 + 10, py + 11 + lh * (i + 1), fs - 1.5, (i === 0 ? P.text : P.yellow) + 'ee', 'left', false);
            });
        } else {
            tx('(아직 패킷이 없습니다)', x0 + 10, py + 11 + lh, fs - 1.5, P.sub + 'ee', 'left', false);
        }
        var ty = py + ph + 12;
        var th = 24 + lh;
        rr(x0, ty, w, th, 6, 'none', P.muted + '55', 1.2);
        tx('연결 상태 표', x0 + 10, ty + 11, fs - 2, P.sub + 'ee', 'left', true);
        if (table.length) {
            table.forEach(function (t, i) {
                tx(t, x0 + 10, ty + 11 + lh * (i + 1), fs - 1.5, P.green + 'ee', 'left', false);
            });
        } else {
            tx('(비어 있음)', x0 + 10, ty + 11 + lh, fs - 1.5, P.sub + 'ee', 'left', false);
        }
        if (verdict) tx('결과: ' + verdict, x0 + w / 2, ty + th + 18, fs, vcol + 'ff', 'center', true);
    }

    /* ===================== 모드: 기본 정책 ===================== */
    function drawPolicy(x0, top, w, mob, step) {
        var fs = mob ? 10 : 11.5;
        var k = step ? step.k : 0;
        var gap = 8;
        var cw = (w - gap) / 2;
        var cols = [
            { key: 'deny', title: '기본 거부', col: P.teal, rules: ['허용 tcp 443', '허용 tcp 22', '그 외 전부 차단'], x: x0 },
            { key: 'allow', title: '기본 허용', col: P.orange, rules: ['차단 tcp 23', '차단 tcp 3389', '그 외 전부 허용'], x: x0 + cw + gap }
        ];
        cols.forEach(function (c) {
            rr(c.x, top, cw, 24, 5, c.col + '25', c.col + 'ff', 1.6);
            tx(c.title, c.x + cw / 2, top + 12, fs, c.col + 'ff', 'center', true);
            if (k >= 1) {
                c.rules.forEach(function (r, i) {
                    tx(r, c.x + 8, top + 38 + i * 17, fs - 1.5, (i === 2 ? P.yellow : P.text) + 'ee', 'left', false);
                });
            }
        });
        var y0 = top + 38 + 3 * 17 + 10;
        POLICY_ROWS.forEach(function (r, i) {
            if (k < 2 + i) return;
            var y = y0 + i * 52;
            var cur = k === 2 + i;
            tx(r.name, x0, y, fs - 0.5, (cur ? P.text : P.sub) + 'ee', 'left', true);
            cols.forEach(function (c) {
                var a = r[c.key];
                var exposed = c.key === 'allow' && a === 'allow' && i > 0;
                var col = exposed ? P.red : actColor(a);
                rr(c.x, y + 8, cw, 26, 5, col + (cur ? '30' : '18'), col + (cur ? 'ff' : '88'), cur ? 1.8 : 1.2);
                tx((a === 'allow' ? '허용' : '차단') + (exposed ? ' (위험!)' : ''), c.x + cw / 2, y + 21, fs - 0.5, col + 'ff', 'center', true);
            });
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

        if (mode === 'stateful') drawState(padX, top, fullW, mob, step);
        else if (mode === 'policy') drawPolicy(padX, top, fullW, mob, step);
        else drawRules(padX, top, fullW, mob, step);

        if (!step) {
            var hint = '아래 STEP으로 방화벽의 판단을 확인하세요.';
            ctx.font = '500 ' + (mob ? 11 : 12.5) + 'px "JetBrains Mono",monospace';
            var hs = (mob ? 11 : 12.5) * Math.min(1, (W - 16) / ctx.measureText(hint).width);
            tx(hint, W / 2, GH() - (mob ? 12 : 14), hs, P.muted + 'aa', 'center', false);
        }
    }

    /* ===================== resize ===================== */
    function resize() {
        var w = canvasWrap.offsetWidth || 320;
        var mob = w < 600;
        var neededH;
        if (mode === 'stateful') neededH = mob ? 340 : 350;
        else if (mode === 'policy') neededH = mob ? 330 : 330;
        else neededH = mob ? 290 : 300;
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
        if (mode === 'stateful') return '연결 상태를 추적해 응답만 통과시키는 상태 기반 방화벽의 동작을 봅니다.';
        if (mode === 'policy') return '기본 거부와 기본 허용 정책의 차이를 봅니다.';
        return '패킷이 규칙 목록을 위에서부터 비교하며 허용 또는 차단되는 과정을 봅니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('fw-viz__speed-btn--active'); });
        btn.classList.add('fw-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('fw-viz__mode-btn--active', d.key === m); });
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