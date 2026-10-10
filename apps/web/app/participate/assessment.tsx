'use client';
import { useState } from 'react';
import { evidenceChecklist } from '@cornerstone/content';
import { ButtonLink, Notice } from '@cornerstone/ui';
const questions = [
  {
    title: 'What brings you here?',
    help: 'Choose the path that best describes you.',
    options: [
      'My work or business was affected',
      'I am researching an event',
      'I represent a state or legislature',
      'I want to organize or support an association',
    ],
  },
  {
    title: 'What do you know about the action?',
    help: 'You do not need to be certain. This guide does not decide eligibility.',
    options: [
      'Government deliberately aimed to close or shrink the industry',
      'The losses followed ordinary market change',
      'I am not sure yet',
    ],
  },
  {
    title: 'How was the livelihood affected?',
    help: 'A direct loss matters. Keeping part-time work or later finding a job does not automatically disqualify someone.',
    options: [
      'Loss of a primary job or established independent work',
      'Direct loss as an owner-operator or supplier',
      'A wider regional or indirect effect',
      'I am gathering the facts',
    ],
  },
];
export default function Assessment() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const q = questions[step];
  const [printed, setPrinted] = useState(false);
  return (
    <div className="tool-panel">
      {q ? (
        <>
          <div className="progress-track" aria-label={`Step ${step + 1} of 3`}>
            {questions.map((_, i) => (
              <span key={i} className={i <= step ? 'done' : ''} />
            ))}
          </div>
          <p className="eyebrow">Starting guide · {step + 1} of 3</p>
          <h2>{q.title}</h2>
          <p className="muted">{q.help}</p>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="skip-link">{q.title}</legend>
            <div className="radio-options">
              {q.options.map((o) => (
                <label className="radio-option" key={o}>
                  <input
                    type="radio"
                    name={`question-${step}`}
                    value={o}
                    checked={answers[step] === o}
                    onChange={() =>
                      setAnswers((a) => {
                        const n = [...a];
                        n[step] = o;
                        return n;
                      })
                    }
                  />
                  {o}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="tool-actions">
            {step > 0 ? (
              <button className="button button-secondary" onClick={() => setStep(step - 1)}>
                Back
              </button>
            ) : null}
            <button className="button" disabled={!answers[step]} onClick={() => setStep(step + 1)}>
              {step === 2 ? 'See my starting point' : 'Continue'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="eyebrow">Your starting point</p>
          <h2>Build a reliable record.</h2>
          <p>
            {answers[0] === questions[0]!.options[2]
              ? 'Start with the state authority and no-new-harm framework. A state offer needs published terms, a valid district, sector authority, and independent supervision.'
              : answers[1] === questions[1]!.options[1] || answers[2] === questions[2]!.options[2]
                ? 'The proposal requires deliberate government industry contraction and direct, material livelihood harm. Market losses and wider regional effects alone do not meet that test. You can still research the facts and the policy.'
                : 'Your next step is to organize evidence of the action, your established livelihood, and the direct loss. Historical and unlisted events remain open to reliable proof.'}
          </p>
          <Notice title="A guide, not an eligibility result">
            Nothing here certifies an event or person. Your answers stay in this page’s memory,
            disappear when you reload, and are not submitted to a server.
          </Notice>
          <div className="cards-grid">
            {evidenceChecklist.map((c) => (
              <article className="info-card" key={c.title}>
                <h3>{c.title}</h3>
                <ul>
                  {c.items.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <div className="tool-actions">
            <button
              className="button"
              onClick={() => {
                setPrinted(true);
                window.print();
              }}
            >
              Print this checklist
            </button>
            <button
              className="button button-secondary"
              onClick={() => {
                setStep(0);
                setAnswers([]);
              }}
            >
              Start again
            </button>
            <ButtonLink href="/workspace" secondary>
              Explore the workspace
            </ButtonLink>
          </div>
          {printed ? (
            <p className="hint" role="status">
              Your browser’s print dialog lets you save a PDF.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
