// The Discipleship Self-Assessment question bank, split into Priest and King
// (PRD 38.26; wording from "DaveUp Website Page Update", Nov 21, 2026, section 15,
// which replaces PRD Appendix A where they differ). The earlier wording is kept
// in questions-legacy.ts for traceability.
// Test A: the discipler's version, answered about one disciple.
// Test B: the disciple's version, answered about oneself.
// Item ID = area number + version letter + item number, e.g. "4B-1".

export type TestVersion = "A" | "B";

/**
 * Priest: spiritual authority, the walk with God. King: marketplace impact, work
 * and community. Shown publicly and on main screens as Faith and Impact.
 */
export type Domain = "priest" | "king";

export const DOMAINS: readonly Domain[] = ["priest", "king"];

/** Words for each domain: `name` on results detail and question tags, `plain` everywhere else. */
export const DOMAIN_LABEL: Record<Domain, { name: string; plain: string }> = {
  priest: { name: "Priest", plain: "Faith" },
  king: { name: "King", plain: "Impact" },
};

export interface Question {
  id: string;
  area: number;
  version: TestVersion;
  index: number; // 1..5 within the area and version
  domain: Domain;
  text: string;
}

/**
 * Priest items in each area; they come first, the rest are King. Areas 1, 5 and 7
 * have two, area 11 has none (all King), every other area three. 30 and 30 per test.
 */
export function priestItemCount(area: number): number {
  if (area === 11) return 0;
  return area === 1 || area === 5 || area === 7 ? 2 : 3;
}

export function domainOf(area: number, index: number): Domain {
  return index <= priestItemCount(area) ? "priest" : "king";
}

const RAW: Record<string, string> = {
  // Area 1: Sure Calling. Items 1-2 Priest, 3-5 King.
  "1A-1": "The person has willingly participated in discipleship meetings without me having to repeatedly force or pressure them.",
  "1A-2": "The person has voluntarily sacrificed time, comfort, money, opportunities, or personal preferences in order to follow Christ or fulfill Kingdom responsibilities.",
  "1A-3": "This person has taken deliberate steps to understand and pursue the work or assignment they believe God has called them to.",
  "1A-4": "This person has invested time in building a skill, qualification or craft that serves their calling.",
  "1A-5": "In the last month, I can identify a career, study or business decision where this person chose their calling over an easier or more profitable option.",
  "1B-1": "I have voluntarily maintained my discipleship meetings and spiritual commitments without repeatedly needing to be pushed by my discipler.",
  "1B-2": "In the last month, I have deliberately sacrificed something important to me because of my commitment to Christ.",
  "1B-3": "I have taken deliberate steps to understand and pursue the work or assignment I believe God has called me to.",
  "1B-4": "I have invested time in building a skill, qualification or craft that serves my calling.",
  "1B-5": "In the last month, I can identify a career, study or business decision where I chose my calling over an easier or more profitable option.",

  // Area 2: Building Relationship. Items 1-3 Priest, 4-5 King.
  "2A-1": "I have intentionally spent regular one-on-one time with this person beyond formal group meetings.",
  "2A-2": "In the last month, I have had meaningful conversations with this person about their spiritual life, decisions, challenges, relationships, and growth.",
  "2A-3": "I know at least three current struggles or growth areas in this person's life because I have taken time to listen and understand them.",
  "2A-4": "I have helped this person build healthy, honest relationships with colleagues, clients, mentors or partners in their work or studies.",
  "2A-5": "In the last month, I have seen this person keep a promise or commitment to someone in their work or business even when it cost them.",
  "2B-1": "I have consistently made time to meet, speak, or interact meaningfully with my discipler.",
  "2B-2": "I have openly discussed important spiritual, personal, relational, and character issues instead of hiding them from my discipler.",
  "2B-3": "I have responded to my discipler's calls, messages, meetings, and follow-up with reasonable consistency.",
  "2B-4": "I have built healthy, honest relationships with colleagues, clients, mentors or partners in my work or studies.",
  "2B-5": "In the last month, I kept a promise or commitment to someone in my work or business even when it cost me.",

  // Area 3: Ministry and Teaching of the Word. Items 1-3 Priest, 4-5 King.
  "3A-1": "I have personally taught or explained Scripture to this person regularly during the last month.",
  "3A-2": "I have used Scripture as the primary basis for discipleship conversations rather than relying mainly on motivational speeches, opinions, or philosophy.",
  "3A-3": "I have encouraged this person to ask difficult questions and seek biblical understanding rather than simply accepting everything I say.",
  "3A-4": "I have encouraged this person to keep learning in their field through books, courses, training or mentors.",
  "3A-5": "I have asked this person to explain how a principle from Scripture applies to a real decision at work, school or business.",
  "3B-1": "I consistently study the Bible beyond listening to sermons or devotional messages.",
  "3B-2": "During the last month, I have spent time studying specific Bible passages and recording what I learned.",
  "3B-3": "I have asked questions when I did not understand a teaching instead of pretending to understand.",
  "3B-4": "In the last month, I have kept learning in my field through books, courses, training or mentors.",
  "3B-5": "I can explain how at least one biblical principle applies to a real decision I made at work, school or business.",

  // Area 4: Prayer. Items 1-3 Priest, 4-5 King.
  "4A-1": "I have prayed regularly with this person, not only talked to them about prayer.",
  "4A-2": "I have personally prayed for this person during the last month.",
  "4A-3": "I have demonstrated prayer practically by praying audibly and allowing the person to see a model of personal prayer.",
  "4A-4": "I have taught this person to pray about their work, business, studies, finances and plans, not only about church matters.",
  "4A-5": "I have encouraged this person to pray for the people, organization and city they serve through their work.",
  "4B-1": "I consistently maintain a personal prayer time rather than praying only when there is an emergency.",
  "4B-2": "In the last month, I have regularly prayed for other people, including my discipler, family, leaders, or people I am responsible for.",
  "4B-3": "I have participated actively in prayer with other believers rather than remaining a passive observer.",
  "4B-4": "I regularly pray about my work, business, studies, finances and plans, not only about church matters.",
  "4B-5": "In the last month, I have prayed for my workplace, clients, colleagues, customers or city, and can name one response or result.",

  // Area 5: Practical Ministry. Items 1-2 Priest, 3-5 King.
  "5A-1": "I have given this person actual opportunities to minister instead of keeping all ministry responsibilities to myself.",
  "5A-2": "I have taken this person with me or intentionally assigned them to participate in evangelism, outreach, prayer, follow-up, preaching, teaching, or another ministry activity.",
  "5A-3": "I have given this person real responsibility to lead or deliver a project, task or initiative outside church meetings, with guidance.",
  "5A-4": "I have helped this person use their professional skills to meet a real need for other people.",
  "5A-5": "In the last month, I can identify one project or responsibility at work, school or in the community that this person now handles with less supervision than before.",
  "5B-1": "In the last month, I have personally participated in evangelism, outreach, prayer ministry, teaching, preaching, follow-up, or another practical ministry assignment.",
  "5B-2": "I have personally initiated at least one ministry opportunity instead of only participating when someone invited me.",
  "5B-3": "I have taken on responsibility to lead or deliver a project, task or initiative outside church meetings.",
  "5B-4": "I have used my professional skills to meet a real need for other people.",
  "5B-5": "In the last month, I completed one project or responsibility at work, school or in the community with less supervision than before.",

  // Area 6: Rebuke and Correction. Items 1-3 Priest, 4-5 King.
  "6A-1": "I have corrected this person when I observed behaviour, attitudes, or decisions that were inconsistent with Scripture or agreed discipleship standards.",
  "6A-2": "My corrections have been specific, timely, and based on facts rather than vague criticism.",
  "6A-3": "I have followed up after correction to determine whether the behaviour actually changed.",
  "6A-4": "I have helped this person receive and act on honest feedback from a boss, teacher, client or colleague.",
  "6A-5": "I have addressed with this person any shortcut, exaggeration or unfairness in their work, studies or business.",
  "6B-1": "When my discipler has corrected me, I have listened without immediately becoming defensive.",
  "6B-2": "I have made at least one measurable behavioural change as a direct result of correction received.",
  "6B-3": "When I disagreed with a correction, I discussed it respectfully rather than ignoring the issue.",
  "6B-4": "I have received honest feedback from a boss, teacher, client or colleague and acted on it.",
  "6B-5": "In the last month, I corrected a shortcut, exaggeration or unfairness in my work, studies or business.",

  // Area 7: Service. Items 1-2 Priest, 3-5 King.
  "7A-1": "I have intentionally trained this person to serve rather than only to attend meetings.",
  "7A-2": "I have given this person specific responsibilities they can own and complete.",
  "7A-3": "I have encouraged this person to be dependable at work or school: on time, on task and honest about what they deliver.",
  "7A-4": "I have encouraged this person to use their job, skills or business to serve customers, colleagues or the community with excellence.",
  "7A-5": "I can identify one work, school or business responsibility this person now handles more reliably than a month ago.",
  "7B-1": "I regularly volunteer or accept opportunities to serve in my church, department, ministry, workplace, community, or family.",
  "7B-2": "I complete assigned responsibilities within the agreed time without needing repeated reminders.",
  "7B-3": "I am dependable at work or school: on time, on task and honest about what I deliver.",
  "7B-4": "I have used my job, skills or business to serve customers, colleagues or the community with excellence.",
  "7B-5": "In the last month, I handled one work, school or business responsibility more reliably than before.",

  // Area 8: Self-Denial. Items 1-3 Priest, 4-5 King. Money items ask about habits only, never amounts.
  "8A-1": "I have challenged this person when personal comfort, entertainment, money, relationships, or preferences were interfering with spiritual growth.",
  "8A-2": "I have demonstrated self-denial by example rather than merely telling the person to sacrifice.",
  "8A-3": "I have helped this person identify at least one area of excessive self-focus that needed to change.",
  "8A-4": "I have encouraged this person to practise healthy money habits such as budgeting, saving, avoiding unnecessary debt and giving.",
  "8A-5": "I have observed this person choose a long-term goal over a short-term spending or lifestyle pleasure.",
  "8B-1": "I have deliberately reduced or denied myself something I enjoy in order to make room for prayer, study, service, ministry, or another Kingdom responsibility.",
  "8B-2": "I have made at least one difficult change to my schedule because I recognised that my previous priorities were limiting my spiritual growth.",
  "8B-3": "I have exercised discipline in how I use my phone, social media, entertainment, or free time.",
  "8B-4": "I practise healthy money habits such as budgeting, saving, avoiding unnecessary debt and giving.",
  "8B-5": "In the last month, I chose a long-term goal over a short-term spending or lifestyle pleasure.",

  // Area 9: Obedience. Items 1-3 Priest, 4-5 King.
  "9A-1": "I have given this person clear biblical or ministry instructions and followed up to see whether they were carried out.",
  "9A-2": "I have distinguished between genuine obedience and verbal agreement.",
  "9A-3": "When this person failed to follow through, I addressed the issue instead of ignoring it.",
  "9A-4": "I have seen this person follow through on commitments at work, school or business, including agreements, deadlines and promises.",
  "9A-5": "I have observed this person handle money in line with what they say they believe, such as paying what they owe on time, honouring agreements and giving.",
  "9B-1": "I consistently act on biblical instructions I understand instead of collecting knowledge without action.",
  "9B-2": "When my discipler gives me a legitimate discipleship assignment, I complete it within the agreed timeframe.",
  "9B-3": "I have changed at least one behaviour because I understood from Scripture that it needed to change.",
  "9B-4": "I follow through on commitments at work, school or business, including agreements, deadlines and promises.",
  "9B-5": "In the last month, I handled money in line with what I say I believe, such as paying what I owe on time, honouring agreements and giving.",

  // Area 10: Death to Self and Willingness to Suffer. Items 1-3 Priest, 4-5 King.
  "10A-1": "I have challenged this person to remain faithful when discipleship or Christian responsibility became inconvenient.",
  "10A-2": "I have prepared this person to expect sacrifice, rejection, inconvenience, delay, or discomfort as part of following Christ.",
  "10A-3": "I have personally modelled perseverance during difficult circumstances rather than teaching sacrifice only in theory.",
  "10A-4": "I have seen this person stay committed to their work, studies or business through a setback, delay or hard season.",
  "10A-5": "In the last month, I have seen this person refuse a shortcut, bribe or unfair advantage even when it would have helped them.",
  "10B-1": "I remained committed to Christ and my responsibilities during at least one difficult, disappointing, or stressful period in the last month.",
  "10B-2": "I have continued serving or obeying when I was not receiving recognition or immediate results.",
  "10B-3": "I have accepted inconvenience, delay, correction, or personal sacrifice without abandoning my responsibilities.",
  "10B-4": "In the last month, I stayed committed to my work, studies or business through a setback, delay or hard season.",
  "10B-5": "In the last month, I refused a shortcut, bribe or unfair advantage even when it would have helped me.",

  // Area 11: Transformation of Society. All five items King; wording unchanged from the original bank.
  "11A-1": "I have taught this person to see their workplace, school, business, profession, community, family, and social environment as places for Kingdom influence.",
  "11A-2": "I have challenged the person to solve real problems rather than limiting Christianity to church activities.",
  "11A-3": "I have encouraged the person to demonstrate integrity, excellence, compassion, justice, responsibility, and Kingdom values in everyday life.",
  "11A-4": "I have discussed with this person how their skills, profession, influence, or resources can positively affect other people.",
  "11A-5": "In the last month, I have seen the person take at least one practical action that positively affected people or solved a real problem outside a church meeting.",
  "11B-1": "I have deliberately applied Christian principles to my workplace, school, business, profession, family, or community during the last month.",
  "11B-2": "I have used my skills, knowledge, resources, or influence to solve at least one real problem affecting other people.",
  "11B-3": "I have demonstrated Christian integrity in situations where dishonesty or compromise would have been easier or more profitable.",
  "11B-4": "I have intentionally influenced someone outside the church environment through my conduct, service, work, or communication.",
  "11B-5": "I can identify one measurable positive impact my Christian life has had on another person, family, workplace, business, school, or community in the last month.",

  // Area 12: Reproducing Other Disciples. Items 1-3 Priest, 4-5 King.
  "12A-1": "I have intentionally trained this person to disciple someone else rather than keeping the relationship focused only on their personal growth.",
  "12A-2": "I have explained practical steps for how to begin and sustain a discipleship relationship with another person.",
  "12A-3": "I have given this person opportunities to teach, guide, pray with, correct, follow up, or mentor someone else.",
  "12A-4": "I have encouraged this person to mentor, train or open doors for someone younger or less experienced in their field.",
  "12A-5": "I can identify one person at work, school or business whom this person is helping to grow or succeed.",
  "12B-1": "I am currently investing intentionally in at least one other person spiritually.",
  "12B-2": "In the last month, I have regularly prayed with, taught, encouraged, corrected, followed up with, or spiritually guided another person.",
  "12B-3": "I have shared specific lessons I learned through discipleship with someone else.",
  "12B-4": "I mentor, train or open doors for someone younger or less experienced in my field.",
  "12B-5": "I can identify one person at work, school or business who is growing partly because of my investment in them.",
};

const ID_RE = /^(\d{1,2})([AB])-(\d)$/;

export const QUESTIONS: readonly Question[] = Object.entries(RAW).map(([id, text]) => {
  const m = ID_RE.exec(id);
  if (!m) throw new Error(`Bad item id ${id}`);
  const area = Number(m[1]);
  const index = Number(m[3]);
  return { id, area, version: m[2] as TestVersion, index, domain: domainOf(area, index), text };
});

const BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));

export function getQuestion(id: string): Question | undefined {
  return BY_ID.get(id);
}

export function questionsFor(version: TestVersion): Question[] {
  return QUESTIONS.filter((q) => q.version === version).sort((a, b) => a.area - b.area || a.index - b.index);
}

/** Copy shown before the first question (Appendix A.1). */
export const ASSESSMENT_INTRO = {
  purpose:
    "This assessment is designed to measure the practical fruit of discipleship in the last month. It is not a test of how well someone knows the right Christian language. It measures what has actually been done, practiced, demonstrated, corrected, changed, and reproduced.",
  important:
    "Do not score yourself based on what you intend to do, what you believe, or what you know. Score yourself based on what you can actually point to: What did I do? How often? What changed? What evidence exists?",
  window: "Answer about the last month, or since you began if that is shorter.",
} as const;
