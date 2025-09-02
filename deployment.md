# دليل النشر - Dirasiq API

هذا الدليل يوضح كيفية نشر Dirasiq API في بيئة الإنتاج.

## 🚀 خيارات النشر

### 1. النشر باستخدام Docker (موصى به)

#### المتطلبات
- Docker
- Docker Compose
- خادم Linux (Ubuntu 20.04+ موصى به)

#### الخطوات

1. **استنساخ المشروع**
```bash
git clone <repository-url>
cd dirasiq_api
```

2. **إعداد المتغيرات البيئية**
```bash
cp env.example .env.prod
# قم بتعديل .env.prod مع قيم الإنتاج
```

3. **بناء وتشغيل الخدمات**
```bash
# Development
docker-compose up -d

# Production
docker-compose -f docker-compose.prod.yml up -d
```

4. **تهيئة قاعدة البيانات**
```bash
docker-compose exec app npm run db:init
```

### 2. النشر التقليدي

#### المتطلبات
- Node.js 18+
- PostgreSQL 12+
- PM2 (لإدارة العمليات)

#### الخطوات

1. **إعداد الخادم**
```bash
# تحديث النظام
sudo apt update && sudo apt upgrade -y

# تثبيت Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# تثبيت PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# تثبيت PM2
sudo npm install -g pm2
```

2. **إعداد قاعدة البيانات**
```bash
sudo -u postgres psql
CREATE DATABASE dirasiq_db;
CREATE USER dirasiq_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE dirasiq_db TO dirasiq_user;
\q
```

3. **نشر التطبيق**
```bash
# استنساخ المشروع
git clone <repository-url>
cd dirasiq_api

# تثبيت التبعيات
npm ci --only=production

# بناء المشروع
npm run build

# إعداد المتغيرات البيئية
cp env.example .env
# تعديل .env

# تهيئة قاعدة البيانات
npm run db:init

# تشغيل التطبيق
pm2 start dist/index.js --name "dirasiq-api"
pm2 save
pm2 startup
```

### 3. النشر على AWS

#### باستخدام EC2

1. **إنشاء خادم EC2**
   - Ubuntu 20.04 LTS
   - t3.medium أو أكبر
   - Security Group مع فتح المنافذ 22, 80, 443

2. **إعداد الخادم**
```bash
# تثبيت Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# تثبيت Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

3. **نشر التطبيق**
```bash
# استنساخ المشروع
git clone <repository-url>
cd dirasiq_api

# تشغيل الخدمات
docker-compose -f docker-compose.prod.yml up -d
```

#### باستخدام ECS

1. **إنشاء ECR Repository**
```bash
aws ecr create-repository --repository-name dirasiq-api
```

2. **بناء وصرف الصورة**
```bash
# تسجيل الدخول إلى ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# بناء الصورة
docker build -t dirasiq-api .

# وسم الصورة
docker tag dirasiq-api:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/dirasiq-api:latest

# رفع الصورة
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/dirasiq-api:latest
```

3. **إنشاء ECS Cluster و Service**

### 4. النشر على Google Cloud Platform

#### باستخدام Cloud Run

1. **بناء الصورة**
```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/dirasiq-api
```

2. **نشر الخدمة**
```bash
gcloud run deploy dirasiq-api \
  --image gcr.io/PROJECT_ID/dirasiq-api \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production
```

## 🔒 إعدادات الأمان

### 1. SSL/TLS
```bash
# باستخدام Let's Encrypt
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com
```

### 2. Firewall
```bash
# UFW
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

### 3. تحديث النظام
```bash
# إعداد التحديثات التلقائية
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure -plow unattended-upgrades
```

## 📊 المراقبة والمراقبة

### 1. PM2 Monitoring
```bash
pm2 monit
pm2 logs dirasiq-api
```

### 2. Docker Monitoring
```bash
docker stats
docker logs dirasiq-api-app-1
```

### 3. Database Monitoring
```bash
# PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-*.log
```

## 🔄 النسخ الاحتياطي

### 1. قاعدة البيانات
```bash
# إنشاء نسخة احتياطية
pg_dump -h localhost -U postgres dirasiq_db > backup_$(date +%Y%m%d_%H%M%S).sql

# استعادة نسخة احتياطية
psql -h localhost -U postgres dirasiq_db < backup_file.sql
```

### 2. ملفات التطبيق
```bash
# نسخ احتياطي للملفات
tar -czf app_backup_$(date +%Y%m%d_%H%M%S).tar.gz /path/to/app
```

## 🚨 استكشاف الأخطاء

### 1. فحص حالة الخدمات
```bash
# Docker
docker-compose ps
docker-compose logs

# PM2
pm2 status
pm2 logs
```

### 2. فحص قاعدة البيانات
```bash
# الاتصال بقاعدة البيانات
psql -h localhost -U postgres -d dirasiq_db

# فحص الجداول
\dt
```

### 3. فحص الشبكة
```bash
# فحص المنافذ
netstat -tulpn | grep :3000

# فحص الاتصال
curl -I http://localhost:3000/health
```

## 📈 تحسين الأداء

### 1. إعدادات قاعدة البيانات
```sql
-- زيادة الذاكرة المشتركة
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;
```

### 2. إعدادات Node.js
```bash
# زيادة ذاكرة Node.js
NODE_OPTIONS="--max-old-space-size=2048" pm2 start dist/index.js
```

### 3. إعدادات Nginx
```nginx
# تفعيل Gzip
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
```

## 📞 الدعم

للمساعدة في النشر:
- راجع ملف README.md
- تحقق من logs الخدمات
- تواصل مع فريق التطوير

---

**ملاحظة**: تأكد من اختبار جميع الإعدادات في بيئة التطوير قبل النشر في الإنتاج.
