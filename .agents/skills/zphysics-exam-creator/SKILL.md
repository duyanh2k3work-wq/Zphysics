---
name: zphysics-exam-creator
description: >-
  Tự động soạn thảo đề thi thử Vật lý chuẩn cấu trúc Bộ GD&ĐT (GDPT 2018), kết xuất PDF qua mẫu HTML A4, tải lên Google Drive và đồng bộ vào Google Sheet Ngân hàng đề Zphysics (tab LuyenDe). Kích hoạt khi người dùng muốn tạo đề thi, soạn đề ôn tập, kiểm tra định kỳ cho khối 10, 11 hoặc 12.
---

# Zphysics Exam Creator Skill

Skill chuyên trách tạo và triển khai đề thi thử / đề luyện tập Vật lí chuẩn Bộ GD&ĐT (Chương trình GDPT 2018) cho hệ thống **Zphysics**.

---

## 1. Thông Tin & ID Cố Định Của Hệ Thống

Không cần tìm kiếm hay hỏi lại người dùng về các thông tin này:
- **Thư mục Google Drive Đề thi (PDF):** `1Qd75nHk5Da8V7GVUCDNO2TzhDGk_AolN`
  - Đảm bảo quyền kế thừa xem công khai (`anyoneWithLink`).
  - URL nhúng preview chuẩn: `https://drive.google.com/file/d/<FILE_ID>/view?usp=sharing` (hoặc `https://drive.google.com/uc?export=view&id=<FILE_ID>`).
- **Google Sheet Ngân hàng đề:** `1-RbwBWS_d7tWkLJvtkZg7s5yF9qVLaGe_N_Owgxe2r4`
  - Tab mục tiêu: `LuyenDe`
- **Mẫu HTML A4 in ấn:** `assets/exam_template.html` (trong thư mục gốc dự án Zphysics).

---

## 2. Quy Cách Soạn Đề Thi (Chuẩn GDPT 2018)

Mỗi đề thi 50 phút bao gồm 3 phần với cấu trúc:

1. **PHẦN I: Trắc nghiệm nhiều phương án lựa chọn (18 câu)**
   - Câu 1 đến 18: Mỗi câu có 4 lựa chọn (A, B, C, D), chỉ có 1 phương án đúng.
   - Định dạng chuỗi đáp án: `A,B,C,D,A,B,C,D,A,B,C,D,A,B,C,D,A,B` (18 ký tự phân cách bằng dấu phẩy).

2. **PHẦN II: Trắc nghiệm Đúng / Sai (4 câu)**
   - Câu 1 đến câu 4: Mỗi câu là một bối cảnh/hiện tượng với 4 mệnh đề phụ a), b), c), d). Thí sinh chọn Đúng (Đ) hoặc Sai (S).
   - Định dạng chuỗi đáp án: Mỗi câu gồm 4 ý phân cách bởi dấu phẩy, giữa các câu phân cách bởi dấu chấm phẩy:
     `Đ,S,Đ,S;S,Đ,S,Đ;Đ,Đ,S,S;S,S,Đ,Đ` (Đúng 4 cụm, mỗi cụm 4 ký tự Đ/S).

3. **PHẦN III: Trắc nghiệm Trả lời ngắn (6 câu)**
   - Câu 1 đến câu 6: Yêu cầu tính toán ra một giá trị số cụ thể (nguyên hoặc thập phân).
   - Định dạng chuỗi đáp án: 6 số phân cách bởi dấu chấm phẩy, hỗ trợ dấu phẩy hoặc chấm thập phân:
     `10;-2.5;300;1.5;20;45`

4. **Yêu cầu kỹ thuật:**
   - Công thức Vật lý / Toán học: Viết bằng KaTeX inline `$ ... $` hoặc block `$$ ... $$`.
   - Hình vẽ minh họa: Sử dụng vector `<svg>` trực tiếp bên trong HTML (để hình sắc nét, không vỡ hạt khi in PDF).

---

## 3. Quy Trình Thực Hiện (Workflow 4 Bước)

### Bước 1: Soạn nội dung và điền mẫu HTML
- Đọc mẫu tại `assets/exam_template.html`.
- Thay thế các placeholder:
  - `{{EXAM_TITLE}}`: Tên đề (VD: `Đề thi thử THPT Quốc gia - Số 05`)
  - `{{EXAM_CODE}}`: Mã đề (VD: `101`, `204`, v.v.)
  - `{{GRADE}}`: Khối lớp (`10`, `11`, hoặc `12`)
  - `{{ACADEMIC_YEAR}}`: Năm học hiện tại
  - `{{DURATION}}`: Thời gian (`50`)
  - `{{PART_1_QUESTIONS}}`, `{{PART_2_QUESTIONS}}`, `{{PART_3_QUESTIONS}}`: Nội dung câu hỏi và các lựa chọn tương ứng.
- Lưu file HTML tạm ra một file làm việc, ví dụ: `assets/temp_exam.html`.

### Bước 2: Xuất PDF qua Chrome Headless
Sử dụng Chrome / Edge headless để render ra file PDF chuẩn A4, loại bỏ header/footer mặc định của trình duyệt:
```powershell
chrome.exe --headless --disable-gpu --print-to-pdf="assets/temp_exam.pdf" --no-pdf-header-footer "file:///$((Get-Item assets/temp_exam.html).FullName)"
```
*(Nếu dùng Edge: `msedge.exe --headless ...`)*

### Bước 3: Đẩy file PDF lên Google Drive
- Upload file PDF vào thư mục Drive ID: `1Qd75nHk5Da8V7GVUCDNO2TzhDGk_AolN`.
- Lấy `fileId` sau khi upload và tạo link view: `https://drive.google.com/file/d/<fileId>/view?usp=sharing`.

### Bước 4: Đồng bộ vào Google Sheet `LuyenDe`
1. Đọc sheet `LuyenDe` từ Spreadsheet ID `1-RbwBWS_d7twKLJvtkZg7s5yF9qVLaGe_N_Owgxe2r4`.
2. Kiểm tra mã đề cuối cùng ở Cột A (`id`) để tự động tăng mã (ví dụ: `de_thi_thu_04` -> `de_thi_thu_05`).
3. Ghi dòng mới gồm đúng 10 cột (A -> J):
   - **A (id):** `de_thi_thu_XX`
   - **B (title):** Tên đề
   - **C (desc):** Mô tả (VD: `Đề thi thử THPT`, hoặc hẹn giờ `[OPEN: 15:00 20/11/2026]`)
   - **D (pdfUrl):** Link Drive file PDF vừa upload
   - **E (mcAnswers):** Chuỗi 18 đáp án Phần I (`A,B,C...`)
   - **F (tfAnswers):** Chuỗi 4 câu Phần II (`Đ,S,Đ,S;...`)
   - **G (saAnswers):** Chuỗi 6 đáp án Phần III (`10;2.5;...`)
   - **H (duration):** `50`
   - **I (lop):** `10`, `11` hoặc `12`
   - **J (videoUrl):** Link video chữa đề hoặc `#`
