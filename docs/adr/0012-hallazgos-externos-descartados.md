# Hallazgos de revisiones externas que no se arreglan

Otras IA los marcaron y se comprobó que no aplican:

- **Inyección de fórmulas en Excel:** todo lo que se exporta es `.xlsx` con celdas de texto.
- **XSS en el historial:** ya se muestra como texto.
- **Limpiar `localStorage` al salir:** rompería el historial, que es por usuario.
