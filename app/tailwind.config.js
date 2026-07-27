/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './*.html',
    './trip-collections/*.html',
    './js/**/*.js',
  ],
  // Custom CSS (css/styles.css) already defines colors/spacing for existing
  // components — Tailwind is only used for NEW utility-class markup, so we
  // don't touch the default theme here to avoid clashing with it.
  theme: {
    extend: {},
  },
  // Custom classes like .hero / .tool-btn / .main-tab already live in
  // styles.css, so there is no naming overlap with Tailwind's utilities.
  corePlugins: {
    preflight: false, // avoid resetting base element styles already defined in styles.css
  },
  plugins: [],
};
