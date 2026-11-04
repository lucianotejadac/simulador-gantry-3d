from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]
p=ROOT/'index.html';s=p.read_text(encoding='utf-8')
block='  /* FEET_POSE_BEGIN */\n'+(ROOT/'scripts/feet_pose.js').read_text(encoding='utf-8')+'  /* FEET_POSE_END */\n'
s=re.sub(r'  /\* FEET_POSE_BEGIN \*/.*?/\* FEET_POSE_END \*/\n','',s,flags=re.S)
anchor="  let patientLoadState='loading';"
assert anchor in s;s=s.replace(anchor,block+anchor,1)
anchor='    flip.add(model);\n'
if '    relaxPatientFeet(model);' not in s:
    assert anchor in s;s=s.replace(anchor,anchor+'    relaxPatientFeet(model);\n',1)
p.write_text(s,encoding='utf-8',newline='\n')
