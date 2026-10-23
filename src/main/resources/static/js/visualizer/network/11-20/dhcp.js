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
    [['1x', 1900], ['2x', 950], ['3x', 520]].forEach(function (pair, i) {
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
    function GW() { return canvas.width / dpr; }
    function GH() { return canvas.height / dpr; }

    var P = window.CsFlow.getP();

    /* ===================== 상태 ===================== */
    var mode    = 'dora';
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
    function currentSteps() {
        if (mode === 'lease') return LEASE_STEPS;
        if (mode === 'option') return OPTION_STEPS;
        return DORA_STEPS;
    }
    function defaultLog() {
        if (mode === 'lease') return '받은 주소를 임대 시간 동안 쓰고 연장하는 과정을 봅니다.';
        if (mode === 'option') return 'DHCP 서버가 IP 주소와 함께 알려 주는 설정 항목을 봅니다.';
        return 'IP가 없는 클라이언트가 DHCP 서버에서 주소를 받는 네 단계(DORA)를 봅니다.';
    }

    /* ===================== 레이아웃 ===================== */
    function layout(w, mob) {
        var t = mode === 'lease' ? (mob ? 250 : 256) : (mode === 'option' ? (mob ? 306 : 312) : (mob ? 346 : 334));
        return { fs: mob ? 10.5 : 12, total: t };
    }
    function sceneH(w, mob) { return layout(w, mob).total; }

    function ez(q) { q = clamp01(q); return q * q * (3 - 2 * q); }

    var DH = [
        { id: 'C', name: '클라이언트', col: 'orange' },
        { id: 'S', name: 'DHCP 서버', col: 'green' },
        { id: 'N', name: '다른 호스트', col: 'purple' }
    ];

    function msgTag(txt) {
        if (txt.indexOf('DISCOVER') >= 0) return 'DISCOVER';
        if (txt.indexOf('OFFER') >= 0) return 'OFFER';
        if (txt.indexOf('REQUEST') >= 0) return 'REQUEST';
        if (txt.indexOf('ACK') >= 0) return 'ACK';
        return '';
    }
    function stageOf(s) {
        var t = msgTag(s.label);
        if (t === 'DISCOVER') return 1;
        if (t === 'OFFER') return 2;
        if (t === 'REQUEST') return 3;
        if (t === 'ACK') return 4;
        return (s.cip !== NO_IP || s.nconf) ? 4 : 0;
    }

    /* ===================== DORA ===================== */
    function drawDora(x0, top, w, mob, s, p, e, fs) {
        var gap = mob ? 10 : 18;
        var bw = (w - gap * 2) / 3;
        var bh = mob ? 60 : 56;
        var swY = top + bh + 22;
        var cx = [];
        DH.forEach(function (h, i) { cx.push(x0 + i * (bw + gap) + bw / 2); });
        var idxOf = function (id) { var r = 0; DH.forEach(function (h, i) { if (h.id === id) r = i; }); return r; };
        var travel = s.send ? ez(seg(e, 0.05, 0.6)) : 0;
        var arrived = s.send ? seg(e, 0.55, 0.85) : seg(e, 0.1, 0.4);
        var pulseCol = s.kind === 'bc' ? P.yellow : P.teal;
        var active = {};
        if (s.send) active[s.send] = true;
        s.to.forEach(function (id) { active[id] = true; });

        ln(cx[0], swY, cx[2], swY, P.sub + '88', 2);
        if (s.send && travel > 0 && travel < 1) {
            var xs0 = cx[idxOf(s.send)];
            var lo = xs0, hi = xs0;
            s.to.forEach(function (id) { var xv = cx[idxOf(id)]; lo = Math.min(lo, xv); hi = Math.max(hi, xv); });
            var ext = (hi - lo) * Math.max(0, travel * 1.2 - 0.2);
            ln(Math.max(lo, xs0 - ext), swY, Math.min(hi, xs0 + ext), swY, pulseCol + 'ff', 3);
        }
        DH.forEach(function (h, i) {
            var x = x0 + i * (bw + gap);
            var c = colorOf(h.col);
            var on = !!active[h.id];
            var live = on && (h.id === s.send || arrived > 0.3 || !s.send);
            ln(cx[i], top + bh, cx[i], swY, live ? pulseCol + 'ff' : P.sub + '66', live ? 2.4 : 1.4);
            var badge = s.hl[h.id];
            var pb = p.hl[h.id];
            var ba = badge ? (pb && pb[0] === badge[0] ? 1 : arrived) : 0;
            rr(x, top, bw, bh, 6, c + '18', c + (badge || on ? 'ff' : '77'), badge && ba > 0.3 ? 1.9 : 1.2);
            tx(h.name, x + bw / 2, top + 13, fs, c + 'ff', 'center', true);
            if (h.id === 'C') {
                var oldNo = p.cip === NO_IP, newNo = s.cip === NO_IP;
                var ch = oldNo !== newNo ? seg(e, 0.2, 0.6) : 1;
                var ipTxt = function (no) { return no ? (mob ? 'IP 0.0.0.0' : 'IP 없음 (' + NO_IP + ')') : s.cip; };
                if (oldNo !== newNo && ch < 1) {
                    ctx.globalAlpha = 1 - ch;
                    tx(oldNo ? ipTxt(true) : p.cip, x + bw / 2, top + 29 - ch * 8, fs - 1.5, P.sub + 'ff', 'center', false);
                    ctx.globalAlpha = 1;
                }
                ctx.globalAlpha = ch;
                tx(newNo ? ipTxt(true) : s.cip, x + bw / 2, top + 29 + (1 - ch) * 8, fs - 1.5, (newNo ? P.sub : P.green) + 'ff', 'center', false);
                ctx.globalAlpha = 1;
            } else {
                tx(h.id === 'S' ? SERVER_IP : '192.168.0.20', x + bw / 2, top + 29, fs - 1.5, P.sub + 'ff', 'center', false);
            }
            if (badge && ba > 0) {
                ctx.globalAlpha = ba;
                lines(badge[0], bw - 8, fs - 1.5).forEach(function (l, li) {
                    tx(l, x + bw / 2, top + 45 + li * 13, fs - 1.5, c + 'ff', 'center', true);
                });
                ctx.globalAlpha = 1;
            }
        });

        if (s.send && travel > 0 && travel < 1) {
            var xsend = cx[idxOf(s.send)];
            var tag = msgTag(s.label);
            var cw = tag.length * 7.2 + 14;
            s.to.forEach(function (id) {
                var xt = cx[idxOf(id)];
                var d1 = swY - (top + bh), d2 = Math.abs(xt - xsend), d3 = d1;
                var u = travel * (d1 + d2 + d3);
                var px, py;
                if (u <= d1) { px = xsend; py = top + bh + u; }
                else if (u <= d1 + d2) { px = xsend + (xt > xsend ? 1 : -1) * (u - d1); py = swY; }
                else { px = xt; py = swY - (u - d1 - d2); }
                rr(px - cw / 2, py - 9, cw, 18, 5, pulseCol + 'ff', pulseCol + 'ff', 1.4);
                tx(tag, px, py, fs - 1.5, '#111111', 'center', true);
            });
        }
        ctx.globalAlpha = s.label ? clamp01(e * 3) : 1;
        tx(s.label || '스위치로 연결된 같은 LAN', x0 + w / 2, swY + 16, fs - 0.5, (s.label ? pulseCol : P.sub) + 'ff', 'center', true);
        ctx.globalAlpha = 1;

        var stage = stageOf(s), pstage = stageOf(p);
        var names = ['Discover', 'Offer', 'Request', 'Ack'];
        var pw = (w - 3 * 6) / 4, ty = swY + 30;
        names.forEach(function (n, i) {
            var lit = i < stage;
            var fresh = i === stage - 1 && stage !== pstage;
            var done = stage === 4 && !s.label;
            var col = done ? P.green : P.orange;
            var a = fresh ? ez(seg(e, 0.5, 0.9)) : 1;
            rr(x0 + i * (pw + 6), ty, pw, 22, 5, lit ? col + '30' : 'none', lit ? col + 'ff' : P.sub + '66', lit && (i === stage - 1) ? 2 : 1.2);
            if (lit && fresh) {
                ctx.globalAlpha = a;
                rr(x0 + i * (pw + 6), ty, pw, 22, 5, col + '66', col + 'ff', 2);
                ctx.globalAlpha = 1;
            }
            tx(n, x0 + i * (pw + 6) + pw / 2, ty + 11, fs - 1, lit ? P.text + 'ff' : P.sub + 'ff', 'center', true);
        });

        var py0 = ty + 32;
        var cardH = mob ? 100 : 88;
        var same = s.pkt.join('|') === p.pkt.join('|');
        var ca = same ? 1 : ez(seg(e, 0, 0.3));
        rr(x0, py0, w, cardH, 6, 'none', P.sub + '66', 1.2);
        tx('메시지 내용', x0 + 10, py0 + 12, fs - 1, P.sub + 'ff', 'left', true);
        if (s.pkt.length) {
            ctx.globalAlpha = ca;
            var yy = py0 + 30 + (same ? 0 : (1 - ca) * -10);
            var li2 = 0;
            s.pkt.forEach(function (pl, i) {
                lines(pl, w - 20, fs - 0.5).forEach(function (l) {
                    tx(l, x0 + 10, yy + li2 * (fs + 3), fs - 0.5, (i < 2 ? P.text : P.yellow) + 'ff', 'left', i === 2);
                    li2++;
                });
            });
            ctx.globalAlpha = 1;
        } else {
            tx(currentSteps().indexOf(s) > 0 ? '(이 단계에서는 메시지를 보내지 않습니다)' : '(아직 주고받은 메시지가 없습니다)', x0 + 10, py0 + 34, fs - 0.5, P.sub + 'ff', 'left', false);
        }

        var cy = py0 + cardH + 10;
        var lhc = fs + 4;
        rr(x0, cy, w, 24 + 3 * lhc, 6, 'none', P.sub + '66', 1.2);
        tx('클라이언트가 받은 설정', x0 + 10, cy + 12, fs - 1, P.sub + 'ff', 'left', true);
        if (!s.nconf) {
            tx('(아직 없음)', x0 + 10, cy + 30, fs - 0.5, P.sub + 'ff', 'left', false);
        } else {
            var cl = ['IP ' + CONFIG[0].value + ' · 마스크 ' + CONFIG[1].value, '게이트웨이 ' + CONFIG[2].value + ' · DNS ' + CONFIG[3].value, '임대 ' + CONFIG[4].value];
            cl.forEach(function (l, i) {
                var a2 = p.nconf ? 1 : seg(e, 0.5 + i * 0.12, 0.8 + i * 0.12);
                ctx.globalAlpha = a2;
                tx(l, x0 + 10 + (1 - a2) * 14, cy + 30 + i * lhc, fs - 0.5, P.green + 'ff', 'left', false);
                ctx.globalAlpha = 1;
            });
        }
    }

    /* ===================== 임대와 갱신 ===================== */
    function drawLease(x0, top, w, mob, s, p, e, fs) {
        var q = ez(e);
        var barY = top + 44, bh = 26;
        var lx = x0 + 6, lw = w - 12;
        var xAt = function (h) { return lx + lw * h / LEASE_H; };
        var cur = lerp(p.t, s.t, q);
        var segs = [[0, T1_H, 'BOUND', P.green], [T1_H, T2_H, 'RENEWING', P.yellow], [T2_H, LEASE_H, 'REBINDING', P.orange]];
        tx('임대 시간 ' + LEASE_H + '시간 (시각화 예시 값)', x0, top + 10, fs, P.text + 'ff', 'left', true);
        segs.forEach(function (sg) {
            var on = s.state === sg[2];
            var x1 = xAt(sg[0]), x2 = xAt(sg[1]) - 2;
            rr(x1, barY, x2 - x1, bh, 4, sg[3] + (on ? '33' : '14'), sg[3] + (on ? 'ff' : '77'), on ? 2 : 1.2);
            var fillW = Math.max(0, Math.min(x2, xAt(cur)) - x1);
            if (fillW > 0) rr(x1, barY, fillW, bh, 4, sg[3] + '66', 'none', 1);
            if (x2 - x1 < sg[2].length * 7.4 + 8) tx(sg[2], x2, barY - 9, fs - 1.5, (on ? sg[3] : P.sub) + 'ff', 'right', true);
            else tx(sg[2], (x1 + x2) / 2, barY + bh / 2, fs - 1.5, (on ? P.text : P.sub) + 'ff', 'center', true);
        });
        [[0, '0'], [T1_H, 'T1 ' + T1_H + '시간'], [T2_H, 'T2 ' + T2_H + '시간'], [LEASE_H, '만료 ' + LEASE_H + '시간']].forEach(function (m, i) {
            var al = i === 0 ? 'left' : (i === 3 ? 'right' : 'center');
            tx(m[1], xAt(m[0]), barY + bh + 14 + (mob && i === 2 ? 14 : 0), fs - 1.5, P.sub + 'ff', al, false);
        });
        var px = xAt(cur);
        ln(px, barY - 8, px, barY + bh + 2, P.text + 'ff', 2);
        circ(px, barY - 10, 4, P.text + 'ff', 'none', 1);
        var sc = s.state === 'INIT' ? P.red : (s.state === 'BOUND' ? P.green : (s.state === 'RENEWING' ? P.yellow : P.orange));
        tx('상태: ' + s.state, x0, barY + bh + (mob ? 46 : 40), fs, sc + 'ff', 'left', true);
        tx('경과 ' + (Math.round(cur * 10) / 10) + '시간', x0 + w, barY + bh + (mob ? 46 : 40), fs - 0.5, P.sub + 'ff', 'right', true);

        var ey = barY + bh + 60;
        var bw = mob ? 96 : 130;
        var bx = [x0, x0 + w - bw];
        [['클라이언트', P.orange], ['DHCP 서버', P.green]].forEach(function (b, i) {
            rr(bx[i], ey, bw, 30, 6, b[1] + '18', b[1] + 'ff', 1.4);
            tx(b[0], bx[i] + bw / 2, ey + 15, fs - 0.5, b[1] + 'ff', 'center', true);
        });
        var ay = ey + 15;
        ln(bx[0] + bw, ay, bx[1], ay, P.sub + '66', 1.4, [4, 4]);
        var ptxt = s.pkt.join(' ');
        var tag = ptxt.indexOf('DHCPACK') >= 0 ? 'ACK' : (ptxt.indexOf('DHCPREQUEST') >= 0 ? 'REQUEST' : '');
        if (tag) {
            var toServer = s.state !== 'BOUND';
            var lost = s.state === 'REBINDING';
            var u = ez(seg(e, 0.1, 0.8));
            var a0 = toServer ? bx[0] + bw : bx[1], a1 = toServer ? bx[1] : bx[0] + bw;
            var ux = lerp(a0, a1, lost ? u * 0.62 : u);
            var cwid = tag.length * 7.2 + 14;
            ctx.globalAlpha = lost && u > 0.9 ? 0.4 : 1;
            var cc = lost ? P.yellow : (toServer ? P.orange : P.green);
            rr(ux - cwid / 2, ay - 9, cwid, 18, 5, cc + 'ff', cc + 'ff', 1.4);
            tx(tag, ux, ay, fs - 1.5, '#111111', 'center', true);
            ctx.globalAlpha = 1;
            if (lost && u > 0.8) {
                var xa = lerp(a0, a1, 0.7);
                ln(xa - 7, ay - 7, xa + 7, ay + 7, P.red + 'ff', 3);
                ln(xa - 7, ay + 7, xa + 7, ay - 7, P.red + 'ff', 3);
            }
        }

        var py0 = ey + 44;
        var lh = fs + 3;
        var same = s.pkt.join('|') === p.pkt.join('|');
        var ca = same ? 1 : ez(seg(e, 0, 0.3));
        rr(x0, py0, w, lh * 3 + 24, 6, 'none', P.sub + '66', 1.2);
        tx('메시지 내용', x0 + 10, py0 + 12, fs - 1, P.sub + 'ff', 'left', true);
        if (s.pkt.length) {
            ctx.globalAlpha = ca;
            s.pkt.forEach(function (l, i) {
                tx(l, x0 + 10, py0 + 30 + i * lh, fs - 0.5, (i < 1 ? P.text : P.yellow) + 'ff', 'left', false);
            });
            ctx.globalAlpha = 1;
        } else {
            tx('(주고받는 메시지 없음)', x0 + 10, py0 + 34, fs - 0.5, P.sub + 'ff', 'left', false);
        }
    }

    /* ===================== 할당 정보 ===================== */
    function drawOptions(x0, top, w, mob, s, p, e, fs) {
        var k = s.k, pk = p.k;
        var rh = mob ? 38 : 40, gap = 7;
        tx('서버가 알려 주는 정보', x0, top + 10, fs, P.text + 'ff', 'left', true);
        tx(k + '/' + CONFIG.length, x0 + w, top + 10, fs, P.orange + 'ff', 'right', true);
        CONFIG.forEach(function (c, i) {
            var y = top + 26 + i * (rh + gap);
            var shown = k >= i + 1;
            var cur = k === i + 1;
            var fresh = cur && pk < k;
            var q = fresh ? ez(seg(e, 0, 0.6)) : 1;
            var col = cur ? P.orange : (shown ? P.green : P.sub);
            rr(x0, y, w, rh, 6, 'none', P.sub + '44', 1.2);
            if (!shown) {
                tx(c.label, x0 + 10, y + 13, fs - 0.5, P.sub + 'ff', 'left', true);
                tx(c.code, x0 + 10, y + 28, fs - 1.5, P.sub + 'ff', 'left', false);
                return;
            }
            var dx = fresh ? (1 - q) * 40 : 0;
            ctx.globalAlpha = fresh ? q : 1;
            rr(x0 + dx, y, w, rh, 6, cur ? P.orange + '28' : P.green + '10', col + 'ff', cur ? 1.9 : 1.2);
            tx(c.label, x0 + 10 + dx, y + 13, fs - 0.5, P.text + 'ff', 'left', true);
            tx(c.code, x0 + 10 + dx, y + 28, fs - 1.5, (cur ? P.yellow : P.sub) + 'ff', 'left', false);
            var shownLen = fresh ? Math.ceil(c.value.length * ez(seg(e, 0.25, 0.85))) : c.value.length;
            tx(c.value.slice(0, shownLen), x0 + w - 10 + dx, y + rh / 2, fs - 0.5, col + 'ff', 'right', true);
            ctx.globalAlpha = 1;
        });
    }

    function drawScene(x0, top, w, mob, step, prev, t) {
        var L = layout(w, mob);
        var e = clamp01(t);
        var s = step || currentSteps()[0];
        var p = prev || s;
        if (mode === 'lease') drawLease(x0, top, w, mob, s, p, e, L.fs);
        else if (mode === 'option') drawOptions(x0, top, w, mob, s, p, e, L.fs);
        else drawDora(x0, top, w, mob, s, p, e, L.fs);
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