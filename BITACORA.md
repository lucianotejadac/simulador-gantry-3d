# Bitácora de decisiones

## 2026-10-12 · Óseo ICRP 145 articulado y persistencia

Se sustituyen los montajes óseos del visor por dos series de 80 proyecciones
lineales calculadas desde el volumen ICRP 145 local: postura original y brazos
elevados. La versión elevada rota húmeros y antebrazos/manos en 3D antes de
proyectar emisión y atenuación. La postura es docente y aproximada; no mueve
clavículas ni escápulas. El muñeco y ambos detectores comparten el selector
de brazos. Los montajes anteriores permanecen como fuentes históricas.

Los datos lineales uint16 comprimidos y el motor temporal quedan incrustados
en el HTML. Se generan eventos de Poisson nuevos a unos 10 Hz; una ventana
móvil de 0,25–5 s conserva la estela durante movimientos del gantry/camilla.
Cambiar configuración limpia la historia. La tasa se refiere a cuerpo
completo anterior y el recorte conserva el área física por píxel al cambiar
matriz. Se mantienen los efectos de distancia a piel, colimador y energía.

Validación: `test_bone_mode.py`, `test_table_distance.py` y
`test_icrp_live.py` pasan sin conexión. Se verifican pose del muñeco, 160
proyecciones, giro/oposición, ruido temporal, congelación, vaciado, expiración,
conservación de cuentas entre matrices y encuadre completo de los canvas.
La modificación se integra localmente; no se publica en GitHub en este paso.

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

## 2026-10-12 - MIBI cardíaco integrado

Nuevo estudio local MIBI con 72 vistas cada 5 grados, brazos arriba y VI
ampliado 25 %, descendido 6 mm y captación heterogénea. El empaquetador
incrusta cuentas lineales y normaliza la referencia ANT a 2 millones junto
con la ventana. Se reutiliza la adquisición temporal de Poisson.
La caché de campos incluye el estudio para evitar mezclar MIBI y hueso.
Al elegir MIBI se elevan los brazos; la opción al costado se habilita de nuevo
al cambiar de estudio. Enlace local: index.html?demo=mibi-brazos-arriba.

Verificación: test_mibi_mode.py, test_icrp_live.py, test_bone_mode.py y
test_table_distance.py aprobados, incluida fidelidad de datos, funcionamiento
sin red, persistencia, dos detectores y cambio de estudio.

## 2026-10-12 - MAG3 basal integrado

Botón «inyectar MAG3» y ventana independiente de adquisición de 20 minutos.
Se elige el cabezal posterior al inicio y se acumulan eventos Poisson de todo
su campo, integrando la cinética durante cada intervalo y conservando las
cuentas anteriores cuando cambia la geometría. Se guardan 84 cuadros y la
historia de posiciones. Incluye pausa, velocidad y exportación PNG/JSON.
No se incorpora la fase poscaptopril.

Las proyecciones se calculan desde las bases anatómicas del proyecto MAG3 de
cuerpo entero, para 36 ángulos y ambas posturas de brazos. Los datos lineales
comprimidos y el motor quedan incrustados en el HTML para uso local.

Verificación: test_mag3_acquisition.cjs aprobado con datos reales incrustados,
pruebas numéricas y DOM simulado. Se verificaron suma de cuadros, movimiento,
campo vacío, captación extrarrenal, Poisson, selección posterior, pausa,
velocidad, finalización y cierre. Sintaxis de scripts comprobada. La interfaz
de la ventana no se verificó visualmente en un navegador.

## 2026-10-12 - Pantalla MAG3 dentro del gantry

La adquisición se muestra en el área de visualización del simulador, con el
mando accesible. Se elimina la ventana emergente. Volver a 3D y reabrir la
pantalla conserva la adquisición en marcha y sus cuentas; los resultados
finalizados también pueden consultarse. Las pruebas de ejecución verifican
que no se abra otra ventana, la continuidad al ocultar y la reapertura.
Comprobación adicional en Chrome sobre GitHub Pages: pantalla interna visible,
mando accesible y temporizador conservado al volver a 3D y reabrir. Se compactan
cabecera e imágenes para aprovechar el área disponible.

## 2026-10-12 - MAG3 en la barra Imagen en vivo

La suma, el cuadro dinámico y todos los controles se integran directamente en
la barra Imagen en vivo. Se retira la pantalla sobre la vista 3D y el botón
Ver adquisición. El cambio de estudio restaura los detectores habituales;
volver a MAG3 recupera la adquisición y sus cuentas. Pruebas aprobadas para
ubicación dentro de gantryLive, vista 3D intacta, cambio de estudio y controles.

## 2026-10-12 - Primer paso arterial MAG3

El fondo sanguíneo difuso no mostraba el paso arterial. Se añaden cinco bases
proyectadas: sangre central, pulmones, arterias superiores, arterias abdominales
y arterias de las piernas. Las etiquetas vasculares originales se voxelizan
desde MRCP_AM y se proyectan para ambas posturas y 36 ángulos. Se añade también
un componente vascular renal transitorio dentro de las máscaras renales.

La actividad circulante se redistribuye entre estos componentes mediante un
tránsito sintético secuencial, conservando la actividad total. A partir de 60 s
las actividades instantáneas coinciden con el modelo basal anterior. La barra
identifica la fase vascular y permite revisar los cuadros iniciales de 2 s.

test_mag3_arterial.py y test_mag3_acquisition.cjs aprobados. El montaje de cuentas
esperadas confirma el tránsito vascular antes del predominio renal. Los tiempos
son ilustrativos y no una calibración hemodinámica al caso clínico.
