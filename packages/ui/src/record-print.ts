/** Print only reviewed bytes as inert text; never print the surrounding private workspace. */
export function printReviewedRecord(content: string): () => void {
  const target = document.createElement('section');
  target.className = 'reviewed-record-print';
  target.setAttribute('aria-hidden', 'true');
  const heading = document.createElement('h1');
  heading.textContent = 'Synthetic record — reviewed copy';
  const note = document.createElement('p');
  note.textContent =
    'Not a legal filing or proof of external acceptance. Current access was checked before this copy was prepared. Printed or saved copies cannot be recalled.';
  const body = document.createElement('pre');
  body.textContent = content;
  target.append(heading, note, body);
  document.body.append(target);
  document.body.classList.add('cornerstone-printing');
  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener('afterprint', cleanup);
    target.remove();
    document.body.classList.remove('cornerstone-printing');
  };
  window.addEventListener('afterprint', cleanup);
  try {
    window.print();
  } catch (error) {
    cleanup();
    throw error;
  }
  // Some browsers return before closing their print dialog. afterprint or the
  // owning component's cancellation/unmount removes the temporary private copy.
  return cleanup;
}
