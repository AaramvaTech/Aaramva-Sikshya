import api from '@/lib/api';
import type { ApiResponse, TeacherSection, TeacherTimetable } from '@/types/api.types';

// WEB-P Phase 2 Task 1 — self-scoped teacher timetable endpoints
// (apps/api/src/modules/academic/timetable.controller.ts:40-50, TEACHER_AND_ABOVE).
// Distinct from academic.api.ts's admin-facing getSectionTimetable/getTeacherTimetable
// (which take an id param) — these resolve entirely from the caller's own token.
export const timetableApi = {
  getMySections: () =>
    api.get<ApiResponse<TeacherSection[]>>('/timetable/my/sections'),
  getMyTimetable: () =>
    api.get<ApiResponse<TeacherTimetable>>('/timetable/my'),
};
