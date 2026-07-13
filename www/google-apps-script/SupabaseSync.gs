/**
 * ═══════════════════════════════════════════════════════════════
 * Zphysics — Google Sheets ↔ Supabase Sync Engine
 * ═══════════════════════════════════════════════════════════════
 */

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
      var vals = sheet.getRange(row, 1, 1, 5).getValues()[0];
      var gmail = trimCell(vals[0]).toLowerCase();
      var ten = trimCell(vals[1]);
      var lop = trimCell(vals[2]);
      var loai = vals[3] ? trimCell(vals[3]).toLowerCase() : 'free';
      var premiumUntilISO = parseDateToISO(vals[4]);
      
      if (gmail) {
        var payload = {
          email: gmail,
          full_name: ten,
          lop: lop,
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
    var lop = trimCell(values[r][2]);
    var loai = values[r][3] ? trimCell(values[r][3]).toLowerCase() : 'free';
    var premiumUntilVal = values[r][4];
    var premiumUntilISO = parseDateToISO(premiumUntilVal);
    
    if (gmail) {
      students.push({
        email: gmail,
        full_name: ten,
        lop: lop,
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
