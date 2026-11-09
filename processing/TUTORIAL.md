# Tutorial de adquisición · Matías Ignacio FANTOMA COMISION

Se abre con **Tutorial de adquisición** en la barra principal o desde
**Examen → Herramientas → Tutorial de adquisición · Matías Ignacio FANTOMA COMISION**.

Recorre identificación y registro (nombre, RUT, examen), preparación del
radiofármaco y posición, parámetros de cámara, dinámica de flujo, estáticas
de pool anterior/posterior y lateral, cuerpo completo tardío, estáticas
tardías dirigidas anterior/posterior y lateral, revisión, página
flexible y exportación PNG. Son once pasos; el cuerpo completo forma parte
de la fase tardía, no constituye una cuarta fase.

La guía no inicia adquisiciones, inyecta, registra datos ni añade imágenes.
Los botones **Señalar** navegan a los controles y oscurecen el resto de la
pantalla. Una flecha con estela animada viaja desde la guía hacia el control
mientras el panel se minimiza. El foco sigue los controles del iframe al
desplazarse; desaparece al interactuar o a los ocho segundos. Con movimiento
reducido, la flecha permanece fija. Cerrar o minimizar conserva el paso. El paso
de lectura se conserva en `sessionStorage`, pero las comprobaciones se
vuelven a calcular sobre el espacio de trabajo actual. No se restaura un
examen borrado o una sesión anterior al recargar.

En el paso 1 se revisa la pulsera sin pedir que se anoten sus datos. En el
paso 2 se vuelve a pulsar la pulsera en la muñeca del paciente 3D mientras
se completa el formulario de la derecha. No hay botones de pulsera y el
registro permite seguir navegando por la escena. Los botones **▾** junto a la identificación
permiten corregir nombre, RUT y examen, tras confirmar la modificación.
Los cambios alcanzan las adquisiciones pendientes de ese paciente; las
imágenes ya adquiridas conservan su identificación original.

El simulador abre **Examen** por defecto; mantiene Gantry y Derechos de autor,
sin el antiguo botón Adquisición de la barra principal. La pestaña Adquisición
dentro de Examen sigue disponible.

Todas las órdenes se titulan deliberadamente **cintigrama oseo**. El alumno
decide según los antecedentes si añade «trifásico» al nombre que registra;
no se añade automáticamente. El tutorial explica la decisión para Matías Ignacio FANTOMA COMISION.
También enseña giro con arrastre izquierdo, desplazamiento con el derecho,
zoom con la rueda, gestos táctiles, vistas predefinidas y Vista sala. Estos
gestos modifican la cámara; el mando mueve la camilla y los detectores.

El paso 3 contempla la orientación inicial aleatoria ya existente (cabeza
adentro o afuera). Antes de inyectar, el alumno observa la escena y usa
**Cambiar posición de paciente** si necesita dejar la cabeza afuera. Se hace
con la camilla retirada y espacio libre; si ya está correctamente orientado,
se conserva la posición. El botón invierte cabeza/pies, no corrige la declaración
de cámara: el alumno declara **Supino y Cabeza afuera** por separado.
Se comprueban ambas posiciones. Leer o reabrir la guía no sortea otra posición
ni mueve al paciente.

Así queda orientado desde el inicio para el barrido posterior, aunque la
dinámica sólo registra pies y tobillos. Primero se centra esa región con la
camilla. Para el cuerpo completo tardío se conserva la orientación del paciente
y se vuelve a centrar el cráneo (Z 200 cm) antes de iniciar el recorrido.

## Comprobaciones

- Identidad contrastada con la pulsera de Matías Ignacio FANTOMA COMISION y examen trifásico registrado.
- Consulta de pulsera/orden, edición manual de cámara y revisión visual del
  encuadre (la anatomía completa requiere confirmación del alumno).
- Imágenes completas con cuentas en ambos detectores, del caso correcto.
- Flujo: inicio registrado de 0 a 10 s y al menos 30 frames por detector.
  Los 10 s son una tolerancia del ejercicio, no una recomendación clínica.
- Pool: inicio entre 1 y menos de 10 min. Cuerpo completo y estática tardía:
  inicio entre 2 y 4 h. El barrido debe completar el recorrido de cráneo a pies
  (Z inicial ≥ 200 cm, final ≤ 16 cm y recorrido ≥ 175 cm en este modelo).
  El paciente debe estar físicamente en supino y con la cabeza afuera (pies
  adentro); la posición declarada debe coincidir. El motor verifica ambos
  datos antes de iniciar, incluso con adquisición instantánea, y registra la
  posición física. Cambiar sólo la declaración no reposiciona al paciente.
  Se utilizan metadatos de adquisición, no los rótulos escritos por el alumno.
- Pool y tardías dirigidas requieren cada uno dos adquisiciones: anterior/posterior
  y lateral. Se verifican los ángulos físicos de ambos detectores registrados al
  inicio y al final: 0°/180° y 90°/270°, respectivamente, con tolerancia de 5°.
  Escribir «lateral» en el nombre o cambiar la vista de la cámara 3D no cuenta
  como una proyección lateral. El alumno gira los detectores con el mando y
  revisa la distancia y el encuadre sin contacto.
- Presencia de ambos detectores de las seis adquisiciones en la composición,
  cobertura completa de los frames dinámicos y cuadros sin solapamientos.
- Exportación PNG de cada página del caso. Cambiar su contenido o el
  encabezado invalida la marca de exportación hasta volver a exportarla.
  El navegador debe completar la descarga; el alumno revisa los PNG.

El ejemplo usa 60 × 1 s para flujo, pool anterior/posterior a 3 min durante
180 s y, a continuación, otro pool lateral durante 180 s. Se mantiene el reloj:
las laterales comienzan aproximadamente a 6 min, sin reiniciar la inyección.
El cuerpo completo se adquiere
a 180 min con matriz 256 × 1024, zoom 1×, 10 cm/min y contornos automáticos,
y después se adquieren dos estáticas tardías dirigidas, anterior/posterior y
lateral, con objetivo de 200.000 cuentas por detector cada una. El barrido
empieza en la posición actual: hay que volver al cráneo antes de iniciarlo.
Se conserva la misma inyección y, para las estáticas dirigidas, el tiempo ya
transcurrido tras el barrido, sin retroceder el reloj. Son parámetros de práctica en un paciente
ficticio. La inclusión del cuerpo completo responde al protocolo de este
tutorial; no se presenta como una obligación universal para toda trifásica.
La distribución del paciente es un modelo docente.

La entrega propuesta tiene cinco páginas: flujo D1, flujo D2, cuatro imágenes
del pool (anterior/posterior y laterales), cuatro tardías dirigidas (en el mismo
orden que el pool) y, por último, cuerpo completo tardío D1/D2.

El paso 11 termina con **Si el estudio no hubiera sido trifásico**, una comparación
visible con el procedimiento sólo tardío: identificación y primera adquisición de
cuerpo entero, registro de dosis y tiempo con «99mTc-MDP · Óseo», posicionamiento
en supino/cabeza afuera, barrido anterior/posterior y vistas complementarias según
la indicación o los hallazgos. Explica qué imágenes pasarían a Página flexible y
que no se adquirirían ni presentarían flujo o pool. Se apoya en la guía SNMMI y
reutiliza los parámetros docentes del paso 7; no convierte las vistas adicionales
del ejercicio trifásico en requisitos universales. Es una explicación final, no
una adquisición adicional ni un requisito nuevo para completar los once pasos.

Fundamento de adquisición:
[SNMMI, Bone Scintigraphy 4.0](https://snmmi.org/common/Uploaded%20files/Web/Clinical%20Practice/Procedure%20Standards/2023/Bone%20Scintigraphy_UPDATED2024.pdf).

## Mantenimiento

Fuentes: `scripts/acquisition_tutorial.js`, `acquisition_tutorial_spotlight.js`, `acquisition_tutorial.css`,
`acquisition_tutorial_model.js` y `processing_tutorial_bridge.js`.
El puente del visor expone sólo estado de lectura y no copia matrices de
píxeles al tutorial. Los chequeos puros están separados del panel.

Empaquetar:

```powershell
python scripts/embed_patient_cases.py
python scripts/embed_processing.py
python scripts/embed_acquisition_tutorial.py
python scripts/optimize_loading.py
```

Comprobar:

```powershell
node tests/test_acquisition_tutorial.cjs
python -X utf8 tests/test_acquisition_tutorial_browser.py
python -X utf8 tests/test_tutorial_spotlight_registration_browser.py
```

La prueba de navegador usa un contexto aislado, registra el paciente,
adquiere las tres fases (incluidos laterales de pool y tardía y cuerpo completo
tardío) y compone/exporta cinco páginas usando el motor y
el selector de imágenes reales. También comprueba que leer la guía no
modifica la cámara ni inicia adquisiciones.
