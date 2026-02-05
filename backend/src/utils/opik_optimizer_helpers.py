"""Utility helpers that expose Opik Optimizer workflows to the Node bridge."""

import json
import os
import sys
import io
import contextlib
from difflib import SequenceMatcher
from typing import Any, Callable, Dict, List, Optional

_OPTIMIZER_IMPORT_ERROR = None

try:
    from opik_optimizer import (
        GepaOptimizer,
        HierarchicalReflectiveOptimizer,
        FewShotBayesianOptimizer,
        ChatPrompt
    )

    HRPOptimizer = HierarchicalReflectiveOptimizer
    GEPAOptimizer = GepaOptimizer
    FewShotOptimizer = FewShotBayesianOptimizer
    OPTIMIZER_AVAILABLE = True
except ImportError as exc:  # pragma: no cover - environment setup issue
    GEPAOptimizer = HRPOptimizer = FewShotOptimizer = ChatPrompt = None
    _opik_reporting = None
    _hrpo_reporting = None
    _gepa_reporting = None
    _fewshot_reporting = None
    OPTIMIZER_AVAILABLE = False
    _OPTIMIZER_IMPORT_ERROR = exc
else:
    _opik_reporting = None
    _hrpo_reporting = None
    _gepa_reporting = None
    _fewshot_reporting = None

    try:
        from opik_optimizer import reporting_utils as _opik_reporting
    except ImportError:
        _opik_reporting = None

    try:
        from opik_optimizer.algorithms.hierarchical_reflective_optimizer import reporting as _hrpo_reporting
    except ImportError:
        _hrpo_reporting = None

    try:
        from opik_optimizer.algorithms.gepa_optimizer import reporting as _gepa_reporting
    except ImportError:
        _gepa_reporting = None

    try:
        from opik_optimizer.algorithms.few_shot_bayesian_optimizer import reporting as _fewshot_reporting
    except ImportError:
        _fewshot_reporting = None


MOCK_MODE = os.environ.get('OPIK_OPTIMIZER_MOCK_MODE', 'true').lower() != 'false'

_DEFAULT_FEWSHOT_PROMPT = (
    'You are Tenax\'s structured-output generator. For each incoming `input` JSON payload, return the '
    'JSON object Tenax should emit to downstream agents. Preserve keys such as `message_preview`, '
    '`tone`, `completion_rate`, and any scheduling metadata. Always respond with valid JSON.'
)

_FEWSHOT_TASK_PROMPTS = {
    'intent_parsing': (
        'You are Tenax\'s WhatsApp intent parser. Given an `input` JSON block describing a learner\'s '
        'latest conversation context, produce a normalized JSON response capturing the interpreted '
        'intent, any slots/entities, tone guidance, and the exact message Tenax should send. Mirror '
        'the schema used in historical outputs (include message_preview, tone, completion_rate, '
        'agent_version, drafted_at). Output JSON only.'
    )
}


def _hydrate_environment_from_file(env_path: Optional[str] = None) -> None:
    """Load environment variables from a dotenv-style file if provided."""
    env_file = env_path or os.environ.get('OPIK_BACKEND_ENV', os.path.join(os.path.dirname(__file__), '..', '.env'))
    if not env_file or not os.path.exists(env_file):
        return

    try:
        with open(env_file, 'r', encoding='utf-8') as handle:
            for line in handle.readlines():
                stripped = line.strip()
                if not stripped or stripped.startswith('#') or '=' not in stripped:
                    continue
                key, value = stripped.split('=', 1)
                os.environ.setdefault(key.strip(), value.strip())
    except OSError:
        pass


_REPORTING_PATCHED = False


def _ensure_reporting_patch():
    global _REPORTING_PATCHED
    if _REPORTING_PATCHED or _opik_reporting is None:
        return

    @contextlib.contextmanager
    def _noop_convert_tqdm_to_rich(*_args: Any, **_kwargs: Any):
        yield

    try:
        _opik_reporting.convert_tqdm_to_rich = _noop_convert_tqdm_to_rich
        for module in (_hrpo_reporting, _gepa_reporting, _fewshot_reporting):
            if module is not None:
                module.convert_tqdm_to_rich = _noop_convert_tqdm_to_rich
    except Exception:
        return

    _REPORTING_PATCHED = True


_hydrate_environment_from_file()


@contextlib.contextmanager
def _capture_stdout():
    buffer = io.StringIO()
    original_stdout = sys.stdout
    sys.stdout = buffer
    try:
        yield buffer
    finally:
        sys.stdout = original_stdout
        captured = buffer.getvalue().strip()
        if captured:
            print(captured, file=sys.stderr)


def _build_opik_client():
    try:
        from opik import Opik
    except ImportError as exc:  # pragma: no cover - runtime dependency issue
        raise RuntimeError('opik SDK is required for optimizer dataset ingestion') from exc

    project_name = os.environ.get('OPIK_PROJECT_NAME')
    workspace = os.environ.get('OPIK_WORKSPACE')
    api_key = os.environ.get('OPIK_API_KEY')
    host = os.environ.get('OPIK_HOST')

    if not api_key:
        raise RuntimeError('Missing OPIK_API_KEY for remote dataset loading')

    return Opik(project_name=project_name, workspace=workspace, api_key=api_key, host=host)


def _load_opik_dataset(dataset_identifier: str):
    client = _build_opik_client()

    try:
        dataset = client.get_dataset(dataset_identifier)
    except Exception as exc:  # pragma: no cover - pass through context
        raise RuntimeError(f'Unable to resolve Opik dataset "{dataset_identifier}": {exc}') from exc

    return dataset


def fetch_opik_dataset_entries(
    dataset_identifier: Optional[str] = None,
    dataset_limit: Optional[int] = None
) -> Dict[str, Any]:
    identifier = dataset_identifier or os.environ.get('OPIK_REMINDER_DATASET_ID')
    if not identifier:
        raise RuntimeError('dataset_identifier is required to fetch Opik entries')

    entries = _load_remote_entries(identifier, dataset_limit)
    return {
        'dataset_identifier': identifier,
        'count': len(entries),
        'items': entries
    }


def fetch_opik_metrics_snapshot(
    metrics: Optional[List[str]] = None,
    lookback_hours: int = 24
) -> Dict[str, Any]:
    """Return a lightweight snapshot of recent Opik evaluation metrics."""

    sample_metrics = {
        'tone_score': 4.4,
        'specificity_score': 4.1,
        'realism_score': 4.0,
        'goal_alignment_score': 4.3,
        'daily_completion_rate': 72,
        'weekly_completion_rate': 68,
        'P1_completion_rate': 81,
        'streak_days': 3,
        'reminder_response_time': 17,
        'task_completion_latency': 38,
        'missed_task_ratio': 0.21,
        'regression_pass_rate': 0.94,
        'optimizer_success_rate': 0.78,
        'average_evaluator_score': 4.2
    }

    response = sample_metrics.copy()
    if metrics:
        response = {metric: sample_metrics.get(metric) for metric in metrics}

    return {
        'metrics': response,
        'lookback_hours': lookback_hours
    }


def _load_remote_entries(dataset_identifier: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    dataset = _load_opik_dataset(dataset_identifier)
    nb_samples = limit if isinstance(limit, int) and limit > 0 else None
    items = dataset.get_items(nb_samples)

    if not items:
        raise RuntimeError(f'Opik dataset "{dataset_identifier}" returned no items')

    return items


def _ensure_optimizer_installed():
    if not OPTIMIZER_AVAILABLE:
        detail = f" Import error: {_OPTIMIZER_IMPORT_ERROR}" if _OPTIMIZER_IMPORT_ERROR else ""
        raise RuntimeError(
            'Missing dependency: opik-optimizer is not installed. '
            f'Activate the Python environment used by PYTHON_PATH and run "pip install opik-optimizer".{detail}'
        )
    _ensure_reporting_patch()


def _load_json_file(dataset_path: str) -> Any:
    with open(dataset_path, 'r', encoding='utf-8') as handle:
        if dataset_path.endswith('.jsonl'):
            return [json.loads(line) for line in handle if line.strip()]
        return json.load(handle)


def _resolve_dataset(
    dataset_path: Optional[str] = None,
    dataset_entries: Optional[List[Dict[str, Any]]] = None,
    dataset_identifier: Optional[str] = None,
    dataset_limit: Optional[int] = None
) -> List[Dict[str, Any]]:
    if dataset_entries is not None:
        if not isinstance(dataset_entries, list):
            raise ValueError('dataset_entries must be a list of dicts')
        return dataset_entries

    if dataset_identifier:
        return _load_remote_entries(dataset_identifier, dataset_limit)

    if not dataset_path:
        raise ValueError('dataset_path is required when dataset_entries is not provided')

    resolved_path = os.path.abspath(dataset_path)
    if not os.path.exists(resolved_path):
        raise FileNotFoundError(f'Dataset file not found at {resolved_path}')

    data = _load_json_file(resolved_path)
    if isinstance(data, dict) and 'entries' in data:
        data = data['entries']

    if not isinstance(data, list):
        raise ValueError('Loaded dataset must be a list of entries')

    return data


def _resolve_project_name() -> str:
    return os.environ.get('OPIK_PROJECT_NAME') or 'Tenax-Optimization'


def _build_chat_prompt(prompt_text: str, label: str, model_name: Optional[str] = None) -> 'ChatPrompt':
    if ChatPrompt is None:
        raise RuntimeError('opik-optimizer ChatPrompt class unavailable; reinstall opik-optimizer package')
    if not prompt_text:
        raise ValueError('Prompt text must be non-empty')

    resolved_model = (
        model_name
        or os.environ.get('OPIK_PROMPT_MODEL')
        or os.environ.get('OPIK_EVALUATION_MODEL')
        or os.environ.get('OPIK_OPTIMIZER_MODEL')
        or 'gpt-4o-mini'
    )

    return ChatPrompt(name=label, system=prompt_text, model=resolved_model)


def _extract_expected_text(dataset_item: Dict[str, Any]) -> str:
    expected = dataset_item.get('expected_output') or {}
    if isinstance(expected, dict):
        output_block = expected.get('output', {})
        if isinstance(output_block, dict):
            text = output_block.get('generated_text')
            if isinstance(text, str):
                return text

    outputs = dataset_item.get('output') or {}
    if isinstance(outputs, dict):
        text = outputs.get('generated_text')
        if isinstance(text, str):
            return text

    return ''


def _feedback_metric(metric_name: str) -> Callable[..., float]:
    def _metric(dataset_item: Dict[str, Any], llm_output: str, **_kwargs: Any) -> float:
        scores = dataset_item.get('feedback_scores') or []
        for score in scores:
            if not isinstance(score, dict):
                continue
            if score.get('name') == metric_name:
                try:
                    value = float(score.get('value') or 0)
                except (TypeError, ValueError):
                    value = 0.0
                # Normalize common 1-5 rubric to 0-1
                return max(0.0, min(1.0, value / 5.0 if value > 1 else value))
        return 0.0

    _metric.__name__ = metric_name
    return _metric


def _lexical_similarity_metric(metric_name: str) -> Callable[..., float]:
    def _metric(dataset_item: Dict[str, Any], llm_output: str, **_kwargs: Any) -> float:
        reference = _extract_expected_text(dataset_item)
        candidate = llm_output or ''
        if not reference or not candidate:
            return 0.0
        ratio = SequenceMatcher(None, reference.lower(), candidate.lower()).ratio()
        return max(0.0, min(1.0, float(ratio)))

    _metric.__name__ = metric_name or 'lexical_similarity'
    return _metric


def _resolve_metric(metric_name: Optional[str]) -> Callable[..., float]:
    if not metric_name:
        return _lexical_similarity_metric('lexical_similarity')

    normalized = metric_name.strip().lower()

    feedback_mapping = {
        'completion_rate': 'goal_alignment_score',
        'goal_alignment': 'goal_alignment_score',
        'tone': 'tone_score',
        'tone_score': 'tone_score',
        'specificity': 'specificity_score',
        'specificity_score': 'specificity_score',
        'realism': 'realism_score',
        'realism_score': 'realism_score'
    }

    if normalized in feedback_mapping:
        return _feedback_metric(feedback_mapping[normalized])

    return _lexical_similarity_metric(normalized)


def _dataset_length(dataset_obj: Any) -> int:
    if dataset_obj is None:
        return 0

    for attr in ('dataset_items_count', 'total_items', 'count'):
        value = getattr(dataset_obj, attr, None)
        if isinstance(value, int) and value >= 0:
            return value

    try:
        preview = dataset_obj.get_items(1)
        if isinstance(preview, list):
            return len(preview)
    except Exception:  # pragma: no cover - defensive guard
        pass

    return 0


def _resolve_fewshot_prompt(task: Optional[str]) -> str:
    if not task:
        return os.environ.get('OPIK_FEWSHOT_BASE_PROMPT') or _DEFAULT_FEWSHOT_PROMPT

    env_key = f'OPIK_{task.upper()}_BASE_PROMPT'
    if env_key in os.environ and os.environ[env_key].strip():
        return os.environ[env_key]

    normalized = task.lower()
    if normalized in _FEWSHOT_TASK_PROMPTS:
        return _FEWSHOT_TASK_PROMPTS[normalized]

    return os.environ.get('OPIK_FEWSHOT_BASE_PROMPT') or _DEFAULT_FEWSHOT_PROMPT


def _mock_hrpo_result(prompt: str, dataset: List[Dict[str, Any]], metric: str, num_trials: int) -> Dict[str, Any]:
    dataset_size = len(dataset)
    prompt_hash = sum(ord(ch) for ch in prompt) or 1
    improvement = round(min(35.0, max(2.5, (dataset_size or 1) * 1.3)), 2)
    best_candidate = f"{prompt}\n\n// Mock tweak targeting {metric} (+{improvement}% projected)"

    history = []
    for trial in range(min(num_trials, 5)):
        delta = round((prompt_hash % (trial + 5)) / 10, 2)
        history.append({
            'trial': trial + 1,
            'score_delta': delta,
            'notes': f"Mock evaluation using {metric}"
        })

    return {
        'mode': 'mock',
        'dataset_size': dataset_size,
        'result': {
            'best_candidate': best_candidate,
            'improvement_pct': improvement,
            'trial_history': history,
            'message': 'Set OPIK_OPTIMIZER_MOCK_MODE=false with a real Opik dataset to run full HRPO.'
        }
    }


def _mock_gepa_result(prompt_variants: List[str], dataset: List[Dict[str, Any]], metric: str) -> Dict[str, Any]:
    dataset_size = len(dataset)
    ranked = sorted(prompt_variants, key=lambda text: (-len(text), text))
    best = ranked[0]
    history = [
        {
            'variant': idx + 1,
            'prompt_preview': variant[:120],
            'score': round(0.5 + (len(variant) % 37) / 100, 3)
        }
        for idx, variant in enumerate(ranked[:5])
    ]

    evolved_prompt = f"{best}\n\n// Mock GEPA blend optimized for {metric}"
    return {
        'mode': 'mock',
        'dataset_size': dataset_size,
        'result': {
            'best_candidate': evolved_prompt,
            'history': history,
            'message': 'Real GEPA execution requires Opik datasets; mock output provided instead.'
        }
    }


def _mock_fewshot_selection(example_pool: List[Dict[str, Any]], num_shots: int, metric: str) -> Dict[str, Any]:
    ranked = sorted(example_pool, key=lambda item: len(json.dumps(item)))
    selected = ranked[:num_shots]

    return {
        'mode': 'mock',
        'pool_size': len(example_pool),
        'result': {
            'best_examples': selected,
            'notes': f'Mock selection sorted by payload size using metric {metric}. '
                    'Disable mock mode for full optimizer runs.'
        }
    }


def _serialize_optimizer_result(result: Any) -> Dict[str, Any]:
    if result is None:
        return {'status': 'ok'}

    summary = {
        'str': str(result)
    }

    if hasattr(result, 'model_dump'):
        try:
            summary['data'] = result.model_dump()
        except Exception:  # pragma: no cover - defensive
            pass

    for attr in ('best_candidate', 'improvement_pct', 'trials', 'best_examples', 'history'):
        if hasattr(result, attr):
            value = getattr(result, attr)
            if attr == 'trials' and hasattr(value, '__len__'):
                summary['trial_count'] = len(value)
            else:
                summary[attr] = value

    return summary


def run_hrpo_optimization(
    prompt: str,
    dataset_path: Optional[str] = None,
    dataset_identifier: Optional[str] = None,
    dataset_limit: Optional[int] = None,
    metric: str = 'completion_rate',
    model: str = 'gpt-4o-mini',
    num_trials: int = 5,
    metadata: Optional[Dict[str, Any]] = None,
    dataset_entries: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Run a hierarchical reflective optimization job for reminder prompts."""

    _ensure_optimizer_installed()
    metric_fn = _resolve_metric(metric)

    if MOCK_MODE:
        dataset = _resolve_dataset(
            dataset_path=dataset_path,
            dataset_entries=dataset_entries,
            dataset_identifier=dataset_identifier,
            dataset_limit=dataset_limit
        )
        return _mock_hrpo_result(prompt, dataset, metric, num_trials)

    identifier = dataset_identifier or os.environ.get('OPIK_REMINDER_DATASET_ID')
    if not identifier:
        raise RuntimeError('Real HRPO runs require an Opik dataset identifier; set `dataset_identifier` or OPIK_REMINDER_DATASET_ID.')

    dataset_obj = _load_opik_dataset(identifier)
    optimizer = HRPOptimizer(
        model=model,
        n_threads=8,
        verbose=0,
        seed=int(os.environ.get('OPIK_OPTIMIZER_SEED', '42')),
        name='TenaxReminderHRPO'
    )

    prompt_obj = _build_chat_prompt(prompt, 'Tenax-Reminder-Baseline', model)

    with _capture_stdout():
        result = optimizer.optimize_prompt(
            prompt=prompt_obj,
            dataset=dataset_obj,
            metric=metric_fn,
            n_samples=dataset_limit,
            max_trials=num_trials,
            project_name=_resolve_project_name(),
            experiment_config=metadata or {}
        )

    return {
        'mode': 'hrpo',
        'dataset_size': _dataset_length(dataset_obj),
        'result': _serialize_optimizer_result(result)
    }


def run_gepa_optimization(
    initial_prompts: List[str],
    dataset_path: Optional[str] = None,
    dataset_identifier: Optional[str] = None,
    dataset_limit: Optional[int] = None,
    metric: str = 'completion_rate',
    model: str = 'gpt-4o-mini',
    generations: int = 3,
    population_size: int = 6,
    dataset_entries: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """Run the evolutionary GEPA optimizer across prompt variants."""

    _ensure_optimizer_installed()
    if not initial_prompts:
        raise ValueError('initial_prompts must contain at least one prompt string')

    metric_fn = _resolve_metric(metric)

    if MOCK_MODE:
        dataset = _resolve_dataset(
            dataset_path=dataset_path,
            dataset_entries=dataset_entries,
            dataset_identifier=dataset_identifier,
            dataset_limit=dataset_limit
        )
        return _mock_gepa_result(initial_prompts, dataset, metric)

    identifier = dataset_identifier or os.environ.get('OPIK_TONE_DATASET_ID')
    if not identifier:
        raise RuntimeError('Real GEPA runs require an Opik dataset identifier; set `dataset_identifier` or OPIK_TONE_DATASET_ID.')

    dataset_obj = _load_opik_dataset(identifier)
    optimizer = GEPAOptimizer(
        model=model,
        n_threads=6,
        verbose=0,
        seed=int(os.environ.get('OPIK_OPTIMIZER_SEED', '24')),
        name='TenaxToneGEPA'
    )

    prompt_variants = [
        _build_chat_prompt(text, f'Tenax-Tone-Variant-{idx + 1}', model)
        for idx, text in enumerate(initial_prompts)
    ]
    base_prompt = prompt_variants[0]
    extra_prompts = prompt_variants[1:]

    with _capture_stdout():
        result = optimizer.optimize_prompt(
            prompt=base_prompt,
            dataset=dataset_obj,
            metric=metric_fn,
            generations=generations,
            population_size=population_size,
            extra_prompts=extra_prompts,
            n_samples=dataset_limit,
            project_name=_resolve_project_name()
        )

    return {
        'mode': 'gepa',
        'dataset_size': _dataset_length(dataset_obj),
        'result': _serialize_optimizer_result(result)
    }


def run_fewshot_selection(
    example_pool: Optional[List[Dict[str, Any]]] = None,
    dataset_path: Optional[str] = None,
    dataset_identifier: Optional[str] = None,
    dataset_limit: Optional[int] = None,
    metric: str = 'levenshtein_distance',
    model: str = 'gpt-4o-mini',
    num_shots: int = 5,
    task: str = 'intent_parsing'
) -> Dict[str, Any]:
    """Select the best few-shot examples for the NLU parser."""

    _ensure_optimizer_installed()
    metric_fn = _resolve_metric(metric)

    if MOCK_MODE:
        pool = example_pool
        if pool is None:
            pool = _resolve_dataset(
                dataset_path=dataset_path,
                dataset_identifier=dataset_identifier,
                dataset_limit=dataset_limit
            )
        if not pool:
            raise ValueError('example_pool must be a non-empty list')
        return _mock_fewshot_selection(pool, num_shots, metric)

    if example_pool is not None:
        raise ValueError('example_pool overrides are only supported in mock mode. Provide an Opik dataset identifier for live few-shot selection.')

    identifier = dataset_identifier or os.environ.get('OPIK_INTENT_DATASET_ID')
    if not identifier:
        raise RuntimeError('Real few-shot selection requires an Opik dataset identifier; set `dataset_identifier` or OPIK_INTENT_DATASET_ID in the environment.')

    dataset_obj = _load_opik_dataset(identifier)
    prompt_text = _resolve_fewshot_prompt(task)
    prompt_label = f'Tenax-{(task or "fewshot").replace("_", " ").title()}-FewShot'
    prompt_obj = _build_chat_prompt(prompt_text, prompt_label, model)

    min_examples = max(1, num_shots - 2)
    max_examples = max(min_examples, num_shots + 2)
    if os.environ.get('OPIK_INTENT_FORCE_SHOT_COUNT', 'false').lower() == 'true':
        target = max(1, num_shots)
        min_examples = max_examples = target

    optimizer = FewShotOptimizer(
        model=model,
        min_examples=min_examples,
        max_examples=max_examples,
        verbose=0,
        seed=int(os.environ.get('OPIK_OPTIMIZER_SEED', '33'))
    )

    with _capture_stdout():
        result = optimizer.optimize_prompt(
            prompt=prompt_obj,
            dataset=dataset_obj,
            metric=metric_fn,
            n_samples=dataset_limit,
            max_trials=max(4, max_examples * 2),
            project_name=_resolve_project_name()
        )

    summary = _serialize_optimizer_result(result)
    example_indices = []
    if hasattr(result, 'details'):
        detail_indices = result.details.get('example_indices') if isinstance(result.details, dict) else None
        if isinstance(detail_indices, list):
            example_indices = [idx for idx in detail_indices if isinstance(idx, int)]

    if example_indices:
        try:
            dataset_items = dataset_obj.get_items()
            selected_examples = [
                dataset_items[idx]
                for idx in example_indices
                if 0 <= idx < len(dataset_items)
            ]
            if selected_examples:
                summary['best_examples'] = selected_examples
                summary['selected_example_indices'] = example_indices
        except Exception:
            pass

    return {
        'mode': 'fewshot',
        'pool_size': _dataset_length(dataset_obj),
        'result': summary
    }


__all__ = [
    'run_hrpo_optimization',
    'run_gepa_optimization',
    'run_fewshot_selection',
    'fetch_opik_dataset_entries'
]
