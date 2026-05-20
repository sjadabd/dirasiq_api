/**
 * One-shot seeder: 3 branded news posts (web / mobile / web_and_mobile).
 * Generates inline SVG banners (no external assets), base64-encodes them,
 * and POSTs to /api/news as super admin.
 *
 * Run from dirasiq_api/:
 *   node scripts/seed-news.js
 */

const API = process.env.API_BASE || 'http://localhost:3000';
const EMAIL = process.env.ADMIN_EMAIL || 'admin@mulhimiq.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'MulhimAdmin2026!';

/** Build a branded SVG banner (1200x600) for a news card. */
function buildSvg({ title, subtitle, accent, channelLabel, channelIcon }) {
  // Inline SVG with Cairo-like sans-serif fallback, brand gradient, logo glyph.
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600" width="1200" height="600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#050d1f"/>
      <stop offset="50%" stop-color="#0b2545"/>
      <stop offset="100%" stop-color="#0e2e54"/>
    </linearGradient>
    <radialGradient id="orbA" cx="0.85" cy="0.15" r="0.45">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="orbB" cx="0.10" cy="0.85" r="0.45">
      <stop offset="0%" stop-color="#3FA9F5" stop-opacity="0.30"/>
      <stop offset="100%" stop-color="#3FA9F5" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="4"/></filter>
  </defs>

  <!-- Background -->
  <rect width="1200" height="600" fill="url(#bg)"/>
  <rect width="1200" height="600" fill="url(#orbA)"/>
  <rect width="1200" height="600" fill="url(#orbB)"/>

  <!-- Subtle grid lines for tech vibe -->
  <g stroke="#FFFFFF" stroke-opacity="0.04" stroke-width="1">
    <line x1="0" y1="150" x2="1200" y2="150"/>
    <line x1="0" y1="300" x2="1200" y2="300"/>
    <line x1="0" y1="450" x2="1200" y2="450"/>
    <line x1="300" y1="0" x2="300" y2="600"/>
    <line x1="600" y1="0" x2="600" y2="600"/>
    <line x1="900" y1="0" x2="900" y2="600"/>
  </g>

  <!-- Brand logo glyph: open book + accent M -->
  <g transform="translate(80, 80)">
    <!-- Book base -->
    <path d="M 0 80 L 0 160 L 70 175 L 140 160 L 140 80 L 70 95 Z"
          fill="#0e2e54" stroke="${accent}" stroke-width="3" opacity="0.95"/>
    <!-- M (accent orange) -->
    <path d="M 25 130 L 35 50 L 55 95 L 70 30 L 85 95 L 105 50 L 115 130
             L 100 130 L 95 80 L 80 120 L 70 75 L 60 120 L 45 80 L 40 130 Z"
          fill="${accent}" filter="url(#glow)"/>
    <!-- Star spark -->
    <circle cx="130" cy="20" r="4" fill="${accent}"/>
    <circle cx="145" cy="35" r="3" fill="${accent}" opacity="0.7"/>
  </g>

  <!-- Brand text -->
  <g transform="translate(260, 100)">
    <text x="0" y="0" font-family="Cairo, 'Segoe UI', Tahoma, sans-serif"
          font-size="44" font-weight="900" fill="#FFFFFF" letter-spacing="-1">
      Mulhim<tspan fill="${accent}">IQ</tspan>
    </text>
    <text x="0" y="32" font-family="Cairo, 'Segoe UI', Tahoma, sans-serif"
          font-size="18" font-weight="600" fill="#FFFFFF" fill-opacity="0.65">
      منصة التعليم الذكي
    </text>
  </g>

  <!-- Channel badge (top-right in LTR; we render in LTR for SVG simplicity) -->
  <g transform="translate(950, 60)">
    <rect x="0" y="0" rx="22" ry="22" width="180" height="44"
          fill="${accent}" fill-opacity="0.18" stroke="${accent}" stroke-opacity="0.55" stroke-width="2"/>
    <text x="90" y="29" text-anchor="middle"
          font-family="Cairo, 'Segoe UI', Tahoma, sans-serif"
          font-size="16" font-weight="800" fill="${accent}">
      ${channelIcon} ${channelLabel}
    </text>
  </g>

  <!-- Hero title (Arabic, right-anchored for natural RTL reading order) -->
  <g>
    <text x="1120" y="340" text-anchor="end"
          font-family="Cairo, 'Segoe UI', Tahoma, sans-serif"
          font-size="56" font-weight="900" fill="#FFFFFF" letter-spacing="-1">
      ${escapeXml(title)}
    </text>
    <text x="1120" y="395" text-anchor="end"
          font-family="Cairo, 'Segoe UI', Tahoma, sans-serif"
          font-size="24" font-weight="500" fill="#FFFFFF" fill-opacity="0.8">
      ${escapeXml(subtitle)}
    </text>
  </g>

  <!-- Decorative bottom bar -->
  <rect x="0" y="585" width="1200" height="15" fill="${accent}" opacity="0.85"/>
  <rect x="0" y="580" width="400" height="5" fill="#3FA9F5"/>
</svg>`;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function svgToDataUri(svg) {
  return 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64');
}

async function http(method, path, body, token) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let json;
  try { json = JSON.parse(txt); } catch { json = { raw: txt }; }
  return { status: res.status, json };
}

const posts = [
  // 1. WEB ONLY — admin/teacher facing announcement for the web dashboard
  {
    newsType: 'web',
    title: 'ندوة تدريبية مجانية للمعلمين',
    details:
`📢 إعلان رسمي من إدارة منصة Mulhim IQ

يسرّنا دعوة جميع المعلمين المسجّلين في المنصة إلى ندوة تدريبية مجانية بعنوان:
"إدارة فصلك الإلكتروني باحتراف — من الجدول إلى الفاتورة"

📅 التاريخ: السبت 24 / 05 / 2026
🕐 الوقت: 7:00 مساءً (بتوقيت بغداد)
📍 المكان: عبر منصة Zoom (الرابط يُرسل قبل الندوة بساعة)

🎯 محاور الندوة:
• إنشاء الكورسات وجدولة الحصص الأسبوعية
• استخدام QR Code للحضور وتقاريره
• إعداد الفواتير والأقساط ومتابعة المدفوعات
• إرسال الواجبات والامتحانات وتقييم الطلاب
• استثمار التحليلات الذكية لتطوير الأداء

🎁 المشاركون سيحصلون على:
• شهادة حضور رقمية مُعتمدة من المنصة
• خصم 20% على الباقة الاحترافية لمدة شهر
• دعم فني مخصّص لإعداد حسابك في يوم واحد

سجّل حضورك الآن من لوحة التحكم الخاصة بك. المقاعد محدودة.`,
    banner: {
      title: 'ندوة تدريبية مجانية',
      subtitle: 'إدارة فصلك الإلكتروني — للمعلمين',
      accent: '#3FA9F5',
      channelLabel: 'WEB ONLY',
      channelIcon: '◧',
    },
  },

  // 2. MOBILE ONLY — student-facing update visible inside the Flutter app
  {
    newsType: 'mobile',
    title: 'تحديث جديد في تطبيق ملهم للطلاب',
    details:
`📱 إصدار جديد متاح الآن للتنزيل

أعزّاءنا الطلاب، أطلقنا تحديثاً جديداً لتطبيق Mulhim IQ على الهاتف بمميزات تجعل تجربتك أسرع وأكثر سلاسة.

✨ ما الجديد في هذا الإصدار:

🔐 حضور أسرع بـ QR Code
• مسح فوري بدون تحميل صفحات وسيطة
• تأكيد بصوت + اهتزاز عند نجاح الحضور
• سجل حضور قابل للعرض دون اتصال إنترنت

🔔 إشعارات أذكى
• تذكير قبل الحصة بـ 30 دقيقة
• إشعار فوري عند نشر واجب أو نتيجة امتحان
• تجميع إشعارات نفس المعلم لتقليل الإزعاج

📊 لوحة تحكم محسّنة
• عرض كل الكورسات والفواتير في صفحة واحدة
• تتبع تقدّمك الأكاديمي بمخططات بسيطة
• تنزيل التقارير الشهرية كملف PDF

🌙 وضع ليلي كامل + دعم القراءة بحجم خط أكبر للطلاب الذين يحتاجون

💾 حجم التحديث: 12 ميغابايت — متوفر الآن على App Store و Google Play.

نشكركم على ثقتكم — أرسلوا لنا ملاحظاتكم من قائمة "المساعدة" داخل التطبيق.`,
    banner: {
      title: 'تحديث جديد للطلاب',
      subtitle: 'حضور أسرع + إشعارات أذكى + وضع ليلي',
      accent: '#FF8A00',
      channelLabel: 'MOBILE ONLY',
      channelIcon: '◱',
    },
  },

  // 3. WEB + MOBILE — official launch announcement, visible everywhere
  {
    newsType: 'web_and_mobile',
    title: 'إطلاق منصة Mulhim IQ — التعليم الذكي يبدأ من هنا',
    details:
`🚀 إعلان الإطلاق الرسمي

اليوم، يسعدنا الإعلان عن الإطلاق الرسمي لمنصة Mulhim IQ — أول منصة عربية متكاملة لإدارة العملية التعليمية في العراق، مصمّمة خصيصاً لاحتياجات المعلمين والطلاب.

🎓 ما الذي تقدّمه المنصة؟

للمعلمين:
• نظام شامل لإدارة الكورسات والجدول الأسبوعي
• فواتير وأقساط ذكية + دفع إلكتروني عبر بوابة Wayl
• حضور لحظي بـ QR Code + تقارير تفصيلية
• إرسال واجبات وامتحانات وتقييمات للطلاب
• محفظة معلّم مع تقارير مالية أسبوعية وشهرية

للطلاب:
• تطبيق احترافي على iOS و Android
• اشعارات فورية لكل حصة وواجب وامتحان
• متابعة النتائج وتقارير الأداء
• دفع آمن للفواتير من داخل التطبيق

🌍 المنصة تغطّي حالياً 20 محافظة عراقية وتدعم كل المراحل الدراسية من الأول الابتدائي إلى السادس الإعدادي.

🎁 عرض خاص لأوّل 100 معلم:
• اشتراك مجاني لمدة 3 أشهر في الباقة الأساسية (بدلاً من الباقة المجانية المعتادة)
• دورة تأهيلية مباشرة لإعداد الحساب في 30 دقيقة
• أولوية الدعم الفني على مدار الساعة

📞 للاستفسار: support@mulhimiq.com
🌐 الموقع: https://mulhimiq.com

ابدأ رحلتك التعليمية اليوم — التسجيل مجاني تماماً.`,
    banner: {
      title: 'منصة Mulhim IQ',
      subtitle: 'التعليم الذكي يبدأ من هنا — للمعلمين والطلاب',
      accent: '#6EF2B4',
      channelLabel: 'WEB + MOBILE',
      channelIcon: '◰',
    },
  },
];

(async () => {
  // 1. Login as super admin
  const login = await http('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
  if (login.status !== 200 || !login.json?.data?.token) {
    console.error('Login failed:', login.status, login.json);
    process.exit(1);
  }
  const token = login.json.data.token;
  console.log(`✓ Logged in as ${EMAIL} (token: ${token.length} chars)\n`);

  // 2. POST each news
  for (const p of posts) {
    const svg = buildSvg(p.banner);
    const imageUrl = svgToDataUri(svg);
    const payload = {
      title: p.title,
      details: p.details,
      newsType: p.newsType,
      imageUrl,
    };
    const res = await http('POST', '/api/news', payload, token);
    if (res.status === 201 || res.json?.success) {
      console.log(`✓ [${p.newsType.padEnd(15)}] "${p.title}"`);
      console.log(`    id: ${res.json?.data?.id || res.json?.data?.news?.id || '?'}`);
      console.log(`    banner: ${(imageUrl.length / 1024).toFixed(1)} KB inline base64 SVG`);
    } else {
      console.error(`✗ [${p.newsType}] "${p.title}" — ${res.status}`);
      console.error(`    ${JSON.stringify(res.json).slice(0, 200)}`);
    }
    console.log();
  }

  // 3. Verify final state
  const list = await http('GET', '/api/news?limit=10', null, token);
  const items = list.json?.data?.data ?? list.json?.data ?? [];
  console.log(`\n📰 Final news count: ${items.length}`);
  items.forEach(n => {
    const t = n.newsType || n.news_type;
    const hasImg = !!(n.imageUrl || n.image_url);
    console.log(`   • [${t.padEnd(15)}] ${n.title}   ${hasImg ? '🖼️' : '⚠ no img'}`);
  });
})().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
