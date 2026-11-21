/**
 * Home page (landing) translations.
 *
 * ONLY the public home page is multilingual; the app itself stays in
 * English. The visitor's language is detected from the browser, can be
 * changed with the switcher on the page, and the choice is remembered.
 * English is the fallback whenever a language is not available.
 *
 * Per Shastri's instruction (2026-11-21), the BUTTONS stay in English
 * in every language ("Log In", "Register", "Start Learning for Free",
 * "Register — Free of Charge") — only the reading text is translated.
 * Proper names ("English for Cricket", "KYCO", "Kansai Youth Cricket
 * Organization") and the five stage names also stay in English; the
 * stage descriptions are translated.
 *
 * Wording: the translations Shastri reviewed in
 * Homepage-Translations-DRAFT.md (2026-11-21).
 */

export type LandingLocale = 'en' | 'ja' | 'hi' | 'ur' | 'ps' | 'sw' | 'de' | 'zu';

export const LANDING_LOCALES: { code: LandingLocale; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ur', label: 'اردو' },
  { code: 'ps', label: 'پښتو' },
  { code: 'sw', label: 'Kiswahili' },
  { code: 'de', label: 'Deutsch' },
  { code: 'zu', label: 'isiZulu' },
];

/** Languages written right-to-left: the page layout flips for them. */
export const RTL_LOCALES: LandingLocale[] = ['ur', 'ps'];

export const LANDING_LANG_STORAGE_KEY = 'efc_landing_lang';

/** The browser's preferred language, narrowed to a supported locale. */
export function detectLandingLocale(): LandingLocale {
  if (typeof navigator !== 'undefined') {
    const candidates = navigator.languages?.length
      ? navigator.languages
      : [navigator.language];
    for (const candidate of candidates) {
      const prefix = (candidate || '').toLowerCase().split('-')[0];
      if (LANDING_LOCALES.some((l) => l.code === prefix)) {
        return prefix as LandingLocale;
      }
    }
  }
  return 'en';
}

export interface LandingStrings {
  heroTitle: string;
  heroIntro: string;
  alreadyAccount: string;
  pinNote: string;
  statLessons: string;
  statStages: string;
  statModules: string;
  statWords: string;
  statFree: string;
  programmeLabel: string;
  programmeTitle: string;
  programmeIntro: string;
  features: { title: string; text: string }[];
  beyondLessons: string;
  startLabel: string;
  howTitle: string;
  steps: { title: string; text: string }[];
  stagesTitle: string;
  stages: { name: string; note: string }[];
  commitmentLabel: string;
  commitmentTitle: string;
  commitments: { title: string; text: string }[];
  support: string;
  terms: string;
  privacy: string;
  initiativeLine: string;
  rightsLine: string;
}

const EN: LandingStrings = {
  heroTitle: 'Learn English Through Cricket',
  heroIntro:
    'English for Cricket is a complete English-learning programme built around the game of cricket. Across 320 structured lessons, learners progress from their first words to confident, independent communication — through listening, speaking, reading and play. The programme is provided by KYCO, the Kansai Youth Cricket Organization, and is free to every learner. It will always remain so.',
  alreadyAccount: 'Already have an account? Log in',
  pinNote:
    'Learners at participating schools and clubs receive a username and PIN from their teacher or coach. No email address is required.',
  statLessons: 'Lessons',
  statStages: 'Stages',
  statModules: 'Modules',
  statWords: 'Words',
  statFree: 'Free, always',
  programmeLabel: 'The Programme',
  programmeTitle: 'Everything a Learner Needs',
  programmeIntro:
    'A complete course in one place: structured lessons, spoken practice, guided reading and considered review — every element built around cricket, so that each new word arrives with a context that makes it memorable.',
  features: [
    {
      title: 'The Learning Path',
      text: 'A structured course of 320 lessons in five stages and forty modules. Each lesson builds carefully on those before it, introducing new language and returning to earlier language in new forms until it is secure.',
    },
    {
      title: 'Speaking Practice',
      text: 'Guided conversations — interviews and everyday small talk — in which learners speak their part aloud and receive a score for every line, against a pass mark of seventy per cent.',
    },
    {
      title: 'Smart Reading',
      text: 'Short stories in two forms: Listen and Read, in which each word is highlighted as it is spoken, and Read Aloud, in which the learner\u2019s own reading is scored sentence by sentence.',
    },
    {
      title: 'Real Human Voices',
      text: 'Every line of the course is being recorded by real voice artists, in several distinct voices. Learners choose the voice they wish to hear, and listen to natural, human English throughout.',
    },
    {
      title: 'Tricky Words Review',
      text: 'Words and phrases a learner finds difficult are gathered automatically and presented again for review, so that weaker points receive further practice until they are mastered.',
    },
    {
      title: 'XP, Stars and Badges',
      text: 'Learners earn experience points and stars for completed work, and badges for significant achievements. A class may follow its own weekly star board; there are no public rankings.',
    },
    {
      title: 'Study Days and Streaks',
      text: 'Each learner chooses the days of the week on which they will study. Only those days count towards the learning streak, so a rest day can never break it.',
    },
    {
      title: 'Find Your Start',
      text: 'A short placement assessment recommends the stage at which a new learner should begin. Nothing is locked; the recommendation simply provides a sensible starting point.',
    },
    {
      title: 'For Schools and Clubs',
      text: 'Teachers and coaches may enrol a whole class with simple username-and-PIN logins, print a login slip for every learner, and follow the progress of the entire group.',
    },
  ],
  beyondLessons:
    'Beyond the lessons, a library of cricket games, video lessons and downloadable workbooks accompanies the course — including the ICC\u2019s official introduction to the game.',
  startLabel: 'Getting Started',
  howTitle: 'How It Works',
  steps: [
    {
      title: 'Register, or receive a PIN',
      text: 'Create a free account with an email address, or receive a username and PIN from a teacher or coach. Both routes provide full access to the programme.',
    },
    {
      title: 'Follow the Learning Path',
      text: 'Work through the stages in order, at your own pace — at home, at school or at the club. A short placement assessment can identify the appropriate starting point.',
    },
    {
      title: 'Practise, review and progress',
      text: 'Speaking practice, guided reading and targeted review reinforce every lesson, while points, stars and badges provide a clear record of progress.',
    },
  ],
  stagesTitle: 'The five stages of the course',
  stages: [
    { name: 'The Foundation', note: 'First words and sentences' },
    { name: 'The Rookie', note: 'Everyday English, securely established' },
    { name: 'The Player', note: 'Independent reading and conversation' },
    { name: 'The Strategist', note: 'Analysis and the language of the game' },
    { name: 'The Captain', note: 'Advanced communication and leadership' },
  ],
  commitmentLabel: 'Our Commitment',
  commitmentTitle: 'Free. Safe. For Every Learner.',
  commitments: [
    {
      title: 'Free of charge, permanently',
      text: 'English for Cricket carries no fees and no advertising, and it never will. Every part of the programme is offered to every learner on equal terms.',
    },
    {
      title: 'Designed for children\u2019s safety',
      text: 'There are no public profiles, no open messaging and no external advertising. Learners see the progress of their own class only, and nothing further.',
    },
    {
      title: 'Prepared with care',
      text: 'The programme is designed and maintained by the volunteers of KYCO in Kansai, Japan, for young cricketers — and for every child who would like to learn English through the game.',
    },
  ],
  support: 'Support',
  terms: 'Terms & Conditions',
  privacy: 'Privacy Policy',
  initiativeLine:
    'English for Cricket is an educational initiative of KYCO, the Kansai Youth Cricket Organization.',
  rightsLine: '© 2026 Kansai Youth Cricket Organization. All rights reserved.',
};

const JA: LandingStrings = {
  heroTitle: 'クリケットを通して英語を学ぼう',
  heroIntro:
    'English for Cricket は、クリケットというスポーツを題材にした、総合的な英語学習プログラムです。全320の体系的なレッスンを通して、学習者は初めての単語から、自信を持って自立的にコミュニケーションできる力へと段階的に進みます。聞くこと、話すこと、読むこと、そして遊びを通して学びます。本プログラムは KYCO(関西ユースクリケット協会)によって提供され、すべての学習者に無料で公開されています。そして今後も、ずっと無料です。',
  alreadyAccount: 'すでにアカウントをお持ちですか?ログイン',
  pinNote:
    '参加している学校やクラブの学習者には、先生やコーチからユーザー名とPINが配布されます。メールアドレスは必要ありません。',
  statLessons: 'レッスン',
  statStages: 'ステージ',
  statModules: 'モジュール',
  statWords: '語以上',
  statFree: 'ずっと無料',
  programmeLabel: 'プログラム',
  programmeTitle: '学習者に必要なすべてがここに',
  programmeIntro:
    '体系的なレッスン、スピーキング練習、ガイド付きリーディング、丁寧な復習——完全なコースがひとつの場所に揃っています。すべての要素がクリケットを題材にしているため、新しい単語は印象に残る文脈とともに届きます。',
  features: [
    {
      title: 'ラーニングパス',
      text: '五つのステージと40のモジュールにわたる、全320レッスンの体系的なコースです。各レッスンは前のレッスンの上に丁寧に積み上げられ、新しい表現を導入しながら、以前の表現を新しい形で繰り返し、確実に定着させます。',
    },
    {
      title: 'スピーキング練習',
      text: 'インタビューや日常の雑談などのガイド付き会話で、学習者は自分のセリフを声に出して話し、一文ごとにスコアを受け取ります。合格ラインは70%です。',
    },
    {
      title: 'スマートリーディング',
      text: '短い物語を二つの形式で提供します。「聞いて読む」では、読み上げに合わせて単語が一つずつハイライトされます。「声に出して読む」では、学習者自身の朗読が一文ごとに採点されます。',
    },
    {
      title: '本物の人間の声',
      text: 'コースのすべてのセリフを、複数の異なる声の持ち主である実際の声優が録音しています。学習者は聞きたい声を選ぶことができ、全体を通して自然な人間の英語を聞くことができます。',
    },
    {
      title: '苦手な単語の復習',
      text: '学習者が難しいと感じる単語やフレーズは自動的に集められ、復習のために再び提示されます。苦手な部分は、習得できるまで繰り返し練習できます。',
    },
    {
      title: 'XP、星、バッジ',
      text: '学習者は、完了した学習に対して経験値と星を獲得し、大きな達成にはバッジが授与されます。クラスごとに週間の星ボードを確認できますが、公開ランキングはありません。',
    },
    {
      title: '学習曜日と連続記録',
      text: '学習者は、学習する曜日を自分で選びます。連続記録に数えられるのはその曜日だけなので、休息日が記録を途切れさせることは決してありません。',
    },
    {
      title: 'スタート地点を見つける',
      text: '短いレベル判定テストが、新しい学習者が始めるべきステージを提案します。何もロックされることはなく、この提案は適切な出発点を示すためのものです。',
    },
    {
      title: '学校とクラブのために',
      text: '先生やコーチは、シンプルなユーザー名とPINによるログインでクラス全員を登録し、学習者一人ひとりにログイン票を印刷して、グループ全体の進捗を確認できます。',
    },
  ],
  beyondLessons:
    'レッスンに加えて、クリケットゲーム、ビデオレッスン、ダウンロード可能なワークブックのライブラリがコースに付随しています。ICCによる公式のクリケット入門も含まれています。',
  startLabel: 'はじめに',
  howTitle: '利用の流れ',
  steps: [
    {
      title: '登録する、またはPINを受け取る',
      text: 'メールアドレスで無料アカウントを作成するか、先生やコーチからユーザー名とPINを受け取ります。どちらの方法でも、プログラムのすべてを利用できます。',
    },
    {
      title: 'ラーニングパスに沿って進む',
      text: '自宅、学校、クラブで、自分のペースでステージを順番に進めます。短いレベル判定テストで、適切な出発点を確認することもできます。',
    },
    {
      title: '練習し、復習し、前進する',
      text: 'スピーキング練習、ガイド付きリーディング、的を絞った復習が各レッスンを補強し、ポイント、星、バッジが進捗の明確な記録となります。',
    },
  ],
  stagesTitle: 'コースの五つのステージ',
  stages: [
    { name: 'The Foundation', note: '初めての単語と文' },
    { name: 'The Rookie', note: '日常英語を確実に身につける' },
    { name: 'The Player', note: '自立した読解と会話' },
    { name: 'The Strategist', note: '分析とゲームの言語' },
    { name: 'The Captain', note: '高度なコミュニケーションとリーダーシップ' },
  ],
  commitmentLabel: '私たちの約束',
  commitmentTitle: '無料。安全。すべての学習者のために。',
  commitments: [
    {
      title: '永久に無料',
      text: 'English for Cricket には料金も広告もありません。そして今後も決してありません。プログラムのすべてが、すべての学習者に平等な条件で提供されます。',
    },
    {
      title: '子どもの安全のために設計',
      text: '公開プロフィールも、オープンなメッセージ機能も、外部広告もありません。学習者が見られるのは、自分のクラスの進捗だけです。それ以外のものは一切ありません。',
    },
    {
      title: '心を込めて制作',
      text: 'このプログラムは、日本の関西に拠点を置くKYCOのボランティアによって、若いクリケット選手たちのために——そして、このゲームを通して英語を学びたいすべての子どものために——設計され、維持されています。',
    },
  ],
  support: 'サポート',
  terms: '利用規約',
  privacy: 'プライバシーポリシー',
  initiativeLine:
    'English for Cricket は、KYCO(関西ユースクリケット協会)の教育イニシアチブです。',
  rightsLine: '© 2026 Kansai Youth Cricket Organization. All rights reserved.',
};

const HI: LandingStrings = {
  heroTitle: 'क्रिकेट के माध्यम से अंग्रेज़ी सीखें',
  heroIntro:
    'English for Cricket क्रिकेट के खेल पर आधारित एक संपूर्ण अंग्रेज़ी-शिक्षण कार्यक्रम है। 320 सुनियोजित पाठों के माध्यम से शिक्षार्थी अपने पहले शब्दों से लेकर आत्मविश्वासपूर्ण और स्वतंत्र संवाद तक प्रगति करते हैं — सुनने, बोलने, पढ़ने और खेल के माध्यम से। यह कार्यक्रम KYCO, Kansai Youth Cricket Organization, द्वारा प्रदान किया जाता है और प्रत्येक शिक्षार्थी के लिए निःशुल्क है। यह सदैव ऐसा ही रहेगा।',
  alreadyAccount: 'क्या आपके पास पहले से खाता है? लॉग इन करें',
  pinNote:
    'भाग लेने वाले विद्यालयों और क्लबों के शिक्षार्थियों को अपने शिक्षक या प्रशिक्षक से उपयोगकर्ता नाम और PIN प्राप्त होता है। किसी ईमेल पते की आवश्यकता नहीं है।',
  statLessons: 'पाठ',
  statStages: 'चरण',
  statModules: 'मॉड्यूल',
  statWords: 'शब्द',
  statFree: 'निःशुल्क, सदैव',
  programmeLabel: 'कार्यक्रम',
  programmeTitle: 'एक शिक्षार्थी को जो कुछ भी चाहिए',
  programmeIntro:
    'एक ही स्थान पर एक संपूर्ण पाठ्यक्रम: सुनियोजित पाठ, बोलने का अभ्यास, मार्गदर्शित पठन और सोच-समझकर की गई पुनरावृत्ति — प्रत्येक तत्व क्रिकेट पर आधारित है, ताकि प्रत्येक नया शब्द ऐसे संदर्भ के साथ आए जो उसे यादगार बनाए।',
  features: [
    {
      title: 'शिक्षण पथ',
      text: 'पाँच चरणों और चालीस मॉड्यूलों में 320 पाठों का एक सुनियोजित पाठ्यक्रम। प्रत्येक पाठ पिछले पाठों पर सावधानीपूर्वक आधारित है — नई भाषा प्रस्तुत करते हुए और पुरानी भाषा को नए रूपों में दोहराते हुए, जब तक वह पक्की न हो जाए।',
    },
    {
      title: 'बोलने का अभ्यास',
      text: 'मार्गदर्शित वार्तालाप — साक्षात्कार और रोज़मर्रा की बातचीत — जिनमें शिक्षार्थी अपनी बात ज़ोर से बोलते हैं और प्रत्येक पंक्ति के लिए अंक प्राप्त करते हैं, जिसमें उत्तीर्णांक सत्तर प्रतिशत है।',
    },
    {
      title: 'स्मार्ट पठन',
      text: "दो रूपों में छोटी कहानियाँ: 'सुनें और पढ़ें', जिसमें प्रत्येक शब्द बोले जाने पर उजागर होता है, और 'ज़ोर से पढ़ें', जिसमें शिक्षार्थी के अपने पठन को वाक्य-दर-वाक्य अंक दिए जाते हैं।",
    },
    {
      title: 'वास्तविक मानवीय आवाज़ें',
      text: 'पाठ्यक्रम की प्रत्येक पंक्ति को वास्तविक ध्वनि कलाकारों द्वारा कई अलग-अलग आवाज़ों में रिकॉर्ड किया जा रहा है। शिक्षार्थी अपनी पसंद की आवाज़ चुनते हैं और पूरे पाठ्यक्रम में स्वाभाविक, मानवीय अंग्रेज़ी सुनते हैं।',
    },
    {
      title: 'कठिन शब्दों की पुनरावृत्ति',
      text: 'जिन शब्दों और वाक्यांशों को शिक्षार्थी कठिन पाता है, वे स्वतः एकत्र किए जाते हैं और पुनरावृत्ति के लिए फिर से प्रस्तुत किए जाते हैं, ताकि कमज़ोर बिंदुओं का और अभ्यास हो सके, जब तक उनमें महारत न हो जाए।',
    },
    {
      title: 'XP, सितारे और बैज',
      text: 'शिक्षार्थी पूर्ण किए गए कार्य के लिए अनुभव अंक और सितारे अर्जित करते हैं, और महत्वपूर्ण उपलब्धियों के लिए बैज प्राप्त करते हैं। कोई कक्षा अपना साप्ताहिक स्टार बोर्ड देख सकती है; कोई सार्वजनिक रैंकिंग नहीं है।',
    },
    {
      title: 'अध्ययन दिवस और निरंतरता',
      text: 'प्रत्येक शिक्षार्थी सप्ताह के वे दिन चुनता है जिनमें वह अध्ययन करेगा। केवल वे ही दिन सीखने की निरंतरता में गिने जाते हैं, इसलिए विश्राम का दिन उसे कभी तोड़ नहीं सकता।',
    },
    {
      title: 'अपनी शुरुआत खोजें',
      text: 'एक छोटा स्तर-निर्धारण मूल्यांकन उस चरण की सिफ़ारिश करता है जहाँ से नए शिक्षार्थी को शुरुआत करनी चाहिए। कुछ भी बंद नहीं है; यह सिफ़ारिश बस एक उचित प्रारंभिक बिंदु प्रदान करती है।',
    },
    {
      title: 'विद्यालयों और क्लबों के लिए',
      text: 'शिक्षक और प्रशिक्षक सरल उपयोगकर्ता नाम और PIN लॉगिन के साथ पूरी कक्षा को नामांकित कर सकते हैं, प्रत्येक शिक्षार्थी के लिए लॉगिन पर्ची छाप सकते हैं, और पूरे समूह की प्रगति का अनुसरण कर सकते हैं।',
    },
  ],
  beyondLessons:
    'पाठों के अलावा, क्रिकेट खेलों, वीडियो पाठों और डाउनलोड करने योग्य कार्यपुस्तिकाओं का एक पुस्तकालय पाठ्यक्रम के साथ है — जिसमें ICC का खेल का आधिकारिक परिचय भी शामिल है।',
  startLabel: 'शुरुआत करें',
  howTitle: 'यह कैसे काम करता है',
  steps: [
    {
      title: 'पंजीकरण करें, या PIN प्राप्त करें',
      text: 'ईमेल पते के साथ एक निःशुल्क खाता बनाएँ, या किसी शिक्षक या प्रशिक्षक से उपयोगकर्ता नाम और PIN प्राप्त करें। दोनों ही रास्ते कार्यक्रम तक पूर्ण पहुँच प्रदान करते हैं।',
    },
    {
      title: 'शिक्षण पथ का अनुसरण करें',
      text: 'चरणों को क्रम से, अपनी गति से पूरा करें — घर पर, विद्यालय में या क्लब में। एक छोटा स्तर-निर्धारण मूल्यांकन उचित प्रारंभिक बिंदु की पहचान कर सकता है।',
    },
    {
      title: 'अभ्यास करें, दोहराएँ और आगे बढ़ें',
      text: 'बोलने का अभ्यास, मार्गदर्शित पठन और लक्षित पुनरावृत्ति प्रत्येक पाठ को मज़बूत करती है, जबकि अंक, सितारे और बैज प्रगति का स्पष्ट रिकॉर्ड प्रदान करते हैं।',
    },
  ],
  stagesTitle: 'पाठ्यक्रम के पाँच चरण',
  stages: [
    { name: 'The Foundation', note: 'पहले शब्द और वाक्य' },
    { name: 'The Rookie', note: 'रोज़मर्रा की अंग्रेज़ी, मज़बूती से स्थापित' },
    { name: 'The Player', note: 'स्वतंत्र पठन और वार्तालाप' },
    { name: 'The Strategist', note: 'विश्लेषण और खेल की भाषा' },
    { name: 'The Captain', note: 'उन्नत संवाद और नेतृत्व' },
  ],
  commitmentLabel: 'हमारी प्रतिबद्धता',
  commitmentTitle: 'निःशुल्क। सुरक्षित। प्रत्येक शिक्षार्थी के लिए।',
  commitments: [
    {
      title: 'स्थायी रूप से निःशुल्क',
      text: 'English for Cricket में कोई शुल्क नहीं है और कोई विज्ञापन नहीं है, और कभी होगा भी नहीं। कार्यक्रम का प्रत्येक भाग प्रत्येक शिक्षार्थी को समान शर्तों पर प्रदान किया जाता है।',
    },
    {
      title: 'बच्चों की सुरक्षा के लिए बनाया गया',
      text: 'कोई सार्वजनिक प्रोफ़ाइल नहीं, कोई खुला संदेश-व्यवहार नहीं और कोई बाहरी विज्ञापन नहीं। शिक्षार्थी केवल अपनी कक्षा की प्रगति देखते हैं, और कुछ नहीं।',
    },
    {
      title: 'देखभाल के साथ तैयार',
      text: 'यह कार्यक्रम जापान के कंसाई में KYCO के स्वयंसेवकों द्वारा युवा क्रिकेटरों के लिए — और हर उस बच्चे के लिए जो इस खेल के माध्यम से अंग्रेज़ी सीखना चाहता है — तैयार और संचालित किया जाता है।',
    },
  ],
  support: 'सहायता',
  terms: 'नियम और शर्तें',
  privacy: 'गोपनीयता नीति',
  initiativeLine:
    'English for Cricket KYCO, Kansai Youth Cricket Organization, की एक शैक्षणिक पहल है।',
  rightsLine: '© 2026 Kansai Youth Cricket Organization. सर्वाधिकार सुरक्षित।',
};

const UR: LandingStrings = {
  heroTitle: 'کرکٹ کے ذریعے انگریزی سیکھیں',
  heroIntro:
    'English for Cricket کرکٹ کے کھیل پر مبنی انگریزی سیکھنے کا ایک مکمل پروگرام ہے۔ 320 باقاعدہ اسباق کے ذریعے سیکھنے والے اپنے پہلے الفاظ سے پُراعتماد اور آزادانہ گفتگو تک ترقی کرتے ہیں — سننے، بولنے، پڑھنے اور کھیل کے ذریعے۔ یہ پروگرام KYCO، Kansai Youth Cricket Organization، کی جانب سے فراہم کیا جاتا ہے اور ہر سیکھنے والے کے لیے مفت ہے۔ یہ ہمیشہ ایسا ہی رہے گا۔',
  alreadyAccount: 'کیا آپ کا پہلے سے اکاؤنٹ ہے؟ لاگ ان کریں',
  pinNote:
    'شریک اسکولوں اور کلبوں کے سیکھنے والوں کو اپنے استاد یا کوچ سے صارف نام اور PIN ملتا ہے۔ کسی ای میل پتے کی ضرورت نہیں۔',
  statLessons: 'اسباق',
  statStages: 'مراحل',
  statModules: 'ماڈیول',
  statWords: 'الفاظ',
  statFree: 'مفت، ہمیشہ',
  programmeLabel: 'پروگرام',
  programmeTitle: 'سیکھنے والے کو درکار ہر چیز',
  programmeIntro:
    'ایک ہی جگہ ایک مکمل کورس: باقاعدہ اسباق، بولنے کی مشق، رہنمائی کے ساتھ مطالعہ اور سوچی سمجھی دہرائی — ہر عنصر کرکٹ پر مبنی ہے، تاکہ ہر نیا لفظ ایسے سیاق و سباق کے ساتھ آئے جو اسے یادگار بنا دے۔',
  features: [
    {
      title: 'تعلیمی راستہ',
      text: 'پانچ مراحل اور چالیس ماڈیولز میں 320 اسباق کا ایک باقاعدہ کورس۔ ہر سبق احتیاط سے پچھلے اسباق پر استوار ہے — نئی زبان متعارف کراتے ہوئے اور پرانی زبان کو نئی صورتوں میں دہراتے ہوئے، یہاں تک کہ وہ پختہ ہو جائے۔',
    },
    {
      title: 'بولنے کی مشق',
      text: 'رہنمائی شدہ گفتگوئیں — انٹرویو اور روزمرہ کی ہلکی پھلکی بات چیت — جن میں سیکھنے والے اپنا حصہ بلند آواز سے بولتے ہیں اور ہر سطر کے لیے نمبر حاصل کرتے ہیں، جن میں کامیابی کا معیار ستر فیصد ہے۔',
    },
    {
      title: 'سمارٹ مطالعہ',
      text: "دو صورتوں میں مختصر کہانیاں: 'سنیں اور پڑھیں'، جس میں ہر لفظ بولے جانے پر نمایاں ہوتا ہے، اور 'بلند آواز سے پڑھیں'، جس میں سیکھنے والے کی اپنی تلاوت کو جملہ بہ جملہ نمبر دیے جاتے ہیں۔",
    },
    {
      title: 'حقیقی انسانی آوازیں',
      text: 'کورس کی ہر سطر کو حقیقی آواز کے فنکار کئی مختلف آوازوں میں ریکارڈ کر رہے ہیں۔ سیکھنے والے اپنی پسند کی آواز منتخب کرتے ہیں اور پورے کورس میں فطری، انسانی انگریزی سنتے ہیں۔',
    },
    {
      title: 'مشکل الفاظ کی دہرائی',
      text: 'جن الفاظ اور فقروں کو سیکھنے والا مشکل پاتا ہے، وہ خودکار طور پر جمع کیے جاتے ہیں اور دہرائی کے لیے دوبارہ پیش کیے جاتے ہیں، تاکہ کمزور نکات کی مزید مشق ہو، یہاں تک کہ ان پر مہارت حاصل ہو جائے۔',
    },
    {
      title: 'XP، ستارے اور بیجز',
      text: 'سیکھنے والے مکمل کیے گئے کام کے لیے تجربے کے پوائنٹس اور ستارے حاصل کرتے ہیں، اور نمایاں کامیابیوں کے لیے بیجز۔ کوئی جماعت اپنا ہفتہ وار اسٹار بورڈ دیکھ سکتی ہے؛ کوئی عوامی درجہ بندی نہیں ہے۔',
    },
    {
      title: 'مطالعے کے دن اور تسلسل',
      text: 'ہر سیکھنے والا ہفتے کے وہ دن منتخب کرتا ہے جن میں وہ مطالعہ کرے گا۔ صرف وہی دن سیکھنے کے تسلسل میں شمار ہوتے ہیں، اس لیے آرام کا دن اسے کبھی توڑ نہیں سکتا۔',
    },
    {
      title: 'اپنا آغاز تلاش کریں',
      text: 'ایک مختصر جائزہ اس مرحلے کی تجویز دیتا ہے جہاں سے نئے سیکھنے والے کو آغاز کرنا چاہیے۔ کچھ بھی مقفل نہیں؛ یہ تجویز بس ایک مناسب نقطۂ آغاز فراہم کرتی ہے۔',
    },
    {
      title: 'اسکولوں اور کلبوں کے لیے',
      text: 'اساتذہ اور کوچ سادہ صارف نام اور PIN لاگ ان کے ساتھ پوری جماعت کو داخل کر سکتے ہیں، ہر سیکھنے والے کے لیے لاگ ان پرچی چھاپ سکتے ہیں، اور پورے گروپ کی پیش رفت دیکھ سکتے ہیں۔',
    },
  ],
  beyondLessons:
    'اسباق کے علاوہ، کرکٹ کھیلوں، ویڈیو اسباق اور ڈاؤن لوڈ کے قابل ورک بکس کی ایک لائبریری کورس کے ساتھ ہے — جس میں ICC کا کھیل کا سرکاری تعارف بھی شامل ہے۔',
  startLabel: 'آغاز کریں',
  howTitle: 'یہ کیسے کام کرتا ہے',
  steps: [
    {
      title: 'رجسٹر کریں، یا PIN حاصل کریں',
      text: 'ای میل پتے کے ساتھ مفت اکاؤنٹ بنائیں، یا استاد یا کوچ سے صارف نام اور PIN حاصل کریں۔ دونوں راستے پروگرام تک مکمل رسائی فراہم کرتے ہیں۔',
    },
    {
      title: 'تعلیمی راستے پر چلیں',
      text: 'مراحل کو ترتیب سے، اپنی رفتار سے مکمل کریں — گھر پر، اسکول میں یا کلب میں۔ ایک مختصر جائزہ مناسب نقطۂ آغاز کی نشاندہی کر سکتا ہے۔',
    },
    {
      title: 'مشق کریں، دہرائیں اور آگے بڑھیں',
      text: 'بولنے کی مشق، رہنمائی شدہ مطالعہ اور ہدفی دہرائی ہر سبق کو مضبوط کرتی ہے، جبکہ پوائنٹس، ستارے اور بیجز پیش رفت کا واضح ریکارڈ فراہم کرتے ہیں۔',
    },
  ],
  stagesTitle: 'کورس کے پانچ مراحل',
  stages: [
    { name: 'The Foundation', note: 'پہلے الفاظ اور جملے' },
    { name: 'The Rookie', note: 'روزمرہ انگریزی، مضبوطی سے قائم' },
    { name: 'The Player', note: 'آزاد مطالعہ اور گفتگو' },
    { name: 'The Strategist', note: 'تجزیہ اور کھیل کی زبان' },
    { name: 'The Captain', note: 'اعلیٰ درجے کی گفتگو اور قیادت' },
  ],
  commitmentLabel: 'ہمارا عزم',
  commitmentTitle: 'مفت۔ محفوظ۔ ہر سیکھنے والے کے لیے۔',
  commitments: [
    {
      title: 'مستقل طور پر مفت',
      text: 'English for Cricket میں کوئی فیس نہیں اور کوئی اشتہار نہیں، اور کبھی ہوگا بھی نہیں۔ پروگرام کا ہر حصہ ہر سیکھنے والے کو یکساں شرائط پر پیش کیا جاتا ہے۔',
    },
    {
      title: 'بچوں کی حفاظت کے لیے بنایا گیا',
      text: 'کوئی عوامی پروفائل نہیں، کوئی کھلا پیغام رسانی نہیں اور کوئی بیرونی اشتہار نہیں۔ سیکھنے والے صرف اپنی جماعت کی پیش رفت دیکھتے ہیں، اور کچھ نہیں۔',
    },
    {
      title: 'محبت اور توجہ سے تیار کردہ',
      text: 'یہ پروگرام جاپان کے کانسائی میں KYCO کے رضاکاروں نے نوجوان کرکٹرز کے لیے — اور ہر اس بچے کے لیے جو اس کھیل کے ذریعے انگریزی سیکھنا چاہتا ہے — تیار کیا ہے اور اسی کی دیکھ بھال کرتے ہیں۔',
    },
  ],
  support: 'معاونت',
  terms: 'شرائط و ضوابط',
  privacy: 'رازداری کی پالیسی',
  initiativeLine:
    'English for Cricket KYCO، Kansai Youth Cricket Organization، کی ایک تعلیمی کاوش ہے۔',
  rightsLine: '© 2026 Kansai Youth Cricket Organization. جملہ حقوق محفوظ ہیں۔',
};

const PS: LandingStrings = {
  heroTitle: 'د کرکټ له لارې انګلیسي زده کړئ',
  heroIntro:
    'English for Cricket د کرکټ د لوبې پر بنسټ د انګلیسي ژبې د زده کړې یو بشپړ پروګرام دی. د ۳۲۰ منظم درسونو له لارې، زده کوونکي له خپلو لومړیو ټکو څخه تر باوري او خپلواکو اړیکو پورې پرمختګ کوي — د اورېدلو، خبرو کولو، لوستلو او لوبې له لارې. دا پروګرام د KYCO، Kansai Youth Cricket Organization، لخوا وړاندې کېږي او د هر زده کوونکي لپاره وړیا دی. دا به تل همداسې پاتې شي.',
  alreadyAccount: 'ایا تاسو دمخه حساب لرئ؟ ننوځئ',
  pinNote:
    'په ګډون کوونکو ښوونځیو او کلبونو کې زده کوونکو ته د دوی ښوونکی یا روزونکی یو کارن نوم او PIN ورکوي. برېښنالیک ته اړتیا نشته.',
  statLessons: 'درسونه',
  statStages: 'مرحلې',
  statModules: 'ماډلونه',
  statWords: 'ټکي',
  statFree: 'وړیا، تل',
  programmeLabel: 'پروګرام',
  programmeTitle: 'هر څه چې یو زده کوونکی ورته اړتیا لري',
  programmeIntro:
    'په یو ځای کې یو بشپړ کورس: منظم درسونه، د خبرو کولو تمرین، لارښود لوستل او په غور بیاکتنه — هر عنصر د کرکټ پر بنسټ جوړ شوی، ترڅو هر نوی ټکی په داسې شرایطو کې راشي چې هغه د یادولو وړ کړي.',
  features: [
    {
      title: 'د زده کړې لاره',
      text: 'یو منظم کورس چې ۳۲۰ درسونه په پنځو مرحلو او څلویښتو ماډلونو کې لري. هر درس په دقت سره پر پخوانیو درسونو جوړېږي، نوې ژبه معرفي کوي او پخوانۍ ژبه په نویو بڼو کې تکراروي تر هغه چې ټینګه شي.',
    },
    {
      title: 'د خبرو کولو تمرین',
      text: 'لارښود خبرې اترې — مرکې او ورځني کوچني خبرې — په کومو کې چې زده کوونکي خپله برخه په لوړ غږ وايي او د هرې کرښې لپاره نمرې ترلاسه کوي، چې د بریالیتوب حد یې اویا سلنه دی.',
    },
    {
      title: 'سمارټ لوستل',
      text: "لنډې کیسې په دوو بڼو کې: 'واورئ او ولولئ'، په کوم کې چې هر ټکی د ویلو پر مهال روښانه کېږي، او 'په لوړ غږ ولولئ'، په کوم کې چې د زده کوونکي خپل لوستل جمله په جمله نمرې ورکول کېږي.",
    },
    {
      title: 'اصلي انساني غږونه',
      text: 'د کورس هره کرښه د اصلي غږ هنرمندانو لخوا په څو مختلفو غږونو کې ثبتېږي. زده کوونکي هغه غږ غوره کوي چې غواړي یې واوري، او په ټول کورس کې طبیعي، انساني انګلیسي اوري.',
    },
    {
      title: 'د ستونزمنو ټکو بیاکتنه',
      text: 'هغه ټکي او عبارتونه چې زده کوونکي ته ستونزمن وي، په اتومات ډول راټولېږي او د بیاکتنې لپاره بیا وړاندې کېږي، ترڅو کمزوري ټکي نور تمرین ترلاسه کړي تر هغه چې مهارت پرې حاصل شي.',
    },
    {
      title: 'XP، ستوري او بیجونه',
      text: 'زده کوونکي د بشپړ شوي کار لپاره د تجربې نمرې او ستوري ترلاسه کوي، او د مهمو لاسته راوړنو لپاره بیجونه. یو ټولګی کولی شي خپل اوونیز ستوري بورډ تعقیب کړي؛ عامه درجه بندي نشته.',
    },
    {
      title: 'د مطالعې ورځې او تسلسل',
      text: 'هر زده کوونکی د اونۍ هغه ورځې ټاکي چې په کې به زده کړه کوي. یوازې هغه ورځې د زده کړې په تسلسل کې شمېرل کېږي، نو د استراحت ورځ هیڅکله هغه نه شي ماتولی.',
    },
    {
      title: 'خپل پیل ومومئ',
      text: 'یوه لنډه د کچې ارزونه هغه مرحله وړاندیز کوي چې نوی زده کوونکی باید ورڅخه پیل وکړي. هیڅ شی بند نه دی؛ وړاندیز یوازې یو مناسب پیل ټکی چمتو کوي.',
    },
    {
      title: 'د ښوونځیو او کلبونو لپاره',
      text: 'ښوونکي او روزونکي کولی شي ټول ټولګی د ساده کارن نوم او PIN ننوتلو سره شامل کړي، د هر زده کوونکي لپاره د ننوتلو پاڼه چاپ کړي، او د ټولې ډلې پرمختګ تعقیب کړي.',
    },
  ],
  beyondLessons:
    'له درسونو سربېره، د کرکټ لوبو، ویډیو درسونو او د ډاونلوډ وړ کاري کتابونو یو کتابتون له کورس سره مل دی — په کې د ICC رسمي پېژندنه هم شامله ده.',
  startLabel: 'پیل وکړئ',
  howTitle: 'دا څنګه کار کوي',
  steps: [
    {
      title: 'راجسټر شئ، یا PIN ترلاسه کړئ',
      text: 'د برېښنالیک پتې سره وړیا حساب جوړ کړئ، یا له ښوونکي یا روزونکي څخه کارن نوم او PIN ترلاسه کړئ. دواړه لارې پروګرام ته بشپړ لاسرسی چمتو کوي.',
    },
    {
      title: 'د زده کړې لاره تعقیب کړئ',
      text: 'مرحلې په ترتیب سره، په خپل سرعت سره بشپړې کړئ — په کور، ښوونځي یا کلب کې. یوه لنډه ارزونه کولی شي مناسب پیل ټکی وپیژني.',
    },
    {
      title: 'تمرین وکړئ، بیاکتنه وکړئ او پرمختګ وکړئ',
      text: 'د خبرو کولو تمرین، لارښود لوستل او هدف لرونکې بیاکتنه هر درس پیاوړی کوي، پداسې حال کې چې نمرې، ستوري او بیجونه د پرمختګ روښانه ریکارډ چمتو کوي.',
    },
  ],
  stagesTitle: 'د کورس پنځه مرحلې',
  stages: [
    { name: 'The Foundation', note: 'لومړي ټکي او جملې' },
    { name: 'The Rookie', note: 'ورځنۍ انګلیسي، په ټینګه سره جوړه شوې' },
    { name: 'The Player', note: 'خپلواک لوستل او خبرې اترې' },
    { name: 'The Strategist', note: 'شننه او د لوبې ژبه' },
    { name: 'The Captain', note: 'پرمختللې اړیکې او مشرتابه' },
  ],
  commitmentLabel: 'زموږ ژمنه',
  commitmentTitle: 'وړیا. خوندي. د هر زده کوونکي لپاره.',
  commitments: [
    {
      title: 'په دایمي توګه وړیا',
      text: 'English for Cricket هیڅ فیس او هیڅ اعلان نه لري، او هیڅکله به یې ونه لري. د پروګرام هره برخه هر زده کوونکي ته په مساوي شرایطو وړاندې کېږي.',
    },
    {
      title: 'د ماشومانو د خوندیتوب لپاره جوړ شوی',
      text: 'عامه پروفایلونه نشته، خلاص پیغام رسونه نشته او بهرني اعلانونه نشته. زده کوونکي یوازې د خپل ټولګي پرمختګ ګوري، او نور هیڅ نه.',
    },
    {
      title: 'په پاملرنې سره چمتو شوی',
      text: 'دا پروګرام په جاپان، کانسای کې د KYCO د رضاکارانو لخوا د ځوانو کرکټرانو لپاره — او د هر هغه ماشوم لپاره چې غواړي د دې لوبې له لارې انګلیسي زده کړي — ډیزاین او ساتل کېږي.',
    },
  ],
  support: 'ملاتړ',
  terms: 'شرایط او ضوابط',
  privacy: 'د محرمیت پالیسي',
  initiativeLine: 'English for Cricket د KYCO، Kansai Youth Cricket Organization، یو تعلیمي نوښت دی.',
  rightsLine: '© 2026 Kansai Youth Cricket Organization. ټول حقوق خوندي دي.',
};

const SW: LandingStrings = {
  heroTitle: 'Jifunze Kiingereza Kupitia Kriketi',
  heroIntro:
    'English for Cricket ni programu kamili ya kujifunza Kiingereza iliyojengwa juu ya mchezo wa kriketi. Kupitia masomo 320 yaliyopangwa kwa utaratibu, wanafunzi huendelea kutoka maneno yao ya kwanza hadi mawasiliano ya kujiamini na ya kujitegemea — kupitia kusikiliza, kuzungumza, kusoma na kucheza. Programu hii hutolewa na KYCO, Kansai Youth Cricket Organization, na ni bure kwa kila mwanafunzi. Na itabaki hivyo daima.',
  alreadyAccount: 'Tayari una akaunti? Ingia',
  pinNote:
    'Wanafunzi katika shule na vilabu vinavyoshiriki hupokea jina la mtumiaji na PIN kutoka kwa mwalimu au kocha wao. Hakuna anwani ya barua pepe inayohitajika.',
  statLessons: 'Masomo',
  statStages: 'Hatua',
  statModules: 'Moduli',
  statWords: 'Maneno',
  statFree: 'Bure, daima',
  programmeLabel: 'Programu',
  programmeTitle: 'Kila Kitu Anachohitaji Mwanafunzi',
  programmeIntro:
    'Kozi kamili mahali pamoja: masomo yaliyopangwa, mazoezi ya kuzungumza, usomaji unaoongozwa na marudio yenye kufikiriwa — kila kipengele kimejengwa juu ya kriketi, ili kila neno jipya lifike na muktadha unaolifanya likumbukwe.',
  features: [
    {
      title: 'Njia ya Kujifunza',
      text: 'Kozi iliyopangwa ya masomo 320 katika hatua tano na moduli arobaini. Kila somo hujengwa kwa uangalifu juu ya yaliyotangulia, likileta lugha mpya na kurudia lugha ya awali katika maumbo mapya hadi iimarike.',
    },
    {
      title: 'Mazoezi ya Kuzungumza',
      text: 'Mazungumzo yanayoongozwa — mahojiano na mazungumzo ya kila siku — ambamo wanafunzi huzungumza sehemu yao kwa sauti na kupokea alama kwa kila mstari, huku alama ya kufaulu ikiwa asilimia sabini.',
    },
    {
      title: 'Usomaji Mahiri',
      text: 'Hadithi fupi katika maumbo mawili: Sikiliza na Usome, ambamo kila neno huangaziwa linapotamkwa, na Soma kwa Sauti, ambamo usomaji wa mwanafunzi mwenyewe hupewa alama sentensi kwa sentensi.',
    },
    {
      title: 'Sauti Halisi za Binadamu',
      text: 'Kila mstari wa kozi unarekodiwa na wasanii halisi wa sauti, kwa sauti kadhaa tofauti. Wanafunzi huchagua sauti wanayotaka kusikia, na husikiliza Kiingereza cha asili cha kibinadamu katika kozi yote.',
    },
    {
      title: 'Marudio ya Maneno Magumu',
      text: 'Maneno na vifungu ambavyo mwanafunzi huona kuwa vigumu hukusanywa kiotomatiki na kuwasilishwa tena kwa marudio, ili sehemu dhaifu zipate mazoezi zaidi hadi zimahiriwe.',
    },
    {
      title: 'XP, Nyota na Beji',
      text: 'Wanafunzi hupata pointi za uzoefu na nyota kwa kazi iliyokamilika, na beji kwa mafanikio makubwa. Darasa linaweza kufuata ubao wake wa nyota wa kila wiki; hakuna orodha za hadharani za viwango.',
    },
    {
      title: 'Siku za Kusoma na Mfululizo',
      text: 'Kila mwanafunzi huchagua siku za juma ambazo atasoma. Ni siku hizo tu zinazohesabiwa katika mfululizo wa kujifunza, hivyo siku ya kupumzika haiwezi kuuvunja kamwe.',
    },
    {
      title: 'Tafuta Mwanzo Wako',
      text: 'Tathmini fupi ya kiwango hupendekeza hatua ambayo mwanafunzi mpya anapaswa kuanzia. Hakuna kilichofungwa; pendekezo hutoa tu mahali pazuri pa kuanzia.',
    },
    {
      title: 'Kwa Shule na Vilabu',
      text: 'Walimu na makocha wanaweza kuandikisha darasa zima kwa kuingia kwa jina la mtumiaji na PIN rahisi, kuchapisha karatasi ya kuingia kwa kila mwanafunzi, na kufuatilia maendeleo ya kikundi kizima.',
    },
  ],
  beyondLessons:
    'Zaidi ya masomo, maktaba ya michezo ya kriketi, masomo ya video na vitabu vya mazoezi vinavyoweza kupakuliwa huandamana na kozi — ikiwa ni pamoja na utangulizi rasmi wa ICC kuhusu mchezo huu.',
  startLabel: 'Kuanza',
  howTitle: 'Jinsi Inavyofanya Kazi',
  steps: [
    {
      title: 'Jisajili, au pokea PIN',
      text: 'Fungua akaunti ya bure kwa anwani ya barua pepe, au pokea jina la mtumiaji na PIN kutoka kwa mwalimu au kocha. Njia zote mbili hutoa ufikiaji kamili wa programu.',
    },
    {
      title: 'Fuata Njia ya Kujifunza',
      text: 'Pitia hatua kwa mpangilio, kwa kasi yako mwenyewe — nyumbani, shuleni au klabuni. Tathmini fupi ya kiwango inaweza kubainisha mahali sahihi pa kuanzia.',
    },
    {
      title: 'Fanya mazoezi, rudia na uendelee',
      text: 'Mazoezi ya kuzungumza, usomaji unaoongozwa na marudio yaliyolengwa huimarisha kila somo, huku pointi, nyota na beji zikitoa rekodi wazi ya maendeleo.',
    },
  ],
  stagesTitle: 'Hatua tano za kozi',
  stages: [
    { name: 'The Foundation', note: 'Maneno na sentensi za kwanza' },
    { name: 'The Rookie', note: 'Kiingereza cha kila siku, kilichowekwa imara' },
    { name: 'The Player', note: 'Kusoma na kuzungumza kwa kujitegemea' },
    { name: 'The Strategist', note: 'Uchambuzi na lugha ya mchezo' },
    { name: 'The Captain', note: 'Mawasiliano ya juu na uongozi' },
  ],
  commitmentLabel: 'Ahadi Yetu',
  commitmentTitle: 'Bure. Salama. Kwa Kila Mwanafunzi.',
  commitments: [
    {
      title: 'Bure, kwa kudumu',
      text: 'English for Cricket haina ada wala matangazo, na haitakuwa nayo kamwe. Kila sehemu ya programu hutolewa kwa kila mwanafunzi kwa masharti sawa.',
    },
    {
      title: 'Imeundwa kwa usalama wa watoto',
      text: 'Hakuna wasifu wa hadharani, hakuna ujumbe wa wazi na hakuna matangazo ya nje. Wanafunzi huona maendeleo ya darasa lao tu, na hakuna zaidi.',
    },
    {
      title: 'Imeandaliwa kwa uangalifu',
      text: 'Programu hii imeundwa na kudumishwa na wajitoleaji wa KYCO huko Kansai, Japan, kwa ajili ya wachezaji wadogo wa kriketi — na kwa kila mtoto ambaye angependa kujifunza Kiingereza kupitia mchezo huu.',
    },
  ],
  support: 'Msaada',
  terms: 'Sheria na Masharti',
  privacy: 'Sera ya Faragha',
  initiativeLine:
    'English for Cricket ni mpango wa elimu wa KYCO, Kansai Youth Cricket Organization.',
  rightsLine: '© 2026 Kansai Youth Cricket Organization. Haki zote zimehifadhiwa.',
};

const DE: LandingStrings = {
  heroTitle: 'Englisch lernen durch Cricket',
  heroIntro:
    'English for Cricket ist ein vollständiges Englisch-Lernprogramm rund um den Cricketsport. In 320 strukturierten Lektionen entwickeln sich die Lernenden von ihren ersten Wörtern bis hin zu sicherer, selbstständiger Kommunikation — durch Hören, Sprechen, Lesen und Spielen. Das Programm wird von KYCO, der Kansai Youth Cricket Organization, bereitgestellt und ist für jeden Lernenden kostenlos. Und das wird immer so bleiben.',
  alreadyAccount: 'Haben Sie bereits ein Konto? Anmelden',
  pinNote:
    'Lernende an teilnehmenden Schulen und Vereinen erhalten von ihrer Lehrkraft oder ihrem Trainer einen Benutzernamen und eine PIN. Eine E-Mail-Adresse ist nicht erforderlich.',
  statLessons: 'Lektionen',
  statStages: 'Stufen',
  statModules: 'Module',
  statWords: 'Wörter',
  statFree: 'kostenlos, für immer',
  programmeLabel: 'Das Programm',
  programmeTitle: 'Alles, was ein Lernender braucht',
  programmeIntro:
    'Ein vollständiger Kurs an einem Ort: strukturierte Lektionen, Sprechtraining, angeleitetes Lesen und durchdachte Wiederholung — jedes Element ist rund um Cricket aufgebaut, sodass jedes neue Wort in einem Zusammenhang erscheint, der es einprägsam macht.',
  features: [
    {
      title: 'Der Lernpfad',
      text: 'Ein strukturierter Kurs mit 320 Lektionen in fünf Stufen und vierzig Modulen. Jede Lektion baut sorgfältig auf den vorherigen auf, führt neue Sprache ein und greift frühere Sprache in neuen Formen wieder auf, bis sie sicher sitzt.',
    },
    {
      title: 'Sprechtraining',
      text: 'Geführte Gespräche — Interviews und alltäglicher Small Talk —, in denen die Lernenden ihren Teil laut sprechen und für jede Zeile eine Bewertung erhalten; die Bestehensgrenze liegt bei siebzig Prozent.',
    },
    {
      title: 'Intelligentes Lesen',
      text: 'Kurzgeschichten in zwei Formen: „Zuhören und Mitlesen", bei der jedes Wort hervorgehoben wird, während es gesprochen wird, und „Laut Vorlesen", bei der das eigene Vorlesen des Lernenden Satz für Satz bewertet wird.',
    },
    {
      title: 'Echte menschliche Stimmen',
      text: 'Jede Zeile des Kurses wird von echten Sprechern in mehreren unterschiedlichen Stimmen aufgenommen. Die Lernenden wählen die Stimme, die sie hören möchten, und hören durchgehend natürliches, menschliches Englisch.',
    },
    {
      title: 'Wiederholung schwieriger Wörter',
      text: 'Wörter und Wendungen, die ein Lernender schwierig findet, werden automatisch gesammelt und erneut zur Wiederholung vorgelegt, sodass schwächere Stellen weiter geübt werden, bis sie beherrscht werden.',
    },
    {
      title: 'XP, Sterne und Abzeichen',
      text: 'Lernende erhalten Erfahrungspunkte und Sterne für abgeschlossene Arbeit sowie Abzeichen für bedeutende Leistungen. Eine Klasse kann ihre eigene wöchentliche Sternentafel verfolgen; es gibt keine öffentlichen Ranglisten.',
    },
    {
      title: 'Lerntage und Serien',
      text: 'Jeder Lernende wählt die Wochentage, an denen er lernen wird. Nur diese Tage zählen für die Lernserie, sodass ein Ruhetag sie niemals unterbrechen kann.',
    },
    {
      title: 'Finden Sie Ihren Anfang',
      text: 'Ein kurzer Einstufungstest empfiehlt die Stufe, mit der ein neuer Lernender beginnen sollte. Nichts ist gesperrt; die Empfehlung bietet lediglich einen sinnvollen Ausgangspunkt.',
    },
    {
      title: 'Für Schulen und Vereine',
      text: 'Lehrkräfte und Trainer können eine ganze Klasse mit einfachen Logins aus Benutzername und PIN anmelden, für jeden Lernenden einen Login-Zettel ausdrucken und den Fortschritt der gesamten Gruppe verfolgen.',
    },
  ],
  beyondLessons:
    'Über die Lektionen hinaus begleitet eine Bibliothek mit Cricketspielen, Videolektionen und herunterladbaren Arbeitsheften den Kurs — einschließlich der offiziellen Einführung der ICC in das Spiel.',
  startLabel: 'Erste Schritte',
  howTitle: 'So funktioniert es',
  steps: [
    {
      title: 'Registrieren oder eine PIN erhalten',
      text: 'Erstellen Sie ein kostenloses Konto mit einer E-Mail-Adresse oder erhalten Sie einen Benutzernamen und eine PIN von einer Lehrkraft oder einem Trainer. Beide Wege bieten vollen Zugang zum Programm.',
    },
    {
      title: 'Folgen Sie dem Lernpfad',
      text: 'Arbeiten Sie die Stufen der Reihe nach durch, in Ihrem eigenen Tempo — zu Hause, in der Schule oder im Verein. Ein kurzer Einstufungstest kann den geeigneten Ausgangspunkt ermitteln.',
    },
    {
      title: 'Üben, wiederholen und Fortschritte machen',
      text: 'Sprechtraining, angeleitetes Lesen und gezielte Wiederholung festigen jede Lektion, während Punkte, Sterne und Abzeichen den Fortschritt klar dokumentieren.',
    },
  ],
  stagesTitle: 'Die fünf Stufen des Kurses',
  stages: [
    { name: 'The Foundation', note: 'Erste Wörter und Sätze' },
    { name: 'The Rookie', note: 'Alltagsenglisch, sicher verankert' },
    { name: 'The Player', note: 'Selbstständiges Lesen und Gespräche' },
    { name: 'The Strategist', note: 'Analyse und die Sprache des Spiels' },
    { name: 'The Captain', note: 'Fortgeschrittene Kommunikation und Führung' },
  ],
  commitmentLabel: 'Unser Versprechen',
  commitmentTitle: 'Kostenlos. Sicher. Für jeden Lernenden.',
  commitments: [
    {
      title: 'Dauerhaft kostenlos',
      text: 'English for Cricket erhebt keine Gebühren und enthält keine Werbung, und das wird immer so bleiben. Jeder Teil des Programms wird jedem Lernenden zu gleichen Bedingungen angeboten.',
    },
    {
      title: 'Entwickelt für die Sicherheit von Kindern',
      text: 'Es gibt keine öffentlichen Profile, keine offenen Nachrichten und keine externe Werbung. Lernende sehen nur den Fortschritt ihrer eigenen Klasse, und nichts darüber hinaus.',
    },
    {
      title: 'Mit Sorgfalt erstellt',
      text: 'Das Programm wird von den Freiwilligen von KYCO in Kansai, Japan, gestaltet und gepflegt — für junge Cricketspieler und für jedes Kind, das durch dieses Spiel Englisch lernen möchte.',
    },
  ],
  support: 'Hilfe',
  terms: 'Allgemeine Geschäftsbedingungen',
  privacy: 'Datenschutzerklärung',
  initiativeLine:
    'English for Cricket ist eine Bildungsinitiative von KYCO, der Kansai Youth Cricket Organization.',
  rightsLine: '© 2026 Kansai Youth Cricket Organization. Alle Rechte vorbehalten.',
};

const ZU: LandingStrings = {
  heroTitle: 'Funda isiNgisi Ngekhilikithi',
  heroIntro:
    'English for Cricket wuhlelo oluphelele lokufunda isiNgisi olwakhelwe phezu komdlalo wekhilikithi. Ngemifundo ehleliwe engama-320, abafundi bathuthuka besuka emagameni abo okuqala baye ekukhulumeni ngokuzethemba nangokuzimela — ngokulalela, ukukhuluma, ukufunda nangokudlala. Lolu hlelo luhlinzekwa yi-KYCO, i-Kansai Youth Cricket Organization, futhi lumahhala kuwo wonke umfundi. Futhi luyohlala lunjalokazi.',
  alreadyAccount: 'Usuvele unayo i-akhawunti? Ngena',
  pinNote:
    'Abafundi ezikoleni nasemakilabheni abamba iqhaza bathola igama lomsebenzisi ne-PIN kuthisha noma kumqeqeshi wabo. Ayikho i-imeyili edingekayo.',
  statLessons: 'Izifundo',
  statStages: 'Izigaba',
  statModules: 'Amamojuli',
  statWords: 'Amagama',
  statFree: 'Mahhala, njalo',
  programmeLabel: 'Uhlelo',
  programmeTitle: 'Konke Okudingwa Umfundi',
  programmeIntro:
    'Isifundo esiphelele endaweni eyodwa: izifundo ezihleliwe, ukuzilolonga ukukhuluma, ukufunda okuqondiswayo nokubuyekeza okucatshangwe kahle — yonke into yakhelwe phezu kwekhilikithi, ukuze igama ngalinye elisha lifike nomongo olenza likhumbuleke.',
  features: [
    {
      title: 'Indlela Yokufunda',
      text: 'Isifundo esihleliwe sezifundo ezingama-320 ezigabeni ezinhlanu nasemamojulini angamashumi amane. Isifundo ngasinye sakhela ngokucophelela phezu kwalezo ezingaphambi kwaso, sethula ulimi olusha futhi sibuyela olimini lwangaphambilini ngezindlela ezintsha ize luvikeleke.',
    },
    {
      title: 'Ukuzilolonga Ukukhuluma',
      text: 'Izingxoxo eziqondiswayo — izingxoxiswano nengxoxo nje yansuku zonke — lapho abafundi bekhuluma ingxenye yabo ngokuzwakalayo futhi bathola amaphuzu omugqa ngamunye, lapho ukuphumelela kungamaphesenti angamashumi ayisikhombisa.',
    },
    {
      title: 'Ukufunda Okuhlakaniphile',
      text: 'Izindaba ezimfushane ngezindlela ezimbili: Lalela Futhi Funda, lapho igama ngalinye ligqanyiswa njengoba likhulunywa, kanye noFunda Ngokuzwakalayo, lapho ukufunda komfundi uqobo kuthola amaphuzu isigwebo ngesigwebo.',
    },
    {
      title: 'Amazwi Angempela Abantu',
      text: 'Yonke imigqa yesifundo irekhodwa ngabaculi bangempela bamazwi, ngamazwi amaningi ahlukene. Abafundi bakhetha izwi abafisa ukulizwa, futhi balalela isiNgisi esingokwemvelo, esabantu kuso sonke isifundo.',
    },
    {
      title: 'Ukubuyekezwa Kwamagama Anzima',
      text: 'Amagama nemishwana umfundi ayithola inzima iqoqwa ngokuzenzekela futhi yethulwa futhi ukuze ibuyekezwe, ukuze amaphuzu abuthaka athole ukuzilolonga okwengeziwe aze anqotshwe.',
    },
    {
      title: 'Ama-XP, Izinkanyezi Namabheji',
      text: 'Abafundi bathola amaphuzu olwazi nezinkanyezi ngomsebenzi oqediwe, namabheji ngezinto ezinkulu abazifinyelele. Ikilasi lingalandela ibhodi yalo yezinkanyezi yamasonto onke; ayikho imigqa yasesidlangalaleni.',
    },
    {
      title: 'Izinsuku Zokufunda Nokulandelana',
      text: 'Umfundi ngamunye ukhetha izinsuku zesonto azofunda ngazo. Yilezo zinsuku kuphela ezibalwa ekulandeleni kokufunda, ngakho usuku lokuphumula alusoze lukuqamule.',
    },
    {
      title: 'Thola Isiqalo Sakho',
      text: 'Ukuhlola okufushane kwezinga kuncoma isigaba lapho umfundi omusha kufanele aqale khona. Ayikho into evaliwe; isincomo simane sihlinzeke indawo yokuqala enengqondo.',
    },
    {
      title: 'Ezikole Namaqembu',
      text: 'Othisha nabaqeqeshi bangabhalisa ikilasi lonke ngokungena okulula ngegama lomsebenzisi ne-PIN, baphrinthe isiliphu sokungena somfundi ngamunye, futhi balandele inqubekela phambili yeqembu lonke.',
    },
  ],
  beyondLessons:
    'Ngaphezu kwezifundo, umtapo wemidlalo yekhilikithi, izifundo zevidiyo nezincwadi zomsebenzi ezilandekayo uhamba nesifundo — kuhlanganisa nesingeniso esisemthethweni se-ICC somdlalo.',
  startLabel: 'Ukuqala',
  howTitle: 'Kusebenza Kanjani',
  steps: [
    {
      title: 'Bhalisa, noma thola i-PIN',
      text: 'Dala i-akhawunti yamahhala ngekheli le-imeyili, noma thola igama lomsebenzisi ne-PIN kuthisha noma kumqeqeshi. Zombili lezi zindlela zihlinzeka ukufinyelela okugcwele ohlelweni.',
    },
    {
      title: 'Landela Indlela Yokufunda',
      text: 'Sebenza izigaba ngokulandelana, ngesivinini sakho — ekhaya, esikoleni noma ekilabheni. Ukuhlola okufushane kwezinga kungakhomba indawo yokuqala efanele.',
    },
    {
      title: 'Zilolonge, buyekeza futhi uthuthuke',
      text: 'Ukuzilolonga ukukhuluma, ukufunda okuqondiswayo nokubuyekeza okuhlosiwe kuqinisa sonke isifundo, kuyilapho amaphuzu, izinkanyezi namabheji kuhlinzeka irekhodi elicacile lenqubekela phambili.',
    },
  ],
  stagesTitle: 'Izigaba ezinhlanu zesifundo',
  stages: [
    { name: 'The Foundation', note: 'Amagama nemisho yokuqala' },
    { name: 'The Rookie', note: 'IsiNgisi sansuku zonke, sisungulwe ngokuvikeleka' },
    { name: 'The Player', note: 'Ukufunda nokuxoxa ngokuzimela' },
    { name: 'The Strategist', note: 'Ukuhlaziya nolimi lomdlalo' },
    { name: 'The Captain', note: 'Ukuxhumana okuthuthukile nobuholi' },
  ],
  commitmentLabel: 'Isithembiso Sethu',
  commitmentTitle: 'Mahhala. Kuphephile. Kuwo Wonke Umfundi.',
  commitments: [
    {
      title: 'Mahhala ngokuphelele, unomphela',
      text: 'English for Cricket ayinayo imali ekhokhwayo futhi ayinazo izikhangiso, futhi ayisoze ibe nazo. Yonke ingxenye yohlelo inikelwa kuwo wonke umfundi ngemibandela elinganayo.',
    },
    {
      title: 'Yakhelwe ukuphepha kwezingane',
      text: 'Ayikho imiprofayili yasesidlangalaleni, ayikho imiyalezo evulekile futhi ayikho izikhangiso zangaphandle. Abafundi babona inqubekela phambili yekilasi labo kuphela, futhi akukho okunye.',
    },
    {
      title: 'Ilungiswe ngokucophelela',
      text: 'Lolu hlelo luklanywe futhi lugcinwa ngamavolontiya e-KYCO eKansai, eJapan, olwenzelwe abadlali bekhilikithi abasha — kanye nayo yonke ingane engathanda ukufunda isiNgisi ngalo mdlalo.',
    },
  ],
  support: 'Support',
  terms: 'Terms & Conditions',
  privacy: 'Privacy Policy',
  initiativeLine: 'English for Cricket wuhlelo lwezemfundo lwe-KYCO, i-Kansai Youth Cricket Organization.',
  rightsLine: '© 2026 Kansai Youth Cricket Organization. Wonke amalungelo agodliwe.',
};

export const LANDING_STRINGS: Record<LandingLocale, LandingStrings> = {
  en: EN,
  ja: JA,
  hi: HI,
  ur: UR,
  ps: PS,
  sw: SW,
  de: DE,
  zu: ZU,
};
