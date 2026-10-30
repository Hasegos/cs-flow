/**
 * 버스 구조 3D 도로와 신호등 장면 (Three.js r128)
 * 2D 시각화의 "3D 버스 도로" 버튼을 누를 때만 로드된다. 공용 엔진 viz3d-common.js가 먼저 로드돼 있어야 한다.
 * 주소 · 데이터 · 제어 3개 차선 도로에서 중재 신호등(Arbiter)이 한 번에 한 차선만 열어 주는 과정을 보여 준다.
 * 단계 데이터(배지, 설명, 화살표, 칩 값)는 2D 시각화의 단계 데이터와 같은 내용이다.
 */
(function () {
    'use strict';

    const THREE = window.THREE;
    if (!window.CsFlow || !THREE || !window.CsFlow.viz3d) return;

    const V = THREE.Vector3;
    const kit = window.CsFlow.viz3d.kit;
    const SERIF = kit.SERIF;
    const HAND = kit.HAND;
    const INK = kit.INK;

    /* ===================== 단계 데이터 ===================== */
    const STEPS = [
        {
            badge: 'ADDR → MEM',
            log: 'Step 1 — CPU가 Address Bus에 메모리 주소(0x00FF)를 전송합니다. 단방향으로 CPU → Memory 방향으로만 흐릅니다.',
            arrows: [{ from: 'cpu', to: 'mem', via: 'addr', chip: '0x00FF' }]
        },
        {
            badge: 'CTRL READ',
            log: 'Step 2 — Control Bus로 READ 신호를 전송합니다. CPU가 메모리에서 데이터를 읽겠다고 알립니다.',
            arrows: [{ from: 'cpu', to: 'mem', via: 'ctrl', chip: 'READ' }]
        },
        {
            badge: 'DATA ← MEM',
            log: 'Step 3 — Memory가 Data Bus를 통해 요청한 데이터를 CPU로 반환합니다. 양방향 버스가 Memory → CPU 방향으로 동작합니다.',
            arrows: [{ from: 'mem', to: 'cpu', via: 'data', chip: 'DATA' }]
        },
        {
            badge: 'ADDR → I/O',
            log: 'Step 4 — CPU가 I/O 장치에 접근하기 위해 Address Bus에 I/O 포트 주소(0x03F8)를 전송합니다.',
            arrows: [{ from: 'cpu', to: 'io', via: 'addr', chip: '0x03F8' }]
        },
        {
            badge: 'CTRL WRITE',
            log: 'Step 5 — Control Bus로 WRITE 신호를 전송합니다. CPU가 I/O 장치에 데이터를 쓰겠다고 알립니다.',
            arrows: [{ from: 'cpu', to: 'io', via: 'ctrl', chip: 'WRITE' }]
        },
        {
            badge: 'DATA → I/O',
            log: 'Step 6 — CPU가 Data Bus를 통해 I/O 장치로 데이터를 전송합니다.',
            arrows: [{ from: 'cpu', to: 'io', via: 'data', chip: 'DATA' }]
        },
        {
            badge: 'BUS REQ',
            log: 'Step 7 — I/O 장치가 DMA를 위해 버스 사용을 요청(Bus Request)합니다. Arbiter가 요청을 수신합니다.',
            arrows: [{ from: 'io', to: 'arb', via: 'ctrl', chip: 'REQ' }]
        },
        {
            badge: 'BUS GRANT + DMA',
            log: 'Step 8 — Arbiter가 버스 사용권(Bus Grant)을 I/O에 부여합니다. I/O는 Data Bus로 Memory에 직접 접근합니다(DMA).',
            arrows: [
                { from: 'arb', to: 'io', via: 'ctrl', chip: 'GRANT' },
                { from: 'io', to: 'mem', via: 'data', chip: 'DMA' }
            ]
        }
    ];
    const BADGES = STEPS.map(function (st) { return st.badge; });

    /* ===================== 상수 ===================== */
    const THEMES = {
        dark: { bg: 0x0f0f1a, ground: 0x23222e, hemi: 0.7, sun: 1.0 },
        light: { bg: 0xe2e7ee, ground: 0xf1f3f6, hemi: 0.7, sun: 1.0 }
    };
    const COLOR = { addr: 0x8a5cff, data: 0x2fb865, ctrl: 0x1d9e75, cpu: 0x8a5cff, mem: 0xff7a2f, io: 0xf2c14e, arb: 0x1d9e75, road: 0x3b3b48, deck: 0x55555f, pillar: 0x8a8a96, housing: 0x2a2622 };
    const LAMP_ORDER = ['red', 'yellow', 'green'];
    const LAMP_ON = { red: 0xe24b4a, yellow: 0xf5b82e, green: 0x2fb865 };
    const LAMP_OFF = { red: 0x4a2424, yellow: 0x4a3f1f, green: 0x1f3d2b };
    const LAMP_Y = { red: 1.34, yellow: 1.2, green: 1.06 };
    const LANE = { addr: -0.5, data: 0, ctrl: 0.5 };
    const LANE_LABEL = { addr: 'ADDRESS BUS · 단방향 →', data: 'DATA BUS · 양방향', ctrl: 'CONTROL BUS · 양방향' };
    const LANE_FILL = { addr: '#c7b6ff', data: '#b9ecc9', ctrl: '#b3e6dc' };
    const OWNER_TEXT = { cpu: '버스 사용권: CPU', io: '버스 사용권: I/O (DMA)' };
    const RY = 0.12;
    const DECK = 1.1;
    const RAMP = [1.4, 2.4];
    const CAR_G = RY + 0.16;
    const CAR_F = DECK + 0.16;
    const PORT_X = 2.95;
    const ARB_X = 0.9;
    const SHOTS = {
        wide: [[0.2, 7.2, 10.8], [0.2, 0.3, 0.1]],
        arb: [[0.9, 2.4, 4.6], [0.9, 1.0, 0]]
    };

    /* ===================== 경로 ===================== */
    /**
     * 지상 차선 위 차량 위치를 돌려준다.
     *
     * @param x    x 좌표
     * @param lane 차선 이름(addr, data, ctrl)
     * @returns 차량 중심 위치
     */
    function gnd(x, lane) {
        return new V(x, CAR_G, LANE[lane]);
    }

    /**
     * 고가 도로 위 차량 위치를 돌려준다.
     *
     * @param x    x 좌표
     * @param lane 차선 이름(addr, data)
     * @returns 차량 중심 위치
     */
    function elev(x, lane) {
        return new V(x, CAR_F, LANE[lane]);
    }

    const ROUTES = {
        'cpu>mem:addr': [gnd(-2.4, 'addr'), gnd(1.4, 'addr'), elev(2.4, 'addr'), elev(PORT_X, 'addr')],
        'cpu>mem:ctrl': [gnd(-2.4, 'ctrl'), gnd(1.1, 'ctrl'), gnd(1.35, 'addr'), gnd(1.4, 'addr'), elev(2.4, 'addr'), elev(PORT_X, 'addr')],
        'mem>cpu:data': [elev(PORT_X, 'data'), elev(2.4, 'data'), gnd(1.4, 'data'), gnd(-2.4, 'data')],
        'cpu>io:addr': [gnd(-2.4, 'addr'), gnd(1.1, 'addr'), gnd(1.35, 'ctrl'), gnd(PORT_X, 'ctrl')],
        'cpu>io:ctrl': [gnd(-2.4, 'ctrl'), gnd(PORT_X, 'ctrl')],
        'cpu>io:data': [gnd(-2.4, 'data'), gnd(1.1, 'data'), gnd(1.35, 'ctrl'), gnd(PORT_X, 'ctrl')],
        'io>arb:ctrl': [gnd(PORT_X, 'ctrl'), gnd(ARB_X, 'ctrl')],
        'arb>io:ctrl': [gnd(ARB_X, 'ctrl'), gnd(PORT_X, 'ctrl')],
        'io>mem:data': [gnd(PORT_X, 'ctrl'), gnd(1.1, 'ctrl'), gnd(1.35, 'data'), gnd(1.4, 'data'), elev(2.4, 'data'), elev(PORT_X, 'data')]
    };

    /**
     * 칩 라벨에 들어갈 문구를 모아 글꼴 로드용 샘플로 돌려준다.
     *
     * @returns 문자열
     */
    function fontSample() {
        const chips = [];
        STEPS.forEach(function (st) {
            st.arrows.forEach(function (ar) { chips.push(ar.chip); });
        });
        return [LANE_LABEL.addr, LANE_LABEL.data, LANE_LABEL.ctrl, OWNER_TEXT.cpu, OWNER_TEXT.io, '중재 신호등 ARBITER', 'CPU', 'MEMORY', 'I/O 장치']
            .concat(chips).join('') + '0123456789x';
    }

    /**
     * 경로 점들을 이은 선 위에서 진행률 f(0~1)의 위치를 out에 쓴다. 길이 기준으로 나눈다.
     *
     * @param pts 경로 점 배열
     * @param f   진행률
     * @param out 결과를 쓸 벡터
     * @returns out
     */
    function polyAt(pts, f, out) {
        const lens = [];
        let total = 0;
        for (let i = 1; i < pts.length; i++) {
            lens[i - 1] = pts[i].distanceTo(pts[i - 1]);
            total += lens[i - 1];
        }
        let want = total * Math.min(1, Math.max(0, f));
        for (let i = 0; i < lens.length; i++) {
            if (want <= lens[i] || i === lens.length - 1) {
                const r = lens[i] > 0 ? Math.min(1, want / lens[i]) : 1;
                return out.copy(pts[i]).lerp(pts[i + 1], r);
            }
            want -= lens[i];
        }
        return out.copy(pts[pts.length - 1]);
    }

    /**
     * 경로 길이에 맞춘 이동 시간(밀리초)을 돌려준다. 배속 전 기준값이다.
     *
     * @param pts 경로 점 배열
     * @returns 밀리초
     */
    function travelMs(pts) {
        let len = 0;
        for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
        return Math.min(1900, Math.max(900, len * 520));
    }

    /* ===================== 월드(씬) ===================== */
    /**
     * Three.js 씬을 만든다. 3차선 도로와 고가 도로, 장치 셋(CPU, 메모리, I/O), 중재 신호등과 차량을 포함한다.
     *
     * @param eng 공용 엔진
     * @returns 월드 API(play, applyTheme)
     */
    function createWorld(eng) {
        const scene = eng.scene;
        const texture = eng.texture;
        const canvas2d = eng.canvas2d;
        const tween = eng.tween;
        const invalidate = eng.invalidate;
        const glow = eng.glow;
        const ink = eng.ink;
        const easeInOut = eng.api.easeInOut;
        const state = v3.state;
        const alive = v3.alive;
        const wait = v3.wait;
        const say = v3.setCaption;

        scene.background = new THREE.Color(THEMES.dark.bg);
        scene.fog = new THREE.Fog(THEMES.dark.bg, 18, 36);

        /* ===================== 빛과 바닥 ===================== */
        const hemi = new THREE.HemisphereLight(0xfffaf0, 0x8c9a8e, THEMES.dark.hemi);
        scene.add(hemi);
        const sun = new THREE.DirectionalLight(0xfff0d6, THEMES.dark.sun);
        sun.position.set(-5, 10, 8);
        sun.castShadow = true;
        sun.shadow.mapSize.set(eng.lowEnd ? 512 : 1024, eng.lowEnd ? 512 : 1024);
        Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 6, bottom: -6, near: 1, far: 30 });
        sun.shadow.camera.updateProjectionMatrix();
        sun.shadow.bias = -0.0005;
        scene.add(sun);

        const groundM = new THREE.MeshLambertMaterial({ color: THEMES.dark.ground });
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), groundM);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        scene.add(floor);

        const solids = {};

        /**
         * 단색 재료를 돌려준다. 같은 색은 한 번만 만든다.
         *
         * @param c 16진수 색
         * @returns 재료
         */
        function solidM(c) {
            if (!solids[c]) solids[c] = new THREE.MeshLambertMaterial({ color: c });
            return solids[c];
        }

        /**
         * 상자를 만들어 위치를 잡고 씬에 붙인다.
         *
         * @returns 만든 메시
         */
        function slab(w, h, d, x, y, z, m, outline) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
            mesh.position.set(x, y, z);
            mesh.castShadow = mesh.receiveShadow = true;
            if (outline) ink(mesh);
            scene.add(mesh);
            return mesh;
        }

        /**
         * 캔버스를 그린 평면을 만든다. redraw로 내용을 다시 그릴 수 있다.
         *
         * @returns 메시, 재료, 다시 그리기 함수
         */
        function panel(w, h, pw, ph, draw) {
            const [c, x] = canvas2d(pw, ph);
            const tex = texture(c);
            const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
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
            return { mesh: mesh, mat: mat, redraw: redraw };
        }

        /**
         * 벽에 거는 안내판을 만든다.
         *
         * @returns 안내판 평면
         */
        function sign(text, x, y, z, w, color, rotY) {
            const ph = Math.round(512 * 0.3 / w);
            const p = panel(w, 0.3, 512, ph, function (c, pw, h) {
                c.fillStyle = '#f6ecd6';
                c.fillRect(0, 0, pw, h);
                c.strokeStyle = '#' + color.toString(16).padStart(6, '0');
                c.lineWidth = 8;
                c.strokeRect(4, 4, pw - 8, h - 8);
                c.fillStyle = INK;
                c.font = '700 ' + Math.round(h * 0.42) + 'px ' + SERIF;
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                c.fillText(text, pw / 2, h / 2 + 2);
            });
            p.mesh.position.set(x, y, z);
            p.mesh.rotation.y = rotY;
            scene.add(p.mesh);
            return p;
        }

        /* ===================== 도로: 3차선과 고가 교차로 ===================== */
        slab(6.0, 0.12, 1.6, 0.2, 0.06, 0, solidM(COLOR.road), false);

        const laneCanvas = canvas2d(1200, 320);
        const laneC = laneCanvas[0];
        const laneX = laneCanvas[1];
        laneX.fillStyle = '#3b3b48';
        laneX.fillRect(0, 0, 1200, 320);
        ['addr', 'data', 'ctrl'].forEach(function (k) {
            const cy = (LANE[k] + 0.8) * 200;
            laneX.fillStyle = LANE_FILL[k];
            laneX.fillRect(0, cy - 50, 1200, 100);
            laneX.fillStyle = INK;
            laneX.font = '700 44px ' + SERIF;
            laneX.textAlign = 'center';
            laneX.textBaseline = 'middle';
            laneX.fillText(LANE_LABEL[k], 600, cy);
        });
        const lanePaint = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 1.6), new THREE.MeshLambertMaterial({ map: texture(laneC) }));
        lanePaint.rotation.x = -Math.PI / 2;
        lanePaint.position.set(0.2, RY + 0.01, 0);
        scene.add(lanePaint);

        const pillarM = solidM(COLOR.pillar);
        [2.5, 2.95].forEach(function (px) {
            slab(0.18, DECK - 0.1, 0.18, px, (DECK - 0.1) / 2, -0.4, pillarM, true);
        });
        const rampLen = Math.hypot(RAMP[1] - RAMP[0], DECK - RY);
        const ramp = slab(rampLen, 0.12, 1.05, (RAMP[0] + RAMP[1]) / 2, (DECK + RY) / 2, -0.275, solidM(COLOR.deck), true);
        ramp.rotation.z = Math.atan2(DECK - RY, RAMP[1] - RAMP[0]);
        slab(0.8, 0.1, 1.05, 2.8, DECK - 0.05, -0.275, solidM(COLOR.deck), true);
        slab(0.8, 0.02, 0.06, 2.8, DECK + 0.01, LANE.addr, solidM(COLOR.addr), false);
        slab(0.8, 0.02, 0.06, 2.8, DECK + 0.01, LANE.data, solidM(COLOR.data), false);

        /* ===================== 장치: CPU, 메모리, I/O ===================== */
        slab(1.4, 2.2, 2.2, -3.5, 1.1, 0, solidM(COLOR.cpu), true);
        slab(1.3, 2.6, 1.3, 3.85, 1.3, -0.55, solidM(COLOR.mem), true);
        slab(1.3, 1.4, 1.3, 3.85, 0.7, 0.95, solidM(COLOR.io), true);
        sign('CPU', -3.5, 1.5, 1.13, 1.2, COLOR.cpu, 0);
        sign('MEMORY', 3.21, 2.0, -0.55, 1.0, COLOR.mem, -Math.PI / 2);
        sign('I/O 장치', 3.21, 1.1, 0.95, 1.0, COLOR.io, -Math.PI / 2);

        /* ===================== 중재 신호등 ===================== */
        const arbM = solidM(COLOR.arb);
        [-1.1, 1.1].forEach(function (z) { slab(0.1, 1.5, 0.1, ARB_X, 0.75, z, arbM, true); });
        slab(0.14, 0.12, 2.3, ARB_X, 1.5, 0, arbM, true);
        const housingM = solidM(COLOR.housing);
        const lamps = {};
        ['addr', 'data', 'ctrl'].forEach(function (k) {
            const z = LANE[k];
            slab(0.26, 0.56, 0.22, ARB_X, 1.2, z, housingM, true);
            lamps[k] = {};
            LAMP_ORDER.forEach(function (c) {
                const m = new THREE.MeshBasicMaterial({ color: LAMP_OFF[c], toneMapped: false });
                const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.065, 16, 12), m);
                bulb.position.set(ARB_X, LAMP_Y[c], z + 0.13);
                scene.add(bulb);
                lamps[k][c] = m;
            });
        });
        const lightState = { addr: 'red', data: 'red', ctrl: 'red' };
        sign('중재 신호등 ARBITER', ARB_X, 1.8, 0, 1.4, COLOR.arb, 0);

        let ownerTxt = OWNER_TEXT.cpu;

        /**
         * 버스 사용권 표시판을 그린다.
         *
         * @param c  2D 컨텍스트
         * @param pw 폭
         * @param ph 높이
         */
        function drawOwner(c, pw, ph) {
            c.fillStyle = '#fbf8f1';
            c.fillRect(0, 0, pw, ph);
            c.strokeStyle = '#' + COLOR.arb.toString(16).padStart(6, '0');
            c.lineWidth = 8;
            c.strokeRect(4, 4, pw - 8, ph - 8);
            c.fillStyle = INK;
            c.font = '700 ' + Math.round(ph * 0.42) + 'px ' + SERIF;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(ownerTxt, pw / 2, ph / 2 + 2);
        }
        const owner = panel(1.8, 0.3, 512, 85, drawOwner);
        owner.mesh.position.set(ARB_X, 2.2, 0);
        scene.add(owner.mesh);

        /**
         * 버스 사용권 표시를 바꾼다.
         *
         * @param who 표시할 사용자 키(cpu, io)
         */
        function setOwner(who) {
            ownerTxt = OWNER_TEXT[who];
            owner.redraw(drawOwner);
        }

        /**
         * 차선 불빛을 바꾼다.
         *
         * @param lane  차선 이름
         * @param color 켤 불빛(red, yellow, green)
         */
        function setLamp(lane, color) {
            LAMP_ORDER.forEach(function (c) { lamps[lane][c].color.setHex(c === color ? LAMP_ON[c] : LAMP_OFF[c]); });
            lightState[lane] = color;
            invalidate();
        }

        /* ===================== 차량과 라벨 ===================== */
        /**
         * 칩 값을 그리는 스프라이트 라벨을 만든다.
         *
         * @returns 스프라이트와 그리기 함수
         */
        function makeLabel() {
            const lc = canvas2d(256, 112);
            const tex = texture(lc[0]);
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
            sprite.scale.set(0.8, 0.35, 1);
            /**
             * 라벨에 칩 값과 테두리 색을 그린다.
             *
             * @param text  칩 값
             * @param color 테두리와 색
             */
            function paint(text, color) {
                const x = lc[1];
                x.clearRect(0, 0, 256, 112);
                x.fillStyle = '#fffdf6';
                x.fillRect(4, 4, 248, 104);
                x.strokeStyle = '#' + color.toString(16).padStart(6, '0');
                x.lineWidth = 10;
                x.strokeRect(5, 5, 246, 102);
                x.fillStyle = INK;
                x.font = '700 60px ' + HAND;
                x.textAlign = 'center';
                x.textBaseline = 'middle';
                x.fillText(text, 128, 58);
                tex.needsUpdate = true;
                invalidate();
            }
            return { sprite: sprite, paint: paint };
        }

        /**
         * 차선 색을 가진 차량 하나를 만든다. 처음에는 숨긴다.
         *
         * @param k 차선 이름(addr, data, ctrl)
         * @returns 차량 그룹과 칩 그리기 함수
         */
        function makeCar(k) {
            const grp = new THREE.Group();
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.3), solidM(COLOR[k]));
            body.castShadow = true;
            ink(body, 40);
            grp.add(body);
            const lab = makeLabel();
            lab.sprite.position.set(0, 0.36, 0);
            grp.add(lab.sprite);
            grp.visible = false;
            scene.add(grp);
            return {
                grp: grp,
                paint: function (text) { lab.paint(text, COLOR[k]); }
            };
        }

        const CARS = {};
        ['addr', 'data', 'ctrl'].forEach(function (k) { CARS[k] = makeCar(k); });

        const pings = [];
        for (let i = 0; i < 3; i++) {
            const gl = glow(0xffffff, 0.6);
            gl.material.opacity = 0;
            scene.add(gl);
            pings.push(gl);
        }
        let pingIdx = 0;

        /**
         * 지정한 위치에 색 번쩍임을 잠깐 띄운다.
         *
         * @param pos   위치
         * @param color 색
         * @param size  크기
         * @param ms    지속 시간(배속 전)
         * @returns 완료 Promise
         */
        function ping(pos, color, size, ms) {
            const gl = pings[pingIdx++ % pings.length];
            gl.position.copy(pos);
            gl.material.color.setHex(color);
            gl.scale.set(size, size, 1);
            return tween(ms / state.speed, function (p) { gl.material.opacity = Math.sin(p * Math.PI) * 0.95; });
        }

        /**
         * 시간을 배속에 맞춰 줄인 트윈을 등록한다.
         *
         * @param ms 밀리초(배속 전)
         * @param fn 진행률을 받는 함수
         * @param ease 이징 함수(선택)
         * @returns 완료 Promise
         */
        function tw(ms, fn, ease) {
            return tween(ms / state.speed, fn, ease);
        }

        /**
         * 차량을 경로를 따라 몬다. 도착하면 차량은 그대로 두고 완료된다.
         *
         * @param car 차량
         * @param pts 경로 점 배열
         * @returns 완료 Promise
         */
        function drive(car, pts) {
            car.grp.position.copy(pts[0]);
            car.grp.visible = true;
            return tw(travelMs(pts), function (p) { polyAt(pts, p, car.grp.position); }, easeInOut);
        }

        /* ===================== 신호 진행 ===================== */
        /**
         * 차선을 열어 준다. 다른 차선이 초록이면 노랑을 거쳐 빨강으로 바꾼 뒤 연다.
         *
         * @param g    장면 세대 번호
         * @param lane 열 차선
         * @returns 단계가 아직 유효하면 true
         */
        async function giveWay(g, lane) {
            if (lightState[lane] === 'green') return alive(g);
            const busy = Object.keys(lightState).filter(function (k) { return lightState[k] === 'green'; });
            if (busy.length) {
                busy.forEach(function (k) { setLamp(k, 'yellow'); });
                await wait(360);
                if (!alive(g)) return false;
                Object.keys(lightState).forEach(function (k) { setLamp(k, 'red'); });
                await wait(160);
                if (!alive(g)) return false;
            }
            setLamp(lane, 'green');
            await wait(260);
            return alive(g);
        }

        /**
         * 화면 비율에 맞춰 카메라를 뒤로 물린 샷을 적용한다.
         *
         * @param key 샷 이름(wide, arb)
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
         * 화살표 하나를 보낸다. 차선을 열고, 칩이 붙은 차량이 경로를 달린 뒤 도착 점이 번쩍인다.
         *
         * @param g  장면 세대 번호
         * @param ar 화살표 데이터(from, to, via, chip)
         * @returns 단계가 아직 유효하면 true
         */
        async function sendOn(g, ar) {
            const car = CARS[ar.via];
            const pts = ROUTES[ar.from + '>' + ar.to + ':' + ar.via];
            if (!await giveWay(g, ar.via)) return false;
            car.paint(ar.chip);
            view(ar.to === 'arb' || ar.from === 'arb' ? 'arb' : 'wide');
            await drive(car, pts);
            if (!alive(g)) return false;
            car.grp.visible = false;
            ping(pts[pts.length - 1].clone().add(new V(0, 0.5, 0)), COLOR[ar.via], 0.9, 500);
            if (ar.from === 'arb') setOwner('io');
            await wait(300);
            return alive(g);
        }

        /**
         * 모든 차량과 불빛, 표시를 처음 상태로 되돌린다. 단계를 시작할 때마다 부른다.
         */
        function reset() {
            eng.clearTweens();
            Object.keys(CARS).forEach(function (k) { CARS[k].grp.visible = false; });
            pings.forEach(function (gl) { gl.material.opacity = 0; });
            Object.keys(lightState).forEach(function (k) { setLamp(k, 'red'); });
            setOwner('cpu');
            invalidate();
        }

        /**
         * 단계 하나를 처음 상태에서 끝까지 재생한다. 화살표마다 차선 하나를 쓴다.
         *
         * @param i 단계 번호
         * @param g 단계 시작 시점의 세대 번호
         */
        async function play(i, g) {
            reset();
            const st = STEPS[i];
            say(st.badge, st.log.slice(st.log.indexOf('— ') + 2));
            view('wide');
            await wait(400);
            if (!alive(g)) return;
            for (let k = 0; k < st.arrows.length; k++) {
                if (!await sendOn(g, st.arrows[k])) return;
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

        reset();

        return {
            play: play,
            applyTheme: applyTheme
        };
    }

    /* ===================== 3D 컨트롤러 ===================== */
    const v3 = window.CsFlow.viz3d.create({
        title: 'Bus Architecture 3D',
        badges: BADGES,
        canvasLabel: '버스 구조를 3차선 도로와 신호등으로 보여 주는 3D 장면. 주소, 데이터, 제어 차선을 중재 신호등이 한 번에 한 차선씩 열어 줍니다. 아래 장면 버튼으로 과정을 따라갑니다.',
        home: { p: SHOTS.wide[0], t: SHOTS.wide[1] },
        load: function () { return kit.loadFonts(fontSample()); },
        createWorld: createWorld
    });

    v3.setSteps(STEPS.map(function (_, i) {
        return function (g) { return v3.state.world.play(i, g); };
    }));
})();