const test = require('node:test');
const assert = require('node:assert/strict');

const { __test } = require('../src/functions/trips.js');

const guard = '\n\n结构定位规则：不要把两段丽江合并。返回完整 updatedTrip，并保留未改字段。';

function sampleTrip() {
  return {
    meta: { title: '云南旅行', dateLabel: '7月17日 - 7月25日' },
    sections: [
      { type: 'flight', from: { name: '上海浦东' }, to: { name: '西双版纳' } },
      { type: 'destination', title: '西双版纳', destination: '西双版纳', children: [] },
      { type: 'destination', title: '丽江', destination: '丽江', children: [
        { type: 'timeline', kind: 'itinerary', title: '行程具体安排', items: [
          { id: 'day-721', day: '7/21 周二', heading: '玉龙雪山 → 丽江古镇', desc: '白天游览玉龙雪山，傍晚逛丽江古镇。', chips: [] }
        ] }
      ] },
      { type: 'destination', title: '泸沽湖', destination: '泸沽湖', children: [] }
    ],
    checklist: [
      { group: '交通', icon: '', items: [{ id: 'booking-flight-home', name: '返程机票', meta: '丽江到上海', done: false, who: '' }] }
    ],
    packing: [
      { group: '车载用品', icon: '', items: [{ id: 'packing-phone-mount', name: '车载手机支架', meta: '自驾导航' }] }
    ],
    people: [],
    expenses: []
  };
}

test('strips client structure guard before intent detection', () => {
  const history = [{ role: 'user', content: `Hi${guard}` }];
  assert.equal(__test.latestUserText(history), 'Hi');
  assert.equal(__test.hasExplicitMutationIntent(__test.latestUserText(history)), false);
});

test('blocks write tools for greeting-only chat', () => {
  const result = __test.buildChatResponse(sampleTrip(), [{ role: 'user', content: `Hi${guard}` }], {
    reply: '我准备删除这个出行物品，请在弹窗中确认。',
    focus: 'packing',
    toolCalls: [{
      action: 'collection.item',
      args: { operation: 'delete', collection: 'packing', itemId: 'packing-phone-mount' }
    }]
  });

  assert.equal(result.updatedTrip, null);
  assert.equal(result.focus, null);
  assert.deepEqual(result.toolCalls, []);
  assert.match(result.reply, /你好/);
});

test('keeps read-only answers without write tools', () => {
  const result = __test.buildChatResponse(sampleTrip(), [{ role: 'user', content: '这次一共花了多少钱？' }], {
    reply: '目前还没有记录花销，所以合计是 0 元。',
    focus: null,
    toolCalls: []
  });

  assert.equal(result.reply, '目前还没有记录花销，所以合计是 0 元。');
  assert.deepEqual(result.toolCalls, []);
});

test('keeps normal non-mutating chat replies from the model', () => {
  const result = __test.buildChatResponse(sampleTrip(), [{ role: 'user', content: '今天心情有点紧张，随便聊聊' }], {
    reply: '当然可以，我们先轻松一点。旅行前紧张很正常，可以先把最担心的事情列出来，一件件看。',
    focus: null,
    toolCalls: []
  });

  assert.equal(result.reply, '当然可以，我们先轻松一点。旅行前紧张很正常，可以先把最担心的事情列出来，一件件看。');
  assert.deepEqual(result.toolCalls, []);
});

test('drops accidental write tools but keeps conversational reply when safe', () => {
  const result = __test.buildChatResponse(sampleTrip(), [{ role: 'user', content: '我们随便聊聊云南吧' }], {
    reply: '云南很适合慢慢玩，版纳偏热带，丽江和泸沽湖更适合看山水和古城节奏。',
    focus: 'packing',
    toolCalls: [{
      action: 'collection.item',
      args: { operation: 'delete', collection: 'packing', itemId: 'packing-phone-mount' }
    }]
  });

  assert.equal(result.reply, '云南很适合慢慢玩，版纳偏热带，丽江和泸沽湖更适合看山水和古城节奏。');
  assert.equal(result.focus, null);
  assert.deepEqual(result.toolCalls, []);
});

test('answers trip places directly from current trip context', () => {
  const result = __test.buildChatResponse(sampleTrip(), [{ role: 'user', content: '这次行程会经过什么地方？' }], {
    reply: '不知道。',
    focus: null,
    toolCalls: []
  });

  assert.equal(result.updatedTrip, null);
  assert.equal(result.focus, null);
  assert.deepEqual(result.toolCalls, []);
  assert.match(result.reply, /上海浦东/);
  assert.match(result.reply, /西双版纳/);
  assert.match(result.reply, /丽江/);
  assert.match(result.reply, /泸沽湖/);
});

test('answers what happens on a requested date from trip context', () => {
  const result = __test.buildChatResponse(sampleTrip(), [{ role: 'user', content: '我们7/21号会干嘛？' }], {
    reply: '我找到了可能要删除的条目，请在弹窗中勾选确认。',
    focus: 'packing',
    toolCalls: [{ action: 'collection.item', args: { operation: 'delete', collection: 'packing', itemId: 'packing-phone-mount' } }]
  });

  assert.match(result.reply, /7\/21/);
  assert.match(result.reply, /丽江/);
  assert.match(result.reply, /玉龙雪山/);
  assert.deepEqual(result.toolCalls, []);
});

test('flags accidental write output for attraction recommendations as read-only retry', () => {
  const history = [{ role: 'user', content: `丽江有什么可以推荐的景点${guard}` }];
  assert.equal(__test.needsReadOnlyRetry(history, {
    reply: '我找到了可能要删除的条目，请在弹窗中勾选确认。',
    toolCalls: [{ action: 'collection.item', args: { operation: 'delete' } }]
  }), true);
  assert.equal(__test.needsReadOnlyRetry(history, {
    reply: '丽江可以考虑玉龙雪山、蓝月谷、丽江古城和束河古镇。',
    toolCalls: []
  }), false);
});

test('builds a readable trip context summary', () => {
  const summary = __test.buildTripContextSummary(sampleTrip());
  assert.match(summary, /标题：云南旅行/);
  assert.match(summary, /会经过\/涉及地点：/);
  assert.match(summary, /未完成预定：交通 \/ 返程机票/);
});

test('attaches user-facing best-effort generation notes instead of exposing validation errors', () => {
  const trip = __test.attachGenerationNotes(
    sampleTrip(),
    '7/21 飞丽江并租车，7/24 返回丽江住宿，7/25 机场还车。',
    { ok: false, issues: ['内部结构检查问题'] },
    true
  );

  assert.equal(trip.meta.generationNotes.needsReview, true);
  assert.match(trip.meta.generationNotes.title, /可编辑版本/);
  assert.match(trip.meta.generationNotes.chatHint, /AI 助手聊天/);
  assert.doesNotMatch(JSON.stringify(trip.meta.generationNotes), /内部结构检查问题/);
});

test('keeps unfinished booking query read-only even if model returns accidental tools', () => {
  const result = __test.buildChatResponse(sampleTrip(), [{ role: 'user', content: '我还有什么预定是没有完成的？' }], {
    reply: '还有 1 个未完成预定：交通 / 返程机票（丽江到上海）。',
    focus: 'booking',
    toolCalls: [{
      action: 'collection.item',
      args: { operation: 'toggle', collection: 'booking', itemId: 'booking-flight-home', done: true }
    }]
  });

  assert.equal(result.reply, '还有 1 个未完成预定：交通 / 返程机票（丽江到上海）。');
  assert.equal(result.updatedTrip, null);
  assert.equal(result.focus, null);
  assert.deepEqual(result.toolCalls, []);
});

test('allows fallback delete only when user explicitly asks to remove data', () => {
  const result = __test.buildChatResponse(sampleTrip(), [{ role: 'user', content: '车载手机支架不用带了' }], {
    reply: '好的。',
    focus: null,
    toolCalls: []
  });

  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].action, 'collection.item');
  assert.equal(result.toolCalls[0].args.operation, 'delete');
  assert.equal(result.toolCalls[0].args.itemId, 'packing-phone-mount');
});

test('allows explicit add tool calls', () => {
  const toolCall = {
    action: 'collection.item',
    args: { operation: 'add', collection: 'packing', group: '防晒', name: '防晒霜', meta: '' }
  };
  const result = __test.buildChatResponse(sampleTrip(), [{ role: 'user', content: '给出行物品加一项防晒霜' }], {
    reply: '我准备添加这个出行物品，请在弹窗中确认，也可以修改分组和说明。',
    focus: null,
    toolCalls: [toolCall]
  });

  assert.deepEqual(result.toolCalls, [toolCall]);
});

test('recognizes natural language itinerary optimization and contextual changes as mutations', () => {
  [
    '帮我优化一下行程，不要排得太赶',
    '把玉龙雪山挪到7月22日',
    '那就按你刚才的建议调整吧',
    '住宿换成束河古镇附近'
  ].forEach(text => assert.equal(__test.hasExplicitMutationIntent(text), true, text));
  assert.equal(__test.hasExplicitMutationIntent('这个行程应该如何优化？'), false);
  assert.equal(__test.hasExplicitMutationIntent('不要修改，先给我建议'), false);
  assert.equal(__test.hasExplicitMutationIntent('先别记录这笔120元晚餐'), false);
  assert.equal(__test.hasExplicitMutationIntent('不要把丽江的酒店预定取消'), false);
  assert.equal(__test.hasExplicitMutationIntent('不用带防晒霜'), true);
});

test('blocks accidental tools for an explicitly negated mutation request', () => {
  const result = __test.buildChatResponse(sampleTrip(), [{ role: 'user', content: '不要修改，先给我建议' }], {
    reply: '我准备删除这个条目，请确认。',
    toolCalls: [{ action: 'collection.item', args: { operation: 'delete', collection: 'packing', itemId: 'packing-phone-mount' } }]
  });

  assert.deepEqual(result.toolCalls, []);
  assert.equal(result.updatedTrip, null);
});

test('does not duplicate packing items when the same confirmed tool is executed twice', () => {
  const trip = sampleTrip();
  const call = {
    action: 'collection.item',
    args: { operation: 'add', collection: 'packing', group: '防晒', name: '防晒霜', meta: 'SPF50' }
  };
  __test.executeToolCall(trip, call);
  const second = __test.executeToolCall(trip, call);
  const matches = trip.packing.flatMap(group => group.items).filter(item => item.name === '防晒霜');

  assert.equal(matches.length, 1);
  assert.match(second.message, /已存在/);
});

test('does not duplicate an identical timeline item', () => {
  const trip = sampleTrip();
  const call = {
    action: 'trip.timelineItem',
    args: {
      operation: 'add',
      destination: '丽江',
      day: '7/22',
      heading: '束河古镇',
      desc: '下午慢慢逛古镇。',
      chips: []
    }
  };
  __test.executeToolCall(trip, call);
  const second = __test.executeToolCall(trip, call);
  const matches = trip.sections
    .flatMap(section => section.children || [])
    .flatMap(child => child.items || [])
    .filter(item => item.heading === '束河古镇');

  assert.equal(matches.length, 1);
  assert.match(second.message, /已存在/);
});

test('does not duplicate an identical expense tool replay', () => {
  const trip = sampleTrip();
  trip.people = [{ id: 'person-jun', name: 'Jun' }];
  const call = {
    action: 'expense.item',
    args: {
      operation: 'add',
      personName: 'Jun',
      amount: 120,
      note: '晚餐',
      time: '2026-07-21T11:00:00.000Z'
    }
  };
  __test.executeToolCall(trip, call);
  const second = __test.executeToolCall(trip, call);
  const matches = trip.expenses.filter(expense => expense.amount === 120 && expense.note === '晚餐');

  assert.equal(matches.length, 1);
  assert.match(second.message, /已存在/);
});

test('requires a stage title when the same destination appears more than once', () => {
  const trip = sampleTrip();
  trip.sections.push({
    id: 'stage-lijiang-return',
    type: 'destination',
    title: '丽江返程前',
    destination: '丽江',
    children: []
  });

  assert.throws(() => __test.executeToolCall(trip, {
    action: 'trip.timelineItem',
    args: { operation: 'add', destination: '丽江', day: '7/24', heading: '逛古镇', desc: '' }
  }), /出现多次/);
});

test('retries a multi-turn read-only recommendation when the model accidentally writes', async () => {
  let calls = 0;
  const result = await __test.processChatLocally(sampleTrip(), [
    { role: 'user', content: '丽江有什么适合轻松逛的地方？' }
  ], async () => {
    calls += 1;
    if (calls === 1) {
      return {
        reply: '我准备删除一项。',
        toolCalls: [{ action: 'collection.item', args: { operation: 'delete', collection: 'packing', itemId: 'packing-phone-mount' } }]
      };
    }
    return { reply: '可以考虑束河古镇和白沙古镇，节奏会比热门景点轻松。', updatedTrip: null, focus: null, toolCalls: [] };
  });

  assert.equal(calls, 2);
  assert.deepEqual(result.toolCalls, []);
  assert.match(result.reply, /束河古镇/);
});

test('uses recent conversation context for a follow-up itinerary mutation', async () => {
  const history = [
    { role: 'user', content: '丽江有什么适合轻松逛的地方？' },
    { role: 'assistant', content: '可以考虑束河古镇。' },
    { role: 'user', content: '那就按刚才推荐的方案加入7/22行程' }
  ];
  const result = await __test.processChatLocally(sampleTrip(), history, async messages => {
    assert.match(messages.map(message => message.content).join('\n'), /束河古镇/);
    return {
      reply: '我准备把束河古镇加入7/22行程，请确认。',
      updatedTrip: null,
      focus: null,
      toolCalls: [{
        action: 'trip.timelineItem',
        args: {
          operation: 'add',
          destination: '丽江',
          day: '7/22',
          heading: '束河古镇',
          desc: '轻松逛古镇。',
          chips: []
        }
      }]
    };
  });

  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].action, 'trip.timelineItem');
});

test('drops unsupported model tools and does not pretend a mutation succeeded', () => {
  const result = __test.buildChatResponse(sampleTrip(), [{ role: 'user', content: '帮我修改行程' }], {
    reply: '已经修改完成。',
    toolCalls: [{ action: 'system.deleteAll', args: { confirmed: true } }]
  });

  assert.deepEqual(result.toolCalls, []);
  assert.match(result.reply, /没有生成足够可靠的修改参数/);
});

test('keeps advisory read-only replies that discuss possible modifications', () => {
  const result = __test.buildChatResponse(sampleTrip(), [{ role: 'user', content: '这个行程有什么优化建议？' }], {
    reply: '建议修改7/21的节奏，把下午留给休息；这只是建议，我没有修改行程。',
    toolCalls: []
  });

  assert.deepEqual(result.toolCalls, []);
  assert.match(result.reply, /建议修改7\/21/);
});

test('converts a hallucinated timeline update into add for an explicit add request', () => {
  const result = __test.buildChatResponse(sampleTrip(), [{ role: 'user', content: '请把翠湖散步加入昆明第一天' }], {
    reply: '我准备加入这项行程，请确认。',
    toolCalls: [{
      action: 'trip.timelineItem',
      args: {
        operation: 'update',
        itemId: 'hallucinated-id',
        destination: '昆明',
        day: '第1天',
        heading: '翠湖散步',
        desc: '轻松散步。',
        chips: []
      }
    }]
  });

  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].args.operation, 'add');
  assert.equal('itemId' in result.toolCalls[0].args, false);
});