/**
 * ═══════════════════════════════════════════════════════════════
 * Zphysics — Telegram Bot & Email Notifications Engine
 * ═══════════════════════════════════════════════════════════════
 */

// Quét deadlines và gửi email & tin nhắn Telegram nhắc nhở
function checkAndSendReminders() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Lấy danh sách học sinh (Gmail -> {Tên, Telegram Chat ID})
  var hocsinhSheet = ss.getSheetByName('hocsinh') || ss.getSheets().find(s => s.getName().toLowerCase() === 'hocsinh');
  if (!hocsinhSheet) {
    Logger.log("Không tìm thấy trang tính 'hocsinh'");
    return;
  }
  var hsValues = hocsinhSheet.getDataRange().getValues();
  var studentMap = {};
  Logger.log("Đang đọc danh sách học sinh...");
  for (var r = 1; r < hsValues.length; r++) {
    var gmail = trimCell(hsValues[r][0]).toLowerCase();
    var name = trimCell(hsValues[r][1]);
    var telegramId = hsValues[r][5] ? trimCell(hsValues[r][5]) : '';
    if (gmail) {
      studentMap[gmail] = { name: name, telegramId: telegramId };
    }
  }
  Logger.log("Tìm thấy " + Object.keys(studentMap).length + " học sinh trong sheet.");
  
  // 2. Lấy danh sách hạn nộp từ sheet deadlines
  var deadlinesSheet = ss.getSheetByName('deadlines') || ss.getSheets().find(s => s.getName().toLowerCase() === 'deadlines');
  if (!deadlinesSheet) {
    Logger.log("Không tìm thấy trang tính 'deadlines'");
    return;
  }
  
  var range = deadlinesSheet.getDataRange();
  var deadlineValues = range.getValues();
  var now = new Date().getTime();
  
  Logger.log("Tổng số dòng trong sheet deadlines: " + deadlineValues.length);
  
  for (var r = 1; r < deadlineValues.length; r++) {
    var gmail = trimCell(deadlineValues[r][0]).toLowerCase();
    var lessonId = trimCell(deadlineValues[r][1]);
    var deadlineVal = deadlineValues[r][2];
    var sentStatus = deadlineValues[r][3] ? trimCell(deadlineValues[r][3]) : '';
    
    Logger.log("Đang quét dòng " + (r + 1) + ": Gmail=" + gmail + ", LessonID=" + lessonId + ", Deadline=" + deadlineVal + ", SentStatus=" + sentStatus);
    
    if (!gmail || !lessonId || !deadlineVal) {
      Logger.log("-> Bỏ qua dòng vì thiếu thông tin Gmail, Lesson ID hoặc Deadline");
      continue;
    }
    
    // Parse ngày giờ deadline
    var deadlineTime;
    if (deadlineVal instanceof Date) {
      deadlineTime = deadlineVal.getTime();
    } else {
      deadlineTime = Date.parse(deadlineVal);
    }
    if (isNaN(deadlineTime)) {
      Logger.log("-> Bỏ qua vì không thể chuyển đổi ngày giờ hết hạn: " + deadlineVal);
      continue;
    }
    
    // Kiểm tra thời gian hiện tại so với deadline
    var diffHours = (deadlineTime - now) / (1000 * 60 * 60);
    Logger.log("-> Cách hạn nộp: " + diffHours.toFixed(2) + " giờ");
    
    // Xác định xem cần nhắc nhở mốc nào
    var targetRemindText = ""; 
    var newSentStatus = "";
    
    if (diffHours > 2 && diffHours <= 24) {
      // Mốc 24 giờ trước hạn
      if (sentStatus.indexOf("24h") !== -1 || sentStatus.indexOf("2h") !== -1 || sentStatus.indexOf("1h") !== -1) {
        Logger.log("-> Đã gửi nhắc nhở mốc 24h (hoặc mốc khẩn cấp hơn) rồi. Bỏ qua.");
        continue;
      }
      targetRemindText = "24 giờ";
      newSentStatus = "Đã gửi 24h";
    } else if (diffHours > 1 && diffHours <= 2) {
      // Mốc 2 giờ trước hạn
      if (sentStatus.indexOf("2h") !== -1 || sentStatus.indexOf("1h") !== -1) {
        Logger.log("-> Đã gửi nhắc nhở mốc 2h (hoặc 1h) rồi. Bỏ qua.");
        continue;
      }
      targetRemindText = "2 giờ";
      var prefix = sentStatus.indexOf("24h") !== -1 ? "Đã gửi 24h & " : "Đã gửi ";
      newSentStatus = prefix + "2h";
    } else if (diffHours > 0 && diffHours <= 1) {
      // Mốc 1 giờ trước hạn
      if (sentStatus.indexOf("1h") !== -1) {
        Logger.log("-> Đã gửi nhắc nhở mốc 1h rồi. Bỏ qua.");
        continue;
      }
      targetRemindText = "1 giờ";
      var prefix = "";
      if (sentStatus.indexOf("24h") !== -1 && sentStatus.indexOf("2h") !== -1) {
        prefix = "Đã gửi 24h, 2h & ";
      } else if (sentStatus.indexOf("24h") !== -1) {
        prefix = "Đã gửi 24h & ";
      } else if (sentStatus.indexOf("2h") !== -1) {
        prefix = "Đã gửi 2h & ";
      } else {
        prefix = "Đã gửi ";
      }
      newSentStatus = prefix + "1h";
    } else {
      Logger.log("-> Bỏ qua vì không nằm trong các khoảng thời gian cần nhắc nhở (24h, 2h, 1h).");
      continue;
    }
    
    // 3. Kiểm tra xem học sinh đã nộp bài (có điểm) trên Supabase chưa
    var completed = false;
    try {
      var progress = supabaseRequest('student_progress?email=eq.' + encodeURIComponent(gmail) + '&lesson_id=eq.' + encodeURIComponent(lessonId) + '&select=score', 'GET');
      Logger.log("-> Kiểm tra Supabase cho " + gmail + ", bài " + lessonId + ". Kết quả: " + JSON.stringify(progress));
      if (progress && progress.length > 0) {
        if (progress[0].score !== null) {
          completed = true;
        }
      }
    } catch (e) {
      Logger.log("Lỗi khi kiểm tra tiến trình học tập của " + gmail + ": " + e.message);
    }
    
    if (completed) {
      Logger.log("-> Học sinh đã nộp bài này rồi (đã có điểm trên Supabase).");
      continue;
    }
    
    // Nếu học sinh chưa hoàn thành bài tập, tiến hành gửi thông báo
    Logger.log("-> Bắt đầu tiến trình gửi thông báo mốc [" + targetRemindText + "] cho " + gmail);
    var student = studentMap[gmail] || { name: "Học sinh", telegramId: "" };
    var title = getLessonTitle(lessonId);
    var formattedDeadline = Utilities.formatDate(new Date(deadlineTime), "GMT+7", "dd/MM/yyyy HH:mm");
    
    // Tạo đường link truy cập trực tiếp
    var link = WEB_APP_URL + (lessonId.indexOf('de_') !== -1 ? '/l.html#' + lessonId : '/q.html?quiz=' + lessonId);
    
    // --- 3.1. GỬI TIN NHẮN TELEGRAM BOT ---
    var teleSuccess = false;
    if (student.telegramId && TELEGRAM_BOT_TOKEN) {
      try {
        var msg = "⏰ <b>NHẮC HẠN NỘP BÀI TẬP (CÒN " + targetRemindText.toUpperCase() + ")</b>\n\n" +
                  "Chào <b>" + student.name + "</b>,\n" +
                  "Chỉ còn <b>" + targetRemindText + "</b> nữa là hết hạn nộp bài tập <b>" + title + "</b> (Hạn chót: <b>" + formattedDeadline + "</b>).\n" +
                  "Hiện tại hệ thống ghi nhận em vẫn chưa hoàn thành bài này. Em hãy tranh thủ làm sớm nhé!\n\n" +
                  "🔗 <b>Link làm bài:</b> <a href=\"" + link + "\">Nhấn vào đây để làm bài</a>";
        
        msg = cleanLatexForTelegram(msg);
        var payload = {
          'chat_id': student.telegramId,
          'text': msg,
          'parse_mode': 'HTML'
        };
        
        var response = UrlFetchApp.fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
          'method': 'post',
          'contentType': 'application/json',
          'payload': JSON.stringify(payload),
          'muteHttpExceptions': true
        });
        
        if (response.getResponseCode() === 200) {
          teleSuccess = true;
          Logger.log("-> Gửi Telegram nhắc nhở thành công đến: " + gmail);
        } else {
          Logger.log("-> Lỗi gửi Telegram: " + response.getContentText());
        }
      } catch (teleErr) {
        Logger.log("-> Lỗi kết nối Telegram API: " + teleErr.message);
      }
    } else {
      Logger.log("-> Bỏ qua gửi Telegram vì không tìm thấy Telegram Chat ID của học sinh hoặc thiếu Token.");
    }
    
    // --- 3.2. GỬI EMAIL ---
    var emailSuccess = false;
    try {
      var emailSubject = "⏰ [Zphysics] Nhắc nhở hạn nộp bài tập: " + title + " (Còn " + targetRemindText + ")";
      var emailBody = "Chào " + student.name + ",\n\n" +
                      "Hệ thống Zphysics xin thông báo chỉ còn " + targetRemindText + " nữa là đến hạn nộp bài tập của em:\n" +
                      "- Tên bài học/đề thi: " + title + "\n" +
                      "- Hạn nộp bài: " + formattedDeadline + "\n\n" +
                      "Hiện tại hệ thống ghi nhận em chưa làm bài tập này. Vui lòng truy cập đường link dưới đây để hoàn thiện bài sớm nhé:\n" +
                      link + "\n\n" +
                      "Chúc em học tập thật tốt!\n" +
                      "Zphysics Team";
      
      MailApp.sendEmail(gmail, emailSubject, emailBody);
      emailSuccess = true;
      Logger.log("-> Gửi Gmail nhắc nhở thành công đến: " + gmail);
    } catch (mailErr) {
      Logger.log("-> Lỗi gửi Gmail: " + mailErr.message);
    }
    
    // 4. Lưu trạng thái đã gửi nhắc nhở lên Sheet tránh gửi trùng lặp ở lần quét sau
    if (teleSuccess || emailSuccess) {
      var statusDetail = newSentStatus + " lúc " + Utilities.formatDate(new Date(), "GMT+7", "HH:mm dd/MM");
      deadlinesSheet.getRange(r + 1, 4).setValue(statusDetail); 
      Logger.log("-> Đã cập nhật trạng thái gửi [" + statusDetail + "] vào Cột D.");
    }
  }
  Logger.log("Quét hoàn tất!");
}

// --- Hàm tiện ích gửi tin nhắn Telegram ---
function sendTelegramMessage(chatId, text) {
  text = cleanLatexForTelegram(text);
  var payload = {
    'chat_id': chatId,
    'text': text,
    'parse_mode': 'HTML'
  };
  UrlFetchApp.fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
    'method': 'post',
    'contentType': 'application/json',
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  });
}

// --- Gửi tin nhắn kèm Inline Keyboard (các nút bấm) ---
function sendTelegramMessageWithKeyboard(chatId, text, keyboard) {
  text = cleanLatexForTelegram(text);
  var payload = {
    'chat_id': chatId,
    'text': text,
    'parse_mode': 'HTML',
    'reply_markup': JSON.stringify({ 'inline_keyboard': keyboard })
  };
  UrlFetchApp.fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
    'method': 'post',
    'contentType': 'application/json',
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  });
}

// --- Chuẩn hóa LaTeX hiển thị đẹp hơn trên Telegram Bot ---
function cleanLatexForTelegram(text) {
  if (!text) return text;
  text = String(text);
  
  // Bỏ dấu $ bao quanh công thức
  text = text.replace(/\$/g, '');
  
  // Thay thế \text{...}
  text = text.replace(/\\text\{([^}]+)\}/g, '$1');
  
  // Ký tự Hy Lạp
  text = text.replace(/\\pi/g, '\u03C0');
  text = text.replace(/\\omega/g, '\u03C9');
  text = text.replace(/\\varphi/g, '\u03C6');
  text = text.replace(/\\phi/g, '\u03C6');
  text = text.replace(/\\alpha/g, '\u03B1');
  text = text.replace(/\\beta/g, '\u03B2');
  text = text.replace(/\\gamma/g, '\u03B3');
  text = text.replace(/\\Delta/g, '\u0394');
  text = text.replace(/\\lambda/g, '\u03BB');
  text = text.replace(/\\mu/g, '\u03BC');
  text = text.replace(/\\rho/g, '\u03C1');
  
  // Lượng giác
  text = text.replace(/\\cos/g, 'cos');
  text = text.replace(/\\sin/g, 'sin');
  text = text.replace(/\\tan/g, 'tan');
  text = text.replace(/\\cot/g, 'cot');
  
  // Ký hiệu đặc biệt
  text = text.replace(/\\circ/g, '\u00B0');
  text = text.replace(/\^circ/g, '\u00B0');
  text = text.replace(/\^2/g, '\u00B2');
  text = text.replace(/\^3/g, '\u00B3');
  text = text.replace(/\\pm/g, '\u00B1');
  text = text.replace(/\\approx/g, '\u2248');
  text = text.replace(/\\neq/g, '\u2260');
  text = text.replace(/\\le/g, '\u2264');
  text = text.replace(/\\ge/g, '\u2265');
  text = text.replace(/\\cdot/g, '\u00B7');
  text = text.replace(/\\times/g, '\u00D7');
  
  // Thêm: Căn bậc hai \sqrt{...}
  text = text.replace(/\\sqrt\{([^}]+)\}/g, '\u221A($1)');
  
  // Thêm: Các dấu mũi tên
  text = text.replace(/\\Rightarrow/g, '\u21D2');
  text = text.replace(/\\Leftarrow/g, '\u21D0');
  text = text.replace(/\\rightarrow/g, '\u2192');
  text = text.replace(/\\lefttarrow/g, '\u2190');
  text = text.replace(/\\leftrightarrow/g, '\u2194');
  
  // Thêm: Toán tử giới hạn
  text = text.replace(/\\max/g, 'max');
  text = text.replace(/\\min/g, 'min');
  text = text.replace(/\\ln/g, 'ln');
  text = text.replace(/\\log/g, 'log');
  
  // Phân số đơn giản \frac{a}{b} -> a/b
  text = text.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)');
  
  // Thêm: Rút gọn subscript / superscript dạng móc nhọn
  text = text.replace(/_\{([^}]+)\}/g, '_$1');
  text = text.replace(/\^\{([^}]+)\}/g, '^$1');
  
  // Xóa các ký tự lướt backslash thừa để tránh hiển thị xấu
  text = text.replace(/\\/g, '');
  
  return text;
}

// --- Router chính: phân luồng lệnh từ tin nhắn ---
function handleTelegramMessage(update) {
  var message = update.message;
  var chatId = message.chat.id;
  var text = (message.text || '').trim();
  
  // Trích lệnh (bỏ @botname nếu có)
  var command = text.split(' ')[0].toLowerCase();
  if (command.indexOf('@') !== -1) {
    command = command.split('@')[0];
  }
  
  switch (command) {
    case '/start':
    case '/menu':
      handleMenu(chatId);
      break;
    case '/diem':
      handleDiem(chatId);
      break;
    case '/tiendo':
      handleTienDo(chatId);
      break;
    case '/deadline':
      handleDeadline(chatId);
      break;
    case '/cauhoi':
      handleCauHoi(chatId);
      break;
    case '/tatnhan':
      handleToggleNotification(chatId, false);
      break;
    case '/batnhan':
      handleToggleNotification(chatId, true);
      break;
    default:
      sendTelegramMessage(chatId, 
        "❓ Mình không hiểu lệnh <b>\"" + text + "\"</b>.\n\n" +
        "Gửi /menu để xem danh sách lệnh nhé!");
      break;
  }
}

// ═══════════════════════════════════════════════════════════════
// LỆNH /menu — Hiển thị danh sách lệnh
// ═══════════════════════════════════════════════════════════════
function handleMenu(chatId) {
  var msg = "🤖 <b>ZPHYSICS BOT — TRỢ LÝ HỌC TẬP</b>\n\n" +
    "📊 /diem — Xem bảng điểm cá nhân\n" +
    "📚 /tiendo — Xem tiến độ học tập theo chương\n" +
    "📅 /deadline — Xem hạn nộp bài sắp tới\n" +
    "🧪 /cauhoi — Thử thách nhanh (3 câu/ngày)\n" +
    "🔕 /tatnhan — Hủy đăng ký thử thách mỗi sáng\n" +
    "🔔 /batnhan — Bật nhận thử thách mỗi sáng\n" +
    "📋 /menu — Hiển thị menu này\n\n" +
    "Chọn một lệnh để bắt đầu nhé! 🚀";
  sendTelegramMessage(chatId, msg);
}

// ═══════════════════════════════════════════════════════════════
// LỆNH /diem — Xem bảng điểm cá nhân
// ═══════════════════════════════════════════════════════════════
function handleDiem(chatId) {
  var student = findStudentByChatId(chatId);
  if (!student) {
    sendTelegramMessage(chatId, "❌ Không tìm thấy thông tin của bạn.\nTelegram Chat ID của bạn là: <code>" + chatId + "</code>\n\nVui lòng sao chép ID này và điền vào <b>Cột F (Telegram ID)</b> của sheet <b>hocsinh</b> nhé!");
    return;
  }
  
  try {
    var progress = supabaseRequest(
      'student_progress?email=eq.' + encodeURIComponent(student.email) +
      '&score=not.is.null&select=lesson_id,score', 'GET'
    );
    
    if (!progress || progress.length === 0) {
      sendTelegramMessage(chatId, 
        "📊 Chào <b>" + student.name + "</b>!\n\n" +
        "Hiện tại em chưa có kết quả bài tập nào.\nHãy bắt đầu làm bài trên Zphysics nhé! 💪");
      return;
    }
    
    var totalAttempts = progress.length;
    
    // Nhóm theo bài (lesson_id) và chỉ lấy điểm cao nhất
    var bestScores = {};
    for (var i = 0; i < progress.length; i++) {
      var item = progress[i];
      var lid = item.lesson_id;
      var scoreVal = parseFloat(item.score);
      if (isNaN(scoreVal)) continue;
      
      if (bestScores[lid] === undefined || scoreVal > bestScores[lid]) {
        bestScores[lid] = scoreVal;
      }
    }
    
    var totalScore = 0;
    var count = 0;
    for (var lid in bestScores) {
      totalScore += bestScores[lid];
      count++;
    }
    
    var avg = count > 0 ? (totalScore / count).toFixed(1) : "0.0";
    var emoji = parseFloat(avg) >= 8 ? "🟢" : (parseFloat(avg) >= 5 ? "🟡" : "🔴");
    
    var msg = "📊 <b>THỐNG KÊ HỌC TẬP</b>\n";
    msg += "👤 <b>" + student.name + "</b>\n\n";
    msg += "📝 Số bài đã làm: <b>" + totalAttempts + " bài</b>\n";
    msg += emoji + " Điểm trung bình: <b>" + avg + "/10</b>\n";
    
    sendTelegramMessage(chatId, msg);
  } catch (e) {
    sendTelegramMessage(chatId, "⚠️ Có lỗi xảy ra khi truy vấn dữ liệu. Vui lòng thử lại sau.");
    Logger.log("Lỗi handleDiem: " + e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// LỆNH /tiendo — Xem tiến độ học tập theo chương
// ═══════════════════════════════════════════════════════════════
function handleTienDo(chatId) {
  var student = findStudentByChatId(chatId);
  if (!student) {
    sendTelegramMessage(chatId, "❌ Không tìm thấy thông tin của bạn.\nTelegram Chat ID của bạn là: <code>" + chatId + "</code>\n\nVui lòng sao chép ID này và điền vào <b>Cột F (Telegram ID)</b> của sheet <b>hocsinh</b> nhé!");
    return;
  }
  
  var grade = student.grade;
  if (!grade || grade === "undefined" || grade === "0") {
    sendTelegramMessage(chatId, "⚠️ Chưa có thông tin lớp của em.\nVui lòng liên hệ giáo viên để cập nhật Cột C (Lớp) trong sheet hocsinh.");
    return;
  }
  
  try {
    // Lấy tất cả lesson_id đã làm từ Supabase
    var progress = supabaseRequest(
      'student_progress?email=eq.' + encodeURIComponent(student.email) +
      '&score=not.is.null&select=lesson_id', 'GET'
    );
    // Chuẩn hóa lesson_id thành dạng bài: VD baitap_12_c1_b03 → 12_c1_b03
    var completedBaiSet = {};
    if (progress) {
      for (var i = 0; i < progress.length; i++) {
        var lid = progress[i].lesson_id;
        var baiKey = extractBaiKey(lid);
        if (baiKey) completedBaiSet[baiKey] = true;
      }
    }
    
    // Quét các tab sheet để tìm tất cả bài thuộc lớp
    // Nhóm theo bài (b0X) chứ không theo từng mã đề riêng lẻ
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheets = ss.getSheets();
    var chapterMap = {}; // { "c1": { baiIds: {} } }
    
    for (var s = 0; s < sheets.length; s++) {
      var sheetName = sheets[s].getName().toLowerCase();
      if (sheetName === 'hocsinh' || sheetName === 'deadlines' || sheetName === 'gamification' || sheetName === 'luyende' || sheetName === 'linkbaihoc') continue;
      
      var values = sheets[s].getDataRange().getValues();
      if (values.length <= HEADER_ROW) continue;
      
      for (var r = HEADER_ROW; r < values.length; r++) {
        var made = trimCell(values[r][COL.MADE]);
        if (!made) continue;
        
        var baiKey = extractBaiKey(made);
        if (!baiKey) continue;
        
        var parts = baiKey.split('_');
        if (parts.length >= 3 && parts[0] === grade) {
          var chapter = parts[1]; // "c1", "c2"...
          if (!chapterMap[chapter]) {
            chapterMap[chapter] = { baiIds: {} };
          }
          // Nhóm theo bài: VD 12_c1_b03 (bất kể cauhoi/đs/tln)
          chapterMap[chapter].baiIds[baiKey] = true;
        }
      }
    }
    
    // Đếm số bài đã hoàn thành theo chương
    var totalAll = 0;
    var completedAll = 0;
    var chapters = Object.keys(chapterMap).sort();
    
    if (chapters.length === 0) {
      sendTelegramMessage(chatId, "📚 Chưa có dữ liệu bài tập nào cho lớp " + grade + ".");
      return;
    }
    
    var msg = "📚 <b>TIẾN ĐỘ HỌC TẬP — LỚP " + grade + "</b>\n";
    msg += "👤 <b>" + student.name + "</b>\n\n";
    
    for (var c = 0; c < chapters.length; c++) {
      var ch = chapters[c];
      var baiIds = Object.keys(chapterMap[ch].baiIds);
      var done = 0;
      for (var j = 0; j < baiIds.length; j++) {
        if (completedBaiSet[baiIds[j]]) done++;
      }
      totalAll += baiIds.length;
      completedAll += done;
      
      var pct = baiIds.length > 0 ? Math.round(done / baiIds.length * 100) : 0;
      var filled = Math.round(pct / 10);
      var bar = "";
      for (var b = 0; b < 10; b++) {
        bar += b < filled ? "█" : "░";
      }
      
      var chNum = ch.toUpperCase().replace('C', '');
      msg += "<b>Chương " + chNum + ":</b>\n";
      msg += bar + " " + pct + "% (" + done + "/" + baiIds.length + " bài)\n\n";
    }
    
    var totalPct = totalAll > 0 ? Math.round(completedAll / totalAll * 100) : 0;
    msg += "🏆 <b>Tổng tiến độ: " + totalPct + "% (" + completedAll + "/" + totalAll + " bài)</b>";
    
    sendTelegramMessage(chatId, msg);
  } catch (e) {
    sendTelegramMessage(chatId, "⚠️ Có lỗi xảy ra. Vui lòng thử lại sau.");
    Logger.log("Lỗi handleTienDo: " + e.message);
  }
}

// Trích xuất khóa bài từ lesson_id hoặc made:
// VD: baitap_12_c1_b03 → 12_c1_b03
function extractBaiKey(id) {
  if (!id) return null;
  var parts = id.split('_');
  if (parts.length >= 4) {
    return parts.slice(1).join('_'); // VD: 12_c1_b03
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// LỆNH /deadline — Xem hạn nộp bài sắp tới
// ═══════════════════════════════════════════════════════════════
function handleDeadline(chatId) {
  var student = findStudentByChatId(chatId);
  if (!student) {
    sendTelegramMessage(chatId, "❌ Không tìm thấy thông tin của bạn.\nTelegram Chat ID của bạn là: <code>" + chatId + "</code>\n\nVui lòng sao chép ID này và điền vào <b>Cột E (Telegram ID)</b> của sheet <b>hocsinh</b> nhé!");
    return;
  }
  
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var deadlinesSheet = ss.getSheetByName('deadlines');
    if (!deadlinesSheet) {
      sendTelegramMessage(chatId, "📅 Hiện tại chưa có lịch nộp bài nào.");
      return;
    }
    
    var values = deadlinesSheet.getDataRange().getValues();
    var now = new Date().getTime();
    var deadlines = [];
    
    for (var r = 1; r < values.length; r++) {
      var email = trimCell(values[r][0]).toLowerCase();
      if (email !== student.email) continue;
      
      var lessonId = trimCell(values[r][1]);
      var deadlineVal = values[r][2];
      var deadlineTime;
      if (deadlineVal instanceof Date) {
        deadlineTime = deadlineVal.getTime();
      } else {
        deadlineTime = Date.parse(deadlineVal);
      }
      if (isNaN(deadlineTime) || deadlineTime < now) continue;
      
      deadlines.push({ lessonId: lessonId, deadline: deadlineTime });
    }
    
    if (deadlines.length === 0) {
      sendTelegramMessage(chatId, 
        "📅 Chào <b>" + student.name + "</b>!\n\n" +
        "Hiện tại không có bài tập nào sắp đến hạn. Tuyệt vời! 🎉");
      return;
    }
    
    // Sắp xếp theo hạn gần nhất
    deadlines.sort(function(a, b) { return a.deadline - b.deadline; });
    
    // Kiểm tra bài nào đã làm
    var progress = supabaseRequest(
      'student_progress?email=eq.' + encodeURIComponent(student.email) +
      '&score=not.is.null&select=lesson_id,score', 'GET'
    );
    var completedMap = {};
    if (progress) {
      for (var i = 0; i < progress.length; i++) {
        completedMap[progress[i].lesson_id] = progress[i].score;
      }
    }
    
    var msg = "📅 <b>BÀI TẬP SẮP ĐẾN HẠN</b>\n";
    msg += "👤 <b>" + student.name + "</b>\n\n";
    var chuaLam = 0;
    
    for (var i = 0; i < deadlines.length; i++) {
      var dl = deadlines[i];
      var title = getLessonTitle(dl.lessonId);
      var formattedDate = Utilities.formatDate(new Date(dl.deadline), "GMT+7", "dd/MM/yyyy HH:mm");
      var diffMs = dl.deadline - now;
      var diffH = Math.floor(diffMs / (1000 * 60 * 60));
      var diffM = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      
      var timeLeft = "";
      if (diffH >= 24) {
        timeLeft = "Còn " + Math.floor(diffH / 24) + " ngày " + (diffH % 24) + " giờ";
      } else {
        timeLeft = "Còn " + diffH + " giờ " + diffM + " phút";
      }
      
      var isCompleted = completedMap.hasOwnProperty(dl.lessonId);
      
      if (isCompleted) {
        msg += (i + 1) + ". ✅ " + title + "\n";
        msg += "   ⏰ " + formattedDate + "\n";
        msg += "   📝 Đã làm — <b>" + completedMap[dl.lessonId] + "/10</b> điểm\n\n";
      } else {
        chuaLam++;
        var urgentEmoji = diffH < 2 ? "🚨" : (diffH < 24 ? "⚠️" : "📌");
        msg += (i + 1) + ". " + urgentEmoji + " " + title + "\n";
        msg += "   ⏰ <b>" + timeLeft + "</b> (" + formattedDate + ")\n";
        msg += "   📝 Chưa làm\n\n";
      }
    }
    
    msg += "📊 <b>Tổng: " + chuaLam + " bài chưa làm / " + deadlines.length + " bài</b>";
    sendTelegramMessage(chatId, msg);
  } catch (e) {
    sendTelegramMessage(chatId, "⚠️ Có lỗi xảy ra. Vui lòng thử lại sau.");
    Logger.log("Lỗi handleDeadline: " + e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// LỆNH /cauhoi — Thử thách nhanh (3 câu/ngày)
// ═══════════════════════════════════════════════════════════════
function handleCauHoi(chatId) {
  var student = findStudentByChatId(chatId);
  if (!student) {
    sendTelegramMessage(chatId, "❌ Không tìm thấy thông tin của bạn.\nTelegram Chat ID của bạn là: <code>" + chatId + "</code>\n\nVui lòng sao chép ID này và điền vào <b>Cột E (Telegram ID)</b> của sheet <b>hocsinh</b> nhé!");
    return;
  }
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Tạo sheet gamification nếu chưa có
  var gameSheet = ss.getSheetByName('gamification');
  if (!gameSheet) {
    gameSheet = ss.insertSheet('gamification');
    gameSheet.getRange(1, 1, 1, 7).setValues([
      ['Email', 'Current Streak', 'Max Streak', 'Total Points', 'Last Active Date', 'Daily Questions', 'Last Question Date']
    ]);
    gameSheet.setFrozenRows(1);
  }
  
  var gameValues = gameSheet.getDataRange().getValues();
  var playerRow = -1;
  var today = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
  
  for (var r = 1; r < gameValues.length; r++) {
    if (trimCell(gameValues[r][0]).toLowerCase() === student.email) {
      playerRow = r + 1; // 1-indexed cho getRange
      break;
    }
  }
  
  // Kiểm tra giới hạn 3 câu/ngày
  var dailyCount = 0;
  if (playerRow > 0) {
    var rawDate = gameValues[playerRow - 1][6];
    var lastQDate = (rawDate instanceof Date) ? Utilities.formatDate(rawDate, "GMT+7", "yyyy-MM-dd") : trimCell(rawDate).toString();
    if (lastQDate === today) {
      dailyCount = parseInt(gameValues[playerRow - 1][5]) || 0;
    }
  }
  
  if (dailyCount >= 3) {
    var pts = playerRow > 0 ? (parseInt(gameValues[playerRow - 1][3]) || 0) : 0;
    var streak = playerRow > 0 ? (parseInt(gameValues[playerRow - 1][1]) || 0) : 0;
    sendTelegramMessage(chatId, 
      "🧪 Bạn đã hoàn thành <b>3/3 câu hỏi</b> hôm nay rồi!\n\n" +
      "⭐ Điểm tích lũy: <b>" + pts + "</b>\n" +
      "🔥 Chuỗi ngày: <b>" + streak + " ngày</b>\n\n" +
      "Quay lại ngày mai để tiếp tục thử thách nhé! 💪");
    return;
  }
  
  try {
    // Lấy tiến trình học tập của học sinh từ Supabase để giới hạn bài bốc câu hỏi
    var progress = supabaseRequest(
      'student_progress?email=eq.' + encodeURIComponent(student.email) +
      '&score=not.is.null&select=lesson_id', 'GET'
    );
    
    var maxLessonMap = {};
    if (progress) {
      for (var i = 0; i < progress.length; i++) {
        var key = extractBaiKey(progress[i].lesson_id);
        if (key) {
          var keyParts = key.split('_');
          if (keyParts.length >= 3) {
            var ch = keyParts[1]; // "c1"
            var bNum = parseInt(keyParts[2].replace(/[bB]/g, ''), 10);
            if (!isNaN(bNum)) {
              if (!maxLessonMap[ch] || bNum > maxLessonMap[ch]) {
                maxLessonMap[ch] = bNum;
              }
            }
          }
        }
      }
    }
    
    var grade = student.grade || "12";
    var allQuestions = [];
    
    try {
      // Truy vấn trực tiếp từ Supabase để tối ưu tốc độ phản hồi (tránh đọc Google Sheets quá chậm)
      var supabaseQuestions = supabaseRequest('questions?made=like.cauhoi_' + grade + '_*&select=*', 'GET');
      if (supabaseQuestions) {
        for (var i = 0; i < supabaseQuestions.length; i++) {
          var q = supabaseQuestions[i];
          var parts = q.made.split('_');
          if (parts.length < 4) continue;
          
          var ch = parts[2]; // "c1"
          var bNum = parseInt(parts[3].replace(/[bB]/g, ''), 10);
          if (isNaN(bNum)) continue;
          
          var maxAllowed = maxLessonMap[ch] || 0;
          if (Object.keys(maxLessonMap).length === 0 && ch === 'c1') {
            maxAllowed = 1;
          }
          
          if (bNum <= maxAllowed) {
            var correct = String(q.correct).toUpperCase();
            if (q.question && q.a && q.b && q.c && q.d && (correct === 'A' || correct === 'B' || correct === 'C' || correct === 'D')) {
              allQuestions.push({
                made: q.made,
                qid: q.question_id,
                question: q.question,
                a: q.a,
                b: q.b,
                c: q.c,
                d: q.d,
                correct: correct
              });
            }
          }
        }
      }
    } catch (err) {
      Logger.log("Lỗi tải câu hỏi từ Supabase: " + err.message);
    }
    
    if (allQuestions.length === 0) {
      sendTelegramMessage(chatId, "⚠️ Không tìm thấy câu hỏi nào cho lớp " + grade + ".");
      return;
    }
    
    // Chọn ngẫu nhiên
    var idx = Math.floor(Math.random() * allQuestions.length);
    var q = allQuestions[idx];
    
    var questionText = "🧪 <b>THỬ THÁCH VẬT LÍ</b> (" + (dailyCount + 1) + "/3 hôm nay)\n\n" +
                       q.question + "\n\n" +
                       "<b>A.</b> " + q.a + "\n" +
                       "<b>B.</b> " + q.b + "\n" +
                       "<b>C.</b> " + q.c + "\n" +
                       "<b>D.</b> " + q.d;
    
    // Callback data: q|ChosenAnswer|CorrectAnswer|Made|QuestionID
    var cbBase = q.correct + "|" + q.made + "|" + q.qid;
    var keyboard = [[
      { text: "🅰️ A", callback_data: "q|A|" + cbBase },
      { text: "🅱️ B", callback_data: "q|B|" + cbBase },
      { text: "©️ C", callback_data: "q|C|" + cbBase },
      { text: "🅳 D", callback_data: "q|D|" + cbBase }
    ]];
    
    sendTelegramMessageWithKeyboard(chatId, questionText, keyboard);
    
    // Cập nhật số câu hỏi trong ngày
    if (playerRow > 0) {
      gameSheet.getRange(playerRow, 6).setValue(dailyCount + 1);
      gameSheet.getRange(playerRow, 7).setValue(today);
    } else {
      gameSheet.appendRow([student.email, 0, 0, 0, '', 1, today]);
    }
    
  } catch (e) {
    sendTelegramMessage(chatId, "⚠️ Có lỗi xảy ra. Vui lòng thử lại sau.");
    Logger.log("Lỗi handleCauHoi: " + e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// XỬ LÝ CALLBACK QUERY — Khi học sinh bấm nút A/B/C/D
// ═══════════════════════════════════════════════════════════════
function handleCallbackQuery(callbackQuery) {
  var chatId = callbackQuery.message.chat.id;
  var messageId = callbackQuery.message.message_id;
  var data = callbackQuery.data;
  var callbackId = callbackQuery.id;
  
  // Xóa trạng thái loading trên nút
  UrlFetchApp.fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/answerCallbackQuery', {
    'method': 'post',
    'contentType': 'application/json',
    'payload': JSON.stringify({ 'callback_query_id': callbackId }),
    'muteHttpExceptions': true
  });
  
  // Xử lý nút "Câu tiếp theo"
  if (data === 'next_q') {
    handleCauHoi(chatId);
    return;
  }
  
  // Parse: q|Chosen|Correct|Made|QuestionID
  var parts = data.split('|');
  if (parts[0] !== 'q' || parts.length < 5) return;
  
  var chosen = parts[1];
  var correct = parts[2];
  var made = parts[3];
  var questionId = parts[4];
  var isCorrect = (chosen === correct);
  
  // Tìm lời giải thích từ Supabase để tối ưu tốc độ phản hồi (tránh đọc Google Sheets quá chậm)
  var explanation = "";
  try {
    var qData = supabaseRequest('questions?made=eq.' + encodeURIComponent(made) + '&question_id=eq.' + questionId + '&select=explanation', 'GET');
    if (qData && qData.length > 0) {
      explanation = trimCell(qData[0].explanation);
    }
  } catch (e) {
    Logger.log("Lỗi tra explanation từ Supabase: " + e.message);
  }
  
  // Cập nhật điểm gamification
  var student = findStudentByChatId(chatId);
  var pointsEarned = 0;
  var totalPoints = 0;
  var currentStreak = 0;
  
  if (student) {
    if (isCorrect) {
      pointsEarned = 10;
      totalPoints = updateGamePoints(student.email, pointsEarned);
    }
    currentStreak = updateStreak(student.email);
  }
  
  // Xóa keyboard khỏi tin nhắn cũ
  UrlFetchApp.fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/editMessageReplyMarkup', {
    'method': 'post',
    'contentType': 'application/json',
    'payload': JSON.stringify({
      'chat_id': chatId,
      'message_id': messageId,
      'reply_markup': JSON.stringify({ 'inline_keyboard': [] })
    }),
    'muteHttpExceptions': true
  });
  
  // Gửi kết quả
  var resultMsg = "";
  if (isCorrect) {
    resultMsg = "✅ <b>CHÍNH XÁC!</b> Đáp án <b>" + correct + "</b> 🎉\n\n";
    if (pointsEarned > 0) {
      resultMsg += "+" + pointsEarned + " điểm ⭐ (Tổng: <b>" + totalPoints + "</b> điểm)\n";
    }
  } else {
    resultMsg = "❌ <b>SAI RỒI!</b>\nBạn chọn <b>" + chosen + "</b>, đáp án đúng là <b>" + correct + "</b>\n\n";
  }
  
  if (currentStreak > 0) {
    resultMsg += "🔥 Chuỗi học: <b>" + currentStreak + " ngày</b>\n\n";
  }
  
  if (explanation) {
    resultMsg += "📖 <b>Giải thích:</b>\n" + explanation;
  }
  
  var nextKeyboard = [[
    { text: "Câu tiếp theo ➡️", callback_data: "next_q" }
  ]];
  
  sendTelegramMessageWithKeyboard(chatId, resultMsg, nextKeyboard);
}

// GAMIFICATION — Cập nhật điểm tích lũy
function updateGamePoints(email, points) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var gameSheet = ss.getSheetByName('gamification');
  if (!gameSheet) return 0;
  
  var values = gameSheet.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    if (trimCell(values[r][0]).toLowerCase() === email) {
      var currentPoints = parseInt(values[r][3]) || 0;
      var newPoints = currentPoints + points;
      gameSheet.getRange(r + 1, 4).setValue(newPoints);
      return newPoints;
    }
  }
  return points;
}

// GAMIFICATION — Cập nhật chuỗi ngày học & kiểm tra huy hiệu
function updateStreak(email) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var gameSheet = ss.getSheetByName('gamification');
  if (!gameSheet) return 0;
  
  var today = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
  var yesterdayDate = new Date(new Date().getTime() - 86400000);
  var yesterday = Utilities.formatDate(yesterdayDate, "GMT+7", "yyyy-MM-dd");
  
  var values = gameSheet.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    if (trimCell(values[r][0]).toLowerCase() !== email) continue;
    
    var lastActive = trimCell(values[r][4]).toString();
    if (lastActive === today) {
      return parseInt(values[r][1]) || 0;
    }
    
    var currentStreak = parseInt(values[r][1]) || 0;
    var maxStreak = parseInt(values[r][2]) || 0;
    
    if (lastActive === yesterday) {
      currentStreak++;
    } else {
      currentStreak = 1;
    }
    
    if (currentStreak > maxStreak) maxStreak = currentStreak;
    
    gameSheet.getRange(r + 1, 2).setValue(currentStreak);
    gameSheet.getRange(r + 1, 3).setValue(maxStreak);
    gameSheet.getRange(r + 1, 5).setValue(today);
    
    checkBadgeMilestone(email, currentStreak);
    
    return currentStreak;
  }
  return 0;
}

// GAMIFICATION — Gửi thông báo huy hiệu khi đạt mốc
function checkBadgeMilestone(email, streak) {
  var milestones = [
    { days: 3,  badge: "🌱", name: "Người mới bắt đầu" },
    { days: 7,  badge: "⚔️", name: "Chiến binh kiên trì" },
    { days: 14, badge: "⭐", name: "Ngôi sao đang lên" },
    { days: 30, badge: "👑", name: "Huyền thoại" }
  ];
  
  var milestone = null;
  for (var i = 0; i < milestones.length; i++) {
    if (streak === milestones[i].days) {
      milestone = milestones[i];
      break;
    }
  }
  if (!milestone) return;
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hsSheet = ss.getSheetByName('hocsinh');
  if (!hsSheet) return;
  
  var values = hsSheet.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    if (trimCell(values[r][0]).toLowerCase() === email) {
      var chatId = trimCell(values[r][5]);
      var name = trimCell(values[r][1]);
      if (chatId) {
        var msg = "🎉 <b>CHÚC MỪNG " + name.toUpperCase() + "!</b>\n\n" +
                  "🔥 Chuỗi <b>" + streak + " ngày</b> học liên tục!\n\n" +
                  milestone.badge + " Bạn đã nhận huy hiệu:\n" +
                  "<b>\"" + milestone.name + "\"</b>\n\n" +
                  "Tiếp tục giữ vững phong độ nhé! 💪";
        sendTelegramMessage(chatId, msg);
      }
      return;
    }
  }
}

// THIẾT LẬP WEBHOOK — Chạy 1 lần duy nhất để kết nối Bot ↔ Apps Script
function setTelegramWebhook() {
  var webAppUrl = "https://script.google.com/macros/s/AKfycbzxnkAXTX9lMgdq854Nm8CAWiaULzHD7MAo4Er7XBVnmfxhubWP4KWSF5_yNfVaCKXMdQ/exec";
  
  var url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/setWebhook?url=" + encodeURIComponent(webAppUrl) + "&drop_pending_updates=true";
  var res = UrlFetchApp.fetch(url);
  Logger.log("Kết quả đăng ký Webhook: " + res.getContentText());
}

// GỬI CÂU HỎI HÀNG NGÀY TỰ ĐỘNG (Trình kích hoạt mỗi 9h sáng)
function sendDailyQuestions() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hocsinhSheet = ss.getSheetByName('hocsinh') || ss.getSheets().find(s => s.getName().toLowerCase() === 'hocsinh');
  
  if (!hocsinhSheet) {
    Logger.log("Không tìm thấy trang tính 'hocsinh'");
    return;
  }
  
  var gameSheet = ss.getSheetByName('gamification');
  var unsubscribedEmails = {};
  if (gameSheet) {
    var gameValues = gameSheet.getDataRange().getValues();
    for (var r = 1; r < gameValues.length; r++) {
      var email = trimCell(gameValues[r][0]).toLowerCase();
      var subVal = gameValues[r][7] ? trimCell(gameValues[r][7]).toString().toUpperCase() : '';
      if (subVal === 'FALSE') {
        unsubscribedEmails[email] = true;
      }
    }
  }
  
  var hsValues = hocsinhSheet.getDataRange().getValues();
  var count = 0;
  
  for (var r = 1; r < hsValues.length; r++) {
    var email = trimCell(hsValues[r][0]).toLowerCase();
    var telegramId = hsValues[r][5] ? trimCell(hsValues[r][5]).toString() : '';
    
    if (telegramId && telegramId !== '' && !unsubscribedEmails[email]) {
      try {
        handleCauHoi(telegramId);
        count++;
        Utilities.sleep(100);
      } catch (e) {
        Logger.log("Lỗi gửi câu hỏi hàng ngày cho " + telegramId + ": " + e.message);
      }
    }
  }
  
  Logger.log("Đã gửi câu hỏi hàng ngày cho " + count + " học sinh.");
}

// HỦY / ĐĂNG KÝ NHẬN TIN NHẮN HÀNG NGÀY
function handleToggleNotification(chatId, isSubscribe) {
  var student = findStudentByChatId(chatId);
  if (!student) {
    sendTelegramMessage(chatId, "❌ Không tìm thấy thông tin của bạn.\nVui lòng cập nhật Telegram ID trong sheet hocsinh trước.");
    return;
  }
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var gameSheet = ss.getSheetByName('gamification');
  if (!gameSheet) {
    gameSheet = ss.insertSheet('gamification');
    gameSheet.getRange(1, 1, 1, 8).setValues([
      ['Email', 'Current Streak', 'Max Streak', 'Total Points', 'Last Active Date', 'Daily Questions', 'Last Question Date', 'Daily Subscribed']
    ]);
    gameSheet.setFrozenRows(1);
  }
  
  var headers = gameSheet.getRange(1, 1, 1, 8).getValues()[0];
  if (!headers[7] || headers[7] !== 'Daily Subscribed') {
    gameSheet.getRange(1, 8).setValue('Daily Subscribed');
  }
  
  var gameValues = gameSheet.getDataRange().getValues();
  var playerRow = -1;
  for (var r = 1; r < gameValues.length; r++) {
    if (trimCell(gameValues[r][0]).toLowerCase() === student.email) {
      playerRow = r + 1;
      break;
    }
  }
  
  var valToWrite = isSubscribe ? "TRUE" : "FALSE";
  if (playerRow > 0) {
    gameSheet.getRange(playerRow, 8).setValue(valToWrite);
  } else {
    gameSheet.appendRow([student.email, 0, 0, 0, '', 0, '', valToWrite]);
  }
  
  if (isSubscribe) {
    sendTelegramMessage(chatId, "🔔 <b>ĐÃ BẬT NHẬN TIN NHẮN</b>\n\nBạn sẽ nhận được thử thách Vật Lí hàng ngày vào lúc 9h sáng. Chúc bạn học tốt! 💪");
  } else {
    sendTelegramMessage(chatId, "🔕 <b>ĐÃ TẮT NHẬN TIN NHẮN</b>\n\nBạn đã hủy đăng ký nhận thử thách hàng ngày. Bạn vẫn có thể chủ động làm bài bằng lệnh /cauhoi bất cứ lúc nào!");
  }
}

// ── GỬI BÁO CÁO KẾT QUẢ THI / LUYỆN TẬP VỀ TELEGRAM CHO GIÁO VIÊN ──
function sendReportToTelegram(message) {
  var adminChatId = PropertiesService.getScriptProperties().getProperty('TELEGRAM_ADMIN_CHAT_ID');
  if (!adminChatId) {
    Logger.log("Lỗi: Chưa cấu hình TELEGRAM_ADMIN_CHAT_ID trong Script Properties.");
    return false;
  }
  try {
    sendTelegramMessage(adminChatId, message);
    return true;
  } catch (e) {
    Logger.log("Lỗi khi gửi báo cáo kết quả thi qua Telegram: " + e.message);
    return false;
  }
}
