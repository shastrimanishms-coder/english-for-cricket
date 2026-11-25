// English master texts for the six "How to use" help popups
// (Round 78). These mirror the English rows seeded into
// page_translations by migration 32 and are used as the on-device
// fallback until that table answers; the database rows - editable
// in the admin dashboard, in all eight languages - win whenever
// they exist.

export interface HelpText {
  title: string;
  body: string;
}

export const HELP_TEXTS_EN: Record<string, HelpText> = {
  "help-learning-path": {
    "title": "How to use the Learning Path",
    "body": "## How to use\n- Start at the stage that is open for you. Your next unfinished lesson opens by itself — just tap it to begin.\n- Inside a lesson, listen to the words and sentences, say them out loud, and tap your answers.\n- When you hear the beep, it is your turn to speak. Speak clearly, like talking to a friend.\n- Finish the lesson to earn points and keep your streak going.\n- Tap a stage or module heading to open or close it and look around your path.\n\n## Tips for best results\n- Do a little every day — one lesson a day is a great habit.\n- Say every word out loud, not just in your head. Your voice needs practice too!\n- If a lesson feels hard, do it once more. Repeating is how learning sticks.\n- Choose your study days in your Profile, so rest days never break your streak."
  },
  "help-reading": {
    "title": "How to use Smart Reading",
    "body": "## How to use\n- Tap a story card to open it. A tick on a card shows your best score for that story.\n- Choose \"Listen & Read\" to hear the story read aloud — the words light up as they are read.\n- Or choose \"Read Aloud\" and read the sentences yourself; the app listens and gives you a score.\n- Use the Speed button if the voice is too fast or too slow for you.\n- Answer the questions at the end of the story to check you understood it.\n- Tap \"Download PDF\" to save or print the story and read it anywhere.\n\n## Tips for best results\n- Pick your favourite story voices in Profile, under \"My Voices\", before you start.\n- Listen to a story first, then read it aloud yourself — that order works best.\n- Read a little every day; short stories count too.\n- When reading starts to feel easy, try a story from the next stage."
  },
  "help-speaking": {
    "title": "How to use Speaking Practice",
    "body": "## How to use\n- Choose \"Practise My Lesson Lines\" to say words and sentences from your lessons, or pick a conversation card to talk with a partner.\n- Listen to your partner's line first — tap the speaker button to hear it again.\n- When you hear the beep, speak your line out loud. The app listens and gives you a score.\n- In a conversation, take turns until you reach the end — then try it once more!\n\n## Tips for best results\n- Speaking works best in the Chrome browser. Please allow the microphone when the app asks.\n- Find a quiet place — noise makes it hard for the app to hear you.\n- Speak clearly and not too fast, like talking to a friend.\n- Keep the microphone near your mouth when you speak.\n- Do not worry about mistakes — every try makes your English stronger."
  },
  "help-games": {
    "title": "How to use Games",
    "body": "## How to use\n- Tap any game card to play it.\n- Read or listen to the question, then tap your answer — each game shows you what to do.\n- Finish the game to see your score and your stars — three stars is the best!\n- Use the stage and topic buttons at the top to find games for your level.\n\n## Tips for best results\n- Start with games from your own stage, then try harder ones.\n- Play a game again to beat your stars.\n- Listen carefully — many games practise your ears as well as your eyes.\n- A few minutes of games every day keeps your words fresh."
  },
  "help-videos": {
    "title": "How to use Videos",
    "body": "## How to use\n- Tap a video card to open it and watch.\n- Pause any time you want to think, and watch again as many times as you like.\n- Say the words out loud along with the video — your voice is part of the lesson!\n\n## Tips for best results\n- Watch with the sound on, in a quiet place.\n- Watch a video once for fun, then once more to listen carefully.\n- New videos are being made — check back soon for more."
  },
  "help-downloads": {
    "title": "How to use Downloads",
    "body": "## How to use\n- Tap a file to download or open it.\n- Worksheets and workbooks go with your lessons — print them and write on them with a pencil.\n- Guides and charts are good to keep near your study place.\n\n## Tips for best results\n- Ask a grown-up to help with printing.\n- Do the worksheet soon after the lesson, while the words are fresh.\n- Keep your finished worksheets together — it is lovely to see how much you have learned.\n- New downloads are being made — check back soon for more."
  }
};
