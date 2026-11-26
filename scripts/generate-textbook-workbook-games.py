# -*- coding: utf-8 -*-
"""Round 87 generator — the COMPLETE set of playable textbook workbook
games: all 144 lessons of the five traditional textbook workbooks.

Supersedes scripts/generate-textbook-workbook-sample.js (Round 86,
Book 1 Lesson 1 only, kept for history). B1-L01 regenerates here with
the same game id and the approved sample's content, now with its real
vocab-images pictures folded in (the interim v2 SQL is obsolete).

Content source of truth — nothing invented:
  ~/workspace/tools/build-book1..5-v2.py + book2_data.py (lesson data,
  WB_EXTRA, pattern tables, printed answer-key models) and the
  rendered pages in ~/workspace/your_files/english-for-cricket-textbooks-v2/.

Conversions follow the approved Round 86 sample: Trace -> letter-tile
word building; Match -> tap picture then word; Circle (pictures) ->
pick_picture; Circle (words/sentences) -> circle; Colour -> colour_it;
say-aloud lines -> say_it speech checks at 70% that store NOTHING.
Drawing and pure writing have no playable twin: they become note-only
say_it blocks on the game page that quote the printed task and say the
drawing/writing stays on paper (see the pack CONTENTS.txt).

Gap-fill answers are DERIVED, never guessed: a mechanical solver uses
only the printed item, its printed hint, and the lesson's own pattern
table / grammar titles; every derivation was eyeballed before shipping
and anything doubtful stays an open (paper) item.

Outputs:
  scripts/textbook-workbook-games.json  (all 144 rows)
  ~/workspace/your_files/textbook-workbook-games/  (SQL parts + CONTENTS.txt)
  ~/workspace/your_files/textbook-workbook-games.zip

Usage: python3 scripts/generate-textbook-workbook-games.py
"""
# Gap-fill / question solver v2 for textbook workbook games.
# Every derivation uses only the printed item, its printed hint parens, and the
# lesson's own printed grammar/practice titles and pattern table.
import re

def plain(s):
    s = re.sub(r'<[^>]+>', '', str(s))
    s = s.replace('\u2019', "'").replace('\u2018', "'").replace('\u201c', '"').replace('\u201d', '"')
    return s.replace('\u00a0', ' ').strip()

IRREG = {
 'be': ('was', 'been'), 'have': ('had', 'had'), 'do': ('did', 'done'), 'go': ('went', 'gone'),
 'see': ('saw', 'seen'), 'eat': ('ate', 'eaten'), 'fly': ('flew', 'flown'), 'meet': ('met', 'met'),
 'write': ('wrote', 'written'), 'take': ('took', 'taken'), 'catch': ('caught', 'caught'),
 'teach': ('taught', 'taught'), 'buy': ('bought', 'bought'), 'think': ('thought', 'thought'),
 'run': ('ran', 'run'), 'swim': ('swam', 'swum'), 'sing': ('sang', 'sung'), 'drink': ('drank', 'drunk'),
 'begin': ('began', 'begun'), 'break': ('broke', 'broken'), 'speak': ('spoke', 'spoken'),
 'choose': ('chose', 'chosen'), 'drive': ('drove', 'driven'), 'ride': ('rode', 'ridden'),
 'win': ('won', 'won'), 'lose': ('lost', 'lost'), 'make': ('made', 'made'), 'say': ('said', 'said'),
 'tell': ('told', 'told'), 'find': ('found', 'found'), 'give': ('gave', 'given'),
 'know': ('knew', 'known'), 'grow': ('grew', 'grown'), 'draw': ('drew', 'drawn'),
 'forget': ('forgot', 'forgotten'), 'leave': ('left', 'left'),
 'keep': ('kept', 'kept'), 'sleep': ('slept', 'slept'), 'feel': ('felt', 'felt'),
 'bring': ('brought', 'brought'), 'become': ('became', 'become'), 'come': ('came', 'come'),
 'stand': ('stood', 'stood'), 'understand': ('understood', 'understood'), 'hear': ('heard', 'heard'),
 'read': ('read', 'read'), 'cut': ('cut', 'cut'), 'put': ('put', 'put'), 'hit': ('hit', 'hit'),
 'let': ('let', 'let'), 'set': ('set', 'set'), 'cost': ('cost', 'cost'), 'build': ('built', 'built'),
 'send': ('sent', 'sent'), 'spend': ('spent', 'spent'), 'hold': ('held', 'held'),
 'fall': ('fell', 'fallen'), 'fight': ('fought', 'fought'), 'sell': ('sold', 'sold'),
 'pay': ('paid', 'paid'), 'sit': ('sat', 'sat'), 'throw': ('threw', 'thrown'),
 'blow': ('blew', 'blown'), 'show': ('showed', 'shown'), 'lead': ('led', 'led'),
 'feed': ('fed', 'fed'), 'hide': ('hid', 'hidden'), 'beat': ('beat', 'beaten'),
 'bite': ('bit', 'bitten'), 'dig': ('dug', 'dug'), 'hang': ('hung', 'hung'),
 'shake': ('shook', 'shaken'), 'steal': ('stole', 'stolen'), 'wake': ('woke', 'woken'),
 'wear': ('wore', 'worn'), 'tear': ('tore', 'torn'), 'bear': ('bore', 'borne'),
 'shut': ('shut', 'shut'), 'split': ('split', 'split'), 'stick': ('stuck', 'stuck'),
 'strike': ('struck', 'struck'), 'swing': ('swung', 'swung'), 'spin': ('spun', 'spun'),
 'seek': ('sought', 'sought'), 'rise': ('rose', 'risen'), 'lie': ('lay', 'lain'),
 'lay': ('laid', 'laid'), 'mean': ('meant', 'meant'), 'deal': ('dealt', 'dealt'),
 'dream': ('dreamt', 'dreamt'), 'learn': ('learnt', 'learnt'), 'burn': ('burnt', 'burnt'),
 'lend': ('lent', 'lent'), 'shine': ('shone', 'shone'),
 'shoot': ('shot', 'shot'), 'slide': ('slid', 'slid'), 'forgive': ('forgave', 'forgiven'),
 'freeze': ('froze', 'frozen'), 'get': ('got', 'got'),
 'mistake': ('mistook', 'mistaken'), 'overtake': ('overtook', 'overtaken'),
 'undergo': ('underwent', 'undergone'), 'withdraw': ('withdrew', 'withdrawn'),
 'arise': ('arose', 'arisen'), 'awake': ('awoke', 'awoken'), 'bend': ('bent', 'bent'),
 'bet': ('bet', 'bet'), 'bind': ('bound', 'bound'), 'bleed': ('bled', 'bled'),
 'breed': ('bred', 'bred'), 'cling': ('clung', 'clung'), 'creep': ('crept', 'crept'),
 'forbid': ('forbade', 'forbidden'), 'grind': ('ground', 'ground'), 'leap': ('leapt', 'leapt'),
 'sweep': ('swept', 'swept'), 'weep': ('wept', 'wept'), 'wind': ('wound', 'wound'),
 'broadcast': ('broadcast', 'broadcast'),
}
DOUBLE = set('run swim sit cut put hit let set dig win spin stop drop plan rob grab nod hop skip shop chat beg drag hug jog rub tug skip slip step trap trip wrap'.split())
ADJS = set('tall big small good bad happy fast slow strong weak young old long short high low easy hard hot cold wet dry fat thin sad glad busy early late careful quick quiet loud soft heavy light clean dirty rich poor hungry thirsty thirsty full empty safe dangerous beautiful pretty nice kind funny boring interesting important different same ready sure afraid proud shy brave free'.split())
FREQ = ['always', 'usually', 'often', 'sometimes', 'never']
WH = {'person': 'Who', 'place': 'Where', 'time': 'When', 'reason': 'Why', 'owner': 'Whose', 'thing': 'What', 'way': 'How', 'choice': 'Which'}
PREP_GLOSS = {'sleeping inside': 'in', 'below it': 'under', 'at their side': 'next to', 'on top of it': 'on', 'at the back of it': 'behind', 'inside': 'in', 'below': 'under'}

def s_form(v):
    if v == 'have': return 'has'
    if v == 'be': return 'is'
    if v == 'do': return 'does'
    if v == 'go': return 'goes'
    if re.search(r'(s|x|z|ch|sh)$', v): return v + 'es'
    if re.search(r'[^aeiou]y$', v): return v[:-1] + 'ies'
    return v + 's'

def past_form(v, table=None):
    if table and v in table: return table[v]
    if v in IRREG: return IRREG[v][0]
    if v.endswith('e'): return v + 'd'
    if re.search(r'[^aeiou]y$', v): return v[:-1] + 'ied'
    if v in DOUBLE: return v + v[-1] + 'ed'
    return v + 'ed'

def part_form(v, table=None):
    if table and v in table: return table[v]
    if v in IRREG: return IRREG[v][1]
    return past_form(v, table)

def ing_form(v):
    if v == 'be': return 'being'
    if v in ('lie',): return 'lying'
    if v in ('die',): return 'dying'
    if v in ('tie',): return 'tying'
    if re.search(r'[^aeiou]e$', v): return v[:-1] + 'ing'
    if v in DOUBLE: return v + v[-1] + 'ing'
    return v + 'ing'

def comp_form(a):
    if a == 'good': return 'better'
    if a == 'bad': return 'worse'
    if a in ('big', 'hot', 'thin', 'fat', 'sad'): return a + a[-1] + 'er'
    if re.search(r'[^aeiou]y$', a): return a[:-1] + 'ier'
    if a.endswith('e'): return a + 'r'
    return a + 'er'

def sup_form(a):
    if a == 'good': return 'best'
    if a == 'bad': return 'worst'
    if a in ('big', 'hot', 'thin', 'fat', 'sad'): return a + a[-1] + 'est'
    if re.search(r'[^aeiou]y$', a): return a[:-1] + 'iest'
    if a.endswith('e'): return a + 'st'
    return a + 'est'

def plural_form(w):
    if re.search(r'(s|x|z|ch|sh)$', w): return w + 'es'
    if re.search(r'[^aeiou]y$', w): return w[:-1] + 'ies'
    if w == 'child': return 'children'
    if w == 'person': return 'people'
    if w == 'foot': return 'feet'
    if w == 'tooth': return 'teeth'
    return w + 's'

NAMES = set('ken mira yui rao ana bannerman charles england india australia london japan tokyo osaka kyoto sunday monday'.split())
UNCOUNT = set('water time money homework information traffic rain snow bread rice milk music advice news work fun luck'.split())

def subject_kind(before, after):
    at = re.findall(r"[A-Za-z']+", after)
    bt = re.findall(r"[A-Za-z']+", before)
    def kind_of(tok, name_pos=False):
        t = tok.lower().strip("'")
        if t == 'i': return '1sg'
        if t == 'you': return '2'
        if t in ('we', 'they'): return 'pl'
        if t in ('he', 'she', 'it'): return '3sg'
        if t in ('this', 'that'): return '3sg'
        if t in ('these', 'those'): return 'pl'
        if t in NAMES: return '3sg'
        if tok[0].isupper() and name_pos: return '3sg'
        if t.endswith('s') and not t.endswith(('ss', 'us', 'is')): return 'pl'
        return '3sg'
    if not bt and at: return kind_of(at[0], name_pos=True)
    if bt:
        if bt[-1].lower() == 'there' and at: return kind_of(at[0], name_pos=True)
        return kind_of(bt[-1], name_pos=len(bt) > 1)
    return '3sg'

def be_form(kind, tense):
    if tense == 'past': return 'was' if kind in ('1sg', '3sg') else 'were'
    return {'1sg': 'am', '3sg': 'is'}.get(kind, 'are')

PAST_SIGNALS = re.compile(r'\b(yesterday|last night|last week|last month|last year|last winter|last sunday|last monday|ago|in 2001|in 1990|in those days)\b', re.I)
FUT_SIGNALS = re.compile(r'\b(tomorrow|next week|next month|next year|next sunday|next monday)\b', re.I)
NOW_SIGNALS = re.compile(r'\b(right now|at the moment|now)\b', re.I)
GAP = '______'

def strip_number(t): return re.sub(r'^\s*\d+\.\s*', '', t).strip()

def classify_parens(t):
    out = []
    for m in re.finditer(r'\(([^)]*)\)', t):
        c = m.group(1).strip()
        cl = c.lower()
        _pp0 = [p.strip() for p in cl.split('/')]
        if len(_pp0) > 1 and 'use' in ' '.join(_pp0).split() and 'to' in ' '.join(_pp0).split() and _pp0[-1].split()[-1] in VERBSET_ALL:
            out.append(('negusedto' if _pp0[0] == 'not' else 'usedto', _pp0[-1].split()[-1]))
        elif cl.startswith('not / '): out.append(('negverb', cl[len('not / '):].strip()))
        elif cl.startswith('not ') and cl.split()[1] in VERBSET_ALL: out.append(('negverb', cl.split()[1]))
        elif ' / ' in c:
            parts = [p.strip().lower() for p in c.split(' / ')]
            if parts[0] in ('just', 'already', 'never') and len(parts) == 2 and parts[1] in VERBSET_ALL: out.append(('advverb', (parts[0], parts[1])))
            elif 'use' in ' '.join(parts).split() and 'to' in ' '.join(parts).split() and parts[-1].split()[-1] in VERBSET_ALL:
                out.append(('negusedto' if parts[0] == 'not' else 'usedto', parts[-1].split()[-1]))
            else: out.append(('slash', c))
        elif cl in VERBSET_ALL: out.append(('verb', cl))
        elif re.fullmatch(r'[a-z]+ [a-z]+', cl) and cl.split()[0] in VERBSET_ALL: out.append(('verbphrase', cl))
        elif cl in ADJS: out.append(('adj', cl))
        elif cl in FREQ: out.append(('freq', cl))
        else: out.append(('label', c))
    return out

def clean_text(s):
    s = re.sub(r'\s+', ' ', s).strip()
    s = re.sub(r'\s+([.,?!;:])', r'\1', s)
    s = s.replace('( ', '(').replace(' )', ')')
    return s

def remove_parens(t):
    out = re.sub(r'\(([^)]*)\)', '', t)
    return clean_text(out)

def focus_of(grammar_t, ex_t):
    s = (grammar_t + ' ' + ex_t).lower()
    if 'past perfect continuous' in s: return 'pastperfcont'
    if 'past perfect' in s: return 'pastperf'
    if 'present perfect continuous' in s: return 'perfcont'
    if 'present perfect' in s: return 'perfect'
    if 'past continuous' in s: return 'pastcont'
    if 'present continuous' in s: return 'continuous'
    if 'going to' in s: return 'goingto'
    if 'past simple' in s or 'past tense' in s or 'tell it in the past' in s: return 'past'
    if 'future' in s or 'will' in s: return 'future'
    if 'present simple' in s: return 'present'
    return None

SET_PATTERNS = [
    (re.compile(r"must, mustn't or don't have to", re.I), ['must', "mustn't", "don't have to"]),
    (re.compile(r'\bam, is or are\b', re.I), ['am', 'is', 'are']),
    (re.compile(r'\bis or are\b', re.I), ['is', 'are']),
    (re.compile(r'\bwas or were\b', re.I), ['was', 'were']),
    (re.compile(r'\bhave got or has got\b', re.I), ['have got', 'has got']),
    (re.compile(r'\bhave or has\b', re.I), ['have', 'has']),
    (re.compile(r'\bdo or does\b', re.I), ['do', 'does']),
    (re.compile(r"\bdon't or doesn't\b", re.I), ["don't", "doesn't"]),
    (re.compile(r'\bwill or won\'t\b', re.I), ['will', "won't"]),
    (re.compile(r'\bshould or shouldn\'t\b', re.I), ['should', "shouldn't"]),
    (re.compile(r'\bcan or can\'t\b', re.I), ['can', "can't"]),
    (re.compile(r'\ba or an\b', re.I), ['a', 'an']),
    (re.compile(r'\bthis or that\b', re.I), ['this', 'that']),
    (re.compile(r'\bthese or those\b', re.I), ['these', 'those']),
    (re.compile(r'\bsome or any\b', re.I), ['some', 'any']),
    (re.compile(r'\bmuch or many\b', re.I), ['much', 'many']),
]
LABEL_ANSWERS = {'forbidden': "mustn't", 'rule': 'must', 'strong rule': 'must', 'not necessary': "don't have to",
                 'advice': 'should', 'maybe': 'might', 'polite': 'could', 'promise': 'will', "won't": "won't",
                 'big change': 'much', 'small change': 'a bit', 'length': 'for', 'starting point': 'since', 'duty': 'shall', 'permission': 'may'}

def set_answer(options, kind, after, before, t, labels):
    oset = [o.lower() for o in options]
    for lab in labels:
        a = LABEL_ANSWERS.get(lab.lower())
        if a and a in oset: return a
    if oset == ['am', 'is', 'are']: return be_form(kind, 'present')
    if oset == ['is', 'are']: return 'is' if kind == '3sg' else 'are'
    if oset == ['was', 'were']: return be_form(kind, 'past')
    if oset == ['have got', 'has got']: return 'has got' if kind == '3sg' else 'have got'
    if oset == ['have', 'has']: return 'has' if kind == '3sg' else 'have'
    if oset == ['do', 'does']: return 'does' if kind == '3sg' else 'do'
    if oset == ["don't", "doesn't"]: return "doesn't" if kind == '3sg' else "don't"
    if oset == ['a', 'an']:
        nxt = (re.findall(r"[A-Za-z']+", after) or [''])[0].lower()
        if nxt in ('hour', 'honest', 'honour'): return 'an'
        if nxt.startswith(('uni', 'use', 'eur', 'one')): return 'a'
        return 'an' if nxt[:1] in 'aeiou' else 'a'
    if oset == ['this', 'that']: return 'that' if '(far)' in t else 'this'
    if oset == ['these', 'those']: return 'those' if '(far)' in t else 'these'
    if oset == ['some', 'any']:
        return 'any' if ('?' in t or re.search(r"\b(not|n't|never)\b", t)) else 'some'
    if oset == ['much', 'many']:
        nxt = (re.findall(r"[A-Za-z']+", after) or [''])[0].lower()
        return 'much' if (nxt in UNCOUNT or not nxt.endswith('s')) else 'many'
    if oset == ['will', "won't"]:
        return "won't" if re.search(r'\bnever\b', t, re.I) else 'will'
    if oset == ['should', "shouldn't"]: return 'should'
    if oset == ['can', "can't"]: return 'can'
    if oset == ['must', "mustn't", "don't have to"]: return None
    return None

VERBS_EXTRA = set('''bowl bat field declare elect resume conquer fund rise attend injure nominate can could will would shall should may might must rest breathe relax stretch tie fold mix stir pour fill empty push pull arrive end seem appear matter belong own owe consist contain depend exist remain occur happen tend involve include require produce create develop improve double suspend collect estimate resign apologise apologize argue claim report suggest insist demand recommend propose play walk talk work watch listen read help want need like love live look ask answer open close start finish stop rain snow visit travel score pass kick throw carry climb jump dance paint colour count spell say speak tell wait hope wish try use turn point show move call clean cook wash brush dress sleep wake drink write sit stand give make study learn teach practise practice train cheer shout clap smile laugh cry wave nod shake cross dribble tackle shoot save dive bounce roll head volley chip lob mark press attack defend signal appeal review decide award lift drop remember understand believe mean follow feed seek cost build send spend hold fall sell pay blow beat dig hang swing spin sweep weep arise awake bend bet bind bleed breed cling creep forbid leap broadcast undergo withdraw forgive freeze shut split stick strike feed catch begin meet sing swim run eat fly see go do have be take write choose drive ride win lose find know grow draw leave keep feel bring become come hear cut put hit let set throw show lead hide bite shake steal tear bear grind mistake overtake'''.split())
VERBSET_ALL = set(IRREG) | VERBS_EXTRA

def verb_family(v, past_table, part_table):
    fam = []
    for f in (v, s_form(v), past_form(v, past_table), part_form(v, part_table)):
        if f not in fam: fam.append(f)
    return fam

NORM = {"can't": 'cannot', "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "isn't": 'is not', "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not', "haven't": 'have not', "hasn't": 'has not', "won't": 'will not', "mustn't": 'must not', "shouldn't": 'should not', "couldn't": 'could not', "wouldn't": 'would not', "it's": 'it is', "i'm": 'i am', "you're": 'you are', "we're": 'we are', "they're": 'they are', "i've": 'i have', "we've": 'we have', "i'll": 'i will', "you'll": 'you will', "let's": 'let us', "n't": 'not'}

def norm_tokens(s):
    toks = re.findall(r"[A-Za-z']+|\d+|[^\sA-Za-z'\d]", s.lower())
    out = []
    for tk in toks:
        if tk in NORM: out.extend(NORM[tk].split())
        else: out.append(tk)
    return out

def solve_item(raw, ctx):
    t = strip_number(plain(raw))
    if GAP not in t: return None
    parens = classify_parens(t)
    if '→' in t and GAP in t:
        # parens before the first gap in a transformation item are task-type
        # labels ("(passive)", "(report)"), never hints
        _g0 = t.index(GAP)
        _keep = []
        for _m in re.finditer(r'\(([^)]*)\)', t):
            if _m.start() < _g0: continue
            _keep.extend(classify_parens(_m.group(0)))
        parens = _keep
    labels = [c for k, c in parens if k == 'label']
    slash = next((c for k, c in parens if k == 'slash'), None)
    verbhint = next((c for k, c in parens if k == 'verb'), None)
    verbphrase = next((c for k, c in parens if k == 'verbphrase'), None)
    if verbphrase and not verbhint: verbhint = verbphrase
    negverb = next((c for k, c in parens if k == 'negverb'), None)
    advverb = next((c for k, c in parens if k == 'advverb'), None)
    adjhint = next((c for k, c in parens if k == 'adj'), None)
    freqhint = next((c for k, c in parens if k == 'freq'), None)
    if freqhint:
        _fp = re.search(r'\((always|usually|often|sometimes|never)\)', t)
        if _fp and GAP in t and _fp.start() < t.index(GAP): freqhint = None
    t2 = remove_parens(t)  # context text (printed sentence without hints)
    _segs = t.split(GAP)
    gap_hints = []
    for _i in range(len(_segs) - 1):
        _cp = classify_parens(_segs[_i + 1])
        gap_hints.append({
            'verb': next((c for k, c in _cp if k == 'verb'), None),
            'negverb': next((c for k, c in _cp if k == 'negverb'), None),
            'usedto': next((c for k, c in _cp if k == 'usedto'), None),
            'negusedto': next((c for k, c in _cp if k == 'negusedto'), None),
        })
    usedto = next((c for k, c in parens if k == 'usedto'), None)
    negusedto = next((c for k, c in parens if k == 'negusedto'), None)
    gaps = [m.start() for m in re.finditer(GAP, t2)]
    focus = ctx.get('focus') or focus_of(ctx.get('grammar_t', ''), ctx.get('ex_t', ''))
    past_table, part_table = ctx.get('past_table', {}), ctx.get('part_table', {})
    full_text = (ctx.get('grammar_t', '') + ' ' + ctx.get('ex_t', '') + ' ' + ' '.join(ctx.get('pattern_sents', []))).lower()

    def parts(i):
        s = gaps[i]
        return t2[:s], t2[s + len(GAP):]
    def kind_at(i):
        b, a = parts(i)
        return subject_kind(b, a)
    def tense_at(i):
        b, a = parts(i)
        local = b + ' ' + a
        if PAST_SIGNALS.search(local): return 'past'
        if focus == 'goingto': return 'goingto'
        if FUT_SIGNALS.search(local): return 'future'
        if re.search(r'\bevery (day|week|sunday|monday|tuesday|wednesday|thursday|friday|saturday|morning|night|year|month)\b', local): return 'present'
        if NOW_SIGNALS.search(local): return 'continuous'
        if re.search(r'\b(ever|never|already|just|yet|since|so far)\b', local): return 'perfect'
        return focus
    def complete(fills, rule):
        out = t2
        for f in fills: out = out.replace(GAP, f, 1)
        out = clean_text(out)
        out = out[0].upper() + out[1:] if out else out
        if len(fills) == 1 and ' ' not in fills[0] and len(gaps) == 1:
            return None  # caller decides circle
        return {'kind': 'pattern', 'model': t, 'say': out, 'rule': rule}
    def circle1(fill, options, rule):
        if fill not in options:
            options = [fill] + [o for o in options if o != fill]
        return {'kind': 'circle', 'question': t2, 'options': options, 'answer': options.index(fill), 'rule': rule}

    # --- arrow chains: "go → ______ · see → ______" (past forms / plurals)
    _chain = re.findall(r"([A-Za-z']+)\s*→\s*" + GAP, t2)
    if _chain and len(_chain) == len(gaps):
        fills = []
        for w in _chain:
            wl = w.lower()
            if 'plural' in full_text: fills.append(plural_form(wl))
            elif wl in VERBSET_ALL: fills.append(past_form(wl, past_table))
            else: fills = []; break
        if fills:
            r = complete(fills, 'arrow chain')
            if r: return r

    # --- frequency adverb hint
    if freqhint:
        if len(gaps) == 1:
            return circle1(freqhint, FREQ, 'frequency adverb hint')
        if len(gaps) == 2:
            # gap1 = question aux, gap2 = the adverb ("Do you often read?")
            b, a = parts(0)
            kind = kind_at(0)
            ts = tense_at(0)
            if ts == 'past': aux = 'Did'
            elif kind == '3sg': aux = 'Does'
            else: aux = 'Do'
            r = complete([aux, freqhint], 'frequency adverb + aux')
            if r: return r
        return None

    # --- wh-word category hint
    wh_labels = [l for l in labels if any(l.lower().startswith(k) for k in WH)]
    if wh_labels and len(gaps) == 1 and not t2.split(GAP)[0].strip():
        cat = wh_labels[0].lower()
        for k, w in WH.items():
            if cat.startswith(k):
                opts = ['Who', 'What', 'Where', 'When', 'Why', 'Whose', 'How']
                return circle1(w, opts, 'wh category hint')
    # wh gap with no hint: answer phrase after gap decides (place answer printed)
    if len(gaps) == 1 and not t2.split(GAP)[0].strip() and re.search(r'\bis my\b|\bis your\b', t2) and 'on the' in t2 or False:
        pass

    # --- preposition gloss hint
    for lab in labels:
        if lab.lower() in PREP_GLOSS and len(gaps) == 1:
            opts = ['in', 'on', 'under', 'next to', 'behind']
            return circle1(PREP_GLOSS[lab.lower()], opts, 'preposition gloss')

    # --- '(past)' label in a can lesson -> could
    if len(gaps) == 1 and any(l.lower() == 'past' for l in labels) and re.search(r'can|could|modal', ctx.get('grammar_t', '')):
        return circle1('could', ['could', 'can', 'must'], 'past ability')
    # --- '(subject ...)' label on a wh gap -> Who
    if len(gaps) == 1 and not parts(0)[0].strip() and any('subject' in l.lower() for l in labels):
        return circle1('Who', ['Who', 'What', 'Where', 'When', 'Why', 'Whose', 'How'], 'subject question')

    # --- modal semantic labels (must appear in the lesson's taught text)
    for lab in labels:
        a = LABEL_ANSWERS.get(lab.lower())
        if a and len(gaps) == 1:
            b, after = parts(0)
            nxt = (re.findall(r"[A-Za-z']+", after) or [''])[0].lower()
            if a == 'could' and not b.strip(): a = 'Could'
            if a.lower() in full_text:
                opts = {'must': ['must', "mustn't", "don't have to"], "mustn't": ['must', "mustn't", "don't have to"],
                        "don't have to": ['must', "mustn't", "don't have to"], 'should': ['should', "shouldn't", 'must'],
                        'might': ['might', 'will', 'must'], 'could': ['could', 'can', 'must'], 'Could': ['Could', 'Can', 'Must'],
                        'will': ['will', "won't", 'might'], "won't": ['will', "won't", 'might'],
                        'much': ['much', 'a bit', 'as'], 'a bit': ['a bit', 'much', 'far'], 'for': ['for', 'since'], 'since': ['for', 'since'], 'shall': ['shall', 'may'], 'may': ['shall', 'may']}.get(a, [a])
                return circle1(a, opts, f'modal label ({lab})')

    # --- comparative / superlative adjective hint
    if adjhint:
        a = adjhint
        if ' than ' in t2:
            if len(gaps) == 1:
                return circle1(comp_form(a), [a, comp_form(a), sup_form(a)], 'comparative')
            if len(gaps) == 2:
                # "Is a bird smaller than a cat?" gap1 = be
                kind = kind_at(0)
                r = complete([be_form(kind, 'present').capitalize() if not parts(0)[0].strip() else be_form(kind, 'present'), comp_form(a)], 'comparative question')
                if r: return r
            return None
        else:
            if len(gaps) == 1:
                b, after = parts(0)
                fill = sup_form(a)
                if re.search(r'\bthe\s*$', b) or re.search(r'\bof\s*$', b): fill = sup_form(a)
                else: fill = 'the ' + sup_form(a)
                if ' ' in fill:
                    r = complete([fill], 'superlative')
                    if r: return r
                return circle1(fill, [a, comp_form(a), sup_form(a)], 'superlative')
            if len(gaps) == 2:
                # "Who is the tallest in your class?" gaps: wh + superlative
                r = complete(['Who', 'the ' + sup_form(a)], 'superlative question')
                if r: return r
            return None

    # --- as ... as (two gaps around an adjective)
    if len(gaps) == 2 and 'as' in full_text:
        b0, a0 = parts(0)
        mid = t2[gaps[0] + len(GAP):gaps[1]].strip()
        if mid.lower() in ADJS:
            r = complete(['as', 'as'], 'as...as')
            if r: return r
        # not as ... as: gap pattern "not ______ good ______"
        if b0.rstrip().lower().endswith('not') and mid.lower() in ADJS:
            r = complete(['as', 'as'], 'not as...as')
            if r: return r

    # --- too / enough (lesson teaches it)
    if len(gaps) == 1 and ('too' in full_text and 'enough' in full_text):
        b, a = parts(0)
        bt = re.findall(r"[A-Za-z']+", b)
        at = re.findall(r"[A-Za-z']+", a)
        prev = bt[-1].lower() if bt else ''
        nxt = at[0].lower() if at else ''
        if prev in ADJS: return circle1('enough', ['too', 'enough', 'very'], 'adj + enough')
        if nxt in UNCOUNT: return circle1('enough', ['too', 'enough', 'many'], 'enough + noun')
        if nxt in ADJS and re.search(r'\bto\b', a): return circle1('too', ['too', 'enough', 'very'], 'too + adj + to')
        if nxt in ADJS and prev not in ADJS: return circle1('too', ['too', 'enough', 'very'], 'too before adjective')

    # --- just / already / yet (present perfect lessons)
    if len(gaps) == 1 and focus == 'perfect' and not verbhint and not slash:
        b, a = parts(0)
        bt = re.findall(r"[A-Za-z']+", b)
        prev = bt[-1].lower() if bt else ''
        at_end = not a.strip(' .?!')
        if at_end: return circle1('yet', ['just', 'already', 'yet'], 'yet at end')
        if prev in ('has', 'have'): return circle1('just', ['just', 'already', 'yet'], 'just after have/has')

    # --- relative pronoun (single gap after a noun, before a verb/subject)
    if len(gaps) == 1 and 'relative' in full_text and not verbhint and not advverb and not slash:
        b, a = parts(0)
        bt = re.findall(r"[A-Za-z']+", b)
        at = re.findall(r"[A-Za-z']+", a)
        if bt and at and bt[-1].lower() not in ('the', 'a', 'an', 'is', 'are', 'was') and 'relative' in full_text:
            person_nouns = ('coach', 'girl', 'boy', 'man', 'woman', 'player', 'teacher', 'captain', 'friend', 'sister', 'brother', 'mother', 'father', 'singer', 'author', 'actor', 'grandfather', 'grandmother', 'neighbour', 'lady', 'student', 'child', 'doctor', 'nurse', 'driver', 'farmer', 'artist', 'writer', 'uncle', 'aunt', 'cousin', 'husband', 'wife', 'king', 'queen', 'baby')
            if len(at) > 1 and at[0].lower() not in VERBSET_ALL and at[0].lower() not in ('i', 'you', 'he', 'she', 'it', 'we', 'they') and at[1].lower() in ('is', 'was', 'are', 'were'):
                ans = 'whose'
            else:
                ans = 'who' if bt[-1].lower() in person_nouns else 'that'
            return circle1(ans, ['who', 'that', 'where', 'whose'], 'relative pronoun')

    # --- slash choices, single gap
    if slash and len(gaps) == 1:
        _so = [o.strip().lower() for o in slash.split(' / ')]
        if len(_so) == 2 and _so[1] == 'be' and _so[0] in ('must', "can't", 'might', 'could', 'may', 'should'):
            r = complete([f'{_so[0]} be'], 'modal deduction')
            if r: return r
        options = [o.strip() for o in slash.split(' / ')]
        b, a = parts(0)
        kind = kind_at(0)
        ans = set_answer(options, kind, a, b, t, labels)
        if ans is None and options[0].lower() in VERBSET_ALL:
            base = options[0].lower()
            ts = tense_at(0)
            if ts == 'past': ans = past_form(base, past_table)
            elif kind == '3sg' and ts in (None, 'present'): ans = s_form(base)
            else: ans = base
            if ans not in [o.lower() for o in options]: ans = None
        if ans is not None:
            idx = [o.lower() for o in options].index(ans.lower())
            return {'kind': 'circle', 'question': t2, 'options': options, 'answer': idx, 'rule': 'slash choice'}
        _ol = [o.lower() for o in options]
        if set(_ol) <= {'who', 'which', 'that', 'where', 'whose', 'whom'}:
            _bt = re.findall(r"[A-Za-z']+", b)
            _persons = ('coach', 'girl', 'boy', 'man', 'woman', 'player', 'teacher', 'captain', 'friend', 'guide', 'singer', 'author', 'actor', 'sister', 'brother', 'mother', 'father')
            if _bt and _bt[-1].lower() in _persons and 'who' in _ol:
                return {'kind': 'circle', 'question': t2, 'options': options, 'answer': _ol.index('who'), 'rule': 'relative slash (person)'}
            if 'that' in _ol:
                return {'kind': 'circle', 'question': t2, 'options': options, 'answer': _ol.index('that'), 'rule': 'relative slash (thing)'}
            if 'which' in _ol:
                return {'kind': 'circle', 'question': t2, 'options': options, 'answer': _ol.index('which'), 'rule': 'relative slash (thing)'}
        return None

    # --- adverb+verb slash: "(just / arrive)" -> have just arrived
    if advverb:
        adv, base = advverb
        if len(gaps) == 1:
            kind = kind_at(0)
            if PAST_SIGNALS.search(t2) or re.search(r'\b(got|went|saw|was|were|had|did|arrived|reached)\b', t2):
                aux = 'had'
            else:
                aux = 'has' if kind == '3sg' else 'have'
            r = complete([f'{aux} {adv} ' + part_form(base, part_table)], 'adverb perfect')
            if r: return r

    # --- negative verb hint
    if negverb and len(gaps) == 1:
        base = negverb
        kind = kind_at(0)
        ts = tense_at(0)
        _b, _a = parts(0)
        _bt = re.findall(r"[A-Za-z']+", _b)
        _prev = _bt[-1].lower() if _bt else ''
        if 'passive' in full_text:
            aux = be_form(kind, 'past' if ts == 'past' else 'present')
            fill = f"{aux}n't " + part_form(base, part_table) if aux != 'am' else 'am not ' + part_form(base, part_table)
            r = complete([fill], 'passive negative')
            if r: return r
        if _prev in ('decided', 'want', 'wants', 'hope', 'plan', 'planned'):
            r = complete(['not to ' + base], 'negative infinitive')
            if r: return r
        if re.search(r'\bwish\b', t2.lower()):
            r = complete([f"didn't {base}"], 'wish negative')
            if r: return r
        if focus in ('perfcont', 'pastperfcont'):
            aux = 'had' if focus == 'pastperfcont' else ('has' if kind == '3sg' else 'have')
            fill = f"{aux}n't been " + ing_form(base)
            r = complete([fill], 'perfect continuous negative')
            if r: return r
        if focus == 'goingto' or ts == 'goingto':
            aux = be_form(kind, 'present')
            fill = f"{aux}n't going to {base}" if aux not in ('am',) else f"am not going to {base}"
            r = complete([fill], 'going-to negative')
            if r: return r
        if ts == 'past': fill = f"didn't {base}"
        elif kind == '3sg': fill = f"doesn't {base}"
        else: fill = f"don't {base}"
        r = complete([fill], 'negative verb')
        if r: return r
        return None

    # --- printed Yes/No question + "No, <pronoun> ______." short answer
    if len(gaps) == 1 and re.search(r'\bNo,', t2) and '?' in t2:
        _q = t2.split('?')[0].strip()
        _aux0 = (re.findall(r"[A-Za-z']+", _q) or [''])[0]
        _negmap = {'Is': "isn't", 'Are': "aren't", 'Do': "don't", 'Does': "doesn't", 'Did': "didn't", 'Can': "can't", 'Will': "won't", 'Was': "wasn't", 'Were': "weren't", 'Has': "hasn't", 'Have': "haven't"}
        _posmap = {"isn't": 'is', "aren't": 'are', "don't": 'do', "doesn't": 'does', "didn't": 'did', "can't": 'can', "won't": 'will', "wasn't": 'was', "weren't": 'were', "hasn't": 'has', "haven't": 'have'}
        if _aux0 in _negmap:
            _neg = _negmap[_aux0]
            return circle1(_neg, [_posmap[_neg], _neg], 'short answer No')

    # --- demonstrative + a/an mixed items ("______ is ______ egg.", "(far)")
    if len(gaps) <= 2 and any((re.findall(r"[A-Za-z']+", parts(i)[1]) or [''])[0].lower() == 'is' for i in range(len(gaps))):
        _ex = ctx.get('ex_t', '')
        if re.search(r'this or that', _ex) or '(far)' in t or re.search(r'a or an', _ex):
            fills, ok = [], True
            for i in range(len(gaps)):
                b, a = parts(i)
                at = re.findall(r"[A-Za-z']+", a)
                nxt = at[0].lower() if at else ''
                if nxt == 'is':
                    fills.append('That' if '(far)' in t else 'This')
                elif nxt:
                    fills.append('an' if nxt[:1] in 'aeiou' else 'a')
                else:
                    ok = False; break
            if ok:
                if len(gaps) == 1:
                    return circle1(fills[0], ['This', 'That'], 'demonstrative')
                r = complete(fills, 'demonstrative + article')
                if r: return r

    # --- "______ is my pencil?" place answer printed -> Where
    if len(gaps) == 1 and not parts(0)[0].strip() and re.search(r'It is (on|in|under|behind|next to)', t2):
        return circle1('Where', ['Who', 'What', 'Where', 'When', 'Why', 'Whose', 'How'], 'where is')

    # --- have-to question: "______ she ______ come early? Yes, she does."
    if len(gaps) == 2 and not verbhint and re.search(r'have to', ctx.get('grammar_t', '')):
        _cue = re.search(r"Yes,\s+\w+\s+(does|do|did)\b", t2)
        if _cue:
            r = complete([_cue.group(1).capitalize(), 'have to'], 'have to question')
            if r: return r

    # --- How many question: "______ many runs ______ he make? Thirty."
    if len(gaps) == 2 and re.search(r'^' + GAP + r'\s+many\b', t2):
        r = complete(['How', 'did'], 'how many past question')
        if r: return r

    # --- multi-gap modal labels (one label per gap, in order)
    _lab_fills = [LABEL_ANSWERS.get(l.lower()) for l in labels]
    if len(gaps) >= 2 and len(labels) == len(gaps) and all(_lab_fills):
        r = complete(_lab_fills, 'per-gap modal labels')
        if r: return r

    # --- 'a lot ______ friends' -> of
    if len(gaps) == 1 and re.search(r'\ba lot\s*$', parts(0)[0]):
        return circle1('of', ['of', 'some', 'any'], 'a lot of')

    # --- closed set from ex_t
    exset = None
    for pat, opts in SET_PATTERNS:
        if pat.search(ctx.get('ex_t', '')): exset = opts; break
    # 'How ______' prefers the much/many set when both match
    if exset == ['some', 'any'] and any(re.search(r'\bHow\s*$', parts(i)[0]) for i in range(len(gaps))):
        for pat, opts in SET_PATTERNS:
            if opts == ['much', 'many'] and pat.search(ctx.get('ex_t', '')): exset = opts; break
    if exset and not verbhint and not negverb and len(gaps) <= 2:
        fills, ok = [], True
        use_opts = list(exset)
        if exset == ['have got', 'has got'] and re.search(r'\bgot\b', t2):
            use_opts = ['have', 'has']
        for i in range(len(gaps)):
            b, a = parts(i)
            at = re.findall(r"[A-Za-z']+", a)
            nxt = at[0].lower() if at else ''
            if use_opts == ['have', 'has']:
                ans = 'has' if kind_at(i) == '3sg' else 'have'
            elif exset == ['a', 'an'] and nxt in ('is', 'are', 'was', 'were', ''):
                ok = False; break  # a/an cannot precede a verb: wrong set for this gap
            elif exset == ['can', "can't"] and re.search(r'\bbut\b', b):
                ans = "can't"
            else:
                ans = set_answer(use_opts if use_opts != exset else exset, kind_at(i), a, b, t, labels)
            if ans is None: ok = False; break
            fills.append(ans)
        exset = use_opts
        if ok:
            if len(gaps) == 1 and ' ' not in fills[0]:
                return circle1(fills[0], list(exset), 'ex_t set')
            r = complete(fills, 'ex_t set')
            if r: return r

    # --- Yes/No short-answer pair: "______ you play? Yes, I ______."
    m = re.match(r'^(.*?)\?\s*(Yes|No),?\s+(.*)$', t2)
    if m and len(gaps) == 2 and not verbhint:
        b0, a0 = parts(0)
        subj_toks = re.findall(r"[A-Za-z']+", a0)
        verb_tok = subj_toks[1].lower() if len(subj_toks) > 1 else ''
        kind0 = subject_kind('', a0)
        ts = tense_at(0)
        neg = m.group(2) == 'No'
        if verb_tok in VERBSET_ALL and ing_form(verb_tok) == verb_tok:
            pass
        # choose aux family
        if verb_tok.endswith('ing') and verb_tok[:-3] in VERBSET_ALL or verb_tok in ('playing', 'reading', 'raining', 'sleeping', 'jumping'):
            aux0 = be_form(kind0, 'past' if ts == 'past' else 'present')
            fam = 'be'
        elif 'can' in full_text.split('practice')[0] and focus is None and False:
            fam = 'do'
        elif re.search(r'\bcan\b', ctx.get('grammar_t', '')):
            aux0, fam = 'Can', 'can'
        elif re.search(r'\bshould\b', ctx.get('grammar_t', '')):
            aux0, fam = 'Should', 'should'
        elif re.search(r'\bmust\b', ctx.get('grammar_t', '')):
            aux0, fam = None, 'must'
        elif ts == 'past':
            aux0, fam = 'Did', 'do'
        elif kind0 == '3sg':
            aux0, fam = 'Does', 'do'
        else:
            aux0, fam = 'Do', 'do'
        if fam == 'be':
            # answer aux: subject of answer sentence
            b1, a1 = parts(1)
            ans_subj = re.findall(r"[A-Za-z']+", b1)
            akind = subject_kind(b1, a1)
            aux1 = be_form(akind, 'past' if ts == 'past' else 'present')
            if neg: aux1 = aux1 + "n't" if aux1 not in ('am',) else 'am not'
            r = complete([aux0, aux1], 'short answer (be)')
            if r: return r
        elif fam in ('do', 'can', 'should'):
            base_aux = {'do': {'1sg': 'do', '2': 'do', '3sg': 'does', 'pl': 'do'}, 'can': {'1sg': 'can', '2': 'can', '3sg': 'can', 'pl': 'can'}, 'should': {'1sg': 'should', '2': 'should', '3sg': 'should', 'pl': 'should'}}[fam]
            b1, a1 = parts(1)
            akind = subject_kind(b1, a1)
            aux1 = base_aux[akind]
            if neg:
                aux1 = {'do': "don't", 'does': "doesn't", 'did': "didn't", 'can': "can't", 'should': "shouldn't"}.get(aux1, aux1 + "n't")
            if fam == 'do' and ts == 'past':
                aux0 = 'Did'; aux1 = "didn't" if neg else 'did'
            r = complete([aux0, aux1], f'short answer ({fam})')
            if r: return r

    # --- modal focus single gap: "A fish ______ swim" (can lesson), "You ______ rest" (should), will
    if len(gaps) == 1 and not verbhint and not slash:
        b, a = parts(0)
        at = re.findall(r"[A-Za-z']+", a)
        nxt = at[0].lower() if at else ''
        gt = ctx.get('grammar_t', '')
        if nxt in VERBSET_ALL:
            if re.search(r'\bcan / can\'t\b', gt):
                # contrast with "but" + impossible action -> can't, else can
                if re.search(r'\bbut\b', t2) and gaps[0] > t2.find('but'):
                    return circle1("can't", ['can', "can't"], 'can contrast')
                return circle1('can', ['can', "can't"], 'can focus')
            if re.search(r'\bshould\b', gt) and not b.strip() == '':
                return circle1('should', ['should', "shouldn't", 'must'], 'should focus')
            if re.search(r'\bwill\b', gt):
                return circle1('will', ['will', "won't"], 'will focus')

    # --- used to family
    if usedto or negusedto:
        base = usedto or negusedto
        if len(gaps) == 1:
            if negusedto:
                r = complete([f"didn't use to {base}"], 'used to negative')
            else:
                r = complete([f'used to {base}'], 'used to')
            if r: return r
        return None

    # --- modal + be slash: "(must / be)" -> must be
    if slash and len(gaps) == 1:
        _opts = [o.strip().lower() for o in slash.split(' / ')]
        if len(_opts) == 2 and _opts[1] == 'be' and _opts[0] in ('must', "can't", 'might', 'could', 'may', 'should'):
            r = complete([f'{_opts[0]} be'], 'modal deduction')
            if r: return r

    # --- question tags: "..., ______ she?"
    if len(gaps) == 1 and re.search(r',\s*' + GAP + r'\s+(I|you|he|she|it|we|they)\?', t2):
        main = t2.split(',')[0].lower()
        tag = None
        if re.search(r"\bwon't\b", main): tag = 'will'
        elif re.search(r"\bdon't\b", main): tag = 'do'
        elif re.search(r"\bdoesn't\b", main): tag = 'does'
        elif re.search(r"\bdidn't\b", main): tag = 'did'
        elif re.search(r"\bcan't\b", main): tag = 'can'
        elif re.search(r"\bisn't\b", main): tag = 'is'
        elif re.search(r"\baren't\b", main): tag = 'are'
        elif re.search(r'\b(am|is|are)\b', main): tag = "aren't" if ' i ' in main else ("isn't" if re.search(r'\b(is)\b', main) else "aren't")
        elif re.search(r'\b(was|were)\b', main): tag = "wasn't" if 'was' in main else "weren't"
        elif re.search(r'\bhas\b', main): tag = "hasn't"
        elif re.search(r'\bhave\b', main): tag = "haven't"
        else:
            _subj = re.findall(r"[A-Za-z']+", main)
            _verbs = [w for w in _subj if w in VERBSET_ALL or past_form(w, past_table) in _subj]
            if re.search(r'\b(did|went|saw|played|was|were|had)\b', main) or any(past_form(v, past_table) == w for v in list(VERBSET_ALL)[:0] for w in []):
                tag = "didn't"
            elif _subj and _subj[0].lower() in ('he', 'she', 'it') or re.search(r'\b(he|she|it)\s+\w+s\b', main):
                tag = "doesn't"
            else:
                tag = "don't"
        if tag:
            _fams = {'will': ['will', "won't"], 'do': ['do', "don't"], 'does': ['does', "doesn't"], 'did': ['did', "didn't"],
                     'can': ['can', "can't"], 'is': ['is', "isn't"], 'are': ['are', "aren't"], "isn't": ['is', "isn't"],
                     "aren't": ['are', "aren't"], "wasn't": ['was', "wasn't"], "weren't": ['were', "weren't"],
                     "hasn't": ['has', "hasn't"], "haven't": ['have', "haven't"], "doesn't": ['does', "doesn't"],
                     "didn't": ['did', "didn't"], "don't": ['do', "don't"]}
            return circle1(tag, _fams.get(tag, [tag]), 'question tag')

    # --- multi-hint per-gap dispatch (one hint per gap)
    if len(gaps) >= 2 and len(gap_hints) == len(gaps) and all(h['verb'] or h['negverb'] for h in gap_hints):
        gt = ctx.get('grammar_t', '')
        fills = []
        ok = True
        comma = t2.find(',')
        for i, h in enumerate(gap_hints):
            b, a = parts(i)
            kind = kind_at(i)
            base = h['verb'] or h['negverb']
            in_if = bool(re.match(r'\s*(if|unless)\b', t2.lower())) and (comma == -1 or gaps[i] < comma)
            if h['negverb']:
                if 'first conditional' in gt and not in_if: fills.append("won't " + base)
                elif 'first conditional' in gt or 'second conditional' in gt: fills.append(("doesn't " if kind == '3sg' else "don't ") + base if 'first conditional' in gt else 'did not ' + base)
                elif tense_at(i) == 'past': fills.append("didn't " + base)
                else: fills.append(("doesn't " if kind == '3sg' else "don't ") + base)
                continue
            if 'first conditional' in gt:
                fills.append(s_form(base) if (in_if and kind == '3sg') else (base if in_if else 'will ' + base))
            elif 'second conditional' in gt:
                if in_if: fills.append('were' if base == 'be' else past_form(base, past_table))
                else: fills.append('would ' + base)
            elif re.search(r'\bwhile\b', b.lower()) and 'while' in t2[:gaps[i] + 40].lower():
                aux = be_form(kind, 'past')
                fills.append(f'{aux} ' + ing_form(base))
            elif any('while' in (t2[:g].lower()) for g in gaps) and False:
                fills.append(past_form(base, past_table))
            elif tense_at(i) in ('past', 'pastcont') or focus == 'past':
                fills.append(past_form(base, past_table))
            elif focus in ('pastperf',):
                fills.append(past_form(base, past_table))
            elif kind == '3sg' and tense_at(i) in (None, 'present'):
                fills.append(s_form(base))
            else:
                fills.append(base)
        if ok and fills:
            # while-clause item: non-continuous gaps in a past narrative default to past
            r = complete(fills, 'per-gap hints')
            if r: return r

    # --- perfect infinitive label (source verb from the quoted sentence)
    if any('perfect infinitive' in l.lower() for l in labels) and len(gaps) == 1:
        src_seg = t.split('→')[0]
        src_base = None
        for w in re.findall(r"[A-Za-z']+", src_seg):
            for v in VERBSET_ALL:
                if past_form(v, past_table) == w.lower(): src_base = v; break
            if src_base: break
        if src_base:
            r = complete(['to have ' + part_form(src_base, part_table)], 'perfect infinitive (label)')
            if r: return r

    # --- verb hint
    if verbhint:
        base = verbhint
        if len(gaps) == 2:
            kind = kind_at(0)
            ts = tense_at(0)
            b0, a0 = parts(0)
            b1, a1 = parts(1)
            between = t2[gaps[0] + len(GAP):gaps[1]].lower()
            after2 = a1.lower()
            cue = None
            _cm = re.search(r"\b(?:Yes|No),?\s+\w+\s+(will|would|did|do|does|can|could|is|are|was|were|have|has|had)\b", t2)
            if _cm: cue = _cm.group(1)
            # passive question: gap2 followed by participle + by, or 'by' right after gap2 phrase
            if re.search(r'\bby\b', after2) and (re.search(r"[A-Za-z']+", after2) and part_form(base, past_table) == re.findall(r"[A-Za-z']+", after2)[0].lower() or True):
                if cue in ('was', 'were'):
                    aux = cue.capitalize() if not b0.strip() else cue
                    r = complete([aux, part_form(base, part_table)], 'passive question')
                    if r: return r
                if cue in ('is', 'are'):
                    aux = cue.capitalize() if not b0.strip() else cue
                    r = complete([aux, part_form(base, part_table)], 'passive question')
                    if r: return r
                return None
            if t2.lower().startswith('how long'):
                aux = 'has' if kind_at(1) == '3sg' else 'have'
                # subject sits between the gaps
                subj = between.strip().split()
                if subj and subj[0] in ('he', 'she', 'it'): aux = 'has'
                if subj and subj[0] in ('i', 'you', 'we', 'they'): aux = 'have'
                r = complete([aux, 'been ' + ing_form(base)], 'how long perfect continuous')
                if r: return r
            if ' ' in base:  # verb phrase hint e.g. 'use to'
                if cue == 'did' or ts == 'past':
                    r = complete(['Did', base], 'verb phrase question')
                    if r: return r
                return None
            if cue == 'will':
                r = complete(['Will', base], 'will question')
                if r: return r
            if cue == 'would':
                r = complete(['Would', base], 'would question')
                if r: return r
            if cue == 'did':
                r = complete(['Did', base], 'did question')
                if r: return r
            if cue in ('was', 'were'):
                r = complete([cue.capitalize(), ing_form(base)], 'past continuous question')
                if r: return r
            if cue in ('is', 'are') and focus == 'goingto':
                r = complete([cue.capitalize(), 'going to ' + base], 'going-to question')
                if r: return r
            if cue in ('have', 'has', 'had'):
                r = complete([cue.capitalize(), part_form(base, part_table)], 'perfect question')
                if r: return r
            if 'ever' in between or 'never' in between or focus in ('perfect', 'pastperf', 'perfcont', 'pastperfcont'):
                if focus in ('pastperf', 'pastperfcont') or (focus == 'past' and 'before' in t2.lower()):
                    aux = 'Had' if not b0.strip() else 'had'
                else:
                    aux = ('Has' if kind == '3sg' else 'Have') if not b0.strip() else ('has' if kind == '3sg' else 'have')
                part = ing_form(base) if 'been' in between else part_form(base, part_table)
                r = complete([aux, part], 'two-gap perfect')
                if r: return r
            if focus == 'goingto' and not b0.strip():
                aux = be_form(kind_at(1), 'present')
                r = complete([aux.capitalize(), 'going to ' + base], 'going-to question')
                if r: return r
            if focus == 'pastcont' and not b0.strip():
                aux = be_form(kind_at(1), 'past')
                r = complete([aux.capitalize(), ing_form(base)], 'past continuous question')
                if r: return r
            return None
        if len(gaps) == 1:
            b, a = parts(0)
            kind = kind_at(0)
            ts = tense_at(0)
            at = re.findall(r"[A-Za-z']+", a)
            bt = re.findall(r"[A-Za-z']+", b)
            nxt = at[0].lower() if at else ''
            prev = bt[-1].lower() if bt else ''
            low_b = b.lower()
            # label-driven completions
            for lab in labels:
                ll = lab.lower()
                if 'future perfect' in ll:
                    r = complete(['will have ' + part_form(base, part_table)], 'future perfect (label)')
                    if r: return r
                if 'passive perfect' in ll:
                    r = complete(['had been ' + part_form(base, part_table)], 'passive perfect (label)')
                    if r: return r
                if 'past perfect continuous' in ll:
                    r = complete(['had been ' + ing_form(base)], 'past perfect continuous (label)')
                    if r: return r
                if 'perfect continuous' in ll:
                    aux = 'has' if kind == '3sg' else 'have'
                    r = complete([f'{aux} been ' + ing_form(base)], 'perfect continuous (label)')
                    if r: return r
                if 'perfect infinitive' in ll:
                    src_seg = t.split('→')[0]
                    src_base = None
                    for w in re.findall(r"[A-Za-z']+", src_seg):
                        for v in VERBSET_ALL:
                            if past_form(v, past_table) == w.lower(): src_base = v; break
                        if src_base: break
                    if src_base:
                        r = complete(['to have ' + part_form(src_base, part_table)], 'perfect infinitive (label)')
                        if r: return r
            # time clauses (when / as soon as / until / before + present, main clause will)
            if re.search(r'\b(when|as soon as|until|before|after)\b[^.]*$', low_b) and (re.search(r"\b(will|won't)\b", t2) or 'time clause' in ctx.get('grammar_t', '').lower()):
                ans = s_form(base) if kind == '3sg' else base
                fam = verb_family(base, past_table, part_table)
                return {'kind': 'circle', 'question': t2, 'options': fam, 'answer': fam.index(ans), 'rule': 'time clause present'}
            # wish / suppose / if only / rather / it's time
            if re.search(r'\bwish\b', low_b):
                if base == 'can': return circle1('could', ['could', 'can', 'would'], 'wish + could')
                if base == 'be': return circle1('were', ['were', 'was', 'are'], 'wish + were')
                ans = past_form(base, past_table)
                fam = verb_family(base, past_table, part_table)
                return {'kind': 'circle', 'question': t2, 'options': fam, 'answer': fam.index(ans), 'rule': 'wish + past'}
            if re.search(r'\bif only\b', t2.lower()):
                r = complete(['had ' + part_form(base, part_table)], 'if only + past perfect')
                if r: return r
            if re.search(r"\bsuppose\b", t2.lower()):
                ans = past_form(base, past_table)
                fam = verb_family(base, past_table, part_table)
                return {'kind': 'circle', 'question': t2, 'options': fam, 'answer': fam.index(ans), 'rule': 'suppose + past'}
            if re.search(r"(rather you|it's time|it is time)", t2.lower()):
                ans = past_form(base, past_table)
                fam = verb_family(base, past_table, part_table)
                return {'kind': 'circle', 'question': t2, 'options': fam, 'answer': fam.index(ans), 'rule': 'rather/time + past'}
            # mandative subjunctive
            if re.search(r'\b(require[sd]?|insist\w*|demand\w*|essential|important|necessary|vital|crucial|suggest\w*|recommend\w*)\b[^.]*\bthat\b', t2.lower()):
                fam = verb_family(base, past_table, part_table)
                return {'kind': 'circle', 'question': t2, 'options': fam, 'answer': fam.index(base), 'rule': 'mandative subjunctive'}
            # gerund after preposition / enjoy-type verbs; infinitive after want-type verbs
            if prev in ('at', 'in', 'on', 'of', 'for', 'about', 'after', 'before', 'without', 'by') or (len(bt) >= 2 and bt[-2].lower() + ' ' + prev == 'good at') or prev in ('enjoy', 'enjoys', 'finish', 'mind', 'keep', 'practise', 'practice'):
                ans = ing_form(base)
                fam = list(dict.fromkeys([base, ing_form(base), past_form(base, past_table)]))
                return {'kind': 'circle', 'question': t2, 'options': fam, 'answer': fam.index(ans), 'rule': 'gerund'}
            if prev in ('want', 'wants', 'decide', 'decided', 'hope', 'hopes', 'plan', 'plans', 'need', 'needs', 'promise', 'promised', 'learn', 'learns'):
                r = complete(['to ' + base], 'infinitive')
                if r: return r
            # inverted conditional: "Had the provision ______ ..."
            if bt and bt[0].lower() == 'had':
                ans = part_form(base, part_table)
                fam = verb_family(base, past_table, part_table)
                return {'kind': 'circle', 'question': t2, 'options': fam, 'answer': fam.index(ans), 'rule': 'had inversion'}
            if 'since' in t2.lower() and (PAST_SIGNALS.search(t2) or re.search(r'\b(opened|arrived|came|began|started|was|were|got|reached|left)\b', t2)):
                r = complete(['had been ' + ing_form(base)], 'past perfect continuous (since)')
                if r: return r
            if 'since' in t2.lower() and focus in ('perfcont', 'pastperfcont'):
                aux = 'had' if focus == 'pastperfcont' else ('has' if kind == '3sg' else 'have')
                r = complete([f'{aux} been ' + ing_form(base)], 'perfect continuous (since)')
                if r: return r
            # past perfect focus / before that day / since + past when-clause
            if focus == 'pastperf' or 'before that day' in t2.lower() or 'before then' in t2.lower():
                r = complete(['had ' + part_form(base, part_table)], 'past perfect')
                if r: return r
            if 'since' in t2.lower() and focus == 'pastperfcont':
                r = complete(['had been ' + ing_form(base)], 'past perfect continuous')
                if r: return r
            if 'since' in t2.lower() and focus == 'perfcont':
                aux = 'has' if kind == '3sg' else 'have'
                r = complete([f'{aux} been ' + ing_form(base)], 'present perfect continuous')
                if r: return r
            # narrow passive: thing subject + agent-verb + past signal / by-phrase / passive lesson
            THINGS = ('castle', 'bridge', 'match', 'cake', 'story', 'bike', 'gym', 'stadium', 'rice', 'cricket', 'ball', 'book', 'film', 'dinner', 'data', 'report', 'provision', 'rule', 'rules', 'trophy', 'photo', 'picture', 'house', 'school', 'park', 'river', 'road', 'garden', 'letter', 'song', 'game', 'team', 'cup', 'medal', 'prize')
            AGENTV = ('build', 'make', 'write', 'steal', 'paint', 'grow', 'play', 'design', 'invent', 'discover', 'collect', 'suspend', 'take', 'catch', 'win', 'break', 'choose', 'give', 'show', 'send', 'teach')
            subj_head = bt[-1].lower() if bt else ''
            if subj_head in THINGS and base in AGENTV and (PAST_SIGNALS.search(t2) or re.search(r'\bby\b', a) or 'passive' in full_text or re.search(r'in \d{4}', t2)):
                aux = be_form(kind, 'past' if (PAST_SIGNALS.search(t2) or re.search(r'in \d{4}', t2)) else 'present')
                r = complete([f'{aux} ' + part_form(base, part_table)], 'passive (narrow)')
                if r: return r
            # aux-only gap: the main verb is printed right after the subject
            verb_after_subj = at[1].lower() if (not b.strip() and len(at) > 1) else None
            if not b.strip() and verb_after_subj and (verb_after_subj == base or verb_after_subj == ing_form(base) or verb_after_subj == part_form(base, past_table)):
                if verb_after_subj == ing_form(base):
                    aux = be_form(kind, 'past' if ts in ('past', 'pastcont') else 'present')
                    fam = ['am', 'is', 'are'] if aux in ('am', 'is', 'are') else ['was', 'were']
                    return {'kind': 'circle', 'question': t2, 'options': fam, 'answer': fam.index(aux), 'rule': 'aux be (question)'}
                if verb_after_subj == part_form(base, past_table) or ts in ('perfect', 'pastperf'):
                    aux = 'had' if ts == 'pastperf' else ('has' if kind == '3sg' else 'have')
                    return {'kind': 'circle', 'question': t2, 'options': ['have', 'has', 'had'], 'answer': ['have', 'has', 'had'].index(aux), 'rule': 'aux have (question)'}
                if ts == 'past': aux = 'did'
                elif kind == '3sg': aux = 'does'
                else: aux = 'do'
                fam = ['do', 'does', 'did']
                return {'kind': 'circle', 'question': t2, 'options': fam, 'answer': fam.index(aux), 'rule': 'aux do (question)'}
            if base == 'be':
                if prev == 'will': ans = 'be'
                elif prev in ('has', 'have', 'had'): ans = 'been'
                elif prev in ('is', 'are', 'am', 'was', 'were'): ans = 'being'
                elif ts in ('perfect', 'pastperf'): ans = 'been'
                else: ans = be_form(kind, 'past' if ts in ('past', 'pastcont') else 'present')
                fam = verb_family('be', past_table, part_table)
                if ' ' not in ans:
                    return {'kind': 'circle', 'question': t2, 'options': fam, 'answer': fam.index(ans) if ans in fam else 0, 'rule': 'be form'}
            if prev in ('has', 'have', 'had'):
                ans = part_form(base, part_table)
                return {'kind': 'circle', 'question': t2, 'options': verb_family(base, past_table, part_table), 'answer': verb_family(base, past_table, part_table).index(ans), 'rule': 'participle after have'}
            if prev in ('is', 'are', 'am', 'was', 'were'):
                ans = ing_form(base)
                fam = list(dict.fromkeys([base, ing_form(base), past_form(base, past_table)]))
                return {'kind': 'circle', 'question': t2, 'options': fam, 'answer': fam.index(ans), 'rule': 'ing after be'}
            if prev in ('will', 'to', 'can', 'must', 'should', 'could', 'would', 'do', 'does', 'did', "don't", "doesn't", "didn't", "can't", 'cannot'):
                fam = verb_family(base, past_table, part_table)
                return {'kind': 'circle', 'question': t2, 'options': fam, 'answer': fam.index(base), 'rule': 'base after aux'}
            if ts == 'past': ans = past_form(base, past_table)
            elif ts in ('perfect', 'pastperf'):
                if 'ever' in t2 or 'never' in t2:
                    aux = 'had' if ts == 'pastperf' else ('has' if kind == '3sg' else 'have')
                    r = complete([f'{aux} ' + part_form(base, part_table)], 'perfect full form')
                    if r: return r
                ans = past_form(base, past_table)
            elif ts in ('continuous', 'pastcont'):
                aux = be_form(kind, 'past' if ts == 'pastcont' else 'present')
                r = complete([f'{aux} ' + ing_form(base)], 'continuous full form')
                if r: return r
            elif ts == 'future':
                r = complete(['will ' + base], 'future full form')
                if r: return r
            elif ts == 'goingto':
                aux = be_form(kind, 'present')
                r = complete([f'{aux} going to {base}'], 'going-to full form')
                if r: return r
            elif kind == '3sg': ans = s_form(base)
            else: ans = base
            fam = verb_family(base, past_table, part_table)
            if ans in fam:
                return {'kind': 'circle', 'question': t2, 'options': fam, 'answer': fam.index(ans), 'rule': 'verb form'}
            return None
        return None

    # --- passive transformation: "Active sentence. → Target ______ by ..."
    if '→' in t2 and len(gaps) == 1 and 'passive' in full_text and not (not parts(0)[1].strip(' .') and (' that ' in t2.split('→')[0] or ' to ' in t2.split('→')[0])):
        src = t2.split('→')[0]
        tgt_b, tgt_a = parts(0)
        src_verbs = [w.lower() for w in re.findall(r"[A-Za-z']+", src) if w.lower() in VERBSET_ALL or past_form(w.lower(), past_table) == w.lower()]
        bases = []
        for w in re.findall(r"[A-Za-z']+", src):
            wl = w.lower()
            if wl in VERBSET_ALL: bases.append(wl)
            else:
                for v in VERBSET_ALL:
                    if past_form(v, past_table) == wl or part_form(v, part_table) == wl: bases.append(v); break
        bases = list(dict.fromkeys(bases))
        if len(bases) == 1:
            base = bases[0]
            past = bool(PAST_SIGNALS.search(t2)) or any(past_form(v, past_table) == w.lower() for v in [base] for w in re.findall(r"[A-Za-z']+", src))
            kind = kind_at(0)
            if re.search(r'\bwill\b', src): aux = 'will be'
            else: aux = be_form(kind, 'past' if past else 'present')
            r = complete([f'{aux} ' + part_form(base, part_table)], 'passive')
            if r: return r
        return None

    # --- pattern-table / reading completion (token alignment with contraction normalisation)
    item_tokens = norm_tokens(t2)
    for cand in ctx.get('pattern_sents', []):
        ct = norm_tokens(cand)
        if len(ct) <= len(item_tokens): continue
        def align(ii, ci, fills):
            if ii == len(item_tokens):
                return fills if ci == len(ct) else None
            if item_tokens[ii] == GAP:
                for k in (1, 2, 3):
                    if ci + k <= len(ct):
                        r = align(ii + 1, ci + k, fills + [' '.join(ct[ci:ci + k])])
                        if r: return r
                return None
            if ci < len(ct) and ct[ci] == item_tokens[ii]:
                return align(ii + 1, ci + 1, fills)
            return None
        fills = align(0, 0, [])
        if fills:
            say = re.sub(r'\s+', ' ', cand).strip()
            return {'kind': 'pattern', 'model': t, 'say': say, 'rule': 'pattern-table completion'}
    return None

# =====================================================================
# GENERATOR — everything below builds the 144 game payloads from the
# printed workbook builders/data in ~/workspace/tools. Nothing is
# invented: every word, sentence, question and answer comes from the
# printed books (lesson data, WB_EXTRA, pattern tables, answer keys).
# =====================================================================
import importlib.util
import json as _json
import os
import zipfile
from datetime import datetime, timedelta, timezone

TOOLS_DIR = os.path.expanduser('~/workspace/tools')
OUT_PACK = os.path.expanduser('~/workspace/your_files/textbook-workbook-games')
REPO_DIR = os.path.dirname(os.path.abspath(__file__))


def load_mod(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(TOOLS_DIR, fname))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


b1 = load_mod('tb_b1', 'build-book1-v2.py')
b2 = load_mod('tb_b2', 'build-book2-v2.py')
b3 = load_mod('tb_b3', 'build-book3-v2.py')
b4 = load_mod('tb_b4', 'build-book4-v2.py')
b5 = load_mod('tb_b5', 'build-book5-v2.py')
d2 = load_mod('tb_d2', 'book2_data.py')

PAST_TABLE, PART_TABLE = {}, {}
for _v, _p in b2.PAST.items():
    PAST_TABLE[_v] = _p
for _n, _vs in b4.VERBS.items():
    for (_pres, _past, _fut, _ex) in _vs:
        PAST_TABLE.setdefault(_pres, _past)
for _v, _p in list(PAST_TABLE.items()):
    PART_TABLE[_v] = IRREG.get(_v, (_p, _p))[1] if _v in IRREG else _p

# ---------- picture library (the app's vocab-images bucket) ----------
IMG_BASE = 'https://hjckfuthcuxedpgiughj.supabase.co/storage/v1/object/public/vocab-images'
IMG_ROOT = os.path.expanduser('~/workspace/your_files/learning-path-v2')
_bank = {}
for _sub in sorted(os.listdir(IMG_ROOT)):
    _d = os.path.join(IMG_ROOT, _sub)
    if not _sub.startswith('images') or not os.path.isdir(_d):
        continue
    for _f in os.listdir(_d):
        _m = re.match(r'v2-w-\d+-(.+)\.png$', _f)
        if _m and '-raw' not in _f:
            _bank.setdefault(_m.group(1), _f)


def hyphen(w):
    return re.sub(r'\s+', '-', str(w).strip().lower())


HAND_IMG = {'goodbye': 'wave'}  # approved in the Round 86 v2 sample NOTE (a waving hand)


def find_image(word=None, slug=None):
    cands = []
    if word and str(word).strip().lower() in HAND_IMG:
        cands.append(HAND_IMG[str(word).strip().lower()])
    if slug:
        cands += [str(slug).replace('_', '-'), str(slug)]
    if word:
        cands += [hyphen(word), str(word).strip().lower()]
    for c in cands:
        if c in _bank:
            return f'{IMG_BASE}/{_bank[c]}'
    return ''


# ---------- emoji (LP origins first, then a small hand map) ----------
_origins = {}
_spec_dir = os.path.expanduser('~/workspace/curriculum-specs-v2')
for _f in sorted(os.listdir(_spec_dir)):
    if not _f.endswith('.json'):
        continue
    _spec = _json.load(open(os.path.join(_spec_dir, _f)))
    for _les in (_spec if isinstance(_spec, list) else _spec.get('lessons', [])):
        for _v in _les.get('vocab', []):
            if _v.get('w'):
                _origins.setdefault(str(_v['w']).lower(), _v.get('e') or '')

EMOJI_EXTRA = {
    'sun': '☀️', 'star': '⭐', 'moon': '🌙', 'flower': '🌸', 'umbrella': '☂️',
    'red': '🟥', 'blue': '🟦', 'yellow': '🟨', 'green': '🟩', 'orange': '🟧',
    'purple': '🟪', 'pink': '🩷', 'brown': '🟫', 'black': '⬛', 'white': '⬜',
    'grey': '🩶', 'gray': '🩶', 'gold': '⭐',
    'goodbye': '🖐️', 'cat': '🐱', 'dog': '🐶', 'duck': '🦆', 'ball': '⚽', 'apple': '🍎',
    'egg': '🥚', 'banana': '🍌', 'book': '📖', 'pen': '🖊️', 'pencil': '✏️',
    'bag': '🎒', 'hat': '🧢', 'cup': '☕', 'fish': '🐟', 'bird': '🐦',
    'tree': '🌳', 'car': '🚗', 'bus': '🚌', 'train': '🚆', 'house': '🏠',
    'school': '🏫', 'rain': '🌧️', 'snow': '❄️', 'sea': '🌊', 'river': '🏞️',
    'cake': '🍰', 'milk': '🥛', 'rice': '🍚', 'bread': '🍞', 'water': '💧',
    'key': '🔑', 'door': '🚪', 'bed': '🛏️', 'chair': '🪑', 'table': '🍽️',
    'clock': '🕐', 'watch': '⌚', 'phone': '📱', 'king': '🤴', 'queen': '👸',
    'lion': '🦁', 'tiger': '🐯', 'elephant': '🐘', 'monkey': '🐵', 'bear': '🐻',
    'rabbit': '🐰', 'frog': '🐸', 'snake': '🐍', 'horse': '🐴', 'cow': '🐄',
    'pig': '🐷', 'sheep': '🐑', 'chicken': '🐔', 'butterfly': '🦋', 'bee': '🐝',
    'ant': '🐜', 'spider': '🕷️', 'whale': '🐳', 'shark': '🦈', 'octopus': '🐙',
    'guitar': '🎸', 'piano': '🎹', 'drum': '🥁', 'violin': '🎻', 'trumpet': '🎺',
    'bike': '🚲', 'boat': '⛵', 'plane': '✈️', 'rocket': '🚀', 'kite': '🪁',
    'bat': '🏏', 'glove': '🧤', 'helmet': '⛑️', 'trophy': '🏆', 'medal': '🏅',
    'eye': '👁️', 'ear': '👂', 'nose': '👃', 'mouth': '👄', 'hair': '💇', 'zebra': '🦓',
    'grapes': '🍇', 'van': '🚐', 'fox': '🦊', 'spectator': '👥', 'inning': '🏏',
    'birth': '🎂', 'council': '🏛️', 'economy': '💰', 'register': '📋', 'tactic': '🎯',
    'format': '📋', 'structure': '🏗️', 'chronology': '🕰️', 'provision': '📜',
    'gist': '💡', 'describe': '🗣️', 'unsporting': '🚫', 'participation': '🙋', 'retire': '👋',
}


def emoji_for(word=None, slug=None):
    for key in ([str(word).lower()] if word else []) + ([str(slug).replace('-', ' ')] if slug else []):
        if key in _origins and _origins[key]:
            return _origins[key]
    for key in ([hyphen(word)] if word else []) + ([str(slug)] if slug else []) + ([str(word).lower()] if word else []):
        if key in EMOJI_EXTRA:
            return EMOJI_EXTRA[key]
    return ''


PIC_STATS = {'real': 0, 'emoji': 0}
GAP_STATS = {'solved': 0, 'unsolved': 0}
RA_STATS = {'circle': 0, 'say': 0}


def pic(word=None, slug=None, emoji_override=None):
    url = find_image(word, slug)
    em = emoji_override if emoji_override is not None else emoji_for(word, slug)
    if url:
        PIC_STATS['real'] += 1
    else:
        PIC_STATS['emoji'] += 1
    return url, em


# ---------- payload constructors ----------
def act(type_, heading, **kw):
    d = {'type': type_, 'heading': heading}
    d.update(kw)
    return d


def wb_word(word, slug, example):
    url, em = pic(word, slug)
    return {'word': word, 'image': url, 'emoji': em, 'example': example or ''}


def match_pair(word, slug, example):
    url, em = pic(word, slug)
    return {'word': word, 'image': url, 'emoji': em, 'example': example or ''}


def pick_option(word, slug=None):
    url, em = pic(word, slug if slug is not None else word)
    return {'word': word, 'image': url, 'emoji': em}


def phonics_card(letter, word, slug):
    url, em = pic(word, slug)
    return {'letter': letter, 'sound': letter.lower(), 'word': word, 'image': url, 'emoji': em}


COLOURS12 = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink', 'brown', 'black', 'white', 'grey', 'gold']
COLOUR_EMOJI = {'red': '🟥', 'blue': '🟦', 'yellow': '🟨', 'green': '🟩', 'orange': '🟧', 'purple': '🟪',
                'pink': '🩷', 'brown': '🟫', 'black': '⬛', 'white': '⬜', 'grey': '🩶', 'gold': '⭐'}


def colour_item(thing, colour, instruction, slug=None):
    url, em = pic(thing, slug if slug is not None else thing)
    if colour in COLOURS12:
        i = COLOURS12.index(colour)
        choices = [COLOURS12[i - 1], colour, COLOURS12[(i + 1) % len(COLOURS12)]]
    else:
        choices = [colour]
    return {'thing': thing, 'colour': colour, 'instruction': instruction, 'emoji': em, 'image': url, 'choices': choices}


def note_say(heading, note, phrases):
    return act('say_it', heading, phrases=phrases, note=note)


def draw_say(heading, prompt_html):
    """Draw activities: the drawing stays on paper; the printed say-aloud
    lines (the prompt's <i> segments) play as speech checks."""
    text = plain(prompt_html)
    action = re.split(r'\sSay:\s|\sSay\s', text)[0].strip()
    phrases = []
    for seg in re.findall(r'<i>(.*?)</i>', prompt_html):
        s = plain(seg)
        if s and '______' not in s and '____________' not in s:
            phrases.append(s)
    action_note = action[0].lower() + action[1:] if action else action
    if phrases:
        note = f'The printed page says: {action_note} Drawing stays on paper — say the words from the page here!'
    else:
        note = f'The printed page says: {action_note} Drawing stays on paper.'
    return note_say(heading, note, phrases)


def make_page(blocks):
    heads = []
    for b in blocks:
        if not heads or heads[-1] != b['heading']:
            heads.append(b['heading'])
    if len(heads) == 1:
        title = heads[0]
    elif len(heads) == 2:
        title = f'{heads[0]} and {heads[1]}'
    else:
        title = ', '.join(heads[:-1]) + ' and ' + heads[-1]
    kind = 'write' if any(b['type'] in ('word_build', 'match', 'phonics', 'circle', 'pattern') for b in blocks) else 'play'
    return {'kind': kind, 'title': title, 'activities': blocks}


def make_ctx(u):
    pats = []
    for (k, s) in u.get('pattern', []):
        for seg in plain(s).split('·'):
            if seg.strip():
                pats.append(seg.strip())
    for para in u.get('read', []):
        for sent in re.split(r'(?<=[.!?])\s+', plain(para)):
            if sent.strip():
                pats.append(sent.strip())
    return {'ex_t': u.get('ex_t', ''), 'grammar_t': u.get('grammar_t', ''),
            'past_table': PAST_TABLE, 'part_table': PART_TABLE, 'pattern_sents': pats}


def gap_activity(items, ctx, heading, fallback_note):
    circles, patterns = [], []
    for it in items:
        if GAP not in plain(it):
            GAP_STATS['unsolved'] += 1
            continue
        r = solve_item(it, ctx)
        if r is None:
            GAP_STATS['unsolved'] += 1
        elif r['kind'] == 'circle':
            GAP_STATS['solved'] += 1
            circles.append({'question': r['question'], 'options': r['options'], 'answer': r['answer']})
        else:
            GAP_STATS['solved'] += 1
            patterns.append({'model': r['model'], 'say': r['say']})
    blocks = []
    if circles:
        blocks.append(act('circle', heading, items=circles))
    if patterns:
        blocks.append(act('pattern', heading, pairs=patterns))
    if not blocks:
        blocks.append(note_say(heading, fallback_note, []))
    return blocks


_STOP = set('is are was were do does did can could will would has have had the a an he she it they we you i his her their our your my in on at to of for with and or but be been being'.split())


def _yesno(qt, opts, sents):
    qw = [w.lower() for w in re.findall(r"[a-z']+", qt) if w.lower() not in _STOP and len(w) > 2]
    best = None
    for s in sents:
        if '?' in s:
            continue  # a question inside the reading is not evidence
        sw = set(w.lower() for w in re.findall(r"[a-z']+", s))
        score = sum(1 for w in qw if w in sw)
        if score >= 2 and (best is None or score > best[0]):
            best = (score, bool(re.search(r"(\bnot\b|n't|\bnever\b|\bcannot\b)", s.lower())))
    if not best:
        return None
    for o in opts:
        ol = o.lower()
        if best[1] and ol.startswith('no'):
            return o
        if not best[1] and ol.startswith('yes'):
            return o
    return None


def read_answer(qs, read_paras, read_t, heading='Read & Answer'):
    reading = ' '.join(plain(p) for p in read_paras)
    sents = [s.strip() for s in re.split(r'(?<=[.!?])\s+', reading) if s.strip()]
    circles, say_qs = [], []
    for q in qs:
        if isinstance(q, (list, tuple)):
            q = {'q': q[0], 'opts': q[1] if len(q) > 1 else None}
        qt = plain(q['q'])
        opts = None
        if q.get('opts'):
            opts = [o.strip() for o in re.split(r'\s*/\s*', plain(q['opts'])) if o.strip()]
        ans = None
        if re.search(r'\b(do|does|did|can|could|will|would|are|is|have|has|should) you\b', qt.lower()):
            opts = None  # a question to the reader is personal: say_it, never a fixed choice
        if opts and len(opts) >= 2:
            present = [o for o in opts if o.lower() in reading.lower()]
            if len(present) == 1:
                ans = present[0]
            elif any(o.lower().startswith(('yes', 'no')) for o in opts):
                ans = _yesno(qt, opts, sents)
        if ans is not None:
            circles.append({'question': qt, 'options': opts, 'answer': opts.index(ans)})
            RA_STATS['circle'] += 1
        else:
            say_qs.append(qt)
            RA_STATS['say'] += 1
    blocks = []
    if circles:
        blocks.append(act('circle', heading, items=circles))
    if say_qs:
        note = f'Read "{read_t}" in your textbook again, then read each question aloud and say your answer in a full sentence.'
        blocks.append(note_say(heading, note, say_qs))
    if not blocks:
        blocks.append(note_say(heading, f'Read "{read_t}" in your textbook again, then answer the questions aloud in full sentences.', []))
    return blocks


def make_row(book, n, book_title, part_title, lesson_title, goal, finish_line, finish_sub, pages):
    code = f'B{book}-L{n:02d}'
    created = datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=book * 1000 + n)
    return {
        'id': 'e4000000-0000-4000-8000-' + str(book * 1000 + n).zfill(12),
        'title': f'Textbook Workbook — {lesson_title}',
        'description': (f'The playable workbook for Lesson {n} ({code}) of Book {book}: {book_title} — {part_title}, '
                        'from the printed English for Cricket textbook workbook. No printing needed — play the pages!'),
        'game_url': '',
        'thumbnail_url': None,
        'engine': 'workbook',
        'stage_id': None,
        'module_id': None,
        'lesson_id': None,
        'category_id': None,
        'is_published': True,
        'created_at': created.strftime('%Y-%m-%dT%H:%M:%S.000Z'),
        'data': {
            'version': 1, 'source': 'textbook', 'book': book, 'lesson': n,
            'code': code, 'workbookCode': f'B{book}-WB-L{n:02d}',
            'bookTitle': book_title, 'partTitle': part_title, 'lessonTitle': lesson_title,
            'goal': goal, 'scene': '', 'finishLine': finish_line, 'finishSub': finish_sub,
            'pages': pages,
        },
    }


# ================= BOOK 1 =================
def build_book1():
    rows = []
    for L in b1.LESSONS:
        n = L['n']
        words = L.get('words') or []
        img_words = [(w, s) for w, s in words if s]
        ex = b1.WB_EXTRA.get(n, {})
        remember = {w: e for w, e in (L.get('remember') or {}).get('words', [])}
        part = 'Starter A' if L.get('part') == 'A' else 'Starter B'
        goal = ' · '.join(L.get('learn') or [])
        finish = f'Well done! You finished Lesson {n} — {L["title"]}!'
        sub = 'Colour the star. Say one thing you can do now!'
        pages = []

        def trace_w(ws, count=3):
            return act('word_build', 'Trace It', words=[wb_word(w, dict(words).get(w), remember.get(w, '')) for w in ws[:count]])

        if L.get('special') == 'alpha':
            def alpha_page(chunk):
                return make_page([act('phonics', 'Trace It', cards=[phonics_card(Lg, w, s) for Lg, w, s in chunk])])
            p3blocks = [act('phonics', 'Trace It', cards=[phonics_card(Lg, w, s) for Lg, w, s in b1.ALPHA[19:]]),
                        act('circle', 'Circle It', items=[
                            {'question': 'Circle every letter B in the line: A B C S D B E S F G', 'options': ['B', 'A', 'S'], 'answer': 0},
                            {'question': 'Circle every letter S in the line: A B C S D B E S F G', 'options': ['S', 'B', 'D'], 'answer': 0}])]
            pages = [alpha_page(b1.ALPHA[:10]), alpha_page(b1.ALPHA[10:19]), make_page(p3blocks)]
        elif L.get('letters'):
            blend = L['sound']['blend']
            p1 = make_page([
                act('phonics', 'Trace It', cards=[phonics_card(Lg, w, s) for Lg, w, s in L['letters']]),
                note_say('Blend & Read', 'Say the sounds, then read the word fast!', list(blend)),
            ])
            hear = lambda target, opts: {'question': f'Your teacher says a word. Circle it: {target}.', 'options': opts, 'answer': opts.index(target)}
            p2 = make_page([
                act('circle', 'Circle It', items=[
                    hear(blend[0], [blend[1], blend[0], blend[2]]),
                    hear(blend[3], [blend[3], blend[4] if len(blend) > 4 else blend[1], blend[2]])]),
                act('word_build', 'Trace It', words=[wb_word(w, w, remember.get(w, '')) for w in blend[:2]]),
            ])
            pages = [p1, p2]
        elif L.get('special') == 'colours':
            sw = L['swatches']
            names = [nm for nm, bg, fg in sw]
            sw_items = []
            for i, nm in enumerate(names):
                choices = [names[i], names[(i + 1) % len(names)], names[(i - 1) % len(names)]]
                sw_items.append({'thing': nm, 'colour': nm, 'instruction': f'Colour the box {nm}.',
                                 'emoji': COLOUR_EMOJI.get(nm, '🎨'), 'image': '', 'choices': choices})
                PIC_STATS['emoji'] += 1
            p1 = make_page([
                act('colour_it', 'Colour It', items=sw_items),
                act('word_build', 'Trace It', words=[wb_word(w, w, remember.get(w, '')) for w in names[:3]]),
            ])
            col = ex.get('colour') or [('flower', f'Colour the flower {names[0]}.'), ('umbrella', 'Colour it with all the colours!')]
            p2blocks = []
            citems, extras = [], []
            for slug, ins in col:
                m = re.match(r'Colour the .+? (\w+)\.$', ins)
                if m and m.group(1) in COLOURS12:
                    citems.append(colour_item(slug, m.group(1), ins, slug))
                else:
                    extras.append(note_say('Colour It', f'The printed page says: {ins[0].lower() + ins[1:]} Colouring stays on paper.', []))
            if citems:
                p2blocks.append(act('colour_it', 'Colour It', items=citems))
            p2blocks += extras
            p2blocks.append(draw_say('Draw It', f'Draw a ball. Colour it <b>{names[1]}</b>. Say: <i>The ball is {names[1]}.</i>'))
            pages = [p1, make_page(p2blocks)]
        elif L.get('special') == 'numbers':
            nums = L['nums']
            num_words = [w for k, w in nums]
            p1 = make_page([
                act('word_build', 'Trace It', words=[wb_word(w, w, remember.get(w, '')) for w in num_words[:2]]),
                note_say('Trace It', 'The printed page says: trace the numbers and count aloud. Writing stays on paper — count here!', list(num_words)),
            ])
            if n == 8:
                rows_c = [('ball', 3, [2, 3, 4]), ('duck', 5, [4, 5, 6]), ('star', 2, [1, 2, 3]), ('apple', 4, [3, 4, 5])]
            elif n == 9:
                rows_c = [('apple', 6, [5, 6, 7]), ('egg', 3, [2, 3, 4]), ('banana', 4, [4, 5, 6])]
            elif n == 26:
                rows_c = [('star', 8, []), ('ball', 11, [])]
            else:
                rows_c = [('star', 12, []), ('ball', 15, [])]
            citems = []
            for slug, k, choices in rows_c:
                opts = [str(c) for c in choices] if choices else [str(k - 1), str(k), str(k + 1)]
                em = emoji_for(slug, slug) or '✦'
                citems.append({'question': f'How many? {" ".join([em] * k)}', 'options': opts, 'answer': opts.index(str(k))})
            p2 = make_page([
                act('circle', 'Count & Circle', items=citems),
                draw_say('Draw It', f'Draw {num_words[0]} stars. Count them aloud!'),
            ])
            pages = [p1, p2]
        elif n == 28:
            days = [w for w, s in words]
            p1 = make_page([
                trace_w(days, 3),
                act('circle', 'Circle It', items=[{'question': 'Circle the day we play cricket in our song.', 'options': ['Monday', 'Friday', 'Sunday'], 'answer': 2}]),
            ])
            p2 = make_page([
                act('pattern', 'Put Them in Order', pairs=[{'model': 'Days of the week — in order!', 'say': 'Monday Tuesday Wednesday Thursday Friday Saturday Sunday'}]),
                draw_say('Draw It', 'Draw what you do on <b>Sunday</b>. Say: <i>Today is Sunday!</i>'),
            ])
            pages = [p1, p2]
        elif n in (29, 30):
            months = [w for w, s in words]
            first = 'January' if n == 29 else 'July'
            opts = ['June', 'January', 'March'] if n == 29 else ['July', 'May', 'December']
            p1 = make_page([
                trace_w(months, 3),
                act('circle', 'Circle It', items=[{'question': 'Circle the first month in this lesson.', 'options': opts, 'answer': opts.index(first)}]),
            ])
            p2 = make_page([
                note_say('Write It', 'The printed page says: copy the sentence "My birthday is in ______." and write your month. Writing stays on paper — say the sentence with your month here!', []),
                draw_say('Draw It', 'Draw your birthday month. Say: <i>My birthday is in ____________.</i>'),
            ])
            pages = [p1, p2]
        elif L.get('pattern'):
            sent = L['pattern']
            first_plain = plain(sent[0][1]).split('·')[0].strip()
            if ' is ' in first_plain:
                wrong = first_plain.replace(' is ', ' are ', 1)
            elif ' am ' in first_plain:
                wrong = first_plain.replace(' am ', ' is ', 1)
            elif ' can ' in first_plain:
                wrong = first_plain.replace(' can ', ' cans ', 1)
            elif ' like ' in first_plain:
                wrong = first_plain.replace(' like ', ' likes ', 1)
            else:
                wrong = first_plain + ' not'
            forms = []
            for k, s in sent:
                segs = [x.strip() for x in plain(s).split('·') if x.strip()]
                if k in ('pos', 'neg', 'q'):
                    forms.append(segs[0])
                elif k == 'ans':
                    forms.extend(segs)
            p1 = make_page([
                trace_w([w for w, s in words], 3),
                act('circle', 'Circle It', items=[{'question': 'Circle the correct sentence.', 'options': [wrong, first_plain], 'answer': 1}]),
            ])
            p2 = make_page([
                act('pattern', 'Write It', pairs=[{'model': first_plain, 'say': first_plain}]),
                note_say('Draw It', 'The printed page says: draw the picture for your sentence. Drawing stays on paper — say all four forms here!', forms),
            ])
            pages = [p1, p2]
        elif n == 37:
            qs = [
                {'question': 'Can Mira catch?', 'options': ['Yes, she can.', "No, she can't."], 'answer': 0},
                {'question': 'Is the ball blue?', 'options': ['Yes, it is.', 'No, it is not.'], 'answer': 1},
                {'question': 'Are Ken and Mira friends?', 'options': ['Yes, they are.', 'No, they are not.'], 'answer': 0},
            ]
            p1 = make_page([
                act('circle', 'Answer the Questions', items=qs),
                act('word_build', 'Trace It', words=[wb_word(w, w, remember.get(w, '')) for w in ['catch', 'run', 'team']]),
            ])
            p2 = make_page([
                draw_say('Draw It', 'Draw <b>your</b> team. Say: <i>This is my team!</i>'),
                act('pattern', 'Write It', pairs=[{'model': 'Well done, team!', 'say': 'Well done, team!'}]),
            ])
            p3 = make_page([draw_say('Draw It', 'Draw the story: Ken and Mira play cricket. Draw the ball!')])
            pages = [p1, p2, p3]
        else:
            p1blocks = [trace_w([w for w, s in words], 3)]
            if len(img_words) >= 3:
                tw, ts = img_words[0]
                cards = [(tw, ts)] + img_words[1:3]
                if n % 2 == 1:
                    cards = cards[1:] + cards[:1]
                opts = [pick_option(s.replace('-', ' ') if s else w, s) for w, s in cards]
                p1blocks.append(act('pick_picture', 'Circle It', prompt=f'Circle the {tw}.', options=opts,
                                    answer=[w for w, s in cards].index(tw)))
            elif len(words) >= 3:
                opts = [words[1][0], words[0][0], words[2][0]]
                p1blocks.append(act('circle', 'Circle It', items=[{'question': f'Circle the word: {words[0][0]}.', 'options': opts, 'answer': 1}]))
            p2blocks = []
            if ex.get('match_sound'):
                p2blocks.append(act('match', 'Match It', pairs=[
                    match_pair('cat', 'cat', 'miaow!'), match_pair('dog', 'dog', 'woof!'), match_pair('duck', 'duck', 'quack!')]))
            elif len(img_words) >= 4:
                p2blocks.append(act('match', 'Match It', pairs=[match_pair(w, s, remember.get(w, '')) for w, s in img_words[:4]]))
            if ex.get('colour'):
                citems = []
                for slug, ins in ex['colour']:
                    m = re.match(r'Colour the .+? (\w+)\.$', ins)
                    if m and m.group(1) in COLOURS12:
                        citems.append(colour_item(slug, m.group(1), ins, slug))
                if citems:
                    p2blocks.append(act('colour_it', 'Colour It', items=citems))
            if ex.get('count'):
                citems = []
                for slug, k, choices in ex['count']:
                    opts = [str(c) for c in choices] if choices else [str(k - 1), str(k), str(k + 1)]
                    em = emoji_for(slug, slug) or '✦'
                    citems.append({'question': f'How many? {" ".join([em] * k)}', 'options': opts, 'answer': opts.index(str(k))})
                p2blocks.append(act('circle', 'Count & Circle', items=citems))
            if ex.get('copy'):
                p2blocks.append(act('pattern', 'Write It', pairs=[{'model': ex['copy'], 'say': ex['copy']}]))
            if ex.get('draw'):
                p2blocks.append(draw_say('Draw It', ex['draw']))
            if not p2blocks:
                p2blocks.append(draw_say('Draw It', 'Draw your favourite word from this lesson. Say it in English!'))
            pages = [make_page(p1blocks), make_page(p2blocks)]
        rows.append(make_row(1, n, 'The Foundation', part, L['title'], goal, finish, sub, pages))
    return rows


# ================= BOOK 2 =================
def build_book2():
    rows = []
    for L in b2.LESSONS:
        n = L['n']
        ctx = make_ctx(L)
        words = L['words']
        p1 = make_page([
            act('word_build', 'Trace & Write', words=[wb_word(w, s, e) for w, s, e in words[:3]]),
            act('match', 'Match It', pairs=[match_pair(w, s, e) for w, s, e in words[:4]]),
        ])
        p2blocks = gap_activity(L.get('ex', [])[:4], ctx, 'Fill the Gap',
                                'The printed page says: complete each sentence. Use the pattern from your textbook lesson to help you. Writing stays on paper — read the sentences aloud here!')
        p2blocks += read_answer(L.get('qs', []), L.get('read', []), L.get('read_t', ''))
        p2 = make_page(p2blocks)
        p3 = make_page([
            note_say('Write It', f"The printed page says: {plain(L['write'])} Writing stays on paper.", []),
            note_say('Draw, Say & Finish',
                     'The printed page says: draw a picture for this lesson — use the reading story or your own life. Label it with English words! Drawing stays on paper — say your three "I can" sentences here!',
                     [plain(c) for c in L.get('check', [])]),
        ])
        rows.append(make_row(2, n, 'The Rookie', b2.LEVEL_NAME[L['level']], L['title'], L['sub'],
                             f'Well done! You finished Lesson {n} — {L["title"]}!',
                             f'Colour the star. Say your three "I can" sentences: {plain(L["check"][0])}', [p1, p2, p3]))
    return rows


# ================= BOOK 3 =================
def build_book3():
    rows = []
    for L in b3.LESSONS:
        n = L['n']
        ctx = make_ctx(L)
        words = L['words']
        p1blocks = [act('word_build', 'Word Building', words=[wb_word(w, s, e) for w, s, e in words[:5]])]
        p1blocks += gap_activity(L.get('ex', [])[:4], ctx, 'Pattern Practice',
                                 'The printed page says: complete each sentence. Use the Pattern table in your textbook lesson to help you. Writing stays on paper — read the sentences aloud here!')
        p2blocks = read_answer(L.get('qs', [])[:3], L.get('read', []), L.get('read_t', ''))
        w25 = ', '.join(w for w, s, e in words[2:5])
        p2blocks.append(note_say('Sentence Writing',
                                 f"Write three sentences of your own using this lesson's pattern. Use these words: {w25}. Writing stays on paper.", []))
        forms = []
        for k, s in L.get('pattern', []):
            segs = [x.strip() for x in plain(s).split('·') if x.strip()]
            if k in ('pos', 'neg', 'q'):
                if segs:
                    forms.append(segs[0])
            elif k == 'ans':
                forms.extend(segs)
        p3 = make_page([
            note_say('Write It — Review Challenge', f"The printed page says: {plain(L['write'])} Writing stays on paper.", []),
            note_say('Champion Challenge',
                     "Say this lesson's pattern in every form — affirmative, negative, question and short answer — without looking at the book. Then teach it to someone at home!",
                     forms),
        ])
        rows.append(make_row(3, n, 'The Player', L['level_name'], L['title'], L['sub'],
                             f'Well done! You finished Lesson {n} — {L["title"]}!',
                             f"Colour the star. Say one thing you can do now: {plain(L['check'][0])}",
                             [make_page(p1blocks), make_page(p2blocks), p3]))
    return rows


# ================= BOOK 4 =================
def build_book4():
    rows = []
    for L in b4.LESSONS:
        n = L['n']
        words = L['words']
        p1blocks = [act('match', 'Match the Words', pairs=[match_pair(w, s, e) for w, s, e in words])]
        rowsd = {k: s for k, s in b4.pattern_rows(L)}
        def first_seg(txt):
            segs = [x.strip() for x in plain(txt).split('·') if x.strip()]
            return segs[0] if segs else ''
        pos, neg, que, ans = first_seg(rowsd.get('pos', '')), first_seg(rowsd.get('neg', '')), first_seg(rowsd.get('q', '')), first_seg(rowsd.get('ans', ''))
        pairs = []
        if pos and neg:
            pairs.append({'model': pos, 'say': neg})
        if pos and que:
            pairs.append({'model': pos, 'say': que})
        if que and ans:
            pairs.append({'model': que, 'say': ans})
        if pairs:
            p1blocks.append(act('pattern', 'Pattern Practice', pairs=pairs))
        p2blocks = read_answer([{'q': q, 'opts': None} for q in L.get('qs', [])], L.get('read', []), L.get('read_t', ''))
        p2blocks.append(note_say('Write It', f"The printed page says: {plain(L['write'])} Writing stays on paper.", []))
        p3blocks = [act('word_build', 'Review & Challenge', words=[wb_word(w, s, e) for w, s, e in words[:4]])]
        rw = b4.returning_words(L)
        if rw:
            exmap = {}
            for LL in b4.LESSONS:
                for (w, s, e) in LL['words']:
                    exmap.setdefault(w, (s, e))
            p3blocks.append(act('word_cards', 'Words I Know',
                                words=[wb_word(w, exmap.get(w, (w, ''))[0], exmap.get(w, (w, ''))[1]) for w in rw]))
        p3blocks.append(note_say('Check Yourself',
                                 'Check yourself — the promise of this lesson. Tick each box on the page when you can say it.',
                                 [plain(c) for c in L.get('check', [])]))
        rows.append(make_row(4, n, 'The Strategist', L['level'], L['title'], L['sub'],
                             f'Well done! You finished Lesson {n} — {L["title"]}!',
                             'Colour the star. Then tell someone at home one thing this lesson taught you.',
                             [make_page(p1blocks), make_page(p2blocks), make_page(p3blocks)]))
    return rows


# ================= BOOK 5 =================
def build_book5():
    rows = []
    for L in b5.LESSONS:
        n = L['n']
        if L.get('kind') == 'test':
            pages = [
                make_page([
                    note_say('Timed test — preparation',
                             'The printed page says: before the test: (1) list the five structures you expect this level to test; (2) set your time budget per section; (3) write your personal error suspects at the top of your paper. This stays on paper.', []),
                    note_say('The test — record',
                             'The printed page says: write your section scores and times here. This stays on paper.', []),
                ]),
                make_page([
                    note_say('Error log',
                             'The printed page says: log every error from the test: the item, your answer, the correct form, and the rule. This stays on paper — in your error log.', []),
                    note_say('Repair task — challenge',
                             'The printed page says: write five new sentences, each deliberately using a structure you got wrong. Then write one paragraph explaining the single highest-value repair you will make before the next level. Writing stays on paper.', []),
                ]),
            ]
            rows.append(make_row(5, n, 'The Captain', L['lname'], L['title'], L.get('sub', ''),
                                 f'Lesson {n} complete — Level {L["level"]} reviewed and tested.',
                                 'Enter your result in your portfolio.', pages))
            continue
        u = L['unit']
        ctx = make_ctx(u)
        p1blocks = [act('match', 'Vocabulary & Register', pairs=[match_pair(w, s, e) for w, s, e in u['words']])]
        p1blocks += read_answer(u.get('qs', [])[:3], u.get('read', []), u.get('read_t', ''))
        p2blocks = gap_activity(u.get('ex', [])[:3], ctx, 'Pattern — gap-fill and transformation',
                                'The printed page says: complete each item using the pattern from your textbook lesson. Writing stays on paper — read the sentences aloud here!')
        p2blocks += gap_activity(u.get('ex', [])[3:], ctx, 'Pattern — extend and transform',
                                 'The printed page says: extend and transform each sentence using the pattern from your textbook lesson. Writing stays on paper — read the sentences aloud here!')
        p3blocks = [note_say('Writing — the set task', f"The printed page says: {plain(u['write'])} Writing stays on paper — in your portfolio.", [])]
        prev = [x for x in b5.LESSONS if x['n'] < n and x.get('kind') == 'unit']
        rw = []
        for x in prev[-2:]:
            for (w, s, e) in x['unit']['words'][:4]:
                rw.append((w, s, e))
        if rw:
            p3blocks.append(act('word_cards', 'Review & Challenge', words=[wb_word(w, s, e) for w, s, e in rw]))
        else:
            # Lesson 1 has no returning words yet — the printed page
            # still carries the Review & Challenge writing task
            # (words line is an em dash); writing stays on paper.
            p3blocks.append(note_say('Review & Challenge',
                "The printed page says: write a short paragraph that answers the final reading question, uses two returning words, and uses this lesson's pattern at least twice. Writing stays on paper — say the words from the page here!", []))
        rows.append(make_row(5, n, 'The Captain', L['lname'], L['title'], u.get('sub', ''),
                             f'Lesson {n} complete — {L["title"]}.',
                             'Say, in one sentence, the most valuable thing this lesson added to your English.',
                             [make_page(p1blocks), make_page(p2blocks), make_page(p3blocks)]))
    return rows


# ================= MAIN =================
def sql_str(v):
    if v is None:
        return 'null'
    return "'" + str(v).replace("'", "''") + "'"


def row_sql(row):
    return (
        f"delete from public.games where id = {sql_str(row['id'])};\n"
        f"insert into public.games (id, title, description, game_url, thumbnail_url, engine, data, stage_id, module_id, lesson_id, category_id, is_published, created_at) "
        f"values ({sql_str(row['id'])}, {sql_str(row['title'])}, {sql_str(row['description'])}, '', null, 'workbook', "
        f"{sql_str(_json.dumps(row['data'], ensure_ascii=False))}::jsonb, null, null, null, null, true, {sql_str(row['created_at'])});\n"
    )


def main():
    books = {1: build_book1(), 2: build_book2(), 3: build_book3(), 4: build_book4(), 5: build_book5()}
    all_rows = []
    for bn in (1, 2, 3, 4, 5):
        all_rows.extend(books[bn])
    assert len(all_rows) == 144, len(all_rows)

    # JSON (repo copy — the mock rigs and validator read this)
    with open(os.path.join(REPO_DIR, 'textbook-workbook-games.json'), 'w') as f:
        _json.dump(all_rows, f, ensure_ascii=False, indent=1)

    # SQL pack, split at ~65 KB per file (Supabase SQL editor limit)
    os.makedirs(OUT_PACK, exist_ok=True)
    for old in os.listdir(OUT_PACK):
        if old.endswith('.sql') or old in ('CONTENTS.txt',):
            os.remove(os.path.join(OUT_PACK, old))
    pack_files = []
    for bn in (1, 2, 3, 4, 5):
        part, buf = 1, ''
        header = (f"-- Textbook Workbook Games — Book {bn} (playable textbook workbook games, Round 87)\n"
                  f"-- Delete-by-id + insert: safe to re-run. No order_index (the games table has none).\n"
                  f"-- Run AFTER uploading dist v89. Parts in order.\n")
        buf = header
        for row in books[bn]:
            stmt = row_sql(row)
            if len(buf.encode('utf-8')) + len(stmt.encode('utf-8')) > 65000 and buf != header:
                fn = f'TextbookWorkbookGames-Book{bn}-Part{part}.sql'
                with open(os.path.join(OUT_PACK, fn), 'w') as f:
                    f.write(buf)
                pack_files.append(fn)
                part += 1
                buf = header
            buf += stmt
        fn = f'TextbookWorkbookGames-Book{bn}-Part{part}.sql'
        with open(os.path.join(OUT_PACK, fn), 'w') as f:
            f.write(buf)
        pack_files.append(fn)

    _slots = {'image': 0, 'emoji': 0, 'bare': 0}
    for r in all_rows:
        for p in r['data']['pages']:
            for a in p['activities']:
                _ss = []
                if a['type'] in ('word_build', 'word_cards'):
                    _ss = a['words']
                elif a['type'] == 'match':
                    _ss = a['pairs']
                elif a['type'] == 'pick_picture':
                    _ss = a['options']
                elif a['type'] == 'phonics':
                    _ss = a['cards']
                elif a['type'] == 'colour_it':
                    _ss = a['items']
                for s in _ss:
                    if s.get('image'):
                        _slots['image'] += 1
                    elif s.get('emoji'):
                        _slots['emoji'] += 1
                    else:
                        _slots['bare'] += 1
    zero_check = [r['data']['code'] for r in all_rows
                  if sum(1 for p in r['data']['pages'] for a in p['activities']
                         if a['type'] in ('word_build', 'match', 'circle', 'pattern', 'phonics', 'pick_picture', 'colour_it')) == 0]
    contents = f"""TEXTBOOK WORKBOOK GAMES — INSTALL PACK (Round 87)
================================================
Playable versions of all 144 printed textbook workbook lessons for
English for Cricket (engine 'workbook', payload source 'textbook').

INSTALL ORDER
  1. Upload dist-v89.zip to the site (the usual safe update: it adds
     colour_it pictures and the new Arcade hub + collapsible listings).
  2. Run these SQL files in the Supabase SQL editor, in order:
{chr(10).join('       ' + fn for fn in pack_files)}
     Every file is delete-by-id + insert and safe to re-run.
     B1-L01 replaces the Round 86 sample row in place (same id), now
     with its real pictures wired in.

COUNTS
  Book 1 (The Foundation):   37 games
  Book 2 (The Rookie):       24 games
  Book 3 (The Player):       24 games
  Book 4 (The Strategist):   32 games
  Book 5 (The Captain):      27 games (24 unit lessons + 3 level tests)
  Total:                     144 games

PICTURE COVERAGE
  {_slots['image']} picture slots carry a real picture from the app's own
  vocab-images library; {_slots['emoji']} slots show an emoji; {_slots['bare']} slots
  (mostly abstract Book 4/5 words) show the player's cricket-ball
  fallback. The player falls back automatically if a file ever fails.

ACTIVITY CONVERSIONS (printed -> playable)
  Trace It / Trace & Write / Word Building -> word_build (letter tiles)
  Match It / Match the Words / Vocabulary & Register -> match
    (tap the picture, then tap its word; where the print matches to an
    example sentence or a sound, that text is the pair's spoken example)
  Circle It (pictures) -> pick_picture
  Circle It (words / sentences) -> circle
  Colour It -> colour_it (now with pictures where the library has them;
    the three choices are the correct colour and its two neighbours on
    the book's colour ring)
  Count & Circle -> circle (the counted pictures are shown as emoji in
    the question; choices are the printed choices, or count-1/count/
    count+1 where the print says "Write it")
  Put Them in Order -> pattern (say the days in order)
  Copy the sentence / Write It (copy) -> pattern (model = say = the
    printed sentence)
  Fill the Gap / Pattern Practice / Pattern gap-fill -> circle and/or
    pattern: every item whose answer is fixed by the printed hint, the
    lesson's own pattern table, or standard agreement was derived
    mechanically and checked ({GAP_STATS['solved']} of {GAP_STATS['solved'] + GAP_STATS['unsolved']} gap items);
    the rest are open writing and stay on paper (see below).
  Read & Answer -> circle where the printed options have exactly one
    answer supported by the reading text ({RA_STATS['circle']} questions);
    every other question -> say_it (read it aloud, answer in a full
    sentence) ({RA_STATS['say']} questions).
  Pattern Practice — every form (Book 4) -> pattern pairs built from
    the book's own answer-key models (positive->negative, positive->
    question, question->short answer). Item 4 (own sentences) stays on
    paper.
  Say-aloud lines / Draw, Say & Finish / Champion Challenge -> say_it
    speech checks at 70% (nothing is stored).
  Blend & Read -> say_it (the printed blend words).

DRAWING AND WRITING — THE STATED EXCEPTION
  Drawing has no playable twin. Every printed Draw activity becomes a
  say_it block on the game page whose note says the drawing stays on
  paper and whose speech checks are the page's own printed say-aloud
  lines. Pure writing tasks (Write It, Sentence Writing, the Book 5
  set task, and the Book 5 test lessons) likewise become note-only
  say_it blocks quoting the printed task, marked "Writing stays on
  paper". Sub-tasks inside otherwise-played activities (for example
  "write each word in a short phrase", Book 4's own-sentences item,
  Book 5's own-sentence register practice) stay on paper too; the
  activity's playable part carries the game.
  Book 1 Lesson 18's "circle every B and every S" becomes two circle
  items (one per letter) over the same printed line.
  Book 5's three level-test lessons are preparation/record/review
  tasks: all four printed activities are note-only, by design.
  Games with no tappable check at all (Book 5 tests only):
  {', '.join(zero_check) if zero_check else 'none'}.

PRIVACY
  No migration, no new tables, no new stored child data. Speech checks
  store nothing (same as Rounds 83/86). Points: +3 stars once per game
  via the existing awardWorkbookPractice path.
"""
    with open(os.path.join(OUT_PACK, 'CONTENTS.txt'), 'w') as f:
        f.write(contents)
    zip_path = os.path.expanduser('~/workspace/your_files/textbook-workbook-games.zip')
    if os.path.exists(zip_path):
        os.remove(zip_path)
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
        for fn in pack_files + ['CONTENTS.txt']:
            z.write(os.path.join(OUT_PACK, fn), fn)

    print('rows:', {bn: len(books[bn]) for bn in books})
    print('pictures:', PIC_STATS)
    print('gap items:', GAP_STATS)
    print('read&answer:', RA_STATS)
    print('zero-check games:', zero_check)
    print('pack files:', pack_files)


if __name__ == '__main__':
    main()
