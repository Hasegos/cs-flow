/**
 * 토픽 공유 버튼 — 링크 복사 / 카카오톡 공유.
 */
(function () {
    'use strict';

    function getMetaContent(selector) {
        var el = document.querySelector(selector);
        return el ? el.content : '';
    }

    function showToast(message) {
        var toast = document.createElement('div');
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

    function initCopyButton() {
        var btn = document.querySelector('.topic-share__btn--copy');
        if (!btn) return;

        btn.addEventListener('click', function () {
            var url = window.location.href;

            var onCopied = function () {
                btn.classList.add('topic-share__btn--copied');
                setTimeout(function () {
                    btn.classList.remove('topic-share__btn--copied');
                }, 1500);
                showToast('링크가 복사되었습니다');
            };

            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(url).then(onCopied);
                return;
            }

            var textarea = document.createElement('textarea');
            textarea.value = url;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            onCopied();
        });
    }

    function initKakaoButton() {
        var btn = document.querySelector('.topic-share__btn--kakao');
        if (!btn || !window.Kakao) return;

        if (!window.Kakao.isInitialized()) {
            var keyMeta = document.querySelector('meta[name="kakao-js-key"]');
            var jsKey = keyMeta ? keyMeta.content : '';
            if (!jsKey) return;
            window.Kakao.init(jsKey);
        }

        btn.addEventListener('click', function () {
            if (!window.Kakao.isInitialized()) return;

            window.Kakao.Share.sendDefault({
                objectType: 'feed',
                content: {
                    title: getMetaContent('meta[property="og:title"]'),
                    description: getMetaContent('meta[property="og:description"]'),
                    imageUrl: getMetaContent('meta[property="og:image"]'),
                    link: {
                        mobileWebUrl: window.location.href,
                        webUrl: window.location.href
                    }
                }
            });
        });
    }

    initCopyButton();
    initKakaoButton();
})();