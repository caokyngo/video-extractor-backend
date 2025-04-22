// server_use_cookie.js - tối ưu để deploy trên Render
const express = require('express');
const puppeteer = require('puppeteer-extra');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 8080;

// CORS cho phép frontend từ bất kỳ nguồn nào (tùy chỉnh nếu cần)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// Serve file frontend từ thư mục public
app.use(express.static(path.join(__dirname, 'public')));

// API chính để lấy video .mp4
app.get('/api/get-video', async (req, res) => {
  const pageURL = req.query.url;
  if (!pageURL) return res.status(400).json({ error: 'Thiếu URL video' });

  try {
    const browser = await puppeteer.launch({
      headless: new,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

    const cookiePath = path.join(__dirname, 'cookies.json');
    if (fs.existsSync(cookiePath)) {
      const rawCookies = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
      const cookies = rawCookies.map(cookie => {
        if (cookie.sameSite && typeof cookie.sameSite !== 'string') delete cookie.sameSite;
        return cookie;
      });
      await page.setCookie(...cookies);
    }

    const mp4Urls = [];
    page.on('response', async (response) => {
      const url = response.url();
      const contentType = response.headers()['content-type'] || '';
      if (url.includes('.mp4') && url.includes('ahcdn') && contentType.includes('video')) {
        if (!mp4Urls.includes(url)) mp4Urls.push(url);
      }
    });

    await page.goto(pageURL, { waitUntil: 'networkidle2', timeout: 60000 });

    await page.evaluate(() => {
      const video = document.querySelector('video');
      if (video) {
        video.muted = true;
        video.play().catch(() => {});
      }
    });

    await new Promise(resolve => setTimeout(resolve, 12000));
    await browser.close();

    const highQuality = mp4Urls.find(url => url.includes('hq_'));
    const fallback = mp4Urls.find(url => !url.includes('hq_'));
    res.json({ videoUrl: highQuality || fallback || null });

  } catch (err) {
    console.error('❌ Lỗi server:', err);
    res.status(500).json({ error: 'Lỗi server', detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});
