from __future__ import annotations

import argparse
import html
import json
import re
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import Request, urlopen


TEAM_NAME = "Celestial Thunder"
LEAGUE_ID = "98480"
SCHEDULE_URL = f"https://cscsports.leaguelab.com/league/{LEAGUE_ID}/schedule"
OUTPUT_FILE = Path(__file__).with_name("recaps.json")
FIELD_NAMES = {
    "6912_1": "CH-Near",
    "6912_2": "CH-Far",
    "6988_1": "PP-North",
    "6988_2": "PP-south",
    "7003_1": "UMN-north",
    "7003_2": "UMN-south",
    "7241_1": "HA-south",
    "7241_2": "HA-north",
}


def fetch_text(url: str) -> str:
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; CelestialThunderSchedule/1.0)"
        },
    )
    with urlopen(request, timeout=30) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def attrs_from_tag(tag: str) -> dict[str, str]:
    return {
        key.lower(): html.unescape(value)
        for key, value in re.findall(r'([\w-]+)="([^"]*)"', tag)
    }


def clean_text(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def first_match(pattern: str, value: str) -> str:
    match = re.search(pattern, value, flags=re.IGNORECASE | re.DOTALL)
    return clean_text(match.group(1)) if match else ""


def parse_schedule(html_text: str) -> list[dict[str, object]]:
    games = []
    cell_pattern = re.compile(r"(<td\b[^>]*>)(.*?)</td>", re.IGNORECASE | re.DOTALL)

    for match in cell_pattern.finditer(html_text):
        start_tag, body = match.groups()
        attrs = attrs_from_tag(start_tag)
        class_name = attrs.get("class", "")
        if "nogame" in class_name.lower():
            continue

        away_team = first_match(r'class="gameCellTeamOne"[^>]*>(.*?)</a>', body)
        home_team = first_match(r'class="gameCellTeamTwo"[^>]*>(.*?)</a>', body)
        if TEAM_NAME not in {away_team, home_team}:
            continue

        scores = [int(score) for score in re.findall(r'class="scoreDisplay"[^>]*>\s*\[(\d+)\]', body)]
        recap_path = first_match(r'class="gameRecapButton"[\s\S]*?<a\s+href="([^"]+)"', body)
        if len(scores) < 2 or not recap_path:
            continue

        games.append(
            {
                "date": attrs.get("data-gamedate", ""),
                "homeTeam": home_team,
                "homeScore": scores[1],
                "awayTeam": away_team,
                "awayScore": scores[0],
                "field": FIELD_NAMES.get(attrs.get("data-gamefield", ""), attrs.get("data-gamefield", "")),
                "url": urljoin(SCHEDULE_URL, recap_path),
            }
        )

    return sorted(games, key=lambda game: (game["date"], game["url"]))


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Celestial Thunder game recaps from LeagueLab.")
    parser.add_argument("--schedule-url", default=SCHEDULE_URL, help="LeagueLab schedule URL to read.")
    parser.add_argument("--output", default=OUTPUT_FILE, type=Path, help="Path to write recaps JSON.")
    args = parser.parse_args()

    schedule_html = fetch_text(args.schedule_url)
    recaps = parse_schedule(schedule_html)
    args.output.write_text(json.dumps(recaps, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(recaps)} recap(s) to {args.output}")


if __name__ == "__main__":
    main()
