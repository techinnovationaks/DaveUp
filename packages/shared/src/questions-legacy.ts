// The question wording used before the Priest and King split (PRD Appendix A, original bank).
// Kept for traceability: answers given before the change were given to this wording.
// The live bank is in questions.ts ("DaveUp Website Page Update", Nov 21, 2026, section 15).

export const LEGACY_WORDING_V1: Readonly<Record<string, string>> = {
  // Area 1: Sure Calling
  "1A-1": "The person has willingly participated in discipleship meetings without me having to repeatedly force or pressure them.",
  "1A-2": "The person has voluntarily sacrificed time, comfort, money, opportunities, or personal preferences in order to follow Christ or fulfill Kingdom responsibilities.",
  "1A-3": "The person has demonstrated dissatisfaction with remaining at a nominal or merely Sunday-level Christian life.",
  "1A-4": "The person has voluntarily initiated spiritual activities such as prayer, Bible study, evangelism, fasting, or service without waiting for me to instruct them every time.",
  "1A-5": "In the last month, I can identify at least one situation where this person chose Christ's instructions over personal convenience.",
  "1B-1": "I have voluntarily maintained my discipleship meetings and spiritual commitments without repeatedly needing to be pushed by my discipler.",
  "1B-2": "In the last month, I have deliberately sacrificed something important to me because of my commitment to Christ.",
  "1B-3": "I have taken deliberate steps to move beyond a nominal Christian lifestyle.",
  "1B-4": "I have initiated spiritual activities on my own instead of waiting for my discipler to tell me what to do.",
  "1B-5": "In the last month, I can identify a specific decision where following Christ cost me something and I still chose obedience.",

  // Area 2: Building Relationship
  "2A-1": "I have intentionally spent regular one-on-one time with this person beyond formal group meetings.",
  "2A-2": "In the last month, I have had meaningful conversations with this person about their spiritual life, decisions, challenges, relationships, and growth.",
  "2A-3": "I know at least three current struggles or growth areas in this person's life because I have taken time to listen and understand them.",
  "2A-4": "I have checked on this person's spiritual and personal progress without waiting for a crisis before contacting them.",
  "2A-5": "I have demonstrated genuine care for the person through practical actions, not only through teaching or correction.",
  "2B-1": "I have consistently made time to meet, speak, or interact meaningfully with my discipler.",
  "2B-2": "I have openly discussed important spiritual, personal, relational, and character issues instead of hiding them from my discipler.",
  "2B-3": "I have responded to my discipler's calls, messages, meetings, and follow-up with reasonable consistency.",
  "2B-4": "I have allowed my discipler to know what is really happening in my life rather than presenting only the parts that make me look good.",
  "2B-5": "I can identify at least three things my discipler has helped me change because of the relationship we have built.",

  // Area 3: Ministry and Teaching of the Word
  "3A-1": "I have personally taught or explained Scripture to this person regularly during the last month.",
  "3A-2": "I have used Scripture as the primary basis for discipleship conversations rather than relying mainly on motivational speeches, opinions, or philosophy.",
  "3A-3": "I have encouraged this person to ask difficult questions and seek biblical understanding rather than simply accepting everything I say.",
  "3A-4": "I have taught this person how to study Scripture, compare passages, and test teachings against the Word.",
  "3A-5": "I have assigned or encouraged practical Bible study that the person could complete independently.",
  "3B-1": "I consistently study the Bible beyond listening to sermons or devotional messages.",
  "3B-2": "During the last month, I have spent time studying specific Bible passages and recording what I learned.",
  "3B-3": "I have asked questions when I did not understand a teaching instead of pretending to understand.",
  "3B-4": "I have compared teachings, opinions, or spiritual claims with Scripture before accepting them as truth.",
  "3B-5": "I can explain at least three biblical truths I have learned during this discipleship period and show where they are found in Scripture.",

  // Area 4: Prayer
  "4A-1": "I have prayed regularly with this person, not only talked to them about prayer.",
  "4A-2": "I have personally prayed for this person during the last month.",
  "4A-3": "I have demonstrated prayer practically by praying audibly and allowing the person to see a model of personal prayer.",
  "4A-4": "I have taught this person how to pray about spiritual growth, decisions, needs, destiny, people, and Kingdom assignments.",
  "4A-5": "I have encouraged this person to develop a personal prayer life rather than becoming dependent on me to pray for them.",
  "4B-1": "I consistently maintain a personal prayer time rather than praying only when there is an emergency.",
  "4B-2": "In the last month, I have regularly prayed for other people, including my discipler, family, leaders, or people I am responsible for.",
  "4B-3": "I have participated actively in prayer with other believers rather than remaining a passive observer.",
  "4B-4": "I deliberately involve God in major decisions instead of deciding first and praying afterwards.",
  "4B-5": "I can identify at least three specific things I have prayed about consistently in the last month and the outcome or present status of each.",

  // Area 5: Practical Ministry
  "5A-1": "I have given this person actual opportunities to minister instead of keeping all ministry responsibilities to myself.",
  "5A-2": "I have taken this person with me or intentionally assigned them to participate in evangelism, outreach, prayer, follow-up, preaching, teaching, or another ministry activity.",
  "5A-3": "I have allowed the person to attempt ministry, even when they were still learning, while providing appropriate guidance.",
  "5A-4": "I have reviewed their ministry experiences with them and helped them identify what they did well and what needs improvement.",
  "5A-5": "In the last month, I can identify at least one ministry responsibility that this person can now perform with less supervision than before.",
  "5B-1": "In the last month, I have personally participated in evangelism, outreach, prayer ministry, teaching, preaching, follow-up, or another practical ministry assignment.",
  "5B-2": "I have personally initiated at least one ministry opportunity instead of only participating when someone invited me.",
  "5B-3": "I have prayed for someone in need and taken a practical step to minister to them.",
  "5B-4": "I have shared what Christ has taught me with another person in a practical way.",
  "5B-5": "I can identify at least one ministry area where I have become more confident or effective because of this discipleship relationship.",

  // Area 6: Rebuke and Correction
  "6A-1": "I have corrected this person when I observed behaviour, attitudes, or decisions that were inconsistent with Scripture or agreed discipleship standards.",
  "6A-2": "My corrections have been specific, timely, and based on facts rather than vague criticism.",
  "6A-3": "I have followed up after correction to determine whether the behaviour actually changed.",
  "6A-4": "I have corrected without using humiliation, insults, threats, or public embarrassment as the primary method.",
  "6A-5": "I have created an environment where this person can receive difficult truth from me without the relationship becoming hostile.",
  "6B-1": "When my discipler has corrected me, I have listened without immediately becoming defensive.",
  "6B-2": "I have made at least one measurable behavioural change as a direct result of correction received.",
  "6B-3": "When I disagreed with a correction, I discussed it respectfully rather than ignoring the issue.",
  "6B-4": "I have allowed trusted spiritual leadership to point out blind spots in my character or conduct.",
  "6B-5": "In the last month, I can identify a specific correction I received and the change I made afterwards.",

  // Area 7: Service
  "7A-1": "I have intentionally trained this person to serve rather than only to attend meetings.",
  "7A-2": "I have given this person specific responsibilities they can own and complete.",
  "7A-3": "I have taught the person to serve even when there is little recognition, visibility, or personal benefit.",
  "7A-4": "I have observed whether this person completes assigned responsibilities without repeated reminders.",
  "7A-5": "I can identify at least one responsibility this person now handles more reliably than they did a month ago.",
  "7B-1": "I regularly volunteer or accept opportunities to serve in my church, department, ministry, workplace, community, or family.",
  "7B-2": "I complete assigned responsibilities within the agreed time without needing repeated reminders.",
  "7B-3": "I have served in at least one area where I received little or no public recognition.",
  "7B-4": "I have helped someone else succeed rather than focusing only on my own visibility.",
  "7B-5": "In the last month, I have demonstrated reliability in at least one ongoing responsibility.",

  // Area 8: Self-Denial
  "8A-1": "I have challenged this person when personal comfort, entertainment, money, relationships, or preferences were interfering with spiritual growth.",
  "8A-2": "I have demonstrated self-denial by example rather than merely telling the person to sacrifice.",
  "8A-3": "I have helped this person identify at least one area of excessive self-focus that needed to change.",
  "8A-4": "I have encouraged disciplined use of time, money, attention, technology, and personal resources.",
  "8A-5": "I have observed at least one practical instance where this person chose Kingdom responsibility over personal convenience.",
  "8B-1": "I have deliberately reduced or denied myself something I enjoy in order to make room for prayer, study, service, ministry, or another Kingdom responsibility.",
  "8B-2": "I have made at least one difficult change to my schedule because I recognised that my previous priorities were limiting my spiritual growth.",
  "8B-3": "I have exercised discipline in how I use my phone, social media, entertainment, money, or free time.",
  "8B-4": "I have chosen responsibility over convenience on occasions when nobody would have known if I had chosen otherwise.",
  "8B-5": "I can identify one comfort or personal preference I have deliberately surrendered in the last month for the sake of Christ and His work.",

  // Area 9: Obedience
  "9A-1": "I have given this person clear biblical or ministry instructions and followed up to see whether they were carried out.",
  "9A-2": "I have distinguished between genuine obedience and verbal agreement.",
  "9A-3": "When this person failed to follow through, I addressed the issue instead of ignoring it.",
  "9A-4": "I have modelled obedience myself, including in areas that were inconvenient or costly.",
  "9A-5": "I can identify at least one measurable area where the person's obedience has improved during the last month.",
  "9B-1": "I consistently act on biblical instructions I understand instead of collecting knowledge without action.",
  "9B-2": "When my discipler gives me a legitimate discipleship assignment, I complete it within the agreed timeframe.",
  "9B-3": "I have changed at least one behaviour because I understood from Scripture that it needed to change.",
  "9B-4": "I obey even when the instruction is inconvenient, uncomfortable, or not immediately beneficial to me.",
  "9B-5": "I can identify three specific instructions, convictions, or corrections I acted on during the last month.",

  // Area 10: Death to Self and Willingness to Suffer
  "10A-1": "I have challenged this person to remain faithful when discipleship or Christian responsibility became inconvenient.",
  "10A-2": "I have prepared this person to expect sacrifice, rejection, inconvenience, delay, or discomfort as part of following Christ.",
  "10A-3": "I have personally modelled perseverance during difficult circumstances rather than teaching sacrifice only in theory.",
  "10A-4": "I have observed how this person responds when they do not get their preferred outcome.",
  "10A-5": "In the last month, I have seen this person remain faithful in at least one situation where quitting would have been easier.",
  "10B-1": "I remained committed to Christ and my responsibilities during at least one difficult, disappointing, or stressful period in the last month.",
  "10B-2": "I have continued serving or obeying when I was not receiving recognition or immediate results.",
  "10B-3": "I have accepted inconvenience, delay, correction, or personal sacrifice without abandoning my responsibilities.",
  "10B-4": "I have identified at least one personal desire that had to be surrendered because it conflicted with God's Word or my Kingdom responsibility.",
  "10B-5": "I can give a specific example of remaining faithful when it would have been easier to quit.",

  // Area 11: Transformation of Society
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

  // Area 12: Reproduction of Other Disciples
  "12A-1": "I have intentionally trained this person to disciple someone else rather than keeping the relationship focused only on their personal growth.",
  "12A-2": "I have explained practical steps for how to begin and sustain a discipleship relationship with another person.",
  "12A-3": "I have given this person opportunities to teach, guide, pray with, correct, follow up, or mentor someone else.",
  "12A-4": "I have checked whether this person is actually investing in another person rather than merely saying they intend to do so.",
  "12A-5": "I can identify at least one person this disciple is now intentionally helping to grow spiritually.",
  "12B-1": "I am currently investing intentionally in at least one other person spiritually.",
  "12B-2": "In the last month, I have regularly prayed with, taught, encouraged, corrected, followed up with, or spiritually guided another person.",
  "12B-3": "I have shared specific lessons I learned through discipleship with someone else.",
  "12B-4": "I have helped another person take at least one practical step toward spiritual growth.",
  "12B-5": "I can identify one person who is growing partly because of my intentional investment in them.",
};
