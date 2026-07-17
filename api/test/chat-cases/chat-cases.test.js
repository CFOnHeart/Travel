const test = require('node:test');
const assert = require('node:assert/strict');

const { __test } = require('../../src/functions/trips.js');
const { executionCases, freshTrip, responseCases } = require('./cases.js');

for (const chatCase of responseCases) {
  test(`${chatCase.category} · ${chatCase.id}: ${chatCase.user}`, () => {
    const result = __test.buildChatResponse(
      freshTrip(),
      [{ role: 'user', content: chatCase.user }],
      chatCase.llm
    );

    if (chatCase.expect.mode === 'tool') {
      assert.ok(result.toolCalls.length > 0, '应返回至少一个待确认工具');
      const call = result.toolCalls[0];
      assert.equal(call.action, chatCase.expect.action);
      assert.equal(call.args.operation, chatCase.expect.operation);
      if (chatCase.expect.itemId) assert.equal(call.args.itemId, chatCase.expect.itemId);
      assert.equal(result.updatedTrip, null, '工具确认前不应直接返回已修改行程');
      return;
    }

    assert.deepEqual(result.toolCalls, [], '非写入聊天不应返回工具');
    assert.equal(result.updatedTrip, null, '非写入聊天不应修改行程');
    assert.equal(result.focus, null, '非写入聊天不应触发数据区域定位');
    for (const text of chatCase.expect.contains || []) assert.match(result.reply, new RegExp(text));
  });
}

for (const executionCase of executionCases) {
  test(`确认后执行工具 · ${executionCase.id}`, () => {
    const trip = freshTrip();
    const result = __test.executeToolCall(trip, executionCase.call);

    assert.ok(result.message, '执行结果应包含用户可读消息');
    assert.ok(result.focus, '执行结果应包含界面定位');
    assert.equal(executionCase.verify(trip), true, '工具执行后的行程数据不符合预期');
  });
}
