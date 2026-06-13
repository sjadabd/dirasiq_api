import type { Request, Response } from 'express';

import pool from '../config/database';
import { StudentCourseController } from '../controllers/student/course.controller';
import { CourseModel } from '../models/course.model';
import { StudentService } from '../services/student/student.service';

jest.mock('../config/database', () => ({
  __esModule: true,
  default: {
    query: jest.fn(),
  },
}));

describe('suggested courses regressions', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('returns a successful empty courses envelope when no active grade exists', async () => {
    jest
      .spyOn(StudentService, 'getActiveGrades')
      .mockResolvedValue({ grades: [] });
    const getLocation = jest.spyOn(StudentService, 'getStudentLocation');

    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const req = {
      user: { id: '00000000-0000-0000-0000-000000000001' },
      query: {},
    } as unknown as Request;
    const res = { status } as unknown as Response;

    await StudentCourseController.getSuggestedCourses(req, res);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: { courses: [], count: 0 },
      })
    );
    expect(getLocation).not.toHaveBeenCalled();
  });

  it('clamps the spherical cosine before calling PostgreSQL acos', async () => {
    const query = jest.mocked(pool.query);
    query.mockResolvedValueOnce({ rows: [] } as never);

    await CourseModel.findByGradesAndLocation(
      ['00000000-0000-0000-0000-000000000002'],
      { latitude: 33.3152, longitude: 44.3661 },
      10,
      8,
      0
    );

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('LEAST(');
    expect(sql).toContain('GREATEST(');
    expect(sql.match(/acos\(/g)).toHaveLength(2);
  });
});
