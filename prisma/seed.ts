import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding iPlanning database...');

  // ── Create Project ──
  const project = await prisma.project.create({
    data: {
      name: 'LMS Platform Development',
      startDate: new Date('2026-01-05'),
      rates: {
        PM: 8000, BA: 5000, SA: 6000, 'UX/UI': 5000,
        Developer: 5000, QA: 5000, DevSecOps: 6000,
        'IT Infra': 5000, Trainer: 5000, User: 0,
      },
    },
  });
  console.log(`  ✅ Project: ${project.name} (${project.id})`);

  // ── Role Configs ──
  const roleConfigData = [
    { name: 'PM',        color: '#3b82f6', isUser: false },
    { name: 'BA',        color: '#10b981', isUser: false },
    { name: 'SA',        color: '#14b8a6', isUser: false },
    { name: 'UX/UI',     color: '#8b5cf6', isUser: false },
    { name: 'Developer', color: '#f59e0b', isUser: false },
    { name: 'QA',        color: '#ef4444', isUser: false },
    { name: 'DevSecOps', color: '#ec4899', isUser: false },
    { name: 'IT Infra',  color: '#06b6d4', isUser: false },
    { name: 'Trainer',   color: '#84cc16', isUser: false },
    { name: 'User',      color: '#94a3b8', isUser: true  },
  ];
  for (let i = 0; i < roleConfigData.length; i++) {
    const r = roleConfigData[i]!;
    await prisma.roleConfig.create({
      data: { projectId: project.id, name: r.name, color: r.color, isUser: r.isUser, sortOrder: i },
    });
  }
  console.log(`  ✅ Roles: ${roleConfigData.length}`);

  // ── Sources ──
  const sourceNames = [
    'Requirement Document', 'TOR', 'Meeting Note',
    'Change Request', 'Stakeholder Interview',
  ];
  for (let i = 0; i < sourceNames.length; i++) {
    await prisma.sourceMaster.create({
      data: { projectId: project.id, name: sourceNames[i]!, sortOrder: i },
    });
  }
  console.log(`  ✅ Sources: ${sourceNames.length}`);

  // ── StdMd Groups & Rows ──
  const stdMdData = [
    { code: 'SM01', group: 'Screen', type: 'Simple Screen', roleMD: { PM: 0, BA: 0, SA: 0.25, 'UX/UI': 0.5, Developer: 1, QA: 0.5, DevSecOps: 0, 'IT Infra': 0, Trainer: 0 } },
    { code: 'SM02', group: 'Screen', type: 'Standard Screen', roleMD: { PM: 0, BA: 0, SA: 0.5, 'UX/UI': 1, Developer: 2, QA: 1, DevSecOps: 0, 'IT Infra': 0, Trainer: 0 } },
    { code: 'SM03', group: 'Screen', type: 'Complex Screen', roleMD: { PM: 0, BA: 0, SA: 1, 'UX/UI': 2, Developer: 4, QA: 2, DevSecOps: 0, 'IT Infra': 0, Trainer: 0 } },
    { code: 'SM04', group: 'Feature', type: 'Simple Feature', roleMD: { PM: 0, BA: 0.5, SA: 1, 'UX/UI': 0, Developer: 1, QA: 0.5, DevSecOps: 0, 'IT Infra': 0, Trainer: 0 } },
    { code: 'SM05', group: 'Feature', type: 'Standard Feature', roleMD: { PM: 0, BA: 1, SA: 2, 'UX/UI': 0, Developer: 2.5, QA: 1, DevSecOps: 0, 'IT Infra': 0, Trainer: 0 } },
    { code: 'SM06', group: 'Feature', type: 'Complex Feature', roleMD: { PM: 0, BA: 2, SA: 4, 'UX/UI': 0, Developer: 5.5, QA: 2, DevSecOps: 0, 'IT Infra': 0, Trainer: 0 } },
    { code: 'SM07', group: 'Feature', type: 'High Complex Feature', roleMD: { PM: 0, BA: 3, SA: 6, 'UX/UI': 0, Developer: 10, QA: 4, DevSecOps: 0, 'IT Infra': 0, Trainer: 0 } },
    { code: 'SM08', group: 'Report', type: 'Simple Report', roleMD: { PM: 0, BA: 0.5, SA: 0.5, 'UX/UI': 0, Developer: 1, QA: 0.5, DevSecOps: 0, 'IT Infra': 0, Trainer: 0 } },
    { code: 'SM09', group: 'Report', type: 'Complex Report', roleMD: { PM: 0, BA: 1, SA: 1, 'UX/UI': 0, Developer: 3, QA: 1, DevSecOps: 0, 'IT Infra': 0, Trainer: 0 } },
    { code: 'SM10', group: 'Log', type: 'Log / Audit Trail', roleMD: { PM: 0, BA: 0, SA: 0.5, 'UX/UI': 0, Developer: 1, QA: 0.5, DevSecOps: 0, 'IT Infra': 0, Trainer: 0 } },
    { code: 'SM11', group: 'Integration', type: 'API Integration (Simple)', roleMD: { PM: 0, BA: 0, SA: 1, 'UX/UI': 0, Developer: 2, QA: 1, DevSecOps: 0, 'IT Infra': 0, Trainer: 0 } },
    { code: 'SM12', group: 'Integration', type: 'API Integration (Complex)', roleMD: { PM: 0, BA: 0, SA: 2, 'UX/UI': 0, Developer: 5, QA: 2, DevSecOps: 0, 'IT Infra': 0, Trainer: 0 } },
    { code: 'SM13', group: 'Document', type: 'Standard Document', roleMD: { PM: 0, BA: 2, SA: 2, 'UX/UI': 0, Developer: 0, QA: 0, DevSecOps: 0, 'IT Infra': 0, Trainer: 0 } },
  ];
  for (let i = 0; i < stdMdData.length; i++) {
    const d = stdMdData[i]!;
    await prisma.stdMdRow.create({
      data: { projectId: project.id, stdCode: d.code, group: d.group, type: d.type, roleMD: d.roleMD, sortOrder: i },
    });
  }
  console.log(`  ✅ StdMd: ${stdMdData.length} rows`);

  // ── Phases ──
  const phaseColors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16', '#e11d48', '#7c3aed', '#3b82f6'];
  const phaseData = [
    { code: 'T01', name: 'Project Planning' },
    { code: 'T02', name: 'Initial Project' },
    { code: 'T03', name: '1. System Administration' },
    { code: 'T04', name: '2. User & Access Management' },
    { code: 'T05', name: '3. Curriculum & Course Mgmt' },
    { code: 'T06', name: '4. LMS' },
    { code: 'T07', name: '5. Question Bank' },
    { code: 'T08', name: '6. Testing & Assessment' },
    { code: 'T09', name: '7. Assignment Module' },
    { code: 'T10', name: '8. Grading System' },
    { code: 'T11', name: 'SIT' },
    { code: 'T12', name: 'UAT' },
    { code: 'T13', name: 'Training & Go-live' },
  ];
  const phaseMap: Record<string, string> = {};
  for (let i = 0; i < phaseData.length; i++) {
    const d = phaseData[i]!;
    const p = await prisma.phase.create({
      data: { projectId: project.id, phaseCode: d.code, name: d.name, color: phaseColors[i] || '#3b82f6', sortOrder: i },
    });
    phaseMap[d.code] = p.id;
  }
  console.log(`  ✅ Phases: ${phaseData.length}`);

  console.log('✨ Seed complete!');
  console.log(`   Project ID: ${project.id}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
