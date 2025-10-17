"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const token_model_1 = require("../models/token.model");
const user_model_1 = require("../models/user.model");
const router = (0, express_1.Router)();
router.put('/onesignal-player-id', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const { oneSignalPlayerId } = req.body;
        const userId = req.user?.id;
        const token = req.token;
        if (!oneSignalPlayerId) {
            res.status(400).json({
                success: false,
                message: 'OneSignal player ID is required',
            });
            return;
        }
        const user = await user_model_1.UserModel.findById(userId);
        if (!user) {
            res.status(404).json({
                success: false,
                message: 'User not found',
            });
            return;
        }
        const updated = await token_model_1.TokenModel.updatePlayerId(userId, token, oneSignalPlayerId);
        if (!updated) {
            res.status(400).json({
                success: false,
                message: 'Failed to update OneSignal Player ID for this session',
            });
            return;
        }
        res.json({
            success: true,
            message: 'OneSignal player ID updated successfully',
        });
    }
    catch (error) {
        console.error('Error updating OneSignal player ID:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
});
router.get('/onesignal-status', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.id;
        const user = await user_model_1.UserModel.findById(userId);
        if (!user) {
            res.status(404).json({
                success: false,
                message: 'User not found',
            });
            return;
        }
        const playerId = await token_model_1.TokenModel.getPlayerId(userId);
        res.json({
            success: true,
            data: {
                userId: user.id,
                userName: user.name,
                userEmail: user.email,
                userType: user.userType,
                onesignalPlayerId: playerId,
                hasOneSignalId: !!playerId,
            },
        });
    }
    catch (error) {
        console.error('Error getting OneSignal status:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
});
router.get('/onesignal-status/:userId', auth_middleware_1.authenticateToken, async (req, res) => {
    try {
        const currentUser = req.user;
        const targetUserId = req.params['userId'];
        if (!targetUserId) {
            res.status(400).json({
                success: false,
                message: 'User ID is required',
            });
            return;
        }
        if (currentUser.userType !== 'super_admin') {
            res.status(403).json({
                success: false,
                message: 'Access denied. Only super admins can view other users OneSignal status.',
            });
            return;
        }
        const user = await user_model_1.UserModel.findById(targetUserId);
        if (!user) {
            res.status(404).json({
                success: false,
                message: 'User not found',
            });
            return;
        }
        const playerId = await token_model_1.TokenModel.getPlayerId(targetUserId);
        res.json({
            success: true,
            data: {
                userId: user.id,
                userName: user.name,
                userEmail: user.email,
                userType: user.userType,
                onesignalPlayerId: playerId,
                hasOneSignalId: !!playerId,
            },
        });
    }
    catch (error) {
        console.error('Error getting OneSignal status:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
});
exports.default = router;
//# sourceMappingURL=user-onesignal.routes.js.map