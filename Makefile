# selftest: negative tests, the checks must reject deliberately broken inputs
# check:    run every check on the PDFs and .docx files already in fixtures/ (no network)
# fetch:    download each template's PDF and .docx from Google Docs' public export URLs
# verify:   fetch, then check (in that order, even under make -j)
.PHONY: selftest check fetch verify docker-verify docker-verify-fresh font-study

selftest:
	uv run python checks/selftest.py

check: selftest
	uv run python checks/verify.py

fetch:
	uv run python checks/fetch.py

verify:
	$(MAKE) fetch
	$(MAKE) check

# Same files we tested, pinned tools: should reproduce results/ exactly (apart from runAt)
docker-verify:
	docker build -t readableresume-parser-tests .
	docker run --rm -v "$(CURDIR)/results:/work/results" readableresume-parser-tests make check

# Fetch the current documents from Google Docs first
docker-verify-fresh:
	docker build -t readableresume-parser-tests .
	docker run --rm -v "$(CURDIR)/results:/work/results" readableresume-parser-tests make verify

# One-off finding: rerun the checks on the PDFs stored in findings/2026-10-05-font-export
font-study:
	uv run python findings/2026-10-05-font-export/analyze.py
