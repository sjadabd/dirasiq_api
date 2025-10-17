-- Create news table for latest updates
CREATE TABLE IF NOT EXISTS news (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,                  -- عنوان الخبر
    image_url TEXT,                               -- رابط صورة الخبر (اختياري)
    details TEXT NOT NULL,                        -- تفاصيل الخبر
    category VARCHAR(100),                        -- فئة الخبر (اختياري)
    news_type VARCHAR(50) NOT NULL DEFAULT 'web_and_mobile', -- نوع المنصة (ويب/موبايل/كلاهما)
    is_active BOOLEAN DEFAULT TRUE,               -- هل الخبر منشور/فعال
    published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- تاريخ النشر
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,

    -- منع تكرار العناوين
    CONSTRAINT unique_news_title UNIQUE (title)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_news_is_active ON news(is_active);
CREATE INDEX IF NOT EXISTS idx_news_published_at ON news(published_at);
CREATE INDEX IF NOT EXISTS idx_news_news_type ON news(news_type);

-- Trigger لتحديث حقل updated_at تلقائياً عند التعديل
CREATE OR REPLACE FUNCTION update_news_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_news_updated_at ON news;
CREATE TRIGGER update_news_updated_at
    BEFORE UPDATE ON news
    FOR EACH ROW
    EXECUTE FUNCTION update_news_updated_at_column();
