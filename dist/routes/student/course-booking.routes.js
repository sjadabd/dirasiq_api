"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const course_booking_controller_1 = require("../../controllers/student/course-booking.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateToken);
router.post('/', course_booking_controller_1.StudentCourseBookingController.createBooking);
router.get('/', course_booking_controller_1.StudentCourseBookingController.getMyBookings);
router.get('/:id', course_booking_controller_1.StudentCourseBookingController.getBookingById);
router.patch('/:id/cancel', course_booking_controller_1.StudentCourseBookingController.cancelBooking);
router.patch('/:id/reactivate', course_booking_controller_1.StudentCourseBookingController.reactivateBooking);
router.delete('/:id', course_booking_controller_1.StudentCourseBookingController.deleteBooking);
router.get('/stats/summary', course_booking_controller_1.StudentCourseBookingController.getBookingStats);
exports.default = router;
//# sourceMappingURL=course-booking.routes.js.map