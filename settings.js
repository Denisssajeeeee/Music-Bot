// =====================================================
//  SETTINGS.JS — Konfigurasi Bot Music
// =====================================================
module.exports = {
  // ─── 1. BOT ────────────────────────────────────────
  bot: {
    token: "8797673816:AAH6QM99Wf2NH4qCaNgnX8jcKUsvt_DdtTM",
    name: "Music Bot",
    version: "1.0.0",
  },

  // ─── 2. CREATOR / DEVELOPER ────────────────────────
  creator: {
    id: 123456789,                    // ⚠️ GANTI dengan ID Telegram Anda
    username: "@DennCode",
    name: "DennCode",
    contact: "https://t.me/DennCode",
  },

  // ─── 3. DEFAULT TAMPILAN ───────────────────────────
  defaults: {
    thumbnail: "https://c.termai.cc/i111/TUqdGPz.jpg",
    maxResults: 5,
    audioCaption: "🎵 *{title}*\n👤 {artist}\n\n🤖 @{botUsername}",
  },

  // ─── 4. YOUTUBE MUSIC ──────────────────────────────
  ytmusic: {
    timeout: 30000,
  },

  // ─── 5. REGISTRASI ─────────────────────────────────
  registration: {
    enabled: true,

    // Foto untuk prompt "/daftar" ke user
    photo: "https://c.termai.cc/i117/L1Iv.jpg",

    // Foto untuk notifikasi user baru ke channel log
    logPhoto: "https://c.termai.cc/i148/n7Rd15Z.jpg",

    // Channel yang wajib di-join sebelum daftar
    requiredChannels: [
      // {
      //   name: "Notification",
      //   url: "https://t.me/notifbotzz",
      //   chatId: "@notifbotzz",
      // },
    ],

    // Channel untuk notifikasi user baru
    logChannelId: "@notifbotzz",
  },

  // ─── 6. MENU /START ────────────────────────────────
  startMenu: {
    photo: "https://c.termai.cc/i111/TUqdGPz.jpg",
    caption: (botName, creator) =>
      `🎵 *Selamat datang di ${botName}!*\n\n` +
      `Bot musik publik — kirim judul lagu, pilih hasilnya,\n` +
      `dan audio langsung dikirim ke kamu. 🎧\n\n` +
      `📌 *Fitur:*\n` +
      `• Cari lagu via judul\n` +
      `• Konfirmasi sebelum kirim\n` +
      `• Kualitas audio terbaik\n\n` +
      `Mulai dengan kirim judul lagu favoritmu! 🎶\n\n` +
      `© ${botName} • by ${creator}`,
    buttons: {
      help: { text: "📖 Bantuan", callback: "menu_help" },
      creator: { text: "🙏 Tq To", callback: "menu_creator" },  // ← GANTI DISINI
    },
    developer: {
      text: "🔗 Developer",
      url: "https://t.me/DennCode",
    },
  },

  // ─── 7. PESAN BOT ──────────────────────────────────
  messages: {
    welcome: (botName, creator) =>
      `🎵 *Selamat datang di ${botName}!*\n\n` +
      `Kirim judul lagu yang ingin kamu cari.\n\n` +
      `👨‍💻 Creator: ${creator}`,
    help: (creator) =>
      `📖 *Cara pakai:*\n` +
      `1. Daftar dulu: \`/daftar NamaKamu\`\n` +
      `2. Kirim judul lagu (contoh: \`Shape of You\`).\n` +
      `3. Pilih lagu dari tombol yang muncul.\n` +
      `4. Bot akan mengirim audio.\n\n` +
      `👨‍💻 Creator: ${creator}`,
    searching: "🔍 Mencari lagu...",
    notFound: "❌ Lagu tidak ditemukan. Coba kata kunci lain.",

    // Foto untuk pesan "Pilih lagu yang benar"
    chooseSongPhoto: "https://c.termai.cc/i140/ftc9lQ.jpg",
    chooseSong: "🎵 *Pilih lagu yang benar:*",

    error: "⚠️ Terjadi kesalahan. Coba lagi nanti.",
    notCreator: "⛔ Hanya creator yang bisa memakai command ini.",
    expired: "⏳ Hasil pencarian kadaluarsa. Silakan cari ulang.",
  },

  // ─── 8. LIMITS / ANTI-SPAM ─────────────────────────
  limits: {
    maxRequestsPerMinute: 10,
    cooldownSeconds: 5,
  },

  // ─── 9. LOGGING ────────────────────────────────────
  logging: {
    level: "info",
  },
};