export function isUndoRequest(text) {
  return /^(?:请|帮我|麻烦)?(?:撤销|回退|恢复|取消)(?:一下)?(?:刚才|上次|上一轮|前一个)?(?:的)?(?:修改|调整|操作|变更)?[。！!\s]*$/.test(String(text || '').trim());
}

export function canUndoSnapshot(currentTrip, entry) {
  return !!(entry && entry.before && entry.after)
    && JSON.stringify(currentTrip || {}) === JSON.stringify(entry.after);
}
