---
name: gsap-skills
description: 'Use GSAP for production-quality web animation. USE WHEN: "GSAP", "ScrollTrigger", "timeline", "animation", "animate UI", "scroll animation", "motion design", "stagger", "parallax", "entrance animation". Covers setup, timelines, cleanup, performance, accessibility, and verification.'
argument-hint: 'Optional: target element/scene and animation goal'
---

# GSAP Skills

Use this skill when a UI change needs coordinated animation that is easier, safer, or more maintainable with GSAP than with CSS transitions alone.

## When to Use
- Sequenced entrance animations, timelines, staggered lists, route/page transitions, or timeline-controlled UI.
- Scroll-linked effects with `ScrollTrigger`, pinning, scrubbed progress, or viewport-triggered reveals.
- Interactive animation that needs pause, reverse, replay, progress control, or cleanup.

## Procedure
1. Confirm GSAP is warranted. Use CSS transitions/keyframes for simple hover states or one-off fades.
2. Check whether the project already imports GSAP. Reuse the existing loading pattern before adding a new dependency path.
3. For this static frontend, prefer ESM imports if no bundler exists:
   ```js
   import { gsap } from 'https://esm.sh/gsap@3.13.0';
   import { ScrollTrigger } from 'https://esm.sh/gsap@3.13.0/ScrollTrigger';
   gsap.registerPlugin(ScrollTrigger);
   ```
4. Scope selectors to the feature root so animations do not accidentally target repeated or future UI elsewhere.
5. Use timelines for multi-step motion. Keep durations short, easing consistent, and delays rare.
6. Animate compositor-friendly properties first: `transform`, `opacity`, and CSS variables that do not force expensive layout.
7. Avoid animating layout-heavy properties such as `top`, `left`, `width`, `height`, or large shadows unless the visual result truly requires it.
8. Respect reduced motion:
   ```js
   const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
   if (reduceMotion) return;
   ```
9. Clean up after animations on rerender, navigation, modal close, or teardown. Kill timelines and `ScrollTrigger` instances created by the feature.
10. Verify animation in the browser, including initial load, resize, reduced-motion mode where practical, and repeated open/close or navigation cycles.

## Patterns
- Use `gsap.context()` when working inside component-like code or a feature root, then call `context.revert()` during cleanup.
- Use `ScrollTrigger.refresh()` after images, dynamic content, or layout-affecting data loads.
- Prefer `autoAlpha` when visibility and opacity should move together.
- Use `will-change` sparingly and remove it after long-running setup animations when possible.

## Validation Checklist
- [ ] Animation is skipped or simplified for `prefers-reduced-motion: reduce`.
- [ ] No selectors leak outside the intended feature root.
- [ ] Timelines and scroll triggers are cleaned up when the UI is removed or rebuilt.
- [ ] Motion does not block interaction, hide essential content, or cause layout shift.
- [ ] Performance remains smooth on a mid-range mobile viewport.