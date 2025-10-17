"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeacherAcademicYearController = void 0;
const academic_year_model_1 = require("../../models/academic-year.model");
class TeacherAcademicYearController {
    static async list(req, res) {
        try {
            const me = req.user;
            if (!me) {
                res.status(401).json({ success: false, message: 'غير مصادق' });
                return;
            }
            const { academicYears } = await academic_year_model_1.AcademicYearModel.findAll(1, 1000);
            const active = await academic_year_model_1.AcademicYearModel.getActive();
            res.status(200).json({ success: true, data: { years: academicYears, active } });
        }
        catch (error) {
            console.error('Error list academic years (teacher):', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
}
exports.TeacherAcademicYearController = TeacherAcademicYearController;
//# sourceMappingURL=academic-year.controller.js.map