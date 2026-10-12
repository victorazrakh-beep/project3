"""Builds data/up.json from the Universidad de Panamá Instituto de Geociencias catalog.

Their site doesn't allow browser requests from other sites, so GitHub Actions runs this on a
schedule and publishes the result next to the app. Only the structured fields are kept.
"""
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

SOURCE = 'https://sismosgeociencias.up.ac.pa/'
PANAMA = timezone(timedelta(hours=-5))  # Panamá has no daylight saving time


def parse(html):
    events, seen = [], set()
    for href in re.findall(r'href="(ultimosismo\.html\?[^"]+)"', html):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(href.replace('&amp;', '&')).query)
        get = lambda k: q.get(k, [''])[0].strip()
        try:
            local = datetime.strptime(f"{get('f')} {get('h')}", '%Y-%m-%d %I:%M:%S%p').replace(tzinfo=PANAMA)
            event = {
                'time': int(local.timestamp() * 1000),
                'lat': round(float(get('lt')), 4),
                'lon': round(float(get('ln')), 4),
                'depth': float(re.sub(r'[^\d.]', '', get('p')) or 0),
                'mag': float(get('m')),
                'status': get('e').lower(),
                'place': re.sub(r'^Localizado en ', '', get('r')),
            }
        except ValueError:
            continue
        key = (event['time'], event['lat'], event['lon'])
        if key not in seen:
            seen.add(key)
            events.append(event)
    return sorted(events, key=lambda e: -e['time'])


def main(out):
    req = urllib.request.Request(SOURCE, headers={'User-Agent': 'Onda (github.com/victorazrakh-beep/project3)'})
    html = urllib.request.urlopen(req, timeout=30).read().decode('utf-8', 'replace')
    events = parse(html)
    if not events:
        sys.exit('No events parsed; keeping the previous file.')
    with open(out, 'w') as f:
        json.dump({'source': SOURCE, 'updated': int(datetime.now(timezone.utc).timestamp() * 1000), 'events': events[:1500]},
                  f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(events)} events, newest {events[0]["place"]} M{events[0]["mag"]}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'data/up.json')
