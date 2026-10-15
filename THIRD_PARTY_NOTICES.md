# Avisos de componentes de terceros

## Three.js v0.185.1

Copyright © 2010-2026 three.js authors

The MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

Fuente: https://github.com/mrdoob/three.js

## Paciente MakeHuman / MPFB de SymbiaRoom Godot (archivado)

Los archivos archivados conservan las dos posturas del proyecto SymbiaRoom Godot,
creadas con MPFB 2.0.17 y MakeHuman System Assets (CC0): piel masculina,
cabello short02, cejas eyebrow001, ojos, ropa male_casualsuit06 y zapatos shoes03.
La versión web reduce la geometría, comparte texturas de hasta 1024 px y conserva
la ropa estática. El soporte de brazos es una aproximación visual del proyecto.
No es anatomía ICRP ni una simulación biomecánica; las proyecciones siguen usando
sus atlas ICRP existentes. Procedencia y hashes: `assets/patient/manifest.json`.

- Fuente MPFB: https://extensions.blender.org/add-ons/mpfb/
- Recursos: https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html
- CC0: https://creativecommons.org/publicdomain/zero/1.0/

## Modelo activo «Man» de Quaternius

El paciente visible procede del paquete *Animated Man Pack* de
Quaternius y se ofrece bajo CC0 1.0 Universal.

- Fuente: https://quaternius.com/packs/animatedman.html
- CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/

CC0 no afecta derechos de marcas, imagen, privacidad u otros derechos que
pudieran resultar aplicables. No debe sugerirse que Quaternius o los autores
de Three.js patrocinan o aprueban este simulador.

## Anatomía ICRP Publication 145

ICRP, 2020. *Adult mesh-type reference computational phantoms*. ICRP
Publication 145. Ann. ICRP 49(3). Fuente anatómica: fantoma masculino MRCP_AM.
Referencia: https://www.icrp.org/publication.asp?id=ICRP+Publication+145

Las imágenes óseas incluidas son proyecciones calculadas localmente a partir
de una voxelización a 3 mm, con actividad sintética y atenuación aproximada.
La postura de brazos arriba es una rearticulación docente derivada, no una
postura oficial ni certificada por ICRP. No se incorporan las mallas originales
al HTML. La licencia MIT del código no cambia los derechos de la anatomía
de terceros ni implica patrocinio o aprobación de ICRP.

`assets/icrp145/procedencia.json` documenta fuentes, huellas SHA-256,
articulaciones, error de cuantización y limitaciones de las series.


La serie MIBI incorpora 72 proyecciones del fantoma derivado con brazos arriba.
El ventrículo izquierdo es un modelo emisor sintético, ampliado un 25 % y
desplazado 6 mm hacia abajo, con captación heterogénea. No representa una
segmentación ventricular original ICRP ni una reconstrucción SPECT clínica.
La referencia visual aportada no se incluye como imagen clínica en el HTML.

La adquisición MAG3 basal utiliza proyecciones de órganos derivados del mismo
fantoma ICRP 145, con captación y cinética sintéticas. Las posturas de brazos y
la atenuación son aproximaciones docentes. `assets/icrp145/mag3-procedencia.json`
documenta la preparación y las fuentes locales.

Referencia de la dinámica basal: Craig Hacking, *Normal captopril renal MAG3
nuclear study*, Radiopaedia:
https://radiopaedia.org/cases/normal-captopril-renal-mag3-nuclear-study
Se usa como referencia de tiempos y comportamiento; no se distribuyen sus
imágenes ni datos clínicos originales. El título se refiere a la respuesta al
captopril, no a una función renal global normal. No implica aprobación de los
autores ni validación clínica del modelo.

El primer paso MAG3 incorpora etiquetas vasculares originales ICRP 145 del
tronco y las extremidades, antes ausentes en la caché de órganos. Su tránsito
temporal es sintético y conserva la actividad total. La referencia para la
adquisición vascular rápida es la guía SNMMI/EANM:
https://pmc.ncbi.nlm.nih.gov/articles/PMC6020824/
No se atribuyen a esa guía los tiempos concretos elegidos para la simulación.
