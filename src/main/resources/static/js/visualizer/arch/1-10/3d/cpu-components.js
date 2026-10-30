/**
 * CPU 구성 요소를 공장 단면으로 보여 주는 3D 시각화 (Three.js r128)
 * 2D 시각화의 "3D 공장 단면" 버튼을 누를 때만 로드된다. 공용 엔진 viz3d-common.js가 먼저 로드돼 있어야 한다.
 * 덮개가 열리며 감독 탑(CU), 작업대(ALU), 부품 선반(레지스터), 번호판(PC), 자재 창고(메모리)가 드러나고,
 * 데이터 쪽지가 수송관을 따라 부품 사이를 지나간다. 단계와 수치는 2D의 단계 데이터와 같다.
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

    /* ===================== 상수 ===================== */
    const STEPS = [
        { active: 'PC', regs: { PC: '0x04', IR: '—', MAR: '—', MDR: '—', ACC: '5' }, badge: 'FETCH', label: 'PC', text: '다음 명령어 주소 0x04를 MAR로 전달합니다.' },
        { active: 'MAR', regs: { PC: '0x04', IR: '—', MAR: '0x04', MDR: '—', ACC: '5' }, badge: 'FETCH', label: 'MAR', text: '메모리 주소 0x04 저장 완료. 메모리에서 명령어를 읽습니다.' },
        { active: 'MDR', regs: { PC: '0x04', IR: '—', MAR: '0x04', MDR: 'ADD 0x10', ACC: '5' }, badge: 'FETCH', label: 'MDR', text: '메모리[0x04]에서 명령어 "ADD 0x10"을 읽어 MDR에 저장했습니다.' },
        { active: 'IR', regs: { PC: '0x05', IR: 'ADD 0x10', MAR: '0x04', MDR: 'ADD 0x10', ACC: '5' }, badge: 'DECODE', label: 'IR → CU', text: '명령어를 IR에 적재. CU가 명령어를 해석합니다.' },
        { active: 'MAR', regs: { PC: '0x05', IR: 'ADD 0x10', MAR: '0x10', MDR: 'ADD 0x10', ACC: '5' }, badge: 'DECODE', label: 'CU → MAR', text: 'CU가 피연산자 주소 0x10을 MAR로 전달합니다.' },
        { active: 'MDR', regs: { PC: '0x05', IR: 'ADD 0x10', MAR: '0x10', MDR: '3', ACC: '5' }, badge: 'EXECUTE', label: '메모리 → MDR', text: '메모리[0x10] = 3 읽기 완료.' },
        { active: 'ALU', regs: { PC: '0x05', IR: 'ADD 0x10', MAR: '0x10', MDR: '3', ACC: '5' }, badge: 'EXECUTE', label: 'ALU', text: 'ACC(5) + MDR(3) 덧셈 연산 수행 중...' },
        { active: 'ACC', regs: { PC: '0x05', IR: 'ADD 0x10', MAR: '0x10', MDR: '3', ACC: '8' }, badge: 'EXECUTE', label: 'ALU → ACC', text: '연산 결과 8이 ACC에 저장되었습니다. 완료!' }
    ];
    const MEM_VAL = { '0x04': STEPS[2].regs.MDR, '0x10': STEPS[5].regs.MDR };
    const THEMES = {
        dark: { bg: 0x12151c, ground: 0x2b2f38, hemi: 0.7, sun: 1.0, exposure: 1.0 },
        light: { bg: 0xdcd6c8, ground: 0xe9e3d4, hemi: 0.65, sun: 1.0, exposure: 1.0 }
    };
    const COLOR = { ctrl: 0xf0a030, data: 0x8a5cff, reg: 0xff7a2f, alu: 0x1d9e75, mem: 0x2fb865 };
    const PT = {
        pc: [-2.6, 2.1, -1.35], board: [-2.6, 2.45, -1.4], ir: [-3.15, 1.35, -0.45], mar: [-2.25, 1.35, -0.45],
        mdr: [-3.15, 0.575, -0.45], acc: [-2.25, 0.575, -0.45], memA: [2.65, 0.575, -0.45], memB: [3.75, 0.575, -0.45],
        tower: [0, 1.45, -0.25], lamp: [0, 2.45, -0.28], aluAcc: [-0.9, 1.35, 0.4], aluMdr: [0.9, 1.35, 0.4],
        aluOut: [0, 1.35, 0.4], alu: [0, 1.5, 0.4]
    };
    const SHOTS = {
        wide: [[0, 5.0, 11.0], [0, 1.4, -0.2]],
        shelf: [[-2.6, 2.7, 4.6], [-2.5, 1.5, -0.6]],
        tower: [[0, 3.3, 4.0], [0, 1.8, -0.9]],
        bench: [[0, 3.0, 4.2], [0, 1.6, 0.4]]
    };
    const LID_OPEN = -1.9;
    const ROUTE_DIM = 0.18;
    const PRESS_REST = [0, 2.05, 0.4];
    const PRESS_DOWN = [0, 1.42, 0.4];
    const TEXTS = ['CPU 공장 · 단면도', 'CU · 감독 탑', 'ALU · 작업대', '메모리 창고', 'PC', 'IR', 'MAR', 'MDR', 'ACC', 'ADD 0x10', '0x04', '0x10', '5 + 3', '= 8', '—'];

    /* ===================== 그리기 도구 ===================== */
    /**
     * 색 숫자를 CSS 색 문자열로 바꾼다.
     *
     * @param c 0xRRGGBB 색
     * @returns #으로 시작하는 6자리 색 문자열
     */
    function hex(c) {
        return '#' + c.toString(16).padStart(6, '0');
    }

    /**
     * 좌표 배열을 Vector3로 바꾼다.
     *
     * @param a [x, y, z] 좌표
     * @returns Vector3
     */
    function vec(a) {
        return new V(a[0], a[1], a[2]);
    }

    /**
     * 캔버스에 그리는 문구를 모아 글꼴 로드용 샘플로 돌려준다.
     *
     * @returns 문자열
     */
    function fontSample() {
        return TEXTS.join('') + '0123456789ABCDEFxX+=';
    }

    /**
     * 레지스터나 메모리 칸의 라벨 면을 그린다. 강조하면 테두리가 굵어진다.
     *
     * @param name  칸 이름
     * @param value 칸에 든 값
     * @param on    강조 여부
     * @param color 칸 색
     * @param c     2D 컨텍스트
     * @param pw    캔버스 폭
     * @param ph    캔버스 높이
     */
    function drawBin(name, value, on, color, c, pw, ph) {
        c.fillStyle = '#fbf6ea';
        c.fillRect(0, 0, pw, ph);
        c.strokeStyle = on ? hex(color) : 'rgba(60,50,40,0.4)';
        c.lineWidth = on ? 12 : 5;
        c.strokeRect(6, 6, pw - 12, ph - 12);
        c.fillStyle = hex(color);
        c.font = '700 ' + Math.round(ph * 0.26) + 'px ' + SERIF;
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText(name, 18, ph * 0.26);
        c.fillStyle = INK;
        c.font = '700 ' + (value.length > 6 ? 40 : 60) + 'px ' + HAND;
        c.textAlign = 'center';
        c.fillText(value, pw / 2, ph * 0.66);
    }

    /**
     * 번호판(PC)을 그린다. 현재 번지를 큰 숫자로 보여 준다.
     *
     * @param pc 현재 PC 값
     * @param on 강조 여부
     * @param c  2D 컨텍스트
     * @param pw 캔버스 폭
     * @param ph 캔버스 높이
     */
    function drawBoard(pc, on, c, pw, ph) {
        c.fillStyle = '#1d1b22';
        c.fillRect(0, 0, pw, ph);
        c.strokeStyle = on ? '#ffd27a' : '#6a5a3a';
        c.lineWidth = on ? 14 : 8;
        c.strokeRect(7, 7, pw - 14, ph - 14);
        c.fillStyle = '#ffd27a';
        c.font = '700 ' + Math.round(ph * 0.22) + 'px ' + SERIF;
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText('PC', 26, ph / 2);
        c.fillStyle = '#ffb347';
        c.font = '700 ' + Math.round(ph * 0.66) + 'px ' + HAND;
        c.textAlign = 'center';
        c.fillText(pc, pw * 0.63, ph / 2 + 6);
    }

    /**
     * 작업대 계기판에 연산식이나 결과를 그린다.
     *
     * @param text 표시할 문자열
     * @param c    2D 컨텍스트
     * @param pw   캔버스 폭
     * @param ph   캔버스 높이
     */
    function drawAlu(text, c, pw, ph) {
        c.fillStyle = '#1d1b22';
        c.fillRect(0, 0, pw, ph);
        c.strokeStyle = '#5fe0b0';
        c.lineWidth = 8;
        c.strokeRect(5, 5, pw - 10, ph - 10);
        c.fillStyle = '#7fe8c4';
        c.font = '700 ' + Math.round(ph * 0.66) + 'px ' + HAND;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(text, pw / 2, ph / 2 + 4);
    }

    /**
     * 쪽지 카드(데이터 값)를 그린다.
     *
     * @param text  카드에 적을 값
     * @param color 테두리 색
     * @param c     2D 컨텍스트
     * @param pw    캔버스 폭
     * @param ph    캔버스 높이
     */
    function drawChip(text, color, c, pw, ph) {
        c.fillStyle = '#fffdf6';
        c.fillRect(0, 0, pw, ph);
        c.strokeStyle = hex(color);
        c.lineWidth = 12;
        c.strokeRect(6, 6, pw - 12, ph - 12);
        c.fillStyle = INK;
        c.font = '700 ' + Math.round(ph * (text.length > 5 ? 0.42 : 0.6)) + 'px ' + HAND;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(text, pw / 2, ph / 2 + 4);
    }

    /**
     * 덮개 윗면의 공장 이름표를 그린다.
     *
     * @param c  2D 컨텍스트
     * @param pw 캔버스 폭
     * @param ph 캔버스 높이
     */
    function drawLid(c, pw, ph) {
        c.fillStyle = '#c9ced4';
        c.fillRect(0, 0, pw, ph);
        c.strokeStyle = '#4d5560';
        c.lineWidth = 10;
        c.strokeRect(6, 6, pw - 12, ph - 12);
        c.fillStyle = INK;
        c.font = '700 ' + Math.round(ph * 0.42) + 'px ' + SERIF;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('CPU 공장 · 단면도', pw / 2, ph / 2 + 2);
    }

    /* ===================== 월드(씬) ===================== */
    /**
     * Three.js 씬을 만든다. 덮개 달린 공장 단면, 감독 탑, 작업대, 부품 선반, 번호판, 자재 창고, 수송관을 포함한다.
     *
     * @param eng 공용 엔진
     * @returns 월드 API(play, applyTheme)
     */
    function createWorld(eng) {
        const scene = eng.scene;
        const state = v3.state;
        const alive = v3.alive;
        const wait = v3.wait;
        const say = v3.setCaption;
        const easeInOut = eng.api.easeInOut;
        const easeBack = eng.api.easeBack;
        const invalidate = eng.invalidate;

        scene.background = new THREE.Color(THEMES.light.bg);
        scene.fog = new THREE.Fog(THEMES.light.bg, 18, 36);

        /* ===================== 빛과 재료 ===================== */
        const hemi = new THREE.HemisphereLight(0xfffaf0, 0x8c9a8e, 0.7);
        scene.add(hemi);
        const sun = new THREE.DirectionalLight(0xfff0d6, 1.2);
        sun.position.set(-5, 10, 8);
        sun.castShadow = true;
        sun.shadow.mapSize.set(eng.lowEnd ? 512 : 1024, eng.lowEnd ? 512 : 1024);
        Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
        sun.shadow.bias = -0.0005;
        scene.add(sun);
        const bulb = new THREE.PointLight(0xffd7a0, 0.6, 8);
        bulb.position.set(0, 2.6, 0.6);
        scene.add(bulb);

        const groundM = new THREE.MeshLambertMaterial({ color: THEMES.light.ground });
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), groundM);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        const wallM = new THREE.MeshLambertMaterial({ map: eng.hatch('#d6dbe0', 0.16, 60, 2) });
        const cutM = new THREE.MeshLambertMaterial({ color: 0x5a5f68 });
        const floorM = new THREE.MeshLambertMaterial({ color: 0xb8b1a0 });
        const steelM = new THREE.MeshLambertMaterial({ color: 0x6f7b88 });
        const steelBodyM = new THREE.MeshLambertMaterial({ color: 0x5c6b7c });
        const glassM = new THREE.MeshLambertMaterial({ color: 0xa9d8e8, transparent: true, opacity: 0.6 });
        const woodM = new THREE.MeshLambertMaterial({ color: 0xc09a66 });
        const darkWoodM = new THREE.MeshLambertMaterial({ color: 0x6e5030 });
        const cardM = new THREE.MeshLambertMaterial({ color: 0xc9a06a });
        const memCardM = new THREE.MeshLambertMaterial({ color: 0xa8c8a0 });
        const pressM = new THREE.MeshLambertMaterial({ color: 0x4c5c6e });
        const lidM = new THREE.MeshLambertMaterial({ color: 0x8a939e });

        /**
         * 상자를 만들어 위치를 잡고 씬(또는 부모)에 붙인다.
         *
         * @returns 만든 메시
         */
        function slab(w, h, d, x, y, z, m, outline, parent) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
            mesh.position.set(x, y, z);
            mesh.castShadow = mesh.receiveShadow = true;
            if (outline) eng.ink(mesh);
            (parent || scene).add(mesh);
            return mesh;
        }

        /**
         * 캔버스를 그린 평면을 만든다. redraw로 내용을 다시 그릴 수 있다.
         *
         * @returns { mesh, mat, redraw }
         */
        function panel(w, h, pw, ph, draw, basic) {
            const pc = eng.canvas2d(pw, ph);
            const c = pc[0];
            const x = pc[1];
            const tex = eng.texture(c);
            const mat = basic
                ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false })
                : new THREE.MeshLambertMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
            /**
             * 평면의 그림을 지우고 다시 그린다.
             *
             * @param fn 그림을 그리는 함수
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
         * 벽에 거는 안내판을 만든다. 글자가 넘치지 않게 크기를 줄인다.
         *
         * @returns 안내판 평면
         */
        function sign(text, x, y, z, w, color) {
            const p = panel(w, 0.3, 512, Math.round(512 * 0.3 / w), function (c, pw, ph) {
                c.fillStyle = '#f6ecd6';
                c.fillRect(0, 0, pw, ph);
                c.strokeStyle = hex(color);
                c.lineWidth = 8;
                c.strokeRect(4, 4, pw - 8, ph - 8);
                c.fillStyle = INK;
                c.font = '700 ' + Math.min(Math.round(ph * 0.46), Math.floor(pw / (text.length * 0.9))) + 'px ' + SERIF;
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                c.fillText(text, pw / 2, ph / 2 + 2);
            });
            p.mesh.position.set(x, y, z);
            scene.add(p.mesh);
            return p;
        }

        /**
         * 칸(상자)을 만들고 앞면에 값 라벨을 붙인다.
         *
         * @returns { name, p, color }
         */
        function makeBin(name, value, x, y, z, w, h, d, color, m) {
            slab(w, h, d, x, y, z, m, true);
            const lw = w - 0.06;
            const lh = h - 0.1;
            const p = panel(lw, lh, 256, Math.round(256 * lh / lw), drawBin.bind(null, name, value, false, color));
            p.mesh.position.set(x, y, z + d / 2 + 0.005);
            scene.add(p.mesh);
            return { name: name, p: p, color: color };
        }

        /* ===================== 건물 ===================== */
        slab(9.2, 0.2, 3.2, 0, 0.1, 0, cutM, true);
        slab(9.1, 0.02, 3.1, 0, 0.21, 0, floorM, false);
        slab(9.2, 2.7, 0.12, 0, 1.55, -1.66, wallM, true);
        [-4.66, 4.66].forEach(function (x) {
            slab(0.12, 2.7, 3.2, x, 1.55, 0, wallM, true);
        });

        const lidPivot = new THREE.Group();
        lidPivot.position.set(0, 2.95, -1.6);
        scene.add(lidPivot);
        slab(9.4, 0.12, 3.2, 0, 0, 1.6, lidM, true, lidPivot);
        const lidLabel = panel(4.2, 1.1, 512, 140, drawLid);
        lidLabel.mesh.rotation.x = -Math.PI / 2;
        lidLabel.mesh.position.set(0, 0.065, 1.6);
        lidPivot.add(lidLabel.mesh);

        /* ===================== 감독 탑(CU) ===================== */
        slab(1.3, 2.0, 1.2, 0, 1.2, -0.95, steelBodyM, true);
        slab(1.5, 0.5, 1.2, 0, 2.45, -0.95, glassM, true);
        sign('CU · 감독 탑', 0, 1.65, -0.343, 1.0, COLOR.ctrl);
        const lamp = eng.glow(COLOR.ctrl, 0.8);
        lamp.position.copy(vec(PT.lamp));
        scene.add(lamp);

        /* ===================== 번호판(PC) ===================== */
        const board = panel(1.4, 0.6, 512, 220, drawBoard.bind(null, '0x04', false));
        board.mesh.position.set(-2.6, 2.45, -1.5);
        scene.add(board.mesh);

        /* ===================== 부품 선반(레지스터) ===================== */
        slab(1.9, 1.75, 0.04, -2.7, 1.075, -1.3, darkWoodM, false);
        [-3.62, -1.78].forEach(function (x) {
            slab(0.06, 1.8, 0.7, x, 1.1, -0.95, darkWoodM, true);
        });
        [0.25, 1.05, 1.85].forEach(function (y) {
            slab(1.9, 0.05, 0.7, -2.7, y, -0.95, darkWoodM, true);
        });
        const BIN = {
            IR: makeBin('IR', '—', -3.15, 1.35, -0.95, 0.78, 0.55, 0.6, COLOR.reg, cardM),
            MAR: makeBin('MAR', '—', -2.25, 1.35, -0.95, 0.78, 0.55, 0.6, COLOR.reg, cardM),
            MDR: makeBin('MDR', '—', -3.15, 0.575, -0.95, 0.78, 0.55, 0.6, COLOR.reg, cardM),
            ACC: makeBin('ACC', '—', -2.25, 0.575, -0.95, 0.78, 0.55, 0.6, COLOR.reg, cardM)
        };

        /* ===================== 자재 창고(메모리) ===================== */
        slab(2.2, 1.75, 0.04, 3.2, 1.075, -1.3, darkWoodM, false);
        [2.13, 4.27].forEach(function (x) {
            slab(0.06, 1.8, 0.7, x, 1.1, -0.95, steelM, true);
        });
        [0.25, 1.05, 1.85].forEach(function (y) {
            slab(2.2, 0.05, 0.7, 3.2, y, -0.95, steelM, true);
        });
        const MEM = {
            '0x04': makeBin('0x04', MEM_VAL['0x04'], 2.65, 0.575, -0.95, 0.95, 0.55, 0.6, COLOR.mem, memCardM),
            '0x10': makeBin('0x10', MEM_VAL['0x10'], 3.75, 0.575, -0.95, 0.95, 0.55, 0.6, COLOR.mem, memCardM)
        };
        sign('메모리 창고', 3.2, 2.3, -1.545, 1.2, COLOR.mem);

        /* ===================== 작업대(ALU) ===================== */
        slab(2.2, 0.85, 0.95, 0, 0.625, 0.4, darkWoodM, true);
        slab(2.5, 0.1, 1.1, 0, 1.1, 0.4, woodM, true);
        [-0.5, 0.5].forEach(function (x) {
            slab(0.08, 1.45, 0.08, x, 1.875, 0.4, steelM, true);
        });
        slab(1.2, 0.12, 0.8, 0, 2.66, 0.4, steelM, true);
        const head = slab(0.9, 0.3, 0.7, PRESS_REST[0], PRESS_REST[1], PRESS_REST[2], pressM, true);
        const aluDisp = panel(0.8, 0.3, 256, 96, drawAlu.bind(null, '—'));
        aluDisp.mesh.position.set(0, 2.4, 0.805);
        scene.add(aluDisp.mesh);
        [PT.aluAcc[0], PT.aluMdr[0], PT.aluOut[0]].forEach(function (x) {
            slab(0.5, 0.04, 0.5, x, 1.17, 0.4, steelM, true);
        });
        const trayAcc = panel(0.5, 0.25, 256, 128, drawChip.bind(null, STEPS[6].regs.ACC, COLOR.reg));
        trayAcc.mesh.position.copy(vec(PT.aluAcc));
        scene.add(trayAcc.mesh);
        sign('ALU · 작업대', 0, 0.62, 0.91, 1.0, COLOR.alu);

        /* ===================== 쪽지와 번쩍임 ===================== */
        const chip = panel(0.62, 0.31, 256, 128, drawChip.bind(null, '', COLOR.data), true);
        chip.mesh.visible = false;
        scene.add(chip.mesh);
        const pings = [];
        for (let i = 0; i < 3; i++) {
            const sp = eng.glow(0xffffff, 0.6);
            sp.material.opacity = 0;
            scene.add(sp);
            pings.push(sp);
        }
        let pingIdx = 0;

        /* ===================== 수송관(경로) ===================== */
        /**
         * 두 점 사이를 부품 앞 통로로 잇는 경로 점들을 만든다.
         *
         * @param a 출발 좌표
         * @param b 도착 좌표
         * @param y 통로 높이
         * @returns Vector3 배열
         */
        function lane(a, b, y) {
            return [vec(a), new V(a[0], y, -0.1), new V(b[0], y, -0.1), vec(b)];
        }

        /**
         * 경로 점들을 따라 수송관을 만들고 곡선을 저장한다. 처음에는 흐리게 둔다.
         *
         * @param pts  Vector3 점 배열
         * @param color 수송관 색
         * @returns { curve, pipe }
         */
        function tubeRoute(pts, color) {
            const curve = new THREE.CatmullRomCurve3(pts);
            const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: ROUTE_DIM, depthWrite: false });
            const pipe = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.04, 6, false), mat);
            scene.add(pipe);
            return { curve: curve, pipe: pipe };
        }

        const ROUTE = {
            pcMar: tubeRoute(lane(PT.pc, PT.mar, 2.0), COLOR.data),
            addrA: tubeRoute(lane(PT.mar, PT.memA, 1.6), COLOR.reg),
            readA: tubeRoute(lane(PT.memA, PT.mdr, 1.25), COLOR.data),
            addrB: tubeRoute(lane(PT.mar, PT.memB, 1.7), COLOR.reg),
            readB: tubeRoute(lane(PT.memB, PT.mdr, 1.4), COLOR.data),
            ir: tubeRoute([vec(PT.mdr), new V(-3.5, 0.9, -0.1), new V(-3.5, 1.35, -0.1), vec(PT.ir)], COLOR.data),
            opnd: tubeRoute(lane(PT.tower, PT.mar, 1.5), COLOR.ctrl),
            alu: tubeRoute([vec(PT.mdr), new V(-3.15, 1.85, -0.1), new V(0.9, 1.85, -0.1), vec(PT.aluMdr)], COLOR.data),
            res: tubeRoute([vec(PT.aluOut), new V(0, 1.35, 1.3), new V(-2.25, 1.35, 1.3), new V(-2.25, 1.0, 0.2), vec(PT.acc)], COLOR.mem)
        };

        /* ===================== 도구 ===================== */
        /**
         * 배속을 반영한 트윈을 등록한다.
         *
         * @param ms   기준 밀리초
         * @param fn   진행률(0~1)을 받는 함수
         * @param ease 이징 함수, 생략하면 엔진 기본값
         * @returns 완료 Promise
         */
        function tw(ms, fn, ease) {
            return eng.tween(ms / state.speed, fn, ease);
        }

        /**
         * 물체를 목표 위치로 옮긴다.
         *
         * @param o    옮길 메시
         * @param to   목표 Vector3
         * @param ms   기준 밀리초
         * @param ease 이징 함수
         * @returns 완료 Promise
         */
        function moveTo(o, to, ms, ease) {
            const from = o.position.clone();
            return tw(ms, function (p) { o.position.lerpVectors(from, to, p); }, ease || easeInOut);
        }

        /**
         * 지정한 위치에 색 번쩍임을 잠깐 띄운다.
         *
         * @param pos   Vector3 위치
         * @param color 색
         * @param size  스프라이트 크기
         * @param ms    기준 밀리초
         * @returns 완료 Promise
         */
        function ping(pos, color, size, ms) {
            const sp = pings[pingIdx++ % pings.length];
            sp.position.copy(pos);
            sp.material.color.setHex(color);
            sp.scale.set(size, size, 1);
            return tw(ms, function (p) { sp.material.opacity = Math.sin(p * Math.PI) * 0.95; });
        }

        /**
         * 지정한 수송관을 강조하고 나머지는 흐리게 둔다.
         *
         * @param ids 강조할 수송관 이름 배열
         */
        function lightRoutes(ids) {
            Object.keys(ROUTE).forEach(function (k) {
                ROUTE[k].pipe.material.opacity = ids.indexOf(k) >= 0 ? 0.95 : ROUTE_DIM;
            });
            invalidate();
        }

        /**
         * 쪽지를 지정한 수송관으로 보낸다. 도착하면 쪽지는 그 자리에 남는다.
         *
         * @param g    장면 세대 번호
         * @param id   수송관 이름
         * @param text 쪽지 값
         * @param color 쪽지 테두리 색
         * @param ms   기준 밀리초
         * @returns 단계가 아직 유효하면 true
         */
        async function send(g, id, text, color, ms) {
            chip.redraw(drawChip.bind(null, text, color));
            chip.mesh.scale.setScalar(1);
            chip.mesh.visible = true;
            ROUTE[id].curve.getPoint(0, chip.mesh.position);
            await tw(ms, function (p) { ROUTE[id].curve.getPoint(p, chip.mesh.position); }, easeInOut);
            return alive(g);
        }

        /**
         * 레지스터 칸 하나의 값과 강조 상태를 바꿔 그린다.
         *
         * @param b     칸 객체
         * @param value 칸에 적을 값
         * @param on    강조 여부
         */
        function paintBin(b, value, on) {
            b.p.redraw(drawBin.bind(null, b.name, value, on, b.color));
        }

        /**
         * 번호판의 PC 값과 강조 상태를 바꿔 그린다.
         *
         * @param pc PC 값
         * @param on 강조 여부
         */
        function paintBoard(pc, on) {
            board.redraw(drawBoard.bind(null, pc, on));
        }

        /**
         * 작업대 계기판에 연산식이나 결과를 쓴다.
         *
         * @param text 표시할 문자열
         */
        function paintAlu(text) {
            aluDisp.redraw(drawAlu.bind(null, text));
        }

        /**
         * 레지스터 칸과 번호판을 주어진 값으로 그린다. active 칸만 강조한다.
         *
         * @param regs   칸 값 객체
         * @param active 강조할 칸 이름, 없으면 null
         */
        function show(regs, active) {
            Object.keys(BIN).forEach(function (k) { paintBin(BIN[k], regs[k], active === k); });
            paintBoard(regs.PC, active === 'PC');
            Object.keys(MEM).forEach(function (k) { paintBin(MEM[k], MEM_VAL[k], false); });
        }

        /**
         * 단계 시작 시점의 레지스터 값을 돌려준다. 첫 단계는 레지스터를 바꾸지 않는다.
         *
         * @param i 단계 번호
         * @returns 칸 값 객체
         */
        function before(i) {
            return i === 0 ? STEPS[0].regs : STEPS[i - 1].regs;
        }

        /**
         * 단계의 자막을 로그 바에 쓴다.
         *
         * @param i 단계 번호
         */
        function caption(i) {
            say(STEPS[i].label, STEPS[i].text);
        }

        /**
         * 카메라를 지정한 샷으로 옮긴다. 화면 비율에 맞춰 뒤로 물린다.
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
         * 장면을 단계 시작 상태로 되돌린다. 단계를 시작할 때마다 부른다.
         *
         * @param i 단계 번호
         */
        function reset(i) {
            eng.clearTweens();
            chip.mesh.visible = false;
            chip.mesh.scale.setScalar(1);
            pings.forEach(function (sp) { sp.material.opacity = 0; });
            lamp.material.opacity = 0.35;
            lidPivot.rotation.x = i === 0 ? 0 : LID_OPEN;
            head.position.set(PRESS_REST[0], PRESS_REST[1], PRESS_REST[2]);
            board.mesh.scale.set(1, 1, 1);
            trayAcc.mesh.visible = i === 6 || i === 7;
            paintAlu(i === 7 ? STEPS[6].regs.ACC + ' + ' + STEPS[6].regs.MDR : '—');
            lightRoutes([]);
            show(before(i), null);
            invalidate();
        }

        /* ===================== 장면 진행 ===================== */
        const FLOW = [
            /**
             * 0단계: 덮개가 열리고 번호판이 드러난다.
             *
             * @param g 세대 번호
             */
            async function (g) {
                view('wide');
                caption(0);
                show(before(0), 'PC');
                ping(vec(PT.board), COLOR.reg, 1.0, 700);
                await tw(1400, function (p) { lidPivot.rotation.x = LID_OPEN * p; }, easeInOut);
            },
            /**
             * 1단계: PC 값이 수송관을 따라 MAR 칸으로 간다.
             *
             * @param g 세대 번호
             */
            async function (g) {
                view('shelf');
                caption(1);
                show(before(1), 'MAR');
                lightRoutes(['pcMar']);
                if (!await send(g, 'pcMar', STEPS[1].regs.PC, COLOR.data, 1300)) return;
                paintBin(BIN.MAR, STEPS[1].regs.MAR, true);
                ping(vec(PT.mar), COLOR.reg, 0.8, 500);
                chip.mesh.visible = false;
                await wait(400);
            },
            /**
             * 2단계: 주소가 창고 칸으로 가고, 명령어가 MDR로 돌아온다.
             *
             * @param g 세대 번호
             */
            async function (g) {
                view('wide');
                caption(2);
                show(before(2), 'MDR');
                lightRoutes(['addrA']);
                if (!await send(g, 'addrA', STEPS[2].regs.MAR, COLOR.reg, 1100)) return;
                paintBin(MEM['0x04'], MEM_VAL['0x04'], true);
                ping(vec(PT.memA), COLOR.mem, 0.9, 500);
                lightRoutes(['readA']);
                if (!await send(g, 'readA', STEPS[2].regs.MDR, COLOR.data, 1200)) return;
                paintBin(BIN.MDR, STEPS[2].regs.MDR, true);
                ping(vec(PT.mdr), COLOR.data, 0.8, 500);
                chip.mesh.visible = false;
                await wait(400);
            },
            /**
             * 3단계: 명령어가 IR 칸으로 가고 CU가 해석한다. PC 번호판이 다음 주소로 넘어간다.
             *
             * @param g 세대 번호
             */
            async function (g) {
                view('wide');
                caption(3);
                show(before(3), 'IR');
                lightRoutes(['ir']);
                if (!await send(g, 'ir', STEPS[3].regs.IR, COLOR.data, 1100)) return;
                paintBin(BIN.IR, STEPS[3].regs.IR, true);
                chip.mesh.visible = false;
                ping(vec(PT.lamp), COLOR.ctrl, 0.9, 600);
                let swapped = false;
                await tw(700, function (p) {
                    board.mesh.scale.y = 1 - 0.92 * Math.sin(p * Math.PI);
                    if (!swapped && p >= 0.5) {
                        swapped = true;
                        paintBoard(STEPS[3].regs.PC, false);
                    }
                });
                if (!alive(g)) return;
                await wait(300);
            },
            /**
             * 4단계: 감독 탑이 피연산자 주소 0x10을 MAR 칸으로 보낸다.
             *
             * @param g 세대 번호
             */
            async function (g) {
                view('tower');
                caption(4);
                show(before(4), 'MAR');
                lightRoutes(['opnd']);
                ping(vec(PT.lamp), COLOR.ctrl, 0.9, 700);
                if (!await send(g, 'opnd', STEPS[4].regs.MAR, COLOR.ctrl, 1200)) return;
                paintBin(BIN.MAR, STEPS[4].regs.MAR, true);
                chip.mesh.visible = false;
                await wait(400);
            },
            /**
             * 5단계: 주소 0x10으로 창고에 가서 값 3을 MDR로 가져온다.
             *
             * @param g 세대 번호
             */
            async function (g) {
                view('wide');
                caption(5);
                show(before(5), 'MDR');
                lightRoutes(['addrB']);
                if (!await send(g, 'addrB', STEPS[5].regs.MAR, COLOR.reg, 1100)) return;
                ping(vec(PT.memB), COLOR.mem, 0.9, 500);
                lightRoutes(['readB']);
                if (!await send(g, 'readB', STEPS[5].regs.MDR, COLOR.data, 1200)) return;
                paintBin(BIN.MDR, STEPS[5].regs.MDR, true);
                paintBin(MEM['0x10'], MEM_VAL['0x10'], true);
                chip.mesh.visible = false;
                await wait(400);
            },
            /**
             * 6단계: 값 3이 작업대 입력 쟁반에 놓이고 프레스가 5 + 3을 계산한다.
             *
             * @param g 세대 번호
             */
            async function (g) {
                view('bench');
                caption(6);
                show(before(6), null);
                lightRoutes(['alu']);
                if (!await send(g, 'alu', STEPS[6].regs.MDR, COLOR.data, 1200)) return;
                paintAlu(STEPS[6].regs.ACC + ' + ' + STEPS[6].regs.MDR);
                ping(vec(PT.alu), COLOR.alu, 1.2, 600);
                await moveTo(head, vec(PRESS_DOWN), 500);
                if (!alive(g)) return;
                await wait(300);
                if (!alive(g)) return;
                await moveTo(head, vec(PRESS_REST), 400);
            },
            /**
             * 7단계: 결과 8이 나와 수송관을 따라 ACC 칸에 들어간다.
             *
             * @param g 세대 번호
             */
            async function (g) {
                view('bench');
                caption(7);
                show(before(7), 'ACC');
                trayAcc.mesh.visible = false;
                chip.mesh.visible = false;
                lightRoutes(['res']);
                paintAlu('= ' + STEPS[7].regs.ACC);
                chip.redraw(drawChip.bind(null, STEPS[7].regs.ACC, COLOR.mem));
                chip.mesh.position.copy(vec(PT.aluOut));
                chip.mesh.scale.setScalar(0.01);
                chip.mesh.visible = true;
                await tw(400, function (p) { chip.mesh.scale.setScalar(Math.max(0.01, p)); }, easeBack);
                if (!alive(g)) return;
                if (!await send(g, 'res', STEPS[7].regs.ACC, COLOR.mem, 1500)) return;
                paintBin(BIN.ACC, STEPS[7].regs.ACC, true);
                ping(vec(PT.acc), COLOR.mem, 0.9, 600);
                chip.mesh.visible = false;
                await wait(300);
                if (!alive(g)) return;
                view('wide');
            }
        ];

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
            applyTheme: applyTheme
        };
    }

    /* ===================== 3D 컨트롤러 ===================== */
    const v3 = window.CsFlow.viz3d.create({
        title: 'CPU Components 3D',
        badges: STEPS.map(function (s) { return s.badge; }),
        canvasLabel: 'CPU 구성 요소를 공장 단면으로 보여 주는 3D 장면. 덮개가 열리고 쪽지가 감독 탑, 작업대, 부품 선반, 번호판, 창고를 지나갑니다. 아래 장면 버튼으로 과정을 따라갑니다.',
        home: { p: SHOTS.wide[0], t: SHOTS.wide[1] },
        load: function () { return kit.loadFonts(fontSample()); },
        createWorld: createWorld
    });

    v3.setSteps(STEPS.map(function (_, i) {
        return function (g) { return v3.state.world.play(i, g); };
    }));
})();