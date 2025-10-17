"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const course_booking_controller_1 = require("../../controllers/teacher/course-booking.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateToken);
router.get('/subscription/remaining-students', course_booking_controller_1.TeacherCourseBookingController.getRemainingStudents);
router.get('/stats/summary', course_booking_controller_1.TeacherCourseBookingController.getBookingStats);
router.get('/', course_booking_controller_1.TeacherCourseBookingController.getMyBookings);
router.get('/:id', course_booking_controller_1.TeacherCourseBookingController.getBookingById);
router.patch('/:id/pre-approve', course_booking_controller_1.TeacherCourseBookingController.preApproveBooking);
router.patch('/:id/confirm', course_booking_controller_1.TeacherCourseBookingController.confirmBooking);
router.patch('/:id/reject', course_booking_controller_1.TeacherCourseBookingController.rejectBooking);
router.patch('/:id/response', course_booking_controller_1.TeacherCourseBookingController.updateTeacherResponse);
router.delete('/:id', course_booking_controller_1.TeacherCourseBookingController.deleteBooking);
router.patch('/:id/reactivate', course_booking_controller_1.TeacherCourseBookingController.reactivateBooking);
exports.default = router;
//# sourceMappingURL=course-booking.routes.js.map