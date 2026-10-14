# Equipo Symbia: adaptación visual para el simulador

Carcasa CT, columnas, monitor, soportes y dos cabezales procedentes del
modelo de SymbiaRoom, derivado del [modelo de planificación Siemens 13041](https://siemenshealthineers13.autodesk360.com/g/shares/SH56a43QTfd62c1cd968944499cde649bc34).
La autoría de la geometría original corresponde a Siemens Healthineers.
No se atribuye una licencia abierta al modelo de fabricante ni se presenta
esta adaptación educativa como producto avalado por Siemens.

Se conserva la escala en metros y la forma de cada pieza. La transformación
longitudinal centra el campo SPECT en X=0; el centro del anillo se registra
de 1,0416 m a los 1,03 m del simulador. Los orígenes de los cabezales se sitúan
en la cara interior de sus colimadores. Carcasa y soportes de cada cabezal
heredan el mismo movimiento radial y angular que el detector del simulador.

Se conserva la camilla funcional existente, con su tablero telescópico, sus
guías y el paciente. No se importa la camilla CAD ni sus asas: sustituirlas
exigiría adaptar y validar el apoyo del paciente durante todo el recorrido.
El soporte posterior CAD forma parte de la carcasa fija; no constituye una
simulación nueva del mecanismo de elevación. La adquisición y el campo de
visión conservan el modelo del simulador; las colisiones se actualizan como
se describe abajo.
La unión es visual; no verifica las holguras ni la autocollision mecánica del
equipo Siemens y no modifica sus límites clínicos ni representa un control real.

Actualización de colisiones: las cajas de cada componente del cabezal se
extraen de sus vértices originales y consultan la malla del muñeco en su
postura actual. Son envolventes conservadoras: pueden detectar contacto antes
que las superficies curvas reales. Sustituyen el perfil corporal global del
simulador; no constituyen una validación mecánica del modelo del fabricante.

Optimización: tres lotes de geometría, colores por vértice, normales de 8 bits,
un material compartido, sin texturas ni nuevas sombras dinámicas. El binario
gzip se descarga por separado, con nombre por hash, y se reutiliza al alternar
entre modelos. El equipo simple permanece visible mientras carga y ante fallos.
No se exportan fotografías, pacientes, documentos ni objetos de la sala.

`manifest.json` registra el hash fuente, las piezas incluidas/excluidas, sus
dimensiones y el archivo publicado. Regeneración:

```powershell
python scripts/build_symbia_equipment.py --source /ruta/a/SymbiaRoom
node tests/test_symbia_equipment.cjs
```
