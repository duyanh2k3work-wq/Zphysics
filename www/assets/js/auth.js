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
 * Trích xuất tham số Auth từ URL hash (dành cho OAuth callback)
 */
function extractAuthFromHash() {
  const hash = window.location.hash ? window.location.hash.substring(1) : '';
  if (!hash) return null;

  const params = new URLSearchParams(hash);
  const error = params.get('error') || params.get('error_description');
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  return {
    hasAuth: !!(accessToken || error),
    error: error ? decodeURIComponent(error.replace(/\+/g, ' ')) : null,
    accessToken,
    refreshToken: refreshToken || ''
  };
}

/**
 * Đăng nhập bằng Google OAuth (1-chạm)
 */
async function loginWithGoogle() {
  if (!sbClient) {
    alert('Thư viện xác thực đang tải, vui lòng thử lại sau giây lát!');
    return;
  }
  
  // URL chuyển hướng sau khi đăng nhập thành công: luôn về index.html
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
    // 2. Kiểm tra xem có token từ Google OAuth chuyển hướng về trong URL hash không
    const authHash = extractAuthFromHash();

    if (authHash && authHash.error) {
      console.error('OAuth Hash Error:', authHash.error);
      alert('Đăng nhập Google thất bại: ' + authHash.error);
      history.replaceState(null, '', window.location.pathname + window.location.search);
      return null;
    }

    let session = null;

    if (authHash && authHash.accessToken) {
      // Chủ động nạp trực tiếp Token vào Supabase Client
      try {
        const { data: setRes, error: setErr } = await sbClient.auth.setSession({
          access_token: authHash.accessToken,
          refresh_token: authHash.refreshToken
        });
        if (setRes && setRes.session) {
          session = setRes.session;
        }
      } catch (setErr) {
        console.warn('sbClient.setSession warning:', setErr);
      }
      
      // Dọn sạch hash trên URL để an toàn và chuyên nghiệp
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    // 3. Nếu chưa có session, lấy từ bộ nhớ lưu trữ của Supabase
    if (!session) {
      const { data: getRes, error: getErr } = await sbClient.auth.getSession();
      if (!getErr && getRes && getRes.session) {
        session = getRes.session;
      }
    }

    // 4. Nếu vẫn chưa có session mà trước đó có hash accessToken, chờ thêm 1.5s phòng khi Supabase client đang parse ngầm
    if (!session && authHash && authHash.accessToken) {
      session = await new Promise((resolve) => {
        let finished = false;
        const { data: { subscription } } = sbClient.auth.onAuthStateChange((event, s) => {
          if (!finished && s && s.user) {
            finished = true;
            subscription.unsubscribe();
            resolve(s);
          }
        });
        setTimeout(() => {
          if (!finished) {
            finished = true;
            subscription.unsubscribe();
            resolve(null);
          }
        }, 1500);
      });
    }

    if (!session || !session.user) {
      return null;
    }

    const user = session.user;
    const email = (user.email || '').toLowerCase();
    const token = session.access_token;

    // 5. Truy vấn thông tin học sinh từ bảng students bằng JWT Token của chính học sinh (RLS Authenticated)
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
