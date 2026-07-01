/**
 * ═══════════════════════════════════════════════════════════════
 * Zphysics — General Utilities & Helpers
 * ═══════════════════════════════════════════════════════════════
 */

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

// Cắt khoảng trắng đầu cuối của một ô
function trimCell(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

// Kiểm tra giá trị trống
function isEmpty(value) {
  return value === '' || value === null || value === undefined;
}

// Phân tích ID câu hỏi
function parseQuestionId(rawId, zeroBasedIndex) {
  if (typeof rawId === 'number' && !isNaN(rawId)) {
    return Math.floor(rawId);
  }
  var n = parseInt(String(rawId).trim(), 10);
  if (!isNaN(n)) return n;
  return zeroBasedIndex + 1;
}
