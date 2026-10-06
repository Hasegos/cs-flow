/**
 * DHCP 시각화
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
    var root    = el('div', 'dhcp-viz');
    var toolbar = el('div', 'dhcp-viz__toolbar');
    var tbLeft  = el('div', 'dhcp-viz__toolbar-left');
    tbLeft.appendChild(el('span', 'dhcp-viz__title', 'DHCP'));

    var modeWrap = el('div', 'dhcp-viz__mode');
    var modeDefs = [
        { key: 'dora', label: 'DORA 4단계' },
        { key: 'lease', label: '임대와 갱신' },
        { key: 'option', label: '할당 정보' }
    ];
    var modeBtns = {};
    modeDefs.forEach(function (m, i) {
        var b = el('button', 'dhcp-viz__mode-btn' + (i === 0 ? ' dhcp-viz__mode-btn--active' : ''), m.label);
        b.addEventListener('click', function () { if (!running) switchMode(m.key); });
        modeWrap.appendChild(b);
        modeBtns[m.key] = b;
    });
    tbLeft.appendChild(modeWrap);
    toolbar.appendChild(tbLeft);

    var speedWrap = el('div', 'dhcp-viz__speed');
    speedWrap.appendChild(el('span', 'dhcp-viz__speed-label', 'SPEED'));
    var speedBtns = [];
    [['1x', 1700], ['2x', 850], ['3x', 480]].forEach(function (pair, i) {
        var b = el('button', 'dhcp-viz__speed-btn' + (i === 0 ? ' dhcp-viz__speed-btn--active' : ''), pair[0]);
        b.addEventListener('click', function () { if (!running) setSpeed(pair[1], b); });
        speedWrap.appendChild(b);
        speedBtns.push(b);
    });
    toolbar.appendChild(speedWrap);
    root.appendChild(toolbar);

    var canvasWrap = el('div', 'dhcp-viz__canvas-wrap');
    var canvas     = document.createElement('canvas');
    canvas.className = 'dhcp-viz__canvas';
    canvasWrap.appendChild(canvas);
    root.appendChild(canvasWrap);

    var logEl = el('div', 'dhcp-viz__log', '');
    root.appendChild(logEl);

    var controls = el('div', 'dhcp-viz__controls');
    var btnPlay  = el('button', 'dhcp-viz__btn dhcp-viz__btn--primary', '▶ PLAY');
    var btnStep  = el('button', 'dhcp-viz__btn', '▶| STEP');
    var btnReset = el('button', 'dhcp-viz__btn', '↺ RESET');
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

    /* ===================== 데이터: 호스트, 설정, 임대 ===================== */
    var CLIENT_MAC = '02:00:00:00:00:0c';
    var SERVER_IP = '192.168.0.1';
    var OFFER_IP = '192.168.0.105';
    var NO_IP = '0.0.0.0';
    var BCAST_MAC = 'ff:ff:ff:ff:ff:ff';
    var BCAST_IP = '255.255.255.255';
    var LEASE_H = 8;
    var T1_H = LEASE_H * 0.5;
    var T2_H = LEASE_H * 0.875;
    var LEASE_SEC = LEASE_H * 3600;
    var CONFIG = [
        { label: 'IP 주소', code: 'yiaddr 필드', value: OFFER_IP, why: '이 클라이언트가 쓸 주소입니다. 서버가 풀(pool)에서 하나를 골라 줍니다.' },
        { label: '서브넷 마스크', code: '옵션 1', value: '255.255.255.0', why: '어디까지가 같은 네트워크인지 알려 줍니다. 목적지가 같은 네트워크 안인지 판단할 때 쓰입니다.' },
        { label: '기본 게이트웨이', code: '옵션 3 (router)', value: SERVER_IP, why: '같은 네트워크 밖으로 가는 패킷을 보낼 라우터의 주소입니다.' },
        { label: 'DNS 서버', code: '옵션 6', value: '8.8.8.8', why: '도메인 이름을 IP로 바꿀 때 물어볼 서버 주소입니다.' },
        { label: '임대 시간', code: '옵션 51', value: LEASE_H + '시간 (' + LEASE_SEC + '초)', why: '이 주소를 빌려 쓸 수 있는 기간입니다. 지나기 전에 갱신하지 않으면 주소 사용을 멈춰야 합니다.' },
        { label: '서버 식별자', code: '옵션 54', value: SERVER_IP, why: '응답한 DHCP 서버의 주소입니다. 클라이언트가 어느 서버의 제안을 골랐는지 알리는 데도 쓰입니다.' }
    ];

    function st(log, o) {
        var s = { log: log, send: null, to: [], kind: '', label: '', hl: {}, pkt: [], cip: NO_IP, nconf: 0 };
        for (var k in o) s[k] = o[k];
        return s;
    }
    var ALL_S = ['S', 'N'];
    var DORA_STEPS = [
        st('새로 네트워크에 연결된 클라이언트는 IP 주소가 없습니다(' + NO_IP + '). 같은 LAN에는 DHCP 서버가 있지만 클라이언트는 그 주소도 모릅니다. DHCP는 이 상태에서 IP 주소와 네트워크 설정을 자동으로 받는 프로토콜입니다.',
            { hl: { C: ['IP 없음', 'orange'] } }),
        st('1단계 Discover — 클라이언트가 DHCP 서버를 찾는 메시지를 브로드캐스트합니다. 출발지 IP는 ' + NO_IP + ', 목적지는 ' + BCAST_IP + '(UDP 서버 포트 67, 클라이언트 포트 68)입니다. 자기 IP도 서버 위치도 모르기 때문입니다.',
            { send: 'C', to: ALL_S, kind: 'bc', label: 'DHCPDISCOVER (브로드캐스트)', hl: { C: ['서버 찾는 중', 'orange'] },
              pkt: ['이더넷 dst ' + BCAST_MAC, 'UDP ' + NO_IP + ':68 → ' + BCAST_IP + ':67', 'DHCPDISCOVER', '클라이언트 MAC ' + CLIENT_MAC] }),
        st('2단계 Offer — DHCP 서버가 사용할 수 있는 주소 ' + OFFER_IP + '와 설정(서브넷 마스크, 게이트웨이, DNS, 임대 시간)을 제안합니다. 클라이언트에 아직 IP가 없어, 서버는 클라이언트의 MAC 주소로 보내거나 브로드캐스트로 보냅니다.',
            { send: 'S', to: ['C'], kind: 'uc', label: 'DHCPOFFER (서버의 제안)', hl: { C: ['제안 받음', 'orange'], S: ['제안 보냄', 'green'] },
              pkt: ['UDP ' + SERVER_IP + ':67 → 클라이언트:68', 'DHCPOFFER', '제안 IP(yiaddr) ' + OFFER_IP, '임대 ' + LEASE_H + '시간 · 서버 ' + SERVER_IP] }),
        st('3단계 Request — 클라이언트가 제안을 받아들인다는 요청을 보냅니다. 서버가 여러 대일 수 있어 이 메시지도 브로드캐스트하고, 안에 선택한 서버(' + SERVER_IP + ')를 적어 다른 서버가 자기 제안이 거절됐음을 알게 합니다.',
            { send: 'C', to: ALL_S, kind: 'bc', label: 'DHCPREQUEST (브로드캐스트)', hl: { C: ['제안 수락', 'orange'], S: ['선택됨', 'green'] },
              pkt: ['이더넷 dst ' + BCAST_MAC, 'UDP ' + NO_IP + ':68 → ' + BCAST_IP + ':67', 'DHCPREQUEST', '요청 IP ' + OFFER_IP + ' · 서버 ' + SERVER_IP] }),
        st('4단계 Acknowledge — 서버가 요청을 확인하며 주소와 설정을 확정합니다. 이제 ' + OFFER_IP + '는 임대 시간(' + LEASE_H + '시간) 동안 이 클라이언트에 빌려진 주소입니다.',
            { send: 'S', to: ['C'], kind: 'uc', label: 'DHCPACK (확정)', hl: { C: ['확정 받음', 'orange'], S: ['확정 보냄', 'green'] },
              pkt: ['UDP ' + SERVER_IP + ':67 → 클라이언트:68', 'DHCPACK', 'IP ' + OFFER_IP + ' · 임대 ' + LEASE_H + '시간', '마스크 · 게이트웨이 · DNS 포함'], nconf: 6 }),
        st('설정 완료 — 클라이언트가 받은 값을 인터페이스에 적용합니다. 이때 주소가 이미 쓰이고 있는지 ARP로 확인하는 것이 권장됩니다. 네 단계의 앞 글자를 따서 DORA(Discover · Offer · Request · Acknowledge)라고 부릅니다.',
            { hl: { C: ['IP ' + OFFER_IP.split('.')[3] + ' 사용', 'orange'] }, cip: OFFER_IP, nconf: 6 })
    ];

    var LEASE_STEPS = [
        { t: 0, state: 'BOUND', pkt: [], log: 'DHCPACK를 받은 시점부터 클라이언트는 ' + LEASE_H + '시간 임대를 가지고 주소를 씁니다(BOUND 상태). 임대가 끝나기 전에 연장하는 시점이 두 번 있습니다. 갱신 타이머 T1은 임대 시간의 50%(' + T1_H + '시간), 재바인딩 타이머 T2는 87.5%(' + T2_H + '시간)가 기본값입니다.' },
        { t: T1_H, state: 'RENEWING', pkt: ['UDP ' + OFFER_IP + ':68 → ' + SERVER_IP + ':67', 'DHCPREQUEST (갱신, 유니캐스트)', '원래 임대를 준 서버에게 직접'], log: 'T1(' + T1_H + '시간)이 되면 클라이언트가 임대를 준 서버에게 직접(유니캐스트) DHCPREQUEST를 보내 연장을 요청합니다(RENEWING 상태).' },
        { t: T1_H, state: 'BOUND', pkt: ['UDP ' + SERVER_IP + ':67 → ' + OFFER_IP + ':68', 'DHCPACK', '새 임대 ' + LEASE_H + '시간 시작'], log: '서버가 DHCPACK로 응답하면 임대가 새로 시작되어 같은 주소를 계속 씁니다(BOUND로 복귀). 통신이 끊기지 않고 연장되는 것이 보통의 경우입니다.' },
        { t: T2_H, state: 'REBINDING', pkt: ['이더넷 dst ' + BCAST_MAC, 'UDP ' + OFFER_IP + ':68 → ' + BCAST_IP + ':67', 'DHCPREQUEST (재바인딩, 브로드캐스트)'], log: '갱신이 실패하는 경우를 봅니다. 서버가 응답하지 않아 T2(' + T2_H + '시간)가 되면, 클라이언트는 어느 서버든 연장해 주기를 바라며 DHCPREQUEST를 브로드캐스트합니다(REBINDING 상태).' },
        { t: LEASE_H, state: 'INIT', pkt: ['임대 만료', '주소 사용 중단', 'DHCPDISCOVER부터 다시'], log: '임대 시간(' + LEASE_H + '시간)이 끝날 때까지 연장하지 못하면 클라이언트는 그 주소의 사용을 멈추고 처음(DORA)부터 새 주소를 받아야 합니다(INIT 상태).' }
    ];

    var OPTION_STEPS = [{ k: 0, log: 'DHCP는 IP 주소만이 아니라 인터넷을 쓰는 데 필요한 설정을 한꺼번에 알려 줍니다. 서버가 보낸 DHCPOFFER와 DHCPACK에 들어 있는 항목을 하나씩 봅니다.' }];
    CONFIG.forEach(function (c, i) {
        OPTION_STEPS.push({ k: i + 1, log: c.label + ' (' + c.code + ') = ' + c.value + '. ' + c.why });
    });

    /* ===================== 상태 ===================== */
    var mode    = 'dora';
    var stepIdx = -1;
    var running = false;
    var timer   = null;
    var rafId   = null;
    var speed   = 1700;

    function currentSteps() {
        if (mode === 'lease') return LEASE_STEPS;
        if (mode === 'option') return OPTION_STEPS;
        return DORA_STEPS;
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

    /* ===================== 모드: DORA ===================== */
    var DHOSTS = [
        { id: 'C', name: '클라이언트', col: 'orange' },
        { id: 'S', name: 'DHCP 서버', col: 'green' },
        { id: 'N', name: '다른 호스트', col: 'purple' }
    ];
    function colorOf(key) {
        return P[key] || P.muted;
    }
    function drawDora(x0, top, w, mob, step) {
        var fs = mob ? 10 : 11.5;
        var gap = mob ? 10 : 18;
        var bw = (w - gap * 2) / 3;
        var bh = 56;
        var swY = top + bh + 22;
        var s = step || { send: null, to: [], kind: '', label: '', hl: {}, pkt: [], cip: NO_IP, nconf: 0 };
        var cx = [];
        DHOSTS.forEach(function (h, i) { cx.push(x0 + i * (bw + gap) + bw / 2); });
        ctx.beginPath();
        ctx.moveTo(cx[0], swY);
        ctx.lineTo(cx[2], swY);
        ctx.strokeStyle = P.muted + '66';
        ctx.lineWidth = 2;
        ctx.stroke();
        var active = {};
        if (s.send) active[s.send] = true;
        s.to.forEach(function (id) { active[id] = true; });
        var pulse = s.kind === 'bc' ? P.yellow : P.teal;
        var ipOf = { C: s.cip === NO_IP ? 'IP 없음 (' + NO_IP + ')' : s.cip, S: SERVER_IP, N: '192.168.0.20' };
        DHOSTS.forEach(function (h, i) {
            var x = x0 + i * (bw + gap);
            var c = colorOf(h.col);
            var on = !!active[h.id];
            ctx.beginPath();
            ctx.moveTo(cx[i], top + bh);
            ctx.lineTo(cx[i], swY);
            ctx.strokeStyle = on ? pulse + 'ff' : P.muted + '55';
            ctx.lineWidth = on ? 2.4 : 1.4;
            ctx.stroke();
            var badge = s.hl[h.id];
            rr(x, top, bw, bh, 6, c + '18', c + (badge || on ? 'ff' : '77'), badge || on ? 1.8 : 1.2);
            tx(h.name, x + bw / 2, top + 13, fs, c + 'ee', 'center', true);
            tx(ipOf[h.id], x + bw / 2, top + 29, fs - 2.5, P.muted + 'ee', 'center', false);
            if (badge) tx(badge[0], x + bw / 2, top + 45, fs - 1.5, c + 'ff', 'center', true);
        });
        tx(s.label || '스위치로 연결된 같은 LAN', x0 + w / 2, swY + 14, fs - 0.5, (s.label ? pulse : P.muted) + 'ee', 'center', true);

        var py = swY + 30;
        var lh = mob ? 14 : 16;
        var ph = lh * 4 + 22;
        rr(x0, py, w, ph, 6, 'none', P.muted + '55', 1.2);
        tx('메시지 내용', x0 + 10, py + 11, fs - 2, P.muted + 'ee', 'left', true);
        if (s.pkt.length) {
            s.pkt.forEach(function (ln, i) {
                tx(ln, x0 + 10, py + 26 + i * lh, fs - 1.5, (i < 2 ? P.text : P.yellow) + 'ee', 'left', false);
            });
        } else {
            tx('(아직 주고받은 메시지가 없습니다)', x0 + 10, py + 28, fs - 1.5, P.muted + 'cc', 'left', false);
        }

        var cy = py + ph + 12;
        var ch = 24 + 3 * lh;
        rr(x0, cy, w, ch, 6, 'none', P.muted + '55', 1.2);
        tx('클라이언트가 받은 설정', x0 + 10, cy + 11, fs - 2, P.muted + 'ee', 'left', true);
        if (!s.nconf) {
            tx('(아직 없음)', x0 + 10, cy + 26, fs - 1.5, P.muted + 'cc', 'left', false);
        } else {
            var line1 = 'IP ' + CONFIG[0].value + ' · 마스크 ' + CONFIG[1].value;
            var line2 = '게이트웨이 ' + CONFIG[2].value + ' · DNS ' + CONFIG[3].value;
            var line3 = '임대 ' + CONFIG[4].value;
            [line1, line2, line3].forEach(function (ln, i) {
                tx(ln, x0 + 10, cy + 26 + i * lh, fs - 1.5, P.green + 'ee', 'left', false);
            });
        }
    }

    /* ===================== 모드: 임대와 갱신 ===================== */
    function drawLease(x0, top, w, mob, step) {
        var fs = mob ? 10 : 11.5;
        var s = step || null;
        var barY = top + 44;
        var bh = 26;
        var lx = x0 + 6;
        var lw = w - 12;
        function xAt(h) { return lx + lw * h / LEASE_H; }
        var segs = [
            [0, T1_H, 'BOUND', P.green],
            [T1_H, T2_H, 'RENEWING', P.yellow],
            [T2_H, LEASE_H, 'REBINDING', P.orange]
        ];
        tx('임대 시간 ' + LEASE_H + '시간 (시각화 예시 값)', x0, top + 10, fs, P.text + 'ee', 'left', true);
        segs.forEach(function (sg) {
            var on = s && s.state === sg[2];
            rr(xAt(sg[0]), barY, xAt(sg[1]) - xAt(sg[0]) - 2, bh, 4, sg[3] + (on ? '55' : '1c'), sg[3] + (on ? 'ff' : '77'), on ? 2 : 1.2);
            tx(sg[2], (xAt(sg[0]) + xAt(sg[1])) / 2, barY + bh / 2, fs - 3, (on ? P.text : P.muted) + 'ee', 'center', true);
        });
        [[0, '0'], [T1_H, 'T1 ' + T1_H + '시간'], [T2_H, 'T2 ' + T2_H + '시간'], [LEASE_H, '만료 ' + LEASE_H + '시간']].forEach(function (m, i) {
            var al = i === 0 ? 'left' : (i === 3 ? 'right' : 'center');
            tx(m[1], xAt(m[0]), barY + bh + 14 + (mob && i === 2 ? 14 : 0), fs - 3, P.muted + 'ee', al, false);
        });
        if (s) {
            var px = xAt(s.t);
            ctx.beginPath();
            ctx.moveTo(px, barY - 8);
            ctx.lineTo(px, barY + bh + 2);
            ctx.strokeStyle = P.text + 'ff';
            ctx.lineWidth = 2;
            ctx.stroke();
            var sc = s.state === 'INIT' ? P.red : (s.state === 'BOUND' ? P.green : (s.state === 'RENEWING' ? P.yellow : P.orange));
            tx('상태: ' + s.state, x0, barY + bh + (mob ? 46 : 40), fs, sc + 'ff', 'left', true);
        }
        var py = barY + bh + 56;
        var lh = mob ? 14 : 16;
        var ph = lh * 3 + 22;
        rr(x0, py, w, ph, 6, 'none', P.muted + '55', 1.2);
        tx('메시지 내용', x0 + 10, py + 11, fs - 2, P.muted + 'ee', 'left', true);
        if (s && s.pkt.length) {
            s.pkt.forEach(function (ln, i) {
                tx(ln, x0 + 10, py + 26 + i * lh, fs - 1.5, (i < 1 ? P.text : P.yellow) + 'ee', 'left', false);
            });
        } else {
            tx('(주고받는 메시지 없음)', x0 + 10, py + 28, fs - 1.5, P.muted + 'cc', 'left', false);
        }
    }

    /* ===================== 모드: 할당 정보 ===================== */
    function drawOptions(x0, top, w, mob, step) {
        var fs = mob ? 10 : 11.5;
        var k = step ? step.k : 0;
        var rh = mob ? 38 : 40;
        var gap = 7;
        tx('서버가 알려 주는 정보', x0, top + 10, fs, P.text + 'ee', 'left', true);
        CONFIG.forEach(function (c, i) {
            var y = top + 26 + i * (rh + gap);
            var shown = k >= i + 1;
            var cur = k === i + 1;
            var col = cur ? P.orange : (shown ? P.green : P.muted);
            rr(x0, y, w, rh, 6, cur ? P.orange + '28' : 'none', col + (cur ? 'ff' : (shown ? '99' : '44')), cur ? 1.8 : 1.2);
            tx(c.label, x0 + 10, y + 13, fs - 0.5, (shown ? P.text : P.muted) + 'ee', 'left', true);
            tx(c.code, x0 + 10, y + 28, fs - 3, (cur ? P.yellow : P.muted) + 'ee', 'left', false);
            if (shown) tx(c.value, x0 + w - 10, y + rh / 2, fs - 0.5, col + 'ff', 'right', true);
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

        if (mode === 'lease') drawLease(padX, top, fullW, mob, step);
        else if (mode === 'option') drawOptions(padX, top, fullW, mob, step);
        else drawDora(padX, top, fullW, mob, step);

        if (!step) {
            var hint = '아래 STEP으로 IP 주소를 받는 과정을 확인하세요.';
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
        if (mode === 'lease') neededH = mob ? 250 : 260;
        else if (mode === 'option') neededH = mob ? 330 : 340;
        else neededH = mob ? 345 : 350;
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
        if (mode === 'lease') return '임대한 주소를 연장하는 갱신(T1)과 재바인딩(T2), 만료를 봅니다.';
        if (mode === 'option') return 'DHCP 서버가 IP 주소와 함께 알려 주는 설정 항목을 봅니다.';
        return 'IP 주소가 없는 클라이언트가 DHCP로 주소를 받는 DORA 4단계를 봅니다.';
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
        speedBtns.forEach(function (b) { b.classList.remove('dhcp-viz__speed-btn--active'); });
        btn.classList.add('dhcp-viz__speed-btn--active');
    }

    function switchMode(m) {
        if (mode === m) return;
        mode = m;
        modeDefs.forEach(function (d) { modeBtns[d.key].classList.toggle('dhcp-viz__mode-btn--active', d.key === m); });
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