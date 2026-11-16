/**
 * 홈 "이어서 학습하기" · "처음이신가요?"
 */
(function () {
    'use strict';

    var learning = window.CsFlow && window.CsFlow.learning;
    var storage  = window.CsFlow && window.CsFlow.storage;
    var box      = document.getElementById('continue-learning');
    var welcome  = document.getElementById('first-visit');
    var SEEN_KEY = 'csflow-welcome-seen';

    function subjectName(slug) {
        var cards = document.querySelectorAll('.subject-card');
        for (var i = 0; i < cards.length; i++) {
            var slugEl = cards[i].querySelector('.subject-card__slug');
            var nameEl = cards[i].querySelector('.subject-card__name');
            if (slugEl && nameEl && slugEl.textContent.trim() === slug) return nameEl.textContent.trim();
        }
        return slug;
    }

    /**
     * 마지막으로 보던 토픽을 띄운다.
     *
     * @returns {boolean} 띄웠으면 true, 볼 기록이 없으면 false
     */
    function showContinue() {
        if (!learning || !learning.available || !box) return false;

        var data = learning.read();
        if (!data.last) return false;

        var topicIndex = learning.loadTopicIndex();
        var topic = null;
        for (var i = 0; i < topicIndex.length; i++) {
            if (topicIndex[i].slug === data.last) {
                topic = topicIndex[i];
                break;
            }
        }
        if (!topic) return false;

        var rec      = data.topics[topic.slug];
        var statusEl = document.getElementById('continue-status');

        document.getElementById('continue-link').href = '/' + topic.subjectSlug + '/' + topic.slug;
        document.getElementById('continue-subject').textContent = subjectName(topic.subjectSlug);
        document.getElementById('continue-title').textContent = topic.title;

        if (rec) {
            var done = rec.st === 'done';
            statusEl.textContent = done ? '✓ 완료' : '학습 중';
            statusEl.classList.toggle('hero__continue-status--done', done);
        } else {
            statusEl.hidden = true;
        }

        box.hidden = false;
        return true;
    }

    /** 아직 아무 토픽도 안 본 사람에게 이용 가이드를 알린다. 한 번 닫으면 기억한다. */
    function showWelcome() {
        if (!welcome) return;
        if (storage && storage.get(SEEN_KEY)) return;

        welcome.hidden = false;

        var closeBtn = document.getElementById('first-visit-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function () {
                welcome.hidden = true;
                if (storage) storage.set(SEEN_KEY, '1');
            });
        }
    }

    if (!showContinue()) showWelcome();
})();
