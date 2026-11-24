-- ============================================================================
-- Zphysics — Supabase Security Hardening (RLS + Exam Answer Protection RPC)
-- ============================================================================
-- Chạy toàn bộ script này trong Supabase Dashboard -> SQL Editor -> New query.
-- Script thiết kế theo chuẩn idempotent (chạy lại nhiều lần không lỗi).
-- Lưu ý: Giữ nguyên cấu trúc bảng để Google Apps Script đồng bộ bình thường
-- qua Secret Key (sb_secret_... / service_role), đồng thời khóa chặt quyền
-- truy cập từ trình duyệt (anon / authenticated).
-- ============================================================================

-- 1. BẬT ROW LEVEL SECURITY (RLS) CHO TOÀN BỘ 5 BẢNG
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_progress ENABLE ROW LEVEL SECURITY;

-- 2. XÓA TẤT CẢ POLICY CŨ (LỎNG LẺO) NẾU TỒN TẠI
DROP POLICY IF EXISTS "Allow public read questions" ON public.questions;
DROP POLICY IF EXISTS "Allow public read students" ON public.students;
DROP POLICY IF EXISTS "Allow public read lessons" ON public.lessons;
DROP POLICY IF EXISTS "Allow public read exams" ON public.exams;
DROP POLICY IF EXISTS "Allow student to read own progress" ON public.student_progress;
DROP POLICY IF EXISTS "Allow student to insert own progress" ON public.student_progress;
DROP POLICY IF EXISTS "Allow student to update own progress" ON public.student_progress;

-- Xóa lại các policy mới (đảm bảo chạy lại script không bị trùng tên)
DROP POLICY IF EXISTS "questions_select_authenticated" ON public.questions;
DROP POLICY IF EXISTS "lessons_select_authenticated" ON public.lessons;
DROP POLICY IF EXISTS "students_select_own" ON public.students;
DROP POLICY IF EXISTS "student_progress_select_own" ON public.student_progress;
DROP POLICY IF EXISTS "student_progress_insert_own" ON public.student_progress;
DROP POLICY IF EXISTS "student_progress_update_own" ON public.student_progress;

-- 3. KHÓA QUYỀN MỨC TABLE GRANT (CHỈ CHO ĐỌC/GHI ĐÚNG PHẠM VI)
REVOKE ALL ON public.students FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.students FROM authenticated;
GRANT SELECT ON public.students TO authenticated;

REVOKE ALL ON public.questions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.questions FROM authenticated;
GRANT SELECT ON public.questions TO authenticated;

REVOKE ALL ON public.lessons FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.lessons FROM authenticated;
GRANT SELECT ON public.lessons TO authenticated;

-- Bảng exams chứa đáp án & link PDF VIP -> KHÔNG cho client SELECT trực tiếp
REVOKE ALL ON public.exams FROM anon, authenticated;

REVOKE ALL ON public.student_progress FROM anon;
REVOKE DELETE ON public.student_progress FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.student_progress TO authenticated;

-- 4. TẠO CÁC POLICY CHUẨN XÁC THỰC JWT
-- Chỉ người dùng đã đăng nhập Google (authenticated) mới đọc được câu hỏi & bài học
CREATE POLICY "questions_select_authenticated"
  ON public.questions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "lessons_select_authenticated"
  ON public.lessons
  FOR SELECT
  TO authenticated
  USING (true);

-- Học sinh chỉ được đọc đúng 1 dòng hồ sơ của chính email trong JWT của mình
CREATE POLICY "students_select_own"
  ON public.students
  FOR SELECT
  TO authenticated
  USING (lower(email) = lower(COALESCE(auth.jwt() ->> 'email', '')));

-- Học sinh chỉ đọc/thêm/cập nhật tiến trình học tập của chính mình (điểm 0..10)
CREATE POLICY "student_progress_select_own"
  ON public.student_progress
  FOR SELECT
  TO authenticated
  USING (lower(email) = lower(COALESCE(auth.jwt() ->> 'email', '')));

CREATE POLICY "student_progress_insert_own"
  ON public.student_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (
    lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
    AND (score IS NULL OR (score >= 0 AND score <= 10))
  );

CREATE POLICY "student_progress_update_own"
  ON public.student_progress
  FOR UPDATE
  TO authenticated
  USING (lower(email) = lower(COALESCE(auth.jwt() ->> 'email', '')))
  WITH CHECK (
    lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
    AND (score IS NULL OR (score >= 0 AND score <= 10))
  );

-- 5. TRIGGER TỰ ĐỘNG TẠO HỒ SƠ FREE KHI HỌC SINH ĐĂNG NHẬP GOOGLE LẦN ĐẦU
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_name text;
BEGIN
  v_email := lower(trim(COALESCE(NEW.email, '')));
  IF v_email = '' THEN
    RETURN NEW;
  END IF;

  v_name := trim(COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name',
    split_part(v_email, '@', 1)
  ));

  INSERT INTO public.students (email, full_name, lop, role, premium_until)
  VALUES (v_email, v_name, '', 'free', NULL)
  ON CONFLICT (email) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_zphysics ON auth.users;
CREATE TRIGGER on_auth_user_created_zphysics
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;

-- 6. HÀM PHỤ TRỢ PARSE THỜI GIAN MỞ ĐỀ [OPEN: ...] (MÚI GIỜ VIỆT NAM GMT+7)
CREATE OR REPLACE FUNCTION public.parse_exam_open_at(p_desc text)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_match text[];
  v_raw text;
  v_parts text[];
  v_ts timestamp;
BEGIN
  IF p_desc IS NULL OR p_desc = '' THEN
    RETURN NULL;
  END IF;

  v_match := regexp_match(p_desc, '\[OPEN:\s*([^\]]+)\]', 'i');
  IF v_match IS NULL OR array_length(v_match, 1) < 1 THEN
    RETURN NULL;
  END IF;

  v_raw := trim(v_match[1]);
  IF v_raw = '' THEN
    RETURN NULL;
  END IF;

  -- Định dạng HH:MI DD/MM/YYYY (hỗ trợ HHhMI và dấu -)
  v_parts := regexp_match(v_raw, '^(\d{1,2})[:h](\d{2})\s+(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$', 'i');
  IF v_parts IS NOT NULL THEN
    v_ts := make_timestamp(
      v_parts[5]::int, v_parts[4]::int, v_parts[3]::int,
      v_parts[1]::int, v_parts[2]::int, 0
    );
    RETURN v_ts AT TIME ZONE 'Asia/Ho_Chi_Minh';
  END IF;

  -- Định dạng DD/MM/YYYY HH:MI (hỗ trợ HHhMI và dấu -)
  v_parts := regexp_match(v_raw, '^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\s+(\d{1,2})[:h](\d{2})$', 'i');
  IF v_parts IS NOT NULL THEN
    v_ts := make_timestamp(
      v_parts[3]::int, v_parts[2]::int, v_parts[1]::int,
      v_parts[4]::int, v_parts[5]::int, 0
    );
    RETURN v_ts AT TIME ZONE 'Asia/Ho_Chi_Minh';
  END IF;

  RETURN v_raw::timestamptz;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- 7. HÀM KIỂM TRA HỌC SINH HIỆN TẠI CÓ QUYỀN PREMIUM HỢP LỆ HAY KHÔNG
CREATE OR REPLACE FUNCTION public.is_current_user_premium()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1
      FROM public.students s
      WHERE lower(s.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
        AND lower(COALESCE(s.role, '')) = 'premium'
        AND (s.premium_until IS NULL OR s.premium_until > now())
    );
$$;

REVOKE ALL ON FUNCTION public.is_current_user_premium() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_premium() TO anon, authenticated;

-- 8. RPC LẤY DANH MỤC ĐỀ THI CHO TRANG CHỦ (KHÔNG TRẢ ĐÁP ÁN & KHÔNG TRẢ LINK PDF)
CREATE OR REPLACE FUNCTION public.get_exam_catalog()
RETURNS TABLE (
  id text,
  title text,
  description text,
  duration integer,
  grade text,
  has_video boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.title,
    e.description,
    e.duration,
    e.grade,
    (
      e.video_url IS NOT NULL
      AND trim(e.video_url) NOT IN ('', '#', 'null', 'undefined')
    ) AS has_video
  FROM public.exams e
  ORDER BY e.id;
$$;

REVOKE ALL ON FUNCTION public.get_exam_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_exam_catalog() TO authenticated;

-- 9. RPC LẤY THÔNG TIN ĐỀ THI ĐÃ MỞ (ẨN PDF_URL NẾU CHƯA TỚI GIỜ MỞ, KHÔNG BAO GIỜ TRẢ ĐÁP ÁN)
CREATE OR REPLACE FUNCTION public.get_unlocked_exam(p_exam_id text)
RETURNS TABLE (
  id text,
  title text,
  description text,
  duration integer,
  grade text,
  pdf_url text,
  video_url text,
  mc_count integer,
  tf_count integer,
  sa_count integer,
  locked boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target text;
  v_exam public.exams%ROWTYPE;
  v_open_at timestamptz;
  v_is_locked boolean;
BEGIN
  v_target := lower(trim(COALESCE(p_exam_id, '')));
  IF v_target = '' THEN
    v_target := 'de_thi_thu_01';
  END IF;

  IF v_target <> 'de_thi_thu_01' AND NOT public.is_current_user_premium() THEN
    RAISE EXCEPTION 'PREMIUM_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_exam
  FROM public.exams e
  WHERE lower(trim(e.id)) = v_target
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_open_at := public.parse_exam_open_at(v_exam.description);
  v_is_locked := (v_open_at IS NOT NULL AND v_open_at > now());

  IF v_is_locked THEN
    RETURN QUERY SELECT
      v_exam.id,
      v_exam.title,
      v_exam.description,
      v_exam.duration,
      v_exam.grade,
      NULL::text,
      NULL::text,
      0,
      0,
      0,
      true;
  ELSE
    RETURN QUERY SELECT
      v_exam.id,
      v_exam.title,
      v_exam.description,
      v_exam.duration,
      v_exam.grade,
      v_exam.pdf_url,
      v_exam.video_url,
      (SELECT count(*)::int FROM unnest(string_to_array(COALESCE(v_exam.mc_answers, ''), ',')) AS t(v) WHERE trim(t.v) <> ''),
      (SELECT count(*)::int FROM unnest(string_to_array(COALESCE(v_exam.tf_answers, ''), ';')) AS t(v) WHERE trim(t.v) <> ''),
      (SELECT count(*)::int FROM unnest(string_to_array(COALESCE(v_exam.sa_answers, ''), ';')) AS t(v) WHERE trim(t.v) <> ''),
      false;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_unlocked_exam(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_unlocked_exam(text) TO anon, authenticated;

-- 10. RPC LẤY ĐÁP ÁN CHỈ KHI NỘP BÀI (CHẶN LẤY TRƯỚC KHI MỞ ĐỀ HOẶC KHÔNG CÓ QUYỀN)
CREATE OR REPLACE FUNCTION public.get_exam_answer_key(p_exam_id text)
RETURNS TABLE (
  mc_answers text,
  tf_answers text,
  sa_answers text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target text;
  v_exam public.exams%ROWTYPE;
  v_open_at timestamptz;
BEGIN
  v_target := lower(trim(COALESCE(p_exam_id, '')));
  IF v_target = '' THEN
    v_target := 'de_thi_thu_01';
  END IF;

  IF v_target <> 'de_thi_thu_01' AND NOT public.is_current_user_premium() THEN
    RAISE EXCEPTION 'PREMIUM_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_exam
  FROM public.exams e
  WHERE lower(trim(e.id)) = v_target
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_open_at := public.parse_exam_open_at(v_exam.description);
  IF v_open_at IS NOT NULL AND v_open_at > now() THEN
    RAISE EXCEPTION 'EXAM_LOCKED' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY SELECT
    v_exam.mc_answers,
    v_exam.tf_answers,
    v_exam.sa_answers;
END;
$$;

REVOKE ALL ON FUNCTION public.get_exam_answer_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_exam_answer_key(text) TO anon, authenticated;
