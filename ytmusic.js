// =====================================================
//  YTMUSIC.JS — Search (yt-search) + Download (yt-dlp ke file)
// =====================================================
const fs = require("fs");
const path = require("path");
const yts = require("yt-search");
const youtubedl = require("youtube-dl-exec");

// Helper validasi URL
function isValidHttpUrl(str) {
  if (typeof str !== "string" || !str) return false;
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// ─── 1. Cari lagu di YouTube ──────────────────────────
async function searchYoutubeMusic(query, limit = 5) {
  const r = await yts(query);
  return r.videos.slice(0, limit).map((v) => ({
    id: v.videoId,
    title: v.title,
    artist: v.author.name,
    durationMs: v.seconds ? v.seconds * 1000 : null,
    cover: v.thumbnail,
    youtubeUrl: v.url,
  }));
}

// ─── 2. Unduh audio ke file via yt-dlp ────────────────
async function downloadAudioToFile(videoId, outputDir = path.join(__dirname, "tmp")) {
  if (!videoId) throw new Error("videoId kosong");

  // Pastikan folder output ada
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const filename = `audio_${videoId}_${Date.now()}.mp3`;
  const outputPath = path.join(outputDir, filename);

  try {
    // Jalankan yt-dlp untuk mengekstrak audio ke file MP3
    await youtubedl(url, {
      extractAudio: true,
      audioFormat: "mp3",
      audioQuality: "0",
      output: outputPath,
      noWarnings: true,
      noCallHome: true,
      noCheckCertificate: true,
      preferFreeFormats: true,
      youtubeSkipDashManifest: true,
      // Jika masih 403, uncomment baris cookies di bawah dan sesuaikan path-nya
      // cookies: "/data/data/com.termux/files/home/music-bot/cookies.txt",
    });

    // Verifikasi file benar-benar ada dan tidak kosong
    if (!fs.existsSync(outputPath)) {
      throw new Error("File audio tidak terbentuk setelah proses yt-dlp.");
    }

    const stats = fs.statSync(outputPath);
    if (stats.size < 1024) {
      throw new Error(`File audio terlalu kecil (${stats.size} bytes).`);
    }

    return { filePath: outputPath, size: stats.size, filename };
  } catch (err) {
    console.error("❌ yt-dlp download error:", err.message);
    if (fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch {}
    }
    throw new Error(`Gagal mengunduh audio via yt-dlp: ${err.message}`);
  }
}

module.exports = {
  searchYoutubeMusic,
  downloadAudioToFile,
  isValidHttpUrl,
};