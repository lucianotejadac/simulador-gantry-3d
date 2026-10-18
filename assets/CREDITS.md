# Créditos de los recursos 3D

## Elementos originales del simulador

Gantry simple y camilla: geometría procedural del simulador. Control genérico:
diseño HTML/CSS original, sin fotografía de un mando comercial.
© 2026 Luciano Tejada Castro. [MIT](../LICENSE).

## Paciente visible

[Man](https://poly.pizza/m/HMnuH5geEG), **Quaternius** —
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
Archivo activo: `runtime/patient.dad8fa3ca2bc7760.glb`.
Adaptaciones: escala de 1,75 m, orientación sobre la camilla y articulación de
brazos al costado/elevados. Es una figura de posicionamiento, no anatomía ICRP.

## Sala y mobiliario

Arquitectura exportada de SymbiaRoom. Sala: 4,255 × 7,189 × 2,340 m;
abertura lateral: 1,680 m. Dimensiones del usuario. Acabados y posiciones
de muebles son aproximaciones visuales. La alineación longitudinal con el
gantry web es ilustrativa, conserva escala 1:1 y no verifica holguras reales.

Adaptación web: texturas muestreadas a colores por vértice, normales
cuantizadas, mallas agrupadas, sin físicas, luces adicionales ni techo.
Puerta frontal y vidrio simplificados a paneles. No incluye fotografías.

## Modelos reutilizados

- [Medical Cabinet](https://sketchfab.com/3d-models/medical-cabinet-f47142facdf14e1e92f91f916940cfb9), conndavis20 — [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- [Hospital medical Trolley](https://sketchfab.com/3d-models/hospital-medical-trolley-cf02b01766534fe28a57e5e23e8c3f06), Chenchanchong — [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- [IV Pole](https://sketchfab.com/3d-models/iv-pole-76521e2f71704b1986cf5ac54368b14f), Mouch — [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- [Clinical Hospital bin white](https://sketchfab.com/3d-models/8d3a49b665184ccd97cf69118186e046) y [Clinical waste Hospital bin yellow](https://sketchfab.com/3d-models/195d03993e2741fdbe4f0d218d2970a6), Keith_Pamment, derivados de [Hospital Bin](https://skfb.ly/XIsz), teeart — [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- [Shower armchair](https://www.sweethome3d.com/wp-content/themes/sweet-home-3d/theme/assets/models/scopia/shower-armchair.zip), Scopia Visual Interfaces Systems, s.l. y Space Mushrooms — [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Asiento continuo adaptado en SymbiaRoom.
- [Clinical hand wash basin](https://3dassets.dev/assets/clinic-and-veterinary-practice-clinical-hand-wash-basi-8eaa7002), 3D Assets (fuente declarada asistida por IA) — [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

Los modelos ya estaban centrados, apoyados en suelo y escalados visualmente
en SymbiaRoom; no son medidas de fabricante. Se excluyen Hospital Kit_2
(CC BY-NC) y el carro Siemens (redistribución no verificada), además del
equipo, paciente y elementos documentales Candidate_Unverified.

`manifest.json` registra hashes de los modelos fuente, geometría y tamaño
comprimido. Generar desde los originales locales:

```powershell
python scripts/build_symbia_room.py --source /ruta/a/SymbiaRoom
node tests/test_symbia_room.cjs
```

## Alcance

Las licencias de terceros se conservan y no son reemplazadas por la MIT del
código del simulador. La versión actual no incluye el CAD Siemens 13041 ni la
fotografía del mando de Block Imaging. Los datos emisores ICRP y las proyecciones
se documentan por separado en el diálogo Derechos de autor y `icrp145/`.
