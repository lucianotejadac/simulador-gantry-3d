# Simulador Gantry 3D

Simulador autocontenido de posicionamiento del gantry y adquisición
gammagráfica. Todo el funcionamiento, los atlas y los recursos necesarios se
encuentran incorporados en un solo archivo: `index.html`.

## Ejecución

Descargue `index.html` y ábralo en un navegador moderno. No requiere conexión
a Internet.

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

## MAG3 basal: pantalla dentro del gantry

Pulsa **inyectar MAG3** para iniciar un basal de 20 minutos. Se muestra una pantalla
dentro del simulador con la suma acumulada y los cuadros dinámicos. El mando del
gantry sigue accesible. El cabezal más próximo a posterior
al inyectar queda vinculado a esa adquisición (D2 en decúbito supino a 0°).
La suma incluye todo el campo visible, sin ROI renal. Mover camilla o gantry,
cambiar brazos, zoom o ajustes de detección modifica las cuentas siguientes;
las anteriores permanecen en las coordenadas del detector, sin corrección de
movimiento. La matriz queda fijada al inyectar.

La pantalla permite pausar, acelerar el tiempo, finalizar, revisar cuadros y
guardar la suma PNG o las cuentas y geometrías en JSON. **Volver a vista 3D**
oculta la pantalla y mantiene la adquisición activa. **Ver adquisición MAG3**
la vuelve a mostrar conservando las cuentas, incluso después de finalizar.
Pulsar **inyectar MAG3** durante un basal activo muestra la misma adquisición;
después de finalizar inicia una nueva.
Se guardan 30 cuadros de 2 s, 24 de 10 s y 30 de 30 s. Sólo se incluye el basal.
Los paneles del simulador muestran señal esperada; la pantalla acumula eventos
con estadística de Poisson. La ganancia de visualización no altera las cuentas.

Las bases emisoras derivadas de ICRP 145 contienen diez componentes anatómicos,
36 ángulos cada 10°, ambas posturas de brazos y píxeles de 6 mm. La cinética es
sintética y conserva la del proyecto local `../icrp145-mag3-cuerpo-entero`.
La referencia basal es el caso de Craig Hacking en
[Radiopaedia](https://radiopaedia.org/cases/normal-captopril-renal-mag3-nuclear-study),
sin incorporar imágenes clínicas ni representar una calibración absoluta.

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
