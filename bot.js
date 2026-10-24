// =====================================================
//  BOT.JS — Telegram Music Bot + Registrasi + Foto (FIXED)
// =====================================================
const fs = require("fs");
const path = require("path");
const { Telegraf, Markup } = require("telegraf");
const { searchYoutubeMusic, downloadAudioToFile } = require("./ytmusic");
const settings = require("./settings");

// ─── Logger ────────────────────────────────────────────
const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);

// ─── Validasi Token ────────────────────────────────────
if (!settings.bot.token || settings.bot.token.includes("ISI_TOKEN")) {
  console.error("❌ BOT_TOKEN belum diisi di settings.js");
  process.exit(1);
}

// ─── Database JSON ─────────────────────────────────────
const DB_FILE = path.join(__dirname, "database.json");
let db = {
  thumbnail: settings.defaults.thumbnail,
  maintenance: false,
  users: {},
  stats: { searches: 0, plays: 0 },
};

if (fs.existsSync(DB_FILE)) {
  try {
    db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, "utf8")) };
    log("📂 Database dimuat.");
  } catch (e) {
    log("⚠️ Gagal load database:", e.message);
  }
}

const saveDb = () => {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    log("⚠️ Gagal simpan database:", e.message);
  }
};

// ─── Helper ────────────────────────────────────────────
const isCreator = (id) => id === settings.creator.id;

const trackUser = (ctx) => {
  const u = ctx.from;
  if (!u) return;
  if (!db.users[u.id]) {
    db.users[u.id] = {
      id: u.id,
      first_name: u.first_name,
      username: u.username,
      joined: Date.now(),
      registered: false,
    };
    saveDb();
  }
};

const searchCache = new Map();
const cooldowns = new Map();
const pendingRegistration = new Map();

// ─── Helper: kirim teks/foto dengan fallback ───────────
async function sendWithOptionalPhoto(ctx, photo, text, extraOpts = {}) {
  if (photo) {
    try {
      return await ctx.replyWithPhoto(photo, {
        caption: text,
        parse_mode: "Markdown",
        ...extraOpts,
      });
    } catch (e) {
      log("⚠️ replyWithPhoto gagal, fallback text:", e.message);
    }
  }
  return ctx.reply(text, { parse_mode: "Markdown", ...extraOpts });
}

// ─── Cek semua channel wajib ───────────────────────────
async function checkAllChannels(ctx, userId) {
  const channels = settings.registration?.requiredChannels || [];
  const notJoined = [];

  for (const ch of channels) {
    try {
      const member = await ctx.telegram.getChatMember(ch.chatId, userId);
      const ok = ["creator", "administrator", "member"].includes(member.status);
      if (!ok) notJoined.push(ch);
    } catch (e) {
      log(`⚠️ Gagal cek channel ${ch.chatId}: ${e.message}`);
      notJoined.push(ch);
    }
  }

  return notJoined;
}

// ─── Prompt registrasi ─────────────────────────────────
async function sendRegistrationPrompt(ctx) {
  if (ctx.callbackQuery) {
    return ctx
      .answerCbQuery("🔐 Silakan /daftar dulu", { show_alert: true })
      .catch(() => {});
  }

  return sendWithOptionalPhoto(
    ctx,
    settings.registration?.photo,
    `🔐 *Registrasi Diperlukan*\n\n` +
      `Sebelum menggunakan bot, kamu harus mendaftar dulu:\n\n` +
      `\`/daftar NamaKamu\`\n\n` +
      `Contoh: \`/daftar Budi Santoso\``
  ).catch(() => {});
}

// ─── Selesaikan registrasi ─────────────────────────────
async function completeRegistration(ctx, userId, name) {
  const user = ctx.from;
  const now = new Date();

  db.users[userId] = {
    ...db.users[userId],
    registered: true,
    registeredName: name,
    registeredAt: now.toISOString(),
  };
  saveDb();
  pendingRegistration.delete(userId);

  const dateStr = now.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

  await ctx
    .reply(
      `✅ *Registrasi berhasil!*\n\n` +
        `📛 Nama: *${name}*\n` +
        `📅 Tanggal: ${dateStr}\n\n` +
        `Sekarang kamu bisa pakai bot.\n` +
        `Kirim judul lagu untuk mulai! 🎵`,
      { parse_mode: "Markdown" }
    )
    .catch(() => {});

  // ─── Notif ke log channel (DENGAN FOTO) ────────────
  if (settings.registration.logChannelId) {
    try {
      const username = user.username
        ? `@${user.username}`
        : `(no username — ${user.first_name || "Unknown"})`;

      const logText =
        `🆕 *NEW USER TERDAFTAR*\n\n` +
        `👤 Username: ${username}\n` +
        `📛 Nama: ${name}\n` +
        `🆔 ID: \`${userId}\`\n` +
        `📅 Tanggal: ${dateStr}`;

      const logPhoto = settings.registration?.logPhoto;

      if (logPhoto) {
        try {
          await ctx.telegram.sendPhoto(
            settings.registration.logChannelId,
            logPhoto,
            { caption: logText, parse_mode: "Markdown" }
          );
        } catch (e) {
          log(`⚠️ sendPhoto log gagal, fallback text: ${e.message}`);
          await ctx.telegram.sendMessage(
            settings.registration.logChannelId,
            logText,
            { parse_mode: "Markdown" }
          );
        }
      } else {
        await ctx.telegram.sendMessage(
          settings.registration.logChannelId,
          logText,
          { parse_mode: "Markdown" }
        );
      }

      log(`📢 Notif user baru terkirim ke channel log.`);
    } catch (e) {
      log(`⚠️ Gagal kirim log ke channel: ${e.message}`);
    }
  }

  log(`✅ User terdaftar: ${name} (${userId})`);
}

// ─── Init Bot ──────────────────────────────────────────
const bot = new Telegraf(settings.bot.token);

bot.catch((err, ctx) => {
  log(`❌ Error [${ctx.updateType}]:`, err.message);
});

// ─── Middleware 1 ──────────────────────────────────────
bot.use(async (ctx, next) => {
  trackUser(ctx);
  if (db.maintenance && !isCreator(ctx.from?.id)) {
    return ctx.reply("🚧 Bot sedang maintenance. Coba lagi nanti.").catch(() => {});
  }
  return next();
});

// ─── Middleware 2: gate registrasi ─────────────────────
bot.use(async (ctx, next) => {
  if (!settings.registration?.enabled) return next();

  const userId = ctx.from?.id;
  if (!userId) return next();
  if (isCreator(userId)) return next();
  if (db.users[userId]?.registered) return next();

  const msgText = ctx.message?.text;
  if (msgText && msgText.startsWith("/")) return next();

  const allowed = ["check_join", "menu_help", "menu_creator"];
  if (ctx.callbackQuery?.data && allowed.includes(ctx.callbackQuery.data)) {
    return next();
  }

  return sendRegistrationPrompt(ctx);
});

// =====================================================
//  COMMANDS
// =====================================================

// ─── /start ────────────────────────────────────────────
bot.start(async (ctx) => {
  const menu = settings.startMenu;
  let caption = menu.caption(settings.bot.name, settings.creator.username);

  if (
    settings.registration?.enabled &&
    !db.users[ctx.from.id]?.registered &&
    !isCreator(ctx.from.id)
  ) {
    caption += `\n\n⚠️ *Kamu belum terdaftar.*\nKirim: \`/daftar NamaKamu\``;
  }

  const keyboard = [
    [
      Markup.button.callback(menu.buttons.help.text, menu.buttons.help.callback),
      Markup.button.callback(
        menu.buttons.creator.text,
        menu.buttons.creator.callback
      ),
    ],
    [Markup.button.url(menu.developer.text, menu.developer.url)],
  ];

  try {
    await ctx.replyWithPhoto(menu.photo, {
      caption,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard },
    });
  } catch (err) {
    log("⚠️ replyWithPhoto gagal, fallback text:", err.message);
    await ctx.reply(caption, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: keyboard },
    });
  }
});

// ─── /daftar ───────────────────────────────────────────
bot.command("daftar", async (ctx) => {
  if (!settings.registration?.enabled) {
    return ctx.reply("ℹ️ Bot tidak perlu registrasi. Langsung pakai! 🎵");
  }

  const userId = ctx.from.id;

  if (db.users[userId]?.registered) {
    return ctx.reply(
      `✅ Kamu sudah terdaftar sebagai *${db.users[userId].registeredName}*`,
      { parse_mode: "Markdown" }
    );
  }

  const args = ctx.message.text.replace(/^\/daftar\s*/i, "").trim();

  // FIX #2: pakai foto juga saat format daftar
  if (!args) {
    return sendWithOptionalPhoto(
      ctx,
      settings.registration?.photo,
      `📝 *Format daftar:*\n\n\`/daftar NamaKamu\`\n\nContoh:\n\`/daftar Budi Santoso\``
    );
  }

  if (args.length > 50) {
    return ctx.reply("❌ Nama terlalu panjang (maks 50 karakter).");
  }

  pendingRegistration.set(userId, args);

  const notJoined = await checkAllChannels(ctx, userId);

  if (notJoined.length > 0) {
    const channels = settings.registration.requiredChannels;
    const buttons = channels.map((ch) => [
      Markup.button.url(`📢 Join ${ch.name}`, ch.url),
    ]);
    buttons.push([
      Markup.button.callback("✅ Sudah join — Cek Lagi", "check_join"),
    ]);

    const caption =
      `🔐 *Registrasi — Join Channel Dulu*\n\n` +
      `Halo *${args}*! 👋\n\n` +
      `Sebelum daftar, wajib join channel berikut:\n\n` +
      channels.map((ch, i) => `${i + 1}. ${ch.name}`).join("\n") +
      `\n\nSetelah join semua, klik tombol *Cek Lagi*.`;

    return sendWithOptionalPhoto(
      ctx,
      settings.registration?.photo,
      caption,
      { reply_markup: { inline_keyboard: buttons } }
    );
  }

  await completeRegistration(ctx, userId, args);
});

// ─── Cek join ──────────────────────────────────────────
bot.action("check_join", async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = ctx.from.id;

  if (db.users[userId]?.registered) {
    return ctx
      .reply(
        `✅ Kamu sudah terdaftar sebagai *${db.users[userId].registeredName}*`,
        { parse_mode: "Markdown" }
      )
      .catch(() => {});
  }

  const pendingName = pendingRegistration.get(userId);
  if (!pendingName) {
    return ctx
      .reply(
        `⚠️ Sesi daftar kadaluarsa (bot mungkin restart).\n\nKirim ulang:\n\`/daftar NamaKamu\``,
        { parse_mode: "Markdown" }
      )
      .catch(() => {});
  }

  const notJoined = await checkAllChannels(ctx, userId);

  if (notJoined.length > 0) {
    const names = notJoined.map((c) => c.name).join(", ");
    return ctx
      .answerCbQuery(`❌ Belum join: ${names}`, { show_alert: true })
      .catch(() => {});
  }

  await ctx.deleteMessage().catch(() => {});
  await completeRegistration(ctx, userId, pendingName);
});

// ─── Menu callbacks ────────────────────────────────────
bot.action("menu_help", async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  await ctx
    .reply(settings.messages.help(settings.creator.username), {
      parse_mode: "Markdown",
    })
    .catch(() => {});
});

// ─── Tombol "Tq To" ────────────────────────────────────
bot.action("menu_creator", async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  await ctx
    .reply(
      `🙏 *Tq To*\n\n` +
        `Terima kasih kepada:\n` +
        `• *${settings.creator.name}* — Creator & Developer\n` +
        `• Semua pengguna yang telah menggunakan bot ini\n\n` +
        `━━━━━━━━━━━━━━━━━\n` +
        `👨‍💻 Creator: ${settings.creator.username}\n` +
        `🆔 ID: \`${settings.creator.id}\`\n` +
        `🔗 ${settings.creator.contact}`,
      { parse_mode: "Markdown" }
    )
    .catch(() => {});
});

// ─── /help ─────────────────────────────────────────────
bot.help((ctx) =>
  ctx
    .reply(settings.messages.help(settings.creator.username), {
      parse_mode: "Markdown",
    })
    .catch(() => {})
);

// ─── /creator ──────────────────────────────────────────
bot.command("creator", (ctx) =>
  ctx
    .reply(
      `🙏 *Tq To*\n\n` +
        `Terima kasih kepada:\n` +
        `• *${settings.creator.name}* — Creator & Developer\n` +
        `• Semua pengguna yang telah menggunakan bot ini\n\n` +
        `━━━━━━━━━━━━━━━━━\n` +
        `👨‍💻 Creator: ${settings.creator.username}\n` +
        `🆔 ID: \`${settings.creator.id}\`\n` +
        `🔗 ${settings.creator.contact}`,
      { parse_mode: "Markdown" }
    )
    .catch(() => {})
);

// ─── /setthumb & /setpp ────────────────────────────────
const setThumbHandler = async (ctx) => {
  if (!isCreator(ctx.from.id)) return ctx.reply(settings.messages.notCreator);
  const replied = ctx.message.reply_to_message;
  if (!replied?.photo) {
    return ctx.reply("Reply ke sebuah foto untuk dijadikan thumbnail default.");
  }
  db.thumbnail = replied.photo[replied.photo.length - 1].file_id;
  saveDb();
  await ctx.reply("✅ Thumbnail default berhasil diubah.");
};
bot.command("setthumb", setThumbHandler);
bot.command("setpp", setThumbHandler);

// ─── /maintenance ──────────────────────────────────────
bot.command("maintenance", async (ctx) => {
  if (!isCreator(ctx.from.id)) return ctx.reply(settings.messages.notCreator);
  db.maintenance = !db.maintenance;
  saveDb();
  await ctx.reply(`🔧 Maintenance: *${db.maintenance ? "ON" : "OFF"}*`, {
    parse_mode: "Markdown",
  });
});

// ─── /stats ────────────────────────────────────────────
bot.command("stats", async (ctx) => {
  if (!isCreator(ctx.from.id)) return ctx.reply(settings.messages.notCreator);
  const uptime = process.uptime();
  const h = Math.floor(uptime / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  const s = Math.floor(uptime % 60);
  const totalUsers = Object.keys(db.users).length;
  const registeredUsers = Object.values(db.users).filter(
    (u) => u.registered
  ).length;

  await ctx.reply(
    `📊 *Stats Bot*\n\n` +
      `👥 Total users: *${totalUsers}*\n` +
      `✅ Terdaftar: *${registeredUsers}*\n` +
      `🔍 Total searches: *${db.stats.searches}*\n` +
      `🎵 Total plays: *${db.stats.plays}*\n` +
      `⏱ Uptime: *${h}j ${m}m ${s}s*\n` +
      `🚧 Maintenance: *${db.maintenance ? "ON" : "OFF"}*`,
    { parse_mode: "Markdown" }
  );
});

// ─── /broadcast ────────────────────────────────────────
bot.command("broadcast", async (ctx) => {
  if (!isCreator(ctx.from.id)) return ctx.reply(settings.messages.notCreator);
  const text = ctx.message.text.replace(/^\/broadcast\s*/, "").trim();
  if (!text)
    return ctx.reply("Usage: `/broadcast <text>`", { parse_mode: "Markdown" });

  const ids = Object.keys(db.users).filter((id) => db.users[id].registered);
  await ctx.reply(`📢 Broadcast ke ${ids.length} user terdaftar...`);

  let ok = 0;
  let fail = 0;
  for (const id of ids) {
    try {
      await ctx.telegram.sendMessage(id, text);
      ok++;
    } catch {
      fail++;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  await ctx.reply(`✅ Sukses: ${ok}\n❌ Gagal: ${fail}`);
});

// =====================================================
//  SEARCH HANDLER (dengan foto "pilih lagu")
// =====================================================
bot.on("text", async (ctx, next) => {
  const text = ctx.message.text.trim();
  if (!text || text.startsWith("/")) return next();

  const uid = ctx.from.id;
  const now = Date.now();
  const cd = settings.limits.cooldownSeconds * 1000;
  const last = cooldowns.get(uid) || 0;
  if (now - last < cd) {
    const wait = Math.ceil((cd - (now - last)) / 1000);
    return ctx.reply(`⏳ Tunggu ${wait} detik lagi.`);
  }
  cooldowns.set(uid, now);

  const status = await ctx.reply(settings.messages.searching);

  try {
    const tracks = await searchYoutubeMusic(text, settings.defaults.maxResults);

    if (!tracks.length) {
      return ctx.telegram.editMessageText(
        ctx.chat.id,
        status.message_id,
        null,
        settings.messages.notFound
      );
    }

    const buttons = tracks.map((t) => {
      searchCache.set(t.id, t);
      const dur = t.durationMs
        ? ` [${Math.floor(t.durationMs / 60000)}:${String(
            Math.floor((t.durationMs % 60000) / 1000)
          ).padStart(2, "0")}]`
        : "";
      const label = `${t.title.slice(0, 40)} — ${t.artist.slice(0, 18)}${dur}`;
      return [Markup.button.callback(label, `play:${t.id}`)];
    });

    if (searchCache.size > 500) {
      const firstKey = searchCache.keys().next().value;
      searchCache.delete(firstKey);
    }

    db.stats.searches++;
    saveDb();

    // Hapus pesan "🔍 Mencari lagu..."
    await ctx.telegram
      .deleteMessage(ctx.chat.id, status.message_id)
      .catch(() => {});

    // FIX #1: ambil dari messages.chooseSongPhoto (BUKAN startMenu.searchPhoto)
    const searchPhoto = settings.messages?.chooseSongPhoto;

    if (searchPhoto) {
      try {
        await ctx.replyWithPhoto(searchPhoto, {
          caption: settings.messages.chooseSong,
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: buttons },
        });
      } catch (e) {
        log("⚠️ replyWithPhoto search gagal, fallback text:", e.message);
        await ctx.reply(settings.messages.chooseSong, {
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: buttons },
        });
      }
    } else {
      await ctx.reply(settings.messages.chooseSong, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: buttons },
      });
    }
  } catch (err) {
    log("🔍 Search error:", err.message);
    await ctx.telegram
      .editMessageText(
        ctx.chat.id,
        status.message_id,
        null,
        `⚠️ Gagal mencari lagu.\n\`${String(err.message).slice(0, 80)}\``,
        { parse_mode: "Markdown" }
      )
      .catch(() => {});
  }
});

// =====================================================
//  CALLBACK PLAY
// =====================================================
bot.action(/^play:(.+)$/, async (ctx) => {
  const videoId = ctx.match[1];
  const cached = searchCache.get(videoId);

  if (!cached) {
    return ctx.answerCbQuery(settings.messages.expired, { show_alert: true });
  }

  await ctx.answerCbQuery("⏳ Mengunduh audio...");

  const title = cached.title;
  const artist = cached.artist;
  const cover = cached.cover || db.thumbnail;
  let downloadedFile = null;

  try {
    log(`🎧 Memulai unduhan: ${title} — ${artist} (Video ID: ${videoId})`);

    const result = await downloadAudioToFile(videoId);
    downloadedFile = result.filePath;
    log(
      `✅ File terunduh: ${result.filePath} (${(
        result.size /
        1024 /
        1024
      ).toFixed(2)} MB)`
    );

    const finalTitle = (cached.title || "Unknown").slice(0, 64);
    const finalArtist = (cached.artist || "Unknown").slice(0, 64);
    const safeFilename = `${finalTitle
      .replace(/[\\/:*?"<>|]/g, "_")
      .slice(0, 50)}.mp3`;

    const caption = settings.defaults.audioCaption
      .replace("{title}", finalTitle)
      .replace("{artist}", finalArtist)
      .replace("{botUsername}", ctx.botInfo.username);

    await ctx.replyWithAudio(
      { source: fs.createReadStream(downloadedFile), filename: safeFilename },
      {
        title: finalTitle,
        performer: finalArtist,
        duration: cached.durationMs
          ? Math.round(cached.durationMs / 1000)
          : undefined,
        thumbnail: cover,
        caption,
        parse_mode: "Markdown",
      }
    );

    db.stats.plays++;
    saveDb();
    log(`✅ Audio terkirim: ${finalTitle}`);
  } catch (err) {
    log(`❌ Play error [${err.code || "unknown"}]: ${err.message}`);

    let userMsg = "⚠️ Gagal mengirim audio.";
    const msg = String(err.message).toLowerCase();

    if (msg.includes("403")) {
      userMsg = "⏱ YouTube menolak akses (403). Coba lagi nanti.";
    } else if (msg.includes("429") || msg.includes("rate")) {
      userMsg = "🚦 Terlalu banyak permintaan. Tunggu sebentar.";
    } else if (msg.includes("timeout") || err.code === "ECONNABORTED") {
      userMsg = "⏱ Unduhan timeout. Coba lagi.";
    } else if (msg.includes("sign in") || msg.includes("bot")) {
      userMsg = "🤖 YouTube mendeteksi bot. Hubungi admin.";
    } else if (msg.includes("unavailable") || msg.includes("private")) {
      userMsg = "🚫 Video tidak tersedia / private.";
    }

    await ctx
      .reply(`${userMsg}\n\`${String(err.message).slice(0, 90)}\``, {
        parse_mode: "Markdown",
      })
      .catch(() => {});
  } finally {
    if (downloadedFile && fs.existsSync(downloadedFile)) {
      try {
        fs.unlinkSync(downloadedFile);
        log(`🧹 File sementara dihapus`);
      } catch (e) {
        log(`⚠️ Gagal hapus file sementara: ${e.message}`);
      }
    }
  }
});

// =====================================================
//  LAUNCH
// =====================================================
(async () => {
  try {
    await bot.launch();
    log(`✅ ${settings.bot.name} v${settings.bot.version} berjalan...`);
    log(`👨‍💻 Creator: ${settings.creator.username} (${settings.creator.id})`);
    log(
      `📝 Registrasi: ${settings.registration?.enabled ? "AKTIF" : "NONAKTIF"}`
    );
    if (settings.registration?.photo) {
      log(`🖼️ Foto /daftar: ${settings.registration.photo.slice(0, 60)}...`);
    }
    if (settings.registration?.logPhoto) {
      log(
        `🖼️ Foto notif user baru: ${settings.registration.logPhoto.slice(
          0,
          60
        )}...`
      );
    }
    if (settings.messages?.chooseSongPhoto) {
      log(
        `🖼️ Foto pilih lagu: ${settings.messages.chooseSongPhoto.slice(0, 60)}...`
      );
    }
    if (settings.registration?.requiredChannels?.length) {
      log(
        `📢 Channel wajib: ${settings.registration.requiredChannels
          .map((c) => c.name)
          .join(", ")}`
      );
    }
    if (settings.registration?.logChannelId) {
      log(`📋 Log channel: ${settings.registration.logChannelId}`);
    }
  } catch (e) {
    log("❌ Gagal menjalankan bot:", e.message);
    process.exit(1);
  }
})();

// ─── Graceful shutdown ─────────────────────────────────
process.once("SIGINT", () => {
  log("🛑 SIGINT — stopping...");
  bot.stop("SIGINT");
});
process.once("SIGTERM", () => {
  log("🛑 SIGTERM — stopping...");
  bot.stop("SIGTERM");
});
process.on("unhandledRejection", (reason) =>
  log("⚠️ UnhandledRejection:", reason)
);
process.on("uncaughtException", (err) =>
  log("⚠️ UncaughtException:", err.message)
);