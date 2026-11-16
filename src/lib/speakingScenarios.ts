// Built-in speaking scenarios for the standalone Speaking Practice
// area: short role-play conversations (interviews and small talk)
// where the app plays the other person and the learner speaks their
// own lines, checked with the same word-by-word scoring as lessons.
//
// Content lives in code for now (a starter library that works with
// no database content); if Shastri later wants to author his own
// scenarios in the admin panel, this shape maps directly onto a
// table + manager screen.

export interface ScenarioTurn {
  speaker: 'other' | 'learner';
  text: string;
}

export interface SpeakingScenario {
  id: string;
  title: string;
  category: 'Interview' | 'Small Talk';
  emoji: string;
  description: string;
  /** Who the app plays: Reporter, Coach, Teammate… */
  otherName: string;
  turns: ScenarioTurn[];
  /** "Belongs to" lesson tag (migration 17), when the admin set one. */
  lessonId?: string | null;
}

export const SPEAKING_SCENARIOS: SpeakingScenario[] = [
  {
    id: 'post-match-interview',
    title: 'Post-Match Interview',
    category: 'Interview',
    emoji: '🎙️',
    description: 'A reporter interviews you after a great game.',
    otherName: 'Reporter',
    turns: [
      { speaker: 'other', text: 'Great game today! How do you feel?' },
      { speaker: 'learner', text: 'I feel very happy. It was a great match.' },
      { speaker: 'other', text: 'You hit two boundaries. Which shot was your favourite?' },
      { speaker: 'learner', text: 'My favourite shot was the cover drive for four.' },
      { speaker: 'other', text: 'What did your coach tell you before the match?' },
      { speaker: 'learner', text: 'He told me to watch the ball and play my shots.' },
      { speaker: 'other', text: 'One last question. What is your dream?' },
      { speaker: 'learner', text: 'My dream is to play for my country one day.' },
      { speaker: 'other', text: 'Thank you, and good luck in the next match!' },
      { speaker: 'learner', text: 'Thank you very much!' },
    ],
  },
  {
    id: 'meet-the-captain',
    title: 'Meet the Young Captain',
    category: 'Interview',
    emoji: '🏆',
    description: 'Answer questions about your team like a real captain.',
    otherName: 'Reporter',
    turns: [
      { speaker: 'other', text: 'Hello! Please tell us about your team.' },
      { speaker: 'learner', text: 'I am the captain of our school team.' },
      { speaker: 'other', text: 'When do you practise together?' },
      { speaker: 'learner', text: 'We practise every Sunday morning.' },
      { speaker: 'other', text: 'Why do you like cricket?' },
      { speaker: 'learner', text: 'Cricket teaches us teamwork and English.' },
      { speaker: 'other', text: 'When is your next match?' },
      { speaker: 'learner', text: 'Our next match is on Saturday afternoon.' },
    ],
  },
  {
    id: 'player-of-the-match',
    title: 'Player of the Match',
    category: 'Interview',
    emoji: '⭐',
    description: 'You took three wickets! Talk about your bowling.',
    otherName: 'Reporter',
    turns: [
      { speaker: 'other', text: 'Congratulations! You are the player of the match.' },
      { speaker: 'learner', text: 'Thank you! I took three wickets today.' },
      { speaker: 'other', text: 'The pitch looked slow. How did you bowl?' },
      { speaker: 'learner', text: 'I bowled line and length, and I stayed patient.' },
      { speaker: 'other', text: 'Who do you want to thank?' },
      { speaker: 'learner', text: 'I want to thank my team and my coach.' },
      { speaker: 'other', text: 'Well played today!' },
      { speaker: 'learner', text: 'Thank you. See you at the next match!' },
    ],
  },
  {
    id: 'first-day-at-practice',
    title: 'First Day at Practice',
    category: 'Small Talk',
    emoji: '👋',
    description: 'Make a new friend at your first cricket practice.',
    otherName: 'Teammate',
    turns: [
      { speaker: 'other', text: 'Hi there! Are you new here?' },
      { speaker: 'learner', text: 'Yes, today is my first day. I am very excited.' },
      { speaker: 'other', text: 'Welcome to the team! Do you like batting or bowling?' },
      { speaker: 'learner', text: 'I like batting. And you?' },
      { speaker: 'other', text: 'I like bowling. Let us practise together!' },
      { speaker: 'learner', text: 'That sounds great. Thank you!' },
      { speaker: 'other', text: 'See you next Sunday, then.' },
      { speaker: 'learner', text: 'See you next Sunday!' },
    ],
  },
  {
    id: 'at-the-cricket-shop',
    title: 'At the Cricket Shop',
    category: 'Small Talk',
    emoji: '🛍️',
    description: 'Buy your first cricket bat in English.',
    otherName: 'Shopkeeper',
    turns: [
      { speaker: 'other', text: 'Hello! Can I help you?' },
      { speaker: 'learner', text: 'Yes, please. I am looking for a cricket bat.' },
      { speaker: 'other', text: 'Of course. What size do you need?' },
      { speaker: 'learner', text: 'Size five, please. How much is it?' },
      { speaker: 'other', text: 'This one is three thousand yen.' },
      { speaker: 'learner', text: 'I will take it. Thank you very much!' },
    ],
  },
  {
    id: 'making-plans',
    title: 'Making Plans with a Friend',
    category: 'Small Talk',
    emoji: '📞',
    description: 'Arrange a Sunday cricket game on the phone.',
    otherName: 'Friend',
    turns: [
      { speaker: 'other', text: 'Hello! Are you free on Sunday?' },
      { speaker: 'learner', text: 'Yes, I am free in the morning.' },
      { speaker: 'other', text: 'Let us play cricket in the park.' },
      { speaker: 'learner', text: 'Great idea! I will bring my bat and ball.' },
      { speaker: 'other', text: 'Perfect. See you at ten o\'clock.' },
      { speaker: 'learner', text: 'See you then. Goodbye!' },
    ],
  },
  {
    id: 'talking-with-coach',
    title: 'Talking with Your Coach',
    category: 'Small Talk',
    emoji: '🧢',
    description: 'A quick chat with your coach after practice.',
    otherName: 'Coach',
    turns: [
      { speaker: 'other', text: 'Good morning! How is your batting this week?' },
      { speaker: 'learner', text: 'It is getting better, Coach.' },
      { speaker: 'other', text: 'Good. Remember, always watch the ball carefully.' },
      { speaker: 'learner', text: 'Yes, Coach. I will practise every day.' },
      { speaker: 'other', text: 'That is the spirit. Keep working hard!' },
      { speaker: 'learner', text: 'Thank you, Coach. See you on Sunday!' },
    ],
  },
];

export function learnerLineCount(scenario: SpeakingScenario): number {
  return scenario.turns.filter((t) => t.speaker === 'learner').length;
}
