# Simulador Gantry 3D

Simulador autocontenido de posicionamiento del gantry y adquisición
gammagráfica. Todo el funcionamiento, los atlas y los recursos necesarios se
encuentran incorporados en un solo archivo: `index.html`.

## Ejecución

Descargue `index.html` y ábralo en un navegador moderno. No requiere conexión
a Internet.

## Cintigrama óseo

En **ESTUDIO**, seleccione **Cintigrama óseo**. Las proyecciones del ZIP
aportado se muestran en ambos detectores según la rotación del gantry, con
180° de separación. El desplazamiento de la camilla recorre las regiones del
cuerpo y siguen disponibles zoom, matriz, colimador y ventana energética.
Los ajustes existentes se conservan al cambiar de estudio. Para visualizar
el modo óseo con su perfil de referencia: LEHR, 140 keV, ancho 20% y zoom 1×.
Introduzca la camilla en el campo de los detectores para ver al paciente.

El atlas contiene 16 direcciones únicas cada 22,5°, con interpolación entre
vistas y cierre circular de 337,5° a 0°. La imagen adicional de 360° repite
la dirección de 0°; se conserva en el ZIP original junto con las otras 16.
El atlas elimina marco y rótulos, convierte el fondo blanco a negro y mantiene
las proporciones de cada imagen. Las imágenes originales no se modifican.

El ZIP fuente está en `assets/cintigrama_0_a_360_cada_22_5_grados.zip`.
Para regenerar el atlas incrustado, instale Pillow y ejecute
`python scripts/build_bone_atlas.py`. El usuario del simulador sólo necesita
`index.html`, que sigue funcionando sin conexión.

## Derechos de autor

Copyright © 2026 Luciano Tejada Castro. Todos los derechos reservados.

La publicación del repositorio no concede una licencia sobre el simulador.
Consulte [LICENSE](LICENSE), el aviso visible «Derechos de autor» dentro de
`index.html` y [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Contacto: lucianotejada@uchile.cl

## Advertencia

Simulación exclusivamente educativa. No es un dispositivo médico ni debe
utilizarse para tomar decisiones clínicas o asistenciales.
