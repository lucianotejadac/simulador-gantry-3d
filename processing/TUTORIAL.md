# Tutorial de adquisición · Matías Ignacio Fuentes Araya

Se abre con **Tutorial de adquisición** en la barra principal o desde
**Examen → Herramientas → Tutorial de adquisición · Matías Ignacio Fuentes Araya**.

Recorre identificación y registro (nombre, RUT, examen), preparación del
radiofármaco y posición, parámetros de cámara, dinámica de flujo, estática
de pool, estática tardía, revisión, página flexible y exportación PNG.

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
no se añade automáticamente. El tutorial explica la decisión para Matías Ignacio Fuentes Araya.
También enseña giro con arrastre izquierdo, desplazamiento con el derecho,
zoom con la rueda, gestos táctiles, vistas predefinidas y Vista sala. Estos
gestos modifican la cámara; el mando mueve la camilla y los detectores.

## Comprobaciones

- Identidad contrastada con el Matías Ignacio Fuentes Araya y examen trifásico registrado.
- Consulta de pulsera/orden, edición manual de cámara y revisión visual del
  encuadre (la anatomía completa requiere confirmación del alumno).
- Imágenes completas con cuentas en ambos detectores, del caso correcto.
- Flujo: inicio registrado de 0 a 10 s y al menos 30 frames por detector.
  Los 10 s son una tolerancia del ejercicio, no una recomendación clínica.
- Pool: inicio entre 1 y menos de 10 min. Tardía: inicio entre 2 y 4 h.
  Se utilizan metadatos de adquisición, no los rótulos escritos por el alumno.
- Presencia de ambos detectores de las tres fases en la composición,
  cobertura completa de los frames dinámicos y cuadros sin solapamientos.
- Exportación PNG de cada página del caso. Cambiar su contenido o el
  encabezado invalida la marca de exportación hasta volver a exportarla.
  El navegador debe completar la descarga; el alumno revisa los PNG.

El ejemplo usa 60 × 1 s para flujo, pool a 3 min durante 180 s y tardías
a 180 min con objetivo de 200.000 cuentas. Son parámetros de práctica en
un paciente ficticio. La distribución del caso es un modelo docente.

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
adquiere las tres fases y compone/exporta tres páginas usando el motor y
el selector de imágenes reales. También comprueba que leer la guía no
modifica la cámara ni inicia adquisiciones.
