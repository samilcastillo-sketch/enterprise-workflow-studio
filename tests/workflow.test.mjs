import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BlueprintHistory,
  createDefaultBlueprint,
  detectCycle,
  simulateWorkflow,
  validateBlueprint,
} from '../src/workflowEngine.js';

test('default enterprise procurement blueprint is a valid acyclic DAG', () => {
  const bp = createDefaultBlueprint();
  const res = validateBlueprint(bp);
  assert.equal(res.valid, true);
  assert.equal(res.errors.length, 0);
  assert.equal(res.warnings.length, 0);
});

test('detects cycles and invalid start/end configurations', () => {
  const bp = createDefaultBlueprint();
  bp.edges.push({ id: 'e_cycle', from: 'n5', to: 'n2', condition: 'always' });
  assert.equal(detectCycle(bp.nodes, bp.edges), true);
  const res = validateBlueprint(bp);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('Cycle')));
});

test('simulates conditional routing for high-value vs standard POs', () => {
  const bp = createDefaultBlueprint();
  const high = simulateWorkflow(bp, { amountUsd: 50000 });
  assert.equal(high.ok, true);
  assert.ok(high.trace.some((s) => s.label === 'CFO Sign-Off'));
  assert.equal(high.totalSlaHours, 26);

  const low = simulateWorkflow(bp, { amountUsd: 5000 });
  assert.equal(low.ok, true);
  assert.ok(low.trace.some((s) => s.label === 'Dept Manager'));
  assert.equal(low.totalSlaHours, 10);
});

test('supports undo/redo blueprint snapshots', () => {
  const bp = createDefaultBlueprint();
  const history = new BlueprintHistory(bp);
  bp.nodes[0].label = 'Updated Intake';
  history.commit(bp);

  const undone = history.undo();
  assert.equal(undone.nodes[0].label, 'PO Submitted');
  const redone = history.redo();
  assert.equal(redone.nodes[0].label, 'Updated Intake');
});
