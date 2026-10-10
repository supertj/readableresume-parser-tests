// Modified for ReadableResume: upstream src/app/lib/redux/resumeSlice.ts builds a Redux slice
// with @reduxjs/toolkit. The parser only needs these two constants, so they are copied here
// unchanged and the Redux dependency is dropped.
//
// SPDX-License-Identifier: AGPL-3.0-only
import type { FeaturedSkill } from "./types";

export const initialFeaturedSkill: FeaturedSkill = { skill: "", rating: 4 };
export const initialFeaturedSkills: FeaturedSkill[] = Array(6).fill({
  ...initialFeaturedSkill,
});
