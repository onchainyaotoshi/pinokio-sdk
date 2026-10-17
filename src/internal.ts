/**
 * Transport handle attached to a client. Registered on the global symbol
 * registry so dist/index.js and dist/raw.js observe the same symbol — the two
 * entry points are bundled separately (splitting: false).
 */
export const TRANSPORT = Symbol.for("@yaotoshi/pinokio-sdk/transport");
