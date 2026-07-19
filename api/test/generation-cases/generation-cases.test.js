const test = require('node:test');
const assert = require('node:assert/strict');

const { __test } = require('../../src/functions/trips.js');
const { generationCases } = require('./cases.js');

const STAGE_IDS = ['parse', 'extract', 'organize', 'review'];

function buildDeps(fixture, caseDeps = {}) {
  let validateCalls = 0;
  let repairCalls = 0;
  const deps = {
    callOpenAI: async () => fixture(),
    validateGeneratedTrip: async () => {
      validateCalls += 1;
      if (caseDeps.validateError) throw new Error('validate unavailable');
      if (Array.isArray(caseDeps.validateSequence)) {
        const index = validateCalls - 1;
        return caseDeps.validateSequence[index] || caseDeps.validateSequence.at(-1);
      }
      return caseDeps.validate || { ok: true, issues: [] };
    },
    repairGeneratedTrip: async () => {
      repairCalls += 1;
      const repaired = caseDeps.repair;
      return typeof repaired === 'function' ? repaired() : repaired;
    },
  };
  return { deps, metrics: () => ({ validateCalls, repairCalls }) };
}

for (const generationCase of generationCases) {
  test(`trip generation · ${generationCase.id}`, async () => {
    const { deps, metrics } = buildDeps(generationCase.fixture, generationCase.deps);
    const result = await __test.generateValidatedTrip(generationCase.text, deps);
    const { validateCalls, repairCalls } = metrics();

    assert.ok(result.trip, '应返回 trip');
    assert.ok(Array.isArray(result.stages), '应返回 generation stages');
    assert.ok(result.generationProfile, '应返回 generation profile');
    assert.equal(result.stages.length, 4, '应有 4 个 generation stage');
    assert.deepEqual(result.stages.map(stage => stage.id), STAGE_IDS);

    for (const stage of result.stages) {
      assert.match(stage.status, /^(done|skipped|failed)$/);
      assert.ok(stage.label, 'stage 应有 label');
    }

    assert.equal(result.generationProfile.path, generationCase.expect.path);
    if (generationCase.expect.llmCalls != null) {
      assert.equal(result.generationProfile.llmCalls, generationCase.expect.llmCalls);
    }
    if (generationCase.expect.llmCallsMin != null) {
      assert.ok(result.generationProfile.llmCalls >= generationCase.expect.llmCallsMin);
    }

    assert.equal(validateCalls, generationCase.expect.validateCalls);
    assert.equal(repairCalls, generationCase.expect.repairCalls);

    const review = result.stages.find(stage => stage.id === 'review');
    assert.equal(review.status === 'skipped', generationCase.expect.reviewSkipped);
    if (generationCase.expect.reviewFailed != null) {
      assert.equal(review.status === 'failed', generationCase.expect.reviewFailed);
    }
    assert.equal(!!result.trip.meta.generationNotes.needsReview, generationCase.expect.needsReview);
  });
}

test('buildGenerationStages fast path marks review as skipped', () => {
  const stages = __test.buildGenerationStages('fast');
  assert.equal(stages.find(stage => stage.id === 'review').status, 'skipped');
  assert.equal(stages.filter(stage => stage.status === 'done').length, 3);
});
