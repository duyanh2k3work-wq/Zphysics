/**
 * ═══════════════════════════════════════════════════════════════
 * Zphysics — Google Sheets Database Operations
 * ═══════════════════════════════════════════════════════════════
 */

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
      var lop = values[r][2] ? String(values[r][2]).trim() : '';
      var loai = values[r][3] ? String(values[r][3]).trim().toLowerCase() : 'free';
      var premiumUntilVal = values[r][4];
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
        premium_until: premiumUntilISO,
        lop: lop
      };
    }
  }
  
  return { valid: false, message: 'Gmail chưa được đăng ký. Hãy liên hệ thầy/cô để được thêm vào danh sách.' };
}

// Đăng ký học sinh mới
function registerStudent(gmail, name, lop) {
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
      var lopDb = values[r][2] ? String(values[r][2]).trim() : '';
      var loai = values[r][3] ? String(values[r][3]).trim().toLowerCase() : 'free';
      var premiumUntilVal = values[r][4];
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
        premium_until: premiumUntilISO,
        lop: lopDb
      };
    }
  }
  
  // Thêm vào dòng cuối cùng của sheet (cột C chứa lop, cột D 'free')
  sheet.appendRow([gmail, name, lop || '', 'free', '', '']);
  
  // Đồng bộ tức thời sang Supabase
  try {
    supabaseRequest('students', 'POST', [{
      email: gmail,
      full_name: name,
      lop: lop || '',
      role: 'free',
      premium_until: null
    }]);
  } catch (err) {
    console.warn("Lỗi đồng bộ đăng ký Supabase: " + err.message);
  }
  
  return { success: true, isNew: true, ten: name, premium: false, premium_until: null, lop: lop || '' };
}

// Nâng cấp tài khoản Premium cho học sinh
function upgradePremium(gmail) {
  if (!gmail) return { success: false, message: 'Gmail không được để trống' };
  
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
  
  var values = sheet.getDataRange().getValues();
  var foundRow = -1;
  for (var r = 1; r < values.length; r++) {
    var rowGmail = String(values[r][0]).trim().toLowerCase();
    if (rowGmail === gmail) {
      foundRow = r + 1; // 1-indexed row number in sheet
      break;
    }
  }
  
  if (foundRow === -1) {
    return { success: false, message: 'Không tìm thấy tài khoản học sinh' };
  }
  
  // Cập nhật cột D (Loại tài khoản) thành 'premium'
  // Cột E (Hạn dùng) thành trống (trọn đời)
  sheet.getRange(foundRow, 4).setValue('premium');
  sheet.getRange(foundRow, 5).setValue('');
  
  // Đồng bộ sang Supabase
  try {
    supabaseRequest('students?email=eq.' + encodeURIComponent(gmail), 'PATCH', {
      role: 'premium',
      premium_until: null
    });
  } catch (err) {
    console.warn("Lỗi đồng bộ Supabase khi nâng cấp Premium: " + err.message);
  }
  
  return { success: true, message: 'Nâng cấp Premium thành công', premium: true, premium_until: null };
}

// Thiết lập header mặc định cho sheet hiện tại
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

// Lấy tiêu đề bài học từ lessonId
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

// Tìm thông tin học sinh bằng Telegram Chat ID
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
