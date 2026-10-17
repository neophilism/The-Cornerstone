'use client';
import { useState } from 'react';
import { workflows, workflowGroups } from '@cornerstone/domain';
import { Badge, ButtonLink, Notice } from '@cornerstone/ui';
export default function Preview() {
  const [group, setGroup] = useState<string>('Prepare & participate');
  const [expanded, setExpanded] = useState<string | null>(null);
  const current = workflowGroups.find((g) => g.label === group)!;
  return (
    <div className="workspace-layout">
      <aside className="workspace-sidebar">
        <p className="eyebrow">Workspace tour</p>
        <nav aria-label="Workspace tour">
          {workflowGroups.map((g) => (
            <a
              href="#tour"
              key={g.label}
              aria-current={group === g.label ? 'page' : undefined}
              onClick={() => {
                setGroup(g.label);
                setExpanded(null);
              }}
            >
              {g.label}
            </a>
          ))}
        </nav>
      </aside>
      <section id="tour" className="workspace-main">
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">A place to move forward</p>
            <h1>Your next step, made clear.</h1>
            <p>
              Explore the planned service paths. This tour does not create an account or accept
              private information.
            </p>
          </div>
          <Badge tone="gold">Proposal · preview</Badge>
        </div>
        <Notice title="Official services are not open">
          Protected identity, evidence, rankings and payments require approved integrations,
          verified security controls and enacted authority. External expert review is optional
          follow-up. Developer workspaces use synthetic records only.
        </Notice>
        <h2 className="page-section-title">{group}</h2>
        <div className="workflow-catalog">
          {workflows
            .filter((w) => (current.kinds as readonly string[]).includes(w.kind))
            .map((w) => (
              <article className="workflow-card" key={w.kind}>
                <h3>{w.label}</h3>
                <p>{w.description}</p>
                <button
                  className="quiet-button"
                  aria-expanded={expanded === w.kind}
                  onClick={() => setExpanded(expanded === w.kind ? null : w.kind)}
                >
                  See the proposed steps
                </button>
                {expanded === w.kind ? (
                  <ol>
                    {w.actions.map((a) => (
                      <li key={a.key} style={{ fontSize: 12, marginBottom: 10 }}>
                        <strong>{a.label}</strong>
                        <br />
                        {a.help}
                      </li>
                    ))}
                  </ol>
                ) : null}
              </article>
            ))}
        </div>
        <p style={{ marginTop: 25 }}>
          <ButtonLink href="/participate">Find your starting point</ButtonLink>
        </p>
      </section>
    </div>
  );
}
