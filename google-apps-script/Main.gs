/**
 * ═══════════════════════════════════════════════════════════════
 * Zphysics — Main Entry Points (doGet & doPost Router)
 * ═══════════════════════════════════════════════════════════════
 */

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : '';
    var adminSecret = (e && e.parameter && e.parameter.admin_secret) ? String(e.parameter.admin_secret).trim() : '';

    // Chỉ cho phép truy vấn thống kê khi có ADMIN_API_SECRET hợp lệ (>= 16 ký tự)
    if (action === 'getStats') {
      if (ADMIN_API_SECRET.length >= 16 && constantTimeEquals(adminSecret, ADMIN_API_SECRET)) {
        return jsonResponse(getStats());
      }
      return jsonResponse({ error: 'Unauthorized' });
    }

    // Đóng toàn bộ các endpoint đọc/ghi không xác thực (checkStudent, registerStudent, upgradePremium, getLinks, getExams, quiz)
    return jsonResponse({
      status: 'ok',
      message: 'Zphysics API is active (Protected)'
    });
  } catch (err) {
    return jsonResponse({ error: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    var postData;
    if (e && e.postData && e.postData.contents) {
      postData = JSON.parse(e.postData.contents);
    } else {
      throw new Error("Không tìm thấy dữ liệu POST");
    }

    // ═══ TELEGRAM WEBHOOK ═══
    if ((postData.message && postData.message.chat) || postData.callback_query) {
      var tgSecret = (e && e.parameter && e.parameter.tg_secret) ? String(e.parameter.tg_secret).trim() : '';
      if (TELEGRAM_WEBHOOK_SECRET.length > 0 && !constantTimeEquals(tgSecret, TELEGRAM_WEBHOOK_SECRET)) {
        Logger.log("Từ chối Telegram Webhook không hợp lệ.");
        return HtmlService.createHtmlOutput("Unauthorized");
      }

      if (postData.message && postData.message.chat) {
        try {
          handleTelegramMessage(postData);
        } catch (teleErr) {
          Logger.log("Lỗi xử lý Telegram message: " + teleErr.message);
        }
        return HtmlService.createHtmlOutput("OK");
      }

      if (postData.callback_query) {
        try {
          handleCallbackQuery(postData.callback_query);
        } catch (cbErr) {
          Logger.log("Lỗi xử lý Telegram callback: " + cbErr.message);
        }
        return HtmlService.createHtmlOutput("OK");
      }
    }

    var action = postData.action;

    // ═══ HỌC SINH TỰ NÂNG CẤP PREMIUM MIỄN PHÍ (BẮT BUỘC XÁC THỰC JWT GOOGLE/SUPABASE) ═══
    if (action === 'upgradePremium') {
      var verifiedUser = verifySupabaseAccessToken(postData.accessToken);
      if (!verifiedUser) {
        return jsonResponse({
          success: false,
          message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.'
        });
      }
      if (!checkRateLimit('upg_' + verifiedUser.email, 5, 60)) {
        return jsonResponse({
          success: false,
          message: 'Thao tác quá nhanh, vui lòng thử lại sau ít phút.'
        });
      }
      return jsonResponse(upgradePremium(verifiedUser.email, verifiedUser.name));
    }

    // ═══ GỬI BÁO CÁO KẾT QUẢ THI (BẮT BUỘC XÁC THỰC JWT) ═══
    if (action === 'sendReport') {
      var verifiedReporter = verifySupabaseAccessToken(postData.accessToken);
      if (!verifiedReporter) {
        return jsonResponse({ success: false, error: 'Unauthorized' });
      }
      if (!checkRateLimit('rep_' + verifiedReporter.email, 8, 60)) {
        return jsonResponse({ success: false, error: 'Rate limit exceeded' });
      }
      var rawMsg = String(postData.message || '').slice(0, 4000);
      if (!rawMsg.trim()) {
        return jsonResponse({ success: false, error: 'Empty report' });
      }
      var success = sendReportToTelegram(rawMsg);
      return jsonResponse({ success: success });
    }

    // ═══ ADMIN ACTIONS (BẮT BUỘC ADMIN_API_SECRET) ═══
    if (action === 'addQuestion' || action === 'editQuestion' || action === 'deleteQuestion') {
      var providedSecret = String(postData.adminSecret || '').trim();
      if (ADMIN_API_SECRET.length < 16 || !constantTimeEquals(providedSecret, ADMIN_API_SECRET)) {
        throw new Error("Unauthorized admin action");
      }
      var result;
      if (action === 'addQuestion') {
        result = addQuestion(postData.questionData);
      } else if (action === 'editQuestion') {
        result = editQuestion(postData.id, postData.maDe, postData.questionData);
      } else {
        result = deleteQuestion(postData.id, postData.maDe);
      }
      return jsonResponse({ success: true, data: result });
    }

    throw new Error("Hành động không hợp lệ: " + action);
  } catch (err) {
    Logger.log("Lỗi doPost: " + err.message);
    return HtmlService.createHtmlOutput("ERROR: " + err.message);
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
