const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const USER_ID = 'abhishekkinjawadekar_10052005';
const EMAIL_ID = 'ak1099@srmist.edu.in';
const ROLL_NUMBER = 'RA2311042010007';

function validateEntry(raw) {
  const s = String(raw).trim();
  if (!/^[A-Z]->[A-Z]$/.test(s)) return null;
  if (s[0] === s[3]) return null; // self-loop like A->A
  return s;
}

app.post('/bfhl', (req, res) => {
  const data = req.body.data || [];

  const invalid_entries = [];
  const seen = new Set();
  const dupSet = new Set();
  const duplicate_edges = [];
  const validEdges = [];

  for (const raw of data) {
    const entry = validateEntry(raw);
    if (!entry) {
      invalid_entries.push(String(raw).trim());
      continue;
    }
    if (seen.has(entry)) {
      if (!dupSet.has(entry)) {
        dupSet.add(entry);
        duplicate_edges.push(entry);
      }
      continue;
    }
    seen.add(entry);
    validEdges.push(entry);
  }

  // multi-parent: first parent wins, extras are silently dropped
  const childParent = {};
  const keptEdges = [];

  for (const edge of validEdges) {
    const p = edge[0], c = edge[3];
    if (!childParent[c]) {
      childParent[c] = p;
      keptEdges.push(edge);
    }
  }

  // build adjacency list
  const adj = {};
  const allNodes = new Set();

  for (const edge of keptEdges) {
    const p = edge[0], c = edge[3];
    allNodes.add(p);
    allNodes.add(c);
    if (!adj[p]) adj[p] = [];
    adj[p].push(c);
  }

  if (!allNodes.size) {
    return res.json({
      user_id: USER_ID,
      email_id: EMAIL_ID,
      college_roll_number: ROLL_NUMBER,
      hierarchies: [],
      invalid_entries,
      duplicate_edges,
      summary: { total_trees: 0, total_cycles: 0, largest_tree_root: '' }
    });
  }

  // group into connected components (undirected BFS)
  const visited = new Set();
  const components = [];

  for (const start of allNodes) {
    if (visited.has(start)) continue;
    const comp = new Set();
    const q = [start];
    while (q.length) {
      const n = q.shift();
      if (visited.has(n)) continue;
      visited.add(n);
      comp.add(n);
      (adj[n] || []).forEach(ch => { if (!visited.has(ch)) q.push(ch); });
      if (childParent[n] && !visited.has(childParent[n])) q.push(childParent[n]);
    }
    components.push(comp);
  }

  const hierarchies = [];

  for (const comp of components) {
    // nodes not appearing as children are roots
    const roots = [...comp].filter(n => !childParent[n]).sort();
    const root = roots.length ? roots[0] : [...comp].sort()[0];

    // DFS cycle detection
    const dv = new Set(), ds = new Set();
    let cycleFound = false;

    function dfs(n) {
      dv.add(n); ds.add(n);
      for (const ch of (adj[n] || [])) {
        if (!dv.has(ch)) { if (dfs(ch)) return true; }
        else if (ds.has(ch)) return true;
      }
      ds.delete(n);
      return false;
    }

    for (const n of comp) {
      if (!dv.has(n) && dfs(n)) { cycleFound = true; break; }
    }

    if (cycleFound) {
      hierarchies.push({ root, tree: {}, has_cycle: true });
      continue;
    }

    function buildTree(n) {
      const obj = {};
      for (const ch of (adj[n] || [])) obj[ch] = buildTree(ch);
      return obj;
    }

    function depth(n) {
      const kids = adj[n] || [];
      return kids.length ? 1 + Math.max(...kids.map(depth)) : 1;
    }

    hierarchies.push({ root, tree: { [root]: buildTree(root) }, depth: depth(root) });
  }

  const trees = hierarchies.filter(h => !h.has_cycle);
  const cycles = hierarchies.filter(h => h.has_cycle);

  let largest_tree_root = '';
  if (trees.length) {
    const best = [...trees].sort((a, b) =>
      b.depth !== a.depth ? b.depth - a.depth : a.root < b.root ? -1 : 1
    );
    largest_tree_root = best[0].root;
  }

  res.json({
    user_id: USER_ID,
    email_id: EMAIL_ID,
    college_roll_number: ROLL_NUMBER,
    hierarchies,
    invalid_entries,
    duplicate_edges,
    summary: { total_trees: trees.length, total_cycles: cycles.length, largest_tree_root }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`server up on port ${PORT}`));
