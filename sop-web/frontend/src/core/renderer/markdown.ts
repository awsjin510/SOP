import type { IR, Step, TroubleshootingItem } from '@/core/ir/schemas';

/**
 * 把 IR 渲染成 Markdown。供 W3 線上預覽用；正式 docx/pdf 渲染在 W5。
 */
export function renderMarkdown(ir: IR): string {
  const lines: string[] = [];

  lines.push(`# ${ir.meta.title}`);
  lines.push('');
  lines.push(`> 適用對象：${ir.meta.target_audience}`);
  if (ir.meta.estimated_duration_minutes) {
    lines.push(`> 預估時間：${ir.meta.estimated_duration_minutes} 分鐘`);
  }
  if (ir.meta.difficulty) {
    lines.push(`> 難度：${ir.meta.difficulty}`);
  }
  if (ir.meta.tags && ir.meta.tags.length > 0) {
    lines.push(`> 標籤：${ir.meta.tags.map((t) => `\`${t}\``).join(' ')}`);
  }
  lines.push('');
  lines.push(`版本 ${ir.version} · 更新 ${formatDate(ir.meta.updated_at)}`);
  lines.push('');

  const sectionMap = new Map(ir.sections.map((s) => [s.id, s]));
  const sortedSections = [...ir.sections].sort((a, b) => a.order - b.order);

  for (const section of sortedSections) {
    lines.push('---');
    lines.push('');
    lines.push(`## ${section.order + 1}. ${section.title}`);
    if (section.description) {
      lines.push('');
      lines.push(section.description);
    }
    lines.push('');

    const stepsInSection = ir.steps
      .filter((s) => s.section_id === section.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    if (stepsInSection.length === 0) {
      lines.push('_（此章節尚無步驟）_');
      lines.push('');
      continue;
    }

    for (const step of stepsInSection) {
      renderStep(step, lines);
    }
  }

  // 沒被指派到任何 section 的 steps（保險）
  const orphanSteps = ir.steps.filter((s) => !sectionMap.has(s.section_id));
  if (orphanSteps.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## 未分類步驟');
    lines.push('');
    for (const step of orphanSteps) {
      renderStep(step, lines);
    }
  }

  if (ir.troubleshooting && ir.troubleshooting.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Troubleshooting');
    lines.push('');
    for (const t of ir.troubleshooting) {
      renderTrouble(t, lines);
    }
  }

  if (ir.glossary && ir.glossary.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## 術語表');
    lines.push('');
    for (const g of ir.glossary) {
      lines.push(`**${g.term}**${g.aliases?.length ? `（${g.aliases.join(' / ')}）` : ''}`);
      lines.push('');
      lines.push(g.definition);
      lines.push('');
    }
  }

  return lines.join('\n');
}

function renderStep(step: Step, lines: string[]): void {
  lines.push(`### ${step.title}`);
  lines.push('');

  if (step.purpose) {
    lines.push(`**為什麼**：${step.purpose}`);
    lines.push('');
  }

  if (step.preconditions && step.preconditions.length > 0) {
    lines.push('**前置條件**：');
    for (const p of step.preconditions) {
      lines.push(`- ${p}`);
    }
    lines.push('');
  }

  if (step.actions.length > 0) {
    lines.push('**操作**：');
    step.actions.forEach((a, i) => {
      lines.push(`${i + 1}. ${a.text}`);
      if (a.command) {
        lines.push('');
        lines.push('   ```');
        lines.push(`   ${a.command}`);
        lines.push('   ```');
      }
    });
    lines.push('');
  }

  if (step.expected_result) {
    lines.push(`**預期結果**：${step.expected_result}`);
    lines.push('');
  }

  if (step.tips && step.tips.length > 0) {
    lines.push('**Tips**：');
    for (const t of step.tips) {
      lines.push(`- 💡 ${t}`);
    }
    lines.push('');
  }

  if (step.warnings && step.warnings.length > 0) {
    lines.push('**警示**：');
    for (const w of step.warnings) {
      lines.push(`- ⚠️ ${w}`);
    }
    lines.push('');
  }

  if (step.common_mistakes && step.common_mistakes.length > 0) {
    lines.push('**新人常犯**：');
    for (const m of step.common_mistakes) {
      lines.push(`- ${m}`);
    }
    lines.push('');
  }

}

function renderTrouble(t: TroubleshootingItem, lines: string[]): void {
  lines.push(`### ${t.symptom}${t.severity ? `（${t.severity}）` : ''}`);
  lines.push('');
  if (t.cause) {
    lines.push(`**原因**：${t.cause}`);
    lines.push('');
  }
  if (t.solution) {
    lines.push(`**解法**：${t.solution}`);
    lines.push('');
  }
}

function formatDate(iso: string): string {
  // 規格要求顯示時轉 +08:00；ISO 字串若已含 offset 就直接擷取日期部分
  return iso.split('T')[0] ?? iso;
}
