// Hardcoded reference lists surfaced by /api/public/subjects and
// /api/public/teaching-stages.
//
// These power the pre-auth dropdowns on the Flutter teacher-application form.
// "Other" is intentionally NOT in this list — the client adds it on the
// dropdown side and POSTs the free-text value via `customTeachingStage` (and
// the equivalent for subject, which the existing schema already permits as
// any VARCHAR(100)).
//
// Why hardcoded:
//   - The set is small and stable.
//   - No DB row exists for a global subject catalog (the `subjects` table is
//     per-teacher).
//   - A migration-managed catalog would be overkill until the curriculum
//     gets routinely versioned.

export const TEACHER_APPLICATION_SUBJECTS: readonly string[] = [
  'الرياضيات',
  'الفيزياء',
  'الكيمياء',
  'الأحياء',
  'اللغة العربية',
  'اللغة الإنجليزية',
  'اللغة الفرنسية',
  'التاريخ',
  'الجغرافيا',
  'التربية الإسلامية',
  'الحاسوب',
  'الاقتصاد',
  'علم الاجتماع',
  'الفلسفة',
  'الفنون',
];

export const TEACHER_APPLICATION_TEACHING_STAGES: readonly string[] = [
  'الابتدائي',
  'المتوسط',
  'الإعدادي',
  'الثانوي',
  'الجامعي',
  'متعدد المراحل',
];
