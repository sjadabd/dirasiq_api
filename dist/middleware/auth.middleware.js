"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = exports.requireStudent = exports.requireTeacher = exports.requireSuperAdmin = exports.authenticateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const token_model_1 = require("../models/token.model");
const user_model_1 = require("../models/user.model");
const types_1 = require("../types");
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) {
            res.status(401).json({
                success: false,
                message: 'رمز المصادقة مطلوب',
                errors: ['لم يتم توفير رمز المصادقة']
            });
            return;
        }
        const dbToken = await token_model_1.TokenModel.findByToken(token);
        if (!dbToken) {
            res.status(401).json({
                success: false,
                message: 'رمز المصادقة غير صحيح',
                errors: ['رمز المصادقة غير موجود']
            });
            return;
        }
        const secret = process.env['JWT_SECRET'];
        if (!secret) {
            res.status(500).json({
                success: false,
                message: 'خطأ داخلي في الخادم',
                errors: ['مفتاح JWT غير مُعد']
            });
            return;
        }
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        const user = await user_model_1.UserModel.findById(decoded.userId);
        if (!user) {
            res.status(401).json({
                success: false,
                message: 'المستخدم غير موجود',
                errors: ['المستخدم غير موجود']
            });
            return;
        }
        if (user.status !== 'active') {
            res.status(401).json({
                success: false,
                message: 'الحساب غير مفعل',
                errors: ['حساب المستخدم غير مفعل']
            });
            return;
        }
        req.user = user;
        next();
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            res.status(401).json({
                success: false,
                message: 'رمز المصادقة غير صحيح',
                errors: ['فشل في التحقق من رمز المصادقة']
            });
            return;
        }
        console.error('Authentication error:', error);
        res.status(500).json({
            success: false,
            message: 'فشل في المصادقة',
            errors: ['خطأ داخلي في الخادم']
        });
    }
};
exports.authenticateToken = authenticateToken;
const requireSuperAdmin = (req, res, next) => {
    if (!req.user || req.user.userType !== types_1.UserType.SUPER_ADMIN) {
        res.status(403).json({
            success: false,
            message: 'الوصول مرفوض',
            errors: ['مطلوب صلاحيات السوبر أدمن']
        });
        return;
    }
    next();
};
exports.requireSuperAdmin = requireSuperAdmin;
const requireTeacher = (req, res, next) => {
    if (!req.user || req.user.userType !== types_1.UserType.TEACHER) {
        res.status(403).json({
            success: false,
            message: 'الوصول مرفوض',
            errors: ['مطلوب صلاحيات المعلم']
        });
        return;
    }
    next();
};
exports.requireTeacher = requireTeacher;
const requireStudent = (req, res, next) => {
    if (!req.user || req.user.userType !== types_1.UserType.STUDENT) {
        res.status(403).json({
            success: false,
            message: 'الوصول مرفوض',
            errors: ['مطلوب صلاحيات الطالب']
        });
        return;
    }
    next();
};
exports.requireStudent = requireStudent;
const requireAuth = (req, res, next) => {
    if (!req.user) {
        res.status(401).json({
            success: false,
            message: 'المصادقة مطلوبة',
            errors: ['المستخدم غير مصادق عليه']
        });
        return;
    }
    next();
};
exports.requireAuth = requireAuth;
//# sourceMappingURL=auth.middleware.js.map