"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendVerificationEmail = sendVerificationEmail;
exports.sendPasswordResetEmail = sendPasswordResetEmail;
const dotenv_1 = __importDefault(require("dotenv"));
const nodemailer_1 = __importDefault(require("nodemailer"));
dotenv_1.default.config();
const transporter = nodemailer_1.default.createTransport({
    host: process.env['EMAIL_HOST'] || 'smtp.gmail.com',
    port: parseInt(process.env['EMAIL_PORT'] || '587'),
    secure: false,
    auth: {
        user: process.env['EMAIL_USER'],
        pass: process.env['EMAIL_PASS'],
    },
});
exports.default = transporter;
async function sendVerificationEmail(to, code, name) {
    try {
        const mailOptions = {
            from: process.env['EMAIL_USER'],
            to,
            subject: 'تحقق من بريدك الإلكتروني - Dirasiq',
            html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">مرحباً ${name}</h2>
          <p>شكراً لك على التسجيل في منصة دراسيق التعليمية.</p>
          <p>رمز التحقق الخاص بك هو:</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0;">
            <h1 style="color: #007bff; font-size: 32px; margin: 0;">${code}</h1>
          </div>
          <p>هذا الرمز صالح لمدة 10 دقائق فقط.</p>
          <p>إذا لم تقم بالتسجيل، يمكنك تجاهل هذا البريد الإلكتروني.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">هذا البريد الإلكتروني تم إرساله تلقائياً من منصة دراسيق التعليمية.</p>
        </div>
      `
        };
        await transporter.sendMail(mailOptions);
        return true;
    }
    catch (error) {
        console.error('Error sending verification email:', error);
        return false;
    }
}
async function sendPasswordResetEmail(to, code, name) {
    try {
        const mailOptions = {
            from: process.env['EMAIL_USER'],
            to,
            subject: 'إعادة تعيين كلمة المرور - Dirasiq',
            html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">مرحباً ${name}</h2>
          <p>لقد تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بك.</p>
          <p>رمز إعادة التعيين هو:</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0;">
            <h1 style="color: #dc3545; font-size: 32px; margin: 0;">${code}</h1>
          </div>
          <p>هذا الرمز صالح لمدة 10 دقائق فقط.</p>
          <p>إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذا البريد الإلكتروني.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">هذا البريد الإلكتروني تم إرساله تلقائياً من منصة دراسيق التعليمية.</p>
        </div>
      `
        };
        await transporter.sendMail(mailOptions);
        return true;
    }
    catch (error) {
        console.error('Error sending password reset email:', error);
        return false;
    }
}
//# sourceMappingURL=email.js.map