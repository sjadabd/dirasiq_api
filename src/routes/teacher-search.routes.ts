import { Router } from 'express';
import { TeacherSearchController } from '../controllers/teacher-search.controller';

const router = Router();

// Search teachers by coordinates (with distance calculation)
router.get('/search/coordinates', TeacherSearchController.searchByCoordinates);

// Search teachers by location names
router.get('/search/location', TeacherSearchController.searchByLocation);

// Get available governorates
router.get('/governorates', TeacherSearchController.getGovernorates);

// Get available cities for a governorate
router.get('/cities/:governorate', TeacherSearchController.getCities);

export default router;
