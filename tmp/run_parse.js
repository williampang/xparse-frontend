const { formatExamPaper } = require('./utils.bundle.cjs');
const fs = require('fs');
const file = process.argv[2] || 'tmp/test05.json';
const stripQuestions = process.argv[3] === 'detail';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
if (stripQuestions) delete data.questions;
const r = formatExamPaper(data);
if (!r) { console.log('NULL'); process.exit(0); }
console.log('title:', r.title, '| subtitle:', r.subtitle, '| count:', r.questionCount);
for (const s of r.sections) {
  console.log('== SECTION:', s.name, '| desc:', s.questionTypeDesc, '| type:', s.questionType, '| qs:', s.questions.length);
  for (const q of s.questions) {
    console.log('   Q' + q.index, '[' + (q.type || '-') + ']', 'opts:', (q.options || []).map(o => o.label).join(',') || '-', '| stem:', (q.stem || '').replace(/\n/g, '⏎').slice(0, 60));
    for (const o of q.options || []) {
      if (o.text.includes('**') || o.label !== o.label.toUpperCase()) console.log('     opt', o.label, JSON.stringify(o.text.slice(0, 50)));
    }
  }
}
