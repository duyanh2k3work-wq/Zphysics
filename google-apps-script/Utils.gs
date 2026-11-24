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

// Định dạng thời gian mở đề từ chuỗi hoặc Date object
function formatScheduleTime(val) {
  if (!val) return '';
  if (val instanceof Date) {
    var pad = function(n) { return (n < 10 ? '0' : '') + n; };
    return pad(val.getHours()) + ':' + pad(val.getMinutes()) + ' ' + pad(val.getDate()) + '/' + pad(val.getMonth() + 1) + '/' + val.getFullYear();
  }
  return trimCell(val);
}

// So sánh chuỗi theo thời gian hằng số để tránh timing attack
function constantTimeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length === 0 || a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// Xác thực Supabase JWT Access Token thông qua /auth/v1/user
function verifySupabaseAccessToken(accessToken) {
  if (typeof accessToken !== 'string') return null;
  var token = accessToken.trim();
  if (token.length < 20) return null;

  var baseUrl = trimCell(SUPABASE_URL).replace(/\/+$/, '');
  var anonKey = trimCell(SUPABASE_ANON_KEY);
  if (!baseUrl || !anonKey) return null;

  try {
    var res = UrlFetchApp.fetch(baseUrl + '/auth/v1/user', {
      'method': 'get',
      'headers': {
        'apikey': anonKey,
        'Authorization': 'Bearer ' + token
      },
      'muteHttpExceptions': true
    });
    if (res.getResponseCode() !== 200) return null;

    var user = JSON.parse(res.getContentText() || '{}');
    if (!user || !user.email) return null;

    var metaName = '';
    if (user.user_metadata) {
      metaName = user.user_metadata.full_name || user.user_metadata.name || '';
    }

    return {
      id: user.id || '',
      email: String(user.email).trim().toLowerCase(),
      name: String(metaName).trim()
    };
  } catch (err) {
    Logger.log('Lỗi verifySupabaseAccessToken: ' + err.message);
    return null;
  }
}

// Giới hạn tần suất gọi API theo bucket trong CacheService
function checkRateLimit(bucketKey, maxHits, windowSeconds) {
  try {
    var cache = CacheService.getScriptCache();
    var safeKey = 'rl_' + String(bucketKey || 'default').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 180);
    var cur = parseInt(cache.get(safeKey) || '0', 10);
    if (isNaN(cur)) cur = 0;
    if (cur >= maxHits) {
      return false;
    }
    cache.put(safeKey, String(cur + 1), windowSeconds || 60);
    return true;
  } catch (err) {
    return true;
  }
}

