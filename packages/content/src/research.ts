import dataset from './research-data.json' with { type: 'json' };

export const researchNotice =
  'Research only. No event certification, individual eligibility or existing legal cause of action is established.';
export const researchDataset = dataset;
export type ResearchRow = { row: number; values: string[] };
export type ResearchSheet = {
  name: string;
  headers: string[];
  records: ResearchRow[];
  context: string;
};
export const sourceDocuments = dataset.sources.map((s) => ({
  ...s,
  slug: s.path
    .split('/')
    .at(-1)!
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replaceAll('_', '-'),
  title: (
    {
      'Speech.srt': 'Cornerstone speech',
      'Policy_Paper.docx': 'The Cornerstone policy paper',
      'Design_Commentary.docx': 'Design commentary',
      'Displacement_Event_Census.docx': 'Displacement event census',
      'Event_Evidence.xlsx': 'Event evidence workbook',
      'Federal_Cornerstone_Bill.docx': 'Federal Cornerstone bill',
      'Model_State_Cornerstone_Enabling_Act.docx': 'Model state enabling act',
    } as Record<string, string>
  )[s.path.split('/').at(-1)!]!,
  format: s.path.split('.').at(-1)!.toUpperCase(),
}));

function cells(sheet: ResearchSheet, row: ResearchRow) {
  return Object.fromEntries(sheet.headers.map((h, i) => [h, row.values[i] ?? '']));
}
function sheet(name: string): ResearchSheet {
  return dataset.sheets.find((s) => s.name === name)!;
}
export function publicSourceUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}
export const researchEvents = sheet('Event evidence').records.map((r) => {
  const c = cells(sheet('Event evidence'), r);
  const actionDate = c['Action date']!;
  const years = [...actionDate.matchAll(/\b(?:1[5-9]|20)\d{2}\b/g)].map((m) => Number(m[0]));
  return {
    id: c['ID']!,
    title: c['Government event']!,
    jurisdiction: c['Sovereign']!,
    actionDate,
    instrument: c['Instrument']!,
    action: c['Government action']!,
    rationale: c['Why this qualifies']!,
    affectedGroup: c['Affected group record']!,
    limits: c['Causation and limits']!,
    sourceDisposition: c['Screening disposition']!,
    sourceCheck: c['Citation check state']!,
    furtherEvidence: c['Further event evidence']!,
    reviewed: c['Reviewed']!,
    urls: [c['Primary source URL']!, c['Second source URL']!]
      .map(publicSourceUrl)
      .filter((u): u is string => u !== null),
    row: r.row,
    classification: 'research-only' as const,
    sortYear: years.length ? Math.min(...years) : null,
  };
});
export type ResearchEvent = (typeof researchEvents)[number];
export const researchJurisdictions = [...new Set(researchEvents.map((e) => e.jurisdiction))].sort();
export function findResearchEvent(id: string) {
  return researchEvents.find((e) => e.id === id);
}
export function relatedResearch(name: string, eventId: string) {
  const s = sheet(name);
  const column = name === 'Citation audit' ? 0 : 1;
  return s.records
    .filter((r) => Array.from(r.values[column]?.match(/C-\d{3}[A-Z]?/g) ?? []).includes(eventId))
    .map((r) => ({ row: r.row, values: cells(s, r) }));
}
export function searchResearch(input: {
  query?: string;
  jurisdiction?: string;
  view?: string;
  page?: number;
}) {
  const words = (input.query ?? '').trim().toLowerCase().slice(0, 150).split(/\s+/).filter(Boolean);
  const selected = researchEvents.filter(
    (e) =>
      (!input.jurisdiction || e.jurisdiction === input.jurisdiction) &&
      words.every((w) =>
        [
          e.id,
          e.title,
          e.jurisdiction,
          e.actionDate,
          e.instrument,
          e.action,
          e.rationale,
          e.limits,
          e.affectedGroup,
        ]
          .join(' ')
          .toLowerCase()
          .includes(w),
      ),
  );
  if (input.view === 'timeline')
    selected.sort(
      (a, b) => (a.sortYear ?? Infinity) - (b.sortYear ?? Infinity) || a.id.localeCompare(b.id),
    );
  const pages = Math.max(1, Math.ceil(selected.length / 20));
  const page = Math.min(pages, Math.max(1, Number.isSafeInteger(input.page) ? input.page! : 1));
  return {
    events: selected.slice((page - 1) * 20, page * 20),
    count: selected.length,
    page,
    pages,
  };
}
