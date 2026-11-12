/**
 * Saving files from the page and picking a file to read – used by Forge (preset JSON) and the
 * App (screenshots).
 */

/**
 * Offer `blob` to the user as a download called `fileName`.
 * @param {Blob} blob
 * @param {string} fileName
 */
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before the URL goes
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * @param {string} text
 * @param {string} fileName
 * @param {string} [type='application/json']
 */
export function downloadText(text, fileName, type = 'application/json') {
  downloadBlob(new Blob([text], { type }), fileName);
}

/**
 * Let the user pick a text file; resolves with its contents, or null if they cancel.
 * @param {string} [accept='.json,application/json']
 * @returns {Promise<string | null>}
 */
export function pickTextFile(accept = '.json,application/json') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    const done = (value) => {
      input.remove();
      resolve(value);
    };
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return done(null);
      file.text().then(done, () => done(null));
    });
    input.addEventListener('cancel', () => done(null));
    document.body.append(input);
    input.click();
  });
}
