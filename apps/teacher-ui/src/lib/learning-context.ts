/** Remember the teacher's working context, not student data or unfinished content. */
const key = 'cubecroom:learning-context:v1';
export function readLearningContext(): { classId: string; lessonId: string } | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (value && typeof value === 'object' && 'classId' in value && 'lessonId' in value && typeof value.classId === 'string' && typeof value.lessonId === 'string') return { classId: value.classId, lessonId: value.lessonId };
  } catch { /* Storage is optional; the server still validates scope. */ }
  return null;
}
export function rememberLearningContext(classId: string, lessonId: string) {
  try { localStorage.setItem(key, JSON.stringify({ classId, lessonId })); } catch { /* Keep working when browser storage is unavailable. */ }
}
