export function generationNotesSignature(notes) {
  if (!notes || typeof notes !== 'object') return '';
  return JSON.stringify({
    title: notes.title || '',
    summary: notes.summary || '',
    corrections: notes.corrections || [],
    assumptions: notes.assumptions || [],
    missingInfo: notes.missingInfo || [],
    warnings: notes.warnings || [],
    needsReview: !!notes.needsReview
  });
}

export function resolveGenerationNotesMode(savedState, notes) {
  const signature = generationNotesSignature(notes);
  if (!signature) return { mode: 'hidden', signature: '' };
  if (!savedState || savedState.signature !== signature) return { mode: 'expanded', signature };
  return {
    mode: ['expanded', 'collapsed', 'dismissed'].includes(savedState.mode) ? savedState.mode : 'expanded',
    signature
  };
}
