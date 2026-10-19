# Dispersión espacial del MDP

`mdp-diffuse-v1-visual-reference` añade una componente difusa a las proyecciones
óseas en vivo, estáticas, de cuerpo entero y de imagen final. Se aplica antes
del muestreo estadístico y se conserva la suma de cada base cinética. No añade
cuentas, cambia la actividad inyectada ni sustituye la PSF del detector.

La comparación local con una adquisición Siemens NM (software Symbia Intevo 16
VB21B) usó píxel 2,3976 mm, matriz de 256 columnas por 1024 filas, 2.357.796 y
2.192.271 cuentas, y escala lineal común. El modelo previo conservaba mayor
contraste hueso/fondo. La anatomía, tiempo posinyección y distancia real no están
igualados: esta referencia permite ajustar apariencia, no medir una PSF ni
certificar la calibración de Siemens. No se incluyen píxeles ni cabeceras clínicas
en el repositorio.

## Modelo y límites

- A partir de la fracción espectral `s` existente se usa
  `min(0.55, 3.5*s/(1+2.5*s))` como fracción espacial difusa.
- Una ventana de Tc-99m centrada de 15% produce aproximadamente 22%.
- El núcleo difuso adicional tiene sigma de 22 mm; la PSF primaria conserva
  su dependencia física del colimador, distancia y profundidad del fantoma.
- El multiplicador 3,5 y sigma 22 mm son parámetros fenomenológicos de apariencia;
  no son valores medidos en el DICOM ni una estimación individual del paciente.
- Se redistribuyen los eventos ya aceptados dentro del campo seleccionado.
  La cola truncada se renormaliza para conservar cuentas. No modela transporte
  de fotones desde fuera del campo. La posición del recorte puede alterar la cola.
- Sin colimador se conserva el modelo previo de fluencia, sin esta capa.
- Los demás radiofármacos y sus cinéticas no se modifican.

La presencia de dispersión incluso dentro de una ventana centrada y su dependencia
del espesor están respaldadas por el estudio experimental de Kojima et al.,
[Experimental analysis of scattered photons in Tc-99m imaging with a gamma camera](https://pubmed.ncbi.nlm.nih.gov/1797068/).
Ese trabajo respalda el mecanismo, no los parámetros de apariencia elegidos aquí.

## Rendimiento y verificación

La cola ancha se calcula en una malla de hasta 96 × 384 celdas y se interpola.
No se aproxima así la PSF primaria. Las bases espaciales se reutilizan cuando
sólo cambia el tiempo posinyección. El perfil queda registrado en los metadatos
MDP de nuevas adquisiciones; las imágenes guardadas conservan sus píxeles.

`node tests/test_bone_scatter.cjs` comprueba conservación, bordes, dimensiones
no cuadradas, anchura en milímetros, matrices 64/128/256/512, dependencia de la
ventana, bypass sin colimador y caché cinética. Las pruebas de respuesta física,
profundidad y adquisición completan la verificación.
