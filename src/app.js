import {
  BlueprintHistory,
  NODE_TYPES,
  createDefaultBlueprint,
  simulateWorkflow,
  validateBlueprint,
} from './workflowEngine.js';

let blueprint = createDefaultBlueprint();
const history = new BlueprintHistory(blueprint);
let selectedNodeId = null;
let connectMode = false;
let connectSourceId = null;
let simulatedIds = new Set();

const edgeSvg = document.getElementById('edgeSvg');
const nodesLayer = document.getElementById('nodesLayer');
const inspectorBody = document.getElementById('inspectorBody');
const lintBadge = document.getElementById('lintBadge');
const lintList = document.getElementById('lintList');
const simTrace = document.getElementById('simTrace');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const connectBtn = document.getElementById('connectBtn');

function commitAndRender() {
  history.commit(blueprint);
  render();
}

function render() {
  undoBtn.disabled = history.past.length === 0;
  redoBtn.disabled = history.future.length === 0;
  renderLint();
  renderEdges();
  renderNodes();
  renderInspector();
}

function renderLint() {
  const res = validateBlueprint(blueprint);
  lintBadge.textContent = res.valid ? 'DAG Valid' : `${res.errors.length} Error(s)`;
  lintBadge.className = `lint ${res.valid ? 'ok' : 'err'}`;
  const msgs = [...res.errors.map((e) => `Error: ${e}`), ...res.warnings.map((w) => `Warn: ${w}`)];
  lintList.innerHTML = msgs.length ? msgs.map((m) => `<li>${m}</li>`).join('') : '<li style="color:#10b981;">No graph issues found.</li>';
}

function renderEdges() {
  const nodeMap = new Map(blueprint.nodes.map((n) => [n.id, n]));
  const paths = blueprint.edges.map((e) => {
    const src = nodeMap.get(e.from);
    const dst = nodeMap.get(e.to);
    if (!src || !dst) return '';
    const x1 = src.x + 175;
    const y1 = src.y + 34;
    const x2 = dst.x;
    const y2 = dst.y + 34;
    const cx = (x1 + x2) / 2;
    const stroke = e.condition === 'true' ? '#10b981' : e.condition === 'false' ? '#f59e0b' : '#38bdf8';
    const label = e.condition !== 'always' ? `<text x="${cx}" y="${(y1 + y2) / 2 - 6}" fill="${stroke}" font-size="11" font-weight="700">${e.condition}</text>` : '';
    return `<path d="M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}" fill="none" stroke="${stroke}" stroke-width="2" />${label}`;
  });
  edgeSvg.innerHTML = paths.join('');
}

function renderNodes() {
  nodesLayer.innerHTML = '';
  blueprint.nodes.forEach((node) => {
    const meta = NODE_TYPES[node.type] || NODE_TYPES.APPROVAL;
    const card = document.createElement('div');
    card.className = `wf-node${selectedNodeId === node.id ? ' selected' : ''}${simulatedIds.has(node.id) ? ' active-sim' : ''}`;
    card.style.left = `${node.x}px`;
    card.style.top = `${node.y}px`;
    card.innerHTML = `
      <div class="wf-node-type" style="color:${meta.color}">${meta.label}</div>
      <div class="wf-node-title">${node.label}</div>
      <div class="wf-node-meta">${node.type === 'CONDITION' ? `${node.field} ${node.op} ${node.value}` : `Role: ${node.role || 'System'} • SLA ${node.slaHours || 0}h`}</div>
    `;

    card.addEventListener('mousedown', (downEvt) => {
      if (connectMode) {
        handleConnectClick(node.id);
        return;
      }
      selectedNodeId = node.id;
      const startX = downEvt.clientX;
      const startY = downEvt.clientY;
      const origX = node.x;
      const origY = node.y;
      let moved = false;

      const onMove = (moveEvt) => {
        moved = true;
        node.x = Math.max(10, Math.round((origX + moveEvt.clientX - startX) / 10) * 10);
        node.y = Math.max(10, Math.round((origY + moveEvt.clientY - startY) / 10) * 10);
        card.style.left = `${node.x}px`;
        card.style.top = `${node.y}px`;
        renderEdges();
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        if (moved) commitAndRender();
        else render();
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    nodesLayer.appendChild(card);
  });
}

function handleConnectClick(nodeId) {
  if (!connectSourceId) {
    connectSourceId = nodeId;
    connectBtn.textContent = `Connecting from ${nodeId}...`;
    return;
  }
  if (connectSourceId !== nodeId) {
    const srcNode = blueprint.nodes.find((n) => n.id === connectSourceId);
    const cond = srcNode?.type === 'CONDITION'
      ? (blueprint.edges.some((e) => e.from === connectSourceId && e.condition === 'true') ? 'false' : 'true')
      : 'always';
    blueprint.edges.push({ id: `e_${Date.now()}`, from: connectSourceId, to: nodeId, condition: cond });
    commitAndRender();
  }
  connectSourceId = null;
  connectMode = false;
  connectBtn.textContent = 'Connect Mode: Off';
}

function renderInspector() {
  const node = blueprint.nodes.find((n) => n.id === selectedNodeId);
  if (!node) {
    inspectorBody.textContent = 'Select a node on the canvas to edit properties.';
    return;
  }
  inspectorBody.innerHTML = `
    <label>Label <input id="insLabel" value="${node.label}" /></label>
    <label>SLA (Hours) <input id="insSla" type="number" min="0" value="${node.slaHours || 0}" /></label>
    <label>Role / Owner <input id="insRole" value="${node.role || ''}" /></label>
    <button id="deleteNodeBtn" style="color:#ef4444;">Delete Node</button>
  `;
  document.getElementById('insLabel').addEventListener('change', (e) => { node.label = e.target.value; commitAndRender(); });
  document.getElementById('insSla').addEventListener('change', (e) => { node.slaHours = Number(e.target.value); commitAndRender(); });
  document.getElementById('insRole').addEventListener('change', (e) => { node.role = e.target.value; commitAndRender(); });
  document.getElementById('deleteNodeBtn').addEventListener('click', () => {
    blueprint.nodes = blueprint.nodes.filter((n) => n.id !== node.id);
    blueprint.edges = blueprint.edges.filter((e) => e.from !== node.id && e.to !== node.id);
    selectedNodeId = null;
    commitAndRender();
  });
}

function addNode(type, label) {
  const id = `n_${Date.now().toString().slice(-4)}`;
  blueprint.nodes.push({
    id,
    type,
    label,
    x: 120 + (blueprint.nodes.length * 35) % 400,
    y: 90 + (blueprint.nodes.length * 25) % 240,
    slaHours: type === 'APPROVAL' ? 12 : 1,
    role: type === 'APPROVAL' ? 'VP Finance' : 'System',
    ...(type === 'CONDITION' ? { field: 'amountUsd', op: '>', value: 10000 } : {}),
  });
  selectedNodeId = id;
  commitAndRender();
}

document.getElementById('addApprovalBtn').addEventListener('click', () => addNode('APPROVAL', 'VP Approval'));
document.getElementById('addConditionBtn').addEventListener('click', () => addNode('CONDITION', 'Risk Threshold?'));
document.getElementById('addWebhookBtn').addEventListener('click', () => addNode('WEBHOOK', 'SAP / Webhook'));
connectBtn.addEventListener('click', () => {
  connectMode = !connectMode;
  connectSourceId = null;
  connectBtn.textContent = connectMode ? 'Connect Mode: Pick Source' : 'Connect Mode: Off';
});

undoBtn.addEventListener('click', () => {
  const prev = history.undo();
  if (prev) { blueprint = prev; render(); }
});
redoBtn.addEventListener('click', () => {
  const next = history.redo();
  if (next) { blueprint = next; render(); }
});

document.getElementById('runSimBtn').addEventListener('click', () => {
  const res = simulateWorkflow(blueprint, {
    amountUsd: Number(document.getElementById('simAmount').value),
    department: document.getElementById('simDept').value,
  });
  if (!res.ok) {
    simTrace.innerHTML = `<div style="color:#ef4444;">${res.errors.join(' ')}</div>`;
    simulatedIds = new Set();
    renderNodes();
    return;
  }
  simulatedIds = new Set(res.trace.map((t) => t.nodeId));
  simTrace.innerHTML = res.trace.map((t, idx) =>
    `<div class="trace-step">${idx + 1}. <strong>${t.label}</strong> (${t.outcome}) — SLA ${t.slaHours}h</div>`
  ).join('') + `<div style="color:var(--primary);font-weight:700;">Total SLA Budget: ${res.totalSlaHours}h</div>`;
  renderNodes();
});

document.getElementById('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(blueprint, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'flowops-blueprint.json';
  a.click();
  URL.revokeObjectURL(url);
});

render();
