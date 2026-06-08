import api from '@/lib/api';
import type {
  ApiResponse,
  PaginatedResponse,
  ClassWithSections,
  Section,
  Subject,
  ClassSubject,
  SectionTimetable,
  TeacherTimetable,
  TimetableSlot,
  TimetableSlotData,
} from '@/types/api.types';

export const academicApi = {
  // Classes
  listClasses: () =>
    api.get<ApiResponse<PaginatedResponse<ClassWithSections>>>('/classes'),
  createClass: (data: { name: string; alias?: string; orderIndex: number }) =>
    api.post<ApiResponse<ClassWithSections>>('/classes', data),
  updateClass: (
    id: string,
    data: Partial<{ name: string; alias: string; orderIndex: number }>,
  ) => api.patch<ApiResponse<ClassWithSections>>(`/classes/${id}`, data),
  deleteClass: (id: string) => api.delete(`/classes/${id}`),

  // Sections
  createSection: (
    classId: string,
    data: { name: string; capacity?: number; classTeacherId?: string },
  ) => api.post<ApiResponse<Section>>(`/classes/${classId}/sections`, data),
  updateSection: (
    classId: string,
    sectionId: string,
    data: Partial<{ name: string; capacity: number; classTeacherId: string }>,
  ) =>
    api.patch<ApiResponse<Section>>(
      `/classes/${classId}/sections/${sectionId}`,
      data,
    ),
  deleteSection: (classId: string, sectionId: string) =>
    api.delete(`/classes/${classId}/sections/${sectionId}`),

  // Subjects  (backend returns paginated { data, meta } inside ApiResponse)
  listSubjects: () =>
    api.get<ApiResponse<{ data: Subject[]; meta: { page: number; limit: number; total: number } }>>(
      '/subjects',
    ),
  createSubject: (data: { name: string; code?: string; type?: string }) =>
    api.post<ApiResponse<Subject>>('/subjects', data),
  updateSubject: (
    id: string,
    data: Partial<{ name: string; code: string; type: string }>,
  ) => api.patch<ApiResponse<Subject>>(`/subjects/${id}`, data),
  deleteSubject: (id: string) => api.delete(`/subjects/${id}`),

  // Class-subject assignments
  assignSubject: (
    classId: string,
    data: {
      subjectId: string;
      academicYearId: string;
      fullMarks?: number;
      passMarks?: number;
    },
  ) => api.post<ApiResponse<ClassSubject>>(`/classes/${classId}/subjects`, data),
  getClassSubjects: (classId: string, params?: { academicYearId?: string }) =>
    api.get<ApiResponse<ClassSubject[]>>(`/classes/${classId}/subjects`, {
      params,
    }),
  removeSubject: (classId: string, subjectId: string) =>
    api.delete(`/classes/${classId}/subjects/${subjectId}`),

  // Timetable
  getSectionTimetable: (sectionId: string) =>
    api.get<ApiResponse<SectionTimetable>>(`/timetable/section/${sectionId}`),
  getTeacherTimetable: (teacherId: string) =>
    api.get<ApiResponse<TeacherTimetable>>(`/timetable/teacher/${teacherId}`),
  createSlot: (data: TimetableSlotData) =>
    api.post<ApiResponse<TimetableSlot>>('/timetable', data),
  deleteSlot: (slotId: string) => api.delete(`/timetable/${slotId}`),
};
