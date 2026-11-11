/**
 * ═══════════════════════════════════════════════════════════════
 * Zphysics — Supabase Auth & Session Manager
 * Chuẩn xác thực Google OAuth & RLS Token Security
 * ═══════════════════════════════════════════════════════════════
 */

var SUPABASE_URL = window.SUPABASE_URL || 'https://uztfmglzpfrwvamuggwx.supabase.co';
var SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'sb_publishable_XdBJ6z0Yj_nQyvn7FSemew_B8ewlDOM';
var SESSION_KEY = window.SESSION_KEY || 'zphysics_session';
var NATIVE_AUTH_REDIRECT_URL = 'com.zanh.zphysics://auth/callback';
var HANDLED_AUTH_URL_KEY = 'zphysics_handled_auth_url';

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

var nativeAuthListenerAttached = false;
var nativeAuthProcessingPromise = null;
var activeNativeAuthUrl = null;

function isNativeCapacitorApp() {
  try {
    return !!(
      window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform()
    );
  } catch (e) {
    return false;
  }
}

function getCapacitorPlugins() {
  return (window.Capacitor && window.Capacitor.Plugins) ? window.Capacitor.Plugins : {};
}

function isAuthCallbackUrl(rawUrl) {
  return typeof rawUrl === 'string' && rawUrl.toLowerCase().startsWith(NATIVE_AUTH_REDIRECT_URL);
}

function extractAuthParamsFromUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const queryParams = new URLSearchParams(parsed.search || '');
    const hashStr = parsed.hash && parsed.hash.startsWith('#') ? parsed.hash.slice(1) : (parsed.hash || '');
    const hashParams = new URLSearchParams(hashStr);
    const get = (key) => hashParams.get(key) || queryParams.get(key);
    return {
      access_token: get('access_token'),
      refresh_token: get('refresh_token'),
      code: get('code'),
      error: get('error'),
      error_description: get('error_description')
    };
  } catch (e) {
    return null;
  }
}

async function closeNativeBrowserSafely() {
  const { Browser } = getCapacitorPlugins();
  if (Browser && typeof Browser.close === 'function') {
    try {
      await Browser.close();
    } catch (e) {}
  }
}

function markHandledAuthUrl(rawUrl) {
  try {
    sessionStorage.setItem(HANDLED_AUTH_URL_KEY, rawUrl);
  } catch (e) {}
}

function isAuthUrlAlreadyHandled(rawUrl) {
  try {
    return sessionStorage.getItem(HANDLED_AUTH_URL_KEY) === rawUrl;
  } catch (e) {
    return false;
  }
}

function formatOAuthError(rawErr) {
  const text = String(rawErr || 'Lỗi không xác định');
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch (e) {
    return text;
  }
}

async function processNativeAuthUrl(rawUrl) {
  if (!sbClient || !isAuthCallbackUrl(rawUrl)) return null;
  if (isAuthUrlAlreadyHandled(rawUrl)) return null;

  if (nativeAuthProcessingPromise && activeNativeAuthUrl === rawUrl) {
    return nativeAuthProcessingPromise;
  }

  activeNativeAuthUrl = rawUrl;
  nativeAuthProcessingPromise = (async () => {
    await closeNativeBrowserSafely();

    const sub = document.getElementById('loginSubtitle');
    if (sub) sub.textContent = 'Đang xác thực tài khoản Google...';

    const params = extractAuthParamsFromUrl(rawUrl);
    if (!params) return null;

    if (params.error || params.error_description) {
      markHandledAuthUrl(rawUrl);
      const errMsg = params.error_description || params.error;
      console.error('Lỗi Auth từ deep link:', errMsg);
      alert('Đăng nhập Google thất bại: ' + formatOAuthError(errMsg));
      if (sub) sub.textContent = 'Đăng nhập không thành công. Vui lòng bấm thử lại!';
      return null;
    }

    if (params.code) {
      const { data, error } = await sbClient.auth.exchangeCodeForSession(params.code);
      markHandledAuthUrl(rawUrl);
      if (error) throw error;
      return data && data.session ? data.session : null;
    }

    if (params.access_token) {
      const { data, error } = await sbClient.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token || ''
      });
      markHandledAuthUrl(rawUrl);
      if (error) throw error;
      return data && data.session ? data.session : null;
    }

    return null;
  })()
    .catch((err) => {
      console.error('Lỗi xử lý callback Google OAuth trên app:', err);
      alert('Không thể hoàn tất đăng nhập Google trong ứng dụng: ' + (err.message || 'Lỗi xác thực'));
      return null;
    })
    .finally(() => {
      nativeAuthProcessingPromise = null;
      activeNativeAuthUrl = null;
    });

  return nativeAuthProcessingPromise;
}

function navigateToAppHomeAfterLogin() {
  if (window.location.pathname && window.location.pathname.toLowerCase().includes('landing')) {
    window.location.replace('index.html');
  } else {
    window.location.reload();
  }
}

function initNativeAuthBridge() {
  if (nativeAuthListenerAttached || !isNativeCapacitorApp()) return;
  const { App } = getCapacitorPlugins();
  if (!App || typeof App.addListener !== 'function') return;

  nativeAuthListenerAttached = true;
  try {
    App.addListener('appUrlOpen', async (event) => {
      const url = event && event.url;
      if (!isAuthCallbackUrl(url) || isAuthUrlAlreadyHandled(url)) return;

      const session = await processNativeAuthUrl(url);
      if (session && session.user) {
        const synced = await syncAndGetAuthSession();
        if (synced && synced.gmail) {
          navigateToAppHomeAfterLogin();
        }
      }
    });
  } catch (e) {
    nativeAuthListenerAttached = false;
    console.warn('Không thể đăng ký listener appUrlOpen:', e);
  }
}

initNativeAuthBridge();

/**
 * Đăng nhập bằng Google OAuth (1-chạm)
 */
async function loginWithGoogle() {
  if (!sbClient) {
    alert('Thư viện xác thực đang tải, vui lòng thử lại sau giây lát!');
    return;
  }

  const isNative = isNativeCapacitorApp();
  const { Browser } = getCapacitorPlugins();

  try {
    // Trên app Android/iOS (Capacitor): mở Chrome Custom Tabs & redirect về deep link của app
    if (isNative && Browser && typeof Browser.open === 'function') {
      initNativeAuthBridge();
      const { data, error } = await sbClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: NATIVE_AUTH_REDIRECT_URL,
          skipBrowserRedirect: true
        }
      });
      if (error) throw error;
      if (!data || !data.url) {
        throw new Error('Không lấy được liên kết đăng nhập Google.');
      }
      await Browser.open({
        url: data.url,
        toolbarColor: '#1a2255'
      });
      return;
    }

    // Trên trình duyệt web: chuyển hướng về /index.html sau khi đăng nhập xong
    const redirectUrl = window.location.origin + '/index.html';
    const { error } = await sbClient.auth.signInWithOAuth({
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
 * Chờ và lấy session Supabase chuẩn xác từ URL callback, deep link hoặc storage
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

  // 2. Nếu là app Capacitor cold-start từ deep link OAuth callback
  if (isNativeCapacitorApp()) {
    const { App } = getCapacitorPlugins();
    if (App && typeof App.getLaunchUrl === 'function') {
      try {
        const launch = await App.getLaunchUrl();
        if (launch && launch.url && isAuthCallbackUrl(launch.url)) {
          const nativeSession = await processNativeAuthUrl(launch.url);
          if (nativeSession && nativeSession.user) {
            return nativeSession;
          }
        }
      } catch (e) {
        console.warn('Lỗi đọc getLaunchUrl:', e);
      }
    }
  }

  // 3. Nếu trong URL web có hash/query OAuth callback
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  const isAuthCallback = hash.includes('access_token') || hash.includes('error') || search.includes('code=') || search.includes('error=');

  if (isAuthCallback) {
    // Kiểm tra lỗi nếu có từ Google / Supabase (ở hash hoặc query)
    if (hash.includes('error=') || search.includes('error=')) {
      const urlParams = extractAuthParamsFromUrl(window.location.href);
      const err = (urlParams && (urlParams.error_description || urlParams.error)) || 'Lỗi xác thực';
      console.error('Lỗi Auth từ URL callback:', err);
      alert('Đăng nhập Google thất bại: ' + formatOAuthError(err));
      try { history.replaceState(null, '', window.location.pathname); } catch (e) {}
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
