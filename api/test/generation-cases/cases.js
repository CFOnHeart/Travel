function validGeneratedTrip() {
  return {
    meta: { title: '云南之旅', subtitle: '西双版纳 · 丽江', dateLabel: '7月17日 - 7月25日', emoji: ['🌴', '⛰️'] },
    sections: [
      { type: 'flight', num: 1, title: '去程航班', from: { name: '上海浦东' }, to: { name: '西双版纳' } },
      {
        type: 'destination',
        destination: '西双版纳',
        title: '西双版纳（7/17–7/21）',
        children: [
          { type: 'note', kind: 'arrival', title: '抵达方式', text: '飞抵西双版纳' },
          { type: 'hotel', kind: 'lodging', title: '住宿', name: '温德姆至尊酒店' },
          {
            type: 'timeline',
            kind: 'itinerary',
            title: '行程具体安排',
            items: [{ day: '7/20 周一 · 西双版纳', heading: '植物园', desc: '下午游览', chips: [] }],
          },
        ],
      },
      {
        type: 'destination',
        destination: '丽江',
        title: '丽江（7/21）',
        children: [
          { type: 'note', kind: 'arrival', title: '抵达方式', text: '飞抵丽江' },
          {
            type: 'timeline',
            kind: 'itinerary',
            title: '行程具体安排',
            items: [{ day: '7/21 周二 · 丽江', heading: '玉龙雪山', desc: '白天游览', chips: [] }],
          },
        ],
      },
    ],
    checklist: [
      { group: '交通', items: [{ name: '去程机票', done: false, who: '' }] },
      { group: '租车', items: [{ name: '小鹏G7', done: false, who: '' }] },
      { group: '旅游门票', items: [{ name: '玉龙雪山', done: false, who: '' }] },
      { group: '每天住宿', items: [{ name: '温德姆', done: false, who: '' }] },
    ],
    packing: [{ group: '防晒', items: [{ name: '防晒霜' }] }],
    people: [],
    expenses: [],
    photos: [],
  };
}

function invalidGeneratedTrip() {
  const trip = validGeneratedTrip();
  trip.checklist = [{ group: '交通', items: [{ name: '去程机票', done: false, who: '' }] }];
  return trip;
}

const generationCases = [
  {
    id: 'fast-path',
    text: '7/17 上海飞西双版纳，住温德姆四晚，7/21 飞丽江。',
    fixture: validGeneratedTrip,
    deps: {},
    expect: {
      path: 'fast',
      llmCalls: 1,
      validateCalls: 0,
      repairCalls: 0,
      reviewSkipped: true,
      needsReview: false,
    },
  },
  {
    id: 'repaired-path',
    text: '7/17 上海飞西双版纳，住温德姆四晚，7/21 飞丽江。',
    fixture: invalidGeneratedTrip,
    deps: {
      validateSequence: [
        { ok: false, issues: ['checklist 不完整'] },
        { ok: true, issues: [] },
      ],
      repair: () => validGeneratedTrip(),
    },
    expect: {
      path: 'repaired',
      llmCalls: 4,
      validateCalls: 2,
      repairCalls: 1,
      reviewSkipped: false,
      needsReview: false,
    },
  },
  {
    id: 'best-effort',
    text: '7/17 上海飞西双版纳，住温德姆四晚，7/21 飞丽江。',
    fixture: invalidGeneratedTrip,
    deps: {
      validateError: true,
    },
    expect: {
      path: 'best-effort',
      llmCalls: 2,
      validateCalls: 1,
      repairCalls: 0,
      reviewSkipped: false,
      reviewFailed: true,
      needsReview: true,
    },
  },
];

module.exports = { generationCases, invalidGeneratedTrip, validGeneratedTrip };
