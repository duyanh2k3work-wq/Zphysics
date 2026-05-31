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
    return jsonResponse({ success: false, error: String(err.message || err) });
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
  
  if (method === 'POST' && path.indexOf('questions') !== -1) {
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
  
  // 1. Xóa dữ liệu cũ
  supabaseRequest('students?email=not.is.null', 'DELETE');
  
  // 2. Insert dữ liệu mới
  if (students.length > 0) {
    supabaseRequest('students', 'POST', students);
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
