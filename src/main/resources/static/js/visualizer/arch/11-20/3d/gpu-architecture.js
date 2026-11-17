/**
 * GPU 아키텍처 3D 응원 카드섹션 장면 (Three.js r128)
 * 2D 시각화의 "3D 카드섹션" 버튼을 누를 때만 로드된다. 공용 엔진 viz3d-common.js와 2D 단계 데이터(window.CsFlow.gpuData)가 먼저 있어야 한다.
 * 관중석의 관중 한 명이 스레드 하나다. 지휘자 신호에 맞춰 같은 순간에 색 카드를 뒤집고, 반대편 CPU 코어는 한 명씩 차례로 칸을 채운다.
 */
(function () {
    'use strict';

    const THREE = window.THREE;
    if (!window.CsFlow || !THREE || !window.CsFlow.viz3d || !window.CsFlow.gpuData) return;

    const V = THREE.Vector3;
    const kit = window.CsFlow.viz3d.kit;
    const SERIF = kit.SERIF;
    const INK = kit.INK;

    /* ===================== 2D 데이터 (단계 값의 원본) ===================== */
    const DATA = window.CsFlow.gpuData;
    const ELEMS = DATA.elems;
    const CPU_CORES = DATA.cpuCores;
    const CPU_ROUNDS = DATA.cpuRounds;
    const GPU_CORES = DATA.gpuCores;
    const GPU_ROUNDS = DATA.gpuRounds;
    const FEW = DATA.gpFew;
    const LANES = DATA.lanes;
    const PRED = DATA.pred;
    const CNT_A = DATA.cntA;
    const CNT_B = DATA.cntB;
    const T_MAX = DATA.tMax;
    const SIMS = DATA.sims;
    const CG = DATA.cgSteps;
    const WARP = DATA.warpSteps;
    const LAT = DATA.latSteps;

    /* ===================== 상수 ===================== */
    const BADGES = ['OVERVIEW', 'CPU', 'GPU', 'WARP', 'LATENCY', 'SUMMARY'];
    const BLOCK = 8;
    const PER_ROW = LANES / BLOCK;
    const ROWS = GPU_CORES / PER_ROW;
    const SEATS = LANES * ROWS;
    const SIDE = Math.round(Math.sqrt(ELEMS));
    const SEAT_X = 0.36;
    const X0 = -1.5;
    const ROW_Y0 = 0.4;
    const ROW_DY = 0.28;
    const ROW_DZ = 0.5;
    const ROW_Z0 = -1.2;
    const COND = { x: X0, z: 2.6 };
    const CPU_MID = -8.0;
    const CPU_GAP = 0.85;
    const BOARD = { x: 7.2, y: 2.6, z: 0.8, s: 3.0 };
    const PAL = [0x1d9e75, 0x8a5cff, 0xff7a2f, 0xe6b422, 0x3b82d6, 0xe24b4a, 0xd65ca8, 0x6bbf59];
    const REST = 0xeee9dc;
    const DIM = 0x8d877c;
    const SHIRT = [0x3d4a5c, 0x5c4a3d, 0x2f5d55, 0x6b3a46, 0x44506e, 0x6f6a3b];
    const THEMES = {
        dark: { bg: 0x0d1016, ground: 0x23452f, stand: 0x4d5663, hemi: 0.75, sun: 0.9 },
        light: { bg: 0xdde4e8, ground: 0xa6bd8c, stand: 0xb7bdc4, hemi: 0.85, sun: 0.7 }
    };
    const SHOTS = {
        wide: { t: [-0.6, 2.0, -1.5], dir: [0, 0.3, 1], w: 20, h: 7.5 },
        crowd: { t: [-1.5, 2.0, -3.4], dir: [0, 0.3, 1], w: 13.5, h: 6.4 },
        front: { t: [-1.5, 1.4, -1.2], dir: [0, 0.3, 1], w: 12.6, h: 4.2 }
    };
    const HOME = { p: [1.2, 5.6, 19.5], t: [-0.6, 2.0, -1.5] };

    /* ===================== 파생 값 (2D 데이터에서 계산) ===================== */
    const BLOCKS = GPU_CORES;
    const ROW_SEATS = [];
    const BLOCK_SEATS = [];
    for (let r = 0; r < ROWS; r++) {
        const row = [];
        for (let c = 0; c < LANES; c++) row.push(r * LANES + c);
        ROW_SEATS.push(row);
    }
    for (let b = 0; b < BLOCKS; b++) {
        const r = Math.floor(b / PER_ROW);
        const k = b % PER_ROW;
        BLOCK_SEATS.push(ROW_SEATS[r].slice(k * BLOCK, k * BLOCK + BLOCK));
    }

    /**
     * 원소 번호에 맞는 결과 그림의 픽셀 색을 돌려준다.
     *
     * @param e 원소 번호
     * @returns 0xRRGGBB 색 번호
     */
    function pixColor(e) {
        return PAL[(e + Math.floor(e / SIDE) * 3) % PAL.length];
    }

    /**
     * 빈 결과 그림 배열을 돌려준다.
     *
     * @returns 원소 수만큼 null인 배열
     */
    function blankPic() {
        return new Array(ELEMS).fill(null);
    }

    /**
     * 모든 원소가 채워진 결과 그림 배열을 돌려준다.
     *
     * @returns 원소마다 픽셀 색이 들어 있는 배열
     */
    function fullPic() {
        const a = [];
        for (let e = 0; e < ELEMS; e++) a.push(pixColor(e));
        return a;
    }

    /**
     * 워프 줄에서 레인 번호에 맞는 경로 색을 돌려준다. A 경로는 보라, B 경로는 주황이다.
     *
     * @param c 레인 번호
     * @returns 0xRRGGBB 색 번호
     */
    function laneColor(c) {
        return PRED[c] === 'A' ? PAL[1] : PAL[2];
    }

    /**
     * 색 번호를 캔버스용 16진 문자열로 바꾼다.
     *
     * @param n 0xRRGGBB 색 번호
     * @returns #으로 시작하는 6자리 문자열
     */
    function hex6(n) {
        return '#' + n.toString(16).padStart(6, '0');
    }

    /**
     * 글자가 최대 폭을 넘지 않도록 글꼴 크기를 줄여 설정한다.
     *
     * @param x    2D 컨텍스트
     * @param str  그릴 문자열
     * @param maxW 최대 폭
     * @param size 시작 글꼴 크기
     */
    function fitFont(x, str, maxW, size) {
        let fs = size;
        x.font = '700 ' + fs + 'px ' + SERIF;
        while (x.measureText(str).width > maxW && fs > 16) {
            fs -= 2;
            x.font = '700 ' + fs + 'px ' + SERIF;
        }
    }

    /**
     * 캔버스에 쓰는 문구를 모아 글꼴 로드용 샘플로 돌려준다.
     *
     * @returns 문자열
     */
    function fontSample() {
        return ['큰 그림 · 결과 픽셀', '실행 상황', '처리', '활성 코어', '라운드', '워프', '스레드', '경로 A', '경로 B',
            '실행 횟수', '꺼진 채 기다림', '계산 유닛 활용률', '사이클', '전체 실행', '결과 그림 완성', '같은 명령 · 다른 데이터',
            '명령 1개 · 같은 덧셈', '관중', '구역', '줄', 'CPU 코어', '한 명씩 차례로', 'GPU 스레드', '활용률', '0123456789/% 124'].join(' ');
    }

    /* ===================== 월드(씬) ===================== */
    /**
     * Three.js 씬을 만든다. 관중석(512명 = 스레드), 지휘자, CPU 코어 4명, 결과 그림판과 안내판을 포함한다.
     *
     * @param eng 공용 엔진
     * @returns 월드 API(play)와 프레임·테마 훅(frame, busy, applyTheme)
     */
    function createWorld(eng) {
        const scene = eng.scene;
        const state = v3.state;
        const alive = v3.alive;
        const wait = v3.wait;
        const say = v3.setCaption;
        const lowEnd = eng.lowEnd;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const tA = new Float32Array(SEATS);
        const ca = new Float32Array(SEATS);
        const tL = new Float32Array(SEATS);
        const cl = new Float32Array(SEATS);
        const tC = new Array(SEATS).fill(REST);
        const SX = new Float32Array(SEATS);
        const SY = new Float32Array(SEATS);
        const SZ = new Float32Array(SEATS);
        const bd = { pic: null, big: '', small: '' };
        const tmpP = new V();
        const tmpS = new V(1, 1, 1);
        const tmpQ = new THREE.Quaternion();
        const tmpM = new THREE.Matrix4();
        const tmpC = new THREE.Color();
        const IDQ = new THREE.Quaternion();
        const AXIS_X = new V(1, 0, 0);
        let moving = false;
        let lastT = null;

        for (let i = 0; i < SEATS; i++) {
            const r = Math.floor(i / LANES);
            const c = i % LANES;
            SX[i] = X0 + (c - (LANES - 1) / 2) * SEAT_X;
            SY[i] = ROW_Y0 + r * ROW_DY;
            SZ[i] = ROW_Z0 - r * ROW_DZ;
        }

        scene.background = new THREE.Color(THEMES.dark.bg);
        const hemi = new THREE.HemisphereLight(0xfff8ec, 0x6d7a6a, THEMES.dark.hemi);
        const sun = new THREE.DirectionalLight(0xfff0d6, THEMES.dark.sun);
        sun.position.set(-6, 14, 10);
        scene.add(hemi, sun);

        const groundM = new THREE.MeshLambertMaterial({ color: THEMES.dark.ground });
        const standM = new THREE.MeshLambertMaterial({ color: THEMES.dark.stand });
        const steelM = new THREE.MeshLambertMaterial({ color: 0x3b4451 });
        const podiumM = new THREE.MeshLambertMaterial({ color: 0x59606c });
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), groundM);
        ground.rotation.x = -Math.PI / 2;
        scene.add(ground);

        /**
         * 상자를 만들어 위치를 잡고 씬에 붙인다.
         *
         * @param w 폭
         * @param h 높이
         * @param d 깊이
         * @param x 가운데 x
         * @param y 가운데 y
         * @param z 가운데 z
         * @param m 재료
         * @returns 만든 메시
         */
        function solid(w, h, d, x, y, z, m) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
            mesh.position.set(x, y, z);
            scene.add(mesh);
            return mesh;
        }

        for (let r = 0; r < ROWS; r++) {
            const top = ROW_Y0 + r * ROW_DY;
            solid(LANES * SEAT_X + 0.5, top, ROW_DZ, X0, top / 2, ROW_Z0 - r * ROW_DZ, standM);
        }

        /**
         * 캔버스를 그린 평면을 만든다. redraw로 내용을 다시 그릴 수 있다.
         *
         * @param w     평면 폭
         * @param h     평면 높이
         * @param pw    캔버스 폭
         * @param ph    캔버스 높이
         * @param draw  처음 그릴 함수 (컨텍스트, 폭, 높이)
         * @param basic 조명을 받지 않는 재료면 true
         * @returns 메시와 redraw 함수
         */
        function panel(w, h, pw, ph, draw, basic) {
            const [c, x] = eng.canvas2d(pw, ph);
            const tex = eng.texture(c);
            const mat = basic
                ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false })
                : new THREE.MeshLambertMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
            /**
             * 평면의 그림을 지우고 다시 그린다.
             *
             * @param fn 그리기 함수 (컨텍스트, 폭, 높이)
             */
            function redraw(fn) {
                x.clearRect(0, 0, pw, ph);
                fn(x, pw, ph);
                tex.needsUpdate = true;
                eng.invalidate();
            }
            redraw(draw);
            return { mesh: mesh, redraw: redraw };
        }

        /**
         * 안내판을 만들어 씬에 붙인다. 줄마다 글씨 크기를 맞춘다.
         *
         * @param lines  안내 문구 줄 배열
         * @param w      안내판 폭
         * @param h      안내판 높이
         * @param accent 테두리 색 번호
         * @param x0     가운데 x
         * @param y0     가운데 y
         * @param z0     가운데 z
         */
        function signPanel(lines, w, h, accent, x0, y0, z0) {
            const pw = 1024;
            const ph = Math.round(pw * h / w);
            const p = panel(w, h, pw, ph, function (x, cw, chh) {
                x.fillStyle = '#f6ecd6';
                x.fillRect(0, 0, cw, chh);
                x.strokeStyle = hex6(accent);
                x.lineWidth = 14;
                x.strokeRect(7, 7, cw - 14, chh - 14);
                x.fillStyle = INK;
                x.textAlign = 'center';
                x.textBaseline = 'middle';
                lines.forEach(function (s, j) {
                    fitFont(x, s, cw - 60, Math.floor(chh / (lines.length * 1.5)));
                    x.fillText(s, cw / 2, chh * (j + 1) / (lines.length + 1));
                });
            }, true);
            p.mesh.position.set(x0, y0, z0);
            scene.add(p.mesh);
        }

        /**
         * 사람 모양(몸통, 머리)을 만들어 씬에 붙인다.
         *
         * @param x     가운데 x
         * @param y     발 높이
         * @param z     가운데 z
         * @param sc    크기 배율
         * @param shirt 몸통 색 번호
         * @returns 그룹 메시와 머리 위치
         */
        function figure(x, y, z, sc, shirt) {
            const g = new THREE.Group();
            const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.24), new THREE.MeshLambertMaterial({ color: shirt }));
            torso.position.y = 0.25;
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 9), new THREE.MeshLambertMaterial({ color: 0xe2b98f }));
            head.position.y = 0.66;
            g.add(torso);
            g.add(head);
            g.position.set(x, y, z);
            g.scale.setScalar(sc);
            scene.add(g);
            return { g: g, head: new V(x, y + 0.66 * sc, z) };
        }

        solid(0.1, BOARD.y - 1.5, 0.1, BOARD.x - 1.1, (BOARD.y - 1.5) / 2, BOARD.z - 0.12, steelM);
        solid(0.1, BOARD.y - 1.5, 0.1, BOARD.x + 1.1, (BOARD.y - 1.5) / 2, BOARD.z - 0.12, steelM);

        /**
         * 결과 그림판을 그린다. 그림이 있으면 8x8 픽셀과 아랫글씨를, 없으면 가운데 글씨만 그린다.
         *
         * @param x  캔버스 컨텍스트
         * @param pw 폭
         * @param ph 높이
         */
        function boardDraw(x, pw, ph) {
            x.fillStyle = '#fbf8f1';
            x.fillRect(0, 0, pw, ph);
            x.strokeStyle = '#2a2622';
            x.lineWidth = 10;
            x.strokeRect(6, 6, pw - 12, ph - 12);
            x.textAlign = 'center';
            x.textBaseline = 'middle';
            if (bd.pic) {
                const cell = 48;
                const gx = (pw - cell * SIDE) / 2;
                const gy = 60;
                for (let e = 0; e < ELEMS; e++) {
                    x.fillStyle = bd.pic[e] === null ? '#e4ded0' : hex6(bd.pic[e]);
                    x.fillRect(gx + (e % SIDE) * cell + 2, gy + Math.floor(e / SIDE) * cell + 2, cell - 4, cell - 4);
                }
                x.fillStyle = '#6b6358';
                fitFont(x, '큰 그림 · 결과 픽셀', pw - 60, 26);
                x.fillText('큰 그림 · 결과 픽셀', pw / 2, 30);
                x.fillStyle = INK;
                fitFont(x, bd.big, pw - 40, 40);
                x.fillText(bd.big, pw / 2, 466);
                x.fillStyle = '#6b6358';
                fitFont(x, bd.small, pw - 40, 24);
                x.fillText(bd.small, pw / 2, 498);
            } else {
                x.fillStyle = INK;
                fitFont(x, bd.big, pw - 40, 46);
                x.fillText(bd.big, pw / 2, ph * 0.42);
                x.fillStyle = '#6b6358';
                fitFont(x, bd.small, pw - 40, 30);
                x.fillText(bd.small, pw / 2, ph * 0.6);
            }
        }
        const board = panel(BOARD.s, BOARD.s, 512, 512, boardDraw, true);
        board.mesh.position.set(BOARD.x, BOARD.y, BOARD.z);
        scene.add(board.mesh);

        signPanel(['관중 ' + SEATS + '명 = GPU 스레드', '구역 ' + BLOCK + '명 = 코어 1개 · 줄 ' + LANES + '명 = 워프 1개'],
            7.4, 1.1, 0x1d9e75, X0, 5.6, ROW_Z0 - (ROWS - 1) * ROW_DZ - 0.7);

        const cond = figure(COND.x, 0.5, COND.z, 1.35, 0x17151c);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), new THREE.MeshLambertMaterial({ color: 0xe6b422 }));
        arm.position.set(0.24, 0.72, 0);
        cond.g.add(arm);
        solid(1.8, 0.5, 1.2, COND.x, 0.25, COND.z, podiumM);
        signPanel(['명령 1개 · 같은 덧셈'], 1.6, 0.36, 0xe6b422, COND.x, 0.25, COND.z + 0.605);

        const cpuMidGap = CPU_GAP * (CPU_CORES - 1) + 1.1;
        solid(cpuMidGap, 0.4, 1.2, CPU_MID, 0.2, COND.z, podiumM);
        signPanel(['CPU 코어 ' + CPU_CORES + '개 · 한 명씩 차례로'], cpuMidGap - 0.4, 0.34, 0x3b82d6, CPU_MID, 0.22, COND.z + 0.605);

        /**
         * 글로우 스프라이트를 켜거나 끄고 다시 그리게 한다.
         *
         * @param s  스프라이트
         * @param on 켤지 여부
         */
        function glowSet(s, on) {
            s.visible = on;
            eng.invalidate();
        }

        const condGlow = eng.glow(0xffd166, 2.2);
        condGlow.position.set(COND.x, cond.head.y + 0.2, COND.z);
        condGlow.visible = false;
        scene.add(condGlow);

        const cpuGlow = [];
        for (let k = 0; k < CPU_CORES; k++) {
            const x = CPU_MID + (k - (CPU_CORES - 1) / 2) * CPU_GAP;
            const f = figure(x, 0.4, COND.z, 1.2, 0x3b6ea5);
            const s = eng.glow(0xff7a2f, 1.2);
            s.position.copy(f.head);
            s.visible = false;
            scene.add(s);
            cpuGlow.push(s);
        }

        const bodyGeo = new THREE.BoxGeometry(0.24, 0.4, 0.18);
        const headGeo = new THREE.SphereGeometry(0.09, lowEnd ? 6 : 10, lowEnd ? 4 : 7);
        const cardGeo = new THREE.BoxGeometry(0.2, 0.24, 0.02);
        const bodyIM = new THREE.InstancedMesh(bodyGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), SEATS);
        const headIM = new THREE.InstancedMesh(headGeo, new THREE.MeshLambertMaterial({ color: 0xe2b98f }), SEATS);
        const cardIM = new THREE.InstancedMesh(cardGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), SEATS);
        [bodyIM, headIM, cardIM].forEach(function (m) {
            m.frustumCulled = false;
            m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            scene.add(m);
        });
        for (let i = 0; i < SEATS; i++) {
            bodyIM.setColorAt(i, tmpC.setHex(SHIRT[(i * 7 + Math.floor(i / LANES)) % SHIRT.length]));
            cardIM.setColorAt(i, tmpC.setHex(REST));
        }

        /**
         * 관중 한 명마다 몸통, 머리, 카드의 자리와 방향을 현재 값으로 맞춘다.
         */
        function applySeats() {
            for (let i = 0; i < SEATS; i++) {
                const lift = cl[i] * 0.12;
                tmpP.set(SX[i], SY[i] + 0.2 + lift, SZ[i]);
                bodyIM.setMatrixAt(i, tmpM.compose(tmpP, IDQ, tmpS));
                tmpP.set(SX[i], SY[i] + 0.49 + lift, SZ[i]);
                headIM.setMatrixAt(i, tmpM.compose(tmpP, IDQ, tmpS));
                tmpP.set(SX[i], SY[i] + 0.33 + lift, SZ[i] + 0.16);
                tmpQ.setFromAxisAngle(AXIS_X, ca[i]);
                cardIM.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS));
                cardIM.setColorAt(i, tmpC.setHex(ca[i] > Math.PI / 2 ? tC[i] : REST));
            }
            bodyIM.instanceMatrix.needsUpdate = true;
            headIM.instanceMatrix.needsUpdate = true;
            cardIM.instanceMatrix.needsUpdate = true;
            cardIM.instanceColor.needsUpdate = true;
        }

        /**
         * 관중 한 명의 목표 상태를 정한다. on이면 카드를 뒤집어 색을 보이고, lift면 몸을 일으킨다.
         *
         * @param i    관중 번호
         * @param on   카드를 뒤집을지 여부
         * @param col  앞면 색 번호
         * @param lift 몸을 일으킬지 여부
         */
        function seatTo(i, on, col, lift) {
            tA[i] = on ? Math.PI : 0;
            tC[i] = col;
            tL[i] = lift ? 1 : 0;
            eng.invalidate();
        }

        /**
         * 여러 관중의 목표 상태를 한꺼번에 정한다.
         *
         * @param list 관중 번호 배열
         * @param on   카드를 뒤집을지 여부
         * @param col  앞면 색 번호
         * @param lift 몸을 일으킬지 여부
         */
        function setSeats(list, on, col, lift) {
            list.forEach(function (i) { seatTo(i, on, col, lift); });
        }

        /**
         * 관중석 전체의 목표 상태를 정한다.
         *
         * @param on   카드를 뒤집을지 여부
         * @param col  앞면 색 번호
         * @param lift 몸을 일으킬지 여부
         */
        function setAllSeats(on, col, lift) {
            for (let i = 0; i < SEATS; i++) seatTo(i, on, col, lift);
        }

        /**
         * 현재 값을 목표 값으로 바로 맞춘다. 장면을 처음 상태로 되돌릴 때 쓴다.
         */
        function snapSeats() {
            ca.set(tA);
            cl.set(tL);
        }

        /**
         * 관중의 현재 값을 목표 쪽으로 조금 옮긴다.
         *
         * @param dt 지난 시간(밀리초)
         * @returns 아직 움직이는 관중이 있으면 true
         */
        function stepSeats(dt) {
            const k = reduced ? 1 : 1 - Math.exp(-dt / 1000 * 8 * state.speed);
            let mv = false;
            for (let i = 0; i < SEATS; i++) {
                ca[i] += (tA[i] - ca[i]) * k;
                cl[i] += (tL[i] - cl[i]) * k;
                if (Math.abs(tA[i] - ca[i]) < 0.002) ca[i] = tA[i]; else mv = true;
                if (Math.abs(tL[i] - cl[i]) < 0.002) cl[i] = tL[i]; else mv = true;
            }
            return mv;
        }

        /**
         * 결과 그림판과 아랫글씨를 새로 그린다.
         *
         * @param pic   원소별 픽셀 색 배열 (없으면 null)
         * @param big   큰 글씨
         * @param small 작은 글씨
         */
        function setBoard(pic, big, small) {
            bd.pic = pic;
            bd.big = big;
            bd.small = small;
            board.redraw(boardDraw);
        }

        /**
         * 장면을 단계 시작 상태로 되돌린다. 관중은 모두 흰 카드로 앉고 신호와 글로우는 끈다.
         *
         * @param pic   결과 그림판 배열 (없으면 null)
         * @param big   그림판 큰 글씨
         * @param small 그림판 작은 글씨
         */
        function resetScene(pic, big, small) {
            setAllSeats(false, REST, false);
            snapSeats();
            condGlow.visible = false;
            cpuGlow.forEach(function (s) { s.visible = false; });
            setBoard(pic, big, small);
        }

        /**
         * 카메라 구도를 잡는다. 화면 비율과 폭, 높이에 맞춰 거리를 정한다.
         *
         * @param key SHOTS의 구도 이름
         */
        function view(key) {
            const s = SHOTS[key];
            const sw = eng.stage.clientWidth || 1;
            const sh = eng.stage.clientHeight || 1;
            const tanHalf = Math.tan((sw < 520 ? 46 : 32) * Math.PI / 360);
            const dw = s.w / ((sw / sh) * 2 * tanHalf);
            const dh = s.h / (2 * tanHalf);
            const dir = new V(s.dir[0], s.dir[1], s.dir[2]).normalize();
            const t = new V(s.t[0], s.t[1], s.t[2]);
            const p = t.clone().addScaledVector(dir, Math.max(dw, dh));
            eng.api.shot([p.x, p.y, p.z], [t.x, t.y, t.z]);
        }

        /**
         * 지정한 시간만큼 기다린다. 배속을 반영하고, 그동안 장면이 바뀌었으면 false를 돌려준다.
         *
         * @param g  단계 세대 번호
         * @param ms 기준 밀리초
         * @returns 단계가 아직 유효하면 true
         */
        async function pause(g, ms) {
            await wait(ms);
            return alive(g);
        }

        /* ===================== 단계 ===================== */
        const FLOW = [
            /** 개요 장면. 같은 명령을 기다리는 관중을 보여 준다. */
            async function overview(g) {
                resetScene(null, '같은 명령 · 원소 ' + ELEMS + '개', '관중 ' + SEATS + '명이 같은 신호를 기다립니다');
                glowSet(condGlow, true);
                view('wide');
                say('개요', CG[0].log);
                if (!await pause(g, 900)) return;
                view('wide');
            },
            /** CPU 장면. 코어 몇 개가 라운드를 돌며 결과판을 채운다. */
            async function cpu(g) {
                const pic = blankPic();
                resetScene(pic, '처리 0/' + ELEMS, 'CPU 코어 ' + CPU_CORES + '개가 한 번에 ' + CPU_CORES + '개씩');
                view('wide');
                say('CPU', CG[1].log);
                if (!await pause(g, 700)) return;
                for (let k = 0; k < CPU_ROUNDS; k++) {
                    for (let c = 0; c < CPU_CORES; c++) {
                        const e = k * CPU_CORES + c;
                        glowSet(cpuGlow[c], true);
                        pic[e] = pixColor(e);
                        setBoard(pic, '처리 ' + (e + 1) + '/' + ELEMS, '라운드 ' + (k + 1) + '/' + CPU_ROUNDS + ' · 코어 ' + (c + 1) + '번');
                        if (!await pause(g, 70)) return;
                        glowSet(cpuGlow[c], false);
                    }
                }
                setBoard(pic, '처리 ' + ELEMS + '/' + ELEMS, '라운드 ' + CPU_ROUNDS + '번에 끝남');
                if (!await pause(g, 600)) return;
                view('wide');
            },
            /** GPU 장면. 모든 코어가 한 순간에 같은 명령을 받고, 원소가 적으면 대부분 쉰다. */
            async function gpu(g) {
                resetScene(blankPic(), '활성 코어 0/' + GPU_CORES, '명령 1개가 모든 코어에 같은 순간 전달');
                glowSet(condGlow, true);
                view('wide');
                say('GPU', CG[2].log);
                if (!await pause(g, 800)) return;
                for (let b = 0; b < BLOCKS; b++) setSeats(BLOCK_SEATS[b], true, pixColor(b), false);
                setBoard(fullPic(), '처리 ' + ELEMS + '/' + ELEMS, '활성 코어 ' + GPU_CORES + '/' + GPU_CORES + ' · ' + GPU_ROUNDS + '라운드');
                if (!await pause(g, 1500)) return;
                resetScene(blankPic(), '활성 코어 ' + FEW + '/' + GPU_CORES, '원소 ' + FEW + '개뿐 · 나머지 ' + (GPU_CORES - FEW) + '개는 대기');
                const pic = blankPic();
                for (let b = 0; b < FEW; b++) {
                    setSeats(BLOCK_SEATS[b], true, pixColor(b), false);
                    pic[b] = pixColor(b);
                }
                say('GPU', CG[3].log);
                setBoard(pic, '활성 코어 ' + FEW + '/' + GPU_CORES, '원소 ' + FEW + '개뿐 · 나머지 ' + (GPU_CORES - FEW) + '개는 대기');
                if (!await pause(g, 1800)) return;
                view('wide');
            },
            /** 워프 장면. 한 줄(워프)의 스레드가 분기 경로를 차례로 실행한다. */
            async function warp(g) {
                resetScene(null, '워프 1개 · 스레드 ' + LANES, '줄 하나가 워프 1개 · 맨 앞 줄만 강조');
                for (let r = 1; r < ROWS; r++) setSeats(ROW_SEATS[r], true, DIM, false);
                view('front');
                say('워프', WARP[0].log);
                if (!await pause(g, 1100)) return;
                setSeats(ROW_SEATS[0], true, PAL[0], false);
                setBoard(null, '전체 실행', '스레드 ' + LANES + '명이 같은 명령을 한 번에');
                say('워프', WARP[1].log);
                if (!await pause(g, 1300)) return;
                for (let c = 0; c < LANES; c++) seatTo(ROW_SEATS[0][c], true, laneColor(c), false);
                setBoard(null, '경로 A ' + CNT_A + ' · 경로 B ' + CNT_B, '같은 워프 안에서 경로가 갈립니다');
                say('워프', WARP[2].log);
                if (!await pause(g, 1700)) return;
                for (let c = 0; c < LANES; c++) seatTo(ROW_SEATS[0][c], PRED[c] === 'A', PAL[1], false);
                setBoard(null, '경로 A 실행 · ' + CNT_A + '명', '나머지 ' + CNT_B + '명은 꺼진 채 기다림');
                say('워프', WARP[3].log);
                if (!await pause(g, 1700)) return;
                for (let c = 0; c < LANES; c++) seatTo(ROW_SEATS[0][c], PRED[c] === 'B', PAL[2], false);
                setBoard(null, '경로 B 실행 · ' + CNT_B + '명', '실행 횟수 ' + WARP[4].passes + '번 (분기 때문에 ' + WARP[4].passes + '배)');
                say('워프', WARP[4].log);
                if (!await pause(g, 1700)) return;
                say('워프', WARP[5].log);
                if (!await pause(g, 1800)) return;
                view('wide');
            },
            /** 지연 숨기기 장면. 워프 수를 늘려 가며 계산 유닛 활용률을 보인다. */
            async function latency(g) {
                resetScene(null, '계산 유닛 활용률 0%', '워프가 메모리를 기다리는 동안 다른 워프를 실행');
                setAllSeats(true, DIM, false);
                view('crowd');
                say('지연', LAT[0].log);
                if (!await pause(g, 1100)) return;
                for (let s = 1; s <= 3; s++) {
                    const w = LAT[s].w;
                    const sim = SIMS[w];
                    for (let r = 0; r < ROWS; r++) {
                        if (r < w) setSeats(ROW_SEATS[r], false, REST, false);
                        else setSeats(ROW_SEATS[r], true, DIM, false);
                    }
                    say('지연', LAT[s].log);
                    if (!await pause(g, 500)) return;
                    let busyCyc = 0;
                    for (let q = 0; q < T_MAX; q++) {
                        let any = false;
                        for (let r = 0; r < w; r++) {
                            const ch = sim.grid[r][q];
                            if (ch === 'C') any = true;
                            const col = ch === 'C' ? PAL[0] : (ch === 'M' ? PAL[2] : REST);
                            setSeats(ROW_SEATS[r], ch !== 'R', col, ch === 'C');
                        }
                        if (any) busyCyc++;
                        setBoard(null, '계산 유닛 활용률 ' + Math.round(busyCyc * 100 / T_MAX) + '%', '사이클 ' + (q + 1) + '/' + T_MAX + ' · 워프 ' + w + '개');
                        if (!await pause(g, 85)) return;
                    }
                    if (!await pause(g, 900)) return;
                }
                say('지연', LAT[4].log);
                setBoard(null, '활용률 ' + SIMS[4].util + '%', SIMS[1].util + '% → ' + SIMS[2].util + '% → ' + SIMS[4].util + '% (워프 1 · 2 · 4개)');
                if (!await pause(g, 1600)) return;
                view('wide');
            },
            /** 정리 장면. 완성된 결과판과 요점을 보여 준다. */
            async function summary(g) {
                resetScene(fullPic(), '결과 그림 완성', '같은 명령 · 다른 데이터');
                for (let b = 0; b < BLOCKS; b++) setSeats(BLOCK_SEATS[b], true, pixColor(b), false);
                view('wide');
                say('정리', CG[4].log);
                if (!await pause(g, 2200)) return;
                say('정리', WARP[5].log);
                if (!await pause(g, 2200)) return;
                say('정리', LAT[4].log);
                if (!await pause(g, 2000)) return;
                view('wide');
            }
        ];

        /**
         * 단계 하나를 시작 상태에서 끝까지 재생한다.
         *
         * @param i 단계 번호
         * @param g 단계 시작 시점의 세대 번호
         * @returns 단계 완료 Promise
         */
        function play(i, g) {
            return FLOW[i](g);
        }

        /**
         * 매 프레임 관중의 자세와 카드 색을 현재 값으로 맞춘다.
         *
         * @param t 프레임 시각(밀리초)
         */
        function frame(t) {
            const dt = lastT === null ? 16 : Math.min(100, t - lastT);
            lastT = t;
            moving = stepSeats(dt);
            applySeats();
        }

        /**
         * 관중이 아직 움직이는지 돌려준다. 움직임이 끝나면 렌더 루프가 멈춘다.
         *
         * @returns 움직이는 중이면 true
         */
        function busy() {
            return moving;
        }

        /**
         * 사이트 테마에 맞춰 배경, 바닥, 관중석, 조명을 바꾼다.
         */
        function applyTheme() {
            const th = window.CsFlow.viz3d.isLight() ? THEMES.light : THEMES.dark;
            scene.background.setHex(th.bg);
            groundM.color.setHex(th.ground);
            standM.color.setHex(th.stand);
            hemi.intensity = th.hemi;
            sun.intensity = th.sun;
        }

        applySeats();
        resetScene(null, '같은 명령 · 원소 ' + ELEMS + '개', '관중 ' + SEATS + '명이 같은 신호를 기다립니다');

        return {
            play: play,
            frame: frame,
            busy: busy,
            applyTheme: applyTheme
        };
    }

    /* ===================== 3D 컨트롤러 ===================== */
    const v3 = window.CsFlow.viz3d.create({
        title: 'GPU Card Section 3D',
        badges: BADGES,
        canvasLabel: 'GPU가 같은 명령을 수백 명의 스레드에 동시에 내리는 모습을 응원 카드섹션으로 보여 주는 3D. 지휘자 신호에 맞춰 관중이 같은 순간 카드를 뒤집어 큰 그림을 만들고, 반대편 CPU 코어는 한 명씩 차례로 칸을 채웁니다. 아래 장면 버튼으로 과정을 따라갑니다.',
        home: HOME,
        load: function () { return kit.loadFonts(fontSample()); },
        createWorld: createWorld
    });

    v3.setSteps(BADGES.map(function (_, i) {
        return function (g) { return v3.state.world.play(i, g); };
    }));
})();