"""Keep the parathyroid model identical to the current cardiac MIBI atlas."""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]


def share_mibi_model(html):
    match = re.search(r'window.GANTRY_ICRP_DATA=(.*?);\n', html)
    data = json.loads(match[1])
    data['parathyroid'] = data['mibi_up'].copy()
    path = ROOT/'assets/icrp145/organ-static-provenance.json'
    provenance = json.loads(path.read_text(encoding='utf-8'))
    provenance['parathyroid'] = dict(shared_model='mibi_up', posture='arms up',
        anatomy='Same ICRP-based body and modified synthetic left ventricle as cardiac MIBI',
        scenario='Same MIBI uptake and projection weights; no added parathyroid adenoma',
        limitation='No separately segmented parathyroid glands; educational simulation',
        asset_sha256=hashlib.sha256((ROOT/data['mibi_up']['url']).read_bytes()).hexdigest(),
        descriptor=data['parathyroid'])
    path.write_text(json.dumps(provenance, ensure_ascii=False, indent=2), encoding='utf-8')
    return html[:match.start(1)]+json.dumps(data,separators=(',',':'))+html[match.end(1):]
