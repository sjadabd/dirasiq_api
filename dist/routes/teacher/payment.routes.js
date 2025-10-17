"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const payment_controller_1 = require("../../controllers/teacher/payment.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateToken);
router.get('/reservations', payment_controller_1.TeacherPaymentController.getReservationPayments);
router.get('/reservations/report', payment_controller_1.TeacherPaymentController.getReservationPaymentsReport);
router.get('/reservations/:bookingId', payment_controller_1.TeacherPaymentController.getReservationPaymentByBooking);
exports.default = router;
//# sourceMappingURL=payment.routes.js.map