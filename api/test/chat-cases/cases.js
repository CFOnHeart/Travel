const baseTrip = {
  meta: { title: '云南旅行', dateLabel: '7月17日 - 7月25日' },
  sections: [
    { type: 'flight', from: { name: '上海浦东' }, to: { name: '西双版纳' } },
    {
      id: 'stage-lijiang', type: 'destination', title: '丽江', destination: '丽江', children: [
        {
          id: 'timeline-lijiang', type: 'timeline', kind: 'itinerary', title: '行程具体安排', items: [
            { id: 'day-721', day: '7/21 周二', heading: '玉龙雪山 → 丽江古镇', desc: '白天玉龙雪山，傍晚逛丽江古镇。', chips: [] }
          ]
        },
        { id: 'hotel-lijiang', type: 'hotel', kind: 'lodging', title: '住宿', name: '丽江古镇客栈', price: 300 }
      ]
    },
    { id: 'stage-luguhu', type: 'destination', title: '泸沽湖', destination: '泸沽湖', children: [] }
  ],
  checklist: [
    {
      group: '交通', icon: '✈️', items: [
        { id: 'booking-outbound', name: '去程机票', meta: '上海到西双版纳', done: true, who: 'Jun' },
        { id: 'booking-return', name: '返程机票', meta: '丽江到上海', done: false, who: '' }
      ]
    }
  ],
  packing: [
    { group: '车载用品', icon: '🚗', items: [{ id: 'packing-holder', name: '车载手机支架', meta: '自驾导航' }] }
  ],
  people: [{ id: 'person-jun', name: 'Jun' }],
  expenses: [{ id: 'expense-lunch', personId: 'person-jun', amount: 80, note: '午餐', time: '2026-07-21T04:00:00.000Z' }],
  photos: []
};

const responseCases = [
  {
    id: 'write-add-packing',
    category: '写工具：新增',
    user: '给出行物品加一项防晒霜',
    llm: {
      reply: '我准备添加防晒霜，请确认。',
      toolCalls: [{ action: 'collection.item', args: { operation: 'add', collection: 'packing', group: '防晒', name: '防晒霜', meta: '户外防晒' } }]
    },
    expect: { mode: 'tool', action: 'collection.item', operation: 'add' }
  },
  {
    id: 'write-update-booking',
    category: '写工具：修改',
    user: '把返程机票说明改成7月25日丽江飞上海',
    llm: {
      reply: '我准备更新返程机票，请确认。',
      toolCalls: [{ action: 'collection.item', args: { operation: 'update', collection: 'booking', itemId: 'booking-return', name: '返程机票', meta: '7月25日丽江飞上海' } }]
    },
    expect: { mode: 'tool', action: 'collection.item', operation: 'update' }
  },
  {
    id: 'write-delete-packing',
    category: '写工具：删除',
    user: '车载手机支架不用带了',
    llm: { reply: '好的。', toolCalls: [] },
    expect: { mode: 'tool', action: 'collection.item', operation: 'delete', itemId: 'packing-holder' }
  },
  {
    id: 'write-add-expense',
    category: '写工具：新增花销',
    user: '记录一笔Jun付的120元晚餐',
    llm: {
      reply: '我准备记录这笔花销，请确认。',
      toolCalls: [{ action: 'expense.item', args: { operation: 'add', personName: 'Jun', amount: 120, note: '晚餐', time: '2026-07-21T11:00:00.000Z' } }]
    },
    expect: { mode: 'tool', action: 'expense.item', operation: 'add' }
  },
  {
    id: 'read-date-itinerary',
    category: '只读上下文：日期行程',
    user: '我们7/21号会干嘛？',
    llm: { reply: '不知道。', toolCalls: [] },
    expect: { mode: 'read', contains: ['7/21', '丽江', '玉龙雪山'] }
  },
  {
    id: 'read-pending-bookings',
    category: '只读上下文：未完成预定',
    user: '我还有什么预定没有完成？',
    llm: { reply: '不知道。', toolCalls: [] },
    expect: { mode: 'read', contains: ['返程机票'] }
  },
  {
    id: 'read-places',
    category: '只读上下文：经过地点',
    user: '这次行程会经过什么地方？',
    llm: { reply: '不知道。', toolCalls: [] },
    expect: { mode: 'read', contains: ['上海浦东', '西双版纳', '丽江', '泸沽湖'] }
  },
  {
    id: 'read-expense-total',
    category: '只读上下文：花销统计',
    user: '这次一共花了多少钱？',
    llm: { reply: '不知道。', toolCalls: [] },
    expect: { mode: 'read', contains: ['80'] }
  },
  {
    id: 'normal-chat',
    category: '普通聊天',
    user: '旅行前有点紧张，陪我聊聊',
    llm: { reply: '当然可以。旅行前紧张很正常，我们可以从最担心的事情开始聊。', toolCalls: [] },
    expect: { mode: 'chat', contains: ['旅行前紧张很正常'] }
  },
  {
    id: 'normal-recommendation',
    category: '普通聊天：开放推荐',
    user: '丽江有什么可以推荐的景点？',
    llm: { reply: '丽江可以考虑玉龙雪山、蓝月谷、束河古镇和白沙古镇。', toolCalls: [] },
    expect: { mode: 'chat', contains: ['玉龙雪山', '蓝月谷'], noTools: true }
  },
  {
    id: 'guard-accidental-delete',
    category: '安全门禁：阻止误删除',
    user: 'Hi',
    llm: {
      reply: '我找到了可能要删除的条目，请确认。',
      toolCalls: [{ action: 'collection.item', args: { operation: 'delete', collection: 'packing', itemId: 'packing-holder' } }]
    },
    expect: { mode: 'read', contains: ['你好'], noTools: true }
  }
];

const executionCases = [
  {
    id: 'execute-packing-add',
    call: { action: 'collection.item', args: { operation: 'add', collection: 'packing', group: '防晒', name: '防晒霜', meta: 'SPF50' } },
    verify(trip) {
      return trip.packing.some(group => group.group === '防晒' && group.items.some(item => item.name === '防晒霜' && item.meta === 'SPF50'));
    }
  },
  {
    id: 'execute-booking-update',
    call: { action: 'collection.item', args: { operation: 'update', collection: 'booking', itemId: 'booking-return', name: '返程机票', meta: '7月25日丽江飞上海', done: true, who: 'Jun' } },
    verify(trip) {
      const item = trip.checklist.flatMap(group => group.items).find(entry => entry.id === 'booking-return');
      return item && item.meta === '7月25日丽江飞上海' && item.done === true && item.who === 'Jun';
    }
  },
  {
    id: 'execute-packing-delete',
    call: { action: 'collection.item', args: { operation: 'delete', collection: 'packing', itemId: 'packing-holder' } },
    verify(trip) {
      return !trip.packing.flatMap(group => group.items).some(item => item.id === 'packing-holder');
    }
  },
  {
    id: 'execute-expense-add',
    call: { action: 'expense.item', args: { operation: 'add', personName: 'Jun', amount: 120, note: '晚餐', time: '2026-07-21T11:00:00.000Z' } },
    verify(trip) {
      return trip.expenses.some(item => item.amount === 120 && item.note === '晚餐' && item.personId === 'person-jun');
    }
  },
  {
    id: 'execute-expense-update',
    call: { action: 'expense.item', args: { operation: 'update', expenseId: 'expense-lunch', amount: 95, note: '午餐和饮料' } },
    verify(trip) {
      const item = trip.expenses.find(entry => entry.id === 'expense-lunch');
      return item && item.amount === 95 && item.note === '午餐和饮料';
    }
  },
  {
    id: 'execute-expense-delete',
    call: { action: 'expense.item', args: { operation: 'delete', expenseId: 'expense-lunch' } },
    verify(trip) {
      return !trip.expenses.some(item => item.id === 'expense-lunch');
    }
  }
];

function freshTrip() {
  return JSON.parse(JSON.stringify(baseTrip));
}

module.exports = { executionCases, freshTrip, responseCases };
