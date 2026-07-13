$f = "c:\Users\Zanh\Downloads\Zphysics\www\google-apps-script\QuizAPI.gs"
$c = [IO.File]::ReadAllText($f)

# 1. Update cleanLatexForTelegram function
$old_latex = @'
function cleanLatexForTelegram(text) {
  if (!text) return text;
  text = String(text);
  
  // Bo dau $ bao quanh cong thuc
  text = text.replace(/\$/g, '');
  
  // Thay the \text{...}
  text = text.replace(/\\text\{([^}]+)\}/g, '$1');
  
  // Ky tu Hy Lap
  text = text.replace(/\\pi/g, 'π');
  text = text.replace(/\\omega/g, 'ω');
  text = text.replace(/\\varphi/g, 'φ');
  text = text.replace(/\\phi/g, 'φ');
  text = text.replace(/\\alpha/g, 'α');
  text = text.replace(/\\beta/g, 'β');
  text = text.replace(/\\gamma/g, 'γ');
  text = text.replace(/\\Delta/g, 'Δ');
  text = text.replace(/\\lambda/g, 'λ');
  text = text.replace(/\\mu/g, 'μ');
  text = text.replace(/\\rho/g, 'ρ');
  
  // Luong giac
  text = text.replace(/\\cos/g, 'cos');
  text = text.replace(/\\sin/g, 'sin');
  text = text.replace(/\\tan/g, 'tan');
  text = text.replace(/\\cot/g, 'cot');
  
  // Ky hieu dac biet
  text = text.replace(/\\circ/g, '°');
  text = text.replace(/\^circ/g, '°');
  text = text.replace(/\^2/g, '²');
  text = text.replace(/\^3/g, '³');
  text = text.replace(/\\pm/g, '±');
  text = text.replace(/\\approx/g, '≈');
  text = text.replace(/\\neq/g, '≠');
  text = text.replace(/\\le/g, '≤');
  text = text.replace(/\\ge/g, '≥');
  text = text.replace(/\\cdot/g, '·');
  text = text.replace(/\\times/g, '×');
  
  // Phan so don gian \frac{a}{b} -> a/b
  text = text.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)');
  
  return text;
}
'@

$new_latex = @'
function cleanLatexForTelegram(text) {
  if (!text) return text;
  text = String(text);
  
  // Bo dau $ bao quanh cong thuc
  text = text.replace(/\$/g, '');
  
  // Thay the \text{...}
  text = text.replace(/\\text\{([^}]+)\}/g, '$1');
  
  // Ky tu Hy Lap
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
  
  // Luong giac
  text = text.replace(/\\cos/g, 'cos');
  text = text.replace(/\\sin/g, 'sin');
  text = text.replace(/\\tan/g, 'tan');
  text = text.replace(/\\cot/g, 'cot');
  
  // Ky hieu dac biet
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
  
  // Them: Can bac hai \sqrt{...}
  text = text.replace(/\\sqrt\{([^}]+)\}/g, '\u221A($1)');
  
  // Them: Cac dau mui ten
  text = text.replace(/\\Rightarrow/g, '\u21D2');
  text = text.replace(/\\Leftarrow/g, '\u21D0');
  text = text.replace(/\\rightarrow/g, '\u2192');
  text = text.replace(/\\leftarrow/g, '\u2190');
  text = text.replace(/\\leftrightarrow/g, '\u2194');
  
  // Them: Toan tu gioi han
  text = text.replace(/\\max/g, 'max');
  text = text.replace(/\\min/g, 'min');
  text = text.replace(/\\ln/g, 'ln');
  text = text.replace(/\\log/g, 'log');
  
  // Phan so don gian \frac{a}{b} -> a/b
  text = text.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)');
  
  // Them: Rut gon subscript / superscript dang moc nhon
  text = text.replace(/_\{([^}]+)\}/g, '_$1');
  text = text.replace(/\^\{([^}]+)\}/g, '^$1');
  
  // Xoa cac ky tu luot backslash thua de tranh hien thi xau
  text = text.replace(/\\/g, '');
  
  return text;
}
'@

# 2. Update handleTelegramMessage switch case
$old_router = @'
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
    default:
      sendTelegramMessage(chatId, 
        "❓ Mình không hiểu lệnh \"" + text + "\".\n\n" +
        "Gửi /menu để xem danh sách lệnh nhé!");
      break;
  }
'@

$new_router = @'
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
        "❓ Mình không hiểu lệnh \"" + text + "\".\n\n" +
        "Gửi /menu để xem danh sách lệnh nhé!");
      break;
  }
'@

# 3. Update handleMenu
$old_menu = @'
function handleMenu(chatId) {
  var msg = "🤖 <b>ZPHYSICS BOT — TRỢ LÝ HỌC TẬP</b>\n\n" +
    "📊 /diem — Xem bảng điểm cá nhân\n" +
    "📚 /tiendo — Xem tiến độ học tập theo chương\n" +
    "📅 /deadline — Xem hạn nộp bài sắp tới\n" +
    "🧪 /cauhoi — Thử thách nhanh (3 câu/ngày)\n" +
    "📋 /menu — Hiển thị menu này\n\n" +
    "Chọn một lệnh để bắt đầu nhé! 🚀";
  sendTelegramMessage(chatId, msg);
}
'@

$new_menu = @'
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
'@

# 4. Update sendDailyQuestions and append handleToggleNotification
$old_daily = @'
function sendDailyQuestions() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hocsinhSheet = ss.getSheetByName('hocsinh') || ss.getSheets().find(s => s.getName().toLowerCase() === 'hocsinh');
  
  if (!hocsinhSheet) {
    Logger.log("Không tìm thấy trang tính 'hocsinh'");
    return;
  }
  
  var hsValues = hocsinhSheet.getDataRange().getValues();
  var count = 0;
  
  for (var r = 1; r < hsValues.length; r++) {
    var telegramId = hsValues[r][5] ? trimCell(hsValues[r][5]).toString() : '';
    
    // Nếu học sinh có đăng ký Telegram ID
    if (telegramId && telegramId !== '') {
      try {
        handleCauHoi(telegramId);
        count++;
        // Nghỉ 100ms để tránh vi phạm giới hạn tốc độ gửi tin nhắn của Telegram (30 tin/giây)
        Utilities.sleep(100);
      } catch (e) {
        Logger.log("Lỗi gửi câu hỏi hàng ngày cho " + telegramId + ": " + e.message);
      }
    }
  }
  
  Logger.log("Đã gửi câu hỏi hàng ngày cho " + count + " học sinh.");
}
'@

$new_daily = @'
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
    
    // Nếu học sinh có đăng ký Telegram ID và không nằm trong danh sách hủy nhận tin
    if (telegramId && telegramId !== '' && !unsubscribedEmails[email]) {
      try {
        handleCauHoi(telegramId);
        count++;
        // Nghỉ 100ms để tránh vi phạm giới hạn tốc độ gửi tin nhắn của Telegram (30 tin/giây)
        Utilities.sleep(100);
      } catch (e) {
        Logger.log("Lỗi gửi câu hỏi hàng ngày cho " + telegramId + ": " + e.message);
      }
    }
  }
  
  Logger.log("Đã gửi câu hỏi hàng ngày cho " + count + " học sinh.");
}

// ═══════════════════════════════════════════════════════════════
// HỦY / ĐĂNG KÝ NHẬN TIN NHẮN HÀNG NGÀY
// ═══════════════════════════════════════════════════════════════
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
  
  // Đảm bảo có cột thứ 8 header
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
    // Thêm dòng mới cho học sinh nếu chưa tồn tại trong bảng gamification
    gameSheet.appendRow([student.email, 0, 0, 0, '', 0, '', valToWrite]);
  }
  
  if (isSubscribe) {
    sendTelegramMessage(chatId, "🔔 <b>ĐÃ BẬT NHẬN TIN NHẮN</b>\n\nBạn sẽ nhận được thử thách Vật Lí hàng ngày vào lúc 9h sáng. Chúc bạn học tốt! 💪");
  } else {
    sendTelegramMessage(chatId, "🔕 <b>ĐÃ TẮT NHẬN TIN NHẮN</b>\n\nBạn đã hủy đăng ký nhận thử thách hàng ngày. Bạn vẫn có thể chủ động làm bài bằng lệnh /cauhoi bất cứ lúc nào!");
  }
}
'@

# Normalize line endings to LF first for reliable replace
$c = $c -replace "`r`n", "`n"
$c = $c.Replace(($old_latex -replace "`r`n", "`n"), ($new_latex -replace "`r`n", "`n"))
$c = $c.Replace(($old_router -replace "`r`n", "`n"), ($new_router -replace "`r`n", "`n"))
$c = $c.Replace(($old_menu -replace "`r`n", "`n"), ($new_menu -replace "`r`n", "`n"))
$c = $c.Replace(($old_daily -replace "`r`n", "`n"), ($new_daily -replace "`r`n", "`n"))

# Write back with CRLF
$c = $c -replace "`n", "`r`n"
[IO.File]::WriteAllText($f, $c)
Write-Host "Done"
