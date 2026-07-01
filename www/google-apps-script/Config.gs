/**
 * ═══════════════════════════════════════════════════════════════
 * Zphysics — Config & Global Constants (Secure Version)
 * ═══════════════════════════════════════════════════════════════
 */

var HEADER_ROW = 1;

// Cột dịch sang phải 1 đơn vị so với bản cũ
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
// CẤU HÌNH SUPABASE & TELEGRAM BOT (Đọc từ Script Properties để bảo mật)
// =========================================================================
var scriptProperties = PropertiesService.getScriptProperties();

// URL và Anon Key có thể để mặc định vì là thông tin công khai
var SUPABASE_URL = scriptProperties.getProperty('SUPABASE_URL') || "https://uztfmglzpfrwvamuggwx.supabase.co";
var SUPABASE_ANON_KEY = scriptProperties.getProperty('SUPABASE_ANON_KEY') || "sb_publishable_XdBJ6z0Yj_nQyvn7FSemew_B8ewlDOM";

// CÁC KHÓA BẢO MẬT CAO: Đọc trực tiếp từ môi trường bảo mật của Google, KHÔNG ghi đè thô vào code
var SUPABASE_KEY = scriptProperties.getProperty('SUPABASE_KEY'); 
var TELEGRAM_BOT_TOKEN = scriptProperties.getProperty('TELEGRAM_BOT_TOKEN');

var WEB_APP_URL = scriptProperties.getProperty('WEB_APP_URL') || "https://zphysics.io.vn";
// =========================================================================
