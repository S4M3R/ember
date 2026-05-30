"""Nemotron (vLLM, OpenAI-compatible) client.

Two capabilities:
  1. response_loglik() — score logP(response | prompt) via /completions echo
     (echo=True, max_tokens=0, logprobs). This is what powers attribution and
     needs no model internals — just an endpoint that returns token logprobs.
  2. chat() — normal generation for replay.

If the endpoint is missing or any call fails, callers fall back to mock.
"""
from __future__ import annotations

import httpx

from . import config


class NemotronUnavailable(RuntimeError):
    pass


class Nemotron:
    def __init__(
        self,
        base_url: str = config.NEMOTRON_LLM_URL,
        model: str = config.NEMOTRON_LLM_MODEL,
        api_key: str | None = config.NEMOTRON_API_KEY,
        timeout: float = config.REQUEST_TIMEOUT_S,
    ):
        self.base = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout
        self.headers = {"Content-Type": "application/json"}
        if api_key:
            self.headers["Authorization"] = f"Bearer {api_key}"

    async def _post(self, client: httpx.AsyncClient, path: str, payload: dict) -> dict:
        try:
            r = await client.post(
                f"{self.base}{path}", json=payload, headers=self.headers, timeout=self.timeout
            )
            r.raise_for_status()
            return r.json()
        except Exception as e:  # noqa: BLE001 - any failure -> unavailable -> mock
            raise NemotronUnavailable(f"{path} failed: {e}") from e

    async def _echo_logprobs(self, client, text: str) -> tuple[list[str], list[float | None]]:
        """Return (tokens, token_logprobs) for `text` using echo scoring."""
        payload = {
            "model": self.model,
            "prompt": text,
            "max_tokens": 0,
            "echo": True,
            "logprobs": 1,
            "temperature": 0,
        }
        try:
            data = await self._post(client, "/completions", payload)
        except NemotronUnavailable:
            # Some servers reject max_tokens=0; retry with 1 (we ignore the gen token).
            payload["max_tokens"] = 1
            data = await self._post(client, "/completions", payload)
        lp = data["choices"][0].get("logprobs") or {}
        toks = lp.get("tokens")
        logps = lp.get("token_logprobs")
        if toks is None or logps is None:
            raise NemotronUnavailable("endpoint returned no token logprobs (no echo support)")
        return toks, logps

    async def response_loglik(self, client, prompt_text: str, response_text: str) -> float:
        """Sum of token logprobs of response_text given prompt_text.

        Boundary method: echo-score the prompt alone to get its token count, then
        echo-score prompt+response and sum logprobs past the boundary. BPE prefix
        stability makes this robust enough for a relative attribution signal.
        """
        p_toks, _ = await self._echo_logprobs(client, prompt_text)
        boundary = len(p_toks)
        _, full_logps = await self._echo_logprobs(client, prompt_text + response_text)
        resp_logps = [x for x in full_logps[boundary:] if x is not None]
        if not resp_logps:
            raise NemotronUnavailable("empty response logprob span")
        return float(sum(resp_logps))

    async def chat(self, client, messages: list[dict], temperature: float = 0.0,
                   max_tokens: int = 512, extra_body: dict | None = None) -> str:
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if extra_body:
            payload.update(extra_body)
        data = await self._post(client, "/chat/completions", payload)
        content = data["choices"][0]["message"].get("content")
        if not content:
            raise NemotronUnavailable("empty chat content (reasoning mode without parser?)")
        return content
