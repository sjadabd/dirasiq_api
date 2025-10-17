"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuth = optionalAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function optionalAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const secret = process.env['JWT_SECRET'];
            if (!token || !secret) {
                console.warn('⚠️ Missing JWT token or secret');
                return next();
            }
            const decoded = jsonwebtoken_1.default.verify(token, secret);
            res.locals.user = decoded;
        }
    }
    catch (error) {
        console.warn('⚠️ Invalid or expired token, continuing as guest');
    }
    next();
}
//# sourceMappingURL=optionalAuth.js.map