import prettier from 'prettier/standalone';
import parserBabel from 'prettier/plugins/babel';
import parserEstree from 'prettier/plugins/estree';
import parserHtml from 'prettier/plugins/html';
import parserCss from 'prettier/plugins/postcss';
import parserMarkdown from 'prettier/plugins/markdown';

const plugins = [parserBabel, parserEstree, parserHtml, parserCss, parserMarkdown];
const parserMap = {
  javascript: 'babel', typescript: 'babel-ts', jsx: 'babel', tsx: 'babel-ts',
  html: 'html', css: 'css', json: 'json', markdown: 'markdown',
};

self.onmessage = async (e) => {
  const { code, language } = e.data;
  const parser = parserMap[language];
  if (!parser) { self.postMessage({ ok: false, error: `No formatter for ${language}` }); return; }
  try {
    const formatted = await prettier.format(code || '', { parser, plugins, singleQuote: true, semi: true, trailingComma: 'es5' });
    self.postMessage({ ok: true, formatted });
  } catch (err) { self.postMessage({ ok: false, error: err.message }); }
};
