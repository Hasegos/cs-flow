/**
 * 가상 메모리 3D 도서관 단면 시각화 (Three.js r128)
 * 2D 시각화의 "3D 도서관" 버튼을 누를 때만 로드된다. 공용 엔진 viz3d-common.js가 먼저 로드돼 있어야 한다.
 * 독자(CPU)가 낸 청구기호 쪽지(가상 주소)가 사서 책상(TLB), 색인 캐비닛(페이지 테이블), 열람실 선반(RAM),
 * 지하 서고(디스크)를 거치는 과정을 건물 단면으로 보여 준다.
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
    const BADGES = ['OVERVIEW', 'TLB HIT', 'TLB MISS', 'TLB HIT', 'PAGE FAULT'];
    const THEMES = {
        dark: { bg: 0x0f0f1a, ground: 0x2a2838, hemi: 0.7, sun: 1.0, exposure: 1.0 },
        light: { bg: 0xd9d2c4, ground: 0xece4d4, hemi: 0.65, sun: 1.0, exposure: 1.0 }
    };
    const FY = 1.7;
    const BY = 0.08;
    const COLOR = { cpu: 0x8a5cff, tlb: 0x1d9e75, pt: 0xff7a2f, ram: 0x2fb865, disk: 0x7f93b5, fault: 0xe24b4a };
    const PAGES = [
        { vpn: 0, pfn: 2 }, { vpn: 1, pfn: 5 }, { vpn: 2, pfn: 8 },
        { vpn: 3, pfn: null }, { vpn: 4, pfn: 11 }, { vpn: 5, pfn: null }
    ];
    const FAULT_PFN = 12;
    const REQUESTS = [null, 1, 2, 2, 3];
    const TLB_BEFORE = [[1], [1], [1], [1, 2], [1, 2]];
    const TLB_SLOTS = 4;
    const PAGE_SIZE = 4096;

    const COPY = {
        reader: '독자 · CPU',
        desk: '사서 책상 · TLB',
        cabinet: '색인 캐비닛 · 페이지 테이블',
        shelf: '열람실 선반 · RAM',
        stack: '지하 서고 · 디스크',
        virt: '가상 주소',
        phys: '물리 주소',
        onDisk: '서고에 있음',
        counterTitle: '이번 요청의 접근 횟수',
        ram: 'RAM',
        disk: '디스크',
        times: '회',
        subIdle: '요청을 기다리는 중',
        subHit: 'TLB 적중 · 변환이 책상에서 끝남',
        subMiss: 'TLB 미스 · 색인 캐비닛까지 감',
        subFault: '페이지 폴트 · 지하 서고까지 감'
    };

    const SHOTS = {
        overview: [[0.3, 4.6, 10.6], [0, 1.95, 0]],
        wide: [[-0.1, 3.9, 7.3], [0, 2.6, 0]],
        desk: [[-1.5, 3.4, 4.6], [-1.3, 2.6, -0.3]],
        cabinet: [[0.9, 3.4, 4.8], [1.0, 2.5, -0.4]],
        shelf: [[2.4, 3.5, 5.0], [2.5, 2.5, -0.5]],
        stacks: [[0.7, 1.5, 6.0], [0.7, 0.85, 0]]
    };

    /**
     * 캔버스에 그리는 모든 문구를 모아 글꼴 로드용 샘플로 돌려준다.
     *
     * @returns 문자열
     */
    function fontSample() {
        return Object.keys(COPY).map(function (k) { return COPY[k]; }).join('') + 'VPNPFNOFFSET0123456789x+ABCDEF→';
    }

    /**
     * 가상 페이지 번호가 가리키는 프레임 번호를 돌려준다. 디스크에 있던 페이지는 적재 뒤의 프레임이다.
     *
     * @param vpn 가상 페이지 번호
     * @returns 프레임 번호
     */
    function frameOf(vpn) {
        const p = PAGES[vpn].pfn;
        return p === null ? FAULT_PFN : p;
    }

    /**
     * 번호를 4KB 페이지 시작 주소 문자열로 바꾼다.
     *
     * @param n 페이지 또는 프레임 번호
     * @returns 0x로 시작하는 16진수 문자열
     */
    function hexOf(n) {
        return '0x' + (n * PAGE_SIZE).toString(16).toUpperCase();
    }

    /* ===================== 월드(씬) ===================== */
    /**
     * Three.js 씬을 만든다. 도서관 단면(열람실 층, 지하 서고), 쪽지 카드, 접근 횟수 카드를 포함한다.
     *
     * @param eng 공용 엔진
     * @returns 월드 API(play, reset)와 렌더 훅(busy, applyTheme, release)
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
        scene.fog = new THREE.Fog(0xd9d2c4, 16, 34);

        /* ===================== 재료와 빛 ===================== */
        const hemi = new THREE.HemisphereLight(0xfffaf0, 0x8c9a8e, 0.7);
        scene.add(hemi);
        const sun = new THREE.DirectionalLight(0xfff0d6, 1.2);
        sun.position.set(-5, 10, 8);
        sun.castShadow = true;
        sun.shadow.mapSize.set(lowEnd ? 512 : 1024, lowEnd ? 512 : 1024);
        Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
        sun.shadow.bias = -0.0005;
        scene.add(sun);
        const lamp = new THREE.PointLight(0xffd7a0, 0.7, 8);
        lamp.position.set(0.2, 0.9, 1.6);
        scene.add(lamp);

        const groundM = new THREE.MeshLambertMaterial({ color: 0xece4d4 });
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), groundM);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        const wallM = new THREE.MeshLambertMaterial({ map: eng.hatch('#e6d6b4', 0.22, 70, 2) });
        const stoneM = new THREE.MeshLambertMaterial({ color: 0x6f6455 });
        const woodM = new THREE.MeshLambertMaterial({ color: 0xb98a52 });
        const darkWoodM = new THREE.MeshLambertMaterial({ color: 0x6e5030 });
        const slabM = new THREE.MeshLambertMaterial({ color: 0x9c7a4c });
        const solidMats = {};

        /**
         * 색깔 하나짜리 재료를 돌려준다. 같은 색은 한 번만 만든다.
         */
        function solidM(c) {
            if (!solidMats[c]) solidMats[c] = new THREE.MeshLambertMaterial({ color: c });
            return solidMats[c];
        }

        /**
         * 상자를 만들어 위치를 잡고 씬(또는 부모)에 붙인다.
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
         * 사람 모양 인형(몸통 + 머리)을 만든다.
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

        /* ===================== 건물 ===================== */
        slab(9.4, BY, 4.4, 0, BY / 2, 0, slabM, true);
        slab(8.2, FY - 0.2 - BY, 0.1, 0, BY + (FY - 0.2 - BY) / 2, -1.55, stoneM, true);
        slab(8.2, 2.5, 0.1, 0, FY + 1.25, -1.55, wallM, true);
        [-4.05, 4.05].forEach(function (x) {
            slab(0.1, FY - 0.2 - BY, 3.1, x, BY + (FY - 0.2 - BY) / 2, 0, stoneM, true);
            slab(0.1, 2.5, 3.1, x, FY + 1.25, 0, wallM, true);
        });
        slab(8, 0.2, 1.95, 0, FY - 0.1, -0.525, slabM, true);
        slab(8, 0.2, 0.15, 0, FY - 0.1, 1.425, slabM, true);
        slab(3.7, 0.2, 0.9, -2.15, FY - 0.1, 0.9, slabM, true);
        slab(3.7, 0.2, 0.9, 2.15, FY - 0.1, 0.9, slabM, true);

        /**
         * 벽에 거는 안내판을 만든다.
         */
        function sign(text, x, y, z, w, color) {
            const p = panel(w, 0.3, 512, Math.round(512 * 0.3 / w), function (c, pw, ph) {
                c.fillStyle = '#f6ecd6';
                c.fillRect(0, 0, pw, ph);
                c.strokeStyle = '#' + color.toString(16).padStart(6, '0');
                c.lineWidth = 8;
                c.strokeRect(4, 4, pw - 8, ph - 8);
                c.fillStyle = INK;
                c.font = '700 ' + Math.round(ph * 0.46) + 'px ' + SERIF;
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                c.fillText(text, pw / 2, ph / 2 + 2);
            });
            p.mesh.position.set(x, y, z);
            scene.add(p.mesh);
            return p;
        }

        /* ===================== 지하 서고 ===================== */
        const STACK_X = [-3.2, -2.0, -0.8, 0.4, 1.6, 2.8];
        const BOARD_Y = [BY + 0.3, BY + 0.7, BY + 1.1];
        STACK_X.forEach(function (sx) {
            [-0.45, 0.45].forEach(function (dx) {
                slab(0.04, 1.3, 0.5, sx + dx, BY + 0.65, -0.9, darkWoodM, false);
            });
            BOARD_Y.forEach(function (by) {
                slab(0.94, 0.04, 0.5, sx, by, -0.9, darkWoodM, false);
            });
        });
        const BOOKS_PER_BOARD = 6;
        const bookCount = STACK_X.length * BOARD_Y.length * BOOKS_PER_BOARD;
        const bookIm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), bookCount);
        const spine = [0x6b4a3a, 0x3f5d73, 0x7a6a3a, 0x4d6b4a, 0x6e3f52, 0x5a5a6e];
        const m4 = new THREE.Matrix4();
        const qi = new THREE.Quaternion();
        const col = new THREE.Color();
        let seed = 7;
        /**
         * 같은 값이 나오는 간단한 난수를 돌려준다. 책 배치가 열 때마다 같아야 한다.
         */
        function rnd() {
            seed = (seed * 16807) % 2147483647;
            return seed / 2147483647;
        }
        let bi = 0;
        STACK_X.forEach(function (sx) {
            BOARD_Y.forEach(function (by) {
                for (let k = 0; k < BOOKS_PER_BOARD; k++) {
                    const h = 0.2 + rnd() * 0.1;
                    m4.compose(new V(sx - 0.36 + k * 0.145, by + 0.02 + h / 2, -0.9), qi, new V(0.11, h, 0.34));
                    bookIm.setMatrixAt(bi, m4);
                    bookIm.setColorAt(bi, col.setHex(spine[Math.floor(rnd() * spine.length)]));
                    bi++;
                }
            });
        });
        bookIm.instanceMatrix.needsUpdate = true;
        if (bookIm.instanceColor) bookIm.instanceColor.needsUpdate = true;
        scene.add(bookIm);

        const LIFT = { x: 0, z: 0.9, low: BY + 0.03, high: FY + 0.03 };
        const lift = slab(0.55, 0.05, 0.8, LIFT.x, LIFT.low, LIFT.z, woodM, true);
        [-0.32, 0.32].forEach(function (dx) {
            [0.5, 1.3].forEach(function (z) {
                slab(0.04, FY + 0.9 - BY, 0.04, LIFT.x + dx, BY + (FY + 0.9 - BY) / 2, z, darkWoodM, false);
            });
        });

        /* ===================== 열람실: 독자 ===================== */
        const readerPos = new V(-3.1, FY, 0.3);
        slab(1.2, 0.85, 0.5, readerPos.x, FY + 0.425, readerPos.z, woodM, true);
        const reader = person(COLOR.cpu);
        reader.position.set(readerPos.x, FY, readerPos.z - 0.5);
        const TICKET0 = new V(readerPos.x, FY + 1.55, readerPos.z + 0.1);

        /* ===================== 열람실: 사서 책상(TLB) ===================== */
        const deskX = -1.2;
        slab(1.7, 0.76, 0.7, deskX, FY + 0.38, -0.1, woodM, true);
        const librarian = person(COLOR.tlb);
        const LIB_HOME = new V(deskX, FY, -0.75);
        librarian.position.copy(LIB_HOME);
        slab(1.7, 1.05, 0.04, deskX, FY + 1.55, -1.48, darkWoodM, true);
        const NOTE_W = 0.7;
        const NOTE_H = 0.36;
        const notePos = [];
        const notes = [];
        for (let s = 0; s < TLB_SLOTS; s++) {
            const p = panel(NOTE_W, NOTE_H, 256, 132, drawNote.bind(null, null));
            const pos = new V(deskX - 0.4 + (s % 2) * 0.8, FY + 1.77 - Math.floor(s / 2) * 0.46, -1.44);
            p.mesh.position.copy(pos);
            scene.add(p.mesh);
            notePos.push(pos);
            notes.push(p);
        }

        /**
         * 포스트잇 한 장을 그린다. 항목이 없으면 빈 칸이다.
         */
        function drawNote(vpn, c, pw, ph) {
            if (vpn === null) {
                c.setLineDash([10, 8]);
                c.strokeStyle = 'rgba(255,240,200,0.55)';
                c.lineWidth = 4;
                c.strokeRect(8, 8, pw - 16, ph - 16);
                return;
            }
            c.fillStyle = '#fff1a6';
            c.fillRect(0, 0, pw, ph);
            c.strokeStyle = 'rgba(80,60,20,0.5)';
            c.lineWidth = 4;
            c.strokeRect(3, 3, pw - 6, ph - 6);
            c.fillStyle = INK;
            c.textBaseline = 'middle';
            c.textAlign = 'left';
            c.font = '700 40px ' + SERIF;
            c.fillText('VPN ' + vpn, 16, ph / 2 + 2);
            c.textAlign = 'right';
            c.fillStyle = '#' + COLOR.tlb.toString(16).padStart(6, '0');
            c.font = '700 64px ' + HAND;
            c.fillText('→ ' + frameOf(vpn), pw - 16, ph / 2 + 4);
        }

        /**
         * 포스트잇 칸을 지정한 항목으로 채운다.
         */
        function setNote(slot, vpn) {
            notes[slot].redraw(function (c, pw, ph) { drawNote(vpn, c, pw, ph); });
        }

        /* ===================== 열람실: 색인 캐비닛(페이지 테이블) ===================== */
        const cabX = 1.15;
        const cabZ = -0.85;
        slab(1.5, 1.7, 0.7, cabX, FY + 0.85, cabZ, darkWoodM, true);
        const drawers = [];

        /**
         * 서랍 앞판을 그린다. 프레임 번호가 없으면 디스크에 있는 페이지다.
         */
        function drawDrawer(vpn, pfn, c, pw, ph) {
            c.fillStyle = '#d9b27a';
            c.fillRect(0, 0, pw, ph);
            c.strokeStyle = 'rgba(60,40,20,0.7)';
            c.lineWidth = 6;
            c.strokeRect(4, 4, pw - 8, ph - 8);
            c.fillStyle = INK;
            c.textBaseline = 'middle';
            c.textAlign = 'left';
            c.font = '700 30px ' + SERIF;
            c.fillText('VPN ' + vpn, 16, 34);
            c.textAlign = 'center';
            if (pfn === null) {
                c.fillStyle = '#' + COLOR.fault.toString(16).padStart(6, '0');
                c.font = '700 40px ' + SERIF;
                c.fillText(COPY.onDisk, pw / 2, ph * 0.64);
            } else {
                c.fillStyle = '#' + COLOR.pt.toString(16).padStart(6, '0');
                c.font = '700 74px ' + HAND;
                c.fillText('PFN ' + pfn, pw / 2, ph * 0.64);
            }
        }

        PAGES.forEach(function (pg, i) {
            const p = panel(0.66, 0.44, 256, 170, drawDrawer.bind(null, pg.vpn, pg.pfn));
            const home = new V(cabX - 0.37 + (i % 2) * 0.74, FY + 1.37 - Math.floor(i / 2) * 0.52, cabZ + 0.37);
            p.mesh.position.copy(home);
            scene.add(p.mesh);
            drawers.push({ p: p, home: home, pfn: pg.pfn });
        });

        /**
         * 서랍 앞판 내용을 다시 그린다.
         */
        function setDrawer(i, pfn) {
            const d = drawers[i];
            d.pfn = pfn;
            d.p.redraw(drawDrawer.bind(null, i, pfn));
        }

        /* ===================== 열람실: 선반(RAM) ===================== */
        const shelfX = 3.05;
        const shelfZ = -0.9;
        const [shelfC, shelfX2] = canvas2d(512, 512);
        shelfX2.fillStyle = '#e9d9b6';
        shelfX2.fillRect(0, 0, 512, 512);
        shelfX2.strokeStyle = 'rgba(60,40,20,0.35)';
        shelfX2.lineWidth = 3;
        shelfX2.fillStyle = '#8a7a63';
        shelfX2.font = '700 26px ' + SERIF;
        shelfX2.textBaseline = 'top';
        for (let p = 0; p < 16; p++) {
            const cx = (p % 4) * 128;
            const cy = Math.floor(p / 4) * 128;
            shelfX2.strokeRect(cx + 2, cy + 2, 124, 124);
            shelfX2.fillText(String(p), cx + 10, cy + 8);
        }
        const shelfBack = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.68), new THREE.MeshLambertMaterial({ map: texture(shelfC) }));
        shelfBack.position.set(shelfX, FY + 0.95, shelfZ - 0.2);
        scene.add(shelfBack);
        slab(1.8, 0.06, 0.5, shelfX, FY + 0.03, shelfZ, darkWoodM, true);
        slab(1.8, 0.06, 0.5, shelfX, FY + 1.87, shelfZ, darkWoodM, true);
        [-0.87, 0.87].forEach(function (dx) {
            slab(0.06, 1.9, 0.5, shelfX + dx, FY + 0.95, shelfZ, darkWoodM, true);
        });

        /**
         * 프레임 번호 칸의 중심 좌표를 돌려준다. 0번이 왼쪽 위, 3번이 오른쪽 위다.
         */
        function cellPos(pfn) {
            return new V(shelfX - 0.6 + (pfn % 4) * 0.4, FY + 1.58 - Math.floor(pfn / 4) * 0.42, shelfZ - 0.02);
        }

        const BOOK_SHELF = new V(0.26, 0.28, 0.2);
        const shelfBooks = {};
        PAGES.forEach(function (pg) {
            if (pg.pfn === null) return;
            const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), solidM(spine[pg.pfn % spine.length]));
            m.scale.copy(BOOK_SHELF);
            m.position.copy(cellPos(pg.pfn)).add(new V(0, -0.07, 0));
            m.castShadow = true;
            scene.add(m);
            shelfBooks[pg.pfn] = m;
        });

        /* ===================== 옮겨지는 책(디스크의 페이지) ===================== */
        const BOOK_STACK = new V(STACK_X[4] + 0.03, BOARD_Y[1] + 0.02 + 0.13, -0.9);
        const BOOK_STACK_SCALE = new V(0.11, 0.26, 0.34);
        const pageBook = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), solidM(COLOR.fault));
        pageBook.castShadow = true;
        scene.add(pageBook);

        /* ===================== 쪽지 카드 ===================== */
        /**
         * 쪽지 카드 한 장을 그린다.
         */
        function drawTicket(header, value, color, c, pw, ph) {
            c.fillStyle = '#fffdf6';
            c.fillRect(0, 0, pw, ph);
            c.strokeStyle = '#' + color.toString(16).padStart(6, '0');
            c.lineWidth = 10;
            c.strokeRect(5, 5, pw - 10, ph - 10);
            c.fillStyle = '#' + color.toString(16).padStart(6, '0');
            c.font = '700 26px ' + SERIF;
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(header, pw / 2, 34);
            c.fillStyle = INK;
            c.font = '700 ' + (value.length > 6 ? 70 : 92) + 'px ' + HAND;
            c.fillText(value, pw / 2, ph * 0.64);
        }

        /**
         * 쪽지 카드 한 종류를 만든다. 처음에는 숨겨 둔다.
         */
        function ticket(w, h) {
            const t = panel(w, h, 256, 150, drawTicket.bind(null, '', '', COLOR.cpu), true);
            t.mesh.visible = false;
            scene.add(t.mesh);
            t.paint = function (header, value, color) {
                t.redraw(drawTicket.bind(null, header, value, color));
            };
            return t;
        }

        const cards = { addr: ticket(0.78, 0.46), vpn: ticket(0.5, 0.36), off: ticket(0.5, 0.36), pfn: ticket(0.5, 0.36), phys: ticket(0.78, 0.46) };

        /* ===================== 접근 횟수 카드 ===================== */
        let ramN = 0;
        let diskN = 0;

        /**
         * 접근 횟수 카드를 그린다.
         */
        function drawCounter(sub, c, pw, ph) {
            c.fillStyle = '#fbf8f1';
            c.fillRect(0, 0, pw, ph);
            c.strokeStyle = 'rgba(42,38,34,0.5)';
            c.lineWidth = 4;
            c.strokeRect(8, 8, pw - 16, ph - 16);
            c.fillStyle = '#6b6358';
            c.font = '500 26px ' + SERIF;
            c.textAlign = 'left';
            c.textBaseline = 'alphabetic';
            c.fillText(COPY.counterTitle, 28, 56);
            [[COPY.ram, ramN, COLOR.ram, 28], [COPY.disk, diskN, COLOR.fault, 280]].forEach(function (col2) {
                c.fillStyle = '#' + col2[2].toString(16).padStart(6, '0');
                c.font = '700 28px ' + SERIF;
                c.fillText(col2[0], col2[3], 112);
                c.fillStyle = INK;
                c.font = '700 110px ' + HAND;
                c.fillText(String(col2[1]), col2[3], 212);
                c.font = '500 28px ' + SERIF;
                c.fillText(COPY.times, col2[3] + 70, 212);
            });
            c.fillStyle = '#b5532e';
            c.font = '500 24px ' + SERIF;
            c.fillText(sub, 28, 268);
        }

        const counter = panel(1.08, 0.61, 512, 288, drawCounter.bind(null, COPY.subIdle));
        counter.mesh.position.set(readerPos.x, FY + 0.43, readerPos.z + 0.26);
        scene.add(counter.mesh);

        /**
         * 접근 횟수 카드를 새로 그린다.
         */
        function setCounter(sub) {
            counter.redraw(drawCounter.bind(null, sub));
        }

        /* ===================== 안내판 ===================== */
        sign(COPY.reader, readerPos.x, FY + 2.0, -1.47, 1.3, COLOR.cpu);
        sign(COPY.desk, deskX, FY + 2.28, -1.47, 1.6, COLOR.tlb);
        sign(COPY.cabinet, cabX, FY + 2.0, -1.47, 2.0, COLOR.pt);
        sign(COPY.shelf, shelfX, FY + 2.25, -1.47, 1.6, COLOR.ram);
        sign(COPY.stack, 0, BY + 1.3, -1.47, 1.6, COLOR.disk);

        /* ===================== 번쩍임 ===================== */
        const pings = [];
        for (let i = 0; i < 3; i++) {
            const g = glow(0xffffff, 0.6);
            g.material.opacity = 0;
            scene.add(g);
            pings.push(g);
        }
        let pingIdx = 0;

        /**
         * 지정한 위치에 색 번쩍임을 잠깐 띄운다.
         */
        function ping(pos, color, size, ms) {
            const g = pings[pingIdx++ % pings.length];
            g.position.copy(pos);
            g.material.color.setHex(color);
            g.scale.set(size, size, 1);
            return tween(ms / state.speed, function (p) { g.material.opacity = Math.sin(p * Math.PI) * 0.95; });
        }

        /* ===================== 움직임 도구 ===================== */
        /**
         * 시간을 배속에 맞춰 줄인 트윈을 등록한다.
         */
        function tw(ms, fn, ease) {
            return tween(ms / state.speed, fn, ease);
        }

        /**
         * 물체를 목표 위치로 옮긴다.
         */
        function moveTo(o, to, ms, ease) {
            const from = o.position.clone();
            return tw(ms, function (p) { o.position.lerpVectors(from, to, p); }, ease || easeInOut);
        }

        /**
         * 물체를 지나갈 점들을 이은 곡선을 따라 옮긴다.
         */
        function arc(o, pts, ms) {
            const curve = new THREE.CatmullRomCurve3(pts);
            return tw(ms, function (p) { curve.getPoint(p, o.position); }, easeInOut);
        }

        /**
         * 카드를 지정 위치에 크기 0에서 키우며 보여 준다.
         */
        function pop(t, pos, ms) {
            t.mesh.position.copy(pos);
            t.mesh.visible = true;
            t.mat.opacity = 1;
            return tw(ms || 350, function (p) { t.mesh.scale.setScalar(Math.max(0.01, p)); }, easeBack);
        }

        /**
         * 카드를 숨긴다.
         */
        function hide(t) {
            t.mesh.visible = false;
            t.mesh.scale.setScalar(1);
        }

        /**
         * 크기와 위치를 함께 되돌린다.
         */
        function put(m, pos, scale) {
            m.position.copy(pos);
            m.scale.copy(scale);
        }

        const SCALE1 = new V(1, 1, 1);

        /**
         * 건물을 처음 상태로 되돌린다. 단계를 시작할 때마다 부른다.
         */
        function reset(step) {
            eng.clearTweens();
            ramN = 0;
            diskN = 0;
            Object.keys(cards).forEach(function (k) { hide(cards[k]); });
            pings.forEach(function (g) { g.material.opacity = 0; });
            librarian.position.copy(LIB_HOME);
            drawers.forEach(function (d, i) {
                d.p.mesh.position.copy(d.home);
                if (d.pfn !== PAGES[i].pfn) setDrawer(i, PAGES[i].pfn);
            });
            for (let s = 0; s < TLB_SLOTS; s++) setNote(s, TLB_BEFORE[step][s] === undefined ? null : TLB_BEFORE[step][s]);
            lift.position.y = LIFT.low;
            put(pageBook, BOOK_STACK, BOOK_STACK_SCALE);
            setCounter(COPY.subIdle);
            invalidate();
        }

        /* ===================== 장면 진행 ===================== */
        /**
         * 화면 비율에 맞춰 카메라를 뒤로 물린 샷을 적용한다.
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
         * 독자가 쪽지를 내고 쪽지가 VPN과 오프셋으로 갈라진다.
         *
         * @returns 단계가 아직 유효하면 true
         */
        async function request(g, vpn) {
            view('wide');
            say('Request', 'CPU가 가상 주소 ' + hexOf(vpn) + '를 요청. VPN ' + vpn + ' + 오프셋 0x000');
            cards.addr.paint(COPY.virt, hexOf(vpn), COLOR.cpu);
            ping(readerPos.clone().add(new V(0, 1.4, 0.2)), COLOR.cpu, 1.0, 700);
            await pop(cards.addr, TICKET0, 400);
            await wait(500);
            if (!alive(g)) return false;
            hide(cards.addr);
            cards.vpn.paint('VPN', String(vpn), COLOR.cpu);
            cards.off.paint('OFFSET', '+0x000', COLOR.cpu);
            pop(cards.vpn, TICKET0.clone().add(new V(-0.3, 0, 0)), 250);
            await pop(cards.off, TICKET0.clone().add(new V(0.3, 0, 0)), 250);
            return alive(g);
        }

        /**
         * VPN 쪽지가 사서 책상 위 포스트잇을 차례로 훑는다.
         *
         * @returns 맞는 포스트잇 칸 번호. 없으면 -1. 단계가 끝났으면 null
         */
        async function scanBoard(g, vpn) {
            view('desk');
            say('TLB', '사서 책상의 포스트잇(최근 변환 4장)에 VPN ' + vpn + '이 있는지 훑어봅니다');
            const entry = TLB_BEFORE[state.step];
            await arc(cards.vpn.mesh, [cards.vpn.mesh.position.clone(), new V(-2.4, FY + 1.7, 0.2), new V(deskX, FY + 1.77, -0.7)], 900);
            if (!alive(g)) return null;
            let found = -1;
            for (let s = 0; s < TLB_SLOTS; s++) {
                const hitHere = entry[s] === vpn;
                await ping(notePos[s].clone().add(new V(0, 0, 0.1)), hitHere ? COLOR.ram : 0xaaaaaa, 0.7, 260);
                if (!alive(g)) return null;
                if (hitHere) {
                    found = s;
                    break;
                }
            }
            return found;
        }

        /**
         * 변환된 프레임 번호와 오프셋이 합쳐진 물리 주소 쪽지가 선반 칸으로 들어간다.
         *
         * @param from 쪽지가 출발할 위치
         */
        async function toShelf(g, vpn, from) {
            const pfn = frameOf(vpn);
            view('shelf');
            hide(cards.vpn);
            hide(cards.pfn);
            hide(cards.off);
            cards.phys.paint(COPY.phys, hexOf(pfn), COLOR.ram);
            const cell = cellPos(pfn);
            say('Access', 'PFN ' + pfn + ' + 오프셋 = 물리 주소 ' + hexOf(pfn) + '. 선반 ' + pfn + '번 칸에서 책을 꺼냅니다');
            cards.phys.mesh.position.copy(from);
            cards.phys.mesh.visible = true;
            cards.phys.mat.opacity = 1;
            cards.phys.mesh.scale.setScalar(1);
            await arc(cards.phys.mesh, [from.clone(), new V(from.x + 0.8, from.y - 0.1, 0.6), new V(cell.x, cell.y + 0.1, 0.4), new V(cell.x, cell.y, cell.z + 0.35)], 1200);
            if (!alive(g)) return false;
            ping(cell.clone().add(new V(0, 0, 0.2)), COLOR.ram, 0.8, 600);
            const book = shelfBooks[pfn] || pageBook;
            const base = book.scale.clone();
            tw(500, function (p) { book.scale.copy(base).multiplyScalar(1 + 0.25 * Math.sin(p * Math.PI)); });
            ramN++;
            await tw(500, function (p) { cards.phys.mat.opacity = 1 - p; });
            hide(cards.phys);
            return alive(g);
        }

        /**
         * 사서가 색인 캐비닛 앞으로 걸어간다.
         */
        async function walkToCabinet(g) {
            view('cabinet');
            const to = new V(cabX, FY, 0.0);
            const from = librarian.position.clone();
            await tw(1100, function (p) {
                librarian.position.lerpVectors(from, to, p);
                librarian.position.y = FY + Math.abs(Math.sin(p * Math.PI * 4)) * 0.05;
            });
            return alive(g);
        }

        /**
         * 사서가 책상으로 돌아온다.
         */
        async function walkHome(g) {
            view('desk');
            const from = librarian.position.clone();
            await tw(1000, function (p) {
                librarian.position.lerpVectors(from, LIB_HOME, p);
                librarian.position.y = FY + Math.abs(Math.sin(p * Math.PI * 4)) * 0.05;
            });
            return alive(g);
        }

        /**
         * 서랍을 열어 안을 보여 준다.
         */
        async function openDrawer(g, i) {
            const d = drawers[i];
            const to = d.home.clone().add(new V(0, 0, 0.3));
            await moveTo(d.p.mesh, to, 500);
            ping(to.clone().add(new V(0, 0, 0.1)), d.pfn === null ? COLOR.fault : COLOR.pt, 0.9, 700);
            return alive(g);
        }

        /**
         * 서랍을 닫는다.
         */
        function closeDrawer(i) {
            const d = drawers[i];
            return moveTo(d.p.mesh, d.home, 450);
        }

        /**
         * 포스트잇 새 장을 책상 위 칸에 붙인다.
         */
        async function writeNote(g, slot, vpn) {
            setNote(slot, vpn);
            notes[slot].mesh.scale.setScalar(0.01);
            await tw(450, function (p) { notes[slot].mesh.scale.setScalar(Math.max(0.01, p)); }, easeBack);
            ping(notePos[slot].clone().add(new V(0, 0, 0.1)), COLOR.tlb, 0.9, 600);
            return alive(g);
        }

        /**
         * TLB에서 찾았을 때 흐름이다. 포스트잇의 PFN을 읽어 선반으로 간다.
         */
        async function tlbHitFlow(g, vpn, slot, label) {
            cards.pfn.paint('PFN', String(frameOf(vpn)), COLOR.tlb);
            say(label, 'TLB 적중. VPN ' + vpn + ' → PFN ' + frameOf(vpn) + '이 책상 위에 이미 적혀 있습니다');
            await pop(cards.pfn, notePos[slot].clone().add(new V(0, 0.45, 0.55)), 350);
            await wait(400);
            if (!alive(g)) return false;
            return toShelf(g, vpn, notePos[slot].clone().add(new V(0.3, 0.1, 0.6)));
        }

        const FLOW = [
            /* OVERVIEW */
            async function overview() {
                view('overview');
                say('Overview', '독자가 낸 쪽지(가상 주소)가 책상, 색인 캐비닛, 선반(RAM), 지하 서고(디스크)를 거쳐 실제 책이 됩니다');
            },
            /* TLB HIT */
            async function hit(g) {
                const vpn = REQUESTS[1];
                if (!await request(g, vpn)) return;
                const slot = await scanBoard(g, vpn);
                if (slot === null || slot < 0) return;
                if (!await tlbHitFlow(g, vpn, slot, 'TLB hit')) return;
                setCounter(COPY.subHit);
                view('wide');
                say('Result', 'RAM을 ' + ramN + '회만 읽고 끝. 변환이 책상 위에서 끝나서 가장 빠릅니다');
            },
            /* TLB MISS */
            async function miss(g) {
                const vpn = REQUESTS[2];
                if (!await request(g, vpn)) return;
                const slot = await scanBoard(g, vpn);
                if (slot === null) return;
                say('TLB miss', 'TLB 미스. 포스트잇 4장에 VPN ' + vpn + '이 없습니다. 색인 캐비닛(페이지 테이블, RAM)을 찾아갑니다');
                await ping(notePos[1].clone().add(new V(0, 0, 0.1)), COLOR.fault, 1.6, 600);
                if (!alive(g)) return;
                setCounter(COPY.subMiss);
                if (!await walkToCabinet(g)) return;
                const di = vpn;
                if (!await openDrawer(g, di)) return;
                ramN++;
                setCounter(COPY.subMiss);
                say('Page table', '서랍 ' + vpn + '에 PFN ' + frameOf(vpn) + '이 적혀 있습니다. 페이지 테이블도 RAM에 있어 여기서 RAM을 1회 읽었습니다');
                cards.pfn.paint('PFN', String(frameOf(vpn)), COLOR.pt);
                await pop(cards.pfn, drawers[di].home.clone().add(new V(0, 0.45, 0.7)), 350);
                await wait(700);
                if (!alive(g)) return;
                await closeDrawer(di);
                if (!await walkHome(g)) return;
                say('TLB fill', '사서가 새 포스트잇 VPN ' + vpn + ' → PFN ' + frameOf(vpn) + '을 책상에 붙입니다. 다음 요청은 빨라집니다');
                if (!await writeNote(g, 1, vpn)) return;
                if (!await toShelf(g, vpn, cards.pfn.mesh.position.clone())) return;
                setCounter(COPY.subMiss);
                view('wide');
                say('Result', 'RAM을 ' + ramN + '회 읽었습니다. 페이지 테이블 1회 + 데이터 1회. TLB 적중보다 한 번 더 걸립니다');
            },
            /* TLB HIT (재요청) */
            async function hitAgain(g) {
                const vpn = REQUESTS[3];
                if (!await request(g, vpn)) return;
                const slot = await scanBoard(g, vpn);
                if (slot === null || slot < 0) return;
                if (!await tlbHitFlow(g, vpn, slot, 'TLB hit')) return;
                setCounter(COPY.subHit);
                view('wide');
                say('Result', '같은 주소인데 이번에는 RAM ' + ramN + '회로 끝. 방금 붙인 포스트잇 덕분입니다');
            },
            /* PAGE FAULT */
            async function fault(g) {
                const vpn = REQUESTS[4];
                if (!await request(g, vpn)) return;
                const slot = await scanBoard(g, vpn);
                if (slot === null) return;
                say('TLB miss', 'TLB 미스. 포스트잇에 VPN ' + vpn + '이 없습니다. 색인 캐비닛을 찾아갑니다');
                await ping(notePos[1].clone().add(new V(0, 0, 0.1)), COLOR.fault, 1.6, 600);
                if (!alive(g)) return;
                if (!await walkToCabinet(g)) return;
                const di = vpn;
                if (!await openDrawer(g, di)) return;
                ramN++;
                setCounter(COPY.subFault);
                say('Page fault', '서랍 ' + vpn + '에 "서고에 있음"이라고 적혀 있습니다. 이 페이지는 RAM에 없습니다 (페이지 폴트)');
                await wait(1400);
                if (!alive(g)) return;
                await closeDrawer(di);
                say('OS', 'OS가 지하 서고로 내려가 책(페이지)을 찾아 승강기에 실습니다');
                view('stacks');
                await wait(900);
                if (!alive(g)) return;
                ping(pageBook.position.clone().add(new V(0, 0, 0.3)), COLOR.fault, 0.9, 900);
                await moveTo(pageBook, new V(LIFT.x, LIFT.low + 0.03 + 0.13, LIFT.z), 1300);
                if (!alive(g)) return;
                diskN++;
                setCounter(COPY.subFault);
                say('Disk read', '디스크에서 한 번 읽었습니다. RAM보다 훨씬 느린 구간입니다');
                await wait(900);
                if (!alive(g)) return;
                const top = FY + 0.03;
                const bookHigh = new V(LIFT.x, top + 0.03 + 0.13, LIFT.z);
                const bookFrom = pageBook.position.clone();
                view('desk');
                await tw(1600, function (p) {
                    lift.position.y = LIFT.low + (top - LIFT.low) * p;
                    pageBook.position.lerpVectors(bookFrom, bookHigh, p);
                }, easeInOut);
                if (!alive(g)) return;
                view('shelf');
                const cell = cellPos(FAULT_PFN);
                say('Load', '책을 선반의 빈 칸 ' + FAULT_PFN + '번에 꽂고, 서랍과 포스트잇을 새로 고칩니다');
                await arc(pageBook, [bookHigh.clone(), new V(1.5, FY + 0.9, 0.7), new V(cell.x, cell.y + 0.2, 0.4), new V(cell.x, cell.y - 0.07, cell.z)], 1500);
                if (!alive(g)) return;
                tw(400, function (p) { pageBook.scale.lerpVectors(BOOK_STACK_SCALE, BOOK_SHELF, p); });
                ping(cell.clone().add(new V(0, 0, 0.2)), COLOR.ram, 0.9, 700);
                setDrawer(di, FAULT_PFN);
                view('cabinet');
                await ping(drawers[di].home.clone().add(new V(0, 0, 0.1)), COLOR.ram, 0.9, 700);
                if (!alive(g)) return;
                view('desk');
                if (!await writeNote(g, 2, vpn)) return;
                say('Retry', '같은 쪽지를 다시 냅니다. 이제 VPN ' + vpn + ' → PFN ' + FAULT_PFN + '이 적혀 있습니다');
                cards.pfn.paint('PFN', String(FAULT_PFN), COLOR.tlb);
                cards.vpn.paint('VPN', String(vpn), COLOR.cpu);
                if (!await pop(cards.pfn, notePos[2].clone().add(new V(0, 0.45, 0.55)), 350).then(function () { return alive(g); })) return;
                await wait(500);
                if (!alive(g)) return;
                if (!await toShelf(g, vpn, notePos[2].clone().add(new V(0.3, 0.1, 0.6)))) return;
                setCounter(COPY.subFault);
                view('wide');
                say('Result', '디스크 ' + diskN + '회 + RAM ' + ramN + '회. 디스크 접근이 낀 만큼 가장 오래 걸립니다');
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

        /**
         * 월드가 쥔 인스턴스 버퍼를 해제한다.
         */
        function release() {
            bookIm.dispose();
        }

        eng.renderer.shadowMap.autoUpdate = false;
        eng.renderer.shadowMap.needsUpdate = true;
        reset(0);

        return {
            play: play,
            busy: function () { return false; },
            applyTheme: applyTheme,
            release: release
        };
    }

    /* ===================== 3D 컨트롤러 ===================== */
    const v3 = window.CsFlow.viz3d.create({
        title: 'Virtual Memory 3D',
        badges: BADGES,
        canvasLabel: '가상 메모리를 도서관 단면으로 보여 주는 3D 장면. 독자가 낸 쪽지가 사서 책상, 색인 캐비닛, 선반, 지하 서고를 거칩니다. 아래 장면 버튼으로 과정을 따라갑니다.',
        home: { p: SHOTS.overview[0], t: SHOTS.overview[1] },
        load: function () { return kit.loadFonts(fontSample()); },
        createWorld: createWorld
    });

    v3.setSteps(BADGES.map(function (_, i) {
        return function (g) { return v3.state.world.play(i, g); };
    }));
})();