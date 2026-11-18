/*! © 2025-2026 CS Flow. All rights reserved. */
(function (global) {
    'use strict';

    /*
     * 면접 대비 계획 일정 계산.
     *
     * 서버, 시계, 난수를 쓰지 않는다. 같은 입력(조건, variant, 오늘 날짜, 질문, 답변 기록)이면
     * 항상 같은 일정을 돌려준다. 일정을 저장하지 않고 볼 때마다 다시 계산하므로 이 성질이 필요하다.
     *
     * 날짜는 'YYYY-MM-DD' 문자열로만 다룬다. Date 를 지역 시간으로 쓰면 시차와 서머타임에서
     * 하루가 어긋나므로, 더하고 빼는 계산은 UTC 정오 기준으로 한다.
     */

    var MOCK_COUNT = 10;
    var WEAK_DAYS_MIN_TOTAL = 5;
    var WEAK_DAYS_RATIO = 0.15;
    var SUBJECT_PER_DAY_MIN = 6;
    var MOCK_WEAK_MIN = 3;
    var WEAK_SUBJECT_RATE = 0.6;
    var WEAK_QUESTION_RATE = 0.5;
    var WEAK_SUBJECT_BOTTOM = 2;
    var MOCK_SALT = 0x51ed270b;
    var MAX_PERIOD_DAYS = 180;
    var MAX_START_AHEAD_DAYS = 30;
    var MAX_VARIANT = 999;
    var MAX_KEYWORDS = 30;
    var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

    var ROLE_WEIGHTS = Object.assign(Object.create(null), {
        BACKEND:  { ds: 15, algo: 10, os: 20, network: 20, db: 25, arch: 10 },
        FRONTEND: { ds: 20, algo: 20, os: 10, network: 30, db: 10, arch: 10 },
        EMBEDDED: { ds: 15, algo: 10, os: 30, network: 10, db: 5,  arch: 30 },
        COMMON:   { ds: 1,  algo: 1,  os: 1,  network: 1,  db: 1,  arch: 1 }
    });

    var DAILY_COUNT = Object.assign(Object.create(null), { 30: 7, 45: 11, 60: 15 });

    /* ===================== 날짜 ===================== */

    /** 'YYYY-MM-DD' 를 UTC 정오 밀리초로 바꾼다. */
    function toMs(date) {
        var p = date.split('-');
        return Date.UTC(+p[0], +p[1] - 1, +p[2], 12);
    }

    /** UTC 밀리초를 'YYYY-MM-DD' 로 바꾼다. */
    function toDate(ms) {
        var d = new Date(ms);
        var m = d.getUTCMonth() + 1;
        var day = d.getUTCDate();
        return d.getUTCFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
    }

    /** 날짜에 일수를 더한다. */
    function plusDays(date, n) {
        return toDate(toMs(date) + n * 86400000);
    }

    /** ISO 요일. 월요일 1 ~ 일요일 7. Java DayOfWeek 와 같은 번호다. */
    function isoDayOfWeek(date) {
        var w = new Date(toMs(date)).getUTCDay();
        return w === 0 ? 7 : w;
    }

    /** 한국 시간 기준 오늘. 기기 시간대와 무관하게 같은 날짜를 돌려준다. */
    function todayKst() {
        var now = new Date();
        return toDate(now.getTime() + 9 * 3600000);
    }

    /* ===================== 섞기 ===================== */

    /*
     * variant 와 질문 ID 로 32비트 해시를 만든다. Math.imul 은 32비트 곱셈이라 넘침이 정확하다.
     * 질문 목록의 순서와 상관없이 같은 결과를 준다.
     */
    function mix(variant, id) {
        var h = Math.imul(variant + 1, 0x9e3779b1) >>> 0;
        for (var i = 0; i < id.length; i++) {
            h = Math.imul(h ^ id.charCodeAt(i), 0x5bd1e995) >>> 0;
            h = (h ^ (h >>> 13)) >>> 0;
        }
        h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
        return (h ^ (h >>> 15)) >>> 0;
    }

    /** variant 로 섞는 비교자. 해시가 같으면 ID 로 가른다. */
    function shuffle(variant) {
        return function (a, b) {
            var d = mix(variant, a.id) - mix(variant, b.id);
            return d !== 0 ? d : cmpStr(a.id, b.id);
        };
    }

    /** 질문 우선순위. 필수 질문, 낮은 난이도, 섞은 순서다. */
    function priority(variant) {
        var sh = shuffle(variant);
        return function (a, b) {
            if (a.core !== b.core) {
                return a.core ? -1 : 1;
            }
            if (a.level !== b.level) {
                return a.level - b.level;
            }
            return sh(a, b);
        };
    }

    function cmpStr(a, b) {
        return a < b ? -1 : (a > b ? 1 : 0);
    }

    /* ===================== 답변 ===================== */

    /** 답변에서 맞힌 수와 전체 수를 꺼낸다. 키워드가 없으면 자기 평가로 대신한다. */
    function hitTotal(answer) {
        if (answer.totalCount > 0) {
            return [answer.hitCount, answer.totalCount];
        }
        if (!answer.selfRating) {
            return null;
        }
        if (answer.selfRating === 'KNOW') return [2, 2];
        if (answer.selfRating === 'UNSURE') return [1, 2];
        if (answer.selfRating === 'DONT') return [0, 2];
        return null;
    }

    /** 답변의 키워드 적중률. 셀 수 없으면 null. */
    function rate(answer) {
        var ht = hitTotal(answer);
        return ht === null ? null : ht[0] / ht[1];
    }

    /**
     * 약한 과목. 최신 답변 기준 적중률이 60% 미만이거나 적중률 하위 2개 과목이다.
     */
    function weakSubjects(latest, byId, weights) {
        var sum = Object.create(null);
        Object.keys(latest).forEach(function (qid) {
            var q = byId[qid];
            var ht = hitTotal(latest[qid]);
            if (!q || ht === null || !(q.subject in weights)) {
                return;
            }
            if (!sum[q.subject]) {
                sum[q.subject] = [0, 0];
            }
            sum[q.subject][0] += ht[0];
            sum[q.subject][1] += ht[1];
        });
        var subjects = Object.keys(sum).filter(function (s) {
            return sum[s][1] > 0;
        });
        subjects.sort(function (a, b) {
            var ra = sum[a][0] / sum[a][1];
            var rb = sum[b][0] / sum[b][1];
            return ra !== rb ? ra - rb : cmpStr(a, b);
        });
        return subjects.filter(function (s, i) {
            return i < WEAK_SUBJECT_BOTTOM || sum[s][0] / sum[s][1] < WEAK_SUBJECT_RATE;
        });
    }

    /* ===================== 배분 ===================== */

    /**
     * 가중치대로 총량을 나눈다. 남는 몫은 소수부가 큰 쪽부터 하나씩 준다(최대 잉여법).
     * 과목마다 상한(caps)이 있어 다 못 받으면 남은 양을 다음 회차에 다시 나눈다.
     */
    function apportion(total, weights, caps) {
        var out = Object.create(null);
        var keys = Object.keys(weights);
        keys.forEach(function (s) {
            out[s] = 0;
        });
        var active = keys.filter(function (s) {
            return weights[s] > 0 && (caps[s] || 0) > 0;
        });
        var remaining = total;
        while (remaining > 0 && active.length > 0) {
            var sum = active.reduce(function (acc, s) {
                return acc + weights[s];
            }, 0);
            var give = [];
            var frac = [];
            var used = 0;
            for (var i = 0; i < active.length; i++) {
                var x = remaining * weights[active[i]];
                give.push(Math.floor(x / sum));
                frac.push(x % sum);
                used += give[i];
            }
            var order = give.map(function (_, i) {
                return i;
            });
            order.sort(function (a, b) {
                return frac[a] !== frac[b] ? frac[b] - frac[a] : a - b;
            });
            for (var k = 0; k < remaining - used; k++) {
                give[order[k]]++;
            }
            for (var j = 0; j < active.length; j++) {
                var s2 = active[j];
                var add = Math.min(give[j], caps[s2] - out[s2]);
                out[s2] += add;
                remaining -= add;
            }
            active = active.filter(function (s) {
                return out[s] < caps[s];
            });
        }
        return out;
    }

    /** 목록을 순서대로 거의 같은 크기의 조각으로 나눈다. 남는 항목은 앞 조각부터 하나씩 더 간다. */
    function split(items, parts) {
        var out = [];
        var base = Math.floor(items.length / parts);
        var extra = items.length % parts;
        var at = 0;
        for (var i = 0; i < parts; i++) {
            var n = base + (i < extra ? 1 : 0);
            out.push(items.slice(at, at + n));
            at += n;
        }
        return out;
    }

    /* ===================== 학습일 묶음 ===================== */

    /**
     * 학습일을 과목 묶음으로 나눈다. 날이 6일 이상이면 하루 한 과목, 짧으면 섞어서 담는다.
     */
    function layoutLearn(dayCount, daily, weights, pool) {
        var blocks = [];
        if (dayCount === 0) {
            return blocks;
        }
        var keys = Object.keys(weights);
        var caps = Object.create(null);
        if (dayCount >= SUBJECT_PER_DAY_MIN) {
            keys.forEach(function (s) {
                caps[s] = Math.ceil(pool[s].length / daily);
            });
            var alloc = apportion(dayCount, weights, caps);
            keys.forEach(function (s) {
                var d = alloc[s] || 0;
                if (d === 0) {
                    return;
                }
                var picked = pool[s].slice(0, Math.min(pool[s].length, d * daily));
                split(picked, d).forEach(function (part) {
                    blocks.push({ subject: s, questions: part });
                });
            });
        } else {
            keys.forEach(function (s) {
                caps[s] = pool[s].length;
            });
            var alloc2 = apportion(dayCount * daily, weights, caps);
            var slots = [];
            keys.forEach(function (s, order) {
                var n = alloc2[s] || 0;
                for (var k = 0; k < n; k++) {
                    slots.push({ pos: (k + 0.5) / n, order: order, question: pool[s][k] });
                }
            });
            slots.sort(function (a, b) {
                return a.pos !== b.pos ? a.pos - b.pos : a.order - b.order;
            });
            var flat = slots.map(function (s) {
                return s.question;
            });
            split(flat, dayCount).forEach(function (part) {
                blocks.push({ subject: null, questions: part });
            });
        }
        while (blocks.length < dayCount) {
            blocks.push({ subject: null, questions: [] });
        }
        return blocks;
    }

    function ids(list) {
        return list.map(function (q) {
            return q.id;
        });
    }

    /**
     * 학습일에 질문을 배정한다. 지난 날 중 답하지 않은 질문은 남은 날로 옮기고,
     * 하루 정원의 1.5배를 넘으면 우선순위가 낮은 것부터 덜어낸다.
     *
     * @return 덜어낸 질문 수
     */
    function layLearnDays(days, learnDates, eff, daily, weights, pool, learned, prio) {
        var blocks = layoutLearn(learnDates.length, daily, weights, pool);
        var future = [];
        var missed = [];
        learnDates.forEach(function (d, i) {
            if (d < eff) {
                blocks[i].questions.forEach(function (q) {
                    if (!learned[q.id]) {
                        missed.push(q);
                    }
                });
            } else {
                future.push(i);
            }
        });
        var lists = blocks.map(function (b) {
            return b.questions.slice();
        });
        var dropped = 0;
        if (future.length === 0) {
            dropped = missed.length;
        } else {
            future.forEach(function (i) {
                lists[i] = lists[i].filter(function (q) {
                    return !learned[q.id];
                });
            });
            var cap = Math.floor(daily * 3 / 2);
            var demand = missed.length + future.reduce(function (acc, i) {
                return acc + lists[i].length;
            }, 0);
            var over = demand - cap * future.length;
            if (over > 0) {
                var all = missed.slice();
                future.forEach(function (i) {
                    all = all.concat(lists[i]);
                });
                all.sort(prio);
                var drop = Object.create(null);
                for (var k = all.length - over; k < all.length; k++) {
                    drop[all[k].id] = true;
                }
                missed = missed.filter(function (q) {
                    return !drop[q.id];
                });
                future.forEach(function (i) {
                    lists[i] = lists[i].filter(function (q) {
                        return !drop[q.id];
                    });
                });
                dropped = over;
            }
            missed.sort(prio);
            missed.forEach(function (q) {
                var target = future[0];
                future.forEach(function (i) {
                    if (lists[i].length < lists[target].length) {
                        target = i;
                    }
                });
                lists[target].push(q);
            });
        }
        learnDates.forEach(function (d, i) {
            days[d] = { date: d, type: 'LEARN', subject: blocks[i].subject, questionIds: ids(lists[i]) };
        });
        return dropped;
    }

    /**
     * 약점 보충일에 질문을 배정한다. 적중률 50% 미만 질문, 그 꼬리 질문,
     * 약한 과목의 아직 안 푼 필수 질문 순서다.
     */
    function layReviewDays(days, reviewDates, eff, daily, weak, latest, byId, pool, prio) {
        var low = [];
        Object.keys(latest).forEach(function (qid) {
            var q = byId[qid];
            var r = rate(latest[qid]);
            if (q && (q.subject in pool) && r !== null && r < WEAK_QUESTION_RATE) {
                low.push(q);
            }
        });
        low.sort(function (a, b) {
            var ra = rate(latest[a.id]);
            var rb = rate(latest[b.id]);
            return ra !== rb ? ra - rb : prio(a, b);
        });
        var picked = [];
        var seen = Object.create(null);
        function add(id) {
            if (!seen[id]) {
                seen[id] = true;
                picked.push(id);
            }
        }
        low.forEach(function (q) {
            add(q.id);
        });
        low.forEach(function (q) {
            (q.followUps || []).forEach(function (f) {
                var fq = byId[f];
                if (fq && (fq.subject in pool)) {
                    add(fq.id);
                }
            });
        });
        weak.forEach(function (s) {
            pool[s].forEach(function (q) {
                if (q.core && !(q.id in latest)) {
                    add(q.id);
                }
            });
        });
        var next = 0;
        reviewDates.forEach(function (d) {
            var part = [];
            if (!(d < eff)) {
                var to = Math.min(picked.length, next + daily);
                part = picked.slice(Math.min(next, to), to);
                next = to;
            }
            days[d] = { date: d, type: 'REVIEW', subject: null, questionIds: part };
        });
    }

    /**
     * 모의면접 질문을 고른다. 약한 과목에서 최소 3개를 먼저 채우고 나머지를 가중치대로 나눈다.
     */
    function pickMock(variant, coreOnly, weights, pool, weak) {
        var salt = (variant ^ MOCK_SALT) >>> 0;
        var sh = shuffle(salt);
        var order = coreOnly
            ? function (a, b) {
                return a.core !== b.core ? (a.core ? -1 : 1) : sh(a, b);
            }
            : sh;
        var sorted = Object.create(null);
        Object.keys(pool).forEach(function (s) {
            sorted[s] = pool[s].slice().sort(order);
        });

        var used = Object.create(null);
        var picked = [];
        var progress = weak.length > 0;
        while (progress && picked.length < MOCK_WEAK_MIN) {
            progress = false;
            for (var i = 0; i < weak.length; i++) {
                var s2 = weak[i];
                var n = used[s2] || 0;
                if (picked.length < MOCK_WEAK_MIN && n < sorted[s2].length) {
                    picked.push(sorted[s2][n]);
                    used[s2] = n + 1;
                    progress = true;
                }
            }
        }

        var caps = Object.create(null);
        Object.keys(sorted).forEach(function (s) {
            caps[s] = sorted[s].length - (used[s] || 0);
        });
        var alloc = apportion(MOCK_COUNT - picked.length, weights, caps);
        Object.keys(alloc).forEach(function (s) {
            var from = used[s] || 0;
            picked = picked.concat(sorted[s].slice(from, from + alloc[s]));
        });
        picked.sort(sh);
        return ids(picked);
    }

    /* ===================== 본체 ===================== */

    /**
     * 일정을 계산한다.
     *
     * @param spec      { startDate, targetDate, role, restDays(ISO 요일 배열), dailyMinutes, variant }
     * @param today     'YYYY-MM-DD'
     * @param questions [{ id, subject, core, level, followUps }]
     * @param answers   [{ questionId, phase, answeredOn, hitCount, totalCount, selfRating }]
     * @return { days, droppedCount, weakSubjects }
     */
    function compute(spec, today, questions, answers) {
        /*
         * 조건은 주소 해시에서 오므로 사용자가 고칠 수 있다. 서버가 막던 상한을 여기서 막는다.
         * 특히 기간을 막지 않으면 날짜 반복이 수백만 번 돌아 탭이 멈춘다.
         */
        if (!DATE_RE.test(today) || !DATE_RE.test(spec.startDate) || !DATE_RE.test(spec.targetDate)) {
            throw new Error('날짜 형식이 올바르지 않습니다.');
        }
        var span = Math.round((toMs(spec.targetDate) - toMs(spec.startDate)) / 86400000);
        if (span <= 0 || span > MAX_PERIOD_DAYS) {
            throw new Error('계획 기간은 1일 이상 ' + MAX_PERIOD_DAYS + '일 이하여야 합니다.');
        }
        var ahead = Math.round((toMs(spec.startDate) - toMs(today)) / 86400000);
        if (ahead > MAX_START_AHEAD_DAYS) {
            throw new Error('시작일은 오늘부터 ' + MAX_START_AHEAD_DAYS + '일 안이어야 합니다.');
        }
        var daily = DAILY_COUNT[spec.dailyMinutes];
        if (!daily) {
            throw new Error('지원하지 않는 학습 시간: ' + spec.dailyMinutes);
        }
        var weights = ROLE_WEIGHTS[spec.role];
        if (!weights) {
            throw new Error('지원하지 않는 직무: ' + spec.role);
        }
        var variant = Number(spec.variant) || 0;
        if (!Number.isInteger(variant) || variant < 0 || variant > MAX_VARIANT) {
            throw new Error('순서 값이 올바르지 않습니다.');
        }
        var prio = priority(variant);

        var byId = Object.create(null);
        var pool = Object.create(null);
        Object.keys(weights).forEach(function (s) {
            pool[s] = [];
        });
        questions.forEach(function (q) {
            if (!q || typeof q.id !== 'string' || !q.id || typeof q.subject !== 'string') {
                return;
            }
            byId[q.id] = {
                id: q.id,
                subject: q.subject,
                core: q.core === true,
                level: Number.isFinite(q.level) ? q.level : 1,
                followUps: Array.isArray(q.followUps) ? q.followUps.filter(function (f) {
                    return typeof f === 'string';
                }) : []
            };
            if (pool[q.subject]) {
                pool[q.subject].push(byId[q.id]);
            }
        });
        Object.keys(pool).forEach(function (s) {
            pool[s].sort(prio);
        });

        var rest = Object.create(null);
        (Array.isArray(spec.restDays) ? spec.restDays : []).forEach(function (w) {
            var n = Number(w);
            if (Number.isInteger(n) && n >= 1 && n <= 7) {
                rest[n] = true;
            }
        });
        var study = [];
        var days = Object.create(null);
        for (var d = spec.startDate; d < spec.targetDate; d = plusDays(d, 1)) {
            var last = plusDays(d, 1) === spec.targetDate;
            if (last || !rest[isoDayOfWeek(d)]) {
                study.push(d);
            } else {
                days[d] = { date: d, type: 'REST', subject: null, questionIds: [] };
            }
        }
        if (study.length === 0) {
            return { days: [], droppedCount: 0, weakSubjects: [] };
        }

        var eff = today < spec.startDate ? spec.startDate : today;
        var history = (Array.isArray(answers) ? answers : []).filter(function (a) {
            if (!a || typeof a.questionId !== 'string' || !DATE_RE.test(a.answeredOn)) {
                return false;
            }
            var hit = Number(a.hitCount) || 0;
            var tot = Number(a.totalCount) || 0;
            if (tot < 0 || hit < 0 || hit > tot || tot > MAX_KEYWORDS) {
                return false;
            }
            return a.answeredOn < today;
        }).map(function (a) {
            return {
                questionId: a.questionId,
                phase: a.phase === 'LEARN' || a.phase === 'REVIEW' || a.phase === 'MOCK' ? a.phase : 'LEARN',
                answeredOn: a.answeredOn,
                hitCount: Number(a.hitCount) || 0,
                totalCount: Number(a.totalCount) || 0,
                selfRating: a.selfRating === 'KNOW' || a.selfRating === 'UNSURE' || a.selfRating === 'DONT'
                    ? a.selfRating : null
            };
        }).sort(function (a, b) {
            return cmpStr(a.answeredOn, b.answeredOn);
        });
        var latest = Object.create(null);
        var learned = Object.create(null);
        history.forEach(function (a) {
            latest[a.questionId] = a;
            if (a.phase === 'LEARN') {
                learned[a.questionId] = true;
            }
        });

        var weak = weakSubjects(latest, byId, weights);
        var total = study.length;
        var weakCount = total >= WEAK_DAYS_MIN_TOTAL ? Math.max(1, Math.floor(total * WEAK_DAYS_RATIO)) : 0;
        var learnCount = total - 1 - weakCount;
        var learnDates = study.slice(0, learnCount);
        var reviewDates = study.slice(learnCount, learnCount + weakCount);
        var mockDate = study[total - 1];

        var dropped = layLearnDays(days, learnDates, eff, daily, weights, pool, learned, prio);
        layReviewDays(days, reviewDates, eff, daily, weak, latest, byId, pool, prio);
        var mock = mockDate < eff ? [] : pickMock(variant, total === 1, weights, pool, weak);
        days[mockDate] = { date: mockDate, type: 'MOCK', subject: null, questionIds: mock };

        var ordered = Object.keys(days).sort(cmpStr).map(function (k) {
            return days[k];
        });
        return { days: ordered, droppedCount: dropped, weakSubjects: weak };
    }

    global.CsFlow = global.CsFlow || {};
    global.CsFlow.PlanEngine = {
        compute: compute,
        dailyCount: function (minutes) {
            var n = DAILY_COUNT[minutes];
            if (!n) {
                throw new Error('지원하지 않는 학습 시간: ' + minutes);
            }
            return n;
        },
        weights: function (role) {
            return ROLE_WEIGHTS[role];
        },
        todayKst: todayKst,
        plusDays: plusDays,
        isoDayOfWeek: isoDayOfWeek,
        apportion: apportion,
        mix: mix
    };
}(typeof globalThis !== 'undefined' ? globalThis : this));
