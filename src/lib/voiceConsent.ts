/**
 * Voice actor consent (Shastri's design, 2026-11-21).
 *
 * At first login, before an actor can choose a voice name or record
 * anything, they must read and accept the Voice Actor Privacy Policy
 * and the Voice Actor Terms and Conditions below. Accepting is stored
 * on the actor's account with the date and this version (migration
 * 25). Declining deletes the actor account completely and signs them
 * out — as if the account had never been created.
 *
 * The wording is the draft Shastri reviewed on 2026-11-21
 * (Voice-Actor-Privacy-Policy-DRAFT.md / Voice-Actor-Terms-DRAFT.md).
 * If the wording changes in an important way, raise CONSENT_VERSION:
 * every actor is then asked to accept the new version before they
 * can record again.
 */

export const CONSENT_VERSION = '1';
export const CONSENT_DATE_LABEL = '21 November 2026';

export interface ConsentSection {
  heading?: string;
  paragraphs: string[];
}

export const PRIVACY_POLICY_SECTIONS: ConsentSection[] = [
  {
    paragraphs: [
      'English for Cricket is a free English-learning platform operated by KYCO (Kansai Youth Cricket Organization), a volunteer-run organisation based in Kansai, Japan. This policy explains how we handle the personal information of our volunteer voice actors. It is shown to every voice actor at first login, and recording cannot begin until it has been read and accepted together with the Voice Actor Terms and Conditions.',
    ],
  },
  {
    heading: 'What we collect',
    paragraphs: [
      'Your voice recordings: every line and introduction you record and submit through the Voice Studio.',
      'Your voice name: the name you choose for your voice at first login. This name — not your real name — is the one shown to learners.',
      'Your account details: the username created for you by the administrator, and a record of when you accepted this policy and the Terms and Conditions, and which version you accepted.',
      'Contact details you give the administrator outside the app (for example an email address or messaging contact), used only to reach you about your recordings.',
      'We do not ask voice actors for payment details, home addresses, or identity documents.',
    ],
  },
  {
    heading: 'How your voice is used',
    paragraphs: [
      'Your recordings are the voices learners hear in English for Cricket lessons. Your voice will be used on our website and in our learning materials, and it may also appear in other places — for example in promotional videos, on social media, in presentations, and in future learning products — always as part of KYCO\u2019s educational work. Your chosen voice name may be shown to learners next to your voice so they can choose the voice they learn with.',
      'We will never sell your recordings or your personal information, and we will never use your voice for purposes unrelated to KYCO\u2019s educational and promotional work.',
    ],
  },
  {
    heading: 'How long we keep it',
    paragraphs: [
      'Recordings are kept for as long as KYCO uses them in its materials. Account records are kept while your account is active. If you ask us to delete your account, we will delete your account details; the treatment of recordings you have already submitted is explained in the Terms and Conditions.',
    ],
  },
  {
    heading: 'Your choices',
    paragraphs: [
      'You may ask us at any time what information we hold about you, ask for corrections, or ask for your account to be deleted. You may stop recording at any time. Contact us at support@englishforcricket.com.',
    ],
  },
  {
    heading: 'Changes to this policy',
    paragraphs: [
      'If this policy changes in an important way, we will show you the new version at your next login and ask you to accept it before you record again.',
    ],
  },
];

export const TERMS_SECTIONS: ConsentSection[] = [
  {
    paragraphs: [
      'These terms apply to volunteer voice actors who record lines for English for Cricket through the Voice Studio. English for Cricket is operated by KYCO (Kansai Youth Cricket Organization), a volunteer-run organisation based in Kansai, Japan. You must read and accept these terms, together with the Voice Actor Privacy Policy, before you can record. If you do not accept them, your voice actor account will be deleted and you will be logged out.',
    ],
  },
  {
    heading: '1. A volunteer role',
    paragraphs: [
      'Voice acting for English for Cricket is voluntary and unpaid. It does not create an employment relationship, and no payment, royalty, or other compensation is owed for recordings you submit, now or in the future.',
    ],
  },
  {
    heading: '2. Ownership of the recordings',
    paragraphs: [
      'All rights in the recordings you submit — including copyright and any related rights — belong to KYCO. This applies worldwide and without a time limit. KYCO may use, copy, edit, combine, publish, and distribute the recordings, in whole or in part, in the English for Cricket platform and in any other KYCO materials, including promotional videos, social media, presentations, and future learning products, without asking for further permission and without payment.',
    ],
  },
  {
    heading: '3. Your voice name',
    paragraphs: [
      'At first login you choose the name for your voice. That name is shown to learners. KYCO may rename a voice if a name is unsuitable, and may stop using a voice at any time.',
    ],
  },
  {
    heading: '4. Your promises',
    paragraphs: [
      'By recording, you confirm that the voice in your recordings is your own; that you are 18 years of age or older, or you have the consent of a parent or guardian; and that your recordings do not include anyone else\u2019s voice or any material you have no right to use.',
    ],
  },
  {
    heading: '5. Stopping',
    paragraphs: [
      'You may stop recording at any time by telling the administrator. Recordings you have already submitted remain the property of KYCO and may continue to be used, including in materials already published.',
    ],
  },
  {
    heading: '6. Accounts',
    paragraphs: [
      'KYCO may suspend or delete a voice actor account if these terms are broken, or if a voice is no longer needed. If you decline these terms at first login, your account is deleted immediately.',
    ],
  },
  {
    heading: '7. Acceptance',
    paragraphs: [
      'Acceptance is recorded electronically, with the date and the version of these terms. If the terms change in an important way, you will be asked to accept the new version before recording again.',
    ],
  },
];
