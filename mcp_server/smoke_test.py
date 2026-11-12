"""Start the MCP server over stdio and call every tool once.

Run: .venv/bin/python mcp_server/smoke_test.py
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

SERVER = Path(__file__).resolve().parent / "server.py"

CALLS = [
    ("list_metrics", {}),
    ("crime_rate", {"borough": "Westminster"}),
    ("lookup_postcode", {"postcode": "SW11 3HG"}),
    ("data_quality", {"topic": "criminal damage"}),
    ("crime_mix", {"borough": "Westminster"}),
    ("crime_mix", {}),
]


def text_of(result) -> str:
    return "\n".join(c.text for c in result.content if getattr(c, "type", None) == "text")


async def main() -> int:
    params = StdioServerParameters(command=sys.executable, args=[str(SERVER)])
    failures = 0
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = await session.list_tools()
            print("tools:", ", ".join(t.name for t in tools.tools))
            for name, args in CALLS:
                start = time.monotonic()
                result = await session.call_tool(name, args)
                elapsed = time.monotonic() - start
                body = text_of(result)
                try:
                    parsed = json.loads(body)
                except json.JSONDecodeError:
                    parsed = None
                ok = not result.is_error and isinstance(parsed, dict) and "error" not in parsed
                failures += not ok
                print(f"\n== {name}({json.dumps(args)}) {'ok' if ok else 'FAILED'} in {elapsed:.2f}s")
                print(json.dumps(parsed, indent=1, ensure_ascii=False) if parsed else body)
    print(f"\n{len(CALLS) - failures}/{len(CALLS)} tools returned results")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
