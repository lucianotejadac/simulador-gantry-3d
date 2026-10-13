# Simulador Gantry 3D

Simulador autocontenido de posicionamiento del gantry y adquisición
gammagráfica. Todo el funcionamiento, los atlas y los recursos necesarios se
encuentran incorporados en un solo archivo: `index.html`.

## Ejecución

Descargue `index.html` y ábralo en un navegador moderno. No requiere conexión
a Internet.

### Sala opcional de SymbiaRoom

Pulsa **Mostrar sala** junto a los botones de vista. **Vista sala** encuadra
el entorno completo y **Ocultar sala** recupera el suelo habitual. Las paredes
que quedan entre una cámara exterior y el equipo se ocultan automáticamente.
Los controles del gantry y la adquisición MAG3 siguen funcionando.

El recurso está incrustado en el HTML para funcionar sin conexión: añade
aproximadamente 0,82 MB al archivo, pero sólo se descomprime y crea en GPU
al mostrarlo por primera vez. Son seis grupos y 81.798 triángulos, sin físicas,
luces ni sombras dinámicas adicionales. Oculto no se dibuja; tras la primera
carga conserva su memoria para poder volver a mostrarlo rápidamente.

**Rendimiento** permite comparar fps, tiempo CPU de la escena y llamadas de
dibujo en el navegador. No mide tiempo GPU ni garantiza el mismo rendimiento
en todos los equipos. La colocación del entorno es visual; no cambia los
límites mecánicos del simulador. [Fuentes y adaptaciones](assets/symbia-room/CREDITS.md).

### Zoom y recentrado

La barra Imagen en vivo ofrece **1×, 1,5×, 1,75× y 2×**, con aumentos reales
y sin cambiar la matriz elegida. Pulsa **Recentrar** y después haz clic en el
punto de la imagen que quieres llevar al centro. Cada detector conserva su
centro; **Centro original** restablece ambos. Se ignoran los clics en los
márgenes negros externos a la imagen.

En MAG3 puedes seleccionar el centro sobre la suma o el cuadro dinámico. El
nuevo encuadre afecta sólo las cuentas siguientes: no desplaza ni borra la
adquisición previa. Los cambios de zoom y centro se guardan en su historia de
geometría.

## MIBI cardíaco · brazos arriba

Seleccione **MIBI cardíaco · brazos arriba** en ESTUDIO, o abra
`index.html?demo=mibi-brazos-arriba` para centrar la región del corazón y el
hígado con LEHR, 140 keV y ventana del 20 %.

Se integran 72 proyecciones a pasos de 5° del fantoma derivado ICRP 145,
con el VI sintético ampliado un 25 %, desplazado 6 mm hacia abajo y con
captación heterogénea. Esta serie corresponde a brazos arriba: al seleccionarla
se eleva el muñeco y se deshabilita «Al costado» hasta cambiar de estudio.
Los dos detectores comparten los controles **En vivo / Sin ruido**, cuentas/s,
persistencia, congelación y limpieza. La señal utiliza cuentas esperadas;
el motor genera eventos nuevos, sin reutilizar imágenes con ruido fijo.

La forma ventricular y la captación son sintéticas; no constituyen una
segmentación ventricular original ICRP ni una reconstrucción SPECT validada.
Se conserva la actividad cardíaca total del modelo local y la atenuación original.
Las proyecciones se normalizan a la referencia de 2 millones de cuentas ANT
del motor, junto con su ventana, para mantener la tasa seleccionada en cuentas/s.

Al empaquetar, `scripts/build_icrp_assets.py` también lee
`../icrp145-multitrazador-ap-pa/mibi-360-brazos-arriba` (configurable mediante
`--mibi-source`). Prueba específica: `python tests/test_mibi_mode.py`.

## Cintigrama óseo · ICRP 145

### Adquisición ósea de dos detectores

En **Cintigrama óseo**, la barra presenta cuatro cuadros: **En vivo D1**,
**En vivo D2**, **Adquisición D1** y **Adquisición D2**. Pulsa **Iniciar
adquisición**, selecciona cuentas objetivo o tiempo (segundos) y **Comenzar**.
Las cuentas objetivo son por detector: cada cabezal se detiene al llegar a
su propia meta. El tiempo también se aplica a ambos detectores.

La suma usa eventos nuevos de Poisson sobre los campos lineales del fantoma;
no acumula capturas de la ventana de persistencia. **Avance rápido** ofrece
1×, 10×, 30× y 60×, sin acelerar las imágenes en vivo. **Adquisición
instantánea** completa el tiempo o las cuentas restantes con el campo y los
ajustes del momento. Si no hay señal, no inventa cuentas para alcanzar la meta.

Mover el equipo, cambiar el zoom, recentrar o ajustar la energía afecta sólo
las cuentas nuevas. La matriz queda fijada durante la adquisición. Puedes
pausar, reanudar o finalizar conservando el resultado; iniciar otra adquisición
borra la suma anterior al pulsar Comenzar. Cambiar de estudio pausa la
adquisición ósea; al regresar puedes reanudarla. Una pestaña oculta suspende
su reloj. Congelar o limpiar la persistencia no modifica la suma adquirida.

Motor y empaquetado: `scripts/bone_acquisition.js` y
`python scripts/embed_bone_acquisition.py`. Prueba numérica con datos ICRP
y control de reloj: `node tests/test_bone_acquisition.cjs`.

El selector **Tipo → Cuerpo entero** realiza un barrido secuencial de cráneo a
pies sobre dos imágenes rectangulares. En escritorio, las imágenes ocupan la
franja derecha, desde la parte superior de la vista 3D hasta el borde inferior.
El gantry, los controles y las dos vistas en vivo quedan a la izquierda. El mando
es más pequeño y se elimina la barra de título azul, conservando el menú.
Los dos cuadros en vivo conservan el campo local del
detector para posicionar. Se habilita el inicio únicamente con **pies hacia
adentro** tanto en la posición física como en la declarada, camilla en
**Z 200 cm** (se admite desde 198 cm) y centrado original de imagen. La barra
explica qué corregir antes de comenzar.

El único parámetro del barrido es la **velocidad de camilla en cm/min**
(1–60; valor inicial 10). Se mantienen los nombres para identificar ambos
detectores. Primero se acercan automáticamente los cabezales a 1 cm del tope
geométrico seguro del simulador, con movimiento limitado a 8 cm/s. Después
la camilla recorre desde cráneo hasta Z 16 cm. El recorrido 200→16 equivale a
175 cm físicos del modelo, por lo que 10 cm/min requiere 17 min 30 s de
movimiento, además del posicionamiento inicial de los cabezales. Los topes
se revisan antes de cada desplazamiento; si hace falta reajustar un detector,
la camilla espera. El contorno de seguridad usa la envolvente conservadora
actual del modelo 3D, no una medición clínica de superficie.

Se integran eventos de Poisson únicamente durante la exposición de cada fila
al campo móvil de 56×56 cm, registrados en coordenadas del cuerpo. Las zonas
que aún no entran en el detector permanecen vacías; regiones fuera del campo
durante todo el recorrido (por ejemplo manos muy por encima del cráneo) no
reciben cuentas inventadas. Una línea indica el centro del barrido. Una
velocidad menor aumenta el tiempo de exposición y las cuentas esperadas.
No hay objetivo por cuentas/tiempo, avance rápido ni instantánea en este modo.
El zoom se fija a 1× y se bloquean posición, orientación y ajustes durante el
barrido; **Pausar**, **Reanudar**, **Finalizar** y **Guardar adquisición** siguen
disponibles. Pausar o esconder la pestaña suspende tanto movimiento como
cuentas. Las adquisiciones estáticas conservan sus controles anteriores.

Guardadas conserva velocidad, recorrido, cuentas, nombres y dimensiones,
incluidos barridos parciales, y sigue abriendo las adquisiciones anteriores.
Prueba: `node tests/test_bone_whole_body.cjs`.

Al comenzar se solicita un **nombre para detector 1 y detector 2**. Los nombres
aparecen sobre las imágenes adquiridas. **Guardar adquisición** conserva una
copia de ambos mapas de cuentas, nombres, matriz, tiempos y ajustes en el
almacenamiento local del navegador (IndexedDB). Puede guardarse una captura
durante la adquisición o después de finalizar; continuar no altera esa copia.

El menú **Guardadas** abre las adquisiciones anteriores en los dos cuadros de
adquisición. Si hay una adquisición en curso, se pausa al abrir una guardada.
Selecciona **Adquisición actual** para regresar y reanudar. Iniciar otra no
elimina las guardadas; guarda la actual antes de reemplazarla si deseas
conservarla. El menú se recupera al recargar la página en el mismo navegador
y sitio. Borrar los datos del sitio elimina estas copias; no se sincronizan
con GitHub ni con otros dispositivos.

Prueba de copias independientes, nombres y recuperación de la interfaz:
`node tests/test_bone_acquisition_saved.cjs`. La persistencia de IndexedDB
se comprueba además guardando y recargando en Chrome.

Seleccione **Cintigrama óseo** en ESTUDIO. El selector **Brazos: Arriba /
Al costado** cambia simultáneamente el muñeco y las proyecciones de ambos
cabezales. Cada postura contiene 80 vistas calculadas: cada 5° y las oblicuas
adicionales cada 22,5°. Se interpola la intensidad lineal entre vistas vecinas,
con cierre circular y 180° de separación entre detectores.

La señal ósea se genera desde datos lineales derivados del fantoma ICRP 145
MRCP_AM. Los brazos elevados se obtienen articulando en 3D los húmeros y los
antebrazos/manos antes de recalcular emisión y atenuación. El cuerpo conserva
su referencia de cráneo a plantas; las manos pueden verse por encima del cráneo
al avanzar la camilla. La postura es una aproximación docente: clavículas y
escápulas permanecen en su posición original. La captación es sintética.

**En vivo** genera eventos nuevos de Poisson incluso con el gantry quieto.
La ventana móvil conserva únicamente los últimos **0,25 a 5 segundos** y
se actualiza aproximadamente a 10 Hz. Menos cuentas/s o menor persistencia
producen más grano. La tasa elegida corresponde al cuerpo completo anterior;
el campo del detector recibe una fracción según el recorte y los ajustes.

- **Congelar / Reanudar** detiene o continúa el reloj de adquisición.
- **Limpiar** vacía las dos ventanas.
- **Sin ruido** permite inspeccionar la captación esperada.
- El movimiento del gantry y la camilla conserva la estela temporal.
- Cambiar postura, estudio, matriz, zoom, colimador o ventana energética
  limpia la persistencia para no mezclar configuraciones.
- Una pestaña oculta suspende la adquisición.

Se mantienen zoom, matriz, distancia a la piel, colimador, ventana energética
y corrección de orientación. Como punto de partida: LEHR, 140 keV, 20%,
zoom 1×, matriz 256, 4.000 cuentas/s y 0,75 s. Introduzca la camilla en el
campo. Para abrir directamente la demostración local con los brazos elevados,
añada `?demo=oseo-brazos-arriba` a la dirección de `index.html`.

Todos los datos lineales están comprimidos e incrustados en el HTML, que
funciona sin servidor ni red en Chrome/Edge modernos (DecompressionStream).
El montaje de 16 vistas está en `assets/icrp145/montaje-brazos-arriba.jpg`.
Las imágenes de referencia anteriores se conservan en `assets/` como material
histórico; ya no alimentan el estudio óseo.

### Regeneración y comprobaciones

La preparación requiere los archivos locales originales y derivados de ICRP;
no se distribuyen las mallas ni los volúmenes grandes en el repositorio.
Con la carpeta de trabajo `../icrp145-oseo-360`, que contiene el proyector,
las mallas en caché, la corrección de huesos largos y la serie al costado:

```powershell
# Python con numpy, scipy, numba y Pillow:
python scripts/generate_icrp_arms_up.py --source ../icrp145-oseo-360
# Incrustar ambas series y el motor temporal:
python scripts/build_icrp_assets.py --source ../icrp145-oseo-360
# Python con playwright y Chrome instalado:
python tests/test_bone_mode.py
python tests/test_table_distance.py
python tests/test_icrp_live.py
```

La procedencia, parámetros y limitaciones se conservan en
`assets/icrp145/procedencia.json`. Véase también `THIRD_PARTY_NOTICES.md`.

## Calidad de imagen y distancia

La resolución (PSF) y las cuentas de cada detector dependen de la distancia entre
la cara del cabezal y el paciente, no de la distancia al isocentro. El motor 3D
mide esa distancia a la piel (o al tablero, si el paciente aún no entró al
campo) en la dirección de cada cabezal. Por eso subir la camilla acerca al
paciente al detector superior y lo aleja del inferior, exactamente igual que
acercar o retirar el propio cabezal; de lado, la altura no cambia la distancia.
La PSF crece de forma lineal desde el contacto, de modo que cada centímetro
cuenta. El rótulo de cada imagen muestra las dos distancias: al isocentro y a la
piel. Sin motor 3D se conserva la distancia al isocentro.

`python tests/test_table_distance.py` comprueba esa equivalencia.

## Imágenes de Exploración

El estudio **Exploración** utiliza las imágenes de `assets/exploracion.png`,
con 16 direcciones únicas cada 22,5° e interpolación circular. La referencia
de 360° se conserva en el montaje original y equivale a 0° en el simulador.
Ambos detectores siguen el ángulo del gantry y el recorte de la camilla.
Se mantiene el perfil de adquisición existente de Exploración (I-131 / HE).

Para regenerar este atlas incrustado ejecute
`python scripts/build_exploration_atlas.py` (requiere Pillow). La preparación
separa los paneles, elimina marcos y rótulos y conserva las proporciones.
El montaje original permanece intacto y `index.html` funciona sin conexión.

## MAG3 basal: integrado en Imagen en vivo

Pulsa **inyectar MAG3** para iniciar un basal de 20 minutos. La suma acumulada
y el cuadro dinámico se muestran en los dos recuadros de **Imagen en vivo**,
con pausa, finalización, velocidad, ganancia, selección de cuadro y exportación
PNG/JSON en la misma barra. La vista 3D y el mando permanecen accesibles.

El cabezal más próximo a posterior al inyectar queda vinculado a la adquisición
(D2 en decúbito supino a 0°). La suma incluye todo el campo visible, sin ROI
renal. Mover camilla o gantry, cambiar brazos, zoom o ajustes modifica las
cuentas siguientes; las anteriores permanecen en coordenadas del detector,
sin corrección de movimiento. La matriz queda fijada al inyectar.

Cambiar de estudio muestra sus detectores y mantiene el basal en marcha.
Seleccionar **MAG3 basal** recupera las cuentas y controles, también al finalizar.
Pulsar **inyectar MAG3** durante un basal activo conserva la misma adquisición;
después de finalizar inicia una nueva.
Se guardan 30 cuadros de 2 s, 24 de 10 s y 30 de 30 s. Sólo se incluye el basal.
Antes de inyectar se muestra la señal esperada; al inyectar, los recuadros
muestran las cuentas acumuladas con estadística de Poisson. La ganancia de visualización no altera las cuentas.

Las bases emisoras derivadas de ICRP 145 contienen quince componentes anatómicos,
36 ángulos cada 10°, ambas posturas de brazos y píxeles de 6 mm. La cinética es
sintética y conserva la del proyecto local `../icrp145-mag3-cuerpo-entero`.
La referencia basal es el caso de Craig Hacking en
[Radiopaedia](https://radiopaedia.org/cases/normal-captopril-renal-mag3-nuclear-study),
sin incorporar imágenes clínicas ni representar una calibración absoluta.

El primer minuto incluye una **fase vascular / arterial** en cuadros de 2 s:
tránsito central, pulmonar, arterial y perfusión renal. Los grandes vasos del
tronco y las extremidades se voxelizan de las etiquetas originales de ICRP 145.
El bolo redistribuye la actividad circulante sin aumentar la dosis simulada;
después de 60 s se conserva la cinética basal anterior. Sus tiempos de tránsito
son supuestos docentes, no mediciones del estudio de referencia. La perfusión
pulmonar y renal usa máscaras de órgano; no resuelve microvasculatura.

Puedes revisar los primeros cuadros con **Cuadro** en la misma barra. La suma
acumulada conserva también los eventos de esta fase. Verificación adicional:
`python tests/test_mag3_arterial.py`. El montaje de cuentas esperadas está en
`assets/icrp145/mag3-fase-arterial.png` y los resultados numéricos en
`assets/icrp145/mag3-arterial-verificacion.json`.

Regeneración: `python scripts/build_mag3_assets.py` (requiere los volúmenes
locales originales, NumPy, SciPy y Numba). Para cambios sólo del motor:
`python scripts/embed_mag3_engine.py`.
Verificación: `node tests/test_mag3_acquisition.cjs`; comprueba conservación de
cuentas, campo vacío, actividad extrarrenal, rotación, cuadros y controles con
DOM simulado. No sustituye una comprobación visual del navegador.
Procedencia y resultados: `assets/icrp145/mag3-procedencia.json` y
`assets/icrp145/mag3-verificacion.json`.

## Derechos de autor

Copyright © 2026 Luciano Tejada Castro. Distribuido bajo licencia [MIT](LICENSE).

Consulte también el aviso visible «Derechos de autor» dentro de
`index.html` y [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Contacto: lucianotejada@uchile.cl

## Advertencia

Simulación exclusivamente educativa. No es un dispositivo médico ni debe
utilizarse para tomar decisiones clínicas o asistenciales.
