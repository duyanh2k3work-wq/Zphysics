/**
 * ZPHYSICS GAMIFICATION & ALBERT EINSTEIN OFFICIAL STICKERS CONTROLLER
 */

const EINSTEIN_STATES = {
  streak: {
    id: 'streak',
    name: 'Bất Khả Chiến Bại 😎',
    tag: 'UNSTOPPABLE • 🔥 833 NGÀY',
    tagClass: 'streak-high',
    headline: 'Thần đồng Vật lí! Bất khả chiến bại!',
    quote: 'Albert Einstein: "Trọng lực có thể bẻ cong không thời gian, nhưng không thể bẻ cong điểm 10 Vật lí của em!"',
    badgeText: '🔥 833',
    imgUrl: 'assets/stickers/einstein-streak-833.png',
    btnText: 'TIẾP TỤC CHINH PHỤC 🏆',
    btnClass: 'green',
    action: () => {
      const firstCard = document.querySelector('.ch-card');
      if (firstCard) firstCard.scrollIntoView({ behavior: 'smooth' });
    }
  },
  danger: {
    id: 'danger',
    name: 'Báo Động Cháy ⚠️',
    tag: 'LAST CHANCE • 🔥 300 NGÀY',
    tagClass: 'streak-danger',
    headline: 'Cháy phòng Lab rồi! Mau cứu chuỗi!',
    quote: 'Albert Einstein: "Nguy cấp quá! Giấy công thức E = mc² đang bốc cháy dữ dội! Còn ít phút để giải 1 bài trắc nghiệm!"',
    badgeText: '⚠️ 300',
    imgUrl: 'assets/stickers/einstein-crisis-300.png',
    btnText: 'CỨU CHUỖI KHẨN CẤP ⚡',
    btnClass: 'red',
    action: () => {
      window.location.href = 'l.html';
    }
  },
  lost: {
    id: 'lost',
    name: 'Thí Nghiệm Nổ 💥',
    tag: 'STREAK LOST • 💧 0 NGÀY',
    tagClass: 'streak-lost',
    headline: 'Thí nghiệm nổ tung! Bác Einstein khóc...',
    quote: 'Albert Einstein: "Thất bại chỉ là bài học trong phòng thí nghiệm. Bác cháu ta cùng bắt đầu lại nào!"',
    badgeText: '💧 0',
    imgUrl: 'assets/stickers/einstein-lost-soot.png',
    btnText: 'LÀM LẠI THÍ NGHIỆM 🧪',
    btnClass: 'green',
    action: () => {
      const qLink = document.querySelector('.lnk-tracNghiem');
      if (qLink) qLink.click();
    }
  },
  practice: {
    id: 'practice',
    name: 'Thè Lưỡi Ôn Bài 😛',
    tag: 'TIME TO PRACTICE • 🔥 45 NGÀY',
    tagClass: 'streak-normal',
    headline: 'Đến giờ luyện tập! Nạp nhanh công thức!',
    quote: 'Albert Einstein: "E = mc²? Dễ ợt! Hai thứ vô hạn trong vũ trụ là sự bao la của các vì sao và lòng hiếu học của em!"',
    badgeText: '🔥 45',
    imgUrl: 'assets/stickers/einstein-practice-45.png',
    btnText: 'VÀO HỌC NGAY 🚀',
    btnClass: 'green',
    action: () => {
      const firstCard = document.querySelector('.ch-card');
      if (firstCard) firstCard.scrollIntoView({ behavior: 'smooth' });
    }
  },
  ready: {
    id: 'ready',
    name: 'Ý Tưởng Sáng Tạo 💡',
    tag: 'READY TO PRACTICE • 🔥 1 NGÀY',
    tagClass: 'streak-normal',
    headline: 'Ý tưởng lóe sáng! Bắt đầu chuỗi mới!',
    quote: 'Albert Einstein: "Một ý tưởng Vật lí tuyệt vời vừa xuất hiện trên bảng kẹp hồ sơ! Cùng giải bài tập ngay nào!"',
    badgeText: '🔥 1',
    imgUrl: 'assets/stickers/einstein-ready-1.png',
    btnText: 'GIẢI BÀI TẬP NGAY 📝',
    btnClass: 'green',
    action: () => {
      const firstCard = document.querySelector('.ch-card');
      if (firstCard) firstCard.scrollIntoView({ behavior: 'smooth' });
    }
  },
  huddle: {
    id: 'huddle',
    name: 'Ủ Rũ Chờ Đợi 🥺',
    tag: 'STREAK LOST • ⚠️ CẢNH BÁO',
    tagClass: 'streak-lost',
    headline: 'Bác Einstein ngồi đợi em quay lại...',
    quote: 'Albert Einstein: "Đừng bỏ rơi phòng thí nghiệm nhé! Chỉ cần 5 phút hôm nay là ngọn lửa tri thức lại bừng sáng!"',
    badgeText: '⚠️ MẤT CHUỖI',
    imgUrl: 'assets/stickers/einstein-lost-huddle.png',
    btnText: 'QUAY LẠI HỌC BÀI ❤️',
    btnClass: 'green',
    action: () => {
      const firstCard = document.querySelector('.ch-card');
      if (firstCard) firstCard.scrollIntoView({ behavior: 'smooth' });
    }
  },
  rain: {
    id: 'rain',
    name: 'Trời Mưa Luyện Đề 🌧️',
    tag: 'PRACTICE TODAY? • 🔥 833',
    tagClass: 'streak-normal',
    headline: 'Mưa rơi ngoài cửa, ngọn lửa trong tim!',
    quote: 'Albert Einstein: "Dù trời có đổ mưa tầm tã, bình dung dịch thí nghiệm vẫn ấm nồng nhiệt huyết giải đề thi thử!"',
    badgeText: '🔥 833',
    imgUrl: 'assets/stickers/einstein-rain-833.png',
    btnText: 'VÀO LUYỆN ĐỀ NGAY 🧪',
    btnClass: 'green',
    action: () => {
      window.location.href = 'l.html';
    }
  }
};

let currentEinsteinState = 'streak';

function setEinsteinState(stateKey) {
  const state = EINSTEIN_STATES[stateKey];
  if (!state) return;
  currentEinsteinState = stateKey;

  // Update Sticker Image
  const imgEl = document.getElementById('mascotSvg');
  if (imgEl) {
    imgEl.src = state.imgUrl;
    imgEl.alt = state.headline;
  }

  // Update Tag
  const tagEl = document.getElementById('mascotStatusTag');
  if (tagEl) {
    tagEl.className = 'mascot-status-tag ' + state.tagClass;
    tagEl.textContent = state.tag;
  }

  // Update Headline
  const headEl = document.getElementById('mascotHeadline');
  if (headEl) headEl.textContent = state.headline;

  // Update Quote
  const quoteEl = document.getElementById('mascotQuote');
  if (quoteEl) quoteEl.textContent = state.quote;

  // Update CTA button
  const btnEl = document.getElementById('mascotCtaBtn');
  if (btnEl) {
    btnEl.className = 'duo-btn-cta ' + state.btnClass;
    btnEl.textContent = state.btnText;
    btnEl.onclick = state.action;
  }

  // Update Active Button in State Switcher
  document.querySelectorAll('.state-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.state === stateKey);
  });

  // Update Topbar streak if available
  const topbarStreak = document.getElementById('topbarStreakText');
  if (topbarStreak && state.badgeText) {
    topbarStreak.textContent = state.badgeText.replace(/[^0-9]/g, '') || '14';
  }

  // Sound effect / Haptic feedback via Web Audio API
  playGamificationBoing();
}

// Gentle pleasant Duolingo-style Boing effect using Web Audio
function playGamificationBoing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(340, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(620, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
  } catch (e) {
    // Audio autoplay blocked or unsupported
  }
}

// Interactive Einstein quotes array on click
const EINSTEIN_RANDOM_QUOTES = [
  'Albert Einstein: "Học Vật lí không phải ghi nhớ, mà là mở cánh cửa nhìn thấy bí mật của Vũ trụ!"',
  'Albert Einstein: "Nếu em không thể giải thích cho đứa trẻ 6 tuổi hiểu, em chưa thực sự hiểu nó!"',
  'Albert Einstein: "Logic đưa em từ A đến B. Trí tưởng tượng và Vật lí đưa em đến mọi nơi!"',
  'Albert Einstein: "Công thức đẹp nhất là công thức biến điểm kém thành điểm 10!"',
  'Albert Einstein: "Đừng bao giờ từ bỏ những gì bạn thực sự muốn làm. Người có ước mơ lớn luôn mạnh mẽ hơn người có mọi sự thật!"'
];

function onMascotClick() {
  playGamificationBoing();
  const mascotImg = document.getElementById('mascotSvg');
  if (mascotImg) {
    mascotImg.style.transform = 'scale(1.15) rotate(-5deg)';
    setTimeout(() => {
      mascotImg.style.transform = '';
    }, 280);
  }
  const quoteEl = document.getElementById('mascotQuote');
  if (quoteEl) {
    const randomQuote = EINSTEIN_RANDOM_QUOTES[Math.floor(Math.random() * EINSTEIN_RANDOM_QUOTES.length)];
    quoteEl.textContent = randomQuote;
  }
}

// Auto init on page load
document.addEventListener('DOMContentLoaded', () => {
  setEinsteinState('streak');
});
