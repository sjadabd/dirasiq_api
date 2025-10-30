import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config();

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env['EMAIL_HOST'] || 'smtp.gmail.com',
  port: parseInt(process.env['EMAIL_PORT'] || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env['EMAIL_USER'],
    pass: process.env['EMAIL_PASS'],
  },
});

export default transporter;

// Send verification email
export async function sendVerificationEmail(
  to: string,
  code: string,
  name: string
): Promise<boolean> {
  try {
    const mailOptions = {
      from: process.env['EMAIL_USER'],
      to,
      subject: 'تحقق من بريدك الإلكتروني - MulhimIQ',
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">مرحباً ${name}</h2>
          <p>شكراً لك على التسجيل في منصة MulhimIQ التعليمية.</p>
          <p>رمز التحقق الخاص بك هو:</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0;">
            <h1 style="color: #007bff; font-size: 32px; margin: 0;">${code}</h1>
          </div>
          <p>هذا الرمز صالح لمدة 10 دقائق فقط.</p>
          <p>إذا لم تقم بالتسجيل، يمكنك تجاهل هذا البريد الإلكتروني.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">هذا البريد الإلكتروني تم إرساله تلقائياً من منصة MulhimIQ التعليمية.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending verification email:', error);
    return false;
  }
}

// Send password reset email
export async function sendPasswordResetEmail(
  to: string,
  code: string,
  name: string
): Promise<boolean> {
  try {
    const mailOptions = {
      from: process.env['EMAIL_USER'],
      to,
      subject: 'إعادة تعيين كلمة المرور - MulhimIQ',
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
          <p style="color: #666; font-size: 12px;">هذا البريد الإلكتروني تم إرساله تلقائياً من منصة MulhimIQ التعليمية.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return false;
  }
}
