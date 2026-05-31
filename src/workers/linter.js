import { Linter } from 'eslint-linter-browserify';
const linter = new Linter();
const config = {
  env: { browser: true, es2021: true },
  parserOptions: { ecmaVersion: 2021, sourceType: 'module', ecmaFeatures: { jsx: true } },
  rules: {
    'no-unused-vars': 'warn',
    'no-undef': 'warn',
    'no-extra-semi': 'warn',
    'no-unreachable': 'warn',
  },
};

self.onmessage = (e) => {
  const { code, language } = e.data;
  if (!['javascript', 'typescript', 'jsx', 'tsx'].includes(language)) {
    self.postMessage({ ok: true, messages: [] }); return;
  }
  try {
    const messages = linter.verify(code || '', config);
    self.postMessage({ ok: true, messages });
  } catch (err) { self.postMessage({ ok: false, error: err.message, messages: [] }); }
};
