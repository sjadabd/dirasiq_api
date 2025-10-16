import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const secret = process.env['JWT_SECRET'];

      if (!token || !secret) {
        console.warn('⚠️ Missing JWT token or secret');
        return next();
      }

      const decoded = jwt.verify(token, secret);
      (res.locals as any).user = decoded;
    }
  } catch (error) {
    console.warn('⚠️ Invalid or expired token, continuing as guest');
  }

  next();
}
