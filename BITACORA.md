# Bitácora de decisiones

## 2026-10-04 · La calidad de imagen sigue la distancia cabezal–paciente

**Contexto.** La PSF y las cuentas se calculaban con la distancia del cabezal al
isocentro. Subir o bajar la camilla solo desplazaba el encuadre, sin cambiar la
calidad, aunque en el equipo real acerca al paciente a un detector y lo aleja
del otro. El usuario pidió que la calidad dependiera de la distancia
detector–camilla, con la misma lógica en ambos sentidos.

**Decisión.** El motor 3D ya calculaba la distancia de cada cabezal a la piel
para el interlock. Se expone como `GANTRY3D.surfaceGaps(G)`: distancia en cm de
cada cabezal a la piel o, si el paciente no entró, al tablero; `null` con el
campo libre. El módulo de imagen alimenta `distanceMetrics` con esa distancia y
conserva la del isocentro como dato. La fórmula de la PSF pasó de
`0,35 + 0,10·(d − 14,24)` con suelo en 0,15 px, que anulaba toda diferencia por
debajo de 12 cm, a `0,15 + 0,075·d` desde el contacto; a 50 cm coincide con el
máximo anterior. El modelo de cuentas no cambió, solo recibe la nueva distancia.

**Alternativas descartadas.**
- Restar la altura de la camilla a la distancia al isocentro: ignora el espesor
  del paciente y la rotación; a 90° la altura no acerca ni aleja.
- Recalibrar también las cuentas: no se pidió y no hay datos nuevos.

**Consecuencias.** Un estado con la camilla alta y el cabezal cerca puede ser
físicamente imposible; el interlock lo impide al operar, pero las pruebas que
fijan estados a mano deben respetar `GANTRY3D.limits`. El rótulo de cada imagen
muestra «D-isocentro» y «a piel». `tests/test_table_distance.py` verifica que
subir la camilla 8 cm equivale a acercar el cabezal superior 8 cm.
