export type Locale = 'en' | 'es';
export const dictionary = {
  en: {
    brand: 'The Cornerstone',
    how: 'How it works',
    events: 'Explore events',
    participate: 'Participate',
    offers: 'State opportunities',
    record: 'Public record',
    account: 'My Cornerstone',
    proposal: 'A policy proposal',
    start: 'Find your starting point',
    learn: 'See how it works',
    skip: 'Skip to content',
    help: 'Help & questions',
    privacy: 'Privacy',
    accessibility: 'Accessibility',
    status: 'Proposal status',
  },
  es: {
    brand: 'The Cornerstone',
    how: 'Cómo funciona',
    events: 'Explorar eventos',
    participate: 'Participar',
    offers: 'Oportunidades estatales',
    record: 'Registro público',
    account: 'Mi Cornerstone',
    proposal: 'Una propuesta de política',
    start: 'Encuentre su punto de partida',
    learn: 'Vea cómo funciona',
    skip: 'Ir al contenido',
    help: 'Ayuda y preguntas',
    privacy: 'Privacidad',
    accessibility: 'Accesibilidad',
    status: 'Estado de la propuesta',
  },
} as const;
export function translate(locale: Locale) {
  return dictionary[locale];
}
