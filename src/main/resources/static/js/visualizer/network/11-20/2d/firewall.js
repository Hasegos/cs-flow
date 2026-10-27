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
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
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
    function GW() { return canvas.width / dpr; }
    function GH() { return canvas.height / dpr; }

    var P = window.CsFlow.getP();

    /* ===================== 상태 ===================== */
    var mode    = 'rules';
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
    function currentSteps() {
        if (mode === 'stateful') return STATE_STEPS;
        if (mode === 'policy') return POLICY_STEPS;
        return RULE_STEPS;
    }
    function defaultLog() {
        if (mode === 'stateful') return '연결 상태를 기억하는 방화벽이 응답은 통과시키고 낯선 패킷은 막는 과정을 봅니다.';
        if (mode === 'policy') return '기본 거부와 기본 허용에서 규칙에 없는 트래픽이 어떻게 처리되는지 비교합니다.';
        return '패킷이 규칙 목록을 위에서부터 차례로 비교되는 과정을 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var t = mode === 'stateful' ? (mob ? 262 : 226) : (mode === 'policy' ? (mob ? 252 : 244) : (mob ? 250 : 252));
        return { fs: mob ? 10.5 : 12, total: t };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }
    function actColor(a) { return a === 'allow' ? P.green : P.red; }

    /* ===================== 규칙 매칭 ===================== */
    function drawRules(x0, top, w, mob, s, p, e, fs) {
        var pk = s.pk;
        var pkt = pk >= 0 ? PKTS[pk] : null;
        var res = pkt ? judge(pkt) : null;
        var fresh = pk !== p.pk;
        var ph = 38;
        var cardA = pkt && fresh ? ez(seg(e, 0, 0.15)) : 1;
        ctx.globalAlpha = cardA;
        rr(x0, top, w, ph, 6, pkt ? P.yellow + '18' : 'none', (pkt ? P.yellow : P.sub) + (pkt ? 'ff' : '66'), pkt ? 1.8 : 1.2);
        tx(pkt ? '패킷 ' + (pk + 1) + '/' + PKTS.length + '  ' + pkt.note : '도착한 패킷', x0 + 10, top + 12, fs - 1, P.sub + 'ff', 'left', true);
        tx(pkt ? pktText(pkt) : '(없음)', x0 + 10, top + 28, fs - 0.5, (pkt ? P.text : P.sub) + 'ff', 'left', false);
        ctx.globalAlpha = 1;

        var rh = mob ? 32 : 34;
        var y0 = top + ph + 12;
        var n = res ? res.idx + 1 : 0;
        var scan = res ? (fresh ? seg(e, 0.12, 0.72) : 1) : 0;
        var bIdx = n > 1 ? scan * (n - 1) : 0;
        RULES.forEach(function (r, i) {
            var y = y0 + i * (rh + 5);
            var hit = res && i === res.idx;
            var examined = res && i < res.idx && bIdx >= i + 0.5;
            var reachedHit = res && hit && scan >= 1;
            var skipped = res && i > res.idx && scan >= 1;
            var c = actColor(r.action);
            var flash = reachedHit && fresh ? 1 - seg(e, 0.72, 0.9) : 0;
            rr(x0, y, w, rh, 5, reachedHit ? c + '30' : 'none', reachedHit ? c + 'ff' : (examined ? P.sub + 'aa' : P.sub + '55'), reachedHit ? 2 : 1.2);
            if (flash > 0) {
                ctx.globalAlpha = flash;
                rr(x0, y, w, rh, 5, c + '66', 'none', 1);
                ctx.globalAlpha = 1;
            }
            ctx.globalAlpha = skipped ? 0.45 : 1;
            tx(String(i + 1), x0 + 12, y + rh / 2, fs, P.text + 'ff', 'center', true);
            tx(r.action === 'allow' ? '허용' : '차단', x0 + 34, y + rh / 2, fs - 0.5, c + 'ff', 'left', true);
            tx(mob ? r.text.replace(/\s+/g, ' ') : r.text, x0 + (mob ? 68 : 76), y + rh / 2, fs - 1.5, P.text + 'ff', 'left', false);
            ctx.globalAlpha = 1;
            if (examined) tx('✗', x0 + w - 10, y + rh / 2, fs - 1, P.sub + 'ff', 'right', true);
            else if (reachedHit) tx(mob ? '✓' : '✓ 일치', x0 + w - 10, y + rh / 2, fs - 1, c + 'ff', 'right', true);
            else if (skipped) tx(mob ? '–' : '건너뜀', x0 + w - 10, y + rh / 2, fs - 1.5, P.sub + 'ff', 'right', false);
        });
        if (res && scan < 1 && scan > 0) {
            var by = y0 + bIdx * (rh + 5);
            rr(x0 - 2, by - 2, w + 4, rh + 4, 6, 'none', P.yellow + 'ff', 2.2);
            circ(x0 - 8, by + rh / 2, 4, P.yellow + 'ff', 'none', 1);
        }
        var ry = y0 + RULES.length * (rh + 5) + 14;
        if (res) {
            var pop = fresh ? ez(seg(e, 0.72, 0.92)) : 1;
            var c2 = actColor(res.action);
            var label = res.action === 'allow' ? '허용 (ACCEPT)' : '차단 (DROP)';
            var bw = label.length * 8.6 + 28;
            if (pop > 0) {
                ctx.globalAlpha = pop;
                rr(x0 + w / 2 - bw / 2 * pop, ry - 14 * pop, bw * pop, 28 * pop, 8, c2 + '33', c2 + 'ff', 2);
                if (pop > 0.7) tx('결과: ' + label, x0 + w / 2, ry, fs + 1, c2 + 'ff', 'center', true);
                ctx.globalAlpha = 1;
            }
        } else if (pk === -2) {
            ctx.globalAlpha = ez(seg(e, 0.1, 0.6));
            lines('처음 일치한 규칙이 적용된다 · 일치가 없으면 기본 거부', w, fs - 0.5).forEach(function (l, li) {
                tx(l, x0 + w / 2, ry + li * (fs + 3), fs - 0.5, P.yellow + 'ff', 'center', true);
            });
            ctx.globalAlpha = 1;
        }
    }

    /* ===================== 상태 추적 ===================== */
    function stateSpec(st) {
        var sp = { lanes: [], lines: [], table: [], verdict: '', vcol: P.green, chip: '', blocked: false, back: false };
        if (st === 1) {
            sp.lanes = [[0, 1], [1, 2]]; sp.chip = '요청';
            sp.lines = ['나가는 패킷: ' + CLIENT_IP + ':51000 → ' + REMOTE_IP + ':443', '규칙: 안 → 밖 허용'];
            sp.table = [CONN + '  새 연결']; sp.verdict = '허용 · 상태 표에 기록';
        } else if (st === 2) {
            sp.lanes = [[2, 1], [1, 0]]; sp.chip = '응답'; sp.back = true;
            sp.lines = ['들어오는 패킷: ' + REMOTE_IP + ':443 → ' + CLIENT_IP + ':51000', '밖 → 안 허용 규칙 없음, 표에는 연결 있음'];
            sp.table = [CONN + '  연결됨']; sp.verdict = '허용 · 응답으로 인정';
        } else if (st === 3) {
            sp.lanes = [[2, 1]]; sp.chip = '패킷'; sp.blocked = true; sp.back = true;
            sp.lines = ['들어오는 패킷: ' + OTHER_IP + ':443 → ' + CLIENT_IP + ':51000', '밖 → 안 허용 규칙 없음, 표에 연결 없음'];
            sp.table = [CONN + '  연결됨']; sp.verdict = '차단 · 먼저 시작한 패킷'; sp.vcol = P.red;
        } else if (st === 4) {
            sp.lanes = [[2, 1]]; sp.chip = '응답'; sp.blocked = true; sp.back = true;
            sp.lines = ['들어오는 패킷: ' + REMOTE_IP + ':443 → ' + CLIENT_IP + ':51000', '연결이 끝나 표의 항목이 지워진 뒤'];
            sp.verdict = '차단 · 응답으로 인정되지 않음'; sp.vcol = P.red;
        } else if (st === 5) {
            sp.lines = ['상태 기반: 표에 있는 연결의 응답만 통과', '상태 없는 필터: "출발지 포트 443 허용" 규칙 필요'];
        }
        return sp;
    }

    function drawState(x0, top, w, mob, s, p, e, fs) {
        var sp = stateSpec(s.s), pp = stateSpec(p.s);
        var fresh = s.s !== p.s;
        var bw = mob ? 86 : 120, bh = 50;
        var xs = [x0, x0 + (w - bw) / 2, x0 + w - bw];
        var names = [['내부 호스트', CLIENT_IP, P.orange], ['방화벽', '상태 기반', P.green], ['외부 서버', REMOTE_IP, P.teal]];
        var y = top + 6;
        var laneY = function (a, b) { return y + bh / 2 + (b > a ? -8 : 8); };
        var laneX = function (a, b) { return b > a ? [xs[a] + bw, xs[b]] : [xs[a], xs[b] + bw]; };
        var arrived = fresh ? seg(e, 0.5, 0.8) : 1;
        names.forEach(function (n, i) {
            var hot = i === 1 && sp.blocked && arrived > 0.3;
            var col = hot ? P.red : n[2];
            rr(xs[i], y, bw, bh, 6, col + '18', col + (hot ? 'ff' : 'aa'), hot ? 2 : 1.3);
            tx(n[0], xs[i] + bw / 2, y + 16, fs - (mob ? 0.5 : 0), n[2] + 'ff', 'center', true);
            tx(n[1], xs[i] + bw / 2, y + 34, fs - 1.5, P.sub + 'ff', 'center', false);
        });
        var total = sp.lanes.length;
        var prog = fresh ? ez(seg(e, 0.05, 0.62)) : 1;
        sp.lanes.forEach(function (ln2, i) {
            var xr = laneX(ln2[0], ln2[1]);
            var yy = laneY(ln2[0], ln2[1]);
            var part = clamp01(prog * total - i);
            var col = (sp.blocked ? P.red : (sp.back ? P.teal : P.yellow)) + 'ff';
            if (part <= 0) return;
            var xe = lerp(xr[0], xr[1], part);
            if (part >= 1) arrow(xr[0], yy, xr[1], yy, col, 2.6);
            else ln(xr[0], yy, xe, yy, col, 2.6);
            if (part > 0 && part < 1 && sp.chip) {
                var cw = sp.chip.length * 9 + 12;
                rr(xe - cw / 2, yy - 24, cw, 18, 5, col, col, 1.2);
                tx(sp.chip, xe, yy - 15, fs - 1.5, '#111111', 'center', true);
            }
        });
        if (sp.blocked && arrived > 0) {
            var bx = xs[1] + bw;
            var by2 = y + bh / 2 + 8;
            ctx.globalAlpha = arrived;
            ln(bx - 2, by2 - 9, bx + 14, by2 + 9, P.red + 'ff', 3.4);
            ln(bx - 2, by2 + 9, bx + 14, by2 - 9, P.red + 'ff', 3.4);
            ctx.globalAlpha = 1;
        }

        var lh = mob ? 15 : 17;
        var py0 = y + bh + 14;
        var cardLines = [];
        sp.lines.forEach(function (l, i) {
            lines(mob ? l.replace('들어오는 패킷: ', '수신: ') : l, w - 20, fs - 1).forEach(function (m) { cardLines.push([m, i]); });
        });
        var ph = Math.max(2, cardLines.length) * lh + 26;
        var same = sp.lines.join('|') === pp.lines.join('|');
        var ca = same ? 1 : ez(seg(e, 0, 0.3));
        rr(x0, py0, w, ph, 6, 'none', P.sub + '66', 1.2);
        tx('패킷과 판단', x0 + 10, py0 + 12, fs - 1, P.sub + 'ff', 'left', true);
        if (cardLines.length) {
            ctx.globalAlpha = ca;
            cardLines.forEach(function (m, i) {
                tx(m[0], x0 + 10, py0 + 12 + lh * (i + 1), fs - 1, (m[1] === 0 ? P.text : P.yellow) + 'ff', 'left', false);
            });
            ctx.globalAlpha = 1;
        } else {
            tx('(아직 패킷이 없습니다)', x0 + 10, py0 + 12 + lh, fs - 1, P.sub + 'ff', 'left', false);
        }

        var ty0 = py0 + ph + 12;
        var tl = [];
        sp.table.forEach(function (t) { tl = tl.concat(lines(t, w - 20, fs - 1)); });
        var th = 24 + Math.max(1, tl.length) * lh;
        rr(x0, ty0, w, th, 6, 'none', P.sub + '66', 1.2);
        tx('연결 상태 표', x0 + 10, ty0 + 12, fs - 1, P.sub + 'ff', 'left', true);
        var rowY = ty0 + 12 + lh;
        if (!sp.table.length && !pp.table.length) {
            tx('(비어 있음)', x0 + 10, rowY, fs - 1, P.sub + 'ff', 'left', false);
        }
        if (sp.table.length) {
            var isNewRow = !pp.table.length;
            var a = isNewRow ? seg(e, 0.5, 0.8) : 1;
            if (isNewRow && e < 1) {
                var hi = 1 - seg(e, 0.6, 1);
                if (hi > 0) { ctx.globalAlpha = hi; rr(x0 + 4, rowY - lh / 2, w - 8, lh * tl.length, 3, P.yellow + '33', P.yellow + 'ff', 1.2); ctx.globalAlpha = 1; }
            }
            var look = s.s === 2 || s.s === 3;
            if (look && fresh && e > 0.45 && e < 1) {
                var hit2 = s.s === 2;
                var la = 0.5 + 0.5 * Math.sin(e * 22);
                ctx.globalAlpha = la;
                rr(x0 + 4, rowY - lh / 2, w - 8, lh * tl.length, 3, (hit2 ? P.green : P.red) + '33', (hit2 ? P.green : P.red) + 'ff', 1.6);
                ctx.globalAlpha = 1;
            }
            ctx.globalAlpha = a;
            tl.forEach(function (l, i) {
                tx(l, x0 + 10 + (isNewRow ? (1 - a) * 18 : 0), rowY + i * lh, fs - 1, P.green + 'ff', 'left', false);
            });
            ctx.globalAlpha = 1;
        } else if (pp.table.length) {
            ctx.globalAlpha = 1 - seg(e, 0, 0.5);
            var old = [];
            pp.table.forEach(function (t) { old = old.concat(lines(t, w - 20, fs - 1)); });
            old.forEach(function (l, i) {
                tx(l, x0 + 10, rowY + i * lh, fs - 1, P.red + 'ff', 'left', false);
                ln(x0 + 10, rowY + i * lh, x0 + 10 + Math.min(w - 20, l.length * 6.6) * seg(e, 0, 0.3), rowY + i * lh, P.red + 'ff', 1.4);
            });
            ctx.globalAlpha = 1;
            if (seg(e, 0.5, 0.9) > 0) { ctx.globalAlpha = seg(e, 0.5, 0.9); tx('(비어 있음)', x0 + 10, rowY, fs - 1, P.sub + 'ff', 'left', false); ctx.globalAlpha = 1; }
        }
        if (sp.verdict) {
            var va = fresh ? ez(seg(e, 0.65, 0.95)) : 1;
            ctx.globalAlpha = va;
            tx('결과: ' + sp.verdict, x0 + w / 2, ty0 + th + 16 - (1 - va) * 6, fs, sp.vcol + 'ff', 'center', true);
            ctx.globalAlpha = 1;
        }
    }

    /* ===================== 기본 정책 ===================== */
    function drawPolicy(x0, top, w, mob, s, p, e, fs) {
        var k = s.k, pk = p.k;
        var gap = 8;
        var cw = (w - gap) / 2;
        var cols = [
            { key: 'deny', title: '기본 거부', col: P.teal, rules: ['허용 tcp 443', '허용 tcp 22', '그 외 전부 차단'], x: x0 },
            { key: 'allow', title: '기본 허용', col: P.orange, rules: ['차단 tcp 23', '차단 tcp 3389', '그 외 전부 허용'], x: x0 + cw + gap }
        ];
        cols.forEach(function (c) {
            rr(c.x, top, cw, 24, 5, c.col + '25', c.col + 'ff', 1.6);
            tx(c.title, c.x + cw / 2, top + 12, fs, c.col + 'ff', 'center', true);
            c.rules.forEach(function (r, i) {
                var show = k >= 1 ? (pk >= 1 ? 1 : seg(e, i * 0.2, i * 0.2 + 0.4)) : 0;
                if (show <= 0) return;
                ctx.globalAlpha = show;
                tx(r, c.x + 8 + (1 - show) * 14, top + 38 + i * 17, fs - 1, (i === 2 ? P.yellow : P.text) + 'ff', 'left', false);
                ctx.globalAlpha = 1;
            });
        });
        var y0 = top + 38 + 3 * 17 + 10;
        POLICY_ROWS.forEach(function (r, i) {
            var rowK = 2 + i;
            if (k < rowK) return;
            var y = y0 + i * 52;
            var cur = k === rowK;
            var fresh = cur && pk < rowK;
            var a = fresh ? seg(e, 0, 0.25) : 1;
            ctx.globalAlpha = a;
            tx(r.name, x0, y, fs - 0.5, (cur ? P.text : P.sub) + 'ff', 'left', true);
            ctx.globalAlpha = 1;
            cols.forEach(function (c, ci) {
                var act = r[c.key];
                var exposed = c.key === 'allow' && act === 'allow' && i > 0;
                var col = exposed ? P.red : actColor(act);
                var q = fresh ? ez(seg(e, 0.2 + ci * 0.2, 0.55 + ci * 0.2)) : 1;
                rr(c.x, y + 8, cw, 26, 5, 'none', P.sub + '55', 1.2);
                if (q > 0) {
                    rr(c.x, y + 8, cw * q, 26, 5, col + (cur ? '30' : '18'), col + (cur ? 'ff' : '88'), cur ? 1.8 : 1.2);
                    if (q > 0.6) tx((act === 'allow' ? '허용' : '차단') + (exposed ? ' (위험!)' : ''), c.x + cw / 2, y + 21, fs - 0.5, col + 'ff', 'center', true);
                }
                if (fresh && exposed && e > 0.55 && e < 1) {
                    ctx.globalAlpha = 0.5 + 0.5 * Math.sin((e - 0.55) * 30);
                    rr(c.x - 2, y + 6, cw + 4, 30, 6, 'none', P.red + 'ff', 2.4);
                    ctx.globalAlpha = 1;
                }
            });
        });
    }

    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var e = clamp01(t);
        var s = step || currentSteps()[0];
        var p = prev || s;
        if (mode === 'stateful') drawState(x0, top, w, mob, s, p, e, L.fs);
        else if (mode === 'policy') drawPolicy(x0, top, w, mob, s, p, e, L.fs);
        else drawRules(x0, top, w, mob, s, p, e, L.fs);
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