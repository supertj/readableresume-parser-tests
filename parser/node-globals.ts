// pdf.js 3.x legacy build looks for DOMMatrix and Path2D at load time in Node and
// requires the native "canvas" package to provide them. Both are only used when
// rendering pages to a canvas; text extraction never touches them, so empty
// placeholders are enough and keep the runner free of native dependencies.
//
// SPDX-License-Identifier: AGPL-3.0-only
const g = globalThis as any;
g.DOMMatrix ??= class DOMMatrix {};
g.Path2D ??= class Path2D {};
