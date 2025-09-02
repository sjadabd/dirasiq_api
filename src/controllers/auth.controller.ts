import { AuthService } from '@/services/auth.service';
import { getMessage } from '@/utils/messages';
import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';

export class AuthController {
  // Register super admin
  static async registerSuperAdmin(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await Promise.all([
        body('name').notEmpty().withMessage(getMessage('VALIDATION.NAME_REQUIRED')).run(req),
        body('email').isEmail().withMessage(getMessage('VALIDATION.VALID_EMAIL_REQUIRED')).run(req),
        body('password')
          .isLength({ min: 8 })
          .withMessage(getMessage('VALIDATION.PASSWORD_MIN_LENGTH'))
          .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
          .withMessage(getMessage('VALIDATION.PASSWORD_COMPLEXITY'))
          .run(req)
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const { name, email, password } = req.body;
      const result = await AuthService.registerSuperAdmin({ name, email, password });

      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in registerSuperAdmin controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Register teacher
  static async registerTeacher(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await Promise.all([
        body('name').notEmpty().withMessage(getMessage('VALIDATION.NAME_REQUIRED')).run(req),
        body('email').isEmail().withMessage(getMessage('VALIDATION.VALID_EMAIL_REQUIRED')).run(req),
        body('password')
          .isLength({ min: 8 })
          .withMessage(getMessage('VALIDATION.PASSWORD_MIN_LENGTH'))
          .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
          .withMessage(getMessage('VALIDATION.PASSWORD_COMPLEXITY'))
          .run(req),
        body('phone').notEmpty().withMessage(getMessage('VALIDATION.PHONE_REQUIRED')).run(req),
        body('address').notEmpty().withMessage(getMessage('VALIDATION.ADDRESS_REQUIRED')).run(req),
        body('bio').notEmpty().withMessage(getMessage('VALIDATION.BIO_REQUIRED')).run(req),
        body('experienceYears').isInt({ min: 0 }).withMessage(getMessage('VALIDATION.EXPERIENCE_YEARS_REQUIRED')).run(req)
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const {
        name,
        email,
        password,
        phone,
        address,
        bio,
        experienceYears,
        visitorId,
        deviceInfo
      } = req.body;

      const result = await AuthService.registerTeacher({
        name,
        email,
        password,
        phone,
        address,
        bio,
        experienceYears,
        visitorId,
        deviceInfo
      });

      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in registerTeacher controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Register student
  static async registerStudent(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await Promise.all([
        body('name').notEmpty().withMessage(getMessage('VALIDATION.NAME_REQUIRED')).run(req),
        body('email').isEmail().withMessage(getMessage('VALIDATION.VALID_EMAIL_REQUIRED')).run(req),
        body('password')
          .isLength({ min: 8 })
          .withMessage(getMessage('VALIDATION.PASSWORD_MIN_LENGTH'))
          .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
          .withMessage(getMessage('VALIDATION.PASSWORD_COMPLEXITY'))
          .run(req),
        body('studentPhone').optional().matches(/^\+?[1-9]\d{1,14}$/).withMessage(getMessage('VALIDATION.INVALID_PHONE_FORMAT')).run(req),
        body('parentPhone').optional().matches(/^\+?[1-9]\d{1,14}$/).withMessage(getMessage('VALIDATION.INVALID_PARENT_PHONE_FORMAT')).run(req),
        body('schoolName').optional().isLength({ max: 255 }).withMessage(getMessage('STUDENT.SCHOOL_NAME_TOO_LONG')).run(req),
        body('gender').optional().isIn(['male', 'female']).withMessage(getMessage('VALIDATION.INVALID_GENDER')).run(req),
        body('birthDate').optional().isISO8601().withMessage(getMessage('STUDENT.INVALID_BIRTH_DATE_FORMAT')).run(req),
        body('gradeId').notEmpty().withMessage(getMessage('STUDENT.GRADE_ID_REQUIRED')).isUUID().withMessage(getMessage('STUDENT.GRADE_NOT_FOUND')).run(req),
        body('studyYear').notEmpty().withMessage(getMessage('STUDENT.STUDY_YEAR_REQUIRED')).matches(/^[0-9]{4}-[0-9]{4}$/).withMessage(getMessage('STUDENT.INVALID_STUDY_YEAR_FORMAT')).run(req)
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const {
        name,
        email,
        password,
        studentPhone,
        parentPhone,
        schoolName,
        gender,
        birthDate,
        gradeId,
        studyYear
      } = req.body;

      // Validate birth date if provided
      if (birthDate) {
        const birthDateObj = new Date(birthDate);
        const today = new Date();
        let age = today.getFullYear() - birthDateObj.getFullYear();
        const monthDiff = today.getMonth() - birthDateObj.getMonth();

        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDateObj.getDate())) {
          age--;
        }

        if (age < 5) {
          res.status(400).json({
            success: false,
            message: getMessage('VALIDATION.VALIDATION_FAILED'),
            errors: [getMessage('STUDENT.STUDENT_TOO_YOUNG')]
          });
          return;
        }

        if (age > 25) {
          res.status(400).json({
            success: false,
            message: getMessage('VALIDATION.VALIDATION_FAILED'),
            errors: [getMessage('STUDENT.STUDENT_TOO_OLD')]
          });
          return;
        }
      }

      const result = await AuthService.registerStudent({
        name,
        email,
        password,
        studentPhone,
        parentPhone,
        schoolName,
        gender,
        birthDate,
        gradeId,
        studyYear
      });

      if (result.success) {
        res.status(201).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in registerStudent controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Login user
  static async login(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await Promise.all([
        body('email').isEmail().withMessage(getMessage('VALIDATION.VALID_EMAIL_REQUIRED')).run(req),
        body('password').notEmpty().withMessage(getMessage('VALIDATION.PASSWORD_REQUIRED')).run(req)
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const { email, password } = req.body;
      const result = await AuthService.login({ email, password });

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(401).json(result);
      }
    } catch (error) {
      console.error('Error in login controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Logout user
  static async logout(req: Request, res: Response): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        res.status(400).json({
          success: false,
          message: getMessage('AUTH.TOKEN_REQUIRED'),
          errors: [getMessage('AUTH.NO_TOKEN_PROVIDED')]
        });
        return;
      }

      const result = await AuthService.logout(token);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in logout controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Verify email
  static async verifyEmail(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await Promise.all([
        body('email').isEmail().withMessage(getMessage('VALIDATION.VALID_EMAIL_REQUIRED')).run(req),
        body('code').optional().isLength({ min: 6, max: 6 }).withMessage(getMessage('VALIDATION.VERIFICATION_CODE_6_DIGITS')).run(req),
        body('verificationToken').optional().isLength({ min: 6, max: 6 }).withMessage(getMessage('VALIDATION.VERIFICATION_CODE_6_DIGITS')).run(req)
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const { email, code, verificationToken } = req.body;

      // Use either 'code' or 'verificationToken', with 'code' taking precedence
      const verificationCode = code || verificationToken;

      if (!verificationCode) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: [getMessage('VALIDATION.VERIFICATION_CODE_REQUIRED')]
        });
        return;
      }

      const result = await AuthService.verifyEmail(email, verificationCode);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in verifyEmail controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Resend verification code
  static async resendVerificationCode(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await body('email').isEmail().withMessage(getMessage('VALIDATION.VALID_EMAIL_REQUIRED')).run(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const { email } = req.body;
      const result = await AuthService.resendVerificationCode(email);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in resendVerificationCode controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Request password reset
  static async requestPasswordReset(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await body('email').isEmail().withMessage(getMessage('VALIDATION.VALID_EMAIL_REQUIRED')).run(req);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const { email } = req.body;
      const result = await AuthService.requestPasswordReset(email);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in requestPasswordReset controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }

  // Reset password
  static async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      // Validate request body
      await Promise.all([
        body('email').isEmail().withMessage(getMessage('VALIDATION.VALID_EMAIL_REQUIRED')).run(req),
        body('code').optional().isLength({ min: 6, max: 6 }).withMessage(getMessage('VALIDATION.RESET_CODE_6_DIGITS')).run(req),
        body('resetToken').optional().isLength({ min: 6, max: 6 }).withMessage(getMessage('VALIDATION.RESET_CODE_6_DIGITS')).run(req),
        body('newPassword')
          .isLength({ min: 8 })
          .withMessage(getMessage('VALIDATION.PASSWORD_MIN_LENGTH'))
          .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
          .withMessage(getMessage('VALIDATION.PASSWORD_COMPLEXITY'))
          .run(req)
      ]);

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: errors.array().map(err => err.msg)
        });
        return;
      }

      const { email, code, resetToken, newPassword } = req.body;

      // Use either 'code' or 'resetToken', with 'code' taking precedence
      const resetCode = code || resetToken;

      if (!resetCode) {
        res.status(400).json({
          success: false,
          message: getMessage('VALIDATION.VALIDATION_FAILED'),
          errors: [getMessage('VALIDATION.RESET_CODE_REQUIRED')]
        });
        return;
      }

      const result = await AuthService.resetPassword(email, resetCode, newPassword);

      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in resetPassword controller:', error);
      res.status(500).json({
        success: false,
        message: getMessage('SERVER.INTERNAL_ERROR'),
        errors: [getMessage('SERVER.SOMETHING_WENT_WRONG')]
      });
    }
  }
}
