# Simulador Gantry 3D

Simulador de posicionamiento del gantry y adquisición gammagráfica.
El HTML contiene la interfaz; las proyecciones, imágenes y modelos están
en archivos separados del mismo repositorio, dentro de `assets/runtime/`.

## Procesamiento óseo integrado

Finaliza una adquisición ósea y pulsa **Enviar a procesamiento**, o abre la
pestaña **Procesamiento óseo**. Las adquisiciones terminadas durante la sesión
y las guardadas aparecen automáticamente en el menú lateral, agrupadas como
estáticas o de cuerpo entero y rotuladas con los nombres de los detectores.
Selecciona la adquisición y su imagen desde ese menú. **Página flexible**
conserva una composición editable por par de detectores con las cuentas originales.
Ventana/nivel, inversión, zoom, composición, **Guardar proyecto** y
**Exportar PNG** reutilizan el visor de `simulador-cintigrafia-osea`.

**Volver al gantry** conserva el procesamiento durante la sesión. Para
conservarlo tras recargar, usa **Guardar proyecto** (`.dicomproject`) y después
**Abrir proyecto**. Las imágenes originales siguen en el catálogo de
adquisiciones. El visor se descarga al entrar a procesamiento y el 3D descansa
mientras se trabaja allí. Detalles, procedencia y límites del intercambio en
[processing/README.md](processing/README.md).

## Ejecución

Abra la versión de GitHub Pages. Para uso local, descargue el repositorio
completo y ejecute `python -m http.server 8000` en su carpeta; después abra
`http://localhost:8000`. Esto funciona sin Internet, con los archivos locales.
Abrir sólo `index.html` con `file://` ya no es compatible con la carga de datos.

El HTML pasó de 56 MB a aproximadamente 1 MB. Cada estudio y postura se
descarga y descomprime al seleccionarlo; MAG3 se prepara al seleccionarlo o
inyectarlo. La sala se carga automáticamente en segundo plano al abrir el
simulador. Los recursos tienen nombres con huella de
contenido: una actualización de la interfaz conserva las URLs de los datos
que no cambiaron, permitiendo reutilizar la caché HTTP del navegador.
La primera selección de un estudio aún necesita descargar sus proyecciones.
No se reduce resolución ni se modifican las cuentas esperadas.

Después de modificar motores: `python scripts/refresh_lazy_assets.py`.
Los generadores de datos separan automáticamente sus recursos al terminar;
`python scripts/externalize_assets.py` también puede ejecutarse por separado.

### Sala de SymbiaRoom

La sala aparece por defecto al abrir el simulador. **Vista sala** encuadra
el entorno completo y **Ocultar sala** recupera el suelo habitual. Las paredes
que quedan entre una cámara exterior y el equipo se ocultan automáticamente.
Los controles del gantry y la adquisición MAG3 siguen funcionando.

El recurso se descarga por separado, se descomprime y crea en GPU
al abrir el simulador, sin esperar su descarga para habilitar el gantry ni el
estudio. Son seis grupos y 81.798 triángulos, sin físicas,
luces ni sombras dinámicas adicionales. Oculto no se dibuja; tras la primera
carga conserva su memoria para poder volver a mostrarlo rápidamente.

**Rendimiento** permite comparar fps, tiempo CPU de la escena y llamadas de
dibujo en el navegador. No mide tiempo GPU ni garantiza el mismo rendimiento
en todos los equipos. La colocación del entorno es visual; no cambia los
límites mecánicos del simulador. [Fuentes y adaptaciones](assets/symbia-room/CREDITS.md).

### Equipo y control genéricos

El simulador usa exclusivamente el gantry simple generado con primitivas 3D.
El mando es un diseño original HTML/CSS: giro, distancia de ambos detectores,
altura y recorrido de camilla, con movimiento continuo y modo rápido.
No se descarga geometría CAD de Siemens ni la fotografía del mando.
Los créditos de paciente y mobiliario están en **Derechos de autor** y en
[assets/CREDITS.md](assets/CREDITS.md), con autores, fuentes, licencias y cambios.
La licencia MIT del código no sustituye las licencias de esos recursos.

### Colisiones y entrenamiento

El indicador 3D muestra la separación de cada detector, la región corporal
más próxima y un marcador sobre el punto de aproximación/contacto. El menú
**Colisiones** permite elegir **Protección** (margen de 2,5 mm) o
**Entrenamiento** (penetración geométrica máxima de 10 mm), activar la alarma
sonora y consultar los últimos 30 episodios de esta sesión. El detector puede
retirarse aunque haya quedado en contacto. La camilla y el barrido automático
mantienen siempre la protección; el modo de entrenamiento sólo permite
penetrar la envolvente del paciente durante movimientos manuales.

El cálculo utiliza los triángulos del muñeco 3D en cada postura, incluidos
los brazos y las manos elevados, y cajas conservadoras por componente del
detector simple. Recorta cada triángulo al área que ocupa la pieza; no utiliza
el ancho máximo del cuerpo para todas las regiones. Las posturas se preparan
una vez y se indexan por posición longitudinal. El recorrido manual se revisa
en incrementos máximos de 1 mm o 0,25° y se refina al encontrar el límite.
El barrido también revisa los movimientos antes de acumular cuentas.
Para reutilizar las proyecciones de cuerpo entero, su desenfoque y sensibilidad
se actualizan en intervalos de 5 mm de distancia a piel, de forma independiente
por detector. Esta discretización de imagen no afecta el cálculo de colisiones.

La distancia es una aproximación geométrica, no una medida calibrada del
equipo real. Las cajas rellenan curvas y huecos de las piezas; no se modelan
deformación de tejidos, fuerzas, lesiones ni todas las colisiones del gantry
con la sala. Los atlas ICRP no son la superficie de colisión: lo es el muñeco
visible. El gantry simple es el único equipo disponible.

Actualizar motor: `python scripts/embed_collision.py`.
Prueba numérica y con GLB real: `node tests/test_gantry_collision.cjs`.

### Adquisición estática para los estudios del menú

Óseo, MIBI, tiroides/pertecnetato, exploración I-131, paratiroides, DMSA y MAA comparten
dos vistas en vivo y dos imágenes adquiridas. **Iniciar adquisición** pide los
nombres de los detectores y una meta de cuentas o tiempo. Incluye pausa,
avance rápido, adquisición instantánea y guardado local con el nombre del estudio.
Al cambiar de estudio, la adquisición anterior queda pausada y se conserva en
memoria; al volver puede reanudarse. Las cuentas de distintos estudios nunca
se mezclan. MAG3 mantiene su adquisición dinámica basal y el barrido de cuerpo
entero sigue disponible en óseo.

Todos los estudios estáticos activos usan proyecciones de volúmenes basados
en ICRP 145. Tiroides/pertecnetato, I-131, DMSA y MAA tienen
72 vistas a pasos de 5°, con brazos al costado, desde la captación por órgano
del proyecto `icrp145-multitrazador-ap-pa`. MIBI conserva su serie de brazos
arriba y el ventrículo sintético adaptado previamente. Paratiroides comparte
exactamente ese mismo atlas cardíaco MIBI de 72 vistas: misma captación,
ventrículo izquierdo ampliado, postura de brazos arriba y escala de imagen.
Ambos estudios reutilizan la misma descarga, pero mantienen adquisiciones
y nombres guardados independientes. Los PNG antiguos de
tiroides, I-131 y paratiroides ya no alimentan las imágenes en vivo ni las
nuevas adquisiciones; las adquisiciones guardadas anteriores se conservan.

Los escenarios son pertecnetato a 20 min; I-131 al día 5 tras tratamiento de
100 mCi y tiroidectomía, con pequeño remanente cervical sintético y sin focos
metastásicos añadidos; paratiroides con el modelo MIBI cardíaco a 60 min, sin adenoma;
DMSA a 3 h y MAA a 5 min. La segmentación disponible no distingue las
paratiroides: este escenario no añade glándulas o lesiones artificialmente
visibles. La referencia de protocolo para MIBI es la
[guía SNMMI de paratiroides](https://tech.snmjournals.org/content/40/2/111);
los pesos de actividad son supuestos docentes, no parámetros clínicos ajustados.

Incluyen atenuación y PSF; no incluyen dispersión ni transporte Monte Carlo.
Para I-131 se conserva la aproximación del modelo AP/PA previo: μ a 140 keV
multiplicado por 0,70 y PSF de 15 mm. La actividad se normaliza una sola vez
para toda la serie; 100 mCi no se convierte en cuentas absolutas de cámara.
Son simulaciones educativas de actividad relativa, sin validación clínica.
Cada atlas comprimido se descarga sólo al seleccionar su estudio. Procedencia,
reglas de captación y comprobación AP/PA: `assets/icrp145/organ-static-provenance.json`.
`static-atlas-provenance.json` documenta únicamente los atlas antiguos retirados.

Para regenerar: `python scripts/build_organ_static_360.py` (NumPy, SciPy,
Numba y Pillow, más el proyecto fuente junto a este repositorio), seguido de
`python scripts/enable_static_studies.py`, `python scripts/embed_bone_acquisition.py`
y `python scripts/refresh_lazy_assets.py`. Puede limitarse la generación con
`--studies thyroid exploration parathyroid`. `build_static_atlases.py` ahora
redirige al generador por órganos para impedir recuperar los PNG por error.

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

Para óseo tardío (desde 120 min), el objetivo inicial se adapta a la región:
400.000 cuentas en cráneo/región osteoarticular, 1.000.000 en tronco y
250.000 en piernas/pies; por tiempo se proponen 300 s. Son valores editables
basados en los intervalos de la [guía EANM](https://pmc.ncbi.nlm.nih.gov/articles/PMC4932135/).
La asignación por centro de campo es una aproximación: pelvis se agrupa con
tronco y cuello/muslos con región osteoarticular. Si los detectores muestran
regiones distintas se propone el mayor objetivo para ambos. Las fases tempranas
y los demás estudios conservan sus objetivos iniciales anteriores.

Antes de empezar se muestra la duración estimada de cada detector a 1×:
objetivo dividido por su tasa actual. Es una estimación local, no integra la
evolución futura del trazador; movimientos, vaciamiento vesical y cinética
pueden modificarla. Los valores manuales se conservan al mover el equipo y al
cambiar de estudio durante la sesión. **Usar sugerido** vuelve al objetivo
regional automático. No cambia las metas de adquisiciones ya iniciadas.

Esta revisión no introduce retardos ni reduce artificialmente las cuentas/s.
La sensibilidad asumida de MDP/MIBI sigue siendo 100 cps/MBq antes de atenuación;
como contraste de orden de magnitud, [Siemens publica 202 cpm/µCi para Symbia
con LEHR a 10 cm](https://www.siemens-healthineers.com/en-iq/molecular-imaging/spect-ct-scanner/symbia-prospecta),
equivalentes a unos 91 cps/MBq. Esa comparación no constituye una calibración
absoluta del simulador contra adquisiciones clínicas.

La suma usa eventos nuevos de Poisson sobre los campos lineales del fantoma;
no acumula capturas de la ventana de persistencia. **Avance rápido** ofrece
1×, 10×, 30× y 60× mediante un botón cíclico y un selector. **Adquisición
instantánea**, junto a **Iniciar adquisición**, inicia directamente con los nombres,
velocidad u objetivo actuales y completa la nueva adquisición. Si falta un dato
o no puede iniciarse, muestra el motivo y abre la configuración. Durante una adquisición completa
el tiempo o las cuentas restantes con el campo y los ajustes del momento.
Si no hay señal, no inventa cuentas para alcanzar la meta.

Mover el equipo, cambiar el zoom, recentrar o ajustar la energía afecta sólo
las cuentas nuevas. La matriz queda fijada durante la adquisición. Puedes
pausar, reanudar o finalizar conservando el resultado; iniciar otra adquisición
borra la suma anterior al pulsar Comenzar. Cambiar de estudio pausa la
adquisición ósea; al regresar puedes reanudarla. Una pestaña oculta suspende
su reloj. Congelar o limpiar la persistencia no modifica la suma adquirida.

Motor y empaquetado: `scripts/bone_acquisition.js` y
`python scripts/embed_bone_acquisition.py`. Prueba numérica con datos ICRP
y control de reloj: `node tests/test_bone_acquisition.cjs`.

El selector **Tipo → Cuerpo entero** realiza un barrido secuencial desde la posición
actual hacia los pies sobre dos imágenes rectangulares. En escritorio, las imágenes ocupan la
franja derecha, desde la parte superior de la vista 3D hasta el borde inferior.
El gantry, los controles y las dos vistas en vivo quedan a la izquierda. El mando
es más pequeño y se elimina la barra de título azul, conservando el menú.
Los dos cuadros en vivo conservan el campo local del
detector para posicionar. Se habilita el inicio únicamente con **pies hacia
adentro** tanto en la posición física como en la declarada y recorrido restante
hacia los pies (Z mayor que 16 cm). No exige centrar en cráneo ni recentrar
las imágenes: toma la posición actual sin mover antes la camilla.

El único parámetro del barrido es la **velocidad de camilla en cm/min**
(1–60; valor inicial 10). Se mantienen los nombres para identificar ambos
detectores. Primero se alinean los cabezales en la orientación paralela más
cercana al paciente (0°/360° o 180°), con giro limitado a 12°/s. Antes de
girar se separan lo necesario para dejar espacio en todo el recorrido angular.
Después se acercan automáticamente a 1 cm del tope geométrico seguro del
simulador, con movimiento limitado a 8 cm/s. La camilla permanece quieta y
no se acumulan cuentas durante la separación, alineación y acercamiento. Después
la camilla recorre desde su posición inicial hasta Z 16 cm. El recorrido 200→16 equivale a
175 cm físicos del modelo, por lo que 10 cm/min requiere 17 min 30 s de
movimiento, además del posicionamiento inicial de los cabezales. Si comienza
más abajo, recorre sólo la distancia restante; las zonas que ya quedaron fuera
del detector no se adquieren retrospectivamente. Los topes
se revisan antes de cada desplazamiento; si hace falta reajustar un detector,
la camilla espera. El contorno de seguridad usa la envolvente conservadora
actual del modelo 3D, no una medición clínica de superficie.

Se integran eventos de Poisson únicamente durante la exposición de cada fila
al campo móvil de 56×56 cm, registrados en coordenadas del cuerpo. Las zonas
que aún no entran en el detector permanecen vacías; regiones fuera del campo
durante todo el recorrido (por ejemplo manos muy por encima del cráneo) no
reciben cuentas inventadas. Una línea indica el centro del barrido. Una
velocidad menor aumenta el tiempo de exposición y las cuentas esperadas.
No hay objetivo por cuentas/tiempo en este modo. **Avance rápido** acelera el
reloj simulado (1×/10×/30×/60×) conservando la velocidad física de camilla
elegida. **Adquisición instantánea** calcula el recorrido restante en pasos
de hasta 0,5 segundos simulados, con captación, evolución MDP, alineación y
comprobaciones de colisión en cada paso; cede el control entre bloques para
mantener la interfaz disponible. Un impedimento de seguridad detiene el barrido.
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

Los datos lineales están comprimidos en archivos externos y se cargan por
estudio y postura en Chrome/Edge modernos (DecompressionStream).
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
con pausa, finalización, avance rápido (1×/10×/30×/60×), adquisición instantánea,
ganancia, selección de cuadro y exportación
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
En MAG3, el botón **Adquisición instantánea** junto a **inyectar MAG3** inicia
un basal o completa el activo. El botón de la barra dinámica completa sólo el
basal activo. Se conserva la suma previa y se calculan todos los cuadros restantes.
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

## MDP: actividad y biodistribución de 0 a 3 horas

El cintigrama óseo calcula las cuentas a partir de la **actividad inyectada**
(MBq o mCi, 1 mCi = 37 MBq) y el **tiempo inyección–examen**. El selector manual
de cuentas/s queda reservado a los demás estudios. El valor inicial de 740 MBq
y 120 min es un ejemplo de simulación, no una recomendación de administración.

La línea temporal permite explorar 0–180 min o reproducir la evolución hasta
300×. La fase vascular redistribuye el bolo entre compartimento central,
pulmonar, arterial y sangre periférica; después predominan el hueso y la
eliminación renal. La opción de micción vacía la vejiga a los 120 min y permite
su llenado posterior. Los porcentajes mostrados se refieren a la actividad
inicial, después del decaimiento, por lo que no suman 100% a tiempos tardíos.

Se proyectan ocho bases de actividad normalizadas de la anatomía ICRP 145:
hueso, sangre, tejido blando, riñones, vejiga, región vascular central,
pulmones y arterias. La base ósea contiene exclusivamente hueso cortical y
trabecular, sin reutilizar el fondo o la vejiga de una imagen ósea tardía.
Las dos posturas usan muestreo de 6 mm, 36 ángulos interpolados y atenuación
a 140 keV. Brazos arriba es una articulación docente derivada, no una postura
oficial ICRP. Los órganos reutilizan las bases anatómicas normalizadas del
atlas MAG3; **la cinética es específica de MDP**, independiente de MAG3.

La fracción sanguínea biológica se aproxima por
`0.78 exp(-t/2) + 0.14 exp(-t/45) + 0.08 exp(-t/180)`, con t en minutos.
La actividad que sale de sangre se reparte conservativamente entre hueso,
tejidos, riñones y orina. La captación ósea tiende a 50%; todos los
compartimentos aplican semiperíodo físico de 360,402 min. Los anclajes de sangre
~10% a 1 h y ~5% a 2 h y la retención esquelética proceden de la
[ficha de medronato de DailyMed](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=3c91d0d8-6cc5-834c-bda0-aa83a873b9fb).
La distinción entre fases y las imágenes tardías se apoyan en la
[guía EANM](https://pmc.ncbi.nlm.nih.gov/articles/PMC4932135/).
El resto de los tiempos y repartos son supuestos docentes, no parámetros
farmacocinéticos certificados por ICRP ni ajustes a datos de un paciente.

La sensibilidad efectiva LEHR se supone de **100 c/s/MBq antes de atenuación**.
La tasa detectada aplica la actividad, las fracciones temporales, la transmisión
de cada órgano, el campo, el colimador y la ventana energética existentes.
Es una escala absoluta supuesta: no se ha calibrado con un equipo real. Los
eventos acumulados mantienen ruido de Poisson y la ventana móvil en vivo.

La adquisición estática integra la cinética en pasos de hasta 1 s durante el
primer minuto y 5 s después; el barrido usa pasos de hasta 0,5 s. El avance
rápido y la adquisición instantánea también avanzan el reloj del RF. La dosis,
el instante y la micción quedan bloqueados durante una adquisición. Pausar
adquisición pausa su reloj simulado; fuera de adquisición sólo avanza al pulsar
Reproducir evolución. A los 180 min se detiene la adquisición, aunque la meta
de cuentas aún no se alcance. Las copias guardadas conservan actividad,
intervalo de tiempo y supuestos originales.

El realce cardíaco del componente vascular se conserva hasta los 5 min y
se atenúa suavemente entre 5 y 30 min. Desde los 30 min la sangre residual
usa la base de fondo difuso, sin realce focal del corazón ni de los vasos.
Es una elección docente de representación espacial, no un umbral fisiológico
de desaparición de sangre: las fracciones sanguíneas y el balance de actividad
se mantienen. No altera la captación ósea, renal o vesical ni el MIBI.
Las cuentas ya adquiridas y las imágenes guardadas no se borran al transcurrir
ese intervalo; el cambio afecta a los eventos nuevos (`mdp-v2`).

Los atlas externos se cargan sólo para la postura seleccionada (3,34/3,70 MB),
y se cachean las bases ya recortadas y desenfocadas. Cambiar el tiempo sólo
remezcla estas bases. El HTML no incorpora los volúmenes ni los binarios.

Regeneración: `python scripts/build_mdp_assets.py` (requiere fuentes locales),
`python scripts/embed_mdp.py`, `python scripts/embed_bone_acquisition.py` y
`python scripts/refresh_lazy_assets.py`. Prueba: `node tests/test_mdp.cjs`.
Procedencia y pruebas: `assets/icrp145/mdp-provenance.json` y
`assets/icrp145/mdp-verification.json`.

## MIBI cardíaco: actividad, biodistribución y demora

En **MIBI cardíaco** las cuentas/s proceden de la actividad inyectada en MBq
o mCi y del tiempo inyección–examen. Los controles permiten recorrer **0–12 h**,
reproducir la evolución, elegir reposo, ejercicio o estrés farmacológico y
comparar el tiempo de referencia con una demora de 6 h. Conserva el VI ampliado,
asimétrico y con captación heterogénea que ya utilizaba el simulador.

Las diez bases anatómicas son miocardio, sangre, tejidos blandos, hígado,
vesícula, intestino delgado, colon, riñones, vejiga y glándulas. Se normalizan
antes de proyectar; conservan la atenuación y las diferencias angulares.
La anatomía deriva del fantoma ICRP 145 y su articulación docente de brazos
arriba; el VI sigue siendo el emisor sintético previo, no una segmentación
oficial ICRP. Las bases vasculares y renales reutilizan anatomía de MAG3,
**sin reutilizar su farmacocinética**. Muestreo de 6 mm y 36 vistas interpoladas;
el nuevo atlas externo ocupa 2,72 MB y se descarga sólo al elegir MIBI.

Corazón e hígado interpolan logarítmicamente las fracciones **biológicas**
de la tabla 6 de la [ficha de sestamibi de DailyMed](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=07c893fc-cfba-1d98-0232-6448463afb87)
a 5, 30, 60, 120 y 240 min, por separado para reposo y ejercicio. El
decaimiento físico de Tc-99m (semiperíodo 360,402 min) se aplica una sola vez,
después de la distribución biológica. Antes de 5 min la captación se aproxima
por una subida exponencial; después de 4 h se extrapola con semiperíodos
biológicos de 6 h para miocardio y 30 min para hígado.

El aclaramiento sanguíneo, tránsito hepatobiliar, riñones, orina y fondo son
compartimentos docentes conservativos. Sus repartos y constantes adicionales
son supuestos, no curvas individuales medidas. La salida urinaria tiende a
27% de la actividad inicial; se puede simular micción cada 2 h. El intestino
recibe la actividad hepatobiliar y puede seguir interfiriendo tras disminuir
el hígado. La actividad corporal más la eliminada coincide con la actividad
inicial corregida por decaimiento. No se simulan enfermedad, respuesta de
flujo coronario, extravasación ni dos inyecciones de un protocolo de un día.

Los avisos usan los mínimos orientativos de la
[guía ASNC 2016 de protocolos y trazadores](https://www.asnc.org/wp-content/uploads/2024/06/ASNC-SPECT-ProtocolsTracers-Guidelines2016.pdf):
15–20 min después de ejercicio, 45–60 min en reposo y desde 60 min tras
estrés farmacológico. Son referencias para esta simulación, no un óptimo
universal ni una validación automática de la imagen. La guía admite demora
de hasta 2 h cuando sea necesaria; el modelo señala demoras posteriores y
demoras prolongadas después de 4 h, sin declarar la imagen inválida por un
umbral fijo. Estos últimos umbrales organizan la demostración docente.
El escenario farmacológico usa explícitamente las curvas de reposo como
aproximación, con su propia espera orientativa; no representa la cinética
específica de un fármaco. No se atribuyen estos valores a la guía ASNC 2026.

La tasa usa la misma sensibilidad LEHR **supuesta** de 100 c/s/MBq antes de
atenuación que MDP, además del campo, distancia, colimador y ventana existentes.
No es una calibración de cámara real. El indicador de cuentas del VI compara
su actividad efectiva con el tiempo de referencia del protocolo; el factor
de tiempo es una estimación local, sin resolver el cambio posterior durante
una adquisición larga. La imagen ajusta su contraste automáticamente, pero
una adquisición de igual duración acumula menos eventos y más ruido relativo
cuando disminuye la actividad.

La adquisición estática integra las fracciones cambiantes, incluso en avance
rápido o instantáneo, en pasos de hasta 1 s durante el primer minuto y 5 s
después. Pausar detiene el reloj simulado. Los parámetros de inyección quedan
bloqueados mientras hay una adquisición pendiente; guardar conserva actividad,
protocolo, tiempos inicial/final y supuestos. El límite de 12 h detiene el
modelo, no representa una caducidad clínica. Paratiroides mantiene su atlas
previo compartido y no hereda estos tiempos de perfusión miocárdica.

Regeneración: `python scripts/build_mibi_kinetic_assets.py` (requiere fuentes
locales), `python scripts/embed_mibi_kinetics.py`,
`python scripts/embed_bone_acquisition.py` y `python scripts/refresh_lazy_assets.py`.
Prueba: `node tests/test_mibi_kinetics.cjs`. Procedencia y resultados en
`assets/icrp145/mibi-kinetic-provenance.json` y
`assets/icrp145/mibi-kinetic-verification.json`.

## Imagen final con las condiciones actuales

En el menú **SEÑAL → Imagen final con condiciones actuales**, los dos cuadros
de adquisición se ocultan y las dos imágenes de detector muestran una
adquisición estática prevista. Se elige duración (1–3.600 s) o cuentas por
detector (1–10.000.000). Distancia a piel, orientación, campo, posición de la
camilla, recentrado, zoom, matriz, colimador y ventana energética usan los
mismos campos lineales y desenfoque que la adquisición real del simulador.
La geometría permanece fija durante cada predicción; no se prevé un barrido
de cuerpo entero. MAG3 conserva su modo dinámico propio.

Óseo y MIBI integran sus fracciones temporales desde el intervalo
inyección–examen seleccionado, con actividad y decaimiento actuales, sin
avanzar el reloj del estudio. Para otros estudios estáticos se usa su atlas
y tasa actuales. La predicción por tiempo genera ruido de Poisson; por
cuentas genera exactamente el total elegido a partir de la distribución
integrada, con un tiempo estimado independiente para cada detector. Ese
tiempo procede de la tasa esperada, no de una realización aleatoria del
instante de llegada del último evento. Si el modelo termina antes de llegar
al objetivo, se muestra la exposición disponible y el aviso correspondiente.

Los cambios recalculan la imagen; el ruido se conserva entre repintados y
**Nueva muestra de ruido** genera otra realización. El cálculo no inicia,
guarda ni modifica adquisiciones. Una adquisición estática pendiente se
pausa al entrar y sigue pausada al salir; conserva sus cuentas y parámetros
de inyección bloqueados hasta finalizar. Durante un barrido en movimiento,
la opción queda deshabilitada. Volver a **En vivo** recupera los cuatro cuadros.

Motor externo: `scripts/final_preview.js`. Actualización:
`python scripts/embed_final_preview.py`; prueba:
`node tests/test_final_preview.cjs`.

## Cuadrículas de cuentas por píxel

Las imágenes de adquisición y de vista final incluyen un inspector de cuentas
por píxel. Un clic en la imagen selecciona una zona marcada en amarillo; el
panel compara esa misma zona con 2×2 celdas en matriz 128 y 4×4 en matriz 256.
Para datos de 256, cada celda de 128 suma cuatro cuentas de píxeles originales.
Para datos de 128, la división en 256 es uniforme y se identifica como
ilustrativa: no recupera resolución ni genera una adquisición independiente.
Ambas cuadrículas conservan el total de la zona. Las imágenes guardadas usan su
propia matriz. No se modifican las cuentas ni la imagen para dibujar el marco.
Actualizar con `python scripts/embed_pixel_grid.py`; comprobación numérica:
`node tests/test_pixel_grid.cjs`.

## Actividad administrada por estudio

Todos los estudios muestran mCi por defecto, con conversión a MBq (1 mCi = 37 MBq).
Los valores iniciales son escenarios docentes de adulto:

| Estudio | Actividad inicial | Momento representado |
| --- | --- | --- |
| Óseo, MDP | 20 mCi IV | 120 min; conserva su cinética de 0–3 h |
| MIBI cardíaco | 20 mCi IV | 60 min; conserva protocolos y cinética |
| Pertecnetato | 5 mCi IV | Atlas a 20 min |
| Paratiroides, MIBI | 20 mCi IV | Atlas compartido con MIBI a 60 min |
| DMSA | 3 mCi IV | Atlas a 3 h |
| MAA | 3 mCi IV | Atlas a 5 min |
| MAG3 | 5 mCi IV en bolo | Basal dinámico desde la inyección |
| I-131 postratamiento | 100 mCi oral | 7 días; selector de 50, 100, 150 o 200 mCi |

Referencias de actividad adulta: [pertecnetato, 1–10 mCi](https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=3ae14c6b-3daf-4dd1-bbdb-e990fe8100e4),
[DMSA, 2–6 mCi](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ddd90c4a-5792-49c9-837f-710d1a604742),
[MAA, 1–4 mCi](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=bbefaa05-1dc0-3ae7-7264-ce1eddf0da2b),
[paratiroides con MIBI, 20–30 mCi](https://tech.snmjournals.org/content/40/2/111),
[MIBI cardíaco, 10–30 mCi](https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=07c893fc-cfba-1d98-0232-6448463afb87),
[MAG3, 5–10 mCi](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=d497f2a2-8e8d-4372-ba09-f8e6b22d2cf8).
Los cuatro escenarios de I-131 y los 7 días son los solicitados para este simulador;
la [ficha de I-131](https://dailymed.nlm.nih.gov/dailymed/getFile.cfm?setid=380e8e26-0625-4233-b36e-afb9f66e8a77)
documenta la vía oral y su semivida física de 8,02 días.

En los atlas estáticos, la tasa de referencia previa (4.000 c/s en la normalización
del motor) se escala por actividad administrada / actividad inicial del estudio.
No hay una calibración absoluta de sensibilidad de un equipo real ni redistribución
biológica nueva. I-131 conserva la distribución del atlas del día 5, escalada por
`2^(-2/8.02)` para representar el decaimiento físico hasta el día 7; esto no equivale
a estimar retención corporal o eliminación biológica. La interfaz identifica esta
limitación. MDP y MIBI mantienen sus modelos de captación y aclaramiento existentes.

MAG3 conserva las curvas temporales originales y escala sus integrales por la
actividad elegida respecto a 5 mCi; no vuelve a aplicar el decaimiento ya incluido.
La actividad queda fijada al iniciar cada adquisición y se conserva en el guardado
local o JSON de MAG3. Duplicarla duplica las cuentas esperadas para tiempo fijo;
un objetivo fijo de cuentas reduce el tiempo necesario. Las cuentas observadas
mantienen ruido de Poisson y los ajustes de ventana, colimador y geometría.

Actualizar con `python scripts/embed_study_activity.py`, seguido de
`python scripts/optimize_loading.py`. Verificar con `node tests/test_study_activity.cjs`
y `node tests/test_mag3_acquisition.cjs`.

## Carga y caché de recursos

El HTML pesa aproximadamente 301 KB. La biblioteca 3D se sirve como un archivo
independiente con hash y se precarga junto con el paciente, la sala y el equipo.
Los atlas grandes se descargan en partes de hasta 512 KiB, con un máximo global
de cuatro solicitudes simultáneas y descompresión durante la descarga. Las partes
reconstruyen exactamente los archivos originales: no cambian resolución, ángulos
ni cuentas. Sólo se solicitan los atlas del estudio seleccionado.

Los recursos con hash usan `force-cache`: se reutilizan entre visitas mientras
el navegador conserve su caché. Un cambio de contenido genera una URL nueva.
No se usa un service worker ni se modifica el almacén de adquisiciones guardadas.
La sala sigue activada por defecto y la ventana de carga espera a los recursos
necesarios y al primer render completo.

Después de actualizar atlas o ejecutar scripts de incrustación, ejecutar al final
`python scripts/optimize_loading.py` para regenerar las partes y precargas.
Comprobar con `node tests/test_asset_transport.cjs` (bytes idénticos, concurrencia,
fallos/reintentos y descompresión) y `node tests/test_lazy_assets.cjs`.
Los archivos originales siguen publicados para versiones anteriores en caché.

## Paciente visible

Se restauró el modelo «Man» de Quaternius, anterior a la importación de Godot,
con brazos articulados y colisiones calculadas sobre su malla en cada postura.
El modelo activo es `assets/runtime/patient.dad8fa3ca2bc7760.glb`.
Los atlas, la biodistribución ICRP y las adquisiciones son independientes de esta figura.

Los archivos MakeHuman/Godot y `assets/patient/manifest.json` quedan como archivo
de la alternativa descartada y para versiones antiguas en caché; no se cargan
en el simulador actual. Los scripts `build_godot_patient.py` y
`embed_godot_patient.py` pertenecen a esa alternativa y no forman parte de la
actualización habitual.

## Derechos de autor

Copyright © 2026 Luciano Tejada Castro. Distribuido bajo licencia [MIT](LICENSE).

Consulte también el aviso visible «Derechos de autor» dentro de
`index.html` y [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Contacto: lucianotejada@uchile.cl

## Advertencia

Simulación exclusivamente educativa. No es un dispositivo médico ni debe
utilizarse para tomar decisiones clínicas o asistenciales.

### Opción sin colimador

El selector **Colimador → Sin colimador** calcula una distribución de fluencia
amplia desde todo el atlas, incluyendo actividad fuera del campo nominal. El
motor compartido se usa en vivo, imagen final, adquisición estática, barrido y
MAG3. Mantiene las cinéticas, el decaimiento y la selección de energía existentes.

Es una aproximación docente: integra `z / (2π r³)` sobre una fuente planar
atenuada, con profundidad efectiva de 10 cm y sensibilidad relativa supuesta de
30 antes de integrar el ángulo sólido. Estos parámetros no son una calibración
de cámara; no se modelan nuevas trayectorias de atenuación oblicua, tiempo muerto
ni apilamiento de pulsos. No debe interpretarse como una imagen anatómica
localizada. Véase el uso experimental de una cámara sin colimador como detector
de actividad [en esta publicación](https://pubmed.ncbi.nlm.nih.gov/10400152/).

Pruebas: `node tests/test_no_collimator.cjs` (campo amplio, fuentes fuera del
recorte, distancia, orientación, matriz, energía y reutilización del cálculo).

### Evento centinela simulado

En **Colisiones → Evento centinela en modo rápido**, un movimiento manual con
**Movimiento rápido** activado que alcance contacto geométrico de los detectores
con el paciente o la camilla cancela el examen. La proximidad al margen de
seguridad y el avance rápido de adquisición no disparan esta regla. Se usa el
recorrido barrido existente y se detiene el movimiento en el contacto, sin
simular lesiones ni establecer una clasificación clínica real.

Las adquisiciones estáticas, de cuerpo entero y MAG3 dejan de acumular cuentas;
se bloquean nuevos inicios, instantáneas y la imagen final prevista en todos los
estudios. Las adquisiciones incompletas se rotulan canceladas y no se envían como
resultados finalizados al procesamiento. El bloqueo permanece al cambiar de
estudio, cambiar el modo de colisiones y recargar la misma pestaña (sessionStorage).
Se puede retirar el detector/camilla. **Reiniciar examen** exige liberar el margen
de seguridad y esperar a que cualquier tarea instantánea termine de cancelarse;
descarta las sesiones canceladas, conservando las adquisiciones guardadas.

Motor: `scripts/exam_safety.js`; actualizar con `python scripts/embed_exam_safety.py`.
Pruebas: `node tests/test_exam_safety.cjs`, colisiones, adquisición estática y MAG3.
