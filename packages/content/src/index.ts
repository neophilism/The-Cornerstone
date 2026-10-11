export const policyStatus = Object.freeze({
  label: 'Policy proposal',
  officialApplicationsOpen: false,
  certifiedPeopleCount: null,
  availableOfficialOffers: 0,
});
export const steps = [
  {
    number: '01',
    title: 'Establish the harm',
    text: 'Labor would review the government action and each person’s direct livelihood loss, with evidence, written reasons, and review rights.',
    detail:
      'An industry’s deliberate destruction or material contraction must have been an objective or intended means of policy. Ordinary market change and incidental job losses do not suffice.',
  },
  {
    number: '02',
    title: 'Build an association',
    text: 'Eligible people would voluntarily form an association before choosing opportunities. Every founder gets an equal base stake and one vote.',
    detail:
      'Membership preserves voice and ownership even if you work elsewhere. Nobody must relocate, retrain, work for the enterprise, or assume personal debt.',
  },
  {
    number: '03',
    title: 'Choose an opportunity',
    text: 'Participating states would publish lawful offers. Associations rank the offers they want through a public exchange.',
    detail:
      'Choices stay sealed until the common deadline. Conflicts use the oldest still-unremedied event, then a public random tie-break. Officials do not pick favored workers.',
  },
  {
    number: '04',
    title: 'Create a lasting enterprise',
    text: 'Members retain voting control. A compact would run for 30 years, with one conditional automatic 10-year renewal.',
    detail:
      'Outside investment is nonvoting. Ordinary protective laws and independent public supervision continue. An opportunity is not a promise of profit.',
  },
] as const;
export const rights = [
  {
    title: 'Your choice',
    text: 'Participation is voluntary. Keep your home, your work, and your independence.',
  },
  {
    title: 'An equal foundation',
    text: 'One founding vote, equal base ownership and distributions, and access to the books.',
  },
  {
    title: 'Work on your terms',
    text: 'First opportunity for funded training, qualified work, or a member franchise.',
  },
  {
    title: 'A fair process',
    text: 'Published rules, written decisions, hearings, and judicial review.',
  },
] as const;
export const faqs = [
  {
    question: 'Is Cornerstone an existing government program?',
    answer:
      'This site explains a proposed program. It does not award eligibility, legalize a trade, grant a license, or make public payments. Official functions would require enacted law and authorized agencies.',
    source: 'Federal draft, sections 1–3 and 10',
  },
  {
    question: 'What kind of harm would qualify?',
    answer:
      'The proposal covers identifiable people whose established livelihoods were materially and directly harmed when government deliberately made an industry’s destruction or material contraction an objective or intended means of policy. Market competition, incidental losses, and diffuse regional decline do not suffice.',
    source: 'Federal draft, sections 2–3',
  },
  {
    question: 'What if I kept a part-time job or found another job?',
    answer:
      'Losing your primary job can qualify even if part-time work remains. Later employment and ordinary transition benefits would not erase a proven claim. Each person still needs reliable evidence of the original direct loss.',
    source: 'Federal draft, section 3',
  },
  {
    question: 'Can a historical or unlisted event be considered?',
    answer:
      'Yes. The register stays open to unlisted and historical actions. Age alone is no bar, but reliable proof is still required. A research entry does not certify an event or establish a person’s eligibility.',
    source: 'Federal draft, section 2',
  },
  {
    question: 'Would I have to move, retrain, or take on debt?',
    answer:
      'No. No member would be required to relocate, retrain, work for the enterprise, contribute personal capital, or assume personal debt. Membership and work are separate choices.',
    source: 'Federal draft, section 4',
  },
  {
    question: 'Would this take someone else’s existing opportunity?',
    answer:
      'A state offer could not take an existing lawful job, license, contract, customer, queue position, or market. The trade must presently be legally closed in the district, and the state must prove no new harm on a public record.',
    source: 'Federal draft, section 6; state draft, section 3',
  },
  {
    question: 'How would the funding work?',
    answer:
      'A limited Founding Fund advance would cover approved formation, feasibility, licensing, and training costs. The enterprise repays the advance plus a fixed public return; that obligation then ends. A separate state share applies only to positive shareable surplus.',
    source: 'Federal draft, section 8; state draft, section 5',
  },
  {
    question: 'What is the state’s percentage?',
    answer:
      'No numerical percentage has been settled. Under the draft, a state legislature would set one prospective flat rate after a public fiscal report. The rate, calculation method, protected baseline, and commercial menu must be published before associations rank offers.',
    source: 'State draft, section 5',
  },
  {
    question: 'Who controls the enterprise?',
    answer:
      'The founding members retain voting control. Outside capital is nonvoting. The state share gives government no equity, vote, board seat, veto, or management power. Independent public supervision remains distinct from corporate management.',
    source: 'Federal draft, sections 4 and 6; state draft, sections 4–6',
  },
  {
    question: 'Does the proposal guarantee business success?',
    answer:
      'No. An association needs a legally usable opportunity, financing, training access, and actual operations. Ordinary business risk remains, and public advances may not be fully recovered.',
    source: 'Federal draft, sections 8–10',
  },
] as const;
export const evidenceChecklist = [
  {
    title: 'The government action',
    items: [
      'Enacted text, an official order, or the implemented program',
      'Official evidence of the industry-contraction objective',
      'Contrary evidence and other possible causes',
    ],
  },
  {
    title: 'Your established livelihood',
    items: [
      'Employment, tax, union, licensing, or contract records',
      'Your work, hours, and earned income before the action',
      'A documented representative period if the work was seasonal',
    ],
  },
  {
    title: 'The direct loss',
    items: [
      'Separation dates, lost work, business cancellation, or forced retirement',
      'The direct link between the policy and the loss',
      'Supplier or contractor relationship records, if relevant',
    ],
  },
  {
    title: 'A historical claim or successor',
    items: [
      'Reliable archival records',
      'A documented succession chain',
      'One undivided claim or founding unit; no multiplication among heirs',
    ],
  },
] as const;
export const rolePaths = [
  {
    title: 'Workers & families',
    text: 'Understand the proposal, explore the criteria, and organize what you know.',
    href: '/participate',
    label: 'Find your starting point',
  },
  {
    title: 'States & legislators',
    text: 'Review the safeguards for a voluntary, lawful state offer.',
    href: '/opportunities',
    label: 'Explore the state framework',
  },
  {
    title: 'Associations & partners',
    text: 'Learn how member control, preparation, and enterprise formation fit together.',
    href: '/how-it-works#associations',
    label: 'See the association model',
  },
] as const;
export function searchHelp(query: string) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return faqs
    .map((f) => ({
      ...f,
      score: words.reduce(
        (n, w) => n + ((f.question + ' ' + f.answer).toLowerCase().includes(w) ? 1 : 0),
        0,
      ),
    }))
    .filter((f) => !words.length || f.score > 0)
    .sort((a, b) => b.score - a.score);
}
