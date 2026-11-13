// The 12-area Discipleship Profile (PRD section 4.1, Appendix A).
// The 12 areas are the fixed core; churches may later adjust wording (PRD 18.7).

export interface Area {
  number: number;
  name: string;
  shortName: string;
  tagline: string;
  coreQuestion: string;
}

export const AREAS: readonly Area[] = [
  { number: 1, name: "Sure Calling", shortName: "Calling", tagline: "Following Christ willingly and seriously.", coreQuestion: "Is this person intentionally following Christ?" },
  { number: 2, name: "Building Relationship", shortName: "Relationship", tagline: "Intimacy through time and sustained by love.", coreQuestion: "Is discipleship happening through meaningful relationship?" },
  { number: 3, name: "Ministry and Teaching of the Word", shortName: "Word", tagline: "Learning truth, asking questions and testing what is taught.", coreQuestion: "Is the person learning, understanding and applying Scripture?" },
  { number: 4, name: "Prayer", shortName: "Prayer", tagline: "Developing a real spiritual life and dependence on God.", coreQuestion: "Is the person developing a real prayer life?" },
  { number: 5, name: "Practical Ministry", shortName: "Ministry", tagline: "Moving from learning to doing.", coreQuestion: "Is the person actually ministering?" },
  { number: 6, name: "Rebuke and Correction", shortName: "Correction", tagline: "Receiving correction and correcting others biblically.", coreQuestion: "Can the person receive and respond to correction?" },
  { number: 7, name: "Service", shortName: "Service", tagline: "Becoming useful, dependable and available.", coreQuestion: "Is the person dependable and useful?" },
  { number: 8, name: "Self-Denial", shortName: "Self-Denial", tagline: "Choosing Kingdom priorities over personal convenience.", coreQuestion: "Can the person put Kingdom priorities above personal convenience?" },
  { number: 9, name: "Obedience", shortName: "Obedience", tagline: "Doing what God says, not merely knowing it.", coreQuestion: "Does the person act on what they know?" },
  { number: 10, name: "Death to Self and Willingness to Suffer", shortName: "Endurance", tagline: "Endurance, sacrifice and faithfulness under pressure.", coreQuestion: "Can the person remain faithful under pressure and sacrifice?" },
  { number: 11, name: "Transformation of Society", shortName: "Society", tagline: "Taking the life of Christ beyond the church environment.", coreQuestion: "Is the person's Christianity influencing everyday life?" },
  { number: 12, name: "Reproduction of Other Disciples", shortName: "Reproduction", tagline: "Becoming a disciple-maker, not only a disciple.", coreQuestion: "Is the person intentionally helping someone else grow?" },
] as const;

export const AREA_COUNT = 12;
export const ITEMS_PER_AREA = 5;

export function getArea(n: number): Area {
  const a = AREAS[n - 1];
  if (!a) throw new Error(`Unknown area ${n}`);
  return a;
}
