const fs = require('fs');
const before = require('/tmp/utils.bundle.before.cjs').formatExamPaper;
const after = require('./utils.bundle.cjs').formatExamPaper;

const normalize = (r) => {
  if (!r) return 'NULL';
  return JSON.stringify({
    title: r.title,
    subtitle: r.subtitle,
    questionCount: r.questionCount,
    sections: r.sections.map((s) => ({
      name: s.name,
      qs: s.questions.map((q) => ({
        i: q.index, t: q.type, stem: q.stem, opts: q.options.map((o) => o.label + o.text),
        answer: q.answer, analysis: q.analysis, knowledge: q.knowledge,
        difficulty: q.difficulty, score: q.score,
        ids: q.contentIds, groups: q.contentGroups,
      })),
    })),
  }, null, 1);
};

const files = ['test.json', 'test02.json', 'test03.json', 'test04.json', 'test05.json', 'test06.json', 'test1.json'];
for (const f of files) {
  const path = `${__dirname}/${f}`;
  if (!fs.existsSync(path)) { console.log(f, 'SKIP (missing)'); continue; }
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  const a = normalize(before(JSON.parse(JSON.stringify(data))));
  const b = normalize(after(JSON.parse(JSON.stringify(data))));
  if (a === b) {
    console.log(f, 'IDENTICAL');
  } else {
    console.log(f, 'CHANGED ===');
    fs.writeFileSync(`/tmp/diff_before_${f}.txt`, a);
    fs.writeFileSync(`/tmp/diff_after_${f}.txt`, b);
  }
}
