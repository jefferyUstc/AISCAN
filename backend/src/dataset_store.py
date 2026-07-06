from __future__ import annotations

import functools
import json
import copy
import logging
import threading
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, List, Optional, Dict, Tuple
import re

import anndata as ad
import numpy as np
import pandas as pd
from pandas import Series
from scipy import sparse

import h5py

logger = logging.getLogger(__name__)

try:
    import anndata._io.specs.registry as _reg
    from anndata._io.specs.registry import IOSpec
    _reg._REGISTRY.register_read(h5py.Dataset, IOSpec("null", "0.1.0"))(lambda *a, **kw: None)
except (ImportError, AttributeError) as exc:
    logger.warning("Could not patch AnnData IO registry for h5py.Dataset: %s", exc)

from .config import get_settings
from .errors import NotFoundError
from .models import (
    DatasetOptionsResponse,
    DatasetOverview,
    DatasetResponse,
    EmbeddingOption,
    EmbeddingPoint,
    EmbeddingResponse,
    Filter,
    GeneOption,
    ObservationAttribute,
    DegResponse,
    DegGene,
    GeneExpressionResponse,
    GeneExpressionPoint,
    GeneSignatureViolinResponse,
    GOEnrichmentTerm,
    GOEnrichmentResponse,
    Drug2CellStatusResponse,
    Drug2CellDotplotData,
    Drug2CellDotplotResponse,
)


def _normalize_token(value: str) -> str:
    return value.lower().replace("-", " ").replace("_", " ").strip()


def _synchronized(method):
    """Run a public store method with its body held under ``self._lock``.

    The store is a process-wide singleton served from a threadpool, so every
    public method that reads or writes ``self.adata`` is serialized. The lock
    is reentrant (``RLock``) so a public method may call another public method
    without deadlocking.
    """

    @functools.wraps(method)
    def wrapper(self, *args, **kwargs):
        with self._lock:
            return method(self, *args, **kwargs)

    return wrapper


@dataclass
class DatasetStore:
    path: Path
    adata: ad.AnnData
    overview: DatasetResponse

    conditions: List[str]
    clusters: List[str]
    obs_attributes: List[ObservationAttribute]
    gene_options: List[GeneOption]
    gene_lookup: Dict[str, Tuple[int, str]]
    embeddings: List[EmbeddingOption]
    
    _drug2cell_use_raw: Optional[bool] = None
    _drug2cell_rank_cache: Dict[Tuple[str, Optional[bool]], Dict] = field(default_factory=dict)
    _lock: "threading.RLock" = field(default_factory=threading.RLock, repr=False, compare=False)

    @classmethod
    def load(cls, path: Path) -> "DatasetStore":
        resolved_path = Path(path).expanduser().resolve()
        if not resolved_path.exists():
            raise FileNotFoundError(f"Dataset not found at {resolved_path}")

        data = ad.read_h5ad(resolved_path)
        conditions = cls._collect_categories(data.obs.get("condition"))
        clusters = cls._collect_categories(data.obs.get("leiden"))
        obs_attributes = cls._collect_obs_attributes(data)
        gene_lookup, gene_options = cls._build_gene_catalog(data)
        embeddings = cls._available_embeddings(data)

        from .config.paths import Paths
        
        description = None
        desc_path = Paths.get_dataset_description_path(resolved_path)
        if desc_path:
            try:
                description = desc_path.read_text(encoding="utf-8")
            except Exception as e:
                print(f"Warning: Failed to read description file {desc_path}: {e}")

        overview = cls._build_overview(resolved_path, data, conditions, clusters, description=description)
        return cls(
            path=resolved_path,
            adata=data,
            overview=overview,
            conditions=conditions,
            clusters=clusters,
            obs_attributes=obs_attributes,
            gene_options=gene_options,
            gene_lookup=gene_lookup,
            embeddings=embeddings,
        )

    @staticmethod
    def _collect_categories(series: Optional[Series]) -> List[str]:
        if series is None:
            return []
        values = series.astype(str).unique().tolist()
        return [value for value in values if value]

    @staticmethod
    def _collect_obs_attributes(data: ad.AnnData) -> List[ObservationAttribute]:
        settings = get_settings()
        attributes: List[ObservationAttribute] = []
        obs = data.obs
        for column in obs.columns:
            series = obs[column]
            kind = "categorical"
            dtype_str = str(series.dtype)
            cardinality = int(series.nunique(dropna=True))
            categories: Optional[List[str]] = None
            colors: Optional[Dict[str, str]] = None

            dtype_kind = getattr(series.dtype, "kind", None)
            if dtype_kind in {"i", "u", "f"}:
                kind = "numeric"
            else:
                if cardinality <= settings.dataset_display.max_category_values:
                    if isinstance(series.dtype, pd.CategoricalDtype):
                         categories = [str(c) for c in series.cat.categories]
                    else:
                         non_null = series.dropna()
                         unique_values = pd.unique(non_null)
                         categories = sorted([value if isinstance(value, str) else str(value) for value in unique_values])
                    
                    uns_key = f"{column}_colors"
                    if uns_key in data.uns and categories:
                        uns_colors = data.uns[uns_key]
                        colors = {}
                        for i, cat in enumerate(categories):
                            if i < len(uns_colors):
                                colors[cat] = uns_colors[i]

                    if series.isna().any():
                        categories.append("NA")

            label = column.replace("_", " ").title()
            attributes.append(
                ObservationAttribute(
                    name=column,
                    label=label,
                    kind=kind,
                    cardinality=cardinality if kind == "categorical" else None,
                    dtype=dtype_str,
                    categories=categories,
                    colors=colors,
                )
            )
        attributes.sort(key=lambda attribute: attribute.name)
        return attributes

    @staticmethod
    def _build_gene_catalog(data: ad.AnnData) -> Tuple[Dict[str, Tuple[int, str]], List[GeneOption]]:
        lookup: Dict[str, Tuple[int, str]] = {}
        options: List[GeneOption] = []

        def _add_alias(alias: str, index: int, display: str) -> None:
            key = alias.strip().lower()
            if not key:
                return
            lookup.setdefault(key, (index, display))

        var_frame = data.var
        for idx, var_name in enumerate(data.var_names):
            display = str(var_name)
            aliases = {var_name}

            if "metabolites" in var_frame:
                value = var_frame.iloc[idx].get("metabolites")
                if isinstance(value, str) and value:
                    aliases.add(value)
                    display = value

            if "SC_name" in var_frame:
                raw = var_frame.iloc[idx].get("SC_name")
                if isinstance(raw, str) and raw:
                    if raw.strip().startswith("["):
                        try:
                            decoded = json.loads(raw)
                            if isinstance(decoded, list):
                                aliases.update(str(item) for item in decoded if item)
                        except Exception:
                            aliases.add(raw.strip("[]\""))
                    else:
                        aliases.add(raw.strip("[]\""))

            for alias in aliases:
                _add_alias(str(alias), idx, display)

            metadata: Dict[str, str] = {}
            row = var_frame.iloc[idx]
            for column in var_frame.columns:
                value = row.get(column)
                if pd.isna(value):
                    continue
                metadata[column] = value if isinstance(value, str) else str(value)

            options.append(
                GeneOption(
                    id=str(idx),
                    name=str(var_name),
                    symbol=display,
                    metadata=metadata,
                )
            )

        return lookup, options

    @classmethod
    def _available_embeddings(cls, data: ad.AnnData) -> List[EmbeddingOption]:
        options: List[EmbeddingOption] = []
        seen_names = set()
        
        for key in cls._obsm_keys(data):
            matrix = cls._get_obsm_matrix(data, key)
            if matrix is None:
                continue
            dims = int(matrix.shape[1]) if getattr(matrix, "shape", None) and len(matrix.shape) > 1 else 2
            
            # Generate unique display name
            base_name = key[2:] if key.startswith("X_") else key
            display_name = base_name
            
            # Handle duplicate names by adding suffix
            counter = 1
            while display_name in seen_names:
                if key.startswith("X_"):
                    display_name = f"{base_name}_X"
                else:
                    display_name = f"{base_name}_{counter}"
                counter += 1
            
            seen_names.add(display_name)
            options.append(EmbeddingOption(name=display_name, dimensions=dims, key=key))
            
        if not options:
            options.append(EmbeddingOption(name="umap", dimensions=2, key="X_umap"))
        # Sort with UMAP first, then alphabetically by name
        options.sort(key=lambda item: (0 if item.name.lower() == "umap" else 1, item.name))
        return options

    @staticmethod
    def _get_obsm_matrix(data: ad.AnnData, key: str):
        """Helper to safely access obsm matrices across AnnData versions."""
        obsm = data.obsm
        if hasattr(obsm, "__getitem__"):
            # If key is in keys(), it should be retrievable
            if key in obsm.keys():
                return obsm[key]
            return None
        return obsm.get(key)  # type: ignore[attr-defined]

    @classmethod
    def _obsm_keys(cls, data: ad.AnnData) -> List[str]:
        if hasattr(data, "obsm_keys"):
            return list(data.obsm_keys())
        return list(data.obsm.keys())  # type: ignore[attr-defined]

    @classmethod
    def _canonical_embedding_map(cls, data: ad.AnnData) -> Dict[str, str]:
        mapping: Dict[str, str] = {}
        for key in cls._obsm_keys(data):
            if not isinstance(key, str):
                continue
            base = key[2:] if key.startswith("X_") else key
            base = base.strip()
            if not base:
                continue
            mapping.setdefault(base, key)
        return mapping

    def _embedding_key(self, name: Optional[str]) -> str:
        default_name = self.overview.dataset.activeEmbedding or (self.embeddings[0].name if self.embeddings else "umap")
        target = (name or default_name or "").strip()
        if not target:
            raise ValueError("Embedding name is required")

        # prefer exact match from the cached options
        for option in self.embeddings:
            if option.name == target:
                return option.key or option.name

        canonical_map = self._canonical_embedding_map(self.adata)

        if target in canonical_map:
            return canonical_map[target]

        lowered = target.lower()
        for base_name, actual_key in canonical_map.items():
            if base_name.lower() == lowered:
                return actual_key

        for key in self._obsm_keys(self.adata):
            if not isinstance(key, str):
                continue
            if key == target or key.lower() == lowered:
                return key
            if key.startswith("X_") and key[2:].lower() == lowered:
                return key

        raise NotFoundError(f"Embedding {target} not found in AnnData")

    @classmethod
    def _compute_obs_stats(cls, data: ad.AnnData) -> Dict[str, Any]:
        """Compute statistics for each column in obs."""
        stats = {}
        for col_name in data.obs.columns:
            series = data.obs[col_name]
            if series.nunique() == len(series):
                 stats[col_name] = {"type": "unique_id", "count": len(series)}
                 continue
                 
            if pd.api.types.is_numeric_dtype(series):
                stats[col_name] = {
                    "type": "numeric",
                    "min": float(series.min()),
                    "max": float(series.max()),
                    "mean": float(series.mean()),
                    "median": float(series.median()),
                }
            else:
                # Categorical or string
                unique_vals = series.unique().tolist()
                # If too many categories, just show count and a sample
                if len(unique_vals) > 50:
                    stats[col_name] = {
                        "type": "categorical_high_cardinality",
                        "unique_count": len(unique_vals),
                        "sample": unique_vals[:10]
                    }
                else:
                    stats[col_name] = {
                        "type": "categorical",
                        "categories": unique_vals
                    }
        return stats

    @classmethod
    def _build_overview(cls, path: Path, data: ad.AnnData, conditions: List[str], clusters: List[str], description: Optional[str] = None) -> DatasetResponse:
        """Create basic dataset overview from AnnData object."""
        active_emb = "umap" if "X_umap" in data.obsm else list(data.obsm.keys())[0].replace("X_", "") if data.obsm else "none"
        
        available_embeddings = [k.replace("X_", "") for k in data.obsm.keys()]
        obs_stats = cls._compute_obs_stats(data)

        overview = DatasetOverview(
            id=path.stem,
            name=path.stem.replace("_", " ").title(),
            organism="Human",
            cellCount=data.n_obs,
            geneCount=data.n_vars,
            activeEmbedding=active_emb,
            availableEmbeddings=available_embeddings,
            obsStats=obs_stats,
            description=description,
            metrics=[
                {"name": "Conditions", "value": len(conditions)},
                {"name": "Clusters", "value": len(clusters)},
                {"name": "Avg Counts", "value": int(data.obs['total_counts'].mean()) if 'total_counts' in data.obs else 0}
            ]
        )
        return DatasetResponse(dataset=overview, activeFilters=[])

    @staticmethod
    def _to_dense(array) -> np.ndarray:
        if sparse.issparse(array):
            return array.toarray()
        return np.asarray(array)

    def _mask_for_filters(self, filters: Optional[List[Filter]]) -> Optional[np.ndarray]:
        if not filters:
            return None
        mask = np.ones(self.adata.n_obs, dtype=bool)
        obs_df = self.adata.obs
        for filter_ in filters:
            column = obs_df.get(filter_.dimension)
            if column is None:
                raise NotFoundError(f"Unknown filter dimension: {filter_.dimension}")
            comparison = column.astype(str).str.lower()
            mask &= comparison == filter_.value.lower()
        return mask

    def _subset_by_filters(self, filters: Optional[List[Filter]]) -> ad.AnnData:
        mask = self._mask_for_filters(filters)
        if mask is None:
            return self.adata
        if not mask.any():
            return self.adata[:0]
        return self.adata[mask]

    def _resolve_gene(self, query: str) -> Tuple[Optional[int], str]:
        key = query.strip().lower()
        if not key:
            return None, query
        match = self.gene_lookup.get(key)
        if match:
            return match
        return None, query

    def _expression_values(self, gene_index: int, mask: Optional[np.ndarray]) -> np.ndarray:
        matrix = self.adata.X
        if mask is not None:
            matrix = matrix[mask]
        column = matrix[:, gene_index]
        if sparse.issparse(column):
            column = column.toarray()
        return np.asarray(column).ravel()

    @staticmethod
    def _sample_indices(total: int, limit: int) -> np.ndarray:
        if total <= limit:
            return np.arange(total)
        settings = get_settings()
        np.random.seed(settings.dataset_display.random_seed)
        return np.sort(np.random.choice(total, size=limit, replace=False))

    @_synchronized
    def get_overview(self) -> DatasetResponse:
        """Get the dataset overview including statistics and metadata."""
        return self.overview

    @_synchronized
    def get_options(self) -> DatasetOptionsResponse:
        """Get the available configuration options for the dataset (filters, genes, embeddings)."""
        return DatasetOptionsResponse(
            obsAttributes=self.obs_attributes,
            geneOptions=self.gene_options,
            embeddings=self.embeddings,
        )

    @_synchronized
    def verify_filters(self, candidates: List[Filter]) -> List[Filter]:
        """
        Verify if the proposed filters (dimension/value) exist in the dataset.
        Returns only the valid filters.
        """
        valid: List[Filter] = []
        if not candidates:
            return valid

        # Prepare normalized lookups
        # 1. Check conditions
        conditions_norm = {_normalize_token(c): c for c in self.conditions}
        
        # 2. Check clusters (leiden)
        clusters_set = set(self.clusters)
        clusters_norm = {_normalize_token(c): c for c in self.clusters}

        # 3. Check categorical obs columns
        # We build a map:
        #   normalized_dimension_name -> (original_dimension_name, raw_values_set, normalized_value_to_canonical)
        obs_lookup: Dict[str, Tuple[str, set, Dict[str, str]]] = {}
        for attr in self.obs_attributes:
            if attr.kind != "numeric" and attr.categories:
                # Store normalized dim name
                dim_norm = _normalize_token(attr.name)
                raw_values = list(attr.categories)
                raw_set = set(raw_values)
                norm_to_canonical = {_normalize_token(v): v for v in raw_values}
                obs_lookup[dim_norm] = (attr.name, raw_set, norm_to_canonical)

        for cand in candidates:
            dim_lower = _normalize_token(cand.dimension)
            val_norm = _normalize_token(cand.value)
            
            # Case A: Dimension is 'condition'
            if dim_lower == "condition":
                if val_norm in conditions_norm:
                    # Found valid condition
                    real_val = conditions_norm[val_norm]
                    valid.append(Filter(dimension="condition", value=real_val))
                continue

            # Case B: Explicit obs column (covers datasets where a column is literally named "cluster")
            if dim_lower in obs_lookup:
                real_dim_name, raw_set, norm_to_canonical = obs_lookup[dim_lower]

                # 1) Exact raw match (already canonical)
                if cand.value in raw_set:
                    valid.append(Filter(dimension=real_dim_name, value=cand.value))
                    continue

                # 2) Normalized match -> map back to canonical raw category string
                if val_norm in norm_to_canonical:
                    valid.append(Filter(dimension=real_dim_name, value=norm_to_canonical[val_norm]))
                    continue

            # Case C: Dimension is 'leiden' or a 'cluster' alias for leiden.
            # NOTE: Only treat "cluster" as an alias for leiden if the dataset does NOT have an obs column named "cluster".
            if dim_lower in ("leiden", "clusters") or (dim_lower == "cluster" and "cluster" not in obs_lookup):
                # Prefer exact match first
                if cand.value in clusters_set:
                    valid.append(Filter(dimension="leiden", value=cand.value))
                    continue

                # Clean up value (e.g. "cluster 1" -> "1") and try again
                val_clean = cand.value.strip().lower().replace("cluster", "").strip()
                if val_clean in clusters_set:
                    valid.append(Filter(dimension="leiden", value=val_clean))
                    continue

                # Finally, try normalized lookup (handles case/punctuation variants)
                if val_norm in clusters_norm:
                    valid.append(Filter(dimension="leiden", value=clusters_norm[val_norm]))
                continue
            
        return valid

    @_synchronized
    def verify_genes(self, candidates: List[str]) -> Dict[str, List[str]]:
        """
        Verify candidate gene names against the dataset's gene catalog (adata.var_names).

        Returns:
            { "found": [canonical_gene_names], "not_found": [original_candidates_not_found] }
        """
        found: List[str] = []
        not_found: List[str] = []
        if not candidates:
            return {"found": found, "not_found": not_found}

        # Use the same lookup built from adata.var_names (case-insensitive).
        for raw in candidates:
            if raw is None:
                continue
            cand = str(raw).strip()
            if not cand:
                continue
            key = cand.lower()
            payload = self.gene_lookup.get(key)
            if payload:
                # payload is (index, display); canonical gene name is var_names[index]
                idx = payload[0]
                canonical = str(self.adata.var_names[idx])
                found.append(canonical)
            else:
                not_found.append(cand)

        return {"found": found, "not_found": not_found}

    @_synchronized
    def verify_embeddings(self, candidates: List[str]) -> Dict[str, List[str]]:
        """
        Verify candidate embedding names against available embeddings in the dataset.

        Canonical names are the values in `self.embeddings[*].name` (e.g. "tsne", "umap").
        """
        found: List[str] = []
        not_found: List[str] = []
        if not candidates:
            return {"found": found, "not_found": not_found}

        available = [e.name for e in (self.embeddings or []) if getattr(e, "name", None)]
        # Normalize by removing separators and lowercasing.
        def norm(s: str) -> str:
            return "".join(ch for ch in s.lower() if ch.isalnum())

        canon_by_norm = {norm(name): name for name in available}
        # Also accept obsm keys like "X_tsne"
        for name in available:
            canon_by_norm[norm(f"X_{name}")] = name

        for raw in candidates:
            if raw is None:
                continue
            cand = str(raw).strip()
            if not cand:
                continue
            key = norm(cand)
            if key in canon_by_norm:
                found.append(canon_by_norm[key])
            else:
                not_found.append(cand)

        return {"found": found, "not_found": not_found}

    @_synchronized
    def get_embedding(
        self,
        limit: Optional[int] = None,
        *,
        embedding_name: Optional[str] = None,
        color_by: Optional[str] = None,
        filters: Optional[List[Filter]] = None,
        sample_fraction: Optional[float] = None,
    ) -> EmbeddingResponse:
        """
        Get embedding data for visualization.
        
        Args:
            limit: Maximum number of points to return
            embedding_name: Name of the embedding to use (e.g., umap, tsne)
            color_by: Dimension to color by (obs:column_name or gene:gene_name)
            filters: List of filters to apply
            sample_fraction: Fraction of dataset to sample (0.0 to 1.0)
        """
        if limit is None:
            limit = get_settings().dataset_display.default_embedding_limit
        default_embedding = self.overview.dataset.activeEmbedding or (self.embeddings[0].name if self.embeddings else "umap")
        resolved_embedding = embedding_name or default_embedding
        embedding_key = self._embedding_key(resolved_embedding)
        matrix = self.adata.obsm.get(embedding_key)
        if matrix is None:
            raise NotFoundError(f"Embedding {resolved_embedding} not found in AnnData")

        mask = self._mask_for_filters(filters)
        if mask is not None:
            matrix = matrix[mask]
            obs_frame = self.adata.obs.loc[mask]
        else:
            obs_frame = self.adata.obs

        total_cells = matrix.shape[0]
        limit = max(1, limit)
        dims_for_empty = int(matrix.shape[1]) if getattr(matrix, 'shape', None) and len(matrix.shape) > 1 else 2
        if total_cells == 0:
            return EmbeddingResponse(
                embedding=resolved_embedding,
                totalCells=0,
                sampledCells=0,
                points=[],
                colorBy=color_by,
                colorMode=None,
                dimensions=dims_for_empty,
            )

        indices = self._sample_indices(total_cells, limit)
        obs_subset = obs_frame.iloc[indices]
        coords = np.asarray(matrix[indices])

        color_mode: Optional[str] = None
        color_label: Optional[str] = None
        label_series = None
        value_array = None

        if color_by:
            kind, _, target = color_by.partition(":")
            kind = kind.strip().lower()
            target = target.strip()
            if kind == "obs" and target in obs_frame.columns:
                column_values = obs_subset[target]
                dtype_kind = getattr(column_values.dtype, "kind", None)
                if dtype_kind in {"i", "u", "f"}:
                    value_array = column_values.to_numpy(dtype=float, copy=True)
                    color_mode = "continuous"
                    color_label = target
                else:
                    label_series = column_values.astype(str).fillna("NA")
                    color_mode = "categorical"
                    color_label = target
            elif kind == "gene":
                gene_index, display = self._resolve_gene(target)
                if gene_index is not None:
                    values = self._expression_values(gene_index, mask)
                    if values.size:
                        value_array = values[indices]
                        color_mode = "continuous"
                        color_label = display or target

        points: List[EmbeddingPoint] = []
        clusters = obs_subset["leiden"].astype(str) if "leiden" in obs_subset else None
        conditions = obs_subset["condition"].astype(str) if "condition" in obs_subset else None

        for i, obs_index in enumerate(obs_subset.index):
            x_val, y_val = float(coords[i, 0]), float(coords[i, 1])
            z_val = float(coords[i, 2]) if coords.shape[1] > 2 else None
            cluster = clusters.iloc[i] if clusters is not None else None
            condition = conditions.iloc[i] if conditions is not None else None
            label = label_series.iloc[i] if label_series is not None else None
            if value_array is not None:
                raw_value = value_array[i]
                value = float(raw_value) if np.isfinite(raw_value) else None
            else:
                value = None
            points.append(
                EmbeddingPoint(
                    id=str(obs_index),
                    x=x_val,
                    y=y_val,
                    cluster=cluster,
                    condition=condition,
                    label=label,
                    value=value,
                    z=z_val,
                )
            )

        resolved_color_by = color_by
        if not resolved_color_by and "leiden" in obs_frame.columns:
            resolved_color_by = "obs:leiden"
            color_mode = color_mode or "categorical"
            color_label = color_label or "leiden"

        dims = int(coords.shape[1]) if coords.ndim > 1 else 2

        return EmbeddingResponse(
            embedding=resolved_embedding,
            totalCells=total_cells,
            sampledCells=len(points),
            points=points,
            colorBy=resolved_color_by,
            colorMode=color_mode,
            dimensions=dims,
        )

    @_synchronized
    def get_deg_groups(self) -> List[str]:
        if "rank_genes_groups" not in self.adata.uns:
            return []
        
        rgg = self.adata.uns["rank_genes_groups"]
        if "names" not in rgg:
            return []
        
        names = rgg["names"]
        if hasattr(names, "dtype") and names.dtype.names:
            return list(names.dtype.names)
        if hasattr(names, "columns"):
            return list(names.columns)
        if isinstance(names, dict):
            return list(names.keys())
        
        return []

    @_synchronized
    def get_deg_data(self, group: str) -> DegResponse:
        """
        Get differentially expressed genes for a specific group.
        
        Args:
            group: Name of the group to retrieve DEGs for
        """
        groups = self.get_deg_groups()
        if group not in groups:
            return DegResponse(groups=groups, currentGroup=None, genes=[])
        
        rgg = self.adata.uns["rank_genes_groups"]
        
        def _get_col(key, grp):
            if key not in rgg:
                return None
            obj = rgg[key]
            if hasattr(obj, "dtype") and obj.dtype.names and grp in obj.dtype.names:
                return obj[grp]
            if hasattr(obj, "columns") and grp in obj.columns:
                return obj[grp].values
            if isinstance(obj, dict) and grp in obj:
                return obj[grp]
            return None

        names = _get_col("names", group)
        if names is None:
             return DegResponse(groups=groups, currentGroup=group, genes=[])

        count = len(names)
        lfc = _get_col("logfoldchanges", group)
        pvals = _get_col("pvals", group)
        pvals_adj = _get_col("pvals_adj", group)
        scores = _get_col("scores", group)
        
        genes: List[DegGene] = []
        
        gene_indices = []
        valid_indices = []
        
        for i, name in enumerate(names):
            idx, _ = self._resolve_gene(str(name))
            gene_indices.append(idx)
            if idx is not None:
                valid_indices.append(i)
        
        means = np.zeros(count)
        if valid_indices:
            real_indices = [gene_indices[i] for i in valid_indices]
            
            groupby = None
            if "rank_genes_groups" in self.adata.uns and "params" in self.adata.uns["rank_genes_groups"]:
                params = self.adata.uns["rank_genes_groups"]["params"]
                if "groupby" in params:
                    groupby = params["groupby"]
            
            if groupby and groupby in self.adata.obs:
                group_mask_series = self.adata.obs[groupby] == group
                group_mask = np.asarray(group_mask_series.to_numpy(), dtype=bool)
                sub_X = self.adata.X[group_mask, :][:, real_indices]
            else:
                raise ValueError(f"Could not calculate group mean: grouping column '{groupby}' not found in dataset.")

            if sparse.issparse(sub_X):
                calculated_means = np.array(sub_X.mean(axis=0)).flatten()
            else:
                calculated_means = np.mean(sub_X, axis=0)
            
            for i, val in zip(valid_indices, calculated_means):
                means[i] = val

        for i in range(count):
            genes.append(DegGene(
                id=str(gene_indices[i]) if gene_indices[i] is not None else f"unknown_{i}",
                name=str(names[i]),
                logfoldchanges=float(lfc[i]) if lfc is not None else 0.0,
                pvals=float(pvals[i]) if pvals is not None else 1.0,
                pvals_adj=float(pvals_adj[i]) if pvals_adj is not None else 1.0,
                scores=float(scores[i]) if scores is not None else 0.0,
                mean_expression=float(means[i])
            ))
            
        return DegResponse(groups=groups, currentGroup=group, genes=genes)

    @_synchronized
    def get_gene_expression_by_group(self, gene: str, groupby: Optional[str] = None) -> GeneExpressionResponse:
        """
        Get gene expression values grouped by an observation column.

        Args:
            gene: Gene name or symbol
            groupby: Observation column to group by
        """
        idx, display = self._resolve_gene(gene)
        if idx is None:
             raise NotFoundError(f"Gene {gene} not found")
        
        if groupby is None:
            if "rank_genes_groups" in self.adata.uns and "params" in self.adata.uns["rank_genes_groups"]:
                params = self.adata.uns["rank_genes_groups"]["params"]
                if "groupby" in params:
                    groupby = params["groupby"]
        
        if groupby is None:
             raise ValueError("Grouping information not found in analysis params. Cannot determine groups for plot.")

        if groupby not in self.adata.obs:
             raise NotFoundError(f"Group by column '{groupby}' not found in dataset.")
        
        groups = self.adata.obs[groupby].astype(str)
        values = self._expression_values(idx, mask=None)
        
        points = []
        limit = 5000
        indices = self._sample_indices(len(values), limit)
        
        for i in indices:
            points.append(GeneExpressionPoint(
                id=str(self.adata.obs_names[i]),
                group=str(groups.iloc[i]),
                value=float(values[i])
            ))
            
        return GeneExpressionResponse(gene=display or gene, points=points)

    @_synchronized
    def get_categorical_obs_columns(self) -> List[str]:
        """Return list of categorical observation columns suitable for grouping."""
        categorical_cols = []
        for attr in self.obs_attributes:
            if attr.kind != "numeric":
                categorical_cols.append(attr.name)
        return categorical_cols

    @_synchronized
    def get_gene_signature_violin(
        self,
        genes: List[str],
        groupby: str,
        signature_name: str = "signature"
    ) -> GeneSignatureViolinResponse:
        """
        Compute gene signature scores using scanpy's score_genes and return violin plot data.
        
        Args:
            genes: List of gene names/symbols to include in the signature
            groupby: Observation column to group by for visualization
            signature_name: Name for the signature (used as score column name)
            
        Returns:
            GeneSignatureViolinResponse with per-cell scores grouped by the specified column
        """
        import scanpy as sc
        
        if groupby not in self.adata.obs:
            raise NotFoundError(f"Group by column '{groupby}' not found in dataset.")
        
        genes_found = []
        genes_not_found = []
        gene_list_for_scoring = []
        
        for gene in genes:
            idx, display = self._resolve_gene(gene.strip())
            if idx is not None:
                var_name = str(self.adata.var_names[idx])
                gene_list_for_scoring.append(var_name)
                genes_found.append(gene.strip())
            else:
                genes_not_found.append(gene.strip())
        
        if not gene_list_for_scoring:
            raise ValueError("No valid genes found in the provided list.")
        
        score_key = f"score_{signature_name}"
        
        sc.tl.score_genes(
            self.adata,
            gene_list=gene_list_for_scoring,
            score_name=score_key,
            use_raw=False
        )
        
        scores = self.adata.obs[score_key].values
        groups = self.adata.obs[groupby].astype(str)
        
        points = []
        limit = 5000
        indices = self._sample_indices(len(scores), limit)
        
        for i in indices:
            score_val = float(scores[i])
            if not np.isfinite(score_val):
                score_val = 0.0
            points.append(GeneExpressionPoint(
                id=str(self.adata.obs_names[i]),
                group=str(groups.iloc[i]),
                value=score_val
            ))
        
        return GeneSignatureViolinResponse(
            signature_name=signature_name,
            genes_found=genes_found,
            genes_not_found=genes_not_found,
            groupby=groupby,
            points=points
        )

    @_synchronized
    def get_go_enrichment(
        self,
        group: str,
        min_lfc: float = 0.5,
        max_pval: float = 0.05,
        library: str = "GO_Biological_Process_2023"
    ) -> GOEnrichmentResponse:
        """
        Perform GO enrichment analysis on differentially expressed genes.
        
        Args:
            group: Cluster/group name to analyze
            min_lfc: Minimum log fold change threshold (only positive LFC genes used)
            max_pval: Maximum adjusted p-value threshold
            library: GO library to use from blitzgsea enrichr
            
        Returns:
            GOEnrichmentResponse with enriched GO terms
        """
        import blitzgsea as blitz
        from scipy.stats import hypergeom
        from statsmodels.stats.multitest import multipletests
        
        deg_response = self.get_deg_data(group)
        if not deg_response.genes:
            return GOEnrichmentResponse(
                group=group,
                total_deg_genes=0,
                filtered_genes=[],
                terms=[]
            )
        
        filtered_genes = [
            g.name for g in deg_response.genes
            if g.logfoldchanges > 0 and g.logfoldchanges >= min_lfc and g.pvals_adj <= max_pval
        ]
        
        if not filtered_genes:
            return GOEnrichmentResponse(
                group=group,
                total_deg_genes=len(deg_response.genes),
                filtered_genes=[],
                terms=[]
            )
        
        try:
            go_library = blitz.enrichr.get_library(library)
        except Exception as e:
            raise ValueError(f"Failed to load GO library '{library}': {e}")
        
        background_genes = set(str(name) for name in self.adata.var_names)
        query_genes = set(filtered_genes)
        
        all_library_genes = set()
        for genes in go_library.values():
            all_library_genes.update(genes)
        
        effective_background = background_genes & all_library_genes
        query_in_background = query_genes & effective_background
        
        if not query_in_background:
            return GOEnrichmentResponse(
                group=group,
                total_deg_genes=len(deg_response.genes),
                filtered_genes=filtered_genes,
                terms=[]
            )
        
        N = len(effective_background)
        n = len(query_in_background)
        
        results = []
        for term_name, term_genes in go_library.items():
            term_genes_set = set(term_genes)
            term_in_background = term_genes_set & effective_background
            K = len(term_in_background)
            
            if K == 0:
                continue
            
            overlap = query_in_background & term_genes_set
            k = len(overlap)
            
            if k == 0:
                continue
            
            pval = hypergeom.sf(k - 1, N, K, n)
            
            expected = (K * n) / N if N > 0 else 0
            odds_ratio = k / expected if expected > 0 else float('inf')
            
            results.append({
                'term': term_name,
                'pval': pval,
                'overlap_count': k,
                'gene_set_size': K,
                'odds_ratio': odds_ratio,
                'genes': list(overlap)
            })
        
        if not results:
            return GOEnrichmentResponse(
                group=group,
                total_deg_genes=len(deg_response.genes),
                filtered_genes=filtered_genes,
                terms=[]
            )
        
        pvals = [r['pval'] for r in results]
        _, pvals_adj, _, _ = multipletests(pvals, method='fdr_bh')
        
        for i, r in enumerate(results):
            r['pval_adj'] = pvals_adj[i]
            if pvals_adj[i] > 0:
                r['neg_log10_pval_adj'] = -np.log10(pvals_adj[i])
            else:
                r['neg_log10_pval_adj'] = 300.0
        
        results.sort(key=lambda x: x['neg_log10_pval_adj'], reverse=True)
        
        significant_results = [r for r in results if r['pval'] <= 0.05]
        
        terms = [
            GOEnrichmentTerm(
                term=r['term'],
                pval=float(r['pval']),
                pval_adj=float(r['pval_adj']),
                neg_log10_pval_adj=float(r['neg_log10_pval_adj']),
                odds_ratio=float(r['odds_ratio']) if r['odds_ratio'] != float('inf') else 999.0,
                overlap_count=int(r['overlap_count']),
                gene_set_size=int(r['gene_set_size']),
                genes=r['genes']
            )
            for r in significant_results
        ]
        
        return GOEnrichmentResponse(
            group=group,
            total_deg_genes=len(deg_response.genes),
            filtered_genes=filtered_genes,
            terms=terms
        )

    @_synchronized
    def get_drug2cell_status(self) -> Drug2CellStatusResponse:
        """Get current Drug2Cell computation status."""
        if 'drug2cell' in self.adata.uns:
            return Drug2CellStatusResponse(
                status="ready",
                message="Drug2Cell scores computed and ready",
                use_raw=self._drug2cell_use_raw
            )
        return Drug2CellStatusResponse(
            status="not_computed",
            message="Drug2Cell scores not yet computed. Click 'Score Cells' to compute.",
            use_raw=None
        )

    @_synchronized
    def compute_drug2cell_score(self, use_raw: bool = True) -> Drug2CellStatusResponse:
        """
        Compute drug2cell scores for cells.
        
        Args:
            use_raw: Whether to use raw data layer
            
        Returns:
            Status response with computation result
        """
        import drug2cell as d2c
        if 'drug2cell' not in self.adata.uns:
            d2c.score(self.adata, use_raw=use_raw)
            self._drug2cell_use_raw = use_raw
            self._drug2cell_rank_cache.clear()
            
        return Drug2CellStatusResponse(
            status="ready",
            message=f"Drug2Cell scores computed ({len(self.adata.uns['drug2cell'].var_names)} drugs)",
            use_raw=use_raw
        )

    @_synchronized
    def get_drug2cell_dotplot(
        self,
        groupby: str,
        n_genes: int = 10,
        split_by: Optional[str] = None
    ) -> Drug2CellDotplotResponse:
        """
        Get data for Drug2Cell dotplot visualization.
        
        Args:
            groupby: Observation column to group by
            n_genes: Number of top drugs to show per group
            split_by: Optional column to split groups by (visualization only)
            
        Returns:
            Dotplot data for visualization
        """
        import scanpy as sc
        
        if 'drug2cell' not in self.adata.uns:
            raise ValueError("Drug2Cell scores not computed. Run compute_drug2cell_score first.")
        
        d2c_adata = self.adata.uns['drug2cell']
        
        if split_by and split_by not in d2c_adata.obs:
            raise NotFoundError(f"Split by column '{split_by}' not found in dataset.")
        
        cache_key = (groupby, self._drug2cell_use_raw)

        if cache_key in self._drug2cell_rank_cache:
            d2c_adata.uns['rank_genes_groups'] = self._drug2cell_rank_cache[cache_key]
        elif 'rank_genes_groups' in d2c_adata.uns:
            existing_rgg = d2c_adata.uns['rank_genes_groups']
            existing_groupby = existing_rgg.get('params', {}).get('groupby')
            if existing_groupby == groupby:
                self._drug2cell_rank_cache[cache_key] = existing_rgg
            else:
                sc.tl.rank_genes_groups(d2c_adata, groupby=groupby, method='wilcoxon', n_genes=50)
                self._drug2cell_rank_cache[cache_key] = d2c_adata.uns['rank_genes_groups']
        else:
            sc.tl.rank_genes_groups(d2c_adata, groupby=groupby, method='wilcoxon', n_genes=50)
            self._drug2cell_rank_cache[cache_key] = d2c_adata.uns['rank_genes_groups']
        
        groups = list(d2c_adata.obs[groupby].unique())
        rgg = d2c_adata.uns['rank_genes_groups']
        names_matrix = rgg['names']
        scores_matrix = rgg['scores']
        use_recarray = isinstance(names_matrix, np.recarray)

        all_drugs: set = set()
        score_lookup: Dict[str, Dict[str, float]] = {}

        for group in groups:
            if use_recarray:
                group_names = list(names_matrix[group])
                group_scores = list(scores_matrix[group])
            else:
                group_names = [names_matrix[i][group] for i in range(len(names_matrix))]
                group_scores = [scores_matrix[i][group] for i in range(len(scores_matrix))]

            all_drugs.update(group_names[:n_genes])
            score_lookup[group] = {name: float(group_scores[idx]) for idx, name in enumerate(group_names)}

        drug_idx_map = {name: idx for idx, name in enumerate(d2c_adata.var_names)}
        ordered_drugs: List[str] = []
        drug_indices: List[int] = []
        for drug in sorted(all_drugs):
            idx = drug_idx_map.get(drug)
            if idx is None:
                continue
            ordered_drugs.append(drug)
            drug_indices.append(idx)

        X_matrix = d2c_adata.X
        is_sparse = sparse.issparse(X_matrix)
        if is_sparse and not isinstance(X_matrix, sparse.csc_matrix):
            X_matrix = X_matrix.tocsc()

        drug_indices_arr = np.array(drug_indices)
        n_drugs = len(drug_indices)
        
        if split_by:
            base_labels = d2c_adata.obs[groupby].astype(str).values
            split_labels = d2c_adata.obs[split_by].astype(str).values
            combined_labels = np.array([f"{g}-{s}" for g, s in zip(base_labels, split_labels)])
            
            # Get unique values for ordered group generation
            unique_splits = sorted(set(split_labels))
            unique_base = sorted(set(base_labels))
            
            ordered_split_groups = []
            for base in unique_base:
                for sp in unique_splits:
                    combo = f"{base}-{sp}"
                    if combo in combined_labels:
                        ordered_split_groups.append(combo)
            # Remove duplicates preserving order
            seen = set()
            ordered_split_groups = [g for g in ordered_split_groups if not (g in seen or seen.add(g))]
        else:
            combined_labels = d2c_adata.obs[groupby].astype(str).values
            ordered_split_groups = None
        
        # Pre-slice the drug columns once
        if is_sparse:
            X_drugs = X_matrix[:, drug_indices_arr]
        else:
            X_drugs = np.asarray(X_matrix)[:, drug_indices_arr]

        unique_groups, group_inverse = np.unique(combined_labels, return_inverse=True)
        n_groups = len(unique_groups)
        
        mean_expr_all = np.zeros((n_groups, n_drugs))
        frac_expr_all = np.zeros((n_groups, n_drugs))
        group_counts = np.bincount(group_inverse, minlength=n_groups)

        for cell_idx in range(X_drugs.shape[0]):
            g_idx = group_inverse[cell_idx]
            if is_sparse:
                row = np.asarray(X_drugs[cell_idx].todense()).ravel()
            else:
                row = X_drugs[cell_idx]
            mean_expr_all[g_idx] += row
            frac_expr_all[g_idx] += (row > 0).astype(float)

        for g_idx in range(n_groups):
            if group_counts[g_idx] > 0:
                mean_expr_all[g_idx] /= group_counts[g_idx]
                frac_expr_all[g_idx] /= group_counts[g_idx]

        score_matrix = np.zeros((n_groups, n_drugs))
        for g_idx, g in enumerate(unique_groups):
            base_group = g.rsplit('-', 1)[0] if split_by else g
            g_scores = score_lookup.get(base_group, {})
            for d_idx, drug in enumerate(ordered_drugs):
                score_matrix[g_idx, d_idx] = g_scores.get(drug, 0.0)

        from scipy.cluster.hierarchy import linkage, leaves_list

        drug_order = np.arange(n_drugs)

        if split_by and ordered_split_groups:
            group_order = [list(unique_groups).index(g) for g in ordered_split_groups if g in unique_groups]
            group_order = np.array(group_order)
        elif n_groups >= 2:
            group_linkage = linkage(score_matrix, method='average', metric='euclidean')
            group_order = leaves_list(group_linkage)
        else:
            group_order = np.arange(n_groups)

        ordered_drugs = [ordered_drugs[i] for i in drug_order]
        mean_expr_all = mean_expr_all[:, drug_order]
        frac_expr_all = frac_expr_all[:, drug_order]
        score_matrix = score_matrix[:, drug_order]
        
        clustered_groups = [unique_groups[i] for i in group_order]
        mean_expr_all = mean_expr_all[group_order, :]
        frac_expr_all = frac_expr_all[group_order, :]
        score_matrix = score_matrix[group_order, :]

        # Generate data points with clustered order
        data_points = []
        for g_idx, group in enumerate(clustered_groups):
            for d_idx, drug in enumerate(ordered_drugs):
                data_points.append(Drug2CellDotplotData(
                    drug=drug,
                    group=str(group),
                    mean_expression=float(mean_expr_all[g_idx, d_idx]),
                    fraction_expressing=float(frac_expr_all[g_idx, d_idx])
                ))

        return Drug2CellDotplotResponse(
            groupby=groupby,
            groups=[str(g) for g in clustered_groups],
            drugs=ordered_drugs,
            data=data_points,
            n_genes=n_genes
        )

    def _get_pathways_dir(self) -> Path:
        return Path(__file__).parent / "pathways_DBs"

    @_synchronized
    def get_pathway_categories(self) -> List[str]:
        """List available pathway database files."""
        p_dir = self._get_pathways_dir()
        if not p_dir.exists():
            return []
        
        categories = []
        for f in p_dir.iterdir():
            if f.is_file() and f.suffix == ".txt":
                categories.append(f.name)
        return sorted(categories)

    @_synchronized
    def get_pathways_in_category(self, category_file: str) -> List[str]:
        """List pathway names within a specific category file."""
        p_path = self._get_pathways_dir() / category_file
        if not p_path.exists():
             raise NotFoundError(f"Category {category_file} not found")
        
        pathways = []
        try:
            with open(p_path, 'r', encoding='utf-8') as f:
                for line in f:
                    parts = line.strip().split('\t')
                    if parts:
                        pathways.append(parts[0])
        except Exception as e:
            raise ValueError(f"Failed to read category file: {e}")
            
        return pathways

    @_synchronized
    def get_genes_in_pathway(self, category_file: str, pathway_name: str) -> List[str]:
        """Get list of genes for a specific pathway."""
        p_path = self._get_pathways_dir() / category_file
        if not p_path.exists():
            raise NotFoundError(f"Category {category_file} not found")
            
        try:
            with open(p_path, 'r', encoding='utf-8') as f:
                for line in f:
                    parts = line.strip().split('\t')
                    if parts and parts[0] == pathway_name:
                        if len(parts) > 2:
                            return [g for g in parts[2:] if g.strip()]
                        return []
        except Exception as e:
            raise ValueError(f"Failed to read pathway file: {e}")
            
        raise NotFoundError(f"Pathway {pathway_name} not found in {category_file}")
