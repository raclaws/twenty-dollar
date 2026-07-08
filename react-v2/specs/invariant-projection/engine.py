"""
Invariant Projection Engine v5 — Scoped Dimensions
Usage: python engine.py project.yaml

Key difference from v4: each operation only crosses entity state dimensions
it declares in 'touches'. This is semantically correct (not a heuristic) and
reduces the product space by ~64x for complex apps.
"""

import sys
import yaml
from itertools import product
from dataclasses import dataclass
from collections import defaultdict
from pathlib import Path


def load_yaml(path):
    with open(path, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)


@dataclass
class UndefinedCell:
    states: dict
    operation: str
    contexts: dict
    intensity: float
    relation: str
    reason: str
    edge_cases: list


def parse_operation(op_entry):
    """Parse operation entry — supports both string (v4 compat) and object (v5)."""
    if isinstance(op_entry, str):
        return op_entry, None  # no touches = cross ALL dims (v4 behavior)
    return op_entry['name'], op_entry.get('touches')


def get_op_category(op_name, config):
    """Classify operation by its mechanism."""
    if op_name.startswith(('GET ', 'POST ', 'PATCH ', 'PUT ', 'DELETE ')):
        return "FETCH"
    timer_keywords = ['timer', 'expire', 'timeout', 'debounce', 'flush']
    if any(kw in op_name.lower() for kw in timer_keywords):
        return "TIMER"
    ui_keywords = ['click', 'press', 'drag', 'input', 'submit']
    if any(kw in op_name.lower() for kw in ui_keywords):
        return "UI"
    nav_keywords = ['navigate', 'page_load', 'route']
    if any(kw in op_name.lower() for kw in nav_keywords):
        return "NAV"
    return "FETCH"


def lookup_relation(relations_data, op_category, dimension, state):
    """Look up the relation from the platform library."""
    for entry in relations_data.get('relations', []):
        if (entry['category'] == op_category and
            entry['dimension'] == dimension and
            entry['state'] == state):
            return entry
    return None


def get_cell_relation(op_name, contexts, relations_data, config):
    """Determine worst relation across all non-default context values."""
    severity = {"TRANSPARENT": 0, "DEGRADES": 1, "INTERFERES": 2}
    op_cat = get_op_category(op_name, config)
    worst = "TRANSPARENT"
    worst_reason = "all contexts are default"
    worst_edges = []

    defaults = {"PageLifecycle": "active", "ResponseSource": "network", "Connectivity": "online"}

    for dim, val in contexts.items():
        if val == defaults.get(dim):
            continue
        entry = lookup_relation(relations_data, op_cat, dim, val)
        if entry and severity.get(entry['relation'], 0) > severity.get(worst, 0):
            worst = entry['relation']
            worst_reason = entry['reason']
            worst_edges = entry.get('edge_cases', [])

    return worst, worst_reason, worst_edges


def compute_effective_intensity(config):
    """Compute intensity with transitive ENABLES + COMPLETES propagation."""
    effective = dict(config.get('intensity', {}))
    enables = config.get('enables', {})
    completes = config.get('completes', {})

    for _ in range(5):
        for op, downstream in enables.items():
            if op in effective:
                max_d = max((effective.get(d, 1.0) for d in downstream), default=1.0)
                effective[op] = max(effective[op], max_d)
        for op, upstream_ops in completes.items():
            if op in effective:
                max_u = max((effective.get(u, 1.0) for u in upstream_ops), default=1.0)
                effective[op] = max(effective[op], max_u)
    return effective


def is_state_op_covered(state_dict, op_name, touches, config):
    """Check if spec explicitly covers this (state, operation) pair."""
    for defined in config.get('spec_coverage', []):
        if defined[-1] != op_name:
            continue
        state_vals = defined[:-1]
        if not touches:
            all_dims = list({**config.get('entities', {}), **config.get('ui_states', {})}.keys())
            match = True
            for i, val in enumerate(state_vals):
                if i >= len(all_dims):
                    break
                dim = all_dims[i]
                if val != '*' and state_dict.get(dim) != val:
                    match = False
                    break
            if match:
                return True
        else:
            match = True
            for i, val in enumerate(state_vals):
                if i >= len(touches):
                    break
                dim = touches[i]
                if val != '*' and state_dict.get(dim) != val:
                    match = False
                    break
            if match:
                return True
    return False


def is_context_covered(op_name, contexts, config):
    """Check if runtime contexts are addressed by spec."""
    addressed = config.get('spec_addressed_contexts', {})
    offline_ops = config.get('offline_addressed', [])

    for dim, val in contexts.items():
        allowed = addressed.get(dim, [])
        if val not in allowed:
            return False

    if contexts.get('Connectivity') == 'offline':
        if op_name not in offline_ops:
            return False

    return True


def is_reachable(state_dict, op_name, contexts, config):
    """Apply reachability constraints."""
    constraints = config.get('reachability_constraints', [])
    for constraint in constraints:
        condition = constraint.get('condition', '')
        if not condition:
            continue
        namespace = {**state_dict, 'operation': op_name, **contexts}
        try:
            if eval(condition, {"__builtins__": {}}, namespace):
                return False
        except:
            pass

    lc = contexts.get('PageLifecycle', 'active')
    src = contexts.get('ResponseSource', 'network')
    op_cat = get_op_category(op_name, config)

    if lc in ('frozen', 'terminated'):
        if op_cat in ('FETCH', 'UI'):
            return False

    if src in ('browser_cache', 'bfcache'):
        if op_cat != 'NAV':
            return False

    return True


def super_fold(contexts):
    """Collapse redundant context combinations into labeled clusters."""
    issues = []
    lc = contexts.get('PageLifecycle', 'active')
    src = contexts.get('ResponseSource', 'network')
    conn = contexts.get('Connectivity', 'online')

    if lc in ('frozen', 'terminated'):
        issues.append('lifecycle:paused_or_dead')
    elif lc == 'hidden':
        issues.append('lifecycle:hidden')

    if src in ('browser_cache', 'bfcache'):
        issues.append('stale_page_restoration')

    if conn == 'offline':
        issues.append('offline')

    if not issues:
        return 'STATE_OP_GAP'
    return ' + '.join(sorted(issues))


def run(config_path):
    config_dir = Path(config_path).parent
    config = load_yaml(config_path)

    relations_path = config_dir / 'web-platform-relations.yaml'
    if not relations_path.exists():
        relations_path = config_dir.parent / 'web-platform-relations.yaml'
    relations_data = load_yaml(relations_path)

    entities = config.get('entities', {})
    ui_states = config.get('ui_states', {})
    all_state_dims = {**entities, **ui_states}

    operations = config.get('operations', [])
    parsed_ops = [parse_operation(op) for op in operations]

    ctx_dims = relations_data.get('context_dimensions', {})
    ctx_lists = [dim['states'] for dim in ctx_dims.values()]
    ctx_names = list(ctx_dims.keys())
    all_contexts = list(product(*ctx_lists))

    intensity = compute_effective_intensity(config)

    all_dims_count = 1
    for states in all_state_dims.values():
        all_dims_count *= len(states)
    full_product_size = all_dims_count * len(parsed_ops) * len(all_contexts)

    total_scoped = 0
    reachable = 0
    defined = 0
    undefined = []

    for op_name, touches in parsed_ops:
        if touches:
            relevant_dims = {d: all_state_dims[d] for d in touches if d in all_state_dims}
        else:
            relevant_dims = all_state_dims

        if not relevant_dims:
            relevant_dims = all_state_dims

        dim_names = list(relevant_dims.keys())
        dim_states = list(relevant_dims.values())
        scoped_states = list(product(*dim_states))

        for state_tuple in scoped_states:
            state_dict = dict(zip(dim_names, state_tuple))
            for ctx_tuple in all_contexts:
                ctx_dict = dict(zip(ctx_names, ctx_tuple))
                total_scoped += 1

                if not is_reachable(state_dict, op_name, ctx_dict, config):
                    continue
                reachable += 1

                s_o_covered = is_state_op_covered(state_dict, op_name, touches, config)
                ctx_covered = is_context_covered(op_name, ctx_dict, config) if s_o_covered else False

                if s_o_covered and ctx_covered:
                    defined += 1
                else:
                    relation, reason, edges = get_cell_relation(op_name, ctx_dict, relations_data, config)
                    undefined.append(UndefinedCell(
                        states=state_dict,
                        operation=op_name,
                        contexts=ctx_dict,
                        intensity=intensity.get(op_name, 1.0),
                        relation=relation,
                        reason=reason,
                        edge_cases=edges,
                    ))

    by_relation = defaultdict(list)
    for cell in undefined:
        by_relation[cell.relation].append(cell)

    interferes = by_relation['INTERFERES']
    clusters = defaultdict(list)
    for cell in interferes:
        key = (cell.operation, super_fold(cell.contexts))
        clusters[key].append(cell)

    cause_groups = defaultdict(list)
    for (op, cause), cells in clusters.items():
        cause_groups[cause].append({
            'operation': op,
            'cells': len(cells),
            'intensity': cells[0].intensity,
            'impact': cells[0].intensity * len(cells),
            'reason': cells[0].reason,
            'edge_cases': cells[0].edge_cases,
        })

    sorted_causes = sorted(
        cause_groups.items(),
        key=lambda x: -sum(i['impact'] for i in x[1])
    )

    print("=" * 70)
    print(f"INVARIANT PROJECTION v5: {config.get('meta', {}).get('project', 'unknown')}")
    print("=" * 70)
    print()
    print(f"Full product (v4): {full_product_size:,} cells (all dims x all ops x all contexts)")
    print(f"Scoped (v5):       {total_scoped:,} cells (touches-scoped)")
    print(f"Reduction:         {(1 - total_scoped/full_product_size)*100:.0f}%")
    print()
    print(f"Reachable:         {reachable:,} cells")
    if reachable:
        print(f"Defined by spec:   {defined:,} cells ({defined/reachable*100:.1f}%)")
    print(f"Undefined:         {len(undefined):,} cells")
    print(f"  INTERFERES:      {len(by_relation['INTERFERES']):,} (real bugs)")
    print(f"  DEGRADES:        {len(by_relation['DEGRADES']):,} (minor)")
    print(f"  TRANSPARENT:     {len(by_relation['TRANSPARENT']):,} (noise removed)")
    print()

    if undefined:
        noise = len(by_relation['TRANSPARENT']) / len(undefined) * 100
        print(f"Noise reduction:   {noise:.0f}%")
    print()

    print("=" * 70)
    print("SUPER-CLUSTERS (ranked by impact)")
    print("=" * 70)
    print()

    for i, (cause, items) in enumerate(sorted_causes, 1):
        total_impact = sum(it['impact'] for it in items)
        total_cells = sum(it['cells'] for it in items)
        ops = sorted(set(it['operation'] for it in items))
        max_int = max(it['intensity'] for it in items)
        label = {4.0: "CORE", 3.0: "GATE", 2.0: "SUPPORT", 1.0: "AMBIENT"}.get(max_int, "?")

        print(f"#{i} [{label}] {cause}")
        print(f"   Impact: {total_impact:.0f} | Cells: {total_cells}")
        print(f"   Operations: {', '.join(ops)}")
        print(f"   Why: {items[0]['reason']}")
        if items[0]['edge_cases']:
            for ec in items[0]['edge_cases'][:2]:
                print(f"   Edge: {ec}")
        print(f"   Constituents ({len(items)} scenarios folded):")
        for item in sorted(items, key=lambda x: -x['impact']):
            print(f"     - {item['operation']} ({item['cells']} cells, intensity {item['intensity']:.0f})")
        print()

    if by_relation['DEGRADES']:
        print("=" * 70)
        print(f"MINOR ISSUES ({len(by_relation['DEGRADES'])} cells)")
        print("=" * 70)
        print()
        deg_groups = defaultdict(list)
        for cell in by_relation['DEGRADES']:
            deg_groups[(cell.operation, super_fold(cell.contexts))].append(cell)
        for (op, cause), cells in sorted(deg_groups.items(), key=lambda x: -len(x[1])):
            print(f"  [{len(cells)} cells] {op} | {cause} -- {cells[0].reason}")
        print()


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python engine.py project.yaml")
        sys.exit(1)
    run(sys.argv[1])
