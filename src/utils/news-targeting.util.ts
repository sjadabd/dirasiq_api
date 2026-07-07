import { RecipientType } from '../models/notification.model';
import { NewsType } from '../types';

/** Visible on the public/marketing web and admin-facing web surfaces. */
export const WEB_VISIBLE_NEWS_TYPES: readonly NewsType[] = [
  NewsType.WEB,
  NewsType.WEB_AND_MOBILE,
  NewsType.WEB_AND_TEACHER_MOBILE,
  NewsType.ALL_PLATFORMS,
];

/** Visible in the student Flutter app. */
export const STUDENT_MOBILE_VISIBLE_NEWS_TYPES: readonly NewsType[] = [
  NewsType.MOBILE,
  NewsType.WEB_AND_MOBILE,
  NewsType.ALL_PLATFORMS,
];

/** Visible in the teacher Flutter app home feed. */
export const TEACHER_MOBILE_VISIBLE_NEWS_TYPES: readonly NewsType[] = [
  NewsType.TEACHER_MOBILE,
  NewsType.WEB_AND_TEACHER_MOBILE,
  NewsType.ALL_PLATFORMS,
];

const includesType = (list: readonly NewsType[], newsType: NewsType): boolean =>
  (list as readonly string[]).includes(newsType);

export const isWebNewsType = (newsType: NewsType): boolean =>
  includesType(WEB_VISIBLE_NEWS_TYPES, newsType);

export const isStudentMobileNewsType = (newsType: NewsType): boolean =>
  includesType(STUDENT_MOBILE_VISIBLE_NEWS_TYPES, newsType);

export const isTeacherMobileNewsType = (newsType: NewsType): boolean =>
  includesType(TEACHER_MOBILE_VISIBLE_NEWS_TYPES, newsType);

/**
 * Expand a dashboard filter value into the stored `news_type` rows that match.
 * Broad filters (web / mobile / teacher_mobile) include combo + all-platform types.
 */
export const expandNewsTypeListFilter = (filter: NewsType): NewsType[] => {
  switch (filter) {
    case NewsType.WEB:
      return [...WEB_VISIBLE_NEWS_TYPES];
    case NewsType.MOBILE:
      return [...STUDENT_MOBILE_VISIBLE_NEWS_TYPES];
    case NewsType.TEACHER_MOBILE:
      return [...TEACHER_MOBILE_VISIBLE_NEWS_TYPES];
    case NewsType.WEB_AND_MOBILE:
      return [NewsType.WEB_AND_MOBILE];
    case NewsType.WEB_AND_TEACHER_MOBILE:
      return [NewsType.WEB_AND_TEACHER_MOBILE];
    case NewsType.ALL_PLATFORMS:
      return [NewsType.ALL_PLATFORMS];
    default:
      return [filter];
  }
};

export const recipientTypeForNews = (newsType?: NewsType): RecipientType => {
  switch (newsType) {
    case NewsType.WEB:
    case NewsType.WEB_AND_TEACHER_MOBILE:
    case NewsType.TEACHER_MOBILE:
      return RecipientType.TEACHERS;
    case NewsType.MOBILE:
      return RecipientType.STUDENTS;
    case NewsType.WEB_AND_MOBILE:
    case NewsType.ALL_PLATFORMS:
    default:
      return RecipientType.ALL;
  }
};
