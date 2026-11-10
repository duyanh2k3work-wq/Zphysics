/**
 * ═══════════════════════════════════════════════════════════════
 * Zphysics — Supabase Auth & Session Manager
 * Chuẩn xác thực Google OAuth & RLS Token Security
 * ═══════════════════════════════════════════════════════════════
 */

var SUPABASE_URL = window.SUPABASE_URL || 'https://uztfmglzpfrwvamuggwx.supabase.co';
var SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'sb_publishable_XdBJ6z0Yj_nQyvn7FSemew_B8ewlDOM';
var SESSION_KEY = window.SESSION_KEY || 'zphysics_session';

// Khởi tạo Supabase Client
var sbClient = null;
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
  
  // Luôn chuyển hướng về /index.html sau khi đăng nhập xong
  const redirectUrl = window.location.origin + '/index.html';

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
 * Chờ và lấy session Supabase chuẩn xác từ URL callback hoặc storage
 */
async function resolveSupabaseSession() {
  if (!sbClient) return null;

  // 1. Kiểm tra session có sẵn trong storage
  try {
    const { data: { session: existing } } = await sbClient.auth.getSession();
    if (existing && existing.user) {
      return existing;
    }
  } catch (e) {}

  // 2. Nếu trong URL có hash OAuth callback
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  const isAuthCallback = hash.includes('access_token') || hash.includes('error') || search.includes('code=');

  if (isAuthCallback) {
    // Kiểm tra lỗi nếu có từ Google / Supabase
    if (hash.includes('error=')) {
      const params = new URLSearchParams(hash.substring(1));
      const err = params.get('error_description') || params.get('error');
      console.error('Lỗi Auth từ URL hash:', err);
      alert('Đăng nhập Google thất bại: ' + decodeURIComponent(err.replace(/\+/g, ' ')));
      try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) {}
      return null;
    }

    // Lắng nghe onAuthStateChange và kiểm tra song song mỗi 150ms
    return new Promise((resolve) => {
      let settled = false;
      let checkTimer = null;
      let authSub = null;

      const cleanup = () => {
        settled = true;
        if (checkTimer) {
          clearInterval(checkTimer);
          checkTimer = null;
        }
        if (authSub && typeof authSub.unsubscribe === 'function') {
          try { authSub.unsubscribe(); } catch (e) {}
        }
      };

      const finishWithSession = (s) => {
        if (settled) return;
        cleanup();
        try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) {}
        resolve(s);
      };

      // Đăng ký listener trước
      try {
        const subRes = sbClient.auth.onAuthStateChange((event, s) => {
          if (s && s.user) {
            finishWithSession(s);
          }
        });
        if (subRes && subRes.data && subRes.data.subscription) {
          authSub = subRes.data.subscription;
        }
      } catch (errSub) {
        console.warn('Lỗi onAuthStateChange:', errSub);
      }

      // Polling dự phòng mỗi 150ms
      checkTimer = setInterval(async () => {
        try {
          const { data: { session } } = await sbClient.auth.getSession();
          if (session && session.user) {
            finishWithSession(session);
          }
        } catch (e) {}
      }, 150);

      // Sau 5 giây nếu không nhận được session
      setTimeout(() => {
        if (!settled) {
          cleanup();
          resolve(null);
        }
      }, 5000);
    });
  }

  return null;
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
    // 2. Chờ lấy session từ Supabase Auth
    const session = await resolveSupabaseSession();

    if (!session || !session.user) {
      // Nếu không có session Supabase, thử dùng cache cục bộ cũ nếu có
      try {
        const cached = localStorage.getItem(SESSION_KEY);
        if (cached) {
          const c = JSON.parse(cached);
          if (c && c.gmail && !c.gmail.startsWith('demo_')) return c;
        }
      } catch (e) {}
      return null;
    }

    const user = session.user;
    const email = (user.email || '').toLowerCase();
    const token = session.access_token;

    // 3. Truy vấn thông tin học sinh từ bảng students bằng JWT Token của chính học sinh (RLS Authenticated)
    let student = null;
    try {
      const { data, error } = await sbClient
        .from('students')
        .select('email, full_name, lop, role, premium_until')
        .eq('email', email)
        .maybeSingle();
      if (!error && data) {
        student = data;
      }
    } catch (e) {
      console.warn('Lỗi đọc bảng students lần 1:', e);
    }

    // Nếu vừa tạo tài khoản mới tinh, trigger có thể mất vài trăm ms để ghi vào bảng -> Thử lại 1 lần
    if (!student) {
      await new Promise(r => setTimeout(r, 400));
      try {
        const { data } = await sbClient
          .from('students')
          .select('email, full_name, lop, role, premium_until')
          .eq('email', email)
          .maybeSingle();
        if (data) student = data;
      } catch (e) {}
    }

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
