/**
 * 홈 "이어서 학습하기"
 */
(function () {
    'use strict';

    var learning = window.CsFlow && window.CsFlow.learning;
    var box      = document.getElementById('continue-learning');
    if (!learning || !learning.available || !box) return;

    function subjectName(slug) {
        var cards = document.querySelectorAll('.subject-card');
        for (var i = 0; i < cards.length; i++) {
            var slugEl = cards[i].querySelector('.subject-card__slug');
            var nameEl = cards[i].querySelector('.subject-card__name');
            if (slugEl && nameEl && slugEl.textContent.trim() === slug) return nameEl.textContent.trim();
        }
        return slug;
    }

    /* ===================== 마지막 토픽 찾기 ===================== */
    var data = learning.read();
    if (!data.last) return;

    var topicIndex = learning.loadTopicIndex();
    var topic = null;
    for (var i = 0; i < topicIndex.length; i++) {
        if (topicIndex[i].slug === data.last) {
            topic = topicIndex[i];
            break;
        }
    }
    if (!topic) return;

    /* ===================== 표시 ===================== */
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
})();