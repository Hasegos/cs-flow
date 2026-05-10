/**
 * common.js
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

        // 드로어 외부 클릭 시 닫기
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

                // 버튼 활성화
                tabBtns.forEach(b => b.classList.remove('is-active'));
                btn.classList.add('is-active');

                // 패널 전환
                panels.forEach(function (panel) {
                    panel.classList.remove('is-active');
                });
                const targetPanel = document.getElementById('panel-' + target);
                if (targetPanel) targetPanel.classList.add('is-active');
            });
        });
    }
})();