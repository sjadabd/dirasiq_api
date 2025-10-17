"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QrService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const qrcode_1 = __importDefault(require("qrcode"));
const user_model_1 = require("../models/user.model");
class QrService {
    static async ensureTeacherQr(teacherId) {
        const uploadsRoot = path_1.default.resolve(process.cwd(), 'public', 'uploads', 'teachers', teacherId);
        const fileName = 'qr.png';
        const filePath = path_1.default.join(uploadsRoot, fileName);
        await fs_1.default.promises.mkdir(uploadsRoot, { recursive: true });
        const user = await user_model_1.UserModel.findById(teacherId);
        const existing = user?.teacher_qr_image_path;
        if (existing && fs_1.default.existsSync(path_1.default.resolve(process.cwd(), existing))) {
            return { imagePath: existing, publicUrl: QrService.toPublicUrl(existing) };
        }
        const baseUrl = process.env['PUBLIC_BASE_URL'] || '';
        const payload = baseUrl
            ? `${baseUrl.replace(/\/$/, '')}/a?c=${encodeURIComponent(teacherId)}`
            : `dirasiq://attend?teacher=${encodeURIComponent(teacherId)}`;
        await qrcode_1.default.toFile(filePath, payload, {
            errorCorrectionLevel: 'M',
            type: 'png',
            margin: 1,
            width: 512,
            color: { dark: '#000000', light: '#FFFFFF' }
        });
        const relPath = path_1.default.join('public', 'uploads', 'teachers', teacherId, fileName).replace(/\\/g, '/');
        await user_model_1.UserModel.update(teacherId, { teacher_qr_image_path: relPath });
        return { imagePath: relPath, publicUrl: QrService.toPublicUrl(relPath) };
    }
    static toPublicUrl(relPath) {
        const base = process.env['PUBLIC_BASE_URL'] || '';
        if (!base)
            return `/${relPath.replace(/^public\//, '')}`;
        return `${base.replace(/\/$/, '')}/${relPath.replace(/^public\//, '')}`;
    }
}
exports.QrService = QrService;
//# sourceMappingURL=qr.service.js.map