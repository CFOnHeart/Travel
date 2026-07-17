---
name: ui-skills
description: 'Design and implement polished frontend UI. USE WHEN: "build UI", "improve layout", "redesign", "make it beautiful", "responsive", "dashboard", "component", "CSS polish", "frontend UX", "visual design". Applies product-minded UI craft, accessibility, responsive layout, and verification.'
argument-hint: 'Optional: target page/component and desired visual direction'
---

# UI Skills

Use this skill for frontend interface work: new screens, component polish, layout fixes, responsive behavior, accessibility, and visual design improvements.

## When to Use
- Building or redesigning a page, component, tool, dashboard, editor, or trip view.
- Improving spacing, hierarchy, typography, color, density, empty states, loading states, or interaction states.
- Fixing mobile/desktop layout issues, overflow, overlap, or inconsistent UI behavior.
- Translating a rough request into a usable product experience.

## Procedure
1. Inspect the existing UI surface before editing: relevant HTML, CSS, JS modules, and nearby components.
2. Identify the primary user workflow and make that workflow available on the first screen where practical.
3. Reuse the app's existing design language, selectors, CSS variables, spacing scale, and component patterns before inventing new abstractions.
4. Build complete states for interactive UI: default, hover/focus, active/selected, disabled, loading, empty, and error where relevant.
5. Make layouts responsive with explicit constraints: `minmax()`, `clamp()`, `aspect-ratio`, stable grid tracks, and sensible `min-width: 0` / `overflow-wrap` where text can grow.
6. Keep motion subtle and purposeful. Respect `prefers-reduced-motion` for any animation or transition that can distract or disorient.
7. Check accessibility basics: semantic controls, labels, focus states, keyboard reachability, color contrast, and non-color-only status cues.
8. Verify the final UI in the browser when possible, including at least one desktop and one mobile-sized viewport for visible layout work.

## Travel App Notes
- This repo has static frontend surfaces under `app/` and `云南/`; avoid introducing a frontend build step unless the task clearly needs one.
- Keep shared behavior in existing JS modules and keep CSS close to the current naming/style conventions.
- For visual updates, check both the canonical app surface and any mirrored/static served page that the deployment flow expects.

## Validation Checklist
- [ ] Text does not overflow, clip, or overlap at mobile and desktop sizes.
- [ ] Controls have clear affordance and visible focus states.
- [ ] New UI works with real or representative data, not only ideal sample content.
- [ ] The change does not create horizontal scrolling unless the UI intentionally needs it.
- [ ] `prefers-reduced-motion` is honored when motion is added.
- [ ] Relevant static files pass lightweight syntax checks where available.