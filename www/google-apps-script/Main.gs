/**
 * ═══════════════════════════════════════════════════════════════
 * Zphysics — Main Entry Points (doGet & doPost Router)
 * ═══════════════════════════════════════════════════════════════
 */

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : '';
    
    // Thống kê số câu hỏi của mỗi Mã đề
    if (action === 'getStats') {
      return jsonResponse(getStats());
    }
    
    // Kiểm tra đăng nhập học sinh bằng Gmail
    if (action === 'checkStudent') {
      var gmail = (e && e.parameter && e.parameter.gmail) ? String(e.parameter.gmail).trim().toLowerCase() : '';
      return jsonResponse(checkStudent(gmail));
    }

    // Tự động đăng ký học sinh mới với tài khoản Free
    if (action === 'registerStudent') {
      var gmail = (e && e.parameter && e.parameter.gmail) ? String(e.parameter.gmail).trim().toLowerCase() : '';
      var name = (e && e.parameter && e.parameter.name) ? String(e.parameter.name).trim() : '';
      return jsonResponse(registerStudent(gmail, name));
    }
    
    // Lấy link bài học động từ Google Sheet
    if (action === 'getLinks') {
      return jsonResponse(getLinks());
    }
    
    // Lấy danh sách đề luyện VIP từ tab "LuyenDe"
    if (action === 'getExams') {
      return jsonResponse(getExams());
    }
    
    // Lấy đề thi (mặc định)
    var quiz = (e && e.parameter && e.parameter.quiz)
      ? String(e.parameter.quiz)
      : 'cauhoi';
    var data = getQuizData(quiz);
    return jsonResponse(data);
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
    // Nếu là tin nhắn từ Telegram Bot (học sinh nhắn lệnh)
    if (postData.message && postData.message.chat) {
      try {
        handleTelegramMessage(postData);
      } catch (teleErr) {
        Logger.log("Lỗi xử lý Telegram message: " + teleErr.message);
      }
      return HtmlService.createHtmlOutput("OK");
    }
    // Nếu là callback query (học sinh bấm nút A/B/C/D trong /cauhoi)
    if (postData.callback_query) {
      try {
        handleCallbackQuery(postData.callback_query);
      } catch (cbErr) {
        Logger.log("Lỗi xử lý Telegram callback: " + cbErr.message);
      }
      return HtmlService.createHtmlOutput("OK");
    }
    
    // ═══ ADMIN & UTILITY ACTIONS (từ admin.html & client) ═══
    var action = postData.action;
    var result;
    
    if (action === 'addQuestion') {
      result = addQuestion(postData.questionData);
    } else if (action === 'editQuestion') {
      result = editQuestion(postData.id, postData.maDe, postData.questionData);
    } else if (action === 'deleteQuestion') {
      result = deleteQuestion(postData.id, postData.maDe);
    } else if (action === 'sendReport') {
      var success = sendReportToTelegram(postData.message);
      return jsonResponse({ success: success });
    } else {
      throw new Error("Hành động không hợp lệ: " + action);
    }
    
    return jsonResponse({ success: true, data: result });
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
