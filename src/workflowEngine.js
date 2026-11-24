/**
 * Enterprise Workflow DAG Engine:
 * - Graph validation (cycle detection, reachability, start/end checks)
 * - Conditional path simulation for approval/procurement blueprints
 * - Undo/Redo snapshot history & JSON serialization
 */

export const NODE_TYPES = {
  START: { label: 'Trigger / Intake', color: '#10b981' },
  CONDITION: { label: 'Policy Rule Gate', color: '#f59e0b' },
  APPROVAL: { label: 'Executive Approval', color: '#38bdf8' },
  WEBHOOK: { label: 'ERP / Webhook Sync', color: '#818cf8' },
  END: { label: 'Completed / Archived', color: '#64748b' },
};

export function createDefaultBlueprint() {
  return {
    name: 'Corporate Procurement Approval v2',
    nodes: [
      { id: 'n1', type: 'START', label: 'PO Submitted', x: 60, y: 170, slaHours: 1, role: 'Requester' },
      { id: 'n2', type: 'CONDITION', label: 'Amount > $25k?', x: 290, y: 170, field: 'amountUsd', op: '>', value: 25000 },
      { id: 'n3', type: 'APPROVAL', label: 'CFO Sign-Off', x: 540, y: 75, slaHours: 24, role: 'CFO' },
      { id: 'n4', type: 'APPROVAL', label: 'Dept Manager', x: 540, y: 265, slaHours: 8, role: 'Manager' },
      { id: 'n5', type: 'WEBHOOK', label: 'NetSuite ERP Sync', x: 780, y: 170, slaHours: 1, role: 'System' },
      { id: 'n6', type: 'END', label: 'PO Released', x: 1000, y: 170, slaHours: 0, role: 'System' },
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2', condition: 'always' },
      { id: 'e2', from: 'n2', to: 'n3', condition: 'true' },
      { id: 'e3', from: 'n2', to: 'n4', condition: 'false' },
      { id: 'e4', from: 'n3', to: 'n5', condition: 'always' },
      { id: 'e5', from: 'n4', to: 'n5', condition: 'always' },
      { id: 'e6', from: 'n5', to: 'n6', condition: 'always' },
    ],
  };
}

export function detectCycle(nodes, edges) {
  const adj = new Map(nodes.map((n) => [n.id, []]));
  edges.forEach((e) => {
    if (adj.has(e.from) && adj.has(e.to)) adj.get(e.from).push(e.to);
  });

  const state = new Map(); // 0=unvisited, 1=visiting, 2=visited
  const dfs = (id) => {
    state.set(id, 1);
    const nexts = adj.get(id) || [];
    for (let i = 0; i < nexts.length; i += 1) {
      const st = state.get(nexts[i]) || 0;
      if (st === 1) return true;
      if (st === 0 && dfs(nexts[i])) return true;
    }
    state.set(id, 2);
    return false;
  };

  for (let i = 0; i < nodes.length; i += 1) {
    if ((state.get(nodes[i].id) || 0) === 0 && dfs(nodes[i].id)) return true;
  }
  return false;
}

export function validateBlueprint(blueprint) {
  const errors = [];
  const warnings = [];
  const { nodes = [], edges = [] } = blueprint;

  const starts = nodes.filter((n) => n.type === 'START');
  const ends = nodes.filter((n) => n.type === 'END');
  if (starts.length !== 1) errors.push('Workflow must have exactly 1 START node.');
  if (ends.length === 0) errors.push('Workflow must have at least 1 END node.');
  if (detectCycle(nodes, edges)) errors.push('Cycle detected: workflows must be acyclic (DAG).');

  if (starts.length === 1) {
    const adj = new Map(nodes.map((n) => [n.id, []]));
    edges.forEach((e) => {
      if (adj.has(e.from)) adj.get(e.from).push(e.to);
    });
    const visited = new Set([starts[0].id]);
    const queue = [starts[0].id];
    while (queue.length) {
      const cur = queue.shift();
      (adj.get(cur) || []).forEach((nxt) => {
        if (!visited.has(nxt)) {
          visited.add(nxt);
          queue.push(nxt);
        }
      });
    }
    nodes.forEach((n) => {
      if (!visited.has(n.id)) warnings.push(`Unreachable node: "${n.label}" (${n.id}).`);
    });
  }

  nodes
    .filter((n) => n.type === 'CONDITION')
    .forEach((cond) => {
      const out = edges.filter((e) => e.from === cond.id);
      const hasTrue = out.some((e) => e.condition === 'true');
      const hasFalse = out.some((e) => e.condition === 'false');
      if (!hasTrue || !hasFalse) {
        warnings.push(`Condition "${cond.label}" should define both 'true' and 'false' branches.`);
      }
    });

  return { valid: errors.length === 0, errors, warnings };
}

function evalConditionNode(node, context) {
  const actual = context[node.field];
  const target = node.value;
  switch (node.op) {
    case '>': return Number(actual) > Number(target);
    case '>=': return Number(actual) >= Number(target);
    case '<': return Number(actual) < Number(target);
    case '==': return String(actual) === String(target);
    case '!=': return String(actual) !== String(target);
    default: return false;
  }
}

export function simulateWorkflow(blueprint, context = {}) {
  const validation = validateBlueprint(blueprint);
  if (!validation.valid) {
    return { ok: false, errors: validation.errors, trace: [], totalSlaHours: 0 };
  }

  const nodeMap = new Map(blueprint.nodes.map((n) => [n.id, n]));
  const start = blueprint.nodes.find((n) => n.type === 'START');
  const trace = [];
  const visited = new Set();
  let current = start;
  let totalSlaHours = 0;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    totalSlaHours += Number(current.slaHours || 0);
    let outcome = 'PROCEED';
    const outEdges = blueprint.edges.filter((e) => e.from === current.id);
    let nextEdge = outEdges[0] || null;

    if (current.type === 'CONDITION') {
      const passed = evalConditionNode(current, context);
      outcome = passed ? 'BRANCH_TRUE' : 'BRANCH_FALSE';
      nextEdge = outEdges.find((e) => e.condition === (passed ? 'true' : 'false')) || null;
    }

    trace.push({
      nodeId: current.id,
      label: current.label,
      type: current.type,
      role: current.role || 'System',
      slaHours: Number(current.slaHours || 0),
      outcome,
    });

    if (current.type === 'END' || !nextEdge) break;
    current = nodeMap.get(nextEdge.to) || null;
  }

  return { ok: true, errors: [], trace, totalSlaHours };
}

export class BlueprintHistory {
  constructor(initial) {
    this.past = [];
    this.present = JSON.stringify(initial);
    this.future = [];
  }

  commit(nextBlueprint) {
    const serialized = JSON.stringify(nextBlueprint);
    if (serialized === this.present) return;
    this.past.push(this.present);
    if (this.past.length > 60) this.past.shift();
    this.present = serialized;
    this.future = [];
  }

  undo() {
    if (!this.past.length) return null;
    this.future.push(this.present);
    this.present = this.past.pop();
    return JSON.parse(this.present);
  }

  redo() {
    if (!this.future.length) return null;
    this.past.push(this.present);
    this.present = this.future.pop();
    return JSON.parse(this.present);
  }
}
