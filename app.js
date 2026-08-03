"use strict";

const SUPABASE_CONFIG = window.VOCA_SUPABASE_CONFIG || {};
const SUPABASE_URL = SUPABASE_CONFIG.url || "";
const SUPABASE_PUBLISHABLE_KEY = SUPABASE_CONFIG.publishableKey || "";
const supabaseClient =
    window.supabase && SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
        ? window.supabase.createClient(
              SUPABASE_URL,
              SUPABASE_PUBLISHABLE_KEY,
              {
                  auth: {
                      persistSession: true,
                      autoRefreshToken: true,
                      detectSessionInUrl: true,
                  },
              },
          )
        : null;

const PROFILE_STORAGE_KEY = "voca-profile-v1";
const LEGACY_LOGIN_STORAGE_KEY = "voca-login-v1";
const USER_PROFILE_STORAGE_PREFIX = "voca-profile-v1:";
const DEFAULT_SHOP_ITEM_ID = "classic";
const DEFAULT_SHOP_ITEM = {
    id: DEFAULT_SHOP_ITEM_ID,
    name: "기본 프레임",
    symbol: "V",
    summary: "효과를 끈 기본 상태",
    accent: "#3a5ce0",
    skinClass: "shop-skin-classic",
};
const shopItems = [
    { id: "coral-spark", rank: 1, name: "코랄", price: 500, symbol: "C", summary: "배경만 바뀝니다.", accent: "#ff6f59", skinClass: "shop-skin-coral-spark" },
    { id: "amber-glow", rank: 2, name: "앰버", price: 1100, symbol: "A", summary: "배경만 바뀝니다.", accent: "#ff9f43", skinClass: "shop-skin-amber-glow" },
    { id: "gold-ink", rank: 3, name: "골드", price: 2200, symbol: "G", summary: "요소가 추가됩니다.", accent: "#ffd84f", skinClass: "shop-skin-gold-ink" },
    { id: "mint-page", rank: 4, name: "민트", price: 2600, symbol: "M", summary: "요소가 추가됩니다.", accent: "#37d67a", skinClass: "shop-skin-mint-page" },
    { id: "sky-notebook", rank: 5, name: "스카이", price: 3000, symbol: "S", summary: "애니메이션이 추가됩니다.", accent: "#3aa7ff", skinClass: "shop-skin-sky-notebook" },
    { id: "indigo-quill", rank: 6, name: "인디고", price: 3400, symbol: "I", summary: "애니메이션이 추가됩니다.", accent: "#536dfe", skinClass: "shop-skin-indigo-quill" },
    { id: "violet-verse", rank: 7, name: "바이올렛", price: 3900, symbol: "V", summary: "애니메이션이 추가됩니다.", accent: "#b45cff", skinClass: "shop-skin-violet-verse" },
    { id: "prism-lexicon", rank: 8, name: "프리즘", price: 4500, symbol: "P", summary: "무지개", accent: "#78f7ff", skinClass: "shop-skin-prism-lexicon" },
    { id: "globe-tongue", rank: 9, name: "글로브", price: 5200, symbol: "E", summary: "지구", accent: "#35d0a8", skinClass: "shop-skin-globe-tongue" },
    { id: "sunrise-fluent", rank: 10, name: "선라이즈", price: 6000, symbol: "F", summary: "태양", accent: "#ffbd3e", skinClass: "shop-skin-sunrise-fluent" },
    { id: "nova-native", rank: 11, name: "노바", price: 7200, symbol: "N", summary: "블랙홀", accent: "#8b5cf6", skinClass: "shop-skin-nova-native" },
];

const DEFAULT_PROFILE = {
    displayName: "단어 학습자",
    points: 0,
    level: 1,
    unlockedLessons: [1],
    lastAttendanceDate: "",
    attendanceCount: 0,
    theme: "light",
    defaultDirection: "meaning-to-word",
    ownedShopItems: [DEFAULT_SHOP_ITEM_ID],
    equippedShopItem: DEFAULT_SHOP_ITEM_ID,
    legacyImported: false,
};

let currentUser = null;
let remoteLeaderboardEntries = [];
let authActivationToken = 0;
let inviteStatus = { inviteApproved: false, isAdmin: false, currentCode: "" };

function normalizeProfile(savedProfile = {}) {
    const unlockedLessons = Array.isArray(savedProfile.unlockedLessons)
        ? savedProfile.unlockedLessons.map(Number).filter((id) => id >= 1 && id <= 5)
        : [1];
    const defaultDirection = ["meaning-to-word", "word-to-meaning", "mixed"].includes(
        savedProfile.defaultDirection,
    )
        ? savedProfile.defaultDirection
        : DEFAULT_PROFILE.defaultDirection;
    const validShopItemIds = new Set([DEFAULT_SHOP_ITEM_ID, ...shopItems.map((i) => i.id)]);
    const rawOwnedShopItems = Array.isArray(savedProfile.ownedShopItems)
        ? savedProfile.ownedShopItems
        : Array.isArray(savedProfile.owned_shop_items)
          ? savedProfile.owned_shop_items
          : DEFAULT_PROFILE.ownedShopItems;
    const ownedShopItems = Array.from(
        new Set([DEFAULT_SHOP_ITEM_ID, ...rawOwnedShopItems.map(String)]),
    ).filter((id) => validShopItemIds.has(id));
    const savedEquippedShopItem =
        typeof savedProfile.equippedShopItem === "string"
            ? savedProfile.equippedShopItem
            : typeof savedProfile.equipped_shop_item === "string"
              ? savedProfile.equipped_shop_item
              : DEFAULT_SHOP_ITEM_ID;
    const equippedShopItem = ownedShopItems.includes(savedEquippedShopItem)
        ? savedEquippedShopItem
        : DEFAULT_SHOP_ITEM_ID;

    return {
        ...DEFAULT_PROFILE,
        displayName:
            typeof savedProfile.displayName === "string" && savedProfile.displayName.trim()
                ? savedProfile.displayName.trim().slice(0, 12)
                : DEFAULT_PROFILE.displayName,
        points: Math.max(0, Math.floor(Number(savedProfile.points) || 0)),
        level: Math.max(1, Math.floor(Number(savedProfile.level) || 1)),
        unlockedLessons: Array.from(new Set([1, ...unlockedLessons])).sort((a, b) => a - b),
        lastAttendanceDate:
            typeof savedProfile.lastAttendanceDate === "string" ? savedProfile.lastAttendanceDate : "",
        attendanceCount: Math.max(0, Math.floor(Number(savedProfile.attendanceCount) || 0)),
        theme: savedProfile.theme === "dark" ? "dark" : "light",
        defaultDirection,
        ownedShopItems,
        equippedShopItem,
        legacyImported: Boolean(savedProfile.legacyImported),
    };
}

function loadProfile(storageKey = PROFILE_STORAGE_KEY) {
    try {
        return normalizeProfile(JSON.parse(localStorage.getItem(storageKey) || "{}"));
    } catch {
        return { ...DEFAULT_PROFILE };
    }
}

const profile = loadProfile();

function getUserProfileStorageKey(userId = currentUser && currentUser.id) {
    return userId ? `${USER_PROFILE_STORAGE_PREFIX}${userId}` : PROFILE_STORAGE_KEY;
}

function saveProfile() {
    try {
        localStorage.setItem(getUserProfileStorageKey(), JSON.stringify(profile));
    } catch {
        // 저장소가 차단된 환경에서는 현재 탭에서만 상태를 유지합니다.
    }
}

function fromDatabaseProfile(row) {
    return normalizeProfile({
        displayName: row.display_name,
        points: row.points,
        level: row.level,
        unlockedLessons: row.unlocked_lessons,
        lastAttendanceDate: row.last_attendance_date || "",
        attendanceCount: row.attendance_count,
        theme: row.theme,
        defaultDirection: row.default_direction,
        ownedShopItems: row.owned_shop_items,
        equippedShopItem: row.equipped_shop_item,
        legacyImported: row.legacy_imported,
    });
}

function getAuthRedirectUrl() {
    return `${window.location.origin}${window.location.pathname}`;
}

function applyServerProfile(serverProfile) {
    Object.assign(profile, fromDatabaseProfile(serverProfile));
    saveProfile();
    const currentEntry = remoteLeaderboardEntries.find((e) => e.isCurrent);
    if (currentEntry) {
        currentEntry.displayName = profile.displayName;
        currentEntry.points = profile.points;
        currentEntry.level = profile.level;
        currentEntry.equippedShopItem = profile.equippedShopItem;
    }
}

// ===== 영단어 데이터 (미니 모의고사 4회·5회 기준, 5과로 분할) =====
const lessons = [
    {
        id: 1, symbol: "I", price: 0, color: "#3a5ce0", background: "#eaf0ff",
        words: [
            { word: "warehouse", meaning: "창고" },
            { word: "industrial", meaning: "산업[공업]의" },
            { word: "practical", meaning: "실용적인" },
            { word: "manufacture", meaning: "제조하다" },
            { word: "store", meaning: "저장[보관]하다" },
            { word: "abandon", meaning: "버리다" },
            { word: "structurally", meaning: "구조적으로" },
            { word: "structure", meaning: "구조(물)" },
            { word: "sound", meaning: "견고한, 이상 없는" },
            { word: "adapt", meaning: "개조하다" },
            { word: "recycle", meaning: "재활용하다" },
            { word: "tear down", meaning: "허물다, 해체하다" },
            { word: "existing", meaning: "기존의, 현재 사용되는" },
            { word: "put up", meaning: "세우다, 짓다" },
            { word: "eco-friendly", meaning: "환경친화적인" },
            { word: "repurpose", meaning: "용도를 변경하다" },
            { word: "make sense", meaning: "앞뒤가 맞다" },
            { word: "convert", meaning: "전환하다, 개조하다" },
            { word: "eliminate", meaning: "제거하다, 없애다" },
            { word: "demolish", meaning: "철거하다" },
            { word: "psychology", meaning: "심리학" },
            { word: "psychological", meaning: "심리학적인" },
            { word: "psychologist", meaning: "심리학자" },
            { word: "satisfaction", meaning: "만족" },
            { word: "survey", meaning: "설문 조사" },
            { word: "research", meaning: "연구, 조사" },
            { word: "researcher", meaning: "연구자" },
            { word: "laboratory", meaning: "실험실, 연구실" },
            { word: "perform", meaning: "수행하다" },
            { word: "exchange", meaning: "교환하다" },
            { word: "participant", meaning: "참가자" },
            { word: "financially", meaning: "금전적으로, 재무적으로" },
            { word: "beneficial", meaning: "유익한, 이로운" },
            { word: "storage", meaning: "보관, 저장" },
            { word: "labor", meaning: "노동" },
            { word: "give access to", meaning: "...에 접근을 허가하다" },
            { word: "diverse", meaning: "다양한" },
            { word: "various", meaning: "다양한" },
            { word: "nationality", meaning: "국적" },
            { word: "social class", meaning: "사회 계급" },
            { word: "enhance", meaning: "높이다, 향상하다" },
            { word: "credibility", meaning: "신뢰성" },
            { word: "advantage", meaning: "장점" },
            { word: "conduct", meaning: "수행하다" },
        ],
    },
    {
        id: 2, symbol: "II", price: 250, color: "#16a06a", background: "#e8f8f1",
        words: [
            { word: "questionnaire", meaning: "설문지" },
            { word: "comparison", meaning: "비교" },
            { word: "available", meaning: "이용 가능한" },
            { word: "trend", meaning: "유행" },
            { word: "craft", meaning: "(수)공예" },
            { word: "architecture", meaning: "건축" },
            { word: "be content with", meaning: "...에 만족하다" },
            { word: "currently", meaning: "현재, 지금" },
            { word: "halt", meaning: "중단시키다" },
            { word: "release", meaning: "공개하다, 발표하다" },
            { word: "despite", meaning: "...에도 불구하고" },
            { word: "impressive", meaning: "인상적인" },
            { word: "enthusiasm", meaning: "열광" },
            { word: "generate", meaning: "발생시키다, 만들어내다" },
            { word: "completely", meaning: "완전히, 전적으로" },
            { word: "constantly", meaning: "끊임없이" },
            { word: "obstacle", meaning: "장애(물)" },
            { word: "improvement", meaning: "향상, 개선" },
            { word: "progress", meaning: "진보, 발전" },
            { word: "ideal", meaning: "이상적인" },
            { word: "device", meaning: "장치, 기구" },
            { word: "percentage", meaning: "백분율, 비율, 퍼센트" },
            { word: "overall", meaning: "전체의, 종합적인" },
            { word: "former", meaning: "(둘 중에서) 전자의" },
            { word: "latter", meaning: "후자의" },
            { word: "imply", meaning: "암시[시사]하다" },
            { word: "suspension bridge", meaning: "현수교" },
            { word: "suspend", meaning: "매달다" },
            { word: "hang", meaning: "매달다, 걸다" },
            { word: "distribute", meaning: "분배하다" },
            { word: "work out", meaning: "계획해[생각해] 내다" },
            { word: "weave", meaning: "짜다, 엮다" },
            { word: "date back to", meaning: "...까지 거슬러 올라가다" },
            { word: "olden", meaning: "옛날의" },
            { word: "conqueror", meaning: "정복자" },
            { word: "twist", meaning: "(줄, 끈 등을) 꼬다" },
            { word: "confidence", meaning: "자신감" },
            { word: "acceptance", meaning: "받아들임, 수락" },
            { word: "identity", meaning: "정체성" },
            { word: "maturity", meaning: "성숙" },
            { word: "mature", meaning: "성숙하다" },
            { word: "lead a life", meaning: "생활하다, 삶을 살다" },
            { word: "parental", meaning: "부모의" },
            { word: "intervention", meaning: "간섭" },
        ],
    },
    {
        id: 3, symbol: "III", price: 500, color: "#e58a12", background: "#fff4df",
        words: [
            { word: "independence", meaning: "자립" },
            { word: "challenge", meaning: "도전하다" },
            { word: "challenging", meaning: "힘든" },
            { word: "authority", meaning: "권위" },
            { word: "overprotective", meaning: "과보호의" },
            { word: "instinct", meaning: "본능" },
            { word: "shield", meaning: "보호하다" },
            { word: "consequence", meaning: "결과" },
            { word: "manners", meaning: "예의" },
            { word: "responsibility", meaning: "책임" },
            { word: "fulfill", meaning: "이행[수행]하다" },
            { word: "crucial", meaning: "매우 중대[중요]한" },
            { word: "ensure", meaning: "확실하게 하다, 보장하다" },
            { word: "exist", meaning: "존재하다" },
            { word: "record", meaning: "기록하다" },
            { word: "mention", meaning: "언급" },
            { word: "date back to", meaning: "...로 거슬러 올라가다" },
            { word: "note", meaning: "언급하다" },
            { word: "townspeople", meaning: "도시[읍] 주민" },
            { word: "violent", meaning: "폭력적인" },
            { word: "fairly", meaning: "상당히, 꽤" },
            { word: "occurrence", meaning: "사건, 일" },
            { word: "to make matters worse", meaning: "설상가상으로" },
            { word: "favor", meaning: "...에게 유리하다" },
            { word: "rough", meaning: "거친" },
            { word: "adopt", meaning: "채택하다" },
            { word: "association", meaning: "협회" },
            { word: "found", meaning: "설립하다" },
            { word: "introduce", meaning: "도입하다" },
            { word: "ban", meaning: "금지하다" },
            { word: "trip", meaning: "(발을 걸어) 넘어뜨리다" },
            { word: "state", meaning: "말하다" },
            { word: "represent", meaning: "나타내다, 상징하다" },
            { word: "triumph", meaning: "승리" },
            { word: "physical", meaning: "육체의, 신체의" },
            { word: "tactic", meaning: "전략, 전술" },
            { word: "nail polish", meaning: "매니큐어" },
            { word: "strategy", meaning: "전략" },
            { word: "disadvantage", meaning: "불리한 점, 약점" },
            { word: "impact", meaning: "영향[충격]을 주다" },
            { word: "put pressure on", meaning: "...에게 압력을 가하다" },
            { word: "consistently", meaning: "지속적으로" },
            { word: "assign", meaning: "할당하다, 배정하다" },
        ],
    },
    {
        id: 4, symbol: "IV", price: 850, color: "#e54882", background: "#fff0f5",
        words: [
            { word: "recognizable", meaning: "(쉽게) 알아볼 수 있는" },
            { word: "consequently", meaning: "결과적으로, 그 결과" },
            { word: "loyalty", meaning: "충실, 충성(심)" },
            { word: "be satisfied with", meaning: "...에 만족하다" },
            { word: "inclined", meaning: "...하고 싶은" },
            { word: "muscle", meaning: "근육" },
            { word: "require", meaning: "필요로 하다" },
            { word: "intensely", meaning: "강렬하게" },
            { word: "eliminate", meaning: "제거하다" },
            { word: "adverse", meaning: "부정적인, 불리한" },
            { word: "body mass", meaning: "체질량" },
            { word: "workout", meaning: "운동" },
            { word: "suffer from", meaning: "...로 고통받다" },
            { word: "chronic", meaning: "만성적인" },
            { word: "consult", meaning: "상담하다" },
            { word: "manufacturer", meaning: "제조자, 제조사" },
            { word: "shortcoming", meaning: "결점" },
            { word: "driving force", meaning: "원동력" },
            { word: "essential", meaning: "필수적인" },
            { word: "luxury", meaning: "사치" },
            { word: "necessity", meaning: "필요(성)" },
            { word: "lead to", meaning: "...을 야기하다, ...로 이어지다" },
            { word: "invention", meaning: "발명(품)" },
            { word: "imperfect", meaning: "불완전한" },
            { word: "evolution", meaning: "진화" },
            { word: "take place", meaning: "일어나다" },
            { word: "desire", meaning: "...을 바라다" },
            { word: "universal", meaning: "보편적인" },
            { word: "principle", meaning: "원리, 원칙" },
            { word: "innovation", meaning: "혁신" },
            { word: "perception", meaning: "인식" },
            { word: "continually", meaning: "계속해서, 끊임없이" },
            { word: "surround", meaning: "둘러싸다" },
            { word: "nuclear power plant", meaning: "원자력 발전소" },
            { word: "contaminate", meaning: "오염시키다" },
            { word: "fallout", meaning: "(방사능) 낙진" },
            { word: "radioactive", meaning: "방사성의" },
            { word: "radioactivity", meaning: "방사능" },
            { word: "long-term", meaning: "장기적인" },
            { word: "radiation", meaning: "방사선" },
            { word: "radiate", meaning: "방출하다" },
            { word: "decomposition", meaning: "분해, 부패" },
            { word: "decompose", meaning: "분해[부패]되다" },
        ],
    },
    {
        id: 5, symbol: "V", price: 1200, color: "#8b5cf6", background: "#f3efff",
        words: [
            { word: "buildup", meaning: "축적, 비축" },
            { word: "decay", meaning: "부패시키다" },
            { word: "prehistoric", meaning: "선사시대의" },
            { word: "situated", meaning: "위치해 있는" },
            { word: "region", meaning: "지역" },
            { word: "explorer", meaning: "탐험가" },
            { word: "be named after", meaning: "...을 따서 명명되다" },
            { word: "considerable", meaning: "상당한" },
            { word: "aesthetic", meaning: "심미적인, 미학적인" },
            { word: "unsophisticated", meaning: "세련되지 않은" },
            { word: "reconsider", meaning: "재고하다" },
            { word: "mature", meaning: "성숙한" },
            { word: "expressive", meaning: "표현의, 나타내는" },
            { word: "impression", meaning: "인상" },
            { word: "furthermore", meaning: "게다가" },
            { word: "protectively", meaning: "보호하듯이" },
            { word: "seal", meaning: "봉인하다, 밀폐하다" },
            { word: "preserve", meaning: "보존하다" },
            { word: "structure", meaning: "구조" },
            { word: "individual", meaning: "개개의" },
            { word: "element", meaning: "요소" },
            { word: "amusing", meaning: "재미있는" },
            { word: "vending machine", meaning: "자판기" },
            { word: "straightforward", meaning: "간단한" },
            { word: "convey", meaning: "전달하다" },
            { word: "consumer", meaning: "소비자" },
            { word: "sorrow", meaning: "슬픔" },
            { word: "dictate", meaning: "...을 좌우하다" },
            { word: "silly", meaning: "어리석은, 우스꽝스러운" },
            { word: "local", meaning: "현지인" },
            { word: "prove", meaning: "입증[증명]하다" },
            { word: "experiment", meaning: "(과학) 실험, 시도" },
            { word: "observation", meaning: "관찰" },
            { word: "observe", meaning: "관찰하다" },
            { word: "determine", meaning: "결정하다" },
            { word: "apply", meaning: "적용하다" },
            { word: "regardless of", meaning: "...에 상관없이" },
            { word: "factor", meaning: "요인" },
            { word: "vital", meaning: "필수적인" },
            { word: "cornerstone", meaning: "초석" },
            { word: "telescope", meaning: "망원경" },
            { word: "visible", meaning: "(눈에) 보이는" },
            { word: "astronomer", meaning: "천문학자" },
        ],
    },
];

const state = {
    lesson: null,
    quizAttemptId: "",
    mode: "ordered",
    direction: profile.defaultDirection,
    questions: [],
    answerOptions: [],
    currentIndex: 0,
    correctCount: 0,
    wrongAnswers: [],
    streak: 0,
    pointsEarned: 0,
    answered: false,
    isStartingQuiz: false,
    isSubmittingAnswer: false,
    canSwipeNext: false,
    isAdvancing: false,
    pendingPurchaseLessonId: null,
    wordPreviewIndex: 0,
    shopView: "store",
};

const elements = {
    themeColor: document.querySelector("#theme-color"),
    screens: document.querySelectorAll(".screen"),
    loginForm: document.querySelector("#login-form"),
    username: document.querySelector("#username"),
    password: document.querySelector("#password"),
    passwordToggle: document.querySelector("#password-toggle"),
    loginError: document.querySelector("#login-error"),
    loginSubmitButton: document.querySelector("#login-submit-button"),
    signupButton: document.querySelector("#signup-button"),
    inviteForm: document.querySelector("#invite-form"),
    inviteCodeInput: document.querySelector("#invite-code-input"),
    inviteError: document.querySelector("#invite-error"),
    inviteSubmitButton: document.querySelector("#invite-submit-button"),
    inviteLogoutButton: document.querySelector("#invite-logout-button"),
    logoutButton: document.querySelector("#logout-button"),
    screenLinkButtons: document.querySelectorAll("[data-screen-link]"),
    profileAvatar: document.querySelector("#profile-avatar"),
    homeProfileName: document.querySelector("#home-profile-name"),
    homeLevel: document.querySelector("#home-level"),
    homePoints: document.querySelector("#home-points"),
    levelUpButton: document.querySelector("#level-up-button"),
    levelUpCost: document.querySelector("#level-up-cost"),
    attendanceStatus: document.querySelector("#attendance-status"),
    attendanceButton: document.querySelector("#attendance-button"),
    settingsPoints: document.querySelector("#settings-points"),
    settingsLevel: document.querySelector("#settings-level"),
    unlockedCount: document.querySelector("#unlocked-count"),
    unlockGuideTitle: document.querySelector("#unlock-guide-title"),
    unlockGuideText: document.querySelector("#unlock-guide-text"),
    lessonList: document.querySelector("#lesson-list"),
    modeLessonLabel: document.querySelector("#mode-lesson-label"),
    lessonSymbol: document.querySelector("#lesson-symbol"),
    backButtons: document.querySelectorAll("[data-back]"),
    modeButtons: document.querySelectorAll("[data-mode]"),
    viewWordsButton: document.querySelector("#view-words-button"),
    viewWordsTitle: document.querySelector("#view-words-title"),
    wordsLessonSymbol: document.querySelector("#words-lesson-symbol"),
    wordsLessonLabel: document.querySelector("#words-lesson-label"),
    wordsCount: document.querySelector("#words-count"),
    lessonWordsList: document.querySelector("#lesson-words-list"),
    quizScreen: document.querySelector("#quiz-screen"),
    quizContent: document.querySelector(".quiz-content"),
    quitQuizButton: document.querySelector("#quit-quiz-button"),
    progressBar: document.querySelector("#progress-bar"),
    quizCount: document.querySelector("#quiz-count"),
    quizGuide: document.querySelector("#quiz-guide"),
    quizPrompt: document.querySelector("#quiz-prompt"),
    quizHint: document.querySelector("#quiz-hint"),
    answerList: document.querySelector("#answer-list"),
    typingAnswerForm: document.querySelector("#typing-answer-form"),
    typingAnswerInput: document.querySelector("#typing-answer-input"),
    typingAnswerButton: document.querySelector("#typing-answer-button"),
    swipeHint: document.querySelector("#swipe-hint"),
    streakFire: document.querySelector("#streak-fire"),
    streakMessage: document.querySelector("#streak-message"),
    streakNextReward: document.querySelector("#streak-next-reward"),
    quizStreak: document.querySelector("#quiz-streak"),
    quizPointsEarned: document.querySelector("#quiz-points-earned"),
    currentReward: document.querySelector("#current-reward"),
    resultMessage: document.querySelector("#result-message"),
    scorePercent: document.querySelector("#score-percent"),
    correctCount: document.querySelector("#correct-count"),
    totalCount: document.querySelector("#total-count"),
    resultPointsEarned: document.querySelector("#result-points-earned"),
    resultTotalPoints: document.querySelector("#result-total-points"),
    wrongAnswerSection: document.querySelector("#wrong-answer-section"),
    wrongAnswerCount: document.querySelector("#wrong-answer-count"),
    wrongAnswerList: document.querySelector("#wrong-answer-list"),
    retryButton: document.querySelector("#retry-button"),
    resultHomeButton: document.querySelector("#result-home-button"),
    themeButtons: document.querySelectorAll("[data-theme-option]"),
    defaultDirectionButtons: document.querySelectorAll("[data-default-direction]"),
    profileNameForm: document.querySelector("#profile-name-form"),
    profileNameInput: document.querySelector("#profile-name-input"),
    adminInvitePanel: document.querySelector("#admin-invite-panel"),
    currentInviteCode: document.querySelector("#current-invite-code"),
    refreshInviteCodeButton: document.querySelector("#refresh-invite-code-button"),
    myRank: document.querySelector("#my-rank"),
    myRankSummary: document.querySelector("#my-rank-summary"),
    leaderboardList: document.querySelector("#leaderboard-list"),
    shopPoints: document.querySelector("#shop-points"),
    shopOwnedCount: document.querySelector("#shop-owned-count"),
    shopEquippedName: document.querySelector("#shop-equipped-name"),
    shopItemList: document.querySelector("#shop-item-list"),
    shopInventoryList: document.querySelector("#shop-inventory-list"),
    shopViewButtons: document.querySelectorAll("[data-shop-view]"),
    shopStorePanel: document.querySelector("#shop-store-panel"),
    shopInventoryPanel: document.querySelector("#shop-inventory-panel"),
    purchaseModal: document.querySelector("#purchase-modal"),
    purchaseSymbol: document.querySelector("#purchase-symbol"),
    purchaseTitle: document.querySelector("#purchase-title"),
    purchaseDescription: document.querySelector("#purchase-description"),
    purchaseCost: document.querySelector("#purchase-cost"),
    purchaseBalance: document.querySelector("#purchase-balance"),
    confirmPurchaseButton: document.querySelector("#confirm-purchase-button"),
    closePurchaseButtons: document.querySelectorAll("[data-close-purchase]"),
    attendanceModal: document.querySelector("#attendance-modal"),
    attendanceModalButton: document.querySelector("#attendance-modal-button"),
    closeAttendanceButtons: document.querySelectorAll("[data-close-attendance]"),
    wordPreviewModal: document.querySelector("#word-preview-modal"),
    closeWordPreviewButton: document.querySelector("#close-word-preview-button"),
    wordPreviewLesson: document.querySelector("#word-preview-lesson"),
    wordPreviewCount: document.querySelector("#word-preview-count"),
    wordPreviewStage: document.querySelector("#word-preview-stage"),
    wordPreviewOrder: document.querySelector("#word-preview-order"),
    wordPreviewWord: document.querySelector("#word-preview-word"),
    wordPreviewMeaning: document.querySelector("#word-preview-meaning"),
    previousWordButton: document.querySelector("#previous-word-button"),
    nextWordButton: document.querySelector("#next-word-button"),
    appToast: document.querySelector("#app-toast"),
};

function getResolvedTheme(theme = profile.theme) {
    return theme === "dark" ? "dark" : "light";
}

function applyTheme() {
    const resolvedTheme = getResolvedTheme();
    document.documentElement.dataset.theme = resolvedTheme;
    elements.themeColor.content = resolvedTheme === "dark" ? "#11131a" : "#f5f6fb";
}

function isLessonUnlocked(lessonId) {
    return profile.unlockedLessons.includes(lessonId);
}

function canPurchaseLesson(lessonId) {
    return lessonId > 1 && isLessonUnlocked(lessonId - 1);
}

function getNextLockedLesson() {
    return lessons.find((lesson) => !isLessonUnlocked(lesson.id)) || null;
}

function getTodayKey(date = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
}

function getLevelUpCost(level = profile.level) {
    return 300 + (level - 1) * 200;
}

function areAllLessonsUnlocked() {
    return lessons.every((lesson) => isLessonUnlocked(lesson.id));
}

function escapeHTML(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function getShopItem(itemId = profile.equippedShopItem) {
    return shopItems.find((item) => item.id === itemId) || DEFAULT_SHOP_ITEM;
}

function isShopItemOwned(itemId) {
    return profile.ownedShopItems.includes(itemId);
}

function getPreviousShopItem(itemId) {
    const itemIndex = shopItems.findIndex((item) => item.id === itemId);
    return itemIndex > 0 ? shopItems[itemIndex - 1] : null;
}

function hasShopPurchasePrerequisite(itemId) {
    const previousItem = getPreviousShopItem(itemId);
    return !previousItem || isShopItemOwned(previousItem.id);
}

function setAvatarSkin(element, itemId = profile.equippedShopItem) {
    if (!element) return;
    [DEFAULT_SHOP_ITEM, ...shopItems].forEach((item) => element.classList.remove(item.skinClass));
    element.classList.add(getShopItem(itemId).skinClass);
}

function renderShop() {
    const equippedItem = getShopItem();
    const profileInitial = escapeHTML(profile.displayName.trim().charAt(0) || "V");
    const ownedShopItemCount = shopItems.filter((item) => isShopItemOwned(item.id)).length;

    elements.shopPoints.textContent = Math.floor(profile.points);
    elements.shopOwnedCount.textContent = `${ownedShopItemCount}/${shopItems.length}`;
    elements.shopEquippedName.textContent = equippedItem.name;
    elements.shopViewButtons.forEach((button) => {
        const isSelected = button.dataset.shopView === state.shopView;
        button.classList.toggle("selected", isSelected);
        button.setAttribute("aria-selected", String(isSelected));
    });
    elements.shopStorePanel.hidden = state.shopView !== "store";
    elements.shopInventoryPanel.hidden = state.shopView !== "inventory";
    elements.shopItemList.innerHTML = shopItems
        .map((item) => {
            const isOwned = isShopItemOwned(item.id);
            const previousItem = getPreviousShopItem(item.id);
            const hasPrerequisite = hasShopPurchasePrerequisite(item.id);
            const canAfford = profile.points >= item.price;
            const isDisabled = isOwned || !hasPrerequisite || !canAfford;
            const buttonText = isOwned
                ? "구매 완료"
                : !hasPrerequisite
                  ? "잠금"
                  : canAfford
                    ? `${item.price}P 구매`
                    : `${item.price - profile.points}P 부족`;
            return `
                <article class="shop-item-card store ${item.skinClass} ${item.id === "prism-lexicon" ? "featured" : ""} ${isOwned ? "owned" : ""}" style="--item-accent: ${item.accent};">
                    <span class="shop-item-rank">${item.rank}</span>
                    <span class="shop-item-icon ${item.skinClass}" aria-hidden="true">${profileInitial}</span>
                    <span class="shop-item-copy">
                        <strong>${escapeHTML(item.name)}</strong>
                        <small>${escapeHTML(item.summary)}</small>
                    </span>
                    <span class="shop-item-meta"><b>${item.price}P</b></span>
                    <button class="shop-item-action" type="button" data-shop-item-id="${item.id}" data-shop-action="purchase" ${isDisabled ? "disabled" : ""}>${buttonText}</button>
                </article>
            `;
        })
        .join("");

    const inventoryItems = [DEFAULT_SHOP_ITEM, ...shopItems.filter((item) => isShopItemOwned(item.id))];
    elements.shopInventoryList.innerHTML = inventoryItems
        .map((item) => {
            const isDefaultItem = item.id === DEFAULT_SHOP_ITEM_ID;
            const isEquipped = profile.equippedShopItem === item.id;
            const action = isEquipped ? (isDefaultItem ? "equipped" : "unequip") : "equip";
            const buttonText = isEquipped
                ? isDefaultItem ? "기본 사용 중" : "사용 안함"
                : isDefaultItem ? "기본으로" : "사용";
            return `
                <article class="shop-item-card inventory ${item.skinClass} ${isEquipped ? "equipped" : ""}" style="--item-accent: ${item.accent};">
                    <span class="shop-item-rank">${isDefaultItem ? "-" : item.rank}</span>
                    <span class="shop-item-icon ${item.skinClass}" aria-hidden="true">${profileInitial}</span>
                    <span class="shop-item-copy">
                        <strong>${escapeHTML(item.name)}</strong>
                        <small>${escapeHTML(item.summary)}</small>
                    </span>
                    <span class="shop-item-meta">
                        <em>${isEquipped ? "사용 중" : "보유"}</em>
                        <b>${isDefaultItem ? "기본" : `${item.rank}단계`}</b>
                    </span>
                    <button class="shop-item-action inventory-action ${isEquipped ? "is-equipped" : ""}" type="button" data-shop-item-id="${item.id}" data-shop-action="${action}" ${action === "equipped" ? "disabled" : ""}>${buttonText}</button>
                </article>
            `;
        })
        .join("");
}

function setShopActionsBusy(isBusy) {
    [elements.shopItemList, elements.shopInventoryList].forEach((list) => {
        list.querySelectorAll("button").forEach((button) => {
            button.disabled = isBusy || button.dataset.shopAction === "equipped";
        });
    });
}

function setShopView(view) {
    state.shopView = view === "inventory" ? "inventory" : "store";
    renderShop();
}

async function purchaseShopItem(itemId) {
    const item = getShopItem(itemId);
    const previousItem = getPreviousShopItem(item.id);

    if (isShopItemOwned(item.id)) {
        state.shopView = "inventory";
        renderShop();
        showToast("이미 보유 중이에요. 보관함에서 사용할 수 있어요.");
        return;
    }
    if (previousItem && !isShopItemOwned(previousItem.id)) {
        showToast(`${previousItem.name} 칭호를 먼저 구매해 주세요.`);
        renderShop();
        return;
    }
    if (!supabaseClient || !currentUser) {
        showToast("로그인 상태를 다시 확인해 주세요.");
        return;
    }

    setShopActionsBusy(true);
    const { data, error } = await supabaseClient.rpc("purchase_shop_item", { item_id_input: item.id });

    if (error) {
        console.error("shop purchase failed", error);
        if (errorIncludes(error, "insufficient_points")) {
            showToast("서버 기준으로 포인트가 부족해요.");
        } else if (errorIncludes(error, "shop_previous_item_required")) {
            showToast(`${previousItem?.name || "이전"} 칭호를 먼저 구매해 주세요.`);
        } else if (errorIncludes(error, "shop_item_already_owned")) {
            await loadRemoteProfile();
            showToast("이미 보유한 아이템이에요.");
        } else {
            showToast("상점 구매를 완료하지 못했어요.");
        }
        updateProfileUI();
        renderShop();
        return;
    }

    applyServerProfile(data);
    updateProfileUI();
    renderShop();
    renderLeaderboard();
    showToast(`${item.name} 구매 완료!`);
}

async function equipShopItem(itemId) {
    const item = getShopItem(itemId);
    if (profile.equippedShopItem === item.id) {
        renderShop();
        return;
    }
    if (!supabaseClient || !currentUser) {
        showToast("로그인 상태를 다시 확인해 주세요.");
        return;
    }

    setShopActionsBusy(true);
    const { data, error } = await supabaseClient.rpc("equip_shop_item", { item_id_input: item.id });

    if (error) {
        console.error("shop equip failed", error);
        showToast(errorIncludes(error, "shop_item_not_owned") ? "먼저 구매해야 장착할 수 있어요." : "아이템을 장착하지 못했어요.");
        updateProfileUI();
        renderShop();
        return;
    }

    applyServerProfile(data);
    updateProfileUI();
    renderShop();
    renderLeaderboard();
    showToast(item.id === DEFAULT_SHOP_ITEM_ID ? "효과를 사용하지 않아요." : `${item.name} 사용 중!`);
}

function handleShopItemAction(event) {
    const button = event.target.closest("[data-shop-item-id]");
    if (!button || button.disabled) return;
    const itemId = button.dataset.shopItemId;
    if (button.dataset.shopAction === "purchase") void purchaseShopItem(itemId);
    else if (button.dataset.shopAction === "equip") void equipShopItem(itemId);
    else if (button.dataset.shopAction === "unequip") void equipShopItem(DEFAULT_SHOP_ITEM_ID);
}

function getLeaderboardEntries() {
    const entries = remoteLeaderboardEntries.length ? remoteLeaderboardEntries.map((e) => ({ ...e })) : [];
    if (!entries.some((e) => e.isCurrent)) {
        entries.push({
            name: profile.displayName,
            level: profile.level,
            points: profile.points,
            equippedShopItem: profile.equippedShopItem,
            isCurrent: true,
        });
    }
    return entries.sort(
        (a, b) => b.level - a.level || b.points - a.points || a.name.localeCompare(b.name, "ko"),
    );
}

function renderLeaderboard() {
    const entries = getLeaderboardEntries();
    const currentIndex = entries.findIndex((e) => e.isCurrent);

    elements.myRank.textContent = currentIndex >= 0 ? currentIndex + 1 : "-";
    elements.myRankSummary.textContent = `레벨 ${profile.level} · ${profile.points}P`;
    elements.leaderboardList.innerHTML = entries
        .map((entry, index) => {
            const rank = index + 1;
            const medal = rank <= 3 ? ["gold", "silver", "bronze"][index] : "";
            const safeName = escapeHTML(entry.name);
            const initial = escapeHTML(entry.name.trim().charAt(0) || "V");
            const equippedItem = getShopItem(entry.equippedShopItem);
            const hasEquippedSkin = Boolean(equippedItem && equippedItem.id !== DEFAULT_SHOP_ITEM_ID);
            const rowClass = [entry.isCurrent ? "me" : "", hasEquippedSkin ? equippedItem.skinClass : ""]
                .filter(Boolean)
                .join(" ");
            return `
                <article class="leaderboard-row ${rowClass}">
                    <span class="rank-number ${medal}">${rank}</span>
                    <span class="rank-avatar ${equippedItem.skinClass}" aria-hidden="true">${initial}</span>
                    <span class="rank-user">
                        <strong><span class="rank-name-text">${safeName}</span>${entry.isCurrent ? " <em>나</em>" : ""}</strong>
                        <small>${entry.points}P 보유</small>
                    </span>
                    <span class="rank-level">Lv.${entry.level}</span>
                </article>
            `;
        })
        .join("");
}

async function refreshLeaderboard() {
    if (!supabaseClient || !currentUser) {
        renderLeaderboard();
        return;
    }
    const { data, error } = await supabaseClient.rpc("get_leaderboard", { limit_count: 50 });
    if (error) {
        console.error("leaderboard load failed", error);
        remoteLeaderboardEntries = [];
        renderLeaderboard();
        return;
    }
    remoteLeaderboardEntries = (data || []).map((entry) => ({
        name: entry.display_name || DEFAULT_PROFILE.displayName,
        level: Math.max(1, Number(entry.level) || 1),
        points: Math.max(0, Number(entry.points) || 0),
        equippedShopItem: typeof entry.equipped_shop_item === "string" ? entry.equipped_shop_item : DEFAULT_SHOP_ITEM_ID,
        isCurrent: Boolean(entry.is_current),
    }));
    renderLeaderboard();
}

function updateProfileUI() {
    const points = Math.floor(profile.points);
    const unlockedTotal = lessons.filter((lesson) => isLessonUnlocked(lesson.id)).length;
    const nextLesson = getNextLockedLesson();
    const today = getTodayKey();
    const attendanceClaimed = profile.lastAttendanceDate === today;
    const levelUpCost = getLevelUpCost();
    const allLessonsUnlocked = areAllLessonsUnlocked();
    const equippedShopItem = getShopItem();

    elements.profileAvatar.textContent = profile.displayName.trim().charAt(0) || "V";
    setAvatarSkin(elements.profileAvatar);
    elements.homeProfileName.textContent = profile.displayName;
    elements.homeLevel.textContent = profile.level;
    elements.homePoints.textContent = points;
    elements.settingsPoints.textContent = points;
    elements.settingsLevel.textContent = profile.level;
    elements.unlockedCount.textContent = `${unlockedTotal}/${lessons.length}과 열림`;
    elements.resultTotalPoints.textContent = `${points}P`;
    elements.shopPoints.textContent = points;
    elements.shopOwnedCount.textContent = `${shopItems.filter((item) => isShopItemOwned(item.id)).length}/${shopItems.length}`;
    elements.shopEquippedName.textContent = equippedShopItem.name;
    elements.profileNameInput.value = profile.displayName;

    elements.attendanceButton.disabled = attendanceClaimed;
    elements.attendanceButton.textContent = attendanceClaimed ? "받기 완료" : "100P 받기";
    elements.attendanceStatus.textContent = attendanceClaimed
        ? `출석 ${profile.attendanceCount}일째 · 오늘 보상을 받았어요.`
        : `출석 ${profile.attendanceCount}일째 · 오늘 100P를 받을 수 있어요.`;

    elements.levelUpButton.disabled = !allLessonsUnlocked || points < levelUpCost;
    elements.levelUpCost.textContent = allLessonsUnlocked ? `${levelUpCost}P` : "전 단원 해금 후";

    if (!nextLesson) {
        elements.unlockGuideTitle.textContent = "이제 레벨을 올려보세요";
        elements.unlockGuideText.textContent = `다음 레벨까지 ${Math.max(0, levelUpCost - points)}P가 필요해요.`;
        return;
    }

    if (canPurchaseLesson(nextLesson.id)) {
        const missingPoints = Math.max(0, nextLesson.price - points);
        elements.unlockGuideTitle.textContent = `${nextLesson.id}과 잠금 해제까지 ${missingPoints}P`;
        elements.unlockGuideText.textContent =
            missingPoints === 0
                ? `${nextLesson.price}P가 모였어요. 지금 새 단원을 열 수 있어요.`
                : `정답과 연속 보너스로 ${nextLesson.price}P를 모아보세요.`;
        return;
    }

    elements.unlockGuideTitle.textContent = "앞 단원부터 차근차근";
    elements.unlockGuideText.textContent = `${nextLesson.id - 1}과를 먼저 열면 다음 단원을 구매할 수 있어요.`;
}

function syncSettingsUI() {
    elements.themeButtons.forEach((button) => {
        const isSelected = button.dataset.themeOption === profile.theme;
        button.classList.toggle("selected", isSelected);
        button.setAttribute("aria-pressed", String(isSelected));
    });
    elements.defaultDirectionButtons.forEach((button) => {
        const isSelected = button.dataset.defaultDirection === profile.defaultDirection;
        button.classList.toggle("selected", isSelected);
        button.setAttribute("aria-pressed", String(isSelected));
    });
}

let toastTimer = null;
let attendancePromptShown = false;

function shouldPromptAttendance() {
    return (
        document.querySelector("#home-screen")?.classList.contains("active") &&
        !attendancePromptShown &&
        profile.lastAttendanceDate !== getTodayKey()
    );
}

function showToast(message) {
    elements.appToast.textContent = message;
    elements.appToast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elements.appToast.classList.remove("show"), 2200);
}

function errorIncludes(error, code) {
    return String((error && error.message) || "").toLowerCase().includes(code.toLowerCase());
}

function canUseApp() {
    return inviteStatus.inviteApproved || inviteStatus.isAdmin;
}

function setInviteStatus(status = {}) {
    const source = Array.isArray(status) ? status[0] || {} : status || {};
    inviteStatus = {
        inviteApproved: Boolean(source.invite_approved ?? source.inviteApproved),
        isAdmin: Boolean(source.is_admin ?? source.isAdmin),
        currentCode: typeof (source.current_code ?? source.currentCode) === "string" ? source.current_code ?? source.currentCode : "",
    };
    renderInviteStatus();
    return inviteStatus;
}

function renderInviteStatus() {
    if (!elements.adminInvitePanel) return;
    elements.adminInvitePanel.hidden = !inviteStatus.isAdmin;
    elements.currentInviteCode.textContent = inviteStatus.currentCode || "확인 중";
}

async function refreshInviteStatus() {
    if (!supabaseClient || !currentUser) return setInviteStatus();
    const { data, error } = await supabaseClient.rpc("get_invite_status");
    if (error) {
        console.error("invite status load failed", error);
        showToast("접근 권한을 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.");
        return setInviteStatus();
    }
    return setInviteStatus(data);
}

function getInviteErrorMessage(error) {
    const message = String((error && error.message) || "").toLowerCase();
    if (message.includes("invalid_invite_code")) return "초대코드가 맞지 않아요. 관리자에게 최신 코드를 다시 받아주세요.";
    if (message.includes("profile_not_found")) return "프로필을 찾지 못했어요. 다시 로그인해 주세요.";
    return "초대코드를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.";
}

async function handleInviteSubmit(event) {
    event.preventDefault();
    const code = elements.inviteCodeInput.value.trim().toUpperCase();
    if (!code) {
        elements.inviteError.textContent = "초대코드를 입력해 주세요.";
        elements.inviteCodeInput.focus();
        return;
    }
    if (!supabaseClient || !currentUser) {
        elements.inviteError.textContent = "먼저 로그인해 주세요.";
        return;
    }
    elements.inviteSubmitButton.disabled = true;
    elements.inviteError.textContent = "";
    const { data, error } = await supabaseClient.rpc("claim_invite_code", { code_input: code });
    elements.inviteSubmitButton.disabled = false;
    if (error) {
        elements.inviteError.textContent = getInviteErrorMessage(error);
        elements.inviteCodeInput.select();
        return;
    }
    setInviteStatus(data);
    elements.inviteCodeInput.value = "";
    showToast("초대코드가 확인됐어요.");
    showScreen("home");
}

async function refreshAdminInviteCode() {
    if (!inviteStatus.isAdmin) return;
    elements.refreshInviteCodeButton.disabled = true;
    await refreshInviteStatus();
    elements.refreshInviteCodeButton.disabled = false;
    showToast("초대코드를 새로 확인했어요.");
}

function isCoarsePointer() {
    return window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
}

function updateTypingViewportInset() {
    if (!window.visualViewport || !elements.quizScreen.classList.contains("typing-mode")) return;
    const visualHeight = Math.round(window.visualViewport.height);
    const inset = Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop);
    document.documentElement.style.setProperty("--quiz-visual-height", `${visualHeight}px`);
    document.documentElement.style.setProperty("--quiz-keyboard-inset", `${Math.round(inset)}px`);
}

function resetTypingViewportMetrics() {
    document.documentElement.style.removeProperty("--quiz-keyboard-inset");
    document.documentElement.style.removeProperty("--quiz-visual-height");
}

function setTypingKeyboardActive(isActive) {
    elements.quizScreen.classList.toggle("typing-keyboard-active", isActive);
    if (isActive) updateTypingViewportInset();
    else resetTypingViewportMetrics();
}

function stabilizeTypingViewport() {
    setTypingKeyboardActive(true);
    window.setTimeout(() => {
        updateTypingViewportInset();
        elements.quizContent.scrollTo({ top: 0, behavior: "auto" });
        window.scrollTo({ top: 0, behavior: "auto" });
    }, 120);
}

function releaseTypingInputFocus() {
    if (document.activeElement === elements.typingAnswerInput) elements.typingAnswerInput.blur();
    setTypingKeyboardActive(false);
    elements.quizContent.scrollTo({ top: 0, behavior: "auto" });
    window.scrollTo({ top: 0, behavior: "auto" });
}

function showScreen(name) {
    if (currentUser && !canUseApp() && name !== "invite" && name !== "login") name = "invite";

    if (name !== "quiz") {
        setTypingKeyboardActive(false);
        elements.quizScreen.classList.remove("typing-mode", "swipe-ready");
        elements.quizContent.classList.remove("typing-mode");
    }

    elements.screens.forEach((screen) => screen.classList.toggle("active", screen.id === `${name}-screen`));

    if (name === "home") {
        renderLessons();
        updateProfileUI();
        if (shouldPromptAttendance()) window.setTimeout(openAttendanceModal, 180);
    } else if (name === "shop") {
        updateProfileUI();
        renderShop();
    } else if (name === "settings") {
        updateProfileUI();
        syncSettingsUI();
    } else if (name === "leaderboard") {
        updateProfileUI();
        renderLeaderboard();
        void refreshLeaderboard();
    } else if (name === "invite") {
        renderInviteStatus();
        elements.inviteCodeInput.focus();
    }

    window.scrollTo({ top: 0, behavior: "auto" });
}

async function loadRemoteProfile() {
    const { data, error } = await supabaseClient.rpc("get_my_profile");
    if (error) {
        console.error("profile load failed", error);
        Object.assign(profile, normalizeProfile());
        saveProfile();
        elements.loginError.textContent = "보안 데이터베이스 설정을 불러오지 못했어요. 관리자에게 문의해 주세요.";
        return false;
    }
    applyServerProfile(data);
    localStorage.removeItem(PROFILE_STORAGE_KEY);
    localStorage.removeItem(LEGACY_LOGIN_STORAGE_KEY);
    return true;
}

async function activateSession(session) {
    if (!session || !session.user) {
        handleSignedOut();
        return;
    }
    const activationToken = ++authActivationToken;
    currentUser = session.user;
    const profileLoaded = await loadRemoteProfile();
    if (!profileLoaded) {
        showScreen("login");
        return;
    }
    await refreshInviteStatus();
    if (activationToken !== authActivationToken) return;

    applyTheme();
    syncSettingsUI();
    updateProfileUI();
    renderLessons();
    elements.loginError.textContent = "";
    elements.inviteError.textContent = "";
    elements.loginForm.reset();
    showScreen(canUseApp() ? "home" : "invite");
}

function handleSignedOut() {
    authActivationToken += 1;
    currentUser = null;
    remoteLeaderboardEntries = [];
    setInviteStatus();
    Object.assign(profile, normalizeProfile());
    state.lesson = null;
    state.quizAttemptId = "";
    attendancePromptShown = false;
    closeAttendanceModal();
    closePurchaseModal();
    closeWordPreview();
    applyTheme();
    syncSettingsUI();
    updateProfileUI();
    renderLessons();
    showScreen("login");
}

async function initializeAuth() {
    if (!supabaseClient) {
        elements.loginError.textContent = "Supabase 라이브러리 또는 공개 설정을 불러오지 못했어요.";
        showScreen("login");
        return;
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
        if (event === "SIGNED_OUT") handleSignedOut();
        else if (session) void activateSession(session);
    });

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
        elements.loginError.textContent = "로그인 상태를 확인하지 못했어요.";
        showScreen("login");
        return;
    }
    if (data.session) await activateSession(data.session);
    else showScreen("login");
}

function shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const target = Math.floor(Math.random() * (index + 1));
        [result[index], result[target]] = [result[target], result[index]];
    }
    return result;
}

function renderLessons() {
    elements.lessonList.innerHTML = lessons
        .map((lesson) => {
            const isUnlocked = isLessonUnlocked(lesson.id);
            const isPurchasable = !isUnlocked && canPurchaseLesson(lesson.id);
            const action = isUnlocked ? "open" : isPurchasable ? "purchase" : "blocked";
            const description = isUnlocked
                ? `단어 ${lesson.words.length}개 · 순서/랜덤 학습`
                : isPurchasable
                  ? `${lesson.price}P로 새 단원 열기`
                  : `${lesson.id - 1}과를 먼저 열어주세요`;
            const status = isUnlocked
                ? `<span class="lesson-status ready" aria-label="학습 가능"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></span>`
                : isPurchasable
                  ? `<span class="lesson-status price" aria-label="${lesson.price}포인트"><span class="point-coin small" aria-hidden="true">P</span>${lesson.price}</span>`
                  : `<span class="lesson-status locked" aria-label="잠긴 단원"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></span>`;

            return `
                <button class="lesson-card ${isUnlocked ? "" : "locked"} ${isPurchasable ? "purchasable" : ""}" type="button" data-lesson-id="${lesson.id}" data-lesson-action="${action}" style="--lesson-color: ${lesson.color}; --lesson-bg: ${lesson.background};">
                    <span class="lesson-number" aria-hidden="true">${lesson.symbol}</span>
                    <span class="lesson-info">
                        <span class="lesson-title-row">
                            <strong>${lesson.id}과</strong>
                            ${isUnlocked && lesson.id === 1 ? "<em>학습 중</em>" : ""}
                        </span>
                        <small>${description}</small>
                    </span>
                    ${status}
                </button>
            `;
        })
        .join("");
}

function openPurchaseModal(lessonId) {
    const lesson = lessons.find((item) => item.id === lessonId);
    if (!lesson || isLessonUnlocked(lessonId)) return;
    if (!canPurchaseLesson(lessonId)) {
        showToast(`${lessonId - 1}과를 먼저 열어주세요.`);
        return;
    }
    state.pendingPurchaseLessonId = lessonId;
    const canAfford = profile.points >= lesson.price;
    const missingPoints = Math.max(0, lesson.price - profile.points);

    elements.purchaseSymbol.textContent = lesson.symbol;
    elements.purchaseSymbol.style.color = lesson.color;
    elements.purchaseSymbol.style.background = lesson.background;
    elements.purchaseTitle.textContent = `${lesson.id}과를 열까요?`;
    elements.purchaseDescription.textContent = canAfford
        ? "구매하면 언제든 반복해서 학습할 수 있어요."
        : `${missingPoints}P를 더 모으면 이 단원을 열 수 있어요.`;
    elements.purchaseCost.textContent = `${lesson.price}P`;
    elements.purchaseBalance.textContent = `${profile.points}P`;
    elements.confirmPurchaseButton.disabled = !canAfford;
    elements.confirmPurchaseButton.textContent = canAfford ? `${lesson.price}P로 열기` : `${missingPoints}P 부족`;
    elements.purchaseModal.hidden = false;
    document.body.classList.add("modal-open");
}

function openAttendanceModal() {
    if (profile.lastAttendanceDate === getTodayKey()) return;
    attendancePromptShown = true;
    elements.attendanceModal.hidden = false;
    document.body.classList.add("modal-open");
}

function closeAttendanceModal() {
    elements.attendanceModal.hidden = true;
    document.body.classList.remove("modal-open");
}

function closePurchaseModal() {
    state.pendingPurchaseLessonId = null;
    elements.purchaseModal.hidden = true;
    document.body.classList.remove("modal-open");
}

async function purchaseLesson() {
    const lesson = lessons.find((item) => item.id === state.pendingPurchaseLessonId);
    if (!lesson || isLessonUnlocked(lesson.id) || !canPurchaseLesson(lesson.id)) {
        closePurchaseModal();
        return;
    }
    if (!supabaseClient || !currentUser) {
        showToast("로그인 상태를 다시 확인해 주세요.");
        return;
    }
    elements.confirmPurchaseButton.disabled = true;
    const { data, error } = await supabaseClient.rpc("purchase_lesson", { lesson_id_input: lesson.id });
    if (error) {
        elements.confirmPurchaseButton.disabled = false;
        if (errorIncludes(error, "insufficient_points")) showToast("서버 기준으로 포인트가 부족해요.");
        else {
            console.error("lesson purchase failed", error);
            showToast("단원을 열지 못했어요. 다시 시도해 주세요.");
        }
        return;
    }
    applyServerProfile(data);
    closePurchaseModal();
    renderLessons();
    updateProfileUI();
    renderLeaderboard();
    showToast(`${lesson.id}과가 열렸어요!`);
}

function openLesson(lessonId) {
    if (!isLessonUnlocked(lessonId)) {
        openPurchaseModal(lessonId);
        return;
    }
    state.lesson = lessons.find((lesson) => lesson.id === lessonId);
    if (!state.lesson) return;

    elements.modeLessonLabel.textContent = `${state.lesson.id}과`;
    elements.lessonSymbol.textContent = state.lesson.symbol;
    elements.lessonSymbol.style.color = state.lesson.color;
    elements.lessonSymbol.style.background = state.lesson.background;
    state.direction = profile.defaultDirection;
    elements.viewWordsTitle.textContent = `${state.lesson.id}과 단어 보기`;
    showScreen("mode");
}

function renderLessonWords() {
    if (!state.lesson) return;
    elements.wordsLessonSymbol.textContent = state.lesson.symbol;
    elements.wordsLessonSymbol.style.color = state.lesson.color;
    elements.wordsLessonSymbol.style.background = state.lesson.background;
    elements.wordsLessonLabel.textContent = `${state.lesson.id}과`;
    elements.wordsCount.textContent = `총 ${state.lesson.words.length}개`;
    elements.lessonWordsList.innerHTML = state.lesson.words
        .map(
            (word, index) => `
                <button class="lesson-word-card" type="button" data-word-index="${index}" aria-label="${escapeHTML(word.word)}, ${escapeHTML(word.meaning)} 크게 보기">
                    <span class="word-order">${String(index + 1).padStart(2, "0")}</span>
                    <strong>${escapeHTML(word.word)}</strong>
                    <span>${escapeHTML(word.meaning)}</span>
                </button>
            `,
        )
        .join("");
}

function renderWordPreview() {
    if (!state.lesson) return;
    const words = state.lesson.words;
    const word = words[state.wordPreviewIndex];
    if (!word) return;

    elements.wordPreviewLesson.textContent = `${state.lesson.id}과 단어`;
    elements.wordPreviewCount.textContent = `${state.wordPreviewIndex + 1} / ${words.length}`;
    elements.wordPreviewOrder.textContent = String(state.wordPreviewIndex + 1).padStart(2, "0");
    elements.wordPreviewWord.textContent = word.word;
    elements.wordPreviewMeaning.textContent = word.meaning;
    elements.previousWordButton.disabled = state.wordPreviewIndex === 0;
    elements.nextWordButton.disabled = state.wordPreviewIndex === words.length - 1;
}

function openWordPreview(index) {
    if (!state.lesson || !state.lesson.words[index]) return;
    state.wordPreviewIndex = index;
    renderWordPreview();
    elements.wordPreviewModal.hidden = false;
    document.body.classList.add("modal-open");
}

function closeWordPreview() {
    elements.wordPreviewModal.hidden = true;
    document.body.classList.remove("modal-open");
}

function moveWordPreview(offset) {
    if (!state.lesson) return;
    const nextIndex = Math.min(state.lesson.words.length - 1, Math.max(0, state.wordPreviewIndex + offset));
    if (nextIndex === state.wordPreviewIndex) return;
    state.wordPreviewIndex = nextIndex;
    renderWordPreview();
}

function getAnswerField(direction) {
    return direction === "meaning-to-word" ? "word" : "meaning";
}

function normalizeTypedAnswer(value) {
    return String(value)
        .normalize("NFKC")
        .toLowerCase()
        .trim()
        .replace(/[\s,，·ㆍ.、/()_-]+/g, " ")
        .trim();
}

function buildAnswerOptions(answer, lessonWords) {
    const answerField = getAnswerField(answer.direction);
    const otherLessons = lessons.flatMap((lesson) => lesson.words);
    const candidates = [...lessonWords, ...otherLessons].filter((word) => word[answerField] !== answer[answerField]);
    const uniqueCandidates = Array.from(new Map(candidates.map((word) => [word[answerField], word])).values());
    return shuffle([answer, ...shuffle(uniqueCandidates).slice(0, 3)]);
}

function getRewardForStreak(streak) {
    const basePoints = 5;
    const streakBonus = Math.min(Math.max(streak - 1, 0), 5) * 2;
    return { basePoints, streakBonus, total: basePoints + streakBonus };
}

function updateQuizRewardUI() {
    const nextReward = getRewardForStreak(state.streak + 1);
    elements.quizStreak.textContent = state.streak;
    elements.streakFire.classList.toggle("active", state.streak > 0);
    elements.streakFire.classList.toggle("combo", state.streak >= 3);
    elements.streakMessage.textContent =
        state.streak >= 5 ? "최고 보너스 유지 중!" : state.streak >= 3 ? "불꽃 콤보가 터졌어요!" : state.streak > 0 ? "연속 정답 진행 중" : "첫 정답에 도전해요";
    elements.streakNextReward.textContent = `다음 +${nextReward.total}P`;
    elements.quizPointsEarned.textContent = `+${state.pointsEarned}P`;
}

async function startQuiz() {
    if (!state.lesson || !supabaseClient || !currentUser || state.isStartingQuiz) return;

    state.isStartingQuiz = true;
    elements.modeButtons.forEach((button) => (button.disabled = true));
    elements.retryButton.disabled = true;

    let data = null;
    let error = null;
    try {
        const response = await supabaseClient.rpc("start_quiz_attempt", {
            lesson_id_input: state.lesson.id,
            mode_input: state.mode,
            direction_input: state.direction,
        });
        data = response.data;
        error = response.error;
    } catch (requestError) {
        error = requestError;
    } finally {
        state.isStartingQuiz = false;
        elements.modeButtons.forEach((button) => (button.disabled = false));
        elements.retryButton.disabled = false;
    }

    if (error) {
        console.error("quiz start failed", error);
        showToast(errorIncludes(error, "quiz_rate_limit") ? "퀴즈 시작 요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요." : "보안 퀴즈를 시작하지 못했어요.");
        return;
    }

    const questionOrder = Array.isArray(data.question_order) ? data.question_order : [];
    const questionDirections = Array.isArray(data.question_directions) ? data.question_directions : [];

    if (!data.attempt_id || questionOrder.length === 0 || questionOrder.length !== questionDirections.length) {
        showToast("서버가 올바른 퀴즈를 반환하지 않았어요.");
        return;
    }

    state.quizAttemptId = data.attempt_id;
    state.questions = questionOrder.map((wordOrder, index) => ({
        ...state.lesson.words[Number(wordOrder) - 1],
        direction: questionDirections[index],
    }));
    state.currentIndex = 0;
    state.correctCount = 0;
    state.wrongAnswers = [];
    state.streak = 0;
    state.pointsEarned = 0;
    state.answered = false;
    state.isSubmittingAnswer = false;
    state.canSwipeNext = false;
    state.isAdvancing = false;
    showScreen("quiz");
    updateQuizRewardUI();
    renderQuestion();
}

function renderQuestion() {
    const question = state.questions[state.currentIndex];
    const total = state.questions.length;
    const progress = ((state.currentIndex + 1) / total) * 100;
    const isTypingQuestion = question.direction === "word-to-meaning";
    const options = isTypingQuestion ? [] : buildAnswerOptions(question, state.lesson.words);
    const answerField = getAnswerField(question.direction);
    const nextReward = getRewardForStreak(state.streak + 1);

    state.answered = false;
    state.canSwipeNext = false;
    state.answerOptions = options;
    elements.quizScreen.classList.toggle("typing-mode", isTypingQuestion);
    elements.quizScreen.classList.remove("swipe-ready");
    elements.quizContent.classList.toggle("typing-mode", isTypingQuestion);
    setTypingKeyboardActive(false);
    elements.quizContent.classList.remove("swipe-out");
    elements.quizContent.scrollTo({ top: 0, behavior: "auto" });
    elements.progressBar.style.width = `${progress}%`;
    elements.quizCount.textContent = `${state.currentIndex + 1}/${total}`;
    elements.quizGuide.textContent = isTypingQuestion ? "단어를 보고 뜻을 직접 입력해 주세요" : "뜻에 맞는 단어를 골라주세요";
    elements.quizPrompt.textContent = isTypingQuestion ? question.word : question.meaning;
    elements.quizPrompt.classList.toggle("word-prompt", isTypingQuestion);
    elements.currentReward.innerHTML = `<span class="point-coin small" aria-hidden="true">P</span>맞히면 ${nextReward.total}P`;
    elements.currentReward.classList.remove("earned");
    elements.answerList.hidden = isTypingQuestion;
    elements.typingAnswerForm.hidden = !isTypingQuestion;
    elements.typingAnswerInput.value = "";
    elements.typingAnswerInput.disabled = false;
    elements.typingAnswerButton.disabled = false;
    elements.typingAnswerForm.classList.remove("correct", "wrong");
    elements.quizHint.textContent = isTypingQuestion ? "뜻을 우리말로 써주세요. 예: 창고" : "알맞은 답을 하나 선택하세요.";
    elements.swipeHint.hidden = isTypingQuestion;
    elements.swipeHint.textContent = "답을 확인한 뒤 옆으로 밀어 다음 문제로 넘어가요.";
    elements.swipeHint.classList.remove("ready", "typing-next");
    elements.answerList.innerHTML = isTypingQuestion
        ? ""
        : options.map((option, index) => `<button class="answer-button" type="button" data-answer-index="${index}">${escapeHTML(option[answerField])}</button>`).join("");

    if (isTypingQuestion && !isCoarsePointer()) {
        window.setTimeout(() => elements.typingAnswerInput.focus({ preventScroll: true }), 80);
    }
}

async function finishAnswer(submittedAnswer = "", selectedIndex = null) {
    if (state.answered || state.isSubmittingAnswer || !state.quizAttemptId || !supabaseClient) return;

    state.isSubmittingAnswer = true;
    const question = state.questions[state.currentIndex];
    const { data, error } = await supabaseClient.rpc("submit_quiz_answer", {
        attempt_id_input: state.quizAttemptId,
        question_index_input: state.currentIndex + 1,
        answer_input: String(submittedAnswer),
    });
    state.isSubmittingAnswer = false;

    if (error) {
        console.error("quiz answer failed", error);
        elements.answerList.querySelectorAll(".answer-button").forEach((button) => (button.disabled = false));
        elements.typingAnswerInput.disabled = false;
        elements.typingAnswerButton.disabled = false;
        showToast(
            errorIncludes(error, "quiz_question_out_of_order") || errorIncludes(error, "quiz_attempt_expired")
                ? "퀴즈 상태가 만료됐어요. 다시 시작해 주세요."
                : "답안을 서버에서 확인하지 못했어요.",
        );
        return;
    }

    state.answered = true;
    const isCorrect = Boolean(data.is_correct);
    const expectedWord = String(data.expected_word || question.word);
    const expectedMeaning = String(data.expected_meaning || question.meaning);
    const answerField = getAnswerField(question.direction);
    const expectedAnswer = answerField === "word" ? expectedWord : expectedMeaning;
    const answerButtons = elements.answerList.querySelectorAll(".answer-button");

    answerButtons.forEach((button) => {
        button.disabled = true;
        const option = state.answerOptions[Number(button.dataset.answerIndex)];
        if (option && option[answerField] === expectedAnswer) button.classList.add("correct");
        else if (Number(button.dataset.answerIndex) === selectedIndex) button.classList.add("wrong");
    });

    profile.points = Math.max(0, Number(data.points) || 0);
    state.correctCount = Math.max(0, Number(data.correct_count) || 0);
    state.streak = Math.max(0, Number(data.streak) || 0);
    state.pointsEarned = Math.max(0, Number(data.points_earned) || 0);
    saveProfile();

    if (isCorrect) {
        updateProfileUI();
        updateQuizRewardUI();
        elements.currentReward.innerHTML = `<span class="point-coin small" aria-hidden="true">P</span>${Number(data.reward) || 0}P 받았어요!`;
        elements.currentReward.classList.add("earned");
        elements.quizHint.textContent = `${expectedWord} · ${expectedMeaning}`;
    } else {
        state.wrongAnswers.push({
            word: expectedWord,
            meaning: expectedMeaning,
            direction: question.direction,
            submittedAnswer: String(submittedAnswer).trim(),
        });
        updateQuizRewardUI();
        elements.currentReward.textContent = "이번 문제는 0P";
        elements.currentReward.classList.remove("earned");
        elements.quizHint.textContent = `정답: ${expectedWord} · ${expectedMeaning}`;
    }

    elements.typingAnswerForm.classList.add(isCorrect ? "correct" : "wrong");

    const isTypingQuestion = question.direction === "word-to-meaning";
    state.canSwipeNext = !isTypingQuestion;
    elements.quizScreen.classList.toggle("swipe-ready", !isTypingQuestion);
    elements.swipeHint.hidden = false;
    elements.swipeHint.textContent = isTypingQuestion
        ? state.currentIndex === state.questions.length - 1 ? "결과 보기" : "다음 문제"
        : state.currentIndex === state.questions.length - 1 ? "옆으로 밀어 결과를 확인하세요." : "옆으로 밀어 다음 문제로 넘어가세요.";
    elements.swipeHint.classList.toggle("typing-next", isTypingQuestion);
    elements.swipeHint.classList.add("ready");
}

function selectAnswer(selectedIndex) {
    if (state.answered || state.isSubmittingAnswer) return;
    const question = state.questions[state.currentIndex];
    const answerField = getAnswerField(question.direction);
    const selectedAnswer = state.answerOptions[selectedIndex];
    elements.answerList.querySelectorAll(".answer-button").forEach((button) => (button.disabled = true));
    void finishAnswer(selectedAnswer ? selectedAnswer[answerField] : "", selectedIndex);
}

function submitTypedAnswer(event) {
    event.preventDefault();
    if (state.answered) return;
    const typedAnswer = normalizeTypedAnswer(elements.typingAnswerInput.value);
    if (!typedAnswer) {
        elements.typingAnswerInput.focus();
        showToast("뜻을 입력해 주세요.");
        return;
    }
    releaseTypingInputFocus();
    elements.typingAnswerInput.disabled = true;
    elements.typingAnswerButton.disabled = true;
    void finishAnswer(elements.typingAnswerInput.value);
}

function advanceQuestion() {
    if (state.currentIndex < state.questions.length - 1) {
        state.currentIndex += 1;
        renderQuestion();
        return;
    }
    showResult();
}

function goToNextQuestion(withSwipeAnimation = false) {
    if (!state.answered || state.isAdvancing) return;
    if (!withSwipeAnimation) {
        advanceQuestion();
        return;
    }
    state.isAdvancing = true;
    elements.quizContent.classList.add("swipe-out");
    window.setTimeout(() => {
        state.isAdvancing = false;
        advanceQuestion();
    }, 150);
}

function showResult() {
    const total = state.questions.length;
    const percent = Math.round((state.correctCount / total) * 100);
    const directionLabels = { "meaning-to-word": "뜻→단어", "word-to-meaning": "단어→뜻", mixed: "혼합" };

    elements.resultMessage.textContent = `${state.lesson.id}과 ${state.mode === "random" ? "랜덤" : "순서"} · ${directionLabels[state.direction]} 학습을 모두 마쳤어요.`;
    elements.scorePercent.textContent = `${percent}%`;
    elements.correctCount.textContent = state.correctCount;
    elements.totalCount.textContent = total;
    elements.resultPointsEarned.textContent = `+${state.pointsEarned}P`;
    elements.resultTotalPoints.textContent = `${profile.points}P`;
    elements.wrongAnswerSection.hidden = state.wrongAnswers.length === 0;
    elements.wrongAnswerCount.textContent = `${state.wrongAnswers.length}개`;
    elements.wrongAnswerList.innerHTML = state.wrongAnswers
        .map((answer) => {
            const prompt = answer.direction === "meaning-to-word" ? answer.meaning : answer.word;
            const submitted = answer.submittedAnswer || "답하지 않음";
            return `
                <article class="wrong-answer-row">
                    <span class="wrong-answer-word">${escapeHTML(answer.word)}</span>
                    <span class="wrong-answer-copy">
                        <strong>${escapeHTML(answer.meaning)}</strong>
                        <small>문제 ${escapeHTML(prompt)} · 내 답 ${escapeHTML(submitted)}</small>
                    </span>
                </article>
            `;
        })
        .join("");
    showScreen("result");
}

function getAuthErrorMessage(error) {
    const message = String((error && error.message) || "").toLowerCase();
    if (message.includes("invalid login credentials")) return "이메일 또는 비밀번호가 올바르지 않아요.";
    if (message.includes("email not confirmed")) return "이메일 인증을 완료한 뒤 로그인해 주세요.";
    if (message.includes("already registered")) return "이미 가입된 이메일이에요.";
    if (message.includes("password")) return "비밀번호는 10자 이상으로 입력해 주세요.";
    if (message.includes("provider") || message.includes("unsupported")) return "Supabase에서 해당 로그인 제공자를 먼저 설정해 주세요.";
    return (error && error.message) || "로그인 처리 중 오류가 발생했어요.";
}

function setAuthButtonsBusy(isBusy) {
    elements.loginSubmitButton.disabled = isBusy;
    elements.signupButton.disabled = isBusy;
}

async function handleLogin(event) {
    event.preventDefault();
    const email = elements.username.value.trim().toLowerCase();
    const password = elements.password.value;
    if (!email || !password) {
        elements.loginError.textContent = "이메일과 비밀번호를 모두 입력해 주세요.";
        return;
    }
    if (!supabaseClient) {
        elements.loginError.textContent = "Supabase 연결 설정을 확인해 주세요.";
        return;
    }
    setAuthButtonsBusy(true);
    elements.loginError.textContent = "";
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    setAuthButtonsBusy(false);
    if (error) {
        elements.loginError.textContent = getAuthErrorMessage(error);
        elements.password.focus();
    }
}

async function handleSignup() {
    const email = elements.username.value.trim().toLowerCase();
    const password = elements.password.value;
    if (!email || !password) {
        elements.loginError.textContent = "가입할 이메일과 비밀번호를 입력해 주세요.";
        return;
    }
    if (password.length < 10) {
        elements.loginError.textContent = "비밀번호는 10자 이상으로 입력해 주세요.";
        return;
    }
    if (!supabaseClient) {
        elements.loginError.textContent = "Supabase 연결 설정을 확인해 주세요.";
        return;
    }
    setAuthButtonsBusy(true);
    elements.loginError.textContent = "";
    const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: getAuthRedirectUrl(), data: { display_name: email.split("@")[0].slice(0, 12) } },
    });
    setAuthButtonsBusy(false);
    if (error) {
        elements.loginError.textContent = getAuthErrorMessage(error);
        return;
    }
    if (!data.session) {
        elements.loginError.textContent = "가입 확인 메일을 보냈어요. 메일의 링크를 눌러주세요.";
        return;
    }
    showToast("회원가입이 완료됐어요.");
}

async function logout() {
    if (!supabaseClient) {
        handleSignedOut();
        return;
    }
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        showToast("로그아웃하지 못했어요.");
        return;
    }
    handleSignedOut();
    elements.loginForm.reset();
    elements.password.type = "password";
    elements.passwordToggle.textContent = "보기";
}

async function claimAttendanceReward() {
    if (profile.lastAttendanceDate === getTodayKey()) {
        closeAttendanceModal();
        showToast("오늘 출석 보상은 이미 받았어요.");
        return;
    }
    if (!supabaseClient || !currentUser) {
        showToast("로그인 상태를 다시 확인해 주세요.");
        return;
    }
    elements.attendanceButton.disabled = true;
    elements.attendanceModalButton.disabled = true;
    const { data, error } = await supabaseClient.rpc("claim_attendance_reward");
    if (error) {
        console.error("attendance claim failed", error);
        if (errorIncludes(error, "attendance_already_claimed")) {
            await loadRemoteProfile();
            showToast("오늘 출석 보상은 이미 받았어요.");
        } else {
            showToast("출석 보상을 받지 못했어요. 다시 시도해 주세요.");
        }
        updateProfileUI();
        return;
    }
    applyServerProfile(data);
    updateProfileUI();
    renderLeaderboard();
    closeAttendanceModal();
    showToast("출석 완료! 100P를 받았어요.");
}

async function levelUp() {
    if (!areAllLessonsUnlocked()) {
        showToast("5과까지 모두 열면 레벨업할 수 있어요.");
        return;
    }
    if (!supabaseClient || !currentUser) {
        showToast("로그인 상태를 다시 확인해 주세요.");
        return;
    }
    elements.levelUpButton.disabled = true;
    const { data, error } = await supabaseClient.rpc("level_up");
    if (error) {
        console.error("level up failed", error);
        showToast(errorIncludes(error, "insufficient_points") ? "서버 기준으로 포인트가 부족해요." : "레벨을 올리지 못했어요. 다시 시도해 주세요.");
        updateProfileUI();
        return;
    }
    applyServerProfile(data);
    updateProfileUI();
    renderLeaderboard();
    showToast(`레벨 ${profile.level}이 되었어요!`);
}

async function saveProfilePreferences() {
    if (!supabaseClient || !currentUser) return false;
    const { data, error } = await supabaseClient.rpc("update_profile_preferences", {
        display_name_input: profile.displayName,
        theme_input: profile.theme,
        default_direction_input: profile.defaultDirection,
    });
    if (error) {
        console.error("profile preferences save failed", error);
        showToast("설정을 서버에 저장하지 못했어요.");
        return false;
    }
    applyServerProfile(data);
    return true;
}

async function saveProfileName(event) {
    event.preventDefault();
    const displayName = elements.profileNameInput.value.trim().slice(0, 12);
    if (!displayName) {
        showToast("표시할 이름을 입력해 주세요.");
        elements.profileNameInput.focus();
        return;
    }
    const previousName = profile.displayName;
    profile.displayName = displayName;
    if (!(await saveProfilePreferences())) {
        profile.displayName = previousName;
        updateProfileUI();
        return;
    }
    updateProfileUI();
    renderLeaderboard();
    showToast("이름을 저장했어요.");
}

elements.loginForm.addEventListener("submit", handleLogin);
elements.signupButton.addEventListener("click", handleSignup);
elements.inviteForm.addEventListener("submit", handleInviteSubmit);
elements.inviteLogoutButton.addEventListener("click", logout);
elements.refreshInviteCodeButton.addEventListener("click", refreshAdminInviteCode);

elements.passwordToggle.addEventListener("click", () => {
    const shouldShow = elements.password.type === "password";
    elements.password.type = shouldShow ? "text" : "password";
    elements.passwordToggle.textContent = shouldShow ? "숨김" : "보기";
    elements.passwordToggle.setAttribute("aria-label", shouldShow ? "비밀번호 숨기기" : "비밀번호 보기");
});

elements.logoutButton.addEventListener("click", logout);
elements.attendanceButton.addEventListener("click", claimAttendanceReward);
elements.attendanceModalButton.addEventListener("click", claimAttendanceReward);
elements.closeAttendanceButtons.forEach((button) => button.addEventListener("click", closeAttendanceModal));
elements.levelUpButton.addEventListener("click", levelUp);
elements.profileNameForm.addEventListener("submit", saveProfileName);

elements.lessonList.addEventListener("click", (event) => {
    const lessonButton = event.target.closest("[data-lesson-id]");
    if (lessonButton) {
        const lessonId = Number(lessonButton.dataset.lessonId);
        if (lessonButton.dataset.lessonAction === "blocked") showToast(`${lessonId - 1}과를 먼저 열어주세요.`);
        else if (lessonButton.dataset.lessonAction === "purchase") openPurchaseModal(lessonId);
        else openLesson(lessonId);
    }
});

elements.screenLinkButtons.forEach((button) => button.addEventListener("click", () => showScreen(button.dataset.screenLink)));
elements.shopItemList.addEventListener("click", handleShopItemAction);
elements.shopInventoryList.addEventListener("click", handleShopItemAction);
elements.shopViewButtons.forEach((button) => button.addEventListener("click", () => setShopView(button.dataset.shopView)));

elements.lessonWordsList.addEventListener("click", (event) => {
    const wordCard = event.target.closest("[data-word-index]");
    if (wordCard) openWordPreview(Number(wordCard.dataset.wordIndex));
});

elements.closeWordPreviewButton.addEventListener("click", closeWordPreview);
elements.previousWordButton.addEventListener("click", () => moveWordPreview(-1));
elements.nextWordButton.addEventListener("click", () => moveWordPreview(1));

let wordPreviewSwipeStart = null;
elements.wordPreviewStage.addEventListener("pointerdown", (event) => {
    wordPreviewSwipeStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
});
elements.wordPreviewStage.addEventListener("pointerup", (event) => {
    if (!wordPreviewSwipeStart || wordPreviewSwipeStart.pointerId !== event.pointerId) return;
    const horizontalDistance = event.clientX - wordPreviewSwipeStart.x;
    const verticalDistance = event.clientY - wordPreviewSwipeStart.y;
    wordPreviewSwipeStart = null;
    if (Math.abs(horizontalDistance) < 50 || Math.abs(horizontalDistance) <= Math.abs(verticalDistance) * 1.15) return;
    moveWordPreview(horizontalDistance < 0 ? 1 : -1);
});
elements.wordPreviewStage.addEventListener("pointercancel", () => (wordPreviewSwipeStart = null));

elements.backButtons.forEach((button) => button.addEventListener("click", () => showScreen(button.dataset.back)));

elements.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
        state.mode = button.dataset.mode;
        state.direction = profile.defaultDirection;
        void startQuiz();
    });
});

elements.viewWordsButton.addEventListener("click", () => {
    renderLessonWords();
    showScreen("words");
});

elements.themeButtons.forEach((button) => {
    button.addEventListener("click", async () => {
        const previousTheme = profile.theme;
        profile.theme = button.dataset.themeOption;
        applyTheme();
        syncSettingsUI();
        if (!(await saveProfilePreferences())) {
            profile.theme = previousTheme;
            applyTheme();
            syncSettingsUI();
        }
    });
});

elements.defaultDirectionButtons.forEach((button) => {
    button.addEventListener("click", async () => {
        const previousDirection = profile.defaultDirection;
        profile.defaultDirection = button.dataset.defaultDirection;
        state.direction = profile.defaultDirection;
        syncSettingsUI();
        if (!(await saveProfilePreferences())) {
            profile.defaultDirection = previousDirection;
            state.direction = previousDirection;
            syncSettingsUI();
        }
    });
});

elements.confirmPurchaseButton.addEventListener("click", purchaseLesson);
elements.closePurchaseButtons.forEach((button) => button.addEventListener("click", closePurchaseModal));

elements.answerList.addEventListener("click", (event) => {
    const answerButton = event.target.closest("[data-answer-index]");
    if (answerButton) selectAnswer(Number(answerButton.dataset.answerIndex));
});

elements.typingAnswerForm.addEventListener("submit", submitTypedAnswer);
elements.typingAnswerInput.addEventListener("focus", stabilizeTypingViewport);
elements.typingAnswerInput.addEventListener("blur", () => {
    window.setTimeout(() => {
        if (document.activeElement !== elements.typingAnswerInput) setTypingKeyboardActive(false);
    }, 120);
});

if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", updateTypingViewportInset);
    window.visualViewport.addEventListener("scroll", updateTypingViewportInset);
}

let swipeStart = null;

function beginQuizSwipe(pointerId, x, y) {
    if (!state.canSwipeNext || state.isAdvancing) {
        swipeStart = null;
        return;
    }
    swipeStart = { pointerId, x, y };
}

function tryQuizSwipe(pointerId, x, y) {
    if (!swipeStart || swipeStart.pointerId !== pointerId) return false;
    const horizontalDistance = x - swipeStart.x;
    const verticalDistance = y - swipeStart.y;
    if (Math.abs(horizontalDistance) <= 55 || Math.abs(horizontalDistance) <= Math.abs(verticalDistance) * 1.2) return false;
    swipeStart = null;
    goToNextQuestion(true);
    return true;
}

function completeQuizSwipe(pointerId, x, y) {
    if (!tryQuizSwipe(pointerId, x, y)) swipeStart = null;
}

if ("PointerEvent" in window) {
    elements.quizScreen.addEventListener("pointerdown", (event) => {
        if (!event.isPrimary) return;
        beginQuizSwipe(event.pointerId, event.clientX, event.clientY);
        if (swipeStart && elements.quizScreen.setPointerCapture) elements.quizScreen.setPointerCapture(event.pointerId);
    });
    elements.quizScreen.addEventListener("pointermove", (event) => {
        if (!event.isPrimary) return;
        tryQuizSwipe(event.pointerId, event.clientX, event.clientY);
    });
    elements.quizScreen.addEventListener("pointerup", (event) => {
        if (!event.isPrimary) return;
        completeQuizSwipe(event.pointerId, event.clientX, event.clientY);
    });
    elements.quizScreen.addEventListener("pointercancel", () => (swipeStart = null));
} else {
    elements.quizScreen.addEventListener("touchstart", (event) => {
        if (event.touches.length !== 1) {
            swipeStart = null;
            return;
        }
        const touch = event.touches[0];
        beginQuizSwipe(touch.identifier, touch.clientX, touch.clientY);
    });
    elements.quizScreen.addEventListener(
        "touchmove",
        (event) => {
            const touch = Array.from(event.touches).find((item) => swipeStart && item.identifier === swipeStart.pointerId);
            if (!touch) return;
            event.preventDefault();
            tryQuizSwipe(touch.identifier, touch.clientX, touch.clientY);
        },
        { passive: false },
    );
    elements.quizScreen.addEventListener("touchend", (event) => {
        const touch = Array.from(event.changedTouches).find((item) => swipeStart && item.identifier === swipeStart.pointerId);
        if (touch) completeQuizSwipe(touch.identifier, touch.clientX, touch.clientY);
    });
    elements.quizScreen.addEventListener("touchcancel", () => (swipeStart = null));
}

elements.swipeHint.addEventListener("click", () => goToNextQuestion(false));
elements.quitQuizButton.addEventListener("click", () => showScreen("mode"));
elements.retryButton.addEventListener("click", () => void startQuiz());
elements.resultHomeButton.addEventListener("click", () => showScreen("home"));

function startApp() {
    applyTheme();
    syncSettingsUI();
    updateProfileUI();
    renderLessons();
    renderShop();
    closePurchaseModal();
    showScreen("login");
    void initializeAuth();
}

startApp();