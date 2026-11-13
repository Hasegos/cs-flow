/**
 * 공통 JS — 공용 헬퍼(저장소·POST·토스트) / 햄버거 메뉴 / 과목 토픽 목차 / 탭 전환 / 테마
 */
(function () {
    'use strict';

    /* ===================== 공용 헬퍼 ===================== */
    window.CsFlow = window.CsFlow || {};

    const storage = {
        available: (function () {
            try {
                localStorage.setItem('__csflow_probe__', '1');
                localStorage.removeItem('__csflow_probe__');
                return true;
            } catch (e) {
                return false;
            }
        })(),
        get: function (key) {
            try { return localStorage.getItem(key); } catch (e) { return null; }
        },
        set: function (key, value) {
            try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
        },
        remove: function (key) {
            try { localStorage.removeItem(key); } catch (e) { }
        },
        getJSON: function (key) {
            const raw = storage.get(key);
            if (raw === null) return null;
            try { return JSON.parse(raw); } catch (e) { return null; }
        },
        setJSON: function (key, value) {
            return storage.set(key, JSON.stringify(value));
        }
    };

    function postJson(url, body) {
        const options = { method: 'POST' };
        if (body !== undefined) {
            options.headers = { 'Content-Type': 'application/json' };
            options.body = JSON.stringify(body);
        }
        return fetch(url, options).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        });
    }

    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'share-toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(function () {
            toast.classList.add('share-toast--visible');
        });

        setTimeout(function () {
            toast.classList.remove('share-toast--visible');
            setTimeout(function () {
                toast.remove();
            }, 300);
        }, 1500);
    }

    window.CsFlow.storage   = storage;
    window.CsFlow.postJson  = postJson;
    window.CsFlow.showToast = showToast;

    /* ===================== 폰트 CSS 적용 ===================== */
    document.querySelectorAll('link[data-async-css]').forEach(function (link) {
        link.media = 'all';
    });

    /* ===================== 과목 토픽 목차 ===================== */
    const navEl = document.querySelector('.side-nav');

    /* 과목 강조색을 루트로 올려 목차 밖에서도 쓰게 한다 */
    if (navEl) {
        const accent = navEl.style.getPropertyValue('--subject-accent');
        if (accent) document.documentElement.style.setProperty('--subject-accent', accent.trim());
    }

    const navToggle = document.getElementById('sideNavToggle');
    const navPanel  = document.getElementById('sideNavPanel');

    /* 토글 버튼은 1140px 미만에서만 보인다 */
    if (navToggle && navPanel) {
        navToggle.addEventListener('click', function () {
            const isOpen = navPanel.classList.toggle('side-nav__panel--open');
            navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });
    }

    /* --- 너비 조절 --- */
    const navResizer = document.getElementById('sideNavResizer');

    if (navResizer) {
        const root = document.documentElement;
        const KEY = 'csflow-nav-width';
        const DEFAULT_W = 300;
        const STEP = 16;

        /**
         * 지금 화면에서 쓸 수 있는 너비 범위를 돌려준다.
         * 화면이 좁으면 본문이 사라지지 않도록 최대값을 더 줄인다.
         *
         * @returns {{min: number, max: number}} 최소 · 최대 너비(px)
         */
        function limits() {
            const cs = getComputedStyle(root);
            const min = parseInt(cs.getPropertyValue('--side-nav-w-min'), 10) || 220;
            const max = parseInt(cs.getPropertyValue('--side-nav-w-max'), 10) || 480;
            return { min: min, max: Math.min(max, Math.round(window.innerWidth * 0.4)) };
        }

        /**
         * 너비를 범위 안으로 맞춰 적용한다.
         *
         * @param px       적용할 너비(px)
         * @param remember true면 브라우저에 기억한다
         * @returns {number} 실제로 적용된 너비(px)
         */
        function apply(px, remember) {
            const lim = limits();
            const w = Math.min(Math.max(Math.round(px), lim.min), lim.max);
            root.style.setProperty('--side-nav-w', w + 'px');
            navResizer.setAttribute('aria-valuenow', String(w));
            if (remember) storage.set(KEY, String(w));
            return w;
        }

        const saved = parseInt(storage.get(KEY), 10);
        if (saved) apply(saved, false);

        const lim0 = limits();
        navResizer.setAttribute('aria-valuemin', String(lim0.min));
        navResizer.setAttribute('aria-valuemax', String(lim0.max));

        navResizer.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            navResizer.setPointerCapture(e.pointerId);
            document.body.classList.add('is-nav-resizing');

            function move(ev) { apply(ev.clientX, false); }

            function up(ev) {
                navResizer.removeEventListener('pointermove', move);
                navResizer.removeEventListener('pointerup', up);
                navResizer.removeEventListener('pointercancel', up);
                document.body.classList.remove('is-nav-resizing');
                apply(ev.clientX, true);
            }

            navResizer.addEventListener('pointermove', move);
            navResizer.addEventListener('pointerup', up);
            navResizer.addEventListener('pointercancel', up);
        });

        /* 더블클릭하면 기본값으로 */
        navResizer.addEventListener('dblclick', function () {
            root.style.removeProperty('--side-nav-w');
            storage.remove(KEY);
            navResizer.setAttribute('aria-valuenow', String(DEFAULT_W));
        });

        /* 좌우 화살표로 16px씩 */
        navResizer.addEventListener('keydown', function (e) {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            const now = parseInt(getComputedStyle(root).getPropertyValue('--side-nav-w'), 10) || DEFAULT_W;
            apply(now + (e.key === 'ArrowRight' ? STEP : -STEP), true);
        });
    }

    const navFilter = document.getElementById('sideNavFilter');
    const navList   = document.getElementById('sideNavList');
    const navEmpty  = document.getElementById('sideNavEmpty');

    if (navFilter && navList) {
        const items = Array.prototype.slice.call(navList.querySelectorAll('.side-nav__item'));
        const titles = items.map(function (item) {
            const text = item.querySelector('.side-nav__text');
            return (text ? text.textContent : '').replace(/\s+/g, '').toLowerCase();
        });

        navFilter.addEventListener('input', function () {
            const needle = navFilter.value.replace(/\s+/g, '').toLowerCase();
            let shown = 0;

            for (let i = 0; i < items.length; i++) {
                const hit = needle === '' || titles[i].indexOf(needle) !== -1;
                items[i].classList.toggle('side-nav__item--hidden', !hit);
                if (hit) shown++;
            }

            if (navEmpty) navEmpty.hidden = shown > 0;
        });
    }

    /* ===================== 햄버거 메뉴 ===================== */
    const hamburger = document.getElementById('hamburgerBtn');
    const drawer    = document.getElementById('gnbDrawer');

    if (hamburger && drawer) {
        hamburger.addEventListener('click', function () {
            const isOpen = drawer.classList.toggle('gnb__drawer--open');
            hamburger.classList.toggle('gnb__hamburger--open', isOpen);
            hamburger.setAttribute('aria-label', isOpen ? '메뉴 닫기' : '메뉴 열기');
        });

        document.addEventListener('click', function (e) {
            if (!hamburger.contains(e.target) && !drawer.contains(e.target)) {
                drawer.classList.remove('gnb__drawer--open');
                hamburger.classList.remove('gnb__hamburger--open');
                hamburger.setAttribute('aria-label', '메뉴 열기');
            }
        });
    }

    /* ===================== 탭 전환 ===================== */
    const tabBtns = document.querySelectorAll('.topic-tabs__btn');
    const panels  = document.querySelectorAll('.topic-panel');

    if (tabBtns.length > 0) {
        const tabList = document.querySelector('.topic-tabs__inner');
        if (tabList) tabList.setAttribute('role', 'tablist');

        /* 탭 버튼이 토픽 템플릿 128개에 흩어져 있어 ARIA 속성은 여기에서 붙인다 */
        tabBtns.forEach(function (btn) {
            const target = btn.dataset.tab;
            btn.setAttribute('role', 'tab');
            btn.id = 'tab-' + target;
            btn.setAttribute('aria-controls', 'panel-' + target);

            const panel = document.getElementById('panel-' + target);
            if (panel) {
                panel.setAttribute('role', 'tabpanel');
                panel.setAttribute('aria-labelledby', btn.id);
                panel.setAttribute('tabindex', '0');
            }
        });

        /** 활성 탭에만 aria-selected 와 tabindex 0 을 둔다. */
        function syncTabState() {
            tabBtns.forEach(function (b) {
                const on = b.classList.contains('is-active');
                b.setAttribute('aria-selected', on ? 'true' : 'false');
                b.setAttribute('tabindex', on ? '0' : '-1');
            });
        }

        /**
         * 탭을 연다. 이미 열려 있으면 아무것도 하지 않는다.
         *
         * @param target 탭 식별자 (data-tab 값)
         * @param opts   scroll 이면 내용 맨 위로, focus 면 탭 버튼에 초점을 준다
         * @returns {boolean} 실제로 바뀌었으면 true
         */
        function activateTab(target, opts) {
            const btn = Array.prototype.find.call(tabBtns, function (b) {
                return b.dataset.tab === target;
            });
            if (!btn || btn.classList.contains('is-active')) return false;

            const activePanel = document.querySelector('.topic-panel.is-active');
            if (activePanel) {
                const c = activePanel.querySelector('canvas');
                if (c) {
                    c.width = 1;
                    c.height = 1;
                    window.dispatchEvent(new CustomEvent('csflow-viz-pause'));
                }
            }

            tabBtns.forEach(b => b.classList.remove('is-active'));
            btn.classList.add('is-active');

            panels.forEach(function (panel) {
                panel.classList.remove('is-active');
            });
            const targetPanel = document.getElementById('panel-' + target);
            if (targetPanel) targetPanel.classList.add('is-active');

            syncTabState();
            if (opts && opts.scroll) scrollToTabTop();
            if (opts && opts.focus) btn.focus();

            if (target === 'visualizer') {
                window.dispatchEvent(new CustomEvent('csflow-viz-resume'));
            }
            return true;
        }

        tabBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                const target = btn.dataset.tab;
                if (activateTab(target, { scroll: true }) && window.history.pushState) {
                    window.history.pushState({ tab: target }, '', '#' + target);
                }
            });
        });

        /* 좌우 화살표로 탭 이동 */
        tabBtns.forEach(function (btn, i) {
            btn.addEventListener('keydown', function (e) {
                let next = null;
                if (e.key === 'ArrowRight') next = tabBtns[(i + 1) % tabBtns.length];
                else if (e.key === 'ArrowLeft') next = tabBtns[(i - 1 + tabBtns.length) % tabBtns.length];
                else if (e.key === 'Home') next = tabBtns[0];
                else if (e.key === 'End') next = tabBtns[tabBtns.length - 1];
                if (!next) return;
                e.preventDefault();
                activateTab(next.dataset.tab, { scroll: false, focus: true });
                if (window.history.replaceState) {
                    window.history.replaceState({ tab: next.dataset.tab }, '', '#' + next.dataset.tab);
                }
            });
        });

        window.addEventListener('popstate', function () {
            const target = window.location.hash.replace('#', '');
            if (target) activateTab(target, { scroll: false });
        });

        syncTabState();

        /* 주소에 탭이 있으면 그 탭으로 */
        const initial = window.location.hash.replace('#', '');
        if (initial) activateTab(initial, { scroll: false });
    }

    /**
     * 탭을 바꾼 뒤 새 내용이 맨 위부터 보이게 스크롤한다.
     * 탭 막대는 헤더 아래에 붙어 있으므로, 막대가 원래 놓인 자리(히어로 바로 아래)까지만 올린다.
     * 이미 그 위에 있으면 움직이지 않는다.
     */
    function scrollToTabTop() {
        const tabs = document.querySelector('.topic-tabs');
        const above = tabs && tabs.previousElementSibling;
        if (!above) return;
        const stuckTop = parseFloat(getComputedStyle(tabs).top) || 0;
        const natural = above.getBoundingClientRect().bottom + window.scrollY - stuckTop;
        if (window.scrollY > natural) window.scrollTo(0, Math.max(0, natural));
    }

    /* ===================== 다음 단계 버튼 ===================== */
    if (tabBtns.length > 1) {
        const nextTopicMeta = document.querySelector('meta[name="csflow-next-topic"]');

        tabBtns.forEach(function (btn, i) {
            const panel = document.getElementById('panel-' + btn.dataset.tab);
            if (!panel) return;

            const nextBtn = tabBtns[i + 1];
            const bar = document.createElement('div');
            bar.className = 'topic-next';

            const link = document.createElement(nextBtn ? 'button' : 'a');
            link.className = 'topic-next__btn';
            if (nextBtn) {
                link.type = 'button';
                link.textContent = '다음: ' + nextBtn.textContent.trim() + ' \u2192';
                link.addEventListener('click', function () {
                    nextBtn.click();
                });
            } else if (nextTopicMeta) {
                link.href = nextTopicMeta.content;
                link.textContent = '다음 토픽: ' + nextTopicMeta.dataset.title + ' \u2192';
            } else {
                return;
            }
            bar.appendChild(link);
            panel.appendChild(bar);
        });
    }

    /* ===================== 테마 토글 ===================== */
    const themeBtn = document.getElementById('themeToggleBtn');

    /* 고른 적이 없으면 운영체제 설정을 따른다 */
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)');
    const savedTheme = storage.get('csflow-theme');

    if (savedTheme === 'light' || (savedTheme === null && prefersLight && prefersLight.matches)) {
        document.documentElement.setAttribute('data-theme', 'light');
    }

    /* 직접 고르기 전까지는 운영체제 설정 변경을 따라간다 */
    if (savedTheme === null && prefersLight && prefersLight.addEventListener) {
        prefersLight.addEventListener('change', function (e) {
            if (storage.get('csflow-theme') !== null) return;
            if (e.matches) document.documentElement.setAttribute('data-theme', 'light');
            else document.documentElement.removeAttribute('data-theme');
            window.dispatchEvent(new CustomEvent('csflow-theme-change'));
        });
    }

    if (themeBtn) {
        themeBtn.addEventListener('click', function () {
            const isLight = document.documentElement.getAttribute('data-theme') === 'light';
            if (isLight) {
                document.documentElement.removeAttribute('data-theme');
                storage.set('csflow-theme', 'dark');
                themeBtn.setAttribute('aria-label', '라이트 모드로 전환');
            } else {
                document.documentElement.setAttribute('data-theme', 'light');
                storage.set('csflow-theme', 'light');
                themeBtn.setAttribute('aria-label', '다크 모드로 전환');
            }
            window.dispatchEvent(new CustomEvent('csflow-theme-change'));
        });

        themeBtn.setAttribute('aria-label',
            document.documentElement.getAttribute('data-theme') === 'light' ? '다크 모드로 전환' : '라이트 모드로 전환'
        );
    }
    /* ===================== 키보드 단축키 ===================== */
    function isTyping(el) {
        if (!el) return false;
        const tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    }

    /**
     * 이 화면에서 '/' 로 갈 검색 칸을 고른다. 과목 검색 칸이 있으면 그쪽을 먼저 쓴다.
     *
     * @returns {HTMLElement|null} 검색 칸, 없으면 null
     */
    function findSearchInput() {
        return document.querySelector('.topic-filter__input')
            || document.getElementById('sideNavFilter')
            || null;
    }

    document.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        if (e.key === '/' && !isTyping(e.target)) {
            const input = findSearchInput();
            if (!input) return;
            e.preventDefault();
            const panel = document.getElementById('sideNavPanel');
            const toggle = document.getElementById('sideNavToggle');
            if (input.id === 'sideNavFilter' && panel && !panel.classList.contains('side-nav__panel--open')
                && toggle && getComputedStyle(toggle).display !== 'none') {
                toggle.click();
            }
            input.focus();
            input.select();
            return;
        }

        if (e.key === 'Escape' && isTyping(e.target) && e.target.type === 'search') {
            e.target.value = '';
            e.target.dispatchEvent(new Event('input', { bubbles: true }));
            e.target.blur();
        }
    });

    /* ===================== 읽기 진행 바 ===================== */
    if (document.querySelector('.topic-content')) {
        const readBar = document.createElement('div');
        readBar.className = 'reading-progress';
        readBar.setAttribute('aria-hidden', 'true');

        const readFill = document.createElement('span');
        readFill.className = 'reading-progress__fill';
        readBar.appendChild(readFill);
        document.body.appendChild(readBar);

        let ticking = false;
        function updateReadBar() {
            const max = document.documentElement.scrollHeight - window.innerHeight;
            const pct = max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0;
            readFill.style.width = pct + '%';
            ticking = false;
        }

        window.addEventListener('scroll', function () {
            if (ticking) return;
            ticking = true;
            window.requestAnimationFrame(updateReadBar);
        }, { passive: true });

        window.addEventListener('resize', updateReadBar, { passive: true });
        updateReadBar();
    }
})();
