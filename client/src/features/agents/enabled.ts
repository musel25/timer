// The Claude Code dashboard is a local tool. It's enabled in dev, or in a build
// explicitly flagged for the local always-on service (VITE_CC_DASH=1). The real
// production deploy (plain `vite build`) leaves it OFF.
export const CC_DASH_ENABLED = import.meta.env.DEV || import.meta.env.VITE_CC_DASH === '1';
