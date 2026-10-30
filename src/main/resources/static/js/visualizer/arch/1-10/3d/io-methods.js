/**
 * I/O 방식 3D 택배 현관 장면 (Three.js r128)
 * 2D 시각화의 "3D 택배 현관" 버튼을 누를 때만 로드된다. 공용 엔진 viz3d-common.js와 2D 단계 데이터(window.CsFlow.ioMethodsData)가 먼저 있어야 한다.
 * 주인(CPU)이 문을 열어 가며 접수함(장치)을 기다리는 방식, 초인종을 듣고 나가 받아 선반에 올리는 방식,
 * 택배 기사(DMA)가 주인 대신 선반까지 옮기고 완료 신호만 보내는 방식을 같은 현관에서 비교한다.
 * 단계 수, 자막, 폴링 횟수, 계기판 수치는 2D 단계 데이터에서 계산해 2D와 어긋나지 않게 한다.
 */
(function () {
    'use strict';

    const THREE = window.THREE;
    if (!window.CsFlow || !THREE || !window.CsFlow.viz3d || !window.CsFlow.ioMethodsData) return;

    const V = THREE.Vector3;
    const kit = window.CsFlow.viz3d.kit;
    const SERIF = kit.SERIF;
    const HAND = kit.HAND;
    const INK = kit.INK;
    const D = window.CsFlow.ioMethodsData;
    const STEPS = D.STEPS;
    const BLOCKS = D.IO_BLOCKS;

    /* ===================== 상수 ===================== */
    const BADGES = STEPS.map(function (s) { return s.badge; });
    const THEMES = {
        dark: { bg: 0x0f0f1a, ground: 0x2a2838, hemi: 0.7, sun: 1.0, exposure: 1.0 },
        light: { bg: 0xd9d2c4, ground: 0xece4d4, hemi: 0.65, sun: 1.0, exposure: 1.0 }
    };
    const COLOR = {
        cpu: 0x6c63ff, dev: 0xf7a14a, intc: 0x4ade80, dma: 0xfbbf24,
        busy: 0xf7a14a, done: 0x4ade80, idle: 0x9aa0a6, kraft: 0xc89b5c
    };
    const BAR_HEX = { purple: 0x6c63ff, teal: 0x3ecfb2, orange: 0xf7a14a, green: 0x4ade80, yellow: 0xfbbf24 };
    const COPY = {
        cpu: '주인 · CPU',
        dev: '택배 접수함 · DEV',
        mem: '메모리 선반 · MEM',
        intc: '벨 · INTC',
        dma: '택배 기사 · DMA',
        cardPoll: '폴링',
        cardReq: '요청',
        cardCfg: '설정',
        gauge: 'CPU 점유'
    };
    const SHOTS = {
        wide: [[0.0, 3.9, 8.3], [0.0, 0.7, -0.4]],
        door: [[0.9, 2.6, 5.4], [0.9, 1.1, 0.2]],
        table: [[1.5, 3.0, 5.2], [1.5, 1.35, -1.0]]
    };
    const OWNER_HOME = [2.35, 0, -0.45];
    const DOOR_IN = [0.8, 0, -0.3];
    const DEV_X = 2.6;
    const DEV_Z = 1.2;
    const LAMP = [2.6, 1.22, 1.48];
    const PARCEL_HOME = [2.1, 0.25, 1.95];
    const PICK = [1.6, 0, 1.95];
    const PILE_X = [1.82, 2.38];
    const PILE_Z = [1.67, 2.23];
    const SLOT_X = [-2.85, -1.85];
    const SLOT_Y = [0.25, 1.23];
    const SLOT_Z = -1.55;
    const BIG_SLOT = [-2.85, 0.3, -1.55];
    const SHELF_MID = [-2.35, 0, -1.0];
    const SHELF0_FRONT = [-2.85, 0, -1.0];
    const CHIME = [0.85, 2.0, -1.93];
    const CHIME_GLOW = [0.85, 2.0, -1.6];
    const CHIME_FRONT = [0.85, 0, -0.8];
    const COURIER_IN = [3.9, 0, 2.2];
    const COURIER_PICK = [2.1, 0, 2.75];
    const CARD_POS = [0.95, 2.05, -0.2];
    const OFF_HAND = [0, 0.85, 0.3];
    const LAMP_START = [COLOR.busy, COLOR.idle, COLOR.idle, COLOR.done];
    const RACK_X = [-3.3, -2.35, -1.4];
    const RACK_Y = [0.0, 0.98, 1.96];
    const RACK_Z = -1.55;

    /* ===================== 공용 도구 ===================== */
    /**
     * 배열 좌표나 벡터를 새 Vector3로 바꾼다.
     *
     * @param a [x, y, z] 배열 또는 Vector3
     * @returns 새 Vector3
     */
    function at(a) {
        return a instanceof V ? a.clone() : new V(a[0], a[1], a[2]);
    }

    /**
     * 0에서 1 사이로 값을 자른다.
     *
     * @param v 값
     * @returns 잘라낸 값
     */
    function clamp01(v) {
        return v < 0 ? 0 : (v > 1 ? 1 : v);
    }

    /**
     * 0~1 비율을 퍼센트 정수로 바꾼다.
     *
     * @param f 비율
     * @returns 0~100 정수
     */
    function pct(f) {
        return Math.round(f * 100);
    }

    /**
     * 색 번호를 캔버스에서 쓰는 '#rrggbb' 문자열로 바꾼다.
     *
     * @param n 색 번호
     * @returns 문자열
     */
    function hexStr(n) {
        return '#' + n.toString(16).padStart(6, '0');
    }

    /**
     * 2D 단계 설명에서 "Step N — 제목: " 머리말을 떼고 본문만 돌려준다.
     *
     * @param i 단계 번호
     * @returns 본문 문장
     */
    function bodyOf(i) {
        const s = STEPS[i].log;
        const k = s.indexOf(': ');
        return k < 0 ? s : s.slice(k + 2);
    }

    /**
     * 택배 접수함 장치 칸의 조각 위치를 돌려준다. 2열로 쌓는다.
     *
     * @param k 블록 번호
     * @returns [x, y, z] 배열
     */
    function pilePos(k) {
        return [PILE_X[k % 2], 0.2, PILE_Z[Math.floor(k / 2)]];
    }

    /**
     * 선반 칸의 중심 위치를 돌려준다. 아래 줄부터 채운다.
     *
     * @param k 블록 번호
     * @returns [x, y, z] 배열
     */
    function slotPos(k) {
        return [SLOT_X[k % 2], SLOT_Y[Math.floor(k / 2)], SLOT_Z];
    }

    /**
     * 선반 칸 앞에서 기사나 주인이 서는 위치를 돌려준다.
     *
     * @param k 블록 번호
     * @returns [x, y, z] 배열
     */
    function slotFront(k) {
        return [SLOT_X[k % 2], 0, -1.0];
    }

    /**
     * 계기판의 가로 막대 하나를 그린다.
     *
     * @param c     2D 컨텍스트
     * @param y     막대 중심 y
     * @param label 왼쪽 라벨
     * @param f     채울 비율 0~1
     * @param col   채움 색 번호
     */
    function drawBar(c, y, label, f, col) {
        c.textAlign = 'left';
        c.fillStyle = '#6b6358';
        c.font = '500 28px ' + SERIF;
        c.fillText(label, 30, y);
        c.fillStyle = '#e4dccb';
        c.fillRect(190, y - 11, 292, 22);
        c.fillStyle = hexStr(col);
        c.fillRect(190, y - 11, 292 * clamp01(f), 22);
        c.strokeStyle = 'rgba(42,38,34,0.5)';
        c.lineWidth = 3;
        c.strokeRect(190, y - 11, 292, 22);
    }

    /**
     * 캔버스에 쓰는 모든 문구를 모아 글꼴 로드용 샘플 문자열을 돌려준다.
     *
     * @returns 문자열
     */
    function fontSample() {
        const list = Object.keys(COPY).map(function (k) { return COPY[k]; });
        const all = list.concat(D.IO_LBL, D.IO_SUB, BADGES, D.IO_INFO[0], D.IO_INFO[1], D.IO_INFO[2], D.IO_INFO[3],
            ['CPU 점유', '장치 진행', '블록', '폴링', '회째', '요청', '설정', '완료', '0123456789']);
        return all.join('') + 'INTCDEVMEMCPUDMA';
    }

    /* ===================== 월드(씬) ===================== */
    /**
     * Three.js 씬을 만든다. 현관(문, 벽, 바닥), 선반, 접수함, 벨, 계기판, 주인과 택배 기사를 포함한다.
     *
     * @param eng 공용 엔진
     * @returns 월드 API(play)와 렌더 훅(busy, applyTheme)
     */
    function createWorld(eng) {
        const scene = eng.scene;
        const canvas2d = eng.canvas2d;
        const texture = eng.texture;
        const tween = eng.tween;
        const invalidate = eng.invalidate;
        const glow = eng.glow;
        const ink = eng.ink;
        const easeInOut = eng.api.easeInOut;
        const easeBack = eng.api.easeBack;
        const lowEnd = eng.lowEnd;
        const state = v3.state;
        const alive = v3.alive;
        const wait = v3.wait;
        const say = v3.setCaption;

        scene.background = new THREE.Color(0xd9d2c4);
        scene.fog = new THREE.Fog(0xd9d2c4, 14, 30);

        /* ===================== 재료와 빛 ===================== */
        const hemi = new THREE.HemisphereLight(0xfffaf0, 0x8c9a8e, 0.7);
        scene.add(hemi);
        const sun = new THREE.DirectionalLight(0xfff0d6, 1.1);
        sun.position.set(-4, 9, 7);
        sun.castShadow = true;
        sun.shadow.mapSize.set(lowEnd ? 512 : 1024, lowEnd ? 512 : 1024);
        Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
        sun.shadow.bias = -0.0005;
        scene.add(sun);
        const roomLight = new THREE.PointLight(0xffd7a0, 0.6, 8);
        roomLight.position.set(0.6, 2.4, 1.2);
        scene.add(roomLight);

        const groundM = new THREE.MeshLambertMaterial({ color: 0xece4d4 });
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), groundM);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.02;
        ground.receiveShadow = true;
        scene.add(ground);

        const tileM = new THREE.MeshLambertMaterial({ color: 0xe6dac2 });
        const stoneM = new THREE.MeshLambertMaterial({ color: 0xa39a8c });
        const wallM = new THREE.MeshLambertMaterial({ map: eng.hatch('#efe3c6', 0.16, 60, 2) });
        const trimM = new THREE.MeshLambertMaterial({ color: 0x8b6a4a });
        const doorM = new THREE.MeshLambertMaterial({ color: 0x9c6b3d });
        const steelM = new THREE.MeshLambertMaterial({ color: 0x9aa7b8 });
        const boxM = new THREE.MeshLambertMaterial({ color: 0x5f7d95 });
        const postM = new THREE.MeshLambertMaterial({ color: 0x4a4a52 });
        const chimeM = new THREE.MeshLambertMaterial({ color: 0x3b3a36 });
        const tableM = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
        const tapeM = new THREE.MeshLambertMaterial({ color: 0xf3e6c8 });
        const kraftM = new THREE.MeshLambertMaterial({ color: COLOR.kraft });
        const capM = new THREE.MeshLambertMaterial({ color: 0x2a2622 });
        const laptopM = new THREE.MeshLambertMaterial({ color: 0x3a3640 });
        const solidMats = {};

        /**
         * 색깔 하나짜리 재료를 돌려준다. 같은 색은 한 번만 만든다.
         *
         * @param c 색 번호
         * @returns 재료
         */
        function solidM(c) {
            if (!solidMats[c]) solidMats[c] = new THREE.MeshLambertMaterial({ color: c });
            return solidMats[c];
        }

        /**
         * 상자를 만들어 위치를 잡고 씬(또는 부모)에 붙인다.
         *
         * @param w       폭
         * @param h       높이
         * @param d       깊이
         * @param x       중심 x
         * @param y       중심 y
         * @param z       중심 z
         * @param m       재료
         * @param outline 외곽선 여부
         * @param parent  붙일 부모 (없으면 씬)
         * @returns 상자 메시
         */
        function slab(w, h, d, x, y, z, m, outline, parent) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
            mesh.position.set(x, y, z);
            mesh.castShadow = mesh.receiveShadow = true;
            if (outline) ink(mesh);
            (parent || scene).add(mesh);
            return mesh;
        }

        /**
         * 캔버스를 그린 평면을 만든다. redraw로 내용을 다시 그릴 수 있다.
         *
         * @param w     평면 폭(장면 단위)
         * @param h     평면 높이(장면 단위)
         * @param pw    캔버스 폭
         * @param ph    캔버스 높이
         * @param draw  그리기 함수 (c, pw, ph)
         * @param basic 조명을 받지 않는 재료 여부
         * @returns mesh, mat, redraw를 담은 객체
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
             * @param fn 그리기 함수 (c, pw, ph)
             */
            function redraw(fn) {
                x.clearRect(0, 0, pw, ph);
                fn(x, pw, ph);
                tex.needsUpdate = true;
                invalidate();
            }
            redraw(draw);
            return { mesh: mesh, mat: mat, redraw: redraw };
        }

        /**
         * 안내판을 만든다. 글자 크기는 판 높이와 글자 수에 맞춘다.
         *
         * @param text   적을 문구
         * @param x      중심 x
         * @param y      중심 y
         * @param z      중심 z
         * @param w      판 폭
         * @param color  테두리 색 번호
         * @param parent 붙일 부모 (없으면 씬)
         * @returns panel 결과
         */
        function sign(text, x, y, z, w, color, parent) {
            const ph = Math.round(512 * 0.3 / w);
            const p = panel(w, 0.3, 512, ph, function (c, pw, h) {
                const fs = Math.min(Math.round(h * 0.46), Math.floor(pw * 0.9 / (text.length * 0.95)));
                c.fillStyle = '#f6ecd6';
                c.fillRect(0, 0, pw, h);
                c.strokeStyle = hexStr(color);
                c.lineWidth = 8;
                c.strokeRect(4, 4, pw - 8, h - 8);
                c.fillStyle = INK;
                c.font = '700 ' + fs + 'px ' + SERIF;
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                c.fillText(text, pw / 2, h / 2 + 2);
            }, true);
            p.mesh.position.set(x, y, z);
            (parent || scene).add(p.mesh);
            return p;
        }

        /**
         * 사람 모양 인형(몸통 + 머리)을 만들어 씬에 둔다.
         *
         * @param color 옷 색 번호
         * @returns 그룹 객체
         */
        function person(color) {
            const g = new THREE.Group();
            const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.75, 20), solidM(color));
            body.position.y = 0.375;
            body.castShadow = true;
            ink(body, 40);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 16), solidM(0xf0d2b0));
            head.position.y = 0.93;
            head.castShadow = true;
            g.add(body);
            g.add(head);
            scene.add(g);
            return g;
        }

        /**
         * 택배 상자 하나를 만든다. 테이프 띠를 두르고 중심을 원점에 둔다.
         *
         * @param w 폭
         * @param h 높이
         * @param d 깊이
         * @returns 그룹 객체
         */
        function makeParcel(w, h, d) {
            const g = new THREE.Group();
            const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), kraftM);
            box.castShadow = true;
            ink(box, 30);
            g.add(box);
            g.add(new THREE.Mesh(new THREE.BoxGeometry(w * 0.16, h + 0.012, d + 0.012), tapeM));
            scene.add(g);
            return g;
        }

        /* ===================== 현관 건물 ===================== */
        slab(7.6, 0.06, 2.0, 0, -0.03, -1.0, tileM, false);
        slab(7.6, 0.06, 2.4, 0, -0.03, 1.2, stoneM, false);
        slab(7.6, 2.9, 0.2, 0, 1.45, -2.1, wallM, true);
        slab(0.2, 2.9, 2.0, -3.8, 1.45, -1.0, wallM, true);
        slab(0.2, 2.9, 2.0, 3.8, 1.45, -1.0, wallM, true);
        slab(0.12, 2.3, 0.2, -0.56, 1.15, 0.0, trimM, true);
        slab(0.12, 2.3, 0.2, 0.56, 1.15, 0.0, trimM, true);
        slab(1.24, 0.6, 0.2, 0, 2.6, 0.0, trimM, true);

        const doorPivot = new THREE.Group();
        doorPivot.position.set(-0.5, 0, 0);
        scene.add(doorPivot);
        const doorLeaf = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, 0.06), doorM);
        doorLeaf.position.set(0.5, 1.1, 0);
        doorLeaf.castShadow = true;
        ink(doorLeaf);
        doorPivot.add(doorLeaf);

        /**
         * 문을 열거나 닫는다. 열 때는 방 안쪽으로 밀린다.
         *
         * @param open 열면 true
         * @param ms   걸리는 시간(ms)
         * @returns 완료 Promise
         */
        function openDoor(open, ms) {
            return tw(ms, function (p) {
                doorPivot.rotation.y = open ? 1.2 * p : 1.2 * (1 - p);
            });
        }

        /* ===================== 선반(메모리) ===================== */
        RACK_X.forEach(function (x) {
            slab(0.06, 2.02, 0.06, x, 1.01, RACK_Z, steelM, true);
        });
        RACK_Y.forEach(function (y) {
            slab(1.96, 0.05, 0.55, -2.35, y + 0.025, RACK_Z, steelM, true);
        });
        sign(COPY.mem, -2.35, 2.25, RACK_Z, 1.6, COLOR.intc);

        /* ===================== 벨(INTC) ===================== */
        slab(0.5, 0.42, 0.14, CHIME[0], CHIME[1], CHIME[2], chimeM, true);
        const chimeFace = panel(0.44, 0.34, 256, 198, function (c, pw, ph) {
            c.fillStyle = '#2e3a36';
            c.fillRect(0, 0, pw, ph);
            c.strokeStyle = '#4ade80';
            c.lineWidth = 10;
            c.strokeRect(6, 6, pw - 12, ph - 12);
            c.fillStyle = '#e8f7ee';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.font = '700 84px ' + HAND;
            c.fillText('INTC', pw / 2, ph * 0.5);
        }, true);
        chimeFace.mesh.position.set(CHIME[0], CHIME[1], -1.855);
        scene.add(chimeFace.mesh);

        /* ===================== 접수함(장치) ===================== */
        slab(0.1, 0.95, 0.1, DEV_X, 0.475, DEV_Z, postM, true);
        slab(0.62, 0.46, 0.5, DEV_X, 1.18, DEV_Z, boxM, true);
        sign(COPY.dev, DEV_X, 1.82, DEV_Z, 1.3, COLOR.dev);
        const lampM = new THREE.MeshBasicMaterial({ color: COLOR.idle, toneMapped: false });
        const lampBulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), lampM);
        lampBulb.position.set(LAMP[0], LAMP[1], LAMP[2]);
        scene.add(lampBulb);
        const lampGlow = glow(COLOR.idle, 0.55);
        lampGlow.position.set(LAMP[0], LAMP[1], LAMP[2]);
        scene.add(lampGlow);

        /**
         * 접수함 램프 색을 바꾼다. 진행 중은 주황, 끝나면 초록, 대기는 회색이다.
         *
         * @param col 색 번호
         */
        function setLamp(col) {
            lampM.color.setHex(col);
            lampGlow.material.color.setHex(col);
        }

        /* ===================== 주인(CPU)과 택배 기사(DMA) ===================== */
        const owner = person(COLOR.cpu);
        owner.position.set(OWNER_HOME[0], OWNER_HOME[1], OWNER_HOME[2]);
        sign(COPY.cpu, 0, 1.52, 0, 0.9, COLOR.cpu, owner);

        const courier = person(COLOR.dma);
        const courierCap = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.07, 18), capM);
        courierCap.position.set(0, 1.1, 0);
        courier.add(courierCap);
        sign(COPY.dma, 0, 1.55, 0, 1.1, COLOR.dma, courier);
        courier.visible = false;

        /* ===================== 작업 책상과 주인의 다른 일 ===================== */
        slab(1.1, 0.06, 0.6, 1.5, 0.72, -1.35, tableM, true);
        slab(0.06, 0.7, 0.5, 1.0, 0.36, -1.35, tableM, true);
        slab(0.06, 0.7, 0.5, 2.0, 0.36, -1.35, tableM, true);
        const laptop = slab(0.42, 0.03, 0.28, 1.5, 0.77, -1.35, laptopM, false);
        laptop.castShadow = true;

        /* ===================== 계기판 ===================== */
        /**
         * 계기판을 그린다. 방식 이름, 3줄 정보(2D 방식 표), CPU와 장치 진행 막대를 2D 단계 데이터로 채운다.
         *
         * @param idx 단계 번호
         * @param tt  단계 안 진행 비율 (0~1)
         * @param c   2D 컨텍스트
         * @param pw  캔버스 폭
         * @param ph  캔버스 높이
         */
        function drawGauge(idx, tt, c, pw, ph) {
            const st = D.ioState(idx, tt);
            const info = D.IO_INFO[idx];
            c.fillStyle = '#fbf8f1';
            c.fillRect(0, 0, pw, ph);
            c.strokeStyle = 'rgba(42,38,34,0.5)';
            c.lineWidth = 6;
            c.strokeRect(8, 8, pw - 16, ph - 16);
            c.textBaseline = 'middle';
            c.textAlign = 'left';
            c.fillStyle = '#6c63ff';
            c.font = '700 26px ' + SERIF;
            c.fillText(BADGES[idx], 30, 36);
            for (let r = 0; r < 3; r++) {
                const y = 84 + r * 44;
                c.textAlign = 'left';
                c.fillStyle = '#6b6358';
                c.font = '500 28px ' + SERIF;
                c.fillText(D.IO_LBL[r], 30, y);
                c.textAlign = 'right';
                c.fillStyle = INK;
                c.font = '700 32px ' + SERIF;
                c.fillText(info[r], pw - 30, y);
            }
            drawBar(c, 222, COPY.gauge, st.cpuF, BAR_HEX[D.IO_BAR[idx]]);
            drawBar(c, 262, '장치 진행', st.devF, BAR_HEX.orange);
        }
        const gauge = panel(2.4, 1.35, 512, 288, function (c, pw, ph) { drawGauge(0, 0, c, pw, ph); }, true);
        gauge.mesh.position.set(2.4, 2.1, -1.99);
        scene.add(gauge.mesh);

        /**
         * 계기판을 지정한 단계와 진행 비율 상태로 다시 그린다.
         *
         * @param idx 단계 번호
         * @param tt  진행 비율
         */
        function gaugeAt(idx, tt) {
            gauge.redraw(drawGauge.bind(null, idx, tt));
        }

        /* ===================== 카드와 번쩍임 ===================== */
        /**
         * 쪽지 카드 한 장을 그린다.
         *
         * @param header 윗줄 문구
         * @param value  가운데 문구
         * @param color  테두리와 머리말 색 번호
         * @param c      2D 컨텍스트
         * @param pw     캔버스 폭
         * @param ph     캔버스 높이
         */
        function drawCard(header, value, color, c, pw, ph) {
            c.fillStyle = '#fffdf6';
            c.fillRect(0, 0, pw, ph);
            c.strokeStyle = hexStr(color);
            c.lineWidth = 10;
            c.strokeRect(5, 5, pw - 10, ph - 10);
            c.fillStyle = hexStr(color);
            c.font = '700 28px ' + SERIF;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(header, pw / 2, 38);
            c.fillStyle = INK;
            c.font = '700 ' + (value.length > 5 ? 46 : 62) + 'px ' + SERIF;
            c.fillText(value, pw / 2, ph * 0.66);
        }

        const card = panel(0.62, 0.4, 256, 166, drawCard.bind(null, '', '', COLOR.cpu), true);
        card.mesh.visible = false;
        scene.add(card.mesh);
        /**
         * 쪽지 카드의 내용을 바꾼다.
         *
         * @param header 윗줄 문구
         * @param value  가운데 문구
         * @param color  색 번호
         */
        function paintCard(header, value, color) {
            card.redraw(drawCard.bind(null, header, value, color));
        }

        const pings = [];
        for (let i = 0; i < 3; i++) {
            const pg = glow(0xffffff, 0.6);
            pg.material.opacity = 0;
            scene.add(pg);
            pings.push(pg);
        }
        let pingIdx = 0;

        const signal = glow(COLOR.intc, 0.5);
        signal.material.opacity = 0;
        scene.add(signal);

        /* ===================== 옮겨지는 상자 ===================== */
        const big = makeParcel(0.7, 0.5, 0.55);
        const blocks = [];
        for (let k = 0; k < BLOCKS; k++) blocks.push(makeParcel(0.5, 0.4, 0.45));

        /* ===================== 움직임 도구 ===================== */
        /**
         * 배속을 반영한 트윈을 등록한다.
         *
         * @param ms 밀리초
         * @param fn 진행 함수 (0~1)
         * @param ease 이징 함수
         * @returns 완료 Promise
         */
        function tw(ms, fn, ease) {
            return tween(ms / state.speed, fn, ease);
        }

        /**
         * 번쩍임을 한 번 띄운다.
         *
         * @param pos   위치 벡터
         * @param color 색 번호
         * @param size  크기
         * @param ms    지속 시간(ms)
         * @returns 완료 Promise
         */
        function ping(pos, color, size, ms) {
            const pg = pings[pingIdx++ % pings.length];
            pg.position.copy(pos);
            pg.material.color.setHex(color);
            pg.scale.set(size, size, 1);
            return tween(ms / state.speed, function (p) { pg.material.opacity = Math.sin(p * Math.PI) * 0.95; });
        }

        /**
         * 신호 빛을 지나갈 점들을 따라 보낸다.
         *
         * @param pts   지나갈 점 배열
         * @param color 색 번호
         * @param ms    걸리는 시간(ms)
         * @returns 완료 Promise
         */
        function signalTo(pts, color, ms) {
            const curve = new THREE.CatmullRomCurve3(pts.map(at));
            signal.material.color.setHex(color);
            return tw(ms, function (p) {
                curve.getPoint(p, signal.position);
                signal.material.opacity = Math.sin(p * Math.PI) * 0.95;
            }, easeInOut);
        }

        /**
         * 물체를 목표 위치로 옮긴다.
         *
         * @param o  옮길 물체
         * @param to 목표 위치 벡터
         * @param ms 걸리는 시간(ms)
         * @returns 완료 Promise
         */
        function moveTo(o, to, ms) {
            const from = o.position.clone();
            return tw(ms, function (p) { o.position.lerpVectors(from, to, p); }, easeInOut);
        }

        /**
         * 사람이 걸어서 목표 위치로 간다. 걸음에 맞춰 몸이 살짝 흔들린다.
         *
         * @param o   사람 그룹
         * @param to  목표 배열
         * @param ms  걸리는 시간(ms)
         * @returns 완료 Promise
         */
        function walk(o, to, ms) {
            const from = o.position.clone();
            const end = at(to);
            return tw(ms, function (p) {
                o.position.lerpVectors(from, end, p);
                o.position.y = Math.abs(Math.sin(p * Math.PI * 6)) * 0.04;
            }, easeInOut);
        }

        /**
         * 여러 점을 지나는 곡선을 따라 움직인다.
         *
         * @param who   움직일 사람 그룹
         * @param cargo 함께 들고 갈 물체 (없으면 null)
         * @param pts   지나갈 점 배열 (첫 점은 현재 위치여야 한다)
         * @param ms    걸리는 시간(ms)
         * @param offset 들고 있는 물체의 상대 위치
         * @returns 완료 Promise
         */
        function carry(who, cargo, pts, ms, offset) {
            const curve = new THREE.CatmullRomCurve3(pts.map(at));
            return tw(ms, function (p) {
                curve.getPoint(p, who.position);
                if (cargo) cargo.position.copy(who.position).add(at(offset));
            }, easeInOut);
        }

        /**
         * 물체 없이 여러 점을 따라 걷는다.
         *
         * @param who 움직일 사람 그룹
         * @param pts 지나갈 점 배열
         * @param ms  걸리는 시간(ms)
         * @returns 완료 Promise
         */
        function walkPath(who, pts, ms) {
            return carry(who, null, pts, ms, null);
        }

        /**
         * 쪽지 카드를 지정 위치에 크기 0에서 키우며 보여 준다.
         *
         * @param pos 위치 벡터
         * @param ms  걸리는 시간(ms)
         * @returns 완료 Promise
         */
        function pop(pos, ms) {
            card.mesh.position.copy(pos);
            card.mesh.visible = true;
            card.mat.opacity = 1;
            return tw(ms, function (p) { card.mesh.scale.setScalar(Math.max(0.01, p)); }, easeBack);
        }

        /**
         * 쪽지 카드를 내용과 함께 띄운다.
         *
         * @param header 윗줄 문구
         * @param value  가운데 문구
         * @param color  색 번호
         */
        function showCard(header, value, color) {
            paintCard(header, value, color);
            pop(at(CARD_POS), 220);
        }

        /**
         * 쪽지 카드를 숨긴다.
         */
        function hideCard() {
            card.mesh.visible = false;
            card.mesh.scale.setScalar(1);
        }

        /**
         * 카메라를 샷에 맞춘다. 화면 비율이 좁으면 거리를 늘려 장면 전체가 들어오게 한다.
         *
         * @param key 샷 이름
         */
        function view(key) {
            const s = SHOTS[key];
            const aspect = eng.stage.clientWidth / Math.max(1, eng.stage.clientHeight);
            const k = aspect >= 1.5 ? 1 : Math.min(2.2, 1.5 / aspect);
            const t = new V(s[1][0], s[1][1], s[1][2]);
            const p = new V(s[0][0], s[0][1], s[0][2]).sub(t).multiplyScalar(k).add(t);
            eng.api.shot([p.x, p.y, p.z], [t.x, t.y, t.z]);
        }

        /* ===================== 단계 시작 상태 ===================== */
        /**
         * 단계 시작 상태를 되돌린다. 매번 단계를 시작할 때 부른다.
         *
         * @param step 단계 번호
         */
        function reset(step) {
            eng.clearTweens();
            owner.position.copy(at(OWNER_HOME));
            doorPivot.rotation.y = 0;
            courier.visible = false;
            courier.position.copy(at(COURIER_IN));
            hideCard();
            pings.forEach(function (pg) { pg.material.opacity = 0; });
            signal.material.opacity = 0;
            big.visible = step < 2;
            big.position.copy(at(PARCEL_HOME));
            blocks.forEach(function (b, k) {
                b.visible = step >= 2;
                b.position.copy(at(step === 3 ? slotPos(k) : pilePos(k)));
            });
            setLamp(LAMP_START[step]);
            gaugeAt(step, 0);
            invalidate();
        }

        /* ===================== 단계 장면 ===================== */
        /**
         * 주인이 문을 열어 가며 접수함을 되풀이해 확인한다. CPU는 기다리는 동안 계속 묶여 있다.
         *
         * @param g 단계 세대 번호
         */
        async function pio(g) {
            view('door');
            say(BADGES[0], bodyOf(0));
            await walk(owner, DOOR_IN, 1000);
            if (!alive(g)) return;
            const polls = D.ioState(0, 1).polls;
            for (let k = 1; k <= polls; k++) {
                await openDoor(true, 380);
                if (!alive(g)) return;
                ping(at(LAMP), COLOR.busy, 0.9, 420);
                showCard(COPY.cardPoll, k + '회째', COLOR.dev);
                await wait(460);
                if (!alive(g)) return;
                await openDoor(false, 380);
                if (!alive(g)) return;
                hideCard();
                await wait(240);
                if (!alive(g)) return;
            }
            gaugeAt(0, 1);
            const st = D.ioState(0, 1);
            view('wide');
            say('Result', 'CPU 점유 ' + pct(st.cpuF) + '%, 장치 진행 ' + pct(st.devF) + '%. 폴링 ' + st.polls + '회 동안 주인은 문 앞을 떠나지 못합니다');
        }

        /**
         * 주인은 다른 일을 하다가 접수함이 끝났다는 벨을 들으면 나가서 상자를 받아 선반에 올린다.
         *
         * @param g 단계 세대 번호
         */
        async function irq(g) {
            view('door');
            say(BADGES[1], bodyOf(1));
            await walk(owner, DOOR_IN, 900);
            if (!alive(g)) return;
            await openDoor(true, 300);
            if (!alive(g)) return;
            setLamp(COLOR.busy);
            ping(at(LAMP), COLOR.busy, 0.9, 380);
            showCard(COPY.cardReq, 'I/O 시작', COLOR.cpu);
            await wait(420);
            if (!alive(g)) return;
            await openDoor(false, 300);
            if (!alive(g)) return;
            hideCard();
            await walk(owner, OWNER_HOME, 900);
            if (!alive(g)) return;
            view('table');
            gaugeAt(1, 0.22);
            await wait(900);
            if (!alive(g)) return;
            setLamp(COLOR.done);
            gaugeAt(1, 0.6);
            ping(at(LAMP), COLOR.done, 0.9, 420);
            await signalTo([at(LAMP), new V(1.7, 2.5, -0.2), at(CHIME_GLOW)], COLOR.intc, 800);
            if (!alive(g)) return;
            ping(at(CHIME_GLOW), COLOR.intc, 1.2, 600);
            await wait(400);
            if (!alive(g)) return;
            gaugeAt(1, 1);
            view('door');
            await walk(owner, DOOR_IN, 900);
            if (!alive(g)) return;
            await openDoor(true, 300);
            if (!alive(g)) return;
            await walkPath(owner, [DOOR_IN, [0, 0, 0.4], [1.0, 0, 1.3], PICK], 1400);
            if (!alive(g)) return;
            await moveTo(big, at(PICK).add(at(OFF_HAND)), 350);
            if (!alive(g)) return;
            await carry(owner, big, [PICK, [1.0, 0, 0.9], [0, 0, 0.2], [0, 0, -0.55], [-1.3, 0, -0.8], SHELF0_FRONT], 1800, OFF_HAND);
            if (!alive(g)) return;
            await moveTo(big, at(BIG_SLOT), 450);
            if (!alive(g)) return;
            ping(at(BIG_SLOT).add(new V(0, 0, 0.3)), COLOR.intc, 0.9, 500);
            await openDoor(false, 300);
            if (!alive(g)) return;
            await walkPath(owner, [SHELF0_FRONT, [-0.4, 0, -0.8], [1.2, 0, -0.7], OWNER_HOME], 1200);
            if (!alive(g)) return;
            const st = D.ioState(1, 1);
            view('wide');
            say('Result', 'CPU 점유 ' + pct(st.cpuF) + '%. 벨이 울릴 때만 나가 받고, 나머지 시간에는 다른 일을 합니다');
        }

        /**
         * 택배 기사가 주인 대신 블록을 하나씩 장치에서 선반까지 옮긴다. 주인은 설정만 하고 다른 일을 한다.
         *
         * @param g 단계 세대 번호
         */
        async function dma(g) {
            view('door');
            say(BADGES[2], bodyOf(2));
            await walk(owner, DOOR_IN, 900);
            if (!alive(g)) return;
            await openDoor(true, 300);
            if (!alive(g)) return;
            showCard(COPY.cardCfg, '블록 ' + BLOCKS + '개', COLOR.cpu);
            await wait(700);
            if (!alive(g)) return;
            hideCard();
            await openDoor(false, 300);
            if (!alive(g)) return;
            await walk(owner, OWNER_HOME, 900);
            if (!alive(g)) return;
            courier.visible = true;
            courier.position.copy(at(COURIER_IN));
            await walkPath(courier, [COURIER_IN, COURIER_PICK], 1400);
            if (!alive(g)) return;
            await openDoor(true, 300);
            if (!alive(g)) return;
            setLamp(COLOR.busy);
            for (let k = 0; k < BLOCKS; k++) {
                await moveTo(blocks[k], at(COURIER_PICK).add(at(OFF_HAND)), 250);
                if (!alive(g)) return;
                await carry(courier, blocks[k], [COURIER_PICK, [1.0, 0, 1.5], [0, 0, 0.5], [0, 0, -0.55], [-1.5, 0, -0.85], slotFront(k)], 1200, OFF_HAND);
                if (!alive(g)) return;
                await moveTo(blocks[k], at(slotPos(k)), 280);
                if (!alive(g)) return;
                ping(at(slotPos(k)).add(new V(0, 0, 0.3)), COLOR.dma, 0.8, 360);
                gaugeAt(2, 0.25 + 0.15 * k + 0.22);
                await walkPath(courier, [slotFront(k), [-1.5, 0, -0.85], [0, 0, -0.55], [0, 0, 0.5], [1.0, 0, 1.5], COURIER_PICK], 1000);
                if (!alive(g)) return;
            }
            setLamp(COLOR.done);
            gaugeAt(2, 1);
            await openDoor(false, 300);
            if (!alive(g)) return;
            await walkPath(courier, [COURIER_PICK, COURIER_IN], 1200);
            if (!alive(g)) return;
            courier.visible = false;
            view('wide');
            say('Result', '기사가 블록 ' + BLOCKS + '개를 선반까지 옮겼습니다. 주인은 설정 뒤 다른 일을 하고, 끝나면 완료 신호만 받습니다');
        }

        /**
         * 완료 신호가 벨에 울리고 주인이 선반의 블록을 확인한다.
         *
         * @param g 단계 세대 번호
         */
        async function done(g) {
            view('wide');
            say(BADGES[3], bodyOf(3));
            await signalTo([at(LAMP), new V(1.7, 2.5, -0.2), at(CHIME_GLOW)], COLOR.intc, 900);
            if (!alive(g)) return;
            ping(at(CHIME_GLOW), COLOR.intc, 1.2, 600);
            await wait(300);
            if (!alive(g)) return;
            await walk(owner, CHIME_FRONT, 1000);
            if (!alive(g)) return;
            await walk(owner, SHELF_MID, 1300);
            if (!alive(g)) return;
            for (let k = 0; k < BLOCKS; k++) {
                ping(at(slotPos(k)).add(new V(0, 0, 0.3)), COLOR.intc, 0.8, 300);
                await wait(180);
                if (!alive(g)) return;
            }
            await walk(owner, OWNER_HOME, 1300);
            if (!alive(g)) return;
            gaugeAt(3, 1);
            const st = D.ioState(3, 1);
            view('wide');
            say('Result', '완료 신호는 한 번뿐입니다. 주인은 선반의 블록 ' + BLOCKS + '개를 확인만 하고, CPU 점유 ' + pct(st.cpuF) + '%로 돌아갑니다');
        }

        const FLOW = [pio, irq, dma, done];

        /**
         * 단계 하나를 처음 상태에서 끝까지 재생한다.
         *
         * @param i 단계 번호
         * @param g 단계 시작 시점의 세대 번호
         */
        async function play(i, g) {
            reset(i);
            await FLOW[i](g);
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
            eng.renderer.toneMappingExposure = th.exposure;
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
        title: 'I/O Methods 3D',
        badges: BADGES,
        canvasLabel: '택배 현관으로 I/O 방식 세 가지를 비교하는 3D 장면. 주인이 문을 열어 보며 기다리는 방식, 벨을 듣고 나가 받는 방식, 택배 기사가 선반까지 옮기는 방식을 보여 줍니다. 아래 장면 버튼으로 과정을 따라갑니다.',
        home: { p: SHOTS.wide[0], t: SHOTS.wide[1] },
        load: function () { return kit.loadFonts(fontSample()); },
        createWorld: createWorld
    });

    v3.setSteps(BADGES.map(function (_, i) {
        return function (g) { return v3.state.world.play(i, g); };
    }));
})();