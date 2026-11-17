/**
 * 분기 예측 3D 철도 분기점 장면 (Three.js r128)
 * 2D 시각화의 "3D 철도 분기점" 버튼을 누를 때만 로드된다. 공용 엔진 viz3d-common.js와 2D 단계 데이터(window.CsFlow.branchPredictionData)가 먼저 있어야 한다.
 * 열차(명령어)가 분기 선로 앞 신호에서 기다리다, 전환기가 예측한 선로로 먼저 투기 전송되고, 분기가 확정되면 맞았는지 틀렸는지에 따라 통과하거나 되돌아간다.
 * 장면 수, 자막, 수치, 예측 상태는 2D 단계 데이터에서 계산해 2D와 어긋나지 않게 한다.
 */
(function () {
    'use strict';

    const THREE = window.THREE;
    const D = window.CsFlow && window.CsFlow.branchPredictionData;
    if (!window.CsFlow || !THREE || !window.CsFlow.viz3d || !D) return;

    const V = THREE.Vector3;
    const kit = window.CsFlow.viz3d.kit;
    const SERIF = kit.SERIF;
    const INK = kit.INK;
    const PIPE = D.PIPE_STEPS;
    const BITS = D.BITS_STEPS;
    const ACCS = D.ACC_STEPS;
    const SEQ = D.SEQ;
    const INIT1 = D.INIT1;
    const INIT2 = D.INIT2;
    const PRED1 = D.pred1;
    const PRED2 = D.pred2;
    const AFTER1 = D.after1;
    const AFTER2 = D.after2;
    const PATTERNS = D.PATTERNS;
    const ACC = D.ACC;

    /* ===================== 상수 ===================== */
    const THEMES = {
        dark: { bg: 0x0f0f1a, ground: 0x4a443c, hemi: 0.75, sun: 0.95 },
        light: { bg: 0xe4dccb, ground: 0xb9ae98, hemi: 0.7, sun: 1.0 }
    };
    const COLOR = {
        taken: 0x1d9e75,
        notTaken: 0xff7a2f,
        wrong: 0xe5484d,
        branch: 0x8a5cff,
        ok: 0x2fb36b,
        pending: 0xf0b429,
        steel: 0xb3bcc6,
        tie: 0x6e4b2e,
        post: 0x3b3a44,
        pit: 0x17161d,
        cell: 0x8f98a3
    };
    const PRED_COLOR = [0x8a5cff, 0xff7a2f, 0x1d9e75];
    const PRED_NAME = ['정적 (항상 T)', '1비트', '2비트'];
    const COUNTER_NAME = ['0 SN', '1 WN', '2 WT', '3 ST'];
    const COPY = {
        overview: '열차는 분기 선로를 만나면 어느 쪽으로 갈지 기다리지 않고, 예측기가 미리 맞춰 둔 선로로 먼저 보냅니다. 확정이 맞으면 그대로 통과하고, 틀리면 먼저 보낸 객차를 되돌려 올바른 선로로 다시 보냅니다.',
        predLabel: '예측 방향',
        actualLabel: '실제 방향',
        waiting: '확정 전',
        hit: '적중',
        miss: '실패',
        taken: 'taken',
        notTaken: 'not-taken',
        boardTitle: '분기 예측기',
        accTitle: '분기 100번 적중률',
        branchOf: '분기 #',
        missCount: '누적 틀림',
        bit1: '1비트',
        bit2: '2비트 카운터'
    };
    const RAIL_Y = 0.12;
    const GATE_X = -1.0;
    const MAIN_IN = [[-7.4, 0, 0], [-4.6, 0, 0], [GATE_X, 0, 0]];
    const EXIT_X = 9.4;
    const BRANCH_Z = 1.8;
    const PIT = new V(3.2, -0.42, 3.4);
    const SHOTS = {
        overview: [[2.0, 5.8, 16.5], [1.0, 0.9, 0]],
        wide: [[1.0, 6.8, 19.0], [1.0, 0.6, 0]],
        gate: [[-1.2, 2.9, 6.8], [0.2, 0.3, 0]],
        tower: [[-3.2, 3.0, 8.4], [-4.2, 1.6, -1.8]],
        board: [[1.2, 3.6, 10.5], [1.0, 1.6, -3.8]]
    };

    /* ===================== 2D 데이터에서 계산 ===================== */
    /**
     * 장면 번호별 2D 단계 구간을 만든다. 버튼 번호와 2D 단계 번호를 잇는다.
     * 장면 0은 개요, 1~3은 파이프라인 페널티, 4~5는 1비트·2비트, 6~7은 적중률이다.
     *
     * @returns 장면 구간 배열(kind, from, to)
     */
    function sceneSpans() {
        return [
            { kind: 'over' },
            { kind: 'pipe', from: 0, to: 2 },
            { kind: 'pipe', from: 2, to: 4 },
            { kind: 'pipe', from: 4, to: 6 },
            { kind: 'bits', from: 0, to: 4 },
            { kind: 'bits', from: 4, to: 8 },
            { kind: 'acc', from: 0, to: 3 },
            { kind: 'acc', from: 3, to: 4 }
        ];
    }
    const SPANS = sceneSpans();
    const BADGES = ['OVERVIEW', '예측 성공', '예측 실패', '2사이클 손실', '1비트·2비트 1~4', '1비트·2비트 5~8', '적중률 비교', '정리'];

    /**
     * 분기 j(0부터)의 1비트 상태 전후 값을 돌려준다. j가 0이면 초기 상태다.
     *
     * @param j 분기 번호(0부터)
     * @returns s1(직전 1비트 상태), s2(직전 2비트 카운터)
     */
    function stateBefore(j) {
        return { s1: j === 0 ? INIT1 : AFTER1[j - 1], s2: j === 0 ? INIT2 : AFTER2[j - 1] };
    }

    /**
     * 0부터 j까지 1비트와 2비트가 각각 틀린 횟수를 센다. 2D 예측 값과 실제 결과에서 계산한다.
     *
     * @param j 마지막 분기 번호(포함)
     * @returns miss1, miss2 객체
     */
    function missUpTo(j) {
        const m = { miss1: 0, miss2: 0 };
        for (let i = 0; i <= j && i < SEQ.length; i++) {
            if (PRED1[i] !== SEQ[i]) m.miss1++;
            if (PRED2[i] !== SEQ[i]) m.miss2++;
        }
        return m;
    }

    /* ===================== 캔버스 그리기 도구 ===================== */
    /**
     * 숫자 색을 CSS 색 문자열로 바꾼다.
     *
     * @param n 0xRRGGBB 색
     * @returns #으로 시작하는 문자열
     */
    function hexCss(n) {
        return '#' + n.toString(16).padStart(6, '0');
    }

    /**
     * 바탕과 테두리를 그린다.
     *
     * @param c      2D 컨텍스트
     * @param pw     캔버스 폭
     * @param ph     캔버스 높이
     * @param bg     바탕 색
     * @param border 테두리 색
     * @param lw     테두리 굵기
     */
    function paintFrame(c, pw, ph, bg, border, lw) {
        c.fillStyle = bg;
        c.fillRect(0, 0, pw, ph);
        c.strokeStyle = border;
        c.lineWidth = lw;
        c.strokeRect(lw / 2, lw / 2, pw - lw, ph - lw);
    }

    /**
     * 글자가 최대 폭에 들어갈 때까지 글꼴 크기를 줄여 글꼴을 설정한다.
     *
     * @param c      2D 컨텍스트
     * @param text   그릴 문자열
     * @param maxW   최대 폭
     * @param size   처음 글꼴 크기
     * @param weight 굵기
     * @param family 글꼴 이름
     */
    function fitText(c, text, maxW, size, weight, family) {
        let s = size;
        c.font = weight + ' ' + s + 'px ' + family;
        while (s > 14 && c.measureText(text).width > maxW) {
            s -= 2;
            c.font = weight + ' ' + s + 'px ' + family;
        }
    }

    /**
     * 열차 객차 표면을 그린다. 가운데에 명령어 이름을 적는다.
     *
     * @param text  객차 이름
     * @param color 테두리 색
     * @param c     2D 컨텍스트
     * @param pw    캔버스 폭
     * @param ph    캔버스 높이
     */
    function drawCar(text, color, c, pw, ph) {
        paintFrame(c, pw, ph, '#fffdf6', hexCss(color), 16);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = INK;
        fitText(c, text, pw - 40, Math.round(ph * 0.58), '700', SERIF);
        c.fillText(text, pw / 2, ph / 2 + 2);
    }

    /**
     * 예측기 표지판을 그린다. 파이프라인 장면은 예측 방향과 확정 결과를, 1비트·2비트 장면은 상태와 카운터를 보여 준다.
     *
     * @param st 표시 상태 객체(kind 'idle' | 'pipe' | 'bits')
     * @param c  2D 컨텍스트
     * @param pw 캔버스 폭
     * @param ph 캔버스 높이
     */
    function drawBoard(st, c, pw, ph) {
        paintFrame(c, pw, ph, '#f6ecd6', '#2a2622', 18);
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillStyle = INK;
        if (st.kind === 'pipe') {
            drawPipeRows(st, c, pw, ph);
        } else if (st.kind === 'bits') {
            drawBitsRows(st, c, pw, ph);
        } else {
            c.textAlign = 'center';
            fitText(c, COPY.boardTitle, pw * 0.9, Math.round(ph * 0.22), '700', SERIF);
            c.fillText(COPY.boardTitle, pw / 2, ph / 2);
        }
    }

    /**
     * 파이프라인 장면의 예측 방향, 실제 방향, 결과 줄을 그린다.
     *
     * @param st 표시 상태(pred, actual, hit)
     * @param c  2D 컨텍스트
     * @param pw 캔버스 폭
     * @param ph 캔버스 높이
     */
    function drawPipeRows(st, c, pw, ph) {
        const x = pw * 0.07;
        const fs = Math.round(ph * 0.15);
        c.font = '700 ' + fs + 'px ' + SERIF;
        c.fillStyle = INK;
        c.fillText(COPY.boardTitle, x, ph * 0.18);
        fitText(c, COPY.predLabel + '  ' + (st.pred ? COPY.taken : COPY.notTaken), pw * 0.86, fs, '700', SERIF);
        c.fillStyle = st.pred ? hexCss(COLOR.taken) : hexCss(COLOR.notTaken);
        c.fillText(COPY.predLabel + '  ' + (st.pred ? COPY.taken : COPY.notTaken), x, ph * 0.46);
        fitText(c, COPY.actualLabel + '  ' + (st.actual === null ? COPY.waiting : (st.actual ? COPY.taken : COPY.notTaken)), pw * 0.86, fs, '700', SERIF);
        c.fillStyle = INK;
        c.fillText(COPY.actualLabel + '  ' + (st.actual === null ? COPY.waiting : (st.actual ? COPY.taken : COPY.notTaken)), x, ph * 0.72);
        if (st.hit !== null) {
            c.fillStyle = hexCss(st.hit ? COLOR.ok : COLOR.wrong);
            c.fillText(st.hit ? COPY.hit : COPY.miss, x, ph * 0.9);
        }
    }

    /**
     * 1비트·2비트 장면의 분기 번호, 두 예측기의 상태와 예측, 누적 틀림 줄을 그린다.
     *
     * @param st 표시 상태(j, s1, s2, p1, p2, o, reveal, hit1, hit2, miss1, miss2)
     * @param c  2D 컨텍스트
     * @param pw 캔버스 폭
     * @param ph 캔버스 높이
     */
    function drawBitsRows(st, c, pw, ph) {
        const x = pw * 0.06;
        const fs = Math.round(ph * 0.12);
        const head = COPY.branchOf + (st.j + 1) + (st.reveal ? '  실제 ' + (st.o ? COPY.taken : COPY.notTaken) : '  결과 대기');
        c.font = '700 ' + fs + 'px ' + SERIF;
        c.fillStyle = INK;
        fitText(c, head, pw * 0.88, fs, '700', SERIF);
        c.fillText(head, x, ph * 0.14);
        const r1 = COPY.bit1 + '  상태 ' + (st.s1 ? 'T' : 'N') + '  예측 ' + (st.p1 ? 'T' : 'N') + (st.reveal ? (st.hit1 ? '  적중' : '  실패') : '');
        const r1c = st.reveal ? (st.hit1 ? COLOR.ok : COLOR.wrong) : null;
        fitText(c, r1, pw * 0.88, fs, '700', SERIF);
        c.fillStyle = r1c === null ? INK : hexCss(r1c);
        c.fillText(r1, x, ph * 0.36);
        c.fillStyle = INK;
        const cellY = ph * 0.52;
        const cellH = ph * 0.2;
        const cellW = (pw * 0.88) / 4;
        for (let i = 0; i < 4; i++) {
            const on = i === st.s2;
            const cx = pw * 0.06 + i * cellW;
            c.fillStyle = on ? hexCss(COLOR.pending) : hexCss(COLOR.cell) + '66';
            c.fillRect(cx + 3, cellY, cellW - 6, cellH);
            c.fillStyle = on ? INK : '#2a2622';
            c.font = '700 ' + Math.round(ph * 0.1) + 'px ' + SERIF;
            c.textAlign = 'center';
            c.fillText(COUNTER_NAME[i], cx + cellW / 2, cellY + cellH / 2 + 1);
        }
        c.textAlign = 'left';
        const r2 = COPY.bit2 + ' ' + st.s2 + '  예측 ' + (st.p2 ? 'T' : 'N') + (st.reveal ? (st.hit2 ? '  적중' : '  실패') : '');
        const r2c = st.reveal ? (st.hit2 ? COLOR.ok : COLOR.wrong) : null;
        fitText(c, r2, pw * 0.88, fs, '700', SERIF);
        c.fillStyle = r2c === null ? INK : hexCss(r2c);
        c.fillText(r2, x, ph * 0.84);
        c.fillStyle = INK;
        c.font = '700 ' + Math.round(ph * 0.1) + 'px ' + SERIF;
        c.fillText(COPY.missCount + '  1비트 ' + st.miss1 + ' · 2비트 ' + st.miss2, x, ph * 0.96);
    }

    /**
     * 적중률 표지판을 그린다. 패턴은 열 하나, 예측기는 막대 하나다. 아직 안 보인 패턴은 흐리게 둔다.
     *
     * @param groups 보여 줄 패턴 수
     * @param grow   가장 새로 보이는 패턴의 막대 성장 정도(0~1)
     * @param c      2D 컨텍스트
     * @param pw     캔버스 폭
     * @param ph     캔버스 높이
     */
    function drawAcc(groups, grow, c, pw, ph) {
        paintFrame(c, pw, ph, '#f6ecd6', '#2a2622', 18);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = INK;
        c.font = '700 ' + Math.round(ph * 0.09) + 'px ' + SERIF;
        c.fillText(COPY.accTitle, pw / 2, ph * 0.09);
        const base = ph * 0.8;
        const maxH = ph * 0.5;
        const colW = pw / PATTERNS.length;
        PATTERNS.forEach(function (pt, gi) {
            const on = gi < groups;
            const cx = colW * (gi + 0.5);
            c.globalAlpha = on ? 1 : 0.28;
            c.fillStyle = INK;
            fitText(c, pt.name, colW * 0.92, Math.round(ph * 0.065), '700', SERIF);
            c.fillText(pt.name, cx, ph * 0.18);
            for (let pi = 0; pi < 3; pi++) {
                const bx = cx + (pi - 1) * (colW * 0.27);
                const v = ACC[gi][pi];
                const h = maxH * v / 100 * (gi === groups - 1 ? grow : 1);
                const col = hexCss(PRED_COLOR[pi]);
                c.fillStyle = hexCss(COLOR.cell) + '44';
                c.fillRect(bx - colW * 0.09, base - maxH, colW * 0.18, maxH);
                if (on) {
                    c.fillStyle = col;
                    c.fillRect(bx - colW * 0.09, base - h, colW * 0.18, h);
                    c.fillStyle = col;
                    c.font = '700 ' + Math.round(ph * 0.07) + 'px ' + SERIF;
                    c.fillText(Math.round(v) + '%', bx, base - h - ph * 0.05);
                }
                c.fillStyle = INK;
                c.font = '500 ' + Math.round(ph * 0.055) + 'px ' + SERIF;
                c.fillText(PRED_NAME[pi], bx, base + ph * 0.07);
            }
            c.globalAlpha = 1;
        });
    }

    /* ===================== 장면 구간 해석 ===================== */
    /**
     * 장면 글자를 캔버스에 쓸 때 쓰는 문구를 모아 글꼴 로드용 샘플로 돌려준다.
     *
     * @returns 문자열
     */
    function fontSample() {
        const parts = Object.keys(COPY).map(function (k) { return COPY[k]; });
        BADGES.forEach(function (b) { parts.push(b); });
        PRED_NAME.forEach(function (n) { parts.push(n); });
        COUNTER_NAME.forEach(function (n) { parts.push(n); });
        PATTERNS.forEach(function (p) { parts.push(p.name); });
        parts.push('T N 0123456789%×·#~ 적중실패확정전 taken not-taken 1비트 2비트');
        return parts.join('');
    }

    /**
     * 점 목록을 지나는 곡선을 만든다.
     *
     * @param pts 점 배열([x, y, z])
     * @returns CatmullRom 곡선
     */
    function curveOf(pts) {
        return new THREE.CatmullRomCurve3(pts.map(function (p) { return new V(p[0], p[1], p[2]); }));
    }

    const ANG = Math.atan2(BRANCH_Z, 1.6);
    const BLADE = { A: ANG, B: -ANG };
    const BEQ_PARK = 0.35;
    const ROUTE_PTS = {
        A: [[GATE_X, 0, 0], [0, 0, 0], [1.6, 0, -BRANCH_Z], [4.4, 0, -BRANCH_Z], [6.0, 0, 0], [EXIT_X, 0, 0]],
        B: [[GATE_X, 0, 0], [0, 0, 0], [1.6, 0, BRANCH_Z], [4.4, 0, BRANCH_Z], [6.0, 0, 0], [EXIT_X, 0, 0]]
    };

    /* ===================== 장면 생성 ===================== */
    /**
     * 3D 월드를 만든다. 선로, 전환기, 신호, 예측기 표지판, 열차 객체를 만들고 장면 함수를 돌려준다.
     *
     * @param eng 공용 엔진
     * @returns play, busy, applyTheme 훅
     */
    function createWorld(eng) {
        const scene = eng.scene;
        const canvas2d = eng.canvas2d;
        const texture = eng.texture;
        const tween = eng.tween;
        const invalidate = eng.invalidate;
        const ink = eng.ink;
        const easeInOut = eng.api.easeInOut;
        const state = v3.state;
        const alive = v3.alive;
        const say = v3.setCaption;

        scene.background = new THREE.Color(THEMES.light.bg);
        const hemi = new THREE.HemisphereLight(0xfffaf0, 0x8c9a8e, THEMES.light.hemi);
        scene.add(hemi);
        const sun = new THREE.DirectionalLight(0xfff0d6, THEMES.light.sun);
        sun.position.set(-6, 12, 8);
        scene.add(sun);

        const groundM = new THREE.MeshLambertMaterial({ map: eng.hatch('#ffffff', 0.16, 60, 6), color: THEMES.light.ground });
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), groundM);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.02;
        scene.add(ground);

        const solidMats = {};

        /**
         * 색깔 하나짜리 재료를 돌려준다. 같은 색은 한 번만 만든다.
         *
         * @param c 색
         * @returns 재료
         */
        function solidM(c) {
            if (!solidMats[c]) solidMats[c] = new THREE.MeshLambertMaterial({ color: c });
            return solidMats[c];
        }

        const railM = solidM(COLOR.steel);
        const tieM = solidM(COLOR.tie);

        /**
         * 상자를 만들어 위치를 잡고 씬에 붙인다.
         *
         * @returns 만든 메시
         */
        function box(w, h, d, x, y, z, m, outline) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
            mesh.position.set(x, y, z);
            if (outline) ink(mesh);
            scene.add(mesh);
            return mesh;
        }

        /**
         * 캔버스를 그린 평면을 만든다. redraw로 내용을 다시 그릴 수 있다.
         *
         * @returns mesh와 redraw 함수
         */
        function panel(w, h, pw, ph, draw, basic) {
            const [c, x] = canvas2d(pw, ph);
            const tex = texture(c);
            const mat = basic
                ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false })
                : new THREE.MeshLambertMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
            /**
             * 평면의 그림을 지우고 다시 그린다.
             *
             * @param fn 그리는 함수(컨텍스트, 폭, 높이)
             */
            function redraw(fn) {
                x.clearRect(0, 0, pw, ph);
                fn(x, pw, ph);
                tex.needsUpdate = true;
                invalidate();
            }
            redraw(draw);
            return { mesh: mesh, redraw: redraw };
        }

        /**
         * 점 목록을 따라 레일과 침목을 놓는다. 곡선을 짧은 구간으로 나눠 구간마다 상자를 놓는다.
         *
         * @param pts 점 배열
         */
        function laySpan(pts) {
            const curve = curveOf(pts);
            const N = 48;
            let prev = curve.getPoint(0);
            for (let i = 1; i <= N; i++) {
                const cur = curve.getPoint(i / N);
                const seg = cur.clone().sub(prev);
                const L = seg.length();
                const mid = prev.clone().add(cur).multiplyScalar(0.5);
                const ang = Math.atan2(-seg.z, seg.x);
                const dx = seg.x / L;
                const dz = seg.z / L;
                [-0.13, 0.13].forEach(function (s) {
                    const r = box(L + 0.03, 0.05, 0.05, mid.x - dz * s, RAIL_Y, mid.z + dx * s, railM);
                    r.rotation.y = ang;
                });
                if (i % 3 === 0) {
                    const t = box(0.12, 0.05, 0.5, mid.x, RAIL_Y - 0.04, mid.z, tieM);
                    t.rotation.y = ang;
                }
                prev = cur;
            }
        }

        /* ===================== 선로와 전환기 ===================== */
        laySpan([[-7.4, 0, 0], [0, 0, 0]]);
        laySpan([[0, 0, 0], [1.6, 0, -BRANCH_Z], [4.4, 0, -BRANCH_Z], [6.0, 0, 0], [EXIT_X, 0, 0]]);
        laySpan([[0, 0, 0], [1.6, 0, BRANCH_Z], [4.4, 0, BRANCH_Z], [6.0, 0, 0]]);

        const blade = new THREE.Group();
        blade.position.set(0, RAIL_Y, 0);
        [-0.13, 0.13].forEach(function (s) {
            const r = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.05), railM);
            r.position.set(0.85, 0, s);
            blade.add(r);
        });
        blade.rotation.y = BLADE.A;
        scene.add(blade);

        const MAIN_CURVE = curveOf(MAIN_IN);
        const ROUTE = { A: curveOf(ROUTE_PTS.A), B: curveOf(ROUTE_PTS.B) };

        const pit = box(1.1, 0.3, 1.0, PIT.x, -0.12, PIT.z, solidM(COLOR.pit), true);
        pit.visible = true;

        /* ===================== 신호와 표지판 ===================== */
        const gateM = new THREE.MeshLambertMaterial({ color: COLOR.cell });
        box(0.14, 1.8, 0.14, GATE_X, 0.9, -0.7, solidM(COLOR.post), true);
        const gateLamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), gateM);
        gateLamp.position.set(GATE_X, 1.95, -0.7);
        scene.add(gateLamp);

        box(0.14, 1.3, 0.14, -5.6, 0.65, -2.4, solidM(COLOR.post), true);
        box(0.14, 1.3, 0.14, -3.2, 0.65, -2.4, solidM(COLOR.post), true);
        const predPanel = panel(2.6, 1.4, 640, 344, function (c, pw, ph) { drawBoard({ kind: 'idle' }, c, pw, ph); }, true);
        predPanel.mesh.position.set(-4.4, 2.0, -2.4);
        scene.add(predPanel.mesh);

        const accPanel = panel(3.6, 2.02, 1024, 576, function (c, pw, ph) { drawAcc(0, 1, c, pw, ph); }, true);
        accPanel.mesh.position.set(1.0, 2.2, -3.9);
        scene.add(accPanel.mesh);
        const accPosts = [box(0.12, 1.2, 0.12, -0.6, 0.6, -3.9, solidM(COLOR.post), true), box(0.12, 1.2, 0.12, 2.6, 0.6, -3.9, solidM(COLOR.post), true)];

        /**
         * 예측기 표지판 그림을 바꾼다.
         *
         * @param st 표시 상태 객체
         */
        function setBoard(st) {
            predPanel.redraw(function (c, pw, ph) { drawBoard(st, c, pw, ph); });
        }

        /**
         * 적중률 표지판을 바꾼다. 장면에서만 보이게 켠다.
         *
         * @param groups 보여 줄 패턴 수
         * @param grow   새로 보이는 패턴의 막대 성장 정도
         */
        function setAcc(groups, grow) {
            accPanel.redraw(function (c, pw, ph) { drawAcc(groups, grow, c, pw, ph); });
        }

        /**
         * 신호등 색을 바꾼다.
         *
         * @param k 0 꺼짐, 1 대기, 2 맞음, 3 틀림
         */
        function setGate(k) {
            const col = [COLOR.cell, COLOR.pending, COLOR.ok, COLOR.wrong][k];
            gateM.color.setHex(col);
            invalidate();
        }

        /* ===================== 열차 객체 ===================== */
        /**
         * 명령어 객체 하나를 만든다. 객차 상자와 이름 표지를 붙인다. 처음에는 숨겨 둔다.
         *
         * @param text  표지에 적을 이름
         * @param color 객차 색
         * @returns group과 label(redraw 가능)
         */
        function makeCar(text, color) {
            const group = new THREE.Group();
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.42, 0.5), solidM(color));
            ink(body);
            group.add(body);
            const label = panel(0.8, 0.36, 256, 115, function (c, cw, ch) { drawCar(text, color, c, cw, ch); }, true);
            label.mesh.position.z = 0.256;
            group.add(label.mesh);
            group.visible = false;
            scene.add(group);
            return { group: group, label: label };
        }

        const beq = makeCar('BEQ', COLOR.branch);
        const tok = { T1: makeCar('T1', COLOR.taken), T2: makeCar('T2', COLOR.taken), T3: makeCar('T3', COLOR.taken), F1: makeCar('F1', COLOR.wrong), F2: makeCar('F2', COLOR.wrong) };
        const bcar = makeCar('T', COLOR.taken);
        const allCars = [beq, bcar, tok.T1, tok.T2, tok.T3, tok.F1, tok.F2];

        /**
         * 객차를 곡선의 한 점에 놓고 진행 방향을 맞춘다.
         *
         * @param car   객차
         * @param curve 곡선
         * @param u     곡선 위치(0~1)
         */
        function placeCar(car, curve, u) {
            curve.getPoint(u, car.group.position);
            const t = curve.getTangent(u);
            car.group.rotation.y = Math.atan2(-t.z, t.x);
            car.group.scale.setScalar(1);
            car.group.visible = true;
        }

        /**
         * 객차를 곡선 위에서 구간만큼 옮긴다. 배속을 반영한다.
         *
         * @param car   객차
         * @param curve 곡선
         * @param u0    시작 위치
         * @param u1    끝 위치
         * @param ms    기준 밀리초
         * @returns 완료 Promise
         */
        function ride(car, curve, u0, u1, ms) {
            placeCar(car, curve, u0);
            return tween(ms / state.speed, function (p) {
                const u = u0 + (u1 - u0) * p;
                curve.getPoint(u, car.group.position);
                const t = curve.getTangent(u);
                car.group.rotation.y = Math.atan2(-t.z, t.x);
            }, easeInOut);
        }

        /**
         * 객차를 버림 구덩이로 가라앉혀 지운다. 틀린 방향으로 먼저 간 명령어가 버려지는 모습이다.
         *
         * @param car 객차
         * @param ms  기준 밀리초
         * @returns 완료 Promise
         */
        function sink(car, ms) {
            const from = car.group.position.clone();
            return tween(ms / state.speed, function (p) {
                car.group.position.lerpVectors(from, new V(PIT.x, PIT.y, PIT.z), p);
                car.group.scale.setScalar(1 - 0.85 * p);
            }, easeInOut).then(function () { car.group.visible = false; });
        }

        /**
         * 전환기 날 방향을 바꾼다.
         *
         * @param route "A"(분기 선로) 또는 "B"(순차 선로)
         * @param ms    기준 밀리초
         * @returns 완료 Promise
         */
        function flip(route, ms) {
            const from = blade.rotation.y;
            const to = BLADE[route];
            return tween(ms / state.speed, function (p) { blade.rotation.y = from + (to - from) * p; }, easeInOut);
        }

        /**
         * 전환기 날을 즉시 맞춘다. 장면을 시작하거나 되감을 때 쓴다.
         *
         * @param route "A" 또는 "B"
         */
        function setBlade(route) {
            blade.rotation.y = BLADE[route];
        }

        /**
         * 모든 객차를 숨기고 크기를 되돌린다. 장면 시작 시점에 쓴다.
         */
        function hideCars() {
            allCars.forEach(function (c) {
                c.group.visible = false;
                c.group.scale.setScalar(1);
            });
        }

        /**
         * 장면 사이에 보이는 표지판과 객차 상태를 맞춘다.
         *
         * @param showAcc 적중률 표지판을 보일지 여부
         */
        function setScreens(showAcc) {
            accPanel.mesh.visible = showAcc;
            accPosts.forEach(function (p) { p.visible = showAcc; });
        }

        /**
         * 카메라를 샷에 맞춘다. 화면 비율에 따라 뒤로 물린다.
         *
         * @param key SHOTS의 키
         */
        function view(key) {
            const s = SHOTS[key];
            const aspect = eng.stage.clientWidth / Math.max(1, eng.stage.clientHeight);
            const k = aspect >= 1.5 ? 1 : Math.min(2.2, 1.5 / aspect);
            const t = new V(s[1][0], s[1][1], s[1][2]);
            const p = new V(s[0][0], s[0][1], s[0][2]).sub(t).multiplyScalar(k).add(t);
            eng.api.shot([p.x, p.y, p.z], [t.x, t.y, t.z]);
        }

        /**
         * 파이프라인 장면의 예측판 상태를 만든다.
         *
         * @param pred   예측 방향(true면 taken)
         * @param actual 확정된 실제 방향(확정 전이면 null)
         * @param hit    적중 여부(확정 전이면 null)
         * @returns 표시 상태 객체
         */
        function pipeState(pred, actual, hit) {
            return { kind: 'pipe', pred: pred, actual: actual, hit: hit };
        }

        /**
         * 분기 j의 1비트·2비트 표시 상태를 만든다. 결과를 공개하기 전에는 상태와 예측만 보여 준다.
         *
         * @param j      분기 번호(0부터)
         * @param reveal 실제 결과를 보여 줄지 여부
         * @returns 표시 상태 객체
         */
        function bitsState(j, reveal) {
            const b = stateBefore(j);
            const m = missUpTo(reveal ? j : j - 1);
            return {
                kind: 'bits', j: j, s1: b.s1, s2: b.s2,
                p1: PRED1[j], p2: PRED2[j], o: SEQ[j], reveal: reveal,
                hit1: PRED1[j] === SEQ[j], hit2: PRED2[j] === SEQ[j],
                miss1: m.miss1, miss2: m.miss2
            };
        }

        /**
         * 파이프라인 장면의 시작 상태를 맞춘다. 각 장면은 2D 단계 시작 상태와 같은 배치로 시작한다.
         *
         * @param i 장면 번호
         */
        function resetPipe(i) {
            if (i === 1) {
                setBlade('A');
                placeCar(beq, MAIN_CURVE, 0.3);
                setBoard(pipeState(true, null, null));
            } else if (i === 2) {
                setBlade('B');
                placeCar(beq, MAIN_CURVE, 0.3);
                setBoard(pipeState(false, null, null));
            } else {
                setBlade('A');
                placeCar(beq, ROUTE.A, BEQ_PARK);
                placeCar(tok.T1, ROUTE.A, 0.14);
                setGate(3);
                setBoard(pipeState(false, true, false));
            }
        }

        /**
         * 1비트·2비트 장면의 시작 상태를 맞춘다. 첫 분기 직전의 상태로 돌린다.
         *
         * @param f 장면이 시작하는 분기 번호
         */
        function resetBits(f) {
            setBlade(f === 0 || SEQ[f - 1] ? 'A' : 'B');
            setBoard(bitsState(f, false));
        }

        /**
         * 장면 시작 상태를 맞춘다. 되감기와 이전 장면으로 돌아갈 때도 같은 상태로 되돌린다.
         *
         * @param i 장면 번호
         */
        function reset(i) {
            eng.clearTweens();
            hideCars();
            const sp = SPANS[i];
            setScreens(sp.kind === 'acc');
            setGate(0);
            if (sp.kind === 'over') {
                setBlade('A');
                setBoard({ kind: 'idle' });
                setAcc(0, 1);
            } else if (sp.kind === 'pipe') {
                resetPipe(i);
            } else if (sp.kind === 'bits') {
                resetBits(sp.from);
            } else {
                setAcc(sp.from, 1);
                setBoard({ kind: 'idle' });
            }
            invalidate();
        }

        /**
         * 1비트·2비트 장면의 분기 하나를 만든다. 열차가 신호에서 기다렸다가 확정된 선로로 간다.
         *
         * @param j 분기 번호(0부터)
         * @returns 장면 항목(tag, log, shot, steps)
         */
        function bitSub(j) {
            const taken = SEQ[j] === 1;
            const route = taken ? 'A' : 'B';
            return {
                tag: 'BITS', log: BITS[j].log, shot: 'tower',
                steps: [
                    function () {
                        setBoard(bitsState(j, false));
                        bcar.label.redraw(function (c, pw, ph) { drawCar(taken ? 'T' : 'N', taken ? COLOR.taken : COLOR.notTaken, c, pw, ph); });
                        return ride(bcar, MAIN_CURVE, 0.3, 1, 600);
                    },
                    function () {
                        setGate(PRED2[j] === SEQ[j] ? 2 : 3);
                        setBoard(bitsState(j, true));
                        return flip(route, 350);
                    },
                    function () { return ride(bcar, ROUTE[route], 0, 1, 800); },
                    function () { bcar.group.visible = false; return null; }
                ]
            };
        }

        /**
         * 파이프라인 장면 세 개의 진행 항목을 만든다. 2D 단계 로그를 그대로 쓴다.
         *
         * @param i 장면 번호
         * @returns 장면 항목 배열
         */
        function pipeScript(i) {
            if (i === 1) {
                return [
                    { tag: 'PIPELINE', log: PIPE[0].log, shot: 'gate', steps: [
                        function () { setGate(1); return ride(tok.T1, ROUTE.A, 0, 0.72, 1100); }
                    ] },
                    { tag: 'PIPELINE', log: PIPE[1].log, shot: 'gate', steps: [
                        function () { return Promise.all([ride(tok.T2, ROUTE.A, 0, 0.6, 700), ride(tok.T3, ROUTE.A, 0, 0.5, 700)]); },
                        function () { return ride(beq, MAIN_CURVE, 0.3, 1, 800); },
                        function () { setGate(2); setBoard(pipeState(true, true, true)); return ride(beq, ROUTE.A, 0, BEQ_PARK, 900); },
                        function () { view('wide'); return null; }
                    ] }
                ];
            }
            if (i === 2) {
                return [
                    { tag: 'PIPELINE', log: PIPE[2].log, shot: 'gate', steps: [
                        function () { setGate(1); return ride(tok.F1, ROUTE.B, 0, 0.5, 900); },
                        function () { return ride(tok.F2, ROUTE.B, 0, 0.38, 600); },
                        function () { return ride(beq, MAIN_CURVE, 0.3, 1, 800); }
                    ] },
                    { tag: 'PIPELINE', log: PIPE[3].log, shot: 'gate', steps: [
                        function () { setGate(3); setBoard(pipeState(false, true, false)); return Promise.all([sink(tok.F1, 450), sink(tok.F2, 450)]); },
                        function () { return flip('A', 500); },
                        function () { return ride(beq, ROUTE.A, 0, BEQ_PARK, 900); },
                        function () { return ride(tok.T1, ROUTE.A, 0, 0.14, 600); },
                        function () { view('wide'); return null; }
                    ] }
                ];
            }
            return [
                { tag: 'PIPELINE', log: PIPE[4].log, shot: 'gate', steps: [
                    function () { return ride(beq, ROUTE.A, BEQ_PARK, 1, 900); },
                    function () { beq.group.visible = false; return ride(tok.T1, ROUTE.A, 0.14, 1, 1000); }
                ] },
                { tag: 'PIPELINE', log: PIPE[5].log, shot: 'wide', steps: [
                    function () { setBoard(pipeState(false, true, false)); return null; }
                ] }
            ];
        }

        /**
         * 1비트·2비트 장면의 진행 항목을 만든다. 분기 한 개가 한 항목이다.
         *
         * @param f 시작 분기 번호
         * @param t 끝 분기 번호(제외)
         * @returns 장면 항목 배열
         */
        function bitsScript(f, t) {
            const subs = [];
            for (let j = f; j < t; j++) subs.push(bitSub(j));
            if (t === SEQ.length) {
                subs.push({ tag: 'BITS', log: BITS[SEQ.length].log, shot: 'tower', steps: [
                    function () { setBoard(bitsState(SEQ.length - 1, true)); return null; }
                ] });
            }
            return subs;
        }

        /**
         * 적중률 장면의 진행 항목을 만든다. 패턴 하나가 새로 보일 때 막대가 자란다.
         *
         * @param f 시작 항목 번호
         * @param t 끝 항목 번호(제외)
         * @returns 장면 항목 배열
         */
        function accScript(f, t) {
            const subs = [];
            for (let k = f; k < t; k++) {
                const groups = ACCS[k].groups;
                const prev = k === 0 ? 0 : ACCS[k - 1].groups;
                subs.push({ tag: 'ACCURACY', log: ACCS[k].log, shot: 'board', steps: [
                    function () {
                        if (groups === prev) { setAcc(groups, 1); return null; }
                        return tween(900 / state.speed, function (p) { setAcc(groups, p); });
                    }
                ] });
            }
            return subs;
        }

        /**
         * 장면 번호에 맞는 진행 항목을 만든다.
         *
         * @param i 장면 번호
         * @returns 장면 항목 배열
         */
        function scriptOf(i) {
            const sp = SPANS[i];
            if (sp.kind === 'pipe') return pipeScript(i);
            if (sp.kind === 'bits') return bitsScript(sp.from, sp.to);
            return accScript(sp.from, sp.to);
        }

        /**
         * 장면 하나를 시작 상태에서 끝까지 재생한다. 각 항목 사이에 세대 번호를 확인해 되감기 때 멈춘다.
         *
         * @param i 장면 번호
         * @param g 장면 시작 시점의 세대 번호
         */
        async function play(i, g) {
            reset(i);
            if (SPANS[i].kind === 'over') {
                view('overview');
                say('Overview', COPY.overview);
                return;
            }
            const subs = scriptOf(i);
            for (let s = 0; s < subs.length; s++) {
                if (!alive(g)) return;
                say(subs[s].tag, subs[s].log);
                view(subs[s].shot);
                for (let k = 0; k < subs[s].steps.length; k++) {
                    if (!alive(g)) return;
                    await subs[s].steps[k]();
                }
            }
            if (!alive(g)) return;
            view('wide');
        }

        /**
         * 사이트 테마에 맞춰 배경, 바닥, 조명을 바꾼다.
         */
        function applyTheme() {
            const th = window.CsFlow.viz3d.isLight() ? THEMES.light : THEMES.dark;
            scene.background.setHex(th.bg);
            groundM.color.setHex(th.ground);
            hemi.intensity = th.hemi;
            sun.intensity = th.sun;
        }

        reset(0);

        return {
            play: play,
            busy: function () { return false; },
            applyTheme: applyTheme
        };
    }

    /* ===================== 3D 컨트롤러 ===================== */
    const v3 = window.CsFlow.viz3d.create({
        title: 'Branch Prediction 3D',
        badges: BADGES,
        canvasLabel: '분기 예측을 철도 분기점으로 보여 주는 3D 장면. 열차가 전환기 앞 신호에서 기다리다 예측한 선로로 먼저 보내지고, 분기가 확정되면 통과하거나 되돌아갑니다. 아래 장면 버튼으로 과정을 따라갑니다.',
        home: { p: SHOTS.overview[0], t: SHOTS.overview[1] },
        load: function () { return kit.loadFonts(fontSample()); },
        createWorld: createWorld
    });

    v3.setSteps(BADGES.map(function (_, i) {
        return function (g) { return v3.state.world.play(i, g); };
    }));
})();