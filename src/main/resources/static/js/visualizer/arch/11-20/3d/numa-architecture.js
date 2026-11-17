/**
 * NUMA 공항 허브 3D 장면 (Three.js r128)
 * 2D 시각화의 "3D 공항 허브" 버튼을 누를 때만 로드된다. 공용 엔진 viz3d-common.js와 2D 단계 데이터(window.CsFlow.numaData)가 먼저 있어야 한다.
 * 두 도시(노드 0, 1)에는 각각 터미널(CPU 소켓)과 창고(로컬 메모리)가 있다.
 * 같은 도시 안의 접근은 짧은 셔틀로, 다른 도시 창고로 가는 접근은 항공 노선(인터커넥트)으로 보여 준다.
 * 자막과 단계 값은 2D 데이터에서 읽는다. 데이터 배치와 이동은 화물(페이지)의 위치와 평균 거리 상황판으로 보여 준다.
 */
(function () {
    'use strict';

    const THREE = window.THREE;
    if (!window.CsFlow || !THREE || !window.CsFlow.viz3d || !window.CsFlow.numaData) return;

    const V = THREE.Vector3;
    const kit = window.CsFlow.viz3d.kit;
    const SERIF = kit.SERIF;
    const INK = kit.INK;

    /* ===================== 2D 데이터 (단계 값의 원본) ===================== */
    const DATA = window.CsFlow.numaData;
    const LOCAL = DATA.local;
    const REMOTE = DATA.remote;
    const ACC = DATA.acc;
    const ALL = DATA.arch.concat(DATA.cost, DATA.policy);
    const LBL_LOCAL = '로컬 · 거리 ' + LOCAL;
    const LBL_REMOTE = '원격 · 거리 ' + REMOTE;

    /* ===================== 상수 ===================== */
    const BADGE_RANGES = [
        { name: 'UMA', from: 0, to: 1, focus: 'uma' },
        { name: 'NUMA', from: 2, to: 2, focus: 'wide' },
        { name: 'LOCAL', from: 3, to: 3, focus: 'local' },
        { name: 'REMOTE', from: 4, to: 5, focus: 'remote' },
        { name: 'COST', from: 6, to: 9, focus: 'wide' },
        { name: 'FIRST TOUCH', from: 10, to: 11, focus: 'wide' },
        { name: 'MIGRATE', from: 12, to: 13, focus: 'wide' },
        { name: 'PLACEMENT', from: 14, to: 15, focus: 'wide' }
    ];
    const BADGES = BADGE_RANGES.map(function (r) { return r.name; });
    const THEMES = {
        dark: { bg: 0x161a26, ground: 0x2d323e, hemi: 0.75, sun: 1.0 },
        light: { bg: 0xdcd6c8, ground: 0xc9c2b0, hemi: 0.7, sun: 1.0 }
    };
    const COL = {
        cpu: 0x6c63ff, canopy: 0x3c3870, tower: 0xe0b020, mem: 0x1d9e75, memRoof: 0x157a5a, door: 0x17151c,
        pad0: 0x4b44b0, pad1: 0x2e6f8f, road: 0x59606e, roadLocal: 0x1d9e75, roadBus: 0xe8762b,
        tube: 0x7d8594, tubeRemote: 0xf0922b, tubeThread: 0xe0508a,
        bus: 0xf5c542, token: 0xf5c542, tokenWait: 0xe24b4a, plane: 0xf6f1e7,
        thread: 0xe0508a, head: 0xffe3c2, pin: 0xf0922b, crate: 0x1d9e75, crateRemote: 0xf0922b
    };
    const SIGN = { cpu: '#6c63ff', mem: '#1d9e75', warn: '#f0922b', mute: '#6b7a8f', pass: '#e0508a' };
    const SHOTS = {
        wide: { t: [0, 2.0, -0.4], dir: [0, 0.35, 1], w: 14, h: 7.6 },
        uma: { t: [0, 1.4, 0], dir: [0, 0.3, 1], w: 11, h: 4.6 },
        local: { t: [-3.4, 1.1, 0], dir: [0, 0.3, 1], w: 7.4, h: 4.0 },
        remote: { t: [0, 1.5, 0], dir: [0, 0.3, 1], w: 12.4, h: 5.6 }
    };
    const MS = { move: 900, flight: 1300, grow: 700, fade: 600 };
    const PAUSE = 1000;
    const X = { t0: -4.8, w0: -2.1, w1: 2.1, t1: 4.8 };
    const FRONT_Z = 1.85;
    const SHUTTLE_FROM = -4.0;
    const SHUTTLE_TO = -2.95;
    const BOARD_POS = [0, 4.4, -2.6];
    const BOARD_W = 6.2;
    const BOARD_H = 2.42;

    /* ===================== 상태 계산 (2D 단계 값에서 장면 상태를 만든다) ===================== */
    /**
     * 전역 단계 번호 g까지 진행한 뒤의 장면 상태를 돌려준다. g가 -1이면 처음 상태다.
     *
     * @param g 전역 단계 번호 (아크 0~5, 비용 6~9, 배치 10~15)
     * @returns 장면 상태 객체
     */
    function endState(g) {
        const st = { uma: true, numa: false, bus: false, local: false, remote: false, board: null, reads: 0, locF: 0, remF: 0, diff: false, pass: null, crates: null, pin: false, tag: '' };
        if (g < 0) return st;
        const e = ALL[g];
        if (g < 6) {
            st.uma = e.a === 'uma';
            st.numa = e.a === 'numa';
            st.bus = e.hl === 'bus';
            st.local = e.hl === 'local' || g === 5;
            st.remote = e.hl === 'remote' || g === 5;
            return st;
        }
        st.uma = false;
        st.numa = true;
        if (g < 10) {
            st.board = 'cost';
            st.reads = ACC;
            st.locF = e.loc ? 1 : 0;
            st.remF = e.rem ? 1 : 0;
            st.diff = g === 9;
            return st;
        }
        st.board = 'policy';
        st.pass = e.t;
        st.crates = e.pages ? e.pages.slice() : null;
        st.pin = g >= 13 && e.t === 0;
        st.tag = e.tag || '';
        return st;
    }

    /**
     * 두 값을 비율 t만큼 섞는다.
     *
     * @param a 시작 값
     * @param b 끝 값
     * @param t 0에서 1 사이 비율
     * @returns 섞인 값
     */
    function lerp(a, b, t) { return a + (b - a) * t; }

    /**
     * 거리 값을 문자열로 바꾼다. 정수면 정수로, 아니면 소수 한 자리로 쓴다.
     *
     * @param v 거리 값
     * @returns 문자열
     */
    function nuFmt(v) { return Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1); }

    /**
     * 스레드가 있는 노드 t에서 페이지 목록까지의 접근 1회 평균 거리를 돌려준다.
     *
     * @param t     스레드가 있는 노드
     * @param pages 페이지마다 놓인 노드 번호
     * @returns 평균 거리
     */
    function avgDist(t, pages) {
        let sum = 0;
        pages.forEach(function (n) { sum += n === t ? LOCAL : REMOTE; });
        return sum / pages.length;
    }

    /**
     * 두 점을 잇는 포물선 경로를 만든다. 가운데 점은 높은 쪽 끝보다 height만큼 위에 둔다.
     *
     * @param a      시작 점
     * @param b      끝 점
     * @param height 높이 차
     * @returns 곡선 객체
     */
    function flightCurve(a, b, height) {
        const mid = a.clone().lerp(b, 0.5);
        mid.y = Math.max(a.y, b.y) + height;
        return new THREE.CatmullRomCurve3([a.clone(), mid, b.clone()]);
    }

    /**
     * 노드 n의 터미널 앞, 스레드가 서 있는 자리를 돌려준다.
     *
     * @param n 노드 번호
     * @returns 위치 벡터
     */
    function passPos(n) { return new V(n === 0 ? X.t0 : X.t1, 0, FRONT_Z); }

    /**
     * 노드 n의 창고 앞, 페이지(화물) j가 놓일 자리를 돌려준다.
     *
     * @param n 노드 번호
     * @param j 페이지 번호
     * @returns 위치 벡터
     */
    function cratePos(n, j) { return new V((n === 0 ? X.w0 : X.w1) + (j - 1.5) * 0.34, 0.13, FRONT_Z); }

    /**
     * 조명을 받는 단색 재료를 만든다.
     *
     * @param c 색 번호
     * @returns 재료
     */
    function lam(c) { return new THREE.MeshLambertMaterial({ color: c }); }

    /**
     * 안내판 그리기 함수를 돌려준다. 글씨가 넘치면 크기를 줄인다.
     *
     * @param text  안내판 문구
     * @param color 테두리 색
     * @returns 그리기 함수
     */
    function signDraw(text, color) {
        return function (x, pw, ph) {
            const lw = Math.round(ph * 0.07);
            x.fillStyle = '#f6ecd6';
            x.fillRect(0, 0, pw, ph);
            x.strokeStyle = color;
            x.lineWidth = lw;
            x.strokeRect(lw / 2, lw / 2, pw - lw, ph - lw);
            x.fillStyle = INK;
            x.textAlign = 'center';
            x.textBaseline = 'middle';
            let fs = Math.round(ph * 0.56);
            x.font = '700 ' + fs + 'px ' + SERIF;
            while (x.measureText(text).width > pw - lw * 2 - 16 && fs > 10) {
                fs -= 2;
                x.font = '700 ' + fs + 'px ' + SERIF;
            }
            x.fillText(text, pw / 2, ph / 2 + 1);
        };
    }

    /**
     * 캔버스에 그리는 문구를 모아 글꼴 로드용 샘플로 돌려준다.
     *
     * @returns 문자열
     */
    function fontSample() {
        const words = ['CPU 0', 'CPU 1', '메모리 0', '메모리 1', '공용 메모리', '공용 버스', '같은 버스에 접근이 몰림',
            LBL_LOCAL, LBL_REMOTE, '인터커넥트', '같은 데이터를', '번 읽을 때 총 거리', '읽기', '회', '로컬', '원격', '거리', '노드', '배',
            '접근 1회 평균 거리', '원격 접근 비율', '스레드 T는', '데이터 배치', '아직 데이터가 할당되지 않았습니다',
            '처음 접근한 노드에 배치', '스레드만 이동', '스레드를 노드에 고정', '페이지를 노드에 번갈아 배치', '데이터 배치와 이동',
            'T', 'D0', 'D1', 'D2', 'D3', '원격 / 로컬 =', '차이', '0123456789%/.:+ '];
        return words.join(' ');
    }

    /* ===================== 월드(씬) ===================== */
    /**
     * Three.js 씬을 만든다. 두 도시(터미널, 창고, 셔틀, 항공 노선), UMA 중앙 창고, 데이터 상황판을 포함한다.
     *
     * @param eng 공용 엔진
     * @returns 월드 API(play)와 테마 훅(applyTheme, release)
     */
    function createWorld(eng) {
        const scene = eng.scene;
        const state = v3.state;
        const alive = v3.alive;
        const wait = v3.wait;
        const say = v3.setCaption;
        const easeInOut = eng.api.easeInOut;
        const easeBack = eng.api.easeBack;
        const bv = { kind: null, reads: 0, locF: 0, remF: 0, diff: false, tag: '', pages: null, pass: null };

        scene.background = new THREE.Color(THEMES.dark.bg);
        scene.fog = new THREE.Fog(THEMES.dark.bg, 26, 50);
        const hemi = new THREE.HemisphereLight(0xfffaf0, 0x8c9a8e, 0.75);
        scene.add(hemi);
        const sun = new THREE.DirectionalLight(0xfff0d6, 1.0);
        sun.position.set(-4, 12, 9);
        scene.add(sun);
        const lamp = new THREE.PointLight(0xffd7a0, 0.5, 16);
        lamp.position.set(0, 4, 4);
        scene.add(lamp);

        /* ===================== 재료와 바닥 ===================== */
        const groundM = lam(THEMES.dark.ground);
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 4.6), groundM);
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(0, 0, 0.1);
        scene.add(ground);
        const cpuM = lam(COL.cpu);
        const canopyM = lam(COL.canopy);
        const towerM = lam(COL.tower);
        const memM = lam(COL.mem);
        const roofM = lam(COL.memRoof);
        const doorM = lam(COL.door);
        const padM0 = lam(COL.pad0);
        const padM1 = lam(COL.pad1);
        const roadM0 = lam(COL.road);
        const roadM1 = lam(COL.road);
        const umaRoadM = lam(COL.road);
        const tubeM = lam(COL.tube);
        const thTubeM = lam(COL.tubeThread);
        const busM = lam(COL.bus);
        const tokM = lam(COL.token);
        const tokWaitM = lam(COL.tokenWait);
        const planeM = lam(COL.plane);
        const threadM = lam(COL.thread);
        const headM = lam(COL.head);
        const pinMat = lam(COL.pin);

        /**
         * 상자를 만들어 위치를 잡고 부모에 붙인다.
         *
         * @param parent  붙일 부모 객체
         * @param w       폭
         * @param h       높이
         * @param d       깊이
         * @param x       x 좌표
         * @param y       y 좌표
         * @param z       z 좌표
         * @param m       재료
         * @param outline 잉크 외곽선을 그리면 true
         * @returns 만든 메시
         */
        function box(parent, w, h, d, x, y, z, m, outline) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
            mesh.position.set(x, y, z);
            if (outline) eng.ink(mesh);
            parent.add(mesh);
            return mesh;
        }

        /**
         * 세모 기둥 모양의 지붕을 만들어 붙인다. 용마루는 깊이 방향이다.
         *
         * @param parent 붙일 부모 객체
         * @param cx     가운데 x 좌표
         * @param baseY  밑면 y 좌표
         * @param w      밑변 폭
         * @param h      높이
         * @param d      깊이
         * @param m      재료
         */
        function prism(parent, cx, baseY, w, h, d, m) {
            const s = new THREE.Shape();
            s.moveTo(0, 0);
            s.lineTo(w, 0);
            s.lineTo(w / 2, h);
            s.closePath();
            const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
            g.translate(-w / 2, 0, -d / 2);
            const mesh = new THREE.Mesh(g, m);
            mesh.position.set(cx, baseY, 0);
            eng.ink(mesh);
            parent.add(mesh);
        }

        /**
         * 캔버스를 그린 평면을 만든다. redraw로 내용을 다시 그릴 수 있다.
         *
         * @param w     평면 폭
         * @param h     평면 높이
         * @param pw    캔버스 폭
         * @param ph    캔버스 높이
         * @param draw  그리기 함수(컨텍스트, 폭, 높이)
         * @param basic 조명을 받지 않으면 true
         * @returns 메시, 재료, redraw 함수
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
             * @param fn 그리기 함수(컨텍스트, 폭, 높이)
             */
            function redraw(fn) {
                x.clearRect(0, 0, pw, ph);
                fn(x, pw, ph);
                tex.needsUpdate = true;
                eng.invalidate();
            }
            redraw(draw);
            return { mesh: mesh, mat: mat, redraw: redraw };
        }

        /**
         * 안내판을 만들어 부모에 붙인다.
         *
         * @param parent 붙일 부모 객체
         * @param text   안내판 문구
         * @param w      폭
         * @param h      높이
         * @param x      x 좌표
         * @param y      y 좌표
         * @param z      z 좌표
         * @param color  테두리 색
         * @returns 안내판 메시
         */
        function sign(parent, text, w, h, x, y, z, color) {
            const p = panel(w, h, 512, Math.round(512 * h / w), signDraw(text, color), true);
            p.mesh.position.set(x, y, z);
            parent.add(p.mesh);
            return p.mesh;
        }

        /**
         * 터미널(CPU 소켓)을 만든다. 지붕 위에 관제탑을 올린다.
         *
         * @param parent 붙일 부모 객체
         * @param cx     가운데 x 좌표
         * @param label  안내판 문구
         */
        function terminal(parent, cx, label) {
            box(parent, 1.4, 0.9, 1.2, cx, 0.45, 0, cpuM, true);
            box(parent, 1.6, 0.08, 1.4, cx, 0.94, 0, canopyM, true);
            box(parent, 0.22, 0.9, 0.22, cx - 0.5, 1.4, -0.35, towerM, true);
            box(parent, 0.46, 0.22, 0.46, cx - 0.5, 1.95, -0.35, towerM, true);
            sign(parent, label, 1.1, 0.3, cx, 0.5, 0.605, SIGN.cpu);
        }

        /**
         * 창고(로컬 메모리)를 만든다. 세모 지붕과 셔터 문을 붙인다.
         *
         * @param parent 붙일 부모 객체
         * @param cx     가운데 x 좌표
         * @param label  안내판 문구
         */
        function hangar(parent, cx, label) {
            box(parent, 1.5, 0.8, 1.3, cx, 0.4, 0, memM, true);
            prism(parent, cx, 0.8, 1.7, 0.5, 1.4, roofM);
            box(parent, 0.7, 0.55, 0.02, cx, 0.28, 0.66, doorM, false);
            sign(parent, label, 0.9, 0.22, cx, 0.7, 0.68, SIGN.mem);
        }

        /* ===================== 노드 0, 1 (두 도시) ===================== */
        const numaG = new THREE.Group();
        const umaG = new THREE.Group();
        scene.add(numaG);
        scene.add(umaG);
        box(numaG, 4.8, 0.01, 3.2, -3.5, 0.005, 0.4, padM0, false);
        box(numaG, 4.8, 0.01, 3.2, 3.5, 0.005, 0.4, padM1, false);
        terminal(numaG, X.t0, 'CPU 0');
        hangar(numaG, X.w0, '메모리 0');
        terminal(numaG, X.t1, 'CPU 1');
        hangar(numaG, X.w1, '메모리 1');
        box(numaG, 1.25, 0.02, 0.5, -3.475, 0.02, 0, roadM0, false);
        box(numaG, 1.25, 0.02, 0.5, 3.475, 0.02, 0, roadM1, false);

        const icCurve = flightCurve(new V(X.t0, 1.15, 0), new V(X.w1, 1.45, 0), 1.5);
        const icTube = new THREE.Mesh(new THREE.TubeGeometry(icCurve, 48, 0.05, 6, false), tubeM);
        numaG.add(icTube);
        const thCurve = flightCurve(passPos(0), passPos(1), 2.6);
        const thTube = new THREE.Mesh(new THREE.TubeGeometry(thCurve, 48, 0.035, 6, false), thTubeM);
        thTube.visible = false;
        numaG.add(thTube);

        const labLocal = sign(numaG, LBL_LOCAL, 1.6, 0.36, -3.475, 1.55, 0.2, SIGN.mem);
        const labRemote = sign(numaG, LBL_REMOTE, 1.9, 0.36, -1.35, 2.1, 0.2, SIGN.warn);
        sign(numaG, '인터커넥트', 1.6, 0.36, -1.35, 2.52, 0.2, SIGN.mute);
        labLocal.visible = false;
        labRemote.visible = false;

        const shuttle = box(numaG, 0.42, 0.2, 0.24, SHUTTLE_FROM, 0.13, 0, busM, true);
        shuttle.visible = false;

        const plane = new THREE.Group();
        const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 10), planeM);
        fus.rotation.x = Math.PI / 2;
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.14), planeM);
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.12), planeM);
        fin.position.set(0, 0.08, -0.26);
        plane.add(fus, wing, fin);
        plane.visible = false;
        numaG.add(plane);

        const passG = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.36, 10), threadM);
        body.position.y = 0.18;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), headM);
        head.position.y = 0.44;
        const pinMesh = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 8, 24), pinMat);
        pinMesh.rotation.x = Math.PI / 2;
        pinMesh.position.y = 0.02;
        pinMesh.scale.setScalar(0.001);
        pinMesh.visible = false;
        passG.add(body, head, pinMesh);
        sign(passG, 'T', 0.3, 0.3, 0, 0.75, 0, SIGN.pass);
        passG.visible = false;
        numaG.add(passG);

        const crates = [];
        for (let j = 0; j < 4; j++) {
            const cm = lam(COL.crate);
            const mesh = box(numaG, 0.26, 0.26, 0.26, 0, 0.13, FRONT_Z, cm, true);
            sign(mesh, 'D' + j, 0.24, 0.24, 0, 0, 0.135, SIGN.mem);
            mesh.visible = false;
            crates.push({ mesh: mesh, mat: cm });
        }

        /* ===================== UMA: 중앙 창고 하나 ===================== */
        terminal(umaG, -4.2, 'CPU 0');
        terminal(umaG, 4.2, 'CPU 1');
        hangar(umaG, 0, '공용 메모리');
        box(umaG, 2.75, 0.02, 0.5, -2.125, 0.02, 0, umaRoadM, false);
        box(umaG, 2.75, 0.02, 0.5, 2.125, 0.02, 0, umaRoadM, false);
        const busLblN = sign(umaG, '공용 버스', 1.6, 0.36, 0, 1.75, 0.2, SIGN.mute);
        const busLblH = sign(umaG, '같은 버스에 접근이 몰림', 2.8, 0.36, 0, 1.75, 0.2, SIGN.warn);
        busLblH.visible = false;
        const tokA = box(umaG, 0.2, 0.2, 0.2, -3.3, 0.22, 0, tokM, false);
        const tokB = box(umaG, 0.2, 0.2, 0.2, 3.3, 0.22, 0, tokWaitM, false);
        tokA.visible = false;
        tokB.visible = false;

        /* ===================== 상황판 (평균 거리와 로컬·원격 비용) ===================== */
        /**
         * 상황판 배경과 현재 모드(비용 또는 배치)를 그린다.
         *
         * @param x  캔버스 컨텍스트
         * @param pw 폭
         * @param ph 높이
         */
        function boardDraw(x, pw, ph) {
            x.fillStyle = '#fbf8f1';
            x.fillRect(0, 0, pw, ph);
            x.strokeStyle = 'rgba(42,38,34,0.55)';
            x.lineWidth = 10;
            x.strokeRect(5, 5, pw - 10, ph - 10);
            if (bv.kind === 'cost') drawCost(x, pw, ph);
            else if (bv.kind === 'policy') drawPolicy(x, pw, ph);
        }

        /**
         * 한 줄짜리 막대를 그린다. 값이 full에 가까울수록 막대가 길다.
         *
         * @param x     캔버스 컨텍스트
         * @param pw    폭
         * @param y     줄의 윗 y
         * @param name  줄 이름
         * @param sub   줄 설명
         * @param value 현재 값
         * @param full  막대가 가득 찬 값
         * @param col   막대 색
         */
        function drawBar(x, pw, y, name, sub, value, full, col) {
            const barX = 250;
            const barW = pw - barX - 230;
            const h = 56;
            x.textAlign = 'left';
            x.textBaseline = 'middle';
            x.fillStyle = INK;
            x.font = '700 40px ' + SERIF;
            x.fillText(name, 40, y + h / 2 - 12);
            x.fillStyle = '#6b6358';
            x.font = '500 28px ' + SERIF;
            x.fillText(sub, 40, y + h / 2 + 26);
            x.fillStyle = 'rgba(42,38,34,0.12)';
            x.fillRect(barX, y, barW, h);
            x.fillStyle = col;
            x.fillRect(barX, y, barW * value / full, h);
            x.textAlign = 'right';
            x.fillStyle = INK;
            x.font = '700 40px ' + SERIF;
            x.fillText(String(Math.round(value)), pw - 40, y + h / 2);
        }

        /**
         * 같은 데이터를 ACC번 읽을 때 로컬과 원격의 총 거리 막대를 그린다.
         *
         * @param x  캔버스 컨텍스트
         * @param pw 폭
         * @param ph 높이
         */
        function drawCost(x, pw, ph) {
            x.textAlign = 'left';
            x.textBaseline = 'middle';
            x.fillStyle = INK;
            x.font = '700 46px ' + SERIF;
            x.fillText('같은 데이터를 ' + ACC + '번 읽을 때 총 거리', 40, 62);
            x.fillStyle = '#6b6358';
            x.font = '500 36px ' + SERIF;
            x.fillText('읽기 ' + Math.round(bv.reads) + ' / ' + ACC + '회', 40, 122);
            const full = REMOTE * ACC;
            drawBar(x, pw, 176, '로컬', '거리 ' + LOCAL, LOCAL * ACC * bv.locF, full, '#1d9e75');
            drawBar(x, pw, 268, '원격', '거리 ' + REMOTE, REMOTE * ACC * bv.remF, full, '#e0792a');
            if (bv.diff) {
                x.textAlign = 'left';
                x.fillStyle = '#b5532e';
                x.font = '700 40px ' + SERIF;
                x.fillText('원격 / 로컬 = ' + (REMOTE / LOCAL).toFixed(1) + '배 (차이 +' + (ACC * (REMOTE - LOCAL)) + ')', 40, 352);
            }
        }

        /**
         * 데이터 배치 상황판을 그린다. 페이지 위치와 접근 1회 평균 거리, 원격 접근 비율을 보여 준다.
         *
         * @param x  캔버스 컨텍스트
         * @param pw 폭
         * @param ph 높이
         */
        function drawPolicy(x, pw, ph) {
            x.textAlign = 'left';
            x.textBaseline = 'middle';
            x.fillStyle = INK;
            x.font = '700 46px ' + SERIF;
            x.fillText(bv.tag || '데이터 배치', 40, 62);
            if (!bv.pages) {
                x.fillStyle = '#6b6358';
                x.font = '500 40px ' + SERIF;
                x.fillText('아직 데이터가 할당되지 않았습니다', 40, 190);
                return;
            }
            const avg = avgDist(bv.pass, bv.pages);
            const remote = bv.pages.filter(function (n) { return n !== bv.pass; }).length;
            const pct = Math.round(remote * 100 / bv.pages.length);
            x.fillStyle = avg === LOCAL ? '#1d7a45' : '#b5532e';
            x.font = '700 58px ' + SERIF;
            x.fillText('접근 1회 평균 거리: ' + nuFmt(avg), 40, 150);
            x.fillStyle = '#6b6358';
            x.font = '500 36px ' + SERIF;
            x.fillText('원격 접근 비율 ' + pct + '% · 스레드 T는 노드 ' + bv.pass, 40, 214);
            const cw = (pw - 80 - 3 * 24) / 4;
            bv.pages.forEach(function (n, j) {
                const cx = 40 + j * (cw + 24);
                x.fillStyle = n === bv.pass ? '#1d9e75' : '#c85a14';
                kit.roundRect(x, cx, 268, cw, 96, 10);
                x.fill();
                x.fillStyle = '#ffffff';
                x.textAlign = 'center';
                x.font = '700 36px ' + SERIF;
                x.fillText('D' + j, cx + cw / 2, 300);
                x.font = '500 28px ' + SERIF;
                x.fillText('노드 ' + n, cx + cw / 2, 340);
            });
        }

        const board = panel(BOARD_W, BOARD_H, 1024, 400, boardDraw, true);
        board.mesh.position.set(BOARD_POS[0], BOARD_POS[1], BOARD_POS[2]);
        board.mesh.scale.setScalar(0.001);
        board.mesh.visible = false;
        scene.add(board.mesh);

        /* ===================== 움직임 도구 ===================== */
        /**
         * 배속을 반영한 트윈을 등록한다.
         *
         * @param ms    기준 밀리초
         * @param fn    값을 받는 함수 (0에서 1)
         * @param ease  이징 함수
         * @param delay 기준 지연 밀리초
         * @returns 완료 Promise
         */
        function tw(ms, fn, ease, delay) {
            return eng.tween(ms / state.speed, fn, ease, (delay || 0) / state.speed);
        }

        /**
         * 객체를 크기 0.001에서 1로 키우거나 줄여 나타내고 숨긴다. anim이 false면 바로 바꾼다.
         *
         * @param obj  대상 객체
         * @param on   나타내면 true
         * @param anim 움직임으로 바꾸면 true
         * @param ms   기준 밀리초
         * @returns 완료 Promise
         */
        function showObj(obj, on, anim, ms) {
            const target = on ? 1 : 0.001;
            if (on) obj.visible = true;
            const from = obj.scale.x;
            const ep = epoch;
            if (!anim || Math.abs(from - target) < 1e-3) {
                obj.scale.setScalar(target);
                obj.visible = on;
                return Promise.resolve();
            }
            return tw(ms, function (p) {
                obj.scale.setScalar(Math.max(0.001, lerp(from, target, p)));
            }, on ? easeBack : easeInOut).then(function () { if (ep === epoch) obj.visible = on; });
        }

        /**
         * 객체를 포물선 경로를 따라 옮긴다.
         *
         * @param obj    옮길 객체
         * @param to     도착 위치
         * @param ms     기준 밀리초
         * @param height 경로의 높이 차
         * @returns 완료 Promise
         */
        function glide(obj, to, ms, height) {
            const curve = flightCurve(obj.position.clone(), to, height);
            return tw(ms, function (p) { curve.getPoint(p, obj.position); }, easeInOut);
        }

        /**
         * 셔틀 버스가 터미널에서 창고까지 같은 도시 도로를 달린다.
         *
         * @returns 완료 Promise
         */
        function runShuttle() {
            shuttle.visible = true;
            shuttle.position.x = SHUTTLE_FROM;
            return tw(MS.move, function (p) { shuttle.position.x = lerp(SHUTTLE_FROM, SHUTTLE_TO, p); }).then(function () {
                shuttle.visible = false;
            });
        }

        /**
         * 비행기가 노드 0 터미널에서 노드 1 창고까지 항공 노선(인터커넥트)을 난다.
         *
         * @returns 완료 Promise
         */
        function runPlane() {
            plane.visible = true;
            return tw(MS.flight, function (p) {
                icCurve.getPoint(p, plane.position);
                plane.lookAt(plane.position.clone().add(icCurve.getTangent(p)));
            }, easeInOut).then(function () { plane.visible = false; });
        }

        /**
         * UMA 버스에서 노드 0의 요청이 먼저 지나가고, 노드 1의 요청은 대기하다가 뒤따라 들어간다.
         *
         * @returns 완료 Promise
         */
        function runTokens() {
            tokA.visible = true;
            tokB.visible = true;
            tokA.position.set(-3.3, 0.22, 0);
            tokB.position.set(3.3, 0.22, 0);
            return tw(MS.move, function (p) {
                tokA.position.x = lerp(-3.3, -0.9, p);
                tokB.position.x = lerp(3.3, 2.2, p);
            }).then(function () {
                return tw(MS.move, function (p) { tokB.position.x = lerp(2.2, 0.9, p); });
            }).then(function () {
                tokA.visible = false;
                tokB.visible = false;
            });
        }

        /**
         * 페이지(화물)들을 상태에 맞는 창고 앞 자리로 옮기거나 나타낸다. 원격 페이지는 주황색으로 보인다.
         *
         * @param prev 이전 상태
         * @param next 다음 상태
         * @param anim 움직임으로 바꾸면 true
         * @returns 완료 Promise
         */
        function moveCrates(prev, next, anim) {
            const jobs = [];
            crates.forEach(function (c, j) {
                if (!next.crates) {
                    c.mesh.visible = false;
                    return;
                }
                const n = next.crates[j];
                const to = cratePos(n, j);
                c.mat.color.setHex(n === next.pass ? COL.crate : COL.crateRemote);
                if (anim && !prev.crates) {
                    c.mesh.position.copy(to);
                    c.mesh.scale.setScalar(0.001);
                    c.mesh.visible = true;
                    jobs.push(tw(MS.grow, function (p) { c.mesh.scale.setScalar(Math.max(0.001, p)); }, easeBack, j * 140));
                    return;
                }
                if (anim && prev.crates[j] !== n) {
                    c.mesh.visible = true;
                    c.mesh.scale.setScalar(1);
                    jobs.push(glide(c.mesh, to, MS.move, 0.9));
                    return;
                }
                c.mesh.position.copy(to);
                c.mesh.scale.setScalar(1);
                c.mesh.visible = true;
            });
            return Promise.all(jobs);
        }

        /**
         * 스레드 T를 상태에 맞는 노드 터미널 앞으로 옮긴다. 이동할 때는 항공 경로로 날아간다.
         *
         * @param prev 이전 상태
         * @param next 다음 상태
         * @param anim 움직임으로 바꾸면 true
         * @returns 완료 Promise
         */
        function movePass(prev, next, anim) {
            if (next.pass === null) {
                passG.visible = false;
                return Promise.resolve();
            }
            const to = passPos(next.pass);
            if (!anim || prev.pass === null || prev.pass === next.pass) {
                passG.position.copy(to);
                passG.visible = true;
                return Promise.resolve();
            }
            passG.visible = true;
            return glide(passG, to, MS.flight, 2.6);
        }

        /**
         * 상태 값을 상황판 값에 맞춘다. 막대와 숫자는 움직임으로 바뀌고, 나머지는 바로 바뀐다.
         *
         * @param next 다음 상태
         * @param anim 움직임으로 바꾸면 true
         * @returns 완료 Promise
         */
        function animateValues(next, anim) {
            const r0 = bv.reads;
            const l0 = bv.locF;
            const m0 = bv.remF;
            const ep = epoch;
            const r1 = next.reads;
            const l1 = next.locF;
            const m1 = next.remF;
            if (!anim || (r0 === r1 && l0 === l1 && m0 === m1)) {
                bv.reads = r1;
                bv.locF = l1;
                bv.remF = m1;
                boardRedraw();
                return Promise.resolve();
            }
            return tw(MS.grow, function (p) {
                bv.reads = lerp(r0, r1, p);
                bv.locF = lerp(l0, l1, p);
                bv.remF = lerp(m0, m1, p);
                boardRedraw();
            }).then(function () {
                if (ep !== epoch) return;
                bv.reads = r1;
                bv.locF = l1;
                bv.remF = m1;
                boardRedraw();
            });
        }

        /**
         * 상황판을 다시 그린다.
         */
        function boardRedraw() { board.redraw(boardDraw); }
        let boardToken = 0;
        let epoch = 0;

        /**
         * 상황판의 모드와 값을 다음 상태에 맞춘다. 상황판이 없는 단계에서는 숨긴다.
         *
         * @param prev 이전 상태
         * @param next 다음 상태
         * @param anim 움직임으로 바꾸면 true
         * @returns 완료 Promise
         */
        function boardChange(prev, next, anim) {
            const token = ++boardToken;
            bv.diff = next.diff;
            bv.tag = next.tag;
            bv.pages = next.crates;
            bv.pass = next.pass;
            if (next.board === null) {
                if (!anim) bv.kind = null;
                return showObj(board.mesh, false, anim, MS.fade).then(function () {
                    if (token !== boardToken) return;
                    bv.kind = null;
                    boardRedraw();
                });
            }
            bv.kind = next.board;
            return Promise.all([
                showObj(board.mesh, true, anim && prev.board === null, MS.fade),
                animateValues(next, anim)
            ]);
        }

        /**
         * 상태에 따라 바뀌지 않는 장식(도로 색, 안내판, 경로 색)을 맞춘다. 움직임은 건드리지 않는다.
         *
         * @param next 다음 상태
         */
        function setStatic(next) {
            roadM0.color.setHex(next.local ? COL.roadLocal : COL.road);
            umaRoadM.color.setHex(next.bus ? COL.roadBus : COL.road);
            tubeM.color.setHex(next.remote ? COL.tubeRemote : COL.tube);
            labLocal.visible = next.local;
            labRemote.visible = next.remote;
            busLblH.visible = next.bus;
            busLblN.visible = !next.bus;
            thTube.visible = next.board === 'policy';
            shuttle.visible = false;
            plane.visible = false;
            tokA.visible = false;
            tokB.visible = false;
        }

        /**
         * 이전 상태에서 다음 상태로 장면을 바꾼다. anim이 false면 바로 바꾸고, true면 움직임으로 잇는다.
         *
         * @param prev 이전 상태
         * @param next 다음 상태
         * @param anim 움직임으로 바꾸면 true
         * @returns 모든 움직임이 끝나면 완료되는 Promise
         */
        function transition(prev, next, anim) {
            eng.invalidate();
            setStatic(next);
            const jobs = [];
            jobs.push(showObj(umaG, next.uma, anim && prev.uma !== next.uma, MS.fade));
            jobs.push(showObj(numaG, next.numa, anim && prev.numa !== next.numa, MS.fade));
            if (anim && next.bus && !prev.bus) jobs.push(runTokens());
            if (anim && next.local && !prev.local) jobs.push(runShuttle());
            if (anim && next.remote && !prev.remote) jobs.push(runPlane());
            jobs.push(moveCrates(prev, next, anim));
            jobs.push(movePass(prev, next, anim));
            jobs.push(showObj(pinMesh, next.pin && next.pass === 0, anim, MS.fade));
            jobs.push(boardChange(prev, next, anim));
            return Promise.all(jobs);
        }

        /**
         * 단계 시작 상태를 움직임 없이 맞춘다. 되감기와 이전 장면에서 쓴다.
         *
         * @param st 장면 상태
         */
        function applyState(st) {
            transition(st, st, false);
        }

        /* ===================== 카메라 ===================== */
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

        /* ===================== 장면 진행 ===================== */
        /**
         * 장면 단계 하나를 시작 상태에서 끝까지 재생한다. 2D 단계 항목마다 자막을 바꾸고 움직임을 잇는다.
         *
         * @param i 장면 단계 번호
         * @param g 단계 시작 시점의 세대 번호
         */
        async function play(i, g) {
            const r = BADGE_RANGES[i];
            eng.clearTweens();
            epoch++;
            applyState(endState(r.from - 1));
            if (r.focus) view(r.focus);
            for (let k = r.from; k <= r.to; k++) {
                say(r.name, ALL[k].log);
                await transition(endState(k - 1), endState(k), true);
                if (!alive(g)) return;
                await wait(PAUSE);
                if (!alive(g)) return;
            }
            view('wide');
        }

        /**
         * 사이트 테마에 맞춰 배경, 안개, 바닥, 조명을 바꾼다.
         */
        function applyTheme() {
            const th = window.CsFlow.viz3d.isLight() ? THEMES.light : THEMES.dark;
            scene.background.setHex(th.bg);
            scene.fog.color.setHex(th.bg);
            groundM.color.setHex(th.ground);
            hemi.intensity = th.hemi;
            sun.intensity = th.sun;
        }

        /**
         * 월드가 쥔 재료와 인스턴스는 엔진이 장면을 순회하며 해제하므로 따로 할 일이 없다.
         */
        function release() {}

        applyState(endState(-1));

        return {
            play: play,
            applyTheme: applyTheme,
            release: release
        };
    }

    /* ===================== 3D 컨트롤러 ===================== */
    const v3 = window.CsFlow.viz3d.create({
        title: 'NUMA 3D',
        badges: BADGES,
        canvasLabel: 'NUMA 아키텍처를 공항 허브 장면으로 보여 주는 3D. 두 도시가 각각 터미널(CPU)과 창고(메모리)를 가지며, 같은 도시의 접근은 셔틀로, 다른 도시 창고로 가는 접근은 항공 노선으로 갑니다. 아래 장면 버튼으로 과정을 따라갑니다.',
        home: { p: [0, 5.4, 16.2], t: [0, 2.0, -0.4] },
        load: function () { return kit.loadFonts(fontSample()); },
        createWorld: createWorld
    });

    v3.setSteps(BADGES.map(function (_, i) {
        return function (g) { return v3.state.world.play(i, g); };
    }));
})();