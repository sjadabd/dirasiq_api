import { Router } from 'express';
import { WaylWebhookController } from '../../controllers/payments/wayl-webhook.controller';

const router = Router();

router.post('/webhook', WaylWebhookController.handle);

export default router;
