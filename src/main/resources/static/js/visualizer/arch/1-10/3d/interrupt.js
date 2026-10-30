/**
 * 인터럽트 3D 사무실 시각화 (Three.js r128)
 * 2D 시각화의 "3D 사무실" 버튼을 누를 때만 로드된다. 공용 엔진 viz3d-common.js와 2D 단계 데이터(window.CsFlow.interruptData)가 먼저 있어야 한다.
 * 직원(CPU)이 책상에서 일하다가 교환대(PIC)의 전화(IRQ1)를 받고, 책갈피를 꽂아 서류 보관함(스택)에 넣은 뒤,
 * 전화번호부(IVT)에서 담당자(ISR)를 찾아 처리하고, 보관함의 서류를 꺼내 원래 일로 돌아가는 과정을 보여 준다.
 */
(function () {
    'use strict';

    const THREE = window.THREE;
    if (!window.CsFlow || !THREE || !window.CsFlow.viz3d || !window.CsFlow.interruptData) return;

    const DATA = window.CsFlow.interruptData;
    const V = THREE.Vector3;
    const kit = window.CsFlow.viz3d.kit;
    const SERIF = kit.SERIF;
    const HAND = kit.HAND;
    const INK = kit.INK;
    const MONO = 'monospace';

    /* ===================== 2D 데이터에서 읽는 값 ===================== */
    const STEPS = DATA.STEPS;
    const BADGES = STEPS.map(function (s) { return s.badge; });
    const PUSH_ORDER = DATA.STACK.slice().reverse();
    const FULL = PUSH_ORDER.length;
    const RET_LINE = DATA.MAIN.length - 1;
    const ISR_LAST = DATA.ISR.length - 2;
    const IRET_LINE = DATA.ISR.length - 1;
    const ISR_ADDR = '0x' + DATA.ISR_AD[0];
    const RET_ADDR = 'PC=' + DATA.MAIN_AD[RET_LINE];

    /* ===================== 상수 ===================== */
    const THEMES = {
        dark: { bg: 0x12171d, floor: 0x232a33, hemi: 0.75, sun: 1.0, exposure: 1.0 },
        light: { bg: 0xe4e8ec, floor: 0xd3dae1, hemi: 0.7, sun: 1.0, exposure: 1.0 }
    };
    const HEX = { orange: 0xf0a040, teal: 0x2fb8a0, yellow: 0xe8c24a, green: 0x5fcf6a, purple: 0x8a5cff };
    const TYPE_HEX = { signal: 0xf0a040, save: 0x2fb8a0, lookup: 0xe8c24a, jump: 0x5fcf6a, restore: 0x2fb8a0, resume: 0x8a5cff };
    const BEFORE = [
        { ribbon: false, stack: 0, ivt: false, isr: -1, main: RET_LINE },
        { ribbon: false, stack: 0, ivt: false, isr: -1, main: RET_LINE },
        { ribbon: true, stack: FULL, ivt: false, isr: -1, main: RET_LINE },
        { ribbon: true, stack: FULL, ivt: true, isr: -1, main: RET_LINE },
        { ribbon: true, stack: FULL, ivt: false, isr: ISR_LAST, main: -1 }
    ];
    const SHOTS = {
        wide: { p: [0, 5.6, 8.4], t: [0, 1.05, -0.9], w: 4.6 },
        cpu: { p: [-2.2, 3.0, 2.5], t: [-2.2, 0.8, -0.2], w: 1.9 },
        book: { p: [0.4, 2.9, 1.6], t: [0.4, 1.3, -1.5], w: 1.25 },
        isr: { p: [2.8, 3.0, 2.6], t: [2.8, 0.8, -0.2], w: 1.9 }
    };
    const COPY = {
        cpu: 'CPU · 직원',
        cpuSub: '메인 프로그램',
        pic: 'PIC · 교환대',
        picSub: 'IRQ 컨트롤러',
        ivt: 'IVT · 벡터 테이블',
        ivtHead: '인터럽트 번호 → ISR 주소',
        isr: 'ISR · 키보드 담당',
        isrSub: '키보드 처리 루틴',
        stack: '스택 · 서류 보관함',
        stackItem: '스택 항목',
        stackCount: '스택',
        unit: '개',
        empty: '비어 있음',
        isrAddr: 'ISR 주소',
        retAddr: '복귀',
        keyboard: '키보드'
    };

    /* ===================== 배치 ===================== */
    const CPU_X = -2.8;
    const ISR_X = 2.8;
    const DESK_TOP = 0.78;
    const TRAY = { x: -1.2, z: 0 };
    const TRAY_TOP = 0.8;
    const PHONE = { x: -2.2, z: 0.1 };
    const BOOK = { x: 0.4, z: -1.58 };
    const SW = { x: -2.8, y: 1.75, z: -2.28 };
    const BOARD = { x: 0.4, y: 2.38, z: -2.28 };
    const SHEET_W = 1.1;
    const SHEET_H = 0.7;
    const SHEET_PW = 540;
    const SHEET_PH = 344;
    const SHEET_ROW0 = 120;
    const SHEET_DY = 58;
    const CPU_SHEET = { x: -3.2, z: 0.05 };
    const ISR_SHEET = { x: 2.4, z: 0.05 };
    const ZONE = {
        CPU: { x: CPU_X, z: 0.0, w: 2.2, d: 1.6 },
        STACK: { x: TRAY.x, z: TRAY.z, w: 0.95, d: 0.85 },
        IVT: { x: BOOK.x, z: BOOK.z, w: 0.9, d: 0.7 },
        ISR: { x: ISR_X, z: 0.0, w: 2.2, d: 1.6 }
    };
    const CABLE = [new V(-2.5, 1.3, -2.2), new V(-2.05, 1.45, -1.6), new V(-1.85, 1.3, -0.7), new V(-2.2, 0.92, 0.1)];
    const LAMP_PT = new V(SW.x + (0.375 - 0.5) * 1.56, SW.y + (0.5 - 0.42) * 0.86, SW.z + 0.05);
    const HEAD_CPU = new V(CPU_X, 1.25, -0.6);
    const HEAD_ISR = new V(ISR_X, 1.25, -0.6);
    const SHEET_PT = new V(CPU_SHEET.x, 0.96, CPU_SHEET.z);
    const BOOK_PT = new V(BOOK.x, 1.25, -1.35);
    const PHONE_PT = new V(PHONE.x, 0.95, PHONE.z);
    const RIBBON = { x: -2.6, y: DESK_TOP + 0.02, z: rowZ(RET_LINE) };

    /**
     * 문서 캔버스의 줄 번호를 책상 위 문서의 z 좌표로 바꾼다.
     *
     * @param i 줄 번호
     * @returns 시트 위 z 좌표
     */
    function rowZ(i) {
        return 0.05 - SHEET_H / 2 + ((SHEET_ROW0 + i * SHEET_DY) / SHEET_PH) * SHEET_H;
    }

    /**
     * 보관함에서 i번째 서류가 놓이는 자리를 돌려준다. 0번이 맨 아래다.
     *
     * @param i 쌓인 순서 번호
     * @returns 자리 좌표
     */
    function slot(i) {
        return new V(TRAY.x, TRAY_TOP + 0.012 + i * 0.012, TRAY.z);
    }

    /**
     * 2D 단계의 화살표 종류로 토큰 색을 고른다.
     *
     * @param i 단계 번호
     * @param k 화살표 번호
     * @returns 16진수 색
     */
    function colorOf(i, k) {
        return TYPE_HEX[STEPS[i].arrow[k][2]] || 0xffffff;
    }

    /**
     * 16진수 색을 캔버스용 문자열로 바꾼다.
     *
     * @param hex 16진수 색
     * @returns #로 시작하는 문자열
     */
    function hexStr(hex) {
        return '#' + hex.toString(16).padStart(6, '0');
    }

    /**
     * 16진수 색에 투명도를 붙여 캔버스용 rgba 문자열을 만든다.
     *
     * @param hex 16진수 색
     * @param a   투명도 0~1
     * @returns rgba 문자열
     */
    function css(hex, a) {
        return 'rgba(' + ((hex >> 16) & 255) + ',' + ((hex >> 8) & 255) + ',' + (hex & 255) + ',' + a + ')';
    }

    /**
     * 글꼴을 미리 받을 때 쓰는 문자열을 돌려준다. 캔버스에 그리는 모든 문구를 포함한다.
     *
     * @returns 문자열
     */
    function fontSample() {
        const phase = Object.keys(DATA.PHASE).map(function (k) { return DATA.PHASE[k][0]; });
        const copy = Object.keys(COPY).map(function (k) { return COPY[k]; });
        return copy.concat(phase).join('') + ' →·0123456789ABCDEFxIRQPCFLAGS=';
    }

    /* ===================== 월드(씬) ===================== */
    /**
     * Three.js 씬을 만든다. 개방형 사무실 바닥, 칸막이, 직원 책상, 교환대, 전화번호부, 보관함, 상태 보드를 포함한다.
     *
     * @param eng 공용 엔진
     * @returns 월드 API(play)와 테마 훅(applyTheme)
     */
    function createWorld(eng) {
        const scene = eng.scene;
        const canvas2d = eng.canvas2d;
        const texture = eng.texture;
        const ink = eng.ink;
        const glow = eng.glow;
        const invalidate = eng.invalidate;
        const easeInOut = eng.api.easeInOut;
        const lowEnd = eng.lowEnd;
        const state = v3.state;
        const alive = v3.alive;
        const wait = v3.wait;
        const say = v3.setCaption;

        scene.background = new THREE.Color(THEMES.dark.bg);
        scene.fog = new THREE.Fog(THEMES.dark.bg, 16, 34);

        /* ===================== 빛과 바닥 ===================== */
        const hemi = new THREE.HemisphereLight(0xf4f7ff, 0x6e7a88, 0.75);
        scene.add(hemi);
        const sun = new THREE.DirectionalLight(0xfff3e0, 1.1);
        sun.position.set(-5, 10, 7);
        sun.castShadow = true;
        sun.shadow.mapSize.set(lowEnd ? 512 : 1024, lowEnd ? 512 : 1024);
        Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 6, bottom: -6, near: 1, far: 30 });
        sun.shadow.bias = -0.0005;
        scene.add(sun);
        const ceil = new THREE.PointLight(0xdfe9ff, 0.45, 9);
        ceil.position.set(0, 2.8, 1.2);
        scene.add(ceil);

        const [tileC, tileX] = canvas2d(128, 128);
        tileX.fillStyle = '#ffffff';
        tileX.fillRect(0, 0, 128, 128);
        tileX.strokeStyle = 'rgba(0,0,0,0.28)';
        tileX.lineWidth = 3;
        tileX.strokeRect(1.5, 1.5, 125, 125);
        const tileT = texture(tileC);
        tileT.wrapS = tileT.wrapT = THREE.RepeatWrapping;
        tileT.repeat.set(40, 30);
        const floorM = new THREE.MeshLambertMaterial({ color: THEMES.dark.floor, map: tileT });
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), floorM);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        scene.add(floor);

        const deskM = new THREE.MeshLambertMaterial({ color: 0xd9dde2 });
        const steelM = new THREE.MeshLambertMaterial({ color: 0x4a5563 });
        const partM = new THREE.MeshLambertMaterial({ color: 0x3f6670 });
        const chairM = new THREE.MeshLambertMaterial({ color: 0x2b313a });
        const trayM = new THREE.MeshLambertMaterial({ color: 0x9aa5b1 });
        const frameM = new THREE.MeshLambertMaterial({ color: 0x2b313a });
        const solidMats = {};

        /**
         * 색깔 하나짜리 재료를 돌려준다. 같은 색은 한 번만 만든다.
         *
         * @param c 16진수 색
         * @returns 재료
         */
        function solidM(c) {
            if (!solidMats[c]) solidMats[c] = new THREE.MeshLambertMaterial({ color: c });
            return solidMats[c];
        }

        /**
         * 상자를 만들어 위치를 잡고 씬에 붙인다.
         *
         * @param w       폭
         * @param h       높이
         * @param d       깊이
         * @param x       x 좌표
         * @param y       y 좌표
         * @param z       z 좌표
         * @param m       재료
         * @param outline 잉크 외곽선 여부
         * @returns 메시
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
         * @param w     평면 폭
         * @param h     평면 높이
         * @param pw    캔버스 폭
         * @param ph    캔버스 높이
         * @param draw  그리는 함수(context, 폭, 높이)
         * @param basic 조명을 받지 않는 재료 여부
         * @returns 평면 참조(mesh, mat, redraw)
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
             * @param fn 그리는 함수
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
         * 책상 위에 눕힌 평면을 만들고 씬에 붙인다.
         *
         * @param w    폭
         * @param h    깊이
         * @param pw   캔버스 폭
         * @param ph   캔버스 높이
         * @param draw 그리는 함수
         * @param x    x 좌표
         * @param y    y 좌표
         * @param z    z 좌표
         * @returns 평면 참조
         */
        function flatPanel(w, h, pw, ph, draw, x, y, z) {
            const p = panel(w, h, pw, ph, draw);
            p.mesh.rotation.x = -Math.PI / 2;
            p.mesh.position.set(x, y, z);
            scene.add(p.mesh);
            return p;
        }

        /**
         * 벽에 거는 이름표를 만든다. 글자 크기는 칸에 맞춘다.
         *
         * @param text  이름표 문구
         * @param x     x 좌표
         * @param y     y 좌표
         * @param z     z 좌표
         * @param w     폭
         * @param h     높이
         * @param color 테두리 색
         * @returns 평면 참조
         */
        function plate(text, x, y, z, w, h, color) {
            const pw = 512;
            const ph = Math.round(512 * h / w);
            const p = panel(w, h, pw, ph, function (c, cw, ch) {
                c.fillStyle = '#f2efe8';
                c.fillRect(0, 0, cw, ch);
                c.strokeStyle = hexStr(color);
                c.lineWidth = 8;
                c.strokeRect(4, 4, cw - 8, ch - 8);
                c.fillStyle = INK;
                c.font = '700 ' + Math.min(Math.round(ch * 0.46), Math.floor(cw / (text.length * 0.95))) + 'px ' + SERIF;
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                c.fillText(text, cw / 2, ch / 2 + 2);
            });
            p.mesh.position.set(x, y, z);
            scene.add(p.mesh);
            return p;
        }

        /**
         * 사무실 책상을 만든다. 상판과 양쪽 다리를 포함한다.
         *
         * @param x 중심 x 좌표
         * @param z 중심 z 좌표
         * @param w 상판 폭
         */
        function desk(x, z, w) {
            slab(w, 0.07, 0.9, x, 0.745, z, deskM, true);
            [-w / 2 + 0.1, w / 2 - 0.1].forEach(function (dx) {
                slab(0.07, 0.7, 0.8, x + dx, 0.35, z, steelM, false);
            });
        }

        /**
         * 회전 의자를 만든다.
         *
         * @param x 중심 x 좌표
         * @param z 중심 z 좌표
         */
        function chair(x, z) {
            slab(0.5, 0.07, 0.48, x, 0.48, z, chairM, false);
            slab(0.5, 0.5, 0.06, x, 0.78, z - 0.24, chairM, false);
            slab(0.06, 0.46, 0.06, x, 0.22, z, steelM, false);
        }

        /**
         * 앉아 있는 직원을 만든다. 머리는 따로 돌릴 수 있게 그룹으로 묶는다.
         *
         * @param x       x 좌표
         * @param z       z 좌표
         * @param shirt   옷 색
         * @param headset 헤드셋 여부
         * @returns 몸통 그룹과 머리 그룹
         */
        function staff(x, z, shirt, headset) {
            const g = new THREE.Group();
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.66, 0.26), solidM(shirt));
            body.position.set(0, 0.83, 0);
            body.castShadow = true;
            g.add(body);
            const head = new THREE.Group();
            head.position.set(0, 1.3, 0);
            const skull = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 16), solidM(0xf0d2b0));
            skull.castShadow = true;
            head.add(skull);
            if (headset) {
                const band = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 8, 20, Math.PI), solidM(0x2b313a));
                head.add(band);
            }
            g.add(head);
            g.position.set(x, 0, z);
            scene.add(g);
            return { group: g, head: head };
        }

        /* ===================== 칸막이와 책상 ===================== */
        desk(CPU_X, 0.0, 2.0);
        desk(ISR_X, 0.0, 2.0);
        chair(CPU_X, -0.85);
        chair(ISR_X, -0.85);
        slab(2.5, 1.1, 0.05, CPU_X, 0.55, -1.35, partM, true);
        slab(0.05, 1.1, 2.0, -4.0, 0.55, -0.35, partM, true);
        slab(2.5, 1.1, 0.05, ISR_X, 0.55, -1.35, partM, true);
        slab(0.05, 1.1, 2.0, 4.0, 0.55, -0.35, partM, true);
        plate(COPY.cpu, CPU_X, 0.95, -1.32, 1.2, 0.22, HEX.purple);
        plate(COPY.isr, ISR_X, 0.95, -1.32, 1.2, 0.22, HEX.green);

        const cpuStaff = staff(CPU_X, -0.85, 0x4a7fd6, false);
        const isrStaff = staff(ISR_X, -0.85, 0x3f9e6a, true);

        /* ===================== 직원 책상: 작업 문서와 책갈피 ===================== */
        const mainState = { line: RET_LINE };
        /**
         * 작업 문서 한 장을 그린다. 강조한 줄은 색을 깐다.
         *
         * @param title 문서 제목
         * @param rows  줄 내용
         * @param adr   줄 주소
         * @param hl    강조할 줄 번호(-1이면 없음)
         * @param hue   강조 색
         * @param c     2D 컨텍스트
         * @param pw    캔버스 폭
         * @param ph    캔버스 높이
         */
        function drawSheet(title, rows, adr, hl, hue, c, pw, ph) {
            c.fillStyle = '#fffdf6';
            c.fillRect(0, 0, pw, ph);
            c.strokeStyle = 'rgba(60,50,40,0.5)';
            c.lineWidth = 6;
            c.strokeRect(4, 4, pw - 8, ph - 8);
            c.fillStyle = INK;
            c.font = '700 30px ' + SERIF;
            c.textAlign = 'left';
            c.textBaseline = 'middle';
            c.fillText(title, 26, 48);
            rows.forEach(function (txt, i) {
                const y = SHEET_ROW0 + i * SHEET_DY;
                if (i === hl) {
                    c.fillStyle = css(hue, 0.28);
                    c.fillRect(14, y - 24, pw - 28, 48);
                }
                c.font = '400 22px ' + MONO;
                c.fillStyle = '#6b6358';
                c.fillText(adr[i], 26, y);
                c.font = '700 30px ' + MONO;
                c.fillStyle = INK;
                c.fillText(txt, 170, y);
            });
        }
        const cpuSheet = flatPanel(SHEET_W, SHEET_H, SHEET_PW, SHEET_PH, function () {}, CPU_SHEET.x, DESK_TOP + 0.005, CPU_SHEET.z);
        const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.05), solidM(0xe24b4a));
        ribbon.position.set(RIBBON.x, RIBBON.y, RIBBON.z);
        ribbon.visible = false;
        scene.add(ribbon);

        const phone = new THREE.Group();
        const phoneBase = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.26), solidM(0x3a4150));
        phoneBase.position.set(0, 0.03, 0);
        phoneBase.castShadow = true;
        phone.add(phoneBase);
        phone.position.set(PHONE.x, DESK_TOP, PHONE.z);
        scene.add(phone);
        const handset = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.07), solidM(0x3a4150));
        handset.position.set(PHONE.x, DESK_TOP + 0.09, PHONE.z);
        handset.castShadow = true;
        scene.add(handset);

        /* ===================== 교환대(PIC) ===================== */
        const picState = { lit: false, active: false };
        /**
         * 교환대 보드를 그린다. IRQ1 램프가 켜지고, 이 단계가 PIC를 쓰면 테두리를 강조한다.
         *
         * @param c   2D 컨텍스트
         * @param pw  캔버스 폭
         * @param ph  캔버스 높이
         */
        function drawSwitch(c, pw, ph) {
            c.fillStyle = '#20262e';
            c.fillRect(0, 0, pw, ph);
            c.strokeStyle = picState.active ? hexStr(HEX.orange) : '#4a5563';
            c.lineWidth = picState.active ? 10 : 6;
            c.strokeRect(4, 4, pw - 8, ph - 8);
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillStyle = '#e8edf2';
            c.font = '700 34px ' + SERIF;
            c.fillText(COPY.pic, pw / 2, 40);
            c.font = '500 22px ' + SERIF;
            c.fillStyle = '#9fb0c0';
            c.fillText(COPY.picSub, pw / 2, 84);
            for (let n = 0; n < 8; n++) {
                const cx = pw * (0.125 + (n % 4) * 0.25);
                const cy = ph * (0.42 + Math.floor(n / 4) * 0.32);
                const lit = picState.lit && n === 1;
                c.beginPath();
                c.arc(cx, cy, 22, 0, Math.PI * 2);
                c.fillStyle = lit ? hexStr(HEX.orange) : '#3c4450';
                c.fill();
                if (lit) {
                    c.strokeStyle = css(HEX.orange, 0.6);
                    c.lineWidth = 8;
                    c.stroke();
                }
                c.fillStyle = '#c9d3dd';
                c.font = '600 22px ' + SERIF;
                c.fillText(n === 1 ? 'IRQ1 ' + COPY.keyboard : 'IRQ' + n, cx, cy + 46);
            }
        }
        slab(1.72, 0.96, 0.06, SW.x, SW.y, SW.z - 0.04, frameM, true);
        const sw = panel(1.56, 0.86, 640, 352, drawSwitch, false);
        sw.mesh.position.set(SW.x, SW.y, SW.z);
        scene.add(sw.mesh);
        const cableCurve = new THREE.CatmullRomCurve3(CABLE);
        scene.add(new THREE.Mesh(new THREE.TubeGeometry(cableCurve, 32, 0.018, 6, false), solidM(0x1f252d)));

        /* ===================== 전화번호부(IVT) ===================== */
        const bookState = { ivt: false };
        /**
         * 전화번호부 쪽을 그린다. IRQ1 행이 ivt 단계부터 강조된다.
         *
         * @param c  2D 컨텍스트
         * @param pw 캔버스 폭
         * @param ph 캔버스 높이
         */
        function drawBook(c, pw, ph) {
            c.fillStyle = '#f7f1e3';
            c.fillRect(0, 0, pw, ph);
            c.strokeStyle = 'rgba(60,50,40,0.5)';
            c.lineWidth = 6;
            c.strokeRect(4, 4, pw - 8, ph - 8);
            c.textAlign = 'left';
            c.textBaseline = 'middle';
            c.fillStyle = INK;
            c.font = '700 34px ' + SERIF;
            c.fillText(COPY.ivt, 26, 44);
            c.fillStyle = '#6b6358';
            c.font = '500 26px ' + SERIF;
            c.fillText(COPY.ivtHead, 26, 92);
            if (bookState.ivt) {
                c.fillStyle = css(HEX.yellow, 0.4);
                c.fillRect(14, 140, pw - 28, 60);
            }
            c.fillStyle = INK;
            c.font = '700 30px ' + SERIF;
            c.fillText('IRQ1 · ' + COPY.keyboard, 26, 170);
            c.textAlign = 'right';
            c.font = '700 34px ' + MONO;
            c.fillStyle = bookState.ivt ? '#7a5a00' : '#6b6358';
            c.fillText(ISR_ADDR, pw - 26, 170);
            c.setLineDash([10, 8]);
            c.strokeStyle = 'rgba(60,50,40,0.35)';
            c.lineWidth = 3;
            [250, 310].forEach(function (y) {
                c.beginPath();
                c.moveTo(26, y);
                c.lineTo(pw - 26, y);
                c.stroke();
            });
            c.setLineDash([]);
        }
        slab(0.5, 0.8, 0.4, BOOK.x, 0.4, BOOK.z, steelM, true);
        const book = panel(1.05, 0.72, 512, 352, drawBook, false);
        book.mesh.position.set(BOOK.x, 1.2, BOOK.z);
        book.mesh.rotation.x = -0.3;
        scene.add(book.mesh);

        /* ===================== 보관함(스택) ===================== */
        desk(TRAY.x, TRAY.z, 0.9);
        slab(0.6, 0.02, 0.46, TRAY.x, 0.79, TRAY.z, trayM, false);
        plate(COPY.stack, TRAY.x, 0.72, 0.41, 0.7, 0.16, HEX.teal);

        /**
         * 보관함 서류 한 장을 그린다.
         *
         * @param head  위쪽 제목
         * @param value 가운데 문구
         * @param col   테두리 색
         * @param c     2D 컨텍스트
         * @param pw    캔버스 폭
         * @param ph    캔버스 높이
         */
        function drawCard(head, value, col, c, pw, ph) {
            c.fillStyle = '#fffdf6';
            c.fillRect(0, 0, pw, ph);
            c.strokeStyle = hexStr(col);
            c.lineWidth = 10;
            c.strokeRect(5, 5, pw - 10, ph - 10);
            c.fillStyle = hexStr(col);
            c.font = '700 26px ' + SERIF;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(head, pw / 2, 40);
            c.fillStyle = INK;
            c.font = '700 ' + (value.length > 6 ? 46 : 62) + 'px ' + HAND;
            c.fillText(value, pw / 2, ph * 0.63);
        }
        const cards = PUSH_ORDER.map(function (name) {
            const p = panel(0.52, 0.34, 256, 170, drawCard.bind(null, COPY.stackItem, name, HEX.teal));
            p.mesh.rotation.x = -Math.PI / 2;
            p.mesh.visible = false;
            scene.add(p.mesh);
            return p;
        });

        /* ===================== 상태 보드 ===================== */
        const boardState = { phase: STEPS[0].phase, stack: 0 };
        /**
         * 상태 보드를 그린다. 현재 단계의 설명, 스택 깊이, ISR 주소와 복귀 주소를 적는다.
         *
         * @param c  2D 컨텍스트
         * @param pw 캔버스 폭
         * @param ph 캔버스 높이
         */
        function drawBoard(c, pw, ph) {
            const info = DATA.PHASE[boardState.phase] || ['', 'teal'];
            const col = HEX[info[1]] || 0xffffff;
            c.fillStyle = '#1d232b';
            c.fillRect(0, 0, pw, ph);
            c.strokeStyle = hexStr(col);
            c.lineWidth = 8;
            c.strokeRect(4, 4, pw - 8, ph - 8);
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillStyle = hexStr(col);
            c.font = '700 40px ' + SERIF;
            c.fillText(info[0], pw / 2, 58);
            c.fillStyle = '#e8edf2';
            c.font = '700 32px ' + SERIF;
            const names = PUSH_ORDER.slice(0, boardState.stack).join(' → ');
            c.fillText(COPY.stackCount + ' ' + boardState.stack + COPY.unit + ' · ' + (boardState.stack ? names : COPY.empty), pw / 2, 124);
            c.fillStyle = '#9fb0c0';
            c.font = '500 28px ' + SERIF;
            c.fillText(COPY.isrAddr + ' ' + ISR_ADDR + '   ·   ' + COPY.retAddr + ' ' + RET_ADDR, pw / 2, 184);
        }
        const board = panel(2.6, 0.8, 780, 240, drawBoard, true);
        board.mesh.position.set(BOARD.x, BOARD.y, BOARD.z);
        scene.add(board.mesh);
        slab(2.72, 0.86, 0.06, BOARD.x, BOARD.y, BOARD.z - 0.04, frameM, true);

        /* ===================== 담당자 책상(ISR) ===================== */
        const isrState = { line: -1 };
        const isrSheet = flatPanel(SHEET_W, SHEET_H, SHEET_PW, SHEET_PH, function () {}, ISR_SHEET.x, DESK_TOP + 0.005, ISR_SHEET.z);
        slab(0.6, 0.03, 0.22, 3.4, DESK_TOP + 0.015, 0.12, frameM, false);

        /* ===================== 구역 표시 ===================== */
        const zoneM = {};
        Object.keys(ZONE).forEach(function (k) {
            const z = ZONE[k];
            const m = new THREE.MeshBasicMaterial({ color: HEX[DATA.NODE_COL[k]] || 0xffffff, transparent: true, opacity: 0, depthWrite: false });
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(z.w, z.d), m);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(z.x, 0.012, z.z);
            scene.add(mesh);
            zoneM[k] = m;
        });

        /* ===================== 번쩍임과 토큰 ===================== */
        const pings = [0, 1, 2].map(function () {
            const g = glow(0xffffff, 0.6);
            g.material.opacity = 0;
            scene.add(g);
            return g;
        });
        let pingIdx = 0;
        const tokens = [0, 1, 2].map(function () {
            const t = glow(0xffffff, 0.45);
            t.visible = false;
            scene.add(t);
            return t;
        });
        let tokIdx = 0;

        /**
         * 지정한 위치에 색 번쩍임을 잠깐 띄운다.
         *
         * @param pos   위치
         * @param color 색
         * @param size  크기
         * @param ms    지속 시간(배속 전)
         * @returns 완료 Promise
         */
        function pulse(pos, color, size, ms) {
            const g = pings[pingIdx++ % pings.length];
            g.position.copy(pos);
            g.material.color.setHex(color);
            g.scale.set(size, size, 1);
            return tw(ms, function (p) { g.material.opacity = Math.sin(p * Math.PI) * 0.95; });
        }

        /* ===================== 움직임 도구 ===================== */
        /**
         * 시간을 배속에 맞춰 줄인 트윈을 등록한다.
         *
         * @param ms 밀리초(배속 전)
         * @param fn 진행률을 받는 함수
         * @returns 완료 Promise
         */
        function tw(ms, fn) {
            return eng.tween(ms / state.speed, fn);
        }

        /**
         * 물체를 지나갈 점들을 이은 곡선을 따라 옮긴다.
         *
         * @param o   움직일 객체
         * @param pts 지나갈 점 배열
         * @param ms  걸리는 시간(배속 전)
         * @returns 완료 Promise
         */
        function arc(o, pts, ms) {
            const curve = new THREE.CatmullRomCurve3(pts);
            return tw(ms, function (p) { curve.getPoint(p, o.position); });
        }

        /**
         * 색 토큰 하나를 점들을 따라 보낸다. 끝나면 숨긴다.
         *
         * @param pts   지나갈 점 배열
         * @param color 토큰 색
         * @param ms    걸리는 시간(배속 전)
         * @returns 완료 Promise
         */
        function flyTok(pts, color, ms) {
            const t = tokens[tokIdx++ % tokens.length];
            t.material.color.setHex(color);
            t.visible = true;
            return arc(t, pts, ms).then(function () { t.visible = false; });
        }

        /**
         * 카메라를 지정한 샷으로 옮긴다. 화면이 좁으면 가로 폭이 모자라지 않게 뒤로 물린다.
         *
         * @param key 샷 이름
         */
        function view(key) {
            const s = SHOTS[key];
            const w = eng.stage.clientWidth || 1;
            const h = eng.stage.clientHeight || 1;
            const t = new V(s.t[0], s.t[1], s.t[2]);
            const off = new V(s.p[0], s.p[1], s.p[2]).sub(t);
            const tanH = Math.tan((w < 520 ? 46 : 32) * Math.PI / 360);
            const k = Math.max(1, s.w / ((w / h) * tanH * off.length()));
            const p = t.clone().add(off.multiplyScalar(k));
            eng.api.shot([p.x, p.y, p.z], [t.x, t.y, t.z]);
        }

        /**
         * 단계 설명을 로그 바에 쓴다. 2D 로그의 "Step N — " 뒤 문장을 쓴다.
         *
         * @param i 단계 번호
         */
        function cap(i) {
            const s = STEPS[i];
            say(s.badge, s.log.split(' — ').slice(1).join(' — '));
        }

        /* ===================== 화면 그리기 ===================== */
        /**
         * 직원 책상 문서를 현재 강조 줄로 다시 그린다.
         */
        function paintMain() {
            cpuSheet.redraw(drawSheet.bind(null, COPY.cpuSub, DATA.MAIN, DATA.MAIN_AD, mainState.line, HEX.purple));
        }

        /**
         * 담당자 책상 문서를 현재 강조 줄로 다시 그린다.
         */
        function paintIsr() {
            isrSheet.redraw(drawSheet.bind(null, COPY.isrSub, DATA.ISR, DATA.ISR_AD, isrState.line, HEX.green));
        }

        /**
         * 전화번호부 쪽을 다시 그린다.
         */
        function paintBook() {
            book.redraw(drawBook);
        }

        /**
         * 교환대 보드를 다시 그린다.
         */
        function paintSwitch() {
            sw.redraw(drawSwitch);
        }

        /**
         * 상태 보드를 다시 그린다.
         */
        function paintBoard() {
            board.redraw(drawBoard);
        }

        /* ===================== 장면 상태 ===================== */
        const ribbonMesh = ribbon;
        const phoneBaseMesh = phoneBase;
        /**
         * 장면을 단계 시작 상태로 되돌린다. 단계를 시작할 때마다 부른다.
         *
         * @param step 단계 번호
         */
        function reset(step) {
            eng.clearTweens();
            const b = BEFORE[step];
            mainState.line = b.main;
            isrState.line = b.isr;
            bookState.ivt = b.ivt;
            picState.lit = false;
            picState.active = STEPS[step].active.indexOf('PIC') >= 0;
            boardState.phase = STEPS[step].phase;
            boardState.stack = b.stack;
            ribbonMesh.visible = b.ribbon;
            ribbonMesh.position.set(RIBBON.x, RIBBON.y, RIBBON.z);
            ribbonMesh.scale.setScalar(1);
            cards.forEach(function (c, i) {
                c.mesh.visible = i < b.stack;
                c.mesh.position.copy(slot(i));
                c.mesh.scale.setScalar(1);
            });
            tokens.forEach(function (t) { t.visible = false; });
            pings.forEach(function (g) { g.material.opacity = 0; });
            handset.rotation.z = 0;
            cpuStaff.head.rotation.set(0, 0, 0);
            isrStaff.head.rotation.set(0, 0, 0);
            Object.keys(zoneM).forEach(function (k) {
                zoneM[k].opacity = STEPS[step].active.indexOf(k) >= 0 ? 0.3 : 0;
            });
            paintMain();
            paintIsr();
            paintBook();
            paintSwitch();
            paintBoard();
            invalidate();
        }

        /* ===================== 단계 ===================== */
        /**
         * 1단계: 교환대 램프가 켜지고 전화(IRQ1)가 울린다. 신호가 책상 전화까지 간다.
         *
         * @param g 단계 세대 번호
         */
        async function run0(g) {
            view('wide');
            cap(0);
            picState.lit = true;
            paintSwitch();
            pulse(LAMP_PT, colorOf(0, 0), 1.0, 500);
            await Promise.all([
                tw(900, function (p) { handset.rotation.z = Math.sin(p * Math.PI * 10) * 0.14 * (1 - p); }),
                flyTok([LAMP_PT].concat(CABLE), colorOf(0, 0), 1100)
            ]);
            if (!alive(g)) return;
            handset.rotation.z = 0;
            pulse(PHONE_PT, colorOf(0, 0), 0.9, 500);
        }

        /**
         * 2단계: 책갈피를 꽂고, PC와 FLAGS 서류를 보관함에 차례로 쌓는다.
         *
         * @param g 단계 세대 번호
         */
        async function run1(g) {
            view('cpu');
            cap(1);
            picState.lit = false;
            paintSwitch();
            ribbonMesh.visible = true;
            ribbonMesh.position.y = RIBBON.y + 0.3;
            await tw(450, function (p) { ribbonMesh.position.y = RIBBON.y + 0.3 * (1 - p); });
            if (!alive(g)) return;
            for (let i = 0; i < FULL; i++) {
                cards[i].mesh.visible = true;
                await arc(cards[i].mesh, [HEAD_CPU.clone(), new V(-2.1, 1.65, -0.35), new V(-1.5, 1.25, -0.05), slot(i)], 800);
                if (!alive(g)) return;
                boardState.stack = i + 1;
                paintBoard();
            }
            view('wide');
        }

        /**
         * 3단계: 전화번호부에서 IRQ1 행을 찾아 담당자 ISR 주소를 확인한다.
         *
         * @param g 단계 세대 번호
         */
        async function run2(g) {
            view('wide');
            cap(2);
            await flyTok([HEAD_CPU.clone(), new V(-1.6, 2.15, -1.0), new V(-0.4, 1.9, -1.2), BOOK_PT.clone()], colorOf(2, 0), 1000);
            if (!alive(g)) return;
            view('book');
            bookState.ivt = true;
            paintBook();
            pulse(BOOK_PT.clone(), colorOf(2, 0), 1.1, 600);
            await wait(700);
            if (!alive(g)) return;
            view('wide');
        }

        /**
         * 4단계: 담당자 ISR로 넘어가 키보드 처리 줄을 차례로 실행한다. 직원 문서의 강조는 꺼진다.
         *
         * @param g 단계 세대 번호
         */
        async function run3(g) {
            view('wide');
            cap(3);
            await flyTok([BOOK_PT.clone(), new V(0.9, 2.3, -0.9), new V(2.0, 2.2, -0.5), HEAD_ISR.clone()], colorOf(3, 0), 1000);
            if (!alive(g)) return;
            mainState.line = -1;
            paintMain();
            view('isr');
            for (let k = 0; k <= ISR_LAST; k++) {
                isrState.line = k;
                paintIsr();
                await tw(420, function (p) { isrStaff.head.rotation.x = Math.sin(p * Math.PI) * 0.22; });
                if (!alive(g)) return;
            }
            view('wide');
        }

        /**
         * 5단계: IRET로 담당자 일이 끝나고, 보관함의 서류를 꺼내 직원이 원래 문서로 돌아간다.
         *
         * @param g 단계 세대 번호
         */
        async function run4(g) {
            view('isr');
            cap(4);
            isrState.line = IRET_LINE;
            paintIsr();
            await tw(500, function (p) { isrStaff.head.rotation.x = Math.sin(p * Math.PI) * 0.1; });
            if (!alive(g)) return;
            view('wide');
            await flyTok([HEAD_ISR.clone(), new V(0.6, 2.3, -0.6), new V(-0.2, 2.0, -0.2), slot(FULL - 1).add(new V(0, 0.25, 0))], colorOf(4, 0), 800);
            if (!alive(g)) return;
            for (let i = FULL - 1; i >= 0; i--) {
                cards[i].mesh.visible = true;
                await arc(cards[i].mesh, [slot(i), new V(-1.9, 1.35, 0.0), new V(-2.6, 1.05, 0.1), SHEET_PT.clone()], 700);
                if (!alive(g)) return;
                cards[i].mesh.visible = false;
                boardState.stack = i;
                paintBoard();
            }
            await flyTok([slot(0).add(new V(0, 0.25, 0)), new V(-1.9, 1.5, -0.2), HEAD_CPU.clone()], colorOf(4, 1), 800);
            if (!alive(g)) return;
            isrState.line = -1;
            paintIsr();
            mainState.line = RET_LINE;
            paintMain();
            await tw(350, function (p) { ribbonMesh.scale.setScalar(1 - p); });
            if (!alive(g)) return;
            ribbonMesh.visible = false;
            view('wide');
        }

        const FLOW = [run0, run1, run2, run3, run4];

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
            floorM.color.setHex(th.floor);
            hemi.intensity = th.hemi;
            sun.intensity = th.sun;
            eng.renderer.toneMappingExposure = th.exposure;
        }

        eng.renderer.shadowMap.autoUpdate = false;
        eng.renderer.shadowMap.needsUpdate = true;
        reset(0);

        return {
            play: play,
            applyTheme: applyTheme
        };
    }

    /* ===================== 3D 컨트롤러 ===================== */
    const v3 = window.CsFlow.viz3d.create({
        title: 'Interrupt 3D',
        badges: BADGES,
        canvasLabel: '인터럽트를 사무실 책상과 전화로 보여 주는 3D 장면. 직원이 전화를 받고 책갈피를 꽂아 보관함에 넣은 뒤, 전화번호부에서 담당자를 찾아 처리하고 돌아옵니다. 아래 장면 버튼으로 과정을 따라갑니다.',
        home: { p: SHOTS.wide.p, t: SHOTS.wide.t },
        load: function () { return kit.loadFonts(fontSample()); },
        createWorld: createWorld
    });

    v3.setSteps(BADGES.map(function (_, i) {
        return function (g) { return v3.state.world.play(i, g); };
    }));
})();