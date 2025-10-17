"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentAssignmentController = void 0;
const path_1 = __importDefault(require("path"));
const academic_year_model_1 = require("../../models/academic-year.model");
const assignment_model_1 = require("../../models/assignment.model");
const assignment_service_1 = require("../../services/assignment.service");
const file_util_1 = require("../../utils/file.util");
class StudentAssignmentController {
    static getService() {
        return new assignment_service_1.AssignmentService();
    }
    static async list(req, res) {
        try {
            const me = req.user;
            if (!me) {
                res.status(401).json({ success: false, message: 'غير مصادق' });
                return;
            }
            const page = parseInt(String(req.query['page'] ?? '1'), 10);
            const limit = parseInt(String(req.query['limit'] ?? '20'), 10);
            const service = StudentAssignmentController.getService();
            const activeYear = await academic_year_model_1.AcademicYearModel.getActive();
            const studyYear = activeYear?.year ?? null;
            const result = await service.listForStudent(String(me.id), page, limit, studyYear);
            res.status(200).json({ success: true, data: result.data, pagination: { page, limit, total: result.total } });
        }
        catch (error) {
            console.error('Error listing student assignments:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
    static async getById(req, res) {
        try {
            const id = String(req.params['id']);
            const service = StudentAssignmentController.getService();
            const item = await service.getById(id);
            if (!item) {
                res.status(404).json({ success: false, message: 'غير موجود' });
                return;
            }
            const activeYear = await academic_year_model_1.AcademicYearModel.getActive();
            const active = activeYear?.year ?? null;
            if (active && item.study_year && String(item.study_year) !== String(active)) {
                res.status(404).json({ success: false, message: 'هذا الواجب غير متوفر لك' });
                return;
            }
            const me = req.user;
            if (!me) {
                res.status(401).json({ success: false, message: 'غير مصادق' });
                return;
            }
            if (item.visibility === 'specific_students') {
                const recipients = await assignment_model_1.AssignmentModel.getRecipientIds(item.id);
                if (!recipients.includes(String(me.id))) {
                    res.status(404).json({ success: false, message: 'هذا الواجب غير متوفر لك' });
                    return;
                }
            }
            const submission = await assignment_model_1.AssignmentModel.getSubmission(item.id, String(me.id));
            const mySubmission = submission
                ? { score: submission.score ?? null, feedback: submission.feedback ?? null, status: submission.status }
                : null;
            const delivery_mode = item?.attachments?.meta?.delivery_mode ?? 'mixed';
            const dataWithDelivery = { ...item, delivery_mode };
            res.status(200).json({ success: true, data: dataWithDelivery, mySubmission });
        }
        catch (error) {
            console.error('Error get assignment:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
    static async mySubmission(req, res) {
        try {
            const me = req.user;
            if (!me) {
                res.status(401).json({ success: false, message: 'غير مصادق' });
                return;
            }
            const assignmentId = String(req.params['id']);
            const sub = await assignment_model_1.AssignmentModel.getSubmission(assignmentId, String(me.id));
            res.status(200).json({ success: true, data: sub });
        }
        catch (error) {
            console.error('Error get my submission:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
    static async submit(req, res) {
        try {
            const me = req.user;
            if (!me) {
                res.status(401).json({ success: false, message: 'غير مصادق' });
                return;
            }
            const assignmentId = String(req.params['id']);
            const { content_text, link_url, attachments, status } = req.body || {};
            const service = StudentAssignmentController.getService();
            const assignment = await service.getById(assignmentId);
            if (!assignment) {
                res.status(404).json({ success: false, message: 'الواجب غير موجود' });
                return;
            }
            const activeYear = await academic_year_model_1.AcademicYearModel.getActive();
            const active = activeYear?.year ?? null;
            if (active && assignment.study_year && String(assignment.study_year) !== String(active)) {
                res.status(403).json({ success: false, message: 'الواجب ليس ضمن السنة الدراسية المفعلة' });
                return;
            }
            if (assignment.is_active === false) {
                res.status(403).json({ success: false, message: 'الواجب غير مفعّل' });
                return;
            }
            if (assignment.visibility === 'specific_students') {
                const recipients = await assignment_model_1.AssignmentModel.getRecipientIds(assignment.id);
                if (!recipients.includes(String(me.id))) {
                    res.status(403).json({ success: false, message: 'غير مصرح لك بتسليم هذا الواجب' });
                    return;
                }
            }
            const now = new Date();
            if (assignment.assigned_date) {
                const start = new Date(assignment.assigned_date);
                if (now < start) {
                    res.status(400).json({ success: false, message: 'لم يبدأ وقت التسليم بعد' });
                    return;
                }
            }
            if (assignment.due_date) {
                const due = new Date(assignment.due_date);
                if (now > due) {
                    res.status(400).json({ success: false, message: 'انتهى وقت التسليم' });
                    return;
                }
            }
            const existingSub = await assignment_model_1.AssignmentModel.getSubmission(assignmentId, String(me.id));
            if (existingSub && String(existingSub.status) === 'graded') {
                res.status(409).json({ success: false, message: 'تم تقييم الواجب، لا يمكن تعديل التسليم' });
                return;
            }
            const submissionType = String(assignment.submission_type || 'mixed');
            const hasText = typeof content_text === 'string' && content_text.trim().length > 0;
            const hasLink = typeof link_url === 'string' && link_url.trim().length > 0;
            const hasFiles = Array.isArray(attachments) && attachments.length > 0;
            const requireText = submissionType === 'text';
            const requireLink = submissionType === 'link';
            const requireFile = submissionType === 'file';
            const isMixed = submissionType === 'mixed' || submissionType === 'electronic';
            if (requireText && !hasText) {
                res.status(400).json({ success: false, message: 'نوع الواجب نصي ويجب إرسال content_text' });
                return;
            }
            if (requireLink && !hasLink) {
                res.status(400).json({ success: false, message: 'نوع الواجب رابط ويجب إرسال link_url' });
                return;
            }
            if (requireFile && !hasFiles) {
                res.status(400).json({ success: false, message: 'نوع الواجب ملفات ويجب إرسال attachments' });
                return;
            }
            if (!isMixed && !requireText && !requireLink && !requireFile && !hasText && !hasLink && !hasFiles) {
                res.status(400).json({ success: false, message: 'لا توجد بيانات تسليم صالحة' });
                return;
            }
            const rawFiles = Array.isArray(attachments)
                ? attachments
                : (attachments && Array.isArray(attachments.files))
                    ? attachments.files
                    : [];
            let processedAttachments = rawFiles;
            try {
                const baseDir = path_1.default.join(process.cwd(), 'public', 'uploads', 'assignments', 'submissions');
                if (Array.isArray(rawFiles)) {
                    const files = [];
                    for (const f of rawFiles) {
                        if (f && typeof f === 'object' && typeof f.base64 === 'string' && f.base64.length > 0) {
                            const savedPath = await (0, file_util_1.saveBase64File)(f.base64, baseDir, f.name);
                            const filename = path_1.default.basename(savedPath);
                            files.push({
                                type: f.type ?? 'file',
                                name: f.name ?? filename,
                                url: `/uploads/assignments/submissions/${filename}`,
                                size: f.size ?? undefined,
                            });
                        }
                        else {
                            files.push(f);
                        }
                    }
                    processedAttachments = files;
                }
            }
            catch (e) {
                console.error('Error processing student submission attachments:', e);
            }
            const allowed = { submitted: true, late: true, returned: true };
            let finalStatus = 'submitted';
            if (typeof status === 'string') {
                const s = String(status).toLowerCase();
                if (allowed[s]) {
                    finalStatus = s;
                }
            }
            const saved = await service.submit(assignmentId, String(me.id), {
                content_text: content_text ?? null,
                link_url: link_url ?? null,
                attachments: processedAttachments,
                status: finalStatus,
                submitted_at: new Date().toISOString(),
            });
            try {
                const notif = req.app.get('notificationService');
                await notif.createAndSendNotification({
                    title: 'تسليم واجب جديد',
                    message: `قام الطالب بإرسال واجبه: ${assignment.title}`,
                    type: 'assignment_due',
                    priority: 'medium',
                    recipientType: 'specific_teachers',
                    recipientIds: [String(assignment.teacher_id)],
                    data: { assignmentId: assignment.id, studentId: String(me.id), subType: 'homework' },
                    createdBy: String(me.id),
                });
            }
            catch (e) {
                console.error('Error sending teacher notification for new submission:', e);
            }
            res.status(200).json({ success: true, data: saved });
        }
        catch (error) {
            console.error('Error submit assignment:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
}
exports.StudentAssignmentController = StudentAssignmentController;
//# sourceMappingURL=assignment.controller.js.map