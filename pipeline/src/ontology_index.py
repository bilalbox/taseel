"""
Stage 0 & Step 3B: Ontology DAG Validator, Depth Calculator, and High-Speed Subgraph Retriever.
Pre-computes inverted token indexes and tree-neighborhood expansions for fast batch processing.
"""

import json
from pathlib import Path

from arabic_norm import normalize_arabic

STOP_TOKENS: set[str] = {
    "الاصل",
    "في",
    "من",
    "علي",
    "ان",
    "لا",
    "او",
    "ما",
    "كان",
    "حتي",
    "يقوم",
    "الدليل",
    "فهو",
    "اذا",
    "تحت",
    "لم",
    "به",
    "بها",
    "عن",
    "الي",
    "عند",
    "كل",
    "يرد",
    "بين",
    "بعض",
    "حكم",
    "شيء",
    "احد",
    "ولا",
    "الا",
    "فلا",
    "عليه",
    "الواجب",
    "واجب",
    "فعل",
    "يكون",
    "له",
    "لها",
    "فيها",
    "منه",
    "منها",
    "هذا",
    "هذه",
    "ذلك",
}


class OntologyGraph:
    def __init__(self, ontology_path: Path):
        with open(ontology_path, encoding="utf-8") as f:
            raw = json.load(f)

        self.version: str = raw.get("version", "1.0.0")
        self.nodes: dict[str, dict] = {}
        self.aliases: list[dict] = []
        self.relations: list[dict] = raw.get("relations", [])

        # 1. Index raw nodes & aliases
        for p in raw["principles"]:
            node_id = p["id"]
            if node_id in self.nodes:
                raise ValueError(f"Duplicate principle ID: {node_id}")

            norm_canonical = normalize_arabic(p["canonical_text_ar"])
            node_aliases = []
            for al in p.get("aliases", []):
                al_record = {
                    "id": al["id"],
                    "principle_id": node_id,
                    "alias_text_ar": al["alias_text_ar"],
                    "alias_text_norm": normalize_arabic(al["alias_text_ar"]),
                    "scholar_preference": al.get("scholar_preference"),
                    "is_colloquial_variant": int(bool(al.get("is_colloquial_variant", False))),
                }
                self.aliases.append(al_record)
                node_aliases.append(al_record)

            distinctive_tokens = [
                t for t in norm_canonical.split() if len(t) > 2 and t not in STOP_TOKENS
            ]

            self.nodes[node_id] = {
                **p,
                "canonical_text_norm": norm_canonical,
                "summary_norm": normalize_arabic(p["summary_ar"]),
                "aliases_resolved": node_aliases,
                "distinctive_tokens": distinctive_tokens,
                "depth": 0,
            }

        # 2. Validate parent_id references & compute tree depth (DAG validation)
        self._compute_and_validate_depths()

        # 3. Build Inverted Token Index & Pre-computed Neighborhood Subgraphs
        self.token_to_nodes: dict[str, set[str]] = {}
        self.neighborhood_by_node: dict[str, list[str]] = {}
        self._build_fast_indexes()

    def _compute_and_validate_depths(self) -> None:
        for node_id, node in self.nodes.items():
            visited: set[str] = {node_id}
            depth = 0
            curr = node
            while curr.get("parent_id") is not None:
                parent_id = curr["parent_id"]
                if parent_id not in self.nodes:
                    raise ValueError(f"Node '{node_id}' references missing parent '{parent_id}'")
                if parent_id in visited:
                    raise ValueError(f"Cycle detected in principles tree involving '{node_id}'")
                visited.add(parent_id)
                depth += 1
                curr = self.nodes[parent_id]
            node["depth"] = depth

    def get_children(self, node_id: str) -> list[dict]:
        return [n for n in self.nodes.values() if n.get("parent_id") == node_id]

    def get_descendants(self, node_id: str) -> list[dict]:
        result = []
        queue = [node_id]
        visited = {node_id}
        while queue:
            curr = queue.pop(0)
            for child in self.get_children(curr):
                if child["id"] not in visited:
                    visited.add(child["id"])
                    result.append(child)
                    queue.append(child["id"])
        return result

    def _build_fast_indexes(self) -> None:
        for node_id, node in self.nodes.items():
            all_tokens = set(node["distinctive_tokens"])
            for al in node["aliases_resolved"]:
                for t in al["alias_text_norm"].split():
                    if len(t) > 2 and t not in STOP_TOKENS:
                        all_tokens.add(t)

            for tok in all_tokens:
                self.token_to_nodes.setdefault(tok, set()).add(node_id)

            # Pre-compute expanded neighborhood (self + parent + descendants + graph relations)
            expanded: list[str] = []
            seen: set[str] = set()

            def _add(nid: str | None, seen_set: set[str], exp_list: list[str]) -> None:
                if nid and nid in self.nodes and nid not in seen_set:
                    seen_set.add(nid)
                    exp_list.append(nid)

            _add(node_id, seen, expanded)
            _add(node.get("parent_id"), seen, expanded)
            for desc in self.get_descendants(node_id):
                _add(desc["id"], seen, expanded)
            for rel in self.relations:
                if rel["source_id"] == node_id:
                    _add(rel["target_id"], seen, expanded)
                elif rel["target_id"] == node_id:
                    _add(rel["source_id"], seen, expanded)

            self.neighborhood_by_node[node_id] = expanded

    def retrieve_candidate_subgraph_fast(
        self, norm_query_text: str, query_tokens: set[str], top_k_seeds: int = 6
    ) -> tuple[list[dict], dict[str, dict | None]]:
        """
        High-speed O(1) inverted-index candidate subgraph retriever for 20,000+ fatwa batches.
        """
        candidate_node_ids: set[str] = set()
        for tok in query_tokens:
            if tok in self.token_to_nodes:
                candidate_node_ids.update(self.token_to_nodes[tok])

        if not candidate_node_ids:
            return [], {}

        scored: list[tuple[float, str]] = []
        matched_alias_map: dict[str, dict | None] = {}

        for node_id in candidate_node_ids:
            node = self.nodes[node_id]
            score = 0.0
            matched_alias = None

            if node["canonical_text_norm"] in norm_query_text:
                score += 6.0

            for al in node["aliases_resolved"]:
                if al["alias_text_norm"] in norm_query_text:
                    score += 5.5
                    matched_alias = al
                    break

            dist_tokens = node["distinctive_tokens"]
            if dist_tokens:
                hits = sum(1 for t in dist_tokens if t in query_tokens)
                score += (hits / len(dist_tokens)) * 3.5

            if score >= 1.5:
                matched_alias_map[node_id] = matched_alias
                scored.append((score, node_id))

        scored.sort(key=lambda x: (x[0], self.nodes[x[1]]["depth"]), reverse=True)
        seed_ids = [nid for _, nid in scored[:top_k_seeds]]

        expanded_ids: list[str] = []
        seen: set[str] = set()
        for sid in seed_ids:
            for neighbor_id in self.neighborhood_by_node[sid]:
                if neighbor_id not in seen:
                    seen.add(neighbor_id)
                    expanded_ids.append(neighbor_id)

        return [self.nodes[nid] for nid in expanded_ids], matched_alias_map
