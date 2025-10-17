"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const invoice_controller_1 = require("../../controllers/student/invoice.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticateToken);
router.get('/', invoice_controller_1.StudentInvoiceController.listInvoices);
router.get('/:invoiceId/full', invoice_controller_1.StudentInvoiceController.getInvoiceFull);
router.get('/:invoiceId/installments/:installmentId/full', invoice_controller_1.StudentInvoiceController.getInstallmentFull);
exports.default = router;
//# sourceMappingURL=invoice.routes.js.map