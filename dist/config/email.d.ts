import nodemailer from 'nodemailer';
declare const transporter: nodemailer.Transporter<import("nodemailer/lib/smtp-transport").SentMessageInfo, import("nodemailer/lib/smtp-transport").Options>;
export default transporter;
export declare function sendVerificationEmail(to: string, code: string, name: string): Promise<boolean>;
export declare function sendPasswordResetEmail(to: string, code: string, name: string): Promise<boolean>;
//# sourceMappingURL=email.d.ts.map