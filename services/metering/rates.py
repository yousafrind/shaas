MODEL_RATES_USD_PER_1K: dict[str, dict[str, float]] = {
    "claude-sonnet-4-6":  {"in": 0.003,   "out": 0.015},
    "claude-opus-4-6":    {"in": 0.015,   "out": 0.075},
    "claude-haiku-4-5":   {"in": 0.0008,  "out": 0.004},
    "gpt-4o":             {"in": 0.0025,  "out": 0.010},
    "gpt-4o-mini":        {"in": 0.00015, "out": 0.0006},
    "ollama/*":           {"in": 0.0,     "out": 0.0},
}

_DEFAULT_RATES = {"in": 0.00015, "out": 0.0006}  # gpt-4o-mini


def estimate_cost(model: str, tokens_in: int, tokens_out: int) -> float:
    """Estimate USD cost of one LLM call given model and token counts."""
    rates = MODEL_RATES_USD_PER_1K.get(model)
    if rates is None:
        # Try prefix match for ollama models (e.g. "ollama/llama3")
        if model.startswith("ollama/"):
            rates = MODEL_RATES_USD_PER_1K["ollama/*"]
        else:
            rates = _DEFAULT_RATES
    return (tokens_in * rates["in"] + tokens_out * rates["out"]) / 1000
