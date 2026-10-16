# Procesamiento óseo integrado

El visor proviene de [simulador-cintigrafia-osea](https://github.com/lucianotejadac/simulador-cintigrafia-osea),
commit `582e3c44a42cf4d73912994e7b596b071751bde9`, archivo `demo/index.html`.
`viewer-source.html` es una copia fijada del original. Su licencia MIT está en
`LICENSE`; conserva también el aviso MIT de dicom-parser incrustado. No se
copian los casos DICOM públicos ni los tutoriales de estudiantes.

`python scripts/embed_processing.py` genera `processing/index.html` a partir
del original y del receptor `scripts/processing_receiver.js`. Se desactiva el
inicio automático del tutorial y se oculta la carga del caso demo externo.
El tutorial general y la apertura manual de archivos siguen disponibles.
El visor principal del otro repositorio permanece intacto.

La pestaña carga el iframe solamente al abrirse. El controlador acepta
adquisiciones óseas finalizadas, actuales o guardadas en IndexedDB, con señal
en ambos detectores. Al abrir procesamiento se incorporan automáticamente al
menú lateral, agrupadas por tipo, con los nombres de ambos detectores. También
se conservan en memoria las adquisiciones terminadas durante la sesión aunque
se inicie otra: para conservarlas tras recargar sigue siendo necesario guardarlas.
No se requiere seleccionar ni enviar manualmente; la selección manual queda
disponible para componer páginas. Se bloquea la entrada durante una adquisición activa.
El renderizado 3D y la persistencia en vivo descansan durante el procesamiento;
la posición y el proyecto se conservan al alternar pestañas. La evolución libre
del radiofármaco queda detenida hasta que el usuario la reproduzca de nuevo.

Se generan dos archivos DICOM en memoria por adquisición, uno por detector,
para conservar duraciones distintas. Se copian todas las cuentas sin filtros,
recortes adicionales, normalización ni conversión a imagen de pantalla. El
receptor verifica dimensiones y totales antes de importar. Los mensajes exigen
el mismo origen, la ventana esperada y una versión de protocolo conocida.
No se envían cuentas ni proyectos a un servidor.

Las imágenes del fantoma se agrupan como estudio docente por fecha UTC de
adquisición. Sus identificadores son estables al reenviar una misma adquisición,
incluida su copia guardada; las páginas ya compuestas no se duplican ni resetean.
Cada par nuevo recibe una página con ambos detectores, editable con ventana,
nivel, inversión, zoom, posición y texto. Guardar proyecto incluye los archivos
DICOM y la composición en `.dicomproject`; Exportar PNG guarda la página visible.
La caché de adquisiciones no guarda automáticamente la composición del visor.

## Datos y límites

Las adquisiciones nuevas guardan configuración y orientación al inicio y al
final. Las estáticas que cambiaron geometría se rotulan «geometría variable»;
las adquisiciones antiguas sin este registro dicen «orientación no registrada».
No se inventa una orientación a partir de la posición actual del equipo.
Las adquisiciones detenidas por el operador se identifican en los comentarios.
Los barridos mantienen su matriz rectangular y su recorrido real, incluido el
campo que quedó sin explorar si se detuvieron antes. No se reconstruye SPECT.

Actividad MDP, tiempo inyección-examen, colimador, energía, ventana, distancias,
geometría y detalles del barrido se conservan en el elemento privado
`(0011,1010)` con creador `GANTRY_SIMULATION`. Se incluyen los atributos públicos
disponibles para actividad, ventana, zoom y duración. El espaciado físico queda
vacío: los registros anteriores no garantizan esa calibración. Cada imagen
declara su origen simulado. No se declara validación clínica ni compatibilidad
universal con PACS.

El módulo NM admite píxeles de 8 o 16 bits, según
[DICOM C.8.4.7](https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.8.4.7.html).
Se emplean 16 bits mientras todos los píxeles sean ≤65.535. Si alguno excede
ese valor, el intercambio conserva 32 bits con SOP privado docente
`2.25.216145721041023267506752105223475669900`, explícitamente distinto de NM
estándar. El visor y el proyecto admiten ambos; nunca se recortan cuentas para
forzar el formato NM. La dosis se expresa en MBq en el módulo NM, conforme a
[DICOM C.8.4.10](https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.8.4.10.html).

Pruebas: `node tests/test_processing.cjs` (requiere pydicom para la lectura
independiente). Verifica cada píxel, dimensiones 128/256/rectangular, overflow,
duraciones, actividad, rechazo de datos incompletos/corruptos, etiquetas de
orientación, origen de mensajes, deduplicación y carga diferida.
