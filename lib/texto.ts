// Utilidades de texto

// Palabras que en los nombres van en minúscula ("María de los Ángeles")
const CONECTORES = new Set(["de", "del", "la", "las", "los", "y", "e", "da", "van", "von"]);

/**
 * "NATALIA GUTIERREZ DE LA ROSA" -> "Natalia Gutierrez de la Rosa"
 * Respeta guiones y apóstrofes ("JEAN-PAUL" -> "Jean-Paul", "D'ALESSIO" -> "D'Alessio").
 */
export function nombrePropio(texto: string): string {
  return texto
    .trim()
    .toLocaleLowerCase("es")
    .split(/\s+/)
    .map((palabra, i) =>
      i > 0 && CONECTORES.has(palabra)
        ? palabra
        : palabra.replace(/(^|[-'])(\p{L})/gu, (_, sep: string, letra: string) => sep + letra.toLocaleUpperCase("es"))
    )
    .join(" ");
}
