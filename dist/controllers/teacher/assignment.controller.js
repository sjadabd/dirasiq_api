"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeacherAssignmentController = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const database_1 = __importDefault(require("../../config/database"));
const academic_year_model_1 = require("../../models/academic-year.model");
const assignment_model_1 = require("../../models/assignment.model");
const notification_model_1 = require("../../models/notification.model");
const user_model_1 = require("../../models/user.model");
const assignment_service_1 = require("../../services/assignment.service");
const file_util_1 = require("../../utils/file.util");
class TeacherAssignmentController {
    static getService() {
        return new assignment_service_1.AssignmentService();
    }
    static async students(req, res) {
        try {
            const me = req.user;
            if (!me) {
                res.status(401).json({ success: false, message: 'غير مصادق' });
                return;
            }
            const id = String(req.params['id']);
            const service = TeacherAssignmentController.getService();
            const item = await service.getById(id);
            if (!item) {
                res.status(404).json({ success: false, message: 'غير موجود' });
                return;
            }
            if (String(item.teacher_id) !== String(me.id)) {
                res.status(403).json({ success: false, message: 'غير مصرح' });
                return;
            }
            if (item.visibility === 'specific_students') {
                const ids = await assignment_model_1.AssignmentModel.getRecipientIds(id);
                const students = [];
                for (const sid of ids) {
                    const u = await user_model_1.UserModel.findById(sid);
                    if (u)
                        students.push({ id: String(u.id), name: String(u.name || '') });
                }
                res.status(200).json({ success: true, data: students });
                return;
            }
            const q = `
        SELECT u.id::text AS id, u.name AS name
        FROM course_bookings cb
        JOIN users u ON u.id = cb.student_id AND u.user_type = 'student' AND u.deleted_at IS NULL
        WHERE cb.course_id = $1 AND cb.teacher_id = $2 AND cb.status = 'confirmed' AND cb.is_deleted = false
        ORDER BY u.name ASC
      `;
            const rows = (await database_1.default.query(q, [String(item.course_id), String(me.id)])).rows;
            res.status(200).json({ success: true, data: rows });
        }
        catch (error) {
            console.error('Error get assignment students:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
    static async overview(req, res) {
        try {
            const me = req.user;
            if (!me) {
                res.status(401).json({ success: false, message: 'غير مصادق' });
                return;
            }
            const id = String(req.params['id']);
            const service = TeacherAssignmentController.getService();
            const item = await service.getById(id);
            if (!item) {
                res.status(404).json({ success: false, message: 'غير موجود' });
                return;
            }
            if (String(item.teacher_id) !== String(me.id)) {
                res.status(403).json({ success: false, message: 'غير مصرح' });
                return;
            }
            let recipients = [];
            if (item.visibility === 'specific_students') {
                const ids = await assignment_model_1.AssignmentModel.getRecipientIds(id);
                for (const sid of ids) {
                    const u = await user_model_1.UserModel.findById(sid);
                    if (u)
                        recipients.push({ id: String(u.id), name: String(u.name || '') });
                }
            }
            const submissions = await assignment_model_1.AssignmentModel.listSubmissionsByAssignment(id);
            const studentIds = Array.from(new Set(submissions.map((s) => String(s.student_id))));
            const studentMap = new Map();
            for (const sid of studentIds) {
                const u = await user_model_1.UserModel.findById(sid);
                if (u)
                    studentMap.set(String(u.id), { id: String(u.id), name: String(u.name || '') });
            }
            const submissionsWithStudent = submissions.map((s) => ({
                ...s,
                student: studentMap.get(String(s.student_id)) || { id: String(s.student_id), name: '' },
            }));
            res.status(200).json({ success: true, data: { assignment: item, recipients, submissions: submissionsWithStudent } });
        }
        catch (error) {
            console.error('Error get assignment overview:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
    static async recipients(req, res) {
        try {
            const me = req.user;
            if (!me) {
                res.status(401).json({ success: false, message: 'غير مصادق' });
                return;
            }
            const id = String(req.params['id']);
            const service = TeacherAssignmentController.getService();
            const item = await service.getById(id);
            if (!item) {
                res.status(404).json({ success: false, message: 'غير موجود' });
                return;
            }
            if (String(item.teacher_id) !== String(me.id)) {
                res.status(403).json({ success: false, message: 'غير مصرح' });
                return;
            }
            const recipientIds = await assignment_model_1.AssignmentModel.getRecipientIds(id);
            const recipients = [];
            for (const rid of recipientIds) {
                const u = await user_model_1.UserModel.findById(rid);
                if (u)
                    recipients.push({ id: String(u.id), name: String(u.name || '') });
            }
            res.status(200).json({ success: true, data: recipients });
        }
        catch (error) {
            console.error('Error list recipients:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
    static async getStudentSubmission(req, res) {
        try {
            const me = req.user;
            if (!me) {
                res.status(401).json({ success: false, message: 'غير مصادق' });
                return;
            }
            const assignmentId = String(req.params['assignmentId']);
            const studentId = String(req.params['studentId']);
            const service = TeacherAssignmentController.getService();
            const item = await service.getById(assignmentId);
            if (!item) {
                res.status(404).json({ success: false, message: 'غير موجود' });
                return;
            }
            if (String(item.teacher_id) !== String(me.id)) {
                res.status(403).json({ success: false, message: 'غير مصرح' });
                return;
            }
            const sub = await assignment_model_1.AssignmentModel.getSubmission(assignmentId, studentId);
            res.status(200).json({ success: true, data: sub });
        }
        catch (error) {
            console.error('Error get student submission:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
    static async create(req, res) {
        try {
            const me = req.user;
            if (!me) {
                res.status(401).json({ success: false, message: 'غير مصادق' });
                return;
            }
            const { course_id, subject_id, session_id, title, description, assigned_date, due_date, submission_type, attachments, resources, max_score, is_active, visibility, study_year, grade_id, recipients, } = req.body || {};
            if (!course_id || !title) {
                res
                    .status(400)
                    .json({ success: false, message: 'course_id و title مطلوبة' });
                return;
            }
            const rawSubmissionType = String(submission_type ?? 'mixed').toLowerCase();
            const allowedSubmissionTypes = new Set(['text', 'file', 'link', 'mixed']);
            const normalizedSubmissionType = (rawSubmissionType === 'paper'
                ? 'mixed'
                : (allowedSubmissionTypes.has(rawSubmissionType) ? rawSubmissionType : 'mixed'));
            let processedAttachments = attachments ?? {};
            try {
                const baseDir = path_1.default.join(process.cwd(), 'public', 'uploads', 'assignments');
                if (attachments && Array.isArray(attachments.files)) {
                    const files = [];
                    for (const f of attachments.files) {
                        if (f &&
                            typeof f === 'object' &&
                            typeof f.base64 === 'string' &&
                            f.base64.length > 0) {
                            const savedPath = await (0, file_util_1.saveBase64File)(f.base64, baseDir, f.name);
                            const filename = path_1.default.basename(savedPath);
                            files.push({
                                type: f.type ?? 'file',
                                name: f.name ?? filename,
                                url: `/uploads/assignments/${filename}`,
                                size: f.size ?? undefined,
                            });
                        }
                        else {
                            files.push(f);
                        }
                    }
                    processedAttachments = { ...attachments, files };
                }
            }
            catch (e) {
                console.error('Error processing assignment attachments:', e);
            }
            const rawDeliveryMode = String((req.body?.delivery_mode ?? rawSubmissionType) || 'mixed').toLowerCase();
            const deliveryMode = ['paper', 'electronic', 'mixed'].includes(rawDeliveryMode) ? rawDeliveryMode : 'mixed';
            processedAttachments = {
                ...(processedAttachments || {}),
                meta: {
                    ...((processedAttachments && processedAttachments.meta) || {}),
                    delivery_mode: deliveryMode,
                },
            };
            const activeYear = await academic_year_model_1.AcademicYearModel.getActive();
            const resolvedStudyYear = study_year ?? activeYear?.year ?? null;
            const service = TeacherAssignmentController.getService();
            const assignment = await service.createAssignment({
                course_id: String(course_id),
                subject_id: subject_id ? String(subject_id) : null,
                session_id: session_id ? String(session_id) : null,
                teacher_id: String(me.id),
                title: String(title),
                description: description ? String(description) : null,
                assigned_date: assigned_date ?? null,
                due_date: due_date ?? null,
                submission_type: normalizedSubmissionType,
                attachments: processedAttachments,
                resources: resources ?? [],
                max_score: max_score ?? 100,
                is_active: typeof is_active === 'boolean' ? is_active : true,
                visibility: visibility ?? 'all_students',
                study_year: resolvedStudyYear,
                grade_id: grade_id ?? null,
                created_by: String(me.id),
            });
            if (assignment.visibility === 'specific_students' &&
                recipients?.studentIds?.length) {
                await service.setRecipients(assignment.id, recipients.studentIds.map((s) => String(s)));
            }
            const notif = req.app.get('notificationService');
            const baseMsg = `تم إنشاء واجب جديد: ${assignment.title}`;
            if (assignment.visibility === 'all_students') {
                await notif.createAndSendNotification({
                    title: 'واجب جديد',
                    message: baseMsg,
                    type: 'assignment_due',
                    priority: 'medium',
                    recipientType: 'students',
                    data: {
                        assignmentId: assignment.id,
                        dueDate: assignment.due_date,
                        subType: 'homework',
                    },
                    createdBy: String(me.id),
                });
            }
            else if (assignment.visibility === 'specific_students' &&
                recipients?.studentIds?.length) {
                await notif.createAndSendNotification({
                    title: 'واجب جديد',
                    message: baseMsg,
                    type: 'assignment_due',
                    priority: 'medium',
                    recipientType: 'specific_students',
                    recipientIds: recipients.studentIds.map((s) => String(s)),
                    data: {
                        assignmentId: assignment.id,
                        dueDate: assignment.due_date,
                        subType: 'homework',
                    },
                    createdBy: String(me.id),
                });
            }
            res.status(201).json({ success: true, data: assignment });
        }
        catch (error) {
            console.error('Error creating assignment:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
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
            const service = TeacherAssignmentController.getService();
            const activeYear = await academic_year_model_1.AcademicYearModel.getActive();
            const studyYear = activeYear?.year ?? null;
            const result = await service.listByTeacher(String(me.id), page, limit, studyYear);
            res
                .status(200)
                .json({
                success: true,
                data: result.data,
                pagination: { page, limit, total: result.total },
            });
        }
        catch (error) {
            console.error('Error listing assignments:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
    static async getById(req, res) {
        try {
            const id = String(req.params['id']);
            const service = TeacherAssignmentController.getService();
            const item = await service.getById(id);
            if (!item) {
                res.status(404).json({ success: false, message: 'غير موجود' });
                return;
            }
            res.status(200).json({ success: true, data: item });
        }
        catch (error) {
            console.error('Error get assignment:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
    static async update(req, res) {
        try {
            const id = String(req.params['id']);
            const service = TeacherAssignmentController.getService();
            const existing = await service.getById(id);
            if (!existing) {
                res.status(404).json({ success: false, message: 'غير موجود' });
                return;
            }
            const body = req.body || {};
            let processedAttachments = body.attachments;
            if (body.attachments && Array.isArray(body.attachments.files)) {
                const baseDir = path_1.default.join(process.cwd(), 'public', 'uploads', 'assignments');
                const incomingFiles = body.attachments.files;
                const keptUrls = new Set();
                const newFiles = [];
                for (const f of incomingFiles) {
                    if (f &&
                        typeof f === 'object' &&
                        typeof f.base64 === 'string' &&
                        f.base64.length > 0) {
                        const savedPath = await (0, file_util_1.saveBase64File)(f.base64, baseDir, f.name);
                        const filename = path_1.default.basename(savedPath);
                        newFiles.push({
                            type: f.type ?? 'file',
                            name: f.name ?? filename,
                            url: `/uploads/assignments/${filename}`,
                            size: f.size ?? undefined,
                        });
                    }
                    else if (f && typeof f.url === 'string') {
                        newFiles.push(f);
                        keptUrls.add(f.url);
                    }
                    else {
                        newFiles.push(f);
                    }
                }
                const oldFiles = existing.attachments && Array.isArray(existing.attachments.files)
                    ? existing.attachments.files
                    : [];
                for (const ofile of oldFiles) {
                    const url = ofile?.url;
                    if (url &&
                        url.startsWith('/uploads/assignments/') &&
                        !keptUrls.has(url)) {
                        try {
                            const abs = path_1.default.join(process.cwd(), 'public', url);
                            if (fs_1.default.existsSync(abs)) {
                                fs_1.default.unlinkSync(abs);
                            }
                        }
                        catch (e) {
                            console.error('Failed to delete old assignment file:', url, e);
                        }
                    }
                }
                processedAttachments = { ...body.attachments, files: newFiles };
            }
            const rawSubmissionType = typeof body.submission_type === 'string' ? String(body.submission_type).toLowerCase() : undefined;
            const allowedSubmissionTypes = new Set(['text', 'file', 'link', 'mixed']);
            const normalizedSubmissionType = rawSubmissionType
                ? (['paper', 'online', 'electronic'].includes(rawSubmissionType)
                    ? 'mixed'
                    : (allowedSubmissionTypes.has(rawSubmissionType) ? rawSubmissionType : undefined))
                : undefined;
            const patchPayload = {
                ...body,
                ...(processedAttachments !== undefined ? { attachments: processedAttachments } : {}),
                ...(normalizedSubmissionType ? { submission_type: normalizedSubmissionType } : {}),
            };
            const updated = await service.update(id, patchPayload);
            if (!updated) {
                res.status(404).json({ success: false, message: 'غير موجود' });
                return;
            }
            try {
                const notif = req.app.get('notificationService');
                const baseMsg = `تم تعديل الواجب: ${updated.title}`;
                if (updated.visibility === 'all_students') {
                    await notif.createAndSendNotification({
                        title: 'تحديث واجب',
                        message: baseMsg,
                        type: 'assignment_due',
                        priority: 'medium',
                        recipientType: 'students',
                        data: {
                            assignmentId: updated.id,
                            dueDate: updated.due_date,
                            subType: 'homework',
                        },
                        createdBy: String(existing?.teacher_id ?? ''),
                    });
                }
                else if (updated.visibility === 'specific_students') {
                    const recipientIds = await assignment_model_1.AssignmentModel.getRecipientIds(updated.id);
                    if (recipientIds.length) {
                        await notif.createAndSendNotification({
                            title: 'تحديث واجب',
                            message: baseMsg,
                            type: 'assignment_due',
                            priority: 'medium',
                            recipientType: 'specific_students',
                            recipientIds,
                            data: {
                                assignmentId: updated.id,
                                dueDate: updated.due_date,
                                subType: 'homework',
                            },
                            createdBy: String(existing?.teacher_id ?? ''),
                        });
                    }
                }
            }
            catch (e) {
                console.error('Error sending assignment update notification:', e);
            }
            res.status(200).json({ success: true, data: updated });
        }
        catch (error) {
            console.error('Error update assignment:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
    static async remove(req, res) {
        try {
            const id = String(req.params['id']);
            const service = TeacherAssignmentController.getService();
            const ok = await service.softDelete(id);
            if (!ok) {
                res.status(404).json({ success: false, message: 'غير موجود' });
                return;
            }
            try {
                const affected = await notification_model_1.NotificationModel.softDeleteByAssignmentId(id);
                if (affected > 0) {
                    console.info(`Notifications soft-deleted for assignment ${id}: ${affected}`);
                }
            }
            catch (e) {
                console.error('Error soft-deleting notifications for assignment:', id, e);
            }
            res.status(200).json({ success: true, message: 'تم الحذف' });
        }
        catch (error) {
            console.error('Error delete assignment:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
    static async setRecipients(req, res) {
        try {
            const id = String(req.params['id']);
            const { studentIds } = req.body || {};
            if (!Array.isArray(studentIds)) {
                res.status(400).json({ success: false, message: 'studentIds[] مطلوب' });
                return;
            }
            const service = TeacherAssignmentController.getService();
            const existing = await service.getById(id);
            if (!existing) {
                res.status(404).json({ success: false, message: 'غير موجود' });
                return;
            }
            const ids = studentIds.map((s) => String(s));
            if (ids.length === 0) {
                if (existing.visibility !== 'specific_students') {
                    await service.update(id, { visibility: 'specific_students' });
                }
                const oldRecipientIds = await assignment_model_1.AssignmentModel.getRecipientIds(id);
                await service.setRecipients(id, []);
                try {
                    if (oldRecipientIds.length) {
                        const notif = req.app.get('notificationService');
                        await notif.createAndSendNotification({
                            title: 'إلغاء واجب',
                            message: `تم إلغاء الواجب: ${existing.title}`,
                            type: 'assignment_due',
                            priority: 'medium',
                            recipientType: 'specific_students',
                            recipientIds: oldRecipientIds,
                            data: { assignmentId: existing.id, dueDate: existing.due_date, subType: 'homework' },
                            createdBy: String(existing.teacher_id),
                        });
                    }
                }
                catch (e) {
                    console.error('Error notifying removed recipients on empty set:', e);
                }
                res.status(200).json({ success: true, message: 'تم تفريغ المستلمين وتحويل الرؤية إلى طلاب محددين (مخفي للجميع)' });
                return;
            }
            if (existing.visibility !== 'specific_students') {
                await service.update(id, { visibility: 'specific_students' });
            }
            const oldRecipientIds = await assignment_model_1.AssignmentModel.getRecipientIds(id);
            const newSet = new Set(ids);
            const oldSet = new Set(oldRecipientIds);
            const added = ids.filter((x) => !oldSet.has(x));
            const removed = oldRecipientIds.filter((x) => !newSet.has(x));
            await service.setRecipients(id, ids);
            try {
                const notif = req.app.get('notificationService');
                if (added.length) {
                    await notif.createAndSendNotification({
                        title: 'واجب جديد',
                        message: `تم تعيين واجب لك: ${existing.title}`,
                        type: 'assignment_due',
                        priority: 'medium',
                        recipientType: 'specific_students',
                        recipientIds: added,
                        data: { assignmentId: existing.id, dueDate: existing.due_date, subType: 'homework' },
                        createdBy: String(existing.teacher_id),
                    });
                }
                if (removed.length) {
                    await notif.createAndSendNotification({
                        title: 'إلغاء واجب',
                        message: `تم إلغاء الواجب: ${existing.title}`,
                        type: 'assignment_due',
                        priority: 'medium',
                        recipientType: 'specific_students',
                        recipientIds: removed,
                        data: { assignmentId: existing.id, dueDate: existing.due_date, subType: 'homework' },
                        createdBy: String(existing.teacher_id),
                    });
                }
            }
            catch (e) {
                console.error('Error sending recipient change notifications:', e);
            }
            res.status(200).json({ success: true, message: 'تم تحديث قائمة المستلمين (طلاب محددين)' });
        }
        catch (error) {
            console.error('Error set recipients:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
    static async grade(req, res) {
        try {
            const me = req.user;
            if (!me) {
                res.status(401).json({ success: false, message: 'غير مصادق' });
                return;
            }
            const assignmentId = String(req.params['assignmentId']);
            const studentId = String(req.params['studentId']);
            const { score, feedback } = req.body || {};
            const service = TeacherAssignmentController.getService();
            const updated = await service.grade(assignmentId, studentId, Number(score), String(me.id), feedback);
            if (updated) {
                const notif = req.app.get('notificationService');
                await notif.createAndSendNotification({
                    title: 'نتيجة واجبك',
                    message: `تم تقييم واجبك. الدرجة: ${updated.score ?? ''}`,
                    type: 'assignment_due',
                    priority: 'medium',
                    recipientType: 'specific_students',
                    recipientIds: [studentId],
                    data: { assignmentId, subType: 'homework' },
                    createdBy: String(me.id),
                });
            }
            res.status(200).json({ success: true, data: updated });
        }
        catch (error) {
            console.error('Error grade submission:', error);
            res.status(500).json({ success: false, message: 'خطأ داخلي في الخادم' });
        }
    }
}
exports.TeacherAssignmentController = TeacherAssignmentController;
//# sourceMappingURL=assignment.controller.js.map