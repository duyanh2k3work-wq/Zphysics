/**
 * ═══════════════════════════════════════════════════════════════
 * Zphysics — Google Sheets → JSON API (Apps Script)
 * ═══════════════════════════════════════════════════════════════
 *
 * CẤU TRÚC MỚI (Từ V2): 
 * - Bạn có thể tạo tab tùy ý (VD: Chương 1, Chương 2).
 * - Cột A bắt buộc phải là "Mã đề".
 *
 * CẤU TRÚC CỘT (dòng 1):
 * | Mã đề | id | question | A | B | C | D | correct | explanation |
 */

var HEADER_ROW = 1;
// Các cột dịch sang phải 1 đơn vị so với bản cũ
var COL = {
  MADE: 0,
  ID: 1,
  QUESTION: 2,
  A: 3,
  B: 4,
  C: 5,
  D: 6,
  CORRECT: 7,
  EXPLANATION: 8
};
var ANSWER_KEYS = ['A', 'B', 'C', 'D'];

// =========================================================================
// CẤU HÌNH SUPABASE (Hãy điền thông tin dự án Supabase của bạn tại đây)
// =========================================================================
var SUPABASE_URL = "https://uztfmglzpfrwvamuggwx.supabase.co"; // Đường dẫn Supabase Project URL
var SUPABASE_ANON_KEY = "sb_publishable_XdBJ6z0Yj_nQyvn7FSemew_B8ewlDOM"; // Khóa anon (Publishable)
var SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6dGZtZ2x6cGZyd3ZhbXVnZ3d4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTk0MzY0OCwiZXhwIjoyMDk1NTE5NjQ4fQ.N2mnJCv-ARv8opy0hAnQXh8zIWC3CERKopHTkrQ0YSo"; // Khóa service_role cũ (Dạng JWT bắt đầu bằng eyJ...)
// =========================================================================

// =========================================================================
// CẤU HÌNH GỬI THÔNG BÁO NHẮC NHỞ
// =========================================================================
var TELEGRAM_BOT_TOKEN = "8764049213:AAEv7ZgWye1GMwAVhz3Rb6HmzLJ4PrqAv5s";
var WEB_APP_URL = "https://zphysics.io.vn"; // URL trang web của bạn
// =========================================================================

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
    
    // ═══ ADMIN ACTIONS (từ admin.html) ═══
    var action = postData.action;
    var result;
    
    if (action === 'addQuestion') {
      result = addQuestion(postData.questionData);
    } else if (action === 'editQuestion') {
      result = editQuestion(postData.id, postData.maDe, postData.questionData);
    } else if (action === 'deleteQuestion') {
      result = deleteQuestion(postData.id, postData.maDe);
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

// Lấy danh sách câu hỏi của một Mã đề
function getQuizData(quizName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var questions = [];
  var zeroBasedIndex = 0;

  // Quét qua toàn bộ các tab
  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var values = sheet.getDataRange().getValues();
    if (values.length <= HEADER_ROW) continue;

    for (var r = HEADER_ROW; r < values.length; r++) {
      var row = values[r];
      var maDe = trimCell(row[COL.MADE]);

      // Nếu mã đề trùng với bài học đang truy vấn
      if (maDe === quizName) {
        var rawId = row[COL.ID];
        var question = trimCell(row[COL.QUESTION]);

        if (isEmpty(rawId) && !question) continue;

        var answers = ANSWER_KEYS.map(function (key) {
          return {
            key: key,
            text: trimCell(row[COL[key]])
          };
        });

        var correct = trimCell(row[COL.CORRECT]).toUpperCase();
        // Cho phép trả lời ngắn bằng chữ thường/hoa tùy ý
        if (correct === '' && trimCell(row[COL.CORRECT]) !== '') {
            correct = trimCell(row[COL.CORRECT]);
        }
        var explanation = trimCell(row[COL.EXPLANATION]);

        var id = parseQuestionId(rawId, zeroBasedIndex);

        questions.push({
          id: id,
          question: question,
          answers: answers,
          correct: correct,
          explanation: explanation
        });
        
        zeroBasedIndex++;
      }
    }
  }

  if (questions.length === 0) {
    throw new Error('Không tìm thấy câu hỏi nào cho mã đề "' + quizName + '". Hãy kiểm tra xem bạn đã điền Mã đề vào cột A chưa.');
  }

  return questions;
}

// Thống kê số lượng câu hỏi của tất cả các Mã đề
function getStats() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var stats = {};
  
  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var values = sheet.getDataRange().getValues();
    if (values.length <= HEADER_ROW) continue;
    
    for (var r = HEADER_ROW; r < values.length; r++) {
      var maDe = trimCell(values[r][COL.MADE]);
      if (maDe !== "") {
        stats[maDe] = (stats[maDe] || 0) + 1;
      }
    }
  }
  return stats;
}

// Tìm kiếm hoặc xác định sheet chứa mã đề phù hợp (hỗ trợ phân chia tab theo Chương hoặc Lớp)
function findSheetForMaDe(ss, maDe) {
  var sheets = ss.getSheets();
  
  // 1. Tìm xem mã đề này đã tồn tại ở sheet nào chưa (độ chính xác cao nhất)
  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var lastRow = sheet.getLastRow();
    if (lastRow < HEADER_ROW) continue;
    
    var values = sheet.getRange(1, 1, lastRow, 1).getValues();
    for (var r = HEADER_ROW; r < values.length; r++) {
      if (trimCell(values[r][0]) === maDe) {
        return sheet;
      }
    }
  }
  
  // Trích xuất thông tin Khối lớp (10, 11, 12) từ mã đề
  var gradeMatch = maDe.match(/(?:_|^)(10|11|12)(?:_|$)/) || maDe.match(/(10|11|12)/);
  var gradeStr = gradeMatch ? gradeMatch[1] : "";
  
  // Trích xuất số Chương (ví dụ: _c1 -> Chương 1, _c02 -> Chương 2) từ mã đề
  var chapterMatch = maDe.match(/_c(\d+)/);
  var chapterNum = chapterMatch ? parseInt(chapterMatch[1], 10) : null;
  
  if (chapterNum !== null) {
    var roman = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
    var chRoman = (chapterNum < roman.length) ? roman[chapterNum] : "";
    var chArabic = String(chapterNum);
    
    // 2. Tìm kiếm theo cả Khối lớp VÀ Chương (ví dụ: tab tên "Chương I - Lớp 10" hoặc "12 - Chương 1")
    if (gradeStr) {
      for (var i = 0; i < sheets.length; i++) {
        var name = sheets[i].getName().toUpperCase();
        var hasGrade = name.indexOf(gradeStr) !== -1;
        var hasChapter = false;
        
        if (chRoman && (name.indexOf("CHƯƠNG " + chRoman) !== -1 || name.indexOf("CHƯƠNG" + chRoman) !== -1)) {
          hasChapter = true;
        }
        if (name.indexOf("CHƯƠNG " + chArabic) !== -1 || name.indexOf("CHƯƠNG 0" + chArabic) !== -1 || name.indexOf("CHƯƠNG" + chArabic) !== -1) {
          hasChapter = true;
        }
        
        if (hasGrade && hasChapter) {
          return sheets[i];
        }
      }
    }
    
    // 3. Tìm kiếm theo chỉ số Chương (hữu ích nếu file đề chỉ chứa 1 khối lớp nên tab chỉ đặt tên là "Chương I", "Chương II")
    for (var i = 0; i < sheets.length; i++) {
      var name = sheets[i].getName().toUpperCase();
      var hasChapter = false;
      
      if (chRoman && (name.indexOf("CHƯƠNG " + chRoman) !== -1 || name.indexOf("CHƯƠNG" + chRoman) !== -1)) {
        hasChapter = true;
      }
      if (name.indexOf("CHƯƠNG " + chArabic) !== -1 || name.indexOf("CHƯƠNG 0" + chArabic) !== -1 || name.indexOf("CHƯƠNG" + chArabic) !== -1) {
        hasChapter = true;
      }
      
      if (hasChapter) {
        return sheets[i];
      }
    }
  }
  
  // 4. Tìm kiếm theo Khối lớp (nếu dùng chung tab Lớp 10, Lớp 11, Lớp 12 như cũ)
  if (gradeStr) {
    for (var i = 0; i < sheets.length; i++) {
      var name = sheets[i].getName();
      if (name.indexOf(gradeStr) !== -1) {
        return sheets[i];
      }
    }
  }
  
  // 5. Dự phòng: trả về sheet hiện tại hoặc đầu tiên
  var activeSheet = ss.getActiveSheet();
  if (activeSheet) return activeSheet;
  return ss.getSheets()[0];
}

// Lấy ID lớn nhất của mã đề hiện tại + 1
function getNextQuestionId(sheet, maDe) {
  var values = sheet.getDataRange().getValues();
  var maxId = 0;
  for (var r = HEADER_ROW; r < values.length; r++) {
    var row = values[r];
    if (trimCell(row[COL.MADE]) === maDe) {
      var curId = parseInt(row[COL.ID], 10);
      if (!isNaN(curId) && curId > maxId) {
        maxId = curId;
      }
    }
  }
  return maxId + 1;
}

// Thêm câu hỏi mới
function addQuestion(qData) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var maDe = trimCell(qData.maDe);
  if (!maDe) throw new Error("Mã đề không được để trống");
  
  var sheet = findSheetForMaDe(ss, maDe);
  
  var id = parseInt(qData.id, 10);
  if (!id || isNaN(id)) {
    id = getNextQuestionId(sheet, maDe);
  }
  
  var rowData = new Array(9);
  rowData[COL.MADE] = maDe;
  rowData[COL.ID] = id;
  rowData[COL.QUESTION] = trimCell(qData.question);
  
  var answers = qData.answers || [];
  var ansA = "", ansB = "", ansC = "", ansD = "";
  answers.forEach(function(a) {
    var key = String(a.key).toUpperCase();
    if (key === 'A') ansA = trimCell(a.text);
    else if (key === 'B') ansB = trimCell(a.text);
    else if (key === 'C') ansC = trimCell(a.text);
    else if (key === 'D') ansD = trimCell(a.text);
  });
  rowData[COL.A] = ansA;
  rowData[COL.B] = ansB;
  rowData[COL.C] = ansC;
  rowData[COL.D] = ansD;
  
  rowData[COL.CORRECT] = trimCell(qData.correct);
  rowData[COL.EXPLANATION] = trimCell(qData.explanation);
  
  sheet.appendRow(rowData);
  
  // Đồng bộ tức thời sang Supabase
  try {
    supabaseUpsertQuestion(maDe, id, qData);
  } catch (err) {
    console.warn("Lỗi đồng bộ Supabase: " + err.message);
  }
  
  return { id: id, maDe: maDe };
}

// Chỉnh sửa câu hỏi
function editQuestion(id, maDe, qData) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var targetMaDe = trimCell(maDe);
  var targetId = parseInt(id, 10);
  if (isNaN(targetId)) throw new Error("ID câu hỏi không hợp lệ: " + id);
  if (!targetMaDe) throw new Error("Mã đề không được để trống");
  
  var sheet = findSheetForMaDe(ss, targetMaDe);
  var values = sheet.getDataRange().getValues();
  var foundRowIndex = -1;
  
  for (var r = HEADER_ROW; r < values.length; r++) {
    var row = values[r];
    if (trimCell(row[COL.MADE]) === targetMaDe && parseInt(row[COL.ID], 10) === targetId) {
      foundRowIndex = r + 1; // getRange nhận 1-indexed
      break;
    }
  }
  
  if (foundRowIndex === -1) {
    throw new Error("Không tìm thấy câu hỏi để sửa (Mã đề: " + targetMaDe + ", ID: " + targetId + ")");
  }
  
  // Ghi giá trị vào các ô tương ứng
  sheet.getRange(foundRowIndex, COL.QUESTION + 1).setValue(trimCell(qData.question));
  
  var answers = qData.answers || [];
  var ansA = "", ansB = "", ansC = "", ansD = "";
  answers.forEach(function(a) {
    var key = String(a.key).toUpperCase();
    if (key === 'A') ansA = trimCell(a.text);
    else if (key === 'B') ansB = trimCell(a.text);
    else if (key === 'C') ansC = trimCell(a.text);
    else if (key === 'D') ansD = trimCell(a.text);
  });
  sheet.getRange(foundRowIndex, COL.A + 1).setValue(ansA);
  sheet.getRange(foundRowIndex, COL.B + 1).setValue(ansB);
  sheet.getRange(foundRowIndex, COL.C + 1).setValue(ansC);
  sheet.getRange(foundRowIndex, COL.D + 1).setValue(ansD);
  
  sheet.getRange(foundRowIndex, COL.CORRECT + 1).setValue(trimCell(qData.correct));
  sheet.getRange(foundRowIndex, COL.EXPLANATION + 1).setValue(trimCell(qData.explanation));
  
  // Trường hợp đổi mã đề
  var newMaDe = trimCell(qData.maDe);
  if (newMaDe && newMaDe !== targetMaDe) {
    sheet.getRange(foundRowIndex, COL.MADE + 1).setValue(newMaDe);
  }
  
  // Trường hợp đổi ID
  var newId = parseInt(qData.id, 10);
  if (!isNaN(newId) && newId !== targetId) {
    sheet.getRange(foundRowIndex, COL.ID + 1).setValue(newId);
  }
  
  // Đồng bộ tức thời sang Supabase
  try {
    var finalMaDe = newMaDe || targetMaDe;
    var finalId = (!newId || isNaN(newId)) ? targetId : newId;
    if (finalMaDe !== targetMaDe || finalId !== targetId) {
      supabaseDeleteQuestion(targetMaDe, targetId);
    }
    supabaseUpsertQuestion(finalMaDe, finalId, qData);
  } catch (err) {
    console.warn("Lỗi đồng bộ Supabase: " + err.message);
  }
  
  return { id: newId || targetId, maDe: newMaDe || targetMaDe };
}

// Xóa câu hỏi
function deleteQuestion(id, maDe) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var targetMaDe = trimCell(maDe);
  var targetId = parseInt(id, 10);
  if (isNaN(targetId)) throw new Error("ID câu hỏi không hợp lệ: " + id);
  if (!targetMaDe) throw new Error("Mã đề không được để trống");
  
  var sheet = findSheetForMaDe(ss, targetMaDe);
  var values = sheet.getDataRange().getValues();
  var foundRowIndex = -1;
  
  for (var r = HEADER_ROW; r < values.length; r++) {
    var row = values[r];
    if (trimCell(row[COL.MADE]) === targetMaDe && parseInt(row[COL.ID], 10) === targetId) {
      foundRowIndex = r + 1;
      break;
    }
  }
  
  if (foundRowIndex === -1) {
    throw new Error("Không tìm thấy câu hỏi để xóa (Mã đề: " + targetMaDe + ", ID: " + targetId + ")");
  }
  
  sheet.deleteRow(foundRowIndex);
  
  // Đồng bộ tức thời sang Supabase
  try {
    supabaseDeleteQuestion(targetMaDe, targetId);
  } catch (err) {
    console.warn("Lỗi đồng bộ Supabase: " + err.message);
  }
  
  return { id: targetId, maDe: targetMaDe };
}

// Hàm chuyển đổi các định dạng ngày trên Google Sheet sang ISO 8601 UTC
function parseDateToISO(val) {
  if (val instanceof Date) {
    return val.toISOString();
  }
  if (val === null || val === undefined) return null;
  var str = String(val).trim();
  if (!str) return null;
  
  // Kiểm tra xem có ghi chữ "trọn đời" hoặc "vô hạn" không
  var lowerStr = str.toLowerCase();
  if (lowerStr.indexOf('trọn đời') !== -1 || lowerStr.indexOf('vô hạn') !== -1 || lowerStr.indexOf('lifetime') !== -1) {
    return null;
  }
  
  // Hỗ trợ định dạng DD/MM/YYYY hoặc DD-MM-YYYY (kèm giờ phút giây nếu có)
  var dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmyMatch) {
    var day = parseInt(dmyMatch[1], 10);
    var month = parseInt(dmyMatch[2], 10) - 1; // 0-indexed
    var year = parseInt(dmyMatch[3], 10);
    var hour = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
    var min = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    var sec = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    var d = new Date(year, month, day, hour, min, sec);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  }
  
  var d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString();
  }
  
  return null;
}

// Kiểm tra đăng nhập học sinh bằng Gmail
// Sheet "HocSinh" cần có 4 cột: gmail | ten | loai | premium_until
function checkStudent(gmail) {
  if (!gmail) {
    return { valid: false, message: 'Vui lòng nhập Gmail' };
  }
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = null;
  
  // Tìm tab có tên "HocSinh" (không phân biệt hoa thường)
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase() === 'hocsinh') {
      sheet = sheets[i];
      break;
    }
  }
  
  if (!sheet) {
    return { valid: false, message: 'Chưa tạo tab "HocSinh" trong Google Sheet' };
  }
  
  var values = sheet.getDataRange().getValues();
  // Dòng đầu là header: gmail | ten | loai (cột C) | premium_until (cột D)
  for (var r = 1; r < values.length; r++) {
    var rowGmail = String(values[r][0]).trim().toLowerCase();
    if (rowGmail === gmail) {
      var ten = String(values[r][1]).trim();
      var loai = values[r][2] ? String(values[r][2]).trim().toLowerCase() : 'free';
      var premiumUntilVal = values[r][3];
      var premiumUntilISO = parseDateToISO(premiumUntilVal);
      
      var isPremium = (loai === 'premium');
      if (isPremium && premiumUntilISO) {
        var expDate = new Date(premiumUntilISO);
        if (expDate < new Date()) {
          isPremium = false; // Hết hạn
        }
      }
      
      return { 
        valid: true, 
        ten: ten || gmail, 
        premium: isPremium, 
        premium_until: premiumUntilISO 
      };
    }
  }
  
  return { valid: false, message: 'Gmail chưa được đăng ký. Hãy liên hệ thầy/cô để được thêm vào danh sách.' };
}

function registerStudent(gmail, name) {
  if (!gmail) return { success: false, message: 'Gmail không được để trống' };
  if (!name) name = gmail.split('@')[0];
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = null;
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase() === 'hocsinh') {
      sheet = sheets[i];
      break;
    }
  }
  
  if (!sheet) {
    return { success: false, message: 'Chưa tạo tab "HocSinh" trong Google Sheet' };
  }
  
  // Kiểm tra xem đã tồn tại chưa để tránh trùng lặp
  var values = sheet.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    var rowGmail = String(values[r][0]).trim().toLowerCase();
    if (rowGmail === gmail) {
      var ten = String(values[r][1]).trim();
      var loai = values[r][2] ? String(values[r][2]).trim().toLowerCase() : 'free';
      var premiumUntilVal = values[r][3];
      var premiumUntilISO = parseDateToISO(premiumUntilVal);
      
      var isPremium = (loai === 'premium');
      if (isPremium && premiumUntilISO) {
        var expDate = new Date(premiumUntilISO);
        if (expDate < new Date()) {
          isPremium = false;
        }
      }
      
      return { 
        success: true, 
        isNew: false, 
        ten: ten, 
        premium: isPremium, 
        premium_until: premiumUntilISO 
      };
    }
  }
  
  // Thêm vào dòng cuối cùng của sheet
  sheet.appendRow([gmail, name, 'free', '']);
  
  // Đồng bộ tức thời sang Supabase
  try {
    supabaseRequest('students', 'POST', [{
      email: gmail,
      full_name: name,
      role: 'free',
      premium_until: null
    }]);
  } catch (err) {
    console.warn("Lỗi đồng bộ đăng ký Supabase: " + err.message);
  }
  
  return { success: true, isNew: true, ten: name, premium: false, premium_until: null };
}

function trimCell(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function isEmpty(value) {
  return value === '' || value === null || value === undefined;
}

function parseQuestionId(rawId, zeroBasedIndex) {
  if (typeof rawId === 'number' && !isNaN(rawId)) {
    return Math.floor(rawId);
  }
  var n = parseInt(String(rawId).trim(), 10);
  if (!isNaN(n)) return n;
  return zeroBasedIndex + 1;
}

function setupCurrentSheetHeaders() {
  var sheet = SpreadsheetApp.getActiveSheet();
  sheet.getRange(1, 1, 1, 9).setValues([[
    'Mã đề', 'id', 'question', 'A', 'B', 'C', 'D', 'correct', 'explanation'
  ]]);
  sheet.setFrozenRows(1);
}

// Lấy link bài học động từ tab "LinkBaiHoc"
function getLinks() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = null;
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase() === 'linkbaihoc') {
      sheet = sheets[i];
      break;
    }
  }
  
  if (!sheet) {
    return [];
  }
  
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return []; // Chỉ có header hoặc rỗng
  
  var links = [];
  // Dòng đầu tiên là tiêu đề: Lớp | Bài | Video | Bài tập
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var lop = trimCell(row[0]);
    var bai = trimCell(row[1]);
    var video = trimCell(row[2]);
    var baiTap = trimCell(row[3]);
    
    if (lop || bai) {
      links.push({
        lop: lop,
        bai: bai,
        video: video,
        baiTap: baiTap
      });
    }
  }
  return links;
}

// Lấy danh sách đề thi luyện đề VIP từ tab "LuyenDe"
function getExams() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = null;
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase() === 'luyende') {
      sheet = sheets[i];
      break;
    }
  }
  
  if (!sheet) {
    return [];
  }
  
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return []; // Chỉ có header hoặc rỗng
  
  var exams = [];
  // Cột: Mã đề (A) | Tiêu đề (B) | Mô tả (C) | Link PDF (D) | Đáp án MCQ (E) | Đáp án TF (F) | Đáp án SA (G) | Thời gian (H)
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var id = trimCell(row[0]);
    var title = trimCell(row[1]);
    var desc = trimCell(row[2]);
    var pdfUrl = trimCell(row[3]);
    var mcAnswers = trimCell(row[4]);
    var tfAnswers = trimCell(row[5]);
    var saAnswers = trimCell(row[6]);
    var duration = trimCell(row[7]);
    var lop = trimCell(row[8]); // Cột I (Lớp)
    var videoUrl = trimCell(row[9]); // Cột J (Link Video Chữa)
    
    if (id || title) {
      exams.push({
        id: id,
        title: title,
        desc: desc || "Đề luyện thi VIP",
        pdfUrl: pdfUrl,
        mcAnswers: mcAnswers,
        tfAnswers: tfAnswers,
        saAnswers: saAnswers,
        duration: duration ? parseInt(duration, 10) : 50,
        lop: lop || "12",
        videoUrl: videoUrl || "#"
      });
    }
  }
  return exams;
}

// ═══════════════════════════════════════════════════════════════
// SUPABASE SYNC FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Zphysics Tools')
    .addItem('Đồng bộ tất cả dữ liệu sang Supabase', 'syncAllToSupabase')
    .addItem('Kích hoạt tự động đồng bộ (Auto Sync)', 'setupAutoSyncTrigger')
    .addToUi();
}

function setupAutoSyncTrigger() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    // Xóa các trigger cũ để tránh trùng lặp
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'onEditInstalled') {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
    
    // Tạo trigger cài đặt mới cho sự kiện onEdit
    ScriptApp.newTrigger('onEditInstalled')
      .forSpreadsheet(ss)
      .onEdit()
      .create();
    
    ui.alert('Thành công', 'Đã kích hoạt tự động đồng bộ! Từ bây giờ, mỗi khi bạn sửa dữ liệu trên Sheet, hệ thống sẽ tự động đồng bộ sang Supabase.', ui.ButtonSet.OK);
  } catch (err) {
    var errMsg = err.message || String(err);
    if (errMsg.indexOf("quyền") !== -1 || errMsg.indexOf("permission") !== -1 || errMsg.indexOf("ScriptApp") !== -1 || errMsg.indexOf("sufficient") !== -1) {
      ui.alert(
        'Yêu cầu cấp quyền', 
        'Để kích hoạt Tự động đồng bộ, bạn hãy thực hiện theo 1 trong 2 cách sau:\n\n' +
        'Cách 1 (Khuyên dùng): Mở trình soạn thảo Apps Script, ở danh sách hàm phía trên chọn "setupAutoSyncTrigger" rồi nhấn nút "Chạy" (Run). Hộp thoại yêu cầu cấp quyền sẽ hiện lên, hãy cấp quyền để hoàn tất.\n\n' +
        'Cách 2 (Thủ công): Ở thanh bên trái Apps Script, bấm vào biểu tượng Đồng hồ (Kích hoạt/Triggers) -> Chọn "Thêm trình kích hoạt" -> Chọn hàm "onEditInstalled", Nguồn sự kiện "Từ bảng tính", Loại sự kiện "Khi chỉnh sửa" -> Lưu và cấp quyền.',
        ui.ButtonSet.OK
      );
    } else {
      ui.alert('Lỗi kích hoạt', 'Không thể cài đặt tự động đồng bộ: ' + errMsg, ui.ButtonSet.OK);
    }
  }
}

function onEditInstalled(e) {
  if (!e) return;
  try {
    var range = e.range;
    var sheet = range.getSheet();
    var sheetName = sheet.getName().toLowerCase().trim();
    var row = range.getRow();
    
    // Bỏ qua nếu sửa dòng tiêu đề (Header)
    if (row <= HEADER_ROW) return;
    
    if (sheetName === 'hocsinh') {
      // Đồng bộ thông tin học sinh
      var vals = sheet.getRange(row, 1, 1, 4).getValues()[0];
      var gmail = trimCell(vals[0]).toLowerCase();
      var ten = trimCell(vals[1]);
      var loai = vals[2] ? trimCell(vals[2]).toLowerCase() : 'free';
      var premiumUntilISO = parseDateToISO(vals[3]);
      
      if (gmail) {
        var payload = {
          email: gmail,
          full_name: ten,
          role: loai,
          premium_until: premiumUntilISO
        };
        var url = SUPABASE_URL + '/rest/v1/students?on_conflict=email';
        var headers = {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        };
        UrlFetchApp.fetch(url, {
          method: 'POST',
          headers: headers,
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });
      }
    } else if (sheetName === 'linkbaihoc') {
      // Đồng bộ danh sách bài học (đồng bộ toàn bộ vì số dòng ít và tránh lệch chỉ mục)
      syncLessonsToSupabase();
    } else if (sheetName === 'luyende') {
      // Đồng bộ danh sách đề thi VIP
      var vals = sheet.getRange(row, 1, 1, 10).getValues()[0];
      var id = trimCell(vals[0]);
      var title = trimCell(vals[1]);
      if (id) {
        var payload = {
          id: id,
          title: title,
          description: trimCell(vals[2]) || "Đề luyện thi VIP",
          pdf_url: trimCell(vals[3]),
          mc_answers: trimCell(vals[4]),
          tf_answers: trimCell(vals[5]),
          sa_answers: trimCell(vals[6]),
          duration: vals[7] ? parseInt(vals[7], 10) : 50,
          grade: trimCell(vals[8]) || "12",
          video_url: trimCell(vals[9]) || "#"
        };
        var url = SUPABASE_URL + '/rest/v1/exams?on_conflict=id';
        var headers = {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        };
        UrlFetchApp.fetch(url, {
          method: 'POST',
          headers: headers,
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });
      }
    } else {
      // Các sheet câu hỏi (tab Chương 1, Chương 2, v.v...)
      var systemSheets = ['hocsinh', 'linkbaihoc', 'luyende'];
      if (systemSheets.indexOf(sheetName) !== -1) return;
      
      var vals = sheet.getRange(row, 1, 1, 9).getValues()[0];
      var maDe = trimCell(vals[COL.MADE]);
      var rawId = vals[COL.ID];
      
      if (maDe && !isEmpty(rawId)) {
        var id = parseInt(rawId, 10);
        var qData = {
          question: trimCell(vals[COL.QUESTION]),
          answers: [
            { key: 'A', text: trimCell(vals[COL.A]) },
            { key: 'B', text: trimCell(vals[COL.B]) },
            { key: 'C', text: trimCell(vals[COL.C]) },
            { key: 'D', text: trimCell(vals[COL.D]) }
          ],
          correct: trimCell(vals[COL.CORRECT]),
          explanation: trimCell(vals[COL.EXPLANATION])
        };
        supabaseUpsertQuestion(maDe, id, qData);
      }
    }
  } catch (err) {
    console.warn("Lỗi tự động đồng bộ: " + err.message);
  }
}

function syncAllToSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_URL.indexOf("xxxxxx") !== -1 || SUPABASE_URL === "") {
    SpreadsheetApp.getUi().alert("Lỗi: Vui lòng cấu hình SUPABASE_URL & SUPABASE_KEY ở đầu file mã nguồn Google Apps Script trước khi chạy đồng bộ.");
    return;
  }
  
  var ui = SpreadsheetApp.getUi();
  var response = ui.alert('Xác nhận đồng bộ', 'Bạn có chắc chắn muốn xóa dữ liệu cũ trên Supabase và đồng bộ toàn bộ dữ liệu mới từ Google Sheet sang không?', ui.ButtonSet.YES_NO);
  if (response !== ui.Button.YES) return;
  
  try {
    syncStudentsToSupabase();
    syncLessonsToSupabase();
    syncExamsToSupabase();
    syncQuestionsToSupabase();
    
    ui.alert('Thành công', 'Đã đồng bộ toàn bộ dữ liệu sang Supabase thành công!', ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Lỗi đồng bộ', 'Đã có lỗi xảy ra: ' + e.message, ui.ButtonSet.OK);
  }
}

// Hàm chạy đồng bộ trực tiếp trong Editor (không hiện hộp thoại) để tránh lỗi đa tài khoản của Google Sheet
function runSyncDirectly() {
  syncStudentsToSupabase();
  syncLessonsToSupabase();
  syncExamsToSupabase();
  syncQuestionsToSupabase();
  console.log("Đồng bộ hoàn tất!");
}

function supabaseRequest(path, method, payload) {
  var url = SUPABASE_URL + '/rest/v1/' + path;
  var headers = {
    'apikey': SUPABASE_ANON_KEY, // Dùng anon key để qua bộ lọc Browser của Supabase
    'Authorization': 'Bearer ' + SUPABASE_KEY, // Dùng service_role JWT key để bypass RLS (quyền Admin)
    'Content-Type': 'application/json'
  };
  
  if (method === 'POST' && (path.indexOf('questions') !== -1 || path.indexOf('students') !== -1)) {
    headers['Prefer'] = 'resolution=merge-duplicates';
  }
  
  var options = {
    'method': method,
    'headers': headers,
    'muteHttpExceptions': true
  };
  
  if (payload) {
    options.payload = JSON.stringify(payload);
  }
  
  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  var content = response.getContentText();
  
  if (code < 200 || code >= 300) {
    throw new Error('Supabase API error (' + code + ') on ' + path + ': ' + content);
  }
  
  return content ? JSON.parse(content) : null;
}

function syncStudentsToSupabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = null;
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase() === 'hocsinh') {
      sheet = sheets[i];
      break;
    }
  }
  if (!sheet) return;
  
  var values = sheet.getDataRange().getValues();
  var students = [];
  
  for (var r = 1; r < values.length; r++) {
    var gmail = trimCell(values[r][0]).toLowerCase();
    var ten = trimCell(values[r][1]);
    var loai = values[r][2] ? trimCell(values[r][2]).toLowerCase() : 'free';
    var premiumUntilVal = values[r][3];
    var premiumUntilISO = parseDateToISO(premiumUntilVal);
    
    if (gmail) {
      students.push({
        email: gmail,
        full_name: ten,
        role: loai,
        premium_until: premiumUntilISO
      });
    }
  }
  
  // 1. Lấy danh sách học sinh hiện tại trên Supabase để tìm những học sinh bị xóa trên Sheet
  var existingStudents = [];
  try {
    existingStudents = supabaseRequest('students?select=email', 'GET') || [];
  } catch (err) {
    console.warn("Không thể lấy danh sách học sinh hiện tại từ Supabase: " + err.message);
  }
  
  // Tạo bộ tra cứu nhanh cho email học sinh trên Sheet
  var sheetEmails = {};
  students.forEach(function(s) {
    sheetEmails[s.email] = true;
  });
  
  // Tìm các email có trên Supabase nhưng không có trên Sheet để xóa
  var emailsToDelete = [];
  existingStudents.forEach(function(s) {
    if (s.email) {
      var emailLower = s.email.toLowerCase();
      if (!sheetEmails[emailLower]) {
        emailsToDelete.push(emailLower);
      }
    }
  });
  
  // Xóa các học sinh không còn trên Sheet (để đồng bộ trạng thái xóa)
  emailsToDelete.forEach(function(email) {
    try {
      supabaseRequest('students?email=eq.' + encodeURIComponent(email), 'DELETE');
    } catch (err) {
      console.warn("Lỗi xóa học sinh " + email + ": " + err.message);
    }
  });
  
  // 2. Upsert (Insert/Update) dữ liệu mới vào Supabase
  if (students.length > 0) {
    supabaseRequest('students?on_conflict=email', 'POST', students);
  }
}

function syncLessonsToSupabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = null;
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase() === 'linkbaihoc') {
      sheet = sheets[i];
      break;
    }
  }
  if (!sheet) return;
  
  var values = sheet.getDataRange().getValues();
  var lessons = [];
  
  for (var r = 1; r < values.length; r++) {
    var lop = trimCell(values[r][0]);
    var bai = trimCell(values[r][1]);
    var video = trimCell(values[r][2]);
    var baiTap = trimCell(values[r][3]);
    
    if (lop || bai) {
      lessons.push({
        grade: lop,
        title: bai,
        video_url: video,
        exercise_url: baiTap
      });
    }
  }
  
  // 1. Xóa dữ liệu cũ
  supabaseRequest('lessons?id=not.is.null', 'DELETE');
  
  // 2. Insert dữ liệu mới
  if (lessons.length > 0) {
    supabaseRequest('lessons', 'POST', lessons);
  }
}

function syncExamsToSupabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = null;
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase() === 'luyende') {
      sheet = sheets[i];
      break;
    }
  }
  if (!sheet) return;
  
  var values = sheet.getDataRange().getValues();
  var exams = [];
  
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var id = trimCell(row[0]);
    var title = trimCell(row[1]);
    var desc = trimCell(row[2]);
    var pdfUrl = trimCell(row[3]);
    var mcAnswers = trimCell(row[4]);
    var tfAnswers = trimCell(row[5]);
    var saAnswers = trimCell(row[6]);
    var duration = trimCell(row[7]);
    var lop = trimCell(row[8]);
    var videoUrl = trimCell(row[9]);
    
    if (id || title) {
      exams.push({
        id: id,
        title: title,
        description: desc || "Đề luyện thi VIP",
        pdf_url: pdfUrl,
        mc_answers: mcAnswers,
        tf_answers: tfAnswers,
        sa_answers: saAnswers,
        duration: duration ? parseInt(duration, 10) : 50,
        grade: lop || "12",
        video_url: videoUrl || "#"
      });
    }
  }
  
  // 1. Xóa dữ liệu cũ
  supabaseRequest('exams?id=not.is.null', 'DELETE');
  
  // 2. Insert dữ liệu mới
  if (exams.length > 0) {
    supabaseRequest('exams', 'POST', exams);
  }
}

function syncQuestionsToSupabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var questions = [];
  
  var systemSheets = ['hocsinh', 'linkbaihoc', 'luyende'];
  
  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var sheetName = sheet.getName().toLowerCase().trim();
    if (systemSheets.indexOf(sheetName) !== -1) continue;
    
    var values = sheet.getDataRange().getValues();
    if (values.length <= HEADER_ROW) continue;
    
    for (var r = HEADER_ROW; r < values.length; r++) {
      var row = values[r];
      var maDe = trimCell(row[COL.MADE]);
      var rawId = row[COL.ID];
      var questionText = trimCell(row[COL.QUESTION]);
      
      if (isEmpty(rawId) && !questionText) continue;
      
      var qId = parseQuestionId(rawId, r - HEADER_ROW);
      
      questions.push({
        made: maDe,
        question_id: qId,
        question: questionText,
        a: trimCell(row[COL.A]),
        b: trimCell(row[COL.B]),
        c: trimCell(row[COL.C]),
        d: trimCell(row[COL.D]),
        correct: trimCell(row[COL.CORRECT]).toUpperCase(),
        explanation: trimCell(row[COL.EXPLANATION])
      });
    }
  }
  
  // LỌC BỎ TRÙNG LẶP (Giữ lại câu hỏi xuất hiện sau cùng)
  var uniqueQuestions = [];
  var seenKeys = {};
  for (var j = questions.length - 1; j >= 0; j--) {
    var q = questions[j];
    var key = q.made + '_' + q.question_id;
    if (!seenKeys[key]) {
      seenKeys[key] = true;
      uniqueQuestions.unshift(q); // Thêm vào đầu để giữ đúng thứ tự ban đầu
    }
  }
  questions = uniqueQuestions;
  
  // 1. Xóa dữ liệu cũ
  supabaseRequest('questions?id=not.is.null', 'DELETE');
  
  // 2. Insert dữ liệu mới theo từng chunk nhỏ để tránh quá tải payload
  var chunkSize = 500;
  for (var i = 0; i < questions.length; i += chunkSize) {
    var chunk = questions.slice(i, i + chunkSize);
    supabaseRequest('questions', 'POST', chunk);
  }
}

function supabaseUpsertQuestion(maDe, id, qData) {
  if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_URL.indexOf("xxxxxx") !== -1 || SUPABASE_URL === "") return;
  
  var answers = qData.answers || [];
  var ansA = "", ansB = "", ansC = "", ansD = "";
  answers.forEach(function(a) {
    var key = String(a.key).toUpperCase();
    if (key === 'A') ansA = trimCell(a.text);
    else if (key === 'B') ansB = trimCell(a.text);
    else if (key === 'C') ansC = trimCell(a.text);
    else if (key === 'D') ansD = trimCell(a.text);
  });
  
  var payload = {
    made: maDe,
    question_id: parseInt(id, 10),
    question: trimCell(qData.question),
    a: ansA,
    b: ansB,
    c: ansC,
    d: ansD,
    correct: trimCell(qData.correct).toUpperCase(),
    explanation: trimCell(qData.explanation)
  };
  
  // Sử dụng POST với header resolution=merge-duplicates để tự động Upsert dựa trên unique constraint
  var url = SUPABASE_URL + '/rest/v1/questions?on_conflict=made,question_id';
  var headers = {
    'apikey': SUPABASE_ANON_KEY, // Dùng anon key để qua bộ lọc Browser của Supabase
    'Authorization': 'Bearer ' + SUPABASE_KEY, // Dùng service_role JWT key để bypass RLS (quyền Admin)
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates'
  };
  
  var options = {
    'method': 'POST',
    'headers': headers,
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  };
  
  UrlFetchApp.fetch(url, options);
}

function supabaseDeleteQuestion(maDe, id) {
  if (!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_URL.indexOf("xxxxxx") !== -1 || SUPABASE_URL === "") return;
  
  var url = SUPABASE_URL + '/rest/v1/questions?made=eq.' + encodeURIComponent(maDe) + '&question_id=eq.' + parseInt(id, 10);
  var headers = {
    'apikey': SUPABASE_ANON_KEY, // Dùng anon key để qua bộ lọc Browser của Supabase
    'Authorization': 'Bearer ' + SUPABASE_KEY // Dùng service_role JWT key để bypass RLS (quyền Admin)
  };
  
  var options = {
    'method': 'DELETE',
    'headers': headers,
    'muteHttpExceptions': true
  };
  
  UrlFetchApp.fetch(url, options);
}

// =========================================================================
// THÔNG BÁO TỰ ĐỘNG QUA EMAIL & TELEGRAM BOT
// =========================================================================

function getLessonTitle(lessonId) {
  if (!lessonId) return "Bài học";
  
  // 1. Kiểm tra trong sheet luyende
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var luyendeSheet = ss.getSheetByName('luyende') || ss.getSheets().find(s => s.getName().toLowerCase() === 'luyende');
  if (luyendeSheet) {
    var values = luyendeSheet.getDataRange().getValues();
    for (var r = 1; r < values.length; r++) {
      if (trimCell(values[r][0]) === lessonId) {
        return trimCell(values[r][1]);
      }
    }
  }
  
  // 2. Phân tích mã đề nếu thuộc định dạng bài tập/ôn tập của hệ thống
  var parts = lessonId.split('_');
  if (parts.length >= 4) {
    var typeMap = {
      'cauhoi': 'Trắc nghiệm',
      'đs': 'Đúng/Sai',
      'tln': 'Trả lời ngắn',
      'baitap': 'Bài tập về nhà',
      'ontap': 'Ôn tập'
    };
    var typeStr = typeMap[parts[0]] || parts[0];
    var gradeStr = "Vật lí " + parts[1];
    var chapterStr = "Chương " + parts[2].toUpperCase().replace('C', '');
    var lessonNum = parseInt(parts[3].replace('b', '').replace('B', ''), 10);
    var lessonStr = "Bài " + (isNaN(lessonNum) ? parts[3] : lessonNum);
    return gradeStr + " - " + chapterStr + " - " + lessonStr + " (" + typeStr + ")";
  }
  
  return lessonId;
}

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

// =========================================================================
// TELEGRAM BOT TƯƠNG TÁC — XỬ LÝ LỆNH TỪ HỌC SINH
// =========================================================================

// --- Hàm tiện ích gửi tin nhắn Telegram ---
function sendTelegramMessage(chatId, text) {
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

// --- Tìm thông tin học sinh bằng Telegram Chat ID ---
function findStudentByChatId(chatId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('hocsinh');
  if (!sheet) return null;
  
  var values = sheet.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    var teleId = values[r][5] ? trimCell(values[r][5]).toString() : '';
    if (teleId === chatId.toString()) {
      return {
        email: trimCell(values[r][0]).toLowerCase(),
        name: trimCell(values[r][1]),
        grade: trimCell(values[r][2]).toString(), // Cột C = Lớp
        telegramId: teleId
      };
    }
  }
  return null;
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
    sendTelegramMessage(chatId, "❌ Không tìm thấy thông tin của bạn.\nTelegram Chat ID của bạn là: <code>" + chatId + "</code>\n\nVui lòng sao chép ID này và điền vào <b>Cột E (Telegram ID)</b> của sheet <b>hocsinh</b> nhé!");
    return;
  }
  
  try {
    var progress = supabaseRequest(
      'student_progress?email=eq.' + encodeURIComponent(student.email) +
      '&select=lesson_id,score,type,completed_at&order=completed_at.desc&limit=15', 'GET'
    );
    
    if (!progress || progress.length === 0) {
      sendTelegramMessage(chatId, 
        "📊 Chào <b>" + student.name + "</b>!\n\n" +
        "Hiện tại em chưa có kết quả bài tập nào.\nHãy bắt đầu làm bài trên Zphysics nhé! 💪");
      return;
    }
    
    var msg = "📊 <b>BẢNG ĐIỂM CỦA " + student.name.toUpperCase() + "</b>\n\n";
    var totalScore = 0;
    var count = 0;
    
    for (var i = 0; i < progress.length; i++) {
      var p = progress[i];
      var score = p.score !== null ? parseFloat(p.score) : null;
      var emoji = score === null ? "⚪" : (score >= 8 ? "🟢" : (score >= 5 ? "🟡" : "🔴"));
      var title = getLessonTitle(p.lesson_id);
      var dateStr = "";
      if (p.completed_at) {
        var d = new Date(p.completed_at);
        dateStr = Utilities.formatDate(d, "GMT+7", "dd/MM HH:mm");
      }
      
      msg += (i + 1) + ". " + emoji + " " + title;
      if (score !== null) {
        msg += " — <b>" + score + "/10</b>";
        totalScore += score;
        count++;
      }
      msg += "\n   ⏰ " + dateStr + "\n\n";
    }
    
    if (count > 0) {
      var avg = (totalScore / count).toFixed(1);
      msg += "📈 <b>Điểm TB: " + avg + "</b> | Đã làm: " + count + " bài";
    }
    
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
    sendTelegramMessage(chatId, "❌ Không tìm thấy thông tin của bạn.\nTelegram Chat ID của bạn là: <code>" + chatId + "</code>\n\nVui lòng sao chép ID này và điền vào <b>Cột E (Telegram ID)</b> của sheet <b>hocsinh</b> nhé!");
    return;
  }
  
  var grade = student.grade;
  if (!grade || grade === "undefined" || grade === "0") {
    sendTelegramMessage(chatId, "⚠️ Chưa có thông tin lớp của em.\nVui lòng liên hệ giáo viên để cập nhật Cột C (Lớp) trong sheet hocsinh.");
    return;
  }
  
  try {
    // Lấy tất cả bài đã làm từ Supabase
    var progress = supabaseRequest(
      'student_progress?email=eq.' + encodeURIComponent(student.email) +
      '&score=not.is.null&select=lesson_id', 'GET'
    );
    var completedSet = {};
    if (progress) {
      for (var i = 0; i < progress.length; i++) {
        completedSet[progress[i].lesson_id] = true;
      }
    }
    
    // Quét các tab sheet để tìm tất cả mã đề thuộc lớp của học sinh
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheets = ss.getSheets();
    var chapterMap = {}; // { "c1": { lessonIds: {}, completed: 0, total: 0 } }
    
    for (var s = 0; s < sheets.length; s++) {
      var sheetName = sheets[s].getName().toLowerCase();
      if (sheetName === 'hocsinh' || sheetName === 'deadlines' || sheetName === 'gamification' || sheetName === 'luyende') continue;
      
      var values = sheets[s].getDataRange().getValues();
      if (values.length <= HEADER_ROW) continue;
      
      for (var r = HEADER_ROW; r < values.length; r++) {
        var made = trimCell(values[r][COL.MADE]);
        if (!made) continue;
        
        var parts = made.split('_');
        if (parts.length >= 4 && parts[1] === grade) {
          var chapter = parts[2]; // "c1", "c2"...
          if (!chapterMap[chapter]) {
            chapterMap[chapter] = { lessonIds: {} };
          }
          // Mỗi mã đề là 1 bài duy nhất (VD: baitap_12_c1_b03)
          chapterMap[chapter].lessonIds[made] = true;
        }
      }
    }
    
    // Cũng quét sheet luyende
    var luyendeSheet = ss.getSheetByName('luyende');
    if (luyendeSheet) {
      var ldValues = luyendeSheet.getDataRange().getValues();
      for (var r = 1; r < ldValues.length; r++) {
        var lessonId = trimCell(ldValues[r][0]);
        if (!lessonId) continue;
        var parts = lessonId.split('_');
        if (parts.length >= 4 && parts[1] === grade) {
          var chapter = parts[2];
          if (!chapterMap[chapter]) {
            chapterMap[chapter] = { lessonIds: {} };
          }
          chapterMap[chapter].lessonIds[lessonId] = true;
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
      var ids = Object.keys(chapterMap[ch].lessonIds);
      var done = 0;
      for (var j = 0; j < ids.length; j++) {
        if (completedSet[ids[j]]) done++;
      }
      totalAll += ids.length;
      completedAll += done;
      
      var pct = ids.length > 0 ? Math.round(done / ids.length * 100) : 0;
      var filled = Math.round(pct / 10);
      var bar = "";
      for (var b = 0; b < 10; b++) {
        bar += b < filled ? "█" : "░";
      }
      
      var chNum = ch.toUpperCase().replace('C', '');
      msg += "<b>Chương " + chNum + ":</b>\n";
      msg += bar + " " + pct + "% (" + done + "/" + ids.length + " bài)\n\n";
    }
    
    var totalPct = totalAll > 0 ? Math.round(completedAll / totalAll * 100) : 0;
    msg += "🏆 <b>Tổng tiến độ: " + totalPct + "% (" + completedAll + "/" + totalAll + " bài)</b>";
    
    sendTelegramMessage(chatId, msg);
  } catch (e) {
    sendTelegramMessage(chatId, "⚠️ Có lỗi xảy ra. Vui lòng thử lại sau.");
    Logger.log("Lỗi handleTienDo: " + e.message);
  }
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
    var lastQDate = trimCell(gameValues[playerRow - 1][6]).toString();
    if (lastQDate === today) {
      dailyCount = parseInt(gameValues[playerRow - 1][5]) || 0;
    }
  }
  
  if (dailyCount >= 3) {
    // Lấy điểm hiện tại để hiển thị
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
    // Chọn câu hỏi ngẫu nhiên từ Google Sheets theo lớp
    var grade = student.grade || "12";
    var allQuestions = [];
    var sheets = ss.getSheets();
    
    for (var s = 0; s < sheets.length; s++) {
      var sheetName = sheets[s].getName().toLowerCase();
      if (sheetName === 'hocsinh' || sheetName === 'deadlines' || sheetName === 'gamification' || sheetName === 'luyende') continue;
      
      var values = sheets[s].getDataRange().getValues();
      if (values.length <= HEADER_ROW) continue;
      
      for (var r = HEADER_ROW; r < values.length; r++) {
        var made = trimCell(values[r][COL.MADE]);
        if (!made) continue;
        var parts = made.split('_');
        if (parts.length < 2 || parts[1] !== grade) continue;
        
        var q = trimCell(values[r][COL.QUESTION]);
        var a = trimCell(values[r][COL.A]);
        var b = trimCell(values[r][COL.B]);
        var c = trimCell(values[r][COL.C]);
        var d = trimCell(values[r][COL.D]);
        var correct = trimCell(values[r][COL.CORRECT]).toUpperCase();
        
        // Chỉ lấy câu hỏi đầy đủ 4 đáp án
        if (q && a && b && c && d && correct) {
          allQuestions.push({
            made: made,
            qid: values[r][COL.ID],
            question: q, a: a, b: b, c: c, d: d,
            correct: correct
          });
        }
      }
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
      if (trimCell(gameValues[playerRow - 1][6]).toString() === today) {
        gameSheet.getRange(playerRow, 6).setValue(dailyCount + 1);
      } else {
        gameSheet.getRange(playerRow, 6).setValue(1);
        gameSheet.getRange(playerRow, 7).setValue(today);
      }
    } else {
      // Thêm dòng mới cho học sinh
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
  
  // Parse: q|Chosen|Correct|Made|QuestionID
  var parts = data.split('|');
  if (parts[0] !== 'q' || parts.length < 5) return;
  
  var chosen = parts[1];
  var correct = parts[2];
  var made = parts[3];
  var questionId = parts[4];
  var isCorrect = (chosen === correct);
  
  // Tìm lời giải thích từ Google Sheet
  var explanation = "";
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheets = ss.getSheets();
    for (var s = 0; s < sheets.length; s++) {
      var values = sheets[s].getDataRange().getValues();
      if (values.length <= HEADER_ROW) continue;
      for (var r = HEADER_ROW; r < values.length; r++) {
        if (trimCell(values[r][COL.MADE]) === made && String(values[r][COL.ID]) === String(questionId)) {
          explanation = trimCell(values[r][COL.EXPLANATION]);
          break;
        }
      }
      if (explanation) break;
    }
  } catch (e) {
    Logger.log("Lỗi tra explanation: " + e.message);
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
  
  sendTelegramMessage(chatId, resultMsg);
}

// ═══════════════════════════════════════════════════════════════
// GAMIFICATION — Cập nhật điểm tích lũy
// ═══════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════
// GAMIFICATION — Cập nhật chuỗi ngày học & kiểm tra huy hiệu
// ═══════════════════════════════════════════════════════════════
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
      // Đã cập nhật hôm nay rồi, trả về streak hiện tại
      return parseInt(values[r][1]) || 0;
    }
    
    var currentStreak = parseInt(values[r][1]) || 0;
    var maxStreak = parseInt(values[r][2]) || 0;
    
    if (lastActive === yesterday) {
      currentStreak++; // Tiếp tục chuỗi
    } else {
      currentStreak = 1; // Reset chuỗi
    }
    
    if (currentStreak > maxStreak) maxStreak = currentStreak;
    
    gameSheet.getRange(r + 1, 2).setValue(currentStreak);
    gameSheet.getRange(r + 1, 3).setValue(maxStreak);
    gameSheet.getRange(r + 1, 5).setValue(today);
    
    // Kiểm tra mốc huy hiệu
    checkBadgeMilestone(email, currentStreak);
    
    return currentStreak;
  }
  return 0;
}

// ═══════════════════════════════════════════════════════════════
// GAMIFICATION — Gửi thông báo huy hiệu khi đạt mốc
// ═══════════════════════════════════════════════════════════════
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
  
  // Tìm chatId và tên học sinh
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

// ═══════════════════════════════════════════════════════════════
// THIẾT LẬP WEBHOOK — Chạy 1 lần duy nhất để kết nối Bot ↔ Apps Script
// ═══════════════════════════════════════════════════════════════
function setTelegramWebhook() {
  // ⚠️ THAY URL DƯỚI ĐÂY BẰNG WEB APP URL CỦA BẠN (lấy từ Deploy > Manage Deployments)
  var webAppUrl = "ĐIỀN_WEB_APP_URL_CỦA_BẠN_VÀO_ĐÂY";
  
  var url = "https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/setWebhook?url=" + encodeURIComponent(webAppUrl) + "&drop_pending_updates=true";
  var res = UrlFetchApp.fetch(url);
  Logger.log("Kết quả đăng ký Webhook: " + res.getContentText());
}

