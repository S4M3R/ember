.PHONY: help install viz attribution feed spike

help:
	@echo "Ember — make targets"
	@echo "  make install      # install all three services"
	@echo "  make attribution  # run the attribution API   (http://localhost:8001)"
	@echo "  make feed         # replay a recorded convo    (ws://localhost:8765)"
	@echo "  make viz          # run the React viz          (http://localhost:5173)"
	@echo "  make spike        # test Nemotron echo-scoring (needs NEMOTRON_LLM_URL)"
	@echo ""
	@echo "  Local run: make attribution, make feed, make viz (3 terminals)."
	@echo "  Real agent: see server/INTEGRATION.md (replaces 'make feed')."

install:
	cd attribution && uv sync
	cd server && uv sync
	cd viz && npm install

attribution:
	cd attribution && uv run uvicorn app.main:app --reload --port 8001

feed:
	cd server && uv run python sample_feed.py

viz:
	cd viz && npm run dev

spike:
	@test -n "$$NEMOTRON_LLM_URL" || (echo "set NEMOTRON_LLM_URL first"; exit 1)
	curl -s "$$NEMOTRON_LLM_URL/completions" -H 'content-type: application/json' \
	  -d '{"model":"'"$${NEMOTRON_LLM_MODEL:-nvidia/nemotron-3-super}"'","prompt":"hello world","echo":true,"max_tokens":0,"logprobs":1}' \
	  | python3 -m json.tool
