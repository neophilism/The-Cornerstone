import type { ReactNode } from 'react';
import { translate, type Locale } from '@cornerstone/i18n';

export function Mark({ small = false }: { small?: boolean }) {
  return (
    <svg
      width={small ? 30 : 40}
      height={small ? 30 : 40}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path d="M4 32V17L20 7l16 10v15H4Z" stroke="currentColor" strokeWidth="2" />
      <path d="M4 24h32M12 24v8m16-8v8M20 7v17" stroke="currentColor" strokeWidth="2" />
      <path d="M17 32v-8h6v8" fill="currentColor" />
    </svg>
  );
}
export function Arrow({ className = '' }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 12h14m-6-6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function Header({
  locale = 'en',
  portalUrl = '/workspace',
  active = '',
  publicOrigin = '',
}: {
  locale?: Locale;
  portalUrl?: string;
  active?: string;
  publicOrigin?: string;
}) {
  const t = translate(locale);
  const links = [
    ['/how-it-works', t.how],
    ['/events', t.events],
    ['/participate', t.participate],
    ['/opportunities', t.offers],
  ];
  return (
    <>
      <a className="skip-link" href="#main">
        {t.skip}
      </a>
      <div className="proposal-bar">
        <span className="status-dot" />
        {t.proposal}
        <span className="bar-detail">
          {' '}
          · A voluntary remedy for deliberate livelihood displacement
        </span>
        <a href={`${publicOrigin}/policy`}>
          Read the proposal <span aria-hidden="true">↗</span>
        </a>
      </div>
      <header className="site-header">
        <a className="brand" href={`${publicOrigin}/`} aria-label="The Cornerstone home">
          <Mark />
          <span>
            THE
            <br />
            CORNERSTONE
          </span>
        </a>
        <nav className="desktop-nav" aria-label="Main navigation">
          {links.map(([href, label]) => (
            <a
              key={href}
              href={`${publicOrigin}${href}`}
              aria-current={active === href ? 'page' : undefined}
            >
              {label}
            </a>
          ))}
        </nav>
        <a className="account-link" href={portalUrl}>
          {t.account}
          <Arrow />
        </a>
        <details className="mobile-menu">
          <summary>Menu</summary>
          <nav aria-label="Mobile navigation">
            {links.map(([href, label]) => (
              <a key={href} href={`${publicOrigin}${href}`}>
                {label}
              </a>
            ))}
            <a href={portalUrl}>{t.account}</a>
            <a href={`${publicOrigin}/public-record`}>{t.record}</a>
          </nav>
        </details>
      </header>
    </>
  );
}
export function Footer({ publicOrigin = '' }: { publicOrigin?: string }) {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <a className="brand" href={`${publicOrigin}/`}>
          <Mark />
          <span>
            THE
            <br />
            CORNERSTONE
          </span>
        </a>
        <p>
          A fair foundation.
          <br />A future you help build.
        </p>
        <div className="footer-links">
          <a href={`${publicOrigin}/policy`}>Policy & sources</a>
          <a href={`${publicOrigin}/help`}>Help & questions</a>
          <a href={`${publicOrigin}/public-record`}>Public record</a>
          <a href={`${publicOrigin}/privacy`}>Privacy</a>
          <a href={`${publicOrigin}/accessibility`}>Accessibility</a>
        </div>
      </div>
      <div className="footer-bottom">
        <span>
          Cornerstone is a proposal. This site does not certify eligibility or grant legal rights.
        </span>
        <a href={`${publicOrigin}/es`} lang="es">
          Español
        </a>
      </div>
    </footer>
  );
}
export function ButtonLink({
  href,
  children,
  secondary = false,
}: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
}) {
  return (
    <a href={href} className={`button ${secondary ? 'button-secondary' : ''}`}>
      {children}
      <Arrow />
    </a>
  );
}
export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'green' | 'gold';
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function PageIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="page-intro">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <div className="intro-copy">{children}</div>
    </div>
  );
}
export function Notice({
  children,
  title = 'Proposal status',
}: {
  children: ReactNode;
  title?: string;
}) {
  return (
    <aside className="notice">
      <span className="notice-icon" aria-hidden="true">
        i
      </span>
      <div>
        <strong>{title}</strong>
        <div>{children}</div>
      </div>
    </aside>
  );
}
export function EmptyState({
  title,
  children,
  href,
  label,
}: {
  title: string;
  children: ReactNode;
  href?: string;
  label?: string;
}) {
  return (
    <div className="empty-state">
      <div className="empty-mark" aria-hidden="true">
        <Mark />
      </div>
      <h2>{title}</h2>
      <div className="muted">{children}</div>
      {href && label ? <ButtonLink href={href}>{label}</ButtonLink> : null}
    </div>
  );
}
export function CommunityArt() {
  return (
    <svg
      className="community-art"
      viewBox="0 0 560 590"
      role="img"
      aria-label="An original illustration of a community at sunrise"
    >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#dbb686" />
          <stop offset="1" stopColor="#e9d9bd" />
        </linearGradient>
        <pattern id="windows" width="22" height="25" patternUnits="userSpaceOnUse">
          <rect x="6" y="6" width="9" height="13" fill="#dab07a" />
        </pattern>
        <clipPath id="arch">
          <path d="M36 550V242a244 244 0 0 1 488 0v308Z" />
        </clipPath>
      </defs>
      <g clipPath="url(#arch)">
        <rect width="560" height="590" fill="url(#sky)" />
        <circle cx="320" cy="222" r="79" fill="#f3e5c5" />
        <path d="m-30 400 147-185 103 123 72-82 104 139 126-183 101 224v170H-30" fill="#8c9e89" />
        <path d="m-40 462 160-124 124 94 90-88 100 74 108-62 80 70v180H-40" fill="#426c68" />
        <path d="M-20 438h114v130H-20Zm47-76 102 60v146H27Z" fill="#aa6c4d" />
        <path d="M25 439h78v99H25Z" fill="url(#windows)" />
        <path d="M400 430h124v142H400V430Zm41-60h19v69h-19Z" fill="#244b55" />
        <path d="m406 430 0-45 35 28 0-28 35 28 0-28 38 30v15" fill="#244b55" />
        <path d="M159 466v-79l55-38 55 38v79H159Z" fill="#e7d7b9" />
        <path d="M148 389l66-48 67 48" stroke="#b5734e" strokeWidth="15" />
        <path d="M198 418h32v50h-32Z" fill="#294a51" />
        <path
          d="M342 540V416m0 6c-55-16-45-65-20-63 11-59 45-30 41-9 53-18 78 25 48 48 2 24-47 42-69 24Z"
          fill="#173f46"
        />
        <path d="M-30 519q154-44 293 21t350-25v100H-30Z" fill="#1c414a" />
        <path d="M114 589q113-69 236 0" stroke="#c8a472" strokeWidth="53" fill="none" />
        <g fill="#102f39">
          <circle cx="162" cy="473" r="13" />
          <path d="m150 489-10 55h45l-8-55Zm1 54-5 43h12l7-43Zm22 0 8 43h12l-12-43Z" />
          <circle cx="220" cy="486" r="11" />
          <path d="m211 500-10 44h36l-8-44Zm0 42-3 43h11l5-43Zm13 0 6 43h11l-8-43Z" />
        </g>
        <path
          d="m176 503 26 10m-52-8-20 19"
          stroke="#102f39"
          strokeWidth="10"
          strokeLinecap="round"
        />
      </g>
      <path
        d="M36 550V242a244 244 0 0 1 488 0v308"
        fill="none"
        stroke="#dbbd8b"
        strokeWidth="1.5"
      />
      <path d="M15 550V242a265 265 0 0 1 530 0v308" fill="none" stroke="#42616a" strokeWidth="1" />
      <path d="M5 566h550" stroke="#789084" />
      <circle cx="46" cy="110" r="5" fill="#c8a472" />
      <path d="M50 54v20m-10-10h20" stroke="#c8a472" />
      <circle cx="493" cy="136" r="3" fill="#c8a472" />
    </svg>
  );
}
