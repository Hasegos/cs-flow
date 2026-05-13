/**
 * 공통 JS — 햄버거 메뉴 토글 / 탭 전환
 */
(function () {
    'use strict';
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
        tabBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                const target = btn.dataset.tab;

                tabBtns.forEach(b => b.classList.remove('is-active'));
                btn.classList.add('is-active');

                panels.forEach(function (panel) {
                    panel.classList.remove('is-active');
                });
                const targetPanel = document.getElementById('panel-' + target);
                if (targetPanel) targetPanel.classList.add('is-active');
            });
        });
    }

    /* ===================== 테마 토글 ===================== */
    const themeBtn = document.getElementById('themeToggleBtn');

    (function () {
        const saved = localStorage.getItem('csflow-theme');
        if (saved === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
        }
    })();

    if (themeBtn) {
        themeBtn.addEventListener('click', function () {
            const isLight = document.documentElement.getAttribute('data-theme') === 'light';
            if (isLight) {
                document.documentElement.removeAttribute('data-theme');
                localStorage.setItem('csflow-theme', 'dark');
                themeBtn.setAttribute('aria-label', '라이트 모드로 전환');
            } else {
                document.documentElement.setAttribute('data-theme', 'light');
                localStorage.setItem('csflow-theme', 'light');
                themeBtn.setAttribute('aria-label', '다크 모드로 전환');
            }
            window.dispatchEvent(new CustomEvent('csflow-theme-change'));
        });

        const initTheme = localStorage.getItem('csflow-theme');
        themeBtn.setAttribute('aria-label',
            initTheme === 'light' ? '다크 모드로 전환' : '라이트 모드로 전환'
        );
    }
})();