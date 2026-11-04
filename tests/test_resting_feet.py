from pathlib import Path
import sys
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from resting_feet import relax

a=np.zeros((120,104,320),np.float32)
a[10,20,136]=1;a[10,20,182]=1;a[115,70,136]=7
b=relax(a,conserve=True)
assert np.array_equal(a[112:],b[112:]),'Upper anatomy must stay unchanged'
assert abs(a.sum(dtype=float)-b.sum(dtype=float))<1e-6
y,x=np.mgrid[:104,:320]
for side,cx in [(-1,136),(1,182)]:
    m=b[10]*(x<159 if side<0 else x>=159)
    assert ((x*m).sum()/m.sum()-cx)*side>25,'Both toes must rotate away from the midline'
    assert 25<(y*m).sum()/m.sum()<35
print('OK: external foot rotation, unchanged upper anatomy, conserved regional activity.')
