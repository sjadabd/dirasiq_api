# Changelog

جميع التغييرات المهمة في هذا المشروع سيتم توثيقها في هذا الملف.

التنسيق مبني على [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
وهذا المشروع يتبع [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project setup with TypeScript
- PostgreSQL database integration
- User authentication system with JWT
- Three user types: Super Admin, Teacher, Student
- Email verification for teachers
- Password reset functionality
- Rate limiting and security middleware
- Comprehensive API documentation
- Docker support
- Testing framework setup
- **NEW**: Advanced location features for users
  - Geocoding service integration with OpenCage provider
  - Extended location fields (formatted address, country, city, state, zipcode, street name, suburb)
  - Location confidence scoring
  - Arabic language support for Iraq
  - Automatic location data retrieval from coordinates
  - **UPDATED**: Location fields are now part of the main users table creation migration

### Security
- JWT token management with database storage
- Password hashing with bcrypt
- Input validation and sanitization
- CORS configuration
- Helmet security headers
- Rate limiting protection

## [1.0.0] - 2024-01-01

### Added
- Initial release of Dirasiq API
- Complete authentication system
- Database migrations
- API endpoints for user management
- Email service integration
- Comprehensive error handling
- Logging system
- Health check endpoint

### Technical Details
- Node.js with TypeScript
- Express.js framework
- PostgreSQL database
- JWT authentication
- Nodemailer for email services
- Jest for testing
- ESLint for code quality
- Docker containerization

---

## أنواع التغييرات

- `Added` للميزات الجديدة
- `Changed` للتغييرات في الميزات الموجودة
- `Deprecated` للميزات التي سيتم إزالتها قريباً
- `Removed` للميزات المحذوفة
- `Fixed` لإصلاح الأخطاء
- `Security` للتحسينات الأمنية
