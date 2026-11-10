/**
 * ═══════════════════════════════════════════════════════════════
 * Zphysics — Supabase Auth & Session Manager
 * Chuẩn xác thực Google OAuth & RLS Token Security
 * ═══════════════════════════════════════════════════════════════
 */

const SUPABASE_URL = 'https://uztfmglzpfrwvamuggwx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_XdBJ6z0Yj_nQyvn7FSemew_B8ewlDOM';
const SESSION_KEY = 'zphysics_session';

// Khởi tạo Supabase Client
let sbClient = null;
if (window.supabase) {
  sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
}

/**
 * Đăng nhập bằng Google OAuth (1-chạm)
 */
async function loginWithGoogle() {
  if (!sbClient) {
    alert('Thư viện xác thực đang tải, vui lòng thử lại sau giây lát!');
    return;
  }
  
  // Xác định URL chuyển hướng sau khi đăng nhập thành công
  let redirectUrl = window.location.origin + '/index.html';
  if (window.location.pathname.endsWith('landing.html')) {
    redirectUrl = window.location.origin + '/index.html';
  } else {
    redirectUrl = window.location.origin + window.location.pathname;
  }

  try {
    const { data, error } = await sbClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl
      }
    });
    if (error) throw error;
  } catch (err) {
    console.error('Lỗi khởi tạo Google OAuth:', err);
    alert('Không thể kết nối với dịch vụ Google: ' + (err.message || 'Lỗi mạng'));
  }
}

/**
 * Đăng nhập nhanh chế độ dùng thử (Demo)
 */
function loginDemo(isPremium) {
  const sessionObj = {
    gmail: isPremium ? 'demo_premium@zphysics.vn' : 'demo_free@zphysics.vn',
    ten: isPremium ? 'Học sinh VIP Demo' : 'Học sinh Dùng thử',
    lop: '12',
    premium: !!isPremium,
    premium_until: null,
    access_token: null
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessionObj));
  window.location.href = 'index.html';
}

/**
 * Lấy header Authorization chuẩn (sử dụng Token JWT nếu có)
 */
function getAuthHeaders(session) {
  const token = (session && session.access_token) ? session.access_token : SUPABASE_ANON_KEY;
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${token}`
  };
}

/**
 * Lấy phiên đăng nhập hiện tại và đồng bộ với bảng students
 */
async function syncAndGetAuthSession() {
  // 1. Kiểm tra session demo offline trước
  try {
    const rawLocal = localStorage.getItem(SESSION_KEY);
    if (rawLocal) {
      const parsed = JSON.parse(rawLocal);
      if (parsed && parsed.gmail && parsed.gmail.startsWith('demo_')) {
        return parsed;
      }
    }
  } catch (e) {}

  if (!sbClient) {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  try {
    // 2. Lấy session từ Supabase Auth
    const { data: { session }, error: sessionError } = await sbClient.auth.getSession();
    if (sessionError || !session || !session.user) {
      // Nếu có session trong URL hash, đợi Supabase client parse
      if (window.location.hash && window.location.hash.includes('access_token')) {
        const { data: newSession } = await sbClient.auth.onAuthStateChange(async (event, currentSession) => {
          if (currentSession && currentSession.user) {
            window.location.hash = '';
            window.location.reload();
          }
        });
      }
      return null;
    }

    const user = session.user;
    const email = (user.email || '').toLowerCase();
    const token = session.access_token;

    // 3. Truy vấn bảng students bằng chính Token của học sinh (RLS Authenticated)
    const { data: student, error: studentError } = await sbClient
      .from('students')
      .select('email, full_name, lop, role, premium_until')
      .eq('email', email)
      .maybeSingle();

    let isPremium = false;
    let ten = user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0];
    let lop = '';
    let premiumUntil = null;

    if (student) {
      if (student.full_name) ten = student.full_name;
      if (student.lop) lop = student.lop;
      premiumUntil = student.premium_until;
      isPremium = student.role === 'premium';
      if (isPremium && premiumUntil) {
        if (new Date(premiumUntil) < new Date()) {
          isPremium = false;
        }
      }
    }

    const sessionObj = {
      gmail: email,
      ten: ten,
      lop: lop,
      premium: isPremium,
      premium_until: premiumUntil,
      access_token: token
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionObj));

    // Làm sạch URL hash nếu vừa hoàn tất chuyển hướng OAuth
    if (window.location.hash && window.location.hash.includes('access_token')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    return sessionObj;
  } catch (err) {
    console.warn('Lỗi đồng bộ Auth session:', err);
    try {
      const cached = localStorage.getItem(SESSION_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  }
}

/**
 * Đăng xuất học sinh
 */
async function logoutStudent() {
  localStorage.removeItem(SESSION_KEY);
  if (sbClient) {
    try {
      await sbClient.auth.signOut();
    } catch (e) {}
  }
  window.location.href = 'landing.html';
}
